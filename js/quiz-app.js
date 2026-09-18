/* ==========================================
   PTE Trainer — Interactive Tests (quiz.html)
   Works fully offline. No server required.
   ========================================== */

"use strict";

import { loadVocabulary } from "./vocabulary.js";
import {
  buildQuestions,
  QUIZ_MODES,
  MODE_ORDER,
  isAnswerCorrect
} from "./quiz.js";
import { getStudyStatus, setStudyStatus } from "./storage.js";

const STATS_KEY = "pte.quiz.stats.v1";

const $ = (id) => document.getElementById(id);

/* --------------------------------------
   Views
-------------------------------------- */

const setupView = $("quiz-setup");
const quizView = $("quiz-view");
const resultsView = $("quiz-results");

/* --------------------------------------
   DOM — setup
-------------------------------------- */

const modesGrid = $("quiz-modes");
const modeNote = $("quiz-mode-note");
const countSelect = $("quiz-count");
const cefrSelect = $("quiz-cefr");
const studySelect = $("quiz-study");
const choicesSelect = $("quiz-choices");
const timerSelect = $("quiz-timer");
const autoLearnCheck = $("quiz-auto-learn");
const quizStats = $("quiz-stats");
const startButton = $("quiz-start");

/* --------------------------------------
   DOM — quiz
-------------------------------------- */

const questionNumber = $("quiz-question-number");
const quizProgressFill = $("quiz-progress-fill");
const modeBadge = $("quiz-mode-badge");
const scorePill = $("quiz-score-pill");
const timerPill = $("quiz-timer-pill");
const streakPill = $("quiz-streak-pill");
const prompt = $("quiz-prompt");
const exampleBox = $("quiz-example");
const audioRow = $("quiz-audio-row");
const playAudioButton = $("quiz-play-audio");
const optionsBox = $("quiz-options");
const typingBox = $("quiz-typing");
const answerInput = $("quiz-answer-input");
const checkAnswerButton = $("quiz-check-answer");
const feedbackBox = $("quiz-feedback");
const nextButton = $("quiz-next");
const skipButton = $("quiz-skip");

/* --------------------------------------
   DOM — results
-------------------------------------- */

const resultScore = $("quiz-result-score");
const resultText = $("quiz-result-text");
const resultCorrect = $("quiz-result-correct");
const resultWrong = $("quiz-result-wrong");
const resultBest = $("quiz-result-best");
const resultStreak = $("quiz-result-streak");
const resetStatsButton = $("quiz-reset-stats");
const reviewList = $("quiz-review");
const retryButton = $("quiz-retry");
const newTestButton = $("quiz-new-test");

/* --------------------------------------
   Session state
-------------------------------------- */

let vocabulary = [];
let selectedModes = new Set(["meaning", "audio"]);
let questions = [];
let currentIndex = 0;
let correctCount = 0;
let streak = 0;
let bestStreak = 0;
let answerLocked = false;
let records = [];
let lastSetup = null;
let timerInterval = null;
let timeLeft = 0;

/* --------------------------------------
   Utilities
-------------------------------------- */

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function playWordAudio(source) {
  if (!source) return;
  const audio = new Audio(source);
  audio.play().catch((error) => {
    console.warn("Unable to play quiz audio:", error);
  });
}

const OPTION_LETTERS = ["A", "B", "C", "D", "E"];

/* --------------------------------------
   Stats (localStorage)
-------------------------------------- */

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStats(next) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("Unable to save quiz stats:", error);
  }
}

function recordAttempt(stats, type, correct, total) {
  const byMode = stats.byMode || {};
  const modeStats = byMode[type] || { attempts: 0, correct: 0, total: 0 };
  modeStats.attempts += 1;
  modeStats.correct += correct;
  modeStats.total += total;
  byMode[type] = modeStats;

  const percent = total ? Math.round((correct / total) * 100) : 0;
  const next = {
    attempts: stats.attempts + 1,
    correct: stats.correct + correct,
    total: stats.total + total,
    best: Math.max(stats.best || 0, percent),
    byMode
  };
  saveStats(next);
  return next;
}

