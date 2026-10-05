/*
==========================================
PTE Trainer
Read Aloud
==========================================
*/

"use strict";

import { SpeechEngine } from "./speech.js";
import { scoreReadAloud, FLUENCY_LIMITS } from "./read-aloud-score.js";
import {
  emptyTaskStats,
  normalizeTaskStats,
  recordTaskAttempt,
  describeDue
} from "./task-stats.js";
import { toOfficialScore, describeBand } from "./pte-scale.js";

const PREPARE_SECONDS = 40;
const RA_MAX_SECONDS = 45;
const RA_STATS_KEY = "pte.ra.stats.v1";
const RA_MODE_KEY = "pte.ra.mode";

const fallbackTexts = [
  "The library closes at six o'clock on weekdays.",
  "Students must bring their own calculators to the exam.",
  "Coffee prices have risen sharply since the beginning of 2022."
];

const THREE_STEPS = [
  {
    title: "1 · Read it silently first",
    body: "Look at the whole text before you start. Mark the phrase that carries the stress — it is almost always the verb or the time expression — and decide where your single breath will go."
  },
  {
    title: "2 · Keep the phrases together",
    body: "Do not stop between the words of an idea. Link small function words to the content word beside them, the way a native speaker joins them: \"must bring\", \"has decreased\", \"at the end of March\"."
  },
  {
    title: "3 · One smooth breath, natural pace",
    body: "Aim for roughly 2.2 to 3.6 words per second. Rushing costs pronunciation marks as surely as stopping, and a long pause mid-sentence breaks fluency even when every word is correct."
  }
];

const TIPS = [
  "Practise the text twice out loud before you record the attempt.",
  "Stress content words, not function words — \"committee\" and \"findings\", never \"the\" or \"of\".",
  "End at a full stop rather than trailing off; a clear ending sounds confident."
];

const AVOID = [
  "Do not stop after every word.",
  "Do not speed up to finish early.",
  "Do not add words that are not on the screen.",
  "Do not apologise or explain during the recording."
];

/* ------------------ DOM ------------------ */

const $ = (id) => document.getElementById(id);

const questionNumber = $("ra-question-number");
const timerEl = $("ra-timer");
const textEl = $("ra-text");
const wordCountEl = $("ra-word-count");
const playButton = $("ra-play-button");
const tipEl = $("ra-tip");
const phasePill = $("ra-phase-pill");
const progressFill = $("ra-progress-fill");
const recordButton = $("ra-record-button");
const stopButton = $("ra-stop-button");
const transcriptEl = $("ra-transcript");
const fallbackWrap = $("ra-fallback-wrap");
const fallbackInput = $("ra-fallback-input");
const fallbackCount = $("ra-fallback-count");
const submitFallbackButton = $("ra-submit-fallback");
const resultSection = $("ra-result-section");
const resultContent = $("ra-result-content");
const prevButton = $("ra-previous-button");
const nextButton = $("ra-next-button");
const modeTrainButton = $("ra-mode-train");
const modePracticeButton = $("ra-mode-practice");
const trainingSection = $("ra-training");
const trainingContent = $("ra-training-content");
const goPracticeButton = $("ra-train-go-practice");

/* ------------------ State ------------------ */

let items = fallbackTexts.map((text, index) => ({
  id: `ra-fallback-${index + 1}`,
  text,
  level: "A2",
  tip: ""
}));

let currentIndex = 0;
let answered = new Set();
let mode = localStorage.getItem(RA_MODE_KEY) || "training";
let phase = "idle";
let prepareRemaining = PREPARE_SECONDS;
let recordSeconds = 0;
let screenTimer = null;
let longPauses = 0;
let lastTick = null;
let speech = null;

const engine = new SpeechEngine();

/* ------------------ Helpers ------------------ */

