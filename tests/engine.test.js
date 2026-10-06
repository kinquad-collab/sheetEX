// The point of SheetEX is that each platform behaves like the real app. These tests lock that in.
const test = require('node:test');
const assert = require('node:assert');
const SX = require('./load.js')(['platforms.js', 'csv.js']);

function run(plat, formula, opts = {}) {
  const wb = SX.makeStoreWorkbook(plat);
  const [r, c] = opts.at || [1, 1];
  const p = wb.prepare(formula, { cse: opts.cse });
  if (p.dialog) return { dialog: p.dialog };
  wb.applyEdits([{ sheet: 'Scratch', r, c, cell: p.cell }]);
  const d = wb.display('Scratch', r, c);
  const sp = wb.spills['Scratch|' + r + ',' + c];
  return { text: d.text, err: d.err && d.err.code, msg: d.err && d.err.msg, value: wb.value('Scratch', r, c), spill: sp && sp.mat.rows };
}
const eq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a ?? null)), JSON.parse(JSON.stringify(b ?? null)), m); // values come from another VM realm

test('modern functions: available in 365 and Sheets, #NAME? in 2013', () => {
  for (const f of ['=XLOOKUP("SKU-302",Products!A2:A25,Products!B2:B25)', '=IFS(1>0,"x")', '=TEXTJOIN(",",TRUE,"a","b")', '=MAXIFS(Products!D2:D25,Products!C2:C25,"Snacks")']) {
    assert.notStrictEqual(run('xl365', f).err, '#NAME?', f);
    assert.notStrictEqual(run('gs', f).err, '#NAME?', f);
    eq(run('xl2013', f).err, '#NAME?', f);
  }
});
test('Sheets-only functions are #NAME? in both Excels', () => {
  for (const f of ['=SPLIT("a,b",",")', '=REGEXMATCH("a1","\\d")', '=QUERY(Products!A1:H25,"select A")', '=ARRAYFORMULA(1)']) {
    eq(run('xl365', f).err, '#NAME?', f);
    eq(run('xl2013', f).err, '#NAME?', f);
    assert.notStrictEqual(run('gs', f).err, '#NAME?', f);
  }
});
test('INDEX/MATCH works everywhere', () => {
  for (const p of ['xl365', 'xl2013', 'gs']) eq(run(p, '=INDEX(Products!B2:B25,MATCH("SKU-404",Products!A2:A25,0))').value, 'Flash Drive 64GB');
});
test('MAX(IF()) needs CSE in 2013 and ARRAYFORMULA in Sheets, but not in 365', () => {
  const f = '=MAX(IF(Products!C2:C25="Snacks",Products!D2:D25))';
  eq(run('xl365', f).value, 2.75);
  assert.notStrictEqual(run('xl2013', f).value, 2.75);
  eq(run('xl2013', f, { cse: true }).value, 2.75);
  assert.notStrictEqual(run('gs', f).value, 2.75);
  eq(run('gs', '=ARRAYFORMULA(' + f.slice(1) + ')').value, 2.75);
});
test('implicit intersection in 2013 uses the same row', () => {
  eq(run('xl2013', '=Products!D2:D25', { at: [3, 1] }).value, 1.25); // row 4 -> D4
  eq(run('xl2013', '=Products!D2:D25', { at: [40, 1] }).err, '#VALUE!');
});
test('FILTER: Excel if_empty vs Sheets conditions', () => {
  eq(run('xl365', '=FILTER(Products!B2:B25,Products!C2:C25="Nope","None")').value, 'None');
  eq(run('xl365', '=FILTER(Products!B2:B25,Products!C2:C25="Nope")').err, '#CALC!');
  const gs = run('gs', '=FILTER(Products!B2:B25,Products!C2:C25="Apparel","None")');
  eq(gs.err, '#VALUE!'); assert.match(gs.msg, /mismatched range sizes/);
  eq(run('gs', '=FILTER(Products!B2:B25,Products!C2:C25="Nope")').err, '#N/A');
  eq(run('gs', '=FILTER(Products!B2:B25,Products!C2:C25="Snacks",Products!D2:D25>1)').spill.length, 3);
});
test('SORT: Excel needs 1/-1, Sheets treats -1 as TRUE (ascending)', () => {
  eq(run('xl365', '=SORT(Products!B2:D25,3,-1)').spill[0][0], 'Hoodie');
  eq(run('xl365', '=SORT(Products!B2:D25,3,FALSE)').err, '#VALUE!');
  eq(run('gs', '=SORT(Products!B2:D25,3,FALSE)').spill[0][0], 'Hoodie');
  assert.notStrictEqual(run('gs', '=SORT(Products!B2:D25,3,-1)').spill[0][0], 'Hoodie');
});
test('CONCAT: any number of args in Excel 365, exactly two in Sheets', () => {
  eq(run('xl365', '=CONCAT("a","b","c")').value, 'abc');
  const gs = run('gs', '=CONCAT("a","b","c")');
  eq(gs.err, '#N/A'); assert.match(gs.msg, /Wrong number of arguments to CONCAT/);
});
test('blank reference: Excel shows 0, Sheets shows blank', () => {
  eq(run('xl365', '=Z50').text, '0');
  eq(run('xl2013', '=Z50').text, '0');
  eq(run('gs', '=Z50').text, '');
});
test('parse errors: Excel refuses with a dialog, Sheets stores #ERROR!', () => {
  assert.ok(run('xl365', '=SUM(1,2)+').dialog);
  assert.ok(run('xl2013', '=IF(1,2,3,4)').dialog);
  eq(run('gs', '=SUM(1,2)+').err, '#ERROR!');
});
test('open-ended ranges only in Sheets; @ and # only in 365', () => {
  eq(run('gs', '=SUM(Sales!E2:E)').value, SX.data.SALES.reduce((a, s) => a + s[4], 0));
  assert.ok(run('xl365', '=SUM(Sales!E2:E)').dialog);
  assert.ok(run('gs', '=@A1').dialog === undefined && run('gs', '=@A1').err === '#ERROR!');
  assert.ok(run('xl2013', '=@A1').dialog);
});
test('spill blocked -> #SPILL! in Excel, #REF! in Sheets', () => {
  for (const [p, code] of [['xl365', '#SPILL!'], ['gs', '#REF!']]) {
    const wb = SX.makeStoreWorkbook(p);
    wb.applyEdits([{ sheet: 'Scratch', r: 3, c: 1, cell: { input: 'blocker' } }]);
    wb.applyEdits([{ sheet: 'Scratch', r: 1, c: 1, cell: wb.prepare('=UNIQUE(Products!C2:C25)').cell }]);
    eq(wb.display('Scratch', 1, 1).err.code, code);
  }
});
test('spill reference A1# and dependent formulas', () => {
  const wb = SX.makeStoreWorkbook('xl365');
  wb.applyEdits([{ sheet: 'Scratch', r: 1, c: 1, cell: wb.prepare('=UNIQUE(Products!C2:C25)').cell }]);
  wb.applyEdits([{ sheet: 'Scratch', r: 1, c: 3, cell: wb.prepare('=COUNTA(B2#)').cell }]);
  wb.applyEdits([{ sheet: 'Scratch', r: 1, c: 4, cell: wb.prepare('=B4').cell }]);
  eq(wb.value('Scratch', 1, 3), 5);
  eq(wb.value('Scratch', 1, 4), 'School Supplies');
});
test('VLOOKUP defaults to approximate match (the classic bug)', () => {
  eq(run('xl365', '=VLOOKUP("Hoodie",Products!B2:D25,3,FALSE)').value, 34.99);
  assert.notStrictEqual(run('xl365', '=VLOOKUP("Hoodie",Products!B2:D25,3)').value, 34.99);
});
test('arithmetic and coercion rules', () => {
  eq(run('xl365', '=-2^2').value, 4);
  eq(run('xl365', '="5"+1').value, 6);
  eq(run('xl365', '="abc"+1').err, '#VALUE!');
  eq(run('xl365', '=1/0').err, '#DIV/0!');
  eq(run('xl365', '=ROUND(2.675,2)').value, 2.68);
  eq(run('xl365', '=TEXT(1234.5,"$#,##0.00")').value, '$1,234.50');
  eq(run('xl365', '=TEXT(DATE(2026,9,1),"mmmm d, yyyy")').value, 'September 1, 2026');
  eq(run('xl365', '=COUNTIF(Products!B2:B25,"*Drink*")').value, 1);
});
test('circular references', () => {
  eq(run('xl365', '=B2').value, 0);
  eq(run('gs', '=B2').err, '#REF!');
});
test('copy/paste shifts relative refs and keeps absolute refs', () => {
  eq(SX.f.shiftFormula('E2*XLOOKUP(D2,Products!$A$2:$A$25,Products!$D$2:$D$25)', 3, 0), 'E5*XLOOKUP(D5,Products!$A$2:$A$25,Products!$D$2:$D$25)');
  eq(SX.f.shiftFormula('A1+$B1+C$1', 1, 1), 'B2+$B2+D$1');
  eq(SX.f.shiftFormula('A1', -1, 0), '#REF!');
});
test('translator rewrites for older/other platforms', () => {
  const P = SX.platforms, parse = (s) => SX.f.parse(s, { allowOpen: true });
  eq(P.translate(parse('XLOOKUP(A1,B:B,C:C,"none")'), 'xl365', 'xl2013').text, '=IFERROR(INDEX(C:C, MATCH(A1, B:B, 0)), "none")');
  eq(P.translate(parse('IFS(A1>1,"a",TRUE,"b")'), 'xl365', 'xl2013').text, '=IF(A1>1, "a", "b")');
  eq(P.translate(parse('SORT(A1:B5,2,-1)'), 'xl365', 'gs').text, '=SORT(A1:B5, 2, FALSE)');
  eq(P.translate(parse('SORT(A1:B5,2,FALSE)'), 'gs', 'xl365').text, '=SORT(A1:B5, 2, -1)');
  assert.ok(P.translate(parse('MAXIFS(A1:A5,B1:B5,"x")'), 'xl365', 'xl2013').cse);
  // the rewrite must produce the same answer
  const f2013 = P.translate(parse('MAXIFS(Products!D2:D25,Products!C2:C25,"Snacks")'), 'xl365', 'xl2013');
  eq(run('xl2013', f2013.text, { cse: true }).value, 2.75);
  const cu = P.translate(parse('COUNTUNIQUE(Sales!F2:F61)'), 'gs', 'xl2013');
  eq(Math.round(run('xl2013', cu.text).value), run('gs', '=COUNTUNIQUE(Sales!F2:F61)').value);
});
test('CSV parsing, quoting and spreadsheet auto-conversion', () => {
  const p = SX.csv.parse('a,b\n"x, y","say ""hi"""\n1,2,3\n', ',');
  eq(p.rows[1].cells.map((c) => c.v), ['x, y', 'say "hi"']);
  assert.ok(p.rows[2].bad);
  eq(SX.csv.autoConvert('05401').v, '5401');
  eq(SX.csv.autoConvert('4417123456789012').v, '4.41712E+15');
  eq(SX.csv.stringify([['Gel Pens, 4-pack', '12" Ruler']], ','), '"Gel Pens, 4-pack","12"" Ruler"\n');
  const wb = SX.makeStoreWorkbook('xl365');
  wb.applyEdits([{ sheet: 'Products', r: 1, c: 8, cell: wb.prepare('=D2-E2').cell }]);
  const ex = SX.csv.exportSheet(wb, 'Products', ',');
  eq(ex.formulas, 1);
  assert.ok(!/=D2-E2/.test(ex.text) && /,0\.9\n/.test(ex.text.split('\n')[1] + '\n'));
});
test('SQL: SQLite semantics students trip over', () => {
  const db = SX.sql.makeStoreDb(), q = (s) => SX.sql.execute(db, s).pop();
  eq(q('SELECT 7/2, 7/2.0').rows[0], [3, 3.5]);
  eq(q("SELECT COUNT(*) FROM products WHERE category = 'snacks'").rows[0][0], 0); // case-sensitive
  eq(q("SELECT COUNT(*) FROM products WHERE category LIKE 'snacks'").rows[0][0], 5);
  assert.throws(() => q('SELECT * FROM products WHERE category = "Snacks"'), /no such column: Snacks/);
  assert.throws(() => q('SELECT * FROM products WHERE COUNT(*) > 1'), /misuse of aggregate/);
  eq(q("SELECT strftime('%m', order_date) AS m, COUNT(*) FROM sales GROUP BY m").rows.length, 2);
  eq(q('SELECT product FROM products WHERE price > (SELECT AVG(price) FROM products) ORDER BY price DESC LIMIT 1').rows[0][0], 'Hoodie');
});
