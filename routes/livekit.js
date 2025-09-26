// routes/livekit.js
const express = require('express');
const { LiveKitService } = require('../services/LiveKitService');
const { RealtimeLiveKitAgent } = require('../services/RealtimeLiveKitAgent');

const router = express.Router();

// Initialize LiveKit service and realtime agent
let livekitService;
let livekitAgent;
try {
  livekitService = new LiveKitService();
  livekitAgent = new RealtimeLiveKitAgent();
} catch (error) {
  console.error('❌ Failed to initialize LiveKit services:', error.message);
  livekitService = null;
  livekitAgent = null;
}

/**
 * Generate access token for LiveKit room
 * POST /api/livekit/token
 */
router.post('/token', async (req, res) => {
  try {
    if (!livekitService) {
      return res.status(500).json({
        success: false,
        error: 'LiveKit service not available',
        message: 'LiveKit configuration is missing or invalid'
      });
    }

    console.log('\n🎫 ======= LIVEKIT TOKEN REQUEST =======');
    console.log('🕰️ Timestamp:', new Date().toISOString());
    console.log('📝 Request body:', req.body);

    const { roomName, identity, sessionId } = req.body;

    // Generate room name if not provided
    const finalRoomName = roomName || livekitService.generateRoomName(sessionId);
    
    // Generate identity if not provided
    const finalIdentity = identity || livekitService.generateUserIdentity();

    console.log(`🏠 Room name: ${finalRoomName}`);
    console.log(`👤 User identity: ${finalIdentity}`);

    // Ensure room exists
    await livekitService.createRoom(finalRoomName);

    // Generate access token
    const accessToken = await livekitService.generateAccessToken(
      finalRoomName,
      finalIdentity,
      {
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canSubscribeData: true
      }
    );

    const response = {
      success: true,
      accessToken,
      roomName: finalRoomName,
      identity: finalIdentity,
      serverUrl: livekitService.livekitUrl
    };

    console.log('✅ Token generated successfully');
    console.log('🎉 ======= TOKEN RESPONSE SENT =======\n');

    res.json(response);

  } catch (error) {
    console.error('❌ Error generating LiveKit token:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate access token',
      message: error.message
    });
  }
});

/**
 * Get room information
 * GET /api/livekit/room/:roomName
 */
router.get('/room/:roomName', async (req, res) => {
  try {
    if (!livekitService) {
      return res.status(500).json({
        success: false,
        error: 'LiveKit service not available'
      });
    }

    const { roomName } = req.params;
    console.log(`🔍 Getting info for room: ${roomName}`);

    const roomInfo = await livekitService.getRoomInfo(roomName);

    res.json({
      success: true,
      ...roomInfo
    });

  } catch (error) {
    console.error('❌ Error getting room info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get room information',
      message: error.message
    });
  }
});

/**
 * List all active rooms
 * GET /api/livekit/rooms
 */
router.get('/rooms', async (req, res) => {
  try {
    if (!livekitService) {
      return res.status(500).json({
        success: false,
        error: 'LiveKit service not available'
      });
    }

    console.log('📋 Listing all active rooms');
    const rooms = await livekitService.listRooms();

    res.json({
      success: true,
      rooms,
      count: rooms.length
    });

  } catch (error) {
    console.error('❌ Error listing rooms:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list rooms',
      message: error.message
    });
  }
});

/**
 * Delete a room
 * DELETE /api/livekit/room/:roomName
 */
router.delete('/room/:roomName', async (req, res) => {
  try {
    if (!livekitService) {
      return res.status(500).json({
        success: false,
        error: 'LiveKit service not available'
      });
    }

    const { roomName } = req.params;
    console.log(`🗑️ Deleting room: ${roomName}`);

    await livekitService.deleteRoom(roomName);

    res.json({
      success: true,
      message: `Room ${roomName} deleted successfully`
    });

  } catch (error) {
    console.error('❌ Error deleting room:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete room',
      message: error.message
    });
  }
});

/**
 * Create LiveKit Agent session (proper implementation)
 * POST /api/livekit/agent/start
 */
