// /api/questions - shared custom question bank stored in Neon Postgres.
//
// Run this once against your database:
//   CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value JSONB);
//
// Routes:
//   GET /api/questions -> { storage: true, ...question_bank } or { storage: true }
//   PUT /api/questions -> save the full question bank payload (teacher only)

import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req) {
  try {
    const sql = neon(process.env.POSTGRES_URL);

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT value
        FROM settings
        WHERE key = 'question_bank'
        LIMIT 1
      `;
      if (rows.length && rows[0].value && typeof rows[0].value === 'object') {
        return json({ storage: true, ...rows[0].value });
      }
      return json({ storage: true });
    }

    if (req.method === 'PUT') {
      if (!process.env.TEACHER_PASSWORD) {
        return json({ error: 'TEACHER_PASSWORD not configured' }, 503);
      }
      const pass = req.headers.get('x-teacher-password');
      if (pass !== process.env.TEACHER_PASSWORD) {
        return json({ error: 'Unauthorized' }, 401);
      }

      const body = await req.json();
      await sql`
        INSERT INTO settings (key, value)
        VALUES ('question_bank', ${JSON.stringify(body)}::jsonb)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `;
      return json({ ok: true });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    return json(
      { error: 'Server error', detail: String(error?.message || error) },
      500
    );
  }
}
