# After Hours Call Agent (AHCA) - Voice AI System

## Overview

The After Hours Call Agent is an AI-powered voice assistant system designed for SherpaPrompt Fencing Company. It provides automated customer service through natural voice conversations, combining speech-to-text, intelligent text processing with RAG (Retrieval-Augmented Generation), and text-to-speech technologies.

## Architecture

This system follows OpenAI's recommended **Chained Architecture** for voice agents:

```
Audio Input → STT (Whisper) → Text Processing (GPT-4 + RAG) → TTS (TTS-1) → Audio Output
```

### Key Components

- **Frontend (ahca-client)**: React/Next.js web application with voice interface
- **Backend (ahca-server)**: Node.js/Express API server with OpenAI integrations
- **Database**: MongoDB Atlas with vector search for knowledge base
- **AI Services**: OpenAI Whisper (STT), GPT-4 (LLM), TTS-1 (Speech)

## Backend (ahca-server) - Detailed Implementation

### Core Architecture

#### 1. Main Server (`server.js`)
```javascript
// Entry point that sets up Express server with middleware
- CORS configuration for client communication
- JSON parsing middleware
- Route registration for API endpoints
- Environment variable loading
```

#### 2. Chained Voice Route (`routes/chained-voice.js`)
The main voice processing pipeline implementing OpenAI's chained architecture:

**Three Core Endpoints:**

1. **`POST /api/chained-voice/transcribe`**
   - Converts audio (base64) to text using OpenAI Whisper
   - Handles multipart form data for audio files
   - Returns transcribed text

2. **`POST /api/chained-voice/process`**
   - Core business logic processor
   - Manages conversation state and user information
   - Implements two phases:
     - **Phase 1**: Name and email collection
     - **Phase 2**: Knowledge-based Q&A with RAG
   - Handles goodbye detection and conversation ending

3. **`POST /api/chained-voice/synthesize`**
   - Converts text responses to speech using OpenAI TTS-1
   - Returns base64 encoded audio

**Session Management:**
```javascript
// In-memory session storage
const sessions = new Map();

// Session structure
{
  conversationHistory: [],
  userInfo: { name: null, email: null, collected: false },
  createdAt: new Date()
}
```

#### 3. RAG Implementation

**EmbeddingService (`services/EmbeddingService.js`)**
- Manages OpenAI embeddings (text-embedding-3-small)
- Handles MongoDB Atlas Vector Search integration
- Provides similarity search functionality
- Manages document chunking and storage

**FencingRAG (`services/FencingRAG.js`)**
- LangChain-based RAG implementation
- Uses GPT-5-nano for response generation
- Formats context from knowledge base
- Generates structured responses with confidence levels

#### 4. Conversation Flow

**Phase 1: Information Collection**
```javascript
// Extracts name and email from user input
const extractionPrompt = `Extract name and email from: "${text}"`;
// Uses regex and LLM parsing for robust extraction
// Transitions to Phase 2 when both collected
```

**Phase 2: Knowledge-Based Assistance**
```javascript
// Search knowledge base using keywords
const searchTerms = extractSearchTerms(text);
const searchResults = await embeddingService.searchSimilarContent(query, 3);

// Generate contextual response
const ragResponse = await fencingRAG.generateResponse(text, context, history);
```

**Goodbye Detection**
```javascript
const goodbyePatterns = [
  /thank you.*no more/i,
  /that.*all.*need/i,
  /goodbye/i,
  // ... more patterns
];
```

### Knowledge Base Integration

#### MongoDB Atlas Setup
- **Database**: `ah-call-service`
- **Collection**: `knowledge_base`
- **Vector Index**: `vector_index` 
- **Search Method**: Atlas Vector Search with embeddings

#### Vector Search Configuration
```javascript
{
  textKey: "text",
  embeddingKey: "embedding",
  indexName: "vector_index"
}
```

### Environment Variables Required
```env
OPENAI_API_KEY=your_openai_api_key
MONGODB_URI=your_mongodb_atlas_connection_string
PORT=3001
```

## Frontend (ahca-client) - Detailed Implementation

### Core Architecture

#### 1. Main Components

**VoiceAgent.jsx** - Main container component
- Provides layout and title
- Manages overall application state
- Renders ChainedVoiceAgent component

**ChainedVoiceAgent.jsx** - Core voice interface
- Implements push-to-talk interface
- Manages audio recording and playback
- Handles API communication with backend
- Manages conversation state

#### 2. Voice Interface Implementation

**Audio Recording**
```javascript
// MediaRecorder setup for WebM audio
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus'
});

// Audio chunk collection
mediaRecorder.ondataavailable = (event) => {
  audioChunksRef.current.push(event.data);
};
```

**Audio Processing Pipeline**
```javascript
// 1. Convert audio to base64
const audioBase64 = await blobToBase64(audioBlob);

// 2. Send to transcription
const transcriptionResponse = await fetch('/api/chained-voice/transcribe', {
  method: 'POST',
  body: JSON.stringify({ audio: audioBase64, sessionId })
});

// 3. Process with LLM
const processResponse = await fetch('/api/chained-voice/process', {
  method: 'POST', 
  body: JSON.stringify({ text: userText, sessionId })
});

// 4. Convert response to speech
const synthesisResponse = await fetch('/api/chained-voice/synthesize', {
  method: 'POST',
  body: JSON.stringify({ text: responseText, sessionId })
});

// 5. Play audio response
await playAudio(synthesisData.audio);
```

#### 3. State Management

