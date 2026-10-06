/**
 * SheetEX — Google Apps Script web app.
 * Serves the single-file app in Index.html. ALLOWALL lets Canvas embed it in an iframe.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('SheetEX — Spreadsheet Explorer')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
