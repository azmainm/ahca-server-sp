#!/usr/bin/env node

/**
 * Comprehensive Voice Agent Test Suite
 * 
 * Tests the entire conversation flow including:
 * - Name/email collection with edge cases
 * - RAG queries and responses
 * - Appointment booking with weekend date handling
 * - Email changes during appointment review
 * - Calendar integration (Google/Microsoft)
 * - Email service functionality
 * 
 * Run with: node comprehensive-voice-test.js
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3001';
const TEST_EMAIL = 'azmainmorshed03@gmail.com';

// Weekend dates in August 2055 for testing
const WEEKEND_DATES = [
  'August 7, 2055',   // Saturday
  'August 8, 2055',   // Sunday  
  'August 14, 2055',  // Saturday
  'August 15, 2055',  // Sunday
  'August 21, 2055',  // Saturday
  'August 22, 2055',  // Sunday
  'August 28, 2055',  // Saturday
  'August 29, 2055'   // Sunday
];

// Weekday alternatives for August 2055
const WEEKDAY_ALTERNATIVES = [
  'August 4, 2055',   // Monday
  'August 5, 2055',   // Tuesday
  'August 6, 2055',   // Wednesday
  'August 9, 2055',   // Thursday
  'August 11, 2055',  // Monday
  'August 12, 2055',  // Tuesday
  'August 13, 2055',  // Wednesday
  'August 16, 2055',  // Thursday
  'August 18, 2055',  // Monday
  'August 19, 2055',  // Tuesday
  'August 20, 2055',  // Wednesday
  'August 23, 2055',  // Thursday
  'August 25, 2055',  // Monday
  'August 26, 2055',  // Tuesday
  'August 27, 2055',  // Wednesday
  'August 30, 2055'   // Thursday
];

class VoiceAgentTester {
  constructor() {
    this.sessionId = null;
    this.testResults = [];
    this.currentTest = '';
  }

  /**
   * Utility function to make API calls
   */
  async callAPI(text, sessionId = null) {
    try {
      const response = await fetch(`${BASE_URL}/api/chained-voice/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          sessionId: sessionId || this.sessionId
        })
      });

      const result = await response.json();
      
      if (result.success) {
        this.sessionId = result.sessionId;
        return result;
      } else {
        throw new Error(`API Error: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error(`❌ API Call failed for "${text}":`, error.message);
      throw error;
    }
  }

  /**
   * Log test results
   */
  logResult(testName, success, details = '') {
    const status = success ? '✅' : '❌';
    const message = `${status} ${testName}${details ? ': ' + details : ''}`;
    console.log(message);
    
    this.testResults.push({
      test: testName,
      success,
      details,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Random selection utilities
   */
  getRandomItem(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  getRandomCalendarType() {
    return Math.random() < 0.5 ? 'Google' : 'Microsoft';
  }

  /**
   * Test 1: Basic Name and Email Collection
   */
  async testNameEmailCollection() {
    console.log('\n🧪 Test 1: Name and Email Collection');
    console.log('=' + '='.repeat(40));

    try {
      // Start new session
      this.sessionId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      
      // Test name and email in one message
      const result = await this.callAPI(`My name is Azmain Morshed and my email is ${TEST_EMAIL}`);
      
      const expectedFollowUp = 'Do you have any questions about SherpaPrompt\'s automation services, or would you like to schedule a demo?';
      const hasCorrectFollowUp = result.response.includes(expectedFollowUp) || result.response.includes('SherpaPrompt');
      
      this.logResult('Name/Email Collection', 
        result.userInfo.name === 'Azmain Morshed' && 
        result.userInfo.email === TEST_EMAIL && 
        result.userInfo.collected === true &&
        hasCorrectFollowUp,
        `Name: ${result.userInfo.name}, Email: ${result.userInfo.email}, Follow-up: ${hasCorrectFollowUp}`
      );

      return result;
    } catch (error) {
      this.logResult('Name/Email Collection', false, error.message);
      throw error;
    }
  }

  /**
   * Test 2: RAG Knowledge Base Queries
   */
  async testRAGQueries() {
    console.log('\n🧪 Test 2: RAG Knowledge Base Queries');
    console.log('=' + '='.repeat(40));

    const queries = [
      {
        question: 'What does SherpaPrompt do?',
        expectedKeywords: ['automation', 'conversation', 'outcomes', 'call service', 'transcript']
      },
      {
        question: 'What are your pricing tiers?',
        expectedKeywords: ['starter', 'professional', 'enterprise', 'pricing', 'tier']
      },
      {
        question: 'How does call automation work?',
        expectedKeywords: ['call', 'automation', 'AI', 'agent', 'qualify', 'leads']
      },
      {
        question: 'What integrations do you support?',
        expectedKeywords: ['integration', 'CRM', 'project management', 'tools', 'API']
      },
      {
        question: 'Can I get a demo?',
        expectedKeywords: ['demo', 'schedule', 'show', 'action', 'personalized']
      }
    ];

    for (const query of queries) {
      try {
        const result = await this.callAPI(query.question);
        
        // Check if response contains expected keywords
        const hasKeywords = query.expectedKeywords.some(keyword => 
          result.response.toLowerCase().includes(keyword.toLowerCase())
        );
        
        // Check if response includes follow-up question
        const hasFollowUp = result.response.includes('Is there anything else you\'d like to know, or would you like to schedule a demo?') || 
                           result.response.includes('schedule a demo') || 
                           result.response.includes('anything else');
        
        this.logResult(`RAG Query: ${query.question}`, 
          hasKeywords && hasFollowUp,
          `Keywords found: ${hasKeywords}, Follow-up: ${hasFollowUp}`
        );
        
        // Small delay between queries
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        this.logResult(`RAG Query: ${query.question}`, false, error.message);
      }
    }
  }

  /**
   * Test 3: Appointment Booking with Weekend Date Handling
   */
  async testAppointmentBooking() {
    console.log('\n🧪 Test 3: Appointment Booking with Weekend Date Handling');
    console.log('=' + '='.repeat(50));

    try {
      // Step 1: Start appointment booking
      let result = await this.callAPI('I would like to schedule a demo');
      this.logResult('Demo Initiation', 
        result.response.includes('Google Calendar or Microsoft Calendar') || result.response.includes('demo'),
        'Calendar selection prompt'
      );

      // Step 2: Select random calendar type
      const calendarType = this.getRandomCalendarType();
      console.log(`📅 Selected calendar: ${calendarType}`);
      result = await this.callAPI(calendarType);
      this.logResult('Calendar Selection', 
        result.response.includes('What type of service'),
        `Selected: ${calendarType}`
      );

      // Step 3: Select service
      result = await this.callAPI('product demo');
      this.logResult('Service Selection', 
        result.response.includes('What date would work best') || result.response.includes('date'),
        'Service: product demo'
      );

      // Step 4: Try weekend date (should be rejected)
      const weekendDate = this.getRandomItem(WEEKEND_DATES);
      console.log(`📅 Trying weekend date: ${weekendDate}`);
      result = await this.callAPI(weekendDate);
      
      const weekendRejected = result.response.includes('no available appointment slots') || 
                             result.response.includes('next available date');
      this.logResult('Weekend Date Rejection', weekendRejected, `Tried: ${weekendDate}`);

      // Step 5: Accept suggested alternative or provide weekday
      let timeSlots = [];
      if (result.response.includes('next available date')) {
        // Extract suggested slots and pick first one
        const slotMatches = result.response.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/gi);
        if (slotMatches && slotMatches.length > 0) {
          timeSlots = slotMatches;
          const selectedTime = timeSlots[0];
          console.log(`⏰ Selecting suggested time: ${selectedTime}`);
          result = await this.callAPI(selectedTime);
        }
      } else {
        // Provide alternative weekday date
        const weekdayDate = this.getRandomItem(WEEKDAY_ALTERNATIVES);
        console.log(`📅 Trying weekday alternative: ${weekdayDate}`);
        result = await this.callAPI(weekdayDate);
        
        // Extract available slots
        const slotMatches = result.response.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/gi);
        if (slotMatches && slotMatches.length > 0) {
          timeSlots = slotMatches;
          const selectedTime = timeSlots[0];
          console.log(`⏰ Selecting time: ${selectedTime}`);
          result = await this.callAPI(selectedTime);
        }
      }

      // Step 6: Should now be in review state
      const inReviewState = result.response.includes('Let me review your appointment details') ||
                           result.response.includes('Service:') ||
                           result.response.includes('Date:') ||
                           result.response.includes('Time:');
      
      this.logResult('Appointment Review State', inReviewState, 'Reached review phase');

      return result;
    } catch (error) {
      this.logResult('Appointment Booking', false, error.message);
      throw error;
    }
  }

  /**
   * Test 4: Email Change During Appointment Review
   */
  async testEmailChangeDuringReview() {
    console.log('\n🧪 Test 4: Email Change During Appointment Review');
    console.log('=' + '='.repeat(45));

    try {
      // Change email during review
      const newEmail = 'updated.email@test.com';
      const result = await this.callAPI(`I would like to change my email to ${newEmail}`);
      
      const emailUpdated = result.response.includes(newEmail) && 
                          result.userInfo.email === newEmail;
      
      this.logResult('Email Change During Review', emailUpdated, `Updated to: ${newEmail}`);

      // Confirm appointment
      const confirmResult = await this.callAPI('sounds good');
      const appointmentConfirmed = confirmResult.response.includes('appointment has been scheduled successfully') ||
                                  confirmResult.response.includes('Google Calendar') ||
                                  confirmResult.response.includes('Microsoft Calendar');
      
      this.logResult('Appointment Confirmation', appointmentConfirmed, 'Final confirmation');

      return confirmResult;
    } catch (error) {
      this.logResult('Email Change During Review', false, error.message);
      throw error;
    }
  }

  /**
   * Test 5: Edge Cases and Error Handling
   */
  async testEdgeCases() {
    console.log('\n🧪 Test 5: Edge Cases and Error Handling');
    console.log('=' + '='.repeat(40));

    const edgeCases = [
      {
        name: 'Invalid Date Format',
        input: 'tomorrow at 3pm',
        expectedBehavior: 'Should ask for proper date format'
      },
      {
        name: 'Ambiguous Service Request',
        input: 'I need help with automation',
        expectedBehavior: 'Should provide relevant SherpaPrompt information'
      },
      {
        name: 'Multiple Date Changes',
        input: 'Can we do September 15th instead?',
        expectedBehavior: 'Should handle date change request'
      }
    ];

    for (const testCase of edgeCases) {
      try {
        // Start fresh session for edge case testing
        this.sessionId = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        
        // Set up basic info first
        await this.callAPI(`My name is Edge Tester and my email is edge@test.com`);
        
        // Test the edge case
        const result = await this.callAPI(testCase.input);
        
        // Basic success criteria: got a response without error
        const success = result.success && result.response && result.response.length > 0;
        
        this.logResult(`Edge Case: ${testCase.name}`, success, testCase.expectedBehavior);
        
      } catch (error) {
        this.logResult(`Edge Case: ${testCase.name}`, false, error.message);
      }
    }
  }

  /**
   * Test 6: Email Service Integration
   */
  async testEmailService() {
    console.log('\n🧪 Test 6: Email Service Integration');
    console.log('=' + '='.repeat(35));

    try {
      // Test email service health
      const healthResponse = await fetch(`${BASE_URL}/api/chained-voice/health`);
      const healthData = await healthResponse.json();
      
      const emailServiceReady = healthData.services && healthData.services.email && 
                               healthData.services.email.ready === true;
      
      this.logResult('Email Service Health', emailServiceReady, 'Service status check');

      // Test direct email functionality (if available)
      try {
        const emailResponse = await fetch(`${BASE_URL}/api/chained-voice/test-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            to: TEST_EMAIL,
            subject: 'Voice Agent Test',
            message: 'This is a test email from the voice agent test suite.'
          })
        });
        
        if (emailResponse.ok) {
          const emailResult = await emailResponse.json();
          this.logResult('Direct Email Test', emailResult.success, 'Email sending capability');
        } else {
          this.logResult('Direct Email Test', false, 'Email endpoint not available or failed');
        }
      } catch (emailError) {
        this.logResult('Direct Email Test', false, 'Email endpoint not accessible');
      }

    } catch (error) {
      this.logResult('Email Service Integration', false, error.message);
    }
  }

  /**
   * Test 7: Complete Conversation Flow
   */
  async testCompleteFlow() {
    console.log('\n🧪 Test 7: Complete End-to-End Conversation Flow');
    console.log('=' + '='.repeat(50));

    try {
      // Start completely fresh session
      this.sessionId = `complete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      
      console.log('👤 Starting complete conversation flow...');
      
      // 1. Name and email
      await this.callAPI(`Hi, my name is Complete Tester and my email is ${TEST_EMAIL}`);
      
      // 2. Ask a few questions
      await this.callAPI('What automation services do you offer?');
      await this.callAPI('How does call automation work?');
      
      // 3. Start appointment
      await this.callAPI('I\'d like to schedule a demo');
      
      // 4. Calendar selection
      const calendarType = this.getRandomCalendarType();
      await this.callAPI(calendarType);
      
      // 5. Service selection
      await this.callAPI('product demo');
      
      // 6. Weekend date (should be rejected)
      const weekendDate = this.getRandomItem(WEEKEND_DATES);
      const weekendResult = await this.callAPI(weekendDate);
      
      // 7. Accept alternative or provide weekday
      let finalResult;
      if (weekendResult.response.includes('next available date')) {
        const slotMatches = weekendResult.response.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/gi);
        if (slotMatches && slotMatches.length > 0) {
          finalResult = await this.callAPI(slotMatches[0]);
        }
      } else {
        const weekdayDate = this.getRandomItem(WEEKDAY_ALTERNATIVES);
        const dateResult = await this.callAPI(weekdayDate);
        const slotMatches = dateResult.response.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))/gi);
        if (slotMatches && slotMatches.length > 0) {
          finalResult = await this.callAPI(slotMatches[0]);
        }
      }
      
      // 8. Confirm appointment
      if (finalResult && finalResult.response.includes('review')) {
        const confirmResult = await this.callAPI('looks good');
        const success = confirmResult.response.includes('scheduled successfully');
        this.logResult('Complete Conversation Flow', success, 'Full end-to-end test');
      } else {
        this.logResult('Complete Conversation Flow', false, 'Did not reach confirmation stage');
      }
      
    } catch (error) {
      this.logResult('Complete Conversation Flow', false, error.message);
    }
  }

  /**
   * Generate test report
   */
  generateReport() {
    console.log('\n📊 TEST REPORT');
    console.log('=' + '='.repeat(50));
    
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter(r => r.success).length;
    const failedTests = totalTests - passedTests;
    const successRate = ((passedTests / totalTests) * 100).toFixed(1);
    
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Success Rate: ${successRate}%`);
    
    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(r => !r.success)
        .forEach(r => console.log(`  - ${r.test}: ${r.details}`));
    }
    
    console.log('\n📋 Detailed Results:');
    this.testResults.forEach(r => {
      const status = r.success ? '✅' : '❌';
      console.log(`  ${status} ${r.test}${r.details ? ': ' + r.details : ''}`);
    });
    
    // Save report to file
    const reportData = {
      timestamp: new Date().toISOString(),
      summary: { totalTests, passedTests, failedTests, successRate: `${successRate}%` },
      results: this.testResults
    };
    
    require('fs').writeFileSync(
      `voice-agent-test-report-${Date.now()}.json`, 
      JSON.stringify(reportData, null, 2)
    );
    
    console.log(`\n💾 Report saved to: voice-agent-test-report-${Date.now()}.json`);
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🚀 Starting Comprehensive Voice Agent Test Suite');
    console.log('=' + '='.repeat(60));
    console.log(`📧 Test Email: ${TEST_EMAIL}`);
    console.log(`🌐 Base URL: ${BASE_URL}`);
    console.log(`📅 Weekend Dates: ${WEEKEND_DATES.length} options`);
    console.log(`📅 Weekday Alternatives: ${WEEKDAY_ALTERNATIVES.length} options`);
    
    try {
      // Check if server is running
      const healthCheck = await fetch(`${BASE_URL}/api/chained-voice/health`);
      if (!healthCheck.ok) {
        throw new Error('Server is not running or health check failed');
      }
      console.log('✅ Server health check passed');
      
      // Run all test suites
      await this.testNameEmailCollection();
      await this.testRAGQueries();
      await this.testAppointmentBooking();
      await this.testEmailChangeDuringReview();
      await this.testEdgeCases();
      await this.testEmailService();
      await this.testCompleteFlow();
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      this.logResult('Test Suite Execution', false, error.message);
    } finally {
      this.generateReport();
    }
  }
}

// Export for use as module or run directly
if (require.main === module) {
  const tester = new VoiceAgentTester();
  tester.runAllTests().catch(console.error);
}

module.exports = VoiceAgentTester;
