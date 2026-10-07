// Every challenge must be solvable: run a reference solution through its real checker.
const test = require('node:test');
const assert = require('node:assert');
const SX = require('./load.js')(['platforms.js', 'challenges.js']);

function sheetSolve(plat, steps) {
  const wb = SX.makeStoreWorkbook(plat);
  for (const [addr, input, opts] of steps) {
    const m = /^(.+)!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(addr);
    const c = SX.f.colToIdx(m[2]), r1 = +m[3] - 1, r2 = m[5] ? +m[5] - 1 : r1;
    const p = wb.prepare(input, opts);
    assert.ok(!p.dialog, addr + ' ' + input + ' -> ' + p.dialog + ' ' + p.detail);
    wb.applyEdits([{ sheet: m[1], r: r1, c, cell: p.cell }]);
    if (r2 > r1) { // fill down like Ctrl+D
      const clip = wb.copy(m[1], r1, c, r1, c);
      wb.applyEdits(wb.pasteEdits(clip, m[1], r1 + 1, c, r2 - r1, 1));
    }
  }
  return SX.challenges.sheetHelpers(wb);
}
const SHEET = {
  '365-sum': ['xl365', [['Scratch!B2', '=SUM(Products!F2:F25)']]],
  '365-invvalue': ['xl365', [['Scratch!B3', '=SUM(Products!D2:D25*Products!F2:F25)']]],
  '365-countif': ['xl365', [['Scratch!B4', '=COUNTIF(Products!C2:C25,"School Supplies")']]],
  '365-sumif': ['xl365', [['Scratch!B5', '=SUMIF(Sales!C2:C61,"S03",Sales!E2:E61)']]],
  '365-xlookup': ['xl365', [['Scratch!A7', 'SKU-404'], ['Scratch!B7', '=XLOOKUP(A7,Products!A2:A25,Products!B2:B25)']]],
  '365-filter': ['xl365', [['Scratch!D2', '=FILTER(Products!B2:B25,Products!C2:C25="Drinks")']]],
  '365-sortunique': ['xl365', [['Scratch!F2', '=SORT(UNIQUE(Products!C2:C25))']]],
  '365-ifs': ['xl365', [['Products!I1', 'Status'], ['Products!I2:I25', '=IFS(F2<G2,"Reorder",F2<G2*1.5,"Low",TRUE,"OK")']]],
  '365-let': ['xl365', [['Scratch!B9', '=LET(p,XLOOKUP("SKU-502",Products!A2:A25,Products!D2:D25),c,XLOOKUP("SKU-502",Products!A2:A25,Products!E2:E25),(p-c)/p)']]],
  '365-revenue': ['xl365', [['Sales!G1', 'Revenue'], ['Sales!G2:G61', '=E2*XLOOKUP(D2,Products!$A$2:$A$25,Products!$D$2:$D$25)']]],
  '13-name': ['xl2013', [['Scratch!B2', '=XLOOKUP("SKU-101",Products!A2:A25,Products!B2:B25)']]],
  '13-indexmatch': ['xl2013', [['Scratch!B3', '=INDEX(Products!B2:B25,MATCH("SKU-404",Products!A2:A25,0))']]],
  '13-vlookup': ['xl2013', [['Scratch!B4', '=VLOOKUP("Hoodie",Products!B2:D25,3,FALSE)']]],
  '13-nestedif': ['xl2013', [['Products!I2:I25', '=IF(F2<G2,"Reorder",IF(F2<G2*1.5,"Low","OK"))']]],
  '13-iferror': ['xl2013', [['Scratch!A6', 'SKU-101'], ['Scratch!B6', '=IFERROR(VLOOKUP(A6,Products!A2:B25,2,FALSE),"Not found")']]],
  '13-cse': ['xl2013', [['Scratch!B7', '=MAX(IF(Products!C2:C25="Electronics",Products!D2:D25))', { cse: true }]]],
  '13-concat': ['xl2013', [['Scratch!B8', '=Products!B2&" - "&TEXT(Products!D2,"$0.00")']]],
  '13-sumifs': ['xl2013', [['Scratch!B9', '=SUMIFS(Sales!E2:E61,Sales!C2:C61,"S02",Sales!D2:D61,"SKU-3*")']]],
  'gs-filter1': ['gs', [['Scratch!B2', '=FILTER(Products!B2:B25,Products!C2:C25="Apparel")']]],
  'gs-filter2': ['gs', [['Scratch!D2', '=FILTER(Products!B2:B25,Products!C2:C25="Snacks",Products!D2:D25>1)']]],
  'gs-sort': ['gs', [['Scratch!F2', '=SORT(Products!B2:D25,3,FALSE)']]],
  'gs-arrayformula': ['gs', [['Products!I2', '=ARRAYFORMULA(D2:D25-E2:E25)']]],
  'gs-query': ['gs', [['Scratch!J2', '=QUERY(Products!A1:H25,"select C, sum(F) group by C")']]],
  'gs-split': ['gs', [['Scratch!B10', '=SPLIT(Stores!E2," ")']]],
  'gs-open': ['gs', [['Scratch!B12', '=SUM(Sales!E2:E)']]],
  'gs-concat': ['gs', [['Scratch!B13', '=CONCATENATE(Stores!B2,", ",Stores!C2)']]],
  'gs-regex': ['gs', [['Scratch!B14', '=SUMPRODUCT(--REGEXMATCH(Products!B2:B25,"\\d"))']]],
};
// Wrong-but-plausible answers that must NOT pass
const WRONG = {
  '13-vlookup': ['xl2013', [['Scratch!B4', '=VLOOKUP("Hoodie",Products!B2:D25,3)']]],
  '13-cse': ['xl2013', [['Scratch!B7', '=MAX(IF(Products!C2:C25="Electronics",Products!D2:D25))']]],
  'gs-sort': ['gs', [['Scratch!F2', '=SORT(Products!B2:D25,3,-1)']]],
  'gs-filter1': ['gs', [['Scratch!B2', '=FILTER(Products!B2:B25,Products!C2:C25="Apparel","None")']]],
  'gs-concat': ['gs', [['Scratch!B13', '=CONCAT(Stores!B2,", ",Stores!C2)']]],
  'gs-arrayformula': ['gs', [['Products!I2:I25', '=D2-E2']]],
  '365-xlookup': ['xl365', [['Scratch!A7', 'SKU-404'], ['Scratch!B7', '=XLOOKUP("SKU-404",Products!A2:A25,Products!B2:B25)']]],
};
const SQL = {
  'sql-star': 'SELECT * FROM products;',
  'sql-where': "SELECT product, price FROM products WHERE category = 'Electronics';",
  'sql-top3': 'SELECT product, price FROM products ORDER BY price DESC LIMIT 3;',
  'sql-group': 'SELECT store_id, SUM(qty) FROM sales GROUP BY store_id;',
  'sql-join': 'SELECT s.order_id, p.product FROM sales s JOIN products p ON s.sku = p.sku;',
  'sql-having': 'SELECT category, COUNT(*) FROM products GROUP BY category HAVING COUNT(*) > 5;',
  'sql-city': 'SELECT st.city, SUM(s.qty * p.price) AS revenue FROM sales s JOIN stores st ON s.store_id = st.store_id JOIN products p ON s.sku = p.sku GROUP BY st.city ORDER BY revenue DESC;',
  'sql-avg': 'SELECT AVG(qty) FROM sales;',
  'sql-update': 'UPDATE products SET in_stock = reorder_at * 2 WHERE in_stock < reorder_at;',
};
function sqlHelpers(q) {
  const db = SX.sql.makeStoreDb();
  const res = SX.sql.execute(db, q);
  return { db, last: res[res.length - 1] };
}
function csvHelpers(edit) {
  const files = SX.csv.defaultFiles();
  edit(files);
  return { file: (n) => files[n] };
}
const CSV = {
  'csv-export': (f) => { const wb = SX.makeStoreWorkbook('xl365'); f['export_Products.csv'] = SX.csv.exportSheet(wb, 'Products', ',').text; },
  'csv-fix-comma': (f) => { f['broken_products.csv'] = f['broken_products.csv'].replace('Gel Pens, 4-pack', '"Gel Pens, 4-pack"'); },
  'csv-tsv': (f) => { f['stores.tsv'] = f['stores.csv'].replace(/,/g, '\t'); },
  'csv-quote': (f) => { f['products.csv'] += 'SKU-307,"12"" Ruler",School Supplies,1.99,0.6,30,10,Office Hub Supply\n'; },
};

