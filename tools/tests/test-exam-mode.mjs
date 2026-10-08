/* ==========================================
   PTE Trainer — exam conditions tests
   Run: node tools/tests/test-exam-mode.mjs
   ========================================== */

import {
  EXAM_KEY,
  EXAM_WARNING_SECONDS,
  isExamMode,
  setExamMode,
  shouldWarn,
  detailTermsFor
} from "../../js/exam-mode.js";

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

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key)
  };
}

test("exam conditions are off by default", () => {
  const storage = fakeStorage();
  assert(isExamMode(storage) === false, "a fresh browser must not be in exam mode");
});

test("the flag is stored under one shared key and read back", () => {
  const storage = fakeStorage();
  setExamMode(true, storage);
  assert(storage.getItem(EXAM_KEY) === "1", `expected the flag at ${EXAM_KEY}`);
  assert(isExamMode(storage) === true, "the mode must be readable");

  setExamMode(false, storage);
  assert(storage.getItem(EXAM_KEY) === null, "switching off must clear the key");
  assert(isExamMode(storage) === false, "the mode must be off again");
});

test("a broken or foreign stored value never turns exam mode on", () => {
  assert(isExamMode(fakeStorage({ [EXAM_KEY]: "true" })) === false, "only the exact flag counts");
  assert(isExamMode(fakeStorage({ [EXAM_KEY]: "0" })) === false, '"0" must not enable it');
  assert(isExamMode(fakeStorage({ [EXAM_KEY]: "" })) === false, "an empty value must not enable it");
});

test("unavailable storage does not throw", () => {
  const broken = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("denied"); },
    removeItem() { throw new Error("denied"); }
  };
  assert(isExamMode(broken) === false, "reading must fall back to off");
  assert(setExamMode(true, broken) === true, "writing must not throw");
});

test("the warning appears only inside the last ten seconds", () => {
  assert(EXAM_WARNING_SECONDS === 10, "the warning window must be ten seconds");
  assert(shouldWarn(11) === false, "eleven seconds left must not warn");
  assert(shouldWarn(10) === true, "exactly ten seconds left must warn");
  assert(shouldWarn(1) === true, "the final second must warn");
  assert(shouldWarn(0) === false, "an expired timer must not keep pulsing");
  assert(shouldWarn(-3) === false, "a negative timer must not warn");
  assert(shouldWarn("nonsense") === false, "a non-numeric value must not warn");
  assert(shouldWarn(undefined) === false, "undefined must not warn");
  assert(shouldWarn(5, 20) === true, "the window must be configurable");
});

test("exam attempts store the score but never the diagnostics", () => {
  const score = { missedKeywords: ["visitors", "quarter"], missedPoints: ["storage"] };
  assert(detailTermsFor(score, false).length === 2, "normal mode keeps the missed keywords");
  assert(detailTermsFor(score, true).length === 0, "exam mode must store no keywords");
  assert(detailTermsFor({ missedPoints: ["a"] }, true).length === 0, "no key points either");
  assert(detailTermsFor({}, true).length === 0, "a missing list must not throw");
  assert(detailTermsFor(null, true).length === 0, "a null score must not throw");
  assert(detailTermsFor(null, false).length === 0, "a null score in normal mode is empty too");
});

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
