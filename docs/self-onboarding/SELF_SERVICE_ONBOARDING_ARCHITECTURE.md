# Self-Service Business Onboarding Platform - Architecture Plan

## 📋 Executive Summary

This document outlines the architecture for a **Self-Service Business Onboarding Platform** that enables any business owner to automatically set up their AI voice agent system (similar to Superior Fencing and SherpaPrompt) without any manual configuration or technical knowledge.

### Key Features:
- ✅ **Fully Automated Setup** - Zero manual configuration
- ✅ **Business-Friendly UI** - No technical knowledge required
- ✅ **Guided Onboarding** - Step-by-step wizard interface
- ✅ **Real-time Configuration** - Instant setup and testing
- ✅ **Multi-Provider Support** - Google/Microsoft calendar, multiple email providers
- ✅ **Knowledge Base Builder** - Upload and auto-process business documents

---

## 🎯 Problem Statement

**Current State:**
- Adding a new business requires manual file creation, database setup, and configuration
- Technical knowledge needed to understand MongoDB, vector indexes, and JSON configs
- No self-service capability for business owners
- Time-consuming manual process prone to errors

**Desired State:**
- Business owners sign up and configure their voice agent in 15-20 minutes
- Fully automated database creation, vector index setup, and configuration
- Intuitive UI with guided steps and real-time validation
- Instant testing and deployment

---

## 🏗️ System Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SELF-SERVICE ONBOARDING PLATFORM              │
└─────────────────────────────────────────────────────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
        ▼                        ▼                        ▼
┌──────────────┐        ┌──────────────┐        ┌──────────────┐
│   Frontend    │        │   Backend     │        │   Worker      │
│   (Next.js)   │◄──────►│   (NestJS)    │◄──────►│   Queue       │
│               │        │               │        │   (Bull)      │
└──────────────┘        └──────────────┘        └──────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
                ▼                ▼                ▼
        ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
        │   MongoDB     │ │   AHCA        │ │   External   │
        │   Database    │ │   Server      │ │   APIs       │
        │               │ │   (Voice)     │ │   (Twilio,   │
        │   • Users     │ │               │ │    etc.)     │
        │   • Configs   │ │   • Runtime   │ │              │
        │   • Status    │ │   • Voice     │ │              │
        └──────────────┘ └──────────────┘ └──────────────┘
```

### Technology Stack

**Frontend:**
- **Framework**: Next.js 14 (React)
- **Styling**: TailwindCSS + shadcn/ui components
- **State Management**: React Context + Zustand
- **Forms**: React Hook Form + Zod validation
- **File Upload**: Uppy or React Dropzone
- **Real-time Updates**: Socket.io client

**Backend:**
- **Framework**: NestJS (TypeScript)
- **API**: RESTful + WebSocket for real-time updates
- **Authentication**: JWT + Passport
- **Database**: MongoDB (shared with ahca-server)
- **Queue**: Bull (Redis-based) for async tasks
- **Validation**: Zod schemas

**Infrastructure:**
- **File Storage**: S3 or local filesystem
- **Cache**: Redis
- **Email**: Resend (for onboarding notifications)
- **Monitoring**: Sentry for errors, Winston for logs

---

## 👤 User Journey - Business Owner Perspective

### Onboarding Flow (6 Steps)

```
┌────────────────────────────────────────────────────────────────┐
│                    USER ONBOARDING JOURNEY                      │
└────────────────────────────────────────────────────────────────┘

STEP 1: Account Creation
┌──────────────────────────────────────────────────┐
│  📝 Sign Up                                      │
│  • Business Name                                 │
│  • Owner Email                                   │
│  • Phone Number                                  │
│  • Password                                      │
│                                                  │
│  [Create Account] →                              │
└──────────────────────────────────────────────────┘
                    ↓
STEP 2: Business Profile
┌──────────────────────────────────────────────────┐
│  🏢 Tell Us About Your Business                  │
│  • Business Name: [Superior Fence & Construction]│
│  • Industry: [Construction/Fencing] (dropdown)   │
│  • Website: [www.superiorfencing.com]           │
│  • Business Phone: [(503) 550-1817]             │
│  • Address: [Portland, OR]                      │
│  • Hours: [7 AM - 6 PM Mon-Fri]                 │
│                                                  │
│  [Continue] →                                    │
└──────────────────────────────────────────────────┘
                    ↓
STEP 3: Voice Agent Configuration
┌──────────────────────────────────────────────────┐
│  🤖 Configure Your AI Agent                      │
│                                                  │
│  Agent Name: [Mason]                            │
│  Agent Personality:                              │
│    ○ Professional & Efficient  ✓                 │
│    ○ Friendly & Casual                           │
│    ○ Formal & Corporate                          │
│                                                  │
│  Greeting Message:                               │
│  ┌────────────────────────────────────────────┐ │
│  │ Hi there, I'm Mason, Superior Fence &      │ │
│  │ Construction's virtual assistant...        │ │
│  │                                            │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  [Continue] →                                    │
└──────────────────────────────────────────────────┘
                    ↓
STEP 4: Conversation Flow Design
┌──────────────────────────────────────────────────┐
│  💬 Design Your Call Flow                        │
│                                                  │
│  What information should Mason collect?          │
│  ┌────────────────────────────────────────────┐ │
│  │  1. ✓ Customer Name (Required)             │ │
│  │  2. ✓ Phone Number (Required)              │ │
│  │  3. ✓ Reason for Call (Required)           │ │
│  │  4. ✓ Urgency Level                        │ │
│  │  5. ☐ Email Address                        │ │
│  │  6. ☐ Property Address                     │ │
│  │  [+ Add Custom Field]                      │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  Call Flow Order:                                │
│  [Greeting] → [Name] → [Phone] → [Reason] →     │
│  [Urgency] → [Summary] → [Goodbye]              │
│                                                  │
│  Emergency Handling:                             │
│  ✓ Enable emergency call forwarding             │
│    Trigger: When customer presses # key         │
│    Forward to: [(503) 550-1817]                 │
│                                                  │
│  [Continue] →                                    │
└──────────────────────────────────────────────────┘
                    ↓
STEP 5: Features & Integrations
┌──────────────────────────────────────────────────┐
│  🔧 Choose Your Features                         │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ 📚 Knowledge Base (RAG)                  │   │
│  │ ☐ Enable AI to answer business questions│   │
│  │   Upload business documents below        │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ 📅 Appointment Booking                   │   │
│  │ ☐ Enable calendar integration            │   │
│  │   Choose provider:                       │   │
│  │   ○ Google Calendar                      │   │
│  │   ○ Microsoft Outlook                    │   │
│  │   [Connect Calendar] →                   │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │ 📧 Email Summaries                       │   │
│  │ ✓ Send call summaries after each call   │   │
│  │   Summary recipient: [doug@superior...] │   │
│  │   Email provider:                        │   │
│  │   ● Mailchimp  ○ Resend  ○ Custom      │   │
│  │   API Key: [••••••••••••••••]          │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  [Continue] →                                    │
└──────────────────────────────────────────────────┘
                    ↓
