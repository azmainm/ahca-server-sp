# SherpaPrompt Voice Agent System - Complete Documentation

## Overview

The SherpaPrompt Voice Agent System is a comprehensive end-to-end voice automation platform that enables natural conversations with AI agents to learn about SherpaPrompt's automation services, schedule product demos, and provide customer support. The system implements OpenAI's Realtime API architecture with Voice Activity Detection (VAD), Retrieval Augmented Generation (RAG), and seamless calendar integration.

**Current Status**: ✅ Fully migrated from fencing company to SherpaPrompt  
**Core Services**: Call Service Automation, Transcript to Task, Voice to Estimate, SherpaPrompt App

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SherpaPrompt Voice Agent System                        │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client (Web)  │    │  Server (API)   │    │  External APIs  │    │   Data Layer    │
│                 │    │                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ VAD Voice   │ │◄──►│ │ Voice Agent │ │◄──►│ │ OpenAI API  │ │    │ │ MongoDB     │ │
│ │ Interface   │ │    │ │ Routes      │ │    │ │ (Realtime)  │ │    │ │ Atlas       │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│                 │    │ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ ┌─────────────┐ │    │ │ RAG System  │ │◄──►│ │ GPT-5-nano  │ │    │ │ Knowledge   │ │
│ │ React UI    │ │    │ │(SherpaRAG)  │ │    │ │ (Chat)      │ │    │ │ Base JSON   │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│                 │    │ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ ┌─────────────┐ │    │ │ Calendar    │ │◄──►│ │ Google/MS   │ │    │ │ Email       │ │
│ │ Audio I/O   │ │    │ │ Services    │ │    │ │ Calendar    │ │    │ │ Templates   │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## File Structure & Function Mapping

### 📁 Client-Side (`ahca-client/`)

#### Core Components
```
src/features/voice-agent/components/
├── VoiceAgent.jsx                    # Main UI container & service selector
├── RealtimeVADVoiceAgent.jsx        # Primary VAD voice interface
└── ChainedVoiceAgent.jsx            # Alternative voice interface (fallback)
```

**Key Functions by File:**

#### `VoiceAgent.jsx`
- **Purpose**: Main entry point and service selection UI
- **Key Functions**:
  - `handleChainedStatusChange()` - Updates status display
  - `handleEstimatorClick()` - Opens estimator tool
- **UI Elements**: SherpaPrompt branding, service list, estimator button

#### `RealtimeVADVoiceAgent.jsx` ⭐ **PRIMARY INTERFACE**
- **Purpose**: Real-time Voice Activity Detection interface
- **Key Functions**:
  ```javascript
  // Connection Management
  startConversation()              // Initiates VAD session
  stopConversation()               // Ends session & cleanup
  
  // Audio Processing
  startAudioStreaming()            // MediaRecorder setup
  handleAudioData()                // Process audio chunks
  convertWebMToPCM16()             // Audio format conversion
  
  // VAD Integration  
  startRealtimeVAD()               // Connect to server VAD
  checkVADStatus()                 // Monitor speech detection
  checkForResponse()               // Poll for AI responses
  
  // UI State Management
  updateConversationState()        // Update user info display
  handleMicrophoneToggle()         // Manual mic control
  ```
- **Configuration**:
  ```javascript
  const VAD_CONFIG = {
    chunkIntervalMs: 1000,           // 1-second audio chunks
    statusCheckIntervalMs: 1000,     // VAD status polling
    responseCheckIntervalMs: 500,    // Response polling
    apiUrl: 'http://localhost:3001'  // Server endpoint
  };
  ```

#### `ChainedVoiceAgent.jsx`
- **Purpose**: Fallback interface without VAD
- **Key Functions**:
  - `handleSendMessage()` - Manual text/audio submission
  - `transcribeAudio()` - Direct STT processing
  - `synthesizeResponse()` - TTS generation

---

### 📁 Server-Side (`ahca-server/`)

