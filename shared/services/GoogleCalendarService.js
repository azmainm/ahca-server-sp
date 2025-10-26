const { google } = require('googleapis');
const moment = require('moment-timezone');

/**
 * Multi-Tenant Google Calendar Service for creating appointments
 */
class GoogleCalendarService {
  constructor(calendarConfig = null) {
    this.calendar = null;
    this.initialized = false;
    this.calendarConfig = calendarConfig;
    
    // Log configuration
    if (calendarConfig) {
      console.log(`🏢 [GoogleCalendarService] Configured for business with calendar ID: ${calendarConfig.calendarId}`);
    } else {
      console.log('⚠️ [GoogleCalendarService] No calendar config provided, will use environment variables');
    }
  }

  /**
   * Create a new GoogleCalendarService instance for a specific business
   * @param {Object} calendarConfig - Calendar configuration from business config
   * @returns {GoogleCalendarService} New instance configured for the business
   */
  static createForBusiness(calendarConfig) {
    if (!calendarConfig) {
      throw new Error('Calendar configuration is required');
    }
    
    const requiredFields = ['serviceAccountEmail', 'privateKey', 'calendarId', 'projectId'];
    for (const field of requiredFields) {
      if (!calendarConfig[field]) {
        throw new Error(`Missing required calendar config field: ${field}`);
      }
    }
    
    return new GoogleCalendarService(calendarConfig);
  }

