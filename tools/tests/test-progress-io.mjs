/* ==========================================
   PTE Trainer — progress backup tests
   Run: node tools/tests/test-progress-io.mjs
   ========================================== */

import {
  APP_ID,
  SNAPSHOT_VERSION,
  STATS_KEYS,
  STUDY_KEY,
  PRON_KEY,
  SETTING_KEYS,
  HISTORY_LIMIT,
  buildSnapshot,
  mergeStats,
  mergeStudyEntry,
  mergePronEntry,
  mergeSnapshot,
  validateSnapshot,
  resetStats,
  resetEverything,
  describeKeys
} from "../../js/progress-io.js";

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

/* In-memory storage that behaves like localStorage (values are strings). */
function fakeStorage(initial = {}) {
  /* localStorage only ever receives strings, so object fixtures are
     serialised the same way the app does it. */
  const map = new Map(
    Object.entries(initial).map(([key, value]) => [
      key,
      typeof value === "string" ? value : JSON.stringify(value)
    ])
  );
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    _dump: () => Object.fromEntries(map)
  };
}

const STAT = STATS_KEYS[0];

/* ---------------- Build ---------------- */

test("buildSnapshot captures every known key and nothing else", () => {
  const storage = fakeStorage({
    [STATS_KEYS[0]]: { correct: 1, total: 2, history: [] },
    [STATS_KEYS[1]]: { correct: 3, total: 3, history: [] },
    [STUDY_KEY]: { abandon: { status: "review", due: 10, intervalDays: 1, ease: 2.5 } },
    [PRON_KEY]: { abandon: { attempts: 2, correct: 1, lastCorrect: false, lastDate: 5 } },
    "pte.theme": "dark",
    "pte.goal.v1": "65",
    "unrelated.key": "ignore me"
  });

  const snapshot = buildSnapshot(storage, 1000);
  assert(snapshot.app === APP_ID, "app id must be set");
  assert(snapshot.version === SNAPSHOT_VERSION, "version must be set");
  assert(snapshot.exportedAt === 1000, "timestamp must be recorded");
  assert(snapshot.data[STATS_KEYS[0]], "stats must be captured");
  assert(snapshot.data["pte.theme"] === "dark", "settings must be captured as raw strings");
  assert(snapshot.data["unrelated.key"] === undefined, "unknown keys must be ignored");
});

test("buildSnapshot survives corrupt JSON in storage", () => {
  const storage = fakeStorage({ [STATS_KEYS[0]]: "{not json" });
  const snapshot = buildSnapshot(storage);
  assert(snapshot.data[STATS_KEYS[0]] === undefined, "corrupt values must be skipped, not thrown");
});

/* ---------------- Merging stats ---------------- */

test("merging stats sums attempts and combines history in time order", () => {
  const a = { correct: 0.8, total: 1, history: [{ t: 200, percent: 80 }] };
  const b = { correct: 0.5, total: 1, history: [{ t: 100, percent: 50 }] };
  const merged = mergeStats(a, b);

  assert(Math.abs(merged.correct - 1.3) < 1e-9, `correct must be 1.3, got ${merged.correct}`);
  assert(merged.total === 2, "total must be 2");
  assert(merged.history[0].t === 100 && merged.history[1].t === 200, "history must be sorted by time");
});

test("merging stats never loses the best score of an item", () => {
  const a = {
    correct: 0.4, total: 1, history: [{ t: 1, percent: 40 }],
    missed: { "item-1": { count: 1, best: 40, last: 40, lastT: 10, title: "One", weak: ["x"] } }
  };
  const b = {
    correct: 0.9, total: 1, history: [{ t: 2, percent: 90 }],
    missed: { "item-1": { count: 2, best: 90, last: 90, lastT: 20, title: "One", weak: ["y"] } }
  };
  const merged = mergeStats(a, b);
  const entry = merged.missed["item-1"];

  assert(entry.best === 90, `best must stay 90, got ${entry.best}`);
  assert(entry.count === 2, `attempts must take the max so a repeat import cannot inflate them, got ${entry.count}`);
  assert(entry.last === 90, "last must be the newest score");
  assert(entry.weak.length === 2, "missed terms must be combined");
  assert(entry.title === "One", "title must survive");
  assert(merged.total === 2, "two distinct attempts must be counted twice");
});

