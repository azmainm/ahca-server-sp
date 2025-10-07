/**
 * DateTimeParser - Handles date and time parsing utilities
 */

class DateTimeParser {
  constructor() {
    // Month names for parsing
    this.monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];

    // Ordinal number mappings
    this.ordinalMappings = {
      'first': '1st', 'second': '2nd', 'third': '3rd', 'fourth': '4th',
      'fifth': '5th', 'sixth': '6th', 'seventh': '7th', 'eighth': '8th',
      'ninth': '9th', 'tenth': '10th', 'eleventh': '11th', 'twelfth': '12th',
      'thirteenth': '13th', 'fourteenth': '14th', 'fifteenth': '15th',
      'sixteenth': '16th', 'seventeenth': '17th', 'eighteenth': '18th',
      'nineteenth': '19th', 'twentieth': '20th', 'twenty-first': '21st',
      'twenty-second': '22nd', 'twenty-third': '23rd', 'twenty-fourth': '24th',
      'twenty-fifth': '25th', 'twenty-sixth': '26th', 'twenty-seventh': '27th',
      'twenty-eighth': '28th', 'twenty-ninth': '29th', 'thirtieth': '30th',
      'thirty-first': '31st'
    };
  }

  /**
   * Normalize ordinal numbers in text
   * @param {string} text - Input text
   * @returns {string} Normalized text
   */
  normalizeOrdinals(text) {
    let normalizedText = text.toLowerCase();
    
    for (const [word, ordinal] of Object.entries(this.ordinalMappings)) {
      const regex = new RegExp(`\\b${word}\\b`, 'g');
      normalizedText = normalizedText.replace(regex, ordinal);
    }
    
    return normalizedText;
  }

  /**
   * Parse date from natural language text
   * @param {string} text - Input text containing date
   * @returns {Object} Parse result with success, date, and formatted date
   */
  parseDateFromText(text) {
    try {
      // First, normalize ordinal numbers
      const normalizedText = this.normalizeOrdinals(text);

      // Try various date formats
      const datePatterns = [
        // YYYY-MM-DD format
        /(\d{4})-(\d{1,2})-(\d{1,2})/,
        // MM/DD/YYYY format
        /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
        // Month DD, YYYY format (including ordinals)
        /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}(?:st|nd|rd|th)?),?\s+(\d{4})/i,
        // DD Month YYYY format (including ordinals)
        /(\d{1,2}(?:st|nd|rd|th)?)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i,
        // Month DD format (current year assumed, including ordinals)
        /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}(?:st|nd|rd|th)?)/i,
        // DD Month format (current year assumed, including ordinals)
        /(\d{1,2}(?:st|nd|rd|th)?)\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i
      ];

      for (const pattern of datePatterns) {
        const match = normalizedText.match(pattern);
        if (match) {
          const result = this.processDateMatch(match, pattern, datePatterns);
          if (result.success) {
            return result;
          }
        }
      }

      return { success: false, error: 'No valid date format found' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Process a date match and convert to standard format
   * @param {Array} match - Regex match array
   * @param {RegExp} pattern - The pattern that matched
   * @param {Array} datePatterns - All date patterns for comparison
   * @returns {Object} Processing result
   */
  processDateMatch(match, pattern, datePatterns) {
    let year, month, day;
    const currentYear = new Date().getFullYear();
    
    if (pattern === datePatterns[0]) { // YYYY-MM-DD
      year = match[1];
      month = match[2].padStart(2, '0');
      day = match[3].padStart(2, '0');
    } else if (pattern === datePatterns[1]) { // MM/DD/YYYY
      year = match[3];
      month = match[1].padStart(2, '0');
      day = match[2].padStart(2, '0');
    } else if (pattern === datePatterns[2]) { // Month DD, YYYY
      month = (this.monthNames.indexOf(match[1].toLowerCase()) + 1).toString().padStart(2, '0');
      day = match[2].replace(/\D/g, '').padStart(2, '0'); // Remove ordinal suffixes
      year = match[3];
    } else if (pattern === datePatterns[3]) { // DD Month YYYY
      day = match[1].replace(/\D/g, '').padStart(2, '0'); // Remove ordinal suffixes
      month = (this.monthNames.indexOf(match[2].toLowerCase()) + 1).toString().padStart(2, '0');
      year = match[3];
    } else if (pattern === datePatterns[4]) { // Month DD (current year)
      month = (this.monthNames.indexOf(match[1].toLowerCase()) + 1).toString().padStart(2, '0');
      day = match[2].replace(/\D/g, '').padStart(2, '0'); // Remove ordinal suffixes
      year = currentYear.toString();
    } else if (pattern === datePatterns[5]) { // DD Month (current year)
      day = match[1].replace(/\D/g, '').padStart(2, '0'); // Remove ordinal suffixes
      month = (this.monthNames.indexOf(match[2].toLowerCase()) + 1).toString().padStart(2, '0');
      year = currentYear.toString();
    }

    const dateString = `${year}-${month}-${day}`;
    const date = new Date(dateString);
    
    if (!isNaN(date.getTime())) {
      return {
        success: true,
        date: dateString,
        formatted: date.toLocaleDateString('en-US', { 
          weekday: 'long', 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })
      };
    }

    return { success: false, error: 'Invalid date' };
  }

  /**
   * Parse time from natural language text
   * @param {string} text - Input text containing time
   * @returns {Object} Parse result with success and time
   */
  parseTimeFromText(text) {
    try {
      // Match time patterns like "10:30 AM", "2 PM", "14:30"
      const timePatterns = [
        /(\d{1,2}):(\d{2})\s*(am|pm)/i,  // 10:30 AM
        /(\d{1,2})\s*(am|pm)/i,          // 2 PM
        /(\d{1,2}):(\d{2})/              // 14:30 (24-hour)
      ];

      for (const pattern of timePatterns) {
        const match = text.match(pattern);
        if (match) {
          const result = this.processTimeMatch(match, pattern, timePatterns);
          if (result.success) {
            return result;
          }
        }
      }

      return { success: false, error: 'No valid time format found' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Process a time match and convert to 24-hour format
   * @param {Array} match - Regex match array
   * @param {RegExp} pattern - The pattern that matched
   * @param {Array} timePatterns - All time patterns for comparison
   * @returns {Object} Processing result
   */
  processTimeMatch(match, pattern, timePatterns) {
    let hours, minutes, meridiem;
    
    if (pattern === timePatterns[0]) { // HH:MM AM/PM
      hours = parseInt(match[1]);
      minutes = match[2];
      meridiem = match[3].toLowerCase();
    } else if (pattern === timePatterns[1]) { // H AM/PM
      hours = parseInt(match[1]);
      minutes = '00';
      meridiem = match[2].toLowerCase();
    } else if (pattern === timePatterns[2]) { // HH:MM (24-hour)
      hours = parseInt(match[1]);
      minutes = match[2];
      meridiem = null;
    }

    // Convert to 24-hour format if needed
    if (meridiem === 'pm' && hours !== 12) {
      hours += 12;
    } else if (meridiem === 'am' && hours === 12) {
      hours = 0;
    }

    // Validate time
    if (hours >= 0 && hours <= 23 && parseInt(minutes) >= 0 && parseInt(minutes) <= 59) {
      const timeString = `${hours.toString().padStart(2, '0')}:${minutes}`;
      return {
        success: true,
        time: timeString
      };
    }

    return { success: false, error: 'Invalid time' };
  }

  /**
   * Find selected time slot from user input
   * @param {string} text - User's time selection input
   * @param {Array} availableSlots - Array of available time slots
   * @returns {Object|null} Selected slot or null if not found
   */
  findSelectedTimeSlot(text, availableSlots) {
    const inputLower = text.toLowerCase().trim();
    
    // First, try exact match with display format
    for (const slot of availableSlots) {
      if (inputLower === slot.display.toLowerCase()) {
        return slot;
      }
    }
    
    // Try to extract time from user input using various patterns
    const timePatterns = [
      /(\d{1,2}):(\d{2})\s*(am|pm)/i,  // 12:30 PM, 2:00 PM
      /(\d{1,2})\s*(am|pm)/i,          // 12 PM, 2 PM
      /(\d{1,2}):(\d{2})/,             // 14:30 (24-hour)
      /(\d{1,2})\s*(?:o'clock)?/i      // 2, 12 o'clock
    ];
    
    let extractedTime = null;
    
    for (const pattern of timePatterns) {
      const match = text.match(pattern);
      if (match) {
        let hours, minutes;
        
        if (pattern === timePatterns[0]) { // HH:MM AM/PM
          hours = parseInt(match[1]);
          minutes = match[2];
          const meridiem = match[3].toLowerCase();
          if (meridiem === 'pm' && hours !== 12) hours += 12;
          if (meridiem === 'am' && hours === 12) hours = 0;
        } else if (pattern === timePatterns[1]) { // H AM/PM
          hours = parseInt(match[1]);
          minutes = '00';
          const meridiem = match[2].toLowerCase();
          if (meridiem === 'pm' && hours !== 12) hours += 12;
          if (meridiem === 'am' && hours === 12) hours = 0;
        } else if (pattern === timePatterns[2]) { // HH:MM (24-hour)
          hours = parseInt(match[1]);
          minutes = match[2];
        } else if (pattern === timePatterns[3]) { // Just number
          hours = parseInt(match[1]);
          minutes = '00';
          // Assume PM for business hours (12-4 PM)
          if (hours >= 12 && hours <= 16) {
            // Already in 24-hour format
          } else if (hours >= 1 && hours <= 4) {
            hours += 12; // Convert to PM
          }
        }
        
        extractedTime = `${hours.toString().padStart(2, '0')}:${minutes}`;
        break;
      }
    }
    
    // If we extracted a time, find matching slot
    if (extractedTime) {
      for (const slot of availableSlots) {
        if (slot.start === extractedTime) {
          return slot;
        }
      }
    }
    
    // Try partial matching with display text
    for (const slot of availableSlots) {
      const slotDisplay = slot.display.toLowerCase();
      
      // Check if input contains key parts of the slot display
      if (slotDisplay.includes(inputLower) || inputLower.includes(slotDisplay.split(' ')[0])) {
        return slot;
      }
      
      // Try matching just the hour part
      const hourMatch = slotDisplay.match(/(\d{1,2})/);
      const inputHourMatch = inputLower.match(/(\d{1,2})/);
      
      if (hourMatch && inputHourMatch && hourMatch[1] === inputHourMatch[1]) {
        // Also check for AM/PM consistency if present in input
        const slotHasPM = slotDisplay.includes('pm');
        const inputHasPM = inputLower.includes('pm') || inputLower.includes('p.m');
        const inputHasAM = inputLower.includes('am') || inputLower.includes('a.m');
        
        if (!inputHasPM && !inputHasAM) {
          // No meridiem specified, assume it matches if hour matches
          return slot;
        } else if ((slotHasPM && inputHasPM) || (!slotHasPM && inputHasAM)) {
          return slot;
        }
      }
    }
    
    return null;
  }

  /**
   * Check if text contains date patterns
   * @param {string} text - Input text
   * @returns {boolean} Whether text contains date patterns
   */
  containsDatePatterns(text) {
    const datePatterns = [
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}/i,
      /\b\d{4}-\d{1,2}-\d{1,2}\b/,
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/,
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2},?\s+\d{4}/i,
      /\b\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/i
    ];
    
    return datePatterns.some(pattern => pattern.test(text));
  }

  /**
   * Validate if a date string is a valid business day
   * @param {string} dateString - Date in YYYY-MM-DD format
   * @returns {Object} Validation result
   */
  validateBusinessDay(dateString) {
    try {
      const date = new Date(dateString);
      const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      
      // Check if it's Monday through Friday (1-5)
      const isBusinessDay = dayOfWeek >= 1 && dayOfWeek <= 5;
      
      return {
        success: true,
        isBusinessDay,
        dayOfWeek,
        dayName: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = { DateTimeParser };
