/* ==========================================
   PTE Trainer — Interactive Tests Engine
   8 question modes: meaning, reverse, audio,
   audio-meaning, cloze, typing, synonym, anagram
   ========================================== */

"use strict";

import { getVocabulary, getWordAudio } from "./vocabulary.js";
import { getStudyStatus } from "./storage.js";

export const QUIZ_MODES = {
  meaning: {
    label: "المعنى ← الكلمة",
    icon: "💬",
    desc: "اختر الكلمة الصحيحة من معناها"
  },
  reverse: {
    label: "الكلمة ← المعنى",
    icon: "🔄",
    desc: "اعرض الكلمة واختر معناها"
  },
  audio: {
    label: "الصوت ← الكلمة",
    icon: "🔊",
    desc: "استمع واختر كتابة الكلمة"
  },
  audioMeaning: {
    label: "الصوت ← المعنى",
    icon: "🎧",
    desc: "استمع واختر معنى الكلمة"
  },
  cloze: {
    label: "جملة ناقصة",
    icon: "🧩",
    desc: "أكمل الفراغ بمثال الكلمة"
  },
  typing: {
    label: "الإملاء",
    icon: "⌨️",
    desc: "اكتب الكلمة بالإنجليزية من معناها"
  },
  synonym: {
    label: "المرادف ← الكلمة",
    icon: "🔗",
    desc: "اختر مرادف الكلمة الصحيح"
  },
  anagram: {
    label: "رتب الحروف",
    icon: "🔤",
    desc: "استخرج الكلمة من الحروف المبعثرة"
  }
};

export const MODE_ORDER = [
  "meaning",
  "reverse",
  "audio",
  "audioMeaning",
  "cloze",
  "typing",
  "synonym",
  "anagram"
];

export const WORD_CHOICE_MODES = ["meaning", "audio", "cloze", "typing", "anagram"];
export const MEANING_CHOICE_MODES = ["reverse", "audioMeaning"];

