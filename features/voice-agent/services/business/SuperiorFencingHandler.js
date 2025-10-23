/**
 * Superior Fencing Conversation Handler
 * Specialized handler for Superior Fencing's simple information collection script
 */
class SuperiorFencingHandler {
  constructor(emailService, companyInfoService) {
    this.emailService = emailService;
    this.companyInfoService = companyInfoService;
    
    // Superior Fencing conversation states
    this.states = {
      GREETING: 'greeting',
      COLLECTING_NAME: 'collecting_name',
      CONFIRMING_NAME: 'confirming_name',
      COLLECTING_PHONE: 'collecting_phone',
      COLLECTING_REASON: 'collecting_reason',
      COMPLETED: 'completed'
    };
    
    // Track session states
    this.sessionStates = new Map();
  }

  /**
   * Initialize session for Superior Fencing
   * @param {string} sessionId - Session identifier
   */
  initializeSession(sessionId) {
    this.sessionStates.set(sessionId, {
      state: this.states.GREETING,
      collectedInfo: {
        name: null,
        phone: null,
        reason: null
      },
      nameConfirmed: false,
      startTime: new Date().toISOString()
    });
    
    console.log(`🏢 [SuperiorFencing] Session initialized: ${sessionId}`);
  }

  /**
   * Get session state
   * @param {string} sessionId - Session identifier
   * @returns {Object} Session state
   */
  getSession(sessionId) {
    if (!this.sessionStates.has(sessionId)) {
      this.initializeSession(sessionId);
    }
    return this.sessionStates.get(sessionId);
  }

  /**
   * Process conversation for Superior Fencing
   * @param {string} text - User input
   * @param {string} sessionId - Session identifier
   * @returns {Promise<Object>} Processing result
   */
  async processConversation(text, sessionId) {
    const session = this.getSession(sessionId);
    
    console.log(`🏢 [SuperiorFencing] Processing: "${text}" in state: ${session.state}`);
    
    let response;
    let isComplete = false;

    switch (session.state) {
      case this.states.GREETING:
        response = this.getGreeting();
        session.state = this.states.COLLECTING_NAME;
        break;

      case this.states.COLLECTING_NAME:
        const nameResult = this.extractName(text);
        if (nameResult.name) {
          session.collectedInfo.name = nameResult.name;
          response = `Thanks — I heard you say your name is ${nameResult.name}, is that right?`;
          session.state = this.states.CONFIRMING_NAME;
        } else {
          response = "I didn't catch your name clearly. Could you please tell me your name again?";
        }
        break;

      case this.states.CONFIRMING_NAME:
        if (this.isConfirmation(text)) {
          response = `Great, ${session.collectedInfo.name}. What's the best phone number to reach you at?`;
          session.state = this.states.COLLECTING_PHONE;
          session.nameConfirmed = true;
        } else {
          response = "Could you please spell or restate your name for me?";
          session.state = this.states.COLLECTING_NAME;
          session.collectedInfo.name = null;
        }
        break;

      case this.states.COLLECTING_PHONE:
        const phoneResult = this.extractPhone(text);
        if (phoneResult.phone) {
          session.collectedInfo.phone = phoneResult.phone;
          response = `Got it — I have ${phoneResult.phone}. What's the main reason for your call — for example, a new fence project, a repair, or something else?`;
          session.state = this.states.COLLECTING_REASON;
        } else {
          response = "I didn't catch your phone number clearly. Could you please repeat your phone number?";
        }
        break;

      case this.states.COLLECTING_REASON:
        session.collectedInfo.reason = text.trim();
        response = "Perfect, I'll make sure your message goes straight to the right person on our team. Thanks for contacting Superior Fence & Construction — we appreciate your call.";
        session.state = this.states.COMPLETED;
        isComplete = true;
        
        // Send email summary
        await this.sendLeadEmail(sessionId, session);
        break;

      case this.states.COMPLETED:
        response = "Thank you for your call. Our team will follow up with you soon. Is there anything else I can help you with?";
        break;

      default:
        response = this.getGreeting();
        session.state = this.states.COLLECTING_NAME;
        break;
    }

    return {
      success: true,
      response: response,
      sessionId: sessionId,
      isComplete: isComplete,
      collectedInfo: session.collectedInfo,
      currentState: session.state
    };
  }

  /**
   * Get the greeting message
   * @returns {string} Greeting message
   */
  getGreeting() {
    return "Hi there, I'm Mason, Superior Fence & Construction's virtual assistant. " +
           "If this is an emergency or time-sensitive, please press # now to reach our on-call team. " +
           "Parts of this call may be recorded so we can better understand your needs and improve our service. " +
           "We're currently closed, but I can take a few quick details so our team can follow up first thing in the morning. " +
           "Could I start with your name?";
  }

