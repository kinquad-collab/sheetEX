/* SheetEX — sealed codes. SHA-256 + HMAC (RFC 2104) in plain JS, so it runs the same in browsers, in Apps Script
 * pages and in tests. Progress codes, certificate codes and the saved game are signed with a key made from a
 * program key and a CLASS KEY. When SheetEX is served by Google Apps Script, Code.gs swaps the class key below for a
 * random key that belongs to that deployment, so files made by any other copy of SheetEX are rejected.
 *
 * Honest limit: the key has to live inside the page for the page to sign codes. This stops edited files and edited
 * saves; it cannot stop someone who reads the page's source code with developer tools and re-implements the signing. */
(function (SX) {
  'use strict';

  // Replaced by Code.gs at serve time (exactly one occurrence of the marker must exist in the whole app).
  var CLASS_KEY = '__SX_CLASS_KEY__';
  var DEFAULT = CLASS_KEY.indexOf('__SX_' + 'CLASS') === 0;

  var A = [132, 17, 103, 79, 91, 244, 143, 142, 105, 74, 46, 76, 29, 159, 36, 50, 187, 35, 203, 166, 202, 150, 184, 104, 208, 6, 148, 187, 0, 160, 92, 66];
  var B = [107, 47, 156, 134, 121, 222, 185, 55, 200, 156, 58, 68, 114, 86, 180, 66, 58, 116, 37, 155, 206, 230, 254, 169, 198, 150, 37, 65, 15, 221, 136, 156];
  var BANK = [235, 193, 228, 128, 15, 199, 142, 188, 167, 193, 104, 101, 38, 61, 181, 119];

  // ---------- UTF-8 and base64url ----------
  function utf8(s) {
    s = unescape(encodeURIComponent(String(s)));
    var out = new Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function fromUtf8(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return decodeURIComponent(escape(s));
  }
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function b64u(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '') + (i + 2 < bytes.length ? B64[n & 63] : '');
    }
    return out;
  }
  function unb64u(s) {
    if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) throw new Error('bad base64');
    var out = [];
    for (var i = 0; i < s.length; i += 4) {
      var chunk = s.slice(i, i + 4), n = 0;
      for (var k = 0; k < 4; k++) n = n * 64 + (k < chunk.length ? B64.indexOf(chunk[k]) : 0);
      out.push((n >> 16) & 255);
      if (chunk.length > 2) out.push((n >> 8) & 255);
      if (chunk.length > 3) out.push(n & 255);
    }
    return out;
  }

  // ---------- SHA-256 ----------
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256(msg) {
    var bytes = typeof msg === 'string' ? utf8(msg) : msg.slice();
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (var s = 7; s >= 0; s--) bytes.push(s >= 4 ? Math.floor(bitLen / Math.pow(2, 8 * s)) & 255 : (bitLen >>> (8 * s)) & 255);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);
    for (var off = 0; off < bytes.length; off += 64) {
      for (var i = 0; i < 16; i++) w[i] = (bytes[off + 4 * i] << 24) | (bytes[off + 4 * i + 1] << 16) | (bytes[off + 4 * i + 2] << 8) | bytes[off + 4 * i + 3];
      for (i = 16; i < 64; i++) {
        var x = w[i - 15], y = w[i - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    var out = [];
    H.forEach(function (v) { out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); });
    return out;
  }
  function hmac(key, msg) {
    if (key.length > 64) key = sha256(key);
    var ipad = [], opad = [];
    for (var i = 0; i < 64; i++) { var k = key[i] || 0; ipad.push(k ^ 0x36); opad.push(k ^ 0x5c); }
    return sha256(opad.concat(sha256(ipad.concat(typeof msg === 'string' ? utf8(msg) : msg))));
  }
  function hex(bytes) { return bytes.map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join(''); }

  var KEY = sha256(A.map(function (v, i) { return v ^ B[i]; }).concat(utf8('|class|' + (DEFAULT ? 'default' : CLASS_KEY))));

  function mac(str, n) { return b64u(hmac(KEY, str).slice(0, n || 16)); }
  function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    var d = 0; for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }

  // PREFIX-<payload>.<signature>; the signature covers the prefix too, so a certificate can never pass as a progress code.
  function pack(prefix, obj) {
    var body = b64u(utf8(JSON.stringify(obj)));
    return prefix + '-' + body + '.' + mac(prefix + '.' + body);
  }
  function unpack(prefix, code) {
    var s = String(code == null ? '' : code).replace(/\s+/g, '');
    if (!s) return { ok: false, why: 'The code is empty.' };
    var m = /^([A-Z0-9]+)-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{22})$/.exec(s);
    if (!m) return { ok: false, why: 'That is not a SheetEX code — it does not have the right format. Copy the whole code, exactly as SheetEX made it.' };
    if (m[1] !== prefix) return { ok: false, why: 'That is a different kind of SheetEX code (' + m[1] + '), not a ' + prefix + ' code.' };
    if (!safeEqual(mac(prefix + '.' + m[2]), m[3])) return { ok: false, why: 'This code was changed after SheetEX made it, or it was made by a different copy of SheetEX. It cannot be used here.' };
    try { return { ok: true, obj: JSON.parse(fromUtf8(unb64u(m[2]))) }; }
    catch (e) { return { ok: false, why: 'The code is damaged.' }; }
  }

  // Answer fingerprints for the certification tests (fixed salt, so the bank can be built ahead of time).
  function answerHash(qid, norm) { return b64u(sha256(BANK.concat(utf8(qid + '|' + norm))).slice(0, 12)); }

  function normName(n) { return String(n || '').trim().replace(/\s+/g, ' ').toLowerCase(); }

  SX.seal = {
    sha256: sha256, hmac: hmac, hex: hex, utf8: utf8, fromUtf8: fromUtf8, b64u: b64u, unb64u: unb64u,
    mac: mac, pack: pack, unpack: unpack, answerHash: answerHash, normName: normName,
    isDefaultKey: function () { return DEFAULT; },
    fingerprint: function () { return mac('fingerprint', 4).toUpperCase().replace(/[-_]/g, 'X').slice(0, 5); }
  };
})(globalThis.SX = globalThis.SX || {});
