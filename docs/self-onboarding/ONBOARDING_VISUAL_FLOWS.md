# Visual Flow Diagrams - Self-Service Onboarding Platform

## 📊 Visual Architecture & Flow Charts

This document provides visual representations of the self-service onboarding platform architecture and workflows.

---

## 🎯 Overall System Flow - Bird's Eye View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                         BUSINESS OWNER EXPERIENCE                            │
│                                                                              │
│  1. Sign Up      2. Configure      3. Upload Docs    4. Auto Setup         │
│  [🖥️ Web Form] → [🎨 Wizard UI] → [📄 Drag&Drop] → [⚙️ Background Jobs]    │
│                                                                              │
│     5 mins           10 mins          2 mins            3-5 mins            │
│                                                                              │
│  └──────────────────┬───────────────────────────────────────────────────────┘
│                     │
│                     ▼
│  ┌──────────────────────────────────────────────────────────────────────┐
│  │                    AUTOMATION ORCHESTRATOR                            │
│  │  • Creates Database Collections                                      │
│  │  • Generates Configuration Files                                     │
│  │  • Provisions Twilio Phone Number                                    │
│  │  • Processes Knowledge Base Documents                                │
│  │  • Sets Up Vector Search Indexes                                     │
│  │  • Tests All Integrations                                            │
│  └──────────────────────────────────────────────────────────────────────┘
│                     │
│                     ▼
│  ┌──────────────────────────────────────────────────────────────────────┐
│  │                      AHCA SERVER (Runtime)                            │
│  │  • Loads Business Configuration                                      │
│  │  • Initializes Voice Agent                                           │
│  │  • Ready to Handle Incoming Calls                                    │
│  └──────────────────────────────────────────────────────────────────────┘
│                     │
│                     ▼
│              📞 VOICE AGENT LIVE!
│         Business can now receive AI-powered calls
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ Technical Architecture - Component View

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          ONBOARDING PLATFORM STACK                            │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                               PRESENTATION LAYER                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                  NEXT.JS FRONTEND (React)                            │    │
│  │                                                                      │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐             │    │
│  │  │ Onboarding   │  │  Dashboard   │  │   Settings   │             │    │
│  │  │   Wizard     │  │     UI       │  │      UI      │             │    │
│  │  │              │  │              │  │              │             │    │
│  │  │ • Step 1-7   │  │ • Analytics  │  │ • Profile    │             │    │
│  │  │ • Validation │  │ • Calls Log  │  │ • Billing    │             │    │
│  │  │ • Preview    │  │ • Testing    │  │ • API Keys   │             │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘             │    │
│  │                                                                      │    │
│  │  Technologies: TailwindCSS, shadcn/ui, React Hook Form, Socket.io  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ REST API + WebSocket
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                             APPLICATION LAYER                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    NESTJS BACKEND (TypeScript)                       │    │
│  │                                                                      │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐  │    │
│  │  │   Auth      │  │  Business   │  │  Voice      │  │  Setup   │  │    │
│  │  │   Module    │  │   Module    │  │   Agent     │  │ Orchestr.│  │    │
│  │  │             │  │             │  │   Module    │  │          │  │    │
│  │  │ • Register  │  │ • Profile   │  │ • Config    │  │ • Jobs   │  │    │
│  │  │ • Login     │  │ • Update    │  │ • Flow      │  │ • Queue  │  │    │
│  │  │ • JWT       │  │ • Status    │  │ • Test      │  │ • Status │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └──────────┘  │    │
│  │                                                                      │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────┐  │    │
│  │  │Knowledge    │  │Integration  │  │ Analytics   │  │Twilio    │  │    │
│  │  │Base Module  │  │   Module    │  │   Module    │  │Provision │  │    │
│  │  │             │  │             │  │             │  │          │  │    │
│  │  │ • Upload    │  │ • Calendar  │  │ • Reports   │  │ • Buy #  │  │    │
│  │  │ • Process   │  │ • Email     │  │ • Metrics   │  │ • Config │  │    │
│  │  │ • Search    │  │ • Connect   │  │ • Export    │  │ • Test   │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └──────────┘  │    │
│  │                                                                      │    │
│  │  Technologies: NestJS, Passport, Bull Queue, TypeORM, Zod          │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ Database Operations
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                                DATA LAYER                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌────────────────────┐  ┌────────────────────┐  ┌──────────────────┐      │
│  │    MongoDB         │  │   Redis Cache      │  │  File Storage    │      │
│  │    Database        │  │   & Queue          │  │  (S3 / Local)    │      │
│  │                    │  │                    │  │                  │      │
│  │ • Users            │  │ • Session Cache    │  │ • Knowledge Docs │      │
│  │ • Businesses       │  │ • Config Cache     │  │ • Uploads        │      │
│  │ • Configs          │  │ • Bull Queue       │  │ • Backups        │      │
│  │ • Knowledge Docs   │  │ • Rate Limiting    │  │                  │      │
│  │ • Setup Jobs       │  │                    │  │                  │      │
│  │ • Analytics        │  │                    │  │                  │      │
│  └────────────────────┘  └────────────────────┘  └──────────────────┘      │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ Configuration Files & Runtime Integration
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          INTEGRATION LAYER                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                         AHCA SERVER                                  │    │
│  │                      (Voice Agent Runtime)                           │    │
│  │                                                                      │    │
│  │  Reads Generated Configuration:                                     │    │
│  │  • configs/businesses/{businessId}/config.json                      │    │
│  │  • configs/businesses/{businessId}/prompt_rules.json                │    │
│  │  • configs/businesses.json (phone mapping)                          │    │
│  │                                                                      │    │
│  │  Services:                                                           │    │
│  │  • BusinessConfigService → Loads configs                            │    │
│  │  • EmbeddingService → Vector search                                 │    │
│  │  • EmailService → Send summaries                                    │    │
│  │  • CalendarService → Book appointments                              │    │
│  │  • RealtimeVADService → Handle calls                                │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     │ Twilio WebHooks
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL SERVICES                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Twilio   │  │ OpenAI   │  │  Google  │  │Microsoft │  │ Mailchimp│     │
│  │          │  │          │  │ Calendar │  │ Calendar │  │  /Resend │     │
│  │ • Phone  │  │ • GPT    │  │          │  │          │  │          │     │
│  │ • SMS    │  │ • Whisper│  │ • OAuth  │  │ • OAuth  │  │ • API    │     │
│  │ • Media  │  │ • TTS    │  │ • Events │  │ • Events │  │ • Lists  │     │
│  │   Stream │  │ • Embed  │  │          │  │          │  │          │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Step-by-Step Onboarding Flow (Detailed)

