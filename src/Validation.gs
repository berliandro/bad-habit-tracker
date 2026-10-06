/**
 * Validation.gs — validation + date helpers.
 * All calendar arithmetic is deterministic server-side. Gemini never does dates.
 */

function isValidDateString_(s) {
  if (typeof s !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var d = parseDateUtc_(s);
  if (!d) return false;
  return formatDateUtc_(d) === s;
}

function parseDateUtc_(yyyyMmDd) {
  try {
    var parts = String(yyyyMmDd).split('-');
    if (parts.length !== 3) return null;
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    var d = Number(parts[2]);
    if (!y || !m || !d) return null;
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt;
  } catch (e) {
    return null;
  }
}

function formatDateUtc_(d) {
  var y = d.getUTCFullYear();
  var m = ('0' + (d.getUTCMonth() + 1)).slice(-2);
  var day = ('0' + d.getUTCDate()).slice(-2);
  return y + '-' + m + '-' + day;
}

function todayDateString_() {
  var tz = getAppTimeZone_();
  try {
    return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  } catch (e) {
    return formatDateUtc_(new Date());
  }
}

function addDaysToDateString_(yyyyMmDd, days) {
  var base = parseDateUtc_(yyyyMmDd);
  if (!base) throw new Error('Invalid eventDate: ' + yyyyMmDd);
  var n = Number(days);
  if (!isFinite(n)) throw new Error('Invalid days: ' + days);
  var out = new Date(base.getTime() + n * 86400000);
  return formatDateUtc_(out);
}

function diffDaysBetween_(earlierYmd, laterYmd) {
  var a = parseDateUtc_(earlierYmd);
  var b = parseDateUtc_(laterYmd);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function toPositiveIntOrNull_(v) {
  var n = Number(v);
  if (!isFinite(n)) return null;
  if (Math.floor(n) !== n) return null;
  if (n <= 0) return null;
  return n;
}

/**
 * Guardrail validation for AI recommended days.
 * Returns { finalDays, aiDays, wasClamped, reasons[] }.
 * Never throws for out-of-range values; clamps. Throws only for completely unusable input.
 */
function validateRecommendedDays_(aiDaysRaw, goalMode, stats) {
  var reasons = [];
  var n = Number(aiDaysRaw);
  var wasClamped = false;

  if (!isFinite(n)) {
    // Deterministic fallback: use median/latest/implied target, never arbitrary.
    var fallback = 3;
    if (stats) {
      if (stats.medianInterval && stats.medianInterval > 0) fallback = Math.round(stats.medianInterval);
      else if (stats.averageInterval && stats.averageInterval > 0) fallback = Math.round(stats.averageInterval);
      else if (stats.latestInterval && stats.latestInterval > 0) fallback = stats.latestInterval;
      if (goalMode === GOAL_MODE_REDUCE && stats.impliedTargetInterval && stats.impliedTargetInterval > 0) {
        fallback = Math.round((fallback + stats.impliedTargetInterval) / 2);
      }
    }
    if (!isFinite(fallback) || fallback < MIN_RECOMMENDED_DAYS) fallback = MIN_RECOMMENDED_DAYS;
    if (fallback > MAX_RECOMMENDED_DAYS) fallback = MAX_RECOMMENDED_DAYS;
    reasons.push('AI value unusable; deterministic fallback applied.');
    return { finalDays: fallback, aiDays: null, wasClamped: true, reasons: reasons };
  }

  var aiDays = n;
  var rounded = Math.round(n);
  if (rounded !== n) {
    reasons.push('Non-integer recommendation rounded.');
    wasClamped = true;
    n = rounded;
  }
  if (n < MIN_RECOMMENDED_DAYS) {
    reasons.push('Below minimum; clamped to ' + MIN_RECOMMENDED_DAYS + '.');
    n = MIN_RECOMMENDED_DAYS;
    wasClamped = true;
  }
  if (n > MAX_RECOMMENDED_DAYS) {
    reasons.push('Above maximum; clamped to ' + MAX_RECOMMENDED_DAYS + '.');
    n = MAX_RECOMMENDED_DAYS;
    wasClamped = true;
  }

  // Prevent obvious contradiction with configured goal (Reduce mode).
  // Implied interval = period / count. Recommendation should be within sane band.
  if (goalMode === GOAL_MODE_REDUCE && stats && stats.impliedTargetInterval) {
    var implied = stats.impliedTargetInterval;
    var ceiling = Math.max(MAX_RECOMMENDED_DAYS, Math.ceil(implied * 4));
    // We already clamp to MAX, so just guard absurd low vs target when history supports longer.
    // Only adjust if AI recommends 1 day while user consistently achieves much longer AND target allows longer.
    // We do not force; we only clamp extremes already handled. Record check.
    if (implied > 0 && n > implied * 5 && stats.latestInterval && stats.latestInterval < implied) {
      // AI far above both target-implied and latest: pull toward realistic band.
      var pulled = Math.ceil((implied + stats.latestInterval) / 2);
      if (pulled < MIN_RECOMMENDED_DAYS) pulled = MIN_RECOMMENDED_DAYS;
      if (pulled > MAX_RECOMMENDED_DAYS) pulled = MAX_RECOMMENDED_DAYS;
      reasons.push('Recommendation far above target-implied interval; adjusted toward realistic band.');
      n = pulled;
      wasClamped = true;
    }
  }

  return { finalDays: n, aiDays: aiDays, wasClamped: wasClamped, reasons: reasons };
}

function okResponse_(data) {
  return { success: true, data: data || {} };
}

function errResponse_(code, message) {
  return { success: false, error: { code: String(code || 'UNKNOWN'), message: String(message || 'Unknown error') } };
}

function sanitizeForClient_(row) {
  // Row object already contains only privacy-preserving fields.
  return row;
}
