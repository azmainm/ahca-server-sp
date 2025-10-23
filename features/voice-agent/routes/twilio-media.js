const { TwilioBridgeService } = require('../services/TwilioBridgeService');
const { realtimeWSService } = require('./realtime-websocket');

let bridge; // initialized by setup function

/**
 * Setup Twilio Media Streams WebSocket server
 */
function setupTwilioMediaWebSocket(wss) {
  bridge = new TwilioBridgeService(realtimeWSService);

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    console.log('🔗 [TwilioWS] Incoming Twilio Media WS connection from', req.socket.remoteAddress);
    let callSid = url.searchParams.get('callSid');
    let streamSid = null;

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.event) {
        case 'connected':
          console.log('✅ [TwilioWS] connected event');
          break;
        case 'start':
          streamSid = msg.start?.streamSid;
          callSid = callSid || msg.start?.callSid || `call-${Date.now()}`;
          console.log('🎬 [TwilioWS] start event', { callSid, streamSid });
          await bridge.start(callSid, ws, streamSid);
          break;
        case 'media':
          // media payload size can be logged if needed
          bridge.handleTwilioMedia(callSid, msg.media?.payload || '');
          break;
        case 'stop':
          console.log('⏹️ [TwilioWS] stop event');
          await bridge.stop(callSid);
          break;
        default:
          break;
      }
    });

    ws.on('close', async () => {
      console.log('🔌 [TwilioWS] WS closed');
      await bridge.stop(callSid);
    });
  });
}

module.exports = { setupTwilioMediaWebSocket };


