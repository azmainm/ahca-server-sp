# Multi-Tenant Voice Agent System - Business Onboarding Guide

This guide provides step-by-step instructions for onboarding a new business to the multi-tenant voice agent system.

## Overview

The multi-tenant voice agent system allows multiple businesses to use the same infrastructure while maintaining complete data isolation. Each business has:

- **Dedicated phone number** for Twilio calls
- **Isolated MongoDB collection** for knowledge base storage
- **Separate vector search index** for RAG queries
- **Business-specific configurations** for calendar, email, and company info
- **Custom AI agent personality** and prompts

## Prerequisites

Before onboarding a new business, ensure you have:

- [ ] MongoDB Atlas cluster with Vector Search enabled
- [ ] Twilio account with available phone numbers
- [ ] Access to business's calendar service (Google Calendar or Microsoft 365)
- [ ] Email service credentials (Resend or Mailchimp)
- [ ] Business information and knowledge base documents

## Step-by-Step Onboarding Process

### Step 1: Gather Business Information

Collect the following information from the business:

**Basic Information:**
- [ ] Business ID (lowercase, alphanumeric with hyphens, e.g., "acme-corp")
- [ ] Business Name (e.g., "ACME Corporation")
- [ ] Twilio Phone Number (E.164 format, e.g., "+15555555678")

**Calendar Integration:**
- [ ] Preferred calendar service (Google Calendar or Microsoft 365)
- [ ] Service account credentials or app registration details
- [ ] Calendar ID or shared mailbox email
- [ ] Business hours and timezone

**Email Configuration:**
- [ ] Preferred email service (Resend or Mailchimp)
- [ ] API credentials
- [ ] From email address and display name

**Company Information:**
- [ ] Company tagline and description
- [ ] Contact information (phone, email, address)
- [ ] Service areas
- [ ] Business hours
- [ ] Website URL

**AI Agent Configuration:**
- [ ] Agent name (e.g., "Alex", "Scout")
- [ ] Agent personality (e.g., "professional and helpful")
- [ ] Custom greeting message

### Step 2: Purchase and Configure Twilio Phone Number

1. **Purchase Phone Number:**
   ```bash
   # Log into Twilio Console
   # Go to Phone Numbers > Manage > Buy a number
   # Select a number in the desired area code
   # Purchase the number
   ```

2. **Configure Webhook URL:**
   ```
   Webhook URL: https://your-domain.com/twilio/voice
   HTTP Method: POST
   ```

3. **Note the phone number** in E.164 format (e.g., "+15555555678")

### Step 3: Set Up Calendar Integration

#### For Google Calendar:

1. **Create Service Account:**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select existing one
   - Enable Google Calendar API
   - Create a service account
   - Generate and download JSON key file

2. **Create Calendar:**
   - Create a new calendar in Google Calendar
   - Share calendar with service account email (with "Make changes to events" permission)
   - Note the calendar ID

3. **Gather Credentials:**
   - Service account email
   - Private key (from JSON file)
   - Calendar ID
   - Project ID

#### For Microsoft 365:

