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

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    console.log('🔗 [TwilioWS] Incoming Twilio Media WS connection from', req.socket.remoteAddress);
    
    // Extract connection parameters
    let callSid = url.searchParams.get('callSid');
    const businessId = url.searchParams.get('businessId');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    
    console.log('📋 [TwilioWS] Connection params:', { callSid, businessId, from, to });
    
    // Validate business ID
    if (!businessId) {
      console.error('❌ [TwilioWS] No businessId in WebSocket connection, closing');
      ws.close(1008, 'Missing business ID');
      return;
    }
    
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
          console.log('🎬 [TwilioWS] start event', { callSid, streamSid, businessId });
          
          // Store business context for this session
          tenantContextManager.setTenantContext(callSid, businessId);
          console.log(`🏢 [TwilioWS] Set tenant context: ${callSid} -> ${businessId}`);
          
          await bridge.start(callSid, ws, streamSid);
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


