/**
 * tests/frontend-smoke.mjs — ui-craft render proxy for the ACTUAL src/AppJs.html.
 * Loads the real frontend script in vm with a stub DOM + stub Apps Script bridge,
 * dispatches DOMContentLoaded, and asserts the populated / empty / STOP states.
 * This is explicitly a code-level render proxy: no pixel screenshots are taken here.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(process.cwd());
const SRC = path.join(ROOT, 'src');
const raw = readFileSync(path.join(SRC, 'AppJs.html'), 'utf8');
const code = raw.replace('<script>', '').replace('</script>', '');

let pass = 0, fail = 0;
function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

function makeEl(id) {
  return {
    tagName: 'div', id: id || '', textContent: '', innerHTML: '', hidden: false,
    disabled: false, value: '', className: '', open: false, style: {}, children: [],
    appendChild(c) { this.children.push(c); return c; },
    setAttribute() {}, focus() {},
    addEventListener() {},
    showModal() { this.open = true; }, close() { this.open = false; }
  };
}

function baseDashboard(over = {}) {
  return {
    currentIntervalDays: 6, nextTargetDays: 12, nextTargetDate: '2026-10-18', daysRemaining: 6,
    goal: { goalMode: 'REDUCE_FREQUENCY', targetOccurrences: 2, targetPeriodDays: 7 },
    stats: {
      latestInterval: 6, averageInterval: 6, medianInterval: 6, longestInterval: 6,
      currentStreakDays: 6, recentFrequency7d: 1, trend: 'Improving', consistency: 'Steady'
    },
    aiInsight: 'Test insight sentence.', aiModel: 'stub-model',
    recentHistory: [
      { eventDate: '2026-10-06', count: 1, logId: 'a', interval: 6 },
      { eventDate: '2026-09-30', count: 1, logId: 'b', interval: null }
    ],
    today: '2026-10-06',
    ...over
  };
}

async function runWithDashboard(dashboard) {
  const els = new Map();
  const docListeners = {};
  const documentStub = {
    getElementById(id) {
      if (!els.has(id)) els.set(id, makeEl(id));
      return els.get(id);
    },
    createElement(tag) { const e = makeEl(''); e.tagName = tag; return e; },
    querySelector() { return { value: 'REDUCE_FREQUENCY', checked: true, addEventListener() {} }; },
    querySelectorAll() { return []; },
    addEventListener(t, fn) { docListeners[t] = fn; }
  };
  const status = {
    geminiConfigured: true, goalConfigured: true,
    goal: dashboard.goal
  };
  const bridge = {
    withSuccessHandler(okFn) {
      return {
        withFailureHandler() {
          return new Proxy({}, {
            get(t, fn) {
              return () => {
                if (fn === 'getAppStatus') okFn({ success: true, data: status });
                else if (fn === 'getDashboardData') okFn({ success: true, data: dashboard });
                else throw new Error('unexpected server fn in smoke test: ' + String(fn));
              };
            }
          });
        }
      };
    }
  };
  const sandbox = {
    document: documentStub,
    window: { google: { script: { run: bridge } } },
    google: { script: { run: bridge } },
    confirm: () => { throw new Error('confirm must not fire in smoke test'); },
    setTimeout, clearTimeout, console
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'AppJs.html' });
  if (typeof docListeners.DOMContentLoaded !== 'function') throw new Error('DOMContentLoaded handler not registered');
  docListeners.DOMContentLoaded();
  await new Promise(r => setTimeout(r, 100));
  return els;
}

// --- Populated state ---
{
  const els = await runWithDashboard(baseDashboard());
  const t = (id) => els.get(id);
  ok('smoke:keystate', t('keyState').textContent === 'Gemini connected', t('keyState').textContent);
  ok('smoke:target-number-unit-split',
    t('mTarget').innerHTML === '12<span class="unit">days</span>',
    t('mTarget').innerHTML);
  ok('smoke:remain', t('mRemain').textContent === '6 days remaining', t('mRemain').textContent);
  ok('smoke:target-date', t('targetDateLine').textContent === 'Aim for Oct 18', t('targetDateLine').textContent);
  ok('smoke:current', t('mCurrent').textContent === '6', t('mCurrent').textContent);
  ok('smoke:trend', t('trendLine').textContent.includes('improving'), t('trendLine').textContent);
  ok('smoke:goal-line', t('goalLine').textContent === 'Goal · 2 / 7 days', t('goalLine').textContent);
  ok('smoke:goal-chip-is-mode-not-duplicate',
    t('mGoal').textContent === 'Reduce' && !t('mGoal').textContent.includes('/'),
    JSON.stringify(t('mGoal').textContent));
  ok('smoke:stats-rows', t('statsKv').children.length === 8, String(t('statsKv').children.length));
  const feed = t('timeline').children;
  ok('smoke:feed-count', feed.length === 2, String(feed.length));
  const firstTitle = feed[0].children[0].children[0].innerHTML;
  ok('smoke:feed-humanized', firstTitle.includes('Today') && firstTitle.includes('1 occurrence'), firstTitle);
  ok('smoke:feed-no-iso-dup', !firstTitle.includes('2026-10-06'), firstTitle);
  ok('smoke:feed-date-in-title-attr', feed[0].title === '2026-10-06', JSON.stringify(feed[0].title));
  ok('smoke:avg-trimmed', t('statsKv').children[1].children[1].innerHTML === '6 days',
    JSON.stringify(t('statsKv').children[1].children[1].innerHTML));
  ok('smoke:feed-interval', feed[0].children[0].children[1].textContent === '6 days since previous');
  ok('smoke:feed-start-label', feed[1].children[0].children[1].textContent === 'Start of interval');
  ok('smoke:ai-meta-secondary', t('aiMeta').textContent === 'Model · stub-model', t('aiMeta').textContent);
  // alert element is only touched when a warning/error fires; absence means never shown.
  ok('smoke:no-alert', els.get('alert') === undefined, JSON.stringify(els.get('alert') && els.get('alert').hidden));
}

// --- Empty state ---
{
  const els = await runWithDashboard(baseDashboard({
    currentIntervalDays: null, nextTargetDays: null, nextTargetDate: null, daysRemaining: null,
    stats: { latestInterval: null, averageInterval: null, medianInterval: null, longestInterval: null, currentStreakDays: null, recentFrequency7d: 0, trend: null, consistency: null },
    aiInsight: '', aiModel: '', recentHistory: []
  }));
  const t = (id) => els.get(id);
  ok('smoke:empty-target-dash', t('mTarget').textContent === '—', JSON.stringify(t('mTarget').textContent));
  ok('smoke:empty-avg-dash', t('statsKv').children[1].children[1].innerHTML === '—',
    JSON.stringify(t('statsKv').children[1].children[1].innerHTML));
  const feed = t('timeline').children;
  ok('smoke:empty-feed', feed.length === 1 && feed[0].className === 'empty', String(feed.length));
}

// --- STOP mode: no duplicated Stop label ---
{
  const els = await runWithDashboard(baseDashboard({
    goal: { goalMode: 'STOP', targetOccurrences: null, targetPeriodDays: null }
  }));
  const t = (id) => els.get(id);
  ok('smoke:stop-goal-line', t('goalLine').textContent === 'Goal · Stop', t('goalLine').textContent);
  ok('smoke:stop-chip-hidden', t('mGoal').style.display === 'none', JSON.stringify(t('mGoal').style.display));
}

// Static guard for the stuck-indicator bug: author display rules must never
// override the hidden attribute (caught via pixel render, locked here).
{
  const css = readFileSync(path.join(SRC, 'Styles.html'), 'utf8');
  const guarded = css.includes('[hidden]');
  if (guarded) { pass++; console.log('PASS smoke:hidden-guard'); }
  else { fail++; console.log('FAIL smoke:hidden-guard — Styles.html must guard [hidden]'); }
  console.log(`\nTOTAL pass=${pass} fail=${fail}`);
}
process.exit(fail ? 1 : 0);
