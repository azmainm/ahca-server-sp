const { OpenAIEmbeddings } = require('@langchain/openai');
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { MongoDBAtlasVectorSearch } = require('@langchain/mongodb');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

/**
 * Embedding Service for generating, storing, and retrieving embeddings
 */
class EmbeddingService {
  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      model: "text-embedding-3-small",
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Improved text splitter with better parameters for knowledge base content
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 800,  // Smaller chunks for more precise retrieval
      chunkOverlap: 150,  // Reduced overlap to avoid redundancy
      separators: ['\n\n', '\n', '. ', '? ', '! ', '; ', ': ', ', ', ' '],  // Better semantic boundaries
    });

    this.client = null;
    this.db = null;
    
    // Configuration
    this.MONGODB_URI = process.env.MONGODB_URI;
    this.DATABASE_NAME = "ah-call-service";
    this.EMBEDDINGS_COLLECTION = "knowledge_base";
    this.VECTOR_INDEX_NAME = "vector_index";
  }

  /**
   * Initialize database connection
   */
  async getDatabase() {
    if (!this.db) {
      const start = Date.now();
      console.log(`[EmbeddingService] 🔌 Connecting to MongoDB… uriSet=${!!this.MONGODB_URI}`);
      this.client = new MongoClient(this.MONGODB_URI);
      await this.client.connect();
      this.db = this.client.db(this.DATABASE_NAME);
      console.log(`[EmbeddingService] ✅ MongoDB connected db="${this.DATABASE_NAME}" in ${Date.now() - start}ms`);
    }
    return this.db;
  }

  /**
   * Initialize Vector Store for MongoDB Atlas Vector Search
   */
  async getVectorStore() {
    const start = Date.now();
    const database = await this.getDatabase();
    console.log(`[EmbeddingService] 📦 Creating MongoDBAtlasVectorSearch on collection="${this.EMBEDDINGS_COLLECTION}" index="${this.VECTOR_INDEX_NAME}"`);
    
    const store = new MongoDBAtlasVectorSearch(this.embeddings, {
      collection: database.collection(this.EMBEDDINGS_COLLECTION),
      indexName: this.VECTOR_INDEX_NAME,
      textKey: "text",
      embeddingKey: "embedding",
    });
    console.log(`[EmbeddingService] ✅ Vector store ready in ${Date.now() - start}ms`);
    return store;
  }

  /**
   * Generate hash for content to detect changes
   */
  generateContentHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Process and store content chunks in vector database
   * @param {string} contentId - Unique identifier for the content
   * @param {string} content - Text content to process
   * @param {Object} metadata - Additional metadata for the content
   * @returns {Promise<Object>} Processing results
   */
  async processContentToVectorStore(contentId, content, metadata = {}) {
    try {
      const vectorStore = await this.getVectorStore();
      
      // Split text into chunks using LangChain
      const chunks = await this.textSplitter.splitText(content);
      console.log(`Split content ${contentId} into ${chunks.length} chunks`);
      
      // Prepare documents for vector store
      const documents = chunks.map((chunk, index) => ({
        pageContent: chunk,
        metadata: {
          contentId: contentId,
          chunkIndex: index,
          chunkTotal: chunks.length,
          contentHash: this.generateContentHash(content),
          createdAt: new Date().toISOString(),
          ...metadata // Spread additional metadata
        }
      }));
      
      // Store in vector database
      await vectorStore.addDocuments(documents);
      
      console.log(`Stored ${documents.length} chunks in vector database for content ${contentId}`);
      return {
        chunksStored: documents.length,
        model: "text-embedding-3-small",
        contentHash: this.generateContentHash(content)
      };
      
    } catch (error) {
      console.error('Error processing content to vector store:', error);
      throw error;
    }
  }

  /**
   * Check if content already has embeddings in vector store
   * @param {string} contentId - Unique identifier for the content
   * @returns {Promise<boolean>} Whether embeddings exist
   */
  async checkExistingEmbeddings(contentId) {
    try {
      const database = await this.getDatabase();
      const embeddingsCollection = database.collection(this.EMBEDDINGS_COLLECTION);
      
      const existingEmbeddings = await embeddingsCollection.findOne({
        "contentId": contentId
      });
      
      return !!existingEmbeddings;
    } catch (error) {
      console.error('Error checking existing embeddings:', error);
      return false;
    }
  }

  /**
   * Remove existing embeddings for content
   * @param {string} contentId - Unique identifier for the content
   */
  async removeExistingEmbeddings(contentId) {
    try {
      const database = await this.getDatabase();
      const embeddingsCollection = database.collection(this.EMBEDDINGS_COLLECTION);
      
      const result = await embeddingsCollection.deleteMany({
        "contentId": contentId
      });
      
      console.log(`Removed ${result.deletedCount} existing embeddings for content ${contentId}`);
    } catch (error) {
      console.error('Error removing existing embeddings:', error);
    }
  }

  /**
   * Clear all embeddings from the knowledge base collection
   */
  async clearAllEmbeddings() {
    try {
      const database = await this.getDatabase();
      const embeddingsCollection = database.collection(this.EMBEDDINGS_COLLECTION);
      
      const result = await embeddingsCollection.deleteMany({});
      
      console.log(`🗑️ Cleared ${result.deletedCount} total embeddings from collection`);
      return result.deletedCount;
    } catch (error) {
      console.error('Error clearing all embeddings:', error);
      throw error;
    }
  }

  /**
   * Process a structured knowledge base object into embeddings
   * @param {Object} knowledgeBase - Structured knowledge base object
   * @param {string} contentId - Unique identifier for this knowledge base
   * @returns {Promise<Object>} Processing results
   */
  async processKnowledgeBase(knowledgeBase, contentId = 'knowledge_base') {
    try {
      // Check if embeddings already exist
      const hasExisting = await this.checkExistingEmbeddings(contentId);
      if (hasExisting) {
        console.log(`Embeddings already exist for ${contentId}. Removing old ones...`);
        await this.removeExistingEmbeddings(contentId);
      }

      // Convert knowledge base to searchable text chunks
      const textChunks = this.extractTextFromKnowledgeBase(knowledgeBase);
      const results = [];

      for (const chunk of textChunks) {
        console.log(`Processing ${chunk.id}...`);
        
        const result = await this.processContentToVectorStore(
          chunk.id,
          chunk.content,
          {
            category: chunk.category,
            type: chunk.type,
            sourceSection: chunk.sourceSection,
            title: chunk.title,
            originalId: chunk.originalId
          }
        );

        results.push({
          id: chunk.id,
          category: chunk.category,
          chunksStored: result.chunksStored
        });
      }

      return {
        totalSections: textChunks.length,
        totalChunks: results.reduce((sum, r) => sum + r.chunksStored, 0),
        results: results
      };

    } catch (error) {
      console.error('Error processing knowledge base:', error);
      throw error;
    }
  }

  /**
   * Extract searchable text chunks from structured knowledge base
   * @param {Object} knowledgeBase - Structured knowledge base object
   * @returns {Array} Array of text chunks with metadata
   */
  extractTextFromKnowledgeBase(knowledgeBase) {
    const chunks = [];

    // Process company info with enhanced searchability
    if (knowledgeBase.company_info) {
      const companyInfo = knowledgeBase.company_info;
      let companyText = `COMPANY CONTACT INFORMATION\n\n`;
      companyText += `Company Name: ${companyInfo.name}\n`;
      companyText += `Tagline: ${companyInfo.tagline}\n`;
      companyText += `Established: ${companyInfo.established}\n\n`;
      
      companyText += `CONTACT DETAILS:\n`;
      companyText += `Phone Number: ${companyInfo.phone}\n`;
      companyText += `Call us at: ${companyInfo.phone}\n`;
      companyText += `Email: ${companyInfo.email}\n`;
      companyText += `Website: ${companyInfo.website}\n`;
      companyText += `Address: ${companyInfo.address}\n\n`;
      
      companyText += `SERVICE AREAS:\n`;
      companyText += `We serve: ${companyInfo.service_areas.join(', ')}\n\n`;
      
      if (companyInfo.hours) {
        companyText += `BUSINESS HOURS:\n`;
        companyText += `Monday-Friday: ${companyInfo.hours.monday_friday}\n`;
        companyText += `Saturday: ${companyInfo.hours.saturday}\n`;
        companyText += `Sunday: ${companyInfo.hours.sunday}\n`;
        companyText += `Emergency Service: ${companyInfo.hours.emergency}`;
      }

      chunks.push({
        id: 'company_info',
        category: 'company',
        type: 'contact_info',
        sourceSection: 'company_info',
        title: 'Company Contact Information',
        content: companyText
      });
      
      // Create a separate chunk specifically for contact information to improve retrieval
      let contactText = `CONTACT INFORMATION\n\n`;
      contactText += `To reach SherpaPrompt Fencing Company:\n\n`;
      contactText += `Phone: ${companyInfo.phone}\n`;
      contactText += `Call us directly at: ${companyInfo.phone}\n`;
      contactText += `Email: ${companyInfo.email}\n`;
      contactText += `Website: ${companyInfo.website}\n`;
      contactText += `Office Address: ${companyInfo.address}\n\n`;
      contactText += `For immediate assistance, call ${companyInfo.phone}`;
      
      chunks.push({
        id: 'contact_details',
        category: 'contact',
        type: 'phone_email',
        sourceSection: 'company_info',
        title: 'Phone Number and Contact Details',
        content: contactText
      });
    }

    // Process services
    if (knowledgeBase.services) {
      knowledgeBase.services.forEach((service, index) => {
        let serviceText = `Service: ${service.name}\nCategory: ${service.category}\n`;
        serviceText += `Description: ${service.description}\n`;
        
        if (service.materials) {
          serviceText += `Materials: ${service.materials.join(', ')}\n`;
        }
        if (service.styles) {
          serviceText += `Styles: ${service.styles.join(', ')}\n`;
        }
        if (service.colors) {
          serviceText += `Colors: ${service.colors.join(', ')}\n`;
        }
        if (service.heights) {
          serviceText += `Heights: ${service.heights.join(', ')}\n`;
        }
        if (service.price_range) {
          serviceText += `Price Range: ${service.price_range}\n`;
        }
        if (service.warranty) {
          serviceText += `Warranty: ${service.warranty}\n`;
        }
        if (service.installation_time) {
          serviceText += `Installation Time: ${service.installation_time}`;
        }

        chunks.push({
          id: `service_${service.id || index}`,
          category: 'services',
          type: 'service_detail',
          sourceSection: 'services',
          title: service.name,
          originalId: service.id,
          content: serviceText
        });
      });
    }

    // Process FAQ with enhanced metadata for better retrieval
    if (knowledgeBase.faqs) {
      knowledgeBase.faqs.forEach((faqItem, index) => {
        const faqText = `Question: ${faqItem.question}\n\nAnswer: ${faqItem.answer}`;
        
        chunks.push({
          id: `faq_${index}`,
          category: 'faq',
          type: 'question_answer',
          sourceSection: 'faqs',
          title: faqItem.question,
          faqCategory: faqItem.category || 'general',
          content: faqText
        });
      });
    }

    // Process policies section with detailed breakdown
    if (knowledgeBase.policies) {
      Object.keys(knowledgeBase.policies).forEach(policyCategory => {
        const policyData = knowledgeBase.policies[policyCategory];
        let policyText = `${policyCategory.replace(/_/g, ' ').toUpperCase()} POLICY\n\n`;
        
        if (typeof policyData === 'object') {
          Object.keys(policyData).forEach(policyItem => {
            const policyValue = policyData[policyItem];
            policyText += `${policyItem.replace(/_/g, ' ')}: ${policyValue}\n\n`;
          });
        } else {
          policyText += policyData;
        }

        chunks.push({
          id: `policy_${policyCategory}`,
          category: 'policies',
          type: 'company_policy',
          sourceSection: 'policies',
          title: `${policyCategory.replace(/_/g, ' ')} Policy`,
          policyType: policyCategory,
          content: policyText.trim()
        });
      });
    }

    // Process emergency procedures
    if (knowledgeBase.emergency_procedures) {
      Object.keys(knowledgeBase.emergency_procedures).forEach(key => {
        const procedure = knowledgeBase.emergency_procedures[key];
        let procedureText = `Emergency Type: ${key.replace(/_/g, ' ')}\n`;
        procedureText += `Description: ${procedure.description}\n`;
        procedureText += `Response Time: ${procedure.response_time}\n`;
        if (procedure.temporary_solution) {
          procedureText += `Temporary Solution: ${procedure.temporary_solution}\n`;
        }
        procedureText += `Priority: ${procedure.priority}`;

        chunks.push({
          id: `emergency_${key}`,
          category: 'emergency',
          type: 'procedure',
          sourceSection: 'emergency_procedures',
          title: `${key.replace(/_/g, ' ')} Emergency`,
          content: procedureText
        });
      });
    }

    // Process competition info
    if (knowledgeBase.competition_info) {
      const compInfo = knowledgeBase.competition_info;
      
      if (compInfo.our_advantages) {
        const advantagesText = `Our Company Advantages:\n${compInfo.our_advantages.join('\n')}`;
        chunks.push({
          id: 'company_advantages',
          category: 'company',
          type: 'competitive_advantage',
          sourceSection: 'competition_info',
          title: 'Company Advantages',
          content: advantagesText
        });
      }

      if (compInfo.typical_objections) {
        Object.keys(compInfo.typical_objections).forEach(objection => {
          const response = compInfo.typical_objections[objection];
          const objectionText = `Common Objection: ${objection.replace(/_/g, ' ')}\nResponse: ${response}`;
          
          chunks.push({
            id: `objection_${objection}`,
            category: 'sales',
            type: 'objection_handling',
            sourceSection: 'competition_info',
            title: `Handling: ${objection.replace(/_/g, ' ')}`,
            content: objectionText
          });
        });
      }
    }

    // Process seasonal information
    if (knowledgeBase.seasonal_info) {
      Object.keys(knowledgeBase.seasonal_info).forEach(season => {
        const seasonData = knowledgeBase.seasonal_info[season];
        let seasonText = `${season.toUpperCase()} SEASON INFORMATION\n\n`;
        
        Object.keys(seasonData).forEach(key => {
          const value = seasonData[key];
          seasonText += `${key.replace(/_/g, ' ')}: ${value}\n\n`;
        });

        chunks.push({
          id: `seasonal_${season}`,
          category: 'seasonal',
          type: 'seasonal_info',
          sourceSection: 'seasonal_info',
          title: `${season} Season Information`,
          season: season,
          content: seasonText.trim()
        });
      });
    }

    return chunks;
  }

  /**
   * Enhanced search for similar content using vector store with improved query processing
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum number of results to return
   * @param {Object} filter - Optional metadata filter
   * @returns {Promise<Array>} Array of similar content
   */
  async searchSimilarContent(query, maxResults = 5, filter = {}) {
    try {
      const opId = `${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;
      const totalStart = Date.now();
      
      // Enhanced query preprocessing for better search results
      const enhancedQuery = this.preprocessSearchQuery(query);
      console.log('🔍 Enhanced search query:', enhancedQuery);
      console.log('🔍 Max results:', maxResults);
      console.log('🔍 Filter:', filter);
      
      const vsStart = Date.now();
      const vectorStore = await this.getVectorStore();
      console.log(`[EmbeddingService][${opId}] 🏗️ getVectorStore took ${Date.now() - vsStart}ms`);
      
      // Perform initial search with increased results for better ranking
      const initialMaxResults = Math.min(maxResults * 2, 15);
      const retriever = vectorStore.asRetriever({
        k: initialMaxResults,
        searchType: "similarity",
        searchKwargs: {
          filter: filter
        }
      });
      
      console.log('🔍 Calling getRelevantDocuments...');
      const searchStart = Date.now();
      const docs = await retriever.getRelevantDocuments(enhancedQuery);
      console.log(`[EmbeddingService][${opId}] 🔎 getRelevantDocuments returned ${docs.length} docs in ${Date.now() - searchStart}ms`);
      
      if (docs.length > 0) {
        console.log('🔍 First result sample:', {
          content: docs[0].pageContent.substring(0, 100),
          metadata: docs[0].metadata
        });
      }
      
      // Enhanced result processing with deduplication and relevance scoring
      const processedResults = this.processSearchResults(docs, query, maxResults);
      
      console.log(`[EmbeddingService][${opId}] ✅ total=${processedResults.length} totalMs=${Date.now() - totalStart}`);
      return processedResults;
      
    } catch (error) {
      console.error('Error searching similar content:', error);
      throw error;
    }
  }

  /**
   * Preprocess search query to improve retrieval results
   * @param {string} query - Original search query
   * @returns {string} Enhanced query
   */
  preprocessSearchQuery(query) {
    if (!query) return '';
    
    // Convert common conversational phrases to more specific search terms
    let enhancedQuery = query.toLowerCase();
    
    // Map common question patterns to better search terms
    const queryMappings = {
      'how much': 'price cost pricing',
      'how long': 'time duration installation',
      'what materials': 'materials types options',
      'do you install': 'installation service',
      'warranty': 'warranty guarantee coverage',
      'emergency': 'emergency repair urgent',
      'when can you': 'scheduling availability',
      'do you serve': 'service area location',
      'permit': 'permit requirements approval',
      'financing': 'financing payment options',
      // Contact and company info mappings
      'phone number': 'phone contact company information',
      'call you': 'phone contact company information',
      'contact you': 'phone email contact company information',
      'reach you': 'phone email contact company information',
      'your number': 'phone contact company information',
      'business hours': 'hours company information',
      'when open': 'hours company information schedule',
      'your address': 'address location company information',
      'where located': 'address location company information',
      'your email': 'email contact company information',
      'your website': 'website company information',
      'company info': 'company information contact phone email address'
    };
    
    // Apply mappings
    Object.keys(queryMappings).forEach(pattern => {
      if (enhancedQuery.includes(pattern)) {
        enhancedQuery += ' ' + queryMappings[pattern];
      }
    });
    
    return enhancedQuery;
  }

  /**
   * Process and rank search results with deduplication
   * @param {Array} docs - Raw search results
   * @param {string} originalQuery - Original search query
   * @param {number} maxResults - Maximum results to return
   * @returns {Array} Processed and ranked results
   */
  processSearchResults(docs, originalQuery, maxResults) {
    // Convert to standard format
    let results = docs.map(doc => ({
      contentId: doc.metadata.contentId,
      category: doc.metadata.category,
      type: doc.metadata.type,
      title: doc.metadata.title,
      content: doc.pageContent,
      chunkIndex: doc.metadata.chunkIndex || 0,
      sourceSection: doc.metadata.sourceSection,
      faqCategory: doc.metadata.faqCategory,
      policyType: doc.metadata.policyType,
      season: doc.metadata.season
    }));
    
    // Deduplicate results from the same content section
    const seenSections = new Set();
    const deduplicatedResults = [];
    
    for (const result of results) {
      const sectionKey = `${result.category}_${result.sourceSection}_${result.contentId}`;
      
      if (!seenSections.has(sectionKey)) {
        seenSections.add(sectionKey);
        deduplicatedResults.push(result);
      }
    }
    
    // Prioritize results based on query type
    const queryLower = originalQuery.toLowerCase();
    const isServiceQuery = ['how', 'what', 'when', 'where', 'why', 'can you', 'do you'].some(q => queryLower.includes(q));
    const isContactQuery = ['phone', 'number', 'call', 'contact', 'reach', 'email', 'address', 'location'].some(q => queryLower.includes(q));
    
    deduplicatedResults.sort((a, b) => {
      let aPriority = 0;
      let bPriority = 0;
      
      if (isContactQuery) {
        // Prioritize contact information for contact queries
        aPriority += (a.category === 'contact' ? 5 : 0) + (a.category === 'company' ? 4 : 0);
        bPriority += (b.category === 'contact' ? 5 : 0) + (b.category === 'company' ? 4 : 0);
      } else if (isServiceQuery) {
        // Prioritize FAQ and policies for service questions
        aPriority += (a.category === 'faq' ? 3 : 0) + (a.category === 'policies' ? 2 : 0);
        bPriority += (b.category === 'faq' ? 3 : 0) + (b.category === 'policies' ? 2 : 0);
      }
      
      return bPriority - aPriority;
    });
    
    return deduplicatedResults.slice(0, maxResults);
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }
}

module.exports = { EmbeddingService };
