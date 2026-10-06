/**
 * Logging.gs — occurrence logging, dashboard, history, corrections.
 * Privacy: rows contain only timing/count/target numbers. Raw user text is never stored.
 */

function generateLogId_() {
  try {
    return Utilities.getUuid();
  } catch (e) {
    return 'log-' + String(Date.now()) + '-' + String(Math.floor(Math.random() * 1e9));
  }
}

function nowIso_() {
  return new Date().toISOString();
}

function getRecentEvents_(limit) {
  var rows = sheetRowsToObjects_();
  var events = toHistoryEvents_(rows);
  if (limit && events.length > limit) events = events.slice(events.length - limit);
  return { rows: rows, events: events };
}

function findPredecessorDate_(sortedEvents, newEventDate) {
  var pred = null;
  for (var i = 0; i < sortedEvents.length; i++) {
    var d = sortedEvents[i].eventDate;
    if (d <= newEventDate && (pred === null || d > pred)) pred = d;
  }
  return pred;
}

function logOccurrence(naturalInput, eventDateOverride) {
  try {
    var input = String(naturalInput || '').slice(0, 500);
    var todayStr = todayDateString_();
    var normalized = normalizeOccurrence_(input, todayStr);
    if (normalized && normalized.invalidDate) {
      return errResponse_('INVALID_DATE', 'The stated date "' + String(normalized.invalidRaw || '').slice(0, 60) + '" is not a valid calendar date. Nothing was saved.');
    }
    if (eventDateOverride && isValidDateString_(String(eventDateOverride))) {
      normalized.eventDate = String(eventDateOverride);
    }
    if (!normalized.occurred) {
      return okResponse_({
        saved: false,
        normalized: { occurred: false, confidence: normalized.confidence },
        message: 'No occurrence detected; nothing saved.'
      });
    }

    var data = getRecentEvents_(HISTORY_PREFERRED_MAX);
    var events = data.events;
    var rows = data.rows;
    var goal = getGoalSettingsInternal_();
    if (!goal) {
      goal = { goalMode: GOAL_MODE_REDUCE, targetOccurrences: 2, targetPeriodDays: 7 };
    }

    var prevDate = findPredecessorDate_(events, normalized.eventDate);
    var interval = prevDate ? diffDaysBetween_(prevDate, normalized.eventDate) : null;
    // Out-of-order log: predecessor search keeps historical inserts correct.
    // Stored intervals for later successor rows may stay stale, but metrics recompute
    // chronologically from sorted dates, so dashboard/history remain correct.
    if (interval !== null && interval < 0) interval = 0;

    var lastFinalTarget = null;
    if (rows.length) {
      var lastRow = rows[rows.length - 1];
      var v = lastRow['Final Target Days'];
      if (v !== '' && v !== null && isFinite(Number(v))) lastFinalTarget = Number(v);
    }

    var logId = generateLogId_();
    var rowNumber = appendLogRow_({
      'Log ID': logId,
      'Timestamp': nowIso_(),
      'Event Date': normalized.eventDate,
      'Occurred': true,
      'Occurrence Count': normalized.occurrenceCount,
      'Days Since Previous Occurrence': interval === null ? '' : interval,
      'Goal Mode': goal.goalMode,
      'Target Frequency Count': goal.targetOccurrences || '',
      'Target Frequency Period Days': goal.targetPeriodDays || '',
      'Previous Target Days': lastFinalTarget === null ? '' : lastFinalTarget,
      'AI Recommended Days': '',
      'Final Target Days': '',
      'Next Target Date': '',
      'AI Reason': '',
      'AI Confidence': '',
      'Gemini Model Used': normalized.model || normalized.method || 'deterministic',
      'Processing Status': STATUS_PROCESSING,
      'Created At': nowIso_()
    });

    // Recompute history including the new event for AI Step B.
    var after = getRecentEvents_(HISTORY_PREFERRED_MAX);
    var stats = buildHistoryStats_(after.events, goal);
    var payload = buildGeminiHistoryPayload_(stats);
    var rec = recommendInterval_(payload, goal.goalMode);

    if (!rec.ok) {
      // Preserve saved event; deterministic fallback so UX still shows a target.
      var fbStats = stats;
      var fb = validateRecommendedDays_(NaN, goal.goalMode, fbStats);
      var fbDate = addDaysToDateString_(normalized.eventDate, fb.finalDays);
      updateLogRow_(rowNumber, {
        'AI Recommended Days': '',
        'Final Target Days': fb.finalDays,
        'Next Target Date': fbDate,
        'AI Reason': 'Logged. AI analysis is temporarily unavailable (' + rec.errorClass + '); showing a steady target based on recent history.',
        'AI Confidence': '',
        'Processing Status': STATUS_LOGGED_AI_UNAVAILABLE
      });
      var dashFallback = getDashboardDataInternal_();
      dashFallback.aiAvailable = false;
      dashFallback.aiErrorCode = rec.errorClass || 'AI_UNAVAILABLE';
      dashFallback.warning = 'Occurrence saved. AI analysis is temporarily unavailable.';
      return okResponse_(dashFallback);
    }

    var validation = validateRecommendedDays_(rec.recommendedDays, goal.goalMode, stats);
    var nextDate = addDaysToDateString_(normalized.eventDate, validation.finalDays);
    updateLogRow_(rowNumber, {
      'AI Recommended Days': validation.aiDays === null ? '' : validation.aiDays,
      'Final Target Days': validation.finalDays,
      'Next Target Date': nextDate,
      'AI Reason': rec.reason,
      'AI Confidence': rec.confidence,
      'Gemini Model Used': rec.model,
      'Processing Status': STATUS_OK
    });

    var dash = getDashboardDataInternal_();
    dash.aiAvailable = true;
    dash.lastRecommendation = {
      recommendedDays: validation.aiDays,
      finalDays: validation.finalDays,
      nextTargetDate: nextDate,
      reason: rec.reason,
      confidence: rec.confidence,
      model: rec.model,
      wasClamped: validation.wasClamped,
      guardrailNotes: validation.reasons
    };
    return okResponse_(dash);
  } catch (e) {
    return errResponse_('INTERNAL', 'Could not log occurrence.');
  }
}

