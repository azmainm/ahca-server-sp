/**
 * IntentClassifier - Classifies user intents (goodbye, appointment, question)
 */

class IntentClassifier {
  constructor() {
    // Keep existing patterns
    this.patterns = {
      goodbye: [
        /thank you.*no more/i,
        /that.*all.*need/i,
        /goodbye/i,
        /bye/i,
        /done.*questions/i,
        /satisfied/i,
        /that.*help.*needed/i,
        /that.*all/i
      ],
      appointment: [
        /set.*appointment/i,
        /schedule.*appointment/i,
        /book.*appointment/i,
        /make.*appointment/i,
        /schedule.*meeting/i,
        /book.*meeting/i,
        /set.*meeting/i,
        /want.*appointment/i,
        /need.*appointment/i,
        /appointment.*please/i,
        /schedule.*consultation/i,
        /book.*consultation/i,
        /demo/i,
        /schedule.*demo/i,
        /book.*demo/i,
        /show.*me/i
      ],
      nameChange: [
        /^change.*name/i,
        /^update.*name/i,
        /^my name.*is/i,
        /^actually.*my.*name/i,
        /^correct.*name/i,
        /^wrong.*name/i,
        /^name.*should.*be/i,
        /^call.*me/i
      ],
      emailChange: [
        /^change.*email/i,
        /^update.*email/i,
        /^my email.*is/i,
        /^actually.*my.*email/i,
        /^correct.*email/i,
        /^wrong.*email/i,
        /^email.*should.*be/i,
        /^email.*address.*is/i,
        /^the email.*is/i,
        /^real email/i,
        /^right email/i
      ],
      followUpPositive: [
        /yes/i,
        /more/i,
        /another/i,
        /other/i,
        /question/i
      ],
      followUpAppointment: [
        /appointment/i,
        /schedule/i,
        /meeting/i,
        /consultation/i,
        /book/i,
        /demo/i
      ]
    };
    
    // Load additional patterns from JSON (safe fallback)
    this.loadSherpaPromptPatterns();
  }
  
