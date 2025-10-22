/**
 * Realtime WebSocket Route Handler
 * Sets up WebSocket connections for OpenAI Realtime API integration
 */

const { RealtimeWebSocketService } = require('../services/RealtimeWebSocketService');
const { ConversationFlowHandler } = require('../services/ConversationFlowHandler');
const { ConversationStateManager } = require('../services/ConversationStateManager');
const { UserInfoCollector } = require('../services/UserInfoCollector');
const { AppointmentFlowManager } = require('../services/AppointmentFlowManager');
const { DateTimeParser } = require('../services/DateTimeParser');
const { IntentClassifier } = require('../services/IntentClassifier');
const { ResponseGenerator } = require('../services/ResponseGenerator');
const { OpenAIService } = require('../services/OpenAIService');
const { EmbeddingService } = require('../../../shared/services/EmbeddingService');
const { SherpaPromptRAG } = require('../../../shared/services/SherpaPromptRAG');
const { GoogleCalendarService } = require('../../../shared/services/GoogleCalendarService');
const { MicrosoftCalendarService } = require('../../../shared/services/MicrosoftCalendarService');
const { CompanyInfoService } = require('../../../shared/services/CompanyInfoService');
const { EmailService } = require('../../../shared/services/EmailService');

// Initialize services
const openAIService = new OpenAIService();
const embeddingService = new EmbeddingService();
const sherpaPromptRAG = new SherpaPromptRAG();
const googleCalendarService = new GoogleCalendarService();
const microsoftCalendarService = new MicrosoftCalendarService();
const companyInfoService = new CompanyInfoService();
const emailService = new EmailService();

// Initialize domain services
const stateManager = new ConversationStateManager();
const userInfoCollector = new UserInfoCollector(openAIService);
const dateTimeParser = new DateTimeParser();
const intentClassifier = new IntentClassifier();
const responseGenerator = new ResponseGenerator(openAIService);
const appointmentFlowManager = new AppointmentFlowManager(openAIService, dateTimeParser, responseGenerator);

// Helper functions
function getCalendarService(calendarType) {
  if (calendarType === 'microsoft') {
    return microsoftCalendarService;
  } else {
    return googleCalendarService;
  }
}

function extractSearchTerms(text) {
  const sherpaPromptKeywords = [
    'sherpaprompt',
    'automation',
    'call service',
    'transcript',
    'voice estimate',
    'app',
    'integration',
    'pricing',
    'demo',
    'api',
    'workflow',
    'ai agent',
    'conversation',
    'task',
    'estimate',
    'prompt',
    'orchestration',
    'price', 'cost', 'costs', 'pricing', 'how much', 'expensive',
    'affordable', 'budget', 'fee', 'fees', 'rate', 'rates',
    'tier', 'tiers', 'plan', 'plans', 'subscription', 'monthly',
    'yearly', 'annual', 'payment', 'pay', 'trial', 'free',
    'schedule', 'emergency', 'service', 'area', 'financing',
    'quote', 'consultation', 'appointment',
    'phone', 'number', 'call', 'contact', 'reach', 'email', 'address',
    'location', 'office', 'company', 'business', 'hours', 'open',
    'available', 'speak', 'talk', 'representative', 'website', 'areas'
  ];
  
  const textLower = text.toLowerCase();
  const words = textLower.split(/\s+/);
  
  const foundKeywords = words.filter(word => 
    sherpaPromptKeywords.some(keyword => 
      word.includes(keyword) || keyword.includes(word)
    )
  );
  
  const questionWords = ['how', 'what', 'when', 'where', 'why', 'can', 'do', 'are', 'is', 'will'];
  const isQuestion = questionWords.some(qw => textLower.includes(qw));
  
  const pricingIndicators = ['price', 'cost', 'pricing', 'how much', 'expensive', 'affordable'];
  const isPricingQuery = pricingIndicators.some(indicator => textLower.includes(indicator));
  
  if (isPricingQuery) {
    foundKeywords.push('pricing', 'cost', 'price');
    const serviceTerms = ['call service', 'automation', 'transcript', 'voice estimate', 'app'];
    serviceTerms.forEach(term => {
      if (textLower.includes(term)) {
        foundKeywords.push(term);
      }
    });
  }
  
  if (isQuestion && foundKeywords.length > 0) {
    const contextWords = words.filter(word => 
      word.length > 3 && 
      !['the', 'and', 'for', 'are', 'you', 'your', 'can', 'will', 'this', 'that'].includes(word)
    );
    foundKeywords.push(...contextWords.slice(0, 3));
  }
  
  return [...new Set(foundKeywords)];
}

// Initialize conversation flow handler
const conversationFlowHandler = new ConversationFlowHandler({
  stateManager,
  userInfoCollector,
  appointmentFlowManager,
  intentClassifier,
  responseGenerator,
  companyInfoService,
  sherpaPromptRAG,
  embeddingService,
  emailService
});

conversationFlowHandler.setHelpers(getCalendarService, extractSearchTerms);

// Initialize Realtime WebSocket service
const realtimeWSService = new RealtimeWebSocketService(
  conversationFlowHandler,
  openAIService,
  stateManager
);

/**
 * Set up WebSocket server
 */
function setupRealtimeWebSocket(wss) {
  console.log('🎯 [RealtimeWS] WebSocket server initialized');

  wss.on('connection', async (ws, req) => {
    console.log('🔗 [RealtimeWS] Client connected from:', req.socket.remoteAddress);

    // Generate session ID
    const sessionId = `realtime-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('📝 [RealtimeWS] Session ID:', sessionId);

    try {
      // Create Realtime API session
      await realtimeWSService.createSession(ws, sessionId);
      
      // Send session ready message to client
      ws.send(JSON.stringify({
        type: 'session_ready',
        sessionId: sessionId,
        message: 'Connected to SherpaPrompt AI Assistant'
      }));

    } catch (error) {
      console.error('❌ [RealtimeWS] Failed to create session:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Failed to initialize AI assistant',
        message: error.message
      }));
      ws.close();
    }
  });

  wss.on('error', (error) => {
    console.error('❌ [RealtimeWS] WebSocket server error:', error);
  });

  // Cleanup old sessions periodically
  setInterval(() => {
    realtimeWSService.cleanupOldSessions();
  }, 5 * 60 * 1000); // Every 5 minutes

  console.log('✅ [RealtimeWS] WebSocket handler ready');
}

module.exports = { setupRealtimeWebSocket, realtimeWSService };

