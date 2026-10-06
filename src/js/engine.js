/* SheetEX — evaluator, coercion rules, number/date formatting, function library.
 *
 * Platform semantics modeled here:
 *  - xl365   : dynamic arrays everywhere (formulas are always evaluated "as arrays"), results spill.
 *  - xl2013  : no dynamic arrays. A range used where ONE value is expected is reduced by
 *              implicit intersection (or #VALUE!). Ctrl+Shift+Enter makes a legacy array formula.
 *  - gs      : functions like FILTER/SORT/UNIQUE spill, but operators on ranges need ARRAYFORMULA().
 */
(function (SX) {
  'use strict';
  var F = SX.f, XErr = F.XErr, isErr = F.isErr, Mat = F.Mat, Rng = F.Rng, MISSING = F.MISSING;

  // ======================= Coercion =======================
  var NUM_TEXT_RE = /^\s*([+-])?\s*(\$)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?\s*(%)?\s*$/;
  var DATE_MDY_RE = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s*$/;
  var DATE_ISO_RE = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/;

  // Returns {v:number, fmt:'currency'|'percent'|'date'|null} or null
  function parseNumberText(s) {
    if (typeof s !== 'string') return null;
    var m = NUM_TEXT_RE.exec(s);
    if (m) {
      var v = parseFloat(m[3].replace(/,/g, '') + (m[4] ? 'e' + m[4] : ''));
      if (m[1] === '-') v = -v;
      var fmt = null;
      if (m[5]) { v = v / 100; fmt = 'percent'; } else if (m[2]) fmt = 'currency';
      return { v: v, fmt: fmt };
    }
    var d = DATE_MDY_RE.exec(s);
    if (d) {
      var y = +d[3]; if (y < 100) y += y < 30 ? 2000 : 1900;
      var mo = +d[1], da = +d[2];
      if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) return { v: serial(y, mo, da), fmt: 'date' };
    }
    d = DATE_ISO_RE.exec(s);
    if (d && +d[2] >= 1 && +d[2] <= 12 && +d[3] >= 1 && +d[3] <= 31) return { v: serial(+d[1], +d[2], +d[3]), fmt: 'date' };
    return null;
  }

  function toNum(v) {
    if (v === null || v === undefined || v === MISSING) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (isErr(v)) return v;
    if (typeof v === 'string') {
      var p = parseNumberText(v);
      if (p) return p.v;
      return new XErr('#VALUE!', 'Expected a number but got the text "' + v + '".');
    }
    return new XErr('#VALUE!');
  }
  function textOf(v) { // number -> text the way & and TEXT conversions do it (15 significant digits)
    if (Number.isInteger(v)) return String(v);
    var s = String(+v.toPrecision(15));
    if (/e/.test(s)) s = v.toExponential(14).replace(/\.?0+e/, 'E').replace('e', 'E');
    return s;
  }
  function toStr(v) {
    if (v === null || v === undefined || v === MISSING) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return textOf(v);
    if (isErr(v)) return v;
    return String(v);
  }
  function toBool(v) {
    if (v === null || v === undefined || v === MISSING) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (isErr(v)) return v;
    var u = String(v).toUpperCase();
    if (u === 'TRUE') return true;
    if (u === 'FALSE') return false;
    return new XErr('#VALUE!', 'Expected TRUE/FALSE but got the text "' + v + '".');
  }
  function typeRank(v) { return typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3; }
  // Comparison used by = < > etc.
  function cmp(a, b) {
    if (a === null || a === undefined) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
    if (b === null || b === undefined) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
    var ta = typeRank(a), tb = typeRank(b);
    if (ta !== tb) return ta - tb;
    if (ta === 1) { a = a.toLowerCase(); b = b.toLowerCase(); }
    return a < b ? -1 : a > b ? 1 : 0;
  }
  // Sort comparator: blanks always last
  function sortCmp(a, b) {
    var ab = a === null || a === '', bb = b === null || b === '';
    if (ab || bb) return ab && bb ? 0 : ab ? 1 : -1;
    if (isErr(a) || isErr(b)) return isErr(a) ? (isErr(b) ? 0 : 1) : -1;
    return cmp(a, b);
  }

  // ======================= Dates =======================
  var EPOCH = Date.UTC(1899, 11, 30);
  function serial(y, m, d) { return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / 86400000); }
  function fromSerial(s) {
    var dt = new Date(EPOCH + Math.floor(s) * 86400000);
    var frac = s - Math.floor(s);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: dt.getUTCDay(),
      secs: Math.round(frac * 86400) };
  }
  function todaySerial() { var n = new Date(); return serial(n.getFullYear(), n.getMonth() + 1, n.getDate()); }
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ======================= Formatting =======================
  function generalDisplay(v) {
    if (Number.isInteger(v) && Math.abs(v) < 1e11) return String(v);
    var a = Math.abs(v);
    if (a >= 1e11 || (a < 1e-9 && v !== 0)) {
      var e = v.toExponential(5).toUpperCase().replace(/\.?0+E/, 'E');
      return e.replace(/E([+-])(\d)$/, 'E$10$2');
    }
    return String(+v.toPrecision(10));
  }
  function addCommas(intStr) { return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function roundHalfUp(x, d) {
    var m = Math.pow(10, d);
    var r = Math.round(Math.abs(x) * m * (1 + 2 * Number.EPSILON)) / m;
    return x < 0 ? -r : r;
  }
  function fmtNumberPattern(v, code) {
    var pct = code.indexOf('%') >= 0;
    if (pct) v = v * 100;
    var first = code.search(/[0#]/), lastIdx = Math.max(code.lastIndexOf('0'), code.lastIndexOf('#'));
    if (first < 0) return code.replace(/"/g, '');
    var prefix = code.slice(0, first).replace(/["\\]/g, ''), suffix = code.slice(lastIdx + 1).replace(/["\\]/g, '');
    var core = code.slice(first, lastIdx + 1);
    var dot = core.indexOf('.');
    var dec = dot >= 0 ? core.slice(dot + 1).replace(/[^0#]/g, '').length : 0;
    var minDec = dot >= 0 ? core.slice(dot + 1).replace(/[^0]/g, '').length : 0;
    var commas = core.indexOf(',') >= 0;
    var neg = v < 0;
    var r = roundHalfUp(Math.abs(v), dec);
    var s = r.toFixed(dec);
    if (dec > minDec) { // trim optional '#' decimals
      var parts = s.split('.');
      var frac = parts[1].replace(/0+$/, '');
      while (frac.length < minDec) frac += '0';
      s = parts[0] + (frac.length ? '.' + frac : '');
    }
    var ip = s.split('.')[0], fp = s.split('.')[1];
    var intPart = core.slice(0, dot >= 0 ? dot : core.length);
    if (ip === '0' && intPart.indexOf('0') < 0) ip = '';
    if (commas) ip = addCommas(ip);
    s = ip + (fp !== undefined ? '.' + fp : '');
    return (neg && r !== 0 ? '-' : '') + prefix + s + suffix;
  }
  function isDateCode(code) { return /[yd]/i.test(code.replace(/"[^"]*"/g, '')) || /^[^0#]*m[^0#]*$/i.test(code.replace(/"[^"]*"/g, '')) && /m/i.test(code); }
  function fmtDatePattern(v, code) {
    var p = fromSerial(v);
    var out = '', i = 0, hasAmPm = /AM\/PM/i.test(code), prevHour = false;
    var hrs = Math.floor(p.secs / 3600), mins = Math.floor(p.secs / 60) % 60, secs = p.secs % 60;
    while (i < code.length) {
      var rest = code.slice(i), m;
      if (rest[0] === '"') { var j = code.indexOf('"', i + 1); out += code.slice(i + 1, j < 0 ? code.length : j); i = j < 0 ? code.length : j + 1; continue; }
      if ((m = /^(yyyy|yy)/i.exec(rest))) { out += m[1].length === 4 ? p.y : String(p.y).slice(-2); i += m[1].length; continue; }
      if ((m = /^(mmmm|mmm|mm|m)/i.exec(rest))) {
        var L = m[1].length;
        if (prevHour && L <= 2) out += L === 2 ? ('0' + mins).slice(-2) : mins;
        else out += L === 4 ? MONTHS[p.m - 1] : L === 3 ? MONTHS[p.m - 1].slice(0, 3) : L === 2 ? ('0' + p.m).slice(-2) : p.m;
        i += L; prevHour = false; continue;
      }
      if ((m = /^(dddd|ddd|dd|d)/i.exec(rest))) {
        var D = m[1].length;
        out += D === 4 ? DAYS[p.wd] : D === 3 ? DAYS[p.wd].slice(0, 3) : D === 2 ? ('0' + p.d).slice(-2) : p.d;
        i += D; continue;
      }
      if ((m = /^(hh|h)/i.exec(rest))) {
        var h = hasAmPm ? (hrs % 12 || 12) : hrs;
        out += m[1].length === 2 ? ('0' + h).slice(-2) : h; i += m[1].length; prevHour = true; continue;
      }
      if ((m = /^(ss|s)/i.exec(rest))) { out += m[1].length === 2 ? ('0' + secs).slice(-2) : secs; i += m[1].length; continue; }
      if (/^AM\/PM/i.test(rest)) { out += hrs < 12 ? 'AM' : 'PM'; i += 5; continue; }
      out += rest[0]; i++;
    }
    return out;
  }
  // TEXT(value, format_text)
  function formatWithCode(v, code) {
    if (typeof v !== 'number') return toStr(v);
    if (/^general$/i.test(code) || code === '') return generalDisplay(v);
    if (isDateCode(code) && !/[0#]/.test(code)) return fmtDatePattern(v, code);
    return fmtNumberPattern(v, code);
  }
  var FORMATS = {
    general: null,
    currency: '$#,##0.00',
    number: '#,##0.00',
    integer: '#,##0',
    percent: '0.0%',
    date: 'm/d/yyyy'
  };
  function displayValue(v, fmt) {
    if (v === null || v === undefined) return '';
    if (isErr(v)) return v.code;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') {
      if (!isFinite(v)) return '#NUM!';
      if (fmt && FORMATS[fmt]) return formatWithCode(v, FORMATS[fmt]);
      return generalDisplay(v);
    }
    return String(v);
  }

  // ======================= Criteria (SUMIF / COUNTIF ...) =======================
  function wildcardRe(s) {
    var re = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '~' && i + 1 < s.length) { re += s[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
      if (c === '*') re += '[\\s\\S]*';
      else if (c === '?') re += '[\\s\\S]';
      else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp('^' + re + '$', 'i');
  }
  function hasWild(s) { return /[*?~]/.test(s); }
  function makeCriterion(crit) {
    if (crit === null || crit === undefined || crit === MISSING) return function (v) { return v === null || v === ''; };
    if (typeof crit === 'number' || typeof crit === 'boolean') {
      return function (v) {
        if (typeof v === 'string') { var p = parseNumberText(v); return p ? p.v === crit : false; }
        return v === crit;
      };
    }
    var s = String(crit), op = '=';
    var m = /^(<=|>=|<>|=|<|>)([\s\S]*)$/.exec(s);
    if (m) { op = m[1]; s = m[2]; }
    var num = parseNumberText(s);
    var up = s.toUpperCase();
    var target = num ? num.v : (up === 'TRUE' ? true : up === 'FALSE' ? false : s);
    if (op === '=' || op === '<>') {
      var neg = op === '<>';
      var test;
      if (s === '') test = function (v) { return v === null || v === ''; };
      else if (typeof target === 'string') {
        var re = hasWild(s) ? wildcardRe(s) : null, low = s.toLowerCase();
        test = function (v) { return typeof v === 'string' && (re ? re.test(v) : v.toLowerCase() === low); };
      } else test = function (v) { return v === target; };
      return neg ? function (v) { return !test(v); } : test;
    }
    return function (v) {
      if (v === null || v === '') return false;
      if (typeRank(v) !== typeRank(target)) return false;
      var c = cmp(v, target);
      return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
    };
  }

  // ======================= Array helpers =======================
  function dims(v) {
    if (v instanceof Rng || v instanceof Mat) return { h: v.h(), w: v.w() };
    return { h: 1, w: 1 };
  }
  function at(v, i, j, ctx) {
    if (v instanceof Rng) return ctx.wb.getValue(v.sheet, v.r1 + i, v.c1 + j);
    if (v instanceof Mat) return v.rows[i][j];
    return v;
  }
  function toMat(v, ctx) {
    if (v instanceof Mat) return v;
    if (v instanceof Rng) {
      var rows = [];
      for (var r = v.r1; r <= v.r2; r++) {
        var row = [];
        for (var c = v.c1; c <= v.c2; c++) row.push(ctx.wb.getValue(v.sheet, r, c));
        rows.push(row);
      }
      return new Mat(rows);
    }
    return new Mat([[v === MISSING ? null : v]]);
  }
  function each(v, ctx, cb) {
    var d = dims(v);
    for (var i = 0; i < d.h; i++) for (var j = 0; j < d.w; j++) cb(at(v, i, j, ctx), i, j);
  }
  function flat(v, ctx) { var out = []; each(v, ctx, function (x) { out.push(x); }); return out; }
  function scalarIfSingle(m) { return m instanceof Mat && m.h() === 1 && m.w() === 1 ? m.rows[0][0] : m; }

  function arrayHint(ctx) {
    if (ctx.plat.id === 'gs') return ' In Google Sheets, wrap the formula in ARRAYFORMULA( ) to work with whole ranges.';
    if (ctx.plat.id === 'xl2013') return ' In Excel 2013, finish an array formula with Ctrl+Shift+Enter.';
    return '';
  }
  function intersect(r, ctx) {
    if (r.h() === 1 && r.w() === 1) return ctx.wb.getValue(r.sheet, r.r1, r.c1);
    if (r.w() === 1 && ctx.row >= r.r1 && ctx.row <= r.r2) return ctx.wb.getValue(r.sheet, ctx.row, r.c1);
    if (r.h() === 1 && ctx.col >= r.c1 && ctx.col <= r.c2) return ctx.wb.getValue(r.sheet, r.r1, ctx.col);
    return new XErr('#VALUE!', 'A whole range was used where only one value was expected.' + arrayHint(ctx));
  }
  // Reduce to what a "single value" parameter receives.
  function asV(v, ctx) {
    if (v === MISSING) return v;
    if (v instanceof Rng) {
      if (ctx.arr) return scalarIfSingle(toMat(v, ctx));
      return intersect(v, ctx);
    }
    if (v instanceof Mat) {
      if (ctx.arr) return scalarIfSingle(v);
      return v.rows[0][0];
    }
    return v;
  }
  function bget(m, i, j) {
    if (!(m instanceof Mat)) return m;
    var h = m.h(), w = m.w();
    if (h === 1 && w === 1) return m.rows[0][0];
    var ii = h === 1 ? 0 : i, jj = w === 1 ? 0 : j;
    if (ii >= h || jj >= w) return new XErr('#N/A', 'The arrays are different sizes.');
    return m.rows[ii][jj];
  }
  function broadcast(list, f) {
    var H = 1, W = 1, any = false;
    list.forEach(function (m) { if (m instanceof Mat) { any = true; H = Math.max(H, m.h()); W = Math.max(W, m.w()); } });
    if (!any) return f.apply(null, list);
    var rows = [];
    for (var i = 0; i < H; i++) {
      var row = [];
      for (var j = 0; j < W; j++) {
        var r = f.apply(null, list.map(function (m) { return bget(m, i, j); }));
        if (r instanceof Mat || r instanceof Rng) r = r instanceof Mat ? r.rows[0][0] : null;
        row.push(r);
      }
      rows.push(row);
    }
    return new Mat(rows);
  }

  // ======================= Evaluator =======================
  function sub(ctx, o) { var n = {}; for (var k in ctx) n[k] = ctx[k]; for (var k2 in o) n[k2] = o[k2]; return n; }

  function refToRng(n, ctx) {
    var ref = n.ref;
    var sheet = ref.sheet != null ? ctx.wb.sheetName(ref.sheet) : ctx.sheet;
    if (!sheet) {
      return ctx.plat.style === 'sheets'
        ? new XErr('#REF!', "Unresolved sheet name '" + ref.sheet + "'.")
        : new XErr('#REF!', 'There is no sheet named "' + ref.sheet + '".');
    }
    if (n.spill) {
      var sr = ctx.wb.spillRange(sheet, ref.a.row, ref.a.col);
      return sr || new XErr('#REF!', F.addr(ref.a.row, ref.a.col) + '# only works when ' + F.addr(ref.a.row, ref.a.col) + ' holds a spilling formula.');
    }
    var a = ref.a, b = ref.b;
    switch (ref.kind) {
      case 'cell': return new Rng(sheet, a.row, a.col, a.row, a.col);
      case 'range': return new Rng(sheet, Math.min(a.row, b.row), Math.min(a.col, b.col), Math.max(a.row, b.row), Math.max(a.col, b.col));
      case 'cols': return new Rng(sheet, 0, Math.min(a.col, b.col), Math.max(ctx.wb.maxRow(sheet), 0), Math.max(a.col, b.col));
      case 'rows': return new Rng(sheet, Math.min(a.row, b.row), 0, Math.max(a.row, b.row), Math.max(ctx.wb.maxCol(sheet), 0));
      case 'open': return new Rng(sheet, a.row, Math.min(a.col, b.col), Math.max(ctx.wb.maxRow(sheet), a.row), Math.max(a.col, b.col));
    }
    return new XErr('#REF!');
  }

  function arith(op) {
    return function (a, b) {
      if (isErr(a)) return a; if (isErr(b)) return b;
      var x = toNum(a); if (isErr(x)) return x;
      var y = toNum(b); if (isErr(y)) return y;
      var r;
      switch (op) {
        case '+': r = x + y; break;
        case '-': r = x - y; break;
        case '*': r = x * y; break;
        case '/': if (y === 0) return new XErr('#DIV/0!', 'Dividing by zero (or by an empty cell).'); r = x / y; break;
        case '^': if (x === 0 && y === 0) return new XErr('#NUM!'); r = Math.pow(x, y); break;
      }
      if (!isFinite(r)) return new XErr('#NUM!', 'The result is too large or not a real number.');
      return r;
    };
  }
  function compareOp(op) {
    return function (a, b) {
      if (isErr(a)) return a; if (isErr(b)) return b;
      var c = cmp(a, b);
      switch (op) {
        case '=': return c === 0; case '<>': return c !== 0;
        case '<': return c < 0; case '>': return c > 0;
        case '<=': return c <= 0; case '>=': return c >= 0;
      }
    };
  }
  function concatOp(a, b) {
    if (isErr(a)) return a; if (isErr(b)) return b;
    return toStr(a) + toStr(b);
  }

  function evalNode(n, ctx) {
    switch (n.t) {
      case 'num': case 'str': case 'bool': return n.v;
      case 'err': return new XErr(n.v);
      case 'missing': return MISSING;
      case 'paren': return evalNode(n.e, ctx);
      case 'ref': return refToRng(n, ctx);
      case 'name': {
        for (var s = ctx.scope; s; s = s.parent) if (s.vars.hasOwnProperty(n.name)) return s.vars[n.name];
        return ctx.plat.style === 'sheets'
          ? new XErr('#NAME?', "Unknown range name: '" + (n.raw || n.name) + "'.")
          : new XErr('#NAME?', 'Excel does not recognize "' + (n.raw || n.name) + '". Text must be in "double quotes", and names must be defined.');
      }
      case 'arr': return new Mat(n.rows.map(function (r) { return r.map(function (x) { return x.t === 'err' ? new XErr(x.v) : x.v; }); }));
      case 'un': {
        var v = asV(evalNode(n.e, ctx), ctx);
        if (n.op === '+') return v;
        return broadcast([v], function (x) { if (isErr(x)) return x; var y = toNum(x); return isErr(y) ? y : -y; });
      }
      case 'pct': {
        var pv = asV(evalNode(n.e, ctx), ctx);
        return broadcast([pv], function (x) { if (isErr(x)) return x; var y = toNum(x); return isErr(y) ? y : y / 100; });
      }
      case 'at': {
        var av = evalNode(n.e, sub(ctx, { arr: false }));
        if (av instanceof Rng) return intersect(av, ctx);
        if (av instanceof Mat) return av.rows[0][0];
        return av;
      }
      case 'bin': {
        var l = asV(evalNode(n.l, ctx), ctx), r = asV(evalNode(n.r, ctx), ctx);
        var f = n.op === '&' ? concatOp : '+-*/^'.indexOf(n.op) >= 0 ? arith(n.op) : compareOp(n.op);
        return broadcast([l, r], f);
      }
      case 'fn': return callFn(n, ctx);
    }
    return new XErr('#VALUE!');
  }

  // ---------- function registry ----------
  var FN = {};
  var MODERN = ['xl365', 'gs'];
  var ONLY_GS = ['gs'];
  function def(name, o) { o.name = name; FN[name] = o; }

  function platDef(d, plat) {
    var o = d[plat.id] || (plat.style === 'sheets' ? d.sheets : d.excel);
    if (!o) return d;
    var m = {}; for (var k in d) m[k] = d[k]; for (var k2 in o) m[k2] = o[k2];
    return m;
  }
  function available(name, plat) {
    var d = FN[name];
    if (!d) return false;
    return !d.on || d.on.indexOf(plat.id) >= 0;
  }
  function kindAt(d, i) {
    var a = d.args || '';
    if (i < a.length) return a[i];
    if (d.rep) { var r = d.rep; return a[a.length - r + ((i - a.length) % r)]; }
    return a.length ? a[a.length - 1] : 'v';
  }
  function argCountMsg(name, d, cnt, plat) {
    if (plat.style === 'sheets') {
      var exp = d.max == null ? 'at least ' + d.min : d.min === d.max ? d.min : 'between ' + d.min + ' and ' + d.max;
      return 'Wrong number of arguments to ' + name + '. Expected ' + exp + ' argument' + (d.min === 1 && d.max === 1 ? '' : 's') + ', but received ' + cnt + ' argument' + (cnt === 1 ? '' : 's') + '.';
    }
    return cnt < d.min ? "You've entered too few arguments for " + name + '.' : "You've entered too many arguments for " + name + '.';
  }
  function unknownFn(name, ctx) {
    var d = FN[name];
    if (ctx.plat.style === 'sheets') return new XErr('#NAME?', "Unknown function: '" + name + "'.");
    var msg = 'Excel does not recognize the function ' + name + '.';
    if (d && ctx.plat.id === 'xl2013') msg = name + ' does not exist in Excel 2013 — it was added in a later version. (If you open a newer file in 2013 you will see _xlfn.' + name + '.)';
    else if (d && d.on && d.on.indexOf('xl365') < 0) msg = name + ' is a Google Sheets function. Excel does not have it.';
    return new XErr('#NAME?', msg);
  }

  function callFn(n, ctx) {
    var name = n.name;
    if (!available(name, ctx.plat)) return unknownFn(name, ctx);
    var d = platDef(FN[name], ctx.plat);
    var cnt = n.args.length;
    if (cnt < d.min || (d.max != null && cnt > d.max)) return new XErr(ctx.plat.style === 'sheets' ? '#N/A' : '#VALUE!', argCountMsg(name, d, cnt, ctx.plat));
    if (d.special) return d.special(n.args, ctx);
    var vals = [], lift = false;
    for (var i = 0; i < cnt; i++) {
      var node = n.args[i], k = kindAt(d, i), v;
      if (node.t === 'missing') { vals.push(MISSING); continue; }
      v = evalNode(node, k === 'a' ? sub(ctx, { arr: true }) : ctx);
      if (k === 'v') {
        v = asV(v, ctx);
        if (v instanceof Mat) lift = true;
      }
      vals.push(v);
    }
    if (lift && d.lift !== false) {
      return broadcast(vals, function () { return runImpl(d, Array.prototype.slice.call(arguments), ctx); });
    }
    return runImpl(d, vals, ctx);
  }
  function runImpl(d, vals, ctx) {
    if (!d.passErr) {
      for (var i = 0; i < vals.length; i++) if (kindAt(d, i) === 'v' && isErr(vals[i])) return vals[i];
    }
    var r = d.fn(vals, ctx);
    if (typeof r === 'number' && !isFinite(r)) return new XErr('#NUM!');
    return r;
  }

  // ---------- helpers used by implementations ----------
  function num(v) { return toNum(v === MISSING ? null : v); }
  function opt(v, dflt) { return v === MISSING || v === undefined ? dflt : v; }
  function collectNums(vals, ctx, opts) {
    // Range/array args: numbers only. Direct scalar args: coerced.
    opts = opts || {};
    var out = [];
    for (var i = 0; i < vals.length; i++) {
      var v = vals[i];
      if (v === MISSING) continue;
      if (v instanceof Rng || v instanceof Mat) {
        var list = flat(v, ctx);
        for (var j = 0; j < list.length; j++) {
          var x = list[j];
          if (isErr(x)) return x;
          if (typeof x === 'number') out.push(x);
          else if (opts.countText && x !== null) out.push(typeof x === 'boolean' ? (x ? 1 : 0) : 0);
        }
      } else {
        if (isErr(v)) return v;
        var y = toNum(v);
        if (isErr(y)) return y;
        out.push(y);
      }
    }
    return out;
  }
  function needRangeLike(v, what) {
    if (v instanceof Rng || v instanceof Mat) return null;
    return new XErr('#VALUE!', what + ' must be a range of cells.');
  }
  function lookupEq(a, b, wild) {
    if (typeof a === 'string' && typeof b === 'string') {
      if (wild && hasWild(a)) return wildcardRe(a).test(b);
      return a.toLowerCase() === b.toLowerCase();
    }
    if (a === null) a = 0;
    return typeRank(a) === typeRank(b) && a === b;
  }
  function approxIndex(list, x, desc) {
    // Binary search exactly like spreadsheets do it (so unsorted data gives the classic "wrong" answer).
    var lo = 0, hi = list.length - 1, ans = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1, v = list[mid];
      var c = (v === null || typeRank(v) !== typeRank(x)) ? (desc ? -1 : 1) * (typeRank(v === null ? 0 : v) - typeRank(x) || 1) : cmp(v, x);
      if (!desc ? c <= 0 : c >= 0) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }
  function vec(v, ctx) { // 1-D vector from range/array (or null if 2-D)
    var d = dims(v);
    if (d.h !== 1 && d.w !== 1) return null;
    return flat(v, ctx);
  }
  function notFound(name, x, ctx) {
    if (ctx.plat.style === 'sheets') return new XErr('#N/A', "Did not find value '" + toStr(x) + "' in " + name + ' evaluation.');
    return new XErr('#N/A', name + ' could not find "' + toStr(x) + '".');
  }
  function sliceRow(v, i, ctx) {
    var d = dims(v), row = [];
    for (var j = 0; j < d.w; j++) row.push(at(v, i, j, ctx));
    return row;
  }
  function sliceCol(v, j, ctx) {
    var d = dims(v), col = [];
    for (var i = 0; i < d.h; i++) col.push(at(v, i, j, ctx));
    return col;
  }

  // --- Lazy forms ---
  function evalV(node, ctx) { return node.t === 'missing' ? MISSING : asV(evalNode(node, ctx), ctx); }
  function eagerPairs(args, ctx, pick) {
    var vals = args.map(function (a) { return evalV(a, ctx); });
    return broadcast(vals, function () { return pick(Array.prototype.slice.call(arguments)); });
  }

  def('IF', { min: 2, max: 3, cat: 'Logical', sig: 'IF(logical_test, [value_if_true], [value_if_false])',
    desc: 'Returns one value if a test is TRUE and another if it is FALSE.',
    special: function (args, ctx) {
      var c = evalV(args[0], ctx);
      function br(i, cond) {
        if (args.length <= i) return i === 1 ? true : false;
        if (args[i].t === 'missing') return 0;
        return null;
      }
      if (c instanceof Mat) {
        var t = args.length > 1 && args[1].t !== 'missing' ? evalV(args[1], ctx) : (args.length > 1 ? 0 : true);
        var f = args.length > 2 && args[2].t !== 'missing' ? evalV(args[2], ctx) : (args.length > 2 ? 0 : false);
        return broadcast([c, t, f], function (cc, tt, ff) {
          if (isErr(cc)) return cc; var b = toBool(cc); if (isErr(b)) return b; return b ? tt : ff;
        });
      }
      if (isErr(c)) return c;
      var b = toBool(c); if (isErr(b)) return b;
      var idx = b ? 1 : 2, d = br(idx);
      if (d !== null) return d;
      return evalNode(args[idx], ctx);
    } });
  def('IFERROR', { min: 2, max: 2, cat: 'Logical', sig: 'IFERROR(value, value_if_error)',
    desc: 'Returns value_if_error if the first value is any error; otherwise the value.',
    special: function (args, ctx) {
      var v = evalV(args[0], ctx);
      if (v instanceof Mat) {
        var alt = evalV(args[1], ctx);
        return broadcast([v, alt], function (x, a) { return isErr(x) ? (a === MISSING ? '' : a) : x; });
      }
      if (isErr(v)) { var a2 = evalV(args[1], ctx); return a2 === MISSING ? '' : a2; }
      return v === null ? 0 : v;
    } });
  def('IFNA', { min: 2, max: 2, cat: 'Logical', sig: 'IFNA(value, value_if_na)',
    desc: 'Like IFERROR, but only catches #N/A (lookup not found).',
    special: function (args, ctx) {
      var v = evalV(args[0], ctx);
      if (v instanceof Mat) {
        var alt = evalV(args[1], ctx);
        return broadcast([v, alt], function (x, a) { return isErr(x) && x.code === '#N/A' ? a : x; });
      }
      if (isErr(v) && v.code === '#N/A') return evalV(args[1], ctx);
      return v === null ? 0 : v;
    } });
  def('IFS', { on: MODERN, min: 2, cat: 'Logical', sig: 'IFS(test1, value1, [test2, value2], ...)',
    desc: 'Checks tests in order and returns the value for the first TRUE test. Replaces nested IFs.',
    special: function (args, ctx) {
      if (args.length % 2) return new XErr(ctx.plat.style === 'sheets' ? '#N/A' : '#VALUE!', 'IFS needs pairs of test, value.');
      var conds = [];
      for (var i = 0; i < args.length; i += 2) {
        var c = evalV(args[i], ctx);
        if (c instanceof Mat) {
          return eagerPairs(args, ctx, function (v) {
            for (var k = 0; k < v.length; k += 2) { if (isErr(v[k])) return v[k]; var b = toBool(v[k]); if (isErr(b)) return b; if (b) return v[k + 1]; }
            return new XErr('#N/A', 'No test in IFS was TRUE.');
          });
        }
        if (isErr(c)) return c;
        var b = toBool(c); if (isErr(b)) return b;
        if (b) return evalNode(args[i + 1], ctx);
      }
      return new XErr('#N/A', ctx.plat.style === 'sheets' ? 'IFS has no matching condition.' : 'No test in IFS was TRUE. Add a final TRUE, "default" pair.');
    } });
  def('SWITCH', { on: MODERN, min: 3, cat: 'Logical', sig: 'SWITCH(expression, case1, value1, [case2, value2], ..., [default])',
    desc: 'Compares one value against a list of cases and returns the matching result.',
    special: function (args, ctx) {
      var x = evalV(args[0], ctx);
      if (x instanceof Mat) return eagerPairs(args, ctx, function (v) {
        for (var k = 1; k + 1 < v.length; k += 2) if (cmp(v[0], v[k]) === 0) return v[k + 1];
        return v.length % 2 === 0 ? v[v.length - 1] : new XErr('#N/A', 'No case matched in SWITCH.');
      });
      if (isErr(x)) return x;
      for (var i = 1; i + 1 < args.length; i += 2) {
        var c = evalV(args[i], ctx);
        if (isErr(c)) return c;
        if (cmp(x, c) === 0) return evalNode(args[i + 1], ctx);
      }
      if (args.length % 2 === 0) return evalNode(args[args.length - 1], ctx);
      return new XErr('#N/A', 'No case matched in SWITCH.');
    } });
  def('CHOOSE', { min: 2, cat: 'Lookup', sig: 'CHOOSE(index_num, value1, [value2], ...)',
    desc: 'Picks a value from a list by its position number.',
    special: function (args, ctx) {
      var i = evalV(args[0], ctx);
      if (i instanceof Mat) return eagerPairs(args, ctx, function (v) {
        var k = Math.floor(toNum(v[0])); return k >= 1 && k < v.length ? v[k] : new XErr('#VALUE!');
      });
      if (isErr(i)) return i;
      var k = toNum(i); if (isErr(k)) return k; k = Math.floor(k);
      if (k < 1 || k >= args.length) return new XErr('#VALUE!', 'CHOOSE index is out of range.');
      return evalNode(args[k], ctx);
    } });
  def('LET', { on: MODERN, min: 3, cat: 'Logical', sig: 'LET(name1, value1, [name2, value2, ...], calculation)',
    desc: 'Gives names to values so a long formula is easier to read and calculates once.',
    special: function (args, ctx) {
      if (args.length % 2 === 0) return new XErr('#VALUE!', 'LET needs name/value pairs followed by a final calculation.');
      var scope = { vars: {}, parent: ctx.scope };
      var c2 = sub(ctx, { scope: scope });
      for (var i = 0; i + 1 < args.length; i += 2) {
        if (args[i].t !== 'name') return new XErr('#NAME?', 'LET names must be plain words like total or price (not cell addresses).');
        scope.vars[args[i].name] = evalNode(args[i + 1], c2);
      }
      return evalNode(args[args.length - 1], c2);
    } });
  def('ARRAYFORMULA', { on: ONLY_GS, min: 1, max: 1, cat: 'Array', sig: 'ARRAYFORMULA(array_formula)',
    desc: 'Google Sheets: lets normal operators and functions work on whole ranges and spill the results.',
    special: function (args, ctx) { return evalNode(args[0], sub(ctx, { arr: true })); } });

  // --- Logical ---
  function boolsOf(vals, ctx) {
    var out = [];
    for (var i = 0; i < vals.length; i++) {
      var v = vals[i];
      if (v === MISSING) continue;
      if (v instanceof Rng || v instanceof Mat) {
        var l = flat(v, ctx);
        for (var j = 0; j < l.length; j++) {
          if (isErr(l[j])) return l[j];
          if (typeof l[j] === 'boolean') out.push(l[j]); else if (typeof l[j] === 'number') out.push(l[j] !== 0);
        }
      } else { var b = toBool(v); if (isErr(b)) return b; out.push(b); }
    }
    if (!out.length) return new XErr('#VALUE!', 'No TRUE/FALSE values were found.');
    return out;
  }
  def('AND', { min: 1, args: 'r', cat: 'Logical', sig: 'AND(logical1, [logical2], ...)', desc: 'TRUE only if every test is TRUE.',
    fn: function (v, ctx) { var b = boolsOf(v, ctx); return isErr(b) ? b : b.every(Boolean); } });
  def('OR', { min: 1, args: 'r', cat: 'Logical', sig: 'OR(logical1, [logical2], ...)', desc: 'TRUE if any test is TRUE.',
    fn: function (v, ctx) { var b = boolsOf(v, ctx); return isErr(b) ? b : b.some(Boolean); } });
  def('XOR', { min: 1, args: 'r', cat: 'Logical', sig: 'XOR(logical1, [logical2], ...)', desc: 'TRUE if an odd number of tests are TRUE.',
    fn: function (v, ctx) { var b = boolsOf(v, ctx); return isErr(b) ? b : b.filter(Boolean).length % 2 === 1; } });
  def('NOT', { min: 1, max: 1, args: 'v', cat: 'Logical', sig: 'NOT(logical)', desc: 'Flips TRUE to FALSE and FALSE to TRUE.',
    fn: function (v) { var b = toBool(v[0]); return isErr(b) ? b : !b; } });
  def('TRUE', { min: 0, max: 0, cat: 'Logical', sig: 'TRUE()', desc: 'The value TRUE.', fn: function () { return true; } });
  def('FALSE', { min: 0, max: 0, cat: 'Logical', sig: 'FALSE()', desc: 'The value FALSE.', fn: function () { return false; } });

  // --- Math / stats ---
  function aggr(name, sig, desc, f, opts) {
    def(name, { min: 1, args: 'r', cat: 'Math', sig: sig, desc: desc,
      fn: function (v, ctx) { var n = collectNums(v, ctx, opts); return isErr(n) ? n : f(n); } });
  }
  aggr('SUM', 'SUM(number1, [number2], ...)', 'Adds numbers.', function (n) { return n.reduce(function (a, b) { return a + b; }, 0); });
  aggr('AVERAGE', 'AVERAGE(number1, [number2], ...)', 'Arithmetic mean of numbers.', function (n) {
    return n.length ? n.reduce(function (a, b) { return a + b; }, 0) / n.length : new XErr('#DIV/0!', 'AVERAGE found no numbers.');
  });
  aggr('MIN', 'MIN(number1, [number2], ...)', 'Smallest number.', function (n) { return n.length ? Math.min.apply(null, n) : 0; });
  aggr('MAX', 'MAX(number1, [number2], ...)', 'Largest number.', function (n) { return n.length ? Math.max.apply(null, n) : 0; });
  aggr('PRODUCT', 'PRODUCT(number1, [number2], ...)', 'Multiplies numbers.', function (n) { return n.length ? n.reduce(function (a, b) { return a * b; }, 1) : 0; });
  aggr('MEDIAN', 'MEDIAN(number1, [number2], ...)', 'Middle value.', function (n) {
    if (!n.length) return new XErr('#NUM!'); n = n.slice().sort(function (a, b) { return a - b; });
    var m = n.length >> 1; return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2;
  });
  function mode(n) {
    var counts = {}, best = null, bc = 1;
    n.forEach(function (x) { counts[x] = (counts[x] || 0) + 1; if (counts[x] > bc) { bc = counts[x]; best = x; } });
    return best === null ? new XErr('#N/A', 'No value appears more than once.') : best;
  }
  aggr('MODE', 'MODE(number1, [number2], ...)', 'Most common number.', mode);
  aggr('MODE.SNGL', 'MODE.SNGL(number1, [number2], ...)', 'Most common number.', mode);
  function stdev(n) {
    if (n.length < 2) return new XErr('#DIV/0!');
    var m = n.reduce(function (a, b) { return a + b; }, 0) / n.length;
    return Math.sqrt(n.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (n.length - 1));
  }
  aggr('STDEV', 'STDEV(number1, [number2], ...)', 'Sample standard deviation.', stdev);
  aggr('STDEV.S', 'STDEV.S(number1, [number2], ...)', 'Sample standard deviation.', stdev);
  def('COUNT', { min: 1, args: 'r', cat: 'Math', sig: 'COUNT(value1, [value2], ...)', desc: 'Counts cells that contain numbers.',
    fn: function (v, ctx) {
      var c = 0;
      v.forEach(function (x) {
        if (x === MISSING) return;
        if (x instanceof Rng || x instanceof Mat) flat(x, ctx).forEach(function (y) { if (typeof y === 'number') c++; });
        else if (typeof x === 'number' || typeof x === 'boolean' || (typeof x === 'string' && parseNumberText(x))) c++;
      });
      return c;
    } });
  def('COUNTA', { min: 1, args: 'r', cat: 'Math', sig: 'COUNTA(value1, [value2], ...)', desc: 'Counts cells that are not empty.',
    fn: function (v, ctx) {
      var c = 0;
      v.forEach(function (x) {
        if (x === MISSING) return;
        if (x instanceof Rng || x instanceof Mat) flat(x, ctx).forEach(function (y) { if (y !== null) c++; });
        else c++;
      });
      return c;
    } });
  def('COUNTBLANK', { min: 1, max: 1, args: 'r', cat: 'Math', sig: 'COUNTBLANK(range)', desc: 'Counts empty cells.',
    fn: function (v, ctx) { return flat(v[0], ctx).filter(function (y) { return y === null || y === ''; }).length; } });
  def('SUMPRODUCT', { min: 1, args: 'a', cat: 'Math', sig: 'SUMPRODUCT(array1, [array2], ...)',
    desc: 'Multiplies arrays item-by-item and adds the results. Works with arrays without Ctrl+Shift+Enter!',
    fn: function (v, ctx) {
      var d0 = dims(v[0]);
      for (var i = 1; i < v.length; i++) { var d = dims(v[i]); if (d.h !== d0.h || d.w !== d0.w) return new XErr('#VALUE!', 'SUMPRODUCT arrays must be the same size.'); }
      var total = 0;
      for (var r = 0; r < d0.h; r++) for (var c = 0; c < d0.w; c++) {
        var p = 1;
        for (var k = 0; k < v.length; k++) {
          var x = at(v[k], r, c, ctx);
          if (isErr(x)) return x;
          p *= typeof x === 'number' ? x : 0;
        }
        total += p;
      }
      return total;
    } });
  function math1(name, sig, desc, f, cat) {
    def(name, { min: 1, max: 1, args: 'v', cat: cat || 'Math', sig: sig, desc: desc,
      fn: function (v) { var x = num(v[0]); return isErr(x) ? x : f(x); } });
  }
  math1('ABS', 'ABS(number)', 'Absolute value.', Math.abs);
  math1('INT', 'INT(number)', 'Rounds down to the nearest whole number.', Math.floor);
  math1('SQRT', 'SQRT(number)', 'Square root.', function (x) { return x < 0 ? new XErr('#NUM!') : Math.sqrt(x); });
  def('PI', { min: 0, max: 0, cat: 'Math', sig: 'PI()', desc: '3.14159…', fn: function () { return Math.PI; } });
  function roundFn(name, mode) {
    def(name, { min: 2, max: 2, args: 'vv', cat: 'Math', sig: name + '(number, num_digits)',
      desc: mode === 0 ? 'Rounds to a number of digits.' : mode > 0 ? 'Rounds away from zero.' : 'Rounds toward zero.',
      fn: function (v) {
        var x = num(v[0]), d = num(v[1]); if (isErr(x)) return x; if (isErr(d)) return d;
        d = Math.trunc(d);
        var m = Math.pow(10, d), a = Math.abs(x) * m, r;
        if (mode === 0) r = Math.round(a * (1 + 2 * Number.EPSILON));
        else if (mode > 0) r = Math.ceil(a * (1 - 2 * Number.EPSILON));
        else r = Math.floor(a * (1 + 2 * Number.EPSILON));
        r = r / m; return x < 0 ? -r : r;
      } });
  }
  roundFn('ROUND', 0); roundFn('ROUNDUP', 1); roundFn('ROUNDDOWN', -1);
  def('TRUNC', { min: 1, max: 2, args: 'vv', cat: 'Math', sig: 'TRUNC(number, [num_digits])', desc: 'Chops off decimals.',
    fn: function (v) { var x = num(v[0]), d = num(opt(v[1], 0)); if (isErr(x)) return x; var m = Math.pow(10, d); return Math.trunc(x * m) / m; } });
  def('MOD', { min: 2, max: 2, args: 'vv', cat: 'Math', sig: 'MOD(number, divisor)', desc: 'Remainder after division.',
    fn: function (v) { var x = num(v[0]), d = num(v[1]); if (isErr(x)) return x; if (isErr(d)) return d;
      if (d === 0) return new XErr('#DIV/0!'); return x - d * Math.floor(x / d); } });
  def('POWER', { min: 2, max: 2, args: 'vv', cat: 'Math', sig: 'POWER(number, power)', desc: 'Raises a number to a power.',
    fn: function (v) { return arith('^')(v[0], v[1]); } });
  def('CEILING', { min: 2, max: 2, args: 'vv', cat: 'Math', sig: 'CEILING(number, significance)', desc: 'Rounds up to a multiple.',
    sheets: { min: 1, sig: 'CEILING(value, [factor])' },
    fn: function (v) { var x = num(v[0]), s = num(opt(v[1], 1)); if (isErr(x)) return x; if (isErr(s)) return s; if (s === 0) return 0; return Math.ceil(x / s - 1e-12) * s; } });
  def('FLOOR', { min: 2, max: 2, args: 'vv', cat: 'Math', sig: 'FLOOR(number, significance)', desc: 'Rounds down to a multiple.',
    sheets: { min: 1, sig: 'FLOOR(value, [factor])' },
    fn: function (v) { var x = num(v[0]), s = num(opt(v[1], 1)); if (isErr(x)) return x; if (isErr(s)) return s; if (s === 0) return new XErr('#DIV/0!'); return Math.floor(x / s + 1e-12) * s; } });
  def('RAND', { min: 0, max: 0, cat: 'Math', sig: 'RAND()', desc: 'Random number between 0 and 1. Changes every recalculation.', fn: function () { return Math.random(); } });
  def('RANDBETWEEN', { min: 2, max: 2, args: 'vv', cat: 'Math', sig: 'RANDBETWEEN(bottom, top)', desc: 'Random whole number in a range.',
    fn: function (v) { var a = Math.ceil(num(v[0])), b = Math.floor(num(v[1])); return a + Math.floor(Math.random() * (b - a + 1)); } });
  function kth(name, largest) {
    def(name, { min: 2, max: 2, args: 'rv', cat: 'Math', sig: name + '(array, k)', desc: (largest ? 'k-th largest' : 'k-th smallest') + ' value.',
      fn: function (v, ctx) {
        var n = collectNums([v[0]], ctx); if (isErr(n)) return n;
        var k = num(v[1]); if (isErr(k)) return k; k = Math.ceil(k);
        if (k < 1 || k > n.length) return new XErr('#NUM!', 'k is out of range.');
        n.sort(function (a, b) { return largest ? b - a : a - b; }); return n[k - 1];
      } });
  }
  kth('LARGE', true); kth('SMALL', false);
  function rankFn(name) {
    def(name, { min: 2, max: 3, args: 'vrv', cat: 'Math', sig: name + '(number, ref, [order])', desc: 'Rank of a number in a list (order 0 = largest is #1).',
      fn: function (v, ctx) {
        var x = num(v[0]); if (isErr(x)) return x;
        var n = collectNums([v[1]], ctx); if (isErr(n)) return n;
        var asc = toBool(opt(v[2], 0));
        if (n.indexOf(x) < 0) return new XErr('#N/A', 'The number is not in the list.');
        return 1 + n.filter(function (y) { return asc ? y < x : y > x; }).length;
      } });
  }
  rankFn('RANK'); rankFn('RANK.EQ');

  // --- Conditional aggregates ---
  function condMask(pairs, ctx, size) {
    // pairs: [[range, crit], ...]; returns boolean[] (flat) or XErr
    var mask = null;
    for (var p = 0; p < pairs.length; p++) {
      var rg = pairs[p][0], crit = pairs[p][1];
      var e = needRangeLike(rg, 'The criteria range'); if (e) return e;
      var d = dims(rg);
      if (size && (d.h !== size.h || d.w !== size.w)) return new XErr('#VALUE!', 'All ranges must be the same size.');
      size = size || d;
      var test = makeCriterion(crit), vals = flat(rg, ctx);
      if (!mask) mask = vals.map(function () { return true; });
      for (var i = 0; i < vals.length; i++) if (mask[i] && !test(vals[i])) mask[i] = false;
    }
    return { mask: mask, size: size };
  }
  function sizedLike(rg, size, ctx) { // SUMIF's sum_range: same shape starting at its top-left
    if (rg instanceof Rng) return new Rng(rg.sheet, rg.r1, rg.c1, rg.r1 + size.h - 1, rg.c1 + size.w - 1);
    return rg;
  }
  function ifsAggregate(name, kind) {
    var isCount = kind === 'count';
    def(name, {
      min: isCount ? 2 : 3, rep: 2, args: isCount ? 'rv' : 'rrv', cat: 'Conditional',
      on: (kind === 'max' || kind === 'min') ? MODERN : null,
      sig: isCount ? name + '(criteria_range1, criteria1, [criteria_range2, criteria2], ...)'
        : name + '(' + kind + '_range, criteria_range1, criteria1, [criteria_range2, criteria2], ...)',
      desc: { count: 'Counts rows that meet ALL conditions.', sum: 'Adds values in rows that meet ALL conditions.',
        avg: 'Averages values in rows that meet ALL conditions.', max: 'Largest value among rows that meet ALL conditions.',
        min: 'Smallest value among rows that meet ALL conditions.' }[kind],
      fn: function (v, ctx) {
        var start = isCount ? 0 : 1;
        if ((v.length - start) % 2) return new XErr('#VALUE!', name + ' needs criteria in range/criteria pairs.');
        var pairs = [];
        for (var i = start; i < v.length; i += 2) pairs.push([v[i], v[i + 1]]);
        var target = isCount ? null : v[0];
        if (target) { var e = needRangeLike(target, 'The ' + kind + ' range'); if (e) return e; }
        var res = condMask(pairs, ctx, target ? dims(target) : null);
        if (isErr(res)) return res;
        if (isCount) return res.mask.filter(Boolean).length;
        var vals = flat(target, ctx), nums = [];
        for (var k = 0; k < vals.length; k++) if (res.mask[k]) { if (isErr(vals[k])) return vals[k]; if (typeof vals[k] === 'number') nums.push(vals[k]); }
        return aggKind(kind, nums);
      } });
  }
  function aggKind(kind, nums) {
    if (kind === 'sum') return nums.reduce(function (a, b) { return a + b; }, 0);
    if (kind === 'avg') return nums.length ? nums.reduce(function (a, b) { return a + b; }, 0) / nums.length : new XErr('#DIV/0!', 'No rows matched, so there is nothing to average.');
    if (kind === 'max') return nums.length ? Math.max.apply(null, nums) : 0;
    if (kind === 'min') return nums.length ? Math.min.apply(null, nums) : 0;
  }
  ifsAggregate('COUNTIFS', 'count'); ifsAggregate('SUMIFS', 'sum'); ifsAggregate('AVERAGEIFS', 'avg');
  ifsAggregate('MAXIFS', 'max'); ifsAggregate('MINIFS', 'min');
  function ifAggregate(name, kind) {
    def(name, { min: 2, max: kind === 'count' ? 2 : 3, args: kind === 'count' ? 'rv' : 'rvr', cat: 'Conditional',
      sig: kind === 'count' ? 'COUNTIF(range, criteria)' : name + '(range, criteria, [' + (kind === 'sum' ? 'sum' : 'average') + '_range])',
      desc: { count: 'Counts cells that meet one condition, like ">10" or "Snacks".', sum: 'Adds the cells that meet one condition.', avg: 'Averages the cells that meet one condition.' }[kind],
      fn: function (v, ctx) {
        var res = condMask([[v[0], v[1]]], ctx); if (isErr(res)) return res;
        if (kind === 'count') return res.mask.filter(Boolean).length;
        var target = v[2] !== undefined && v[2] !== MISSING ? sizedLike(v[2], res.size, ctx) : v[0];
        var vals = flat(target, ctx), nums = [];
        for (var k = 0; k < vals.length && k < res.mask.length; k++) if (res.mask[k]) { if (isErr(vals[k])) return vals[k]; if (typeof vals[k] === 'number') nums.push(vals[k]); }
        return aggKind(kind, nums);
      } });
  }
  ifAggregate('COUNTIF', 'count'); ifAggregate('SUMIF', 'sum'); ifAggregate('AVERAGEIF', 'avg');

  // --- Lookup & reference ---
  def('VLOOKUP', { min: 3, max: 4, args: 'vrvv', cat: 'Lookup', sig: 'VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])',
    desc: 'Finds a value in the FIRST column of a table and returns a value from another column. Use FALSE for an exact match!',
    fn: function (v, ctx) {
      var x = v[0], t = v[1], e = needRangeLike(t, 'table_array'); if (e) return e;
      var ci = num(v[2]); if (isErr(ci)) return ci; ci = Math.floor(ci);
      var d = dims(t);
      if (ci < 1) return new XErr('#VALUE!', 'col_index_num must be 1 or more.');
      if (ci > d.w) return new XErr('#REF!', 'col_index_num ' + ci + ' is past the edge of the table (it only has ' + d.w + ' columns).');
      var approx = toBool(opt(v[3], true)); if (isErr(approx)) return approx;
      var first = sliceCol(t, 0, ctx), idx = -1;
      if (approx) idx = approxIndex(first, x);
      else for (var i = 0; i < first.length; i++) if (lookupEq(x, first[i], true)) { idx = i; break; }
      if (idx < 0) return notFound('VLOOKUP', x, ctx);
      return at(t, idx, ci - 1, ctx);
    } });
  def('HLOOKUP', { min: 3, max: 4, args: 'vrvv', cat: 'Lookup', sig: 'HLOOKUP(lookup_value, table_array, row_index_num, [range_lookup])',
    desc: 'Like VLOOKUP, but searches the first ROW and returns from a row below.',
    fn: function (v, ctx) {
      var x = v[0], t = v[1], e = needRangeLike(t, 'table_array'); if (e) return e;
      var ri = Math.floor(num(v[2])), d = dims(t);
      if (ri < 1) return new XErr('#VALUE!'); if (ri > d.h) return new XErr('#REF!');
      var approx = toBool(opt(v[3], true)), first = sliceRow(t, 0, ctx), idx = -1;
      if (approx) idx = approxIndex(first, x);
      else for (var i = 0; i < first.length; i++) if (lookupEq(x, first[i], true)) { idx = i; break; }
      if (idx < 0) return notFound('HLOOKUP', x, ctx);
      return at(t, ri - 1, idx, ctx);
    } });
  def('LOOKUP', { min: 2, max: 3, args: 'vrr', cat: 'Lookup', sig: 'LOOKUP(lookup_value, lookup_vector, [result_vector])',
    desc: 'Old-style approximate lookup in sorted data.',
    fn: function (v, ctx) {
      var lv = vec(v[1], ctx); if (!lv) return new XErr('#N/A');
      var idx = approxIndex(lv, v[0]); if (idx < 0) return notFound('LOOKUP', v[0], ctx);
      var rv = v[2] !== undefined && v[2] !== MISSING ? vec(v[2], ctx) : lv;
      return rv && idx < rv.length ? rv[idx] : new XErr('#N/A');
    } });
  def('MATCH', { min: 2, max: 3, args: 'vrv', cat: 'Lookup', sig: 'MATCH(lookup_value, lookup_array, [match_type])',
    desc: 'Returns the POSITION of a value in a row or column. Use 0 for an exact match. Pair it with INDEX.',
    fn: function (v, ctx) {
      var lv = vec(v[1], ctx); if (!lv) return new XErr('#N/A', 'lookup_array must be a single row or column.');
      var mt = num(opt(v[2], 1)); if (isErr(mt)) return mt;
      var idx = -1;
      if (mt === 0) { for (var i = 0; i < lv.length; i++) if (lookupEq(v[0], lv[i], true)) { idx = i; break; } }
      else idx = approxIndex(lv, v[0], mt < 0);
      return idx < 0 ? notFound('MATCH', v[0], ctx) : idx + 1;
    } });
  def('INDEX', { min: 2, max: 3, args: 'avv', cat: 'Lookup', sig: 'INDEX(array, row_num, [column_num])',
    desc: 'Returns the value at a given row and column of a range. Row 0 = the whole column.',
    fn: function (v, ctx) {
      var a = v[0], d = dims(a);
      var r = num(opt(v[1], 0)), c = v[2] === undefined || v[2] === MISSING ? null : num(v[2]);
      if (isErr(r)) return r; if (isErr(c)) return c;
      r = Math.floor(r);
      if (c === null) { if (d.h === 1) { c = r; r = 1; } else if (d.w === 1) c = 1; else c = 0; }
      c = Math.floor(c);
      if (r < 0 || c < 0 || r > d.h || c > d.w) return new XErr('#REF!', 'The row or column number is outside the range.');
      if (!(a instanceof Rng) && !(a instanceof Mat)) return a;
      if (r === 0 && c === 0) return a;
      if (r === 0) return a instanceof Rng ? new Rng(a.sheet, a.r1, a.c1 + c - 1, a.r2, a.c1 + c - 1) : new Mat(sliceCol(a, c - 1, ctx).map(function (x) { return [x]; }));
      if (c === 0) return a instanceof Rng ? new Rng(a.sheet, a.r1 + r - 1, a.c1, a.r1 + r - 1, a.c2) : new Mat([sliceRow(a, r - 1, ctx)]);
      return at(a, r - 1, c - 1, ctx);
    } });
  def('XLOOKUP', { on: MODERN, min: 3, max: 6, args: 'vrrvvv', cat: 'Lookup',
    sig: 'XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode])',
    sheets: { sig: 'XLOOKUP(search_key, lookup_range, result_range, [missing_value], [match_mode], [search_mode])' },
    desc: 'Modern lookup: search one column, return from another. Exact match by default and can look left.',
    fn: function (v, ctx) {
      var lv = vec(v[1], ctx); if (!lv) return new XErr('#VALUE!', 'lookup_array must be a single row or column.');
      var ld = dims(v[1]), rd = dims(v[2]), vertical = !(ld.h === 1 && ld.w > 1);
      if (vertical ? rd.h !== ld.h : rd.w !== ld.w) return new XErr('#VALUE!', 'lookup_array and return_array must be the same length.');
      var mm = num(opt(v[4], 0)), sm = num(opt(v[5], 1));
      if (isErr(mm)) return mm; if (isErr(sm)) return sm;
      var x = v[0], order = [];
      for (var i = 0; i < lv.length; i++) order.push(i);
      if (sm < 0) order.reverse();
      var idx = -1, best = -1;
      for (var k = 0; k < order.length; k++) {
        var j = order[k], y = lv[j];
        if (lookupEq(x, y, mm === 2)) { idx = j; break; }
        if ((mm === -1 || mm === 1) && y !== null && typeRank(y) === typeRank(x)) {
          var c = cmp(y, x);
          if (mm === -1 && c < 0 && (best < 0 || cmp(y, lv[best]) > 0)) best = j;
          if (mm === 1 && c > 0 && (best < 0 || cmp(y, lv[best]) < 0)) best = j;
        }
      }
      if (idx < 0) idx = best;
      if (idx < 0) return v[3] !== undefined && v[3] !== MISSING ? v[3] : notFound('XLOOKUP', x, ctx);
      if (vertical) { var row = sliceRow(v[2], idx, ctx); return row.length === 1 ? row[0] : new Mat([row]); }
      var col = sliceCol(v[2], idx, ctx); return col.length === 1 ? col[0] : new Mat(col.map(function (z) { return [z]; }));
    } });
  def('XMATCH', { on: MODERN, min: 2, max: 4, args: 'vrvv', cat: 'Lookup', sig: 'XMATCH(lookup_value, lookup_array, [match_mode], [search_mode])',
    desc: 'Modern MATCH: position of a value, exact match by default.',
    fn: function (v, ctx) {
      var lv = vec(v[1], ctx); if (!lv) return new XErr('#VALUE!');
      var mm = num(opt(v[2], 0)), sm = num(opt(v[3], 1));
      var ids = lv.map(function (_, i) { return i; }); if (sm < 0) ids.reverse();
      for (var k = 0; k < ids.length; k++) if (lookupEq(v[0], lv[ids[k]], mm === 2)) return ids[k] + 1;
      if (mm === -1 || mm === 1) {
        var best = -1;
        lv.forEach(function (y, i) {
          if (y === null || typeRank(y) !== typeRank(v[0])) return;
          var c = cmp(y, v[0]);
          if (mm === -1 && c < 0 && (best < 0 || cmp(y, lv[best]) > 0)) best = i;
          if (mm === 1 && c > 0 && (best < 0 || cmp(y, lv[best]) < 0)) best = i;
        });
        if (best >= 0) return best + 1;
      }
      return notFound('XMATCH', v[0], ctx);
    } });
  def('ROW', { min: 0, max: 1, args: 'r', cat: 'Lookup', sig: 'ROW([reference])', desc: 'Row number of a cell.',
    fn: function (v, ctx) {
      if (!v.length || v[0] === MISSING) return ctx.row + 1;
      if (!(v[0] instanceof Rng)) return new XErr('#VALUE!');
      if (v[0].h() === 1 || !ctx.arr) return v[0].r1 + 1;
      var rows = []; for (var r = v[0].r1; r <= v[0].r2; r++) rows.push([r + 1]); return new Mat(rows);
    } });
  def('COLUMN', { min: 0, max: 1, args: 'r', cat: 'Lookup', sig: 'COLUMN([reference])', desc: 'Column number of a cell.',
    fn: function (v, ctx) {
      if (!v.length || v[0] === MISSING) return ctx.col + 1;
      if (!(v[0] instanceof Rng)) return new XErr('#VALUE!');
      return v[0].c1 + 1;
    } });
  def('ROWS', { min: 1, max: 1, args: 'a', cat: 'Lookup', sig: 'ROWS(array)', desc: 'Number of rows in a range.', fn: function (v) { return dims(v[0]).h; } });
  def('COLUMNS', { min: 1, max: 1, args: 'a', cat: 'Lookup', sig: 'COLUMNS(array)', desc: 'Number of columns in a range.', fn: function (v) { return dims(v[0]).w; } });

  // --- Dynamic arrays ---
  function emptyArr(ctx, fnName) {
    return ctx.plat.style === 'sheets' ? new XErr('#N/A', 'No matches are found in ' + fnName + ' evaluation.') : new XErr('#CALC!', 'The result is empty. Add an if_empty argument, e.g. ' + fnName + '(..., "None").');
  }
  def('FILTER', { on: MODERN, min: 2, max: 3, args: 'aav', cat: 'Array', sig: 'FILTER(array, include, [if_empty])',
    desc: 'Keeps only the rows where include is TRUE. Results spill into the cells below.',
    sheets: { max: null, args: 'aa', sig: 'FILTER(range, condition1, [condition2, ...])',
      desc: 'Keeps rows where ALL conditions are TRUE. Each extra condition is its own argument (there is no if_empty).' },
    fn: function (v, ctx) {
      var a = v[0], d = dims(a), sheets = ctx.plat.style === 'sheets';
      var conds = sheets ? v.slice(1) : [v[1]];
      var keep = null, horizontal = false;
      for (var k = 0; k < conds.length; k++) {
        if (conds[k] === MISSING) continue;
        var cd = dims(conds[k]);
        var isRow = cd.w === 1 && cd.h === d.h, isCol = cd.h === 1 && cd.w === d.w && d.w > 1 && d.h !== cd.h;
        if (!isRow && !isCol) {
          return sheets
            ? new XErr('#VALUE!', 'FILTER has mismatched range sizes. Expected row count: ' + d.h + '. column count: 1. Actual row count: ' + cd.h + ', column count: ' + cd.w + '.')
            : new XErr('#VALUE!', 'The include argument must be the same height (or width) as the array.');
        }
        horizontal = isCol && !isRow;
        var list = flat(conds[k], ctx);
        if (!keep) keep = list.map(function () { return true; });
        for (var i = 0; i < list.length; i++) {
          if (isErr(list[i])) return list[i];
          var b = toBool(list[i]); if (isErr(b)) return b;
          if (!b) keep[i] = false;
        }
      }
      var rows = [];
      if (!horizontal) { for (var r = 0; r < d.h; r++) if (keep[r]) rows.push(sliceRow(a, r, ctx)); }
      else {
        var cols = []; for (var c = 0; c < d.w; c++) if (keep[c]) cols.push(c);
        if (cols.length) for (var r2 = 0; r2 < d.h; r2++) rows.push(cols.map(function (cc) { return at(a, r2, cc, ctx); }));
      }
      if (!rows.length) {
        if (!sheets && v[2] !== undefined && v[2] !== MISSING) return v[2];
        return emptyArr(ctx, 'FILTER');
      }
      return new Mat(rows);
    } });
  def('SORT', { on: MODERN, min: 1, max: 4, args: 'avvv', cat: 'Array', sig: 'SORT(array, [sort_index], [sort_order], [by_col])',
    desc: 'Sorts a range. sort_order is 1 for ascending or -1 for descending.',
    sheets: { max: null, args: 'avv', rep: 2, sig: 'SORT(range, sort_column, is_ascending, [sort_column2, is_ascending2, ...])',
      desc: 'Sorts a range. is_ascending is TRUE or FALSE (not 1/-1!).' },
    fn: function (v, ctx) {
      var m = toMat(v[0], ctx), rows = m.rows.slice(), keys = [];
      if (ctx.plat.style === 'sheets') {
        for (var i = 1; i < v.length; i += 2) {
          var col = v[i] === MISSING ? 1 : v[i];
          var asc = v[i + 1] === undefined || v[i + 1] === MISSING ? true : toBool(v[i + 1]);
          if (isErr(asc)) return asc;
          if (col instanceof Mat) { keys.push({ arr: flat(col, ctx), asc: asc }); continue; }
          var ci = num(col); if (isErr(ci)) return ci;
          if (ci < 1 || ci > m.w()) return new XErr('#VALUE!', 'SORT has a sort_column of ' + ci + ', which is outside the range.');
          keys.push({ col: ci - 1, asc: asc });
        }
        if (!keys.length) keys.push({ col: 0, asc: true });
      } else {
        var si = num(opt(v[1], 1)), so = num(opt(v[2], 1)), byCol = toBool(opt(v[3], false));
        if (isErr(si)) return si; if (isErr(so)) return so;
        if (so !== 1 && so !== -1) return new XErr('#VALUE!', 'sort_order must be 1 (ascending) or -1 (descending). You gave ' + toStr(v[2]) + '.');
        if (byCol) return new XErr('#VALUE!', 'Sorting by column is not supported in this practice app.');
        if (si < 1 || si > m.w()) return new XErr('#VALUE!', 'sort_index ' + si + ' is outside the array.');
        keys.push({ col: si - 1, asc: so === 1 });
      }
      var idx = rows.map(function (_, i) { return i; });
      idx.sort(function (a, b) {
        for (var k = 0; k < keys.length; k++) {
          var K = keys[k];
          var x = K.arr ? K.arr[a] : rows[a][K.col], y = K.arr ? K.arr[b] : rows[b][K.col];
          var c = sortCmp(x, y);
          if (c) return K.asc || x === null || y === null ? c : -c;
        }
        return a - b;
      });
      return new Mat(idx.map(function (i) { return rows[i]; }));
    } });
  def('UNIQUE', { on: MODERN, min: 1, max: 3, args: 'avv', cat: 'Array', sig: 'UNIQUE(array, [by_col], [exactly_once])',
    desc: 'Removes duplicate rows. Results spill.',
    fn: function (v, ctx) {
      var m = toMat(v[0], ctx), once = toBool(opt(v[2], false)), byCol = toBool(opt(v[1], false));
      var rows = byCol ? m.rows[0].map(function (_, j) { return m.rows.map(function (r) { return r[j]; }); }) : m.rows;
      var seen = {}, order = [];
      rows.forEach(function (r) {
        var key = JSON.stringify(r.map(function (x) { return typeof x === 'string' ? 's' + x.toLowerCase() : x; }));
        if (!seen[key]) { seen[key] = { row: r, n: 0 }; order.push(key); }
        seen[key].n++;
      });
      var out = order.filter(function (k) { return !once || seen[k].n === 1; }).map(function (k) { return seen[k].row; });
      if (!out.length) return emptyArr(ctx, 'UNIQUE');
      if (byCol) out = out[0].map(function (_, i) { return out.map(function (r) { return r[i]; }); });
      return new Mat(out);
    } });
  def('SEQUENCE', { on: MODERN, min: 1, max: 4, args: 'vvvv', lift: false, cat: 'Array', sig: 'SEQUENCE(rows, [columns], [start], [step])',
    desc: 'Generates a list of numbers like 1, 2, 3, …',
    fn: function (v) {
      var R = num(v[0]), C = num(opt(v[1], 1)), s = num(opt(v[2], 1)), st = num(opt(v[3], 1));
      if (R < 1 || C < 1) return new XErr('#CALC!'); if (R * C > 5000) return new XErr('#NUM!', 'That sequence is too big for this practice app.');
      var rows = [];
      for (var i = 0; i < R; i++) { var row = []; for (var j = 0; j < C; j++) row.push(s + (i * C + j) * st); rows.push(row); }
      return new Mat(rows);
    } });

  // --- Text ---
  function text1(name, sig, desc, f) {
    def(name, { min: 1, max: 1, args: 'v', cat: 'Text', sig: sig, desc: desc, fn: function (v) { return f(toStr(v[0])); } });
  }
  text1('LEN', 'LEN(text)', 'Number of characters.', function (s) { return s.length; });
  text1('UPPER', 'UPPER(text)', 'ALL CAPS.', function (s) { return s.toUpperCase(); });
  text1('LOWER', 'LOWER(text)', 'all lowercase.', function (s) { return s.toLowerCase(); });
  text1('PROPER', 'PROPER(text)', 'Capitalizes Each Word.', function (s) { return s.toLowerCase().replace(/(^|[^a-z])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }); });
  text1('TRIM', 'TRIM(text)', 'Removes extra spaces.', function (s) { return s.replace(/ +/g, ' ').trim(); });
  def('LEFT', { min: 1, max: 2, args: 'vv', cat: 'Text', sig: 'LEFT(text, [num_chars])', desc: 'Characters from the start.',
    fn: function (v) { var n = num(opt(v[1], 1)); if (isErr(n)) return n; if (n < 0) return new XErr('#VALUE!'); return toStr(v[0]).slice(0, n); } });
  def('RIGHT', { min: 1, max: 2, args: 'vv', cat: 'Text', sig: 'RIGHT(text, [num_chars])', desc: 'Characters from the end.',
    fn: function (v) { var n = num(opt(v[1], 1)); if (isErr(n)) return n; if (n < 0) return new XErr('#VALUE!'); var s = toStr(v[0]); return n === 0 ? '' : s.slice(-n); } });
  def('MID', { min: 3, max: 3, args: 'vvv', cat: 'Text', sig: 'MID(text, start_num, num_chars)', desc: 'Characters from the middle.',
    fn: function (v) { var s = num(v[1]), n = num(v[2]); if (isErr(s)) return s; if (isErr(n)) return n; if (s < 1 || n < 0) return new XErr('#VALUE!'); return toStr(v[0]).substr(s - 1, n); } });
  def('CONCATENATE', { min: 1, args: 'v', cat: 'Text', sig: 'CONCATENATE(text1, [text2], ...)',
    desc: 'Joins text together. Works everywhere, but cannot take a whole range in old Excel.',
    sheets: { args: 'r', desc: 'Joins text together. In Google Sheets it also accepts ranges.' },
    fn: function (v, ctx) {
      var s = '';
      for (var i = 0; i < v.length; i++) {
        var x = v[i];
        if (x instanceof Rng || x instanceof Mat) { var l = flat(x, ctx); for (var j = 0; j < l.length; j++) { if (isErr(l[j])) return l[j]; s += toStr(l[j]); } }
        else { if (isErr(x)) return x; s += toStr(x); }
      }
      return s;
    } });
  def('CONCAT', { on: MODERN, min: 1, args: 'r', cat: 'Text', sig: 'CONCAT(text1, [text2], ...)',
    desc: 'Joins text, including whole ranges.',
    sheets: { min: 2, max: 2, args: 'vv', sig: 'CONCAT(value1, value2)', desc: 'Google Sheets CONCAT joins exactly TWO values. Use CONCATENATE or & for more.' },
    fn: function (v, ctx) { return FN.CONCATENATE.fn(v, ctx); } });
  def('TEXTJOIN', { on: MODERN, min: 3, args: 'vvr', cat: 'Text', sig: 'TEXTJOIN(delimiter, ignore_empty, text1, [text2], ...)',
    desc: 'Joins many values with a separator like ", ".',
    fn: function (v, ctx) {
      var dlm = toStr(v[0]), ign = toBool(v[1]); if (isErr(ign)) return ign;
      var parts = [];
      for (var i = 2; i < v.length; i++) {
        var l = v[i] instanceof Rng || v[i] instanceof Mat ? flat(v[i], ctx) : [v[i]];
        for (var j = 0; j < l.length; j++) { if (isErr(l[j])) return l[j]; var s = toStr(l[j]); if (!ign || s !== '') parts.push(s); }
      }
      return parts.join(dlm);
    } });
  def('JOIN', { on: ONLY_GS, min: 2, args: 'vr', cat: 'Text', sig: 'JOIN(delimiter, value_or_array1, [value_or_array2], ...)',
    desc: 'Google Sheets: joins values with a separator.',
    fn: function (v, ctx) {
      var parts = [];
      for (var i = 1; i < v.length; i++) flat(v[i], ctx).forEach(function (x) { parts.push(toStr(x)); });
      return parts.join(toStr(v[0]));
    } });
  def('SUBSTITUTE', { min: 3, max: 4, args: 'vvvv', cat: 'Text', sig: 'SUBSTITUTE(text, old_text, new_text, [instance_num])', desc: 'Replaces text.',
    fn: function (v) {
      var s = toStr(v[0]), o = toStr(v[1]), n = toStr(v[2]);
      if (o === '') return s;
      if (v[3] === undefined || v[3] === MISSING) return s.split(o).join(n);
      var k = num(v[3]), idx = -1;
      for (var i = 0; i < k; i++) { idx = s.indexOf(o, idx + 1); if (idx < 0) return s; }
      return s.slice(0, idx) + n + s.slice(idx + o.length);
    } });
  def('FIND', { min: 2, max: 3, args: 'vvv', cat: 'Text', sig: 'FIND(find_text, within_text, [start_num])', desc: 'Position of text (case-sensitive).',
    fn: function (v) { var i = toStr(v[1]).indexOf(toStr(v[0]), num(opt(v[2], 1)) - 1); return i < 0 ? new XErr('#VALUE!', 'The text was not found.') : i + 1; } });
  def('SEARCH', { min: 2, max: 3, args: 'vvv', cat: 'Text', sig: 'SEARCH(find_text, within_text, [start_num])', desc: 'Position of text (not case-sensitive, allows * and ?).',
    fn: function (v) {
      var f = toStr(v[0]), w = toStr(v[1]), st = num(opt(v[2], 1)) - 1;
      var re = new RegExp(wildcardRe(f).source.slice(1, -1), 'i');
      var m = re.exec(w.slice(st)); return m ? m.index + st + 1 : new XErr('#VALUE!', 'The text was not found.');
    } });
  def('TEXT', { min: 2, max: 2, args: 'vv', cat: 'Text', sig: 'TEXT(value, format_text)', desc: 'Formats a number as text, e.g. TEXT(A1, "$#,##0.00") or TEXT(A1, "mmmm").',
    fn: function (v) {
      var x = v[0];
      if (typeof x === 'string') { var p = parseNumberText(x); if (!p) return x; x = p.v; }
      if (typeof x === 'boolean') return toStr(x);
      return formatWithCode(x === null ? 0 : x, toStr(v[1]));
    } });
  def('VALUE', { min: 1, max: 1, args: 'v', cat: 'Text', sig: 'VALUE(text)', desc: 'Converts text that looks like a number into a number.',
    fn: function (v) { if (typeof v[0] === 'number') return v[0]; var p = parseNumberText(toStr(v[0])); return p ? p.v : new XErr('#VALUE!', '"' + toStr(v[0]) + '" is not a number.'); } });
  def('REPT', { min: 2, max: 2, args: 'vv', cat: 'Text', sig: 'REPT(text, number_times)', desc: 'Repeats text.',
    fn: function (v) { var n = num(v[1]); if (isErr(n) || n < 0) return new XErr('#VALUE!'); return toStr(v[0]).repeat(Math.min(n, 1000)); } });
  def('EXACT', { min: 2, max: 2, args: 'vv', cat: 'Text', sig: 'EXACT(text1, text2)', desc: 'TRUE if two texts match exactly (case-sensitive).',
    fn: function (v) { return toStr(v[0]) === toStr(v[1]); } });
  def('SPLIT', { on: ONLY_GS, min: 2, max: 4, args: 'vvvv', lift: false, cat: 'Text', sig: 'SPLIT(text, delimiter, [split_by_each], [remove_empty_text])',
    desc: 'Google Sheets: splits text into separate cells across a row.',
    fn: function (v) {
      var s = toStr(v[0]), d = toStr(v[1]), each = toBool(opt(v[2], true)), rm = toBool(opt(v[3], true));
      if (d === '') return new XErr('#VALUE!', 'SPLIT needs a delimiter.');
      var parts;
      if (each) { var re = new RegExp('[' + d.replace(/[\]\\^-]/g, '\\$&') + ']'); parts = s.split(re); } else parts = s.split(d);
      if (rm) parts = parts.filter(function (p) { return p !== ''; });
      if (!parts.length) return new XErr('#VALUE!');
      return new Mat([parts.map(function (p) { var n = parseNumberText(p); return n && !/^\s*0\d/.test(p) ? n.v : p; })]);
    } });
  function gsRegex(src, ctx) {
    try { return new RegExp(src); } catch (e) { return new XErr('#REF!', 'Function REGEX parameter 2 value "' + src + '" is not a valid regular expression.'); }
  }
  def('REGEXMATCH', { on: ONLY_GS, min: 2, max: 2, args: 'vv', cat: 'Text', sig: 'REGEXMATCH(text, regular_expression)',
    desc: 'Google Sheets: TRUE if the text matches a pattern.',
    fn: function (v, ctx) { var re = gsRegex(toStr(v[1]), ctx); return isErr(re) ? re : re.test(toStr(v[0])); } });
  def('REGEXEXTRACT', { on: ONLY_GS, min: 2, max: 2, args: 'vv', cat: 'Text', sig: 'REGEXEXTRACT(text, regular_expression)',
    desc: 'Google Sheets: pulls out the part of the text that matches a pattern.',
    fn: function (v, ctx) {
      var re = gsRegex(toStr(v[1]), ctx); if (isErr(re)) return re;
      var m = re.exec(toStr(v[0]));
      if (!m) return new XErr('#N/A', 'Function REGEXEXTRACT parameter 2 value "' + toStr(v[1]) + '" does not match text of Function REGEXEXTRACT parameter 1 value "' + toStr(v[0]) + '".');
      return m.length > 1 ? m[1] : m[0];
    } });
  def('REGEXREPLACE', { on: ONLY_GS, min: 3, max: 3, args: 'vvv', cat: 'Text', sig: 'REGEXREPLACE(text, regular_expression, replacement)',
    desc: 'Google Sheets: replaces every part of the text that matches a pattern.',
    fn: function (v, ctx) {
      var re = gsRegex(toStr(v[1]), ctx); if (isErr(re)) return re;
      return toStr(v[0]).replace(new RegExp(re.source, 'g'), toStr(v[2]));
    } });

  // --- Dates ---
  function dateArg(x) { var n = num(x); return n; }
  def('TODAY', { min: 0, max: 0, cat: 'Date', sig: 'TODAY()', desc: "Today's date (changes every day).", fmt: 'date', fn: function () { return todaySerial(); } });
  def('NOW', { min: 0, max: 0, cat: 'Date', sig: 'NOW()', desc: 'Current date and time.', fmt: 'date', fn: function () { var n = new Date(); return todaySerial() + (n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds()) / 86400; } });
  def('DATE', { min: 3, max: 3, args: 'vvv', cat: 'Date', sig: 'DATE(year, month, day)', desc: 'Builds a date from parts.', fmt: 'date',
    fn: function (v) { var y = num(v[0]), m = num(v[1]), d = num(v[2]); if (isErr(y)) return y; if (isErr(m)) return m; if (isErr(d)) return d;
      if (y < 1900) y += 1900; return serial(Math.floor(y), Math.floor(m), Math.floor(d)); } });
  function datePart(name, f, desc) {
    def(name, { min: 1, max: 1, args: 'v', cat: 'Date', sig: name + '(date)', desc: desc,
      fn: function (v) { var s = dateArg(v[0]); if (isErr(s)) return s; if (s < 0) return new XErr('#NUM!'); return f(fromSerial(s)); } });
  }
  datePart('YEAR', function (p) { return p.y; }, 'Year of a date.');
  datePart('MONTH', function (p) { return p.m; }, 'Month number (1–12) of a date.');
  datePart('DAY', function (p) { return p.d; }, 'Day of the month of a date.');
  def('WEEKDAY', { min: 1, max: 2, args: 'vv', cat: 'Date', sig: 'WEEKDAY(date, [return_type])', desc: 'Day of week as a number (1 = Sunday by default).',
    fn: function (v) { var s = dateArg(v[0]); if (isErr(s)) return s; var t = num(opt(v[1], 1)), wd = fromSerial(s).wd;
      if (t === 1) return wd + 1; if (t === 2) return wd === 0 ? 7 : wd; if (t === 3) return wd === 0 ? 6 : wd - 1; return new XErr('#NUM!'); } });
  def('EOMONTH', { min: 2, max: 2, args: 'vv', cat: 'Date', sig: 'EOMONTH(start_date, months)', desc: 'Last day of the month, some months away.', fmt: 'date',
    fn: function (v) { var s = dateArg(v[0]), m = num(v[1]); if (isErr(s)) return s; if (isErr(m)) return m; var p = fromSerial(s); return serial(p.y, p.m + Math.trunc(m) + 1, 0); } });
  def('EDATE', { min: 2, max: 2, args: 'vv', cat: 'Date', sig: 'EDATE(start_date, months)', desc: 'Same day, some months away.', fmt: 'date',
    fn: function (v) { var s = dateArg(v[0]), m = num(v[1]); if (isErr(s)) return s; var p = fromSerial(s); var last = fromSerial(serial(p.y, p.m + Math.trunc(m) + 1, 0)).d; return serial(p.y, p.m + Math.trunc(m), Math.min(p.d, last)); } });
  def('DAYS', { min: 2, max: 2, args: 'vv', cat: 'Date', sig: 'DAYS(end_date, start_date)', desc: 'Days between two dates.',
    fn: function (v) { var a = dateArg(v[0]), b = dateArg(v[1]); if (isErr(a)) return a; if (isErr(b)) return b; return Math.floor(a) - Math.floor(b); } });
  def('DATEDIF', { min: 3, max: 3, args: 'vvv', cat: 'Date', sig: 'DATEDIF(start_date, end_date, unit)', desc: 'Difference between dates in "Y", "M" or "D". (Hidden in Excel — no autocomplete!)',
    fn: function (v) {
      var a = dateArg(v[0]), b = dateArg(v[1]), u = toStr(v[2]).toUpperCase();
      if (isErr(a)) return a; if (isErr(b)) return b; if (a > b) return new XErr('#NUM!', 'start_date must be before end_date.');
      var p = fromSerial(a), q = fromSerial(b);
      var months = (q.y - p.y) * 12 + (q.m - p.m) - (q.d < p.d ? 1 : 0);
      if (u === 'D') return Math.floor(b) - Math.floor(a);
      if (u === 'M') return months;
      if (u === 'Y') return Math.floor(months / 12);
      if (u === 'YM') return months % 12;
      if (u === 'MD') return q.d >= p.d ? q.d - p.d : Math.floor(b) - serial(q.y, q.m - 1, p.d);
      if (u === 'YD') { var y2 = serial(q.y, p.m, p.d); if (y2 > b) y2 = serial(q.y - 1, p.m, p.d); return Math.floor(b) - y2; }
      return new XErr('#NUM!', 'unit must be "Y", "M", "D", "YM", "MD" or "YD".');
    } });

  // --- Info ---
  function info(name, f, desc) {
    def(name, { min: 1, max: 1, args: 'v', passErr: true, cat: 'Info', sig: name + '(value)', desc: desc, fn: function (v) { return f(v[0]); } });
  }
  info('ISBLANK', function (x) { return x === null; }, 'TRUE if the cell is empty.');
  info('ISNUMBER', function (x) { return typeof x === 'number'; }, 'TRUE if the value is a number.');
  info('ISTEXT', function (x) { return typeof x === 'string'; }, 'TRUE if the value is text.');
  info('ISLOGICAL', function (x) { return typeof x === 'boolean'; }, 'TRUE if the value is TRUE or FALSE.');
  info('ISERROR', function (x) { return isErr(x); }, 'TRUE if the value is any error.');
  info('ISERR', function (x) { return isErr(x) && x.code !== '#N/A'; }, 'TRUE for any error except #N/A.');
  info('ISNA', function (x) { return isErr(x) && x.code === '#N/A'; }, 'TRUE if the value is #N/A.');
  def('NA', { min: 0, max: 0, cat: 'Info', sig: 'NA()', desc: 'Returns #N/A on purpose.', fn: function () { return new XErr('#N/A'); } });

  // --- Google-only extras ---
  def('COUNTUNIQUE', { on: ONLY_GS, min: 1, args: 'r', cat: 'Math', sig: 'COUNTUNIQUE(value1, [value2], ...)', desc: 'Google Sheets: counts distinct values.',
    fn: function (v, ctx) {
      var seen = {};
      v.forEach(function (x) { flat(x, ctx).forEach(function (y) { if (y !== null && y !== '') seen[typeof y + ':' + (typeof y === 'string' ? y.toLowerCase() : y)] = 1; }); });
      return Object.keys(seen).length;
    } });
  def('QUERY', { on: ONLY_GS, min: 2, max: 3, args: 'avv', lift: false, cat: 'Array', sig: 'QUERY(data, query, [headers])',
    desc: 'Google Sheets: runs a SQL-like query on a range. Columns are named by letter: "select B, D where C = \'Snacks\'".',
    fn: function (v, ctx) {
      var m = toMat(v[0], ctx);
      var h = v[2] === undefined || v[2] === MISSING ? -1 : num(v[2]);
      return SX.sql.gvizQuery(m, toStr(v[1]), h, v[0] instanceof Rng ? v[0].c1 : null);
    } });
  def('IMPORTRANGE', { on: ONLY_GS, min: 2, max: 2, args: 'vv', cat: 'Array', sig: 'IMPORTRANGE(spreadsheet_url, range_string)',
    desc: 'Google Sheets: pulls data from ANOTHER spreadsheet file (needs permission).',
    fn: function () { return new XErr('#REF!', 'IMPORTRANGE connects to another Google Sheets file. It can only run inside real Google Sheets, after you click "Allow access".'); } });
  def('GOOGLEFINANCE', { on: ONLY_GS, min: 1, max: 5, args: 'vvvvv', cat: 'Array', sig: 'GOOGLEFINANCE(ticker, [attribute], ...)',
    desc: 'Google Sheets: live stock data from the internet.',
    fn: function () { return new XErr('#N/A', 'GOOGLEFINANCE needs live internet data — it only works in real Google Sheets.'); } });

  // ======================= Public API =======================
  // Evaluate a parsed formula for a cell.
  function evaluate(ast, wb, sheet, row, col, plat, opts) {
    opts = opts || {};
    var ctx = { wb: wb, sheet: sheet, row: row, col: col, plat: plat, arr: plat.arrayAuto || !!opts.cse, scope: null };
    var v = evalNode(ast, ctx);
    return v;
  }

  // Commit-time validation: what the app refuses to accept (Excel dialogs) or flags.
  function validate(ast, plat) {
    var problems = [];
    F.walk(ast, function (n) {
      if (n.t !== 'fn' || !available(n.name, plat)) return;
      var d = platDef(FN[n.name], plat), c = n.args.length;
      if (c < d.min || (d.max != null && c > d.max)) problems.push({ fn: n.name, msg: argCountMsg(n.name, d, c, plat) });
    });
    return problems;
  }

  function fnInfo(name, plat) {
    var d = FN[name]; if (!d) return null;
    var p = platDef(d, plat);
    return { name: name, sig: p.sig, desc: p.desc, cat: p.cat, available: available(name, plat) };
  }

  SX.engine = {
    FN: FN, evaluate: evaluate, validate: validate, available: available, fnInfo: fnInfo,
    toNum: toNum, toStr: toStr, toBool: toBool, cmp: cmp, sortCmp: sortCmp,
    parseNumberText: parseNumberText, displayValue: displayValue, formatWithCode: formatWithCode,
    generalDisplay: generalDisplay, serial: serial, fromSerial: fromSerial, toMat: toMat,
    makeCriterion: makeCriterion, wildcardRe: wildcardRe, FORMATS: FORMATS, MONTHS: MONTHS
  };
})(globalThis.SX = globalThis.SX || {});
