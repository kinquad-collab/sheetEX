/* SheetEX v2 — lesson guides and certificates. Nothing here leaves the browser. */
(function (SX) {
  'use strict';
  var UI = SX.ui, h = UI.h, L = SX.lessons;

  // ---------- Lessons ----------
  UI.lessonProgress = function (id) { return UI.platProgress(id); };
  UI.lessonComplete = function (id) { var p = UI.platProgress(id); return p.total > 0 && p.done === p.total; };

  // A certificate needs every practice challenge done AND the certification test passed.
  UI.lessonCertified = function (id) { var t = UI.state.tests && UI.state.tests[id]; return UI.lessonComplete(id) && !!(t && t.passed); };

  UI.issueCert = function (id) {
    var list = SX.challenges.forPlat(id), pr = UI.platProgress(id), t = UI.state.tests[id];
    var hints = list.reduce(function (a, c) { return a + (UI.state.done[c.id] ? UI.state.done[c.id].hints || 0 : 0); }, 0);
    var cert = { name: UI.state.name, sid: UI.state.sid, lesson: id, xp: pr.xp, maxXp: pr.maxXp, hints: hints, count: pr.total,
      score: t.passScore != null ? t.passScore : t.best, of: t.of, attempts: t.passAttempt || t.attempts || 1,
      secs: t.passSecs != null ? t.passSecs : t.secs || 0, time: t.passed };
    UI.state.certs = UI.state.certs || {};
    UI.state.certs[id] = { code: L.certCode(cert), t: cert.time };
    UI.saveNow();
    return cert;
  };

  UI.lessonFinished = function (id) {
    var lesson = L.byId(id); if (!lesson) return;
    // Shown when the screen is free, and never once a test has been started (it would only get in the way).
    function started() { var t = UI.state.tests && UI.state.tests[id]; return UI.lessonCertified(id) || !!(t && t.attempts) || !!document.querySelector('.test-overlay'); }
    function show() {
      if (started()) return;
      if (document.querySelector('.modal-overlay, #cert-overlay')) { setTimeout(show, 700); return; }
      window.confettiBurst(120);
      UI.modal('Practice complete: Lesson ' + lesson.n, [
        h('div.levelup', null, [h('div.levelup-title', { text: lesson.title }),
          h('p', { text: 'You finished every practice challenge. One step left: pass the certification test to earn your certificate.' }),
          h('p.small', { text: 'The test has no hints and no cheat sheet. Take a minute to review first if you need to.' })])
      ], [{ text: 'Later' }, { text: 'Take the test', primary: true, onclick: function () { setTimeout(function () { UI.startTest(id); }, 50); } }]);
    }
    show();
  };

  // ---------- Lesson guide ----------
  UI.showGuide = function (id) {
    var lesson = L.byId(id); if (!lesson || !lesson.guide) return;
    var g = lesson.guide;
    UI.state.ui.guideSeen = UI.state.ui.guideSeen || {}; UI.state.ui.guideSeen[id] = true; UI.save();
    UI.modal('📖 Lesson ' + lesson.n + ': ' + lesson.title, [
      h('p.guide-why', { text: g.why }),
      h('h3', { text: 'Key ideas' }),
      h('table.cs-keys.guide-terms', null, g.terms.map(function (t) { return h('tr', null, [h('td', null, h('b', { text: t[0] })), h('td', null, [t[1], h('div', null, h('code', { text: t[2] }))])]); })),
      h('h3', { text: 'Watch out for' }),
      h('ul.guide-traps', null, g.traps.map(function (t) { return h('li', { text: t }); })),
      h('h3', { text: 'You will practice' }),
      h('ul.cert-skills.guide-skills', null, lesson.skills.map(function (s) { return h('li', { text: s }); })),
      h('p.small.muted', { text: 'Practice challenges have hints whenever you get stuck. To earn the certificate, pass the certification test at the end — no hints there.' })
    ], [{ text: 'Start the challenges', primary: true }], { cls: 'wide' });
  };
  UI.maybeGuide = function (ids) {
    var seen = UI.state.ui.guideSeen || {};
    var next = ids.filter(function (id) { return !seen[id] && !UI.lessonComplete(id); })[0];
    if (next && !document.querySelector('.modal-overlay')) setTimeout(function () { if (!document.querySelector('.modal-overlay')) UI.showGuide(next); }, 300);
  };

  UI.showCert = function (id) {
    if (!UI.lessonComplete(id)) { UI.toast('Not yet!', 'Finish every practice challenge, then pass the certification test.'); return; }
    if (!UI.lessonCertified(id)) { UI.startTest(id); return; }
    var saved = UI.state.certs && UI.state.certs[id];
    var r = saved && L.readCert(saved.code);
    if (!r || !r.ok || r.cert.name !== UI.state.name) { UI.issueCert(id); saved = UI.state.certs[id]; r = L.readCert(saved.code); }
    render(id, r.cert, saved);
  };

  function fmtDate(t) { return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }

  function render(id, c, saved) {
    var lesson = L.byId(id);
    var overlay = h('div.cert-overlay#cert-overlay');
    var close = function () { overlay.remove(); };
    var paper = h('div.cert-paper', null, [
      h('div.cert-inner', null, [
        h('div.cert-brand', null, [h('span.brand-logo', { text: 'SX' }), h('span', { text: 'SheetEX Data Lab · ' + SX.data.COMPANY })]),
        h('div.cert-kicker', { text: 'Certificate of Completion' }),
        h('div.cert-small', { text: 'This certifies that' }),
        h('div.cert-name', { text: c.name }),
        h('div.cert-small', { text: 'has completed' }),
        h('div.cert-lesson', { text: 'Lesson ' + lesson.n + ': ' + lesson.title }),
        h('div.cert-tool', { text: lesson.tool }),
        h('ul.cert-skills', null, lesson.skills.map(function (s) { return h('li', { text: s }); })),
        h('div.cert-stats', null, [
          stat(c.score + ' / ' + c.of, 'certification test'), stat(c.count, 'practice challenges'), stat(c.hints, c.hints === 1 ? 'hint in practice' : 'hints in practice')
        ]),
        h('div.cert-foot', null, [
          h('div', null, [h('div.cert-line'), h('div.cert-small', { text: 'Date: ' + fmtDate(c.time) })]),
          h('div.cert-seal', { text: '★' }),
          h('div', null, [h('div.cert-line'), h('div.cert-small', { text: 'Instructor' })])
        ]),
        h('div.cert-verify', { text: 'Verification ID ' + SX.seal.printId(c.name, c.lesson) + ' · test attempt ' + c.attempts + ' · teachers: SheetEX ▸ ? ▸ For teachers' })
      ])
    ]);
    var codeBox = h('textarea.input.code-box', { readonly: true, rows: 2 }, saved.code);
    var imgHolder = h('div');
    var bar = h('div.cert-bar', null, [
      h('button.btn.btn-primary', { text: '🖨 Print / Save as PDF', onclick: function () { printCert(); } }),
      h('button.btn', { text: '⬇ Download image', onclick: function () { downloadPng(c, lesson, saved.code, imgHolder); } }),
      h('button.btn', { text: '📋 Copy certificate code', onclick: function () { codeBox.select(); UI.copyText(saved.code); UI.toast('Copied', 'Paste the code into your Canvas assignment.'); } }),
      h('button.btn', { text: 'Close', onclick: close })
    ]);
    overlay.appendChild(h('div.cert-wrap', null, [bar, paper,
      h('div.cert-howto', null, [h('b', { text: 'Turning it in: ' }), 'print it (choose "Save as PDF"), download the image, or paste this code into Canvas:', codeBox, imgHolder])]));
    overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    document.body.appendChild(overlay);
    overlay.tabIndex = -1; overlay.focus();
  }
  function stat(v, l) { return h('div.cert-stat', null, [h('b', { text: String(v) }), h('span', { text: l })]); }

  function printCert() {
    document.body.classList.add('print-cert');
    var done = function () { document.body.classList.remove('print-cert'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    try { window.print(); } catch (e) { UI.toast('Printing is blocked here', 'Use Download image or the certificate code instead.', 'err'); }
    setTimeout(done, 1500);
  }

  // Draw the certificate onto a canvas so it can be saved as a PNG (works offline, no libraries)
  function downloadPng(c, lesson, code, holder) {
    var W = 1600, H = 1130, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var g = cv.getContext('2d');
    g.fillStyle = '#fffdf8'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#172033'; g.lineWidth = 14; g.strokeRect(40, 40, W - 80, H - 80);
    g.strokeStyle = '#f26b1d'; g.lineWidth = 3; g.strokeRect(70, 70, W - 140, H - 140);
    g.textAlign = 'center'; g.fillStyle = '#172033';
    function t(s, y, font, color) { g.font = font; g.fillStyle = color || '#172033'; g.fillText(s, W / 2, y); }
    t('SheetEX Data Lab · ' + SX.data.COMPANY, 150, '600 26px Arial');
    t('CERTIFICATE OF COMPLETION', 240, 'bold 58px Georgia, serif', '#b4470e');
    t('This certifies that', 315, 'italic 28px Georgia, serif', '#475467');
    t(c.name, 410, 'bold 72px Georgia, serif');
    g.fillStyle = '#f26b1d'; g.fillRect(W / 2 - 300, 440, 600, 3);
    t('has completed', 500, 'italic 28px Georgia, serif', '#475467');
    t('Lesson ' + lesson.n + ': ' + lesson.title, 570, 'bold 42px Arial');
    t(lesson.tool, 618, '28px Arial', '#667085');
    t(lesson.skills.join('  •  '), 680, '22px Arial', '#344054');
    t('Certification test ' + c.score + ' / ' + c.of + '   •   ' + c.count + ' practice challenges   •   ' + c.hints + ' hints in practice', 760, 'bold 30px Arial', '#172033');
    t('Date: ' + fmtDate(c.time), 900, '28px Arial', '#344054');
    g.beginPath(); g.moveTo(1050, 905); g.lineTo(1400, 905); g.strokeStyle = '#98a2b3'; g.lineWidth = 2; g.stroke();
    g.font = '22px Arial'; g.fillStyle = '#667085'; g.fillText('Instructor', 1225, 940);
    t('Verification ID ' + SX.seal.printId(c.name, c.lesson) + '  ·  test attempt ' + c.attempts, 1010, '20px monospace', '#667085');
    g.beginPath(); g.arc(300, 900, 70, 0, Math.PI * 2); g.fillStyle = '#f26b1d'; g.fill();
    g.font = 'bold 70px Arial'; g.fillStyle = '#fff'; g.fillText('★', 300, 925);
    var url = cv.toDataURL('image/png');
    var file = 'SheetEX-Lesson' + lesson.n + '-' + c.name.replace(/\W+/g, '_') + '.png';
    try { var a = h('a', { href: url, download: file }); document.body.appendChild(a); a.click(); a.remove(); } catch (e) { /* shown below */ }
    holder.innerHTML = '';
    holder.appendChild(h('p.small', { text: 'If nothing downloaded (some school sites block downloads), right-click the image below and choose "Save image as…", or take a screenshot.' }));
    holder.appendChild(h('img.cert-img', { src: url, alt: 'Certificate image' }));
  }

})(globalThis.SX = globalThis.SX || {});
