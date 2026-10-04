/*
==========================================
PTE Trainer
Describe Image — scoring module
Three speaking criteria for a spoken (or
typed) description: Content, Fluency,
Vocabulary — each /2, total /100.
==========================================
*/

"use strict";

const FLUENCY_MIN = 15;
const FLUENCY_MAX = 60;

function norm(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-zA-Z' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text) {
  const trimmed = String(text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function hasKeyword(normalizedText, keyword) {
  const target = norm(keyword);
  if (!target) return false;
  const words = target.split(" ");
  if (words.length > 1) return normalizedText.includes(target);
  const cleaned = target.replace(/[']/g, "");
  const re = new RegExp(`(^|\\s|')${cleaned}(?=(\\s|'|$))`);
  return re.test(normalizedText);
}

function scoreContent(normalizedText, keywords) {
  if (!normalizedText) return { score: 0, coverage: 0, hits: 0 };
  const hits = keywords.filter((k) => hasKeyword(normalizedText, k)).length;
  const coverage = keywords.length ? hits / keywords.length : 0;
  return { score: Math.min(2, Number((coverage * 2).toFixed(2))), coverage, hits };
}

function scoreFluency(words) {
  if (words === 0) return { score: 0, reason: "Nothing was said or written." };
  if (words >= FLUENCY_MIN && words <= FLUENCY_MAX) {
    return { score: 2, reason: `${words} words in the ideal ${FLUENCY_MIN}-${FLUENCY_MAX} range.` };
  }
  if (words < FLUENCY_MIN) {
    return { score: Number((words / FLUENCY_MIN).toFixed(2)), reason: `${words} words — aim for at least ${FLUENCY_MIN} for a fluent 40-second delivery.` };
  }
  return { score: 2, reason: `${words} words; steady pace with some extra detail.` };
}

function scoreVocabulary(normalizedText, words) {
  if (!words) return { score: 0, reason: "No response to assess." };
  const unique = new Set(normalizedText.split(" "));
  const diversity = unique.size / words;
  return { score: Math.min(2, Number((diversity * 2).toFixed(2))), reason: `${unique.size} unique words across ${words} total.` };
}

export function scoreDescription(image, text) {
  const raw = String(text || "");
  const normalized = norm(raw);
  const words = countWords(raw);

  const content = scoreContent(normalized, image.keywords || []);
  const fluency = scoreFluency(words);
  const vocabulary = scoreVocabulary(normalized, words);

  const criteria = {
    Content: Number(content.score.toFixed(2)),
    Fluency: Number(fluency.score.toFixed(2)),
    Vocabulary: Number(vocabulary.score.toFixed(2))
  };

  const total = Math.round((Object.values(criteria).reduce((a, b) => a + b, 0) / 6) * 100);

  return {
    total,
    criteria,
    words,
    keywordCoverage: content.coverage,
    hits: content.hits,
    keywordTotal: (image.keywords || []).length,
    fluencyReason: fluency.reason,
    vocabularyReason: vocabulary.reason
  };
}