STEP 6: Knowledge Base Upload (if enabled)
┌──────────────────────────────────────────────────┐
│  📄 Upload Business Documents                    │
│                                                  │
│  Drag & drop files or click to browse           │
│  ┌────────────────────────────────────────────┐ │
│  │                                            │ │
│  │     [📁 Drop files here]                  │ │
│  │                                            │ │
│  │  Supported: TXT, PDF, DOCX, JSON          │ │
│  │  Max size: 10MB per file                  │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  Uploaded Files:                                 │
│  ✓ services.txt (45 KB)                         │
│  ✓ pricing.pdf (120 KB)                         │
│  ✓ faq.docx (80 KB)                             │
│                                                  │
│  Or use AI to generate from website:             │
│  Website URL: [www.superiorfencing.com]         │
│  [Generate Knowledge Base] →                     │
│                                                  │
│  [Continue] →                                    │
└──────────────────────────────────────────────────┘
                    ↓
STEP 7: Review & Launch
┌──────────────────────────────────────────────────┐
│  🚀 Review & Launch Your Voice Agent             │
│                                                  │
│  ✓ Business Profile Complete                    │
│  ✓ Voice Agent Configured                       │
│  ✓ Call Flow Designed                           │
│  ✓ Integrations Connected                       │
│  ✓ Knowledge Base Ready (3 documents)           │
│                                                  │
│  Your Voice Agent Number:                        │
│  ┌────────────────────────────────────────────┐ │
│  │  📞 +1 (503) 548-4387                     │ │
│  │     (Twilio number - provisioned)         │ │
│  └────────────────────────────────────────────┘ │
│                                                  │
│  Setup Status:                                   │
│  ⏳ Creating database collections...            │
│  ⏳ Setting up vector search indexes...         │
│  ⏳ Processing knowledge base...                │
│  ⏳ Configuring Twilio...                       │
│                                                  │
│  [Go to Dashboard]                              │
└──────────────────────────────────────────────────┘
```

---

## 🎨 UI/UX Design Specifications

### Design Principles

1. **Simplicity First** - No technical jargon, use business-friendly language
2. **Visual Progress** - Clear step indicators and progress bars
3. **Inline Validation** - Real-time feedback on inputs
4. **Smart Defaults** - Pre-fill sensible defaults to speed up setup
5. **Help at Every Step** - Contextual tooltips and examples
6. **Mobile Responsive** - Works on tablets and phones

### Key UI Components

#### 1. Multi-Step Wizard
```jsx
<Stepper>
  <Step number={1} title="Account" status="completed" />
  <Step number={2} title="Business" status="completed" />
  <Step number={3} title="Agent" status="active" />
  <Step number={4} title="Flow" status="pending" />
  <Step number={5} title="Features" status="pending" />
  <Step number={6} title="Knowledge" status="pending" />
  <Step number={7} title="Launch" status="pending" />
</Stepper>
```

#### 2. Feature Selection Cards
```jsx
<FeatureCard
  icon={<BookIcon />}
  title="Knowledge Base (RAG)"
  description="Let your AI agent answer customer questions using your business documents"
  enabled={features.ragEnabled}
  onChange={toggleRAG}
  badge="Recommended"
>
  <FileUpload onUpload={handleKnowledgeUpload} />
</FeatureCard>
```

#### 3. Real-time Setup Monitor
```jsx
<SetupMonitor>
  <Task name="Database Setup" status="completed" duration="2.3s" />
  <Task name="Vector Index" status="in-progress" progress={65} />
  <Task name="Knowledge Processing" status="queued" />
  <Task name="Twilio Configuration" status="queued" />
</SetupMonitor>
```

#### 4. Test Your Agent Widget
```jsx
<TestWidget>
  <Phone number="+1 (503) 548-4387" />
  <Button>📞 Test Call Now</Button>
  <SimulateConversation>
    <Message role="agent">Hi there, I'm Mason...</Message>
    <Message role="user">My name is John</Message>
    <Message role="agent">Thanks, John...</Message>
  </SimulateConversation>
