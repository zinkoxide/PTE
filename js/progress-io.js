/*
==========================================
PTE Trainer
Progress backup — build & merge
==========================================

Everything the learner owns lives in
localStorage, so clearing the browser
silently destroys months of SRS work.
This module turns that storage into a
single portable JSON file and merges an
imported file back in *without* losing
anything.

Merging is additive but *idempotent*, so importing the same file twice
never inflates the numbers:

  attempts   only attempts that are genuinely new are added
  best score kept per item / lesson
  word study the more advanced entry wins
  settings   the imported file wins

Two guards make a repeated import a no-op:

  1. overlap — an attempt is identified by its timestamp, so entries the
     local history already contains are subtracted from the incoming totals
  2. fingerprint — history is capped at 400 entries while `total` keeps
     counting, so for a heavily used module the truncated tail cannot be
     detected by overlap; the shape of each imported payload is recorded and
     an identical payload is skipped outright

It is pure: it takes a storage-like
object ({ getItem, setItem }) so it can be
unit-tested without a browser.
==========================================
*/

"use strict";

export const SNAPSHOT_VERSION = 2;
export const APP_ID = "pte-trainer";

/* Statistics: attempts that should be summed when merging. */
export const STATS_KEYS = [
  "pte.grammar.stats.v1",
  "pte.quiz.stats.v1",
  "pte.swt.stats.v1",
  "pte.di.stats.v1",
  "pte.ra.stats.v1"
];

/* Vocabulary study status (SRS) — merged per word. */
export const STUDY_KEY = "pte.vocab.study.v1";

/* Pronunciation attempts — merged per word. */
export const PRON_KEY = "pte.vocab.pron.v1";

/* Preferences: the imported file wins. */
export const SETTING_KEYS = ["pte.theme", "pte.goal.v1", "pte.swt.mode", "pte.di.mode", "pte.ra.mode"];

export const HISTORY_LIMIT = 400;

/*
Internal bookkeeping: the fingerprints of payloads already applied, so the
same file is never merged twice. Deliberately not exported in a backup —
restoring into a fresh browser must apply the whole file.
*/
const APPLIED_KEY = "pte.backup.applied.v1";
const FINGERPRINT_LIMIT = 20;

function readJSON(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/*
A corrupt value in one file must never poison a total with NaN — a single
broken number would otherwise silently destroy every average on the
dashboard after an import.
*/
function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/* ---------------- Build ---------------- */

export function buildSnapshot(storage, now = Date.now()) {
  const data = {};

  STATS_KEYS.forEach((key) => {
    const value = readJSON(storage, key);
    if (isObject(value)) data[key] = value;
  });

  [STUDY_KEY, PRON_KEY].forEach((key) => {
    const value = readJSON(storage, key);
    if (isObject(value)) data[key] = value;
  });

  SETTING_KEYS.forEach((key) => {
    try {
      const value = storage.getItem(key);
      if (value != null) data[key] = value;
    } catch {
      /* ignore */
    }
  });

  return {
    app: APP_ID,
    version: SNAPSHOT_VERSION,
    exportedAt: now,
    data
  };
}

/* ---------------- Merge helpers ---------------- */

/*
Combine two histories and report which entries were genuinely new.
Entries are identified by timestamp, so re-importing an old file adds
nothing, while a second device contributes all of its own attempts.
*/
function mergeHistory(a, b) {
  const existing = new Set((Array.isArray(a) ? a : []).map((entry) => num(entry && entry.t)));
  const combined = [...(Array.isArray(a) ? a : [])];
  const added = [];

  (Array.isArray(b) ? b : []).forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const stamp = num(entry.t);
    if (existing.has(stamp)) return;
    existing.add(stamp);
    combined.push(entry);
    added.push(entry);
  });

  combined.sort((x, y) => num(x.t) - num(y.t));
  return { history: combined.slice(-HISTORY_LIMIT), added };
}

function mergeMissedMap(a, b) {
  const out = {};
  const ids = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);

  ids.forEach((id) => {
    const left = (a || {})[id] || {};
    const right = (b || {})[id] || {};
    const newest = num(right.lastT) > num(left.lastT) ? right : left;
    const dueCandidates = [num(left.due), num(right.due)].filter((value) => value > 0);

    /*
    `count` is the number of times an item was attempted. Two exports carry
    no shared attempt id, so the true union is unknowable — the maximum is
    used instead of the sum, which can never inflate on a repeated import.
    */
    /*
    `due` takes the earlier of the two dates on purpose: an old backup must
    never postpone a review that is already waiting, and an item answered
    well on one device still leaves the weak list through the best score.
    */
    out[id] = {
      count: Math.max(num(left.count), num(right.count)),
      best: Math.max(num(left.best), num(right.best)),
      last: num(newest.last),
      lastT: Math.max(num(left.lastT), num(right.lastT)),
      title: right.title || left.title || id,
      weak: [...new Set([...(left.weak || []), ...(right.weak || [])])].slice(0, 8),
      streak: Math.max(num(left.streak), num(right.streak)),
      due: dueCandidates.length ? Math.min(...dueCandidates) : 0
    };
  });

  return out;
}