for (const ch of SX.challenges.LIST) {
  if (/^wr[12]$/.test(ch.plat) || ch.plat === 'rdbms') continue; // covered by dedicated tests below
  if (ch.type === 'quiz') {
    test('quiz ' + ch.id + ' is well-formed', () => { assert.ok(ch.options[ch.answer]); });
    continue;
  }
  test('challenge ' + ch.id + ' is solvable', () => {
    let h;
    if (SHEET[ch.id]) h = sheetSolve(...SHEET[ch.id]);
    else if (SQL[ch.id]) h = sqlHelpers(SQL[ch.id]);
    else if (CSV[ch.id]) h = csvHelpers(CSV[ch.id]);
    else assert.fail('no reference solution for ' + ch.id);
    const r = ch.check(h);
    assert.ok(r.ok, ch.id + ': ' + r.msg);
  });
  test('challenge ' + ch.id + ' rejects the untouched starting state', () => {
    let h;
    if (ch.plat === 'sql') h = { db: SX.sql.makeStoreDb(), last: null };
    else if (ch.plat === 'csv') h = csvHelpers(() => {});
    else h = SX.challenges.sheetHelpers(SX.makeStoreWorkbook(ch.plat));
    assert.ok(!ch.check(h).ok);
  });
}
for (const id of Object.keys(WRONG)) {
  test('challenge ' + id + ' rejects a common mistake', () => {
    const r = SX.challenges.byId(id).check(sheetSolve(...WRONG[id]));
    assert.ok(!r.ok, 'should fail: ' + r.msg);
  });
}
test('SQL integer-division answer is rejected', () => {
  const r = SX.challenges.byId('sql-avg').check(sqlHelpers('SELECT SUM(qty)/COUNT(*) FROM sales;'));
  assert.ok(!r.ok);
});
test('SQL update without WHERE is rejected', () => {
  const r = SX.challenges.byId('sql-update').check(sqlHelpers('UPDATE products SET in_stock = reorder_at * 2;'));
  assert.ok(!r.ok);
});

