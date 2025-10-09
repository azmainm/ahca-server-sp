/**
 * AudioConverter - Convert WebM audio to PCM16 for OpenAI Realtime API
 */

const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

class AudioConverter {
  constructor() {
    this.tempDir = path.join(__dirname, '../../../uploads/temp');
    
    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Convert WebM audio buffer to PCM16 format for OpenAI Realtime API
   * @param {Buffer} webmBuffer - WebM audio buffer
   * @param {string} sessionId - Session ID for temp file naming
   * @returns {Promise<Buffer>} PCM16 audio buffer
   */
  async convertWebMToPCM16(webmBuffer, sessionId) {
    const inputPath = path.join(this.tempDir, `input_${sessionId}_${Date.now()}.webm`);
    const outputPath = path.join(this.tempDir, `output_${sessionId}_${Date.now()}.raw`);

    try {
      // Write WebM buffer to temp file
      fs.writeFileSync(inputPath, webmBuffer);

      // Convert to PCM16 using ffmpeg
      await new Promise((resolve, reject) => {
        ffmpeg(inputPath)
          .audioCodec('pcm_s16le')  // PCM 16-bit little-endian
          .audioChannels(1)         // Mono
          .audioFrequency(24000)    // 24kHz (OpenAI Realtime API requirement)
          .format('s16le')          // Raw PCM format
          .output(outputPath)
          .on('end', resolve)
          .on('error', reject)
          .run();
      });

      // Read converted PCM16 data
      const pcm16Buffer = fs.readFileSync(outputPath);

      // Cleanup temp files
      this.cleanupTempFiles([inputPath, outputPath]);

      console.log('✅ [AudioConverter] Converted WebM to PCM16:', webmBuffer.length, '→', pcm16Buffer.length, 'bytes');
      
      return pcm16Buffer;

    } catch (error) {
      console.error('❌ [AudioConverter] Conversion failed:', error);
      
      // Cleanup temp files on error
      this.cleanupTempFiles([inputPath, outputPath]);
      
      throw new Error(`Audio conversion failed: ${error.message}`);
    }
  }

  /**
   * Clean up temporary files
   * @param {string[]} filePaths - Array of file paths to delete
   */
  cleanupTempFiles(filePaths) {
    filePaths.forEach(filePath => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.warn('⚠️ [AudioConverter] Failed to cleanup temp file:', filePath, error.message);
      }
    });
  }

  /**
   * Clean up old temp files (older than 1 hour)
   */
  cleanupOldTempFiles() {
    try {
      const files = fs.readdirSync(this.tempDir);
      const oneHourAgo = Date.now() - (60 * 60 * 1000);

      files.forEach(file => {
        const filePath = path.join(this.tempDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime.getTime() < oneHourAgo) {
          fs.unlinkSync(filePath);
          console.log('🧹 [AudioConverter] Cleaned up old temp file:', file);
        }
      });
    } catch (error) {
      console.warn('⚠️ [AudioConverter] Failed to cleanup old temp files:', error.message);
    }
  }
}

module.exports = { AudioConverter };