### Visual Timeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      USER ONBOARDING TIMELINE                                │
│                      (Total Time: ~20 minutes)                               │
└─────────────────────────────────────────────────────────────────────────────┘

0 min ────────────────────────────────────────────────────────────► 20 min
  │       │       │       │       │       │       │       │       │
  ▼       ▼       ▼       ▼       ▼       ▼       ▼       ▼       ▼
 Sign   Business Agent  Flow  Features Knowledge Review Launch
  Up    Profile  Config Design Select   Upload   & Test Complete

 2min    3min    3min   4min    3min     2min     2min    1min

┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐
│ ✅   ││ ✅   ││ ✅   ││ ✅   ││ ✅   ││ ✅   ││ ⏳   ││ 🎉   │
│Email ││Basic ││Agent ││Call  ││Enable││Upload││Auto  ││Voice │
│ Pass ││Info  ││Name  ││Steps ││RAG & ││PDFs/ ││Setup ││Agent │
│      ││Hours ││Style ││Order ││Email ││TXTs  ││Jobs  ││Live! │
└──────┘└──────┘└──────┘└──────┘└──────┘└──────┘└──────┘└──────┘

                                                  ▲
                                                  │
                                    This is where automation happens!
                                    No user intervention required
```

---

## 🔄 Automation Workflow - Behind the Scenes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   AUTOMATED SETUP PROCESS (Backend)                          │
│                   Triggered when user clicks "Launch"                        │
└─────────────────────────────────────────────────────────────────────────────┘

User Clicks "Launch My Voice Agent"
         │
         ▼
┌────────────────────────────────────────────────────────────────────────┐
│ ORCHESTRATOR: Setup Controller                                         │
│ • Creates setupJob record in database                                  │
│ • Initializes status tracking                                          │
│ • Opens WebSocket connection for real-time updates                     │
└────────────────────────────────────────────────────────────────────────┘
         │
         ├──────────────────────────────────────────────────────────────┐
         │                                                              │
         │ PARALLEL EXECUTION                                           │
         │                                                              │
         ▼                                                              ▼
┌─────────────────────────┐                              ┌─────────────────────┐
│ TASK 1: File Generation │                              │ TASK 2: Twilio      │
│ (2 seconds)              │                              │ Provisioning        │
│                          │                              │ (8 seconds)         │
│ • Generate businessId    │                              │                     │
│ • Create config.json     │                              │ • Search available  │
│ • Create prompt_rules    │                              │   phone numbers     │
│ • Update businesses.json │                              │ • Purchase number   │
│ • Create knowledge dir   │                              │ • Configure webhook │
│                          │                              │ • Test connection   │
│ Status: ✅ COMPLETED     │                              │                     │
└─────────────────────────┘                              │ Status: ✅ COMPLETED │
         │                                                └─────────────────────┘
         │                                                              │
         └──────────────────┬───────────────────────────────────────────┘
                            │
                            ▼
         ┌──────────────────────────────────────────────────────────────┐
         │ TASK 3: Database Setup (Sequential)                          │
         │ (3 seconds)                                                   │
         │                                                               │
         │  Step 3.1: Create MongoDB Collection                         │
         │  └─→ Collection: knowledge_base_superior_fencing             │
         │      Status: ✅ Created                                       │
         │                                                               │
         │  Step 3.2: Insert Placeholder Document                       │
         │  └─→ Placeholder inserted                                    │
         │      Status: ✅ Ready                                         │
         └───────────────────────────────────────────────────────────────┘
                            │
                            ▼
         ┌──────────────────────────────────────────────────────────────┐
         │ TASK 4: Vector Index Creation (Async Job)                    │
         │ (2-5 minutes - runs in background)                           │
         │                                                               │
         │  • Queue Bull job: "create-vector-index"                     │
         │  • Call MongoDB Atlas Admin API                              │
         │  • Create index definition (1536 dims, cosine similarity)    │
         │  • Poll for index status: PENDING → BUILDING → ACTIVE        │
         │                                                               │
         │  Status: ⏳ IN PROGRESS (user can continue)                   │
         └───────────────────────────────────────────────────────────────┘
                            │
                            ├───────────────────────────────────────────┐
                            │                                           │
                            ▼                                           ▼
         ┌────────────────────────────────┐         ┌────────────────────────────┐
         │ TASK 5: Store Credentials      │         │ TASK 6: Process Knowledge  │
         │ (1 second)                      │         │ Base (Async Job)           │
         │                                 │         │ (30 sec - 5 min per doc)   │
         │ • Encrypt API keys              │         │                            │
         │ • Store in Integrations table   │         │ For each document:         │
         │ • Generate .env placeholders    │         │ • Extract text             │
         │                                 │         │ • Normalize & clean        │
         │ Status: ✅ COMPLETED             │         │ • Semantic chunking        │
         └────────────────────────────────┘         │ • Generate embeddings      │
                            │                        │ • Store in MongoDB         │
                            │                        │                            │
                            │                        │ Status: ⏳ IN PROGRESS      │
                            │                        └────────────────────────────┘
                            │                                           │
                            └───────────────┬───────────────────────────┘
                                            │
                                            ▼
         ┌──────────────────────────────────────────────────────────────┐
         │ TASK 7: Initialize AHCA Server Services                      │
         │ (3 seconds)                                                   │
         │                                                               │
         │ • Trigger config reload in ahca-server                       │
         │ • Initialize BusinessConfigService for new business          │
         │ • Initialize EmbeddingService with business collection       │
         │ • Initialize EmailService with business credentials          │
         │ • Initialize CalendarService (if enabled)                    │
         │ • Warm up all service connections                            │
         │                                                               │
         │ Status: ✅ COMPLETED                                          │
         └───────────────────────────────────────────────────────────────┘
                            │
                            ▼
         ┌──────────────────────────────────────────────────────────────┐
         │ TASK 8: Validation & Testing                                 │
         │ (10 seconds)                                                  │
         │                                                               │
         │ Test 1: Twilio Webhook                                       │
         │ └─→ GET /health?businessId=superior-fencing                  │
         │     Status: ✅ 200 OK                                         │
         │                                                               │
         │ Test 2: Knowledge Base Search (if RAG enabled)               │
         │ └─→ Search for "services"                                    │
         │     Status: ✅ 3 results found                                │
         │                                                               │
         │ Test 3: Email Service                                        │
         │ └─→ Send test email                                          │
         │     Status: ✅ Email sent successfully                        │
         │                                                               │
         │ Test 4: Calendar Integration (if enabled)                    │
         │ └─→ List available time slots                                │
         │     Status: ✅ Calendar connected                             │
         │                                                               │
         │ Status: ✅ ALL TESTS PASSED                                   │
         └───────────────────────────────────────────────────────────────┘
                            │
                            ▼
         ┌──────────────────────────────────────────────────────────────┐
         │ TASK 9: Finalize & Activate                                  │
         │ (1 second)                                                    │
         │                                                               │
         │ • Update business status → "active"                          │
         │ • Mark setupJob as "completed"                               │
         │ • Send welcome email with phone number & docs                │
         │ • Log setup completion event                                 │
         │ • Emit WebSocket event: "setup:complete"                     │
         │                                                               │
         │ Status: ✅ SETUP COMPLETE!                                    │
         └───────────────────────────────────────────────────────────────┘
                            │
                            ▼
         ┌──────────────────────────────────────────────────────────────┐
         │ Frontend Redirects to Dashboard                              │
         │                                                               │
         │ 🎉 Congratulations! Your voice agent is live!                │
         │ 📞 Your phone number: +1 (503) 548-4387                      │
         │ 🧪 [Test Your Agent] button available                        │
         └───────────────────────────────────────────────────────────────┘
```