function renderSetupStats() {
  const stats = loadStats();
  if (!stats || !stats.total) {
    quizStats.innerHTML =
      '<span class="pill">لا توجد اختبارات بعد — ابدأ أول اختبار!</span>';
    return;
  }
  const accuracy = Math.round((stats.correct / stats.total) * 100);
  quizStats.innerHTML =
    `<span class="pill info">المحاولات: ${stats.attempts}</span>` +
    `<span class="pill ok">الدقة الكلية: ${accuracy}%</span>` +
    `<span class="pill">أفضل نتيجة: ${stats.best}%</span>`;
}

resetStatsButton.addEventListener("click", () => {
  if (!confirm("إعادة تعيين كل إحصائيات الاختبارات؟ لا يمكن التراجع.")) return;
  localStorage.removeItem(STATS_KEY);
  renderSetupStats();
  resultBest.textContent = "—";
  const toast = $("quiz-toast");
  toast.textContent = "أُعيد تعيين الإحصائيات.";
  toast.className = "toast success";
  toast.hidden = false;
  setTimeout(() => {
    toast.hidden = true;
  }, 3000);
});

/* --------------------------------------
   Setup view
-------------------------------------- */

function renderModeChips() {
  modesGrid.innerHTML = "";
  MODE_ORDER.forEach((key) => {
    const mode = QUIZ_MODES[key];
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "mode-chip";
    chip.dataset.mode = key;
    chip.innerHTML =
      `<div class="mc-icon">${mode.icon}</div>` +
      `<div class="mc-label">${mode.label}</div>` +
      `<div class="mc-desc">${mode.desc}</div>`;
    chip.setAttribute("aria-pressed", "false");
    chip.addEventListener("click", () => toggleMode(key, chip));
    modesGrid.appendChild(chip);
  });
  syncModeChips();
  updateModeNote();
}

function syncModeChips() {
  modesGrid.querySelectorAll(".mode-chip").forEach((chip) => {
    const active = selectedModes.has(chip.dataset.mode);
    chip.classList.toggle("on", active);
    chip.setAttribute("aria-pressed", String(active));
    chip.style.opacity = "";
  });
}

function updateModeNote() {
  modeNote.textContent = selectedModes.size
    ? `${selectedModes.size} نوع محدد`
    : "اختر نوعاً واحداً على الأقل";
  modeNote.className = "pill" + (selectedModes.size ? " info" : "");
}

function toggleMode(key, chip) {
  if (selectedModes.has(key)) {
    if (selectedModes.size > 1) selectedModes.delete(key);
  } else {
    selectedModes.add(key);
  }
  syncModeChips();
  updateModeNote();
}

startButton.addEventListener("click", () => {
  if (!selectedModes.size) {
    modeNote.textContent = "⚠️ اختر نوعاً واحداً على الأقل";
    modeNote.className = "pill warn";
    return;
  }
  lastSetup = {
    modes: [...selectedModes],
    count: Number(countSelect.value),
    cefr: cefrSelect.value,
    studyFilter: studySelect.value,
    choices: Number(choicesSelect.value),
    timer: Number(timerSelect.value),
    autoLearn: autoLearnCheck.checked
  };
  startQuiz();
});

/* --------------------------------------
   View switching
-------------------------------------- */

function showView(view) {
  setupView.hidden = view !== "setup";
  quizView.hidden = view !== "quiz";
  resultsView.hidden = view !== "results";
  if (view === "quiz" && answerInput) answerInput.focus();
}

/* --------------------------------------
   Timer
-------------------------------------- */

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerPill.hidden = true;
}

function startTimer(seconds) {
  clearTimer();
  if (!seconds) {
    timerPill.hidden = true;
    return;
  }
  timeLeft = seconds;
  timerPill.hidden = false;
  timerPill.textContent = `⏱ ${timeLeft}s`;
  timerInterval = setInterval(() => {
    timeLeft -= 1;
    timerPill.textContent = `⏱ ${timeLeft}s`;
    if (timeLeft <= 0) {
      clearTimer();
      if (!answerLocked) {
        answerQuestion(questions[currentIndex], "__timeout__", null);
      }
    }
  }, 1000);
}

/* --------------------------------------
   Quiz flow
-------------------------------------- */

function startQuiz() {
  questions = buildQuestions({ ...lastSetup });
  if (!questions.length) {
    modeNote.textContent = "⚠️ لا توجد كلمات مطابقة لهذه الإعدادات — عدّل الفلاتر.";
    modeNote.className = "pill warn";
    return;
  }
  currentIndex = 0;
  correctCount = 0;
  streak = 0;
  bestStreak = 0;
  records = [];
  answerLocked = false;
  updateStreak();
  showView("quiz");
  renderQuestion();
}

