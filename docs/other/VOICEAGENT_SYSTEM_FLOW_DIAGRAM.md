# Complete System Flow Diagram - AHCA Voice Agent

## System Architecture Overview

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│                     │    │                     │    │                     │
│    Client App       │    │    Server API       │    │    OpenAI APIs      │
│                     │    │                     │    │                     │
├─────────────────────┤    ├─────────────────────┤    ├─────────────────────┤
│                     │    │                     │    │                     │
│  Realtime           │◄──►│  Realtime           │◄──►│  Realtime           │
│  VAD Client         │    │  VAD Service        │    │  API (VAD)          │
│                     │    │                     │    │                     │
├─────────────────────┤    ├─────────────────────┤    ├─────────────────────┤
│                     │    │                     │    │                     │
│  Audio              │    │  Conversation       │◄──►│  GPT-5-nano         │
│  Recording          │    │  Flow Handler       │    │  (Responses)        │
│                     │    │                     │    │                     │
├─────────────────────┤    ├─────────────────────┤    ├─────────────────────┤
│                     │    │                     │    │                     │
│  Audio              │    │  User Info          │◄──►│  TTS API            │
│  Playback           │    │  Collector          │    │  (Speech)           │
│                     │    │                     │    │                     │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

## Detailed Conversation Flow

### 1. Initial Connection & Setup

```
Client                          Server                          OpenAI
  │                               │                               │
  │ 1. Start Conversation         │                               │
  ├──────────────────────────────►│                               │
  │                               │ 2. Create VAD Session         │
  │                               ├──────────────────────────────►│
  │                               │                               │ 3. WebSocket Connection
  │                               │◄──────────────────────────────┤    Established
  │                               │                               │
  │ 4. Session Ready              │                               │
  │◄──────────────────────────────┤                               │
  │                               │                               │
  │ 5. Start Audio Recording      │                               │
  │ (MediaRecorder → WebM)        │                               │
```

### 2. Audio Processing & VAD Detection

```
Client                          Server                          OpenAI
  │                               │                               │
  │ 6. Stream Audio Chunks        │                               │
  ├──────────────────────────────►│ 7. Convert WebM → PCM16      │
  │    (WebM Base64)              ├──────────────────────────────►│ 8. VAD Processing
  │                               │    (PCM16 Base64)             │    (Server-side)
  │                               │                               │
  │                               │                               │ 9. Speech Started Event
  │                               │◄──────────────────────────────┤
  │                               │                               │
  │ Continues streaming...        │ Continues forwarding...       │ Continues processing...
  │                               │                               │
  │                               │                               │ 10. Speech Stopped Event
  │                               │◄──────────────────────────────┤     (2.5s silence)
  │                               │                               │
  │                               │ 11. Mark for Filler Phrase    │
  │                               │     (pendingFillers.set)      │
```

### 3. Filler Phrase System

```
Client                          Server                          OpenAI
  │                               │                               │
  │                               │                               │ 12. Transcription Complete
  │                               │◄──────────────────────────────┤     Event + Text
  │                               │                               │
  │                               │ 13. Analyze Transcript        │
  │                               │     for Filler Type:          │
  │                               │     • "appointment" → appointment_processing
  │                               │     • "available" → calendar_check
  │                               │     • default → rag_search    │
  │                               │                               │
  │                               │ 14. Get Contextual Filler     │
  │                               │     • "Please wait while I    │
  │                               │       process that for you"   │
  │                               │     • "Checking availability" │
  │                               │     • "Looking that up"       │
  │                               │                               │
  │                               │ 15. Synthesize Filler Phrase  │
  │                               ├──────────────────────────────►│ 16. TTS Processing
  │                               │                               │     (Immediate)
  │                               │ 17. Filler Audio Response     │
  │                               │◄──────────────────────────────┤
  │                               │                               │
  │ 18. Play Filler Phrase        │ 19. Queue Filler Audio        │
  │◄──────────────────────────────┤     (Immediate playback)      │
  │     (Immediate feedback)      │                               │
```

### 4. Main Processing & Response Generation

```
Client                          Server                          OpenAI
  │                               │                               │
  │ (Filler playing...)           │ 20. Process Conversation      │
  │                               │     • Intent Classification   │
  │                               │     • RAG Search (if needed)  │
  │                               │     • Appointment Flow        │
  │                               │                               │
  │                               │ 21. Generate AI Response      │
  │                               ├──────────────────────────────►│ 22. GPT-5-nano
  │                               │     (Conversation context)    │     Processing
  │                               │                               │
  │                               │ 23. AI Response Text          │
  │                               │◄──────────────────────────────┤
  │                               │                               │
  │                               │ 24. Synthesize Main Response  │
  │                               ├──────────────────────────────►│ 25. TTS Processing
  │                               │                               │     (Main response)
  │                               │ 26. Main Audio Response       │
  │                               │◄──────────────────────────────┤
  │                               │                               │
  │ 27. Play Main Response        │ 28. Queue Main Audio          │
  │◄──────────────────────────────┤                               │
  │     (After filler completes)  │                               │
```

