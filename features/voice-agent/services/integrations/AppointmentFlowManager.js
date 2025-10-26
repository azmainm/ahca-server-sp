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
      COLLECT_EMAIL: 'collect_email'
    };

    // Review confirmation patterns
    this.confirmationPatterns = [
      /sounds good/i, /good/i, /correct/i, /yes/i, /confirm/i, 
      /schedule/i, /book/i, /go ahead/i, /looks good/i, /perfect/i,
      /that'?s? all/i, /that'?s? it/i, /nothing else/i, /no.*that'?s? all/i,
      /no.*that'?s? it/i, /no.*nothing else/i, /all set/i, /ready/i,
      /proceed/i, /continue/i, /ok/i, /okay/i, /sure/i
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
      date: /change.*date.*to\s+(.+)|date.*should.*be\s+(.+)|make.*it\s+(.+)\s+instead|can.*we.*do\s+(.+)|how.*about\s+(.+)|instead.*of.*that.*how.*about\s+(.+)/i,
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
        response: `Perfect, ${session.userInfo.name}! What's your email address? Please spell it out for accuracy - for example, 'j-o-h-n at g-m-a-i-l dot com'.`,
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
        response: "Perfect! I'll add it to your Google Calendar. What type of session would you like? We can do a product demo, a consultation, or a discussion about integrations.",
        step: this.steps.COLLECT_TITLE
      };
    } else if (calendarChoice.includes('microsoft') || calendarChoice.includes('outlook')) {
      session.appointmentFlow.calendarType = 'microsoft';
      session.appointmentFlow.step = this.steps.COLLECT_TITLE;
      return {
        success: true,
        response: "Perfect! I'll add it to your Microsoft Calendar. What type of session would you like? We can do a product demo, a consultation, or a discussion about integrations.",
        step: this.steps.COLLECT_TITLE
      };
    } else {
      return {
        success: true,
        response: "I didn't catch that. Please say 'Google' or 'Microsoft' to choose your calendar.",
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
      // Preserve user phrasing for event title display
      if (typeof text === 'string' && text.trim().length > 0) {
        session.appointmentFlow.details.titleDisplay = text.trim();
      }
      
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
          response: `Perfect! I'll schedule a ${serviceTitle}. What date works for you? You MUST say the date in this EXACT format: 'October 16, 2025'.`,
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
    const lower = (text || '').toLowerCase();

    console.log('📅 [DateCollection] Processing date input:', text);
    console.log('📅 [DateCollection] Current session appointment details:', JSON.stringify(session.appointmentFlow?.details, null, 2));

    // MANDATORY: Only accept exact formats "October 16, 2025"
    const strictPatterns = [
      /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?\,?\s+\d{4}$/i,
      /^\d{1,2}(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i
    ];
    const isStrict = strictPatterns.some(p => p.test((text || '').trim()));
    
    // Reject ANY relative terms or non-standard formats
    const isRelative = /(\btoday\b|\btomorrow\b|day\s*after\s*tomorrow|next\s+(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|three\s+days?\s+later|in\s+three\s+days?|next\s+week|this\s+week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(lower);

    // REJECT anything that's not the exact required format
    if (!isStrict || isRelative) {
      console.log('❌ [DateCollection] Invalid date format or relative terms detected');
      return {
        success: true,
        response: "I need the date in this this EXACT format: 'October 16, 2025'. Please say the date exactly like that.",
        step: this.steps.COLLECT_DATE
      };
    }

    console.log('🔍 [DateCollection] Parsing date with dateTimeParser...');
    const dateResult = this.dateTimeParser.parseDateFromText(text);
    console.log('📅 [DateCollection] Date parsing result:', JSON.stringify(dateResult, null, 2));
    
    if (!dateResult.success) {
      console.log('❌ [DateCollection] Date parsing failed');
      return {
        success: true,
        response: "I need the date in this EXACT format: 'October 16, 2025'. Please say the date exactly like that.",
        step: this.steps.COLLECT_DATE
      };
    }

    // Check if it's a weekend
    if (dateResult.success) {
      const dateObj = new Date(dateResult.date);
      const dayOfWeek = dateObj.getDay(); // 0=Sunday, 6=Saturday
      console.log('📅 [DateCollection] Date analysis:', {
        date: dateResult.date,
        dayOfWeek: dayOfWeek,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6
      });

      if (dayOfWeek === 0 || dayOfWeek === 6) {
        console.log('🚫 [DateCollection] Weekend detected, finding next available business day');
        // It's a weekend, find next available business day
        const calendarService = getCalendarService(session.appointmentFlow.calendarType);
        console.log('📞 [DateCollection] Calling findNextAvailableSlot for weekend date...');
        const nextAvailable = await calendarService.findNextAvailableSlot(dateResult.date);
        console.log('📅 [DateCollection] Next available result:', JSON.stringify(nextAvailable, null, 2));

        if (nextAvailable.success) {
          // Clear any previously selected time
          delete session.appointmentFlow.details.time;
          delete session.appointmentFlow.details.timeDisplay;
          session.appointmentFlow.details.date = nextAvailable.date;
          session.appointmentFlow.details.availableSlots = nextAvailable.availableSlots;
          session.appointmentFlow.step = this.steps.COLLECT_TIME;

          console.log('✅ [DateCollection] Weekend handled, moving to time collection');
          return {
            success: true,
            response: `I see you mentioned a weekend date. We're only available Monday through Friday. The next available date is ${nextAvailable.formattedDate} with slots ${this.responseGenerator.formatSlotsAsRanges(nextAvailable.availableSlots)}. Which time works best for you?`,
            step: this.steps.COLLECT_TIME
          };
        } else {
          console.log('❌ [DateCollection] No available slots found after weekend');
          return {
            success: true,
            response: `I see you mentioned a weekend date. We're only available Monday through Friday. I couldn't find any available appointments in the next two weeks. Please contact us to discuss alternative scheduling options.`,
            step: this.steps.COLLECT_DATE
          };
        }
      }
    }
    
    // Check availability using calendar service - ALWAYS call API for date changes
    console.log('📞 [DateCollection] Getting calendar service for:', session.appointmentFlow.calendarType);
    const calendarService = getCalendarService(session.appointmentFlow.calendarType);
    
    if (!calendarService) {
      console.error('❌ [DateCollection] Calendar service not found');
      return {
        success: true,
        response: 'There was an issue with the calendar service. Please try again.',
        step: this.steps.COLLECT_DATE
      };
    }
    
    console.log('🔍 [DateCollection] Calling findAvailableSlots API for date:', dateResult.date);
    const slotsResult = await calendarService.findAvailableSlots(dateResult.date);
    console.log('📅 [DateCollection] Slots API result:', JSON.stringify(slotsResult, null, 2));
    
    if (!slotsResult.success) {
      console.error('❌ [DateCollection] Slots API call failed:', slotsResult.error);
      return {
        success: true,
        response: this.responseGenerator.generateErrorResponse('appointment', 'Please try another date or contact us for assistance.'),
        step: this.steps.COLLECT_DATE
      };
    }
    
    if (slotsResult.availableSlots.length === 0) {
      console.log('📅 [DateCollection] No slots available for requested date, finding next available');
      // Find next available date
      const nextAvailable = await calendarService.findNextAvailableSlot(dateResult.date);
      console.log('📅 [DateCollection] Next available result:', JSON.stringify(nextAvailable, null, 2));
      
      if (nextAvailable.success) {
        // Clear any previously selected time
        delete session.appointmentFlow.details.time;
        delete session.appointmentFlow.details.timeDisplay;
        session.appointmentFlow.details.date = nextAvailable.date;
        session.appointmentFlow.details.availableSlots = nextAvailable.availableSlots;
        session.appointmentFlow.step = this.steps.COLLECT_TIME;
        
        console.log('✅ [DateCollection] Alternative date found, moving to time collection');
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
        console.log('❌ [DateCollection] No alternative dates available');
        return {
          success: true,
          response: `I'm sorry, but ${dateResult.formatted} has no available slots, and I couldn't find any available appointments in the next two weeks. Please contact us to discuss alternative scheduling options.`,
          step: this.steps.COLLECT_DATE
        };
      }
    }
    
    // Store date and available slots
    // Clear any previously selected time when changing date
    console.log('✅ [DateCollection] Slots found, storing date and clearing previous time selection');
    delete session.appointmentFlow.details.time;
    delete session.appointmentFlow.details.timeDisplay;
    session.appointmentFlow.details.date = dateResult.date;
    session.appointmentFlow.details.availableSlots = slotsResult.availableSlots;
    session.appointmentFlow.step = this.steps.COLLECT_TIME;
    
    console.log('📅 [DateCollection] Updated appointment details:', JSON.stringify(session.appointmentFlow.details, null, 2));
    
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
        response: `I understand you'd like to change the date. What date would work best for your ${serviceTitle}? You MUST say the date in this EXACT format: 'October 16, 2025'.`,
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
        response: `I understand you'd like to change the date. What date would work best for your ${serviceTitle}? You MUST say the date in this EXACT format: 'October 16, 2025'.`,
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
    
    console.log('📋 [AppointmentFlow] handleReview - User input:', text);
    console.log('📋 [AppointmentFlow] handleReview - Current step:', session.appointmentFlow.step);
    console.log('📋 [AppointmentFlow] handleReview - Appointment details:', JSON.stringify(details, null, 2));
    
    // Check for direct changes with new values in the same message
    const directChanges = await this.processDirectChanges(session, text, getCalendarService);
    if (directChanges.hasChanges) {
      console.log('📋 [AppointmentFlow] handleReview - Direct changes detected');
      return directChanges.result;
    }
    
    // Enhanced confirmation patterns - including "no it's fine", "no that's good", etc.
    const confirmationPatterns = [
      /yes/i, /confirm/i, /schedule/i, /book/i, /go ahead/i, /correct/i, /sounds good/i,
      /that's good/i, /that's fine/i, /it's fine/i, /looks good/i, /perfect/i,
      /no.*fine/i, /no.*good/i, /no.*correct/i, /no.*okay/i, /no.*ok/i,
      /no.*that's.*all/i, /no.*all.*set/i, /no.*we're.*good/i, /no.*everything.*good/i,
      /fine/i, /good/i, /okay/i, /ok$/i, /all.*set/i, /we're.*good/i
    ];
    
    // Check for confirmation
    if (confirmationPatterns.some(pattern => pattern.test(text))) {
      console.log('✅ [AppointmentFlow] handleReview - Confirmation detected, creating appointment');
      return await this.createAppointment(session, getCalendarService);
    }
    
    // Check for individual change requests
    for (const [changeType, pattern] of Object.entries(this.changePatterns)) {
      if (pattern.test(text)) {
        console.log('📋 [AppointmentFlow] handleReview - Change request detected:', changeType);
        return this.handleChangeRequest(session, changeType);
      }
    }
    
    console.log('📋 [AppointmentFlow] handleReview - No clear action detected, asking for clarification');
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
      const newDateText = (dateMatch[1] || dateMatch[2] || dateMatch[3] || dateMatch[4] || dateMatch[5] || dateMatch[6]).trim();
      const dateResult = this.dateTimeParser.parseDateFromText(newDateText);
      
      if (dateResult.success) {
        const calendarService = getCalendarService(session.appointmentFlow.calendarType);
        const slotsResult = await calendarService.findAvailableSlots(dateResult.date);
        
        if (slotsResult.success && slotsResult.availableSlots.length > 0) {
          // ALWAYS clear old time when changing date
          delete details.time;
          delete details.timeDisplay;
          details.date = dateResult.date;
          details.availableSlots = slotsResult.availableSlots;
          
          session.appointmentFlow.step = this.steps.COLLECT_TIME;
          const slotsText = this.responseGenerator.formatSlotsAsRanges(slotsResult.availableSlots);
          return {
            hasChanges: true,
            result: {
              success: true,
              response: `Perfect! I've updated your date to ${dateResult.formatted}. Here are the available times: ${slotsText}. Which time works best for you?`,
              step: this.steps.COLLECT_TIME
            }
          };
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
          response: `No problem! What date would work best for your ${serviceTitle}? You MUST say the date in this EXACT format: 'October 16, 2025'.`,
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
          response: "No problem! What email address should I use for this appointment? Please spell it out letter by letter for accuracy - for example, 'j-o-h-n at g-m-a-i-l dot com'.",
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
        
        // Go directly to calendar selection after collecting email
        session.appointmentFlow.step = this.steps.SELECT_CALENDAR;
        return {
          success: true,
          response: "Great! I'd be happy to help you schedule a demo. First, would you like me to add this to your Google Calendar or Microsoft Calendar? Just say 'Google' or 'Microsoft'.",
          step: this.steps.SELECT_CALENDAR
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
      console.log('🚀 [CreateAppointment] STARTING APPOINTMENT CREATION');
      console.log('📅 [CreateAppointment] Session ID:', session.sessionId);
      console.log('📅 [CreateAppointment] Calendar Type:', calendarType);
      console.log('📅 [CreateAppointment] User Info:', JSON.stringify(session.userInfo, null, 2));
      console.log('📅 [CreateAppointment] Full appointment details:', JSON.stringify(details, null, 2));
      console.log('📅 [CreateAppointment] Extracted values:', {
        title: details.title,
        date: details.date,
        time: details.time,
        timeDisplay: details.timeDisplay,
        duration: 30
      });
      
      // Validate required fields
      if (!details.title || !details.date || !details.time) {
        console.error('❌ [CreateAppointment] Missing required fields:', {
          title: !!details.title,
          date: !!details.date,
          time: !!details.time
        });
        return {
          success: true,
          response: "I'm missing some appointment details. Let's start over with scheduling.",
          appointmentCreated: false
        };
      }
      
      if (!session.userInfo.email || !session.userInfo.name) {
        console.error('❌ [CreateAppointment] Missing user info:', {
          email: !!session.userInfo.email,
          name: !!session.userInfo.name
        });
        return {
          success: true,
          response: "I need your name and email to schedule the appointment. Please provide them.",
          appointmentCreated: false
        };
      }
      
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
        } else {
          console.error('❌ [CreateAppointment] Cannot fix time format, aborting');
          return {
            success: true,
            response: "There's an issue with the time format. Let's reschedule.",
            appointmentCreated: false
          };
        }
      }
      
      console.log('📞 [CreateAppointment] Getting calendar service for:', calendarType);
      const calendarService = getCalendarService(calendarType);
      
      if (!calendarService) {
        console.error('❌ [CreateAppointment] Calendar service not found for type:', calendarType);
        return {
          success: true,
          response: "There's an issue with the calendar service. Please try again.",
          appointmentCreated: false
        };
      }
      
      console.log('🔄 [CreateAppointment] Calling calendar service createAppointment...');
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

      console.log('📋 [CreateAppointment] Calendar service result:', JSON.stringify(appointmentResult, null, 2));

      // Reset appointment flow
      session.appointmentFlow.active = false;
      session.appointmentFlow.step = this.steps.NONE;
      session.appointmentFlow.details = {};

      if (appointmentResult.success) {
        console.log('✅ [CreateAppointment] SUCCESS - Appointment created successfully');
        console.log('🔗 [CreateAppointment] Calendar link:', appointmentResult.eventLink);
        
        // Store calendar link in session for UI access
        session.lastAppointment = {
          calendarLink: appointmentResult.eventLink,
          eventId: appointmentResult.eventId,
          details: details
        };
        
        const result = {
          success: true,
          response: this.responseGenerator.generateAppointmentConfirmationResponse(details, session.userInfo, calendarType),
          appointmentCreated: true,
          calendarLink: appointmentResult.eventLink,
          appointmentDetails: details
        };
        
        console.log('📤 [CreateAppointment] Returning result:', JSON.stringify(result, null, 2));
        return result;
      } else {
        console.error('❌ [CreateAppointment] Calendar appointment creation failed:', appointmentResult.error);
        console.error('❌ [CreateAppointment] Full error details:', appointmentResult);
        return {
          success: true,
          response: this.responseGenerator.generateAppointmentErrorResponse(details.title),
          appointmentCreated: false
        };
      }
    } catch (error) {
      console.error('❌ [CreateAppointment] EXCEPTION during appointment creation:', error);
      console.error('❌ [CreateAppointment] Error stack:', error.stack);
      return {
        success: true,
        response: this.responseGenerator.generateAppointmentErrorResponse(details?.title || 'appointment'),
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
    const prompts = require('../../../configs/prompt_rules.json');
    const cfg = prompts.extractServiceType;
    const serviceExtractionPrompt = `${cfg.systemPrompt}

User said: "${text}"

CRITICAL RULES:
${cfg.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Examples:
${cfg.examples.map(e => `- ${e}`).join('\n')}

${cfg.outputFormat}`;

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
    const prompts = require('../../../configs/prompt_rules.json');
    const cfg = prompts.extractName;
    const nameExtractionPrompt = `${cfg.systemPrompt} "${text}"

CRITICAL RULES:
${cfg.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Examples:
${cfg.examples.map(e => `- ${e}`).join('\n')}

${cfg.outputFormat}`;

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
    const prompts = require('../../../configs/prompt_rules.json');
    const cfg = prompts.extractEmail;
    const emailExtractionPrompt = `${cfg.systemPrompt} "${text}"

CRITICAL RULES:
${cfg.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Examples:
${cfg.examples.map(e => `- ${e}`).join('\n')}

${cfg.outputFormat}`;

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