---

## 📄 Document Processing Pipeline (Visual)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      KNOWLEDGE BASE PROCESSING                               │
│                    From Upload to Searchable Chunks                          │
└─────────────────────────────────────────────────────────────────────────────┘

User Uploads: services.pdf (120 KB)
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: Upload & Storage                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  • Validate file type: ✅ PDF accepted                                       │
│  • Generate document ID: doc_sf_001                                          │
│  • Store in S3/filesystem: /uploads/superior-fencing/services.pdf           │
│  • Create DB record: KnowledgeDocuments                                      │
│  • Queue processing job: Bull → "process-document"                           │
│                                                                              │
│  Time: 2 seconds                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 2: Text Extraction                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PDF File → pdf-parse library                                               │
│                                                                              │
│  Extracted Text (5,432 characters):                                          │
│  ┌───────────────────────────────────────────────────────────────────┐     │
│  │ "Superior Fence & Construction Services                            │     │
│  │                                                                     │     │
│  │ Residential Fencing                                                │     │
│  │ We specialize in custom residential fencing solutions including    │     │
│  │ wood privacy fences, vinyl fencing, chain-link, and decorative...  │     │
│  │                                                                     │     │
│  │ Commercial Fencing                                                 │     │
│  │ Our commercial services include security fencing, parking lot...   │     │
│  │ ..."                                                               │     │
│  └───────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  Time: 3 seconds                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 3: Text Normalization & Cleaning                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Before:                           After:                                   │
│  "Weâ€™re offering..."        →  "We're offering..."                      │
│  "Serviceâ€"Commercial"       →  "Service—Commercial"                     │
│  "3\u00A0years"                →  "3 years"                                 │
│                                                                              │
│  • Remove encoding artifacts                                                 │
│  • Fix line breaks and spacing                                               │
│  • Normalize unicode characters                                              │
│  • Clean extra whitespace                                                    │
│                                                                              │
│  Cleaned Text: 5,389 characters (43 characters removed)                      │
│  Time: 1 second                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 4: Structure Detection                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Detected Sections:                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Section 1: "Residential Fencing" (842 chars)                        │   │
│  │ Section 2: "Commercial Fencing" (1,023 chars)                       │   │
│  │ Section 3: "Fence Repair Services" (678 chars)                      │   │
│  │ Section 4: "Gate Installation" (521 chars)                          │   │
│  │ Section 5: "Emergency Services" (445 chars)                         │   │
│  │ Section 6: "Contact & Hours" (380 chars)                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Generated JSON Structure:                                                   │
│  {                                                                           │
│    "doc_id": "doc_sf_001",                                                   │
│    "source": "services.pdf",                                                 │
│    "sections": [                                                             │
│      {                                                                       │
│        "section_id": "sec_1",                                                │
│        "heading": "Residential Fencing",                                     │
│        "normalized_text": "We specialize in custom residential...",          │
│        "labels": { "intents": ["services", "residential"] }                  │
│      },                                                                      │
│      ...                                                                     │
│    ]                                                                         │
│  }                                                                           │
│                                                                              │
│  Time: 2 seconds                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 5: Semantic Chunking                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  For Section 1 "Residential Fencing" (842 chars):                           │
│                                                                              │
│  1. Split into sentences → 12 sentences                                     │
│  2. Sliding window (3 sentences) → Compare embeddings                       │
│  3. Detect semantic breaks when similarity < 0.75                           │
│                                                                              │
│  Result:                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Chunk 1 (245 chars):                                                │   │
│  │ "We specialize in custom residential fencing solutions including    │   │
│  │  wood privacy fences, vinyl fencing, chain-link, and decorative     │   │
│  │  iron fencing. Our team has over 20 years of experience..."         │   │
│  │                                                                      │   │
│  │ Chunk 2 (312 chars):                                                │   │
│  │ "Wood privacy fences are our most popular option, offering both     │   │
│  │  beauty and security for your property. We use high-quality cedar   │   │
│  │  and treated lumber designed to last for decades..."                │   │
│  │                                                                      │   │
│  │ Chunk 3 (285 chars):                                                │   │
│  │ "Vinyl fencing is an excellent low-maintenance alternative that     │   │
│  │  never needs painting or staining. Available in multiple styles..." │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Total Chunks Created: 18 chunks from 6 sections                            │
│  Average Chunk Size: 324 characters                                          │
│  Time: 8 seconds                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 6: Embedding Generation                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  For each chunk → OpenAI Embeddings API                                     │
│  Model: text-embedding-3-small (1536 dimensions)                            │
│                                                                              │
│  Batch Processing (5 chunks at a time):                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Batch 1 (Chunks 1-5)   → API Call → 5 embeddings  ✅                │   │
│  │ Batch 2 (Chunks 6-10)  → API Call → 5 embeddings  ✅                │   │
│  │ Batch 3 (Chunks 11-15) → API Call → 5 embeddings  ✅                │   │
│  │ Batch 4 (Chunks 16-18) → API Call → 3 embeddings  ✅                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Total API Calls: 4                                                          │
│  Total Embeddings: 18 (each 1536 floats)                                    │
│  Cost: ~$0.0001 (OpenAI pricing)                                            │
│  Time: 12 seconds (including rate limiting)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 7: Database Storage                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Collection: knowledge_base_superior_fencing                                 │
│                                                                              │
│  Insert 18 documents:                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ {                                                                    │   │
│  │   "_id": ObjectId("..."),                                            │   │
│  │   "text": "We specialize in custom residential fencing...",          │   │
│  │   "embedding": [0.0234, -0.1234, 0.5432, ... (1536 floats)],        │   │
│  │   "metadata": {                                                      │   │
│  │     "businessId": "superior-fencing",                                │   │
│  │     "documentId": "doc_sf_001",                                      │   │
│  │     "sectionId": "sec_1",                                            │   │
│  │     "category": "services",                                          │   │
│  │     "source": "services.pdf",                                        │   │
│  │     "chunkIndex": 0,                                                 │   │
│  │     "createdAt": "2024-10-29T12:34:56Z"                              │   │
│  │   }                                                                  │   │
│  │ }                                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  Bulk Insert: 18 documents inserted successfully                            │
│  Time: 2 seconds                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 8: Verification                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Test Query: "What residential fencing services do you offer?"              │
│                                                                              │
│  1. Generate embedding for query                                            │
│  2. Vector search in collection (top 3 results)                             │
│  3. Results:                                                                 │
│     ┌───────────────────────────────────────────────────────────────────┐  │
│     │ Result 1 (similarity: 0.89):                                      │  │
│     │ "We specialize in custom residential fencing solutions..."        │  │
│     │                                                                    │  │
│     │ Result 2 (similarity: 0.84):                                      │  │
│     │ "Wood privacy fences are our most popular option..."              │  │
│     │                                                                    │  │
│     │ Result 3 (similarity: 0.81):                                      │  │
│     │ "Vinyl fencing is an excellent low-maintenance alternative..."    │  │
│     └───────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ✅ Vector search working correctly!                                         │
│  Update document status → "completed"                                        │
│  Total processing time: 30 seconds                                           │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
    ✅ Document Ready!
    Knowledge base searchable by voice agent
