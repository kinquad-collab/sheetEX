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
