// voice-agent/routes/chained-voice-refactored.js
/**
 * OpenAI Chained Voice Agent Implementation
 * Following exact documentation from https://platform.openai.com/docs/guides/voice-agents
 * 
 * Chained Architecture: Audio → STT → Text Processing → TTS → Audio
 * 
 * REFACTORING PHASES COMPLETED:
 * - Phase 1: Extracted Domain Logic into Separate Classes ✅
 * - Phase 2: Created Conversation Flow Handler ✅
 * - Phase 5: Slimmed Down Route Handlers ✅
 */

const express = require('express');
const multer = require('multer');

// Import existing shared services
const { EmbeddingService } = require('../../../shared/services/EmbeddingService');
const { FencingRAG } = require('../../../shared/services/FencingRAG');
const { GoogleCalendarService } = require('../../../shared/services/GoogleCalendarService');
const { MicrosoftCalendarService } = require('../../../shared/services/MicrosoftCalendarService');
const { CompanyInfoService } = require('../../../shared/services/CompanyInfoService');
const { EmailService } = require('../../../shared/services/EmailService');

// Import new refactored services
const { ConversationStateManager } = require('../services/ConversationStateManager');
const { UserInfoCollector } = require('../services/UserInfoCollector');
const { AppointmentFlowManager } = require('../services/AppointmentFlowManager');
const { DateTimeParser } = require('../services/DateTimeParser');
const { IntentClassifier } = require('../services/IntentClassifier');
const { ResponseGenerator } = require('../services/ResponseGenerator');
const { ConversationFlowHandler } = require('../services/ConversationFlowHandler');
const { OpenAIService } = require('../services/OpenAIService');

const router = express.Router();

// Initialize services
const openAIService = new OpenAIService();
const embeddingService = new EmbeddingService();
const fencingRAG = new FencingRAG();
const googleCalendarService = new GoogleCalendarService();
const microsoftCalendarService = new MicrosoftCalendarService();
const companyInfoService = new CompanyInfoService();
const emailService = new EmailService();

// Initialize new refactored services
const stateManager = new ConversationStateManager();
const userInfoCollector = new UserInfoCollector(openAIService);
const dateTimeParser = new DateTimeParser();
const intentClassifier = new IntentClassifier();
const responseGenerator = new ResponseGenerator(openAIService);
const appointmentFlowManager = new AppointmentFlowManager(openAIService, dateTimeParser, responseGenerator);

// Initialize conversation flow handler with all services
const conversationFlowHandler = new ConversationFlowHandler({
  stateManager,
  userInfoCollector,
  appointmentFlowManager,
  intentClassifier,
  responseGenerator,
  companyInfoService,
  fencingRAG,
  embeddingService,
  emailService
});

// Helper functions (extracted from original implementation)
function getCalendarService(calendarType) {
  if (calendarType === 'microsoft') {
    return microsoftCalendarService;
  } else {
    return googleCalendarService; // Default to Google Calendar
  }
}

function extractSearchTerms(text) {
  const fencingKeywords = [
    'fence', 'fencing', 'installation', 'repair', 'maintenance', 
    'cost', 'price', 'material', 'wood', 'vinyl', 'chain link',
    'aluminum', 'steel', 'height', 'permit', 'warranty', 'estimate',
    'gate', 'gates', 'privacy', 'picket', 'ornamental', 'iron',
    'concrete', 'post', 'rail', 'stain', 'painting', 'hours',
    'schedule', 'emergency', 'service', 'area', 'financing',
    'payment', 'quote', 'consultation', 'appointment',
    // Contact and company info keywords
    'phone', 'number', 'call', 'contact', 'reach', 'email', 'address',
    'location', 'office', 'company', 'business', 'hours', 'open',
    'available', 'speak', 'talk', 'representative', 'website', 'areas'
  ];
  
  // Enhanced extraction that includes context and question words
  const textLower = text.toLowerCase();
  const words = textLower.split(/\s+/);
  
  // Extract fencing-related keywords
  const foundKeywords = words.filter(word => 
    fencingKeywords.some(keyword => 
      word.includes(keyword) || keyword.includes(word)
    )
  );
  
  // For questions, include the full question context for better search
  const questionWords = ['how', 'what', 'when', 'where', 'why', 'can', 'do', 'are', 'is', 'will'];
  const isQuestion = questionWords.some(qw => textLower.includes(qw));
  
  if (isQuestion && foundKeywords.length > 0) {
    // For questions, include more context words
    const contextWords = words.filter(word => 
      word.length > 3 && 
      !['the', 'and', 'for', 'are', 'you', 'your', 'can', 'will', 'this', 'that'].includes(word)
    );
    foundKeywords.push(...contextWords.slice(0, 3)); // Add up to 3 context words
  }
  
  // Remove duplicates and return
  return [...new Set(foundKeywords)];
}

