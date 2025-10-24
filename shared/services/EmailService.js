/**
 * Email Service for sending conversation summaries via Mailchimp Transactional
 * Sends email summaries to users after voice agent sessions end
 */

const mailchimp = require('@mailchimp/mailchimp_transactional');
const fetch = require('node-fetch');
const { Resend } = require('resend');

class EmailService {
  constructor(emailConfig = null) {
    this.client = null;
    this.resend = null;
    this.initialized = false;
    this.resendInitialized = false;
    this.emailConfig = emailConfig;
    
    // Log configuration
    if (emailConfig) {
      console.log(`🏢 [EmailService] Configured for business with provider: ${emailConfig.provider}`);
      console.log(`   📧 From Email: ${emailConfig.fromEmail}`);
    } else {
      console.log('⚠️ [EmailService] No email config provided, will use environment variables');
    }
    
    this.init();
  }

  /**
   * Create a new EmailService instance for a specific business
   * @param {Object} emailConfig - Email configuration from business config
   * @returns {EmailService} New instance configured for the business
   */
  static createForBusiness(emailConfig) {
    if (!emailConfig) {
      throw new Error('Email configuration is required');
    }
    
    const requiredFields = ['provider', 'fromEmail', 'fromName'];
    for (const field of requiredFields) {
      if (!emailConfig[field]) {
        throw new Error(`Missing required email config field: ${field}`);
      }
    }
    
    if (emailConfig.provider === 'resend' && !emailConfig.apiKey) {
      throw new Error('Resend provider requires apiKey in email config');
    }
    
    if (emailConfig.provider === 'mailchimp' && !emailConfig.apiKey) {
      throw new Error('Mailchimp provider requires apiKey in email config');
    }
    
    return new EmailService(emailConfig);
  }

  /**
   * Initialize email clients (Resend and Mailchimp)
   */
  init() {
    if (this.emailConfig) {
      // Use business-specific configuration
      this.initWithBusinessConfig();
    } else {
      // Fallback to environment variables (backward compatibility)
      this.initWithEnvironmentVariables();
    }
  }

  /**
   * Initialize with business-specific configuration
   */
  initWithBusinessConfig() {
    const config = this.emailConfig;
    
    if (config.provider === 'resend') {
      try {
        this.resend = new Resend(config.apiKey);
        this.resendInitialized = true;
        console.log(`✅ [EmailService] Resend client initialized for business with API key: ${config.apiKey.substring(0, 8)}...`);
      } catch (error) {
        console.error('❌ [EmailService] Failed to initialize Resend client with business config:', error);
      }
    } else if (config.provider === 'mailchimp') {
      // Check if it's a Marketing API key (contains datacenter suffix like -us12)
      if (config.apiKey && config.apiKey.includes('-us')) {
        // Initialize for Marketing API
        this.mailchimpMarketingApiKey = config.apiKey;
        this.mailchimpServerPrefix = config.apiKey.split('-')[1]; // Extract server prefix
        this.mailchimpMarketingInitialized = true;
        console.log(`✅ [EmailService] Mailchimp Marketing API initialized for business with server: ${this.mailchimpServerPrefix}`);
      } else {
        // Try Transactional API
        try {
          this.client = mailchimp(config.apiKey);
          this.initialized = true;
          console.log(`✅ [EmailService] Mailchimp Transactional client initialized for business with API key: ${config.apiKey.substring(0, 8)}...`);
        } catch (error) {
          console.error('❌ [EmailService] Failed to initialize Mailchimp Transactional client with business config:', error);
        }
      }
    } else {
      console.warn(`⚠️ [EmailService] Unsupported email provider: ${config.provider}`);
    }
  }