  /**
   * Load SherpaPrompt-specific patterns from Intent Snippets JSON
   * Safe implementation - won't break if file doesn't exist
   */
  loadSherpaPromptPatterns() {
    try {
      const intentSnippets = require('../../../data/SherpaPrompt_AHCA_Knowledge/Intent Snippets_1.3.json');
      const intents = intentSnippets.sections[0].structured.intents;
      
      // Extract patterns by intent type
      const sherpaPatterns = {
        sales: [],
        support: [],
        scheduling: [],
        pricing: [],
        emergency: []
      };
      
      // Convert utterances to regex patterns
      intents.forEach(item => {
        if (sherpaPatterns[item.intent]) {
          // Convert utterance to simple regex pattern
          const pattern = new RegExp(item.utterance.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          sherpaPatterns[item.intent].push(pattern);
        }
      });
      
      // Add to existing patterns (don't replace)
      this.patterns = {
        ...this.patterns,
        ...sherpaPatterns
      };
      
      console.log('✅ Loaded SherpaPrompt intent patterns from JSON');
    } catch (error) {
      console.warn('⚠️ Could not load Intent Snippets, using default patterns:', error.message);
      // System continues to work with existing patterns
    }
  }

  /**
   * Classify user intent from text
   * @param {string} text - User input text
   * @returns {Object} Classification result
   */
  classifyIntent(text) {
    const results = {
      isGoodbye: this.matchesPatterns(text, this.patterns.goodbye),
      isAppointmentRequest: this.matchesPatterns(text, this.patterns.appointment),
      isNameChange: this.matchesPatterns(text, this.patterns.nameChange),
      isEmailChange: this.matchesPatterns(text, this.patterns.emailChange),
      wantsMoreQuestions: this.matchesPatterns(text, this.patterns.followUpPositive),
      wantsAppointment: this.matchesPatterns(text, this.patterns.followUpAppointment),
      // SherpaPrompt-specific intents
      isSalesInquiry: this.patterns.sales ? this.matchesPatterns(text, this.patterns.sales) : false,
      isSupportRequest: this.patterns.support ? this.matchesPatterns(text, this.patterns.support) : false,
      isSchedulingRequest: this.patterns.scheduling ? this.matchesPatterns(text, this.patterns.scheduling) : false,
      isPricingInquiry: this.patterns.pricing ? this.matchesPatterns(text, this.patterns.pricing) : false,
      isEmergency: this.patterns.emergency ? this.matchesPatterns(text, this.patterns.emergency) : false
    };

    // Determine primary intent with SherpaPrompt priorities
    let primaryIntent = 'unknown';
    if (results.isGoodbye) primaryIntent = 'goodbye';
    else if (results.isEmergency) primaryIntent = 'emergency';
    else if (results.isAppointmentRequest || results.isSchedulingRequest) primaryIntent = 'appointment';
    else if (results.isNameChange) primaryIntent = 'nameChange';
    else if (results.isEmailChange) primaryIntent = 'emailChange';
    else if (results.isPricingInquiry) primaryIntent = 'pricing';
    else if (results.isSalesInquiry) primaryIntent = 'sales';
    else if (results.isSupportRequest) primaryIntent = 'support';
    else if (results.wantsMoreQuestions) primaryIntent = 'moreQuestions';
    else if (results.wantsAppointment) primaryIntent = 'appointmentFromFollowUp';

    return {
      primaryIntent,
      ...results,
      confidence: this.calculateConfidence(text, results)
    };
  }

  /**
   * Check if text matches any of the given patterns
   * @param {string} text - Input text
   * @param {Array} patterns - Array of regex patterns
   * @returns {boolean} Whether text matches any pattern
   */
  matchesPatterns(text, patterns) {
    // Skip if text contains negation
    if (/don't|do not|not|no need|don't need/i.test(text)) {
      return false;
    }
    return patterns.some(pattern => pattern.test(text));
  }

  /**
   * Calculate confidence score for classification
   * @param {string} text - Input text
   * @param {Object} results - Classification results
   * @returns {number} Confidence score (0-1)
   */
  calculateConfidence(text, results) {
    const textLength = text.split(' ').length;
    const matchCount = Object.values(results).filter(Boolean).length;
    
    // Higher confidence for shorter, more direct statements
    // Lower confidence for longer, ambiguous text
    let confidence = 0.5;
    
    if (matchCount === 1) {
      confidence = Math.min(0.9, 0.7 + (10 - textLength) * 0.02);
    } else if (matchCount > 1) {
      confidence = 0.6; // Multiple matches reduce confidence
    } else {
      confidence = 0.3; // No clear matches
    }
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  /**
   * Check if text is a goodbye intent
   * @param {string} text - User input text
   * @returns {boolean} Whether text is goodbye
   */
  isGoodbye(text) {
    return this.matchesPatterns(text, this.patterns.goodbye);
  }

  /**
   * Check if text is an appointment request
   * @param {string} text - User input text
   * @returns {boolean} Whether text is appointment request
   */
  isAppointmentRequest(text) {
    return this.matchesPatterns(text, this.patterns.appointment);
  }

  /**
   * Check if text is a name change request
   * @param {string} text - User input text
   * @returns {boolean} Whether text is name change request
   */
  isNameChangeRequest(text) {
    return this.matchesPatterns(text, this.patterns.nameChange);
  }

  /**
   * Check if text is an email change request
   * @param {string} text - User input text
   * @returns {boolean} Whether text is email change request
   */
  isEmailChangeRequest(text) {
    return this.matchesPatterns(text, this.patterns.emailChange);
  }

  /**
   * Check if text indicates user wants more questions
   * @param {string} text - User input text
   * @returns {boolean} Whether user wants more questions
   */
  wantsMoreQuestions(text) {
    return this.matchesPatterns(text, this.patterns.followUpPositive);
  }

  /**
   * Check if text indicates user wants appointment
   * @param {string} text - User input text
   * @returns {boolean} Whether user wants appointment
   */
  wantsAppointment(text) {
    return this.matchesPatterns(text, this.patterns.followUpAppointment);
  }

  /**
   * Add custom pattern to an intent category
   * @param {string} category - Intent category
   * @param {RegExp} pattern - Regex pattern to add
   */
  addPattern(category, pattern) {
    if (this.patterns[category]) {
      this.patterns[category].push(pattern);
    } else {
      console.warn(`Unknown intent category: ${category}`);
    }
  }

  /**
   * Remove pattern from an intent category
   * @param {string} category - Intent category
   * @param {RegExp} pattern - Regex pattern to remove
   */
  removePattern(category, pattern) {
    if (this.patterns[category]) {
      const index = this.patterns[category].findIndex(p => p.toString() === pattern.toString());
      if (index > -1) {
        this.patterns[category].splice(index, 1);
      }
    }
  }

  /**
   * Get all patterns for a category
   * @param {string} category - Intent category
   * @returns {Array} Array of patterns
   */
  getPatterns(category) {
    return this.patterns[category] || [];
  }

  /**
   * Get all available intent categories
   * @returns {Array} Array of category names
   */
  getCategories() {
    return Object.keys(this.patterns);
  }

  /**
   * Test text against specific category
   * @param {string} text - Input text
   * @param {string} category - Intent category to test
   * @returns {Object} Test result with matches
   */
  testCategory(text, category) {
    if (!this.patterns[category]) {
      return { success: false, error: `Unknown category: ${category}` };
    }

    const patterns = this.patterns[category];
    const matches = patterns.filter(pattern => pattern.test(text));
    
    return {
      success: true,
      category,
      matches: matches.length,
      matchedPatterns: matches.map(p => p.toString()),
      isMatch: matches.length > 0
    };
  }

  /**
   * Analyze text for all intents with detailed results
   * @param {string} text - Input text
   * @returns {Object} Detailed analysis results
   */
  analyzeText(text) {
    const results = {};
    
    for (const category of Object.keys(this.patterns)) {
      results[category] = this.testCategory(text, category);
    }
    
    const classification = this.classifyIntent(text);
    
    return {
      text,
      classification,
      detailedResults: results,
      timestamp: new Date()
    };
  }
}

module.exports = { IntentClassifier };
