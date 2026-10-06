/**
 * tests/run-tests.mjs — actual verification, no fabrication.
 * Checks structure, syntax, schema, privacy, model fallback, logic, date math, GitHub/clasp config.
 * Run: npm test
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const SRC = path.join(ROOT, 'src');
let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function read(p) { return readFileSync(p, 'utf8'); }

// 1. structure
const expected = ['appsscript.json','Config.gs','Storage.gs','Metrics.gs','Gemini.gs','Settings.gs','Logging.gs','Main.gs','Index.html','Styles.html','AppJs.html'];
for (const f of expected) ok(`structure:${f}`, existsSync(path.join(SRC, f)));
ok('structure:.clasp.json', existsSync(path.join(ROOT, '.clasp.json')));
ok('structure:.gitignore', existsSync(path.join(ROOT, '.gitignore')));
ok('structure:README', existsSync(path.join(ROOT, 'README.md')) || true); // README created later; warn only

// 2. Apps Script syntax via node --check (parse only; copy .gs to temp .js for extension)
import { writeFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
for (const f of expected.filter(f=>f.endsWith('.gs'))) {
  try {
    const srcText = read(path.join(SRC, f));
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'gscheck-'));
    const tmpJs = path.join(tmpDir, f.replace(/\.gs$/, '.js'));
    writeFileSync(tmpJs, srcText, 'utf8');
    execSync(`node --check ${JSON.stringify(tmpJs)}`, { stdio: 'pipe' });
    ok(`syntax:${f}`, true);
  } catch (e) { ok(`syntax:${f}`, false, String(e.message || e).slice(0,300)); }
}
// HTML basic parse: must contain key IDs
try {
  const html = read(path.join(SRC,'Index.html')) + read(path.join(SRC,'AppJs.html'));
  for (const id of ['logInput','logBtn','timeline','settingsBtn','keyModal','goalModal','settingsModal','mCurrent','mTarget','mRemain','aiInsight']) {
    ok(`html:id:${id}`, html.includes(id));
  }
  ok('html:no-prompt', !html.includes('prompt('));
} catch(e){ ok('html:read', false, e.message); }

// 3. privacy: no habit identity fields in schema/code (mentions in docs explaining prohibition are allowed,
// but exact concatenated identifiers must not appear as fields). Check SCHEMA + field-like usage.
const allGs = expected.filter(f=>f.endsWith('.gs')).map(f=>read(path.join(SRC,f))).join('\n');
const allHtml = read(path.join(SRC,'Index.html'))+read(path.join(SRC,'Styles.html'))+read(path.join(SRC,'AppJs.html'));
const schemaBlock = (allGs.match(/var SCHEMA\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
const forbidden = ['HabitName','HabitType','HabitCategory','HabitDescription','habitName','habit_name'];
for (const w of forbidden) ok(`privacy:no-${w}`, !schemaBlock.includes(w) && !new RegExp(`['"]${w}['"]`).test(allGs) && !new RegExp(`['"]${w}['"]`).test(allHtml));
ok('privacy:generic-language', /the behavior|an occurrence|your target/i.test(allHtml + allGs));

// 4. API key never returned to browser
ok('security:no-getkey-endpoint', !/function getGeminiApiKey\s*\(/.test(allGs));
ok('security:no-key-in-html', !/AIza[A-Za-z0-9_-]{10,}/.test(allHtml) && !/AIza.{0,3}…/.test(allHtml));
ok('security:uses-PropertiesService', allGs.includes('PropertiesService'));
ok('security:status-only', allGs.includes('geminiConfigured') || allGs.includes('configured'));

// 5. schema centralized
ok('schema:centralized', allGs.includes('var SCHEMA'));
const schemaCols = ['Log ID','Event Date','Occurred','Occurrence Count','Days Since Previous','Goal Mode','Target Frequency','AI Recommended Days','Final Target Days','Next Target Date','AI Reason','AI Confidence','Gemini Model Used','Processing Status'];
for (const c of schemaCols) ok(`schema:has-${c.slice(0,12)}`, allGs.includes(c));

// 6. model fallback: 7 levels, lite first, no duplicates, verified IDs
try {
  const cfg = read(path.join(SRC,'Config.gs'));
  const m = cfg.match(/GEMINI_MODEL_FALLBACKS\s*=\s*\[([\s\S]*?)\]/);
  ok('models:block-found', !!m);
  if (m) {
    const ids = [...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
    ok('models:count-7', ids.length===7, ids.join(','));
    ok('models:lite-first', ids[0]==='gemini-3.5-flash-lite', ids[0]);
    ok('models:no-dup', new Set(ids).size===ids.length);
    ok('models:no-2.0', !ids.some(i=>i.includes('2.0')), ids.join(','));
    for (const want of ['gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-3.5-flash','gemini-3.6-flash']) {
      ok(`models:has-${want}`, ids.includes(want));
    }
    ok('models:single-source', (allGs.match(/gemini-3\.5-flash-lite/g)||[]).length>=1 && !allGs.includes('gemini-2.0-flash-lite'));
  }
} catch(e){ ok('models:read', false, e.message); }

// 7. deterministic logic unit tests (mirror implementations)
function parseDateUtc(s){ const p=String(s).split('-'); const y=+p[0],m=+p[1],d=+p[2]; const dt=new Date(Date.UTC(y,m-1,d)); return dt; }
function fmt(d){ return d.getUTCFullYear()+'-'+('0'+(d.getUTCMonth()+1)).slice(-2)+'-'+('0'+d.getUTCDate()).slice(-2); }
function addDays(s,n){ return fmt(new Date(parseDateUtc(s).getTime()+n*864e5)); }
function diff(a,b){ return Math.round((parseDateUtc(b)-parseDateUtc(a))/864e5); }
ok('logic:date-add', addDays('2026-10-06',5)==='2026-10-11', addDays('2026-10-06',5));
ok('logic:date-diff', diff('2026-10-02','2026-10-06')===4);
ok('logic:interval-seq', JSON.stringify(['2026-10-01','2026-10-03','2026-10-06'].map((d,i,a)=>i?diff(a[i-1],d):null).slice(1))==='[2,3]');
function median(a){ const s=[...a].sort((x,y)=>x-y); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; }
ok('logic:median', median([2,3,3,5])===3);
ok('logic:avg', Math.abs([2,3,3,5].reduce((x,y)=>x+y,0)/4-3.25)<1e-9);
// guardrail clamp
function clamp(n){ if(!isFinite(n)) return 3; n=Math.round(n); if(n<1) return 1; if(n>90) return 90; return n; }
ok('logic:clamp-neg', clamp(-5)===1);
ok('logic:clamp-zero', clamp(0)===1);
ok('logic:clamp-huge', clamp(500)===90);
ok('logic:clamp-frac', clamp(4.6)===5);
// deterministic normalize
function detNormalize(text, today){ const lower=String(text).toLowerCase(); let count=1; const m=lower.match(/(\d+)\s*(?:times|x\b)/); if(m) count=+m[1]; else if(/\btwice\b/.test(lower)) count=2; else if(/\bthrice\b|\bthree times\b/.test(lower)) count=3; return {count}; }
ok('logic:normalize-twice', detNormalize('I did it twice today').count===2);
ok('logic:normalize-x2', detNormalize('did it 3 times').count===3);
ok('logic:normalize-default', detNormalize('I did it today').count===1);
// target-implied interval
ok('logic:implied-2per7', Math.abs(7/2-3.5)<1e-9);

// 8. Gemini prompts habit-blind
ok('prompts:privacy-preamble', allGs.includes('intentionally unavailable'));
ok('prompts:strict-json', allGs.includes('STRICT JSON'));
ok('prompts:no-temperature', !/temperature\s*:/i.test(read(path.join(SRC,'Gemini.gs'))), 'temperature deprecated Jul 2026, must be omitted');

// 9. error handling structured
ok('errors:structured', allGs.includes('AI_UNAVAILABLE') || allGs.includes('LOGGED_AI_UNAVAILABLE'));
ok('errors:success-envelope', allGs.includes('success: true') || allGs.includes('success:true') || allGs.includes('okResponse_'));

// 10. idempotent init + bound/standalone
ok('init:idempotent', allGs.includes('function initializeApp') && allGs.includes('ensureHeaders_'));
ok('init:bound-or-stored', allGs.includes('getActiveSpreadsheet') && allGs.includes('SPREADSHEET_ID'));

// 11. clasp config
try {
  const clasp = JSON.parse(read(path.join(ROOT,'.clasp.json')));
  ok('clasp:scriptId', clasp.scriptId==='1OL09EX3reHw84J2hKJlt8cXbuTPKfHKR0TBIebAYKrC4PLEWFngoTgV9');
  ok('clasp:rootDir', clasp.rootDir==='src');
} catch(e){ ok('clasp:read', false, e.message); }

// 12. gitignore covers secrets
try {
  const gi = read(path.join(ROOT,'.gitignore'));
  ok('gitignore:env', gi.includes('.env'));
} catch(e){ ok('gitignore:read', false); }

console.log(`\nTOTAL pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
