// Builds dist/teacher-guide.html (teacher-only: answer key, pacing, discussion). Called from build.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function buildTeacherGuide(root) {
  const ctx = { console }; ctx.globalThis = ctx; vm.createContext(ctx);
  ['data.js', 'formula.js', 'engine.js', 'workbook.js', 'sql.js', 'platforms.js', 'csv.js', 'wrangle.js', 'challenges.js', 'lessons.js', 'reference.js']
    .forEach((f) => vm.runInContext(fs.readFileSync(path.join(root, 'src', 'js', f), 'utf8'), ctx, { filename: f }));
  const SX = ctx.SX;
  const KEY = require('./solutions.js');
  const TALK = require('./discussion.js');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const strip = (h) => String(h).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

  function answer(ch) {
    if (ch.type === 'quiz') return '<b>Answer:</b> ' + esc(ch.options[ch.answer]);
    const k = KEY[ch.id]; if (!k) return '';
    let out = '';
    const steps = k.sheet || k.wr;
    if (steps) out += steps.map(([a, f, how]) => '<div class="ans"><span class="addr">' + esc(a) + (a.includes(':') ? ' <i>(type in the first cell, fill down)</i>' : '') + '</span><code>' + esc(f) + '</code>' + (how === 'cse' ? ' <i>Ctrl+Shift+Enter</i>' : '') + '</div>').join('');
    if (k.sql) out += '<div class="ans"><code>' + esc(k.sql) + '</code></div>';
    if (k.csv) out += '<div class="ans">' + esc(k.csv) + '</div>';
    if (k.alt) out += '<div class="alt">Also accepted: <code>' + esc(k.alt) + '</code></div>';
    if (k.needs) out += '<div class="alt">Needs earlier step(s): ' + k.needs.map(esc).join(', ') + '</div>';
    if (k.note) out += '<div class="note">' + esc(k.note) + '</div>';
    return out;
  }

  const lessons = SX.lessons.LIST;
  let totalMin = 0;
  const pace = lessons.map((L) => {
    const list = SX.challenges.forPlat(L.id), t = TALK[L.id] || {};
    totalMin += t.minutes || 0;
    return '<tr><td>' + L.n + '</td><td><b>' + esc(L.title) + '</b><br><span class="muted">' + esc(L.tool) + '</span></td><td>' + list.length + '</td><td>' +
      list.reduce((a, c) => a + c.xp, 0) + '</td><td>' + (t.minutes || '') + ' min</td></tr>';
  }).join('');

  const sections = lessons.map((L) => {
    const g = L.guide || {}, t = TALK[L.id] || {}, list = SX.challenges.forPlat(L.id);
    return '<section class="lesson"><h2>Lesson ' + L.n + ': ' + esc(L.title) + '</h2>' +
      '<p class="meta">Workspace: <b>' + esc(L.tool) + '</b> · ' + list.length + ' challenges · about ' + (t.minutes || '?') + ' minutes</p>' +
      '<p class="why">' + esc(g.why || '') + '</p>' +
      '<div class="cols"><div><h3>Students will be able to</h3><ul>' + L.skills.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul></div>' +
      '<div><h3>Common misconceptions</h3><ul>' + (g.traps || []).map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul></div></div>' +
      '<h3>Vocabulary</h3><table class="vocab">' + (g.terms || []).map((v) => '<tr><td><b>' + esc(v[0]) + '</b></td><td>' + esc(v[1]) + '</td><td><code>' + esc(v[2]) + '</code></td></tr>').join('') + '</table>' +
      '<h3>Challenges &amp; answer key</h3><table class="key"><tr><th>#</th><th>Challenge</th><th>Task</th><th>Answer</th></tr>' +
      list.map((ch, i) => '<tr><td>' + (i + 1) + '</td><td><b>' + esc(ch.title) + '</b><br><span class="muted">' + stars(ch.level) + ' · ' + ch.xp + ' XP</span></td><td>' + esc(strip(ch.task)) +
        '<div class="learn">Takeaway: ' + esc(strip(ch.learn)) + '</div></td><td>' + answer(ch) + '</td></tr>').join('') + '</table>' +
      '<div class="cols"><div><h3>Discussion</h3><ol>' + (t.discuss || []).map((q) => '<li>' + esc(q) + '</li>').join('') + '</ol></div>' +
      '<div><h3>Exit ticket</h3><p>' + esc(t.exit || '') + '</p><p class="muted">Answer: <code>' + esc(t.exitAnswer || '') + '</code></p></div></div></section>';
  }).join('');

  const diffs = SX.platforms.ORDER.map((p) => { const P = SX.platforms.PLATFORMS[p]; return '<h3>' + esc(P.name) + '</h3><ul>' + P.differences.map((d) => '<li>' + d + '</li>').join('') + '</ul>'; }).join('');
  const nCh = SX.challenges.LIST.length;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SheetEX Teacher Guide</title>
