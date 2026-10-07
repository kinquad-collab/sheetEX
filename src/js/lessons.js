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

  function byId(id) { return LESSONS.filter(function (l) { return l.id === id; })[0]; }

  // --- tiny base64 (works in browsers and in tests) ---
  var B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function utf8(s) { return unescape(encodeURIComponent(s)); }
  function b64(s) {
    s = utf8(s); var out = '';
    for (var i = 0; i < s.length; i += 3) {
      var n = (s.charCodeAt(i) << 16) | ((s.charCodeAt(i + 1) || 0) << 8) | (s.charCodeAt(i + 2) || 0);
      out += B[(n >> 18) & 63] + B[(n >> 12) & 63] + (i + 1 < s.length ? B[(n >> 6) & 63] : '') + (i + 2 < s.length ? B[n & 63] : '');
    }
    return out;
  }
  function unb64(s) {
    var bytes = '';
    for (var i = 0; i < s.length; i += 4) {
      var n = 0, k;
      for (k = 0; k < 4; k++) { var ch = s[i + k]; n = n * 64 + (ch === undefined ? 0 : B.indexOf(ch)); }
      var len = Math.min(3, Math.floor((s.length - i) * 3 / 4));
      for (k = 0; k < len; k++) bytes += String.fromCharCode((n >> (16 - 8 * k)) & 255);
    }
    return decodeURIComponent(escape(bytes));
  }
  // Tamper-evidence only: anyone who reads the source can recompute this.
  function sum(s) { var x = 2026; for (var i = 0; i < s.length; i++) x = (x * 33 + s.charCodeAt(i)) % 2147483629; return x.toString(36); }

  function certCode(c) {
    var json = JSON.stringify({ n: c.name, l: c.lesson, x: c.xp, m: c.maxXp, h: c.hints, c: c.count, t: c.time });
    return 'SXC1-' + b64(json) + '-' + sum(json);
  }
  function readCert(code) {
    var m = /^SXC1-([A-Za-z0-9_-]+)-([a-z0-9]+)$/.exec(String(code).trim());
    if (!m) return null;
    try {
      var json = unb64(m[1]);
      if (sum(json) !== m[2]) return null;
      var o = JSON.parse(json), L = byId(o.l);
      return { name: o.n, lesson: o.l, title: L ? L.title : o.l, xp: o.x, maxXp: o.m, hints: o.h, count: o.c, time: o.t };
    } catch (e) { return null; }
  }
  function shortId(code) { return code.split('-').pop().toUpperCase(); }

  SX.lessons = { LIST: LESSONS, byId: byId, certCode: certCode, readCert: readCert, shortId: shortId };
})(globalThis.SX = globalThis.SX || {});
