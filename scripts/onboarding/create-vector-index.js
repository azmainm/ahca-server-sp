#!/usr/bin/env node

/**
 * Create Vector Index - MongoDB Atlas Vector Search Index Creation
 * 
 * This script creates a MongoDB Atlas Vector Search index for a specific business.
 * The index is required for the RAG (Retrieval-Augmented Generation) system to work.
 * 
 * Prerequisites:
 * - MongoDB Atlas cluster with Vector Search enabled
 * - Atlas API key with appropriate permissions (optional, for automated creation)
 * 
 * Usage:
 *   node create-vector-index.js --businessId=acme-corp
 *   node create-vector-index.js --businessId=acme-corp --autoCreate
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const axios = require('axios');

// Command line argument parsing
const args = process.argv.slice(2);
const getArg = (name) => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : null;
};

const hasFlag = (name) => args.includes(`--${name}`);

const businessId = getArg('businessId');
const autoCreate = hasFlag('autoCreate');

// Validation
if (!businessId) {
  console.error('❌ Missing required argument: --businessId');
  console.log('Usage: node create-vector-index.js --businessId=acme-corp [--autoCreate]');
  process.exit(1);
}

console.log('🔍 Creating MongoDB Atlas Vector Search Index...');
console.log(`📋 Business ID: ${businessId}`);
console.log('');

async function createVectorIndex() {
  try {
    // Step 1: Load business configuration
    console.log('📝 Step 1: Loading business configuration...');
    const fs = require('fs').promises;
    const path = require('path');
    
    const configPath = path.join(__dirname, `../../configs/businesses/${businessId}/config.json`);
    
    let businessConfig;
    try {
      const configData = await fs.readFile(configPath, 'utf8');
      businessConfig = JSON.parse(configData);
    } catch (error) {
      console.error(`❌ Could not load business config: ${configPath}`);
      console.error('Make sure you have run setup-new-business.js first.');
      process.exit(1);
    }
    
    const collectionName = businessConfig.database.collectionName;
    const indexName = businessConfig.database.vectorIndexName;
    
    console.log(`✅ Loaded config for: ${businessConfig.businessName}`);
    console.log(`📊 Collection: ${collectionName}`);
    console.log(`🔍 Index Name: ${indexName}`);

    // Step 2: Connect to MongoDB and verify collection exists
    console.log('🔌 Step 2: Connecting to MongoDB...');
    if (!process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI not found in environment variables');
      process.exit(1);
    }

    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    
    const db = client.db('ah-call-service');
    const collection = db.collection(collectionName);
    
    // Check if collection exists and has documents
    const docCount = await collection.countDocuments();
    console.log(`✅ Connected to MongoDB`);
    console.log(`📊 Collection "${collectionName}" has ${docCount} documents`);
    
    if (docCount === 0) {
      console.warn('⚠️ Collection is empty. You may want to add knowledge base documents first.');
    }

    // Step 3: Generate vector index definition
    console.log('📋 Step 3: Generating vector index definition...');
    
    const vectorIndexDefinition = {
      name: indexName,
      type: "vectorSearch",
      definition: {
        fields: [
          {
            type: "vector",
            path: "embedding",
            numDimensions: 1536, // OpenAI text-embedding-3-small dimensions
            similarity: "cosine"
          },
          {
            type: "filter",
            path: "metadata.businessId"
          },
          {
            type: "filter", 
            path: "metadata.category"
          },
          {
            type: "filter",
            path: "metadata.type"
          }
        ]
      }
    };

    console.log('✅ Vector index definition generated:');
    console.log(JSON.stringify(vectorIndexDefinition, null, 2));

    // Step 4: Attempt to create index (if autoCreate flag is provided)
    if (autoCreate) {
      console.log('🤖 Step 4: Attempting automated index creation...');
      
      // Check for Atlas API credentials
      const atlasPublicKey = process.env.ATLAS_PUBLIC_KEY;
      const atlasPrivateKey = process.env.ATLAS_PRIVATE_KEY;
      const atlasProjectId = process.env.ATLAS_PROJECT_ID;
      const atlasClusterName = process.env.ATLAS_CLUSTER_NAME || 'Cluster0';
      
      if (!atlasPublicKey || !atlasPrivateKey || !atlasProjectId) {
        console.warn('⚠️ Atlas API credentials not found in environment variables');
        console.log('Required environment variables for automated creation:');
        console.log('- ATLAS_PUBLIC_KEY');
        console.log('- ATLAS_PRIVATE_KEY');
        console.log('- ATLAS_PROJECT_ID');
        console.log('- ATLAS_CLUSTER_NAME (optional, defaults to "Cluster0")');
        console.log('');
        console.log('Falling back to manual instructions...');
      } else {
        try {
          console.log('🔑 Using Atlas API for automated creation...');
          
          const auth = Buffer.from(`${atlasPublicKey}:${atlasPrivateKey}`).toString('base64');
          
          const createIndexUrl = `https://cloud.mongodb.com/api/atlas/v1.0/groups/${atlasProjectId}/clusters/${atlasClusterName}/fts/indexes`;
          
          const indexPayload = {
            name: indexName,
            database: 'ah-call-service',
            collectionName: collectionName,
            type: 'vectorSearch',
            definition: vectorIndexDefinition.definition
          };
          
          console.log('📡 Sending request to Atlas API...');
          
          const response = await axios.post(createIndexUrl, indexPayload, {
            headers: {
              'Authorization': `Basic ${auth}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (response.status === 201) {
            console.log('✅ Vector index created successfully via Atlas API!');
            console.log(`🔍 Index ID: ${response.data.indexID}`);
            console.log('⏳ Note: It may take a few minutes for the index to become active.');
          } else {
            console.warn('⚠️ Unexpected response from Atlas API:', response.status);
            console.log('Response:', response.data);
          }
          
        } catch (apiError) {
          console.error('❌ Atlas API error:', apiError.response?.data || apiError.message);
          console.log('Falling back to manual instructions...');
        }
      }
    } else {
      console.log('📋 Step 4: Manual index creation instructions');
    }

    // Step 5: Provide manual instructions
    console.log('');
    console.log('📋 Manual Index Creation Instructions:');
    console.log('');
    console.log('1. Go to MongoDB Atlas Dashboard (https://cloud.mongodb.com)');
    console.log('2. Navigate to your cluster');
    console.log('3. Click on "Search" tab');
    console.log('4. Click "Create Search Index"');
    console.log('5. Choose "JSON Editor"');
    console.log('6. Use these settings:');
    console.log('');
    console.log(`   Database: ah-call-service`);
    console.log(`   Collection: ${collectionName}`);
    console.log(`   Index Name: ${indexName}`);
    console.log('');
    console.log('7. Paste this JSON definition:');
    console.log('');
    console.log('```json');
    console.log(JSON.stringify(vectorIndexDefinition.definition, null, 2));
    console.log('```');
    console.log('');
    console.log('8. Click "Next" and then "Create Search Index"');
    console.log('9. Wait for the index to build (this may take several minutes)');
    console.log('');
    
    // Step 6: Verification instructions
    console.log('🧪 Verification:');
    console.log('');
    console.log('After the index is created, you can verify it works by:');
    console.log('1. Adding some knowledge base documents to the collection');
    console.log('2. Running the knowledge base setup script:');
    console.log(`   node scripts/setup-core-knowledge-direct.js --businessId=${businessId}`);
    console.log('3. Testing a voice call to the configured phone number');
    console.log('');
    
    await client.close();
    console.log('✅ Vector index setup completed!');
    
  } catch (error) {
    console.error('❌ Error creating vector index:', error);
    process.exit(1);
  }
}

// Run the setup
createVectorIndex();
