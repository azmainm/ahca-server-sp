#!/usr/bin/env node

/**
 * Process Core Knowledge via API
 * 
 * This script calls the knowledge processing API to set up only the core knowledge files.
 * It assumes the server is running with proper environment variables.
 */

const axios = require('axios');

const SERVER_URL = 'http://localhost:3001'; // Adjust if different
const API_ENDPOINT = '/api/knowledge/process-core-knowledge';

async function processCoreKnowledge() {
  console.log('🚀 Processing SherpaPrompt Core Knowledge via API');
  console.log(`📡 Server: ${SERVER_URL}`);
  console.log(`🎯 Endpoint: ${API_ENDPOINT}`);
  console.log('');

  try {
    console.log('📤 Sending request...');
    const response = await axios.post(`${SERVER_URL}${API_ENDPOINT}`, {}, {
      timeout: 300000, // 5 minutes timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      console.log('✅ SUCCESS! Core knowledge processing completed');
      console.log('');
      console.log('📊 Results:');
      console.log(`📁 Files processed: ${response.data.filesProcessed}`);
      console.log(`📦 Total chunks: ${response.data.totalChunks}`);
      console.log('');
      
      if (response.data.results) {
        console.log('📋 File Details:');
        response.data.results.forEach(result => {
          if (result.error) {
            console.log(`❌ ${result.filename}: ${result.error}`);
          } else {
            console.log(`✅ ${result.filename}: ${result.chunksStored} chunks`);
          }
        });
      }
      
      console.log('');
      console.log('🎯 Next Steps:');
      console.log('1. Test RAG queries with: GET /api/knowledge/search?query=...');
      console.log('2. Update voice agent prompts to reference SherpaPrompt');
      console.log('3. Test end-to-end voice interactions');
      
    } else {
      console.error('❌ API returned error:', response.data.error);
      process.exit(1);
    }

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Connection refused. Is the server running?');
      console.log('💡 Start the server with: npm start');
    } else if (error.response) {
      console.error('❌ API Error:', error.response.status, error.response.data);
    } else {
      console.error('❌ Request failed:', error.message);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  processCoreKnowledge()
    .then(() => {
      console.log('🎉 Core knowledge processing completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Processing failed:', error.message);
      process.exit(1);
    });
}

module.exports = { processCoreKnowledge };
