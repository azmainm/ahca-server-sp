# SherpaPrompt Voice Agent System Documentation

## Overview

The SherpaPrompt Voice Agent System is a comprehensive end-to-end voice automation platform that enables natural conversations with AI agents to learn about SherpaPrompt's automation services, schedule demos, and provide customer support. The system implements OpenAI's Realtime API architecture with Voice Activity Detection (VAD), Retrieval Augmented Generation (RAG), and seamless calendar integration.

## System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client (Web)  │    │  Server (API)   │    │  External APIs  │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ VAD Voice   │ │◄──►│ │ Voice Agent │ │◄──►│ │ OpenAI API  │ │
│ │ Interface   │ │    │ │ Routes      │ │    │ │             │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│                 │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ ┌─────────────┐ │    │ │ RAG System  │ │◄──►│ │ MongoDB     │ │
│ │ React UI    │ │    │ │ (SherpaRAG) │ │    │ │ Atlas       │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│                 │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│                 │    │ │ Calendar    │ │◄──►│ │ Google/MS   │ │
│                 │    │ │ Services    │ │    │ │ Calendar    │ │
│                 │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core Components

### 1. Client-Side Architecture (`ahca-client/`)

#### Main Components
- **`src/features/voice-agent/components/VoiceAgent.jsx`** - Main UI container
- **`src/features/voice-agent/components/RealtimeVADVoiceAgent.jsx`** - Core VAD voice interface
- **`src/features/voice-agent/components/ChainedVoiceAgent.jsx`** - Alternative voice interface

#### Voice Activity Detection (VAD) Flow
```javascript
// File: RealtimeVADVoiceAgent.jsx
const VAD_CONFIG = {
  chunkIntervalMs: 1000,        // Send 1-second audio chunks
  statusCheckIntervalMs: 1000,  // Check VAD status every second
  responseCheckIntervalMs: 500, // Check for responses every 500ms
  apiUrl: 'http://localhost:3001'
};

// Key Functions:
startConversation() → startRealtimeVAD() → startAudioStreaming()
```

#### Audio Processing Pipeline
1. **MediaRecorder** captures microphone audio
2. **WebM/WAV encoding** with 1-second chunks
3. **Base64 conversion** for transmission
4. **Real-time streaming** to server VAD endpoint
5. **Status monitoring** for speech detection
6. **Response polling** for AI audio responses

### 2. Server-Side Architecture (`ahca-server/`)

#### Core Services Directory Structure
```
ahca-server/
├── features/voice-agent/
│   ├── routes/chained-voice.js          # Main API routes
│   └── services/
│       ├── ConversationFlowHandler.js   # Central orchestrator
│       ├── IntentClassifier.js          # Intent recognition
│       ├── ResponseGenerator.js         # Response generation
│       ├── UserInfoCollector.js         # Name/email collection
│       ├── AppointmentFlowManager.js    # Demo scheduling
│       └── RealtimeVADService.js        # VAD processing
├── shared/services/
│   ├── SherpaPromptRAG.js              # Main RAG system
│   ├── FencingRAG.js                   # Backward compatibility
│   ├── EmbeddingService.js             # Vector search
│   ├── GoogleCalendarService.js        # Google Calendar
│   ├── MicrosoftCalendarService.js     # Microsoft Calendar
│   └── EmailService.js                 # Email notifications
└── data/SherpaPrompt_AHCA_Knowledge/   # Knowledge base
```

## Detailed Component Analysis

### 3. Voice Agent Routes (`features/voice-agent/routes/chained-voice.js`)

#### Main API Endpoints
```javascript
// Core Processing Endpoint
POST /api/chained-voice/process
- Input: { text, sessionId }
- Output: { response, userInfo, calendarLink, appointmentDetails }

// VAD Endpoints
POST /api/chained-voice/realtime-vad/start
POST /api/chained-voice/realtime-vad/audio
GET  /api/chained-voice/realtime-vad/status/:sessionId
GET  /api/chained-voice/realtime-vad/response/:sessionId

// Utility Endpoints
POST /api/chained-voice/transcribe
GET  /api/chained-voice/health
```

