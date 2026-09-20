'use strict';

/* Same persona used by the "sample"-capability path in aria.html, kept in
   sync here so ARIA sounds the same regardless of which AI path answered. */
const PERSONA = "You are ARIA, an onboard voice-and-vision assistant speaking through " +
  "text-to-speech inside a browser app. Reply in 1 to 3 short spoken sentences, plain " +
  "language, no markdown, no lists, no headers.";
const VISION_SUFFIX = " You are looking at one live camera frame. Answer in 1-2 short " +
  "spoken sentences. If you genuinely can't tell, say so plainly instead of guessing.";

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

function requireKey(){
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set — copy .env.example to .env and fill it in.');
  return key;
}

async function callMessages(body){
  const apiKey = requireKey(); /* throws its own clear error before any network attempt */
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
  } catch (networkErr){
    const timedOut = networkErr && (networkErr.name === 'TimeoutError' || networkErr.name === 'AbortError');
    const err = new Error(timedOut ? 'Anthropic request timed out' : ('Anthropic network error: ' + networkErr.message));
    err.status = 0;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok){
    const msg = (data && data.error && data.error.message) || ('Anthropic API error ' + res.status);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const block = (data.content || []).find((b) => b.type === 'text');
  const text = block && block.text && block.text.trim();
  if (!text){
    const err = new Error('Anthropic returned no usable content (empty or malformed response)');
    err.status = 502;
    throw err;
  }
  return text;
}

/* Cheap, no-network check for /api/health — confirms the required key is
   present without spending a real (and possibly costly) API call. */
function isConfigured(){
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * @param {string} message  the user's latest message
 * @param {Array<{role:'user'|'assistant', content:string}>} history  prior turns, no system/persona included
 * @returns {Promise<{text: string}>}
 */
async function chat(message, history){
  const messages = (history || []).concat([{ role: 'user', content: message }]);
  const text = await callMessages({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: PERSONA,
    messages
  });
  return { text };
}

/**
 * @param {Buffer} imageBuffer  raw image bytes
 * @param {string} mimeType     e.g. 'image/jpeg'
 * @param {string} question     the user's question about the frame
 * @returns {Promise<{text: string}>}
 */
async function vision(imageBuffer, mimeType, question){
  const text = await callMessages({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: PERSONA + VISION_SUFFIX,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBuffer.toString('base64') } },
        { type: 'text', text: question || 'Describe what you see.' }
      ]
    }]
  });
  return { text };
}

module.exports = { chat, vision, isConfigured };