#### Main API Routes
```
features/voice-agent/routes/
└── chained-voice.js                 # Central API endpoint router
```

**Key Endpoints & Functions:**

#### `chained-voice.js` ⭐ **MAIN API ROUTER**
```javascript
// Core Processing
POST /api/chained-voice/process
  → conversationFlowHandler.handleIncomingText()

// VAD Endpoints  
POST /api/chained-voice/realtime-vad/start
  → realtimeVADService.startVadSession()
  
POST /api/chained-voice/realtime-vad/audio  
  → realtimeVADService.streamAudioChunk()
  
GET /api/chained-voice/realtime-vad/status/:sessionId
  → realtimeVADService.getVadStatus()
  
GET /api/chained-voice/realtime-vad/response/:sessionId
  → stateManager.getSession().responseQueue

// Utility Endpoints
GET /api/chained-voice/health
  → emailService.checkHealth()
  
POST /api/chained-voice/test-email
  → emailService.sendEmail()
```

#### Service Architecture
```
features/voice-agent/services/
├── ConversationFlowHandler.js       # 🎯 Central orchestrator
├── RealtimeVADService.js           # 🎤 Voice Activity Detection  
├── IntentClassifier.js             # 🧠 Intent recognition
├── ResponseGenerator.js            # 💬 Response generation
├── UserInfoCollector.js            # 👤 Name/email collection
├── AppointmentFlowManager.js       # 📅 Demo scheduling
├── ConversationStateManager.js     # 💾 Session management
├── DateTimeParser.js               # 📆 Date parsing
└── OpenAIService.js                # 🤖 OpenAI API wrapper
```

---

## Core Service Details

### 🎯 ConversationFlowHandler.js ⭐ **CENTRAL ORCHESTRATOR**

**Purpose**: Coordinates all services and manages conversation flow

**Key Methods**:
```javascript
// Main Processing Pipeline
async handleIncomingText(text, sessionId)
  ├── stateManager.getSession(sessionId)
  ├── intentClassifier.classifyIntent(text)  
  ├── Route to appropriate handler:
  │   ├── handleNameEmailCollection()
  │   ├── handleAppointmentFlow()
  │   └── handleRegularQA()
  └── stateManager.addMessageToHistory()

// Specialized Handlers  
async handleRegularQA(text, sessionId, session)
  ├── extractSearchTerms(text)
  ├── embeddingService.searchSimilarContent()
  ├── sherpaPromptRAG.generateResponse()
  └── responseGenerator.generateFollowUpResponse()

// VAD Integration
async handleRealtimeVADAudio(sessionId, audioBase64)
  ├── openAIService.transcribeAudio()
  ├── handleIncomingText(transcription)
  └── stateManager.addResponseToQueue()

// Email Integration (Fixed Duplicate Issue)
async sendConversationSummary(sessionId, session)
  ├── Check session.emailSent flag (prevents duplicates)
  ├── emailService.sendConversationSummary()
  └── session.emailSent = true
```

**Service Dependencies**:
- `stateManager` - Session state management
- `userInfoCollector` - Name/email collection
- `appointmentFlowManager` - Demo scheduling
- `intentClassifier` - Intent recognition  
- `responseGenerator` - Response generation
- `sherpaPromptRAG` - Knowledge base queries
- `embeddingService` - Vector search
- `emailService` - Email notifications

---

### 🎤 RealtimeVADService.js **VOICE ACTIVITY DETECTION**

**Purpose**: Manages OpenAI Realtime API connections for voice detection

**Key Methods**:
```javascript
// Session Management
async startVadSession(sessionId)
  ├── Create WebSocket connection to OpenAI
  ├── Configure VAD settings
  └── Set up event listeners

async streamAudioChunk(sessionId, audioBuffer)  
  ├── Convert WebM → PCM16 format
  ├── Send to OpenAI Realtime API
  └── Monitor for speech events

// Event Handlers
handleSpeechStarted(sessionId)
  └── Emit 'speech_start' event

handleSpeechStopped(sessionId)  
  └── Emit 'speech_end' event

handleTranscriptionCompleted(sessionId, text)
  ├── Generate contextual filler phrase
  ├── Queue filler audio for immediate playback  
  └── Trigger conversation processing
```

