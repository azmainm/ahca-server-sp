# Memory Optimization Guide

## Current Memory Usage Analysis

Your server is using 512MB+ per active call. This document explains why and how to reduce it.

## Memory Consumption Breakdown (Estimated)

| Component | Estimated Memory | Impact Level |
|-----------|-----------------|--------------|
| Audio Resampling (libsamplerate) | ~100-150MB | 🔴 HIGH |
| OpenAI Realtime API WebSocket | ~50-100MB | 🟡 MEDIUM |
| Audio Buffers (in/out) | ~50-100MB | 🟡 MEDIUM |
| Service Instances | ~50-100MB | 🟡 MEDIUM |
| MongoDB/Vector Store | ~50-100MB | 🟡 MEDIUM |
| Base Node.js Process | ~50MB | 🟢 LOW |
| **Total** | **~350-600MB** | |

## Optimization Strategies

### 1. Use Lower-Quality Audio Resampling (Quick Win)

**Current**: `SRC_SINC_BEST_QUALITY` - Highest quality, most memory
**Recommended**: `SRC_SINC_MEDIUM_QUALITY` - Good balance

```javascript
// In TwilioBridgeService.js, line 148
src = await create(1, inputRate, outputRate, {
  converterType: ConverterType.SRC_SINC_MEDIUM_QUALITY  // Changed from BEST
});
```

**Expected Savings**: ~50-100MB per call
**Trade-off**: Slightly lower audio quality (barely noticeable for voice)

### 2. Limit Audio Buffer Size

Add a maximum buffer size to prevent unbounded growth:

```javascript
// In TwilioBridgeService.js, in the audio handling
const MAX_OUTPUT_BUFFER_SIZE = 100; // Max 100 chunks = ~2 seconds of audio

if (entry.outputBuffer.length < MAX_OUTPUT_BUFFER_SIZE) {
  entry.outputBuffer.push(out);
} else {
  console.warn('⚠️ Output buffer full, dropping oldest chunk');
  entry.outputBuffer.shift(); // Remove oldest
  entry.outputBuffer.push(out);
}
```

**Expected Savings**: Prevents buffer from growing indefinitely during long responses
**Trade-off**: None (buffers shouldn't grow this large anyway)

### 3. Lazy-Load Services (Moderate Win)

Instead of instantiating all services at startup, create them only when needed:

```javascript
// Create a service registry pattern
class ServiceRegistry {
  constructor() {
    this._services = new Map();
  }
  
  get(serviceName, businessId = null) {
    const key = businessId ? `${serviceName}-${businessId}` : serviceName;
    
    if (!this._services.has(key)) {
      // Create service only when first requested
      this._services.set(key, this.createService(serviceName, businessId));
    }
    
    return this._services.get(key);
  }
  
  createService(serviceName, businessId) {
    switch(serviceName) {
      case 'embedding':
        return new EmbeddingService(businessId);
      case 'rag':
        return new SherpaPromptRAG();
      // ... other services
    }
  }
}
```

**Expected Savings**: ~50-100MB at startup, services only loaded when used
**Trade-off**: First call may be slightly slower

### 4. Connection Pooling & Cleanup

Ensure MongoDB connections are properly pooled and closed:

```javascript
// In EmbeddingService.js
async cleanup() {
  if (this.client) {
    await this.client.close();
    this.client = null;
    this.db = null;
  }
}

// Call this when sessions end
```

### 5. Memory Profiling

Add memory monitoring to identify leaks:

```javascript
// In server.js, add periodic memory logging
setInterval(() => {
  const used = process.memoryUsage();
  console.log('📊 Memory Usage:', {
    rss: `${Math.round(used.rss / 1024 / 1024)}MB`,
    heapTotal: `${Math.round(used.heapTotal / 1024 / 1024)}MB`,
    heapUsed: `${Math.round(used.heapUsed / 1024 / 1024)}MB`,
    external: `${Math.round(used.external / 1024 / 1024)}MB`,
    activeCalls: bridge?.callSidToSession?.size || 0
  });
}, 30000); // Every 30 seconds
```

### 6. Increase Render Instance Size (If Needed)

If optimizations don't help enough, consider upgrading your Render plan:

- **Free/Starter (512MB)**: May struggle with multiple concurrent calls
- **Standard (1GB)**: Better for 2-3 concurrent calls
- **Pro (2GB+)**: Recommended for production with multiple concurrent calls

## Expected Results After Optimization

| Scenario | Before | After Optimization | Savings |
|----------|--------|-------------------|---------|
| Single call | 512MB | 300-350MB | ~150-200MB |
| Multiple calls (3x) | >1.5GB | 800MB-1GB | ~500MB |
| Idle server | 200-300MB | 100-150MB | ~100-150MB |

## Is 512MB Normal?

**For your use case, it's on the higher side but not abnormal** because:

✅ **Expected memory usage**:
- Real-time audio processing (resampling at 24kHz)
- Dual WebSocket connections (Twilio + OpenAI)
- AI services and vector stores
- Audio buffering for smooth playback

❌ **Not normal if**:
- Memory doesn't decrease after call ends (memory leak)
- Memory keeps growing during a single call
- Server crashes with OOM errors

## Quick Wins (Implement First)

1. ✅ **Change resampling quality** → Save 50-100MB (5 min effort)
2. ✅ **Add buffer size limits** → Prevent unbounded growth (10 min effort)
3. ✅ **Add memory monitoring** → Identify leaks (5 min effort)

## Long-term Improvements

4. 🔄 **Lazy-load services** → Save 50-100MB at startup (2 hour effort)
5. 🔄 **Connection pooling** → Better resource management (1 hour effort)
6. 🔄 **Consider upgrading Render plan** → More headroom for concurrent calls

## Monitoring

After implementing changes, monitor:
- Memory usage per call (should be 300-400MB max)
- Memory after call ends (should return to baseline)
- Concurrent call handling (how many before OOM)
- Call quality (ensure audio quality is still acceptable)

## Next Steps

1. Implement quick wins first (resampling quality + buffer limits)
2. Add memory monitoring
3. Test with real calls
4. Measure improvements
5. Decide if instance upgrade is needed

