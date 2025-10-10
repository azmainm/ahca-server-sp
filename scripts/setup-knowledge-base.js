#!/usr/bin/env node

/**
 * Setup script to process the knowledge base and generate embeddings
 * Run with: node scripts/setup-knowledge-base.js
 */

const { EmbeddingService } = require('../shared/services/EmbeddingService');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function setupKnowledgeBase() {
  const embeddingService = new EmbeddingService();
  
  try {
    console.log('🚀 Starting knowledge base setup...');
    
    // Check if MONGODB_URI and OPENAI_API_KEY_CALL_AGENT are set
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }
    if (!process.env.OPENAI_API_KEY_CALL_AGENT) {
      throw new Error('OPENAI_API_KEY_CALL_AGENT environment variable is not set');
    }
    
    console.log('✅ Environment variables validated');
    
    // Read the knowledge base file
    const knowledgeBasePath = path.join(__dirname, '../data/knowldge_base_dummy.json');
    console.log(`📖 Reading knowledge base from: ${knowledgeBasePath}`);
    
    const knowledgeBaseData = await fs.readFile(knowledgeBasePath, 'utf8');
    const knowledgeBase = JSON.parse(knowledgeBaseData);
    
    console.log('✅ Knowledge base loaded successfully');
    
    // Clear ALL existing embeddings from knowledge_base collection
    console.log('🧹 Clearing all existing embeddings from knowledge_base collection...');
    await embeddingService.clearAllEmbeddings();
    console.log('✅ All existing embeddings cleared');
    
    // Process the knowledge base into embeddings
    console.log('🔄 Processing knowledge base into embeddings...');
    const result = await embeddingService.processKnowledgeBase(
      knowledgeBase.knowledge_base,
      'sherpaprompt_fencing_kb'
    );
    
    console.log('✅ Knowledge base processing completed!');
    console.log(`📊 Results:`);
    console.log(`   - Total sections processed: ${result.totalSections}`);
    console.log(`   - Total chunks created: ${result.totalChunks}`);
    console.log(`   - Model used: text-embedding-3-small`);
    console.log(`   - Vector index: vector_index`);
    
    console.log('\n📋 Processed sections:');
    result.results.forEach(section => {
      console.log(`   - ${section.id} (${section.category}): ${section.chunksStored} chunks`);
    });
    
    console.log('\n🎉 Knowledge base setup complete!');
    console.log('The voice agent can now access fencing information from the knowledge base.');
    
  } catch (error) {
    console.error('❌ Error setting up knowledge base:', error.message);
    process.exit(1);
  } finally {
    await embeddingService.close();
  }
}

// Run the setup
setupKnowledgeBase();
