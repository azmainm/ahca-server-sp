/**
 * Test Superior Fencing - Mailchimp Only Configuration
 * Verifies that Superior Fencing uses ONLY Mailchimp (no Resend)
 */

require('dotenv').config();
const { EmailService } = require('./shared/services/EmailService');

async function testSuperiorFencingMailchimpOnly() {
  console.log('🏢 [Test] Testing Superior Fencing - Mailchimp Only Configuration...');
  console.log('=' .repeat(70));
  
  try {
    // Create Superior Fencing email configuration (exactly as in production)
    const superiorFencingEmailConfig = {
      provider: 'mailchimp',
      apiKey: process.env.MAILCHIMP_API_KEY,
      fromEmail: 'doug@sherpaprompt.com',
      fromName: 'Superior Fence & Construction'
    };

    console.log('🏢 [Test] Creating Superior Fencing EmailService...');
    const emailService = EmailService.createForBusiness(superiorFencingEmailConfig);

    // Test connection to verify only Mailchimp is initialized
    console.log('🔍 [Test] Testing connection...');
    const connectionTest = await emailService.testConnection();
    
    console.log('📊 [Test] Connection Results:');
    console.log('   Overall Success:', connectionTest.success);
    console.log('   Primary Provider:', connectionTest.primaryProvider);
    console.log('   Resend Available:', connectionTest.providers.resend.available);
    console.log('   Resend Working:', connectionTest.providers.resend.working);
    console.log('   Mailchimp Transactional Available:', connectionTest.providers.mailchimp.available);
    console.log('   Mailchimp Transactional Working:', connectionTest.providers.mailchimp.working);
    console.log('   Mailchimp Marketing Available:', connectionTest.providers.mailchimpMarketing.available);
    console.log('   Mailchimp Marketing Working:', connectionTest.providers.mailchimpMarketing.working);

    // Verify that Mailchimp Marketing is the primary provider
    if (connectionTest.primaryProvider !== 'Mailchimp Marketing') {
      console.log('❌ [Test] FAILED: Expected Mailchimp Marketing as primary provider');
      return false;
    }

    // Verify that Resend is NOT being used
    if (connectionTest.providers.resend.available || connectionTest.providers.resend.working) {
      console.log('❌ [Test] FAILED: Resend should not be available for Superior Fencing');
      return false;
    }

    console.log('\n✅ [Test] Configuration verified: Superior Fencing uses ONLY Mailchimp Marketing');

    // Test sending an email to confirm it uses Mailchimp Marketing API
    const testUserInfo = {
      name: 'Configuration Test',
      email: 'azmainmorshed03@gmail.com'
    };

    const testSubject = '✅ Superior Fencing - Mailchimp Only Test';
    const testContent = `Configuration Test: Superior Fencing Email System

This email confirms that Superior Fencing is configured to use ONLY Mailchimp Marketing API.

✅ No Resend integration
✅ Direct Mailchimp Marketing API usage
✅ Business-specific configuration working

Test completed at: ${new Date().toLocaleString()}
Session: mailchimp-only-test-${Date.now()}`;

    const testHtml = `<html><body>
      <h2 style="color: #2c5530;">✅ Superior Fencing - Mailchimp Only Test</h2>
      <div style="background: #f0f8ff; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <h3>Configuration Test: Superior Fencing Email System</h3>
        <p>This email confirms that Superior Fencing is configured to use <strong>ONLY Mailchimp Marketing API</strong>.</p>
        <ul>
          <li>✅ No Resend integration</li>
          <li>✅ Direct Mailchimp Marketing API usage</li>
          <li>✅ Business-specific configuration working</li>
        </ul>
        <p><strong>Test completed at:</strong> ${new Date().toLocaleString()}</p>
        <p><strong>Session:</strong> mailchimp-only-test-${Date.now()}</p>
      </div>
    </body></html>`;

    console.log('\n📤 [Test] Sending test email to verify Mailchimp Marketing usage...');
    
    const emailResult = await emailService.sendViaMailchimpMarketing(
      testUserInfo,
      testHtml,
      testContent,
      testSubject
    );

    console.log('\n📊 [Test] Email Result:');
    console.log('   Success:', emailResult.success);
    console.log('   Provider:', emailResult.provider);
    console.log('   Status:', emailResult.status);
    console.log('   Campaign ID:', emailResult.campaignId);

    if (emailResult.success && emailResult.provider === 'mailchimp-marketing') {
      console.log('\n🎉 [SUCCESS] Superior Fencing is configured correctly!');
      console.log('✅ [Verified] Uses ONLY Mailchimp Marketing API');
      console.log('✅ [Verified] No Resend dependencies');
      console.log('✅ [Verified] Email sending works perfectly');
      console.log('📧 [Note] Check azmainmorshed03@gmail.com for confirmation email');
      return true;
    } else {
      console.log('\n❌ [FAILED] Email test failed or wrong provider used');
      return false;
    }

  } catch (error) {
    console.error('❌ [Test] Test crashed:', error.message);
    return false;
  }
}

async function runMailchimpOnlyTest() {
  console.log('🚀 [Test] Superior Fencing - Mailchimp Only Verification');
  console.log('=' .repeat(80));
  console.log('🎯 [Goal] Verify Superior Fencing uses ONLY Mailchimp (no Resend)');
  console.log('=' .repeat(80));
  
  const success = await testSuperiorFencingMailchimpOnly();
  
  console.log('\n' + '=' .repeat(80));
  console.log('🏁 [Final Result]:', success ? '✅ MAILCHIMP ONLY VERIFIED' : '❌ CONFIGURATION ISSUE');
  
  if (success) {
    console.log('\n🎊 [Superior Fencing] Configuration is perfect!');
    console.log('📧 [Email System] 100% Mailchimp Marketing API');
    console.log('🚫 [Resend] Completely removed from Superior Fencing');
    console.log('✅ [Production Ready] System ready for live calls');
  } else {
    console.log('\n🔧 [Issue] Configuration needs attention');
  }
}

runMailchimpOnlyTest().catch(console.error);
