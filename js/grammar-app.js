/* ==========================================
   PTE Trainer — Grammar (grammar.html)
   Reference lessons + interactive quizzes.
   Works fully offline. No server required.
   ========================================== */

"use strict";

import { loadGrammar, getGrammar, getCategories, getQuizItems, shuffle, shuffleOptions, toSentences } from "./grammar.js";

const STATS_KEY = "pte.grammar.stats.v1";

const $ = (id) => document.getElementById(id);

/* --------------------------------------
   Views
-------------------------------------- */

const browseView = $("grammar-browse");
const quizView = $("grammar-quiz");
const resultsView = $("grammar-results");

/* --------------------------------------
   DOM — browse
-------------------------------------- */

const catFilter = $("grammar-cat-filter");
const lessonList = $("grammar-lesson-list");
const lessonListNote = $("grammar-lesson-note");
const detailBox = $("grammar-detail");
const testAllButton = $("grammar-test-all");
const testCatButton = $("grammar-test-cat");
const testMissedButton = $("grammar-test-missed");
const timerSelect = $("grammar-timer");
const browseStats = $("grammar-browse-stats");
const grammarSearch = $("grammar-search");
const crumb = $("grammar-crumb");

/* --------------------------------------
   DOM — quiz
-------------------------------------- */

const gqNumber = $("gq-number");
const gqProgress = $("gq-progress");
const gqBadge = $("gq-badge");
const gqScore = $("gq-score");
const gqStreak = $("gq-streak");
const gqTimer = $("gq-timer");
const gqPrompt = $("gq-prompt");
const gqOptions = $("gq-options");
const gqTf = $("gq-tf");
const gqFeedback = $("gq-feedback");
const gqNext = $("gq-next");
const gqSkip = $("gq-skip");

/* --------------------------------------
   DOM — results
-------------------------------------- */

const gqrScore = $("gqr-score");
const gqrText = $("gqr-text");
const gqrCorrect = $("gqr-correct");
const gqrWrong = $("gqr-wrong");
const gqrStreak = $("gqr-streak");
const gqrBest = $("gqr-best");
const gqrReview = $("gqr-review");
const gqrRetry = $("gqr-retry");
const gqrBrowse = $("gqr-browse");
const gqrReset = $("gqr-reset");

/* --------------------------------------
   State
-------------------------------------- */

let grammar = [];
let categories = [];
let activeCategory = "all";
let searchQuery = "";
let selectedLessonId = null;
let activeTab = "summary";

let quizItems = [];
let records = [];
let quizIndex = 0;
let correctCount = 0;
let streak = 0;
let bestStreak = 0;
let answerLocked = false;
let quizScope = { mode: "all", lessonId: null };
let timerInterval = null;
let timeLeft = 0;

const OPTION_LETTERS = ["A", "B", "C", "D"];

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

function isItemCorrect(item, yourAnswer) {
  if (item.type === "tf") return yourAnswer === item.correct;
  return yourAnswer === item.options[item.answer];
}

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
    console.warn("Unable to save grammar stats:", error);
  }
}

function itemKey(item) {
  return item.qid || `${item.lessonId}|${item.prompt}`;
}

function missedCount(stats) {
  const map = (stats && stats.missed) || {};
  return Object.keys(map).filter((key) => map[key] > 0).length;
}

function renderBrowseStats() {
  const stats = loadStats();
  const quizCount = getQuizItems().length;
  if (!stats || !stats.total) {
    browseStats.innerHTML =
      `<span class="pill">${grammar.length} درساً</span>` +
      `<span class="pill">${quizCount} سؤالاً</span>`;
    updateSideButtons();
    return;
  }
  const accuracy = Math.round((stats.correct / stats.total) * 100);
  browseStats.innerHTML =
    `<span class="pill info">المحاولات: ${stats.attempts}</span>` +
    `<span class="pill ok">الدقة: ${accuracy}%</span>` +
    `<span class="pill">أفضل: ${stats.best}%</span>` +
    (missedCount(stats) ? `<span class="pill warn">💥 أخطاءك: ${missedCount(stats)}</span>` : "");
  updateSideButtons();
}

