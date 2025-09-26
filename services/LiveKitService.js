// services/LiveKitService.js
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

/**
 * LiveKit Service for managing rooms, tokens, and agent functionality
 * This service handles all LiveKit-related operations separately from other voice modes
 */
class LiveKitService {
  constructor() {
    this.livekitUrl = process.env.LIVEKIT_URL;
    this.apiKey = process.env.LIVEKIT_API_KEY;
    this.apiSecret = process.env.LIVEKIT_API_SECRET;
    
    if (!this.livekitUrl || !this.apiKey || !this.apiSecret) {
      throw new Error('Missing required LiveKit environment variables: LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET');
    }
    
    // Initialize room service client
    this.roomService = new RoomServiceClient(this.livekitUrl, this.apiKey, this.apiSecret);
    
    console.log('✅ LiveKit Service initialized');
    console.log('🔗 LiveKit URL:', this.livekitUrl);
    console.log('🔑 API Key:', this.apiKey ? 'SET' : 'MISSING');
  }

  /**
   * Generate access token for a user to join a LiveKit room
   * @param {string} roomName - Name of the room
   * @param {string} identity - User identity (unique identifier)
   * @param {Object} permissions - User permissions
   * @returns {string} Access token
   */
  async generateAccessToken(roomName, identity, permissions = {}) {
    try {
      console.log(`🎫 Generating access token for user ${identity} in room ${roomName}`);
      
      const token = new AccessToken(this.apiKey, this.apiSecret, {
        identity,
        ttl: '1h', // Token valid for 1 hour
      });

      // Set default permissions if not provided
      const defaultPermissions = {
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canSubscribeData: true,
        ...permissions
      };

      token.addGrant({
        room: roomName,
        roomJoin: true,
        ...defaultPermissions
      });

      const accessToken = await token.toJwt();
      console.log(`✅ Access token generated for ${identity}`);
      console.log('🎫 Token type:', typeof accessToken);
      console.log('🎫 Token length:', accessToken.length);
      
      return accessToken;
    } catch (error) {
      console.error('❌ Error generating access token:', error);
      throw error;
    }
  }

  /**
   * Create or ensure a room exists
   * @param {string} roomName - Name of the room
   * @param {Object} options - Room options
   * @returns {Object} Room information
   */
  async createRoom(roomName, options = {}) {
    try {
      console.log(`🏠 Creating/ensuring room exists: ${roomName}`);
      
      const roomOptions = {
        name: roomName,
        emptyTimeout: 300, // Room stays active for 5 minutes after last participant leaves
        maxParticipants: 10, // Limit to 10 participants
        ...options
      };

      const room = await this.roomService.createRoom(roomOptions);
      console.log(`✅ Room ${roomName} created/exists:`, room);
      
      return room;
    } catch (error) {
      console.error(`❌ Error creating room ${roomName}:`, error);
      throw error;
    }
  }

  /**
   * List all active rooms
   * @returns {Array} List of rooms
   */
  async listRooms() {
    try {
      console.log('📋 Listing all active rooms');
      const rooms = await this.roomService.listRooms();
      console.log(`📊 Found ${rooms.length} active rooms`);
      return rooms;
    } catch (error) {
      console.error('❌ Error listing rooms:', error);
      throw error;
    }
  }

  /**
   * Get information about a specific room
   * @param {string} roomName - Name of the room
   * @returns {Object} Room information
   */
  async getRoomInfo(roomName) {
    try {
      console.log(`🔍 Getting info for room: ${roomName}`);
      const room = await this.roomService.getRoom(roomName);
      const participants = await this.roomService.listParticipants(roomName);
      
      return {
        room,
        participants,
        participantCount: participants.length
      };
    } catch (error) {
      console.error(`❌ Error getting room info for ${roomName}:`, error);
      throw error;
    }
  }

  /**
   * Delete a room
   * @param {string} roomName - Name of the room
   */
  async deleteRoom(roomName) {
    try {
      console.log(`🗑️ Deleting room: ${roomName}`);
      await this.roomService.deleteRoom(roomName);
      console.log(`✅ Room ${roomName} deleted`);
    } catch (error) {
      console.error(`❌ Error deleting room ${roomName}:`, error);
      throw error;
    }
  }

  /**
   * Generate a unique room name for a session
   * @param {string} sessionId - Optional session ID
   * @returns {string} Unique room name
   */
  generateRoomName(sessionId = null) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return sessionId ? `ahca-${sessionId}-${timestamp}` : `ahca-${timestamp}-${random}`;
  }

  /**
   * Generate a unique identity for a user
   * @param {string} userId - Optional user ID
   * @returns {string} Unique identity
   */
  generateUserIdentity(userId = null) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return userId ? `user-${userId}-${timestamp}` : `user-${timestamp}-${random}`;
  }
}

module.exports = { LiveKitService };
