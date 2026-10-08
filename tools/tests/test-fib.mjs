/* ==========================================
   PTE Trainer — Fill in the Blanks tests
   Run: node tools/tests/test-fib.mjs
   ========================================== */

import {
  FIB_MODES,
  BLANK,
  wordForms,
  surfaceForm,
  blankedSentence,
  buildFibItem,
  buildFibSet,
  isCorrect,
  scoreFibSet
} from "../../js/fib.js";

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

function makeWord(overrides = {}) {
  return {
    word: "Benefit",
    pronunciation: "/ˈbenɪfɪt/",
    audio: "",
    partOfSpeech: "Noun; Verb",
    cefrLevel: "B1",
    frequency: "5",
    meaningEN: "An advantage.",
    meaningAR: "فائدة",
    collocations: ["benefit from"],
    commonMistakes: [],
    synonyms: ["advantage"],
    examples: [
      "Students benefit greatly from the new library.",
      "The city will benefit from the new transport system."
    ],
    wordFamily: [],
    ...overrides
  };
}

const POOL = [
  makeWord(),
  makeWord({ word: "Challenge", examples: ["Students must face every challenge."] }),
  makeWord({ word: "Significant", examples: ["The study found a significant improvement."] }),
  makeWord({ word: "Result", examples: ["The result of the test was surprising."] }),
  makeWord({ word: "Progress", examples: ["Progress takes time and patience."] }),
  makeWord({ word: "Impact", examples: ["The impact was felt by everyone."] })
];

/* ---------- word forms ---------- */

test("word forms cover the shapes a bank actually uses", () => {
  const forms = wordForms("benefit", "Noun; Verb");
  assert(forms.includes("benefits"), "third person");
  assert(forms.includes("benefited"), "past tense");
  assert(forms.includes("benefiting"), "present participle");

  assert(wordForms("commit", "Verb").includes("committed"), "doubled consonant");
  assert(wordForms("carry", "Verb").includes("carried"), "y becomes ied");
  assert(wordForms("decide", "Verb").includes("deciding"), "silent e is dropped");
  assert(wordForms("agree", "Verb").includes("agreed"), "ee keeps its e");
  assert(wordForms("box", "Noun").includes("boxes"), "sibilant takes es");
  assert(wordForms("city", "Noun").includes("cities"), "consonant y becomes ies");
});

test("forms follow the part of speech, so no nonsense options", () => {
  /* "potentialed" is not a word: a noun is only offered a plural. */
  const noun = wordForms("potential", "Noun; Adjective");
  assert(noun.includes("potentials"), "the plural is offered");
  assert(!noun.includes("potentialed"), "a noun is not offered a past tense");
  assert(!noun.includes("potentialing"), "a noun is not offered -ing");

  assert(wordForms("significant", "Adjective").includes("significanter"),
    "an adjective can be compared");
  assert(!wordForms("benefit", "Noun; Verb").includes("benefiter"),
    "a verb is not offered a comparative");

  /* An unknown part of speech must not quietly lose the right answer. */
  assert(wordForms("benefit", "").includes("benefited"), "unknown kind still offers the past");
});

test("word forms refuse anything that is not a plain word", () => {
  assert(wordForms("").length === 0, "empty word");
  assert(wordForms("well-being").length === 0, "hyphenated words are skipped");
  assert(wordForms("it's").length === 0, "apostrophes are skipped");
});

/* ---------- sentences ---------- */

test("the gap keeps the sentence's own word form", () => {
  const sentence = "Students benefit greatly from the new library.";
  assert(surfaceForm(sentence, "Benefit") === "benefit", "the form in the sentence wins");
  assert(
    blankedSentence(sentence, "Benefit") === `Students ${BLANK} greatly from the new library.`,
    "only the word is replaced"
  );
});

test("a longer form is found whole", () => {
  const sentence = "The committee benefited from the delay.";
  assert(surfaceForm(sentence, "Committee") === "committee", "base form");
  assert(
    surfaceForm("They were questioning every assumption.", "Question") === "questioning",
    "the -ing form is matched, not just the base"
  );
  assert(
    blankedSentence("They were questioning every assumption.", "question") ===
      `They were ${BLANK} every assumption.`,
    "the -ing form is blanked, not the bare stem"
  );
});

test("a word inside another word is not a gap", () => {
  /* "art" must not match inside "article" or "part" — that would blank the
     wrong letters and teach the wrong thing. */
  assert(surfaceForm("The article was short.", "art") === "", "no prefix match");
  assert(blankedSentence("The article was short.", "art") === "", "no gap is produced");
  assert(surfaceForm("The art class starts at nine.", "art") === "art", "a real match still works");
});

test("a sentence without the word yields no gap", () => {
  assert(blankedSentence("Nothing to see here.", "Benefit") === "", "no false gap");
});

/* ---------- items ---------- */

test("an audio item carries the recording and four choices", () => {
  const word = makeWord({ audio: "assets/audio/vocabulary/12.mp3" });
  const item = buildFibItem(word, POOL, { mode: "audio", choices: 4, audioOf: () => "" });
  assert(item, "the item is built");
  assert(item.mode === "audio", "mode is recorded on the item");
  assert(item.options.length === 4, "four options");
  assert(item.options.includes(item.answer), "the answer is among them");
  assert(item.audio === "assets/audio/vocabulary/12.mp3", "the recording is carried over");
  assert(item.sentence.includes(BLANK), "the sentence is gapped");
  assert(!item.sentence.includes("benefit"), "the answer is not visible in the sentence");
});

