/* SheetEX — certification tests. A full-screen test with no hints and no cheat sheet. An attempt counts the moment it
 * starts (closing or reloading the page counts as a failed attempt), a failed attempt has a short cooldown, and the
 * certificate records the score and the attempt number. */
(function (SX) {
  'use strict';
  var UI = SX.ui, h = UI.h, CT = SX.certtest, L = SX.lessons;
  var BANK = SX.TESTBANK || {};

  function tstate(id) {
    UI.state.tests = UI.state.tests || {};
    return UI.state.tests[id] || (UI.state.tests[id] = { attempts: 0, best: 0, of: CT.SIZE, passed: 0, secs: 0, open: 0, lastFail: 0 });
  }
  function cooldownLeft(t) { return t.passed ? 0 : Math.max(0, Math.ceil((t.lastFail + CT.COOLDOWN * 1000 - Date.now()) / 1000)); }
  function mmss(s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function platName(p) { return SX.platforms.PLATFORMS[p] ? SX.platforms.PLATFORMS[p].name : p; }

  UI.testBank = function (id) { return BANK[id] || []; };

  UI.startTest = function (id) {
    var lesson = L.byId(id);
    if (!lesson) return;
    if (!UI.lessonComplete(id)) { UI.toast('Not yet', 'Finish every practice challenge in this lesson first.'); return; }
    if (UI.lessonCertified(id)) { UI.showCert(id); return; }
    var t = tstate(id);
    if (t.open) { t.lastFail = t.open; t.open = 0; UI.saveNow(); } // an attempt that was closed without submitting
    var wait = cooldownLeft(t);
    if (wait) { UI.toast('Review time', 'You can retake the test in ' + mmss(wait) + '. Use it to review the lesson guide and your practice challenges.'); return; }
    var bank = UI.testBank(id), n = Math.min(CT.SIZE, bank.length);
    UI.modal('📝 Certification test — Lesson ' + lesson.n, [
      h('p', { html: '<b>' + UI.esc(lesson.title) + '</b>' }),
      h('ul', null, [
        h('li', { html: '<b>' + n + ' questions</b> drawn at random. You need <b>' + CT.needed(n) + ' correct</b> (' + Math.round(CT.PASS * 100) + '%) to earn the certificate.' }),
        h('li', { html: '<b>No hints, no cheat sheet.</b> Hands-on questions run your formula or query just like the real app, so you can see what it returns before you move on.' }),
        h('li', { html: 'Your attempt counts as soon as you start. Leaving or reloading the page counts as a failed attempt. After a failed attempt there is a ' + Math.round(CT.COOLDOWN / 60) + '-minute review break.' }),
        h('li', { html: 'Your certificate shows your score and which attempt you passed on.' + (t.attempts ? ' <b>This will be attempt ' + (t.attempts + 1) + '.</b>' : '') })
      ])
    ], [{ text: 'Not yet' }, { text: 'Start the test', primary: true, onclick: function () { setTimeout(function () { run(id); }, 30); } }], { cls: 'wide' });
  };

  // ---------- previews of the data a question uses ----------
  function sheetPreview(spec, plat, book) {
    var wb = CT.book(book || 'store', plat || 'xl365', 0), F = SX.f;
    var m = /^([A-Z]+):([A-Z]+)$/.exec(spec.cols), c1 = F.colToIdx(m[1]), c2 = F.colToIdx(m[2]);
    var head = [h('th', { text: '' })];
    for (var c = c1; c <= c2; c++) head.push(h('th', { text: F.idxToCol(c) }));
    var rows = [h('tr', null, head)];
    for (var r = 0; r <= spec.rows; r++) {
      var tds = [h('th', { text: String(r + 1) })];
      for (c = c1; c <= c2; c++) { var d = wb.display(spec.sheet, r, c); tds.push(h('td' + (r === 0 ? '.hdr' : ''), { text: d && typeof d === 'object' ? String(d.text) : String(d == null ? '' : d) })); }
      rows.push(h('tr', null, tds));
    }
    rows.push(h('tr', null, [h('th', { text: '⋮' }), h('td.more', { colspan: c2 - c1 + 1, text: '… rows continue to row ' + spec.last })]));
    return h('div.tq-sheet', null, [h('div.tq-sheet-name', { text: spec.sheet }), h('div.tq-scroll', null, h('table.tq-grid', null, rows))]);
  }
  var schemaDb = null;
  function schema(names) {
    schemaDb = schemaDb || SX.sql.makeStoreDb();
    return h('div.tq-schema', null, names.map(function (n) {
      var t = schemaDb.tables[n];
      return h('div.tq-table', null, [h('b', { text: n }), h('span.small', { text: ' (' + t.cols.map(function (c) { return c.name; }).join(', ') + ')' })]);
    }));
  }
  function resultPreview(p) {
    if (!p) return null;
    if (p.error) return h('div.tq-out.bad', { text: p.error });
    if (p.grid) {
      var g = p.grid.slice(0, 8);
      return h('div.tq-out', null, [h('div.small.muted', { text: p.fill ? 'Your formula in the first rows:' : 'Your formula returns:' }),
        h('table.tq-grid.res', null, g.map(function (row) { return h('tr', null, row.slice(0, 6).map(function (v) { return h('td', { text: v === '' ? ' ' : v }); })); })),
        p.grid.length > 8 ? h('div.small.muted', { text: '… ' + p.grid.length + ' rows in total' }) : null,
        p.errMsg ? h('div.small.bad', { text: p.errMsg }) : null]);
    }
    if (p.columns) {
      return h('div.tq-out', null, [h('table.tq-grid.res', null, [h('tr', null, p.columns.map(function (c) { return h('th', { text: c }); }))].concat(
        p.rows.map(function (r) { return h('tr', null, r.map(function (v) { return h('td', { text: v === '' ? 'NULL' : v }); })); }))),
        h('div.small.muted', { text: p.total + ' row' + (p.total === 1 ? '' : 's') })]);
    }
    if (p.fields) {
      return h('div.tq-out', null, [h('div.small.muted', { text: 'A program reading your file sees these fields:' }),
        h('table.tq-grid.res', null, p.fields.map(function (r) { return h('tr', null, r.map(function (v) { return h('td', { text: v === '' ? '(empty)' : v }); })); }))]);
    }
    if (p.msg != null) return h('div.tq-out', { text: '✓ Ran. ' + p.msg });
    return null;
  }

  // ---------- the test itself ----------
  function run(id) {
    var lesson = L.byId(id), t = tstate(id);
    var qs = CT.draw(UI.testBank(id)), answers = qs.map(function () { return { text: '', cse: false }; });
    var started = Date.now(), cur = 0;
    t.attempts++; t.open = started; t.of = qs.length; UI.saveNow();
    document.querySelectorAll('.modal-overlay, #cert-overlay').forEach(function (m) { m.remove(); }); // the test takes over the screen

    var overlay = h('div.test-overlay#test-overlay', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Certification test' });
    var dots = h('div.tq-dots'), body = h('div.tq-body'), timer = h('span.tq-timer'), foot = h('div.tq-foot');
    overlay.appendChild(h('div.tq-wrap', null, [
      h('div.tq-head', null, [h('div', null, [h('div.tq-kicker', { text: 'Certification test · Lesson ' + lesson.n + ' · attempt ' + t.attempts }), h('div.tq-title', { text: lesson.title })]),
        h('div.tq-right', null, [h('span.tq-nohint', { text: 'No hints' }), timer])]),
      dots, body, foot]));
    document.body.appendChild(overlay);
    document.body.classList.add('testing');
    var tick = setInterval(function () { timer.textContent = '⏱ ' + mmss(Math.floor((Date.now() - started) / 1000)); }, 1000);
    timer.textContent = '⏱ 0:00';

    var counter = h('span.small.muted');
    function answered(i) { return String(answers[i].text || '').trim() !== ''; }
    function drawDots() {
      counter.textContent = answers.filter(function (x, i) { return answered(i); }).length + ' of ' + qs.length + ' answered';
      dots.innerHTML = '';
      qs.forEach(function (q, i) {
        dots.appendChild(h('button.tq-dot' + (i === cur ? '.on' : '') + (answered(i) ? '.done' : ''), { text: String(i + 1), 'aria-label': 'Question ' + (i + 1), onclick: function () { cur = i; show(); } }));
      });
    }
    function show() {
      drawDots();
      var q = qs[cur], a = answers[cur];
      body.innerHTML = '';
      body.appendChild(h('div.tq-qhead', null, [h('span.tq-qn', { text: 'Question ' + (cur + 1) + ' of ' + qs.length }),
        q.plat ? h('span.tq-plat.pc-' + q.plat, { text: platName(q.plat) }) : null,
        CT.isHandsOn(q) ? h('span.tq-kind', { text: 'hands-on' }) : null]));
      body.appendChild(h('div.tq-q', { html: q.q }));
      var out = h('div.tq-outbox');
      function preview() { out.innerHTML = ''; var e = CT.evaluate(q, a); var pv = resultPreview(e.preview); if (pv) out.appendChild(pv); }
      if (q.kind === 'mc') {
        body.appendChild(h('div.tq-opts', null, q.opts.map(function (o) {
          return h('button.tq-opt' + (a.text === o ? '.sel' : ''), { html: UI.esc(o), onclick: function () { a.text = o; show(); } });
        })));
      } else if (q.kind === 'text') {
        var ti = h('input.input.tq-input', { value: a.text, placeholder: 'Type your answer', 'aria-label': 'Answer' });
        ti.addEventListener('input', function () { a.text = ti.value; drawDots(); });
        ti.addEventListener('keydown', function (e) { if (e.key === 'Enter') next(); });
        body.appendChild(ti); setTimeout(function () { ti.focus(); }, 30);
      } else if (q.kind === 'formula') {
        (q.show || []).forEach(function (s) { body.appendChild(sheetPreview(s, q.plat, q.book)); });
        var where = (q.sheet || 'Scratch') + '!' + q.at + (q.fill ? ' (filled down to row ' + q.fill + ')' : '');
        var cseMark = h('span.tq-cse', { text: a.cse ? 'array formula { }' : '' });
        var fi = h('input.input.tq-formula', { spellcheck: 'false', 'aria-label': 'Formula', autocomplete: 'off', placeholder: '=' });
        fi.value = a.text || '';
        fi.addEventListener('input', function () { a.text = fi.value; a.cse = false; cseMark.textContent = ''; drawDots(); });
        fi.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            a.cse = !!(e.ctrlKey && e.shiftKey && q.plat === 'xl2013');
            cseMark.textContent = a.cse ? 'array formula { }' : '';
            preview();
          }
        });
        body.appendChild(h('div.tq-cell', null, [h('span.tq-addr', { text: where }), fi, cseMark]));
        body.appendChild(h('div.row', null, [h('button.btn.btn-sm', { text: '▶ Run (Enter)', onclick: function () { a.cse = false; cseMark.textContent = ''; preview(); } }),
          q.plat === 'xl2013' ? h('span.small.muted', { text: 'Just like Excel 2013: Enter enters a normal formula, Ctrl+Shift+Enter enters an array formula.' }) : null]));
        body.appendChild(out);
        setTimeout(function () { fi.focus(); fi.setSelectionRange(fi.value.length, fi.value.length); }, 30);
        if (a.text) preview();
      } else {
        if (q.show) body.appendChild(schema(q.show));
        var ta = h('textarea.input.tq-code' + (q.kind === 'csv' ? '.csv' : ''), { rows: q.kind === 'csv' ? 3 : 4, spellcheck: 'false', 'aria-label': 'Answer', placeholder: q.kind === 'csv' ? 'Type the file contents' : 'Type your SQL' });
        ta.value = a.text;
        ta.addEventListener('input', function () { a.text = ta.value; drawDots(); });
        ta.addEventListener('keydown', function (e) {
          if (q.kind === 'csv' && e.key === 'Tab') { e.preventDefault(); var st = ta.selectionStart; ta.value = ta.value.slice(0, st) + '\t' + ta.value.slice(ta.selectionEnd); ta.selectionStart = ta.selectionEnd = st + 1; a.text = ta.value; }
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); preview(); }
        });
        body.appendChild(ta);
        body.appendChild(h('div.row', null, [h('button.btn.btn-sm', { text: q.kind === 'csv' ? '▶ Read it like a program would (Ctrl+Enter)' : '▶ Run (Ctrl+Enter)', onclick: preview })]));
        body.appendChild(out);
        setTimeout(function () { ta.focus(); }, 30);
        if (a.text) preview();
      }
      foot.innerHTML = '';
      foot.appendChild(h('button.btn', { text: '← Back', disabled: cur === 0, onclick: function () { cur--; show(); } }));
      foot.appendChild(counter);
      if (cur < qs.length - 1) foot.appendChild(h('button.btn.btn-primary', { text: 'Next →', onclick: next }));
      foot.appendChild(h('button.btn' + (cur === qs.length - 1 ? '.btn-primary' : ''), { text: 'Finish & submit', onclick: submit }));
    }
    function next() { if (cur < qs.length - 1) { cur++; show(); } }
    function close() { clearInterval(tick); overlay.remove(); document.body.classList.remove('testing'); }
    function submit() {
      var blank = qs.filter(function (q, i) { return !answered(i); }).length;
      if (blank) {
        UI.modal('Submit with ' + blank + ' unanswered?', [h('p', { text: 'Unanswered questions count as wrong.' })],
          [{ text: 'Keep working' }, { text: 'Submit anyway', primary: true, onclick: function () { setTimeout(grade, 30); } }]);
        return;
      }
      grade();
    }
    function grade() {
      var results = qs.map(function (q, i) { return answered(i) && CT.isCorrect(q, answers[i]); });
      var score = results.filter(Boolean).length, need = CT.needed(qs.length), pass = score >= need;
      var secs = Math.min(86400, Math.round((Date.now() - started) / 1000));
      t.open = 0;
      if (score / qs.length > t.best / Math.max(1, t.of) || !t.best) { t.best = score; t.of = qs.length; t.secs = secs; }
      if (pass) {
        t.passed = Date.now(); t.passScore = score; t.passAttempt = t.attempts; t.passSecs = secs; t.best = Math.max(t.best, score);
      } else t.lastFail = Date.now();
      UI.saveNow();
      close();
      if (pass) {
        UI.issueCert(id);
        UI.badge('certified');
        if (score === qs.length) UI.badge('ace');
        if (L.LIST.filter(function (l) { return UI.lessonCertified(l.id); }).length >= 5) UI.badge('cert-5');
        UI.addXP(50, 'Passed the Lesson ' + lesson.n + ' test');
        window.confettiBurst(140);
      }
      UI.saveNow();
      var missed = [];
      qs.forEach(function (q, i) { if (!results[i] && missed.indexOf(q.topic) < 0) missed.push(q.topic); });
      UI.modal(pass ? '🎓 Passed! ' + score + ' / ' + qs.length : 'Not yet: ' + score + ' / ' + qs.length, [
        h('div.tq-score' + (pass ? '.pass' : '.fail'), null, [h('b', { text: Math.round(100 * score / qs.length) + '%' }), h('span', { text: pass ? 'You earned the Lesson ' + lesson.n + ' certificate.' : 'You need ' + need + ' correct to pass.' })]),
        h('div.tq-review', null, qs.map(function (q, i) { return h('div.tq-rv' + (results[i] ? '.ok' : '.no'), { text: (results[i] ? '✓ ' : '✗ ') + (i + 1) + '. ' + q.topic }); })),
        missed.length ? h('p', { html: '<b>Review before your next attempt:</b> ' + missed.map(UI.esc).join(', ') + '. (Answers are not shown, so the test stays fair.)' }) : null,
        pass ? null : h('p.small', { text: 'Your next attempt opens in ' + Math.round(CT.COOLDOWN / 60) + ' minutes and draws a new mix of questions. Re-read the lesson guide and redo a practice challenge on each topic you missed.' })
      ], pass ? [{ text: 'Later' }, { text: 'View my certificate', primary: true, onclick: function () { setTimeout(function () { UI.showCert(id); }, 30); } }]
        : [{ text: 'Open the lesson guide', onclick: function () { setTimeout(function () { UI.showGuide(id); }, 30); } }, { text: 'Back to practice', primary: true }], { cls: 'wide' });
      if (UI.current === 'home') UI.render();
      UI.refreshHeader();
    }
    show();
  }
})(globalThis.SX = globalThis.SX || {});