**Event Flow**:
```
Audio Chunk → WebM→PCM16 → OpenAI VAD → Speech Events → Transcription → Processing
```

---

### 🧠 IntentClassifier.js **INTENT RECOGNITION**

**Purpose**: Classifies user intents using pattern matching and SherpaPrompt-specific patterns

**Enhanced Patterns** (Post-Migration):
```javascript
// Core Patterns
this.patterns = {
  goodbye: [/goodbye/i, /bye/i, /thank you.*no more/i],
  appointment: [/demo/i, /schedule.*demo/i, /show.*me/i],
  nameChange: [/change.*name/i, /my name.*is/i],
  emailChange: [/change.*email/i, /my email.*is/i],
  
  // SherpaPrompt-Specific Intents (from Intent Snippets_1.3.json)
  sales: [...],           // Sales inquiries
  support: [...],         // Support requests  
  scheduling: [...],      // Demo scheduling
  pricing: [...],         // Pricing questions
  emergency: [...]        // Urgent requests
};

// Key Methods
classifyIntent(text)
  ├── matchesPatterns(text, patterns)
  ├── calculateConfidence(text, results)
  └── Return { primaryIntent, confidence, ...flags }

loadSherpaPromptPatterns()
  ├── Load from 'Intent Snippets_1.3.json'
  ├── Convert utterances to regex patterns
  └── Merge with existing patterns
```

---

### 💬 ResponseGenerator.js **RESPONSE GENERATION**

**Purpose**: Generates contextual responses with audience awareness

**SherpaPrompt-Specific Methods** (Post-Migration):
```javascript
// Service-Specific Responses
generateProductInfoResponse(productArea)
  ├── 'call_service' → Call Service Automation details
  ├── 'transcript_service' → Transcript to Task details  
  ├── 'voice_to_estimate' → Voice to Estimate details
  └── 'app' → SherpaPrompt App details

generateDemoOfferResponse()
  └── "I'd be happy to show you SherpaPrompt in action!"

generatePricingResponse()  
  └── SherpaPrompt pricing tiers explanation

// Audience Detection & Enhancement
detectAudience(conversationHistory)
  ├── developers: ['api', 'technical', 'integration']
  ├── trades: ['contractor', 'field', 'job site']  
  ├── enterprise: ['corporate', 'sso', 'security']
  └── marketing: ['campaign', 'content', 'analytics']

enhanceResponseForAudience(response, audience)
  ├── developers → "I can show you our API documentation"
  ├── trades → "Works great for field work"
  ├── enterprise → "We offer SSO and dedicated support"  
  └── marketing → "Streamlines content creation workflows"

// Improved Review Instructions (Fixed Issue)
generateAppointmentReviewResponse(appointmentDetails)
  └── Includes specific examples:
      "Change service to pricing consultation"
      "Change date to October 20th"
      "Change time to 2 PM"
```

---

### 👤 UserInfoCollector.js **USER INFORMATION COLLECTION**

**Purpose**: Collects and validates user name and email

**Key Methods**:
```javascript
async processUserInfo(text, currentUserInfo, sessionId)
  ├── extractUserInfo(text) // Uses GPT to extract name/email
  ├── validateEmail(email)  // Email format validation
  ├── updateUserInfo(currentUserInfo, extracted)
  └── generateResponse(userInfo) // Contextual response

// System Prompt (SherpaPrompt-specific)
getCollectionSystemPrompt()
  └── "You're a friendly voice assistant for SherpaPrompt - 
       the automation platform that turns conversations into outcomes"

// Response Templates  
generateCollectionResponse(userInfo)
  ├── Both collected → "Thanks [name]! I've got your email as [email]. 
  │                     Do you have questions about SherpaPrompt's automation services?"
  ├── Name only → "Thanks [name]! What's your email address?"
  └── Email only → "Got your email! What's your name?"
```

---

### 📅 AppointmentFlowManager.js **DEMO SCHEDULING** ⭐ **MAJOR FIXES**

**Purpose**: Manages end-to-end demo scheduling flow

**Fixed Issues**:
- ❌ "Fence consultation" → ✅ "Product demo"  
- ❌ Fencing services → ✅ SherpaPrompt automation services
- ❌ Fencing phone numbers → ✅ SherpaPrompt contact info

**State Machine**:
```javascript
this.steps = {
  SELECT_CALENDAR: 'select_calendar',    // Google vs Microsoft
  COLLECT_TITLE: 'collect_title',        // Service type selection
  COLLECT_DATE: 'collect_date',          // Date input & validation
  COLLECT_TIME: 'collect_time',          // Time slot selection  
  REVIEW: 'review',                      // Appointment review
  CONFIRM: 'confirm'                     // Final confirmation
};
```

**SherpaPrompt Service Types** (Updated):
```javascript
// Service Classification (Fixed from Fencing)
fallbackServiceExtraction(text)
  ├── 'demo' → 'Product demo'
  ├── 'integration' → 'Integration discussion'  
  ├── 'pricing' → 'Pricing consultation'
  ├── 'technical' → 'Technical consultation'
  ├── 'call automation' → 'Call automation demo'
  ├── 'transcript' → 'Transcript service demo'
  ├── 'voice estimate' → 'Voice estimate demo'
  └── default → 'Product demo'

// AI Service Classification Prompt (Updated)
serviceExtractionPrompt = `
Map to these exact service names:
- "Product demo" (for product demonstrations)
- "Automation consultation" (for consultations, advice)  
- "Integration discussion" (for integrations)
- "Pricing consultation" (for quotes, pricing)
- "Technical consultation" (for technical questions)
- "Call automation demo" (for call service demos)
- "Transcript service demo" (for transcript demos)
- "Voice estimate demo" (for voice estimate demos)
`;
```

**Key Methods**:
```javascript
async processFlow(session, text, getCalendarService)
  ├── handleCalendarSelection() // Google/Microsoft choice
  ├── handleServiceCollection() // Service type selection
  ├── handleDateCollection()    // Date validation & weekend handling
  ├── handleTimeCollection()    // Available slot selection
  └── handleReview()            // Appointment confirmation

// Weekend Date Handling
async handleDateCollection(session, text, getCalendarService)  
  ├── dateTimeParser.parseDate(text)
  ├── Check if weekend → Reject with alternatives
  ├── calendarService.findAvailableSlots(date)
  └── Present available 30-minute slots (12 PM - 4 PM, Mon-Fri)

// Calendar Integration
async createCalendarAppointment(appointmentDetails, calendarService)
  ├── Format appointment for calendar API
  ├── Create calendar event (Google/Microsoft)
  ├── Generate calendar link
  └── Return confirmation details
```

---

### 🤖 SherpaPromptRAG.js **KNOWLEDGE BASE SYSTEM** ⭐ **MIGRATED**

**Purpose**: Retrieval Augmented Generation for SherpaPrompt knowledge

**System Prompt** (Updated for SherpaPrompt):
```javascript
SystemMessagePromptTemplate.fromTemplate(`
You are a concise AI assistant for SherpaPrompt - the automation platform 
that turns conversations into outcomes.

Guidelines:
- Focus on our four core products: Call Service Automation, Transcript to Task, 
  Voice to Estimate, and SherpaPrompt App
- Use conversational language suitable for voice responses  
- Replace technical symbols: use "is" instead of "=", "to" instead of "-"
- Keep responses brief and natural for speech
- Never provide contact information unless specifically asked

