/*
==========================================
PTE Trainer
Summarize Written Text — Scoring module
Scoring follows the four PTE criteria
(Content, Form, Grammar, Vocabulary),
each normed to /2. Total = mean /100.
==========================================
*/

"use strict";

function norm(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-zA-Z' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* Break into sentences using the same rule as the page. */
function countSentences(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return 0;
  const matches = trimmed.match(/[.!?]+(?=\s|$)/g);
  return matches ? matches.length : 0;
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
  const re = new RegExp(`(^|\\s|')${target.replace(/['']/g, "")}(?=(\\s|'|$))`);
  return re.test(normalizedText.replace(/['']/g, "'"));
}

function scoreContent(normalizedText, keywords) {
  if (!normalizedText) return { score: 0, coverage: 0 };
  const hits = keywords.filter((keyword) => hasKeyword(normalizedText, keyword)).length;
  const coverage = keywords.length ? hits / keywords.length : 0;
  const score = Math.min(2, Number((coverage * 2).toFixed(2)));
  return { score, coverage, hits, total: keywords.length };
}

function scoreForm(sentences, words) {
  if (sentences !== 1) return { score: 0, reason: `${sentences} sentences — one sentence is required` };
  if (words < 5 || words > 75) {
    return { score: 1, reason: `One sentence, but ${words} words (5–75 required)` };
  }
  return { score: 2, reason: "One sentence within the 5–75 word range" };
}

function scoreGrammar(text, words) {
  if (!text.trim()) return { score: 0, reason: "No response" };
  let score = 2;
  const issues = [];
  const normalized = text.replace(/['']/g, "'").replace(/\s+/g, " ").trim();
  const repeated = normalized.split(" ")
    .find((token, index, arr) => token && arr[index + 1] === token);
  if (repeated) {
    score -= 0.5;
    issues.push(`repeated word "${repeated}"`);
  }
  const endsWithPunctuation = /[.!?]$/.test(text.trim());
  if (!endsWithPunctuation) {
    score -= 0.5;
    issues.push("missing terminal punctuation");
  }
  const startsCapital = /^[A-Z]/.test(text.trim());
  if (!startsCapital && words > 1) {
    score -= 0.25;
    issues.push("should start with a capital letter");
  }
  if (score < 0) score = 0;
  return { score, issues };
}

function scoreVocabulary(normalizedText, words) {
  if (!words) return { score: 0, reason: "No response" };
  const unique = new Set(normalizedText ? normalizedText.split(" ") : []);
  const diversity = unique.size / words;
  const score = Math.min(2, Number((diversity * 2).toFixed(2)));
  return { score, reason: `${unique.size} unique words across ${words} total (lexical diversity ${Math.round(diversity * 100)}%)` };
}

export function scoreSummary(passage, userText) {
  const text = String(userText || "");
  const normalized = norm(text);
  const words = countWords(text);
  const sentences = countSentences(text);

  const content = scoreContent(normalized, passage.keywords || []);
  const form = scoreForm(sentences, words);
  const grammar = scoreGrammar(text, words);
  const vocabulary = scoreVocabulary(normalized, words);

  const criteria = {
    Content: Number(content.score.toFixed(2)),
    Form: Number(form.score.toFixed(2)),
    Grammar: Number(grammar.score.toFixed(2)),
    Vocabulary: Number(vocabulary.score.toFixed(2))
  };

  const sum = Object.values(criteria).reduce((a, b) => a + b, 0);
  const total = Math.round((sum / 8) * 100);

  return {
    total,
    criteria,
    words,
    sentences,
    keywordCoverage: content.coverage,
    hits: content.hits,
    keywordTotal: content.total,
    contentReasons: [],
    formReason: form.reason,
    grammarIssues: grammar.issues,
    vocabularyReason: vocabulary.reason
  };
}