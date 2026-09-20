'use strict';
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');

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

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log('ARIA backend running — open http://localhost:' + PORT + '/aria.html');
  console.log('AI provider: ' + (process.env.AI_PROVIDER || 'anthropic'));
});
