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
  // The save is split in two: CORE (name, XP, challenges, tests, certificates) is sealed with SX.seal so editing it
  // in the browser's storage makes the whole save invalid; the rest (spreadsheets, files, settings) is plain.
  var KEY = 'sheetex.v2';
  var CORE = ['name', 'sid', 'xp', 'done', 'hints', 'wrong', 'errors', 'badges', 'visited', 'stats', 'certs', 'tests', 'created'];
  function storageGet(k) { try { return window.localStorage.getItem(k || KEY); } catch (e) { return null; } }
  function storageSet(v) { try { window.localStorage.setItem(KEY, v); return true; } catch (e) { return false; } }
  function freshState() {
    return { v: 2, name: '', sid: '', xp: 0, done: {}, hints: {}, wrong: {}, errors: {}, badges: {}, visited: {},
      stats: { formulas: 0, queries: 0, compat: 0, noHint: 0 }, certs: {}, tests: {}, created: 0,
      wb: {}, db: null, files: null, colw: {}, ui: {} };
  }
  UI.freshState = freshState;
  // Once a name is set it can never be changed: the property becomes read-only for the life of the page.
  function lockIdentity(st) {
    if (!st.name) return st;
    ['name', 'sid'].forEach(function (k) { Object.defineProperty(st, k, { value: st[k], writable: false, enumerable: true, configurable: false }); });
    return st;
  }
  UI.lockIdentity = lockIdentity;
  function serialize(st) {
    var core = {}; CORE.forEach(function (k) { core[k] = st[k]; });
    var coreJson = JSON.stringify(core);
    return JSON.stringify({ v: 2, core: coreJson, sig: SX.seal.mac('save|' + coreJson), wb: st.wb, db: st.db, files: st.files, colw: st.colw, ui: st.ui });
  }
  UI.serializeState = serialize;
  UI.loadNotice = null;
  function loadState(raw) {
    var st = freshState();
    if (!raw) return st;
    var o = JSON.parse(raw);
    if (!o || o.v !== 2 || typeof o.core !== 'string' || typeof o.sig !== 'string' || SX.seal.mac('save|' + o.core) !== o.sig) {
      UI.loadNotice = 'The progress saved in this browser was changed outside SheetEX, so it could not be loaded. You are starting fresh. If you have a progress code, you can load it.';
      return st;
    }
    var core = JSON.parse(o.core);
    CORE.forEach(function (k) { if (core[k] !== undefined) st[k] = core[k]; });
    ['wb', 'db', 'files', 'colw', 'ui'].forEach(function (k) { if (o[k] != null) st[k] = o[k]; });
    return lockIdentity(st);
  }
  UI.loadState = loadState;
  UI.state = freshState();
  try { UI.state = loadState(storageGet()); } catch (e) { UI.state = freshState(); }
  UI.storageOk = storageSet(serialize(UI.state));

  var saveTimer = null;
  function saveNow() {
    clearTimeout(saveTimer);
    Object.keys(UI.wbs).forEach(function (p) { UI.state.wb[p] = UI.wbs[p].serialize(); });
    if (UI.db) UI.state.db = UI.db.serialize();
    if (UI.files) UI.state.files = UI.files;
    storageSet(serialize(UI.state));
  }
  UI.saveNow = saveNow;
  UI.save = function () { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 300); };
  // Replace everything on this computer (used by "start over" and when loading someone's code on a fresh identity).
  UI.replaceState = function (st) {
    UI.state = st; UI.wbs = {}; UI.db = null; UI.files = null; saveNow();
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
      Object.keys(fresh.tables).forEach(function (k) {
        var mine = UI.db.tables[k], f = fresh.tables[k];
        if (!mine) { UI.db.tables[k] = f; return; }
        if ((!mine.pk || !mine.pk.length) && f.pk.length) { // older save: add the keys and rules of the real database
          ['pk', 'uniques', 'fks', 'checks', 'notNull', 'strict'].forEach(function (m) { mine[m] = f[m]; });
          mine.cols.forEach(function (c) { var fc = f.cols.filter(function (x) { return x.name === c.name; })[0]; if (fc) { c.pk = fc.pk; c.notNull = fc.notNull; c.ref = fc.ref; } });
        }
      });
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
    { id: 'rollback', icon: '⏪', name: 'Undo Button', desc: 'Use ROLLBACK to undo a transaction.', xp: 10 },
    { id: 'oops', icon: '😬', name: 'Learned the Hard Way', desc: 'Run UPDATE or DELETE without WHERE.', xp: 5 },
    { id: 'no-hints', icon: '🧠', name: 'No Hints Needed', desc: 'Finish 5 challenges without hints.', xp: 25 },
    { id: 'done-xl365', icon: '🟩', name: 'Excel 365 Pro', desc: 'Finish every Excel 365 challenge.', xp: 30 },
    { id: 'done-xl2013', icon: '⏳', name: 'Time Traveler', desc: 'Finish every Excel 2013 challenge.', xp: 30 },
    { id: 'done-gs', icon: '🟦', name: 'Sheets Specialist', desc: 'Finish every Google Sheets challenge.', xp: 30 },
    { id: 'done-csv', icon: '📄', name: 'File Whisperer', desc: 'Finish every CSV/TSV challenge.', xp: 30 },
    { id: 'done-sql', icon: '🔮', name: 'SQL Sorcerer', desc: 'Finish every SQL challenge.', xp: 30 },
    { id: 'researcher', icon: '📚', name: 'Researcher', desc: 'Run 10 examples in the Interactive Cheat Sheet.', xp: 15 },
    { id: 'ai-ready', icon: '🤖', name: 'AI-Ready Data', desc: 'Reach an AI-readiness score of 100 in the Data Wrangling Lab.', xp: 40 },
    { id: 'done-rdbms', icon: '🗃️', name: 'Database Architect', desc: 'Finish Lesson 9: What is an RDBMS?', xp: 30 },
    { id: 'done-ml', icon: '🧠', name: 'Data Scientist', desc: 'Finish Lesson 10: Databases for Machine Learning.', xp: 30 },
    { id: 'certified', icon: '🎓', name: 'Certified', desc: 'Pass your first certification test.', xp: 25 },
    { id: 'ace', icon: '💯', name: 'Perfect Score', desc: 'Score 100% on a certification test.', xp: 40 },
    { id: 'cert-5', icon: '🏛️', name: 'Five Certificates', desc: 'Earn 5 certificates.', xp: 50 },
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
    if (after.n > before.n) { clearTimeout(levelTimer); levelTimer = setTimeout(function () { whenFree(function () { levelUp(UI.level(UI.state.xp)); }); }, 600); }
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
    var focusEl = box.querySelector('input, textarea') || box.querySelector('.btn-primary') || box.querySelector('.modal-foot button, button');
    if (focusEl) setTimeout(function () { focusEl.focus(); }, 30);
    return { close: close, el: box };
  };

  var levelTimer = null, shownLevel = 0;
  // Celebrate only when nothing else is on screen (a test result, a certificate), and only once per level.
  function whenFree(fn) {
    if (document.querySelector('.modal-overlay, #cert-overlay, .test-overlay')) { setTimeout(function () { whenFree(fn); }, 700); return; }
    fn();
  }
  function levelUp(lv) {
    if (lv.n <= shownLevel) return;
    shownLevel = lv.n;
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

  // ---------- Identity, progress codes and profile ----------
  // A name is First + Last, letters only (plus spaces, hyphens, apostrophes and periods).
  UI.validName = function (v) {
    v = String(v || '').trim().replace(/\s+/g, ' ');
    if (v.length < 3 || v.length > 40) return null;
    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ'’.\- ]+$/.test(v) || !/\S+ \S+/.test(v)) return null;
    return v;
  };
  function newSid() {
    var b = [];
    try { var a = new Uint8Array(9); window.crypto.getRandomValues(a); b = Array.prototype.slice.call(a); }
    catch (e) { for (var i = 0; i < 9; i++) b.push(Math.floor(Math.random() * 256)); }
    return SX.seal.b64u(b);
  }
  UI.setIdentity = function (name, sid) {
    if (UI.state.name) return false; // already locked — never changes
    UI.state.name = name; UI.state.sid = sid || newSid(); UI.state.created = UI.state.created || Date.now();
    lockIdentity(UI.state); saveNow();
    return true;
  };

  var ID_RE = /^[A-Za-z0-9_-]{12}$/;
  function isInt(x, lo, hi) { return typeof x === 'number' && Math.floor(x) === x && x >= lo && x <= hi; }
  function onlyKeys(o, allowed) { return o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).every(function (k) { return allowed.indexOf(k) >= 0; }); }
  function lessonIds() { return SX.lessons.LIST.map(function (l) { return l.id; }); }
  // Strict shape check: a code must look EXACTLY like one SheetEX makes, or it is refused.
  UI.validProgress = function (p) {
    if (!onlyKeys(p, ['n', 'i', 'x', 'd', 'b', 'e', 'c', 'ts', 't'])) return 'unexpected fields';
    if (UI.validName(p.n) !== p.n) return 'bad name';
    if (typeof p.i !== 'string' || !ID_RE.test(p.i)) return 'bad id';
    if (!isInt(p.x, 0, 100000) || !isInt(p.t, 1.6e12, 4e12)) return 'bad numbers';
    if (!onlyKeys(p.d, Object.keys(p.d || {}))) return 'bad challenges';
    var ok = Object.keys(p.d).every(function (k) { var v = p.d[k]; return SX.challenges.byId(k) && Array.isArray(v) && v.length === 2 && isInt(v[0], 0, 1000) && isInt(v[1], 0, 10); });
    if (!ok) return 'bad challenges';
    var badgeIds = BADGES.map(function (x) { return x.id; });
    if (!Array.isArray(p.b) || !p.b.every(function (x) { return badgeIds.indexOf(x) >= 0; })) return 'bad badges';
    if (!Array.isArray(p.e) || !p.e.every(function (x) { return UI.ERROR_CODES.indexOf(x) >= 0; })) return 'bad errors';
    var L = lessonIds();
    if (!onlyKeys(p.c, L) || !Object.keys(p.c).every(function (k) { return isInt(p.c[k], 1.6e12, 4e12); })) return 'bad certificates';
    if (!onlyKeys(p.ts, L)) return 'bad tests';
    ok = Object.keys(p.ts).every(function (k) {
      var t = p.ts[k];
      return onlyKeys(t, ['b', 'q', 'a', 'p', 's']) && isInt(t.q, 1, 50) && isInt(t.b, 0, t.q) && isInt(t.a, 1, 999) && isInt(t.s, 0, 86400) && (t.p === 0 || isInt(t.p, 1.6e12, 4e12));
    });
    return ok ? '' : 'bad tests';
  };
  UI.progressCode = function () {
    var st = UI.state, d = {}, c = {}, ts = {};
    Object.keys(st.done).forEach(function (k) { d[k] = [st.done[k].xp | 0, st.done[k].hints | 0]; });
    Object.keys(st.certs || {}).forEach(function (k) { if (st.certs[k] && st.certs[k].t) c[k] = st.certs[k].t; });
    Object.keys(st.tests || {}).forEach(function (k) { var t = st.tests[k]; if (t && t.attempts) ts[k] = { b: t.best | 0, q: t.of | 0, a: t.attempts | 0, p: t.passed || 0, s: t.secs | 0 }; });
    return SX.seal.pack('SXP2', { n: st.name, i: st.sid, x: st.xp | 0, d: d, b: Object.keys(st.badges), e: Object.keys(st.errors), c: c, ts: ts, t: Date.now() });
  };
  // -> { ok, p } or { ok:false, why }
  UI.readProgress = function (code) {
    var r = SX.seal.unpack('SXP2', code);
    if (!r.ok) return r;
    var bad = UI.validProgress(r.obj);
    if (bad) return { ok: false, why: 'This code does not have the exact format SheetEX makes (' + bad + '). It cannot be used.' };
    return { ok: true, p: r.obj };
  };
  function applyProgress(st, p) {
    st.xp = Math.max(st.xp, p.x);
    Object.keys(p.d).forEach(function (k) { if (!st.done[k]) st.done[k] = { xp: p.d[k][0], at: p.t, hints: p.d[k][1] }; });
    p.b.forEach(function (b) { st.badges[b] = st.badges[b] || p.t; });
    p.e.forEach(function (e) { st.errors[e] = st.errors[e] || p.t; });
    Object.keys(p.ts).forEach(function (k) {
      var t = p.ts[k], mine = st.tests[k] || { best: 0, of: t.q, attempts: 0, passed: 0, secs: 0 };
      if (t.b / t.q > mine.best / Math.max(1, mine.of)) { mine.best = t.b; mine.of = t.q; mine.secs = t.s; }
      mine.attempts = Math.max(mine.attempts, t.a);
      if (t.p && (!mine.passed || t.p < mine.passed)) mine.passed = t.p;
      st.tests[k] = mine;
    });
  }
  // Load a progress code. Same student: merge (never lowers anything). Nobody here yet: become that student.
  // A different student: replace everything (the name in a code can never be changed).
  UI.restoreFromCode = function (code, opts) {
    var r = UI.readProgress(code);
    if (!r.ok) return r;
    var p = r.p;
    if (UI.state.name && UI.state.sid === p.i) { applyProgress(UI.state, p); saveNow(); return { ok: true, merged: true, name: p.n }; }
    if (UI.state.name && !(opts && opts.replace)) return { ok: false, other: true, name: p.n, why: 'This code belongs to ' + p.n + '.' };
    var st = freshState();
    st.name = p.n; st.sid = p.i; st.created = p.t;
    applyProgress(st, p);
    if (UI.state.ui) st.ui = { guideSeen: UI.state.ui.guideSeen, wrIntro: UI.state.ui.wrIntro, wrIntroDone: UI.state.ui.wrIntroDone };
    UI.replaceState(lockIdentity(st));
    return { ok: true, name: p.n };
  };

  UI.profile = function () {
    var st = UI.state, lv = UI.level(st.xp);
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
    var loadIn = h('textarea.input.code-box', { rows: 2, placeholder: 'Paste a progress code here (SXP2-…)' });
    var loadMsg = h('div.small');
    UI.modal('Your profile', [
      h('div.profile-top', null, [
        h('div.big-level', null, [h('div.big-level-n', { text: lv.n }), h('div', { text: lv.title })]),
        h('div', null, [h('div.lbl', { text: 'Name on your certificates' }), h('div.locked-name', null, [h('span', { text: '🔒 ' }), h('b', { text: st.name })]),
          h('div.small', { text: st.xp + ' XP total · ' + Object.keys(st.done).length + '/' + SX.challenges.LIST.length + ' challenges' })])
      ]),
      h('h3', { text: 'Badges' }), badgeGrid,
      h('h3', { text: 'Error collection (' + Object.keys(st.errors).length + '/' + UI.ERROR_CODES.length + ')' }), errGrid,
      h('h3', { text: 'Certificates' }),
      h('div.cert-list', null, SX.lessons.LIST.map(function (L) {
        var ok = UI.lessonCertified && UI.lessonCertified(L.id);
        return h('button.chip' + (ok ? '' : '.chip-off'), { disabled: !ok, text: (ok ? '🎓 ' : '🔒 ') + L.n + '. ' + L.title, onclick: function () { UI.showCert(L.id); } });
      })),
      h('h3', { text: 'Progress code' }),
      h('p.small', { text: 'Your progress code carries your name, XP, challenges and test results. It is sealed: if anyone changes even one character, SheetEX refuses it. Use it to continue on another computer.' }),
      codeBox,
      h('div.row', null, [h('button.btn', { text: 'Copy code', onclick: function () { codeBox.select(); copyText(code); UI.toast('Copied!', 'Progress code copied to the clipboard.'); } })]),
      h('details.load-code', null, [h('summary', { text: 'Load a progress code from another computer' }), loadIn, h('div.row', null, [
        h('button.btn', { text: 'Load progress', onclick: function () {
          var r = UI.restoreFromCode(loadIn.value);
          if (r.ok) { UI.render(); loadMsg.className = 'small good'; loadMsg.textContent = 'Progress loaded and merged.'; return; }
          loadMsg.className = 'small bad';
          loadMsg.textContent = r.other ? 'That code belongs to ' + r.name + ', not to you. Your name cannot be changed, so it was not loaded.' : r.why;
        } })
      ]), loadMsg]),
      h('details.danger-zone', null, [h('summary', { text: 'Wrong name? Start over' }),
        h('p.small', { text: 'Your name is locked once it is set. If it is misspelled, the only fix is to erase everything on this computer (XP, badges, test results, certificates and your work) and start again with the right name.' }),
        h('button.btn.btn-danger', { text: 'Erase everything and start over', onclick: function () {
          UI.confirm('Erase everything?', 'All XP, badges, test results, certificates and your work in every app will be deleted from this browser. This cannot be undone.', 'Erase everything', function () {
            UI.replaceState(freshState());
            document.querySelectorAll('.modal-overlay').forEach(function (m) { m.remove(); }); UI.go('home'); UI.start();
          });
        } })])
    ], [{ text: 'Done', primary: true }], { cls: 'wide' });
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
        h('li', { html: 'Finish a lesson\'s practice to unlock its <b>certification test</b>: 10 questions, no hints, 80% to pass. Passing earns the certificate.' }),
        h('li', { html: '<b>Cheat Sheet</b> lists what is different on that platform, plus every function it supports.' }),
        h('li', { html: '<b>Will it work elsewhere?</b> runs your formula in Excel 365, Excel 2013 and Google Sheets at the same time and suggests a rewrite.' }),
        h('li', { html: 'Discover new error types (like <code>#SPILL!</code>) for bonus XP.' }),
        h('li', { html: 'Your work saves automatically in this browser. Your name is locked once you type it. Use your <b>progress code</b> (click your name) to continue on another computer.' })
      ]),
      h('p.small', { text: 'Privacy: SheetEX sends nothing anywhere. Your progress stays in this browser until you copy your own code.' }),
      h('p.small', { text: 'SheetEX is a practice simulator. It copies how these apps behave for the functions it supports, but it is not the real software. When in doubt, test it in the real app!' }),
      UI.storageOk ? null : h('p.warn', { text: 'Heads up: this browser is blocking saving. Your progress will be lost when you close the page — copy your progress code before leaving!' }),
      h('details.load-code', null, [h('summary', { text: 'For teachers: check codes and certificates' }), teacherTool()])
    ], [{ text: 'Got it', primary: true }], { cls: 'wide' });
  };
  function teacherTool() {
    var ta = h('textarea.input.code-box', { rows: 5, placeholder: 'Paste codes here — one per line, or a whole Canvas export. Anything that is not a code is ignored.' });
    var out = h('div');
    function fmtD(t) { return new Date(t).toLocaleDateString(); }
    function table(head, rows) {
      return h('table.cs-keys', null, [h('tr', null, head.map(function (x) { return h('th', { text: x }); }))].concat(rows));
    }
    function run() {
      out.innerHTML = '';
      var found = ta.value.match(/SX[A-Z0-9]*-[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]*)?/g) || [];
      if (!found.length) { out.appendChild(h('p.small', { text: 'No codes found yet.' })); return; }
      var certRows = [], progRows = [], badRows = [];
      found.forEach(function (c) {
        if (c.indexOf('SXC2-') === 0) {
          var d = SX.lessons.readCert(c);
          if (!d.ok) { badRows.push([c, d.why]); return; }
          d = d.cert;
          certRows.push(h('tr', null, ['✓ ' + SX.seal.printId(d.name, d.lesson), d.name, d.n + '. ' + d.title, d.score + '/' + d.of + ' (' + Math.round(100 * d.score / d.of) + '%)',
            d.attempts, d.xp + '/' + d.maxXp, d.hints, fmtD(d.time)].map(function (x) { return h('td', { text: String(x) }); })));
        } else if (c.indexOf('SXP2-') === 0) {
          var r = UI.readProgress(c);
          if (!r.ok) { badRows.push([c, r.why]); return; }
          var p = r.p, passed = Object.keys(p.ts).filter(function (k) { return p.ts[k].p; });
          progRows.push(h('tr', null, [p.n, UI.level(p.x).n + ' ' + UI.level(p.x).title, p.x, Object.keys(p.d).length + '/' + SX.challenges.LIST.length,
            passed.length + '/' + SX.lessons.LIST.length, p.b.length, fmtD(p.t)].map(function (x) { return h('td', { text: String(x) }); })));
        } else badRows.push([c, 'Old or unknown kind of code — not made by this version of SheetEX.']);
      });
      if (certRows.length) { out.appendChild(h('h4', { text: 'Certificates' })); out.appendChild(table(['ID', 'Name', 'Lesson', 'Test', 'Attempts', 'XP', 'Hints', 'Date'], certRows)); }
      if (progRows.length) { out.appendChild(h('h4', { text: 'Progress codes' })); out.appendChild(table(['Name', 'Level', 'XP', 'Challenges', 'Tests passed', 'Badges', 'Saved'], progRows)); }
      if (badRows.length) {
        out.appendChild(h('h4', { text: '⚠ Rejected codes' }));
        out.appendChild(table(['Code', 'Why'], badRows.map(function (b) { return h('tr.bad-row', null, [h('td', { text: b[0].slice(0, 28) + '…' }), h('td', { text: b[1] })]); })));
      }
    }
    ta.addEventListener('input', run);
    // Check a printed / image certificate by name + lesson + ID
    var nm = h('input.input', { placeholder: 'Student name exactly as printed' });
    var ls = h('select.input', null, SX.lessons.LIST.map(function (l) { return h('option', { value: l.id, text: l.n + '. ' + l.title }); }));
    var idIn = h('input.input', { placeholder: 'ID, e.g. K7QX-M2PA', maxlength: 9 });
    var pmsg = h('div.small');
    function checkPrint() {
      var want = SX.seal.printId(nm.value, ls.value), got = idIn.value.trim().toUpperCase();
      if (!nm.value.trim() || got.length < 9) { pmsg.className = 'small'; pmsg.textContent = ''; return; }
      pmsg.className = 'small ' + (want === got ? 'good' : 'bad');
      pmsg.textContent = want === got ? '✓ Genuine: this ID was issued to ' + nm.value.trim() + ' for that lesson.' : '✗ Does not match. Check the spelling of the name and the lesson — or the certificate was not issued by this SheetEX.';
    }
    [nm, ls, idIn].forEach(function (x) { x.addEventListener('input', checkPrint); x.addEventListener('change', checkPrint); });
    return h('div', null, [
      h('p.small', { html: 'Paste progress codes (<code>SXP2-…</code>) and certificate codes (<code>SXC2-…</code>). Every code is sealed with this class\'s key (fingerprint <b>' + SX.seal.fingerprint() + '</b>): an edited code, or one made by a different copy of SheetEX, is listed under <i>Rejected</i>.' }),
      SX.seal.isDefaultKey() ? h('p.small.warn', { text: 'This copy is not running from your Apps Script deployment, so it uses the built-in key. Check codes in the same copy your students use.' }) : null,
      ta, out,
      h('h4', { text: 'Check a printed certificate' }),
      h('div.print-check', null, [nm, ls, idIn]), pmsg
    ]);
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
      rdbms: { id: 'rdbms', name: 'What is an RDBMS?', icon: 'DB', tagline: 'Tables, keys & transactions', lessons: ['rdbms'],
        blurb: 'Why real data lives in a relational database: break a spreadsheet, follow keys across tables, watch the database refuse bad data, and survive a power failure with a transaction.' },
      ml: { id: 'ml', name: 'ML Data Lab', icon: 'ML', tagline: 'Databases for machine learning', lessons: ['ml'],
        blurb: 'Get a real training table ready for an AI model: find the label, count the classes, catch test rows that leaked into training, spot a cheating column, and grade a model with a confusion matrix.' },
      reference: { id: 'reference', name: 'Interactive Cheat Sheet', icon: '?!', tagline: 'Every task, every tool', lessons: [],
        blurb: 'Look up a task like "pad leading zeros" or "find nulls" and see the answer in Excel 365, Excel 2013, Google Sheets, SQL and CSV — then run it live.' }
    };
    function sumProgress(ids) {
      return ids.reduce(function (a, id) { var p = UI.platProgress(id); return { done: a.done + p.done, total: a.total + p.total, xp: a.xp + p.xp, maxXp: a.maxXp + p.maxXp }; }, { done: 0, total: 0, xp: 0, maxXp: 0 });
    }
    var cards = SX.platforms.ORDER.slice(0, 4).concat(['wrangle', 'sql', 'rdbms', 'ml', 'reference']).map(function (id) {
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
      h('p.section-sub', { text: 'Practice first — hints are always there. Then pass the lesson\'s certification test (no hints, ' + SX.certtest.SIZE + ' questions, ' + Math.round(SX.certtest.PASS * 100) + '% to pass) to earn its certificate.' }),
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
    var cert = UI.lessonCertified(L.id), t = UI.state.tests[L.id];
    return h('div.lesson-tile' + (cert ? '.done' : done ? '.ready' : ''), null, [
      h('div.lt-top', null, [h('span.lt-n', { text: L.n }), h('div', null, [h('div.lt-title', { text: L.title }), h('div.lt-tool', null, [L.tool, ' · ', h('button.linkish', { text: '📖 Guide', onclick: function () { UI.showGuide(L.id); } })])])]),
      h('div.pbar', null, h('div.pfill', { style: { width: (100 * pr.done / Math.max(1, pr.total)) + '%' } })),
      h('div.lt-foot', null, [
        h('span.small', { text: cert ? '✓ Test passed ' + t.best + '/' + t.of : done ? (t && t.attempts ? 'Test: best ' + t.best + '/' + t.of : 'Practice done') : pr.done + '/' + pr.total + ' practice' }),
        cert ? h('button.btn.btn-sm.btn-primary', { text: '🎓 Certificate', onclick: function () { UI.showCert(L.id); } })
          : done ? h('button.btn.btn-sm.btn-primary.test-btn', { text: '📝 Take the test', onclick: function () { UI.startTest(L.id); } })
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
    else if (view === 'rdbms') UI.activeView = new UI.RdbmsView(host);
    else if (view === 'ml') UI.activeView = new UI.MlView(host);
    // first visit: open the lesson guide (after the view exists)
    var lessonsHere = SX.lessons.LIST.filter(function (l) { return l.workspace === view; }).map(function (l) { return l.id; });
    if (lessonsHere.length && UI.maybeGuide && !(view === 'wrangle' && !UI.state.ui.wrIntroDone)) UI.maybeGuide(lessonsHere);
  };

  UI.start = function () {
    UI.render();
    if (UI.loadNotice) { var n = UI.loadNotice; UI.loadNotice = null; UI.modal('Saved progress not loaded', [h('p', { text: n })], [{ text: 'OK', primary: true, onclick: function () { setTimeout(UI.start, 50); } }], { sticky: true }); return; }
    if (!UI.state.name) welcome();
  };
  // First visit: a permanent name, or load an existing progress code.
  function welcome() {
    var inp = h('input.input', { maxlength: 40, placeholder: 'First and last name', 'aria-label': 'First and last name' });
    var err = h('div.small.bad');
    var codeIn = h('textarea.input.code-box', { rows: 2, placeholder: 'Paste your progress code (SXP2-…)' });
    var codeMsg = h('div.small.bad.code-msg');
    function next() {
      var v = UI.validName(inp.value);
      if (!v) { err.textContent = 'Type your first AND last name, using letters only — for example: Jordan Smith'; inp.focus(); return false; }
      document.querySelectorAll('.modal-overlay').forEach(function (m) { m.remove(); });
      UI.modal('Is this exactly right?', [
        h('div.name-confirm', { text: v }),
        h('p', { html: 'This name goes on every certificate you earn. <b>Once you continue it can never be changed</b> — not even by you. Check the spelling and capital letters.' })
      ], [{ text: '← Fix it', onclick: function () { setTimeout(welcome, 30); } }, { text: 'Yes, lock it in', primary: true, onclick: function () { UI.setIdentity(v); UI.refreshHeader(); UI.render(); } }], { sticky: true, noX: true });
      return false;
    }
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); next(); } });
    UI.modal('Welcome to ' + SX.data.COMPANY + '!', [
      h('p', { text: 'You were just hired as our new data analyst. Our data lives in several different tools, and they do not all speak the same language.' }),
      h('p', { text: 'Earn XP by solving challenges, then pass each lesson\'s certification test to earn its certificate.' }),
      h('label.lbl', { text: 'Your first and last name (as your teacher knows you)' }), inp, err,
      h('details.load-code', null, [h('summary', { text: 'Coming back on a different computer? Load your progress code' }), codeIn,
        h('div.row', null, h('button.btn', { text: 'Load my progress', onclick: function () {
          var r = UI.restoreFromCode(codeIn.value);
          if (!r.ok) { codeMsg.textContent = r.why; return; }
          document.querySelectorAll('.modal-overlay').forEach(function (m) { m.remove(); });
          UI.refreshHeader(); UI.render(); UI.toast('Welcome back, ' + r.name + '!', 'Your progress was loaded.');
        } })), codeMsg])
    ], [{ text: 'Continue', primary: true, onclick: next }], { sticky: true, noX: true });
  }

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
          lesson ? h('div.ch-lesson', null, [h('span.ch-lesson-n', { text: 'Lesson ' + lesson.n }), h('b', { text: lesson.title }),
            lesson.guide ? h('button.linkish.guide-link', { text: '📖 Guide', onclick: function () { UI.showGuide(lp); } }) : null]) : null,
          h('div', { text: pr.done + ' of ' + pr.total + ' complete · ' + pr.xp + ' XP earned' }),
          h('div.pbar', null, h('div.pfill', { style: { width: (100 * pr.done / Math.max(1, pr.total)) + '%' } })),
          lesson ? (function () {
            var certified = UI.lessonCertified(lp);
            return h('button.btn.btn-sm.cert-btn' + (complete ? '.btn-primary' : ''), { disabled: !complete, title: complete ? '' : 'Finish every practice challenge to unlock the certification test',
              text: certified ? '🎓 View my certificate' : complete ? '📝 Take the certification test' : '🔒 Certification test (finish all ' + pr.total + ')',
              onclick: function () { if (certified) UI.showCert(lp); else UI.startTest(lp); } });
          })() : null
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
