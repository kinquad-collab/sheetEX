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
    ], [{ text: "Let's clean it", primary: true }], { cls: 'wide' });
  }

  UI.wrangleView = function (host) {
    var plat = UI.state.ui.wrPlat === 'gs' ? 'gs' : 'xl365';
    var sel = h('select.tb-select.engine-sel', { title: 'Which spreadsheet app to use', 'aria-label': 'Spreadsheet app', onchange: function () { UI.state.ui.wrPlat = sel.value; UI.save(); UI.go('wrangle'); } },
      [h('option', { value: 'xl365', text: 'Engine: Excel 365' }), h('option', { value: 'gs', text: 'Engine: Google Sheets' })]);
    sel.value = plat;
    var view = new UI.SheetView(plat, host, {
      key: 'wr-' + plat, challenges: ['wr1', 'wr2'], firstSheet: 'RawOrders',
      docTitle: 'Order Feed (messy) — Data Wrangling Lab', titleExtra: sel, cheatExtra: checklist
    });
    UI.visit('wrangle');
    if (!UI.state.ui.wrIntro) setTimeout(intro, 200);
    return view;
  };
})(globalThis.SX = globalThis.SX || {});
