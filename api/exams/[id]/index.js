// GET /api/exams/[id] - returns a single exam (id, title, pdf_url, created_at)

import { neon } from '@neondatabase/serverless';

export const config = {
  runtime: 'edge',
};

export default async function handler(req, { params }) {
  try {
    const sql = neon(process.env.POSTGRES_URL);
    const examId = params?.id;

    if (!examId) {
      return new Response(JSON.stringify({ error: 'Exam ID is required' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json' },
      });
    }

    const rows = await sql`
      SELECT id, title, pdf_url, created_at
      FROM exams
      WHERE id = ${examId}
      LIMIT 1
    `;

    if (!rows.length) {
      return new Response(JSON.stringify({ error: 'Exam not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ exam: rows[0] }), {
      status: 200,
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
