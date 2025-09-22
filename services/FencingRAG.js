const { ChatOpenAI } = require('@langchain/openai');
const { ChatPromptTemplate, SystemMessagePromptTemplate, HumanMessagePromptTemplate } = require('langchain/prompts');
const { RunnableSequence } = require('langchain/schema/runnable');
const { StringOutputParser } = require('langchain/schema/output_parser');
const { z } = require('zod');

/**
 * LangChain-based RAG system for fencing/construction knowledge base
 */
class FencingRAG {
  constructor() {
    this.llm = new ChatOpenAI({
      modelName: 'gpt-5-nano',
      max_output_tokens: 1000,
      reasoning: { effort: 'medium' },
      verbosity: "medium",
    });

    // Define response schema for structured output
    this.responseSchema = z.object({
      answer: z.string().describe("The main response to the user's question"),
      confidence: z.enum(['high', 'medium', 'low']).describe("Confidence level in the answer based on available context"),
      sources_used: z.array(z.string()).describe("List of knowledge base sections that provided relevant information"),
      follow_up_questions: z.array(z.string()).optional().describe("Suggested follow-up questions the user might ask")
    });

    // Create ChatPromptTemplate with system and human messages
    this.chatPrompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(`
You are an AI assistant specialized in fencing and construction services.

Your role:
- You have access to knowledge about fencing services, installation, pricing, and company policies
- You can answer questions about different fence types, materials, pricing, installation processes, and company information
- You should provide specific, accurate information based only on the knowledge base content provided
- If you cannot find relevant information in the knowledge base, clearly state that and offer to connect them with a human expert
- Be conversational, helpful, and professional in your responses
- You are speaking with potential customers who may need fencing services

Guidelines:
- Always base your responses on the provided knowledge base content
- Quote specific details when relevant (prices, timeframes, warranty terms)
- For pricing questions, provide ranges but emphasize the need for on-site evaluation
- If someone has an emergency, prioritize getting them connected to emergency services
- Be proactive in asking clarifying questions to better understand their fencing needs

Please provide a helpful response based on the knowledge base content below.

Context from relevant knowledge base sections:
{context}`),
      HumanMessagePromptTemplate.fromTemplate("{question}")
    ]);

    // Create output parser for string responses
    this.outputParser = new StringOutputParser();

    // Create the RAG chain
    this.ragChain = RunnableSequence.from([
      {
        context: (input) => input.context,
        question: (input) => input.question,
      },
      this.chatPrompt,
      this.llm,
      this.outputParser,
    ]);
  }

  /**
   * Generate response using LangChain RAG
   * @param {string} question - User's question
   * @param {string} context - Relevant knowledge base context
   * @param {Array} conversationHistory - Previous messages for context
   * @returns {Promise<Object>} Structured AI response
   */
  async generateResponse(question, context, conversationHistory = []) {
    try {
      // Use the RAG chain to get string response
      const response = await this.ragChain.invoke({
        question,
        context: context || 'No relevant information found in the knowledge base for this query. Please contact our office at (303) 555-FENCE for assistance.',
      });

      // Try to parse JSON response if it looks like JSON
      if (typeof response === 'string' && response.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(response);
          if (parsed.answer) {
            return parsed;
          }
        } catch (parseError) {
          // If JSON parsing fails, treat as plain text
        }
      }

      // Return structured response from string
      return {
        answer: typeof response === 'string' ? response : 'I encountered an issue processing your request. Please contact us at (303) 555-FENCE for direct assistance.',
        confidence: 'medium',
        sources_used: [],
        follow_up_questions: []
      };
    } catch (error) {
      console.error('Error in LangChain RAG:', error);
      // Return structured error response
      return {
        answer: 'I encountered an error while processing your request. Please contact our office at (303) 555-FENCE and one of our fencing experts will be happy to help you.',
        confidence: 'low',
        sources_used: [],
        follow_up_questions: []
      };
    }
  }

  /**
   * Format context from similar knowledge base sections
   * @param {Array} similarContent - Array of similar content with metadata
   * @returns {string} Formatted context string
   */
  formatContext(similarContent) {
    if (!similarContent || similarContent.length === 0) {
      return 'No relevant information found in the knowledge base for this query.';
    }

    // Group content by category for better organization
    const groupedByCategory = {};
    similarContent.forEach((item, index) => {
      const category = item.category || 'general';
      if (!groupedByCategory[category]) {
        groupedByCategory[category] = [];
      }
      groupedByCategory[category].push({
        sourceNum: index + 1,
        title: item.title || 'Untitled',
        content: item.content,
        type: item.type || 'info'
      });
    });

    // Format grouped content with clear category separation
    const formattedSections = Object.keys(groupedByCategory).map(category => {
      const header = `=== ${category.toUpperCase()} INFORMATION ===`;
      const contentSections = groupedByCategory[category].map(section => 
        `[Source ${section.sourceNum}] ${section.title} (${section.type})
${section.content}`
      ).join('\n\n');
      
      return `${header}\n${contentSections}`;
    });

    return formattedSections.join('\n\n' + '='.repeat(60) + '\n\n');
  }

  /**
   * Generate contextual follow-up questions based on the user's query and context
   * @param {string} question - Original user question
   * @param {Array} similarContent - Similar content found
   * @returns {Array} Array of suggested follow-up questions
   */
  generateFollowUpQuestions(question, similarContent) {
    const followUps = [];
    
    // Analyze content categories to suggest relevant questions
    const categories = [...new Set(similarContent.map(item => item.category))];
    
    if (categories.includes('services')) {
      followUps.push("What materials do you recommend for my specific needs?");
      followUps.push("How long would the installation take?");
    }
    
    if (categories.includes('pricing')) {
      followUps.push("Can I schedule a free consultation for an accurate quote?");
      followUps.push("What does your warranty cover?");
    }
    
    if (categories.includes('company')) {
      followUps.push("Do you serve my area?");
      followUps.push("What makes you different from other fencing companies?");
    }

    // Generic helpful questions
    if (followUps.length < 3) {
      followUps.push("Do you offer free estimates?");
      followUps.push("What's included in your installation service?");
      followUps.push("Do you handle permits and HOA approvals?");
    }

    return followUps.slice(0, 3); // Return max 3 questions
  }
}

module.exports = { FencingRAG };