router.post('/agent/start', async (req, res) => {
  try {
    if (!livekitAgent) {
      return res.status(500).json({
        success: false,
        error: 'LiveKit agent not available'
      });
    }

    console.log('\n🤖 ======= CREATING LIVEKIT AGENT SESSION =======');
    console.log('🕰️ Timestamp:', new Date().toISOString());
    console.log('📝 Request body:', req.body);

    const { sessionId } = req.body;
    const finalSessionId = sessionId || `session-${Date.now()}`;

    // Create agent session using RealtimeLiveKitAgent
    const result = await livekitAgent.createSession(finalSessionId);

    console.log('✅ LiveKit Agent session created successfully');
    console.log('🎉 ======= AGENT SESSION READY =======\n');

    res.json(result);

  } catch (error) {
    console.error('❌ Error creating LiveKit Agent session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create LiveKit Agent session',
      message: error.message
    });
  }
});

/**
 * Handle RAG search request from agent
 * POST /api/livekit/agent/rag-search
 */
router.post('/agent/rag-search', async (req, res) => {
  try {
    if (!livekitAgent) {
      return res.status(500).json({
        success: false,
        error: 'LiveKit agent not available'
      });
    }

    console.log('\n🔍 ======= LIVEKIT AGENT RAG SEARCH =======');
    console.log('🕰️ Timestamp:', new Date().toISOString());
    console.log('📝 Request body:', req.body);

    const { sessionId, query } = req.body;

    if (!sessionId || !query) {
      return res.status(400).json({
        success: false,
        error: 'Session ID and query are required'
      });
    }

    // Perform RAG search for the session
    const result = await livekitAgent.performRagSearch(sessionId, query);

    console.log('✅ RAG search completed');
    console.log('🎉 ======= RAG SEARCH RESULT SENT =======\n');

    res.json(result);

  } catch (error) {
    console.error('❌ Error in RAG search:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform RAG search',
      message: error.message
    });
  }
});

/**
 * End LiveKit Agent session
 * POST /api/livekit/agent/end
 */
router.post('/agent/end', async (req, res) => {
  try {
    if (!livekitAgent) {
      return res.status(500).json({
        success: false,
        error: 'LiveKit agent not available'
      });
    }

    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }

    await livekitAgent.endSession(sessionId);

    res.json({
      success: true,
      message: `LiveKit Agent session ended: ${sessionId}`
    });

  } catch (error) {
    console.error('❌ Error ending LiveKit Agent session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end LiveKit Agent session',
      message: error.message
    });
  }
});

/**
 * Get active agent sessions
 * GET /api/livekit/agent/sessions
 */
router.get('/agent/sessions', async (req, res) => {
  try {
    if (!livekitAgent) {
      return res.status(500).json({
        success: false,
        error: 'LiveKit agent not available'
      });
    }

    const sessions = livekitAgent.getActiveSessions();

    res.json({
      success: true,
      sessions,
      count: sessions.length
    });

  } catch (error) {
    console.error('❌ Error getting active sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active sessions',
      message: error.message
    });
  }
});

/**
 * Health check for LiveKit service and agent
 * GET /api/livekit/health
 */
router.get('/health', async (req, res) => {
  try {
    const serviceHealthy = !!livekitService;
    const agentHealthy = !!livekitAgent;

    let livekitStatus = 'unhealthy';
    let agentStatus = 'unhealthy';

    if (serviceHealthy) {
      try {
        await livekitService.listRooms();
        livekitStatus = 'healthy';
      } catch (error) {
        console.error('LiveKit service test failed:', error);
      }
    }

    if (agentHealthy) {
      try {
        const healthCheck = await livekitAgent.healthCheck();
        agentStatus = healthCheck.status;
      } catch (error) {
        console.error('LiveKit agent test failed:', error);
      }
    }

    res.json({
      success: livekitStatus === 'healthy' && agentStatus === 'healthy',
      services: {
        livekit: {
          status: livekitStatus,
          configured: serviceHealthy,
          serverUrl: livekitService?.livekitUrl
        },
        agent: {
          status: agentStatus,
          configured: agentHealthy,
          activeSessions: livekitAgent?.getActiveSessions()?.length || 0
        }
      }
    });

  } catch (error) {
    console.error('❌ LiveKit health check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      message: error.message
    });
  }
});

module.exports = router;
