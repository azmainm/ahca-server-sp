/**
 * AppointmentFlowManager - Manages appointment booking state machine
 */

class AppointmentFlowManager {
  constructor(openAIService, dateTimeParser, responseGenerator) {
    this.openAIService = openAIService;
    this.dateTimeParser = dateTimeParser;
    this.responseGenerator = responseGenerator;
    
    // Appointment flow steps
    this.steps = {
      NONE: 'none',
      SELECT_CALENDAR: 'select_calendar',
      COLLECT_TITLE: 'collect_title',
      COLLECT_DATE: 'collect_date',
      COLLECT_TIME: 'collect_time',
      REVIEW: 'review',
      CONFIRM: 'confirm',
      COLLECT_NAME: 'collect_name',
      COLLECT_EMAIL: 'collect_email',
      CONFIRM_EMAIL: 'confirm_email'
    };

    // Review confirmation patterns
    this.confirmationPatterns = [
      /sounds good/i, /good/i, /correct/i, /yes/i, /confirm/i, 
      /schedule/i, /book/i, /go ahead/i, /looks good/i, /perfect/i
    ];

    // Change request patterns
    this.changePatterns = {
      service: /change.*service/i,
      date: /change.*date/i,
      time: /change.*time/i,
      name: /change.*name/i,
      email: /change.*email|update.*email|my email.*is|actually.*email|correct.*email|wrong.*email|email.*should.*be|email.*address.*is|the email.*is/i
    };

    // Direct change patterns (with new values in same message)
    this.directChangePatterns = {
      service: /change.*service.*to\s+(.+)|service.*should.*be\s+(.+)|make.*it\s+(.+)\s+instead/i,
      date: /change.*date.*to\s+(.+)|date.*should.*be\s+(.+)|make.*it\s+(.+)\s+instead/i,
      time: /change.*time.*to\s+(.+)|time.*should.*be\s+(.+)|make.*it\s+(.+)\s+instead/i,
      name: /change.*name.*to\s+(.+)|name.*should.*be\s+(.+)|call.*me\s+(.+)/i,
      email: /change.*email.*to\s+(.+)|email.*should.*be\s+(.+)|my email.*is\s+(.+)|actually.*email.*is\s+(.+)|correct.*email.*is\s+(.+)|email.*address.*is\s+(.+)|the email.*is\s+(.+)/i
    };
  }

  /**
   * Initialize appointment flow
   * @param {Object} session - Session object
   * @returns {Object} Flow initialization result
   */
  initializeFlow(session) {
    session.appointmentFlow = {
      active: true,
      step: this.steps.SELECT_CALENDAR,
      details: {},
      calendarType: null
    };
    session.awaitingFollowUp = false;

    // Check if we need to collect name/email first
    if (!session.userInfo.name) {
      session.appointmentFlow.step = this.steps.COLLECT_NAME;
      return {
        success: true,
        response: "Great! I'd be happy to help you schedule a demo. First, what's your name?",
        step: this.steps.COLLECT_NAME
      };
    } else if (!session.userInfo.email) {
      session.appointmentFlow.step = this.steps.COLLECT_EMAIL;
      return {
        success: true,
        response: `Perfect, ${session.userInfo.name}! What's your email address? Please spell it out for accuracy - for example, 'j-o-h-n at g-m-a-i-l dot c-o-m'.`,
        step: this.steps.COLLECT_EMAIL
      };
    }

    return {
      success: true,
      response: this.responseGenerator.generateAppointmentStartResponse(),
      step: this.steps.SELECT_CALENDAR
    };
  }

  /**
   * Process appointment flow based on current step
   * @param {Object} session - Session object
   * @param {string} text - User input
   * @param {Function} getCalendarService - Function to get calendar service
   * @returns {Promise<Object>} Processing result
   */
  async processFlow(session, text, getCalendarService) {
    const { step, details } = session.appointmentFlow;

    try {
      switch (step) {
        case this.steps.SELECT_CALENDAR:
          return this.handleCalendarSelection(session, text);
          
        case this.steps.COLLECT_TITLE:
          return await this.handleServiceCollection(session, text);
          
        case this.steps.COLLECT_DATE:
          return await this.handleDateCollection(session, text, getCalendarService);
          
        case this.steps.COLLECT_TIME:
          return await this.handleTimeCollection(session, text);
          
        case this.steps.REVIEW:
          return await this.handleReview(session, text, getCalendarService);
          
        case this.steps.COLLECT_NAME:
          return await this.handleNameCollection(session, text);
          
        case this.steps.COLLECT_EMAIL:
          return await this.handleEmailCollection(session, text);
          
        case this.steps.CONFIRM_EMAIL:
          return await this.handleEmailConfirmation(session, text);
          
        case this.steps.CONFIRM:
          return await this.handleConfirmation(session, text, getCalendarService);
          
        default:
          return this.handleUnknownStep(session);
      }
    } catch (error) {
      console.error('❌ [AppointmentFlowManager] Error processing flow:', error);
      return this.handleFlowError(session, error);
    }
  }

