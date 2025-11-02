// voice-agent/routes/chained-voice.js
/**
 * Legacy STT-TTS endpoints (kept for backward compatibility)
 * New implementation uses RealtimeWebSocketService via /realtime-ws
 */

const express = require('express');

// Import existing shared services
const { EmbeddingService } = require('../../../shared/services/EmbeddingService');
const { SherpaPromptRAG } = require('../../../shared/services/SherpaPromptRAG');
const { GoogleCalendarService } = require('../../../shared/services/GoogleCalendarService');
const { MicrosoftCalendarService } = require('../../../shared/services/MicrosoftCalendarService');
const { CompanyInfoService } = require('../../../shared/services/CompanyInfoService');
const { EmailService } = require('../../../shared/services/EmailService');

// Import multi-tenant services
const { BusinessConfigService } = require('../../../shared/services/BusinessConfigService');
const { tenantContextManager } = require('./twilio-media');

// Import refactored services
const {
  ConversationStateManager,
  UserInfoCollector,
  ConversationFlowHandler,
  AppointmentFlowManager,
  DateTimeParser,
  IntentClassifier,
  ResponseGenerator,
  OpenAIService,
  SuperiorFencingHandler
} = require('../services');

const router = express.Router();

// Initialize multi-tenant services
const businessConfigService = new BusinessConfigService();

// Initialize default services (for backward compatibility)
const openAIService = new OpenAIService();
const embeddingService = new EmbeddingService();
const sherpaPromptRAG = new SherpaPromptRAG();
const googleCalendarService = new GoogleCalendarService();
const microsoftCalendarService = new MicrosoftCalendarService();
const companyInfoService = new CompanyInfoService();
const emailService = new EmailService();

// Initialize refactored services
const stateManager = new ConversationStateManager();
const userInfoCollector = new UserInfoCollector(openAIService);
const dateTimeParser = new DateTimeParser();
const intentClassifier = new IntentClassifier();
const responseGenerator = new ResponseGenerator(openAIService);
const appointmentFlowManager = new AppointmentFlowManager(openAIService, dateTimeParser, responseGenerator);

