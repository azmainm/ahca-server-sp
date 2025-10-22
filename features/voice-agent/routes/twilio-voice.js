const express = require('express');
const router = express.Router();
const twilio = require('twilio');

/**
 * POST /twilio/voice
 * Twilio Voice webhook that returns TwiML to start a bidirectional Media Stream
 */
router.post('/voice', (req, res) => {
  try {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const signature = req.header('X-Twilio-Signature');

    // Validate signature if token is provided
    if (authToken && signature) {
      const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const isValid = twilio.validateRequest(authToken, signature, url, req.body);
      if (!isValid) {
        return res.status(403).send('Invalid Twilio signature');
      }
    }

    const publicBaseUrl = process.env.PUBLIC_BASE_URL;
    // Twilio requires secure websockets
    const scheme = 'wss';
    const host = publicBaseUrl ? publicBaseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : req.get('host');

    const streamUrl = `${scheme}://${host}/twilio-media`;

    const from = req.body.From || '';
    const to = req.body.To || '';
    const callSid = req.body.CallSid || '';

    const twiml = new twilio.twiml.VoiceResponse();
    const connect = twiml.connect();
    const stream = connect.stream({
      url: `${streamUrl}?callSid=${encodeURIComponent(callSid)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    });

    res.type('text/xml');
    return res.send(twiml.toString());
  } catch (err) {
    console.error('❌ [TwilioVoice] Error generating TwiML:', err);
    return res.status(500).send('Server error');
  }
});

module.exports = router;


