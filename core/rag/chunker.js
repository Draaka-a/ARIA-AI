'use strict';

/* Splits normalized text into paragraph-aligned chunks and tracks the nearest
   Markdown heading as "section" metadata. */

const TARGET = 600;   /* preferred chunk size, characters */
const MAX = 900;      /* hard ceiling per chunk */

function normalize(text) {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitLong(par) {
  if (par.length <= MAX) return [par];
  const out = [];
  const sentences = par.match(/[^.!?\n]+[.!?]*\s*/g) || [par];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + s).length > TARGET) { out.push(cur.trim()); cur = ''; }
    cur += s;
    while (cur.length > MAX) { out.push(cur.slice(0, MAX).trim()); cur = cur.slice(MAX); }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* -> [{ text, section }] */
function chunkText(raw) {
  const text = normalize(raw);
  if (!text) return [];
  const chunks = [];
  let section = '';
  let cur = '';
  let curSection = '';
  const flush = () => {
    if (cur.trim()) chunks.push({ text: cur.trim(), section: curSection });
    cur = '';
  };
  for (const block of text.split(/\n{2,}/)) {
    const heading = block.match(/^#{1,6}\s+(.+)$/m);
    if (heading && /^#{1,6}\s/.test(block)) section = heading[1].trim();
    for (const piece of splitLong(block)) {
      if (cur && (cur.length + piece.length + 2) > TARGET) flush();
      if (!cur) curSection = section;
      cur += (cur ? '\n\n' : '') + piece;
    }
  }
  flush();
  return chunks;
}

module.exports = { chunkText, normalize };