function updateStreak() {
  streakPill.hidden = streak <= 0;
  streakPill.textContent = `🔥 ${streak}`;
}

function renderQuestion() {
  const question = questions[currentIndex];
  answerLocked = false;

  questionNumber.textContent = `${currentIndex + 1} / ${questions.length}`;
  quizProgressFill.style.width = `${((currentIndex + 1) / questions.length) * 100}%`;
  const mode = QUIZ_MODES[question.type];
  modeBadge.textContent = `${mode.icon} ${mode.label}`;
  scorePill.textContent = `${correctCount} / ${currentIndex}`;

  exampleBox.hidden = true;
  exampleBox.textContent = "";
  feedbackBox.hidden = true;
  feedbackBox.className = "quiz-feedback";
  optionsBox.innerHTML = "";
  optionsBox.hidden = true;
  typingBox.hidden = true;
  audioRow.hidden = true;
  prompt.className = "quiz-prompt";
  prompt.innerHTML = "";
  nextButton.hidden = true;
  skipButton.disabled = false;

  renderOptions(question);

  switch (question.type) {
    case "audio":
      renderListenPrompt("استمع واختر كتابة الكلمة الصحيحة:");
      break;
    case "audioMeaning":
      renderListenPrompt("استمع واختر المعنى الصحيح:");
      break;
    case "reverse":
      renderWordPrompt();
      break;
    case "synonym":
      renderWordPrompt();
      break;
    case "anagram":
      prompt.textContent = "استخرج الكلمة من الحروف المبعثرة:";
      prompt.className = "quiz-prompt quiz-prompt-anagram";
      exampleBox.hidden = false;
      exampleBox.className = "quiz-example quiz-scrambled";
      exampleBox.textContent = question.scrambled;
      break;
    case "typing":
      prompt.innerHTML =
        `<div>${escapeHTML(question.meaningAR)}</div>` +
        `<div class="quiz-prompt-sub">${escapeHTML(question.meaningEN)}</div>`;
      typingBox.hidden = false;
      answerInput.disabled = false;
      checkAnswerButton.disabled = false;
      answerInput.value = "";
      answerInput.focus();
      break;
    case "cloze":
      prompt.textContent = "أكمل الفراغ بالكلمة الصحيحة:";
      exampleBox.hidden = false;
      exampleBox.className = "quiz-example";
      exampleBox.innerHTML = escapeHTML(question.example);
      break;
    default: // meaning
      prompt.innerHTML =
        `<div>${escapeHTML(question.meaningAR)}</div>` +
        `<div class="quiz-prompt-sub">${escapeHTML(question.meaningEN)}</div>`;
      break;
  }

  startTimer(lastSetup.timer);
}

function renderListenPrompt(label) {
  prompt.textContent = label;
  playAudioButton.textContent = "▶ استمع للكلمة";
  playAudioButton.disabled = false;
  audioRow.hidden = false;
}

function renderWordPrompt() {
  const question = questions[currentIndex];
  prompt.innerHTML =
    `<div class="quiz-headline">${escapeHTML(question.word)}</div>` +
    `<div class="quiz-prompt-sub">${escapeHTML(question.pronunciation || "")} · ${escapeHTML(question.partOfSpeech || "")}</div>`;
  playAudioButton.textContent = "🔊 اسمع النطق";
  playAudioButton.disabled = false;
  audioRow.hidden = false;
}

function renderOptions(question) {
  if (question.type === "typing") return;
  optionsBox.hidden = false;
  optionsBox.innerHTML = "";
  question.options.forEach((option, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option-btn";
    button.innerHTML = `<span class="opt-letter">${OPTION_LETTERS[i]}.</span>${escapeHTML(option)}`;
    button.addEventListener("click", () => {
      if (answerLocked) return;
      answerQuestion(question, option, button);
    });
    optionsBox.appendChild(button);
  });
}

