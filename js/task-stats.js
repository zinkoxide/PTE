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

This module is pure: it never touches
localStorage, which keeps it unit-testable.
==========================================
*/

"use strict";

export const WEAK_THRESHOLD = 60;
const HISTORY_LIMIT = 400;
const WEAK_TERMS_LIMIT = 8;

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

    next.missed[itemId] = {
      count: Number(previous.count || 0) + 1,
      best: Math.max(Number(previous.best || 0), score),
      last: score,
      lastT: now,
      title: title || previous.title || itemId,
      weak
    };
  }

  return next;
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
      weak: Array.isArray(entry.weak) ? entry.weak : []
    }))
    .sort((a, b) => a.best - b.best || b.count - a.count || a.id.localeCompare(b.id));
}