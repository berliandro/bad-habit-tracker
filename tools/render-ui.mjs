/**
 * tools/render-ui.mjs — ui-craft render harness (pixel screenshots, not a code proxy).
 * Builds standalone HTML from the ACTUAL src/*.html (Apps Script tags stubbed),
 * injects a mock google.script.run bridge with deterministic fixtures per mode,
 * and captures desktop + mobile screenshots with headless Chrome.
 *
 * Usage: node tools/render-ui.mjs [--chrome "C:\...\chrome.exe"]
 * Output: %TEMP%\opencode\uicraft\<mode>-<width>.png
 *
 * Modes: populated | empty | stop
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(process.cwd());
const SRC = path.join(ROOT, 'src');
const OUT = path.join(os.tmpdir(), 'opencode', 'uicraft');
mkdirSync(OUT, { recursive: true });

const APP_NAME = 'Bad Habit Frequency Reducer';

function baseDashboard(over = {}) {
  return {
    currentIntervalDays: 6, nextTargetDays: 12, nextTargetDate: '2026-10-18', daysRemaining: 6,
    goal: { goalMode: 'REDUCE_FREQUENCY', targetOccurrences: 2, targetPeriodDays: 7 },
    stats: {
      latestInterval: 6, averageInterval: 6, medianInterval: 6, longestInterval: 6,
      currentStreakDays: 6, recentFrequency7d: 1, trend: 'Improving', consistency: 'Steady'
    },
    aiInsight: 'Your intervals are holding steady around 6 days. Hold the 12-day target once more before pushing further.',
    aiModel: 'gemini-3.5-flash-lite',
    recentHistory: [
      { eventDate: '2026-10-06', count: 1, logId: 'a', interval: 6 },
      { eventDate: '2026-09-30', count: 1, logId: 'b', interval: null },
      { eventDate: '2026-09-24', count: 1, logId: 'c', interval: 6 }
    ],
    today: '2026-10-06',
    ...over
  };
}

const EMPTY_DASH = baseDashboard({
  currentIntervalDays: null, nextTargetDays: null, nextTargetDate: null, daysRemaining: null,
  stats: { latestInterval: null, averageInterval: null, medianInterval: null, longestInterval: null, currentStreakDays: null, recentFrequency7d: 0, trend: null, consistency: null },
  aiInsight: '', aiModel: '', recentHistory: []
});

const STOP_DASH = baseDashboard({ goal: { goalMode: 'STOP', targetOccurrences: null, targetPeriodDays: null } });

const MODES = {
  populated: { status: { geminiConfigured: true, goalConfigured: true, goal: baseDashboard().goal }, dash: baseDashboard() },
  empty: { status: { geminiConfigured: true, goalConfigured: true, goal: baseDashboard().goal }, dash: EMPTY_DASH },
  stop: { status: { geminiConfigured: true, goalConfigured: true, goal: STOP_DASH.goal }, dash: STOP_DASH }
};

function buildHtml(mode) {
  const { status, dash } = MODES[mode];
  let index = readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  const styles = readFileSync(path.join(SRC, 'Styles.html'), 'utf8');
  const appjs = readFileSync(path.join(SRC, 'AppJs.html'), 'utf8');
  const bridge = `<script>
window.__FIXTURE__ = { status: ${JSON.stringify(status)}, dash: ${JSON.stringify(dash)} };
window.google = { script: { run: {
  withSuccessHandler: function (ok) {
    return {
      withFailureHandler: function () {
        return new Proxy({}, {
          get: function (t, fn) {
            return function () {
              if (fn === 'getAppStatus') { ok({ success: true, data: window.__FIXTURE__.status }); }
              else if (fn === 'getDashboardData') { ok({ success: true, data: window.__FIXTURE__.dash }); }
            };
          }
        });
      }
    };
  }
}}};
</script>`;
  index = index.split('<?= appName ?>').join(APP_NAME);
  index = index.replace(`<?!= include('Styles'); ?>`, () => styles);
  index = index.replace(`<?!= include('AppJs'); ?>`, () => bridge + '\n' + appjs);
  return index;
}

function findChrome() {
  const arg = process.argv.find((a) => a.startsWith('--chrome='));
  if (arg) return arg.slice('--chrome='.length);
  const cands = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];
  for (const c of cands) {
    try { readFileSync(c); return c; } catch { /* next */ }
  }
  throw new Error('No Chrome/Edge binary found; pass --chrome=<path>');
}

const chrome = findChrome();
const shots = [];
for (const mode of Object.keys(MODES)) {
  const htmlPath = path.join(OUT, `render-${mode}.html`);
  writeFileSync(htmlPath, buildHtml(mode));
  for (const w of [1280, 390]) {
    const h = w === 390 ? 1600 : 1100;
    const png = path.join(OUT, `${mode}-${w}.png`);
    const url = 'file:///' + htmlPath.replace(/\\/g, '/');
    execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      `--window-size=${w},${h}`, '--virtual-time-budget=6000',
      `--screenshot=${png}`, url
    ], { stdio: 'pipe', timeout: 90000 });
    shots.push(png);
    console.log('shot', png);
  }
}
console.log('done');
