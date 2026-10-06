/**
 * tests/days-remaining-regression.mjs — Days Remaining "—" bug.
 * Loads ACTUAL src/Validation.gs + src/Logging.gs target selection via vm.
 * Proves Date-object cells and out-of-order rows no longer yield null.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(process.cwd());
const SRC = path.join(ROOT, 'src');
let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const sandbox = {
  Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
  Utilities: {
    formatDate: (d, tz, fmt) => {
      const dt = d instanceof Date ? d : new Date(d);
      const y = dt.getUTCFullYear();
      const m = ('0' + (dt.getUTCMonth() + 1)).slice(-2);
      const day = ('0' + dt.getUTCDate()).slice(-2);
      return `${y}-${m}-${day}`;
    },
    getUuid: () => 'test-uuid'
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => null },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  UrlFetchApp: { fetch: () => { throw new Error('no fetch'); } },
  HtmlService: {},
  console
};
vm.createContext(sandbox);
function loadGs(f) { vm.runInContext(readFileSync(path.join(SRC, f), 'utf8'), sandbox, { filename: f }); }
loadGs('Config.gs');
loadGs('Validation.gs');
loadGs('Logging.gs');

function callExpr(expr) { return vm.runInContext(expr, sandbox); }

// 1. Date object normalization (the primary bug)
const dObj = new Date(Date.UTC(2026, 9, 18)); // 2026-10-18 UTC
const normDate = callExpr(`normalizeSheetDate_(new Date(Date.UTC(2026, 9, 18)))`);
ok('sheetdate:date-object', normDate === '2026-10-18', JSON.stringify(normDate));
void dObj;

// Old broken path proof: String(date).slice(0,10) is NOT a valid date
const broken = String(new Date(Date.UTC(2026, 9, 18))).slice(0, 10);
const brokenValid = callExpr(`isValidDateString_(${JSON.stringify(broken)})`);
ok('sheetdate:old-path-was-broken', brokenValid === false, JSON.stringify(broken));

// String cases still work
ok('sheetdate:iso-string', callExpr(`normalizeSheetDate_('2026-10-18')`) === '2026-10-18');
ok('sheetdate:iso-datetime', callExpr(`normalizeSheetDate_('2026-10-18T00:00:00.000Z')`) === '2026-10-18');
ok('sheetdate:empty-null', callExpr(`normalizeSheetDate_('')`) === null);
ok('sheetdate:garbage-null', callExpr(`normalizeSheetDate_('not a date')`) === null);

// 2. Target row selection prefers chronologically latest, not last inserted
sandbox.__rowsOOO = [
  { 'Event Date': '2026-10-05', 'Final Target Days': 12, 'Next Target Date': '2026-10-17', 'Log ID': 'a' },
  { 'Event Date': '2026-09-30', 'Final Target Days': 7, 'Next Target Date': '2026-10-07', 'Log ID': 'b' }
];
const pickedOOO = vm.runInContext(`selectDashboardTargetRow_(__rowsOOO)`, sandbox);
ok('target:chronological-not-insertion', pickedOOO && pickedOOO['Log ID'] === 'a', JSON.stringify(pickedOOO && pickedOOO['Log ID']));

// 3. Date-object Next Target Date rows are selectable and yield valid date
sandbox.__rowsDateObj = [
  { 'Event Date': new Date(Date.UTC(2026, 9, 6)), 'Final Target Days': 12, 'Next Target Date': new Date(Date.UTC(2026, 9, 18)), 'Log ID': 'x' }
];
const pickedDate = vm.runInContext(`selectDashboardTargetRow_(__rowsDateObj)`, sandbox);
ok('target:date-object-row', pickedDate && pickedDate['Log ID'] === 'x', JSON.stringify(pickedDate && pickedDate['Log ID']));
const pickedNextDate = vm.runInContext(`normalizeSheetDate_(selectDashboardTargetRow_(__rowsDateObj)['Next Target Date'])`, sandbox);
ok('target:date-object-next-date', pickedNextDate === '2026-10-18', JSON.stringify(pickedNextDate));

// 4. daysRemaining math end-to-end (diff today -> next target)
const remain = callExpr(`diffDaysBetween_('2026-10-06', '2026-10-18')`);
ok('remain:12-days', remain === 12, String(remain));

// 5. Empty rows -> null (frontend correctly shows em-dash only when no data)
sandbox.__rowsEmpty = [];
ok('target:empty-null', vm.runInContext(`selectDashboardTargetRow_(__rowsEmpty)`, sandbox) === null);

console.log(`\nTOTAL pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
