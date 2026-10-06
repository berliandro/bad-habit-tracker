/**
 * Config.gs — centralized configuration.
 * Habit-blind: no habit identity constants exist anywhere in this project.
 */

var APP_NAME = 'Bad Habit Frequency Reducer';
var APP_VERSION = '1.0.0';
var SHEET_NAME = 'Occurrences';

// Script Properties keys (server-side only, never sent to browser except status booleans)
var PROP_GEMINI_API_KEY = 'GEMINI_API_KEY';
var PROP_GOAL_SETTINGS = 'GOAL_SETTINGS_JSON';
var PROP_SPREADSHEET_ID = 'SPREADSHEET_ID';

// Privacy-preserving schema. Centralized column definitions.
// NEVER add habit identity fields (no habit-name / habit-type / habit-category / habit-description).
var SCHEMA = [
  'Log ID',
  'Timestamp',
  'Event Date',
  'Occurred',
  'Occurrence Count',
  'Days Since Previous Occurrence',
  'Goal Mode',
  'Target Frequency Count',
  'Target Frequency Period Days',
  'Previous Target Days',
  'AI Recommended Days',
  'Final Target Days',
  'Next Target Date',
  'AI Reason',
  'AI Confidence',
  'Gemini Model Used',
  'Processing Status',
  'Created At'
];

var COL = (function () {
  var m = {};
  for (var i = 0; i < SCHEMA.length; i++) m[SCHEMA[i]] = i + 1;
  return m;
})();

// Verified 2026-10-01 via https://ai.google.dev/gemini-api/docs/models
// Ordering principle: Flash Lite first, then Flash fallbacks.
// Stable models preferred; preview only as final fallback.
var GEMINI_MODEL_FALLBACKS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
  'gemini-3-flash-preview'
];

var GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
var GEMINI_TIMEOUT_MS = 60000;

var HISTORY_PREFERRED_MIN = 10;
var HISTORY_PREFERRED_MAX = 30;

var MIN_RECOMMENDED_DAYS = 1;
var MAX_RECOMMENDED_DAYS = 90;

var GOAL_MODE_REDUCE = 'REDUCE_FREQUENCY';
var GOAL_MODE_STOP = 'STOP';

var STATUS_OK = 'OK';
var STATUS_LOGGED_AI_UNAVAILABLE = 'LOGGED_AI_UNAVAILABLE';
var STATUS_PROCESSING = 'PROCESSING';

function getAppTimeZone_() {
  try {
    return Session.getScriptTimeZone() || 'Asia/Jakarta';
  } catch (e) {
    return 'Asia/Jakarta';
  }
}
