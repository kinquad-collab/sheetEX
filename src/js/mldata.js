/* SheetEX — Lesson 10 data: a machine-learning table built from the store data.
 * Each row of ml_examples is one training EXAMPLE: one product at one store for one week. The model's job is to
 * predict the LABEL `stockout` (1 = the product ran out that week) from the FEATURES. Planted problems for students
 * to find: missing feature values, class imbalance, test rows that are copies of training rows (leakage), and a
 * column that is only known AFTER the answer (target leakage: restock_after). `predictions` holds a simple model's
 * guesses for the test rows, so students can grade it with SQL. */
(function (SX) {
  'use strict';
  var D = SX.data;
  // Small seeded random generator so every student gets the same data
  var seed = 2;
  function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }

  var price = {}; D.PRODUCTS.forEach(function (p) { price[p[0]] = p[3]; });
  var skus = D.PRODUCTS.map(function (p) { return p[0]; });
  var stores = D.STORES.map(function (s) { return s[0]; });
  var COLUMNS = [
    { name: 'example_id', type: 'INTEGER', role: 'id', about: 'Row ID (primary key). Never a feature — it carries no information about the world.' },
    { name: 'week', type: 'INTEGER', role: 'split', about: 'Week number 1–6. Weeks 1–4 are for training, weeks 5–6 for testing (the model is tested on the "future").' },
    { name: 'store_id', type: 'TEXT', role: 'feature', about: 'Which store (foreign key to stores). A category feature.' },
    { name: 'sku', type: 'TEXT', role: 'feature', about: 'Which product (foreign key to products). A category feature.' },
    { name: 'units_last_week', type: 'INTEGER', role: 'feature', about: 'Units sold the week before. Some values are missing (NULL).' },
    { name: 'promo', type: 'INTEGER', role: 'feature', about: '1 if the product was on sale this week, else 0.' },
    { name: 'price', type: 'REAL', role: 'feature', about: 'Shelf price this week (10% off during a promo).' },
    { name: 'in_stock_start', type: 'INTEGER', role: 'feature', about: 'Units on the shelf when the week started.' },
    { name: 'restock_after', type: 'INTEGER', role: 'leak', about: 'Units ordered AFTER the week ended to refill the shelf. Only known after the answer — target leakage!' },
    { name: 'stockout', type: 'INTEGER', role: 'label', about: 'THE LABEL: 1 if the product ran out that week, 0 if not. This is what the model predicts.' },
    { name: 'split', type: 'TEXT', role: 'split', about: '"train" rows teach the model; "test" rows check it on data it has never seen.' }
  ];

  var ROWS = [], id = 1;
  for (var week = 1; week <= 6; week++) {
    stores.forEach(function (st) {
      var used = {};
      for (var k = 0; k < 2; k++) {
        var sku = pick(skus);
        while (used[sku]) sku = pick(skus);
        used[sku] = true;
        var promo = rnd() < 0.25 ? 1 : 0;
        var last = 4 + Math.floor(rnd() * 30);
        var demand = Math.round(last * (promo ? 1.6 : 1.05) * (0.8 + rnd() * 0.45));
        var start = Math.round(last * (0.9 + rnd() * 0.9)) + 2;
        var out = demand > start ? 1 : 0;
        var restock = out ? Math.max(5, Math.round((demand - start) * 1.5 + 10)) : 0;
        ROWS.push([id++, week, st, sku, last, promo, +(price[sku] * (promo ? 0.9 : 1)).toFixed(2), start, restock, out, week <= 4 ? 'train' : 'test']);
      }
    });
  }
  // Missing feature values (a sensor/import glitch)
  [3, 11, 19, 26, 34, 47].forEach(function (i) { ROWS[i][4] = null; });
  // Leakage: four training rows were accidentally copied into the test set
  var LEAKED = [5, 14, 22, 37];
  LEAKED.forEach(function (i) { var r = ROWS[i].slice(); r[0] = id++; r[10] = 'test'; ROWS.push(r); });

  // A simple "model": predicts a stockout when there is a promo, or when the shelf starts with less than last week's sales
  var PREDICTIONS = ROWS.filter(function (r) { return r[10] === 'test'; }).map(function (r) {
    var guess = r[5] === 1 || (r[4] != null && r[7] < r[4]) ? 1 : 0;
    return [r[0], guess];
  });

  function create(db) {
    db.create('ml_examples', COLUMNS.map(function (c) { return { name: c.name, type: c.type }; }),
      ROWS.map(function (r) { return r.slice(); }),
      { pk: ['example_id'], fks: [{ col: 'store_id', table: 'stores', refCol: 'store_id' }, { col: 'sku', table: 'products', refCol: 'sku' }],
        checks: [{ text: 'promo IN (0, 1)' }, { text: 'stockout IN (0, 1)' }, { text: "split IN ('train', 'test')" }], notNull: ['week', 'store_id', 'sku', 'stockout', 'split'], strict: true });
    db.create('predictions', [{ name: 'example_id', type: 'INTEGER' }, { name: 'predicted', type: 'INTEGER' }],
      PREDICTIONS.map(function (r) { return r.slice(); }),
      { pk: ['example_id'], fks: [{ col: 'example_id', table: 'ml_examples', refCol: 'example_id' }], checks: [{ text: 'predicted IN (0, 1)' }], notNull: ['predicted'], strict: true });
  }

  // Facts the challenges check against
  function count(f) { return ROWS.filter(f).length; }
  var test = ROWS.filter(function (r) { return r[10] === 'test'; }), byId = {};
  ROWS.forEach(function (r) { byId[r[0]] = r; });
  var cm = { tp: 0, fp: 0, fn: 0, tn: 0 };
  PREDICTIONS.forEach(function (p) { var y = byId[p[0]][9]; cm[p[1] ? (y ? 'tp' : 'fp') : (y ? 'fn' : 'tn')]++; });
  var FACTS = {
    total: ROWS.length, pos: count(function (r) { return r[9] === 1; }), neg: count(function (r) { return r[9] === 0; }),
    nulls: count(function (r) { return r[4] === null; }), train: count(function (r) { return r[10] === 'train'; }), test: test.length,
    leaked: LEAKED.length, leakedKeys: LEAKED.map(function (i) { return [ROWS[i][1], ROWS[i][2], ROWS[i][3]]; }),
    cm: cm, accuracy: (cm.tp + cm.tn) / PREDICTIONS.length,
    baseline: test.filter(function (r) { return r[9] === 0; }).length / test.length
  };

  SX.mldata = { COLUMNS: COLUMNS, ROWS: ROWS, PREDICTIONS: PREDICTIONS, FACTS: FACTS, create: create };
})(globalThis.SX = globalThis.SX || {});
