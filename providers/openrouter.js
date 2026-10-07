'use strict';

/* Persona now lives in core/persona.js (single source of truth). server.js
   passes the fully built system prompt (persona + memory + knowledge) via
   opts.system; the persona alone is the fallback for direct callers. */
const { PERSONA, VISION_SUFFIX } = require('../core/persona');

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

function requireKey(){
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set — copy .env.example to .env and fill it in.');
  return key;
}

function activeModel(){
  /* openrouter/free auto-picks whichever free model is currently available
     (and image-capable, for vision requests) — see providers note in README
     on why a specific :free slug is a moving target. */
  return process.env.OPENROUTER_MODEL || 'openrouter/free';
}

async function callChatCompletions(messages){
  const apiKey = requireKey(); /* throws its own clear error before any network attempt */
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer ' + apiKey,
        /* optional, but recommended by OpenRouter so usage shows up nicely
           attributed to this app in their dashboard */
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost',
        'X-Title': process.env.OPENROUTER_SITE_NAME || 'ARIA Assistant'
      },
      body: JSON.stringify({
        model: activeModel(),
        max_tokens: 400,
        /* Some free/auto-routed models are "thinking" models that otherwise
           dump their whole chain-of-thought into message.content, eating the
           token budget before ever reaching the actual reply. This asks
           OpenRouter to keep reasoning internal (or skip it) and return only
           the final answer; models that don't support it just ignore it. */
        reasoning: { effort: 'low', exclude: true },
        messages
      }),
      /* openrouter/free can route to a slow or hung upstream model; without
         this a single bad request could hang the whole /api/chat call
         indefinitely (Node's fetch has no default timeout). */
      signal: AbortSignal.timeout(20000)
    });
  } catch (networkErr){
    const timedOut = networkErr && (networkErr.name === 'TimeoutError' || networkErr.name === 'AbortError');
    const err = new Error(timedOut ? 'OpenRouter request timed out' : ('OpenRouter network error: ' + networkErr.message));
    err.status = 0;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok){
    const msg = (data && data.error && data.error.message) || ('OpenRouter API error ' + res.status);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  const choice = data.choices && data.choices[0];
  const text = choice && choice.message && choice.message.content;
  if (!text){
    /* openrouter/free occasionally returns HTTP 200 with an empty or
       reasoning-only response (no usable content) — treat that as a
       failure to report rather than silently succeeding with "". */
    const err = new Error('OpenRouter returned no usable content (empty or malformed response)');
    err.status = 502;
    throw err;
  }
  return text.trim();
}

/* Cheap, no-network check for /api/health — confirms the required key is
   present without spending a real (and possibly costly) API call. */
function isConfigured(){
  return !!process.env.OPENROUTER_API_KEY;
}

/**
 * @param {string} message  the user's latest message
 * @param {Array<{role:'user'|'assistant', content:string}>} history  prior turns, no system/persona included
 * @param {{system?: string}} [opts]  system prompt built by core/context.js
 * @returns {Promise<{text: string}>}
 */
async function chat(message, history, opts){
  const system = (opts && opts.system) || PERSONA;
  const messages = [{ role: 'system', content: system }]
    .concat(history || [])
    .concat([{ role: 'user', content: message }]);
  const text = await callChatCompletions(messages);
  return { text };
}

/**
 * @param {Buffer} imageBuffer  raw image bytes
 * @param {string} mimeType     e.g. 'image/jpeg'
 * @param {string} question     the user's question about the frame
 * @returns {Promise<{text: string}>}
 */
async function vision(imageBuffer, mimeType, question){
  const dataUrl = 'data:' + mimeType + ';base64,' + imageBuffer.toString('base64');
  const messages = [
    { role: 'system', content: PERSONA + VISION_SUFFIX },
    { role: 'user', content: [
      { type: 'text', text: question || 'Describe what you see.' },
      { type: 'image_url', image_url: { url: dataUrl } }
    ] }
  ];
  const text = await callChatCompletions(messages);
  return { text };
}

module.exports = { chat, vision, isConfigured };
