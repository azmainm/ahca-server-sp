const express = require('express');
const router = express.Router();

/**
 * Generate ephemeral token for OpenAI Realtime API
 * This endpoint creates a secure token that the client can use to connect to OpenAI's Realtime API
 */
router.post('/ephemeral-token', async (req, res) => {
  try {
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: 'gpt-realtime'
        }
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API Error:', response.status, errorData);
      return res.status(response.status).json({ 
        error: 'Failed to create OpenAI session',
        details: errorData
      });
    }

    const data = await response.json();
    
    // Return the ephemeral key directly
    res.json({
      apiKey: data.value
    });

  } catch (error) {
    console.error('Error generating ephemeral token:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

module.exports = router;