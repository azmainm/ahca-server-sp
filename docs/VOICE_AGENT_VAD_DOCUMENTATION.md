# Voice Agent with VAD Documentation

## Overview

The Voice Agent with Voice Activity Detection (VAD) is an AI-powered conversational system that enables natural voice interactions for fencing company customer service. It uses OpenAI's Realtime API for automatic speech detection, transcription, and response generation.

## Architecture

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client App    │    │   Server API    │    │  OpenAI APIs    │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ Realtime    │ │◄──►│ │ Realtime    │ │◄──►│ │ Realtime    │ │
│ │ VAD Client  │ │    │ │ VAD Service │ │    │ │ API (VAD)   │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ Audio       │ │    │ │ Conversation│ │◄──►│ │ GPT-5-nano  │ │
│ │ Recording   │ │    │ │ Flow Handler│ │    │ │ (Responses) │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │ Audio       │ │    │ │ User Info   │ │    │ │ TTS API     │ │
│ │ Playback    │ │    │ │ Collector   │ │    │ │ (Speech)    │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Data Flow

1. **Audio Capture**: Client captures microphone audio using MediaRecorder API
2. **VAD Processing**: Audio chunks sent to OpenAI Realtime API for voice activity detection
3. **Speech Detection**: Server VAD automatically detects speech start/stop
4. **Transcription**: OpenAI Whisper transcribes speech to text
5. **Processing**: GPT-5-nano processes user input and extracts information
6. **Response Generation**: AI generates appropriate response
7. **Text-to-Speech**: OpenAI TTS converts response to audio
8. **Audio Playback**: Client plays response audio

## Key Features

### 🎤 Automatic Voice Activity Detection
- **Server VAD**: Uses OpenAI's silence-based VAD for automatic audio chunking
- **No Push-to-Talk**: Hands-free operation with natural conversation flow
- **Configurable Thresholds**: 2.5-second silence detection for natural pauses
- **Real-time Processing**: Continuous audio streaming and processing

### 🧠 Intelligent Conversation Flow
- **User Information Collection**: Automatically extracts name and email
- **Appointment Scheduling**: Integrates with Microsoft Calendar for booking
- **Context Awareness**: Maintains conversation state across interactions
- **Intent Classification**: Understands user requests and routes appropriately

### 🔄 Seamless Integration
- **Existing STT-TTS Pipeline**: Maintains compatibility with current system
- **WebSocket Communication**: Real-time bidirectional communication
- **Audio Format Conversion**: WebM to PCM16 conversion for OpenAI compatibility
- **Error Handling**: Graceful fallbacks and retry mechanisms

## Technical Implementation

### Client-Side Components

#### RealtimeVADVoiceAgent.jsx
Main React component handling the voice interaction interface.

**Key Functions:**
- `startConversation()`: Initializes VAD session and audio recording
- `startRealtimeVAD()`: Establishes WebSocket connection to OpenAI Realtime API
- `startAudioStreaming()`: Begins continuous audio capture and streaming
- `sendAudioChunkToServer()`: Sends audio data to server for processing
- `startResponseMonitoring()`: Polls for AI responses and plays audio

**Configuration:**
```javascript
const VAD_CONFIG = {
  apiUrl: 'http://localhost:3001',
  chunkIntervalMs: 1000,        // Send audio every 1 second
  statusPollMs: 500,            // Check status every 500ms
  responsePollMs: 1000          // Check for responses every 1 second
};
```

### Server-Side Components

#### RealtimeVADService.js
Manages WebSocket connections to OpenAI Realtime API for VAD processing.

**Key Methods:**
- `startVADSession(sessionId)`: Creates new VAD session
- `sendAudioChunk(sessionId, audioBuffer)`: Processes audio through VAD
- `getVADSessionStatus(sessionId)`: Returns current session status
- `stopVADSession(sessionId)`: Cleans up VAD session

