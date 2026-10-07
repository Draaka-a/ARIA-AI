'use strict';

/* Explicit memory commands, handled server-side BEFORE any LLM call so that
   "remember / forget" is deterministic and never depends on model behavior.
   handleCommand(text) -> { text } when handled, or null to continue to the LLM. */
const memory = require('./memory');
const { tokenize, detectLanguage } = require('./text');

const CONFIRM_TTL_MS = 60000;
let pendingClear = 0;   /* timestamp of an unconfirmed "clear memory" request */

const LEAD = '^\\s*(?:(?:hey\\s+)?aria[,!.\\s]+)?(?:please\\s+|tolong\\s+)?';
const RE = {
  clear: new RegExp(LEAD + '(?:clear|erase|wipe|delete|reset)\\s+(?:all\\s+|everything\\s+in\\s+)?(?:of\\s+)?(?:my\\s+)?(?:memory|memories)\\b|' +
    LEAD + '(?:forget|lupakan)\\s+(?:everything|all|semuanya|semua)\\s*(?:about me|tentang saya|tentang aku)?\\s*[.!]*$|' +
    LEAD + '(?:hapus|bersihkan|kosongkan|reset)\\s+(?:semua\\s+)?(?:memori|ingatan)(?:\\s+(?:saya|ku|aku))?\\s*[.!]*$', 'i'),
  list: new RegExp(LEAD + '(?:what\\s+do\\s+you\\s+(?:remember|know)|what\\s+(?:have\\s+you|did\\s+you)\\s+(?:remembered|stored|saved)|what\\s+is\\s+in\\s+(?:my\\s+)?memory|show\\s+(?:me\\s+)?(?:my\\s+)?memory|' +
    'apa\\s+(?:yang\\s+)?(?:kamu|anda)\\s+(?:ingat|tahu)|apa\\s+saja\\s+yang\\s+(?:kamu|anda)\\s+ingat|tampilkan\\s+memori)\\b(.*)$', 'i'),
  forget: new RegExp(LEAD + '(?:forget|lupakan|don\'?t\\s+remember|do\\s+not\\s+remember|jangan\\s+ingat)\\s+(?:about\\s+|that\\s+|bahwa\\s+|kalau\\s+|tentang\\s+)?(.+)$', 'i'),
  remember: new RegExp(LEAD + '(?:remember|ingat(?:kan)?|catat)\\s+(?:that\\s+|this:?\\s+|bahwa\\s+|kalau\\s+)?(.+)$', 'i'),
  yes: /^\s*(?:yes|yeah|yep|confirm(?:ed)?|proceed|ya|iya|lanjutkan|konfirmasi)\s*[.!]*\s*$/i
};

const T = {
  en: {
    saved: (t) => 'Stored. I will remember that ' + t + '.',
    dup: 'That information is already stored.',
    secret: 'I cannot store that. Credentials such as passwords, API keys and tokens are never kept in memory.',
    full: 'Memory is full. Please remove some entries first.',
    tooLong: 'That entry is too long. Please state it in a shorter form.',
    empty: 'There is nothing to store. Please state what you want me to remember.',
    none: 'No information is currently stored.',
    noneAbout: 'I have nothing stored that matches that.',
    listHead: (n, shown) => 'I have ' + n + (n === 1 ? ' item' : ' items') + ' stored' + (shown < n ? '. The most recent ' + shown + ' are: ' : ': '),
    forgotten: (t) => 'Removed from memory: ' + t + '.',
    forgetNone: 'I found no stored entry matching that.',
    forgetMany: (n) => 'That matches ' + n + ' stored entries. Please be more specific about which one to remove.',
    clearAsk: 'This will permanently erase all stored memory. Say yes to confirm.',
    cleared: (n) => 'Memory cleared. ' + n + (n === 1 ? ' entry was' : ' entries were') + ' removed.',
    clearNone: 'Memory is already empty.'
  },
  id: {
    saved: (t) => 'Tersimpan. Saya akan mengingat bahwa ' + t + '.',
    dup: 'Informasi tersebut sudah tersimpan.',
    secret: 'Saya tidak dapat menyimpannya. Kredensial seperti kata sandi, kunci API, dan token tidak pernah disimpan di memori.',
    full: 'Memori penuh. Mohon hapus beberapa entri terlebih dahulu.',
    tooLong: 'Entri tersebut terlalu panjang. Mohon sampaikan dalam bentuk yang lebih singkat.',
    empty: 'Tidak ada yang dapat disimpan. Mohon sebutkan apa yang harus saya ingat.',
    none: 'Saat ini tidak ada informasi yang tersimpan.',
    noneAbout: 'Tidak ada data tersimpan yang sesuai.',
    listHead: (n, shown) => 'Ada ' + n + ' item tersimpan' + (shown < n ? '. ' + shown + ' yang terbaru: ' : ': '),
    forgotten: (t) => 'Dihapus dari memori: ' + t + '.',
    forgetNone: 'Saya tidak menemukan entri tersimpan yang sesuai.',
    forgetMany: (n) => 'Terdapat ' + n + ' entri yang cocok. Mohon perjelas entri mana yang harus dihapus.',
    clearAsk: 'Tindakan ini akan menghapus seluruh memori secara permanen. Ucapkan ya untuk mengonfirmasi.',
    cleared: (n) => 'Memori dikosongkan. ' + n + ' entri dihapus.',
    clearNone: 'Memori sudah kosong.'
  }
};

