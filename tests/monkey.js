// Stress test: random + hostile input everywhere. Fails on any page error, engine "Internal error",
// or a single action slower than 1.5 s.   node tests/monkey.js [steps]
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const DIST = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const STEPS = +process.argv[2] || 400;
let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (a) => a[Math.floor(rnd() * a.length)];

const FORMULAS = [
  '=SUM(', '=SUM(1,,2)+', '="unclosed', '=1/0', '=A1', '=B2+B3', '=A1:A10', '=A:A', '=SUM(A:Z)', '=Products!Z999',
  "='My Sheet'!A1", '=NoSheet!A1', '=#REF!+1', '={1,2;3,4}', '={1,2;3}', '=A1#', '=@A1:A5', '=A2:A', '=SEQUENCE(1000)',
  '=SEQUENCE(200,30)', '=SEQUENCE(5,5)', '=LET(x,1)', '=LET(x,1,y,x+1,y*2)', '=CHOOSE(5,1,2)', '=INDEX(A:A,0)',
  '=TEXT(1,"")', '=REPT("ab",5000)', '=XLOOKUP(1,A:A,B:B)', '=FILTER(A1:A5,A1:A5>0)', '=SORT(A1:C5,9,-1)',
  '=UNIQUE(A:A)', '=VLOOKUP("x",A:B,5,FALSE)', '=MATCH(1,{1,2},0)', '=IF(,,)', '=IFS(FALSE,1)', '=SWITCH(1)',
  '=DATE(2026,13,45)', '=DATEVALUE("nope")', '=TEXT(-1,"mmmm")', '=ROUND(1e308*10,2)', '=POWER(-1,0.5)', '=MOD(5,0)',
  '=QUERY(A1:C5,"select Z")', '=QUERY(A1:C5,"garbage words here")', '=SPLIT("",",")', '=REGEXMATCH("a","(")',
  '=ARRAYFORMULA(A1:A5*2)', '=CONCAT(A1:A3)', '=TEXTJOIN(",",TRUE,A:A)', '=COUNTIF(A:A,"*")', '=SUMPRODUCT(A1:A3,B1:B5)',
  '=' + 'IF(TRUE,'.repeat(50) + '1' + ')'.repeat(50), '=' + '('.repeat(60) + '1' + ')'.repeat(60), '=1+' + '1+'.repeat(300) + '1',
  '=😀', '="😀"&"✓"', '=a1+b2', '=sum(a1:b5)', '=Sheet1!', '=,', '==1', '=+-+-1', '=1%%%', '=-"x"', '=TRUE+TRUE',
  '=INDIRECT("A1")', '=OFFSET(A1,1,1)', '=ROW(A:A)', '=COLUMN()', '=ROWS(A:A)', '=NA()', '=ISERROR(1/0)', '=CHAR(9)',
  '=TRANSPOSE(A1:B2)', '=$A$1+A$1+$A1', '=Scratch!B2', '=B2', '=C3+B2', 'hello', '123', '0104', "'0104", '$1,234.50',
  '45%', '9/3/2026', 'TRUE', '', ' ', '=HLOOKUP("x",A1:F3,9,FALSE)', '=DATEDIF(DATE(2026,1,1),DATE(2025,1,1),"D")',
  '=EOMONTH("x",1)', '=AVERAGE()', '=MAX(A:A)', '=COUNTBLANK(A1:Z150)'
];
const SQLS = ['SELECT', 'SELECT * FROM', 'SELECT * FROM nope', "SELECT 'unclosed", 'SELECT 1/0, 7/2', 'SELECT * FROM products, sales, stores LIMIT 3',
  'SELECT COUNT(*) FROM products GROUP BY', 'DELETE FROM products', 'UPDATE stores SET city = NULL', "INSERT INTO stores VALUES ('S9')",
  'CREATE TABLE t (a INTEGER, b TEXT); INSERT INTO t VALUES (1, \'x\'); SELECT * FROM t;', 'DROP TABLE t', 'SELECT * FROM products ORDER BY 99',
  'SELECT (SELECT MAX(price) FROM products) + 1', 'SELECT * FROM raw_orders WHERE qty IS NULL', ';;;', '-- just a comment', 'SELECT 😀'];

