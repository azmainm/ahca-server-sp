/**
 * Voice Agent Services
 * Organized service exports for the voice agent system
 */

// Conversation Services
const {
  ConversationFlowHandler,
  ConversationStateManager,
  UserInfoCollector
} = require('./conversation');

// Business-Specific Services
const {
  SuperiorFencingHandler
} = require('./business');

// Integration Services
const {
  AppointmentFlowManager,
  EmergencyCallHandler
} = require('./integrations');

// Real-time Services
const {
  RealtimeVADService,
  RealtimeWebSocketService,
  TwilioBridgeService
} = require('./realtime');

// Utility Services
const {
  DateTimeParser,
  IntentClassifier,
  OpenAIService,
  ResponseGenerator
} = require('./utils');

module.exports = {
  // Conversation
  ConversationFlowHandler,
  ConversationStateManager,
  UserInfoCollector,
  
  // Business
  SuperiorFencingHandler,
  
  // Integrations
  AppointmentFlowManager,
  EmergencyCallHandler,
  
  // Real-time
  RealtimeVADService,
  RealtimeWebSocketService,
  TwilioBridgeService,
  
  // Utils
  DateTimeParser,
  IntentClassifier,
  OpenAIService,
  ResponseGenerator
};
