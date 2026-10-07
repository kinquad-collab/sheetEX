/* SheetEX v2 — Interactive cheat sheet: search a task, see it in every tool, run it live. */
(function (SX) {
  'use strict';
  var UI = SX.ui, h = UI.h, REF = SX.reference, PL = SX.platforms.PLATFORMS;

  function ReferenceView(host) {
    this.host = host;
    this.cat = UI.state.ui.refCat == null ? -1 : UI.state.ui.refCat;
    this.show = UI.state.ui.refTools || { xl365: true, xl2013: true, gs: true, sql: true, csv: true };
    this.build();
  }
  UI.ReferenceView = ReferenceView;

  ReferenceView.prototype.build = function () {
    var self = this;
    this.search = h('input.input.ref-search', { placeholder: 'Search: zeros, null, date, VLOOKUP, split, filter…', 'aria-label': 'Search the cheat sheet' });
    this.search.addEventListener('input', function () { self.draw(); });
    this.chips = h('div.chips');
    var toggles = h('div.ref-toggles', null, REF.TOOLS.map(function (t) {
      var cb = h('input', { type: 'checkbox', checked: self.show[t.id] !== false });
      cb.addEventListener('change', function () { self.show[t.id] = cb.checked; UI.state.ui.refTools = self.show; UI.save(); self.draw(); });
      return h('label.ref-toggle', null, [cb, ' ' + t.name]);
    }));
    this.list = h('div.ref-list');
    this.host.appendChild(h('main.compare.reference', null, [
      h('div.cmp-hero.ref-hero', null, [
        h('button.back-btn.light', { onclick: function () { UI.go('home'); } }, '← Home'),
        h('h1', { text: 'Interactive Cheat Sheet' }),
        h('p', { text: 'One task, every tool. Find what you need to do, compare how Excel 365, Excel 2013, Google Sheets, SQL and CSV files handle it — then press ▶ Run to see the real result on the Peachtree data.' }),
        this.search
      ]),
      h('div.ref-controls', null, [this.chips, toggles]),
      this.list
    ]));
    this.drawChips(); this.draw();
    setTimeout(function () { self.search.focus(); }, 50);
  };
  ReferenceView.prototype.drawChips = function () {
    var self = this;
    this.chips.innerHTML = '';
    [-1].concat(REF.CATS.map(function (_, i) { return i; })).forEach(function (i) {
      self.chips.appendChild(h('button.chip' + (self.cat === i ? '.on' : ''), { text: i < 0 ? 'All' : REF.CATS[i], onclick: function () {
        self.cat = i; UI.state.ui.refCat = i; UI.save(); self.drawChips(); self.draw();
      } }));
    });
  };
  ReferenceView.prototype.draw = function () {
    var self = this, q = this.search.value.trim().toLowerCase();
    this.list.innerHTML = '';
    var items = REF.LIST.filter(function (e) {
      if (self.cat >= 0 && e.cat !== self.cat) return false;
      if (!q) return true;
      var hay = (e.task + ' ' + e.why + ' ' + REF.CATS[e.cat] + ' ' + (e.note || '') + ' ' + REF.TOOLS.map(function (t) { var c = REF.cell(e, t.id); return c ? (c.code || '') + ' ' + (c.note || '') + ' ' + (c.none || '') : ''; }).join(' ')).toLowerCase();
      return q.split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
    });
    if (!items.length) { this.list.appendChild(h('div.empty-note', null, [h('div.big-emoji', { text: '🔎' }), h('p', { text: 'Nothing matches "' + q + '". Try a shorter word.' })])); return; }
    items.forEach(function (e) { self.list.appendChild(self.card(e)); });
  };
  ReferenceView.prototype.card = function (e) {
    var self = this;
    var grid = h('div.ref-tools');
    REF.TOOLS.forEach(function (t) {
      if (self.show[t.id] === false) return;
      var c = REF.cell(e, t.id);
      var out = h('div.ref-out');
      var block = h('div.ref-tool.rt-' + t.id, null, [h('div.ref-tool-head', null, [UI.platIcon(PL[t.id]), h('b', { text: t.name })])]);
      if (!c) block.appendChild(h('div.small.muted', { text: '—' }));
      else if (c.none) block.appendChild(h('div.ref-none', { text: '✗ ' + c.none }));
      else {
        if (c.code) {
          block.appendChild(h('pre.ref-code', { text: c.code }));
          var btns = h('div.ref-btns');
          if (c.run) btns.appendChild(h('button.btn.btn-xs.btn-primary', { text: '▶ Run', onclick: function () { self.showResult(e, t.id, out); } }));
          btns.appendChild(h('button.btn.btn-xs', { text: 'Copy', onclick: function () { UI.copyText(c.code.replace(/^\{(.*)\}$/, '$1')); UI.toast('Copied', c.code); } }));
          block.appendChild(btns);
        }
        if (c.note) block.appendChild(h('div.ref-note', { text: c.note }));
        block.appendChild(out);
      }
      grid.appendChild(block);
    });
    return h('section.ref-card', null, [
      h('div.ref-card-head', null, [h('span.ref-cat', { text: REF.CATS[e.cat] }), h('h3', { text: e.task })]),
      h('p.ref-why', { text: e.why }),
      e.note ? h('p.ref-tip', { text: '💡 ' + e.note }) : null,
      grid
    ]);
  };
  ReferenceView.prototype.showResult = function (e, tool, out) {
    var r = REF.run(e, tool);
    out.innerHTML = '';
    if (!r) return;
    if (r.error) {
      out.appendChild(h('div.ref-err', { text: r.error }));
      if (r.code) UI.discoverError(r.code);
      return;
    }
    if (r.text !== undefined) { out.appendChild(h('div.ref-val', null, [h('span.small.muted', { text: 'Result: ' }), h('b', { text: r.text })])); return; }
    var t = h('table.ref-table');
    r.rows.forEach(function (row, i) {
      t.appendChild(h('tr', null, row.map(function (v) { return h(i === 0 && tool === 'sql' ? 'th' : 'td', { text: v === null ? 'NULL' : String(v) }); })));
    });
    out.appendChild(t);
    if (r.more) out.appendChild(h('div.small.muted', { text: '…and ' + r.more + ' more rows' }));
    UI.state.stats.refRuns = (UI.state.stats.refRuns || 0) + 1;
    if (UI.state.stats.refRuns >= 10) UI.badge('researcher');
    UI.save();
  };
})(globalThis.SX = globalThis.SX || {});
