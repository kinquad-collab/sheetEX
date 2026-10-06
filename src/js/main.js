/* SheetEX — boot */
(function (SX) {
  'use strict';
  function boot() {
    try { SX.ui.start(); }
    catch (e) {
      document.getElementById('app').innerHTML = '<div style="padding:24px;font-family:sans-serif"><h2>SheetEX could not start</h2><pre>' +
        String(e && e.stack || e).replace(/</g, '&lt;') + '</pre></div>';
      throw e;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(globalThis.SX = globalThis.SX || {});
