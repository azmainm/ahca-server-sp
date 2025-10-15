/**
 * ResponseGenerator - Generates natural language responses
 */

class ResponseGenerator {
  constructor(openAIService) {
    this.openAIService = openAIService;
    
    // Load audience playbooks (safe fallback)
    this.loadAudiencePlaybooks();
  }
  
  /**
   * Load audience playbooks for response customization
   * Safe implementation - won't break if file doesn't exist
   */
  loadAudiencePlaybooks() {
    try {
      // For now, use hardcoded audience keywords due to JSON parsing issues
      // TODO: Fix JSON format in audience_playbooks_1.2.json and load from file
      this.audienceKeywords = {
        developers: ['developer', 'dev', 'programmer', 'code', 'api', 'technical', 'integration', 'sdk', 'webhook'],
        trades: ['contractor', 'construction', 'field', 'job site', 'trades', 'foreman', 'crew', 'estimate', 'invoice'],
        enterprise: ['enterprise', 'corporate', 'company', 'organization', 'business', 'team', 'sso', 'security'],
        marketing: ['marketing', 'content', 'campaign', 'brand', 'social media', 'lead', 'conversion', 'analytics']
      };
      
      console.log('✅ Loaded audience keywords for response customization');
    } catch (error) {
      console.warn('⚠️ Could not load audience playbooks, using default responses:', error.message);
      this.audienceKeywords = {}; // Empty fallback
    }
  }
  
  /**
   * Detect audience type from conversation context
   * Simple keyword-based detection
   */
  detectAudience(conversationHistory = []) {
    const allText = conversationHistory.map(msg => msg.content).join(' ').toLowerCase();
    
    for (const [audience, keywords] of Object.entries(this.audienceKeywords)) {
      if (keywords.some(keyword => allText.includes(keyword))) {
        return audience;
      }
    }
    
    return 'general'; // Default audience
  }
  
  /**
   * Enhance response based on detected audience
   * Safe enhancement - original response is preserved
   */
  enhanceResponseForAudience(response, audience) {
    if (!audience || audience === 'general') {
      return response; // No change for general audience
    }
    
    const audienceEnhancements = {
      developers: " I can also show you our API documentation and integration guides if you're interested in the technical details.",
      trades: " This works great for field work and job sites where hands-free operation is essential.",
      enterprise: " We also offer enterprise features like SSO, advanced security, and dedicated support for larger organizations.",
      marketing: " This can help streamline your content creation and campaign management workflows."
    };
    
    const enhancement = audienceEnhancements[audience];
    return enhancement ? response + enhancement : response;
  }

