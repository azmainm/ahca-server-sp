// voice-agent/routes/chained-voice.js
/**
 * OpenAI Chained Voice Agent Implementation
 * Following exact documentation from https://platform.openai.com/docs/guides/voice-agents
 * 
 * Chained Architecture: Audio → STT → Text Processing → TTS → Audio
 */

const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const { EmbeddingService } = require('../../../shared/services/EmbeddingService');
const { FencingRAG } = require('../../../shared/services/FencingRAG');
const { GoogleCalendarService } = require('../../../shared/services/GoogleCalendarService');
const { MicrosoftCalendarService } = require('../../../shared/services/MicrosoftCalendarService');
const { CompanyInfoService } = require('../../../shared/services/CompanyInfoService');
const { EmailService } = require('../../../shared/services/EmailService');

const router = express.Router();

// Initialize services
const embeddingService = new EmbeddingService();
const fencingRAG = new FencingRAG();
const googleCalendarService = new GoogleCalendarService();
const microsoftCalendarService = new MicrosoftCalendarService();
const companyInfoService = new CompanyInfoService();
const emailService = new EmailService();

// Session storage
const sessions = new Map();

// Helper to get or create session
function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      conversationHistory: [],
      userInfo: { name: null, email: null, collected: false },
      appointmentFlow: { active: false, step: 'none', details: {}, calendarType: null },
      awaitingFollowUp: false,
      createdAt: new Date()
    });
  }
  return sessions.get(sessionId);
}

/**
 * STEP 1: Speech-to-Text (STT)
 * Convert audio to text using Whisper
 */
router.post('/transcribe', async (req, res) => {
  try {
    const { audio, sessionId } = req.body;
    
    if (!audio || !sessionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Audio data and session ID are required' 
      });
    }

    console.log('🎙️ [STT] Transcribing audio for session:', sessionId);

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audio, 'base64');

    // Prepare form data for Whisper API
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: 'audio.webm',
      contentType: 'audio/webm'
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    // Call OpenAI Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [STT] Whisper API error:', errorText);
      return res.status(500).json({ 
        success: false, 
        error: 'Transcription failed',
        details: errorText
      });
    }

    const transcriptionData = await response.json();
    const transcribedText = transcriptionData.text;

    console.log('✅ [STT] Transcribed:', transcribedText);

    res.json({
      success: true,
      text: transcribedText,
      sessionId
    });

  } catch (error) {
    console.error('❌ [STT] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Transcription failed',
      message: error.message
    });
  }
});

/**
 * STEP 2: Text Processing with LLM and Function Calling
 * Process user input, extract info, and generate responses
 */
