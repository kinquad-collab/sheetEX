// End-to-end: complete whole lessons through the real UI (typing formulas, Ctrl+D, clicking Check),
// in Excel 365 AND Google Sheets mode, and confirm the certificates unlock.  node tests/e2e-lessons.js
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const DIST = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
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
  for (const plat of ['xl365', 'gs']) {
    console.log('\n== Data Wrangling Lab on ' + plat + ' ==');
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(DIST);
    await page.fill('.modal input', 'Avery Johnson'); await page.keyboard.press('Enter'); await page.evaluate(() => { SX.ui.state.ui.guideSeen = {}; SX.lessons.LIST.forEach((l) => { SX.ui.state.ui.guideSeen[l.id] = true; }); SX.ui.state.ui.wrIntro = true; SX.ui.state.ui.wrIntroDone = true; });
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
    for (const L of ['wr1', 'wr2']) {
      await page.evaluate((L) => SX.ui.showCert(L), L);
      await page.waitForSelector('.cert-paper');
      check((await page.textContent('.cert-lesson')).includes(L === 'wr1' ? 'Cleaning' : 'Combining'), plat + ' certificate for ' + L);
      await page.evaluate(() => document.querySelector('#cert-overlay').remove());
    }
    check(errors.length === 0, plat + ' no page errors ' + errors.join(' | '));
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
    await page.fill('.modal input', 'Riley Brooks'); await page.keyboard.press('Enter'); await page.evaluate(() => { SX.ui.state.ui.guideSeen = {}; SX.lessons.LIST.forEach((l) => { SX.ui.state.ui.guideSeen[l.id] = true; }); SX.ui.state.ui.wrIntro = true; SX.ui.state.ui.wrIntroDone = true; });
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
    check(await page.evaluate((p) => SX.ui.lessonComplete(p), plat), plat + ' lesson complete -> certificate unlocked');
    check(errors.length === 0, plat + ' no page errors ' + errors.join(' | '));
    await page.close();
  }

  // ---- SQL lesson through the SQL console ----
  {
    console.log('\n== SQL lesson ==');
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(DIST);
    await page.fill('.modal input', 'Sam Patel'); await page.keyboard.press('Enter'); await page.evaluate(() => { SX.ui.state.ui.guideSeen = {}; SX.lessons.LIST.forEach((l) => { SX.ui.state.ui.guideSeen[l.id] = true; }); SX.ui.state.ui.wrIntro = true; SX.ui.state.ui.wrIntroDone = true; });
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
    check(await page.evaluate(() => SX.ui.lessonComplete('sql')), 'sql lesson complete -> certificate unlocked');
    check(errors.length === 0, 'sql no page errors ' + errors.join(' | '));
    await page.close();
  }

  // ---- CSV lesson through the text editor ----
  {
    console.log('\n== CSV lesson ==');
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(DIST);
    await page.fill('.modal input', 'Casey Wright'); await page.keyboard.press('Enter'); await page.evaluate(() => { SX.ui.state.ui.guideSeen = {}; SX.lessons.LIST.forEach((l) => { SX.ui.state.ui.guideSeen[l.id] = true; }); SX.ui.state.ui.wrIntro = true; SX.ui.state.ui.wrIntroDone = true; });
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
    await page.fill('.modal input', 'stores.tsv'); await page.click('.modal .btn-primary');
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
    check(await page.evaluate(() => SX.ui.lessonComplete('csv')), 'csv lesson complete -> certificate unlocked');
    check(errors.length === 0, 'csv no page errors ' + errors.join(' | '));
    await page.close();
  }
  // ---- Lesson 9: What is an RDBMS? — driven only through the page's own buttons, inputs and consoles ----
  {
    console.log('\n== RDBMS lesson ==');
    const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(DIST);
    await page.fill('.modal input', 'Riley Chen'); await page.keyboard.press('Enter'); await page.evaluate(() => { SX.ui.state.ui.guideSeen = {}; SX.lessons.LIST.forEach((l) => { SX.ui.state.ui.guideSeen[l.id] = true; }); SX.ui.state.ui.wrIntro = true; SX.ui.state.ui.wrIntroDone = true; });
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
    check(await page.evaluate(() => SX.ui.lessonComplete('rdbms')), 'rdbms lesson complete -> certificate unlocked');
    await page.waitForTimeout(1500); await clear();
    await page.evaluate(() => SX.ui.showCert('rdbms')); await page.waitForSelector('.cert-paper');
    check((await page.textContent('.cert-lesson')).includes('RDBMS'), 'rdbms certificate shows the lesson title');
    check(errors.length === 0, 'rdbms no page errors ' + errors.join(' | '));
    await page.close();
  }
  await browser.close();
  if (failures.length) { console.error('\n' + failures.length + ' failure(s)'); process.exit(1); }
  console.log('\nEnd-to-end lessons passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
