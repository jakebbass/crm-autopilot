// File: /api/sync.js (Vercel Serverless Function)
import { google } from 'googleapis';
import fetch from 'node-fetch';
import { GoogleAuth } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { OpenAI } from 'openai';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const FIRELIES_API_KEY = process.env.FIREFLIES_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

export default async function handler(req, res) {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/calendar.readonly']
  });
  const authClient = await auth.getClient();
  const calendar = google.calendar({ version: 'v3', auth: authClient });

  const timeMin = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date().toISOString();

  const calendarRes = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime'
  });

  const events = calendarRes.data.items.filter(event =>
    /investor|pitch|intro/i.test(event.summary || '')
  );

  const doc = new GoogleSpreadsheet(SHEET_ID);
  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
  });
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];

  for (const event of events) {
    const email = extractEmail(event.description);
    const title = event.summary;

    const firefliesResp = await fetch(`https://api.fireflies.ai/api/v1/meetings?email=${email}`, {
      headers: { Authorization: `Bearer ${FIRELIES_API_KEY}` }
    });
    const firefliesData = await firefliesResp.json();
    const transcript = firefliesData?.results?.[0]?.transcript || '';

    const summary = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Summarize this meeting for CRM entry including contact name, next step, and status.' },
        { role: 'user', content: transcript }
      ]
    });

    await sheet.addRow({
      Date: new Date(event.start.dateTime).toLocaleDateString(),
      Time: new Date(event.start.dateTime).toLocaleTimeString(),
      Title: title,
      Email: email,
      Summary: summary.choices[0].message.content,
      Status: 'New',
      NextStep: 'Pending GPT parse'
    });
  }

  res.status(200).json({ success: true, eventsSynced: events.length });
}

function extractEmail(text = '') {
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : '';
}