// ---- v2: Data Wrangling Lab — every challenge solvable in BOTH Excel 365 and Google Sheets ----
function wrSolve(plat, steps) {
  const wb = SX.wrangle.makeWorkbook(plat);
  for (const [addr, input] of steps) {
    const m = /^(.+)!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(addr);
    const c = SX.f.colToIdx(m[2]), r1 = +m[3] - 1, r2 = m[5] ? +m[5] - 1 : r1;
    const p = wb.prepare(input);
    assert.ok(!p.dialog, addr + ' ' + input + ' -> ' + p.dialog);
    wb.applyEdits([{ sheet: m[1], r: r1, c, cell: p.cell }]);
    if (r2 > r1) wb.applyEdits(wb.pasteEdits(wb.copy(m[1], r1, c, r1, c), m[1], r1 + 1, c, r2 - r1, 1));
  }
  return SX.challenges.sheetHelpers(wb);
}
const WR_ALL = [
  ['RawOrders!I2:I31', '=TEXT(C2,"0000")'],
  ['Report!B2', '=COUNTBLANK(RawOrders!E2:E31)'],
  ['Report!B3', '=COUNTIF(RawOrders!E2:E31,"N/A")+COUNTIF(RawOrders!E2:E31,"-")+COUNTIF(RawOrders!E2:E31,"null")'],
  ['RawOrders!J2:J31', '=IFERROR(VALUE(E2),"")'],
  ['RawOrders!K2:K31', '=UPPER(TRIM(B2))'],
  ['RawOrders!L2:L31', '=VALUE(F2)'],
  ['RawOrders!M2:M31', '=IF(ISNUMBER(D2),D2,DATEVALUE(D2))'],
  ['Report!B5', '=DATE(RIGHT(RawOrders!D19,4),MID(RawOrders!D19,4,2),LEFT(RawOrders!D19,2))'],
  ['RawOrders!N2:N31', '=IF(ISNUMBER(FIND(",",G2)),PROPER(TRIM(MID(G2,FIND(",",G2)+1,99))&" "&LEFT(G2,FIND(",",G2)-1)),PROPER(TRIM(G2)))'],
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
for (const plat of ['xl365', 'gs']) {
  test('wrangling lab: every challenge solvable in ' + plat, () => {
    const h = wrSolve(plat, WR_ALL);
    for (const ch of SX.challenges.LIST.filter((c) => /^wr[12]$/.test(c.plat) && c.type !== 'quiz')) {
      const r = ch.check(h);
      assert.ok(r.ok, plat + ' ' + ch.id + ': ' + r.msg);
    }
  });
}
test('wrangling lab: untouched workbook passes nothing', () => {
  const h = SX.challenges.sheetHelpers(SX.wrangle.makeWorkbook('xl365'));
  for (const ch of SX.challenges.LIST.filter((c) => /^wr[12]$/.test(c.plat) && c.type !== 'quiz')) assert.ok(!ch.check(h).ok, ch.id);
});
test('wrangling lab: classic mistakes are caught', () => {
  const bad = [
    ['wr-code', [['RawOrders!I2:I31', '=C2']]],
    ['wr-qty', [['RawOrders!J2:J31', '=VALUE(E2)']]],
    ['wr-filter', [['RawOrders!J2:J31', '=IFERROR(VALUE(E2),"")'], ['Report!D2', '=FILTER(RawOrders!A2:A31,RawOrders!J2:J31>10)']]],
    ['wr-mailing', [['Contacts!H2:H9', '=C2&", "&D2&" "&E2']]],
    ['wr-vlookup', [['RawOrders!O2:O31', '=VLOOKUP(C2,ItemCodes!$A$2:$D$25,2,FALSE)']]],
  ];
  for (const [id, steps] of bad) assert.ok(!SX.challenges.byId(id).check(wrSolve('xl365', steps)).ok, id + ' should fail');
});

test('certificate codes round-trip and reject tampering', () => {
  const L = require('./load.js')(['lessons.js']).lessons;
  const code = L.certCode({ name: 'Jordan Smith', lesson: 'wr1', xp: 200, maxXp: 225, hints: 2, count: 11, time: 1790000000000 });
  const back = L.readCert(code);
  assert.strictEqual(back.name, 'Jordan Smith');
  assert.strictEqual(back.title, 'Data Wrangling I: Cleaning Data for AI');
  assert.strictEqual(back.xp, 200);
  const parts = code.split('-');
  const forged = L.certCode({ name: 'Jordan Smith', lesson: 'wr1', xp: 225, maxXp: 225, hints: 0, count: 11, time: 1790000000000 }).split('-')[1];
  assert.strictEqual(L.readCert(parts[0] + '-' + forged + '-' + parts[2]), null);
  assert.strictEqual(L.readCert(code.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a'))), null);
  assert.ok(L.readCert(L.certCode({ name: 'José Núñez', lesson: 'sql', xp: 1, maxXp: 2, hints: 0, count: 1, time: 1 })).name === 'José Núñez');
});
test('every challenge belongs to a lesson', () => {
  const S = require('./load.js')(['platforms.js', 'challenges.js', 'lessons.js']);
  for (const c of S.challenges.LIST) assert.ok(S.lessons.byId(c.plat), c.id + ' has no lesson');
});

test('AI readiness: raw model is wrong, cleaned model is exact, score reaches 100', () => {
  const W = SX.wrangle;
  const raw = W.makeWorkbook('xl365');
  const r0 = W.aiReport((r, c) => raw.value('RawOrders', r, c));
  assert.ok(r0.phantom.length >= 5, 'raw data invents extra stores: ' + r0.phantom.join('|'));
  assert.ok(r0.rawErr > 1, 'raw model should be off by more than 1 unit, got ' + r0.rawErr);
  assert.strictEqual(r0.clean, null);
  assert.strictEqual(r0.score, 0);
  const h = wrSolve('gs', WR_ALL);
  const r1 = W.aiReport((r, c) => h.wb.value('RawOrders', r, c));
  assert.ok(r1.cleanErr < 1e-9, 'clean model should match the truth exactly, got ' + r1.cleanErr);
  assert.strictEqual(r1.score, 100);
  assert.strictEqual(r1.matchClean, 30);
  assert.ok(r1.matchRaw < 30);
});

// ---- The teacher answer key (src/teacher/solutions.js) must be correct for every non-quiz challenge ----
const KEY = require('../src/teacher/solutions.js');
function applySteps(wb, steps) {
  for (const [addr, input, how] of steps) {
    const m = /^(.+)!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(addr);
    const c = SX.f.colToIdx(m[2]), r1 = +m[3] - 1, r2 = m[5] ? +m[5] - 1 : r1;
    const p = wb.prepare(input, { cse: how === 'cse' });
    assert.ok(!p.dialog, addr + ': ' + p.dialog);
    wb.applyEdits([{ sheet: m[1], r: r1, c, cell: p.cell }]);
    if (r2 > r1) wb.applyEdits(wb.pasteEdits(wb.copy(m[1], r1, c, r1, c), m[1], r1 + 1, c, r2 - r1, 1));
  }
}
// Mirrors RdbmsView.exec in ui-rdbms.js: run SQL on a sandbox and record what the page tracks.
function rdRun(sqls) {
  const db = SX.sql.makeStoreDb(), seen = {}; let txDel = false, sawRollbackDelete = false;
  for (const q of sqls) {
    try {
      SX.sql.execute(db, q).forEach((r) => {
        if (r.statement.type === 'begin') txDel = false;
        if (r.statement.type === 'delete' && /^sales$/i.test(r.statement.table) && r.changed > 0 && db.tx) txDel = true;
        if (r.rolledBack && txDel) sawRollbackDelete = true;
      });
    } catch (e) {
      const m = e.message;
      const k = /^UNIQUE/.test(m) ? 'UNIQUE' : /^NOT NULL/.test(m) ? 'NOT NULL' : /^CHECK/.test(m) ? 'CHECK' : /^FOREIGN KEY/.test(m) ? 'FOREIGN KEY' : /^cannot store/.test(m) ? 'TYPE' : null;
      if (k) seen[k] = true;
    }
  }
  return { db, table: (n) => db.tables[n.toLowerCase()] || null, anomaly: false, errorsSeen: Object.keys(seen), sawRollbackDelete, bankDone: false, last: null };
}
test('lesson 9: SQL challenges are solvable and reject the starting state', () => {
  for (const ch of SX.challenges.forPlat('rdbms').filter((c) => c.type !== 'quiz')) {
    assert.ok(!ch.check(rdRun([])).ok, ch.id + ' should not pass untouched');
  }
  const bad = [
    ['rd-no', ["INSERT INTO products VALUES ('SKU-101','Fake','Snacks',1,0.4,10,5,'X');", "INSERT INTO products VALUES ('SKU-102','Fake','Snacks',1,0.4,10,5,'X');"]], // same kind twice
    ['rd-create', ['CREATE TABLE students (student_id INTEGER, name TEXT);', "INSERT INTO students VALUES (1,'A'),(2,'B');"]], // no keys/rules
    ['rd-fk-create', ['CREATE TABLE students (student_id INTEGER PRIMARY KEY, name TEXT NOT NULL);', 'CREATE TABLE enrollments (student_id INTEGER, course TEXT);', "INSERT INTO enrollments VALUES (1,'AI');"]],
    ['rd-rollback', ['DELETE FROM sales WHERE order_id = 1001;', 'BEGIN;', 'ROLLBACK;']]
  ];
  for (const [id, sqls] of bad) assert.ok(!SX.challenges.byId(id).check(rdRun(sqls)).ok, id + ' should reject a near-miss');
  assert.ok(SX.challenges.byId('rd-anomaly').check(Object.assign(rdRun([]), { anomaly: true })).ok);
  assert.ok(SX.challenges.byId('rd-bank').check(Object.assign(rdRun([]), { bankDone: true })).ok);
});
for (const ch of SX.challenges.LIST.filter((c) => c.type !== 'quiz')) {
  test('teacher answer key is correct: ' + ch.id, () => {
    const k = KEY[ch.id];
    assert.ok(k, 'missing answer key for ' + ch.id);
    if (k.ui) { assert.ok(k.ui.length > 10); return; } // page interaction: verified in tests/e2e-lessons.js
    if (k.rd) { const r = ch.check(rdRun(k.rd)); assert.ok(r.ok, r.msg); return; }
    const plats = k.wr ? ['xl365', 'gs'] : [ch.plat];
    for (const plat of plats) {
      let h;
      if (k.sheet) { const wb = SX.makeStoreWorkbook(plat); applySteps(wb, k.sheet); h = SX.challenges.sheetHelpers(wb); }
      else if (k.wr) {
        const wb = SX.wrangle.makeWorkbook(plat);
        (k.needs || []).forEach((id) => applySteps(wb, KEY[id].wr));
        applySteps(wb, k.wr); h = SX.challenges.sheetHelpers(wb);
      } else if (k.sql) h = sqlHelpers(k.sql);
      else if (k.csv) h = csvHelpers(CSV[ch.id]);
      const r = ch.check(h);
      assert.ok(r.ok, plat + ': ' + r.msg);
    }
  });
}

test('teacher exit-ticket answers are correct', () => {
  const T = require('../src/teacher/discussion.js');
  const run = (plat, f, wbMaker) => { const wb = (wbMaker || SX.makeStoreWorkbook)(plat); wb.applyEdits([{ sheet: 'Scratch', r: 1, c: 1, cell: { input: 'red|green|blue' } }]);
    wb.applyEdits([{ sheet: 'Scratch', r: 1, c: 2, cell: wb.prepare(f.replace(/A2/g, 'B2')).cell }]); return wb.display('Scratch', 1, 2); };
  assert.strictEqual(run('xl365', T.xl365.exitAnswer).text, String(SX.data.PRODUCTS.filter((p) => p[3] > 10).length));
  { const wb = SX.makeStoreWorkbook('xl2013');
    wb.applyEdits([{ sheet: 'Products', r: 1, c: 9, cell: wb.prepare(T.xl2013.exitAnswer).cell }]);
    assert.strictEqual(wb.display('Products', 1, 9).text, 'Bottled Water'); }
  assert.strictEqual(run('xl365', T.wr2.exitAnswer).text, '3');
  const s = run('gs', T.gs.exitAnswer.replace(', 3, TRUE', ',3,TRUE'));
  assert.ok(!s.err);
  const p = SX.csv.parse(T.csv.exitAnswer + '\n', ',');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p.rows[0].cells.map((c) => c.v))), ['Smith, Jo', '05401', 'said "hi"']);
  assert.ok(SX.sql.execute(SX.sql.makeStoreDb(), T.sql.exitAnswer).pop().rows.length === 5);
});
test('lesson 9 exit ticket SQL works', () => {
  const T = require('../src/teacher/discussion.js');
  const db = SX.sql.makeStoreDb(); SX.sql.execute(db, T.rdbms.exitAnswer);
  assert.ok(db.tables.clubs.pk[0] === 'club_id' && db.tables.clubs.notNull.includes('name'));
});
