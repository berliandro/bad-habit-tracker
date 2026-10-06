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
 * Deterministic month-name table (full + common abbreviations, case-insensitive).
 * No locale-dependent Date parsing is used anywhere.
 */
var MONTH_INDEX_ = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

function monthNumberFromName_(name) {
  if (!name) return null;
  var key = String(name).trim().toLowerCase().replace(/\.$/, '');
  if (MONTH_INDEX_[key]) return MONTH_INDEX_[key];
  return null;
}

function pad2_(n) {
  return ('0' + n).slice(-2);
}

function stripOrdinal_(dayToken) {
  // "30th" -> "30", "1st" -> "1", "2nd" -> "2", "3rd" -> "3"
  return String(dayToken || '').trim().replace(/^(\d{1,2})\s*(st|nd|rd|th)\b/i, '$1');
}

/**
 * Extract an explicit absolute calendar date from free text, deterministically.
 * Priority: this function is consulted BEFORE relative dates and BEFORE any AI call.
 * Returns:
 *   { date: 'YYYY-MM-DD' } on valid explicit date,
 *   { invalid: true, raw: '<matched text>' } when text clearly attempts an explicit
 *     date but the calendar date is invalid (e.g. September 31st 2026),
 *   null when no explicit absolute date is present.
 * Never returns today as a fallback. Never uses `new Date(string)`.
 * Supported (case-insensitive, ordinal suffixes allowed):
 *   YYYY-MM-DD, Month DD YYYY, Month DD, YYYY, Mon DD YYYY, DD Month YYYY,
 *   DD/MM/YYYY and DD-MM-YYYY and DD.MM.YYYY as day-first (unambiguous when day>12;
 *   ambiguous DD<=12 && MM<=12 is left unresolved -> null), and unambiguous
 *   month-first MM/DD/YYYY when month<=12 && day>12.
 */
function extractExplicitDate_(text) {
  var input = String(text || '');
  if (!input) return null;

  // 1. ISO YYYY-MM-DD (strict, validated).
  var isoMatch = input.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    var isoCandidate = isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3];
    if (isValidDateString_(isoCandidate)) return { date: isoCandidate };
    return { invalid: true, raw: isoMatch[0] };
  }

  // 2. Month-name orders. Year is required (1900-2100) to avoid silent year inference.
  var monthAlt = 'january|february|march|april|may|june|july|august|september|october|november|december|jan\\.?|feb\\.?|mar\\.?|apr\\.?|jun\\.?|jul\\.?|aug\\.?|sep\\.?|sept\\.?|oct\\.?|nov\\.?|dec\\.?';
  // Pattern A: Month DD[ordinal][,] YYYY  e.g. September 30th 2026 / September 30, 2026 / Sep 30 2026
  var patternA = new RegExp('\\b(' + monthAlt + ')\\s+(\\d{1,2})(?:\\s*(?:st|nd|rd|th))?\\s*,?\\s+(\\d{4})\\b', 'i');
  var matchA = input.match(patternA);
  if (matchA) {
    var monthNumA = monthNumberFromName_(matchA[1]);
    var dayNumA = Number(stripOrdinal_(matchA[2]));
    var yearNumA = Number(matchA[3]);
    if (!monthNumA || !(dayNumA >= 1 && dayNumA <= 31) || !(yearNumA >= 1900 && yearNumA <= 2100)) {
      return { invalid: true, raw: matchA[0] };
    }
    var candidateA = yearNumA + '-' + pad2_(monthNumA) + '-' + pad2_(dayNumA);
    if (isValidDateString_(candidateA)) return { date: candidateA };
    return { invalid: true, raw: matchA[0] };
  }
  // Pattern B: DD[ordinal] Month YYYY  e.g. 30 September 2026 / 30th September 2026
  var patternB = new RegExp('\\b(\\d{1,2})(?:\\s*(?:st|nd|rd|th))?\\s+(' + monthAlt + ')\\s+(\\d{4})\\b', 'i');
  var matchB = input.match(patternB);
  if (matchB) {
    var dayNumB = Number(stripOrdinal_(matchB[1]));
    var monthNumB = monthNumberFromName_(matchB[2]);
    var yearNumB = Number(matchB[3]);
    if (!monthNumB || !(dayNumB >= 1 && dayNumB <= 31) || !(yearNumB >= 1900 && yearNumB <= 2100)) {
      return { invalid: true, raw: matchB[0] };
    }
    var candidateB = yearNumB + '-' + pad2_(monthNumB) + '-' + pad2_(dayNumB);
    if (isValidDateString_(candidateB)) return { date: candidateB };
    return { invalid: true, raw: matchB[0] };
  }

  // 3. Numeric DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (day-first) + unambiguous MM/DD/YYYY.
  var numericMatch = input.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/);
  if (numericMatch) {
    var firstNum = Number(numericMatch[1]);
    var secondNum = Number(numericMatch[2]);
    var yearNum = Number(numericMatch[3]);
    if (!(yearNum >= 1900 && yearNum <= 2100)) return null;
    var dayPart = null;
    var monthPart = null;
    if (firstNum >= 1 && firstNum <= 31 && secondNum >= 1 && secondNum <= 12) {
      if (firstNum > 12) {
        // Unambiguous day-first, e.g. 30/09/2026.
        dayPart = firstNum;
        monthPart = secondNum;
      } else if (firstNum <= 12 && secondNum <= 12) {
        // Ambiguous (e.g. 05/06/2026): deliberately unresolved to avoid locale error.
        return null;
      } else {
        dayPart = firstNum;
        monthPart = secondNum;
      }
    } else if (firstNum >= 1 && firstNum <= 12 && secondNum >= 1 && secondNum <= 31 && secondNum > 12) {
      // Unambiguous month-first, e.g. 09/30/2026.
      monthPart = firstNum;
      dayPart = secondNum;
    } else {
      return { invalid: true, raw: numericMatch[0] };
    }
    var candidateN = yearNum + '-' + pad2_(monthPart) + '-' + pad2_(dayPart);
    if (isValidDateString_(candidateN)) return { date: candidateN };
    return { invalid: true, raw: numericMatch[0] };
  }

  return null;
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

/**
 * Normalize any spreadsheet date cell to canonical YYYY-MM-DD.
 * Sheets often auto-converts ISO strings to Date objects on read via getValues().
 * The old dashboard path used String(dateCell).slice(0,10) which yields "Tue Oct 06"
 * for Date objects -> invalid -> daysRemaining null -> UI "—".
 * This helper handles Date objects (via app timezone), ISO strings, and ISO datetime
 * prefixes, returning null only when no usable date exists. Never uses locale parsing.
 */
function normalizeSheetDate_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v)) return null;
    try {
      return Utilities.formatDate(v, getAppTimeZone_(), 'yyyy-MM-dd');
    } catch (e) {
      try {
        return formatDateUtc_(new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())));
      } catch (e2) {
        return null;
      }
    }
  }
  var s = String(v).trim();
  if (isValidDateString_(s)) return s;
  var prefix = s.slice(0, 10);
  if (isValidDateString_(prefix)) return prefix;
  return null;
}

function sanitizeForClient_(row) {
  // Row object already contains only privacy-preserving fields.
  return row;
}
