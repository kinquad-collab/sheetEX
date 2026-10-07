// Browser smoke test (needs Playwright + Chromium): node tests/browser-smoke.js
// 1) normal page, every workspace; 2) inside a locked-down sandboxed iframe (like a strict LMS embed) where storage throws.
const path = require('path');
const fs = require('fs');
const os = require('os');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const DIST = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const cell = (r, c) => `td[data-r="${r}"][data-c="${c}"]`;
const SXread = (code) => require('./load.js')(['lessons.js']).lessons.readCert(code);

async function main() {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const failures = [];
  const check = (cond, msg) => { if (!cond) failures.push(msg); console.log((cond ? '  ok   ' : '  FAIL ') + msg); };

  // ---- 1. Normal page ----
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(DIST);
  await page.fill('.modal input', 'Tester Person'); await page.keyboard.press('Enter');
  for (const [card, plat] of [['.pc-xl365', 'xl365'], ['.pc-xl2013', 'xl2013'], ['.pc-gs', 'gs']]) {
    await page.click('.brand'); await page.click(card); await page.waitForSelector('.grid');
    await page.click('.sheet-tab:has-text("Scratch")');
    await page.click(cell(1, 1));
    await page.keyboard.type('=XLOOKUP("SKU-101",Products!A2:A25,Products!B2:B25)'); await page.keyboard.press('Enter');
    const t = await page.textContent(cell(1, 1));
    check(plat === 'xl2013' ? t === '#NAME?' : t === 'Granola Bar', plat + ': XLOOKUP shows ' + t);
    for (const tab of ['cheat', 'elsewhere', 'challenges']) { await page.click(`.sp-tab[data-id="${tab}"]`); }
  }
  await page.click('.brand'); await page.click('.pc-csv'); await page.waitForSelector('.csv-editor');
  await page.click('.file-open:has-text("broken_products.csv")');
  check(await page.isVisible('.pb-item'), 'csv: broken file reports a problem');
  await page.click('.brand'); await page.click('.pc-sql'); await page.waitForSelector('.sql-editor');
  await page.fill('.sql-editor', 'SELECT COUNT(*) FROM sales;'); await page.click('.tb-run');
  check((await page.textContent('.res-table')).includes('60'), 'sql: COUNT(*) FROM sales = 60');
  await page.click('.brand'); await page.click('.cmp-card'); await page.waitForSelector('.cmp-cards');
  check((await page.$$('.ew-card')).length === 3, 'compare: three result cards');
  // v2: Data Wrangling Lab, interactive cheat sheet, certificates
  const clearModals = () => page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()));
  await clearModals();
  await page.click('.brand'); await page.click('.pc-wrangle'); await page.waitForSelector('.grid');
  await page.waitForTimeout(400); await clearModals();
  await page.click(cell(1, 8)); await page.keyboard.type('=TEXT(C2,"0000")'); await page.keyboard.press('Enter');
  check((await page.textContent(cell(1, 8))) === '0104', 'wrangle: TEXT(C2,"0000") restores 0104');
  await page.waitForTimeout(700); await clearModals();
  await page.click('.brand'); await page.click('.pc-reference'); await page.waitForSelector('.ref-card');
  await page.fill('.ref-search', 'fake nulls');
  await page.click('.ref-card >> nth=0 >> .rt-gs >> text=▶ Run');
  check((await page.textContent('.ref-card >> nth=0 >> .rt-gs .ref-out')).includes('3'), 'cheat sheet: Sheets example runs');
  await page.evaluate(() => { SX.challenges.forPlat('compare').forEach((c) => { SX.ui.state.done[c.id] = { xp: c.xp, at: Date.now(), hints: 0 }; }); SX.ui.showCert('compare'); });
  await page.waitForSelector('.cert-paper');
  check((await page.textContent('.cert-name')) === 'Tester Person', 'certificate shows the student name');
  check(!!SXread(await page.inputValue('.cert-howto textarea')), 'certificate code is valid');
  check(errors.length === 0, 'no page errors (' + errors.join(' | ') + ')');

  // ---- 2. Locked-down iframe: scripts only, no same-origin -> localStorage throws ----
  const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');
  const wrapper = path.join(os.tmpdir(), 'sheetex-iframe-test.html');
  fs.writeFileSync(wrapper, '<!doctype html><title>LMS</title><h3>Pretend LMS page</h3><iframe id="f" sandbox="allow-scripts" style="width:1200px;height:700px" srcdoc="' +
    html.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"></iframe>');
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs2 = [];
  p2.on('pageerror', (e) => errs2.push(e.message));
  await p2.goto('file://' + wrapper);
  const frame = p2.frameLocator('#f');
  await frame.locator('.modal input').fill('Sandboxed');
  await frame.locator('.modal .btn-primary').click();
  await frame.locator('.pc-xl365').click();
  await frame.locator(cell(1, 0)).click();
  await p2.keyboard.type('=1+1'); await p2.keyboard.press('Enter');
  check((await frame.locator(cell(1, 0)).textContent()) === '2', 'sandboxed iframe: app works without storage');
  check(errs2.length === 0, 'sandboxed iframe: no page errors (' + errs2.join(' | ') + ')');

  await browser.close();
  if (failures.length) { console.error('\n' + failures.length + ' failure(s)'); process.exit(1); }
  console.log('\nBrowser smoke test passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
