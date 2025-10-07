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
      appointmentDetails: result.appointmentDetails
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

    // Check if it's a company info query (even in follow-up)
    if (this.companyInfoService.isCompanyInfoQuery(text)) {
      console.log('🏢 [Follow-up → Company Info] Detected company info query in follow-up');
      const response = this.responseGenerator.generateFollowUpResponse(
        this.companyInfoService.getCompanyInfo(text)
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
    // Check if this is a company info query first
    console.log('🔍 [Company Info] Checking if query is company info:', text);
    if (this.companyInfoService.isCompanyInfoQuery(text)) {
      console.log('🏢 [Company Info] Detected company information query');
      const baseResponse = this.companyInfoService.getCompanyInfo(text);
      const response = this.responseGenerator.generateFollowUpResponse(baseResponse);
      this.stateManager.setAwaitingFollowUp(sessionId, true);
      return { response, hadFunctionCalls: false };
    }

    console.log('🚫 [Company Info] Not a company info query, proceeding to RAG');

    // Search knowledge base with RAG
    const searchTerms = this.extractSearchTerms(text);
    let contextInfo = '';
    let hadFunctionCalls = true;

    if (searchTerms.length > 0) {
      console.log('🔍 [RAG] Searching for:', searchTerms);
      const searchResults = await this.embeddingService.searchSimilarContent(searchTerms.join(' '), 5);
      
      if (searchResults && searchResults.length > 0) {
        contextInfo = this.fencingRAG.formatContext(searchResults);
        console.log('📚 [RAG] Found relevant info from', searchResults.length, 'sources');
      }
    } else {
      // If no specific keywords found, try a general search with the full text
      console.log('🔍 [RAG] No specific keywords found, searching with full text');
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
      response = ragResponse.answer;
    } else {
      // Fallback to company info if no RAG results
      if (this.companyInfoService.isCompanyInfoQuery(text)) {
        response = this.companyInfoService.getCompanyInfo(text);
        hadFunctionCalls = false;
      } else {
        // Final fallback to basic conversational response
        response = await this.responseGenerator.generateConversationalResponse(
          text, 
          session.conversationHistory, 
          session.userInfo
        );
        hadFunctionCalls = false;
      }
    }

    // Add follow-up question after first complete response (if not already in follow-up)
    if (!isFollowUp && !session.awaitingFollowUp && 
        session.conversationHistory.filter(msg => msg.role === 'assistant').length === 0) {
      response = this.responseGenerator.generateFollowUpResponse(response);
      this.stateManager.setAwaitingFollowUp(sessionId, true);
    } else if (isFollowUp) {
      response = this.responseGenerator.generateFollowUpResponse(response);
      this.stateManager.setAwaitingFollowUp(sessionId, true);
    }

    return { response, hadFunctionCalls };
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
