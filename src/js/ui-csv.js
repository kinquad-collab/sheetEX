/* SheetEX — CSV / TSV workspace: a plain-text editor with a live "how a spreadsheet sees it" preview. */
(function (SX) {
  'use strict';
  var UI = SX.ui, h = UI.h, PL = SX.platforms.PLATFORMS;

  function CsvView(host) {
    this.files = UI.csvFiles();
    this.name = UI.state.ui.csvFile && this.files[UI.state.ui.csvFile] !== undefined ? UI.state.ui.csvFile : 'products.csv';
    this.mode = 'raw';
    this.invisible = false;
    this.host = host;
    this.build();
    this.load(this.name);
  }
  UI.CsvView = CsvView;
  CsvView.prototype.destroy = function () { this.saveNow(); };

  CsvView.prototype.build = function () {
    var self = this;
    var root = this.root = h('div.ws.csv-ws.theme-csv');
    root.appendChild(h('div.app-title', null, [
      h('button.back-btn', { onclick: function () { UI.go('home'); } }, '← Home'),
      UI.platIcon(PL.csv), this.titleEl = h('span.doc-title'), h('span.app-ver', { text: 'Plain-text editor' })
    ]));
    function tb(label, title, fn, cls) { return h('button.tb-btn' + (cls ? '.' + cls : ''), { title: title, onclick: fn }, label); }
    this.invBtn = tb('¶ Show invisibles', 'Show tabs (→), spaces (·) and line ends (¶)', function () { self.invisible = !self.invisible; self.invBtn.classList.toggle('on', self.invisible); self.update(); });
    this.delimSel = h('select.tb-select', { title: 'Delimiter', onchange: function () { self.update(); } },
      [['auto', 'Delimiter: auto'], [',', 'Comma ,'], ['\t', 'Tab →'], [';', 'Semicolon ;']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    this.modeSel = h('select.tb-select', { title: 'Preview mode', onchange: function () { self.mode = self.modeSel.value; self.update(); } },
      [['raw', 'Preview: exact values'], ['sheet', 'Preview: open like a spreadsheet would']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    this.panelBtns = {};
    root.appendChild(h('div.toolbar', null, [
      h('div.tb-group', null, [tb('＋ New file', 'Create a new file', function () { self.newFile(); }), tb('⇪ Export from spreadsheet', 'Save a sheet from one of the spreadsheet apps as CSV/TSV', function () { self.exportDialog(); })]),
      h('div.tb-group', null, [tb('🔍 Find & replace', 'Find & replace (Ctrl+F)', function () { self.toggleFind(); })]),
      h('div.tb-group', null, [this.invBtn]),
      h('div.tb-group', null, [this.delimSel, this.modeSel]),
      h('div.tb-spacer'),
      h('div.tb-group.tb-panels', null, [
        this.panelBtns.challenges = tb('🏆 Challenges', 'Challenges', function () { self.togglePanel('challenges'); }, 'tb-panel'),
        this.panelBtns.cheat = tb('📘 Cheat sheet', 'Cheat sheet', function () { self.togglePanel('cheat'); }, 'tb-panel')
      ]),
      tb('⟲', 'Reset all files to the originals', function () { self.resetFiles(); }, 'tb-reset')
    ]));

    this.fileList = h('div.file-list');
    this.gutter = h('div.gutter');
    this.ta = h('textarea.csv-editor', { spellcheck: 'false', wrap: 'off', 'aria-label': 'File contents' });
    this.ta.addEventListener('input', function () { self.dirty(); });
    this.ta.addEventListener('scroll', function () { self.gutter.scrollTop = self.ta.scrollTop; if (self.xray) self.xray.scrollTop = self.ta.scrollTop; });
    this.ta.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') { e.preventDefault(); self.insertAtCaret('\t'); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); self.toggleFind(true); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); self.saveNow(); UI.toast('Saved', self.name); }
    });
    this.findBar = this.buildFind();
    this.xray = h('pre.xray');
    var editorBox = h('div.editor-box', null, [this.gutter, this.ta, this.xray]);
    this.problems = h('div.csv-problems');
    this.preview = h('div.csv-preview');
    this.previewHead = h('div.pv-head');
    var main = h('div.csv-main', null, [
      h('div.csv-left', null, [h('div.fl-title', { text: 'Files' }), this.fileList]),
      h('div.csv-center', null, [this.findBar, editorBox, this.problems, h('div.pv-wrap', null, [this.previewHead, this.preview])])
    ]);
    this.panelHost = h('div.panel-host');
    root.appendChild(h('div.ws-body', null, [main, this.panelHost]));
    this.host.appendChild(root);
    var open = UI.state.ui.panel_csv;
    this.togglePanel(open === undefined ? 'challenges' : open, true);
  };

  CsvView.prototype.buildFind = function () {
    var self = this;
    this.findIn = h('input.input.input-sm', { placeholder: 'Find (\\t = tab)' });
    this.replIn = h('input.input.input-sm', { placeholder: 'Replace with (\\t = tab)' });
    function unesc(s) { return s.replace(/\\t/g, '\t').replace(/\\n/g, '\n'); }
    var info = h('span.small');
    return h('div.find-bar', null, [this.findIn, this.replIn,
      h('button.btn.btn-sm', { text: 'Replace all', onclick: function () {
        var f = unesc(self.findIn.value); if (!f) return;
        var n = self.ta.value.split(f).length - 1;
        self.ta.value = self.ta.value.split(f).join(unesc(self.replIn.value));
        info.textContent = n + ' replaced'; self.dirty();
      } }),
      h('button.btn.btn-sm', { text: 'Find next', onclick: function () {
        var f = unesc(self.findIn.value); if (!f) return;
        var from = self.ta.selectionEnd, i = self.ta.value.indexOf(f, from); if (i < 0) i = self.ta.value.indexOf(f);
        if (i >= 0) { self.ta.focus(); self.ta.setSelectionRange(i, i + f.length); info.textContent = ''; } else info.textContent = 'Not found';
      } }), info,
      h('button.btn.btn-sm', { text: '×', title: 'Close', onclick: function () { self.toggleFind(false); } })]);
  };
  CsvView.prototype.toggleFind = function (on) {
    var show = on === undefined ? !this.findBar.classList.contains('show') : on;
    this.findBar.classList.toggle('show', show);
    if (show) this.findIn.focus();
  };
  CsvView.prototype.insertAtCaret = function (t) {
    var ta = this.ta, s = ta.selectionStart;
    ta.value = ta.value.slice(0, s) + t + ta.value.slice(ta.selectionEnd);
    ta.setSelectionRange(s + t.length, s + t.length);
    this.dirty();
  };

  CsvView.prototype.renderFiles = function () {
    var self = this;
    this.fileList.innerHTML = '';
    Object.keys(this.files).sort().forEach(function (n) {
      var ext = /\.tsv$/i.test(n) ? 'TSV' : /\.csv$/i.test(n) ? 'CSV' : 'TXT';
      self.fileList.appendChild(h('div.file-item' + (n === self.name ? '.on' : ''), null, [
        h('button.file-open', { onclick: function () { self.saveNow(); self.load(n); } }, [h('span.file-ext.fe-' + ext.toLowerCase(), { text: ext }), h('span', { text: n })]),
        h('button.file-del', { title: 'Delete ' + n, 'aria-label': 'Delete ' + n, text: '×', onclick: function () {
          UI.confirm('Delete ' + n + '?', 'The file will be removed. (Reset files brings back the originals.)', 'Delete', function () {
            delete self.files[n]; UI.save();
            self.load(Object.keys(self.files)[0] || null);
          });
        } })
      ]));
    });
  };
  CsvView.prototype.load = function (name) {
    if (!name) { this.files['untitled.csv'] = ''; name = 'untitled.csv'; }
    this.name = name; UI.state.ui.csvFile = name;
    this.ta.value = this.files[name] || '';
    this.titleEl.textContent = name + ' — Plain text';
    this.delimSel.value = 'auto';
    this.renderFiles();
    this.update();
  };
  CsvView.prototype.dirty = function () {
    var self = this;
    this.files[this.name] = this.ta.value;
    clearTimeout(this.t);
    this.t = setTimeout(function () { self.update(); UI.save(); }, 120);
  };
  CsvView.prototype.saveNow = function () { if (this.name) this.files[this.name] = this.ta.value; UI.save(); };

  CsvView.prototype.delim = function () {
    var d = this.delimSel.value;
    if (d !== 'auto') return d;
    if (/\.tsv$/i.test(this.name)) return '\t';
    return SX.csv.detectDelimiter(this.ta.value);
  };

  CsvView.prototype.update = function () {
    var text = this.ta.value, delim = this.delim(), self = this;
    // gutter
    var lines = text.split('\n').length;
    var g = ''; for (var i = 1; i <= lines; i++) g += i + '\n';
    this.gutter.textContent = g;
    // invisible characters x-ray
    this.xray.style.display = this.invisible ? 'block' : 'none';
    this.ta.classList.toggle('see-through', this.invisible);
    if (this.invisible) {
      this.xray.innerHTML = UI.esc(text).replace(/\t/g, '<span class="inv tab">→\t</span>').replace(/ /g, '<span class="inv">·</span>').replace(/\n/g, '<span class="inv">¶</span>\n');
      this.xray.scrollTop = this.ta.scrollTop;
    }
    // parse
    var p = SX.csv.parse(text, delim);
    this.problems.innerHTML = '';
    if (p.problems.length) {
      this.problems.appendChild(h('div.pb-title', { text: '⚠ ' + p.problems.length + ' problem' + (p.problems.length === 1 ? '' : 's') + ' found' }));
      p.problems.slice(0, 6).forEach(function (pb) {
        self.problems.appendChild(h('button.pb-item', { onclick: function () { self.gotoLine(pb.line); } }, [h('b', { text: 'Line ' + pb.line + ': ' }), pb.msg]));
      });
    }
    var dname = delim === '\t' ? 'TAB' : delim === ',' ? 'comma' : 'semicolon';
    this.previewHead.innerHTML = '';
    this.previewHead.appendChild(h('span', { html: '<b>Spreadsheet preview</b> · split on <b>' + dname + '</b> · ' + p.rows.length + ' rows' }));
    if (this.mode === 'sheet') this.previewHead.appendChild(h('span.pv-legend', { html: '<span class="conv-chip">orange</span> = the spreadsheet changed what was in the file' }));
    // table
    var table = h('table.pv-table');
    var maxC = p.rows.reduce(function (m, r) { return Math.max(m, r.cells.length); }, 0);
    var head = h('tr', null, [h('th', { text: '' })]);
    for (var c = 0; c < maxC; c++) head.appendChild(h('th', { text: SX.f.idxToCol(c) }));
    table.appendChild(head);
    p.rows.slice(0, 200).forEach(function (r, ri) {
      var tr = h('tr' + (r.bad ? '.bad' : ''), null, [h('th', { text: ri + 1, title: 'File line ' + r.line })]);
      for (var c2 = 0; c2 < maxC; c2++) {
        var cell = r.cells[c2];
        if (!cell) { tr.appendChild(h('td.missing')); continue; }
        if (self.mode === 'sheet' && ri > 0) {
          var conv = SX.csv.autoConvert(cell.v);
          tr.appendChild(h('td' + (conv.changed ? '.conv' : '') + (conv.num ? '.num' : ''), { text: conv.v, title: conv.changed ? 'In the file: ' + cell.v + '\n' + conv.why : cell.v }));
        } else {
          tr.appendChild(h('td' + (cell.q ? '.quoted' : ''), { text: cell.v, title: cell.q ? 'This value was wrapped in quotes in the file' : '' }));
        }
      }
      table.appendChild(tr);
    });
    this.preview.innerHTML = '';
    this.preview.appendChild(table);
  };
  CsvView.prototype.gotoLine = function (n) {
    var lines = this.ta.value.split('\n'), pos = 0;
    for (var i = 0; i < n - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    this.ta.focus();
    this.ta.setSelectionRange(pos, pos + (lines[n - 1] || '').length);
    this.ta.scrollTop = Math.max(0, (n - 4) * 18);
  };

  CsvView.prototype.newFile = function () {
    var self = this, inp = h('input.input', { value: 'new_file.csv' });
    UI.modal('New file', [h('label.lbl', { text: 'File name (end with .csv or .tsv)' }), inp], [
      { text: 'Cancel' },
      { text: 'Create', primary: true, onclick: function () {
        var n = inp.value.trim().replace(/[\\/]/g, '');
        if (!n) return false;
        if (self.files[n] !== undefined) { UI.toast('That name is taken', n + ' already exists — pick another name.'); return false; }
        self.saveNow(); self.files[n] = ''; UI.save(); self.load(n); self.ta.focus();
      } }
    ]);
  };
  CsvView.prototype.resetFiles = function () {
    var self = this;
    UI.modal('Reset all files?', [h('p', { text: 'All files go back to the originals. New files you made are deleted.' })], [
      { text: 'Cancel' }, { text: 'Reset files', danger: true, onclick: function () { self.files = UI.resetFiles(); self.load('products.csv'); } }]);
  };

  CsvView.prototype.exportDialog = function () {
    var self = this;
    var platSel = h('select.input', null, ['xl365', 'xl2013', 'gs'].map(function (p) { return h('option', { value: p, text: PL[p].name }); }));
    var sheetSel = h('select.input');
    function fillSheets() { sheetSel.innerHTML = ''; UI.workbook(platSel.value).sheets.forEach(function (s) { sheetSel.appendChild(h('option', { value: s.name, text: s.name })); }); }
    platSel.addEventListener('change', fillSheets); fillSheets();
    var fmtSel = h('select.input', null, [h('option', { value: ',', text: 'CSV (comma separated)' }), h('option', { value: '\t', text: 'TSV (tab separated)' })]);
    UI.modal('Export from a spreadsheet', [
      h('p.small', { text: 'This is like choosing File ▸ Save As ▸ CSV in Excel, or File ▸ Download ▸ CSV in Google Sheets.' }),
      h('label.lbl', { text: 'App' }), platSel, h('label.lbl', { text: 'Sheet' }), sheetSel, h('label.lbl', { text: 'Format' }), fmtSel
    ], [{ text: 'Cancel' }, { text: 'Export', primary: true, onclick: function () {
      var wb = UI.workbook(platSel.value), d = fmtSel.value;
      var res = SX.csv.exportSheet(wb, sheetSel.value, d);
      var name = 'export_' + sheetSel.value + (d === '\t' ? '.tsv' : '.csv');
      self.saveNow(); self.files[name] = res.text; UI.save(); self.load(name);
      var lost = [];
      lost.push(res.formulas ? res.formulas + ' formula' + (res.formulas === 1 ? ' was' : 's were') + ' replaced by their current values.' : 'No formulas on this sheet — but if there were, they would become plain values.');
      if (res.examples.length) lost.push('For example ' + res.examples.map(function (x) { return x.addr + ' had ' + x.formula + ' → now just "' + x.value + '"'; }).join('; ') + '.');
      lost.push('Number formatting ($, %, decimals) was removed' + (res.fmtCells ? ' from ' + res.fmtCells + ' cells' : '') + '. 4.50 is now 4.5.');
      if (res.spilled) lost.push(res.spilled + ' spilled cells were written as plain values.');
      lost.push('Only ONE sheet fits in a CSV. Not included: ' + res.otherSheets.join(', ') + '.');
      UI.modal('Exported ' + name, [h('p', { text: 'What was lost when saving as ' + (d === '\t' ? 'TSV' : 'CSV') + ':' }), h('ul', null, lost.map(function (l) { return h('li', { text: l }); }))], [{ text: 'OK', primary: true }]);
    } }]);
  };

  CsvView.prototype.togglePanel = function (id, initial) {
    var self = this;
    if (!initial && this.panel && this.panel.current() === id && this.panelHost.classList.contains('open')) {
      this.panelHost.classList.remove('open'); UI.state.ui.panel_csv = null; this.mark(null); return;
    }
    if (!id) { this.mark(null); return; }
    if (!this.panel) {
      this.panel = UI.sidePanel([
        { id: 'challenges', label: '🏆 Challenges', render: function () {
          return UI.challengePanel('csv', function () { self.saveNow(); return { file: function (n) { return self.files[n]; } }; });
        } },
        { id: 'cheat', label: '📘 Cheat sheet', render: function () { return self.cheat(); } }
      ], id);
      this.panel.el.querySelector('.sp-tabs').addEventListener('click', function () { self.mark(self.panel.current()); UI.state.ui.panel_csv = self.panel.current(); });
      this.panel.el.appendChild(h('button.sp-close', { title: 'Close panel', text: '×', onclick: function () { self.togglePanel(self.panel.current()); } }));
      this.panelHost.appendChild(this.panel.el);
    } else this.panel.show(id);
    this.panelHost.classList.add('open'); UI.state.ui.panel_csv = id; this.mark(id);
  };
  CsvView.prototype.mark = function (id) { for (var k in this.panelBtns) this.panelBtns[k].classList.toggle('on', k === id); };
  CsvView.prototype.cheat = function () {
    return h('div.cheat', null, [UI.diffList('csv'),
      h('div.cs-section', null, [h('h4', { text: 'The rules of CSV' }), h('table.cs-keys', null, [
        ['Gel Pens, 4-pack', '"Gel Pens, 4-pack"', 'Has a comma → wrap in quotes'],
        ['12" Ruler', '"12"" Ruler"', 'Has a quote → wrap in quotes and double it'],
        ['Line 1⏎Line 2', '"Line 1⏎Line 2"', 'Has a line break → wrap in quotes'],
        ['05401', '05401', 'Stored fine — but a spreadsheet will drop the 0 when it opens it']
      ].map(function (r) { return h('tr', null, [h('td', null, h('code', { text: r[0] })), h('td', null, h('code', { text: r[1] })), h('td.small', { text: r[2] })]); }))]),
      h('div.cs-section', null, [h('h4', { text: 'CSV vs TSV vs XLSX' }), h('table.cs-keys', null, [
        ['', 'CSV', 'TSV', 'XLSX / Sheets'], ['Separator', 'comma', 'tab', '—'], ['Formulas', '✗', '✗', '✓'], ['Formatting', '✗', '✗', '✓'],
        ['Many sheets', '✗', '✗', '✓'], ['Opens anywhere', '✓', '✓', 'mostly'], ['Human-readable', '✓', '✓', '✗']
      ].map(function (r, i) { return h('tr', null, r.map(function (x) { return h(i ? 'td' : 'th', { text: x }); })); }))]),
      UI.keyTable('csv')]);
  };
})(globalThis.SX = globalThis.SX || {});
