/**
 * RealtimeWebSocketService - OpenAI Realtime API WebSocket Integration
 * Replaces STT-TTS+VAD architecture with direct Realtime API communication
 * Supports function calling for RAG, appointments, and user info collection
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

class RealtimeWebSocketService extends EventEmitter {
  constructor(conversationFlowHandler, openAIService, stateManager, businessConfigService = null, tenantContextManager = null) {
    super();
    this.apiKey = process.env.OPENAI_API_KEY_CALL_AGENT;
    
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY_CALL_AGENT environment variable is required');
    }
    
    // Service dependencies
    this.conversationFlowHandler = conversationFlowHandler;
    this.openAIService = openAIService;
    this.stateManager = stateManager;
    this.businessConfigService = businessConfigService;
    this.tenantContextManager = tenantContextManager;
    
    // Active sessions: sessionId -> { clientWs, openaiWs, state }
    this.sessions = new Map();
    
    // Default system prompt (fallback)
    try {
      const prompts = require('../../../configs/prompt_rules.json');
      this.DEFAULT_SYSTEM_PROMPT = prompts.realtimeSystem.full;
    } catch (e) {
      this.DEFAULT_SYSTEM_PROMPT = 'You are SherpaPrompt\'s voice assistant.';
    }
  }

  /**
   * Get business-specific system prompt
   */
  getSystemPrompt(sessionId) {
    try {
      // Get business ID from session
      if (this.tenantContextManager && this.businessConfigService) {
        const businessId = this.tenantContextManager.getBusinessId(sessionId);
        console.log(`🔍 [RealtimeWS] Getting system prompt for business: ${businessId}`);
        
        if (businessId) {
          const businessConfig = this.businessConfigService.getBusinessConfig(businessId);
          if (businessConfig) {
            // Try to load business-specific prompt rules
            const fs = require('fs');
            const path = require('path');
                   const promptPath = path.join(__dirname, `../../../../configs/businesses/${businessId}/prompt_rules.json`);
            
            console.log(`🔍 [RealtimeWS] Looking for prompt file at: ${promptPath}`);
            
            if (fs.existsSync(promptPath)) {
              const businessPrompts = JSON.parse(fs.readFileSync(promptPath, 'utf8'));
              console.log(`🔍 [RealtimeWS] Loaded prompt file, checking realtimeSystem.full...`);
              
              if (businessPrompts.realtimeSystem?.full) {
                console.log(`✅ [RealtimeWS] Using business-specific prompt for: ${businessId}`);
                console.log(`📝 [RealtimeWS] Prompt preview: ${businessPrompts.realtimeSystem.full.substring(0, 100)}...`);
                return businessPrompts.realtimeSystem.full;
              } else {
                console.warn(`⚠️ [RealtimeWS] No realtimeSystem.full found in prompt file for: ${businessId}`);
              }
            } else {
              console.warn(`⚠️ [RealtimeWS] Prompt file not found: ${promptPath}`);
            }
          } else {
            console.warn(`⚠️ [RealtimeWS] No business config found for: ${businessId}`);
          }
        } else {
          console.warn(`⚠️ [RealtimeWS] No business ID found for session: ${sessionId}`);
        }
      } else {
        console.warn(`⚠️ [RealtimeWS] Missing tenantContextManager or businessConfigService`);
      }
    } catch (error) {
      console.warn('⚠️ [RealtimeWS] Failed to load business-specific prompt, using default:', error.message);
    }
    
    // Fallback to default prompt
    console.log('📝 [RealtimeWS] Using default system prompt');
    return this.DEFAULT_SYSTEM_PROMPT;
  }

  /**
   * Create a new Realtime API session
   */
  async createSession(clientWs, sessionId) {
    try {
      console.log('🎯 [RealtimeWS] Creating new session:', sessionId);
      
      // Create conversation session in state manager
      this.stateManager.getSession(sessionId);
      
      // Create WebSocket connection to OpenAI Realtime API
      const openaiWs = new WebSocket(
        'wss://api.openai.com/v1/realtime?model=gpt-realtime-mini',
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'OpenAI-Beta': 'realtime=v1'
          }
        }
      );

      // Store session
      const sessionData = {
        sessionId,
        clientWs,
        openaiWs,
        isConnected: false,
        isResponding: false,  // Track if AI is currently responding
        activeResponseId: null,  // Track active response ID for cancellation
        suppressAudio: false, // Drop any in-flight audio after interruption until next response starts
        createdAt: Date.now(),
        hasBufferedAudio: false
      };
      
      this.sessions.set(sessionId, sessionData);

      // Set up OpenAI WebSocket handlers
      this.setupOpenAIHandlers(sessionData);
      
      // Set up client WebSocket handlers
      this.setupClientHandlers(sessionData);

      // Wait for connection
      await this.waitForConnection(sessionData);
      
      // Configure session with function tools
      await this.configureSession(sessionData);
      
      // Trigger automatic initial greeting
      await this.triggerInitialGreeting(sessionData);
      
      console.log('✅ [RealtimeWS] Session created successfully:', sessionId);
      
      return { success: true, sessionId };
      
    } catch (error) {
      console.error('❌ [RealtimeWS] Failed to create session:', error);
      throw error;
    }
  }

  /**
   * Wait for OpenAI WebSocket connection to be established
   */
  waitForConnection(sessionData) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, 10000);

      const checkConnection = () => {
        if (sessionData.isConnected) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(checkConnection, 100);
        }
      };

      checkConnection();
    });
  }

  /**
   * Configure Realtime API session with tools and settings
   */
  async configureSession(sessionData) {
    const { openaiWs } = sessionData;
    
    const config = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: this.getSystemPrompt(sessionData.sessionId),
        voice: 'echo',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
          create_response: true,  // Enable automatic response creation (semantic VAD)
          interrupt_response: true  // Allow interruptions
        },
        tools: this.defineTools(sessionData.sessionId),
        tool_choice: 'auto',
        temperature: 0.8
      }
    };

    console.log('⚙️ [RealtimeWS] Configuring session with', config.session.tools.length, 'tools');
    openaiWs.send(JSON.stringify(config));
  }

  /**
   * Trigger automatic initial greeting after session setup
   */
  async triggerInitialGreeting(sessionData) {
    const { openaiWs } = sessionData;
    
    console.log('🎤 [RealtimeWS] Triggering automatic initial greeting');
    
    // Add a small delay to ensure session configuration is processed
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Add a conversation item to simulate the start of conversation
    // This will trigger the LLM to use its opening behavior from system prompt
    const startConversation = {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: '[SESSION_START]'
          }
        ]
      }
    };
    
    openaiWs.send(JSON.stringify(startConversation));
    
    // Now trigger a response which should use the opening behavior
    const initialResponse = {
      type: 'response.create',
      response: {
        modalities: ['audio', 'text']
      }
    };
    
    openaiWs.send(JSON.stringify(initialResponse));
    console.log('✅ [RealtimeWS] Initial greeting triggered');
  }

  /**
   * Define function tools for the Realtime API
   */
  defineTools(sessionId) {
    // Get business-specific configuration
    let businessId = null;
    let businessConfig = null;
    
    try {
      if (this.tenantContextManager && this.businessConfigService) {
        businessId = this.tenantContextManager.getBusinessId(sessionId);
        if (businessId) {
          businessConfig = this.businessConfigService.getBusinessConfig(businessId);
        }
      }
    } catch (error) {
      console.warn('⚠️ [RealtimeWS] Error getting business config for tools:', error.message);
    }
    
    console.log(`🔧 [RealtimeWS] Defining tools for business: ${businessId}`);
    
    // Superior Fencing has limited tools (no RAG, no appointment booking)
    if (businessId === 'superior-fencing') {
      console.log(`🔧 [RealtimeWS] Using Superior Fencing tools (basic info collection only)`);
      return [
        {
          type: 'function',
          name: 'update_user_info',
          description: 'Update customer information (name, phone, reason for call). Call this when customer provides their name, phone number, or reason for calling.',
          parameters: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Customer name'
              },
              phone: {
                type: 'string', 
                description: 'Customer phone number'
              },
              reason: {
                type: 'string',
                description: 'Reason for calling (e.g., fence repair, new installation, emergency)'
              }
            }
          }
        }
      ];
    }
    
    // SherpaPrompt gets full tools (RAG + appointment booking)
    console.log(`🔧 [RealtimeWS] Using SherpaPrompt tools (full feature set)`);
    return [
      {
        type: 'function',
        name: 'search_knowledge_base',
        description: 'Search SherpaPrompt knowledge base for information about products, services, pricing, features, integrations, or company information. Use this for any question about SherpaPrompt.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query or question to find information about'
            }
          },
          required: ['query']
        }
      },
      {
        type: 'function',
        name: 'schedule_appointment',
        description: 'Schedule a product demo or consultation appointment. When the user mentions booking/scheduling/setting a demo or appointment, IMMEDIATELY call this with action="start". STRICT SEQUENCE: After start → set_calendar → set_service → set_date (MUST be in one of these exact formats ONLY: "October 16, 2025" or "16 October 2025") → set_time (choose from provided slots) → confirm. CRITICAL: After showing the appointment summary/review, if user says "yes", "sounds good", "that\'s fine", "that\'s all", "no that\'s all", "looks good", or any confirmation, you MUST call this function with action="confirm" to actually create the calendar event. Without calling confirm action, the appointment will NOT be created. Do NOT call set_calendar again after it is selected.',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['start', 'set_calendar', 'set_service', 'set_date', 'set_time', 'confirm'],
              description: 'The appointment scheduling action to perform'
            },
            calendar_type: {
              type: 'string',
              enum: ['google', 'microsoft'],
              description: 'Calendar type (google or microsoft) - required for set_calendar action'
            },
            service: {
              type: 'string',
              description: 'Type of service (e.g., "Product demo", "Automation consultation", "Integration discussion") - for set_service action'
            },
            date: {
              type: 'string',
              description: 'Date in natural language (e.g., "tomorrow", "next Monday", "October 20") - for set_date action'
            },
            time: {
              type: 'string',
              description: 'Time in natural language (e.g., "2 PM", "14:00", "afternoon") - for set_time action'
            }
          },
          required: ['action']
        }
      },
      {
        type: 'function',
        name: 'update_user_info',
        description: 'CRITICAL: ALWAYS call this function immediately when user provides their name or email. Examples: "My name is John", "I\'m Sarah", "Call me Dave", "My email is...", etc. This stores their information for personalization and appointment booking. Call this even if just acknowledging their name in conversation.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'User\'s full name (extract from phrases like "My name is...", "I\'m...", "Call me...", etc.)'
            },
            email: {
              type: 'string',
              description: 'User\'s email address'
            }
          }
        }
      }
    ];
  }

  /**
   * Set up OpenAI WebSocket event handlers
   */
  setupOpenAIHandlers(sessionData) {
    const { openaiWs, sessionId } = sessionData;

    openaiWs.on('open', () => {
      console.log('🔗 [RealtimeWS] Connected to OpenAI:', sessionId);
      sessionData.isConnected = true;
    });

    openaiWs.on('message', async (data) => {
      try {
        const event = JSON.parse(data.toString());
        await this.handleOpenAIEvent(sessionData, event);
      } catch (error) {
        console.error('❌ [RealtimeWS] Error handling OpenAI message:', error);
      }
    });

    openaiWs.on('error', (error) => {
      console.error('❌ [RealtimeWS] OpenAI WebSocket error:', sessionId, error);
      this.sendToClient(sessionData, {
        type: 'error',
        error: 'Connection error with AI service'
      });
    });

    openaiWs.on('close', (code, reason) => {
      console.log('🔌 [RealtimeWS] OpenAI connection closed:', sessionId, code, reason.toString());
      sessionData.isConnected = false;
    });
  }

  /**
   * Set up client WebSocket event handlers
   */
  setupClientHandlers(sessionData) {
    const { clientWs, sessionId } = sessionData;

    clientWs.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        await this.handleClientMessage(sessionData, message);
      } catch (error) {
        console.error('❌ [RealtimeWS] Error handling client message:', error);
      }
    });

    clientWs.on('close', () => {
      console.log('🔌 [RealtimeWS] Client disconnected:', sessionId);
      this.closeSession(sessionId);
    });

    clientWs.on('error', (error) => {
      console.error('❌ [RealtimeWS] Client WebSocket error:', sessionId, error);
    });
  }

  /**
   * Handle messages from client
   */
  async handleClientMessage(sessionData, message) {
    const { openaiWs, sessionId } = sessionData;

    switch (message.type) {
      case 'audio':
        // Forward audio to OpenAI
        if (openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: message.data
          }));
        }
        break;

      case 'input_audio_buffer.commit':
        // Commit audio buffer
        if (openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.send(JSON.stringify({
            type: 'input_audio_buffer.commit'
          }));
        }
        break;

      case 'response.cancel':
        // Cancel current response (for interruptions)
        if (openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.send(JSON.stringify({
            type: 'response.cancel'
          }));
        }
        break;

      default:
        console.log('📋 [RealtimeWS] Unknown client message type:', message.type);
    }
  }

  /**
   * Handle events from OpenAI Realtime API
   */
  async handleOpenAIEvent(sessionData, event) {
    const { sessionId } = sessionData;

    switch (event.type) {
      case 'session.created':
        console.log('✅ [RealtimeWS] OpenAI session created:', event.session.id);
        break;

      case 'session.updated':
        console.log('✅ [RealtimeWS] Session updated');
        break;

      case 'input_audio_buffer.speech_started':
        console.log('🎤 [RealtimeWS] Speech started:', sessionId);
        
        // Cancel any ongoing AI response (user is interrupting)
        // Only send cancel if we have an active response (not just finished)
        if (sessionData.isResponding && sessionData.activeResponseId) {
          console.log('🛑 [RealtimeWS] User interrupted - canceling AI response:', sessionData.activeResponseId);
          try {
            sessionData.openaiWs.send(JSON.stringify({
              type: 'response.cancel'
            }));
          } catch (error) {
            console.log('⚠️ [RealtimeWS] Cancel failed (response may have completed):', error.message);
          }
          sessionData.isResponding = false;
          sessionData.activeResponseId = null;
        }

        // Suppress any in-flight audio chunks arriving after interruption
        sessionData.suppressAudio = true;
        
        this.sendToClient(sessionData, {
          type: 'speech_started'
        });
        break;

      case 'input_audio_buffer.speech_stopped':
        console.log('🔇 [RealtimeWS] Speech stopped:', sessionId);
        this.sendToClient(sessionData, {
          type: 'speech_stopped'
        });
        break;

      case 'conversation.item.input_audio_transcription.completed':
        console.log('📝 [RealtimeWS] Transcription:', event.transcript);
        this.sendToClient(sessionData, {
          type: 'transcript',
          text: event.transcript,
          role: 'user'
        });
        
        // Add to conversation history
        this.stateManager.addMessage(sessionId, 'user', event.transcript);
        
        // FALLBACK: Check if transcription contains name information and OpenAI didn't call update_user_info
        await this.checkForMissedNameInfo(sessionData, event.transcript);
        break;

      case 'response.audio.delta':
        // Forward audio chunks to client
        // First audio of a new response unsuppresses playback
        if (!sessionData.isResponding) {
          sessionData.suppressAudio = false;
        }
        sessionData.isResponding = true;  // Track that AI is responding
        sessionData.activeResponseId = event.response_id || 'active';  // Track active response
        
        // Drop audio if suppression is active (post-interruption residuals)
        if (!sessionData.suppressAudio) {
          this.sendToClient(sessionData, {
            type: 'audio',
            delta: event.delta
          });
        }
        break;

      case 'response.audio_transcript.delta':
        // Forward text transcript of AI response
        this.sendToClient(sessionData, {
          type: 'transcript_delta',
          delta: event.delta,
          role: 'assistant'
        });
        break;

      case 'response.audio_transcript.done':
        console.log('📝 [RealtimeWS] AI response transcript:', event.transcript);
        this.sendToClient(sessionData, {
          type: 'transcript',
          text: event.transcript,
          role: 'assistant'
        });
        
        // Add to conversation history
        this.stateManager.addMessage(sessionId, 'assistant', event.transcript);
        break;

      case 'response.function_call_arguments.done':
        console.log('🔧 [RealtimeWS] Function call detected:', event.name);
        console.log('🔧 [RealtimeWS] Function arguments:', event.arguments);
        console.log('🔧 [RealtimeWS] Full event:', JSON.stringify(event, null, 2));
        await this.handleFunctionCall(sessionData, event);
        break;

      case 'response.done':
        console.log('✅ [RealtimeWS] Response completed');
        sessionData.isResponding = false;  // AI finished responding
        sessionData.activeResponseId = null;  // Clear active response ID
        sessionData.suppressAudio = false; // Clear suppression at end of response
        this.sendToClient(sessionData, {
          type: 'response_done'
        });
        break;

      case 'error':
        console.error('❌ [RealtimeWS] OpenAI error:', event.error);
        this.sendToClient(sessionData, {
          type: 'error',
          error: event.error.message
        });
        break;

      default:
        // Log other events for debugging
        if (!event.type.includes('response.audio.')) {
          console.log('📋 [RealtimeWS] Event:', event.type);
        }
    }
  }

  /**
   * Handle function calls from OpenAI
   */
  async handleFunctionCall(sessionData, functionCallEvent) {
    const { openaiWs, sessionId } = sessionData;
    const { call_id, name, arguments: argsStr } = functionCallEvent;
    
    try {
      const args = JSON.parse(argsStr);
      console.log('🔧 [RealtimeWS] Executing function:', name, 'with args:', args);
      
      let result;
      
      switch (name) {
        case 'search_knowledge_base':
          result = await this.handleKnowledgeSearch(sessionId, args);
          break;
          
        case 'schedule_appointment':
          result = await this.handleAppointment(sessionId, args);
          break;
          
        case 'update_user_info':
          result = await this.handleUserInfo(sessionId, args);
          break;
          
        default:
          result = { error: `Unknown function: ${name}` };
      }
      
      // Send function result back to OpenAI
      const functionOutput = {
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: call_id,
          output: JSON.stringify(result)
        }
      };
      
      openaiWs.send(JSON.stringify(functionOutput));
      
      console.log('✅ [RealtimeWS] Function result sent:', name);
      
      // Prompt the model to produce a follow-up response immediately
      // Without this, the Realtime API may wait for the next user turn
      try {
        const continueResponse = {
          type: 'response.create',
          response: {
            modalities: ['audio', 'text']
          }
        };
        openaiWs.send(JSON.stringify(continueResponse));
      } catch (e) {
        console.warn('⚠️ [RealtimeWS] Failed to request follow-up response:', e.message);
      }
      
    } catch (error) {
      console.error('❌ [RealtimeWS] Function execution error:', error);
      
      // Send error back to OpenAI
      openaiWs.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: call_id,
          output: JSON.stringify({ error: error.message })
        }
      }));
      
    }
  }

  /**
   * Handle knowledge base search function
   */
  async handleKnowledgeSearch(sessionId, args) {
    try {
      const { query } = args;
      console.log('🔍 [Knowledge] Searching for:', query);
      
      // Extract search terms
      const searchTerms = this.conversationFlowHandler.extractSearchTerms(query);
      
      // Search knowledge base
      const searchResults = await this.conversationFlowHandler.embeddingService.searchSimilarContent(
        searchTerms.length > 0 ? searchTerms.join(' ') : query,
        5
      );
      
      if (searchResults && searchResults.length > 0) {
        // Format context
        const context = this.conversationFlowHandler.sherpaPromptRAG.formatContext(searchResults);
        
        console.log('📚 [Knowledge] Found', searchResults.length, 'relevant results');
        
        return {
          success: true,
          context: context,
          sources: searchResults.length,
          message: 'Found relevant information in knowledge base'
        };
      } else {
        console.log('📚 [Knowledge] No results found');
        return {
          success: false,
          message: 'No specific information found. You may want to offer to schedule a demo for more details.'
        };
      }
    } catch (error) {
      console.error('❌ [Knowledge] Search error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Handle appointment scheduling function
   */
  async handleAppointment(sessionId, args) {
    try {
      const { action } = args;
      console.log('📅 [Appointment] Action:', action, 'Args:', args);
      
      const session = this.stateManager.getSession(sessionId);
      const steps = this.conversationFlowHandler.appointmentFlowManager.steps;
      const currentStep = this.conversationFlowHandler.appointmentFlowManager.getCurrentStep(session);

      // Step-aware guardrails: restrict which actions are valid per step
      const allowedActionsByStep = {
        [steps.SELECT_CALENDAR]: new Set(['set_calendar']),
        [steps.COLLECT_TITLE]: new Set(['set_service']),
        [steps.COLLECT_DATE]: new Set(['set_date']),
        [steps.COLLECT_TIME]: new Set(['set_time']),
        [steps.REVIEW]: new Set(['confirm']),
        [steps.CONFIRM]: new Set(['confirm']),
        [steps.COLLECT_NAME]: new Set([]),
        [steps.COLLECT_EMAIL]: new Set([]),
        [steps.CONFIRM_EMAIL]: new Set(['confirm', 'set_calendar']) // Allow calendar selection after email confirmation
      };

      // If flow not initialized and action is not start, initialize first
      if ((!session.appointmentFlow || !session.appointmentFlow.active) && action !== 'start') {
        this.conversationFlowHandler.appointmentFlowManager.initializeFlow(session);
      }

      // Recompute step after potential initialization
      const stepNow = this.conversationFlowHandler.appointmentFlowManager.getCurrentStep(session);

      // Prevent redundant calendar selection once chosen
      if (action === 'set_calendar' && session.appointmentFlow && session.appointmentFlow.calendarType) {
        return {
          success: true,
          message: `Calendar is already set to ${session.appointmentFlow.calendarType}. Next, tell me the session type (e.g., product demo).`,
          needsMoreInfo: true,
          nextActionHint: 'set_service'
        };
      }

      // Enforce allowed actions for current step
      const allowed = allowedActionsByStep[stepNow];
      if (allowed && allowed.size > 0 && !allowed.has(action)) {
        // Provide specific guidance per step
        const guidanceByStep = {
          [steps.SELECT_CALENDAR]: 'Please choose a calendar: say "Google" or "Microsoft".',
          [steps.COLLECT_TITLE]: 'Please specify the session type (e.g., product demo, integration discussion).',
          [steps.COLLECT_DATE]: 'Please provide the date ONLY in this format: "October 16, 2025" or "16 October 2025".',
          [steps.COLLECT_TIME]: 'Please choose a time from the available slots I listed.',
          [steps.REVIEW]: 'Say "sounds good" or "yes" to confirm, or specify what to change.',
          [steps.CONFIRM]: 'Say "sounds good" or "yes" to confirm.',
          [steps.COLLECT_NAME]: 'Please provide your name (you can spell it).',
          [steps.COLLECT_EMAIL]: 'Please provide your email address, spelled out for accuracy.',
          [steps.CONFIRM_EMAIL]: 'Please say "yes" if your email is correct, or "no" to change it. After confirming, I\'ll ask about your calendar preference.'
        };

        return {
          success: true,
          message: guidanceByStep[stepNow] || 'Please follow the current step instructions.',
          needsMoreInfo: true,
          nextActionHint: Array.from(allowed)[0] || 'confirm'
        };
      }
      
      // Initialize appointment flow if starting
      if (action === 'start') {
        const initResult = this.conversationFlowHandler.appointmentFlowManager.initializeFlow(session);
        
        // Send appointment info to client
        this.sendToClient(this.sessions.get(sessionId), {
          type: 'appointment_started'
        });
        
        return {
          success: true,
          message: initResult.response,
          needsMoreInfo: true
        };
      }
      
      // Process appointment flow based on action
      let text = '';
      
      if (action === 'set_calendar') {
        text = args.calendar_type;
      } else if (action === 'set_service') {
        text = args.service;
      } else if (action === 'set_date') {
        text = args.date;
        
        // CRITICAL FIX: When changing date, ALWAYS clear old date/time/slots to force fresh lookup
        if (session.appointmentFlow && session.appointmentFlow.active) {
          const currentStep = session.appointmentFlow.step;
          console.log('🔧 [Appointment] Date change detected in step:', currentStep);
          console.log('🔧 [Appointment] Current details before clear:', JSON.stringify(session.appointmentFlow.details, null, 2));
          
          // If we have existing date/time (user is changing date), clear them
          if (session.appointmentFlow.details && (session.appointmentFlow.details.date || session.appointmentFlow.details.time)) {
            console.log('🔧 [Appointment] Clearing old date/time/slots to force fresh lookup');
            
            // Preserve only title, clear everything else
            const title = session.appointmentFlow.details?.title;
            const titleDisplay = session.appointmentFlow.details?.titleDisplay;
            session.appointmentFlow.details = {
              ...(title && { title }),
              ...(titleDisplay && { titleDisplay })
            };
            
            // Reset to COLLECT_DATE step to force slot checking
            session.appointmentFlow.step = this.conversationFlowHandler.appointmentFlowManager.steps.COLLECT_DATE;
            console.log('🔧 [Appointment] Reset to COLLECT_DATE, details now:', JSON.stringify(session.appointmentFlow.details, null, 2));
          }
        }
      } else if (action === 'set_time') {
        // Ensure date and available slots exist before accepting time
        const flowDetails = (session.appointmentFlow && session.appointmentFlow.details) || {};
        if (!flowDetails.availableSlots || !flowDetails.date) {
          return {
            success: true,
            message: 'Please provide the date first in one of these exact formats: "October 16, 2025" or "16 October 2025". I will then list available time slots to choose from.',
            needsMoreInfo: true,
            nextActionHint: 'set_date'
          };
        }
        text = args.time;
      } else if (action === 'confirm') {
        console.log('🔧 [Appointment] CONFIRM action triggered');
        text = 'yes';
        
        // CRITICAL FIX: When confirming appointment, validate details and ensure proper step
        if (session.appointmentFlow && session.appointmentFlow.active) {
          const details = session.appointmentFlow.details || {};
          const currentStep = session.appointmentFlow.step;
          
          console.log('🔧 [Appointment] Current step:', currentStep);
          console.log('🔧 [Appointment] Current details:', JSON.stringify(details, null, 2));
          console.log('🔧 [Appointment] User info:', JSON.stringify(session.userInfo, null, 2));
          console.log('🔧 [Appointment] Calendar type:', session.appointmentFlow.calendarType);
          
          // Validate we have ALL required information
          const hasAllInfo = details.title && details.date && details.time && 
                            session.userInfo.name && session.userInfo.email &&
                            session.appointmentFlow.calendarType;
          
          if (!hasAllInfo) {
            console.log('❌ [Appointment] Missing required details:', {
              title: !!details.title,
              date: !!details.date,
              time: !!details.time,
              name: !!session.userInfo.name,
              email: !!session.userInfo.email,
              calendarType: !!session.appointmentFlow.calendarType
            });
            return {
              success: true,
              message: 'I need to collect some more information before I can confirm the appointment. Let me help you complete the booking.',
              needsMoreInfo: true
            };
          }
          
          // Set step to REVIEW to ensure confirmation flow works properly
          console.log('✅ [Appointment] All details present - setting step to REVIEW for confirmation');
          session.appointmentFlow.step = this.conversationFlowHandler.appointmentFlowManager.steps.REVIEW;
        }
      }
      
      console.log('🔄 [Appointment] Calling appointmentFlowManager.processFlow with text:', text);
      const result = await this.conversationFlowHandler.appointmentFlowManager.processFlow(
        session,
        text,
        this.conversationFlowHandler.getCalendarService
      );
      
      console.log('📋 [Appointment] ProcessFlow result:', JSON.stringify(result, null, 2));
      
      // Check if appointment was completed
      if (result.calendarLink || result.appointmentCreated) {
        console.log('✅ [Appointment] Appointment creation detected');
        console.log('🔗 [Appointment] Calendar link:', result.calendarLink);
        console.log('📅 [Appointment] Appointment details:', JSON.stringify(result.appointmentDetails, null, 2));
        
        // Send to client
        const clientSession = this.sessions.get(sessionId);
        if (clientSession && clientSession.clientWs) {
          console.log('📤 [Appointment] Sending appointment_created message to client');
          this.sendToClient(clientSession, {
            type: 'appointment_created',
            calendarLink: result.calendarLink,
            appointmentDetails: result.appointmentDetails
          });
        } else {
          console.error('❌ [Appointment] No client WebSocket found for session:', sessionId);
        }
        
        // Avoid speaking the raw calendar link in model response
        return {
          success: true,
          message: result.response,
          completed: true
        };
      }
      
      console.log('📋 [Appointment] Continuing appointment flow, no completion detected');
      return {
        success: true,
        message: result.response,
        needsMoreInfo: !result.appointmentDetails
      };
      
    } catch (error) {
      console.error('❌ [Appointment] Error:', error);
      return {
        success: false,
        error: error.message,
        message: 'Sorry, I had trouble processing that. Could you try again?'
      };
    }
  }

  /**
   * Check for missed name/email information in transcription
   * Fallback mechanism when OpenAI doesn't call update_user_info
   */
  async checkForMissedNameInfo(sessionData, transcript) {
    const { sessionId } = sessionData;
    const session = this.stateManager.getSession(sessionId);
    
    let foundName = null;
    let foundEmail = null;
    
    // Check for name patterns (only if we don't already have a name)
    if (!session.userInfo.name) {
      const namePatterns = [
        /my name is ([a-zA-Z\s]+)/i,
        /i'm ([a-zA-Z\s]+)/i,
        /call me ([a-zA-Z\s]+)/i,
        /i am ([a-zA-Z\s]+)/i
      ];
      
      for (const pattern of namePatterns) {
        const match = transcript.match(pattern);
        if (match) {
          const extractedName = match[1].trim();
          
          // Avoid common false positives
          const falsePositives = ['good', 'fine', 'okay', 'ready', 'here', 'listening', 'interested', 'looking', 'done', 'back'];
          if (!falsePositives.includes(extractedName.toLowerCase()) && extractedName.length > 1) {
            foundName = extractedName;
            console.log('🔍 [RealtimeWS] FALLBACK: Detected missed name in transcription:', extractedName);
            break;
          }
        }
      }
    }
    
    // Check for email patterns (only if we don't already have an email)
    if (!session.userInfo.email) {
      const emailPatterns = [
        /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
        /my email is ([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
        /email.*is ([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i
      ];
      
      for (const pattern of emailPatterns) {
        const match = transcript.match(pattern);
        if (match) {
          const extractedEmail = match[1] || match[0];
          if (extractedEmail.includes('@') && extractedEmail.includes('.')) {
            // Use the email as transcribed by OpenAI
            foundEmail = extractedEmail.toLowerCase().trim();
            console.log('🔍 [RealtimeWS] FALLBACK: Detected missed email in transcription:', foundEmail);
            break;
          }
        }
      }
    }
    
    // If we found name or email, trigger the update
    if (foundName || foundEmail) {
      console.log('🔍 [RealtimeWS] Original transcript:', transcript);
      
      const updates = {};
      if (foundName) updates.name = foundName;
      if (foundEmail) updates.email = foundEmail;
      
      // Manually trigger the user info update
      await this.handleUserInfo(sessionId, updates);
      
      // Also send a manual function call to OpenAI to keep it in sync
      try {
        const functionOutput = {
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: 'fallback_' + Date.now(),
            output: JSON.stringify({ 
              success: true, 
              message: `${foundName ? `Name set to ${foundName}` : ''}${foundName && foundEmail ? ', ' : ''}${foundEmail ? `Email set to ${foundEmail}` : ''}` 
            })
          }
        };
        sessionData.openaiWs.send(JSON.stringify(functionOutput));
        console.log('✅ [RealtimeWS] FALLBACK: Sent manual function result to OpenAI');
      } catch (error) {
        console.warn('⚠️ [RealtimeWS] FALLBACK: Failed to sync with OpenAI:', error.message);
      }
    }
  }

  /**
   * Handle user info update function
   */
  async handleUserInfo(sessionId, args) {
    try {
      const { name, email } = args;
      console.log('🚀 [UserInfo] FUNCTION CALLED - Updating:', { name, email });
      console.log('👤 [UserInfo] Session ID:', sessionId);
      
      const sess = this.stateManager.getSession(sessionId);
      console.log('👤 [UserInfo] Current session user info:', JSON.stringify(sess.userInfo, null, 2));
      
      const updates = {};
      
      if (name) {
        console.log('👤 [UserInfo] Setting name:', name);
        updates.name = name;
      }
      
      if (email) {
        console.log('👤 [UserInfo] Processing email:', email);
        
        // Use the email as provided by the user
        const userEmail = email.toLowerCase().trim();
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRegex.test(userEmail)) {
          console.log('✅ [UserInfo] Email format valid');
          updates.email = userEmail;
        } else {
          console.log('❌ [UserInfo] Invalid email format:', email);
          return {
            success: false,
            message: 'That email format doesn\'t look right. Could you spell it out for me?'
          };
        }
      }
      
      console.log('👤 [UserInfo] Applying updates:', updates);
      // Update user info
      this.stateManager.updateUserInfo(sessionId, updates);
      
      // If in scheduling flow and email set, proceed to calendar selection
      const sessionObj = this.stateManager.getSession(sessionId);
      console.log('👤 [UserInfo] Updated session user info:', JSON.stringify(sessionObj.userInfo, null, 2));
      
      if (sessionObj.appointmentFlow && sessionObj.appointmentFlow.active && updates.email) {
        console.log('📅 [UserInfo] In appointment flow, proceeding to calendar selection');
        const flow = sessionObj.appointmentFlow;
        const steps = this.conversationFlowHandler.appointmentFlowManager.steps;
        flow.step = steps.SELECT_CALENDAR;
        return {
          success: true,
          message: "Great! I'd be happy to help you schedule a demo. First, would you like me to add this to your Google Calendar or Microsoft Calendar? Just say 'Google' or 'Microsoft'.",
          userInfo: sessionObj.userInfo
        };
      }
      
      // Check if collection is complete
      const userInfo = sessionObj.userInfo;
      if (userInfo.name && userInfo.email && !userInfo.collected) {
        console.log('✅ [UserInfo] Collection complete, marking as collected');
        this.stateManager.updateUserInfo(sessionId, { collected: true });
      }
      
      // Send update to client
      console.log('📤 [UserInfo] Sending user_info_updated to client');
      this.sendToClient(this.sessions.get(sessionId), {
        type: 'user_info_updated',
        userInfo: sessionObj.userInfo
      });
      
      console.log('✅ [UserInfo] Updated successfully');
      
      return {
        success: true,
        message: `Got it! ${name ? `I have your name as ${name}.` : ''} ${email ? `And your email as ${email}.` : ''}`,
        userInfo: sessionObj.userInfo
      };
      
    } catch (error) {
      console.error('❌ [UserInfo] Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send message to client
   */
  sendToClient(sessionData, message) {
    const { clientWs } = sessionData;
    
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(message));
    }
  }

  /**
   * Close session and cleanup
   */
  async closeSession(sessionId) {
    const sessionData = this.sessions.get(sessionId);
    
    if (sessionData) {
      console.log('🗑️ [RealtimeWS] Closing session:', sessionId);
      
      // Get session data before cleanup
      const session = this.stateManager.getSession(sessionId);
      
      // Send conversation summary email
      // Only send if user info was collected or if it's Superior Fencing (fixed email)
      const businessId = this.tenantContextManager ? this.tenantContextManager.getBusinessId(sessionId) : null;
      if (session && (session.userInfo?.collected || businessId === 'superior-fencing')) {
        await this.conversationFlowHandler.sendConversationSummary(sessionId, session)
          .catch(error => {
            console.error('❌ [Email] Failed to send summary:', error);
          });
      } else {
        console.log('📧 [Email] Skipping email - no user info collected for session:', sessionId);
      }
      
      // Close OpenAI connection
      if (sessionData.openaiWs && sessionData.openaiWs.readyState === WebSocket.OPEN) {
        sessionData.openaiWs.close();
      }
      
      // Remove from sessions
      this.sessions.delete(sessionId);
      
      // Cleanup conversation state
      this.stateManager.deleteSession(sessionId);
      
      // Clean up tenant context (moved here to ensure email sending works)
      if (this.tenantContextManager) {
        this.tenantContextManager.removeTenantContext(sessionId);
        console.log(`🗑️ [RealtimeWS] Cleaned up tenant context for session: ${sessionId}`);
      }
      
      console.log('✅ [RealtimeWS] Session closed:', sessionId);
    }
  }

  /**
   * Get session status
   */
  getSessionStatus(sessionId) {
    const sessionData = this.sessions.get(sessionId);
    
    if (!sessionData) {
      return { exists: false };
    }
    
    const session = this.stateManager.getSession(sessionId);
    
    return {
      exists: true,
      isConnected: sessionData.isConnected,
      sessionAge: Date.now() - sessionData.createdAt,
      userInfo: session?.userInfo,
      messageCount: session?.conversationHistory?.length || 0
    };
  }

  /**
   * Clean up old sessions
   */
  cleanupOldSessions(maxAgeMs = 30 * 60 * 1000) {
    const now = Date.now();
    const sessionsToDelete = [];

    for (const [sessionId, sessionData] of this.sessions) {
      if (now - sessionData.createdAt > maxAgeMs) {
        sessionsToDelete.push(sessionId);
      }
    }

    sessionsToDelete.forEach(sessionId => {
      this.closeSession(sessionId);
    });

    if (sessionsToDelete.length > 0) {
      console.log('🧹 [RealtimeWS] Cleaned up', sessionsToDelete.length, 'old sessions');
    }
  }

  /**
   * Get active sessions count
   */
  getActiveSessionsCount() {
    return this.sessions.size;
  }
}

module.exports = { RealtimeWebSocketService };