#### Service Initialization
```javascript
// Key Services Initialized
const sherpaPromptRAG = new SherpaPromptRAG();
const conversationFlowHandler = new ConversationFlowHandler({
  stateManager,
  userInfoCollector,
  appointmentFlowManager,
  intentClassifier,
  responseGenerator,
  companyInfoService,
  sherpaPromptRAG,
  embeddingService,
  emailService
});
```

### 4. Conversation Flow Handler (`services/ConversationFlowHandler.js`)

#### Core Responsibilities
- **Session Management** - Track conversation state across interactions
- **Intent Routing** - Direct requests to appropriate handlers
- **RAG Integration** - Query knowledge base for relevant information
- **Response Orchestration** - Coordinate between all services

#### Key Methods
```javascript
// Main processing method
async processMessage(text, sessionId)

// Specialized handlers
async handleNameEmailCollection(text, sessionId, session)
async handleAppointmentFlow(text, sessionId, session)
async handleRegularQA(text, sessionId, session)
async processNewQuestion(text, sessionId, session, isFollowUp)
```

### 5. RAG System (`shared/services/SherpaPromptRAG.js`)

#### Knowledge Base Integration
```javascript
class SherpaPromptRAG {
  constructor() {
    this.llm = new ChatOpenAI({
      modelName: 'gpt-5-nano',
      max_tokens: 1000,
    });
    
    // SherpaPrompt-specific system prompt
    this.chatPrompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(`
        You are a helpful AI assistant for SherpaPrompt - the automation 
        platform that turns conversations into outcomes.
        
        SherpaPrompt offers four core products:
        1. Call Service Automation
        2. Transcript to Task  
        3. Voice to Estimate
        4. SherpaPrompt App
      `),
      HumanMessagePromptTemplate.fromTemplate("{question}")
    ]);
  }
}
```

#### Knowledge Base Files
```
data/SherpaPrompt_AHCA_Knowledge/
├── company_mission_1.1.json           # Company overview
├── product_knowledge_1.2.json         # Product details
├── pricing_1.1.json                   # Pricing information
├── audience_playbooks_1.2.json        # Audience-specific responses
├── support_troubleshooting_1.2.json   # Support documentation
├── Intent Snippets_1.3.json           # Intent patterns
└── oncall_escalation_1.1.json         # Escalation procedures
```

### 6. Intent Classification (`services/IntentClassifier.js`)

#### Enhanced Pattern Recognition
```javascript
class IntentClassifier {
  constructor() {
    // Base patterns
    this.patterns = {
      goodbye: [/goodbye/i, /bye/i, /thank you.*no more/i],
      appointment: [/demo/i, /schedule.*demo/i, /show.*me/i],
      // ... more patterns
    };
    
    // Load SherpaPrompt-specific patterns
    this.loadSherpaPromptPatterns();
  }
  
  loadSherpaPromptPatterns() {
    const intentSnippets = require('../../../data/SherpaPrompt_AHCA_Knowledge/Intent Snippets_1.3.json');
    // Extract and convert utterances to regex patterns
    // Add sales, support, scheduling, pricing, emergency patterns
  }
}
```

#### Intent Types Supported
- **Core Intents**: goodbye, appointment, nameChange, emailChange
- **SherpaPrompt Intents**: sales, support, scheduling, pricing, emergency
- **Follow-up Intents**: moreQuestions, appointmentFromFollowUp

### 7. Response Generation (`services/ResponseGenerator.js`)

#### Audience-Aware Responses
```javascript
class ResponseGenerator {
  constructor(openAIService) {
    this.openAIService = openAIService;
    this.loadAudiencePlaybooks();
  }
  
  // Audience detection keywords
  audienceKeywords = {
    developers: ['developer', 'api', 'technical', 'integration'],
    trades: ['contractor', 'field', 'job site', 'estimate'],
    enterprise: ['enterprise', 'corporate', 'sso', 'security'],
    marketing: ['marketing', 'content', 'campaign', 'analytics']
  };
  
  // Enhanced responses based on audience
  enhanceResponseForAudience(response, audience) {
    const enhancements = {
      developers: " I can show you our API documentation and integration guides.",
      trades: " This works great for field work where hands-free operation is essential.",
      enterprise: " We offer enterprise features like SSO and dedicated support.",
      marketing: " This can streamline your content creation workflows."
    };
    return response + (enhancements[audience] || '');
  }
}
```

