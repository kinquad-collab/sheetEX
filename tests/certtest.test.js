// Certification tests: every reference answer is accepted, equivalent answers are accepted, and the usual ways of
// faking an answer are rejected.
const test = require('node:test');
const assert = require('node:assert');
const SX = require('./load.js')(['certtest.js', 'platforms.js', 'challenges.js', 'lessons.js']);
const BANK = require('../src/teacher/bank.js');
const built = require('../src/teacher/bankbuild.js')(SX, BANK);
const CT = SX.certtest;
const ship = {}; Object.values(built.bank).flat().forEach((q) => { ship[q.id] = q; });
const ok = (id, text, cse) => CT.isCorrect(ship[id], { text, cse: !!cse });

test('the bank builds with no problems, and every lesson has a bank big enough for a test', () => {
  assert.deepStrictEqual(built.problems, []);
  for (const L of SX.lessons.LIST) {
    const b = built.bank[L.id];
    assert.ok(b && b.length >= 12, L.id + ' needs at least 12 questions');
    assert.ok(b.filter(CT.isHandsOn).length >= 5, L.id + ' needs at least 5 hands-on questions');
  }
});
test('the shipped bank contains no answers', () => {
  const json = JSON.stringify(built.bank);
  assert.ok(!/"(a|ref|fields|cse)":/.test(json));
  for (const qs of Object.values(BANK)) for (const q of qs) if (q.ref) assert.ok(!json.includes(JSON.stringify(q.ref).slice(1, -1)) || q.kind === 'probe' && false, q.id + ' reference answer shipped');
});
test('draw: right size, half hands-on, shuffled options, pass mark', () => {
  for (const L of SX.lessons.LIST) {
    const t = CT.draw(built.bank[L.id]);
    assert.strictEqual(t.length, CT.SIZE);
    assert.strictEqual(t.filter(CT.isHandsOn).length, CT.SIZE / 2);
    assert.strictEqual(new Set(t.map((q) => q.id)).size, t.length);
  }
  assert.strictEqual(CT.needed(10), 8);
});

