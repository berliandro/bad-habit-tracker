# Bad Habit Frequency Reducer

Polished personal web application for gradually reducing the frequency of a behavior — or optionally stopping completely — without the system ever knowing what the behavior is.

> This app intentionally does not need to know what habit you are tracking. It stores occurrence timing and frequency statistics.

## Overview

- **Habit-blind**: main metric is time between occurrences (e.g. 2d → 3d → 5d → 8d illustrative, not hard-coded).
- Occurrence = behavioral data, not moral failure.
- Two goal modes: **Reduce Frequency** (user-defined N times / P days) and **Stop Completely** (progressively longer abstinence intervals).
- Gemini determines the next minimum abstinence interval from recent history + target; backend computes the calendar date deterministically.
- Google Sheets is the privacy-preserving database; Apps Script is the secure backend; single-page minimalist material frontend is the dashboard.

## Habit-Blind Privacy Architecture

May know only: occurrence happened, when, how many, interval, reduction goal, desired frequency, numerical history.

Must never know/store/infer/request/transmit: habit name/type/category/description, reasons, triggers, semantic details. No `HabitName`/`HabitType`/`HabitCategory`/`HabitDescription` fields, no habit picker screen, no habit question.

- Frontend input is generic: “I did it today.” Raw text is never persisted; only `{occurred, occurrenceCount, eventDate}` is stored.
- Gemini payloads contain only anonymized numbers (see `Metrics.gs:buildGeminiHistoryPayload_` and `Gemini.gs:PRIVACY_PREAMBLE`).
- System prompts explicitly forbid requesting/inferring identity and require strict JSON, calm non-shaming language.

## Data Model

Centralized in `src/Config.gs:SCHEMA` (18 columns, no identity fields):

Log ID, Timestamp, Event Date, Occurred, Occurrence Count, Days Since Previous Occurrence, Goal Mode, Target Frequency Count, Target Frequency Period Days, Previous Target Days, AI Recommended Days, Final Target Days, Next Target Date, AI Reason, AI Confidence, Gemini Model Used, Processing Status, Created At.

Row resembles `2026-10-06 | occurrence=1 | interval=4 | target=5 | nextTarget=2026-10-11`, never `habit=XYZ`.

## Setup

1. Use existing repo `https://github.com/berliandro/bad-habit-tracker.git` (`main`). Do not create another repo.
2. Install clasp: `npm i -g @google/clasp`, then `clasp login`.
3. `.clasp.json` already points to Script ID `1OL09EX3reHw84J2hKJlt8cXbuTPKfHKR0TBIebAYKrC4PLEWFngoTgV9` with `rootDir: src`.
4. Inspect remote before first push: `clasp status`, `clasp pull` (if needed), then `clasp push`.
5. Run `initializeApp()` once in Apps Script editor (idempotent: finds existing spreadsheet, creates/validates `Occurrences` headers, safe to re-run). If standalone (not bound), set Script Property `SPREADSHEET_ID` to the existing Sheet ID first.
6. Deploy as Web App (Execute as: Me, Access: Myself or as desired).

## Apps Script

Modular backend (no single giant file):

- `Config.gs` — constants, schema, model fallback list, limits.
- `Storage.gs` — `initializeApp()`, spreadsheet/sheet/headers, Properties helpers.
- `Validation.gs` — date math, `validateRecommendedDays_()`, response envelopes.
- `Metrics.gs` — intervals, avg/median/trend/consistency, streak, 7/14/30d frequencies, `buildGeminiHistoryPayload_()`.
- `Gemini.gs` — prompts, `callGeminiModel_()`, `callGeminiWithFallback_()`, deterministic-first normalization, Step A/B.
- `Settings.gs` — `isGeminiConfigured()`, `saveGeminiApiKey()`, `getGoalSettings()`, `saveGoalSettings()`, `getAppStatus()`.
- `Logging.gs` — `logOccurrence()`, `getDashboardData()`, `getRecentHistory()`, `analyzeRecentHistory()`, `undoLastEntry()`, `deleteEntry()`, `editEntry()`.
- `Main.gs` — `doGet()`, `include()`.
- `Index.html` + `Styles.html` + `AppJs.html` — frontend.

## Existing Google Sheet

The spreadsheet already exists. `initializeApp()` uses `SpreadsheetApp.getActiveSpreadsheet()` when bound, else stored `SPREADSHEET_ID`. It creates `Occurrences` if missing and repairs headers without duplicates.

## Gemini API Key Setup

- Entered only via webapp; stored in Script Properties (`GEMINI_API_KEY`) via `PropertiesService`.
- Never returned to browser, never in localStorage/HTML/JS/URLs/GitHub. Only status `configured/not configured` is exposed.
- On load `getAppStatus()` checks key; if missing, themed setup modal appears (title, explanation, input, Save, loading/success/error). No native `prompt()`.

## Missing-Key Modal

`Index.html#keyModal` shares the minimalist material theme. Saves via `saveGeminiApiKey()` server-side. No endpoint returns the key.

