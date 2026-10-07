'use strict';

/* Keyword retriever (BM25). One implementation of the retriever interface:
 *
 *   createRetriever(chunks) -> { name, search(query, k) -> [{ chunk, score }] }
 *
 * A semantic/embedding retriever can replace this file by exporting the same
 * createRetriever(); core/rag/index.js is the only caller. */
const { tokenize } = require('../text');

const K1 = 1.5;
const B = 0.75;
const MIN_COVERAGE = 0.6;   /* share of distinct query terms a chunk must contain */
const MIN_SCORE = 0.5;

function createRetriever(chunks) {
  const docs = chunks.map((c) => {
    const tokens = tokenize(c.text + ' ' + (c.section || '') + ' ' + (c.source || ''));
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    return { chunk: c, tf, len: tokens.length };
  });
  const N = docs.length;
  const avgLen = N ? docs.reduce((s, d) => s + d.len, 0) / N : 0;
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);

  function search(query, k) {
    const q = Array.from(new Set(tokenize(query)));
    if (!q.length || !N) return [];
    const results = [];
    for (const d of docs) {
      let score = 0, matched = 0;
      for (const t of q) {
        const f = d.tf.get(t);
        if (!f) continue;
        matched++;
        const n = df.get(t);
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * d.len / (avgLen || 1)));
      }
      if (matched / q.length >= MIN_COVERAGE && score >= MIN_SCORE) results.push({ chunk: d.chunk, score });
    }
    return results.sort((a, b) => b.score - a.score).slice(0, k || 3);
  }

  return { name: 'keyword-bm25', search };
}

module.exports = { createRetriever };
