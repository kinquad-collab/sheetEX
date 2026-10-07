// Sealed codes, the locked name, and the sealed save — the parts that stop students from editing their way to a certificate.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FILES = ['data.js', 'seal.js', 'formula.js', 'engine.js', 'workbook.js', 'mldata.js', 'sql.js', 'platforms.js', 'csv.js', 'wrangle.js', 'certtest.js',
  'challenges.js', 'lessons.js', 'ui-core.js', 'ui-cert.js'];
// Load the app (minus the DOM) with a fake localStorage, like a fresh browser.
function boot(storage, classKey) {
  const store = storage || {};
  const ctx = { console, window: { localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }, crypto: require('crypto').webcrypto } };
  ctx.globalThis = ctx;
  ctx.setTimeout = (fn) => fn(); ctx.clearTimeout = () => {};
  vm.createContext(ctx);
  for (const f of FILES) {
    let src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8');
    if (classKey && f === 'seal.js') src = src.replace('__SX_CLASS_KEY__', classKey);
    vm.runInContext(src, ctx, { filename: f });
  }
  return { SX: ctx.SX, UI: ctx.SX.ui, store };
}

test('certificate codes round-trip, and every kind of tampering is refused', () => {
  const { SX } = boot();
  const L = SX.lessons;
  const cert = { name: 'Jordan Smith', sid: 'abcdefghijkl', lesson: 'wr1', xp: 200, maxXp: 225, hints: 2, count: 11, score: 9, of: 10, attempts: 2, secs: 600, time: 1790000000000 };
  const code = L.certCode(cert);
  const back = L.readCert(code);
  assert.ok(back.ok); assert.strictEqual(back.cert.name, 'Jordan Smith'); assert.strictEqual(back.cert.score, 9); assert.strictEqual(back.cert.attempts, 2);
  // swap in a different payload with the old signature
  const [head, sig] = code.split('.');
  const other = L.certCode(Object.assign({}, cert, { name: 'Casey Wright' })).split('.')[0];
  assert.strictEqual(L.readCert(other + '.' + sig).ok, false);
  // edit the JSON inside and re-encode it without the key
  const json = JSON.parse(SX.seal.fromUtf8(SX.seal.unb64u(head.slice(5)))); json.n = 'Casey Wright';
  assert.strictEqual(L.readCert('SXC2-' + SX.seal.b64u(SX.seal.utf8(JSON.stringify(json))) + '.' + sig).ok, false);
  // flip one character anywhere
  for (const i of [6, 20, code.length - 3]) assert.strictEqual(L.readCert(code.slice(0, i) + (code[i] === 'A' ? 'B' : 'A') + code.slice(i + 1)).ok, false);
  // a correctly signed code with the wrong shape is still refused (exact format)
  assert.strictEqual(L.readCert(SX.seal.pack('SXC2', Object.assign({ extra: 1 }, JSON.parse(JSON.stringify(json))))).ok, false);
  assert.strictEqual(L.readCert(SX.seal.pack('SXC2', { n: 'A B', i: 'abcdefghijkl', l: 'wr1', x: 999, m: 10, h: 0, c: 1, s: 1, q: 1, a: 1, d: 1, t: 1790000000000 })).ok, false, 'xp above max');
  // a progress code is not a certificate
  assert.match(L.readCert(SX.seal.pack('SXP2', json)).why, /different kind/);
  assert.ok(L.readCert(L.certCode(Object.assign({}, cert, { name: 'José Núñez' }))).cert.name === 'José Núñez');
  // whitespace and line breaks from Canvas are tolerated
  assert.ok(L.readCert(code.slice(0, 30) + '\n  ' + code.slice(30)).ok);
});

test('codes made by another deployment (different class key) are refused', () => {
  const a = boot(null, 'classA00000000000000000000000000'), b = boot(null, 'classB00000000000000000000000000');
  const cert = { name: 'Jordan Smith', sid: 'abcdefghijkl', lesson: 'sql', xp: 1, maxXp: 2, hints: 0, count: 1, score: 8, of: 10, attempts: 1, secs: 1, time: 1790000000000 };
  assert.ok(a.SX.lessons.readCert(a.SX.lessons.certCode(cert)).ok);
  assert.strictEqual(b.SX.lessons.readCert(a.SX.lessons.certCode(cert)).ok, false);
  a.UI.setIdentity('Jordan Smith');
  assert.strictEqual(b.UI.readProgressFile(a.UI.progressFileText()).ok, false, 'a file from another deployment is refused');
});

