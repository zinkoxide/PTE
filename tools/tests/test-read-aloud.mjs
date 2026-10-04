/* ==========================================
   PTE Trainer — Read Aloud unit tests
   Run: node tools/tests/test-read-aloud.mjs
   ========================================== */

import { readFileSync } from "node:fs";
import { scoreReadAloud, FLUENCY_LIMITS } from "../../js/read-aloud-score.js";
import {
  toOfficialScore,
  averageToOfficial,
  describeBand,
  gapToTarget,
  MIN_SCORE,
  MAX_SCORE
} from "../../js/pte-scale.js";

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

const texts = JSON.parse(readFileSync(new URL("../../data/read_aloud.json", import.meta.url), "utf8"));
const item = texts[0];

/* ---------------- Scorer ---------------- */

test("reading the text perfectly at a natural pace scores full marks", () => {
  const words = item.text.split(/\s+/).length;
  const seconds = words / 3;
  const result = scoreReadAloud(item, item.text, { seconds, longPauses: 0 });
  assert(result.total === 100, `expected 100, got ${result.total}`);
  assert(result.criteria.Pronunciation === 2, `pronunciation ${result.criteria.Pronunciation}`);
  assert(result.criteria.Fluency === 2, `fluency ${result.criteria.Fluency}`);
  assert(result.wordsPerSecond >= FLUENCY_LIMITS.minWordsPerSecond, "pace should be inside the ideal band");
  assert(result.missingWords.length === 0 && result.wrongWords.length === 0, "nothing should be flagged");
});

test("a wrong word is reported and costs pronunciation marks", () => {
  const spoken = item.text.replace("closes", "clossed");
  const words = item.text.split(/\s+/).length;
  const result = scoreReadAloud(item, spoken, { seconds: words / 3, longPauses: 0 });
  assert(result.criteria.Pronunciation < 2, "pronunciation must drop");
  assert(result.criteria.Content === 2, "content should be full: the word was produced");
  assert(result.wrongWords.length >= 1, "the mispronounced word must be listed");
  assert(result.accuracy < 100, `accuracy must drop, got ${result.accuracy}`);
});

test("skipping words is penalised on content, not only pronunciation", () => {
  const spoken = item.text.split(" ").slice(0, 4).join(" ");
  const result = scoreReadAloud(item, spoken, { seconds: 4, longPauses: 0 });
  assert(result.missingWords.length > 0, "skipped words must be listed");
  assert(result.criteria.Content < 2, "content must drop when words are skipped");
});

test("a typographic apostrophe in the text matches the spoken ASCII one", () => {
  const words = item.text.split(/\s+/).length;
  const spokenAscii = item.text.replace(/[\u2018\u2019]/g, "'");
  const result = scoreReadAloud(item, spokenAscii, { seconds: words / 3, longPauses: 0 });
  assert(result.accuracy === 100, `accuracy must be 100, got ${result.accuracy}`);
  assert(result.criteria.Pronunciation === 2, "pronunciation must be full marks");
});

test("reading too slowly loses fluency but keeps pronunciation", () => {
  const words = item.text.split(/\s+/).length;
  const result = scoreReadAloud(item, item.text, { seconds: words / 0.8, longPauses: 0 });
  assert(result.criteria.Fluency < 2, "a very slow pace must lose fluency");
  assert(result.criteria.Pronunciation === 2, "pronunciation is unaffected by pace");
});

test("rushing is penalised too", () => {
  const words = item.text.split(/\s+/).length;
  const result = scoreReadAloud(item, item.text, { seconds: words / 9, longPauses: 0 });
  assert(result.criteria.Fluency < 2, `rushing must lose fluency, got ${result.criteria.Fluency}`);
});

test("long pauses break fluency even with perfect words", () => {
  const words = item.text.split(/\s+/).length;
  const clean = scoreReadAloud(item, item.text, { seconds: words / 3, longPauses: 0 });
  const paused = scoreReadAloud(item, item.text, { seconds: words / 3, longPauses: 3 });
  assert(paused.criteria.Fluency < clean.criteria.Fluency, "pauses must reduce fluency");
  assert(paused.criteria.Pronunciation === clean.criteria.Pronunciation, "pauses do not affect pronunciation");
  assert(paused.fluencyReason.includes("pause"), "the reason must mention the pauses");
});

test("saying nothing scores zero", () => {
  const result = scoreReadAloud(item, "", { seconds: 0, longPauses: 0 });
  assert(result.total === 0, `expected 0, got ${result.total}`);
  Object.values(result.criteria).forEach((value) => assert(value === 0, "every criterion must be 0"));
});

test("extra words that are not on the screen are reported", () => {
  const words = item.text.split(/\s+/).length;
  const result = scoreReadAloud(item, `${item.text} tomorrow`, { seconds: (words + 1) / 3, longPauses: 0 });
  assert(result.total < 100, "adding words must cost marks");
});

/* ---------------- Data ---------------- */

test("every read-aloud text is a single sentence of a readable length", () => {
  texts.forEach((entry) => {
    assert(typeof entry.id === "string" && entry.id, "missing id");
    assert(typeof entry.text === "string" && entry.text.trim(), `${entry.id}: missing text`);
    assert(/[.!?]$/.test(entry.text.trim()), `${entry.id}: must end with punctuation`);
    const words = entry.text.split(/\s+/).length;
    assert(words >= 6 && words <= 16, `${entry.id}: ${words} words is outside 6-16`);
    assert(entry.tip && entry.tip.length > 10, `${entry.id}: needs a pronunciation tip`);
  });
});

/* ---------------- Official scale ---------------- */

test("the official scale is monotonic and clamped to 10-90", () => {
  let previous = MIN_SCORE;
  for (let total = 0; total <= 100; total += 5) {
    const score = toOfficialScore(total);
    assert(score >= previous, `scale dipped at ${total}: ${score} < ${previous}`);
    assert(score >= MIN_SCORE && score <= MAX_SCORE, `${total} produced out-of-range ${score}`);
    previous = score;
  }
  assert(toOfficialScore(0) === MIN_SCORE, "a zero total must give the floor");
  assert(toOfficialScore(100) === MAX_SCORE, "a full total must give the ceiling");
});

test("averages convert to an official score, and empty history gives null", () => {
  assert(averageToOfficial(0, 0) === null, "no attempts must return null");
  assert(averageToOfficial(8, 10) === toOfficialScore(80), "average must convert like a single total");
  const mid = averageToOfficial(5, 10);
  assert(mid > MIN_SCORE && mid < MAX_SCORE, `expected a mid score, got ${mid}`);
});

test("bands and target gaps are described sensibly", () => {
  assert(describeBand(30).label === "Beginner", "30 should be Beginner");
  assert(describeBand(75).label === "Very good", "75 should be Very good");
  assert(describeBand(85).label === "Excellent", "85 should be Excellent");
  assert(describeBand(null).label === "—", "no score must show a dash");

  const behind = gapToTarget(45, 60);
  assert(behind.gap === 15 && behind.reached === false, `expected a 15 point gap, got ${behind.gap}`);
  const met = gapToTarget(65, 60);
  assert(met.gap === 0 && met.reached === true, "reaching the target must report zero gap");
  assert(gapToTarget(null, 60).gap === null, "without a score there is no gap");
});

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
