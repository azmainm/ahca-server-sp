# SherpaPrompt Voice Agent Testing Guide

## Overview
Comprehensive test scenarios for validating the migrated SherpaPrompt voice agent functionality, covering RAG queries, conversation flows, security compliance, and edge cases.

---

## 🔥 Critical Security & Compliance Tests

### PII Redaction Validation
- **Test**: Say phone numbers, emails, SSNs during conversation
- **Expected**: Logs show `[REDACTED_PHONE]`, `[REDACTED_EMAIL]`, etc.
- **Verify**: No raw PII appears in database or log files

### Emergency Intent Detection
- **Test Phrases**:
  - "We have a burst pipe and need help now"
  - "Production is down for our call agent"
  - "Safety issue on site, call me back now"
- **Expected**: Immediate warm transfer to on-call human within 20 seconds
- **Verify**: Transfer attempt logged with timestamps and disposition

### Search Filter Security
- **Test**: Ask for internal/sensitive information
- **Expected**: Agent only returns public-facing content
- **Verify**: No `access_tags: ["internal"]` content in responses

---

## 📋 Core Product Knowledge (RAG Tests)

### Company Mission & Values
- "What does SherpaPrompt do?"
- "What's your company mission?"
- "Who do you serve?"
- **Expected**: Accurate company positioning and value proposition

### Product Features
- "Tell me about Call Service Automation"
- "How does Transcript to Task Integration work?"
- "What is Voice to Estimate Automation?"
- "Explain the SherpaPrompt App"
- **Expected**: Detailed product capabilities from knowledge base

### Pricing Inquiries
- "What does it cost for a five person team?"
- "Do you charge per estimate or per seat?"
- "Is there a trial for call automation?"
- "Any implementation fees for integrating our CRM?"
- **Expected**: Accurate pricing from `pricing_1.1.json`

### Integration Questions
- "Do you integrate with Salesforce and Google Calendar?"
- "Can you work with Jobber and QuickBooks?"
- "How do I connect OneDrive and GitHub?"
- **Expected**: Specific integration capabilities and setup guidance

---

## 🎯 Intent Classification & Routing

### Sales Intent
- "What does SherpaPrompt do for a small trades business?"
- "Can your agent answer product questions and move leads forward?"
- "We want our own persona instead of Scout. Possible?"
- **Expected**: Proper qualification, demo offers, lead capture

### Support Intent
- "My estimate did not sync to QuickBooks"
- "Your agent is not seeing returning callers in the CRM"
- "How do I connect OneDrive and GitHub?"
- **Expected**: Troubleshooting steps, ticket creation, escalation if needed

### Scheduling Intent
- "Book a demo for this week in the afternoon"
- "Reschedule my onboarding to tomorrow at 3 pm"
- "Set a call with support about Salesforce integration"
- **Expected**: Calendar integration, slot offers, confirmations

### Estimate Intent
- "Start a hands-free fence estimate in the browser"
- "Use my materials pricing database to calculate costs"
- "Create the quote inside ServiceTitan and email me a link"
- **Expected**: Voice-to-estimate workflow, platform integration

### Transcript-to-Task Intent
- "Ingest yesterday's Zoom file and create tasks for owners"
- "We already have Teams transcripts. Use those instead"
- "Open a chat over the board meeting transcript"
- **Expected**: Transcript processing, task extraction, PM tool integration

---

## 👥 Persona-Specific Responses

### Software Developers & Builders
- "How do you pull only relevant files into prompts?"
- "Do you work in Cursor/VS Code?"
- "Can I reuse a 'recipe' across repos?"
- **Expected**: Technical explanations, IDE integration details

### Trades & Field Service Professionals
- "Can your agent answer product/service questions and book jobs?"
- "Can I talk through an estimate while measuring?"
- "Will it use my own pricing database?"
- **Expected**: Field-focused workflow, hands-free capabilities

### Marketing Leaders
- "Can you pull current technical details into landing pages?"
- "Do you integrate with our storage and site tools?"
- **Expected**: Content automation, marketing tool integration

