const express = require('express');
const { EmbeddingService } = require('../services/EmbeddingService');
const { FencingRAG } = require('../services/FencingRAG');

const router = express.Router();

// Initialize services
const embeddingService = new EmbeddingService();
const fencingRAG = new FencingRAG();

/**
 * Chained Architecture Voice Agent
 * Following OpenAI's recommended chained architecture:
 * Audio → gpt-4o-transcribe → gpt-4.1 (with functions) → gpt-4o-mini-tts → Audio
 */

/**
 * Step 1: Transcribe audio using gpt-4o
 * POST /api/chained-voice/transcribe
 */
router.post('/transcribe', async (req, res) => {
  try {
    console.log('\n🎙️ ======= CHAINED VOICE: TRANSCRIPTION =======');
    console.log('🕰️ Timestamp:', new Date().toISOString());
    
    const { audio } = req.body;
    
    if (!audio) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    console.log('🔊 Transcribing audio with gpt-4o...');
    
    // Convert base64 audio to buffer if needed
    const audioBuffer = Buffer.isBuffer(audio) ? audio : Buffer.from(audio, 'base64');

    // Create form data for multipart/form-data
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('file', audioBuffer, {
      filename: 'audio.webm',
      contentType: 'audio/webm'
    });
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'json');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Transcription failed: ${response.status}`);
    }

    const transcription = await response.json();
    console.log('📝 Transcription result:', transcription.text);

    res.json({
      success: true,
      text: transcription.text,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Transcription error:', error);
    res.status(500).json({
      success: false,
      error: 'Transcription failed',
      message: error.message
    });
  }
});

/**
 * Step 2: Process text with gpt-4.1 including function calls
 * POST /api/chained-voice/process
 */
router.post('/process', async (req, res) => {
  try {
    console.log('\n🧠 ======= CHAINED VOICE: TEXT PROCESSING =======');
    console.log('🕰️ Timestamp:', new Date().toISOString());
    
    const { text, conversationHistory = [] } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    console.log('💭 Processing text with gpt-4.1:', text);
    console.log('📚 Conversation history length:', conversationHistory.length);

    // Prepare messages for GPT-4.1
    const messages = [
      {
        role: 'system',
        content: `You are a professional voice assistant for SherpaPrompt Fencing Company.

CONVERSATION FLOW - Follow this exact order:
1. FIRST: Greet the caller warmly and ask for their name
2. SECOND: Once you have their name, ask for their email address  
3. THIRD: After collecting both name and email, ask about the nature of their fencing inquiry
4. FOURTH: ALWAYS call the knowledge_search function to get accurate information

CRITICAL FUNCTION CALLING RULES:
- You MUST use the knowledge_search function for ALL fencing-related questions after collecting name and email
- NEVER guess or make up information about services, pricing, or company details
- ALWAYS call knowledge_search before providing specific company information
- Examples of when to call knowledge_search:
  * "What areas do you serve?" → call knowledge_search with "service areas"
  * "What types of fencing do you offer?" → call knowledge_search with "fencing types"
  * "How much does a fence cost?" → call knowledge_search with "pricing"
  * "What materials do you use?" → call knowledge_search with "materials"
  * "Do you do emergency repairs?" → call knowledge_search with "emergency repairs"

Your responses will be converted to speech, so:
- Keep responses conversational and natural for voice
- Use clear, concise language
- Avoid complex formatting or special characters
- Speak as if talking directly to the customer

MANDATORY: Use the knowledge_search function for any company information requests.`
      },
      ...conversationHistory,
      {
        role: 'user',
        content: text
      }
    ];

    // Define the knowledge_search function for GPT-4.1
    const tools = [
      {
        type: 'function',
        function: {
          name: 'knowledge_search',
          description: 'Search the company knowledge base for fencing information',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query for fencing-related information'
              }
            },
            required: ['query']
          }
        }
      }
    ];

    console.log('🤖 Calling GPT-4.1 with function tools...');
    
    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messages,
        tools: tools,
        tool_choice: 'auto',
        temperature: 0.7,
        max_tokens: 1000
      }),
    });

    if (!gptResponse.ok) {
      throw new Error(`GPT-4.1 request failed: ${gptResponse.status}`);
    }

    const gptResult = await gptResponse.json();
    const assistantMessage = gptResult.choices[0].message;

    console.log('🎯 GPT-4.1 response:', assistantMessage);

    let finalResponse = assistantMessage.content || '';
    let updatedHistory = [...conversationHistory, { role: 'user', content: text }];

    // Handle function calls if present
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log('🔧 Function calls detected:', assistantMessage.tool_calls.length);
      
      // Add assistant message with tool calls to history
      updatedHistory.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.function.name === 'knowledge_search') {
          console.log('🔍 Executing knowledge_search function...');
          
          const functionArgs = JSON.parse(toolCall.function.arguments);
          const query = functionArgs.query;
          
          console.log('📝 Knowledge search query:', query);

          // Execute knowledge search
          const searchResult = await performKnowledgeSearch(query);
          
          // Add function result to conversation
          updatedHistory.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(searchResult)
          });

          // Get final response from GPT-4.1 with function results
          const finalGptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [...updatedHistory],
              temperature: 0.7,
              max_tokens: 1000
            }),
          });

          const finalGptResult = await finalGptResponse.json();
          finalResponse = finalGptResult.choices[0].message.content;
          
          // Add final assistant response to history
          updatedHistory.push({
            role: 'assistant',
            content: finalResponse
          });

          console.log('✅ Final response with function results:', finalResponse);
        }
      }
    } else {
      // No function calls, just add assistant response to history
      updatedHistory.push({
        role: 'assistant',
        content: finalResponse
      });
    }

    res.json({
      success: true,
      response: finalResponse,
      conversationHistory: updatedHistory,
      hadFunctionCalls: assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0
    });

  } catch (error) {
    console.error('❌ Text processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Text processing failed',
      message: error.message
    });
  }
});

/**
 * Step 3: Convert text to speech using gpt-4o-mini-tts
 * POST /api/chained-voice/synthesize
 */
router.post('/synthesize', async (req, res) => {
  try {
    console.log('\n🔊 ======= CHAINED VOICE: SPEECH SYNTHESIS =======');
    console.log('🕰️ Timestamp:', new Date().toISOString());
    
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    console.log('🎵 Synthesizing speech for text:', text.substring(0, 100) + '...');

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: 'alloy',
        response_format: 'mp3'
      }),
    });

    if (!response.ok) {
      throw new Error(`Speech synthesis failed: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    console.log('🎶 Speech synthesis completed, audio length:', audioBase64.length);

    res.json({
      success: true,
      audio: audioBase64,
      format: 'mp3'
    });

  } catch (error) {
    console.error('❌ Speech synthesis error:', error);
    res.status(500).json({
      success: false,
      error: 'Speech synthesis failed',
      message: error.message
    });
  }
});

