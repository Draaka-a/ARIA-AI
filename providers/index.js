'use strict';

/**
 * Provider registry.
 *
 * Every provider module in this folder must export:
 *   chat(message, history) -> Promise<{ text: string }>
 *   vision(imageBuffer, mimeType, question) -> Promise<{ text: string }>
 *
 * To add a new provider later (OpenAI, a local model, whatever):
 *   1. Create providers/<name>.js implementing the same two functions.
 *   2. Set AI_PROVIDER=<name> in .env.
 * server.js and aria.html never need to change — they only know about
 * /api/chat and /api/vision, not which provider answers them.
 */
const name = process.env.AI_PROVIDER || 'anthropic';

let provider;
try {
  provider = require('./' + name);
} catch (e) {
  throw new Error(
    'Unknown AI_PROVIDER "' + name + '" — no providers/' + name + '.js file found.\n' +
    'Original error: ' + e.message
  );
}

if (typeof provider.chat !== 'function' || typeof provider.vision !== 'function') {
  throw new Error('providers/' + name + '.js must export both chat() and vision() functions.');
}

module.exports = provider;
