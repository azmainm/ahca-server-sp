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
          model: 'gpt-realtime',
          tools: [
            {
              type: 'function',
              name: 'knowledge_search',
              description: 'Search the company knowledge base for fencing information',
              parameters: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'Search query for fencing-related information'
                  }
                },
                required: ['query']
              }
            }
          ],
          tool_choice: 'auto'
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

/**
 * Handle tool calls from OpenAI Realtime API
 * POST /api/openai/tool-call
 */
router.post('/tool-call', async (req, res) => {
  try {
    const { tool_name, parameters } = req.body;
    
    if (tool_name === 'knowledge_search') {
      const { query } = parameters;
      
      // Forward to our knowledge search endpoint
      const serverUrl = process.env.SERVER_URL;
      const searchResponse = await fetch(`${serverUrl}/api/voice-tools/search-knowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });
      
      const searchResult = await searchResponse.json();
      
      return res.json({
        success: true,
        result: searchResult.result || 'No information found.',
        tool_call_id: req.body.tool_call_id
      });
    }
    
    // Handle other tools if needed
    res.json({
      success: false,
      error: `Unknown tool: ${tool_name}`,
      tool_call_id: req.body.tool_call_id
    });
    
  } catch (error) {
    console.error('Error handling tool call:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute tool',
      message: error.message,
      tool_call_id: req.body.tool_call_id
    });
  }
});

module.exports = router;