router.post('/process', async (req, res) => {
  try {
    const { text, sessionId } = req.body;
    
    if (!text || !sessionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Text and session ID are required' 
      });
    }

    console.log('🤖 [LLM] Processing text for session:', sessionId);
    console.log('📝 [LLM] User input:', text);

    const session = getSession(sessionId);
    console.log('🔍 [Debug] Session state - userInfo.collected:', session.userInfo.collected, 'awaitingFollowUp:', session.awaitingFollowUp, 'appointmentFlow.active:', session.appointmentFlow.active);
    
    // Add user message to history
    session.conversationHistory.push({
        role: 'user',
      content: text,
      timestamp: new Date()
    });

    // Determine conversation state
    let systemPrompt = '';
    let needsRAG = false;
    let assistantResponse = '';

    // Check for goodbye/end conversation first (before phase logic)
    const goodbyePatterns = [
      /thank you.*no more/i,
      /that.*all.*need/i,
      /goodbye/i,
      /bye/i,
      /done.*questions/i,
      /satisfied/i,
      /that.*help.*needed/i,
      /that.*all/i
    ];
    
    const isGoodbye = goodbyePatterns.some(pattern => pattern.test(text));
    
    if (isGoodbye) {
      console.log('👋 [Flow] Taking goodbye path');
      const userName = session.userInfo.name || 'there';
      assistantResponse = `Thank you, ${userName}! I hope you were satisfied with SherpaPrompt AI's service. Have a great day!`;
      
      // Send conversation summary email asynchronously (don't wait for it)
      sendConversationSummary(sessionId, session).catch(error => {
        console.error('❌ [Email] Failed to send summary email in goodbye flow:', error);
      });
    } else if (!session.userInfo.collected) {
      console.log('📝 [Flow] Taking name/email collection path');
      // Phase 1: Collect name and email ONLY
      systemPrompt = `You're a friendly voice assistant for SherpaPrompt Fencing Company. Sound natural and conversational.

CRITICAL INSTRUCTIONS:
- ONLY collect name and email - NEVER ask for phone numbers or anything else
- If you have both name and email, respond EXACTLY with: "Thanks [name]! I've got your email as [email]. How can I help you today?"
- If missing info, ask ONLY for the missing piece (name OR email)
- Sound conversational, use contractions (I'll, we're, that's, etc.)
- Keep responses friendly but brief

Your ONLY job is name and email collection.`;

      // Try to extract name and email with improved context handling
      const extractionPrompt = `You are extracting name and email from user speech. Handle these cases carefully:

1. If user is spelling out their email (e.g., "a-z-m-a-i-n at gmail dot com"), convert it properly
2. Convert "at" to "@" and "dot" to "." in emails
3. Handle corrections and clarifications (e.g., "no wait, it's actually...")
4. Ignore filler words like "um", "uh", "so", "basically"
5. If user says "spell" or "let me spell", they're providing spelling

User input: "${text}"

Return ONLY a JSON object like: {"name": "John Doe", "email": "john@example.com", "hasComplete": true, "needsSpelling": false}
- Set needsSpelling to true if the name/email seems unclear or contains unusual characters
- If missing info, set those fields to null and hasComplete to false
- Convert spelled-out emails properly (a-t becomes @, d-o-t becomes .)`;

      try {
        const extractionResponse = await callOpenAI([
          { role: 'system', content: extractionPrompt },
          { role: 'user', content: text }
        ]);

        try {
          const extracted = JSON.parse(extractionResponse);
          if (extracted.name) session.userInfo.name = extracted.name;
          if (extracted.email) session.userInfo.email = extracted.email;
          
          if (extracted.hasComplete && extracted.name && extracted.email) {
            session.userInfo.collected = true;
            assistantResponse = `Thanks ${extracted.name}! I've got your email as ${extracted.email}. How can I help you today?`;
          } else {
            // Generate response asking for missing info with spelling encouragement
            let missingInfo = [];
            if (!session.userInfo.name) missingInfo.push('name');
            if (!session.userInfo.email) missingInfo.push('email address');
            
            if (missingInfo.length === 2) {
              assistantResponse = "I'd be happy to help! Could you please tell me your name and email address? Feel free to spell them out if needed for clarity.";
            } else if (missingInfo.includes('name')) {
              assistantResponse = "Thanks! I still need your name. Please tell me your name, and feel free to spell it out if it's unusual.";
            } else if (missingInfo.includes('email address')) {
              assistantResponse = "Thanks! I still need your email address. Please spell it out letter by letter for accuracy - for example, 'j-o-h-n at g-m-a-i-l dot c-o-m'.";
            }
          }
        } catch (e) {
          console.error('❌ [Extraction] JSON parsing error:', e.message);
          // Try simple pattern matching as fallback
          const nameMatch = text.match(/(?:name.*is|call.*me|i'm)\s+([a-zA-Z\s]+)/i);
          const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
          
          if (nameMatch) session.userInfo.name = nameMatch[1].trim();
          if (emailMatch) session.userInfo.email = emailMatch[1].trim();
          
          if (session.userInfo.name && session.userInfo.email) {
            session.userInfo.collected = true;
            assistantResponse = `Thanks ${session.userInfo.name}! I've got your email as ${session.userInfo.email}. How can I help you today?`;
          } else {
            assistantResponse = "I'd be happy to help! Could you please provide your name and email address so I can assist you better?";
          }
        }
      } catch (openaiError) {
        console.error('❌ [OpenAI] Service unavailable, using fallback extraction:', openaiError.message);
        
        // Fallback: Try simple pattern matching when OpenAI is down
        const nameMatch = text.match(/(?:name.*is|call.*me|i'm)\s+([a-zA-Z\s]+)/i);
        const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
        
        if (nameMatch) session.userInfo.name = nameMatch[1].trim();
        if (emailMatch) session.userInfo.email = emailMatch[1].trim();
        
        if (session.userInfo.name && session.userInfo.email) {
          session.userInfo.collected = true;
          assistantResponse = `Thanks ${session.userInfo.name}! I've got your email as ${session.userInfo.email}. How can I help you today?`;
        } else if (session.userInfo.name) {
          assistantResponse = "Thanks! I still need your email address. Please spell it out letter by letter for accuracy.";
        } else if (session.userInfo.email) {
          assistantResponse = "Thanks! I still need your name. Please tell me your name.";
        } else {
          assistantResponse = "I'm having trouble with my AI service right now, but I can still help! Could you please clearly state your name and email address?";
        }
      }

    } else {
      console.log('🏢 [Flow] Taking main conversation path (Phase 2)');
      // Phase 2: Handle appointments and answer questions
      // Check for appointment requests at any point
      const appointmentPatterns = [
        /set.*appointment/i,
        /schedule.*appointment/i,
        /book.*appointment/i,
        /make.*appointment/i,
        /schedule.*meeting/i,
        /book.*meeting/i,
        /set.*meeting/i,
        /want.*appointment/i,
        /need.*appointment/i,
        /appointment.*please/i,
        /schedule.*consultation/i,
        /book.*consultation/i
      ];

      const isAppointmentRequest = appointmentPatterns.some(pattern => pattern.test(text));
      console.log('🗓️ [Appointment] Checking appointment patterns for:', text);
      console.log('🗓️ [Appointment] Is appointment request:', isAppointmentRequest);

      // Check for name/email change requests during regular conversation
      const nameChangePatterns = [
        /change.*name/i,
        /update.*name/i,
        /my name.*is/i,
        /actually.*name/i,
        /correct.*name/i,
        /wrong.*name/i,
        /name.*should.*be/i,
        /call.*me/i
      ];
      
      const emailChangePatterns = [
        /change.*email/i,
        /update.*email/i,
        /my email.*is/i,
        /actually.*email/i,
        /correct.*email/i,
        /wrong.*email/i,
        /email.*should.*be/i,
        /email.*address.*is/i
      ];

      const isNameChange = nameChangePatterns.some(pattern => pattern.test(text));
      const isEmailChange = emailChangePatterns.some(pattern => pattern.test(text));

      // Handle name/email changes during regular conversation
      if (isNameChange && !session.appointmentFlow.active) {
        console.log('👤 [Name Change] Detected name change request during conversation');
        
        // Extract new name
        const nameExtractionPrompt = `The user wants to change their name. Extract the new name from: "${text}"
        
Handle corrections, spelling, and filler words. Look for patterns like:
- "my name is actually..."
- "call me..."
- "my name should be..."
- "change my name to..."

Return ONLY: {"name": "John Doe"}`;

        try {
          const nameResponse = await callOpenAI([
            { role: 'system', content: nameExtractionPrompt },
            { role: 'user', content: text }
          ]);
          
          const nameData = JSON.parse(nameResponse);
          if (nameData.name) {
            const oldName = session.userInfo.name;
            session.userInfo.name = nameData.name;
            assistantResponse = `Got it! I've updated your name from ${oldName} to ${nameData.name}. How can I help you today?`;
          } else {
            assistantResponse = "I'd be happy to update your name. Could you please tell me what name you'd like me to use? Feel free to spell it out if needed.";
          }
        } catch (e) {
          assistantResponse = "I'd be happy to update your name. Could you please tell me what name you'd like me to use?";
        }
      }
      // Handle email changes during regular conversation  
      else if (isEmailChange && !session.appointmentFlow.active) {
        console.log('📧 [Email Change] Detected email change request during conversation');
        
        // Extract new email
        const emailExtractionPrompt = `The user wants to change their email. Extract ONLY the email address from: "${text}"
        
CRITICAL RULES:
1. Extract ONLY the email address, ignore all other text
2. Handle spelled out emails (e.g., "j-o-h-n at gmail dot com") - convert properly
3. Convert "at" to "@" and "dot" to "."
4. Handle repetitions and clarifications - use the FINAL/CORRECTED email mentioned
5. Ignore filler words like "the email address I want to change to will be", "it is spelled", "let me repeat"
6. Look for patterns like "my email is actually...", "change my email to...", "email should be..."

Examples:
- "The email address I want to change to will be ozmainmorshad03 at gmail.com It is spelled AZMAINMORSHED03 at gmail.com Let me repeat it AZMAINMORSHED03 at gmail.com" → "AZMAINMORSHED03@gmail.com"
- "my email is actually test at yahoo dot com" → "test@yahoo.com"

Return ONLY: {"email": "extracted@email.com"}`;

        try {
          const emailResponse = await callOpenAI([
            { role: 'system', content: emailExtractionPrompt },
            { role: 'user', content: text }
          ]);
          
          const emailData = JSON.parse(emailResponse);
          if (emailData.email) {
            const oldEmail = session.userInfo.email;
            session.userInfo.email = emailData.email;
            console.log('📧 [Email Update] Email updated in session:', { 
              sessionId, 
              oldEmail, 
              newEmail: emailData.email,
              userInfo: session.userInfo 
            });
            assistantResponse = `Perfect! I've updated your email from ${oldEmail} to ${emailData.email}. How can I help you today?`;
          } else {
            assistantResponse = "I'd be happy to update your email. Could you please spell it out letter by letter for accuracy - for example, 'j-o-h-n at g-m-a-i-l dot c-o-m'?";
          }
        } catch (e) {
          assistantResponse = "I'd be happy to update your email. Could you please spell it out letter by letter for accuracy?";
        }
      }
      // Handle active appointment flow
      else if (session.appointmentFlow.active || isAppointmentRequest) {
        console.log('🗓️ [Appointment] Processing appointment request');
        assistantResponse = await handleAppointmentFlow(session, text, isAppointmentRequest);
      } 
      // Handle follow-up after previous query (asking for more questions or appointment)
      else if (session.awaitingFollowUp) {
        console.log('⏳ [Follow-up] Processing follow-up response');
        const wantsMoreQuestions = /yes|more|another|other|question/i.test(text);
        const wantsAppointment = /appointment|schedule|meeting|consultation|book/i.test(text);
        
        // First check if it's an appointment request (even in follow-up)
        if (isAppointmentRequest) {
          console.log('🗓️ [Follow-up → Appointment] Detected appointment request in follow-up');
          session.appointmentFlow.active = true;
          session.appointmentFlow.step = 'collect_title';
          session.awaitingFollowUp = false;
          assistantResponse = "Great! I'd be happy to help you schedule an appointment. Just so you know, all appointments are 30 minutes and we're available Monday through Friday from 12:00 PM to 4:00 PM. What type of service are you looking for? Like a fence consultation, repair estimate, or installation quote?";
        }
        // Check if it's a company info query (even in follow-up)
        else if (companyInfoService.isCompanyInfoQuery(text)) {
          console.log('🏢 [Follow-up → Company Info] Detected company info query in follow-up');
          assistantResponse = companyInfoService.getCompanyInfo(text);
          assistantResponse += " Is there anything else you'd like to know, or would you like to schedule an appointment?";
          // Keep awaitingFollowUp = true
        }
        // Check for general follow-up responses
        else if (wantsAppointment) {
          session.appointmentFlow.active = true;
          session.appointmentFlow.step = 'collect_title';
          session.awaitingFollowUp = false;
          assistantResponse = "Great! I'd be happy to help you schedule an appointment. Just so you know, all appointments are 30 minutes and we're available Monday through Friday from 12:00 PM to 4:00 PM. What type of service are you looking for? Like a fence consultation, repair estimate, or installation quote?";
        } else if (wantsMoreQuestions) {
          session.awaitingFollowUp = false;
          assistantResponse = "Of course! What else would you like to know about our fencing services?";
        } else {
          // It's a new question - process it normally
          console.log('⏳ [Follow-up → New Question] Processing as new question');
          session.awaitingFollowUp = false;
          
          // Check company info first
          if (companyInfoService.isCompanyInfoQuery(text)) {
            console.log('🏢 [Company Info] Detected company information query');
            assistantResponse = companyInfoService.getCompanyInfo(text);
            assistantResponse += " Is there anything else you'd like to know, or would you like to schedule an appointment?";
            session.awaitingFollowUp = true;
          } else {
            // Process with RAG
            needsRAG = true;
            const searchTerms = extractSearchTerms(text);
            let contextInfo = '';

            if (searchTerms.length > 0) {
              console.log('🔍 [RAG] Searching for:', searchTerms);
              const searchResults = await embeddingService.searchSimilarContent(searchTerms.join(' '), 5);
              
              if (searchResults && searchResults.length > 0) {
                contextInfo = fencingRAG.formatContext(searchResults);
                console.log('📚 [RAG] Found relevant info from', searchResults.length, 'sources');
              }
            }

            if (contextInfo) {
              const ragResponse = await fencingRAG.generateResponse(text, contextInfo, session.conversationHistory);
              assistantResponse = ragResponse.answer;
            } else {
              if (companyInfoService.isCompanyInfoQuery(text)) {
                assistantResponse = companyInfoService.getCompanyInfo(text);
              } else {
                const systemPrompt = `You're a friendly voice assistant for SherpaPrompt Fencing Company. Chat naturally and conversationally - use contractions and sound human, not robotic.`;
                const messages = [
                  { role: 'system', content: systemPrompt },
                  ...session.conversationHistory.slice(-6),
                ];
                assistantResponse = await callOpenAI(messages);
              }
            }
            
            assistantResponse += " Is there anything else you'd like to know, or would you like to schedule an appointment?";
            session.awaitingFollowUp = true;
          }
        }
      }
      // Regular Q&A with RAG
      else {
        console.log('📋 [Regular Q&A] Processing regular query');
        needsRAG = true;

        // Check if this is a company info query first
        console.log('🔍 [Company Info] Checking if query is company info:', text);
        if (companyInfoService.isCompanyInfoQuery(text)) {
          console.log('🏢 [Company Info] Detected company information query');
          assistantResponse = companyInfoService.getCompanyInfo(text);
          
          // Add follow-up question
          assistantResponse += " Is there anything else you'd like to know, or would you like to schedule an appointment?";
          session.awaitingFollowUp = true;
        } else {
          console.log('🚫 [Company Info] Not a company info query, proceeding to RAG');
          systemPrompt = `You're a friendly voice assistant for SherpaPrompt Fencing Company. Chat naturally with customers like you're having a real conversation.

User: ${session.userInfo.name} (${session.userInfo.email})

Guidelines:
- Sound conversational and human, not robotic or formal
- Use contractions (I'll, we're, that's, etc.) and casual language
- Answer what they're asking without being overly wordy
- Don't sound like you're reading from a script
- Avoid formal phrases like "I would be happy to assist" - just help them naturally
- If user says goodbye, thank them casually and mention you hope we could help`;

          // Search knowledge base
          const searchTerms = extractSearchTerms(text);
          let contextInfo = '';

          if (searchTerms.length > 0) {
            console.log('🔍 [RAG] Searching for:', searchTerms);
            const searchResults = await embeddingService.searchSimilarContent(searchTerms.join(' '), 5);
            
            if (searchResults && searchResults.length > 0) {
              contextInfo = fencingRAG.formatContext(searchResults);
              console.log('📚 [RAG] Found relevant info from', searchResults.length, 'sources');
            }
          } else {
            // If no specific keywords found, try a general search with the full text
            console.log('🔍 [RAG] No specific keywords found, searching with full text');
            const searchResults = await embeddingService.searchSimilarContent(text, 3);
            
            if (searchResults && searchResults.length > 0) {
              contextInfo = fencingRAG.formatContext(searchResults);
              console.log('📚 [RAG] Found relevant info from general search:', searchResults.length, 'sources');
            }
          }

          // Generate response with context using FencingRAG
          if (contextInfo) {
            const ragResponse = await fencingRAG.generateResponse(text, contextInfo, session.conversationHistory);
            assistantResponse = ragResponse.answer;
          } else {
            // Fallback to company info if no RAG results
            if (companyInfoService.isCompanyInfoQuery(text)) {
              assistantResponse = companyInfoService.getCompanyInfo(text);
            } else {
              // Final fallback to basic OpenAI response
              const messages = [
                { role: 'system', content: systemPrompt },
                ...session.conversationHistory.slice(-6),
              ];
              assistantResponse = await callOpenAI(messages);
            }
          }

          // Add follow-up question after first complete response
          if (!session.awaitingFollowUp && session.conversationHistory.filter(msg => msg.role === 'assistant').length === 0) {
            assistantResponse += " Is there anything else you'd like to know, or would you like to schedule an appointment?";
            session.awaitingFollowUp = true;
          }
        }
      }
    }

    // Add assistant response to history
    session.conversationHistory.push({
      role: 'assistant',
      content: assistantResponse,
      timestamp: new Date()
    });

    console.log('✅ [LLM] Generated response:', assistantResponse);

    res.json({
      success: true,
      response: assistantResponse,
      sessionId,
      userInfo: session.userInfo,
      hadFunctionCalls: needsRAG,
      conversationHistory: session.conversationHistory,
      calendarLink: session.lastAppointment?.calendarLink || null,
      appointmentDetails: session.lastAppointment?.details || null
    });

  } catch (error) {
    console.error('❌ [LLM] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Processing failed',
      message: error.message
    });
  }
});

/**
 * STEP 3: Text-to-Speech (TTS)
 * Convert response text to audio
 */
router.post('/synthesize', async (req, res) => {
  try {
    const { text, sessionId } = req.body;
    
    if (!text || !sessionId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Text and session ID are required' 
      });
    }

    console.log('🔊 [TTS] Converting to speech for session:', sessionId);
    console.log('📝 [TTS] Text:', text.substring(0, 100) + '...');

    // Call OpenAI TTS API
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'alloy',
        input: text,
        response_format: 'mp3'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [TTS] OpenAI TTS error:', errorText);
      return res.status(500).json({ 
        success: false, 
        error: 'Speech synthesis failed',
        details: errorText
      });
    }

    const audioBuffer = await response.buffer();
    const audioBase64 = audioBuffer.toString('base64');

    console.log('✅ [TTS] Generated audio:', audioBuffer.length, 'bytes');

    res.json({
      success: true,
      audio: audioBase64,
      sessionId
    });

  } catch (error) {
    console.error('❌ [TTS] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Speech synthesis failed',
      message: error.message
    });
  }
});