function lockOptions(question, selected) {
  optionsBox.querySelectorAll(".option-btn").forEach((button) => {
    button.disabled = true;
    const value = button.textContent.replace(/^\s*[A-E]\.\s*/, "").trim();
    if (isAnswerCorrect(question, value)) {
      button.classList.add("correct");
    } else if (selected != null && value === selected) {
      button.classList.add("wrong");
    }
  });
}

function answerQuestion(question, answer, sourceButton) {
  if (answerLocked) return;
  answerLocked = true;
  clearTimer();

  let correct = false;
  let skipped = false;
  let timedOut = false;

  if (answer === "__timeout__") {
    timedOut = true;
  } else if (answer == null) {
    skipped = true;
  } else {
    correct = isAnswerCorrect(question, answer);
  }

  records.push({ ...question, yourAnswer: answer, correct, skipped, timedOut });

  if (correct) {
    correctCount += 1;
    streak += 1;
    if (streak > bestStreak) bestStreak = streak;
    if (lastSetup.autoLearn && getStudyStatus(question.word) !== "learned") {
      setStudyStatus(question.word, "learned");
    }
  } else {
    streak = 0;
  }
  updateStreak();

  if (question.type === "typing") {
    answerInput.disabled = true;
    checkAnswerButton.disabled = true;
  } else if (answer != null && sourceButton) {
    lockOptions(question, answer);
  } else {
    lockOptions(question, null);
  }

  skipButton.disabled = true;
  renderFeedback(question, correct, answer, skipped, timedOut);
}

skipButton.addEventListener("click", () => {
  if (answerLocked) return;
  answerQuestion(questions[currentIndex], null, null);
});

answerInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    if (!answerLocked) submitTypedAnswer();
  }
});

checkAnswerButton.addEventListener("click", submitTypedAnswer);

function submitTypedAnswer() {
  const value = answerInput.value.trim();
  if (!value) return;
  answerQuestion(questions[currentIndex], value, null);
}

playAudioButton.addEventListener("click", () => {
  const question = questions[currentIndex];
  playWordAudio(question.type === "audio" || question.type === "audioMeaning" ? question.audio : question.audioPlay);
});

nextButton.addEventListener("click", () => {
  if (currentIndex >= questions.length - 1) {
    finishQuiz();
    return;
  }
  currentIndex += 1;
  renderQuestion();
});

/* --------------------------------------
   Feedback
-------------------------------------- */

function renderFeedback(question, correct, answer, skipped, timedOut) {
  feedbackBox.hidden = false;
  feedbackBox.className = `quiz-feedback ${correct ? "good" : "bad"}`;

  let parts;
  if (timedOut) {
    parts = ["⏱ انتهى الوقت — تُعتبر إجابة غير صحيحة"];
  } else if (skipped) {
    parts = ["⏭️ تخطيت السؤال"];
  } else if (correct) {
    parts = ["✅ إجابة صحيحة"];
  } else {
    parts = ["❌ إجابة غير صحيحة"];
  }

  if (!skipped && !timedOut && !correct) {
    parts.push(`إجابتك: <b>${escapeHTML(answer || "—")}</b>`);
    parts.push(`الإجابة الصحيحة: <b>${escapeHTML(question.answer)}</b>`);
  }

  parts.push(`الكلمة: <b>${escapeHTML(question.word)}</b>`);
  if (question.meaningAR) {
    parts.push(`المعنى: ${escapeHTML(question.meaningAR)}`);
  }
  if (question.meaningEN) {
    parts.push(`المعنى الإنجليزي: ${escapeHTML(question.meaningEN)}`);
  }
  if (question.cefrLevel || question.partOfSpeech) {
    parts.push(
      `<span class="feedback-meta">${escapeHTML(question.cefrLevel || "")} · ${escapeHTML(question.partOfSpeech || "")}</span>`
    );
  }
  parts.push(
    `<button type="button" class="btn btn-ghost btn-sm" data-feedback-audio>▶ استمع</button>`
  );

  feedbackBox.innerHTML = parts.join("<br>");
  const audioBtn = feedbackBox.querySelector("[data-feedback-audio]");
  if (audioBtn) {
    audioBtn.addEventListener("click", () => playWordAudio(question.audioPlay));
  }

  nextButton.hidden = false;
  const isLast = currentIndex === questions.length - 1;
  nextButton.textContent = isLast ? "🏁 عرض النتيجة" : "التالي ←";
}

/* --------------------------------------
   Results
-------------------------------------- */

