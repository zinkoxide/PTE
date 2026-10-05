/* ==========================================
   PTE Trainer — task stats unit tests
   Run: node tools/tests/test-stats.mjs
   ========================================== */

import {
  WEAK_THRESHOLD,
  REVIEW_INTERVALS,
  emptyTaskStats,
  normalizeTaskStats,
  recordTaskAttempt,
  getWeakItems,
  getDueItems,
  getUpcomingItems,
  scheduleReview,
  describeDue
} from "../../js/task-stats.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK: ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL: ${name} — ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

test("empty stats start at zero with a missed map", () => {
  const stats = emptyTaskStats();
  assert(stats.correct === 0 && stats.total === 0, "counters must start at 0");
  assert(Array.isArray(stats.history), "history must be an array");
  assert(typeof stats.missed === "object", "missed map must exist");
});

test("legacy payloads without a missed map are normalized", () => {
  const stats = normalizeTaskStats({ correct: 2, total: 3, history: [{ t: 1, percent: 60 }] });
  assert(stats.total === 3, "total must survive");
  assert(stats.history.length === 1, "history must survive");
  assert(Object.keys(stats.missed).length === 0, "missed map must be created");
  assert(normalizeTaskStats(null).total === 0, "null must fall back to zeros");
});

test("an attempt updates the dashboard counters and history", () => {
  const first = recordTaskAttempt(emptyTaskStats(), { itemId: "a", percent: 80, now: 111 });
  assert(first.total === 1, "total must be 1");
  assert(Math.abs(first.correct - 0.8) < 1e-9, `correct must be 0.8, got ${first.correct}`);
  assert(first.history[0].t === 111 && first.history[0].percent === 80, "history entry must keep time and percent");

  const second = recordTaskAttempt(first, { itemId: "a", percent: 60, now: 222 });
  assert(second.total === 2, "total must accumulate");
  assert(Math.abs(second.correct - 1.4) < 1e-9, "correct must accumulate");
});

test("history is capped at 400 entries", () => {
  let stats = emptyTaskStats();
  for (let i = 0; i < 420; i += 1) {
    stats = recordTaskAttempt(stats, { itemId: "x", percent: 50, now: i });
  }
  assert(stats.history.length === 400, `expected 400 history entries, got ${stats.history.length}`);
  assert(stats.history[399].t === 419, "the newest entries must be kept");
});

test("per-item tracking keeps count, best, last and the missed terms", () => {
  let stats = recordTaskAttempt(emptyTaskStats(), {
    itemId: "tourism",
    title: "Tourism",
    percent: 40,
    missedTerms: ["summer peak", "2023"],
    now: 1
  });
  stats = recordTaskAttempt(stats, {
    itemId: "tourism",
    title: "Tourism",
    percent: 70,
    missedTerms: ["2023"],
    now: 2
  });

  const entry = stats.missed.tourism;
  assert(entry.count === 2, `expected 2 attempts, got ${entry.count}`);
  assert(entry.best === 70, `best must stay 70, got ${entry.best}`);
  assert(entry.last === 70, "last must be the newest score");
  assert(entry.title === "Tourism", "title must be kept for the dashboard");
  assert(entry.weak.length === 2, `missed terms must be de-duplicated, got ${entry.weak.join("|")}`);
});

test("missed terms are capped so one item cannot bloat storage", () => {
  let stats = emptyTaskStats();
  for (let i = 0; i < 12; i += 1) {
    stats = recordTaskAttempt(stats, { itemId: "big", percent: 10, missedTerms: [`term-${i}`] });
  }
  assert(stats.missed.big.weak.length === 8, `expected 8 stored terms, got ${stats.missed.big.weak.length}`);
});

test("recording never mutates the input stats object", () => {
  const original = emptyTaskStats();
  const snapshot = JSON.stringify(original);
  recordTaskAttempt(original, { itemId: "a", percent: 50, missedTerms: ["x"] });
  assert(JSON.stringify(original) === snapshot, "input stats must stay untouched");
});

test("getWeakItems returns only items below the threshold, weakest first", () => {
  let stats = emptyTaskStats();
  stats = recordTaskAttempt(stats, { itemId: "good", percent: 88, now: 1 });
  stats = recordTaskAttempt(stats, { itemId: "mid", percent: 60, now: 2 });
  stats = recordTaskAttempt(stats, { itemId: "bad", percent: 35, now: 3 });
  stats = recordTaskAttempt(stats, { itemId: "terrible", percent: 10, missedTerms: ["nothing"], now: 4 });

  const weak = getWeakItems(stats);
  assert(weak.length === 2, `expected 2 weak items, got ${weak.length}`);
  assert(weak[0].id === "terrible" && weak[1].id === "bad", `wrong order: ${weak.map((w) => w.id).join(",")}`);
  assert(weak[0].weak[0] === "nothing", "missed terms must travel with the row");
  assert(weak.every((item) => item.best < WEAK_THRESHOLD), "every returned item must be below the threshold");
});

test("an item that later scores well drops out of the weak list", () => {
  let stats = recordTaskAttempt(emptyTaskStats(), { itemId: "recovered", percent: 30, now: 1 });
  assert(getWeakItems(stats).length === 1, "the item starts weak");
  stats = recordTaskAttempt(stats, { itemId: "recovered", percent: 82, now: 2 });
  assert(getWeakItems(stats).length === 0, "a high best score must clear the item");
});

