// Runs apps-script/Code.gs against small in-memory mocks of the Apps Script services.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

function makeEnv() {
  const props = {};
  const books = {};
  function Sheet(name) {
    this.name = name; this.rows = [];
    this.setName = (n) => { this.name = n; };
    this.appendRow = (r) => { this.rows.push(r.slice()); };
    this.setFrozenRows = () => {}; this.hideColumns = () => {};
    this.getLastRow = () => this.rows.length;
    this.getRange = (a, b, nr, nc) => {
      if (typeof a === 'string') return { setFontWeight() {} };
      const sheet = this;
      return {
        getValues: () => sheet.rows.slice(a - 1, a - 1 + nr).map((r) => r.slice(b - 1, b - 1 + nc)),
        setValues: (v) => { v.forEach((row, i) => { sheet.rows[a - 1 + i] = row.slice(); }); }
      };
    };
  }
  let n = 0;
  const ctx = {
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    SpreadsheetApp: {
      create: (title) => {
        const id = 'book' + (++n), sheets = [new Sheet('Sheet1')];
        const ss = { id, title, sheets, getId: () => id, getUrl: () => 'https://docs.google.com/' + id,
          getSheets: () => sheets, insertSheet: (nm) => { const s = new Sheet(nm); sheets.push(s); return s; },
          getSheetByName: (nm) => sheets.find((s) => s.name === nm) };
        books[id] = ss; return ss;
      },
      openById: (id) => { if (!books[id]) throw new Error('gone'); return books[id]; }
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b))
    },
    Logger: { log() {} },
    HtmlService: { XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }, createHtmlOutputFromFile: () => { const o = { setTitle: () => o, addMetaTag: () => o, setXFrameOptionsMode: (m) => { o.mode = m; return o; } }; return o; } }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
  return { ctx, books };
}

test('doGet allows iframe embedding', () => {
  const { ctx } = makeEnv();
  assert.strictEqual(ctx.doGet().mode, 'ALLOWALL');
});
test('certificates are appended to the gradebook, formula injection blocked', () => {
  const { ctx, books } = makeEnv();
  ctx.sxRecordCertificate({ name: '=HYPERLINK("x")', lesson: 'Data Wrangling I', lessonId: 'wr1', xp: 200, maxXp: 225, hints: 2, challenges: 11, code: 'SXC1-abc_-x-k3j' });
  const rows = books.book1.getSheetByName('Certificates').rows;
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[1][1], '\'=HYPERLINK("x")');
  assert.strictEqual(rows[1][4], 200);
  assert.throws(() => ctx.sxRecordCertificate({ code: 'not a code' }));
});
test('save/load progress by name + PIN, case-insensitive name, wrong PIN fails', () => {
  const { ctx, books } = makeEnv();
  assert.ok(ctx.sxSaveProgress('Jordan Smith', '1234', 'SX1-AAAA-abc').ok);
  assert.ok(ctx.sxSaveProgress('jordan  smith', '1234', 'SX1-BBBB-def').ok); // overwrites same student
  assert.strictEqual(books.book1.getSheetByName('Saves').rows.length, 2);
  const r = ctx.sxLoadProgress('JORDAN SMITH', '1234');
  assert.ok(r.ok); assert.strictEqual(r.code, 'SX1-BBBB-def');
  assert.strictEqual(ctx.sxLoadProgress('Jordan Smith', '9999').ok, false);
  assert.throws(() => ctx.sxSaveProgress('Jordan', '1234', 'SX1-AAAA-abc'), /first and last/);
  assert.throws(() => ctx.sxSaveProgress('Jordan Smith', '12', 'SX1-AAAA-abc'), /PIN/);
  assert.throws(() => ctx.sxSaveProgress('Jordan Smith', '1234', '<script>'));
});
