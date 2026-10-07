'use strict';
/* Test-only preload: replaces fetch() for the OpenRouter URL so the server can
   be exercised end-to-end without network access or an API key. The "LLM"
   echoes what it received, so tests can assert on the assembled context. */
const real = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('openrouter.ai')) {
    const body = JSON.parse(opts.body);
    const sys = body.messages[0].content;
    const last = body.messages[body.messages.length - 1];
    const info = {
      has_persona: sys.includes('You are ARIA'),
      has_memory: sys.includes('MEMORY ('),
      has_knowledge: sys.includes('KNOWLEDGE ('),
      knows_kestrel: sys.includes('KESTREL-4471'),
      knowledge_sources: (sys.match(/source: [^\s(]+/g) || []),
      mentions_indonesian: sys.includes('writing in Indonesian'),
      memory_lines: sys.split('\n').filter((l) => l.startsWith('- [')),
      history_len: body.messages.length - 2,
      sys_chars: sys.length,
      user: typeof last.content === 'string' ? last.content : '(non-text)'
    };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(info) } }] }) };
  }
  return real(url, opts);
};
