/**
 * Settings.gs — API key + goal settings. Keys never leave server except as status booleans.
 */

function isGeminiConfigured() {
  try {
    return okResponse_({ configured: isGeminiConfiguredInternal_() });
  } catch (e) {
    return errResponse_('INTERNAL', String(e && e.message || e).slice(0, 300));
  }
}

function saveGeminiApiKey(apiKey) {
  try {
    var k = String(apiKey || '').trim();
    if (k.length < 10) return errResponse_('INVALID_KEY', 'API key looks too short.');
    if (/\s/.test(k)) return errResponse_('INVALID_KEY', 'API key must not contain whitespace.');
    getScriptProps_().setProperty(PROP_GEMINI_API_KEY, k);
    return okResponse_({ configured: true });
  } catch (e) {
    return errResponse_('INTERNAL', 'Could not save key.');
  }
}

function getGoalSettings() {
  try {
    var g = getGoalSettingsInternal_();
    if (!g) return okResponse_({ configured: false, goal: null });
    return okResponse_({ configured: true, goal: g });
  } catch (e) {
    return errResponse_('INTERNAL', 'Could not load goal.');
  }
}

function saveGoalSettings(goalMode, targetOccurrences, targetPeriodDays) {
  try {
    var mode = String(goalMode || '');
    if (mode !== GOAL_MODE_REDUCE && mode !== GOAL_MODE_STOP) {
      return errResponse_('INVALID_GOAL', 'goalMode must be REDUCE_FREQUENCY or STOP.');
    }
    var tc = null, tp = null;
    if (mode === GOAL_MODE_REDUCE) {
      tc = Number(targetOccurrences);
      tp = Number(targetPeriodDays);
      if (!isFinite(tc) || Math.floor(tc) !== tc || tc < 1 || tc > 100) {
        return errResponse_('INVALID_GOAL', 'targetOccurrences must be an integer 1..100.');
      }
      if (!isFinite(tp) || Math.floor(tp) !== tp || tp < 1 || tp > 365) {
        return errResponse_('INVALID_GOAL', 'targetPeriodDays must be an integer 1..365.');
      }
    }
    var saved = saveGoalSettingsInternal_(mode, tc, tp);
    return okResponse_({ goal: saved });
  } catch (e) {
    return errResponse_('INTERNAL', 'Could not save goal.');
  }
}

function getAppStatus() {
  try {
    var goal = getGoalSettingsInternal_();
    var gemini = isGeminiConfiguredInternal_();
    var sheetOk = true;
    var sheetError = '';
    try {
      getSpreadsheet_();
    } catch (e) {
      sheetOk = false;
      sheetError = String(e && e.message || e).slice(0, 300);
    }
    return okResponse_({
      app: APP_NAME,
      version: APP_VERSION,
      geminiConfigured: gemini,
      goalConfigured: !!goal,
      goal: goal,
      sheetOk: sheetOk,
      sheetError: sheetError,
      timeZone: getAppTimeZone_()
    });
  } catch (e) {
    return errResponse_('INTERNAL', 'Could not load status.');
  }
}