function escapeHTML(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function countWords(text) {
  const trimmed = String(text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function speechSupported() {
  return typeof engine.isSupported === "function" ? engine.isSupported() : false;
}

/* ------------------ Stats ------------------ */

function loadStats() {
  try {
    const raw = localStorage.getItem(RA_STATS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed ? normalizeTaskStats(parsed) : emptyTaskStats();
  } catch {
    return emptyTaskStats();
  }
}

function recordAttempt(item, score) {
  const next = recordTaskAttempt(loadStats(), {
    itemId: item.id,
    title: item.text,
    percent: score.total,
    missedTerms: score.missedKeywords || []
  });
  try {
    localStorage.setItem(RA_STATS_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("Unable to save Read Aloud stats:", error);
  }
}

/* ------------------ Training mode ------------------ */

function renderTraining() {
  const item = items[currentIndex];
  const frames = [
    "Stress the verb, then let the surrounding words run together.",
    "Group <i>function word + content word</i> as one unit.",
    "End on a full stop instead of letting your voice drop away."
  ];

  trainingContent.innerHTML =
    `<div class="ra-training-card">` +
    `<div class="ra-training-hero">` +
    `<div class="ra-training-title">How to read this text aloud</div>` +
    `<p class="ra-training-sub">Three habits that raise both Oral Fluency and Pronunciation marks.</p>` +
    `</div>` +
    `<div class="ra-steps">` +
    THREE_STEPS.map(
      (step) =>
        `<div class="ra-step">` +
        `<div class="ra-step-head"><span class="ra-step-tag">${step.title.split(" ")[0]}</span>` +
        `<strong>${escapeHTML(step.title.slice(step.title.indexOf(" ") + 1))}</strong></div>` +
        `<p>${escapeHTML(step.body)}</p>` +
        `</div>`
    ).join("") +
    `</div>` +
    `<div class="ra-panel">` +
    `<h4>Marking this text</h4>` +
    `<p class="ra-panel-note">${escapeHTML(
      item.tip || "Find the stress word, then read the whole text in one breath."
    )}</p>` +
    `<ul class="ra-frames">${frames.map((f) => `<li>${f}</li>`).join("")}</ul>` +
    `</div>` +
    `<div class="ra-panel">` +
    `<h4>Do &amp; don't</h4>` +
    `<p class="ra-tips-label">✓ Do</p><ul class="ra-tips">${TIPS.map((t) => `<li>${escapeHTML(t)}</li>`).join("")}</ul>` +
    `<p class="ra-tips-label is-avoid">✗ Don't</p><ul class="ra-tips is-avoid">${AVOID.map((a) => `<li>${escapeHTML(a)}</li>`).join("")}</ul>` +
    `</div>` +
    `</div>`;
}

function applyModeVisuals() {
  document.body.classList.toggle("ra-training-mode", mode === "training");
  modeTrainButton.classList.toggle("is-on", mode === "training");
  modePracticeButton.classList.toggle("is-on", mode === "practice");
  trainingSection.hidden = mode !== "training";
}

function setMode(next) {
  mode = next;
  try {
    localStorage.setItem(RA_MODE_KEY, mode);
  } catch {
    /* ignore storage failures */
  }
  applyModeVisuals();
  renderQuestion();
}

/*
The weak-item tracker schedules a failed item to come back (1, 3, 7 then 14
days). Saying so immediately turns a low score into a plan.
*/
function scheduleNotice(item) {
  const entry = (loadStats().missed || {})[item.id];
  const schedule = describeDue(entry);
  if (!schedule) return "";
  return `<p class="ra-schedule-note">🔁 ${escapeHTML(schedule.label)} — سيُعاد طرح هذا البند للمراجعة.</p>`;
}

/* ------------------ Phases and timers ------------------ */

function setPhase(next) {
  phase = next;
  const labels = {
    idle: "Ready",
    prepare: `Prepare ${formatTime(prepareRemaining)}`,
    recording: "Recording…",
    done: "Done"
  };
  phasePill.textContent = labels[next] || "Ready";
  phasePill.className = `pill ra-phase-pill is-${next}`;
}

function clearScreenTimer() {
  if (screenTimer) {
    clearInterval(screenTimer);
    screenTimer = null;
  }
}

function startPrepare() {
  clearScreenTimer();
  prepareRemaining = PREPARE_SECONDS;
  timerEl.textContent = formatTime(prepareRemaining);
  setPhase("prepare");
  lastTick = null;
  longPauses = 0;

  screenTimer = setInterval(() => {
    prepareRemaining -= 1;
    timerEl.textContent = formatTime(Math.max(0, prepareRemaining));
    if (prepareRemaining <= 0) {
      clearScreenTimer();
      setPhase("idle");
      timerEl.textContent = "0:00";
    }
  }, 1000);
}

function beginRecording() {
  if (!speechSupported()) {
    openFallback("Speech recognition is not available in this browser.");
    return;
  }

  recordSeconds = 0;
  longPauses = 0;
  lastTick = null;
  setPhase("recording");
  timerEl.textContent = "0:00";
  recordButton.hidden = true;
  stopButton.hidden = false;

  speech = new SpeechEngine();
  speech.setContinuous(true);
  speech.onResult = (text) => {
    transcriptEl.textContent = text;
  };
  speech.onError = (message) => {
    stopRecording();
    openFallback(message);
  };
  speech.onEnd = () => {
    if (phase === "recording") finishRecording();
  };
  speech.start();

  clearScreenTimer();
  screenTimer = setInterval(() => {
    recordSeconds += 1;
    timerEl.textContent = formatTime(recordSeconds);
    const now = Date.now();
    if (lastTick !== null && now - lastTick > FLUENCY_LIMITS.longPauseSeconds * 1000) {
      longPauses += 1;
    }
    lastTick = now;
    if (recordSeconds >= RA_MAX_SECONDS) finishRecording();
  }, 1000);
}

function stopRecording() {
  clearScreenTimer();
  if (speech && typeof speech.stop === "function") speech.stop();
  speech = null;
  setPhase("done");
  timerEl.textContent = "0:00";
  recordButton.hidden = true;
  stopButton.hidden = true;
  if (transcriptEl.textContent.trim()) submitAnswer(transcriptEl.textContent.trim());
  else openFallback("No speech was detected.");
}

function openFallback(reason) {
  clearScreenTimer();
  recordButton.hidden = false;
  stopButton.hidden = true;
  setPhase("idle");
  timerEl.textContent = "0:00";
  fallbackWrap.hidden = false;
  if (reason) transcriptEl.textContent = reason;
  fallbackInput.focus();
}

function finishRecording() {
  stopRecording();
}

/* ------------------ Playback (browser TTS) ------------------ */

function playText() {
  if (typeof speechSynthesis === "undefined") {
    tipEl.textContent = "This browser cannot play the text — read it yourself.";
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(items[currentIndex].text);
  utterance.lang = "en-US";
  utterance.rate = 0.95;
  speechSynthesis.speak(utterance);
  tipEl.textContent = "Listening…";
  window.setTimeout(() => {
    tipEl.textContent = items[currentIndex].tip || "Now read it yourself in one breath.";
  }, Math.max(1500, items[currentIndex].text.length * 70));
}

/* ------------------ Scoring ------------------ */

function submitAnswer(text) {
  if (answered.has(currentIndex)) return;

  const item = items[currentIndex];
  const score = scoreReadAloud(item, text, { seconds: recordSeconds, longPauses });

  clearScreenTimer();
  answered.add(currentIndex);
  setPhase("done");
  recordAttempt(item, score);
  progressFill.style.width = "100%";

  const officialScore = toOfficialScore(score.total);
  const band = describeBand(officialScore);

  const criteriaRows = Object.entries(score.criteria)
    .map(
      ([name, value]) =>
        `<div class="ra-criterion">` +
        `<span class="ra-criterion-name">${name}</span>` +
        `<span class="ra-criterion-bar"><i style="width:${(value / 2) * 100}%"></i></span>` +
        `<span class="ra-criterion-value">${value.toFixed(1)} / 2</span>` +
        `</div>`
    )
    .join("");

  const missed = score.missingWords.length
    ? `<p><strong>Skipped words:</strong> ${escapeHTML(score.missingWords.join(", "))}</p>`
    : "";
  const wrong = score.wrongWords.length
    ? `<p><strong>Mispronounced:</strong> ${escapeHTML(score.wrongWords.join(", "))}</p>`
    : "";

  resultSection.hidden = false;
  resultContent.innerHTML =
    `<div class="ra-result-total ${score.total >= 70 ? "is-good" : score.total >= 50 ? "is-mid" : "is-low"}">` +
    `<span class="ra-result-score">${score.total}</span>` +
    `<span class="ra-result-label">/ 100</span>` +
    `<span class="pte-official is-${band.tone}">≈ ${officialScore} / 90 · ${band.label}</span>` +
    `</div>` +
    `<div class="ra-criteria">${criteriaRows}</div>` +
    scheduleNotice(item) +
    `<div class="ra-result-details">` +
    `<p><strong>Pace:</strong> ${score.wordsPerSecond} words/second · <strong>Accuracy:</strong> ${score.accuracy}%</p>` +
    `<p>${escapeHTML(score.contentReason)}</p>` +
    `<p>${escapeHTML(score.fluencyReason)}</p>` +
    `<p>${escapeHTML(score.pronunciationReason)}</p>` +
    missed +
    wrong +
    `</div>` +
    `<div class="ra-reference"><strong>The text</strong><p>${escapeHTML(item.text)}</p></div>`;

  resultContent.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function updateFallbackCounters() {
  const words = countWords(fallbackInput.value);
  fallbackCount.textContent = `Words: ${words}`;
}

/* ------------------ Rendering ------------------ */

function renderQuestion() {
  const item = items[currentIndex];
  questionNumber.textContent = String(currentIndex + 1);
  textEl.textContent = item.text;
  wordCountEl.textContent = `${countWords(item.text)} words`;
  tipEl.textContent = item.tip || "Read it once silently, then record yourself.";
  transcriptEl.textContent = "Your transcript will appear here.";
  fallbackInput.value = "";
  fallbackWrap.hidden = true;
  updateFallbackCounters();
  resultSection.hidden = true;
  resultContent.innerHTML = "";

  prevButton.disabled = currentIndex === 0;
  nextButton.disabled = currentIndex >= items.length - 1;

  const answeredHere = answered.has(currentIndex);
  const filled = answeredHere
    ? 100
    : Math.round(((currentIndex + 1) / items.length) * 100);
  progressFill.style.width = `${filled}%`;

  clearScreenTimer();
  recordButton.hidden = false;
  stopButton.hidden = true;

  if (mode === "training") {
    setPhase("idle");
    timerEl.textContent = "0:40";
    renderTraining();
    return;
  }

  if (answeredHere) {
    setPhase("done");
    timerEl.textContent = "0:00";
    recordButton.hidden = true;
    return;
  }

  prepareRemaining = PREPARE_SECONDS;
  timerEl.textContent = formatTime(PREPARE_SECONDS);
  startPrepare();
}

function goPrev() {
  if (currentIndex > 0) {
    currentIndex -= 1;
    renderQuestion();
  }
}

function goNext() {
  if (currentIndex < items.length - 1) {
    currentIndex += 1;
    renderQuestion();
  }
}

/* ------------------ Data ------------------ */

async function loadItems() {
  try {
    const response = await fetch("./data/read_aloud.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (Array.isArray(data) && data.length) items = data;
  } catch (error) {
    console.warn("Unable to load data/read_aloud.json, using built-in texts:", error);
  }

  const requested = new URLSearchParams(location.search).get("item");
  if (requested) {
    const index = items.findIndex((item) => item.id === requested);
    if (index >= 0) currentIndex = index;
  }
}

/* ------------------ Events ------------------ */

recordButton.addEventListener("click", beginRecording);
stopButton.addEventListener("click", stopRecording);
playButton.addEventListener("click", playText);
prevButton.addEventListener("click", goPrev);
nextButton.addEventListener("click", goNext);
fallbackInput.addEventListener("input", updateFallbackCounters);
submitFallbackButton.addEventListener("click", () => {
  const text = fallbackInput.value.trim();
  if (!text) return;
  recordSeconds = recordSeconds || Math.round(countWords(text) / 2.8);
  submitAnswer(text);
});
modeTrainButton.addEventListener("click", () => setMode("training"));
modePracticeButton.addEventListener("click", () => setMode("practice"));
goPracticeButton.addEventListener("click", () => setMode("practice"));

/* ------------------ Init ------------------ */

initialize();

async function initialize() {
  await loadItems();
  applyModeVisuals();
  renderQuestion();
  console.log(`Read Aloud ready — ${items.length} texts loaded (mode: ${mode}).`);
}
