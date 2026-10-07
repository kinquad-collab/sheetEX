/* SheetEX — spreadsheet workspace (Excel 365 / Excel 2013 / Google Sheets). */
(function (SX) {
  'use strict';
  var UI = SX.ui, h = UI.h, F = SX.f, E = SX.engine, PL = SX.platforms.PLATFORMS;
  var ROWS = SX.Workbook.ROWS, COLS = SX.Workbook.COLS;

  var DEFAULT_W = {
    Products: { 0: 74, 1: 168, 2: 116, 3: 70, 4: 64, 5: 66, 6: 80, 7: 160, 8: 90 },
    Sales: { 0: 70, 1: 84, 2: 64, 3: 74, 4: 50, 5: 84, 6: 84 },
    Stores: { 0: 64, 1: 92, 2: 50, 3: 60, 4: 120, 5: 84 },
    Scratch: { 0: 120, 1: 140 },
    RawOrders: { 0: 66, 1: 58, 2: 70, 3: 96, 4: 50, 5: 72, 6: 140, 7: 76, 8: 90, 9: 80, 10: 80, 11: 80, 12: 90, 13: 120, 14: 150, 15: 80, 16: 80 },
    ItemCodes: { 0: 60, 1: 168, 2: 116, 3: 70 },
    Targets: { 0: 90, 1: 110, 2: 110, 3: 110, 4: 110, 5: 110 },
    Contacts: { 0: 70, 1: 80, 2: 90, 3: 50, 4: 60, 5: 200, 6: 130, 7: 170, 8: 70 },
    Report: { 0: 360, 1: 150, 2: 30, 3: 90 }
  };
  var RIBBON = {
    xl365: ['File', 'Home', 'Insert', 'Draw', 'Page Layout', 'Formulas', 'Data', 'Review', 'View', 'Help'],
    xl2013: ['FILE', 'HOME', 'INSERT', 'PAGE LAYOUT', 'FORMULAS', 'DATA', 'REVIEW', 'VIEW'],
    gs: ['File', 'Edit', 'View', 'Insert', 'Format', 'Data', 'Tools', 'Extensions', 'Help']
  };
  var HIDDEN_IN_EXCEL_AC = ['DATEDIF']; // Excel never autocompletes DATEDIF (it is "hidden")
  var REF_COLORS = ['#3b82f6', '#ef4444', '#a855f7', '#16a34a', '#f59e0b', '#0891b2'];

  // opts (v2): key = workbook/state key, challenges = lesson ids for the panel, firstSheet, titleExtra, docTitle
  function SheetView(plat, host, opts) {
    opts = opts || {};
    this.opts = opts;
    this.plat = plat; this.P = PL[plat];
    this.key = opts.key || plat;
    this.chPlats = opts.challenges || [plat];
    this.wb = UI.workbook(this.key);
    this.excel = plat !== 'gs';
    var saved = UI.state.ui['sheet_' + this.key];
    this.sheet = saved && this.wb.sheet(saved) ? saved : (opts.firstSheet || 'Products');
    this.r = 1; this.c = 0; this.ar = 1; this.ac = 0;
    this.editing = null;
    this.showFormulas = false;
    this.cache = {};
    this.host = host;
    this.build();
    this.renderGrid();
    this.refresh();
    var self = this;
    this.onDocKey = function (e) { self.docKey(e); };
    this.onCopy = function (e) { self.clipEvent(e, 'copy'); };
    this.onCut = function (e) { self.clipEvent(e, 'cut'); };
    this.onPaste = function (e) { self.clipEvent(e, 'paste'); };
    this.onUp = function (e) { self.mouseUp(e); };
    this.onMove = function (e) { self.mouseMove(e); };
    document.addEventListener('keydown', this.onDocKey);
    document.addEventListener('copy', this.onCopy);
    document.addEventListener('cut', this.onCut);
    document.addEventListener('paste', this.onPaste);
    document.addEventListener('mouseup', this.onUp);
    document.addEventListener('mousemove', this.onMove);
    setTimeout(function () { self.gridWrap.focus({ preventScroll: true }); }, 0);
  }
  UI.SheetView = SheetView;

  SheetView.prototype.destroy = function () {
    document.removeEventListener('keydown', this.onDocKey);
    document.removeEventListener('copy', this.onCopy);
    document.removeEventListener('cut', this.onCut);
    document.removeEventListener('paste', this.onPaste);
    document.removeEventListener('mouseup', this.onUp);
    document.removeEventListener('mousemove', this.onMove);
    UI.save();
  };

  // ======================= Build DOM =======================
  SheetView.prototype.build = function () {
    var self = this, plat = this.plat;
    var root = this.root = h('div.ws.sheet-ws.theme-' + plat);

    // Title bar (styled per app)
    root.appendChild(h('div.app-title', null, [
      h('button.back-btn', { onclick: function () { UI.go('home'); }, title: 'Back to home' }, '← Home'),
      UI.platIcon(this.P),
      h('span.doc-title', { text: this.opts.docTitle || this.P.title }),
      this.opts.titleExtra || null,
      h('span.app-ver', { text: this.P.name })
    ]));
    // Menu / ribbon tabs (decorative, helps it feel like the real app)
    root.appendChild(h('div.menu-row', null, RIBBON[plat].map(function (t, i) {
      var active = (plat === 'gs') ? false : t.toUpperCase() === 'HOME';
      return h('span.menu-item' + (active ? '.on' : '') + (plat === 'xl2013' && i === 0 ? '.file-tab' : '') + (plat === 'xl365' && i === 0 ? '.file-tab365' : ''), { text: t });
    })));

    // Toolbar
    var fmtSel = this.fmtSel = h('select.tb-select', { title: 'Number format', 'aria-label': 'Number format', onchange: function () { self.applyFormat(fmtSel.value); fmtSel.blur(); self.focusGrid(); } },
      [['general', plat === 'gs' ? 'Automatic' : 'General'], ['number', 'Number'], ['currency', 'Currency'], ['percent', 'Percent'], ['date', 'Date']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    function tb(label, title, fn, cls) { return h('button.tb-btn' + (cls ? '.' + cls : ''), { title: title, 'aria-label': title, onmousedown: function (e) { e.preventDefault(); }, onclick: fn }, label); }
    this.panelBtns = {};
    var pb = function (id, label, title) {
      var b = tb(label, title, function () { self.togglePanel(id); }, 'tb-panel');
      self.panelBtns[id] = b; return b;
    };
    root.appendChild(h('div.toolbar', null, [
      h('div.tb-group', null, [tb('↶', 'Undo (Ctrl+Z)', function () { self.undo(); }), tb('↷', 'Redo (Ctrl+Y)', function () { self.redo(); })]),
      h('div.tb-group', null, [tb('✂', 'Cut (Ctrl+X)', function () { self.copySel(true); }), tb('⧉', 'Copy (Ctrl+C)', function () { self.copySel(false); }), tb('📋', 'Paste (Ctrl+V)', function () { self.pasteInternal(); })]),
      h('div.tb-group', null, [fmtSel]),
      h('div.tb-group', null, [tb('Σ', 'AutoSum', function () { self.autoSum(); }), tb('fx', 'Insert function', function () { self.insertFunctionDialog(); }, 'tb-fx'),
        tb('⤓', 'Fill down (Ctrl+D)', function () { self.fill('down'); }), this.sfBtn = tb('{=}', 'Show formulas (Ctrl+`)', function () { self.toggleFormulas(); })]),
      h('div.tb-spacer'),
      h('div.tb-group.tb-panels', null, [pb('challenges', '🏆 Challenges', 'Challenges'), pb('cheat', '📘 Cheat sheet', 'Cheat sheet'), pb('elsewhere', '🌐 Will it work elsewhere?', 'Run this formula in every app')]),
      tb('⟲', 'Reset this workbook to the original data', function () { self.resetData(); }, 'tb-reset')
    ]));

    // Formula bar
    this.nameBox = h('input.namebox', { 'aria-label': 'Name box', spellcheck: 'false', onkeydown: function (e) {
      if (e.key === 'Enter') { e.preventDefault(); self.goToAddr(self.nameBox.value); self.focusGrid(); }
      else if (e.key === 'Escape') { self.nameBox.blur(); self.focusGrid(); }
    } });
    this.fx = h('input.fx-input', { 'aria-label': 'Formula bar', spellcheck: 'false', autocomplete: 'off' });
    this.fx.addEventListener('focus', function () { if (!self.editing) self.startEdit(self.wb.formulaText(self.sheet, self.r, self.c).replace(/^\{(.*)\}$/, '$1'), false, true); });
    this.fx.addEventListener('input', function () { self.onEditInput(self.fx); });
    this.fx.addEventListener('keydown', function (e) { self.editKey(e, self.fx); });
    this.fx.addEventListener('click', function () { self.updateAssist(); });
    var fxLabel = h('span.fx-label', { text: 'fx', title: 'Insert function', onclick: function () { self.insertFunctionDialog(); } });
    this.fxWrap = h('div.fbar', null, [this.nameBox, h('div.fbar-sep', null, this.excel ? [h('span.fbar-x', { text: '✕', title: 'Cancel', onmousedown: function (e) { e.preventDefault(); self.endEdit(false); } }), h('span.fbar-ok', { text: '✓', title: 'Enter', onmousedown: function (e) { e.preventDefault(); self.endEdit(true, 0, 0); } })] : null), fxLabel, this.fx]);
    this.cellInfo = h('div.cellinfo');

    // Grid
    this.gridInner = h('div.grid-inner');
    this.gridWrap = h('div.grid-wrap', { tabindex: '0', 'aria-label': 'Spreadsheet grid' }, this.gridInner);
    this.gridWrap.addEventListener('mousedown', function (e) { self.mouseDown(e); });
    this.gridWrap.addEventListener('dblclick', function (e) { self.dblClick(e); });

    this.editor = h('input.cell-editor', { spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Cell editor' });
    this.editor.addEventListener('input', function () { self.onEditInput(self.editor); });
    this.editor.addEventListener('keydown', function (e) { self.editKey(e, self.editor); });
    this.editor.addEventListener('click', function () { self.updateAssist(); });
    this.acPop = h('div.ac-pop', { role: 'listbox' });
    this.sigTip = h('div.sig-tip');

    this.tabs = h('div.sheet-tabs');
    this.status = h('div.statusbar');

    var main = h('div.ws-main', null, [this.fxWrap, this.cellInfo, this.gridWrap, this.tabs, this.status]);
    this.panelHost = h('div.panel-host');
    root.appendChild(h('div.ws-body', null, [main, this.panelHost]));
    root.appendChild(this.acPop); root.appendChild(this.sigTip);
    this.host.appendChild(root);

    var open = UI.state.ui['panel_' + this.key];
    this.togglePanel(open === undefined ? 'challenges' : open, true);
  };

  SheetView.prototype.renderGrid = function () {
    var self = this, s = this.sheet;
    var widths = (UI.state.colw[this.key] && UI.state.colw[this.key][s]) || {};
    var dw = DEFAULT_W[s] || {};
    var colgroup = h('colgroup', null, [h('col', { style: { width: '46px' } })]);
    this.cols = [];
    for (var c = 0; c < COLS; c++) {
      var col = h('col', { style: { width: (widths[c] || dw[c] || (this.plat === 'gs' ? 100 : 72)) + 'px' } });
      this.cols.push(col); colgroup.appendChild(col);
    }
    var thead = h('thead'), hr = h('tr');
    hr.appendChild(h('th.corner', { onmousedown: function (e) { e.preventDefault(); self.selectAll(); } }));
    this.colHeads = [];
    for (c = 0; c < COLS; c++) {
      var th = h('th.colh', { 'data-c': c }, [F.idxToCol(c), h('span.col-resize', { 'data-c': c })]);
      this.colHeads.push(th); hr.appendChild(th);
    }
    thead.appendChild(hr);
    var tbody = h('tbody');
    this.tds = []; this.rowHeads = [];
    for (var r = 0; r < ROWS; r++) {
      var tr = h('tr'), rh = h('th.rowh', { 'data-r': r, text: r + 1 });
      this.rowHeads.push(rh); tr.appendChild(rh);
      var row = [];
      for (c = 0; c < COLS; c++) { var td = document.createElement('td'); td.dataset.r = r; td.dataset.c = c; row.push(td); tr.appendChild(td); }
      this.tds.push(row); tbody.appendChild(tr);
    }
    this.table = h('table.grid', null, [colgroup, thead, tbody]);
    this.sizeTable();
    this.selBox = h('div.selbox', null, h('div.fill-handle', { title: 'Drag to fill' }));
    this.spillBox = h('div.spillbox');
    this.refLayer = h('div.ref-layer');
    this.gridInner.innerHTML = '';
    this.gridInner.appendChild(this.table);
    this.gridInner.appendChild(this.spillBox);
    this.gridInner.appendChild(this.refLayer);
    this.gridInner.appendChild(this.selBox);
    this.gridInner.appendChild(this.editor);
    this.cache = {};
    this.renderTabs();
  };

  SheetView.prototype.sizeTable = function () {
    var w = 46; this.cols.forEach(function (c) { w += parseInt(c.style.width, 10); });
    this.table.style.width = w + 'px';
  };

  SheetView.prototype.renderTabs = function () {
    var self = this;
    this.tabs.innerHTML = '';
    if (!this.excel) this.tabs.appendChild(h('span.tab-plus', { text: '+', title: 'Add sheet (not available in this practice app)' }));
    this.wb.sheets.forEach(function (s) {
      self.tabs.appendChild(h('button.sheet-tab' + (s.name === self.sheet ? '.on' : ''), { text: s.name, onmousedown: function (e) { e.preventDefault(); }, onclick: function () { self.switchSheet(s.name); } }));
    });
    if (this.excel) this.tabs.appendChild(h('span.tab-plus', { text: '⊕', title: 'Add sheet (not available in this practice app)' }));
  };

  SheetView.prototype.switchSheet = function (name, keepSel) {
    if (name === this.sheet) return;
    var formulaEdit = this.editing && this.isFormulaText(this.editValue());
    if (this.editing && !formulaEdit) { if (!this.endEdit(true, 0, 0)) return; }
    this.sheet = name;
    UI.state.ui['sheet_' + this.key] = name;
    if (!keepSel) { this.r = this.ar = 1; this.c = this.ac = 0; }
    this.renderGrid();
    if (formulaEdit) { this.editor.style.display = 'none'; this.fx.focus(); }
    this.refresh();
  };

  // ======================= Refresh =======================
  SheetView.prototype.refresh = function () {
    var wb = this.wb, s = this.sheet, sel = this.selRange();
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var td = this.tds[r][c], d = wb.display(s, r, c);
        var text = d.text, cls = '';
        if (this.showFormulas) {
          var cell = wb.getCell(s, r, c);
          if (cell && cell.isFormula) { text = wb.formulaText(s, r, c); cls = 'sf'; }
        }
        if (d.err) cls += ' err';
        else if (d.align === 'right' && cls !== 'sf') cls += ' num';
        else if (d.align === 'center') cls += ' ctr';
        if (d.spilled) cls += ' spilled';
        if (r === 0 && s !== 'Scratch' && text) cls += ' hdr';
        if (r >= sel.r1 && r <= sel.r2 && c >= sel.c1 && c <= sel.c2 && !(r === this.r && c === this.c)) cls += ' insel';
        var key = text + '|' + cls;
        if (this.cache[r + ',' + c] !== key) {
          td.textContent = text; td.className = cls;
          if (d.err) td.title = d.err.code + ': ' + (d.err.msg || F.ERR_TEXT[d.err.code] || ''); else td.removeAttribute('title');
          this.cache[r + ',' + c] = key;
        }
      }
    }
    for (c = 0; c < COLS; c++) this.colHeads[c].classList.toggle('hl', c >= sel.c1 && c <= sel.c2);
    for (r = 0; r < ROWS; r++) this.rowHeads[r].classList.toggle('hl', r >= sel.r1 && r <= sel.r2);
    this.positionSel();
    this.updateBars();
    this.updateStatus();
    var cellNow = wb.getCell(s, this.r, this.c);
    this.fmtSel.value = (cellNow && cellNow.fmt) || wb.display(s, this.r, this.c).fmt || 'general';
    if (!this.fmtSel.value) this.fmtSel.value = 'general';
    this.sfBtn.classList.toggle('on', this.showFormulas);
    if (this.panel && this.panel.current() === 'elsewhere') this.refreshElsewhere();
  };

  SheetView.prototype.selRange = function () {
    return { r1: Math.min(this.r, this.ar), r2: Math.max(this.r, this.ar), c1: Math.min(this.c, this.ac), c2: Math.max(this.c, this.ac) };
  };
  SheetView.prototype.cellRect = function (r, c) {
    var td = this.tds[r][c], base = this.gridInner.getBoundingClientRect(), b = td.getBoundingClientRect();
    return { left: b.left - base.left, top: b.top - base.top, width: b.width, height: b.height };
  };
  SheetView.prototype.boxAround = function (el, r1, c1, r2, c2) {
    var a = this.cellRect(r1, c1), b = this.cellRect(r2, c2);
    el.style.left = (a.left - 1) + 'px'; el.style.top = (a.top - 1) + 'px';
    el.style.width = (b.left + b.width - a.left + 1) + 'px'; el.style.height = (b.top + b.height - a.top + 1) + 'px';
  };
  SheetView.prototype.positionSel = function () {
    var s = this.selRange();
    this.boxAround(this.selBox, s.r1, s.c1, s.r2, s.c2);
    this.selBox.style.display = this.editing && this.editing.sheet === this.sheet && this.isFormulaText(this.editValue()) ? 'none' : '';
    // spill outline (dashed blue, like Excel)
    var ak = this.wb.cover[this.sheet + '|' + this.r + ',' + this.c] || (this.wb.spills[this.sheet + '|' + this.r + ',' + this.c] ? this.sheet + '|' + this.r + ',' + this.c : null);
    var sp = ak && this.wb.spills[ak];
    if (sp && sp.sheet === this.sheet) { this.boxAround(this.spillBox, sp.r1, sp.c1, sp.r2, sp.c2); this.spillBox.style.display = 'block'; }
    else this.spillBox.style.display = 'none';
  };
  SheetView.prototype.scrollIntoView = function (r, c) {
    var rect = this.cellRect(r, c), w = this.gridWrap;
    var headH = 24, headW = 46;
    if (rect.top - headH < w.scrollTop) w.scrollTop = Math.max(0, rect.top - headH);
    else if (rect.top + rect.height > w.scrollTop + w.clientHeight) w.scrollTop = rect.top + rect.height - w.clientHeight;
    if (rect.left - headW < w.scrollLeft) w.scrollLeft = Math.max(0, rect.left - headW);
    else if (rect.left + rect.width > w.scrollLeft + w.clientWidth) w.scrollLeft = rect.left + rect.width - w.clientWidth;
  };

  SheetView.prototype.updateBars = function () {
    var s = this.sheet, wb = this.wb, sel = this.selRange();
    if (document.activeElement !== this.nameBox) {
      this.nameBox.value = this.dragging && (sel.r2 > sel.r1 || sel.c2 > sel.c1) ? (sel.r2 - sel.r1 + 1) + 'R x ' + (sel.c2 - sel.c1 + 1) + 'C' : F.addr(this.r, this.c);
    }
    var info = [];
    if (!this.editing) {
      var ftext = wb.formulaText(s, this.r, this.c);
      this.fx.classList.remove('ghost');
      var cover = wb.cover[s + '|' + this.r + ',' + this.c];
      if (!ftext && cover && this.excel) {
        var ap = cover.split('|')[1].split(',');
        ftext = wb.formulaText(s, +ap[0], +ap[1]);
        this.fx.classList.add('ghost');
      }
      this.fx.value = ftext;
      var d = wb.display(s, this.r, this.c);
      if (d.err) {
        var err = d.err;
        info.push(h('span.ci-err', null, [h('b', { text: err.code }), ' ', err.msg || '']));
        info.push(h('span.ci-mean', { text: F.ERR_TEXT[err.code] || '' }));
        UI.discoverError(err.code);
      } else if (cover) {
        var a2 = cover.split('|')[1].split(',');
        info.push(h('span.ci-note', { text: 'This value spilled from the formula in ' + F.addr(+a2[0], +a2[1]) + '.' + (this.excel ? ' Type here and the spill breaks (#SPILL!).' : '') }));
      } else {
        var cell = wb.getCell(s, this.r, this.c);
        if (cell && cell.cse) info.push(h('span.ci-note', { text: 'Array formula (entered with Ctrl+Shift+Enter). The { } are added by Excel — you never type them.' }));
        else if (wb.spills[s + '|' + this.r + ',' + this.c]) info.push(h('span.ci-note', { text: 'This formula spills. ' + (this.excel ? 'Other formulas can use the whole result with ' + F.addr(this.r, this.c) + '#' : '') }));
      }
    }
    this.cellInfo.innerHTML = '';
    info.forEach(function (x) { this.cellInfo.appendChild(x); }, this);
    this.cellInfo.classList.toggle('show', info.length > 0);
    this.cellInfo.classList.toggle('is-err', info.length > 0 && info[0].className === 'ci-err');
  };

  SheetView.prototype.updateStatus = function () {
    var sel = this.selRange(), nums = [], count = 0, wb = this.wb;
    if (sel.r2 > sel.r1 || sel.c2 > sel.c1) {
      for (var r = sel.r1; r <= sel.r2; r++) for (var c = sel.c1; c <= sel.c2; c++) {
        var v = wb.value(this.sheet, r, c);
        if (v !== null && v !== '' && v !== undefined) count++;
        if (typeof v === 'number') nums.push(v);
      }
    }
    var mode = this.editing ? (this.editing.point ? 'Point' : this.editing.fromTyping ? 'Enter' : 'Edit') : 'Ready';
    var parts = [];
    if (this.excel) {
      parts.push(h('span.st-mode', { text: mode }));
      if (wb.circular) parts.push(h('span.st-circ', { text: 'Circular References: ' + F.addr(wb.circular.r, wb.circular.c) }));
      parts.push(h('span.st-spacer'));
      if (count > 1) {
        if (nums.length) parts.push(h('span', { text: 'Average: ' + E.displayValue(nums.reduce(function (a, b) { return a + b; }, 0) / nums.length) }));
        parts.push(h('span', { text: 'Count: ' + count }));
        if (nums.length) parts.push(h('span', { text: 'Sum: ' + E.displayValue(nums.reduce(function (a, b) { return a + b; }, 0)) }));
      }
      parts.push(h('span.st-zoom', { text: '100%' }));
    } else {
      parts.push(h('span.st-spacer'));
      if (nums.length > 1) parts.push(h('span.st-sum', { text: 'Sum: ' + E.displayValue(nums.reduce(function (a, b) { return a + b; }, 0)) }));
      else if (count > 1) parts.push(h('span.st-sum', { text: 'Count: ' + count }));
    }
    this.status.innerHTML = '';
    parts.forEach(function (p) { this.status.appendChild(p); }, this);
  };

  // ======================= Selection & mouse =======================
  SheetView.prototype.select = function (r, c, extend) {
    r = Math.max(0, Math.min(ROWS - 1, r)); c = Math.max(0, Math.min(COLS - 1, c));
    this.r = r; this.c = c;
    if (!extend) { this.ar = r; this.ac = c; }
    this.refresh();
    this.scrollIntoView(r, c);
  };
  SheetView.prototype.selectAll = function () { this.ar = 0; this.ac = 0; this.r = ROWS - 1; this.c = COLS - 1; this.refresh(); this.r = 0; this.c = 0; this.refresh(); };
  SheetView.prototype.focusGrid = function () { this.gridWrap.focus({ preventScroll: true }); };

  function tdFrom(e) { var t = e.target; while (t && t.tagName !== 'TD' && t.tagName !== 'TH' && !t.classList.contains('grid-wrap')) t = t.parentNode; return t; }

  SheetView.prototype.mouseDown = function (e) {
    if (e.button !== 0) return;
    var self = this;
    if (e.target.classList.contains('col-resize')) { this.startResize(e, +e.target.dataset.c); return; }
    if (e.target.classList.contains('fill-handle')) { e.preventDefault(); this.fillDrag = { r: this.r, c: this.c, sel: this.selRange(), tr: this.r, tc: this.c }; return; }
    if (e.target === this.editor) return;
    var t = tdFrom(e);
    if (!t || t.classList.contains('grid-wrap')) return;
    if (t.tagName === 'TH') {
      e.preventDefault();
      if (t.classList.contains('colh')) { if (this.editing && !this.endEdit(true, 0, 0)) return; var c = +t.dataset.c; this.ar = 0; this.ac = c; this.r = ROWS - 1; this.c = c; this.refresh(); this.r = 0; this.refresh(); this.focusGrid(); }
      if (t.classList.contains('rowh')) { if (this.editing && !this.endEdit(true, 0, 0)) return; var r0 = +t.dataset.r; this.ar = r0; this.ac = 0; this.r = r0; this.c = COLS - 1; this.refresh(); this.c = 0; this.refresh(); this.focusGrid(); }
      return;
    }
    var r = +t.dataset.r, cc = +t.dataset.c;
    if (this.editing) {
      if (this.canInsertRef()) {
        e.preventDefault();
        this.pointAt(r, cc, r, cc, true);
        this.pointDrag = { r: r, c: cc };
        return;
      }
      if (!this.endEdit(true, 0, 0)) { e.preventDefault(); return; }
    }
    e.preventDefault();
    this.dragging = true;
    this.select(r, cc, e.shiftKey);
    this.focusGrid();
  };
  SheetView.prototype.mouseMove = function (e) {
    if (!this.dragging && !this.pointDrag && !this.fillDrag && !this.resizing) return;
    if (this.resizing) { this.doResize(e); return; }
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el.tagName !== 'TD' || !this.gridInner.contains(el)) return;
    var r = +el.dataset.r, c = +el.dataset.c;
    if (this.pointDrag) { this.pointAt(this.pointDrag.r, this.pointDrag.c, r, c, false); return; }
    if (this.fillDrag) {
      var fd = this.fillDrag; fd.tr = r; fd.tc = c;
      var s = fd.sel, down = r - s.r2, right = c - s.c2;
      if (down >= right && down > 0) this.boxAround(this.selBox, s.r1, s.c1, r, s.c2);
      else if (right > 0) this.boxAround(this.selBox, s.r1, s.c1, s.r2, c);
      else this.boxAround(this.selBox, s.r1, s.c1, s.r2, s.c2);
      this.selBox.classList.add('filling');
      return;
    }
    if (this.dragging && (r !== this.r || c !== this.c)) { this.r = r; this.c = c; this.refresh(); }
  };
  SheetView.prototype.mouseUp = function () {
    if (this.resizing) { this.endResize(); return; }
    if (this.fillDrag) {
      var fd = this.fillDrag, s = fd.sel; this.fillDrag = null; this.selBox.classList.remove('filling');
      var down = fd.tr - s.r2, right = fd.tc - s.c2;
      var clip = this.wb.copy(this.sheet, s.r1, s.c1, s.r2, s.c2);
      if (down >= right && down > 0) { this.wb.applyEdits(this.wb.pasteEdits(clip, this.sheet, s.r2 + 1, s.c1, down, s.c2 - s.c1 + 1)); this.r = s.r1; this.ar = fd.tr; this.c = s.c1; this.ac = s.c2; this.afterChange(); }
      else if (right > 0) { this.wb.applyEdits(this.wb.pasteEdits(clip, this.sheet, s.r1, s.c2 + 1, s.r2 - s.r1 + 1, right)); this.r = s.r1; this.ar = s.r2; this.c = s.c1; this.ac = fd.tc; this.afterChange(); }
      else this.refresh();
      return;
    }
    if (this.pointDrag) { this.pointDrag = null; var el = this.activeEditEl(); if (el) el.focus(); return; }
    if (this.dragging) { this.dragging = false; this.updateBars(); }
  };
  SheetView.prototype.dblClick = function (e) {
    var t = tdFrom(e);
    if (!t || t.tagName !== 'TD' || this.editing) return;
    this.startEdit(this.wb.formulaText(this.sheet, this.r, this.c).replace(/^\{(.*)\}$/, '$1'), false);
  };

  // Column resize
  SheetView.prototype.startResize = function (e, c) {
    e.preventDefault(); e.stopPropagation();
    this.resizing = { c: c, x: e.clientX, w: parseInt(this.cols[c].style.width, 10) };
  };
  SheetView.prototype.doResize = function (e) {
    var rz = this.resizing, w = Math.max(30, rz.w + e.clientX - rz.x);
    this.cols[rz.c].style.width = w + 'px'; rz.nw = w; this.sizeTable();
  };
  SheetView.prototype.endResize = function () {
    var rz = this.resizing; this.resizing = null;
    if (rz.nw) {
      var cw = UI.state.colw[this.key] = UI.state.colw[this.key] || {};
      (cw[this.sheet] = cw[this.sheet] || {})[rz.c] = rz.nw; UI.save();
    }
    this.positionSel();
  };

  // ======================= Keyboard (not editing) =======================
  SheetView.prototype.docKey = function (e) {
    var t = e.target;
    if (document.querySelector('.modal-overlay')) return;
    if (t === this.editor || t === this.fx || t === this.nameBox) return;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') ) return;
    if (t && t.closest && t.closest('.side-panel')) return;
    if (!this.root.isConnected) return;
    this.gridKey(e);
  };
  SheetView.prototype.gridKey = function (e) {
    var ctrl = e.ctrlKey || e.metaKey, k = e.key;
    var moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[k]) {
      e.preventDefault();
      var m = moves[k];
      if (ctrl) { var p = this.jump(this.r, this.c, m[0], m[1]); this.select(p[0], p[1], e.shiftKey); }
      else this.select(this.r + m[0], this.c + m[1], e.shiftKey);
      return;
    }
    if (k === 'Enter') { e.preventDefault(); this.select(this.r + (e.shiftKey ? -1 : 1), this.c); return; }
    if (k === 'Tab') { e.preventDefault(); this.select(this.r, this.c + (e.shiftKey ? -1 : 1)); return; }
    if (k === 'Home') { e.preventDefault(); this.select(ctrl ? 0 : this.r, 0); return; }
    if (k === 'PageDown') { e.preventDefault(); this.select(this.r + 20, this.c, e.shiftKey); return; }
    if (k === 'PageUp') { e.preventDefault(); this.select(this.r - 20, this.c, e.shiftKey); return; }
    if (k === 'F2') { e.preventDefault(); this.startEdit(this.wb.formulaText(this.sheet, this.r, this.c).replace(/^\{(.*)\}$/, '$1'), false); return; }
    if (k === 'Delete') { e.preventDefault(); this.clearSel(); return; }
    if (k === 'Backspace') { e.preventDefault(); this.startEdit('', true); return; }
    if (k === 'Escape') { this.clipMarquee(false); return; }
    if (ctrl) {
      var lk = k.toLowerCase();
      if (lk === 'z') { e.preventDefault(); this.undo(); return; }
      if (lk === 'y') { e.preventDefault(); this.redo(); return; }
      if (lk === 'd') { e.preventDefault(); this.fill('down'); return; }
      if (lk === 'r') { e.preventDefault(); this.fill('right'); return; }
      if (lk === 'a') { e.preventDefault(); this.selectAll(); return; }
      if (k === '`' || k === '~') { e.preventDefault(); this.toggleFormulas(); return; }
      return; // let copy/paste events through
    }
    if (k.length === 1 && !e.altKey) { e.preventDefault(); this.startEdit(k, true); }
  };
  SheetView.prototype.jump = function (r, c, dr, dc) {
    var wb = this.wb, s = this.sheet;
    function filled(rr, cc) { return rr >= 0 && cc >= 0 && rr < ROWS && cc < COLS && wb.display(s, rr, cc).text !== ''; }
    var nr = r + dr, nc = c + dc;
    if (filled(r, c) && filled(nr, nc)) { while (filled(nr + dr, nc + dc)) { nr += dr; nc += dc; } return [nr, nc]; }
    while (nr >= 0 && nc >= 0 && nr < ROWS && nc < COLS && !filled(nr, nc)) { nr += dr; nc += dc; }
    return [Math.max(0, Math.min(ROWS - 1, nr)), Math.max(0, Math.min(COLS - 1, nc))];
  };

  // ======================= Editing =======================
  SheetView.prototype.isFormulaText = function (t) { return typeof t === 'string' && t[0] === '='; };
  SheetView.prototype.activeEditEl = function () { return this.editing ? (this.editing.inFx ? this.fx : this.editor) : null; };
  SheetView.prototype.editValue = function () { var el = this.activeEditEl(); return el ? el.value : ''; };

  SheetView.prototype.startEdit = function (text, fromTyping, inFx) {
    if (this.editing) return;
    this.ar = this.r; this.ac = this.c;
    this.editing = { r: this.r, c: this.c, sheet: this.sheet, fromTyping: fromTyping, inFx: !!inFx, orig: this.wb.formulaText(this.sheet, this.r, this.c), point: null };
    var rect = this.cellRect(this.r, this.c);
    var ed = this.editor;
    ed.value = text; this.fx.value = text; this.fx.classList.remove('ghost');
    ed.style.left = rect.left + 'px'; ed.style.top = rect.top + 'px';
    ed.style.height = rect.height + 'px'; ed.style.minWidth = rect.width + 'px';
    ed.style.display = 'block';
    this.sizeEditor();
    this.cellInfo.classList.remove('show');
    var el = inFx ? this.fx : ed;
    el.focus();
    el.setSelectionRange(text.length, text.length);
    this.positionSel();
    this.updateAssist();
    this.updateStatus();
  };
  SheetView.prototype.sizeEditor = function () {
    var ed = this.editor;
    ed.style.width = Math.max(parseFloat(ed.style.minWidth) || 60, ed.value.length * 7.6 + 14) + 'px';
  };
  SheetView.prototype.onEditInput = function (src) {
    if (!this.editing) return;
    var other = src === this.editor ? this.fx : this.editor;
    other.value = src.value;
    this.editing.inFx = src === this.fx;
    this.editing.point = null;
    this.sizeEditor();
    this.updateAssist();
    this.positionSel();
    this.updateStatus();
  };

  // Commit or cancel. dr/dc = where to move afterwards. Returns false if Excel refused the formula.
  SheetView.prototype.endEdit = function (commit, dr, dc, opts) {
    if (!this.editing) return true;
    opts = opts || {};
    var ed = this.editing, text = this.editValue();
    if (commit) {
      var changed = text !== ed.orig.replace(/^\{(.*)\}$/, '$1') || opts.cse;
      if (changed) {
        if (opts.cse && !this.excel && this.isFormulaText(text) && !/^=\s*ARRAYFORMULA\(/i.test(text)) text = '=ARRAYFORMULA(' + text.slice(1) + ')';
        var prep = this.wb.prepare(text, { cse: opts.cse });
        if (prep.dialog) { this.excelDialog(prep); return false; }
        this.wb.applyEdits([{ sheet: ed.sheet, r: ed.r, c: ed.c, cell: prep.cell }]);
        this.afterCommit(ed.sheet, ed.r, ed.c, prep.cell, opts);
      }
    }
    this.editing = null;
    this.editor.style.display = 'none';
    this.hideAssist();
    this.refLayer.innerHTML = '';
    if (this.sheet !== ed.sheet) { this.sheet = ed.sheet; this.renderGrid(); }
    this.r = this.ar = ed.r; this.c = this.ac = ed.c;
    this.focusGrid();
    if (dr || dc) this.select(ed.r + (dr || 0), ed.c + (dc || 0)); else this.refresh();
    return true;
  };

  SheetView.prototype.afterCommit = function (sheet, r, c, cell, opts) {
    UI.save();
    if (!cell || !cell.input || cell.input[0] !== '=') return;
    UI.state.stats.formulas = (UI.state.stats.formulas || 0) + 1;
    UI.badge('first-formula');
    if (cell.cse) UI.badge('cse');
    if (!this.excel && /ARRAYFORMULA\(/i.test(cell.input)) UI.badge('arrayformula');
    if (this.wb.spills[this.wb.sheetName(sheet) + '|' + r + ',' + c]) UI.badge('spill');
    var d = this.wb.display(sheet, r, c);
    if (d.err) UI.discoverError(d.err.code);
  };
  SheetView.prototype.afterChange = function () { UI.save(); this.refresh(); };

  SheetView.prototype.excelDialog = function (prep) {
    var self = this;
    var el = this.activeEditEl();
    UI.modal(this.P.name, [
      h('div.xl-dialog', null, [h('div.xl-dialog-icon', { text: '⚠' }), h('div', null, [
        h('p', null, h('b', { text: prep.dialog })),
        prep.detail ? h('p.small', { text: prep.detail }) : null,
        h('p.small.muted', { text: 'Excel will not accept a formula with a mistake in it. (Google Sheets would save it anyway and show #ERROR!.)' })
      ])])
    ], [{ text: 'OK', primary: true }], { cls: 'xl-modal', onClose: function () {
      if (el) { el.focus(); var p = prep.pos != null ? Math.min(prep.pos + 1, el.value.length) : el.value.length; el.setSelectionRange(p, p); }
      self.updateAssist();
    } });
  };

  SheetView.prototype.editKey = function (e, el) {
    if (!this.editing) {
      if (el === this.fx && e.key === 'Escape') { this.fx.blur(); this.focusGrid(); }
      return;
    }
    var k = e.key, ctrl = e.ctrlKey || e.metaKey;
    // autocomplete navigation
    if (this.acItems && this.acItems.length) {
      if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); this.acIndex = (this.acIndex + (k === 'ArrowDown' ? 1 : -1) + this.acItems.length) % this.acItems.length; this.drawAc(); return; }
      if (k === 'Tab' || (k === 'Enter' && !this.excel && !ctrl && !e.shiftKey)) { e.preventDefault(); this.acceptAc(this.acItems[this.acIndex]); return; }
      if (k === 'Escape') { e.preventDefault(); this.hideAc(); return; }
    }
    if (k === 'Enter') {
      e.preventDefault();
      if (ctrl && e.shiftKey) { this.endEdit(true, 0, 0, { cse: true }); return; }
      if (ctrl) { this.endEdit(true, 0, 0); return; }
      this.endEdit(true, e.shiftKey ? -1 : 1, 0); return;
    }
    if (k === 'Tab') { e.preventDefault(); this.endEdit(true, 0, e.shiftKey ? -1 : 1); return; }
    if (k === 'Escape') { e.preventDefault(); this.endEdit(false); return; }
    if (k === 'F4') { e.preventDefault(); this.toggleAbsolute(el); return; }
    var moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[k]) {
      if (this.canInsertRef() && (this.editing.fromTyping || this.editing.point)) {
        e.preventDefault();
        var p = this.editing.point, m = moves[k];
        if (p) {
          if (e.shiftKey) this.pointAt(p.ar, p.ac, Math.max(0, p.r2 + m[0]), Math.max(0, p.c2 + m[1]), false);
          else { var nr = Math.max(0, p.r2 + m[0]), nc = Math.max(0, p.c2 + m[1]); this.pointAt(nr, nc, nr, nc, false); }
        } else {
          var br = this.editing.sheet === this.sheet ? this.editing.r : 0, bc = this.editing.sheet === this.sheet ? this.editing.c : 0;
          var r0 = Math.max(0, br + m[0]), c0 = Math.max(0, bc + m[1]);
          this.pointAt(r0, c0, r0, c0, true);
        }
        return;
      }
      if (this.editing.fromTyping && !this.isFormulaText(el.value)) { e.preventDefault(); this.endEdit(true, moves[k][0], moves[k][1]); return; }
    }
    if (k.length === 1 || k === 'Backspace' || k === 'Delete') { if (this.editing.point) this.editing.point = null; }
    var self = this;
    setTimeout(function () { if (self.editing) self.updateAssist(); }, 0);
  };

  // Can a click/arrow insert a cell reference at the caret right now?
  SheetView.prototype.canInsertRef = function () {
    if (!this.editing) return false;
    var el = this.activeEditEl(), v = el.value;
    if (!this.isFormulaText(v)) return false;
    if (this.editing.point) return true;
    var pos = el.selectionStart, before = v.slice(0, pos).replace(/\s+$/, '');
    if (inString(before)) return false;
    return /[=(,+\-*/^&<>:]$/.test(before);
  };
  function inString(s) { var n = 0; for (var i = 0; i < s.length; i++) if (s[i] === '"') n++; return n % 2 === 1; }

  // Insert/replace a reference at the caret while editing a formula (point mode)
  SheetView.prototype.pointAt = function (ar, ac, r2, c2, fresh) {
    var el = this.activeEditEl(), v = el.value, ed = this.editing;
    var p = ed.point;
    var start, end;
    if (p && !fresh) { start = p.start; end = p.end; }
    else if (p && fresh && el.selectionStart === p.end) { start = p.start; end = p.end; }
    else { start = el.selectionStart; end = el.selectionEnd; }
    var r1 = Math.min(ar, r2), rr2 = Math.max(ar, r2), c1 = Math.min(ac, c2), cc2 = Math.max(ac, c2);
    var ref = F.addr(r1, c1) + (r1 !== rr2 || c1 !== cc2 ? ':' + F.addr(rr2, cc2) : '');
    if (this.sheet !== ed.sheet) ref = F.quoteSheet(this.sheet) + '!' + ref;
    var nv = v.slice(0, start) + ref + v.slice(end);
    el.value = nv; (el === this.fx ? this.editor : this.fx).value = nv;
    var caret = start + ref.length;
    el.setSelectionRange(caret, caret);
    ed.point = { start: start, end: caret, ar: ar, ac: ac, r2: r2, c2: c2 };
    this.sizeEditor();
    this.updateAssist();
    this.updateStatus();
    if (this.sheet === ed.sheet || true) this.scrollIntoView(Math.min(ROWS - 1, r2), Math.min(COLS - 1, c2));
  };

  SheetView.prototype.toggleAbsolute = function (el) {
    var v = el.value, pos = el.selectionStart;
    if (!this.isFormulaText(v)) return;
    var toks; try { toks = F.lex(v.slice(1)); } catch (e) { return; }
    var tk = toks.filter(function (t) { return t.t === 'REF' && t.s + 1 <= pos && t.e + 1 >= pos; })[0];
    if (!tk) tk = toks.filter(function (t) { return t.t === 'REF' && t.e + 1 <= pos; }).pop();
    if (!tk) return;
    var ref = JSON.parse(JSON.stringify(tk.ref));
    [ref.a, ref.b].forEach(function (pt) {
      if (!pt) return;
      var state = (pt.ca ? 2 : 0) + (pt.ra ? 1 : 0); // 0: A1, 3: $A$1, 1: A$1, 2: $A1
      var next = { 0: 3, 3: 1, 1: 2, 2: 0 }[state];
      pt.ca = next >= 2; pt.ra = next === 1 || next === 3;
    });
    var txt = F.refText(ref), nv = '=' + v.slice(1, tk.s + 1) + txt + v.slice(tk.e + 1);
    el.value = nv; (el === this.fx ? this.editor : this.fx).value = nv;
    var caret = tk.s + 1 + txt.length;
    el.setSelectionRange(caret, caret);
    this.updateAssist();
  };

  // ---------- Autocomplete & signature help ----------
  SheetView.prototype.updateAssist = function () {
    if (!this.editing) { this.hideAssist(); return; }
    var el = this.activeEditEl(), v = el.value, pos = el.selectionStart;
    this.drawRefHighlights(v);
    if (!this.isFormulaText(v)) { this.hideAssist(); return; }
    var before = v.slice(0, pos);
    // autocomplete
    var m = /(^|[=(,+\-*/^&<>\s])([A-Za-z][A-Za-z0-9.]*)$/.exec(before); // not after ":" (ranges like E2:E)
    this.acItems = [];
    if (m && !inString(before)) {
      var word = m[2].toUpperCase(), plat = this.wb.plat, excel = this.excel;
      if (!/^[A-Z]{1,3}\d+$/.test(word)) {
        this.acItems = Object.keys(E.FN).filter(function (n) {
          return n.indexOf(word) === 0 && E.available(n, plat) && !(excel && HIDDEN_IN_EXCEL_AC.indexOf(n) >= 0) && n !== 'TRUE' && n !== 'FALSE';
        }).sort().slice(0, 9);
        this.acWord = { start: pos - m[2].length, end: pos };
      }
    }
    this.acIndex = 0;
    this.drawAc();
    // signature
    var call = innermostCall(before);
    if (call && !this.acItems.length) {
      var info = E.fnInfo(call.name, this.wb.plat);
      if (info && info.available) this.drawSig(info, call.arg);
      else this.sigTip.style.display = 'none';
    } else this.sigTip.style.display = 'none';
  };
  function innermostCall(text) {
    var stack = [], inStr = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '(') {
        var m = /([A-Za-z][A-Za-z0-9.]*)$/.exec(text.slice(0, i));
        stack.push({ name: m ? m[1].toUpperCase() : null, arg: 0 });
      } else if (ch === ')') stack.pop();
      else if (ch === ',' && stack.length) stack[stack.length - 1].arg++;
    }
    for (var j = stack.length - 1; j >= 0; j--) if (stack[j].name) return stack[j];
    return null;
  }
  SheetView.prototype.anchorRect = function () {
    var el = this.activeEditEl();
    var r = el.getBoundingClientRect(), base = this.root.getBoundingClientRect();
    return { left: r.left - base.left, top: r.bottom - base.top + 2 };
  };
  SheetView.prototype.drawAc = function () {
    var self = this, pop = this.acPop;
    if (!this.acItems || !this.acItems.length) { pop.style.display = 'none'; return; }
    pop.innerHTML = '';
    this.acItems.forEach(function (n, i) {
      var info = E.fnInfo(n, self.wb.plat);
      pop.appendChild(h('div.ac-item' + (i === self.acIndex ? '.on' : ''), { role: 'option', onmousedown: function (e) { e.preventDefault(); self.acceptAc(n); } }, [
        h('span.ac-fx', { text: 'ƒ' }), h('b', { text: n }), h('span.ac-desc', { text: info.desc })
      ]));
    });
    if (this.acItems.length) pop.appendChild(h('div.ac-foot', { text: this.excel ? 'Tab to insert' : 'Tab or Enter to insert' }));
    var a = this.anchorRect();
    pop.style.left = a.left + 'px'; pop.style.top = a.top + 'px'; pop.style.display = 'block';
    this.sigTip.style.display = 'none';
  };
  SheetView.prototype.acceptAc = function (name) {
    var el = this.activeEditEl(), v = el.value, w = this.acWord;
    var nv = v.slice(0, w.start) + name + '(' + v.slice(w.end);
    el.value = nv; (el === this.fx ? this.editor : this.fx).value = nv;
    var caret = w.start + name.length + 1;
    el.setSelectionRange(caret, caret);
    this.editing.point = null;
    this.sizeEditor();
    this.hideAc();
    this.updateAssist();
  };
  SheetView.prototype.hideAc = function () { this.acItems = []; this.acPop.style.display = 'none'; };
  SheetView.prototype.hideAssist = function () { this.hideAc(); this.sigTip.style.display = 'none'; };
  SheetView.prototype.drawSig = function (info, argIdx) {
    var m = /^([^(]+)\((.*)\)$/.exec(info.sig);
    var tip = this.sigTip;
    tip.innerHTML = '';
    if (!m) return;
    var args = m[2].split(/,\s*/);
    var repeat = args.length && /\.\.\./.test(args[args.length - 1]);
    var idx = argIdx;
    if (idx >= args.length) idx = repeat ? args.length - 2 : args.length - 1;
    var line = h('div.sig-line', null, [h('span', { text: m[1] + '(' })]);
    args.forEach(function (a, i) {
      if (i) line.appendChild(document.createTextNode(', '));
      line.appendChild(h(i === idx ? 'b' : 'span', { text: a }));
    });
    line.appendChild(document.createTextNode(')'));
    tip.appendChild(line);
    tip.appendChild(h('div.sig-desc', { text: info.desc }));
    var a = this.anchorRect();
    tip.style.left = a.left + 'px'; tip.style.top = a.top + 'px'; tip.style.display = 'block';
  };

  // Colored boxes around the ranges a formula refers to (like Excel/Sheets do while editing)
  SheetView.prototype.drawRefHighlights = function (v) {
    var layer = this.refLayer, self = this;
    layer.innerHTML = '';
    if (!this.isFormulaText(v)) return;
    var toks; try { toks = F.lex(v.slice(1)); } catch (e) { return; }
    var i = 0;
    toks.forEach(function (t) {
      if (t.t !== 'REF') return;
      var ref = t.ref, sh = ref.sheet ? self.wb.sheetName(ref.sheet) : self.editing.sheet;
      var color = REF_COLORS[i++ % REF_COLORS.length];
      if (sh !== self.sheet) return;
      var r1, c1, r2, c2;
      if (ref.kind === 'cell') { r1 = r2 = ref.a.row; c1 = c2 = ref.a.col; }
      else if (ref.kind === 'range') { r1 = Math.min(ref.a.row, ref.b.row); r2 = Math.max(ref.a.row, ref.b.row); c1 = Math.min(ref.a.col, ref.b.col); c2 = Math.max(ref.a.col, ref.b.col); }
      else if (ref.kind === 'cols' || ref.kind === 'open') { r1 = ref.a.row || 0; r2 = ROWS - 1; c1 = Math.min(ref.a.col, ref.b.col); c2 = Math.max(ref.a.col, ref.b.col); }
      else return;
      if (r1 >= ROWS || c1 >= COLS) return;
      var box = h('div.refbox', { style: { borderColor: color, background: color + '14' } });
      self.boxAround(box, r1, c1, Math.min(r2, ROWS - 1), Math.min(c2, COLS - 1));
      layer.appendChild(box);
    });
  };

  // ======================= Commands =======================
  SheetView.prototype.undo = function () { if (this.editing) return; var b = this.wb.undo(); if (b && b.sheet && b.sheet !== this.sheet) this.switchSheet(b.sheet, true); if (b) { this.r = this.ar = b.r; this.c = this.ac = b.c; } this.afterChange(); };
  SheetView.prototype.redo = function () { if (this.editing) return; var b = this.wb.redo(); if (b && b.sheet && b.sheet !== this.sheet) this.switchSheet(b.sheet, true); if (b) { this.r = this.ar = b.r; this.c = this.ac = b.c; } this.afterChange(); };
  SheetView.prototype.clearSel = function () {
    var s = this.selRange(), edits = [];
    for (var r = s.r1; r <= s.r2; r++) for (var c = s.c1; c <= s.c2; c++) {
      var cell = this.wb.getCell(this.sheet, r, c);
      if (cell) edits.push({ sheet: this.sheet, r: r, c: c, cell: cell.fmt ? { input: '', fmt: cell.fmt } : null });
    }
    if (edits.length) { this.wb.applyEdits(edits); this.afterChange(); }
  };
  SheetView.prototype.fill = function (dir) {
    var s = this.selRange();
    if (dir === 'down') {
      if (s.r2 === s.r1) { if (s.r1 === 0) return; s.r1 -= 1; }
      var clip = this.wb.copy(this.sheet, s.r1, s.c1, s.r1, s.c2);
      this.wb.applyEdits(this.wb.pasteEdits(clip, this.sheet, s.r1 + 1, s.c1, s.r2 - s.r1, s.c2 - s.c1 + 1));
    } else {
      if (s.c2 === s.c1) { if (s.c1 === 0) return; s.c1 -= 1; }
      var clip2 = this.wb.copy(this.sheet, s.r1, s.c1, s.r2, s.c1);
      this.wb.applyEdits(this.wb.pasteEdits(clip2, this.sheet, s.r1, s.c1 + 1, s.r2 - s.r1 + 1, s.c2 - s.c1));
    }
    this.afterChange();
    this.checkNewErrors();
  };
  SheetView.prototype.checkNewErrors = function () {
    var s = this.selRange();
    for (var r = s.r1; r <= s.r2; r++) for (var c = s.c1; c <= s.c2; c++) { var d = this.wb.display(this.sheet, r, c); if (d.err) UI.discoverError(d.err.code); }
  };
  SheetView.prototype.applyFormat = function (fmt) {
    var s = this.selRange(), edits = [];
    for (var r = s.r1; r <= s.r2; r++) for (var c = s.c1; c <= s.c2; c++) {
      var cell = this.wb.getCell(this.sheet, r, c);
      edits.push({ sheet: this.sheet, r: r, c: c, cell: { input: cell ? cell.input : '', fmt: fmt, cse: cell && cell.cse } });
    }
    this.wb.applyEdits(edits); this.afterChange();
  };
  SheetView.prototype.toggleFormulas = function () { this.showFormulas = !this.showFormulas; this.cache = {}; this.refresh(); };
  SheetView.prototype.autoSum = function () {
    if (this.editing) return;
    var r = this.r - 1, c = this.c, wb = this.wb, s = this.sheet;
    while (r >= 0 && typeof wb.value(s, r, c) !== 'number') r--;
    var end = r;
    while (r >= 0 && typeof wb.value(s, r, c) === 'number') r--;
    var text = end >= 0 ? '=SUM(' + F.addr(r + 1, c) + ':' + F.addr(end, c) + ')' : '=SUM()';
    this.startEdit(text, true);
    if (end < 0) { this.editor.setSelectionRange(5, 5); }
  };
  SheetView.prototype.goToAddr = function (txt) {
    var m = /^\s*(?:(.+)!)?\$?([A-Za-z]{1,3})\$?(\d+)\s*$/.exec(txt || '');
    if (!m) { UI.toast('Not a cell address', 'Type something like B2 or Sales!E10'); return; }
    if (m[1] && this.wb.sheetName(m[1].replace(/^'|'$/g, ''))) this.switchSheet(this.wb.sheetName(m[1].replace(/^'|'$/g, '')));
    this.select(+m[3] - 1, F.colToIdx(m[2]));
  };
  SheetView.prototype.resetData = function () {
    var self = this;
    UI.modal('Reset ' + this.P.name + ' data?', [h('p', { text: 'This puts every sheet back to the original store data and erases your formulas in this app. Your XP and badges stay.' })], [
      { text: 'Cancel' },
      { text: 'Reset workbook', danger: true, onclick: function () { self.wb = UI.resetWorkbook(self.key); self.renderGrid(); self.refresh(); UI.toast('Workbook reset', 'Back to the original data.'); } }
    ]);
  };
  SheetView.prototype.insertFunctionDialog = function () {
    var self = this, plat = this.wb.plat;
    var names = Object.keys(E.FN).filter(function (n) { return E.available(n, plat) && n !== 'TRUE' && n !== 'FALSE'; }).sort();
    var search = h('input.input', { placeholder: 'Search functions…' });
    var list = h('div.fn-list');
    function draw() {
      var q = search.value.trim().toUpperCase();
      list.innerHTML = '';
      names.filter(function (n) { var i = E.fnInfo(n, plat); return !q || n.indexOf(q) >= 0 || i.desc.toUpperCase().indexOf(q) >= 0; }).forEach(function (n) {
        var i = E.fnInfo(n, plat);
        list.appendChild(h('button.fn-item', { onclick: function () { m.close(); self.insertFn(n); } }, [h('b', { text: n }), h('code', { text: i.sig }), h('span', { text: i.desc })]));
      });
    }
    search.addEventListener('input', draw);
    draw();
    var m = UI.modal('Insert function · ' + this.P.name + ' (' + names.length + ' functions)', [search, list], null, { cls: 'wide' });
  };
  SheetView.prototype.insertFn = function (name) {
    if (!this.editing) { this.startEdit('=' + name + '(', true); return; }
    var el = this.activeEditEl(), v = el.value, s = el.selectionStart;
    var nv = v.slice(0, s) + name + '(' + v.slice(el.selectionEnd);
    el.value = nv; (el === this.fx ? this.editor : this.fx).value = nv;
    el.focus(); el.setSelectionRange(s + name.length + 1, s + name.length + 1);
    this.updateAssist();
  };

  // ---------- Clipboard ----------
  SheetView.prototype.copySel = function (cut) {
    var s = this.selRange();
    this.clip = this.wb.copy(this.sheet, s.r1, s.c1, s.r2, s.c2);
    this.clip.cut = !!cut;
    var lines = [];
    for (var r = s.r1; r <= s.r2; r++) { var row = []; for (var c = s.c1; c <= s.c2; c++) row.push(this.wb.display(this.sheet, r, c).text); lines.push(row.join('\t')); }
    this.clipText = lines.join('\n');
    this.clipMarquee(true);
    return this.clipText;
  };
  SheetView.prototype.clipMarquee = function (on) {
    this.selBox.classList.toggle('marquee', !!on);
    if (!on) this.clip = this.clip && !this.clip.cut ? this.clip : null;
  };
  SheetView.prototype.pasteInternal = function () {
    if (!this.clip) { UI.toast('Nothing copied yet', 'Select cells and press Ctrl+C first.'); return; }
    var s = this.selRange(), clip = this.clip, edits;
    if (clip.cut) {
      edits = [];
      clip.items.forEach(function (it) { edits.push({ sheet: clip.sheet, r: clip.r + it.dr, c: clip.c + it.dc, cell: null }); });
      clip.items.forEach(function (it) { edits.push({ sheet: this.sheet, r: s.r1 + it.dr, c: s.c1 + it.dc, cell: it.cell ? { input: it.cell.input, fmt: it.cell.fmt, cse: it.cell.cse, keepFmt: false } : null }); }, this);
      this.clip = null;
    } else edits = this.wb.pasteEdits(clip, this.sheet, s.r1, s.c1, s.r2 - s.r1 + 1, s.c2 - s.c1 + 1);
    this.wb.applyEdits(edits);
    this.selBox.classList.remove('marquee');
    this.afterChange();
    this.checkNewErrors();
  };
  SheetView.prototype.clipEvent = function (e, kind) {
    if (!this.root.isConnected || this.editing) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t !== this.gridWrap) return;
    if (document.activeElement !== this.gridWrap && !this.gridWrap.contains(document.activeElement)) return;
    if (kind === 'copy' || kind === 'cut') {
      var text = this.copySel(kind === 'cut');
      if (e.clipboardData) { e.clipboardData.setData('text/plain', text); e.preventDefault(); }
      return;
    }
    var pasted = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    e.preventDefault();
    if (this.clip && (!pasted || pasted.replace(/\r/g, '') === this.clipText)) { this.pasteInternal(); return; }
    if (!pasted) return;
    var rows = pasted.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(function (l) { return l.split('\t'); });
    var edits = [], self = this;
    rows.forEach(function (row, i) { row.forEach(function (v, j) {
      if (self.r + i < ROWS && self.c + j < COLS) edits.push({ sheet: self.sheet, r: self.r + i, c: self.c + j, cell: v === '' ? null : { input: v } });
    }); });
    this.wb.applyEdits(edits); this.afterChange();
  };

  // ======================= Side panel =======================
  SheetView.prototype.togglePanel = function (id, initial) {
    var self = this;
    if (!initial && this.panel && this.panel.current() === id && this.panelHost.classList.contains('open')) {
      this.panelHost.classList.remove('open'); UI.state.ui['panel_' + this.key] = null; this.markPanelBtns(null); UI.save(); this.positionSel(); return;
    }
    if (!id) { this.panelHost.classList.remove('open'); this.markPanelBtns(null); return; }
    if (!this.panel) {
      this.panel = UI.sidePanel([
        { id: 'challenges', label: '🏆 Challenges', render: function () { return self.challengesTab(); } },
        { id: 'cheat', label: '📘 Cheat sheet', render: function () { return self.cheatTab(); } },
        { id: 'elsewhere', label: '🌐 Elsewhere', render: function () { return self.elsewhereTab(); } }
      ], id);
      this.panel.el.querySelector('.sp-tabs').addEventListener('click', function () { self.markPanelBtns(self.panel.current()); UI.state.ui['panel_' + self.key] = self.panel.current(); });
      this.panel.el.appendChild(h('button.sp-close', { title: 'Close panel', 'aria-label': 'Close panel', text: '×', onclick: function () { self.togglePanel(self.panel.current()); } }));
      this.panelHost.appendChild(this.panel.el);
    } else this.panel.show(id);
    this.panelHost.classList.add('open');
    UI.state.ui['panel_' + this.key] = id;
    this.markPanelBtns(id);
    if (!initial) UI.save();
    setTimeout(function () { self.positionSel(); }, 0);
  };
  SheetView.prototype.markPanelBtns = function (id) {
    for (var k in this.panelBtns) this.panelBtns[k].classList.toggle('on', k === id);
  };
  SheetView.prototype.challengesTab = function () {
    var self = this;
    return UI.challengePanel(this.chPlats, function () { return SX.challenges.sheetHelpers(self.wb); }, { goTo: function (addr) { if (self.editing) self.endEdit(true, 0, 0); self.goToAddr(addr); self.focusGrid(); } });
  };
  SheetView.prototype.cheatTab = function () {
    var self = this, plat = this.wb.plat, pid = this.plat;
    var names = Object.keys(E.FN).filter(function (n) { return n !== 'TRUE' && n !== 'FALSE'; }).sort();
    var here = names.filter(function (n) { return E.available(n, plat); });
    var missing = names.filter(function (n) { return !E.available(n, plat); });
    var search = h('input.input.input-sm', { placeholder: 'Search ' + here.length + ' functions…' });
    var list = h('div.cs-fns');
    function draw() {
      var q = search.value.trim().toUpperCase(), cats = {};
      here.forEach(function (n) {
        var i = E.fnInfo(n, plat);
        if (q && n.indexOf(q) < 0 && i.desc.toUpperCase().indexOf(q) < 0) return;
        (cats[i.cat] = cats[i.cat] || []).push(i);
      });
      list.innerHTML = '';
      Object.keys(cats).sort().forEach(function (cat) {
        list.appendChild(h('div.cs-cat', { text: cat }));
        cats[cat].forEach(function (i) {
          list.appendChild(h('div.cs-fn', { title: 'Click to insert', onclick: function () { self.insertFn(i.name); } }, [h('code', { text: i.sig }), h('div.small', { text: i.desc })]));
        });
      });
    }
    search.addEventListener('input', draw); draw();
    var miss = missing.length ? h('div.cs-section', null, [
      h('h4', { text: 'Not available in ' + this.P.name + ' (' + missing.length + ')' }),
      h('p.small', { text: 'Typing these here gives #NAME?. Open “Will it work elsewhere?” on a cell to get a rewrite.' }),
      h('div.chips', null, missing.map(function (n) { return h('span.chip.chip-off', { text: n, title: E.fnInfo(n, SX.Workbook.PLAT[E.FN[n].on ? E.FN[n].on[0] : 'xl365']).desc }); }))
    ]) : null;
    var errs = h('div.cs-section', null, [h('h4', { text: 'Error codes' }), h('table.cs-errs', null, UI.ERROR_CODES.filter(function (c) {
      if (pid === 'xl2013') return c !== '#SPILL!' && c !== '#CALC!' && c !== '#ERROR!';
      if (pid === 'xl365') return c !== '#ERROR!';
      return c !== '#SPILL!' && c !== '#CALC!';
    }).map(function (c) { return h('tr', null, [h('td', null, h('code', { text: c })), h('td', { text: F.ERR_TEXT[c] })]); }))]);
    return h('div.cheat', null, [this.opts.cheatExtra ? this.opts.cheatExtra() : null, UI.diffList(pid), UI.keyTable(pid), h('div.cs-section', null, [h('h4', { text: 'Functions in ' + this.P.name }), search, list]), miss, errs]);
  };

  // "Will it work elsewhere?" — run the active cell's formula on every platform
  SheetView.prototype.elsewhereTab = function () {
    this.elsewhereBox = h('div.elsewhere');
    this.lastElsewhere = null;
    this.refreshElsewhere(true);
    return this.elsewhereBox;
  };
  SheetView.prototype.refreshElsewhere = function (force) {
    var box = this.elsewhereBox; if (!box || !box.isConnected && !force) return;
    if (this.editing) return;
    var cell = this.wb.getCell(this.sheet, this.r, this.c);
    var key = this.sheet + '|' + this.r + ',' + this.c + '|' + (cell ? cell.input : '') + '|' + this.wb.version;
    if (!force && key === this.lastElsewhere) return;
    this.lastElsewhere = key;
    box.innerHTML = '';
    var self = this;
    box.appendChild(h('p.small', { html: 'Runs the formula in <b>' + F.addr(this.r, this.c) + '</b> on all three spreadsheet apps using the same data — so you know if it will work at home.' }));
    if (!cell || !cell.isFormula) {
      box.appendChild(h('div.empty-note', null, [h('div.big-emoji', { text: '🌐' }), h('p', { text: 'Select a cell that has a formula.' }),
        h('p.small', { html: 'Try: <code>=XLOOKUP("SKU-101", Products!A2:A25, Products!B2:B25)</code>' })]));
      return;
    }
    var cmp = SX.platforms.compare(this.wb, this.sheet, this.r, this.c);
    box.appendChild(h('div.ew-formula', null, h('code', { text: this.wb.formulaText(this.sheet, this.r, this.c) })));
    UI.state.stats.compatSeen = UI.state.stats.compatSeen || {};
    if (!UI.state.stats.compatSeen[cell.input]) {
      UI.state.stats.compatSeen[cell.input] = 1;
      UI.state.stats.compat = (UI.state.stats.compat || 0) + 1;
      if (UI.state.stats.compat >= 3) UI.badge('translator');
      UI.save();
    }
    cmp.results.forEach(function (res) {
      box.appendChild(UI.resultCard(res, res.plat === self.plat, function (text, cse) { self.applyRewrite(text, cse); }, cell.ast, self.plat));
    });
  };
  SheetView.prototype.applyRewrite = function (text, cse) {
    var prep = this.wb.prepare(text, { cse: cse });
    if (prep.dialog) { this.excelDialog(prep); return; }
    this.wb.applyEdits([{ sheet: this.sheet, r: this.r, c: this.c, cell: prep.cell }]);
    this.afterCommit(this.sheet, this.r, this.c, prep.cell, {});
    this.lastElsewhere = null;
    this.afterChange();
    UI.toast('Formula rewritten', 'Check the cell — and the results above.');
  };

  // Shared renderer for one platform's result (used by the sheet panel and the Compare page)
  UI.resultCard = function (res, isCurrent, apply, ast, curPlat) {
    var icon = res.status === 'good' ? '✓' : res.status === 'warn' ? '≠' : '✗';
    var card = h('div.ew-card.ew-' + res.status + '.ewp-' + res.plat, null, [
      h('div.ew-head', null, [UI.platIcon(PL[res.plat]), h('b', { text: res.name }), isCurrent ? h('span.ew-here', { text: 'you are here' }) : null, h('span.ew-icon', { text: icon, title: res.status === 'good' ? 'Same result' : res.status === 'warn' ? 'Different result' : 'Error' })])
    ]);
    if (res.refused) {
      card.appendChild(h('div.ew-val.bad', { text: '🚫 Excel will not even accept this formula.' }));
      card.appendChild(h('div.small', { text: res.refused }));
    } else {
      var d = res.display;
      var valText = d.text === '' ? '(blank)' : d.text;
      var val = h('div.ew-val' + (d.err ? '.bad' : ''), null, [h('span.small.muted', { text: 'Shows: ' }), h('b', { text: valText })]);
      card.appendChild(val);
      if (res.spill) {
        var rows = res.spill.rows, show = rows.slice(0, 5).map(function (r) { return r.map(function (v) { return v === null ? '' : SX.f.isErr(v) ? v.code : SX.engine.displayValue(v); }).join(' | '); });
        card.appendChild(h('div.ew-spill', null, [h('div.small.muted', { text: 'Spills ' + rows.length + ' row' + (rows.length === 1 ? '' : 's') + ' × ' + rows[0].length + ' col:' }), h('pre', { text: show.join('\n') + (rows.length > 5 ? '\n…' : '') })]));
      }
      if (d.err && d.err.msg) card.appendChild(h('div.small.ew-msg', { text: d.err.msg }));
    }
    if (res.arrayVersion) {
      card.appendChild(h('div.ew-tip', null, [h('b', { text: '💡 ' + res.arrayVersion.how + ': ' }), 'it would show ', h('b', { text: res.arrayVersion.display.text }),
        h('div', null, h('code', { text: res.arrayVersion.text }))]));
    }
    var tr = res.translation;
    if (tr && !isCurrent) {
      var box = h('div.ew-tr');
      if (tr.changed && !tr.impossible.length) {
        box.appendChild(h('div.small', { html: '<b>How to write it in ' + res.name + ':</b>' }));
        box.appendChild(h('div.ew-code', null, [h('code', { text: tr.cse ? '{' + tr.text + '}' : tr.text }), h('button.btn.btn-xs', { text: 'Copy', onclick: function () { UI.copyText(tr.text); UI.toast('Copied', tr.text); } })]));
      }
      tr.notes.forEach(function (n) { box.appendChild(h('div.ew-note', { text: '• ' + n })); });
      tr.impossible.forEach(function (n) { box.appendChild(h('div.ew-note.warn', { text: '⚠ ' + n })); });
      card.appendChild(box);
    }
    // Offer a fix on the current platform when it fails here but the idea works elsewhere
    if (isCurrent && apply && ast && res.status === 'bad' && !res.refused) {
      var src = /QUERY|ARRAYFORMULA|SPLIT|REGEX|JOIN|COUNTUNIQUE/.test(SX.f.print(ast)) ? 'gs' : 'xl365';
      var fix = SX.platforms.translate(ast, src, curPlat);
      if (fix.changed && !fix.impossible.length) {
        card.appendChild(h('div.ew-tr.fix', null, [h('div.small', { html: '<b>Fix it for ' + res.name + ':</b>' }),
          h('div.ew-code', null, [h('code', { text: fix.cse ? '{' + fix.text + '}' : fix.text }), h('button.btn.btn-xs.btn-primary', { text: 'Use this', onclick: function () { apply(fix.text, fix.cse); } })]),
          fix.notes.length ? h('div.ew-note', { text: '• ' + fix.notes.join(' • ') }) : null]));
      } else if (fix.impossible.length) fix.impossible.forEach(function (n) { card.appendChild(h('div.ew-note.warn', { text: '⚠ ' + n })); });
    }
    if (isCurrent && apply && res.arrayVersion) {
      card.appendChild(h('button.btn.btn-xs', { text: curPlat === 'gs' ? 'Wrap in ARRAYFORMULA' : 'Make it a Ctrl+Shift+Enter formula', onclick: function () {
        var t = res.arrayVersion.text.replace(/^\{(.*)\}$/, '$1'); apply(t, curPlat !== 'gs');
      } }));
    }
    return card;
  };
})(globalThis.SX = globalThis.SX || {});
