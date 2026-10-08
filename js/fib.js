/*
==========================================
PTE Trainer
Fill in the Blanks — item builder
==========================================

The real exam has two Fill in the Blanks
tasks and this module builds both from the
word bank the learner already has, so the
items never run out and every sentence is one
they will meet again in the bank.

  audio — hear the word, then choose it for
          the gap. The gap comes from a real
          example sentence, and the distractors
          are other words of the same kind, so
          the answer has to be recognised by ear
          and not by shape.

  form  — the sentence is shown with the gap
          and the four options are four forms
          of the *same* word (benefit / benefits
          / benefited / benefiting). Nothing but
          grammar decides the answer, which is
          exactly what the drag-and-drop version
          of the task tests.

Nothing here touches the DOM or storage: the
page wires it up, the tests drive it directly.
==========================================
*/

"use strict";

export const FIB_MODES = ["audio", "form"];

export const CHOICES = [3, 4];

/* Everything that can stand in for the gap. */
export const BLANK = "____";

/* Sentences shorter than this make the gap guessable by shape alone. */
const MIN_SENTENCE_LENGTH = 24;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* ==========================================
   Word forms
   ==========================================
   Only enough English to make honest
   distractors. The correct answer is never
   guessed here — it is the form the bank's
   own sentence already uses.
========================================= */

function endsWithAny(text, endings) {
  return endings.some((ending) => text.endsWith(ending));
}

function doublesFinalConsonant(word) {
  /* stop -> stopped, plan -> planning: one vowel between two consonants at
     the end of a short word. Longer words are left alone, because
     "traveled" is the rarer form and never a good distractor. */
  return word.length >= 4 && word.length <= 6 && /[^aeiou][aeiou][^aeiouwxy]$/.test(word);
}

/*
Forms are only made for the kinds of word the bank actually says it is: a
noun gets a plural, a verb gets the third person, the past and -ing, an
adjective a comparative. Without that, "potential" would offer "potentialed"
and "potentialing", which teaches nothing and confuses everybody.
*/
export function wordForms(word, partOfSpeech = "") {
  const lower = normalize(word);
  if (!lower || !/^[a-z]+$/.test(lower)) return [];

  const forms = new Set([lower]);
  const add = (form) => {
    if (form && form !== lower) forms.add(form);
  };

  const kinds = String(partOfSpeech || "")
    .split(/[;/,]/)
    .map((kind) => kind.trim().toLowerCase())
    .filter(Boolean);

  /* An unknown part of speech gets every form: a wrong guess must not
     remove the option that happens to be right. */
  const known = kinds.length > 0;
  const isNoun = known ? kinds.includes("noun") : true;
  const isVerb = known ? kinds.includes("verb") : true;
  const isAdjective = known
    ? kinds.includes("adjective") || kinds.includes("adverb")
    : true;

  /* Noun plural / verb third person: bus -> buses, city -> cities. */
  if (isNoun || isVerb) {
    if (endsWithAny(lower, ["s", "x", "z", "ch", "sh"])) add(`${lower}es`);
    else if (lower.endsWith("o") && lower.length <= 5) add(`${lower}es`);
    else if (/[^aeiou]y$/.test(lower)) add(`${lower.slice(0, -1)}ies`);
    else add(`${lower}s`);
  }

  /* Past: commit -> committed, carry -> carried, decide -> decided. */
  if (isVerb) {
    if (lower.endsWith("e")) add(`${lower}d`);
    else if (/[^aeiou]y$/.test(lower)) add(`${lower.slice(0, -1)}ied`);
    else if (doublesFinalConsonant(lower)) add(`${lower}${lower.slice(-1)}ed`);
    else add(`${lower}ed`);

    /* -ing: decide -> deciding, run -> running, agree -> agreeing. */
    if (lower.endsWith("e") && !lower.endsWith("ee")) add(`${lower.slice(0, -1)}ing`);
    else if (doublesFinalConsonant(lower)) add(`${lower}${lower.slice(-1)}ing`);
    else add(`${lower}ing`);
  }

  /* Comparatives, only where they read naturally. */
  if (isAdjective && lower.length >= 4) {
    if (lower.endsWith("e")) add(`${lower}r`);
    else if (/[^aeiou]y$/.test(lower)) add(`${lower.slice(0, -1)}ier`);
    else add(`${lower}er`);
  }

  return [...forms];
}

/*
The exact form the sentence uses, e.g. "benefited" out of "benefit". The
bank stores the base word, but the sentence carries the grammar, and the
answer has to be the form a speaker would actually say there.

Only forms the word can really take are matched. Matching "\w*" instead
would let "art" swallow "article", and the blank would then hide the wrong
letters.
*/
const INFLECTION_ENDINGS = "s|es|ed|ing|d|r|er|est|ies|ied|ly";