Context from relevant knowledge base sections:
{context}
`);
```

**Key Methods**:
```javascript
async generateResponse(question, context, conversationHistory)
  ├── ragChain.invoke({ question, context })
  ├── Parse structured response or fallback to text
  └── Return { answer, confidence, sources_used, follow_up_questions }

formatContext(similarContent)
  ├── Group content by category  
  ├── Format with clear section headers
  └── Return structured context string

generateFollowUpQuestions(question, similarContent)
  ├── Analyze content categories
  ├── Generate relevant follow-up questions
  └── Return max 3 questions
```

**Knowledge Base Files**:
```
data/SherpaPrompt_AHCA_Knowledge/
├── company_mission_1.1.json           # Company overview & mission
├── product_knowledge_1.2.json         # Detailed product information  
├── pricing_1.1.json                   # Pricing tiers & features
├── audience_playbooks_1.2.json        # Audience-specific responses
├── support_troubleshooting_1.2.json   # Support & troubleshooting
├── Intent Snippets_1.3.json           # Intent classification patterns
└── oncall_escalation_1.1.json         # Escalation procedures
```

---

### 📧 EmailService.js **EMAIL NOTIFICATIONS** ⭐ **UPDATED BRANDING**

**Purpose**: Send conversation summaries and appointment confirmations

**Fixed Issues**:
- ❌ "SherpaPrompt Fencing Company" → ✅ "SherpaPrompt"
- ❌ Fencing service references → ✅ Automation services  
- ❌ Fencing contact info → ✅ SherpaPrompt contact info
- ❌ Duplicate emails → ✅ Single email per conversation

**Multi-Provider Support**:
```javascript
// Primary: Resend API
async sendViaResend(userInfo, htmlContent, textContent)
  ├── from: 'SherpaPrompt <onboarding@resend.dev>'
  ├── subject: 'Your SherpaPrompt Conversation Summary'  
  └── Enhanced HTML template with SherpaPrompt branding

// Fallback: Mailchimp Transactional  
async sendViaMailchimp(userInfo, htmlContent, textContent)
  ├── from_name: 'SherpaPrompt'
  ├── subject: 'Your SherpaPrompt Conversation Summary'
  └── Mailchimp API integration
```

**Email Templates** (Updated):
```html
<!-- HTML Template -->
<div class="header">
  <div class="logo">🤖 SherpaPrompt</div>
  <p>Your Conversation Summary</p>
</div>

<div class="content">
  <p>Thank you for contacting SherpaPrompt. Here's a summary of our conversation:</p>
  <!-- Conversation details -->
  <p>We appreciate your interest in our automation services and look forward 
     to helping you transform your workflows!</p>
</div>
```

**Key Methods**:
```javascript
async sendConversationSummary(userInfo, conversationHistory, appointmentDetails)
  ├── generateConversationSummary() // AI-powered summary
  ├── createEmailTemplate() // HTML/text formatting
  ├── Try Resend → Fallback to Mailchimp
  └── addToMailingList() // Optional mailing list signup

async generateConversationSummary(conversationHistory, appointmentDetails)
  ├── AI analysis of conversation
  ├── Extract key points and topics
  ├── Generate next steps
  └── Return structured summary
```

---

## Shared Services

### 📊 EmbeddingService.js **VECTOR SEARCH**
```javascript
// MongoDB Atlas Vector Search
async searchSimilarContent(query, limit = 5)
  ├── Generate query embedding
  ├── Vector similarity search  
  ├── Retrieve matching documents
  └── Return ranked results
```

### 📅 Calendar Services
```javascript
// GoogleCalendarService.js
async findAvailableSlots(date)
async createEvent(eventDetails)

// MicrosoftCalendarService.js  
async findAvailableSlots(date)
async createEvent(eventDetails)
```

