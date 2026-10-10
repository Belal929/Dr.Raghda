// /api/results - quiz results backed by Neon Postgres.
//
// Run this once against your database to store the full client payload:
//   ALTER TABLE results ADD COLUMN IF NOT EXISTS payload JSONB;
//
// Routes:
//   GET    /api/results?ping=1        -> { storage: true }               (public)
//   GET    /api/results?leaderboard=1 -> { board: rows } top 10          (public)
//   GET    /api/results               -> { results: rows }               (teacher)
//   POST   /api/results               -> save one student result         (public)
//   DELETE /api/results[?id=...]      -> delete one row or all rows      (teacher)

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

function mergeRow(r) {
  const payload = r.payload && typeof r.payload === 'object' ? r.payload : {};
  return {
    id: r.id,
    name: r.student_name,
    ...payload,
    score: r.score,
    total: r.total,
  };
}

export default async function handler(req) {
  try {
    const sql = neon(process.env.POSTGRES_URL);
    const { searchParams } = new URL(req.url);

    if (req.method === 'GET') {
      // Capability probe - tells the client that cloud storage is available.
      if (searchParams.has('ping')) {
        return json({ storage: true });
      }

      // Public leaderboard: best score per student, top 10.
      if (searchParams.has('leaderboard')) {
        const rows = await sql`
          SELECT DISTINCT ON (student_name)
            id, student_name, score, total, payload, created_at
          FROM results
          ORDER BY student_name ASC, score DESC NULLS LAST, created_at ASC
        `;
        const board = rows
          .slice()
          .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
          .slice(0, 10)
          .map(mergeRow);
        return json({ board });
      }

      // Teacher-only: full result list.
      if (!process.env.TEACHER_PASSWORD) {
        return json({ error: 'TEACHER_PASSWORD not configured' }, 503);
      }
      const pass = req.headers.get('x-teacher-password');
      if (pass !== process.env.TEACHER_PASSWORD) {
        return json({ error: 'Unauthorized' }, 401);
      }

      const rows = await sql`
        SELECT id, student_name, score, total, payload, created_at
        FROM results
        ORDER BY created_at DESC
      `;
      return json({ results: rows.map(mergeRow) });
    }

    // Students save a completed result.
    if (req.method === 'POST') {
      const body = await req.json();
      const name = typeof body?.name === 'string' ? body.name.trim() : '';
      if (!name) {
        return json({ error: 'name is required' }, 400);
      }

      const score = Number.isFinite(Number(body?.correct))
        ? Math.round(Number(body.correct))
        : null;
      const total = Number.isFinite(Number(body?.total))
        ? Math.round(Number(body.total))
        : null;

      const rows = await sql`
        INSERT INTO results (exam_id, student_name, score, total, payload)
        VALUES (NULL, ${name}, ${score}, ${total}, ${JSON.stringify(body)}::jsonb)
        RETURNING id
      `;
      return json({ ok: true, id: rows[0].id });
    }

    // Teacher-only: delete a single result (by client id) or everything.
    if (req.method === 'DELETE') {
      if (!process.env.TEACHER_PASSWORD) {
        return json({ error: 'TEACHER_PASSWORD not configured' }, 503);
      }
      const pass = req.headers.get('x-teacher-password');
      if (pass !== process.env.TEACHER_PASSWORD) {
        return json({ error: 'Unauthorized' }, 401);
      }

      const id = searchParams.get('id');
      if (id) {
        await sql`
          DELETE FROM results
          WHERE id::text = ${String(id)} OR payload->>'id' = ${String(id)}
        `;
      } else {
        await sql`DELETE FROM results`;
      }
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