  /**
   * Format text for better TTS conversion
   * @param {string} text - Text to format
   * @returns {string} Formatted text
   */
  formatForTTS(text) {
    return text
      // Replace equals signs with "is"
      .replace(/\s*=\s*/g, ' is ')
      // Replace dashes in ranges with "to" 
      .replace(/(\d+)\s*[-–—]\s*(\d+)/g, '$1 to $2')
      // Replace time ranges like "12:00 PM - 4:00 PM" with "12:00 PM to 4:00 PM"
      .replace(/(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[-–—]\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/gi, '$1 to $2')
      // Replace dollar signs with "dollars"
      .replace(/\$(\d+)/g, '$1 dollars')
      // Replace & with "and"
      .replace(/\s*&\s*/g, ' and ')
      // Replace @ with "at"
      .replace(/@/g, ' at ')
      // Clean up multiple spaces
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generate goodbye response
   * @param {string} userName - User's name
   * @returns {string} Goodbye response
   */
  generateGoodbyeResponse(userName = 'there') {
    const response = `Thank you, ${userName}! I hope SherpaPrompt can help automate your workflows and turn your conversations into outcomes. Have a great day!`;
    return this.formatForTTS(response);
  }

  /**
   * Generate response for name change confirmation
   * @param {string} oldName - Previous name
   * @param {string} newName - New name
   * @returns {string} Name change confirmation response
   */
  generateNameChangeResponse(oldName, newName) {
    return `Got it! I've updated your name from ${oldName} to ${newName}. Do you have any questions about SherpaPrompt's automation services, or would you like to schedule a demo?`;
  }

  /**
   * Spell out email local part for voice confirmation
   * @param {string} email - Email address
   * @returns {string} Spelled out local part
   */
  spellEmailLocalPart(email) {
    if (!email || !email.includes('@')) {
      return email;
    }
    
    const [localPart, domain] = email.split('@');
    const spelledLocal = localPart.split('').join('-');
    
    return `${spelledLocal} at ${domain}`;
  }

  /**
   * Generate response for email change confirmation
   * @param {string} oldEmail - Previous email
   * @param {string} newEmail - New email
   * @returns {string} Email change confirmation response
   */
  generateEmailChangeResponse(oldEmail, newEmail) {
    const spelledNew = this.spellEmailLocalPart(newEmail);
    return `Perfect! I've updated your email to ${spelledNew}. Is that correct?`;
  }

  /**
   * Generate appointment scheduling start response
   * @returns {string} Appointment start response
   */
  generateAppointmentStartResponse() {
    return "Great! I'd be happy to help you schedule a demo or consultation. First, would you like me to add this to your Google Calendar or Microsoft Calendar? Just say 'Google' or 'Microsoft'.";
  }

  /**
   * Generate calendar selection response
   * @param {string} calendarType - 'google' or 'microsoft'
   * @returns {string} Calendar selection response
   */
  generateCalendarSelectionResponse(calendarType) {
    const calendarName = calendarType === 'microsoft' ? 'Microsoft Calendar' : 'Google Calendar';
    return `Perfect! I'll add it to your ${calendarName}. What type of session would you like? Like a product demo, consultation about call automation, or discussion about integrations?`;
  }

  /**
   * Generate service collection response
   * @param {string} serviceTitle - Selected service title
   * @returns {string} Service collection response
   */
  generateServiceCollectionResponse(serviceTitle) {
    const response = `Perfect! I'll schedule a ${serviceTitle} for you. Please note that all appointments are 30 minutes long and available Monday through Friday from 12:00 PM to 4:00 PM. What date would work best? Please provide the date in format like December 15, 2024 or 2024 dash 12 dash 15.`;
    return this.formatForTTS(response);
  }

  /**
   * Format time slots as ranges for more natural speech
   * @param {Array} slots - Available time slots
   * @returns {string} Formatted time ranges
   */
  formatSlotsAsRanges(slots) {
    if (slots.length === 0) return '';
    if (slots.length === 1) return slots[0].display;
    
    // Group consecutive slots
    const ranges = [];
    let rangeStart = slots[0];
    let rangeLast = slots[0];
    
    for (let i = 1; i < slots.length; i++) {
      const current = slots[i];
      const lastTime = rangeLast.start.split(':');
      const currentTime = current.start.split(':');
      
      const lastMinutes = parseInt(lastTime[0]) * 60 + parseInt(lastTime[1]);
      const currentMinutes = parseInt(currentTime[0]) * 60 + parseInt(currentTime[1]);
      
      // If slots are 30 minutes apart (consecutive), continue range
      if (currentMinutes - lastMinutes === 30) {
        rangeLast = current;
      } else {
        // Range ended, save it
        if (rangeStart === rangeLast) {
          ranges.push(rangeStart.display);
        } else {
          ranges.push(`${rangeStart.display} to ${rangeLast.display}`);
        }
        rangeStart = current;
        rangeLast = current;
      }
    }
    
    // Add the last range
    if (rangeStart === rangeLast) {
      ranges.push(rangeStart.display);
    } else {
      ranges.push(`${rangeStart.display} to ${rangeLast.display}`);
    }
    
    // Format the ranges naturally
    if (ranges.length === 1) {
      return ranges[0];
    } else if (ranges.length === 2) {
      return `${ranges[0]} and ${ranges[1]}`;
    } else {
      const last = ranges.pop();
      return `${ranges.join(', ')}, and ${last}`;
    }
  }

  /**
   * Generate date availability response
   * @param {string} formattedDate - Formatted date string
   * @param {Array} availableSlots - Available time slots
   * @returns {string} Date availability response
   */
  generateDateAvailabilityResponse(formattedDate, availableSlots) {
    const slotsText = this.formatSlotsAsRanges(availableSlots);
    
    if (availableSlots.length === 1) {
      return `Great! ${formattedDate} has one slot available at ${slotsText}. Does that work for you?`;
    } else {
      return `Great! On ${formattedDate}, I have slots available ${slotsText}. Which time works best for you?`;
    }
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
    // Format date in a more natural way if it's in YYYY-MM-DD format
    let dateDisplay = details.date;
    if (details.date && /^\d{4}-\d{2}-\d{2}$/.test(details.date)) {
      const [year, month, day] = details.date.split('-');
      const dateObj = new Date(year, parseInt(month) - 1, parseInt(day));
      dateDisplay = dateObj.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric'
      });
    }
    
    const spelledEmail = this.spellEmailLocalPart(userInfo.email);
    
    const response = `Perfect! I have your ${details.title} scheduled for ${dateDisplay} at ${details.timeDisplay || details.time} with ${userInfo.name} at ${spelledEmail}. Does this look good, or would you like to change anything?`;
    return this.formatForTTS(response);
  }

