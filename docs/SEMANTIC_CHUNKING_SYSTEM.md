# Semantic Chunking & Retrieval System

## Overview

This document explains how the semantic-based chunking, embedding generation, storage, and retrieval system works in the AHCA (After Hours Call Agent) project.

## What Are Embeddings? (Simple Explanation)

Think of **embeddings** as a way to convert text into numbers that computers can understand and compare.

### Analogy: Text as Coordinates
- Imagine every piece of text has a "location" in a giant multi-dimensional space
- Similar texts are located close to each other
- Different texts are far apart
- An embedding is like the GPS coordinates (1,536 numbers) for that text location

### Example:
- "Wood fence installation" and "Installing wooden fences" would have very similar coordinates
- "Wood fence installation" and "Pizza delivery" would have very different coordinates

## How the System Works (Step by Step)

### 1. 📝 **Knowledge Base Processing**

**Input**: JSON file with company information (`data/knowldge_base_dummy.json`)
```json
{
  "company_info": { "phone": "(303) 555-FENCE", ... },
  "services": [{ "name": "Wood Fence Installation", ... }],
  "faqs": [{ "question": "How long does installation take?", ... }]
}
```

**What Happens**:
- The system reads this structured data
- Converts each section into readable text chunks
- Each chunk gets meaningful metadata (category, type, title)

### 2. 🧠 **Semantic Chunking Process**

Instead of cutting text at arbitrary lengths, we use **semantic chunking** - cutting based on meaning changes.

#### Traditional Chunking (Old Way):
```
"Wood fence installation takes 2-5 days. We use cedar and pine materials. Our warranty covers 5 years. Storm damage repairs are available 24/7."
↓ (Cut at 50 characters)
Chunk 1: "Wood fence installation takes 2-5 days. We use"
Chunk 2: "cedar and pine materials. Our warranty covers 5"
```
❌ **Problem**: Chunks break in the middle of ideas!

#### Semantic Chunking (New Way):
```
"Wood fence installation takes 2-5 days. We use cedar and pine materials. Our warranty covers 5 years. Storm damage repairs are available 24/7."
↓ (Analyze meaning changes)
Chunk 1: "Wood fence installation takes 2-5 days. We use cedar and pine materials."
Chunk 2: "Our warranty covers 5 years. Storm damage repairs are available 24/7."
```
✅ **Better**: Each chunk contains complete, related ideas!

#### How Semantic Detection Works:

1. **Sliding Window Analysis**:
   - Take 3 sentences at a time: [Sentence 1, 2, 3]
   - Move window by 1: [Sentence 2, 3, 4]
   - Continue through entire text

2. **Embedding Comparison**:
   - Convert each window to embeddings (coordinates)
   - Compare similarity between adjacent windows
   - If similarity drops below 75%, mark as semantic breakpoint

3. **Smart Chunking**:
   - Create chunks between breakpoints
   - Ensure chunks aren't too small (min 100 chars) or too large (max 1200 chars)
   - Merge tiny chunks, split huge ones

### 3. 🔢 **Embedding Generation**

**What Happens**:
- Each semantic chunk gets converted to 1,536 numbers using OpenAI's `text-embedding-3-small`
- These numbers represent the "meaning coordinates" of that text
- Similar chunks will have similar coordinates

**Example**:
```
Text: "Our phone number is (303) 555-FENCE"
Embedding: [0.005, -0.004, 0.036, 0.072, -0.040, ...] (1,536 numbers total)
```

### 4. 💾 **Storage in MongoDB**

**What Gets Stored**:
```javascript
{
  _id: "unique_id",
  text: "CONTACT INFORMATION\n\nPhone: (303) 555-FENCE\nEmail: info@...",
  embedding: [0.005, -0.004, 0.036, ...], // 1,536 numbers
  contentId: "contact_details",
  category: "contact",
  type: "phone_email", 
  title: "Phone Number and Contact Details",
  chunkingMethod: "semantic",
  createdAt: "2025-10-07T12:49:50.310Z"
}
```

**MongoDB Atlas Vector Index**:
- Special index on the `embedding` field
- Enables super-fast similarity searches
- Index name: `vector_index`

