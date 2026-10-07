/* SheetEX v2 — Data Tools Lab (Lessons 11 & 12): the menu tools on a messy orders table, in Excel 365, Excel 2013
 * or Google Sheets. */
(function (SX) {
  'use strict';
  var UI = SX.ui, h = UI.h;

  var WHERE = [
    ['Sort', 'Data ▸ Sort A to Z / Sort… (warns about one-column sorts)', 'Data ▸ Sort range… (sorts only the selection) · Sort sheet (moves row 1 too)'],
    ['Filter', 'Data ▸ Filter, then ▾ in a header', 'Data ▸ Create a filter, then ▾ in a header'],
    ['Find & Replace', 'Home ▸ Find & Replace · Ctrl+H', 'Edit ▸ Find and replace · Ctrl+H'],
    ['Paste values', 'Home ▸ Paste Values · Ctrl+Alt+V', 'Edit ▸ Paste special ▸ Values only · Ctrl+Shift+V'],
    ['Remove duplicates', 'Data ▸ Remove Duplicates', 'Data ▸ Data cleanup ▸ Remove duplicates'],
    ['Trim spaces', 'No button: =TRIM() + Paste Values', 'Data ▸ Data cleanup ▸ Trim whitespace'],
    ['Split a column', 'Data ▸ Text to Columns', 'Data ▸ Split text to columns'],
    ['Data validation', 'Data ▸ Data Validation (refuses bad typing)', 'Data ▸ Data validation (warns by default)'],
    ['Conditional formatting', 'Home ▸ Conditional Formatting (has Duplicate Values)', 'Format ▸ Conditional formatting (duplicates need a custom formula)'],
    ['Pivot table', 'Insert ▸ PivotTable · needs Data ▸ Refresh All', 'Insert ▸ Pivot table · updates by itself'],
    ['Chart', 'Insert ▸ Chart', 'Insert ▸ Chart']
  ];
  function whereTable() {
    return h('div.cs-section', null, [h('h4', { text: '🧰 Where each tool lives' }),
      h('table.cs-keys', null, [h('tr', null, ['Tool', 'Excel', 'Google Sheets'].map(function (x) { return h('th', { text: x }); }))].concat(
        WHERE.map(function (r) { return h('tr', null, [h('td', null, h('b', { text: r[0] })), h('td.small', { text: r[1] }), h('td.small', { text: r[2] })]); })))]);
  }
  function intro() {
    UI.state.ui.dtIntro = true; UI.save();
    UI.modal('Mission: clean up the orders, then report on them', [
      h('p', { html: SX.data.COMPANY + '\'s order export for September and October is a mess: rows pasted twice, names with extra spaces, <code>N/A</code> in the Qty column, an impossible quantity or two, City and State stuck together, and two different orders sharing one ID.' }),
      h('p', { html: '<b>This time you use the menus</b> — Data, Insert, ' + 'Home/Format and Edit at the top of the sheet — the way you would at home or at work. Then you summarize the clean data with <b>pivot tables</b> and <b>charts</b>.' }),
      h('p.small', { text: 'Switch between Excel 365, Excel 2013 and Google Sheets at the top: each has its own copy of the data, and the menus behave like that app. Made a mistake? Ctrl+Z undoes it.' })
    ], [{ text: "Let's go", primary: true }], { cls: 'wide', onClose: function () { if (UI.maybeGuide) UI.maybeGuide(['tools1', 'tools2']); } });
  }

  UI.dataToolsView = function (host) {
    var plat = ['xl365', 'xl2013', 'gs'].indexOf(UI.state.ui.dtPlat) >= 0 ? UI.state.ui.dtPlat : 'xl365';
    var sel = h('select.tb-select.engine-sel', { title: 'Which spreadsheet app to use', 'aria-label': 'Spreadsheet app', onchange: function () { UI.state.ui.dtPlat = sel.value; UI.save(); UI.go('tools'); } },
      [h('option', { value: 'xl365', text: 'App: Excel 365' }), h('option', { value: 'xl2013', text: 'App: Excel 2013' }), h('option', { value: 'gs', text: 'App: Google Sheets' })]);
    sel.value = plat;
    var view = new UI.SheetView(plat, host, {
      key: 'dt-' + plat, challenges: ['tools1', 'tools2'], firstSheet: 'Orders',
      docTitle: plat === 'gs' ? 'Orders Sep–Oct (messy)' : 'Orders Sep-Oct (messy).xlsx', titleExtra: sel, cheatExtra: whereTable
    });
    UI.state.visited.tools = UI.state.visited.tools || Date.now();
    if (!UI.state.ui.dtIntro) setTimeout(intro, 200);
    return view;
  };
})(globalThis.SX = globalThis.SX || {});
