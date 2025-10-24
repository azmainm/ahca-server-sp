# Business Identification and Switching Guide

## Overview (In Layman Terms)

The AHCA system now supports **client-side business selection** in addition to the existing **phone-based routing**. Think of it like having a **universal remote control** that can switch between different TV channels - except here, you're switching between different AI assistants (Scout for SherpaPrompt and Mason for Superior Fencing).

## How It Works: Step-by-Step

### 1. **Client-Side Business Selection**

When you open the web interface at `http://localhost:3000`, you'll see:

```
┌─────────────────────────────────────┐
│  [SherpaPrompt] [Superior Fencing]  │  ← Toggle Buttons
│                                     │
│        SherpaPrompt                 │  ← Current Business Name
│    Conversations into Outcomes      │  ← Business Tagline
│         AI Agent: Scout             │  ← Agent Name
│                                     │
│      [🎤 Start Conversation]        │  ← Main Button
└─────────────────────────────────────┘
```

**What happens when you click a toggle:**
- The interface immediately updates to show the selected business information
- The agent name changes (Scout ↔ Mason)
- The services list updates to show business-specific offerings
- The color scheme changes (Purple for SherpaPrompt, Green for Superior Fencing)

### 2. **WebSocket Connection with Business Context**

When you click "Start Conversation":

```
Client Side:                    Server Side:
┌─────────────────┐            ┌──────────────────────┐
│ User clicks     │            │                      │
│ "Start"         │   ────────▶│ 1. Extract businessId│
│                 │            │    from URL params   │
│ selectedBusiness│            │                      │
│ = "sherpaprompt"│            │ 2. Load business     │
│                 │            │    configuration     │
└─────────────────┘            │                      │
                               │ 3. Store session     │
                               │    context           │
                               │                      │
                               │ 4. Load business-    │
                               │    specific prompts  │
                               └──────────────────────┘
```

**Technical Details:**
- Client sends: `ws://localhost:3001/realtime-ws?businessId=sherpaprompt`
- Server extracts `businessId` from URL parameters
- Server looks up business configuration from `configs/businesses/{businessId}/`

### 3. **Business Configuration Loading**

The server follows this identification process:

```
1. WebSocket URL: ws://localhost:3001/realtime-ws?businessId=superior-fencing
                                                    ↓
2. Extract businessId: "superior-fencing"
                                                    ↓
3. Load config from: configs/businesses/superior-fencing/config.json
                                                    ↓
4. Load prompts from: configs/businesses/superior-fencing/prompt_rules.json
                                                    ↓
5. Create session with business-specific AI agent (Mason)
```

### 4. **Agent Activation and Flow Selection**

Once the business is identified, the system activates the appropriate agent:

#### **For SherpaPrompt (Scout):**
```
Agent: Scout
Capabilities:
├── ✅ Knowledge Base Search (RAG)
├── ✅ Appointment Booking
├── ✅ Product Demos
├── ✅ Calendar Integration
└── ✅ Complex Conversations

Greeting: "Hi there, I'm Scout, SherpaPrompt's virtual assistant..."
```

#### **For Superior Fencing (Mason):**
```
Agent: Mason
Capabilities:
├── ❌ Knowledge Base Search (Disabled)
├── ❌ Appointment Booking (Disabled)
├── ✅ Information Collection
├── ✅ Emergency Routing
└── ✅ Basic Lead Capture

Greeting: "Hi there, I'm Mason, Superior Fence & Construction's virtual assistant..."
```

## Technical Implementation Details

### **Client-Side (ahca-client)**

1. **Business Toggle Component:**
   ```jsx
   const [selectedBusiness, setSelectedBusiness] = useState('sherpaprompt');
   
   // Toggle buttons update the selected business
   <button onClick={() => handleBusinessToggle('superior-fencing')}>
     Superior Fencing
   </button>
   ```

2. **WebSocket Connection:**
   ```javascript
   const wsUrlWithBusiness = `${WS_URL}?businessId=${selectedBusiness}`;
   const ws = new WebSocket(wsUrlWithBusiness);
   ```

3. **Dynamic UI Updates:**
   - Business name, tagline, and agent name change instantly
   - Service list updates to show business-specific offerings
   - Color scheme adapts to business branding