/**
 * Helper function to perform knowledge search
 */
async function performKnowledgeSearch(query) {
  try {
    console.log(`🔍 Performing knowledge search for: "${query}"`);
    
    // Search for similar content
    const similarContent = await embeddingService.searchSimilarContent(query, 3);
    console.log(`📊 Found ${similarContent.length} similar content items`);
    
    if (similarContent.length === 0) {
      return {
        success: true,
        result: 'I don\'t have specific information about that in my knowledge base.',
        hasInfo: false
      };
    }
    
    // Generate RAG response
    const context = fencingRAG.formatContext(similarContent);
    const aiResponse = await fencingRAG.generateResponse(query, context);
    
    let responseText = '';
    if (typeof aiResponse === 'object' && aiResponse.answer) {
      responseText = aiResponse.answer;
    } else {
      responseText = typeof aiResponse === 'string' ? aiResponse : 'I found some information but had trouble processing it.';
    }
    
    return {
      success: true,
      result: responseText,
      hasInfo: true,
      categories: [...new Set(similarContent.map(item => item.category))],
      sourcesCount: similarContent.length
    };
    
  } catch (error) {
    console.error('❌ Knowledge search error:', error);
    return {
      success: false,
      result: 'I encountered an issue accessing my knowledge base.',
      hasInfo: false,
      error: error.message
    };
  }
}

module.exports = router;