  /**
   * Handle calendar selection step
   * @param {Object} session - Session object
   * @param {string} text - User input
   * @returns {Object} Processing result
   */
  handleCalendarSelection(session, text) {
    const calendarChoice = text.toLowerCase().trim();
    
    if (calendarChoice.includes('google')) {
      session.appointmentFlow.calendarType = 'google';
      session.appointmentFlow.step = this.steps.COLLECT_TITLE;
      return {
        success: true,
        response: this.responseGenerator.generateCalendarSelectionResponse('google'),
        step: this.steps.COLLECT_TITLE
      };
    } else if (calendarChoice.includes('microsoft') || calendarChoice.includes('outlook')) {
      session.appointmentFlow.calendarType = 'microsoft';
      session.appointmentFlow.step = this.steps.COLLECT_TITLE;
      return {
        success: true,
        response: this.responseGenerator.generateCalendarSelectionResponse('microsoft'),
        step: this.steps.COLLECT_TITLE
      };
    } else {
      return {
        success: true,
        response: this.responseGenerator.generateClarificationRequest('calendar'),
        step: this.steps.SELECT_CALENDAR
      };
    }
  }

  /**
   * Handle service collection step
   * @param {Object} session - Session object
   * @param {string} text - User input
   * @returns {Promise<Object>} Processing result
   */
  async handleServiceCollection(session, text) {
    try {
      const serviceTitle = await this.extractServiceType(text);
      session.appointmentFlow.details.title = serviceTitle;
      
      // Check if we already have date/time information
      const { details } = session.appointmentFlow;
      if (details.date && details.time) {
        session.appointmentFlow.step = this.steps.REVIEW;
        return {
          success: true,
          response: this.responseGenerator.generateAppointmentReviewResponse(details, session.userInfo),
          step: this.steps.REVIEW
        };
      } else {
        session.appointmentFlow.step = this.steps.COLLECT_DATE;
        return {
          success: true,
          response: this.responseGenerator.generateServiceCollectionResponse(serviceTitle),
          step: this.steps.COLLECT_DATE
        };
      }
    } catch (error) {
      console.error('❌ [AppointmentFlowManager] Service extraction failed:', error);
      return {
        success: true,
        response: this.responseGenerator.generateClarificationRequest('service'),
        step: this.steps.COLLECT_TITLE
      };
    }
  }

  /**
   * Handle date collection step
   * @param {Object} session - Session object
   * @param {string} text - User input
   * @param {Function} getCalendarService - Function to get calendar service
   * @returns {Promise<Object>} Processing result
   */
  async handleDateCollection(session, text, getCalendarService) {
    const dateResult = this.dateTimeParser.parseDateFromText(text);
    
    if (!dateResult.success) {
      return {
        success: true,
        response: this.responseGenerator.generateClarificationRequest('date'),
        step: this.steps.COLLECT_DATE
      };
    }
    
    // Check availability
    const calendarService = getCalendarService(session.appointmentFlow.calendarType);
    const slotsResult = await calendarService.findAvailableSlots(dateResult.date);
    
    if (!slotsResult.success) {
      return {
        success: true,
        response: this.responseGenerator.generateErrorResponse('appointment', 'Please try another date or contact us for assistance.'),
        step: this.steps.COLLECT_DATE
      };
    }
    
    if (slotsResult.availableSlots.length === 0) {
      // Find next available date
      const nextAvailable = await calendarService.findNextAvailableSlot(dateResult.date);
      
      if (nextAvailable.success) {
        session.appointmentFlow.details.date = nextAvailable.date;
        session.appointmentFlow.details.availableSlots = nextAvailable.availableSlots;
        session.appointmentFlow.step = this.steps.COLLECT_TIME;
        
        return {
          success: true,
          response: this.responseGenerator.generateNoAvailabilityResponse(
            dateResult.formatted, 
            nextAvailable.formattedDate, 
            nextAvailable.availableSlots
          ),
          step: this.steps.COLLECT_TIME
        };
      } else {
        return {
          success: true,
          response: `I'm sorry, but ${dateResult.formatted} has no available slots, and I couldn't find any available appointments in the next two weeks. Please contact us to discuss alternative scheduling options.`,
          step: this.steps.COLLECT_DATE
        };
      }
    }
    
    // Store date and available slots
    session.appointmentFlow.details.date = dateResult.date;
    session.appointmentFlow.details.availableSlots = slotsResult.availableSlots;
    session.appointmentFlow.step = this.steps.COLLECT_TIME;
    
    return {
      success: true,
      response: this.responseGenerator.generateDateAvailabilityResponse(dateResult.formatted, slotsResult.availableSlots),
      step: this.steps.COLLECT_TIME
    };
  }