### **Server-Side (ahca-server)**

1. **Business ID Extraction:**
   ```javascript
   const url = new URL(req.url, `http://${req.headers.host}`);
   const businessId = url.searchParams.get('businessId') || 'sherpaprompt';
   ```

2. **Configuration Loading:**
   ```javascript
   const businessConfig = businessConfigService.getBusinessConfig(businessId);
   const promptPath = `configs/businesses/${businessId}/prompt_rules.json`;
   ```

3. **Session Context Storage:**
   ```javascript
   tenantContextManager.setTenantContext(sessionId, businessId);
   ```

4. **Business-Specific Prompt Loading:**
   ```javascript
   getSystemPrompt(sessionId) {
     const businessId = this.tenantContextManager.getBusinessId(sessionId);
     // Load business-specific prompt_rules.json
     return businessPrompts.realtimeSystem.full;
   }
   ```

## What Happens During a Conversation

### **SherpaPrompt Flow:**
1. **User:** "What does SherpaPrompt do?"
2. **System:** Loads SherpaPrompt's knowledge base
3. **Scout:** Searches RAG system for product information
4. **Response:** Detailed explanation of automation services
5. **Follow-up:** "Would you like to schedule a demo?"

### **Superior Fencing Flow:**
1. **User:** "I need fence repair"
2. **System:** Loads Superior Fencing's simple collection flow
3. **Mason:** "Could I start with your name?"
4. **Collection:** Name → Phone → Reason for call
5. **Result:** Information sent to team via email

## Key Differences in Behavior

| Feature | SherpaPrompt (Scout) | Superior Fencing (Mason) |
|---------|---------------------|-------------------------|
| **Knowledge Search** | ✅ Full RAG system | ❌ No knowledge base |
| **Appointment Booking** | ✅ Google Calendar | ❌ Information only |
| **Conversation Style** | Consultative, detailed | Efficient, focused |
| **Emergency Handling** | ❌ Not configured | ✅ Press # for emergency |
| **Lead Processing** | Demo scheduling | Basic info collection |

## Error Handling

### **Invalid Business ID:**
```
Client: ws://localhost:3001/realtime-ws?businessId=invalid-business
Server: ❌ Business config not found for: invalid-business
Result: WebSocket closes with error 1008
```

### **Missing Configuration:**
```
Server: ⚠️ Failed to load business-specific prompt, using default
Result: Falls back to SherpaPrompt configuration
```

### **Network Issues:**
```
Client: Connection lost during business switch
Result: Automatic reconnection with last selected business
```

## Testing the Implementation

### **Manual Testing Steps:**

1. **Open the client:** `http://localhost:3000`
2. **Test SherpaPrompt:**
   - Click "SherpaPrompt" toggle (should be selected by default)
   - Start conversation
   - Ask: "What are your services?"
   - Expect: Detailed product information from Scout

3. **Test Superior Fencing:**
   - Click "Superior Fencing" toggle
   - Notice UI changes (green theme, Mason agent)
   - Start conversation
   - Say: "I need fence repair"
   - Expect: Mason asks for name, phone, reason

4. **Test Business Switching:**
   - Switch between businesses during conversation
   - Each new conversation should use the correct agent
   - UI should update immediately

### **Expected Behaviors:**

✅ **Correct Agent Activation:** Scout for SherpaPrompt, Mason for Superior Fencing
✅ **Business-Specific Prompts:** Different conversation flows and capabilities
✅ **UI Updates:** Immediate visual feedback when switching businesses
✅ **Session Isolation:** Each conversation uses the selected business context
✅ **Graceful Fallbacks:** System handles errors and missing configurations

## Summary

The business identification and switching system works like a **smart dispatcher**:

1. **Client Selection:** User chooses which business they want to interact with
2. **Context Passing:** Client sends business ID to server via WebSocket URL
3. **Configuration Loading:** Server loads business-specific settings and prompts
4. **Agent Activation:** Appropriate AI agent (Scout or Mason) is activated
5. **Flow Execution:** Conversation follows business-specific rules and capabilities

This allows one system to serve multiple businesses with completely different conversation flows, capabilities, and branding - all controlled by a simple toggle switch on the client side.
