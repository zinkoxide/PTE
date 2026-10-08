/*
==========================================
PTE Trainer
Describe Image
Mastery: look at a chart / graph / table /
map / diagram, prepare for 25 seconds, then
describe it aloud in 40 seconds.
==========================================
*/

"use strict";

import { renderImage, CATEGORY_LABELS } from "./di-render.js";
import { scoreDescription } from "./di-score.js";
import { buildGuide, renderGuideHTML } from "./di-guide.js";
import { SpeechEngine } from "./speech.js";
import {
  emptyTaskStats,
  normalizeTaskStats,
  recordTaskAttempt,
  describeDue
} from "./task-stats.js";
import { toOfficialScore, describeBand } from "./pte-scale.js";
import {
  isExamMode,
  setExamMode,
  shouldWarn,
  detailTermsFor
} from "./exam-mode.js";

const PREPARE_SECONDS = 25;
const SPEAK_SECONDS = 40;
const DI_STATS_KEY = "pte.di.stats.v1";
const DI_MODE_KEY = "pte.di.mode";

const fallbackImages = [];

/* ------------------ DOM ------------------ */

const $ = (id) => document.getElementById(id);

const qNumber = $("di-question-number");
const phasePill = $("di-phase-pill");
const timerEl = $("di-timer");
const progressFill = $("di-progress-fill");
const examButton = $("di-exam-toggle");
const imageTitle = $("di-image-title");
const imageBox = $("di-image-box");
const hint = $("di-hint");
const recordButton = $("di-record-button");
const stopButton = $("di-stop-button");
const transcriptBox = $("di-transcript");
const wordCountEl = $("di-word-count");
const fallbackWrap = $("di-fallback-wrap");
const fallbackInput = $("di-fallback-input");
const submitFallback = $("di-submit-fallback");
const prevButton = $("di-previous-button");
const nextButton = $("di-next-button");
const resultSection = $("di-result-section");
const resultContent = $("di-result-content");
const trainBtn = $("di-mode-train");
const practiceBtn = $("di-mode-practice");
const trainingSection = $("di-training");
const trainingContent = $("di-training-content");
const trainCta = $("di-train-go-practice");

/* ------------------ Mode (Training / Practice) ------------------ */

let mode = loadMode();

function loadMode() {
  try {
    const stored = localStorage.getItem(DI_MODE_KEY);
    if (stored === "training" || stored === "practice") return stored;
  } catch {}
  return "training";
}

function saveMode(value) {
  try {
    localStorage.setItem(DI_MODE_KEY, value);
  } catch {}
}

function applyModeVisuals() {
  const training = mode === "training";
  trainBtn.classList.toggle("is-on", training);
  practiceBtn.classList.toggle("is-on", !training);
  document.body.classList.toggle("di-training-mode", training);
  document.body.classList.toggle("exam-mode", isExamMode());
  if (examButton) examButton.classList.toggle("is-on", isExamMode());
}

function toggleExamMode() {
  setExamMode(!isExamMode());
  applyModeVisuals();
}

function showTraining() {
  const item = images[currentIndex];
  if (!item) return;
  trainingSection.hidden = false;
  trainingContent.innerHTML = renderGuideHTML(item, buildGuide(item));
  hint.textContent = "Study the method for this image, then switch to Practice when you are ready.";
  recordButton.hidden = true;
  stopButton.hidden = true;
  showFallback(false);
}

function setMode(next) {
  if (mode === next) return;
  mode = next;
  saveMode(mode);
  applyModeVisuals();
  clearScreenTimer();
  stopSpeaking();
  if (mode === "training") {
    resultSection.hidden = true;
    showTraining();
  } else {
    trainingSection.hidden = true;
    renderQuestion();
  }
}

trainBtn.addEventListener("click", () => setMode("training"));
practiceBtn.addEventListener("click", () => setMode("practice"));
trainCta.addEventListener("click", () => setMode("practice"));

/* ------------------ State ------------------ */

