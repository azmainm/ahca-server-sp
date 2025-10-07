/**
 * ResponseGenerator - Generates natural language responses
 */

class ResponseGenerator {
  constructor(openAIService) {
    this.openAIService = openAIService;
  }

  /**
   * Generate goodbye response
   * @param {string} userName - User's name
   * @returns {string} Goodbye response
   */
  generateGoodbyeResponse(userName = 'there') {
    return `Thank you, ${userName}! I hope you were satisfied with SherpaPrompt AI's service. Have a great day!`;
  }

  /**
   * Generate response for name change confirmation
   * @param {string} oldName - Previous name
   * @param {string} newName - New name
   * @returns {string} Name change confirmation response
   */
  generateNameChangeResponse(oldName, newName) {
    return `Got it! I've updated your name from ${oldName} to ${newName}. How can I help you today?`;
  }

  /**
   * Generate response for email change confirmation
   * @param {string} oldEmail - Previous email
   * @param {string} newEmail - New email
   * @returns {string} Email change confirmation response
   */
  generateEmailChangeResponse(oldEmail, newEmail) {
    return `Perfect! I've updated your email from ${oldEmail} to ${newEmail}. How can I help you today?`;
  }

  /**
   * Generate appointment scheduling start response
   * @returns {string} Appointment start response
   */
  generateAppointmentStartResponse() {
    return "Great! I'd be happy to help you schedule an appointment. First, would you like me to add this to your Google Calendar or Microsoft Calendar? Just say 'Google' or 'Microsoft'.";
  }

  /**
   * Generate calendar selection response
   * @param {string} calendarType - 'google' or 'microsoft'
   * @returns {string} Calendar selection response
   */
  generateCalendarSelectionResponse(calendarType) {
    const calendarName = calendarType === 'microsoft' ? 'Microsoft Calendar' : 'Google Calendar';
    return `Perfect! I'll add it to your ${calendarName}. What type of service are you looking for? Like a fence consultation, repair estimate, or installation quote?`;
  }

  /**
   * Generate service collection response
   * @param {string} serviceTitle - Selected service title
   * @returns {string} Service collection response
   */
  generateServiceCollectionResponse(serviceTitle) {
    return `Perfect! I'll schedule a ${serviceTitle} for you. Please note that all appointments are 30 minutes long and available Monday through Friday from 12:00 PM to 4:00 PM. What date would work best? Please provide the date in format like "December 15, 2024" or "2024-12-15".`;
  }

  /**
   * Generate date availability response
   * @param {string} formattedDate - Formatted date string
   * @param {Array} availableSlots - Available time slots
   * @returns {string} Date availability response
   */
  generateDateAvailabilityResponse(formattedDate, availableSlots) {
    const slotsText = availableSlots.map(slot => slot.display).join(', ');
    return `Great! ${formattedDate} has ${availableSlots.length} available 30-minute slots: ${slotsText}. Which time works best for you?`;
  }

  /**
   * Generate no availability response with alternatives
   * @param {string} requestedDate - Requested date
   * @param {string} nextAvailableDate - Next available date
   * @param {Array} nextAvailableSlots - Next available slots
   * @returns {string} No availability response
   */
  generateNoAvailabilityResponse(requestedDate, nextAvailableDate, nextAvailableSlots) {
    const firstSlots = nextAvailableSlots.slice(0, 3);
    const slotsText = firstSlots.map(slot => slot.display).join(', ');
    
    return `I'm sorry, but ${requestedDate} has no available appointment slots. The next available date is ${nextAvailableDate} with slots at: ${slotsText}. Which time works best for you?`;
  }

  /**
   * Generate appointment review response
   * @param {Object} details - Appointment details
   * @param {Object} userInfo - User information
   * @returns {string} Appointment review response
   */
  generateAppointmentReviewResponse(details, userInfo) {
    return `Perfect! Let me review your appointment details:

Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay || details.time} (30 minutes)
Customer: ${userInfo.name} (${userInfo.email})

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change (service, date, time, name, or email).`;
  }

  /**
   * Generate appointment confirmation response
   * @param {Object} details - Appointment details
   * @param {Object} userInfo - User information
   * @param {string} calendarType - Calendar type
   * @returns {string} Appointment confirmation response
   */
  generateAppointmentConfirmationResponse(details, userInfo, calendarType) {
    const calendarName = calendarType === 'microsoft' ? 'Microsoft Calendar' : 'Google Calendar';
    
    return `Excellent! Your appointment has been scheduled successfully in ${calendarName}. 

Appointment Details:
- Service: ${details.title}  
- Date & Time: ${details.date} at ${details.timeDisplay || details.time}
- Duration: 30 minutes
- Customer: ${userInfo.name} (${userInfo.email})
- Calendar: ${calendarName}

Our team will contact you at ${userInfo.email} to confirm the appointment details and provide any additional information you may need.

Is there anything else I can help you with today?`;
  }

  /**
   * Generate appointment error response
   * @param {string} serviceTitle - Service title
   * @returns {string} Appointment error response
   */
  generateAppointmentErrorResponse(serviceTitle) {
    return `I apologize, but there was an issue creating your calendar appointment. Please call us directly at (303) 555-FENCE to schedule your appointment, or try again later. Our team will be happy to help you schedule your ${serviceTitle}.`;
  }

