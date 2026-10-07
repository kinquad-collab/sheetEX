/* SheetEX v2 — "What is an RDBMS?" interactive explainer (Lesson 9).
 * Runs on its own sandbox database so students can break things safely. */
(function (SX) {
  'use strict';
  var UI = SX.ui, h = UI.h, D = SX.data;

  function money(v) { return '$' + Number(v).toFixed(2); }
  function errKind(msg) {
    if (/^UNIQUE/.test(msg)) return 'UNIQUE';
    if (/^NOT NULL/.test(msg)) return 'NOT NULL';
    if (/^CHECK/.test(msg)) return 'CHECK';
    if (/^FOREIGN KEY/.test(msg)) return 'FOREIGN KEY';
    if (/^cannot store/.test(msg)) return 'TYPE';
    return null;
  }

  function RdbmsView(host) {
    this.host = host;
    this.db = SX.sql.makeStoreDb();
    this.errorsSeen = {};
    this.anomaly = false;
    this.sawRollbackDelete = false;
    this.bankDone = false;
    this.last = null;
    this.build();
  }
  UI.RdbmsView = RdbmsView;

  // Run SQL on the sandbox and remember what happened (the challenges look at this).
  RdbmsView.prototype.exec = function (sql) {
    var self = this, out = { results: [], error: null };
    try {
      SX.sql.execute(this.db, sql).forEach(function (r) {
        if (r.statement.type === 'begin') self.txDeletedSales = false;
        if (r.statement.type === 'delete' && /^sales$/i.test(r.statement.table) && r.changed > 0 && self.db.tx) self.txDeletedSales = true;
        if (r.rolledBack) { if (self.txDeletedSales) self.sawRollbackDelete = true; UI.badge('rollback'); }
        out.results.push(r);
      });
      this.last = out.results[out.results.length - 1];
    } catch (e) {
      if (!(e instanceof SX.sql.SqlError)) throw e;
      out.error = e;
      this.last = { error: e.message };
      var k = errKind(e.message);
      if (k) this.errorsSeen[k] = true;
    }
    if (this.onChange) this.onChange();
    return out;
  };
  function resultView(out) {
    var box = h('div.rd-result');
    out.results.forEach(function (r) {
      if (r.type === 'msg') box.appendChild(h('div.sql-msg' + (r.noWhere ? '.warn' : ''), { text: '✓ ' + r.message }));
      else box.appendChild(UI.SqlView.prototype.table.call(null, r, 1));
    });
    if (out.error) box.appendChild(h('div.sql-err', null, [h('div.sql-err-msg', { text: 'Error: ' + out.error.message }), out.error.hint ? h('div.sql-hint', { text: '💡 ' + out.error.hint }) : null]));
    return box;
  }
  RdbmsView.prototype.console = function (initial, rows) {
    var self = this;
    var ta = h('textarea.sql-editor.rd-console', { spellcheck: 'false', rows: rows || 3, 'aria-label': 'SQL' }, initial || '');
    ta.value = initial || '';
    var out = h('div');
    function go() { out.innerHTML = ''; out.appendChild(resultView(self.exec(ta.value))); }
    ta.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); go(); } });
    return h('div.rd-console-wrap', null, [ta, h('div.row', null, [h('button.btn.btn-primary.btn-sm', { text: '▶ Run (Ctrl+Enter)', onclick: go }),
      h('span.small.muted', { text: 'This sandbox resets when you leave the page — break whatever you like.' })]), out]);
  };

  RdbmsView.prototype.build = function () {
    var self = this;
    var sections = [
      ['grid', '1. Grid vs. database', this.secFlat()],
      ['tables', '2. Tables, columns & types', this.secTables()],
      ['keys', '3. Keys connect tables', this.secKeys()],
      ['no', '4. The database says NO', this.secNo()],
      ['tx', '5. Transactions: all or nothing', this.secTx()],
      ['where', '6. Where you will meet one', this.secWhere()]
    ];
    var nav = h('nav.rd-nav', null, sections.map(function (s) { return h('button.chip', { text: s[1], onclick: function () { document.getElementById('rd-' + s[0]).scrollIntoView({ behavior: 'smooth', block: 'start' }); } }); }));
    var root = h('main.compare.rdbms', null, [
      h('div.cmp-hero.rd-hero', null, [
        h('button.back-btn.light', { onclick: function () { UI.go('home'); } }, '← Home'),
        h('h1', { html: 'What is an <span>RDBMS</span>?' }),
        h('p', { html: 'A <b>R</b>elational <b>D</b>ata<b>b</b>ase <b>M</b>anagement <b>S</b>ystem stores data in <b>tables</b> that are connected by <b>keys</b>, and it <b>protects</b> that data with rules and transactions. Spreadsheets hold data; an RDBMS <i>guards</i> it. Click, edit and break things below to see the difference.' }),
        nav
      ])
    ].concat(sections.map(function (s) { return h('section.cmp-section.rd-section#rd-' + s[0], null, [h('h2', { text: s[1] }), s[2]]); })).concat([
      h('section.cmp-section#rd-play', null, [h('h2', { text: '🧪 Free play' }),
        h('p.small', { html: 'Your own sandbox database: <code>products</code>, <code>sales</code>, <code>stores</code> (with real keys and rules), plus the loose <code>raw_orders</code> import. Try <code>PRAGMA table_info(sales);</code> to see a table\'s rules.' }),
        this.console('SELECT s.order_id, p.product, st.city\nFROM sales s\nJOIN products p ON s.sku = p.sku\nJOIN stores st ON s.store_id = st.store_id\nLIMIT 5;', 6)]),
      h('section.cmp-section#rd-challenges', null, [h('h2', { text: '🏆 Lesson 9 challenges' }),
        UI.challengePanel('rdbms', function () { return self.helpers(); })])
    ]));
    this.host.appendChild(root);
  };

  RdbmsView.prototype.helpers = function () {
    var db = this.db;
    function table(name) { return db.tables[name.toLowerCase()] || null; }
    return { db: db, table: table, anomaly: this.anomaly, errorsSeen: Object.keys(this.errorsSeen), sawRollbackDelete: this.sawRollbackDelete,
      bankDone: this.bankDone, last: this.last };
  };

  // ---------- 1. Flat sheet vs tables ----------
  RdbmsView.prototype.secFlat = function () {
    var self = this;
    var counts = {}; D.SALES.forEach(function (s) { counts[s[3]] = (counts[s[3]] || 0) + 1; });
    var sku = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })[0];
    var prod = D.PRODUCTS.filter(function (p) { return p[0] === sku; })[0];
    var city = {}, mgr = {}; D.STORES.forEach(function (s) { city[s[0]] = s[1]; mgr[s[0]] = s[4]; });
    var picked = D.SALES.filter(function (s) { return s[3] === sku; }).concat(D.SALES.filter(function (s) { return s[3] !== sku; }).slice(0, 3))
      .sort(function (a, b) { return a[0] - b[0]; });
    var newPrice = Math.round((prod[3] + 0.5) * 100) / 100;
    var status = h('div.rd-status');
    var inputs = [];
    var table = h('table.rd-flat', null, [h('tr', null, ['OrderID', 'Product', 'Price', 'Qty', 'Store city', 'Manager'].map(function (x) { return h('th', { text: x }); }))].concat(picked.map(function (s) {
      var p = D.PRODUCTS.filter(function (x) { return x[0] === s[3]; })[0];
      var inp = h('input.rd-cell', { value: money(p[3]), 'aria-label': 'Price for order ' + s[0] });
      if (s[3] === sku) inputs.push(inp);
      inp.addEventListener('input', check);
      return h('tr' + (s[3] === sku ? '.rd-hl' : ''), null, [h('td', { text: s[0] }), h('td', { text: p[1] }), h('td', null, inp), h('td', { text: s[4] }), h('td', { text: city[s[2]] }), h('td', { text: mgr[s[2]] })]);
    })));
    function check() {
      var vals = inputs.map(function (i) { return i.value.trim(); });
      var distinct = vals.filter(function (v, i) { return vals.indexOf(v) === i; });
      status.innerHTML = '';
      if (distinct.length > 1) {
        self.anomaly = true;
        status.className = 'rd-status bad';
        status.innerHTML = '<b>Update anomaly!</b> The sheet now says ' + prod[1] + ' costs ' + distinct.map(UI.esc).join(' AND ') + '. Which one is true? The sheet cannot tell you — the same fact is stored ' + inputs.length + ' times and you missed some.';
      } else if (vals[0] !== money(prod[3])) {
        status.className = 'rd-status good';
        status.textContent = 'You updated all ' + inputs.length + ' copies. Imagine doing that for 50,000 orders — and never missing one.';
      } else {
        status.className = 'rd-status';
        status.innerHTML = '<b>Your job:</b> ' + UI.esc(prod[1]) + ' now costs <b>' + money(newPrice) + '</b>. Change the price in the sheet above. (Try changing just ONE of the highlighted rows first.)';
      }
    }
    check();
    var dbOut = h('div');
    var sql = "UPDATE products SET price = " + newPrice + " WHERE sku = '" + sku + "';";
    return h('div.rd-two', null, [
      h('div', null, [h('h3', { text: '📄 One big sheet' }),
        h('p.small', { text: 'Every order row repeats the product\'s price and the store\'s city and manager.' }), table, status]),
      h('div', null, [h('h3', { text: '🗄️ Tables in a database' }),
        h('p.small', { html: 'The price lives in <b>one</b> row of <code>products</code>. Orders only store the <code>sku</code> and look the price up through the key.' }),
        h('pre.cs-pre', { text: sql }),
        h('button.btn.btn-primary.btn-sm', { text: '▶ Run the one-line fix', onclick: function () {
          var out = self.exec(sql + "\nSELECT s.order_id, p.product, p.price, s.qty FROM sales s JOIN products p ON s.sku = p.sku WHERE s.sku = '" + sku + "';");
          dbOut.innerHTML = ''; dbOut.appendChild(resultView(out));
          dbOut.appendChild(h('p.small.rd-status.good', { text: 'One change, and every order that uses ' + prod[1] + ' agrees. This idea — store each fact once — is called normalization.' }));
        } }), dbOut])
    ]);
  };

  // ---------- 2. Tables, columns & types ----------
  RdbmsView.prototype.secTables = function () {
    var self = this, detail = h('div.rd-detail', { text: 'Click any column to see what the database knows about it.' });
    function explain(t, c) {
      var bits = [];
      bits.push('<b>' + UI.esc(t.name + '.' + c.name) + '</b> holds <b>' + c.type + '</b> values' + (t.strict ? ' — and only ' + c.type + ' (this is a STRICT table).' : '.'));
      if (c.pk) bits.push('🔑 <b>Primary key:</b> every row has a different value. It is the row\'s ID card.');
      if (c.ref) bits.push('→ <b>Foreign key:</b> must match a <code>' + UI.esc(c.ref.table + '.' + (c.ref.refCol || '')) + '</code> that exists.');
      if (c.notNull && !c.pk) bits.push('❗ <b>NOT NULL:</b> it can never be empty.');
      t.checks.forEach(function (ck) { if (ck.text.indexOf(c.name) >= 0) bits.push('✔ <b>CHECK rule:</b> <code>' + UI.esc(ck.text) + '</code>'); });
      if (bits.length === 1) bits.push('No extra rules — any ' + c.type + ' value (or nothing) is allowed.');
      detail.innerHTML = bits.join('<br>');
    }
    var cards = ['stores', 'products', 'sales'].map(function (n) {
      var t = self.db.tables[n];
      return h('div.rd-tcard', null, [h('div.rd-tname', null, [n, h('span.small.muted', { text: ' · ' + t.rows.length + ' rows' })]),
        h('div', null, t.cols.map(function (c) {
          return h('button.rd-col', { onclick: function () { explain(t, c); } }, [h('span', null, [c.pk ? '🔑 ' : '', c.name, c.ref ? h('span.key-fk', { text: ' → ' + c.ref.table }) : null]), h('span.col-type', { text: c.type })]);
        }))]);
    });
    var tryOut = h('div');
    var sheetCell = h('input.rd-cell.rd-sheetcell', { value: 'cheap', 'aria-label': 'Spreadsheet cell' });
    return h('div', null, [
      h('p', { html: 'A <b>table</b> is like one sheet, but stricter: every <b>column</b> has a name and a <b>data type</b>, and every <b>row</b> is one thing (one product, one sale, one store).' }),
      h('div.rd-tcards', null, cards), detail,
      h('div.rd-two', null, [
        h('div', null, [h('h3', { text: 'Spreadsheet cell' }), h('p.small', { text: 'Type anything into a price cell. A spreadsheet just accepts it — and SUM quietly skips it later.' }), h('div.row', null, [h('span', { text: 'Price: ' }), sheetCell, h('span.rd-ok', { text: '✓ accepted' })])]),
        h('div', null, [h('h3', { text: 'Database column' }), h('pre.cs-pre', { text: "UPDATE products SET price = 'cheap' WHERE sku = 'SKU-101';" }),
          h('button.btn.btn-primary.btn-sm', { text: '▶ Try it', onclick: function () { tryOut.innerHTML = ''; tryOut.appendChild(resultView(self.exec("UPDATE products SET price = 'cheap' WHERE sku = 'SKU-101';"))); } }), tryOut])
      ])
    ]);
  };

  // ---------- 3. Keys connect tables (clickable ER diagram) ----------
  RdbmsView.prototype.secKeys = function () {
    var self = this;
    var T = { products: { x: 10, cols: ['sku', 'product', 'category', 'price'] }, sales: { x: 280, cols: ['order_id', 'order_date', 'store_id', 'sku', 'qty'] }, stores: { x: 550, cols: ['store_id', 'city', 'state', 'manager'] } };
    var BW = 200, RH = 22, TOP = 34;
    function rowY(t, c) { return TOP + 30 + T[t].cols.indexOf(c) * RH + RH / 2; }
    var diagram = h('div.rd-er');
    function draw(sel) {
      var svg = '<svg viewBox="0 0 760 200" width="100%" role="img" aria-label="Diagram: sales.sku points to products.sku, sales.store_id points to stores.store_id">';
      Object.keys(T).forEach(function (n) {
        var t = T[n], hgt = 30 + t.cols.length * RH;
        svg += '<g class="er-box"><rect x="' + t.x + '" y="' + TOP + '" width="' + BW + '" height="' + hgt + '" rx="8"/><rect class="er-head" x="' + t.x + '" y="' + TOP + '" width="' + BW + '" height="28" rx="8"/>' +
          '<text class="er-title" x="' + (t.x + 12) + '" y="' + (TOP + 19) + '">' + n + '</text>';
        t.cols.forEach(function (c, i) {
          var y = TOP + 30 + i * RH;
          var isPk = (n === 'products' && c === 'sku') || (n === 'stores' && c === 'store_id') || (n === 'sales' && c === 'order_id');
          var isFk = n === 'sales' && (c === 'sku' || c === 'store_id');
          var val = sel ? sel[n] && sel[n][c] : null;
          svg += '<text class="er-col' + (isPk ? ' pk' : '') + (isFk ? ' fk' : '') + '" x="' + (t.x + 12) + '" y="' + (y + 15) + '">' + (isPk ? '🔑 ' : isFk ? '→ ' : '') + c + '</text>';
          if (val != null) svg += '<text class="er-val" x="' + (t.x + BW - 10) + '" y="' + (y + 15) + '" text-anchor="end">' + UI.esc(String(val)) + '</text>';
        });
        svg += '</g>';
      });
      // links: sales.sku -> products.sku ; sales.store_id -> stores.store_id
      [['sku', 'products', 'sku', T.sales.x, T.products.x + BW], ['store_id', 'stores', 'store_id', T.sales.x + BW, T.stores.x]].forEach(function (l) {
        var y1 = rowY('sales', l[0]), y2 = rowY(l[1], l[2]), x1 = l[3], x2 = l[4];
        var mid = (x1 + x2) / 2;
        svg += '<path class="er-link' + (sel ? ' on' : '') + '" d="M' + x1 + ',' + y1 + ' C' + mid + ',' + y1 + ' ' + mid + ',' + y2 + ' ' + x2 + ',' + y2 + '"/>' +
          '<text class="er-card" x="' + (x1 + (x2 > x1 ? 6 : -6)) + '" y="' + (y1 - 5) + '" text-anchor="' + (x2 > x1 ? 'start' : 'end') + '">many</text>' +
          '<text class="er-card" x="' + (x2 + (x2 > x1 ? -6 : 6)) + '" y="' + (y2 - 5) + '" text-anchor="' + (x2 > x1 ? 'end' : 'start') + '">1</text>';
      });
      diagram.innerHTML = svg + '</svg>';
    }
    draw(null);
    var follow = h('div.rd-follow', { text: 'Click an order below to follow its keys.' });
    var list = h('div.rd-orders', null, D.SALES.slice(0, 8).map(function (s) {
      var b = h('button.rd-order', { onclick: function () {
        Array.prototype.forEach.call(list.children, function (x) { x.classList.remove('on'); }); b.classList.add('on');
        var p = D.PRODUCTS.filter(function (x) { return x[0] === s[3]; })[0], st = D.STORES.filter(function (x) { return x[0] === s[2]; })[0];
        draw({ sales: { order_id: s[0], order_date: s[1], store_id: s[2], sku: s[3], qty: s[4] }, products: { sku: p[0], product: p[1], category: p[2], price: money(p[3]) }, stores: { store_id: st[0], city: st[1], state: st[2], manager: st[4] } });
        var sql = 'SELECT s.order_id, p.product, p.price, st.city\nFROM sales s\nJOIN products p ON s.sku = p.sku\nJOIN stores st ON s.store_id = st.store_id\nWHERE s.order_id = ' + s[0] + ';';
        follow.innerHTML = '';
        follow.appendChild(h('p', { html: 'Order <b>' + s[0] + '</b> stores only <code>sku = ' + s[3] + '</code> and <code>store_id = ' + s[2] + '</code>. The database follows those keys to find <b>' + UI.esc(p[1]) + '</b> (' + money(p[3]) + ') and the <b>' + UI.esc(st[1]) + '</b> store. That is exactly what a <b>JOIN</b> does — a VLOOKUP for every row at once:' }));
        follow.appendChild(h('pre.cs-pre', { text: sql }));
        follow.appendChild(resultView(self.exec(sql)));
        self.followed = true;
      } }, [h('b', { text: '#' + s[0] }), ' ' + s[3] + ' @ ' + s[2]]);
      return b;
    }));
    return h('div', null, [
      h('p', { html: 'A <b>primary key</b> (🔑) uniquely identifies each row. A <b>foreign key</b> (→) is a column that holds another table\'s primary key — a pointer. One store has <b>many</b> sales; each sale belongs to exactly <b>1</b> store. That is a <b>relationship</b>, and it is the "R" in RDBMS.' }),
      diagram, list, follow
    ]);
  };

  // ---------- 4. The database says NO ----------
  RdbmsView.prototype.secNo = function () {
    var self = this;
    var tries = [
      ['Two products with the same ID', "INSERT INTO products VALUES ('SKU-101', 'Fake Granola', 'Snacks', 1.00, 0.40, 10, 5, 'Nobody');",
        'Without a unique key you could have two "SKU-101"s — and every report would double-count.'],
      ['A product with no name', "INSERT INTO products (sku, category, price, in_stock) VALUES ('SKU-999', 'Snacks', 1.00, 5);",
        'NOT NULL means "required". A spreadsheet happily keeps half-empty rows.'],
      ['A negative price', "UPDATE products SET price = -5 WHERE sku = 'SKU-101';", 'A CHECK rule describes what a sensible value looks like.'],
      ['A sale of a product that does not exist', "INSERT INTO sales VALUES (2001, '2026-10-01', 'S01', 'SKU-777', 2, 'J. Patel');",
        'A foreign key stops "orphan" rows that point at nothing — the #N/A of databases, caught before it happens.'],
      ['Closing a store that still has sales', "DELETE FROM stores WHERE store_id = 'S03';", 'The database will not let you break existing links.'],
      ['Text in a number column', "UPDATE sales SET qty = 'a few' WHERE order_id = 1001;", 'Types are enforced, so math on the column always works.']
    ];
    return h('div', null, [
      h('p', { text: 'An RDBMS refuses bad data at the door, instead of letting it pile up for you to clean later. Each button tries something a spreadsheet would allow:' }),
      h('div.rd-no-grid', null, tries.map(function (t) {
        var out = h('div');
        return h('div.rd-no', null, [h('b', { text: t[0] }), h('pre.cs-pre', { text: t[1] }),
          h('button.btn.btn-sm', { text: '▶ Try it', onclick: function () {
            out.innerHTML = ''; out.appendChild(resultView(self.exec(t[1])));
            out.appendChild(h('p.small.muted', { text: t[2] }));
          } }), out]);
      })),
      h('h3', { text: 'Your turn: invent your own bad data' }),
      this.console("INSERT INTO stores VALUES ('S01', 'Duluth', 'GA', 30096, 'Pat Lee', '2026-10-01');")
    ]);
  };

  // ---------- 5. Transactions ----------
  RdbmsView.prototype.secTx = function () {
    var self = this;
    var bank, mode = 'none', step = 0, log = [];
    var cards = h('div.rd-bank'), logBox = h('pre.cs-pre.rd-log'), msg = h('div.rd-status'), controls = h('div.row');
    function reset() {
      bank = new SX.sql.Database();
      SX.sql.execute(bank, "CREATE TABLE lunch (name TEXT PRIMARY KEY, balance REAL NOT NULL CHECK (balance >= 0)) STRICT; INSERT INTO lunch VALUES ('Jordan', 20), ('Maria', 5);");
      step = 0; log = []; msg.className = 'rd-status'; msg.textContent = 'Move $10 from Jordan\'s lunch account to Maria\'s. It takes TWO updates.'; render();
    }
    function run(sql) {
      log.push(sql);
      try { SX.sql.execute(bank, sql); } catch (e) { log.push('-- Error: ' + e.message); }
      render();
    }
    function bal() { var r = {}; bank.tables.lunch.rows.forEach(function (x) { r[x[0]] = x[1]; }); return r; }
    function render() {
      var b = bal(), total = b.Jordan + b.Maria;
      cards.innerHTML = '';
      ['Jordan', 'Maria'].forEach(function (n) { cards.appendChild(h('div.rd-acct', null, [h('div.small.muted', { text: n + '\'s lunch account' }), h('b', { text: money(b[n]) })])); });
      cards.appendChild(h('div.rd-acct.total' + (total !== 25 ? '.bad' : ''), null, [h('div.small.muted', { text: 'Total money' }), h('b', { text: money(total) })]));
      logBox.textContent = log.length ? log.join('\n') : '-- the SQL that runs will appear here';
      controls.innerHTML = '';
      var B = function (txt, fn, primary) { controls.appendChild(h('button.btn.btn-sm' + (primary ? '.btn-primary' : ''), { text: txt, onclick: fn })); };
      if (step === 0) {
        B('Without a transaction', function () { mode = 'none'; step = 1; render(); });
        B('With a transaction (BEGIN)', function () { mode = 'tx'; step = 1; run('BEGIN;'); }, true);
      } else if (step === 1) {
        B('Step 1: take $10 from Jordan', function () { run("UPDATE lunch SET balance = balance - 10 WHERE name = 'Jordan';"); step = 2; render(); }, true);
      } else if (step === 2) {
        B('Step 2: give $10 to Maria', function () { run("UPDATE lunch SET balance = balance + 10 WHERE name = 'Maria';"); step = 3; render(); }, true);
        B('⚡ Power failure!', function () {
          if (mode === 'tx') {
            log.push('-- 💥 POWER FAILURE before step 2 …', '-- on restart the database finds an unfinished transaction and undoes it:');
            if (bank.tx) SX.sql.execute(bank, 'ROLLBACK;'); log.push('ROLLBACK;'); step = 0; render();
            msg.className = 'rd-status good'; msg.innerHTML = '<b>Saved by the transaction.</b> The half-finished transfer was rolled back: nobody lost money. Now run the whole transfer again and COMMIT it.';
            self.survivedCrash = true;
          } else {
            log.push('-- 💥 POWER FAILURE before step 2 … step 2 never runs'); step = 4; render();
            msg.className = 'rd-status bad'; msg.innerHTML = '<b>$10 vanished.</b> Jordan was charged but Maria never got paid, and the total dropped to ' + money(bal().Jordan + bal().Maria) + '. Try again <b>with a transaction</b>.';
          }
        });
      } else if (step === 3) {
        if (mode === 'tx') B('COMMIT', function () {
          run('COMMIT;'); step = 4;
          msg.className = 'rd-status good'; msg.innerHTML = '<b>Committed.</b> Both updates happened together. That is <b>atomicity</b>: all or nothing.';
          if (self.survivedCrash) self.bankDone = true;
          render(); if (self.onChange) self.onChange();
        }, true);
        else { step = 4; msg.className = 'rd-status'; msg.textContent = 'It worked this time — because nothing went wrong between step 1 and step 2. Try the power failure!'; render(); }
      }
      if (step === 4 || step > 0) B('Start over', function () { reset(); });
    }
    reset();
    return h('div', null, [
      h('p', { html: 'A <b>transaction</b> groups several changes so they happen <b>all together or not at all</b>. Banks, ticket sites and stores depend on this. Run the transfer, then pull the plug in the middle.' }),
      cards, controls, msg, logBox,
      h('details.small', null, [h('summary', { text: 'ACID: the four promises of a transaction' }), h('ul', null, [
        h('li', { html: '<b>Atomic</b> — all of it happens, or none of it does.' }),
        h('li', { html: '<b>Consistent</b> — every rule (keys, CHECKs) still holds afterwards.' }),
        h('li', { html: '<b>Isolated</b> — other people never see your half-finished work.' }),
        h('li', { html: '<b>Durable</b> — once COMMIT says done, it survives a crash.' })])]),
      h('h3', { text: 'Try it on the store data' }),
      this.console('BEGIN;\nDELETE FROM sales;\nSELECT COUNT(*) AS sales_left FROM sales;', 4),
      h('p.small.muted', { html: 'Run that, then run <code>ROLLBACK;</code> and count again.' })
    ]);
  };

  // ---------- 6. Where you will meet one ----------
  RdbmsView.prototype.secWhere = function () {
    var sys = [['PostgreSQL', 'Free and open source; used by Instagram, Reddit and many AI startups.'], ['MySQL', 'Runs a huge share of websites (WordPress, many online stores).'],
      ['Microsoft SQL Server', 'Common in schools, hospitals and businesses that use Microsoft tools.'], ['Oracle Database', 'Banks, airlines and very large companies.'],
      ['SQLite', 'A tiny database inside your phone, your browser and most apps. This practice database copies its style.']];
    return h('div', null, [
      h('div.rd-sys', null, sys.map(function (s) { return h('div.rd-syscard', null, [h('b', { text: s[0] }), h('span.small', { text: s[1] })]); })),
      h('div.rd-two', null, [
        h('div', null, [h('h3', { text: 'Spreadsheet or database?' }), h('table.cs-keys', null, [
          ['', 'Spreadsheet', 'RDBMS'], ['Best for', 'Quick analysis, one person', 'Shared, important data'], ['Rows', 'Up to about a million', 'Billions'],
          ['Bad data', 'Accepted silently', 'Refused by rules'], ['Many users at once', 'Messy', 'Built for it'], ['Undo', 'Ctrl+Z (just you)', 'Transactions / ROLLBACK']
        ].map(function (r, i) { return h('tr', null, r.map(function (x) { return h(i ? 'td' : 'th', { text: x }); })); }))]),
        h('div', null, [h('h3', { text: 'Why AI people care' }), h('ul', null, [
          h('li', { text: 'Most AI training data starts life in a database and is pulled out with SQL queries.' }),
          h('li', { text: 'Keys prevent duplicate rows, which can leak test answers into training data.' }),
          h('li', { text: 'Constraints stop garbage before it reaches the model — cleaning you never have to do.' }),
          h('li', { text: 'Joins combine tables into the single "feature table" a model learns from.' })])])
      ])
    ]);
  };
})(globalThis.SX = globalThis.SX || {});
