/* ==========================================
   PTE Trainer — pronunciation match tests
   Run: node tools/tests/test-pronounce.mjs
   ========================================== */

const { wordMatches } = await import("../../js/pronounce.js");

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

const CASES = [
  ["apple", "apple", true, "exact word"],
  ["apple", "an apple", true, "prepended article"],
  ["a challenge", "a challenge", true, "multi-word target (exact)"],
  ["challenge", "challenge.", true, "trailing punctuation"],
  ["well-known", "well known", true, "hyphen vs space"],
  ["task", "task?", true, "question-marked utterance"],
  ["significant effect", "significant effect", true, "multi-word target (clean)"],
  ["knowledge", "knowledge", true, "difficult word recognized"],
  ["task", "mask", false, "similar-but-different word (t vs m)"],
  ["cat", "cut", false, "vowel swap should fail"],
  ["knowledge", "knowledgeable", false, "extra suffix should fail"],
  ["task", "t", false, "too short"],
  ["", "", false, "empty input never matches"],
  ["apple", null, false, "null transcript never matches"],
  ["apple", "banana", false, "unrelated word should fail"]
];

CASES.forEach(([word, spoken, expected, note]) => {
  test(`wordMatches("${word}", "${spoken}") === ${expected} (${note})`, () => {
    assert(wordMatches(word, spoken) === expected, `got ${wordMatches(word, spoken)}`);
  });
});

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);