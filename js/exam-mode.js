/*
==========================================
PTE Trainer
Exam conditions
==========================================

In the real test nothing helps you while
you answer: no word counter, no model
answer, no feedback afterwards. Turning
this on removes those aids so a practice
attempt measures the same thing the exam
does.

It is deliberately a small, shared concern:
one localStorage flag used by Summarize
Written Text, Describe Image and Read
Aloud, so the three pages cannot drift
apart.
==========================================
*/

"use strict";

export const EXAM_KEY = "pte.exam.v1";

/* The timer starts warning this many seconds before time is up. */
export const EXAM_WARNING_SECONDS = 10;

export function isExamMode(storage = localStorage) {
  try {
    return storage.getItem(EXAM_KEY) === "1";
  } catch {
    return false;
  }
}

export function setExamMode(on, storage = localStorage) {
  try {
    if (on) storage.setItem(EXAM_KEY, "1");
    else storage.removeItem(EXAM_KEY);
  } catch {
    /* storage may be unavailable; the toggle still works for this session */
  }
  return Boolean(on);
}

/* True inside the warning window, but only while time is actually left. */
export function shouldWarn(secondsLeft, warning = EXAM_WARNING_SECONDS) {
  const seconds = Number(secondsLeft);
  if (!Number.isFinite(seconds)) return false;
  return seconds > 0 && seconds <= warning;
}

/*
Exam conditions answer one question and tell
you nothing else, so an exam attempt stores
the score but never the diagnostic details:
no missed keywords, no key points, no
grammar issues. The attempt still counts and
the item is still tracked as weak.
*/
export function detailTermsFor(attempt, examMode) {
  if (examMode) return [];
  const result = attempt || {};
  return result.missedKeywords || result.missedPoints || [];
}