// Multi-tenant service factory
async function getBusinessServices(sessionId) {
  try {
    // Initialize business config service if needed
    if (!businessConfigService.isInitialized()) {
      await businessConfigService.initialize();
    }

    // Get business ID from session context
    const businessId = tenantContextManager.getBusinessId(sessionId);
    
    if (!businessId) {
      console.warn(`⚠️ [ChainedVoice] No business ID found for session: ${sessionId}, using default services`);
      return {
        businessId: null,
        businessConfig: null,
        embeddingService,
        sherpaPromptRAG,
        googleCalendarService,
        microsoftCalendarService,
        companyInfoService,
        emailService
      };
    }

    // Get business configuration
    const businessConfig = businessConfigService.getBusinessConfig(businessId);
    
    if (!businessConfig) {
      console.error(`❌ [ChainedVoice] Business config not found for: ${businessId}`);
      throw new Error(`Business configuration not found for: ${businessId}`);
    }

    console.log(`🏢 [ChainedVoice] Loading services for business: ${businessId} (${businessConfig.businessName})`);

    // Create business-specific services based on enabled features
    let businessEmbeddingService = null;
    let businessSherpaPromptRAG = null;
    
    // Only create RAG services if enabled for this business
    if (businessConfig.features?.ragEnabled !== false) {
      businessEmbeddingService = EmbeddingService.createForBusiness(businessConfig);
      businessSherpaPromptRAG = new SherpaPromptRAG(); // Uses same instance but with business-specific embedding service
      console.log(`✅ [ChainedVoice] RAG services enabled for business: ${businessId}`);
    } else {
      console.log(`⚠️ [ChainedVoice] RAG services disabled for business: ${businessId}`);
      // Use null services - conversation handler will handle gracefully
      businessEmbeddingService = null;
      businessSherpaPromptRAG = null;
    }

    // Create calendar services based on business configuration and features
    let businessGoogleCalendarService = null;
    let businessMicrosoftCalendarService = null;

    if (businessConfig.features?.appointmentBookingEnabled !== false) {
      if (businessConfig.calendar.provider === 'google' && businessConfig.calendar.google) {
        // Create a combined config with google-specific settings and calendar-level settings like timezone
        const googleCalendarConfig = {
          ...businessConfig.calendar.google,
          timezone: businessConfig.calendar.timezone
        };
        businessGoogleCalendarService = GoogleCalendarService.createForBusiness(googleCalendarConfig);
        console.log(`✅ [ChainedVoice] Google Calendar enabled for business: ${businessId}`);
      }

      if (businessConfig.calendar.provider === 'microsoft' && businessConfig.calendar.microsoft) {
        businessMicrosoftCalendarService = MicrosoftCalendarService.createForBusiness(businessConfig.calendar.microsoft);
        console.log(`✅ [ChainedVoice] Microsoft Calendar enabled for business: ${businessId}`);
      }
    } else {
      console.log(`⚠️ [ChainedVoice] Appointment booking disabled for business: ${businessId}`);
    }
    
    // Create business-specific company info and email services
    const businessCompanyInfoService = CompanyInfoService.createForBusiness(businessConfig.companyInfo);
    const businessEmailService = EmailService.createForBusiness(businessConfig.email);

    return {
      businessId,
      businessConfig,
      embeddingService: businessEmbeddingService || embeddingService, // Fallback to default if disabled
      sherpaPromptRAG: businessSherpaPromptRAG || sherpaPromptRAG, // Fallback to default if disabled
      googleCalendarService: businessGoogleCalendarService || googleCalendarService,
      microsoftCalendarService: businessMicrosoftCalendarService || microsoftCalendarService,
      companyInfoService: businessCompanyInfoService,
      emailService: businessEmailService
    };

  } catch (error) {
    console.error(`❌ [ChainedVoice] Error loading business services:`, error);
    // Fallback to default services
    return {
      businessId: null,
      businessConfig: null,
      embeddingService,
      sherpaPromptRAG,
      googleCalendarService,
      microsoftCalendarService,
      companyInfoService,
      emailService
    };
  }
}

// Helper functions
function getCalendarService(calendarType, businessServices) {
  if (calendarType === 'microsoft') {
    return businessServices.microsoftCalendarService;
  } else {
    return businessServices.googleCalendarService;
  }
}

function extractSearchTerms(text) {
  const sherpaPromptKeywords = [
    'sherpaprompt', 'automation', 'call service', 'transcript', 'voice estimate',
    'app', 'integration', 'pricing', 'demo', 'api', 'workflow', 'ai agent',
    'conversation', 'task', 'estimate', 'prompt', 'orchestration',
    'price', 'cost', 'costs', 'how much', 'expensive', 'affordable',
    'budget', 'fee', 'fees', 'rate', 'rates', 'tier', 'tiers',
    'plan', 'plans', 'subscription', 'monthly', 'yearly', 'annual',
    'payment', 'pay', 'trial', 'free', 'schedule', 'emergency',
    'service', 'area', 'financing', 'quote', 'consultation', 'appointment',
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

/**
 * LEGACY: Speech-to-Text (STT)
 * Kept for backward compatibility
 */
router.post('/transcribe', async (req, res) => {
  try {
    const { audio, sessionId } = req.body;
    
    if (!audio || !sessionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Audio data and session ID are required' 
      });
    }

    console.log('🎙️ [STT] Transcribing audio for session:', sessionId);

    const audioBuffer = Buffer.from(audio, 'base64');
    const transcriptionResult = await openAIService.transcribeAudio(audioBuffer);

    if (!transcriptionResult.success) {
      return res.status(500).json({ 
        success: false, 
        error: 'Transcription failed',
        details: transcriptionResult.error
      });
    }

    console.log('✅ [STT] Transcribed:', transcriptionResult.text);

    res.json({
      success: true,
      text: transcriptionResult.text,
      sessionId
    });

  } catch (error) {
    console.error('❌ [STT] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Transcription failed',
      message: error.message
    });
  }
});