/**
 * Get the appropriate calendar service based on user's choice
 */
function getCalendarService(calendarType) {
  if (calendarType === 'microsoft') {
    return microsoftCalendarService;
  } else {
    return googleCalendarService; // Default to Google Calendar
  }
}

/**
 * Handle appointment scheduling flow
 */
async function handleAppointmentFlow(session, text, isAppointmentRequest) {
  try {
    // Initialize appointment flow if new request
    if (isAppointmentRequest && !session.appointmentFlow.active) {
      session.appointmentFlow.active = true;
      session.appointmentFlow.step = 'select_calendar';
      session.appointmentFlow.details = {};
      session.appointmentFlow.calendarType = null;
      session.awaitingFollowUp = false;
      return "Great! I'd be happy to help you schedule an appointment. First, would you like me to add this to your Google Calendar or Microsoft Calendar? Just say 'Google' or 'Microsoft'.";
    }

    const step = session.appointmentFlow.step;
    const details = session.appointmentFlow.details;

    switch (step) {
      case 'select_calendar':
        // Handle calendar selection
        const calendarChoice = text.toLowerCase().trim();
        if (calendarChoice.includes('google')) {
          session.appointmentFlow.calendarType = 'google';
          session.appointmentFlow.step = 'collect_title';
          return "Perfect! I'll add it to your Google Calendar. What type of service are you looking for? Like a fence consultation, repair estimate, or installation quote?";
        } else if (calendarChoice.includes('microsoft') || calendarChoice.includes('outlook')) {
          session.appointmentFlow.calendarType = 'microsoft';
          session.appointmentFlow.step = 'collect_title';
          return "Perfect! I'll add it to your Microsoft Calendar. What type of service are you looking for? Like a fence consultation, repair estimate, or installation quote?";
        } else {
          return "I didn't catch that. Would you like to use Google Calendar or Microsoft Calendar for your appointment? Please say 'Google' or 'Microsoft'.";
        }

      case 'collect_title':
        // Extract service type from user input with better context understanding
        const serviceExtractionPrompt = `You are extracting the FINAL service type the user wants from their speech. Pay attention to corrections and final intent.

User said: "${text}"

CRITICAL RULES:
1. If user corrects themselves (e.g., "no wait, actually I need repair"), use the FINAL/CORRECTED service only
2. Ignore filler words: "um", "uh", "so", "basically", "I need", "I want", "never mind"
3. Look for keywords: "installation", "repair", "consultation", "estimate", "quote", "gate", "maintenance", "emergency"
4. If user says multiple services, pick the LAST one mentioned (that's usually their correction)
5. Map to these exact service names:
   - "Fence consultation" (for consultations, general questions, advice)
   - "Fence installation" (for new fence installation)
   - "Fence repair" (for fixing existing fences)
   - "Fence estimate" (for quotes, pricing, estimates)
   - "Gate installation" (for new gate installation)
   - "Gate repair" (for fixing gates)
   - "Fence maintenance" (for upkeep, cleaning, staining)
   - "Emergency fence repair" (for urgent repairs)

Examples:
- "um I need installation code" → "Fence installation"
- "no wait I think I need never mind so basically I need to know your service areas" → "Fence consultation"
- "I want repair estimate for my fence" → "Fence estimate"

Return ONLY: {"service": "Fence consultation"}`;

        try {
          const serviceResponse = await callOpenAI([
            { role: 'system', content: serviceExtractionPrompt },
            { role: 'user', content: text }
          ]);
          
          const serviceData = JSON.parse(serviceResponse);
          if (serviceData.service && serviceData.service !== text.trim()) {
            details.title = serviceData.service;
            console.log(`🎯 [Service] Extracted "${serviceData.service}" from "${text}"`);
          } else {
            // Better fallback - try to match keywords
            const lowerText = text.toLowerCase();
            if (lowerText.includes('install') && !lowerText.includes('repair')) {
              details.title = lowerText.includes('gate') ? 'Gate installation' : 'Fence installation';
            } else if (lowerText.includes('repair')) {
              details.title = lowerText.includes('gate') ? 'Gate repair' : 'Fence repair';
            } else if (lowerText.includes('estimate') || lowerText.includes('quote') || lowerText.includes('price')) {
              details.title = 'Fence estimate';
            } else if (lowerText.includes('maintenance') || lowerText.includes('stain') || lowerText.includes('clean')) {
              details.title = 'Fence maintenance';
            } else if (lowerText.includes('emergency')) {
              details.title = 'Emergency fence repair';
            } else {
              details.title = 'Fence consultation';
            }
            console.log(`🎯 [Service] Fallback extracted "${details.title}" from "${text}"`);
          }
        } catch (e) {
          // Final fallback - default to consultation
          details.title = 'Fence consultation';
          console.log(`🎯 [Service] Error fallback to "Fence consultation" from "${text}"`);
        }
        
        // Check if we already have date/time information (from previous appointment setup)
        if (details.date && details.time) {
          // We have all info, go directly to review
          session.appointmentFlow.step = 'review';
          return `Perfect! I've updated your service to ${details.title}. Let me review your appointment details:

Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay || details.time} (30 minutes)
Customer: ${session.userInfo.name} (${session.userInfo.email})

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change (service, date, time, name, or email).`;
        } else {
          // Need to collect date
          session.appointmentFlow.step = 'collect_date';
          return `Perfect! I'll schedule a ${details.title} for you. Please note that all appointments are 30 minutes long and available Monday through Friday from 12:00 PM to 4:00 PM. What date would work best? Please provide the date in format like "December 15, 2024" or "2024-12-15".`;
        }

      case 'collect_date':
        // Parse and validate date
        const dateResult = parseDateFromText(text);
        if (!dateResult.success) {
          return `I'm having trouble understanding that date format. Could you please provide the date like "December 15, 2024" or "2024-12-15"?`;
        }
        
        // Check if it's a business day and find available slots
        console.log('📅 Checking availability for date:', dateResult.date);
        const calendarService = getCalendarService(session.appointmentFlow.calendarType);
        const slotsResult = await calendarService.findAvailableSlots(dateResult.date);
        
        if (!slotsResult.success) {
          return `I'm sorry, there was an error checking availability for that date. Please try another date or call us at (303) 555-FENCE.`;
        }
        
        if (slotsResult.availableSlots.length === 0) {
          // No slots available, suggest next available
          console.log('❌ No slots available, finding next available date');
          const nextAvailable = await calendarService.findNextAvailableSlot(dateResult.date);
          
          if (nextAvailable.success) {
            const firstSlots = nextAvailable.availableSlots.slice(0, 3); // Show first 3 slots
            const slotsText = firstSlots.map(slot => slot.display).join(', ');
            
            // Store the next available date and slots for time selection
            details.date = nextAvailable.date;
            details.availableSlots = nextAvailable.availableSlots;
            session.appointmentFlow.step = 'collect_time';
            
            return `I'm sorry, but ${dateResult.formatted} has no available appointment slots. The next available date is ${nextAvailable.formattedDate} with slots at: ${slotsText}. Which time works best for you?`;
          } else {
            return `I'm sorry, but ${dateResult.formatted} has no available slots, and I couldn't find any available appointments in the next two weeks. Please call us at (303) 555-FENCE to discuss alternative scheduling options.`;
          }
        }
        
        // Store date and available slots
        details.date = dateResult.date;
        details.availableSlots = slotsResult.availableSlots;
        session.appointmentFlow.step = 'collect_time';
        
        // Show available time slots
        const slotsText = slotsResult.availableSlots.map(slot => slot.display).join(', ');
        return `Great! ${dateResult.formatted} has ${slotsResult.availableSlots.length} available 30-minute slots: ${slotsText}. Which time works best for you?`;

      case 'collect_time':
        // First check if user is providing a different date instead of time
        const datePatterns = [
          /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}/i,
          /\b\d{4}-\d{1,2}-\d{1,2}\b/,
          /\b\d{1,2}\/\d{1,2}\/\d{4}\b/,
          /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2},?\s+\d{4}/i,
          /\b\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}/i
        ];
        
        const isDateProvided = datePatterns.some(pattern => pattern.test(text));
        
        if (isDateProvided) {
          // User wants to change the date, go back to date collection
          session.appointmentFlow.step = 'collect_date';
          const serviceTitle = details.title;
          session.appointmentFlow.details = { title: serviceTitle };
          return `I understand you'd like to change the date. What date would work best for your ${serviceTitle}? Please provide the date in format like "December 15, 2024" or "2024-12-15".`;
        }
        
        // Find the selected time slot
        const selectedSlot = findSelectedTimeSlot(text, details.availableSlots);
        
        if (!selectedSlot) {
          const slotsText = details.availableSlots.map(slot => slot.display).join(', ');
          return `I couldn't match that to one of the available times. Please choose from: ${slotsText}`;
        }
        
        details.time = selectedSlot.start;
        details.timeDisplay = selectedSlot.display;
        session.appointmentFlow.step = 'review';
        
        // Show review details
        return `Perfect! Let me review your appointment details:

Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay} (30 minutes)
Customer: ${session.userInfo.name} (${session.userInfo.email})

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change (service, date, time, name, or email).`;

      case 'review':
        // Handle review responses
        const looksGoodPatterns = [/sounds good/i, /good/i, /correct/i, /yes/i, /confirm/i, /schedule/i, /book/i, /go ahead/i, /looks good/i, /perfect/i];
        const changeServicePatterns = [/change.*service/i, /different.*service/i, /service/i];
        const changeDatePatterns = [/change.*date/i, /different.*date/i, /date/i];
        const changeTimePatterns = [/change.*time/i, /different.*time/i, /time/i];
        const changeNamePatterns = [/change.*name/i, /different.*name/i, /name/i];
        const changeEmailPatterns = [/change.*email/i, /different.*email/i, /email/i];
        
        // First check if user is making a direct change with the new value in the same message
        const directChangePatterns = {
          service: /change.*service.*to\s+(.+)|service.*should.*be\s+(.+)|make.*it\s+(.+)\s+instead/i,
          date: /change.*date.*to\s+(.+)|date.*should.*be\s+(.+)|make.*it\s+(.+)\s+instead/i,
          time: /change.*time.*to\s+(.+)|time.*should.*be\s+(.+)|make.*it\s+(.+)\s+instead/i,
          name: /change.*name.*to\s+(.+)|name.*should.*be\s+(.+)|call.*me\s+(.+)/i,
          email: /change.*email.*to\s+(.+)|email.*should.*be\s+(.+)/i
        };

        // Track multiple changes made in this message
        let changesApplied = [];
        let hasMultipleChanges = false;

        // Check for direct service change
        const serviceMatch = text.match(directChangePatterns.service);
        if (serviceMatch) {
          hasMultipleChanges = changesApplied.length > 0;
          const newService = (serviceMatch[1] || serviceMatch[2] || serviceMatch[3]).trim();
          
          // Extract and validate service type
          const serviceExtractionPrompt = `Extract and standardize the service type from: "${newService}"

Map to these exact service names:
- "Fence consultation" (for consultations, general questions, advice)
- "Fence installation" (for new fence installation)
- "Fence repair" (for fixing existing fences)
- "Fence estimate" (for quotes, pricing, estimates)
- "Gate installation" (for new gate installation)
- "Gate repair" (for fixing gates)
- "Fence maintenance" (for upkeep, cleaning, staining)
- "Emergency fence repair" (for urgent repairs)

Return ONLY: {"service": "Fence consultation"}`;

          try {
            const serviceResponse = await callOpenAI([
              { role: 'system', content: serviceExtractionPrompt },
              { role: 'user', content: newService }
            ]);
            
            const serviceData = JSON.parse(serviceResponse);
            if (serviceData.service) {
              details.title = serviceData.service;
              console.log(`🎯 [Direct Service Change] Updated to "${serviceData.service}" from "${newService}"`);
              
              changesApplied.push(`service to ${serviceData.service}`);
              
              // If this is the only change, return immediately
              if (!hasMultipleChanges) {
                return `Perfect! I've updated your service to ${serviceData.service}. Let me review your appointment details:

Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay || details.time} (30 minutes)
Customer: ${session.userInfo.name} (${session.userInfo.email})

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change (service, date, time, name, or email).`;
              }
            }
          } catch (e) {
            console.log('🎯 [Direct Service Change] Extraction failed, using fallback');
          }
        }

        // Check for direct date change
        const dateMatch = text.match(directChangePatterns.date);
        if (dateMatch) {
          hasMultipleChanges = changesApplied.length > 0;
          const newDateText = (dateMatch[1] || dateMatch[2] || dateMatch[3]).trim();
          
          const dateResult = parseDateFromText(newDateText);
          if (dateResult.success) {
            // Check availability for new date
            const calendarService = getCalendarService(session.appointmentFlow.calendarType);
            const slotsResult = await calendarService.findAvailableSlots(dateResult.date);
            
            if (slotsResult.success && slotsResult.availableSlots.length > 0) {
              details.date = dateResult.date;
              details.availableSlots = slotsResult.availableSlots;
              // Keep existing time if it's still available, otherwise clear it
              const timeStillAvailable = slotsResult.availableSlots.some(slot => slot.start === details.time);
              if (!timeStillAvailable) {
                delete details.time;
                delete details.timeDisplay;
                session.appointmentFlow.step = 'collect_time';
                const slotsText = slotsResult.availableSlots.map(slot => slot.display).join(', ');
                return `Perfect! I've updated your date to ${dateResult.formatted}. Your previous time is no longer available. Here are the available times: ${slotsText}. Which time works best for you?`;
              }
              
              console.log(`📅 [Direct Date Change] Updated to "${dateResult.formatted}"`);
              
              changesApplied.push(`date to ${dateResult.formatted}`);
              
              // If this is the only change, return immediately
              if (!hasMultipleChanges) {
                return `Perfect! I've updated your date to ${dateResult.formatted}. Let me review your appointment details:

Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay || details.time} (30 minutes)
Customer: ${session.userInfo.name} (${session.userInfo.email})

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change (service, date, time, name, or email).`;
              }
            } else {
              return `I've checked ${dateResult.formatted}, but there are no available appointment slots on that date. Please choose a different date or let me know if you'd like me to suggest alternative dates.`;
            }
          }
        }

        // Check for direct time change
        const timeMatch = text.match(directChangePatterns.time);
        if (timeMatch) {
          hasMultipleChanges = changesApplied.length > 0;
          const newTimeText = (timeMatch[1] || timeMatch[2] || timeMatch[3]).trim();
          
          if (details.availableSlots) {
            const selectedSlot = findSelectedTimeSlot(newTimeText, details.availableSlots);
            if (selectedSlot) {
              details.time = selectedSlot.start;
              details.timeDisplay = selectedSlot.display;
              
              console.log(`🕐 [Direct Time Change] Updated to "${selectedSlot.display}"`);
              
              changesApplied.push(`time to ${selectedSlot.display}`);
              
              // If this is the only change, return immediately
              if (!hasMultipleChanges) {
                return `Perfect! I've updated your time to ${selectedSlot.display}. Let me review your appointment details:

Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay} (30 minutes)
Customer: ${session.userInfo.name} (${session.userInfo.email})

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change (service, date, time, name, or email).`;
              }
            } else {
              const slotsText = details.availableSlots.map(slot => slot.display).join(', ');
              return `I couldn't match "${newTimeText}" to one of the available times. Please choose from: ${slotsText}`;
            }
          }
        }

        // Check for direct name change
        const nameMatch = text.match(directChangePatterns.name);
        if (nameMatch) {
          hasMultipleChanges = changesApplied.length > 0;
          const newNameText = (nameMatch[1] || nameMatch[2] || nameMatch[3]).trim();
          
          // Extract and clean the name with better parsing for spelled-out names
          const nameExtractionPrompt = `Extract the person's name from this text: "${newNameText}"

CRITICAL RULES:
1. Extract ONLY the person's name, ignore all other text
2. Handle spelled out names (e.g., "J-O-H-N S-M-I-T-H" → "John Smith")
3. Handle corrections and clarifications - use the FINAL/CORRECTED name mentioned
4. Ignore filler words like "it is spelled", "let me spell that", "the name should be"
5. Convert spelled-out letters to proper capitalization
6. Handle both first and last names if provided

Examples:
- "change my name to J-O-H-N S-M-I-T-H" → "John Smith"
- "call me M-A-R-Y" → "Mary"
- "my name should be Robert Johnson" → "Robert Johnson"
- "it's spelled D-O-U-G" → "Doug"

Return ONLY: {"name": "Extracted Name", "confidence": "high"}
Set confidence to "low" if the name seems unclear.`;

          try {
            const nameResponse = await callOpenAI([
              { role: 'system', content: nameExtractionPrompt },
              { role: 'user', content: newNameText }
            ]);
            
            const nameData = JSON.parse(nameResponse);
            if (nameData.name && nameData.name.trim().length > 0) {
              session.userInfo.name = nameData.name;
              console.log(`👤 [Direct Name Change] Updated to "${nameData.name}" from "${newNameText}"`);
              
              changesApplied.push(`name to ${nameData.name}`);
              
              // If this is the only change, return immediately
              if (!hasMultipleChanges) {
                return `Perfect! I've updated your name to ${nameData.name}. Let me review your appointment details:

Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay || details.time} (30 minutes)
Customer: ${session.userInfo.name} (${session.userInfo.email})

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change (service, date, time, name, or email).`;
              }
            }
          } catch (e) {
            console.log('👤 [Direct Name Change] Extraction failed, using fallback');
            // Fallback to simple name extraction
            if (newNameText && newNameText.length > 0) {
              session.userInfo.name = newNameText;
              console.log(`👤 [Direct Name Change] Fallback updated to "${newNameText}"`);
              
              changesApplied.push(`name to ${newNameText}`);
              
              // If this is the only change, return immediately
              if (!hasMultipleChanges) {
                return `Perfect! I've updated your name to ${newNameText}. Let me review your appointment details:

Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay || details.time} (30 minutes)
Customer: ${session.userInfo.name} (${session.userInfo.email})

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change (service, date, time, name, or email).`;
              }
            }
          }
        }

        // Check for direct email change
        const emailMatch = text.match(directChangePatterns.email);
        if (emailMatch) {
          hasMultipleChanges = changesApplied.length > 0;
          const newEmailText = (emailMatch[1] || emailMatch[2]).trim();
          
          const directEmailExtractionPrompt = `Extract ONLY the email address from: "${newEmailText}"

CRITICAL RULES:
1. Extract ONLY the email address, ignore all other text
2. Handle spelled out emails (convert "at" to "@", "dot" to ".")
3. Handle letter-by-letter spelling (e.g., "j-o-h-n at g-m-a-i-l dot c-o-m" → "john@gmail.com")
4. Handle repetitions and clarifications - use the FINAL/CORRECTED email mentioned
5. Ignore filler words like "it is spelled", "let me spell that", "the email should be"
6. Convert to lowercase for consistency

Examples:
- "change my email to j-o-h-n at g-m-a-i-l dot c-o-m" → "john@gmail.com"
- "email should be A-Z-M-A-I-N-M-O-R-S-H-E-D-0-3 at gmail dot com" → "azmainmorshed03@gmail.com"
- "it's spelled test at yahoo dot com" → "test@yahoo.com"

Return ONLY: {"email": "extracted@email.com"}`;

          try {
            const emailResponse = await callOpenAI([
              { role: 'system', content: directEmailExtractionPrompt },
              { role: 'user', content: newEmailText }
            ]);
            
            const emailData = JSON.parse(emailResponse);
            if (emailData.email) {
              const oldEmail = session.userInfo.email;
              session.userInfo.email = emailData.email;
              console.log('📧 [Direct Email Change] Updated email:', { 
                sessionId, 
                oldEmail, 
                newEmail: emailData.email
              });
              
              changesApplied.push(`email to ${emailData.email}`);
              
              // If this is the only change, return immediately
              if (!hasMultipleChanges) {
                return `Perfect! I've updated your email to ${emailData.email}. Let me review your appointment details:

Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay || details.time} (30 minutes)
Customer: ${session.userInfo.name} (${session.userInfo.email})

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change (service, date, time, name, or email).`;
              }
            }
          } catch (e) {
            console.log('📧 [Direct Email Change] GPT extraction failed, trying regex fallback');
            
            // Fallback to regex extraction for spelled-out emails
            let extractedEmail = null;
            
            // Pattern 1: Standard email format
            const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
            const emailMatch = newEmailText.match(emailRegex);
            
            if (emailMatch) {
              extractedEmail = emailMatch[1].toLowerCase();
            } else {
              // Pattern 2: Spelled out email (convert "at" to "@" and "dot" to ".")
              const spelledOutRegex = /([a-zA-Z0-9._-]+)\s+at\s+([a-zA-Z0-9.-]+)\s+dot\s+([a-zA-Z]{2,})/i;
              const spelledMatch = newEmailText.match(spelledOutRegex);
              
              if (spelledMatch) {
                extractedEmail = `${spelledMatch[1]}@${spelledMatch[2]}.${spelledMatch[3]}`.toLowerCase();
              } else {
                // Pattern 3: Letter-by-letter spelled email (e.g., "j-o-h-n at g-m-a-i-l dot c-o-m")
                const letterSpelledRegex = /([a-zA-Z0-9-]+)\s+at\s+([a-zA-Z0-9-]+)\s+dot\s+([a-zA-Z]{2,})/i;
                const letterMatch = newEmailText.match(letterSpelledRegex);
                
                if (letterMatch) {
                  const username = letterMatch[1].replace(/-/g, '');
                  const domain = letterMatch[2].replace(/-/g, '');
                  const extension = letterMatch[3];
                  extractedEmail = `${username}@${domain}.${extension}`.toLowerCase();
                } else {
                  // Pattern 4: Handle cases like "azmainmorshed03 at gmail.com" (without dashes)
                  const simpleSpelledRegex = /([a-zA-Z0-9]+)\s+at\s+([a-zA-Z0-9.]+)/i;
                  const simpleMatch = newEmailText.match(simpleSpelledRegex);
                  
                  if (simpleMatch) {
                    extractedEmail = `${simpleMatch[1]}@${simpleMatch[2]}`.toLowerCase();
                  }
                }
              }
            }
            
            if (extractedEmail) {
              const oldEmail = session.userInfo.email;
              session.userInfo.email = extractedEmail;
              console.log('📧 [Direct Email Change] Regex extraction successful:', { 
                sessionId, 
                oldEmail, 
                newEmail: extractedEmail
              });
              
              changesApplied.push(`email to ${extractedEmail}`);
              
              // If this is the only change, return immediately
              if (!hasMultipleChanges) {
                return `Perfect! I've updated your email to ${extractedEmail}. Let me review your appointment details:

Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay || details.time} (30 minutes)
Customer: ${session.userInfo.name} (${session.userInfo.email})

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change (service, date, time, name, or email).`;
              }
            } else {
              console.log('📧 [Direct Email Change] All extraction methods failed');
            }
          }
        }

        // If multiple changes were applied, show summary
        if (changesApplied.length > 0) {
          const changesList = changesApplied.join(', ');
          return `Perfect! I've updated your ${changesList}. Let me review your appointment details:

Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay || details.time} (30 minutes)
Customer: ${session.userInfo.name} (${session.userInfo.email})

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change (service, date, time, name, or email).`;
        }

        // If no direct changes detected, proceed with original logic
        if (looksGoodPatterns.some(pattern => pattern.test(text))) {
          // Create the appointment directly - no double confirmation needed
          console.log('📅 Creating calendar appointment with details:', details);
          
          const calendarService = getCalendarService(session.appointmentFlow.calendarType);
          const appointmentResult = await calendarService.createAppointment(
            {
              title: details.title,
              description: `Scheduled via SherpaPrompt AI Assistant`,
              date: details.date,
              time: details.time,
              duration: 30 // 30 minutes
            },
            session.userInfo.email,
            session.userInfo.name
          );

          // Reset appointment flow
          session.appointmentFlow.active = false;
          session.appointmentFlow.step = 'none';
          session.appointmentFlow.details = {};

          if (appointmentResult.success) {
            // Store calendar link in session for UI access
            session.lastAppointment = {
              calendarLink: appointmentResult.eventLink,
              eventId: appointmentResult.eventId,
              details: details
            };
            
            const calendarName = session.appointmentFlow.calendarType === 'microsoft' ? 'Microsoft Calendar' : 'Google Calendar';
            return `Excellent! Your appointment has been scheduled successfully in ${calendarName}. 

Appointment Details:
- Service: ${details.title}  
- Date & Time: ${details.date} at ${details.timeDisplay || details.time}
- Duration: 30 minutes
- Customer: ${session.userInfo.name} (${session.userInfo.email})
- Calendar: ${calendarName}

Our team will contact you at ${session.userInfo.email} to confirm the appointment details and provide any additional information you may need.

Is there anything else I can help you with today?`;
          } else {
            console.error('Calendar appointment creation failed:', appointmentResult.error);
            return `I apologize, but there was an issue creating your calendar appointment. Please call us directly at (303) 555-FENCE to schedule your appointment, or try again later. Our team will be happy to help you schedule your ${details.title}.`;
          }
        } else if (changeServicePatterns.some(pattern => pattern.test(text))) {
          // Go back to service collection but keep date/time if available
          const currentDate = details.date;
          const currentTime = details.time;
          const currentTimeDisplay = details.timeDisplay;
          const currentAvailableSlots = details.availableSlots;
          
          session.appointmentFlow.step = 'collect_title';
          session.appointmentFlow.details = {
            // Preserve existing date/time info if available
            ...(currentDate && { date: currentDate }),
            ...(currentTime && { time: currentTime }),
            ...(currentTimeDisplay && { timeDisplay: currentTimeDisplay }),
            ...(currentAvailableSlots && { availableSlots: currentAvailableSlots })
          };
          return "No problem! What type of service are you interested in? For example: fence consultation, repair estimate, or installation quote.";
        } else if (changeDatePatterns.some(pattern => pattern.test(text))) {
          // Go back to date collection
          session.appointmentFlow.step = 'collect_date';
          // Keep service but reset date/time details
          const serviceTitle = details.title;
          session.appointmentFlow.details = { title: serviceTitle };
          return `No problem! What date would work best for your ${serviceTitle}? Please provide the date in format like "December 15, 2024" or "2024-12-15".`;
        } else if (changeTimePatterns.some(pattern => pattern.test(text))) {
          // Go back to time selection with same date
          session.appointmentFlow.step = 'collect_time';
          // Keep service and date, reset time
          const serviceTitle = details.title;
          const appointmentDate = details.date;
          const availableSlots = details.availableSlots;
          session.appointmentFlow.details = { 
            title: serviceTitle, 
            date: appointmentDate, 
            availableSlots: availableSlots 
          };
          const slotsText = availableSlots.map(slot => slot.display).join(', ');
          return `No problem! Here are the available times for ${appointmentDate}: ${slotsText}. Which time works best for you?`;
        } else if (changeNamePatterns.some(pattern => pattern.test(text))) {
          // Change name - set up to collect new name
          session.appointmentFlow.step = 'collect_name';
          return `No problem! What name should I use for this appointment? Feel free to spell it out if it's unusual.`;
        } else if (changeEmailPatterns.some(pattern => pattern.test(text))) {
          // No email provided directly, ask for it
          session.appointmentFlow.step = 'collect_email';
          return `No problem! What email address should I use for this appointment? Please spell it out letter by letter for accuracy - for example, 'j-o-h-n at g-m-a-i-l dot c-o-m'.`;
        } else {
          return `I didn't catch what you'd like to change. Please say "sounds good" to confirm the appointment, or tell me specifically what you'd like to change: "service", "date", "time", "name", or "email".`;
        }

      case 'collect_name':
        // Extract and clean the name with better parsing
        const nameExtractionPrompt = `Extract the person's name from this text: "${text}"
        
Handle spelling, corrections, and filler words. If they're spelling it out, reconstruct it properly.
Return ONLY a JSON object: {"name": "John Doe", "confidence": "high"}
Set confidence to "low" if the name seems unclear.`;

        try {
          const nameResponse = await callOpenAI([
            { role: 'system', content: nameExtractionPrompt },
            { role: 'user', content: text }
          ]);
          
          const nameData = JSON.parse(nameResponse);
          if (nameData.name) {
            session.userInfo.name = nameData.name;
            session.appointmentFlow.step = 'review';
            return `Perfect! I've updated the name to ${nameData.name}. Let me review your appointment details:

Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay || details.time} (30 minutes)
Customer: ${session.userInfo.name} (${session.userInfo.email})

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change (service, date, time, name, or email).`;
          }
        } catch (e) {
          // Fallback to simple extraction
          const newName = text.trim();
          session.userInfo.name = newName;
        }
        
        session.appointmentFlow.step = 'review';
        return `Perfect! I've updated the name to ${session.userInfo.name}. Let me review your appointment details:

Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay || details.time} (30 minutes)
Customer: ${session.userInfo.name} (${session.userInfo.email})

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change (service, date, time, name, or email).`;

      case 'collect_email':
        // Extract and clean the email with better parsing
        const emailExtractionPrompt = `Extract ONLY the email address from this text: "${text}"

CRITICAL RULES:
1. Extract ONLY the email address, ignore all other text
2. Handle spelled out emails (e.g., "a-z-m-a-i-n at gmail dot com") - convert to proper format
3. Convert "at" to "@" and "dot" to "."
4. Handle repetitions and clarifications - use the FINAL/CORRECTED email mentioned
5. Ignore filler words like "the email address I want to change to will be", "it is spelled", "let me repeat"
6. If multiple emails mentioned, use the LAST one (usually the correction)

Examples:
- "The email address I want to change to will be ozmainmorshad03 at gmail.com It is spelled AZMAINMORSHED03 at gmail.com Let me repeat it AZMAINMORSHED03 at gmail.com" → "AZMAINMORSHED03@gmail.com"
- "j-o-h-n at g-m-a-i-l dot c-o-m" → "john@gmail.com"
- "my email is actually test at yahoo dot com" → "test@yahoo.com"

Return ONLY: {"email": "extracted@email.com", "confidence": "high"}
Set confidence to "low" if unclear.`;

        try {
          const emailResponse = await callOpenAI([
            { role: 'system', content: emailExtractionPrompt },
            { role: 'user', content: text }
          ]);
          
          const emailData = JSON.parse(emailResponse);
          if (emailData.email) {
            const oldEmail = session.userInfo.email;
            session.userInfo.email = emailData.email;
            console.log('📧 [Email Update] Email updated in appointment flow:', { 
              sessionId, 
              oldEmail, 
              newEmail: emailData.email,
              userInfo: session.userInfo 
            });
            session.appointmentFlow.step = 'review';
            return `Perfect! I've updated the email to ${emailData.email}. Let me review your appointment details:

Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay || details.time} (30 minutes)
Customer: ${session.userInfo.name} (${session.userInfo.email})

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change (service, date, time, name, or email).`;
          }
        } catch (e) {
          // Fallback to regex extraction
          console.log('📧 [Email Update] JSON parsing failed, using regex fallback');
          
          // Try to extract email with regex patterns
          let extractedEmail = null;
          
          // Pattern 1: Standard email format
          const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i;
          const emailMatch = text.match(emailRegex);
          
          if (emailMatch) {
            extractedEmail = emailMatch[1];
          } else {
            // Pattern 2: Spelled out email (convert "at" to "@" and "dot" to ".")
            const spelledOutRegex = /([a-zA-Z0-9._-]+)\s+at\s+([a-zA-Z0-9.-]+)\s+dot\s+([a-zA-Z]{2,})/i;
            const spelledMatch = text.match(spelledOutRegex);
            
            if (spelledMatch) {
              extractedEmail = `${spelledMatch[1]}@${spelledMatch[2]}.${spelledMatch[3]}`;
            }
          }
          
          if (extractedEmail) {
            const oldEmail = session.userInfo.email;
            session.userInfo.email = extractedEmail;
            console.log('📧 [Email Update] Regex extraction successful:', { 
              sessionId, 
              oldEmail, 
              newEmail: extractedEmail,
              userInfo: session.userInfo 
            });
          } else {
            // Final fallback - use the trimmed text (this was the original behavior)
            session.userInfo.email = text.trim();
          }
        }
        
        session.appointmentFlow.step = 'review';
        return `Perfect! I've updated the email to ${session.userInfo.email}. Let me review your appointment details:

Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay || details.time} (30 minutes)
Customer: ${session.userInfo.name} (${session.userInfo.email})

Please review these details. Say "sounds good" to confirm, or tell me what you'd like to change (service, date, time, name, or email).`;

      case 'confirm':
        const confirmPatterns = [/yes/i, /confirm/i, /schedule/i, /book/i, /go ahead/i, /correct/i, /sounds good/i];
        const cancelPatterns = [/no/i, /cancel/i, /change/i, /different/i, /wrong/i];

        if (confirmPatterns.some(pattern => pattern.test(text))) {
          // Create the appointment
          console.log('📅 Creating calendar appointment with details:', details);
          
          const calendarService = getCalendarService(session.appointmentFlow.calendarType);
          const appointmentResult = await calendarService.createAppointment(
            {
              title: details.title,
              description: `Scheduled via SherpaPrompt AI Assistant`,
              date: details.date,
              time: details.time,
              duration: 30 // 30 minutes
            },
            session.userInfo.email,
            session.userInfo.name
          );

          // Reset appointment flow
          session.appointmentFlow.active = false;
          session.appointmentFlow.step = 'none';
          session.appointmentFlow.details = {};

          if (appointmentResult.success) {
            // Store calendar link in session for UI access
            session.lastAppointment = {
              calendarLink: appointmentResult.eventLink,
              eventId: appointmentResult.eventId,
              details: details
            };
            
            const calendarName = session.appointmentFlow.calendarType === 'microsoft' ? 'Microsoft Calendar' : 'Google Calendar';
            return `Excellent! Your appointment has been scheduled successfully in ${calendarName}. 

Appointment Details:
- Service: ${details.title}  
- Date & Time: ${details.date} at ${details.timeDisplay || details.time}
- Duration: 30 minutes
- Customer: ${session.userInfo.name} (${session.userInfo.email})
- Calendar: ${calendarName}

Our team will contact you at ${session.userInfo.email} to confirm the appointment details and provide any additional information you may need.

Is there anything else I can help you with today?`;
          } else {
            console.error('Calendar appointment creation failed:', appointmentResult.error);
            return `I apologize, but there was an issue creating your calendar appointment. Please call us directly at (303) 555-FENCE to schedule your appointment, or try again later. Our team will be happy to help you schedule your ${details.title}.`;
          }
        } else if (cancelPatterns.some(pattern => pattern.test(text))) {
          // Reset and start over
          session.appointmentFlow.step = 'collect_title';
          session.appointmentFlow.details = {};
          return "No problem! Let's start over. What type of service are you interested in?";
        } else {
          return `I didn't catch that. Should I go ahead and schedule this appointment? Please say "sounds good" to confirm or "no" to make changes.`;
        }

      default:
        // Reset if in unknown state
        session.appointmentFlow.active = false;
        session.appointmentFlow.step = 'none';
        return "I'm sorry, there was an issue with the appointment scheduling. Would you like to try scheduling an appointment again?";
    }
  } catch (error) {
    console.error('Error in appointment flow:', error);
    session.appointmentFlow.active = false;
    session.appointmentFlow.step = 'none';
    return "I apologize, but there was an error processing your appointment request. Please call us directly at (303) 555-FENCE to schedule, and our team will be happy to help you.";
  }
}

