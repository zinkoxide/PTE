/* ==========================================
   PTE Trainer — Vocabulary study state (SRS) tests
   Run: node tools/tests/test-storage.mjs
   ========================================== */

class LocalStorageMock {
  constructor() {
    this.data = new Map();
  }
  getItem(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  }
  setItem(key, value) {
    this.data.set(key, String(value));
  }
  removeItem(key) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

globalThis.localStorage = new LocalStorageMock();

const storage = await import("../../js/storage.js");

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
  if (!condition) throw new Error(message || "assertion failed");
}

const DAY_MS = 86400000;

/* ---------- migration ---------- */

test("migrates legacy string status values", () => {
  localStorage.setItem("pte.vocab.study.v1", JSON.stringify({ alpha: "learned", beta: "review" }));
  const state = storage.loadStudyState();
  assert(state.alpha && state.alpha.status === "learned", "alpha should be learned");
  assert(state.alpha.due > 0, "alpha should have a due date");
  assert(state.beta && state.beta.status === "review", "beta should be review");
  assert(storage.getStudyStatus("alpha") === "learned", "getStudyStatus returns status");
});

/* ---------- setStudyStatus scheduling ---------- */

test("setStudyStatus learned schedules review in ~3 days", () => {
  localStorage.clear();
  const before = Date.now();
  storage.setStudyStatus("apple", "learned");
  const entry = storage.getStudyEntry("apple");
  assert(entry.status === "learned", "status is learned");
  assert(entry.due >= before + 2.5 * DAY_MS && entry.due <= before + 3.5 * DAY_MS, "due ≈ now + 3 days");
  assert(!storage.isDue("apple"), "not due immediately after marking");
});

test("setStudyStatus review is due immediately", () => {
  localStorage.clear();
  storage.setStudyStatus("banana", "review");
  assert(storage.getStudyStatus("banana") === "review", "status is review");
  assert(storage.isDue("banana"), "review words are always due");
});

test("setStudyStatus cancels with null", () => {
  localStorage.clear();
  storage.setStudyStatus("carrot", "learned");
  storage.setStudyStatus("carrot", null);
  assert(storage.getStudyStatus("carrot") === null, "status cleared");
  assert(storage.getStudyEntry("carrot") === null, "entry removed");
});

/* ---------- judgeStudy SRS ---------- */

test("remembering grows the interval", () => {
  localStorage.clear();
  storage.setStudyStatus("dragon", "learned");
  const first = storage.getStudyEntry("dragon");
  storage.judgeStudy("dragon", true);
  const second = storage.getStudyEntry("dragon");
  assert(second.intervalDays > first.intervalDays, `interval should grow (${first.intervalDays} -> ${second.intervalDays})`);
  assert(!storage.isDue("dragon"), "not due right after remembering");
});

test("forgetting resets interval to 1 day and schedules tomorrow", () => {
  localStorage.clear();
  storage.setStudyStatus("elephant", "learned");
  storage.judgeStudy("elephant", true);
  storage.judgeStudy("elephant", true);
  storage.judgeStudy("elephant", false);
  const entry = storage.getStudyEntry("elephant");
  assert(entry.intervalDays === 1, `interval reset to 1, got ${entry.intervalDays}`);
  const soon = Date.now() + 0.99 * DAY_MS;
  assert(entry.due > soon, "due should be ~tomorrow");
});

/* ---------- due words ---------- */

test("getDueWords and countDueToday include past-due learned + review", () => {
  localStorage.clear();
  localStorage.setItem("pte.vocab.study.v1", JSON.stringify({
    fish: { status: "learned", due: Date.now() - 1000, intervalDays: 3, ease: 2.5 },
    fig: { status: "review", due: Date.now() - 1000, intervalDays: 0, ease: 2.5 },
    grape: { status: "learned", due: Date.now() + 10 * DAY_MS, intervalDays: 3, ease: 2.5 }
  }));
  const due = storage.getDueWords();
  assert(due.includes("fish"), "fish is due (old due)");
  assert(due.includes("fig"), "fig is due (review)");
  assert(!due.includes("grape"), "grape is not due yet");
  assert(storage.countDueToday() === 2, `countDueToday = ${storage.countDueToday()}`);
});

/* ---------- pronunciation records ---------- */

test("pronunciation records accumulate", () => {
  localStorage.clear();
  storage.recordPronunciation("hello", true);
  storage.recordPronunciation("hello", false);
  storage.recordPronunciation("hello", true);
  const entry = storage.getPronunciation("hello");
  assert(entry.attempts === 3, `attempts = ${entry.attempts}`);
  assert(entry.correct === 2, `correct = ${entry.correct}`);
  assert(entry.lastCorrect === true, "lastCorrect true");
  assert(!storage.needsPronunciation("hello"), "does not need pronunciation");
});

test("needsPronunciation flags last wrong attempt", () => {
  localStorage.clear();
  storage.recordPronunciation("world", false);
  storage.recordPronunciation("world", true);
  storage.recordPronunciation("world", false);
  assert(storage.needsPronunciation("world"), "needs pronunciation after last failure");
  assert(!storage.needsPronunciation("never-tried"), "untried words are not flagged");
});

/* ---------- summary ---------- */

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);