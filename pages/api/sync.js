import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import fetch from 'node-fetch';
import { OpenAI } from 'openai';

const calendar = google.calendar('v3');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  // 🔐 Cron job protection
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end('Unauthorized');
  }

  try {
    // Auth for Google Calendar
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/calendar.readonly']
    });
    const authClient = await auth.getClient();

    // Get calendar events from the past 60 days
    const now = new Date();
    const timeMin = new Date(now.setDate(now.getDate() - 60)).toISOString();
    const timeMax = new Date().toISOString();

    const response = await calendar.events.list({
      calendarId: 'primary',
      auth: authClient,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = response.data.items.filter(e =>
      /investor|pitch|intro/i.test(e.summary || '')
    );

    // Setup Sheets access
    const sheet = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);
    await sheet.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    });
    await sheet.loadInfo();
    const crmSheet = sheet.sheetsByIndex[0];

    for (const event of events) {
      const email = extractEmail(event.description || '');
      const transcript = await fetchFirefliesTranscript(email);
      const summary = await summarizeTranscript(transcript);

      await crmSheet.addRow({
        Date: new Date(event.start.dateTime).toLocaleDateString(),
        Time: new Date(event.start.dateTime).toLocaleTimeString(),
        Title: event.summary || '',
        Email: email || '',
        Summary: summary || '',
        Status: 'New',
        NextStep: 'Pending GPT parse'
      });
    }

    return res.status(200).json({ success: true, synced: events.length });
  } catch (err) {
    console.error('[Sync Error]', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Helper: Extract email from description text
function extractEmail(text) {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : '';
}

// Helper: Fetch Fireflies transcript
async function fetchFirefliesTranscript(email) {
  if (!email) return '';
  try {
    const response = await fetch(`https://api.fireflies.ai/api/v1/meetings?email=${email}`, {
      headers: {
        Authorization: `Bearer ${process.env.FIREFLIES_API_KEY}`
      }
    });
    const data = await response.json();
    return data?.results?.[0]?.transcript || '';
  } catch {
    return '';
  }
}

// Helper: Use GPT to summarize
async function summarizeTranscript(transcript) {
  if (!transcript) return '';
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'Summarize this meeting for CRM including contact name, next step, and deal status.' },
      { role: 'user', content: transcript }
    ]
  });
  return completion.choices[0].message.content.trim();
}