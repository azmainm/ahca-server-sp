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
   * Call OpenAI Chat Completions API with retry logic
   * @param {Array} messages - Array of message objects
   * @param {string} model - Model to use (default: gpt-5-nano)
   * @param {number} retries - Number of retries (default: 3)
   * @returns {Promise<string>} Response content
   */
  async callOpenAI(messages, model = 'gpt-5-nano', retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.log(`🤖 [OpenAI] Attempt ${attempt}/${retries} - Calling ${model}`);
        
        const response = await fetch(`${this.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
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

      const response = await this.callOpenAI(testMessages, 'gpt-3.5-turbo', 1);
      
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