1. **Register Azure App:**
   - Go to [Azure Portal](https://portal.azure.com)
   - Register new application
   - Add Microsoft Graph API permissions: `Calendars.ReadWrite`
   - Create client secret

2. **Set Up Shared Mailbox:**
   - Create shared mailbox in Microsoft 365 admin center
   - Grant app permissions to access the mailbox

3. **Gather Credentials:**
   - Client ID
   - Client Secret
   - Tenant ID
   - Shared mailbox email

### Step 4: Set Up Email Service

#### For Resend:

1. **Create Resend Account:**
   - Sign up at [Resend](https://resend.com)
   - Verify your domain
   - Generate API key

2. **Configure Domain:**
   - Add DNS records for your domain
   - Verify domain ownership

#### For Mailchimp:

1. **Create Mailchimp Account:**
   - Sign up at [Mailchimp](https://mailchimp.com)
   - Generate API key from account settings

### Step 5: Run Business Setup Script

Execute the automated setup script:

```bash
cd /path/to/ahca-server

# Run the business setup script
node scripts/onboarding/setup-new-business.js \
  --businessId=acme-corp \
  --businessName="ACME Corporation" \
  --phoneNumber="+15555555678"
```

This script will:
- ✅ Create business configuration directory
- ✅ Generate business config file
- ✅ Create default prompt rules
- ✅ Set up knowledge base directory
- ✅ Create sample knowledge file
- ✅ Update phone number mapping
- ✅ Create MongoDB collection (if possible)

### Step 6: Configure Environment Variables

Add the following environment variables to your `.env` file:

```bash
# Replace ACME_CORP with your business ID in uppercase with underscores
# Example: acme-corp becomes ACME_CORP

# Google Calendar (if using Google Calendar)
BUSINESS_ACME_CORP_GOOGLE_EMAIL=service-account@project.iam.gserviceaccount.com
BUSINESS_ACME_CORP_GOOGLE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
BUSINESS_ACME_CORP_CALENDAR_ID=calendar-id@group.calendar.google.com
BUSINESS_ACME_CORP_PROJECT_ID=your-google-project-id

# Microsoft Calendar (if using Microsoft Calendar)
BUSINESS_ACME_CORP_AZURE_CLIENT_ID=your-azure-client-id
BUSINESS_ACME_CORP_AZURE_CLIENT_SECRET=your-azure-client-secret
BUSINESS_ACME_CORP_AZURE_TENANT_ID=your-azure-tenant-id
BUSINESS_ACME_CORP_SHARED_MAILBOX_EMAIL=calendar@acme-corp.com

# Email Service
BUSINESS_ACME_CORP_EMAIL_API_KEY=your-email-service-api-key
```

### Step 7: Create MongoDB Atlas Vector Search Index

#### Option A: Automated Creation (Recommended)

```bash
# Set up Atlas API credentials (optional)
export ATLAS_PUBLIC_KEY=your-atlas-public-key
export ATLAS_PRIVATE_KEY=your-atlas-private-key
export ATLAS_PROJECT_ID=your-atlas-project-id
export ATLAS_CLUSTER_NAME=Cluster0

# Run the index creation script
node scripts/onboarding/create-vector-index.js \
  --businessId=acme-corp \
  --autoCreate
```

#### Option B: Manual Creation

1. **Go to MongoDB Atlas Dashboard**
2. **Navigate to your cluster**
3. **Click on "Search" tab**
4. **Click "Create Search Index"**
5. **Choose "JSON Editor"**
6. **Use these settings:**
   - Database: `ah-call-service`
   - Collection: `knowledge_base_acme_corp` (replace with your business)
   - Index Name: `vector_index_acme_corp` (replace with your business)

7. **Paste this JSON definition:**
   ```json
   {
     "fields": [
       {
         "type": "vector",
         "path": "embedding",
         "numDimensions": 1536,
         "similarity": "cosine"
       },
       {
         "type": "filter",
         "path": "metadata.businessId"
       },
       {
         "type": "filter", 
         "path": "metadata.category"
       },
       {
         "type": "filter",
         "path": "metadata.type"
       }
     ]
   }
   ```

8. **Click "Next" and then "Create Search Index"**
9. **Wait for the index to build** (may take several minutes)

### Step 8: Prepare Knowledge Base Documents

1. **Create knowledge base files** in JSON format following the SherpaPrompt structure:

```json
{
  "doc_id": "acme_company_info",
  "sections": [
    {
      "section_id": "company_overview",
      "heading": "Company Overview",
      "normalized_text": "ACME Corporation is a leading provider of business solutions...",
      "labels": {
        "intents": ["company_info", "about"],
        "audience_profiles": ["general"]
      }
    }
  ],
  "access_tags": ["public"],
  "product_area": ["general"],
  "source_type": "kb",
  "version": "1.0",
  "last_modified": "2024-10-22T00:00:00.000Z"
}
```

2. **Place files** in the knowledge directory:
   ```
   /data/businesses/acme-corp/knowledge/
   ├── company_info.json
   ├── services.json
   ├── pricing.json
   └── faq.json
   ```

### Step 9: Process Knowledge Base

Run the knowledge base processing script:

```bash
# Process knowledge base documents
node scripts/onboarding/setup-business-knowledge.js \
  --businessId=acme-corp \
  --clear
```

This will:
- ✅ Load business configuration
- ✅ Initialize business-specific embedding service
- ✅ Clear existing embeddings (if --clear flag used)
- ✅ Process all JSON files in knowledge directory
- ✅ Create vector embeddings and store in MongoDB

### Step 10: Update Business Configuration

Edit the business configuration file to customize settings:

```bash
# Edit the configuration file
nano configs/businesses/acme-corp/config.json
```

**Key sections to customize:**

```json
{
  "calendar": {
    "provider": "google", // or "microsoft"
    "timezone": "America/New_York", // Business timezone
    "businessHours": {
      "start": "09:00",
      "end": "17:00",
      "daysOfWeek": [1, 2, 3, 4, 5] // Monday-Friday
    }
  },
  "companyInfo": {
    "name": "ACME Corporation",
    "tagline": "Innovation at Every Step",
    "phone": "5551234567",
    "email": "info@acme-corp.com",
    "website": "www.acme-corp.com",
    "address": "123 Business Ave, New York, NY 10001"
  },
  "promptConfig": {
    "agentName": "Alex",
    "agentPersonality": "professional and helpful",
    "greeting": "Hello! I'm Alex, ACME Corporation's virtual assistant..."
  }
}
```

### Step 11: Test the Integration

1. **Restart the server** to load new configuration:
   ```bash
   npm restart
   ```

2. **Test the phone number:**
   - Call the configured Twilio phone number
   - Verify the AI agent responds with the custom greeting
   - Test basic conversation and knowledge queries

3. **Test calendar integration:**
   - Ask to schedule an appointment
   - Verify calendar availability checking works
   - Complete an appointment booking

4. **Test email functionality:**
   - Complete a conversation
   - Verify conversation summary email is sent

### Step 12: Monitor and Troubleshoot

**Check logs for any errors:**
```bash
# Monitor server logs
tail -f logs/server.log

# Check for business-specific errors
grep "acme-corp" logs/server.log
```

**Common issues and solutions:**

| Issue | Solution |
|-------|----------|
| Phone calls not routing | Check phone number mapping in `configs/businesses.json` |
| Knowledge base not working | Verify MongoDB Atlas Vector Search index is active |
| Calendar integration failing | Check environment variables and service account permissions |
| Email not sending | Verify email service API keys and domain configuration |
| Agent personality not applied | Check `prompt_rules.json` and restart server |

## Business Configuration Reference

### Complete Configuration File Structure

```json
{
  "businessId": "acme-corp",
  "businessName": "ACME Corporation",
  "phoneNumber": "+15555555678",
  "database": {
    "collectionName": "knowledge_base_acme_corp",
    "vectorIndexName": "vector_index_acme_corp"
  },
  "calendar": {
    "provider": "google", // "google" or "microsoft"
    "google": {
      "serviceAccountEmail": "${BUSINESS_ACME_CORP_GOOGLE_EMAIL}",
      "privateKey": "${BUSINESS_ACME_CORP_GOOGLE_KEY}",
      "calendarId": "${BUSINESS_ACME_CORP_CALENDAR_ID}",
      "projectId": "${BUSINESS_ACME_CORP_PROJECT_ID}"
    },
    "microsoft": {
      "clientId": "${BUSINESS_ACME_CORP_AZURE_CLIENT_ID}",
      "clientSecret": "${BUSINESS_ACME_CORP_AZURE_CLIENT_SECRET}",
      "tenantId": "${BUSINESS_ACME_CORP_AZURE_TENANT_ID}",
      "sharedMailboxEmail": "${BUSINESS_ACME_CORP_SHARED_MAILBOX_EMAIL}"
    },
    "timezone": "America/New_York",
    "businessHours": {
      "start": "09:00",
      "end": "17:00",
      "daysOfWeek": [1, 2, 3, 4, 5]
    }
  },
  "email": {
    "provider": "resend", // "resend" or "mailchimp"
    "apiKey": "${BUSINESS_ACME_CORP_EMAIL_API_KEY}",
    "fromEmail": "support@acme-corp.com",
    "fromName": "ACME Support Team"
  },
  "companyInfo": {
    "name": "ACME Corporation",
    "tagline": "Innovation at Every Step",
    "established": "1995",
    "phone": "5551234567",
    "email": "info@acme-corp.com",
    "website": "www.acme-corp.com",
    "address": "123 Business Ave, New York, NY 10001",
    "service_areas": ["United States", "Canada"],
    "hours": {
      "monday_friday": "9:00 AM - 5:00 PM EST",
      "saturday": "10:00 AM - 2:00 PM EST",
      "sunday": "Closed",
      "support": "24/7 emergency support available"
    }
  },
  "promptConfig": {
    "agentName": "Alex",
    "agentPersonality": "professional and helpful",
    "greeting": "Hello! I'm Alex, ACME Corporation's virtual assistant. I'm here to help you with information about our services and schedule consultations. May I have your name please?"
  },
  "knowledgeBasePath": "/data/businesses/acme-corp/knowledge/",
  "version": "1.0",
  "createdAt": "2024-10-22T00:00:00.000Z",
  "lastUpdated": "2024-10-22T00:00:00.000Z"
}
```

### Environment Variables Template

```bash
# Business: ACME Corporation (acme-corp)
# Replace ACME_CORP with your business ID in uppercase with underscores

# Google Calendar Configuration (if using Google Calendar)
BUSINESS_ACME_CORP_GOOGLE_EMAIL=service-account@project.iam.gserviceaccount.com
BUSINESS_ACME_CORP_GOOGLE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
BUSINESS_ACME_CORP_CALENDAR_ID=calendar-id@group.calendar.google.com
BUSINESS_ACME_CORP_PROJECT_ID=your-google-project-id

# Microsoft Calendar Configuration (if using Microsoft Calendar)
BUSINESS_ACME_CORP_AZURE_CLIENT_ID=your-azure-client-id
BUSINESS_ACME_CORP_AZURE_CLIENT_SECRET=your-azure-client-secret
BUSINESS_ACME_CORP_AZURE_TENANT_ID=your-azure-tenant-id
BUSINESS_ACME_CORP_SHARED_MAILBOX_EMAIL=calendar@acme-corp.com

# Email Service Configuration
BUSINESS_ACME_CORP_EMAIL_API_KEY=your-email-service-api-key

# Optional: Atlas API for automated index creation
ATLAS_PUBLIC_KEY=your-atlas-public-key
ATLAS_PRIVATE_KEY=your-atlas-private-key
ATLAS_PROJECT_ID=your-atlas-project-id
ATLAS_CLUSTER_NAME=Cluster0
```

## Maintenance and Updates

### Adding New Knowledge Base Documents

1. **Add JSON files** to the knowledge directory:
   ```
   /data/businesses/acme-corp/knowledge/new-document.json
   ```

2. **Process the new documents:**
   ```bash
   node scripts/onboarding/setup-business-knowledge.js --businessId=acme-corp
   ```

### Updating Business Configuration

1. **Edit configuration file:**
   ```bash
   nano configs/businesses/acme-corp/config.json
   ```

2. **Restart server** to apply changes:
   ```bash
   npm restart
   ```

### Updating Environment Variables

1. **Update `.env` file** with new credentials
2. **Restart server** to load new environment variables

### Monitoring Business Performance

**Check session statistics:**
```bash
# View active sessions per business
curl http://localhost:3001/api/admin/sessions
```

**Monitor MongoDB collections:**
```bash
# Check document count per business
mongo "mongodb+srv://cluster.mongodb.net/ah-call-service" --eval "
  db.knowledge_base_acme_corp.countDocuments()
"
```

## Security Considerations

### Data Isolation

- ✅ **Separate MongoDB collections** per business
- ✅ **Dedicated vector search indexes** per business
- ✅ **Business-specific credentials** in environment variables
- ✅ **Session isolation** via tenant context manager

### Access Control

- ✅ **Phone number validation** prevents unauthorized access
- ✅ **Environment variable isolation** prevents credential leakage
- ✅ **Business configuration validation** ensures proper setup

### Credential Management

- 🔐 **Store sensitive credentials** in environment variables
- 🔐 **Use service accounts** with minimal required permissions
- 🔐 **Rotate API keys** regularly
- 🔐 **Monitor access logs** for suspicious activity

## Support and Troubleshooting

### Common Issues

**Issue: "No business configured for phone number"**
- **Solution:** Check `configs/businesses.json` phone mapping
- **Verify:** Phone number format is E.164 (+15555555678)

**Issue: "Vector search not working"**
- **Solution:** Verify MongoDB Atlas Vector Search index is active
- **Check:** Index name matches business configuration

**Issue: "Calendar integration failing"**
- **Solution:** Verify service account permissions
- **Check:** Environment variables are correctly set

**Issue: "Email not sending"**
- **Solution:** Verify email service API key and domain
- **Check:** From email domain is verified

### Getting Help

For technical support:
1. **Check server logs** for error messages
2. **Verify configuration files** are properly formatted
3. **Test individual components** (calendar, email, knowledge base)
4. **Contact system administrator** with specific error messages

---

## Quick Reference Checklist

Use this checklist for each new business onboarding:

- [ ] **Step 1:** Gather business information
- [ ] **Step 2:** Purchase and configure Twilio phone number
- [ ] **Step 3:** Set up calendar integration (Google/Microsoft)
- [ ] **Step 4:** Set up email service (Resend/Mailchimp)
- [ ] **Step 5:** Run business setup script
- [ ] **Step 6:** Configure environment variables
- [ ] **Step 7:** Create MongoDB Atlas Vector Search index
- [ ] **Step 8:** Prepare knowledge base documents
- [ ] **Step 9:** Process knowledge base
- [ ] **Step 10:** Update business configuration
- [ ] **Step 11:** Test the integration
- [ ] **Step 12:** Monitor and troubleshoot

**Estimated Time:** 2-4 hours per business (depending on complexity)

**Prerequisites:** MongoDB Atlas, Twilio account, calendar service, email service