function updateSideButtons() {
  if (testCatButton) {
    const catLessons = activeCategory === "all"
      ? grammar.length
      : grammar.filter((l) => l.category === activeCategory).length;
    const catCount = grammar
      .filter((l) => activeCategory === "all" || l.category === activeCategory)
      .reduce((sum, l) => sum + (l.quiz || []).length, 0);
    testCatButton.disabled = activeCategory === "all";
    testCatButton.textContent = `🎯 اختبار فئة «${activeCategory === "all" ? "—" : activeCategory}» (${catCount})`;
  }
  if (testMissedButton) {
    const total = missedCount(loadStats());
    testMissedButton.disabled = total === 0;
    testMissedButton.textContent = total
      ? `💥 ركّز على أخطائك (${total})`
      : "💥 ركّز على أخطائك";
  }
}

gqrReset.addEventListener("click", () => {
  if (!confirm("إعادة تعيين كل إحصائيات القواعد؟ لا يمكن التراجع.")) return;
  localStorage.removeItem(STATS_KEY);
  renderBrowseStats();
  gqrBest.textContent = "—";
  const toast = $("grammar-toast");
  toast.textContent = "أُعيد تعيين إحصائيات القواعد.";
  toast.className = "toast success";
  toast.hidden = false;
  setTimeout(() => {
    toast.hidden = true;
  }, 3000);
});

/* --------------------------------------
   View switching
-------------------------------------- */

function showView(view) {
  browseView.hidden = view !== "browse";
  quizView.hidden = view !== "quiz";
  resultsView.hidden = view !== "results";
}

/* --------------------------------------
   Timer
-------------------------------------- */

function clearTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  gqTimer.hidden = true;
}

function startTimer(seconds) {
  clearTimer();
  if (!seconds) {
    gqTimer.hidden = true;
    return;
  }
  timeLeft = seconds;
  gqTimer.hidden = false;
  gqTimer.textContent = `⏱ ${timeLeft}s`;
  timerInterval = setInterval(() => {
    timeLeft -= 1;
    gqTimer.textContent = `⏱ ${timeLeft}s`;
    if (timeLeft <= 0) {
      clearTimer();
      if (!answerLocked) answerQuestion(quizItems[quizIndex], "__timeout__");
    }
  }, 1000);
}

/* --------------------------------------
   Browse: categories + lesson list
-------------------------------------- */

function categoryCount(cat) {
  return cat === "all" ? grammar.length : grammar.filter((l) => l.category === cat).length;
}

function renderCategories() {
  catFilter.innerHTML = "";
  const addChip = (label, value) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "cat-chip";
    chip.dataset.cat = value;
    chip.title = label;
    chip.innerHTML =
      `<span>${label}</span>` +
      `<span class="cat-count">${categoryCount(value)}</span>`;
    chip.addEventListener("click", () => {
      activeCategory = value;
      catFilter.querySelectorAll(".cat-chip").forEach((c) => {
        c.classList.toggle("on", c.dataset.cat === activeCategory);
      });
      renderLessonList();
      updateSideButtons();
    });
    catFilter.appendChild(chip);
  };

  addChip("الكل", "all");
  categories.forEach((cat) => addChip(cat, cat));
}

function matchesQuery(lesson) {
  if (!searchQuery) return true;
  const haystack =
    `${lesson.title} ${lesson.description} ${lesson.category} ${lesson.id}`.toLowerCase();
  return haystack.includes(searchQuery);
}

