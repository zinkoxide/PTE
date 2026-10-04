/*
==========================================
PTE Trainer
Read Aloud — scoring module
==========================================

PTE Read Aloud is scored on Oral Fluency and
Pronunciation. This module reuses the
sentence-comparison engine from Repeat
Sentence and converts it into the three
practice criteria:

  Content    — every word of the text read
  Fluency    — words per second and pauses
  Pronunciation — word-level accuracy
==========================================
*/

"use strict";

import { compareSentences } from "./compare.js";
import { calculateScore } from "./score.js";

const IDEAL_MIN_WPS = 2.2;
const IDEAL_MAX_WPS = 3.6;
const LONG_PAUSE_LIMIT = 1.2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function countWords(text) {
  const trimmed = String(text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/*
Read Aloud has no content to invent, so
"Content" here simply means: did the
learner actually say the sentence? A
complete reading with no missing words
earns full marks.
*/
function scoreContent(comparison) {
  const total = comparison.totalOriginalWords || 0;
  if (!total) return { score: 0, reason: "No text to read." };

  const missing = comparison.missingCount || 0;
  const coverage = Math.max(0, ((total - missing) / total) * 100);
  return {
    score: Number((clamp(coverage / 100, 0, 1) * 2).toFixed(2)),
    reason:
      missing === 0
        ? `All ${total} words were produced.`
        : `${missing} of ${total} words were skipped.`
  };
}

function scorePronunciation(comparison) {
  const total = comparison.totalOriginalWords || 0;
  if (!total) return { score: 0, reason: "Nothing was said." };

  /* One shared definition of accuracy, also used by Repeat Sentence. */
  const accuracy = clamp(calculateScore(comparison).accuracy || 0, 0, 100);
  return {
    score: Number(((accuracy / 100) * 2).toFixed(2)),
    reason: `${Math.round(accuracy)}% of the words were pronounced correctly.`
  };
}

/*
Fluency combines pace (words per second)
with rhythm: very long pauses break the
sentence even when every word is correct.
*/
function scoreFluency(words, seconds, longPauses) {
  if (!words) return { score: 0, reason: "Nothing was spoken." };

  const wps = seconds > 0 ? words / seconds : 0;

  let paceScore;
  if (wps === 0) paceScore = 0;
  else if (wps < IDEAL_MIN_WPS) paceScore = clamp(wps / IDEAL_MIN_WPS, 0, 1);
  else if (wps <= IDEAL_MAX_WPS) paceScore = 1;
  else paceScore = clamp(1 - (wps - IDEAL_MAX_WPS) / 4, 0.55, 1);

  const pausePenalty = clamp(1 - longPauses * 0.2, 0.4, 1);
  const score = Number((clamp(paceScore * pausePenalty, 0, 1) * 2).toFixed(2));

  const reason =
    wps >= IDEAL_MIN_WPS && wps <= IDEAL_MAX_WPS
      ? `${wps.toFixed(1)} words per second — a natural exam pace.`
      : wps < IDEAL_MIN_WPS
        ? `${wps.toFixed(1)} words per second — read faster to reach a natural pace.`
        : `${wps.toFixed(1)} words per second — slow down, you rushed the text.`;

  return {
    score,
    reason: longPauses
      ? `${reason} ${longPauses} long pause${longPauses > 1 ? "s" : ""} detected.`
      : reason
  };
}

export function scoreReadAloud(item, spokenText, timing = {}) {
  const text = String(spokenText || "").trim();
  const comparison = compareSentences(item.text, text);
  const words = countWords(text);
  const seconds = Number(timing.seconds) || 0;
  const longPauses = Number(timing.longPauses) || 0;

  const content = scoreContent(comparison);
  const pronunciation = scorePronunciation(comparison);
  const fluency = scoreFluency(words, seconds, longPauses);

  const criteria = {
    Content: content.score,
    Fluency: fluency.score,
    Pronunciation: pronunciation.score
  };

  const total = Math.round(
    (Object.values(criteria).reduce((a, b) => a + b, 0) / 6) * 100
  );

  const wrongWords = (comparison.operations || [])
    .filter((op) => op.type === "wrong")
    .map((op) => op.spoken);
  const missingWords = (comparison.operations || [])
    .filter((op) => op.type === "missing")
    .map((op) => op.original);

  return {
    total,
    criteria,
    words,
    seconds,
    longPauses,
    wordsPerSecond: seconds > 0 ? Number((words / seconds).toFixed(2)) : 0,
    accuracy: Number(calculateScore(comparison).accuracy || 0),
    wrongWords,
    missingWords,
    contentReason: content.reason,
    fluencyReason: fluency.reason,
    pronunciationReason: pronunciation.reason,
    missedKeywords: missingWords
  };
}

export const FLUENCY_LIMITS = {
  minWordsPerSecond: IDEAL_MIN_WPS,
  maxWordsPerSecond: IDEAL_MAX_WPS,
  longPauseSeconds: LONG_PAUSE_LIMIT
};
