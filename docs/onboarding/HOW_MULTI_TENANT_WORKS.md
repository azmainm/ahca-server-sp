# Multi-Tenant Voice Agent System Architecture
## Technical Configuration Guide

This document explains the technical architecture and configuration system for the multi-tenant voice agent platform.

---

## System Overview

The multi-tenant voice agent system allows multiple businesses to use the same infrastructure while maintaining complete data isolation. Each business operates independently with their own:

- Dedicated phone number and Twilio configuration
- Isolated MongoDB collection for knowledge base storage
- Separate Atlas Vector Search index for RAG queries
- Business-specific calendar, email, and company information
- Custom AI agent configuration and prompts

---

## Architecture Flow

### Request Processing Flow

1. **Incoming Call**: Twilio receives call to specific phone number
2. **Webhook Trigger**: Twilio sends POST request to `/twilio/voice` endpoint
3. **Business Identification**: System extracts `To` parameter and looks up business ID
4. **Configuration Loading**: System loads business-specific configuration
5. **Service Initialization**: Business-specific services are instantiated
6. **WebSocket Establishment**: Twilio Media Stream connects with business context
7. **Session Management**: Tenant context is stored and managed per session
8. **Request Routing**: All subsequent requests use business-specific services

### Phone Number to Business Mapping

The system uses a centralized mapping file to route calls:

**File: `configs/businesses.json`**
```json
{
  "phoneToBusinessMap": {
    "+15555551234": "sherpaprompt",
    "+15555555678": "acme-corp",
    "+15555559999": "tech-solutions-inc"
  },
  "description": "Maps Twilio phone numbers to business IDs",
  "lastUpdated": "2024-10-22T00:00:00.000Z",
  "version": "1.0"
}
```

**Key Points:**
- Phone numbers must be in E.164 format
- Business IDs must match directory names in `configs/businesses/`
- Mapping is loaded at startup and cached in memory

---

## Directory Structure

The multi-tenant system organizes configurations in a hierarchical structure:

```
ahca-server/
├── configs/
│   ├── businesses.json                    # Central phone-to-business mapping
│   └── businesses/                        # Business-specific configurations
│       ├── {businessId}/                  # Directory per business
│       │   ├── config.json               # Business configuration
│       │   └── prompt_rules.json         # AI agent configuration
│       ├── sherpaprompt/
│       │   ├── config.json
│       │   └── prompt_rules.json
│       └── acme-corp/
│           ├── config.json
│           └── prompt_rules.json
```

### Business Configuration Files

Each business requires exactly two configuration files:

#### 1. `config.json` - Business Configuration
Contains all technical settings and credentials for the business:

- Database configuration (collection and vector index names)
- Calendar integration settings (Google/Microsoft credentials)
- Email service configuration (provider, API keys, from addresses)
- Company information (name, contact details, hours)
- Twilio configuration (if business-specific settings needed)

#### 2. `prompt_rules.json` - AI Agent Configuration
Defines the AI agent's behavior and personality:

- Agent name and personality traits
- Conversation flow rules
- Response templates and guidelines
- Business-specific knowledge and context

---

## Configuration Structure

### Business Config Schema (`config.json`)

```json
{
  "businessId": "acme-corp",
  "businessName": "ACME Corporation",
  "phoneNumber": "+15555555678",
  
  "database": {
    "collectionName": "acme_corp_knowledge_base",
    "vectorIndexName": "acme_corp_vector_index"
  },
  
  "calendar": {
    "provider": "google",
    "google": {
      "serviceAccountEmail": "${BUSINESS_ACME_CORP_GOOGLE_SERVICE_ACCOUNT_EMAIL}",
      "privateKey": "${BUSINESS_ACME_CORP_GOOGLE_PRIVATE_KEY}",
      "projectId": "${BUSINESS_ACME_CORP_GOOGLE_PROJECT_ID}",
      "calendarId": "${BUSINESS_ACME_CORP_GOOGLE_CALENDAR_ID}"
    }
  },
  
  "email": {
    "provider": "resend",
    "apiKey": "${BUSINESS_ACME_CORP_RESEND_API_KEY}",
    "fromEmail": "assistant@acme-corp.com",
    "fromName": "ACME Assistant"
  },
  
  "companyInfo": {
    "name": "ACME Corporation",
    "phone": "+15555555678",
    "email": "info@acme-corp.com",
    "website": "www.acme-corp.com",
    "address": "123 Business Ave, Corporate City, CC 12345",
    "hours": {
      "monday_friday": "9:00 AM - 5:00 PM",
      "saturday": "10:00 AM - 2:00 PM",
      "sunday": "Closed"
    }
  }
}
```