  /**
   * Extract name from user input
   * @param {string} text - User input
   * @returns {Object} Name extraction result
   */
  extractName(text) {
    // Simple name extraction - look for common patterns
    const cleanText = text.trim().toLowerCase();
    
    // Remove common prefixes
    const prefixes = ['my name is', 'i am', 'i\'m', 'this is', 'it\'s', 'call me'];
    let nameText = cleanText;
    
    for (const prefix of prefixes) {
      if (nameText.startsWith(prefix)) {
        nameText = nameText.substring(prefix.length).trim();
        break;
      }
    }
    
    // Extract potential name (first 1-3 words, capitalized)
    const words = nameText.split(/\s+/).filter(word => word.length > 0);
    if (words.length > 0 && words.length <= 3) {
      const name = words.map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
      
      return { name: name, confidence: 0.8 };
    }
    
    return { name: null, confidence: 0 };
  }

  /**
   * Extract phone number from user input
   * @param {string} text - User input
   * @returns {Object} Phone extraction result
   */
  extractPhone(text) {
    // Look for phone number patterns
    const phoneRegex = /(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/;
    const match = text.match(phoneRegex);
    
    if (match) {
      const phone = `(${match[2]}) ${match[3]}-${match[4]}`;
      return { phone: phone, confidence: 0.9 };
    }
    
    // Try to extract just digits
    const digits = text.replace(/\D/g, '');
    if (digits.length === 10) {
      const phone = `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
      return { phone: phone, confidence: 0.7 };
    }
    
    if (digits.length === 11 && digits.startsWith('1')) {
      const phone = `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
      return { phone: phone, confidence: 0.7 };
    }
    
    return { phone: null, confidence: 0 };
  }

  /**
   * Check if user input is a confirmation
   * @param {string} text - User input
   * @returns {boolean} True if confirmation
   */
  isConfirmation(text) {
    const confirmWords = ['yes', 'yeah', 'yep', 'correct', 'right', 'that\'s right', 'exactly', 'perfect'];
    const denyWords = ['no', 'nope', 'wrong', 'incorrect', 'not right'];
    
    const cleanText = text.toLowerCase().trim();
    
    // Check for denial first
    if (denyWords.some(word => cleanText.includes(word))) {
      return false;
    }
    
    // Check for confirmation
    if (confirmWords.some(word => cleanText.includes(word))) {
      return true;
    }
    
    // Default to confirmation for ambiguous responses
    return true;
  }

  /**
   * Send lead email to the team
   * @param {string} sessionId - Session identifier
   * @param {Object} session - Session data
   */
  async sendLeadEmail(sessionId, session) {
    try {
      const { name, phone, reason } = session.collectedInfo;
      const callTime = new Date(session.startTime).toLocaleString();
      const duration = Math.round((new Date() - new Date(session.startTime)) / 1000 / 60); // minutes
      
      const subject = `New Lead from Superior Fence & Construction - ${name}`;
      const emailBody = `New customer inquiry received:

Name: ${name}
Phone: ${phone}
Reason for call: ${reason}
Call time: ${callTime}
Call duration: ${duration} minutes
Session ID: ${sessionId}

Please follow up with this customer.

---
This lead was collected by Mason, Superior Fence & Construction's virtual assistant.`;

      const emailResult = await this.emailService.sendEmail(
        'doug@sherpaprompt.com', // TODO: Change to Superior Fencing's email when ready
        subject,
        emailBody
      );

      if (emailResult.success) {
        console.log(`✅ [SuperiorFencing] Lead email sent successfully for session: ${sessionId}`);
      } else {
        console.error(`❌ [SuperiorFencing] Failed to send lead email for session: ${sessionId}`, emailResult.error);
      }

    } catch (error) {
      console.error(`❌ [SuperiorFencing] Error sending lead email for session: ${sessionId}`, error);
    }
  }

  /**
   * Check if this business should use Superior Fencing handler
   * @param {string} businessId - Business identifier
   * @returns {boolean} True if Superior Fencing
   */
  static shouldHandle(businessId) {
    return businessId === 'superior-fencing';
  }

  /**
   * Clean up session data
   * @param {string} sessionId - Session identifier
   */
  cleanupSession(sessionId) {
    this.sessionStates.delete(sessionId);
    console.log(`🗑️ [SuperiorFencing] Session cleaned up: ${sessionId}`);
  }
}

module.exports = { SuperiorFencingHandler };