**VAD Configuration:**
```javascript
server_vad: {
  threshold: 0.5,                    // Voice activation threshold (0-1)
  prefix_padding_ms: 300,            // Audio before speech detection
  silence_duration_ms: 2500,         // Silence duration to end turn (2.5s)
  create_response: false,            // Don't auto-create responses
  interrupt_response: true           // Allow interruptions
}
```

#### ConversationFlowHandler.js
Orchestrates the conversation logic and user information processing.

**Responsibilities:**
- User information extraction and validation
- Appointment scheduling workflow
- Response generation coordination
- Session state management

#### OpenAIService.js
Simplified service for GPT-5-nano API interactions.

**Features:**
- Uses OpenAI Responses API (`/v1/responses`) for GPT-5 models
- Optimized token limits and reasoning parameters
- Automatic response parsing and error handling

## API Endpoints

### Realtime VAD Endpoints

#### POST `/api/chained-voice/realtime-vad/start`
Starts a new Realtime VAD session.

**Request:**
```json
{
  "sessionId": "realtime-vad-session-1234567890-abcdef"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "realtime-vad-session-1234567890-abcdef",
  "vadMode": "server_vad",
  "status": "connected",
  "config": {
    "threshold": 0.5,
    "silence_duration_ms": 2500
  }
}
```

#### POST `/api/chained-voice/realtime-vad/audio`
Sends audio chunk for VAD processing.

**Request:**
```json
{
  "sessionId": "realtime-vad-session-1234567890-abcdef",
  "audio": "base64-encoded-webm-audio",
  "commit": false
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "realtime-vad-session-1234567890-abcdef",
  "audioSize": 15752,
  "committed": false
}
```

#### GET `/api/chained-voice/realtime-vad/response/:sessionId`
Retrieves AI response and conversation data.

**Response:**
```json
{
  "success": true,
  "sessionId": "realtime-vad-session-1234567890-abcdef",
  "hasResponse": true,
  "responseAudio": "base64-encoded-mp3-audio",
  "userInfo": {
    "name": "John Doe",
    "email": "john@example.com",
    "collected": true
  },
  "calendarLink": "https://calendar.example.com/book/123",
  "conversationCount": 3
}
```

#### POST `/api/chained-voice/realtime-vad/stop`
Stops a Realtime VAD session.

**Request:**
```json
{
  "sessionId": "realtime-vad-session-1234567890-abcdef"
}
```

## Configuration

### Environment Variables

**Server (.env):**
```bash
OPENAI_API_KEY=sk-proj-...
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_TENANT_ID=your-tenant-id
```

**Client:**
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### VAD Parameters

#### Server VAD Settings
- **Threshold**: `0.5` - Voice activation sensitivity (0-1)
- **Silence Duration**: `2500ms` - Time to wait before ending speech detection
- **Prefix Padding**: `300ms` - Audio captured before speech starts
- **Audio Format**: PCM16 at 24kHz sample rate

#### Client Audio Settings
- **Input Format**: WebM with Opus codec
- **Chunk Interval**: 1000ms for continuous streaming
- **Sample Rate**: Browser default (typically 48kHz)
- **Channels**: Mono (1 channel)

## Usage Examples

### Basic Voice Interaction
```javascript
// Start conversation
const session = await startConversation();

// User speaks: "Hi, my name is John and my email is john@example.com"
// System automatically:
// 1. Detects speech start/stop
// 2. Transcribes audio
// 3. Extracts user info
// 4. Generates response
// 5. Plays audio response

// User speaks: "I need an appointment for next Monday"
// System automatically:
// 1. Processes appointment request
// 2. Checks calendar availability
// 3. Suggests available times
// 4. Responds with options
```

### Conversation Flow States

1. **Initial Greeting**: System introduces itself and asks for user info
2. **Information Collection**: Collects name and email with validation
3. **Service Discussion**: Understands user needs (consultation, repair, etc.)
4. **Appointment Scheduling**: Finds available times and books appointment
5. **Confirmation**: Provides booking confirmation and next steps

