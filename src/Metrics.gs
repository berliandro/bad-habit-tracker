/**
 * Metrics.gs — deterministic history analysis.
 * Operates only on anonymized timing/count data. Habit-blind.
 */

function toHistoryEvents_(rows) {
  // Convert sheet objects to sorted event list: [{ logId, eventDate, count }]
  var events = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var dateStr = '';
    var v = r['Event Date'];
    if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) {
      try {
        dateStr = Utilities.formatDate(v, getAppTimeZone_(), 'yyyy-MM-dd');
      } catch (e) {
        dateStr = formatDateUtc_(new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())));
      }
    } else {
      dateStr = String(v || '').slice(0, 10);
    }
    if (!isValidDateString_(dateStr)) continue;
    var occurred = r['Occurred'];
    var isOcc = occurred === true || String(occurred).toLowerCase() === 'true' || occurred === 1 || String(occurred) === '1';
    if (!isOcc) continue;
    var count = Number(r['Occurrence Count'] || 1);
    if (!isFinite(count) || count <= 0) count = 1;
    events.push({
      logId: String(r['Log ID'] || ''),
      eventDate: dateStr,
      count: Math.round(count),
      interval: r['Days Since Previous Occurrence'] !== '' ? Number(r['Days Since Previous Occurrence']) : null
    });
  }
  events.sort(function (a, b) { return a.eventDate < b.eventDate ? -1 : a.eventDate > b.eventDate ? 1 : 0; });
  return events;
}

function calculateIntervals_(sortedEventDates) {
  var intervals = [];
  for (var i = 1; i < sortedEventDates.length; i++) {
    var d = diffDaysBetween_(sortedEventDates[i - 1], sortedEventDates[i]);
    if (d !== null && d >= 0) intervals.push(d);
  }
  return intervals;
}

function avg_(arr) {
  if (!arr || !arr.length) return null;
  var s = 0;
  for (var i = 0; i < arr.length; i++) s += arr[i];
  return s / arr.length;
}

function median_(arr) {
  if (!arr || !arr.length) return null;
  var a = arr.slice().sort(function (x, y) { return x - y; });
  var mid = Math.floor(a.length / 2);
  if (a.length % 2 === 1) return a[mid];
  return (a[mid - 1] + a[mid]) / 2;
}

function stddev_(arr) {
  if (!arr || arr.length < 2) return 0;
  var m = avg_(arr);
  var s = 0;
  for (var i = 0; i < arr.length; i++) s += Math.pow(arr[i] - m, 2);
  return Math.sqrt(s / arr.length);
}

function trendOf_(intervals) {
  if (!intervals || intervals.length < 3) return 'insufficient_data';
  var half = Math.floor(intervals.length / 2);
  var first = intervals.slice(0, half);
  var second = intervals.slice(half);
  var a = avg_(first);
  var b = avg_(second);
  if (a === null || b === null) return 'insufficient_data';
  var diff = b - a;
  if (diff > 0.75) return 'increasing';
  if (diff < -0.75) return 'decreasing';
  return 'stable';
}

/**
 * Build deterministic stats from events + goal.
 * Returns anonymized payload suitable for Gemini (no identity).
 */
function buildHistoryStats_(events, goal) {
  var dates = events.map(function (e) { return e.eventDate; });
  var intervals = calculateIntervals_(dates);
  var recent = intervals.slice(-HISTORY_PREFERRED_MAX);
  var averageInterval = avg_(recent);
  var med = median_(recent);
  var latestInterval = recent.length ? recent[recent.length - 1] : null;
  var shortest = recent.length ? Math.min.apply(null, recent) : null;
  var longest = recent.length ? Math.max.apply(null, recent) : null;
  var trend = trendOf_(recent);
  var sd = stddev_(recent);
  var consistency = 'unknown';
  if (recent.length >= 3) {
    var meanForCv = averageInterval && averageInterval > 0 ? averageInterval : 1;
    var cv = sd / meanForCv;
    if (cv < 0.35) consistency = 'consistent';
    else if (cv < 0.8) consistency = 'moderate';
    else consistency = 'variable';
  }

  var todayStr = todayDateString_();
  var lastDate = dates.length ? dates[dates.length - 1] : null;
  var currentStreak = lastDate ? diffDaysBetween_(lastDate, todayStr) : null;
  if (currentStreak !== null && currentStreak < 0) currentStreak = 0;

  // Recent frequency: occurrences in trailing 7/14/30 days (count-weighted).
  var freq7 = 0, freq14 = 0, freq30 = 0;
  for (var i = 0; i < events.length; i++) {
    var age = diffDaysBetween_(events[i].eventDate, todayStr);
    if (age === null || age < 0) continue;
    if (age <= 7) freq7 += events[i].count;
    if (age <= 14) freq14 += events[i].count;
    if (age <= 30) freq30 += events[i].count;
  }

  var goalMode = (goal && goal.goalMode) || GOAL_MODE_REDUCE;
  var impliedTargetInterval = null;
  if (goalMode === GOAL_MODE_REDUCE && goal && goal.targetOccurrences && goal.targetPeriodDays) {
    var tc = Number(goal.targetOccurrences);
    var tp = Number(goal.targetPeriodDays);
    if (tc > 0 && tp > 0) impliedTargetInterval = tp / tc;
  }

  return {
    recentOccurrences: events.length,
    recentIntervals: recent.slice(-10),
    recentIntervalsFull: recent,
    averageInterval: averageInterval !== null ? Math.round(averageInterval * 100) / 100 : null,
    medianInterval: med,
    shortestInterval: shortest,
    longestInterval: longest,
    latestInterval: latestInterval,
    currentStreakDays: currentStreak,
    recentFrequency7d: freq7,
    recentFrequency14d: freq14,
    recentFrequency30d: freq30,
    trend: trend,
    consistency: consistency,
    goalMode: goalMode,
    targetOccurrences: goal && goal.targetOccurrences ? Number(goal.targetOccurrences) : null,
    targetPeriodDays: goal && goal.targetPeriodDays ? Number(goal.targetPeriodDays) : null,
    impliedTargetInterval: impliedTargetInterval !== null ? Math.round(impliedTargetInterval * 100) / 100 : null,
    lastEventDate: lastDate,
    today: todayStr
  };
}

function buildGeminiHistoryPayload_(stats) {
  // Minimal anonymized subset actually sent to Gemini.
  return {
    recentIntervals: stats.recentIntervals || [],
    recentOccurrences: stats.recentOccurrences,
    averageInterval: stats.averageInterval,
    medianInterval: stats.medianInterval,
    latestInterval: stats.latestInterval,
    recentFrequency7d: stats.recentFrequency7d,
    recentFrequency14d: stats.recentFrequency14d,
    trend: stats.trend,
    consistency: stats.consistency,
    goalMode: stats.goalMode,
    targetOccurrences: stats.targetOccurrences,
    targetPeriodDays: stats.targetPeriodDays,
    impliedTargetInterval: stats.impliedTargetInterval
  };
}