function renderLessonList() {
  lessonList.innerHTML = "";
  const source = grammar.filter(
    (lesson) => (activeCategory === "all" || lesson.category === activeCategory) && matchesQuery(lesson)
  );

  if (!source.length) {
    lessonListNote.textContent = searchQuery
      ? "لا نتائج مطابقة للبحث."
      : "لا توجد دروس في هذه الفئة.";
    return;
  }

  const stats = loadStats() || { lessons: {} };
  lessonListNote.textContent =
    searchQuery
      ? `${source.length} ${source.length === 1 ? "درس" : "دروس"} — بحث: “${searchQuery}”`
      : `${source.length} من ${grammar.length} دروس — ${activeCategory === "all" ? "" : activeCategory}`;

  source.forEach((lesson) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "lesson-row" + (selectedLessonId === lesson.id ? " on" : "");
    const best = stats.lessons && stats.lessons[lesson.id];
    const weak = best != null && best < 70;
    row.innerHTML =
      `<span class="lesson-row-icon">${lesson.icon}</span>` +
      `<span class="lesson-row-body">` +
      `<span class="lesson-row-title">${escapeHTML(lesson.title)}</span>` +
      `<span class="lesson-row-meta">${escapeHTML(lesson.category)} · ${lesson.quiz.length} أسئلة</span>` +
      `</span>` +
      (best ? `<span class="lesson-row-best${weak ? " weak" : ""}">${best}%</span>` : "");
    row.title = weak ? "درس يحتاج مزيداً من التدريب (أفضل نتيجة أقل من 70%)" : "";
    row.addEventListener("click", () => {
      selectedLessonId = lesson.id;
      activeTab = "summary";
      renderLessonList();
      renderDetail(lesson);
      crumb.innerHTML =
        `<span>${escapeHTML(lesson.category)}</span>` +
        `<span class="crumb-sep">/</span>` +
        `<b>${escapeHTML(lesson.title)}</b>`;
    });
    lessonList.appendChild(row);
  });
}

const LESSON_TABS = [
  { key: "summary", label: "نظرة عامة" },
  { key: "rules", label: "القواعد" },
  { key: "examples", label: "أمثلة" },
  { key: "mistakes", label: "أخطاء شائعة" }
];

function renderEmpty() {
  const sb = escapeHTML;
  crumb.innerHTML =
    `<span>مكتبة القواعد</span>` +
    `<span class="crumb-sep">/</span>` +
    `<b>اختر درساً</b>`;
  detailBox.innerHTML =
    `<div class="reader-empty">` +
    `<div class="reader-empty-icon">📘</div>` +
    `<h3>اختر درساً من القائمة</h3>` +
    `<p>سيظهر هنا شرح الدرس، القواعد، الأمثلة والأخطاء الشائعة — ثم ابدأ اختباره مباشرة من داخل الصفحة. يمكنك أيضاً اختبار كل الدروس دفعة واحدة.</p>` +
    `<button id="reader-start-all" class="btn" type="button">📘 اختبار كل الدروس</button>` +
    `</div>`;
  detailBox.querySelector("#reader-start-all").addEventListener("click", () => {
    startQuizItems(getQuizItems().map(attach), { mode: "all", lessonId: null });
  });
}

