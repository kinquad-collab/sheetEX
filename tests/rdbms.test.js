// The practice database behaves like a real RDBMS: keys, constraints, types, transactions.
const test = require('node:test');
const assert = require('node:assert');
const SX = require('./load.js')();
const fresh = () => SX.sql.makeStoreDb();
const run = (db, q) => SX.sql.execute(db, q).pop();
const fails = (db, q, re) => assert.throws(() => run(db, q), (e) => re.test(e.message), q);

test('primary key must be unique and not null', () => {
  const db = fresh();
  fails(db, "INSERT INTO products VALUES ('SKU-101','Dup','Snacks',1,0.5,1,1,'X')", /^UNIQUE constraint failed: products\.sku$/);
  fails(db, "INSERT INTO products VALUES (NULL,'NoKey','Snacks',1,0.5,1,1,'X')", /^NOT NULL constraint failed: products\.sku$/);
  assert.strictEqual(run(db, 'SELECT COUNT(*) FROM products').rows[0][0], 24);
});
test('NOT NULL and CHECK rules', () => {
  const db = fresh();
  fails(db, "UPDATE stores SET city = NULL WHERE store_id = 'S01'", /^NOT NULL constraint failed: stores\.city$/);
  fails(db, "UPDATE products SET price = -1 WHERE sku = 'SKU-101'", /^CHECK constraint failed: price >= 0$/);
  fails(db, "INSERT INTO sales VALUES (9999,'2026-10-01','S01','SKU-101',0,'X')", /^CHECK constraint failed: qty > 0$/);
});
test('STRICT types refuse the wrong kind of value (a spreadsheet would not)', () => {
  const db = fresh();
  fails(db, "UPDATE products SET price = 'cheap' WHERE sku = 'SKU-101'", /^cannot store TEXT value in REAL column products\.price$/);
  fails(db, "UPDATE products SET in_stock = 2.5 WHERE sku = 'SKU-101'", /^cannot store REAL value in INTEGER column products\.in_stock$/);
  run(db, "UPDATE products SET in_stock = '12' WHERE sku = 'SKU-101'"); // numeric text converts
  assert.strictEqual(run(db, "SELECT in_stock FROM products WHERE sku = 'SKU-101'").rows[0][0], 12);
  run(db, "INSERT INTO raw_orders (order_id, qty) VALUES (1, 'anything goes')"); // loose table accepts it
});
test('foreign keys: no orphans, no deleting a parent that is still used', () => {
  const db = fresh();
  fails(db, "INSERT INTO sales VALUES (9999,'2026-10-01','S01','SKU-999',1,'X')", /^FOREIGN KEY constraint failed$/);
  fails(db, "INSERT INTO sales VALUES (9999,'2026-10-01','S09','SKU-101',1,'X')", /^FOREIGN KEY constraint failed$/);
  fails(db, "DELETE FROM stores WHERE store_id = 'S01'", /^FOREIGN KEY constraint failed$/);
  fails(db, "UPDATE products SET sku = 'SKU-000' WHERE sku = 'SKU-101'", /^FOREIGN KEY constraint failed$/);
  fails(db, 'DROP TABLE products', /^FOREIGN KEY constraint failed$/);
  run(db, "INSERT INTO sales VALUES (9999,'2026-10-01','S01','SKU-101',1,'X')");
  run(db, 'PRAGMA foreign_keys = OFF');
  run(db, "INSERT INTO sales VALUES (10000,'2026-10-01','S01','SKU-999',1,'X')"); // SQLite's default: not enforced
  assert.strictEqual(run(db, 'PRAGMA foreign_keys').rows[0][0], 0);
});
test('a failing statement changes nothing (atomic)', () => {
  const db = fresh();
  fails(db, 'UPDATE products SET in_stock = in_stock - 50', /CHECK constraint failed/);
  assert.strictEqual(run(db, "SELECT in_stock FROM products WHERE sku = 'SKU-101'").rows[0][0], 140);
});
test('transactions: BEGIN / ROLLBACK / COMMIT', () => {
  const db = fresh();
  run(db, 'BEGIN');
  run(db, "DELETE FROM sales WHERE store_id = 'S01'");
  assert.ok(run(db, 'SELECT COUNT(*) FROM sales').rows[0][0] < 60);
  run(db, 'ROLLBACK');
  assert.strictEqual(run(db, 'SELECT COUNT(*) FROM sales').rows[0][0], 60);
  run(db, 'BEGIN TRANSACTION; UPDATE products SET in_stock = 999 WHERE sku = \'SKU-101\'; COMMIT;');
  assert.strictEqual(run(db, "SELECT in_stock FROM products WHERE sku = 'SKU-101'").rows[0][0], 999);
  fails(db, 'COMMIT', /^cannot commit - no transaction is active$/);
  fails(db, 'ROLLBACK', /^cannot rollback - no transaction is active$/);
  run(db, 'BEGIN'); fails(db, 'BEGIN', /^cannot start a transaction within a transaction$/);
});
test('CREATE TABLE with keys, constraints, defaults, STRICT; INTEGER PRIMARY KEY numbers itself', () => {
  const db = fresh();
  run(db, `CREATE TABLE students (
    student_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    grade INTEGER CHECK (grade BETWEEN 9 AND 12),
    email TEXT UNIQUE,
    club TEXT DEFAULT 'none'
  ) STRICT;`);
  run(db, "INSERT INTO students (name, grade, email) VALUES ('Ana', 10, 'a@x.org'), ('Ben', 11, 'b@x.org')");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(run(db, 'SELECT student_id, club FROM students').rows)), [[1, 'none'], [2, 'none']]);
  fails(db, "INSERT INTO students (name, grade, email) VALUES ('Cy', 13, 'c@x.org')", /CHECK constraint failed: grade BETWEEN 9 AND 12/);
  fails(db, "INSERT INTO students (name, grade, email) VALUES ('Cy', 10, 'a@x.org')", /UNIQUE constraint failed: students\.email/);
  run(db, 'CREATE TABLE enroll (student_id INTEGER REFERENCES students(student_id), course TEXT NOT NULL, PRIMARY KEY (student_id, course))');
  run(db, "INSERT INTO enroll VALUES (1, 'AI'), (1, 'Math')");
  fails(db, "INSERT INTO enroll VALUES (1, 'AI')", /UNIQUE constraint failed: enroll\.student_id, enroll\.course/);
  fails(db, "INSERT INTO enroll VALUES (7, 'AI')", /FOREIGN KEY constraint failed/);
  const info = run(db, 'PRAGMA table_info(students)').rows;
  assert.strictEqual(info[0][5], 1); assert.strictEqual(info[1][3], 1);
  fails(db, 'CREATE TABLE bad (x VARCHAR) STRICT', /unknown datatype/);
  run(db, 'CREATE TABLE IF NOT EXISTS students (x TEXT)');
});
test('constraints survive save/load', () => {
  const db = SX.sql.Database.load(JSON.parse(JSON.stringify(fresh().serialize())));
  fails(db, "INSERT INTO sales VALUES (9999,'2026-10-01','S01','SKU-999',1,'X')", /FOREIGN KEY/);
  fails(db, "INSERT INTO products VALUES ('SKU-101','Dup','Snacks',1,0.5,1,1,'X')", /UNIQUE/);
});
