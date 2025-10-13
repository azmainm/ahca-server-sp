# SherpaPrompt Voice Agent Migration Guide

## Overview

This document provides a comprehensive guide for migrating the After Hours Call Agent (AHCA) system from a fencing company context to SherpaPrompt's voice automation platform. The migration transforms the system from handling fencing inquiries to managing SherpaPrompt product questions, demos, and customer onboarding.

## Table of Contents

1. [Current System Architecture](#current-system-architecture)
2. [Migration Strategy Overview](#migration-strategy-overview)
3. [Critical Security & Compliance Fixes](#critical-security--compliance-fixes)
4. [Vector Database Migration](#vector-database-migration)
5. [Local Configuration Updates](#local-configuration-updates)
6. [Code Changes Required](#code-changes-required)
7. [Content Updates](#content-updates)
8. [Performance & Technical Optimizations](#performance--technical-optimizations)
9. [Implementation Steps](#implementation-steps)
10. [Testing & Validation](#testing--validation)
11. [Rollback Plan](#rollback-plan)

---

## Current System Architecture

### Voice Agent Flow
The AHCA system follows OpenAI's recommended chained architecture:

```
Audio Input → STT (Whisper) → Text Processing (GPT-5-nano + RAG) → TTS (TTS-1) → Audio Output
```

### Key Components

**Frontend (ahca-client)**
- `RealtimeVADVoiceAgent.jsx` - Real-time voice activity detection
- `ChainedVoiceAgent.jsx` - Traditional STT-TTS pipeline
- React/Next.js interface with WebSocket support

**Backend (ahca-server)**
- **Route Layer**: HTTP controllers (`chained-voice.js`, `knowledge.js`)
- **Service Layer**: 8 specialized services for conversation management
- **Shared Services**: OpenAI, Calendar, Email integrations
- **Vector Database**: MongoDB Atlas with semantic search

### Current Knowledge Base Structure
- **Fencing Knowledge**: `knowldge_base_dummy.json` (legacy)
- **SherpaPrompt Knowledge**: 14 JSON files in `SherpaPrompt_AHCA_Knowledge/`

---

## Migration Strategy Overview

### Core Principle: Separate Knowledge from Behavior

**Knowledge (Vector Database)**
- Store searchable content that answers user questions
- Company information, product details, troubleshooting guides
- Optimized for semantic search and retrieval

**Behavior (Local Configuration)**
- Define how the agent should act and respond
- Conversation flows, intent mappings, system integrations
- Loaded at runtime for fast access

### Migration Benefits
1. **Contextual Accuracy**: Agent speaks about SherpaPrompt products instead of fencing
2. **Improved RAG**: Better semantic search with properly structured knowledge
3. **Maintainable Architecture**: Clear separation of concerns
4. **Scalable Design**: Easy to update knowledge without code changes

---

## Critical Security & Compliance Fixes

### Overview
Before proceeding with the migration, we must address critical security and compliance issues identified during review. These fixes ensure data safety, privacy compliance, and proper escalation handling.

### 🚨 Security Issues to Fix

#### 1. Search Filter Security (CRITICAL)
**Issue**: Vector search doesn't exclude sensitive or unvalidated content by default.
**Risk**: Users could receive internal information or incorrect pricing.

**Fix Implementation**:
```javascript
// Default safety filters for all searches
const DEFAULT_SAFETY_FILTERS = {
  "metadata.sensitive": { $ne: true },
  "metadata.pricing_unvalidated": { $ne: true },
  "metadata.access_tags": { $nin: ["internal", "compliance"] }
};

async searchSherpaPromptContent(query, maxResults = 5, filters = {}) {
  const safeFilters = {
    ...DEFAULT_SAFETY_FILTERS,
    "metadata.content_type": "knowledge",
    ...filters  // User filters applied after safety filters
  };
  
  const retriever = vectorStore.asRetriever({
    k: maxResults,
    searchType: "similarity",
    searchKwargs: { filter: safeFilters }
  });
}
```

#### 2. Emergency Detection Missing (CRITICAL)
**Issue**: No intent patterns for emergency/escalation despite having escalation infrastructure.
**Risk**: Urgent situations won't trigger proper escalation.

**Fix Implementation**:
```javascript
// Add to IntentClassifier patterns
emergency: [
  /emergency/i,
  /urgent/i,
  /outage/i,
  /down/i,
  /critical.*issue/i,
  /production.*down/i,
  /safety.*issue/i,
  /immediate.*help/i,
  /escalate/i,
  /need.*help.*now/i
],
escalationRequired: [
  /transfer.*human/i,
  /speak.*person/i,
  /talk.*someone/i,
  /escalate.*manager/i,
  /supervisor/i
]
```

#### 3. PII Redaction in Logs (COMPLIANCE CRITICAL)
**Issue**: Logging configuration doesn't explicitly redact PII.
**Risk**: Privacy compliance violations.

**Fix Implementation**:
```javascript
// PII redaction middleware
const piiRedactionPatterns = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g
};

function redactPII(logData) {
  let sanitized = JSON.stringify(logData);
  Object.entries(piiRedactionPatterns).forEach(([type, pattern]) => {
    sanitized = sanitized.replace(pattern, `[REDACTED_${type.toUpperCase()}]`);
  });
  return JSON.parse(sanitized);
}
```

#### 4. Lead Capture Flow (BUSINESS CRITICAL)
**Issue**: Demo offers might not properly capture user information.
**Risk**: Lost potential customers.

**Fix Implementation**:
```javascript
// Enhanced demo flow with mandatory lead capture
generateDemoOfferResponse() {
  return "I'd be happy to show you SherpaPrompt in action! To schedule your personalized demo, I'll need to collect a few details. What's the best email address to send you the demo link and calendar invite?";
}

// Ensure CRM integration captures demo requests
async handleDemoRequest(sessionId, userInfo) {
  // Validate user info is complete
  if (!userInfo.name || !userInfo.email) {
    return "To schedule your demo, I'll need your name and email address. Could you provide those for me?";
  }
  
  // Create lead in CRM with demo intent
  await this.crmService.createLead({
    ...userInfo,
    intent: 'demo_request',
    source: 'voice_agent',
    status: 'demo_requested'
  });
}
```

---

## Vector Database Migration

### Files to Store in Vector Database

**🔥 Core Knowledge Base (for RAG Semantic Search)**

| File | Purpose | Why Vector DB |
|------|---------|---------------|
| `company_mission_1.1.json` | Company values, mission, differentiators | Core brand messaging for "What is SherpaPrompt?" queries |
| `product_knowledge_1.2.json` | Product features, capabilities, integrations | Detailed product information for feature questions |
| `pricing_1.1.json` | Pricing tiers and trial information | Cost and pricing questions |

### Files to Keep Local (Reference Configuration)

**🏠 Local Configuration Files (for System Behavior)**

| File | Purpose | Why Local |
|------|---------|-----------|
| `audience_playbooks_1.2.json` | Conversation patterns, intent routing, response templates | Defines HOW to respond, not WHAT to say |
| `support_troubleshooting_1.2.json` | Internal troubleshooting procedures | Internal operations manual, not customer-facing |
| `call_service_*` files | Service configuration, flows, mappings | System behavior configuration |
| `Intent Snippets_1.3.json` | Intent classification patterns | Routing logic, not content |
| `oncall_escalation_1.1.json` | Escalation procedures | Internal process flows |
| `sales_funnel_outlook_1.3.json` | CRM integration mapping | System integration config |

### Enhanced Vector Storage Schema

```javascript
// MongoDB Collection: knowledge_base
{
  // Core identification
  "contentId": "string",           // Unique chunk identifier
  "chunkIndex": "number",          // Position within document
  "text": "string",                 // Searchable content
  "embedding": "vector(1536)",     // OpenAI embedding
  
  // SherpaPrompt metadata
  "metadata": {
    // Document context
    "doc_id": "string",            // Source document ID
    "section_id": "string",        // Section within document
    "heading": "string",           // Section heading
    "source_file": "string",       // Original filename
    
    // Product context
    "product_areas": ["call_service", "transcript_service", "voice_to_estimate", "app"],
    "intents": ["sales", "support", "scheduling", "emergency", "pricing", "faq"],
    "audience_profiles": ["Developers", "Enterprise", "Marketing", "Trades"],
    
    // Behavioral context
    "systems_read": ["array"],     // Systems to read from
    "systems_write": ["array"],   // Systems to write to
    "escalation_required": "boolean",
    "sensitive": "boolean",
    
    // Content classification
    "content_type": "enum[knowledge|behavior|config|policy]",
    "qa_shape": "enum[narrative|procedure|dialogue]",
    "priority_score": "float",     // Retrieval priority
    
    // Timestamps
    "created_at": "datetime",
    "last_modified": "datetime"
  }
}
```

### Chunking Strategy

**Semantic Chunking by Content Type**

```javascript
const chunkingConfig = {
  // Company mission - preserve narrative flow
  company_mission: {
    chunkSize: 800,
    overlap: 150,
    preserveBoundaries: ['sections', 'values', 'commitments']
  },
  
  // Product knowledge - keep features together
  product_knowledge: {
    chunkSize: 1000,
    overlap: 200,
    preserveBoundaries: ['products', 'features', 'integrations', 'benefits']
  },
  
  // Audience playbooks - maintain persona context
  audience_playbooks: {
    chunkSize: 600,
    overlap: 100,
    preserveBoundaries: ['personas', 'scenarios', 'responses', 'examples']
  },
  
  // Support docs - keep problem-solution pairs
  support_troubleshooting: {
    chunkSize: 800,
    overlap: 150,
    preserveBoundaries: ['problems', 'solutions', 'procedures', 'steps']
  }
};
```

---

## Local Configuration Updates

### Files to Keep as Local Reference

**🏗️ System Behavior & Reference Files (Local Storage)**

| File | Purpose | Usage Pattern |
|------|---------|---------------|
| `audience_playbooks_1.2.json` | Conversation patterns, intent routing, persona responses | Load at startup, reference for conversation flow |
| `support_troubleshooting_1.2.json` | Internal troubleshooting procedures | Reference for agent decision-making and escalation |
| `Intent Snippets_1.3.json` | Intent→Action mapping | Load for intent classification |
| `call_service_conversation_flows_1.2.json` | Conversation scripts and flows | Reference for conversation management |
| `call_service_crm_field_mapping_outlook_1.1.json` | CRM integration mapping | Configuration for CRM operations |
| `sales_funnel_outlook_1.3.json` | Sales process rules | Reference for lead qualification |
| `oncall_escalation_1.1.json` | Emergency procedures | Reference for escalation logic |
| `call_service_edge_cases_1.1.json` | Error handling patterns | Reference for error recovery |
| `call_service_logging_and_safety_internal_1.1.json` | Logging and safety rules | Configuration for compliance |
| `call_service_metrics_internal_1.1.json` | Performance tracking | Configuration for analytics |
| `call_service_test_scripts_1.1.json` | Testing procedures | Reference for validation |

### New Configuration Structure

```
/ahca-server/config/sherpaprompt/
├── intents/
│   ├── intent-mappings.json          # From Intent Snippets
│   └── escalation-rules.json         # From oncall_escalation
├── conversations/
│   ├── flow-templates.json           # From conversation_flows  
│   └── response-patterns.json        # From audience_playbooks (behavior parts)
├── integrations/
│   ├── crm-mappings.json            # From crm_field_mapping
│   ├── sales-funnel.json            # From sales_funnel_outlook
│   └── system-configs.json          # System integration rules
└── operations/
    ├── edge-cases.json              # Error handling scenarios
    ├── logging-config.json          # Logging configuration
    ├── metrics-config.json          # Performance metrics
    └── test-scripts.json            # Testing procedures
```

---

## Code Changes Required

### 1. Update RAG Service: FencingRAG → SherpaPromptRAG

**File**: `/shared/services/SherpaPromptRAG.js`

```javascript
class SherpaPromptRAG {
  constructor() {
    this.llm = new ChatOpenAI({
      modelName: 'gpt-5-nano',
      max_tokens: 1000,
    });

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
  }
}
```

### 2. Update Intent Classification

**File**: `/features/voice-agent/services/IntentClassifier.js`

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
        /automation.*platform/i
      ],
      pricingInquiry: [
        /how much.*cost/i,
        /pricing.*plan/i,
        /trial.*available/i,
        /enterprise.*pricing/i,
        /what.*price/i
      ],
      integrationQuestion: [
        /integrate.*with/i,
        /connect.*crm/i,
        /api.*available/i,
        /salesforce.*integration/i,
        /microsoft.*integration/i
      ],
      demoRequest: [
        /demo/i,
        /show.*how/i,
        /walkthrough/i,
        /see.*action/i,
        /schedule.*demo/i
      ],
      supportRequest: [
        /help.*setup/i,
        /troubleshoot/i,
        /not.*working/i,
        /error/i,
        /support/i
      ],
      
      // CRITICAL: Emergency and escalation patterns (MISSING IN ORIGINAL)
      emergency: [
        /emergency/i,
        /urgent/i,
        /outage/i,
        /down/i,
        /critical.*issue/i,
        /production.*down/i,
        /safety.*issue/i,
        /immediate.*help/i,
        /escalate/i,
        /need.*help.*now/i,
        /system.*failure/i,
        /service.*down/i
      ],
      escalationRequired: [
        /transfer.*human/i,
        /speak.*person/i,
        /talk.*someone/i,
        /escalate.*manager/i,
        /supervisor/i,
        /human.*agent/i,
        /live.*person/i
      ],
      
      // Keep existing patterns for goodbye, appointment, etc.
      goodbye: [
        /thank you.*no more/i,
        /that.*all.*need/i,
        /goodbye/i,
        /bye/i,
        /done.*questions/i
      ]
    };
  }
}
```

### 3. Update Response Generator

**File**: `/features/voice-agent/services/ResponseGenerator.js`

```javascript
class ResponseGenerator {
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

  // CRITICAL: Enhanced demo flow with mandatory lead capture
  generateDemoOfferResponse() {
    return "I'd be happy to show you SherpaPrompt in action! To schedule your personalized demo, I'll need to collect a few details. What's the best email address to send you the demo link and calendar invite?";
  }

  generatePricingResponse() {
    return "SherpaPrompt offers transparent pricing tiers designed to scale with your business. We have options for small teams starting at our Starter tier, growing businesses with our Professional tier, and Enterprise solutions with custom integrations. Would you like me to walk you through the specific features and pricing for each tier?";
  }

  generateEmergencyEscalationResponse() {
    return "I understand this is urgent. Let me connect you to our on-call team immediately. This call may be recorded for training and quality assurance. Do you want me to connect you to our on-call person now?";
  }

  // Symbol replacement only for TTS - NOT for technical content
  formatForTTS(text, isCodeContent = false) {
    if (isCodeContent) {
      return text; // Don't modify code examples or technical content
    }
    
    return text
      .replace(/\s*=\s*/g, ' is ')
      .replace(/(\d+)\s*[-–—]\s*(\d+)/g, '$1 to $2')
      .replace(/(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[-–—]\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/gi, '$1 to $2')
      .replace(/\$(\d+)/g, '$1 dollars')
      .replace(/\s*&\s*/g, ' and ')
      .replace(/@/g, ' at ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
```

### 4. Update Knowledge Processing

**File**: `/features/voice-agent/routes/knowledge.js`

```javascript
// Add new endpoint for SherpaPrompt knowledge processing
router.post('/process-sherpaprompt', async (req, res) => {
  try {
    console.log('🚀 Starting SherpaPrompt knowledge base processing...');
    
    const knowledgeFiles = [
      'company_mission_1.1.json',
      'product_knowledge_1.2.json', 
      'audience_playbooks_1.2.json',
      'support_troubleshooting_1.2.json',
      'pricing_1.1.json'
    ];

    let totalChunks = 0;
    const results = [];

    for (const file of knowledgeFiles) {
      const filePath = path.join(__dirname, '../../../data/SherpaPrompt_AHCA_Knowledge', file);
      const fileData = await fs.readFile(filePath, 'utf8');
      const jsonData = JSON.parse(fileData);
      
      console.log(`📄 Processing ${file}...`);
      
      // Process each section for embedding
      const result = await embeddingService.processSherpaPromptDocument(jsonData, file);
      results.push({
        file,
        chunksStored: result.chunksStored,
        contentHash: result.contentHash
      });
      
      totalChunks += result.chunksStored;
    }

    console.log('✅ SherpaPrompt knowledge base processing completed');
    
    res.json({
      success: true,
      message: 'SherpaPrompt knowledge base processed successfully',
      totalFiles: knowledgeFiles.length,
      totalChunks,
      results,
      model: 'text-embedding-3-small',
      vectorIndex: 'vector_index'
    });
    
  } catch (error) {
    console.error('❌ Error processing SherpaPrompt knowledge base:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process SherpaPrompt knowledge base',
      message: error.message
    });
  }
});
```

### 5. Enhanced EmbeddingService for SherpaPrompt

**File**: `/shared/services/EmbeddingService.js`

```javascript
class EmbeddingService {
  /**
   * Process SherpaPrompt JSON documents for embedding
   */
  async processSherpaPromptDocument(jsonData, filename) {
    const chunks = [];
    
    console.log(`🧠 Processing SherpaPrompt document: ${filename}`);
    
    // Extract sections from SherpaPrompt JSON structure
    if (jsonData.sections) {
      for (const section of jsonData.sections) {
        // Use existing chunks if available, otherwise create from raw_markdown
        if (section.chunks && section.chunks.length > 0) {
          // Use pre-processed chunks
          for (const chunk of section.chunks) {
            chunks.push({
              content: chunk.embedding_input,
              metadata: {
                doc_id: jsonData.doc_id,
                section_id: section.section_id,
                heading: section.heading,
                heading_level: section.heading_level,
                path: section.path,
                product_areas: jsonData.product_area || [],
                intents: section.labels?.intents || [],
                audience_profiles: section.labels?.audience_profiles || [],
                systems_read: section.labels?.systems_read || [],
                systems_write: section.labels?.systems_write || [],
                sensitive: section.policy_flags?.sensitive || false,
                pricing_unvalidated: section.policy_flags?.pricing_unvalidated || false,
                qa_shape: chunk.qa_shape || 'narrative',
                content_type: 'knowledge',
                source_file: filename,
                chunk_id: chunk.chunk_id,
                token_estimate: chunk.token_estimate
              }
            });
          }
        } else if (section.raw_markdown) {
          // Chunk the raw markdown content
          const textChunks = await this.semanticChunking(section.raw_markdown);
          for (let i = 0; i < textChunks.length; i++) {
            chunks.push({
              content: textChunks[i],
              metadata: {
                doc_id: jsonData.doc_id,
                section_id: section.section_id,
                heading: section.heading,
                heading_level: section.heading_level,
                path: section.path,
                chunk_index: i,
                product_areas: jsonData.product_area || [],
                intents: section.labels?.intents || [],
                audience_profiles: section.labels?.audience_profiles || [],
                systems_read: section.labels?.systems_read || [],
                systems_write: section.labels?.systems_write || [],
                sensitive: section.policy_flags?.sensitive || false,
                content_type: 'knowledge',
                source_file: filename
              }
            });
          }
        }
      }
    }

    // Store chunks in vector database
    return await this.storeChunks(chunks, jsonData.doc_id);
  }

  /**
   * Enhanced search with SherpaPrompt context and safety filters
   */
  async searchSherpaPromptContent(query, maxResults = 5, filters = {}) {
    try {
      console.log('🔍 Searching SherpaPrompt knowledge for:', query);
      
      // CRITICAL: Default safety filters to prevent sensitive/unvalidated content
      const DEFAULT_SAFETY_FILTERS = {
        "metadata.sensitive": { $ne: true },
        "metadata.pricing_unvalidated": { $ne: true },
        "metadata.access_tags": { $nin: ["internal", "compliance"] }
      };
      
      // Direct search with user's query
      
      const vectorStore = await this.getVectorStore();
      
      // Apply safety filters first, then user filters
      const safeFilters = {
        ...DEFAULT_SAFETY_FILTERS,
        "metadata.content_type": "knowledge",
        ...filters  // User filters applied after safety filters
      };
      
      const retriever = vectorStore.asRetriever({
        k: maxResults,
        searchType: "similarity",
        searchKwargs: { filter: safeFilters }
      });
      
      const docs = await retriever.getRelevantDocuments(enhancedQuery);
      
      // Process and rank results
      return this.processSherpaPromptResults(docs, query, maxResults);
      
    } catch (error) {
      console.error('❌ Error searching SherpaPrompt content:', error);
      throw error;
    }
  }


}
```

---

## Content Updates

### Critical Content Changes Required

**1. Update Initial Greeting**

```javascript
// Current (Fencing)
const initialGreeting = "Hi there! Welcome to SherpaPrompt Fencing Company. I'm here to help with your fencing needs. Could you tell me your name and email address to get started?";

// New (SherpaPrompt)
const initialGreeting = "Hi there! Welcome to SherpaPrompt, the automation platform that turns conversations into outcomes. I'm here to help you learn about our automation solutions. Could you tell me your name and email address to get started?";
```

**2. Update Example Dialogues**

Replace fencing-specific examples in conversation flows:

```javascript
// OLD: "I need an estimate for a cedar fence"
// NEW: "I need help setting up call automation for my business"

// OLD: "Jordan Lee, contractor looking for fencing solutions"  
// NEW: "Sarah from TechCorp, interested in automating our customer service calls"
```

**3. Update Intent Examples**

```javascript
// In Intent Snippets_1.3.json
// OLD: {"intent":"sales","utterance":"What does SherpaPrompt do for a small trades business?"}
// NEW: {"intent":"sales","utterance":"How can SherpaPrompt automate our customer service workflows?"}
```

**4. Update Company Information**

```javascript
// Replace all fencing company references
const companyInfo = {
  name: "SherpaPrompt",
  tagline: "Turn conversations into outcomes",
  description: "Automation platform for call service, transcript processing, voice estimation, and prompt orchestration",
  products: ["Call Service Automation", "Transcript to Task", "Voice to Estimate", "SherpaPrompt App"]
};
```

---

## Performance & Technical Optimizations

### Performance Expectations & Timing Budget

**Realistic End-to-End Timing Breakdown**:

| Component | Target Time | Optimization Strategy |
|-----------|-------------|----------------------|
| **VAD Detection** | 100-300ms | Server-side processing, WebSocket streaming |
| **STT (Whisper)** | 500-1000ms | Batch processing, audio compression |
| **RAG Query** | 800-1500ms | Vector index optimization |
| **LLM Processing** | 1000-2000ms | Model optimization |
| **TTS Generation** | 500-1000ms | Audio streaming, pre-generation |
| **Network Latency** | 200-500ms | CDN, regional deployment |
| **Total Target** | **3.1-6.3 seconds** | **Realistic range** |


### Code Renaming & Import Management

**Backward Compatibility Strategy**:
```javascript
// 1. Create new SherpaPromptRAG.js
// 2. Keep FencingRAG.js with deprecation warning
// shared/services/FencingRAG.js
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

**Import Update Checklist**:
```bash
# Find all references to FencingRAG
grep -r "FencingRAG" --include="*.js" --include="*.jsx" .

# Update imports systematically
find . -name "*.js" -exec sed -i 's/FencingRAG/SherpaPromptRAG/g' {} \;

# Verify no broken imports
npm run build && npm test
```

### Query Expansion Configuration

**A/B Testing Setup**:
```javascript
// Environment-based configuration
const QUERY_EXPANSION_CONFIG = {
  enabled: process.env.ENABLE_QUERY_EXPANSION !== 'false',
  level: process.env.QUERY_EXPANSION_LEVEL || 'moderate', // off, minimal, moderate, aggressive
  testGroup: process.env.QUERY_EXPANSION_TEST_GROUP || 'control' // control, treatment
};

// A/B testing implementation
async searchWithABTest(query, sessionId) {
  const testGroup = this.getTestGroup(sessionId);
  const useExpansion = testGroup === 'treatment';
  
  const startTime = Date.now();
  const results = await this.searchSherpaPromptContent(
    query, 
    5, 
    { useQueryExpansion: useExpansion }
  );
  const responseTime = Date.now() - startTime;
  
  // Log metrics for analysis
  this.logSearchMetrics({
    sessionId,
    query,
    testGroup,
    responseTime,
    resultsCount: results.length,
    relevanceScore: this.calculateRelevance(results, query)
  });
  
  return results;
}
```

---

## Implementation Steps

### Phase 1: Critical Security Fixes (Day 1 - PRIORITY)

**1. Backup Current System**
```bash
# Backup current data and configuration
cp -r /ahca-server/data /ahca-server/data-backup-fencing-$(date +%Y%m%d)
cp -r /ahca-server/shared/services /ahca-server/shared/services-backup-fencing
git tag "pre-sherpaprompt-migration-$(date +%Y%m%d)"
```

**2. Implement Security Fixes**
```bash
# Fix 1: Add default safety filters to EmbeddingService
# Fix 2: Add emergency intent patterns to IntentClassifier  
# Fix 3: Implement PII redaction in logging
# Fix 4: Fix lead capture flow in ResponseGenerator
```

**3. Create New Configuration Structure**
```bash
# Create SherpaPrompt config directories
mkdir -p /ahca-server/config/sherpaprompt/{intents,conversations,integrations,operations}
```

**4. Install Dependencies & Security Updates**
```bash
# Ensure all required packages are installed
cd /ahca-server && npm install
cd /ahca-client && npm install

# Install any additional dependencies if needed
```

### Phase 2: Knowledge Base Migration (Day 1-2)

**1. Clear Existing Embeddings**
```bash
curl -X DELETE http://localhost:3001/api/knowledge/clear
```

**2. Process SherpaPrompt Knowledge**
```bash
curl -X POST http://localhost:3001/api/knowledge/process-sherpaprompt
```

**3. Verify Knowledge Processing**
```bash
curl -X GET http://localhost:3001/api/knowledge/overview
```

### Phase 3: Code Updates (Day 2-3)

**1. Update Core Services**
```bash
# Rename and update RAG service
mv /ahca-server/shared/services/FencingRAG.js /ahca-server/shared/services/SherpaPromptRAG.js
# Update all imports and references
```

**2. Update Intent Classification**
- Modify `/features/voice-agent/services/IntentClassifier.js`
- Add SherpaPrompt-specific intent patterns

**3. Update Response Generation**
- Modify `/features/voice-agent/services/ResponseGenerator.js`
- Replace fencing responses with SherpaPrompt messaging

**4. Update Conversation Flow Handler**
- Modify `/features/voice-agent/services/ConversationFlowHandler.js`
- Update references to use SherpaPromptRAG

### Phase 4: Configuration Migration (Day 3-4)

**1. Extract Local Configurations**
```javascript
// Process behavioral files into local config
const behaviorFiles = [
  'Intent Snippets_1.3.json',
  'call_service_conversation_flows_1.2.json',
  'oncall_escalation_1.1.json'
  // ... other behavior files
];

// Convert to local config format
```

**2. Update Client Components**
- Modify greeting messages in voice agent components
- Update UI text and branding references

### Phase 5: Testing & Validation (Day 4-5)

**1. Security & Compliance Testing**
```bash
# Test 1: Verify sensitive content is filtered out
curl -X POST http://localhost:3001/api/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{"query": "internal operations"}'
# Expected: No internal/sensitive content returned

# Test 2: Verify pricing validation
curl -X POST http://localhost:3001/api/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{"query": "pricing cost"}'
# Expected: Only validated pricing content returned

# Test 3: Test emergency detection
curl -X POST http://localhost:3001/api/chained-voice/process \
  -H "Content-Type: application/json" \
  -d '{"text": "We have an emergency outage", "sessionId": "test-emergency"}'
# Expected: Emergency escalation triggered
```

**2. Unit Testing**
```bash
# Test key scenarios
curl -X POST http://localhost:3001/api/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{"query": "What does SherpaPrompt do?"}'

curl -X POST http://localhost:3001/api/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{"query": "How much does call automation cost?"}'
```

**2. Integration Testing**
- Test complete voice conversation flows
- Verify RAG responses are contextually appropriate
- Test appointment scheduling with SherpaPrompt context

**3. User Acceptance Testing**
- Test with sample SherpaPrompt customer scenarios
- Verify natural conversation flow
- Validate response accuracy and relevance

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

### Success Criteria

**Security & Compliance (CRITICAL)**
- ✅ No sensitive/internal content returned in searches
- ✅ Only validated pricing information provided
- ✅ Emergency patterns trigger proper escalation
- ✅ PII redacted from all logs
- ✅ Lead capture works for all demo requests

**Knowledge Retrieval**
- ✅ RAG returns relevant SherpaPrompt content (not fencing)
- ✅ Responses mention correct products and features
- ✅ Pricing information is accurate and current
- ✅ Company mission and values are properly conveyed

**Conversation Flow**
- ✅ Natural conversation progression
- ✅ Appropriate follow-up questions
- ✅ Smooth transitions between topics
- ✅ Proper escalation handling
- ✅ Demo requests capture user information

**Technical Performance**
- ✅ Response time 3-6 seconds for end-to-end queries (realistic target)
- ✅ Vector search returns relevant results
- ✅ No errors in conversation processing
- ✅ Proper session management
- ✅ Semantic chunking preserves context
- ✅ All imports updated (no FencingRAG references)

---

## Rollback Plan

### Emergency Rollback (< 30 minutes)

**1. Restore Backup Data**
```bash
# Stop services
pm2 stop ahca-server

# Restore fencing knowledge base
rm -rf /ahca-server/data/current
cp -r /ahca-server/data-backup-fencing /ahca-server/data

# Restore original services
rm -rf /ahca-server/shared/services
cp -r /ahca-server/shared/services-backup-fencing /ahca-server/shared/services

# Restart services
pm2 start ahca-server
```

**2. Revert Code Changes**
```bash
# Use git to revert to previous commit
git checkout HEAD~1 -- shared/services/
git checkout HEAD~1 -- features/voice-agent/services/
```

### Partial Rollback Options

**Knowledge Only**: Keep code changes, restore fencing knowledge base
**Services Only**: Keep knowledge base, restore original service files
**Configuration Only**: Restore original configuration files

---

## Post-Migration Checklist

### Immediate (Day 1) - CRITICAL SECURITY FIXES
- [ ] **Security filters implemented and tested**
- [ ] **Emergency intent patterns working**
- [ ] **PII redaction active in logs**
- [ ] **Lead capture flow validated**
- [ ] All services start without errors
- [ ] Vector database contains SherpaPrompt knowledge
- [ ] Basic voice conversation works
- [ ] RAG returns SherpaPrompt content (no sensitive data)

### Short-term (Week 1)
- [ ] All test scenarios pass (including security tests)
- [ ] Performance metrics within acceptable ranges (3-6 seconds)
- [ ] No fencing references in responses
- [ ] Appointment scheduling works with new context
- [ ] Performance monitoring implemented
- [ ] Semantic chunking verified working
- [ ] All FencingRAG imports updated

### Long-term (Month 1)
- [ ] User feedback is positive
- [ ] Conversation quality metrics improved
- [ ] Knowledge base is easily maintainable
- [ ] System is ready for production use
- [ ] Performance optimizations validated
- [ ] Performance optimizations based on real usage data

---

## Maintenance & Updates

### Knowledge Base Updates
- Update vector database by reprocessing JSON files
- No code changes required for content updates
- Automatic versioning and change tracking

### Behavioral Updates
- Modify local configuration files
- Restart services to load new configurations
- Test changes in development environment first

### Monitoring & Analytics
- Track conversation quality metrics
- Monitor RAG retrieval accuracy
- Analyze user satisfaction scores
- Regular performance optimization

---

## Conclusion

This migration transforms the AHCA system from a fencing company voice agent to a comprehensive SherpaPrompt automation platform assistant. The separation of knowledge (vector database) and behavior (local configuration) creates a maintainable, scalable architecture that can easily adapt to future requirements.

### Key Improvements Implemented

**Security & Compliance**:
- Default safety filters prevent sensitive/unvalidated content exposure
- Emergency detection patterns ensure proper escalation
- PII redaction maintains privacy compliance
- Enhanced lead capture prevents lost opportunities

**Technical Optimizations**:
- Proven semantic chunking for reliable retrieval
- Optimized vector search performance
- Realistic performance targets (3-6 seconds)
- Backward-compatible code migration

**Business Value**:
- Contextually appropriate responses about SherpaPrompt products
- Proper demo flow with lead capture
- Enhanced RAG system for accurate information delivery
- Scalable architecture for future requirements

### Critical Success Factors

1. **Security First**: All security fixes must be implemented before content migration
2. **Performance Monitoring**: Track end-to-end response times
3. **Compliance**: Ensure PII redaction and data handling meet privacy standards

The migration preserves all existing functionality while providing a robust, secure, and scalable foundation for SherpaPrompt's voice automation platform.

For questions or support during migration, refer to the technical team or create an issue in the project repository.

---

## Implementation Checklist Summary

### Phase 1 (Day 1) - CRITICAL
- [ ] Implement security filters for vector search
- [ ] Add emergency intent patterns
- [ ] Implement PII redaction
- [ ] Fix lead capture flow
- [ ] Test all security measures

### Phase 2 (Day 2-3) - CORE MIGRATION
- [ ] Process SherpaPrompt knowledge base
- [ ] Update RAG service (with backward compatibility)
- [ ] Update intent classification
- [ ] Update response generation
- [ ] Verify semantic chunking works correctly

### Phase 3 (Day 4-5) - OPTIMIZATION & TESTING
- [ ] Monitor and optimize performance
- [ ] Update all imports and references
- [ ] Comprehensive testing (security, functionality, performance)
- [ ] Performance optimization based on test results

**Total Estimated Time**: 5 days with proper testing and validation