### Environment Variable Pattern

Business-specific credentials use the pattern: `BUSINESS_{BUSINESSID}_{SERVICE}_{CREDENTIAL}`

Examples:
- `BUSINESS_ACME_CORP_GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `BUSINESS_SHERPAPROMPT_RESEND_API_KEY`
- `BUSINESS_TECH_SOLUTIONS_MICROSOFT_CLIENT_ID`

---

## Core Services

### BusinessConfigService

**Location**: `shared/services/BusinessConfigService.js`

**Purpose**: Loads and manages business configurations

**Key Methods**:
- `initialize()`: Loads phone-to-business mapping and all business configs
- `getBusinessIdFromPhone(phoneNumber)`: Returns business ID for phone number
- `getBusinessConfig(businessId)`: Returns full configuration for business
- `loadBusinessConfig(businessId)`: Loads individual business configuration

**Configuration Loading**:
1. Reads `configs/businesses.json` for phone mapping
2. Loads each business's `config.json` file
3. Substitutes environment variables using `${VARIABLE_NAME}` syntax
4. Caches configurations in memory for performance

### TenantContextManager

**Location**: `shared/services/TenantContextManager.js`

**Purpose**: Manages business context per session

**Key Methods**:
- `setTenantContext(sessionId, businessId)`: Associates session with business
- `getBusinessId(sessionId)`: Retrieves business ID for session
- `removeTenantContext(sessionId)`: Cleans up session context

**Session Management**:
- Uses Twilio CallSid as session identifier
- Stores business context for duration of call
- Automatically cleans up on call termination

---

## Service Instantiation

### Multi-Tenant Service Pattern

All business-specific services follow the same pattern:

```javascript
// Static factory method for business-specific instances
static createForBusiness(businessConfig) {
  // Validate required configuration
  // Create instance with business-specific settings
  return new ServiceClass(businessConfig);
}

// Constructor accepts business configuration
constructor(businessConfig = null) {
  if (businessConfig) {
    // Use business-specific configuration
  } else {
    // Fallback to environment variables (backward compatibility)
  }
}
```

### Service Initialization Flow

**Location**: `features/voice-agent/routes/chained-voice.js`

1. **Session Context Retrieval**: Get business ID from `TenantContextManager`
2. **Configuration Loading**: Load business config via `BusinessConfigService`
3. **Service Creation**: Instantiate business-specific services:
   - `EmbeddingService.createForBusiness(businessConfig)`
   - `GoogleCalendarService.createForBusiness(calendarConfig)`
   - `MicrosoftCalendarService.createForBusiness(calendarConfig)`
   - `CompanyInfoService.createForBusiness(companyInfo)`
   - `EmailService.createForBusiness(emailConfig)`
4. **Handler Initialization**: Create `ConversationFlowHandler` with business services
5. **Request Processing**: Process conversation with business-specific context

---

## Data Isolation

### MongoDB Collections

Each business uses a dedicated MongoDB collection for knowledge base storage:

**Pattern**: `{businessId}_knowledge_base`

Examples:
- `sherpaprompt_knowledge_base`
- `acme_corp_knowledge_base`
- `tech_solutions_inc_knowledge_base`

### Atlas Vector Search Indexes

Each business has a separate vector search index:

**Pattern**: `{businessId}_vector_index`

Examples:
- `sherpaprompt_vector_index`
- `acme_corp_vector_index`
- `tech_solutions_inc_vector_index`

### EmbeddingService Configuration

The `EmbeddingService` is configured per business:

```javascript
// Business-specific instance
const embeddingService = EmbeddingService.createForBusiness(businessConfig);

