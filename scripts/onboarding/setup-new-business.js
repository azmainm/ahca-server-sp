#!/usr/bin/env node

/**
 * Setup New Business - Multi-Tenant Onboarding Script
 * 
 * This script helps onboard a new business to the voice agent system.
 * It creates the necessary configuration files, directories, and MongoDB collections.
 * 
 * Usage:
 *   node setup-new-business.js --businessId=acme-corp --businessName="ACME Corporation" --phoneNumber="+15555555678"
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { MongoClient } = require('mongodb');

// Command line argument parsing
const args = process.argv.slice(2);
const getArg = (name) => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : null;
};

const businessId = getArg('businessId');
const businessName = getArg('businessName');
const phoneNumber = getArg('phoneNumber');

// Validation
if (!businessId || !businessName || !phoneNumber) {
  console.error('❌ Missing required arguments');
  console.log('Usage: node setup-new-business.js --businessId=acme-corp --businessName="ACME Corporation" --phoneNumber="+15555555678"');
  process.exit(1);
}

// Validate businessId format (lowercase, alphanumeric, hyphens only)
if (!/^[a-z0-9-]+$/.test(businessId)) {
  console.error('❌ Business ID must be lowercase alphanumeric with hyphens only (e.g., "acme-corp")');
  process.exit(1);
}

// Validate phone number format
if (!/^\+\d{10,15}$/.test(phoneNumber)) {
  console.error('❌ Phone number must be in E.164 format (e.g., "+15555555678")');
  process.exit(1);
}

console.log('🚀 Setting up new business for voice agent system...');
console.log(`📋 Business ID: ${businessId}`);
console.log(`🏢 Business Name: ${businessName}`);
console.log(`📞 Phone Number: ${phoneNumber}`);
console.log('');

async function setupNewBusiness() {
  try {
    // Step 1: Create business configuration directory
    console.log('📁 Step 1: Creating business configuration directory...');
    const businessConfigDir = path.join(__dirname, `../../configs/businesses/${businessId}`);
    await fs.mkdir(businessConfigDir, { recursive: true });
    console.log(`✅ Created directory: ${businessConfigDir}`);

    // Step 2: Create business configuration file
    console.log('📝 Step 2: Creating business configuration file...');
    const businessConfig = {
      businessId: businessId,
      businessName: businessName,
      phoneNumber: phoneNumber,
      database: {
        collectionName: `knowledge_base_${businessId.replace(/-/g, '_')}`,
        vectorIndexName: `vector_index_${businessId.replace(/-/g, '_')}`
      },
      calendar: {
        provider: "google", // Default to Google, can be changed
        google: {
          serviceAccountEmail: `\${BUSINESS_${businessId.toUpperCase().replace(/-/g, '_')}_GOOGLE_EMAIL}`,
          privateKey: `\${BUSINESS_${businessId.toUpperCase().replace(/-/g, '_')}_GOOGLE_KEY}`,
          calendarId: `\${BUSINESS_${businessId.toUpperCase().replace(/-/g, '_')}_CALENDAR_ID}`,
          projectId: `\${BUSINESS_${businessId.toUpperCase().replace(/-/g, '_')}_PROJECT_ID}`
        },
        microsoft: null,
        timezone: "America/Denver", // Default timezone
        businessHours: {
          start: "09:00",
          end: "17:00",
          daysOfWeek: [1, 2, 3, 4, 5] // Monday to Friday
        }
      },
      email: {
        provider: "resend", // Default to Resend
        apiKey: `\${BUSINESS_${businessId.toUpperCase().replace(/-/g, '_')}_EMAIL_API_KEY}`,
        fromEmail: `support@${businessId.replace(/-/g, '')}.com`,
        fromName: `${businessName} Support`
      },
      companyInfo: {
        name: businessName,
        tagline: "Your Business Tagline Here",
        established: new Date().getFullYear().toString(),
        phone: phoneNumber.replace(/^\+1/, ''), // Remove +1 for US numbers
        email: `info@${businessId.replace(/-/g, '')}.com`,
        website: `www.${businessId.replace(/-/g, '')}.com`,
        address: "Your Business Address Here",
        service_areas: ["United States"],
        hours: {
          monday_friday: "9:00 AM - 5:00 PM",
          saturday: "Closed",
          sunday: "Closed",
          support: "Business hours support available"
        }
      },
      promptConfig: {
        agentName: "Assistant", // Default agent name
        agentPersonality: "professional and helpful",
        greeting: `Hello! I'm your ${businessName} virtual assistant. I'm here to help you with information about our services. May I have your name please?`
      },
      knowledgeBasePath: `/data/businesses/${businessId}/knowledge/`,
      version: "1.0",
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };

    const configPath = path.join(businessConfigDir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(businessConfig, null, 2));
    console.log(`✅ Created config file: ${configPath}`);

    // Step 3: Create default prompt rules
    console.log('🤖 Step 3: Creating default prompt rules...');
    const promptRules = {
      realtimeSystem: {
        full: `You are ${businessConfig.promptConfig.agentName}, ${businessName}'s ${businessConfig.promptConfig.agentPersonality} virtual assistant. Your role is to help customers learn about ${businessName}'s services and schedule consultations.\n\nYour Capabilities:\n- Answer questions about ${businessName}'s services and solutions\n- Help customers schedule consultations and meetings\n- Collect customer information for personalized service\n- Handle inquiries professionally and efficiently\n\nGuidelines:\n- Be professional yet approachable\n- Keep responses clear and concise\n- Focus on understanding customer needs\n- Offer to schedule consultations when appropriate\n- Use the provided functions to search knowledge and schedule appointments\n- Never make up information - use the search_knowledge_base function\n\nOpening behavior:\n- ALWAYS start with this EXACT greeting: "${businessConfig.promptConfig.greeting}"\n\nImportant: Maintain ${businessName}'s professional standards in all interactions.`
      },
      userInfoCollection: {
        systemPrompt: `You're a professional voice assistant for ${businessName}. Maintain a business-appropriate tone while being friendly.`,
        rules: [
          "Collect name and email professionally",
          `If you have both name and email, respond with: "Thank you [name]. I have your email as [email]. How can ${businessName} assist you today?"`,
          "If missing info, ask politely for the missing information",
          "Maintain professional tone throughout",
          "Keep responses concise and business-appropriate"
        ],
        closing: `Focus on professional information collection for ${businessName}.`
      },
      ragSystem: {
        systemTemplate: `You are a professional AI assistant for ${businessName}.\n\nGuidelines:\n- Provide accurate, professional responses\n- Focus on ${businessName}'s services and solutions\n- Maintain a professional yet approachable tone\n- Offer consultations and meetings when appropriate\n- Never provide information not in the knowledge base\n- Keep responses business-focused and solution-oriented\n\nContext from relevant knowledge base sections:\n{context}`
      },
      responseGenerator: {
        conversationalTemplate: `You're a professional voice assistant for ${businessName}. Maintain business standards while being personable and helpful.\n\nCustomer: {userName} ({userEmail})\n\nGuidelines:\n- Professional yet friendly communication style\n- Focus on business solutions and services\n- Provide clear, actionable information\n- Offer next steps and consultations\n- Maintain ${businessName}'s reputation for excellence`
      }
    };

    const promptRulesPath = path.join(businessConfigDir, 'prompt_rules.json');
    await fs.writeFile(promptRulesPath, JSON.stringify(promptRules, null, 2));
    console.log(`✅ Created prompt rules: ${promptRulesPath}`);

    // Step 4: Create knowledge base directory
    console.log('📚 Step 4: Creating knowledge base directory...');
    const knowledgeDir = path.join(__dirname, `../../data/businesses/${businessId}/knowledge`);
    await fs.mkdir(knowledgeDir, { recursive: true });
    console.log(`✅ Created knowledge directory: ${knowledgeDir}`);

    // Create a sample knowledge file
    const sampleKnowledge = {
      doc_id: `${businessId}_company_info`,
      sections: [
        {
          section_id: "company_overview",
          heading: "Company Overview",
          normalized_text: `${businessName} is a professional services company established in ${businessConfig.companyInfo.established}. We provide high-quality services to our clients with a focus on excellence and customer satisfaction. Our team is dedicated to helping businesses achieve their goals through innovative solutions and expert guidance.`,
          labels: {
            intents: ["company_info", "about"],
            audience_profiles: ["general"]
          }
        },
        {
          section_id: "contact_information",
          heading: "Contact Information",
          normalized_text: `You can reach ${businessName} at ${businessConfig.companyInfo.phone} or email us at ${businessConfig.companyInfo.email}. Our business hours are ${businessConfig.companyInfo.hours.monday_friday} Monday through Friday. Visit our website at ${businessConfig.companyInfo.website} for more information.`,
          labels: {
            intents: ["contact", "phone", "email", "hours"],
            audience_profiles: ["general"]
          }
        }
      ],
      access_tags: ["public"],
      product_area: ["general"],
      source_type: "kb",
      version: "1.0",
      last_modified: new Date().toISOString()
    };

    const sampleKnowledgePath = path.join(knowledgeDir, 'company_info.json');
    await fs.writeFile(sampleKnowledgePath, JSON.stringify(sampleKnowledge, null, 2));
    console.log(`✅ Created sample knowledge file: ${sampleKnowledgePath}`);

    // Step 5: Update phone number mapping
    console.log('📞 Step 5: Updating phone number mapping...');
    const businessesJsonPath = path.join(__dirname, '../../configs/businesses.json');
    
    let businessesConfig;
    try {
      const businessesData = await fs.readFile(businessesJsonPath, 'utf8');
      businessesConfig = JSON.parse(businessesData);
    } catch (error) {
      // Create new businesses.json if it doesn't exist
      businessesConfig = {
        phoneToBusinessMap: {},
        description: "Maps Twilio phone numbers to business IDs. Add new entries when onboarding businesses.",
        version: "1.0"
      };
    }

    // Check if phone number is already mapped
    if (businessesConfig.phoneToBusinessMap[phoneNumber]) {
      console.warn(`⚠️ Phone number ${phoneNumber} is already mapped to business: ${businessesConfig.phoneToBusinessMap[phoneNumber]}`);
      console.log('Please use a different phone number or update the existing mapping manually.');
    } else {
      businessesConfig.phoneToBusinessMap[phoneNumber] = businessId;
      businessesConfig.lastUpdated = new Date().toISOString();
      
      await fs.writeFile(businessesJsonPath, JSON.stringify(businessesConfig, null, 2));
      console.log(`✅ Added phone mapping: ${phoneNumber} -> ${businessId}`);
    }

    // Step 6: Create MongoDB collection (if MongoDB is available)
    console.log('🗄️ Step 6: Setting up MongoDB collection...');
    if (process.env.MONGODB_URI) {
      try {
        const client = new MongoClient(process.env.MONGODB_URI);
        await client.connect();
        
        const db = client.db('ah-call-service');
        const collectionName = businessConfig.database.collectionName;
        
        // Create collection (MongoDB creates it automatically when first document is inserted)
        const collection = db.collection(collectionName);
        
        // Insert a placeholder document to create the collection
        await collection.insertOne({
          _id: 'placeholder',
          businessId: businessId,
          type: 'placeholder',
          createdAt: new Date(),
          note: 'This is a placeholder document to initialize the collection. It will be removed when real knowledge base documents are added.'
        });
        
        console.log(`✅ Created MongoDB collection: ${collectionName}`);
        console.log(`⚠️ You still need to create the Atlas Vector Search index manually: ${businessConfig.database.vectorIndexName}`);
        
        await client.close();
      } catch (error) {
        console.warn('⚠️ Could not connect to MongoDB:', error.message);
        console.log('You will need to create the MongoDB collection and vector index manually.');
      }
    } else {
      console.warn('⚠️ MONGODB_URI not found in environment variables');
      console.log('You will need to create the MongoDB collection and vector index manually.');
    }

    // Step 7: Display environment variables needed
    console.log('');
    console.log('🔧 Step 7: Environment Variables Needed');
    console.log('Add these environment variables to your .env file:');
    console.log('');
    
    const envVarPrefix = `BUSINESS_${businessId.toUpperCase().replace(/-/g, '_')}`;
    
    if (businessConfig.calendar.provider === 'google') {
      console.log('# Google Calendar Configuration');
      console.log(`${envVarPrefix}_GOOGLE_EMAIL=your-service-account@your-project.iam.gserviceaccount.com`);
      console.log(`${envVarPrefix}_GOOGLE_KEY="-----BEGIN PRIVATE KEY-----\\nYour private key here\\n-----END PRIVATE KEY-----\\n"`);
      console.log(`${envVarPrefix}_CALENDAR_ID=your-calendar-id@group.calendar.google.com`);
      console.log(`${envVarPrefix}_PROJECT_ID=your-google-project-id`);
    }
    
    console.log('');
    console.log('# Email Configuration');
    console.log(`${envVarPrefix}_EMAIL_API_KEY=your-email-service-api-key`);
    
    console.log('');
    console.log('✅ Business setup completed successfully!');
    console.log('');
    console.log('📋 Next Steps:');
    console.log('1. Add the environment variables shown above to your .env file');
    console.log('2. Create the MongoDB Atlas Vector Search index (see create-vector-index.js)');
    console.log('3. Add your business knowledge base files to the knowledge directory');
    console.log('4. Run the knowledge base setup script to process your documents');
    console.log('5. Configure your Twilio phone number webhook to point to your server');
    console.log('6. Test the voice agent by calling the configured phone number');
    
  } catch (error) {
    console.error('❌ Error setting up business:', error);
    process.exit(1);
  }
}

// Run the setup
setupNewBusiness();
