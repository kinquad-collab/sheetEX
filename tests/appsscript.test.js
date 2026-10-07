// Runs apps-script/Code.gs against small in-memory mocks of the Apps Script services.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const SEAL = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'seal.js'), 'utf8');

function makeEnv(page) {
  const props = {};
  const ctx = {
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: (k) => { delete props[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { getUuid: () => crypto.randomUUID() },
    Logger: { log() {} },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createHtmlOutputFromFile: () => ({ getContent: () => page }),
      createHtmlOutput: (html) => { const o = { html, setTitle: () => o, addMetaTag: () => o, setXFrameOptionsMode: (m) => { o.mode = m; return o; } }; return o; }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(CODE, ctx);
  return { ctx, props };
}
function sealFrom(src) { const c = { console }; c.globalThis = c; vm.createContext(c); vm.runInContext(src, c); return c.SX.seal; }

test('doGet allows iframe embedding and injects one class key', () => {
  const { ctx, props } = makeEnv('<script>' + SEAL + '</script>');
  const out = ctx.doGet();
  assert.strictEqual(out.mode, 'ALLOWALL');
  assert.ok(!out.html.includes('__SX_CLASS_KEY__'));
  assert.ok(out.html.includes("'" + props.SHEETEX_CLASS_KEY + "'"));
  assert.match(props.SHEETEX_CLASS_KEY, /^[0-9a-f]{32}$/);
  assert.strictEqual(ctx.doGet().html, out.html, 'key is stable between visits');
});

test('anything sealed by another copy of SheetEX is rejected by the deployment', () => {
  const { ctx } = makeEnv(SEAL);
  const deployed = sealFrom(ctx.doGet().html), publicCopy = sealFrom(SEAL);
  assert.ok(!deployed.isDefaultKey()); assert.ok(publicCopy.isDefaultKey());
  const forged = publicCopy.pack('SXC2', { n: 'Ana Ruiz' });
  assert.strictEqual(deployed.unpack('SXC2', forged).ok, false);
  assert.strictEqual(deployed.unpack('SXC2', deployed.pack('SXC2', { n: 'Ana Ruiz' })).ok, true);
});

test('newClassKey invalidates everything sealed before', () => {
  const { ctx } = makeEnv(SEAL);
  const before = sealFrom(ctx.doGet().html), code = before.pack('SXP2', { x: 1 });
  ctx.newClassKey();
  assert.strictEqual(sealFrom(ctx.doGet().html).unpack('SXP2', code).ok, false);
});

test('no student data can leave the browser', () => {
  for (const svc of ['SpreadsheetApp', 'DriveApp', 'DocumentApp', 'UrlFetchApp', 'MailApp', 'GmailApp', 'Session.getActiveUser', 'CacheService'])
    assert.ok(!CODE.includes(svc), 'Code.gs must not use ' + svc);
  assert.deepStrictEqual(CODE.match(/^function \w+/gm).map((s) => s.slice(9)), ['doGet', 'classKey_', 'newClassKey']);
  const app = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Index.html'), 'utf8');
  for (const s of ['google.script', 'fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'http://', 'https://'])
    assert.ok(!app.includes(s), 'student app must not contain ' + s);
  assert.strictEqual(app.split('__SX_CLASS_KEY__').length, 2, 'exactly one class-key marker in the app');
});