function renderDetail(lesson) {
  const sb = escapeHTML;
  const stats = loadStats();
  const best = stats && stats.lessons && stats.lessons[lesson.id];

  let html =
    `<div class="lesson-hero">` +
    `<div class="lesson-hero-icon">${lesson.icon}</div>` +
    `<div class="lesson-hero-main">` +
    `<h2 class="lesson-hero-title">${sb(lesson.title)}</h2>` +
    `<p class="lesson-hero-desc">${sb(lesson.description)}</p>` +
    `<div class="lesson-hero-meta">` +
    `<span class="pill info">${sb(lesson.category)}</span>` +
    `<span class="pill">${lesson.quiz.length} أسئلة</span>` +
    (best ? `<span class="pill ${best < 70 ? "warn" : "ok"}">أفضل نتيجة: ${best}%</span>` : "") +
    `</div>` +
    (lesson.markers && lesson.markers.length
      ? `<div class="lesson-markers">` +
        `<span class="lesson-markers-label">كلمات دليلية:</span>` +
        lesson.markers.map((m) => `<span class="marker-chip">${sb(m)}</span>`).join("") +
        `</div>`
      : "") +
    `<button id="reader-test-lesson" class="btn lesson-hero-action" type="button">▶ اختبار هذا الدرس</button>` +
    `</div>` +
    `</div>`;

  html += `<div class="lesson-tabs">`;
  LESSON_TABS.forEach((tab) => {
    const on = activeTab === tab.key ? " on" : "";
    html += `<button type="button" class="lesson-tab${on}" data-tab="${tab.key}">${tab.label}</button>`;
  });
  html += `</div>`;

  const renderBody = (tab, content) =>
    `<div class="lesson-tab-body" data-body="${tab.key}"${tab.key === activeTab ? "" : " hidden"}>${content}</div>`;

  const sentences = toSentences(lesson.explanation);
  let summary =
    `<div class="lesson-overview">` +
    `<p class="lesson-overview-lead">${sb(lesson.description)}</p>` +
    sentences.map((s) => `<p class="lesson-overview-para">${sb(s)}</p>`).join("") +
    `</div>`;
  html += renderBody(LESSON_TABS[0], summary);

  html += renderBody(LESSON_TABS[1], `<ul class="lesson-list">` +
    lesson.rules.map((rule) => `<li>${sb(rule)}</li>`).join("") + `</ul>`);

  html += renderBody(LESSON_TABS[2], `<div class="lesson-examples">` +
    lesson.examples.map((example) =>
      `<div class="lesson-example">` +
      `<div class="lesson-example-main">` +
      `<div class="lesson-example-en">${sb(example.en)}</div>` +
      `<div class="lesson-example-ar">${sb(example.ar)}</div>` +
      `</div>` +
      `</div>`
    ).join("") + `</div>`);

  html += renderBody(LESSON_TABS[3], `<div class="lesson-mistakes">` +
    lesson.commonMistakes.map((mistake) =>
      `<div class="lesson-mistake">${sb(mistake)}</div>`
    ).join("") + `</div>`);

  detailBox.innerHTML = html;

  detailBox.querySelector("#reader-test-lesson").addEventListener("click", () => {
    startQuizItems(getQuizItems({ lessonId: lesson.id }).map(attach), {
      mode: "lesson",
      lessonId: lesson.id
    });
  });

  detailBox.querySelectorAll(".lesson-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activeTab = tab.dataset.tab;
      detailBox.querySelectorAll(".lesson-tab").forEach((t) => {
        t.classList.toggle("on", t.dataset.tab === activeTab);
      });
      detailBox.querySelectorAll(".lesson-tab-body").forEach((body) => {
        body.hidden = body.dataset.body !== activeTab;
      });
    });
  });
}

testAllButton.addEventListener("click", () => {
  startQuizItems(getQuizItems().map(attach), { mode: "all", lessonId: null });
});

testCatButton.addEventListener("click", () => {
  if (activeCategory === "all" || !activeCategory) return;
  startQuizItems(getQuizItems({ categories: [activeCategory] }).map(attach), {
    mode: "category",
    category: activeCategory
  });
});

testMissedButton.addEventListener("click", () => {
  const stats = loadStats() || {};
  const missedMap = stats.missed || {};
  resetAttachSeq();
  const all = getQuizItems().map(attach);
  const missed = all.filter((item) => (missedMap[itemKey(item)] || 0) > 0);
  if (!missed.length) {
    toastMsg("لا توجد أخطاء مسجلة بعد — أتمّ اختباراً أولاً.");
    return;
  }
  startQuizItems(missed, { mode: "missed", lessonId: null });
});