test("merging keeps the newest entry when the two disagree", () => {
  const a = { correct: 0, total: 1, history: [], missed: { i: { count: 1, best: 80, last: 80, lastT: 500, title: "A", weak: [] } } };
  const b = { correct: 0, total: 1, history: [], missed: { i: { count: 1, best: 30, last: 30, lastT: 100, title: "B", weak: [] } } };
  const merged = mergeStats(a, b);
  assert(merged.missed.i.last === 80, "the newer lastT wins even with a lower score");
  assert(merged.missed.i.best === 80, "best must not regress");
});

test("grammar miss counters and lesson bests merge correctly", () => {
  const a = { correct: 1, total: 1, history: [], missed: { q1: 2, q2: 0 }, lessons: { l1: 40 } };
  const b = { correct: 1, total: 1, history: [], missed: { q1: 1, q3: 3 }, lessons: { l1: 75, l2: 60 } };
  const merged = mergeStats(a, b);

  assert(merged.missed.q1 === 3, `q1 must sum to 3, got ${merged.missed.q1}`);
  assert(merged.missed.q3 === 3, "a new miss must be added");
  assert(merged.lessons.l1 === 75, `lesson best must be 75, got ${merged.lessons.l1}`);
  assert(merged.lessons.l2 === 60, "a new lesson must be added");
});

test("a file without history still contributes its own counters", () => {
  const merged = mergeStats(
    { correct: 1, total: 2, history: [{ t: 5, percent: 50 }] },
    { correct: 0.5, total: 1 }
  );
  assert(merged.total === 3, `expected 3 attempts, got ${merged.total}`);
  assert(Math.abs(merged.correct - 1.5) < 1e-9, "counters must be summed when history is absent");
});

test("history is capped after merging", () => {
  const long = (offset) => ({
    correct: 0, total: 1,
    history: Array.from({ length: 300 }, (_, i) => ({ t: offset + i, percent: 50 }))
  });
  const merged = mergeStats(long(0), long(1000));
  assert(merged.history.length === HISTORY_LIMIT, `expected ${HISTORY_LIMIT} entries, got ${merged.history.length}`);
  assert(merged.history[merged.history.length - 1].t === 1299, "the newest entries must be kept");
});

test("empty or broken stats merge into zeros instead of NaN", () => {
  assert(mergeStats(null, null).total === 0, "two nulls must give 0");
  assert(mergeStats({ total: "x" }, { total: 1 }).total === 1, "a broken number must not poison the result");
});

/* ---------------- Word-level merges ---------------- */

test("the more advanced study entry wins, but the earlier due date is kept", () => {
  const learned = { status: "learned", due: 900, intervalDays: 9, ease: 3 };
  const review = { status: "review", due: 100, intervalDays: 0, ease: 2.5 };

  const merged = mergeStudyEntry(learned, review);
  assert(merged.status === "learned", "a learned word must not become a review word");
  assert(merged.due === 100, "the earlier due date must be kept so it still surfaces");
  assert(merged.intervalDays === 9, "the longer interval must be kept");
});

test("a longer interval wins between two review entries", () => {
  const merged = mergeStudyEntry(
    { status: "review", due: 500, intervalDays: 1, ease: 2.5 },
    { status: "review", due: 800, intervalDays: 4, ease: 2.5 }
  );
  assert(merged.intervalDays === 4, "the larger interval must win");
});

test("pronunciation attempts add up and the newest verdict wins", () => {
  const a = { attempts: 2, correct: 1, lastCorrect: false, lastDate: 100 };
  const b = { attempts: 3, correct: 3, lastCorrect: true, lastDate: 900 };
  const merged = mergePronEntry(a, b);

  assert(merged.attempts === 5, `attempts must be 5, got ${merged.attempts}`);
  assert(merged.correct === 4, `correct must be 4, got ${merged.correct}`);
  assert(merged.lastCorrect === true, "the newest verdict must win");
  assert(merged.lastDate === 900, "the newest date must win");
});

test("merging with a missing side returns the other side unchanged", () => {
  const entry = { status: "learned", due: 1, intervalDays: 3, ease: 2.5 };
  assert(mergeStudyEntry(null, entry) === entry, "a missing local entry must be adopted as is");
  assert(mergeStudyEntry(entry, null) === entry, "a missing imported entry must change nothing");
});

/* ---------------- Validation ---------------- */

test("a foreign or broken file is refused before anything is written", () => {
  const storage = fakeStorage({ [STATS_KEYS[0]]: { total: 5 } });

  const notAnObject = validateSnapshot("nope");
  assert(!notAnObject.ok && notAnObject.errors.length, "a string must be refused");

  const wrongApp = validateSnapshot({ app: "other-app", data: { [STATS_KEYS[0]]: {} } });
  assert(!wrongApp.ok, "a foreign app must be refused");

  const noData = validateSnapshot({ app: APP_ID, version: 1, data: null });
  assert(!noData.ok, "a missing data object must be refused");

  const unknownOnly = validateSnapshot({ app: APP_ID, version: 1, data: { foo: 1 } });
  assert(!unknownOnly.ok, "unknown keys alone must be refused");

  const report = mergeSnapshot(storage, { app: "other", data: { [STATS_KEYS[0]]: { total: 1 } } });
  assert(!report.ok, "merging must refuse a foreign file");
  assert(
    JSON.parse(storage.getItem(STATS_KEYS[0])).total === 5,
    "storage must be untouched after a refusal"
  );
});

test("unknown keys inside a valid file produce a warning, not a failure", () => {
  const check = validateSnapshot({
    app: APP_ID,
    version: SNAPSHOT_VERSION,
    data: { [STATS_KEYS[0]]: { total: 1 }, "pte.future.key": {} }
  });
  assert(check.ok, "the file must still be accepted");
  assert(check.warnings.some((w) => w.includes("pte.future.key")), `expected a warning, got ${check.warnings}`);
});

test("a newer file version warns but still imports", () => {
  const check = validateSnapshot({
    app: APP_ID,
    version: SNAPSHOT_VERSION + 5,
    data: { [STATS_KEYS[0]]: { total: 1 } }
  });
  assert(check.ok, "a newer file must still import");
  assert(check.warnings.some((w) => /أحدث/.test(w)), "expected a version warning");
});

/* ---------------- End to end ---------------- */

test("a full round trip restores progress into an empty browser", () => {
  const source = fakeStorage({
    [STATS_KEYS[0]]: {
      correct: 2.4, total: 3, history: [{ t: 5, percent: 80 }],
      missed: { l1: { count: 1, best: 80, last: 80, lastT: 5, title: "L1", weak: [] } },
      lessons: { a: 70 }
    },
    [STUDY_KEY]: { adopt: { status: "learned", due: 10, intervalDays: 3, ease: 2.5 } },
    [PRON_KEY]: { adopt: { attempts: 3, correct: 2, lastCorrect: true, lastDate: 20 } },
    "pte.theme": "dark",
    "pte.goal.v1": "70"
  });

  const snapshot = buildSnapshot(source);
  const target = fakeStorage();
  const report = mergeSnapshot(target, snapshot);

  assert(report.ok, `import failed: ${report.errors.join("; ")}`);
  const restored = JSON.parse(target.getItem(STATS_KEYS[0]));
  assert(restored.total === 3 && Math.abs(restored.correct - 2.4) < 1e-9, "stats must be restored");
  assert(restored.lessons.a === 70, "lesson best must be restored");
  assert(restored.missed.l1.best === 80, "weak item must be restored");
  assert(target.getItem(STUDY_KEY) !== null, "study state must be restored");
  assert(target.getItem(PRON_KEY) !== null, "pronunciation state must be restored");
  assert(target.getItem("pte.theme") === "dark", "settings must be restored");
  assert(target.getItem("pte.goal.v1") === "70", "the target must be restored");
});

test("importing the same file twice must not double the attempts", () => {
  const source = fakeStorage({
    [STATS_KEYS[0]]: {
      correct: 1, total: 1, history: [{ t: 1, percent: 100 }],
      missed: { "item-1": { count: 1, best: 100, last: 100, lastT: 1, title: "One", weak: ["x"] } }
    }
  });
  const snapshot = buildSnapshot(source);
  const target = fakeStorage();

  mergeSnapshot(target, snapshot);
  const afterFirst = JSON.parse(target.getItem(STATS_KEYS[0]));
  assert(afterFirst.total === 1, `first import must give 1 attempt, got ${afterFirst.total}`);

  const report = mergeSnapshot(target, snapshot);
  const afterSecond = JSON.parse(target.getItem(STATS_KEYS[0]));
  assert(report.ok, "a repeat import must not be treated as a failure");
  assert(
    report.alreadyImported.includes(STATS_KEYS[0]) && report.applied.length === 0,
    "a repeat import must report the key as already imported"
  );
  assert(afterSecond.total === 1, `a repeated identical import must not double attempts, got ${afterSecond.total}`);
  assert(Math.abs(afterSecond.correct - 1) < 1e-9, "the average must be unchanged after a repeat import");
  assert(afterSecond.history.length === 1, "history must not grow on a repeat import");
  assert(afterSecond.missed["item-1"].count === 1, "the item attempt count must not inflate either");
});

test("importing two different devices adds up both histories", () => {
  const phone = fakeStorage({ [STATS_KEYS[0]]: { correct: 0.8, total: 1, history: [{ t: 10, percent: 80 }] } });
  const laptop = fakeStorage({ [STATS_KEYS[0]]: { correct: 0.5, total: 1, history: [{ t: 20, percent: 50 }] } });

  const target = fakeStorage();
  mergeSnapshot(target, buildSnapshot(phone));
  mergeSnapshot(target, buildSnapshot(laptop));

  const merged = JSON.parse(target.getItem(STATS_KEYS[0]));
  assert(merged.total === 2, `expected 2 attempts, got ${merged.total}`);
  assert(merged.history.length === 2, "both history entries must survive");
  assert(Math.abs(merged.correct - 1.3) < 1e-9, `correct must combine to 1.3, got ${merged.correct}`);
});

test("a heavily used module with capped history still restores its real totals", () => {
  /* history is capped at 400 while `total` keeps counting upwards */
  const history = Array.from({ length: 400 }, (_, i) => ({ t: 1000 + i, percent: 60 }));
  const heavy = { correct: 300, total: 500, history };

  const source = fakeStorage({ [STATS_KEYS[0]]: heavy });
  const target = fakeStorage();
  const report = mergeSnapshot(target, buildSnapshot(source));

  assert(report.ok, "import must succeed");
  const restored = JSON.parse(target.getItem(STATS_KEYS[0]));
  assert(restored.total === 500, `the real total must be restored, got ${restored.total}`);
  assert(Math.abs(restored.correct - 300) < 1e-9, "the real average must be restored");
  assert(restored.history.length === 400, "history must be preserved");

  const before = target.getItem(STATS_KEYS[0]);
  mergeSnapshot(target, buildSnapshot(source));
  assert(target.getItem(STATS_KEYS[0]) === before, "a re-import must not change anything");
});

/* ---------------- Reset ---------------- */

test("resetStats clears attempts but keeps the vocabulary work", () => {
  const storage = fakeStorage({
    [STATS_KEYS[0]]: { total: 5 },
    [STUDY_KEY]: { adopt: { status: "learned" } },
    [PRON_KEY]: { adopt: { attempts: 3 } },
    "pte.theme": "dark"
  });

  const cleared = resetStats(storage);
  assert(cleared.includes(STATS_KEYS[0]), "the stats key must be reported as cleared");
  assert(storage.getItem(STATS_KEYS[0]) === null, "stats must be gone");
  assert(storage.getItem(STUDY_KEY) !== null, "study state must survive");
  assert(storage.getItem(PRON_KEY) !== null, "pronunciation state must survive");
  assert(storage.getItem("pte.theme") === "dark", "settings must survive");
});

test("resetEverything clears every key the app owns", () => {
  const storage = fakeStorage({
    [STATS_KEYS[0]]: { total: 5 },
    [STUDY_KEY]: {},
    [PRON_KEY]: {},
    "pte.theme": "dark",
    "pte.goal.v1": "60",
    "pte.di.mode": "practice"
  });

  resetEverything(storage);
  [...STATS_KEYS, STUDY_KEY, PRON_KEY, ...SETTING_KEYS].forEach((key) => {
    assert(storage.getItem(key) === null, `${key} must be cleared`);
  });
  assert(Object.keys(storage._dump()).length === 0, "nothing may be left behind");
});

test("describeKeys lists exactly the keys the module manages", () => {
  const keys = describeKeys();
  assert(keys.stats.length === STATS_KEYS.length, "all stats keys must be listed");
  assert(keys.settings.includes("pte.goal.v1"), "the goal must be listed as a setting");
  assert(keys.settings.includes("pte.theme"), "the theme must be listed as a setting");
});

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