</TestWidget>
```

---

## 🔧 Backend Architecture

### API Endpoints Structure

#### Authentication Module
```typescript
POST   /api/auth/register          // Create new business account
POST   /api/auth/login             // Login to dashboard
POST   /api/auth/verify-email      // Email verification
POST   /api/auth/reset-password    // Password reset
GET    /api/auth/me                // Get current user
```

#### Business Module
```typescript
POST   /api/business               // Create business profile
GET    /api/business/:id           // Get business details
PUT    /api/business/:id           // Update business profile
DELETE /api/business/:id           // Delete business
GET    /api/business/:id/status    // Get setup status
```

#### Voice Agent Module
```typescript
POST   /api/voice-agent/config     // Save voice agent configuration
GET    /api/voice-agent/config/:id // Get agent config
PUT    /api/voice-agent/config/:id // Update agent config
POST   /api/voice-agent/test       // Test agent with sample input
GET    /api/voice-agent/analytics  // Get call analytics
```

#### Flow Designer Module
```typescript
POST   /api/flow/design            // Save conversation flow
GET    /api/flow/:businessId       // Get flow configuration
PUT    /api/flow/:businessId       // Update flow
POST   /api/flow/validate          // Validate flow structure
GET    /api/flow/templates         // Get industry templates
```

#### Integration Module
```typescript
POST   /api/integrations/calendar/google     // Connect Google Calendar
POST   /api/integrations/calendar/microsoft  // Connect Microsoft Calendar
POST   /api/integrations/email/mailchimp     // Connect Mailchimp
POST   /api/integrations/email/resend        // Connect Resend
GET    /api/integrations/:businessId         // Get all integrations
DELETE /api/integrations/:id                 // Remove integration
POST   /api/integrations/test/:id            // Test integration
```

#### Knowledge Base Module
```typescript
POST   /api/knowledge/upload       // Upload knowledge documents
GET    /api/knowledge/:businessId  // List knowledge documents
DELETE /api/knowledge/:docId       // Delete document
POST   /api/knowledge/process      // Process uploaded documents
GET    /api/knowledge/status/:jobId // Get processing status
POST   /api/knowledge/generate     // Generate from website URL
POST   /api/knowledge/search       // Test knowledge search
```

#### Setup & Provisioning Module
```typescript
POST   /api/setup/initiate         // Start automated setup
GET    /api/setup/status/:businessId // Get setup progress
POST   /api/setup/database         // Create MongoDB collections
POST   /api/setup/vector-index     // Create vector search index
POST   /api/setup/twilio           // Provision Twilio number
POST   /api/setup/complete         // Finalize setup
GET    /api/setup/validate         // Validate all configurations
```

### Database Schema Design

#### Users Collection
```typescript
{
  _id: ObjectId,
  email: string,
  password: string (hashed),
  firstName: string,
  lastName: string,
  phone: string,
  emailVerified: boolean,
  createdAt: Date,
  lastLogin: Date,
  role: 'owner' | 'admin',
  businessId: ObjectId // Reference to business
}
```

#### Businesses Collection
```typescript
{
  _id: ObjectId,
  businessId: string, // e.g., "superior-fencing"
  businessName: string,
  industry: string,
  website: string,
  phone: string,
  address: {
    street: string,
    city: string,
    state: string,
    zip: string,
    country: string
  },
  hours: {
    monday_friday: string,
    saturday: string,
    sunday: string
  },
  owner: ObjectId, // Reference to user
  
  // Setup status
  setupStatus: {
    currentStep: string,
    completed: boolean,
    steps: {
      account: { completed: boolean, completedAt: Date },
      business: { completed: boolean, completedAt: Date },
      agent: { completed: boolean, completedAt: Date },
      flow: { completed: boolean, completedAt: Date },
      features: { completed: boolean, completedAt: Date },
      knowledge: { completed: boolean, completedAt: Date },
      launch: { completed: boolean, completedAt: Date }
    }
  },
  
  // AHCA Server configuration (will be synced to ahca-server)
  ahcaConfig: {
    phoneNumber: string, // Twilio number
    twilioSid: string,
    database: {
      collectionName: string,
      vectorIndexName: string,
      vectorIndexId: string,
      status: 'pending' | 'creating' | 'active' | 'failed'
    },
    configFilePath: string,
    promptRulesPath: string
  },
  
  status: 'draft' | 'setup' | 'active' | 'paused' | 'suspended',
  createdAt: Date,
  updatedAt: Date,
  activatedAt: Date
}
```

#### VoiceAgentConfigs Collection
```typescript
{
  _id: ObjectId,
  businessId: ObjectId,
  agentName: string,
  agentPersonality: string,
  greeting: string,
  
  features: {
    ragEnabled: boolean,
    appointmentBooking: boolean,
    emailSummaries: boolean,
    emergencyForwarding: boolean,
    smsNotifications: boolean
  },
  
  conversationFlow: {
    fields: [
      {
        id: string,
        name: string,
        type: 'text' | 'phone' | 'email' | 'select',
        required: boolean,
        order: number,
        promptText: string,
        validationRules: object
      }
    ],
    flowOrder: string[], // Array of field IDs
    emergencyConfig: {
      enabled: boolean,
      trigger: 'pound_key' | 'keyword',
      keywords: string[],
      forwardToNumber: string,
      forwardMessage: string
    }
  },
  
  createdAt: Date,
  updatedAt: Date
}
```

#### Integrations Collection
```typescript
{
  _id: ObjectId,
  businessId: ObjectId,
  type: 'calendar' | 'email' | 'sms' | 'crm',
  provider: string, // 'google', 'microsoft', 'mailchimp', 'resend'
  
  // Encrypted credentials
  credentials: {
    encrypted: true,
    data: string, // Encrypted JSON
    iv: string,
    authTag: string
  },
  
  config: object, // Provider-specific config
  status: 'connected' | 'disconnected' | 'error',
  lastTested: Date,
  lastUsed: Date,
  
  createdAt: Date,
  updatedAt: Date
}
```

#### KnowledgeDocuments Collection
```typescript
{
  _id: ObjectId,
  businessId: ObjectId,
  fileName: string,
  fileSize: number,
  fileType: string,
  
  uploadedBy: ObjectId, // User ID
  uploadedAt: Date,
  
  processing: {
    status: 'pending' | 'processing' | 'completed' | 'failed',
    startedAt: Date,
    completedAt: Date,
    chunksCreated: number,
    error: string
  },
  
  storage: {
    path: string,
    url: string,
    bucket: string
  },
  
  metadata: {
    category: string,
    tags: string[],
    description: string
  }
}
```

#### SetupJobs Collection (for tracking async setup tasks)
```typescript
{
  _id: ObjectId,
  businessId: ObjectId,
  jobType: 'database' | 'vector_index' | 'knowledge_processing' | 'twilio_provisioning',
  
  status: 'queued' | 'processing' | 'completed' | 'failed',
  progress: number, // 0-100
  
  startedAt: Date,
  completedAt: Date,
  
  result: {
    success: boolean,
    data: object,
    error: string
  },
  
  logs: [
    {
      timestamp: Date,
      level: 'info' | 'warning' | 'error',
      message: string
    }
  ]
}
```

---

## 🤖 Automation Logic

### Setup Automation Flow

```
┌───────────────────────────────────────────────────────────┐
│              AUTOMATED SETUP ORCHESTRATOR                  │
└───────────────────────────────────────────────────────────┘

User Completes Step 7 (Review & Launch)
           ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 1: Validate All Configuration                       │
│ • Check all required fields filled                       │
│ • Validate integrations connected                        │
│ • Verify credentials working                             │
│ • Test knowledge base uploaded (if enabled)              │
│ Duration: ~2-3 seconds                                   │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 2: Generate Business ID & Config Files              │
│ • Convert business name → businessId (lowercase-hyphen)  │
│ • Generate config.json from form data                    │
│ • Generate prompt_rules.json from flow design            │
│ • Save to ahca-server/configs/businesses/{businessId}/  │
│ Duration: ~1 second                                      │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 3: Provision Twilio Phone Number                    │
│ • Search available phone numbers in business area code   │
│ • Purchase phone number via Twilio API                   │
│ • Configure webhook URLs to point to ahca-server         │
│ • Update businesses.json phone mapping                   │
│ Duration: ~5-10 seconds                                  │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 4: Create MongoDB Collections                       │
│ • Connect to MongoDB Atlas                               │
│ • Create collection: knowledge_base_{businessId}         │
│ • Insert placeholder document                            │
│ • Set up proper indexes                                  │
│ Duration: ~2-3 seconds                                   │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 5: Create Vector Search Index (Async Job)          │
│ • Queue job to create Atlas Vector Search index         │
│ • Use MongoDB Atlas Admin API                            │
│ • Index name: vector_index_{businessId}                  │
│ • Configuration: 1536 dimensions, cosine similarity      │
│ • Wait for index to become active                        │
│ Duration: ~2-5 minutes (async, runs in background)       │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 6: Process Knowledge Base (If Enabled)             │
│ • Queue job for each uploaded document                   │
│ • Convert documents to required format:                  │
│   - PDF → Text extraction                                │
│   - DOCX → Text extraction                               │
│   - TXT → Direct processing                              │
│   - JSON → Validation & normalization                    │
│ • Process through EmbeddingService:                      │
│   - Split into semantic chunks                           │
│   - Generate embeddings with OpenAI                      │
│   - Store in business collection                         │
│ Duration: ~30 seconds - 5 minutes per document (async)   │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 7: Store Encrypted Credentials                      │
│ • Encrypt API keys and credentials                       │
│ • Generate environment variable placeholders             │
│ • Store encrypted credentials in database                │
│ • Create .env entries for ahca-server runtime            │
│ Duration: ~1 second                                      │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 8: Initialize Business Services                     │
│ • Reload BusinessConfigService in ahca-server            │
│ • Initialize EmbeddingService for business               │
│ • Initialize EmailService for business                   │
│ • Initialize CalendarService if enabled                  │
│ • Warm up all service connections                        │
│ Duration: ~3-5 seconds                                   │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 9: Test & Validate                                  │
│ • Test Twilio webhook connectivity                       │
│ • Test knowledge base search (if enabled)                │
│ • Test calendar connection (if enabled)                  │
│ • Test email sending                                     │
│ • Run sample conversation simulation                     │
│ Duration: ~10-15 seconds                                 │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│ STEP 10: Mark Business as Active                         │
│ • Update business status to "active"                     │
│ • Send welcome email with phone number                   │
│ • Create onboarding completion log                       │
│ • Trigger dashboard redirect                             │
│ Duration: ~1 second                                      │
└──────────────────────────────────────────────────────────┘
           ↓
           ✅ SETUP COMPLETE - Business Ready to Receive Calls!
