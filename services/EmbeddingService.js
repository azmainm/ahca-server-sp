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

    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
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
      this.client = new MongoClient(this.MONGODB_URI);
      await this.client.connect();
      this.db = this.client.db(this.DATABASE_NAME);
    }
    return this.db;
  }

  /**
   * Initialize Vector Store for MongoDB Atlas Vector Search
   */
  async getVectorStore() {
    const database = await this.getDatabase();
    
    return new MongoDBAtlasVectorSearch(this.embeddings, {
      collection: database.collection(this.EMBEDDINGS_COLLECTION),
      indexName: this.VECTOR_INDEX_NAME,
      textKey: "text",
      embeddingKey: "embedding",
    });
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

    // Process company info
    if (knowledgeBase.company_info) {
      const companyInfo = knowledgeBase.company_info;
      let companyText = `Company: ${companyInfo.name}\nTagline: ${companyInfo.tagline}\n`;
      companyText += `Established: ${companyInfo.established}\n`;
      companyText += `Service Areas: ${companyInfo.service_areas.join(', ')}\n`;
      companyText += `Phone: ${companyInfo.phone}\nEmail: ${companyInfo.email}\n`;
      companyText += `Website: ${companyInfo.website}\nAddress: ${companyInfo.address}\n`;
      
      if (companyInfo.hours) {
        companyText += `Hours: Monday-Friday ${companyInfo.hours.monday_friday}, `;
        companyText += `Saturday ${companyInfo.hours.saturday}, Sunday ${companyInfo.hours.sunday}\n`;
        companyText += `Emergency Service: ${companyInfo.hours.emergency}`;
      }

      chunks.push({
        id: 'company_info',
        category: 'company',
        type: 'basic_info',
        sourceSection: 'company_info',
        title: 'Company Information',
        content: companyText
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

    // Process FAQ
    if (knowledgeBase.faq) {
      knowledgeBase.faq.forEach((faqItem, index) => {
        const faqText = `Question: ${faqItem.question}\nAnswer: ${faqItem.answer}`;
        
        chunks.push({
          id: `faq_${index}`,
          category: 'faq',
          type: 'question_answer',
          sourceSection: 'faq',
          title: faqItem.question,
          content: faqText
        });
      });
    }

    // Process pricing
    if (knowledgeBase.pricing) {
      Object.keys(knowledgeBase.pricing).forEach(key => {
        const pricingInfo = knowledgeBase.pricing[key];
        let pricingText = `${key.replace(/_/g, ' ').toUpperCase()}\n`;
        
        if (typeof pricingInfo === 'object') {
          Object.keys(pricingInfo).forEach(subKey => {
            pricingText += `${subKey.replace(/_/g, ' ')}: ${pricingInfo[subKey]}\n`;
          });
        } else {
          pricingText += pricingInfo;
        }

        chunks.push({
          id: `pricing_${key}`,
          category: 'pricing',
          type: 'pricing_info',
          sourceSection: 'pricing',
          title: `${key.replace(/_/g, ' ')} Pricing`,
          content: pricingText
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

    return chunks;
  }

  /**
   * Search for similar content using vector store
   * @param {string} query - Search query
   * @param {number} maxResults - Maximum number of results to return
   * @param {Object} filter - Optional metadata filter
   * @returns {Promise<Array>} Array of similar content
   */
  async searchSimilarContent(query, maxResults = 5, filter = {}) {
    try {
      console.log('🔍 Starting vector search with query:', query);
      console.log('🔍 Max results:', maxResults);
      console.log('🔍 Filter:', filter);
      
      const vectorStore = await this.getVectorStore();
      console.log('🔍 Vector store created successfully');
      
      const retriever = vectorStore.asRetriever({
        k: maxResults,
        searchType: "similarity",
        searchKwargs: {
          filter: filter
        }
      });
      console.log('🔍 Retriever configured');
      
      console.log('🔍 Calling getRelevantDocuments...');
      const docs = await retriever.getRelevantDocuments(query);
      console.log('🔍 Raw search results count:', docs.length);
      
      if (docs.length > 0) {
        console.log('🔍 First result sample:', {
          content: docs[0].pageContent.substring(0, 100),
          metadata: docs[0].metadata
        });
      }
      
      return docs.map(doc => ({
        contentId: doc.metadata.contentId,
        category: doc.metadata.category,
        type: doc.metadata.type,
        title: doc.metadata.title,
        content: doc.pageContent,
        chunkIndex: doc.metadata.chunkIndex || 0,
        sourceSection: doc.metadata.sourceSection
      }));
      
    } catch (error) {
      console.error('Error searching similar content:', error);
      throw error;
    }
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
