'use strict';
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const provider = require('./providers');

/* Providers tag thrown errors with .status when they have a real HTTP
   status (401/429/5xx from the upstream API). 0 is used internally to mean
   "no real status" (network failure, timeout, missing key) — Node's
   res.status() throws on anything outside 100-599, so that sentinel must
   never be forwarded as-is. */
function isValidHttpStatus(s){
  return Number.isInteger(s) && s >= 100 && s <= 599;
}

const app = express();
const server = http.createServer(app);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* Probed by aria.html at startup to decide whether to show "AI LINKED".
   "ok" only means this server process is up. "configured" means the
   active provider has its required API key present — checked with zero
   network calls, so this never costs money or hits a rate limit. Neither
   guarantees the upstream AI API itself is currently healthy; that's only
   known once a real /api/chat or /api/vision call succeeds or fails. */
app.get('/api/health', (req, res) => {
  const name = process.env.AI_PROVIDER || 'anthropic';
  const configured = typeof provider.isConfigured === 'function' ? provider.isConfigured() : true;
  res.json({ ok: true, provider: name, configured });
});

/* Matches backendChat() in aria.html: { message, history } -> { text } */
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }
    const result = await provider.chat(message, Array.isArray(history) ? history : []);
    res.json(result);
  } catch (e) {
    /* e.status comes from the provider when the upstream API gave a real
       HTTP status (401/429/5xx/etc); 502 is the fallback for network
       failures, timeouts, or a missing key, none of which have one.
       Logged: status + message only — provider error messages come from
       the upstream API's own response body, which never echoes back our
       key, so this is safe to print. */
    const status = isValidHttpStatus(e.status) ? e.status : 502;
    console.error('[api/chat]', status, e.message);
    res.status(status).json({ error: e.message });
  }
});

/* Matches backendVision() in aria.html: multipart form with image + question -> { text } */
app.post('/api/vision', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'image is required' });
    const question = (req.body && req.body.question) || 'Describe what you see.';
    const result = await provider.vision(req.file.buffer, req.file.mimetype, question);
    res.json(result);
  } catch (e) {
    const status = isValidHttpStatus(e.status) ? e.status : 502;
    console.error('[api/vision]', status, e.message);
    res.status(status).json({ error: e.message });
  }
});

/* ============================================================
   STT bridge: browser WebSocket <-> Deepgram streaming WebSocket.
   Added for the SpeechRecognition -> Deepgram STT refactor. This is
   ONLY a transport bridge — it never interprets the transcript itself.
   The browser (public/aria.html) sends raw MediaRecorder audio chunks
   here over /ws/stt; this relays them to Deepgram and relays Deepgram's
   interim/final results back. The Deepgram key never reaches the browser.
   ============================================================ */
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';
const DEEPGRAM_MODEL = process.env.DEEPGRAM_MODEL || 'nova-2';

const sttWss = new WebSocket.Server({ server, path: '/ws/stt' });

sttWss.on('connection', (clientWs, req) => {
  if (!DEEPGRAM_API_KEY) {
    console.error('[stt] DEEPGRAM_API_KEY is not set — rejecting mic connection.');
    try { clientWs.send(JSON.stringify({ type: 'error', message: 'Voice input is not configured on this server (missing Deepgram API key).' })); } catch (_e) {}
    clientWs.close();
    return;
  }

  /* Reuses aria.html's existing id-ID/en-US toggle, mapped to Deepgram's
     language codes. Falls back to en-US for anything unrecognized. */
  const reqUrl = new URL(req.url, 'http://localhost');
  const lang = reqUrl.searchParams.get('lang') === 'id-ID' ? 'id' : 'en-US';

  const dgParams = new URLSearchParams({
    model: DEEPGRAM_MODEL,
    language: lang,
    interim_results: 'true',
    smart_format: 'true',
    punctuate: 'true',
    endpointing: '300'
  });

  let dgOpen = false;
  let closedByUs = false;
  const pendingChunks = [];

  const deepgramWs = new WebSocket('wss://api.deepgram.com/v1/listen?' + dgParams.toString(), {
    headers: { Authorization: 'Token ' + DEEPGRAM_API_KEY }
  });

  deepgramWs.on('open', () => {
    dgOpen = true;
    for (const chunk of pendingChunks) deepgramWs.send(chunk);
    pendingChunks.length = 0;
  });

  /* Deepgram "Results" messages carry either an interim or a finalized
     segment (is_final), plus speech_final once its endpointing detects a
     pause — i.e. the end of an utterance. aria.html only calls
     handleUtterance() on speechFinal, so interim results never trigger it. */
  deepgramWs.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch (_e) { return; }
    if (msg.type !== 'Results') return;
    const alt = msg.channel && msg.channel.alternatives && msg.channel.alternatives[0];
    const transcript = alt ? alt.transcript : '';
    if (!transcript && !msg.speech_final) return; // skip empty interim noise
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({
        type: 'transcript',
        text: transcript,
        isFinal: !!msg.is_final,
        speechFinal: !!msg.speech_final
      }));
    }
  });

  deepgramWs.on('error', (err) => {
    console.error('[stt] Deepgram connection error:', err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      try { clientWs.send(JSON.stringify({ type: 'error', message: 'Deepgram connection error.' })); } catch (_e) {}
    }
  });

  deepgramWs.on('close', () => {
    dgOpen = false;
    if (!closedByUs && clientWs.readyState === WebSocket.OPEN) clientWs.close();
  });

  clientWs.on('message', (data, isBinary) => {
    if (!isBinary) return; // ignore stray text frames; audio only
    if (dgOpen) deepgramWs.send(data);
    else pendingChunks.push(data);
  });

  clientWs.on('close', () => {
    closedByUs = true;
    try { deepgramWs.close(); } catch (_e) {}
  });

  clientWs.on('error', () => {
    closedByUs = true;
    try { deepgramWs.close(); } catch (_e) {}
  });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log('ARIA backend running — open http://localhost:' + PORT + '/aria.html');
  console.log('AI provider: ' + (process.env.AI_PROVIDER || 'anthropic'));
  console.log('STT provider: Deepgram' + (DEEPGRAM_API_KEY ? ' (' + DEEPGRAM_MODEL + ')' : ' — DEEPGRAM_API_KEY not set, mic will not work'));
});