## Settings → Edit API Key

`Settings` dialog allows replacing the key (`saveGeminiApiKey`), switching goal mode, editing frequency target, and viewing privacy info.

## Goal Modes

- **Reduce Frequency**: e.g. 1/7d, 2/7d, 3/7d, 1/14d, custom. Target = long-term desired frequency. Stored numerically only.
- **Stop**: no frequency target; Gemini recommends gradual interval increase. Switchable later in Settings/first-run screen.

## Frequency Targets

Critical logic (`Gemini.gs:recommendSystemPrompt_`, `Metrics.gs:impliedTargetInterval`): implied interval = period/count (e.g. 2/7d → 3.5d). AI weighs target + recent intervals/avg/median/latest/frequency/trend/consistency/setbacks. Backend `validateRecommendedDays_()` rejects negatives/zero/non-integers, clamps 1–90d, prevents obvious contradiction, stores both AI and final days for audit. `nextTargetDate = eventDate + finalDays` in project timezone.

## Gemini Model Fallback

Verified 2026-10-01 from `https://ai.google.dev/gemini-api/docs/models`. Ordering: Flash-Lite first → Flash fallbacks. Centralized `GEMINI_MODEL_FALLBACKS` in `Config.gs`:

1. `gemini-3.5-flash-lite`
2. `gemini-3.1-flash-lite`
3. `gemini-3.5-flash`
4. `gemini-3.6-flash`
5. `gemini-3.7-flash`
6. `gemini-3.8-flash`
7. `gemini-3-flash-preview`

Never duplicated; handling model recorded per row (`Gemini Model Used`). No `temperature`/`top_p`/`top_k` sent (deprecated July 2026). Error classes: `INVALID_API_KEY` (fail-fast), `MODEL_NOT_FOUND`, `RATE_LIMIT`, `QUOTA_EXHAUSTED`, `MALFORMED_REQUEST/RESPONSE`, `SERVER_ERROR`, `TIMEOUT`. On total failure the saved event is preserved and UI shows “saved but AI unavailable” with deterministic fallback target.

## AI Data Flow

1. User types generic text → `logOccurrence()`.
2. Step A normalize: deterministic parse first (`twice`, `x2`, `today/yesterday/YYYY-MM-DD`); AI only if ambiguous. Produces `{occurred, occurrenceCount, eventDate, confidence}`.
3. Deterministic interval computed; normalized row appended (`PROCESSING`).
4. Recent 10–30 events + stats built; minimal payload sent to Gemini Step B.
5. Gemini returns `{recommendedDays, reason, confidence}`; backend validates/clamps, computes `nextTargetDate`, updates row (`OK` or `LOGGED_AI_UNAVAILABLE` with fallback).

## Privacy

- No habit identity in code, sheets, AI requests, logs, or GitHub.
- Accidental identifying text in input is ignored, never persisted/sent.
- Keys server-side only. Structured errors `{success, data/error{code,message}}`; no stack traces to users.

## clasp

```powershell
clasp --version
clasp login
clasp status
clasp push
```

`.clasp.json` uses the supplied Script ID. Inspect remote before overwriting; verify after push. Auth-gated actions are the only acceptable blockers.

## GitHub

Remote: `https://github.com/berliandro/bad-habit-tracker.git`, branch `main`. Before commit: inspect `git status`, ensure `.gitignore` covers secrets, verify no key present, then commit/push and verify. Do not claim push without `git log`/remote evidence.

## Deployment

Apps Script Web App deployment is user-side (requires Google auth). After `clasp push`, open script.google.com → Deploy → New deployment → Web app. Frontend is responsive/mobile-first, keyboard navigable, ARIA-labeled, `prefers-reduced-motion` aware, with a light minimalist material theme (white surfaces, soft shadows, single teal accent).

## Testing

`npm test` runs `tests/run-tests.mjs`: structure, `node --check` syntax, HTML IDs, privacy grep, security (no key endpoint), schema, fallback order, date/interval/median/normalize/implied-interval units, prompt checks, error envelopes, init idempotence, clasp ID, gitignore. Do not fabricate: tests execute locally and exit non-zero on failure.

Also manually: run `initializeApp()` twice, log occurrences, switch Reduce/Stop, remove key to see modal, replace key in Settings, undo/delete entries.

## Troubleshooting

- `No spreadsheet available`: bind script to existing Sheet or set `SPREADSHEET_ID` property, rerun `initializeApp()`.
- `INVALID_API_KEY`: re-enter key via Settings; check AI Studio key validity.
- `LOGGED_AI_UNAVAILABLE`: event is safe; retry later; check quotas/model status at `https://ai.google.dev/gemini-api/docs/models`.
- Dates off by one: verify script timezone (`Asia/Jakarta` default in `appsscript.json`); backend uses `Session.getScriptTimeZone()`.
- clasp 401: `clasp login` again; restricted networks may block push (record as auth blocker, code remains complete locally).