**Component State**
```javascript
const [isRecording, setIsRecording] = useState(false);
const [isProcessing, setIsProcessing] = useState(false);
const [currentStatus, setCurrentStatus] = useState('Ready to start conversation');
const [sessionId, setSessionId] = useState(null);
const [userInfo, setUserInfo] = useState({ name: null, email: null, collected: false });
const [conversationCount, setConversationCount] = useState(0);
```

**Media References**
```javascript
const mediaRecorderRef = useRef(null);
const audioChunksRef = useRef([]);
const streamRef = useRef(null);
```

#### 4. User Interface

**Button Layout**
- **Small Conversation Button**: Start/End conversation (20x20)
- **Large Push-to-Talk Button**: Main recording interface (32x32)
- **Status Indicator**: Shows current state
- **User Information Display**: Shows collected name/email
- **Conversation Counter**: Tracks interaction count

**Responsive Design**
- Gradient backgrounds with hover effects
- Loading animations during processing
- Status badges with real-time updates
- Mobile-friendly touch interface

### API Integration

#### Environment Configuration
```javascript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
```

#### Error Handling
```javascript
// Comprehensive error handling with user feedback
try {
  const response = await fetch(endpoint, options);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
} catch (error) {
  console.error('API Error:', error);
  updateStatus(`Error: ${error.message}`);
}
```

## Conversation Flow

### 1. Session Initialization
```
User clicks "Start Conversation"
→ Creates unique session ID
→ Plays greeting message
→ Activates push-to-talk interface
```

### 2. Information Collection
```
User provides name and email
→ STT transcribes input
→ LLM extracts structured data
→ Confirms information via TTS
→ Transitions to Q&A mode
```

### 3. Knowledge-Based Q&A
```
User asks question
→ STT transcribes question
→ RAG searches knowledge base
→ LLM generates contextual response
→ TTS converts to speech
→ Cycle continues
```

### 4. Conversation Ending
```
User indicates completion
→ Goodbye detection triggers
→ Thank you message with satisfaction check
→ Session cleanup
```

## Deployment Requirements

### Backend Dependencies
```json
{
  "express": "^4.18.2",
  "cors": "^2.8.5",
  "dotenv": "^16.3.1",
  "multer": "^1.4.5-lts.1",
  "form-data": "^4.0.0",
  "node-fetch": "^2.6.7",
  "@langchain/openai": "^0.0.14",
  "@langchain/mongodb": "^0.0.1",
  "mongodb": "^6.2.0",
  "zod": "^3.22.4"
}
```

### Frontend Dependencies
```json
{
  "next": "14.0.3",
  "react": "^18.2.0",
  "react-dom": "^18.2.0",
  "tailwindcss": "^3.3.6"
}
```

### System Requirements
- **Node.js**: 18.x or higher
- **MongoDB Atlas**: Vector search enabled
- **OpenAI API**: Access to Whisper, GPT-4, and TTS-1
- **Browser**: Modern browser with MediaRecorder support

## Configuration

### MongoDB Atlas Vector Search Index
```json
{
  "fields": [
    {
      "numDimensions": 1536,
      "path": "embedding",
      "similarity": "cosine",
      "type": "vector"
    }
  ]
}
```

### OpenAI Model Configuration
- **STT**: `whisper-1` (English language)
- **LLM**: `gpt-4` (with function calling)
- **TTS**: `tts-1` with `alloy` voice
- **Embeddings**: `text-embedding-3-small`

## Security Considerations

### API Security
- CORS configuration for specific origins
- Input validation and sanitization
- Rate limiting (recommended for production)
- Secure environment variable handling

### Data Privacy
- Session data stored temporarily in memory
- Automatic session cleanup (30 minutes)
- No persistent storage of conversation content
- GDPR-compliant data handling

## Performance Optimizations

### Backend
- In-memory session storage for fast access
- Connection pooling for MongoDB
- Async/await for non-blocking operations
- Chunked audio processing

### Frontend
- Lazy loading of components
- Efficient state management
- Audio streaming for responsive playback
- Optimized bundle size with Next.js

## Monitoring and Logging

### Server Logs
```javascript
console.log('🎙️ [STT] Transcribing audio for session:', sessionId);
console.log('🤖 [LLM] Processing text for session:', sessionId);
console.log('🔊 [TTS] Converting to speech for session:', sessionId);
console.log('🔍 [RAG] Searching for:', searchTerms);
```

### Error Tracking
- Comprehensive error logging
- Session state tracking
- API response monitoring
- Performance metrics

## Future Enhancements

### Technical Improvements
- WebSocket support for real-time communication
- Voice Activity Detection (VAD) integration
- Multi-language support
- Advanced analytics and reporting

### Business Features
- Appointment scheduling integration
- CRM system connectivity
- Advanced knowledge base management
- Custom voice training

## Troubleshooting

### Common Issues

1. **Audio Recording Fails**
   - Check browser permissions
   - Verify HTTPS in production
   - Test MediaRecorder compatibility

2. **API Connection Issues**
   - Verify CORS configuration
   - Check network connectivity
   - Validate environment variables

3. **RAG Search Not Working**
   - Confirm MongoDB Atlas connection
   - Verify vector index configuration
   - Check OpenAI API keys

4. **Poor Audio Quality**
   - Adjust MediaRecorder settings
   - Check audio codec support
   - Optimize TTS voice selection

### Debug Mode
Enable detailed logging by setting:
```env
NODE_ENV=development
DEBUG=true
```

## Contributing

### Development Setup
1. Clone repository
2. Install dependencies: `npm install`
3. Configure environment variables
4. Start development server: `npm run dev`
5. Test voice functionality

### Code Standards
- ESLint configuration for consistency
- Prettier for code formatting
- Comprehensive error handling
- Clear logging and documentation

---

**Contact**: For technical support or questions about this implementation, refer to the development team or create an issue in the project repository.