### 5. 🔍 **Retrieval Process (When You Ask a Question)**

#### Step 1: Question Processing
```
User asks: "What's your phone number?"
↓
Enhanced query: "phone number contact company information"
```

#### Step 2: Convert Question to Embedding
```
"phone number contact company information"
↓ OpenAI Embedding
[0.012, -0.008, 0.041, ...] (1,536 numbers)
```

#### Step 3: Vector Similarity Search
```
MongoDB finds chunks with similar "coordinates":
1. Contact Details chunk (95% similar)
2. Company Info chunk (87% similar) 
3. Company Advantages chunk (72% similar)
```

#### Step 4: Context Formation
```
Top 3 chunks combined into context:
"CONTACT INFORMATION
Phone: (303) 555-FENCE
Email: info@sherpapromptfencing.com
..."
```

#### Step 5: AI Response Generation
```
GPT-4 receives:
- User question: "What's your phone number?"
- Context: [Contact information chunks]
↓
Response: "(303) 555-FENCE"
```

## Why Semantic Chunking is Better

### 🎯 **Better Accuracy**
- Chunks contain complete, related ideas
- AI gets better context for generating responses
- Fewer "cut-off" or incomplete information pieces

### 🧠 **Smarter Retrieval**
- Finds information based on meaning, not just keywords
- Can answer questions even with different wording
- Example: "How to reach you?" finds phone number info

### 📊 **Real Results**
- Before: 0 results found for "phone number"
- After: Perfect results with phone number and contact details

## Technical Implementation

### Key Files:
- **`shared/services/EmbeddingService.js`**: Main semantic chunking logic
- **`scripts/setup-knowledge-base.js`**: Processes knowledge base with semantic chunking
- **`data/knowldge_base_dummy.json`**: Source knowledge base data

### Key Methods:
- **`semanticChunking(text)`**: Main semantic analysis function
- **`calculateCosineSimilarity()`**: Compares embedding similarity
- **`splitIntoSentences()`**: Intelligent sentence detection
- **`processContentToVectorStore()`**: Stores semantic chunks with metadata

### Configuration:
```javascript
semanticConfig: {
  windowSize: 3,              // Sentences per sliding window
  stepSize: 1,                // Window movement increment  
  similarityThreshold: 0.75,  // Semantic boundary detection
  minChunkSize: 100,          // Minimum chunk size (chars)
  maxChunkSize: 1200          // Maximum chunk size (chars)
}
```

## Setup Requirements

### MongoDB Atlas Vector Index:
```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding", 
      "numDimensions": 1536,
      "similarity": "cosine"
    }
  ]
}
```

### Environment Variables:
```
OPENAI_API_KEY_CALL_AGENT=your_openai_key_for_voice_agent
OPENAI_API_KEY_ESTIMATOR=your_openai_key_for_estimator
MONGODB_URI=your_mongodb_atlas_connection_string
```

## Usage Examples

### Regenerate Knowledge Base:
```bash
cd ahca-server
node scripts/setup-knowledge-base.js
```

### Test Search API:
```bash
curl -X POST http://localhost:3001/api/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{"query": "phone number", "maxResults": 3}'
```

### Expected Response:
```json
{
  "success": true,
  "query": "phone number",
  "response": "(303) 555-FENCE",
  "sources": [
    {
      "contentId": "contact_details",
      "category": "contact", 
      "title": "Phone Number and Contact Details",
      "preview": "CONTACT INFORMATION\n\nPhone: (303) 555-FENCE..."
    }
  ],
  "contextUsed": true,
  "resultsFound": 3
}
```

## Benefits Summary

1. **🎯 Semantic Coherence**: Chunks preserve meaning and context
2. **🔍 Better Search**: Finds relevant information even with different wording  
3. **🤖 Improved AI**: GPT-4 gets better context for accurate responses
4. **📈 Higher Quality**: More relevant results, fewer false matches
5. **🚀 Future-Proof**: Scalable approach that works with any knowledge base

This semantic chunking system transforms how the AI understands and retrieves information, leading to much more accurate and helpful responses for users.