### 🏢 CompanyInfoService.js **COMPANY INFORMATION** ⭐ **UPDATED**
```javascript
// Updated Company Information (Fixed from Fencing)
this.fallbackCompanyInfo = {
  name: "SherpaPrompt",
  tagline: "Conversations into Outcomes", 
  phone: "(555) 123-4567",
  email: "info@sherpaprompt.com",
  website: "www.sherpaprompt.com",
  address: "1234 Automation Way, San Francisco, CA 94105",
  service_areas: ["Global", "Remote", "Cloud-based"]
};
```

---

## Complete Data Flow

### 1. Voice Input Processing Flow
```
User Speech → MediaRecorder (WebM) → 1-second chunks → Base64 encoding → 
Server VAD → WebM→PCM16 conversion → OpenAI Realtime API → 
Speech Detection Events → Transcription → Intent Classification → 
Response Generation → TTS Synthesis → Audio Response → Client Playback
```

### 2. RAG Query Processing Flow  
```
User Question → Search Term Extraction → Vector Similarity Search → 
Context Retrieval → SherpaPromptRAG Processing → LLM Response Generation → 
Audience Enhancement → Response Formatting → TTS Conversion → Audio Output
```

### 3. Demo Scheduling Flow
```
Demo Request → Calendar Selection (Google/Microsoft) → 
Service Selection (Product Demo/Consultation/etc.) → Date Input → 
Weekend Validation → Time Slot Availability → Appointment Review → 
User Confirmation → Calendar API Integration → Email Confirmation → 
Mailing List Addition
```

### 4. Email Notification Flow (Fixed Duplicates)
```
Conversation End → Check emailSent flag → Generate AI Summary → 
Create HTML/Text Templates → Try Resend API → Fallback to Mailchimp → 
Set emailSent = true → Prevent Duplicate Sending
```

---

## Configuration & Environment

### Required Environment Variables
```bash
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key

# Database Configuration
MONGODB_URI=your_mongodb_atlas_uri

# Email Service Configuration  
RESEND_API_KEY=your_resend_api_key
MAILCHIMP_API_KEY=your_mailchimp_api_key
MAILCHIMP_SERVER_PREFIX=your_server_prefix

# Calendar Integration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
MICROSOFT_CLIENT_ID=your_microsoft_client_id  
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret

# Server Configuration
PORT=3001
NODE_ENV=production
```

### Client Configuration
```javascript
// RealtimeVADVoiceAgent.jsx
const VAD_CONFIG = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  chunkIntervalMs: 1000,
  statusCheckIntervalMs: 1000,
  responseCheckIntervalMs: 500
};
```

---

## Testing & Validation

### Comprehensive Test Suite (`scripts/comprehensive-voice-test.js`)

**Test Coverage**:
```javascript
// Test Categories & Files
1. Name & Email Collection → UserInfoCollector.js
2. RAG Knowledge Queries → SherpaPromptRAG.js, EmbeddingService.js  
3. Demo Scheduling → AppointmentFlowManager.js, Calendar Services
4. Weekend Date Handling → DateTimeParser.js, AppointmentFlowManager.js
5. Email Changes → UserInfoCollector.js, ConversationFlowHandler.js
6. Edge Cases → All services error handling
7. Email Integration → EmailService.js  
8. Complete Flow → Full system integration
```

**Latest Test Results**:
- ✅ **Success Rate**: 89.5% (17/19 tests passed)
- ✅ **Core Functionality**: All working  
- ✅ **SherpaPrompt Migration**: Complete
- ❌ **Minor Issues**: Calendar selection test criteria, email endpoint availability

**Running Tests**:
```bash
# Start server
cd ahca-server && npm start

# Run comprehensive tests  
node scripts/comprehensive-voice-test.js

# View results
cat voice-agent-test-report-[timestamp].json
```

---

## Performance Characteristics

### Response Times
- **VAD Detection**: ~500ms speech start/stop detection
- **Transcription**: ~1-2s (OpenAI Whisper STT)
- **RAG Query**: ~2-3s (including vector search + LLM)  
- **TTS Generation**: ~1-2s (OpenAI TTS)
- **Total Response Time**: ~4-8s end-to-end

