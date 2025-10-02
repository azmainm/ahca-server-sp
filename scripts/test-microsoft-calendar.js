const { MicrosoftCalendarService } = require('../shared/services/MicrosoftCalendarService');
require('dotenv').config();

/**
 * Comprehensive test script for Microsoft Calendar integration
 * Tests authentication, availability checking, and appointment creation
 */

async function testMicrosoftCalendarIntegration() {
  console.log('🔍 Starting Microsoft Calendar Integration Test');
  console.log('=' .repeat(50));

  // Check environment variables
  console.log('\n📋 Checking Environment Variables:');
  const requiredEnvVars = [
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET', 
    'AZURE_TENANT_ID',
    'SHARED_MAILBOX_EMAIL'
  ];

  const missingVars = [];
  requiredEnvVars.forEach(varName => {
    const value = process.env[varName];
    if (!value) {
      missingVars.push(varName);
      console.log(`❌ ${varName}: NOT SET`);
    } else {
      // Show partial value for security
      const displayValue = varName.includes('SECRET') ? 
        `${value.substring(0, 8)}...` : 
        value;
      console.log(`✅ ${varName}: ${displayValue}`);
    }
  });

  if (missingVars.length > 0) {
    console.log(`\n❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.log('Please set these in your .env file or environment');
    return;
  }

  // Initialize Microsoft Calendar Service
  console.log('\n🔧 Initializing Microsoft Calendar Service...');
  const microsoftCalendarService = new MicrosoftCalendarService();

  try {
    // Test 1: Service Initialization
    console.log('\n📝 Test 1: Service Initialization');
    await microsoftCalendarService.initialize();
    console.log('✅ Service initialized successfully');

    // Test 2: Token Acquisition
    console.log('\n📝 Test 2: Access Token Acquisition');
    const startTime = Date.now();
    const accessToken = await microsoftCalendarService.getAccessToken();
    const tokenTime = Date.now() - startTime;
    console.log(`✅ Access token acquired successfully in ${tokenTime}ms`);
    console.log(`🔑 Token length: ${accessToken.length} characters`);

    // Test 3: Availability Check
    console.log('\n📝 Test 3: Availability Check');
    const testDate = new Date();
    testDate.setDate(testDate.getDate() + 1); // Tomorrow
    const dateString = testDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    console.log(`📅 Checking availability for ${dateString} at 2:00 PM - 2:30 PM`);
    const availabilityStart = Date.now();
    const availability = await microsoftCalendarService.checkAvailability(dateString, '14:00', '14:30');
    const availabilityTime = Date.now() - availabilityStart;
    
    console.log(`⏱️  Availability check completed in ${availabilityTime}ms`);
    console.log(`📊 Result:`, {
      success: availability.success,
      isAvailable: availability.isAvailable,
      existingEvents: availability.existingEvents,
      error: availability.error
    });

    // Test 4: Find Available Slots
    console.log('\n📝 Test 4: Find Available Slots');
    const slotsStart = Date.now();
    const slotsResult = await microsoftCalendarService.findAvailableSlots(dateString);
    const slotsTime = Date.now() - slotsStart;
    
    console.log(`⏱️  Slot search completed in ${slotsTime}ms`);
    console.log(`📊 Result:`, {
      success: slotsResult.success,
      availableSlots: slotsResult.availableSlots?.length || 0,
      totalSlots: slotsResult.totalSlots,
      error: slotsResult.error
    });

    if (slotsResult.success && slotsResult.availableSlots?.length > 0) {
      console.log('🕐 Available slots:');
      slotsResult.availableSlots.forEach((slot, index) => {
        console.log(`   ${index + 1}. ${slot.display} (${slot.start} - ${slot.end})`);
      });
    }

    // Test 5: Create Test Appointment (if slots available)
    if (slotsResult.success && slotsResult.availableSlots?.length > 0) {
      console.log('\n📝 Test 5: Create Test Appointment');
      
      const firstSlot = slotsResult.availableSlots[0];
      const appointmentDetails = {
        title: 'TEST APPOINTMENT - Microsoft Calendar Integration Test',
        description: 'This is a test appointment created by the Microsoft Calendar integration test script. Please ignore or delete this appointment.',
        date: dateString,
        time: firstSlot.start,
        duration: 30
      };

      const customerEmail = 'test@example.com';
      const customerName = 'Test Customer';

      console.log(`📅 Creating test appointment:`, {
        title: appointmentDetails.title,
        date: appointmentDetails.date,
        time: appointmentDetails.time,
        customer: `${customerName} (${customerEmail})`
      });

      const createStart = Date.now();
      const createResult = await microsoftCalendarService.createAppointment(
        appointmentDetails,
        customerEmail,
        customerName
      );
      const createTime = Date.now() - createStart;

      console.log(`⏱️  Appointment creation completed in ${createTime}ms`);
      console.log(`📊 Result:`, {
        success: createResult.success,
        eventId: createResult.eventId,
        eventLink: createResult.eventLink,
        error: createResult.error
      });

      if (createResult.success) {
        console.log('✅ Test appointment created successfully!');
        console.log(`🔗 Event Link: ${createResult.eventLink}`);
        console.log('⚠️  Remember to delete this test appointment from your calendar');
      } else {
        console.log('❌ Failed to create test appointment');
        console.log('🔍 Error details:', createResult.details);
      }
    } else {
      console.log('\n⚠️  Skipping appointment creation test - no available slots found');
    }

    // Test 6: Performance Summary
    console.log('\n📊 Performance Summary:');
    console.log(`🔑 Token acquisition: ${tokenTime}ms`);
    console.log(`📅 Availability check: ${availabilityTime}ms`);
    console.log(`🕐 Slot search: ${slotsTime}ms`);
    if (typeof createTime !== 'undefined') {
      console.log(`📝 Appointment creation: ${createTime}ms`);
    }

    console.log('\n✅ Microsoft Calendar Integration Test Completed Successfully!');

  } catch (error) {
    console.log('\n❌ Test Failed with Error:');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    // Additional debugging information
    if (error.response) {
      console.log('\n🔍 HTTP Response Details:');
      console.log('Status:', error.response.status);
      console.log('Status Text:', error.response.statusText);
      console.log('Headers:', error.response.headers);
      console.log('Data:', error.response.data);
    }

    if (error.errorCode) {
      console.log('\n🔍 MSAL Error Details:');
      console.log('Error Code:', error.errorCode);
      console.log('Error Message:', error.errorMessage);
      console.log('Correlation ID:', error.correlationId);
    }
  }
}

// Additional diagnostic function
async function runDiagnostics() {
  console.log('\n🔧 Running Additional Diagnostics...');
  
  // Test network connectivity
  console.log('\n📡 Testing Network Connectivity:');
  
  try {
    const axios = require('axios');
    
    // Test Microsoft Graph endpoint
    console.log('Testing Microsoft Graph API endpoint...');
    const graphResponse = await axios.get('https://graph.microsoft.com/v1.0/', {
      timeout: 10000
    });
    console.log('✅ Microsoft Graph API is reachable');
  } catch (error) {
    console.log('❌ Microsoft Graph API connectivity issue:', error.message);
  }

  try {
    // Test Azure AD endpoint
    console.log('Testing Azure AD endpoint...');
    const tenantId = process.env.AZURE_TENANT_ID;
    if (tenantId) {
      const aadResponse = await axios.get(`https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid_configuration`, {
        timeout: 10000
      });
      console.log('✅ Azure AD endpoint is reachable');
    } else {
      console.log('⚠️  Cannot test Azure AD endpoint - AZURE_TENANT_ID not set');
    }
  } catch (error) {
    console.log('❌ Azure AD endpoint connectivity issue:', error.message);
  }
}

// Main execution
async function main() {
  try {
    await testMicrosoftCalendarIntegration();
    await runDiagnostics();
  } catch (error) {
    console.error('\n💥 Unexpected error during testing:', error);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  main();
}

module.exports = { testMicrosoftCalendarIntegration, runDiagnostics };
