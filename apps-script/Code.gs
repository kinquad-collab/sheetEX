/**
 * SheetEX v2 — Google Apps Script web app + optional class gradebook.
 *
 * Deploy as a Web app that executes as YOU. The first time a student earns a certificate
 * (or you run setup() once from the editor), a Google Sheet called "SheetEX Gradebook" is created
 * in your Drive with two tabs:
 *   Certificates — one row per certificate earned (name, lesson, XP, hints, verification code)
 *   Saves        — class cloud saves, so students can continue on another day / computer
 */
var BOOK_TITLE = 'SheetEX Gradebook';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('SheetEX — Spreadsheet Explorer')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Run this once from the Apps Script editor to create the gradebook and print its link. */
function setup() {
  var ss = getBook_();
  Logger.log('SheetEX Gradebook: ' + ss.getUrl());
  return ss.getUrl();
}

function getBook_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEETEX_BOOK_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* deleted — make a new one */ }
  }
  var ss = SpreadsheetApp.create(BOOK_TITLE);
  var certs = ss.getSheets()[0];
  certs.setName('Certificates');
  certs.appendRow(['Received', 'Student', 'Lesson', 'Lesson ID', 'XP', 'Max XP', 'Hints used', 'Challenges', 'Certificate code']);
  certs.setFrozenRows(1);
  certs.getRange('1:1').setFontWeight('bold');
  var saves = ss.insertSheet('Saves');
  saves.appendRow(['Key', 'Student', 'Last saved', 'Progress code']);
  saves.setFrozenRows(1);
  saves.getRange('1:1').setFontWeight('bold');
  saves.hideColumns(1);
  props.setProperty('SHEETEX_BOOK_ID', ss.getId());
  if (!props.getProperty('SHEETEX_SALT')) props.setProperty('SHEETEX_SALT', Utilities.getUuid());
  return ss;
}

function clean_(s, max) {
  return String(s === null || s === undefined ? '' : s).replace(/[\u0000-\u001f]/g, '').slice(0, max || 100);
}
// Never let student text start with = + - @ (it would run as a formula in your spreadsheet).
function safe_(s, max) {
  s = clean_(s, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }

/** Called by the app when a student earns a lesson certificate. */
function sxRecordCertificate(c) {
  if (!c || typeof c !== 'object') throw new Error('Missing certificate.');
  var code = String(c.code || '');
  if (!/^SXC1-[A-Za-z0-9_-]+-[a-z0-9]+$/.test(code) || code.length > 2000) throw new Error('That is not a SheetEX certificate code.');
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    getBook_().getSheetByName('Certificates').appendRow([
      new Date(), safe_(c.name, 60), safe_(c.lesson, 80), safe_(c.lessonId, 20),
      num_(c.xp), num_(c.maxXp), num_(c.hints), num_(c.challenges), code
    ]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function key_(name, pin) {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('SHEETEX_SALT');
  if (!salt) { salt = Utilities.getUuid(); props.setProperty('SHEETEX_SALT', salt); }
  var norm = String(name).trim().replace(/\s+/g, ' ').toLowerCase();
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, norm + '|' + pin + '|' + salt);
  return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}
function checkCreds_(name, pin) {
  if (!/\S+\s+\S+/.test(String(name || '')) || String(name).length > 60) throw new Error('Use your first and last name.');
  if (!/^\d{4,8}$/.test(String(pin || ''))) throw new Error('Your PIN must be 4–8 digits.');
}
function findSave_(sheet, key) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var keys = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) if (keys[i][0] === key) return i + 2;
  return 0;
}

/** Save a student's progress code under name + PIN. */
function sxSaveProgress(name, pin, code) {
  checkCreds_(name, pin);
  code = String(code || '');
  if (!/^SX1-[A-Za-z0-9+/=]+-[a-z0-9]+$/.test(code) || code.length > 45000) throw new Error('That progress data could not be saved.');
  var key = key_(name, pin);
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sheet = getBook_().getSheetByName('Saves');
    var row = findSave_(sheet, key);
    var values = [[key, safe_(name, 60), new Date(), code]];
    if (row) sheet.getRange(row, 1, 1, 4).setValues(values);
    else sheet.appendRow(values[0]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

/** Load a student's progress code by name + PIN. */
function sxLoadProgress(name, pin) {
  checkCreds_(name, pin);
  var sheet = getBook_().getSheetByName('Saves');
  var row = findSave_(sheet, key_(name, pin));
  if (!row) return { ok: false, error: 'No save found for that name and PIN. Check the spelling of your name and your PIN.' };
  var v = sheet.getRange(row, 1, 1, 4).getValues()[0];
  return { ok: true, code: String(v[3]), savedAt: new Date(v[2]).getTime() };
}