  /**
   * Handle time collection step
   * @param {Object} session - Session object
   * @param {string} text - User input
   * @returns {Object} Processing result
   */
  async handleTimeCollection(session, text) {
    const { details } = session.appointmentFlow;
    
    // Check if user is providing a different date instead of time
    if (this.dateTimeParser.containsDatePatterns(text)) {
      session.appointmentFlow.step = this.steps.COLLECT_DATE;
      const serviceTitle = details.title;
      session.appointmentFlow.details = { title: serviceTitle };
      return {
        success: true,
        response: `I understand you'd like to change the date. What date would work best for your ${serviceTitle}? Please provide the date in format like December 15, 2025 or 2025 dash 12 dash 15.`,
        step: this.steps.COLLECT_DATE
      };
    }
    
    // Check if user is asking for a different date (more flexible patterns)
    const dateChangePatterns = [
      /can we do.*?(\w+day|\d+)/i,
      /what about.*?(\w+day|\d+)/i,
      /how about.*?(\w+day|\d+)/i,
      /i want.*?(\w+day|\d+)/i,
      /i would like.*?(\w+day|\d+)/i,
      /let's do.*?(\w+day|\d+)/i,
      /set.*?date.*?(\w+day|\d+)/i
    ];
    
    const isDateChange = dateChangePatterns.some(pattern => pattern.test(text));
    if (isDateChange) {
      session.appointmentFlow.step = this.steps.COLLECT_DATE;
      const serviceTitle = details.title;
      session.appointmentFlow.details = { title: serviceTitle };
      return {
        success: true,
        response: `I understand you'd like to change the date. What date would work best for your ${serviceTitle}? Please provide the date in format like December 15, 2025 or 2025 dash 12 dash 15.`,
        step: this.steps.COLLECT_DATE
      };
    }
    
    // Find the selected time slot
    const selectedSlot = this.dateTimeParser.findSelectedTimeSlot(text, details.availableSlots);
    
    if (!selectedSlot) {
      const slotsText = details.availableSlots.map(slot => slot.display).join(', ');
      return {
        success: true,
        response: `I couldn't match that to one of the available times. Please choose from: ${slotsText}`,
        step: this.steps.COLLECT_TIME
      };
    }
    
    details.time = selectedSlot.start;
    details.timeDisplay = selectedSlot.display;
    session.appointmentFlow.step = this.steps.REVIEW;
    
    return {
      success: true,
      response: this.responseGenerator.generateAppointmentReviewResponse(details, session.userInfo),
      step: this.steps.REVIEW
    };
  }

  /**
   * Handle review step
   * @param {Object} session - Session object
   * @param {string} text - User input
   * @param {Function} getCalendarService - Function to get calendar service
   * @returns {Promise<Object>} Processing result
   */
  async handleReview(session, text, getCalendarService) {
    const { details } = session.appointmentFlow;
    
    // Check for direct changes with new values in the same message
    const directChanges = await this.processDirectChanges(session, text, getCalendarService);
    if (directChanges.hasChanges) {
      return directChanges.result;
    }
    
    // Check for confirmation
    if (this.confirmationPatterns.some(pattern => pattern.test(text))) {
      return await this.createAppointment(session, getCalendarService);
    }
    
    // Check for individual change requests
    for (const [changeType, pattern] of Object.entries(this.changePatterns)) {
      if (pattern.test(text)) {
        return this.handleChangeRequest(session, changeType);
      }
    }
    
    return {
      success: true,
      response: `I didn't catch what you'd like to change. Please say "sounds good" to confirm the appointment, or tell me specifically what you'd like to change: "service", "date", "time", "name", or "email". and what you'd like to change it to.`,
      step: this.steps.REVIEW
    };
  }

