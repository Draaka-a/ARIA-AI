'use strict';

/* Same persona used by the other providers, kept in sync so ARIA sounds the
   same regardless of which AI path answered. */
const PERSONA = "You are ARIA, an onboard voice-and-vision assistant speaking through " +
  "text-to-speech inside a browser app. Reply in 1 to 3 short spoken sentences, plain " +
  "language, no markdown, no lists, no headers. Output ONLY the final spoken reply — " +
  "never show your reasoning, thinking process, or step-by-step analysis.";
const VISION_SUFFIX = " You are looking at one live camera frame. Answer in 1-2 short " +
  "spoken sentences. If you genuinely can't tell, say so plainly instead of guessing.";

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
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': 'Bearer ' + requireKey(),
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
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok){
    const msg = (data && data.error && data.error.message) || ('OpenRouter API error ' + res.status);
    throw new Error(msg);
  }
  const choice = data.choices && data.choices[0];
  const text = choice && choice.message && choice.message.content;
  return (text || '').trim();
}

/**
 * @param {string} message  the user's latest message
 * @param {Array<{role:'user'|'assistant', content:string}>} history  prior turns, no system/persona included
 * @returns {Promise<{text: string}>}
 */
async function chat(message, history){
  const messages = [{ role: 'system', content: PERSONA }]
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

module.exports = { chat, vision };
