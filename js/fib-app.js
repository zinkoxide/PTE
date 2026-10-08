/*
==========================================
PTE Trainer
Fill in the Blanks
==========================================

Two things make this task different from the
other task pages:

  1. The items are built from the learner's own
     word bank (see fib.js), so there is no data
     file to fall out of date and no item can
     repeat itself.
  2. It is scored per blank, like the exam: one
     mark for each gap, nothing for a partly
     right sentence.

Training mode answers immediately and explains,
because that is where the grammar is learnt.
Practice mode keeps quiet until the end. Exam
conditions add the third wall: no explanation,
no answer, not even a "wrong" tick.
==========================================
*/

"use strict";

import { loadVocabulary, getWordAudio } from "./vocabulary.js";
import {
  buildFibSet,
  scoreFibSet,
  isCorrect,
  BLANK
} from "./fib.js";
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
  shouldWarn
} from "./exam-mode.js";
import { playAudio, stopAudio } from "./audio.js";

/* The exam allows about ten seconds a blank; this is the practice default. */
const SECONDS_PER_BLANK = 15;
const FIB_STATS_KEY = "pte.fib.stats.v1";
const FIB_MODE_KEY = "pte.fib.mode";

const THREE_STEPS = [
  {
    title: "1 · Read the whole sentence first",
    body: "The gap is decided by the sentence, not by the word list. Read it as if the word were already there and notice what the sentence needs: a plural, a past tense, a verb after a modal."
  },
  {
    title: "2 · Say the options in place",
    body: "Put each option into the gap and read the sentence aloud. The wrong forms are usually grammatical in themselves — they simply do not belong to that position, and only the sentence can tell you."
  },
  {
    title: "3 · Use the form the sentence is asking for",
    body: "The bank stores \"benefit\"; the sentence may need \"benefited\". The answer is always the form the sentence itself uses, which is why listening alone will not carry you."
  }
];

const TIPS = [
  "Check the word before the gap: \"has\" and \"have\" decide the plural for you.",
  "A noun that is the object of a preposition rarely takes an ending at all.",
  "Answer every blank — an empty one scores the same as a wrong one, and a guess costs nothing.",
  "Read the bank's own example sentence when you are stuck; the answer is in it."
];

const AVOID = [
  "Do not choose the option that merely looks like the others.",
  "Do not leave a blank because you are unsure — there is no penalty for a guess.",
  "Do not stop the timer to think; the next blank may be easier."
];

const $ = (id) => document.getElementById(id);

/* ------------------ DOM ------------------ */

const setupCard = $("fib-setup-card");
const statusCard = $("fib-status-card");
const sentenceCard = $("fib-sentence-card");
const trainingCard = $("fib-training");
const resultSection = $("fib-result-section");

const bankPill = $("fib-bank-pill");
const modeSelect = $("fib-mode-select");
const countSelect = $("fib-count-select");
const choicesSelect = $("fib-choices-select");
const cefrSelect = $("fib-cefr-select");
const setupStatus = $("fib-setup-status");
const startButton = $("fib-start");

const questionNumber = $("fib-question-number");
const questionTotal = $("fib-question-total");
const timerEl = $("fib-timer");
const progressFill = $("fib-progress-fill");
const sentenceEl = $("fib-sentence");
const wordPill = $("fib-word-pill");
const playButton = $("fib-play-button");
const sentenceHint = $("fib-sentence-hint");
const optionsBox = $("fib-options");
const trainingContent = $("fib-training-content");
const nextButton = $("fib-next");
const resultContent = $("fib-result-content");

const modeTrainButton = $("fib-mode-train");
const modePracticeButton = $("fib-mode-practice");
const goPracticeButton = $("fib-train-go-practice");
const examButton = $("fib-exam-toggle");

/* ------------------ State ------------------ */

let bank = [];
let items = [];
let answers = {};
let currentIndex = 0;
let mode = localStorage.getItem(FIB_MODE_KEY) || "training";
let secondsLeft = SECONDS_PER_BLANK;
let screenTimer = null;
let answeredCount = 0;

