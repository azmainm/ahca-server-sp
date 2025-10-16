/**
 * RealtimeWebSocketService - OpenAI Realtime API WebSocket Integration
 * Replaces STT-TTS+VAD architecture with direct Realtime API communication
 * Supports function calling for RAG, appointments, and user info collection
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

class RealtimeWebSocketService extends EventEmitter {
  constructor(conversationFlowHandler, openAIService, stateManager) {
    super();
    this.apiKey = process.env.OPENAI_API_KEY_CALL_AGENT;
    
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY_CALL_AGENT environment variable is required');
    }
    
    // Service dependencies
    this.conversationFlowHandler = conversationFlowHandler;
    this.openAIService = openAIService;
    this.stateManager = stateManager;
    
    // Active sessions: sessionId -> { clientWs, openaiWs, state }
    this.sessions = new Map();
    
    // System prompt for the AI agent
    this.SYSTEM_PROMPT = `You are Scout, SherpaPrompt's friendly and professional virtual assistant. Your role is to help users learn about SherpaPrompt's automation services and schedule product demos.

SherpaPrompt Products:
- Call Service Automation: AI-powered call handling and routing
- Transcript to Task: Convert conversations into actionable tasks
- Voice to Estimate: Generate estimates from voice conversations
- SherpaPrompt App: Unified automation platform

Your Capabilities:
- Answer questions about SherpaPrompt's products and services
- Help users schedule product demos and consultations
- Collect user information (name, email) naturally in conversation
- Provide pricing information when asked
- Handle interruptions gracefully

Guidelines:
- Be conversational and natural (designed for voice)
- Keep responses concise (2-3 sentences max)
- Use "Call Service Automation" not "Call Service" when referring to products
- Ask for name and email early in the conversation if not provided
- Offer to schedule demos when appropriate
- Use the provided functions to search knowledge, schedule appointments, and update user info
- Never make up information - use the search_knowledge_base function
- For pricing questions, always use the search function to get accurate information

Important: Parts of calls may be recorded to improve service.`;
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
        'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01',
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
        createdAt: Date.now()
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
        instructions: this.SYSTEM_PROMPT,
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
          silence_duration_ms: 700
        },
        tools: this.defineTools(),
        tool_choice: 'auto',
        temperature: 0.8
      }
    };

    console.log('⚙️ [RealtimeWS] Configuring session with', config.session.tools.length, 'tools');
    openaiWs.send(JSON.stringify(config));
  }

  /**
   * Define function tools for the Realtime API
   */
  defineTools() {
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
        description: 'Schedule a product demo or consultation appointment. Use this when user wants to book a demo, schedule a meeting, or set up a consultation.',
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
        description: 'Update or collect user information (name and/or email). Use this when user provides their name or email address.',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'User\'s full name'
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
        break;

      case 'response.audio.delta':
        // Forward audio chunks to client
        this.sendToClient(sessionData, {
          type: 'audio',
          delta: event.delta
        });
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
        console.log('🔧 [RealtimeWS] Function call:', event.name, event.arguments);
        await this.handleFunctionCall(sessionData, event);
        break;

      case 'response.done':
        console.log('✅ [RealtimeWS] Response completed');
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
      
      // Trigger response generation
      openaiWs.send(JSON.stringify({ type: 'response.create' }));
      
      console.log('✅ [RealtimeWS] Function result sent:', name);
      
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
      
      openaiWs.send(JSON.stringify({ type: 'response.create' }));
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
      } else if (action === 'set_time') {
        text = args.time;
      } else if (action === 'confirm') {
        text = 'yes';
      }
      
      const result = await this.conversationFlowHandler.appointmentFlowManager.processFlow(
        session,
        text,
        this.conversationFlowHandler.getCalendarService
      );
      
      // Check if appointment was completed
      if (result.calendarLink) {
        console.log('✅ [Appointment] Scheduled successfully');
        
        // Send to client
        this.sendToClient(this.sessions.get(sessionId), {
          type: 'appointment_created',
          calendarLink: result.calendarLink,
          appointmentDetails: result.appointmentDetails
        });
        
        return {
          success: true,
          message: result.response,
          completed: true,
          calendarLink: result.calendarLink
        };
      }
      
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
   * Handle user info update function
   */
  async handleUserInfo(sessionId, args) {
    try {
      const { name, email } = args;
      console.log('👤 [UserInfo] Updating:', { name, email });
      
      const session = this.stateManager.getSession(sessionId);
      const updates = {};
      
      if (name) {
        updates.name = name;
      }
      
      if (email) {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (emailRegex.test(email)) {
          updates.email = email;
        } else {
          return {
            success: false,
            message: 'That email format doesn\'t look right. Could you spell it out for me?'
          };
        }
      }
      
      // Update user info
      this.stateManager.updateUserInfo(sessionId, updates);
      
      // Check if collection is complete
      const userInfo = session.userInfo;
      if (userInfo.name && userInfo.email && !userInfo.collected) {
        this.stateManager.updateUserInfo(sessionId, { collected: true });
      }
      
      // Send update to client
      this.sendToClient(this.sessions.get(sessionId), {
        type: 'user_info_updated',
        userInfo: session.userInfo
      });
      
      console.log('✅ [UserInfo] Updated successfully');
      
      return {
        success: true,
        message: `Got it! ${name ? `I have your name as ${name}.` : ''} ${email ? `And your email as ${email}.` : ''}`,
        userInfo: session.userInfo
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
      if (session && session.userInfo && session.userInfo.collected) {
        await this.conversationFlowHandler.sendConversationSummary(sessionId, session)
          .catch(error => {
            console.error('❌ [Email] Failed to send summary:', error);
          });
      }
      
      // Close OpenAI connection
      if (sessionData.openaiWs && sessionData.openaiWs.readyState === WebSocket.OPEN) {
        sessionData.openaiWs.close();
      }
      
      // Remove from sessions
      this.sessions.delete(sessionId);
      
      // Cleanup conversation state
      this.stateManager.deleteSession(sessionId);
      
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