/**
 * Find selected time slot from user input
 * @param {string} text - User's time selection input
 * @param {Array} availableSlots - Array of available time slots
 * @returns {Object|null} Selected slot or null if not found
 */
function findSelectedTimeSlot(text, availableSlots) {
  const inputLower = text.toLowerCase().trim();
  
  // First, try exact match with display format
  for (const slot of availableSlots) {
    if (inputLower === slot.display.toLowerCase()) {
      return slot;
    }
  }
  
  // Try to extract time from user input using various patterns
  const timePatterns = [
    /(\d{1,2}):(\d{2})\s*(am|pm)/i,  // 12:30 PM, 2:00 PM
    /(\d{1,2})\s*(am|pm)/i,          // 12 PM, 2 PM
    /(\d{1,2}):(\d{2})/,             // 14:30 (24-hour)
    /(\d{1,2})\s*(?:o'clock)?/i      // 2, 12 o'clock
  ];
  
  let extractedTime = null;
  
  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      let hours, minutes;
      
      if (pattern === timePatterns[0]) { // HH:MM AM/PM
        hours = parseInt(match[1]);
        minutes = match[2];
        const meridiem = match[3].toLowerCase();
        if (meridiem === 'pm' && hours !== 12) hours += 12;
        if (meridiem === 'am' && hours === 12) hours = 0;
      } else if (pattern === timePatterns[1]) { // H AM/PM
        hours = parseInt(match[1]);
        minutes = '00';
        const meridiem = match[2].toLowerCase();
        if (meridiem === 'pm' && hours !== 12) hours += 12;
        if (meridiem === 'am' && hours === 12) hours = 0;
      } else if (pattern === timePatterns[2]) { // HH:MM (24-hour)
        hours = parseInt(match[1]);
        minutes = match[2];
      } else if (pattern === timePatterns[3]) { // Just number
        hours = parseInt(match[1]);
        minutes = '00';
        // Assume PM for business hours (12-4 PM)
        if (hours >= 12 && hours <= 16) {
          // Already in 24-hour format
        } else if (hours >= 1 && hours <= 4) {
          hours += 12; // Convert to PM
        }
      }
      
      extractedTime = `${hours.toString().padStart(2, '0')}:${minutes}`;
      break;
    }
  }
  
  // If we extracted a time, find matching slot
  if (extractedTime) {
    for (const slot of availableSlots) {
      if (slot.start === extractedTime) {
        return slot;
      }
    }
  }
  
  // Try partial matching with display text
  for (const slot of availableSlots) {
    const slotDisplay = slot.display.toLowerCase();
    
    // Check if input contains key parts of the slot display
    if (slotDisplay.includes(inputLower) || inputLower.includes(slotDisplay.split(' ')[0])) {
      return slot;
    }
    
    // Try matching just the hour part
    const hourMatch = slotDisplay.match(/(\d{1,2})/);
    const inputHourMatch = inputLower.match(/(\d{1,2})/);
    
    if (hourMatch && inputHourMatch && hourMatch[1] === inputHourMatch[1]) {
      // Also check for AM/PM consistency if present in input
      const slotHasPM = slotDisplay.includes('pm');
      const inputHasPM = inputLower.includes('pm') || inputLower.includes('p.m');
      const inputHasAM = inputLower.includes('am') || inputLower.includes('a.m');
      
      if (!inputHasPM && !inputHasAM) {
        // No meridiem specified, assume it matches if hour matches
        return slot;
      } else if ((slotHasPM && inputHasPM) || (!slotHasPM && inputHasAM)) {
        return slot;
      }
    }
  }
  
  return null;
}

