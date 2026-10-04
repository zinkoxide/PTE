/*
==========================================
PTE Trainer
Summarize Written Text
==========================================
*/

"use strict";

import { scoreSummary } from "./swt-score.js";
import { buildSwtGuide, renderSwtGuideHTML } from "./swt-guide.js";
import {
  emptyTaskStats,
  normalizeTaskStats,
  recordTaskAttempt
} from "./task-stats.js";

const TIME_PER_QUESTION = 10 * 60;
const SWT_STATS_KEY = "pte.swt.stats.v1";
const SWT_MODE_KEY = "pte.swt.mode";

const fallbackPassages = [{
  id: "renewable-energy",
  title: "The Growth of Renewable Energy",
  passage: "Renewable energy has become an increasingly important source of electricity in many countries. Unlike fossil fuels, renewable sources such as solar and wind power can produce energy with much lower greenhouse gas emissions. They can also reduce dependence on imported fuels and contribute to long-term energy security. However, the expansion of renewable energy requires investment in infrastructure, improvements in electricity storage, and policies that support the transition to cleaner energy systems.",
  reference: "Renewable energy is growing in importance because it generates electricity with lower emissions than fossil fuels and improves energy security, although its expansion depends on investment in infrastructure, storage, and supportive policies.",
  keywords: ["renewable energy", "electricity", "fossil fuels", "lower emissions", "energy security", "investment in infrastructure", "electricity storage", "policies", "transition", "cleaner energy"]
}];

/* ==========================================
   DOM
   ========================================== */

const questionNumber = document.getElementById("question-number");
const timerElement = document.getElementById("timer");
const passage = document.getElementById("passage");
const passageWordCount = document.getElementById("passage-word-count");
const responseInput = document.getElementById("response-input");
const wordCount = document.getElementById("word-count");
const sentenceCount = document.getElementById("sentence-count");
const sentenceStatus = document.getElementById("sentence-status");
const responseHint = document.getElementById("response-hint");
const submitButton = document.getElementById("submit-button");
const clearButton = document.getElementById("clear-button");
const previousButton = document.getElementById("previous-button");
const nextButton = document.getElementById("next-button");
const progressFill = document.getElementById("swt-progress-fill");
const resultSection = document.getElementById("result-section");
const resultContent = document.getElementById("result-content");
const modeTrainButton = document.getElementById("swt-mode-train");
const modePracticeButton = document.getElementById("swt-mode-practice");
const trainingSection = document.getElementById("swt-training");
const trainingContent = document.getElementById("swt-training-content");
const goPracticeButton = document.getElementById("swt-train-go-practice");

/* ==========================================
   State
   ========================================== */

let questions = fallbackPassages;
let currentIndex = 0;
let timeRemaining = TIME_PER_QUESTION;
let timerInterval = null;
let answered = new Set();
let currentMode = localStorage.getItem(SWT_MODE_KEY) || "training";

/* ==========================================
   Helpers
   ========================================== */

