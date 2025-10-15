/**
 * Comprehensive Flow Test
 * Tests all critical paths end-to-end
 */

const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3001/api/chained-voice';
const TEST_SESSION_ID = 'comprehensive-test-' + Date.now();

let testsPassed = 0;
let testsFailed = 0;
const failedTests = [];

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

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║           Comprehensive Flow Test Suite               ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Test 1: Complete appointment flow with name/email during appointment
  console.log('Test 1: Complete appointment flow (name/email during appointment)');
  try {
    const sessionId = `${TEST_SESSION_ID}-1`;
    
    // Start appointment
    const r1 = await testAPI('/process', { sessionId, text: 'I want to schedule a demo' });
    console.log('  Step 1 - Request demo:', r1.response.substring(0, 80) + '...');
    
    // Provide name
    const r2 = await testAPI('/process', { sessionId, text: 'My name is John Smith' });
    console.log('  Step 2 - Provide name:', r2.response.substring(0, 80) + '...');
    
    // Should ask for email, not treat it as name change
    const shouldAskEmail = r2.response.toLowerCase().includes('email');
    
    if (!shouldAskEmail) {
      throw new Error('Should ask for email after name, got: ' + r2.response);
    }
    
    // Provide email
    const r3 = await testAPI('/process', { sessionId, text: 'johnsmith@gmail.com' });
    console.log('  Step 3 - Provide email:', r3.response.substring(0, 80) + '...');
    
    // Should ask for calendar
    const shouldAskCalendar = r3.response.toLowerCase().includes('calendar') || 
                             r3.response.toLowerCase().includes('google') ||
                             r3.response.toLowerCase().includes('microsoft');
    
    if (!shouldAskCalendar) {
      throw new Error('Should ask for calendar, got: ' + r3.response);
    }
    
    console.log('✅ PASS: Appointment flow handles name/email correctly\n');
    testsPassed++;
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
    failedTests.push('Test 1: Appointment flow');
  }

  // Test 2: Email with missing @ symbol
  console.log('Test 2: Email normalization (missing @ symbol)');
  try {
    const sessionId = `${TEST_SESSION_ID}-2`;
    
    await testAPI('/process', { sessionId, text: 'Schedule a demo' });
    await testAPI('/process', { sessionId, text: 'Alice Johnson' });
    
    // Email without @ symbol
    const result = await testAPI('/process', { sessionId, text: 'aliceatgmail.com' });
    console.log('  Response:', result.response.substring(0, 100) + '...');
    
    // Should normalize to alice@gmail.com and proceed to calendar
    const normalized = result.response.includes('alice') || 
                      result.response.toLowerCase().includes('calendar') ||
                      result.response.toLowerCase().includes('google');
    
    if (normalized) {
      console.log('✅ PASS: Email normalized correctly\n');
      testsPassed++;
    } else {
      throw new Error('Email not normalized properly');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
    failedTests.push('Test 2: Email normalization');
  }

  // Test 3: Goodbye detection
  console.log('Test 3: Goodbye detection (various phrases)');
  try {
    const goodbyePhrases = ["I'm done", "no", "that's it", "all good"];
    let allPassed = true;
    
    for (const phrase of goodbyePhrases) {
      const sessionId = `${TEST_SESSION_ID}-3-${phrase.replace(/\s+/g, '-')}`;
      await testAPI('/process', { sessionId, text: 'What do you offer?' });
      const result = await testAPI('/process', { sessionId, text: phrase });
      
      const isGoodbye = result.response.toLowerCase().includes('thank') ||
                       result.response.toLowerCase().includes('hope') ||
                       result.response.toLowerCase().includes('great');
      
      if (!isGoodbye) {
        allPassed = false;
        console.log(`  ❌ "${phrase}" not recognized as goodbye`);
      } else {
        console.log(`  ✅ "${phrase}" recognized correctly`);
      }
    }
    
    if (allPassed) {
      console.log('✅ PASS: All goodbye phrases recognized\n');
      testsPassed++;
    } else {
      throw new Error('Some goodbye phrases not recognized');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
    failedTests.push('Test 3: Goodbye detection');
  }

  // Test 4: Concise responses (no verbose fillers)
  console.log('Test 4: Concise responses (no verbose fillers)');
  try {
    const sessionId = `${TEST_SESSION_ID}-4`;
    const result = await testAPI('/process', { sessionId, text: 'Tell me about pricing' });
    
    console.log('  Response length:', result.response.length, 'chars');
    console.log('  Response:', result.response.substring(0, 100) + '...');
    
    // Should not have verbose fillers
    const hasVerboseFillers = result.response.includes('Please wait while I process') ||
                             result.response.includes('Processing your appointment details');
    
    if (!hasVerboseFillers) {
      console.log('✅ PASS: No verbose fillers\n');
      testsPassed++;
    } else {
      throw new Error('Response contains verbose fillers');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
    failedTests.push('Test 4: Concise responses');
  }

  // Test 5: Initial greeting without blocking for name/email
  console.log('Test 5: Can ask questions without providing name/email first');
  try {
    const sessionId = `${TEST_SESSION_ID}-5`;
    
    // Ask question without providing name/email
    const result = await testAPI('/process', { sessionId, text: 'What services do you offer?' });
    
    console.log('  Response:', result.response.substring(0, 100) + '...');
    
    // Should answer the question, not demand name/email
    const answersQuestion = result.response.toLowerCase().includes('service') ||
                           result.response.toLowerCase().includes('product') ||
                           result.response.toLowerCase().includes('sherpaprompt');
    
    const demandsInfo = result.response.toLowerCase().includes('need your name') ||
                       result.response.toLowerCase().includes('please provide your name');
    
    if (answersQuestion && !demandsInfo) {
      console.log('✅ PASS: Answers question without demanding name/email\n');
      testsPassed++;
    } else {
      throw new Error('Blocks conversation without name/email');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
    failedTests.push('Test 5: No blocking');
  }

  // Test 6: Date parsing with abbreviations
  console.log('Test 6: Date parsing with month abbreviations');
  try {
    const sessionId = `${TEST_SESSION_ID}-6`;
    
    await testAPI('/process', { sessionId, text: 'Schedule demo' });
    await testAPI('/process', { sessionId, text: 'Bob Wilson' });
    await testAPI('/process', { sessionId, text: 'bob@test.com' });
    await testAPI('/process', { sessionId, text: 'Google' });
    await testAPI('/process', { sessionId, text: 'Product demo' });
    
    // Use abbreviated month
    const result = await testAPI('/process', { sessionId, text: 'Oct 25 2025' });
    
    console.log('  Response:', result.response.substring(0, 100) + '...');
    
    // Should parse correctly and show slots or ask for time
    const parsedCorrectly = result.response.toLowerCase().includes('october') ||
                           result.response.toLowerCase().includes('oct') ||
                           result.response.toLowerCase().includes('slot') ||
                           result.response.toLowerCase().includes('time');
    
    if (parsedCorrectly) {
      console.log('✅ PASS: Abbreviated month parsed correctly\n');
      testsPassed++;
    } else {
      throw new Error('Failed to parse abbreviated month');
    }
  } catch (error) {
    console.log('❌ FAIL:', error.message, '\n');
    testsFailed++;
    failedTests.push('Test 6: Date parsing');
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log(`║  Test Results: ${testsPassed} passed, ${testsFailed} failed${' '.repeat(Math.max(0, 26 - testsPassed.toString().length - testsFailed.toString().length))}║`);
  console.log('╚════════════════════════════════════════════════════════╝\n');
  
  if (testsFailed > 0) {
    console.log('❌ Failed tests:');
    failedTests.forEach(test => console.log(`   - ${test}`));
    console.log('');
    process.exit(1);
  } else {
    console.log('🎉 All tests passed!\n');
  }
}

// Run tests
runTests().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});