/**
 * Text Processing
 */
router.post('/process', async (req, res) => {
  try {
    const { text, sessionId } = req.body;
    
    if (!text || !sessionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Text and session ID are required' 
      });
    }

    console.log('🤖 [ChainedVoice] Processing request for session:', sessionId);

    // Get business-specific services for this session
    const businessServices = await getBusinessServices(sessionId);

    let result;

    // Check if this is Superior Fencing and use specialized handler
    if (SuperiorFencingHandler.shouldHandle(businessServices.businessId)) {
      console.log('🏢 [ChainedVoice] Using Superior Fencing specialized handler');
      
      const superiorFencingHandler = new SuperiorFencingHandler(
        businessServices.emailService,
        businessServices.companyInfoService,
        openAIService
      );
      
      result = await superiorFencingHandler.processConversation(text, sessionId);
    } else {
      // Use standard conversation flow handler for other businesses
      console.log('🏢 [ChainedVoice] Using standard conversation flow handler');
      
      const businessConversationFlowHandler = new ConversationFlowHandler({
        stateManager,
        userInfoCollector,
        appointmentFlowManager,
        intentClassifier,
        responseGenerator,
        companyInfoService: businessServices.companyInfoService,
        sherpaPromptRAG: businessServices.sherpaPromptRAG,
        embeddingService: businessServices.embeddingService,
        emailService: businessServices.emailService
      });

      // Set helper functions with business services
      const getCalendarServiceForBusiness = (calendarType) => getCalendarService(calendarType, businessServices);
      businessConversationFlowHandler.setHelpers(getCalendarServiceForBusiness, extractSearchTerms);

      // Process conversation with business-specific handler
      result = await businessConversationFlowHandler.processConversation(text, sessionId);
    }

    // Add business context to response
    if (businessServices.businessId) {
      result.businessId = businessServices.businessId;
      result.businessName = businessServices.businessConfig?.businessName;
    }

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }

  } catch (error) {
    console.error('❌ [LLM] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Processing failed',
      message: error.message
    });
  }
});

/**
 * LEGACY: Text-to-Speech (TTS)
 * Kept for backward compatibility
 */
router.post('/synthesize', async (req, res) => {
  try {
    const { text, sessionId } = req.body;
    
    if (!text || !sessionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Text and session ID are required' 
      });
    }

    console.log('🔊 [TTS] Converting to speech for session:', sessionId);

    const synthesisResult = await openAIService.synthesizeText(text);

    if (!synthesisResult.success) {
      return res.status(500).json({ 
        success: false, 
        error: 'Speech synthesis failed',
        details: synthesisResult.error
      });
    }

    console.log('✅ [TTS] Generated audio:', synthesisResult.size, 'bytes');

    res.json({
      success: true,
      audio: synthesisResult.audio,
      sessionId
    });

  } catch (error) {
    console.error('❌ [TTS] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Speech synthesis failed',
      message: error.message
    });
  }
});

// Session cleanup endpoint
router.delete('/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  const result = await conversationFlowHandler.cleanupSession(sessionId);
  res.json({ success: result.success });
});

// Clean up old sessions periodically
setInterval(async () => {
  const cleanedSessions = await conversationFlowHandler.performAutomaticCleanup();
  if (cleanedSessions.length > 0) {
    console.log('🧹 Automatic cleanup completed. Cleaned sessions:', cleanedSessions.length);
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        openAI: {
          configured: openAIService.isConfigured(),
          apiKeyStatus: openAIService.getApiKeyStatus()
        },
        stateManager: {
          activeSessions: stateManager.getSessionCount()
        },
        email: {
          ready: emailService.isReady()
        }
      },
      note: 'Using Realtime WebSocket API for voice conversations'
    };

    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
