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
    const prompts = require('../../../configs/prompt_rules.json');
    const cfg = prompts.userInfoCollection;
    return `${cfg.systemPrompt}

CRITICAL INSTRUCTIONS:
${cfg.rules.map(r => `- ${r}`).join('\n')}

${cfg.closing}`;
  }

  /**
   * Extract name and email from user input
   * @param {string} text - User input text
   * @returns {Promise<Object>} Extraction result
   */
  async extractUserInfo(text) {
    const prompts = require('../../../configs/prompt_rules.json');
    const cfg = prompts.extractUserInfo;
    const extractionPrompt = `${cfg.systemPrompt}

CRITICAL PRIORITY RULES:
${cfg.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

User input: "${text}"

${cfg.outputFormat}`;

    try {
      const response = await this.openAIService.callOpenAI([
        { role: 'system', content: extractionPrompt },
        { role: 'user', content: text }
      ], 'gpt-5-nano', 3, {
        reasoning: { effort: "minimal" },
        max_output_tokens: 200,
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
      return "I'd be happy to help! Could you please tell me your name?";
    } else if (missingInfo.includes('name')) {
      return "Could you please tell me your name?";
    } else if (missingInfo.includes('email address')) {
      return "Could you please spell out your email address?";
    }
    
    return "I'd be happy to help! Could you please provide your name and email address so I can assist you better?";
  }

  /**
   * Spell out name letter by letter for voice confirmation
   * @param {string} name - User's name
   * @returns {string} Spelled out name
   */
  spellName(name) {
    if (!name) return name;
    
    // Convert name to uppercase letters separated by dashes
    const spelledName = name.toUpperCase().split('').filter(char => char !== ' ').join('-');
    return spelledName;
  }

  /**
   * Generate response asking user to spell their name
   * @param {string} name - Tentative name (if provided)
   * @returns {string} Response asking for spelling
   */
  generateNameSpellingRequest(name) {
    if (name) {
      return `I heard ${name}. Could you please spell that out for me?`;
    }
    return "Could you please spell out your name for me?";
  }

  /**
   * Generate confirmation response spelling the name back
   * @param {string} name - User's name
   * @returns {string} Confirmation response
   */
  generateNameConfirmationResponse(name) {
    const spelledName = this.spellName(name);
    return `Let me confirm - that's ${spelledName}. Is that correct?`;
  }

  /**
   * Generate confirmation response spelling the email back
   * @param {string} email - User's email
   * @returns {string} Confirmation response
   */
  generateEmailConfirmationResponse(email) {
    if (!email) return "";
    
    const [localPart, domain] = email.split('@');
    const spelledLocal = localPart.toLowerCase().split('').join('-');
    const spelledDomain = domain.toLowerCase().split('.').map(part => part.split('').join('-')).join(' dot ');
    
    return `Let me confirm - that's ${spelledLocal} at ${spelledDomain}. Is that correct?`;
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
    
    // Spell out the local part character by character
    const spelledLocal = localPart.split('').join('-');
    
    return `${spelledLocal} at ${domain}`;
  }

  /**
   * Normalize email address to remove extra spaces and fix formatting
   * Fixes issues like "Sherpa prompt .com" → "sherpaprompt.com"
   * Converts "at" to "@" and "dot" to "."
   * Handles letter-by-letter spelled emails (j-o-h-n at g-m-a-i-l dot c-o-m)
   * @param {string} email - Raw email address
   * @returns {string} Normalized email
   */
  normalizeEmail(email) {
    if (!email) return email;
    
    // Convert to lowercase first
    let normalized = email.toLowerCase();
    
    // Handle letter-by-letter spelled emails: remove dashes and spaces from letter sequences
    // Pattern: letter-dash-letter-dash... or letter space letter space... (like j-o-h-n or F A I Y A Z)
    // We need to preserve dashes/spaces that are part of email format (like test-name@domain)
    // but remove dashes/spaces from spelled-out letters
    
    // Split by common separators to identify parts
    // Replace " at " first to mark the separator, then we can process parts separately
    normalized = normalized.replace(/\s+at\s+/gi, ' AT_SEPARATOR ');
    normalized = normalized.replace(/\s+dot\s+/gi, ' DOT_SEPARATOR ');
    
    // Remove spaces and dashes from letter-by-letter spellings
    // Pattern: single letter-space/dash-single letter sequences (repeat until no more matches)
    // This handles cases like j-o-h-n, j o h n, F A I Y A Z, or F-A-I-Y-A-Z
    let previousNormalized = '';
    while (previousNormalized !== normalized) {
      previousNormalized = normalized;
      // Remove dashes between letters
      normalized = normalized.replace(/([a-z0-9])-([a-z0-9])/gi, '$1$2');
      // Remove spaces between letters/numbers (but not around separators)
      normalized = normalized.replace(/([a-z0-9])\s+([a-z0-9])/gi, '$1$2');
    }
    
    // Replace separator markers with proper symbols
    normalized = normalized.replace(/\s*AT_SEPARATOR\s*/gi, '@');
    normalized = normalized.replace(/\s*DOT_SEPARATOR\s*/gi, '.');
    
    // Replace " dot " or "dot" with "." (handle spaces around dot) - for any remaining
    normalized = normalized.replace(/\s*dot\s*/gi, '.');
    
    // Replace " at " or "at" with "@" (handle spaces around at) - for any remaining
    normalized = normalized.replace(/\s*at\s*/gi, '@');
    
    // Remove all remaining spaces
    normalized = normalized.replace(/\s+/g, '');
    
    // Fix missing @ symbol (e.g., "dougatgmail.com" → "doug@gmail.com")
    // Look for pattern: word+at+domain (in case "at" wasn't replaced above)
    if (!normalized.includes('@')) {
      const atPattern = /^([a-z0-9._-]+)at([a-z0-9.-]+\.[a-z]{2,})$/i;
      const match = normalized.match(atPattern);
      if (match) {
        normalized = `${match[1]}@${match[2]}`;
        console.log('📧 [Email Fix] Added missing @ symbol:', { original: email, fixed: normalized });
      }
    }
    
    // Ensure there's only one @ symbol and it's properly placed
    const parts = normalized.split('@');
    if (parts.length === 2) {
      const [localPart, domain] = parts;
      // Remove any invalid characters (but keep valid email chars: letters, numbers, dots, underscores, hyphens)
      const cleanLocal = localPart.replace(/[^a-z0-9._-]/g, '');
      const cleanDomain = domain.replace(/[^a-z0-9.-]/g, '');
      normalized = `${cleanLocal}@${cleanDomain}`;
    } else if (parts.length > 2) {
      // Multiple @ symbols - take first as local part, join rest as domain
      const localPart = parts[0];
      const domain = parts.slice(1).join('@');
      const cleanLocal = localPart.replace(/[^a-z0-9._-]/g, '');
      const cleanDomain = domain.replace(/[^a-z0-9.-]/g, '');
      normalized = `${cleanLocal}@${cleanDomain}`;
    }
    
    console.log('📧 [Email Normalization]', { original: email, normalized });
    return normalized;
  }

  /**
   * Generate completion response
   * @param {string} name - User's name
   * @param {string} email - User's email
   * @returns {string} Completion response
   */
  generateCompletionResponse(name, email) {
    const spelledEmail = this.spellEmailLocalPart(email);
    return `Thanks ${name}! I've got your email as ${spelledEmail}. Is that correct?`;
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
      console.log('📝 [UserInfoCollector] Extraction result:', extracted);
      console.log('📝 [UserInfoCollector] Current user info before update:', currentUserInfo);
      
      const updatedUserInfo = { ...currentUserInfo };
      let response;
      
      // Check if this is a confirmation response (yes, correct, that's right, etc.)
      const isConfirmation = /^(yes|yeah|yep|yup|correct|right|that's right|that's correct|that's it|exactly|sure|ok|okay|confirm)$/i.test(text.trim());
      
      // Check if we're waiting for name spelling confirmation
      if (currentUserInfo.waitingForNameConfirmation) {
        if (isConfirmation) {
          // User confirmed the name spelling, proceed
          updatedUserInfo.nameConfirmed = true;
          updatedUserInfo.waitingForNameConfirmation = false;
          
          // If we also have email, check if we need to confirm it
          if (updatedUserInfo.email && !updatedUserInfo.emailConfirmed) {
            response = this.generateEmailConfirmationResponse(updatedUserInfo.email);
            updatedUserInfo.waitingForEmailConfirmation = true;
          } else if (updatedUserInfo.email && updatedUserInfo.emailConfirmed) {
            // Both confirmed, collection complete
            updatedUserInfo.collected = true;
            response = `Thanks ${updatedUserInfo.name}! How can I help you today? Do you have questions about our automation services?`;
          } else {
            // Name confirmed, but no email yet
            response = `Thanks ${updatedUserInfo.name}! How can I help you today? Do you have questions about our automation services?`;
          }
        } else {
          // User said it's wrong, ask them to spell again
          updatedUserInfo.name = null;
          updatedUserInfo.waitingForNameConfirmation = false;
          updatedUserInfo.waitingForNameSpelling = true;
          response = "I apologize for the error. Could you please spell out your name again?";
        }
      }
      // Check if we're waiting for user to spell their name (after we asked)
      else if (currentUserInfo.waitingForNameSpelling && extracted.name) {
        // User spelled their name, confirm by spelling back
        updatedUserInfo.name = extracted.name;
        updatedUserInfo.waitingForNameSpelling = false;
        response = this.generateNameConfirmationResponse(updatedUserInfo.name);
        updatedUserInfo.waitingForNameConfirmation = true;
      }
      // Check if we're waiting for email spelling confirmation
      else if (currentUserInfo.waitingForEmailConfirmation) {
        if (isConfirmation) {
          // Email confirmed, collection complete if we have name
          updatedUserInfo.emailConfirmed = true;
          updatedUserInfo.waitingForEmailConfirmation = false;
          
          if (updatedUserInfo.name && updatedUserInfo.nameConfirmed) {
            updatedUserInfo.collected = true;
            response = `Thanks ${updatedUserInfo.name}! How can I help you today? Do you have questions about our automation services?`;
          } else {
            response = "Thanks! How can I help you today? Do you have questions about our automation services?";
          }
        } else {
          // Email is wrong, ask to spell again
          updatedUserInfo.email = null;
          updatedUserInfo.waitingForEmailConfirmation = false;
          updatedUserInfo.waitingForEmailSpelling = true;
          response = "I apologize for the error. Could you please spell out your email address again?";
        }
      }
      // Check if we're waiting for user to spell their email (after we asked)
      else if (currentUserInfo.waitingForEmailSpelling && extracted.email) {
        // User spelled their email, confirm by spelling back
        updatedUserInfo.email = this.normalizeEmail(extracted.email);
        updatedUserInfo.waitingForEmailSpelling = false;
        response = this.generateEmailConfirmationResponse(updatedUserInfo.email);
        updatedUserInfo.waitingForEmailConfirmation = true;
      }
      // New name provided - need to ask for spelling
      else if (extracted.name && !currentUserInfo.name) {
        // Check if name was already spelled out (contains dashes between letters)
        const wasSpelled = /^[A-Z](\s*-\s*[A-Z])+(\s+[A-Z](\s*-\s*[A-Z])+)?$/i.test(text.trim()) || 
                          /^([A-Z]\s+){2,}[A-Z]$/i.test(text.trim());
        
        if (wasSpelled) {
          // Name was spelled, confirm by spelling back
          updatedUserInfo.name = extracted.name;
          response = this.generateNameConfirmationResponse(updatedUserInfo.name);
          updatedUserInfo.waitingForNameConfirmation = true;
        } else {
          // Name was not spelled, ask for spelling
          updatedUserInfo.name = extracted.name;
          updatedUserInfo.waitingForNameSpelling = true;
          response = this.generateNameSpellingRequest(extracted.name);
        }
      }
      // Name was spelled out - confirm by spelling back
      // Only trigger if not already waiting for confirmation and name needs confirmation
      else if (extracted.name && !currentUserInfo.nameConfirmed && !currentUserInfo.waitingForNameConfirmation) {
        updatedUserInfo.name = extracted.name;
        response = this.generateNameConfirmationResponse(extracted.name);
        updatedUserInfo.waitingForNameConfirmation = true;
      }
      // New email provided - need to ask for spelling if not already spelled
      else if (extracted.email && !currentUserInfo.email) {
        // Check if email was already spelled out (contains dashes or 'at'/'dot')
        const wasSpelled = /[-]|at|dot/i.test(text);
        
        if (wasSpelled) {
          // Email was spelled, confirm by spelling back
          updatedUserInfo.email = this.normalizeEmail(extracted.email);
          response = this.generateEmailConfirmationResponse(updatedUserInfo.email);
          updatedUserInfo.waitingForEmailConfirmation = true;
        } else {
          // Email was not spelled, ask for spelling
          updatedUserInfo.email = this.normalizeEmail(extracted.email);
          updatedUserInfo.waitingForEmailSpelling = true;
          response = "Could you please spell out your email address?";
        }
      }
      // Email was spelled out - confirm by spelling back (only if not already confirmed)
      else if (extracted.email && !currentUserInfo.emailConfirmed && currentUserInfo.email) {
        updatedUserInfo.email = this.normalizeEmail(extracted.email);
        response = this.generateEmailConfirmationResponse(updatedUserInfo.email);
        updatedUserInfo.waitingForEmailConfirmation = true;
      }
      // If email is already confirmed, ignore any email mentions in the text
      else if (extracted.email && currentUserInfo.emailConfirmed) {
        // Email already confirmed, don't repeat it - just continue with conversation
        console.log('📧 [UserInfoCollector] Email already confirmed, ignoring email mention in text');
        response = updatedUserInfo.name 
          ? `Thanks ${updatedUserInfo.name}! How can I help you today?` 
          : "How can I help you today?";
      }
      // Update existing info if provided
      else {
        if (extracted.name && !updatedUserInfo.nameConfirmed) {
          updatedUserInfo.name = extracted.name;
        }
        // Only update email if it's not already confirmed
        if (extracted.email && !updatedUserInfo.emailConfirmed) {
          updatedUserInfo.email = this.normalizeEmail(extracted.email);
        }
        
        // Check if we now have both name AND email (either from extraction or existing)
        if (updatedUserInfo.name && updatedUserInfo.email && updatedUserInfo.nameConfirmed && updatedUserInfo.emailConfirmed) {
          updatedUserInfo.collected = true;
          response = `Thanks ${updatedUserInfo.name}! How can I help you today? Do you have questions about our automation services?`;
          console.log('✅ [UserInfoCollector] Collection complete - have both name and email confirmed');
        } else {
          response = this.generateMissingInfoResponse(updatedUserInfo);
          console.log('⏳ [UserInfoCollector] Still missing:', {
            needsName: !updatedUserInfo.name || !updatedUserInfo.nameConfirmed,
            needsEmail: !updatedUserInfo.email || !updatedUserInfo.emailConfirmed,
            waitingForNameConfirmation: updatedUserInfo.waitingForNameConfirmation,
            waitingForEmailConfirmation: updatedUserInfo.waitingForEmailConfirmation
          });
        }
      }
      
      console.log('📝 [UserInfoCollector] Updated user info:', updatedUserInfo);
      
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

CRITICAL PRIORITY RULES:
1. If user provides SPELLING (e.g., "it's spelled A-Z-M-A-I-N"), USE THE SPELLED VERSION
2. Examples of spelling patterns:
   - "my name is John, it's spelled J-O-H-N" → use "JOHN"
   - "my name is Osman, it's spelled A-Z-M-A-I-N" → use "AZMAIN"
3. Spelled-out names ALWAYS take priority over casual mentions
4. Handle corrections, spelling, and filler words
5. Look for patterns like:
   - "my name is actually..."
   - "call me..."
   - "my name should be..."
   - "change my name to..."
   - "it's spelled..."

Return ONLY: {"name": "John Doe"}`;

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
        reasoning: { effort: "minimal" },
        max_output_tokens: 100,
        temperature: 0.1
      });
      
      const emailData = JSON.parse(response);
      
      // Normalize the email: remove extra spaces and ensure proper format
      const normalizedEmail = this.normalizeEmail(emailData.email);
      
      return {
        success: true,
        email: normalizedEmail
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
      /call.*me/i,
      /name.*wrong/i,
      /got.*name.*wrong/i,
      /you.*have.*my.*name.*wrong/i,
      /please.*change.*it.*to/i,
      /need.*to.*change.*it/i,
      /i.*need.*to.*change.*them/i,
      /change.*them/i,
      /name.*spelled/i,
      /spelled.*name/i
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
      /email.*address.*is/i,
      /email.*actually/i,
      /the email.*is/i,
      /email.*correct/i,
      /real email/i,
      /right email/i,
      /email.*wrong/i,
      /got.*email.*wrong/i,
      /you.*have.*my.*email.*wrong/i,
      /email.*as.*well/i,
      /i.*need.*to.*change.*them/i,
      /change.*them/i,
      /email.*spelled/i,
      /spelled.*email/i
    ];
    
    return emailChangePatterns.some(pattern => pattern.test(text));
  }
}

module.exports = { UserInfoCollector };
