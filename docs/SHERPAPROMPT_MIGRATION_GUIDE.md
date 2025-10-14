# SherpaPrompt Voice Agent Migration Guide

## Overview

This document provides a streamlined guide for migrating the After Hours Call Agent (AHCA) system from a fencing company context to SherpaPrompt's voice automation platform. The migration transforms the system from handling fencing inquiries to managing SherpaPrompt product questions, demos, and customer onboarding.

## Table of Contents

1. [Current System Status](#current-system-status)
2. [Migration Strategy Overview](#migration-strategy-overview)
3. [Content Updates](#content-updates)
4. [Service Rename](#service-rename)
5. [Intent Pattern Updates](#intent-pattern-updates)
6. [Implementation Steps](#implementation-steps)
7. [Testing & Validation](#testing--validation)

---

## Current System Status

### ✅ What's Already Working Perfectly

The AHCA system has a robust foundation that requires minimal changes:

- **Voice Agent Architecture**: VAD-enabled voice agent with real-time processing
- **Knowledge Base Processing**: Core SherpaPrompt files already processed into vector database
- **RAG System**: FencingRAG service works well, just needs content updates
- **Conversation Flow**: ConversationFlowHandler, IntentClassifier, and other services are well-architected
- **Calendar Integration**: Appointment booking with Microsoft/Google Calendar works
- **CRM Integration**: Lead capture and management is functional

### Current Knowledge Base Structure
- **Core Knowledge**: 3 files processed into 50 semantic chunks (company_mission_1.1.json, product_knowledge_1.2.json, pricing_1.1.json)
- **Local Reference**: Behavioral files (playbooks, troubleshooting) used as local configuration

---

## Migration Strategy Overview

### Core Principle: Simple Content Updates

The migration is primarily about updating content and branding rather than architectural changes:

1. **Content Updates**: Replace fencing references with SherpaPrompt branding
2. **Service Rename**: Rename FencingRAG to SherpaPromptRAG for clarity
3. **Intent Pattern Updates**: Add SherpaPrompt-specific intent patterns

### Migration Benefits
1. **Contextual Accuracy**: Agent speaks about SherpaPrompt products instead of fencing
2. **Brand Consistency**: Proper SherpaPrompt messaging and terminology
3. **Enhanced Intent Recognition**: Better understanding of SherpaPrompt-specific queries

---

## Content Updates

### 1. Update System Prompts

**File**: `/shared/services/SherpaPromptRAG.js`

```javascript
// Updated system prompt for SherpaPrompt
this.chatPrompt = ChatPromptTemplate.fromMessages([
  SystemMessagePromptTemplate.fromTemplate(`
You are a helpful AI assistant for SherpaPrompt - the automation platform that turns conversations into outcomes.

SherpaPrompt offers four core products:
1. Call Service Automation: AI agents that handle customer calls, qualify leads, and schedule appointments
2. Transcript to Task: Extract action items from meeting transcripts and create tasks in project management tools
3. Voice to Estimate: Create detailed estimates through voice commands, perfect for field work
4. SherpaPrompt App: Prompt orchestration and management platform

Guidelines:
- Answer ONLY what the user specifically asked - be direct and focused
- Use conversational language suitable for voice responses
- If discussing pricing, refer to our transparent pricing tiers
- For technical questions, explain integrations and capabilities clearly
- Always offer next steps like demos, trials, or consultations
- Never provide contact information unless specifically asked
- Replace technical symbols: use "is" instead of "=", "to" instead of "-" in ranges

Context from relevant knowledge base sections:
{context}`),
  HumanMessagePromptTemplate.fromTemplate("{question}")
]);
```

### 2. Update Initial Greeting

**File**: `/features/voice-agent/services/ResponseGenerator.js`

```javascript
// Update greeting message
const initialGreeting = "Hi there! Welcome to SherpaPrompt, the automation platform that turns conversations into outcomes. I'm here to help you learn about our automation solutions. Could you tell me your name and email address to get started?";
```

### 3. Update Response Templates

**File**: `/features/voice-agent/services/ResponseGenerator.js`

```javascript
generateGoodbyeResponse(userName = 'there') {
  return `Thank you, ${userName}! I hope SherpaPrompt can help automate your workflows and turn your conversations into outcomes. Have a great day!`;
}

generateProductInfoResponse(productArea) {
  const responses = {
    'call_service': "SherpaPrompt's Call Service Automation handles customer calls with AI agents that can qualify leads, schedule appointments, and integrate with your CRM - all while maintaining natural conversation flow.",
    'transcript_service': "Our Transcript to Task feature extracts action items from meeting recordings and automatically creates tasks in your project management tools like ClickUp, Asana, or Microsoft Planner.",
    'voice_to_estimate': "Voice to Estimate lets you create detailed estimates hands-free using voice commands, perfect for field work where typing isn't practical.",
    'app': "The SherpaPrompt App orchestrates prompts and manages your automation workflows across all our services, giving you complete control over your AI assistants."
  };
  
  return responses[productArea] || "SherpaPrompt turns conversations into outcomes through our four core automation services: Call Service, Transcript to Task, Voice to Estimate, and our orchestration App.";
}

generateDemoOfferResponse() {
  return "I'd be happy to show you SherpaPrompt in action! To schedule your personalized demo, I'll need to collect a few details. What's the best email address to send you the demo link and calendar invite?";
}

generatePricingResponse() {
  return "SherpaPrompt offers transparent pricing tiers designed to scale with your business. We have options for small teams starting at our Starter tier, growing businesses with our Professional tier, and Enterprise solutions with custom integrations. Would you like me to walk you through the specific features and pricing for each tier?";
}
```

---

## Service Rename

### 1. Create SherpaPromptRAG Service

**File**: `/shared/services/SherpaPromptRAG.js`

Create a new file that extends the existing FencingRAG functionality with SherpaPrompt-specific content:

```javascript
const { ChatOpenAI } = require('@langchain/openai');
const { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } = require('langchain/prompts');
const { RunnableSequence } = require('langchain/schema/runnable');
const { StringOutputParser } = require('langchain/schema/output_parser');
const { z } = require('zod');

/**
 * LangChain-based RAG system for SherpaPrompt knowledge base
 */
class SherpaPromptRAG {
  constructor() {
    this.llm = new ChatOpenAI({
      modelName: 'gpt-5-nano',
      max_tokens: 1000,
    });

    // Define response schema for structured output
    this.responseSchema = z.object({
      answer: z.string().describe("The main response to the user's question"),
      confidence: z.enum(['high', 'medium', 'low']).describe("Confidence level in the answer based on available context"),
      sources_used: z.array(z.string()).describe("List of knowledge base sections that provided relevant information"),
      follow_up_questions: z.array(z.string()).optional().describe("Suggested follow-up questions the user might ask")
    });

    // Create ChatPromptTemplate with system and human messages
    this.chatPrompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(`
You are a helpful AI assistant for SherpaPrompt - the automation platform that turns conversations into outcomes.

SherpaPrompt offers four core products:
1. Call Service Automation: AI agents that handle customer calls, qualify leads, and schedule appointments
2. Transcript to Task: Extract action items from meeting transcripts and create tasks in project management tools
3. Voice to Estimate: Create detailed estimates through voice commands, perfect for field work
4. SherpaPrompt App: Prompt orchestration and management platform

Guidelines:
- Answer ONLY what the user specifically asked - be direct and focused
- Use conversational language suitable for voice responses
- If discussing pricing, refer to our transparent pricing tiers
- For technical questions, explain integrations and capabilities clearly
- Always offer next steps like demos, trials, or consultations
- Never provide contact information unless specifically asked
- Replace technical symbols: use "is" instead of "=", "to" instead of "-" in ranges

Context from relevant knowledge base sections:
{context}`),
      HumanMessagePromptTemplate.fromTemplate("{question}")
    ]);

    // Create output parser for string responses
    this.outputParser = new StringOutputParser();

    // Create RAG chain
    this.ragChain = RunnableSequence.from([
      this.chatPrompt,
      this.llm,
      this.outputParser,
    ]);
  }

  // Copy all existing methods from FencingRAG.js
  // (generateResponse, formatContext, generateFollowUpQuestions)
  // ... [Include all existing methods with same implementation]
}

module.exports = { SherpaPromptRAG };
```

### 2. Update FencingRAG for Backward Compatibility

**File**: `/shared/services/FencingRAG.js`

```javascript
const { SherpaPromptRAG } = require('./SherpaPromptRAG');

console.warn('⚠️ FencingRAG is deprecated. Use SherpaPromptRAG instead.');

// Backward compatibility export
class FencingRAG extends SherpaPromptRAG {
  constructor() {
    super();
    console.warn('⚠️ Please update imports to use SherpaPromptRAG');
  }
}

module.exports = { FencingRAG, SherpaPromptRAG };
```

### 3. Update Imports

**File**: `/features/voice-agent/services/ConversationFlowHandler.js`

```javascript
// Update import
const { SherpaPromptRAG } = require('../../../shared/services/SherpaPromptRAG');

// Update initialization
const sherpaPromptRAG = new SherpaPromptRAG();
```

---

## Intent Pattern Updates

### Update Intent Classification Patterns

**File**: `/features/voice-agent/services/IntentClassifier.js`

Add SherpaPrompt-specific intent patterns:

```javascript
class IntentClassifier {
  constructor() {
    this.patterns = {
      // SherpaPrompt specific intents
      productInquiry: [
        /what.*sherpaprompt.*do/i,
        /how.*call.*automation.*work/i,
        /transcript.*task/i,
        /voice.*estimate/i,
        /prompt.*orchestration/i,
        /automation.*platform/i,
        /turn.*conversations.*outcomes/i
      ],
      pricingInquiry: [
        /how much.*cost/i,
        /pricing.*plan/i,
        /trial.*available/i,
        /enterprise.*pricing/i,
        /what.*price/i,
        /starter.*tier/i,
        /professional.*tier/i
      ],
      integrationQuestion: [
        /integrate.*with/i,
        /connect.*crm/i,
        /api.*available/i,
        /salesforce.*integration/i,
        /microsoft.*integration/i,
        /hubspot.*integration/i,
        /clickup.*integration/i,
        /asana.*integration/i
      ],
      demoRequest: [
        /demo/i,
        /show.*how/i,
        /walkthrough/i,
        /see.*action/i,
        /schedule.*demo/i,
        /personalized.*demo/i
      ],
      supportRequest: [
        /help.*setup/i,
        /troubleshoot/i,
        /not.*working/i,
        /error/i,
        /support/i,
        /technical.*help/i
      ],
      
      // Keep existing patterns for goodbye, appointment, etc.
      goodbye: [
        /thank you.*no more/i,
        /that.*all.*need/i,
        /goodbye/i,
        /bye/i,
        /done.*questions/i
      ],
      
      appointmentRequest: [
        /schedule.*appointment/i,
        /book.*meeting/i,
        /calendar.*invite/i,
        /set.*up.*call/i
      ]
    };
  }
  
  // Keep existing classifyIntent method unchanged
}
```

---

## Enhanced Intent Recognition

### Load Intent Snippets from JSON (Simple & Safe)

**File**: `/features/voice-agent/services/IntentClassifier.js`

Add this method to load patterns from the JSON file without breaking existing functionality:

```javascript
class IntentClassifier {
  constructor() {
    // Keep existing patterns
    this.patterns = {
      goodbye: [
        /thank you.*no more/i,
        /that.*all.*need/i,
        /goodbye/i,
        /bye/i,
        /done.*questions/i
      ],
      // ... existing patterns
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
  
  // Keep existing classifyIntent method unchanged
}
```

---

## Basic Audience Detection

### Simple Audience-Aware Responses (Safe Enhancement)

**File**: `/features/voice-agent/services/ResponseGenerator.js`

Add audience detection without changing core functionality:

```javascript
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
      const playbooks = require('../../../data/SherpaPrompt_AHCA_Knowledge/audience_playbooks_1.2.json');
      
      // Simple audience keywords for detection
      this.audienceKeywords = {
        developers: ['developer', 'dev', 'programmer', 'code', 'api', 'technical', 'integration'],
        trades: ['contractor', 'construction', 'field', 'job site', 'trades', 'foreman', 'crew'],
        enterprise: ['enterprise', 'corporate', 'company', 'organization', 'business', 'team'],
        marketing: ['marketing', 'content', 'campaign', 'brand', 'social media']
      };
      
      console.log('✅ Loaded audience playbooks for response customization');
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
  
  // Update existing methods to use audience detection
  async generateConversationalResponse(text, conversationHistory = [], userInfo = {}) {
    // ... existing implementation ...
    
    // Detect audience and enhance response
    const audience = this.detectAudience(conversationHistory);
    const enhancedResponse = this.enhanceResponseForAudience(response, audience);
    
    return enhancedResponse;
  }
  
  // Keep all existing methods unchanged
}
```

---

## Implementation Steps

### Phase 1: Content Updates (30 minutes)

1. **Update System Prompts**
   - Create new SherpaPromptRAG.js with updated system prompt
   - Update ResponseGenerator greeting and response templates

2. **Update Company References**
   - Replace any hardcoded "fencing" references with "SherpaPrompt"
   - Update product descriptions and company tagline

### Phase 2: Service Rename (15 minutes)

1. **Create SherpaPromptRAG Service**
   - Copy FencingRAG functionality to new SherpaPromptRAG.js
   - Update system prompt and branding

2. **Maintain Backward Compatibility**
   - Update FencingRAG.js to extend SherpaPromptRAG
   - Add deprecation warnings

3. **Update Imports**
   - Update ConversationFlowHandler to use SherpaPromptRAG
   - Update any other files importing FencingRAG

### Phase 3: Intent Pattern Updates (15 minutes)

1. **Add SherpaPrompt Intent Patterns**
   - Update IntentClassifier with SherpaPrompt-specific patterns
   - Add patterns for the 4 core products
   - Include integration and pricing patterns

### Phase 4: Enhanced Intent Recognition (15 minutes)

1. **Load Intent Snippets from JSON**
   - Add method to load patterns from Intent Snippets_1.3.json
   - Enhance existing patterns with SherpaPrompt-specific examples
   - Keep existing patterns for backward compatibility

### Phase 5: Basic Audience Detection (30 minutes)

1. **Simple Audience-Aware Responses**
   - Add basic audience detection in ResponseGenerator
   - Load audience playbooks for response customization
   - Add audience-specific follow-up suggestions

### Phase 6: Testing (30 minutes)

1. **Test Knowledge Base Queries**
   - Verify RAG returns SherpaPrompt content
   - Test product-specific questions
   - Verify pricing information accuracy

2. **Test Enhanced Intent Recognition**
   - Test SherpaPrompt-specific queries from Intent Snippets
   - Verify emergency patterns work
   - Test sales, support, and scheduling intents

3. **Test Audience Detection**
   - Test with developer-focused conversation
   - Test with trades/contractor language
   - Verify audience-specific enhancements are added

4. **Test Conversation Flows**
   - Test complete voice conversation end-to-end
   - Verify appointment booking still works
   - Test demo request flow

---

## Testing & Validation

### Test Scenarios

**1. Product Inquiry Tests**
```javascript
const testQueries = [
  "What does SherpaPrompt do?",
  "How does call automation work?",
  "Tell me about transcript to task",
  "What is voice to estimate?",
  "How does the SherpaPrompt app work?"
];
```

**2. Pricing and Demo Tests**
```javascript
const pricingQueries = [
  "How much does SherpaPrompt cost?",
  "Do you offer a free trial?",
  "What's included in the enterprise plan?",
  "Can I schedule a demo?"
];
```

**3. Integration Tests**
```javascript
const integrationQueries = [
  "Does SherpaPrompt integrate with Salesforce?",
  "Can you connect to Microsoft Teams?",
  "What CRM systems do you support?",
  "Do you have an API?"
];
```

**4. Enhanced Intent Recognition Tests**
```javascript
const intentTests = [
  "My estimate did not sync to QuickBooks", // Should detect 'support' intent
  "Book a demo for this week in the afternoon", // Should detect 'scheduling' intent
  "Production is down for our call agent", // Should detect 'emergency' intent
  "We want our own persona instead of Scout" // Should detect 'sales' intent
];
```

**5. Audience Detection Tests**
```javascript
const audienceTests = [
  "I'm a developer looking at your API", // Should detect 'developers'
  "We're a construction company with field crews", // Should detect 'trades'
  "Our enterprise needs SSO integration", // Should detect 'enterprise'
  "I handle marketing campaigns for our company" // Should detect 'marketing'
];
```

### Success Criteria

**Knowledge Retrieval**
- ✅ RAG returns relevant SherpaPrompt content (not fencing)
- ✅ Responses mention correct products and features
- ✅ Pricing information is accurate and current
- ✅ Company mission and values are properly conveyed

**Conversation Flow**
- ✅ Natural conversation progression
- ✅ Appropriate follow-up questions
- ✅ Smooth transitions between topics
- ✅ Demo requests capture user information

**Enhanced Intent Recognition**
- ✅ SherpaPrompt-specific intents properly detected
- ✅ Emergency patterns trigger appropriate responses
- ✅ Sales, support, scheduling intents work correctly
- ✅ System falls back gracefully if JSON files missing

**Audience Detection**
- ✅ Developer conversations get technical enhancements
- ✅ Trades conversations get field-work context
- ✅ Enterprise conversations mention advanced features
- ✅ General conversations work without audience detection

**Technical Performance**
- ✅ Response time 3-6 seconds for end-to-end queries
- ✅ Vector search returns relevant results
- ✅ No errors in conversation processing
- ✅ All imports updated (no FencingRAG references)
- ✅ Enhanced features don't break existing functionality

### Testing Commands

```bash
# Test knowledge base search
curl -X POST http://localhost:3001/api/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{"query": "What does SherpaPrompt do?"}'

# Test pricing query
curl -X POST http://localhost:3001/api/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{"query": "How much does call automation cost?"}'

# Test voice conversation
curl -X POST http://localhost:3001/api/chained-voice/process \
  -H "Content-Type: application/json" \
  -d '{"text": "Tell me about SherpaPrompt", "sessionId": "test-session"}'
```

---

## Post-Migration Checklist

### Immediate (1-2 hours)
- [ ] All services start without errors
- [ ] Vector database contains SherpaPrompt knowledge
- [ ] Basic voice conversation works
- [ ] RAG returns SherpaPrompt content (not fencing)
- [ ] No fencing references in responses
- [ ] All SherpaPromptRAG imports working

### Short-term (Same day)
- [ ] All test scenarios pass
- [ ] Performance metrics within acceptable ranges (3-6 seconds)
- [ ] Appointment scheduling works with new context
- [ ] Demo request flow captures user information
- [ ] Intent classification recognizes SherpaPrompt queries

---

## Conclusion

This streamlined migration focuses on the essential updates needed to transform the voice agent from a fencing company assistant to a SherpaPrompt automation platform assistant. The changes are primarily content and branding updates rather than architectural modifications.

### Key Changes Summary

1. **Content Updates**: System prompts, greetings, and response templates updated for SherpaPrompt branding
2. **Service Rename**: FencingRAG renamed to SherpaPromptRAG with backward compatibility
3. **Intent Pattern Updates**: Added SherpaPrompt-specific intent recognition patterns

### Total Estimated Time: 2-3 hours

The migration preserves all existing functionality while providing proper SherpaPrompt branding and messaging. The enhanced version includes:

1. **Basic Migration** (1-2 hours): Content updates, service rename, basic intent patterns
2. **Enhanced Features** (1 hour): Intent Snippets integration, audience detection

**Key Safety Features:**
- All enhancements use try/catch blocks with graceful fallbacks
- Original functionality is preserved if JSON files are missing
- No breaking changes to existing conversation flows
- Enhanced features are additive, not replacement

The voice agent will now speak about SherpaPrompt products, pricing, and capabilities with improved intent recognition and audience-aware responses.