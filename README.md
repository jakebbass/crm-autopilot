# crm-autopilot
fundraising CRM
# CRM Autopilot

A Vercel-deployed CRM tool that:
- Syncs meetings from Google Calendar
- Parses Fireflies transcripts
- Uses GPT to summarize
- Updates your Google Sheet CRM

## Setup

1. Create a Google Service Account
2. Enable Google Sheets + Calendar APIs
3. Create a Google Sheet and share with the service email
4. Add these env vars in Vercel:
