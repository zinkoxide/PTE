/* ==========================================
   PTE Trainer — task stats unit tests
   Run: node tools/tests/test-stats.mjs
   ========================================== */

import {
  WEAK_THRESHOLD,
  emptyTaskStats,
  normalizeTaskStats,
  recordTaskAttempt,
  getWeakItems
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

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
