'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');
process.env.ARIA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aria-test-'));
fs.cpSync(path.join(__dirname, '..', 'data', 'knowledge', 'documents'), path.join(process.env.ARIA_DATA_DIR, 'knowledge', 'documents'), { recursive: true });

const assert = require('assert');
const memory = require('../core/memory');
const { handleCommand } = require('../core/commands');
const rag = require('../core/rag');
const { buildContext, sanitizeHistory } = require('../core/context');
const paths = require('../core/paths');
let pass = 0; const ok = (name, fn) => { try { fn(); pass++; console.log('PASS', name); } catch (e) { console.log('FAIL', name, '-', e.message); process.exitCode = 1; } };

/* ---- memory commands ---- */
ok('remember stores', () => { const r = handleCommand('Remember that my project is called ARIA.'); assert(/Stored/.test(r.text)); assert.strictEqual(memory.listMemory().length, 1); });
ok('duplicate not re-added', () => { const r = handleCommand('remember that my project is called ARIA'); assert(/already stored/.test(r.text)); assert.strictEqual(memory.listMemory().length, 1); });
ok('categorized as projects', () => assert.strictEqual(memory.listMemory()[0].category, 'projects'));
ok('preference category', () => { handleCommand('Remember that I prefer concise technical explanations'); assert(memory.listMemory().some((i) => i.category === 'preferences')); });
ok('persisted on disk', () => assert(fs.existsSync(paths.MEMORY_FILE)));
ok('survives "restart" (fresh load from disk)', () => { delete require.cache[require.resolve('../core/memory')]; const m2 = require('../core/memory'); assert.strictEqual(m2.listMemory().length, 2); });
ok('what do you remember (all)', () => { const r = handleCommand('What do you remember about me?'); assert(/2 items/.test(r.text) && /ARIA/.test(r.text), r.text); });
ok('what do you remember about my project', () => { const r = handleCommand('What do you remember about my project?'); assert(/ARIA/.test(r.text) && !/concise/.test(r.text), r.text); });
ok('indonesian remember + reply language', () => { const r = handleCommand('Ingat bahwa aku suka kopi hitam'); assert(/Tersimpan/.test(r.text), r.text); });
ok('indonesian list', () => { const r = handleCommand('Apa yang kamu ingat tentang aku?'); assert(/3 item/.test(r.text), r.text); });
ok('secrets rejected: api key', () => { const r = handleCommand('Remember that my API key is sk-or-v1-abcdef1234567890abcdef'); assert(/cannot store/.test(r.text)); });
ok('secrets rejected: password', () => { const r = handleCommand('remember my password is hunter2'); assert(/cannot store/.test(r.text)); });
ok('secrets rejected: id', () => { const r = handleCommand('ingat bahwa kata sandi wifi saya rahasia123'); assert(/tidak dapat menyimpan/i.test(r.text), r.text); });
ok('secrets not in file', () => { const raw = fs.readFileSync(paths.MEMORY_FILE, 'utf8'); assert(!/sk-or|hunter2|rahasia123/.test(raw)); });
ok('forget removes', () => { const r = handleCommand('Forget that my project is called ARIA'); assert(/Removed/.test(r.text), r.text); assert(!memory.listMemory().some((i) => /ARIA/.test(i.text))); });
ok('forget unknown', () => { const r = handleCommand('Forget that my cat is named Miso'); assert(/no stored entry/.test(r.text), r.text); });
ok("don't remember", () => { handleCommand('remember that my favorite color is teal'); const r = handleCommand("Don't remember that my favorite color is teal"); assert(/Removed/.test(r.text), r.text); });
ok('ambiguous forget is not auto-deleted', () => { handleCommand('remember that my sister likes tea'); handleCommand('remember that my sister likes chess'); const before = memory.listMemory().length; const r = handleCommand('forget my sister'); assert(/more specific/.test(r.text), r.text); assert.strictEqual(memory.listMemory().length, before); });
ok('clear needs confirmation', () => { const before = memory.listMemory().length; const r = handleCommand('Clear my memory'); assert(/confirm/.test(r.text)); assert.strictEqual(memory.listMemory().length, before); });
ok('clear cancelled by other input', () => { handleCommand('Clear my memory'); assert.strictEqual(handleCommand('hello there'), null); assert.strictEqual(handleCommand('yes'), null); assert(memory.listMemory().length > 0); });
ok('clear confirmed', () => { handleCommand('Clear my memory'); const r = handleCommand('yes'); assert(/cleared/.test(r.text)); assert.strictEqual(memory.listMemory().length, 0); });
ok('normal chat is not a command', () => { assert.strictEqual(handleCommand('Do you remember when we met?'), null); assert.strictEqual(handleCommand('What time is it?'), null); });