function toastMsg(message) {
  const toast = $("grammar-toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = "toast success";
  toast.hidden = false;
  setTimeout(() => {
    toast.hidden = true;
  }, 3000);
}

grammarSearch.addEventListener("input", () => {
  searchQuery = grammarSearch.value.trim().toLowerCase();
  renderLessonList();
});

let attachSeq = new Map();

function resetAttachSeq() {
  attachSeq = new Map();
}

function attach(item) {
  const key = `${item.lessonId}|${item.prompt}`;
  const n = (attachSeq.get(key) || 0) + 1;
  attachSeq.set(key, n);
  return {
    ...shuffleOptions({
      ...item,
      options: item.type === "mcq" ? [...item.options] : undefined
    }),
    qid: `${key}#${n}`
  };
}

/* --------------------------------------
   Quiz flow
-------------------------------------- */

function startQuizItems(items, scope) {
  if (!items.length) {
    lessonListNote.textContent = "لا توجد أسئلة لهذا الاختبار.";
    return;
  }
  resetAttachSeq();
  quizItems = shuffle(items);
  quizScope = scope;
  records = [];
  quizIndex = 0;
  correctCount = 0;
  streak = 0;
  bestStreak = 0;
  answerLocked = false;
  showView("quiz");
  renderQuestion();
}

function updateStreak() {
  gqStreak.hidden = streak <= 0;
  gqStreak.textContent = `🔥 ${streak}`;
}

function renderQuestion() {
  const item = quizItems[quizIndex];
  answerLocked = false;

  gqNumber.textContent = `${quizIndex + 1} / ${quizItems.length}`;
  gqProgress.style.width = `${((quizIndex + 1) / quizItems.length) * 100}%`;
  gqBadge.textContent = `${item.lessonIcon} ${item.lessonTitle} · ${item.type === "tf" ? "صح/خطأ" : "اختيار"}`;
  gqScore.textContent = `${correctCount} / ${quizIndex}`;
  gqPrompt.innerHTML = escapeHTML(item.prompt);
  gqFeedback.hidden = true;
  gqFeedback.className = "quiz-feedback";
  gqNext.hidden = true;
  gqSkip.disabled = false;

  gqOptions.innerHTML = "";
  gqOptions.hidden = item.type !== "mcq";
  gqTf.innerHTML = "";
  gqTf.hidden = item.type !== "tf";

  if (item.type === "mcq") {
    item.options.forEach((option, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-btn";
      button.dataset.value = option;
      button.innerHTML = `<span class="opt-letter">${OPTION_LETTERS[i]}.</span>${escapeHTML(option)}`;
      button.addEventListener("click", () => {
        if (answerLocked) return;
        answerQuestion(item, option, button);
      });
      gqOptions.appendChild(button);
    });
  } else {
    const renderTfButton = (label, value) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-btn tf-btn";
      button.dataset.value = String(value);
      button.textContent = label;
      button.addEventListener("click", () => {
        if (answerLocked) return;
        answerQuestion(item, value, button);
      });
      gqTf.appendChild(button);
    };
    renderTfButton("✅ صحيح", true);
    renderTfButton("❌ خطأ", false);
  }

  updateStreak();
  startTimer(Number(timerSelect.value));
}

function lockMcqOptions(item, selected) {
  gqOptions.querySelectorAll(".option-btn").forEach((button) => {
    button.disabled = true;
    const value = button.dataset.value;
    if (value === item.options[item.answer]) {
      button.classList.add("correct");
    } else if (selected != null && value === String(selected)) {
      button.classList.add("wrong");
    }
  });
}

function lockTfButtons(item, selected) {
  gqTf.querySelectorAll(".option-btn").forEach((button) => {
    button.disabled = true;
    const value = button.dataset.value === "true";
    const correct = value === item.correct;
    const picked = selected != null && value === selected;
    if (correct) button.classList.add("correct");
    else if (picked) button.classList.add("wrong");
  });
}

function answerQuestion(item, answer, sourceButton) {
  if (answerLocked) return;
  answerLocked = true;
  clearTimer();

  let correct = false;
  let skipped = false;
  let timedOut = false;

  if (answer === "__timeout__") timedOut = true;
  else if (answer == null) skipped = true;
  else correct = isItemCorrect(item, answer);

  records.push({ ...item, yourAnswer: answer, correct, skipped, timedOut });

  if (correct) {
    correctCount += 1;
    streak += 1;
    if (streak > bestStreak) bestStreak = streak;
  } else {
    streak = 0;
  }
  updateStreak();

  if (item.type === "mcq") {
    lockMcqOptions(item, answer != null && sourceButton ? answer : null);
  } else {
    lockTfButtons(item, answer === true || answer === false ? answer : null);
  }

  gqSkip.disabled = true;
  renderFeedback(item, correct, answer, skipped, timedOut);
}