  /**
   * Initialize with environment variables (backward compatibility)
   */
  initWithEnvironmentVariables() {
    // Initialize Resend (primary)
    try {
      if (process.env.RESEND_API_KEY) {
        this.resend = new Resend(process.env.RESEND_API_KEY);
        this.resendInitialized = true;
        console.log('✅ [EmailService] Resend client initialized successfully (legacy mode)');
      } else {
        console.warn('⚠️ [EmailService] RESEND_API_KEY not found in environment variables');
      }
    } catch (error) {
      console.error('❌ [EmailService] Failed to initialize Resend client:', error);
    }

    // Initialize Mailchimp (fallback)
    try {
      if (process.env.MAILCHIMP_API_KEY) {
        // Check if it's a Marketing API key (contains datacenter suffix like -us12)
        if (process.env.MAILCHIMP_API_KEY.includes('-us')) {
          // Initialize for Marketing API
          this.mailchimpMarketingApiKey = process.env.MAILCHIMP_API_KEY;
          this.mailchimpServerPrefix = process.env.MAILCHIMP_SERVER_PREFIX || process.env.MAILCHIMP_API_KEY.split('-')[1];
          this.mailchimpAudienceId = process.env.MAILCHIMP_AUDIENCE_ID;
          this.mailchimpMarketingInitialized = true;
          console.log('✅ [EmailService] Mailchimp Marketing API initialized successfully (legacy mode)');
        } else {
          // Try Transactional API
          this.client = mailchimp(process.env.MAILCHIMP_API_KEY);
          this.initialized = true;
          console.log('✅ [EmailService] Mailchimp Transactional client initialized successfully (legacy mode)');
        }
      } else {
        console.warn('⚠️ [EmailService] MAILCHIMP_API_KEY not found in environment variables');
      }
    } catch (error) {
      console.error('❌ [EmailService] Failed to initialize Mailchimp client:', error);
    }
  }

  /**
   * Check if email service is ready
   */
  isReady() {
    return this.mailchimpMarketingInitialized;
  }

  /**
   * Generate conversation summary using GPT
   * @param {Array} conversationHistory - Array of conversation messages
   * @param {Object} appointmentDetails - Appointment information (optional)
   * @returns {Promise<Object>} Object containing summary and key points
   */
  async generateConversationSummary(conversationHistory, appointmentDetails = null) {
    if (!conversationHistory || conversationHistory.length === 0) {
      return {
        summary: 'No conversation recorded.',
        keyPoints: ['Customer contacted SherpaPrompt but no conversation details were recorded.'],
        topics: ['General Inquiry']
      };
    }

    try {
      // Format conversation for GPT
      const conversationText = conversationHistory
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join('\n\n');

      const appointmentInfo = appointmentDetails ? `
APPOINTMENT SCHEDULED:
- Service: ${appointmentDetails.details?.title || 'Consultation'}
- Date: ${appointmentDetails.details?.date || 'TBD'}
- Time: ${appointmentDetails.details?.timeDisplay || appointmentDetails.details?.time || 'TBD'}
- Calendar: ${appointmentDetails.calendarType || 'Google Calendar'}
${appointmentDetails.calendarLink ? `- Calendar Link: ${appointmentDetails.calendarLink}` : ''}
` : '';

      const prompt = `You are analyzing a conversation between a customer and SherpaPrompt's AI assistant. Please provide a professional summary for an email that will be sent to the customer.

CONVERSATION:
${conversationText}
${appointmentInfo}

Please provide a JSON response with the following structure:
{
  "summary": "A brief 2-3 sentence overview of the conversation",
  "keyPoints": ["Bullet point 1", "Bullet point 2", "etc."],
  "topics": ["Topic 1", "Topic 2", "etc."],
  "customerNeeds": "What the customer was looking for",
  "nextSteps": "Any recommended next steps or follow-up actions"
}

Guidelines:
- Focus on what the customer asked about and what information was provided
- Include specific details about automation services, integrations, pricing, or scheduling discussed
- Keep bullet points concise but informative
- Identify main topics covered (e.g., "Pricing", "Materials", "Installation", "Scheduling")
- Be professional and customer-focused
- If an appointment was scheduled, mention it in the summary and next steps`;

      const response = await this.callOpenAI([
        { role: 'system', content: 'You are a helpful assistant that creates professional conversation summaries for customer service follow-up emails.' },
        { role: 'user', content: prompt }
      ]);

      // Parse GPT response
      let summaryData;
      try {
        summaryData = JSON.parse(response);
      } catch (parseError) {
        console.warn('⚠️ [EmailService] Failed to parse GPT summary response, using fallback');
        summaryData = {
          summary: 'Customer contacted SherpaPrompt for information about automation services.',
          keyPoints: [response.substring(0, 200) + '...'],
          topics: ['Automation Services'],
          customerNeeds: 'Information about automation services',
          nextSteps: 'Follow up with customer as needed'
        };
      }

      return summaryData;

    } catch (error) {
      console.error('❌ [EmailService] Error generating GPT summary:', error);
      
      // Fallback to basic summary
      return {
          summary: 'Customer contacted SherpaPrompt for information about automation services.',
          keyPoints: ['Customer inquired about automation services', 'Information was provided by our AI assistant'],
          topics: ['Automation Services'],
          customerNeeds: 'Information about automation services',
        nextSteps: 'Follow up with customer as needed'
      };
    }
  }