<style>
:root { --ink:#1f2328; --muted:#667085; --line:#e4e2dd; --accent:#f26b1d; --navy:#172033; }
body { font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: var(--ink); background: #f5f2ed; margin: 0; }
main { max-width: 1050px; margin: 0 auto; padding: 24px 18px 60px; }
.cover { background: linear-gradient(135deg, #1b2540, #2b3a63 60%, #8a3d16); color: #fff; border-radius: 16px; padding: 28px; }
.cover h1 { margin: 0 0 6px; font-size: 30px; } .cover p { margin: 4px 0; opacity: .9; }
section { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 18px 20px; margin-top: 18px; }
h2 { margin: 0 0 6px; font-size: 20px; } h3 { font-size: 14.5px; margin: 14px 0 6px; }
.muted, .meta { color: var(--muted); } .why { background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 8px 12px; border-radius: 0 8px 8px 0; }
table { width: 100%; border-collapse: collapse; font-size: 13px; } th { text-align: left; background: #f3f2ef; }
td, th { border-bottom: 1px solid #eee; padding: 6px; vertical-align: top; }
.key td:nth-child(3) { width: 38%; } .key td:nth-child(4) { width: 36%; }
code { font: 12px ui-monospace, Consolas, monospace; background: #f2f4f7; padding: 1px 4px; border-radius: 4px; word-break: break-word; }
.ans { margin-bottom: 4px; } .addr { display: block; font-size: 11.5px; color: var(--muted); }
.alt, .note, .learn { font-size: 12px; color: #475467; margin-top: 3px; } .note { color: #b45309; } .learn { color: #4c1d95; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; } ul, ol { margin: 4px 0; padding-left: 20px; }
.toc a { color: inherit; } .print { float: right; background: var(--accent); color: #fff; border: 0; border-radius: 8px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
@media (max-width: 760px) { .cols { grid-template-columns: 1fr; } }
@media print { body { background: #fff; } .print { display: none; } section { break-inside: auto; border: 0; padding: 0; } .lesson { break-before: page; } }
</style></head><body><main>
<div class="cover"><button class="print" onclick="window.print()">Print / Save PDF</button>
<h1>SheetEX v2 — Teacher Guide</h1>
<p>Data wrangling for AI across Excel 365, Excel 2013, Google Sheets, CSV/TSV and SQL.</p>
<p>${lessons.length} lessons · ${nCh} auto-checked challenges · about ${Math.round(totalMin / 50)} class periods (50 min) · certificates for every lesson</p>
<p style="font-size:12px;opacity:.75">Teacher-only: this guide contains the answer key. It is NOT part of the student app.</p></div>

<section><h2>How it runs</h2>
<ul>
<li><b>Students</b> open your Apps Script web-app link (embedded in Canvas). Progress saves in their browser automatically.</li>
<li><b>Certificates</b> unlock when every challenge in a lesson is done. Students print/save as PDF, download an image, or paste the certificate code into Canvas.</li>
<li><b>Gradebook</b> (Apps Script only): every certificate is recorded in the <i>SheetEX Gradebook</i> Google Sheet in your Drive. Run <code>setup</code> once in the script editor to get its link.</li>
<li><b>Checking codes:</b> in the app click <b>?</b> ▸ <i>For teachers</i> and paste all submitted codes at once.</li>
<li><b>Hints</b> cost 20% of a challenge's XP; a certificate shows hints used, so you can see independence at a glance.</li>
<li><b>Moving computers:</b> students use <i>Class cloud save</i> (name + PIN) or copy their progress code.</li>
</ul></section>

<section><h2>Suggested pacing</h2>
<table><tr><th>#</th><th>Lesson</th><th>Challenges</th><th>XP</th><th>Time</th></tr>${pace}</table>
<p class="muted">Lessons 1–4 can be done in any order. Lessons 5–6 (Data Wrangling) are the core of the AI-data unit — the 🤖 AI check tab shows students how their cleaning changes what a model learns. Lesson 8 makes a good review day.</p>
<p class="muted">Differentiation: early finishers can switch the Data Wrangling Lab engine (Excel 365 ⇄ Google Sheets) and redo it in the other app, or explore the Interactive Cheat Sheet's SQL column.</p></section>

${sections}

<section class="lesson"><h2>Appendix: what is different in each tool</h2>${diffs}</section>
<section><h2>Appendix: error codes</h2><table>${Object.keys(SX.f.ERR_TEXT).map((c) => '<tr><td><code>' + c + '</code></td><td>' + esc(SX.f.ERR_TEXT[c]) + '</td></tr>').join('')}</table></section>
</main></body></html>`;
  fs.writeFileSync(path.join(root, 'dist', 'teacher-guide.html'), html);
  return { lessons: lessons.length, challenges: nCh, bytes: html.length };
};