function finishQuiz() {
  clearTimer();
  const total = questions.length;
  const percent = total ? Math.round((correctCount / total) * 100) : 0;

  let stats = loadStats() || { attempts: 0, correct: 0, total: 0, best: 0, byMode: {} };
  const perModeCount = {};
  records.forEach((record) => {
    perModeCount[record.type] = (perModeCount[record.type] || 0) + 1;
  });
  Object.keys(perModeCount).forEach((type) => {
    const modeRecords = records.filter((r) => r.type === type);
    const modeCorrect = modeRecords.filter((r) => r.correct).length;
    stats = recordAttempt(stats, type, modeCorrect, modeRecords.length);
  });
  stats = {
    ...stats,
    history: [...(stats.history || []), { t: Date.now(), percent }].slice(-20)
  };
  saveStats(stats);

  resultScore.textContent = `${percent}%`;
  resultCorrect.textContent = correctCount;
  resultWrong.textContent = total - correctCount;
  resultBest.textContent = stats.best ? `${stats.best}%` : "—";
  resultStreak.textContent = bestStreak;

  resultText.textContent =
    percent >= 90
      ? "ممتاز! أداء رائع 🎉"
      : percent >= 70
        ? "جيد جداً — واصل التدريب 💪"
        : percent >= 50
          ? "لا بأس — راجع الكلمات الخاطئة بالأسفل"
          : "تحتاج مراجعة — اقرأ كلماتك بالأسفل وأعد المحاولة";

  renderReview();
  showView("results");
  renderSetupStats();
}

function renderReview() {
  reviewList.innerHTML = "";
  records.forEach((record) => {
    const mode = QUIZ_MODES[record.type] || { icon: "❓", label: record.type };
    const item = document.createElement("div");
    item.className = `review-item ${record.correct ? "rv-right" : "rv-wrong"}`;

    let snippet = "";
    if (record.type === "audio" || record.type === "audioMeaning") {
      snippet = "🔊 استمع للكلمة";
    } else if (record.type === "anagram") {
      snippet = `الحروف: ${escapeHTML(record.scrambled)}`;
    } else if (record.type === "cloze") {
      snippet = escapeHTML(record.example);
    } else if (record.meaningAR) {
      snippet = escapeHTML(record.meaningAR);
    }

    let answerLine;
    if (record.skipped) {
      answerLine = `<span class="rv-answer">⏭️ تخطيت السؤال · الصحيحة: <b>${escapeHTML(record.word)}</b></span>`;
    } else if (record.timedOut) {
      answerLine = `<span class="rv-answer">⏱ انتهى الوقت · الصحيحة: <b>${escapeHTML(record.word)}</b></span>`;
    } else if (record.correct) {
      answerLine = `<span class="rv-answer">✓ ${escapeHTML(record.answer)}</span>`;
    } else {
      answerLine =
        `<span class="rv-answer">✕ إجابتك: <b>${escapeHTML(record.yourAnswer || "—")}</b> · الصحيحة: <b>${escapeHTML(record.word)}</b></span>`;
    }

    item.innerHTML =
      `<span class="rv-icon">${mode.icon}</span>` +
      `<div class="rv-body">` +
      `<div class="rv-word">${mode.label} — ${escapeHTML(record.word)}</div>` +
      (snippet ? `<div class="rv-hint">${snippet}</div>` : "") +
      answerLine +
      (record.audioPlay
        ? `<button type="button" class="btn btn-ghost btn-sm rv-audio" data-audio="${escapeHTML(record.audioPlay)}">▶ استمع</button>`
        : "") +
      `</div>`;

    item.querySelectorAll("[data-audio]").forEach((btn) =>
      btn.addEventListener("click", () => playWordAudio(btn.dataset.audio))
    );

    reviewList.appendChild(item);
  });
}

retryButton.addEventListener("click", () => {
  if (lastSetup) startQuiz();
  else showView("setup");
});

newTestButton.addEventListener("click", () => {
  showView("setup");
  renderSetupStats();
});

/* --------------------------------------
   Initialize
-------------------------------------- */

async function initialize() {
  vocabulary = await loadVocabulary();
  renderModeChips();
  renderSetupStats();
  showView("setup");
  console.log(`Interactive Tests ready — ${MODE_ORDER.length} modes.`);
}

initialize();