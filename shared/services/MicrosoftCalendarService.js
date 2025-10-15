const { ConfidentialClientApplication } = require('@azure/msal-node');
const axios = require('axios');
const moment = require('moment-timezone');

/**
 * Microsoft Calendar Service for creating appointments using Microsoft Graph API
 */
class MicrosoftCalendarService {
  constructor() {
    this.msalInstance = null;
    this.accessToken = null;
    this.tokenExpiry = null;
    this.initialized = false;
  }

  /**
   * Initialize Microsoft Graph API with Azure AD app credentials
   */
  async initialize() {
    try {
      // Check required environment variables
      if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET || !process.env.AZURE_TENANT_ID) {
        throw new Error('Missing Microsoft Calendar environment variables');
      }

      // Create MSAL instance for client credentials flow
      const clientConfig = {
        auth: {
          clientId: process.env.AZURE_CLIENT_ID,
          clientSecret: process.env.AZURE_CLIENT_SECRET,
          authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`
        }
      };

      this.msalInstance = new ConfidentialClientApplication(clientConfig);
      this.initialized = true;
      
      console.log('✅ Microsoft Calendar service initialized');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Microsoft Calendar service:', error);
      throw error;
    }
  }

  /**
   * Get access token for Microsoft Graph API
   */
  async getAccessToken() {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      // Check if we have a valid token
      if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
        return this.accessToken;
      }

      // Request new token using client credentials flow
      const clientCredentialRequest = {
        scopes: ['https://graph.microsoft.com/.default'],
      };

      const response = await this.msalInstance.acquireTokenByClientCredential(clientCredentialRequest);
      
      if (response) {
        this.accessToken = response.accessToken;
        // Set expiry time with 5 minute buffer
        this.tokenExpiry = new Date(Date.now() + (response.expiresOn.getTime() - Date.now()) - 300000);
        console.log('✅ Microsoft Graph access token acquired');
        return this.accessToken;
      } else {
        throw new Error('Failed to acquire access token');
      }
    } catch (error) {
      console.error('❌ Error acquiring access token:', error);
      console.error('❌ Token error details:', {
        message: error.message,
        errorCode: error.errorCode,
        errorMessage: error.errorMessage,
        correlationId: error.correlationId
      });
      throw error;
    }
  }

  /**
   * Check availability for given date and time range in shared mailbox calendar
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} startTime - Start time in HH:MM format (24-hour)
   * @param {string} endTime - End time in HH:MM format (24-hour)
   * @returns {Promise<Object>} Availability information
   */
  async checkAvailability(date, startTime, endTime) {
    try {
      const accessToken = await this.getAccessToken();
      
      // Convert to ISO datetime strings
      const startDateTime = moment.tz(`${date} ${startTime}`, 'YYYY-MM-DD HH:mm', 'America/Denver').toISOString();
      const endDateTime = moment.tz(`${date} ${endTime}`, 'YYYY-MM-DD HH:mm', 'America/Denver').toISOString();

      console.log('🔍 Checking Microsoft Calendar availability:', { date, startTime, endTime, startDateTime, endDateTime });

      // Get shared mailbox email from environment
      const sharedMailbox = process.env.SHARED_MAILBOX_EMAIL || 'call_agent@sheraprompt.com';

      // Get existing events in the time range using Microsoft Graph API
      const response = await axios.get(
        `https://graph.microsoft.com/v1.0/users/${sharedMailbox}/calendar/calendarView?startDateTime=${encodeURIComponent(startDateTime)}&endDateTime=${encodeURIComponent(endDateTime)}&$select=subject,start,end,id`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const existingEvents = response.data.value || [];
      console.log(`📅 Found ${existingEvents.length} existing events in Microsoft Calendar range`);

      return {
        success: true,
        isAvailable: existingEvents.length === 0,
        existingEvents: existingEvents.length,
        conflictingEvents: existingEvents.map(event => ({
          title: event.subject,
          start: event.start.dateTime,
          end: event.end.dateTime
        }))
      };

    } catch (error) {
      console.error('❌ Error checking Microsoft Calendar availability:', error);
      console.error('❌ Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
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
            display: currentTime.format('h:mm A'),
            startMoment: currentTime.clone(),
            endMoment: slotEnd.clone()
          });
        }
        currentTime.add(30, 'minutes');
      }

      console.log(`📅 Generated ${slots.length} potential slots for ${date} in Microsoft Calendar`);

      // Get all events for the entire business day with single API call
      const dayStartDateTime = moment.tz(`${date} ${businessStart}`, 'YYYY-MM-DD HH:mm', 'America/Denver').toISOString();
      const dayEndDateTime = moment.tz(`${date} ${businessEnd}`, 'YYYY-MM-DD HH:mm', 'America/Denver').toISOString();

      const accessToken = await this.getAccessToken();
      const sharedMailbox = process.env.SHARED_MAILBOX_EMAIL || 'call_agent@sherpaprompt.com';

      console.log('🔍 Fetching all Microsoft Calendar events for business hours:', { 
        date, 
        start: dayStartDateTime, 
        end: dayEndDateTime 
      });