function categorize(text) {
  if (/\b(i\s+prefer|i\s+like|i\s+want|i\s+don'?t\s+like|prefer|preference|suka|lebih\s+suka|ingin\s+selalu|saya\s+mau|aku\s+mau)\b/i.test(text)) return 'preferences';
  if (/\b(project|proyek|app|aplikasi|website|situs)\b/i.test(text)) return 'projects';
  if (/^\s*(?:note|catatan)\b/i.test(text)) return 'notes';
  return 'facts';
}

/* Forget targeting: an entry matches when it contains >= 60% of the content
   words in the request. Ambiguous (multiple) matches are never auto-deleted. */
function findForgetTargets(target) {
  const q = tokenize(target);
  if (!q.length) return [];
  const scored = memory.listMemory()
    .map((item) => ({ item, score: memory.matchScore(q, item.text) }))
    .filter((r) => r.score >= 0.6);
  if (!scored.length) return [];
  const best = Math.max(...scored.map((r) => r.score));
  return scored.filter((r) => r.score === best).map((r) => r.item);
}

function handleCommand(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;
  const t = T[detectLanguage(text)];

  if (pendingClear) {
    const fresh = Date.now() - pendingClear <= CONFIRM_TTL_MS;
    pendingClear = 0;
    if (fresh && RE.yes.test(text)) {
      const n = memory.clearMemory();
      return { text: t.cleared(n) };
    }
    /* anything else cancels the pending request and is processed normally */
  }

  if (RE.clear.test(text)) {
    if (!memory.listMemory().length) return { text: t.clearNone };
    pendingClear = Date.now();
    return { text: t.clearAsk };
  }

  let m = text.match(RE.list);
  if (m) {
    const topic = (m[1] || '').replace(/^\s*(?:about|tentang)\s+/i, '').replace(/[?.!]+$/, '').trim();
    const generic = !topic || /^(me|myself|saya|aku|us)$/i.test(topic);
    const items = generic ? memory.listMemory() : memory.searchMemory(topic.replace(/\b(my|saya|aku|ku)\b/gi, ''), 0.5);
    if (!items.length) return { text: generic ? t.none : t.noneAbout };
    const shown = Math.min(items.length, 8);
    const recent = items.slice(-shown);
    return { text: t.listHead(items.length, shown) + recent.map((i) => i.text).join('; ') + '.' };
  }

  m = text.match(RE.forget);
  if (m) {
    const targets = findForgetTargets(m[1]);
    if (!targets.length) return { text: t.forgetNone };
    if (targets.length > 1) return { text: t.forgetMany(targets.length) };
    memory.removeMemory([targets[0].id]);
    return { text: t.forgotten(targets[0].text) };
  }

  m = text.match(RE.remember);
  if (m) {
    const r = memory.addMemory(m[1], categorize(m[1]));
    if (!r.ok) return { text: ({ secret: t.secret, full: t.full, too_long: t.tooLong, empty: t.empty })[r.reason] || t.empty };
    return { text: r.duplicate ? t.dup : t.saved(r.item.text) };
  }
  return null;
}

module.exports = { handleCommand, categorize };
