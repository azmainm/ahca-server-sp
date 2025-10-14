# Google Calendar API Setup Guide

This guide will walk you through setting up Google Calendar API integration for the AHCA project's appointment scheduling functionality.

## Prerequisites

- Google account with Google Cloud Console access
- Basic understanding of OAuth 2.0 authentication
- Node.js project setup (already completed)

## Step 1: Create a Google Cloud Project

### 1.1 Access Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Click on the project dropdown at the top of the page

### 1.2 Create New Project
1. Click "New Project"
2. Enter project details:
   - **Project name**: `AHCA-Calendar-Integration`
   - **Organization**: Your organization (if applicable)
3. Click "Create"
4. Wait for the project to be created and select it

## Step 2: Enable Google Calendar API

### 2.1 Enable the API
1. In the Google Cloud Console, navigate to "APIs & Services" > "Library"
2. Search for "Google Calendar API"
3. Click on "Google Calendar API" from the results
4. Click "Enable"
5. Wait for the API to be enabled

### 2.2 Verify API is Enabled
1. Go to "APIs & Services" > "Enabled APIs & services"
2. Confirm "Google Calendar API" appears in the list

## Step 3: Create Service Account Credentials

### 3.1 Create Service Account
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in the service account details:
   - **Service account name**: `ahca-calendar-service`
   - **Service account ID**: `ahca-calendar-service` (auto-generated)
   - **Description**: `Service account for AHCA calendar integration`
4. Click "Create and Continue"

### 3.2 Grant Roles
1. In the "Grant this service account access to project" section:
   - **Role**: `Editor` (for development) or `Calendar API Service Agent` (for production)
2. Click "Continue"
3. Skip the "Grant users access to this service account" section
4. Click "Done"

### 3.3 Generate Private Key
1. In the "Credentials" page, find your newly created service account
2. Click on the service account email
3. Go to the "Keys" tab
4. Click "Add Key" > "Create new key"
5. Select "JSON" format
6. Click "Create"
7. **Important**: Save the downloaded JSON file securely - this contains your private key

## Step 4: Set Up Calendar Access