### Enterprise Ops / IT / Compliance
- "Can you integrate without changing our stack?"
- "What audit signals do we get from call automation?"
- "How do you handle emergency escalations?"
- **Expected**: Security, compliance, audit trail information

---

## 🔄 Conversation Flow Tests

### Demo Request Flow
- **Test**: "I'd like to see a demo"
- **Expected**: Captures name and email before scheduling
- **Verify**: Lead properly recorded in CRM with demo_request status

### Appointment Setting
- **Test**: "Book a walkthrough for tomorrow"
- **Expected**: 
  - Offers available time slots
  - Confirms timezone
  - Sends calendar invite
  - Updates CRM with appointment

### Appointment Rescheduling
- **Test**: "Reschedule my demo to Friday at 2 PM"
- **Expected**:
  - Finds existing appointment
  - Confirms new time
  - Updates calendar
  - Notifies attendees

### Multi-turn Conversations
- **Test**: Complex back-and-forth about product features
- **Expected**: Maintains context, provides consistent information

---

## ⚠️ Edge Cases & Error Handling

### Unclear Intent
- **Test**: Vague requests like "Help me with stuff"
- **Expected**: Clarifying questions to determine intent

### Missing Information
- **Test**: "Book a demo" without providing contact details
- **Expected**: Requests required information (name, email)

### System Integration Failures
- **Test**: When CRM/Calendar is unavailable
- **Expected**: Graceful degradation, alternative options offered

### Timeout Scenarios
- **Test**: Long pauses during conversation
- **Expected**: Appropriate prompts to continue or end call

### Unsupported Requests
- **Test**: Requests outside SherpaPrompt capabilities
- **Expected**: Clear explanation of limitations, alternative suggestions

---

## 📊 Performance & Technical Tests

### Response Time
- **Target**: 3-6 seconds for end-to-end RAG queries
- **Test**: Measure time from question to complete response
- **Verify**: Consistent performance across different query types

### Vector Search Accuracy
- **Test**: Ask specific product questions
- **Expected**: Relevant chunks retrieved from knowledge base
- **Verify**: No irrelevant or outdated information

### Conversation State Management
- **Test**: Multi-turn conversations with context switches
- **Expected**: Proper state maintenance throughout session

### Audio Quality
- **Test**: Various audio conditions (background noise, different devices)
- **Expected**: Accurate speech recognition and clear TTS output

---

## 🔍 Validation Checklist

### Pre-Test Setup
- [ ] Core knowledge base processed (50 chunks from 3 files)
- [ ] Local reference files loaded (playbooks, troubleshooting)
- [ ] Environment variables configured
- [ ] PII redaction middleware active

### During Testing
- [ ] All responses reference SherpaPrompt (not fencing company)
- [ ] No sensitive/internal information exposed
- [ ] Emergency escalation works within 20 seconds
- [ ] Demo requests capture complete user information
- [ ] Calendar integration functions properly
- [ ] CRM updates occur for all interactions

### Post-Test Verification
- [ ] Check logs for PII redaction compliance
- [ ] Verify all interactions logged with proper metadata
- [ ] Confirm no errors in conversation processing
- [ ] Validate performance metrics meet targets
- [ ] Review escalation audit trail completeness

---

## 🚨 Failure Scenarios to Test

### Critical Failures
- Database connection loss during conversation
- OpenAI API rate limiting or failures
- Calendar service unavailable during booking
- CRM integration timeout

### Expected Behavior
- Graceful error messages to user
- Fallback options provided
- Proper error logging for debugging
- No system crashes or undefined responses

---

## 📝 Test Documentation

For each test scenario, document:
- **Input**: Exact phrase or action tested
- **Expected Output**: What should happen
- **Actual Output**: What actually happened
- **Pass/Fail**: Test result
- **Notes**: Any observations or issues
- **Logs**: Relevant log entries for debugging

---

*This guide covers the essential test scenarios for validating the SherpaPrompt voice agent migration. Execute tests systematically and document all results for quality assurance.*
