// POST { report }          → { code }   save a finished report
// GET  ?codes=LPR-…,LPR-…  → [{ code, status, category, created_at, updated_at }]   for the History page
import { randomInt } from 'node:crypto';
import { sql } from '@/lib/db';
import { check, missing } from '@/lib/sapa';

// No 0/O or 1/I, so codes are easy to read out and type. 32^8 ≈ 1 trillion codes.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const chars = (n: number) => Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export async function POST(req: Request) {
  const { report: input } = await req.json().catch(() => ({}));
  const result = check(input);
  if ('bad' in result) return Response.json({ error: 'invalid fields', fields: result.bad }, { status: 400 });
  const empty = missing(result.report);
  if (empty.length) return Response.json({ error: 'required fields missing', fields: empty }, { status: 400 });

  // ponytail: a duplicate code (1 in ~a trillion) fails the insert with a 500; retry if this ever goes beyond a demo.
  const code = `LPR-${chars(4)}-${chars(4)}`;
  await sql`INSERT INTO reports (code, report) VALUES (${code}, ${JSON.stringify(result.report)})`;
  return Response.json({ code }, { status: 201 });
}

// Returns status only, never the story: anyone holding a code can see this.
export async function GET(req: Request) {
  const codes = (new URL(req.url).searchParams.get('codes') ?? '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
  if (!codes.length || codes.length > 50) return Response.json({ error: 'pass 1 to 50 codes as ?codes=A,B' }, { status: 400 });
  const rows = await sql`
    SELECT code, status, report->'category' AS category, created_at, updated_at
    FROM reports WHERE code = ANY(${codes}) ORDER BY created_at DESC`;
  return Response.json(rows);
}
