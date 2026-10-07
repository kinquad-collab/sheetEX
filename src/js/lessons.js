/* SheetEX v2 — lessons (groups of challenges) and certificate codes. */
(function (SX) {
  'use strict';

  var LESSONS = [
    { id: 'xl365', n: 1, title: 'Spreadsheet Foundations', tool: 'Excel 365', workspace: 'xl365',
      skills: ['SUM, COUNTIF, SUMIF', 'XLOOKUP', 'FILTER, SORT, UNIQUE (dynamic arrays)', 'IFS and LET', 'Absolute vs relative references'] },
    { id: 'xl2013', n: 2, title: 'Classic Excel & Nested Functions', tool: 'Excel 2013', workspace: 'xl2013',
      skills: ['INDEX + MATCH', 'VLOOKUP exact match', 'Nested IF', 'IFERROR', 'Ctrl+Shift+Enter array formulas'] },
    { id: 'gs', n: 3, title: 'Google Sheets Survival Guide', tool: 'Google Sheets', workspace: 'gs',
      skills: ['FILTER and SORT the Sheets way', 'ARRAYFORMULA', 'QUERY', 'SPLIT and REGEXMATCH', 'Open-ended ranges'] },
    { id: 'csv', n: 4, title: 'Data Files: CSV & TSV', tool: 'CSV / TSV', workspace: 'csv',
      skills: ['Values vs formulas', 'Quoting and escaping', 'Delimiters', 'How spreadsheets change data on import'] },
    { id: 'wr1', n: 5, title: 'Data Wrangling I: Cleaning Data for AI', tool: 'Data Wrangling Lab', workspace: 'wrangle',
      skills: ['Leading zeros and text vs numbers', 'Finding blank and fake-null values', 'Converting text to numbers', 'Fixing mixed date formats', 'TRIM, PROPER, UPPER, nested text formulas'] },
    { id: 'wr2', n: 6, title: 'Data Wrangling II: Combining & Lookups', tool: 'Data Wrangling Lab', workspace: 'wrangle',
      skills: ['VLOOKUP and HLOOKUP', 'Why lookups fail (type mismatch)', 'Concatenation and delimiters', 'TEXTJOIN', 'Filtering around missing values'] },
    { id: 'sql', n: 7, title: 'SQL for Data Analysts', tool: 'SQL Database', workspace: 'sql',
      skills: ['SELECT, WHERE, ORDER BY', 'GROUP BY and HAVING', 'JOIN (the SQL VLOOKUP)', 'Integer division', 'UPDATE safely'] },
    { id: 'rdbms', n: 9, title: 'Databases 101: What is an RDBMS?', tool: 'RDBMS Explorer', workspace: 'rdbms',
      skills: ['Tables, rows, columns and data types', 'Primary keys and foreign keys', 'Relationships and JOINs', 'Constraints that refuse bad data', 'Transactions and ACID'] },
    { id: 'ml', n: 10, title: 'Databases for Machine Learning', tool: 'ML Data Lab', workspace: 'ml',
      skills: ['Examples, features and labels', 'Class balance and baselines', 'Missing values', 'Train/test splits and data leakage', 'Grading a model: accuracy and the confusion matrix'] },
    { id: 'tools1', n: 11, title: 'Sort, Filter & Clean with the Menus', tool: 'Data Tools Lab', workspace: 'tools',
      skills: ['Sorting without scrambling rows', 'Filters and SUBTOTAL', 'Find & Replace, Trim and Paste Values', 'Remove Duplicates and Text to Columns', 'Data validation and conditional formatting'] },
    { id: 'tools2', n: 12, title: 'Pivot Tables & Charts', tool: 'Data Tools Lab', workspace: 'tools',
      skills: ['Pivot tables: rows, columns, values, filters', 'Sum vs Count', 'Refreshing pivots (Excel) vs automatic (Sheets)', 'Checking a pivot with SUMIFS', 'Choosing column, line, pie and scatter charts'] },
    { id: 'compare', n: 8, title: 'Cross-Platform Translator', tool: 'Compare', workspace: 'compare',
      skills: ['Which functions exist where', 'Silent differences between apps', 'Spreadsheet ideas in SQL'] }
  ];

  // ---- Lesson guides: why it matters, vocabulary, traps ----
  var GUIDES = {
    xl365: {
      why: 'Spreadsheets are where most data work starts — including the data used to train and test AI. Modern Excel can answer questions about thousands of rows with one formula.',
      terms: [
        ['Formula', 'Starts with = and calculates something.', '=SUM(F2:F25)'],
        ['Range', 'A rectangle of cells, written first:last.', 'Products!D2:D25'],
        ['Relative vs absolute reference', 'A2 shifts when copied; $A$2 stays put.', '=E2*$H$1'],
        ['Function argument', 'The values inside the parentheses, separated by commas.', 'SUMIF(range, criteria, sum_range)'],
        ['Dynamic array / spill', 'One formula returns many results that flow into the cells below.', '=FILTER(B2:B25, C2:C25="Drinks")'],
        ['Lookup', 'Find a row by a key and return another column from it.', '=XLOOKUP("SKU-404", A2:A25, B2:B25)']
      ],
      traps: ['#SPILL! means something is in the way of a spilling result — clear the cells below.', 'Fill formulas down with Ctrl+D; check the $ signs before you do.', 'A typed number is frozen; a formula updates when the data changes.']
    },
    xl2013: {
      why: 'Not everyone has the newest software. Building answers from classic functions teaches you how lookups and logic really work — and your files will open on any computer.',
      terms: [
        ['Nesting', 'Putting one function inside another. The inside one runs first.', '=IF(A2>10, "Big", IF(A2>5, "Medium", "Small"))'],
        ['INDEX / MATCH', 'MATCH finds the position; INDEX returns the value at that position.', '=INDEX(B2:B25, MATCH("SKU-404", A2:A25, 0))'],
        ['Exact vs approximate match', 'VLOOKUP needs FALSE for exact matches.', '=VLOOKUP(x, A2:D25, 3, FALSE)'],
        ['Array formula (CSE)', 'A formula that works on whole ranges, confirmed with Ctrl+Shift+Enter.', '{=MAX(IF(C2:C25="Snacks", D2:D25))}'],
        ['#NAME?', 'The program does not know a function name — often because it is too new.', '=XLOOKUP(...) in Excel 2013']
      ],
      traps: ['Forgetting FALSE in VLOOKUP gives wrong answers with no error.', 'Without Ctrl+Shift+Enter, array formulas quietly use only one row.', 'Count your parentheses: every IF( needs a ).']
    },
    gs: {
      why: 'Google Sheets runs on every Chromebook and is built for sharing. It looks like Excel, but its functions do not always take the same arguments — the #1 reason "it worked at school but not at home".',
      terms: [
        ['ARRAYFORMULA', 'Lets normal formulas work on whole ranges and fill a column with one formula.', '=ARRAYFORMULA(D2:D25-E2:E25)'],
        ['FILTER conditions', 'Each condition is its own argument (AND).', '=FILTER(B2:B25, C2:C25="Snacks", D2:D25>1)'],
        ['is_ascending', 'SORT direction is TRUE/FALSE in Sheets.', '=SORT(B2:D25, 3, FALSE)'],
        ['QUERY', 'SQL-like questions inside a spreadsheet; columns are letters.', '=QUERY(A1:H25, "select C, sum(F) group by C")'],
        ['Open-ended range', 'E2:E means "E2 to the bottom".', '=SUM(Sales!E2:E)']
      ],
      traps: ['SORT(…, -1) sorts ASCENDING in Sheets — no error, wrong answer.', 'CONCAT only joins two values in Sheets.', 'A bad formula is saved and shows #ERROR! instead of a pop-up.']
    },
    csv: {
      why: 'CSV is how data moves between programs — and how most AI training data is shared. It is plain text: if you understand the rules, you can read and fix any dataset.',
      terms: [
        ['Delimiter', 'The character between values: comma (CSV) or tab (TSV).', 'SKU-101,Granola Bar,Snacks'],
        ['Field / record', 'A field is one value; a record is one line (row).', '4 fields: a,b,c,d'],
        ['Quoting', 'Values containing the delimiter, quotes or line breaks are wrapped in "double quotes".', '"Gel Pens, 4-pack"'],
        ['Escaping', 'A quote inside a quoted value is written twice.', '"12"" Ruler"'],
        ['Type inference', 'When a program opens a CSV it GUESSES types — and can change your data.', '05401 → 5401']
      ],
      traps: ['Saving as CSV throws away formulas, formatting and other sheets.', 'Opening a CSV in a spreadsheet can drop leading zeros and mangle long IDs.', 'An extra comma in one row shifts every value after it.']
    },
    wr1: {
      why: 'Data scientists spend most of their time cleaning data. An AI model learns whatever is in its training data — including typos, duplicates and fake zeros. Clean data is the difference between a useful model and a confident wrong one.',
      terms: [
        ['Data type', 'Number, text, date, TRUE/FALSE. Digits can be TEXT ("0104").', '=ISTEXT(C2)'],
        ['Null / missing value', 'No value. Can hide as blanks or as words like N/A, -, null.', '=COUNTBLANK(E2:E31)'],
        ['Type conversion', 'Changing a value’s type.', '=VALUE("12")   =TEXT(104, "0000")'],
        ['Normalization', 'Making the same thing look the same: case, spaces, formats.', '=UPPER(TRIM(B2))'],
        ['Date serial', 'Real dates are numbers (days since 1900), so they sort and subtract.', '=DATEVALUE("Sep 4, 2026")'],
        ['Garbage in, garbage out', 'A model can only be as good as its data.', 'Open the 🤖 AI check tab']
      ],
      traps: ['Replacing missing values with 0 changes averages — missing is not zero.', '03.09.2026 is September 3 in Europe and March 9 in the US.', 'Clean into NEW columns so you can always compare with the original.']
    },
    wr2: {
      why: 'Real datasets live in separate tables. Joining them — matching orders to products, stores to regions — only works when the keys match exactly. This is the same idea as a JOIN in SQL or merge() in Python.',
      terms: [
        ['Key', 'The column used to match rows between tables.', 'Item code 0104'],
        ['VLOOKUP / HLOOKUP', 'Look up down the first column / across the first row.', '=HLOOKUP("S03", Targets!A1:F3, 3, FALSE)'],
        ['Type mismatch', 'Number 104 never equals text "0104" — the lookup returns #N/A.', '=VLOOKUP(C2, ...) → #N/A'],
        ['Concatenation', 'Joining text together.', '=B2 & ", " & A2'],
        ['Delimited list', 'Several values in one cell separated by a character.', 'snacks|drinks|apparel'],
        ['Filtering', 'Keeping only rows that pass a test — watch out for blanks.', '=FILTER(A2:A31, ISNUMBER(J2:J31)*(J2:J31>10))']
      ],
      traps: ['Clean the key column BEFORE looking up.', 'Lock lookup ranges with $ before filling down.', 'Blank text "" counts as bigger than any number in comparisons.']
    },
    sql: {
      why: 'Companies keep their data in databases, and SQL is how you ask them questions. Every spreadsheet skill has a SQL twin — and SQL scales to millions of rows.',
      terms: [
        ['SELECT … FROM', 'Choose columns from a table.', 'SELECT product, price FROM products;'],
        ['WHERE', 'Keep only matching rows (like FILTER).', "WHERE category = 'Snacks'"],
        ['GROUP BY', 'One result per group (like SUMIF for every value at once).', 'SELECT store_id, SUM(qty) FROM sales GROUP BY store_id;'],
        ['JOIN', 'Combine tables on a key (like VLOOKUP for every row).', 'FROM sales s JOIN products p ON s.sku = p.sku'],
        ['NULL', 'SQL’s missing value. Test with IS NULL, never = NULL.', 'WHERE qty IS NULL']
      ],
      traps: ["Text uses 'single quotes'.", 'Whole-number division drops decimals: 7 / 2 = 3.', 'UPDATE or DELETE without WHERE changes every row.']
    },
    rdbms: {
      why: 'Spreadsheets hold data; a relational database guards it. Real companies — and the AI systems they build — keep their important data in an RDBMS because it refuses bad data, connects tables with keys, and never leaves a change half-done.',
      terms: [
        ['Table / row / column', 'A table holds one kind of thing; each row is one item; each column is one typed attribute.', 'products: one row per product'],
        ['Primary key', 'A column whose value is different for every row — the row\u2019s ID.', 'products.sku'],
        ['Foreign key', 'A column that holds another table\u2019s primary key, linking the two.', 'sales.sku → products.sku'],
        ['Constraint', 'A rule the database enforces: NOT NULL, UNIQUE, CHECK, FOREIGN KEY, types.', 'CHECK (price >= 0)'],
        ['Normalization', 'Store each fact once, in one place, and link to it.', 'Price lives only in products'],
        ['Transaction', 'Several changes that succeed or fail together.', 'BEGIN; … COMMIT;  (or ROLLBACK;)']
      ],
      traps: ['A spreadsheet that repeats the same fact in many rows will eventually disagree with itself.', 'A foreign key must point at a row that already exists — add the parent first.', 'Nothing inside BEGIN is permanent until COMMIT.']
    },
    ml: {
      why: 'A machine-learning model only knows what its training table shows it. Most AI mistakes are really data mistakes: the wrong rows, a column that gives away the answer, or a test that was secretly part of the training. SQL is how data scientists find them.',
      terms: [
        ['Example', 'One row the model learns from.', 'Product SKU-101 at store S03 in week 2'],
        ['Feature', 'An input column the model may use to make its guess.', 'promo, price, units_last_week'],
        ['Label', 'The answer the model is trying to predict.', 'stockout (1 = ran out, 0 = did not)'],
        ['Class imbalance', 'One answer is much rarer than the other.', '17 stockouts vs 47 non-stockouts'],
        ['Train / test split', 'Learn from some rows; check on rows the model has never seen.', "WHERE split = 'test'"],
        ['Data leakage', 'The model sees the answer during training — test copies, or a column only known afterwards.', 'restock_after'],
        ['Baseline', 'The score of a "dumb" model. A real model must beat it.', 'Always predict 0'],
        ['Confusion matrix', 'Counts of right and wrong guesses for each answer.', 'GROUP BY stockout, predicted']
      ],
      traps: ['High accuracy can be meaningless when one answer is rare — compare with a baseline.', 'If a model looks perfect, look for leakage before celebrating.', 'Never let test rows (or copies of them) into the training table.']
    },
    tools1: {
      why: 'Most real cleanup is done with the menus, not formulas: sort, filter, remove duplicates, split, find & replace. Each one is fast — and each one can silently wreck a dataset if you use it on the wrong range. Excel and Google Sheets also behave differently in ways that matter.',
      terms: [
        ['Sort (whole table)', 'Reorders entire rows by one column.', 'Data ▸ Sort, with "My data has headers"'],
        ['Filter', 'Hides rows that do not match; nothing is deleted.', 'Data ▸ Filter, then the ▾ in a header'],
        ['SUBTOTAL', 'Totals only the rows you can see.', '=SUBTOTAL(9, F2:F40)'],
        ['Remove Duplicates', 'Deletes rows whose chosen columns all match an earlier row.', 'Data ▸ Remove Duplicates'],
        ['Text to Columns / Split', 'Breaks one column into several at a delimiter.', '"Atlanta, GA" → Atlanta | GA'],
        ['Paste Values', 'Pastes results only — formulas become plain values.', 'Excel Ctrl+Alt+V · Sheets Ctrl+Shift+V'],
        ['Data validation', 'A rule for what may be TYPED into cells.', 'Whole number between 1 and 100'],
        ['Conditional formatting', 'Colors cells that meet a rule, so problems stand out.', '=COUNTIF($A$2:$A$40, A2) > 1']
      ],
      traps: ['Sorting one column scrambles every record. Excel warns you; Google Sheets "Sort range" does not, and "Sort sheet" moves the header too.', 'SUM counts hidden (filtered) rows; SUBTOTAL does not.', 'Trailing spaces make duplicates invisible: trim first, then remove duplicates.', 'Validation does not check data that is already there or pasted in.']
    },
    tools2: {
      why: 'Pivot tables turn hundreds of rows into a summary in seconds, and charts turn that summary into something a person understands at a glance. Choosing the right summary and the right chart is a core analyst skill — and so is knowing when the numbers are out of date.',
      terms: [
        ['Pivot table', 'A summary you build by choosing fields.', 'Rows = Category, Values = Sum of Qty'],
        ['Rows / Columns', 'The groups down the side and across the top.', 'Category × Channel'],
        ['Values (Sum / Count)', 'What to calculate for each group.', 'Sum of Qty vs Count of OrderID'],
        ['Refresh', 'Excel pivots update only when refreshed; Sheets pivots update by themselves.', 'Data ▸ Refresh All'],
        ['Column / bar chart', 'Compares amounts between categories.', 'Units by category'],
        ['Line chart', 'Shows change over time.', 'Units per month'],
        ['Pie chart', 'Shows parts of one whole (few slices).', 'Online vs In-store share'],
        ['Scatter chart', 'Shows whether two numbers move together.', 'Ad spend vs visitors']
      ],
      traps: ['Summing an ID column gives a meaningless number — count it instead.', 'An Excel pivot shows old numbers until you Refresh.', 'Do not chart the Grand Total row next to its parts.', 'Bars should start at 0; a cut-off axis exaggerates differences.']
    },
    compare: {
      why: 'The same formula can work, fail, or silently give a different answer depending on the app. Checking before you share is a professional habit.',
      terms: [
        ['Compatibility', 'Whether a formula works in another app or version.', 'XLOOKUP: Excel 365 ✓, Excel 2013 ✗'],
        ['Silent difference', 'No error, but a different result — the most dangerous kind.', 'SORT(…, -1) in Sheets'],
        ['Translation', 'Rewriting a formula so it works elsewhere.', 'XLOOKUP → INDEX/MATCH']
      ],
      traps: ['Test your file in the app your audience will use.', 'Prefer functions that exist everywhere when sharing widely.']
    }
  };
  LESSONS.forEach(function (l) { l.guide = GUIDES[l.id]; });
  LESSONS.sort(function (a, b) { return a.n - b.n; });

  function byId(id) { return LESSONS.filter(function (l) { return l.id === id; })[0]; }

  // ---- Certificate codes: sealed with SX.seal (see seal.js), strictly validated when read ----
  function certCode(c) {
    return SX.seal.pack('SXC2', { n: c.name, i: c.sid, l: c.lesson, x: c.xp, m: c.maxXp, h: c.hints, c: c.count, s: c.score, q: c.of, a: c.attempts, d: c.secs, t: c.time });
  }
  function isInt(x, lo, hi) { return typeof x === 'number' && Math.floor(x) === x && x >= lo && x <= hi; }
  function readCert(code) {
    var r = SX.seal.unpack('SXC2', code);
    if (!r.ok) return r;
    var o = r.obj, L = byId(o.l), keys = ['n', 'i', 'l', 'x', 'm', 'h', 'c', 's', 'q', 'a', 'd', 't'];
    var exact = o && typeof o === 'object' && Object.keys(o).length === keys.length && keys.every(function (k) { return k in o; });
    var ok = exact && L && typeof o.n === 'string' && o.n.length >= 3 && o.n.length <= 40 && /^[A-Za-z0-9_-]{12}$/.test(o.i) &&
      isInt(o.x, 0, 10000) && isInt(o.m, 1, 10000) && o.x <= o.m && isInt(o.h, 0, 500) && isInt(o.c, 1, 100) &&
      isInt(o.q, 1, 50) && isInt(o.s, 0, o.q) && isInt(o.a, 1, 999) && isInt(o.d, 0, 86400) && isInt(o.t, 1.6e12, 4e12);
    if (!ok) return { ok: false, why: 'This certificate code does not have the exact format SheetEX makes. It cannot be used.' };
    return { ok: true, cert: { name: o.n, sid: o.i, lesson: o.l, title: L.title, n: L.n, xp: o.x, maxXp: o.m, hints: o.h, count: o.c,
      score: o.s, of: o.q, attempts: o.a, secs: o.d, time: o.t } };
  }

  SX.lessons = { LIST: LESSONS, byId: byId, certCode: certCode, readCert: readCert };
})(globalThis.SX = globalThis.SX || {});
