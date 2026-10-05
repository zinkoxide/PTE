/*
==========================================
PTE Trainer
Task stats — shared per-item progress
==========================================

Both timed tasks (Summarize Written Text and
Describe Image) keep the same shape in
localStorage:

  {
    correct, total,
    history: [{ t, percent }],
    missed: {
      [itemId]: { count, best, last, lastT, title, weak: [] }
    }
  }

`correct`, `total` and `history` are what the
dashboard has always read; `missed` adds
per-item detail so weak passages and weak
charts can be surfaced and re-trained.

Each weak item also carries a review
schedule, reusing the Leitner-style idea
behind the vocabulary SRS: an item answered
below the threshold comes back after 1, 3, 7
then 14 days, and answering it well clears
the schedule.

This module is pure: it never touches
localStorage, which keeps it unit-testable.
==========================================
*/

"use strict";

export const WEAK_THRESHOLD = 60;
const HISTORY_LIMIT = 400;
const WEAK_TERMS_LIMIT = 8;
const DAY_MS = 86400000;

/* Days until a weak item is shown again, in order. */
export const REVIEW_INTERVALS = [1, 3, 7, 14];

export function emptyTaskStats() {
  return { correct: 0, total: 0, history: [], missed: {} };
}

/* Normalise anything read from storage (including old payloads). */
export function normalizeTaskStats(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    correct: Number(source.correct || 0),
    total: Number(source.total || 0),
    history: Array.isArray(source.history) ? [...source.history] : [],
    missed:
      source.missed && typeof source.missed === "object" ? { ...source.missed } : {}
  };
}

/*
Record one graded attempt.

`missedTerms` are the parts the answer left out
(uncovered key points for SWT, missing keywords
for Describe Image). They are accumulated per
item so a learner can see exactly what to
revisit. The input object is never mutated.
*/
export function recordTaskAttempt(stats, attempt) {
  const { itemId = "", title = "", percent = 0, missedTerms = [], now = Date.now() } = attempt || {};

  const next = normalizeTaskStats(stats);
  const score = Number(percent) || 0;

  next.correct += score / 100;
  next.total += 1;
  next.history.push({ t: now, percent: score });
  if (next.history.length > HISTORY_LIMIT) {
    next.history = next.history.slice(-HISTORY_LIMIT);
  }

  if (itemId) {
    const previous = next.missed[itemId] || {};
    const weak = [...new Set([...(previous.weak || []), ...missedTerms])]
      .filter(Boolean)
      .slice(0, WEAK_TERMS_LIMIT);

    /*
    Review schedule.

    Below the threshold the item is scheduled with the Leitner ladder
    (1, 3, 7, 14 days). Answering it before it was due means the item is
    not yet learned, so the ladder restarts at one day instead of growing.
    Answering it well clears the schedule completely.
    */
    const schedule = scheduleReview(previous, score, now);

    next.missed[itemId] = {
      count: Number(previous.count || 0) + 1,
      best: Math.max(Number(previous.best || 0), score),
      last: score,
      lastT: now,
      title: title || previous.title || itemId,
      weak,
      streak: schedule.streak,
      due: schedule.due
    };
  }

  return next;
}

/*
Decide when a weak item should come back.
Kept separate so it can be tested on its own.
*/
export function scheduleReview(previous, score, now = Date.now()) {
  if (Number(score) >= WEAK_THRESHOLD) {
    return { streak: 0, due: 0 };
  }

  const reviewedEarly = Number(previous.due || 0) > now;
  const streak = reviewedEarly
    ? 1
    : Math.min(REVIEW_INTERVALS.length, Number(previous.streak || 0) + 1);

  return {
    streak,
    due: now + REVIEW_INTERVALS[streak - 1] * DAY_MS
  };
}

/*
Human wording for a schedule, in Arabic to match the dashboard.
Returns null when the item is not scheduled.
*/
export function describeDue(entry, now = Date.now()) {
  const due = Number((entry && entry.due) || 0);
  if (!due) return null;

  const diff = due - now;

  if (diff <= 0) {
    const days = Math.floor(-diff / DAY_MS);
    return {
      state: "overdue",
      tone: "high",
      label: days >= 1 ? `متأخرة ${days} يوم` : "مستحقة الآن",
      days: -days
    };
  }

  if (diff <= DAY_MS) return { state: "today", tone: "mid", label: "خلال 24 ساعة", days: 1 };

  const days = Math.ceil(diff / DAY_MS);
  return { state: "later", tone: "low", label: `بعد ${days} يوم`, days };
}

/* Items never scored above `threshold`, weakest first. */
export function getWeakItems(stats, threshold = WEAK_THRESHOLD) {
  const { missed } = normalizeTaskStats(stats);

  return Object.entries(missed)
    .filter(([, entry]) => Number(entry.best || 0) < threshold)
    .map(([id, entry]) => ({
      id,
      title: entry.title || id,
      best: Number(entry.best || 0),
      last: Number(entry.last || 0),
      count: Number(entry.count || 0),
      weak: Array.isArray(entry.weak) ? entry.weak : [],
      due: Number(entry.due || 0),
      streak: Number(entry.streak || 0)
    }))
    .sort((a, b) => a.best - b.best || b.count - a.count || a.id.localeCompare(b.id));
}

/*
Weak items whose review date has arrived (or has passed), soonest first.
This is what turns the weak list into an actual study queue.
*/
export function getDueItems(stats, now = Date.now(), threshold = WEAK_THRESHOLD) {
  return getWeakItems(stats, threshold)
    .filter((item) => item.due > 0 && item.due <= now)
    .map((item) => ({ ...item, ...describeDue({ due: item.due }, now) }))
    .sort((a, b) => a.due - b.due || a.best - b.best);
}

/* Weak items with a future review date, nearest first. */
export function getUpcomingItems(stats, now = Date.now(), threshold = WEAK_THRESHOLD) {
  return getWeakItems(stats, threshold)
    .filter((item) => item.due > now)
    .map((item) => ({ ...item, ...describeDue({ due: item.due }, now) }))
    .sort((a, b) => a.due - b.due);
}