  /**
   * Call OpenAI API for generating summaries (using prompt-eval-server pattern)
   * @param {Array} messages - Array of messages for GPT
   * @returns {Promise<string>} GPT response
   */
  async callOpenAI(messages) {
    const model = 'gpt-5-nano';
    const useResponsesApi = /^gpt-5-/i.test(model);
    
    let url, requestBody;
    
    if (useResponsesApi) {
      // GPT-5 models use Responses API
      const combinedInput = messages
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n\n');

      url = 'https://api.openai.com/v1/responses';
      requestBody = {
        model,
        input: combinedInput,
        max_output_tokens: 1000,
        reasoning: { effort: 'minimal' }
      };
    } else {
      // Other models use Chat Completions API
      url = 'https://api.openai.com/v1/chat/completions';
      requestBody = {
        model,
        messages,
        max_tokens: 1000,
        temperature: 0.3
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY_CALL_AGENT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract text based on API type (copied from prompt-eval-server)
    let messageContent = null;
    
    if (!useResponsesApi) {
      // Chat Completions API response
      const choice = data?.choices?.[0];
      const message = choice?.message;
      const content = message?.content;
      if (typeof content === 'string' && content.trim().length > 0) {
        messageContent = content;
      }
    } else {
      // Responses API response (GPT-5)
      if (typeof data.output_text === 'string' && data.output_text.trim().length > 0) {
        messageContent = data.output_text;
      } else if (Array.isArray(data.output)) {
        const outputs = data.output.flatMap((o) => {
          if (o?.type === 'message' && Array.isArray(o?.content)) {
            return o.content
              .filter((part) => (typeof part?.text === 'string') && part.text.trim() && part?.type !== 'reasoning')
              .map((part) => part.text);
          }
          if (Array.isArray(o?.content)) {
            return o.content
              .filter((part) => (typeof part?.text === 'string') && part.text.trim() && part?.type !== 'reasoning')
              .map((part) => part.text);
          }
          return [];
        });
        if (outputs.length > 0) {
          messageContent = outputs.join('\n');
        }
      } else if (typeof data.text === 'string') {
        const t = data.text.trim();
        if (t && !/^rs_[a-z0-9]/i.test(t) && t.toLowerCase() !== 'reasoning') {
          messageContent = t;
        }
      }
    }
    
    return messageContent || "";
  }


  /**
   * Format appointment details for email
   * @param {Object} appointmentDetails - Appointment information
   * @returns {string} Formatted appointment details
   */
  formatAppointmentDetails(appointmentDetails) {
    if (!appointmentDetails || !appointmentDetails.details) {
      return null;
    }

    const details = appointmentDetails.details;
    const calendarType = appointmentDetails.calendarType || 'Google Calendar';
    const calendarLink = appointmentDetails.calendarLink;
    
    return `
<h3>📅 Appointment Scheduled</h3>
<ul>
  <li><strong>Service:</strong> ${details.title || 'Consultation'}</li>
  <li><strong>Date:</strong> ${details.date || 'TBD'}</li>
  <li><strong>Time:</strong> ${details.timeDisplay || details.time || 'TBD'}</li>
  <li><strong>Duration:</strong> 30 minutes</li>
  <li><strong>Calendar:</strong> ${calendarType}</li>
  ${calendarLink ? `<li><strong>Calendar Link:</strong> <a href="${calendarLink}" target="_blank">View in Calendar</a></li>` : ''}
</ul>
<p>Our team will contact you to confirm the appointment details and provide any additional information you may need.</p>
    `.trim();
  }

  /**
   * Send email via Resend
   * @param {Object} userInfo - User information
   * @param {string} htmlContent - HTML email content
   * @param {string} textContent - Plain text email content
   * @returns {Promise<Object>} Result of email sending
   */
  async sendViaResend(userInfo, htmlContent, textContent) {
    try {
      const userName = userInfo.name || 'Valued Customer';
      
      // Use business-specific email configuration if available
      const fromEmail = this.emailConfig ? 
        `${this.emailConfig.fromName} <${this.emailConfig.fromEmail}>` : 
        'SherpaPrompt <onboarding@resend.dev>';
      
      const replyToEmail = this.emailConfig ? 
        this.emailConfig.fromEmail : 
        'onboarding@resend.dev';
      
      const emailData = {
        from: fromEmail,
        to: [userInfo.email],
        subject: 'Your Conversation Summary',
        html: htmlContent,
        text: textContent,
        reply_to: replyToEmail
      };

      console.log('📧 [EmailService] Sending email via Resend...');
      const response = await this.resend.emails.send(emailData);

      if (response.data && response.data.id) {
        console.log('✅ [EmailService] Email sent successfully via Resend:', response.data.id);
        return { 
          success: true, 
          messageId: response.data.id, 
          status: 'sent',
          email: userInfo.email,
          provider: 'resend'
        };
      } else {
        console.error('❌ [EmailService] Unexpected response from Resend:', response);
        return { 
          success: false, 
          error: 'Unexpected response from Resend' 
        };
      }

    } catch (error) {
      console.error('❌ [EmailService] Error sending via Resend:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to send via Resend' 
      };
    }
  }

  /**
   * Send email via Mailchimp (fallback)
   * @param {Object} userInfo - User information
   * @param {string} htmlContent - HTML email content
   * @param {string} textContent - Plain text email content
   * @returns {Promise<Object>} Result of email sending
   */
  async sendViaMailchimp(userInfo, htmlContent, textContent) {
    try {
      const userName = userInfo.name || 'Valued Customer';

      // Use business-specific email configuration if available
      const fromEmail = this.emailConfig ? 
        this.emailConfig.fromEmail : 
        'noreply@sherpaprompt.com';
      
      const fromName = this.emailConfig ? 
        this.emailConfig.fromName : 
        'SherpaPrompt';
      
      const replyToEmail = this.emailConfig ? 
        this.emailConfig.fromEmail : 
        'info@sherpaprompt.com';

      const message = {
        html: htmlContent,
        text: textContent,
        subject: 'Your Conversation Summary',
        from_email: fromEmail,
        from_name: fromName,
        to: [
          {
            email: userInfo.email,
            name: userName,
            type: 'to'
          }
        ],
        headers: {
          'Reply-To': replyToEmail
        },
        important: false,
        track_opens: true,
        track_clicks: true,
        auto_text: true,
        auto_html: false,
        inline_css: true,
        url_strip_qs: false,
        preserve_recipients: false,
        view_content_link: false,
        tracking_domain: null,
        signing_domain: null,
        return_path_domain: null
      };

      console.log('📧 [EmailService] Sending email via Mailchimp Transactional...');
      const response = await this.client.messages.send({ message });

      if (response && response.length > 0) {
        const result = response[0];
        if (result.status === 'sent' || result.status === 'queued') {
          console.log('✅ [EmailService] Email sent successfully via Mailchimp:', result.status, result._id);
          return { 
            success: true, 
            messageId: result._id, 
            status: result.status,
            email: result.email,
            provider: 'mailchimp'
          };
        } else {
          console.error('❌ [EmailService] Email sending failed via Mailchimp:', result.status, result.reject_reason);
          return { 
            success: false, 
            error: `Email rejected: ${result.reject_reason || result.status}` 
          };
        }
      } else {
        console.error('❌ [EmailService] No response from Mailchimp');
        return { success: false, error: 'No response from email service' };
      }

    } catch (error) {
      console.error('❌ [EmailService] Error sending via Mailchimp:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to send via Mailchimp' 
      };
    }
  }

  /**
   * Send email via Mailchimp Marketing API (for lead notifications)
   * @param {Object} userInfo - User information
   * @param {string} htmlContent - HTML email content
   * @param {string} textContent - Plain text email content
   * @param {string} customSubject - Custom subject line (optional)
   * @returns {Promise<Object>} Result of email sending
   */
  async sendViaMailchimpMarketing(userInfo, htmlContent, textContent, customSubject = null) {
    try {
      if (!this.mailchimpMarketingInitialized) {
        return { success: false, error: 'Mailchimp Marketing API not initialized' };
      }

      const userName = userInfo.name || 'Valued Customer';
      
      // Use business-specific email configuration if available
      const fromEmail = this.emailConfig ? 
        this.emailConfig.fromEmail : 
        'noreply@sherpaprompt.com';
      
      const fromName = this.emailConfig ? 
        this.emailConfig.fromName : 
        'SherpaPrompt';

      const subject = customSubject || 'Your Conversation Summary';

      console.log('📧 [EmailService] Sending email via Mailchimp Marketing API...');
      
      // Step 1: First check if the email exists in the audience, if not add it
      const audienceId = this.mailchimpAudienceId || process.env.MAILCHIMP_AUDIENCE_ID;
      
      if (!audienceId) {
        return { success: false, error: 'Mailchimp audience ID not configured' };
      }

      // Check if member exists
      const memberHash = require('crypto').createHash('md5').update(userInfo.email.toLowerCase()).digest('hex');
      
      try {
        // Try to get the member
        const memberResponse = await fetch(`https://${this.mailchimpServerPrefix}.api.mailchimp.com/3.0/lists/${audienceId}/members/${memberHash}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.mailchimpMarketingApiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (!memberResponse.ok && memberResponse.status === 404) {
          // Member doesn't exist, add them
          console.log('📧 [EmailService] Adding new member to audience...');
          const addMemberResponse = await fetch(`https://${this.mailchimpServerPrefix}.api.mailchimp.com/3.0/lists/${audienceId}/members`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.mailchimpMarketingApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email_address: userInfo.email,
              status: 'subscribed',
              merge_fields: {
                FNAME: userName.split(' ')[0] || '',
                LNAME: userName.split(' ').slice(1).join(' ') || ''
              }
            })
          });

          if (!addMemberResponse.ok) {
            const error = await addMemberResponse.json();
            console.error('❌ [EmailService] Failed to add member:', error);
            return { success: false, error: `Failed to add member: ${error.detail}` };
          }
          console.log('✅ [EmailService] Member added to audience');
        }
      } catch (error) {
        console.error('❌ [EmailService] Error checking/adding member:', error);
        return { success: false, error: `Member management failed: ${error.message}` };
      }