```

---

## 🔌 Integration Flow Diagrams

### Google Calendar Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│               GOOGLE CALENDAR INTEGRATION SETUP                              │
└─────────────────────────────────────────────────────────────────────────────┘

User Clicks "Connect Google Calendar"
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND: Open OAuth Flow                                                   │
│ • Redirect to Google OAuth consent screen                                   │
│ • Request scopes: calendar.readonly, calendar.events                        │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ USER: Grants Permission                                                     │
│ • Select Google account                                                      │
│ • Review permissions                                                         │
│ • Click "Allow"                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ GOOGLE: Redirect with Auth Code                                            │
│ → https://yourdomain.com/integrations/callback?code=AUTH_CODE              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ BACKEND: Exchange Code for Tokens                                           │
│ • POST to Google token endpoint                                             │
│ • Receive: access_token, refresh_token, expires_in                          │
│ • Encrypt tokens                                                             │
│ • Store in Integrations collection                                           │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ BACKEND: Test Connection                                                    │
│ • Call Google Calendar API: list calendars                                  │
│ • Show calendar selection UI to user                                        │
│ • User selects primary calendar                                             │
│ • Store calendar ID                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ BACKEND: Update Business Config                                             │
│ • Update config.json with calendar settings                                 │
│ • Initialize GoogleCalendarService in ahca-server                           │
│ • Mark integration as "connected"                                            │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
    ✅ Calendar Connected!
    Voice agent can now book appointments
```

