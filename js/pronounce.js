/* ==========================================
   PTE Trainer
   Pronunciation match helpers (single word)
   ========================================== */

"use strict";

export function normalizeSpoken(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z'-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const next = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      next[j] = Math.min(prev[j] + 1, next[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = next;
  }
  return prev[n];
}

export function wordMatches(target, spoken, threshold = 0.8) {
  const t = normalizeSpoken(target);
  const s = normalizeSpoken(spoken);
  if (!t || !s) return false;
  if (t === s) return true;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(^|[\\s'-])${escaped}([.\\s,'-]|$)`).test(s)) return true;
  const similarity = 1 - levenshtein(t, s) / Math.max(t.length, s.length);
  return similarity >= threshold;
}