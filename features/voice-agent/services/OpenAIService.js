/**
 * OpenAIService - Wrapper for OpenAI API calls
 */

const fetch = require('node-fetch');

class OpenAIService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.baseURL = 'https://api.openai.com/v1';
  }

  /**
   * GPT-5-nano API call - ONLY for gpt-5-nano using responses endpoint
   * @param {Array} messages - Array of message objects
   * @param {string} model - Model to use (always gpt-5-nano)
   * @param {number} retries - Number of retries (default: 3)
   * @param {Object} options - Additional options
   * @returns {Promise<string>} Response content
   */
  async callOpenAI(messages, model = 'gpt-5-nano', retries = 3, options = {}) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`🤖 [OpenAI] Calling gpt-5-nano (attempt ${attempt}/${retries})`);
        
        // Convert messages to GPT-5 format
        const combinedInput = messages
          .map(m => `${m.role.toUpperCase()}: ${m.content}`)
          .join('\n\n');

        const requestBody = {
          model: 'gpt-5-nano',
          input: combinedInput,
          max_output_tokens: options.max_output_tokens || 500,
          reasoning: options.reasoning || { effort: 'minimal' }
        };
        
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ [OpenAI] API error ${response.status}: ${errorText}`);
          
          if ((response.status === 503 || response.status === 429) && attempt < retries) {
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`⏳ [OpenAI] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log(`✅ [OpenAI] Success`);
        
        // Extract GPT-5 response text
        if (data.output_text) {
          return data.output_text;
        }
        
        // Check if response is complete
        if (data.status === 'incomplete') {
          console.log('⚠️ [OpenAI] Response incomplete, reason:', data.incomplete_details?.reason);
        }
        
        // Look for message content in output array
        if (Array.isArray(data.output)) {
          for (const item of data.output) {
            if (item.type === 'message' && Array.isArray(item.content)) {
              const texts = item.content
                .filter(part => part?.text && part?.type !== 'reasoning')
                .map(part => part.text);
              if (texts.length > 0) {
                return texts.join('\n');
              }
            }
          }
        }
        
        // If no message found, return empty string
        console.log('⚠️ [OpenAI] No text content found in response');
        return '';
        
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

  /**
   * Call OpenAI Whisper API for speech-to-text
   * @param {Buffer} audioBuffer - Audio buffer
   * @param {string} filename - Filename for the audio
   * @param {string} contentType - Content type of the audio
   * @returns {Promise<Object>} Transcription result
   */
  async transcribeAudio(audioBuffer, filename = 'audio.webm', contentType = 'audio/webm') {
    try {
      const FormData = require('form-data');
      
      // Prepare form data for Whisper API
      const formData = new FormData();
      formData.append('file', audioBuffer, {
        filename,
        contentType
      });
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');

      // Call OpenAI Whisper API
      const response = await fetch(`${this.baseURL}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          ...formData.getHeaders()
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [OpenAI] Whisper API error:', errorText);
        throw new Error(`Transcription failed: ${response.status} - ${errorText}`);
      }

      const transcriptionData = await response.json();
      return {
        success: true,
        text: transcriptionData.text
      };

    } catch (error) {
      console.error('❌ [OpenAI] Transcription error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Call OpenAI TTS API for text-to-speech
   * @param {string} text - Text to synthesize
   * @param {string} voice - Voice to use (default: alloy)
   * @param {string} model - TTS model to use (default: tts-1)
   * @returns {Promise<Object>} Synthesis result
   */
  async synthesizeText(text, voice = 'alloy', model = 'tts-1') {
    try {
      // Call OpenAI TTS API
      const response = await fetch(`${this.baseURL}/audio/speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          voice,
          input: text,
          response_format: 'mp3'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [OpenAI] TTS error:', errorText);
        throw new Error(`Speech synthesis failed: ${response.status} - ${errorText}`);
      }

      const audioBuffer = await response.buffer();
      const audioBase64 = audioBuffer.toString('base64');

      return {
        success: true,
        audio: audioBase64,
        size: audioBuffer.length
      };

    } catch (error) {
      console.error('❌ [OpenAI] TTS error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test OpenAI API connectivity
   * @returns {Promise<Object>} Test result
   */
  async testConnection() {
    try {
      const testMessages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "API connection test successful"' }
      ];

      const response = await this.callOpenAI(testMessages, 'gpt-5-nano', 1);
      
      return {
        success: true,
        message: 'OpenAI API connection successful',
        response: response
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if API key is configured
   * @returns {boolean} Whether API key is set
   */
  isConfigured() {
    return !!this.apiKey;
  }

  /**
   * Get API key status (masked for security)
   * @returns {string} Masked API key status
   */
  getApiKeyStatus() {
    if (!this.apiKey) {
      return 'Not configured';
    }
    
    const keyLength = this.apiKey.length;
    if (keyLength < 10) {
      return 'Invalid (too short)';
    }
    
    const masked = this.apiKey.substring(0, 7) + '...' + this.apiKey.substring(keyLength - 4);
    return `Configured: ${masked}`;
  }
}

module.exports = { OpenAIService };