function escapeHTML(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTime(seconds) {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/* The gap is rendered as a marked span so the learner can see it is a gap,
   not a missing word the page failed to load. */
function renderSentence(sentence) {
  return escapeHTML(sentence).split(escapeHTML(BLANK)).join(
    `<span class="fib-blank">${escapeHTML(BLANK)}</span>`
  );
}

/* ------------------ Stats ------------------ */

function loadStats() {
  try {
    const raw = localStorage.getItem(FIB_STATS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed ? normalizeTaskStats(parsed) : emptyTaskStats();
  } catch {
    return emptyTaskStats();
  }
}

/*
One record per blank, not per set: the weak-item panel then lists the words
you actually keep missing, and clicking one in the dashboard sends you back
here with that word queued.
*/
function recordBlanks(score) {
  let stats = loadStats();
  score.results.forEach((result) => {
    stats = recordTaskAttempt(stats, {
      itemId: result.word.toLowerCase(),
      title: result.sentence,
      percent: result.correct ? 100 : 0,
      missedTerms: result.correct ? [] : [result.given || "—"]
    });
  });
  try {
    localStorage.setItem(FIB_STATS_KEY, JSON.stringify(stats));
  } catch (error) {
    console.warn("Unable to save Fill in the Blanks stats:", error);
  }
}

/* ------------------ Timer ------------------ */

function clearScreenTimer() {
  if (screenTimer) {
    clearInterval(screenTimer);
    screenTimer = null;
  }
}

function startTimer() {
  clearScreenTimer();
  secondsLeft = SECONDS_PER_BLANK;
  timerEl.textContent = formatTime(secondsLeft);
  timerEl.classList.remove("is-warning", "is-out");

  screenTimer = setInterval(() => {
    secondsLeft -= 1;
    timerEl.textContent = formatTime(secondsLeft);
    timerEl.classList.toggle("is-warning", shouldWarn(secondsLeft));
    timerEl.classList.toggle("is-out", secondsLeft <= 0);
    if (secondsLeft <= 0) {
      /* The exam does not wait for you: a blank left when the time is up is
         marked wrong and the next one opens. */
      choose(null, true);
    }
  }, 1000);
}

/* ------------------ Training mode ------------------ */

function renderTraining() {
  const item = items[currentIndex];
  const frames = item
    ? [
      "Find the word that <i>governs</i> the gap (a modal, an auxiliary, a preposition).",
      "Say every option in the gap — one of them will sound wrong immediately.",
      "The answer is the form this sentence uses, not the form the bank lists."
    ]
    : [];

  trainingContent.innerHTML =
    `<div class="fib-training-card">` +
    `<div class="fib-training-hero">` +
    `<div class="fib-training-title">How to fill a gap</div>` +
    `<p class="fib-training-sub">The sentence is the exam; the word list is only a distraction.</p>` +
    `</div>` +
    `<div class="fib-steps">` +
    THREE_STEPS.map(
      (step) =>
        `<div class="fib-step">` +
        `<div class="fib-step-head"><span class="fib-step-tag">${step.title.split(" ")[0]}</span>` +
        `<strong>${escapeHTML(step.title.slice(step.title.indexOf(" ") + 1))}</strong></div>` +
        `<p>${escapeHTML(step.body)}</p>` +
        `</div>`
    ).join("") +
    `</div>` +
    (frames.length
      ? `<div class="fib-panel">` +
        `<h4>Before you choose</h4>` +
        `<ul class="fib-tips">${frames.map((frame) => `<li>${frame}</li>`).join("")}</ul>` +
        `</div>`
      : "") +
    `<div class="fib-panel">` +
    `<h4>Do &amp; don't</h4>` +
    `<p class="fib-tips-label">✓ Do</p><ul class="fib-tips">${TIPS.map((tip) => `<li>${escapeHTML(tip)}</li>`).join("")}</ul>` +
    `<p class="fib-tips-label is-avoid">✗ Don't</p><ul class="fib-tips is-avoid">${AVOID.map((avoid) => `<li>${escapeHTML(avoid)}</li>`).join("")}</ul>` +
    `</div>` +
    `</div>`;
}

/* ------------------ Views ------------------ */

function applyModeVisuals() {
  document.body.classList.toggle("fib-training-mode", mode === "training");
  document.body.classList.toggle("exam-mode", isExamMode());
  if (examButton) examButton.classList.toggle("is-on", isExamMode());
  modeTrainButton.classList.toggle("is-on", mode === "training");
  modePracticeButton.classList.toggle("is-on", mode === "practice");
}

function setMode(next) {
  mode = next;
  try {
    localStorage.setItem(FIB_MODE_KEY, mode);
  } catch {
    /* storage may be unavailable; the switch still works for this session */
  }
  applyModeVisuals();
  if (items.length) {
    renderQuestion();
  } else {
    setupCard.hidden = false;
  }
}

function toggleExamMode() {
  setExamMode(!isExamMode());
  applyModeVisuals();
  if (items.length && !answeredCount) renderQuestion();
}

/* ------------------ Playing a blank ------------------ */

function playWordAudio() {
  const item = items[currentIndex];
  if (!item || !item.audio) return;
  stopAudio();
  playAudio(`./${item.audio}`);
}

function renderOptions(item) {
  optionsBox.innerHTML = "";
  item.options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fib-option";
    button.textContent = option;
    button.addEventListener("click", () => choose(option));
    optionsBox.appendChild(button);
  });
}

function renderQuestion() {
  const item = items[currentIndex];
  if (!item) return;

  clearScreenTimer();
  stopAudio();

  questionNumber.textContent = String(currentIndex + 1);
  questionTotal.textContent = `/ ${items.length}`;
  sentenceEl.innerHTML = renderSentence(item.sentence);
  wordPill.textContent = `${item.word} · ${item.cefrLevel || "—"}`;

  const listening = item.mode === "audio" && item.audio;
  playButton.hidden = !listening;
  sentenceHint.textContent = listening
    ? "استمع ثم اختر الكلمة التي سمعتها."
    : "اختر الصيغة التي يناسبها موضع الفراغ.";

  renderOptions(item);

  nextButton.hidden = true;
  const filled = Math.round((answeredCount / Math.max(1, items.length)) * 100);
  progressFill.style.width = `${filled}%`;

  if (mode === "training") {
    timerEl.textContent = "—";
    timerEl.classList.remove("is-warning", "is-out");
    renderTraining();
    return;
  }

  startTimer();
}

/* ------------------ Answering ------------------ */

function choose(option, timedOut = false) {
  const item = items[currentIndex];
  if (!item || answers[currentIndex] !== undefined) return;

  clearScreenTimer();
  answers[currentIndex] = option == null ? "" : option;
  answeredCount += 1;

  const correct = isCorrect(item, option);
  const exam = isExamMode();
  const reveal = mode === "training" && !exam;

  /* The blank is answered: the buttons lock either way, so a fast click on
     the next option cannot change an answer that is already recorded. */
  Array.from(optionsBox.children).forEach((button) => {
    button.disabled = true;
  });

  if (reveal) {
    Array.from(optionsBox.children).forEach((button) => {
      const text = button.textContent;
      if (text.toLowerCase() === item.answer.toLowerCase()) {
        button.classList.add("is-correct");
      } else if (text === option) {
        button.classList.add("is-wrong");
        const tag = document.createElement("span");
        tag.className = "fib-option-tag";
        tag.textContent = timedOut ? "انتهى الوقت" : "اختيارك";
        button.appendChild(tag);
      }
    });
    sentenceHint.textContent = item.tip;
    progressFill.style.width = `${Math.round((answeredCount / Math.max(1, items.length)) * 100)}%`;

    if (correct) {
      window.setTimeout(() => goNext(), 700);
    } else {
      nextButton.hidden = false;
    }
    return;
  }

  window.setTimeout(() => goNext(), 220);
}

function goNext() {
  if (currentIndex < items.length - 1) {
    currentIndex += 1;
    renderQuestion();
    return;
  }
  finishSet();
}

/* ------------------ Results ------------------ */

function reviewRow(result) {
  const mark = result.correct ? "✅" : "❌";
  const detail = result.correct
    ? escapeHTML(result.word)
    : `الإجابة الصحيحة <strong>${escapeHTML(result.answer)}</strong>${
      result.given ? ` — كتبتَ <strong>${escapeHTML(result.given)}</strong>` : " — لم تُجب"
    }`;

  return (
    `<div class="fib-review-row ${result.correct ? "is-good" : "is-bad"}">` +
    `<span class="fib-review-mark">${mark}</span>` +
    `<div class="fib-review-main">` +
    `<div class="fib-review-sentence">${escapeHTML(result.sentence)}</div>` +
    `<div class="fib-review-detail">${detail}</div>` +
    `</div>` +
    `<span class="fib-review-answer ${result.correct ? "is-good" : "is-bad"}">${escapeHTML(result.word)}</span>` +
    `</div>`
  );
}

function finishSet() {
  clearScreenTimer();
  stopAudio();

  const score = scoreFibSet(items, answers);
  recordBlanks(score);

  const officialScore = toOfficialScore(score.percent);
  const band = describeBand(officialScore);
  const missed = score.results.filter((result) => !result.correct);

  const schedule = missed.length
    ? (() => {
      const entry = (loadStats().missed || {})[missed[0].word.toLowerCase()];
      return describeDue(entry);
    })()
    : null;

  resultSection.hidden = false;
  resultContent.innerHTML =
    `<div class="fib-result-total">` +
    `<span class="fib-result-score ${score.percent >= 70 ? "is-good" : score.percent >= 50 ? "is-mid" : "is-low"}">${score.percent}</span>` +
    `<span class="fib-result-label">/ 100 · ${score.correct} من ${score.total}</span>` +
    `<span class="pte-official is-${band.tone}">≈ ${officialScore} / 90 · ${band.label}</span>` +
    `</div>` +
    (schedule
      ? `<p class="fib-schedule-note">🔁 ${escapeHTML(schedule.label)} — سيُعاد طرح هذه الكلمات للمراجعة.</p>`
      : "") +
    (isExamMode()
      ? ""
      : `<div class="fib-review">${score.results.map(reviewRow).join("")}</div>`);

  statusCard.hidden = true;
  sentenceCard.hidden = true;
  trainingCard.hidden = true;
  resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ------------------ Starting a set ------------------ */

function startSet() {
  const cefr = cefrSelect.value;
  const pool = cefr ? bank.filter((word) => word.cefrLevel === cefr) : bank;

  const set = buildFibSet(pool, {
    mode: modeSelect.value,
    choices: Number(choicesSelect.value),
    count: Number(countSelect.value),
    audioOf: getWordAudio
  });

  if (!set.length) {
    setupStatus.textContent = pool.length
      ? "لا يوجد ما يكفي لبناء مجموعة — جرّب مستوى أقل أو نوعاً آخر."
      : "بنك المفردات غير محمّل بعد.";
    return;
  }

  items = set;
  answers = {};
  currentIndex = 0;
  answeredCount = 0;

  setupCard.hidden = true;
  statusCard.hidden = false;
  sentenceCard.hidden = false;
  resultSection.hidden = true;
  trainingCard.hidden = mode !== "training";

  setupStatus.textContent = `${items.length} blanks ready.`;
  renderQuestion();
  sentenceCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ------------------ Data ------------------ */

async function loadBank() {
  bank = await loadVocabulary();
  bankPill.textContent = `${bank.length} words`;

  /* A weak word clicked from the dashboard arrives as ?item=word. */
  const requested = new URLSearchParams(location.search).get("item");
  if (requested) {
    const word = bank.find(
      (entry) => String(entry.word).toLowerCase() === String(requested).toLowerCase()
    );
    if (word) {
      modeSelect.value = word.audio || getWordAudio(word.word) ? "audio" : "form";
      countSelect.value = "5";
    }
  }
}

/* ------------------ Events ------------------ */

startButton.addEventListener("click", startSet);
nextButton.addEventListener("click", goNext);
playButton.addEventListener("click", playWordAudio);
modeTrainButton.addEventListener("click", () => setMode("training"));
modePracticeButton.addEventListener("click", () => setMode("practice"));
goPracticeButton.addEventListener("click", () => setMode("practice"));
if (examButton) examButton.addEventListener("click", toggleExamMode);

$("fib-again").addEventListener("click", () => {
  resultSection.hidden = true;
  setupCard.hidden = false;
  startSet();
});

$("fib-same-again").addEventListener("click", () => {
  resultSection.hidden = true;
  statusCard.hidden = false;
  sentenceCard.hidden = false;
  trainingCard.hidden = mode !== "training";
  currentIndex = 0;
  answeredCount = 0;
  answers = {};
  renderQuestion();
});

$("fib-to-setup").addEventListener("click", () => {
  clearScreenTimer();
  stopAudio();
  items = [];
  answers = {};
  answeredCount = 0;
  statusCard.hidden = true;
  sentenceCard.hidden = true;
  resultSection.hidden = true;
  trainingCard.hidden = true;
  setupCard.hidden = false;
});

document.addEventListener("keydown", (event) => {
  if (mode === "training" || !items.length || !resultSection.hidden) return;
  const index = Number(event.key);
  if (!index || index > items[currentIndex].options.length) return;
  const option = items[currentIndex].options[index - 1];
  if (option) choose(option);
});

/* ------------------ Init ------------------ */

initialize();

async function initialize() {
  await loadBank();
  applyModeVisuals();
  console.log(
    `Fill in the Blanks ready — ${bank.length} words available (mode: ${mode}).`
  );
}