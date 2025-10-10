/**
 * ConversationFlowHandler - Central orchestrator for conversation flow
 * Phase 2: Coordinates all services and manages conversation state transitions
 */

class ConversationFlowHandler {
  constructor(services) {
    // Inject all required services
    this.stateManager = services.stateManager;
    this.userInfoCollector = services.userInfoCollector;
    this.appointmentFlowManager = services.appointmentFlowManager;
    this.intentClassifier = services.intentClassifier;
    this.responseGenerator = services.responseGenerator;
    this.companyInfoService = services.companyInfoService;
    this.fencingRAG = services.fencingRAG;
    this.embeddingService = services.embeddingService;
    this.emailService = services.emailService;
    
    // Helper functions passed from route
    this.getCalendarService = null;
    this.extractSearchTerms = null;
  }

  /**
   * Set helper functions from route context
   * @param {Function} getCalendarService - Function to get calendar service
   * @param {Function} extractSearchTerms - Function to extract search terms
   */
  setHelpers(getCalendarService, extractSearchTerms) {
    this.getCalendarService = getCalendarService;
    this.extractSearchTerms = extractSearchTerms;
  }

  /**
   * Get appropriate filler phrase for different processing types
   * @param {string} processType - Type of processing (rag_search, appointment_processing, etc.)
   * @returns {string} Appropriate filler phrase
   */
  getFillerPhrase(processType) {
    const fillerPhrases = {
      rag_search: [
        "Looking that up for you",
        "Let me find that information",
        "One moment while I check that"
      ],
      appointment_processing: [
        "Please wait while I process that for you",
        "Let me handle that appointment request",
        "Processing your appointment details",
        "One moment while I set that up"
      ],
      calendar_check: [
        "Checking availability for you",
        "Let me see what times are available",
        "Looking at the calendar"
      ],
      general_processing: [
        "One moment please",
        "Let me process that",
        "Working on that for you"
      ]
    };

    const phrases = fillerPhrases[processType] || fillerPhrases.general_processing;
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  /**
   * Check if query is asking for basic contact info (phone, email, address)
   * @param {string} text - User input text
   * @returns {boolean} True if basic contact query
   */
  isBasicContactQuery(text) {
    const textLower = text.toLowerCase();
    const basicContactKeywords = [
      'phone', 'number', 'call', 'telephone', 'contact number',
      'email', 'address', 'location', 'where are you located',
      'how to reach', 'contact info', 'contact information'
    ];
    return basicContactKeywords.some(keyword => textLower.includes(keyword));
  }

  /**
   * Main conversation processing entry point
   * @param {string} text - User input text
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Object>} Processing result
   */
  async processConversation(text, sessionId) {
    try {
      console.log('🤖 [ConversationFlowHandler] Processing text for session:', sessionId);
      console.log('📝 [ConversationFlowHandler] User input:', text);

      const session = this.stateManager.getSession(sessionId);
      console.log('🔍 [Debug] Session state - userInfo.collected:', session.userInfo.collected, 
                  'awaitingFollowUp:', session.awaitingFollowUp, 
                  'appointmentFlow.active:', session.appointmentFlow.active);
      
      // Add user message to history
      this.stateManager.addMessage(sessionId, 'user', text);

      // Classify user intent
      const intent = this.intentClassifier.classifyIntent(text);
      console.log('🎯 [Intent] Classification:', intent.primaryIntent, 'confidence:', intent.confidence);

      let result;

      // Check for goodbye first (highest priority)
      if (intent.isGoodbye) {
        result = await this.handleGoodbye(sessionId, session);
      }
      // Phase 1: Name/email collection
      else if (!session.userInfo.collected) {
        result = await this.handleUserInfoCollection(text, sessionId, session);
      }
      // Phase 2: Main conversation flow
      else {
        result = await this.handleMainConversation(text, sessionId, session, intent);
      }

      // Add assistant response to history
      this.stateManager.addMessage(sessionId, 'assistant', result.response);

      console.log('✅ [ConversationFlowHandler] Generated response:', result.response);

      return {
        success: true,
        response: result.response,
        sessionId,
        userInfo: session.userInfo,
        hadFunctionCalls: result.hadFunctionCalls || false,
        conversationHistory: session.conversationHistory,
        calendarLink: result.calendarLink || session.lastAppointment?.calendarLink || null,
        appointmentDetails: result.appointmentDetails || session.lastAppointment?.details || null
      };

    } catch (error) {
      console.error('❌ [ConversationFlowHandler] Error:', error);
      return {
        success: false,
        error: 'Processing failed',
        message: error.message
      };
    }
  }

  /**
   * Handle goodbye intent
   * @param {string} sessionId - Session identifier
   * @param {Object} session - Session object
   * @returns {Promise<Object>} Processing result
   */
  async handleGoodbye(sessionId, session) {
    console.log('👋 [Flow] Taking goodbye path');
    const userName = session.userInfo.name || 'there';
    const response = this.responseGenerator.generateGoodbyeResponse(userName);
    
    // Send conversation summary email asynchronously (don't wait for it)
    this.sendConversationSummary(sessionId, session).catch(error => {
      console.error('❌ [Email] Failed to send summary email in goodbye flow:', error);
    });

    return { response, hadFunctionCalls: false };
  }

  /**
   * Handle user info collection (Phase 1)
   * @param {string} text - User input
   * @param {string} sessionId - Session identifier
   * @param {Object} session - Session object
   * @returns {Promise<Object>} Processing result
   */
  async handleUserInfoCollection(text, sessionId, session) {
    console.log('📝 [Flow] Taking name/email collection path');
    
    const result = await this.userInfoCollector.processCollection(text, session.userInfo);
    
    if (result.success) {
      // Update session with new user info
      this.stateManager.updateUserInfo(sessionId, result.userInfo);
      return { response: result.response, hadFunctionCalls: false };
    } else {
      return { response: result.response, hadFunctionCalls: false };
    }
  }

  /**
   * Handle main conversation flow (Phase 2)
   * @param {string} text - User input
   * @param {string} sessionId - Session identifier
   * @param {Object} session - Session object
   * @param {Object} intent - Classified intent
   * @returns {Promise<Object>} Processing result
   */
  async handleMainConversation(text, sessionId, session, intent) {
    console.log('🏢 [Flow] Taking main conversation path (Phase 2)');

    // Handle name/email changes during regular conversation
    if (intent.isNameChange && !this.appointmentFlowManager.isFlowActive(session)) {
      return await this.handleNameChange(text, sessionId, session);
    }
    
    if (intent.isEmailChange && !this.appointmentFlowManager.isFlowActive(session)) {
      return await this.handleEmailChange(text, sessionId, session);
    }

    // Handle active appointment flow
    if (this.appointmentFlowManager.isFlowActive(session) || intent.isAppointmentRequest) {
      return await this.handleAppointmentFlow(text, sessionId, session, intent.isAppointmentRequest);
    }

    // Handle follow-up after previous query
    if (session.awaitingFollowUp) {
      return await this.handleFollowUp(text, sessionId, session, intent);
    }

    // Regular Q&A with RAG
    return await this.handleRegularQA(text, sessionId, session);
  }

  /**
   * Handle name change during conversation
   * @param {string} text - User input
   * @param {string} sessionId - Session identifier
   * @param {Object} session - Session object
   * @returns {Promise<Object>} Processing result
   */
  async handleNameChange(text, sessionId, session) {
    console.log('👤 [Name Change] Detected name change request during conversation');
    
    const result = await this.userInfoCollector.handleNameChange(text);
    
    if (result.success && result.name) {
      const oldName = session.userInfo.name;
      this.stateManager.updateUserInfo(sessionId, { name: result.name });
      const response = this.responseGenerator.generateNameChangeResponse(oldName, result.name);
      return { response, hadFunctionCalls: false };
    } else {
      const response = "I'd be happy to update your name. Could you please tell me what name you'd like me to use? Feel free to spell it out if needed.";
      return { response, hadFunctionCalls: false };
    }
  }

  /**
   * Handle email change during conversation
   * @param {string} text - User input
   * @param {string} sessionId - Session identifier
   * @param {Object} session - Session object
   * @returns {Promise<Object>} Processing result
   */
  async handleEmailChange(text, sessionId, session) {
    console.log('📧 [Email Change] Detected email change request during conversation');
    
    const result = await this.userInfoCollector.handleEmailChange(text);
    
    if (result.success && result.email) {
      const oldEmail = session.userInfo.email;
      this.stateManager.updateUserInfo(sessionId, { email: result.email });
      console.log('📧 [Email Update] Email updated in session:', { 
        sessionId, 
        oldEmail, 
        newEmail: result.email,
        userInfo: session.userInfo 
      });
      const response = this.responseGenerator.generateEmailChangeResponse(oldEmail, result.email);
      return { response, hadFunctionCalls: false };
    } else {
      const response = "I'd be happy to update your email. Could you please spell it out letter by letter for accuracy - for example, 'j-o-h-n at g-m-a-i-l dot c-o-m'?";
      return { response, hadFunctionCalls: false };
    }
  }

  /**
   * Handle appointment flow
   * @param {string} text - User input
   * @param {string} sessionId - Session identifier
   * @param {Object} session - Session object
   * @param {boolean} isAppointmentRequest - Whether this is a new appointment request
   * @returns {Promise<Object>} Processing result
   */
  async handleAppointmentFlow(text, sessionId, session, isAppointmentRequest) {
    console.log('🗓️ [Appointment] Processing appointment request');

    // Initialize flow if new request
    if (isAppointmentRequest && !this.appointmentFlowManager.isFlowActive(session)) {
      const initResult = this.appointmentFlowManager.initializeFlow(session);
      return { 
        response: initResult.response, 
        hadFunctionCalls: false 
      };
    }

    // Set filler phrase for appointment processing
    const fillerPhrase = this.getFillerPhrase('appointment_processing');

    // Process existing flow
    const result = await this.appointmentFlowManager.processFlow(
      session, 
      text, 
      this.getCalendarService
    );

    return {
      response: result.response,
      hadFunctionCalls: false,
      calendarLink: result.calendarLink,
      appointmentDetails: result.appointmentDetails,
      fillerPhrase
    };
  }

  /**
   * Handle follow-up responses
   * @param {string} text - User input
   * @param {string} sessionId - Session identifier
   * @param {Object} session - Session object
   * @param {Object} intent - Classified intent
   * @returns {Promise<Object>} Processing result
   */
  async handleFollowUp(text, sessionId, session, intent) {
    console.log('⏳ [Follow-up] Processing follow-up response');

    // Check if it's an appointment request (even in follow-up)
    if (intent.isAppointmentRequest) {
      console.log('🗓️ [Follow-up → Appointment] Detected appointment request in follow-up');
      this.stateManager.setAwaitingFollowUp(sessionId, false);
      const initResult = this.appointmentFlowManager.initializeFlow(session);
      return { response: initResult.response, hadFunctionCalls: false };
    }

    // Check if it's a basic contact query (even in follow-up)
    if (this.companyInfoService.isCompanyInfoQuery(text) && this.isBasicContactQuery(text)) {
      console.log('🏢 [Follow-up → Company Info] Detected basic contact query in follow-up');
      const baseResponse = this.companyInfoService.getCompanyInfo(text);
      const response = this.responseGenerator.generateFollowUpResponse(
        this.responseGenerator.formatForTTS(baseResponse)
      );
      // Keep awaitingFollowUp = true
      return { response, hadFunctionCalls: false };
    }

    // Check for general follow-up responses
    if (intent.wantsAppointment) {
      this.stateManager.setAwaitingFollowUp(sessionId, false);
      const initResult = this.appointmentFlowManager.initializeFlow(session);
      return { response: initResult.response, hadFunctionCalls: false };
    } else if (intent.wantsMoreQuestions) {
      this.stateManager.setAwaitingFollowUp(sessionId, false);
      const response = "Of course! What else would you like to know about our fencing services?";
      return { response, hadFunctionCalls: false };
    } else {
      // It's a new question - process it normally
      console.log('⏳ [Follow-up → New Question] Processing as new question');
      this.stateManager.setAwaitingFollowUp(sessionId, false);
      return await this.processNewQuestion(text, sessionId, session, true);
    }
  }

  /**
   * Handle regular Q&A
   * @param {string} text - User input
   * @param {string} sessionId - Session identifier
   * @param {Object} session - Session object
   * @returns {Promise<Object>} Processing result
   */
  async handleRegularQA(text, sessionId, session) {
    console.log('📋 [Regular Q&A] Processing regular query');
    return await this.processNewQuestion(text, sessionId, session, false);
  }

  /**
   * Process new question with RAG or company info
   * @param {string} text - User input
   * @param {string} sessionId - Session identifier
   * @param {Object} session - Session object
   * @param {boolean} isFollowUp - Whether this is from follow-up
   * @returns {Promise<Object>} Processing result
   */
  async processNewQuestion(text, sessionId, session, isFollowUp) {
    // Try RAG first for all queries
    console.log('🔍 [RAG] Searching knowledge base for:', text);
    
    // Search knowledge base with RAG
    const searchTerms = this.extractSearchTerms(text);
    let contextInfo = '';
    let hadFunctionCalls = true;
    let fillerPhrase = null;

    if (searchTerms.length > 0) {
      console.log('🔍 [RAG] Searching for:', searchTerms);
      
      // Set filler phrase for RAG search
      fillerPhrase = this.getFillerPhrase('rag_search');
      
      const searchResults = await this.embeddingService.searchSimilarContent(searchTerms.join(' '), 5);
      
      if (searchResults && searchResults.length > 0) {
        contextInfo = this.fencingRAG.formatContext(searchResults);
        console.log('📚 [RAG] Found relevant info from', searchResults.length, 'sources');
      }
    } else {
      // If no specific keywords found, try a general search with the full text
      console.log('🔍 [RAG] No specific keywords found, searching with full text');
      
      // Set filler phrase for general search
      fillerPhrase = this.getFillerPhrase('rag_search');
      
      const searchResults = await this.embeddingService.searchSimilarContent(text, 3);
      
      if (searchResults && searchResults.length > 0) {
        contextInfo = this.fencingRAG.formatContext(searchResults);
        console.log('📚 [RAG] Found relevant info from general search:', searchResults.length, 'sources');
      }
    }

    let response;

    // Generate response with context using FencingRAG
    if (contextInfo) {
      const ragResponse = await this.fencingRAG.generateResponse(text, contextInfo, session.conversationHistory);
      const baseResponse = this.responseGenerator.formatForTTS(ragResponse.answer);
      // Always add follow-up question to RAG responses
      response = this.responseGenerator.generateFollowUpResponse(baseResponse);
    } else {
      // Fallback to company info only for basic contact queries (not service-related)
      if (this.companyInfoService.isCompanyInfoQuery(text) && this.isBasicContactQuery(text)) {
        console.log('🏢 [Company Info] Using company info for basic contact query');
        const baseResponse = this.companyInfoService.getCompanyInfo(text);
        response = this.responseGenerator.generateFollowUpResponse(
          this.responseGenerator.formatForTTS(baseResponse)
        );
        hadFunctionCalls = false;
      } else {
        // If no RAG results and not a basic contact query, ask user to repeat or rephrase
        response = "I don't have specific information about that. Could you please repeat or rephrase your question?";
        hadFunctionCalls = false;
      }
    }

    // Set awaiting follow-up state for RAG responses
    if (contextInfo) {
      this.stateManager.setAwaitingFollowUp(sessionId, true);
    }

    return { 
      response, 
      hadFunctionCalls,
      fillerPhrase // Include filler phrase for immediate TTS playback
    };
  }

  /**
   * Send conversation summary email
   * @param {string} sessionId - Session identifier
   * @param {Object} session - Session object
   * @returns {Promise<Object>} Email result
   */
  async sendConversationSummary(sessionId, session) {
    try {
      // Check if user has provided email
      if (!session.userInfo || !session.userInfo.email || !session.userInfo.collected) {
        console.log('📧 [Email] Skipping email - no user email collected for session:', sessionId);
        return { success: false, reason: 'No user email available' };
      }

      // Check if there's meaningful conversation to summarize
      if (!session.conversationHistory || session.conversationHistory.length < 2) {
        console.log('📧 [Email] Skipping email - insufficient conversation history for session:', sessionId);
        return { success: false, reason: 'Insufficient conversation history' };
      }

      console.log('📧 [Email] Sending conversation summary for session:', sessionId);
      console.log('📧 [Email] User info:', { name: session.userInfo.name, email: session.userInfo.email });
      console.log('📧 [Email] Conversation messages:', session.conversationHistory.length);
      console.log('📧 [Email] Has appointment:', !!session.lastAppointment);

      // Create a fresh copy of user info to ensure we have the latest email
      const currentUserInfo = {
        name: session.userInfo.name,
        email: session.userInfo.email,
        collected: session.userInfo.collected
      };

      console.log('📧 [Email] Using current user info for email:', currentUserInfo);

      // Send the email with the current user info
      const emailResult = await this.emailService.sendConversationSummary(
        currentUserInfo,
        session.conversationHistory,
        session.lastAppointment
      );

      if (emailResult.success) {
        console.log('✅ [Email] Conversation summary sent successfully:', emailResult.messageId);
        return { success: true, messageId: emailResult.messageId };
      } else {
        console.error('❌ [Email] Failed to send conversation summary:', emailResult.error);
        return { success: false, error: emailResult.error };
      }

    } catch (error) {
      console.error('❌ [Email] Error sending conversation summary:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Clean up session
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Object>} Cleanup result
   */
  async cleanupSession(sessionId) {
    const session = this.stateManager.getSession(sessionId);
    
    // Send conversation summary email before deleting session (don't wait for it)
    this.sendConversationSummary(sessionId, session).catch(error => {
      console.error('❌ [Email] Failed to send summary email in session cleanup:', error);
    });
    
    const deleted = this.stateManager.deleteSession(sessionId);
    console.log('🗑️ Session deleted:', sessionId);
    
    return { success: deleted };
  }

  /**
   * Perform automatic cleanup of old sessions
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {Promise<Array>} Array of cleaned session IDs
   */
  async performAutomaticCleanup(maxAge = 30 * 60 * 1000) {
    const sessions = this.stateManager.getAllSessions();
    const cleanedSessions = [];
    
    for (const [sessionId, session] of sessions.entries()) {
      const now = new Date();
      if (now - session.createdAt > maxAge) {
        // Send conversation summary email before cleanup (don't wait for it)
        this.sendConversationSummary(sessionId, session).catch(error => {
          console.error('❌ [Email] Failed to send summary email in automatic cleanup:', error);
        });
        
        this.stateManager.deleteSession(sessionId);
        cleanedSessions.push(sessionId);
        console.log('🧹 Cleaned up old session:', sessionId);
      }
    }
    
    return cleanedSessions;
  }
}

module.exports = { ConversationFlowHandler };