// Set helper functions in conversation flow handler
conversationFlowHandler.setHelpers(getCalendarService, extractSearchTerms);

/**
 * STEP 1: Speech-to-Text (STT)
 * Convert audio to text using Whisper
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

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audio, 'base64');

    // Use OpenAI service for transcription
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
 * STEP 2: Text Processing with LLM and Function Calling
 * Process user input, extract info, and generate responses
 * 
 * THIS IS NOW A THIN CONTROLLER - ALL LOGIC MOVED TO ConversationFlowHandler
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

    // Delegate all processing to ConversationFlowHandler
    const result = await conversationFlowHandler.processConversation(text, sessionId);

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
 * STEP 3: Text-to-Speech (TTS)
 * Convert response text to audio
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
    console.log('📝 [TTS] Text:', text.substring(0, 100) + '...');

    // Use OpenAI service for synthesis
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

// Test endpoint for email functionality (unchanged)
router.post('/test-email', async (req, res) => {
  try {
    const { email, name } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email is required for testing' 
      });
    }

    // Create test conversation data
    const testUserInfo = {
      name: name || 'Test User',
      email: email,
      collected: true
    };

    const testConversationHistory = [
      {
        role: 'user',
        content: 'Hi, I need information about fence installation',
        timestamp: new Date()
      },
      {
        role: 'assistant',
        content: 'Hello! I\'d be happy to help you with fence installation information. We offer various materials including wood, vinyl, and chain link fencing.',
        timestamp: new Date()
      },
      {
        role: 'user',
        content: 'What are your prices for wood fencing?',
        timestamp: new Date()
      },
      {
        role: 'assistant',
        content: 'Our wood fencing prices vary based on the type of wood and height. For a standard 6-foot privacy fence, prices typically range from $25-40 per linear foot including installation.',
        timestamp: new Date()
      },
      {
        role: 'user',
        content: 'Can I schedule an appointment?',
        timestamp: new Date()
      },
      {
        role: 'assistant',
        content: 'Absolutely! I can help you schedule an appointment. What date works best for you?',
        timestamp: new Date()
      }
    ];

    const testAppointmentDetails = {
      details: {
        title: 'Fence Consultation',
        date: '2024-12-15',
        time: '14:00',
        timeDisplay: '2:00 PM'
      },
      calendarType: 'Google Calendar'
    };

    // Send test email
    const emailResult = await emailService.sendConversationSummary(
      testUserInfo,
      testConversationHistory,
      testAppointmentDetails
    );

    res.json({
      success: true,
      message: 'Test email sent',
      emailResult,
      testData: {
        userInfo: testUserInfo,
        conversationMessages: testConversationHistory.length,
        hasAppointment: true
      }
    });

  } catch (error) {
    console.error('❌ [Test Email] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test email',
      message: error.message
    });
  }
});

// Test endpoint for email service connectivity (unchanged)
router.get('/test-email-connection', async (req, res) => {
  try {
    const connectionTest = await emailService.testConnection();
    
    res.json({
      success: connectionTest.success,
      emailServiceReady: emailService.isReady(),
      message: connectionTest.success ? 'Email service is working' : connectionTest.error,
      ping: connectionTest.ping || null
    });

  } catch (error) {
    console.error('❌ [Test Email Connection] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test email connection',
      message: error.message
    });
  }
});

// Health check endpoint for refactored services
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
      refactoring: {
        phase1: 'completed - Domain Logic Extracted',
        phase2: 'completed - Conversation Flow Handler Created',
        phase5: 'completed - Route Handlers Slimmed Down'
      }
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
