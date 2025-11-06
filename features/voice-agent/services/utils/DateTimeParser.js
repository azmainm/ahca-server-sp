/**
 * DateTimeParser - Handles date and time parsing utilities
 */

const moment = require('moment-timezone');

class DateTimeParser {
  constructor() {
    // Month names for parsing (full names)
    this.monthNames = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];

    // Month abbreviations mapping
    this.monthAbbreviations = {
      'jan': 'january',
      'feb': 'february',
      'mar': 'march',
      'apr': 'april',
      'may': 'may',
      'jun': 'june',
      'jul': 'july',
      'aug': 'august',
      'sep': 'september',
      'sept': 'september',
      'oct': 'october',
      'nov': 'november',
      'dec': 'december'
    };

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
   * Normalize month abbreviations to full names
   * @param {string} text - Input text
   * @returns {string} Normalized text with full month names
   */
  normalizeMonthAbbreviations(text) {
    let normalizedText = text.toLowerCase();
    
    for (const [abbr, fullName] of Object.entries(this.monthAbbreviations)) {
      // Match abbreviation followed by non-letter or end of string
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      normalizedText = normalizedText.replace(regex, fullName);
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
      console.log('📅 [DateParser] Original text:', text);
      const lower = String(text || '').toLowerCase().trim();

      // Handle relative terms first: today, tomorrow, day after tomorrow
      const today = new Date();
      const formatDate = (d) => {
        const y = d.getFullYear();
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      if (/(^|\b)today(\b|$)/i.test(lower)) {
        const dateString = formatDate(today);
        return {
          success: true,
          date: dateString,
          formatted: today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        };
      }

      if (/(^|\b)tomorrow(\b|$)/i.test(lower)) {
        const d = new Date(today);
        d.setDate(d.getDate() + 1);
        const dateString = formatDate(d);
        return {
          success: true,
          date: dateString,
          formatted: d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        };
      }

      if (/(day\s*after(\s*tomorrow)?)|\bafter\s*tomorrow\b/i.test(lower)) {
        const d = new Date(today);
        d.setDate(d.getDate() + 2);
        const dateString = formatDate(d);
        return {
          success: true,
          date: dateString,
          formatted: d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        };
      }
      
      // First, normalize month abbreviations (Oct -> October)
      let normalizedText = this.normalizeMonthAbbreviations(text);
      console.log('📅 [DateParser] After month normalization:', normalizedText);
      
      // Then normalize ordinal numbers
      normalizedText = this.normalizeOrdinals(normalizedText);
      console.log('📅 [DateParser] After ordinal normalization:', normalizedText);

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
          console.log('📅 [DateParser] Pattern matched:', pattern, 'Match:', match);
          const result = this.processDateMatch(match, pattern, datePatterns);
          if (result.success) {
            console.log('✅ [DateParser] Successfully parsed date:', result);
            return result;
          }
        }
      }

      console.log('❌ [DateParser] No valid date format found');
      return { success: false, error: 'No valid date format found' };
    } catch (error) {
      console.error('❌ [DateParser] Error:', error);
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
   * Parse user's time input into standardized 24-hour format
   * @param {string} text - User input containing time
   * @returns {Object} { success: boolean, time: string (HH:mm), display: string } or { success: false }
   */
  parseUserTimeInput(text) {
    const timePatterns = [
      /(\d{1,2}):(\d{2})\s*(am|pm)/i,  // 3:30 PM
      /(\d{1,2})\s*(am|pm)/i,          // 3 PM
      /(\d{1,2}):(\d{2})/,             // 15:30 (24-hour)
    ];
    
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
        }
        
        const time24 = `${hours.toString().padStart(2, '0')}:${minutes}`;
        const displayHour = hours % 12 || 12;
        const displayMeridiem = hours >= 12 ? 'PM' : 'AM';
        const display = `${displayHour}:${minutes} ${displayMeridiem}`;
        
        return { success: true, time: time24, display };
      }
    }
    
    return { success: false };
  }

  /**
   * Find nearest available slots to a requested time
   * @param {string} requestedTime - Time in HH:mm format
   * @param {Array} availableSlots - Available time slots
   * @returns {Array} Array of 1-2 nearest slots (before and/or after)
   */
  findNearestAvailableSlots(requestedTime, availableSlots) {
    if (!requestedTime || !availableSlots || availableSlots.length === 0) {
      return [];
    }
    
    const [reqHours, reqMinutes] = requestedTime.split(':').map(n => parseInt(n));
    const requestedMinutes = reqHours * 60 + reqMinutes;
    
    // Calculate time difference for each slot
    const slotsWithDiff = availableSlots.map(slot => {
      const [slotHours, slotMinutes] = slot.start.split(':').map(n => parseInt(n));
      const slotTotalMinutes = slotHours * 60 + slotMinutes;
      const diff = slotTotalMinutes - requestedMinutes;
      
      return {
        slot,
        diff,
        absDiff: Math.abs(diff)
      };
    });
    
    // Sort by absolute difference
    slotsWithDiff.sort((a, b) => a.absDiff - b.absDiff);
    
    // Get closest before and after
    const before = slotsWithDiff.filter(s => s.diff < 0).sort((a, b) => b.diff - a.diff)[0];
    const after = slotsWithDiff.filter(s => s.diff > 0).sort((a, b) => a.diff - b.diff)[0];
    
    // Return up to 2 nearest slots
    const nearest = [];
    if (before) nearest.push(before.slot);
    if (after) nearest.push(after.slot);
    
    // If we only have one direction, add the next closest
    if (nearest.length === 1 && slotsWithDiff.length > 1) {
      const second = slotsWithDiff[1];
      if (second && second.slot !== nearest[0]) {
        nearest.push(second.slot);
      }
    }
    
    return nearest.slice(0, 2);
  }

  /**
   * Find selected time slot from user input
   * @param {string} text - User's time selection input
   * @param {Array} availableSlots - Array of available time slots
   * @returns {Object|null} Selected slot or null if not found
   */
  findSelectedTimeSlot(text, availableSlots) {
    const inputLower = text.toLowerCase().trim();
    
    console.log('🕐 [TimeSlotMatcher] Looking for time in:', text);
    console.log('🕐 [TimeSlotMatcher] Available slots:', availableSlots.map(s => `${s.display} (${s.start})`));
    
    // First, try exact match with display format
    for (const slot of availableSlots) {
      if (inputLower === slot.display.toLowerCase()) {
        console.log('✅ [TimeSlotMatcher] Exact match found:', slot);
        return slot;
      }
    }
    
    // Try to extract time from user input using various patterns
    const timePatterns = [
      /(\d{1,2}):(\d{2})\s*(am|pm)/i,  // 12:30 PM, 2:00 PM, 2:30 pm
      /(\d{1,2})\s*(am|pm)/i,          // 12 PM, 2 PM
      /(\d{1,2}):(\d{2})/,             // 14:30 (24-hour)
      /(\d{1,2})\s*(?:o'clock)?/i      // 2, 12 o'clock
    ];
    
    let extractedTime = null;
    let extractedDisplay = null;
    
    for (const pattern of timePatterns) {
      const match = text.match(pattern);
      if (match) {
        let hours, minutes;
        
        if (pattern === timePatterns[0]) { // HH:MM AM/PM
          hours = parseInt(match[1]);
          minutes = match[2];
          const meridiem = match[3].toLowerCase();
          extractedDisplay = `${hours}:${minutes} ${meridiem.toUpperCase()}`;
          if (meridiem === 'pm' && hours !== 12) hours += 12;
          if (meridiem === 'am' && hours === 12) hours = 0;
        } else if (pattern === timePatterns[1]) { // H AM/PM
          hours = parseInt(match[1]);
          minutes = '00';
          const meridiem = match[2].toLowerCase();
          extractedDisplay = `${hours}:${minutes} ${meridiem.toUpperCase()}`;
          if (meridiem === 'pm' && hours !== 12) hours += 12;
          if (meridiem === 'am' && hours === 12) hours = 0;
        } else if (pattern === timePatterns[2]) { // HH:MM (24-hour)
          hours = parseInt(match[1]);
          minutes = match[2];
          extractedDisplay = `${hours}:${minutes}`;
        } else if (pattern === timePatterns[3]) { // Just number
          hours = parseInt(match[1]);
          minutes = '00';
          // Assume PM for business hours (12-4 PM)
          if (hours >= 12 && hours <= 16) {
            // Already in 24-hour format
          } else if (hours >= 1 && hours <= 4) {
            hours += 12; // Convert to PM
          }
          extractedDisplay = `${hours % 12 || 12}:00 ${hours >= 12 ? 'PM' : 'AM'}`;
        }
        
        extractedTime = `${hours.toString().padStart(2, '0')}:${minutes}`;
        console.log('🕐 [TimeSlotMatcher] Extracted time:', extractedTime, 'Display:', extractedDisplay);
        break;
      }
    }
    
    // If we extracted a time, find matching slot by start time
    if (extractedTime) {
      for (const slot of availableSlots) {
        if (slot.start === extractedTime) {
          console.log('✅ [TimeSlotMatcher] Match found by start time:', slot);
          return slot;
        }
      }
      
      // Also try matching by display if we have it
      if (extractedDisplay) {
        for (const slot of availableSlots) {
          if (slot.display.toLowerCase() === extractedDisplay.toLowerCase()) {
            console.log('✅ [TimeSlotMatcher] Match found by display:', slot);
            return slot;
          }
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

  /**
   * Get current date in a specific timezone
   * @param {string} timezone - Timezone string (e.g., 'America/Denver')
   * @returns {string} Current date in YYYY-MM-DD format in the specified timezone
   */
  getCurrentDateInTimezone(timezone) {
    try {
      const now = moment.tz(timezone);
      return now.format('YYYY-MM-DD');
    } catch (error) {
      console.error('❌ [DateTimeParser] Error getting current date in timezone:', error);
      // Fallback to system timezone
      const today = new Date();
      const year = today.getFullYear();
      const month = (today.getMonth() + 1).toString().padStart(2, '0');
      const day = today.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  /**
   * Check if a date is in the past compared to current date in a specific timezone
   * @param {string} dateString - Date in YYYY-MM-DD format
   * @param {string} timezone - Timezone string (e.g., 'America/Denver')
   * @returns {boolean} True if date is in the past
   */
  isDateInPast(dateString, timezone) {
    try {
      const currentDate = this.getCurrentDateInTimezone(timezone);
      return dateString < currentDate;
    } catch (error) {
      console.error('❌ [DateTimeParser] Error checking if date is in past:', error);
      return false;
    }
  }
}

module.exports = { DateTimeParser };