      // Step 2: Create a campaign
      const campaignData = {
        type: 'regular',
        recipients: {
          list_id: audienceId,
          segment_opts: {
            match: 'any',
            conditions: [{
              condition_type: 'EmailAddress',
              field: 'EMAIL',
              op: 'is',
              value: userInfo.email
            }]
          }
        },
        settings: {
          subject_line: subject,
          from_name: fromName,
          reply_to: fromEmail,
          title: `Lead Notification - ${Date.now()}`
        }
      };

      console.log('📧 [EmailService] Creating campaign...');
      const campaignResponse = await fetch(`https://${this.mailchimpServerPrefix}.api.mailchimp.com/3.0/campaigns`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.mailchimpMarketingApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(campaignData)
      });

      if (!campaignResponse.ok) {
        const error = await campaignResponse.json();
        console.error('❌ [EmailService] Failed to create campaign:', error);
        return { success: false, error: `Campaign creation failed: ${error.detail}` };
      }

      const campaign = await campaignResponse.json();
      console.log('✅ [EmailService] Campaign created:', campaign.id);

      // Step 3: Set campaign content
      const contentData = {
        html: htmlContent,
        plain_text: textContent
      };

      const contentResponse = await fetch(`https://${this.mailchimpServerPrefix}.api.mailchimp.com/3.0/campaigns/${campaign.id}/content`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.mailchimpMarketingApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(contentData)
      });

      if (!contentResponse.ok) {
        const error = await contentResponse.json();
        console.error('❌ [EmailService] Failed to set campaign content:', error);
        return { success: false, error: `Content setting failed: ${error.detail}` };
      }

      console.log('✅ [EmailService] Campaign content set');

      // Step 4: Send the campaign
      const sendResponse = await fetch(`https://${this.mailchimpServerPrefix}.api.mailchimp.com/3.0/campaigns/${campaign.id}/actions/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.mailchimpMarketingApiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!sendResponse.ok) {
        const error = await sendResponse.json();
        console.error('❌ [EmailService] Failed to send campaign:', error);
        return { success: false, error: `Campaign sending failed: ${error.detail}` };
      }

      console.log('✅ [EmailService] Campaign sent successfully!');
      console.log('📧 [EmailService] Email sent to:', userInfo.email);
      console.log('📧 [EmailService] Subject:', subject);

      return {
        success: true,
        messageId: campaign.id,
        status: 'sent',
        email: userInfo.email,
        provider: 'mailchimp-marketing',
        campaignId: campaign.id,
        note: 'Email sent via Mailchimp Marketing API campaign'
      };

    } catch (error) {
      console.error('❌ [EmailService] Error sending via Mailchimp Marketing:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to send via Mailchimp Marketing' 
      };
    }
  }

  /**
   * Send conversation summary email to user
   * @param {Object} userInfo - User information (name, email)
   * @param {Array} conversationHistory - Conversation messages
   * @param {Object} appointmentDetails - Appointment information (optional)
   * @param {string} businessName - Business name for email template (optional)
   * @returns {Promise<Object>} Result of email sending
   */
  async sendConversationSummary(userInfo, conversationHistory, appointmentDetails = null, businessName = null) {
    if (!this.isReady()) {
      console.error('❌ [EmailService] Email service not initialized');
      return { success: false, error: 'Email service not available' };
    }

    if (!userInfo || !userInfo.email) {
      console.error('❌ [EmailService] No user email provided');
      return { success: false, error: 'No user email provided' };
    }

    try {
      console.log('📧 [EmailService] Preparing to send conversation summary to:', userInfo.email);

      // Generate intelligent conversation summary using GPT
      const summaryData = await this.generateConversationSummary(conversationHistory, appointmentDetails);
      
      // Format appointment details if available
      const appointmentHtml = appointmentDetails ? this.formatAppointmentDetails(appointmentDetails) : '';

      // Create email content
      const userName = userInfo.name || 'Valued Customer';
      const summaryBullets = summaryData.keyPoints.map(point => `<li>${point}</li>`).join('\n');
      const companyName = businessName || 'SherpaPrompt';
      const companyEmoji = businessName === 'Superior Fence & Construction' ? '🏗️' : '🤖';

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Your ${companyName} Conversation Summary</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2c5530; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }
        .appointment-section { background-color: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #2c5530; }
        .summary-section { margin: 20px 0; }
        ul { padding-left: 20px; }
        li { margin: 8px 0; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px; }
        .logo { font-size: 24px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">${companyEmoji} ${companyName}</div>
        <p>Your Conversation Summary</p>
    </div>
    
    <div class="content">
        <h2>Hello ${userName}!</h2>
        
        <p>Thank you for contacting ${companyName}. Here's a summary of our conversation:</p>
        
        <div class="summary-section">
            <h3>📋 Conversation Overview</h3>
            <p><strong>${summaryData.summary}</strong></p>
            
            <h4>Key Points Discussed:</h4>
            <ul>
                ${summaryBullets}
            </ul>
            
            ${summaryData.topics && summaryData.topics.length > 0 ? `
            <p><strong>Topics Covered:</strong> ${summaryData.topics.join(', ')}</p>
            ` : ''}
            
            ${summaryData.customerNeeds ? `
            <p><strong>Your Needs:</strong> ${summaryData.customerNeeds}</p>
            ` : ''}
        </div>
        
        ${appointmentHtml ? `<div class="appointment-section">${appointmentHtml}</div>` : ''}
        
        ${summaryData.nextSteps ? `
        <div class="summary-section">
            <h4>📝 Next Steps:</h4>
            <p>${summaryData.nextSteps}</p>
        </div>
        ` : ''}
        
        
    </div>
    
    <div class="footer">
        <p>This email was sent from ${companyName}'s AI Assistant.<br>
        If you have any concerns about this email, please contact us directly.</p>
    </div>
</body>
</html>
      `.trim();

      const textContent = `
Hello ${userName}!

Thank you for contacting ${companyName}. Here's a summary of our conversation:

CONVERSATION OVERVIEW:
${summaryData.summary}

KEY POINTS DISCUSSED:
${summaryData.keyPoints.map(point => `• ${point}`).join('\n')}

${summaryData.topics && summaryData.topics.length > 0 ? `
TOPICS COVERED: ${summaryData.topics.join(', ')}
` : ''}

${summaryData.customerNeeds ? `
YOUR NEEDS: ${summaryData.customerNeeds}
` : ''}

${appointmentDetails ? `
APPOINTMENT SCHEDULED:
- Service: ${appointmentDetails.details?.title || 'Consultation'}
- Date: ${appointmentDetails.details?.date || 'TBD'}
- Time: ${appointmentDetails.details?.timeDisplay || appointmentDetails.details?.time || 'TBD'}
- Duration: 30 minutes
- Calendar: ${appointmentDetails.calendarType || 'Google Calendar'}
${appointmentDetails.calendarLink ? `- Calendar Link: ${appointmentDetails.calendarLink}` : ''}

Our team will contact you to confirm the appointment details.
` : ''}

${summaryData.nextSteps ? `
NEXT STEPS:
${summaryData.nextSteps}
` : ''}



We appreciate your interest in our automation services!

Best regards,
${companyName}
      `.trim();

      // Use Mailchimp Marketing API as the only email provider
      if (this.mailchimpMarketingInitialized) {
        console.log('📧 [EmailService] Using Mailchimp Marketing API');
        return await this.sendViaMailchimpMarketing(userInfo, htmlContent, textContent);
      }

      // Note: Resend is disabled - keeping code for future use but not using it
      // if (this.resendInitialized) {
      //   console.log('📧 [EmailService] Using Resend (disabled)');
      //   return await this.sendViaResend(userInfo, htmlContent, textContent);
      // }

      // No email providers available
      console.error('❌ [EmailService] No email providers available');
      return { success: false, error: 'No email providers available' };

    } catch (error) {
      console.error('❌ [EmailService] Error sending email:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to send email' 
      };
    }
  }

  /**
   * Test email service connectivity
   * @returns {Promise<Object>} Test result
   */
  async testConnection() {
    if (!this.isReady()) {
      return { success: false, error: 'Email service not initialized' };
    }

    const results = {
      resend: { available: false, working: false },
      mailchimp: { available: false, working: false },
      mailchimpMarketing: { available: false, working: false }
    };

    // Test Resend
    if (this.resendInitialized) {
      results.resend.available = true;
      try {
        // Resend doesn't have a ping endpoint, so we'll just check if it's initialized
        console.log('✅ [EmailService] Resend client is ready');
        results.resend.working = true;
      } catch (error) {
        console.error('❌ [EmailService] Resend test failed:', error);
        results.resend.error = error.message;
      }
    }

    // Test Mailchimp Transactional
    if (this.initialized && this.client) {
      results.mailchimp.available = true;
      try {
        const response = await this.client.users.ping();
        console.log('✅ [EmailService] Mailchimp Transactional connection test successful');
        results.mailchimp.working = true;
        results.mailchimp.ping = response.PING || 'PONG';
      } catch (error) {
        console.error('❌ [EmailService] Mailchimp Transactional connection test failed:', error);
        results.mailchimp.error = error.message;
      }
    }

    // Test Mailchimp Marketing API
    if (this.mailchimpMarketingInitialized) {
      results.mailchimpMarketing.available = true;
      try {
        const response = await fetch(`https://${this.mailchimpServerPrefix}.api.mailchimp.com/3.0/ping`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.mailchimpMarketingApiKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ [EmailService] Mailchimp Marketing API connection test successful');
          results.mailchimpMarketing.working = true;
          results.mailchimpMarketing.ping = data.health_status || 'PONG';
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.error('❌ [EmailService] Mailchimp Marketing API connection test failed:', error);
        results.mailchimpMarketing.error = error.message;
      }
    }

    const hasWorkingProvider = results.mailchimpMarketing.working;
    const primaryProvider = results.mailchimpMarketing.working ? 'Mailchimp Marketing' : 'None';

    return { 
      success: hasWorkingProvider, 
      primaryProvider,
      providers: results,
      message: hasWorkingProvider ? `Email service ready (using ${primaryProvider})` : 'No working email providers'
    };
  }
}

module.exports = { EmailService };
