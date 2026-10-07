/* SheetEX — SQL workspace and the Compare page. */
(function (SX) {
  'use strict';
  var UI = SX.ui, h = UI.h, PL = SX.platforms.PLATFORMS, E = SX.engine;

  var EXAMPLES = [
    ['All products', 'SELECT * FROM products;'],
    ['Filter rows (WHERE)', "SELECT product, price\nFROM products\nWHERE category = 'Snacks';"],
    ['Sort (ORDER BY)', 'SELECT product, price\nFROM products\nORDER BY price DESC;'],
    ['Count per category (GROUP BY)', 'SELECT category, COUNT(*) AS products\nFROM products\nGROUP BY category;'],
    ['Look up names (JOIN)', 'SELECT s.order_id, s.order_date, p.product, s.qty\nFROM sales s\nJOIN products p ON s.sku = p.sku;'],
    ['Low stock (CASE)', "SELECT product, in_stock, reorder_at,\n  CASE WHEN in_stock < reorder_at THEN 'Reorder' ELSE 'OK' END AS status\nFROM products;"],
    ['Sales by month', "SELECT strftime('%m', order_date) AS month, SUM(qty) AS units\nFROM sales\nGROUP BY month;"]
  ];

  function SqlView(host) {
    this.db = UI.database();
    this.host = host;
    this.last = null;
    this.history = UI.state.ui.sqlHistory || [];
    this.build();
  }
  UI.SqlView = SqlView;
  SqlView.prototype.destroy = function () { UI.state.ui.sqlText = this.ta.value; UI.save(); };

  SqlView.prototype.build = function () {
    var self = this;
    var root = this.root = h('div.ws.sql-ws.theme-sql');
    root.appendChild(h('div.app-title', null, [
      h('button.back-btn', { onclick: function () { UI.go('home'); } }, '← Home'),
      UI.platIcon(PL.sql), h('span.doc-title', { text: 'peachtree.db — SQL console' }), h('span.app-ver', { text: 'SQLite-style database' })
    ]));
    function tb(label, title, fn, cls) { return h('button.tb-btn' + (cls ? '.' + cls : ''), { title: title, onclick: fn }, label); }
    var ex = h('select.tb-select', { title: 'Examples', onchange: function () { if (ex.value !== '') { self.ta.value = EXAMPLES[+ex.value][1]; ex.value = ''; self.ta.focus(); } } },
      [h('option', { value: '', text: 'Examples…' })].concat(EXAMPLES.map(function (e, i) { return h('option', { value: i, text: e[0] }); })));
    this.panelBtns = {};
    root.appendChild(h('div.toolbar', null, [
      h('div.tb-group', null, [tb('▶ Run', 'Run (Ctrl+Enter)', function () { self.run(); }, 'tb-run'), ex]),
      h('div.tb-spacer'),
      h('div.tb-group.tb-panels', null, [
        this.panelBtns.challenges = tb('🏆 Challenges', 'Challenges', function () { self.togglePanel('challenges'); }, 'tb-panel'),
        this.panelBtns.cheat = tb('📘 Cheat sheet', 'Cheat sheet', function () { self.togglePanel('cheat'); }, 'tb-panel')
      ]),
      tb('⟲', 'Reset the database to the original data', function () { self.resetDb(); }, 'tb-reset')
    ]));
    this.schema = h('div.schema');
    this.ta = h('textarea.sql-editor', { spellcheck: 'false', 'aria-label': 'SQL query' });
    this.ta.value = UI.state.ui.sqlText || '-- Write SQL here, then press Ctrl+Enter (or ▶ Run)\nSELECT * FROM products;';
    this.ta.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); self.run(); }
      else if (e.key === 'Tab') { e.preventDefault(); var s = self.ta.selectionStart; self.ta.value = self.ta.value.slice(0, s) + '  ' + self.ta.value.slice(self.ta.selectionEnd); self.ta.setSelectionRange(s + 2, s + 2); }
      else if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); self.toggleComment(); }
    });
    this.out = h('div.sql-out', null, h('div.empty-note', null, [h('div.big-emoji', { text: '🗄️' }), h('p', { text: 'Results show up here. Press Ctrl+Enter to run.' })]));
    this.hist = h('div.sql-hist');
    var main = h('div.sql-main', null, [
      h('div.sql-left', null, [h('div.fl-title', { text: 'Tables' }), this.schema, h('div.fl-title', { text: 'History' }), this.hist]),
      h('div.sql-center', null, [h('div.sql-editor-wrap', null, [this.ta, h('button.btn.btn-primary.run-fab', { text: '▶ Run', onclick: function () { self.run(); } })]), this.out])
    ]);
    this.panelHost = h('div.panel-host');
    root.appendChild(h('div.ws-body', null, [main, this.panelHost]));
    this.host.appendChild(root);
    this.renderSchema(); this.renderHistory();
    var open = UI.state.ui.panel_sql;
    this.togglePanel(open === undefined ? 'challenges' : open, true);
  };
  SqlView.prototype.toggleComment = function () {
    var ta = this.ta, v = ta.value, s = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    if (v.substr(s, 3) === '-- ') ta.value = v.slice(0, s) + v.slice(s + 3); else ta.value = v.slice(0, s) + '-- ' + v.slice(s);
  };
  SqlView.prototype.renderSchema = function () {
    var self = this;
    this.schema.innerHTML = '';
    Object.keys(this.db.tables).forEach(function (k) {
      var t = self.db.tables[k];
      self.schema.appendChild(h('details.tbl', { open: true }, [
        h('summary', null, [h('span.tbl-name', { text: t.name, title: 'Click to insert', onclick: function (e) { e.preventDefault(); self.insert(t.name); } }), t.strict ? h('span.tbl-strict', { text: 'STRICT', title: 'Typed table: wrong types are refused' }) : null, h('span.tbl-n', { text: t.rows.length + ' rows' })]),
        h('div.tbl-cols', null, t.cols.map(function (c) {
          var tip = 'Insert ' + c.name + (c.pk ? ' · PRIMARY KEY (unique for every row)' : '') + (c.ref ? ' · FOREIGN KEY → ' + c.ref.table + '.' + (c.ref.refCol || '') : '') + (c.notNull ? ' · NOT NULL (required)' : '');
          return h('button.col-item', { title: tip, onclick: function () { self.insert(c.name); } }, [
            h('span', null, [c.pk ? h('span.key-pk', { text: '🔑 ' }) : null, c.name, c.ref ? h('span.key-fk', { text: ' → ' + c.ref.table }) : null]),
            h('span.col-type', { text: c.type + (c.notNull && !c.pk ? ' NN' : '') })]);
        }))
      ]));
    });
  };
  SqlView.prototype.insert = function (t) {
    var ta = this.ta, s = ta.selectionStart;
    ta.value = ta.value.slice(0, s) + t + ta.value.slice(ta.selectionEnd);
    ta.focus(); ta.setSelectionRange(s + t.length, s + t.length);
  };
  SqlView.prototype.renderHistory = function () {
    var self = this;
    this.hist.innerHTML = '';
    if (!this.history.length) this.hist.appendChild(h('div.small.muted', { text: 'Queries you run appear here.' }));
    this.history.slice(0, 12).forEach(function (q) {
      self.hist.appendChild(h('button.hist-item', { title: q, onclick: function () { self.ta.value = q; self.ta.focus(); } }, q.replace(/\s+/g, ' ').slice(0, 60)));
    });
  };
  SqlView.prototype.run = function () {
    var self = this, src = this.ta.value;
    var sel = this.ta.value.slice(this.ta.selectionStart, this.ta.selectionEnd);
    if (sel.trim()) src = sel;
    this.out.innerHTML = '';
    var t0 = performance.now();
    try {
      var results = SX.sql.execute(this.db, src);
      var ms = Math.max(1, Math.round(performance.now() - t0));
      results.forEach(function (r, i) {
        if (r.type === 'msg') {
          self.out.appendChild(h('div.sql-msg' + (r.noWhere ? '.warn' : ''), { text: '✓ ' + r.message }));
          if (r.noWhere && /^(update|delete)/i.test(r.statement.text)) UI.badge('oops');
          if (r.rolledBack) UI.badge('rollback');
        } else if (i === results.length - 1 || results.length < 4) self.out.appendChild(self.table(r, ms));
      });
      var last = results[results.length - 1];
      this.last = last;
      UI.state.stats.queries = (UI.state.stats.queries || 0) + 1;
      UI.badge('sql-first');
      this.history = [src.trim()].concat(this.history.filter(function (q) { return q !== src.trim(); })).slice(0, 20);
      UI.state.ui.sqlHistory = this.history;
      this.renderHistory(); this.renderSchema();
      UI.save();
    } catch (e) {
      if (!(e instanceof SX.sql.SqlError)) throw e;
      this.last = { error: e.message };
      this.out.appendChild(h('div.sql-err', null, [h('div.sql-err-msg', { text: 'Error: ' + e.message }), e.hint ? h('div.sql-hint', { text: '💡 ' + e.hint }) : null]));
    }
  };
  SqlView.prototype.table = function (r, ms) {
    var wrap = h('div.sql-result');
    wrap.appendChild(h('div.small.muted', { text: r.rows.length + ' row' + (r.rows.length === 1 ? '' : 's') + ' · ' + ms + ' ms' }));
    var t = h('table.res-table');
    t.appendChild(h('tr', null, r.columns.map(function (c) { return h('th', { text: c }); })));
    r.rows.slice(0, 500).forEach(function (row) {
      t.appendChild(h('tr', null, row.map(function (v) {
        if (v === null) return h('td.null', { text: 'NULL' });
        if (typeof v === 'number') return h('td.num', { text: Number.isInteger(v) ? String(v) : String(+v.toPrecision(12)) });
        return h('td', { text: String(v) });
      })));
    });
    wrap.appendChild(h('div.res-scroll', null, t));
    return wrap;
  };
  SqlView.prototype.resetDb = function () {
    var self = this;
    UI.modal('Reset the database?', [h('p', { text: 'All tables go back to the original data. Changes from UPDATE, INSERT and DELETE are erased.' })], [
      { text: 'Cancel' }, { text: 'Reset database', danger: true, onclick: function () { self.db = UI.resetDatabase(); self.renderSchema(); UI.toast('Database reset', 'Original data restored.'); } }]);
  };
  SqlView.prototype.togglePanel = function (id, initial) {
    var self = this;
    if (!initial && this.panel && this.panel.current() === id && this.panelHost.classList.contains('open')) {
      this.panelHost.classList.remove('open'); UI.state.ui.panel_sql = null; this.mark(null); return;
    }
    if (!id) { this.mark(null); return; }
    if (!this.panel) {
      this.panel = UI.sidePanel([
        { id: 'challenges', label: '🏆 Challenges', render: function () { return UI.challengePanel('sql', function () { return { db: self.db, last: self.last }; }); } },
        { id: 'cheat', label: '📘 Cheat sheet', render: function () { return self.cheat(); } }
      ], id);
      this.panel.el.querySelector('.sp-tabs').addEventListener('click', function () { self.mark(self.panel.current()); UI.state.ui.panel_sql = self.panel.current(); });
      this.panel.el.appendChild(h('button.sp-close', { title: 'Close panel', text: '×', onclick: function () { self.togglePanel(self.panel.current()); } }));
      this.panelHost.appendChild(this.panel.el);
    } else this.panel.show(id);
    this.panelHost.classList.add('open'); UI.state.ui.panel_sql = id; this.mark(id);
  };
  SqlView.prototype.mark = function (id) { for (var k in this.panelBtns) this.panelBtns[k].classList.toggle('on', k === id); };
  SqlView.prototype.cheat = function () {
    var self = this;
    return h('div.cheat', null, [UI.diffList('sql'),
      h('div.cs-section', null, [h('h4', { text: 'The order of a SELECT' }), h('pre.cs-pre', { text: 'SELECT   columns (or * for all)\nFROM     table\nJOIN     other_table ON a.key = b.key\nWHERE    row filter\nGROUP BY column\nHAVING   group filter\nORDER BY column DESC\nLIMIT    10;' })]),
      h('div.cs-section', null, [h('h4', { text: 'Spreadsheet → SQL' }), h('table.cs-keys.twins', null, SX.platforms.SQL_TWINS.map(function (t) {
        return h('tr', null, [h('td', null, h('code', { text: t[0] })), h('td', null, h('code.click', { text: t[1], title: 'Click to copy into the editor', onclick: function () { self.ta.value = t[1]; self.ta.focus(); } }))]);
      }))]),
      h('div.cs-section', null, [h('h4', { text: 'Useful functions' }), h('table.cs-keys', null, [
        ['COUNT(*), SUM(x), AVG(x), MIN(x), MAX(x)', 'Aggregates (use with GROUP BY)'], ['ROUND(x, 2)', 'Round to 2 decimals'], ['UPPER(t), LOWER(t), LENGTH(t)', 'Text'],
        ["SUBSTR(t, start, len)", 'Part of text'], ["a || ' ' || b", 'Join text'], ["strftime('%m', order_date)", 'Month from a date'],
        ["x LIKE '%drink%'", 'Contains (not case-sensitive)'], ["x IN ('S01', 'S02')", 'One of a list'], ['x BETWEEN 1 AND 5', 'In a range'],
        ['CASE WHEN ... THEN ... ELSE ... END', 'IF for SQL'], ['COALESCE(x, 0)', 'Replace NULL']
      ].map(function (r) { return h('tr', null, [h('td', null, h('code', { text: r[0] })), h('td.small', { text: r[1] })]); }))]),
      UI.keyTable('sql')]);
  };

  // ======================= Compare page =======================
  var PRESETS = [
    ['XLOOKUP', '=XLOOKUP("SKU-404", Products!A2:A25, Products!B2:B25)'],
    ['FILTER with "None"', '=FILTER(Products!B2:B25, Products!C2:C25="Apparel", "None")'],
    ['SORT high→low', '=SORT(Products!B2:D25, 3, -1)'],
    ['MAX(IF) array', '=MAX(IF(Products!C2:C25="Snacks", Products!D2:D25))'],
    ['CONCAT 3 values', '=CONCAT(Stores!B2, ", ", Stores!C2)'],
    ['Empty cell', '=Scratch!Z50'],
    ['Open range', '=SUM(Sales!E2:E)'],
    ['IFS', '=IFS(Products!F2<Products!G2, "Reorder", TRUE, "OK")'],
    ['QUERY', '=QUERY(Products!A1:H25, "select C, count(A) group by C")'],
    ['VLOOKUP no FALSE', '=VLOOKUP("Hoodie", Products!B2:D25, 3)']
  ];
  function CompareView(host) {
    this.host = host;
    this.build();
  }
  UI.CompareView = CompareView;
  CompareView.prototype.build = function () {
    var self = this;
    var inp = this.inp = h('input.input.cmp-input', { value: UI.state.ui.cmpFormula || PRESETS[0][1], spellcheck: 'false', 'aria-label': 'Formula to compare' });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') self.runFormula(); });
    this.results = h('div.cmp-results');
    var matrixBox = h('div.matrix-box');
    var onlyDiff = h('input', { type: 'checkbox', checked: true });
    var search = h('input.input.input-sm', { placeholder: 'Search functions…' });
    function drawMatrix() {
      var rows = SX.platforms.functionMatrix(), q = search.value.trim().toUpperCase();
      rows = rows.filter(function (r) {
        if (q && r.name.indexOf(q) < 0) return false;
        if (onlyDiff.checked) return !(r.on.xl365 && r.on.xl2013 && r.on.gs) || r.differs;
        return true;
      });
      var t = h('table.matrix', null, [h('tr', null, [h('th', { text: 'Function' }), h('th', { text: 'Excel 365' }), h('th', { text: 'Excel 2013' }), h('th', { text: 'Google Sheets' }), h('th', { text: 'Note' })])]);
      rows.forEach(function (r) {
        var note = '';
        if (r.differs) note = 'Different arguments! Excel: ' + r.sigs.xl365 + ' · Sheets: ' + r.sigs.gs;
        t.appendChild(h('tr', null, [h('td', null, h('code', { text: r.name }))].concat(['xl365', 'xl2013', 'gs'].map(function (p) { return h('td.' + (r.on[p] ? 'yes' : 'no'), { text: r.on[p] ? '✓' : '✗' }); }), [h('td.small', { text: note })])));
      });
      matrixBox.innerHTML = ''; matrixBox.appendChild(t);
      matrixBox.appendChild(h('p.small.muted', { text: rows.length + ' functions shown. SheetEX supports ' + Object.keys(E.FN).length + ' functions — the real apps have hundreds more.' }));
    }
    onlyDiff.addEventListener('change', drawMatrix); search.addEventListener('input', drawMatrix);
    drawMatrix();

    var root = h('main.compare', null, [
      h('div.cmp-hero', null, [h('button.back-btn.light', { onclick: function () { UI.go('home'); } }, '← Home'),
        h('h1', { text: 'Compare platforms' }),
        h('p', { text: 'Type one formula and run it in Excel 365, Excel 2013 and Google Sheets at the same time, using the same store data. This is how you find out BEFORE you get home whether it will work.' })]),
      h('section.cmp-section', null, [
        h('h2', { text: '1 · Formula playground' }),
        h('div.cmp-row', null, [inp, h('button.btn.btn-primary', { text: 'Run everywhere', onclick: function () { self.runFormula(); } })]),
        h('div.chips', null, PRESETS.map(function (p) { return h('button.chip', { text: p[0], onclick: function () { inp.value = p[1]; self.runFormula(); } }); })),
        this.results
      ]),
      h('section.cmp-section', null, [h('h2', { text: '2 · Which functions exist where?' }),
        h('div.cmp-row', null, [search, h('label.small', null, [onlyDiff, ' Only show differences'])]), matrixBox]),
      h('section.cmp-section', null, [h('h2', { text: '3 · Spreadsheet ideas in SQL' }),
        h('table.cs-keys.twins.wide', null, [h('tr', null, [h('th', { text: 'Spreadsheet' }), h('th', { text: 'SQL' })])].concat(SX.platforms.SQL_TWINS.map(function (t) {
          return h('tr', null, [h('td', null, h('code', { text: t[0] })), h('td', null, h('code', { text: t[1] }))]);
        })))]),
      h('section.cmp-section', null, [h('h2', { text: '4 · Quick quiz' }), UI.challengePanel('compare', function () { return {}; })])
    ]);
    this.host.appendChild(root);
    this.runFormula();
  };
  CompareView.prototype.runFormula = function () {
    var text = this.inp.value.trim();
    if (text && text[0] !== '=') text = '=' + text;
    UI.state.ui.cmpFormula = text; UI.save();
    this.results.innerHTML = '';
    if (!text) return;
    // Evaluate in a fresh copy of the store data, at Scratch!B2
    var wb = SX.makeStoreWorkbook('xl365');
    var gsWb = SX.makeStoreWorkbook('gs');
    var src = wb, prep = wb.prepare(text);
    if (prep.dialog) { src = gsWb; prep = gsWb.prepare(text); }
    if (!prep.cell) return;
    src.applyEdits([{ sheet: 'Scratch', r: 1, c: 1, cell: prep.cell }]);
    var cmp = SX.platforms.compare(src, 'Scratch', 1, 1);
    if (!cmp) return;
    var self = this;
    var grid = h('div.cmp-cards');
    cmp.results.forEach(function (res) {
      // statuses here compare each app against Excel 365
      grid.appendChild(UI.resultCard(res, false, null, null, null));
    });
    this.results.appendChild(h('p.small.muted', { text: 'Evaluated in cell Scratch!B2 on a fresh copy of the store data. ✓ = same result as ' + PL[cmp.from].name + ', ≠ = different result, ✗ = error.' }));
    this.results.appendChild(grid);
    UI.state.stats.compatSeen = UI.state.stats.compatSeen || {};
    if (!UI.state.stats.compatSeen[text]) {
      UI.state.stats.compatSeen[text] = 1; UI.state.stats.compat = (UI.state.stats.compat || 0) + 1;
      if (UI.state.stats.compat >= 3) UI.badge('translator');
    }
    cmp.results.forEach(function (r) { if (r.display && r.display.err) UI.discoverError(r.display.err.code); });
    void self;
  };
})(globalThis.SX = globalThis.SX || {});