function formPattern(word, partOfSpeech = "") {
  const forms = [normalize(word), ...wordForms(word, partOfSpeech)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  if (!forms.length) return null;

  const base = escapeRegExp(normalize(word));
  /* The generated forms come first, then any ending a rule could not predict
     ("carry" -> "carrying"), which still cannot swallow a different word:
     "art" never reaches "article" because "icle" is not an ending. */
  const body = `(?:${forms.map(escapeRegExp).join("|")}|${base}(?:${INFLECTION_ENDINGS}))`;

  return new RegExp(`(?<![A-Za-z])(${body})(?![A-Za-z])`, "i");
}

export function surfaceForm(sentence, word, partOfSpeech = "") {
  const pattern = formPattern(word, partOfSpeech);
  if (!pattern) return "";
  const match = pattern.exec(String(sentence || ""));
  return match ? match[1] : "";
}

export function blankedSentence(sentence, word, partOfSpeech = "") {
  const text = String(sentence || "");
  const pattern = formPattern(word, partOfSpeech);
  if (!pattern || !pattern.test(text)) return "";
  return text.replace(pattern, BLANK);
}

/* ==========================================
   Sentence picking
   ========================================== */

/* A usable sentence: long enough to be fair, and it really contains the word. */
function sentenceWithWord(word) {
  const source = Array.isArray(word.examples) ? word.examples : [];
  const pattern = formPattern(word.word, word.partOfSpeech);
  if (!pattern) return [];

  const candidates = source
    .filter((sentence) => typeof sentence === "string")
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= MIN_SENTENCE_LENGTH)
    .filter((sentence) => pattern.test(sentence));

  return candidates;
}

/* ==========================================
   Options
   ========================================== */

function wordOptions(pool, word, answer, total) {
  const seen = new Set([normalize(answer)]);
  const picked = [];

  for (const other of shuffle(pool)) {
    const candidate = String(other.word || "").trim();
    const key = normalize(candidate);
    if (!candidate || seen.has(key)) continue;
    seen.add(key);
    picked.push(candidate);
    if (picked.length >= total - 1) break;
  }

  return picked.length >= total - 1 ? [...picked, answer] : null;
}

function formOptions(word, answer, total) {
  const forms = wordForms(word.word, word.partOfSpeech);
  const key = normalize(answer);
  const seen = new Set([key]);
  const picked = [];

  for (const form of shuffle(forms)) {
    const candidate = normalize(form);
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    picked.push(candidate);
    if (picked.length >= total - 1) break;
  }

  return picked.length >= total - 1 ? [...picked, key] : null;
}

/* ==========================================
   One item
   ========================================== */

/*
Build a single item, or null when this word cannot make an honest one
(a sentence that does not contain the word, a missing audio file, or not
enough distractors). Returning null rather than a bad item is deliberate:
the caller simply asks for another word.
*/
export function buildFibItem(word, pool, options = {}) {
  if (!word || !word.word) return null;

  const mode = FIB_MODES.includes(options.mode) ? options.mode : "audio";
  const total = CHOICES.includes(Number(options.choices)) ? Number(options.choices) : 4;
  const sentences = sentenceWithWord(word);
  if (!sentences.length) return null;

  for (const sentence of shuffle(sentences)) {
    const answer = surfaceForm(sentence, word.word, word.partOfSpeech);
    if (!answer) continue;

    const gap = blankedSentence(sentence, word.word, word.partOfSpeech);
    if (!gap) continue;

    const choiceList = mode === "form"
      ? formOptions(word, answer, total)
      : wordOptions(pool, word, answer, total);
    if (!choiceList) continue;

    return {
      id: `${mode}:${normalize(word.word)}`,
      mode,
      word: String(word.word),
      answer: normalize(answer),
      sentence: gap,
      options: shuffle(choiceList),
      audio: word.audio || options.audioOf?.(word.word) || "",
      meaningAR: word.meaningAR || "",
      cefrLevel: word.cefrLevel || "",
      tip: mode === "form"
        ? ` form الجواب هي «${answer}» كما وردت في جملة البنك.`
        : `استمع ثم اختر «${answer}» بالشكل الصحيح.`
    };
  }

  return null;
}

/*
A full set. Words are shuffled and filtered so a bank with 1005 entries
never serves the same item twice in a row; anything that cannot make an
honest item is skipped rather than patched.
*/
export function buildFibSet(vocabulary, options = {}) {
  const pool = Array.isArray(vocabulary) ? vocabulary : [];
  const count = Math.max(1, Number(options.count) || 10);
  const items = [];
  const used = new Set();

  for (const word of shuffle(pool)) {
    if (items.length >= count) break;
    const item = buildFibItem(word, pool, options);
    if (!item || used.has(item.id)) continue;
    used.add(item.id);
    items.push(item);
  }

  return items;
}

/* ==========================================
   Scoring
   ========================================== */

export function isCorrect(item, answer) {
  if (!item || !answer) return false;
  return normalize(answer) === normalize(item.answer);
}

/*
One point per blank, no partial credit — the exam marks each gap
separately. `percent` is what the task stats and the PTE scale consume.
*/
export function scoreFibSet(items, answers) {
  const list = Array.isArray(items) ? items : [];
  const given = answers && typeof answers === "object" ? answers : {};

  const results = list.map((item, index) => {
    const answer = given[index] ?? given[item.id] ?? "";
    const correct = isCorrect(item, answer);
    return {
      index,
      id: item.id,
      word: item.word,
      mode: item.mode,
      sentence: item.sentence,
      answer: item.answer,
      given: normalize(answer),
      correct,
      option: item.options.includes(given[index] ?? given[item.id]) ? given[index] ?? given[item.id] : ""
    };
  });

  const correct = results.filter((result) => result.correct).length;
  const total = results.length;

  return {
    correct,
    total,
    percent: total ? Math.round((correct / total) * 100) : 0,
    results,
    missedTerms: results.filter((r) => !r.correct).map((r) => r.word)
  };
}