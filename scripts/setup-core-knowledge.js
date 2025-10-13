#!/usr/bin/env node

/**
 * SherpaPrompt Core Knowledge Base Setup
 * 
 * Processes only the core knowledge files for vector embeddings:
 * - company_mission_1.1.json
 * - product_knowledge_1.2.json  
 * - pricing_1.1.json
 * 
 * Other files (playbooks, troubleshooting, etc.) are kept as local reference.
 */

const path = require('path');
const fs = require('fs');
const { EmbeddingService } = require('../shared/services/EmbeddingService');

// Core knowledge files to process for vector embeddings
const CORE_KNOWLEDGE_FILES = [
  'company_mission_1.1.json',
  'product_knowledge_1.2.json',
  'pricing_1.1.json'
];

const KNOWLEDGE_DIR = path.join(__dirname, '../data/SherpaPrompt_AHCA_Knowledge');

async function setupCoreKnowledge() {
  console.log('🚀 Starting SherpaPrompt Core Knowledge Base Setup');
  console.log('📋 Processing only core knowledge files for vector embeddings\n');

  const embeddingService = new EmbeddingService();
  
  try {
    // Clear existing embeddings
    console.log('🧹 Clearing existing knowledge base...');
    await embeddingService.clearAllEmbeddings();
    console.log('✅ Existing embeddings cleared\n');

    let totalProcessed = 0;
    let totalChunks = 0;
    const results = [];

    // Process each core knowledge file
    for (const filename of CORE_KNOWLEDGE_FILES) {
      const filePath = path.join(KNOWLEDGE_DIR, filename);
      
      console.log(`📄 Processing: ${filename}`);
      
      try {
        // Check if file exists
        if (!fs.existsSync(filePath)) {
          console.warn(`⚠️ File not found: ${filename}, skipping...`);
          continue;
        }

        // Read and parse JSON
        let fileData = fs.readFileSync(filePath, 'utf8');
        
        // Apply encoding fixes
        fileData = fileData
          .replace(/â€"/g, '—')    // Fix em-dash encoding
          .replace(/â€™/g, "'")    // Fix apostrophe encoding
          .replace(/â€œ/g, '"')    // Fix left double quote
          .replace(/â€/g, '"')     // Fix right double quote
          .replace(/â€¦/g, '...')  // Fix ellipsis encoding
          .replace(/Â/g, '')       // Remove extra Â characters
          .replace(/\u00A0/g, ' '); // Replace non-breaking spaces

        let jsonData;
        try {
          jsonData = JSON.parse(fileData);
        } catch (parseError) {
          console.error(`❌ JSON parsing failed for ${filename}:`, parseError.message);
          results.push({ filename, error: parseError.message, chunksStored: 0 });
          continue;
        }

        // Process the document
        const result = await embeddingService.processSherpaPromptDocument(jsonData, filename);
        
        console.log(`✅ ${filename}: ${result.chunksStored} chunks stored`);
        
        totalProcessed++;
        totalChunks += result.chunksStored;
        results.push({ filename, ...result });

      } catch (error) {
        console.error(`❌ Error processing ${filename}:`, error.message);
        results.push({ filename, error: error.message, chunksStored: 0 });
      }
      
      console.log(''); // Empty line for readability
    }

    // Summary
    console.log('📊 CORE KNOWLEDGE SETUP COMPLETE');
    console.log('='.repeat(50));
    console.log(`📁 Files processed: ${totalProcessed}/${CORE_KNOWLEDGE_FILES.length}`);
    console.log(`📦 Total chunks stored: ${totalChunks}`);
    console.log('');

    // Detailed results
    console.log('📋 Detailed Results:');
    results.forEach(result => {
      if (result.error) {
        console.log(`❌ ${result.filename}: ERROR - ${result.error}`);
      } else {
        console.log(`✅ ${result.filename}: ${result.chunksStored} chunks`);
      }
    });

    console.log('');
    console.log('🎯 Next Steps:');
    console.log('1. Test RAG queries with the new knowledge base');
    console.log('2. Update voice agent prompts to reference SherpaPrompt');
    console.log('3. Configure local reference files for conversation logic');
    console.log('4. Test end-to-end voice interactions');

  } catch (error) {
    console.error('💥 Fatal error during setup:', error);
    process.exit(1);
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
      console.error('💥 Setup failed:', error);
      process.exit(1);
    });
}

module.exports = { setupCoreKnowledge, CORE_KNOWLEDGE_FILES };
