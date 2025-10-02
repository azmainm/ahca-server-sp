# Microsoft Calendar Integration Setup Guide

This guide provides the setup instructions for integrating Microsoft Calendar with the AHCA voice agent using Microsoft Graph API.

## Prerequisites

- Azure AD App Registration (already completed)
- Shared mailbox with calendar access (already created)
- Microsoft Graph application permissions granted with admin consent

## Environment Variables Configuration

Add the following environment variables to your `ahca-server/.env` file:

```env
# Microsoft Calendar Configuration
AZURE_CLIENT_ID=
AZURE_TENANT_ID=
AZURE_CLIENT_SECRET=
SHARED_MAILBOX_EMAIL=

# Existing Google Calendar Configuration (keep these)
GOOGLE_CALENDAR_ID=your_calendar_id@group.calendar.google.com
GOOGLE_SERVICE_ACCOUNT_EMAIL=ahca-calendar-service@your-project-id.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=your-project-id
```

## Azure AD App Registration Details

The following Azure AD App Registration has been configured:

- **Application (client) ID**: ``
- **Directory (tenant) ID**: ``
- **Client Secret**: 
- **Client Secret Expires**: 

### Permissions Granted

The app registration has been granted the following Microsoft Graph application permissions:
- Calendars.ReadWrite
- Calendars.ReadWrite.Shared
- User.Read.All
- Mail.Read.Shared
- Mail.ReadWrite.Shared

Admin consent has been granted for all permissions.

## Shared Mailbox Configuration

A shared mailbox has been created with the following details:
- **Email**: `` (update this in your .env file if different)
- **Calendar**: Automatically created with the shared mailbox
- **Access**: The Azure AD app has permissions to read/write calendar events

## How It Works

### Calendar Selection Flow

1. When a user requests an appointment, the voice agent asks: "Would you like to schedule this in your Google Calendar or Microsoft Calendar?"
2. Based on the user's response:
   - **Google Calendar**: Uses the existing Google Calendar integration
   - **Microsoft Calendar**: Uses the new Microsoft Graph API integration

### Microsoft Calendar Integration

The `MicrosoftCalendarService.js` provides the following functionality:

#### Authentication
- Uses OAuth 2.0 Client Credentials flow
- Acquires access tokens automatically
- Handles token refresh and caching

#### Calendar Operations
- **Check Availability**: Verifies time slot availability in the shared mailbox calendar
- **Find Available Slots**: Identifies open 30-minute slots during business hours (12 PM - 4 PM, Mon-Fri)
- **Create Appointments**: Creates calendar events with customer details
- **Next Available Slot**: Suggests alternative dates when requested date is full

#### Event Details
Events created in Microsoft Calendar include:
- **Subject**: Service type with customer name
- **Body**: Customer contact information and scheduling details
- **Start/End Time**: 30-minute appointments in America/Denver timezone
- **Attendees**: Customer email address
- **Reminders**: 1-hour before appointment

## Dependencies

The following npm package has been added to support Microsoft Graph integration:

```json
{
  "dependencies": {
    "@azure/msal-node": "^2.15.0"
  }
}
```

## Installation

1. Install the new dependency:
```bash
cd ahca-server
npm install
```

2. Update your `.env` file with the Microsoft Calendar configuration variables shown above.

3. Restart the server:
```bash
npm run dev
```

## Testing

To test the Microsoft Calendar integration:

1. Start a conversation with the voice agent
2. Request an appointment
3. When prompted, choose "Microsoft Calendar"
4. Complete the appointment booking flow
5. Verify the event appears in the shared mailbox calendar

## Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify Azure AD app credentials are correct
   - Ensure client secret hasn't expired
   - Check that admin consent has been granted

2. **Calendar Access Errors**
   - Verify shared mailbox email address is correct
   - Ensure the Azure AD app has proper permissions
   - Check that the shared mailbox exists and is accessible

3. **Token Acquisition Failures**
   - Verify tenant ID is correct
   - Check network connectivity to Microsoft Graph endpoints
   - Ensure the app registration is active

### Debug Tips

1. Enable detailed logging by checking console output for Microsoft Calendar operations
2. Verify token acquisition by checking for "✅ Microsoft Graph access token acquired" messages
3. Monitor API calls for error responses from Microsoft Graph

## Security Considerations

1. **Environment Variables**: Keep Azure AD credentials secure and never commit to version control
2. **Token Management**: Access tokens are cached and automatically refreshed
3. **Permissions**: Use principle of least privilege - only grant necessary calendar permissions
4. **Shared Mailbox**: Ensure proper access controls on the shared mailbox

## API Endpoints Used

The integration uses the following Microsoft Graph API endpoints:

- **Authentication**: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
- **Calendar Events**: `https://graph.microsoft.com/v1.0/users/{shared_mailbox_email}/calendar/events`
- **Calendar View**: `https://graph.microsoft.com/v1.0/users/{shared_mailbox_email}/calendar/calendarView`

## Comparison with Google Calendar

| Feature | Google Calendar | Microsoft Calendar |
|---------|----------------|-------------------|
| Authentication | Service Account | Client Credentials |
| Event Creation | ✅ | ✅ |
| Availability Check | ✅ | ✅ |
| Time Slot Finding | ✅ | ✅ |
| Timezone Support | ✅ | ✅ |
| Attendee Invites | Limited (Service Account) | ✅ |
| Reminders | ✅ | ✅ |

Both integrations provide identical functionality from the user's perspective, ensuring a consistent experience regardless of calendar choice.
