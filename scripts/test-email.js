/**
 * Test script to send a dummy email using the EmailService
 * This will help us test the email functionality independently
 */

require('dotenv').config();
const { EmailService } = require('../shared/services/EmailService');

async function testEmail() {
  console.log('🧪 Starting email test...');
  
  // Initialize email service
  const emailService = new EmailService();
  
  // Check if service is ready
  if (!emailService.isReady()) {
    console.error('❌ Email service is not ready. Check your MAILCHIMP_API_KEY in .env file');
    return;
  }
  
  console.log('✅ Email service initialized');
  
  // Test connection first
  console.log('🔍 Testing Mailchimp connection...');
  const connectionTest = await emailService.testConnection();
  console.log('Connection test result:', connectionTest);
  
  if (!connectionTest.success) {
    console.error('❌ Connection test failed:', connectionTest.error);
    console.log('💡 This might be because:');
    console.log('   1. The API key is invalid or expired');
    console.log('   2. The Mailchimp account is not set up for transactional emails');
    console.log('   3. You need to use Mailchimp Transactional (Mandrill) instead of regular Mailchimp');
    return;
  }
  
  // Create test data
  const testUserInfo = {
    name: 'Azmain Morshed',
    email: 'azmainmorshed03@gmail.com',
    collected: true
  };
  
  const testConversationHistory = [
    {
      role: 'assistant',
      content: 'Hi! Welcome to SherpaPrompt Fencing Company. I\'m here to help with your fencing needs. Please tell me your name and email address.',
      timestamp: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes ago
    },
    {
      role: 'user',
      content: 'Hi, my name is Azmain Morshed and my email is azmainmorshed03@gmail.com. I need information about fence installation.',
      timestamp: new Date(Date.now() - 9 * 60 * 1000)
    },
    {
      role: 'assistant',
      content: 'Thanks Azmain! I\'ve got your email as azmainmorshed03@gmail.com. How can I help you today? I\'d be happy to help you with fence installation information. We offer various materials including wood, vinyl, and chain link fencing.',
      timestamp: new Date(Date.now() - 8 * 60 * 1000)
    },
    {
      role: 'user',
      content: 'What are your prices for wood fencing? I need about 100 linear feet for my backyard.',
      timestamp: new Date(Date.now() - 7 * 60 * 1000)
    },
    {
      role: 'assistant',
      content: 'Our wood fencing prices vary based on the type of wood and height. For a standard 6-foot privacy fence, prices typically range from $25-40 per linear foot including installation. For 100 linear feet, you\'re looking at approximately $2,500-$4,000 total. We offer cedar, pine, and composite wood options.',
      timestamp: new Date(Date.now() - 6 * 60 * 1000)
    },
    {
      role: 'user',
      content: 'That sounds reasonable. Can I schedule an appointment to get an exact quote?',
      timestamp: new Date(Date.now() - 5 * 60 * 1000)
    },
    {
      role: 'assistant',
      content: 'Absolutely! I can help you schedule an appointment. What date works best for you?',
      timestamp: new Date(Date.now() - 4 * 60 * 1000)
    },
    {
      role: 'user',
      content: 'How about December 15th in the afternoon?',
      timestamp: new Date(Date.now() - 3 * 60 * 1000)
    },
    {
      role: 'assistant',
      content: 'Perfect! December 15th has available slots at: 2:00 PM, 2:30 PM, 3:00 PM. Which time works best for you?',
      timestamp: new Date(Date.now() - 2 * 60 * 1000)
    },
    {
      role: 'user',
      content: '2:00 PM works great for me.',
      timestamp: new Date(Date.now() - 1 * 60 * 1000)
    },
    {
      role: 'assistant',
      content: 'Excellent! Your appointment has been scheduled successfully. Appointment Details: Service: Fence Installation Quote, Date & Time: December 15th at 2:00 PM, Duration: 30 minutes, Customer: Azmain Morshed (azmainmorshed03@gmail.com). Our team will contact you to confirm the appointment details.',
      timestamp: new Date()
    }
  ];
  
  const testAppointmentDetails = {
    details: {
      title: 'Fence Installation Quote',
      date: '2024-12-15',
      time: '14:00',
      timeDisplay: '2:00 PM'
    },
    calendarType: 'Google Calendar',
    calendarLink: 'https://calendar.google.com/calendar/event?eid=test123'
  };
  
  console.log('📧 Sending test email...');
  console.log('📧 Recipient:', testUserInfo.email);
  console.log('📧 Conversation messages:', testConversationHistory.length);
  console.log('📧 Has appointment:', !!testAppointmentDetails);
  
  try {
    const emailResult = await emailService.sendConversationSummary(
      testUserInfo,
      testConversationHistory,
      testAppointmentDetails
    );
    
    if (emailResult.success) {
      console.log('✅ Test email sent successfully!');
      console.log('📧 Message ID:', emailResult.messageId);
      console.log('📧 Status:', emailResult.status);
      console.log('📧 Email:', emailResult.email);
    } else {
      console.error('❌ Failed to send test email:', emailResult.error);
    }
    
  } catch (error) {
    console.error('❌ Error sending test email:', error);
  }
}

// Run the test
testEmail().then(() => {
  console.log('🏁 Test completed');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Test failed:', error);
  process.exit(1);
});
