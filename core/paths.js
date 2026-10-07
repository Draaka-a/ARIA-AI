'use strict';

/* Fixed storage locations + path-safety helpers.
   Memory and RAG may ONLY touch the directories below. Nothing here accepts a
   path from the browser or from the LLM. */
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = process.env.ARIA_DATA_DIR ? path.resolve(process.env.ARIA_DATA_DIR) : path.join(ROOT, 'data');

const MEMORY_DIR = path.join(DATA_DIR, 'memory');
const MEMORY_FILE = path.join(MEMORY_DIR, 'user.json');
const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge');
const DOCS_DIR = path.join(KNOWLEDGE_DIR, 'documents');
const INDEX_DIR = path.join(KNOWLEDGE_DIR, 'index');
const INDEX_FILE = path.join(INDEX_DIR, 'index.json');

/* Reduces any user-supplied name to a plain, safe file name: no directories,
   no traversal, no hidden files, limited character set. Returns '' if nothing
   usable is left. */
function sanitizeFilename(name) {
  const base = path.basename(String(name || '').replace(/\\/g, '/'));
  const cleaned = base
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 100);
  return cleaned;
}

/* True only if `target` resolves to a location strictly inside `dir`. */
function isInside(dir, target) {
  const rel = path.relative(path.resolve(dir), path.resolve(target));
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function assertInside(dir, target) {
  if (!isInside(dir, target)) throw new Error('Path is outside the permitted directory.');
  return path.resolve(target);
}

module.exports = {
  ROOT, DATA_DIR, MEMORY_DIR, MEMORY_FILE, KNOWLEDGE_DIR, DOCS_DIR, INDEX_DIR, INDEX_FILE,
  sanitizeFilename, isInside, assertInside
};