/**
 * Parse date from natural language text
 */
function parseDateFromText(text) {
  try {
    // First, normalize ordinal numbers (second, third, fourth, etc.)
    const normalizedText = text.toLowerCase()
      .replace(/\bfirst\b/g, '1st')
      .replace(/\bsecond\b/g, '2nd')
      .replace(/\bthird\b/g, '3rd')
      .replace(/\bfourth\b/g, '4th')
      .replace(/\bfifth\b/g, '5th')
      .replace(/\bsixth\b/g, '6th')
      .replace(/\bseventh\b/g, '7th')
      .replace(/\beighth\b/g, '8th')
      .replace(/\bninth\b/g, '9th')
      .replace(/\btenth\b/g, '10th')
      .replace(/\beleventh\b/g, '11th')
      .replace(/\btwelfth\b/g, '12th')
      .replace(/\bthirteenth\b/g, '13th')
      .replace(/\bfourteenth\b/g, '14th')
      .replace(/\bfifteenth\b/g, '15th')
      .replace(/\bsixteenth\b/g, '16th')
      .replace(/\bseventeenth\b/g, '17th')
      .replace(/\beighteenth\b/g, '18th')
      .replace(/\bnineteenth\b/g, '19th')
      .replace(/\btwentieth\b/g, '20th')
      .replace(/\btwenty-first\b/g, '21st')
      .replace(/\btwenty-second\b/g, '22nd')
      .replace(/\btwenty-third\b/g, '23rd')
      .replace(/\btwenty-fourth\b/g, '24th')
      .replace(/\btwenty-fifth\b/g, '25th')
      .replace(/\btwenty-sixth\b/g, '26th')
      .replace(/\btwenty-seventh\b/g, '27th')
      .replace(/\btwenty-eighth\b/g, '28th')
      .replace(/\btwenty-ninth\b/g, '29th')
      .replace(/\bthirtieth\b/g, '30th')
      .replace(/\bthirty-first\b/g, '31st');

    // Try various date formats
    const datePatterns = [
      // YYYY-MM-DD format
      /(\d{4})-(\d{1,2})-(\d{1,2})/,
      // MM/DD/YYYY format
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
      // Month DD, YYYY format (including ordinals)
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}(?:st|nd|rd|th)?),?\s+(\d{4})/i,
      // DD Month YYYY format (including ordinals)
      /(\d{1,2}(?:st|nd|rd|th)?)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i,
      // Month DD format (current year assumed, including ordinals)
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}(?:st|nd|rd|th)?)/i,
      // DD Month format (current year assumed, including ordinals)
      /(\d{1,2}(?:st|nd|rd|th)?)\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i
    ];

    for (const pattern of datePatterns) {
      const match = normalizedText.match(pattern);
      if (match) {
        let year, month, day;
        const currentYear = new Date().getFullYear();
        
        if (pattern === datePatterns[0]) { // YYYY-MM-DD
          year = match[1];
          month = match[2].padStart(2, '0');
          day = match[3].padStart(2, '0');
        } else if (pattern === datePatterns[1]) { // MM/DD/YYYY
          year = match[3];
          month = match[1].padStart(2, '0');
          day = match[2].padStart(2, '0');
        } else if (pattern === datePatterns[2]) { // Month DD, YYYY
          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                            'july', 'august', 'september', 'october', 'november', 'december'];
          month = (monthNames.indexOf(match[1].toLowerCase()) + 1).toString().padStart(2, '0');
          day = match[2].replace(/\D/g, '').padStart(2, '0'); // Remove ordinal suffixes
          year = match[3];
        } else if (pattern === datePatterns[3]) { // DD Month YYYY
          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                            'july', 'august', 'september', 'october', 'november', 'december'];
          day = match[1].replace(/\D/g, '').padStart(2, '0'); // Remove ordinal suffixes
          month = (monthNames.indexOf(match[2].toLowerCase()) + 1).toString().padStart(2, '0');
          year = match[3];
        } else if (pattern === datePatterns[4]) { // Month DD (current year)
          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                            'july', 'august', 'september', 'october', 'november', 'december'];
          month = (monthNames.indexOf(match[1].toLowerCase()) + 1).toString().padStart(2, '0');
          day = match[2].replace(/\D/g, '').padStart(2, '0'); // Remove ordinal suffixes
          year = currentYear.toString();
        } else if (pattern === datePatterns[5]) { // DD Month (current year)
          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                            'july', 'august', 'september', 'october', 'november', 'december'];
          day = match[1].replace(/\D/g, '').padStart(2, '0'); // Remove ordinal suffixes
          month = (monthNames.indexOf(match[2].toLowerCase()) + 1).toString().padStart(2, '0');
          year = currentYear.toString();
        }

        const dateString = `${year}-${month}-${day}`;
        const date = new Date(dateString);
        
        if (!isNaN(date.getTime())) {
          return {
            success: true,
            date: dateString,
            formatted: date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
          };
        }
      }
    }

    return { success: false, error: 'No valid date format found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Parse time from natural language text
 */
function parseTimeFromText(text) {
  try {
    // Match time patterns like "10:30 AM", "2 PM", "14:30"
    const timePatterns = [
      /(\d{1,2}):(\d{2})\s*(am|pm)/i,  // 10:30 AM
      /(\d{1,2})\s*(am|pm)/i,          // 2 PM
      /(\d{1,2}):(\d{2})/              // 14:30 (24-hour)
    ];

    for (const pattern of timePatterns) {
      const match = text.match(pattern);
      if (match) {
        let hours, minutes, meridiem;
        
        if (pattern === timePatterns[0]) { // HH:MM AM/PM
          hours = parseInt(match[1]);
          minutes = match[2];
          meridiem = match[3].toLowerCase();
        } else if (pattern === timePatterns[1]) { // H AM/PM
          hours = parseInt(match[1]);
          minutes = '00';
          meridiem = match[2].toLowerCase();
        } else if (pattern === timePatterns[2]) { // HH:MM (24-hour)
          hours = parseInt(match[1]);
          minutes = match[2];
          meridiem = null;
        }

        // Convert to 24-hour format if needed
        if (meridiem === 'pm' && hours !== 12) {
          hours += 12;
        } else if (meridiem === 'am' && hours === 12) {
          hours = 0;
        }

        // Validate time
        if (hours >= 0 && hours <= 23 && parseInt(minutes) >= 0 && parseInt(minutes) <= 59) {
          const timeString = `${hours.toString().padStart(2, '0')}:${minutes}`;
          return {
            success: true,
            time: timeString
          };
        }
      }
    }

    return { success: false, error: 'No valid time format found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Send conversation summary email to user
 * @param {string} sessionId - Session identifier
 * @param {Object} session - Session data
 */
async function sendConversationSummary(sessionId, session) {
  try {
    // Check if user has provided email
    if (!session.userInfo || !session.userInfo.email || !session.userInfo.collected) {
      console.log('📧 [Email] Skipping email - no user email collected for session:', sessionId);
      return { success: false, reason: 'No user email available' };
    }

    // Check if there's meaningful conversation to summarize
    if (!session.conversationHistory || session.conversationHistory.length < 2) {
      console.log('📧 [Email] Skipping email - insufficient conversation history for session:', sessionId);
      return { success: false, reason: 'Insufficient conversation history' };
    }

    console.log('📧 [Email] Sending conversation summary for session:', sessionId);
    console.log('📧 [Email] User info:', { name: session.userInfo.name, email: session.userInfo.email });
    console.log('📧 [Email] Conversation messages:', session.conversationHistory.length);
    console.log('📧 [Email] Has appointment:', !!session.lastAppointment);

    // Create a fresh copy of user info to ensure we have the latest email
    const currentUserInfo = {
      name: session.userInfo.name,
      email: session.userInfo.email,
      collected: session.userInfo.collected
    };

    console.log('📧 [Email] Using current user info for email:', currentUserInfo);

    // Send the email with the current user info
    const emailResult = await emailService.sendConversationSummary(
      currentUserInfo,
      session.conversationHistory,
      session.lastAppointment
    );

    if (emailResult.success) {
      console.log('✅ [Email] Conversation summary sent successfully:', emailResult.messageId);
      return { success: true, messageId: emailResult.messageId };
    } else {
      console.error('❌ [Email] Failed to send conversation summary:', emailResult.error);
      return { success: false, error: emailResult.error };
    }

  } catch (error) {
    console.error('❌ [Email] Error sending conversation summary:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Helper Functions
 */

async function callOpenAI(messages, model = 'gpt-5-nano', retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`🤖 [OpenAI] Attempt ${attempt}/${retries} - Calling ${model}`);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          max_output_tokens: 300,
          temperature: 0.7,
          reasoning: { effort: 'medium' },
          verbosity: "medium"
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [OpenAI] API error ${response.status}: ${errorText}`);
        
        // If it's a 503 (Service Unavailable) or 429 (Rate Limit), retry
        if ((response.status === 503 || response.status === 429) && attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`⏳ [OpenAI] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`✅ [OpenAI] Success on attempt ${attempt}`);
      return data.choices[0].message.content;
      
    } catch (error) {
      console.error(`❌ [OpenAI] Attempt ${attempt} failed:`, error.message);
      
      // If it's the last attempt, throw the error
      if (attempt === retries) {
        throw error;
      }
      
      // Wait before retrying
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`⏳ [OpenAI] Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function extractSearchTerms(text) {
  const fencingKeywords = [
    'fence', 'fencing', 'installation', 'repair', 'maintenance', 
    'cost', 'price', 'material', 'wood', 'vinyl', 'chain link',
    'aluminum', 'steel', 'height', 'permit', 'warranty', 'estimate',
    'gate', 'gates', 'privacy', 'picket', 'ornamental', 'iron',
    'concrete', 'post', 'rail', 'stain', 'painting', 'hours',
    'schedule', 'emergency', 'service', 'area', 'financing',
    'payment', 'quote', 'consultation', 'appointment',
    // Contact and company info keywords
    'phone', 'number', 'call', 'contact', 'reach', 'email', 'address',
    'location', 'office', 'company', 'business', 'hours', 'open',
    'available', 'speak', 'talk', 'representative', 'website', 'areas'
  ];
  
  // Enhanced extraction that includes context and question words
  const textLower = text.toLowerCase();
  const words = textLower.split(/\s+/);
  
  // Extract fencing-related keywords
  const foundKeywords = words.filter(word => 
    fencingKeywords.some(keyword => 
      word.includes(keyword) || keyword.includes(word)
    )
  );
  
  // For questions, include the full question context for better search
  const questionWords = ['how', 'what', 'when', 'where', 'why', 'can', 'do', 'are', 'is', 'will'];
  const isQuestion = questionWords.some(qw => textLower.includes(qw));
  
  if (isQuestion && foundKeywords.length > 0) {
    // For questions, include more context words
    const contextWords = words.filter(word => 
      word.length > 3 && 
      !['the', 'and', 'for', 'are', 'you', 'your', 'can', 'will', 'this', 'that'].includes(word)
    );
    foundKeywords.push(...contextWords.slice(0, 3)); // Add up to 3 context words
  }
  
  // Remove duplicates and return
  return [...new Set(foundKeywords)];
}

// Session cleanup
router.delete('/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  
  if (sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    
    // Send conversation summary email before deleting session (don't wait for it)
    sendConversationSummary(sessionId, session).catch(error => {
      console.error('❌ [Email] Failed to send summary email in session cleanup:', error);
    });
    
    sessions.delete(sessionId);
    console.log('🗑️ Session deleted:', sessionId);
  }
  
  res.json({ success: true });
});

// Clean up old sessions periodically
setInterval(() => {
  const now = new Date();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > maxAge) {
      // Send conversation summary email before cleanup (don't wait for it)
      sendConversationSummary(sessionId, session).catch(error => {
        console.error('❌ [Email] Failed to send summary email in automatic cleanup:', error);
      });
      
      sessions.delete(sessionId);
      console.log('🧹 Cleaned up old session:', sessionId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Test endpoint for email functionality
router.post('/test-email', async (req, res) => {
  try {
    const { email, name } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email is required for testing' 
      });
    }

    // Create test conversation data
    const testUserInfo = {
      name: name || 'Test User',
      email: email,
      collected: true
    };

    const testConversationHistory = [
      {
        role: 'user',
        content: 'Hi, I need information about fence installation',
        timestamp: new Date()
      },
      {
        role: 'assistant',
        content: 'Hello! I\'d be happy to help you with fence installation information. We offer various materials including wood, vinyl, and chain link fencing.',
        timestamp: new Date()
      },
      {
        role: 'user',
        content: 'What are your prices for wood fencing?',
        timestamp: new Date()
      },
      {
        role: 'assistant',
        content: 'Our wood fencing prices vary based on the type of wood and height. For a standard 6-foot privacy fence, prices typically range from $25-40 per linear foot including installation.',
        timestamp: new Date()
      },
      {
        role: 'user',
        content: 'Can I schedule an appointment?',
        timestamp: new Date()
      },
      {
        role: 'assistant',
        content: 'Absolutely! I can help you schedule an appointment. What date works best for you?',
        timestamp: new Date()
      }
    ];

    const testAppointmentDetails = {
      details: {
        title: 'Fence Consultation',
        date: '2024-12-15',
        time: '14:00',
        timeDisplay: '2:00 PM'
      },
      calendarType: 'Google Calendar'
    };

    // Send test email
    const emailResult = await emailService.sendConversationSummary(
      testUserInfo,
      testConversationHistory,
      testAppointmentDetails
    );

    res.json({
      success: true,
      message: 'Test email sent',
      emailResult,
      testData: {
        userInfo: testUserInfo,
        conversationMessages: testConversationHistory.length,
        hasAppointment: true
      }
    });

  } catch (error) {
    console.error('❌ [Test Email] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test email',
      message: error.message
    });
  }
});

// Test endpoint for email service connectivity
router.get('/test-email-connection', async (req, res) => {
  try {
    const connectionTest = await emailService.testConnection();
    
    res.json({
      success: connectionTest.success,
      emailServiceReady: emailService.isReady(),
      message: connectionTest.success ? 'Email service is working' : connectionTest.error,
      ping: connectionTest.ping || null
    });

  } catch (error) {
    console.error('❌ [Test Email Connection] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test email connection',
      message: error.message
    });
  }
});

module.exports = router;