  /**
   * Process direct changes (changes with new values in same message)
   * @param {Object} session - Session object
   * @param {string} text - User input
   * @param {Function} getCalendarService - Function to get calendar service
   * @returns {Promise<Object>} Processing result
   */
  async processDirectChanges(session, text, getCalendarService) {
    const changesApplied = [];
    const { details } = session.appointmentFlow;
    
    // Check for direct service change
    const serviceMatch = text.match(this.directChangePatterns.service);
    if (serviceMatch) {
      const newService = (serviceMatch[1] || serviceMatch[2] || serviceMatch[3]).trim();
      const extractedService = await this.extractServiceType(newService);
      details.title = extractedService;
      changesApplied.push(`service to ${extractedService}`);
    }
    
    // Check for direct date change
    const dateMatch = text.match(this.directChangePatterns.date);
    if (dateMatch) {
      const newDateText = (dateMatch[1] || dateMatch[2] || dateMatch[3]).trim();
      const dateResult = this.dateTimeParser.parseDateFromText(newDateText);
      
      if (dateResult.success) {
        const calendarService = getCalendarService(session.appointmentFlow.calendarType);
        const slotsResult = await calendarService.findAvailableSlots(dateResult.date);
        
        if (slotsResult.success && slotsResult.availableSlots.length > 0) {
          details.date = dateResult.date;
          details.availableSlots = slotsResult.availableSlots;
          
          // Check if current time is still available
          const timeStillAvailable = slotsResult.availableSlots.some(slot => slot.start === details.time);
          if (!timeStillAvailable) {
            delete details.time;
            delete details.timeDisplay;
            session.appointmentFlow.step = this.steps.COLLECT_TIME;
            const slotsText = slotsResult.availableSlots.map(slot => slot.display).join(', ');
            return {
              hasChanges: true,
              result: {
                success: true,
                response: `Perfect! I've updated your date to ${dateResult.formatted}. Your previous time is no longer available. Here are the available times: ${slotsText}. Which time works best for you?`,
                step: this.steps.COLLECT_TIME
              }
            };
          }
          
          changesApplied.push(`date to ${dateResult.formatted}`);
        }
      }
    }
    
    // Check for direct time change
    const timeMatch = text.match(this.directChangePatterns.time);
    if (timeMatch && details.availableSlots) {
      const newTimeText = (timeMatch[1] || timeMatch[2] || timeMatch[3]).trim();
      const selectedSlot = this.dateTimeParser.findSelectedTimeSlot(newTimeText, details.availableSlots);
      
      if (selectedSlot) {
        details.time = selectedSlot.start;
        details.timeDisplay = selectedSlot.display;
        changesApplied.push(`time to ${selectedSlot.display}`);
      }
    }
    
    // Check for direct name change
    const nameMatch = text.match(this.directChangePatterns.name);
    if (nameMatch) {
      const newNameText = (nameMatch[1] || nameMatch[2] || nameMatch[3]).trim();
      const extractedName = await this.extractName(newNameText);
      if (extractedName) {
        session.userInfo.name = extractedName;
        changesApplied.push(`name to ${extractedName}`);
      }
    }
    
    // Check for direct email change
    const emailMatch = text.match(this.directChangePatterns.email);
    if (emailMatch) {
      const newEmailText = (emailMatch[1] || emailMatch[2]).trim();
      const extractedEmail = await this.extractEmail(newEmailText);
      if (extractedEmail) {
        session.userInfo.email = extractedEmail;
        changesApplied.push(`email to ${extractedEmail}`);
      }
    }
    
    if (changesApplied.length > 0) {
      return {
        hasChanges: true,
        result: {
          success: true,
          response: this.responseGenerator.generateMultipleChangesResponse(changesApplied, details, session.userInfo),
          step: this.steps.REVIEW
        }
      };
    }
    
    return { hasChanges: false };
  }

  /**
   * Handle individual change requests
   * @param {Object} session - Session object
   * @param {string} changeType - Type of change requested
   * @returns {Object} Processing result
   */
  handleChangeRequest(session, changeType) {
    const { details } = session.appointmentFlow;
    
    switch (changeType) {
      case 'service':
        const currentDate = details.date;
        const currentTime = details.time;
        const currentTimeDisplay = details.timeDisplay;
        const currentAvailableSlots = details.availableSlots;
        
        session.appointmentFlow.step = this.steps.COLLECT_TITLE;
        session.appointmentFlow.details = {
          ...(currentDate && { date: currentDate }),
          ...(currentTime && { time: currentTime }),
          ...(currentTimeDisplay && { timeDisplay: currentTimeDisplay }),
          ...(currentAvailableSlots && { availableSlots: currentAvailableSlots })
        };
        
        return {
          success: true,
          response: "No problem! What type of session would you like? For example: product demo, consultation about automation, or discussion about integrations.",
          step: this.steps.COLLECT_TITLE
        };
        
      case 'date':
        session.appointmentFlow.step = this.steps.COLLECT_DATE;
        const serviceTitle = details.title;
        session.appointmentFlow.details = { title: serviceTitle };
        
        return {
          success: true,
          response: this.responseGenerator.formatForTTS(`No problem! What date would work best for your ${serviceTitle}? Please provide the date in format like December 15, 2025 or 2025 dash 12 dash 15.`),
          step: this.steps.COLLECT_DATE
        };
        
      case 'time':
        session.appointmentFlow.step = this.steps.COLLECT_TIME;
        const appointmentDate = details.date;
        const availableSlots = details.availableSlots;
        session.appointmentFlow.details = { 
          title: details.title, 
          date: appointmentDate, 
          availableSlots: availableSlots 
        };
        const slotsText = availableSlots.map(slot => slot.display).join(', ');
        
        return {
          success: true,
          response: `No problem! Here are the available times for ${appointmentDate}: ${slotsText}. Which time works best for you?`,
          step: this.steps.COLLECT_TIME
        };
        
      case 'name':
        session.appointmentFlow.step = this.steps.COLLECT_NAME;
        return {
          success: true,
          response: "No problem! What name should I use for this appointment? Feel free to spell it out if it's unusual.",
          step: this.steps.COLLECT_NAME
        };
        
      case 'email':
        session.appointmentFlow.step = this.steps.COLLECT_EMAIL;
        return {
          success: true,
          response: "No problem! What email address should I use for this appointment? Please spell it out letter by letter for accuracy - for example, 'j-o-h-n at g-m-a-i-l dot c-o-m'.",
          step: this.steps.COLLECT_EMAIL
        };
        
      default:
        return {
          success: true,
          response: this.responseGenerator.generateClarificationRequest('general'),
          step: this.steps.REVIEW
        };
    }
  }

