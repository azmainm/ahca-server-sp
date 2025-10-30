const WebSocket = require('ws');
const EventEmitter = require('events');
const { performance } = require('perf_hooks');
const { create, ConverterType } = require('@alexanderolsen/libsamplerate-js');

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

  async start(callSid, twilioWs, streamSid, businessId, fromPhone = null, toPhone = null, baseUrl = null) {
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

    // This is a mocked WebSocket-like object that pipes messages to the bridge's onAgentMessage
    const mockWs = {
      readyState: 1, // Pretend it's always open
      send: async (msg) => {
        try {
          await this.onAgentMessage(callSid, streamSid, twilioWs, JSON.parse(msg));
        } catch (e) {
          console.error('❌ [TwilioBridge] Error parsing agent message:', e);
        }
      },
      on: () => {},
      close: () => {}
    };

    await this.realtimeWSService.createSession(
      mockWs,
      `twilio-${callSid}`,
      { twilioCallSid: callSid }
    );

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
      baseUrl: baseUrl || null, // Store base URL for emergency transfers
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
  async handleTwilioMedia(callSid, payloadBase64) {
    const entry = this.callSidToSession.get(callSid);
    if (!entry || !payloadBase64) return;

    try {
      // 1) base64 μ-law bytes -> Buffer
      const muLawBuf = Buffer.from(payloadBase64, 'base64');

      // 2) μ-law decode -> Int16Array (PCM16 8k)
      const pcm8k = this.decodeMuLawToPCM16(muLawBuf);

      // 3) Upsample 8k -> 24k using high-quality resampler
      const pcm24k = await this.resamplePcm(pcm8k, 8000, 24000);

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

  /**
   * Resample PCM audio data using libsamplerate.js
   * @param {Int16Array} pcmData - Input PCM data
   * @param {number} inputRate - Input sample rate
   * @param {number} outputRate - Output sample rate
   * @returns {Promise<Int16Array>} Resampled PCM data
   */
  async resamplePcm(pcmData, inputRate, outputRate) {
    let src = null;
    try {
      // libsamplerate.js expects Float32Array data between -1.0 and 1.0
      const float32Data = new Float32Array(pcmData.length);
      for (let i = 0; i < pcmData.length; i++) {
        float32Data[i] = pcmData[i] / 32768;
      }

      src = await create(1, inputRate, outputRate, {
        converterType: ConverterType.SRC_SINC_MEDIUM_QUALITY  // Reduced from BEST for lower memory usage
      });
      
      const resampledData = src.simple(float32Data);

      // Convert back to Int16Array
      const int16Data = new Int16Array(resampledData.length);
      for (let i = 0; i < resampledData.length; i++) {
        int16Data[i] = Math.max(-32768, Math.min(32767, Math.floor(resampledData[i] * 32768)));
      }
      
      return int16Data;
    } catch (e) {
      console.error('❌ [TwilioBridge] Resampling error:', e.message);
      // Fallback to original data to avoid crashing the stream
      return pcmData;
    } finally {
      if (src) {
        src.destroy();
      }
    }
  }

  // =========================
  // Outbound: OpenAI -> Twilio
  // =========================
  async onAgentMessage(callSid, streamSid, twilioWs, msg) {
    if (!msg) return;

    switch (msg.type) {
      case 'audio':
        if (msg.delta) {
          try {
            const pcm24k = this.base64ToInt16(msg.delta);

            // Downsample using high-quality resampler
            const pcm8k = await this.resamplePcm(pcm24k, 24000, 8000);

            // Encode
            const muLaw = this.encodePCM16ToMuLaw(pcm8k);

            // Buffer and send
            const entry = this.callSidToSession.get(callSid);
            if (!entry) return;

            // 4) prepend any remainder and chunk into 160-byte frames (20ms @ 8kHz)
            const combined = Buffer.concat([entry.outMuLawRemainder, muLaw]);
            const FRAME_SIZE = 160; // bytes
            const totalFrames = Math.floor(combined.length / FRAME_SIZE);
            const remainderBytes = combined.length % FRAME_SIZE;

            if (totalFrames > 0) {
              // Limit buffer size to prevent unbounded memory growth
              const MAX_BUFFER_SIZE = 100; // ~2 seconds of audio at 20ms per chunk
              
              for (let i = 0; i < totalFrames; i++) {
                const frame = combined.subarray(i * FRAME_SIZE, (i + 1) * FRAME_SIZE);
                const payload = frame.toString('base64');
                const out = {
                  event: 'media',
                  streamSid: streamSid,
                  media: { payload }
                };
                
                // Add to buffer with size limit
                if (entry.outputBuffer.length < MAX_BUFFER_SIZE) {
                  entry.outputBuffer.push(out);
                } else {
                  // Drop oldest chunk if buffer is full (prevents memory leak)
                  entry.outputBuffer.shift();
                  entry.outputBuffer.push(out);
                  console.warn(`⚠️ [TwilioBridge] Output buffer full (${MAX_BUFFER_SIZE}), dropping oldest chunk`);
                }
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
        break;
      default:
        // Handle other message types if necessary
        break;
    }
  }

  /**
   * Flushes the outbound audio buffer to Twilio at a consistent pace
   * @param {string} callSid - The call SID
   */
  async flushOutputBuffer(callSid) {
    const entry = this.callSidToSession.get(callSid);
    if (!entry || !entry.twilioWs || entry.twilioWs.readyState !== 1) {
      if (entry) entry.isFlushing = false;
      return;
    }

    entry.isFlushing = true;
    const flushInterval = 100; // ms - send audio in larger, less frequent chunks

    while (this.callSidToSession.has(callSid)) {
      const startTime = performance.now();
      const chunksToSend = Math.ceil(flushInterval / 20); // 20ms per chunk

      if (entry.outputBuffer.length > 0) {
        const batch = entry.outputBuffer.splice(0, chunksToSend);
        for (const out of batch) {
          if (entry.twilioWs.readyState === 1) {
            entry.twilioWs.send(JSON.stringify(out));
          }
        }
      }

      const endTime = performance.now();
      const elapsedTime = endTime - startTime;
      const delay = Math.max(0, flushInterval - elapsedTime);

      await new Promise(resolve => setTimeout(resolve, delay));
    }

    entry.isFlushing = false;
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

  /**
   * Upsample 8kHz PCM to 24kHz by duplicating samples
   * @param {Int16Array} pcm8k - 8kHz PCM data
   * @returns {Int16Array} 24kHz PCM data
   * @deprecated Replaced by resamplePcm with libsamplerate.js
   */
  upsample8kTo24k(pcm8k) {
    const pcm24k = new Int16Array(pcm8k.length * 3);
    for (let i = 0, j = 0; i < pcm8k.length; i++) {
      const v = pcm8k[i];
      pcm24k[j++] = v;
      pcm24k[j++] = v;
      pcm24k[j++] = v;
    }
    return pcm24k;
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

  /**
   * Encodes Int16 PCM audio data into a base64 string.
   * This is used to prepare audio for transmission over WebSocket.
   * @param {Int16Array} pcm16Array - The PCM data to encode.
   * @returns {string} The base64-encoded audio data.
   */
  int16ToBase64(pcm16Array) {
    const pcm16Bytes = new Uint8Array(pcm16Array.buffer);
    return Buffer.from(pcm16Bytes).toString('base64');
  }

  base64ToInt16(b64) {
    const buf = Buffer.from(b64, 'base64');
    return new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
  }

  /**
   * Handle DTMF input for emergency detection
   * @param {string} callSid - Twilio Call SID
   * @param {string} digit - DTMF digit pressed
   * @param {string} businessId - Business ID (optional, for validation)
   * @param {string} baseUrl - Base URL for redirect (optional)
   */
  async handleEmergencyDTMF(callSid, digit, businessId = null, baseUrl = null) {
    const entry = this.callSidToSession.get(callSid);
    if (!entry) {
      console.error(`❌ [TwilioBridge] No session found for callSid: ${callSid}`);
      return;
    }

    const sessionId = entry.sessionId;
    console.log(`🚨 [TwilioBridge] Processing DTMF emergency for session: ${sessionId}, digit: ${digit}`);

    try {
      // Get conversation flow handler from realtime service
      const conversationFlowHandler = this.realtimeWSService.conversationFlowHandler;
      if (!conversationFlowHandler || !conversationFlowHandler.emergencyHandler) {
        console.error('❌ [TwilioBridge] ConversationFlowHandler or EmergencyHandler not available');
        return;
      }

      // Get business ID from tenant context (use provided one as fallback)
      const sessionBusinessId = this.realtimeWSService.tenantContextManager?.getBusinessId(sessionId) || businessId || 'unknown';
      console.log(`🏢 [TwilioBridge] Business ID for emergency: ${sessionBusinessId}`);

      // Get business config
      const businessConfig = this.realtimeWSService.businessConfigService?.getBusinessConfig(sessionBusinessId);
      if (!businessConfig) {
        console.error(`❌ [TwilioBridge] Business config not found for: ${sessionBusinessId}`);
        return;
      }

      // Check if emergency handling is enabled for this business
      if (!conversationFlowHandler.emergencyHandler.isEmergencyHandlingEnabled(businessConfig)) {
        console.log(`⚠️ [TwilioBridge] Emergency handling not enabled for business: ${sessionBusinessId} - ignoring DTMF`);
        return;
      }

      // Trigger emergency call transfer with baseUrl from session
      console.log('🚨 [TwilioBridge] Triggering emergency call transfer');
      const sessionBaseUrl = entry.baseUrl || baseUrl || null;
      console.log(`🔗 [TwilioBridge] Using baseUrl for emergency transfer: ${sessionBaseUrl}`);
      
      const emergencyResponse = conversationFlowHandler.emergencyHandler.handleEmergencyCall(
        sessionBusinessId,
        sessionId,
        `# (DTMF)`,
        callSid,
        businessConfig,
        sessionBaseUrl
      );

      console.log('✅ [TwilioBridge] Emergency handler triggered:', emergencyResponse.message);

      // Note: The call will be redirected by the Twilio REST API call in EmergencyCallHandler

    } catch (error) {
      console.error('❌ [TwilioBridge] Error handling emergency DTMF:', error);
    }
  }
}

module.exports = { TwilioBridgeService };