export function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function normalizeAnswer(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isAnswerCorrect(question, answer) {
  if (!answer) return false;
  if (question.type === "typing") {
    return normalizeAnswer(answer) === normalizeAnswer(question.answer);
  }
  return String(answer).toLowerCase() === String(question.answer).toLowerCase();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* --------------------------------------
   Option builders (each returns full list,
   the answer always included, and all
   entries are unique)
-------------------------------------- */

function meaningText(word) {
  return String(word.meaningAR || "").trim();
}

function buildWordOptions(pool, word, total) {
  const answer = String(word.word);
  const seen = new Set([answer.toLowerCase()]);
  const picked = [];
  for (const w of shuffle(pool)) {
    const key = String(w.word).toLowerCase();
    if (w !== word && !seen.has(key)) {
      seen.add(key);
      picked.push(String(w.word));
      if (picked.length >= total - 1) break;
    }
  }
  if (picked.length < total - 1) return null;
  return shuffle([answer, ...picked]);
}

function buildMeaningOptions(pool, word, total) {
  const answer = meaningText(word);
  if (!answer) return null;
  const seen = new Set([answer.toLowerCase()]);
  const picked = [];
  for (const w of shuffle(pool)) {
    const text = meaningText(w);
    const key = text.toLowerCase();
    if (w !== word && text && !seen.has(key)) {
      seen.add(key);
      picked.push(text);
      if (picked.length >= total - 1) break;
    }
  }
  if (picked.length < total - 1) return null;
  return shuffle([answer, ...picked]);
}

function buildSynonymOptions(pool, word, total) {
  const syns = Array.isArray(word.synonyms) ? word.synonyms.filter(Boolean) : [];
  const answer = syns[0] ? String(syns[0]) : "";
  if (!answer) return null;
  const seen = new Set([answer.toLowerCase()]);
  const picked = [];
  for (const w of shuffle(pool)) {
    const candidates = Array.isArray(w.synonyms) ? w.synonyms.filter(Boolean) : [];
    for (const candidate of candidates) {
      const key = String(candidate).toLowerCase();
      if (candidate && !seen.has(key)) {
        seen.add(key);
        picked.push(String(candidate));
        if (picked.length >= total - 1) break;
      }
    }
    if (picked.length >= total - 1) break;
  }
  if (picked.length < total - 1) return null;
  return shuffle([answer, ...picked]);
}

/* --------------------------------------
   Question builders
-------------------------------------- */

function pickClozeExample(word) {
  const examples = Array.isArray(word.examples) ? word.examples : [];
  const pattern = new RegExp(
    `(?<![A-Za-z])${escapeRegExp(word.word)}(?![A-Za-z])`,
    "i"
  );
  const match = examples.find((example) => pattern.test(example));
  if (!match) return null;
  return match.replace(pattern, "______");
}

function scrambleAnagram(word) {
  const lower = String(word).toLowerCase();
  if (lower.length < 3) return null;
  const letters = [...lower];
  for (let attempt = 0; attempt < 40; attempt++) {
    for (let k = letters.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [letters[k], letters[j]] = [letters[j], letters[k]];
    }
    const joined = letters.join("");
    if (joined !== lower) return joined.split("").join(" ");
  }
  return null;
}

function buildQuestion(word, type, pool, choices) {
  const answer = String(word.word);
  const base = {
    type,
    word: answer,
    answer,
    cefrLevel: word.cefrLevel || "",
    partOfSpeech: word.partOfSpeech || ""
  };
  base.audioPlay = word.audio || getWordAudio(answer) || "";

  if (type === "meaning" || type === "typing") {
    base.meaningAR = word.meaningAR || "";
    base.meaningEN = word.meaningEN || "";
  }

  if (type === "audio" || type === "audioMeaning") {
    const audio = word.audio || getWordAudio(answer);
    if (!audio) return null;
    base.audio = audio;
    base.meaningAR = word.meaningAR || "";
    base.meaningEN = word.meaningEN || "";
    if (type === "audioMeaning") {
      const options = buildMeaningOptions(pool, word, choices);
      if (!options) return null;
      base.options = options;
      base.answer = meaningText(word);
    }
  }

  if (type === "cloze") {
    const example = pickClozeExample(word);
    if (!example) return null;
    base.example = example;
    base.meaningAR = word.meaningAR || "";
  }

  if (type === "reverse") {
    const options = buildMeaningOptions(pool, word, choices);
    if (!options) return null;
    base.options = options;
    base.meaningAR = word.meaningAR || "";
    base.meaningEN = word.meaningEN || "";
    base.answer = meaningText(word);
  }

  if (type === "synonym") {
    const options = buildSynonymOptions(pool, word, choices);
    if (!options) return null;
    base.options = options;
    base.meaningAR = word.meaningAR || "";
    base.meaningEN = word.meaningEN || "";
    base.answer = Array.isArray(word.synonyms) && word.synonyms[0] ? String(word.synonyms[0]) : "";
  }

  if (type === "anagram") {
    const scrambled = scrambleAnagram(answer);
    if (!scrambled) return null;
    base.scrambled = scrambled;
    base.meaningAR = word.meaningAR || "";
    base.meaningEN = word.meaningEN || "";
  }

  if (type === "meaning" || type === "audio") {
    const options = buildWordOptions(pool, word, choices);
    if (!options) return null;
    base.options = options;
  }

  if (type === "anagram") {
    const options = buildWordOptions(pool, word, choices);
    if (!options) return null;
    base.options = options;
  }

  if (type === "cloze") {
    const options = buildWordOptions(pool, word, choices);
    if (!options) return null;
    base.options = options;
  }

  if (type === "reverse" || type === "audioMeaning" || type === "synonym") {
    base.pronunciation = word.pronunciation || "";
  }

  return base;
}

/* --------------------------------------
   Build a quiz session
-------------------------------------- */

export function buildQuestions({
  words,
  modes,
  count,
  cefr,
  studyFilter,
  choices = 4
} = {}) {
  const all = Array.isArray(words) && words.length ? words : getVocabulary();
  let pool = all.slice();

  if (cefr && cefr !== "all") {
    pool = pool.filter((w) => w.cefrLevel === cefr);
  }
  if (studyFilter && studyFilter !== "all") {
    pool = pool.filter((w) => {
      const status = getStudyStatus(w.word);
      if (studyFilter === "unstudied") return !status;
      return status === studyFilter;
    });
  }

  const modeList = Array.isArray(modes) && modes.length ? modes : ["meaning"];
  const wordsPool = shuffle(pool);
  const target = Math.min(Number(count) || 10, wordsPool.length);
  const questions = [];
  let cycle = 0;

  for (const word of wordsPool) {
    if (questions.length >= target) break;
    const mode = modeList[cycle % modeList.length];
    cycle++;

    let question = buildQuestion(word, mode, pool, choices);
    if (!question && modeList.length > 1) {
      for (const candidate of modeList.filter((m) => m !== mode)) {
        question = buildQuestion(word, candidate, pool, choices);
        if (question) break;
      }
    }
    if (question) {
      questions.push(Object.assign({ id: questions.length + 1 }, question));
    }
  }

  return questions;
}