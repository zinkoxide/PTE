/* ==========================================
   PTE Trainer — Grammar data integrity checks
   Run: node tools/tests/test-grammar.mjs
   ========================================== */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { toSentences } from "../../js/grammar.js";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DATA_DIR = new URL("../../data/grammar/", import.meta.url);

const TYPE_ALIASES = {
  "multiple-choice": "mcq",
  multiple_choice: "mcq",
  "true-false": "tf",
  true_false: "tf"
};

function normalizeItem(item) {
  const target = TYPE_ALIASES[item.type];
  if (target === "mcq") {
    const answerIndex = Number.isInteger(item.answer)
      ? item.answer
      : item.options.indexOf(item.answer);
    return { ...item, type: "mcq", answer: answerIndex };
  }
  if (target === "tf") return { ...item, type: "tf", correct: item.answer === "True" };
  return item;
}

/* ---------- tiny test harness ---------- */

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK: ${name}`);
  } catch (error) {
    failed += 1;
    failures.push(`${name}: ${error.message}`);
    console.log(`FAIL: ${name} — ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}

/* ---------- data ---------- */

const manifest = JSON.parse(readFileSync(new URL("manifest.json", DATA_DIR), "utf8"));
assert(Array.isArray(manifest) && manifest.length > 0, "manifest must be a non-empty array");

const lessons = [];
for (const file of manifest) {
  const data = JSON.parse(readFileSync(new URL(file, DATA_DIR), "utf8"));
  assert(Array.isArray(data), `file ${file} must contain an array`);
  data.forEach((lesson) => lessons.push({ ...lesson, file, quiz: (lesson.quiz || []).map(normalizeItem) }));
}

test(`manifest lists files (got ${manifest.length})`, () => {
  assert(manifest.every((f) => typeof f === "string" && f.endsWith(".json")), "all entries are .json files");
  const uniq = new Set(manifest);
  assert(uniq.size === manifest.length, "no duplicate files in manifest");
});

test(`lesson count is 29 (got ${lessons.length})`, () => {
  assert(lessons.length === 29, `expected 29 lessons, got ${lessons.length}`);
});

const quizItems = [];
const seenIds = new Set();
for (const lesson of lessons) {
  test(`no duplicate lesson id "${lesson.id}"`, () => {
    assert(typeof lesson.id === "string" && lesson.id.length > 0, "lesson.id must be a non-empty string");
    assert(!seenIds.has(lesson.id), `duplicate lesson id ${lesson.id}`);
    seenIds.add(lesson.id);
  });
  test(`lesson "${lesson.id}" has required fields`, () => {
    for (const key of ["title", "category", "icon", "description", "explanation", "rules", "examples", "commonMistakes"]) {
      assert(lesson[key] !== undefined, `missing field "${key}" in ${lesson.id}`);
    }
    assert(Array.isArray(lesson.rules) && lesson.rules.length > 0, "rules must be non-empty");
    assert(Array.isArray(lesson.examples) && lesson.examples.length > 0, "examples must be non-empty");
  });
  lesson.quiz.forEach((q) => quizItems.push({ ...q, lessonId: lesson.id }));
}

let mcq = 0;
let tf = 0;
let tfTrue = 0;
let tfFalse = 0;

for (const q of quizItems) {
  test(`quiz item in ${q.lessonId} has a prompt`, () => {
    assert(typeof q.prompt === "string" && q.prompt.trim().length > 0, "prompt must be non-empty");
  });
  if (q.type === "mcq") {
    mcq += 1;
    test(`mcq "${q.prompt.slice(0, 30)}" shape`, () => {
      assert(Array.isArray(q.options) && q.options.length === 4, "mcq must have 4 options");
      assert(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, "mcq answer index out of range");
    });
  } else if (q.type === "tf") {
    tf += 1;
    assert(typeof q.correct === "boolean", "tf correct must be boolean");
    if (q.correct) tfTrue += 1;
    else tfFalse += 1;
  } else {
    throw new Error(`unknown item type ${q.type}`);
  }
}

test(`quiz item count is 450 (got ${quizItems.length})`, () => {
  assert(quizItems.length === 450, `expected 450 quiz items, got ${quizItems.length}`);
});

test(`mcq / tf split: 429 / 21 (got ${mcq} / ${tf})`, () => {
  assert(mcq === 429, `expected 429 mcq, got ${mcq}`);
  assert(tf === 21, `expected 21 tf, got ${tf}`);
});

test(`true / false balance: 12 / 9 (got ${tfTrue} / ${tfFalse})`, () => {
  assert(tfTrue === 12, `expected 12 true, got ${tfTrue}`);
  assert(tfFalse === 9, `expected 9 false, got ${tfFalse}`);
});

const categories = [];
for (const lesson of lessons) {
  if (lesson.category && !categories.includes(lesson.category)) categories.push(lesson.category);
}
test(`categories count is 12 (got ${categories.length})`, () => {
  assert(categories.length === 12, `expected 12 categories, got ${categories.length}`);
});

test("tenses.json has 12 lessons", () => {
  const tenses = JSON.parse(readFileSync(new URL("tenses.json", DATA_DIR), "utf8"));
  assert(tenses.length === 12, `expected 12 tenses lessons, got ${tenses.length}`);
});

/* ---------- toSentences abbreviation handling ---------- */

test("toSentences keeps abbreviations and dotted tokens attached", () => {
  const input = "Dr. Smith arrived at 9 a.m. He was late. The U.S. economy grew by 5%.";
  const sentences = toSentences(input);
  assert(sentences.length === 2, `expected 2 sentences, got ${sentences.length}: ${sentences.join(" | ")}`);
  assert(sentences[0].includes("9 a.m."), `a.m. should not fragment: ${sentences[0]}`);
  assert(sentences[0].includes("He was late"), "clause after a.m. stays attached (no fragments)");
  assert(sentences[1].includes("U.S."), "U.S. should stay attached");
  assert(sentences[1].includes("economy grew by 5%"), "the economy clause should not fragment");
});

test("toSentences works with e.g. and i.e.", () => {
  const input = "Use the tool, e.g. a hammer. Then clean up.";
  const sentences = toSentences(input);
  assert(sentences.length === 2, `expected 2 sentences, got ${sentences.length}`);
  assert(sentences[0].includes("e.g."), "e.g. should stay in the same sentence");
});

/* ---------- summary ---------- */

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}