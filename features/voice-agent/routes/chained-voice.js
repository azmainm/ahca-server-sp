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
const { CompanyInfoService } = require('../../../shared/services/CompanyInfoService');

const router = express.Router();

// Initialize services
const embeddingService = new EmbeddingService();
const fencingRAG = new FencingRAG();
const calendarService = new GoogleCalendarService();
const companyInfoService = new CompanyInfoService();

// Session storage
const sessions = new Map();

// Helper to get or create session
function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      conversationHistory: [],
      userInfo: { name: null, email: null, collected: false },
      appointmentFlow: { active: false, step: 'none', details: {} },
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
      const userName = session.userInfo.name || 'there';
      assistantResponse = `Thank you, ${userName}! I hope you were satisfied with SherpaPrompt AI's service. Have a great day!`;
    } else if (!session.userInfo.collected) {
      // Phase 1: Collect name and email
      systemPrompt = `You are a friendly assistant for SherpaPrompt Fencing Company. 
      
Your task is to extract ONLY the user's name and email from their response. Be helpful and conversational but concise.

IMPORTANT: Do NOT ask for phone numbers, contact numbers, or any other information. Only collect name and email.

If you get both name and email, respond with: "Thanks [name]! I've got your email as [email]. How can I help you today?"

If information is missing, briefly ask for what's missing (name or email only).

Keep responses short and natural.`;

      // Try to extract name and email
      const extractionPrompt = `Extract name and email from this text: "${text}"
      
Return ONLY a JSON object like: {"name": "John Doe", "email": "john@example.com", "hasComplete": true}
If missing info, set those fields to null and hasComplete to false.`;

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
          // Generate response asking for missing info
          const responsePrompt = `The user said: "${text}"
          We have: name="${session.userInfo.name || 'missing'}", email="${session.userInfo.email || 'missing'}"
          
          Generate a friendly response asking for any missing information (name or email only - do NOT ask for phone numbers). Be conversational and helpful.`;
          
          assistantResponse = await callOpenAI([
            { role: 'system', content: responsePrompt }
          ]);
        }
      } catch (e) {
        // Fallback response
        assistantResponse = "I'd be happy to help! Could you please provide your name and email address so I can assist you better?";
      }

    } else {
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

      // Handle active appointment flow
      if (session.appointmentFlow.active || isAppointmentRequest) {
        assistantResponse = await handleAppointmentFlow(session, text, isAppointmentRequest);
      } 
      // Handle follow-up after previous query (asking for more questions or appointment)
      else if (session.awaitingFollowUp) {
        const wantsMoreQuestions = /yes|more|another|other|question/i.test(text);
        const wantsAppointment = /appointment|schedule|meeting|consultation|book/i.test(text);
        
        if (wantsAppointment) {
          session.appointmentFlow.active = true;
          session.appointmentFlow.step = 'collect_title';
          session.awaitingFollowUp = false;
          assistantResponse = "Great! I'd be happy to help you schedule an appointment. What type of service are you interested in? For example: fence consultation, repair estimate, or installation quote.";
        } else if (wantsMoreQuestions) {
          session.awaitingFollowUp = false;
          assistantResponse = "Of course! What else would you like to know about our fencing services?";
        } else {
          session.awaitingFollowUp = false;
          assistantResponse = "Alright! Feel free to ask if you have any more questions or need to schedule an appointment. How else can I assist you?";
        }
      }
      // Regular Q&A with RAG
      else {
        needsRAG = true;

        // Check if this is a company info query first
        if (companyInfoService.isCompanyInfoQuery(text)) {
          console.log('🏢 [Company Info] Detected company information query');
          assistantResponse = companyInfoService.getCompanyInfo(text);
          
          // Add follow-up question
          assistantResponse += " Is there anything else you'd like to know, or would you like to schedule an appointment?";
          session.awaitingFollowUp = true;
        } else {
          systemPrompt = `You are a helpful assistant for SherpaPrompt Fencing Company. Answer questions concisely using the provided context.

User: ${session.userInfo.name} (${session.userInfo.email})

Guidelines:
- Be direct and to-the-point but friendly
- Answer only what's asked
- Keep responses conversational but brief
- Do NOT ask follow-up questions in this response - that will be handled separately
- If user says goodbye/no more questions, thank them and mention you hope they were satisfied with SherpaPrompt AI's service`;

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
      conversationHistory: session.conversationHistory
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
 * Handle appointment scheduling flow
 */
async function handleAppointmentFlow(session, text, isAppointmentRequest) {
  try {
    // Initialize appointment flow if new request
    if (isAppointmentRequest && !session.appointmentFlow.active) {
      session.appointmentFlow.active = true;
      session.appointmentFlow.step = 'collect_title';
      session.appointmentFlow.details = {};
      session.awaitingFollowUp = false;
      return "Great! I'd be happy to help you schedule an appointment. What type of service are you interested in? For example: fence consultation, repair estimate, or installation quote.";
    }

    const step = session.appointmentFlow.step;
    const details = session.appointmentFlow.details;

    switch (step) {
      case 'collect_title':
        // Extract service type from user input
        details.title = text.trim();
        session.appointmentFlow.step = 'collect_date';
        return `Perfect! I'll schedule a ${details.title} for you. Please note that all appointments are 30 minutes long and available Monday through Friday from 12:00 PM to 4:00 PM. What date would work best? Please provide the date in format like "December 15, 2024" or "2024-12-15".`;

      case 'collect_date':
        // Parse and validate date
        const dateResult = parseDateFromText(text);
        if (!dateResult.success) {
          return `I'm having trouble understanding that date format. Could you please provide the date like "December 15, 2024" or "2024-12-15"?`;
        }
        
        // Check if it's a business day and find available slots
        console.log('📅 Checking availability for date:', dateResult.date);
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
            return `I'm sorry, but ${dateResult.formatted} has no available appointment slots. The next available date is ${nextAvailable.formattedDate} with slots at: ${slotsText}. Would you like to book one of these times, or try a different date?`;
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
        // Find the selected time slot
        const selectedSlot = findSelectedTimeSlot(text, details.availableSlots);
        
        if (!selectedSlot) {
          const slotsText = details.availableSlots.map(slot => slot.display).join(', ');
          return `I couldn't match that to one of the available times. Please choose from: ${slotsText}`;
        }
        
        details.time = selectedSlot.start;
        details.timeDisplay = selectedSlot.display;
        session.appointmentFlow.step = 'confirm';
        
        // Show confirmation
        return `Perfect! Let me confirm your appointment details:
        
Service: ${details.title}
Date: ${details.date}
Time: ${details.timeDisplay} (30 minutes)
Customer: ${session.userInfo.name} (${session.userInfo.email})

Should I go ahead and schedule this appointment?`;

      case 'confirm':
        const confirmPatterns = [/yes/i, /confirm/i, /schedule/i, /book/i, /go ahead/i, /correct/i, /sounds good/i];
        const cancelPatterns = [/no/i, /cancel/i, /change/i, /different/i, /wrong/i];

        if (confirmPatterns.some(pattern => pattern.test(text))) {
          // Create the appointment
          console.log('📅 Creating calendar appointment with details:', details);
          
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
            return `Excellent! Your appointment has been scheduled successfully in our calendar system. 

Appointment Details:
- Service: ${details.title}  
- Date & Time: ${details.date} at ${details.timeDisplay || details.time}
- Duration: 30 minutes
- Customer: ${session.userInfo.name} (${session.userInfo.email})

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
          return `I didn't catch that. Should I go ahead and schedule this appointment? Please say "yes" to confirm or "no" to make changes.`;
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
  const inputLower = text.toLowerCase();
  
  // Try to match time patterns in the input
  const timePatterns = [
    /(\d{1,2}):(\d{2})\s*(am|pm)/i,  // 12:00 PM
    /(\d{1,2})\s*(am|pm)/i,          // 12 PM
    /(\d{1,2}):(\d{2})/              // 12:00 (24-hour)
  ];
  
  for (const slot of availableSlots) {
    // Check if user input matches the display format exactly
    if (inputLower.includes(slot.display.toLowerCase())) {
      return slot;
    }
    
    // Check if user input matches any time in the slot
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
        }
        
        const timeString = `${hours.toString().padStart(2, '0')}:${minutes}`;
        
        // Check if this matches the slot start time
        if (slot.start === timeString) {
          return slot;
        }
      }
    }
  }
  
  // Try partial matching (e.g., "12" for "12:00 PM")
  for (const slot of availableSlots) {
    if (slot.display.toLowerCase().includes(inputLower.trim())) {
      return slot;
    }
  }
  
  return null;
}

/**
 * Parse date from natural language text
 */
function parseDateFromText(text) {
  try {
    // Try various date formats
    const datePatterns = [
      // YYYY-MM-DD format
      /(\d{4})-(\d{1,2})-(\d{1,2})/,
      // MM/DD/YYYY format
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
      // Month DD, YYYY format
      /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i,
      // DD Month YYYY format
      /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        let year, month, day;
        
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
          day = match[2].padStart(2, '0');
          year = match[3];
        } else if (pattern === datePatterns[3]) { // DD Month YYYY
          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                            'july', 'august', 'september', 'october', 'november', 'december'];
          month = (monthNames.indexOf(match[2].toLowerCase()) + 1).toString().padStart(2, '0');
          day = match[1].padStart(2, '0');
          year = match[3];
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
 * Helper Functions
 */

async function callOpenAI(messages, model = 'gpt-4') {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 300,
      temperature: 0.7
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
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
router.delete('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  if (sessions.has(sessionId)) {
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
      sessions.delete(sessionId);
      console.log('🧹 Cleaned up old session:', sessionId);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

module.exports = router;