/* SheetEX v2 — lesson certificates and the optional Apps Script cloud (gradebook + save/load). */
(function (SX) {
  'use strict';
  var UI = SX.ui, h = UI.h, L = SX.lessons;

  // ---------- Cloud (only when served by Google Apps Script) ----------
  var cloud = SX.cloud = {
    available: function () { try { return !!(window.google && window.google.script && window.google.script.run); } catch (e) { return false; } },
    call: function (fn, args) {
      return new Promise(function (resolve, reject) {
        var r = window.google.script.run.withSuccessHandler(resolve).withFailureHandler(function (e) { reject(e && e.message ? e : new Error(String(e))); });
        r[fn].apply(r, args || []);
      });
    }
  };

  // ---------- Lessons ----------
  UI.lessonProgress = function (id) { return UI.platProgress(id); };
  UI.lessonComplete = function (id) { var p = UI.platProgress(id); return p.total > 0 && p.done === p.total; };

  function needRealName(then) {
    var nm = (UI.state.name || '').trim();
    if (nm && nm !== 'Analyst' && /\s/.test(nm)) { then(); return; }
    var inp = h('input.input', { value: nm === 'Analyst' ? '' : nm, maxlength: 40, placeholder: 'First and last name' });
    UI.modal('Name on your certificate', [
      h('p', { text: 'Certificates show your full name so your teacher knows they are yours. Type your first and last name exactly as your teacher knows you.' }), inp
    ], [{ text: 'Cancel' }, { text: 'Use this name', primary: true, onclick: function () {
      var v = inp.value.trim().replace(/\s+/g, ' ');
      if (!/\S+\s+\S+/.test(v)) { UI.toast('First AND last name, please', 'Example: Jordan Smith'); return false; }
      UI.state.name = v; UI.save(); UI.refreshHeader(); setTimeout(then, 50);
    } }]);
  }

  UI.issueCert = function (id) {
    var lesson = L.byId(id), list = SX.challenges.forPlat(id), pr = UI.platProgress(id);
    var hints = list.reduce(function (a, c) { return a + (UI.state.done[c.id] ? UI.state.done[c.id].hints || 0 : 0); }, 0);
    var cert = { name: UI.state.name, lesson: id, xp: pr.xp, maxXp: pr.maxXp, hints: hints, count: pr.total, time: Date.now() };
    cert.code = L.certCode(cert);
    UI.state.certs = UI.state.certs || {};
    UI.state.certs[id] = { code: cert.code, t: cert.time, sent: false };
    UI.save();
    if (cloud.available()) {
      cloud.call('sxRecordCertificate', [{ name: cert.name, lesson: lesson.title, lessonId: id, xp: cert.xp, maxXp: cert.maxXp, hints: hints, challenges: cert.count, code: cert.code }])
        .then(function () { UI.state.certs[id].sent = true; UI.save(); UI.toast('🎓 Sent to your teacher', 'Your certificate was recorded in the class gradebook.'); refreshSent(); })
        .catch(function (e) { UI.toast('Could not reach the gradebook', (e && e.message) || 'Copy your certificate code instead.', 'err'); });
    }
    return cert;
  };
  var sentBox = null;
  function refreshSent() { if (sentBox && sentBox.isConnected) sentBox.textContent = '✓ Recorded in your teacher\'s gradebook'; }

  UI.lessonFinished = function (id) {
    var lesson = L.byId(id); if (!lesson) return;
    window.confettiBurst(120);
    UI.modal('🎓 Lesson ' + lesson.n + ' complete!', [
      h('div.levelup', null, [h('div.levelup-title', { text: lesson.title }),
        h('p', { text: 'You finished every challenge in this lesson. Claim your certificate — print it, save it, or copy its code into Canvas.' })])
    ], [{ text: 'Later' }, { text: 'Get my certificate', primary: true, onclick: function () { setTimeout(function () { UI.showCert(id); }, 50); } }]);
  };

  UI.showCert = function (id) {
    if (!UI.lessonComplete(id)) { UI.toast('Not yet!', 'Finish every challenge in this lesson to earn its certificate.'); return; }
    needRealName(function () {
      var saved = UI.state.certs && UI.state.certs[id];
      var data = saved && L.readCert(saved.code);
      // Re-issue if the name changed since the certificate was made
      if (!data || data.name !== UI.state.name) { UI.issueCert(id); saved = UI.state.certs[id]; data = L.readCert(saved.code); }
      render(id, data, saved);
    });
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
          stat(c.count, 'challenges'), stat(c.xp + ' / ' + c.maxXp, 'XP earned'), stat(c.hints, c.hints === 1 ? 'hint used' : 'hints used')
        ]),
        h('div.cert-foot', null, [
          h('div', null, [h('div.cert-line'), h('div.cert-small', { text: 'Date: ' + fmtDate(c.time) })]),
          h('div.cert-seal', { text: '★' }),
          h('div', null, [h('div.cert-line'), h('div.cert-small', { text: 'Instructor' })])
        ]),
        h('div.cert-verify', { text: 'Verification ID ' + L.shortId(saved.code) + ' · check the full code at SheetEX ▸ ? ▸ For teachers' })
      ])
    ]);
    var codeBox = h('textarea.input.code-box', { readonly: true, rows: 2 }, saved.code);
    sentBox = h('div.small.cert-sent', { text: saved.sent ? '✓ Recorded in your teacher\'s gradebook' : (cloud.available() ? 'Sending to your teacher\'s gradebook…' : '') });
    var imgHolder = h('div');
    var bar = h('div.cert-bar', null, [
      h('button.btn.btn-primary', { text: '🖨 Print / Save as PDF', onclick: function () { printCert(); } }),
      h('button.btn', { text: '⬇ Download image', onclick: function () { downloadPng(c, lesson, saved.code, imgHolder); } }),
      h('button.btn', { text: '📋 Copy certificate code', onclick: function () { codeBox.select(); UI.copyText(saved.code); UI.toast('Copied', 'Paste the code into your Canvas assignment.'); } }),
      h('button.btn', { text: 'Close', onclick: close })
    ]);
    overlay.appendChild(h('div.cert-wrap', null, [bar, paper,
      h('div.cert-howto', null, [h('b', { text: 'Turning it in: ' }), 'print it (choose "Save as PDF"), download the image, or paste this code into Canvas:', codeBox, sentBox, imgHolder])]));
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
    t(c.count + ' challenges   •   ' + c.xp + ' / ' + c.maxXp + ' XP   •   ' + c.hints + ' hints used', 760, 'bold 30px Arial', '#172033');
    t('Date: ' + fmtDate(c.time), 900, '28px Arial', '#344054');
    g.beginPath(); g.moveTo(1050, 905); g.lineTo(1400, 905); g.strokeStyle = '#98a2b3'; g.lineWidth = 2; g.stroke();
    g.font = '22px Arial'; g.fillStyle = '#667085'; g.fillText('Instructor', 1225, 940);
    t('Verification ID ' + L.shortId(code), 1010, '20px monospace', '#667085');
    g.beginPath(); g.arc(300, 900, 70, 0, Math.PI * 2); g.fillStyle = '#f26b1d'; g.fill();
    g.font = 'bold 70px Arial'; g.fillStyle = '#fff'; g.fillText('★', 300, 925);
    var url = cv.toDataURL('image/png');
    var file = 'SheetEX-Lesson' + lesson.n + '-' + c.name.replace(/\W+/g, '_') + '.png';
    try { var a = h('a', { href: url, download: file }); document.body.appendChild(a); a.click(); a.remove(); } catch (e) { /* shown below */ }
    holder.innerHTML = '';
    holder.appendChild(h('p.small', { text: 'If nothing downloaded (some school sites block downloads), right-click the image below and choose "Save image as…", or take a screenshot.' }));
    holder.appendChild(h('img.cert-img', { src: url, alt: 'Certificate image' }));
  }

  // ---------- Cloud save / load (profile + welcome) ----------
  UI.cloudPanel = function () {
    if (!cloud.available()) return null;
    var nameIn = h('input.input', { value: UI.state.name || '', placeholder: 'First and last name' });
    var pinIn = h('input.input', { type: 'password', inputmode: 'numeric', maxlength: 8, value: UI.state.ui.pin || '', placeholder: '4–8 digit PIN you will remember' });
    var msg = h('div.small');
    function creds() {
      var n = nameIn.value.trim().replace(/\s+/g, ' '), p = pinIn.value.trim();
      if (!/\S+\s+\S+/.test(n)) { msg.textContent = 'Type your first and last name.'; return null; }
      if (!/^\d{4,8}$/.test(p)) { msg.textContent = 'Your PIN must be 4–8 digits.'; return null; }
      return { n: n, p: p };
    }
    return h('div.cloud-box', null, [
      h('h3', { text: '☁ Class cloud save' }),
      h('p.small', { text: 'Save your XP, challenges and certificates to your class so you can keep going on another day or another computer. Use the same name + PIN every time. (Your formulas and files stay on this computer.)' }),
      h('div.cloud-row', null, [nameIn, pinIn]),
      h('div.row', null, [
        h('button.btn.btn-primary', { text: 'Save to class cloud', onclick: function () {
          var c = creds(); if (!c) return;
          msg.textContent = 'Saving…';
          UI.state.name = c.n; UI.state.ui.pin = c.p; UI.save(); UI.refreshHeader();
          cloud.call('sxSaveProgress', [c.n, c.p, UI.progressCode()]).then(function (r) {
            msg.textContent = r && r.ok ? '✓ Saved ' + new Date().toLocaleTimeString() : (r && r.error) || 'Could not save.';
          }).catch(function (e) { msg.textContent = 'Could not save: ' + e.message; });
        } }),
        h('button.btn', { text: 'Load from class cloud', onclick: function () {
          var c = creds(); if (!c) return;
          msg.textContent = 'Loading…';
          cloud.call('sxLoadProgress', [c.n, c.p]).then(function (r) {
            if (!r || !r.ok) { msg.textContent = (r && r.error) || 'Nothing saved under that name and PIN.'; return; }
            if (!UI.restoreFromCode(r.code)) { msg.textContent = 'The saved data could not be read.'; return; }
            UI.state.name = c.n; UI.state.ui.pin = c.p; UI.save();
            msg.textContent = '✓ Progress loaded (saved ' + new Date(r.savedAt).toLocaleString() + ')';
            UI.render();
          }).catch(function (e) { msg.textContent = 'Could not load: ' + e.message; });
        } })
      ]), msg
    ]);
  };
  // Quietly push progress after each challenge when the student has set up cloud save.
  UI.cloudAutoSave = function () {
    if (!cloud.available() || !UI.state.ui.pin || !UI.state.name) return;
    cloud.call('sxSaveProgress', [UI.state.name, UI.state.ui.pin, UI.progressCode()]).catch(function () { /* manual save still available */ });
  };
})(globalThis.SX = globalThis.SX || {});
