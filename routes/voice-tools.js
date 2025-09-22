const express = require('express');
const { EmbeddingService } = require('../services/EmbeddingService');
const { FencingRAG } = require('../services/FencingRAG');

const router = express.Router();

// Initialize services
const embeddingService = new EmbeddingService();
const fencingRAG = new FencingRAG();

/**
 * Tool for voice agent to search knowledge base
 * POST /api/voice-tools/search-knowledge
 */
router.post('/search-knowledge', async (req, res) => {
  try {
    console.log('🔍 Voice agent knowledge search endpoint called');
    console.log('📝 Request body:', req.body);
    
    const { query } = req.body;
    
    if (!query) {
      console.log('❌ No query provided');
      return res.status(400).json({
        error: 'Query is required',
        result: 'I need a search query to help you.'
      });
    }
    
    console.log(`🔍 Voice agent searching knowledge base for: "${query}"`);
    console.log('🔧 Environment check:');
    console.log('  - OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'SET' : 'MISSING');
    console.log('  - MONGODB_URI:', process.env.MONGODB_URI ? 'SET' : 'MISSING');
    
    // Search for similar content (fewer results for voice responses)
    console.log('📊 Calling embeddingService.searchSimilarContent...');
    const similarContent = await embeddingService.searchSimilarContent(query, 3);
    console.log(`📊 Found ${similarContent.length} similar content items:`, similarContent);
    
    if (similarContent.length === 0) {
      console.log('⚠️ No similar content found in knowledge base');
      return res.json({
        success: true,
        result: 'I don\'t have specific information about that in my knowledge base. Let me connect you with one of our fencing experts who can help you directly.',
        hasInfo: false
      });
    }
    
    // Generate RAG response optimized for voice
    console.log('🤖 Formatting context and generating AI response...');
    const context = fencingRAG.formatContext(similarContent);
    console.log('📄 Formatted context length:', context.length);
    
    const aiResponse = await fencingRAG.generateResponse(
      query + ' (Please provide a concise response suitable for voice conversation)', 
      context
    );
    console.log('🤖 AI Response:', aiResponse);
    
    // Handle structured response
    let responseText = '';
    if (typeof aiResponse === 'object' && aiResponse.answer) {
      responseText = aiResponse.answer;
    } else {
      responseText = typeof aiResponse === 'string' ? aiResponse : 'I found some information but had trouble processing it. Let me connect you with our team.';
    }
    
    const response = {
      success: true,
      result: responseText,
      hasInfo: true,
      categories: [...new Set(similarContent.map(item => item.category))],
      sourcesCount: similarContent.length
    };
    
    console.log('✅ Sending successful response:', response);
    res.json(response);
    
  } catch (error) {
    console.error('❌ Error in voice agent knowledge search:', error);
    console.error('❌ Error stack:', error.stack);
    
    const errorResponse = {
      success: true,
      result: 'I encountered an issue accessing my knowledge base. Please contact our office and one of our fencing experts will be happy to help you.',
      hasInfo: false,
      error: error.message
    };
    
    console.log('❌ Sending error response:', errorResponse);
    res.status(200).json(errorResponse);
  }
});

// Test endpoint to verify knowledge base search
router.get('/test-db', async (req, res) => {
  try {
    console.log('🔍 Testing direct MongoDB access...');
    
    const db = await embeddingService.getDatabase();
    const collection = db.collection('knowledge_embeddings');
    
    // Get sample documents
    const documents = await collection.find({}).limit(3).toArray();
    console.log(`Found ${documents.length} documents in MongoDB`);
    
    if (documents.length > 0) {
      console.log('Sample document structure:', {
        id: documents[0]._id,
        hasText: !!documents[0].text,
        hasEmbedding: !!documents[0].embedding,
        textLength: documents[0].text ? documents[0].text.length : 0,
        embeddingLength: documents[0].embedding ? documents[0].embedding.length : 0,
        metadata: documents[0].metadata
      });
    }
    
    res.json({
      success: true,
      totalDocuments: documents.length,
      sampleDocuments: documents.map(doc => ({
        contentId: doc.metadata?.contentId,
        category: doc.metadata?.category,
        title: doc.metadata?.title,
        textPreview: doc.text ? doc.text.substring(0, 100) + '...' : 'No text',
        hasEmbedding: !!doc.embedding,
        embeddingDimensions: doc.embedding ? doc.embedding.length : 0
      }))
    });
    
  } catch (error) {
    console.error('❌ MongoDB test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Test endpoint to verify knowledge base search
router.get('/test-vector', async (req, res) => {
  try {
    console.log('🧪 Testing direct MongoDB Atlas Vector Search...');
    
    const testQuery = req.query.q || 'wood fence';
    console.log(`🔍 Test query: "${testQuery}"`);
    
    // Test MongoDB connection and collection
    const db = await embeddingService.getDatabase();
    const collection = db.collection('knowledge_base');
    const count = await collection.countDocuments();
    console.log(`📊 knowledge_base collection has ${count} documents`);
    
    // Generate embedding for the test query
    console.log('🔍 Generating embedding for query...');
    const embedding = await embeddingService.embeddings.embedQuery(testQuery);
    console.log(`📊 Generated embedding with ${embedding.length} dimensions`);
    
    // Test direct Atlas vector search
    console.log('🔍 Testing direct Atlas vector search...');
    const vectorSearchResults = await collection.aggregate([
      {
        "$vectorSearch": {
          "index": "vector_index",
          "path": "embedding",
          "queryVector": embedding,
          "numCandidates": 10,
          "limit": 3
        }
      },
      {
        "$project": {
          "text": 1,
          "metadata": 1,
          "score": { "$meta": "vectorSearchScore" }
        }
      }
    ]).toArray();
    
    console.log(`📊 Direct vector search found ${vectorSearchResults.length} results`);
    
    // Now test the embedding service
    console.log('🔍 Testing embeddingService.searchSimilarContent...');
    const similarContent = await embeddingService.searchSimilarContent(testQuery, 3);
    console.log(`📊 Found ${similarContent.length} results:`);
    similarContent.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.title} (${item.category})`);
    });
    
    res.json({
      success: true,
      query: testQuery,
      collectionCount: count,
      embeddingDimensions: embedding.length,
      directVectorSearchResults: vectorSearchResults.length,
      langchainResults: similarContent.length,
      directResults: vectorSearchResults.map(result => ({
        text: result.text.substring(0, 100) + '...',
        score: result.score,
        metadata: result.metadata
      })),
      langchainResults: similarContent
    });
    
  } catch (error) {
    console.error('❌ Test search error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

module.exports = router;