#### SherpaPrompt-Specific Response Methods
```javascript
generateProductInfoResponse(productArea)  // Call Service, Transcript, etc.
generateDemoOfferResponse()               // Demo scheduling
generatePricingResponse()                 // Pricing information
generateConversationalResponse()          // General conversation
```

### 8. User Information Collection (`services/UserInfoCollector.js`)

#### Collection Flow
```javascript
class UserInfoCollector {
  // System prompt for name/email collection
  getCollectionSystemPrompt() {
    return `You're a friendly voice assistant for SherpaPrompt - the automation 
    platform that turns conversations into outcomes.
    
    CRITICAL INSTRUCTIONS:
    - ONLY collect name and email
    - If you have both, respond with: "Thanks [name]! I've got your email as [email]. 
      Do you have any questions about SherpaPrompt's automation services, or would 
      you like to schedule a demo?"`;
  }
  
  // Process user input for name/email extraction
  async processUserInfo(text, currentUserInfo, sessionId)
}
```

### 9. Appointment Flow Management (`services/AppointmentFlowManager.js`)

#### Demo Scheduling States
```javascript
const APPOINTMENT_STATES = {
  CALENDAR_SELECTION: 'calendar_selection',
  SERVICE_SELECTION: 'service_selection', 
  DATE_SELECTION: 'date_selection',
  TIME_SELECTION: 'time_selection',
  REVIEW: 'review',
  CONFIRMED: 'confirmed'
};
```

#### Calendar Integration
- **Google Calendar Service** - OAuth2 integration for Google Calendar
- **Microsoft Calendar Service** - Microsoft Graph API integration
- **Appointment Creation** - 30-minute demo slots, Monday-Friday 12-4 PM
- **Weekend Handling** - Automatic rejection with alternative suggestions

### 10. Email Service (`shared/services/EmailService.js`)

#### Multi-Provider Support
```javascript
class EmailService {
  constructor() {
    this.resendClient = new Resend(process.env.RESEND_API_KEY);
    this.mailchimpClient = mailchimp(process.env.MAILCHIMP_API_KEY);
  }
  
  // Send appointment confirmations
  async sendAppointmentConfirmation(userInfo, appointmentDetails)
  
  // Send conversation summaries  
  async sendConversationSummary(userInfo, conversationHistory)
  
  // Add to mailing list
  async addToMailingList(email, firstName, lastName, tags)
}
```

## Data Flow Architecture

### 1. Voice Input Processing Flow
```
User Speech → MediaRecorder → WebM Chunks → Base64 Encoding → 
Server VAD → OpenAI Whisper → Text Transcription → Intent Classification → 
Response Generation → TTS → Audio Response → Client Playback
```

### 2. RAG Query Processing Flow
```
User Question → Search Term Extraction → Vector Similarity Search → 
Context Retrieval → SherpaPromptRAG → LLM Processing → 
Audience Enhancement → Response Formatting → TTS Conversion
```

### 3. Demo Scheduling Flow
```
Demo Request → Calendar Selection → Service Selection → Date Input → 
Weekend Validation → Time Slot Availability → Appointment Review → 
User Confirmation → Calendar API → Email Confirmation → 
Mailing List Addition
```

## Configuration and Environment

### Environment Variables Required
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
// File: ahca-client/src/features/voice-agent/components/RealtimeVADVoiceAgent.jsx
const VAD_CONFIG = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
};
```

## Testing and Validation

### Comprehensive Test Suite (`scripts/comprehensive-voice-test.js`)

