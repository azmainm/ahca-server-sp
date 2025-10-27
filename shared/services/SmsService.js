const twilio = require('twilio');

class SmsService {
  constructor({ accountSid = process.env.TWILIO_ACCOUNT_SID, authToken = process.env.TWILIO_AUTH_TOKEN, fromNumber = process.env.TWILIO_FROM_NUMBER, messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID } = {}) {
    if (!accountSid || !authToken) {
      console.warn('⚠️ [SmsService] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
    }
    this.client = (accountSid && authToken) ? twilio(accountSid, authToken) : null;
    this.fromNumber = fromNumber || null;
    this.messagingServiceSid = messagingServiceSid || null;
  }

  isReady() {
    return !!this.client;
  }

  async sendMessage(to, body, fromOverride = null, messagingServiceSidOverride = null) {
    try {
      if (!this.isReady()) {
        return { success: false, error: 'SMS service not initialized' };
      }
      const messagingServiceSid = messagingServiceSidOverride || this.messagingServiceSid;
      const from = fromOverride || this.fromNumber;
      if (!to) {
        return { success: false, error: 'Missing SMS recipient' };
      }
      const params = messagingServiceSid
        ? { messagingServiceSid, to, body }
        : { from, to, body };
      if (!messagingServiceSid && !from) {
        return { success: false, error: 'Missing SMS sender (set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER)' };
      }
      const resp = await this.client.messages.create(params);
      return { success: true, sid: resp.sid };
    } catch (error) {
      console.error('❌ [SmsService] Failed to send SMS:', error);
      return { success: false, error: error.message };
    }
  }

  buildSummaryTextContent({ userName, companyName, summaryData, appointmentDetails }) {
    const lines = [];
    lines.push('NEW CUSTOMER INQUIRY');
    lines.push('');
    lines.push(`${userName} contacted ${companyName} and left an inquiry. Please reach out to them soon. Details below:`);
    lines.push('');
    lines.push('CONVERSATION OVERVIEW:');
    lines.push(summaryData.summary || '');
    lines.push('');
    lines.push('KEY POINTS DISCUSSED:');
    const keyPoints = (summaryData.keyPoints || []).map(point => `• ${point}`);
    lines.push(...keyPoints);

    if (summaryData.topics && summaryData.topics.length > 0) {
      lines.push('');
      lines.push(`TOPICS COVERED: ${summaryData.topics.join(', ')}`);
    }

    if (summaryData.customerNeeds) {
      lines.push('');
      lines.push(`YOUR NEEDS: ${summaryData.customerNeeds}`);
    }

    if (appointmentDetails) {
      lines.push('');
      lines.push('APPOINTMENT SCHEDULED:');
      const details = appointmentDetails.details || {};
      lines.push(`- Service: ${details.title || 'Consultation'}`);
      lines.push(`- Date: ${details.date || 'TBD'}`);
      lines.push(`- Time: ${details.timeDisplay || details.time || 'TBD'}`);
      lines.push(`- Duration: 30 minutes`);
      lines.push(`- Calendar: ${appointmentDetails.calendarType || 'Google Calendar'}`);
      if (appointmentDetails.calendarLink) {
        lines.push(`- Calendar Link: ${appointmentDetails.calendarLink}`);
      }
      lines.push('');
      lines.push('Our team will contact you to confirm the appointment details.');
    }

    if (summaryData.nextSteps) {
      lines.push('');
      lines.push('NEXT STEPS:');
      lines.push(summaryData.nextSteps);
    }

    lines.push('');
    lines.push('We appreciate your interest in our automation services!');
    lines.push('');
    lines.push('Best regards,');
    lines.push(companyName);

    return lines.join('\n');
  }

  async sendConversationSummary({ to, userInfo, conversationHistory, appointmentDetails = null, businessName = 'SherpaPrompt', emailService, fromNumber = null, messagingServiceSid = null }) {
    try {
      if (!emailService || typeof emailService.generateConversationSummary !== 'function') {
        return { success: false, error: 'EmailService unavailable for summary generation' };
      }
      const summaryData = await emailService.generateConversationSummary(conversationHistory, appointmentDetails);
      const userName = (userInfo && userInfo.name) ? userInfo.name : 'Valued Customer';
      const textContent = this.buildSummaryTextContent({ userName, companyName: businessName, summaryData, appointmentDetails });
      return await this.sendMessage(to, textContent, fromNumber, messagingServiceSid);
    } catch (error) {
      console.error('❌ [SmsService] Error sending summary SMS:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = { SmsService };


