/* SheetEX — CSV/TSV parsing, writing and "what a spreadsheet would do" conversions. */
(function (SX) {
  'use strict';

  // RFC 4180-style parser that also reports problems a student can learn from.
  function parse(text, delim) {
    var rows = [], row = [], field = '', i = 0, n = text.length, inQ = false, quotedField = false;
    var problems = [], line = 1, rowLine = 1;
    function endField() { row.push({ v: field, q: quotedField }); field = ''; quotedField = false; }
    function endRow() { endField(); rows.push({ cells: row, line: rowLine }); row = []; rowLine = line; }
    while (i < n) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++;
          if (i < n && text[i] !== delim && text[i] !== '\n' && text[i] !== '\r') {
            problems.push({ line: line, msg: 'Text right after a closing quote. A quote inside a quoted value must be doubled: ""' });
          }
          continue;
        }
        if (ch === '\n') line++;
        field += ch; i++; continue;
      }
      if (ch === '"') {
        if (field === '') { inQ = true; quotedField = true; i++; continue; }
        problems.push({ line: line, msg: 'A quote mark " in the middle of an unquoted value. Wrap the whole value in quotes and double the inner quote.' });
        field += ch; i++; continue;
      }
      if (ch === delim) { endField(); i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { line++; endRow(); i++; continue; }
      field += ch; i++;
    }
    if (inQ) problems.push({ line: rowLine, msg: 'A quoted value was never closed — the rest of the file was swallowed into one field.' });
    if (field !== '' || row.length) endRow();
    // field-count check
    if (rows.length) {
      var expect = rows[0].cells.length;
      rows.forEach(function (r, idx) {
        if (idx && r.cells.length !== expect && !(r.cells.length === 1 && r.cells[0].v === '')) {
          r.bad = true;
          problems.push({ line: r.line, msg: 'Row has ' + r.cells.length + ' fields but the header has ' + expect + '.' + (r.cells.length > expect && delim === ',' ? ' Is there an unquoted comma inside a value?' : '') });
        }
      });
    }
    return { rows: rows, problems: problems };
  }

  function detectDelimiter(text) {
    var first = text.split('\n').slice(0, 5).join('\n');
    var tabs = (first.match(/\t/g) || []).length, commas = (first.match(/,/g) || []).length, semis = (first.match(/;/g) || []).length;
    if (tabs && tabs >= commas / 2) return '\t';
    if (semis > commas) return ';';
    return ',';
  }

  function quote(v, delim) {
    var s = v === null || v === undefined ? '' : String(v);
    if (s.indexOf(delim) >= 0 || s.indexOf('"') >= 0 || /[\r\n]/.test(s) || /^\s|\s$/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function stringify(rows, delim) {
    return rows.map(function (r) { return r.map(function (v) { return quote(v, delim); }).join(delim); }).join('\n') + '\n';
  }

  // What Excel/Sheets do when they OPEN a CSV: guess types.
  function autoConvert(s) {
    if (s === '') return { v: '', changed: false };
    var t = s.trim();
    if (/^[+-]?\d+$/.test(t)) {
      if (t.replace(/^[+-]/, '').length > 15) {
        var n = Number(t);
        return { v: SX.engine.generalDisplay(n), changed: true, why: 'More than 15 digits: spreadsheets store numbers with 15 digits of precision and show it in scientific notation. The real digits are lost!' };
      }
      if (/^[+-]?0\d/.test(t)) return { v: String(Number(t)), changed: true, why: 'Leading zero dropped — the spreadsheet decided this was a number.' };
      if (t.length >= 12) return { v: SX.engine.generalDisplay(Number(t)), changed: true, why: 'Long numbers are shown in scientific notation.' };
      return { v: t, changed: false, num: true };
    }
    if (/^[+-]?(\d+\.\d*|\.\d+)$/.test(t)) {
      var x = Number(t), d = SX.engine.generalDisplay(x);
      return { v: d, changed: d !== t, num: true, why: d !== t ? 'Trailing zeros dropped (4.50 → 4.5). Formatting is not stored in a CSV.' : '' };
    }
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
    if (p) return { v: (+p[2]) + '/' + (+p[3]) + '/' + p[1], changed: true, why: 'Recognized as a date and reformatted.' };
    var md = /^(\d{1,2})-(\d{1,2})$/.exec(t);
    if (md && +md[1] <= 12) return { v: (+md[2]) + '-' + SX.engine.MONTHS[+md[1] - 1].slice(0, 3), changed: true, why: 'Looked like a date (month-day), so it was turned into one!' };
    if (/^(TRUE|FALSE)$/i.test(t)) return { v: t.toUpperCase(), changed: t !== t.toUpperCase(), why: 'Became a TRUE/FALSE value.' };
    if (/^=/.test(t)) return { v: t, changed: true, formula: true, why: 'Starts with = so a spreadsheet would run it as a FORMULA. (Hackers use this trick — it is called CSV injection.)' };
    return { v: s, changed: false };
  }

  // Export a workbook sheet as CSV text: values only.
  function exportSheet(wb, sheetName, delim) {
    var s = wb.sheet(sheetName);
    var maxR = -1, maxC = -1, formulas = 0, fmtCells = 0, spilled = 0;
    Object.keys(s.cells).forEach(function (k) {
      var p = k.split(','), r = +p[0], c = +p[1];
      maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
      if (s.cells[k].isFormula) formulas++;
    });
    Object.keys(wb.cover).forEach(function (k) {
      if (k.indexOf(s.name + '|') !== 0) return;
      var p = k.split('|')[1].split(','); maxR = Math.max(maxR, +p[0]); maxC = Math.max(maxC, +p[1]); spilled++;
    });
    var rows = [], examples = [];
    for (var r = 0; r <= maxR; r++) {
      var row = [];
      for (var c = 0; c <= maxC; c++) {
        var d = wb.display(s.name, r, c);
        var cell = s.cells[r + ',' + c];
        var v = d.value;
        var out;
        if (d.err) out = d.text;
        else if (typeof v === 'number') {
          if (d.fmt === 'date') out = d.text; // dates are written as text the way they look
          else { out = SX.engine.generalDisplay(v); if (d.fmt && d.fmt !== 'general') fmtCells++; }
        } else out = d.text;
        if (cell && cell.isFormula && examples.length < 3) examples.push({ addr: SX.f.addr(r, c), formula: cell.input, value: out });
        row.push(out);
      }
      rows.push(row);
    }
    return { text: stringify(rows, delim), formulas: formulas, fmtCells: fmtCells, spilled: spilled, examples: examples,
      otherSheets: wb.sheets.map(function (x) { return x.name; }).filter(function (n) { return n !== s.name; }) };
  }

  function defaultFiles() {
    var D = SX.data;
    function rowsOf(headers, data) { return [headers].concat(data); }
    var products = stringify(rowsOf(D.PRODUCT_HEADERS, D.PRODUCTS), ',');
    var broken = rowsOf(D.PRODUCT_HEADERS, D.PRODUCTS).map(function (r) { return r.join(','); }).join('\n') + '\n';
    return {
      'products.csv': products,
      'sales.csv': stringify(rowsOf(D.SALES_HEADERS, D.SALES), ','),
      'stores.csv': stringify(rowsOf(D.STORE_HEADERS, D.STORES), ','),
      'suppliers.csv': stringify(rowsOf(D.SUPPLIER_HEADERS, D.SUPPLIERS), ','),
      'broken_products.csv': broken
    };
  }

  SX.csv = { parse: parse, stringify: stringify, detectDelimiter: detectDelimiter, autoConvert: autoConvert, exportSheet: exportSheet, defaultFiles: defaultFiles, quote: quote };
})(globalThis.SX = globalThis.SX || {});