  /**
   * Generate appointment confirmation response
   * @param {Object} details - Appointment details
   * @param {Object} userInfo - User information
   * @param {string} calendarType - Calendar type
   * @returns {string} Appointment confirmation response
   */
  generateAppointmentConfirmationResponse(details, userInfo, calendarType) {
    // Format date in a more natural way if it's in YYYY-MM-DD format
    let dateDisplay = details.date;
    if (details.date && /^\d{4}-\d{2}-\d{2}$/.test(details.date)) {
      const [year, month, day] = details.date.split('-');
      const dateObj = new Date(year, parseInt(month) - 1, parseInt(day));
      dateDisplay = dateObj.toLocaleDateString('en-US', { 
        weekday: 'long', 
        month: 'long', 
        day: 'numeric'
      });
    }
    
    const calendarName = calendarType === 'microsoft' ? 'Microsoft Calendar' : 'Google Calendar';
    
    return `Perfect! I've scheduled your ${details.title} for ${dateDisplay} at ${details.timeDisplay || details.time}. You'll receive a calendar invite at ${userInfo.email}. Is there anything else I can help you with?`;
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
    return `${baseResponse} Is there anything else you'd like to know, or would you like to schedule a demo?`;
  }

  /**
   * Generate SherpaPrompt product information response
   * @param {string} productArea - Product area (call_service, transcript_service, voice_to_estimate, app)
   * @returns {string} Product information response
   */
  generateProductInfoResponse(productArea) {
    const responses = {
      'call_service': "SherpaPrompt's Call Service Automation handles customer calls with AI agents that can qualify leads, schedule appointments, and integrate with your CRM - all while maintaining natural conversation flow.",
      'transcript_service': "Our Transcript to Task feature extracts action items from meeting recordings and automatically creates tasks in your project management tools like ClickUp, Asana, or Microsoft Planner.",
      'voice_to_estimate': "Voice to Estimate lets you create detailed estimates hands-free using voice commands, perfect for field work where typing isn't practical.",
      'app': "The SherpaPrompt App orchestrates prompts and manages your automation workflows across all our services, giving you complete control over your AI assistants."
    };
    
    return responses[productArea] || "SherpaPrompt turns conversations into outcomes through our four core automation services: Call Service, Transcript to Task, Voice to Estimate, and our orchestration App.";
  }

  /**
   * Generate demo offer response with lead capture
   * @returns {string} Demo offer response
   */
  generateDemoOfferResponse() {
    return "I'd be happy to show you SherpaPrompt in action! To schedule your personalized demo, I'll need to collect a few details. What's the best email address to send you the demo link and calendar invite?";
  }

  /**
   * Generate pricing response
   * @returns {string} Pricing response
   */
  generatePricingResponse() {
    // This method should not be used - pricing should come from RAG system
    // Keeping for backward compatibility but encouraging RAG usage
    return "I don't have specific pricing information available right now. Would you like me to schedule a demo where we can discuss pricing in detail, or would you prefer to speak with our sales team?";
  }

  /**
   * Generate conversational response using OpenAI
   * @param {string} text - User input
   * @param {Array} conversationHistory - Conversation history
   * @param {Object} userInfo - User information
   * @returns {Promise<string>} Generated response
   */
  async generateConversationalResponse(text, conversationHistory = [], userInfo = {}) {
    const systemPrompt = `You're a friendly voice assistant for SherpaPrompt - the automation platform that turns conversations into outcomes. Chat naturally with customers like you're having a real conversation.

User: ${userInfo.name || 'Customer'} (${userInfo.email || 'No email'})

Guidelines:
- Sound conversational and human, not robotic or formal
- Use contractions (I'll, we're, that's, etc.) and casual language
- Answer what they're asking without being overly wordy
- Don't sound like you're reading from a script
- Avoid formal phrases like "I would be happy to assist" - just help them naturally
- If user says goodbye, thank them casually and mention you hope SherpaPrompt can help automate their workflows
- Focus on our four core products: Call Service Automation, Transcript to Task, Voice to Estimate, and SherpaPrompt App`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-6), // Keep last 6 messages for context
    ];

    try {
      const response = await this.openAIService.callOpenAI(messages, 'gpt-5-nano', 3, {
        reasoning: { effort: "minimal" },
        max_output_tokens: 800,
        temperature: 0.7
      });
      
      // Detect audience and enhance response
      const audience = this.detectAudience(conversationHistory);
      const enhancedResponse = this.enhanceResponseForAudience(response, audience);
      
      return enhancedResponse;
    } catch (error) {
      console.error('❌ [ResponseGenerator] OpenAI call failed:', error);
      return "I'm having trouble with my AI service right now. Could you please try again, or visit our website at sherpaprompt.com for more information?";
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

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change. For example:
- "Change service to pricing consultation"
- "Change date to October 20th" 
- "Change time to 2 PM"
- "Change my name to John"
- "Change my email to john@example.com"`;
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
