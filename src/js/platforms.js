/* SheetEX — platform descriptions, cheat-sheet content, and the cross-platform translator. */
(function (SX) {
  'use strict';
  var F = SX.f, E = SX.engine;

  var PLATFORMS = {
    xl365: {
      id: 'xl365', name: 'Excel 365', kind: 'sheet', color: '#107c41', icon: '365',
      tagline: 'Modern Excel with dynamic arrays',
      blurb: 'The version most schools and offices use today. Formulas can spill results into many cells, and it has the newest functions like XLOOKUP, FILTER and LET.',
      title: 'Peachtree Inventory.xlsx - Excel',
      differences: [
        'Dynamic arrays: one formula can <b>spill</b> results into the cells below it. If something is in the way you get <code>#SPILL!</code>.',
        'Has XLOOKUP, XMATCH, FILTER, SORT, UNIQUE, SEQUENCE, LET, IFS, SWITCH, TEXTJOIN, CONCAT, MAXIFS and MINIFS.',
        'Refer to a whole spilled result with <code>A2#</code> (the spill operator). Google Sheets does not have this.',
        '<code>SORT(range, 3, -1)</code> sorts column 3 high→low. Sort order is <b>1 or -1</b>.',
        '<code>FILTER(range, include, [if_empty])</code> takes ONE include test. Combine tests with <code>*</code> (AND) or <code>+</code> (OR).',
        'Open-ended ranges like <code>A2:A</code> are <b>not</b> allowed. Use <code>A:A</code> or <code>A2:A1000</code>.',
        'A formula pointing at an empty cell shows <b>0</b>.',
        'Excel refuses to accept a formula with a typo and shows a <b>“There\'s a problem with this formula”</b> pop-up.'
      ],
      keys: [['Enter', 'Confirm and move down'], ['Tab', 'Confirm and move right'], ['F2', 'Edit the cell'], ['Esc', 'Cancel editing'],
        ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'], ['Ctrl+C / Ctrl+V', 'Copy / Paste (references adjust!)'], ['Ctrl+D', 'Fill down'],
        ['Ctrl+R', 'Fill right'], ['F4', 'Toggle $ absolute reference while editing'], ['Delete', 'Clear cells']]
    },
    xl2013: {
      id: 'xl2013', name: 'Excel 2013', kind: 'sheet', color: '#217346', icon: '2013',
      tagline: 'Old-school Excel: nested functions & Ctrl+Shift+Enter',
      blurb: 'Lots of home computers still run older Excel. None of the modern functions exist, so you have to build answers by nesting classic functions inside each other.',
      title: 'Peachtree Inventory.xlsx - Excel',
      differences: [
        '<b>No</b> XLOOKUP, FILTER, SORT, UNIQUE, LET, IFS, SWITCH, TEXTJOIN, CONCAT, MAXIFS, MINIFS → typing them gives <code>#NAME?</code>.',
        'Lookups: use <code>VLOOKUP(..., FALSE)</code> or the classic combo <code>INDEX(return_range, MATCH(value, lookup_range, 0))</code>.',
        'Instead of IFS, nest IFs: <code>IF(test1, a, IF(test2, b, c))</code>.',
        'No spilling. A formula that works on a whole range must be confirmed with <b>Ctrl+Shift+Enter</b>. Excel shows it as <code>{=MAX(IF(...))}</code>.',
        'Without Ctrl+Shift+Enter, a range used where one value is expected is cut down to the value in the <b>same row</b> (implicit intersection) — often the wrong answer!',
        '<code>SUMPRODUCT</code> handles arrays without Ctrl+Shift+Enter, which is why it was so popular.',
        'Join text with <code>CONCATENATE(a, b, c)</code> or <code>a & b & c</code>.'
      ],
      keys: [['Enter', 'Confirm and move down'], ['Ctrl+Shift+Enter', 'Confirm as an ARRAY formula {=...}'], ['Tab', 'Confirm and move right'],
        ['F2', 'Edit the cell'], ['Esc', 'Cancel editing'], ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'], ['Ctrl+D', 'Fill down'], ['F4', 'Toggle $ absolute reference']]
    },
    gs: {
      id: 'gs', name: 'Google Sheets', kind: 'sheet', color: '#1a73e8', icon: 'GS',
      tagline: 'Spreadsheets in the browser',
      blurb: 'Free, online, and on every Chromebook. It looks like Excel, but some functions take different arguments, and it has a few superpowers like QUERY and ARRAYFORMULA.',
      title: 'Peachtree Inventory - Google Sheets',
      differences: [
        '<code>FILTER(range, condition1, condition2, ...)</code> — each condition is its <b>own argument</b>, and there is <b>no if_empty</b>. No matches → <code>#N/A</code>.',
        '<code>SORT(range, column, is_ascending)</code> uses <b>TRUE/FALSE</b>. Typing Excel\'s <code>-1</code> still sorts ascending (any non-zero number counts as TRUE)!',
        'Operators on whole ranges (like <code>D2:D25*F2:F25</code>) need <code>ARRAYFORMULA( )</code>. Ctrl+Shift+Enter adds it for you.',
        '<code>CONCAT</code> only joins <b>two</b> values. Use <code>CONCATENATE</code>, <code>JOIN</code>, <code>TEXTJOIN</code> or <code>&</code> for more.',
        'Open-ended ranges like <code>A2:A</code> work (from row 2 to the bottom).',
        'Sheets-only functions: QUERY, ARRAYFORMULA, SPLIT, JOIN, REGEXMATCH, REGEXEXTRACT, REGEXREPLACE, COUNTUNIQUE, IMPORTRANGE, GOOGLEFINANCE.',
        'A bad formula is still saved — the cell shows <code>#ERROR!</code> (parse error) instead of a pop-up.',
        'A formula pointing at an empty cell shows a <b>blank</b>, not 0.'
      ],
      keys: [['Enter', 'Confirm and move down'], ['Ctrl+Shift+Enter', 'Wrap the formula in ARRAYFORMULA( )'], ['Tab', 'Confirm and move right'],
        ['F2', 'Edit the cell'], ['Esc', 'Cancel editing'], ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'], ['Ctrl+D', 'Fill down'], ['F4', 'Toggle $ absolute reference']]
    },
    csv: {
      id: 'csv', name: 'CSV / TSV', kind: 'text', color: '#b45309', icon: 'CSV',
      tagline: 'Plain-text data files',
      blurb: 'The universal format every app can open. It is just text: values separated by commas (CSV) or tabs (TSV). No formulas, no formatting, no second sheet.',
      differences: [
        'A CSV/TSV file stores <b>values only</b>. Saving as CSV turns every formula into its current result.',
        'No formatting (bold, colors, $ signs as formats), and only <b>one sheet</b> per file.',
        'A value that contains a comma must be wrapped in "double quotes": <code>"Gel Pens, 4-pack"</code>.',
        'A double quote inside a quoted value is written twice: <code>"12"" Ruler"</code>.',
        'TSV uses the TAB character, so commas inside values are no problem.',
        'Spreadsheets "helpfully" convert values when they open a CSV: <code>05401</code> → <code>5401</code>, long numbers → <code>4.41712E+15</code>.'
      ],
      keys: [['Tab key', 'In this editor, inserts a real TAB character'], ['Ctrl+F', 'Find & replace (use \\t for tab)'], ['Ctrl+S', 'Save the file']]
    },
    sql: {
      id: 'sql', name: 'SQL Database', kind: 'db', color: '#7c3aed', icon: 'SQL',
      tagline: 'Ask the database questions',
      blurb: 'Real businesses keep their data in databases and ask questions with SQL. Every spreadsheet trick has a SQL twin: SUMIF → GROUP BY, VLOOKUP → JOIN, FILTER → WHERE.',
      differences: [
        'Text goes in <b>\'single quotes\'</b>. "Double quotes" mean a column name.',
        'Text comparisons are <b>case-sensitive</b>: <code>\'snacks\'</code> does not equal <code>\'Snacks\'</code>. LIKE is not case-sensitive.',
        'Dividing two whole numbers drops the decimals: <code>7 / 2</code> = 3. Use <code>7 / 2.0</code> or <code>AVG()</code>.',
        'Columns are referred to by name, not letter: <code>price</code>, not <code>D</code>.',
        'Joining tables (JOIN) replaces VLOOKUP. Grouping (GROUP BY) replaces SUMIF/COUNTIF.',
        'UPDATE and DELETE without WHERE change <b>every row</b>. There is no undo in a real database!'
      ],
      keys: [['Ctrl+Enter', 'Run the query'], ['Ctrl+/', 'Comment out a line'], ['Tab', 'Indent']]
    }
  };
  var ORDER = ['xl365', 'xl2013', 'gs', 'csv', 'sql'];
  var SHEET_PLATS = ['xl365', 'xl2013', 'gs'];

  // ---------- Translator ----------
  function N(name) { return function () { return { t: 'fn', name: name, args: Array.prototype.slice.call(arguments) }; }; }
  function num(v) { return { t: 'num', v: v }; }
  function str(v) { return { t: 'str', v: v }; }
  function bool(v) { return { t: 'bool', v: v }; }
  function paren(e) { return e.t === 'fn' || e.t === 'ref' || e.t === 'num' || e.t === 'str' || e.t === 'paren' || e.t === 'name' ? e : { t: 'paren', e: e }; }
  function isMissing(a) { return !a || a.t === 'missing'; }
  function clone(n) { return JSON.parse(JSON.stringify(n)); }

  // Turn a criteria argument ("Snacks", ">5", A1) into a test against a range: (range="Snacks")
  function critTest(rangeNode, critNode, notes) {
    if (critNode.t === 'str') {
      var m = /^(<=|>=|<>|=|<|>)?([\s\S]*)$/.exec(critNode.v), op = m[1] || '=', val = m[2];
      if (/[*?]/.test(val)) notes.push('Wildcards like * only work in COUNTIF/SUMIF-style functions. After rewriting, "' + critNode.v + '" is compared exactly.');
      var p = E.parseNumberText(val);
      return { t: 'paren', e: { t: 'bin', op: op, l: rangeNode, r: p ? num(p.v) : str(val) } };
    }
    return { t: 'paren', e: { t: 'bin', op: '=', l: rangeNode, r: critNode } };
  }
  function product(list) { return list.reduce(function (a, b) { return a ? { t: 'bin', op: '*', l: a, r: b } : b; }, null); }
  function refCells(node, maxCells) { // expand a small range ref into single-cell refs
    if (node.t !== 'ref' || node.ref.kind !== 'range') return null;
    var a = node.ref.a, b = node.ref.b, out = [];
    var cells = (Math.abs(b.row - a.row) + 1) * (Math.abs(b.col - a.col) + 1);
    if (cells > maxCells) return null;
    for (var r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++) for (var c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) {
      var ref = { sheet: node.ref.sheet, kind: 'cell', a: { col: c, row: r }, b: null };
      out.push({ t: 'ref', ref: ref, raw: F.refText(ref) });
    }
    return out;
  }

  // Rewrite an AST so it works on `target`. Returns {ast, notes[], changed, impossible}
  function translate(ast, from, target) {
    var notes = [], impossible = [], changed = false, needCSE = false;
    var targetPlat = SX.Workbook.PLAT[target];
    function avail(name) { return E.available(name, targetPlat); }

    function letInline(node, env) {
      if (node.t === 'name' && env[node.name]) return paren(clone(env[node.name]));
      var n = Object.assign({}, node);
      if (n.args) n.args = n.args.map(function (a) { return letInline(a, env); });
      ['e', 'l', 'r'].forEach(function (k) { if (n[k]) n[k] = letInline(n[k], env); });
      return n;
    }

    function rw(n) {
      if (n.t === 'ref') {
        if (n.ref.kind === 'open' && targetPlat.style === 'excel') {
          var ref = clone(n.ref); ref.kind = 'range'; ref.b.row = 999; changed = true;
          notes.push('Excel has no open-ended ranges like ' + n.raw + '. Changed it to ' + F.refText(ref) + '.');
          return { t: 'ref', ref: ref, raw: F.refText(ref) };
        }
        if (n.spill && target !== 'xl365') {
          changed = true; notes.push(n.raw + '# (the spill operator) only exists in Excel 365. Use the full range of the spilled result instead (for example ' + n.raw + ':' + F.idxToCol(n.ref.a.col) + (n.ref.a.row + 20) + ').');
          return { t: 'ref', ref: n.ref, raw: n.raw };
        }
        return n;
      }
      if (n.t === 'at') { if (target !== 'xl365') { changed = true; notes.push('The @ (implicit intersection) operator only exists in Excel 365. Removed it.'); return rw(n.e); } return { t: 'at', e: rw(n.e) }; }
      if (n.t === 'paren') return { t: 'paren', e: rw(n.e) };
      if (n.t === 'un' || n.t === 'pct') return Object.assign({}, n, { e: rw(n.e) });
      if (n.t === 'bin') return Object.assign({}, n, { l: rw(n.l), r: rw(n.r) });
      if (n.t !== 'fn') return n;

      var name = n.name, a = n.args.map(rw);
      var fromSheets = from === 'gs', toSheets = target === 'gs';

      // --- Same-name functions whose arguments differ between Excel and Sheets ---
      if (name === 'FILTER' && avail('FILTER')) {
        if (!fromSheets && toSheets && a.length === 3 && !isMissing(a[2])) {
          changed = true; notes.push('Google Sheets FILTER has no if_empty argument. Wrapped it in IFERROR instead.');
          return N('IFERROR')(N('FILTER')(a[0], a[1]), a[2]);
        }
        if (fromSheets && !toSheets && a.length > 2) {
          changed = true; notes.push('Excel FILTER takes ONE include test. Combined the conditions with * (AND).');
          return N('FILTER')(a[0], product(a.slice(1).map(paren)));
        }
      }
      if (name === 'SORT' && avail('SORT')) {
        if (!fromSheets && toSheets && a.length >= 3 && a[2].t !== 'missing') {
          var o = a[2];
          var asc = o.t === 'num' ? o.v === 1 : o.t === 'un' && o.op === '-' ? false : null;
          if (asc !== null) { changed = true; notes.push('Google Sheets SORT uses TRUE/FALSE for the direction, not 1/-1.'); return N('SORT')(a[0], a[1], bool(asc)); }
        }
        if (fromSheets && !toSheets && a.length >= 3) {
          var b = a[2];
          var dir = b.t === 'bool' ? (b.v ? 1 : -1) : null;
          if (a.length > 3) notes.push('Excel SORT sorts by one column. For several sort columns, use SORTBY in Excel 365.');
          if (dir !== null) { changed = true; notes.push('Excel SORT uses 1 (ascending) or -1 (descending) instead of TRUE/FALSE.'); return N('SORT')(a[0], a[1], num(dir)); }
        }
      }
      if (name === 'CONCAT' && toSheets && a.length > 2) {
        changed = true; notes.push('Google Sheets CONCAT only takes two values. Switched to CONCATENATE.');
        return N('CONCATENATE').apply(null, a);
      }

      if (avail(name)) return { t: 'fn', name: name, args: a };

      // --- Function does not exist on the target ---
      changed = true;
      switch (name) {
        case 'XLOOKUP': {
          var mm = isMissing(a[4]) ? 0 : a[4].t === 'num' ? a[4].v : null;
          var sm = isMissing(a[5]) ? 1 : a[5].t === 'num' ? a[5].v : null;
          if ((mm === 0 || mm === 2) && sm === 1) {
            var core = N('INDEX')(a[2], N('MATCH')(a[0], a[1], num(0)));
            notes.push('XLOOKUP → INDEX/MATCH: MATCH finds the position, INDEX returns the value at that position.');
            if (!isMissing(a[3])) { notes.push('The "if not found" value moved into IFERROR.'); return N('IFERROR')(core, a[3]); }
            return core;
          }
          impossible.push('This XLOOKUP uses a match/search mode that has no simple INDEX/MATCH version.');
          return { t: 'fn', name: name, args: a };
        }
        case 'XMATCH':
          notes.push('XMATCH → MATCH(..., 0) for an exact match.');
          return N('MATCH')(a[0], a[1], num(0));
        case 'IFS': {
          var out = null;
          for (var i = a.length - 2; i >= 0; i -= 2) {
            var cond = a[i], val = a[i + 1];
            if (out === null && cond.t === 'bool' && cond.v) { out = val; continue; }
            out = N('IF')(cond, val, out === null ? N('NA')() : out);
          }
          notes.push('IFS → nested IF functions. Each extra test goes inside the "value if false" of the IF before it.');
          return out;
        }
        case 'SWITCH': {
          var x = a[0], hasDef = (a.length - 1) % 2 === 1, outS = hasDef ? a[a.length - 1] : N('NA')();
          for (var k = (hasDef ? a.length - 3 : a.length - 2); k >= 1; k -= 2) outS = N('IF')({ t: 'bin', op: '=', l: x, r: a[k] }, a[k + 1], outS);
          notes.push('SWITCH → nested IF functions comparing the value to each case.');
          return outS;
        }
        case 'MAXIFS': case 'MINIFS': {
          var tests = [];
          for (var j = 1; j + 1 < a.length; j += 2) tests.push(critTest(a[j], a[j + 1], notes));
          needCSE = true;
          notes.push(name + ' → ' + name.slice(0, 3) + '(IF(...)) array formula. In Excel 2013 you MUST confirm it with Ctrl+Shift+Enter.');
          return N(name.slice(0, 3))(N('IF')(tests.length === 1 ? tests[0] : product(tests), a[0]));
        }
        case 'TEXTJOIN': case 'JOIN': case 'CONCAT': {
          var delim = name === 'CONCAT' ? null : a[0];
          var items = name === 'TEXTJOIN' ? a.slice(2) : name === 'JOIN' ? a.slice(1) : a;
          if (name === 'JOIN' && avail('TEXTJOIN')) { notes.push('JOIN → TEXTJOIN(delimiter, FALSE, ...).'); return N('TEXTJOIN').apply(null, [a[0], bool(false)].concat(items)); }
          var parts = [];
          for (var q = 0; q < items.length; q++) {
            var cells = items[q].t === 'ref' && items[q].ref.kind === 'range' ? refCells(items[q], 12) : [items[q]];
            if (!cells) { impossible.push(name + ' over a big range has no Excel 2013 equivalent. Join the cells one by one with &, or use Data ▸ Text to Columns in reverse.'); return { t: 'fn', name: name, args: a }; }
            parts = parts.concat(cells);
          }
          var withD = [];
          parts.forEach(function (p, i2) { if (i2 && delim) withD.push(delim); withD.push(p); });
          if (name === 'TEXTJOIN') notes.push('TEXTJOIN → CONCATENATE with the separator between every value. (Blank cells are no longer skipped.)');
          else notes.push(name + ' → CONCATENATE, listing each cell separately (CONCATENATE cannot take a whole range in Excel 2013).');
          return N('CONCATENATE').apply(null, withD);
        }
        case 'LET': {
          var env = {};
          for (var l = 0; l + 1 < n.args.length; l += 2) if (n.args[l].t === 'name') env[n.args[l].name] = letInline(n.args[l + 1], env);
          notes.push('LET → each name replaced by the value it stood for (longer, but it works).');
          return rw(letInline(n.args[n.args.length - 1], env));
        }
        case 'ARRAYFORMULA':
          if (target === 'xl2013') { needCSE = true; notes.push('ARRAYFORMULA → confirm with Ctrl+Shift+Enter in Excel 2013 (and it will not spill).'); }
          else notes.push('ARRAYFORMULA is not needed in Excel 365 — formulas work on whole ranges automatically.');
          return a[0];
        case 'COUNTUNIQUE':
          if (avail('UNIQUE')) { notes.push('COUNTUNIQUE → COUNTA(UNIQUE(...)).'); return N('COUNTA')(N('UNIQUE')(a[0])); }
          notes.push('COUNTUNIQUE → the classic trick SUMPRODUCT(1/COUNTIF(range, range)). (Breaks if the range has blank cells.)');
          return N('SUMPRODUCT')({ t: 'bin', op: '/', l: num(1), r: N('COUNTIF')(a[0], a[0]) });
        case 'FILTER':
          impossible.push('Excel 2013 has no FILTER. Use Data ▸ Filter (AutoFilter), or an advanced INDEX/SMALL/IF array formula.');
          break;
        case 'SORT':
          impossible.push('Excel 2013 has no SORT function. Use Data ▸ Sort, or LARGE/SMALL to pull values out in order.');
          break;
        case 'UNIQUE':
          impossible.push('Excel 2013 has no UNIQUE function. Use Data ▸ Remove Duplicates, or a PivotTable.');
          break;
        case 'SEQUENCE':
          impossible.push('Excel 2013 has no SEQUENCE. Type 1 and 2, select both, and drag the fill handle down.');
          break;
        case 'QUERY':
          impossible.push('QUERY is Google Sheets only. In Excel use a PivotTable or FILTER/SORT — or run the same idea as real SQL in SQL mode!');
          break;
        case 'SPLIT':
          impossible.push('SPLIT is Google Sheets only. In Excel use Data ▸ Text to Columns' + (target === 'xl365' ? ' (newer Excel 365 also has TEXTSPLIT).' : '.'));
          break;
        case 'REGEXMATCH': case 'REGEXEXTRACT': case 'REGEXREPLACE':
          impossible.push(name + ' is Google Sheets only. Try SEARCH, FIND, MID or SUBSTITUTE instead.');
          break;
        case 'IMPORTRANGE': case 'GOOGLEFINANCE':
          impossible.push(name + ' is Google Sheets only and needs the internet.');
          break;
        default:
          impossible.push(name + ' is not available in ' + PLATFORMS[target].name + '.');
      }
      return { t: 'fn', name: name, args: a };
    }
    var out = rw(ast);
    return { ast: out, text: '=' + F.print(out), notes: notes, impossible: impossible, changed: changed, cse: needCSE };
  }

  // Evaluate the formula from a cell on every spreadsheet platform using the SAME data.
  function compare(wb, sheet, r, c) {
    var cell = wb.getCell(sheet, r, c);
    if (!cell || !cell.isFormula) return null;
    var text = cell.input, data = wb.serialize();
    var from = wb.platId;
    var baseAst = cell.ast;
    var results = SHEET_PLATS.map(function (pid) {
      var res = { plat: pid, name: PLATFORMS[pid].name };
      var w = new SX.Workbook(pid); w.load(data);
      var prep = w.prepare(text, { cse: cell.cse });
      if (prep.dialog) { res.refused = prep.dialog + ' ' + (prep.detail || ''); res.status = 'bad'; }
      else {
        w.applyEdits([{ sheet: sheet, r: r, c: c, cell: prep.cell }]);
        res.display = w.display(sheet, r, c);
        var sp = w.spills[w.sheetName(sheet) + '|' + r + ',' + c];
        res.spill = sp ? sp.mat : null;
        res.value = w.value(sheet, r, c);
      }
      // Suggestions
      if (baseAst && pid !== from) {
        var tr = translate(baseAst, from, pid);
        if (tr.changed || tr.impossible.length) res.translation = tr;
      }
      // Array-mode suggestion: would Ctrl+Shift+Enter / ARRAYFORMULA change the answer?
      if (!res.refused && pid !== 'xl365' && !cell.cse && !/^=ARRAYFORMULA\(/i.test(text)) {
        var w2 = new SX.Workbook(pid); w2.load(data);
        var p2 = pid === 'gs' ? w2.prepare('=ARRAYFORMULA(' + text.slice(1) + ')') : w2.prepare(text, { cse: true });
        if (p2.cell) {
          w2.applyEdits([{ sheet: sheet, r: r, c: c, cell: p2.cell }]);
          var d2 = w2.display(sheet, r, c);
          if (d2.text !== res.display.text) res.arrayVersion = { text: pid === 'gs' ? p2.cell.input : '{' + p2.cell.input + '}', display: d2, how: pid === 'gs' ? 'Wrap it in ARRAYFORMULA( ) (or press Ctrl+Shift+Enter)' : 'Confirm it with Ctrl+Shift+Enter' };
        }
      }
      return res;
    });
    // Mark agreement against the current platform
    var mine = results.filter(function (x) { return x.plat === from; })[0];
    results.forEach(function (x) {
      if (x.refused) return;
      var same = mine && !mine.refused && x.display.text === mine.display.text && JSON.stringify(x.spill && x.spill.rows) === JSON.stringify(mine.spill && mine.spill.rows);
      x.status = x.display.err ? 'bad' : same ? 'good' : 'warn';
    });
    return { text: text, from: from, results: results };
  }

  // Functions grouped for cheat sheets / comparison matrix
  function functionMatrix() {
    var names = Object.keys(E.FN).filter(function (n) { return n !== 'TRUE' && n !== 'FALSE'; }).sort();
    return names.map(function (n) {
      var row = { name: n, cat: E.FN[n].cat || 'Other', on: {} };
      SHEET_PLATS.forEach(function (p) { row.on[p] = E.available(n, SX.Workbook.PLAT[p]); });
      row.sigs = {};
      SHEET_PLATS.forEach(function (p) { var i = E.fnInfo(n, SX.Workbook.PLAT[p]); row.sigs[p] = i.sig; });
      row.differs = row.sigs.xl365 !== row.sigs.gs && row.on.xl365 && row.on.gs;
      return row;
    });
  }

  var SQL_TWINS = [
    ['SUM(F2:F25)', 'SELECT SUM(in_stock) FROM products;'],
    ['COUNTIF(C2:C25, "Snacks")', "SELECT COUNT(*) FROM products WHERE category = 'Snacks';"],
    ['SUMIF(Sales!C:C, "S01", Sales!E:E)', "SELECT SUM(qty) FROM sales WHERE store_id = 'S01';"],
    ['A pivot / SUMIF per store', 'SELECT store_id, SUM(qty) FROM sales GROUP BY store_id;'],
    ['FILTER(B2:D25, D2:D25 > 10)', 'SELECT product, category, price FROM products WHERE price > 10;'],
    ['SORT(B2:D25, 3, -1)', 'SELECT product, category, price FROM products ORDER BY price DESC;'],
    ['UNIQUE(C2:C25)', 'SELECT DISTINCT category FROM products;'],
    ['VLOOKUP / XLOOKUP', 'SELECT s.order_id, p.product FROM sales s JOIN products p ON s.sku = p.sku;'],
    ['IF(F2 < G2, "Reorder", "OK")', "SELECT product, CASE WHEN in_stock < reorder_at THEN 'Reorder' ELSE 'OK' END FROM products;"],
    ['B2 & " - " & C2', "SELECT product || ' - ' || category FROM products;"],
    ['LEFT(A2, 3)', 'SELECT SUBSTR(sku, 1, 3) FROM products;']
  ];

  SX.platforms = { PLATFORMS: PLATFORMS, ORDER: ORDER, SHEET_PLATS: SHEET_PLATS, translate: translate, compare: compare,
    functionMatrix: functionMatrix, SQL_TWINS: SQL_TWINS };
})(globalThis.SX = globalThis.SX || {});