## Troubleshooting

### Common Issues

#### Audio Not Being Detected
- **Check microphone permissions**: Ensure browser has microphone access
- **Verify audio format**: Confirm WebM with Opus codec is supported
- **Check VAD thresholds**: Adjust sensitivity if needed

#### Transcription Errors
- **Audio quality**: Ensure clear audio input without background noise
- **Speaking pace**: Speak clearly at moderate pace
- **Language settings**: Verify language is set to English

#### Response Generation Issues
- **API key**: Verify OpenAI API key is valid and has sufficient credits
- **Model availability**: Ensure GPT-5-nano is accessible
- **Token limits**: Check if responses are being truncated

#### Calendar Integration Problems
- **Microsoft credentials**: Verify client ID, secret, and tenant ID
- **Permissions**: Ensure calendar read/write permissions are granted
- **Time zones**: Check time zone handling for appointments

### Debug Logging

Enable detailed logging by checking server console output:

```bash
# Server logs show detailed VAD processing
📊 [RealtimeVAD] Sending audio chunk: 14786 bytes
✅ [AudioConverter] Converted WebM to PCM16: 14786 → 43200 bytes
📨 [RealtimeVAD] Received event: input_audio_buffer.speech_started
📝 [RealtimeVAD] Transcription completed: "Hello, my name is John"
🤖 [OpenAI] Calling gpt-5-nano (attempt 1/3)
✅ [OpenAI] Success
```

### Performance Optimization

#### Client-Side
- **Audio chunk size**: Balance between latency and processing efficiency
- **Polling intervals**: Adjust based on responsiveness requirements
- **Memory management**: Clean up audio buffers and WebSocket connections

#### Server-Side
- **Session cleanup**: Automatic cleanup of old VAD sessions (30 minutes)
- **Audio conversion**: Efficient WebM to PCM16 conversion with temp file cleanup
- **Connection pooling**: Reuse WebSocket connections where possible

## Security Considerations

### Data Privacy
- **Audio data**: Processed in real-time, not permanently stored
- **User information**: Encrypted in transit and at rest
- **Session isolation**: Each conversation session is isolated

### API Security
- **Authentication**: OpenAI API key securely stored in environment variables
- **Rate limiting**: Built-in retry mechanisms with exponential backoff
- **Input validation**: All user inputs validated before processing

## Future Enhancements

### Planned Features
- **Multi-language support**: Support for Spanish and other languages
- **Voice biometrics**: Speaker identification for returning customers
- **Sentiment analysis**: Detect customer satisfaction and adjust responses
- **Advanced scheduling**: Integration with multiple calendar systems

### Performance Improvements
- **Edge deployment**: Deploy VAD processing closer to users
- **Caching**: Cache common responses and user information
- **Load balancing**: Distribute VAD sessions across multiple servers

## Support and Maintenance

### Monitoring
- **Session metrics**: Track VAD session success rates and duration
- **API usage**: Monitor OpenAI API usage and costs
- **Error rates**: Track and alert on transcription and response errors

### Updates
- **OpenAI API**: Stay updated with latest Realtime API features
- **Browser compatibility**: Test with new browser versions
- **Security patches**: Regular updates for dependencies

---

## Quick Start Guide

1. **Install dependencies**:
   ```bash
   cd ahca-server && npm install
   cd ../ahca-client && npm install
   ```

2. **Configure environment**:
   ```bash
   # Copy and edit .env files
   cp .env.example .env
   ```

3. **Start services**:
   ```bash
   # Terminal 1: Start server
   cd ahca-server && npm run dev
   
   # Terminal 2: Start client
   cd ahca-client && npm run dev
   ```

4. **Test voice agent**:
   - Open http://localhost:3000
   - Click the purple "Start Conversation" button
   - Allow microphone access
   - Speak: "Hi, my name is [Your Name] and my email is [your-email]"
   - Continue conversation naturally

The Voice Agent with VAD is now ready for production use! 🚀
