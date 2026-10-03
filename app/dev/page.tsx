'use client';
// Bare test page for the voice pipeline: /dev. Not the real UI — reference for the frontend.
// Flow: get token from /api/live-token → connect to Gemini Live → stream mic (16 kHz PCM) up,
// play AI audio (24 kHz PCM) down, show both transcriptions as captions.
import { useRef, useState } from 'react';
import { GoogleGenAI, type LiveServerMessage, type Session } from '@google/genai';
import { LABELS, type Report } from '@/lib/sapa';

type Line = { who: 'you' | 'ai'; text: string };

// Collects mic samples off the audio thread, posts ~100 ms (1600 samples) at a time.
// Inlined so it needs no extra file.
const WORKLET = `registerProcessor('mic', class extends AudioWorkletProcessor {
  buf = new Float32Array(1600); n = 0;
  process(inputs) {
    for (const s of inputs[0]?.[0] ?? []) {
      this.buf[this.n++] = s;
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice()); this.n = 0; }
    }
    return true;
  }
});`;

function pcmToBase64(samples: Float32Array) {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff;
  let bin = '';
  for (const byte of new Uint8Array(pcm.buffer)) bin += String.fromCharCode(byte);
  return btoa(bin);
}

function base64ToFloat(b64: string) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const pcm = new Int16Array(bytes.buffer);
  return Float32Array.from(pcm, s => s / 0x8000);
}

export default function Dev() {
  const [mode, setMode] = useState<'report' | 'companion'>('report');
  const [lang, setLang] = useState<'en' | 'id'>('id');
  const [status, setStatus] = useState('idle');
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState<{ report: Report; missing: string[] } | null>(null);
  const transcript = useRef<Line[]>([]); // same as `lines`, but readable inside Gemini callbacks
  const stopRef = useRef<() => void>(() => {});

  function caption(who: Line['who'], text?: string) {
    if (!text) return;
    const t = transcript.current;
    const last = t.at(-1);
    if (last?.who === who) t[t.length - 1] = { who, text: last.text + text };
    else t.push({ who, text });
    setLines([...t]);
  }

  // The AI called draft_ready: turn the transcript into a report, tell the AI what's still missing.
  async function makeDraft(session: Session, id?: string) {
    let response;
    try {
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: transcript.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDraft(data);
      response = data.missing.length ? { missing: data.missing.map((k: string) => LABELS[k]) } : { ok: true };
    } catch (err) {
      response = { error: 'Could not prepare the draft. Apologise and offer to try again.', detail: (err as Error).message };
    }
    session.sendToolResponse({ functionResponses: [{ id, name: 'draft_ready', response }] });
  }

  async function start() {
    transcript.current = [];
    setLines([]);
    setDraft(null);
    setStatus('getting token…');
    // Audio contexts must be created inside the tap, or iPhones stay silent.
    const micCtx = new AudioContext({ sampleRate: 16000 });
    const outCtx = new AudioContext({ sampleRate: 24000 });
    let playAt = 0;
    const playing = new Set<AudioBufferSourceNode>();
    let session: Session | undefined;
    let stream: MediaStream | undefined;

    const stop = () => {
      session?.close();
      stream?.getTracks().forEach(t => t.stop());
      micCtx.close();
      outCtx.close();
      setStatus('idle');
    };
    stopRef.current = stop;

    try {
      const res = await fetch('/api/live-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, lang }),
      });
      const { token, model, apiVersion, error } = await res.json();
      if (!res.ok) throw new Error(error);

      setStatus('connecting…');
      const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion } });
      session = await ai.live.connect({
        model, // everything else is locked into the token
        callbacks: {
          onmessage: (msg: LiveServerMessage) => {
            for (const call of msg.toolCall?.functionCalls ?? []) {
              if (call.name === 'draft_ready' && session) makeDraft(session, call.id);
            }
            const c = msg.serverContent;
            if (!c) return;
            caption('you', c.inputTranscription?.text);
            caption('ai', c.outputTranscription?.text);
            if (c.interrupted) { // user talked over the AI: drop queued audio
              playing.forEach(s => s.stop());
              playing.clear();
              playAt = 0;
            }
            for (const part of c.modelTurn?.parts ?? []) {
              if (!part.inlineData?.data) continue;
              const samples = base64ToFloat(part.inlineData.data);
              const buf = outCtx.createBuffer(1, samples.length, 24000);
              buf.copyToChannel(samples, 0);
              const src = outCtx.createBufferSource();
              src.buffer = buf;
              src.connect(outCtx.destination);
              playAt = Math.max(playAt, outCtx.currentTime);
              src.start(playAt);
              playAt += buf.duration;
              playing.add(src);
              src.onended = () => playing.delete(src);
            }
          },
          onerror: e => setStatus('error: ' + e.message),
          onclose: e => setStatus(`closed${e.reason ? ': ' + e.reason : ''}`),
        },
      });

      setStatus('opening mic…');
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      await micCtx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })));
      const mic = new AudioWorkletNode(micCtx, 'mic');
      micCtx.createMediaStreamSource(stream).connect(mic);
      mic.port.onmessage = ({ data }: MessageEvent<Float32Array>) =>
        session?.sendRealtimeInput({ audio: { data: pcmToBase64(data), mimeType: 'audio/pcm;rate=16000' } });

      session.sendRealtimeInput({ text: lang === 'id' ? 'Halo' : 'Hi' }); // nudge the AI to greet first
      setStatus('live — talk');
    } catch (err) {
      stop();
      setStatus('error: ' + (err as Error).message);
    }
  }

  const live = status !== 'idle' && !status.startsWith('error') && !status.startsWith('closed');

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 16, fontFamily: 'system-ui' }}>
      <h1>Voice test</h1>
      <p>
        <select value={mode} onChange={e => setMode(e.target.value as typeof mode)} disabled={live}>
          <option value="report">Report mode</option>
          <option value="companion">Just wanna talk</option>
        </select>{' '}
        <select value={lang} onChange={e => setLang(e.target.value as typeof lang)} disabled={live}>
          <option value="id">Bahasa Indonesia</option>
          <option value="en">English</option>
        </select>{' '}
        {live ? <button onClick={() => stopRef.current()}>Stop</button> : <button onClick={start}>Start</button>}
      </p>
      <p><small>{status}</small></p>
      {lines.map((l, i) => (
        <p key={i} style={{ textAlign: l.who === 'you' ? 'right' : 'left' }}>
          <small>{l.who === 'you' ? 'You' : 'AI'}</small><br />{l.text}
        </p>
      ))}
      {draft && (
        <section>
          <h2>Draft {draft.missing.length ? `(missing: ${draft.missing.join(', ')})` : '(complete)'}</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(draft.report, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}
