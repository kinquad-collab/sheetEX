// End-to-end: complete whole lessons through the real UI (typing formulas, Ctrl+D, clicking Check),
// in Excel 365 AND Google Sheets mode, and confirm the certificates unlock.  node tests/e2e-lessons.js
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const DIST = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const BANK = require('../src/banks/questions.js');
const cell = (r, c) => `td[data-r="${r}"][data-c="${c}"]`;
const colIdx = (s) => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

const WRANGLE = [
  ['RawOrders!I2:I31', '=TEXT(C2,"0000")'],
  ['Report!B2', '=COUNTBLANK(RawOrders!E2:E31)'],
  ['Report!B3', '=COUNTIF(RawOrders!E2:E31,"N/A")+COUNTIF(RawOrders!E2:E31,"-")+COUNTIF(RawOrders!E2:E31,"null")'],
  ['RawOrders!J2:J31', '=IFERROR(VALUE(E2),"")'],
  ['RawOrders!K2:K31', '=UPPER(TRIM(B2))'],
  ['RawOrders!L2:L31', '=VALUE(F2)'],
  ['RawOrders!M2:M31', '=IF(ISNUMBER(D2),D2,DATEVALUE(D2))'],
  ['Report!B5', '=DATE(RIGHT(RawOrders!D19,4),MID(RawOrders!D19,4,2),LEFT(RawOrders!D19,2))'],
  ['RawOrders!N2:N31', '=IF(ISNUMBER(FIND(",",G2)),PROPER(TRIM(MID(G2,FIND(",",G2)+1,99)))&" "&LEFT(G2,FIND(",",G2)-1),PROPER(TRIM(G2)))'],
  ['Report!B4', '=COUNTBLANK(RawOrders!J2:J31)'],
  ['RawOrders!O2:O31', '=VLOOKUP(I2,ItemCodes!$A$2:$D$25,2,FALSE)'],
  ['RawOrders!P2:P31', '=IF(J2="","",J2*XLOOKUP(I2,ItemCodes!$A$2:$A$25,ItemCodes!$D$2:$D$25))'],
  ['Report!B7', '=HLOOKUP("S03",Targets!A1:F3,3,FALSE)'],
  ['RawOrders!Q2:Q31', '=HLOOKUP(K2,Targets!$B$1:$F$2,2,FALSE)'],
  ['Report!B8', '=SUM(RawOrders!J2:J31)'],
  ['Contacts!G2:G9', '=B2&", "&A2'],
  ['Contacts!H2:H9', '=C2&", "&D2&" "&TEXT(E2,"00000")'],
  ['Contacts!I2:I9', '=IF(F2="",0,LEN(F2)-LEN(SUBSTITUTE(F2,"|",""))+1)'],
  ['Report!B10', '=TEXTJOIN(",",FALSE,Contacts!A2:E2)'],
  ['Report!D2', '=FILTER(RawOrders!A2:A31,ISNUMBER(RawOrders!J2:J31)*(RawOrders!J2:J31>10))'],
];

