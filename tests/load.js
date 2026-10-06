// Loads the browser source files into a Node context for testing.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ORDER = ['data.js', 'formula.js', 'engine.js', 'workbook.js', 'sql.js'];
module.exports = function load(extra) {
  const ctx = { console };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ORDER.concat(extra || []).forEach((f) => {
    const file = path.join(__dirname, '..', 'src', 'js', f);
    vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  });
  return ctx.SX;
};