test("a form item offers four forms of the same word", () => {
  const word = makeWord({ examples: ["The city will benefit from the new system."] });
  const item = buildFibItem(word, POOL, { mode: "form", choices: 4 });
  assert(item, "the item is built");
  const roots = new Set(item.options.map((option) => option.replace(/(s|es|ed|ing|er|ier|r)$/i, "")));
  assert(roots.size <= 2, `the options must be forms of one word, got ${[...roots].join(", ")}`);
  assert(item.options.includes(item.answer), "the sentence's own form is the answer");
  assert(item.options.every((option) => /^benefit/i.test(option)),
    `every option is a form of the word, got ${item.options.join(", ")}`);
});

test("a word that cannot make an honest item is skipped, not faked", () => {
  const noSentence = makeWord({ examples: [], collocations: [] });
  assert(buildFibItem(noSentence, POOL, { mode: "audio" }) === null,
    "no sentence means no item");

  const unrelated = makeWord({ examples: ["The weather is fine today."] });
  assert(buildFibItem(unrelated, POOL, { mode: "audio" }) === null,
    "a sentence without the word means no item");

  const tiny = makeWord({ examples: ["Benefit."] });
  assert(buildFibItem(tiny, POOL, { mode: "audio" }) === null,
    "a sentence too short to be fair is refused");

  const lonely = makeWord({ examples: ["Students benefit from the library."] });
  assert(buildFibItem(lonely, [lonely], { mode: "audio", choices: 4 }) === null,
    "too few distractors means no item, rather than three copies of the word");
});

test("three choices are offered when asked for", () => {
  const item = buildFibItem(POOL[1], POOL, { mode: "audio", choices: 3 });
  assert(item && item.options.length === 3, "the choice count is honoured");
});

test("an audio item prefers the index lookup over an empty field", () => {
  const word = makeWord({ audio: "" });
  const item = buildFibItem(word, POOL, {
    mode: "audio",
    choices: 4,
    audioOf: (name) => (name === "Benefit" ? "assets/audio/vocabulary/7.mp3" : "")
  });
  assert(item && item.audio === "assets/audio/vocabulary/7.mp3",
    "the audio index is consulted when the field is empty");
});

/* ---------- sets ---------- */

test("a set asks for the number it was given", () => {
  const set = buildFibSet(POOL, { mode: "audio", choices: 4, count: 4 });
  assert(set.length === 4, `four items, got ${set.length}`);

  const fewer = buildFibSet(POOL, { mode: "audio", choices: 4, count: 2 });
  assert(fewer.length === 2, "the count is respected");
});

test("a set never repeats a word", () => {
  const big = [];
  for (let i = 0; i < 40; i += 1) big.push(makeWord({ word: `Word${i}` }));
  const set = buildFibSet(big, { mode: "form", choices: 4, count: 10 });
  const ids = new Set(set.map((item) => item.id));
  assert(ids.size === set.length, "each item is unique");
});

test("an empty or unusable bank yields an empty set, not a crash", () => {
  assert(buildFibSet([], { count: 5 }).length === 0, "empty bank");
  assert(buildFibSet(null, { count: 5 }).length === 0, "missing bank");
  assert(FIB_MODES.includes("audio") && FIB_MODES.includes("form"), "both modes are offered");
});

/* ---------- scoring ---------- */

test("each blank is marked separately, with no partial credit", () => {
  const items = [
    { id: "a", word: "Benefit", mode: "audio", sentence: "A ___ b.", answer: "benefit", options: ["benefit", "challenge", "progress", "impact"] },
    { id: "b", word: "Result", mode: "audio", sentence: "C ___ d.", answer: "result", options: ["benefit", "challenge", "result", "progress"] }
  ];
  const score = scoreFibSet(items, { 0: "benefit", 1: "impact" });
  assert(score.correct === 1 && score.total === 2, "one of two");
  assert(score.percent === 50, "50%");
  assert(score.results[0].correct === true && score.results[1].correct === false, "per-item detail");
  assert(score.missedTerms.join(",") === "Result", "the missed word is named");
});

test("answers are matched by id as well as by position", () => {
  const items = [{ id: "x", word: "Benefit", answer: "benefit", sentence: "", options: [] }];
  assert(scoreFibSet(items, { x: "benefit" }).percent === 100, "id lookup works");
  assert(scoreFibSet(items, { 0: "BENEFIT" }).percent === 100, "case does not matter");
  assert(scoreFibSet(items, { 0: "  benefit  " }).percent === 100, "padding does not matter");
  assert(scoreFibSet(items, { 0: "benefits" }).percent === 0, "a different form is not the answer");
});

test("an unanswered blank counts as wrong", () => {
  const items = [{ id: "a", word: "Benefit", answer: "benefit", sentence: "", options: [] }];
  const score = scoreFibSet(items, {});
  assert(score.percent === 0, "an empty answer scores zero");
  assert(isCorrect(items[0], "") === false, "an empty answer is never correct");
});

test("no items means no score, not a division by zero", () => {
  const score = scoreFibSet([], {});
  assert(score.total === 0 && score.percent === 0, "an empty set scores 0");
});

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);