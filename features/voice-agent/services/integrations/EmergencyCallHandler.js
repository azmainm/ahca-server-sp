/**
 * Emergency Call Handler Service
 * Handles emergency call routing and responses for businesses that support it
 */
class EmergencyCallHandler {
  constructor() {
    // Only # key triggers emergency - removed keyword triggers to prevent false positives
    this.emergencyTriggers = [
      '#'
    ];
    
    // Initialize Twilio client for call redirection
    this.twilioClient = null;
    this.initializeTwilioClient();
  }

  /**
   * Initialize Twilio client for REST API calls
   */
  initializeTwilioClient() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    if (accountSid && authToken) {
      const twilio = require('twilio');
      this.twilioClient = twilio(accountSid, authToken);
      console.log('✅ [EmergencyHandler] Twilio client initialized');
    } else {
      console.warn('⚠️ [EmergencyHandler] Twilio credentials not found - call transfer will not work');
    }
  }

  /**
   * Check if user input indicates an emergency
   * @param {string} userInput - The user's input text
   * @returns {boolean} True if emergency detected
   */
  isEmergencyCall(userInput) {
    if (!userInput) return false;
    
    const input = userInput.toLowerCase().trim();
    
    // ONLY trigger on # symbol (DTMF emergency trigger)
    // Removed keyword detection to prevent false positives
    if (input.includes('#')) {
      console.log('🚨 [EmergencyHandler] Emergency detected: # pressed');
      return true;
    }
    
    // No keyword detection - only # key triggers emergency
    return false;
  }

  /**
   * Handle emergency call routing
   * @param {string} businessId - The business ID
   * @param {string} sessionId - The session ID
   * @param {string} userInput - The user's input that triggered emergency
   * @param {string} callSid - Twilio Call SID (optional, for call redirection)
   * @param {Object} businessConfig - Business configuration (optional)
   * @returns {Object} Emergency response object
   */
  handleEmergencyCall(businessId, sessionId, userInput, callSid = null, businessConfig = null, baseUrl = null) {
    console.log(`🚨 [EmergencyHandler] Processing emergency call for business: ${businessId}, session: ${sessionId}`);
    
    // Log the emergency trigger for debugging
    console.log(`🚨 [EmergencyHandler] Emergency trigger: "${userInput}"`);
    
    const response = {
      success: true,
      isEmergency: true,
      action: 'emergency_routing',
      message: "I understand this is urgent. Let me connect you with our on-call team right away.",
      businessId: businessId,
      sessionId: sessionId,
      timestamp: new Date().toISOString(),
      shouldTransferCall: true,
      callSid: callSid
    };
    
    // Log emergency call for tracking
    this.logEmergencyCall(businessId, sessionId, userInput);
    
    // If we have a callSid and Twilio client, attempt to redirect the call
    if (callSid && this.twilioClient) {
      this.redirectCallToEmergency(callSid, businessId, businessConfig, baseUrl)
        .then(success => {
          if (success) {
            console.log(`✅ [EmergencyHandler] Call ${callSid} successfully redirected to emergency`);
          } else {
            console.error(`❌ [EmergencyHandler] Failed to redirect call ${callSid}`);
          }
        })
        .catch(error => {
          console.error(`❌ [EmergencyHandler] Error redirecting call ${callSid}:`, error);
        });
    } else {
      if (!callSid) {
        console.warn('⚠️ [EmergencyHandler] No callSid provided - cannot redirect call');
      }
      if (!this.twilioClient) {
        console.warn('⚠️ [EmergencyHandler] Twilio client not initialized - cannot redirect call');
      }
    }
    
    return response;
  }

  /**
   * Redirect an active call to emergency contact using Twilio REST API
   * @param {string} callSid - Twilio Call SID
   * @param {string} businessId - Business ID
   * @param {Object} businessConfig - Business configuration
   * @param {string} baseUrl - Base URL for the server (from request headers)
   * @returns {Promise<boolean>} True if redirect was successful
   */
  async redirectCallToEmergency(callSid, businessId, businessConfig, baseUrl = null) {
    try {
      if (!this.twilioClient) {
        console.error('❌ [EmergencyHandler] Cannot redirect - Twilio client not initialized');
        return false;
      }

      // Check if emergency phone is configured
      const emergencyPhone = businessConfig?.companyInfo?.emergencyContact?.phone;
      if (!emergencyPhone) {
        console.error(`❌ [EmergencyHandler] No emergency phone configured for business: ${businessId}`);
        return false;
      }

      console.log(`🚨 [EmergencyHandler] Redirecting call ${callSid} to emergency transfer endpoint`);

      // Get the base URL for the transfer endpoint
      // Priority: passed baseUrl > env vars > fallback (should never use fallback in production)
      const finalBaseUrl = baseUrl || process.env.BASE_URL || process.env.NGROK_URL || 'https://fallback-error.com';
      const transferUrl = `${finalBaseUrl}/twilio/voice/transfer-emergency?businessId=${businessId}`;

      console.log(`🔗 [EmergencyHandler] Using transfer URL: ${transferUrl}`);

      // Update the call to redirect to our emergency transfer endpoint
      await this.twilioClient.calls(callSid).update({
        url: transferUrl,
        method: 'POST'
      });

      console.log(`✅ [EmergencyHandler] Call ${callSid} redirected to: ${transferUrl}`);
      return true;

    } catch (error) {
      console.error(`❌ [EmergencyHandler] Error redirecting call ${callSid}:`, error.message);
      return false;
    }
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