function getDashboardDataInternal_() {
  var data = getRecentEvents_(HISTORY_PREFERRED_MAX);
  var goal = getGoalSettingsInternal_();
  var stats = buildHistoryStats_(data.events, goal || { goalMode: GOAL_MODE_REDUCE });
  var rows = data.rows;

  var lastRow = rows.length ? rows[rows.length - 1] : null;
  var nextTargetDays = lastRow && lastRow['Final Target Days'] !== '' ? Number(lastRow['Final Target Days']) : null;
  var nextTargetDate = lastRow && lastRow['Next Target Date'] ? String(lastRow['Next Target Date']).slice(0, 10) : null;
  var aiReason = lastRow && lastRow['AI Reason'] ? String(lastRow['AI Reason']) : '';
  var aiModel = lastRow && lastRow['Gemini Model Used'] ? String(lastRow['Gemini Model Used']) : '';

  var todayStr = todayDateString_();
  var daysRemaining = null;
  if (nextTargetDate && isValidDateString_(nextTargetDate)) {
    daysRemaining = diffDaysBetween_(todayStr, nextTargetDate);
  }
  var currentInterval = stats.currentStreakDays;

  // Recent history for timeline (last 15, newest first), sanitized.
  var timeline = [];
  var evs = data.events.slice(-15).reverse();
  for (var i = 0; i < evs.length; i++) {
    timeline.push({ eventDate: evs[i].eventDate, count: evs[i].count, logId: evs[i].logId });
  }
  // Attach intervals newest-first.
  var intervalsNewestFirst = stats.recentIntervalsFull.slice(-15).reverse();
  for (var j = 0; j < timeline.length && j < intervalsNewestFirst.length + 1; j++) {
    timeline[j].interval = j < intervalsNewestFirst.length ? intervalsNewestFirst[j] : null;
  }

  return {
    currentIntervalDays: currentInterval,
    nextTargetDays: nextTargetDays,
    nextTargetDate: nextTargetDate,
    daysRemaining: daysRemaining,
    goal: goal,
    stats: {
      latestInterval: stats.latestInterval,
      averageInterval: stats.averageInterval,
      medianInterval: stats.medianInterval,
      longestInterval: stats.longestInterval,
      shortestInterval: stats.shortestInterval,
      currentStreakDays: stats.currentStreakDays,
      recentFrequency7d: stats.recentFrequency7d,
      recentFrequency14d: stats.recentFrequency14d,
      recentFrequency30d: stats.recentFrequency30d,
      trend: stats.trend,
      consistency: stats.consistency,
      recentOccurrences: stats.recentOccurrences,
      recentIntervals: stats.recentIntervals
    },
    aiInsight: aiReason,
    aiModel: aiModel,
    recentHistory: timeline,
    today: todayStr
  };
}

