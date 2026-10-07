// Every runnable example in the interactive cheat sheet must actually run.
const test = require('node:test');
const assert = require('node:assert');
const SX = require('./load.js')(['platforms.js', 'challenges.js', 'reference.js']);

for (const e of SX.reference.LIST) {
  test('cheat sheet: ' + e.task, () => {
    for (const t of SX.reference.TOOLS) {
      const c = SX.reference.cell(e, t.id);
      if (!c || !c.run) continue;
      const r = SX.reference.run(e, t.id);
      if (e.expectError && t.kind === 'sheet') { assert.ok(r.error, t.id + ' should show an error'); continue; }
      assert.ok(r && !r.error, t.id + ': ' + c.code + ' -> ' + (r && r.error));
    }
  });
}
