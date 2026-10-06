/* SheetEX — pre-populated store data (Peachtree Supply Co.)
 * Everything is deterministic so challenge answers never change. */
(function (SX) {
  'use strict';

  var COMPANY = 'Peachtree Supply Co.';

  // SKU, Product, Category, Price, Cost, InStock, ReorderAt, Supplier
  var PRODUCTS = [
    ['SKU-101', 'Granola Bar', 'Snacks', 1.5, 0.6, 140, 50, 'Blue Ridge Foods'],
    ['SKU-102', 'Trail Mix', 'Snacks', 2.75, 1.1, 85, 40, 'Blue Ridge Foods'],
    ['SKU-103', 'Pretzels', 'Snacks', 1.25, 0.45, 32, 40, 'Blue Ridge Foods'],
    ['SKU-104', 'Peanut Butter Crackers', 'Snacks', 1, 0.35, 120, 50, 'Peach State Wholesale'],
    ['SKU-105', 'Fruit Snacks', 'Snacks', 0.95, 0.3, 18, 30, 'Peach State Wholesale'],
    ['SKU-201', 'Bottled Water', 'Drinks', 1, 0.25, 200, 80, 'Peach State Wholesale'],
    ['SKU-202', 'Sports Drink', 'Drinks', 2.25, 0.9, 64, 50, 'Peach State Wholesale'],
    ['SKU-203', 'Iced Tea', 'Drinks', 1.75, 0.55, 45, 40, 'Blue Ridge Foods'],
    ['SKU-204', 'Lemonade', 'Drinks', 1.75, 0.5, 12, 40, 'Blue Ridge Foods'],
    ['SKU-205', 'Cold Brew Coffee', 'Drinks', 3.5, 1.4, 28, 20, 'Blue Ridge Foods'],
    ['SKU-301', 'Spiral Notebook', 'School Supplies', 3.25, 1.1, 150, 60, 'Office Hub Supply'],
    ['SKU-302', 'Gel Pens, 4-pack', 'School Supplies', 4.5, 1.8, 75, 40, 'Office Hub Supply'],
    ['SKU-303', 'Graph Paper', 'School Supplies', 2.5, 0.9, 22, 30, 'Office Hub Supply'],
    ['SKU-304', 'Highlighters', 'School Supplies', 3.75, 1.3, 60, 30, 'Office Hub Supply'],
    ['SKU-305', '3-Ring Binder', 'School Supplies', 5.99, 2.4, 40, 25, 'Office Hub Supply'],
    ['SKU-306', 'Scientific Calculator', 'School Supplies', 18.99, 9.5, 15, 10, 'Chattahoochee Tech'],
    ['SKU-401', 'USB-C Cable', 'Electronics', 9.99, 3.2, 55, 25, 'Chattahoochee Tech'],
    ['SKU-402', 'Wired Earbuds', 'Electronics', 14.99, 5.75, 8, 15, 'Chattahoochee Tech'],
    ['SKU-403', 'Phone Charger', 'Electronics', 19.99, 7.8, 30, 15, 'Chattahoochee Tech'],
    ['SKU-404', 'Flash Drive 64GB', 'Electronics', 12.49, 4.9, 26, 15, 'Chattahoochee Tech'],
    ['SKU-501', 'Team T-Shirt', 'Apparel', 15, 6.25, 90, 30, 'Lakeside Apparel'],
    ['SKU-502', 'Hoodie', 'Apparel', 34.99, 15.5, 24, 15, 'Lakeside Apparel'],
    ['SKU-503', 'Baseball Cap', 'Apparel', 18, 7, 10, 12, 'Lakeside Apparel'],
    ['SKU-504', 'Crew Socks', 'Apparel', 7.5, 2.6, 48, 20, 'Lakeside Apparel']
  ];
  var PRODUCT_HEADERS = ['SKU', 'Product', 'Category', 'Price', 'Cost', 'InStock', 'ReorderAt', 'Supplier'];

  // StoreID, City, State, Zip, Manager, Opened (ISO)
  var STORES = [
    ['S01', 'Cumming', 'GA', 30040, 'Dana Whitfield', '2018-03-15'],
    ['S02', 'Alpharetta', 'GA', 30009, 'Marcus Bell', '2019-08-01'],
    ['S03', 'Atlanta', 'GA', 30303, 'Priya Raman', '2021-01-10'],
    ['S04', 'Savannah', 'GA', 31401, 'Luis Ortega', '2022-06-05'],
    ['S05', 'Athens', 'GA', 30601, 'Hannah Cho', '2023-09-12']
  ];
  var STORE_HEADERS = ['StoreID', 'City', 'State', 'Zip', 'Manager', 'Opened'];

  var REPS = {
    S01: ['J. Patel', 'K. Moore'],
    S02: ['A. Reyes'],
    S03: ['T. Nguyen', 'B. Carter'],
    S04: ['M. Brooks'],
    S05: ['E. Kim']
  };

  // Supplier, City, State, Zip (text!), Phone, AccountNo (16 digits, text!)
  var SUPPLIERS = [
    ['Peach State Wholesale', 'Macon', 'GA', '31201', '478-555-0142', '4417123456789012'],
    ['Blue Ridge Foods', 'Asheville', 'NC', '28801', '828-555-0199', '4417987654321098'],
    ['Chattahoochee Tech', 'Atlanta', 'GA', '30318', '404-555-0110', '4417000011112222'],
    ['Lakeside Apparel', 'Burlington', 'VT', '05401', '802-555-0163', '4417555566667777'],
    ['Office Hub Supply', 'Boston', 'MA', '02110', '617-555-0127', '4417333344445555']
  ];
  var SUPPLIER_HEADERS = ['Supplier', 'City', 'State', 'Zip', 'Phone', 'AccountNo'];

  // Small seeded PRNG so the sales table is identical for every student.
  function lcg(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function buildSales() {
    var rnd = lcg(20260801);
    var start = Date.UTC(2026, 7, 3); // Aug 3 2026
    var days = 59; // through Sep 30
    var rows = [];
    for (var i = 0; i < 60; i++) {
      var store = STORES[Math.floor(rnd() * STORES.length)][0];
      var prod = PRODUCTS[Math.floor(rnd() * PRODUCTS.length)];
      var maxQty = prod[3] > 10 ? 3 : prod[3] > 4 ? 6 : 12;
      var qty = 1 + Math.floor(rnd() * maxQty);
      var reps = REPS[store];
      var rep = reps[Math.floor(rnd() * reps.length)];
      var d = new Date(start + Math.floor(rnd() * days) * 86400000);
      rows.push([0, d.toISOString().slice(0, 10), store, prod[0], qty, rep]);
    }
    rows.sort(function (a, b) { return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0; });
    rows.forEach(function (r, i) { r[0] = 1001 + i; });
    return rows;
  }
  var SALES = buildSales();
  var SALES_HEADERS = ['OrderID', 'Date', 'StoreID', 'SKU', 'Qty', 'Rep'];

  SX.data = {
    COMPANY: COMPANY,
    PRODUCTS: PRODUCTS, PRODUCT_HEADERS: PRODUCT_HEADERS,
    STORES: STORES, STORE_HEADERS: STORE_HEADERS,
    SALES: SALES, SALES_HEADERS: SALES_HEADERS,
    SUPPLIERS: SUPPLIERS, SUPPLIER_HEADERS: SUPPLIER_HEADERS
  };
})(globalThis.SX = globalThis.SX || {});
