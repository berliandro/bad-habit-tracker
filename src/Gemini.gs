/**
 * Gemini.gs — habit-blind AI integration with model fallback.
 * Only anonymized numerical/behavioral data is ever sent. Never habit identity.
 */

var PRIVACY_PREAMBLE = [
  'You are analyzing anonymized behavioral timing data for a private habit-reduction tool.',
  'The identity of the tracked behavior is intentionally unavailable and must never be requested, inferred, or invented.',
  'You receive only occurrence dates, counts, intervals, averages, medians, frequencies, goal mode, and numeric targets.',
  'Do not diagnose any medical condition. Do not use shame-based language.',
  'An occurrence is behavioral data, not moral failure. Use calm, supportive, non-judgmental language in reasons.',
  'Distinguish observed facts from recommendations.',
  'Return STRICT JSON only. No markdown fences, no commentary.'
].join('\n');

var NORMALIZE_SYSTEM_PROMPT = [
  PRIVACY_PREAMBLE,
  '',
  'Task A — Normalize a generic occurrence log into non-identifying fields.',
  'Input is a short generic sentence like "I did it today" or "I did it twice today".',
  'Determine only: occurred (boolean), occurrenceCount (positive integer), eventDate (YYYY-MM-DD).',
  'Rules:',
  '- Never identify or ask about the behavior.',
  '- If the text mentions what the behavior is, IGNORE that text: do not repeat it, do not store it.',
  '- occurrenceCount: default 1. Detect words: once=1, twice=2, three times=3, "x2"=2, digits.',
  '- eventDate: "today" means the provided today date; "yesterday" means today minus 1; explicit YYYY-MM-DD if present and valid; otherwise today.',
  '- If input is ambiguous about whether an occurrence happened, set occurred=false and confidence low.',
  '- Do not invent facts. Be conservative.',
  'Return JSON: {"occurred": true, "occurrenceCount": 1, "eventDate": "YYYY-MM-DD", "confidence": 0.95}'
].join('\n');

function recommendSystemPrompt_(goalMode) {
  var base = [
    PRIVACY_PREAMBLE,
    '',
    'Task B — Recommend the next MINIMUM number of complete days without an occurrence.',
    'Interpretation: recommendedDays is the minimum abstinence interval before the next acceptable occurrence.',
    'The backend computes nextTargetDate = eventDate + recommendedDays. You only return the day count.'
  ];
  if (goalMode === GOAL_MODE_STOP) {
    base.push('');
    base.push('Goal mode is STOP (no frequency target).');
    base.push('Consider: recent intervals, progression, consistency, realistic gradual increase.');
    base.push('Increasing interval length is progress. Recommend a slightly longer but achievable interval.');
    base.push('Do not force an extreme target unless history clearly supports it.');
  } else {
    base.push('');
    base.push('Goal mode is REDUCE_FREQUENCY with a long-term frequency target (targetOccurrences per targetPeriodDays).');
    base.push('The target is a long-term constraint, not an immediate demand.');
    base.push('Consider: target frequency and implied interval (period/count), recent intervals, average, median, latest, recent frequency, trend, consistency, setbacks.');
    base.push('Recommend a realistic next interval that moves the user toward the target.');
    base.push('If recent intervals already meet the target, a slightly longer maintenance target is reasonable.');
    base.push('If recent intervals are shorter than target-implied, suggest gradual lengthening, not an abrupt jump.');
  }
  base.push('Return JSON: {"recommendedDays": 5, "reason": "short calm explanation referencing intervals/target without moral judgment", "confidence": 0.88}');
  return base.join('\n');
}

function classifyGeminiError_(statusCode, bodyText) {
  var code = Number(statusCode || 0);
  var body = String(bodyText || '');
  if (code === 400 && /API key not valid|API_KEY_INVALID/i.test(body)) return 'INVALID_API_KEY';
  if (code === 400 && /model/i.test(body)) return 'MODEL_NOT_FOUND';
  if (code === 404) return 'MODEL_NOT_FOUND';
  if (code === 429) return 'RATE_LIMIT';
  if (code === 403 && /quota/i.test(body)) return 'QUOTA_EXHAUSTED';
  if (/quota|exhaust/i.test(body)) return 'QUOTA_EXHAUSTED';
  if (code >= 500) return 'SERVER_ERROR';
  if (/timeout|timed out|deadline/i.test(body)) return 'TIMEOUT';
  if (/parse|json|malformed|could not/i.test(body)) return 'MALFORMED_RESPONSE';
  if (code === 400) return 'MALFORMED_REQUEST';
  return code === 0 ? 'TIMEOUT' : 'SERVER_ERROR';
}

