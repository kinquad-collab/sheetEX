/* SheetEX — formula values, lexer, parser, printer, reference shifting. */
(function (SX) {
  'use strict';

  // ---------- Values ----------
  function XErr(code, msg) { this.code = code; this.msg = msg || ''; }
  XErr.prototype.toString = function () { return this.code; };
  function isErr(v) { return v instanceof XErr; }

  function Mat(rows) { this.rows = rows; }
  Mat.prototype.h = function () { return this.rows.length; };
  Mat.prototype.w = function () { return this.rows.length ? this.rows[0].length : 0; };

  function Rng(sheet, r1, c1, r2, c2) {
    this.sheet = sheet; this.r1 = r1; this.c1 = c1; this.r2 = r2; this.c2 = c2;
  }
  Rng.prototype.h = function () { return this.r2 - this.r1 + 1; };
  Rng.prototype.w = function () { return this.c2 - this.c1 + 1; };

  var MISSING = { missing: true };

  var ERR_TEXT = {
    '#NAME?': 'The formula contains unrecognized text (usually a misspelled or unsupported function name).',
    '#VALUE!': 'Wrong type of value — e.g. doing math on text, or a range where one value was expected.',
    '#REF!': 'The formula refers to a cell or sheet that does not exist.',
    '#DIV/0!': 'Dividing by zero (or by an empty cell).',
    '#N/A': 'A value is not available — usually a lookup that found no match.',
    '#NUM!': 'A number is invalid or too big/small.',
    '#NULL!': 'Ranges do not intersect.',
    '#SPILL!': 'The result is an array, but cells it needs to spill into are not empty.',
    '#CALC!': 'The calculation engine hit something it does not support, like an empty array.',
    '#ERROR!': 'Google Sheets could not understand (parse) the formula.'
  };

  // ---------- Column helpers ----------
  function colToIdx(s) {
    var n = 0; s = s.toUpperCase();
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }
  function idxToCol(i) {
    var s = ''; i += 1;
    while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  }
  function addr(r, c) { return idxToCol(c) + (r + 1); }

  function ParseError(msg, pos) { this.message = msg; this.pos = pos; }
  ParseError.prototype = Object.create(Error.prototype);
  ParseError.prototype.constructor = ParseError;
  ParseError.prototype.name = 'ParseError';

  // ---------- Lexer ----------
  var SHEET_RE = "(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_.]*))!";
  var CELL = '(\\$?)([A-Za-z]{1,3})(\\$?)(\\d+)';
  var COL = '(\\$?)([A-Za-z]{1,3})';
  var ROW = '(\\$?)(\\d+)';
  var RE_CELLCELL = new RegExp('(?:' + SHEET_RE + ')?' + CELL + ':' + CELL, 'y');
  var RE_CELLCOL = new RegExp('(?:' + SHEET_RE + ')?' + CELL + ':' + COL, 'y');
  var RE_COLCOL = new RegExp('(?:' + SHEET_RE + ')?' + COL + ':' + COL, 'y');
  var RE_ROWROW = new RegExp('(?:' + SHEET_RE + ')?' + ROW + ':' + ROW, 'y');
  var RE_CELL = new RegExp('(?:' + SHEET_RE + ')?' + CELL, 'y');
  var RE_IDENT = /[A-Za-z_\\][A-Za-z0-9_.]*/y;
  var RE_NUM = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
  var ERRORS = ['#N/A', '#VALUE!', '#REF!', '#DIV/0!', '#NUM!', '#NAME?', '#NULL!', '#SPILL!', '#CALC!'];
  var MAXCOL = 16383;

  function sheetName(m) { return m[1] != null ? m[1].replace(/''/g, "'") : (m[2] != null ? m[2] : null); }
  function okAfter(src, i) { return i >= src.length || !/[A-Za-z0-9_(.]/.test(src[i]); }

  function tryRef(src, i) {
    var m, re;
    re = RE_CELLCELL; re.lastIndex = i; m = re.exec(src);
    if (m && okAfter(src, re.lastIndex)) {
      var c1 = colToIdx(m[4]), c2 = colToIdx(m[8]);
      if (c1 <= MAXCOL && c2 <= MAXCOL) return { end: re.lastIndex, sheet: sheetName(m), kind: 'range',
        a: { col: c1, row: +m[6] - 1, ca: !!m[3], ra: !!m[5] },
        b: { col: c2, row: +m[10] - 1, ca: !!m[7], ra: !!m[9] } };
    }
    re = RE_CELLCOL; re.lastIndex = i; m = re.exec(src);
    if (m && okAfter(src, re.lastIndex) && !/[0-9$]/.test(src[re.lastIndex] || '')) {
      return { end: re.lastIndex, sheet: sheetName(m), kind: 'open',
        a: { col: colToIdx(m[4]), row: +m[6] - 1, ca: !!m[3], ra: !!m[5] },
        b: { col: colToIdx(m[8]), row: null, ca: !!m[7], ra: false } };
    }
    re = RE_COLCOL; re.lastIndex = i; m = re.exec(src);
    if (m && okAfter(src, re.lastIndex)) {
      return { end: re.lastIndex, sheet: sheetName(m), kind: 'cols',
        a: { col: colToIdx(m[4]), row: null, ca: !!m[3] }, b: { col: colToIdx(m[6]), row: null, ca: !!m[5] } };
    }
    re = RE_ROWROW; re.lastIndex = i; m = re.exec(src);
    if (m && okAfter(src, re.lastIndex)) {
      return { end: re.lastIndex, sheet: sheetName(m), kind: 'rows',
        a: { col: null, row: +m[4] - 1, ra: !!m[3] }, b: { col: null, row: +m[6] - 1, ra: !!m[5] } };
    }
    re = RE_CELL; re.lastIndex = i; m = re.exec(src);
    if (m && okAfter(src, re.lastIndex)) {
      var c = colToIdx(m[4]);
      if (c <= MAXCOL && +m[6] >= 1) return { end: re.lastIndex, sheet: sheetName(m), kind: 'cell',
        a: { col: c, row: +m[6] - 1, ca: !!m[3], ra: !!m[5] }, b: null };
    }
    return null;
  }

  function lex(src) {
    var toks = [], i = 0, n = src.length;
    while (i < n) {
      var ch = src[i], start = i;
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '"') {
        var s = ''; i++;
        while (true) {
          if (i >= n) throw new ParseError('Text is missing its closing quote mark "', start);
          if (src[i] === '"') { if (src[i + 1] === '"') { s += '"'; i += 2; continue; } i++; break; }
          s += src[i++];
        }
        toks.push({ t: 'STR', v: s, s: start, e: i });
        continue;
      }
      if (ch === '#') {
        var found = null;
        for (var k = 0; k < ERRORS.length; k++) {
          if (src.substr(i, ERRORS[k].length).toUpperCase() === ERRORS[k]) { found = ERRORS[k]; break; }
        }
        if (found) { toks.push({ t: 'ERR', v: found, s: i, e: i + found.length }); i += found.length; continue; }
        toks.push({ t: 'HASH', s: i, e: i + 1 }); i++; continue;
      }
      if (/[0-9.]/.test(ch)) {
        var r0 = tryRef(src, i);
        if (r0 && r0.kind === 'rows') { toks.push({ t: 'REF', ref: r0, s: i, e: r0.end, raw: src.slice(i, r0.end) }); i = r0.end; continue; }
        RE_NUM.lastIndex = i; var mn = RE_NUM.exec(src);
        if (!mn) throw new ParseError('Unexpected "' + ch + '"', i);
        toks.push({ t: 'NUM', v: parseFloat(mn[0]), s: i, e: RE_NUM.lastIndex }); i = RE_NUM.lastIndex; continue;
      }
      if (/[A-Za-z_$'\\]/.test(ch)) {
        var r = tryRef(src, i);
        if (r) { toks.push({ t: 'REF', ref: r, s: i, e: r.end, raw: src.slice(i, r.end) }); i = r.end; continue; }
        if (ch === "'" || ch === '$') throw new ParseError('Unexpected "' + ch + '"', i);
        RE_IDENT.lastIndex = i; var mi = RE_IDENT.exec(src);
        var word = mi[0]; i = RE_IDENT.lastIndex;
        if (src[i] === '!') throw new ParseError('Bad sheet reference "' + word + '!"', start);
        if (src[i] === '(') { toks.push({ t: 'FUNC', v: word.toUpperCase(), raw: word, s: start, e: i + 1 }); i++; continue; }
        var up = word.toUpperCase();
        if (up === 'TRUE' || up === 'FALSE') { toks.push({ t: 'BOOL', v: up === 'TRUE', s: start, e: i }); continue; }
        toks.push({ t: 'NAME', v: up, raw: word, s: start, e: i });
        continue;
      }
      var two = src.substr(i, 2);
      if (two === '<=' || two === '>=' || two === '<>') { toks.push({ t: 'OP', v: two, s: i, e: i + 2 }); i += 2; continue; }
      if ('+-*/^&=<>%'.indexOf(ch) >= 0) { toks.push({ t: 'OP', v: ch, s: i, e: i + 1 }); i++; continue; }
      var map = { '(': 'LP', ')': 'RP', ',': 'COMMA', ';': 'SEMI', '{': 'LB', '}': 'RB', '@': 'AT' };
      if (map[ch]) { toks.push({ t: map[ch], s: i, e: i + 1 }); i++; continue; }
      throw new ParseError('Unexpected character "' + ch + '"', i);
    }
    toks.push({ t: 'EOF', s: n, e: n });
    return toks;
  }

  // ---------- Parser ----------
  function parse(src, opts) {
    opts = opts || {};
    var toks = lex(src), p = 0;
    function peek() { return toks[p]; }
    function next() { return toks[p++]; }
    function isOp(v) { var t = toks[p]; return t.t === 'OP' && t.v === v; }
    function expect(t, what) {
      if (toks[p].t !== t) throw new ParseError('Expected ' + what, toks[p].s);
      return toks[p++];
    }

    function expr() { return comparison(); }
    function comparison() {
      var l = concat();
      while (peek().t === 'OP' && ['=', '<>', '<', '>', '<=', '>='].indexOf(peek().v) >= 0) {
        var op = next().v; l = { t: 'bin', op: op, l: l, r: concat() };
      }
      return l;
    }
    function concat() {
      var l = additive();
      while (isOp('&')) { next(); l = { t: 'bin', op: '&', l: l, r: additive() }; }
      return l;
    }
    function additive() {
      var l = mul();
      while (isOp('+') || isOp('-')) { var op = next().v; l = { t: 'bin', op: op, l: l, r: mul() }; }
      return l;
    }
    function mul() {
      var l = pow();
      while (isOp('*') || isOp('/')) { var op = next().v; l = { t: 'bin', op: op, l: l, r: pow() }; }
      return l;
    }
    function pow() {
      var l = percent();
      while (isOp('^')) { next(); l = { t: 'bin', op: '^', l: l, r: percent() }; }
      return l;
    }
    function percent() {
      var e = unary();
      while (isOp('%')) { next(); e = { t: 'pct', e: e }; }
      return e;
    }
    function unary() {
      if (isOp('-') || isOp('+')) { var op = next().v; return { t: 'un', op: op, e: unary() }; }
      if (peek().t === 'AT') {
        var at = next();
        if (!opts.allowAt) throw new ParseError('The @ operator is not supported here', at.s);
        return { t: 'at', e: unary() };
      }
      return primary();
    }
    function primary() {
      var tk = next();
      switch (tk.t) {
        case 'NUM': return { t: 'num', v: tk.v };
        case 'STR': return { t: 'str', v: tk.v };
        case 'BOOL': return { t: 'bool', v: tk.v };
        case 'ERR': return { t: 'err', v: tk.v };
        case 'REF': {
          var node = { t: 'ref', ref: tk.ref, raw: tk.raw };
          if (tk.ref.kind === 'open' && !opts.allowOpen) throw new ParseError('Open-ended ranges like ' + tk.raw + ' are not allowed here', tk.s);
          if (peek().t === 'HASH' && peek().s === tk.e) {
            if (!opts.allowSpillRef) throw new ParseError('The # spill operator is not supported here', peek().s);
            next(); node.spill = true;
          }
          return node;
        }
        case 'NAME': return { t: 'name', name: tk.v, raw: tk.raw };
        case 'FUNC': {
          var args = [];
          if (peek().t === 'RP') { next(); return { t: 'fn', name: tk.v, args: args, raw: tk.raw }; }
          while (true) {
            if (peek().t === 'COMMA' || peek().t === 'RP') args.push({ t: 'missing' });
            else args.push(expr());
            var sep = next();
            if (sep.t === 'COMMA') continue;
            if (sep.t === 'RP') break;
            if (sep.t === 'EOF') throw new ParseError('Missing closing parenthesis ) for ' + tk.v + '(', sep.s);
            throw new ParseError('Expected , or ) in ' + tk.v + '(', sep.s);
          }
          return { t: 'fn', name: tk.v, args: args, raw: tk.raw };
        }
        case 'LP': {
          var e = expr();
          var rp = next();
          if (rp.t !== 'RP') throw new ParseError(rp.t === 'EOF' ? 'Missing closing parenthesis )' : 'Expected )', rp.s);
          return { t: 'paren', e: e };
        }
        case 'LB': {
          var rows = [[]];
          while (true) {
            var neg = false;
            if (isOp('-')) { next(); neg = true; }
            var it = next();
            var v;
            if (it.t === 'NUM') v = { t: 'num', v: neg ? -it.v : it.v };
            else if (!neg && it.t === 'STR') v = { t: 'str', v: it.v };
            else if (!neg && it.t === 'BOOL') v = { t: 'bool', v: it.v };
            else if (!neg && it.t === 'ERR') v = { t: 'err', v: it.v };
            else throw new ParseError('Array constants { } can only hold numbers, text, or TRUE/FALSE', it.s);
            rows[rows.length - 1].push(v);
            var sp = next();
            if (sp.t === 'COMMA') continue;
            if (sp.t === 'SEMI') { rows.push([]); continue; }
            if (sp.t === 'RB') break;
            throw new ParseError('Expected , ; or } in array constant', sp.s);
          }
          var w = rows[0].length;
          for (var k = 1; k < rows.length; k++) if (rows[k].length !== w) throw new ParseError('Array constant rows must be the same length', tk.s);
          return { t: 'arr', rows: rows };
        }
        case 'EOF': throw new ParseError('The formula ends too early', tk.s);
        case 'OP': throw new ParseError('Unexpected operator "' + tk.v + '"', tk.s);
        case 'RP': throw new ParseError('Unexpected )', tk.s);
        case 'COMMA': throw new ParseError('Unexpected comma', tk.s);
        default: throw new ParseError('Unexpected symbol', tk.s);
      }
    }

    var ast = expr();
    if (peek().t !== 'EOF') {
      var t = peek();
      throw new ParseError(t.t === 'RP' ? 'Too many closing parentheses )' : 'Unexpected text after the formula', t.s);
    }
    return ast;
  }

  // ---------- Printer (AST -> formula text) ----------
  function fmtNum(v) {
    if (Number.isInteger(v)) return String(v);
    return String(+v.toPrecision(15));
  }
  function print(n) {
    switch (n.t) {
      case 'num': return fmtNum(n.v);
      case 'str': return '"' + n.v.replace(/"/g, '""') + '"';
      case 'bool': return n.v ? 'TRUE' : 'FALSE';
      case 'err': return n.v;
      case 'ref': return n.raw + (n.spill ? '#' : '');
      case 'name': return n.raw || n.name;
      case 'missing': return '';
      case 'paren': return '(' + print(n.e) + ')';
      case 'un': return n.op + print(n.e);
      case 'pct': return print(n.e) + '%';
      case 'at': return '@' + print(n.e);
      case 'bin': return print(n.l) + n.op + print(n.r);
      case 'fn': return n.name + '(' + n.args.map(print).join(', ') + ')';
      case 'arr': return '{' + n.rows.map(function (r) { return r.map(print).join(','); }).join(';') + '}';
      case 'raw': return n.text;
    }
    return '?';
  }

  // ---------- Reference text + shifting (for copy/paste and fill) ----------
  function quoteSheet(s) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : "'" + s.replace(/'/g, "''") + "'"; }
  function partText(pt, kind) {
    var s = '';
    if (pt.col != null) s += (pt.ca ? '$' : '') + idxToCol(pt.col);
    if (pt.row != null) s += (pt.ra ? '$' : '') + (pt.row + 1);
    return s;
  }
  function refText(ref) {
    var s = ref.sheet != null ? quoteSheet(ref.sheet) + '!' : '';
    s += partText(ref.a, ref.kind);
    if (ref.b) s += ':' + partText(ref.b, ref.kind);
    return s;
  }
  function shiftFormula(src, dr, dc) {
    // src without '='. Returns new text; refs pushed off-grid become #REF!
    var toks;
    try { toks = lex(src); } catch (e) { return src; }
    var out = '', last = 0;
    toks.forEach(function (tk) {
      if (tk.t !== 'REF') return;
      var ref = JSON.parse(JSON.stringify(tk.ref));
      var bad = false;
      [ref.a, ref.b].forEach(function (pt) {
        if (!pt) return;
        if (pt.col != null && !pt.ca) { pt.col += dc; if (pt.col < 0) bad = true; }
        if (pt.row != null && !pt.ra) { pt.row += dr; if (pt.row < 0) bad = true; }
      });
      out += src.slice(last, tk.s) + (bad ? '#REF!' : refText(ref));
      last = tk.e;
    });
    return out + src.slice(last);
  }

  // Walk helper
  function walk(n, fn) {
    fn(n);
    if (n.args) n.args.forEach(function (a) { walk(a, fn); });
    if (n.e) walk(n.e, fn);
    if (n.l) walk(n.l, fn);
    if (n.r) walk(n.r, fn);
    if (n.t === 'arr') n.rows.forEach(function (r) { r.forEach(function (x) { walk(x, fn); }); });
  }

  SX.f = {
    XErr: XErr, isErr: isErr, Mat: Mat, Rng: Rng, MISSING: MISSING, ERR_TEXT: ERR_TEXT,
    colToIdx: colToIdx, idxToCol: idxToCol, addr: addr,
    ParseError: ParseError, lex: lex, parse: parse, print: print, fmtNum: fmtNum,
    refText: refText, shiftFormula: shiftFormula, walk: walk, quoteSheet: quoteSheet
  };
})(globalThis.SX = globalThis.SX || {});
