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
const { EmbeddingService } = require('../services/EmbeddingService');
const { FencingRAG } = require('../services/FencingRAG');

const router = express.Router();

// Initialize services
const embeddingService = new EmbeddingService();
const fencingRAG = new FencingRAG();

// Session storage
const sessions = new Map();

// Helper to get or create session
function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      conversationHistory: [],
      userInfo: { name: null, email: null, collected: false },
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

    if (!session.userInfo.collected) {
      // Phase 1: Collect name and email
      systemPrompt = `You are a friendly assistant for SherpaPrompt Fencing Company. 
      
Your task is to extract the user's name and email from their response. Be helpful and conversational.

If you get both name and email, respond with: "Thank you [name]! I've recorded your email as [email]. Now, how can I help you with your fencing needs today?"

If information is missing, politely ask for what's missing.

Extract the information and respond naturally.`;

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
          assistantResponse = `Thank you ${extracted.name}! I've recorded your email as ${extracted.email}. Now, how can I help you with your fencing needs today?`;
        } else {
          // Generate response asking for missing info
          const responsePrompt = `The user said: "${text}"
          We have: name="${session.userInfo.name || 'missing'}", email="${session.userInfo.email || 'missing'}"
          
          Generate a friendly response asking for any missing information. Be conversational and helpful.`;
          
          assistantResponse = await callOpenAI([
            { role: 'system', content: responsePrompt }
          ]);
        }
      } catch (e) {
        // Fallback response
        assistantResponse = "I'd be happy to help! Could you please provide your name and email address so I can assist you better?";
      }

    } else {
      // Phase 2: Answer questions using RAG
      needsRAG = true;
      
      systemPrompt = `You are a knowledgeable assistant for SherpaPrompt Fencing Company. Use the provided context to answer questions about fencing services, materials, installation, maintenance, and costs.

User: ${session.userInfo.name} (${session.userInfo.email})

Be helpful, professional, and specific. If you need to search for information, use the search_knowledge function.`;

      // Check if we need to search knowledge base
      const searchTerms = extractSearchTerms(text);
      let contextInfo = '';

      if (searchTerms.length > 0) {
        console.log('🔍 [RAG] Searching for:', searchTerms);
        const searchResults = await embeddingService.searchSimilarContent(searchTerms.join(' '), 3);
        
        if (searchResults && searchResults.length > 0) {
          contextInfo = fencingRAG.formatContext(searchResults);
          console.log('📚 [RAG] Found relevant info from', searchResults.length, 'sources');
        }
      }

      // Generate response with context using FencingRAG
      if (contextInfo) {
        const ragResponse = await fencingRAG.generateResponse(text, contextInfo, session.conversationHistory);
        assistantResponse = ragResponse.answer;
      } else {
        // Fallback to basic OpenAI response without RAG
        const messages = [
          { role: 'system', content: systemPrompt },
          ...session.conversationHistory.slice(-6), // Last 3 exchanges
        ];
        assistantResponse = await callOpenAI(messages);
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
    'aluminum', 'steel', 'height', 'permit', 'warranty', 'estimate'
  ];
  
  const words = text.toLowerCase().split(/\s+/);
  return words.filter(word => 
    fencingKeywords.some(keyword => 
      word.includes(keyword) || keyword.includes(word)
    )
  );
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