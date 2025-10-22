#!/usr/bin/env node

/**
 * Setup Business Knowledge Base - Process knowledge documents for a specific business
 * 
 * This script processes knowledge base documents for a specific business and stores
 * them in the business-specific MongoDB collection with vector embeddings.
 * 
 * Usage:
 *   node setup-business-knowledge.js --businessId=acme-corp
 *   node setup-business-knowledge.js --businessId=acme-corp --clear
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs').promises;
const { EmbeddingService } = require('../../shared/services/EmbeddingService');
const { BusinessConfigService } = require('../../shared/services/BusinessConfigService');

// Command line argument parsing
const args = process.argv.slice(2);
const getArg = (name) => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : null;
};

const hasFlag = (name) => args.includes(`--${name}`);

const businessId = getArg('businessId');
const clearExisting = hasFlag('clear');

// Validation
if (!businessId) {
  console.error('❌ Missing required argument: --businessId');
  console.log('Usage: node setup-business-knowledge.js --businessId=acme-corp [--clear]');
  process.exit(1);
}

console.log('📚 Setting up knowledge base for business...');
console.log(`📋 Business ID: ${businessId}`);
if (clearExisting) {
  console.log('🗑️ Will clear existing embeddings first');
}
console.log('');

async function setupBusinessKnowledge() {
  try {
    // Step 1: Initialize business config service
    console.log('🏢 Step 1: Loading business configuration...');
    const businessConfigService = new BusinessConfigService();
    await businessConfigService.initialize();
    
    const businessConfig = businessConfigService.getBusinessConfig(businessId);
    if (!businessConfig) {
      console.error(`❌ Business configuration not found for: ${businessId}`);
      console.log('Make sure you have run setup-new-business.js first.');
      process.exit(1);
    }
    
    console.log(`✅ Loaded config for: ${businessConfig.businessName}`);
    console.log(`📊 Collection: ${businessConfig.database.collectionName}`);
    console.log(`🔍 Vector Index: ${businessConfig.database.vectorIndexName}`);

    // Step 2: Initialize embedding service for this business
    console.log('🧠 Step 2: Initializing embedding service...');
    const embeddingService = EmbeddingService.createForBusiness(businessConfig);
    console.log(`✅ Embedding service configured for business: ${businessId}`);

    // Step 3: Clear existing embeddings if requested
    if (clearExisting) {
      console.log('🗑️ Step 3: Clearing existing embeddings...');
      const clearResult = await embeddingService.clearAllEmbeddings();
      console.log(`✅ Cleared ${clearResult} embeddings from collection`);
    } else {
      console.log('⏭️ Step 3: Skipping clear (use --clear flag to clear existing embeddings)');
    }

    // Step 4: Find knowledge base files
    console.log('📁 Step 4: Finding knowledge base files...');
    const knowledgeDir = path.join(__dirname, `../../data/businesses/${businessId}/knowledge`);
    
    let knowledgeFiles;
    try {
      const files = await fs.readdir(knowledgeDir);
      knowledgeFiles = files.filter(file => file.endsWith('.json'));
    } catch (error) {
      console.error(`❌ Could not read knowledge directory: ${knowledgeDir}`);
      console.log('Make sure the knowledge directory exists and contains JSON files.');
      process.exit(1);
    }
    
    if (knowledgeFiles.length === 0) {
      console.warn('⚠️ No JSON knowledge files found in the knowledge directory');
      console.log(`Directory: ${knowledgeDir}`);
      console.log('Add your knowledge base JSON files to this directory and run the script again.');
      process.exit(0);
    }
    
    console.log(`✅ Found ${knowledgeFiles.length} knowledge files:`);
    knowledgeFiles.forEach(file => console.log(`   📄 ${file}`));

    // Step 5: Process each knowledge file
    console.log('🔄 Step 5: Processing knowledge files...');
    let totalChunks = 0;
    const results = [];

    for (const filename of knowledgeFiles) {
      console.log(`\n📖 Processing: ${filename}`);
      
      try {
        const filePath = path.join(knowledgeDir, filename);
        let fileData = await fs.readFile(filePath, 'utf8');
        
        // Apply encoding fixes (same as original script)
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
        
        // Process the document using the business-specific embedding service
        const result = await embeddingService.processSherpaPromptDocument(jsonData, filename);
        console.log(`✅ ${filename} processed: ${result.chunksStored} chunks created`);
        
        totalChunks += result.chunksStored;
        results.push({ 
          filename, 
          chunksStored: result.chunksStored,
          sectionsProcessed: result.sectionsProcessed || 0
        });
        
      } catch (error) {
        console.error(`❌ Error processing ${filename}: ${error.message}`);
        results.push({ 
          filename, 
          error: error.message, 
          chunksStored: 0,
          sectionsProcessed: 0
        });
      }
    }

    // Step 6: Display results
    console.log('\n📊 Processing Results:');
    console.log('═'.repeat(60));
    
    results.forEach(result => {
      if (result.error) {
        console.log(`❌ ${result.filename}: ERROR - ${result.error}`);
      } else {
        console.log(`✅ ${result.filename}: ${result.chunksStored} chunks (${result.sectionsProcessed} sections)`);
      }
    });
    
    console.log('═'.repeat(60));
    console.log(`📈 Total: ${totalChunks} chunks stored in collection "${businessConfig.database.collectionName}"`);
    
    const successCount = results.filter(r => !r.error).length;
    const errorCount = results.filter(r => r.error).length;
    
    console.log(`✅ Successfully processed: ${successCount} files`);
    if (errorCount > 0) {
      console.log(`❌ Failed to process: ${errorCount} files`);
    }

    // Step 7: Verification
    console.log('\n🧪 Verification:');
    console.log('You can now test the knowledge base by:');
    console.log(`1. Calling the business phone number: ${businessConfig.phoneNumber}`);
    console.log('2. Asking questions about the business services');
    console.log('3. Checking the MongoDB collection for stored embeddings');
    console.log('');
    console.log('If the voice agent cannot find information, check:');
    console.log('- The MongoDB Atlas Vector Search index is active');
    console.log('- The knowledge files contain relevant information');
    console.log('- The business configuration is correct');
    
    console.log('\n✅ Knowledge base setup completed!');
    
  } catch (error) {
    console.error('❌ Error setting up knowledge base:', error);
    process.exit(1);
  }
}

// Run the setup
setupBusinessKnowledge();