  /**
   * Handle name collection step
   * @param {Object} session - Session object
   * @param {string} text - User input
   * @returns {Promise<Object>} Processing result
   */
  async handleNameCollection(session, text) {
    try {
      const extractedName = await this.extractName(text);
      if (extractedName) {
        session.userInfo.name = extractedName;
      } else {
        session.userInfo.name = text.trim();
      }
      
      // Check if we need email next
      if (!session.userInfo.email) {
        session.appointmentFlow.step = this.steps.COLLECT_EMAIL;
        return {
          success: true,
          response: `Perfect, ${session.userInfo.name}! What's your email address? Please spell it out for accuracy - for example, 'j-o-h-n at gmail dot com'.`,
          step: this.steps.COLLECT_EMAIL
        };
      }
      
      // If appointment details exist, go to review; otherwise continue with calendar selection
      const { details } = session.appointmentFlow;
      if (details.title && details.date && details.time) {
        session.appointmentFlow.step = this.steps.REVIEW;
        return {
          success: true,
          response: this.responseGenerator.generateAppointmentReviewResponse(details, session.userInfo),
          step: this.steps.REVIEW
        };
      } else {
        // Continue with normal flow
        session.appointmentFlow.step = this.steps.SELECT_CALENDAR;
        return {
          success: true,
          response: this.responseGenerator.generateAppointmentStartResponse(),
          step: this.steps.SELECT_CALENDAR
        };
      }
    } catch (error) {
      console.error('❌ [AppointmentFlowManager] Name extraction failed:', error);
      session.userInfo.name = text.trim();
      
      // Check if we need email next
      if (!session.userInfo.email) {
        session.appointmentFlow.step = this.steps.COLLECT_EMAIL;
        return {
          success: true,
          response: `Perfect, ${session.userInfo.name}! What's your email address? Please spell it out for accuracy.`,
          step: this.steps.COLLECT_EMAIL
        };
      }
      
      // Continue with normal flow
      session.appointmentFlow.step = this.steps.SELECT_CALENDAR;
      return {
        success: true,
        response: this.responseGenerator.generateAppointmentStartResponse(),
        step: this.steps.SELECT_CALENDAR
      };
    }
  }

  /**
   * Handle email collection step
   * @param {Object} session - Session object
   * @param {string} text - User input
   * @returns {Promise<Object>} Processing result
   */
  async handleEmailCollection(session, text) {
    try {
      const extractedEmail = await this.extractEmail(text);
      if (extractedEmail) {
        session.userInfo.email = extractedEmail;
        
        // Spell back the email for confirmation
        const spelledEmail = this.spellEmailLocalPart(session.userInfo.email);
        
        // Go to email confirmation step
        session.appointmentFlow.step = this.steps.CONFIRM_EMAIL;
        return {
          success: true,
          response: `Thanks! I've got your email as ${spelledEmail}. Is that correct, or would you like to change it?`,
          step: this.steps.CONFIRM_EMAIL
        };
      } else {
        // No valid email found, ask again
        console.log('❌ [Email Collection] No valid email found in:', text);
        return {
          success: true,
          response: this.responseGenerator.generateClarificationRequest('email'),
          step: this.steps.COLLECT_EMAIL
        };
      }
    } catch (error) {
      console.error('❌ [AppointmentFlowManager] Email extraction failed:', error);
      // Ask for email again on error
      return {
        success: true,
        response: this.responseGenerator.generateClarificationRequest('email'),
        step: this.steps.COLLECT_EMAIL
      };
    }
  }

