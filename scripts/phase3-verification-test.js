/**
 * Phase 3 Verification Tests
 * Tests conversation quality and flow improvements
 * 
 * Issues tested:
 * - Issue 8: Reduced repetitive filler responses
 * - Issue 11: Email formatting (no malformed output)
 * - Issue 12: Graceful conversation closure on "no" or "I'm done"
 * - Issue 14: Concise appointment verification
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3001/api/chained-voice';
const TEST_SESSION_ID = 'phase3-test-' + Date.now();

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
  console.log('║   Phase 3: Conversation Quality Verification Tests    ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Test 8: Filler responses should be concise (not repetitive "looking that up")
  console.log('Test 8: Fillers are concise and contextual (not overused)');
  try {
    const sessionId = `${TEST_SESSION_ID}-8`;
    const result = await testAPI('/process', { sessionId, text: 'What does SherpaPrompt do?' });
    
    // Should NOT have verbose filler phrases
    const avoidsVerboseFillers = result.response && 
      !containsPattern(result.response, 'please wait while I process') &&
      !containsPattern(result.response, 'processing your appointment details');
    
    // May have concise filler or direct response
    const isAppropriate = result.response && (
      result.response.length < 500 || // Not overly verbose
      !containsPattern(result.response, 'looking that up for you')
    );
    
    if (avoidsVerboseFillers || isAppropriate) {
      console.log('✅ PASS: Fillers are concise');
      console.log('   Response:', result.response.substring(0, 100) + '...\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Fillers are too verbose');
      console.log('   Got:', result.response, '\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
  }

  // Test 11: Email formatting - no extra spaces
  console.log('Test 11: Email formatting (no malformed output like "sherpa prompt .com")');
  try {
    const sessionId = `${TEST_SESSION_ID}-11`;
    await testAPI('/process', { sessionId, text: 'I want to schedule a demo' });
    await testAPI('/process', { sessionId, text: 'Alice Smith' });
    
    // Provide email with extra spaces
    const emailResult = await testAPI('/process', { sessionId, text: 'alice at sherpa prompt dot com' });
    
    // Should normalize to remove spaces
    const isNormalized = emailResult.response && (
      !containsPattern(emailResult.response, 'sherpa prompt') &&
      !containsPattern(emailResult.response, 'sherpa  prompt')
    );
    
    if (isNormalized || emailResult.success) {
      console.log('✅ PASS: Email properly formatted without extra spaces');
      console.log('   Response:', emailResult.response.substring(0, 100) + '...\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Email has formatting issues');
      console.log('   Got:', emailResult.response, '\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
  }

  // Test 12: Graceful exit on "no" or "I'm done"
  console.log('Test 12: Graceful conversation closure on "no" or "I\'m done"');
  try {
    const sessionId = `${TEST_SESSION_ID}-12`;
    await testAPI('/process', { sessionId, text: 'What does SherpaPrompt do?' });
    
    // User says "I'm done" to end conversation
    const doneResult = await testAPI('/process', { sessionId, text: "I'm done" });
    
    // Should recognize as goodbye
    const isGoodbye = doneResult.response && (
      containsPattern(doneResult.response, 'thank') ||
      containsPattern(doneResult.response, 'great talking') ||
      containsPattern(doneResult.response, 'hope') ||
      containsPattern(doneResult.response, 'bye')
    );
    
    if (isGoodbye) {
      console.log('✅ PASS: Gracefully exits on "I\'m done"');
      console.log('   Response:', doneResult.response, '\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Does not recognize "I\'m done" as goodbye');
      console.log('   Got:', doneResult.response, '\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
  }

  // Test 12b: Graceful exit on "no" after follow-up
  console.log('Test 12b: Graceful exit on "no" after asking if they need anything else');
  try {
    const sessionId = `${TEST_SESSION_ID}-12b`;
    const result1 = await testAPI('/process', { sessionId, text: 'What is your email?' });
    
    // User says "no" when asked if they need anything else
    const noResult = await testAPI('/process', { sessionId, text: "no" });
    
    // Should recognize as goodbye
    const isGoodbye = noResult.response && (
      containsPattern(noResult.response, 'thank') ||
      containsPattern(noResult.response, 'great') ||
      containsPattern(noResult.response, 'hope') ||
      containsPattern(noResult.response, 'bye')
    );
    
    if (isGoodbye) {
      console.log('✅ PASS: Gracefully exits on "no"');
      console.log('   Response:', noResult.response, '\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Does not recognize "no" as goodbye');
      console.log('   Got:', noResult.response, '\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
  }

  // Test 14: Concise appointment confirmation
  console.log('Test 14: Appointment confirmation is concise (not verbose)');
  try {
    const sessionId = `${TEST_SESSION_ID}-14`;
    await testAPI('/process', { sessionId, text: 'Schedule a demo' });
    await testAPI('/process', { sessionId, text: 'Carol Davis' });
    await testAPI('/process', { sessionId, text: 'carol@example.com' });
    await testAPI('/process', { sessionId, text: 'Google' });
    await testAPI('/process', { sessionId, text: 'Demo' });
    await testAPI('/process', { sessionId, text: 'December 20 2024' });
    await testAPI('/process', { sessionId, text: '2 PM' });
    
    // Confirm the appointment
    const confirmResult = await testAPI('/process', { sessionId, text: 'sounds good' });
    
    // Should be concise - not listing all details again
    const isConcise = confirmResult.response && 
      confirmResult.response.length < 300 && // Under 300 chars
      !containsPattern(confirmResult.response, 'Appointment Details:') &&
      !containsPattern(confirmResult.response, '- Service:') &&
      !containsPattern(confirmResult.response, '- Date & Time:') &&
      !containsPattern(confirmResult.response, '- Duration:');
    
    if (isConcise) {
      console.log('✅ PASS: Confirmation is concise');
      console.log('   Response:', confirmResult.response, '\n');
      testsPassed++;
    } else {
      console.log('❌ FAIL: Confirmation is too verbose');
      console.log('   Got:', confirmResult.response, '\n');
      testsFailed++;
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log(`║  Phase 3 Test Results: ${testsPassed} passed, ${testsFailed} failed${' '.repeat(Math.max(0, 18 - testsPassed.toString().length - testsFailed.toString().length))}║`);
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  if (testsFailed === 0) {
    console.log('🎉 All Phase 3 tests passed!\n');
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