```

### Document Processing Pipeline

```
┌───────────────────────────────────────────────────────────┐
│           KNOWLEDGE BASE DOCUMENT PROCESSOR                │
└───────────────────────────────────────────────────────────┘

User Uploads Document (PDF, DOCX, TXT, JSON)
           ↓
┌──────────────────────────────────────────────────────────┐
│ STAGE 1: Upload & Storage                                │
│ • Validate file type and size                            │
│ • Generate unique document ID                            │
│ • Store file in secure storage (S3/filesystem)           │
│ • Create KnowledgeDocument record in DB                  │
│ • Queue processing job                                   │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│ STAGE 2: Format Detection & Extraction                   │
│                                                          │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
│ │  PDF File   │  │  DOCX File  │  │  TXT File   │      │
│ └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │
│        │                │                │              │
│        ▼                ▼                ▼              │
│   [PDF Parser]    [DOCX Parser]    [Text Reader]       │
│   (pdf-parse)     (mammoth)        (fs.readFile)       │
│        │                │                │              │
│        └────────────────┴────────────────┘              │
│                         │                               │
│                    Raw Text                             │
│                         │                               │
│ ┌──────────────────────▼────────────────────────┐      │
│ │  JSON File (SherpaPrompt Format)              │      │
│ │  { doc_id, sections: [...] }                 │      │
│ │  → Direct validation & normalization          │      │
│ └───────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│ STAGE 3: Text Normalization & Cleaning                   │
│ • Remove encoding artifacts (â€", â€™, etc.)            │
│ • Fix line breaks and spacing                            │
│ • Remove headers/footers/page numbers                    │
│ • Normalize unicode characters                           │
│ • Clean up extra whitespace                              │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│ STAGE 4: Structure Detection (For TXT/PDF/DOCX)         │
│ • Detect sections by headings                            │
│ • Identify lists, tables, Q&A pairs                      │
│ • Extract metadata (title, categories)                   │
│ • Generate section IDs                                   │
│                                                          │
│ Output: Structured JSON                                  │
│ {                                                        │
│   doc_id: "document_001",                               │
│   sections: [                                            │
│     {                                                    │
│       section_id: "sec_1",                              │
│       heading: "Services",                              │
│       normalized_text: "We offer fence installation...", │
│       labels: { intents: ["services"], ... }            │
│     }                                                    │
│   ]                                                      │
│ }                                                        │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│ STAGE 5: Semantic Chunking                               │
│ • Split sections into sentences                          │
│ • Use sliding window (3 sentences)                       │
│ • Calculate embeddings for windows                       │
│ • Detect semantic boundaries (similarity < threshold)    │
│ • Create semantically coherent chunks                    │
│ • Min chunk: 100 chars, Max chunk: 1200 chars           │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│ STAGE 6: Embedding Generation                            │
│ • For each chunk, call OpenAI Embeddings API             │
│ • Model: text-embedding-3-small (1536 dimensions)        │
│ • Batch processing for efficiency                        │
│ • Handle rate limits with retry logic                    │
│ • Store chunk + embedding pairs                          │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│ STAGE 7: Database Storage                                │
│ • Store in business-specific collection                  │
│ • Collection: knowledge_base_{businessId}                │
│ • Document structure:                                    │
│   {                                                      │
│     text: "chunk text",                                  │
│     embedding: [0.123, -0.456, ...], // 1536 floats     │
│     metadata: {                                          │
│       businessId: "superior-fencing",                    │
│       documentId: "doc_001",                             │
│       sectionId: "sec_1",                                │
│       category: "services",                              │
│       source: "services.pdf",                            │
│       chunkIndex: 0                                      │
│     }                                                    │
│   }                                                      │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│ STAGE 8: Index & Verify                                  │
│ • Wait for vector index to be ready                      │
│ • Test search with sample queries                        │
│ • Update document status to "completed"                  │
│ • Log statistics (chunks created, time taken)            │
│ • Notify user of completion                              │
└──────────────────────────────────────────────────────────┘
           ↓
           ✅ Document Ready for RAG Search
```

---

## 🔗 Integration with AHCA Server

### Integration Strategy

The onboarding platform needs to **create files and configurations** that ahca-server will consume at runtime. There are two approaches:

#### **Approach 1: File-Based Integration (Recommended)**

This matches the current ahca-server architecture:

```typescript
// After user completes onboarding, generate files:

1. Create config.json:
   Path: ahca-server/configs/businesses/{businessId}/config.json
   Content: Generated from onboarding form data

2. Create prompt_rules.json:
   Path: ahca-server/configs/businesses/{businessId}/prompt_rules.json
   Content: Generated from conversation flow design

3. Update phone mapping:
   Path: ahca-server/configs/businesses.json
   Action: Add new phone → businessId mapping

4. Create knowledge directory:
   Path: ahca-server/data/businesses/{businessId}/knowledge/
   Action: Copy processed JSON documents

5. Set environment variables:
   Path: ahca-server/.env (or use external secrets manager)
   Action: Add BUSINESS_{BUSINESSID}_* variables
```

**Implementation:**

```typescript
// In onboarding backend (NestJS)
@Injectable()
export class AhcaServerIntegrationService {
  private readonly AHCA_SERVER_PATH = process.env.AHCA_SERVER_PATH || '../ahca-server';

  async createBusinessConfiguration(business: Business, config: VoiceAgentConfig) {
    const businessId = business.businessId;
    const configDir = path.join(this.AHCA_SERVER_PATH, 'configs/businesses', businessId);
    
    // Create directory
    await fs.mkdir(configDir, { recursive: true });
    
    // Generate config.json
    const businessConfig = this.generateBusinessConfig(business, config);
    await fs.writeFile(
      path.join(configDir, 'config.json'),
      JSON.stringify(businessConfig, null, 2)
    );
    
    // Generate prompt_rules.json
    const promptRules = this.generatePromptRules(config);
    await fs.writeFile(
      path.join(configDir, 'prompt_rules.json'),
      JSON.stringify(promptRules, null, 2)
    );
    
    // Update businesses.json
    await this.updatePhoneMapping(business.twilioNumber, businessId);
    
    // Trigger ahca-server reload
    await this.reloadAhcaServer();
  }

  private generateBusinessConfig(business: Business, config: VoiceAgentConfig) {
    return {
      businessId: business.businessId,
      businessName: business.businessName,
      phoneNumber: business.twilioNumber,
      database: {
        collectionName: `knowledge_base_${business.businessId.replace(/-/g, '_')}`,
        vectorIndexName: `vector_index_${business.businessId.replace(/-/g, '_')}`
      },
      calendar: this.generateCalendarConfig(business),
      email: this.generateEmailConfig(business),
      companyInfo: {
        name: business.businessName,
        phone: business.phone,
        email: business.email,
        website: business.website,
        address: business.address,
        hours: business.hours
      },
      promptConfig: {
        agentName: config.agentName,
        agentPersonality: config.agentPersonality,
        greeting: config.greeting
      },
      features: config.features,
      version: "1.0",
      createdAt: new Date().toISOString()
    };
  }

  private async reloadAhcaServer() {
    // Option 1: HTTP endpoint to reload configs
    await axios.post(`${process.env.AHCA_SERVER_URL}/api/admin/reload-configs`);
    
    // Option 2: Shared event bus (Redis pub/sub)
    await this.redisClient.publish('ahca:reload', JSON.stringify({ 
      action: 'reload_business_configs' 
    }));
  }
}
```

#### **Approach 2: API-Based Integration**

Add new endpoints to ahca-server for dynamic business management:

```typescript
// New endpoints in ahca-server

POST /api/admin/business
  → Create new business configuration dynamically

PUT /api/admin/business/:businessId
  → Update business configuration

DELETE /api/admin/business/:businessId
  → Remove business configuration

POST /api/admin/reload
  → Reload all configurations from files/database
```

### Twilio Integration

```typescript
@Injectable()
export class TwilioProvisioningService {
  private twilioClient: Twilio;

  constructor() {
    this.twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }

  /**
   * Provision a phone number for a new business
   */
  async provisionPhoneNumber(business: Business): Promise<string> {
    // 1. Search for available phone numbers in business area code
    const areaCode = this.extractAreaCode(business.phone);
    
    const availableNumbers = await this.twilioClient
      .availablePhoneNumbers('US')
      .local
      .list({
        areaCode: areaCode,
        voiceEnabled: true,
        limit: 5
      });

    if (availableNumbers.length === 0) {
      throw new Error(`No available phone numbers in area code ${areaCode}`);
    }

    // 2. Purchase the first available number
    const selectedNumber = availableNumbers[0];
    
    const purchasedNumber = await this.twilioClient
      .incomingPhoneNumbers
      .create({
        phoneNumber: selectedNumber.phoneNumber,
        voiceUrl: `${process.env.AHCA_SERVER_URL}/twilio/voice/incoming`,
        voiceMethod: 'POST',
        statusCallback: `${process.env.AHCA_SERVER_URL}/twilio/voice/status`,
        statusCallbackMethod: 'POST'
      });

    // 3. Configure for media streaming
    await this.twilioClient
      .incomingPhoneNumbers(purchasedNumber.sid)
      .update({
        voiceUrl: `${process.env.AHCA_SERVER_URL}/twilio/voice/incoming?businessId=${business.businessId}`,
        voiceMethod: 'POST'
      });

    console.log(`✅ Provisioned phone number: ${purchasedNumber.phoneNumber} for ${business.businessId}`);
    
    return purchasedNumber.phoneNumber;
  }

  /**
   * Configure webhooks for existing number
   */
  async configureWebhooks(phoneNumberSid: string, businessId: string) {
    await this.twilioClient
      .incomingPhoneNumbers(phoneNumberSid)
      .update({
        voiceUrl: `${process.env.AHCA_SERVER_URL}/twilio/voice/incoming?businessId=${businessId}`,
        voiceMethod: 'POST',
        statusCallback: `${process.env.AHCA_SERVER_URL}/twilio/voice/status`,
        statusCallbackMethod: 'POST'
      });
  }

  private extractAreaCode(phone: string): string {
    // Extract area code from phone number
    const digits = phone.replace(/\D/g, '');
    return digits.substring(0, 3); // First 3 digits
  }
}
```

### MongoDB Integration

```typescript
@Injectable()
export class DatabaseProvisioningService {
  private mongoClient: MongoClient;

  async createBusinessCollection(businessId: string): Promise<void> {
    const collectionName = `knowledge_base_${businessId.replace(/-/g, '_')}`;
    
    const db = this.mongoClient.db('ah-call-service');
    
    // Create collection (MongoDB creates automatically on first insert)
    const collection = db.collection(collectionName);
    
    // Insert placeholder document
    await collection.insertOne({
      _id: 'placeholder',
      businessId: businessId,
      type: 'placeholder',
      createdAt: new Date(),
      note: 'Placeholder document - will be removed when knowledge base is populated'
    });

    console.log(`✅ Created collection: ${collectionName}`);
  }

  async createVectorIndex(businessId: string): Promise<string> {
    const collectionName = `knowledge_base_${businessId.replace(/-/g, '_')}`;
    const indexName = `vector_index_${businessId.replace(/-/g, '_')}`;

    // Use MongoDB Atlas Admin API to create vector search index
    const atlasApiKey = process.env.ATLAS_PUBLIC_KEY;
    const atlasPrivateKey = process.env.ATLAS_PRIVATE_KEY;
    const projectId = process.env.ATLAS_PROJECT_ID;
    const clusterName = process.env.ATLAS_CLUSTER_NAME;

    const indexDefinition = {
      name: indexName,
      database: 'ah-call-service',
      collectionName: collectionName,
      type: 'vectorSearch',
      definition: {
        fields: [
          {
            type: 'vector',
            path: 'embedding',
            numDimensions: 1536,
            similarity: 'cosine'
          },
          {
            type: 'filter',
            path: 'metadata.businessId'
          }
        ]
      }
    };

    const auth = Buffer.from(`${atlasApiKey}:${atlasPrivateKey}`).toString('base64');
    
    const response = await axios.post(
      `https://cloud.mongodb.com/api/atlas/v1.0/groups/${projectId}/clusters/${clusterName}/fts/indexes`,
      indexDefinition,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Vector index created: ${indexName} (ID: ${response.data.indexID})`);
    
    // Index takes 2-5 minutes to become active
    // Return job ID to track status
    return response.data.indexID;
  }

  async checkVectorIndexStatus(indexId: string): Promise<'PENDING' | 'BUILDING' | 'ACTIVE' | 'FAILED'> {
    // Query Atlas API for index status
    const atlasApiKey = process.env.ATLAS_PUBLIC_KEY;
    const atlasPrivateKey = process.env.ATLAS_PRIVATE_KEY;
    const projectId = process.env.ATLAS_PROJECT_ID;
    const clusterName = process.env.ATLAS_CLUSTER_NAME;

    const auth = Buffer.from(`${atlasApiKey}:${atlasPrivateKey}`).toString('base64');
    
    const response = await axios.get(
      `https://cloud.mongodb.com/api/atlas/v1.0/groups/${projectId}/clusters/${clusterName}/fts/indexes/${indexId}`,
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );

    return response.data.status;
  }
}
```

---

## 📊 Real-Time Status Updates

### WebSocket Architecture

```typescript
// Backend WebSocket Gateway (NestJS)

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true
  }
})
export class SetupProgressGateway {
  @WebSocketServer()
  server: Server;

