// routes/realtime-agent.js
/**
 * Realtime LiveKit Agent Routes - Updated for OpenAI Realtime API
 * Simplified approach: only handles session management, Python agent does the rest
 */

const express = require('express');
const { RealtimeLiveKitAgent } = require('../services/RealtimeLiveKitAgent');

const router = express.Router();

// Initialize service lazily
let realtimeAgent = null;

console.log('📝 Loading realtime-agent route...');

/**
 * Test endpoint
 * GET /api/realtime-agent/test
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Realtime agent route is working',
    timestamp: new Date().toISOString()
  });
});

/**
 * Create a new realtime agent session
 * POST /api/realtime-agent/create-session
 */
router.post('/create-session', async (req, res) => {
  try {
    // Initialize service if needed
    if (!realtimeAgent) {
      try {
        realtimeAgent = new RealtimeLiveKitAgent();
        console.log('✅ Realtime LiveKit Agent service initialized on demand');
      } catch (initError) {
        console.error('❌ Failed to initialize services on demand:', initError.message);
        return res.status(500).json({
          success: false,
          error: 'Realtime LiveKit Agent service not available',
          message: 'LiveKit configuration is missing or invalid: ' + initError.message
        });
      }
    }

    console.log('\n🤖 ======= CREATING REALTIME AGENT SESSION =======');
    console.log('🕰️ Timestamp:', new Date().toISOString());
    console.log('📝 Request body:', req.body);

    const { sessionId } = req.body;
    
    // Generate unique session ID
    const finalSessionId = sessionId || `realtime-session-${Date.now()}`;

    console.log(`🆔 Session ID: ${finalSessionId}`);

    // Create session (this creates room, generates tokens, etc.)
    const result = await realtimeAgent.createSession(finalSessionId);

    console.log('✅ Realtime agent session created successfully');
    console.log('🎉 ======= REALTIME AGENT SESSION READY =======\n');

    res.json(result);

  } catch (error) {
    console.error('❌ Error creating realtime agent session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create realtime agent session',
      message: error.message
    });
  }
});

/**
 * End a realtime agent session
 * POST /api/realtime-agent/end-session
 */
router.post('/end-session', async (req, res) => {
  try {
    if (!realtimeAgent) {
      return res.status(500).json({
        success: false,
        error: 'Realtime LiveKit Agent service not available'
      });
    }

    console.log('\n🛑 ======= ENDING REALTIME AGENT SESSION =======');
    console.log('🕰️ Timestamp:', new Date().toISOString());
    console.log('📝 Request body:', req.body);

    const { roomName, sessionId } = req.body;

    if (!sessionId && !roomName) {
      return res.status(400).json({
        success: false,
        error: 'Session ID or room name is required'
      });
    }

    // End the session
    await realtimeAgent.endSession(sessionId, roomName);

    console.log('✅ Realtime agent session ended successfully');
    console.log('🎉 ======= SESSION CLEANUP COMPLETE =======\n');

    res.json({
      success: true,
      message: `Realtime agent session ended`,
      sessionId,
      roomName
    });

  } catch (error) {
    console.error('❌ Error ending realtime agent session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end realtime agent session',
      message: error.message
    });
  }
});

/**
 * Get active realtime agent sessions
 * GET /api/realtime-agent/sessions
 */
router.get('/sessions', async (req, res) => {
  try {
    if (!realtimeAgent) {
      return res.status(500).json({
        success: false,
        error: 'Realtime LiveKit Agent service not available'
      });
    }

    const activeSessions = realtimeAgent.getActiveSessions();

    res.json({
      success: true,
      sessions: activeSessions,
      count: activeSessions.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting active realtime agent sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active sessions',
      message: error.message
    });
  }
});

/**
 * Health check for realtime agent service
 * GET /api/realtime-agent/health
 */
router.get('/health', async (req, res) => {
  try {
    let healthStatus = {
      status: 'unhealthy',
      services: {
        realtimeAgent: false
      },
      activeSessions: 0
    };

    if (realtimeAgent) {
      try {
        const agentHealth = await realtimeAgent.healthCheck();
        healthStatus.services.realtimeAgent = agentHealth.status === 'healthy';
        healthStatus.activeSessions = agentHealth.activeSessions;

        if (healthStatus.services.realtimeAgent) {
          healthStatus.status = 'healthy';
        }
      } catch (error) {
        console.error('Health check test failed:', error);
      }
    }

    res.json({
      success: healthStatus.status === 'healthy',
      ...healthStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Realtime agent health check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get realtime agent info
 * GET /api/realtime-agent/info
 */
router.get('/info', async (req, res) => {
  try {
    const info = {
      name: 'SherpaPrompt Realtime Agent',
      version: '2.0.0',
      description: 'LiveKit agent with OpenAI Realtime API - pure speech-to-speech',
      capabilities: [
        'Real-time speech-to-speech processing',
        'Automatic RAG knowledge search via function calling',
        'Natural conversation flow without STT/TTS pipeline',
        'Voice activity detection',
        'Turn-based conversation management'
      ],
      features: {
        realtimeAPI: true,
        ragIntegration: true,
        voiceProcessing: true,
        speechToSpeech: true,
        livekitIntegration: true
      },
      supported: {
        models: ['gpt-4o-realtime-preview'],
        voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'coral'],
        languages: ['en-US'],
        modalities: ['audio']
      }
    };

    res.json({
      success: true,
      ...info,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting realtime agent info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get agent info',
      message: error.message
    });
  }
});

module.exports = router;