/**
 * Storage.gs — spreadsheet + properties helpers.
 * Idempotent initialization. Uses existing spreadsheet; never creates a second one normally.
 */

function getScriptProps_() {
  return PropertiesService.getScriptProperties();
}

function getStoredSpreadsheetId_() {
  try {
    return getScriptProps_().getProperty(PROP_SPREADSHEET_ID) || '';
  } catch (e) {
    return '';
  }
}

function setStoredSpreadsheetId_(id) {
  getScriptProps_().setProperty(PROP_SPREADSHEET_ID, String(id || ''));
}

function getSpreadsheet_() {
  // Prefer bound spreadsheet when available.
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e) { /* standalone: fall through */ }
  var storedId = getStoredSpreadsheetId_();
  if (storedId) {
    try {
      return SpreadsheetApp.openById(storedId);
    } catch (e) {
      throw new Error('Stored spreadsheet ID is invalid or inaccessible. Update SPREADSHEET_ID property.');
    }
  }
  throw new Error('No spreadsheet available. Bind this script to the existing spreadsheet or set SPREADSHEET_ID property.');
}

function getOrCreateSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function ensureHeaders_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headerRange = sheet.getRange(1, 1, 1, SCHEMA.length);
  var existing = headerRange.getValues()[0] || [];
  var changed = false;
  for (var i = 0; i < SCHEMA.length; i++) {
    if (String(existing[i] || '').trim() !== SCHEMA[i]) {
      // Only fill empty cells or repair mismatched header cells in row 1 cols 1..SCHEMA.length.
      // Never insert duplicate header rows.
      headerRange.getCell(1, i + 1).setValue(SCHEMA[i]);
      changed = true;
    }
  }
  // Freeze header + basic formatting once (safe to repeat).
  try {
    sheet.setFrozenRows(1);
  } catch (e) {}
  void lastCol;
  void changed;
  return true;
}

/**
 * Idempotent setup. Safe to run repeatedly.
 * - identifies existing spreadsheet (bound or stored ID)
 * - locates or creates worksheet
 * - validates/adds headers without duplicates
 * - establishes defaults (goal settings placeholder left unset; API key untouched)
 */
function initializeApp() {
  var ss = getSpreadsheet_();
  // Persist the resolved ID for standalone reliability.
  try {
    setStoredSpreadsheetId_(ss.getId());
  } catch (e) {}
  var sheet = getOrCreateSheet_();
  ensureHeaders_(sheet);
  var goal = getGoalSettingsInternal_();
  var keyConfigured = isGeminiConfiguredInternal_();
  return okResponse_({
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    sheetName: SHEET_NAME,
    headers: SCHEMA.slice(),
    goalConfigured: !!goal,
    geminiConfigured: !!keyConfigured,
    timeZone: getAppTimeZone_()
  });
}

function sheetRowsToObjects_() {
  var sheet = getOrCreateSheet_();
  ensureHeaders_(sheet);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = SCHEMA.length;
  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var out = [];
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    if (!row[0] && !row[2]) continue; // skip fully empty rows
    var obj = {};
    for (var c = 0; c < SCHEMA.length; c++) obj[SCHEMA[c]] = row[c];
    obj._rowNumber = r + 2;
    out.push(obj);
  }
  return out;
}

function appendLogRow_(fields) {
  var sheet = getOrCreateSheet_();
  ensureHeaders_(sheet);
  var row = [];
  for (var i = 0; i < SCHEMA.length; i++) {
    var h = SCHEMA[i];
    row.push(fields[h] !== undefined && fields[h] !== null ? fields[h] : '');
  }
  sheet.appendRow(row);
  return sheet.getLastRow();
}

function updateLogRow_(rowNumber, fields) {
  var sheet = getOrCreateSheet_();
  for (var i = 0; i < SCHEMA.length; i++) {
    var h = SCHEMA[i];
    if (fields[h] !== undefined) {
      sheet.getRange(rowNumber, i + 1).setValue(fields[h]);
    }
  }
}

function findRowByLogId_(logId) {
  var rows = sheetRowsToObjects_();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['Log ID']) === String(logId)) return rows[i];
  }
  return null;
}

function deleteRowByLogId_(logId) {
  var found = findRowByLogId_(logId);
  if (!found) return false;
  var sheet = getOrCreateSheet_();
  sheet.deleteRow(found._rowNumber);
  return true;
}

// ---- internal settings access (server-side) ----

function getGoalSettingsInternal_() {
  try {
    var raw = getScriptProps_().getProperty(PROP_GOAL_SETTINGS);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!parsed || !parsed.goalMode) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function saveGoalSettingsInternal_(goalMode, targetCount, targetPeriodDays) {
  var payload = {
    goalMode: goalMode,
    targetOccurrences: targetCount || null,
    targetPeriodDays: targetPeriodDays || null,
    updatedAt: new Date().toISOString()
  };
  getScriptProps_().setProperty(PROP_GOAL_SETTINGS, JSON.stringify(payload));
  return payload;
}

function isGeminiConfiguredInternal_() {
  try {
    var k = getScriptProps_().getProperty(PROP_GEMINI_API_KEY);
    return !!(k && String(k).trim().length >= 10);
  } catch (e) {
    return false;
  }
}

function getGeminiApiKeyInternal_() {
  try {
    return getScriptProps_().getProperty(PROP_GEMINI_API_KEY) || '';
  } catch (e) {
    return '';
  }
}
