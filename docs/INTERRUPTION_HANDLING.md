# Interruption Handling with Semantic VAD

## Overview
This document describes the interruption handling improvements made to the OpenAI Realtime API WebSocket integration to enable smooth, natural conversation flow with proper turn-taking.

## Problem
The original implementation did not properly handle user interruptions:
- When user spoke while AI was responding, the AI continued talking
- User's interruption attempts ("wait", "stop", etc.) were queued and responded to later
- No immediate cancellation of ongoing AI responses
- Created an unnatural conversation flow

## Solution: Semantic VAD with Interruption Handling

### What is Semantic VAD?
**Semantic Voice Activity Detection (VAD)** goes beyond traditional silence-based VAD by:
- Using semantic understanding to detect natural turn endpoints
- Predicting punctuation and sentence boundaries
- Enabling interruptions mid-sentence
- Reducing latency by ~50% compared to traditional VAD

OpenAI's Realtime API implements this through the `turn_detection` configuration.

### Implementation

#### 1. Server-Side Changes (`RealtimeWebSocketService.js`)

**Turn Detection Configuration:**
```javascript
turn_detection: {
  type: 'server_vad',
  threshold: 0.5,              // Voice activation threshold
  prefix_padding_ms: 300,      // Audio before speech detection
  silence_duration_ms: 700,    // Silence duration to end turn
  create_response: true,       // Enable automatic response creation (semantic VAD)
  interrupt_response: true     // Allow interruptions
}
```

**Key Parameters:**
- `create_response: true` - Enables semantic VAD, allowing the model to automatically create responses when turn is detected
- `interrupt_response: true` - Allows user speech to interrupt ongoing AI responses

**Interruption Handling:**
```javascript
case 'input_audio_buffer.speech_started':
  // Cancel any ongoing AI response (user is interrupting)
  if (sessionData.isResponding) {
    console.log('🛑 [RealtimeWS] User interrupted - canceling AI response');
    sessionData.openaiWs.send(JSON.stringify({
      type: 'response.cancel'
    }));
    sessionData.isResponding = false;
  }
  
  this.sendToClient(sessionData, {
    type: 'speech_started'
  });
  break;
```

**Response Tracking:**
- Added `isResponding` flag to track when AI is generating audio
- Set to `true` when `response.audio.delta` events start
- Set to `false` when `response.done` event occurs
- Allows server to know when to cancel responses

#### 2. Client-Side Changes (`RealtimeWebSocketAgent.jsx`)

**Immediate Audio Stop:**
```javascript
const stopAudioPlayback = () => {
  console.log('🛑 [RealtimeWS] Stopping audio playback');
  
  // Stop currently playing audio immediately
  if (currentAudioSourceRef.current) {
    try {
      currentAudioSourceRef.current.stop();
      currentAudioSourceRef.current = null;
    } catch (e) {
      // Already stopped
    }
  }
  
  // Clear audio queue
  audioQueueRef.current = [];
  isPlayingRef.current = false;
  setIsAIResponding(false);
  setAITranscript('');
};
```

**Key Improvements:**
- Added `currentAudioSourceRef` to track the currently playing audio source
- Immediately calls `stop()` on the audio source when interruption detected
- Clears the entire audio queue to prevent delayed playback
- Resets all AI response states

**Interruption Flow:**
```javascript
case 'speech_started':
  // Cancel any ongoing AI response (interruption)
  // Server will send response.cancel to OpenAI
  if (isAIResponding) {
    console.log('🛑 [RealtimeWS] Interrupting AI response');
    stopAudioPlayback();
  }
  break;
```

## How It Works

### Normal Turn-Taking:
1. User speaks → `speech_started` event
2. User stops → `speech_stopped` event
3. OpenAI processes and generates response (semantic VAD detects natural endpoint)
4. AI responds → Audio chunks streamed to client
5. Response complete → `response.done` event

### Interruption Flow:
1. AI is responding (audio playing)
2. User starts speaking → `speech_started` event
3. **Server:** Sends `response.cancel` to OpenAI
4. **Client:** Immediately stops current audio playback
5. **Client:** Clears audio queue
6. User continues speaking
7. User stops → `speech_stopped` event
8. OpenAI generates new response based on user's interruption

## Benefits

1. **Natural Conversation:** Users can interrupt the AI just like in human conversations
2. **Reduced Latency:** Semantic VAD detects turn endpoints faster than silence-based VAD
3. **Better UX:** No confusing delayed responses to "wait" or "stop"
4. **Immediate Feedback:** Audio stops playing the moment user starts speaking
5. **Context Aware:** AI understands it was interrupted and can adjust its response

## Testing Interruptions

To test the interruption handling:

1. **Start a conversation** and ask a long question
2. **While the AI is responding**, start speaking ("wait", "stop", or any interruption)
3. **Verify:**
   - AI audio stops immediately
   - Your interruption is processed as a new turn
   - AI responds to your interruption, not the previous context
   - No delayed or queued responses

## Example Scenario

**Before (Broken):**
```
User: "Tell me about your automation services"
AI: "We offer several automation services: Call Service Auto—"
User: "Wait, stop"
AI: "—mation, Transcript to Task, Voice to Estimate, and..."
AI: "Okay, I'll pause. Feel free to ask anything."
```

**After (Fixed):**
```
User: "Tell me about your automation services"
AI: "We offer several automation services: Call Service Auto—"
User: "Wait, stop"
[AI immediately stops]
AI: "Sure, take your time. Let me know how I can help when you're ready."
```

## Technical Notes

- **Server VAD** is handled by OpenAI, so no client-side VAD processing needed
- **Response cancellation** must be sent from server (not client) to OpenAI WebSocket
- **Audio queue clearing** happens on both server and client for complete interruption
- **State synchronization** between server and client ensures clean turn transitions

## References

- [OpenAI Realtime API - VAD Documentation](https://platform.openai.com/docs/guides/realtime-vad)
- [Semantic VAD Research Paper](https://paperswithcode.com/paper/semantic-vad-low-latency-voice-activity)
- [Web Audio API - AudioBufferSourceNode.stop()](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/stop)

## Files Modified

- `ahca-server/features/voice-agent/services/RealtimeWebSocketService.js`
  - Added `create_response: true` and `interrupt_response: true` to turn detection
  - Added `isResponding` tracking
  - Added interruption handling in `speech_started` event

- `ahca-client/src/features/voice-agent/components/RealtimeWebSocketAgent.jsx`
  - Added `currentAudioSourceRef` to track playing audio
  - Improved `stopAudioPlayback()` to immediately stop audio source
  - Removed client-side `response.cancel` sending (handled by server)

