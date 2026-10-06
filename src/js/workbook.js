/* SheetEX — workbook model: cells, recalculation, spilling, formats, undo, clipboard. */
(function (SX) {
  'use strict';
  var F = SX.f, E = SX.engine, XErr = F.XErr, isErr = F.isErr, Mat = F.Mat, Rng = F.Rng;

  var ROWS = 150, COLS = 26;

  // ---- Platforms (behavior flags; UI theme lives in platforms.js) ----
  var PLAT = {
    xl365: { id: 'xl365', style: 'excel', arrayAuto: true, spill: true, parse: { allowAt: true, allowSpillRef: true, allowOpen: false } },
    xl2013: { id: 'xl2013', style: 'excel', arrayAuto: false, spill: false, parse: { allowAt: false, allowSpillRef: false, allowOpen: false } },
    gs: { id: 'gs', style: 'sheets', arrayAuto: false, spill: true, parse: { allowAt: false, allowSpillRef: false, allowOpen: true } }
  };

  var NOFMT = ['COUNT', 'COUNTA', 'COUNTIF', 'COUNTIFS', 'COUNTBLANK', 'MATCH', 'XMATCH', 'ROWS', 'COLUMNS', 'ROW', 'COLUMN',
    'LEN', 'FIND', 'SEARCH', 'YEAR', 'MONTH', 'DAY', 'WEEKDAY', 'DAYS', 'DATEDIF', 'RANK', 'RANK.EQ', 'COUNTUNIQUE',
    'AND', 'OR', 'NOT', 'XOR', 'TEXT', 'ISNUMBER', 'ISTEXT', 'ISBLANK', 'ISERROR', 'ISNA', 'CONCATENATE', 'CONCAT',
    'TEXTJOIN', 'JOIN', 'LEFT', 'RIGHT', 'MID', 'UPPER', 'LOWER', 'PROPER', 'TRIM', 'SUBSTITUTE', 'QUERY'];

  function key(r, c) { return r + ',' + c; }

  function Workbook(platId) {
    this.plat = PLAT[platId];
    this.platId = platId;
    this.sheets = [];
    this.cover = {};
    this.vals = {};
    this.spills = {};
    this.undoStack = [];
    this.redoStack = [];
    this.circular = null;
  }
  Workbook.ROWS = ROWS; Workbook.COLS = COLS; Workbook.PLAT = PLAT;

  Workbook.prototype.addSheet = function (name) {
    var s = { name: name, cells: {} };
    this.sheets.push(s); return s;
  };
  Workbook.prototype.sheet = function (name) {
    var low = String(name).toLowerCase();
    for (var i = 0; i < this.sheets.length; i++) if (this.sheets[i].name.toLowerCase() === low) return this.sheets[i];
    return null;
  };
  Workbook.prototype.sheetName = function (name) { var s = this.sheet(name); return s ? s.name : null; };
  Workbook.prototype.getCell = function (sheet, r, c) { var s = this.sheet(sheet); return s ? s.cells[key(r, c)] || null : null; };

  Workbook.prototype.maxRow = function (sheet) {
    var s = this.sheet(sheet); if (!s) return 0;
    if (s._maxRow != null) return s._maxRow;
    var m = 0;
    for (var k in s.cells) { var r = +k.split(',')[0]; if (r > m) m = r; }
    for (var ck in this.cover) if (ck.indexOf(s.name + '|') === 0) { var rr = +ck.split('|')[1].split(',')[0]; if (rr > m) m = rr; }
    s._maxRow = m; return m;
  };
  Workbook.prototype.maxCol = function (sheet) {
    var s = this.sheet(sheet); if (!s) return 0;
    var m = 0; for (var k in s.cells) { var c = +k.split(',')[1]; if (c > m) m = c; } return m;
  };

  // ---------- Literal parsing ----------
  function parseLiteral(text) {
    if (text === '') return { v: null };
    if (text[0] === "'") return { v: text.slice(1), text: true };
    var up = text.trim().toUpperCase();
    if (up === 'TRUE' || up === 'FALSE') return { v: up === 'TRUE' };
    var p = E.parseNumberText(text);
    if (p) return { v: p.v, fmt: p.fmt };
    return { v: text };
  }
  Workbook.parseLiteral = parseLiteral;

  // Normalize formula text the way spreadsheets do on Enter (uppercase functions and refs, close parens).
  function normalize(src) {
    var toks;
    try { toks = F.lex(src); } catch (e) { return src; }
    var out = '', last = 0;
    toks.forEach(function (t) {
      if (t.t === 'FUNC') { out += src.slice(last, t.s) + t.v + '('; last = t.e; }
      else if (t.t === 'REF') { out += src.slice(last, t.s) + F.refText(t.ref); last = t.e; }
      else if (t.t === 'BOOL') { out += src.slice(last, t.s) + (t.v ? 'TRUE' : 'FALSE'); last = t.e; }
    });
    return out + src.slice(last);
  }
  function parenBalance(src) {
    var depth = 0, inStr = false;
    for (var i = 0; i < src.length; i++) {
      var ch = src[i];
      if (ch === '"') inStr = !inStr;
      else if (!inStr && ch === '(') depth++;
      else if (!inStr && ch === ')') depth--;
    }
    return inStr ? -999 : depth;
  }

  // Prepare a cell object from typed text. Returns {cell} or {dialog} (Excel refusing the formula).
  Workbook.prototype.prepare = function (text, opts) {
    opts = opts || {};
    var plat = this.plat;
    if (text == null || text === '') return { cell: null };
    if (text[0] === '=' && text.length > 1) {
      var src = text.slice(1);
      var bal = parenBalance(src);
      if (bal > 0 && bal < 10) src += new Array(bal + 1).join(')'); // both apps auto-close parentheses
      var ast;
      try { ast = F.parse(src, plat.parse); }
      catch (e) {
        if (!(e instanceof F.ParseError)) throw e;
        if (plat.style === 'excel') return { dialog: "There's a problem with this formula.", detail: e.message, pos: e.pos };
        return { cell: { input: '=' + src, perr: e.message } };
      }
      var probs = E.validate(ast, plat);
      if (probs.length && plat.style === 'excel') return { dialog: probs[0].msg, detail: 'Check the number of arguments (the values separated by commas) inside ' + probs[0].fn + '( ).' };
      var norm = normalize(src);
      var cell = { input: '=' + norm };
      if (opts.cse && plat.style === 'excel') cell.cse = true;
      return { cell: cell };
    }
    return { cell: { input: text } };
  };

  function compile(cell, plat) {
    if (!cell || cell._compiled) return;
    cell._compiled = true;
    cell.isFormula = cell.input[0] === '=' && cell.input.length > 1;
    if (cell.isFormula) {
      if (!cell.perr) {
        try { cell.ast = F.parse(cell.input.slice(1), plat.parse); }
        catch (e) { cell.perr = e.message; }
      }
    } else {
      var lit = parseLiteral(cell.input);
      cell.val = lit.v;
      cell.autoFmt = lit.fmt || null;
    }
  }

  // Low-level set (used by loaders, undo, paste). Does not recalc.
  Workbook.prototype.setCell = function (sheet, r, c, cell) {
    var s = this.sheet(sheet);
    var k = key(r, c);
    var prevFmt = s.cells[k] && s.cells[k].fmt;
    if (!cell || (cell.input === '' && !cell.fmt)) { delete s.cells[k]; }
    else {
      var nc = { input: cell.input || '' };
      if (cell.fmt) nc.fmt = cell.fmt; else if (prevFmt && cell.keepFmt !== false) nc.fmt = prevFmt;
      if (cell.cse) nc.cse = true;
      if (cell.perr) nc.perr = cell.perr;
      if (cell.lock) nc.lock = true;
      compile(nc, this.plat);
      s.cells[k] = nc;
    }
    s._maxRow = null;
  };

  // ---------- Edits with undo ----------
  function snapshot(cell) { return cell ? { input: cell.input, fmt: cell.fmt, cse: cell.cse, perr: cell.perr, keepFmt: false } : null; }
  Workbook.prototype.applyEdits = function (edits) {
    var self = this, undo = [];
    edits.forEach(function (e) {
      undo.push({ sheet: e.sheet, r: e.r, c: e.c, cell: snapshot(self.getCell(e.sheet, e.r, e.c)) });
      self.setCell(e.sheet, e.r, e.c, e.cell);
    });
    this.undoStack.push(undo); if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.recalc();
  };
  Workbook.prototype._swap = function (from, to) {
    var batch = from.pop(); if (!batch) return false;
    var self = this, back = [];
    batch.forEach(function (e) {
      back.push({ sheet: e.sheet, r: e.r, c: e.c, cell: snapshot(self.getCell(e.sheet, e.r, e.c)) });
      self.setCell(e.sheet, e.r, e.c, e.cell);
    });
    to.push(back); this.recalc(); return batch[0];
  };
  Workbook.prototype.undo = function () { return this._swap(this.undoStack, this.redoStack); };
  Workbook.prototype.redo = function () { return this._swap(this.redoStack, this.undoStack); };

  // ---------- Recalculation ----------
  Workbook.prototype.recalc = function () {
    var prev = this.cover || {};
    this.circular = null;
    for (var iter = 0; iter < 6; iter++) {
      this.prevCover = prev;
      this.vals = {}; this.inprog = {}; this.spills = {}; this.claimed = {};
      this.sheets.forEach(function (s) { s._maxRow = null; });
      var self = this;
      this.sheets.forEach(function (s) {
        Object.keys(s.cells).forEach(function (k) {
          var cell = s.cells[k];
          if (cell.isFormula) { var p = k.split(','); self.getValue(s.name, +p[0], +p[1]); }
        });
      });
      var cover = {};
      Object.keys(this.spills).forEach(function (ak) {
        var sp = self.spills[ak];
        for (var r = sp.r1; r <= sp.r2; r++) for (var c = sp.c1; c <= sp.c2; c++) {
          if (r === sp.r1 && c === sp.c1) continue;
          cover[sp.sheet + '|' + key(r, c)] = ak;
        }
      });
      var same = Object.keys(cover).length === Object.keys(prev).length && Object.keys(cover).every(function (k) { return prev[k] === cover[k]; });
      this.cover = cover;
      if (same) break;
      prev = cover;
    }
    this.version = (this.version || 0) + 1;
  };

  Workbook.prototype.getValue = function (sheet, r, c) {
    var s = this.sheet(sheet);
    if (!s || r < 0 || c < 0) return new XErr('#REF!');
    var k = key(r, c), fk = s.name + '|' + k;
    if (this.vals.hasOwnProperty(fk)) return this.vals[fk];
    var cell = s.cells[k];
    if (!cell || cell.input === '') {
      var anchor = this.prevCover[fk];
      if (anchor) {
        var ap = anchor.split('|'), arc = ap[1].split(',');
        this.getValue(ap[0], +arc[0], +arc[1]);
        var sp = this.spills[anchor];
        if (sp && r >= sp.r1 && r <= sp.r2 && c >= sp.c1 && c <= sp.c2) {
          var v = sp.mat.rows[r - sp.r1][c - sp.c1];
          return v === null && this.plat.style === 'excel' ? 0 : v;
        }
      }
      return null;
    }
    if (!cell.isFormula) return cell.val;
    if (this.inprog[fk]) {
      this.circular = this.circular || { sheet: s.name, r: r, c: c };
      return this.plat.style === 'sheets'
        ? new XErr('#REF!', 'Circular dependency detected. A formula refers back to its own cell.')
        : 0;
    }
    this.inprog[fk] = true;
    var res;
    if (cell.perr) res = new XErr('#ERROR!', 'Formula parse error. ' + cell.perr);
    else {
      try { res = E.evaluate(cell.ast, this, s.name, r, c, this.plat, { cse: cell.cse }); }
      catch (e) { res = new XErr('#VALUE!', 'Internal error: ' + e.message); }
      res = this.finish(res, s.name, r, c, cell);
    }
    delete this.inprog[fk];
    this.vals[fk] = res;
    return res;
  };

  Workbook.prototype.finish = function (v, sheet, r, c, cell) {
    var plat = this.plat, excel = plat.style === 'excel';
    if (v === F.MISSING) v = 0;
    if (v instanceof Rng) {
      if (v.h() === 1 && v.w() === 1) v = this.getValue(v.sheet, v.r1, v.c1);
      else if (plat.spill && !cell.cse) v = E.toMat(v, { wb: this });
      else if (cell.cse) v = this.getValue(v.sheet, v.r1, v.c1);
      else {
        // implicit intersection (Excel 2013 without Ctrl+Shift+Enter)
        if (v.w() === 1 && r >= v.r1 && r <= v.r2) v = this.getValue(v.sheet, r, v.c1);
        else if (v.h() === 1 && c >= v.c1 && c <= v.c2) v = this.getValue(v.sheet, v.r1, c);
        else v = new XErr('#VALUE!', 'This formula returns a whole range, but Excel 2013 can only show one value in a cell. Use Ctrl+Shift+Enter for an array formula.');
      }
    }
    if (v instanceof Mat) {
      if (v.h() === 1 && v.w() === 1) v = v.rows[0][0];
      else if (!plat.spill || cell.cse) v = v.rows[0][0];
      else return this.spill(v, sheet, r, c);
    }
    if (v === null || v === undefined) return excel ? 0 : null;
    if (typeof v === 'number' && !isFinite(v)) return new XErr('#NUM!');
    return v;
  };

  Workbook.prototype.spill = function (m, sheet, r, c) {
    var s = this.sheet(sheet), excel = this.plat.style === 'excel';
    var r2 = r + m.h() - 1, c2 = c + m.w() - 1;
    if (r2 >= ROWS || c2 >= COLS) {
      return excel ? new XErr('#SPILL!', 'The result is too big — it would spill past the edge of the sheet.')
        : new XErr('#REF!', 'Result was not automatically expanded, please insert more rows.');
    }
    for (var i = r; i <= r2; i++) for (var j = c; j <= c2; j++) {
      if (i === r && j === c) continue;
      var k = key(i, j), cell = s.cells[k];
      var blocked = (cell && cell.input !== '') || (this.claimed[sheet + '|' + k] && this.claimed[sheet + '|' + k] !== sheet + '|' + key(r, c));
      if (blocked) {
        return excel
          ? new XErr('#SPILL!', 'Spill range isn\'t blank. ' + F.addr(i, j) + ' is in the way — clear it so the ' + m.h() + '×' + m.w() + ' result can spill.')
          : new XErr('#REF!', 'Array result was not expanded because it would overwrite data in ' + F.addr(i, j) + '.');
      }
    }
    var ak = sheet + '|' + key(r, c);
    for (var a = r; a <= r2; a++) for (var b = c; b <= c2; b++) this.claimed[sheet + '|' + key(a, b)] = ak;
    this.spills[ak] = { sheet: sheet, r1: r, c1: c, r2: r2, c2: c2, mat: m };
    var v0 = m.rows[0][0];
    return v0 === null ? (excel ? 0 : null) : v0;
  };

  Workbook.prototype.spillRange = function (sheet, r, c) {
    this.getValue(sheet, r, c);
    var sp = this.spills[this.sheetName(sheet) + '|' + key(r, c)];
    return sp ? new Rng(sp.sheet, sp.r1, sp.c1, sp.r2, sp.c2) : null;
  };

  // ---------- Display ----------
  // Which argument of a function decides the result's number format (e.g. the return column of a lookup).
  var FMT_ARG = { VLOOKUP: 1, HLOOKUP: 1, INDEX: 0, XLOOKUP: 2, LOOKUP: 2, SUMIF: 2, AVERAGEIF: 2, SUMIFS: 0, AVERAGEIFS: 0,
    MAXIFS: 0, MINIFS: 0, FILTER: 0, SORT: 0, UNIQUE: 0, IFERROR: 0, IFNA: 0, SUMPRODUCT: 0 };
  Workbook.prototype.inferFmt = function (sheet, cell, depth) {
    if (cell.fmt) return cell.fmt;
    if (!cell.isFormula) return cell.autoFmt;
    if (!cell.ast || (depth || 0) > 6) return null;
    return this.astFmt(sheet, cell.ast, (depth || 0) + 1);
  };
  Workbook.prototype.refFmt = function (sheet, n, depth, dc) {
    if (n.ref.a.row == null && n.ref.kind !== 'cols') return null;
    var sh = n.ref.sheet ? this.sheetName(n.ref.sheet) : sheet;
    if (!sh) return null;
    var col = (n.ref.a.col || 0) + (dc || 0);
    var row = n.ref.a.row == null ? 1 : n.ref.a.row;
    var cc = n.ref.kind === 'cell' ? this.getCell(sh, row, col) : (this.getCell(sh, row + 1, col) || this.getCell(sh, row, col));
    if (!cc) return null;
    return cc.fmt || (cc.isFormula ? this.inferFmt(sh, cc, depth) : cc.autoFmt) || null;
  };
  Workbook.prototype.astFmt = function (sheet, root, depth) {
    while (root.t === 'paren') root = root.e;
    if (root.t === 'ref') return this.refFmt(sheet, root, depth);
    if (root.t === 'fn') {
      if (NOFMT.indexOf(root.name) >= 0) return null;
      var d = E.FN[root.name];
      if (d && d.fmt) return d.fmt;
      if (root.name === 'VLOOKUP' && root.args[1] && root.args[1].t === 'ref' && root.args[2] && root.args[2].t === 'num') {
        return this.refFmt(sheet, root.args[1], depth, root.args[2].v - 1);
      }
      if (FMT_ARG.hasOwnProperty(root.name)) {
        var a = root.args[FMT_ARG[root.name]];
        if (root.name === 'SUMIF' || root.name === 'AVERAGEIF') a = root.args[2] || root.args[0];
        return a ? this.astFmt(sheet, a, depth) : null;
      }
      if (root.name === 'IF') return (root.args[1] && this.astFmt(sheet, root.args[1], depth)) || (root.args[2] && this.astFmt(sheet, root.args[2], depth)) || null;
    }
    if (root.t === 'bin' && ['=', '<>', '<', '>', '<=', '>=', '&'].indexOf(root.op) >= 0) return null;
    if (root.t === 'bin' && root.op === '/') {
      var lf = this.astFmt(sheet, root.l, depth), rf = this.astFmt(sheet, root.r, depth);
      return lf && rf ? null : lf;
    }
    if (root.t === 'num' || root.t === 'str' || root.t === 'bool') return null;
    var self = this, found = null;
    F.walk(root, function (n) {
      if (found !== null || n.t !== 'ref') return;
      found = self.refFmt(sheet, n, depth);
    });
    if (found === 'date' && root.t === 'bin' && root.op === '*') found = null;
    return found;
  };

  // Formats for spilled cells: copy the column formats of the source range when we can find one.
  Workbook.prototype.spillFmt = function (anchorSheet, anchorCell, dr, dc) {
    var ast = anchorCell.ast; if (!ast) return null;
    var src = null, self = this;
    F.walk(ast, function (n) { if (!src && n.t === 'ref' && (n.ref.kind === 'range' || n.ref.kind === 'open' || n.ref.kind === 'cols')) src = n; });
    if (!src) return this.inferFmt(anchorSheet, anchorCell);
    var sh = src.ref.sheet ? this.sheetName(src.ref.sheet) : anchorSheet;
    if (!sh) return null;
    var col = Math.min(src.ref.a.col, src.ref.b ? src.ref.b.col : src.ref.a.col) + dc;
    var row0 = src.ref.a.row != null ? src.ref.a.row : 0;
    var cc = this.getCell(sh, row0 + 1, col) || this.getCell(sh, row0, col);
    // Single-column results that came from a different column (e.g. XLOOKUP returning prices)
    if (!cc) return null;
    return cc.fmt || cc.autoFmt || null;
  };

  // Everything the grid needs to draw one cell.
  Workbook.prototype.display = function (sheet, r, c) {
    var s = this.sheet(sheet), k = key(r, c), cell = s.cells[k];
    var out = { text: '', align: 'left', err: null, spilled: false, anchor: false, formula: false, fmt: null };
    var v;
    if (cell && cell.input !== '') {
      out.formula = !!cell.isFormula;
      v = cell.isFormula ? this.vals[s.name + '|' + k] : cell.val;
      if (v === undefined) v = this.getValue(s.name, r, c);
      out.fmt = this.inferFmt(s.name, cell);
      if (this.spills[s.name + '|' + k]) out.anchor = true;
      if (cell.isFormula && out.anchor) out.fmt = cell.fmt || this.spillFmt(s.name, cell, 0, 0);
    } else {
      var ak = this.cover[s.name + '|' + k];
      if (!ak) return out;
      var sp = this.spills[ak];
      if (!sp) return out;
      v = sp.mat.rows[r - sp.r1][c - sp.c1];
      if (v === null && this.plat.style === 'excel') v = 0;
      out.spilled = true;
      var anchorCell = this.getCell(sp.sheet, sp.r1, sp.c1);
      out.fmt = (cell && cell.fmt) || this.spillFmt(sp.sheet, anchorCell, r - sp.r1, c - sp.c1);
    }
    if (isErr(v)) { out.err = v; out.text = v.code; out.align = 'center'; return out; }
    if (cell && cell.fmt && !out.spilled) out.fmt = cell.fmt;
    out.text = E.displayValue(v, out.fmt);
    out.align = typeof v === 'number' ? 'right' : typeof v === 'boolean' ? 'center' : 'left';
    out.value = v;
    return out;
  };

  Workbook.prototype.value = function (sheet, r, c) {
    var s = this.sheet(sheet), k = key(r, c), cell = s.cells[k];
    if (cell && cell.input !== '') return cell.isFormula ? this.vals[s.name + '|' + k] : cell.val;
    var ak = this.cover[s.name + '|' + k];
    if (ak && this.spills[ak]) { var sp = this.spills[ak]; var v = sp.mat.rows[r - sp.r1][c - sp.c1]; return v === null && this.plat.style === 'excel' ? 0 : v; }
    return null;
  };

  Workbook.prototype.formulaText = function (sheet, r, c) {
    var cell = this.getCell(sheet, r, c);
    if (!cell) return '';
    return cell.cse ? '{' + cell.input + '}' : cell.input;
  };

  // ---------- Clipboard ----------
  Workbook.prototype.copy = function (sheet, r1, c1, r2, c2) {
    var items = [];
    for (var r = r1; r <= r2; r++) for (var c = c1; c <= c2; c++) {
      var cell = this.getCell(sheet, r, c);
      items.push({ dr: r - r1, dc: c - c1, cell: cell ? { input: cell.input, fmt: cell.fmt, cse: cell.cse } : null });
    }
    return { sheet: sheet, r: r1, c: c1, h: r2 - r1 + 1, w: c2 - c1 + 1, items: items };
  };
  Workbook.prototype.pasteEdits = function (clip, sheet, r0, c0, h, w) {
    // Fill the target area (repeat the clip if the target is a multiple of it, like Excel)
    var edits = [];
    var th = Math.max(clip.h, h && h % clip.h === 0 ? h : clip.h), tw = Math.max(clip.w, w && w % clip.w === 0 ? w : clip.w);
    for (var i = 0; i < th; i++) for (var j = 0; j < tw; j++) {
      var it = clip.items[(i % clip.h) * clip.w + (j % clip.w)];
      var r = r0 + i, c = c0 + j;
      if (r >= ROWS || c >= COLS) continue;
      var srcR = clip.r + it.dr, srcC = clip.c + it.dc;
      var cell = it.cell ? { input: it.cell.input, fmt: it.cell.fmt, cse: it.cell.cse, keepFmt: false } : null;
      if (cell && cell.input[0] === '=') cell.input = '=' + F.shiftFormula(cell.input.slice(1), r - srcR, c - srcC);
      edits.push({ sheet: sheet, r: r, c: c, cell: cell });
    }
    return edits;
  };

  // ---------- Persistence ----------
  Workbook.prototype.serialize = function () {
    return this.sheets.map(function (s) {
      var cells = {};
      Object.keys(s.cells).forEach(function (k) {
        var c = s.cells[k], o = { i: c.input };
        if (c.fmt) o.f = c.fmt; if (c.cse) o.a = 1; if (c.perr) o.p = c.perr;
        cells[k] = o;
      });
      return { name: s.name, cells: cells };
    });
  };
  Workbook.prototype.load = function (data) {
    var self = this;
    this.sheets = [];
    data.forEach(function (sd) {
      var s = self.addSheet(sd.name);
      Object.keys(sd.cells).forEach(function (k) {
        var o = sd.cells[k], p = k.split(',');
        self.setCell(s.name, +p[0], +p[1], { input: o.i, fmt: o.f, cse: !!o.a, perr: o.p });
      });
    });
    this.recalc();
  };

  // ---------- Default store workbook ----------
  function isoToSerial(iso) { var p = iso.split('-'); return E.serial(+p[0], +p[1], +p[2]); }
  function fill(wb, name, headers, rows, fmts) {
    var s = wb.addSheet(name);
    headers.forEach(function (h, c) { wb.setCell(name, 0, c, { input: h }); });
    rows.forEach(function (row, i) {
      row.forEach(function (v, c) {
        var f = fmts && fmts[c];
        var input;
        if (f === 'date') input = String(isoToSerial(v));
        else input = typeof v === 'number' ? String(v) : String(v);
        if (typeof v === 'string' && E.parseNumberText(v) && f !== 'date') input = "'" + v;
        wb.setCell(name, i + 1, c, { input: input, fmt: f || undefined });
      });
    });
    return s;
  }
  function makeStoreWorkbook(platId) {
    var D = SX.data, wb = new Workbook(platId);
    fill(wb, 'Products', D.PRODUCT_HEADERS, D.PRODUCTS, [null, null, null, 'currency', 'currency']);
    fill(wb, 'Sales', D.SALES_HEADERS, D.SALES, [null, 'date']);
    fill(wb, 'Stores', D.STORE_HEADERS, D.STORES, [null, null, null, null, null, 'date']);
    wb.addSheet('Scratch');
    wb.setCell('Scratch', 0, 0, { input: 'Practice space — try anything here!' });
    wb.recalc();
    return wb;
  }

  SX.Workbook = Workbook;
  SX.makeStoreWorkbook = makeStoreWorkbook;
})(globalThis.SX = globalThis.SX || {});
