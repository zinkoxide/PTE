/*
==========================================
PTE Trainer
Official score scale
==========================================

The real PTE Academic score is a 10–90
overall score built from item-level
difficulty scaling, so it can never be
derived exactly from a practice total.
This module provides a documented,
monotonic approximation used only to give
the learner a sense of the exam band:

  practice 0–100  ->  official 10–90

The anchors below are the published
score/band boundaries used for
interpolation. Keep the list sorted; the
conversion walks it in order.
==========================================
*/

"use strict";

export const MIN_SCORE = 10;
export const MAX_SCORE = 90;
export const DEFAULT_TARGET = 60;

/* [practice total, official score] */
const ANCHORS = [
  [0, 10],
  [20, 25],
  [30, 33],
  [40, 42],
  [50, 50],
  [60, 57],
  [70, 64],
  [80, 72],
  [90, 81],
  [100, 90]
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/*
Convert a 0–100 practice total into an
official-scale estimate. Always returns an
integer inside [10, 90].
*/
export function toOfficialScore(total) {
  const value = clamp(Number(total) || 0, 0, 100);

  for (let i = 0; i < ANCHORS.length - 1; i += 1) {
    const [fromTotal, fromScore] = ANCHORS[i];
    const [toTotal, toScore] = ANCHORS[i + 1];

    if (value <= toTotal) {
      const ratio = (value - fromTotal) / (toTotal - fromTotal);
      return Math.round(fromScore + ratio * (toScore - fromScore));
    }
  }

  return MAX_SCORE;
}

/*
Average of many attempts -> official score.
Returns null when there is nothing to
convert, so callers can show a dash.
*/
export function averageToOfficial(correct, total) {
  const attempts = Number(total) || 0;
  if (attempts <= 0) return null;
  const average = (Number(correct) || 0) / attempts;
  return toOfficialScore(average * 100);
}

/* Coarse description of an official score. */
export function describeBand(score) {
  if (score == null) return { label: "—", tone: "none" };
  if (score < 40) return { label: "Beginner", tone: "low" };
  if (score < 50) return { label: "Intermediate", tone: "mid" };
  if (score < 60) return { label: "Upper intermediate", tone: "mid" };
  if (score < 70) return { label: "Good", tone: "good" };
  if (score < 80) return { label: "Very good", tone: "good" };
  return { label: "Excellent", tone: "top" };
}

/* How far the learner is from the target. */
export function gapToTarget(score, target) {
  const goal = clamp(Number(target) || DEFAULT_TARGET, MIN_SCORE, MAX_SCORE);
  if (score == null) return { goal, gap: null, reached: false };
  const gap = Math.round((goal - score) * 10) / 10;
  return { goal, gap: gap > 0 ? gap : 0, reached: gap <= 0 };
}