  /**
   * Initialize Google Calendar API with service account credentials
   */
  async initialize() {
    try {
      let credentials;
      let calendarId;
      
      if (this.calendarConfig) {
        // Use business-specific configuration
        credentials = {
          client_email: this.calendarConfig.serviceAccountEmail,
          private_key: this.calendarConfig.privateKey.replace(/\\n/g, '\n'),
          project_id: this.calendarConfig.projectId,
        };
        calendarId = this.calendarConfig.calendarId;
        
        console.log(`🏢 [GoogleCalendarService] Initializing with business config for calendar: ${calendarId}`);
      } else {
        // Fallback to environment variables (backward compatibility)
        if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_CALENDAR_ID) {
          throw new Error('Missing Google Calendar environment variables');
        }
        
        credentials = {
          client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          project_id: process.env.GOOGLE_PROJECT_ID,
        };
        calendarId = process.env.GOOGLE_CALENDAR_ID;
        
        console.log('⚠️ [GoogleCalendarService] Using environment variables (legacy mode)');
      }

      // Create JWT auth
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/calendar'],
      });

      // Initialize calendar API
      this.calendar = google.calendar({ version: 'v3', auth });
      this.calendarId = calendarId; // Store for use in methods
      this.initialized = true;
      
      console.log(`✅ Google Calendar service initialized for calendar: ${calendarId}`);
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Google Calendar service:', error);
      throw error;
    }
  }

  /**
   * Check availability for given date and time range
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} startTime - Start time in HH:MM format (24-hour)
   * @param {string} endTime - End time in HH:MM format (24-hour)
   * @returns {Promise<Object>} Availability information
   */
  async checkAvailability(date, startTime, endTime) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      // Convert to ISO datetime strings
      const startDateTime = moment.tz(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm', 'America/Denver').toISOString();
      const endDateTime = moment.tz(`${date} ${endTime}`, 'YYYY-MM-DD HH:mm', 'America/Denver').toISOString();

      console.log('🔍 Checking availability:', { date, startTime, endTime, startDateTime, endDateTime });

      // Get existing events in the time range
      const events = await this.calendar.events.list({
        calendarId: this.calendarId,
        timeMin: startDateTime,
        timeMax: endDateTime,
        singleEvents: true,
        orderBy: 'startTime',
      });

      const existingEvents = events.data.items || [];
      console.log(`📅 Found ${existingEvents.length} existing events in range`);

      return {
        success: true,
        isAvailable: existingEvents.length === 0,
        existingEvents: existingEvents.length,
        conflictingEvents: existingEvents.map(event => ({
          title: event.summary,
          start: event.start.dateTime,
          end: event.end.dateTime
        }))
      };

    } catch (error) {
      console.error('❌ Error checking availability:', error);
      return {
        success: false,
        error: error.message,
        isAvailable: false
      };
    }
  }

  /**
   * Find available 30-minute slots within business hours for a given date
   * Business hours: 12:00 PM - 4:00 PM, Monday-Friday
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<Array>} Array of available time slots
   */
  async findAvailableSlots(date) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      // Check if it's a valid business day (Monday-Friday)
      const dateObj = moment.tz(date, 'YYYY-MM-DD', 'America/Denver');
      const dayOfWeek = dateObj.day(); // 0=Sunday, 1=Monday, ..., 6=Saturday
      
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return {
          success: true,
          availableSlots: [],
          message: 'We are only available Monday through Friday for appointments.'
        };
      }

      // Business hours: 12:00 PM - 4:00 PM (30-minute slots)
      const businessStart = '12:00';
      const businessEnd = '16:00'; // 4:00 PM in 24-hour format
      
      // Generate all possible 30-minute slots
      const slots = [];
      let currentTime = moment.tz(`${date} ${businessStart}`, 'YYYY-MM-DD HH:mm', 'America/Denver');
      const endTime = moment.tz(`${date} ${businessEnd}`, 'YYYY-MM-DD HH:mm', 'America/Denver');

      while (currentTime.isBefore(endTime)) {
        const slotEnd = currentTime.clone().add(30, 'minutes');
        if (slotEnd.isBefore(endTime) || slotEnd.isSame(endTime)) {
          slots.push({
            start: currentTime.format('HH:mm'),
            end: slotEnd.format('HH:mm'),
            display: currentTime.format('h:mm A')
          });
        }
        currentTime.add(30, 'minutes');
      }

      console.log(`📅 Generated ${slots.length} potential slots for ${date}`);

      // Check availability for each slot
      const availableSlots = [];
      for (const slot of slots) {
        const availability = await this.checkAvailability(date, slot.start, slot.end);
        if (availability.success && availability.isAvailable) {
          availableSlots.push(slot);
        }
      }

      console.log(`✅ Found ${availableSlots.length} available slots`);

      return {
        success: true,
        availableSlots,
        totalSlots: slots.length,
        date: dateObj.format('dddd, MMMM D, YYYY')
      };

    } catch (error) {
      console.error('❌ Error finding available slots:', error);
      return {
        success: false,
        error: error.message,
        availableSlots: []
      };
    }
  }

  /**
   * Find next available appointment slot from a given date
   * @param {string} startDate - Date to start searching from (YYYY-MM-DD)
   * @param {number} daysToSearch - Number of days to search ahead (default: 14)
   * @returns {Promise<Object>} Next available slot information
   */
  async findNextAvailableSlot(startDate, daysToSearch = 14) {
    try {
      console.log(`🔍 Finding next available slot starting from ${startDate}`);
      
      // Use consistent timezone for all operations
      const searchStart = moment.tz(startDate, 'YYYY-MM-DD', 'America/Denver');
      
      for (let i = 0; i < daysToSearch; i++) {
        const searchDate = searchStart.clone().add(i, 'days');
        const dateString = searchDate.format('YYYY-MM-DD');
        
        // Skip weekends
        if (searchDate.day() === 0 || searchDate.day() === 6) {
          continue;
        }

        const slotsResult = await this.findAvailableSlots(dateString);
        if (slotsResult.success && slotsResult.availableSlots.length > 0) {
          return {
            success: true,
            date: dateString,
            formattedDate: searchDate.format('dddd, MMMM D, YYYY'),
            availableSlots: slotsResult.availableSlots,
            daysFromNow: i
          };
        }
      }

      return {
        success: false,
        message: `No available slots found in the next ${daysToSearch} business days.`
      };

    } catch (error) {
      console.error('❌ Error finding next available slot:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a calendar event with appointment details
   * @param {Object} appointmentDetails - Event details
   * @param {string} appointmentDetails.title - Event title
   * @param {string} appointmentDetails.description - Event description  
   * @param {string} appointmentDetails.date - Date in YYYY-MM-DD format
   * @param {string} appointmentDetails.time - Time in HH:MM format
   * @param {number} appointmentDetails.duration - Duration in minutes (default: 30)
   * @param {string} customerEmail - Customer's email address
   * @param {string} customerName - Customer's name
   * @returns {Promise<Object>} Created event details
   */
  async createAppointment(appointmentDetails, customerEmail, customerName) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      // Parse and validate date/time
      const { startDateTime, endDateTime } = this.parseDateTime(
        appointmentDetails.date, 
        appointmentDetails.time, 
        appointmentDetails.duration || 30
      );

      // Create event object (without attendees due to service account limitations)
      const event = {
        summary: appointmentDetails.title || `Consultation with ${customerName}`,
        description: appointmentDetails.description || 
          `Fencing consultation with ${customerName}.\n\nCustomer Contact: ${customerEmail}\nCustomer Name: ${customerName}\n\nScheduled through SherpaPrompt AI Assistant.\n\nNOTE: Please contact the customer at ${customerEmail} to confirm the appointment.`,
        start: {
          dateTime: startDateTime,
          timeZone: 'America/Denver', // Colorado timezone
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'America/Denver',
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 24 * 60 }, // 24 hours before
            { method: 'popup', minutes: 60 }, // 1 hour before
          ],
        },
        colorId: '9', // Blue color for appointments
        transparency: 'opaque',
        visibility: 'default',
        status: 'confirmed'
      };

      console.log('📅 Creating calendar event:', {
        title: event.summary,
        start: startDateTime,
        end: endDateTime,
        customer: `${customerName} (${customerEmail})`
      });

      // Create the event (without sending invitations due to service account limitations)
      const response = await this.calendar.events.insert({
        calendarId: this.calendarId,
        resource: event,
      });

      const createdEvent = response.data;
      
      console.log('✅ Calendar event created successfully:', {
        id: createdEvent.id,
        htmlLink: createdEvent.htmlLink,
        start: createdEvent.start.dateTime
      });

      return {
        success: true,
        eventId: createdEvent.id,
        eventLink: createdEvent.htmlLink,
        startTime: startDateTime,
        endTime: endDateTime,
        title: event.summary,
        attendeeEmail: customerEmail
      };

    } catch (error) {
      console.error('❌ Error creating calendar event:', error);
      
      // Return structured error response
      return {
        success: false,
        error: error.message,
        details: error.response?.data || 'Unknown error occurred'
      };
    }
  }

  /**
   * Parse date and time strings into ISO datetime strings
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} time - Time in HH:MM format  
   * @param {number} duration - Duration in minutes
   * @returns {Object} Start and end datetime strings
   */
  parseDateTime(date, time, duration = 60) {
    try {
      // Use moment-timezone for proper timezone handling
      const dateTimeStr = `${date} ${time}`;
      console.log('📅 [GoogleCalendar parseDateTime] Input:', { date, time, duration, dateTimeStr });
      
      // Ensure we're working in the correct timezone consistently
      // Use America/Denver timezone for all operations to match the calendar
      const startMoment = moment.tz(dateTimeStr, 'YYYY-MM-DD HH:mm', 'America/Denver');
      
      if (!startMoment.isValid()) {
        throw new Error(`Invalid date/time format: ${dateTimeStr}`);
      }

      const endMoment = startMoment.clone().add(duration, 'minutes');
      
      console.log('📅 [GoogleCalendar parseDateTime] Parsed:', {
        startDateTime: startMoment.toISOString(),
        startLocal: startMoment.format('YYYY-MM-DD HH:mm'),
        endDateTime: endMoment.toISOString(),
        endLocal: endMoment.format('YYYY-MM-DD HH:mm'),
        timezone: 'America/Denver',
        startDateTimeWithTZ: startMoment.format(),
        endDateTimeWithTZ: endMoment.format()
      });

      return {
        startDateTime: startMoment.toISOString(),
        endDateTime: endMoment.toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to parse date/time: ${error.message}`);
    }
  }

  /**
   * Validate appointment details
   * @param {Object} details - Appointment details to validate
   * @returns {Object} Validation result
   */
  validateAppointmentDetails(details) {
    const errors = [];

    // Check required fields
    if (!details.date) {
      errors.push('Date is required');
    } else {
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(details.date)) {
        errors.push('Date must be in YYYY-MM-DD format');
      }
    }

    if (!details.time) {
      errors.push('Time is required');
    } else {
      // Validate time format (HH:MM)
      const timeRegex = /^\d{2}:\d{2}$/;
      if (!timeRegex.test(details.time)) {
        errors.push('Time must be in HH:MM format');
      }
    }

    // Validate that appointment is in the future
    if (details.date && details.time) {
      try {
        const appointmentMoment = moment.tz(`${details.date} ${details.time}`, 'YYYY-MM-DD HH:mm', 'America/Denver');
        if (appointmentMoment.isBefore(moment())) {
          errors.push('Appointment must be scheduled for a future date and time');
        }
      } catch (error) {
        errors.push('Invalid date/time combination');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if the service is properly initialized
   */
  isInitialized() {
    return this.initialized && this.calendar !== null;
  }
}

module.exports = { GoogleCalendarService };
