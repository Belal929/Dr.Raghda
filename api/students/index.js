// POST /api/students - register a student { full_name }
//
// Table schema:
//   CREATE TABLE IF NOT EXISTS students (
//     id SERIAL PRIMARY KEY,
//     full_name TEXT NOT NULL,
//     created_at TIMESTAMPTZ DEFAULT NOW()
//   );

import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  try {
    const sql = neon(process.env.POSTGRES_URL);

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json' },
      });
    }

    const body = await req.json();
    const fullName = typeof body?.full_name === 'string' ? body.full_name.trim() : '';

    if (!fullName) {
      return new Response(JSON.stringify({ error: 'full_name is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const rows = await sql`
      INSERT INTO students (full_name)
      VALUES (${fullName})
      RETURNING id, full_name, created_at
    `;

    return new Response(JSON.stringify({ student: rows[0] }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Server error', detail: String(error?.message || error) }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }
    );
  }
}