function countWords(text) {
  const trimmed = (text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function countSentences(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return 0;
  const matches = trimmed.match(/[.!?]+(?=\s|$)/g);
  return matches ? matches.length : 0;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ==========================================
   Stats (localStorage)
   ========================================== */

function loadStats() {
  try {
    const raw = localStorage.getItem(SWT_STATS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed ? normalizeTaskStats(parsed) : emptyTaskStats();
  } catch (error) {
    console.warn("Unable to load SWT stats:", error);
    return emptyTaskStats();
  }
}

function saveStats(stats) {
  try {
    localStorage.setItem(SWT_STATS_KEY, JSON.stringify(stats));
  } catch (error) {
    console.warn("Unable to save SWT stats:", error);
  }
}

function recordAttempt(item, score) {
  const next = recordTaskAttempt(loadStats(), {
    itemId: item.id,
    title: item.title,
    percent: score.total,
    missedTerms: score.missedPoints || []
  });
  saveStats(next);
}

/* ==========================================
   Timer
   ========================================== */

function updateTimer() {
  timerElement.textContent = formatTime(timeRemaining);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function startTimer() {
  stopTimer();
  timeRemaining = TIME_PER_QUESTION;
  updateTimer();
  responseInput.disabled = false;
  submitButton.disabled = false;
  timerInterval = setInterval(() => {
    timeRemaining -= 1;
    updateTimer();
    if (timeRemaining <= 0) {
      timeRemaining = 0;
      updateTimer();
      stopTimer();
      responseInput.disabled = true;
      submitButton.disabled = true;
      responseHint.textContent = "Time is up.";
      if (!answered.has(currentIndex)) {
        submitAnswer(true);
      }
    }
  }, 1000);
}

/* ==========================================
   Response analysis
   ========================================== */

function updateResponseInfo() {
  const text = responseInput.value;
  const words = countWords(text);
  const sentences = countSentences(text);

  wordCount.textContent = `Words: ${words} / 75`;
  sentenceCount.textContent = `Sentences: ${sentences}`;

  responseInput.classList.remove("is-valid", "is-invalid");

  if (words === 0) {
    sentenceStatus.textContent = "One sentence required";
    responseHint.textContent = "Write between 5 and 75 words.";
    return;
  }

  if (words < 5 || words > 75) {
    responseInput.classList.add("is-invalid");
    responseHint.textContent = "Your response must contain 5–75 words.";
  } else {
    responseInput.classList.add("is-valid");
    responseHint.textContent = "Word count is within the allowed range.";
  }

  if (sentences === 1) {
    sentenceStatus.textContent = "✓ One sentence";
  } else if (sentences === 0) {
    sentenceStatus.textContent = "One sentence required";
  } else {
    sentenceStatus.textContent = `${sentences} sentences — one sentence required`;
  }
}

/* ==========================================
   Mode (Training / Practice)
   ========================================== */

function applyModeVisuals() {
  document.body.classList.toggle("swt-training-mode", currentMode === "training");
  modeTrainButton.classList.toggle("is-on", currentMode === "training");
  modePracticeButton.classList.toggle("is-on", currentMode === "practice");
  trainingSection.hidden = currentMode !== "training";
}

function setMode(mode) {
  currentMode = mode;
  try {
    localStorage.setItem(SWT_MODE_KEY, mode);
  } catch (error) {
    console.warn("Unable to save SWT mode:", error);
  }
  applyModeVisuals();
  renderQuestion();
}

function showTraining() {
  const item = questions[currentIndex];
  const guide = buildSwtGuide(item);
  trainingContent.innerHTML = renderSwtGuideHTML(item, guide);
}

/* ==========================================
   Question rendering
   ========================================== */

function renderQuestion() {
  const item = questions[currentIndex];
  questionNumber.textContent = String(currentIndex + 1);
  passage.textContent = item.passage.trim();
  passageWordCount.textContent = `${countWords(item.passage)} words`;

  resultSection.hidden = true;
  resultContent.innerHTML = "";

  previousButton.disabled = currentIndex === 0;
  nextButton.disabled = currentIndex >= questions.length - 1;

  const filled = answered.has(currentIndex) ? 100 : Math.round(((currentIndex + 1) / questions.length) * 100);
  progressFill.style.width = `${filled}%`;

  if (currentMode === "training") {
    stopTimer();
    showTraining();
    return;
  }

  responseInput.value = "";
  updateResponseInfo();

  if (answered.has(currentIndex)) {
    stopTimer();
    responseInput.disabled = true;
    submitButton.disabled = true;
    responseHint.textContent = "Question already answered — use Next to continue.";
    return;
  }

  startTimer();
}

/* Allow deep links such as swt.html?item=swt-003 (used by the dashboard). */
function applyRequestedItem() {
  const requested = new URLSearchParams(location.search).get("item");
  if (!requested) return;
  const index = questions.findIndex((question) => question.id === requested);
  if (index >= 0) currentIndex = index;
}

async function loadQuestions() {
  try {
    const response = await fetch("./data/swt.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (Array.isArray(data) && data.length) questions = data;
  } catch (error) {
    console.warn("Unable to load data/swt.json, using built-in passage:", error);
  }
  applyRequestedItem();
  renderQuestion();
}

/* ==========================================
   Submit
   ========================================== */

function submitAnswer(autoSubmit) {
  if (answered.has(currentIndex)) return;

  const text = responseInput.value.trim();
  const item = questions[currentIndex];
  const score = scoreSummary(item, text);

  stopTimer();
  answered.add(currentIndex);
  responseInput.disabled = true;
  submitButton.disabled = true;
  progressFill.style.width = "100%";

  recordAttempt(item, score);

  const criteriaRows = Object.entries(score.criteria)
    .map(
      ([name, value]) =>
        `<div class="swt-criterion">` +
        `<span class="swt-criterion-name">${name}</span>` +
        `<span class="swt-criterion-bar"><i style="width:${(value / 2) * 100}%"></i></span>` +
        `<span class="swt-criterion-value">${value.toFixed(1)} / 2</span>` +
        `</div>`
    )
    .join("");

  const leftover = score.words === 0
    ? "<div class=\"swt-result-empty\">No response submitted — provide a summary before submitting.</div>"
    : "";

  resultSection.hidden = false;
  resultContent.innerHTML =
    `<div class="swt-result-total ${score.total >= 70 ? "is-good" : score.total >= 50 ? "is-mid" : "is-low"}">` +
    `<span class="swt-result-score">${score.total}</span>` +
    `<span class="swt-result-label">/ 100 ${autoSubmit ? "· time up" : ""}</span>` +
    `</div>` +
    `<div class="swt-criteria">${criteriaRows}</div>` +
    `<div class="swt-result-details">` +
    `<p><strong>Words:</strong> ${score.words} · <strong>Sentences:</strong> ${score.sentences} · ` +
    `<strong>Keyword coverage:</strong> ${score.hits}/${score.keywordTotal}</p>` +
    `<p>${escapeHTML(score.formReason)}</p>` +
    (score.grammarIssues.length
      ? `<p class="swt-warn">${escapeHTML(score.grammarIssues.join(" · "))}</p>`
      : "") +
    `</div>` +
    `<details class="swt-reference">` +
    `<summary>Model answer</summary>` +
    `<p class="swt-reference-text">${escapeHTML(item.reference)}</p>` +
    `</details>` +
    leftover;

  resultContent.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ==========================================
   Clear
   ========================================== */

function clearResponse() {
  if (answered.has(currentIndex)) return;
  responseInput.value = "";
  updateResponseInfo();
  resultSection.hidden = true;
  responseInput.focus();
}

/* ==========================================
   Navigation
   ========================================== */

function goToPrevious() {
  if (currentIndex > 0) {
    currentIndex -= 1;
    renderQuestion();
  }
}

function goToNext() {
  if (currentIndex < questions.length - 1) {
    currentIndex += 1;
    renderQuestion();
  }
}

/* ==========================================
   Events
   ========================================== */

responseInput.addEventListener("input", updateResponseInfo);
submitButton.addEventListener("click", () => submitAnswer(false));
clearButton.addEventListener("click", clearResponse);
previousButton.addEventListener("click", goToPrevious);
nextButton.addEventListener("click", goToNext);
modeTrainButton.addEventListener("click", () => setMode("training"));
modePracticeButton.addEventListener("click", () => setMode("practice"));
goPracticeButton.addEventListener("click", () => setMode("practice"));

/* ==========================================
   Initialize
   ========================================== */

initialize();

async function initialize() {
  updateTimer();
  applyModeVisuals();
  await loadQuestions();
  console.log(`SWT ready — ${questions.length} passages loaded (mode: ${currentMode}).`);
}