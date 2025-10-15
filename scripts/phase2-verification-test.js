/**
 * Phase 2 Verification Tests
 * Tests UX improvements for voice agent
 * 
 * Issues tested:
 * - Issue 3: Email spelled back for confirmation
 * - Issue 4: Date repeated in human-friendly way
 * - Issue 5: Appointment review is concise and natural
 * - Issue 6: Time slots presented as ranges
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3001/api/chained-voice';
const TEST_SESSION_ID = 'phase2-test-' + Date.now();

let testsPassed = 0;
let testsFailed = 0;

// Helper function to call API
async function testAPI(endpoint, data) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  
  return response.json();
}

// Helper to check if response contains expected patterns
function containsPattern(text, pattern) {
  if (typeof pattern === 'string') {
    return text.toLowerCase().includes(pattern.toLowerCase());
  }
  return pattern.test(text);
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║     Phase 2: UX Improvements Verification Tests       ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Test 3: Email spelling confirmation
  console.log('Test 3: Email local part spelling');
  try {
    const sessionId = `${TEST_SESSION_ID}-3`;
    await testAPI('/process', { sessionId, text: 'I want to schedule a demo' });
    await testAPI('/process', { sessionId, text: 'My name is John Smith' });
    const emailResult = await testAPI('/process', { sessionId, text: 'test@gmail.com' });
    
    // Should spell out "t-e-s-t at gmail.com"
    const hasSpelling = emailResult.response && (
      emailResult.response.includes('-') || 
      emailResult.response.toLowerCase().includes('at gmail')
    );
    
    if (hasSpelling) {
      console.log('✅ PASS: Email spelled back for confirmation');
      console.log('   Response includes:', emailResult.response.substring(0, 100) + '...\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Email not spelled back');
      console.log('   Got:', emailResult.response, '\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
  }

  // Test 4: Human-friendly date format
  console.log('Test 4: Date repeated in human-friendly way');
  try {
    const sessionId = `${TEST_SESSION_ID}-4`;
    await testAPI('/process', { sessionId, text: 'I want to schedule a demo' });
    await testAPI('/process', { sessionId, text: 'John Smith' });
    await testAPI('/process', { sessionId, text: 'john@test.com' });
    await testAPI('/process', { sessionId, text: 'Google Calendar' });
    await testAPI('/process', { sessionId, text: 'Product demo' });
    
    const dateResult = await testAPI('/process', { sessionId, text: 'December 25 2024' });
    
    // Should include the date in a natural format
    const hasNaturalDate = dateResult.response && (
      containsPattern(dateResult.response, 'December') ||
      containsPattern(dateResult.response, 'Dec')
    );
    
    if (hasNaturalDate) {
      console.log('✅ PASS: Date in human-friendly format');
      console.log('   Response:', dateResult.response.substring(0, 100) + '...\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Date not in human-friendly format');
      console.log('   Got:', dateResult.response, '\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
  }

  // Test 5: Concise appointment review
  console.log('Test 5: Appointment review is concise (not listing all changes)');
  try {
    const sessionId = `${TEST_SESSION_ID}-5`;
    await testAPI('/process', { sessionId, text: 'I want to schedule a demo' });
    await testAPI('/process', { sessionId, text: 'Jane Doe' });
    await testAPI('/process', { sessionId, text: 'jane@example.com' });
    await testAPI('/process', { sessionId, text: 'Microsoft Calendar' });
    await testAPI('/process', { sessionId, text: 'Consultation' });
    
    // Get available date
    const dateResponse = await testAPI('/process', { sessionId, text: 'October 24 2025' });
    
    // Pick first available time
    const timeResult = await testAPI('/process', { sessionId, text: '2 PM' });
    
    // Check that review is concise (not listing "Change service to...", "Change date to...", etc.)
    const isConcise = timeResult.response && 
      !containsPattern(timeResult.response, 'Change service to') &&
      !containsPattern(timeResult.response, 'Change date to') &&
      !containsPattern(timeResult.response, 'Change time to');
    
    const hasQuestion = timeResult.response && (
      containsPattern(timeResult.response, 'look good') ||
      containsPattern(timeResult.response, 'correct') ||
      containsPattern(timeResult.response, 'confirm')
    );
    
    if (isConcise && hasQuestion) {
      console.log('✅ PASS: Review is concise with open-ended question');
      console.log('   Response:', timeResult.response.substring(0, 150) + '...\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Review is too verbose');
      console.log('   Got:', timeResult.response, '\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
  }

  // Test 6: Time slots as ranges
  console.log('Test 6: Time slots presented as ranges');
  try {
    const sessionId = `${TEST_SESSION_ID}-6`;
    await testAPI('/process', { sessionId, text: 'Schedule a demo' });
    await testAPI('/process', { sessionId, text: 'Bob Johnson' });
    await testAPI('/process', { sessionId, text: 'bob@test.com' });
    await testAPI('/process', { sessionId, text: 'Google' });
    await testAPI('/process', { sessionId, text: 'Demo' });
    
    const dateResult = await testAPI('/process', { sessionId, text: 'December 20 2024' });
    
    // Should show ranges like "12 PM to 3 PM" instead of listing all slots
    const hasRange = dateResult.response && (
      containsPattern(dateResult.response, 'to ') ||
      containsPattern(dateResult.response, 'between')
    );
    
    // Should NOT list multiple individual slots like "12:00 PM, 12:30 PM, 1:00 PM, 1:30 PM..."
    const avoidsLongList = dateResult.response && 
      !(/\d{1,2}:\d{2}\s*(?:AM|PM),\s*\d{1,2}:\d{2}\s*(?:AM|PM),\s*\d{1,2}:\d{2}\s*(?:AM|PM)/.test(dateResult.response));
    
    if (hasRange && avoidsLongList) {
      console.log('✅ PASS: Time slots shown as ranges');
      console.log('   Response:', dateResult.response, '\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Time slots not shown as ranges');
      console.log('   Got:', dateResult.response, '\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log(`║  Phase 2 Test Results: ${testsPassed} passed, ${testsFailed} failed${' '.repeat(Math.max(0, 18 - testsPassed.toString().length - testsFailed.toString().length))}║`);
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  if (testsFailed === 0) {
    console.log('🎉 All Phase 2 tests passed!\n');
  } else {
    console.log('⚠️  Some tests failed. Please review the output above.\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});

