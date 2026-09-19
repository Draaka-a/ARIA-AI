'use strict';
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');

const provider = require('./providers');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* Probed by aria.html at startup to decide whether to show "AI LINKED". */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, provider: process.env.AI_PROVIDER || 'anthropic' });
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
    console.error('[api/chat]', e.message);
    res.status(500).json({ error: e.message });
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
    console.error('[api/vision]', e.message);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log('ARIA backend running — open http://localhost:' + PORT + '/aria.html');
  console.log('AI provider: ' + (process.env.AI_PROVIDER || 'anthropic'));
});
