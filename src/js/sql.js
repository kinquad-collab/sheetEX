/* SheetEX — a small SQLite-flavored SQL engine (plus Google Sheets QUERY language).
 * Supports: SELECT [DISTINCT] ... FROM ... [JOIN ... ON] WHERE GROUP BY HAVING ORDER BY LIMIT OFFSET,
 * scalar subqueries, IN (subquery), CASE, CAST, INSERT, UPDATE, DELETE, CREATE TABLE, DROP TABLE. */
(function (SX) {
  'use strict';

  function SqlError(msg, hint) { this.message = msg; this.hint = hint || ''; }
  SqlError.prototype = Object.create(Error.prototype);
  SqlError.prototype.constructor = SqlError;
  SqlError.prototype.name = 'SqlError';

  // ---------------- Lexer ----------------
  var KEYWORDS = ('SELECT DISTINCT FROM WHERE GROUP BY HAVING ORDER ASC DESC LIMIT OFFSET AS AND OR NOT NULL IS IN LIKE ' +
    'BETWEEN JOIN INNER LEFT OUTER CROSS ON CASE WHEN THEN ELSE END INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE DROP ' +
    'CAST TRUE FALSE ALL').split(' ');
  var GVIZ_KW = ['LABEL', 'CONTAINS', 'STARTS', 'ENDS', 'WITH', 'MATCHES', 'DATE', 'PIVOT', 'FORMAT', 'OPTIONS'];

  function lex(src, gviz) {
    var toks = [], i = 0, n = src.length;
    while (i < n) {
      var ch = src[i], s = i;
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '-' && src[i + 1] === '-') { while (i < n && src[i] !== '\n') i++; continue; }
      if (ch === '/' && src[i + 1] === '*') { var e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
      if (ch === "'" || (gviz && ch === '"')) {
        var q = ch, str = ''; i++;
        while (true) {
          if (i >= n) throw new SqlError('unrecognized token: "' + src.slice(s, s + 12) + '"', 'A text value is missing its closing quote ' + q + '.');
          if (src[i] === q) { if (src[i + 1] === q) { str += q; i += 2; continue; } i++; break; }
          str += src[i++];
        }
        toks.push({ t: 'str', v: str, s: s, e: i }); continue;
      }
      if (ch === '"' || ch === '`' || ch === '[') {
        var close = ch === '[' ? ']' : ch, j = src.indexOf(close, i + 1);
        if (j < 0) throw new SqlError('unrecognized token: "' + src.slice(s, s + 12) + '"');
        toks.push({ t: 'id', v: src.slice(i + 1, j), quoted: ch, s: s, e: j + 1 }); i = j + 1; continue;
      }
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        var m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
        toks.push({ t: 'num', v: parseFloat(m[0]), real: /[.eE]/.test(m[0]), s: s, e: i + m[0].length }); i += m[0].length; continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        var w = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))[0];
        var up = w.toUpperCase();
        if (KEYWORDS.indexOf(up) >= 0 || (gviz && GVIZ_KW.indexOf(up) >= 0)) toks.push({ t: 'kw', v: up, raw: w, s: s, e: i + w.length });
        else toks.push({ t: 'id', v: w, s: s, e: i + w.length });
        i += w.length; continue;
      }
      var two = src.substr(i, 2);
      if (['<=', '>=', '<>', '!=', '==', '||'].indexOf(two) >= 0) { toks.push({ t: 'op', v: two, s: s, e: i + 2 }); i += 2; continue; }
      if ('=<>+-*/%(),.;'.indexOf(ch) >= 0) { toks.push({ t: 'op', v: ch, s: s, e: i + 1 }); i++; continue; }
      throw new SqlError('unrecognized token: "' + ch + '"');
    }
    toks.push({ t: 'eof', s: n, e: n });
    return toks;
  }

  // ---------------- Parser ----------------
  function Parser(src, gviz) { this.src = src; this.toks = lex(src, gviz); this.p = 0; this.gviz = gviz; }
  Parser.prototype.peek = function (k) { return this.toks[this.p + (k || 0)]; };
  Parser.prototype.next = function () { return this.toks[this.p++]; };
  Parser.prototype.isKw = function (v, k) { var t = this.peek(k); return t.t === 'kw' && t.v === v; };
  Parser.prototype.isOp = function (v) { var t = this.peek(); return t.t === 'op' && t.v === v; };
  Parser.prototype.acceptKw = function (v) { if (this.isKw(v)) { this.p++; return true; } return false; };
  Parser.prototype.acceptOp = function (v) { if (this.isOp(v)) { this.p++; return true; } return false; };
  Parser.prototype.fail = function (t, hint) {
    t = t || this.peek();
    var near = t.t === 'eof' ? 'incomplete input' : 'near "' + this.src.slice(t.s, t.e) + '": syntax error';
    throw new SqlError(t.t === 'eof' ? near : near, hint);
  };
  Parser.prototype.expectKw = function (v, hint) { if (!this.acceptKw(v)) this.fail(null, hint || ('Expected ' + v + ' here.')); };
  Parser.prototype.expectOp = function (v, hint) { if (!this.acceptOp(v)) this.fail(null, hint || ('Expected "' + v + '" here.')); };
  Parser.prototype.ident = function (what) {
    var t = this.peek();
    if (t.t === 'id') { this.p++; return t.v; }
    this.fail(t, 'Expected ' + (what || 'a name') + ' here.');
  };

  Parser.prototype.statements = function () {
    var out = [];
    while (true) {
      while (this.acceptOp(';')) { /* skip */ }
      if (this.peek().t === 'eof') break;
      var start = this.peek().s;
      var st = this.statement();
      st.text = this.src.slice(start, this.peek().s).trim();
      out.push(st);
      if (this.peek().t !== 'eof' && !this.isOp(';')) this.fail(null, 'Did you forget a semicolon ; between statements, or misspell a keyword?');
    }
    return out;
  };
  Parser.prototype.statement = function () {
    var t = this.peek();
    if (t.t === 'kw') {
      if (t.v === 'SELECT') return this.select();
      if (t.v === 'INSERT') return this.insert();
      if (t.v === 'UPDATE') return this.update();
      if (t.v === 'DELETE') return this.del();
      if (t.v === 'CREATE') return this.create();
      if (t.v === 'DROP') { this.p++; this.expectKw('TABLE'); return { type: 'drop', table: this.ident('a table name') }; }
    }
    var hint = '';
    if (t.t === 'id' && /^(selct|slect|selet|seelct|select)$/i.test(t.v)) hint = 'Check the spelling of SELECT.';
    else hint = 'SQL statements start with SELECT, INSERT, UPDATE, DELETE, CREATE or DROP.';
    this.fail(t, hint);
  };

  Parser.prototype.select = function () {
    this.expectKw('SELECT');
    var q = { type: 'select', distinct: false, items: [], from: null, joins: [], where: null, group: [], having: null, order: [], limit: null, offset: null, labels: [] };
    if (this.acceptKw('DISTINCT')) q.distinct = true; else this.acceptKw('ALL');
    do {
      var s = this.peek().s;
      if (this.isOp('*')) { this.p++; q.items.push({ star: true }); continue; }
      if (this.peek().t === 'id' && this.peek(1).t === 'op' && this.peek(1).v === '.' && this.peek(2).t === 'op' && this.peek(2).v === '*') {
        var tq = this.next().v; this.p += 2; q.items.push({ star: true, table: tq }); continue;
      }
      var e = this.expr();
      var text = this.src.slice(s, this.toks[this.p - 1].e).trim();
      var alias = null;
      if (this.acceptKw('AS')) alias = this.peek().t === 'str' ? this.next().v : this.ident('an alias name');
      else if (this.peek().t === 'id') alias = this.next().v;
      q.items.push({ expr: e, alias: alias, text: text });
    } while (this.acceptOp(','));
    if (this.gviz) {
      if (this.isKw('FROM')) this.fail(null, 'QUERY has no FROM — the data is the first argument of QUERY().');
    } else if (this.acceptKw('FROM')) {
      q.from = this.tableRef();
      while (true) {
        var kind = null;
        if (this.acceptOp(',')) kind = 'CROSS';
        else if (this.acceptKw('JOIN')) kind = 'INNER';
        else if (this.isKw('INNER')) { this.p++; this.expectKw('JOIN'); kind = 'INNER'; }
        else if (this.isKw('LEFT')) { this.p++; this.acceptKw('OUTER'); this.expectKw('JOIN'); kind = 'LEFT'; }
        else if (this.isKw('CROSS')) { this.p++; this.expectKw('JOIN'); kind = 'CROSS'; }
        if (!kind) break;
        var tr = this.tableRef(), on = null;
        if (this.acceptKw('ON')) on = this.expr();
        else if (kind !== 'CROSS' && !this.isOp(',')) on = null;
        q.joins.push({ kind: kind, table: tr, on: on });
      }
    }
    if (this.acceptKw('WHERE')) q.where = this.expr();
    if (this.isKw('GROUP')) { this.p++; this.expectKw('BY'); do { q.group.push(this.expr()); } while (this.acceptOp(',')); }
    if (this.acceptKw('HAVING')) q.having = this.expr();
    if (this.gviz && this.isKw('PIVOT')) this.fail(null, 'PIVOT is not supported in this practice app.');
    if (this.isKw('ORDER')) {
      this.p++; this.expectKw('BY', 'It is ORDER BY (two words).');
      do {
        var oe = this.expr(), desc = false;
        if (this.acceptKw('DESC')) desc = true; else this.acceptKw('ASC');
        q.order.push({ expr: oe, desc: desc });
      } while (this.acceptOp(','));
    }
    if (this.acceptKw('LIMIT')) {
      q.limit = this.expr();
      if (this.acceptKw('OFFSET')) q.offset = this.expr();
      else if (!this.gviz && this.acceptOp(',')) { q.offset = q.limit; q.limit = this.expr(); }
    }
    if (this.gviz && this.acceptKw('OFFSET')) q.offset = this.expr();
    if (this.gviz && this.acceptKw('LABEL')) {
      do { var le = this.expr(); var lt = this.next(); if (lt.t !== 'str') this.fail(lt, "Labels look like: label A 'Name'"); q.labels.push({ expr: le, text: lt.v }); } while (this.acceptOp(','));
    }
    return q;
  };
  Parser.prototype.tableRef = function () {
    var name = this.ident('a table name'), alias = null;
    if (this.acceptKw('AS')) alias = this.ident('an alias');
    else if (this.peek().t === 'id') alias = this.next().v;
    return { name: name, alias: alias || name };
  };
  Parser.prototype.insert = function () {
    this.expectKw('INSERT'); this.expectKw('INTO');
    var table = this.ident('a table name'), cols = null, rows = [];
    if (this.acceptOp('(')) { cols = []; do { cols.push(this.ident('a column name')); } while (this.acceptOp(',')); this.expectOp(')'); }
    if (this.isKw('SELECT')) return { type: 'insert', table: table, cols: cols, select: this.select() };
    this.expectKw('VALUES');
    do {
      this.expectOp('('); var r = [];
      do { r.push(this.expr()); } while (this.acceptOp(','));
      this.expectOp(')'); rows.push(r);
    } while (this.acceptOp(','));
    return { type: 'insert', table: table, cols: cols, rows: rows };
  };
  Parser.prototype.update = function () {
    this.expectKw('UPDATE');
    var table = this.ident('a table name'); this.expectKw('SET');
    var sets = [];
    do { var c = this.ident('a column name'); if (!this.acceptOp('=')) this.acceptOp('=='); sets.push({ col: c, expr: this.expr() }); } while (this.acceptOp(','));
    var where = this.acceptKw('WHERE') ? this.expr() : null;
    return { type: 'update', table: table, sets: sets, where: where };
  };
  Parser.prototype.del = function () {
    this.expectKw('DELETE'); this.expectKw('FROM');
    var table = this.ident('a table name');
    return { type: 'delete', table: table, where: this.acceptKw('WHERE') ? this.expr() : null };
  };
  Parser.prototype.create = function () {
    this.expectKw('CREATE'); this.expectKw('TABLE');
    var table = this.ident('a table name'), cols = [];
    this.expectOp('(');
    do {
      var name = this.ident('a column name'), type = '';
      while (this.peek().t === 'id' || (this.peek().t === 'kw' && ['NOT', 'NULL'].indexOf(this.peek().v) >= 0) || (this.isOp('(') && type)) {
        if (this.acceptOp('(')) { while (!this.acceptOp(')')) this.next(); continue; }
        type += (type ? ' ' : '') + this.next().v;
      }
      cols.push({ name: name, type: type.split(' ')[0].toUpperCase() || 'TEXT' });
    } while (this.acceptOp(','));
    this.expectOp(')');
    return { type: 'create', table: table, cols: cols };
  };

  // Expressions
  Parser.prototype.expr = function () { return this.orExpr(); };
  Parser.prototype.orExpr = function () {
    var l = this.andExpr();
    while (this.acceptKw('OR')) l = { t: 'bin', op: 'OR', l: l, r: this.andExpr() };
    return l;
  };
  Parser.prototype.andExpr = function () {
    var l = this.notExpr();
    while (this.acceptKw('AND')) l = { t: 'bin', op: 'AND', l: l, r: this.notExpr() };
    return l;
  };
  Parser.prototype.notExpr = function () {
    if (this.acceptKw('NOT')) return { t: 'not', e: this.notExpr() };
    return this.cmpExpr();
  };
  Parser.prototype.cmpExpr = function () {
    var l = this.concatExpr();
    while (true) {
      var t = this.peek();
      if (t.t === 'op' && ['=', '==', '!=', '<>', '<', '>', '<=', '>='].indexOf(t.v) >= 0) {
        this.p++; var op = t.v === '==' ? '=' : t.v === '!=' ? '<>' : t.v;
        l = { t: 'bin', op: op, l: l, r: this.concatExpr() }; continue;
      }
      if (this.isKw('IS')) {
        this.p++; var neg = this.acceptKw('NOT'); this.expectKw('NULL', 'Use IS NULL or IS NOT NULL.');
        l = { t: 'isnull', e: l, neg: neg }; continue;
      }
      var negate = false, save = this.p;
      if (this.isKw('NOT') && (this.isKw('LIKE', 1) || this.isKw('IN', 1) || this.isKw('BETWEEN', 1))) { this.p++; negate = true; }
      if (this.acceptKw('LIKE')) { l = { t: 'like', e: l, pat: this.concatExpr(), neg: negate }; continue; }
      if (this.acceptKw('IN')) {
        this.expectOp('(', 'IN needs a list in parentheses, like IN (\'A\', \'B\').');
        if (this.isKw('SELECT')) { var sq = this.select(); this.expectOp(')'); l = { t: 'insub', e: l, q: sq, neg: negate }; continue; }
        var list = []; do { list.push(this.expr()); } while (this.acceptOp(','));
        this.expectOp(')');
        l = { t: 'in', e: l, list: list, neg: negate }; continue;
      }
      if (this.acceptKw('BETWEEN')) {
        var lo = this.concatExpr(); this.expectKw('AND', 'BETWEEN needs AND: BETWEEN 1 AND 10.'); var hi = this.concatExpr();
        l = { t: 'between', e: l, lo: lo, hi: hi, neg: negate }; continue;
      }
      if (this.gviz) {
        if (this.acceptKw('CONTAINS')) { l = { t: 'gv', op: 'contains', l: l, r: this.concatExpr() }; continue; }
        if (this.acceptKw('STARTS')) { this.expectKw('WITH'); l = { t: 'gv', op: 'starts', l: l, r: this.concatExpr() }; continue; }
        if (this.acceptKw('ENDS')) { this.expectKw('WITH'); l = { t: 'gv', op: 'ends', l: l, r: this.concatExpr() }; continue; }
        if (this.acceptKw('MATCHES')) { l = { t: 'gv', op: 'matches', l: l, r: this.concatExpr() }; continue; }
      }
      this.p = save;
      return l;
    }
  };
  Parser.prototype.concatExpr = function () {
    var l = this.addExpr();
    while (this.acceptOp('||')) l = { t: 'bin', op: '||', l: l, r: this.addExpr() };
    return l;
  };
  Parser.prototype.addExpr = function () {
    var l = this.mulExpr();
    while (this.isOp('+') || this.isOp('-')) { var op = this.next().v; l = { t: 'bin', op: op, l: l, r: this.mulExpr() }; }
    return l;
  };
  Parser.prototype.mulExpr = function () {
    var l = this.unary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) { var op = this.next().v; l = { t: 'bin', op: op, l: l, r: this.unary() }; }
    return l;
  };
  Parser.prototype.unary = function () {
    if (this.acceptOp('-')) return { t: 'neg', e: this.unary() };
    if (this.acceptOp('+')) return this.unary();
    return this.primary();
  };
  Parser.prototype.primary = function () {
    var t = this.next();
    if (t.t === 'num') return { t: 'lit', v: t.v, real: t.real };
    if (t.t === 'str') return { t: 'lit', v: t.v };
    if (t.t === 'kw') {
      if (t.v === 'NULL') return { t: 'lit', v: null };
      if (t.v === 'TRUE' || t.v === 'FALSE') return { t: 'lit', v: this.gviz ? t.v === 'TRUE' : (t.v === 'TRUE' ? 1 : 0) };
      if (t.v === 'DATE' && this.gviz && this.peek().t === 'str') {
        var ds = this.next().v, m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(ds);
        if (!m) this.fail(t, "Dates look like: date '2026-09-01'");
        return { t: 'lit', v: SX.engine.serial(+m[1], +m[2], +m[3]) };
      }
      if (t.v === 'CASE') return this.caseExpr();
      if (t.v === 'CAST') {
        this.expectOp('('); var ce = this.expr(); this.expectKw('AS'); var ty = this.ident('a type like INTEGER, REAL or TEXT'); this.expectOp(')');
        return { t: 'cast', e: ce, type: ty.toUpperCase() };
      }
      this.p--;
      this.fail(t, t.v + ' is a SQL keyword and cannot be used here.' + (['FROM', 'WHERE', 'ORDER', 'GROUP'].indexOf(t.v) >= 0 ? ' Check for a missing value or an extra comma before it.' : ''));
    }
    if (t.t === 'op' && t.v === '(') {
      if (this.isKw('SELECT')) { var q = this.select(); this.expectOp(')'); return { t: 'sub', q: q }; }
      var e = this.expr(); this.expectOp(')', 'Missing a closing parenthesis ).'); return e;
    }
    if (t.t === 'op' && t.v === '*') { this.p--; this.fail(t); }
    if (t.t === 'id') {
      if (this.isOp('(')) {
        this.p++;
        var name = t.v.toUpperCase(), args = [], distinct = false, star = false;
        if (this.acceptOp('*')) star = true;
        else if (!this.isOp(')')) {
          if (this.acceptKw('DISTINCT')) distinct = true;
          do { args.push(this.expr()); } while (this.acceptOp(','));
        }
        this.expectOp(')', 'Missing a closing parenthesis ) after ' + name + '(.');
        return { t: 'fn', name: name, args: args, distinct: distinct, star: star };
      }
      if (this.acceptOp('.')) { var col = this.ident('a column name'); return { t: 'col', table: t.v, name: col, quoted: this.toks[this.p - 1].quoted }; }
      return { t: 'col', name: t.v, quoted: t.quoted };
    }
    this.p--;
    this.fail(t);
  };
  Parser.prototype.caseExpr = function () {
    var base = null, whens = [], els = null;
    if (!this.isKw('WHEN')) base = this.expr();
    while (this.acceptKw('WHEN')) { var w = this.expr(); this.expectKw('THEN'); whens.push({ w: w, then: this.expr() }); }
    if (this.acceptKw('ELSE')) els = this.expr();
    this.expectKw('END', 'CASE must finish with END.');
    return { t: 'case', base: base, whens: whens, els: els };
  };

  // ---------------- Values ----------------
  function truthy(v) { if (v === null || v === undefined) return null; if (typeof v === 'string') { var n = parseFloat(v); return !isNaN(n) && n !== 0; } return !!v && v !== 0; }
  function typeRank(v) { return v === null ? 0 : typeof v === 'number' || typeof v === 'boolean' ? 1 : 2; }
  function cmpVals(a, b, gviz) {
    if (typeof a === 'boolean') a = a ? 1 : 0; if (typeof b === 'boolean') b = b ? 1 : 0;
    var ra = typeRank(a), rb = typeRank(b);
    if (ra !== rb) return ra - rb;
    if (a === b) return 0;
    return a < b ? -1 : 1; // text comparison is case-sensitive, like SQLite
  }
  function likeRe(p) {
    var re = '';
    for (var i = 0; i < p.length; i++) {
      var c = p[i];
      re += c === '%' ? '[\\s\\S]*' : c === '_' ? '[\\s\\S]' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp('^' + re + '$', 'i');
  }
  function sqlNumify(v) {
    if (typeof v === 'number') return v;
    if (v === null) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    var m = /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(v);
    return m ? parseFloat(m[0]) : 0;
  }

  var AGG = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'TOTAL', 'GROUP_CONCAT'];
  function isAggCall(e) { return e.t === 'fn' && AGG.indexOf(e.name) >= 0 && !((e.name === 'MIN' || e.name === 'MAX') && e.args.length > 1); }
  function hasAgg(e) {
    if (!e || typeof e !== 'object') return false;
    if (isAggCall(e)) return true;
    if (e.t === 'sub' || e.t === 'insub') return false;
    for (var k in e) {
      var v = e[k];
      if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) if (v[i] && typeof v[i] === 'object' && (hasAgg(v[i]) || (v[i].w && (hasAgg(v[i].w) || hasAgg(v[i].then))))) return true; }
      else if (v && typeof v === 'object' && v.t && hasAgg(v)) return true;
    }
    return false;
  }

  // ---------------- Database ----------------
  function Database() { this.tables = {}; }
  Database.prototype.table = function (name) {
    var t = this.tables[String(name).toLowerCase()];
    if (!t) {
      var names = Object.keys(this.tables).map(function (k) { return this.tables[k].name; }, this);
      throw new SqlError('no such table: ' + name, 'Tables in this database: ' + names.join(', ') + '.');
    }
    return t;
  };
  Database.prototype.create = function (name, cols, rows) {
    var t = { name: name, cols: cols, rows: rows || [] };
    this.tables[name.toLowerCase()] = t; return t;
  };
  Database.prototype.serialize = function () {
    var self = this;
    return Object.keys(this.tables).map(function (k) { var t = self.tables[k]; return { name: t.name, cols: t.cols, rows: t.rows }; });
  };
  Database.load = function (data) {
    var db = new Database();
    data.forEach(function (t) { db.create(t.name, t.cols, t.rows); });
    return db;
  };

  // Scope = list of {alias, table}; a row = array (one entry per scope item) of row arrays
  function resolve(scope, e) {
    var name = e.name.toLowerCase(), hits = [];
    for (var i = 0; i < scope.length; i++) {
      var s = scope[i];
      if (e.table && s.alias.toLowerCase() !== e.table.toLowerCase()) continue;
      for (var j = 0; j < s.table.cols.length; j++) if (s.table.cols[j].name.toLowerCase() === name) hits.push([i, j]);
    }
    if (e.table && !scope.some(function (s) { return s.alias.toLowerCase() === e.table.toLowerCase(); })) {
      throw new SqlError('no such column: ' + e.table + '.' + e.name, '"' + e.table + '" is not a table name or alias in this query.');
    }
    if (hits.length > 1) throw new SqlError('ambiguous column name: ' + e.name, 'Two tables have a column called ' + e.name + '. Write it as table.' + e.name + ' (for example products.' + e.name + ').');
    if (!hits.length) {
      var hint = '';
      if (e.quoted === '"') hint = 'In SQL, text values go in \'single quotes\'. "Double quotes" mean a column name.';
      else {
        var all = []; scope.forEach(function (s) { s.table.cols.forEach(function (c) { all.push(c.name); }); });
        hint = all.length ? 'Columns available: ' + all.join(', ') + '.' : 'There is no FROM table, so there are no columns to use.';
      }
      throw new SqlError('no such column: ' + (e.table ? e.table + '.' : '') + e.name, hint);
    }
    return hits[0];
  }

  function Runner(db, gviz) { this.db = db; this.gviz = gviz; }

  Runner.prototype.ev = function (e, env) {
    var self = this, v, l, r;
    switch (e.t) {
      case 'lit': return e.v;
      case 'col': {
        if (env.outAlias && !e.table) { var oa = env.outAlias[e.name.toLowerCase()]; if (oa !== undefined) return oa; }
        if (!e._res || e._scope !== env.scope) { e._res = resolve(env.scope, e); e._scope = env.scope; }
        var row = env.row[e._res[0]];
        return row ? row[e._res[1]] : null;
      }
      case 'neg': v = this.ev(e.e, env); return v === null ? null : -sqlNumify(v);
      case 'not': v = truthy(this.ev(e.e, env)); return v === null ? null : (v ? 0 : 1);
      case 'isnull': v = this.ev(e.e, env); return ((v === null) !== e.neg) ? 1 : 0;
      case 'like': {
        v = this.ev(e.e, env); var p = this.ev(e.pat, env);
        if (v === null || p === null) return null;
        var res = likeRe(String(p)).test(String(v));
        return res !== e.neg ? 1 : 0;
      }
      case 'in': {
        v = this.ev(e.e, env); if (v === null) return null;
        var found = e.list.some(function (x) { return cmpVals(v, self.ev(x, env)) === 0; });
        return found !== e.neg ? 1 : 0;
      }
      case 'insub': {
        v = this.ev(e.e, env); if (v === null) return null;
        var sr = this.select(e.q, env);
        var f2 = sr.rows.some(function (rw) { return cmpVals(v, rw[0]) === 0; });
        return f2 !== e.neg ? 1 : 0;
      }
      case 'between': {
        v = this.ev(e.e, env); var lo = this.ev(e.lo, env), hi = this.ev(e.hi, env);
        if (v === null || lo === null || hi === null) return null;
        var inr = cmpVals(v, lo) >= 0 && cmpVals(v, hi) <= 0;
        return inr !== e.neg ? 1 : 0;
      }
      case 'sub': {
        var s = this.select(e.q, env);
        return s.rows.length ? s.rows[0][0] : null;
      }
      case 'case': {
        var base = e.base ? this.ev(e.base, env) : undefined;
        for (var i = 0; i < e.whens.length; i++) {
          var w = this.ev(e.whens[i].w, env);
          if (e.base ? (base !== null && cmpVals(base, w) === 0) : truthy(w)) return this.ev(e.whens[i].then, env);
        }
        return e.els ? this.ev(e.els, env) : null;
      }
      case 'cast': {
        v = this.ev(e.e, env); if (v === null) return null;
        if (/INT/.test(e.type)) return Math.trunc(sqlNumify(v));
        if (/REAL|FLOA|DOUB|NUM|DEC/.test(e.type)) return sqlNumify(v);
        return typeof v === 'number' ? fmtSqlNum(v) : String(v);
      }
      case 'gv': {
        l = this.ev(e.l, env); r = this.ev(e.r, env);
        if (l === null || r === null) return false;
        l = String(l); r = String(r);
        if (e.op === 'contains') return l.indexOf(r) >= 0;
        if (e.op === 'starts') return l.indexOf(r) === 0;
        if (e.op === 'ends') return l.slice(-r.length) === r;
        try { return new RegExp('^(?:' + r + ')$').test(l); } catch (x) { throw new SqlError('Invalid regular expression: ' + r); }
      }
      case 'bin': {
        if (e.op === 'AND') {
          l = truthy(this.ev(e.l, env)); if (l === false) return this.gviz ? false : 0;
          r = truthy(this.ev(e.r, env)); if (r === false) return this.gviz ? false : 0;
          return l === null || r === null ? null : (this.gviz ? true : 1);
        }
        if (e.op === 'OR') {
          l = truthy(this.ev(e.l, env)); if (l === true) return this.gviz ? true : 1;
          r = truthy(this.ev(e.r, env)); if (r === true) return this.gviz ? true : 1;
          return l === null || r === null ? null : (this.gviz ? false : 0);
        }
        l = this.ev(e.l, env); r = this.ev(e.r, env);
        if (l === null || r === null) return null;
        if (e.op === '||') return toText(l) + toText(r);
        if (['=', '<>', '<', '>', '<=', '>='].indexOf(e.op) >= 0) {
          var c = cmpVals(l, r);
          var b = e.op === '=' ? c === 0 : e.op === '<>' ? c !== 0 : e.op === '<' ? c < 0 : e.op === '>' ? c > 0 : e.op === '<=' ? c <= 0 : c >= 0;
          return this.gviz ? b : (b ? 1 : 0);
        }
        var x = sqlNumify(l), y = sqlNumify(r);
        switch (e.op) {
          case '+': return x + y;
          case '-': return x - y;
          case '*': return x * y;
          case '/':
            if (y === 0) return null;
            if (!this.gviz && isIntExpr(e.l, env) && isIntExpr(e.r, env) && Number.isInteger(x) && Number.isInteger(y)) return Math.trunc(x / y);
            return x / y;
          case '%': return y === 0 ? null : x % y;
        }
        throw new SqlError('unsupported operator ' + e.op);
      }
      case 'fn': return this.fn(e, env);
    }
    throw new SqlError('cannot evaluate expression');
  };
  // SQLite does integer division when both sides are integers (7 / 2 = 3). Track "integer-ness" of expressions.
  function isIntExpr(e, env) {
    switch (e.t) {
      case 'lit': return typeof e.v === 'number' && !e.real && Number.isInteger(e.v);
      case 'col': {
        try { var r = e._res || resolve(env.scope, e); var s = env.scope[r[0]]; return /INT/i.test(s.table.cols[r[1]].type || ''); }
        catch (x) { return false; }
      }
      case 'neg': return isIntExpr(e.e, env);
      case 'bin': return ['+', '-', '*', '%', '/'].indexOf(e.op) >= 0 && isIntExpr(e.l, env) && isIntExpr(e.r, env);
      case 'fn':
        if (e.name === 'COUNT' || e.name === 'LENGTH' || e.name === 'INSTR') return true;
        if ((e.name === 'SUM' || e.name === 'MIN' || e.name === 'MAX' || e.name === 'ABS') && e.args[0]) return isIntExpr(e.args[0], env);
        return false;
      case 'cast': return /INT/.test(e.type);
    }
    return false;
  }
  function fmtSqlNum(v) { return Number.isInteger(v) ? String(v) : String(+v.toPrecision(15)); }
  function toText(v) { return typeof v === 'number' ? fmtSqlNum(v) : typeof v === 'boolean' ? (v ? '1' : '0') : String(v); }

  Runner.prototype.fn = function (e, env) {
    var self = this, name = e.name;
    if (isAggCall(e)) {
      if (!env.group) throw new SqlError('misuse of aggregate function ' + name + '()', 'Aggregate functions like ' + name + '() cannot go in WHERE. Use HAVING after GROUP BY instead.');
      if (name === 'COUNT' && e.star) return env.group.length;
      if (e.star) throw new SqlError('near "*": syntax error', 'Only COUNT(*) can use *.');
      if (e.args.length < 1) throw new SqlError('wrong number of arguments to function ' + name + '()');
      var vals = [];
      env.group.forEach(function (row) {
        var v = self.ev(e.args[0], { scope: env.scope, row: row, parent: env.parent });
        if (v !== null) vals.push(v);
      });
      if (e.distinct) {
        var seen = {}; vals = vals.filter(function (v) { var k = typeof v + ':' + v; if (seen[k]) return false; seen[k] = 1; return true; });
      }
      switch (name) {
        case 'COUNT': return vals.length;
        case 'SUM': return vals.length ? vals.reduce(function (a, b) { return a + sqlNumify(b); }, 0) : (this.gviz ? 0 : null);
        case 'TOTAL': return vals.reduce(function (a, b) { return a + sqlNumify(b); }, 0);
        case 'AVG': return vals.length ? vals.reduce(function (a, b) { return a + sqlNumify(b); }, 0) / vals.length : null;
        case 'MIN': return vals.length ? vals.reduce(function (a, b) { return cmpVals(b, a) < 0 ? b : a; }) : null;
        case 'MAX': return vals.length ? vals.reduce(function (a, b) { return cmpVals(b, a) > 0 ? b : a; }) : null;
        case 'GROUP_CONCAT': {
          var sep = e.args.length > 1 ? toText(this.ev(e.args[1], env)) : ',';
          return vals.length ? vals.map(toText).join(sep) : null;
        }
      }
    }
    var a = e.args.map(function (x) { return self.ev(x, env); });
    function need(n, m) { if (a.length < n || a.length > (m == null ? n : m)) throw new SqlError('wrong number of arguments to function ' + name + '()'); }
    switch (name) {
      case 'UPPER': need(1); return a[0] === null ? null : toText(a[0]).toUpperCase();
      case 'LOWER': need(1); return a[0] === null ? null : toText(a[0]).toLowerCase();
      case 'LENGTH': case 'LEN': need(1); return a[0] === null ? null : toText(a[0]).length;
      case 'TRIM': need(1); return a[0] === null ? null : toText(a[0]).trim();
      case 'LTRIM': need(1); return a[0] === null ? null : toText(a[0]).replace(/^\s+/, '');
      case 'RTRIM': need(1); return a[0] === null ? null : toText(a[0]).replace(/\s+$/, '');
      case 'PRINTF': case 'FORMAT': {
        if (!a.length) throw new SqlError('wrong number of arguments to function ' + name + '()');
        var k = 1;
        return toText(a[0]).replace(/%(0?)(\d*)(?:\.(\d+))?([dsf%])/g, function (m0, zero, width, prec, kind) {
          if (kind === '%') return '%';
          var v = a[k++], out;
          if (v === null || v === undefined) out = kind === 's' ? '' : '0';
          else if (kind === 'd') out = String(Math.trunc(sqlNumify(v)));
          else if (kind === 'f') out = sqlNumify(v).toFixed(prec === undefined ? 6 : +prec);
          else out = toText(v);
          var w = +width || 0;
          while (out.length < w) out = (zero && kind !== 's' ? '0' : ' ') + out;
          if (zero && kind !== 's' && out.indexOf('-') > 0) out = '-' + out.replace('-', '0');
          return out;
        });
      }
      case 'ABS': need(1); return a[0] === null ? null : Math.abs(sqlNumify(a[0]));
      case 'ROUND': {
        need(1, 2); if (a[0] === null) return null;
        var d = a.length > 1 ? sqlNumify(a[1]) : 0, m = Math.pow(10, d), x = sqlNumify(a[0]);
        var r = Math.round(Math.abs(x) * m * (1 + 2 * Number.EPSILON)) / m; return x < 0 ? -r : r;
      }
      case 'SUBSTR': case 'SUBSTRING': {
        need(2, 3); if (a[0] === null) return null;
        var s = toText(a[0]), st = sqlNumify(a[1]), ln = a.length > 2 ? sqlNumify(a[2]) : s.length;
        return s.substr(st > 0 ? st - 1 : Math.max(0, s.length + st), ln);
      }
      case 'REPLACE': need(3); return a[0] === null ? null : toText(a[0]).split(toText(a[1])).join(toText(a[2]));
      case 'INSTR': need(2); return a[0] === null ? null : toText(a[0]).indexOf(toText(a[1])) + 1;
      case 'COALESCE': case 'IFNULL':
        if (a.length < 2) throw new SqlError('wrong number of arguments to function ' + name + '()');
        for (var i = 0; i < a.length; i++) if (a[i] !== null) return a[i];
        return null;
      case 'NULLIF': need(2); return cmpVals(a[0], a[1]) === 0 ? null : a[0];
      case 'MIN': return a.some(function (z) { return z === null; }) ? null : a.reduce(function (p, q) { return cmpVals(q, p) < 0 ? q : p; });
      case 'MAX': return a.some(function (z) { return z === null; }) ? null : a.reduce(function (p, q) { return cmpVals(q, p) > 0 ? q : p; });
      case 'IIF': need(3); return truthy(a[0]) ? a[1] : a[2];
      case 'TYPEOF': need(1); return a[0] === null ? 'null' : typeof a[0] === 'number' ? (Number.isInteger(a[0]) ? 'integer' : 'real') : 'text';
      case 'STRFTIME': {
        need(2); if (a[1] === null) return null;
        var dt = parseIsoDate(a[1]); if (!dt) return null;
        return toText(a[0]).replace(/%([YmdjwW%])/g, function (m0, k) {
          if (k === 'Y') return String(dt.y);
          if (k === 'm') return ('0' + dt.m).slice(-2);
          if (k === 'd') return ('0' + dt.d).slice(-2);
          if (k === 'w') return String(new Date(Date.UTC(dt.y, dt.m - 1, dt.d)).getUTCDay());
          return k === '%' ? '%' : m0;
        });
      }
      case 'DATE': {
        need(1, 3);
        if (toText(a[0]).toLowerCase() === 'now') { var n = new Date(); return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2); }
        var p = parseIsoDate(a[0]); return p ? p.y + '-' + ('0' + p.m).slice(-2) + '-' + ('0' + p.d).slice(-2) : null;
      }
      // Google Sheets QUERY scalar functions
      case 'YEAR': need(1); if (this.gviz) return SX.engine.fromSerial(sqlNumify(a[0])).y; break;
      case 'MONTH': need(1); if (this.gviz) return SX.engine.fromSerial(sqlNumify(a[0])).m - 1; break; // 0-based in QUERY!
      case 'DAY': need(1); if (this.gviz) return SX.engine.fromSerial(sqlNumify(a[0])).d; break;
    }
    var hint = '';
    if (['IF', 'VLOOKUP', 'SUMIF', 'COUNTIF', 'XLOOKUP', 'CONCATENATE', 'LEFT', 'RIGHT'].indexOf(name) >= 0) {
      hint = name + ' is a spreadsheet function, not SQL. ' + ({
        IF: 'Use CASE WHEN ... THEN ... ELSE ... END.', VLOOKUP: 'Use a JOIN.', XLOOKUP: 'Use a JOIN.',
        SUMIF: 'Use SUM(...) with WHERE or GROUP BY.', COUNTIF: 'Use COUNT(*) with WHERE or GROUP BY.',
        CONCATENATE: 'Use the || operator: first || \' \' || last.', LEFT: 'Use SUBSTR(text, 1, n).', RIGHT: 'Use SUBSTR(text, -n).'
      })[name];
    }
    throw new SqlError('no such function: ' + name, hint);
  };
  function parseIsoDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
  }

  Runner.prototype.select = function (q, parentEnv) {
    var self = this, db = this.db;
    var scope = [], rows;
    if (q.virtual) { scope = [{ alias: 'data', table: q.virtual }]; rows = q.virtual.rows.map(function (r) { return [r]; }); }
    else if (q.from) {
      var t0 = db.table(q.from.name);
      scope = [{ alias: q.from.alias, table: t0 }];
      rows = t0.rows.map(function (r) { return [r]; });
      q.joins.forEach(function (j) {
        var tj = db.table(j.table.name);
        if (scope.some(function (s) { return s.alias.toLowerCase() === j.table.alias.toLowerCase(); })) {
          throw new SqlError('ambiguous table name: ' + j.table.alias, 'Give each copy of the table a different alias, like products p1 JOIN products p2.');
        }
        scope = scope.concat([{ alias: j.table.alias, table: tj }]);
        var out = [];
        rows.forEach(function (left) {
          var matched = false;
          tj.rows.forEach(function (right) {
            var combo = left.concat([right]);
            if (!j.on || truthy(self.ev(j.on, { scope: scope, row: combo, parent: parentEnv }))) { out.push(combo); matched = true; }
          });
          if (!matched && j.kind === 'LEFT') out.push(left.concat([null]));
        });
        rows = out;
      });
    } else rows = [[]];

    var env0 = function (row) { return { scope: scope, row: row, parent: parentEnv }; };
    if (q.where) rows = rows.filter(function (r) { return truthy(self.ev(q.where, env0(r))); });

    // Expand select items
    var items = [];
    q.items.forEach(function (it) {
      if (it.star) {
        var any = false;
        scope.forEach(function (s, si) {
          if (it.table && s.alias.toLowerCase() !== it.table.toLowerCase()) return;
          any = true;
          s.table.cols.forEach(function (c, ci) { items.push({ expr: { t: 'col', table: s.alias, name: c.name }, name: c.name, star: true }); });
        });
        if (!any) throw new SqlError(it.table ? 'no such table: ' + it.table : 'no tables specified', it.table ? '' : 'SELECT * needs a FROM table.');
      } else items.push({ expr: it.expr, name: it.alias || (it.expr.t === 'col' ? it.expr.name : it.text), alias: it.alias });
    });

    // SQLite lets GROUP BY use a select alias (GROUP BY month)
    var groupExprs = q.group.map(function (g) {
      if (g.t !== 'col' || g.table) return g;
      try { resolve(scope, g); return g; } catch (x) {
        var hit = items.filter(function (i) { return i.alias && i.alias.toLowerCase() === g.name.toLowerCase(); })[0];
        if (hit) return hit.expr;
        throw x;
      }
    });

    var grouped = q.group.length > 0 || items.some(function (i) { return hasAgg(i.expr); }) || (q.having && hasAgg(q.having));
    var out = []; // {vals, env}
    if (grouped) {
      var groups = {}, order = [];
      rows.forEach(function (r) {
        var k = groupExprs.map(function (g) { var v = self.ev(g, env0(r)); return typeof v + ':' + v; }).join('|');
        if (!groups[k]) { groups[k] = []; order.push(k); }
        groups[k].push(r);
      });
      if (!q.group.length && !order.length) { groups[''] = []; order.push(''); }
      order.forEach(function (k) {
        var g = groups[k];
        var env = { scope: scope, row: g[0] || [], group: g, parent: parentEnv };
        if (q.having && !truthy(self.ev(q.having, env))) return;
        out.push({ vals: items.map(function (i) { return self.ev(i.expr, env); }), env: env });
      });
    } else {
      if (q.having) throw new SqlError('a GROUP BY clause is required before HAVING', 'HAVING filters groups. Use WHERE to filter rows.');
      rows.forEach(function (r) {
        var env = env0(r);
        out.push({ vals: items.map(function (i) { return self.ev(i.expr, env); }), env: env });
      });
    }

    if (q.distinct) {
      var seen = {};
      out = out.filter(function (o) { var k = JSON.stringify(o.vals); if (seen[k]) return false; seen[k] = 1; return true; });
    }
    if (q.order.length) {
      var aliasIdx = {};
      items.forEach(function (it, i) { if (it.alias) aliasIdx[it.alias.toLowerCase()] = i; });
      out.forEach(function (o) {
        o.keys = q.order.map(function (ob) {
          var e = ob.expr;
          if (e.t === 'lit' && typeof e.v === 'number') {
            if (e.v < 1 || e.v > items.length) throw new SqlError(ordinalWord(e.v) + ' ORDER BY term out of range - should be between 1 and ' + items.length);
            return o.vals[e.v - 1];
          }
          if (e.t === 'col' && !e.table && aliasIdx.hasOwnProperty(e.name.toLowerCase())) return o.vals[aliasIdx[e.name.toLowerCase()]];
          return self.ev(e, o.env);
        });
      });
      out.sort(function (a, b) {
        for (var i = 0; i < q.order.length; i++) {
          var c = cmpVals(a.keys[i], b.keys[i]);
          if (c) return q.order[i].desc ? -c : c;
        }
        return 0;
      });
    }
    var off = q.offset ? sqlNumify(this.ev(q.offset, { scope: [], row: [] })) : 0;
    var lim = q.limit ? sqlNumify(this.ev(q.limit, { scope: [], row: [] })) : -1;
    if (off || lim >= 0) out = out.slice(off, lim >= 0 ? off + lim : undefined);
    return { columns: items.map(function (i) { return i.name; }), rows: out.map(function (o) { return o.vals; }), items: items };
  };
  function ordinalWord(n) { return ['1st', '2nd', '3rd'][n - 1] || n + 'th'; }

  Runner.prototype.run = function (st) {
    var db = this.db, self = this;
    switch (st.type) {
      case 'select': { var r = this.select(st, null); return { type: 'rows', columns: r.columns, rows: r.rows }; }
      case 'insert': {
        var t = db.table(st.table);
        var cols = st.cols ? st.cols.map(function (c) {
          var i = t.cols.findIndex(function (x) { return x.name.toLowerCase() === c.toLowerCase(); });
          if (i < 0) throw new SqlError('table ' + t.name + ' has no column named ' + c);
          return i;
        }) : t.cols.map(function (_, i) { return i; });
        var srcRows = st.select ? this.select(st.select, null).rows : st.rows.map(function (r) { return r.map(function (e) { return self.ev(e, { scope: [], row: [] }); }); });
        srcRows.forEach(function (vals) {
          if (vals.length !== cols.length) throw new SqlError('table ' + t.name + ' has ' + t.cols.length + ' columns but ' + vals.length + ' values were supplied', st.cols ? '' : 'List the columns you are filling: INSERT INTO ' + t.name + ' (col1, col2) VALUES (...).');
          var row = t.cols.map(function () { return null; });
          cols.forEach(function (ci, k) { row[ci] = coerce(vals[k], t.cols[ci].type); });
          t.rows.push(row);
        });
        return { type: 'msg', message: srcRows.length + ' row' + (srcRows.length === 1 ? '' : 's') + ' inserted into ' + t.name + '.', changed: srcRows.length };
      }
      case 'update': {
        var tu = db.table(st.table), scope = [{ alias: tu.name, table: tu }], n = 0;
        var idx = st.sets.map(function (s) {
          var i = tu.cols.findIndex(function (x) { return x.name.toLowerCase() === s.col.toLowerCase(); });
          if (i < 0) throw new SqlError('no such column: ' + s.col);
          return i;
        });
        tu.rows.forEach(function (row) {
          var env = { scope: scope, row: [row] };
          if (st.where && !truthy(self.ev(st.where, env))) return;
          var nv = st.sets.map(function (s) { return self.ev(s.expr, env); });
          idx.forEach(function (ci, k) { row[ci] = coerce(nv[k], tu.cols[ci].type); });
          n++;
        });
        return { type: 'msg', message: n + ' row' + (n === 1 ? '' : 's') + ' updated in ' + tu.name + '.' + (st.where ? '' : ' (No WHERE clause — every row was changed!)'), changed: n, noWhere: !st.where };
      }
      case 'delete': {
        var td = db.table(st.table), sc = [{ alias: td.name, table: td }], before = td.rows.length;
        td.rows = td.rows.filter(function (row) { return st.where && !truthy(self.ev(st.where, { scope: sc, row: [row] })); });
        var nd = before - td.rows.length;
        return { type: 'msg', message: nd + ' row' + (nd === 1 ? '' : 's') + ' deleted from ' + td.name + '.' + (st.where ? '' : ' (No WHERE clause — the whole table was emptied!)'), changed: nd, noWhere: !st.where };
      }
      case 'create': {
        if (db.tables[st.table.toLowerCase()]) throw new SqlError('table ' + st.table + ' already exists');
        db.create(st.table, st.cols, []);
        return { type: 'msg', message: 'Table ' + st.table + ' created with ' + st.cols.length + ' columns.' };
      }
      case 'drop': {
        db.table(st.table);
        delete db.tables[st.table.toLowerCase()];
        return { type: 'msg', message: 'Table ' + st.table + ' dropped.' };
      }
    }
  };
  function coerce(v, type) {
    if (v === null) return null;
    if (/INT/.test(type)) { var n = sqlNumify(v); return typeof v === 'string' && !/^\s*[+-]?\d/.test(v) ? v : Math.round(n) === n ? n : n; }
    if (/REAL|FLOA|DOUB|NUM|DEC/.test(type)) return typeof v === 'string' && !/^\s*[+-]?[\d.]/.test(v) ? v : sqlNumify(v);
    return v;
  }

  function execute(db, src) {
    var p = new Parser(src, false);
    var stmts = p.statements();
    if (!stmts.length) throw new SqlError('No SQL to run.', 'Type a query like: SELECT * FROM products;');
    var runner = new Runner(db, false), results = [];
    stmts.forEach(function (st) { var r = runner.run(st); r.statement = st; results.push(r); });
    return results;
  }

  // Default store database
  function makeStoreDb() {
    var D = SX.data, db = new Database();
    db.create('products', [
      { name: 'sku', type: 'TEXT' }, { name: 'product', type: 'TEXT' }, { name: 'category', type: 'TEXT' },
      { name: 'price', type: 'REAL' }, { name: 'cost', type: 'REAL' }, { name: 'in_stock', type: 'INTEGER' },
      { name: 'reorder_at', type: 'INTEGER' }, { name: 'supplier', type: 'TEXT' }], D.PRODUCTS.map(function (r) { return r.slice(); }));
    db.create('sales', [
      { name: 'order_id', type: 'INTEGER' }, { name: 'order_date', type: 'TEXT' }, { name: 'store_id', type: 'TEXT' },
      { name: 'sku', type: 'TEXT' }, { name: 'qty', type: 'INTEGER' }, { name: 'rep', type: 'TEXT' }], D.SALES.map(function (r) { return r.slice(); }));
    db.create('stores', [
      { name: 'store_id', type: 'TEXT' }, { name: 'city', type: 'TEXT' }, { name: 'state', type: 'TEXT' },
      { name: 'zip', type: 'INTEGER' }, { name: 'manager', type: 'TEXT' }, { name: 'opened', type: 'TEXT' }], D.STORES.map(function (r) { return r.slice(); }));
    // v2: the messy order feed, imported "as is" (everything TEXT, blanks become NULL)
    if (SX.wrangle) {
      var W = SX.wrangle;
      db.create('raw_orders', [
        { name: 'order_id', type: 'INTEGER' }, { name: 'store', type: 'TEXT' }, { name: 'item_code', type: 'TEXT' }, { name: 'order_date', type: 'TEXT' },
        { name: 'qty', type: 'TEXT' }, { name: 'unit_price', type: 'TEXT' }, { name: 'customer', type: 'TEXT' }, { name: 'channel', type: 'TEXT' }],
        W.MESSY.map(function (m, i) {
          var t = W.TRUTH[i];
          var date = m.dateKind === 'real' ? t.m + '/' + t.d + '/' + t.y : m.date;
          return [t.id, m.store, String(m.code), date, m.qty === '' ? null : String(m.qty), String(m.price), m.customer, m.channel];
        }));
      db.create('item_codes', [{ name: 'code', type: 'TEXT' }, { name: 'product', type: 'TEXT' }, { name: 'category', type: 'TEXT' }, { name: 'price', type: 'REAL' }],
        W.ITEMS.map(function (it) { return [it.code, it.product, it.category, it.price]; }));
    }
    return db;
  }

  // ---------------- Google Sheets QUERY ----------------
  function gvizQuery(mat, query, headers, colOffset) {
    var F = SX.f, XErr = F.XErr;
    var rows = mat.rows;
    if (headers < 0) {
      headers = rows.length > 1 && rows[0].every(function (v) { return typeof v === 'string'; }) &&
        rows[1].some(function (v) { return typeof v !== 'string'; }) ? 1 : 0;
    }
    var w = rows.length ? rows[0].length : 0;
    var colNames = [];
    for (var j = 0; j < w; j++) colNames.push(colOffset != null ? F.idxToCol(colOffset + j) : 'Col' + (j + 1));
    var heads = colNames.map(function (n, j) {
      return headers > 0 ? rows.slice(0, headers).map(function (r) { return r[j] == null ? '' : String(r[j]); }).join(' ').trim() : '';
    });
    var body = rows.slice(headers).filter(function (r) { return r.some(function (v) { return v !== null && v !== ''; }); })
      .map(function (r) { return r.map(function (v) { return F.isErr(v) ? null : v; }); });
    var table = { name: 'data', cols: colNames.map(function (n) { return { name: n }; }), rows: body };
    var q;
    try {
      var p = new Parser(query.trim() ? query : 'select *', true);
      if (!p.isKw('SELECT')) {
        // QUERY allows starting with "where", "order by", etc.
        p = new Parser('select * ' + query, true);
      }
      q = p.select();
      if (p.peek().t !== 'eof') p.fail();
    } catch (e) {
      if (e instanceof SqlError) return new XErr('#VALUE!', 'Unable to parse query string for Function QUERY parameter 2: ' + e.message.replace(/: syntax error$/, '') + (e.hint ? ' — ' + e.hint : ''));
      throw e;
    }
    q.virtual = table;
    var res;
    try { res = new Runner(new Database(), true).select(q, null); }
    catch (e2) {
      if (e2 instanceof SqlError) {
        var m = /^no such column: (.*)$/.exec(e2.message);
        return new XErr('#VALUE!', 'Unable to parse query string for Function QUERY parameter 2: ' + (m ? 'NO_COLUMN: ' + m[1] + ' (columns are named by letter: ' + colNames.slice(0, Math.min(colNames.length, 8)).join(', ') + ')' : e2.message));
      }
      throw e2;
    }
    // header labels
    var labels = res.items.map(function (it) {
      var e = it.expr;
      var lab = q.labels.filter(function (l) { return JSON.stringify(stripCache(l.expr)) === JSON.stringify(stripCache(e)); })[0];
      if (lab) return lab.text;
      if (e.t === 'col') { var ci = colNames.indexOf(e.name.toUpperCase()); if (ci < 0) ci = colNames.indexOf(e.name); return ci >= 0 && heads[ci] ? heads[ci] : ''; }
      if (e.t === 'fn' && isAggCall(e) && e.args[0] && e.args[0].t === 'col') {
        var cj = colNames.indexOf(e.args[0].name.toUpperCase()); if (cj < 0) cj = colNames.indexOf(e.args[0].name);
        return e.name.toLowerCase() + ' ' + (cj >= 0 && heads[cj] ? heads[cj] : e.args[0].name);
      }
      return it.name;
    });
    var outRows = res.rows.map(function (r) { return r.map(function (v) { return v === undefined ? null : v; }); });
    var showHeader = headers > 0 || q.labels.length || res.items.some(function (it) { return it.expr.t !== 'col'; });
    if (showHeader) outRows.unshift(labels);
    if (!outRows.length) return new XErr('#N/A', 'Query completed with an empty output.');
    return new F.Mat(outRows);
  }
  function stripCache(e) { return JSON.parse(JSON.stringify(e, function (k, v) { return k === '_res' || k === '_scope' ? undefined : v; })); }

  // Column names in gviz mode are case-insensitive letters: normalize at resolve time
  var origResolve = resolve;
  resolve = function (scope, e) {
    if (scope.length === 1 && scope[0].alias === 'data' && !e.table) {
      var up = e.name.toUpperCase();
      var cols = scope[0].table.cols;
      for (var j = 0; j < cols.length; j++) if (cols[j].name.toUpperCase() === up) return [0, j];
    }
    return origResolve(scope, e);
  };

  SX.sql = { Database: Database, SqlError: SqlError, execute: execute, makeStoreDb: makeStoreDb, gvizQuery: gvizQuery, lex: lex };
})(globalThis.SX = globalThis.SX || {});
