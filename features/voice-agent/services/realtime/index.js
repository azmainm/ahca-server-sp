/**
 * Real-time Communication Services
 * WebSocket, VAD, and real-time processing services
 */

const { RealtimeVADService } = require('./RealtimeVADService');
const { RealtimeWebSocketService } = require('./RealtimeWebSocketService');
const { TwilioBridgeService } = require('./TwilioBridgeService');

module.exports = {
  RealtimeVADService,
  RealtimeWebSocketService,
  TwilioBridgeService
};