/* ---------------- Review schedule ---------------- */

const DAY = 86400000;

test("a weak attempt schedules the item one day later", () => {
  const stats = recordTaskAttempt(emptyTaskStats(), {
    itemId: "a",
    percent: 40,
    now: 1000
  });
  const entry = stats.missed.a;
  assert(entry.streak === 1, `expected streak 1, got ${entry.streak}`);
  assert(entry.due === 1000 + REVIEW_INTERVALS[0] * DAY, `due must be +1 day, got ${entry.due - 1000}`);
  assert(REVIEW_INTERVALS[0] === 1, "the first interval must be one day");
});

test("the ladder grows while the item stays weak", () => {
  let stats = emptyTaskStats();
  let now = 1000;
  const seen = [];

  for (let i = 0; i < REVIEW_INTERVALS.length + 2; i += 1) {
    stats = recordTaskAttempt(stats, { itemId: "a", percent: 30, now });
    const entry = stats.missed.a;
    seen.push(entry.due - now);
    /* jump past the due date so the next attempt counts as a real review */
    now = entry.due + 1000;
  }

  assert(seen[0] === 1 * DAY, `first gap must be 1 day, got ${seen[0] / DAY}`);
  assert(seen[1] === 3 * DAY, `second gap must be 3 days, got ${seen[1] / DAY}`);
  assert(seen[2] === 7 * DAY, `third gap must be 7 days, got ${seen[2] / DAY}`);
  assert(seen[3] === 14 * DAY, `fourth gap must be 14 days, got ${seen[3] / DAY}`);
  assert(seen[seen.length - 1] === 14 * DAY, "the ladder must cap at the longest interval");
});

test("answering well clears the schedule and resets the streak", () => {
  let stats = recordTaskAttempt(emptyTaskStats(), { itemId: "a", percent: 30, now: 1000 });
  assert(stats.missed.a.due > 0, "the item must be scheduled after a weak attempt");

  const good = recordTaskAttempt(stats, { itemId: "a", percent: 85, now: 2000 });
  assert(good.missed.a.due === 0, "a good answer must clear the schedule");
  assert(good.missed.a.streak === 0, "the streak must reset");
  assert(good.missed.a.best === 85, "the best score must be kept");
  assert(getWeakItems(good).length === 0, "the item must leave the weak list");
});

test("failing an early re-test restarts the ladder at one day", () => {
  let stats = recordTaskAttempt(emptyTaskStats(), { itemId: "a", percent: 30, now: 1000 });

  /* a genuine review, attempted after the due date, grows the ladder */
  stats = recordTaskAttempt(stats, { itemId: "a", percent: 30, now: stats.missed.a.due + 1000 });
  assert(stats.missed.a.streak === 2, `the ladder should have grown to 2, got ${stats.missed.a.streak}`);

  /* retry long before the next review date and fail again */
  const earlyAt = stats.missed.a.due - 5 * DAY;
  const early = recordTaskAttempt(stats, { itemId: "a", percent: 30, now: earlyAt });
  assert(early.missed.a.streak === 1, `an early failure must restart at 1, got ${early.missed.a.streak}`);
  assert(early.missed.a.due === earlyAt + DAY, "an early failure must come back tomorrow");
});

test("due items and upcoming items split the queue correctly", () => {
  let stats = emptyTaskStats();
  stats = recordTaskAttempt(stats, { itemId: "overdue", percent: 30, now: 1000 });
  stats = recordTaskAttempt(stats, { itemId: "soon", percent: 30, now: Date.now() - 12 * 3600 * 1000 });
  stats = recordTaskAttempt(stats, { itemId: "later", percent: 30, now: Date.now() });

  const now = Date.now();
  const due = getDueItems(stats, now);
  const upcoming = getUpcomingItems(stats, now);

  assert(due.some((item) => item.id === "overdue"), "the 1000-timestamp item must be overdue");
  assert(!due.some((item) => item.id === "later"), "a future item must not be due");
  assert(upcoming.some((item) => item.id === "later"), "the freshly scheduled item must be upcoming");
  assert(due.every((item) => item.due <= now), "due items must all be at or past their date");
  assert(
    due.every((item, i) => i === 0 || due[i - 1].due <= item.due),
    "due items must be sorted soonest first"
  );
});

test("describeDue words the schedule in Arabic", () => {
  const now = 1000 * 1000;
  assert(describeDue({ due: 0 }, now) === null, "an unscheduled item has no wording");
  assert(describeDue({ due: now - 100 }, now).state === "overdue", "a past date is overdue");
  assert(describeDue({ due: now - 3 * DAY }, now).label.includes("3"), "an old date states the days late");
  assert(describeDue({ due: now + 5 * 3600 * 1000 }, now).state === "today", "within 24 hours reads as today");
  assert(describeDue({ due: now + 3 * DAY }, now).label.includes("3"), "a future date states the days left");
});

test("scheduleReview is a pure decision that defaults to now", () => {
  const weak = scheduleReview({}, 10, 5000);
  assert(weak.streak === 1 && weak.due === 5000 + DAY, "a first failure schedules +1 day");
  const passed = scheduleReview({ streak: 3, due: 9000 }, 90);
  assert(passed.due === 0 && passed.streak === 0, "a pass must clear the schedule");
});

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
