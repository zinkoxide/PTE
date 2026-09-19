/* ==========================================
   PTE Trainer — SWT scoring module unit tests
   Run: node tools/tests/test-swt.mjs
   ========================================== */

import { scoreSummary } from "../../js/swt-score.js";

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

const passage = {
  keywords: ["renewable energy", "electricity", "fossil fuels", "energy security", "investment in infrastructure"]
};

test("a good summary scores high across all four criteria", () => {
  const text =
    "Renewable energy produces electricity with lower emissions than fossil fuels and can improve energy security, but it requires investment in infrastructure.";
  const result = scoreSummary(passage, text);
  assert(result.sentences === 1, `expected 1 sentence, got ${result.sentences}`);
  assert(result.words >= 5 && result.words <= 75, `word count ${result.words} must be 5-75`);
  assert(result.total >= 80, `expected total >= 80, got ${result.total}`);
  Object.values(result.criteria).forEach((v) => assert(v >= 1, `criterion too low: ${v}`));
});

test("no response scores zero", () => {
  const result = scoreSummary(passage, "");
  assert(result.total === 0, `expected 0, got ${result.total}`);
  assert(result.criteria.Form === 0, "empty text should fail Form");
});

test("multiple sentences fail the Form criterion", () => {
  const text = "This is the first sentence. And this is a second one to force the rule into action today.";
  const result = scoreSummary(passage, text);
  assert(result.sentences === 2, `expected 2 sentences, got ${result.sentences}`);
  assert(result.criteria.Form === 0, `expected Form 0, got ${result.criteria.Form}`);
});

test("keyword coverage is counted correctly", () => {
  const text = "Renewable energy produces electricity while burning fewer fossil fuels, improving energy security.";
  const result = scoreSummary(passage, text);
  assert(result.keywordTotal === passage.keywords.length, "keywordTotal mismatch");
  assert(result.hits >= 4, `expected >=4 keyword hits, got ${result.hits}`);
});

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);