/*
Grammar keeps a per-lesson best score and a per-question miss counter.
Counters have no timestamp to identify a single miss, so they are summed —
the only figure that can drift when the same file is imported twice.
*/
function mergeLessons(a, b) {
  const out = { ...(a || {}) };
  Object.entries(b || {}).forEach(([id, value]) => {
    out[id] = Math.max(num(out[id]), num(value));
  });
  return out;
}

function mergeMissedCounts(a, b) {
  const out = { ...(a || {}) };
  Object.entries(b || {}).forEach(([id, value]) => {
    out[id] = num(out[id]) + num(value);
  });
  return out;
}

/*
Identify a payload by its shape: how many attempts it claims, how much
history it carries and when the last entry happened. Cheap, stable and good
enough to recognise "this exact file again".
*/
function fingerprintOf(stats) {
  const history = Array.isArray(stats.history) ? stats.history : [];
  const last = history.length ? num(history[history.length - 1].t) : 0;
  return [num(stats.total), history.length, last].join("|");
}

/*
Attempt-based statistics. Every module writes
{ correct, total, history } and may add
`missed` (task items or grammar questions)
and `lessons` (grammar only), so one merge
covers all of them.
*/
export function mergeStats(current, incoming) {
  const left = isObject(current) ? current : {};
  const right = isObject(incoming) ? incoming : {};

  const { history, added } = mergeHistory(left.history, right.history);
  const incomingHistory = Array.isArray(right.history) ? right.history : [];
  const overlap = incomingHistory.length - added.length;

  const incomingTotal = num(right.total);
  const incomingCorrect = num(right.correct);

  /*
  Nothing shared -> the whole payload is new. Everything shared -> the shared
  attempts are subtracted, and when only part of the history overlaps the
  incoming average is scaled by the share that is actually new.
  */
  let addedTotal = incomingTotal;
  let addedCorrect = incomingCorrect;

  if (overlap > 0) {
    addedTotal = Math.max(0, incomingTotal - overlap);
    addedCorrect = incomingTotal > 0 ? incomingCorrect * (addedTotal / incomingTotal) : 0;
  }

  const merged = {
    correct: num(left.correct) + addedCorrect,
    total: num(left.total) + addedTotal,
    history
  };

  const missedLeft = left.missed || {};
  const missedRight = right.missed || {};

  const leftIsCounts = Object.values(missedLeft).every((v) => typeof v === "number");
  const rightIsCounts = Object.values(missedRight).every((v) => typeof v === "number");

  if (leftIsCounts && rightIsCounts) {
    merged.missed = mergeMissedCounts(missedLeft, missedRight);
  } else if (Object.keys(missedLeft).length || Object.keys(missedRight).length) {
    merged.missed = mergeMissedMap(missedLeft, missedRight);
  }

  if (left.lessons || right.lessons) {
    merged.lessons = mergeLessons(left.lessons, right.lessons);
  }

  return merged;
}

/* The more advanced study entry wins; the earlier due date is kept. */
export function mergeStudyEntry(a, b) {
  if (!isObject(a)) return b;
  if (!isObject(b)) return a;

  const learned = (entry) => entry.status === "learned";
  const winner = learned(a) && !learned(b) ? a : learned(b) && !learned(a) ? b : num(b.intervalDays) > num(a.intervalDays) ? b : a;
  const loser = winner === a ? b : a;

  return {
    status: winner.status,
    due: Math.min(num(a.due), num(b.due)) || num(winner.due),
    intervalDays: Math.max(num(a.intervalDays), num(b.intervalDays)),
    ease: Math.max(num(a.ease), num(b.ease))
  };
}

export function mergePronEntry(a, b) {
  if (!isObject(a)) return b;
  if (!isObject(b)) return a;
  const newest = num(b.lastDate) > num(a.lastDate) ? b : a;
  return {
    attempts: num(a.attempts) + num(b.attempts),
    correct: num(a.correct) + num(b.correct),
    lastCorrect: newest.lastCorrect,
    lastDate: Math.max(num(a.lastDate), num(b.lastDate))
  };
}

function mergeWordMap(current, incoming, mergeEntry) {
  const out = { ...(current || {}) };
  let changed = 0;
  Object.entries(incoming || {}).forEach(([word, value]) => {
    if (out[word] === undefined) {
      out[word] = value;
      changed += 1;
    } else {
      const merged = mergeEntry(out[word], value);
      if (JSON.stringify(merged) !== JSON.stringify(out[word])) changed += 1;
      out[word] = merged;
    }
  });
  return { merged: out, changed };
}