  /**
   * Handle email confirmation step
   * @param {Object} session - Session object
   * @param {string} text - User input
   * @returns {Promise<Object>} Processing result
   */
  async handleEmailConfirmation(session, text) {
    const confirmPatterns = [/yes/i, /correct/i, /that'?s? right/i, /good/i, /ok/i, /okay/i, /sounds good/i, /perfect/i, /looks good/i];
    const changePatterns = [/no/i, /wrong/i, /incorrect/i, /change/i, /update/i, /fix/i, /different/i, /not right/i];

    if (confirmPatterns.some(pattern => pattern.test(text))) {
      // Email confirmed, proceed to next step
      const { details } = session.appointmentFlow;
      
      // If appointment details exist, go to review; otherwise continue with calendar selection
      if (details.title && details.date && details.time) {
        session.appointmentFlow.step = this.steps.REVIEW;
        return {
          success: true,
          response: this.responseGenerator.generateAppointmentReviewResponse(details, session.userInfo),
          step: this.steps.REVIEW
        };
      } else {
        session.appointmentFlow.step = this.steps.SELECT_CALENDAR;
        return {
          success: true,
          response: this.responseGenerator.generateAppointmentStartResponse(),
          step: this.steps.SELECT_CALENDAR
        };
      }
    } else if (changePatterns.some(pattern => pattern.test(text))) {
      // User wants to change email
      session.appointmentFlow.step = this.steps.COLLECT_EMAIL;
      return {
        success: true,
        response: this.responseGenerator.generateClarificationRequest('email'),
        step: this.steps.COLLECT_EMAIL
      };
    } else {
      // Unclear response, ask for clarification
      return {
        success: true,
        response: `I didn't catch that. Is your email correct, or would you like to change it? Please say "yes" to confirm or "no" to change it.`,
        step: this.steps.CONFIRM_EMAIL
      };
    }
  }

  /**
   * Handle confirmation step
   * @param {Object} session - Session object
   * @param {string} text - User input
   * @param {Function} getCalendarService - Function to get calendar service
   * @returns {Promise<Object>} Processing result
   */
  async handleConfirmation(session, text, getCalendarService) {
    const confirmPatterns = [/yes/i, /confirm/i, /schedule/i, /book/i, /go ahead/i, /correct/i, /sounds good/i];
    const cancelPatterns = [/no/i, /cancel/i, /change/i, /different/i, /wrong/i];

    if (confirmPatterns.some(pattern => pattern.test(text))) {
      return await this.createAppointment(session, getCalendarService);
    } else if (cancelPatterns.some(pattern => pattern.test(text))) {
      session.appointmentFlow.step = this.steps.COLLECT_TITLE;
      session.appointmentFlow.details = {};
      return {
        success: true,
        response: "No problem! Let's start over. What type of service are you interested in?",
        step: this.steps.COLLECT_TITLE
      };
    } else {
      return {
        success: true,
        response: `I didn't catch that. Should I go ahead and schedule this appointment? Please say "sounds good" to confirm or "no" to make changes.`,
        step: this.steps.CONFIRM
      };
    }
  }

  /**
   * Create the appointment
   * @param {Object} session - Session object
   * @param {Function} getCalendarService - Function to get calendar service
   * @returns {Promise<Object>} Creation result
   */
  async createAppointment(session, getCalendarService) {
    const { details, calendarType } = session.appointmentFlow;
    
    try {
      console.log('📅 [CreateAppointment] Full appointment details:', JSON.stringify(details, null, 2));
      console.log('📅 [CreateAppointment] Extracted values:', {
        title: details.title,
        date: details.date,
        time: details.time,
        timeDisplay: details.timeDisplay,
        duration: 30
      });
      
      // Validate time format before creating appointment
      const timeRegex = /^\d{2}:\d{2}$/;
      if (!timeRegex.test(details.time)) {
        console.error('❌ [CreateAppointment] Invalid time format:', details.time, 'Expected HH:mm format');
        // Try to fix common issues
        if (details.time && details.time.length === 4 && !details.time.includes(':')) {
          // Format like "1430" -> "14:30"
          const fixedTime = `${details.time.substring(0, 2)}:${details.time.substring(2)}`;
          console.log('🔧 [CreateAppointment] Fixed time format:', fixedTime);
          details.time = fixedTime;
        }
      }
      
      const calendarService = getCalendarService(calendarType);
      const appointmentResult = await calendarService.createAppointment(
        {
          title: details.title,
          description: `Scheduled via SherpaPrompt AI Assistant`,
          date: details.date,
          time: details.time,
          duration: 30
        },
        session.userInfo.email,
        session.userInfo.name
      );

      // Reset appointment flow
      session.appointmentFlow.active = false;
      session.appointmentFlow.step = this.steps.NONE;
      session.appointmentFlow.details = {};

      if (appointmentResult.success) {
        // Store calendar link in session for UI access
        session.lastAppointment = {
          calendarLink: appointmentResult.eventLink,
          eventId: appointmentResult.eventId,
          details: details
        };
        
        return {
          success: true,
          response: this.responseGenerator.generateAppointmentConfirmationResponse(details, session.userInfo, calendarType),
          appointmentCreated: true,
          calendarLink: appointmentResult.eventLink,
          appointmentDetails: details
        };
      } else {
        console.error('Calendar appointment creation failed:', appointmentResult.error);
        return {
          success: true,
          response: this.responseGenerator.generateAppointmentErrorResponse(details.title),
          appointmentCreated: false
        };
      }
    } catch (error) {
      console.error('❌ [AppointmentFlowManager] Appointment creation failed:', error);
      return {
        success: true,
        response: this.responseGenerator.generateAppointmentErrorResponse(details.title),
        appointmentCreated: false
      };
    }
  }

  /**
   * Handle unknown step
   * @param {Object} session - Session object
   * @returns {Object} Processing result
   */
  handleUnknownStep(session) {
    session.appointmentFlow.active = false;
    session.appointmentFlow.step = this.steps.NONE;
    
    return {
      success: true,
      response: "I'm sorry, there was an issue with the appointment scheduling. Would you like to try scheduling an appointment again?",
      step: this.steps.NONE
    };
  }

  /**
   * Handle flow error
   * @param {Object} session - Session object
   * @param {Error} error - Error object
   * @returns {Object} Error handling result
   */
  handleFlowError(session, error) {
    console.error('❌ [AppointmentFlowManager] Flow error:', error);
    session.appointmentFlow.active = false;
    session.appointmentFlow.step = this.steps.NONE;
    
    return {
      success: true,
      response: "I apologize, but there was an error processing your appointment request. Please contact us directly to schedule, and our team will be happy to help you.",
      step: this.steps.NONE
    };
  }

  /**
   * Extract service type from text
   * @param {string} text - User input
   * @returns {Promise<string>} Extracted service type
   */
  async extractServiceType(text) {
    const serviceExtractionPrompt = `You are extracting the FINAL service type the user wants from their speech. Pay attention to corrections and final intent.

User said: "${text}"

CRITICAL RULES:
1. If user corrects themselves (e.g., "no wait, actually I need repair"), use the FINAL/CORRECTED service only
2. Ignore filler words: "um", "uh", "so", "basically", "I need", "I want", "never mind"
3. Look for keywords: "installation", "repair", "consultation", "estimate", "quote", "gate", "maintenance", "emergency"
4. If user says multiple services, pick the LAST one mentioned (that's usually their correction)
5. Map to these exact service names:
   - "Product demo" (for product demonstrations, showcasing features)
   - "Automation consultation" (for consultations, general questions, advice)
   - "Integration discussion" (for discussing integrations with existing tools)
   - "Pricing consultation" (for quotes, pricing, estimates)
   - "Technical consultation" (for technical questions, API discussions)
   - "Call automation demo" (for call service demonstrations)
   - "Transcript service demo" (for transcript-to-task demonstrations)
   - "Voice estimate demo" (for voice-to-estimate demonstrations)

Examples:
- "I want to see how it works" → "Product demo"
- "I need to know about your pricing" → "Pricing consultation"
- "How does this integrate with my CRM?" → "Integration discussion"

Return ONLY: {"service": "Product demo"}`;

    try {
      const response = await this.openAIService.callOpenAI([
        { role: 'system', content: serviceExtractionPrompt },
        { role: 'user', content: text }
      ], 'gpt-5-nano', 3, {
        reasoning: { effort: "minimal" },
        max_output_tokens: 100,
        temperature: 0.2
      });
      
      const serviceData = JSON.parse(response);
      if (serviceData.service) {
        return serviceData.service;
      }
    } catch (error) {
      console.error('❌ [AppointmentFlowManager] Service extraction failed:', error);
    }
    
    // Fallback to keyword matching
    return this.fallbackServiceExtraction(text);
  }

  /**
   * Fallback service extraction using keywords
   * @param {string} text - User input
   * @returns {string} Extracted service type
   */
  fallbackServiceExtraction(text) {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('demo') || lowerText.includes('show') || lowerText.includes('see how')) {
      return 'Product demo';
    } else if (lowerText.includes('integration') || lowerText.includes('integrate') || lowerText.includes('connect')) {
      return 'Integration discussion';
    } else if (lowerText.includes('pricing') || lowerText.includes('price') || lowerText.includes('cost') || lowerText.includes('quote')) {
      return 'Pricing consultation';
    } else if (lowerText.includes('technical') || lowerText.includes('api') || lowerText.includes('developer')) {
      return 'Technical consultation';
    } else if (lowerText.includes('call') && lowerText.includes('automation')) {
      return 'Call automation demo';
    } else if (lowerText.includes('transcript') || lowerText.includes('meeting')) {
      return 'Transcript service demo';
    } else if (lowerText.includes('voice') && lowerText.includes('estimate')) {
      return 'Voice estimate demo';
    } else {
      return 'Product demo';
    }
  }

