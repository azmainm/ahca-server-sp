const WebSocket = require('ws');

/**
 * TwilioBridgeService
 * Bridges Twilio Media Streams (PCMU 8k) with OpenAI Realtime session (PCM16 24k)
 */
class TwilioBridgeService {
  constructor(realtimeWSService) {
    this.realtimeWSService = realtimeWSService;
    this.callSidToSession = new Map();
  }

  /**
   * Create a Realtime session with a stub client that forwards assistant audio back to Twilio
   */
  async start(callSid, twilioWs, streamSid) {
    const sessionId = `twilio-${callSid}`;

    // Stub client implements minimal WebSocket-like interface that the service expects
    const stubClient = {
      readyState: WebSocket.OPEN,
      send: (jsonStr) => {
        try {
          const msg = JSON.parse(jsonStr);
          this.onAgentMessage(callSid, streamSid, twilioWs, msg);
        } catch (_) {
          // Ignore non-JSON
        }
      },
      on: () => {},
      close: () => {}
    };

    await this.realtimeWSService.createSession(stubClient, sessionId);
    this.callSidToSession.set(callSid, { sessionId, streamSid, twilioWs });
    return sessionId;
  }

  /**
   * Stop/cleanup
   */
  async stop(callSid) {
    const entry = this.callSidToSession.get(callSid);
    if (entry) {
      await this.realtimeWSService.closeSession(entry.sessionId);
      this.callSidToSession.delete(callSid);
    }
  }

  /**
   * Handle incoming Twilio media payload
   * Twilio sends base64 μ-law at 8kHz; we decode, upsample to 24k PCM16, and forward
   */
  handleTwilioMedia(callSid, base64Ulaw) {
    const entry = this.callSidToSession.get(callSid);
    if (!entry) return;

    const pcm8 = this.decodeUlawToPCM16(Buffer.from(base64Ulaw, 'base64'));
    const pcm24 = this.resampleLinearPCM16(pcm8, 8000, 24000);

    const audioBase64 = pcm24.toString('base64');
    const { sessionId } = entry;
    const sessionData = this.realtimeWSService.sessions.get(sessionId);
    if (sessionData && sessionData.openaiWs && sessionData.openaiWs.readyState === WebSocket.OPEN) {
      sessionData.openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: audioBase64 }));
      // Optional: commit periodically could be managed by caller
    }
  }

  /**
   * Flush/commit audio buffer
   */
  commit(callSid) {
    const entry = this.callSidToSession.get(callSid);
    if (!entry) return;
    const sessionData = this.realtimeWSService.sessions.get(entry.sessionId);
    if (sessionData && sessionData.openaiWs && sessionData.openaiWs.readyState === WebSocket.OPEN) {
      sessionData.openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    }
  }

  /**
   * Convert agent audio back to Twilio
   */
  onAgentMessage(callSid, streamSid, twilioWs, msg) {
    if (!msg || msg.type !== 'audio' || !msg.delta) return;
    // msg.delta is base64 PCM16 24k
    const pcm24 = Buffer.from(msg.delta, 'base64');
    const pcm8 = this.resampleLinearPCM16(pcm24, 24000, 8000);
    const ulaw = this.encodePCM16ToUlaw(pcm8);
    const payload = ulaw.toString('base64');

    try {
      const out = {
        event: 'media',
        streamSid,
        media: { payload }
      };
      if (twilioWs.readyState === WebSocket.OPEN) {
        twilioWs.send(JSON.stringify(out));
      }
    } catch (e) {
      // swallow
    }
  }

  /**
   * μ-law encode: PCM16 (LE) -> μ-law bytes
   */
  encodePCM16ToUlaw(pcm16Buffer) {
    const samples = new Int16Array(pcm16Buffer.buffer, pcm16Buffer.byteOffset, pcm16Buffer.byteLength / 2);
    const out = Buffer.alloc(samples.length);
    for (let i = 0; i < samples.length; i++) {
      out[i] = this.linearToMuLawSample(samples[i]);
    }
    return out;
  }

  /**
   * μ-law decode: μ-law bytes -> PCM16 (LE)
   */
  decodeUlawToPCM16(ulawBuffer) {
    const out = Buffer.alloc(ulawBuffer.length * 2);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    for (let i = 0; i < ulawBuffer.length; i++) {
      const s = this.muLawToLinearSample(ulawBuffer[i]);
      view.setInt16(i * 2, s, true);
    }
    return out;
  }

  // Based on ITU-T G.711 μ-law
  linearToMuLawSample(sample) {
    const MULAW_MAX = 0x1FFF;
    const MULAW_BIAS = 33;
    let sign = (sample >> 8) & 0x80;
    if (sign !== 0) sample = -sample;
    if (sample > MULAW_MAX) sample = MULAW_MAX;
    sample = sample + MULAW_BIAS;
    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
      exponent--;
    }
    const mantissa = (sample >> (exponent + 3)) & 0x0F;
    let ulaw = ~(sign | (exponent << 4) | mantissa) & 0xFF;
    return ulaw;
  }

  muLawToLinearSample(ulawByte) {
    ulawByte = ~ulawByte & 0xFF;
    const sign = ulawByte & 0x80;
    const exponent = (ulawByte >> 4) & 0x07;
    const mantissa = ulawByte & 0x0F;
    const MULAW_BIAS = 33;
    let sample = ((mantissa << 3) + MULAW_BIAS) << exponent;
    sample -= MULAW_BIAS;
    return sign ? -sample : sample;
  }

  /**
   * Very simple linear resampler (nearest-neighbor). Low latency, acceptable quality for telephony.
   */
  resampleLinearPCM16(srcBuf, srcRate, dstRate) {
    if (srcRate === dstRate) return Buffer.from(srcBuf);
    const srcSamples = new Int16Array(srcBuf.buffer, srcBuf.byteOffset, srcBuf.byteLength / 2);
    const ratio = dstRate / srcRate;
    const dstLength = Math.floor(srcSamples.length * ratio);
    const dstBuf = Buffer.alloc(dstLength * 2);
    const dstView = new DataView(dstBuf.buffer, dstBuf.byteOffset, dstBuf.byteLength);
    for (let i = 0; i < dstLength; i++) {
      const srcIndex = Math.floor(i / ratio);
      const s = srcSamples[Math.min(srcSamples.length - 1, srcIndex)] || 0;
      dstView.setInt16(i * 2, s, true);
    }
    return dstBuf;
  }
}

module.exports = { TwilioBridgeService };


