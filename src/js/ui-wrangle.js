/* SheetEX v2 — Data Wrangling Lab: a messy order feed, cleaned in Excel 365 or Google Sheets. */
(function (SX) {
  'use strict';
  var UI = SX.ui, h = UI.h;

  var CHECKLIST = [
    ['Types', 'Is every number really a number? Digits stored as text ("12") are skipped by SUM. Fix: VALUE().'],
    ['IDs & ZIPs', 'Codes made of digits are TEXT. A number loses its leading zeros: 0104 → 104. Fix: TEXT(x, "0000").'],
    ['Missing values', 'Look for blanks AND fake nulls: "N/A", "-", "null", "none", 0. Turn them all into one real blank.'],
    ['Spaces & case', '" S02 ", "s02" and "S02" are three different values to a computer. Fix: TRIM(), UPPER(), PROPER().'],
    ['Dates', 'Text dates cannot be sorted or subtracted. Fix: DATEVALUE() for text; DATE(y, m, d) to rebuild odd formats like 03.09.2026.'],
    ['Lookups', '#N/A usually means the key does not match exactly: number vs text, extra spaces, different case. Clean the key column first.'],
    ['Delimiters', 'Joining: a & ", " & b or TEXTJOIN. Splitting: SPLIT (Sheets), TEXTSPLIT (newer Excel 365), or LEFT/MID/FIND everywhere.'],
    ['Document it', 'Write down how many rows were missing or fixed. Hidden data cleaning is how biased AI models happen.']
  ];

  function checklist() {
    return h('div.cs-section', null, [h('h4', { text: '🧽 Data-cleaning checklist (before any AI sees it)' }),
      h('table.cs-keys', null, CHECKLIST.map(function (r) { return h('tr', null, [h('td', null, h('b', { text: r[0] })), h('td.small', { text: r[1] })]); }))]);
  }

  function intro() {
    UI.state.ui.wrIntro = true; UI.save();
    UI.modal('Mission: clean the order feed', [
      h('p', { html: 'Peachtree wants to train an <b>AI model</b> that predicts how much each store will order. The order feed was merged from three systems — and it is a mess.' }),
      h('ul', null, [
        h('li', { html: 'Item codes lost their leading zeros (<code>0104</code> became <code>104</code>).' }),
        h('li', { html: 'Dates arrived in four different formats — and one from Europe.' }),
        h('li', { html: 'Missing quantities are written as blanks, <code>N/A</code>, <code>-</code> and <code>null</code>.' }),
        h('li', { html: 'Names, store codes and prices have random spaces and capitals.' })
      ]),
      h('p', { html: '<b>Garbage in, garbage out:</b> a model trained on dirty data learns the dirt. Clean it column by column, then join it to the lookup tables. Two lessons, two certificates.' }),
      h('p.small', { text: 'Tip: you can switch between Excel 365 and Google Sheets at the top — each one has its own copy of the data.' })
    ], [{ text: "Let's clean it", primary: true }], { cls: 'wide', onClose: function () { UI.state.ui.wrIntroDone = true; UI.save(); if (UI.maybeGuide) UI.maybeGuide(['wr1', 'wr2']); } });
  }

  // ---------- 🤖 AI Readiness Check ----------
  function esc(t) { return UI.esc(t); }
  function fmt1(x) { return x == null ? '—' : (Math.round(x * 10) / 10).toFixed(1); }
  // Dot plot: one row per store. Ink tick = true average; orange square = raw-data model; blue circle = your cleaned model.
  function dotPlot(rep) {
    var W = 336, L = 44, R = 12, rowH = 30, top = 8, H = top + rep.stores.length * rowH + 26;
    var vals = [];
    rep.stores.forEach(function (s) { vals.push(rep.truth[s], rep.raw[s] || 0); if (rep.clean && rep.clean[s] != null) vals.push(rep.clean[s]); });
    var max = Math.max(12, Math.ceil(Math.max.apply(null, vals) / 2) * 2);
    var x = function (v) { return L + (W - L - R) * v / max; };
    var out = '<svg class="ai-plot" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Average units per order by store: true value, raw-data model and cleaned-data model">';
    for (var t = 0; t <= max; t += max > 12 ? 4 : 2) {
      out += '<line x1="' + x(t) + '" x2="' + x(t) + '" y1="' + top + '" y2="' + (H - 22) + '" class="ai-grid"/>' +
        '<text x="' + x(t) + '" y="' + (H - 8) + '" class="ai-tick" text-anchor="middle">' + t + '</text>';
    }
    rep.stores.forEach(function (s, i) {
      var cy = top + i * rowH + rowH / 2;
      out += '<text x="' + (L - 8) + '" y="' + (cy + 4) + '" class="ai-label" text-anchor="end">' + s + '</text>';
      var tv = rep.truth[s], rv = rep.raw[s] == null ? 0 : rep.raw[s], cv = rep.clean ? rep.clean[s] : null;
      out += '<line x1="' + x(Math.min(tv, rv)) + '" x2="' + x(Math.max(tv, rv)) + '" y1="' + cy + '" y2="' + cy + '" class="ai-gap"/>';
      out += '<g class="ai-hit"><title>' + s + ' true average: ' + fmt1(tv) + ' units</title><rect x="' + (x(tv) - 8) + '" y="' + (cy - 12) + '" width="16" height="24" fill="transparent"/><line x1="' + x(tv) + '" x2="' + x(tv) + '" y1="' + (cy - 10) + '" y2="' + (cy + 10) + '" class="ai-truth"/></g>';
      out += '<g class="ai-hit"><title>' + s + ' raw-data model: ' + fmt1(rv) + ' units (off by ' + fmt1(Math.abs(rv - tv)) + ')</title><rect x="' + (x(rv) - 6) + '" y="' + (cy - 6) + '" width="12" height="12" rx="2" class="ai-raw"/></g>';
      if (cv != null) out += '<g class="ai-hit"><title>' + s + ' your cleaned model: ' + fmt1(cv) + ' units (off by ' + fmt1(Math.abs(cv - tv)) + ')</title><circle cx="' + x(cv) + '" cy="' + cy + '" r="6" class="ai-clean"/></g>';
    });
    return out + '</svg>';
  }
  function aiTab(view) {
    var box = h('div.ai-check');
    view._aiBox = box; view._aiVersion = null;
    refreshAi(view, true);
    return box;
  }
  function refreshAi(view, force) {
    var box = view._aiBox; if (!box) return;
    if (!force && view._aiVersion === view.wb.version) return;
    view._aiVersion = view.wb.version;
    var rep = SX.wrangle.aiReport(function (r, c) { return view.wb.value('RawOrders', r, c); });
    box.innerHTML = '';
    box.appendChild(h('div.ai-hero', null, [
      h('div.ai-score', null, [h('b', { text: rep.score }), h('span', { text: '/100' })]),
      h('div', null, [h('div.ai-title', { text: '🤖 AI-readiness score' }),
        h('div.small', { text: 'Peachtree\'s AI learns "average units per order" for each store from this feed. Clean the columns below and watch what it learns change.' })])
    ]));
    box.appendChild(h('div.ai-checks', null, rep.readiness.map(function (r) {
      return h('button.ai-row' + (r.pct === 100 ? '.ok' : ''), { title: 'Go to column ' + r.col, onclick: function () { view.goToAddr('RawOrders!' + r.col + '2'); view.focusGrid(); } }, [
        h('span.ai-ico', { text: r.pct === 100 ? '✓' : r.col }),
        h('span.ai-name', { text: r.name }),
        h('span.ai-bar', null, h('span', { style: { width: r.pct + '%' } })),
        h('span.ai-pct', { text: r.pct + '%' })
      ]);
    })));
    // model comparison
    var verdict = rep.cleanErr == null ? 'Fill CleanQty (J) and CleanStore (K) to train the model on YOUR clean data.'
      : rep.cleanErr < 0.05 ? 'Your clean data teaches the model the truth. 🎉' : 'Better — but some cleaned values are still off. Check columns J and K.';
    box.appendChild(h('div.ai-card', null, [
      h('div.ai-card-title', { text: 'What the AI learned' }),
      h('div.ai-legend', null, [h('span.lg-truth', { text: 'True average' }), h('span.lg-raw', { text: 'Raw data' }), h('span.lg-clean', { text: 'Your cleaned data' })]),
      (function () { var d = h('div'); d.innerHTML = dotPlot(rep); return d; })(),
      h('div.ai-stats', null, [
        h('div', null, [h('b', { text: fmt1(rep.rawErr) }), h('span', { text: 'units off per store (raw)' })]),
        h('div', null, [h('b', { text: rep.cleanErr == null ? '—' : fmt1(rep.cleanErr) }), h('span', { text: 'units off per store (yours)' })])
      ]),
      h('p.small.ai-verdict', { text: verdict }),
      h('details.small', null, [h('summary', { text: 'Show as a table' }), h('table.cs-keys', null, [h('tr', null, ['Store', 'True', 'Raw', 'Yours'].map(function (x) { return h('th', { text: x }); }))].concat(rep.stores.map(function (s) {
        return h('tr', null, [s, fmt1(rep.truth[s]), fmt1(rep.raw[s] || 0), rep.clean ? fmt1(rep.clean[s]) : '—'].map(function (x) { return h('td', { text: x }); }));
      })))])
    ]));
    box.appendChild(h('div.ai-card', null, [
      h('div.ai-card-title', { text: 'Why the raw model is wrong' }),
      h('p.small', { html: 'It thinks Peachtree has <b>' + (rep.phantom.length + rep.stores.length) + ' stores</b>, not 5. These "stores" are just the same codes typed differently:' }),
      h('div.chips', null, rep.phantom.map(function (p) { return h('code.ai-phantom', { text: '"' + p + '"' }); })),
      h('p.small', { html: '<b>' + rep.rawZeros + '</b> quantities were not real numbers (text like "12", blanks, N/A), so a careless import read them as <b>0</b> — dragging every average down.' }),
      h('p.small', { html: 'Only <b>' + rep.matchRaw + ' of ' + rep.total + '</b> raw item codes match the product table (number 104 ≠ text "0104"). With your cleaned codes: <b>' + rep.matchClean + ' of ' + rep.total + '</b>.' })
    ]));
    box.appendChild(h('p.small.muted', { text: 'Real AI models are far more complex than an average — but the rule is the same: garbage in, garbage out.' }));
    if (rep.score === 100) UI.badge('ai-ready');
  }

  UI.wrangleView = function (host) {
    var plat = UI.state.ui.wrPlat === 'gs' ? 'gs' : 'xl365';
    var sel = h('select.tb-select.engine-sel', { title: 'Which spreadsheet app to use', 'aria-label': 'Spreadsheet app', onchange: function () { UI.state.ui.wrPlat = sel.value; UI.save(); UI.go('wrangle'); } },
      [h('option', { value: 'xl365', text: 'Engine: Excel 365' }), h('option', { value: 'gs', text: 'Engine: Google Sheets' })]);
    sel.value = plat;
    var view = new UI.SheetView(plat, host, {
      key: 'wr-' + plat, challenges: ['wr1', 'wr2'], firstSheet: 'RawOrders',
      docTitle: 'Order Feed (messy) — Data Wrangling Lab', titleExtra: sel, cheatExtra: checklist,
      extraTabs: [{ id: 'ai', label: '🤖 AI check', button: '🤖 AI check', render: aiTab, refresh: function (v) { refreshAi(v); } }]
    });
    UI.visit('wrangle');
    if (!UI.state.ui.wrIntro) setTimeout(intro, 200);
    return view;
  };
})(globalThis.SX = globalThis.SX || {});
