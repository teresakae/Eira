// POST { transcript: [{ who: 'you' | 'ai', text }] }
// → { report, missing } — the conversation turned into SAPA 129 fields, plus required fields still empty.
import { GoogleGenAI } from '@google/genai';
import { REPORT_SCHEMA, missing } from '@/lib/sapa';

const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite']; // second is the backup when the first is busy
const MAX_CHARS = 100_000; // ~1.5 hours of talking; stops someone posting a novel

const INSTRUCTIONS = `You turn a conversation into a report for SAPA 129, Indonesia's hotline for violence against women and children.
The transcript comes from speech recognition, so expect small spelling mistakes.
"you" is the person reporting. "ai" is the companion who asked the questions.

Rules:
- Only record facts the user said or clearly confirmed. Never guess. If something wasn't said or is unclear, use null.
- Questions from the ai are not facts.
- Write every text field in Indonesian, even if the conversation was in English.
- description: what happened, in order, in 3 to 8 plain sentences, using only the user's words. No added details, no judgement.
- If it happened to the user (saya_sendiri), the user is both victim and reporter: copy their name and phone number into both.
- anonymous: null unless the user said whether they want to stay anonymous.
- category: only kinds of violence the user actually described. Being stared at or followed is psikis; only use seksual if they described something sexual (touching, sexual comments, exposure, sexual messages).
- Phone numbers: digits only.`;

type Line = { who: 'you' | 'ai'; text: string };

export async function POST(req: Request) {
  const { transcript } = await req.json().catch(() => ({}));
  const valid = Array.isArray(transcript) && transcript.length > 0 &&
    transcript.every((l: Line) => (l?.who === 'you' || l?.who === 'ai') && typeof l.text === 'string');
  if (!valid) return Response.json({ error: 'transcript must be a non-empty list of { who: you|ai, text }' }, { status: 400 });

  const conversation = (transcript as Line[]).map(l => `${l.who}: ${l.text.trim()}`).join('\n');
  if (conversation.length > MAX_CHARS) return Response.json({ error: 'transcript too long' }, { status: 413 });

  // Retries "model busy" (503) errors 3 times per model (waiting 1 s, then 2 s), then tries the next model.
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { retryOptions: { attempts: 3, maxDelay: 2 } } });
  let lastError;
  for (const model of MODELS) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: conversation,
        config: {
          systemInstruction: INSTRUCTIONS,
          responseMimeType: 'application/json',
          responseJsonSchema: REPORT_SCHEMA,
        },
      });
      const report = JSON.parse(res.text ?? '');
      return Response.json({ report, missing: missing(report) });
    } catch (err) {
      lastError = err as Error;
    }
  }
  return Response.json({ error: lastError?.message }, { status: 502 });
}
