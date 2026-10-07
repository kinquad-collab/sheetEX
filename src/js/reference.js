/* SheetEX v2 — Interactive cheat sheet data: one task, every tool.
 * Each tool entry is a string (runnable code), 'same' (copy the Excel 365 answer),
 * or { code, note, run:false } / { none: 'why it is not possible' }.
 * data: 'wr' = Data Wrangling Lab workbook, 'store' = store workbook. Formulas run in a blank cell. */
(function (SX) {
  'use strict';
  var R = [];
  function add(o) { R.push(o); }

  var CATS = ['Types & leading zeros', 'Cleaning text', 'Missing values (nulls)', 'Dates', 'Joining & delimiters', 'Lookups', 'Filter, sort, unique', 'Summarize'];

  // ---- Types & leading zeros ----
  add({ cat: 0, task: 'Pad a code with leading zeros', why: '104 → 0104. IDs and ZIPs must keep their zeros.', data: 'wr',
    xl365: '=TEXT(RawOrders!C2, "0000")', xl2013: 'same', gs: 'same',
    sql: "SELECT item_code, printf('%04d', item_code) AS clean FROM raw_orders LIMIT 5;",
    csv: 'A CSV can store 0104 fine. The zero is lost when a spreadsheet OPENS the file and guesses it is a number.' });
  add({ cat: 0, task: 'Is it text or a number?', why: 'Digits stored as text look the same but behave differently.', data: 'wr',
    xl365: '=ISTEXT(RawOrders!C3)', xl2013: 'same', gs: 'same',
    sql: 'SELECT item_code, typeof(item_code) FROM raw_orders LIMIT 3;',
    csv: 'Everything in a CSV is text. The program reading it decides the types.' });
  add({ cat: 0, task: 'Text that looks like a number → number', why: '"12" is skipped by SUM; 12 is not.', data: 'wr',
    xl365: '=VALUE("12") + 1', xl2013: 'same', gs: 'same',
    sql: "SELECT CAST('12' AS INTEGER) + 1;",
    csv: 'No conversion needed in the file itself — it is all text.' });
  add({ cat: 0, task: 'Number → text', why: 'So a lookup key matches a text column.', data: 'wr',
    xl365: '=RawOrders!C2 & ""', xl2013: 'same', gs: 'same',
    sql: 'SELECT CAST(123 AS TEXT) || \'\';', csv: '—' });

  // ---- Cleaning text ----
  add({ cat: 1, task: 'Remove extra spaces', why: '" S02 " and "S02" do not match.', data: 'wr',
    xl365: '=TRIM(RawOrders!B4)', xl2013: 'same', gs: 'same',
    sql: 'SELECT store, TRIM(store) FROM raw_orders LIMIT 4;', csv: 'Spaces inside a CSV field are kept exactly. "  Maria" stays "  Maria".' });
  add({ cat: 1, task: 'Fix capitals', why: '"s04" → "S04", "jordan smith" → "Jordan Smith".', data: 'wr',
    xl365: '=PROPER(RawOrders!G2)', xl2013: 'same', gs: 'same',
    sql: 'SELECT customer, UPPER(customer), LOWER(customer) FROM raw_orders LIMIT 3;', note: 'SQL has UPPER and LOWER but no PROPER.', csv: '—' });
  add({ cat: 1, task: 'Remove a character ($, commas…)', why: 'Turn "$3.25" into "3.25".', data: 'wr',
    xl365: '=SUBSTITUTE(RawOrders!F3, "$", "")', xl2013: 'same', gs: 'same',
    sql: "SELECT unit_price, REPLACE(unit_price, '$', '') FROM raw_orders LIMIT 3;", csv: '—' });
  add({ cat: 1, task: 'Pattern match (contains a digit?)', why: 'Find codes or names that break a rule.', data: 'store',
    xl365: '=ISNUMBER(SEARCH("4", "Gel Pens, 4-pack"))', xl2013: 'same',
    gs: '=REGEXMATCH("Gel Pens, 4-pack", "\\d")',
    sql: "SELECT product FROM products WHERE product LIKE '%4%';", note: 'Only Google Sheets has regular expressions built in.', csv: '—' });

  // ---- Missing values ----
  add({ cat: 2, task: 'Count empty cells', why: 'How much data is missing?', data: 'wr',
    xl365: '=COUNTBLANK(RawOrders!E2:E31)', xl2013: 'same', gs: 'same',
    sql: 'SELECT COUNT(*) FROM raw_orders WHERE qty IS NULL;', csv: 'An empty field is two delimiters in a row: ,,' });
  add({ cat: 2, task: 'Count fake nulls (N/A, -, null)', why: 'Words that MEAN missing are still text.', data: 'wr',
    xl365: '=SUMPRODUCT(COUNTIF(RawOrders!E2:E31, {"N/A","-","null"}))', xl2013: 'same', gs: '=ARRAYFORMULA(SUM(COUNTIF(RawOrders!E2:E31, {"N/A","-","null"})))',
    sql: "SELECT COUNT(*) FROM raw_orders WHERE qty IN ('N/A', '-', 'null');", csv: 'Watch for NA, N/A, null, -, none, 0 and 999 — all common "missing" codes.' });
  add({ cat: 2, task: 'Turn every kind of missing into one blank', why: 'One consistent missing marker before analysis.', data: 'wr',
    xl365: '=IFERROR(VALUE(RawOrders!E6), "")', xl2013: 'same', gs: 'same',
    sql: "SELECT qty, CASE WHEN qty IN ('N/A','-','null') THEN NULL ELSE CAST(qty AS INTEGER) END AS clean_qty FROM raw_orders LIMIT 6;",
    csv: 'Pick ONE convention (an empty field is best) and use it everywhere.' });
  add({ cat: 2, task: 'Replace missing with a default', why: 'e.g. treat a missing discount as 0 (only when that is TRUE!).', data: 'wr',
    xl365: '=IF(RawOrders!E6 = "", 0, RawOrders!E6)', xl2013: 'same', gs: 'same',
    sql: 'SELECT order_id, COALESCE(qty, 0) FROM raw_orders LIMIT 6;', note: 'Filling with 0 changes averages — a missing quantity is NOT zero.', csv: '—' });
  add({ cat: 2, task: 'Average that skips blanks', why: 'Blanks are ignored; zeros are not.', data: 'store',
    xl365: '=AVERAGE(Products!D2:D25)', xl2013: 'same', gs: 'same',
    sql: 'SELECT AVG(price) FROM products;', note: 'SQL AVG ignores NULL the same way.', csv: '—' });

  // ---- Dates ----
  add({ cat: 3, task: 'Date text → real date', why: 'Real dates can be sorted and subtracted.', data: 'wr',
    xl365: '=DATEVALUE("Sep 4, 2026")', xl2013: 'same', gs: 'same',
    sql: "SELECT date('2026-09-04');", note: 'SQLite stores dates as ISO text: YYYY-MM-DD sorts correctly.', csv: 'Save dates as YYYY-MM-DD in CSVs — every program reads that the same way.' });
  add({ cat: 3, task: 'Build a date from parts', why: 'Rebuild odd formats like 03.09.2026.', data: 'wr',
    xl365: '=DATE(RIGHT("03.09.2026", 4), MID("03.09.2026", 4, 2), LEFT("03.09.2026", 2))', xl2013: 'same', gs: 'same',
    sql: "SELECT printf('%s-%s-%s', substr('03.09.2026', 7, 4), substr('03.09.2026', 4, 2), substr('03.09.2026', 1, 2));", csv: '03.09.2026 is 3 September in Europe but March 9 in the US. Never trust day/month order.' });
  add({ cat: 3, task: 'Month name / year from a date', why: 'Group sales by month.', data: 'store',
    xl365: '=TEXT(Sales!B2, "mmmm yyyy")', xl2013: 'same', gs: 'same',
    sql: "SELECT order_date, strftime('%m', order_date) AS month FROM sales LIMIT 3;", csv: '—' });
  add({ cat: 3, task: 'Days between two dates', why: 'Dates are numbers underneath — just subtract.', data: 'store',
    xl365: '=DAYS(DATE(2026,9,30), DATE(2026,9,1))', xl2013: 'same', gs: 'same',
    sql: { code: "SELECT julianday('2026-09-30') - julianday('2026-09-01');", run: false, note: 'Real SQLite has julianday(); this practice database does not.' }, csv: '—' });

  // ---- Joining & delimiters ----
  add({ cat: 4, task: 'Join text with a delimiter', why: '"Whitfield" + ", " + "Dana".', data: 'wr',
    xl365: '=Contacts!B2 & ", " & Contacts!A2', xl2013: '=CONCATENATE(Contacts!B2, ", ", Contacts!A2)', gs: 'same',
    sql: "SELECT 'Whitfield' || ', ' || 'Dana';", csv: 'If a joined value contains the delimiter, the CSV must wrap it in quotes.' });
  add({ cat: 4, task: 'Join a whole range', why: 'Build a CSV line or a list.', data: 'wr',
    xl365: '=TEXTJOIN(",", TRUE, Contacts!A2:E2)', xl2013: { none: 'No TEXTJOIN in 2013: join each cell with & or CONCATENATE.' }, gs: 'same',
    sql: "SELECT GROUP_CONCAT(product, ', ') FROM products WHERE category = 'Drinks';", csv: 'This is exactly what "Save as CSV" does to every row.' });
  add({ cat: 4, task: 'Split text at a delimiter', why: '"snacks|drinks" → two cells.', data: 'wr',
    xl365: { code: '=TEXTSPLIT("snacks|drinks", "|")', run: false, note: 'Newer Excel 365 only — not simulated here. Works everywhere: LEFT/FIND (next row).' },
    xl2013: { none: 'Use Data ▸ Text to Columns, or LEFT/MID/FIND formulas.' }, gs: '=SPLIT("snacks|drinks", "|")',
    sql: { code: "SELECT substr('snacks|drinks', 1, instr('snacks|drinks', '|') - 1);", note: 'SQL has no split; cut at the delimiter position.' }, csv: 'Splitting on the delimiter is how a program reads a CSV row.' });
  add({ cat: 4, task: 'Text before / after a delimiter', why: 'Get the last name out of "Davis, Morgan".', data: 'wr',
    xl365: '=LEFT("Davis, Morgan", FIND(",", "Davis, Morgan") - 1)', xl2013: 'same', gs: 'same',
    sql: "SELECT substr('Davis, Morgan', 1, instr('Davis, Morgan', ',') - 1);", csv: '—' });
  add({ cat: 4, task: 'Count items in a delimited list', why: 'How many tags does "a|b|c" have?', data: 'wr',
    xl365: '=LEN(Contacts!F4) - LEN(SUBSTITUTE(Contacts!F4, "|", "")) + 1', xl2013: 'same', gs: 'same',
    sql: "SELECT LENGTH('a|b|c') - LENGTH(REPLACE('a|b|c', '|', '')) + 1;", csv: 'Using | inside a CSV field avoids clashing with the comma delimiter.' });

  // ---- Lookups ----
  add({ cat: 5, task: 'VLOOKUP (exact match)', why: 'Find a value in the first column, return another column.', data: 'wr',
    xl365: '=VLOOKUP("0104", ItemCodes!A2:D25, 2, FALSE)', xl2013: 'same', gs: 'same',
    sql: "SELECT product FROM item_codes WHERE code = '0104';", note: 'Always use FALSE. Without it VLOOKUP guesses on unsorted data.', csv: '—' });
  add({ cat: 5, task: 'HLOOKUP (sideways table)', why: 'Keys run across the top row.', data: 'wr',
    xl365: '=HLOOKUP("S03", Targets!A1:F3, 3, FALSE)', xl2013: 'same', gs: 'same',
    sql: { none: 'Tables in a database are never sideways — each store would be a ROW.' }, csv: '—' });
  add({ cat: 5, task: 'Modern lookup (any direction)', why: 'Look left, set a "not found" value.', data: 'wr',
    xl365: '=XLOOKUP("0104", ItemCodes!A2:A25, ItemCodes!B2:B25, "Not found")', xl2013: '=IFERROR(INDEX(ItemCodes!B2:B25, MATCH("0104", ItemCodes!A2:A25, 0)), "Not found")', gs: 'same',
    sql: "SELECT r.order_id, COALESCE(i.product, 'Not found') FROM raw_orders r LEFT JOIN item_codes i ON r.item_code = i.code LIMIT 5;", csv: '—' });
  add({ cat: 5, task: 'Why does my lookup say #N/A?', why: 'Number 104 never matches text "0104".', data: 'wr', expectError: true,
    xl365: '=VLOOKUP(RawOrders!C2, ItemCodes!A2:D25, 2, FALSE)', xl2013: 'same', gs: 'same',
    sql: "SELECT COUNT(*) AS unmatched FROM raw_orders r LEFT JOIN item_codes i ON r.item_code = i.code WHERE i.code IS NULL;", note: 'Fix the key first: TEXT(C2, "0000"), TRIM(), consistent case.', csv: '—' });
  add({ cat: 5, task: 'Lookup with the cleaned key', why: 'Clean, then look up.', data: 'wr',
    xl365: '=VLOOKUP(TEXT(RawOrders!C2, "0000"), ItemCodes!A2:D25, 2, FALSE)', xl2013: 'same', gs: 'same',
    sql: "SELECT r.order_id, i.product FROM raw_orders r JOIN item_codes i ON printf('%04d', r.item_code) = i.code LIMIT 5;", csv: '—' });

  // ---- Filter, sort, unique ----
  add({ cat: 6, task: 'Filter rows', why: 'Keep only the rows you need.', data: 'store',
    xl365: '=FILTER(Products!B2:B25, Products!C2:C25 = "Drinks", "None")', xl2013: { none: 'No FILTER: use Data ▸ Filter (AutoFilter).' },
    gs: '=FILTER(Products!B2:B25, Products!C2:C25 = "Drinks")', sql: "SELECT product FROM products WHERE category = 'Drinks';",
    note: 'Sheets FILTER has no "if empty" argument.', csv: '—' });
  add({ cat: 6, task: 'Filter with two conditions', why: 'AND logic.', data: 'store',
    xl365: '=FILTER(Products!B2:B25, (Products!C2:C25 = "Snacks") * (Products!D2:D25 > 1))', xl2013: { none: 'Use AutoFilter on two columns.' },
    gs: '=FILTER(Products!B2:B25, Products!C2:C25 = "Snacks", Products!D2:D25 > 1)', sql: "SELECT product FROM products WHERE category = 'Snacks' AND price > 1;", csv: '—' });
  add({ cat: 6, task: 'Sort high → low', why: 'Biggest first.', data: 'store',
    xl365: '=SORT(Products!B2:D25, 3, -1)', xl2013: { none: 'Use Data ▸ Sort.' }, gs: '=SORT(Products!B2:D25, 3, FALSE)',
    sql: 'SELECT product, category, price FROM products ORDER BY price DESC;', note: 'Excel uses -1, Sheets uses FALSE. Sheets treats -1 as TRUE (ascending)!', csv: '—' });
  add({ cat: 6, task: 'Unique values', why: 'Remove duplicates.', data: 'store',
    xl365: '=UNIQUE(Products!C2:C25)', xl2013: { none: 'Use Data ▸ Remove Duplicates.' }, gs: 'same',
    sql: 'SELECT DISTINCT category FROM products;', csv: '—' });

  // ---- Summarize ----
  add({ cat: 7, task: 'Sum with a condition', why: 'Total for one store.', data: 'store',
    xl365: '=SUMIF(Sales!C2:C61, "S01", Sales!E2:E61)', xl2013: 'same', gs: 'same',
    sql: "SELECT SUM(qty) FROM sales WHERE store_id = 'S01';", csv: '—' });
  add({ cat: 7, task: 'Count per group', why: 'How many products in each category?', data: 'store',
    xl365: '=COUNTIF(Products!C2:C25, "Snacks")', xl2013: 'same', gs: '=QUERY(Products!A1:H25, "select C, count(A) group by C")',
    sql: 'SELECT category, COUNT(*) FROM products GROUP BY category;', csv: '—' });
  add({ cat: 7, task: 'Biggest value with a condition', why: 'Highest Electronics price.', data: 'store',
    xl365: '=MAXIFS(Products!D2:D25, Products!C2:C25, "Electronics")', xl2013: { code: '{=MAX(IF(Products!C2:C25="Electronics", Products!D2:D25))}', cse: true, note: 'Confirm with Ctrl+Shift+Enter.' },
    gs: 'same', sql: "SELECT MAX(price) FROM products WHERE category = 'Electronics';", csv: '—' });

  var TOOLS = [
    { id: 'xl365', name: 'Excel 365', kind: 'sheet' },
    { id: 'xl2013', name: 'Excel 2013', kind: 'sheet' },
    { id: 'gs', name: 'Google Sheets', kind: 'sheet' },
    { id: 'sql', name: 'SQL', kind: 'sql' },
    { id: 'csv', name: 'CSV / TSV', kind: 'note' }
  ];

  // Normalize an entry's tool cell -> { code, run, note, none, cse }
  function cell(entry, tool) {
    var v = entry[tool];
    if (v === 'same') v = entry.xl365;
    if (v === undefined || v === null) return null;
    if (typeof v === 'string') return tool === 'csv' ? { note: v === '—' ? '' : v, run: false } : { code: v, run: true };
    var o = { code: v.code, note: v.note, none: v.none, cse: v.cse, run: v.run !== false && !!v.code };
    return o;
  }

  // Run one tool cell. Returns { text, error, rows } — rows is a small 2-D preview.
  function run(entry, tool) {
    var c = cell(entry, tool);
    if (!c || !c.run) return null;
    if (tool === 'sql') {
      try {
        var r = SX.sql.execute(SX.sql.makeStoreDb(), c.code).pop();
        if (r.type !== 'rows') return { text: r.message };
        return { rows: [r.columns].concat(r.rows.slice(0, 6)), more: r.rows.length > 6 ? r.rows.length - 6 : 0 };
      } catch (e) { return { error: e.message + (e.hint ? ' — ' + e.hint : '') }; }
    }
    var wb = entry.data === 'wr' ? SX.wrangle.makeWorkbook(tool) : SX.makeStoreWorkbook(tool);
    var sheet = entry.data === 'wr' ? 'Report' : 'Scratch', r0 = 1, c0 = entry.data === 'wr' ? 6 : 1;
    var text = c.code.replace(/^\{(.*)\}$/, '$1');
    var prep = wb.prepare(text, { cse: c.cse });
    if (prep.dialog) return { error: prep.dialog + ' ' + (prep.detail || '') };
    wb.applyEdits([{ sheet: sheet, r: r0, c: c0, cell: prep.cell }]);
    var d = wb.display(sheet, r0, c0);
    var sp = wb.spills[sheet + '|' + r0 + ',' + c0];
    if (d.err) return { error: d.err.code + (d.err.msg ? ' — ' + d.err.msg : ''), code: d.err.code };
    if (sp) {
      var rows = sp.mat.rows.map(function (row) { return row.map(function (v) { return v === null ? '' : SX.f.isErr(v) ? v.code : SX.engine.displayValue(v); }); });
      return { rows: rows.slice(0, 6), more: rows.length > 6 ? rows.length - 6 : 0 };
    }
    return { text: d.text === '' ? '(blank)' : d.text };
  }

  SX.reference = { LIST: R, CATS: CATS, TOOLS: TOOLS, cell: cell, run: run };
})(globalThis.SX = globalThis.SX || {});