test('equivalent answers are accepted', () => {
  assert.ok(ok('x1-xlookup', '=INDEX(Products!D2:D25,MATCH("SKU-404",Products!A2:A25,0))'));
  assert.ok(ok('x1-xlookup', '=VLOOKUP("SKU-404",Products!A2:H25,4,FALSE)'));
  assert.ok(ok('x1-sum', '=SUM(Products!F:F)'));
  assert.ok(ok('x1-sum', '=sum(products!f2:f25)'), 'lower case');
  assert.ok(ok('x1-countif', '=COUNTIFS(Products!D2:D25,">10")'));
  assert.ok(ok('x2-cse', '=MAX(IF(Sales!C2:C61="S03",Sales!E2:E61))', true));
  assert.ok(ok('x2-cse', '=SUMPRODUCT(MAX((Sales!C2:C61="S03")*Sales!E2:E61))'));
  assert.ok(ok('x2-join', '=CONCATENATE(B2,", ",C2)'));
  assert.ok(ok('w1-code', '=RIGHT("0000"&TRIM(C2),4)'));
  assert.ok(ok('w2-vlookup', '=INDEX(ItemCodes!$B$2:$B$25,MATCH(TEXT(C2,"0000"),ItemCodes!$A$2:$A$25,0))'));
  assert.ok(ok('s-where', "select price, product from products where category='Electronics'"), 'column order does not matter');
});
test('silent cross-app differences are graded like the real app', () => {
  assert.ok(!ok('x2-indexmatch', '=XLOOKUP("SKU-404",Products!A2:A25,Products!D2:D25)'), 'XLOOKUP is #NAME? in Excel 2013');
  assert.ok(!ok('x2-cse', '=MAX(IF(Sales!C2:C61="S03",Sales!E2:E61))', false), 'without Ctrl+Shift+Enter Excel 2013 gets it wrong');
  assert.ok(!ok('g-sort', '=SORT(Products!B2:D25,3,-1)'), '-1 sorts ascending in Sheets');
  assert.ok(!ok('x2-join', '=CONCAT(B2,", ",C2)'), 'CONCAT is not in Excel 2013');
  assert.ok(!ok('g-concat', '=CONCAT(B2,", ",C2)'), 'Sheets CONCAT takes 2 values');
  assert.ok(!ok('w2-vlookup', '=VLOOKUP(C2,ItemCodes!$A$2:$D$25,2,FALSE)'), 'number 104 never matches text "0104"');
  assert.ok(!ok('s-avg', 'SELECT SUM(qty)/COUNT(*) FROM sales;'), 'integer division');
});
test('faked answers are rejected', () => {
  const sum = SX.data.PRODUCTS.reduce((a, p) => a + p[5], 0);
  assert.ok(!ok('x1-sum', '=' + sum), 'typed constant');
  assert.ok(!ok('x1-sum', String(sum)), 'not even a formula');
  assert.ok(!ok('x1-xlookup', '=12.49'), 'typed constant');
  assert.ok(!ok('x1-xlookup', '=Products!D21'), 'pointing at the one cell that holds the answer');
  assert.ok(!ok('x2-vlookup', '=Products!B9'), 'pointing at the cell');
  assert.ok(!ok('x1-value', '=21'), 'a fill-down question cannot be faked by one value');
  assert.ok(!ok('w1-blank', '=4'));
  assert.ok(!ok('s-avg', 'SELECT 4.733333333333333;'), 'SQL constant');
  assert.ok(!ok('m-nulls', 'SELECT 6;'), 'SQL constant');
  assert.ok(!ok('m-nulls', 'SELECT 6 FROM ml_examples LIMIT 1;'), 'SQL constant with a FROM');
  assert.ok(!ok('s-where', 'DELETE FROM products;'), 'only a SELECT counts');
});
test('CSV answers must be valid CSV', () => {
  assert.ok(ok('c-comma', 'SKU-302,"Gel Pens, 4-pack",4.5'));
  assert.ok(ok('c-comma', '"SKU-302","Gel Pens, 4-pack","4.5"'), 'extra quotes are allowed');
  assert.ok(!ok('c-comma', 'SKU-302,Gel Pens, 4-pack,4.5'));
  assert.ok(ok('c-quote', 'SKU-307,"12"" Ruler",1.99'));
  assert.ok(!ok('c-quote', 'SKU-307,12" Ruler,1.99'));
  assert.ok(!ok('c-quote', 'SKU-307,"12" Ruler",1.99'));
  assert.ok(ok('c-tsv', 'Gel Pens, 4-pack\t4.5'));
  assert.ok(!ok('c-tsv', '"Gel Pens, 4-pack",4.5'));
});
test('DDL questions are graded by behavior', () => {
  assert.ok(ok('r-clubs', 'create table clubs (club_id integer primary key, name text not null)'));
  assert.ok(!ok('r-clubs', 'CREATE TABLE clubs (club_id INTEGER PRIMARY KEY, name TEXT);'), 'missing NOT NULL');
  assert.ok(!ok('r-clubs', 'CREATE TABLE clubs (club_id INTEGER, name TEXT NOT NULL);'), 'missing PRIMARY KEY');
  assert.ok(ok('r-check', 'CREATE TABLE grades (student TEXT NOT NULL, score INTEGER CHECK (score BETWEEN 0 AND 100));'));
  assert.ok(!ok('r-check', 'CREATE TABLE grades (student TEXT NOT NULL, score INTEGER CHECK (score > 0 AND score < 100));'), 'off by one');
  assert.ok(!ok('r-members', 'CREATE TABLE clubs (club_id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE members (member_id INTEGER PRIMARY KEY, name TEXT, club_id INTEGER);'), 'no foreign key');
  assert.ok(!ok('r-tx', "UPDATE products SET price = price * 1.1 WHERE category = 'Snacks';"), 'must use a transaction');
  assert.ok(!ok('r-tx', "BEGIN; UPDATE products SET price = price * 1.1 WHERE category = 'Snacks';"), 'never committed');
  assert.ok(!ok('m-trainset', "CREATE TABLE train_set AS SELECT * FROM ml_examples WHERE split = 'train';"), 'keeps the leaky column, no category');
});
test('short answers are forgiving about case, spaces and a trailing period', () => {
  assert.ok(ok('w1-trim', ' s02. '));
  assert.ok(ok('m-acc18', '75%'));
  assert.ok(ok('x2-match', '3'));
  assert.ok(!ok('x2-match', '4'));
});