gqSkip.addEventListener("click", () => {
  if (answerLocked) return;
  answerQuestion(quizItems[quizIndex], null, null);
});

gqNext.addEventListener("click", () => {
  if (quizIndex >= quizItems.length - 1) {
    finishQuiz();
    return;
  }
  quizIndex += 1;
  renderQuestion();
});

/* --------------------------------------
   Feedback
-------------------------------------- */

function renderFeedback(item, correct, answer, skipped, timedOut) {
  gqFeedback.hidden = false;
  gqFeedback.className = `quiz-feedback ${correct ? "good" : "bad"}`;

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

  if (item.type === "mcq") {
    const your = answer == null ? "—" : escapeHTML(answer);
    const correctOne = escapeHTML(item.options[item.answer]);
    if (!skipped && !timedOut && !correct) {
      parts.push(`إجابتك: <b>${your}</b>`);
    }
    parts.push(`الإجابة الصحيحة: <b>${correctOne}</b>`);
  } else {
    if (!skipped && !timedOut && !correct) {
      parts.push(`إجابتك: <b>${answer ? "صحيح" : "خطأ"}</b>`);
    }
    parts.push(`الجواب الصحيح: <b>${item.correct ? "صحيح ✓" : "خطأ ✗"}</b>`);
  }

  gqFeedback.innerHTML = parts.join("<br>");

  if (item.why) {
    gqFeedback.innerHTML += `<div class="quiz-why">💡 ${escapeHTML(item.why)}</div>`;
  }

  gqNext.hidden = false;
  const isLast = quizIndex === quizItems.length - 1;
  gqNext.textContent = isLast ? "🏁 عرض النتيجة" : "التالي ←";
}

/* --------------------------------------
   Results
-------------------------------------- */

function finishQuiz() {
  clearTimer();
  const total = quizItems.length;
  const percent = total ? Math.round((correctCount / total) * 100) : 0;

  const stats = loadStats() || {
    best: 0,
    attempts: 0,
    correct: 0,
    total: 0,
    lessons: {}
  };
  const missed = {};
  records.forEach((record) => {
    if (!record.correct && !record.skipped && !record.timedOut) {
      const key = itemKey(record);
      missed[key] = (missed[key] || 0) + 1;
    }
  });
  const mergedMissed = { ...(stats.missed || {}) };
  for (const [key, count] of Object.entries(missed)) {
    mergedMissed[key] = (mergedMissed[key] || 0) + count;
  }

  const next = {
    ...stats,
    attempts: stats.attempts + 1,
    correct: stats.correct + correctCount,
    total: stats.total + total,
    best: Math.max(stats.best || 0, percent),
    missed: mergedMissed,
    history: [...(stats.history || []), { t: Date.now(), percent }].slice(-20)
  };
  if (quizScope.mode === "lesson" && quizScope.lessonId) {
    const prevBest = (stats.lessons && stats.lessons[quizScope.lessonId]) || 0;
    next.lessons = { ...(stats.lessons || {}), [quizScope.lessonId]: Math.max(prevBest, percent) };
  }
  saveStats(next);

  gqrScore.textContent = `${percent}%`;
  gqrCorrect.textContent = correctCount;
  gqrWrong.textContent = total - correctCount;
  gqrStreak.textContent = bestStreak;
  gqrBest.textContent = next.best ? `${next.best}%` : "—";

  gqrText.textContent =
    percent >= 90
      ? "ممتاز! إتقان قوي للقواعد 🎉"
      : percent >= 70
        ? "جيد جداً — راجع الدروس الخاطئة أعلاه 💪"
        : percent >= 50
          ? "لا بأس — اقرأ الدروس المعنية ثم أعد المحاولة"
          : "تحتاج مراجعة جادة — تصفح الدروس بالأسفل وأعد الاختبار";

  renderReview();
  showView("results");
  renderBrowseStats();
}

