/* SheetEX — UI core: state, XP/levels/badges, DOM helpers, toasts, modals, home page, routing. */
(function (SX) {
  'use strict';
  var UI = SX.ui = {};
  var PL = SX.platforms.PLATFORMS;

  // ---------- DOM helper ----------
  function h(tag, attrs, kids) {
    var m = /^([a-z0-9]+)((?:[.#][\w-]+)*)$/i.exec(tag), el = document.createElement(m[1]);
    (m[2].match(/[.#][\w-]+/g) || []).forEach(function (p) { if (p[0] === '.') el.classList.add(p.slice(1)); else el.id = p.slice(1); });
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    (Array.isArray(kids) ? kids : kids != null ? [kids] : []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return el;
  }
  UI.h = h;
  UI.esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  // ---------- Persistence ----------
  var KEY = 'sheetex.v1';
  function storageGet() { try { return window.localStorage.getItem(KEY); } catch (e) { return null; } }
  function storageSet(v) { try { window.localStorage.setItem(KEY, v); return true; } catch (e) { return false; } }
  function freshState() {
    return { v: 1, name: '', xp: 0, done: {}, hints: {}, wrong: {}, errors: {}, badges: {}, visited: {},
      stats: { formulas: 0, queries: 0, compat: 0, noHint: 0 }, wb: {}, db: null, files: null, colw: {}, ui: {} };
  }
  UI.state = freshState();
  try { var raw = storageGet(); if (raw) { var parsed = JSON.parse(raw); if (parsed && parsed.v === 1) UI.state = Object.assign(freshState(), parsed); } } catch (e) { /* start fresh */ }
  UI.storageOk = storageSet(JSON.stringify(UI.state));

  var saveTimer = null;
  UI.save = function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      Object.keys(UI.wbs).forEach(function (p) { UI.state.wb[p] = UI.wbs[p].serialize(); });
      if (UI.db) UI.state.db = UI.db.serialize();
      if (UI.files) UI.state.files = UI.files;
      storageSet(JSON.stringify(UI.state));
    }, 300);
  };

  // Workbooks / database / files live in memory, loaded lazily from saved state.
  UI.wbs = {};
  // Workbook keys: 'xl365' etc. for the store workbooks, 'wr-xl365' / 'wr-gs' for the Data Wrangling Lab.
  function wbSpec(key) {
    var m = /^wr-(.+)$/.exec(key);
    return m ? { plat: m[1], make: SX.wrangle.makeWorkbook } : { plat: key, make: SX.makeStoreWorkbook };
  }
  UI.workbook = function (key) {
    if (!UI.wbs[key]) {
      var spec = wbSpec(key), saved = UI.state.wb[key];
      if (saved) { var w = new SX.Workbook(spec.plat); try { w.load(saved); UI.wbs[key] = w; } catch (e) { UI.wbs[key] = spec.make(spec.plat); } }
      else UI.wbs[key] = spec.make(spec.plat);
    }
    return UI.wbs[key];
  };
  UI.resetWorkbook = function (key) { var spec = wbSpec(key); UI.wbs[key] = spec.make(spec.plat); delete UI.state.wb[key]; UI.save(); return UI.wbs[key]; };
  UI.database = function () {
    if (!UI.db) {
      try { UI.db = UI.state.db ? SX.sql.Database.load(UI.state.db) : SX.sql.makeStoreDb(); } catch (e) { UI.db = SX.sql.makeStoreDb(); }
      var fresh = SX.sql.makeStoreDb(); // v2 tables for older saves
      Object.keys(fresh.tables).forEach(function (k) { if (!UI.db.tables[k]) UI.db.tables[k] = fresh.tables[k]; });
    }
    return UI.db;
  };
  UI.resetDatabase = function () { UI.db = SX.sql.makeStoreDb(); UI.save(); return UI.db; };
  UI.csvFiles = function () {
    if (!UI.files) {
      UI.files = UI.state.files || SX.csv.defaultFiles();
      if (!UI.state.ui.v2files) { // v2 adds the messy wrangling files to older saves
        var extra = SX.wrangle.files();
        Object.keys(extra).forEach(function (n) { if (UI.files[n] === undefined) UI.files[n] = extra[n]; });
        UI.state.ui.v2files = true;
      }
    }
    return UI.files;
  };
  UI.resetFiles = function () { UI.files = SX.csv.defaultFiles(); UI.save(); return UI.files; };

  // ---------- Levels, XP, badges ----------
  var LEVELS = [[0, 'Intern'], [40, 'Data Clerk'], [100, 'Cell Wrangler'], [180, 'Formula Apprentice'], [280, 'Lookup Ranger'],
    [400, 'Array Wrangler'], [540, 'Query Knight'], [700, 'Spreadsheet Sage'], [880, 'Data Wizard'], [1080, 'Chief Data Officer']];
  UI.LEVELS = LEVELS;
  UI.level = function (xp) {
    var i = 0; while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++;
    var next = LEVELS[i + 1];
    return { n: i + 1, title: LEVELS[i][1], floor: LEVELS[i][0], next: next ? next[0] : null,
      pct: next ? Math.round(100 * (xp - LEVELS[i][0]) / (next[0] - LEVELS[i][0])) : 100 };
  };
  UI.ERROR_CODES = ['#NAME?', '#VALUE!', '#REF!', '#DIV/0!', '#N/A', '#NUM!', '#SPILL!', '#CALC!', '#ERROR!'];
  var BADGES = [
    { id: 'first-formula', icon: '✏️', name: 'First Formula', desc: 'Enter your first formula.', xp: 10 },
    { id: 'explorer', icon: '🧭', name: 'Explorer', desc: 'Open all five workspaces.', xp: 15 },
    { id: 'err-5', icon: '🐛', name: 'Error Collector', desc: 'Discover 5 different error types.', xp: 20 },
    { id: 'err-all', icon: '🦋', name: 'Error Master', desc: 'Discover all 9 error types.', xp: 40 },
    { id: 'spill', icon: '🌊', name: 'Spill Master', desc: 'Write a formula that spills.', xp: 10 },
    { id: 'cse', icon: '{ }', name: 'Curly Braces', desc: 'Enter an Excel 2013 array formula with Ctrl+Shift+Enter.', xp: 10 },
    { id: 'arrayformula', icon: '🔁', name: 'Array Thinker', desc: 'Use ARRAYFORMULA in Google Sheets.', xp: 10 },
    { id: 'translator', icon: '🌐', name: 'Translator', desc: 'Check 3 formulas with “Will it work elsewhere?”.', xp: 15 },
    { id: 'sql-first', icon: '🗄️', name: 'Hello, Database', desc: 'Run your first SQL query.', xp: 10 },
    { id: 'oops', icon: '😬', name: 'Learned the Hard Way', desc: 'Run UPDATE or DELETE without WHERE.', xp: 5 },
    { id: 'no-hints', icon: '🧠', name: 'No Hints Needed', desc: 'Finish 5 challenges without hints.', xp: 25 },
    { id: 'done-xl365', icon: '🟩', name: 'Excel 365 Pro', desc: 'Finish every Excel 365 challenge.', xp: 30 },
    { id: 'done-xl2013', icon: '⏳', name: 'Time Traveler', desc: 'Finish every Excel 2013 challenge.', xp: 30 },
    { id: 'done-gs', icon: '🟦', name: 'Sheets Specialist', desc: 'Finish every Google Sheets challenge.', xp: 30 },
    { id: 'done-csv', icon: '📄', name: 'File Whisperer', desc: 'Finish every CSV/TSV challenge.', xp: 30 },
    { id: 'done-sql', icon: '🔮', name: 'SQL Sorcerer', desc: 'Finish every SQL challenge.', xp: 30 },
    { id: 'researcher', icon: '📚', name: 'Researcher', desc: 'Run 10 examples in the Interactive Cheat Sheet.', xp: 15 },
    { id: 'ai-ready', icon: '🤖', name: 'AI-Ready Data', desc: 'Reach an AI-readiness score of 100 in the Data Wrangling Lab.', xp: 40 },
    { id: 'done-wr1', icon: '🧽', name: 'Data Janitor', desc: 'Finish Data Wrangling I: Cleaning.', xp: 30 },
    { id: 'done-wr2', icon: '🔗', name: 'Data Joiner', desc: 'Finish Data Wrangling II: Combining & Lookups.', xp: 30 },
    { id: 'done-compare', icon: '🔭', name: 'Big Picture', desc: 'Answer every Compare quiz.', xp: 20 },
    { id: 'all', icon: '🏆', name: 'Completionist', desc: 'Finish every challenge in SheetEX.', xp: 100 }
  ];
  UI.BADGES = BADGES;

  UI.addXP = function (n, why, silent) {
    if (!n) return;
    var before = UI.level(UI.state.xp);
    UI.state.xp += n;
    var after = UI.level(UI.state.xp);
    if (!silent) UI.toast('+' + n + ' XP', why, 'xp');
    if (after.n > before.n) setTimeout(function () { levelUp(after); }, 600);
    UI.save(); UI.refreshHeader();
  };
  UI.badge = function (id) {
    if (UI.state.badges[id]) return;
    var b = BADGES.filter(function (x) { return x.id === id; })[0]; if (!b) return;
    UI.state.badges[id] = Date.now();
    UI.toast(b.icon + ' Badge: ' + b.name + '  +' + b.xp + ' XP', b.desc, 'badge');
    UI.addXP(b.xp, 'Badge: ' + b.name, true);
  };
  UI.discoverError = function (code, msg) {
    if (UI.ERROR_CODES.indexOf(code) < 0 || UI.state.errors[code]) return;
    UI.state.errors[code] = Date.now();
    UI.toast('New error discovered: ' + code + '  +5 XP', SX.f.ERR_TEXT[code], 'err');
    UI.addXP(5, 'Discovered ' + code, true);
    var n = Object.keys(UI.state.errors).length;
    if (n >= 5) UI.badge('err-5');
    if (n >= UI.ERROR_CODES.length) UI.badge('err-all');
  };
  UI.visit = function (plat) {
    UI.state.visited[plat] = true;
    if (SX.platforms.ORDER.every(function (p) { return UI.state.visited[p]; })) UI.badge('explorer');
    UI.save();
  };

  // Challenge completion and rewards
  UI.challengeReward = function (ch) {
    var hints = UI.state.hints[ch.id] || 0, wrong = UI.state.wrong[ch.id] || 0;
    var mult = Math.max(0.4, 1 - 0.2 * hints - 0.25 * wrong);
    return Math.max(1, Math.round(ch.xp * mult));
  };
  UI.completeChallenge = function (ch) {
    if (UI.state.done[ch.id]) return false;
    var xp = UI.challengeReward(ch);
    UI.state.done[ch.id] = { xp: xp, at: Date.now(), hints: UI.state.hints[ch.id] || 0 };
    UI.addXP(xp, 'Challenge: ' + ch.title);
    if (!UI.state.hints[ch.id] && !UI.state.wrong[ch.id]) {
      UI.state.stats.noHint = (UI.state.stats.noHint || 0) + 1;
      if (UI.state.stats.noHint >= 5) UI.badge('no-hints');
    }
    var mine = SX.challenges.forPlat(ch.plat);
    if (mine.every(function (c) { return UI.state.done[c.id]; })) UI.badge('done-' + ch.plat);
    if (SX.challenges.LIST.every(function (c) { return UI.state.done[c.id]; })) UI.badge('all');
    if (window.confettiBurst) window.confettiBurst(30);
    UI.save();
    if (UI.cloudAutoSave) UI.cloudAutoSave();
    if (UI.lessonFinished && mine.every(function (c) { return UI.state.done[c.id]; })) setTimeout(function () { UI.lessonFinished(ch.plat); }, 1800);
    return true;
  };
  UI.platProgress = function (plat) {
    var list = SX.challenges.forPlat(plat);
    var done = list.filter(function (c) { return UI.state.done[c.id]; });
    return { done: done.length, total: list.length, xp: done.reduce(function (a, c) { return a + UI.state.done[c.id].xp; }, 0),
      maxXp: list.reduce(function (a, c) { return a + c.xp; }, 0) };
  };

  // ---------- Toasts ----------
  UI.toast = function (title, body, kind) {
    var box = document.getElementById('toasts');
    var t = h('div.toast.toast-' + (kind || 'info'), null, [h('div.toast-title', { text: title }), body ? h('div.toast-body', { text: body }) : null]);
    box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 400); }, kind === 'err' ? 4500 : 3200);
  };

  // ---------- Confetti (tiny, no libraries) ----------
  window.confettiBurst = function (n) {
    var layer = h('div.confetti');
    document.body.appendChild(layer);
    var colors = ['#f97316', '#22c55e', '#3b82f6', '#a855f7', '#eab308', '#ef4444'];
    for (var i = 0; i < n; i++) {
      var p = h('i', { style: { left: (10 + Math.random() * 80) + '%', background: colors[i % colors.length],
        animationDelay: (Math.random() * 0.3) + 's', transform: 'rotate(' + Math.random() * 360 + 'deg)' } });
      layer.appendChild(p);
    }
    setTimeout(function () { layer.remove(); }, 2200);
  };

  // ---------- Modals ----------
  UI.modal = function (title, body, buttons, opts) {
    opts = opts || {};
    var root = document.getElementById('modal-root');
    var overlay = h('div.modal-overlay' + (opts.cls ? '.' + opts.cls : ''));
    var close = function () { overlay.remove(); if (opts.onClose) opts.onClose(); };
    var box = h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
      h('div.modal-head', null, [h('div.modal-title', { text: title }), opts.noX ? null : h('button.modal-x', { 'aria-label': 'Close', onclick: close, text: '×' })]),
      h('div.modal-body', null, body),
      buttons && buttons.length ? h('div.modal-foot', null, buttons.map(function (b) {
        return h('button.btn' + (b.primary ? '.btn-primary' : '') + (b.danger ? '.btn-danger' : ''), { text: b.text, onclick: function () { if (b.onclick && b.onclick() === false) return; close(); } });
      })) : null
    ]);
    overlay.appendChild(box);
    overlay.addEventListener('mousedown', function (e) { if (e.target === overlay && !opts.sticky) close(); });
    overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !opts.sticky) { e.stopPropagation(); close(); } });
    root.appendChild(overlay);
    var focusEl = box.querySelector('input, textarea, .btn-primary, button');
    if (focusEl) setTimeout(function () { focusEl.focus(); }, 30);
    return { close: close, el: box };
  };

  function levelUp(lv) {
    window.confettiBurst(80);
    UI.modal('Level up!', [
      h('div.levelup', null, [
        h('div.levelup-num', { text: lv.n }),
        h('div.levelup-title', { text: lv.title }),
        h('p', { text: 'You reached level ' + lv.n + '. Keep going, ' + (UI.state.name || 'analyst') + '!' })
      ])
    ], [{ text: 'Awesome', primary: true }]);
  }

  // ---------- Header ----------
  UI.header = function () {
    var lv = UI.level(UI.state.xp);
    var bar = h('header.topbar', null, [
      h('button.brand', { onclick: function () { UI.go('home'); }, title: 'Home' }, [h('span.brand-logo', { text: 'SX' }), h('span.brand-name', { html: 'Sheet<b>EX</b>' })]),
      h('div.topbar-mid', null, h('span.company', { text: SX.data.COMPANY + ' · Data Lab' })),
      h('button.player', { onclick: UI.profile, title: 'Your profile, badges and progress code' }, [
        h('span.avatar', { text: (UI.state.name || '?').trim().charAt(0).toUpperCase() || '?' }),
        h('span.player-info', null, [
          h('span.player-name', null, [UI.state.name || 'Analyst', h('span.player-lvl', { text: ' · Lv ' + lv.n + ' ' + lv.title })]),
          h('span.xpbar', null, [h('span.xpfill', { style: { width: lv.pct + '%' } })]),
          h('span.xptext', { text: UI.state.xp + ' XP' + (lv.next ? ' / ' + lv.next : ' (max level)') })
        ])
      ]),
      h('button.icon-btn', { onclick: UI.help, title: 'Help', 'aria-label': 'Help', text: '?' })
    ]);
    return bar;
  };
  UI.refreshHeader = function () {
    var old = document.querySelector('header.topbar');
    if (old) old.replaceWith(UI.header());
  };

  // ---------- Profile & progress code ----------
  function checksum(s) { var x = 7; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) % 1000003; return x.toString(36); }
  UI.progressCode = function () {
    var p = { n: UI.state.name, x: UI.state.xp, d: Object.keys(UI.state.done).map(function (k) { return k + ':' + UI.state.done[k].xp + ':' + (UI.state.done[k].hints || 0); }).join(','),
      b: Object.keys(UI.state.badges).join(','), e: Object.keys(UI.state.errors).join(' '), t: Date.now() };
    var json = JSON.stringify(p);
    return 'SX1-' + btoa(unescape(encodeURIComponent(json))) + '-' + checksum(json);
  };
  UI.decodeCode = function (code) {
    var m = /^SX1-([A-Za-z0-9+/=]+)-([a-z0-9]+)$/.exec(String(code).trim());
    if (!m) return null;
    try {
      var json = decodeURIComponent(escape(atob(m[1])));
      if (checksum(json) !== m[2]) return null;
      return JSON.parse(json);
    } catch (e) { return null; }
  };
  // Merge a progress code into this browser (never lowers XP or removes anything)
  UI.restoreFromCode = function (code) {
    var p = UI.decodeCode(code), st = UI.state;
    if (!p) return false;
    st.name = p.n || st.name; st.xp = Math.max(st.xp, p.x);
    (p.d ? p.d.split(',') : []).forEach(function (s) { var q = s.split(':'); if (q[0] && !st.done[q[0]]) st.done[q[0]] = { xp: +q[1], at: p.t, hints: q[2] ? +q[2] : 0 }; });
    (p.b ? p.b.split(',') : []).forEach(function (b) { if (b) st.badges[b] = st.badges[b] || p.t; });
    (p.e ? p.e.split(' ') : []).forEach(function (e) { if (e) st.errors[e] = st.errors[e] || p.t; });
    UI.save();
    return true;
  };
  UI.profile = function () {
    var st = UI.state, lv = UI.level(st.xp);
    var nameIn = h('input.input', { value: st.name, maxlength: 30, placeholder: 'First name or nickname' });
    var badgeGrid = h('div.badge-grid', null, BADGES.map(function (b) {
      var got = !!st.badges[b.id];
      return h('div.badge' + (got ? '.got' : ''), { title: b.desc }, [h('div.badge-icon', { text: got ? b.icon : '🔒' }), h('div.badge-name', { text: b.name }), h('div.badge-desc', { text: b.desc })]);
    }));
    var errGrid = h('div.err-grid', null, UI.ERROR_CODES.map(function (c) {
      var got = !!st.errors[c];
      return h('div.err-tile' + (got ? '.got' : ''), { title: got ? SX.f.ERR_TEXT[c] : 'Not discovered yet' }, got ? c : '???');
    }));
    var code = UI.progressCode();
    var codeBox = h('textarea.input.code-box', { readonly: true, rows: 3 }, code);
    var loadIn = h('textarea.input.code-box', { rows: 2, placeholder: 'Paste a progress code here (SX1-…)' });
    var loadMsg = h('div.small');
    UI.modal('Your profile', [
      h('div.profile-top', null, [
        h('div.big-level', null, [h('div.big-level-n', { text: lv.n }), h('div', { text: lv.title })]),
        h('div', null, [h('label.lbl', { text: 'Display name' }), nameIn, h('div.small', { text: st.xp + ' XP total · ' + Object.keys(st.done).length + '/' + SX.challenges.LIST.length + ' challenges' })])
      ]),
      h('h3', { text: 'Badges' }), badgeGrid,
      h('h3', { text: 'Error collection (' + Object.keys(st.errors).length + '/' + UI.ERROR_CODES.length + ')' }), errGrid,
      h('h3', { text: 'Certificates' }),
      h('div.cert-list', null, SX.lessons.LIST.map(function (L) {
        var pr = UI.platProgress(L.id), done = pr.total && pr.done === pr.total;
        return h('button.chip' + (done ? '' : '.chip-off'), { disabled: !done, text: (done ? '🎓 ' : '🔒 ') + L.n + '. ' + L.title, onclick: function () { UI.showCert(L.id); } });
      })),
      UI.cloudPanel ? UI.cloudPanel() : null,
      h('h3', { text: 'Progress code' }),
      h('p.small', { text: 'Paste this code into Canvas to show your teacher your progress, or use it to move your XP to another computer.' }),
      codeBox,
      h('div.row', null, [h('button.btn', { text: 'Copy code', onclick: function () { codeBox.select(); copyText(code); UI.toast('Copied!', 'Progress code copied to the clipboard.'); } })]),
      h('details.load-code', null, [h('summary', { text: 'Load or check a progress code' }), loadIn, h('div.row', null, [
        h('button.btn', { text: 'Check code', onclick: function () {
          var p = UI.decodeCode(loadIn.value);
          loadMsg.textContent = p ? (p.n || 'Unnamed') + ': ' + p.x + ' XP, level ' + UI.level(p.x).n + ', ' + (p.d ? p.d.split(',').length : 0) + ' challenges, ' + (p.b ? p.b.split(',').length : 0) + ' badges (saved ' + new Date(p.t).toLocaleString() + ').' : 'That code is not valid (it may have been changed).';
        } }),
        h('button.btn', { text: 'Restore my progress from code', onclick: function () {
          if (!UI.restoreFromCode(loadIn.value)) { loadMsg.textContent = 'That code is not valid.'; return; }
          UI.render(); loadMsg.textContent = 'Progress restored!';
        } })
      ]), loadMsg]),
      h('details.danger-zone', null, [h('summary', { text: 'Start over' }), h('p.small', { text: 'Erase all XP, badges, and your work in every app on this computer.' }),
        h('button.btn.btn-danger', { text: 'Erase everything', onclick: function () {
          UI.confirm('Erase everything?', 'All XP, badges and your work in every app will be deleted from this browser. This cannot be undone.', 'Erase everything', function () {
            UI.state = freshState(); UI.wbs = {}; UI.db = null; UI.files = null; storageSet(JSON.stringify(UI.state));
            document.querySelectorAll('.modal-overlay').forEach(function (m) { m.remove(); }); UI.go('home'); UI.start();
          });
        } })])
    ], [{ text: 'Done', primary: true, onclick: function () { st.name = nameIn.value.trim(); UI.save(); UI.refreshHeader(); } }], { cls: 'wide' });
  };
  // Clipboard that also works inside sandboxed iframes (Apps Script / Canvas), where navigator.clipboard may be blocked.
  function copyText(t) {
    var ta = h('textarea', { style: { position: 'fixed', left: '-9999px', top: '0' } }, t);
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (!ok) { try { navigator.clipboard.writeText(t); } catch (e) { /* the text is still visible to copy by hand */ } }
  }
  // In-app confirm (window.confirm can be blocked inside embedded iframes)
  UI.confirm = function (title, msg, okText, onOk) {
    UI.modal(title, [h('p', { text: msg })], [{ text: 'Cancel' }, { text: okText, danger: true, onclick: onOk }]);
  };
  UI.copyText = copyText;

  UI.help = function () {
    UI.modal('How SheetEX works', [
      h('p', { html: '<b>Same store data, five different tools.</b> Pick a workspace on the home page. Each one behaves like the real thing — including the errors.' }),
      h('ul', null, [
        h('li', { html: '<b>Challenges</b> (right-side panel) give XP. Hints cost 20% of a challenge\'s XP; wrong quiz answers cost 25%.' }),
        h('li', { html: '<b>Cheat Sheet</b> lists what is different on that platform, plus every function it supports.' }),
        h('li', { html: '<b>Will it work elsewhere?</b> runs your formula in Excel 365, Excel 2013 and Google Sheets at the same time and suggests a rewrite.' }),
        h('li', { html: 'Discover new error types (like <code>#SPILL!</code>) for bonus XP.' }),
        h('li', { html: 'Your work saves automatically in this browser. Use your <b>progress code</b> (click your name) to move to another computer or turn it in.' })
      ]),
      h('p.small', { text: 'SheetEX is a practice simulator. It copies how these apps behave for the functions it supports, but it is not the real software. When in doubt, test it in the real app!' }),
      UI.storageOk ? null : h('p.warn', { text: 'Heads up: this browser is blocking saving. Your progress will be lost when you close the page — copy your progress code before leaving!' }),
      h('details.load-code', null, [h('summary', { text: 'For teachers: check a class set of progress codes' }), teacherTool()])
    ], [{ text: 'Got it', primary: true }], { cls: 'wide' });
  };
  function teacherTool() {
    var ta = h('textarea.input.code-box', { rows: 5, placeholder: 'Paste progress codes here — one per line, or the whole Canvas export. Anything that is not a code is ignored.' });
    var out = h('div');
    var certOut = h('div');
    function runCerts() {
      var codes = ta.value.match(/SXC1-[A-Za-z0-9_-]+-[a-z0-9]+/g) || [];
      certOut.innerHTML = '';
      if (!codes.length) return;
      var t = h('table.cs-keys', null, [h('tr', null, ['Certificate', 'Name', 'Lesson', 'XP', 'Hints', 'Date'].map(function (x) { return h('th', { text: x }); }))]);
      codes.forEach(function (c) {
        var d = SX.lessons.readCert(c);
        if (!d) { t.appendChild(h('tr', null, [h('td', { colspan: 6, text: '⚠ Invalid or edited certificate code: ' + c.slice(0, 24) + '…' })])); return; }
        t.appendChild(h('tr', null, ['✓ ' + SX.lessons.shortId(c), d.name, d.title, d.xp + '/' + d.maxXp, d.hints, new Date(d.time).toLocaleDateString()].map(function (x) { return h('td', { text: String(x) }); })));
      });
      certOut.appendChild(h('h4', { text: 'Certificates' })); certOut.appendChild(t);
    }
    function run() {
      runCerts();
      var codes = ta.value.match(/(?:^|[^C])(SX1-[A-Za-z0-9+/=]+-[a-z0-9]+)/g) || [];
      codes = codes.map(function (c) { return c.replace(/^[^S]/, ''); });
      var rows = codes.map(function (c) { var p = UI.decodeCode(c); return p ? p : { bad: c }; });
      out.innerHTML = '';
      if (!rows.length) { if (!certOut.childNodes.length) out.appendChild(h('p.small', { text: 'No codes found yet.' })); return; }
      var t = h('table.cs-keys', null, [h('tr', null, ['Name', 'Level', 'XP', 'Challenges', 'Badges', 'Errors', 'Saved'].map(function (x) { return h('th', { text: x }); }))]);
      rows.forEach(function (p) {
        if (p.bad) { t.appendChild(h('tr', null, [h('td', { colspan: 7, text: '⚠ Invalid or edited code: ' + p.bad.slice(0, 24) + '…' })])); return; }
        t.appendChild(h('tr', null, [p.n || '?', UI.level(p.x).n + ' ' + UI.level(p.x).title, p.x, p.d ? p.d.split(',').length + '/' + SX.challenges.LIST.length : 0,
          p.b ? p.b.split(',').length : 0, p.e ? p.e.split(' ').filter(Boolean).length : 0, new Date(p.t).toLocaleDateString()].map(function (x) { return h('td', { text: String(x) }); })));
      });
      out.appendChild(t);
    }
    ta.addEventListener('input', run);
    return h('div', null, [h('p.small', { text: 'Paste progress codes (SX1-…) and/or certificate codes (SXC1-…) — one per line, or a whole Canvas export. Codes are checksummed, so hand-edited codes show as invalid.' }), ta, certOut, out]);
  }

  // ---------- Home ----------
  function platIcon(p, big) {
    return h('div.plat-icon.pi-' + p.id + (big ? '.big' : ''), { 'aria-hidden': 'true' }, [h('span', { text: p.icon })]);
  }
  UI.platIcon = platIcon;
  function homeView() {
    var st = UI.state, totalDone = Object.keys(st.done).length;
    var EXTRA = {
      wrangle: { id: 'wrangle', name: 'Data Wrangling Lab', icon: 'WR', tagline: 'Clean messy data for AI', lessons: ['wr1', 'wr2'],
        blurb: 'A real-world messy order feed: lost leading zeros, four date formats, fake nulls, messy names. Clean it, join it with VLOOKUP/HLOOKUP, get it AI-ready. NEW in v2.' },
      reference: { id: 'reference', name: 'Interactive Cheat Sheet', icon: '?!', tagline: 'Every task, every tool', lessons: [],
        blurb: 'Look up a task like "pad leading zeros" or "find nulls" and see the answer in Excel 365, Excel 2013, Google Sheets, SQL and CSV — then run it live.' }
    };
    function sumProgress(ids) {
      return ids.reduce(function (a, id) { var p = UI.platProgress(id); return { done: a.done + p.done, total: a.total + p.total, xp: a.xp + p.xp, maxXp: a.maxXp + p.maxXp }; }, { done: 0, total: 0, xp: 0, maxXp: 0 });
    }
    var cards = SX.platforms.ORDER.slice(0, 4).concat(['wrangle', 'sql', 'reference']).map(function (id) {
      var p = PL[id] || EXTRA[id], pr = EXTRA[id] ? sumProgress(EXTRA[id].lessons) : UI.platProgress(id);
      return h('button.plat-card.pc-' + id, { onclick: function () { UI.go(id); } }, [
        h('div.pc-top', null, [platIcon(p, true), h('div', null, [h('div.pc-name', { text: p.name }), h('div.pc-tag', { text: p.tagline })])]),
        h('p.pc-blurb', { text: p.blurb }),
        h('div.pc-progress', null, [
          h('div.pbar', null, h('div.pfill', { style: { width: (pr.total ? 100 * pr.done / pr.total : 0) + '%' } })),
          pr.total ? h('div.pc-stats', null, [h('span', { text: pr.done + '/' + pr.total + ' challenges' }), h('span', { text: pr.xp + '/' + pr.maxXp + ' XP' })]) : h('div.pc-stats', null, h('span', { text: 'Reference · try-it examples' }))
        ]),
        h('div.pc-go', { text: st.visited[id] ? 'Continue →' : 'Start →' })
      ]);
    });
    var cmpPr = UI.platProgress('compare');
    var errCount = Object.keys(st.errors).length;
    return h('main.home', null, [
      UI.storageOk ? null : h('div.warn.storage-warn', null, [h('b', { text: 'Saving is blocked in this browser. ' }), 'Your work disappears when you close this page. Before you leave, click your name ▸ Copy code, and paste the code somewhere safe.']),
      h('section.hero', null, [
        h('div.hero-text', null, [
          h('div.hero-kicker', { text: 'Welcome' + (st.name ? ', ' + st.name : '') + '! Your first day as a data analyst' }),
          h('h1', { html: 'One store. <span>Every tool.</span> Data an AI can trust.' }),
          h('p', { html: SX.data.COMPANY + ' keeps the same inventory and sales data in Excel 365, an old copy of Excel 2013, Google Sheets, plain CSV files, and a SQL database. Learn how each one thinks, clean messy data until it is ready for an AI model, and earn a certificate for every lesson.' })
        ]),
        h('div.hero-stats', null, [
          stat(UI.level(st.xp).n, 'Level'), stat(st.xp, 'XP'), stat(totalDone + '/' + SX.challenges.LIST.length, 'Challenges'), stat(errCount + '/9', 'Errors found')
        ])
      ]),
      h('h2.section-title', { text: 'Choose your workspace' }),
      h('div.plat-grid', null, cards),
      h('h2.section-title', { text: '🎓 Lessons & certificates' }),
      h('p.section-sub', { text: 'Finish every challenge in a lesson to earn its certificate. Print it, save it as a PDF or image, or paste its code into Canvas.' }),
      h('div.lesson-grid', null, SX.lessons.LIST.map(lessonTile)),
      h('div.extra-grid', null, [
        h('button.extra-card.cmp-card', { onclick: function () { UI.go('compare'); } }, [
          h('div.extra-icon', { text: '⚖️' }),
          h('div', null, [h('div.extra-name', { text: 'Compare platforms' }), h('div.extra-desc', { text: 'Run one formula in all three spreadsheet apps side-by-side, see which functions exist where, and translate spreadsheet ideas to SQL.' }),
            h('div.extra-meta', { text: cmpPr.done + '/' + cmpPr.total + ' quizzes' })])
        ]),
        h('button.extra-card', { onclick: UI.profile }, [
          h('div.extra-icon', { text: '🏅' }),
          h('div', null, [h('div.extra-name', { text: 'Badges & error collection' }),
            h('div.extra-desc', { text: Object.keys(st.badges).length + ' of ' + BADGES.length + ' badges unlocked. Every new error type you trigger earns XP.' }),
            h('div.err-strip', null, UI.ERROR_CODES.map(function (c) { return h('span.err-chip' + (st.errors[c] ? '.got' : ''), { text: st.errors[c] ? c : '?' }); }))])
        ])
      ]),
      h('footer.home-foot', { html: 'SheetEX is a classroom simulator — it mimics how each app behaves, but always double-check in the real software.' })
    ]);
  }
  function lessonTile(L) {
    var pr = UI.platProgress(L.id), done = pr.total && pr.done === pr.total;
    var has = UI.state.certs && UI.state.certs[L.id];
    return h('div.lesson-tile' + (done ? '.done' : ''), null, [
      h('div.lt-top', null, [h('span.lt-n', { text: L.n }), h('div', null, [h('div.lt-title', { text: L.title }), h('div.lt-tool', { text: L.tool })])]),
      h('div.pbar', null, h('div.pfill', { style: { width: (100 * pr.done / Math.max(1, pr.total)) + '%' } })),
      h('div.lt-foot', null, [
        h('span.small', { text: pr.done + '/' + pr.total + ' challenges' }),
        done ? h('button.btn.btn-sm.btn-primary', { text: has ? '🎓 Certificate' : '🎓 Claim certificate', onclick: function () { UI.showCert(L.id); } })
          : h('button.btn.btn-sm', { text: pr.done ? 'Continue →' : 'Start →', onclick: function () { UI.go(L.workspace); } })
      ])
    ]);
  }
  function stat(v, l) { return h('div.stat', null, [h('div.stat-v', { text: v }), h('div.stat-l', { text: l })]); }

  // ---------- Router ----------
  UI.current = 'home';
  UI.go = function (view) {
    if (UI.activeView && UI.activeView.destroy) UI.activeView.destroy();
    UI.activeView = null;
    UI.current = view;
    UI.state.ui.last = view;
    UI.render();
    window.scrollTo(0, 0);
  };
  UI.render = function () {
    var app = document.getElementById('app');
    app.innerHTML = '';
    app.appendChild(UI.header());
    var view = UI.current;
    if (view === 'home') { app.appendChild(homeView()); return; }
    var host = h('div.view-host');
    app.appendChild(host);
    if (SX.platforms.ORDER.indexOf(view) >= 0) UI.visit(view);
    if (view === 'xl365' || view === 'xl2013' || view === 'gs') UI.activeView = new UI.SheetView(view, host);
    else if (view === 'csv') UI.activeView = new UI.CsvView(host);
    else if (view === 'sql') UI.activeView = new UI.SqlView(host);
    else if (view === 'compare') UI.activeView = new UI.CompareView(host);
    else if (view === 'wrangle') UI.activeView = UI.wrangleView(host);
    else if (view === 'reference') UI.activeView = new UI.ReferenceView(host);
  };

  UI.start = function () {
    UI.render();
    if (!UI.state.name) {
      var inp = h('input.input', { maxlength: 40, placeholder: 'First and last name' });
      var done = function () { UI.state.name = inp.value.trim() || 'Analyst'; UI.save(); UI.refreshHeader(); UI.render(); };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { done(); document.querySelector('.modal-overlay').remove(); } });
      UI.modal('Welcome to ' + SX.data.COMPANY + '!', [
        h('p', { text: 'You were just hired as our new data analyst. Our data lives in five different tools, and they do not all speak the same language.' }),
        h('p', { text: 'Earn XP by solving challenges, discovering errors, and translating formulas between apps.' }),
        h('label.lbl', { text: 'What should we call you?' }), inp,
        SX.cloud && SX.cloud.available() ? h('p.small', null, [h('b', { text: 'Coming back? ' }), 'Type your name, start, then click your name ▸ Class cloud save ▸ Load.']) : null
      ], [{ text: 'Start my first day', primary: true, onclick: done }], { sticky: true, noX: true });
    }
  };

  // Shared side panel for challenges ---------------------------------------
  UI.challengePanel = function (plat, helpersFn, opts) {
    opts = opts || {};
    var wrap = h('div.ch-list');
    function card(ch) {
      var st = UI.state, done = !!st.done[ch.id], used = st.hints[ch.id] || 0;
      var msg = h('div.ch-msg');
      var hintBox = h('div.ch-hints');
      function showHints() {
        hintBox.innerHTML = '';
        for (var i = 0; i < used && i < ch.hints.length; i++) hintBox.appendChild(h('div.ch-hint', { html: '<b>Hint ' + (i + 1) + ':</b> ' + ch.hints[i] }));
      }
      showHints();
      var stars = new Array(ch.level + 1).join('★') + new Array(4 - ch.level).join('☆');
      var reward = done ? st.done[ch.id].xp : UI.challengeReward(ch);
      var el = h('div.ch-card' + (done ? '.done' : ''), { 'data-id': ch.id }, [
        h('div.ch-head', null, [
          h('span.ch-status', { text: done ? '✓' : '•' }),
          h('span.ch-title', { text: ch.title }),
          h('span.ch-xp', { text: (done ? '' : '') + reward + ' XP', title: done ? 'Earned' : 'Available (hints lower it)' })
        ]),
        h('div.ch-meta', null, [h('span.ch-stars', { text: stars, title: 'Difficulty' }), ch.target ? h('button.linkish', { text: 'Go to ' + ch.target, onclick: function () { if (opts.goTo) opts.goTo(ch.target); } }) : null]),
        h('div.ch-task', { html: ch.task })
      ]);
      if (ch.type === 'quiz') {
        var opts2 = h('div.quiz-opts', null, ch.options.map(function (o, i) {
          return h('button.quiz-opt' + (done && i === ch.answer ? '.right' : ''), { html: UI.esc(o), disabled: done, onclick: function (e) {
            if (i === ch.answer) {
              e.target.classList.add('right');
              msg.className = 'ch-msg good'; msg.innerHTML = '✓ Correct! ' + ch.learn;
              if (UI.completeChallenge(ch)) setTimeout(rerender, 900);
            } else {
              e.target.classList.add('wrong'); e.target.disabled = true;
              st.wrong[ch.id] = (st.wrong[ch.id] || 0) + 1; UI.save();
              msg.className = 'ch-msg bad'; msg.textContent = 'Not quite — try again. (Reward is now ' + UI.challengeReward(ch) + ' XP.)';
            }
          } });
        }));
        el.appendChild(opts2);
      }
      el.appendChild(hintBox);
      var btns = h('div.ch-btns');
      if (ch.type !== 'quiz' && !done) btns.appendChild(h('button.btn.btn-primary.btn-sm', { text: 'Check ✓', onclick: function () {
        var r;
        try { r = ch.check(helpersFn()); } catch (err) { r = { ok: false, msg: 'Could not check yet: ' + err.message }; }
        msg.className = 'ch-msg ' + (r.ok ? 'good' : 'bad');
        msg.innerHTML = (r.ok ? '✓ ' : '✗ ') + UI.esc(r.msg) + (r.ok ? '<div class="ch-learn"><b>Takeaway:</b> ' + ch.learn + '</div>' : '');
        if (r.ok && UI.completeChallenge(ch)) setTimeout(rerender, 2600);
      } }));
      if (!done && used < ch.hints.length) btns.appendChild(h('button.btn.btn-sm', { text: 'Hint (' + (ch.hints.length - used) + ' left)', onclick: function () {
        st.hints[ch.id] = (st.hints[ch.id] || 0) + 1; used = st.hints[ch.id]; UI.save(); rerender(ch.id);
      } }));
      if (done) btns.appendChild(h('div.ch-learn', { html: '<b>Takeaway:</b> ' + ch.learn }));
      el.appendChild(btns);
      el.appendChild(msg);
      return el;
    }
    var plats = Array.isArray(plat) ? plat : [plat];
    function rerender(openId) {
      wrap.innerHTML = '';
      var firstOpen = null;
      plats.forEach(function (lp) {
        var list = SX.challenges.forPlat(lp), pr = UI.platProgress(lp), lesson = SX.lessons && SX.lessons.byId(lp);
        if (!firstOpen) firstOpen = list.filter(function (c) { return !UI.state.done[c.id]; })[0];
        var complete = pr.total && pr.done === pr.total;
        wrap.appendChild(h('div.ch-summary' + (complete ? '.complete' : ''), null, [
          lesson ? h('div.ch-lesson', null, [h('span.ch-lesson-n', { text: 'Lesson ' + lesson.n }), h('b', { text: lesson.title })]) : null,
          h('div', { text: pr.done + ' of ' + pr.total + ' complete · ' + pr.xp + ' XP earned' }),
          h('div.pbar', null, h('div.pfill', { style: { width: (100 * pr.done / Math.max(1, pr.total)) + '%' } })),
          lesson ? h('button.btn.btn-sm.cert-btn' + (complete ? '.btn-primary' : ''), { disabled: !complete, title: complete ? 'Open your certificate' : 'Finish every challenge in this lesson to unlock it',
            text: complete ? '🎓 View my certificate' : '🔒 Certificate (finish all ' + pr.total + ')', onclick: function () { UI.showCert(lp); } }) : null
        ]));
        list.forEach(function (ch) {
          var c = card(ch);
          if (ch.id === openId || (!openId && firstOpen && ch.id === firstOpen.id)) c.classList.add('open');
          c.querySelector('.ch-head').addEventListener('click', function () { c.classList.toggle('open'); });
          wrap.appendChild(c);
        });
      });
      if (openId) { var o = wrap.querySelector('[data-id="' + openId + '"]'); if (o) setTimeout(function () { o.scrollIntoView({ block: 'nearest' }); }, 0); }
    }
    rerender();
    return wrap;
  };

  // Shared cheat-sheet pieces -----------------------------------------------
  UI.diffList = function (plat) {
    return h('div.cs-section', null, [h('h4', { text: 'What is different in ' + PL[plat].name }), h('ul.cs-diff', null, PL[plat].differences.map(function (d) { return h('li', { html: d }); }))]);
  };
  UI.keyTable = function (plat) {
    return h('div.cs-section', null, [h('h4', { text: 'Keyboard' }), h('table.cs-keys', null, PL[plat].keys.map(function (k) { return h('tr', null, [h('td', null, h('kbd', { text: k[0] })), h('td', { text: k[1] })]); }))]);
  };

  // Side panel shell with tabs
  UI.sidePanel = function (tabs, initial) {
    var panel = h('aside.side-panel');
    var bar = h('div.sp-tabs', { role: 'tablist' });
    var body = h('div.sp-body');
    var current = null;
    function show(id) {
      current = id;
      Array.prototype.forEach.call(bar.children, function (b) { b.classList.toggle('on', b.dataset.id === id); b.setAttribute('aria-selected', b.dataset.id === id); });
      body.innerHTML = '';
      var t = tabs.filter(function (x) { return x.id === id; })[0];
      body.appendChild(t.render());
    }
    tabs.forEach(function (t) { bar.appendChild(h('button.sp-tab', { 'data-id': t.id, role: 'tab', text: t.label, onclick: function () { show(t.id); } })); });
    panel.appendChild(bar); panel.appendChild(body);
    show(initial || tabs[0].id);
    return { el: panel, show: show, current: function () { return current; }, body: body };
  };
})(globalThis.SX = globalThis.SX || {});