### 4.1 Create a Dedicated Calendar
1. Go to [Google Calendar](https://calendar.google.com/)
2. On the left sidebar, click the "+" next to "Other calendars"
3. Select "Create new calendar"
4. Fill in calendar details:
   - **Name**: `AHCA Appointments`
   - **Description**: `Calendar for AHCA appointment scheduling`
   - **Time zone**: Your organization's time zone
5. Click "Create calendar"

### 4.2 Share Calendar with Service Account
1. In Google Calendar, find your newly created calendar in the left sidebar
2. Click the three dots next to the calendar name
3. Select "Settings and sharing"
4. Scroll down to "Share with specific people"
5. Click "Add people"
6. Enter your service account email (from the JSON file: `client_email` field)
7. Set permission to "Make changes to events"
8. Click "Send"

### 4.3 Get Calendar ID
1. In the calendar settings, scroll down to "Calendar ID"
2. Copy the Calendar ID (it looks like an email address)
3. Save this for your environment variables

## Step 5: Configure Environment Variables

### 5.1 Add to .env File
Add these variables to your `ahca-server/.env` file:

```env
# Google Calendar Configuration
GOOGLE_CALENDAR_ID=your_calendar_id@group.calendar.google.com
GOOGLE_SERVICE_ACCOUNT_EMAIL=ahca-calendar-service@your-project-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=your-project-id
```

### 5.2 Alternative: Use JSON File Path
Instead of environment variables, you can reference the JSON file:

```env
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./path/to/your/service-account-key.json
GOOGLE_CALENDAR_ID=your_calendar_id@group.calendar.google.com
```

## Step 6: Install Required Dependencies

### 6.1 Install Google APIs Client Library
```bash
cd ahca-server
npm install googleapis
```

### 6.2 Install Additional Utilities (Optional)
```bash
npm install moment-timezone  # For timezone handling
```

## Step 7: Test Your Setup

### 7.1 Basic Authentication Test
Create a test file `test-calendar.js`:

```javascript
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
```

### 7.2 Run the Test
```bash
node test-calendar.js
```

If successful, you should see "Calendar access successful!" without errors.

## Step 8: Implementation Examples

### 8.1 Check Availability (FreeBusy)
```javascript
async function checkAvailability(startTime, endTime) {
  const calendar = google.calendar({ version: 'v3', auth });
  
  const freeBusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: startTime,
      timeMax: endTime,
      items: [{ id: process.env.GOOGLE_CALENDAR_ID }],
    },
  });

  const busyTimes = freeBusy.data.calendars[process.env.GOOGLE_CALENDAR_ID].busy;
  return busyTimes;
}
```

### 8.2 Create Appointment
```javascript
async function createAppointment(appointmentDetails) {
  const calendar = google.calendar({ version: 'v3', auth });
  
  const event = {
    summary: `AHCA Appointment - ${appointmentDetails.patientName}`,
    description: `Patient: ${appointmentDetails.patientName}\nEmail: ${appointmentDetails.email}\nIssue: ${appointmentDetails.issue}`,
    start: {
      dateTime: appointmentDetails.startTime,
      timeZone: 'America/New_York', // Adjust to your timezone
    },
    end: {
      dateTime: appointmentDetails.endTime,
      timeZone: 'America/New_York',
    },
    attendees: [
      { email: appointmentDetails.email },
    ],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 }, // 24 hours before
        { method: 'popup', minutes: 10 }, // 10 minutes before
      ],
    },
  };

  const createdEvent = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    requestBody: event,
  });

  return createdEvent.data;
}
```

### 8.3 Get Available Slots
```javascript
async function getAvailableSlots(date, duration = 30) {
  const startOfDay = new Date(date);
  startOfDay.setHours(9, 0, 0, 0); // 9 AM start
  
  const endOfDay = new Date(date);
  endOfDay.setHours(17, 0, 0, 0); // 5 PM end

  const busyTimes = await checkAvailability(
    startOfDay.toISOString(),
    endOfDay.toISOString()
  );

  // Calculate available slots (simplified logic)
  const availableSlots = [];
  let currentTime = new Date(startOfDay);

  while (currentTime < endOfDay) {
    const slotEnd = new Date(currentTime.getTime() + duration * 60000);
    
    // Check if this slot conflicts with busy times
    const hasConflict = busyTimes.some(busy => {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);
      return currentTime < busyEnd && slotEnd > busyStart;
    });

    if (!hasConflict) {
      availableSlots.push({
        start: new Date(currentTime),
        end: new Date(slotEnd),
      });
    }

    currentTime = new Date(currentTime.getTime() + duration * 60000);
  }

  return availableSlots;
}
```

## Step 9: API Routes Implementation

### 9.1 Create Calendar Routes File
Create `ahca-server/routes/calendar.js`:

```javascript
const express = require('express');
const { google } = require('googleapis');
const router = express.Router();

// Initialize Google Calendar auth
const getCalendarAuth = () => {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      project_id: process.env.GOOGLE_PROJECT_ID,
    },
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
};

// GET /api/calendar/slots - Get available appointment slots
router.get('/slots', async (req, res) => {
  try {
    const { date, duration = 30 } = req.query;
    const auth = getCalendarAuth();
    const calendar = google.calendar({ version: 'v3', auth });
    
    // Implementation here...
    
    res.json({ availableSlots });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/calendar/book - Book an appointment
router.post('/book', async (req, res) => {
  try {
    const appointmentDetails = req.body;
    const auth = getCalendarAuth();
    const calendar = google.calendar({ version: 'v3', auth });
    
    // Implementation here...
    
    res.json({ success: true, eventId: createdEvent.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

### 9.2 Add Route to Server
In `ahca-server/server.js`, add:

```javascript
app.use('/api/calendar', require('./routes/calendar'));
```

## Step 10: Security Considerations

### 10.1 Environment Variables Security
- Never commit the JSON key file to version control
- Use environment variables for sensitive data
- Consider using Google Secret Manager for production

### 10.2 API Quotas and Limits
- Google Calendar API has quotas (typically 1,000,000 requests/day)
- Implement rate limiting in your application
- Cache frequently accessed data

### 10.3 Error Handling
- Implement proper error handling for API failures
- Add retry logic for transient failures
- Log errors for monitoring

## Step 11: Testing Checklist

Before deploying, test these scenarios:

- [ ] Service account can authenticate
- [ ] Can read calendar events
- [ ] Can create new events
- [ ] Can check free/busy status
- [ ] Can update existing events
- [ ] Can delete events
- [ ] Proper timezone handling
- [ ] Error handling works correctly

## Troubleshooting

### Common Issues:

1. **"Calendar not found" error**: 
   - Verify Calendar ID is correct
   - Ensure service account has access to the calendar

2. **Authentication errors**:
   - Check service account email and private key
   - Verify the JSON key file is valid

3. **Permission denied**:
   - Ensure service account has the correct role
   - Verify calendar sharing settings

4. **Timezone issues**:
   - Always specify timezone in event objects
   - Use consistent timezone handling

### Debug Tips:

1. Enable Google API logging:
```javascript
google.options({ 
  debug: true,
  logging: { level: 'debug' }
});
```

2. Test with Google Calendar API Explorer:
   - Go to [API Explorer](https://developers.google.com/calendar/api/v3/reference)
   - Test your calendar ID and credentials

This completes the Google Calendar API setup. Once configured, your AHCA voice agent will be able to check availability, book appointments, and manage calendar events programmatically.