function renderReview() {
  gqrReview.innerHTML = "";
  records.forEach((record) => {
    const item = document.createElement("div");
    item.className = `review-item ${record.correct ? "rv-right" : "rv-wrong"}`;

    let answerLine;
    if (record.skipped) {
      answerLine = `<span class="rv-answer">⏭️ تخطيت · الجواب: <b>${record.type === "mcq" ? escapeHTML(record.options[record.answer]) : (record.correct ? "صحيح ✓" : "خطأ ✗")}</b></span>`;
    } else if (record.timedOut) {
      answerLine = `<span class="rv-answer">⏱ انتهى الوقت · الجواب: <b>${record.type === "mcq" ? escapeHTML(record.options[record.answer]) : (record.correct ? "صحيح ✓" : "خطأ ✗")}</b></span>`;
    } else {
      const correctText =
        record.type === "mcq"
          ? escapeHTML(record.options[record.answer])
          : record.correct
            ? "صحيح ✓"
            : "خطأ ✗";
      const yourText =
        record.type === "mcq"
          ? escapeHTML(record.yourAnswer || "—")
          : record.yourAnswer
            ? "صحيح"
            : "خطأ";
      answerLine = record.correct
        ? `<span class="rv-answer">✓ ${correctText}</span>`
        : `<span class="rv-answer">✕ إجابتك: <b>${yourText}</b> · الجواب: <b>${correctText}</b></span>`;
    }

    const whyLine = record.why && !record.correct
      ? `<div class="rv-why">💡 ${escapeHTML(record.why)}</div>`
      : "";

    item.innerHTML =
      `<span class="rv-icon">${record.lessonIcon || "📘"}</span>` +
      `<div class="rv-body">` +
      `<div class="rv-word">${escapeHTML(record.lessonTitle)}</div>` +
      `<div class="rv-hint">${escapeHTML(record.prompt)}</div>` +
      answerLine +
      whyLine +
      `</div>`;

    gqrReview.appendChild(item);
  });
}

gqrRetry.addEventListener("click", () => {
  if (quizScope.mode === "lesson" && quizScope.lessonId) {
    startQuizItems(getQuizItems({ lessonId: quizScope.lessonId }).map(attach), quizScope);
  } else if (quizScope.mode === "category" && quizScope.category) {
    startQuizItems(getQuizItems({ categories: [quizScope.category] }).map(attach), quizScope);
  } else {
    startQuizItems(getQuizItems().map(attach), { mode: "all", lessonId: null });
  }
});

gqrBrowse.addEventListener("click", () => {
  showView("browse");
  renderBrowseStats();
  renderLessonList();
  if (selectedLessonId) {
    const lesson = getGrammar().find((l) => l.id === selectedLessonId);
    if (lesson) {
      renderDetail(lesson);
      crumb.innerHTML =
        `<span>${escapeHTML(lesson.category)}</span>` +
        `<span class="crumb-sep">/</span>` +
        `<b>${escapeHTML(lesson.title)}</b>`;
      return;
    }
  }
  renderEmpty();
});

/* --------------------------------------
   Initialize
-------------------------------------- */

async function initialize() {
  grammar = await loadGrammar();
  if (!grammar.length) {
    lessonListNote.textContent = "تعذر تحميل بيانات القواعد.";
    return;
  }
  categories = getCategories();
  renderCategories();
  renderLessonList();
  renderBrowseStats();
  const total = getQuizItems().length;
  testAllButton.textContent = `📘 اختبار كل الدروس (${total} سؤالاً)`;
  renderEmpty();
  showView("browse");
  console.log(`Grammar ready — ${grammar.length} lessons.`);
}

initialize();