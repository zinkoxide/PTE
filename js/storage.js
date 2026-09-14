/* ==========================================
   PTE Trainer
   Vocabulary Study State (localStorage)
   ========================================== */

"use strict";

const STORAGE_KEY = "pte.vocab.study.v1";

const VALID_STATUS = ["learned", "review"];

export function loadStudyState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("Unable to load study state:", error);
    return {};
  }
}

export function getStudyStatus(word) {
  return loadStudyState()[word] || null;
}

export function setStudyStatus(word, status) {
  const state = loadStudyState();
  if (VALID_STATUS.includes(status)) {
    state[word] = status;
  } else {
    delete state[word];
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Unable to save study state:", error);
  }
  return state[word] || null;
}