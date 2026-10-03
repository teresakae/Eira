// POST { mode: 'report' | 'companion', lang: 'en' | 'id' }
// → { token, model, apiVersion } for the browser to open a Gemini Live voice session.
// The prompt, voice and captions are locked into the token; the browser can't change them.
import { GoogleGenAI, Modality, StartSensitivity } from '@google/genai';
import { DRAFT_TOOL, systemPrompt, type Lang, type Mode } from '@/lib/prompts';

const MODEL = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';
const VOICE = process.env.GEMINI_VOICE || 'Aoede';
// ponytail: SDK only accepts ephemeral tokens on v1alpha today; Google docs say v1beta. Flip here if it starts warning.
const API_VERSION = 'v1alpha';

const MODES: Mode[] = ['report', 'companion'];
const LANGS: Lang[] = ['en', 'id'];

export async function POST(req: Request) {
  const { mode, lang } = await req.json().catch(() => ({}));
  if (!MODES.includes(mode) || !LANGS.includes(lang)) {
    return Response.json({ error: 'mode must be report|companion, lang must be en|id' }, { status: 400 });
  }
  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ error: 'GEMINI_API_KEY is not set on the server' }, { status: 500 });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { apiVersion: API_VERSION } });
  try {
    const token = await ai.authTokens.create({
      config: { // SDK defaults: 1 use, 60 s to connect, 30 min session
        liveConnectConstraints: {
          model: MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: systemPrompt(mode, lang),
            tools: mode === 'report' ? [{ functionDeclarations: [DRAFT_TOOL] }] : undefined,
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
            // Live captions of the user. Without language hints, noise gets captioned as Spanish, Korean, etc.
            inputAudioTranscription: { languageCodes: lang === 'id' ? ['id-ID', 'en-US'] : ['en-US', 'id-ID'] },
            // Low = background noise and echo are less likely to cut the AI off mid-sentence.
            realtimeInputConfig: { automaticActivityDetection: { startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW } },
            outputAudioTranscription: {}, // live captions of the AI
            sessionResumption: {},        // reconnect past the 15-min session cap
            contextWindowCompression: { slidingWindow: {} },
          },
        }, // setting liveConnectConstraints locks all of the above
      },
    });
    // ponytail: no rate limit; anyone with the URL can mint tokens. Add one before real users.
    return Response.json({ token: token.name, model: MODEL, apiVersion: API_VERSION });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