async function main() {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [], slow = [], internal = new Set();
  page.on('pageerror', (e) => errors.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  page.on('dialog', (d) => d.dismiss());
  await page.goto(DIST);
  await page.fill('.modal input', 'Monkey Tester'); await page.keyboard.press('Enter'); await page.click('text=Yes, lock it in');
  const clear = () => page.evaluate(() => document.querySelectorAll('.modal-overlay, #cert-overlay').forEach((m) => m.remove()));
  const views = ['xl365', 'xl2013', 'gs', 'wrangle', 'csv', 'sql', 'compare', 'reference', 'rdbms', 'ml', 'test'];
  const JUNK = ['=)))(', '=XLOOKUP(', '=1/0', '="', '=A1:A3+', '{=SUM(A1)}', 'DROP TABLE products;', 'SELECT * FROM nope;', "SELECT 1; DELETE FROM sales;", 'BEGIN;',
    'CREATE TABLE x AS SELECT * FROM ml_examples;', '"a,b', 'a\tb\n"', '😀', '', '   ', "=SORT(Products!B2:D25,3,-1)", '=FILTER(Products!B2:B25,Products!C2:C25="Nope")', '=SPLIT(H2,"")'];
  let view = null; const seen = {};
  for (let step = 0; step < STEPS; step++) {
    const t0 = Date.now();
    let action = '';
    try {
      await clear();
      if (!view || rnd() < 0.04) {
        view = pick(views); action = 'go ' + view;
        await page.evaluate(() => { const o = document.getElementById('test-overlay'); if (o) { o.remove(); document.body.classList.remove('testing'); } });
        if (view === 'test') {
          const L = await page.evaluate(() => { const l = SX.lessons.LIST[Math.floor(Math.random() * SX.lessons.LIST.length)].id;
            SX.challenges.forPlat(l).forEach((c) => { SX.ui.state.done[c.id] = SX.ui.state.done[c.id] || { xp: c.xp, hints: 0 }; });
            SX.ui.state.tests[l] = Object.assign(SX.ui.state.tests[l] || {}, { lastFail: 0, open: 0, passed: 0 }); SX.ui.startTest(l); return l; });
          action += ' ' + L;
          await page.click('text=Start the test', { timeout: 2000 }).catch(() => {});
          continue;
        }
        await page.evaluate((v) => SX.ui.go(v), view);
        if (view === 'wrangle') await page.evaluate(() => { SX.ui.state.ui.wrPlat = Math.random() < 0.5 ? 'gs' : 'xl365'; });
        continue;
      }
      const sheetView = ['xl365', 'xl2013', 'gs', 'wrangle'].includes(view);
      if (sheetView) {
        const r = Math.floor(rnd() * 40), c = Math.floor(rnd() * 12), roll = rnd();
        if (roll < 0.45) {
          const f = pick(FORMULAS); action = 'type ' + f.slice(0, 60) + ' @' + r + ',' + c;
          await page.evaluate(([r, c]) => { const v = SX.ui.activeView; if (v.editing) v.endEdit(false); v.select(r, c); }, [r, c]);
          if (f === '') await page.keyboard.press('Delete');
          else { if (f.length > 80) { await page.keyboard.type('='); await page.evaluate((f) => { const v = SX.ui.activeView, el = v.activeEditEl(); if (!el) return; el.value = f; v.onEditInput(el); }, f); } else await page.keyboard.type(f); await page.keyboard.press(pick(['Enter', 'Enter', 'Tab', 'Control+Shift+Enter', 'Escape'])); }
        } else if (roll < 0.65) {
          const k = pick(['Delete', 'Control+z', 'Control+y', 'Control+c', 'Control+v', 'Control+x', 'Control+d', 'Control+r', 'F2', 'Escape',
            'ArrowDown', 'Shift+ArrowRight', 'Control+ArrowDown', 'Control+ArrowRight', 'Control+`', 'PageDown', 'Control+Home', 'Backspace', 'Tab']);
          action = 'key ' + k; await page.keyboard.press(k);
          if (k === 'F2' || k === 'Backspace') { await page.keyboard.type('=A1'); await page.keyboard.press('F4'); await page.keyboard.press(pick(['Enter', 'Escape'])); }
        } else if (roll < 0.75) {
          action = 'tab'; await page.evaluate(() => { const t = document.querySelectorAll('.sheet-tab'); t[Math.floor(Math.random() * t.length)].click(); });
        } else if (roll < 0.85) {
          action = 'panel'; await page.evaluate(() => { const t = document.querySelectorAll('.sp-tab'); if (t.length) t[Math.floor(Math.random() * t.length)].click(); });
        } else if (roll < 0.9) {
          action = 'format'; await page.selectOption('.fmt-select', pick(['general', 'currency', 'percent', 'date', 'number'])).catch(() => {});
        } else if (roll < 0.95) {
          action = 'drag-select'; const a = await page.$(`td[data-r="${r}"][data-c="${c}"]`); const b = await page.$(`td[data-r="${r + 3}"][data-c="${c + 2}"]`);
          if (a && b) { const ba = await a.boundingBox(), bb = await b.boundingBox(); if (ba && bb) { await page.mouse.move(ba.x + 3, ba.y + 3); await page.mouse.down(); await page.mouse.move(bb.x + 3, bb.y + 3, { steps: 3 }); await page.mouse.up(); } }
        } else {
          action = 'check challenge'; await page.evaluate(() => { const b = document.querySelector('.ch-card.open .btn-primary'); if (b) b.click(); });
        }
      } else if (view === 'sql') {
        const q = pick(SQLS); action = 'sql ' + q;
        await page.fill('.sql-editor', q); await page.evaluate(() => SX.ui.activeView.run());
        if (rnd() < 0.1) { action += ' +reset'; await page.evaluate(() => { SX.ui.activeView.db = SX.ui.resetDatabase(); }); }
      } else if (view === 'csv') {
        await page.evaluate(() => { const f = document.querySelectorAll('.file-open'); if (f.length) f[Math.floor(Math.random() * f.length)].click(); });
        const junk = pick(['"', '""', ',', '\t', '\n', 'a,"b', '😀', ',,,,', '"x""y"', '\r\n']);
        action = 'csv edit ' + JSON.stringify(junk);
        await page.evaluate((j) => { const ta = document.querySelector('.csv-editor'); const i = Math.floor(Math.random() * ta.value.length); ta.value = ta.value.slice(0, i) + j + ta.value.slice(i); ta.dispatchEvent(new Event('input')); }, junk);
        if (rnd() < 0.3) await page.selectOption('.tb-select >> nth=1', pick(['raw', 'sheet']));
        if (rnd() < 0.2) await page.selectOption('.tb-select >> nth=0', pick(['auto', ',', '\t', ';']));
        await page.waitForTimeout(150);
      } else if (view === 'compare') {
        const f = pick(FORMULAS.filter((x) => x.startsWith('='))); action = 'compare ' + f.slice(0, 50);
        await page.fill('.cmp-input', f); await page.evaluate(() => SX.ui.activeView.runFormula());
      } else if (view === 'test') {
        const j = pick(JUNK), roll = rnd(); action = 'test ' + JSON.stringify(j).slice(0, 40);
        if (!(await page.$('#test-overlay'))) { view = null; continue; }
        if (roll < 0.15) await page.evaluate(() => { const d = document.querySelectorAll('.tq-dot'); d[Math.floor(Math.random() * d.length)].click(); });
        else if (roll < 0.25) await page.evaluate(() => { const o = document.querySelectorAll('.tq-opt'); if (o.length) o[Math.floor(Math.random() * o.length)].click(); });
        else if (roll < 0.9) {
          const sel = (await page.$('.tq-formula')) ? '.tq-formula' : (await page.$('.tq-code')) ? '.tq-code' : (await page.$('.tq-input')) ? '.tq-input' : null;
          if (sel) { await page.fill(sel, j); await page.focus(sel); await page.keyboard.press(pick(['Enter', 'Control+Enter', 'Control+Shift+Enter', 'Tab'])); }
        } else {
          action += ' submit'; await page.evaluate(() => { const b = Array.from(document.querySelectorAll('.tq-foot .btn')).find((x) => /submit/i.test(x.textContent)); if (b) b.click(); });
          await page.evaluate(() => { const b = Array.from(document.querySelectorAll('.modal .btn')).find((x) => /Submit anyway/.test(x.textContent)); if (b) b.click(); });
          await page.waitForTimeout(100); view = null;
        }
      } else if (view === 'rdbms' || view === 'ml') {
        const roll = rnd();
        if (roll < 0.5) {
          const q = pick(SQLS.concat(JUNK)); action = view + ' console ' + q.slice(0, 50);
          await page.evaluate((q) => { const c = document.querySelectorAll('.rd-console'); const ta = c[Math.floor(Math.random() * c.length)]; ta.value = q; ta.closest('.rd-console-wrap').querySelector('.btn-primary').click(); }, q);
        } else {
          action = view + ' button'; await page.evaluate(() => { const b = Array.from(document.querySelectorAll('main.rdbms .btn, main.rdbms .rd-order, main.rdbms .ml-cell, main.rdbms .chip')).filter((x) => !x.disabled && !x.closest('.ch-list')); if (b.length) b[Math.floor(Math.random() * b.length)].click(); });
          if (view === 'ml' && rnd() < 0.3) await page.evaluate(() => { const s = document.querySelectorAll('.ml-role'); const x = s[Math.floor(Math.random() * s.length)]; x.selectedIndex = Math.floor(Math.random() * x.options.length); x.dispatchEvent(new Event('change')); });
          if (view === 'rdbms' && rnd() < 0.3) await page.evaluate(() => { const i = document.querySelectorAll('.rd-cell'); const x = i[Math.floor(Math.random() * i.length)]; x.value = String(Math.random() * 10).slice(0, 4); x.dispatchEvent(new Event('input')); });
        }
      } else if (view === 'reference') {
        action = 'reference run'; await page.evaluate(() => { const b = document.querySelectorAll('.ref-btns .btn-primary'); if (b.length) b[Math.floor(Math.random() * b.length)].click(); });
        if (rnd() < 0.2) await page.fill('.ref-search', pick(['zero', 'null', 'date', 'zzz', '', 'lookup']));
      }
      // scan visible cells for engine internal errors
      const bad = await page.evaluate(() => Array.from(document.querySelectorAll('td[title*="Internal error"]')).map((t) => t.title));
      bad.forEach((b) => internal.add(b + '  <- after: ' ));
      if (bad.length) internal.add('ACTION: ' + action);
    } catch (e) {
      errors.push('TEST STEP FAILED (' + action + '): ' + e.message.split('\n')[0]);
    }
    const dt = Date.now() - t0;
    if (dt > 1500) slow.push(dt + 'ms ' + action);
    if (step % 100 === 0) console.log('step', step, view);
    seen[String(action).split(' ')[0]] = (seen[String(action).split(' ')[0]] || 0) + 1;
  }
  await browser.close();
  console.log('\nerrors:', errors.length); errors.slice(0, 20).forEach((e) => console.log('  ' + e));
  console.log('internal engine errors:', internal.size); Array.from(internal).slice(0, 20).forEach((e) => console.log('  ' + e));
  console.log('slow actions:', slow.length); slow.slice(0, 10).forEach((e) => console.log('  ' + e));
  if (errors.length || internal.size || slow.length) process.exit(1);
  console.log('actions by kind:', JSON.stringify(seen));
  console.log('Monkey test passed: ' + STEPS + ' random actions.');
}
main().catch((e) => { console.error(e); process.exit(1); });