  /**
   * Generate follow-up question response
   * @param {string} baseResponse - Base response content
   * @returns {string} Response with follow-up question
   */
  generateFollowUpResponse(baseResponse) {
    return `${baseResponse} Is there anything else you'd like to know, or would you like to schedule an appointment?`;
  }

  /**
   * Generate conversational response using OpenAI
   * @param {string} text - User input
   * @param {Array} conversationHistory - Conversation history
   * @param {Object} userInfo - User information
   * @returns {Promise<string>} Generated response
   */
  async generateConversationalResponse(text, conversationHistory = [], userInfo = {}) {
    const systemPrompt = `You're a friendly voice assistant for SherpaPrompt Fencing Company. Chat naturally with customers like you're having a real conversation.

User: ${userInfo.name || 'Customer'} (${userInfo.email || 'No email'})

Guidelines:
- Sound conversational and human, not robotic or formal
- Use contractions (I'll, we're, that's, etc.) and casual language
- Answer what they're asking without being overly wordy
- Don't sound like you're reading from a script
- Avoid formal phrases like "I would be happy to assist" - just help them naturally
- If user says goodbye, thank them casually and mention you hope we could help`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-6), // Keep last 6 messages for context
    ];

    try {
      return await this.openAIService.callOpenAI(messages);
    } catch (error) {
      console.error('❌ [ResponseGenerator] OpenAI call failed:', error);
      return "I'm having trouble with my AI service right now. Could you please try again, or call us at (303) 555-FENCE for immediate assistance?";
    }
  }

  /**
   * Generate error response
   * @param {string} errorType - Type of error
   * @param {string} context - Error context
   * @returns {string} Error response
   */
  generateErrorResponse(errorType, context = '') {
    const errorResponses = {
      'transcription': "I'm having trouble understanding the audio. Could you please try speaking again?",
      'processing': "I'm having trouble processing your request right now. Could you please try again?",
      'synthesis': "I'm having trouble with speech generation. Let me try again.",
      'appointment': "I'm having trouble with the appointment system. Please call us at (303) 555-FENCE to schedule directly.",
      'general': "I'm experiencing some technical difficulties. Please try again or call us at (303) 555-FENCE for assistance."
    };

    const baseResponse = errorResponses[errorType] || errorResponses['general'];
    return context ? `${baseResponse} ${context}` : baseResponse;
  }

  /**
   * Generate clarification request
   * @param {string} topic - Topic needing clarification
   * @returns {string} Clarification request
   */
  generateClarificationRequest(topic) {
    const clarificationRequests = {
      'date': "I'm having trouble understanding that date format. Could you please provide the date like \"December 15, 2024\" or \"2024-12-15\"?",
      'time': "I couldn't match that to one of the available times. Please choose from the available time slots.",
      'service': "I didn't catch what type of service you need. Could you tell me what kind of fencing service you're looking for?",
      'calendar': "I didn't catch that. Would you like to use Google Calendar or Microsoft Calendar for your appointment? Please say 'Google' or 'Microsoft'.",
      'name': "I'd be happy to update your name. Could you please tell me what name you'd like me to use? Feel free to spell it out if needed.",
      'email': "I'd be happy to update your email. Could you please spell it out letter by letter for accuracy - for example, 'j-o-h-n at g-m-a-i-l dot c-o-m'?",
      'general': "I didn't quite catch that. Could you please repeat or rephrase your request?"
    };

    return clarificationRequests[topic] || clarificationRequests['general'];
  }

  /**
   * Generate multiple change confirmation response
   * @param {Array} changes - Array of changes made
   * @param {Object} details - Updated appointment details
   * @param {Object} userInfo - Updated user info
   * @returns {string} Multiple changes confirmation response
   */
  generateMultipleChangesResponse(changes, details, userInfo) {
    const changesList = changes.join(', ');
    return `Perfect! I've updated your ${changesList}. Let me review your appointment details:

Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay || details.time} (30 minutes)
Customer: ${userInfo.name} (${userInfo.email})

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change (service, date, time, name, or email).`;
  }

  /**
   * Generate service area response
   * @returns {string} Service area information
   */
  generateServiceAreaResponse() {
    return "We serve the Denver Metro, Boulder County, Jefferson County, Adams County, and Arapahoe County areas. Is there anything else you'd like to know about our services?";
  }

  /**
   * Generate business hours response
   * @returns {string} Business hours information
   */
  generateBusinessHoursResponse() {
    return "We're open Monday through Friday from 7:00 AM to 6:00 PM, and Saturday from 8:00 AM to 4:00 PM. We're closed on Sunday, but we do provide 24/7 emergency repairs when needed. Is there anything else I can help you with?";
  }

  /**
   * Generate contact information response
   * @returns {string} Contact information
   */
  generateContactInfoResponse() {
    return "You can reach us at (303) 555-FENCE, or email us at info@sherpapromptfencing.com. We're located at 1234 Fence Line Drive, Denver, CO 80202. Is there anything else you'd like to know?";
  }
}

module.exports = { ResponseGenerator };
