#!/usr/bin/env node

/**
 * Direct Core Knowledge Setup
 * 
 * Processes only the core knowledge files directly without API calls.
 * Based on the working setup-sherpaprompt-knowledge.js but simplified.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const { EmbeddingService } = require('../shared/services/EmbeddingService');

// Core knowledge files only
const CORE_KNOWLEDGE_FILES = [
  {
    filename: 'company_mission_1.1.json',
    description: 'Company mission, values, and core messaging'
  },
  {
    filename: 'product_knowledge_1.2.json', 
    description: 'Product features, capabilities, and integrations'
  },
  {
    filename: 'pricing_1.1.json',
    description: 'Pricing tiers, trial information, and billing'
  }
];

const KNOWLEDGE_DIR = path.join(__dirname, '../data/SherpaPrompt_AHCA_Knowledge');

async function setupCoreKnowledge() {
  console.log('🚀 Starting SherpaPrompt CORE knowledge base setup...');
  console.log('📋 Processing only core knowledge files for vector embeddings');
  console.log('🏠 Keeping playbooks and troubleshooting as local reference files');
  console.log('');

  // Validate environment
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is required');
  }
  if (!process.env.OPENAI_API_KEY_CALL_AGENT) {
    throw new Error('OPENAI_API_KEY_CALL_AGENT environment variable is required');
  }
  console.log('✅ Environment variables validated');

  const embeddingService = new EmbeddingService();
  
  try {
    // Clear existing embeddings
    console.log('🧹 Clearing all existing embeddings (including old fencing data)...');
    const clearResult = await embeddingService.clearAllEmbeddings();
    console.log(`🗑️ Cleared ${clearResult.deletedCount || 0} total embeddings from collection`);
    console.log('✅ All existing embeddings cleared');
    console.log('');

    console.log(`🔄 Processing ${CORE_KNOWLEDGE_FILES.length} core knowledge files...`);
    console.log('');

    let totalChunks = 0;
    const results = [];

    // Process each core knowledge file
    for (const fileInfo of CORE_KNOWLEDGE_FILES) {
      const { filename, description } = fileInfo;
      
      console.log(`📋 Processing: ${description}`);
      console.log(`📖 Reading ${filename}...`);
      
      try {
        const filePath = path.join(KNOWLEDGE_DIR, filename);
        let fileData = await fs.readFile(filePath, 'utf8');
        
        // Apply encoding fixes
        fileData = fileData
          .replace(/â€"/g, '—')    // Fix em-dash encoding
          .replace(/â€™/g, "'")    // Fix apostrophe encoding
          .replace(/â€œ/g, '"')    // Fix left double quote
          .replace(/â€/g, '"')     // Fix right double quote
          .replace(/â€¦/g, '...')  // Fix ellipsis encoding
          .replace(/Â/g, '')       // Remove extra Â characters
          .replace(/\u00A0/g, ' '); // Replace non-breaking spaces

        const jsonData = JSON.parse(fileData);
        console.log(`✅ ${filename} loaded successfully`);
        
        // Process the document
        const result = await embeddingService.processSherpaPromptDocument(jsonData, filename);
        console.log(`✅ ${filename} processed: ${result.chunksStored} chunks created`);
        
        totalChunks += result.chunksStored;
        results.push({ filename, chunksStored: result.chunksStored });
        
      } catch (error) {
        console.log(`❌ Error processing ${filename}: ${error.message}`);
        results.push({ filename, error: error.message, chunksStored: 0 });
      }
      
      console.log('');
    }

    // Summary
    console.log('📊 CORE KNOWLEDGE SETUP COMPLETE!');
    console.log('='.repeat(50));
    console.log(`📁 Files processed: ${results.filter(r => !r.error).length}/${CORE_KNOWLEDGE_FILES.length}`);
    console.log(`📦 Total chunks stored: ${totalChunks}`);
    console.log('');
    
    console.log('📋 Results:');
    results.forEach(result => {
      if (result.error) {
        console.log(`❌ ${result.filename}: ERROR - ${result.error}`);
      } else {
        console.log(`✅ ${result.filename}: ${result.chunksStored} chunks`);
      }
    });
    
    console.log('');
    console.log('🏠 Local Reference Files (not processed):');
    console.log('- audience_playbooks_1.2.json (conversation patterns)');
    console.log('- support_troubleshooting_1.2.json (internal procedures)');
    console.log('- Intent Snippets_1.3.json (intent classification)');
    console.log('- call_service_* files (system configuration)');
    
    console.log('');
    console.log('🎯 Next Steps:');
    console.log('1. Test RAG queries with the new knowledge base');
    console.log('2. Update voice agent prompts to reference SherpaPrompt');
    console.log('3. Configure local reference files for conversation logic');
    console.log('4. Test end-to-end voice interactions');

  } catch (error) {
    console.error('❌ Error setting up SherpaPrompt core knowledge base:', error.message);
    console.log('');
    console.log('🔧 Troubleshooting:');
    console.log('1. Check that all JSON files exist in data/SherpaPrompt_AHCA_Knowledge/');
    console.log('2. Verify MongoDB connection and credentials');
    console.log('3. Ensure OpenAI API key is valid and has credits');
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  setupCoreKnowledge()
    .then(() => {
      console.log('🎉 Core knowledge setup completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Setup failed:', error.message);
      process.exit(1);
    });
}

module.exports = { setupCoreKnowledge };
