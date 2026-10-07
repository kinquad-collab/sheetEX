/* SheetEX — certification-test engine: runs a student's answer and turns it into a fingerprint.
 * The question bank shipped to students holds only fingerprints of correct answers (SX.seal.answerHash), never the
 * answers. Hands-on answers are RUN: a formula is evaluated in a fresh workbook and in a "shuffled" copy (rows
 * reversed, numbers changed), so typing the answer as a constant, or pointing at the one cell that happens to hold
 * it, does not match. The build computes the fingerprints with this same file, from the teacher-only answer key. */
(function (SX) {
  'use strict';
  var F = SX.f;

  function canon(v) {
    if (v === null || v === undefined || v === '') return '';
    if (F.isErr(v)) return v.code;
    if (typeof v === 'number') return Math.abs(v) < 1e-9 ? '0' : String(+v.toPrecision(10));
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }
  function normText(s) {
    s = String(s == null ? '' : s).trim().replace(/\s+/g, ' ').replace(/[.]$/, '').toLowerCase();
    if (/^[-+]?\$?[\d,]*\.?\d+%?$/.test(s)) {
      var pct = /%$/.test(s), n = parseFloat(s.replace(/[$,%]/g, ''));
      if (isFinite(n)) return String(+(pct ? n / 100 : n).toPrecision(10));
    }
    return s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  }

  // ---------- spreadsheets ----------
  var books = {};
  // Columns whose numbers are safe to change (never IDs or codes that other tables look up).
  var BUMP = { Products: [3, 4, 5, 6], Sales: [4], RawOrders: [4], ItemCodes: [3], Targets: [1, 2, 3, 4, 5], Contacts: [4] };
  function perturbWb(wb) {
    wb.sheets.forEach(function (s) {
      if (s.name === 'Scratch' || s.name === 'Report') return;
      var max = wb.maxRow(s.name), maxC = wb.maxCol(s.name), rows = [];
      for (var r = 1; r <= max; r++) {
        var row = [];
        for (var c = 0; c <= maxC; c++) { var cell = wb.getCell(s.name, r, c); row.push(cell ? { input: cell.input, fmt: cell.fmt } : null); }
        rows.push(row);
      }
      if (s.name === 'Targets') rows = rows.map(function (row) { return row; }); // row labels matter for HLOOKUP row numbers
      else rows.reverse();
      rows.forEach(function (row, i) {
        row.forEach(function (cell, c) {
          if (cell && /^-?\d+(\.\d+)?$/.test(cell.input) && cell.fmt !== 'date' && (BUMP[s.name] || []).indexOf(c) >= 0) {
            var bump = ((i * 7 + c * 3) % 5) + 1;
            cell = { input: String(+(parseFloat(cell.input) + bump).toFixed(2)), fmt: cell.fmt };
          }
          wb.setCell(s.name, i + 1, c, cell);
        });
      });
    });
    wb.recalc();
    return wb;
  }
  function book(kind, plat, variant) {
    var k = kind + '|' + plat + '|' + variant;
    if (!books[k]) {
      var wb = kind === 'wrangle' ? SX.wrangle.makeWorkbook(plat) : SX.makeStoreWorkbook(plat);
      if (!wb.sheet('Scratch')) wb.addSheet('Scratch');
      if (variant) perturbWb(wb);
      books[k] = wb;
    }
    return books[k];
  }
  function parseAddr(a) { var m = /^([A-Z]+)(\d+)$/.exec(a); return { r: +m[2] - 1, c: F.colToIdx(m[1]) }; }
  function hasRef(ast) { var found = false; F.walk(ast, function (n) { if (n.t === 'ref' || n.t === 'range' || n.t === 'name' || n.ref) found = true; }); return found; }

  // Evaluate one formula answer in one workbook. Returns { vals:[...], show } or { error }.
  function runFormula(q, text, cse, wb) {
    text = String(text || '').trim();
    if (text[0] !== '=') return { error: 'Answer with a formula that starts with =' };
    var at = parseAddr(q.at), sheet = q.sheet || 'Scratch';
    var last = q.fill ? q.fill - 1 : at.r;
    var placed = [], out = { vals: [] };
    try {
      for (var r = at.r; r <= last; r++) {
        var src = r === at.r ? text : '=' + F.shiftFormula(text.slice(1), r - at.r, 0);
        var prep = wb.prepare(src, { cse: cse });
        if (prep.dialog) return { error: (wb.plat.style === 'excel' ? 'Excel refuses this formula: ' : '') + prep.dialog + (prep.detail ? ' ' + prep.detail : '') };
        wb.setCell(sheet, r, at.c, prep.cell); placed.push(r);
        if (r === at.r && prep.cell && !prep.cell.perr) {
          var ast; try { ast = F.parse(prep.cell.input.slice(1), wb.plat.parse); } catch (e) { ast = null; }
          if (ast && !hasRef(ast)) return { error: 'Use a formula that refers to the data — a typed-in answer does not count.' };
        }
      }
      wb.recalc();
      for (r = at.r; r <= last; r++) {
        var v = wb.getValue(sheet, r, at.c), rng = wb.spillRange(sheet, r, at.c);
        if (rng) {
          var m = [];
          for (var i = rng.r1; i <= rng.r2; i++) { var row = []; for (var j = rng.c1; j <= rng.c2; j++) row.push(canon(wb.value(sheet, i, j))); m.push(row); }
          out.vals.push(m);
          if (r === at.r) out.show = m;
        } else {
          out.vals.push(canon(v));
          if (r === at.r) { out.show = [[canon(v)]]; if (F.isErr(v)) out.errMsg = v.msg; }
        }
      }
      if (q.fill) out.showFill = out.vals.slice(0, 5);
      return out;
    } finally {
      placed.forEach(function (r) { wb.setCell(sheet, r, at.c, null); });
      wb.recalc();
    }
  }

  // ---------- SQL ----------
  function freshDb(variant) {
    var db = SX.sql.makeStoreDb();
    if (variant) {
      SX.sql.execute(db, 'UPDATE sales SET qty = qty + (order_id % 3) + 1; DELETE FROM sales WHERE order_id % 9 = 0; UPDATE products SET price = price + 0.5, in_stock = in_stock + 7, cost = cost + 0.25;');
      if (db.tables.ml_examples) SX.sql.execute(db, 'UPDATE ml_examples SET units_last_week = units_last_week + 2 WHERE units_last_week IS NOT NULL; ' +
        'DELETE FROM predictions WHERE example_id % 7 = 0; DELETE FROM ml_examples WHERE example_id % 7 = 0;');
      Object.keys(db.tables).forEach(function (k) { db.tables[k].rows.reverse(); });
    }
    return db;
  }
  // Rows compared as a set unless order was asked for; column order never matters.
  function tableOf(res, ordered) {
    var rows = res.rows.map(function (r) { return r.map(canon); });
    var keys = res.columns.map(function (c, i) { return { i: i, k: JSON.stringify(rows.map(function (r) { return r[i]; }).sort()) }; });
    keys.sort(function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : a.i - b.i; });
    rows = rows.map(function (r) { return keys.map(function (k) { return r[k.i]; }); });
    if (!ordered) rows.sort(function (a, b) { var x = JSON.stringify(a), y = JSON.stringify(b); return x < y ? -1 : x > y ? 1 : 0; });
    return { cols: res.columns.length, rows: rows };
  }
  function runSelect(q, sql, variant) {
    sql = String(sql || '').trim();
    if (!sql) return { error: 'Type a query.' };
    var db = freshDb(variant), res;
    try { res = SX.sql.execute(db, sql); }
    catch (e) { if (e instanceof SX.sql.SqlError) return { error: 'Error: ' + e.message }; throw e; }
    if (res.length !== 1 || res[0].statement.type !== 'select') return { error: 'Answer with ONE SELECT query.' };
    return { table: tableOf(res[0], q.ordered), raw: res[0] };
  }
  // DDL / constraint questions: run the student's SQL, then hidden probes; the pattern of what succeeds is the answer.
  function runProbe(q, sql) {
    sql = String(sql || '').trim();
    if (!sql) return { error: 'Type your SQL.' };
    var db = freshDb(false), mine;
    try { mine = SX.sql.execute(db, sql); }
    catch (e) { if (e instanceof SX.sql.SqlError) return { error: 'Error: ' + e.message }; throw e; }
    var outcomes = q.probes.map(function (p) {
      try {
        var r = SX.sql.execute(db, p);
        var last = r[r.length - 1];
        return last.type === 'rows' ? JSON.stringify(tableOf(last, true).rows) : 'ok';
      } catch (e) { if (e instanceof SX.sql.SqlError) return 'refused'; throw e; }
    });
    return { outcomes: outcomes, msg: mine.map(function (r) { return r.message || (r.rows ? r.rows.length + ' rows' : ''); }).join(' ') };
  }

  // ---------- grading ----------
  // Returns { norm, preview } ; norm === null means "cannot be right" (with preview explaining why).
  function evaluate(q, resp) {
    resp = resp || {};
    var missing = (q.must || []).filter(function (w) { return !new RegExp('\\b' + w + '\\b', 'i').test(String(resp.text || '')); });
    if (missing.length) return { norm: null, preview: { error: 'Your answer must use ' + missing.join(' and ') + '.' } };
    if (q.kind === 'mc') return { norm: resp.text == null ? null : String(resp.text) };
    if (q.kind === 'text') return { norm: String(resp.text || '').trim() ? normText(resp.text) : null };
    if (q.kind === 'formula') {
      var a = runFormula(q, resp.text, !!resp.cse, book(q.book || 'store', q.plat, 0));
      if (a.error) return { norm: null, preview: { error: a.error } };
      var b = q.same ? a : runFormula(q, resp.text, !!resp.cse, book(q.book || 'store', q.plat, 1));
      if (b.error) return { norm: null, preview: { error: b.error } };
      return { norm: JSON.stringify([a.vals, b.vals]), preview: { grid: q.fill ? a.showFill.map(function (v) { return Array.isArray(v) ? v[0] : [v]; }) : a.show, errMsg: a.errMsg, fill: !!q.fill } };
    }
    if (q.kind === 'sql') {
      var x = runSelect(q, resp.text, false);
      if (x.error) return { norm: null, preview: { error: x.error } };
      var y = runSelect(q, resp.text, true);
      if (y.error) return { norm: null, preview: { error: y.error } };
      return { norm: JSON.stringify([x.table, y.table]), preview: { columns: x.raw.columns, rows: x.raw.rows.slice(0, 8).map(function (r) { return r.map(canon); }), total: x.raw.rows.length } };
    }
    if (q.kind === 'probe') {
      var p = runProbe(q, resp.text);
      if (p.error) return { norm: null, preview: { error: p.error } };
      return { norm: JSON.stringify(p.outcomes), preview: { msg: p.msg } };
    }
    if (q.kind === 'csv') {
      var text = String(resp.text || '').replace(/\r/g, '').replace(/\n+$/, '');
      if (!text) return { norm: null };
      var parsed = SX.csv.parse(text, q.delim || ',');
      var fields = parsed.rows.map(function (r) { return r.cells.map(function (c) { return c.v; }); });
      if (parsed.problems.length) return { norm: null, preview: { error: parsed.problems[0].msg, fields: fields } };
      return { norm: JSON.stringify(fields), preview: { fields: fields } };
    }
    return { norm: null };
  }
  function isCorrect(q, resp) {
    var e = evaluate(q, resp);
    if (e.norm === null) return false;
    var hsh = SX.seal.answerHash(q.id, e.norm);
    return q.h.indexOf(hsh) >= 0;
  }
  function isHandsOn(q) { return q.kind === 'formula' || q.kind === 'sql' || q.kind === 'probe' || q.kind === 'csv'; }

  // Pick a test: up to half hands-on, the rest concept questions; options shuffled.
  var SIZE = 10, PASS = 0.8;
  function shuffle(a, rnd) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function draw(bank, rnd) {
    rnd = rnd || Math.random;
    var hands = shuffle(bank.filter(isHandsOn), rnd), concept = shuffle(bank.filter(function (q) { return !isHandsOn(q); }), rnd);
    var nh = Math.min(hands.length, Math.ceil(SIZE / 2)), nc = Math.min(concept.length, SIZE - nh);
    nh = Math.min(hands.length, SIZE - nc);
    var picked = shuffle(hands.slice(0, nh).concat(concept.slice(0, nc)), rnd);
    return picked.map(function (q) { return q.opts ? Object.assign({}, q, { opts: shuffle(q.opts, rnd) }) : q; });
  }
  function needed(n) { return Math.ceil(n * PASS - 1e-9); }

  SX.certtest = { evaluate: evaluate, isCorrect: isCorrect, isHandsOn: isHandsOn, draw: draw, needed: needed, normText: normText, canon: canon,
    book: book, SIZE: SIZE, PASS: PASS, COOLDOWN: 120 };
})(globalThis.SX = globalThis.SX || {});