function callGeminiModel_(model, systemPrompt, userObject, apiKey) {
  var url = GEMINI_API_BASE + '/' + encodeURIComponent(model) + ':generateContent';
  var payload = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(userObject) }] }],
    generationConfig: { responseMimeType: 'application/json' }
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    timeout: GEMINI_TIMEOUT_MS
  };
  var response;
  try {
    response = UrlFetchApp.fetch(url + '?key=' + encodeURIComponent(apiKey), options);
  } catch (e) {
    return { ok: false, errorClass: 'TIMEOUT', message: String(e), model: model };
  }
  var status = response.getResponseCode();
  var text = '';
  try { text = response.getContentText(); } catch (e) { text = ''; }
  if (status < 200 || status >= 300) {
    return { ok: false, errorClass: classifyGeminiError_(status, text), message: 'HTTP ' + status + ': ' + text.slice(0, 500), model: model, status: status };
  }
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, errorClass: 'MALFORMED_RESPONSE', message: 'Invalid JSON envelope', model: model };
  }
  try {
    var parts = parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts;
    var rawText = parts && parts[0] && parts[0].text ? String(parts[0].text) : '';
    if (!rawText) return { ok: false, errorClass: 'MALFORMED_RESPONSE', message: 'Empty candidate text', model: model };
    var cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    var data = JSON.parse(cleaned);
    return { ok: true, data: data, model: model };
  } catch (e) {
    return { ok: false, errorClass: 'MALFORMED_RESPONSE', message: 'Could not parse model JSON: ' + String(e).slice(0, 300), model: model };
  }
}

/**
 * Iterate fallback models in order. Never endlessly retry same model.
 * Returns { ok, data, model } or { ok:false, errorClass, message, attempted[] }.
 */
function callGeminiWithFallback_(systemPrompt, userObject) {
  var apiKey = getGeminiApiKeyInternal_();
  if (!apiKey) return { ok: false, errorClass: 'INVALID_API_KEY', message: 'Gemini API key not configured.', attempted: [] };
  var attempted = [];
  var lastErr = null;
  for (var i = 0; i < GEMINI_MODEL_FALLBACKS.length; i++) {
    var model = GEMINI_MODEL_FALLBACKS[i];
    attempted.push(model);
    var res = callGeminiModel_(model, systemPrompt, userObject, apiKey);
    if (res.ok) return { ok: true, data: res.data, model: model, attempted: attempted };
    lastErr = res;
    // Fail fast on invalid key — retrying other models cannot help.
    if (res.errorClass === 'INVALID_API_KEY') {
      return { ok: false, errorClass: res.errorClass, message: res.message, attempted: attempted };
    }
    // Otherwise continue to next model.
  }
  return { ok: false, errorClass: (lastErr && lastErr.errorClass) || 'SERVER_ERROR', message: (lastErr && lastErr.message) || 'All models failed.', attempted: attempted };
}

function deterministicNormalize_(inputText, todayStr) {
  var text = String(inputText || '').trim();
  var lower = text.toLowerCase();
  if (!text) return null;
  // Negation: no occurrence
  if (/^(no|none|didn.?t|did not|clean|abstained|no occurrence)/i.test(lower.trim())) {
    return { occurred: false, occurrenceCount: 0, eventDate: todayStr, confidence: 0.9, method: 'deterministic' };
  }
  var count = 1;
  var m = lower.match(/(\d+)\s*(?:times|x\b)/);
  if (m) {
    count = Number(m[1]);
  } else if (/\btwice\b/.test(lower)) count = 2;
  else if (/\bthree times\b|\bthrice\b/.test(lower)) count = 3;
  else if (/\bonce\b/.test(lower)) count = 1;
  if (!isFinite(count) || count < 1) count = 1;
  if (count > 50) count = 50;
  var eventDate = todayStr;
  var dm = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (dm && isValidDateString_(dm[1])) eventDate = dm[1];
  else if (/\byesterday\b/.test(lower)) eventDate = addDaysToDateString_(todayStr, -1);
  // Simple generic patterns handled deterministically with high confidence.
  if (/i did it|did it today|did it again|i slipped|occurrence|logged/i.test(text) || /\btoday\b/.test(lower) || /\byesterday\b/.test(lower) || dm) {
    return { occurred: true, occurrenceCount: count, eventDate: eventDate, confidence: 0.92, method: 'deterministic' };
  }
  return null;
}

function normalizeOccurrence_(inputText, todayStr) {
  var det = deterministicNormalize_(inputText, todayStr);
  if (det) return det;
  // AI Step A for ambiguous input.
  var res = callGeminiWithFallback_(NORMALIZE_SYSTEM_PROMPT, { input: String(inputText || '').slice(0, 500), today: todayStr });
  if (!res.ok) return { occurred: true, occurrenceCount: 1, eventDate: todayStr, confidence: 0.5, method: 'fallback-no-ai', aiError: res.errorClass };
  var d = res.data || {};
  var occurred = d.occurred !== false;
  var count = toPositiveIntOrNull_(d.occurrenceCount);
  if (count === null) count = occurred ? 1 : 0;
  var eventDate = isValidDateString_(d.eventDate) ? d.eventDate : todayStr;
  var conf = Number(d.confidence);
  if (!isFinite(conf) || conf < 0 || conf > 1) conf = 0.6;
  // Strip any habit-identifying echo: never persist raw input.
  return { occurred: occurred, occurrenceCount: count, eventDate: eventDate, confidence: conf, method: 'ai:' + res.model, model: res.model };
}

function recommendInterval_(historyPayload, goalMode) {
  var sys = recommendSystemPrompt_(goalMode);
  var res = callGeminiWithFallback_(sys, historyPayload);
  if (!res.ok) return { ok: false, errorClass: res.errorClass, message: res.message, attempted: res.attempted };
  var d = res.data || {};
  var rec = Number(d.recommendedDays);
  var reason = String(d.reason || 'Based on your recent intervals.').slice(0, 500);
  var conf = Number(d.confidence);
  if (!isFinite(conf) || conf < 0 || conf > 1) conf = 0.7;
  return { ok: true, recommendedDays: rec, reason: reason, confidence: conf, model: res.model };
}