  /**
   * Emit setup progress updates to specific business
   */
  emitSetupProgress(businessId: string, update: SetupProgressUpdate) {
    this.server.to(`business:${businessId}`).emit('setup:progress', update);
  }

  /**
   * Client joins their business room
   */
  @SubscribeMessage('setup:join')
  handleJoinSetup(client: Socket, businessId: string) {
    client.join(`business:${businessId}`);
    console.log(`Client ${client.id} joined setup room: ${businessId}`);
  }
}

// Usage in setup orchestrator
async setupBusiness(businessId: string) {
  // Step 1: Create database
  this.progressGateway.emitSetupProgress(businessId, {
    step: 'database',
    status: 'in-progress',
    message: 'Creating MongoDB collection...',
    progress: 20
  });
  
  await this.databaseService.createBusinessCollection(businessId);
  
  this.progressGateway.emitSetupProgress(businessId, {
    step: 'database',
    status: 'completed',
    message: 'Database collection created',
    progress: 30
  });
  
  // Step 2: Create vector index
  this.progressGateway.emitSetupProgress(businessId, {
    step: 'vector_index',
    status: 'in-progress',
    message: 'Creating vector search index...',
    progress: 40
  });
  
  const indexId = await this.databaseService.createVectorIndex(businessId);
  
  // ... continue for all steps
}
```

### Frontend Setup Monitor Component

```tsx
// Frontend component to display real-time setup progress

