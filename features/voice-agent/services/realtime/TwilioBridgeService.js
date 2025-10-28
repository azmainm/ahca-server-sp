const WebSocket = require('ws');

/**
 * TwilioBridgeService (Simplified)
 * Purpose: lossless format bridge only.
 * - Inbound: Twilio μ-law 8k → decode → upsample x3 (zero-order) → PCM16 24k → OpenAI
 * - Outbound: OpenAI PCM16 24k → downsample ÷3 (decimate) → μ-law 8k → Twilio
 */
class TwilioBridgeService {
  constructor(realtimeWSService) {
    this.realtimeWSService = realtimeWSService;
    this.callSidToSession = new Map();
  }

  async start(callSid, twilioWs, streamSid, businessId, fromPhone = null, toPhone = null) {
    const sessionId = `twilio-${callSid}`;

    // Ensure the Realtime service sees the correct tenant for this exact session
    if (businessId && this.realtimeWSService && this.realtimeWSService.tenantContextManager) {
      try {
        this.realtimeWSService.tenantContextManager.setTenantContext(sessionId, businessId);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('⚠️ [TwilioBridge] Failed to set tenant context:', e.message);
      }
    }

    const stubClient = {
      readyState: WebSocket.OPEN,
      send: (jsonStr) => {
        try {
          const msg = JSON.parse(jsonStr);
          this.onAgentMessage(callSid, streamSid, twilioWs, msg);
        } catch (_) {}
      },
      on: () => {},
      close: () => {}
    };

    await this.realtimeWSService.createSession(stubClient, sessionId, { twilioCallSid: callSid });

    // Persist caller/callee phone numbers into session user info for later SMS
    try {
      if (fromPhone && this.realtimeWSService && this.realtimeWSService.stateManager) {
        this.realtimeWSService.stateManager.updateUserInfo(sessionId, { phone: fromPhone });
      }
      if (toPhone && this.realtimeWSService && this.realtimeWSService.stateManager) {
        this.realtimeWSService.stateManager.updateSession(sessionId, { businessLine: toPhone });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('⚠️ [TwilioBridge] Failed to persist phone metadata:', e.message);
    }
    this.callSidToSession.set(callSid, {
      sessionId,
      streamSid,
      twilioWs,
      outMuLawRemainder: Buffer.alloc(0),
      outputBuffer: [], // Buffer for outbound audio
      isFlushing: false, // Prevent multiple flush loops
    });
    return sessionId;
  }

  async stop(callSid) {
    const entry = this.callSidToSession.get(callSid);
    if (entry) {
      await this.realtimeWSService.closeSession(entry.sessionId);
      this.callSidToSession.delete(callSid);
    }
  }

  /**
   * Instantly clear any buffered outbound audio for a session.
   * This is the core of the barge-in mechanism.
   */
  clearOutputBuffer(callSid) {
    const entry = this.callSidToSession.get(callSid);
    if (entry) {
      // console.log(`[TwilioBridge] Clearing output buffer for ${callSid}. Was ${entry.outputBuffer.length} items.`);
      entry.outputBuffer = [];
    }
  }

  // =========================
  // Inbound: Twilio -> OpenAI
  // =========================
  handleTwilioMedia(callSid, payloadBase64) {
    const entry = this.callSidToSession.get(callSid);
    if (!entry || !payloadBase64) return;

    try {
      // 1) base64 μ-law bytes -> Buffer
      const muLawBuf = Buffer.from(payloadBase64, 'base64');

      // 2) μ-law decode -> Int16Array (PCM16 8k)
      const pcm8k = this.decodeMuLawToPCM16(muLawBuf);

      // 3) upsample 8k -> 24k (x3)
      const pcm24k = this.upsample8kTo24k(pcm8k);

      // 4) Int16 -> base64
      const pcm24kBase64 = this.int16ToBase64(pcm24k);

      // 5) Send to OpenAI Realtime as input_audio_buffer.append via service
      const sessionData = this.realtimeWSService.sessions.get(entry.sessionId);
      if (sessionData) {
        this.realtimeWSService.handleClientMessage(sessionData, {
          type: 'audio',
          data: pcm24kBase64
        });
        entry.bufferedSamples24k += pcm24k.length;
      }
    } catch (e) {
      // Swallow to keep real-time path resilient
      // eslint-disable-next-line no-console
      console.warn('⚠️ [TwilioBridge] Inbound media handling error:', e.message);
    }
  }

  // =========================
  // Outbound: OpenAI -> Twilio
  // =========================
  onAgentMessage(callSid, streamSid, twilioWs, msg) {
    if (!msg) return;
    if (msg.type === 'audio' && msg.delta) {
      const entry = this.callSidToSession.get(callSid);
      if (!entry) return;

      try {
        // 1) base64 PCM16 24k -> Int16Array
        const pcm24k = this.base64ToInt16(msg.delta);

        // 2) downsample 24k -> 8k
        const pcm8k = this.downsample24kTo8k(pcm24k);

        // 3) encode PCM16 -> μ-law bytes
        const muLawBuf = this.encodePCM16ToMuLaw(pcm8k);

        // 4) prepend any remainder and chunk into 160-byte frames (20ms @ 8kHz)
        const combined = Buffer.concat([entry.outMuLawRemainder, muLawBuf]);
        const FRAME_SIZE = 160; // bytes
        const totalFrames = Math.floor(combined.length / FRAME_SIZE);
        const remainderBytes = combined.length % FRAME_SIZE;

        if (totalFrames > 0) {
          for (let i = 0; i < totalFrames; i++) {
            const frame = combined.subarray(i * FRAME_SIZE, (i + 1) * FRAME_SIZE);
            const payload = frame.toString('base64');
            const out = {
              event: 'media',
              streamSid: streamSid,
              media: { payload }
            };
            // Add to buffer instead of sending directly
            entry.outputBuffer.push(out);
          }
        }

        // 5) store remainder
        entry.outMuLawRemainder = remainderBytes > 0 ? combined.subarray(combined.length - remainderBytes) : Buffer.alloc(0);
        
        // 6) Start the flushing mechanism if not already running
        if (!entry.isFlushing) {
          this.flushOutputBuffer(callSid);
        }

      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('⚠️ [TwilioBridge] Outbound audio handling error:', e.message);
      }
    }
  }

  /**
   * Periodically sends buffered audio to Twilio.
   * This creates a small, interruptible jitter buffer.
   */
  flushOutputBuffer(callSid) {
    const entry = this.callSidToSession.get(callSid);
    if (!entry || entry.isFlushing) return;

    entry.isFlushing = true;

    const intervalId = setInterval(() => {
      const session = this.callSidToSession.get(callSid);
      
      // Stop if session ended or WebSocket closed
      if (!session || session.twilioWs.readyState !== WebSocket.OPEN) {
        if (session) session.isFlushing = false;
        clearInterval(intervalId);
        return;
      }
      
      // Send one chunk from the buffer
      if (session.outputBuffer.length > 0) {
        const msg = session.outputBuffer.shift();
        try {
          session.twilioWs.send(JSON.stringify(msg));
        } catch(e) {
          console.warn('⚠️ [TwilioBridge] Error sending to Twilio WS:', e.message);
          session.isFlushing = false;
          clearInterval(intervalId);
        }
      }
      
    }, 20); // Send audio every 20ms, matching Twilio's frame rate
  }

  // =========================
  // Helpers: encoding/decoding/resampling
  // =========================
  decodeMuLawToPCM16(muLawBuf) {
    const out = new Int16Array(muLawBuf.length);
    for (let i = 0; i < muLawBuf.length; i++) {
      out[i] = this.muLawDecodeSample(muLawBuf[i]);
    }
    return out;
  }

  encodePCM16ToMuLaw(pcm) {
    const out = Buffer.alloc(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      out[i] = this.muLawEncodeSample(pcm[i]);
    }
    return out;
  }

  muLawDecodeSample(uVal) {
    // Correct G.711 µ-law decode (8-bit to 16-bit)
    let u = (~uVal) & 0xff;
    const sign = (u & 0x80) ? -1 : 1;
    const exponent = (u >> 4) & 0x07;
    const mantissa = u & 0x0f;
    // Recreate magnitude, then remove bias (132)
    let magnitude = ((mantissa | 0x10) << (exponent + 3)) - 132;
    let sample = sign * magnitude;
    if (sample > 32767) sample = 32767;
    if (sample < -32768) sample = -32768;
    return sample;
  }

  muLawEncodeSample(sample) {
    // Clamp
    let s = sample;
    if (s > 32767) s = 32767;
    if (s < -32768) s = -32768;

    const BIAS = 0x84; // 132
    let sign = (s < 0) ? 0x80 : 0x00;
    if (s < 0) s = -s;
    s += BIAS;
    if (s > 0x7fff) s = 0x7fff;

    let exponent = 7;
    for (let expMask = 0x4000; (s & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {}
    let mantissa = (s >> ((exponent === 0) ? 4 : (exponent + 3))) & 0x0f;
    let uVal = ~(sign | (exponent << 4) | mantissa) & 0xff;
    return uVal;
  }

  upsample8kTo24k(pcm8k) {
    const out = new Int16Array(pcm8k.length * 3);
    for (let i = 0, j = 0; i < pcm8k.length; i++) {
      const v = pcm8k[i];
      out[j++] = v;
      out[j++] = v;
      out[j++] = v;
    }
    return out;
  }

  downsample24kTo8k(pcm24k) {
    const len = Math.floor(pcm24k.length / 3);
    const out = new Int16Array(len);
    for (let i = 0, j = 0; j < len; j++) {
      // Average groups of 3 to reduce aliasing a bit
      const a = pcm24k[i++];
      const b = pcm24k[i++];
      const c = pcm24k[i++];
      let avg = Math.round((a + b + c) / 3);
      if (avg > 32767) avg = 32767;
      if (avg < -32768) avg = -32768;
      out[j] = avg;
    }
    return out;
  }

  int16ToBase64(int16) {
    const buf = Buffer.from(int16.buffer, int16.byteOffset, int16.byteLength);
    return buf.toString('base64');
  }

  base64ToInt16(b64) {
    const buf = Buffer.from(b64, 'base64');
    return new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
  }
}

module.exports = { TwilioBridgeService };