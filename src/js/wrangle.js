/* SheetEX v2 — Data Wrangling Lab dataset.
 * "Before Peachtree can train an AI model on its orders, someone has to clean the data."
 * Every messy value is generated from a clean TRUTH record, so challenge answers are exact. */
(function (SX) {
  'use strict';
  var D = SX.data, E = SX.engine;

  // Item codes are the SKU digits padded to 4 characters: SKU-101 -> "0101"
  function code4(sku) { return ('0000' + sku.replace(/\D/g, '')).slice(-4); }
  var ITEMS = D.PRODUCTS.map(function (p) { return { code: code4(p[0]), product: p[1], category: p[2], price: p[3] }; });
  var byCode = {}; ITEMS.forEach(function (it) { byCode[it.code] = it; });

  var PEOPLE = [['Jordan', 'Smith'], ['Maria', 'Lopez'], ['Chris', 'Lee'], ['Taylor', 'Kim'], ['Avery', 'Johnson'],
    ['Sam', 'Patel'], ['Riley', 'Brooks'], ['Morgan', 'Davis'], ['Jamie', 'Nguyen'], ['Casey', 'Wright']];
  var STORES = ['S01', 'S02', 'S03', 'S04', 'S05'];
  var MONTH3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---- TRUTH: 30 clean orders ----
  var TRUTH = [];
  for (var i = 0; i < 30; i++) {
    var item = ITEMS[(i * 7 + 3) % ITEMS.length];
    var person = PEOPLE[(i * 3 + 1) % PEOPLE.length];
    var missingQty = [4, 9, 13, 21, 26].indexOf(i) >= 0;
    TRUTH.push({
      id: 5001 + i,
      store: STORES[(i * 2 + i % 3) % 5],
      code: item.code,
      y: 2026, m: 9, d: 1 + (i * 11) % 30,
      qty: missingQty ? null : 1 + (i * 5) % 14,
      price: item.price,
      first: person[0], last: person[1],
      channel: i % 3 === 0 ? 'Online' : 'In-Store'
    });
  }
  var EURO_ROW = 17; // this one arrives as a European date: 03.09.2026

  // ---- How each truth value arrives messy ----
  var NULL_TOKENS = ['', 'N/A', '-', 'null', ''];
  function messy(t, i) {
    var r = {};
    r.store = i % 4 === 1 ? t.store.toLowerCase() : i % 4 === 2 ? ' ' + t.store + ' ' : t.store;
    r.codeKind = i % 3 === 0 ? 'number' : i % 3 === 1 ? 'text' : 'spaced';
    r.code = r.codeKind === 'number' ? Number(t.code) : r.codeKind === 'text' ? t.code : ' ' + t.code;
    var us = t.m + '/' + t.d + '/' + t.y, iso = t.y + '-' + ('0' + t.m).slice(-2) + '-' + ('0' + t.d).slice(-2);
    if (i === EURO_ROW) { r.dateKind = 'euro'; r.date = ('0' + t.d).slice(-2) + '.' + ('0' + t.m).slice(-2) + '.' + t.y; }
    else {
      r.dateKind = ['real', 'iso', 'us', 'mon', 'real'][i % 5];
      r.date = r.dateKind === 'iso' ? iso : r.dateKind === 'us' ? us : r.dateKind === 'mon' ? MONTH3[t.m - 1] + ' ' + t.d + ', ' + t.y : iso;
    }
    if (t.qty === null) { r.qtyKind = 'null'; r.qty = NULL_TOKENS[[4, 9, 13, 21, 26].indexOf(i)]; }
    else if (i % 4 === 3) { r.qtyKind = 'text'; r.qty = String(t.qty); }
    else { r.qtyKind = 'number'; r.qty = t.qty; }
    r.priceKind = ['number', 'dollar', 'space'][i % 3];
    r.price = r.priceKind === 'number' ? t.price : r.priceKind === 'dollar' ? '$' + t.price.toFixed(2) : t.price.toFixed(2) + ' ';
    var k = i % 4;
    r.customer = k === 0 ? (t.first + ' ' + t.last).toLowerCase() : k === 1 ? '  ' + t.first + ' ' + t.last + ' ' : k === 2 ? t.last + ', ' + t.first : (t.first + ' ' + t.last).toUpperCase();
    r.channel = [t.channel, t.channel.toLowerCase(), t.channel === 'Online' ? 'online ' : 'in store'][i % 3];
    return r;
  }
  var MESSY = TRUTH.map(messy);

  // HLOOKUP table: stores across the top
  var TARGETS = [['Store', 'S01', 'S02', 'S03', 'S04', 'S05'],
    ['Region', 'North', 'North', 'Metro', 'Coast', 'East'],
    ['Sept Target', 60, 85, 120, 70, 55],
    ['Manager', 'Dana Whitfield', 'Marcus Bell', 'Priya Raman', 'Luis Ortega', 'Hannah Cho']];

  // Contacts for concatenation & delimiters. Zip stored as a NUMBER, so 05401 already lost its zero.
  var CONTACTS = [
    ['Dana', 'Whitfield', 'Cumming', 'GA', 30040, 'snacks|drinks'],
    ['Marcus', 'Bell', 'Alpharetta', 'GA', 30009, 'supplies'],
    ['Priya', 'Raman', 'Atlanta', 'GA', 30303, 'electronics|apparel|snacks'],
    ['Luis', 'Ortega', 'Savannah', 'GA', 31401, ''],
    ['Hannah', 'Cho', 'Athens', 'GA', 30601, 'drinks'],
    ['Erin', 'Walsh', 'Burlington', 'VT', 5401, 'apparel|supplies'],
    ['Omar', 'Haddad', 'Boston', 'MA', 2110, 'supplies|electronics'],
    ['Grace', 'Liu', 'Asheville', 'NC', 28801, 'snacks|drinks|apparel|supplies']
  ];

  var ORDER_HEADERS = ['OrderID', 'Store', 'ItemCode', 'OrderDate', 'Qty', 'UnitPrice', 'Customer', 'Channel'];
  var REPORT_ROWS = [
    ['Question', 'Your answer (formula)'],
    ['How many Qty cells are completely blank?', ''],
    ['How many Qty cells hold a fake-null word (N/A, -, null)?', ''],
    ['How many orders have NO usable quantity after cleaning?', ''],
    ['Real date for the European date 03.09.2026 (row 19)', ''],
    ['', ''],
    ['Sept target for store S03 (HLOOKUP)', ''],
    ['Total units of all orders with a usable quantity', ''],
    ['', ''],
    ['CSV line for Contacts row 2', ''],
    ['Orders with more than 10 units (list spills from D2)', '']
  ];

  function serialOf(t) { return E.serial(t.y, t.m, t.d); }

  function makeWorkbook(platId) {
    var wb = new SX.Workbook(platId);
    function put(sheet, r, c, v, fmt) {
      var input = v === null || v === undefined ? '' : typeof v === 'number' ? String(v) : (E.parseNumberText(v) || /^(TRUE|FALSE)$/i.test(v.trim()) || v === '-' ? "'" + v : v);
      if (typeof v === 'string' && /^\s|\s$/.test(v)) input = "'" + v; // keep surrounding spaces as text
      if (input === '' && !fmt) return;
      wb.setCell(sheet, r, c, { input: input, fmt: fmt });
    }
    wb.addSheet('RawOrders');
    ORDER_HEADERS.forEach(function (hd, c) { put('RawOrders', 0, c, hd); });
    MESSY.forEach(function (m, i) {
      var t = TRUTH[i], r = i + 1;
      put('RawOrders', r, 0, t.id);
      put('RawOrders', r, 1, m.store);
      put('RawOrders', r, 2, m.code);
      if (m.dateKind === 'real') wb.setCell('RawOrders', r, 3, { input: String(serialOf(t)), fmt: 'date' });
      else put('RawOrders', r, 3, m.date);
      put('RawOrders', r, 4, m.qty === '' ? null : m.qty);
      put('RawOrders', r, 5, m.price, m.priceKind === 'number' ? 'currency' : undefined);
      put('RawOrders', r, 6, m.customer);
      put('RawOrders', r, 7, m.channel);
    });
    wb.addSheet('ItemCodes');
    ['Code', 'Product', 'Category', 'Price'].forEach(function (hd, c) { put('ItemCodes', 0, c, hd); });
    ITEMS.forEach(function (it, i) { put('ItemCodes', i + 1, 0, it.code); put('ItemCodes', i + 1, 1, it.product); put('ItemCodes', i + 1, 2, it.category); put('ItemCodes', i + 1, 3, it.price, 'currency'); });
    wb.addSheet('Targets');
    TARGETS.forEach(function (row, r) { row.forEach(function (v, c) { put('Targets', r, c, v); }); });
    wb.addSheet('Contacts');
    ['First', 'Last', 'City', 'State', 'Zip', 'Tags'].forEach(function (hd, c) { put('Contacts', 0, c, hd); });
    CONTACTS.forEach(function (row, i) { row.forEach(function (v, c) { put('Contacts', i + 1, c, v === '' ? null : v); }); });
    wb.addSheet('Report');
    REPORT_ROWS.forEach(function (row, r) { put('Report', r, 0, row[0]); put('Report', r, 1, row[1]); });
    wb.recalc();
    return wb;
  }

  // CSV versions for the CSV workspace (and the cheat sheet)
  function files() {
    var csv = SX.csv;
    var orders = [ORDER_HEADERS].concat(MESSY.map(function (m, i) {
      var t = TRUTH[i];
      var date = m.dateKind === 'real' ? t.m + '/' + t.d + '/' + t.y : m.date;
      return [t.id, m.store, m.codeKind === 'number' ? String(m.code) : m.code, date, m.qty, m.price, m.customer, m.channel];
    }));
    return {
      'messy_orders.csv': csv.stringify(orders, ','),
      'item_codes.csv': csv.stringify([['Code', 'Product', 'Category', 'Price']].concat(ITEMS.map(function (it) { return [it.code, it.product, it.category, it.price.toFixed(2)]; })), ',')
    };
  }

  // ---- Expected answers ----
  function properName(t) { return t.first + ' ' + t.last; }
  var X = {
    codes: TRUTH.map(function (t) { return t.code; }),
    qty: TRUTH.map(function (t) { return t.qty; }),
    stores: TRUTH.map(function (t) { return t.store; }),
    prices: TRUTH.map(function (t) { return t.price; }),
    dates: TRUTH.map(serialOf),
    names: TRUTH.map(properName),
    products: TRUTH.map(function (t) { return byCode[t.code].product; }),
    lineTotals: TRUTH.map(function (t) { return t.qty === null ? null : Math.round(t.qty * byCode[t.code].price * 100) / 100; }),
    regions: TRUTH.map(function (t) { return TARGETS[1][TARGETS[0].indexOf(t.store)]; }),
    blankQty: MESSY.filter(function (m) { return m.qty === ''; }).length,
    fakeNullQty: MESSY.filter(function (m) { return m.qtyKind === 'null' && m.qty !== ''; }).length,
    missingQty: TRUTH.filter(function (t) { return t.qty === null; }).length,
    euroDate: serialOf(TRUTH[EURO_ROW]),
    targetS03: TARGETS[2][3],
    totalUnits: TRUTH.reduce(function (a, t) { return a + (t.qty || 0); }, 0),
    lastFirst: CONTACTS.map(function (c) { return c[1] + ', ' + c[0]; }),
    mailing: CONTACTS.map(function (c) { return c[2] + ', ' + c[3] + ' ' + ('00000' + c[4]).slice(-5); }),
    tagCounts: CONTACTS.map(function (c) { return c[5] === '' ? 0 : c[5].split('|').length; }),
    csvRow2: CONTACTS[0].slice(0, 5).join(','),
    bigOrders: TRUTH.filter(function (t) { return t.qty !== null && t.qty > 10; }).map(function (t) { return t.id; })
  };

  SX.wrangle = { TRUTH: TRUTH, MESSY: MESSY, ITEMS: ITEMS, TARGETS: TARGETS, CONTACTS: CONTACTS, EURO_ROW: EURO_ROW,
    makeWorkbook: makeWorkbook, files: files, X: X, code4: code4 };
})(globalThis.SX = globalThis.SX || {});
