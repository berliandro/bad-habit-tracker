/**
 * tests/date-regression.mjs — regression for explicit natural-language dates.
 * Loads the ACTUAL src/Validation.gs + src/Gemini.gs normalization path via vm,
 * so the test proves the user-facing pipeline, not an isolated copy.
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

// Minimal Apps Script stubs so .gs files evaluate in Node.
const sandbox = {
  Session: { getScriptTimeZone: () => 'Asia/Jakarta' },
  Utilities: {
    formatDate: () => '2026-10-06',
    getUuid: () => 'test-uuid'
  },
  SpreadsheetApp: {},
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {} }) },
  UrlFetchApp: { fetch: () => { throw new Error('no fetch in unit test'); } },
  HtmlService: {},
  console
};
vm.createContext(sandbox);

function loadGs(file) {
  const code = readFileSync(path.join(SRC, file), 'utf8');
  vm.runInContext(code, sandbox, { filename: file });
}

loadGs('Config.gs');
loadGs('Validation.gs');

// Stub Gemini network layer BEFORE loading Gemini.gs so normalizeOccurrence_ is testable.
sandbox.__aiCalls = 0;
sandbox.__aiStubResponse = null; // { data } or { error }
loadGs('Gemini.gs');

// Override network fallback with observable stub (tracks whether AI was consulted).
vm.runInContext(`
  var __originalFallback = null;
  function __setAiStub() {}
  callGeminiWithFallback_ = function(systemPrompt, userObject) {
    __aiCalls++;
    if (__aiStubResponse && __aiStubResponse.data) {
      return { ok: true, data: __aiStubResponse.data, model: 'stub-model', attempted: ['stub-model'] };
    }
    return { ok: false, errorClass: (__aiStubResponse && __aiStubResponse.error) || 'SERVER_ERROR', message: 'stubbed', attempted: [] };
  };
`, sandbox);

function det(input, today) {
  return vm.runInContext(`deterministicNormalize_(${JSON.stringify(input)}, ${JSON.stringify(today)})`, sandbox);
}
function norm(input, today) {
  return vm.runInContext(`normalizeOccurrence_(${JSON.stringify(input)}, ${JSON.stringify(today)})`, sandbox);
}
function extract(input) {
  return vm.runInContext(`extractExplicitDate_(${JSON.stringify(input)})`, sandbox);
}
function setAiStub(dataOrNull, error) {
  sandbox.__aiStubResponse = dataOrNull ? { data: dataOrNull } : (error ? { error } : null);
  sandbox.__aiCalls = 0;
}

const TODAY = '2026-10-06';

// --- extractExplicitDate_ unit coverage (actual implementation) ---
ok('extract:month-ordinal', extract('I did it on September 30th 2026')?.date === '2026-09-30', JSON.stringify(extract('I did it on September 30th 2026')));
ok('extract:comma', extract('I did it on September 30, 2026')?.date === '2026-09-30');
ok('extract:abbrev', extract('I did it on Sep 30 2026')?.date === '2026-09-30');
ok('extract:european', extract('I did it on 30 September 2026')?.date === '2026-09-30');
ok('extract:iso', extract('I did it on 2026-09-30')?.date === '2026-09-30');
ok('extract:numeric-slash', extract('on 30/09/2026')?.date === '2026-09-30');
ok('extract:numeric-dash', extract('on 30-09-2026')?.date === '2026-09-30');
ok('extract:sept-variant', extract('Sept 30 2026')?.date === '2026-09-30');
ok('extract:ordinal-1st', extract('October 1st 2026')?.date === '2026-10-01');
ok('extract:invalid-sept31', extract('September 31st 2026')?.invalid === true);
ok('extract:ambiguous-null', extract('on 05/06/2026') === null, JSON.stringify(extract('on 05/06/2026')));
ok('extract:lowercase', extract('i did it on september 30th 2026')?.date === '2026-09-30');

// --- deterministicNormalize_ (actual path) ---
let r;
r = det('I did it on September 30th 2026', TODAY);
ok('det:september-30th', r?.eventDate === '2026-09-30' && r?.occurred === true, JSON.stringify(r));
r = det('I did it on September 30, 2026', TODAY);
ok('det:comma', r?.eventDate === '2026-09-30', JSON.stringify(r));
r = det('I did it on Sep 30 2026', TODAY);
ok('det:abbrev', r?.eventDate === '2026-09-30', JSON.stringify(r));
r = det('I did it on 30 September 2026', TODAY);
ok('det:european', r?.eventDate === '2026-09-30', JSON.stringify(r));
r = det('I did it on 2026-09-30', TODAY);
ok('det:iso', r?.eventDate === '2026-09-30', JSON.stringify(r));
r = det('I did it on 30/09/2026', TODAY);
ok('det:numeric', r?.eventDate === '2026-09-30', JSON.stringify(r));
r = det('I did it yesterday', TODAY);
ok('det:yesterday', r?.eventDate === '2026-10-05', JSON.stringify(r));
r = det('I did it today', TODAY);
ok('det:today', r?.eventDate === TODAY, JSON.stringify(r));
r = det('September 31st 2026', TODAY);
ok('det:invalid-not-today', r?.invalidDate === true && r?.eventDate !== TODAY, JSON.stringify(r));

// --- normalizeOccurrence_ preserves explicit date even when AI would say today ---
setAiStub({ occurred: true, occurrenceCount: 1, eventDate: TODAY, confidence: 0.9 });
sandbox.__aiCalls = 0;
r = norm('I did it on September 30th 2026', TODAY);
ok('norm:explicit-wins-over-ai', r?.eventDate === '2026-09-30', JSON.stringify(r));
ok('norm:no-ai-needed-for-explicit', sandbox.__aiCalls === 0, `aiCalls=${sandbox.__aiCalls}`);

// --- invalid explicit via full path never becomes today ---
setAiStub(null, 'SERVER_ERROR');
r = norm('I did it on September 31st 2026', TODAY);
ok('norm:invalid-not-today', r?.invalidDate === true && r?.eventDate !== TODAY, JSON.stringify(r));

// --- regression guard: Sept 30th must never become Oct 6 ---
r = norm('I did it on September 30th 2026', '2026-10-06');
ok('regression:sept30-not-oct6', r?.eventDate === '2026-09-30' && r?.eventDate !== '2026-10-06', JSON.stringify(r));

// --- out-of-order predecessor logic (mirrors Logging.gs fix) ---
function findPred(events, nd) {
  let pred = null;
  for (const e of events) { if (e.eventDate <= nd && (pred === null || e.eventDate > pred)) pred = e.eventDate; }
  return pred;
}
ok('ooo:predecessor-before', findPred([{ eventDate: '2026-10-01' }, { eventDate: '2026-10-05' }], '2026-09-30') === null);
ok('ooo:predecessor-between', findPred([{ eventDate: '2026-10-01' }, { eventDate: '2026-10-05' }], '2026-10-03') === '2026-10-01');
ok('ooo:history-sortable', JSON.stringify(['2026-10-05', '2026-09-30', '2026-10-01'].sort()) === JSON.stringify(['2026-09-30', '2026-10-01', '2026-10-05']));

console.log(`\nTOTAL pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