  /**
   * Extract name from text
   * @param {string} text - User input
   * @returns {Promise<string|null>} Extracted name
   */
  async extractName(text) {
    const nameExtractionPrompt = `Extract the person's name from this text: "${text}"

CRITICAL RULES:
1. Extract ONLY the person's name, ignore all other text
2. Handle spelled out names (e.g., "J-O-H-N S-M-I-T-H" → "John Smith")
3. Handle corrections and clarifications - use the FINAL/CORRECTED name mentioned
4. Ignore filler words like "it is spelled", "let me spell that", "the name should be"
5. Convert spelled-out letters to proper capitalization
6. Handle both first and last names if provided

Examples:
- "change my name to J-O-H-N S-M-I-T-H" → "John Smith"
- "call me M-A-R-Y" → "Mary"
- "my name should be Robert Johnson" → "Robert Johnson"
- "it's spelled D-O-U-G" → "Doug"

Return ONLY: {"name": "Extracted Name", "confidence": "high"}
Set confidence to "low" if the name seems unclear.`;

    try {
      const response = await this.openAIService.callOpenAI([
        { role: 'system', content: nameExtractionPrompt },
        { role: 'user', content: text }
      ], 'gpt-5-nano', 3, {
        reasoning: { effort: "minimal" },
        max_output_tokens: 100,
        temperature: 0.1
      });
      
      const nameData = JSON.parse(response);
      return nameData.name && nameData.name.trim().length > 0 ? nameData.name : null;
    } catch (error) {
      console.error('❌ [AppointmentFlowManager] Name extraction failed:', error);
      return null;
    }
  }