const SetupMonitor: React.FC<{ businessId: string }> = ({ businessId }) => {
  const [setupSteps, setSetupSteps] = useState<SetupStep[]>([
    { id: 'validation', name: 'Validating Configuration', status: 'pending', progress: 0 },
    { id: 'config_files', name: 'Creating Configuration Files', status: 'pending', progress: 0 },
    { id: 'twilio', name: 'Provisioning Phone Number', status: 'pending', progress: 0 },
    { id: 'database', name: 'Setting Up Database', status: 'pending', progress: 0 },
    { id: 'vector_index', name: 'Creating Vector Index', status: 'pending', progress: 0 },
    { id: 'knowledge', name: 'Processing Knowledge Base', status: 'pending', progress: 0 },
    { id: 'services', name: 'Initializing Services', status: 'pending', progress: 0 },
    { id: 'testing', name: 'Running Tests', status: 'pending', progress: 0 }
  ]);

  useEffect(() => {
    const socket = io(process.env.NEXT_PUBLIC_API_URL);
    
    // Join business-specific room
    socket.emit('setup:join', businessId);
    
    // Listen for progress updates
    socket.on('setup:progress', (update: SetupProgressUpdate) => {
      setSetupSteps(prev => prev.map(step => 
        step.id === update.step
          ? { ...step, status: update.status, progress: update.progress, message: update.message }
          : step
      ));
    });

    return () => {
      socket.disconnect();
    };
  }, [businessId]);

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Setting Up Your Voice Agent...</h3>
      
      {setupSteps.map(step => (
        <div key={step.id} className="flex items-center gap-4 p-4 bg-white rounded-lg shadow">
          {/* Status Icon */}
          {step.status === 'completed' && <CheckCircle className="text-green-500 w-6 h-6" />}
          {step.status === 'in-progress' && <Loader className="text-blue-500 w-6 h-6 animate-spin" />}
          {step.status === 'pending' && <Clock className="text-gray-400 w-6 h-6" />}
          {step.status === 'failed' && <XCircle className="text-red-500 w-6 h-6" />}
          
          {/* Step Info */}
          <div className="flex-1">
            <div className="font-medium">{step.name}</div>
            {step.message && <div className="text-sm text-gray-500">{step.message}</div>}
          </div>
          
          {/* Progress Bar */}
          {step.status === 'in-progress' && (
            <div className="w-32">
              <Progress value={step.progress} />
            </div>
          )}
        </div>
      ))}
      
      {/* Overall Progress */}
      <div className="mt-6">
        <Progress 
          value={calculateOverallProgress(setupSteps)} 
          className="h-3"
        />
        <p className="text-center mt-2 text-sm text-gray-600">
          {calculateOverallProgress(setupSteps)}% Complete
        </p>
      </div>
    </div>
  );
};
```

---

## 🎯 Dashboard & Post-Setup Features

### Business Dashboard

After setup is complete, business owners get access to a comprehensive dashboard:

```
┌─────────────────────────────────────────────────────────────┐
│                    BUSINESS DASHBOARD                        │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Header                                                      │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Superior Fence & Construction  │  [View Profile] [⚙️]  │ │
│  │ 📞 +1 (503) 548-4387           │  [Test Agent]        │ │
│  │ 🟢 Active since Oct 25, 2024   │                      │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Quick Stats (Today)                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌────────┐│
│  │   Calls     │ │   Leads     │ │  Avg Call   │ │Success││
│  │     12      │ │      9      │ │   2m 34s    │ │  75%  ││
│  │  ↑ +3 vs    │ │  ↑ +2 vs    │ │  → same     │ │ → same││
│  │  yesterday  │ │  yesterday  │ │             │ │       ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └────────┘│
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Recent Calls                                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ 2:34 PM  John Smith    (503) 555-0123  New Fence    ✅ │ │
│  │ 1:15 PM  Mary Johnson  (503) 555-0456  Repair       ✅ │ │
│  │ 11:23 AM Mike Davis    (503) 555-0789  Emergency    🚨 │ │
│  │ 10:05 AM Sarah Wilson  (503) 555-0321  Quote        ✅ │ │
│  └────────────────────────────────────────────────────────┘ │
│  [View All Calls] →                                          │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Call Transcripts & Summaries                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Call with John Smith - 2:34 PM                        │ │
│  │ Duration: 2m 34s  |  Outcome: Lead Captured           │ │
│  │                                                        │ │
│  │ Summary:                                               │ │
│  │ Customer needs new fence installation for residential  │ │
│  │ property. Urgency: Next business day callback.        │ │
│  │                                                        │ │
│  │ Collected Info:                                        │ │
│  │ • Name: John Smith                                     │ │
│  │ • Phone: (503) 555-0123                               │ │
│  │ • Reason: New fence installation                       │ │
│  │ • Urgency: Next business day                          │ │
│  │                                                        │ │
│  │ [View Full Transcript] [Export] [Send Email]          │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│  Quick Actions                                               │
│  [📞 Test Call] [⚙️ Edit Agent] [📚 Manage Knowledge Base]  │
│  [📊 View Analytics] [📧 Email Settings] [📱 Integrations]  │
└──────────────────────────────────────────────────────────────┘
```

### Analytics & Reporting

```typescript
// Analytics endpoints