function getDashboardData() {
  try {
    return okResponse_(getDashboardDataInternal_());
  } catch (e) {
    return errResponse_('INTERNAL', 'Could not load dashboard.');
  }
}

function getRecentHistory(limit) {
  try {
    var n = Number(limit) || 20;
    if (n < 1) n = 1;
    if (n > 50) n = 50;
    var data = getRecentEvents_(n);
    var goal = getGoalSettingsInternal_();
    var stats = buildHistoryStats_(data.events, goal || { goalMode: GOAL_MODE_REDUCE });
    var items = [];
    var evs = data.events.slice(-n).reverse();
    for (var i = 0; i < evs.length; i++) {
      items.push({ eventDate: evs[i].eventDate, count: evs[i].count, logId: evs[i].logId });
    }
    return okResponse_({ items: items, stats: stats });
  } catch (e) {
    return errResponse_('INTERNAL', 'Could not load history.');
  }
}

function analyzeRecentHistory() {
  try {
    var data = getRecentEvents_(HISTORY_PREFERRED_MAX);
    var goal = getGoalSettingsInternal_() || { goalMode: GOAL_MODE_REDUCE };
    var stats = buildHistoryStats_(data.events, goal);
    var payload = buildGeminiHistoryPayload_(stats);
    return okResponse_({ stats: stats, geminiPayload: payload });
  } catch (e) {
    return errResponse_('INTERNAL', 'Could not analyze history.');
  }
}

function undoLastEntry() {
  try {
    var rows = sheetRowsToObjects_();
    if (!rows.length) return errResponse_('NOT_FOUND', 'No entries to undo.');
    var last = rows[rows.length - 1];
    var sheet = getOrCreateSheet_();
    sheet.deleteRow(last._rowNumber);
    return okResponse_({ undone: true, logId: String(last['Log ID']) });
  } catch (e) {
    return errResponse_('INTERNAL', 'Could not undo entry.');
  }
}

function deleteEntry(logId) {
  try {
    if (!logId) return errResponse_('INVALID', 'logId required.');
    var ok = deleteRowByLogId_(String(logId));
    if (!ok) return errResponse_('NOT_FOUND', 'Entry not found.');
    return okResponse_({ deleted: true });
  } catch (e) {
    return errResponse_('INTERNAL', 'Could not delete entry.');
  }
}

function editEntry(logId, occurrenceCount, eventDate) {
  try {
    if (!logId) return errResponse_('INVALID', 'logId required.');
    var found = findRowByLogId_(String(logId));
    if (!found) return errResponse_('NOT_FOUND', 'Entry not found.');
    var patch = {};
    if (occurrenceCount !== undefined && occurrenceCount !== null && occurrenceCount !== '') {
      var c = Number(occurrenceCount);
      if (!isFinite(c) || Math.floor(c) !== c || c < 1 || c > 50) {
        return errResponse_('INVALID', 'occurrenceCount must be 1..50.');
      }
      patch['Occurrence Count'] = c;
    }
    if (eventDate !== undefined && eventDate !== null && eventDate !== '') {
      if (!isValidDateString_(String(eventDate))) return errResponse_('INVALID', 'eventDate must be YYYY-MM-DD.');
      patch['Event Date'] = String(eventDate);
    }
    if (!Object.keys(patch).length) return errResponse_('INVALID', 'Nothing to update.');
    updateLogRow_(found._rowNumber, patch);
    return okResponse_({ updated: true });
  } catch (e) {
    return errResponse_('INTERNAL', 'Could not edit entry.');
  }
}
