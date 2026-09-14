/* ==========================================
   PTE Trainer
   Scoring Engine
   ========================================== */

"use strict";

export function calculateScore(comparison) {
  if (!comparison) {
    return {
      score: 0,
      accuracy: 0,
      level: "No result",
      correct: 0,
      wrong: 0,
      missing: 0,
      extra: 0,
      normalized: 0,
      totalWords: 0
    };
  }

  const totalOriginal = comparison.totalOriginalWords || 0;
  const correct = comparison.correctCount || 0;
  const wrong = comparison.wrongCount || 0;
  const missing = comparison.missingCount || 0;
  const extra = comparison.extraCount || 0;

  // Single unified definition of accuracy:
  // (original length - all error words) / original length
  const totalErrors = wrong + missing + extra;
  const accuracy =
    totalOriginal === 0
      ? 0
      : Math.max(0, ((totalOriginal - totalErrors) / totalOriginal) * 100);

  const score = Math.round(accuracy);

  let level;
  if (score >= 90) level = "Excellent";
  else if (score >= 75) level = "Good";
  else if (score >= 50) level = "Needs Improvement";
  else level = "Needs Practice";

  return {
    score,
    accuracy,
    level,
    correct,
    wrong,
    missing,
    extra,
    normalized: comparison.normalizedCount || 0,
    totalWords: totalOriginal
  };
}