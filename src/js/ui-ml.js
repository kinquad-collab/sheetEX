/* SheetEX v2 — ML Data Lab (Lesson 10): getting a database table ready for a machine-learning model.
 * Runs on its own sandbox database (same tables as the SQL workspace, plus ml_examples and predictions). */
(function (SX) {
  'use strict';
  var UI = SX.ui, h = UI.h, M = SX.mldata;
  var ROLES = [['', 'Choose…'], ['id', 'Row ID'], ['feature', 'Feature (input)'], ['label', 'Label (the answer)'], ['split', 'Train/test bookkeeping'], ['leak', 'Known only afterwards']];
  var ROLE_OK = { week: ['split', 'feature'] };

  function MlView(host) {
    this.host = host;
    this.db = SX.sql.makeStoreDb();
    this.last = null; this.rolesOk = false; this.sawLeak = false; this.sawBaseline = false;
    this.build();
    UI.state.visited.ml = UI.state.visited.ml || Date.now(); UI.save();
  }
  UI.MlView = MlView;

  MlView.prototype.exec = function (sql) {
    var self = this, out = { results: [], error: null };
    try {
      SX.sql.execute(this.db, sql).forEach(function (r) { out.results.push(r); if (r.type === 'rows') self.last = { columns: r.columns, rows: r.rows }; });
    } catch (e) {
      if (!(e instanceof SX.sql.SqlError)) throw e;
      out.error = e;
    }
    UI.state.stats.queries = (UI.state.stats.queries || 0) + 1;
    return out;
  };
  MlView.prototype.console = function (initial, rows) {
    var self = this;
    var ta = h('textarea.sql-editor.rd-console', { spellcheck: 'false', rows: rows || 3, 'aria-label': 'SQL' });
    ta.value = initial || '';
    var out = h('div');
    function go() { out.innerHTML = ''; out.appendChild(UI.sqlResultView(self.exec(ta.value))); }
    ta.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); go(); } });
    return h('div.rd-console-wrap', null, [ta, h('div.row', null, [h('button.btn.btn-primary.btn-sm', { text: '▶ Run (Ctrl+Enter)', onclick: go }),
      h('span.small.muted', { text: 'Your own copy of the data — it resets when you leave the page.' })]), out]);
  };
  MlView.prototype.q = function (sql) { return SX.sql.execute(this.db, sql).pop().rows; };
  MlView.prototype.helpers = function () {
    var db = this.db;
    return { db: db, table: function (n) { return db.tables[n.toLowerCase()] || null; }, last: this.last, rolesOk: this.rolesOk, sawLeak: this.sawLeak };
  };

  MlView.prototype.build = function () {
    var self = this;
    var sections = [
      ['examples', '1. Examples, features & a label', this.secExamples()],
      ['balance', '2. Is the data balanced?', this.secBalance()],
      ['missing', '3. Missing values', this.secMissing()],
      ['leak', '4. Train, test & leakage', this.secLeak()],
      ['features', '5. Build the training table', this.secFeatures()],
      ['grade', '6. Grade the model', this.secGrade()]
    ];
    var nav = h('nav.rd-nav', null, sections.map(function (s) { return h('button.chip', { text: s[1], onclick: function () { document.getElementById('ml-' + s[0]).scrollIntoView({ behavior: 'smooth', block: 'start' }); } }); }));
    this.host.appendChild(h('main.compare.rdbms.mllab', null, [
      h('div.cmp-hero.rd-hero.ml-hero', null, [
        h('button.back-btn.light', { onclick: function () { UI.go('home'); } }, '← Home'),
        h('h1', { html: 'Databases for <span>Machine Learning</span>' }),
        h('p', { html: SX.data.COMPANY + ' wants an AI model that warns a store <b>before a product runs out</b>. The training data is a database table, <code>ml_examples</code> — and it has problems that would quietly ruin the model. Find them with SQL.' }),
        nav
      ])
    ].concat(sections.map(function (s) { return h('section.cmp-section.rd-section#ml-' + s[0], null, [h('h2', { text: s[1] }), s[2]]); })).concat([
      h('section.cmp-section#ml-play', null, [h('h2', { text: '🧪 Free play' }),
        h('p.small', { html: 'Tables: <code>ml_examples</code>, <code>predictions</code>, plus <code>products</code>, <code>sales</code>, <code>stores</code>. Try <code>PRAGMA table_info(ml_examples);</code>' }),
        this.console('SELECT * FROM ml_examples LIMIT 8;', 4)]),
      h('section.cmp-section#ml-challenges', null, [h('h2', { text: '🏆 Lesson 10 challenges' }),
        UI.challengePanel('ml', function () { return self.helpers(); })])
    ])));
  };

  // ---------- 1. Examples, features & a label ----------
  MlView.prototype.secExamples = function () {
    var self = this, cols = M.COLUMNS;
    var preview = h('div.tq-scroll', null, h('table.tq-grid.res.ml-preview', null, [h('tr', null, cols.map(function (c) { return h('th', { text: c.name }); }))].concat(
      M.ROWS.slice(0, 6).map(function (r) { return h('tr', null, r.map(function (v) { return h('td' + (v === null ? '.null' : ''), { text: v === null ? 'NULL' : String(v) }); })); }))));
    var picks = {}, msg = h('div.rd-status');
    var rows = cols.map(function (c) {
      var fb = h('span.ml-fb');
      var sel = h('select.input.ml-role', { 'aria-label': 'Job of ' + c.name, 'data-col': c.name, onchange: function () { picks[c.name] = sel.value; fb.textContent = ''; fb.className = 'ml-fb'; } },
        ROLES.map(function (r) { return h('option', { value: r[0], text: r[1] }); }));
      return { c: c, sel: sel, fb: fb, el: h('div.ml-rolerow', null, [h('code', { text: c.name }), h('span.small.muted', { text: c.type }), sel, fb]) };
    });
    function check() {
      var right = 0;
      rows.forEach(function (r) {
        var good = (ROLE_OK[r.c.name] || [r.c.role]).indexOf(r.sel.value) >= 0;
        if (good) right++;
        r.fb.className = 'ml-fb ' + (good ? 'good' : 'bad');
        r.fb.textContent = good ? '✓ ' + r.c.about : (r.sel.value ? '✗ Not quite.' : '✗ Pick one.');
      });
      self.rolesOk = right === rows.length;
      msg.className = 'rd-status ' + (self.rolesOk ? 'good' : 'bad');
      msg.textContent = self.rolesOk ? 'All ' + rows.length + ' right. A model may only learn from the features — and must never see restock_after.' : right + ' of ' + rows.length + ' right. Read the feedback and try again.';
    }
    return h('div', null, [
      h('p', { html: 'Each row is one <b>example</b>: one product, at one store, in one week. The model reads the <b>features</b> and guesses the <b>label</b>. Some columns are neither — and one would let the model cheat.' }),
      preview,
      h('h3', { text: 'What is each column for?' }),
      h('div.ml-roles', null, rows.map(function (r) { return r.el; })),
      h('div.row', null, h('button.btn.btn-primary.btn-sm', { text: 'Check my sorting', onclick: check })), msg
    ]);
  };

  // ---------- 2. Balance ----------
  function bars(items, max) {
    var W = 340, L = 120, rowH = 34, H = items.length * rowH + 8, out = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + items.map(function (i) { return i[0] + ': ' + i[1]; }).join(', ') + '">';
    items.forEach(function (it, i) {
      var y = 4 + i * rowH, w = Math.max(2, (W - L - 40) * it[1] / max);
      out += '<text x="' + (L - 8) + '" y="' + (y + 19) + '" text-anchor="end" class="ml-bar-label">' + it[0] + '</text>' +
        '<g><title>' + it[0] + ': ' + it[1] + '</title><rect x="' + L + '" y="' + (y + 4) + '" width="' + w + '" height="22" rx="4" class="' + it[2] + '"/></g>' +
        '<text x="' + (L + w + 6) + '" y="' + (y + 20) + '" class="ml-bar-val">' + it[1] + '</text>';
    });
    return out + '</svg>';
  }
  MlView.prototype.secBalance = function () {
    var self = this, F = M.FACTS, chart = h('div.ml-chart'), result = h('div');
    function draw(split) {
      var where = split ? " WHERE split = '" + split + "'" : '';
      var r = self.q('SELECT SUM(stockout = 0), SUM(stockout = 1) FROM ml_examples' + where + ';')[0];
      chart.innerHTML = bars([['No stockout (0)', r[0], 'ml-neg'], ['Stockout (1)', r[1], 'ml-pos']], Math.max(r[0], r[1]));
    }
    var tabs = h('div.chips', null, [['', 'All rows'], ['train', 'Train'], ['test', 'Test']].map(function (t, i) {
      var b = h('button.chip' + (i === 0 ? '.on' : ''), { text: t[1], onclick: function () { Array.prototype.forEach.call(tabs.children, function (x) { x.classList.remove('on'); }); b.classList.add('on'); draw(t[0]); } });
      return b;
    }));
    draw('');
    return h('div', null, [
      h('p', { html: 'Stockouts are <b>rare</b>: about 1 in 4 examples overall, and only <b>' + (F.cm.tp + F.cm.fn) + ' of ' + F.test + '</b> test rows. When one answer is rare, the classes are <b>imbalanced</b>.' }),
      h('div.rd-two', null, [
        h('div', null, [tabs, chart]),
        h('div.ml-card', null, [h('b', { text: 'The lazy "baseline" model' }), h('p.small', { text: 'It ignores every feature and ALWAYS answers "no stockout".' }),
          h('button.btn.btn-sm', { text: 'Score it on the test rows', onclick: function () {
            self.sawBaseline = true;
            result.innerHTML = '';
            result.appendChild(h('div.ml-metrics', null, [metric(Math.round(F.baseline * 100) + '%', 'accuracy'), metric('0 of ' + (F.cm.tp + F.cm.fn), 'stockouts caught')]));
            result.appendChild(h('p.small', { html: 'High accuracy, <b>zero usefulness</b>. Any real model has to beat this — and accuracy alone cannot tell you if it does.' }));
          } }), result])
      ]),
      h('h3', { text: 'Count it yourself' }),
      this.console('SELECT stockout, COUNT(*) AS examples\nFROM ml_examples\nGROUP BY stockout;', 3)
    ]);
  };
  function metric(v, l) { return h('div.ml-metric', null, [h('b', { text: v }), h('span', { text: l })]); }

  // ---------- 3. Missing values ----------
  MlView.prototype.secMissing = function () {
    var self = this, out = h('div');
    var opts = [
      ['Drop the rows', 'Simple, but you lose data — and if values are missing for a reason, you bias the model.', "SELECT COUNT(*) AS rows_left FROM ml_examples WHERE units_last_week IS NOT NULL AND split = 'train';"],
      ['Fill with the average', 'Keeps every row. Use the TRAINING average only — the test rows must stay unseen.', "SELECT example_id, units_last_week,\n  COALESCE(units_last_week, (SELECT ROUND(AVG(units_last_week)) FROM ml_examples WHERE split = 'train')) AS filled\nFROM ml_examples WHERE units_last_week IS NULL;"],
      ['Add a "was missing" flag', 'Fill the value AND add a 0/1 column, so the model can learn whether "missing" itself means something.', 'SELECT example_id, COALESCE(units_last_week, 0) AS units, units_last_week IS NULL AS was_missing\nFROM ml_examples LIMIT 8;']
    ];
    return h('div', null, [
      h('p', { html: 'A model cannot do math with <code>NULL</code>. Find the gaps first — then choose a fix <b>and write down which one you chose</b>.' }),
      h('div.ml-opts', null, opts.map(function (o) {
        return h('div.rd-no', null, [h('b', { text: o[0] }), h('p.small', { text: o[1] }), h('pre.cs-pre', { text: o[2] }),
          h('button.btn.btn-sm', { text: '▶ Try it', onclick: function () { out.innerHTML = ''; out.appendChild(h('div.small.muted', { text: o[0] + ':' })); out.appendChild(UI.sqlResultView(self.exec(o[2]))); } })]);
      })),
      out,
      h('h3', { text: 'Find them yourself' }),
      this.console('SELECT example_id, store_id, sku, units_last_week\nFROM ml_examples\nWHERE units_last_week IS NULL;', 3)
    ]);
  };

  // ---------- 4. Train, test & leakage ----------
  MlView.prototype.secLeak = function () {
    var self = this, F = M.FACTS;
    var keyOf = function (r) { return r[1] + '|' + r[2] + '|' + r[3]; };
    var grid = h('div.ml-split');
    M.ROWS.forEach(function (r) {
      grid.appendChild(h('span.ml-sq.' + (r[10] === 'train' ? 'tr' : 'te'), { 'data-key': keyOf(r), title: '#' + r[0] + ' · week ' + r[1] + ' · ' + r[2] + ' · ' + r[3] + ' · ' + r[10] }));
    });
    var found = h('div.small');
    var leakOut = h('div');
    return h('div', null, [
      h('p', { html: '<b>Training</b> rows teach the model; <b>test</b> rows are its final exam. If any test row is a <b>copy</b> of a training row, the model has seen the answers — and its score is a lie.' }),
      h('div.ml-legend', null, [h('span.ml-sq.tr'), ' train (' + F.train + ')  ', h('span.ml-sq.te'), ' test (' + F.test + ')  ', h('span.ml-sq.te.dup'), ' copied between splits']),
      grid,
      h('div.row', null, [h('button.btn.btn-sm.btn-primary', { text: '🔍 Find copies across the split', onclick: function () {
        var sql = 'SELECT week, store_id, sku FROM ml_examples GROUP BY week, store_id, sku HAVING COUNT(DISTINCT split) > 1;';
        var rows = self.q(sql), keys = rows.map(function (r) { return r.join('|'); });
        Array.prototype.forEach.call(grid.children, function (sq) { sq.classList.toggle('dup', keys.indexOf(sq.dataset.key) >= 0); });
        found.innerHTML = '';
        found.appendChild(h('span', { html: '<b>' + rows.length + ' leaked examples</b> — each appears in BOTH splits. The query that found them:' }));
        found.appendChild(h('pre.cs-pre', { text: sql.replace(' GROUP', '\nGROUP').replace(' HAVING', '\nHAVING') }));
      } })]), found,
      h('h3', { text: 'Target leakage: a column from the future' }),
      h('p', { html: '<code>restock_after</code> is filled in <b>after</b> the week ends — and it is only above 0 when the product ran out. A model trained with it will look perfect.' }),
      h('div.row', null, [
        h('button.btn.btn-sm', { text: 'Train a model that uses restock_after', onclick: function () {
          var r = self.q('SELECT AVG((restock_after > 0) = stockout) FROM ml_examples WHERE split = \'test\';')[0][0];
          self.sawLeak = true;
          leakOut.innerHTML = '';
          leakOut.appendChild(h('div.ml-metrics', null, [metric(Math.round(r * 100) + '%', 'test accuracy (cheating)'), metric(Math.round(F.accuracy * 100) + '%', 'honest model')]));
          leakOut.appendChild(h('p.rd-status.bad', { html: '<b>Too good to be true.</b> On Monday morning, nobody knows next week\'s restock order yet — so in real use this model has nothing to go on. A perfect score is a reason to look for leakage, not to celebrate.' }));
        } })]),
      leakOut,
      h('h3', { text: 'Try it' }),
      this.console("SELECT split, COUNT(*) AS examples, SUM(stockout) AS stockouts\nFROM ml_examples\nGROUP BY split;", 3)
    ]);
  };

  // ---------- 5. Build the training table ----------
  MlView.prototype.secFeatures = function () {
    return h('div', null, [
      h('p', { html: 'A model learns from ONE table. Build it with a query: keep the <b>training rows</b>, keep the <b>features</b> and the <b>label</b>, drop the leaky column, and <b>JOIN</b> in useful facts from other tables (like the product\'s category). <code>CREATE TABLE … AS SELECT …</code> saves the result as a new table.' }),
      h('div.ml-pipe', null, ['ml_examples', '+ JOIN products', "WHERE split = 'train'", '− restock_after', 'train_set'].map(function (s, i, a) {
        return [h('span.ml-step', { text: s }), i < a.length - 1 ? h('span.ml-arrow', { text: '→' }) : null];
      }).reduce(function (x, y) { return x.concat(y); }, [])),
      this.console("CREATE TABLE train_set AS\nSELECT e.example_id, e.promo, e.price, e.units_last_week, e.in_stock_start, e.stockout\nFROM ml_examples e\nWHERE e.split = 'train';\n\nSELECT * FROM train_set LIMIT 5;", 7),
      h('p.small.muted', { html: 'This starter is missing something: the product <b>category</b>. Add a JOIN to products. (Made a mistake? <code>DROP TABLE train_set;</code> and run it again.)' })
    ]);
  };

  // ---------- 6. Grade the model ----------
  MlView.prototype.secGrade = function () {
    var F = M.FACTS, cm = F.cm, detail = h('div.small.ml-detail', { text: 'Click a box to see what it means.' });
    var self = this;
    function box(cls, n, title, about, actual, pred) {
      return h('button.ml-cell.' + cls, { onclick: function () {
        var ids = self.q('SELECT e.example_id FROM predictions p JOIN ml_examples e ON p.example_id = e.example_id WHERE e.stockout = ' + actual + ' AND p.predicted = ' + pred + ';').map(function (r) { return '#' + r[0]; });
        detail.innerHTML = '<b>' + title + '</b> — ' + about + ' Examples: ' + (ids.join(', ') || 'none') + '.';
      } }, [h('b', { text: String(n) }), h('span', { text: title })]);
    }
    var precision = cm.tp / Math.max(1, cm.tp + cm.fp), recall = cm.tp / Math.max(1, cm.tp + cm.fn);
    return h('div', null, [
      h('p', { html: 'The <code>predictions</code> table holds a simple model\'s guesses for the ' + F.test + ' test rows. JOIN it to the real answers to grade it.' }),
      h('div.rd-two', null, [
        h('div', null, [
          h('div.ml-cm', null, [
            h('span'), h('span.ml-cmh', { text: 'Predicted 1' }), h('span.ml-cmh', { text: 'Predicted 0' }),
            h('span.ml-cmh.side', { text: 'Really 1' }), box('tp', cm.tp, 'True positives', 'stockouts the model caught.', 1, 1), box('fn', cm.fn, 'False negatives', 'stockouts the model MISSED — empty shelves nobody was warned about.', 1, 0),
            h('span.ml-cmh.side', { text: 'Really 0' }), box('fp', cm.fp, 'False positives', 'false alarms: the model warned, but nothing ran out.', 0, 1), box('tn', cm.tn, 'True negatives', 'correctly predicted no stockout.', 0, 0)
          ]), detail]),
        h('div', null, [
          h('div.ml-metrics', null, [metric(Math.round(F.accuracy * 100) + '%', 'accuracy'), metric(Math.round(precision * 100) + '%', 'precision'), metric(Math.round(recall * 100) + '%', 'recall')]),
          h('table.cs-keys.small', null, [
            ['Accuracy', '(TP + TN) ÷ all', 'How often is it right?'], ['Precision', 'TP ÷ (TP + FP)', 'When it warns, is it right?'], ['Recall', 'TP ÷ (TP + FN)', 'How many stockouts does it catch?']
          ].map(function (r) { return h('tr', null, r.map(function (x, i) { return h(i ? 'td' : 'th', { text: x }); })); })),
          h('p.small', { html: 'The lazy baseline scores <b>' + Math.round(F.baseline * 100) + '%</b> accuracy — better than this model\'s ' + Math.round(F.accuracy * 100) + '% — but its recall is <b>0%</b>. Which one would a store manager want?' })
        ])
      ]),
      h('h3', { text: 'Grade it with SQL' }),
      this.console('SELECT e.example_id, e.stockout, p.predicted\nFROM predictions p\nJOIN ml_examples e ON p.example_id = e.example_id;', 3)
    ]);
  };
})(globalThis.SX = globalThis.SX || {});
