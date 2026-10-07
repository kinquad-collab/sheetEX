/* SheetEX — menus and dialogs for the sheet tools (sort, filter, cleanup, validation, conditional formatting,
 * pivot tables, charts). Each app gets its own menu names and the behaviors that really differ:
 *   Excel: Sort warns when you sort one column of a table; Text to Columns asks before overwriting; data validation
 *          refuses bad typing (but not pasted or existing data — use Circle Invalid Data); pivots need Refresh.
 *   Google Sheets: "Sort range" sorts only what you selected; "Sort sheet" moves the header row too unless it is frozen;
 *          there is a Trim whitespace button; validation warns by default; pivots update by themselves; no
 *          "duplicate values" preset in conditional formatting (use a custom formula). */
(function (SX) {
  'use strict';
  var UI = SX.ui, h = UI.h, T = SX.tools, F = SX.f, SV = UI.SheetView.prototype;
  var ROWS = SX.Workbook.ROWS, COLS = SX.Workbook.COLS;
  var SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'];

  // ---------- menus ----------
  SV.menuItems = function (tab) {
    var self = this, x = this.excel, t = tab.toLowerCase(), f = (this.wb.sheet(this.sheet).meta || {}).filter;
    var it = function (label, fn, opts) { return Object.assign({ label: label, fn: fn }, opts || {}); }, sep = { sep: true };
    if (x) {
      if (t === 'home') return [it('Conditional Formatting…', function () { self.cfDialog(); }), it('Clear Rules from Selected Cells', function () { self.cfClear(); }), sep,
        it('Find & Replace…', function () { self.findDialog(); }, { key: 'Ctrl+H' }), it('Paste Values', function () { self.pasteValuesOnly(); }, { key: 'Ctrl+Alt+V' })];
      if (t === 'insert') return [it('PivotTable…', function () { self.pivotDialog(); }), it('Chart…', function () { self.chartDialog(); })];
      if (t === 'data') return [it('Sort A to Z', function () { self.quickSort(false); }), it('Sort Z to A', function () { self.quickSort(true); }), it('Sort…', function () { self.sortDialog(); }), sep,
        it('Filter', function () { self.toggleFilter(); }, { on: !!f }), it('Clear Filter', function () { self.clearFilterCriteria(); }, { disabled: !f }), sep,
        it('Remove Duplicates…', function () { self.dedupeDialog(); }), it('Text to Columns…', function () { self.splitDialog(); }), it('Data Validation…', function () { self.dvDialog(); }),
        it(this.circles ? 'Clear Validation Circles' : 'Circle Invalid Data', function () { self.circles = !self.circles; self.refresh(); }), sep,
        it('Refresh All', function () { self.refreshPivots(); }, { key: 'Ctrl+Alt+F5' })];
      return null;
    }
    if (t === 'edit') return [it('Paste special ▸ Values only', function () { self.pasteValuesOnly(); }, { key: 'Ctrl+Shift+V' }), it('Find and replace', function () { self.findDialog(); }, { key: 'Ctrl+H' })];
    if (t === 'insert') return [it('Chart', function () { self.chartDialog(); }), it('Pivot table', function () { self.pivotDialog(); })];
    if (t === 'format') return [it('Conditional formatting', function () { self.cfDialog(); }), it('Clear conditional formatting (selection)', function () { self.cfClear(); })];
    if (t === 'data') return [it('Sort sheet by column ' + F.idxToCol(this.c) + ' (A → Z)', function () { self.sortSheet(false); }), it('Sort sheet by column ' + F.idxToCol(this.c) + ' (Z → A)', function () { self.sortSheet(true); }),
      it('Sort range…', function () { self.sortDialog(); }), sep,
      it(f ? 'Remove filter' : 'Create a filter', function () { self.toggleFilter(); }), sep,
      it('Data cleanup ▸ Remove duplicates', function () { self.dedupeDialog(); }), it('Data cleanup ▸ Trim whitespace', function () { self.trimSel(); }),
      it('Split text to columns', function () { self.splitDialog(); }), sep, it('Data validation', function () { self.dvDialog(); })];
    return null;
  };
  SV.openMenu = function (tab, anchor) {
    var self = this, items = this.menuItems(tab);
    this.closeMenu();
    if (!items) { UI.toast(tab, 'This menu is not part of this practice app. Try Data, Insert, ' + (this.excel ? 'or Home.' : 'Format or Edit.')); return; }
    if (this.editing) this.endEdit(true, 0, 0);
    var pop = this.menuPop = h('div.menu-pop', { role: 'menu' }, items.map(function (i) {
      if (i.sep) return h('div.menu-sep');
      return h('button.menu-cmd' + (i.on ? '.on' : ''), { role: 'menuitem', disabled: !!i.disabled, onmousedown: function (e) { e.preventDefault(); },
        onclick: function () { self.closeMenu(); i.fn(); } }, [h('span', { text: (i.on ? '✓ ' : '') + i.label }), i.key ? h('kbd', { text: i.key }) : null]);
    }));
    var rr = anchor.getBoundingClientRect(), root = this.root.getBoundingClientRect();
    pop.style.left = (rr.left - root.left) + 'px'; pop.style.top = (rr.bottom - root.top) + 'px';
    this.root.appendChild(pop);
    anchor.classList.add('open');
    this.menuAnchor = anchor;
    setTimeout(function () { self.onMenuAway = function (e) { if (!pop.contains(e.target)) self.closeMenu(); }; document.addEventListener('mousedown', self.onMenuAway); }, 0);
  };
  SV.closeMenu = function () {
    if (this.menuPop) { this.menuPop.remove(); this.menuPop = null; }
    if (this.menuAnchor) { this.menuAnchor.classList.remove('open'); this.menuAnchor = null; }
    if (this.onMenuAway) { document.removeEventListener('mousedown', this.onMenuAway); this.onMenuAway = null; }
  };

  // ---------- helpers ----------
  SV.workRange = function () {
    var s = this.selRange();
    if (s.r1 === s.r2 && s.c1 === s.c2) return T.currentRegion(this.wb, this.sheet, this.r, this.c);
    // whole-column / whole-row selections shrink to the data
    var maxR = this.wb.maxRow(this.sheet), maxC = Math.max(this.wb.maxCol(this.sheet), s.c1);
    return { r1: s.r1, c1: s.c1, r2: Math.min(s.r2, Math.max(maxR, s.r1)), c2: Math.min(s.c2, maxC) };
  };
  SV.addr = function (R) { return F.idxToCol(R.c1) + (R.r1 + 1) + ':' + F.idxToCol(R.c2) + (R.r2 + 1); };
  SV.guessHeader = function (R) {
    var wb = this.wb, s = this.sheet, allText = true;
    for (var c = R.c1; c <= R.c2; c++) { var x = wb.value(s, R.r1, c); if (typeof x !== 'string' || x === '') allText = false; }
    return allText && R.r2 > R.r1;
  };
  SV.locked = function () {
    var P = (this.wb.sheet(this.sheet).meta || {}).pivot;
    if (!P) return false;
    UI.toast(this.excel ? 'Microsoft Excel' : 'Pivot table', this.excel ? "We can't change this part of the PivotTable." : 'Pivot table cells cannot be edited. Change the pivot table settings instead.', 'err');
    return true;
  };
  function field(label, el) { return h('label.tdlg-field', null, [h('span', { text: label }), el]); }
  function select(opts, val) { var s = h('select.input.input-sm', null, opts.map(function (o) { return h('option', { value: o[0], text: o[1] }); })); if (val != null) s.value = String(val); return s; }
  function check(label, on) { var i = h('input', { type: 'checkbox' }); i.checked = !!on; return { el: h('label.tdlg-check', null, [i, ' ' + label]), input: i }; }
  SV.colOptions = function (R, header) {
    var out = [];
    for (var c = R.c1; c <= R.c2; c++) out.push([c, header ? 'Column ' + F.idxToCol(c) + ' — ' + T.text(this.wb.value(this.sheet, R.r1, c)) : 'Column ' + F.idxToCol(c)]);
    return out;
  };
  SV.done = function () { UI.save(); this.cache = {}; this.refresh(); this.focusGrid(); };
  SV.toolUse = function (id) { UI.state.ui.tools = UI.state.ui.tools || {}; UI.state.ui.tools[id] = (UI.state.ui.tools[id] || 0) + 1; };

  // ---------- sort ----------
  SV.doSort = function (R, col, desc, header) {
    T.sortRange(this.wb, this.sheet, R, { col: col, desc: desc, header: header });
    this.toolUse('sort'); this.done();
  };
  // Excel's Sort A→Z / Z→A buttons
  SV.quickSort = function (desc) {
    if (this.locked()) return;
    var self = this, s = this.selRange(), wb = this.wb;
    var single = s.r1 === s.r2 && s.c1 === s.c2;
    if (!single && T.needsExpandWarning(wb, this.sheet, s)) {
      var choice = h('div', null, [h('label.tdlg-check', null, [h('input', { type: 'radio', name: 'sw', value: 'expand', checked: true }), ' Expand the selection']),
        h('label.tdlg-check', null, [h('input', { type: 'radio', name: 'sw', value: 'only' }), ' Continue with the current selection'])]);
      UI.modal('Sort Warning', [h('p', { text: 'Microsoft Excel found data next to your selection. Since you have not selected this data, it will not be sorted.' }), h('p', { text: 'What do you want to do?' }), choice],
        [{ text: 'Cancel' }, { text: 'Sort', primary: true, onclick: function () {
          var only = choice.querySelector('input[value="only"]').checked;
          var R = only ? { r1: s.r1, c1: s.c1, r2: Math.min(s.r2, wb.maxRow(self.sheet)), c2: s.c2 } : T.currentRegion(wb, self.sheet, s.r1, s.c1);
          setTimeout(function () { self.doSort(R, self.c, desc, self.guessHeader(R)); if (only) self.toolUse('sort-only'); }, 0);
        } }], { cls: 'xl-modal' });
      return;
    }
    var R = this.workRange();
    this.doSort(R, Math.min(Math.max(this.c, R.c1), R.c2), desc, this.guessHeader(R));
  };
  // Google Sheets "Sort sheet": every row moves — including row 1 when nothing is frozen.
  SV.sortSheet = function (desc) {
    if (this.locked()) return;
    var R = { r1: 0, c1: 0, r2: this.wb.maxRow(this.sheet), c2: this.wb.maxCol(this.sheet) };
    this.doSort(R, this.c, desc, false);
    UI.toast('Sorted the whole sheet', 'Every row moved — including the header row, because no rows are frozen.');
  };
  SV.sortDialog = function () {
    if (this.locked()) return;
    var self = this, R = this.workRange(), hdr = check(this.excel ? 'My data has headers' : 'Data has header row', this.excel ? this.guessHeader(R) : false);
    var col = select(this.colOptions(R, hdr.input.checked), this.c), order = select([['asc', 'A → Z (smallest to largest)'], ['desc', 'Z → A (largest to smallest)']]);
    hdr.input.addEventListener('change', function () { var v = col.value; col.innerHTML = ''; self.colOptions(R, hdr.input.checked).forEach(function (o) { col.appendChild(h('option', { value: o[0], text: o[1] })); }); col.value = v; });
    UI.modal(this.excel ? 'Sort' : 'Sort range', [h('p.small', { text: 'Range: ' + this.addr(R) }), hdr.el, field('Sort by', col), field('Order', order)],
      [{ text: 'Cancel' }, { text: this.excel ? 'OK' : 'Sort', primary: true, onclick: function () { setTimeout(function () { self.doSort(R, +col.value, order.value === 'desc', hdr.input.checked); }, 0); } }]);
  };

  // ---------- filter ----------
  SV.toggleFilter = function () {
    if (this.locked()) return;
    var m = T.meta(this.wb, this.sheet);
    if (m.filter) { T.clearFilter(this.wb, this.sheet); this.done(); return; }
    var R = this.workRange();
    T.setFilter(this.wb, this.sheet, R);
    this.toolUse('filter');
    UI.toast(this.excel ? 'Filter on' : 'Filter created', 'Click the ▾ in a header cell (row ' + (R.r1 + 1) + ') to choose which rows to show.');
    this.done();
  };
  SV.clearFilterCriteria = function () {
    var m = T.meta(this.wb, this.sheet); if (!m.filter) return;
    Object.keys(m.filter.crit).forEach(function (c) { delete m.filter.crit[c]; });
    T.setCriteria(this.wb, this.sheet, 0, null);
    this.done();
  };
  SV.filterPopup = function (col, td) {
    var self = this, wb = this.wb, s = this.sheet, f = T.meta(wb, s).filter, vals = T.filterValues(wb, s, col), cur = f.crit[col];
    var boxes = vals.map(function (v) { var c = check(v === '' ? '(Blanks)' : v, !cur || cur.indexOf(v) >= 0); c.value = v; return c; });
    var all = check(this.excel ? '(Select All)' : 'Select all', boxes.every(function (b) { return b.input.checked; }));
    all.input.addEventListener('change', function () { boxes.forEach(function (b) { b.input.checked = all.input.checked; }); });
    var sortBtns = h('div.row', null, [
      h('button.btn.btn-sm', { text: this.excel ? 'Sort A to Z' : 'Sort A → Z', onclick: function () { pop.remove(); self.doSort({ r1: f.r1, c1: f.c1, r2: f.r2, c2: f.c2 }, col, false, true); } }),
      h('button.btn.btn-sm', { text: this.excel ? 'Sort Z to A' : 'Sort Z → A', onclick: function () { pop.remove(); self.doSort({ r1: f.r1, c1: f.c1, r2: f.r2, c2: f.c2 }, col, true, true); } })]);
    var pop = h('div.filter-pop', null, [sortBtns, h('div.small.muted', { text: this.excel ? 'Filter by values:' : 'Filter by values' }), all.el,
      h('div.filter-list', null, boxes.map(function (b) { return b.el; })),
      h('div.row', null, [h('button.btn.btn-sm', { text: 'Cancel', onclick: function () { pop.remove(); } }),
        h('button.btn.btn-sm.btn-primary', { text: 'OK', onclick: function () {
          var allowed = boxes.filter(function (b) { return b.input.checked; }).map(function (b) { return b.value; });
          T.setCriteria(wb, s, col, allowed.length === vals.length ? null : allowed);
          self.toolUse('filter-criteria'); pop.remove(); self.done();
        } })])]);
    var rr = td.getBoundingClientRect(), root = this.root.getBoundingClientRect();
    pop.style.left = Math.max(0, rr.left - root.left) + 'px'; pop.style.top = (rr.bottom - root.top) + 'px';
    this.root.appendChild(pop);
    setTimeout(function () { var away = function (e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', away); } }; document.addEventListener('mousedown', away); }, 0);
  };

  // ---------- cleanup ----------
  SV.dedupeDialog = function () {
    if (this.locked()) return;
    var self = this, R = this.workRange(), hdr = check(this.excel ? 'My data has headers' : 'Data has header row', this.excel ? this.guessHeader(R) : false);
    var colsBox = h('div.filter-list'), checks = [];
    function draw() {
      colsBox.innerHTML = ''; checks = [];
      self.colOptions(R, hdr.input.checked).forEach(function (o) { var c = check(o[1], true); c.col = o[0]; checks.push(c); colsBox.appendChild(c.el); });
    }
    hdr.input.addEventListener('change', draw); draw();
    UI.modal('Remove ' + (this.excel ? 'Duplicates' : 'duplicates'), [h('p.small', { text: 'Range: ' + this.addr(R) + '. Rows count as duplicates when the checked columns match. Upper and lower case are treated the same; extra spaces are NOT.' }), hdr.el,
      h('div.small', { text: 'Columns to compare:' }), colsBox],
      [{ text: 'Cancel' }, { text: this.excel ? 'OK' : 'Remove duplicates', primary: true, onclick: function () {
        var cols = checks.filter(function (c) { return c.input.checked; }).map(function (c) { return c.col; });
        if (!cols.length) { UI.toast('Pick at least one column', ''); return false; }
        setTimeout(function () {
          var res = T.removeDuplicates(self.wb, self.sheet, R, { cols: cols, header: hdr.input.checked });
          self.toolUse('dedupe'); self.done();
          UI.modal(self.excel ? 'Microsoft Excel' : 'Remove duplicates', [h('p', { text: self.excel
            ? res.removed + ' duplicate values found and removed; ' + res.remaining + ' unique values remain.'
            : res.removed + ' duplicate rows found and removed. ' + res.remaining + ' unique rows remain.' })], [{ text: 'OK', primary: true }]);
        }, 0);
      } }]);
  };
  SV.splitDialog = function () {
    if (this.locked()) return;
    var self = this, s = this.selRange();
    var R = s.r1 === s.r2 && s.c1 === s.c2 ? { r1: s.r1, c1: s.c1, r2: s.r1, c2: s.c1 } : { r1: s.r1, c1: s.c1, r2: Math.min(s.r2, this.wb.maxRow(this.sheet)), c2: s.c2 };
    if (R.c1 !== R.c2) { UI.modal(this.excel ? 'Microsoft Excel' : 'Split text to columns', [h('p', { text: T.planSplit(this.wb, this.sheet, R, {}).error })], [{ text: 'OK', primary: true }]); return; }
    var opts = [['comma', 'Comma ( , )'], ['space', 'Space'], ['semicolon', 'Semicolon ( ; )'], ['tab', 'Tab'], ['pipe', 'Pipe ( | )'], ['other', 'Other…']];
    if (!this.excel) opts.unshift(['detect', 'Detect automatically']);
    var delim = select(opts), other = h('input.input.input-sm', { maxlength: 1, placeholder: 'character', style: { width: '90px' } });
    UI.modal(this.excel ? 'Convert Text to Columns' : 'Split text to columns', [h('p.small', { text: 'Splitting ' + this.addr(R) + '. The pieces go into this column and the columns to its right.' }), field(this.excel ? 'Delimiter' : 'Separator', delim), field('Other', other)],
      [{ text: 'Cancel' }, { text: this.excel ? 'Finish' : 'Split', primary: true, onclick: function () {
        var d = delim.value === 'other' ? other.value : delim.value;
        if (d === 'detect') { d = 'space'; for (var r = R.r1; r <= R.r2; r++) if (String(self.wb.value(self.sheet, r, R.c1)).indexOf(',') >= 0) { d = 'comma'; break; } }
        if (!d) { UI.toast('Type the separator character', ''); return false; }
        var plan = T.planSplit(self.wb, self.sheet, R, { delim: d });
        var go = function () { T.applyEdits(self.wb, plan); self.toolUse('split'); self.done(); };
        setTimeout(function () {
          if (plan.overwrite) UI.modal(self.excel ? 'Microsoft Excel' : 'Replace data?', [h('p', { text: self.excel ? "There's already data here. Do you want to replace it?" : 'Splitting will replace data in ' + plan.overwrite + ' cell(s) to the right. Continue?' })],
            [{ text: 'Cancel' }, { text: 'OK', primary: true, onclick: function () { setTimeout(go, 0); } }]);
          else go();
        }, 0);
      } }]);
  };
  SV.trimSel = function () {
    if (this.locked()) return;
    var res = T.trimRange(this.wb, this.sheet, this.workRange());
    this.toolUse('trim'); this.done();
    UI.toast('Trim whitespace', res.changed ? 'Trimmed whitespace in ' + res.changed + ' cell' + (res.changed === 1 ? '' : 's') + '.' : 'No extra spaces found in the selection.');
  };
  SV.findDialog = function () {
    var self = this, s = this.selRange(), multi = !(s.r1 === s.r2 && s.c1 === s.c2);
    var find = h('input.input.input-sm'), rep = h('input.input.input-sm');
    var mc = check('Match case', false), whole = check(this.excel ? 'Match entire cell contents' : 'Match entire cell contents', false), fx = check('Also search within formulas', false);
    UI.modal(this.excel ? 'Find and Replace' : 'Find and replace', [h('p.small', { text: 'Search: ' + (multi ? 'the selected cells (' + this.addr(s) + ')' : 'this sheet') }),
      field('Find what', find), field('Replace with', rep), mc.el, whole.el, this.excel ? null : fx.el],
      [{ text: this.excel ? 'Close' : 'Done' }, { text: this.excel ? 'Replace All' : 'Replace all', primary: true, onclick: function () {
        if (self.locked()) return;
        var res = T.findReplace(self.wb, self.sheet, multi ? s : null, { find: find.value, replace: rep.value, matchCase: mc.input.checked, whole: whole.input.checked, formulas: fx.input.checked });
        self.toolUse('replace'); self.done();
        setTimeout(function () {
          UI.toast(self.excel ? 'Microsoft Excel' : 'Find and replace', res.count
            ? (self.excel ? 'All done. We made ' + res.count + ' replacement' + (res.count === 1 ? '' : 's') + '.' : 'Replaced ' + res.count + ' instance' + (res.count === 1 ? '' : 's') + ' of "' + find.value + '" with "' + rep.value + '".')
            : (self.excel ? "We couldn't find anything to replace." : 'No matches found.'));
        }, 0);
      } }]);
    setTimeout(function () { find.focus(); }, 40);
  };
  SV.pasteValuesOnly = function () {
    if (this.locked()) return;
    var clip = this.clip;
    if (!clip) { UI.toast('Nothing copied yet', 'Select cells, press Ctrl+C, then use Paste values.'); return; }
    var mr = 0, mc = 0; clip.items.forEach(function (i) { mr = Math.max(mr, i.dr); mc = Math.max(mc, i.dc); });
    T.pasteValues(this.wb, { sheet: clip.sheet, r1: clip.r, c1: clip.c, r2: clip.r + mr, c2: clip.c + mc }, this.sheet, this.r, this.c);
    this.selBox.classList.remove('marquee');
    this.toolUse('paste-values'); this.done();
  };

  // ---------- data validation ----------
  SV.dvDialog = function () {
    if (this.locked()) return;
    var self = this, R = this.workRange(), s = this.selRange(); if (!(s.r1 === s.r2 && s.c1 === s.c2)) R = { r1: s.r1, c1: s.c1, r2: Math.min(s.r2, Math.max(this.wb.maxRow(this.sheet), s.r1)), c2: s.c2 };
    var old = T.ruleAt(this.wb, this.sheet, R.r1, R.c1);
    var type = select(this.excel ? [['list', 'List'], ['whole', 'Whole number'], ['decimal', 'Decimal']] : [['list', 'Dropdown (list of items)'], ['whole', 'Whole number between'], ['decimal', 'Number between']], old && old.type);
    var items = h('input.input.input-sm', { placeholder: 'e.g. Snacks, Drinks, Apparel', value: old && old.items ? old.items.join(', ') : '' });
    var min = h('input.input.input-sm', { type: 'number', value: old && old.min != null ? old.min : '' }), max = h('input.input.input-sm', { type: 'number', value: old && old.max != null ? old.max : '' });
    var onBad = select([['warn', 'Show a warning'], ['reject', 'Reject the input']], old && old.reject ? 'reject' : 'warn');
    UI.modal(this.excel ? 'Data Validation' : 'Data validation rules', [h('p.small', { text: 'Apply to: ' + this.addr(R) }),
      field(this.excel ? 'Allow' : 'Criteria', type), field(this.excel ? 'Source (separate with commas)' : 'Items (separate with commas)', items),
      h('div.tdlg-two', null, [field('Minimum', min), field('Maximum', max)]),
      this.excel ? h('p.small.muted', { text: 'Error alert: Stop — Excel will refuse values that break the rule when they are TYPED. It does not check data that is already there or pasted in (use Data ▸ Circle Invalid Data).' }) : field('If the data is invalid', onBad)],
      [{ text: this.excel ? 'Clear All' : 'Remove rule', onclick: function () { var m = T.meta(self.wb, self.sheet); m.dv = (m.dv || []).filter(function (x) { return !(R.r1 <= x.r2 && R.r2 >= x.r1 && R.c1 <= x.c2 && R.c2 >= x.c1); }); self.done(); } },
        { text: 'Cancel' }, { text: this.excel ? 'OK' : 'Done', primary: true, onclick: function () {
          var rule = { type: type.value, reject: self.excel || onBad.value === 'reject' };
          if (rule.type === 'list') { rule.items = items.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean); if (!rule.items.length) { UI.toast('Type the allowed items', 'Separate them with commas.'); return false; } }
          else { rule.min = min.value === '' ? null : +min.value; rule.max = max.value === '' ? null : +max.value; if (rule.min == null && rule.max == null) { UI.toast('Type a minimum and/or maximum', ''); return false; } }
          T.addValidation(self.wb, self.sheet, R, rule); self.toolUse('validation'); self.done();
        } }]);
  };
  // Called before a typed value is saved. Returns false to refuse it.
  SV.checkEntry = function (sheet, r, c, cell) {
    var rule = T.ruleAt(this.wb, sheet, r, c);
    if (!rule || !cell || cell.input === '' || cell.input[0] === '=') return true;
    var probe = new SX.Workbook(this.wb.platId); probe.addSheet('x'); probe.setCell('x', 0, 0, { input: cell.input }); probe.recalc();
    if (T.checkValue(rule, probe.value('x', 0, 0))) return true;
    if (this.excel) {
      UI.modal('Microsoft Excel', [h('div.xl-dialog', null, [h('div.xl-dialog-icon', { text: '⛔' }), h('div', null, [h('p', null, h('b', { text: "This value doesn't match the data validation restrictions defined for this cell." })),
        h('p.small', { text: 'Allowed: ' + T.describe(rule) + '.' })])])], [{ text: 'Retry', primary: true }, { text: 'Cancel' }], { cls: 'xl-modal' });
      return false;
    }
    if (rule.reject) { UI.modal('There was a problem', [h('p', { text: 'Input must be ' + T.describe(rule) + '.' })], [{ text: 'OK', primary: true }]); return false; }
    UI.toast('Invalid entry kept', 'Input must be ' + T.describe(rule) + '. The cell is marked with a red corner.');
    return true;
  };
  SV.listPick = function () {
    var self = this, rule = T.ruleAt(this.wb, this.sheet, this.r, this.c);
    if (!rule || rule.type !== 'list') return;
    var pop = h('div.filter-pop.dv-pop', null, rule.items.map(function (it) {
      return h('button.menu-cmd', { text: it, onclick: function () { pop.remove(); self.wb.applyEdits([{ sheet: self.sheet, r: self.r, c: self.c, cell: { input: it } }]); self.done(); } });
    }));
    var td = this.tds[this.r][this.c], rr = td.getBoundingClientRect(), root = this.root.getBoundingClientRect();
    pop.style.left = (rr.left - root.left) + 'px'; pop.style.top = (rr.bottom - root.top) + 'px';
    this.root.appendChild(pop);
    setTimeout(function () { var away = function (e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', away); } }; document.addEventListener('mousedown', away); }, 0);
  };

  // ---------- conditional formatting ----------
  SV.cfDialog = function () {
    if (this.locked()) return;
    var self = this, s = this.selRange(), R = s.r1 === s.r2 && s.c1 === s.c2 ? this.workRange() : { r1: s.r1, c1: s.c1, r2: Math.min(s.r2, Math.max(this.wb.maxRow(this.sheet), s.r1)), c2: s.c2 };
    var kinds = this.excel
      ? [['gt', 'Greater Than…'], ['lt', 'Less Than…'], ['between', 'Between…'], ['eq', 'Equal To…'], ['text', 'Text that Contains…'], ['dup', 'Duplicate Values…'], ['blank', 'Blank cells'], ['scale', 'Color Scale (green)'], ['formula', 'Use a formula to determine which cells to format']]
      : [['gt', 'Greater than'], ['lt', 'Less than'], ['between', 'Is between'], ['eq', 'Is equal to'], ['text', 'Text contains'], ['blank', 'Is empty'], ['scale', 'Color scale'], ['formula', 'Custom formula is']];
    var kind = select(kinds), a = h('input.input.input-sm', { placeholder: 'value' }), b = h('input.input.input-sm', { placeholder: 'and (for between)' });
    var fx = h('input.input.input-sm', { placeholder: '=$F2<$G2', spellcheck: 'false' });
    var color = select([['red', 'Light red fill'], ['yellow', 'Yellow fill'], ['green', 'Green fill'], ['blue', 'Blue fill']]);
    UI.modal(this.excel ? 'Conditional Formatting' : 'Conditional format rules', [h('p.small', { text: 'Apply to range: ' + this.addr(R) }),
      field(this.excel ? 'Format cells that are' : 'Format cells if…', kind), h('div.tdlg-two', null, [field('Value', a), field('And', b)]),
      field('Formula (written for the TOP-LEFT cell of the range)', fx), field('Formatting style', color),
      this.excel ? null : h('p.small.muted', { text: 'Google Sheets has no "duplicate values" preset. To highlight duplicates use Custom formula is: =COUNTIF($A$2:$A$100, A2) > 1' })],
      [{ text: 'Cancel' }, { text: 'Done', primary: true, onclick: function () {
        var k = kind.value, num = function (x) { return x.value === '' ? null : isNaN(+x.value) ? x.value : +x.value; };
        if ((k === 'gt' || k === 'lt' || k === 'eq' || k === 'between') && num(a) === null) { UI.toast('Type a value', ''); return false; }
        if (k === 'formula' && !/^=/.test(fx.value.trim())) { UI.toast('A custom formula starts with =', 'Example: =$F2<$G2'); return false; }
        T.addRule(self.wb, self.sheet, R, { type: k, a: num(a), b: num(b), text: a.value, formula: fx.value.trim(), color: color.value });
        self.toolUse('cf'); self.done();
      } }]);
  };
  SV.cfClear = function () { var n = T.clearRules(this.wb, this.sheet, this.selRange()); this.done(); UI.toast('Conditional formatting', n ? 'Removed ' + n + ' rule' + (n === 1 ? '' : 's') + '.' : 'No rules in the selection.'); };

  // ---------- pivot tables ----------
  SV.pivotDialog = function () {
    var self = this, wb = this.wb, R = this.workRange();
    if ((wb.sheet(this.sheet).meta || {}).pivot) { UI.toast('Select your data first', 'Go to the sheet with the data and click inside it.'); return; }
    if (R.r2 <= R.r1) { UI.toast('Select your data first', 'Click inside a table that has a header row.'); return; }
    var cols = []; for (var c = R.c1; c <= R.c2; c++) cols.push([c, T.headerText(wb, this.sheet, R, c)]);
    var none = [['', '(none)']];
    var rows = select(cols), colSel = select(none.concat(cols), ''), val = select(cols, R.c2), filt = select(none.concat(cols), ''), fval = select([['', '—']]);
    var agg = select(T.AGG.map(function (a) { return [a, self.excel ? { SUM: 'Sum', COUNT: 'Count', AVERAGE: 'Average', MAX: 'Max', MIN: 'Min' }[a] : (a === 'COUNT' ? 'COUNTA' : a)]; }));
    filt.addEventListener('change', function () {
      fval.innerHTML = '';
      if (filt.value === '') { fval.appendChild(h('option', { value: '', text: '—' })); return; }
      var seen = []; for (var r = R.r1 + 1; r <= R.r2; r++) { var t = T.text(wb.value(self.sheet, r, +filt.value)); if (seen.indexOf(t) < 0) seen.push(t); }
      seen.sort().forEach(function (t) { fval.appendChild(h('option', { value: t, text: t || '(blank)' })); });
    });
    UI.modal(this.excel ? 'Create PivotTable' : 'Create pivot table', [h('p.small', { text: 'Data range: ' + this.sheet + '!' + this.addr(R) + ' · Insert to: New sheet' }),
      h('div.tdlg-two', null, [field('Rows', rows), field('Columns (optional)', colSel)]),
      h('div.tdlg-two', null, [field('Values', val), field(this.excel ? 'Summarize value field by' : 'Summarize by', agg)]),
      h('div.tdlg-two', null, [field('Filter (optional)', filt), field('Show only', fval)])],
      [{ text: 'Cancel' }, { text: this.excel ? 'OK' : 'Create', primary: true, onclick: function () {
        if (colSel.value !== '' && colSel.value === rows.value) { UI.toast('Rows and Columns must be different fields', ''); return false; }
        var name = T.addPivot(wb, self.sheet, R, { rows: +rows.value, cols: colSel.value === '' ? null : +colSel.value, val: +val.value, agg: agg.value,
          filter: filt.value === '' ? null : { col: +filt.value, value: fval.value } });
        self.toolUse('pivot');
        setTimeout(function () { self.renderTabs(); self.switchSheet(name); self.done(); }, 0);
      } }], { cls: 'wide' });
  };
  SV.refreshPivots = function () {
    var n = T.refreshAll(this.wb); this.toolUse('refresh'); this.done();
    UI.toast('Refresh All', n ? 'Updated ' + n + ' PivotTable' + (n === 1 ? '' : 's') + ' from the current data.' : 'There are no PivotTables in this workbook.');
  };
  SV.pivotBar = function () {
    var self = this, P = (this.wb.sheet(this.sheet).meta || {}).pivot;
    if (!P) return null;
    var stale = T.pivotStale(this.wb, this.sheet), n = P.names;
    return h('div.pivot-bar' + (stale ? '.stale' : ''), null, [
      h('b', { text: this.excel ? 'PivotTable Fields' : 'Pivot table editor' }),
      h('span', { text: ' Rows: ' + n[P.rows] + (P.cols != null ? ' · Columns: ' + n[P.cols] : '') + ' · Values: ' + T.aggLabel(this.wb, P.agg, n[P.val]) + (P.filter ? ' · Filter: ' + n[P.filter.col] + ' = ' + (P.filter.value || '(blank)') : '') + ' · Source: ' + P.src.sheet + '!' + this.addr(P.src) }),
      this.excel ? (stale ? h('span.pivot-stale', { text: ' ⚠ The source data changed — this PivotTable still shows the OLD numbers.' }) : null) : h('span.small.muted', { text: ' · updates automatically' }),
      this.excel ? h('button.btn.btn-sm' + (stale ? '.btn-primary' : ''), { text: '⟳ Refresh', onclick: function () { T.pivotRender(self.wb, self.sheet); self.toolUse('refresh'); self.done(); } }) : null,
      h('button.btn.btn-sm', { text: 'Delete', onclick: function () {
        UI.confirm('Delete this pivot table?', 'The sheet "' + self.sheet + '" will be removed.', 'Delete', function () {
          var name = self.sheet; self.wb.sheets = self.wb.sheets.filter(function (s) { return s.name !== name; }); self.wb.recalc();
          self.sheet = self.wb.sheets[0].name; self.renderGrid(); self.done();
        });
      } })
    ]);
  };

  // ---------- charts ----------
  SV.chartDialog = function () {
    var self = this, s = this.selRange(), R = s.r1 === s.r2 && s.c1 === s.c2 ? this.workRange() : { r1: s.r1, c1: s.c1, r2: Math.min(s.r2, Math.max(this.wb.maxRow(this.sheet), s.r1)), c2: s.c2 };
    var names = this.excel ? { column: 'Clustered Column', bar: 'Clustered Bar', line: 'Line', pie: 'Pie', scatter: 'Scatter (X, Y)' } : { column: 'Column chart', bar: 'Bar chart', line: 'Line chart', pie: 'Pie chart', scatter: 'Scatter chart' };
    var type = select(T.CHART_TYPES.map(function (t) { return [t, names[t]]; })), title = h('input.input.input-sm', { placeholder: 'Chart title' });
    var hdr = check('Row ' + (R.r1 + 1) + ' is headers (series names)', true), lab = check('Column ' + F.idxToCol(R.c1) + ' is labels / X values', true), zero = check('Vertical axis starts at 0', true);
    UI.modal(this.excel ? 'Insert Chart' : 'Insert chart', [h('p.small', { text: 'Data range: ' + this.sheet + '!' + this.addr(R) + ' — first column = labels (X), other columns = one series each.' }),
      field('Chart type', type), field('Title', title), hdr.el, lab.el, zero.el],
      [{ text: 'Cancel' }, { text: 'Insert', primary: true, onclick: function () {
        T.addChart(self.wb, self.sheet, R, { type: type.value, title: title.value, header: hdr.input.checked, labels: lab.input.checked, zero: zero.input.checked });
        self.toolUse('chart'); UI.save();
        setTimeout(function () {
          if (self.panel && self.panelHost.classList.contains('open') && self.panel.current() === 'charts') self.panel.show('charts'); else self.togglePanel('charts');
          self.done();
        }, 0);
      } }]);
  };
  function nice(max) { if (max <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(max))), m = max / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }
  function fmt(x) { return Math.abs(x) >= 1000 ? (x / 1000).toFixed(x % 1000 ? 1 : 0) + 'k' : String(+x.toFixed(2)); }
  function esc(t) { return UI.esc(String(t)); }
  // A simple SVG chart. Thin marks, recessive grid, legend for 2+ series, tooltips on every mark.
  UI.chartSvg = function (wb, sheet, ch) {
    var d = T.chartData(wb, sheet, ch), W = 340, H = 230, L = 46, Rr = 12, Tp = 14, B = 46, out = '';
    var ser = ch.type === 'pie' ? d.series.slice(0, 1) : d.series;
    var all = []; ser.forEach(function (s) { s.values.forEach(function (x) { if (x !== null) all.push(x); }); });
    var lbl = function (x) { return x === null || x === undefined ? '' : String(x).length > 12 ? String(x).slice(0, 11) + '…' : String(x); };
    out += '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(ch.title || 'Chart') + '">';
    if (!ser.length || !all.length) return out + '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" class="ch-empty">No numbers to plot</text></svg>';
    if (ch.type === 'pie') {
      var vals = ser[0].values.map(function (x) { return x > 0 ? x : 0; }), tot = vals.reduce(function (a, b) { return a + b; }, 0), a0 = -Math.PI / 2, cx = 110, cy = H / 2, rad = 88;
      vals.forEach(function (x, i) {
        if (!x) return;
        var a1 = a0 + 2 * Math.PI * x / tot, big = a1 - a0 > Math.PI ? 1 : 0, col = SERIES[i % SERIES.length];
        var p = x === tot ? '<circle cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="' + col + '"/>' :
          '<path d="M' + cx + ',' + cy + ' L' + (cx + rad * Math.cos(a0)) + ',' + (cy + rad * Math.sin(a0)) + ' A' + rad + ',' + rad + ' 0 ' + big + ' 1 ' + (cx + rad * Math.cos(a1)) + ',' + (cy + rad * Math.sin(a1)) + ' Z" fill="' + col + '" stroke="#fff" stroke-width="2"/>';
        out += '<g><title>' + esc(d.labels[i]) + ': ' + fmt(x) + ' (' + Math.round(100 * x / tot) + '%)</title>' + p + '</g>';
        a0 = a1;
      });
      vals.forEach(function (x, i) { out += '<rect x="220" y="' + (18 + i * 18) + '" width="10" height="10" rx="2" fill="' + SERIES[i % SERIES.length] + '"/><text x="236" y="' + (27 + i * 18) + '" class="ch-tick">' + esc(lbl(d.labels[i])) + ' ' + Math.round(100 * x / tot) + '%</text>'; });
      return out + '</svg>';
    }
    var lo = ch.zero ? Math.min(0, Math.min.apply(null, all)) : Math.min.apply(null, all), hi = Math.max.apply(null, all);
    if (!ch.zero) { var pad = (hi - lo) * 0.1 || 1; lo = lo - pad; }
    var step = nice((hi - lo) / 4), y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step; if (y1 === y0) y1 = y0 + step;
    var plotW = W - L - Rr, plotH = H - Tp - B;
    var horiz = ch.type === 'bar';
    var scale = function (x) { return (x - y0) / (y1 - y0); };
    for (var t = y0; t <= y1 + 1e-9; t += step) {
      if (horiz) { var gx = L + plotW * scale(t); out += '<line x1="' + gx + '" x2="' + gx + '" y1="' + Tp + '" y2="' + (Tp + plotH) + '" class="ch-grid"/><text x="' + gx + '" y="' + (H - B + 14) + '" text-anchor="middle" class="ch-tick">' + fmt(t) + '</text>'; }
      else { var gy = Tp + plotH * (1 - scale(t)); out += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + gy + '" y2="' + gy + '" class="ch-grid"/><text x="' + (L - 6) + '" y="' + (gy + 4) + '" text-anchor="end" class="ch-tick">' + fmt(t) + '</text>'; }
    }
    var n = d.labels.length;
    if (ch.type === 'scatter') {
      var xs = d.labels.filter(function (x) { return typeof x === 'number'; });
      if (!xs.length) return out + '<text x="' + W / 2 + '" y="' + H / 2 + '" text-anchor="middle" class="ch-empty">X values must be numbers</text></svg>';
      var xl = Math.min.apply(null, xs), xh = Math.max.apply(null, xs), xstep = nice((xh - xl) / 4 || 1), x0 = Math.floor(xl / xstep) * xstep, x1 = Math.ceil(xh / xstep) * xstep; if (x1 === x0) x1 = x0 + xstep;
      for (var xt = x0; xt <= x1 + 1e-9; xt += xstep) out += '<text x="' + (L + plotW * (xt - x0) / (x1 - x0)) + '" y="' + (H - B + 14) + '" text-anchor="middle" class="ch-tick">' + fmt(xt) + '</text>';
      ser.forEach(function (s, si) {
        s.values.forEach(function (y, i) {
          var x = d.labels[i]; if (y === null || typeof x !== 'number') return;
          out += '<g><title>' + esc(s.name) + ': (' + fmt(x) + ', ' + fmt(y) + ')</title><circle cx="' + (L + plotW * (x - x0) / (x1 - x0)) + '" cy="' + (Tp + plotH * (1 - scale(y))) + '" r="4.5" fill="' + SERIES[si % SERIES.length] + '" stroke="#fff" stroke-width="1.5"/></g>';
        });
      });
    } else if (ch.type === 'line') {
      ser.forEach(function (s, si) {
        var pts = [];
        s.values.forEach(function (y, i) { if (y !== null) pts.push([L + plotW * (n === 1 ? 0.5 : i / (n - 1)), Tp + plotH * (1 - scale(y)), y, i]); });
        out += '<polyline fill="none" stroke="' + SERIES[si % SERIES.length] + '" stroke-width="2" points="' + pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '"/>';
        pts.forEach(function (p) { out += '<g><title>' + esc(d.labels[p[3]]) + ' · ' + esc(s.name) + ': ' + fmt(p[2]) + '</title><circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" fill="' + SERIES[si % SERIES.length] + '" stroke="#fff" stroke-width="1.5"/></g>'; });
      });
      d.labels.forEach(function (x, i) { if (n <= 12 || i % Math.ceil(n / 12) === 0) out += '<text x="' + (L + plotW * (n === 1 ? 0.5 : i / (n - 1))) + '" y="' + (H - B + 14) + '" text-anchor="middle" class="ch-tick">' + esc(lbl(x)) + '</text>'; });
    } else {
      var band = (horiz ? plotH : plotW) / n, gap = 2, bw = Math.max(2, (band * 0.75 - gap * (ser.length - 1)) / ser.length);
      d.labels.forEach(function (x, i) {
        ser.forEach(function (s, si) {
          var y = s.values[i]; if (y === null) return;
          var base = scale(Math.max(y0, Math.min(0, y1))), end = scale(y), off = band * 0.125 + si * (bw + gap);
          var col = SERIES[si % SERIES.length], tip = '<title>' + esc(x) + ' · ' + esc(s.name) + ': ' + fmt(y) + '</title>';
          if (horiz) out += '<g>' + tip + '<rect x="' + (L + plotW * Math.min(base, end)) + '" y="' + (Tp + band * i + off) + '" width="' + Math.max(1, plotW * Math.abs(end - base)) + '" height="' + bw + '" rx="2" fill="' + col + '"/></g>';
          else out += '<g>' + tip + '<rect x="' + (L + band * i + off) + '" y="' + (Tp + plotH * (1 - Math.max(base, end))) + '" width="' + bw + '" height="' + Math.max(1, plotH * Math.abs(end - base)) + '" rx="2" fill="' + col + '"/></g>';
        });
        if (horiz) out += '<text x="' + (L - 6) + '" y="' + (Tp + band * (i + 0.5) + 4) + '" text-anchor="end" class="ch-tick">' + esc(lbl(x)) + '</text>';
        else if (n <= 12 || i % Math.ceil(n / 12) === 0) out += '<text x="' + (L + band * (i + 0.5)) + '" y="' + (H - B + 14) + '" text-anchor="middle" class="ch-tick">' + esc(lbl(x)) + '</text>';
      });
      if (!ch.zero) out += '<text x="' + L + '" y="' + (Tp - 3) + '" class="ch-warn">axis does not start at 0</text>';
    }
    if (ser.length > 1) ser.forEach(function (s, si) { out += '<rect x="' + (L + si * 92) + '" y="' + (H - 16) + '" width="10" height="10" rx="2" fill="' + SERIES[si % SERIES.length] + '"/><text x="' + (L + 14 + si * 92) + '" y="' + (H - 7) + '" class="ch-tick">' + esc(lbl(s.name)) + '</text>'; });
    return out + '</svg>';
  };
  SV.chartsTab = function () {
    var self = this, box = h('div.charts-tab'), wb = this.wb, count = 0;
    box.appendChild(h('p.small', { html: 'Select your data (labels in the first column, numbers next to it), then <b>Insert ▸ ' + (this.excel ? 'Chart…' : 'Chart') + '</b>. Charts update when the data changes.' }));
    wb.sheets.forEach(function (s) {
      ((s.meta || {}).charts || []).forEach(function (ch) {
        count++;
        var svg = h('div.chart-svg'); svg.innerHTML = UI.chartSvg(wb, s.name, ch);
        var type = select(T.CHART_TYPES.map(function (t) { return [t, t[0].toUpperCase() + t.slice(1)]; }), ch.type);
        type.addEventListener('change', function () { ch.type = type.value; UI.save(); self.panel.show('charts'); });
        var zero = check('Axis starts at 0', ch.zero);
        zero.input.addEventListener('change', function () { ch.zero = zero.input.checked; UI.save(); self.panel.show('charts'); });
        box.appendChild(h('div.chart-card', { 'data-id': ch.id }, [
          h('div.chart-head', null, [h('b', { text: ch.title || 'Untitled chart' }), h('span.small.muted', { text: ' ' + s.name + '!' + self.addr(ch) }),
            h('button.linkish', { text: 'Delete', onclick: function () { T.removeChart(wb, s.name, ch.id); UI.save(); self.panel.show('charts'); } })]),
          svg, h('div.row', null, [type, zero.el]),
          h('div', null, T.chartWarnings(wb, s.name, ch).map(function (w) { return h('div.small.warn', { text: '⚠ ' + w }); }))
        ]));
      });
    });
    if (!count) box.appendChild(h('p.small.muted', { text: 'No charts yet.' }));
    return box;
  };

  // ---------- grid decorations (called from refresh) ----------
  SV.decorate = function () {
    var wb = this.wb, s = this.sheet, m = wb.sheet(s).meta || {}, self = this;
    if (!this.excel && wb.sheets.some(function (x) { return x.meta && x.meta.pivot; })) {
      if (T.autoRefreshPivots(wb).length) { this.cache = {}; }
    }
    // hidden rows
    var f = m.filter, hidden = (f && f.hidden) || {};
    for (var r = 0; r < ROWS; r++) { var tr = this.rowHeads[r].parentNode, hide = !!hidden[r]; if ((tr.style.display === 'none') !== hide) tr.style.display = hide ? 'none' : ''; }
    // backgrounds, filter buttons, validation marks
    var bg = T.cfColors(wb, s), bad = {}, prev = this.decor || {}, next = {};
    if (m.dv && (!this.excel || this.circles)) T.invalidCells(wb, s).forEach(function (p) { bad[p[0] + ',' + p[1]] = true; });
    var mark = function (k, cls, color, title) { next[k] = { cls: cls, color: color, title: title }; };
    Object.keys(bg).forEach(function (k) { mark(k, '', bg[k]); });
    Object.keys(bad).forEach(function (k) { var o = next[k] || { cls: '', color: null }; o.cls += self.excel ? ' dv-circle' : ' dv-bad'; next[k] = o; });
    if (f) for (var c = f.c1; c <= f.c2; c++) { var k = f.r1 + ',' + c, o = next[k] || { cls: '', color: null }; o.cls += ' has-filter' + (f.crit[c] ? ' filtered' : ''); next[k] = o; }
    Object.keys(prev).forEach(function (k) { if (!next[k]) { var p = k.split(','), td = self.tds[+p[0]] && self.tds[+p[0]][+p[1]]; if (td) { td.style.background = ''; td.classList.remove('dv-circle', 'dv-bad', 'has-filter', 'filtered'); } } });
    Object.keys(next).forEach(function (k) {
      var p = k.split(','), td = self.tds[+p[0]] && self.tds[+p[0]][+p[1]]; if (!td) return;
      td.style.background = next[k].color || '';
      td.classList.remove('dv-circle', 'dv-bad', 'has-filter', 'filtered');
      next[k].cls.split(' ').filter(Boolean).forEach(function (x) { td.classList.add(x); });
    });
    this.decor = next;
    // list dropdown button on the active cell
    var rule = T.ruleAt(wb, s, this.r, this.c);
    this.dvBtn.style.display = rule && rule.type === 'list' && !this.editing ? 'block' : 'none';
    if (rule && rule.type === 'list') { var rr = this.cellRect(this.r, this.c); this.dvBtn.style.left = (rr.left + rr.width - 16) + 'px'; this.dvBtn.style.top = rr.top + 'px'; this.dvBtn.style.height = rr.height + 'px'; }
    // pivot banner
    this.pivotHost.innerHTML = ''; var pb = this.pivotBar(); if (pb) this.pivotHost.appendChild(pb);
    // filter status
    if (f && Object.keys(f.crit).length) this.filterNote = this.excel ? T.visibleCount(wb, s) + ' of ' + (f.r2 - f.r1) + ' records found' : 'Filter on: showing ' + T.visibleCount(wb, s) + ' of ' + (f.r2 - f.r1) + ' rows';
    else this.filterNote = '';
    if (this.panel && this.panel.current() === 'charts' && this.chartsVersion !== wb.version) { this.chartsVersion = wb.version; this.panel.show('charts'); }
  };
})(globalThis.SX = globalThis.SX || {});
