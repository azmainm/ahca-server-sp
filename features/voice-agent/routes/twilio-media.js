const { TwilioBridgeService } = require('../services');
const { realtimeWSService } = require('./realtime-websocket');
const { TenantContextManager } = require('../../../shared/services/TenantContextManager');

let bridge; // initialized by setup function
const tenantContextManager = new TenantContextManager();

/**
 * Setup Twilio Media Streams WebSocket server
 */
function setupTwilioMediaWebSocket(wss) {
  bridge = new TwilioBridgeService(realtimeWSService);

  // Inject bridge into the realtime service to complete the interruption circuit
  realtimeWSService.setBridgeService(bridge);

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    console.log('🔗 [TwilioWS] Incoming Twilio Media WS connection from', req.socket.remoteAddress);
    
    // Twilio Media Streams does not forward URL query params; read from 'start' event
    let callSid = null;
    let businessId = null;
    let from = null;
    let to = null;

    console.log('📋 [TwilioWS] Waiting for start event to obtain params');
    
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
          callSid = msg.start?.callSid || callSid || `call-${Date.now()}`;
          // Extract custom parameters sent via TwiML <Parameter>
          try {
            const cp = msg.start?.customParameters;
            if (cp && typeof cp === 'object' && !Array.isArray(cp)) {
              // Twilio commonly sends an object map
              businessId = cp.businessId || businessId;
              from = cp.from || from;
              to = cp.to || to;
            } else if (Array.isArray(cp)) {
              // Fallback: array of { name, value }
              const map = new Map(cp.map(p => [p.name, p.value]));
              businessId = map.get('businessId') || businessId;
              from = map.get('from') || from;
              to = map.get('to') || to;
            }
          } catch (_) {}

          console.log('🎬 [TwilioWS] start event', { callSid, streamSid, businessId, from, to });

          // Validate business ID received via start.customParameters
          if (!businessId) {
            console.error('❌ [TwilioWS] No businessId provided in start.customParameters, closing');
            ws.close(1008, 'Missing business ID');
            return;
          }

          // Store business context for this session
          tenantContextManager.setTenantContext(callSid, businessId);
          console.log(`🏢 [TwilioWS] Set tenant context: ${callSid} -> ${businessId}`);

          await bridge.start(callSid, ws, streamSid, businessId, from, to);
          break;
        case 'media':
          // media payload size can be logged if needed
          bridge.handleTwilioMedia(callSid, msg.media?.payload || '');
          break;
        case 'stop':
          console.log('⏹️ [TwilioWS] stop event');
          await bridge.stop(callSid);
          
          // Clean up tenant context
          tenantContextManager.removeTenantContext(callSid);
          console.log(`🗑️ [TwilioWS] Removed tenant context for: ${callSid}`);
          break;
        default:
          break;
      }
    });

    ws.on('close', async () => {
      console.log('🔌 [TwilioWS] WS closed');
      await bridge.stop(callSid);
      
      // Clean up tenant context on close
      if (callSid) {
        tenantContextManager.removeTenantContext(callSid);
        console.log(`🗑️ [TwilioWS] Cleaned up tenant context on close: ${callSid}`);
      }
    });
  });
}

module.exports = { setupTwilioMediaWebSocket, tenantContextManager };


