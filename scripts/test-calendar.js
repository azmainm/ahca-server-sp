const { google } = require('googleapis');
require('dotenv').config();

async function testCalendarAccess() {
  try {
    // Initialize auth
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        project_id: process.env.GOOGLE_PROJECT_ID,
      },
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    // Create calendar instance
    const calendar = google.calendar({ version: 'v3', auth });

    // Test: List events
    const events = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: new Date().toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });

    console.log('Calendar access successful!');
    console.log('Upcoming events:', events.data.items?.length || 0);

  } catch (error) {
    console.error('Calendar access failed:', error.message);
  }
}

testCalendarAccess();