async function main() {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const failures = [];
  const check = (cond, msg) => { if (!cond) failures.push(msg); console.log((cond ? '  ok   ' : '  FAIL ') + msg); };

  // Take a lesson's certification test through the real test screen, typing the bank's answers.
  // failFirst: submit an empty attempt first, check the review break, then pass on attempt 2.
  async function passTest(page, lesson, failFirst) {
    const clear = () => page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()));
    const key = BANK[lesson];
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    const start = async () => { await clear(); await page.evaluate((L) => SX.ui.startTest(L), lesson); await page.click('text=Start the test'); await page.waitForSelector('.test-overlay'); };
    if (failFirst) {
      await start();
      await page.click('text=Finish & submit'); await page.click('text=Submit anyway');
      await page.waitForSelector('.tq-score.fail');
      check(!(await page.evaluate((L) => SX.ui.lessonCertified(L), lesson)), lesson + ' test: an empty attempt fails');
      await clear();
      await page.evaluate((L) => SX.ui.startTest(L), lesson);
      check(!(await page.isVisible('.test-overlay')) && (await page.textContent('#toasts')).includes('retake'), lesson + ' test: review break before a retake');
      await page.evaluate((L) => { SX.ui.state.tests[L].lastFail -= 10 * 60 * 1000; }, lesson); // pretend the break is over
    }
    await start();
    const n = await page.$$eval('.tq-dot', (d) => d.length);
    let hands = 0;
    for (let i = 0; i < n; i++) {
      const html = await page.evaluate(() => document.querySelector('.tq-q').innerHTML);
      const k = key.find((x) => x.q === html);
      if (!k) { check(false, lesson + ' test: question not in the bank'); continue; }
      if (k.kind === 'mc') await page.click(`.tq-opt:text-is("${k.a.replace(/"/g, '\\"')}")`);
      else if (k.kind === 'text') await page.fill('.tq-input', k.a[0]);
      else if (k.kind === 'formula') { hands++; await page.fill('.tq-formula', k.ref); await page.focus('.tq-formula'); await page.keyboard.press(k.cse ? 'Control+Shift+Enter' : 'Enter'); }
      else { hands++; await page.fill('.tq-code', k.ref); }
      if (i < n - 1) await page.click('.tq-foot >> text=Next →', { timeout: 5000 }).catch(async (e) => {
        console.log('BLOCKED BY:', await page.evaluate(() => Array.from(document.querySelectorAll('.modal-overlay')).map((m) => m.textContent.slice(0, 120))));
        throw e;
      });
    }
    check(hands === n / 2, lesson + ' test: half the questions are hands-on (' + hands + '/' + n + ')');
    await page.click('text=Finish & submit');
    await page.waitForSelector('.tq-score');
    const score = await page.textContent('.tq-score b');
    check(score === '100%', lesson + ' test: bank answers typed into the test score ' + score);
    check(await page.evaluate((L) => SX.ui.lessonCertified(L), lesson), lesson + ' test passed -> certificate earned');
    await clear();
    await page.evaluate((L) => SX.ui.showCert(L), lesson);
    await page.waitForSelector('.cert-paper');
    const cert = await page.evaluate((L) => SX.lessons.readCert(SX.ui.state.certs[L].code), lesson);
    const inFile = await page.evaluate((L) => { const r = SX.ui.readProgressFile(SX.ui.progressFileText()); return r.ok && r.file.summary.certificates.some((c) => c.lesson.endsWith(SX.lessons.byId(L).title)); }, lesson);
    check(inFile, lesson + ' certificate is recorded in the sealed progress file');
    check(cert.ok && cert.cert.lesson === lesson && cert.cert.score === n && cert.cert.attempts === (failFirst ? 2 : 1), lesson + ' certificate code is sealed and correct (attempt ' + (cert.cert && cert.cert.attempts) + ')');
    await page.evaluate(() => document.querySelector('#cert-overlay').remove());
    check(errors.length === 0, lesson + ' test: no page errors ' + errors.join(' | '));
  }
  for (const plat of ['xl365', 'gs']) {
    console.log('\n== Data Wrangling Lab on ' + plat + ' ==');
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(DIST);
    await page.fill('.modal input.input', 'Avery Johnson'); await page.keyboard.press('Enter'); await page.click('text=Yes, lock it in'); await page.evaluate(() => { SX.ui.state.ui.guideSeen = {}; SX.lessons.LIST.forEach((l) => { SX.ui.state.ui.guideSeen[l.id] = true; }); SX.ui.state.ui.wrIntro = true; SX.ui.state.ui.wrIntroDone = true; });
    await page.evaluate((p) => { SX.ui.state.ui.wrPlat = p; SX.ui.state.ui.wrIntro = true; }, plat);
    await page.click('.pc-wrangle'); await page.waitForSelector('.grid');
    const clear = () => page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()));
    for (const [addr, formula] of WRANGLE) {
      const m = /^(.+)!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(addr);
      await clear();
      await page.click(`.sheet-tab:text-is("${m[1]}")`);
      const r1 = +m[3] - 1, c = colIdx(m[2]);
      await page.evaluate(([r, c]) => SX.ui.activeView.select(r, c), [r1, c]);
      await page.keyboard.type(formula, { delay: 2 });
      await page.keyboard.press('Enter');
      if (m[5]) {
        await page.evaluate(([r1, r2, c]) => { const v = SX.ui.activeView; v.select(r1, c); v.select(r2, c, true); }, [r1, +m[5] - 1, c]);
        await page.keyboard.press('Control+d');
      }
      const typed = await page.evaluate(([s, r, c]) => SX.ui.activeView.wb.formulaText(s, r, c), [m[1], r1, c]);
      if (typed.replace(/\s/g, '') !== formula.replace(/\s/g, '')) check(false, 'typed formula mismatch at ' + addr + ': ' + typed);
    }
    await clear();
    // click Check on every challenge, answer quizzes
    const ids = await page.$$eval('.ch-card', (cs) => cs.map((c) => c.dataset.id));
    for (const id of ids) {
      await clear();
      await page.evaluate((id) => document.querySelector(`.ch-card[data-id="${id}"]`).classList.add('open'), id);
      const isQuiz = await page.$(`.ch-card[data-id="${id}"] .quiz-opt`);
      if (isQuiz) {
        const ans = await page.evaluate((id) => SX.challenges.byId(id).answer, id);
        await page.evaluate(([id, a]) => document.querySelectorAll(`.ch-card[data-id="${id}"] .quiz-opt`)[a].click(), [id, ans]);
      } else {
        await page.evaluate((id) => document.querySelector(`.ch-card[data-id="${id}"] .btn-primary`).click(), id);
      }
      await page.waitForTimeout(80);
      const done = await page.evaluate((id) => !!SX.ui.state.done[id], id);
      const msg = done ? '' : await page.textContent(`.ch-card[data-id="${id}"] .ch-msg`);
      check(done, plat + ' ' + id + (done ? '' : ' — ' + msg));
    }
    await page.waitForTimeout(2500);
    await clear();
    await page.evaluate(() => document.querySelector('.sp-tab[data-id="ai"]').click());
    await page.waitForTimeout(200);
    check((await page.textContent('.ai-score')).startsWith('100'), plat + ' AI-readiness score reaches 100 after cleaning');
    check((await page.textContent('.ai-stats')).includes('0.0'), plat + ' cleaned model matches the truth (0.0 off)');
    check(await page.evaluate(() => !!SX.ui.state.badges['ai-ready']), plat + ' AI-Ready Data badge earned');
    for (const L of ['wr1', 'wr2']) check(await page.evaluate((L) => SX.ui.lessonComplete(L) && !SX.ui.lessonCertified(L), L), plat + ' ' + L + ' practice done; certificate waits for the test');
    check(errors.length === 0, plat + ' no page errors ' + errors.join(' | '));
    if (plat === 'xl365') { await passTest(page, 'wr1'); await passTest(page, 'wr2'); }
    await page.close();
  }
  // ---- Store spreadsheet lessons (Excel 365, Excel 2013 with Ctrl+Shift+Enter, Google Sheets) ----
  const STORE = {
    xl365: [['Scratch!B2', '=SUM(Products!F2:F25)'], ['Scratch!B3', '=SUM(Products!D2:D25*Products!F2:F25)'], ['Scratch!B4', '=COUNTIF(Products!C2:C25,"School Supplies")'],
      ['Scratch!B5', '=SUMIF(Sales!C2:C61,"S03",Sales!E2:E61)'], ['Scratch!A7', 'SKU-404'], ['Scratch!B7', '=XLOOKUP(A7,Products!A2:A25,Products!B2:B25)'],
      ['Scratch!D2', '=FILTER(Products!B2:B25,Products!C2:C25="Drinks")'], ['Scratch!F2', '=SORT(UNIQUE(Products!C2:C25))'],
      ['Products!I2:I25', '=IFS(F2<G2,"Reorder",F2<G2*1.5,"Low",TRUE,"OK")'],
      ['Scratch!B9', '=LET(p,XLOOKUP("SKU-502",Products!A2:A25,Products!D2:D25),c,XLOOKUP("SKU-502",Products!A2:A25,Products!E2:E25),(p-c)/p)'],
      ['Sales!G2:G61', '=E2*XLOOKUP(D2,Products!$A$2:$A$25,Products!$D$2:$D$25)']],
    xl2013: [['Scratch!B2', '=XLOOKUP("SKU-101",Products!A2:A25,Products!B2:B25)'], ['Scratch!B3', '=INDEX(Products!B2:B25,MATCH("SKU-404",Products!A2:A25,0))'],
      ['Scratch!B4', '=VLOOKUP("Hoodie",Products!B2:D25,3,FALSE)'], ['Products!I2:I25', '=IF(F2<G2,"Reorder",IF(F2<G2*1.5,"Low","OK"))'],
      ['Scratch!A6', 'SKU-101'], ['Scratch!B6', '=IFERROR(VLOOKUP(A6,Products!A2:B25,2,FALSE),"Not found")'],
      ['Scratch!B7', '=MAX(IF(Products!C2:C25="Electronics",Products!D2:D25))', 'cse'],
      ['Scratch!B8', '=Products!B2&" - "&TEXT(Products!D2,"$0.00")'], ['Scratch!B9', '=SUMIFS(Sales!E2:E61,Sales!C2:C61,"S02",Sales!D2:D61,"SKU-3*")']],
    gs: [['Scratch!B2', '=FILTER(Products!B2:B25,Products!C2:C25="Apparel")'], ['Scratch!D2', '=FILTER(Products!B2:B25,Products!C2:C25="Snacks",Products!D2:D25>1)'],
      ['Scratch!F2', '=SORT(Products!B2:D25,3,FALSE)'], ['Products!I2', '=ARRAYFORMULA(D2:D25-E2:E25)'], ['Scratch!J2', '=QUERY(Products!A1:H25,"select C, sum(F) group by C")'],
      ['Scratch!B10', '=SPLIT(Stores!E2," ")'], ['Scratch!B12', '=SUM(Sales!E2:E)'], ['Scratch!B13', '=CONCATENATE(Stores!B2,", ",Stores!C2)'],
      ['Scratch!B14', '=SUMPRODUCT(--REGEXMATCH(Products!B2:B25,"\\d"))']]
  };
  for (const plat of Object.keys(STORE)) {
    console.log('\n== ' + plat + ' store lesson ==');
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(DIST);
    await page.fill('.modal input.input', 'Riley Brooks'); await page.keyboard.press('Enter'); await page.click('text=Yes, lock it in'); await page.evaluate(() => { SX.ui.state.ui.guideSeen = {}; SX.lessons.LIST.forEach((l) => { SX.ui.state.ui.guideSeen[l.id] = true; }); SX.ui.state.ui.wrIntro = true; SX.ui.state.ui.wrIntroDone = true; });
    await page.click('.pc-' + plat); await page.waitForSelector('.grid');
    const clear = () => page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()));
    for (const [addr, formula, how] of STORE[plat]) {
      const m = /^(.+)!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(addr);
      await clear();
      await page.click(`.sheet-tab:text-is("${m[1]}")`);
      const r1 = +m[3] - 1, c = colIdx(m[2]);
      await page.evaluate(([r, c]) => SX.ui.activeView.select(r, c), [r1, c]);
      await page.keyboard.type(formula, { delay: 2 });
      await page.keyboard.press(how === 'cse' ? 'Control+Shift+Enter' : 'Enter');
      if (m[5]) {
        await page.evaluate(([r1, r2, c]) => { const v = SX.ui.activeView; v.select(r1, c); v.select(r2, c, true); }, [r1, +m[5] - 1, c]);
        await page.keyboard.press('Control+d');
      }
    }
    if (plat === 'xl2013') check((await page.evaluate(() => SX.ui.activeView.wb.formulaText('Scratch', 6, 1))).startsWith('{='), 'xl2013: Ctrl+Shift+Enter shows {=...}');
    await clear();
    const ids = await page.$$eval('.ch-card', (cs) => cs.map((c) => c.dataset.id));
    for (const id of ids) {
      await page.evaluate((id) => { const c = document.querySelector(`.ch-card[data-id="${id}"]`); c.classList.add('open');
        const q = c.querySelectorAll('.quiz-opt'); if (q.length) q[SX.challenges.byId(id).answer].click(); else c.querySelector('.btn-primary').click(); }, id);
      await page.waitForTimeout(60);
      const done = await page.evaluate((id) => !!SX.ui.state.done[id], id);
      check(done, plat + ' ' + id + (done ? '' : ' — ' + await page.textContent(`.ch-card[data-id="${id}"] .ch-msg`)));
    }
    check(await page.evaluate((p) => SX.ui.lessonComplete(p), plat), plat + ' practice complete -> test unlocked');
    check(errors.length === 0, plat + ' no page errors ' + errors.join(' | '));
    await passTest(page, plat);
    await page.close();
  }

  // ---- SQL lesson through the SQL console ----
  {
    console.log('\n== SQL lesson ==');
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(DIST);
    await page.fill('.modal input.input', 'Sam Patel'); await page.keyboard.press('Enter'); await page.click('text=Yes, lock it in'); await page.evaluate(() => { SX.ui.state.ui.guideSeen = {}; SX.lessons.LIST.forEach((l) => { SX.ui.state.ui.guideSeen[l.id] = true; }); SX.ui.state.ui.wrIntro = true; SX.ui.state.ui.wrIntroDone = true; });
    await page.click('.pc-sql'); await page.waitForSelector('.sql-editor');
    const SQL = {
      'sql-star': 'SELECT * FROM products;',
      'sql-where': "SELECT product, price FROM products WHERE category = 'Electronics';",
      'sql-top3': 'SELECT product, price FROM products ORDER BY price DESC LIMIT 3;',
      'sql-group': 'SELECT store_id, SUM(qty) FROM sales GROUP BY store_id;',
      'sql-join': 'SELECT s.order_id, p.product FROM sales s JOIN products p ON s.sku = p.sku;',
      'sql-having': 'SELECT category, COUNT(*) FROM products GROUP BY category HAVING COUNT(*) > 5;',
      'sql-city': 'SELECT st.city, SUM(s.qty * p.price) AS revenue FROM sales s JOIN stores st ON s.store_id = st.store_id JOIN products p ON s.sku = p.sku GROUP BY st.city ORDER BY revenue DESC;',
      'sql-avg': 'SELECT AVG(qty) FROM sales;',
      'sql-update': 'UPDATE products SET in_stock = reorder_at * 2 WHERE in_stock < reorder_at;'
    };
    for (const [id, q] of Object.entries(SQL)) {
      await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()));
      await page.fill('.sql-editor', q);
      await page.click('.sql-editor'); await page.keyboard.press('Control+Enter');
      await page.evaluate((id) => { const c = document.querySelector(`.ch-card[data-id="${id}"]`); c.classList.add('open'); c.querySelector('.btn-primary').click(); }, id);
      await page.waitForTimeout(900); // let any level-up celebration open, then clear it before the next query
      await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()));
      const done = await page.evaluate((id) => !!SX.ui.state.done[id], id);
      check(done, 'sql ' + id + (done ? '' : ' — ' + await page.textContent(`.ch-card[data-id="${id}"] .ch-msg`)));
    }
    check(await page.evaluate(() => SX.ui.lessonComplete('sql')), 'sql practice complete -> test unlocked');
    check(errors.length === 0, 'sql no page errors ' + errors.join(' | '));
    await passTest(page, 'sql');
    await page.close();
  }

  // ---- CSV lesson through the text editor ----
  {
    console.log('\n== CSV lesson ==');
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(DIST);
    await page.fill('.modal input.input', 'Casey Wright'); await page.keyboard.press('Enter'); await page.click('text=Yes, lock it in'); await page.evaluate(() => { SX.ui.state.ui.guideSeen = {}; SX.lessons.LIST.forEach((l) => { SX.ui.state.ui.guideSeen[l.id] = true; }); SX.ui.state.ui.wrIntro = true; SX.ui.state.ui.wrIntroDone = true; });
    await page.click('.pc-csv'); await page.waitForSelector('.csv-editor');
    const clear = () => page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()));
    const checkCh = async (id) => {
      await clear();
      await page.evaluate((id) => { const c = document.querySelector(`.ch-card[data-id="${id}"]`); c.classList.add('open');
        const quiz = c.querySelectorAll('.quiz-opt'); if (quiz.length) quiz[SX.challenges.byId(id).answer].click(); else c.querySelector('.btn-primary').click(); }, id);
      await page.waitForTimeout(80);
      const done = await page.evaluate((id) => !!SX.ui.state.done[id], id);
      check(done, 'csv ' + id + (done ? '' : ' — ' + await page.textContent(`.ch-card[data-id="${id}"] .ch-msg`)));
    };
    // 1. fix the broken comma by editing the text
    await page.click('.file-open:has-text("broken_products.csv")');
    await page.evaluate(() => { const ta = document.querySelector('.csv-editor'); ta.value = ta.value.replace('Gel Pens, 4-pack', '"Gel Pens, 4-pack"'); ta.dispatchEvent(new Event('input')); });
    await page.waitForTimeout(200);
    check(!(await page.isVisible('.pb-item')), 'csv: problem list clears after the fix');
    await checkCh('csv-fix-comma');
    // 2. new file stores.tsv + find & replace with \t
    await page.waitForTimeout(700); await clear();
    await page.click('.file-open:has(span:text-is("stores.csv"))');
    const storesText = await page.inputValue('.csv-editor');
    await page.click('text=＋ New file');
    await page.fill('.modal input.input', 'stores.tsv'); await page.click('.modal .btn-primary');
    await page.fill('.csv-editor', storesText);
    await page.click('text=🔍 Find & replace');
    await page.fill('.find-bar input >> nth=0', ',');
    await page.fill('.find-bar input >> nth=1', '\\t');
    await page.click('.find-bar >> text=Replace all');
    await checkCh('csv-tsv');
    // 3. add the ruler row
    await page.waitForTimeout(700); await clear();
    await page.click('.file-open:has(span:text-is("products.csv"))');
    await page.click('.csv-editor'); await page.keyboard.press('Control+End');
    await page.keyboard.type('SKU-307,"12"" Ruler",School Supplies,1.99,0.6,30,10,Office Hub Supply\n');
    await page.waitForTimeout(200);
    await checkCh('csv-quote');
    // 4. export dialog
    await page.waitForTimeout(700); await clear();
    await page.click('text=⇪ Export from spreadsheet');
    await page.click('.modal .btn-primary');
    await page.waitForTimeout(200);
    check((await page.textContent('.modal')).includes('formula'), 'csv: export shows what was lost');
    await checkCh('csv-export');
    for (const q of ['csv-quiz-formula', 'csv-quiz-zero', 'csv-quiz-fields', 'csv-quiz-format']) await checkCh(q);
    check(await page.evaluate(() => SX.ui.lessonComplete('csv')), 'csv practice complete -> test unlocked');
    check(errors.length === 0, 'csv no page errors ' + errors.join(' | '));
    await passTest(page, 'csv', true);
    await page.close();
  }
  // ---- Lesson 9: What is an RDBMS? — driven only through the page's own buttons, inputs and consoles ----
  {
    console.log('\n== RDBMS lesson ==');
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(DIST);
    await page.fill('.modal input.input', 'Riley Chen'); await page.keyboard.press('Enter'); await page.click('text=Yes, lock it in'); await page.evaluate(() => { SX.ui.state.ui.guideSeen = {}; SX.lessons.LIST.forEach((l) => { SX.ui.state.ui.guideSeen[l.id] = true; }); SX.ui.state.ui.wrIntro = true; SX.ui.state.ui.wrIntroDone = true; });
    await page.click('.pc-rdbms'); await page.waitForSelector('#rd-grid');
    const clear = () => page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()));
    const runIn = async (sel, sql) => { await clear(); await page.fill(sel + ' .rd-console', sql); await page.click(sel + ' .rd-console-wrap .btn-primary'); await page.waitForTimeout(60); };
    // 1. update anomaly: edit one highlighted price
    await page.fill('#rd-grid tr.rd-hl .rd-cell >> nth=0', '9.99');
    check((await page.textContent('#rd-grid .rd-status')).includes('anomaly'), 'rdbms: editing one copy of a price shows an update anomaly');
    // 2. the "cheap" price is refused
    await page.click('#rd-tables .btn-primary');
    check((await page.textContent('#rd-tables')).includes('cannot store TEXT'), 'rdbms: typed column refuses price = \'cheap\'');
    // 3. follow an order's keys
    await page.click('#rd-keys .rd-order >> nth=0');
    check((await page.textContent('#rd-keys .rd-follow')).length > 30, 'rdbms: clicking an order follows its keys');
    // 4. every "Try it" card is refused by the database
    const tries = await page.$$('#rd-no .rd-no button');
    for (const b of tries) { await clear(); await b.click(); }
    check((await page.$$('#rd-no .rd-no .sql-err')).length === tries.length, 'rdbms: all ' + tries.length + ' bad-data attempts refused');
    // 5. transactions: BEGIN / DELETE / ROLLBACK in the store-data console
    await runIn('#rd-tx', 'BEGIN;\nDELETE FROM sales;\nSELECT COUNT(*) AS sales_left FROM sales;');
    check((await page.textContent('#rd-tx .rd-console-wrap')).includes('sales_left'), 'rdbms: sales emptied inside the transaction');
    await runIn('#rd-tx', 'ROLLBACK;\nSELECT COUNT(*) AS n FROM sales;');
    check((await page.textContent('#rd-tx .rd-console-wrap')).includes('60'), 'rdbms: ROLLBACK brings back all 60 sales');
    // bank transfer: power failure inside a transaction, then commit a clean one
    const bankClick = async (t) => { await clear(); await page.click(`#rd-tx button:text-is("${t}")`); };
    for (const t of ['With a transaction (BEGIN)', 'Step 1: take $10 from Jordan', '⚡ Power failure!']) await bankClick(t);
    check((await page.textContent('#rd-tx .rd-bank')).includes('$25.00'), 'rdbms: power failure inside a transaction loses no money');
    for (const t of ['With a transaction (BEGIN)', 'Step 1: take $10 from Jordan', 'Step 2: give $10 to Maria', 'COMMIT']) await bankClick(t);
    check((await page.textContent('#rd-tx .rd-status')).includes('Committed'), 'rdbms: transfer committed');
    // 6. free play: build two related tables
    await runIn('#rd-play', "CREATE TABLE students (student_id INTEGER PRIMARY KEY, name TEXT NOT NULL);\nINSERT INTO students (name) VALUES ('Ana'), ('Ben');");
    await runIn('#rd-play', 'CREATE TABLE enrollments (student_id INTEGER REFERENCES students(student_id), course TEXT);\nINSERT INTO enrollments VALUES (1, \'AI Foundations\');');
    await runIn('#rd-play', "INSERT INTO enrollments VALUES (99, 'Ghost class');");
    check((await page.textContent('#rd-play')).includes('FOREIGN KEY'), 'rdbms: your own foreign key refuses a student who does not exist');
    // challenges
    const ids = await page.$$eval('#rd-challenges .ch-card', (cs) => cs.map((c) => c.dataset.id));
    check(ids.length === 10, 'rdbms: 10 challenges on the page (' + ids.length + ')');
    for (const id of ids) {
      await clear();
      await page.evaluate((id) => { const c = document.querySelector(`.ch-card[data-id="${id}"]`); c.classList.add('open');
        const quiz = c.querySelectorAll('.quiz-opt'); if (quiz.length) quiz[SX.challenges.byId(id).answer].click(); else c.querySelector('.btn-primary').click(); }, id);
      await page.waitForTimeout(80);
      const done = await page.evaluate((id) => !!SX.ui.state.done[id], id);
      check(done, 'rdbms ' + id + (done ? '' : ' — ' + await page.textContent(`.ch-card[data-id="${id}"] .ch-msg`)));
    }
    check(await page.evaluate(() => SX.ui.lessonComplete('rdbms')), 'rdbms practice complete -> test unlocked');
    await page.waitForTimeout(1500); await clear();
    check(errors.length === 0, 'rdbms no page errors ' + errors.join(' | '));
    await passTest(page, 'rdbms');
    await page.evaluate(() => SX.ui.showCert('rdbms')); await page.waitForSelector('.cert-paper');
    check((await page.textContent('.cert-lesson')).includes('RDBMS'), 'rdbms certificate shows the lesson title');
    await page.close();
  }
  // ---- Lesson 8: Compare quizzes, then its test ----
  {
    console.log('\n== Compare lesson ==');
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    await page.goto(DIST);
    await page.fill('.modal input.input', 'Jamie Ortiz'); await page.keyboard.press('Enter'); await page.click('text=Yes, lock it in'); await page.evaluate(() => { SX.ui.state.ui.guideSeen = {}; SX.lessons.LIST.forEach((l) => { SX.ui.state.ui.guideSeen[l.id] = true; }); });
    await page.click('.cmp-card'); await page.waitForSelector('.cmp-cards');
    for (const id of await page.$$eval('.ch-card', (cs) => cs.map((c) => c.dataset.id))) {
      await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()));
      await page.evaluate((id) => { const c = document.querySelector(`.ch-card[data-id="${id}"]`); c.classList.add('open'); c.querySelectorAll('.quiz-opt')[SX.challenges.byId(id).answer].click(); }, id);
      await page.waitForTimeout(60);
    }
    check(await page.evaluate(() => SX.ui.lessonComplete('compare')), 'compare practice complete -> test unlocked');
    await passTest(page, 'compare');
    await page.close();
  }

  // ---- Lessons 11–12: Data Tools Lab, driven only through the menus and dialogs ----
  for (const [plat, lesson] of [['gs', 'tools1'], ['xl365', 'tools2']]) {
    console.log('\n== Data Tools Lab: ' + lesson + ' in ' + plat + ' ==');
    const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(DIST);
    await page.fill('.modal input.input', 'Dana Ortiz'); await page.keyboard.press('Enter'); await page.click('text=Yes, lock it in');
    await page.evaluate((p) => { SX.ui.state.ui.guideSeen = {}; SX.lessons.LIST.forEach((l) => { SX.ui.state.ui.guideSeen[l.id] = true; }); SX.ui.state.ui.dtIntro = true; SX.ui.state.ui.dtPlat = p; SX.ui.quiet = true; }, plat);
    await page.click('.pc-tools'); await page.waitForSelector('.grid');
    const clear = () => page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()));
    const sel = (r1, c1, r2, c2) => page.evaluate(([a, b, c, d]) => { const v = SX.ui.activeView; v.select(a, b); if (c != null) v.select(c, d, true); }, [r1, c1, r2, c2]);
    const menu = async (tab, item) => { await clear(); await page.click(`.menu-item:text-is("${tab}")`); await page.click(`.menu-cmd:has-text("${item}")`); await page.waitForSelector('.modal', { timeout: 1500 }).catch(() => {}); await page.waitForTimeout(120); };
    const tab = async (name) => { await clear(); await page.click(`.sheet-tab:text-is("${name}")`); };
    const typeAt = async (r, c, text) => { await clear(); await sel(r, c); await page.keyboard.type(text, { delay: 2 }); await page.keyboard.press('Enter'); };
    const modalSelects = (vals) => page.evaluate((vals) => { const s = document.querySelectorAll('.modal select'); vals.forEach((v, i) => { if (v != null) { s[i].value = String(v); s[i].dispatchEvent(new Event('change')); } }); }, vals);
    const ok = async () => { await page.click('.modal-overlay:last-of-type .modal .btn-primary'); await page.waitForTimeout(200); };
    const checkAll = async () => {
      for (const id of await page.$$eval('.ch-card', (cs) => cs.map((c) => c.dataset.id))) {
        if (!id.startsWith('dt-')) continue;
        await clear();
        await page.evaluate((id) => { const c = document.querySelector(`.ch-card[data-id="${id}"]`); c.classList.add('open');
          const q = c.querySelectorAll('.quiz-opt'); if (q.length) q[SX.challenges.byId(id).answer].click(); else { const b = c.querySelector('.btn-primary'); if (b) b.click(); } }, id);
        await page.waitForTimeout(60);
      }
    };
    if (lesson === 'tools1') {
      // sort by date with the header row (Sheets: Sort range… needs "Data has header row")
      await sel(1, 1); await menu('Data', 'Sort range');
      await page.click('.modal .tdlg-check input'); await modalSelects([1, 'asc']); await ok();
      check(await page.evaluate(() => SX.ui.activeView.wb.value('Orders', 0, 1)) === 'OrderDate', 'tools1: header row stayed on top');
      // find & replace N/A in the Qty column
      await sel(1, 5, 39, 5); await menu('Edit', 'Find and replace');
      await page.fill('.modal .tdlg-field:has-text("Find what") input', 'N/A'); await page.click('.modal .tdlg-check:has-text("entire") input'); await ok();
      // remove duplicates, trim, remove again
      const dedupe = async () => { await sel(1, 0); await menu('Data', 'Remove duplicates'); await page.click('.modal .tdlg-check:has-text("header") input'); await ok(); await page.waitForTimeout(150);
        const msg = await page.textContent('.modal'); await clear(); return msg; };
      const first = await dedupe();
      check(/3 duplicate rows found and removed/.test(first), 'tools1: first Remove duplicates removes the 3 exact copies (' + first.slice(0, 60) + ')');
      await sel(1, 2, 39, 2); await menu('Data', 'Trim whitespace');
      const second = await dedupe();
      check(/2 duplicate rows found and removed\. 34 unique rows remain/.test(second), 'tools1: after trimming, 2 hidden duplicates appear and are removed');
      // split City, State
      await sel(1, 8, 34, 8); await menu('Data', 'Split text to columns'); await modalSelects(['comma']);
      await ok();
      check(await page.evaluate(() => String(SX.ui.activeView.wb.value('Orders', 1, 9)).trim().length === 2), 'tools1: state split into column J');
      // filter to Online + SUBTOTAL
      await sel(1, 0); await menu('Data', 'Create a filter');
      await page.evaluate(() => { SX.ui.activeView.gridWrap.scrollTop = 0; });
      const hdr = await page.$('td.has-filter[data-c="7"]'); const bb = await hdr.boundingBox();
      await page.mouse.click(bb.x + bb.width - 8, bb.y + bb.height / 2); await page.waitForSelector('.filter-pop');
      await page.evaluate(() => { const p = document.querySelector('.filter-pop'); p.querySelectorAll('.filter-list label').forEach((l) => { l.querySelector('input').checked = l.textContent.trim() === 'Online'; });
        Array.from(p.querySelectorAll('button')).find((x) => x.textContent === 'OK').click(); });
      check((await page.textContent('.st-filter')).includes('showing'), 'tools1: status bar reports the filtered rows');
      // validation on Qty (existing -3 gets flagged in Sheets)
      await sel(1, 5, 34, 5); await menu('Data', 'Data validation'); await modalSelects(['whole']);
      await page.fill('.modal .tdlg-field:has-text("Minimum") input', '1'); await page.fill('.modal .tdlg-field:has-text("Maximum") input', '100'); await ok();
      check((await page.$$('td.dv-bad')).length >= 1, 'tools1: Sheets marks the existing impossible quantity');
      // typing a bad value: Sheets warns but keeps it
      // conditional formatting: duplicates need a custom formula in Sheets
      await sel(1, 0, 34, 0); await menu('Format', 'Conditional formatting'); await modalSelects(['formula']);
      await page.fill('.modal .tdlg-field:has-text("Formula") input', '=COUNTIF($A$2:$A$35,A2)>1');
      await ok();
      const cf = await page.evaluate(() => ({ n: Object.keys(SX.tools.cfColors(SX.ui.activeView.wb, 'Orders')).length, rules: SX.ui.activeView.wb.sheet('Orders').meta.cf, rows: SX.ui.activeView.wb.maxRow('Orders') }));
      check(cf.n === 4, 'tools1: 4 clashing OrderID cells highlighted ' + (cf.n === 4 ? '' : JSON.stringify(cf)));
      await tab('Scratch'); await typeAt(1, 1, '=SUBTOTAL(9,Orders!F2:F40)');
      await page.click('.sp-tab[data-id="challenges"]');
    } else {
      // three pivot tables from the Orders data (Excel names the sheets Sheet1, Sheet2…)
      const pivot = async (rows, cols, val, agg) => { await tab('Orders'); await sel(1, 0); await menu('Insert', 'PivotTable'); await modalSelects([rows, cols, val, agg]); await ok(); await page.waitForTimeout(100); };
      await pivot(3, '', 5, 'SUM'); await pivot(3, 7, 5, 'SUM'); await pivot(7, '', 0, 'COUNT'); await pivot(7, '', 5, 'SUM');
      check(await page.evaluate(() => SX.ui.activeView.wb.sheets.map((s) => s.name).join(',')) === 'Orders,Monthly,Ads,Scratch,Sheet1,Sheet2,Sheet3,Sheet4', 'tools2: four pivot sheets created');
      // edit the source, see the stale warning, refresh
      await tab('Orders'); await typeAt(1, 5, '11');
      await tab('Sheet1');
      check((await page.textContent('.pivot-bar')).includes('OLD numbers'), 'tools2: Excel pivot warns it is out of date');
      await menu('Data', 'Refresh All'); await clear();
      check(!(await page.textContent('.pivot-bar')).includes('OLD numbers'), 'tools2: Refresh All updates the pivot');
      // SUMIFS check cell
      await tab('Scratch'); await typeAt(3, 1, '=SUMIFS(Orders!F2:F40,Orders!D2:D40,"Snacks",Orders!H2:H40,"Online")');
      // charts
      const chart = async (sheet, r1, c1, r2, c2, type) => { await tab(sheet); await sel(r1, c1, r2, c2); await menu('Insert', 'Chart'); await modalSelects([type]); await ok(); await page.waitForTimeout(100); };
      await chart('Sheet1', 2, 0, 6, 1, 'column');
      await chart('Monthly', 0, 0, 12, 2, 'line');
      await chart('Sheet4', 2, 0, 4, 1, 'pie');
      await chart('Ads', 0, 0, 10, 1, 'scatter');
      check((await page.$$('.chart-card')).length === 4, 'tools2: four charts in the Charts panel');
      check((await page.$$('.chart-card svg rect, .chart-card svg path, .chart-card svg circle, .chart-card svg polyline')).length > 20, 'tools2: charts are drawn');
      await page.locator('.chart-card >> nth=0').screenshot({ path: path.join(require('os').tmpdir(), 'sheetex-chart.png') });
      await page.click('.sp-tab[data-id="challenges"]');
    }
    await checkAll();
    for (const id of await page.evaluate((L) => SX.challenges.forPlat(L).map((c) => c.id), lesson)) {
      const done = await page.evaluate((id) => !!SX.ui.state.done[id], id);
      check(done, lesson + ' ' + id + (done ? '' : ' — ' + await page.textContent(`.ch-card[data-id="${id}"] .ch-msg`).catch(() => '?')));
    }
    check(await page.evaluate((L) => SX.ui.lessonComplete(L), lesson), lesson + ' practice complete -> test unlocked');
    check(errors.length === 0, lesson + ' no page errors ' + errors.join(' | '));
    await page.waitForTimeout(1200);
    await passTest(page, lesson);
    await page.close();
  }

  // ---- Lesson 10: ML Data Lab — driven through the page's own controls and consoles ----
  {
    console.log('\n== ML lesson ==');
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(DIST);
    await page.fill('.modal input.input', 'Morgan Lee'); await page.keyboard.press('Enter'); await page.click('text=Yes, lock it in'); await page.evaluate(() => { SX.ui.state.ui.guideSeen = {}; SX.lessons.LIST.forEach((l) => { SX.ui.state.ui.guideSeen[l.id] = true; }); });
    await page.click('.pc-ml'); await page.waitForSelector('#ml-examples');
    const clear = () => page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach((m) => m.remove()));
    // celebrations (level-ups) can pop up at any moment: clear them and retry the click
    const safeClick = async (sel) => { for (let t = 0; t < 6; t++) { await clear(); try { await page.click(sel, { timeout: 1500 }); return; } catch (e) { if (t === 5) throw e; } } };
    const runIn = async (sel, sql) => { await clear(); await page.fill(sel + ' .rd-console', sql); await safeClick(sel + ' .rd-console-wrap .btn-primary'); await page.waitForTimeout(60); };
    const checkCh = async (id) => {
      await clear();
      await page.evaluate((id) => { const c = document.querySelector(`.ch-card[data-id="${id}"]`); c.classList.add('open');
        const q = c.querySelectorAll('.quiz-opt'); if (q.length) q[SX.challenges.byId(id).answer].click(); else c.querySelector('.btn-primary').click(); }, id);
      await page.waitForTimeout(80);
      const done = await page.evaluate((id) => !!SX.ui.state.done[id], id);
      check(done, 'ml ' + id + (done ? '' : ' — ' + await page.textContent(`.ch-card[data-id="${id}"] .ch-msg`)));
    };
    // 1. sort the columns (one wrong first)
    const roles = await page.evaluate(() => SX.mldata.COLUMNS.map((c) => [c.name, c.role]));
    for (const [name, role] of roles) await page.selectOption(`select[data-col="${name}"]`, name === 'restock_after' ? 'feature' : role);
    await safeClick('text=Check my sorting');
    check((await page.textContent('#ml-examples .rd-status')).includes('10 of 11'), 'ml: a leaky column sorted as a feature is caught');
    await page.selectOption('select[data-col="restock_after"]', 'leak');
    await safeClick('text=Check my sorting');
    await checkCh('ml-roles'); await checkCh('ml-quiz-label');
    // 2–3. consoles in the sections
    await runIn('#ml-balance', 'SELECT stockout, COUNT(*) FROM ml_examples GROUP BY stockout;'); await checkCh('ml-balance');
    await safeClick('text=Score it on the test rows');
    check((await page.textContent('#ml-balance .ml-metrics')).includes('0 of'), 'ml: the lazy baseline catches no stockouts');
    await runIn('#ml-missing', 'SELECT COUNT(*) FROM ml_examples WHERE units_last_week IS NULL;'); await checkCh('ml-nulls');
    await runIn('#ml-leak', 'SELECT split, COUNT(*) FROM ml_examples GROUP BY split;'); await checkCh('ml-split');
    await safeClick('text=🔍 Find copies across the split');
    check((await page.$$('#ml-leak .ml-split .ml-sq.dup')).length === 8, 'ml: 4 leaked pairs highlighted');
    await runIn('#ml-leak', 'SELECT week, store_id, sku FROM ml_examples GROUP BY week, store_id, sku HAVING COUNT(DISTINCT split) > 1;'); await checkCh('ml-dupes');
    await checkCh('ml-quiz-leak');
    await safeClick('text=Train a model that uses restock_after'); await checkCh('ml-leakdemo');
    // 5. the starter is missing the category JOIN: the check says so, then fix it
    await safeClick('#ml-features .rd-console-wrap .btn-primary');
    const msg = await page.evaluate(() => { const c = document.querySelector('.ch-card[data-id="ml-features"]'); c.classList.add('open'); c.querySelector('.btn-primary').click(); return c.querySelector('.ch-msg').textContent; });
    check(msg.includes('category'), 'ml: the starter train_set is rejected for missing category');
    await runIn('#ml-features', "DROP TABLE train_set; CREATE TABLE train_set AS SELECT e.example_id, e.promo, e.price, e.units_last_week, e.in_stock_start, p.category, e.stockout FROM ml_examples e JOIN products p ON e.sku = p.sku WHERE e.split = 'train';");
    await checkCh('ml-features');
    // 6. grade the model
    await runIn('#ml-grade', 'SELECT AVG(p.predicted = e.stockout) FROM predictions p JOIN ml_examples e ON p.example_id = e.example_id;'); await checkCh('ml-accuracy');
    await runIn('#ml-grade', 'SELECT e.stockout, p.predicted, COUNT(*) FROM predictions p JOIN ml_examples e ON p.example_id = e.example_id GROUP BY e.stockout, p.predicted;'); await checkCh('ml-confusion');
    await checkCh('ml-quiz-baseline');
    await safeClick('.ml-cell.fn');
    check((await page.textContent('.ml-detail')).includes('MISSED'), 'ml: confusion-matrix box explains itself');
    check(await page.evaluate(() => SX.ui.lessonComplete('ml')), 'ml practice complete -> test unlocked');
    check(errors.length === 0, 'ml no page errors ' + errors.join(' | '));
    await page.waitForTimeout(1500);
    await passTest(page, 'ml');
    // the sealed progress file carries everything (certificate AND work) to a fresh computer
    await page.evaluate(() => document.querySelectorAll('.modal-overlay, #cert-overlay').forEach((m) => m.remove()));
    await page.evaluate(() => SX.ui.profile());
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.save-file')]);
    const fileText = require('fs').readFileSync(await dl.path(), 'utf8');
    const p2 = await browser.newPage();
    await p2.goto(DIST);
    await p2.click('text=Coming back? Load your progress file');
    await p2.fill('.welcome-load textarea', fileText.replace('"student": "Morgan Lee"', '"student": "Someone Else"'));
    await p2.click('.welcome-load >> text=Load my progress');
    check((await p2.textContent('.welcome-load .load-msg')).length > 10, 'restore: an edited progress file is refused');
    await p2.setInputFiles('.welcome-load .file-pick', { name: 'SheetEX-Morgan-Lee.json', mimeType: 'application/json', buffer: Buffer.from(fileText) });
    await p2.waitForTimeout(400);
    check(await p2.evaluate(() => SX.ui.state.name === 'Morgan Lee' && SX.ui.lessonCertified('ml')), 'restore: picking the .json file brings back the name and certificate');
    const work = (pg) => pg.evaluate(() => JSON.stringify([SX.ui.state.wb, SX.ui.state.db, SX.ui.state.files, Object.keys(SX.ui.state.done).sort(), SX.ui.state.xp]));
    const f = JSON.parse(fileText);
    check((await work(p2)) === JSON.stringify([f.work.wb, f.work.db, f.work.files, Object.keys(f.progress.done).sort(), f.progress.xp]), 'restore: all work, challenges and XP come back exactly');
    await p2.evaluate(() => SX.ui.showCert('ml')); await p2.waitForSelector('.cert-paper');
    check((await p2.textContent('.cert-name')) === 'Morgan Lee', 'restore: certificate shows the locked name');
    await p2.close();
    await page.close();
  }
  await browser.close();
  if (failures.length) { console.error('\n' + failures.length + ' failure(s)'); process.exit(1); }
  console.log('\nEnd-to-end lessons passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
