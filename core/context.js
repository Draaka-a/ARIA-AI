'use strict';

/* Central context builder.
     system  = persona + [language note] + [memory block] + [knowledge block]
     history = sanitized, bounded recent turns
   Both providers call buildContext(); nothing else assembles prompts. */
const { PERSONA } = require('./persona');
const memory = require('./memory');
const rag = require('./rag');
const { detectLanguage } = require('./text');

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 1000;
const MAX_MESSAGE_CHARS = 4000;

function sanitizeHistory(history) {
  const clean = [];
  for (const h of Array.isArray(history) ? history : []) {
    if (!h || (h.role !== 'user' && h.role !== 'assistant') || typeof h.content !== 'string') continue;
    const content = h.content.trim().slice(0, MAX_HISTORY_CHARS);
    if (content) clean.push({ role: h.role, content });
  }
  let recent = clean.slice(-MAX_HISTORY_MESSAGES);
  while (recent.length && recent[0].role !== 'user') recent.shift();   /* providers expect a user-first thread */
  return recent;
}

/* -> { system, history, message, meta:{ memoryUsed, sources[], language } } */
function buildContext(message, history) {
  const msg = String(message || '').slice(0, MAX_MESSAGE_CHARS);
  const language = detectLanguage(msg);
  const parts = [PERSONA];
  if (language === 'id') parts.push('The user is currently writing in Indonesian. Reply in formal Indonesian.');

  let memoryBlock = '';
  let hits = [];
  try { memoryBlock = memory.formatMemoryForPrompt(msg); } catch (e) { console.error('[context] memory failed:', e.message); }
  try { hits = rag.searchKnowledge(msg); } catch (e) { console.error('[context] rag failed:', e.message); }
  const knowledgeBlock = rag.formatKnowledgeForPrompt(hits);

  if (memoryBlock) parts.push(memoryBlock);
  if (knowledgeBlock) parts.push(knowledgeBlock);

  return {
    system: parts.join('\n\n'),
    history: sanitizeHistory(history),
    message: msg,
    meta: { memoryUsed: !!memoryBlock, sources: Array.from(new Set(hits.map((h) => h.source))), language }
  };
}

module.exports = { buildContext, sanitizeHistory };