  /**
   * Extract email from text
   * @param {string} text - User input
   * @returns {Promise<string|null>} Extracted email
   */
  async extractEmail(text) {
    const emailExtractionPrompt = `Extract ONLY the email address from: "${text}"

CRITICAL RULES:
1. Extract ONLY the email address, ignore all other text
2. Handle spelled out emails (convert "at" to "@", "dot" to ".")
3. Handle letter-by-letter spelling (e.g., "j-o-h-n at g-m-a-i-l dot c-o-m" → "john@gmail.com")
4. Handle repetitions and clarifications - use the FINAL/CORRECTED email mentioned
5. Ignore filler words like "it is spelled", "let me spell that", "the email should be"
6. Convert to lowercase for consistency
7. MUST contain "@" and a domain with at least one dot (e.g., "@gmail.com")
8. If the text doesn't contain a valid email pattern, return {"email": null}

Examples:
- "change my email to j-o-h-n at g-m-a-i-l dot c-o-m" → "john@gmail.com"
- "email should be A-Z-M-A-I-N-M-O-R-S-H-E-D-0-3 at gmail dot com" → "azmainmorshed03@gmail.com"
- "it's spelled test at yahoo dot com" → "test@yahoo.com"
- "Uh, I would like to schedule a demo." → null (not an email)
- "2:30 PM please" → null (not an email)

Return ONLY: {"email": "extracted@email.com"} or {"email": null}`;

    try {
      const response = await this.openAIService.callOpenAI([
        { role: 'system', content: emailExtractionPrompt },
        { role: 'user', content: text }
      ], 'gpt-5-nano', 3, {
        reasoning: { effort: "minimal" },
        max_output_tokens: 100,
        temperature: 0.1
      });
      
      const emailData = JSON.parse(response);
      const extractedEmail = emailData.email;
      
      // Basic email validation to ensure it looks like a real email
      if (!extractedEmail) {
        console.log('📧 [Email Validation] No email found in text');
        return null;
      }
      
      // Must contain @ and a domain with at least one dot
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(extractedEmail)) {
        console.log('📧 [Email Validation] Invalid email format:', extractedEmail);
        return null;
      }
      
      console.log('✅ [Email Validation] Valid email extracted:', extractedEmail);
      return extractedEmail;
    } catch (error) {
      console.error('❌ [AppointmentFlowManager] Email extraction failed:', error);
      return null;
    }
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
   * Reset appointment flow
   * @param {Object} session - Session object
   */
  resetFlow(session) {
    session.appointmentFlow = {
      active: false,
      step: this.steps.NONE,
      details: {},
      calendarType: null
    };
  }

  /**
   * Check if appointment flow is active
   * @param {Object} session - Session object
   * @returns {boolean} Whether flow is active
   */
  isFlowActive(session) {
    return session.appointmentFlow && session.appointmentFlow.active;
  }

  /**
   * Get current step
   * @param {Object} session - Session object
   * @returns {string} Current step
   */
  getCurrentStep(session) {
    return session.appointmentFlow ? session.appointmentFlow.step : this.steps.NONE;
  }
}

module.exports = { AppointmentFlowManager };