test('names: first + last required, then locked forever', () => {
  const { UI } = boot();
  for (const bad of ['', 'Jo', 'Jordan', 'Jordan 5mith', '<b>Jo</b> X', 'x'.repeat(41) + ' y']) assert.strictEqual(UI.validName(bad), null, bad);
  assert.strictEqual(UI.validName('  Mary-Kate   O\'Neil '), "Mary-Kate O'Neil");
  assert.ok(UI.setIdentity('Jordan Smith'));
  assert.strictEqual(UI.setIdentity('Casey Wright'), false);
  assert.throws(() => { 'use strict'; UI.state.name = 'Casey Wright'; });
  UI.state.name = 'x'; // sloppy-mode assignment is silently ignored too
  assert.strictEqual(UI.state.name, 'Jordan Smith');
  assert.throws(() => Object.defineProperty(UI.state, 'name', { value: 'Casey' }));
  assert.match(UI.state.sid, /^[A-Za-z0-9_-]{12}$/);
});

test('progress file: one sealed JSON file restores everything, and any edit is refused', () => {
  const a = boot();
  a.UI.setIdentity('Jordan Smith');
  a.UI.state.xp = 120; a.UI.state.done['365-sum'] = { xp: 10, hints: 1, at: 1790000000000 };
  a.UI.state.tests.xl365 = { attempts: 2, best: 9, of: 10, passed: 1790000000000, passScore: 9, passAttempt: 2, passSecs: 300, secs: 300, open: 0, lastFail: 0 };
  a.SX.challenges.forPlat('xl365').forEach((c) => { a.UI.state.done[c.id] = a.UI.state.done[c.id] || { xp: c.xp, hints: 0 }; });
  a.UI.issueCert('xl365');
  a.UI.state.wb.xl365 = { marker: 'my spreadsheet work' };
  a.UI.state.files = { 'notes.csv': 'a,b\n1,2\n' };
  a.UI.state.visited = { xl365: true, ml: 1790000000000 }; a.UI.state.badges.certified = 1790000000000;
  a.UI.state.stats.compatSeen = { '=XLOOKUP(A1,B:B,C:C)': 1 }; a.UI.state.hints['365-sum'] = 1; a.UI.state.wrong['365-sum'] = 2;
  const text = a.UI.progressFileText();
  const file = JSON.parse(text);
  // human-readable and self-describing
  assert.strictEqual(file.student, 'Jordan Smith');
  assert.strictEqual(file.summary.certificates[0].test, '9/10');
  assert.strictEqual(file.summary.certificates[0].attempt, 2);
  assert.ok(text.startsWith('{\n  "app": "SheetEX",'));
  // a fresh computer becomes Jordan, with all of the work
  const b = boot();
  const r = b.UI.restoreFromFile(text);
  assert.ok(r.ok, r.why);
  assert.strictEqual(b.UI.state.name, 'Jordan Smith'); assert.strictEqual(b.UI.state.xp, 120);
  assert.ok(b.UI.lessonCertified('xl365'));
  assert.strictEqual(b.UI.state.wb.xl365.marker, 'my spreadsheet work');
  assert.strictEqual(b.UI.state.files['notes.csv'], 'a,b\n1,2\n');
  assert.throws(() => { 'use strict'; b.UI.state.name = 'Casey Wright'; });
  // Windows line endings / a trailing newline from a text editor are fine
  assert.ok(boot().UI.readProgressFile(text.replace(/\n/g, '\r\n')).ok);
  // Casey (name already set) cannot load Jordan's file
  const c = boot(); c.UI.setIdentity('Casey Wright');
  const rc = c.UI.restoreFromFile(text);
  assert.strictEqual(rc.ok, false); assert.ok(rc.other); assert.strictEqual(c.UI.state.name, 'Casey Wright');
  // the same student on another computer: merge, never lower
  const d = boot(); d.UI.restoreFromFile(text); d.UI.state.xp = 500;
  assert.ok(d.UI.restoreFromFile(text).merged); assert.strictEqual(d.UI.state.xp, 500);
  // every kind of edit is refused
  const edits = {
    'name in the summary': text.replace('"student": "Jordan Smith"', '"student": "Casey Wright"'),
    'name everywhere': text.split('Jordan Smith').join('Casey Wright'),
    'xp': text.replace('"xp": 120', '"xp": 9999'),
    'test score': text.replace('"test": "9/10"', '"test": "10/10"'),
    'one space': text.replace('"app": "SheetEX"', '"app":  "SheetEX"'),
    're-indented': JSON.stringify(file, null, 4),
    'minified': JSON.stringify(file),
    'seal': text.replace(/"seal": "(.)/, (m, ch) => '"seal": "' + (ch === 'A' ? 'B' : 'A')),
    'extra field': text.replace('"app": "SheetEX",', '"app": "SheetEX",\n  "admin": true,'),
    'not json': text.slice(0, 200),
    'empty': ''
  };
  for (const [what, t] of Object.entries(edits)) assert.strictEqual(boot().UI.readProgressFile(t).ok, false, what + ' should be refused');
  // re-sealing an edited file with the (public) default key of ANOTHER deployment still fails on this one
  const other = boot(null, 'classZ00000000000000000000000000');
  assert.strictEqual(other.UI.readProgressFile(text).ok, false);
  // a correctly sealed file with an impossible shape is refused (exact format)
  const bad = JSON.parse(text); delete bad.seal; bad.progress.done['not-a-challenge'] = { xp: 1, hints: 0 };
  bad.seal = a.SX.seal.mac('file|' + JSON.stringify(bad));
  assert.match(boot().UI.readProgressFile(JSON.stringify(bad, null, 2) + '\n').why, /exact format/);
});

test('the saved game is sealed: editing localStorage throws the save away', () => {
  const a = boot();
  a.UI.setIdentity('Jordan Smith'); a.UI.state.xp = 40; a.UI.saveNow();
  const saved = a.store['sheetex.v2'];
  // reloading the untouched save works and keeps the lock
  const b = boot({ 'sheetex.v2': saved });
  assert.strictEqual(b.UI.state.name, 'Jordan Smith'); assert.strictEqual(b.UI.state.xp, 40); assert.strictEqual(b.UI.loadNotice, null);
  assert.throws(() => { 'use strict'; b.UI.state.name = 'Casey Wright'; });
  // edit the name in storage → refused
  const o = JSON.parse(saved); o.core = o.core.replace('Jordan Smith', 'Casey Wright');
  const c = boot({ 'sheetex.v2': JSON.stringify(o) });
  assert.strictEqual(c.UI.state.name, ''); assert.ok(c.UI.loadNotice);
  // add XP in storage → refused
  const o2 = JSON.parse(saved); o2.core = o2.core.replace('"xp":40', '"xp":4000');
  assert.strictEqual(boot({ 'sheetex.v2': JSON.stringify(o2) }).UI.state.xp, 0);
  // spreadsheets are not sealed (editing them gains nothing) and still load
  const o3 = JSON.parse(saved); o3.ui = { last: 'sql' };
  assert.strictEqual(boot({ 'sheetex.v2': JSON.stringify(o3) }).UI.state.ui.last, 'sql');
});

test('a certificate needs the practice AND a passed test', () => {
  const { SX, UI } = boot();
  UI.setIdentity('Jordan Smith');
  SX.challenges.forPlat('csv').forEach((c) => { UI.state.done[c.id] = { xp: c.xp, hints: 0 }; });
  assert.ok(UI.lessonComplete('csv'));
  assert.strictEqual(UI.lessonCertified('csv'), false);
  UI.state.tests.csv = { attempts: 1, best: 8, of: 10, passed: Date.now(), passScore: 8, passAttempt: 1, passSecs: 400, secs: 400 };
  assert.ok(UI.lessonCertified('csv'));
  const cert = UI.issueCert('csv');
  const back = SX.lessons.readCert(UI.state.certs.csv.code);
  assert.ok(back.ok); assert.strictEqual(back.cert.name, 'Jordan Smith'); assert.strictEqual(back.cert.score, 8); assert.strictEqual(back.cert.sid, UI.state.sid);
  assert.strictEqual(cert.count, SX.challenges.forPlat('csv').length);
});
