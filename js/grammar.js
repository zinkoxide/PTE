/* ==========================================
   PTE Trainer — Grammar Data Engine
   ========================================== */

"use strict";

let lessons = [];

const MANIFEST_URL = "./data/grammar/manifest.json";

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
  if (target === "tf") {
    return { ...item, type: "tf", correct: item.answer === "True" };
  }
  return item;
}

export async function loadGrammar() {
  try {
    const manifestResponse = await fetch(MANIFEST_URL);
    if (!manifestResponse.ok) throw new Error(`HTTP ${manifestResponse.status} for manifest`);
    const files = await manifestResponse.json();
    if (!Array.isArray(files) || !files.length) throw new Error("Empty grammar manifest.");
    const results = await Promise.all(
      files.map(async (file) => {
        const response = await fetch(`./data/grammar/${file}`);
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${file}`);
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      })
    );
    const data = results.flat();
    if (!data.length) throw new Error("Grammar data is empty.");
    lessons = data.map((lesson) => ({
      ...lesson,
      quiz: (lesson.quiz || []).map(normalizeItem)
    }));
    console.log("Grammar lessons loaded:", lessons.length);
    return lessons;
  } catch (error) {
    console.error("Unable to load grammar:", error);
    lessons = [];
    return [];
  }
}

export function getGrammar() {
  return lessons;
}

export function getLesson(id) {
  return lessons.find((lesson) => lesson.id === id) || null;
}

export function getCategories() {
  const seen = [];
  lessons.forEach((lesson) => {
    if (lesson.category && !seen.includes(lesson.category)) {
      seen.push(lesson.category);
    }
  });
  return seen;
}

export function getQuizItems({ lessonId, categories } = {}) {
  let source = lessons;
  if (lessonId) {
    const lesson = getLesson(lessonId);
    source = lesson ? [lesson] : [];
  } else if (Array.isArray(categories) && categories.length) {
    source = lessons.filter((lesson) => categories.includes(lesson.category));
  }
  const items = [];
  source.forEach((lesson) => {
    (lesson.quiz || []).forEach((item) => {
      items.push({
        ...item,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        lessonIcon: lesson.icon
      });
    });
  });
  return items;
}

export function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function shuffleOptions(item) {
  if (item.type !== "mcq" || !Array.isArray(item.options)) return item;
  const indexed = item.options.map((text, i) => ({ text, i }));
  const shuffled = shuffle(indexed);
  return {
    ...item,
    options: shuffled.map((o) => o.text),
    answer: shuffled.findIndex((o) => o.i === item.answer)
  };
}

const SENTENCE_ABBREVIATIONS = new Set([
  "dr", "mr", "mrs", "ms", "prof", "st", "sr", "jr", "rev", "no",
  "vs", "etc", "co", "inc", "ltd", "e.g", "i.e", "a.m", "p.m",
  "u.s", "u.k", "b.c", "a.d", "fig", "pt", "pp"
]);

export function toSentences(text) {
  const parts = String(text).split(/\.\s+/);
  const out = [];
  let sentence = "";
  for (const part of parts) {
    const tokenMatch = part.match(/([\p{L}\p{N}]+(?:[.'-][\p{L}\p{N}]+)*)\s*$/u) || [];
    const lastToken = tokenMatch[1] || "";
    const isAbbreviation = SENTENCE_ABBREVIATIONS.has(lastToken.toLowerCase().replace(/\.+$/, ""));
    sentence = sentence ? sentence + ". " + part : part;
    if (!isAbbreviation) {
      out.push(sentence);
      sentence = "";
    }
  }
  if (sentence) out.push(sentence);
  return out
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/[.!؟]$/.test(s) ? s : s + "."));
}