#!/usr/bin/env node
'use strict';
/* Knowledge-base maintenance CLI (local use only; not exposed over HTTP).
     node scripts/ingest.js <file.md|file.txt> [...]   copy file(s) in and index them
     node scripts/ingest.js --sync                     index new/changed files in data/knowledge/documents/
     node scripts/ingest.js --rebuild                  re-index everything from scratch
     node scripts/ingest.js --list                     show indexed documents */
const rag = require('../core/rag');
const args = process.argv.slice(2);

if (!args.length || args[0] === '--sync') {
  console.log('Sync:', JSON.stringify(rag.sync(false)), JSON.stringify(rag.stats()));
} else if (args[0] === '--rebuild') {
  console.log('Rebuild:', JSON.stringify(rag.sync(true)), JSON.stringify(rag.stats()));
} else if (args[0] === '--list') {
  console.log(rag.listDocuments().join('\n') || '(no documents)');
  console.log(JSON.stringify(rag.stats()));
} else {
  for (const f of args) {
    try { const r = rag.addDocument(f); console.log('Added', r.name, JSON.stringify(r.summary)); }
    catch (e) { console.error('Skipped', f + ':', e.message); process.exitCode = 1; }
  }
}