GET /api/analytics/calls
  Query params: businessId, startDate, endDate
  Response: {
    totalCalls: number,
    successfulCalls: number,
    averageDuration: number,
    peakHours: { hour: number, count: number }[],
    callsByDay: { date: string, count: number }[],
    topReasons: { reason: string, count: number }[]
  }

GET /api/analytics/leads
  Response: {
    totalLeads: number,
    leadsBySource: { source: string, count: number }[],
    conversionRate: number,
    urgencyBreakdown: { urgent: number, normal: number, flexible: number }
  }

GET /api/analytics/transcripts
  Response: Paginated list of call transcripts with summaries
```

---

## 🔒 Security & Compliance

### Security Measures

1. **Credential Encryption**
```typescript
@Injectable()
export class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

  encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  decrypt(encrypted: string, iv: string, authTag: string): string {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.encryptionKey,
      Buffer.from(iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

2. **API Key Management**
- Store encrypted in database
- Never expose in frontend
- Rotate keys on schedule
- Audit access logs

3. **Access Control**
- JWT authentication
- Business owner can only access their own data
- Admin role for platform management
- API rate limiting per business

4. **Data Privacy**
- GDPR compliance for call recordings
- Data retention policies
- User consent for recording
- Right to deletion

### Compliance Features

```typescript
// GDPR compliance endpoints

POST /api/privacy/export-data
  → Export all business data (calls, configs, knowledge base)

POST /api/privacy/delete-account
  → Delete business account and all associated data

POST /api/privacy/delete-calls
  → Delete specific call recordings and transcripts

GET /api/privacy/data-retention
  → View current data retention settings

PUT /api/privacy/data-retention
  → Update retention policies
```

---

## 📈 Scalability & Performance

### Horizontal Scaling

```
┌─────────────────────────────────────────────────────────┐
│                   LOAD BALANCER (NGINX)                  │
└─────────────────────────────────────────────────────────┘
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
       ▼                  ▼                  ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Onboarding  │    │ Onboarding  │    │ Onboarding  │
│ API Server  │    │ API Server  │    │ API Server  │
│ Instance 1  │    │ Instance 2  │    │ Instance 3  │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │
                ┌─────────┴─────────┐
                │                   │
        ┌───────▼───────┐   ┌───────▼───────┐
        │   MongoDB     │   │  Redis Queue  │
        │   (Shared)    │   │   (Shared)    │
        └───────────────┘   └───────────────┘
```

### Performance Optimizations

1. **Caching Strategy**
```typescript
// Cache business configs in Redis
@Injectable()
export class CachedBusinessService {
  constructor(
    private redisClient: Redis,
    private businessService: BusinessService
  ) {}

  async getBusinessConfig(businessId: string): Promise<BusinessConfig> {
    // Check cache first
    const cached = await this.redisClient.get(`business:config:${businessId}`);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Cache miss - fetch from database
    const config = await this.businessService.findById(businessId);
    
    // Store in cache (TTL: 1 hour)
    await this.redisClient.setex(
      `business:config:${businessId}`,
      3600,
      JSON.stringify(config)
    );

    return config;
  }
}
```

2. **Background Job Processing**
```typescript
// Bull queue for async tasks
@Processor('setup-jobs')
export class SetupJobProcessor {
  @Process('create-vector-index')
  async handleVectorIndexCreation(job: Job<{ businessId: string }>) {
    const { businessId } = job.data;
    
    // Update progress
    await job.progress(10);
    
    // Create index
    const indexId = await this.databaseService.createVectorIndex(businessId);
    await job.progress(50);
    
    // Poll for status
    let status = 'PENDING';
    while (status !== 'ACTIVE' && status !== 'FAILED') {
      await this.sleep(10000); // Wait 10 seconds
      status = await this.databaseService.checkVectorIndexStatus(indexId);
      await job.progress(50 + (status === 'BUILDING' ? 40 : 0));
    }
    
    await job.progress(100);
    
    if (status === 'FAILED') {
      throw new Error('Vector index creation failed');
    }
    
    return { indexId, status };
  }

  @Process('process-knowledge-document')
  async handleDocumentProcessing(job: Job<{ documentId: string }>) {
    // Process document asynchronously
    // ...
  }
}
```

3. **Database Indexing**
```typescript
// Ensure proper indexes for fast queries
await businessesCollection.createIndex({ businessId: 1 }, { unique: true });
await businessesCollection.createIndex({ 'owner': 1 });
await businessesCollection.createIndex({ status: 1, createdAt: -1 });

await usersCollection.createIndex({ email: 1 }, { unique: true });
await usersCollection.createIndex({ businessId: 1 });

await setupJobsCollection.createIndex({ businessId: 1, jobType: 1 });
await setupJobsCollection.createIndex({ status: 1, createdAt: -1 });
```

---

## 🚀 Deployment Strategy

### Infrastructure Setup

```yaml
# docker-compose.yml for local development

version: '3.8'

services:
  # Onboarding Frontend
  frontend:
    build: ./onboarding-frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:4000
    depends_on:
      - backend

  # Onboarding Backend
  backend:
    build: ./onboarding-backend
    ports:
      - "4000:4000"
    environment:
      - MONGODB_URI=${MONGODB_URI}
      - REDIS_URL=redis://redis:6379
      - AHCA_SERVER_PATH=../ahca-server
      - TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
      - TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
    volumes:
      - ../ahca-server:/app/ahca-server
    depends_on:
      - mongodb
      - redis

  # AHCA Server (Voice Agent)
  ahca-server:
    build: ./ahca-server
    ports:
      - "3001:3001"
    environment:
      - MONGODB_URI=${MONGODB_URI}
      - OPENAI_API_KEY_CALL_AGENT=${OPENAI_API_KEY}
    depends_on:
      - mongodb

  # MongoDB
  mongodb:
    image: mongo:7
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db

  # Redis (for queues and caching)
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  mongodb_data:
  redis_data:
```

### Production Deployment (Cloud)

**Option 1: AWS**
```
- Frontend: Next.js on Vercel or AWS Amplify
- Backend: ECS/Fargate containers or EC2 with Docker
- AHCA Server: Separate ECS service
- Database: MongoDB Atlas (managed)
- Cache: ElastiCache Redis (managed)
- Storage: S3 for knowledge documents
- Queue: AWS SQS or Bull with ElastiCache
- Load Balancer: ALB
```

**Option 2: Google Cloud**
```
- Frontend: Cloud Run or Firebase Hosting
- Backend: Cloud Run containers
- AHCA Server: Separate Cloud Run service
- Database: MongoDB Atlas
- Cache: Memorystore Redis
- Storage: Cloud Storage
- Queue: Cloud Tasks or Pub/Sub
```

### CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml

name: Deploy Onboarding Platform

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run Tests
        run: |
          npm install
          npm test

  build-and-deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Build Frontend
        run: |
          cd onboarding-frontend
          npm install
          npm run build

      - name: Build Backend
        run: |
          cd onboarding-backend
          npm install
          npm run build

      - name: Deploy to Production
        run: |
          # Deploy commands here
          # Could be Docker push, Kubernetes apply, etc.
```

---

## 📚 API Documentation

### Complete API Reference

The platform will have comprehensive API documentation using **OpenAPI/Swagger**:

```
https://onboarding.yourdomain.com/api/docs
```

Sample endpoint documentation:

```yaml
paths:
  /api/business:
    post:
      summary: Create a new business profile
      tags:
        - Business
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                businessName:
                  type: string
                  example: "Superior Fence & Construction"
                industry:
                  type: string
                  example: "construction"
                phone:
                  type: string
                  example: "+15035501817"
                website:
                  type: string
                  example: "www.superiorfencing.com"
                address:
                  type: object
                  properties:
                    city:
                      type: string
                    state:
                      type: string
      responses:
        '201':
          description: Business created successfully
          content:
            application/json:
              schema:
                type: object
                properties:
                  businessId:
                    type: string
                  message:
                    type: string
        '400':
          description: Invalid input
        '401':
          description: Unauthorized
```

---

## 🎓 Training & Documentation

### Business Owner Resources

1. **Interactive Onboarding Tutorial**
   - First-time walkthrough with tooltips
   - Video guides for each step
   - Sample configurations for different industries

2. **Knowledge Base**
   - FAQ section
   - Troubleshooting guides
   - Best practices for voice agent setup

3. **Support Center**
   - Live chat support
   - Email support
   - Video call support for complex setups

---

## 📋 Implementation Checklist

### Phase 1: MVP (Weeks 1-4)
- [ ] Setup project structure (Next.js frontend + NestJS backend)
- [ ] Implement authentication (signup, login, JWT)
- [ ] Create multi-step onboarding wizard UI
- [ ] Implement business profile creation
- [ ] Implement voice agent configuration
- [ ] Implement conversation flow designer
- [ ] Build file upload for knowledge base
- [ ] Create MongoDB collection provisioning
- [ ] Implement basic AHCA server integration (file generation)
- [ ] Add Twilio phone number provisioning
- [ ] Build basic dashboard
- [ ] Add real-time setup progress tracking

### Phase 2: Advanced Features (Weeks 5-8)
- [ ] Implement vector index creation automation
- [ ] Build document processing pipeline
- [ ] Add calendar integration (Google/Microsoft)
- [ ] Add email service integration (Mailchimp/Resend)
- [ ] Implement emergency call forwarding setup
- [ ] Add call analytics and reporting
- [ ] Build transcript viewer
- [ ] Add export/download features
- [ ] Implement testing tools
- [ ] Add webhook configuration

### Phase 3: Polish & Launch (Weeks 9-12)
- [ ] Comprehensive testing (unit, integration, E2E)
- [ ] Security audit and penetration testing
- [ ] Performance optimization
- [ ] Documentation completion
- [ ] Deploy to staging environment
- [ ] User acceptance testing
- [ ] Production deployment
- [ ] Monitoring and alerting setup
- [ ] Launch marketing materials
- [ ] Customer support training

---

## 💡 Future Enhancements

### Potential Features for V2

1. **AI-Powered Setup Assistant**
   - Chat interface that guides business owners
   - Auto-generates configuration from natural language
   - Suggests optimal settings based on industry

2. **Website Scraper for Knowledge Base**
   - Enter website URL
   - AI scrapes and extracts relevant information
   - Auto-generates knowledge base documents

3. **Industry Templates**
   - Pre-built configurations for common industries
   - Sample conversation flows
   - Industry-specific best practices

4. **A/B Testing for Voice Agents**
   - Test different greetings
   - Compare conversation flows
   - Optimize for conversion

5. **Advanced Analytics**
   - Sentiment analysis on calls
   - Customer satisfaction scoring
   - Conversion funnel analysis
   - Call routing optimization

6. **Multi-Language Support**
   - Support for non-English businesses
   - Language detection in calls
   - Automatic translation

7. **CRM Integrations**
   - Salesforce integration
   - HubSpot integration
   - Zapier webhooks
   - Custom webhook support

8. **White-Label Solution**
   - Rebrand the platform
   - Custom domain support
   - Reseller program

---

## 📊 Success Metrics

### Key Performance Indicators (KPIs)

1. **Onboarding Metrics**
   - Time to complete setup (target: < 20 minutes)
   - Completion rate (target: > 80%)
   - Drop-off points identification

2. **System Performance**
   - Average setup time (target: < 3 minutes)
   - Success rate of automated provisioning (target: > 95%)
   - API response times (target: < 500ms p95)

3. **Business Metrics**
   - Number of active businesses
   - Monthly recurring revenue
   - Customer retention rate
   - Customer satisfaction score

4. **Voice Agent Performance**
   - Calls per business per month
   - Average call duration
   - Lead capture rate
   - Emergency call routing success rate

---

## 🎯 Conclusion

This architecture provides a **complete, automated, self-service solution** for business owners to set up their AI voice agent system without any technical knowledge or manual intervention.

### Key Highlights:

✅ **Zero Manual Configuration** - Everything automated from signup to deployment
✅ **Business-Friendly Interface** - Simple, guided, visual experience
✅ **Real-Time Feedback** - Live progress updates and instant testing
✅ **Scalable Architecture** - Supports hundreds of businesses on same infrastructure
✅ **Secure & Compliant** - Enterprise-grade security and GDPR compliance
✅ **Production-Ready** - Comprehensive error handling, monitoring, and support

### Next Steps:

1. **Approve Architecture** - Review and approve this plan
2. **Set Up Development Environment** - Initialize repositories and infrastructure
3. **Begin Phase 1 Implementation** - Start with MVP features
4. **Iterate Based on Feedback** - Refine UX and add features
5. **Launch Beta Program** - Onboard first 10-20 businesses
6. **Full Production Launch** - Open to all businesses

---

**Document Version:** 1.0  
**Last Updated:** October 29, 2024  
**Author:** Architecture Team  
**Status:** Awaiting Approval