let images = fallbackImages;
let currentIndex = 0;
let phase = "idle"; // idle | prepare | speak | done
let prepRemaining = PREPARE_SECONDS;
let speakRemaining = SPEAK_SECONDS;
let screenTimer = null;
let answered = new Set();
let speech = new SpeechEngine();
let supported = speech.isSupported();

/* ------------------ Stats ------------------ */

function loadStats() {
  try {
    const raw = localStorage.getItem(DI_STATS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed ? normalizeTaskStats(parsed) : emptyTaskStats();
  } catch {
    return emptyTaskStats();
  }
}

function recordAttempt(item, score) {
  const next = recordTaskAttempt(loadStats(), {
    itemId: item.id,
    title: item.title,
    percent: score.total,
    missedTerms: detailTermsFor(score, isExamMode())
  });
  try {
    localStorage.setItem(DI_STATS_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("Unable to save DI stats:", error);
  }
}

/*
The weak-item tracker schedules a failed item to come back (1, 3, 7 then 14
days). Saying so immediately turns a low score into a plan.
*/
function scheduleNotice(item) {
  const entry = (loadStats().missed || {})[item.id];
  const schedule = describeDue(entry);
  if (!schedule) return "";
  return `<p class="di-schedule-note">🔁 ${escapeHTML(schedule.label)} — سيُعاد طرح هذا البند للمراجعة.</p>`;
}

/* ------------------ Timing helpers ------------------ */

function formatTime(seconds) {
  return `0:${String(seconds).padStart(2, "0")}`;
}

function clearScreenTimer() {
  if (screenTimer) {
    clearInterval(screenTimer);
    screenTimer = null;
  }
}

function setPhase(next) {
  phase = next;
  phasePill.textContent =
    next === "prepare" ? `Prepare ${formatTime(prepRemaining)}`
    : next === "speakready" ? "Speak ready"
    : next === "speak" ? `Speak ${formatTime(speakRemaining)}`
    : next === "type" ? "Write your answer"
    : "Scored";
  phasePill.className =
    "di-phase-pill " +
    (next === "speak" ? "is-speak"
      : next === "prepare" ? "is-prepare"
      : next === "speakready" ? "is-ready"
      : next === "type" ? "is-type"
      : "is-done");
}

function updateProgress() {
  const total = PREPARE_SECONDS + SPEAK_SECONDS;
  const elapsedPrep = PREPARE_SECONDS - prepRemaining;
  const elapsedSpeak = phase === "speak" ? SPEAK_SECONDS - speakRemaining : 0;
  const done = phase === "done" ? 1 : (elapsedPrep + elapsedSpeak) / total;
  progressFill.style.width = `${Math.round(done * 100)}%`;
}

/* ------------------ Speech glue ------------------ */

function startSpeaking() {
  if (!supported) return;
  if (speech.isListening) return;
  try {
    speech.setContinuous(true);
    speech.reset();
    speech.onStart = () => {
      transcriptBox.textContent = "Listening…";
      transcriptBox.classList.add("is-live");
    };
    speech.onResult = (transcript) => {
      transcriptBox.textContent = transcript || "Listening…";
      updateWordCount(transcript);
    };
    speech.onError = (error) => {
      transcriptBox.classList.remove("is-live");
      if (error === "not-allowed" || error === "service-not-allowed") {
        hint.textContent = "Microphone access was denied — use the text box below instead.";
        showFallback(true);
      }
    };
    speech.onEnd = () => {
      transcriptBox.classList.remove("is-live");
    };
    speech.start();
  } catch (error) {
    showFallback(true);
  }
}

function stopSpeaking() {
  try {
    speech.stop();
  } catch {}
}

function updateWordCount(text) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  wordCountEl.textContent = `Words: ${words} / ${SPEAK_SECONDS * 1.5}`;
}

/* ------------------ Fallback (no mic) ------------------ */

function showFallback(visible) {
  fallbackWrap.hidden = !visible;
  stopButton.hidden = visible;
  if (visible) recordButton.hidden = true;
}

function currentText() {
  if (supported && fallbackWrap.hidden) return speech.transcript;
  return fallbackInput.value;
}

/* ------------------ Phases ------------------ */

/* The exam warning only appears under exam conditions. */
function markTimer(secondsLeft) {
  const warn = isExamMode() && shouldWarn(secondsLeft);
  timerEl.classList.toggle("is-warning", warn);
  timerEl.classList.toggle("is-out", secondsLeft <= 0);
}

function beginPrepare() {
  setPhase("prepare");
  prepRemaining = PREPARE_SECONDS;
  timerEl.textContent = formatTime(prepRemaining);
  markTimer(prepRemaining);
  hint.textContent = "Study the image. The microphone will be ready after the countdown.";
  updateProgress();
  clearScreenTimer();
  screenTimer = setInterval(() => {
    prepRemaining -= 1;
    timerEl.textContent = formatTime(prepRemaining);
    markTimer(prepRemaining);
    setPhase("prepare");
    updateProgress();
    if (prepRemaining <= 0) endPrepare();
  }, 1000);
}

function endPrepare() {
  clearScreenTimer();
  if (supported) {
    speakRemaining = SPEAK_SECONDS;
    setPhase("speakready");
    phasePill.className = "di-phase-pill is-ready";
    timerEl.textContent = formatTime(speakRemaining);
    markTimer(speakRemaining);
    recordButton.hidden = false;
    hint.textContent = "Press Start Speaking and describe the image out loud.";
  } else {
    showFallback(true);
    fallbackInput.value = "";
    fallbackInput.focus();
    setPhase("type");
    phasePill.className = "di-phase-pill is-type";
    timerEl.textContent = "--:--";
    hint.textContent = "Describe the image in 1–3 sentences (ideally 15–60 words).";
  }
}

function beginSpeaking() {
  clearScreenTimer();
  speakRemaining = SPEAK_SECONDS;
  setPhase("speak");
  timerEl.textContent = formatTime(speakRemaining);
  recordButton.hidden = true;
  stopButton.hidden = false;
  hint.textContent = "Keep speaking — you have 40 seconds.";
  startSpeaking();
  updateProgress();
  screenTimer = setInterval(() => {
    speakRemaining -= 1;
    timerEl.textContent = formatTime(speakRemaining);
    markTimer(speakRemaining);
    setPhase("speak");
    updateProgress();
    if (speakRemaining <= 0) finishAttempt();
  }, 1000);
}

function finishAttempt() {
  clearScreenTimer();
  stopSpeaking();
  setPhase("done");
  updateProgress();
  const text = currentText();
  if (supported) {
    transcriptBox.textContent = text || "(no speech recognized)";
    if (!text) showFallback(true);
  }
  scoreAndShow(text);
}

/* ------------------ Fallback typing ------------------ */

function updateFallbackCounters() {
  const text = fallbackInput.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  wordCountEl.textContent = `Words: ${words} / ${SPEAK_SECONDS * 1.5}`;
}

function submitFallbackText() {
  if (answered.has(currentIndex)) return;
  finishAttempt();
}

/* ------------------ Scoring ------------------ */

function scoreAndShow(text) {
  if (answered.has(currentIndex)) return;
  const item = images[currentIndex];
  const score = scoreDescription(item, text);

  answered.add(currentIndex);
  stopSpeaking();
  clearScreenTimer();
  recordAttempt(item, score);

  if ($("di-record-button")) recordButton.hidden = true;
  stopButton.hidden = true;

  setPhase("done");
  updateProgress();
  timerEl.textContent = "0:00";

  const criteriaRows = Object.entries(score.criteria)
    .map(
      ([name, value]) =>
        `<div class="di-criterion">` +
        `<span class="di-criterion-name">${name}</span>` +
        `<span class="di-criterion-bar"><i style="width:${(value / 2) * 100}%"></i></span>` +
        `<span class="di-criterion-value">${value.toFixed(1)} / 2</span>` +
        `</div>`
    )
    .join("");

  const exam = isExamMode();

  const emptyNote = !exam && text.trim() === ""
    ? `<div class="di-result-empty">No response — produce a complete description and try again.</div>`
    : "";

  const officialScore = toOfficialScore(score.total);
  const official = { score: officialScore, band: describeBand(officialScore) };

  resultSection.hidden = false;
  resultContent.innerHTML =
    `<div class="di-result-total ${score.total >= 70 ? "is-good" : score.total >= 50 ? "is-mid" : "is-low"}">` +
    `<span class="di-result-score">${score.total}</span>` +
    `<span class="di-result-label">/ 100</span>` +
    `<span class="pte-official is-${official.band.tone}">≈ ${official.score} / 90 · ${official.band.label}</span>` +
    `</div>` +
    `<div class="di-criteria">${criteriaRows}</div>` +
    (exam ? "" : scheduleNotice(item)) +
    (exam
      ? ""
      : `<div class="di-result-details">` +
        `<p><strong>Words:</strong> ${score.words} · <strong>Keywords:</strong> ${score.hits}/${score.keywordTotal}</p>` +
        `<p>${escapeHTML(score.fluencyReason)}</p>` +
        `<p>${escapeHTML(score.vocabularyReason)}</p>` +
        `</div>` +
        `<div class="di-reference"><strong>Model answer</strong><p>${escapeHTML(item.reference)}</p></div>`) +
    emptyNote;

  resultContent.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ------------------ Rendering ------------------ */

async function loadImages() {
  try {
    const response = await fetch("./data/describe-images.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (Array.isArray(data) && data.length) images = data;
  } catch (error) {
    console.warn("Unable to load data/describe-images.json:", error);
  }
}

/* Allow deep links such as describe-image.html?item=tourism-quarters. */
function applyRequestedItem() {
  const requested = new URLSearchParams(location.search).get("item");
  if (!requested) return;
  const index = images.findIndex((image) => image.id === requested);
  if (index >= 0) currentIndex = index;
}

function renderQuestion() {
  clearScreenTimer();
  stopSpeaking();
  fallbackWrap.hidden = true;
  fallbackInput.value = "";
  transcriptBox.textContent = "…";
  wordCountEl.textContent = "Words: 0 / 60";

  const item = images[currentIndex];
  if (!item) {
    imageBox.innerHTML = "<p class=\"di-none\">No images available to practice.</p>";
    return;
  }

  qNumber.textContent = String(currentIndex + 1);
  imageTitle.textContent = item.title;
  const categoryLabel = CATEGORY_LABELS[item.category] || item.category;
  imageTitle.dataset.category = categoryLabel;
  imageBox.innerHTML = renderImage(item);

  prevButton.disabled = currentIndex === 0;
  nextButton.disabled = currentIndex >= images.length - 1;

  resultSection.hidden = true;
  resultContent.innerHTML = "";

  if (mode === "training") {
    showTraining();
    return;
  }

  if (answered.has(currentIndex)) {
    setPhase("done");
    timerEl.textContent = "0:00";
    progressFill.style.width = "100%";
    hint.textContent = "This image was already scored — use Next to continue.";
    recordButton.hidden = true;
    stopButton.hidden = true;
    showFallback(false);
    return;
  }

  fallbackInput.disabled = false;
  if (supported) {
    recordButton.hidden = true;
    stopButton.hidden = true;
  } else {
    showFallback(false);
  }
  beginPrepare();
}

/* ------------------ Navigation ------------------ */

function goPrev() {
  if (currentIndex > 0) {
    currentIndex -= 1;
    renderQuestion();
  }
}

function goNext() {
  if (currentIndex < images.length - 1) {
    currentIndex += 1;
    renderQuestion();
  }
}

/* ------------------ Events ------------------ */

recordButton.addEventListener("click", beginSpeaking);
stopButton.addEventListener("click", () => finishAttempt(false));
submitFallback.addEventListener("click", submitFallbackText);
fallbackInput.addEventListener("input", updateFallbackCounters);
prevButton.addEventListener("click", goPrev);
nextButton.addEventListener("click", goNext);

/* ------------------ Init ------------------ */

initialize();

async function initialize() {
  await loadImages();
  applyRequestedItem();
  applyModeVisuals();
  renderQuestion();
  console.log(`Describe Image ready — ${images.length} images loaded (mode: ${mode}).`);
}