#### Test Coverage
1. **Name & Email Collection** - User information gathering
2. **RAG Knowledge Queries** - SherpaPrompt service questions
3. **Demo Scheduling** - End-to-end appointment booking
4. **Weekend Date Handling** - Date validation and alternatives
5. **Email Changes** - Dynamic user information updates
6. **Edge Cases** - Error handling and recovery
7. **Email Service Integration** - Notification system testing
8. **Complete Conversation Flow** - Full end-to-end scenarios

#### Test Results (Latest)
- **Success Rate**: 89.5% (17/19 tests passed)
- **Core Functionality**: ✅ All working
- **Minor Issues**: Calendar selection test criteria, email endpoint availability

### Running Tests
```bash
# Start the server
cd ahca-server && npm start

# Run comprehensive tests
node scripts/comprehensive-voice-test.js

# Test report saved to: voice-agent-test-report-[timestamp].json
```

## Performance Characteristics

### Response Times
- **VAD Detection**: ~500ms speech detection
- **Transcription**: ~1-2s (OpenAI Whisper)
- **RAG Query**: ~2-3s (including vector search)
- **TTS Generation**: ~1-2s (OpenAI TTS)
- **Total Response Time**: ~4-8s end-to-end

### Scalability Features
- **Session Management**: In-memory with automatic cleanup
- **Connection Pooling**: MongoDB Atlas connection reuse
- **Rate Limiting**: Built-in OpenAI API rate limiting
- **Error Recovery**: Graceful degradation and fallbacks

## Security and Privacy

### Data Protection
- **PII Handling**: Secure collection and storage of names/emails
- **Session Isolation**: Each conversation in separate session
- **API Security**: Environment variable configuration
- **CORS Configuration**: Restricted client origins

### Compliance Features
- **Data Retention**: Configurable session cleanup
- **Audit Logging**: Comprehensive request/response logging
- **Error Handling**: Secure error messages without data exposure

## Deployment Architecture

### Production Deployment
```yaml
# Recommended deployment structure
Production Environment:
├── Load Balancer (nginx/AWS ALB)
├── Application Servers (Node.js instances)
├── Database (MongoDB Atlas)
├── File Storage (AWS S3/Azure Blob)
├── CDN (CloudFlare/AWS CloudFront)
└── Monitoring (DataDog/New Relic)
```

### Docker Configuration
```dockerfile
# Server Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]

# Client Dockerfile  
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Monitoring and Observability

### Logging Strategy
- **Structured Logging**: JSON format with correlation IDs
- **Performance Metrics**: Response times, success rates
- **Error Tracking**: Detailed error context and stack traces
- **Business Metrics**: Conversation completion rates, demo bookings

### Health Checks
```javascript
// Health check endpoint
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

## Future Enhancements

### Planned Features
1. **Multi-language Support** - Internationalization
2. **Advanced Analytics** - Conversation insights and reporting
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

## Troubleshooting Guide

### Common Issues and Solutions

#### Server Won't Start
```bash
# Check environment variables
cat .env

# Verify dependencies
npm install

# Check port availability
lsof -i :3001
```

#### VAD Not Working
```bash
# Check microphone permissions in browser
# Verify HTTPS for production (required for microphone access)
# Check browser console for WebRTC errors
```

#### RAG Queries Failing
```bash
# Verify MongoDB connection
# Check OpenAI API key and quota
# Validate knowledge base JSON files
```

#### Calendar Integration Issues
```bash
# Verify OAuth credentials
# Check calendar API quotas
# Validate redirect URIs
```

## Conclusion

The SherpaPrompt Voice Agent System represents a comprehensive, production-ready voice automation platform that successfully combines modern web technologies, AI services, and business logic to deliver natural voice interactions for customer engagement, lead qualification, and demo scheduling.

The system's modular architecture, comprehensive testing, and robust error handling make it suitable for enterprise deployment while maintaining the flexibility for future enhancements and integrations.

---

**Document Version**: 1.0  
**Last Updated**: October 14, 2025  
**System Version**: SherpaPrompt Migration Complete  
**Test Success Rate**: 89.5%