// Uses business-specific collection and index
const collectionName = businessConfig.database.collectionName;
const vectorIndexName = businessConfig.database.vectorIndexName;
```

---

## Integration Points

### Twilio Voice Webhook

**Endpoint**: `POST /twilio/voice`

**Process**:
1. Extract `To` parameter (dialed phone number)
2. Look up business ID using `BusinessConfigService`
3. Validate business configuration exists
4. Generate TwiML with WebSocket URL including business ID
5. Return TwiML response to Twilio

**WebSocket URL Format**:
```
wss://your-domain.com/twilio-media?callSid={callSid}&businessId={businessId}&from={from}&to={to}
```

### Twilio Media Stream WebSocket

**Endpoint**: `WebSocket /twilio-media`

**Process**:
1. Extract business ID from WebSocket URL parameters
2. Validate business ID is present
3. Store business context in `TenantContextManager` on stream start
4. Clean up context on stream stop/close
5. Route all media processing through business-specific services

### Voice Processing Endpoint

**Endpoint**: `POST /chained-voice/process`

**Process**:
1. Extract session ID from request
2. Get business ID from `TenantContextManager`
3. Load business-specific services
4. Process conversation with business context
5. Return response with business information

---

## Onboarding Process

### Sequential Steps for New Business

1. **Environment Variables Setup**
   - Add business-specific environment variables following naming pattern
   - Configure credentials for calendar, email, and other integrations

2. **Phone Number Configuration**
   - Add phone number to business mapping in `configs/businesses.json`
   - Ensure phone number is configured in Twilio

3. **Business Directory Creation**
   - Create directory: `configs/businesses/{businessId}/`
   - Use automated script: `node scripts/onboarding/setup-new-business.js`

4. **Configuration Files**
   - Create `config.json` with business-specific settings
   - Create `prompt_rules.json` with AI agent configuration
   - Validate all required fields are present

5. **Database Setup**
   - Create MongoDB collection for knowledge base
   - Create Atlas Vector Search index
   - Use script: `node scripts/onboarding/create-vector-index.js`

6. **Knowledge Base Population**
   - Prepare knowledge base files in appropriate format
   - Process and upload using: `node scripts/onboarding/setup-business-knowledge.js`
   - Verify embeddings are created correctly

7. **Testing and Validation**
   - Test phone number routing
   - Verify service initialization
   - Validate data isolation
   - Test all integrations (calendar, email, etc.)

### Automation Scripts

**Setup Script**: `scripts/onboarding/setup-new-business.js`
- Creates business directory structure
- Generates configuration templates
- Updates phone number mapping

**Vector Index Script**: `scripts/onboarding/create-vector-index.js`
- Creates MongoDB Atlas Vector Search index
- Configures index with proper settings

**Knowledge Setup Script**: `scripts/onboarding/setup-business-knowledge.js`
- Processes knowledge base files
- Creates embeddings and stores in business collection

---

## Troubleshooting

### Common Issues

1. **Business Not Found**
   - Check phone number format in `businesses.json`
   - Verify business directory exists
   - Confirm `config.json` is valid JSON

2. **Service Initialization Failures**
   - Verify environment variables are set correctly
   - Check configuration file syntax
   - Validate required fields are present

3. **Data Isolation Issues**
   - Confirm collection names are unique per business
   - Verify vector index names don't conflict
   - Check `EmbeddingService` configuration

4. **Session Context Problems**
   - Verify `TenantContextManager` is receiving business ID
   - Check WebSocket URL parameter extraction
   - Confirm session cleanup on call termination

### Debugging Tools

**Business Config Validation**:
```bash
node -e "
const { BusinessConfigService } = require('./shared/services/BusinessConfigService');
const service = new BusinessConfigService();
service.initialize().then(() => {
  console.log('Loaded businesses:', service.phoneToBusinessMap);
});
"
```

**Service Instantiation Test**:
```bash
node -e "
const { BusinessConfigService } = require('./shared/services/BusinessConfigService');
const { EmbeddingService } = require('./shared/services/EmbeddingService');
// Test service creation for specific business
"
```

---

## Security Considerations

### Environment Variable Management
- Use secure environment variable storage
- Rotate credentials regularly
- Follow principle of least privilege for service accounts

### Data Isolation
- Verify MongoDB collection isolation
- Ensure vector indexes are properly scoped
- Test cross-tenant data access prevention

### Access Control
- Implement proper authentication for admin endpoints
- Secure configuration file access
- Monitor for unauthorized business configuration changes

---

## Performance Considerations

### Configuration Caching
- Business configurations are cached in memory
- Phone number mappings are loaded at startup
- Consider cache invalidation strategy for configuration updates

### Service Instantiation
- Services are created per request to ensure proper isolation
- Consider connection pooling for database services
- Monitor memory usage with multiple concurrent businesses

### Database Performance
- Use appropriate indexes on business-specific collections
- Monitor vector search performance per business
- Consider sharding strategy for large-scale deployments

---

## Monitoring and Logging

### Business Context Logging
All log entries include business context when available:

```javascript
console.log(`🏢 [ServiceName] Business: ${businessId} - Action performed`);
```

### Key Metrics to Monitor
- Requests per business
- Service initialization times
- Database query performance per collection
- Vector search latency per index
- Error rates by business

### Health Checks
- Verify all business configurations load successfully
- Test service instantiation for each business
- Monitor database connectivity per collection
- Validate vector index availability