      // Single API call to get all events for the business day
      const response = await axios.get(
        `https://graph.microsoft.com/v1.0/users/${sharedMailbox}/calendar/calendarView?startDateTime=${encodeURIComponent(dayStartDateTime)}&endDateTime=${encodeURIComponent(dayEndDateTime)}&$select=subject,start,end,id`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const existingEvents = response.data.value || [];
      console.log(`📅 Found ${existingEvents.length} existing events in Microsoft Calendar for the day`);

      // Check each slot against existing events locally (no more API calls)
      const availableSlots = [];
      for (const slot of slots) {
        const hasConflict = existingEvents.some(event => {
          const eventStart = moment(event.start.dateTime);
          const eventEnd = moment(event.end.dateTime);
          
          // Check if slot overlaps with existing event
          return slot.startMoment.isBefore(eventEnd) && slot.endMoment.isAfter(eventStart);
        });

        if (!hasConflict) {
          // Remove moment objects before returning (they're not serializable)
          const { startMoment, endMoment, ...slotData } = slot;
          availableSlots.push(slotData);
        }
      }

      console.log(`✅ Found ${availableSlots.length} available slots in Microsoft Calendar (optimized)`);

      return {
        success: true,
        availableSlots,
        totalSlots: slots.length,
        date: dateObj.format('dddd, MMMM D, YYYY')
      };

    } catch (error) {
      console.error('❌ Error finding available slots in Microsoft Calendar:', error);
      console.error('❌ Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
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
      console.log(`🔍 Finding next available slot in Microsoft Calendar starting from ${startDate}`);
      
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
        message: `No available slots found in Microsoft Calendar in the next ${daysToSearch} business days.`
      };

    } catch (error) {
      console.error('❌ Error finding next available slot in Microsoft Calendar:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create a calendar event with appointment details in shared mailbox
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
      const accessToken = await this.getAccessToken();

      // Parse and validate date/time
      const { startDateTime, endDateTime } = this.parseDateTime(
        appointmentDetails.date, 
        appointmentDetails.time, 
        appointmentDetails.duration || 30
      );

      // Get shared mailbox email from environment
      const sharedMailbox = process.env.SHARED_MAILBOX_EMAIL || 'call_agent@sheraprompt.com';

      // Create event object for Microsoft Graph API
      const event = {
        subject: appointmentDetails.title || `Consultation with ${customerName}`,
        body: {
          contentType: 'text',
          content: appointmentDetails.description || 
            `Fencing consultation with ${customerName}.\n\nCustomer Contact: ${customerEmail}\nCustomer Name: ${customerName}\n\nScheduled through SherpaPrompt AI Assistant.\n\nNOTE: Please contact the customer at ${customerEmail} to confirm the appointment.`
        },
        start: {
          dateTime: startDateTime,
          timeZone: 'America/Denver' // Colorado timezone
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'America/Denver'
        },
        attendees: [
          {
            emailAddress: {
              address: customerEmail,
              name: customerName
            },
            type: 'required'
          }
        ],
        reminderMinutesBeforeStart: 60, // 1 hour before
        isReminderOn: true,
        showAs: 'busy',
        sensitivity: 'normal'
      };

      console.log('📅 Creating Microsoft Calendar event:', {
        title: event.subject,
        start: startDateTime,
        end: endDateTime,
        customer: `${customerName} (${customerEmail})`,
        sharedMailbox: sharedMailbox
      });

      // Create the event using Microsoft Graph API
      const response = await axios.post(
        `https://graph.microsoft.com/v1.0/users/${sharedMailbox}/calendar/events`,
        event,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const createdEvent = response.data;
      
      console.log('✅ Microsoft Calendar event created successfully:', {
        id: createdEvent.id,
        webLink: createdEvent.webLink,
        start: createdEvent.start.dateTime
      });

      return {
        success: true,
        eventId: createdEvent.id,
        eventLink: createdEvent.webLink,
        startTime: startDateTime,
        endTime: endDateTime,
        title: event.subject,
        attendeeEmail: customerEmail
      };

    } catch (error) {
      console.error('❌ Error creating Microsoft Calendar event:', error);
      
      
      // Return structured error response for other errors
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
      console.log('📅 [MicrosoftCalendar parseDateTime] Input:', { date, time, duration, dateTimeStr });
      
      const startMoment = moment.tz(dateTimeStr, 'YYYY-MM-DD HH:mm', 'America/Denver');
      
      if (!startMoment.isValid()) {
        throw new Error(`Invalid date/time format: ${dateTimeStr}`);
      }

      const endMoment = startMoment.clone().add(duration, 'minutes');
      
      console.log('📅 [MicrosoftCalendar parseDateTime] Parsed:', {
        startDateTime: startMoment.toISOString(),
        startLocal: startMoment.format('YYYY-MM-DD HH:mm'),
        endDateTime: endMoment.toISOString(),
        endLocal: endMoment.format('YYYY-MM-DD HH:mm')
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
    return this.initialized && this.msalInstance !== null;
  }
}

module.exports = { MicrosoftCalendarService };
