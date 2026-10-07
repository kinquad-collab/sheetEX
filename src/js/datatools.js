/* SheetEX — Data Tools Lab data (Lessons 11 & 12). A quarter of online and in-store orders with the problems the
 * menu tools are made for: exact duplicate rows, duplicates hiding behind extra spaces, "N/A" typed into a number
 * column, impossible quantities, two different orders sharing one OrderID, and City + State stuck in one column. */
(function (SX) {
  'use strict';
  var D = SX.data, E = SX.engine;
  var seed = 1107;
  function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }

  var HEADERS = ['OrderID', 'OrderDate', 'Customer', 'Category', 'Product', 'Qty', 'UnitPrice', 'Channel', 'Location'];
  var CUSTOMERS = ['Lopez, Maria', 'Johnson, Avery', 'Davis, Morgan', 'Kim, Taylor', 'Patel, Sam', 'Nguyen, Linh', 'Brooks, Jordan', 'Reyes, Ana',
    'Carter, Riley', 'Moore, Casey', 'Wright, Jamie', 'Chen, Riley'];
  var LOCATIONS = ['Cumming, GA', 'Alpharetta, GA', 'Atlanta, GA', 'Savannah, GA', 'Athens, GA', 'Chattanooga, TN', 'Greenville, SC'];
  var CATS = ['Snacks', 'Drinks', 'School Supplies', 'Apparel'];
  var byCat = {}; D.PRODUCTS.forEach(function (p) { if (CATS.indexOf(p[2]) >= 0) (byCat[p[2]] = byCat[p[2]] || []).push(p); });

  // 34 real orders: Sept 1 – Oct 31, 2026, typed in random order
  var BASE = [];
  for (var i = 0; i < 34; i++) {
    var cat = pick(CATS), p = pick(byCat[cat]), day = 1 + Math.floor(rnd() * 61);
    var m = day <= 30 ? 9 : 10, d = day <= 30 ? day : day - 30;
    BASE.push({ id: 7001 + i, m: m, d: d, customer: pick(CUSTOMERS), cat: cat, product: p[1], qty: 1 + Math.floor(rnd() * 12), price: p[3],
      channel: rnd() < 0.5 ? 'Online' : 'In-store', loc: pick(LOCATIONS) });
  }
  BASE.sort(function () { return rnd() - 0.5; });
  // two DIFFERENT orders were given an ID that was already used (a typing error) — Remove Duplicates keeps both
  var CLASH = [{ from: 4, id: BASE[11].id }, { from: 20, id: BASE[27].id }];
  CLASH.forEach(function (x) { BASE[x.from] = Object.assign({}, BASE[x.from], { id: x.id }); });
  // "N/A" typed in two Qty cells, one negative and one zero quantity
  BASE[6] = Object.assign({}, BASE[6], { qty: 'N/A' }); BASE[23] = Object.assign({}, BASE[23], { qty: 'N/A' });
  BASE[9] = Object.assign({}, BASE[9], { qty: -3 }); BASE[30] = Object.assign({}, BASE[30], { qty: 0 });
  // double spaces inside one name
  BASE[15] = Object.assign({}, BASE[15], { customer: BASE[15].customer.replace(', ', ',  ') });

  var ROWS = BASE.slice();
  // three rows pasted twice (exact duplicates) and two copies that differ only by a trailing space
  var EXACT = [2, 13, 25], SPACED = [8, 18];
  EXACT.forEach(function (k, n) { ROWS.splice(10 + n * 9, 0, Object.assign({}, BASE[k])); });
  SPACED.forEach(function (k, n) { ROWS.splice(5 + n * 17, 0, Object.assign({}, BASE[k], { customer: BASE[k].customer + ' ' })); });

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHLY = MONTHS.map(function (mo, k) { return [mo, 120 + k * 9 + (k % 3) * 14, 260 - k * 6 + (k % 4) * 10]; });
  var ADS = [[150, 410], [300, 520], [450, 560], [200, 470], [600, 690], [350, 540], [500, 650], [250, 480], [700, 720], [400, 600]];

  function serial(o) { return E.serial(2026, o.m, o.d); }
  function put(wb, sheet, r, c, v, fmt) {
    if (v === null || v === undefined || v === '') return;
    var input = typeof v === 'number' ? String(v) : (E.parseNumberText(v) || /^\s|\s$/.test(v) ? "'" + v : v);
    wb.setCell(sheet, r, c, { input: input, fmt: fmt });
  }
  function makeWorkbook(platId) {
    var wb = new SX.Workbook(platId);
    wb.addSheet('Orders');
    HEADERS.forEach(function (hd, c) { put(wb, 'Orders', 0, c, hd); });
    ROWS.forEach(function (o, i) {
      var r = i + 1;
      put(wb, 'Orders', r, 0, o.id);
      wb.setCell('Orders', r, 1, { input: String(serial(o)), fmt: 'date' });
      put(wb, 'Orders', r, 2, o.customer); put(wb, 'Orders', r, 3, o.cat); put(wb, 'Orders', r, 4, o.product);
      put(wb, 'Orders', r, 5, o.qty); put(wb, 'Orders', r, 6, o.price, 'currency'); put(wb, 'Orders', r, 7, o.channel); put(wb, 'Orders', r, 8, o.loc);
    });
    wb.addSheet('Monthly');
    ['Month', 'Online', 'In-store'].forEach(function (hd, c) { put(wb, 'Monthly', 0, c, hd); });
    MONTHLY.forEach(function (row, i) { row.forEach(function (x, c) { put(wb, 'Monthly', i + 1, c, x); }); });
    wb.addSheet('Ads');
    ['AdSpend', 'Visitors'].forEach(function (hd, c) { put(wb, 'Ads', 0, c, hd); });
    ADS.forEach(function (row, i) { put(wb, 'Ads', i + 1, 0, row[0], 'currency'); put(wb, 'Ads', i + 1, 1, row[1]); });
    wb.addSheet('Scratch');
    wb.setCell('Scratch', 0, 0, { input: 'Practice space — formulas that check your work go here.' });
    wb.recalc();
    return wb;
  }

  var ids = {}; BASE.forEach(function (o) { ids[o.id] = (ids[o.id] || 0) + 1; });
  var FACTS = {
    rows: ROWS.length, distinct: BASE.length, exact: EXACT.length, spaced: SPACED.length,
    dupIds: Object.keys(ids).filter(function (k) { return ids[k] > 1; }).map(Number),
    naCount: 2, categories: CATS.slice().sort(), channels: ['In-store', 'Online'],
    keys: BASE.map(function (o) { return [o.id, serial(o), o.product, o.channel].join('|'); }),
    months: MONTHS, states: ['GA', 'SC', 'TN']
  };
  SX.datatools = { HEADERS: HEADERS, makeWorkbook: makeWorkbook, FACTS: FACTS, COL: { id: 0, date: 1, customer: 2, cat: 3, product: 4, qty: 5, price: 6, channel: 7, loc: 8 } };
})(globalThis.SX = globalThis.SX || {});
