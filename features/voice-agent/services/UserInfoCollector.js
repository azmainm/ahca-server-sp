/**
 * UserInfoCollector - Handles Phase 1: Name and email collection
 */

class UserInfoCollector {
  constructor(openAIService) {
    this.openAIService = openAIService;
  }

  /**
   * Check if user info collection is complete
   * @param {Object} userInfo - User info object
   * @returns {boolean} Whether collection is complete
   */
  isCollectionComplete(userInfo) {
    return userInfo.collected && userInfo.name && userInfo.email;
  }

  /**
   * Generate system prompt for name/email collection
   * @returns {string} System prompt
   */
  getCollectionSystemPrompt() {
    return `You're a friendly voice assistant for SherpaPrompt Fencing Company. Sound natural and conversational.

CRITICAL INSTRUCTIONS:
- ONLY collect name and email - NEVER ask for phone numbers or anything else
- If you have both name and email, respond EXACTLY with: "Thanks [name]! I've got your email as [email]. Do you have any questions about our fencing services, or would you like to schedule an appointment?"
- If missing info, ask ONLY for the missing piece (name OR email)
- Sound conversational, use contractions (I'll, we're, that's, etc.)
- Keep responses friendly but brief

Your ONLY job is name and email collection.`;
  }

  /**
   * Extract name and email from user input
   * @param {string} text - User input text
   * @returns {Promise<Object>} Extraction result
   */
  async extractUserInfo(text) {
    const extractionPrompt = `You are extracting name and email from user speech. Handle these cases carefully:

1. If user is spelling out their email (e.g., "a-z-m-a-i-n at gmail dot com"), convert it properly
2. Convert "at" to "@" and "dot" to "." in emails
3. Handle corrections and clarifications (e.g., "no wait, it's actually...")
4. Ignore filler words like "um", "uh", "so", "basically"
5. If user says "spell" or "let me spell", they're providing spelling

User input: "${text}"

Return ONLY a JSON object like: {"name": "John Doe", "email": "john@example.com", "hasComplete": true, "needsSpelling": false}
- Set needsSpelling to true if the name/email seems unclear or contains unusual characters
- If missing info, set those fields to null and hasComplete to false
- Convert spelled-out emails properly (a-t becomes @, d-o-t becomes .)`;

    try {
      const response = await this.openAIService.callOpenAI([
        { role: 'system', content: extractionPrompt },
        { role: 'user', content: text }
      ], 'gpt-5-nano', 3, {
        verbosity: "low",
        reasoning: { effort: "minimal" },
        max_tokens: 200,
        temperature: 0.1
      });

      return JSON.parse(response);
    } catch (error) {
      console.error('❌ [UserInfoCollector] Extraction failed:', error.message);
      // Fallback to simple pattern matching
      return this.fallbackExtraction(text);
    }
  }

