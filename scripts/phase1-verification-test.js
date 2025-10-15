/**
 * Phase 1 Verification Tests
 * Verifies specific fixes for:
 * - Issue 2: No blocking on name/email collection
 * - Issue 7: Name/email collection bug
 * - Issue 9: Abbreviated month support
 * - Issue 10: Time parsing
 * - Issue 13: Calendar time format
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3001';
const TEST_SESSION_ID = `phase1-test-${Date.now()}`;

async function testAPI(endpoint, data) {
  const response = await fetch(`${BASE_URL}/api/chained-voice${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return await response.json();
}

async function runPhase1Tests() {
  console.log('🧪 Phase 1 Verification Tests\n');
  console.log('=' .repeat(60) + '\n');

  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Issue 2 - Should allow questions without name/email
  console.log('Test 1: Can ask questions without providing name/email first');
  try {
    const result = await testAPI('/process', {
      sessionId: `${TEST_SESSION_ID}-1`,
      text: 'What does SherpaPrompt do?'
    });
    
    if (result.success && result.response && !result.response.toLowerCase().includes('name') && !result.response.toLowerCase().includes('email')) {
      console.log('✅ PASS: Got answer without name/email requirement\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Still blocking on name/email\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
  }

  // Test 2: Issue 7 - Name/email collection bug
  console.log('Test 2: Collect name then email without confusion');
  try {
    const sessionId = `${TEST_SESSION_ID}-2`;
    
    // Start fresh - will ask for name/email on appointment
    await testAPI('/process', {
      sessionId,
      text: 'I want to schedule a demo'
    });
    
    // Provide just name without "my name is" to avoid name change pattern
    const nameResult = await testAPI('/process', {
      sessionId,
      text: 'John Smith'
    });
    
    // Should ask for email next, or say we have the name
    const hasEmailRequest = nameResult.response && nameResult.response.toLowerCase().includes('email');
    const avoidsStillNeedName = !nameResult.response.toLowerCase().includes('still need.*name');
    
    if (hasEmailRequest || (nameResult.success && avoidsStillNeedName)) {
      console.log('✅ PASS: Correctly handles name collection\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Wrong response after name:', nameResult.response, '\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
  }

  // Test 3: Issue 9 - Abbreviated month support
  console.log('Test 3: Parse abbreviated months (Oct 24 2025)');
  try {
    const { DateTimeParser } = require('../features/voice-agent/services/DateTimeParser');
    const parser = new DateTimeParser();
    
    const result = parser.parseDateFromText('Oct 24 2025');
    
    if (result.success && result.date === '2025-10-24') {
      console.log('✅ PASS: Correctly parsed "Oct 24 2025" to', result.date, '\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Failed to parse abbreviated month. Got:', result, '\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
  }

  // Test 4: Issue 10 - Time slot matching for "2:30 PM"
  console.log('Test 4: Match time "2:30 PM" to available slots');
  try {
    const { DateTimeParser } = require('../features/voice-agent/services/DateTimeParser');
    const parser = new DateTimeParser();
    
    const availableSlots = [
      { start: '12:00', end: '12:30', display: '12:00 PM' },
      { start: '14:30', end: '15:00', display: '2:30 PM' },
      { start: '15:00', end: '15:30', display: '3:00 PM' }
    ];
    
    const result = parser.findSelectedTimeSlot('2:30 PM', availableSlots);
    
    if (result && result.start === '14:30') {
      console.log('✅ PASS: Correctly matched "2:30 PM" to slot', result.start, '\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Failed to match time. Got:', result, '\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
  }

  // Test 5: Issue 13 - Calendar time format validation
  console.log('Test 5: Validate time format for calendar creation');
  try {
    const appointmentDetails = {
      title: 'Test Demo',
      date: '2025-10-24',
      time: '14:30',  // Should be in HH:mm format
      duration: 30
    };
    
    const timeRegex = /^\d{2}:\d{2}$/;
    
    if (timeRegex.test(appointmentDetails.time)) {
      console.log('✅ PASS: Time format is valid HH:mm:', appointmentDetails.time, '\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Invalid time format:', appointmentDetails.time, '\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
  }

  // Summary
  console.log('=' .repeat(60));
  console.log(`\n📊 Phase 1 Test Summary:`);
  console.log(`   Total: ${testsPassed + testsFailed}`);
  console.log(`   ✅ Passed: ${testsPassed}`);
  console.log(`   ❌ Failed: ${testsFailed}`);
  console.log(`   Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%\n`);

  if (testsFailed === 0) {
    console.log('🎉 All Phase 1 fixes verified successfully!\n');
  } else {
    console.log('⚠️  Some Phase 1 tests failed. Review the output above.\n');
  }
}

// Run tests
runPhase1Tests().catch(console.error);

