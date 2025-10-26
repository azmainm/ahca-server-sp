const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const { BusinessConfigService } = require('../../../shared/services/BusinessConfigService');

// Initialize business config service
const businessConfigService = new BusinessConfigService();

/**
 * POST /twilio/voice
 * Multi-tenant Twilio Voice webhook that returns TwiML to start a bidirectional Media Stream
 * Identifies business from phone number and passes businessId to WebSocket
 */
router.post('/voice', async (req, res) => {
  try {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const signature = req.header('X-Twilio-Signature');

    // Validate signature if token is provided
    if (authToken && signature) {
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const isValid = twilio.validateRequest(authToken, signature, url, req.body);
      if (!isValid) {
        console.error('❌ [TwilioVoice] Invalid Twilio signature');
        return res.status(403).send('Invalid Twilio signature');
      }
    }

    const from = req.body.From || '';
    const to = req.body.To || '';
    const callSid = req.body.CallSid || '';

    console.log('📞 [TwilioVoice] Incoming call:', { from, to, callSid });

    // Initialize business config service if needed
    if (!businessConfigService.isInitialized()) {
      console.log('🏢 [TwilioVoice] Initializing business config service...');
      await businessConfigService.initialize();
    }

    // Get business ID from phone number
    const businessId = businessConfigService.getBusinessIdFromPhone(to);
    
    if (!businessId) {
      console.error(`❌ [TwilioVoice] No business configured for phone number: ${to}`);
      
      // Return a polite rejection message
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say('Sorry, this number is not currently configured for voice services. Please check the number and try again.');
      twiml.hangup();
      
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // Get business configuration to validate it exists
    const businessConfig = businessConfigService.getBusinessConfig(businessId);
    if (!businessConfig) {
      console.error(`❌ [TwilioVoice] Business config not found for: ${businessId}`);
      
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say('Sorry, this service is temporarily unavailable. Please try again later.');
      twiml.hangup();
      
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    console.log(`✅ [TwilioVoice] Call routed to business: ${businessId} (${businessConfig.businessName})`);

    // Build WebSocket URL with business context
    // Prefer forwarded host when behind proxies (ngrok/load balancer)
    const forwardedHost = req.headers['x-forwarded-host'];
    const rawHost = (forwardedHost ? forwardedHost.split(',')[0] : req.get('host')) || '';
    const host = rawHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
    // Determine scheme from forwarded proto; Twilio requires secure websockets
    const protoHeader = (req.headers['x-forwarded-proto'] || req.protocol || '').toString();
    const proto = protoHeader.split(',')[0].trim().toLowerCase();
    const scheme = proto === 'https' ? 'wss' : 'wss';

    const streamUrl = `${scheme}://${host}/twilio-media`;

    const twiml = new twilio.twiml.VoiceResponse();
    const connect = twiml.connect();
    const stream = connect.stream({ url: streamUrl });
    // Send business context via Twilio Stream Parameters (available on 'start' event)
    stream.parameter({ name: 'businessId', value: businessId });
    stream.parameter({ name: 'from', value: from });
    stream.parameter({ name: 'to', value: to });

    console.log(`🔗 [TwilioVoice] WebSocket URL: ${streamUrl} (parameters sent via TwiML <Parameter>)`);

    res.type('text/xml');
    return res.send(twiml.toString());
    
  } catch (err) {
    console.error('❌ [TwilioVoice] Error generating TwiML:', err);
    
    // Return error TwiML instead of 500 to avoid Twilio retries
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('Sorry, we are experiencing technical difficulties. Please try again later.');
    twiml.hangup();
    
    res.type('text/xml');
    return res.send(twiml.toString());
  }
});

module.exports = router;