### Scalability Features
- **Session Management**: In-memory with automatic cleanup
- **Connection Pooling**: MongoDB Atlas connection reuse
- **Rate Limiting**: Built-in OpenAI API rate limiting
- **Error Recovery**: Graceful degradation and fallbacks
- **Memory Management**: Automatic session cleanup after conversations

---

## Security & Privacy

### Data Protection
- **PII Handling**: Secure collection and storage of names/emails
- **Session Isolation**: Each conversation in separate session  
- **API Security**: Environment variable configuration
- **CORS Configuration**: Restricted client origins
- **Audio Data**: No persistent storage, encrypted transmission

### Compliance Features  
- **Data Retention**: Configurable session cleanup (default: 30 minutes)
- **Audit Logging**: Comprehensive request/response logging
- **Error Handling**: Secure error messages without data exposure
- **Email Opt-out**: Mailing list management capabilities

---

## Deployment & Monitoring

### Production Deployment
```yaml
# Recommended Architecture
Production Environment:
├── Load Balancer (nginx/AWS ALB)
├── Application Servers (Node.js instances)  
├── Database (MongoDB Atlas)
├── File Storage (AWS S3/Azure Blob)
├── CDN (CloudFlare/AWS CloudFront)
└── Monitoring (DataDog/New Relic)
```

### Health Monitoring
```javascript
// Health Check Endpoint
GET /api/chained-voice/health
Response: {
  status: "OK",
  services: {
    database: { ready: true },
    email: { ready: true }, 
    openai: { ready: true }
  }
}
```

### Logging Strategy
- **Structured Logging**: JSON format with correlation IDs
- **Performance Metrics**: Response times, success rates
- **Error Tracking**: Detailed error context and stack traces  
- **Business Metrics**: Conversation completion rates, demo bookings

---

## Troubleshooting Guide

### Common Issues & Solutions

#### 🚨 Server Won't Start
```bash
# Check environment variables
cat .env

# Verify dependencies
npm install

# Check port availability  
lsof -i :3001
```

#### 🎤 VAD Not Working
```bash
# Check microphone permissions in browser
# Verify HTTPS for production (required for microphone access)
# Check browser console for WebRTC errors
# Verify OpenAI API key and quota
```

#### 🔍 RAG Queries Failing
```bash
# Verify MongoDB connection
# Check OpenAI API key and quota  
# Validate knowledge base JSON files
# Test embedding service connectivity
```

#### 📅 Calendar Integration Issues
```bash
# Verify OAuth credentials
# Check calendar API quotas
# Validate redirect URIs
# Test calendar service connectivity
```

#### 📧 Email Service Issues  
```bash
# Check Resend API key
# Verify Mailchimp credentials
# Test email service health endpoint
# Check email template formatting
```

---

## Migration Summary ✅ **COMPLETED**

### Issues Fixed
1. **❌ Fencing References → ✅ SherpaPrompt Services**
   - Updated all "Fence consultation" to "Product demo"
   - Changed service types to automation services
   - Fixed company information and contact details

2. **❌ Vague Review Instructions → ✅ Clear Examples**  
   - Added specific change examples in appointment review
   - Improved user experience with actionable instructions

3. **❌ Duplicate Emails → ✅ Single Email**
   - Added `emailSent` flag to prevent duplicates
   - Fixed multiple email triggers in goodbye/cleanup flows

4. **❌ Fencing Email Templates → ✅ SherpaPrompt Branding**
   - Updated all email content and branding
   - Changed contact information and messaging

5. **❌ Outdated Company Info → ✅ Current SherpaPrompt Details**
   - Updated address, phone, email, service areas
   - Changed from fencing to automation services

6. **❌ Name Update Redundancy → ✅ Smart Name Setting** (Latest Fix)
   - Fixed "I've updated your name from X to X" redundancy
   - Now says "I've set your name to X" when no previous name exists
   - Only says "I've updated your name to X" when changing from a different name

