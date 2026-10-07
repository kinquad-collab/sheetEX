/* SheetEX — the menu tools: Sort, Filter, Remove duplicates, Text to columns, Trim, Find & replace, Paste values,
 * Data validation, Conditional formatting, Pivot tables and Charts. Plain functions on a Workbook, shared by the
 * spreadsheet UI, the challenge checks and the tests. Deliberately minimal: the options students meet first, with the
 * behaviors that differ between Excel and Google Sheets. Settings live in sheet.meta and are saved with the workbook. */
(function (SX) {
  'use strict';
  var F = SX.f, E = SX.engine;

  function meta(wb, sheet) { var s = wb.sheet(sheet); s.meta = s.meta || {}; return s.meta; }
  function filled(wb, s, r, c) { var cell = wb.getCell(s, r, c); return !!cell && cell.input !== ''; }
  function v(wb, s, r, c) { return wb.value(s, r, c); }
  function snap(cell) { return cell ? { input: cell.input, fmt: cell.fmt, cse: cell.cse } : null; }
  function isExcel(wb) { return wb.plat.style === 'excel'; }
  function text(x) { return x === null || x === undefined ? '' : F.isErr(x) ? x.code : String(x); }

  // ---------- ranges ----------
  // The block of filled cells around (r, c) — what Excel calls the "current region".
  function currentRegion(wb, s, r, c) {
    var R = { r1: r, c1: c, r2: r, c2: c }, grew = true, maxR = SX.Workbook.ROWS - 1, maxC = SX.Workbook.COLS - 1;
    function any(r1, c1, r2, c2) { for (var i = r1; i <= r2; i++) for (var j = c1; j <= c2; j++) if (filled(wb, s, i, j)) return true; return false; }
    while (grew) {
      grew = false;
      var a = Math.max(0, R.r1 - 1), b = Math.min(maxR, R.r2 + 1), l = Math.max(0, R.c1 - 1), rt = Math.min(maxC, R.c2 + 1);
      if (R.r1 > 0 && any(a, l, a, rt)) { R.r1--; grew = true; }
      if (R.r2 < maxR && any(b, l, b, rt)) { R.r2++; grew = true; }
      if (R.c1 > 0 && any(a, l, b, l)) { R.c1--; grew = true; }
      if (R.c2 < maxC && any(a, rt, b, rt)) { R.c2++; grew = true; }
    }
    return R;
  }
  function headerText(wb, s, R, c) { var t = text(v(wb, s, R.r1, c)); return t || 'Column ' + F.idxToCol(c); }
  function moveEdits(wb, s, R, order) {
    // order[i] = old row index that should end up at row R.r1 + i (rows inside R only)
    var edits = [];
    order.forEach(function (oldR, i) {
      var newR = R.r1 + i;
      for (var c = R.c1; c <= R.c2; c++) {
        var cell = snap(wb.getCell(s, oldR, c));
        if (cell && cell.input[0] === '=' && newR !== oldR) cell.input = '=' + F.shiftFormula(cell.input.slice(1), newR - oldR, 0);
        if (cell) cell.keepFmt = false;
        edits.push({ sheet: s, r: newR, c: c, cell: cell });
      }
    });
    return edits;
  }

  // ---------- sort ----------
  // Ascending: numbers, then text (A→Z, ignoring case), then TRUE/FALSE, then errors; blanks always go last.
  function sortKey(x) {
    if (x === null || x === undefined || x === '') return [4, 0];
    if (typeof x === 'number') return [0, x];
    if (typeof x === 'string') return [1, x.toLowerCase()];
    if (typeof x === 'boolean') return [2, x ? 1 : 0];
    return [3, 0];
  }
  function cmp(a, b, desc) {
    var ka = sortKey(a), kb = sortKey(b);
    if (ka[0] === 4 || kb[0] === 4) return ka[0] === kb[0] ? 0 : ka[0] === 4 ? 1 : -1;
    var d = ka[0] !== kb[0] ? ka[0] - kb[0] : ka[1] < kb[1] ? -1 : ka[1] > kb[1] ? 1 : 0;
    return desc ? -d : d;
  }
  // Excel: sorting part of a table asks first ("Expand the selection?"). Sheets "Sort range" sorts only what you selected.
  function needsExpandWarning(wb, s, R) {
    var reg = currentRegion(wb, s, R.r1, R.c1);
    return (reg.c1 < R.c1 || reg.c2 > R.c2) && R.c1 === R.c2;
  }
  function sortRange(wb, s, R, opts) {
    var body = { r1: R.r1 + (opts.header ? 1 : 0), c1: R.c1, r2: R.r2, c2: R.c2 };
    if (body.r2 < body.r1) return { edits: [], rows: 0 };
    var rows = []; for (var r = body.r1; r <= body.r2; r++) rows.push(r);
    rows.sort(function (a, b) { return cmp(v(wb, s, a, opts.col), v(wb, s, b, opts.col), opts.desc) || a - b; });
    var edits = moveEdits(wb, s, body, rows);
    wb.applyEdits(edits);
    return { edits: edits, rows: rows.length };
  }

  // ---------- remove duplicates ----------
  // Keeps the first row of each group; compares the chosen columns, ignoring upper/lower case. Spaces DO count.
  function removeDuplicates(wb, s, R, opts) {
    var body = { r1: R.r1 + (opts.header ? 1 : 0), c1: R.c1, r2: R.r2, c2: R.c2 }, cols = opts.cols, seen = {}, keep = [], removed = 0;
    for (var r = body.r1; r <= body.r2; r++) {
      var k = cols.map(function (c) { return text(v(wb, s, r, c)).toLowerCase(); }).join('\u0001');
      if (seen[k]) { removed++; continue; }
      seen[k] = true; keep.push(r);
    }
    if (!removed) return { removed: 0, remaining: keep.length };
    var edits = moveEdits(wb, s, body, keep);
    for (r = body.r1 + keep.length; r <= body.r2; r++) for (var c = body.c1; c <= body.c2; c++) edits.push({ sheet: s, r: r, c: c, cell: null });
    wb.applyEdits(edits);
    return { removed: removed, remaining: keep.length };
  }

  // ---------- text to columns / split ----------
  var DELIMS = { comma: ',', space: ' ', semicolon: ';', tab: '\t', pipe: '|', dash: '-' };
  function planSplit(wb, s, R, opts) {
    if (R.c1 !== R.c2) return { error: isExcel(wb) ? 'Text to Columns can convert only one column at a time. The range can be many rows tall but no more than one column wide.' : 'Please select a single column to split.' };
    var d = DELIMS[opts.delim] || opts.delim || ',', edits = [], overwrite = 0, widest = 1;
    for (var r = R.r1; r <= R.r2; r++) {
      var cell = wb.getCell(s, r, R.c1);
      if (!cell || cell.input === '' || cell.input[0] === '=') continue;
      var parts = String(v(wb, s, r, R.c1)).split(d);
      widest = Math.max(widest, parts.length);
      parts.forEach(function (p, i) {
        var c = R.c1 + i;
        if (c >= SX.Workbook.COLS) return;
        if (i > 0 && filled(wb, s, r, c)) overwrite++;
        edits.push({ sheet: s, r: r, c: c, cell: p === '' ? null : wb.prepare(p).cell });
      });
    }
    return { edits: edits, overwrite: overwrite, columns: widest };
  }
  function applyEdits(wb, plan) { if (plan.edits && plan.edits.length) wb.applyEdits(plan.edits); return plan; }

  // ---------- trim whitespace (Google Sheets: Data ▸ Data cleanup ▸ Trim whitespace) ----------
  function trimRange(wb, s, R) {
    var edits = [];
    for (var r = R.r1; r <= R.r2; r++) for (var c = R.c1; c <= R.c2; c++) {
      var cell = wb.getCell(s, r, c);
      if (!cell || cell.input[0] === '=' || typeof cell.val !== 'string') continue;
      var t = cell.val.replace(/^\s+|\s+$/g, '').replace(/ {2,}/g, ' ');
      if (t !== cell.val) { var lit = literal(t); if (lit) lit.fmt = cell.fmt; edits.push({ sheet: s, r: r, c: c, cell: lit }); }
    }
    if (edits.length) wb.applyEdits(edits);
    return { changed: edits.length };
  }

  // ---------- find & replace ----------
  function esc(t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function findReplace(wb, s, R, opts) {
    if (!opts.find) return { count: 0, cells: 0 };
    R = R || { r1: 0, c1: 0, r2: wb.maxRow(s), c2: wb.maxCol(s) };
    var edits = [], count = 0, re = new RegExp(esc(opts.find), opts.matchCase ? 'g' : 'gi');
    for (var r = R.r1; r <= R.r2; r++) for (var c = R.c1; c <= R.c2; c++) {
      var cell = wb.getCell(s, r, c);
      if (!cell || cell.input === '') continue;
      if (cell.input[0] === '=' && !opts.formulas) continue;
      var isText = cell.input[0] !== '=' && typeof cell.val === 'string';
      var inp = isText ? cell.val : cell.input, out;
      if (opts.whole) {
        if (!(opts.matchCase ? inp === opts.find : inp.toLowerCase() === opts.find.toLowerCase())) continue;
        out = opts.replace; count++;
      } else {
        var m = inp.match(re); if (!m) continue;
        count += m.length; out = inp.replace(re, function () { return opts.replace; });
      }
      var nc = out === '' ? null : isText && /^\s|\s$/.test(out) ? { input: "'" + out } : wb.prepare(out).cell || null;
      edits.push({ sheet: s, r: r, c: c, cell: nc });
    }
    if (edits.length) wb.applyEdits(edits);
    return { count: count, cells: edits.length };
  }

  // ---------- paste values only ----------
  function literal(x, fmt) {
    if (x === null || x === undefined || x === '') return null;
    if (F.isErr(x)) return { input: x.code };
    if (typeof x === 'boolean') return { input: x ? 'TRUE' : 'FALSE' };
    if (typeof x === 'number') return { input: String(x), fmt: fmt || undefined };
    var t = String(x);
    return { input: E.parseNumberText(t) || /^(TRUE|FALSE)$/i.test(t) ? "'" + t : t };
  }
  function pasteValues(wb, src, dstSheet, r0, c0) {
    var edits = [];
    for (var r = src.r1; r <= src.r2; r++) for (var c = src.c1; c <= src.c2; c++) {
      var d = wb.display(src.sheet, r, c);
      edits.push({ sheet: dstSheet, r: r0 + r - src.r1, c: c0 + c - src.c1, cell: literal(v(wb, src.sheet, r, c), d.fmt) });
    }
    wb.applyEdits(edits);
    return { cells: edits.length };
  }

  // ---------- filter ----------
  function setFilter(wb, s, R) { meta(wb, s).filter = { r1: R.r1, c1: R.c1, r2: R.r2, c2: R.c2, crit: {}, hidden: {} }; wb.recalc(); return meta(wb, s).filter; }
  function clearFilter(wb, s) { delete meta(wb, s).filter; wb.recalc(); }
  function filterValues(wb, s, col) {
    var f = meta(wb, s).filter, out = [];
    for (var r = f.r1 + 1; r <= f.r2; r++) { var t = wb.display(s, r, col).text; if (out.indexOf(t) < 0) out.push(t); }
    return out.sort(function (a, b) { return cmp(a === '' ? null : isNaN(+a) ? a : +a, b === '' ? null : isNaN(+b) ? b : +b); });
  }
  function setCriteria(wb, s, col, allowed) {
    var f = meta(wb, s).filter;
    if (allowed) f.crit[col] = allowed.slice(); else delete f.crit[col];
    f.hidden = {};
    for (var r = f.r1 + 1; r <= f.r2; r++) {
      for (var c in f.crit) if (f.crit[c].indexOf(wb.display(s, r, +c).text) < 0) { f.hidden[r] = 1; break; }
    }
    wb.recalc();
    return f;
  }
  function visibleCount(wb, s) { var f = meta(wb, s).filter; return f ? (f.r2 - f.r1) - Object.keys(f.hidden).length : 0; }

  // ---------- data validation ----------
  function addValidation(wb, s, R, rule) {
    var m = meta(wb, s); m.dv = (m.dv || []).filter(function (x) { return !(x.r1 === R.r1 && x.c1 === R.c1 && x.r2 === R.r2 && x.c2 === R.c2); });
    var o = { r1: R.r1, c1: R.c1, r2: R.r2, c2: R.c2, type: rule.type, items: rule.items || null, min: rule.min, max: rule.max, reject: !!rule.reject };
    m.dv.push(o); return o;
  }
  function ruleAt(wb, s, r, c) {
    var dv = (wb.sheet(s).meta || {}).dv || [];
    for (var i = dv.length - 1; i >= 0; i--) { var x = dv[i]; if (r >= x.r1 && r <= x.r2 && c >= x.c1 && c <= x.c2) return x; }
    return null;
  }
  function describe(rule) {
    if (rule.type === 'list') return 'an item from the list: ' + rule.items.join(', ');
    var what = rule.type === 'whole' ? 'a whole number' : 'a number';
    if (rule.min != null && rule.max != null) return what + ' between ' + rule.min + ' and ' + rule.max;
    if (rule.min != null) return what + ' greater than or equal to ' + rule.min;
    return what + ' less than or equal to ' + rule.max;
  }
  function checkValue(rule, x) {
    if (x === null || x === '' || x === undefined) return true; // blanks are allowed (the default "ignore blank")
    if (rule.type === 'list') return rule.items.some(function (i) { return String(i).toLowerCase() === String(x).toLowerCase(); });
    if (typeof x !== 'number') return false;
    if (rule.type === 'whole' && Math.floor(x) !== x) return false;
    if (rule.min != null && x < rule.min) return false;
    if (rule.max != null && x > rule.max) return false;
    return true;
  }
  function invalidCells(wb, s) {
    var dv = (wb.sheet(s).meta || {}).dv || [], out = [];
    dv.forEach(function (x) {
      for (var r = x.r1; r <= x.r2; r++) for (var c = x.c1; c <= x.c2; c++) if (ruleAt(wb, s, r, c) === x && !checkValue(x, v(wb, s, r, c))) out.push([r, c]);
    });
    return out;
  }

  // ---------- conditional formatting ----------
  var COLORS = { red: '#ffc7ce', yellow: '#ffeb9c', green: '#c6efce', blue: '#cfe2ff' };
  function addRule(wb, s, R, rule) {
    var m = meta(wb, s); m.cf = m.cf || [];
    var o = { r1: R.r1, c1: R.c1, r2: R.r2, c2: R.c2, type: rule.type, a: rule.a, b: rule.b, text: rule.text, formula: rule.formula, color: rule.color || 'red' };
    m.cf.push(o); return o;
  }
  function clearRules(wb, s, R) {
    var m = meta(wb, s); if (!m.cf) return 0;
    var before = m.cf.length;
    m.cf = R ? m.cf.filter(function (x) { return x.r2 < R.r1 || x.r1 > R.r2 || x.c2 < R.c1 || x.c1 > R.c2; }) : [];
    return before - m.cf.length;
  }
  function ruleMatches(wb, s, rule, r, c, cache) {
    var x = v(wb, s, r, c);
    switch (rule.type) {
      case 'gt': return typeof x === 'number' && x > rule.a;
      case 'lt': return typeof x === 'number' && x < rule.a;
      case 'between': return typeof x === 'number' && x >= Math.min(rule.a, rule.b) && x <= Math.max(rule.a, rule.b);
      case 'eq': return typeof x === 'number' ? x === +rule.a : text(x).toLowerCase() === String(rule.a).toLowerCase();
      case 'text': return text(x).toLowerCase().indexOf(String(rule.text).toLowerCase()) >= 0;
      case 'blank': return x === null || x === '';
      case 'dup': {
        if (x === null || x === '') return false;
        if (!cache.counts) { cache.counts = {}; for (var i = rule.r1; i <= rule.r2; i++) for (var j = rule.c1; j <= rule.c2; j++) { var t = text(v(wb, s, i, j)).toLowerCase(); if (t) cache.counts[t] = (cache.counts[t] || 0) + 1; } }
        return cache.counts[text(x).toLowerCase()] > 1;
      }
      case 'formula': {
        var src = String(rule.formula || '').replace(/^=/, '');
        try {
          var ast = F.parse(F.shiftFormula(src, r - rule.r1, c - rule.c1), wb.plat.parse);
          var res = E.evaluate(ast, wb, s, r, c, wb.plat, {});
          if (res && res.rows) res = res.rows[0][0];
          if (res instanceof F.Rng) res = wb.getValue(res.sheet, res.r1, res.c1);
          return res === true || (typeof res === 'number' && res !== 0);
        } catch (e) { return false; }
      }
    }
    return false;
  }
  // -> map "r,c" -> background color, for one sheet. First matching rule wins.
  function cfColors(wb, s) {
    var cf = (wb.sheet(s).meta || {}).cf || [], out = {};
    cf.forEach(function (rule) {
      var cache = {};
      if (rule.type === 'scale') {
        var nums = []; for (var i = rule.r1; i <= rule.r2; i++) for (var j = rule.c1; j <= rule.c2; j++) { var x = v(wb, s, i, j); if (typeof x === 'number') nums.push(x); }
        if (!nums.length) return;
        var lo = Math.min.apply(null, nums), hi = Math.max.apply(null, nums);
        for (i = rule.r1; i <= rule.r2; i++) for (j = rule.c1; j <= rule.c2; j++) {
          var y = v(wb, s, i, j); if (typeof y !== 'number' || out[i + ',' + j]) continue;
          var t = hi === lo ? 1 : (y - lo) / (hi - lo);
          out[i + ',' + j] = 'rgb(' + Math.round(255 - t * (255 - 99)) + ',' + Math.round(255 - t * (255 - 190)) + ',' + Math.round(255 - t * (255 - 123)) + ')';
        }
        return;
      }
      for (var r = rule.r1; r <= rule.r2; r++) for (var c = rule.c1; c <= rule.c2; c++) {
        if (out[r + ',' + c]) continue;
        if (ruleMatches(wb, s, rule, r, c, cache)) out[r + ',' + c] = COLORS[rule.color] || COLORS.red;
      }
    });
    return out;
  }

  // ---------- pivot tables ----------
  var AGG = ['SUM', 'COUNT', 'AVERAGE', 'MAX', 'MIN'];
  function aggLabel(wb, agg, name) {
    if (isExcel(wb)) return { SUM: 'Sum', COUNT: 'Count', AVERAGE: 'Average', MAX: 'Max', MIN: 'Min' }[agg] + ' of ' + name;
    return (agg === 'COUNT' ? 'COUNTA' : agg) + ' of ' + name;
  }
  function aggregate(list, agg) {
    if (agg === 'COUNT') return list.filter(function (x) { return x !== null && x !== ''; }).length;
    var n = list.filter(function (x) { return typeof x === 'number'; });
    if (agg === 'SUM') return n.reduce(function (a, b) { return a + b; }, 0);
    if (!n.length) return null;
    if (agg === 'AVERAGE') return n.reduce(function (a, b) { return a + b; }, 0) / n.length;
    return agg === 'MAX' ? Math.max.apply(null, n) : Math.min.apply(null, n);
  }
  function keyOf(wb, x) { return x === null || x === '' ? (isExcel(wb) ? '(blank)' : '') : x; }
  // The numbers a pivot shows, from the CURRENT source data.
  function pivotCompute(wb, P) {
    var src = P.src, rowsK = [], colsK = [], cells = {}, rowTot = {}, colTot = {}, all = [];
    function add(list, k) { if (list.indexOf(k) < 0) list.push(k); }
    for (var r = src.r1 + 1; r <= src.r2; r++) {
      var rv = v(wb, src.sheet, r, P.rows), cv = P.cols == null ? null : v(wb, src.sheet, r, P.cols), val = v(wb, src.sheet, r, P.val);
      if (P.filter && text(v(wb, src.sheet, r, P.filter.col)) !== P.filter.value) continue;
      var rk = keyOf(wb, rv), ck = P.cols == null ? '' : keyOf(wb, cv);
      add(rowsK, rk); add(colsK, ck);
      var k = rk + '\u0001' + ck;
      (cells[k] = cells[k] || []).push(val); (rowTot[rk] = rowTot[rk] || []).push(val); (colTot[ck] = colTot[ck] || []).push(val); all.push(val);
    }
    var sorter = function (a, b) { return cmp(a, b); };
    rowsK.sort(sorter); colsK.sort(sorter);
    return {
      rows: rowsK, cols: colsK,
      cell: function (rk, ck) { var l = cells[rk + '\u0001' + ck]; return l ? aggregate(l, P.agg) : null; },
      rowTotal: function (rk) { return aggregate(rowTot[rk] || [], P.agg); },
      colTotal: function (ck) { return aggregate(colTot[ck] || [], P.agg); },
      grand: aggregate(all, P.agg)
    };
  }
  function sourceSig(wb, P) {
    var src = P.src, out = [];
    for (var r = src.r1; r <= src.r2; r++) for (var c = src.c1; c <= src.c2; c++) out.push(text(v(wb, src.sheet, r, c)));
    return out.join('\u0001');
  }
  function nextSheetName(wb) {
    var n = 1, base = isExcel(wb) ? 'Sheet' : 'Pivot Table ';
    while (wb.sheet(base + n)) n++;
    return base + n;
  }
  // Writes the pivot into its sheet. Layouts follow each app (compact layout in Excel, Sheets' default in Google Sheets).
  function pivotRender(wb, sheet) {
    var P = wb.sheet(sheet).meta.pivot, X = pivotCompute(wb, P), out = [], excel = isExcel(wb);
    var name = function (c) { return P.names[c]; };
    var label = aggLabel(wb, P.agg, name(P.val));
    var put = function (r, c, x) { out.push([r, c, x]); };
    var top = 0;
    if (P.filter) { put(0, 0, name(P.filter.col)); put(0, 1, P.filter.value); top = 2; }
    if (excel) top = Math.max(top, 2);
    if (P.cols == null) {
      put(top, 0, excel ? 'Row Labels' : name(P.rows)); put(top, 1, label);
      X.rows.forEach(function (rk, i) { put(top + 1 + i, 0, rk); put(top + 1 + i, 1, X.rowTotal(rk)); });
      put(top + 1 + X.rows.length, 0, 'Grand Total'); put(top + 1 + X.rows.length, 1, X.grand);
    } else {
      put(top, 0, label); put(top, 1, excel ? 'Column Labels' : name(P.cols));
      put(top + 1, 0, excel ? 'Row Labels' : name(P.rows));
      X.cols.forEach(function (ck, j) { put(top + 1, 1 + j, ck); });
      put(top + 1, 1 + X.cols.length, 'Grand Total');
      X.rows.forEach(function (rk, i) {
        put(top + 2 + i, 0, rk);
        X.cols.forEach(function (ck, j) { put(top + 2 + i, 1 + j, X.cell(rk, ck)); });
        put(top + 2 + i, 1 + X.cols.length, X.rowTotal(rk));
      });
      var gr = top + 2 + X.rows.length;
      put(gr, 0, 'Grand Total');
      X.cols.forEach(function (ck, j) { put(gr, 1 + j, X.colTotal(ck)); });
      put(gr, 1 + X.cols.length, X.grand);
    }
    var s = wb.sheet(sheet);
    Object.keys(s.cells).forEach(function (k) { delete s.cells[k]; });
    s._maxRow = null;
    out.forEach(function (o) { var c = literal(o[2], typeof o[2] === 'number' && P.agg === 'AVERAGE' ? 'number' : null); if (c) { c.lock = true; wb.setCell(sheet, o[0], o[1], c); } });
    P.sig = sourceSig(wb, P);
    wb.recalc();
    return X;
  }
  function addPivot(wb, srcSheet, R, opts) {
    var name = nextSheetName(wb);
    wb.addSheet(name);
    var names = {};
    for (var c = R.c1; c <= R.c2; c++) names[c] = headerText(wb, srcSheet, R, c);
    meta(wb, name).pivot = { src: { sheet: srcSheet, r1: R.r1, c1: R.c1, r2: R.r2, c2: R.c2 }, rows: opts.rows, cols: opts.cols == null ? null : opts.cols,
      val: opts.val, agg: opts.agg || 'SUM', filter: opts.filter || null, names: names };
    pivotRender(wb, name);
    meta(wb, name).pivot.sig0 = meta(wb, name).pivot.sig;
    return name;
  }
  function pivotStale(wb, sheet) { var P = (wb.sheet(sheet).meta || {}).pivot; return !!P && P.sig !== sourceSig(wb, P); }
  // Google Sheets pivots follow the data on their own; Excel pivots wait for Refresh.
  function autoRefreshPivots(wb) {
    if (isExcel(wb)) return [];
    var done = [];
    wb.sheets.forEach(function (s) { if (s.meta && s.meta.pivot && pivotStale(wb, s.name)) { pivotRender(wb, s.name); done.push(s.name); } });
    return done;
  }
  function refreshAll(wb) { var n = 0; wb.sheets.forEach(function (s) { if (s.meta && s.meta.pivot) { pivotRender(wb, s.name); n++; } }); return n; }

  // ---------- charts ----------
  var CHART_TYPES = ['column', 'bar', 'line', 'pie', 'scatter'];
  function addChart(wb, s, R, opts) {
    var m = meta(wb, s); m.charts = m.charts || [];
    var o = { id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), r1: R.r1, c1: R.c1, r2: R.r2, c2: R.c2, type: opts.type,
      title: opts.title || '', header: opts.header !== false, labels: opts.labels !== false, zero: opts.zero !== false };
    m.charts.push(o); return o;
  }
  function removeChart(wb, s, id) { var m = meta(wb, s); m.charts = (m.charts || []).filter(function (c) { return c.id !== id; }); }
  // -> { labels:[...], series:[{name, values}] } (series are columns; the first column is the labels / X values)
  function chartData(wb, s, ch) {
    var r0 = ch.r1 + (ch.header ? 1 : 0), firstSeries = ch.c1 + (ch.labels ? 1 : 0), labels = [], series = [];
    for (var r = r0; r <= ch.r2; r++) labels.push(ch.labels ? v(wb, s, r, ch.c1) : r - r0 + 1);
    for (var c = firstSeries; c <= ch.c2; c++) {
      var vals = []; for (r = r0; r <= ch.r2; r++) { var x = v(wb, s, r, c); vals.push(typeof x === 'number' ? x : null); }
      series.push({ name: ch.header ? text(v(wb, s, ch.r1, c)) || 'Series ' + (series.length + 1) : 'Series ' + (series.length + 1), values: vals });
    }
    return { labels: labels, series: series };
  }
  function chartWarnings(wb, s, ch) {
    var d = chartData(wb, s, ch), w = [];
    if (!d.series.length) w.push('No number columns to plot. Select the labels AND at least one column of numbers.');
    if (d.series.length && d.series.every(function (x) { return x.values.every(function (y) { return y === null; }); })) w.push('The selected columns have no numbers — numbers stored as text cannot be charted.');
    if (ch.type === 'pie') {
      if (d.series.length > 1) w.push('A pie chart shows only ONE series; only "' + d.series[0].name + '" is used.');
      if (d.labels.length > 6) w.push('This pie has ' + d.labels.length + ' slices. More than about 6 slices is hard to read — try a bar chart.');
      if (d.series[0] && d.series[0].values.some(function (y) { return y < 0; })) w.push('A pie chart cannot show negative numbers.');
    }
    if (ch.type === 'scatter' && d.labels.some(function (x) { return typeof x !== 'number'; })) w.push('A scatter chart needs NUMBERS in the first column (the X values).');
    if (ch.type === 'line' && d.labels.length < 3) w.push('A line chart shows change over time; it needs several points in order.');
    if (!ch.zero && (ch.type === 'column' || ch.type === 'bar')) w.push('The axis does not start at 0, so small differences look huge. Bars should start at 0.');
    return w;
  }

  SX.tools = {
    currentRegion: currentRegion, headerText: headerText, needsExpandWarning: needsExpandWarning, sortRange: sortRange,
    removeDuplicates: removeDuplicates, planSplit: planSplit, applyEdits: applyEdits, trimRange: trimRange, findReplace: findReplace, pasteValues: pasteValues,
    setFilter: setFilter, clearFilter: clearFilter, filterValues: filterValues, setCriteria: setCriteria, visibleCount: visibleCount,
    addValidation: addValidation, ruleAt: ruleAt, describe: describe, checkValue: checkValue, invalidCells: invalidCells,
    addRule: addRule, clearRules: clearRules, cfColors: cfColors, COLORS: COLORS,
    AGG: AGG, aggLabel: aggLabel, addPivot: addPivot, pivotCompute: pivotCompute, pivotRender: pivotRender, pivotStale: pivotStale,
    autoRefreshPivots: autoRefreshPivots, refreshAll: refreshAll,
    CHART_TYPES: CHART_TYPES, addChart: addChart, removeChart: removeChart, chartData: chartData, chartWarnings: chartWarnings,
    meta: meta, text: text, DELIMS: DELIMS
  };
})(globalThis.SX = globalThis.SX || {});
