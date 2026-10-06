/**
 * Main.gs — webapp entry.
 */

function doGet() {
  var t = HtmlService.createTemplateFromFile('Index');
  t.appName = APP_NAME;
  return t.evaluate()
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