7. **❌ Multiple Response Issue → ✅ Robust Interruption Handling** (Latest Fix)
   - Implemented smart transcription queuing to prevent overlapping responses
   - Added interruption detection that stores only the latest user input
   - Processing now uses only the most recent transcription after interruption
   - Fixed issue where interrupting caused multiple delayed responses

### Latest Enhancements (Oct 2025)
#### Interruption Handling System
```javascript
// Smart Transcription Processing
- Queues new transcriptions when already processing
- Marks sessions as 'interrupted' when user starts speaking
- Uses only the LATEST transcription after interruption completes
- Discards all responses from interrupted processing
```

**How It Works:**
1. User speaks → System starts processing
2. User interrupts by speaking again
3. System marks as 'interrupted' and stores new transcription
4. Old processing completes but response is discarded
5. Latest transcription is processed and responded to

### Verification Results
- ✅ Appointments create "Product demo" instead of "Fence consultation"
- ✅ Service options are SherpaPrompt automation services  
- ✅ Review instructions include clear examples
- ✅ All messaging uses SherpaPrompt branding
- ✅ No fencing references in responses
- ✅ Email duplicates resolved
- ✅ Name setting logic improved (no redundant "from X to X")
- ✅ Interruption handling prevents multiple responses
- ✅ System processes only latest user input after interruption
- ✅ Test success rate: 89.5%

---

## Future Enhancements

### Planned Features
1. **Multi-language Support** - Internationalization for global reach
2. **Advanced Analytics** - Conversation insights and reporting dashboard  
3. **Custom Voice Models** - Brand-specific TTS voices
4. **Integration Marketplace** - Third-party service connections
5. **Mobile Applications** - Native iOS/Android apps
6. **Advanced Personalization** - ML-driven user preferences

### Technical Improvements  
1. **Streaming Responses** - Real-time response generation
2. **Edge Computing** - Reduced latency with edge deployment
3. **Advanced VAD** - Custom voice activity detection models
4. **Caching Layer** - Redis for improved response times
5. **Microservices Architecture** - Service decomposition for scalability

---

## Quick Reference

### 🔧 Key Files for Common Tasks

**Adding New Intents**:
- `IntentClassifier.js` - Add pattern matching
- `ConversationFlowHandler.js` - Add intent routing
- `ResponseGenerator.js` - Add response generation

**Modifying Appointment Flow**:
- `AppointmentFlowManager.js` - State machine logic
- `DateTimeParser.js` - Date/time validation  
- Calendar services - Integration logic

**Updating Knowledge Base**:
- `data/SherpaPrompt_AHCA_Knowledge/` - JSON files
- `SherpaPromptRAG.js` - RAG processing
- `EmbeddingService.js` - Vector search

**Changing Email Templates**:
- `EmailService.js` - Template generation
- Email provider configuration

**UI Modifications**:
- `RealtimeVADVoiceAgent.jsx` - Primary interface
- `VoiceAgent.jsx` - Main container

### 🚀 Development Workflow

1. **Start Development**:
   ```bash
   # Server
   cd ahca-server && npm run dev
   
   # Client  
   cd ahca-client && npm run dev
   ```

2. **Run Tests**:
   ```bash
   cd ahca-server && node scripts/comprehensive-voice-test.js
   ```

3. **Check Health**:
   ```bash
   curl http://localhost:3001/api/chained-voice/health
   ```

---

**Document Version**: 2.1  
**Last Updated**: October 15, 2025  
**System Status**: ✅ SherpaPrompt Migration Complete + Latest Enhancements  
**Test Success Rate**: 89.5% (17/19 tests passing)  
**Core Services**: Call Service Automation, Transcript to Task, Voice to Estimate, SherpaPrompt App  
**Latest Fixes**: Smart Name Setting, Robust Interruption Handling