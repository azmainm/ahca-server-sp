/**
 * Emergency Call Handler Service
 * Handles emergency call routing and responses for businesses that support it
 */
class EmergencyCallHandler {
  constructor() {
    this.emergencyTriggers = [
      '#',
      'emergency',
      'urgent',
      'time-sensitive',
      'asap',
      'right away',
      'immediately'
    ];
  }

  /**
   * Check if user input indicates an emergency
   * @param {string} userInput - The user's input text
   * @returns {boolean} True if emergency detected
   */
  isEmergencyCall(userInput) {
    if (!userInput) return false;
    
    const input = userInput.toLowerCase().trim();
    
    // Check for # symbol (DTMF emergency trigger)
    if (input.includes('#')) {
      console.log('🚨 [EmergencyHandler] Emergency detected: # pressed');
      return true;
    }
    
    // Check for emergency keywords
    const hasEmergencyKeyword = this.emergencyTriggers.some(trigger => 
      input.includes(trigger.toLowerCase())
    );
    
    if (hasEmergencyKeyword) {
      console.log('🚨 [EmergencyHandler] Emergency detected: keyword found in input');
      return true;
    }
    
    return false;
  }

  /**
   * Handle emergency call routing
   * @param {string} businessId - The business ID
   * @param {string} sessionId - The session ID
   * @param {string} userInput - The user's input that triggered emergency
   * @returns {Object} Emergency response object
   */
  handleEmergencyCall(businessId, sessionId, userInput) {
    console.log(`🚨 [EmergencyHandler] Processing emergency call for business: ${businessId}, session: ${sessionId}`);
    
    // Log the emergency trigger for debugging
    console.log(`🚨 [EmergencyHandler] Emergency trigger: "${userInput}"`);
    
    // TODO: Twilio developers need to implement actual call routing here
    // This should transfer the call to the business's emergency line
    // For now, we return a response indicating the call will be routed
    
    const response = {
      success: true,
      isEmergency: true,
      action: 'emergency_routing',
      message: "I understand this is urgent. Let me connect you with our on-call team right away.",
      businessId: businessId,
      sessionId: sessionId,
      timestamp: new Date().toISOString(),
      
      // Instructions for Twilio developers
      twilioInstructions: {
        note: "TWILIO DEVELOPERS: Implement actual call transfer here",
        steps: [
          "1. Use Twilio's <Dial> verb to transfer the call",
          "2. Route to business-specific emergency number",
          "3. Implement fallback if emergency line is busy",
          "4. Log emergency call for tracking"
        ],
        example: "Use TwiML: <Dial>+1234567890</Dial> to transfer call"
      }
    };
    
    // Log emergency call for tracking
    this.logEmergencyCall(businessId, sessionId, userInput);
    
    return response;
  }

  /**
   * Log emergency call for tracking and analytics
   * @param {string} businessId - The business ID
   * @param {string} sessionId - The session ID  
   * @param {string} trigger - What triggered the emergency
   */
  logEmergencyCall(businessId, sessionId, trigger) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type: 'EMERGENCY_CALL',
      businessId: businessId,
      sessionId: sessionId,
      trigger: trigger,
      status: 'ROUTED'
    };
    
    console.log('🚨 [EmergencyHandler] Emergency call logged:', JSON.stringify(logEntry, null, 2));
    
    // TODO: Store in database for tracking and analytics
    // This could be useful for business reporting and system monitoring
  }

  /**
   * Get emergency response message for a specific business
   * @param {string} businessId - The business ID
   * @returns {string} Emergency response message
   */
  getEmergencyResponseMessage(businessId) {
    // Default emergency message
    let message = "I understand this is urgent. Let me connect you with our on-call team right away.";
    
    // Business-specific emergency messages could be added here
    switch (businessId) {
      case 'superior-fencing':
        message = "I understand this is urgent. Let me connect you with our on-call team right away.";
        break;
      case 'sherpaprompt':
        message = "This appears to be an emergency. Let me route you to our priority support line.";
        break;
      default:
        // Use default message
        break;
    }
    
    return message;
  }

  /**
   * Check if business supports emergency handling
   * @param {Object} businessConfig - Business configuration
   * @returns {boolean} True if emergency handling is enabled
   */
  isEmergencyHandlingEnabled(businessConfig) {
    return businessConfig?.features?.emergencyCallHandling === true ||
           businessConfig?.companyInfo?.emergencyContact?.available === true;
  }
}

module.exports = { EmergencyCallHandler };