### 5. Conversation State Management

```
Client                          Server                          
  │                               │                               
  │                               │ 29. Update Session State:     
  │                               │     • User Info (name/email) 
  │                               │     • Conversation Count      
  │                               │     • Appointment Details     
  │                               │     • Calendar Links          
  │                               │                               
  │ 30. Update UI State           │ 31. Store Session Data        
  │◄──────────────────────────────┤                               
  │     • User info display       │                               
  │     • Conversation counter    │                               
  │     • Appointment status      │                               
  │     • Calendar integration    │                               
```

## Intent Classification Flow

```
User Input → Intent Classifier → Processing Path
     │              │                    │
     │              ├─ goodbye          → End conversation
     │              ├─ appointment      → Appointment flow
     │              ├─ nameChange       → Update name
     │              ├─ emailChange      → Update email  
     │              ├─ moreQuestions    → Continue conversation
     │              └─ unknown          → RAG search
```

## Appointment Flow State Machine

```
Initial → Calendar Selection → Service Selection → Date Selection → Time Selection → Review → Confirmation
   │            │                   │                │               │            │         │
   │            ├─ Google           │                │               │            │         │
   │            ├─ Outlook          │                │               │            │         │
   │                                │                │               │            │         │
   │                                │                │               │            │         │
   │                                ├─ Installation  │               │            │         │
   │                                ├─ Repair        │               │            │         │
   │                                └─ Consultation  │               │            │         │
   │                                                 │               │            │         │
   │                                                 ├─ Valid Date   │            │         │
   │                                                 └─ Weekend      │            │         │
   │                                                     (Suggest    │            │         │
   │                                                      weekday)   │            │         │
   │                                                                 │            │         │
   │                                                                 ├─ Available │         │
   │                                                                 └─ Conflict  │         │
   │                                                                     (Suggest │         │
   │                                                                      alt)    │         │
   │                                                                              │         │
   │                                                                              ├─ Confirm │
   │                                                                              ├─ Change  │
   │                                                                              └─ Cancel  │
   │                                                                                        │
   │                                                                                        ├─ Success
   │                                                                                        └─ Error
```

## RAG (Retrieval-Augmented Generation) Flow

```
User Question → Knowledge Base Search → Context Retrieval → AI Response Generation
      │                    │                    │                    │
      │                    │                    │                    │
      ├─ Extract keywords  │                    │                    │
      ├─ Generate query    │                    │                    │
      └─ Search embeddings ├─ Vector search     │                    │
                           ├─ Similarity match  │                    │
                           └─ Retrieve chunks   ├─ Format context    │
                                               ├─ Add instructions   │
                                               └─ Send to GPT       ├─ Generate response
                                                                   ├─ Include sources
                                                                   └─ Format answer
```

## Error Handling & Fallbacks

```
Error Type                    Fallback Action                    Recovery Method
    │                             │                                 │
    ├─ WebSocket Disconnect      ├─ Attempt reconnection          ├─ Exponential backoff
    ├─ Audio Processing Error    ├─ Switch to manual mode         ├─ User notification
    ├─ VAD Service Failure       ├─ Fallback to STT endpoint      ├─ Graceful degradation
    ├─ OpenAI API Error          ├─ Retry with backoff            ├─ Error message to user
    ├─ TTS Synthesis Error       ├─ Text-only response            ├─ Continue conversation
    └─ Calendar API Error        └─ Manual scheduling message     └─ Provide alternatives
```

## Performance Optimizations

### Audio Processing
- **Chunked Streaming**: 100ms audio chunks for real-time processing
- **Format Conversion**: WebM → PCM16 conversion on server
- **Buffer Management**: Circular buffers for continuous audio

### Response Times
- **Filler Phrases**: Immediate feedback (< 500ms after silence)
- **VAD Detection**: Real-time speech start/stop detection
- **Parallel Processing**: TTS synthesis while AI generates response

### Memory Management
- **Session Cleanup**: Automatic cleanup after conversation end
- **Audio Buffer Limits**: Prevent memory leaks with buffer size limits
- **Connection Pooling**: Reuse WebSocket connections when possible

## Security Considerations

### Audio Data
- **No Persistent Storage**: Audio data not stored on server
- **Encrypted Transmission**: HTTPS/WSS for all audio streaming
- **Session Isolation**: Each conversation in isolated session

### API Keys
- **Environment Variables**: Separate keys for different services
- **Key Rotation**: Support for API key updates without downtime
- **Rate Limiting**: Prevent API abuse and cost overruns

## Monitoring & Logging

### Real-Time Metrics
- **VAD Events**: Speech start/stop detection accuracy
- **Response Times**: End-to-end conversation latency
- **Error Rates**: Failed requests and recovery success

### Conversation Analytics
- **Intent Classification**: Accuracy of user intent detection
- **Appointment Success**: Booking completion rates
- **User Satisfaction**: Conversation flow quality metrics
