/* SheetEX — challenge bank. Each challenge is auto-checked against the student's own work. */
(function (SX) {
  'use strict';
  var D = SX.data, E = SX.engine;

  // ---------- expected answers, computed from the dataset ----------
  var P = D.PRODUCTS, S = D.SALES, ST = D.STORES;
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function r2(x) { return Math.round(x * 100) / 100; }
  var bySku = {}; P.forEach(function (p) { bySku[p[0]] = p; });
  var X = {
    totalStock: sum(P.map(function (p) { return p[5]; })),
    invValue: sum(P.map(function (p) { return p[3] * p[5]; })),
    schoolCount: P.filter(function (p) { return p[2] === 'School Supplies'; }).length,
    unitsS03: sum(S.filter(function (s) { return s[2] === 'S03'; }).map(function (s) { return s[4]; })),
    drinks: P.filter(function (p) { return p[2] === 'Drinks'; }).map(function (p) { return p[1]; }),
    apparel: P.filter(function (p) { return p[2] === 'Apparel'; }).map(function (p) { return p[1]; }),
    snacksOver1: P.filter(function (p) { return p[2] === 'Snacks' && p[3] > 1; }).map(function (p) { return p[1]; }),
    catsSorted: P.map(function (p) { return p[2]; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(),
    status: P.map(function (p) { return p[5] < p[6] ? 'Reorder' : p[5] < p[6] * 1.5 ? 'Low' : 'OK'; }),
    margin502: (bySku['SKU-502'][3] - bySku['SKU-502'][4]) / bySku['SKU-502'][3],
    revenue: S.map(function (s) { return s[4] * bySku[s[3]][3]; }),
    maxElectronics: Math.max.apply(null, P.filter(function (p) { return p[2] === 'Electronics'; }).map(function (p) { return p[3]; })),
    s02school: sum(S.filter(function (s) { return s[2] === 'S02' && s[3].indexOf('SKU-3') === 0; }).map(function (s) { return s[4]; })),
    profit: P.map(function (p) { return p[3] - p[4]; }),
    stockByCat: (function () { var m = {}; P.forEach(function (p) { m[p[2]] = (m[p[2]] || 0) + p[5]; }); return m; })(),
    totalQty: sum(S.map(function (s) { return s[4]; })),
    digitNames: P.filter(function (p) { return /\d/.test(p[1]); }).length,
    unitsByStore: (function () { var m = {}; S.forEach(function (s) { m[s[2]] = (m[s[2]] || 0) + s[4]; }); return m; })(),
    revByCity: (function () {
      var city = {}; ST.forEach(function (s) { city[s[0]] = s[1]; });
      var m = {}; S.forEach(function (s) { var c = city[s[2]]; m[c] = (m[c] || 0) + s[4] * bySku[s[3]][3]; });
      return m;
    })(),
    avgQty: sum(S.map(function (s) { return s[4]; })) / S.length,
    lowStock: P.filter(function (p) { return p[5] < p[6]; }).map(function (p) { return p[0]; })
  };

  function near(a, b, tol) { return typeof a === 'number' && Math.abs(a - b) <= (tol || 0.005); }
  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    var x = a.map(String).sort(), y = b.map(String).sort();
    return x.every(function (v, i) { return v === y[i]; });
  }
  function ok(msg) { return { ok: true, msg: msg || 'Correct!' }; }
  function no(msg) { return { ok: false, msg: msg }; }

  // Common checks for "type a formula in cell X that equals Y"
  function needFormula(h, addr) {
    var f = h.formula(addr);
    if (!f) return no('Cell ' + addr + ' is empty. Click it and type a formula that starts with =');
    if (f[0] !== '=') return no(addr + ' contains a typed value, not a formula. Start with = so it updates when the data changes.');
    return null;
  }
  function errMsg(h, addr) {
    var v = h.val(addr);
    if (v && v.code) return no(addr + ' shows ' + v.code + '. ' + (v.msg || '') + ' Click the cell to read the error message.');
    return null;
  }
  function valueCheck(addr, expected, opts) {
    opts = opts || {};
    return function (h) {
      var e = needFormula(h, addr); if (e) return e;
      if (opts.mustUse) for (var i = 0; i < opts.mustUse.length; i++) if (!h.uses(addr, opts.mustUse[i])) return no('Close! But this challenge wants you to use ' + opts.mustUse[i] + '.');
      if (opts.mustNot) for (var j = 0; j < opts.mustNot.length; j++) if (h.uses(addr, opts.mustNot[j])) return no('Try it without ' + opts.mustNot[j] + ' this time.');
      var er = errMsg(h, addr); if (er && !opts.wantErr) return er;
      var v = h.val(addr);
      var exp = typeof expected === 'function' ? expected(h) : expected;
      if (typeof exp === 'number' ? near(v, exp, opts.tol) : String(v) === String(exp)) return ok();
      return no(addr + ' shows ' + h.text(addr) + ', which is not the right answer yet.');
    };
  }
  function spillCheck(addr, expected, opts) {
    opts = opts || {};
    return function (h) {
      var e = needFormula(h, addr); if (e) return e;
      if (opts.mustUse) for (var i = 0; i < opts.mustUse.length; i++) if (!h.uses(addr, opts.mustUse[i])) return no('This challenge wants you to use ' + opts.mustUse[i] + '.');
      var er = errMsg(h, addr); if (er) return er;
      var m = h.spill(addr);
      if (!m) return no('Your formula did not spill a list. It should return several results into the cells below.');
      var col = m.rows.map(function (r) { return r[0]; });
      if (opts.ordered ? JSON.stringify(col) === JSON.stringify(expected) : sameSet(col, expected)) return ok();
      return no('The spilled list has ' + col.length + ' item(s): ' + col.slice(0, 6).join(', ') + (col.length > 6 ? '…' : '') + '. Not quite right.');
    };
  }
  function columnCheck(sheet, col, r1, expected, opts) {
    opts = opts || {};
    return function (h) {
      var first = sheet + '!' + col + r1;
      var e = needFormula(h, first); if (e) return e;
      if (opts.mustUse) for (var i = 0; i < opts.mustUse.length; i++) if (!h.uses(first, opts.mustUse[i])) return no(first + ' should use ' + opts.mustUse[i] + '.');
      if (opts.mustNot) for (var j = 0; j < opts.mustNot.length; j++) if (h.uses(first, opts.mustNot[j])) return no('Try it without ' + opts.mustNot[j] + '.');
      if (opts.minCount) for (var fn in opts.minCount) if (h.count(first, fn) < opts.minCount[fn]) return no(first + ' should use ' + fn + ' at least ' + opts.minCount[fn] + ' times (nested).');
      for (var k = 0; k < expected.length; k++) {
        var addr = sheet + '!' + col + (r1 + k), v = h.val(addr);
        var ex = expected[k];
        if (opts.skip && opts.skip.indexOf(k) >= 0) continue;
        var good = ex === null ? (v === null || v === '' || v === undefined) : typeof ex === 'number' ? near(v, ex, 0.006) : String(v) === String(ex);
        if (!good) {
          if (ex === null) return no(addr + ' shows "' + h.text(addr) + '" but this order has no usable value, so it should be blank ("").');
          if (v === null || v === undefined || v === '') return no(addr + ' is empty. Did you fill the formula down to row ' + (r1 + expected.length - 1) + '? (Select the cells and press Ctrl+D, or drag the fill handle.)');
          return no(addr + ' shows "' + h.text(addr) + '" but should be "' + (typeof ex === 'number' ? E.displayValue(ex) : ex) + '".');
        }
      }
      return ok();
    };
  }

  // ---------- SQL helpers ----------
  function lastRows(h) {
    var r = h.last;
    if (!r) return no('Run a query first (Ctrl+Enter or the ▶ Run button).');
    if (r.error) return no('Your last query had an error: ' + r.error);
    if (r.type !== 'rows') return no('Your last statement did not return rows. Run a SELECT query.');
    return null;
  }
  function colValues(r, i) { return r.rows.map(function (x) { return x[i]; }); }
  function findCol(r, pred) { for (var i = 0; i < r.columns.length; i++) if (pred(colValues(r, i), i)) return i; return -1; }

  // ---------- Challenge list ----------
  var C = [];
  function add(o) { C.push(o); }

  // ===== Excel 365 =====
  add({ id: '365-sum', plat: 'xl365', title: 'Your First Formula', xp: 10, level: 1, target: 'Scratch!B2',
    task: 'In <b>Scratch!B2</b>, find the total number of items in stock (the InStock column on the <b>Products</b> sheet).',
    hints: ['Formulas start with <code>=</code>. The function that adds is SUM.', 'You can point at another sheet like this: <code>Products!F2:F25</code>.', '<code>=SUM(Products!F2:F25)</code>'],
    learn: 'SheetName!Range lets one sheet use data from another sheet.',
    check: valueCheck('Scratch!B2', X.totalStock) });
  add({ id: '365-invvalue', plat: 'xl365', title: 'What Is It All Worth?', xp: 15, level: 1, target: 'Scratch!B3',
    task: 'In <b>Scratch!B3</b>, calculate the total value of the inventory: every product\'s <b>Price × InStock</b>, all added up — in ONE formula.',
    hints: ['You need to multiply two columns row-by-row, then add everything.', 'SUMPRODUCT multiplies matching items and adds them. In Excel 365, SUM(range*range) also works because of dynamic arrays.', '<code>=SUMPRODUCT(Products!D2:D25, Products!F2:F25)</code>'],
    learn: 'SUMPRODUCT works on every version. SUM(D2:D25*F2:F25) only works in Excel 365 (or with Ctrl+Shift+Enter in old Excel).',
    check: valueCheck('Scratch!B3', X.invValue) });
  add({ id: '365-countif', plat: 'xl365', title: 'Count the Categories', xp: 15, level: 1, target: 'Scratch!B4',
    task: 'In <b>Scratch!B4</b>, count how many products are in the <b>School Supplies</b> category.',
    hints: ['COUNTIF(range, criteria) counts cells that match.', 'Text criteria go in quotes: <code>"School Supplies"</code>.', '<code>=COUNTIF(Products!C2:C25, "School Supplies")</code>'],
    learn: 'COUNTIF and SUMIF work the same in every spreadsheet app.',
    check: valueCheck('Scratch!B4', X.schoolCount, { mustUse: ['COUNTIF'] }) });
  add({ id: '365-sumif', plat: 'xl365', title: 'Store S03 Sales', xp: 20, level: 2, target: 'Scratch!B5',
    task: 'In <b>Scratch!B5</b>, add up the <b>Qty</b> of every sale made by store <b>S03</b> (Sales sheet).',
    hints: ['SUMIF(range_to_check, criteria, range_to_add).', 'Check the StoreID column (C) and add the Qty column (E).', '<code>=SUMIF(Sales!C2:C61, "S03", Sales!E2:E61)</code>'],
    learn: 'SUMIF = "add these numbers, but only on rows where something is true." In SQL it is SUM(...) WHERE ...',
    check: valueCheck('Scratch!B5', X.unitsS03, { mustUse: ['SUMIF'] }) });
  add({ id: '365-xlookup', plat: 'xl365', title: 'XLOOKUP Detective', xp: 20, level: 2, target: 'Scratch!B7',
    task: 'Type <b>SKU-404</b> into <b>Scratch!A7</b>. In <b>Scratch!B7</b>, use <b>XLOOKUP</b> to show that SKU\'s product name. It should still work if someone types a different SKU into A7!',
    hints: ['XLOOKUP(what_to_find, where_to_look, what_to_return).', 'Look in Products!A2:A25 (SKUs) and return from Products!B2:B25 (names).', '<code>=XLOOKUP(A7, Products!A2:A25, Products!B2:B25)</code>'],
    learn: 'XLOOKUP only exists in Excel 365/2021 and Google Sheets. Excel 2013 shows #NAME? — try it there next!',
    check: function (h) {
      var e = needFormula(h, 'Scratch!B7'); if (e) return e;
      if (!h.uses('Scratch!B7', 'XLOOKUP')) return no('Use XLOOKUP for this one.');
      if (String(h.val('Scratch!A7')).toUpperCase() !== 'SKU-404') return no('Type SKU-404 into Scratch!A7 first.');
      if (h.val('Scratch!B7') !== bySku['SKU-404'][1]) return errMsg(h, 'Scratch!B7') || no('B7 should show ' + bySku['SKU-404'][1] + '.');
      if (h.tryInput('Scratch!A7', 'SKU-101', 'Scratch!B7') !== bySku['SKU-101'][1]) return no('It works for SKU-404, but B7 should use A7 (not a typed-in "SKU-404") so it works for any SKU.');
      return ok();
    } });
  add({ id: '365-filter', plat: 'xl365', title: 'Spill the Drinks', xp: 25, level: 2, target: 'Scratch!D2',
    task: 'In <b>Scratch!D2</b>, write ONE formula that lists the names of every product in the <b>Drinks</b> category. The answers should <b>spill</b> down.',
    hints: ['FILTER(what_to_show, test) keeps the rows where the test is TRUE.', 'The test compares the Category column: <code>Products!C2:C25="Drinks"</code>.', '<code>=FILTER(Products!B2:B25, Products!C2:C25="Drinks")</code>'],
    learn: 'If anything is typed in the cells below D2, Excel shows #SPILL! because the answer has no room.',
    check: spillCheck('Scratch!D2', X.drinks, { mustUse: ['FILTER'] }) });
  add({ id: '365-sortunique', plat: 'xl365', title: 'Sorted & Unique', xp: 25, level: 2, target: 'Scratch!F2',
    task: 'In <b>Scratch!F2</b>, list each product <b>category once</b>, sorted <b>A→Z</b>, in one formula.',
    hints: ['UNIQUE removes duplicates. SORT puts them in order.', 'You can put one function inside another: SORT(UNIQUE(...)).', '<code>=SORT(UNIQUE(Products!C2:C25))</code>'],
    learn: 'Nesting = putting a function inside another function. The inside one runs first.',
    check: spillCheck('Scratch!F2', X.catsSorted, { ordered: true, mustUse: ['UNIQUE', 'SORT'] }) });
  add({ id: '365-ifs', plat: 'xl365', title: 'Stock Status with IFS', xp: 30, level: 3, target: 'Products!I2',
    task: 'On the <b>Products</b> sheet, type <b>Status</b> in I1. In <b>I2:I25</b> show <b>"Reorder"</b> if InStock is below ReorderAt, <b>"Low"</b> if InStock is below ReorderAt × 1.5, otherwise <b>"OK"</b>. Use <b>IFS</b>.',
    hints: ['IFS(test1, value1, test2, value2, TRUE, value_otherwise). The first TRUE test wins.', 'Row 2: <code>=IFS(F2&lt;G2, "Reorder", F2&lt;G2*1.5, "Low", TRUE, "OK")</code>', 'Then select I2:I25 and press Ctrl+D to fill down (the row numbers change automatically).'],
    learn: 'IFS is new. In Excel 2013 you would need IF inside IF inside IF.',
    check: columnCheck('Products', 'I', 2, X.status, { mustUse: ['IFS'] }) });
  add({ id: '365-let', plat: 'xl365', title: 'LET It Be', xp: 30, level: 3, target: 'Scratch!B9',
    task: 'In <b>Scratch!B9</b>, calculate the profit margin of <b>SKU-502</b>: (price − cost) ÷ price. Use <b>LET</b> to name the price and the cost.',
    hints: ['LET(name1, value1, name2, value2, calculation).', 'Look up the price and cost with XLOOKUP, give them names, then use the names.', '<code>=LET(p, XLOOKUP("SKU-502", Products!A2:A25, Products!D2:D25), c, XLOOKUP("SKU-502", Products!A2:A25, Products!E2:E25), (p-c)/p)</code>'],
    learn: 'LET makes long formulas readable — and Excel only calculates each name once.',
    check: valueCheck('Scratch!B9', X.margin502, { mustUse: ['LET'], tol: 0.0005 }) });
  add({ id: '365-revenue', plat: 'xl365', title: 'Build a Revenue Column', xp: 35, level: 3, target: 'Sales!G2',
    task: 'On the <b>Sales</b> sheet, type <b>Revenue</b> in G1. Fill <b>G2:G61</b> with <b>Qty × Price</b>. The price is on the Products sheet, so you will need a lookup.',
    hints: ['Find the price for the SKU in D2, then multiply by the Qty in E2.', '<code>=E2 * XLOOKUP(D2, Products!$A$2:$A$25, Products!$D$2:$D$25)</code>', 'The $ signs keep the lookup ranges from sliding when you fill down. Fill G2:G61 with Ctrl+D.'],
    learn: '$A$2 is an ABSOLUTE reference: it does not change when copied. A2 is RELATIVE: it shifts.',
    check: columnCheck('Sales', 'G', 2, X.revenue) });

  // ===== Excel 2013 =====
  add({ id: '13-name', plat: 'xl2013', title: 'Back to 2013', xp: 10, level: 1, target: 'Scratch!B2',
    task: 'In <b>Scratch!B2</b>, try a modern formula: <code>=XLOOKUP("SKU-101", Products!A2:A25, Products!B2:B25)</code>. What does Excel 2013 do?',
    hints: ['Just type it exactly and press Enter.', 'Click the cell afterwards and read the error message under the formula bar.', 'You should see #NAME? — that is the point!'],
    learn: '#NAME? means "I don\'t know that word." Old Excel has never heard of XLOOKUP.',
    check: function (h) {
      var e = needFormula(h, 'Scratch!B2'); if (e) return e;
      if (!h.uses('Scratch!B2', 'XLOOKUP')) return no('Type the XLOOKUP formula into Scratch!B2.');
      var v = h.val('Scratch!B2');
      return v && v.code === '#NAME?' ? ok('Exactly — #NAME? is how old Excel says "unknown function".') : no('Hmm, B2 should show #NAME?.');
    } });
  add({ id: '13-indexmatch', plat: 'xl2013', title: 'INDEX + MATCH', xp: 25, level: 2, target: 'Scratch!B3',
    task: 'In <b>Scratch!B3</b>, show the product name for <b>SKU-404</b> using <b>INDEX</b> and <b>MATCH</b> nested together (no VLOOKUP).',
    hints: ['MATCH finds the POSITION: <code>MATCH("SKU-404", Products!A2:A25, 0)</code> returns 19.', 'INDEX returns the item at a position: <code>INDEX(Products!B2:B25, 19)</code>.', '<code>=INDEX(Products!B2:B25, MATCH("SKU-404", Products!A2:A25, 0))</code>'],
    learn: 'INDEX/MATCH works in EVERY version of Excel and Google Sheets. It is the universal lookup.',
    check: valueCheck('Scratch!B3', bySku['SKU-404'][1], { mustUse: ['INDEX', 'MATCH'], mustNot: ['VLOOKUP'] }) });
  add({ id: '13-vlookup', plat: 'xl2013', title: "VLOOKUP's Trap", xp: 20, level: 2, target: 'Scratch!B4',
    task: 'In <b>Scratch!B4</b>, use <b>VLOOKUP</b> to find the price of the <b>Hoodie</b> by its name. Make sure you get the RIGHT price!',
    hints: ['VLOOKUP searches the FIRST column of the table, so start the table at column B (names): Products!B2:D25.', 'Price is the 3rd column of B:D. Without a 4th argument VLOOKUP does an APPROXIMATE match on unsorted data — wrong answer!', '<code>=VLOOKUP("Hoodie", Products!B2:D25, 3, FALSE)</code>'],
    learn: 'Always finish VLOOKUP with FALSE (exact match). Forgetting it is the #1 VLOOKUP bug in the world.',
    check: valueCheck('Scratch!B4', bySku['SKU-502'][3], { mustUse: ['VLOOKUP'] }) });
  add({ id: '13-nestedif', plat: 'xl2013', title: 'The Nested IF Ladder', xp: 30, level: 2, target: 'Products!I2',
    task: 'On <b>Products</b>, fill <b>I2:I25</b> with <b>"Reorder"</b> (InStock below ReorderAt), <b>"Low"</b> (below ReorderAt × 1.5) or <b>"OK"</b>. IFS doesn\'t exist here — <b>nest IF inside IF</b>.',
    hints: ['IF(test, value_if_true, value_if_false). Put the second IF in the value_if_false spot.', '<code>=IF(F2&lt;G2, "Reorder", IF(F2&lt;G2*1.5, "Low", "OK"))</code>', 'Fill it down to I25 with Ctrl+D.'],
    learn: 'Every IFS can be rewritten as nested IFs. Count your parentheses — each IF( needs a ).',
    check: columnCheck('Products', 'I', 2, X.status, { minCount: { IF: 2 }, mustNot: ['IFS'] }) });
  add({ id: '13-iferror', plat: 'xl2013', title: 'IFERROR Safety Net', xp: 20, level: 2, target: 'Scratch!B6',
    task: 'Type any SKU in <b>Scratch!A6</b>. In <b>Scratch!B6</b>, show its product name — or the words <b>Not found</b> if the SKU doesn\'t exist.',
    hints: ['Start with a lookup that works: INDEX/MATCH or VLOOKUP(..., FALSE).', 'Wrap it: IFERROR(your_lookup, "Not found").', '<code>=IFERROR(VLOOKUP(A6, Products!A2:B25, 2, FALSE), "Not found")</code>'],
    learn: 'IFERROR catches any error. IFNA (Excel 2013+) only catches #N/A, which is safer for lookups.',
    check: function (h) {
      var e = needFormula(h, 'Scratch!B6'); if (e) return e;
      if (h.tryInput('Scratch!A6', 'SKU-201', 'Scratch!B6') !== bySku['SKU-201'][1]) return no('With SKU-201 in A6, B6 should show ' + bySku['SKU-201'][1] + '. Make sure B6 looks up A6.');
      if (h.tryInput('Scratch!A6', 'SKU-999', 'Scratch!B6') !== 'Not found') return no('With a fake SKU like SKU-999 in A6, B6 should show: Not found');
      return ok();
    } });
  add({ id: '13-cse', plat: 'xl2013', title: 'The Ctrl+Shift+Enter Club', xp: 40, level: 3, target: 'Scratch!B7',
    task: 'In <b>Scratch!B7</b>, find the highest <b>Price</b> in the <b>Electronics</b> category. MAXIFS does not exist in 2013! Use <b>MAX(IF(...))</b> and confirm with <b>Ctrl+Shift+Enter</b>.',
    hints: ['IF can test a whole column at once: IF(Products!C2:C25="Electronics", Products!D2:D25).', 'MAX picks the biggest of what IF returns. Press Enter first and notice the WRONG answer.', 'Now edit the cell (F2) and press <b>Ctrl+Shift+Enter</b>. The formula bar will show {=MAX(IF(...))}.'],
    learn: 'Before dynamic arrays, formulas that work on whole ranges needed Ctrl+Shift+Enter. Without it, Excel quietly used only ONE row.',
    check: function (h) {
      var e = needFormula(h, 'Scratch!B7'); if (e) return e;
      var v = h.val('Scratch!B7');
      if (!near(v, X.maxElectronics)) return errMsg(h, 'Scratch!B7') || no('B7 shows ' + h.text('Scratch!B7') + '. ' + (h.uses('Scratch!B7', 'IF') && !h.cell('Scratch!B7').cse ? 'Did you press Ctrl+Shift+Enter?' : 'Not the highest Electronics price yet.'));
      if (!/(IF|SUMPRODUCT|LARGE)/.test(h.formula('Scratch!B7'))) return no('Use a formula that looks at the Electronics rows, not a typed number.');
      return ok(h.cell('Scratch!B7').cse ? 'Welcome to the club — {curly braces} and all.' : 'Correct!');
    } });
  add({ id: '13-concat', plat: 'xl2013', title: 'Build a Price Tag', xp: 15, level: 1, target: 'Scratch!B8',
    task: 'In <b>Scratch!B8</b>, build the text <b>Granola Bar - $1.50</b> from Products!B2 and Products!D2.',
    hints: ['Join text with CONCATENATE(a, b, c) or with a & b & c.', 'D2 is the number 1.5. TEXT(D2, "$0.00") turns it into "$1.50".', '<code>=Products!B2 & " - " & TEXT(Products!D2, "$0.00")</code>'],
    learn: 'Formatting ($) is not part of the number. TEXT(...) bakes the format into text.',
    check: valueCheck('Scratch!B8', 'Granola Bar - $1.50') });
  add({ id: '13-sumifs', plat: 'xl2013', title: 'Wildcard SUMIFS', xp: 30, level: 3, target: 'Scratch!B9',
    task: 'In <b>Scratch!B9</b>, add up the Qty of sales from store <b>S02</b> for products whose SKU starts with <b>SKU-3</b> (school supplies).',
    hints: ['SUMIFS(sum_range, range1, criteria1, range2, criteria2) — every condition must be true.', 'In criteria, * means "anything": "SKU-3*".', '<code>=SUMIFS(Sales!E2:E61, Sales!C2:C61, "S02", Sales!D2:D61, "SKU-3*")</code>'],
    learn: 'SUMIFS/COUNTIFS have existed since Excel 2007, so they are safe to use everywhere.',
    check: valueCheck('Scratch!B9', X.s02school) });

  // ===== Google Sheets =====
  add({ id: 'gs-filter1', plat: 'gs', title: 'Excel Habits, Sheets Rules', xp: 20, level: 1, target: 'Scratch!B2',
    task: 'In <b>Scratch!B2</b>, type the Excel-style formula <code>=FILTER(Products!B2:B25, Products!C2:C25="Apparel", "None")</code>. Read the error, then fix it so it lists the Apparel products.',
    hints: ['Click the cell and read the error. Sheets thinks "None" is a second CONDITION.', 'Google Sheets FILTER has no "if empty" argument. Delete it.', 'To get a "None" message anyway: <code>=IFERROR(FILTER(Products!B2:B25, Products!C2:C25="Apparel"), "None")</code>'],
    learn: 'Same function name, different arguments. In Sheets every extra FILTER argument is another condition.',
    check: spillCheck('Scratch!B2', X.apparel, { mustUse: ['FILTER'] }) });
  add({ id: 'gs-filter2', plat: 'gs', title: 'Two Conditions', xp: 25, level: 2, target: 'Scratch!D2',
    task: 'In <b>Scratch!D2</b>, list Snacks that cost <b>more than $1.00</b>. Give FILTER the two conditions as <b>two separate arguments</b> (the Sheets way).',
    hints: ['FILTER(range, condition1, condition2).', 'Condition 1: Products!C2:C25="Snacks". Condition 2: Products!D2:D25>1', '<code>=FILTER(Products!B2:B25, Products!C2:C25="Snacks", Products!D2:D25>1)</code>'],
    learn: 'Excel needs one combined test instead: (cond1)*(cond2). The translator panel shows both!',
    check: function (h) {
      var r = spillCheck('Scratch!D2', X.snacksOver1, { mustUse: ['FILTER'] })(h);
      if (!r.ok) return r;
      return h.argCount('Scratch!D2', 'FILTER') >= 3 ? ok() : no('Right answer! Now write it the Sheets way: each condition as its own argument.');
    } });
  add({ id: 'gs-sort', plat: 'gs', title: 'Which Way Is Down?', xp: 20, level: 2, target: 'Scratch!F2',
    task: 'In <b>Scratch!F2</b>, sort Products!B2:D25 by <b>price, highest first</b>. (Hint: Excel\'s -1 will NOT work here — try it and see!)',
    hints: ['Sheets: SORT(range, sort_column, is_ascending).', 'Price is the 3rd column of B:D. is_ascending should be FALSE.', '<code>=SORT(Products!B2:D25, 3, FALSE)</code>'],
    learn: 'In Sheets, -1 counts as TRUE (any non-zero number is TRUE) so it sorted the WRONG way with no error. Silent bugs are the worst bugs.',
    check: function (h) {
      var e = needFormula(h, 'Scratch!F2'); if (e) return e;
      if (!h.uses('Scratch!F2', 'SORT')) return no('Use SORT for this one.');
      var m = h.spill('Scratch!F2');
      if (!m) return errMsg(h, 'Scratch!F2') || no('The formula should spill a sorted table.');
      var prices = m.rows.map(function (r) { return r[2]; });
      var sorted = prices.slice().sort(function (a, b) { return b - a; });
      if (m.rows[0][0] !== 'Hoodie' || JSON.stringify(prices) !== JSON.stringify(sorted)) return no('The first row is ' + m.rows[0][0] + ' — the most expensive item should be on top.');
      return ok();
    } });
  add({ id: 'gs-arrayformula', plat: 'gs', title: 'One Formula, 24 Answers', xp: 30, level: 2, target: 'Products!I2',
    task: 'On <b>Products</b>, put ONE formula in <b>I2</b> that fills I2:I25 with the profit per unit (<b>Price − Cost</b>). Use <b>ARRAYFORMULA</b>.',
    hints: ['Try =Products!D2:D25-Products!E2:E25 first. Notice it only gives ONE answer.', 'ARRAYFORMULA tells Sheets to do the math on every row.', '<code>=ARRAYFORMULA(D2:D25 - E2:E25)</code>'],
    learn: 'In Excel 365 this just works without ARRAYFORMULA. In Excel 2013 it needs Ctrl+Shift+Enter across the whole range.',
    check: columnCheck('Products', 'I', 2, X.profit, { mustUse: ['ARRAYFORMULA'] }) });
  add({ id: 'gs-query', plat: 'gs', title: 'QUERY: SQL Inside a Spreadsheet', xp: 35, level: 3, target: 'Scratch!J2',
    task: 'In <b>Scratch!J2</b>, use <b>QUERY</b> to show each <b>category</b> and its <b>total InStock</b>.',
    hints: ['QUERY(data, "query text"). Columns are named by LETTER: C = Category, F = InStock.', 'Group rows: "select C, sum(F) group by C"', '<code>=QUERY(Products!A1:H25, "select C, sum(F) group by C")</code>'],
    learn: 'QUERY is Google-only. It is basically SQL — head over to SQL mode to see the real thing.',
    check: function (h) {
      var e = needFormula(h, 'Scratch!J2'); if (e) return e;
      if (!h.uses('Scratch!J2', 'QUERY')) return no('Use QUERY for this one.');
      var m = h.spill('Scratch!J2'); if (!m) return errMsg(h, 'Scratch!J2') || no('The QUERY should return a small table.');
      var got = {}; m.rows.forEach(function (r) { if (typeof r[1] === 'number') got[r[0]] = r[1]; });
      var good = Object.keys(X.stockByCat).every(function (k) { return got[k] === X.stockByCat[k]; });
      return good ? ok() : no('The totals do not match yet. Make sure you sum column F and group by column C.');
    } });
  add({ id: 'gs-split', plat: 'gs', title: 'SPLIT the Manager', xp: 15, level: 1, target: 'Scratch!B10',
    task: 'In <b>Scratch!B10</b>, split the manager name in <b>Stores!E2</b> into first name (B10) and last name (C10).',
    hints: ['SPLIT(text, delimiter). The delimiter here is a space " ".', 'The result spills to the RIGHT.', '<code>=SPLIT(Stores!E2, " ")</code>'],
    learn: 'SPLIT is Google-only. Excel uses Data ▸ Text to Columns (or TEXTSPLIT in newer Excel 365).',
    check: function (h) {
      var e = needFormula(h, 'Scratch!B10'); if (e) return e;
      var name = D.STORES[0][4].split(' ');
      return h.val('Scratch!B10') === name[0] && h.val('Scratch!C10') === name[1] ? ok() : errMsg(h, 'Scratch!B10') || no('B10 should show ' + name[0] + ' and C10 should show ' + name[1] + '.');
    } });
  add({ id: 'gs-open', plat: 'gs', title: 'Ranges With No Bottom', xp: 20, level: 2, target: 'Scratch!B12',
    task: 'In <b>Scratch!B12</b>, add up all Qty on the Sales sheet using an <b>open-ended range</b> that starts at row 2 and has no last row.',
    hints: ['In Google Sheets, E2:E means "E2 all the way down".', 'Excel does not allow this — it would give a formula error.', '<code>=SUM(Sales!E2:E)</code>'],
    learn: 'Open ranges grow automatically as you add rows. In Excel you would use E:E or a Table.',
    check: function (h) {
      var r = valueCheck('Scratch!B12', X.totalQty, { mustUse: ['SUM'] })(h); if (!r.ok) return r;
      return /![A-Z]+\$?2:\$?[A-Z]+(?![\d$])/i.test(h.formula('Scratch!B12')) ? ok() : no('Right total! Now use an open-ended range like Sales!E2:E.');
    } });
  add({ id: 'gs-concat', plat: 'gs', title: 'The CONCAT Gotcha', xp: 15, level: 1, target: 'Scratch!B13',
    task: 'In <b>Scratch!B13</b>, build <b>Cumming, GA</b> from Stores!B2 and Stores!C2. (Try <code>=CONCAT(Stores!B2, ", ", Stores!C2)</code> first and read the error!)',
    hints: ['Sheets CONCAT takes exactly TWO values.', 'Use CONCATENATE (any number of values) or the & operator.', '<code>=Stores!B2 & ", " & Stores!C2</code>'],
    learn: 'The same function name can have different rules in different apps.',
    check: valueCheck('Scratch!B13', 'Cumming, GA') });
  add({ id: 'gs-regex', plat: 'gs', title: 'Pattern Hunter', xp: 25, level: 3, target: 'Scratch!B14',
    task: 'In <b>Scratch!B14</b>, count how many product names contain a <b>digit</b> (0-9) using <b>REGEXMATCH</b>.',
    hints: ['REGEXMATCH(text, "\\d") is TRUE when the text has a digit.', 'Run it on the whole column and count the TRUEs. -- turns TRUE/FALSE into 1/0.', '<code>=SUMPRODUCT(--REGEXMATCH(Products!B2:B25, "\\d"))</code>'],
    learn: 'Regular expressions are a mini-language for patterns. Google Sheets has them built in.',
    check: valueCheck('Scratch!B14', X.digitNames, { mustUse: ['REGEXMATCH'] }) });

  // ===== CSV / TSV =====
  add({ id: 'csv-quiz-formula', plat: 'csv', type: 'quiz', title: 'Where Did My Formula Go?', xp: 15, level: 1,
    task: 'You save an Excel workbook as <b>CSV</b>. Cell B2 had <code>=SUM(D2:D25)</code> showing <b>$189.63</b>. What is stored in the CSV file?',
    options: ['=SUM(D2:D25)', '189.63', '$189.63 in bold', 'Nothing — the cell is left empty'], answer: 1,
    hints: ['CSV is plain text: values only.', 'Formatting like $ and bold is not plain text.'],
    learn: 'CSV keeps the RESULT, not the formula. Re-open it and your formulas are gone. Try “Export from a spreadsheet” to see it happen.' });
  add({ id: 'csv-export', plat: 'csv', title: 'Export a Sheet', xp: 15, level: 1,
    task: 'Click <b>Export from spreadsheet</b>, choose the <b>Excel 365 → Products</b> sheet and export it as CSV. Look at the "What was lost" report.',
    hints: ['The Export button is above the file list.', 'Pick Excel 365 and the Products sheet, then press Export.'],
    learn: 'Any formulas you added on that sheet became plain numbers in the CSV.',
    check: function (h) {
      var f = h.file('export_Products.csv');
      return f && /^SKU,Product/.test(f) ? ok() : no('No export_Products.csv file yet.');
    } });
  add({ id: 'csv-fix-comma', plat: 'csv', title: 'Fix the Broken Comma', xp: 25, level: 2,
    task: 'Open <b>broken_products.csv</b>. One row has too many fields because a product name contains a comma. Fix it so every row has 8 fields.',
    hints: ['The preview highlights the bad row in red.', 'Values that contain a comma must be wrapped in double quotes.', 'Change Gel Pens, 4-pack to "Gel Pens, 4-pack"'],
    learn: 'Quotes protect commas inside values. This is why TSV (tabs) is popular — names rarely contain tabs.',
    check: function (h) {
      var f = h.file('broken_products.csv'); if (!f) return no('broken_products.csv is missing — use Reset files.');
      var p = SX.csv.parse(f, ',');
      if (p.rows.length < 25) return no('Some rows are missing. There should be a header plus 24 products.');
      var bad = p.rows.filter(function (r) { return r.bad; });
      if (bad.length) return no('Line ' + bad[0].line + ' still has ' + bad[0].cells.length + ' fields.');
      var gel = p.rows.filter(function (r) { return r.cells[0].v === 'SKU-302'; })[0];
      return gel && gel.cells[1].v === 'Gel Pens, 4-pack' ? ok() : no('The SKU-302 product name should read: Gel Pens, 4-pack');
    } });
  add({ id: 'csv-tsv', plat: 'csv', title: 'Commas to Tabs', xp: 20, level: 2,
    task: 'Create a new file named <b>stores.tsv</b> that holds the same data as stores.csv, but separated by <b>TAB</b> characters.',
    hints: ['Click + New file and name it stores.tsv. Copy the text from stores.csv into it.', 'Use Find & Replace (Ctrl+F): find <code>,</code> replace with <code>\\t</code> (backslash-t means TAB).', 'Turn on "Show invisible characters" to see the → tabs.'],
    learn: 'Same data, different delimiter. Spreadsheets can open both.',
    check: function (h) {
      var f = h.file('stores.tsv'); if (!f) return no('There is no file named stores.tsv yet.');
      if (f.indexOf('\t') < 0) return no('stores.tsv has no TAB characters in it.');
      var p = SX.csv.parse(f, '\t');
      var exp = [D.STORE_HEADERS].concat(D.STORES).map(function (r) { return r.map(String); });
      var got = p.rows.filter(function (r) { return r.cells.length > 1; }).map(function (r) { return r.cells.map(function (c) { return c.v.trim(); }); });
      return JSON.stringify(got) === JSON.stringify(exp) ? ok() : no('The data does not match stores.csv exactly. Check every row has 6 values separated by tabs.');
    } });
  add({ id: 'csv-quiz-zero', plat: 'csv', type: 'quiz', title: 'The Vanishing Zero', xp: 15, level: 1,
    task: 'Open <b>suppliers.csv</b> and switch the preview to <b>“Open like a spreadsheet would”</b>. What happens to Lakeside Apparel\'s ZIP code <b>05401</b>?',
    options: ['It stays 05401', 'It becomes 5401', 'It becomes 5,401', 'It shows #VALUE!'], answer: 1,
    hints: ['Spreadsheets guess that 05401 is a number.', 'Numbers do not keep leading zeros.'],
    learn: 'ZIP codes, phone numbers and IDs are TEXT, not numbers. Import them as text or the zeros disappear forever.' });
  add({ id: 'csv-quote', plat: 'csv', title: 'Quotes Inside Quotes', xp: 25, level: 3,
    task: 'Add a new product to the end of <b>products.csv</b>: SKU <b>SKU-307</b>, product <b>12" Ruler</b> (that\'s 12 inches!), category School Supplies, price 1.99, cost 0.6, InStock 30, ReorderAt 10, supplier Office Hub Supply.',
    hints: ['The product name contains a " character, so the whole value must be wrapped in quotes.', 'A " inside a quoted value is written twice: ""', 'SKU-307,"12"" Ruler",School Supplies,1.99,0.6,30,10,Office Hub Supply'],
    learn: 'CSV escaping rule: wrap in quotes, double any inner quotes.',
    check: function (h) {
      var f = h.file('products.csv'); if (!f) return no('products.csv is missing.');
      var p = SX.csv.parse(f, ',');
      var row = p.rows.filter(function (r) { return r.cells[0].v === 'SKU-307'; })[0];
      if (!row) return no('No row starting with SKU-307 yet.');
      if (row.bad || row.cells.length !== 8) return no('The SKU-307 row has ' + row.cells.length + ' fields — it needs 8.');
      if (row.cells[1].v !== '12" Ruler') return no('The product name reads back as: ' + row.cells[1].v + ' — it should be 12" Ruler');
      return p.problems.length ? no('The file has a problem: ' + p.problems[0].msg) : ok();
    } });
  add({ id: 'csv-quiz-fields', plat: 'csv', type: 'quiz', title: 'Count the Fields', xp: 10, level: 1,
    task: 'How many fields (values) are in this CSV line?<br><code>SKU-302,"Gel Pens, 4-pack",School Supplies,4.5</code>',
    options: ['3', '4', '5', '6'], answer: 1,
    hints: ['Commas inside quotes do not count as separators.'],
    learn: 'SKU-302 | Gel Pens, 4-pack | School Supplies | 4.5 → 4 fields.' });
  add({ id: 'csv-quiz-format', plat: 'csv', type: 'quiz', title: 'Pick the Right Format', xp: 10, level: 1,
    task: 'Which file type keeps your <b>formulas</b>, <b>formatting</b> and <b>multiple sheets</b>?',
    options: ['.csv', '.tsv', '.xlsx', '.txt'], answer: 2,
    hints: ['CSV and TSV are plain text.'],
    learn: 'Use .xlsx (or a Google Sheet) for working files. Use CSV/TSV to move data between programs.' });

  // ===== SQL =====
  function sqlCheckSelect(fn) { return function (h) { var e = lastRows(h); if (e) return e; return fn(h.last, h); }; }
  add({ id: 'sql-star', plat: 'sql', title: 'SELECT Everything', xp: 10, level: 1,
    task: 'Show every column and every row of the <b>products</b> table.',
    hints: ['SELECT chooses columns. * means all columns.', 'FROM says which table.', '<code>SELECT * FROM products;</code>'],
    learn: 'A spreadsheet shows all data all the time. A database only shows what you ask for.',
    check: sqlCheckSelect(function (r) { return r.rows.length === P.length && r.columns.length === 8 ? ok() : no('Expected 24 rows and 8 columns. You got ' + r.rows.length + ' rows and ' + r.columns.length + ' columns.'); }) });
  add({ id: 'sql-where', plat: 'sql', title: 'WHERE = FILTER', xp: 15, level: 1,
    task: 'Show the <b>product</b> and <b>price</b> of every product in the <b>Electronics</b> category.',
    hints: ['Pick columns: SELECT product, price', 'Filter rows with WHERE. Text goes in single quotes.', "<code>SELECT product, price FROM products WHERE category = 'Electronics';</code>"],
    learn: "WHERE works like FILTER. Remember: 'single quotes' for text, and it is case-sensitive.",
    check: sqlCheckSelect(function (r) {
      var exp = P.filter(function (p) { return p[2] === 'Electronics'; }).map(function (p) { return p[1]; });
      return findCol(r, function (v) { return sameSet(v, exp); }) >= 0 ? ok() : no('The product list should be exactly the ' + exp.length + ' Electronics products.');
    }) });
  add({ id: 'sql-top3', plat: 'sql', title: 'Top 3 Most Expensive', xp: 20, level: 2,
    task: 'Show the <b>product</b> and <b>price</b> of the 3 most expensive products, highest first.',
    hints: ['ORDER BY price DESC sorts high → low.', 'LIMIT 3 keeps only the first 3 rows.', '<code>SELECT product, price FROM products ORDER BY price DESC LIMIT 3;</code>'],
    learn: 'ORDER BY = SORT. LIMIT = "only the first N".',
    check: sqlCheckSelect(function (r) {
      var exp = P.slice().sort(function (a, b) { return b[3] - a[3]; }).slice(0, 3).map(function (p) { return p[1]; });
      if (r.rows.length !== 3) return no('You returned ' + r.rows.length + ' rows. Use LIMIT 3.');
      return findCol(r, function (v) { return JSON.stringify(v) === JSON.stringify(exp); }) >= 0 ? ok() : no('Not the right 3 (or not in order). Expected ' + exp.join(', ') + '.');
    }) });
  add({ id: 'sql-group', plat: 'sql', title: 'GROUP BY = SUMIF for Everyone', xp: 25, level: 2,
    task: 'Show each <b>store_id</b> with the <b>total qty</b> it sold (from the sales table).',
    hints: ['SUM(qty) adds. GROUP BY store_id makes one total per store.', 'Every non-aggregate column in SELECT should be in GROUP BY.', '<code>SELECT store_id, SUM(qty) FROM sales GROUP BY store_id;</code>'],
    learn: 'One GROUP BY query does what five SUMIF formulas would.',
    check: sqlCheckSelect(function (r) {
      var ki = findCol(r, function (v) { return sameSet(v, Object.keys(X.unitsByStore)); });
      if (ki < 0) return no('There should be one row per store (S01–S05).');
      var good = r.rows.every(function (row) { return row.some(function (v, i) { return i !== ki && v === X.unitsByStore[row[ki]]; }); });
      return good ? ok() : no('The totals do not match. Use SUM(qty).');
    }) });
  add({ id: 'sql-join', plat: 'sql', title: 'JOIN = VLOOKUP', xp: 30, level: 2,
    task: 'For every sale, show the <b>order_id</b> and the <b>product name</b>. The name lives in the products table, so you need to <b>JOIN</b>.',
    hints: ['JOIN products ON sales.sku = products.sku connects matching rows.', 'Short table names (aliases) save typing: FROM sales s JOIN products p ON s.sku = p.sku', '<code>SELECT s.order_id, p.product FROM sales s JOIN products p ON s.sku = p.sku;</code>'],
    learn: 'A JOIN does a lookup for EVERY row at once — no filling down.',
    check: sqlCheckSelect(function (r) {
      if (r.rows.length !== S.length) return no('Expected ' + S.length + ' rows (one per sale). You got ' + r.rows.length + '.');
      var exp = S.map(function (s) { return bySku[s[3]][1]; });
      return findCol(r, function (v) { return sameSet(v, exp); }) >= 0 && findCol(r, function (v) { return sameSet(v, S.map(function (s) { return s[0]; })); }) >= 0
        ? ok() : no('Include both the order_id and the product name columns.');
    }) });
  add({ id: 'sql-having', plat: 'sql', title: 'HAVING: Filter the Groups', xp: 30, level: 3,
    task: 'Show the categories that have <b>more than 5 products</b>, with their count.',
    hints: ['COUNT(*) counts rows in each group.', 'WHERE filters rows BEFORE grouping. HAVING filters groups AFTER.', '<code>SELECT category, COUNT(*) FROM products GROUP BY category HAVING COUNT(*) &gt; 5;</code>'],
    learn: 'WHERE → rows. HAVING → groups.',
    check: sqlCheckSelect(function (r) {
      var exp = Object.keys(X.stockByCat).filter(function (c) { return P.filter(function (p) { return p[2] === c; }).length > 5; });
      return findCol(r, function (v) { return sameSet(v, exp); }) >= 0 ? ok() : no('Expected only: ' + exp.join(', ') + '.');
    }) });
  add({ id: 'sql-city', plat: 'sql', title: 'Revenue by City', xp: 40, level: 3,
    task: 'Show each store\'s <b>city</b> and its total <b>revenue</b> (qty × price), <b>highest first</b>. You need sales, stores AND products.',
    hints: ['Two JOINs: sales→stores on store_id, sales→products on sku.', 'Revenue = SUM(s.qty * p.price), grouped by city.', '<code>SELECT st.city, SUM(s.qty * p.price) AS revenue FROM sales s JOIN stores st ON s.store_id = st.store_id JOIN products p ON s.sku = p.sku GROUP BY st.city ORDER BY revenue DESC;</code>'],
    learn: 'This would take lookups, a helper column and a pivot table in a spreadsheet. In SQL it is one query.',
    check: sqlCheckSelect(function (r) {
      var ci = findCol(r, function (v) { return sameSet(v, Object.keys(X.revByCity)); });
      if (ci < 0) return no('There should be one row per city.');
      var vi = findCol(r, function (v, i) { return i !== ci && r.rows.every(function (row) { return near(row[i], X.revByCity[row[ci]], 0.01); }); });
      if (vi < 0) return no('The revenue numbers do not match yet.');
      var vals = colValues(r, vi);
      return vals.every(function (v, i) { return i === 0 || v <= vals[i - 1]; }) ? ok() : no('Right numbers! Now sort highest first (ORDER BY ... DESC).');
    }) });
  add({ id: 'sql-avg', plat: 'sql', title: 'The Integer Division Trap', xp: 20, level: 2,
    task: 'Find the <b>average qty</b> per sale with its decimals (it is NOT a whole number). Try <code>SELECT SUM(qty) / COUNT(*) FROM sales;</code> first and see what goes wrong.',
    hints: ['qty and COUNT(*) are whole numbers, so SQL does whole-number division and drops the decimals.', 'AVG() does it right. Or make one side a decimal: SUM(qty) * 1.0 / COUNT(*)', '<code>SELECT AVG(qty) FROM sales;</code>'],
    learn: 'In SQL, 7 / 2 = 3. In a spreadsheet, 7 / 2 = 3.5. Same math, different rules!',
    check: sqlCheckSelect(function (r) {
      return r.rows.some(function (row) { return row.some(function (v) { return near(v, X.avgQty, 0.006); }); }) ? ok() : no('Expected about ' + X.avgQty.toFixed(2) + '. If you got 4, that is integer division.');
    }) });
  add({ id: 'sql-update', plat: 'sql', title: 'Restock Day', xp: 25, level: 3,
    task: 'The truck arrived! For every product where <b>in_stock</b> is below <b>reorder_at</b>, set in_stock to <b>reorder_at × 2</b>. Leave the others alone. (If you mess up, use Reset database.)',
    hints: ['UPDATE products SET column = new_value WHERE condition;', 'The condition: in_stock &lt; reorder_at', '<code>UPDATE products SET in_stock = reorder_at * 2 WHERE in_stock &lt; reorder_at;</code>'],
    learn: 'Forget the WHERE and EVERY product changes. Real databases have no Ctrl+Z!',
    check: function (h) {
      var t = h.db.table('products');
      var bad = [];
      P.forEach(function (p) {
        var row = t.rows.filter(function (r) { return r[0] === p[0]; })[0];
        if (!row) { bad.push(p[0] + ' is missing'); return; }
        var want = p[5] < p[6] ? p[6] * 2 : p[5];
        if (row[5] !== want) bad.push(p[0] + ' has in_stock ' + row[5] + ' (expected ' + want + ')');
      });
      return bad.length ? no(bad[0] + '. Reset the database and try again if needed.') : ok();
    } });


  // ===== v2: Data Wrangling Lab =====
  var W = SX.wrangle.X, WR = 'RawOrders';
  var EURO = SX.wrangle.EURO_ROW;
  add({ id: 'wr-quiz-zero', plat: 'wr1', type: 'quiz', title: 'Where Did the Zero Go?', xp: 10, level: 1,
    task: 'RawOrders!C2 shows <b>104</b>, but the real item code is <b>0104</b>. Why?',
    options: ['Someone typed it wrong', 'It was stored as a NUMBER, and numbers never keep leading zeros', 'The cell is too narrow', 'Leading zeros are hidden by formatting'], answer: 1,
    hints: ['Look at how the cell is aligned. Numbers line up on the right, text on the left.'],
    learn: 'IDs, ZIP codes and phone numbers are TEXT, even though they are made of digits. An AI model will treat 104 and "0104" as two different items.' });
  add({ id: 'wr-code', plat: 'wr1', title: 'Rebuild the Item Codes', xp: 20, level: 1, target: 'RawOrders!I2',
    task: 'Type <b>CleanCode</b> in RawOrders!I1. In <b>I2:I31</b>, turn every ItemCode (column C) into a 4-character text code like <b>0104</b> — whether it arrived as 104, "0104" or " 0402".',
    hints: ['TEXT(value, "0000") writes a number with at least 4 digits, adding zeros in front.', 'TEXT also understands digits stored as text, and ignores the stray spaces.', '<code>=TEXT(C2, "0000")</code> then fill down to row 31 (Ctrl+D).'],
    learn: 'TEXT(x, "0000") is the spreadsheet version of zero-padding. SQL: printf(\'%04d\', x). Python: str(x).zfill(4).',
    check: columnCheck(WR, 'I', 2, W.codes) });
  add({ id: 'wr-blanks', plat: 'wr1', title: 'Count the Holes', xp: 10, level: 1, target: 'Report!B2',
    task: 'In <b>Report!B2</b>, count how many Qty cells (RawOrders!E2:E31) are <b>completely empty</b>.',
    hints: ['COUNTBLANK(range) counts empty cells.', '<code>=COUNTBLANK(RawOrders!E2:E31)</code>'],
    learn: 'Empty is only ONE kind of missing data. Look at the next challenge…',
    check: valueCheck('Report!B2', W.blankQty) });
  add({ id: 'wr-fakenull', plat: 'wr1', title: 'Fake Nulls', xp: 20, level: 2, target: 'Report!B3',
    task: 'Some systems write missing values as words. In <b>Report!B3</b>, count Qty cells that say <b>N/A</b>, <b>-</b> or <b>null</b>.',
    hints: ['COUNTIF counts one kind of value. You can add several COUNTIFs together.', '<code>=COUNTIF(RawOrders!E2:E31, "N/A") + COUNTIF(RawOrders!E2:E31, "-") + COUNTIF(RawOrders!E2:E31, "null")</code>'],
    learn: 'COUNTBLANK said ' + W.blankQty + ' — the real number of missing quantities is ' + W.missingQty + '. "null", "N/A" and "-" are TEXT that MEANS missing. Before training a model, they must all become one true blank/NA.',
    check: valueCheck('Report!B3', W.fakeNullQty) });
  add({ id: 'wr-qty', plat: 'wr1', title: 'One Kind of Missing', xp: 25, level: 2, target: 'RawOrders!J2',
    task: 'Type <b>CleanQty</b> in J1. In <b>J2:J31</b>, turn Qty into a real number — "12" (text) becomes 12 — and turn every kind of missing value into a blank <code>""</code>.',
    hints: ['VALUE(text) turns "12" into 12. VALUE("N/A") and VALUE("") give #VALUE!.', 'IFERROR(x, "") replaces any error with an empty string.', '<code>=IFERROR(VALUE(E2), "")</code> then fill down.'],
    learn: 'Text that looks like a number does not add up: SUM ignores "12". Converting types is step one of every data-cleaning job.',
    check: columnCheck(WR, 'J', 2, W.qty) });
  add({ id: 'wr-store', plat: 'wr1', title: 'Same Store, Different Spelling', xp: 15, level: 1, target: 'RawOrders!K2',
    task: 'Type <b>CleanStore</b> in K1. In <b>K2:K31</b>, clean the Store codes so "s04" and " S02 " become <b>S04</b> and <b>S02</b>.',
    hints: ['TRIM removes extra spaces. UPPER makes capitals.', 'Nest them: one function inside the other.', '<code>=UPPER(TRIM(B2))</code>'],
    learn: 'To a computer "S04", "s04" and " S04" are three different stores. A model trained on this would think you have 13 stores!',
    check: columnCheck(WR, 'K', 2, W.stores) });
  add({ id: 'wr-price', plat: 'wr1', title: 'Prices That Are Really Text', xp: 15, level: 1, target: 'RawOrders!L2',
    task: 'Type <b>CleanPrice</b> in L1. In <b>L2:L31</b>, turn UnitPrice into real numbers ("$3.25" → 3.25, "14.99 " → 14.99).',
    hints: ['VALUE understands $ signs, commas and extra spaces.', '<code>=VALUE(F2)</code>'],
    learn: 'If a column has even ONE text price, averages and sums silently skip it. Always check types.',
    check: columnCheck(WR, 'L', 2, W.prices) });
  add({ id: 'wr-date', plat: 'wr1', title: 'Four Kinds of Dates', xp: 30, level: 2, target: 'RawOrders!M2',
    task: 'Type <b>CleanDate</b> in M1. In <b>M2:M31</b>, make every OrderDate a <b>real date</b>. Some are already dates, others are text like "2026-09-12", "9/23/2026" or "Sep 4, 2026". (Row 19 is special — skip it for now.)',
    hints: ['ISNUMBER(D2) is TRUE when D2 is already a real date (dates are numbers underneath).', 'DATEVALUE("Sep 4, 2026") turns date TEXT into a real date.', '<code>=IF(ISNUMBER(D2), D2, DATEVALUE(D2))</code> — then format column M as Date.'],
    learn: 'Real dates are numbers (days since 1900), so you can sort them, subtract them and group them by month. Text dates cannot do any of that.',
    check: columnCheck(WR, 'M', 2, W.dates, { skip: [EURO] }) });
  add({ id: 'wr-euro', plat: 'wr1', title: 'The European Date', xp: 30, level: 3, target: 'Report!B5',
    task: 'RawOrders!D19 says <b>03.09.2026</b> — in Europe that means <b>3 September 2026</b>. DATEVALUE cannot read it. In <b>Report!B5</b>, build the real date from its pieces.',
    hints: ['DATE(year, month, day) builds a date from numbers.', 'Cut the text apart: RIGHT(text, 4) is the year, MID(text, 4, 2) is the month, LEFT(text, 2) is the day.', '<code>=DATE(RIGHT(RawOrders!D19, 4), MID(RawOrders!D19, 4, 2), LEFT(RawOrders!D19, 2))</code>'],
    learn: 'Is 03/09 March 9th or September 3rd? It depends on the country. Merging data from different places is one of the most common ways datasets go wrong.',
    check: valueCheck('Report!B5', W.euroDate) });
  add({ id: 'wr-name', plat: 'wr1', title: 'Fix the Names', xp: 35, level: 3, target: 'RawOrders!N2',
    task: 'Type <b>CleanName</b> in N1. In <b>N2:N31</b>, turn every Customer into <b>First Last</b> with proper capitals: "jordan smith", "  Avery Johnson ", "TAYLOR KIM" and even "Davis, Morgan" → "Morgan Davis".',
    hints: ['PROPER(TRIM(G2)) fixes spaces and capitals for most rows.', 'For "Last, First": FIND(",", G2) gives the comma position. LEFT gets the last name, MID gets everything after the comma.', '<code>=IF(ISNUMBER(FIND(",", G2)), PROPER(TRIM(MID(G2, FIND(",", G2) + 1, 99)) &amp; " " &amp; LEFT(G2, FIND(",", G2) - 1)), PROPER(TRIM(G2)))</code>'],
    learn: 'This is a nested formula: IF, ISNUMBER, FIND, PROPER, TRIM, MID and LEFT working together. Building it one piece at a time is the skill.',
    check: columnCheck(WR, 'N', 2, W.names) });
  add({ id: 'wr-missing', plat: 'wr1', title: 'How Dirty Was It?', xp: 10, level: 1, target: 'Report!B4',
    task: 'After CleanQty is done, count in <b>Report!B4</b> how many orders have <b>no usable quantity</b>.',
    hints: ['Your CleanQty column turned every kind of missing into "". COUNTBLANK counts "" too.', '<code>=COUNTBLANK(RawOrders!J2:J31)</code>'],
    learn: 'Report your missing data. A model trained without telling anyone that 1 in 6 rows was dropped can be badly biased.',
    check: valueCheck('Report!B4', W.missingQty) });

  add({ id: 'wr-quiz-na', plat: 'wr2', type: 'quiz', title: 'The #N/A Mystery', xp: 15, level: 1,
    task: '<code>=VLOOKUP(RawOrders!C2, ItemCodes!A2:D25, 2, FALSE)</code> gives <b>#N/A</b>, even though code 0104 IS in the ItemCodes table. Why?',
    options: ['VLOOKUP only works on sorted data', 'C2 is the NUMBER 104 and the table has the TEXT "0104" — they never match', 'FALSE should be TRUE', 'ItemCodes is on a different sheet'], answer: 1,
    hints: ['Compare how C2 and ItemCodes!A2 are aligned in their cells.'],
    learn: 'A lookup only matches the same TYPE: number 104 ≠ text "0104". This is the #1 reason lookups fail on real data.' });
  add({ id: 'wr-vlookup', plat: 'wr2', title: 'Look Up the Products', xp: 20, level: 1, target: 'RawOrders!O2',
    task: 'Type <b>Product</b> in O1. In <b>O2:O31</b>, use <b>VLOOKUP</b> with your <b>CleanCode</b> (column I) to show each product name from ItemCodes.',
    hints: ['Look up I2, not C2 — I2 is the cleaned text code.', 'Lock the table with $ so it does not slide when you fill down.', '<code>=VLOOKUP(I2, ItemCodes!$A$2:$D$25, 2, FALSE)</code>'],
    learn: 'Clean first, then join. In SQL this is a JOIN; in Python pandas it is merge().',
    check: columnCheck(WR, 'O', 2, W.products, { mustUse: ['VLOOKUP'] }) });
  add({ id: 'wr-total', plat: 'wr2', title: 'Line Totals', xp: 25, level: 2, target: 'RawOrders!P2',
    task: 'Type <b>LineTotal</b> in P1. In <b>P2:P31</b>, calculate CleanQty × the ItemCodes price. If CleanQty is blank, leave LineTotal blank.',
    hints: ['Look the price up with XLOOKUP (or INDEX/MATCH) using I2.', 'Wrap it: IF(J2 = "", "", ...)', '<code>=IF(J2 = "", "", J2 * XLOOKUP(I2, ItemCodes!$A$2:$A$25, ItemCodes!$D$2:$D$25))</code>'],
    learn: 'Missing values spread: blank × price should stay blank, not turn into 0 — a fake 0 would teach a model that people order nothing.',
    check: columnCheck(WR, 'P', 2, W.lineTotals) });
  add({ id: 'wr-hlookup', plat: 'wr2', title: 'HLOOKUP Goes Sideways', xp: 15, level: 1, target: 'Report!B7',
    task: 'The Targets sheet is laid out <b>sideways</b> (stores across the top). In <b>Report!B7</b>, use <b>HLOOKUP</b> to find the Sept Target for store <b>S03</b>.',
    hints: ['HLOOKUP searches the FIRST ROW, then returns from a row below.', 'Sept Target is the 3rd row of Targets!A1:F3.', '<code>=HLOOKUP("S03", Targets!A1:F3, 3, FALSE)</code>'],
    learn: 'VLOOKUP = vertical tables, HLOOKUP = horizontal tables. XLOOKUP and INDEX/MATCH handle both.',
    check: valueCheck('Report!B7', W.targetS03, { mustUse: ['HLOOKUP'] }) });
  add({ id: 'wr-region', plat: 'wr2', title: 'Region for Every Order', xp: 20, level: 2, target: 'RawOrders!Q2',
    task: 'Type <b>Region</b> in Q1. In <b>Q2:Q31</b>, use HLOOKUP with your <b>CleanStore</b> (column K) to show each order\'s region.',
    hints: ['Use the cleaned store in K2 — " S02 " would not match.', '<code>=HLOOKUP(K2, Targets!$B$1:$F$2, 2, FALSE)</code>'],
    learn: 'Every lookup in this lab worked only because you cleaned the key column first.',
    check: columnCheck(WR, 'Q', 2, W.regions, { mustUse: ['HLOOKUP'] }) });
  add({ id: 'wr-units', plat: 'wr2', title: 'Now the Math Works', xp: 10, level: 1, target: 'Report!B8',
    task: 'In <b>Report!B8</b>, add up all the cleaned quantities (CleanQty).',
    hints: ['<code>=SUM(RawOrders!J2:J31)</code>. Try SUM on column E too and compare — the text "12"s were being skipped!'],
    learn: 'SUM(E2:E31) gives a smaller, WRONG total because it skips text numbers. Clean data changes the answer.',
    check: valueCheck('Report!B8', W.totalUnits) });
  add({ id: 'wr-lastfirst', plat: 'wr2', title: 'Last, First', xp: 15, level: 1, target: 'Contacts!G2',
    task: 'On <b>Contacts</b>, fill <b>G2:G9</b> with names written as <b>Last, First</b> (e.g. "Whitfield, Dana").',
    hints: ['The & operator joins text. The comma and space go inside quotes: ", "', '<code>=B2 &amp; ", " &amp; A2</code>'],
    learn: 'A delimiter is the character that separates pieces of text — here it is ", ".',
    check: columnCheck('Contacts', 'G', 2, W.lastFirst) });
  add({ id: 'wr-mailing', plat: 'wr2', title: 'Keep the Zero (Again)', xp: 25, level: 2, target: 'Contacts!H2',
    task: 'In <b>Contacts!H2:H9</b>, build a mailing line like <b>Burlington, VT 05401</b>. Watch out: the Zip column lost its leading zeros!',
    hints: ['Join City, ", ", State, " " and the Zip.', 'TEXT(E2, "00000") puts the missing zero back.', '<code>=C2 &amp; ", " &amp; D2 &amp; " " &amp; TEXT(E2, "00000")</code>'],
    learn: 'ZIP codes in New England start with 0. Treat ZIPs as text from the start and this problem never happens.',
    check: columnCheck('Contacts', 'H', 2, W.mailing) });
  add({ id: 'wr-tags', plat: 'wr2', title: 'Count the Delimited Tags', xp: 30, level: 3, target: 'Contacts!I2',
    task: 'Column F holds tags separated by a pipe: <code>snacks|drinks</code>. In <b>Contacts!I2:I9</b>, count how many tags each contact has (blank = 0).',
    hints: ['Number of tags = number of | characters + 1.', 'Count the pipes: LEN(F2) - LEN(SUBSTITUTE(F2, "|", "")).', '<code>=IF(F2 = "", 0, LEN(F2) - LEN(SUBSTITUTE(F2, "|", "")) + 1)</code>'],
    learn: 'Sheets has SPLIT(F2, "|") and Excel 365 has TEXTSPLIT to break the tags into cells. Counting delimiters is the trick that works everywhere.',
    check: columnCheck('Contacts', 'I', 2, W.tagCounts) });
  add({ id: 'wr-csvline', plat: 'wr2', title: 'Write a CSV Line', xp: 15, level: 1, target: 'Report!B10',
    task: 'In <b>Report!B10</b>, join Contacts!A2:E2 into one CSV line with commas between the values.',
    hints: ['TEXTJOIN(delimiter, ignore_empty, range).', '<code>=TEXTJOIN(",", FALSE, Contacts!A2:E2)</code>'],
    learn: 'This is exactly what "Save as CSV" does for every row. Now you know why a comma INSIDE a value breaks the file.',
    check: valueCheck('Report!B10', W.csvRow2) });
  add({ id: 'wr-filter', plat: 'wr2', title: 'Filter the Feed', xp: 30, level: 3, target: 'Report!D2',
    task: 'In <b>Report!D2</b>, use <b>FILTER</b> to list the OrderIDs whose CleanQty is <b>more than 10</b>. (Careful — try <code>J2:J31&gt;10</code> alone first and look at what sneaks in!)',
    hints: ['Blank text "" counts as BIGGER than any number in spreadsheet comparisons — so the missing rows sneak in.', 'Only keep real numbers: ISNUMBER(J2:J31) * (J2:J31 &gt; 10). Multiplying two tests means AND.', '<code>=FILTER(RawOrders!A2:A31, ISNUMBER(RawOrders!J2:J31) * (RawOrders!J2:J31 &gt; 10))</code>'],
    learn: 'Missing values break filters in sneaky ways. Always ask "what happens to the blanks?"',
    check: spillCheck('Report!D2', W.bigOrders, { mustUse: ['FILTER'] }) });


  // ===== v2: Lesson 9 — What is an RDBMS? =====
  add({ id: 'rd-quiz-r', plat: 'rdbms', type: 'quiz', title: 'The R in RDBMS', xp: 10, level: 1,
    task: 'What does the <b>R</b> in <b>RDBMS</b> stand for?', options: ['Random', 'Relational', 'Remote', 'Recursive'], answer: 1,
    hints: ['Think about what connects the tables.'], learn: 'Relational: data lives in tables, and keys create RELATIONSHIPS between them.' });
  add({ id: 'rd-anomaly', plat: 'rdbms', title: 'Break the Spreadsheet', xp: 15, level: 1,
    task: 'In section <b>1. Grid vs. database</b>, change the price in only <b>ONE</b> of the highlighted rows of the flat sheet. Watch the sheet start to disagree with itself.',
    hints: ['Click into one of the highlighted Price cells and type the new price.', 'Only change one — leave the others alone.'],
    learn: 'When the same fact is stored many times, copies drift apart. That is an "update anomaly". Databases avoid it by storing each fact once.',
    check: function (h) { return h.anomaly ? ok('The sheet now has two different prices for the same product — an update anomaly.') : no('Change just ONE of the highlighted price cells in section 1.'); } });
  add({ id: 'rd-quiz-pk', plat: 'rdbms', type: 'quiz', title: 'Pick a Primary Key', xp: 10, level: 1,
    task: 'You are building a <b>students</b> table for your school. Which column makes the best <b>primary key</b>?',
    options: ['First name', 'Grade level', 'Student ID number', 'Birthday'], answer: 2,
    hints: ['A primary key must be different for EVERY row, forever.'], learn: 'Names, grades and birthdays repeat. A student ID is unique — perfect for a primary key.' });
  add({ id: 'rd-quiz-fk', plat: 'rdbms', type: 'quiz', title: 'Follow the Key', xp: 10, level: 1,
    task: '<code>sales.store_id</code> holds values like <code>S03</code> that must already exist in <code>stores.store_id</code>. What is <code>sales.store_id</code>?',
    options: ['A primary key', 'A foreign key', 'A CHECK rule', 'A delimiter'], answer: 1,
    hints: ['Look at the diagram in section 3 — which column has an arrow?'], learn: 'A foreign key points at another table’s primary key. Following it is what a JOIN does.' });
  add({ id: 'rd-no', plat: 'rdbms', title: 'The Database Says NO', xp: 20, level: 2,
    task: 'Make the database refuse bad data in <b>3 different ways</b> (duplicate key, missing value, broken rule, missing parent, wrong type…). Use section 4 or any console on this page.',
    hints: ['Each "Try it" button in section 4 triggers a different kind of error.', 'Different kinds count: UNIQUE, NOT NULL, CHECK, FOREIGN KEY and type errors.'],
    learn: 'Constraints stop bad data at the door. In a spreadsheet you only find these problems later — while cleaning.',
    check: function (h) { var n = h.errorsSeen.length; return n >= 3 ? ok('Refused ' + n + ' different ways: ' + h.errorsSeen.join(', ') + '.') : no('So far the database has refused ' + n + ' kind' + (n === 1 ? '' : 's') + ' of bad data (' + (h.errorsSeen.join(', ') || 'none') + '). You need 3 different kinds.'); } });
  add({ id: 'rd-create', plat: 'rdbms', title: 'Build Your Own Table', xp: 25, level: 2,
    task: 'In <b>Free play</b>, create a table <code>students</code> with <code>student_id INTEGER PRIMARY KEY</code> and <code>name TEXT NOT NULL</code>, then insert at least <b>2</b> students.',
    hints: ['CREATE TABLE students (student_id INTEGER PRIMARY KEY, name TEXT NOT NULL);', "INSERT INTO students (name) VALUES ('Ana'), ('Ben');  — the database numbers the IDs for you.", 'Run both statements (you can put them in the console together, separated by ;).'],
    learn: 'An INTEGER PRIMARY KEY numbers new rows automatically — no duplicates, ever.',
    check: function (h) {
      var t = h.table('students'); if (!t) return no('There is no students table yet.');
      if (!t.pk.length || t.pk[0].toLowerCase() !== 'student_id') return no('students needs student_id as its PRIMARY KEY.');
      if (!t.notNull.some(function (c) { return c.toLowerCase() === 'name'; })) return no('Make name NOT NULL so every student must have one.');
      return t.rows.length >= 2 ? ok() : no('The table exists — now INSERT at least 2 students.');
    } });
  add({ id: 'rd-fk-create', plat: 'rdbms', title: 'Connect Two Tables', xp: 30, level: 3,
    task: 'Create <code>enrollments</code> with <code>student_id INTEGER REFERENCES students(student_id)</code> and <code>course TEXT NOT NULL</code>. Add an enrollment for one of your students. (Then try enrolling student 99 and watch it fail!)',
    hints: ['CREATE TABLE enrollments (student_id INTEGER REFERENCES students(student_id), course TEXT NOT NULL);', "INSERT INTO enrollments VALUES (1, 'Intro to AI');"],
    learn: 'You just built a relationship: one student, many enrollments — and the database guarantees every enrollment belongs to a real student.',
    check: function (h) {
      var t = h.table('enrollments'); if (!t) return no('There is no enrollments table yet. (Build students first.)');
      var fk = t.fks.filter(function (f) { return f.table.toLowerCase() === 'students'; })[0];
      if (!fk) return no('enrollments needs a FOREIGN KEY: student_id INTEGER REFERENCES students(student_id).');
      return t.rows.length >= 1 ? ok() : no('Now INSERT an enrollment for a student who exists.');
    } });
  add({ id: 'rd-rollback', plat: 'rdbms', title: 'Undo With ROLLBACK', xp: 20, level: 2,
    task: 'In section <b>5</b>, start a transaction, <b>DELETE every sale</b>, check they are gone — then <b>ROLLBACK</b> and bring all 60 back.',
    hints: ['Run: BEGIN; DELETE FROM sales; SELECT COUNT(*) FROM sales;', 'Then run: ROLLBACK;  and count again.'],
    learn: 'Inside a transaction nothing is permanent until COMMIT. ROLLBACK is a real undo button for the whole database.',
    check: function (h) {
      if (!h.sawRollbackDelete) return no('Delete sales inside a transaction (after BEGIN), then ROLLBACK.');
      var t = h.table('sales');
      return t && t.rows.length === 60 ? ok() : no('The sales table has ' + (t ? t.rows.length : 0) + ' rows — it should be back to 60.');
    } });
  add({ id: 'rd-bank', plat: 'rdbms', title: 'Survive the Power Failure', xp: 25, level: 2,
    task: 'In the lunch-money demo (section <b>5</b>), start <b>with a transaction</b>, pull the plug with <b>⚡ Power failure!</b>, then do the whole transfer again and <b>COMMIT</b> it.',
    hints: ['Choose "With a transaction (BEGIN)", do Step 1, then press ⚡ Power failure!', 'After the rollback, choose "With a transaction" again, do both steps, then COMMIT.'],
    learn: 'Atomicity: a transfer is either completely done or not done at all — money never vanishes.',
    check: function (h) { return h.bankDone ? ok() : no('Survive a power failure inside a transaction, then complete the transfer with COMMIT.'); } });
  add({ id: 'rd-quiz-acid', plat: 'rdbms', type: 'quiz', title: 'All or Nothing', xp: 10, level: 1,
    task: 'In a database transaction, <b>atomic</b> means…', options: ['The data is very small', 'Either every change happens or none of them do', 'It runs as fast as possible', 'The data is encrypted'], answer: 1,
    hints: ['Remember the lunch-money power failure.'], learn: 'Atomic = indivisible. ACID: Atomic, Consistent, Isolated, Durable.' });

  // ===== Compare-page quizzes =====
  add({ id: 'cmp-name', plat: 'compare', type: 'quiz', title: 'Who Says #NAME?', xp: 10, level: 1,
    task: 'Where does <code>=XLOOKUP(A2, B:B, C:C)</code> give a <b>#NAME?</b> error?',
    options: ['Excel 365', 'Excel 2013', 'Google Sheets', 'All of them'], answer: 1,
    hints: ['XLOOKUP arrived in 2019–2020.'], learn: 'Excel 2013 never got XLOOKUP. INDEX/MATCH works everywhere.' });
  add({ id: 'cmp-sort', plat: 'compare', type: 'quiz', title: 'The Silent Sort', xp: 15, level: 2,
    task: 'You type <code>=SORT(A2:C20, 3, -1)</code> in Google Sheets. What happens?',
    options: ['It sorts high → low like Excel', 'It sorts low → high', '#VALUE! error', '#NAME? error'], answer: 1,
    hints: ['In Sheets the 3rd argument is is_ascending (TRUE/FALSE).', 'Any non-zero number counts as TRUE.'], learn: 'No error, wrong answer. Always check your results!' });
  add({ id: 'cmp-blank', plat: 'compare', type: 'quiz', title: 'Pointing at Nothing', xp: 10, level: 1,
    task: 'Cell A1 is empty. What does <code>=A1</code> show in Excel vs Google Sheets?',
    options: ['Excel: blank, Sheets: 0', 'Excel: 0, Sheets: blank', 'Both: 0', 'Both: #REF!'], answer: 1,
    hints: ['Try it in the Scratch sheet of each app!'], learn: 'Little differences like this break checks such as =IF(B2="", ...).' });
  add({ id: 'cmp-cse', plat: 'compare', type: 'quiz', title: 'Array Formulas Through Time', xp: 15, level: 2,
    task: 'Which one needs <b>Ctrl+Shift+Enter</b> (or ARRAYFORMULA) to make <code>=MAX(IF(C2:C25="Snacks", D2:D25))</code> give the right answer?',
    options: ['Only Excel 365', 'Excel 2013 and Google Sheets', 'Only Google Sheets', 'None of them'], answer: 1,
    hints: ['Dynamic arrays arrived in Excel 365.'], learn: 'Excel 2013 needs Ctrl+Shift+Enter; Google Sheets needs ARRAYFORMULA (Ctrl+Shift+Enter adds it for you).' });
  add({ id: 'cmp-sql', plat: 'compare', type: 'quiz', title: 'Spreadsheet → SQL', xp: 10, level: 1,
    task: 'Which SQL clause does the same job as <b>VLOOKUP</b>?',
    options: ['WHERE', 'GROUP BY', 'JOIN', 'ORDER BY'], answer: 2,
    hints: ['VLOOKUP connects data from two tables.'], learn: 'JOIN matches rows from two tables, like a lookup on every row at once.' });


  // ---------- Helper object handed to spreadsheet checks ----------
  function sheetHelpers(wb) {
    function loc(addr) {
      var m = /^(?:(.+)!)?\$?([A-Z]+)\$?(\d+)$/i.exec(addr);
      return { sheet: wb.sheetName(m[1] || 'Scratch'), r: +m[3] - 1, c: SX.f.colToIdx(m[2]) };
    }
    function astOf(addr) { var c = h.cell(addr); return c && c.ast; }
    var h = {
      wb: wb,
      cell: function (a) { var l = loc(a); return wb.getCell(l.sheet, l.r, l.c); },
      val: function (a) { var l = loc(a); return wb.value(l.sheet, l.r, l.c); },
      text: function (a) { var l = loc(a); return wb.display(l.sheet, l.r, l.c).text; },
      formula: function (a) { var c = h.cell(a); return c ? c.input.toUpperCase() : ''; },
      count: function (a, fn) {
        var ast = astOf(a), n = 0; if (!ast) return 0;
        SX.f.walk(ast, function (x) { if (x.t === 'fn' && x.name === fn) n++; }); return n;
      },
      uses: function (a, fn) { return h.count(a, fn) > 0; },
      argCount: function (a, fn) {
        var ast = astOf(a), n = 0; if (!ast) return 0;
        SX.f.walk(ast, function (x) { if (x.t === 'fn' && x.name === fn) n = Math.max(n, x.args.length); }); return n;
      },
      spill: function (a) { var l = loc(a); var sp = wb.spills[l.sheet + '|' + l.r + ',' + l.c]; return sp ? sp.mat : null; },
      tryInput: function (a, input, target) {
        var w = new SX.Workbook(wb.platId); w.load(wb.serialize());
        var l = loc(a); w.setCell(l.sheet, l.r, l.c, { input: input }); w.recalc();
        var t = loc(target); return w.value(t.sheet, t.r, t.c);
      }
    };
    return h;
  }

  SX.challenges = { sheetHelpers: sheetHelpers, LIST: C, X: X, byId: function (id) { return C.filter(function (c) { return c.id === id; })[0]; },
    forPlat: function (p) { return C.filter(function (c) { return c.plat === p; }); } };
})(globalThis.SX = globalThis.SX || {});
