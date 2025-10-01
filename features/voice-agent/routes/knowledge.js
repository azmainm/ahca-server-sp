const express = require('express');
const { EmbeddingService } = require('../../../shared/services/EmbeddingService');
const { FencingRAG } = require('../../../shared/services/FencingRAG');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

// Initialize services
const embeddingService = new EmbeddingService();
const fencingRAG = new FencingRAG();

/**
 * Process knowledge base and generate embeddings
 * POST /api/knowledge/process
 */
router.post('/process', async (req, res) => {
  try {
    console.log('Starting knowledge base processing...');
    
    // Read the knowledge base file
    const knowledgeBasePath = path.join(__dirname, '../../../docs/knowldge_base_dummy.json');
    const knowledgeBaseData = await fs.readFile(knowledgeBasePath, 'utf8');
    const knowledgeBase = JSON.parse(knowledgeBaseData);
    
    console.log('Knowledge base loaded successfully');
    
    // Process the knowledge base into embeddings
    const result = await embeddingService.processKnowledgeBase(
      knowledgeBase.knowledge_base,
      'sherpaprompt_fencing_kb'
    );
    
    console.log('Knowledge base processing completed:', result);
    
    res.json({
      success: true,
      message: 'Knowledge base processed successfully',
      totalSections: result.totalSections,
      totalChunks: result.totalChunks,
      results: result.results,
      model: 'text-embedding-3-small',
      vectorIndex: 'vector_index'
    });
    
  } catch (error) {
    console.error('Error processing knowledge base:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process knowledge base',
      message: error.message
    });
  }
});

/**
 * Check if knowledge base embeddings exist
 * GET /api/knowledge/status
 */
router.get('/status', async (req, res) => {
  try {
    const hasEmbeddings = await embeddingService.checkExistingEmbeddings('sherpaprompt_fencing_kb');
    
    res.json({
      success: true,
      hasEmbeddings,
      knowledgeBaseId: 'sherpaprompt_fencing_kb',
      collectionName: embeddingService.EMBEDDINGS_COLLECTION,
      indexName: embeddingService.VECTOR_INDEX_NAME
    });
    
  } catch (error) {
    console.error('Error checking knowledge base status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check knowledge base status',
      message: error.message
    });
  }
});

/**
 * Search knowledge base using RAG
 * POST /api/knowledge/search
 */
router.post('/search', async (req, res) => {
  try {
    const { query, maxResults = 5 } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }
    
    console.log(`Searching knowledge base for: "${query}"`);
    
    // Search for similar content
    const similarContent = await embeddingService.searchSimilarContent(query, maxResults);
    
    // Generate RAG response
    const context = fencingRAG.formatContext(similarContent);
    const aiResponse = await fencingRAG.generateResponse(query, context);
    
    // Handle structured response
    let responseText = '';
    let confidence = 'medium';
    let followUpQuestions = [];
    
    if (typeof aiResponse === 'object' && aiResponse.answer) {
      responseText = aiResponse.answer;
      confidence = aiResponse.confidence || 'medium';
      followUpQuestions = aiResponse.follow_up_questions || [];
    } else {
      responseText = typeof aiResponse === 'string' ? aiResponse : 'I apologize, but I encountered an issue processing your request.';
    }
    
    // Generate contextual follow-up questions if none provided
    if (followUpQuestions.length === 0) {
      followUpQuestions = fencingRAG.generateFollowUpQuestions(query, similarContent);
    }
    
    res.json({
      success: true,
      query,
      response: responseText,
      confidence,
      followUpQuestions,
      sources: similarContent.map(item => ({
        contentId: item.contentId,
        category: item.category,
        type: item.type,
        title: item.title,
        preview: item.content.substring(0, 200) + (item.content.length > 200 ? '...' : ''),
        chunkIndex: item.chunkIndex
      })),
      contextUsed: similarContent.length > 0,
      resultsFound: similarContent.length
    });
    
  } catch (error) {
    console.error('Error searching knowledge base:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search knowledge base',
      message: error.message
    });
  }
});

/**
 * Get knowledge base categories and content overview
 * GET /api/knowledge/overview
 */
router.get('/overview', async (req, res) => {
  try {
    const database = await embeddingService.getDatabase();
    const embeddingsCollection = database.collection(embeddingService.EMBEDDINGS_COLLECTION);
    
    // Get category breakdown
    const categoryAggregation = await embeddingsCollection.aggregate([
      { $match: { contentId: { $regex: /^(company_info|service_|faq_|pricing_|emergency_|objection_|company_advantages)/ } } },
      { $group: { _id: "$category", count: { $sum: 1 }, types: { $addToSet: "$type" } } },
      { $sort: { _id: 1 } }
    ]).toArray();
    
    // Get total chunks count
    const totalChunks = await embeddingsCollection.countDocuments({
      contentId: { $regex: /^(company_info|service_|faq_|pricing_|emergency_|objection_|company_advantages)/ }
    });
    
    res.json({
      success: true,
      totalChunks,
      categories: categoryAggregation.map(cat => ({
        category: cat._id,
        chunkCount: cat.count,
        contentTypes: cat.types
      })),
      knowledgeBaseId: 'sherpaprompt_fencing_kb',
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error getting knowledge base overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get knowledge base overview',
      message: error.message
    });
  }
});

/**
 * Clear knowledge base embeddings
 * DELETE /api/knowledge/clear
 */
router.delete('/clear', async (req, res) => {
  try {
    await embeddingService.removeExistingEmbeddings('sherpaprompt_fencing_kb');
    
    res.json({
      success: true,
      message: 'Knowledge base embeddings cleared successfully'
    });
    
  } catch (error) {
    console.error('Error clearing knowledge base:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear knowledge base',
      message: error.message
    });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing embedding service connection...');
  await embeddingService.close();
});

module.exports = router;