  /**
   * Fallback extraction using regex patterns
   * @param {string} text - User input text
   * @returns {Object} Extraction result
   */
  fallbackExtraction(text) {
    const nameMatch = text.match(/(?:name.*is|call.*me|i'm)\s+([a-zA-Z\s]+)/i);
    const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    
    return {
      name: nameMatch ? nameMatch[1].trim() : null,
      email: emailMatch ? emailMatch[1].trim() : null,
      hasComplete: !!(nameMatch && emailMatch),
      needsSpelling: false
    };
  }

  /**
   * Generate response for missing information
   * @param {Object} userInfo - Current user info
   * @returns {string} Response message
   */
  generateMissingInfoResponse(userInfo) {
    let missingInfo = [];
    if (!userInfo.name) missingInfo.push('name');
    if (!userInfo.email) missingInfo.push('email address');
    
    if (missingInfo.length === 2) {
      return "I'd be happy to help! Could you please tell me your name and email address? Feel free to spell them out if needed for clarity.";
    } else if (missingInfo.includes('name')) {
      return "Thanks! I still need your name. Please tell me your name, and feel free to spell it out if it's unusual.";
    } else if (missingInfo.includes('email address')) {
      return "Thanks! I still need your email address. Please spell it out letter by letter for accuracy - for example, 'j-o-h-n at g-m-a-i-l dot c-o-m'.";
    }
    
    return "I'd be happy to help! Could you please provide your name and email address so I can assist you better?";
  }

  /**
   * Generate completion response
   * @param {string} name - User's name
   * @param {string} email - User's email
   * @returns {string} Completion response
   */
  generateCompletionResponse(name, email) {
    return `Thanks ${name}! I've got your email as ${email}. Do you have any questions about our fencing services, or would you like to schedule an appointment?`;
  }

  /**
   * Process user info collection
   * @param {string} text - User input
   * @param {Object} currentUserInfo - Current user info state
   * @returns {Promise<Object>} Processing result
   */
  async processCollection(text, currentUserInfo) {
    try {
      const extracted = await this.extractUserInfo(text);
      
      // Update user info with extracted data
      const updatedUserInfo = { ...currentUserInfo };
      if (extracted.name) updatedUserInfo.name = extracted.name;
      if (extracted.email) updatedUserInfo.email = extracted.email;
      
      let response;
      
      if (extracted.hasComplete && extracted.name && extracted.email) {
        updatedUserInfo.collected = true;
        response = this.generateCompletionResponse(extracted.name, extracted.email);
      } else {
        response = this.generateMissingInfoResponse(updatedUserInfo);
      }
      
      return {
        success: true,
        userInfo: updatedUserInfo,
        response,
        completed: updatedUserInfo.collected
      };
      
    } catch (error) {
      console.error('❌ [UserInfoCollector] Processing failed:', error);
      return {
        success: false,
        error: error.message,
        userInfo: currentUserInfo,
        response: "I'm having trouble with my AI service right now, but I can still help! Could you please clearly state your name and email address?"
      };
    }
  }

  /**
   * Handle name change requests during conversation
   * @param {string} text - User input
   * @returns {Promise<Object>} Name change result
   */
  async handleNameChange(text) {
    const nameExtractionPrompt = `The user wants to change their name. Extract the new name from: "${text}"
        
Handle corrections, spelling, and filler words. Look for patterns like:
- "my name is actually..."
- "call me..."
- "my name should be..."
- "change my name to..."

Return ONLY: {"name": "John Doe"}`;

    try {
      const response = await this.openAIService.callOpenAI([
        { role: 'system', content: nameExtractionPrompt },
        { role: 'user', content: text }
      ], 'gpt-5-nano', 3, {
        verbosity: "low",
        reasoning: { effort: "minimal" },
        max_tokens: 100,
        temperature: 0.1
      });
      
      const nameData = JSON.parse(response);
      return {
        success: true,
        name: nameData.name
      };
    } catch (error) {
      console.error('❌ [UserInfoCollector] Name change extraction failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Handle email change requests during conversation
   * @param {string} text - User input
   * @returns {Promise<Object>} Email change result
   */
  async handleEmailChange(text) {
    const emailExtractionPrompt = `The user wants to change their email. Extract ONLY the email address from: "${text}"
        
CRITICAL RULES:
1. Extract ONLY the email address, ignore all other text
2. Handle spelled out emails (e.g., "j-o-h-n at gmail dot com") - convert properly
3. Convert "at" to "@" and "dot" to "."
4. Handle repetitions and clarifications - use the FINAL/CORRECTED email mentioned
5. Ignore filler words like "the email address I want to change to will be", "it is spelled", "let me repeat"
6. Look for patterns like "my email is actually...", "change my email to...", "email should be..."

Examples:
- "The email address I want to change to will be ozmainmorshad03 at gmail.com It is spelled AZMAINMORSHED03 at gmail.com Let me repeat it AZMAINMORSHED03 at gmail.com" → "AZMAINMORSHED03@gmail.com"
- "my email is actually test at yahoo dot com" → "test@yahoo.com"

Return ONLY: {"email": "extracted@email.com"}`;

    try {
      const response = await this.openAIService.callOpenAI([
        { role: 'system', content: emailExtractionPrompt },
        { role: 'user', content: text }
      ], 'gpt-5-nano', 3, {
        verbosity: "low",
        reasoning: { effort: "minimal" },
        max_tokens: 100,
        temperature: 0.1
      });
      
      const emailData = JSON.parse(response);
      return {
        success: true,
        email: emailData.email
      };
    } catch (error) {
      console.error('❌ [UserInfoCollector] Email change extraction failed, trying regex fallback:', error);
      return this.fallbackEmailExtraction(text);
    }
  }

  /**
   * Fallback email extraction using regex patterns
   * @param {string} text - User input
   * @returns {Object} Email extraction result
   */
  fallbackEmailExtraction(text) {
    let extractedEmail = null;
    
    // Pattern 1: Standard email format
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
    const emailMatch = text.match(emailRegex);
    
    if (emailMatch) {
      extractedEmail = emailMatch[1].toLowerCase();
    } else {
      // Pattern 2: Spelled out email (convert "at" to "@" and "dot" to ".")
      const spelledOutRegex = /([a-zA-Z0-9._-]+)\s+at\s+([a-zA-Z0-9.-]+)\s+dot\s+([a-zA-Z]{2,})/i;
      const spelledMatch = text.match(spelledOutRegex);
      
      if (spelledMatch) {
        extractedEmail = `${spelledMatch[1]}@${spelledMatch[2]}.${spelledMatch[3]}`.toLowerCase();
      } else {
        // Pattern 3: Letter-by-letter spelled email (e.g., "j-o-h-n at g-m-a-i-l dot c-o-m")
        const letterSpelledRegex = /([a-zA-Z0-9-]+)\s+at\s+([a-zA-Z0-9-]+)\s+dot\s+([a-zA-Z]{2,})/i;
        const letterMatch = text.match(letterSpelledRegex);
        
        if (letterMatch) {
          const username = letterMatch[1].replace(/-/g, '');
          const domain = letterMatch[2].replace(/-/g, '');
          const extension = letterMatch[3];
          extractedEmail = `${username}@${domain}.${extension}`.toLowerCase();
        } else {
          // Pattern 4: Handle cases like "azmainmorshed03 at gmail.com" (without dashes)
          const simpleSpelledRegex = /([a-zA-Z0-9]+)\s+at\s+([a-zA-Z0-9.]+)/i;
          const simpleMatch = text.match(simpleSpelledRegex);
          
          if (simpleMatch) {
            extractedEmail = `${simpleMatch[1]}@${simpleMatch[2]}`.toLowerCase();
          }
        }
      }
    }
    
    return {
      success: !!extractedEmail,
      email: extractedEmail,
      error: extractedEmail ? null : 'Could not extract email from input'
    };
  }

  /**
   * Check if text contains name change patterns
   * @param {string} text - User input
   * @returns {boolean} Whether text contains name change patterns
   */
  isNameChangeRequest(text) {
    const nameChangePatterns = [
      /change.*name/i,
      /update.*name/i,
      /my name.*is/i,
      /actually.*name/i,
      /correct.*name/i,
      /wrong.*name/i,
      /name.*should.*be/i,
      /call.*me/i
    ];
    
    return nameChangePatterns.some(pattern => pattern.test(text));
  }

  /**
   * Check if text contains email change patterns
   * @param {string} text - User input
   * @returns {boolean} Whether text contains email change patterns
   */
  isEmailChangeRequest(text) {
    const emailChangePatterns = [
      /change.*email/i,
      /update.*email/i,
      /my email.*is/i,
      /actually.*email/i,
      /correct.*email/i,
      /wrong.*email/i,
      /email.*should.*be/i,
      /email.*address.*is/i
    ];
    
    return emailChangePatterns.some(pattern => pattern.test(text));
  }
}

module.exports = { UserInfoCollector };