/* ---- RAG ---- */
ok('rag indexes sample doc', () => { const s = rag.stats(); assert(s.documents >= 1 && s.chunks >= 1, JSON.stringify(s)); });
ok('rag retrieves unique fact + source', () => { const h = rag.searchKnowledge('What is the launch code of Project Zephyrine?'); assert(h.length && /KESTREL-4471/.test(h[0].text) && h[0].source === 'ARIA_TEST_DOCUMENT.md', JSON.stringify(h)); });
ok('rag returns nothing for unrelated question', () => { assert.strictEqual(rag.searchKnowledge('What is the capital of France?').length, 0); assert.strictEqual(rag.searchKnowledge('How do I bake sourdough bread?').length, 0); });
ok('rag: one generic shared word is not enough', () => { assert.strictEqual(rag.searchKnowledge('What is my project called?').length, 0); assert.strictEqual(rag.searchKnowledge('Tell me about my project plans').length, 0); });
ok('rag skips unchanged files on re-sync', () => { const s = rag.sync(false); assert.strictEqual(s.unchanged >= 1 && s.added + s.updated, 0, JSON.stringify(s)); });
ok('rag picks up new + removed files', () => { const f = path.join(paths.DOCS_DIR, 'extra.txt'); fs.writeFileSync(f, 'The Marlowe Protocol requires two keys held by separate officers.'); let s = rag.sync(false); assert.strictEqual(s.added, 1); assert(rag.searchKnowledge('Marlowe Protocol keys').length); fs.unlinkSync(f); s = rag.sync(false); assert.strictEqual(s.removed, 1); assert.strictEqual(rag.searchKnowledge('Marlowe Protocol keys').length, 0); });
ok('rag ignores non-txt/md, hidden, symlinks', () => { fs.writeFileSync(path.join(paths.DOCS_DIR, 'x.exe'), 'zzz'); fs.writeFileSync(path.join(paths.DOCS_DIR, '.hidden.md'), 'zzz'); fs.symlinkSync('/etc/passwd', path.join(paths.DOCS_DIR, 'link.txt')); const l = rag.listDocuments(); assert(!l.includes('x.exe') && !l.includes('.hidden.md') && !l.includes('link.txt'), l.join()); });
ok('addDocument sanitizes name + rejects bad type', () => { const tmp = path.join(os.tmpdir(), 'my doc (1).md'); fs.writeFileSync(tmp, '# T\nhello'); const r = rag.addDocument(tmp); assert(/^[A-Za-z0-9._-]+$/.test(r.name), r.name); assert.throws(() => rag.addDocument('/etc/passwd')); });
ok('path helpers block traversal', () => { assert.strictEqual(paths.sanitizeFilename('../../etc/passwd'), 'passwd'); assert(!paths.isInside(paths.DOCS_DIR, path.join(paths.DOCS_DIR, '..', '..', 'x'))); assert(paths.isInside(paths.DOCS_DIR, path.join(paths.DOCS_DIR, 'a.md'))); });

/* ---- context builder ---- */
ok('context: persona always, no blocks when irrelevant', () => { const c = buildContext('Wkwkwk', []); assert(c.system.includes('You are ARIA')); assert(!c.meta.memoryUsed && !c.meta.sources.length); });
ok('context: knowledge block when relevant', () => { const c = buildContext('Who is the lead engineer of Project Zephyrine?', []); assert(c.meta.sources.includes('ARIA_TEST_DOCUMENT.md') && c.system.includes('Orla Venmark')); });
ok('context: memory block relevant only', () => { memory.addMemory('my project is called ARIA', 'projects'); memory.addMemory('my dog is named Miso', 'facts'); const c = buildContext('what is my project name', []); assert(c.system.includes('called ARIA') && !c.system.includes('Miso'), c.system); });
ok('context: indonesian note', () => assert(buildContext('Tolong jelaskan apa itu variabel', []).system.includes('formal Indonesian')));
ok('context: history bounded + sanitized', () => { const h = []; for (let i = 0; i < 40; i++) h.push({ role: i % 2 ? 'assistant' : 'user', content: 'm' + i + 'x'.repeat(2000) }); h.push({ role: 'system', content: 'evil' }, { role: 'user', content: 5 }); const s = sanitizeHistory(h); assert(s.length <= 12 && s[0].role === 'user' && s.every((m) => m.content.length <= 1000 && m.role !== 'system')); });
ok('context: bounded size with many memories + chunks', () => { for (let i = 0; i < 50; i++) memory.addMemory('project note number ' + i + ' about zephyrine launches', 'projects'); const c = buildContext('zephyrine project launches', []); assert(c.system.length < 7000, 'system chars ' + c.system.length); });

console.log('\n' + pass + ' checks passed' + (process.exitCode ? ' — WITH FAILURES' : ''));
