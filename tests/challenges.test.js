// Every challenge must be solvable: run a reference solution through its real checker.
const test = require('node:test');
const assert = require('node:assert');
const SX = require('./load.js')(['platforms.js', 'csv.js', 'challenges.js']);

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
  'gs-query': ['gs', [['Scratch!H2', '=QUERY(Products!A1:H25,"select C, sum(F) group by C")']]],
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
