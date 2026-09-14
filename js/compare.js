/* ==========================================
   PTE Trainer
   Sentence Comparison Engine (Edit Distance)
   ========================================== */

"use strict";

/* --------------------------------------
   Number normalization tables
-------------------------------------- */

const numberWords = {
  zero: "zero", one: "one", two: "two", three: "three",
  four: "four", five: "five", six: "six", seven: "seven",
  eight: "eight", nine: "nine", ten: "ten", eleven: "eleven",
  twelve: "twelve", thirteen: "thirteen", fourteen: "fourteen",
  fifteen: "fifteen", sixteen: "sixteen", seventeen: "seventeen",
  eighteen: "eighteen", nineteen: "nineteen", twenty: "twenty"
};

const digitToWord = {
  "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
  "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
  "10": "ten", "11": "eleven", "12": "twelve", "13": "thirteen",
  "14": "fourteen", "15": "fifteen", "16": "sixteen", "17": "seventeen",
  "18": "eighteen", "19": "nineteen", "20": "twenty"
};

function normalizeToken(token) {
  let value = token.toLowerCase().trim();

  // Time such as "9:00" becomes "nine".
  const timeMatch = value.match(/^(\d{1,2}):00$/);
  if (timeMatch && digitToWord[timeMatch[1]]) {
    return digitToWord[timeMatch[1]];
  }

  if (digitToWord[value]) return digitToWord[value];
  if (numberWords[value]) return numberWords[value];

  return value;
}

function tokenizeText(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[-]/g, " ")
    .replace(/[.,!?;,"'()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function normalizeText(text) {
  return tokenizeText(text).map(normalizeToken);
}

/* ==========================================
   Compare Sentences
   ========================================== */

export function compareSentences(originalText, spokenText) {
  const originalRaw = tokenizeText(originalText);
  const spokenRaw = tokenizeText(spokenText);
  const original = normalizeText(originalText);
  const spoken = normalizeText(spokenText);

  const n = original.length;
  const m = spoken.length;

  // Edit distance matrix
  const matrix = [];
  for (let i = 0; i <= n; i++) matrix.push(new Array(m + 1).fill(0));

  for (let i = 0; i <= n; i++) matrix[i][0] = i;
  for (let j = 0; j <= m; j++) matrix[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (original[i - 1] === spoken[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i - 1][j] + 1,     // deletion
          matrix[i][j - 1] + 1      // insertion
        );
      }
    }
  }

  // Backtrack to build operations
  const operations = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    // Correct match (prefer exact match)
    if (i > 0 && j > 0 && original[i - 1] === spoken[j - 1]) {
      const isNormalized =
        originalRaw[i - 1].toLowerCase() !== spokenRaw[j - 1].toLowerCase();

      operations.unshift({
        type: isNormalized ? "normalized" : "correct",
        original: originalRaw[i - 1],
        spoken: spokenRaw[j - 1]
      });
      i--;
      j--;
      continue;
    }

    const substitutionCost = i > 0 && j > 0 ? matrix[i - 1][j - 1] : Infinity;
    const deletionCost = i > 0 ? matrix[i - 1][j] : Infinity;
    const insertionCost = j > 0 ? matrix[i][j - 1] : Infinity;
    const bestCost = Math.min(substitutionCost, deletionCost, insertionCost);

    // Wrong (substitution)
    if (
      i > 0 &&
      j > 0 &&
      substitutionCost === bestCost &&
      matrix[i][j] === substitutionCost + 1
    ) {
      operations.unshift({
        type: "wrong",
        original: originalRaw[i - 1],
        spoken: spokenRaw[j - 1]
      });
      i--;
      j--;
      continue;
    }

    // Missing (deletion)
    if (
      i > 0 &&
      deletionCost === bestCost &&
      matrix[i][j] === deletionCost + 1
    ) {
      operations.unshift({
        type: "missing",
        original: originalRaw[i - 1],
        spoken: null
      });
      i--;
      continue;
    }

    // Extra (insertion)
    if (
      j > 0 &&
      insertionCost === bestCost &&
      matrix[i][j] === insertionCost + 1
    ) {
      operations.unshift({
        type: "extra",
        original: null,
        spoken: spokenRaw[j - 1]
      });
      j--;
      continue;
    }

    // Safety fallback
    if (i > 0) i--;
    else j--;
  }

  const correctCount = operations.filter(
    (op) => op.type === "correct" || op.type === "normalized"
  ).length;

  return {
    originalText,
    spokenText,
    originalWords: originalRaw,
    spokenWords: spokenRaw,
    normalizedOriginalWords: original,
    normalizedSpokenWords: spoken,
    operations,
    correctCount,
    wrongCount: operations.filter((op) => op.type === "wrong").length,
    missingCount: operations.filter((op) => op.type === "missing").length,
    extraCount: operations.filter((op) => op.type === "extra").length,
    normalizedCount: operations.filter((op) => op.type === "normalized").length,
    totalOriginalWords: n,
    totalSpokenWords: m
  };
}