/* ---------------- Public merge ---------------- */

/*
Validate a parsed file. Returns
{ ok, errors, warnings, data } so the UI can
refuse a bad file before touching storage.
*/
export function validateSnapshot(snapshot) {
  const errors = [];
  const warnings = [];

  if (!isObject(snapshot)) {
    return { ok: false, errors: ["الملف ليس كائن JSON صالح."], warnings, data: null };
  }
  if (snapshot.app !== APP_ID) {
    errors.push(`الملف لا يخص هذا التطبيق (app="${snapshot.app || "غير محدد"}").`);
  }
  if (!isObject(snapshot.data)) {
    errors.push("الملف لا يحتوي على حقل data.");
  }

  const known = [...STATS_KEYS, STUDY_KEY, PRON_KEY, ...SETTING_KEYS];
  const keys = isObject(snapshot.data) ? Object.keys(snapshot.data) : [];
  const usable = keys.filter((key) => known.includes(key));
  const unknown = keys.filter((key) => !known.includes(key));

  if (!usable.length) errors.push("لا يحتوي الملف على أي بيانات معروفة.");
  if (unknown.length) warnings.push(`مفاتيح غير معروفة تم تجاهلها: ${unknown.join("، ")}`);
  if (Number(snapshot.version) > SNAPSHOT_VERSION) {
    warnings.push(`الملف من إصدار أحدث (${snapshot.version})، قد تُتجاهل بعض الحقول.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    data: isObject(snapshot.data) ? snapshot.data : null,
    usableKeys: usable
  };
}

/*
Merge a validated snapshot into storage.
Nothing is written unless validation passed,
and the report explains exactly what changed.
*/
export function mergeSnapshot(storage, snapshot) {
  const check = validateSnapshot(snapshot);
  const report = {
    ok: false,
    errors: check.errors,
    warnings: check.warnings,
    applied: [],
    skipped: [],
    alreadyImported: []
  };

  if (!check.ok || !check.data) return report;

  const data = check.data;

  const appliedMap = readJSON(storage, APPLIED_KEY) || {};

  STATS_KEYS.forEach((key) => {
    if (!isObject(data[key])) {
      if (data[key] !== undefined) report.skipped.push(key);
      return;
    }

    const fingerprint = fingerprintOf(data[key]);
    const seen = Array.isArray(appliedMap[key]) ? appliedMap[key] : [];
    if (seen.includes(fingerprint)) {
      report.alreadyImported.push(key);
      return;
    }

    const merged = mergeStats(readJSON(storage, key), data[key]);
    if (writeJSON(storage, key, merged)) {
      report.applied.push(key);
      appliedMap[key] = [...seen, fingerprint].slice(-FINGERPRINT_LIMIT);
    }
  });

  writeJSON(storage, APPLIED_KEY, appliedMap);

  [STUDY_KEY, PRON_KEY].forEach((key) => {
    if (!isObject(data[key])) {
      if (data[key] !== undefined) report.skipped.push(key);
      return;
    }
    const mergeEntry = key === STUDY_KEY ? mergeStudyEntry : mergePronEntry;
    const { merged, changed } = mergeWordMap(readJSON(storage, key), data[key], mergeEntry);
    if (writeJSON(storage, key, merged)) {
      report.applied.push(key);
      report.changedWords = (report.changedWords || 0) + changed;
    }
  });

  SETTING_KEYS.forEach((key) => {
    if (data[key] === undefined) return;
    try {
      storage.setItem(key, String(data[key]));
      report.applied.push(key);
    } catch {
      report.skipped.push(key);
    }
  });

  /* A file that is entirely known is a success with nothing new to do. */
  report.ok =
    report.applied.length > 0 ||
    report.alreadyImported.length > 0 ||
    report.skipped.length > 0;
  return report;
}

/* ---------------- Reset ---------------- */

/* Clears statistics but keeps the vocabulary study work. */
export function resetStats(storage) {
  const cleared = [];
  STATS_KEYS.forEach((key) => {
    try {
      storage.removeItem(key);
      cleared.push(key);
    } catch {
      /* ignore */
    }
  });
  return cleared;
}

/* Clears absolutely everything this app owns. */
export function resetEverything(storage) {
  const cleared = [];
  [...STATS_KEYS, STUDY_KEY, PRON_KEY, ...SETTING_KEYS].forEach((key) => {
    try {
      storage.removeItem(key);
      cleared.push(key);
    } catch {
      /* ignore */
    }
  });
  return cleared;
}

export function describeKeys() {
  return {
    stats: [...STATS_KEYS],
    study: STUDY_KEY,
    pron: PRON_KEY,
    settings: [...SETTING_KEYS]
  };
}