### Twilio Phone Number Provisioning

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 TWILIO PHONE NUMBER PROVISIONING                             │
└─────────────────────────────────────────────────────────────────────────────┘

User's Business Phone: (503) 550-1817
Extract Area Code: 503
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Search Available Numbers                                            │
│ • Twilio API: availablePhoneNumbers('US').local.list({ areaCode: '503' })  │
│ • Results:                                                                   │
│   1. +1 (503) 548-4387  ✅ Available                                        │
│   2. +1 (503) 548-4388  ✅ Available                                        │
│   3. +1 (503) 548-4389  ✅ Available                                        │
│   4. +1 (503) 548-4390  ✅ Available                                        │
│   5. +1 (503) 548-4391  ✅ Available                                        │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Purchase Phone Number                                               │
│ • Select first available: +1 (503) 548-4387                                 │
│ • Twilio API: incomingPhoneNumbers.create({                                │
│     phoneNumber: '+15035484387',                                            │
│     voiceUrl: 'https://ahca-server.com/twilio/voice/incoming',             │
│     voiceMethod: 'POST'                                                     │
│   })                                                                        │
│ • Purchase successful!                                                       │
│ • Cost: $1.00/month                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Configure Webhooks                                                  │
│ • Update phone number webhooks:                                             │
│   - Voice URL: /twilio/voice/incoming?businessId=superior-fencing           │
│   - Status Callback: /twilio/voice/status                                   │
│   - Recording Status: /twilio/voice/recording                               │
│ • Enable media streaming                                                     │
│ • Configure DTMF (for # key emergency routing)                              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: Test Connection                                                     │
│ • Send test webhook to ahca-server                                          │
│ • Verify ahca-server responds with valid TwiML                              │
│ • Check routing works correctly                                             │
│ • ✅ Test successful!                                                        │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 5: Update Configuration                                                │
│ • Update business record: twilioNumber = '+15035484387'                     │
│ • Update businesses.json: phone mapping                                     │
│ • Update config.json: phoneNumber field                                     │
│ • Notify user: "Your phone number is ready!"                                │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
    ✅ Phone Number Provisioned!
    📞 +1 (503) 548-4387
    Voice agent ready to receive calls
```

---

## 📊 Data Flow - Call Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INCOMING CALL FLOW (Runtime)                              │
│              How the voice agent handles an actual call                      │
└─────────────────────────────────────────────────────────────────────────────┘

Customer Dials: +1 (503) 548-4387
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TWILIO: Incoming Call                                                       │
│ • Identifies called number: +15035484387                                    │
│ • Sends webhook: POST /twilio/voice/incoming                                │
│   Body: { To: "+15035484387", From: "+15035551234", CallSid: "CA..." }     │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ AHCA SERVER: Route to Business                                              │
│ • Look up phone in businesses.json: +15035484387 → "superior-fencing"       │
│ • Load business config: configs/businesses/superior-fencing/config.json     │
│ • Initialize business context for call                                      │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ AHCA SERVER: Start Voice Agent                                              │
│ • Load SuperiorFencingHandler                                               │
│ • Load prompt rules from prompt_rules.json                                  │
│ • Initialize session with greeting                                          │
│ • Return TwiML to start media stream                                        │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ CALL IN PROGRESS                                                            │
│                                                                              │
│ Agent: "Hi there, I'm Mason, Superior Fence & Construction's virtual        │
│         assistant. If this is an emergency or time-sensitive, please        │
│         press the pound key now..."                                         │
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────┐    │
│ │ User: "My name is John Smith"                                       │    │
│ │ Agent: "Thanks — I heard you say your name is John Smith,          │    │
│ │        is that right?"                                              │    │
│ │ User: "Yes"                                                         │    │
│ │ Agent: "Great, John. What's the best phone number to reach you at?"│    │
│ │ User: "503-555-1234"                                                │    │
│ │ Agent: "Got it — I have (503) 555-1234."                           │    │
│ │ User: "I need a new fence installed"                                │    │
│ │ Agent: "What's the main reason for your call?"                      │    │
│ │ Agent: "Would you like us to call you back on the next business    │    │
│ │        day, or is there no rush?"                                   │    │
│ │ User: "Next business day is fine"                                   │    │
│ └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│ Agent: "Great! Let me confirm your details:                                 │
│         • Name: John Smith                                                  │
│         • Phone: (503) 555-1234                                             │
│         • Reason: New fence installation                                    │
│         • Urgency: Next business day                                        │
│         Does this look correct?"                                            │
│                                                                              │
│ User: "Yes, thank you"                                                      │
│                                                                              │
│ Agent: "Perfect! Our team will call you back on the next business day.     │
│         Is there anything else I can help you with?"                        │
│                                                                              │
│ User: "No, that's all"                                                      │
│                                                                              │
│ Agent: "Thank you for calling Superior Fence & Construction. Have a great  │
│         day!"                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ POST-CALL PROCESSING                                                        │
│                                                                              │
│ 1. Save call transcript to database                                         │
│ 2. Generate call summary                                                    │
│ 3. Send email summary to: doug@sherpaprompt.com (via Mailchimp)            │
│                                                                              │
│    Email Content:                                                            │
│    ┌───────────────────────────────────────────────────────────────────┐   │
│    │ Subject: New Lead: John Smith - Fence Installation                │   │
│    │                                                                    │   │
│    │ You have a new lead from your voice agent:                        │   │
│    │                                                                    │   │
│    │ Customer Information:                                              │   │
│    │ • Name: John Smith                                                 │   │
│    │ • Phone: (503) 555-1234                                           │   │
│    │ • Reason: New fence installation                                  │   │
│    │ • Urgency: Next business day                                      │   │
│    │                                                                    │   │
│    │ Call Details:                                                      │   │
│    │ • Duration: 2m 34s                                                │   │
│    │ • Date/Time: Oct 29, 2024 at 2:34 PM                             │   │
│    │                                                                    │   │
│    │ [View Full Transcript]                                            │   │
│    └───────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│ 4. Update business analytics                                                │
│ 5. Log call completion                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
    ✅ Call Complete!
    Lead captured and business owner notified
```

---

## 🎯 Summary: Key Automation Points

### What Gets Automated (Zero Manual Work)

✅ **Business Configuration**
- Auto-generate businessId from business name
- Create config.json with all settings
- Create prompt_rules.json from flow design
- Update phone mapping automatically

✅ **Phone Provisioning**
- Search available numbers in business area code
- Purchase number via Twilio API
- Configure webhooks automatically
- Test connection

✅ **Database Setup**
- Create MongoDB collection for business
- Generate collection name from businessId
- Insert placeholder documents
- Set up indexes

✅ **Vector Search Index**
- Create Atlas Vector Search index via API
- Configure 1536 dimensions, cosine similarity
- Add metadata filters
- Poll for index activation status

✅ **Knowledge Base Processing**
- Upload documents (PDF, DOCX, TXT, JSON)
- Extract text from various formats
- Clean and normalize text
- Detect sections automatically
- Semantic chunking with AI
- Generate embeddings
- Store in MongoDB

✅ **Integration Setup**
- OAuth flow for Google/Microsoft calendar
- API key encryption and storage
- Email service configuration
- Test all integrations

✅ **Service Initialization**
- Reload ahca-server configs
- Initialize business-specific services
- Warm up connections
- Validate everything works

✅ **Deployment**
- Update ahca-server runtime
- Make voice agent live
- Send welcome email
- Enable dashboard access

---

**Total Setup Time:** ~3-5 minutes of automated processing  
**User Time Investment:** ~15-20 minutes of form filling  
**Technical Knowledge Required:** None - fully guided process  
**Manual Steps Required:** Zero

---

**Document Version:** 1.0  
**Last Updated:** October 29, 2024  
**Companion Document:** SELF_SERVICE_ONBOARDING_ARCHITECTURE.md

