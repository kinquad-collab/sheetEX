#!/usr/bin/env node
// Builds ONE self-contained HTML file (no external requests) for Google Apps Script, Canvas, or any web host.
// Usage: node build.js
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const JS_ORDER = [
  'data.js', 'formula.js', 'engine.js', 'workbook.js', 'sql.js', 'platforms.js', 'csv.js', 'wrangle.js', 'challenges.js',
  'lessons.js', 'reference.js', 'ui-core.js', 'ui-sheet.js', 'ui-csv.js', 'ui-sql.js', 'ui-wrangle.js', 'ui-cert.js', 'ui-reference.js', 'main.js'
];

const css = fs.readFileSync(path.join(SRC, 'css', 'styles.css'), 'utf8');
const js = JS_ORDER.map((f) => '// ---- ' + f + ' ----\n' + fs.readFileSync(path.join(SRC, 'js', f), 'utf8')).join('\n');
if (/<\/script/i.test(js)) throw new Error('A source file contains "</script" which would break the inline build.');

const template = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const html = template.replace('/*INLINE_CSS*/', () => css).replace('/*INLINE_JS*/', () => js);

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html);
fs.writeFileSync(path.join(__dirname, 'apps-script', 'Index.html'), html);
console.log('Built dist/index.html and apps-script/Index.html (' + Math.round(html.length / 1024) + ' KB)');
