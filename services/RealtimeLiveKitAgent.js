// services/RealtimeLiveKitAgent.js
/**
 * Simplified LiveKit Agent Service for OpenAI Realtime API
 * This service only handles session management - no client-side LiveKit connection
 * The Python agent handles all LiveKit room connections
 */

const { LiveKitService } = require('./LiveKitService');

class RealtimeLiveKitAgent {
  constructor() {
    this.livekitService = new LiveKitService();
    
    // Track active agent sessions
    this.activeSessions = new Map();
    
    console.log('🤖 Realtime LiveKit Agent initialized');
  }

  /**
   * Create session for realtime agent
   */
  async createSession(sessionId, options = {}) {
    try {
      console.log(`🚀 Creating realtime agent session: ${sessionId}`);
      
      const roomName = options.roomName || `realtime-room-${sessionId}-${Date.now()}`;
      const userIdentity = `user-${Date.now()}`;
      
      // Create LiveKit room
      await this.livekitService.createRoom(roomName, {
        emptyTimeout: 300, // Room stays active for 5 minutes after last participant leaves
        maxParticipants: 10
      });
      
      // Generate user token
      const userToken = await this.livekitService.generateAccessToken(
        roomName,
        userIdentity,
        {
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
          canSubscribeData: true
        }
      );
      
      // Create session data
      const session = {
        sessionId,
        roomName,
        userIdentity,
        userToken,
        serverUrl: this.livekitService.livekitUrl,
        createdAt: new Date(),
        status: 'created',
        conversationHistory: [],
        ragSearchHistory: [],
        ...options
      };

      // Store session
      this.activeSessions.set(sessionId, session);
      
      console.log(`✅ Realtime agent session created: ${sessionId}`);
      console.log(`🏠 Room: ${roomName}`);
      console.log(`👤 User: ${userIdentity}`);
      console.log(`🔗 Server: ${this.livekitService.livekitUrl}`);
      
      return {
        success: true,
        session,
        message: 'Python agent will automatically join the room'
      };
      
    } catch (error) {
      console.error(`❌ Error creating session ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get session info
   */
  getSession(sessionId) {
    return this.activeSessions.get(sessionId);
  }

  /**
   * End session
   */
  async endSession(sessionId, roomName = null) {
    try {
      console.log(`🔚 Ending session: ${sessionId}`);
      
      const session = this.activeSessions.get(sessionId);
      if (session) {
        session.status = 'ended';
        session.endedAt = new Date();
        
        // Try to delete the room
        const finalRoomName = roomName || session.roomName;
        if (finalRoomName) {
          try {
            await this.livekitService.deleteRoom(finalRoomName);
            console.log(`🗑️ Room ${finalRoomName} deleted`);
          } catch (roomError) {
            console.log(`⚠️ Could not delete room ${finalRoomName}:`, roomError.message);
          }
        }
        
        // Remove session after delay
        setTimeout(() => {
          this.activeSessions.delete(sessionId);
          console.log(`🗑️ Session ${sessionId} removed from memory`);
        }, 60000); // 1 minute
      }
      
    } catch (error) {
      console.error(`❌ Error ending session ${sessionId}:`, error);
    }
  }

  /**
   * Get active sessions
   */
  getActiveSessions() {
    const sessions = [];
    for (const [sessionId, session] of this.activeSessions.entries()) {
      sessions.push({
        sessionId,
        roomName: session.roomName,
        userIdentity: session.userIdentity,
        status: session.status,
        createdAt: session.createdAt,
        ragSearchCount: session.ragSearchHistory?.length || 0
      });
    }
    return sessions;
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      // Test LiveKit service
      await this.livekitService.listRooms();
      
      return {
        status: 'healthy',
        activeSessions: this.activeSessions.size,
        services: {
          livekit: true
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        activeSessions: this.activeSessions.size
      };
    }
  }
}

module.exports = { RealtimeLiveKitAgent };