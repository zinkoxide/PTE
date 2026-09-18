/* ==========================================
   PTE Trainer
   Vocabulary Study State + SRS + Pronunciation
   (localStorage)
   ========================================== */

"use strict";

const STORAGE_KEY = "pte.vocab.study.v1";
const PRON_KEY = "pte.vocab.pron.v1";

const VALID_STATUS = ["learned", "review"];

const DAY_MS = 86400000;
const INTERVAL_CAP_DAYS = 60;

/* --------------------------------------
   Migration: { word: "learned" }  ->  { word: { status, due, intervalDays } }
-------------------------------------- */

function migrateState(parsed) {
  const out = {};
  for (const [word, value] of Object.entries(parsed)) {
    if (value && typeof value === "object" && value.status) {
      out[word] = {
        status: value.status,
        due: Number(value.due) || 0,
        intervalDays: Math.max(0, Number(value.intervalDays) || 0),
        ease: Math.max(1, Number(value.ease) || 2.5)
      };
    } else if (VALID_STATUS.includes(value)) {
      out[word] = {
        status: value,
        due: Date.now(),
        intervalDays: value === "learned" ? 3 : 0,
        ease: 2.5
      };
    }
  }
  return out;
}

function loadState(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn(`Unable to load ${key}:`, error);
    return {};
  }
}

function saveState(key, state) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (error) {
    console.warn(`Unable to save ${key}:`, error);
  }
}

/* --------------------------------------
   SRS study state
-------------------------------------- */

export function loadStudyState() {
  return migrateState(loadState(STORAGE_KEY));
}

export function getStudyEntry(word) {
  return loadStudyState()[word] || null;
}

export function getStudyStatus(word) {
  const entry = getStudyEntry(word);
  return entry ? entry.status : null;
}

export function setStudyStatus(word, status) {
  const state = loadStudyState();
  if (VALID_STATUS.includes(status)) {
    state[word] = {
      status,
      due: status === "review" ? Date.now() : Date.now() + 3 * DAY_MS,
      intervalDays: status === "review" ? 0 : 3,
      ease: 2.5
    };
  } else {
    delete state[word];
  }
  saveState(STORAGE_KEY, state);
  return state[word] || null;
}

export function isDue(word) {
  const entry = getStudyEntry(word);
  if (!entry) return false;
  if (entry.status === "review") return true;
  return entry.due <= Date.now();
}

export function getDueWords() {
  const state = loadStudyState();
  const now = Date.now();
  return Object.keys(state).filter((word) => {
    const entry = state[word];
    if (!entry) return false;
    if (entry.status === "review") return true;
    return entry.due <= now;
  });
}

export function countDueToday() {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const state = loadStudyState();
  return Object.keys(state).filter((word) => {
    const entry = state[word];
    if (!entry) return false;
    if (entry.status === "review") return true;
    return entry.due <= endOfToday.getTime();
  }).length;
}

export function judgeStudy(word, remembered) {
  const state = loadStudyState();
  const entry =
    state[word] ||
    { status: "learned", due: Date.now(), intervalDays: 0, ease: 2.5 };

  let intervalDays;
  if (remembered) {
    const base = entry.intervalDays > 0 ? entry.intervalDays : 3;
    intervalDays = Math.min(INTERVAL_CAP_DAYS, Math.round(base * 1.5));
  } else {
    intervalDays = 1;
  }

  state[word] = {
    status: "learned",
    due: Date.now() + intervalDays * DAY_MS,
    intervalDays,
    ease: remembered ? Math.min(3, (entry.ease || 2.5) + 0.1) : 2.5
  };
  saveState(STORAGE_KEY, state);
  return state[word];
}

/* --------------------------------------
   Pronunciation records
-------------------------------------- */

export function loadPronState() {
  return loadState(PRON_KEY);
}

export function getPronunciation(word) {
  return (loadState(PRON_KEY) || {})[word] || null;
}

export function recordPronunciation(word, correct) {
  const state = loadState(PRON_KEY);
  const entry = state[word] || { attempts: 0, correct: 0, lastCorrect: false, lastDate: 0 };
  entry.attempts += 1;
  if (correct) entry.correct += 1;
  entry.lastCorrect = correct;
  entry.lastDate = Date.now();
  state[word] = entry;
  saveState(PRON_KEY, state);
  return entry;
}

export function needsPronunciation(word) {
  const entry = (loadState(PRON_KEY) || {})[word];
  return Boolean(entry && entry.lastCorrect === false);
}