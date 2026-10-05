/* ==========================================
   PTE Trainer — Smart Dashboard (index.html)
   Works fully offline. No server required.
   ========================================== */

"use strict";

import { loadVocabulary } from "./vocabulary.js";
import { loadGrammar } from "./grammar.js";
import {
  loadStudyState,
  countDueToday,
  loadPronState,
  getDueWords
} from "./storage.js";
import { getWeakItems, getDueItems, describeDue } from "./task-stats.js";
import {
  buildSnapshot,
  mergeSnapshot,
  resetStats,
  resetEverything,
  describeKeys
} from "./progress-io.js";
import {
  MIN_SCORE,
  MAX_SCORE,
  DEFAULT_TARGET,
  averageToOfficial,
  gapToTarget
} from "./pte-scale.js";

const GRAMMAR_STATS_KEY = "pte.grammar.stats.v1";
const QUIZ_STATS_KEY = "pte.quiz.stats.v1";
const SWT_STATS_KEY = "pte.swt.stats.v1";
const DI_STATS_KEY = "pte.di.stats.v1";

const $ = (id) => document.getElementById(id);

const DAY_MS = 86400000;

function loadKey(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* --------------------------------------
   Overview cards
-------------------------------------- */

function renderStats(vocabulary, grammar) {
  const study = Object.values(loadStudyState());
  const learned = study.filter((e) => e.status === "learned").length;
  const due = countDueToday();

  if ($("dash-vocab")) {
    const total = vocabulary.length;
    $("dash-vocab").textContent = total ? `${learned} / ${total}` : "—";
    $("dash-vocab").className = "dash-card-value" + (learned > 0 ? " value-green" : "");
  }
  if ($("dash-due")) {
    $("dash-due").textContent = due;
    $("dash-due").className = "dash-card-value" + (due > 0 ? " value-amber" : "");
  }

  const grammarStats = loadKey(GRAMMAR_STATS_KEY);
  if ($("dash-grammar")) {
    const acc = grammarStats && grammarStats.total
      ? Math.round((grammarStats.correct / grammarStats.total) * 100)
      : null;
    $("dash-grammar").textContent = acc == null ? "—" : `${acc}%`;
  }

  const quizStats = loadKey(QUIZ_STATS_KEY);
  if ($("dash-quiz")) {
    const acc = quizStats && quizStats.total
      ? Math.round((quizStats.correct / quizStats.total) * 100)
      : null;
    $("dash-quiz").textContent = acc == null ? "—" : `${acc}%`;
  }

  const swtStats = loadKey(SWT_STATS_KEY);
  if ($("dash-swt")) {
    const acc = swtStats && swtStats.total
      ? Math.round((swtStats.correct / swtStats.total) * 100)
      : null;
    $("dash-swt").textContent = acc == null ? "—" : `${acc}%`;
  }

  const diStats = loadKey(DI_STATS_KEY);
  if ($("dash-di")) {
    const acc = diStats && diStats.total
      ? Math.round((diStats.correct / diStats.total) * 100)
      : null;
    $("dash-di").textContent = acc == null ? "—" : `${acc}%`;
  }

  const pron = Object.values(loadPronState());
  const pronAttempts = pron.reduce((sum, e) => sum + e.attempts, 0);
  const pronCorrect = pron.reduce((sum, e) => sum + e.correct, 0);
  if ($("dash-pron")) {
    $("dash-pron").textContent = pronAttempts
      ? `${Math.round((pronCorrect / pronAttempts) * 100)}%`
      : "—";
  }

  if ($("mode-badge-words")) {
    $("mode-badge-words").textContent = `${vocabulary.length} words`;
  }
  if ($("mode-badge-grammar")) {
    $("mode-badge-grammar").textContent = `${grammar.length} lessons`;
  }
  if ($("mode-badge-quiz")) {
    $("mode-badge-quiz").textContent = "8 quiz modes";
  }
  const swtBadge = document.getElementById("mode-badge-swt");
  swtBadge.textContent = `${swtPassageCount} passages`;
  const diBadge = document.getElementById("mode-badge-di");
  diBadge.textContent = `${diImageCount} images`;
}

let swtPassageCount = 0;
let diImageCount = 0;

let cachedAssets = null;

async function loadAssets() {
  if (cachedAssets) return cachedAssets;
  const [vocabulary, grammar, swt, di] = await Promise.all([
    loadVocabulary(),
    loadGrammar(),
    loadSwtPassages(),
    loadDiImages()
  ]);
  swtPassageCount = swt.length;
  diImageCount = di.length;
  cachedAssets = { vocabulary, grammar };
  return cachedAssets;
}

async function loadSwtPassages() {
  try {
    const response = await fetch("./data/swt.json");
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function loadDiImages() {
  try {
    const response = await fetch("./data/describe-images.json");
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/* --------------------------------------
   Daily review (SRS) banner
-------------------------------------- */

function renderSrs(vocabulary) {
  const srs = $("dash-srs");
  if (!srs) return;
  const dueCount = countDueToday();
  if (!dueCount) {
    srs.hidden = true;
    return;
  }
  const dueWords = getDueWords()
    .map((word) => vocabulary.find((item) => item.word === word))
    .filter(Boolean)
    .slice(0, 5)
    .map((item) => escapeHTML(item.word))
    .join("، ");
  srs.hidden = false;
  $("dash-srs-title").textContent = `🔁 ${dueCount} مراجعة مستحقة اليوم`;
  $("dash-srs-detail").textContent = dueWords
    ? `تشمل: ${dueWords}${dueCount > 5 ? "…" : ""}`
    : "كلماتك المعلّمة «Learned» جاهزة للمراجعة المتباعدة.";
}

/* --------------------------------------
   Activity chart (last 14 days)
-------------------------------------- */

function dayKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function buildSeries() {
  const points = [];
  const grammarStats = loadKey(GRAMMAR_STATS_KEY);
  const quizStats = loadKey(QUIZ_STATS_KEY);
  const swtStats = loadKey(SWT_STATS_KEY);
  const diStats = loadKey(DI_STATS_KEY);
  [grammarStats, quizStats, swtStats, diStats].forEach((stats) => {
    (stats && stats.history ? stats.history : []).forEach((h) => {
      points.push({ day: dayKey(h.t), percent: h.percent || 0 });
    });
  });
  const byDay = {};
  points.forEach((p) => {
    byDay[p.day] = byDay[p.day] || [];
    byDay[p.day].push(p.percent);
  });
  return byDay;
}

function renderChart() {
  const holder = $("dash-chart");
  if (!holder) return;
  const byDay = buildSeries();
  if (!Object.keys(byDay).length) {
    holder.innerHTML =
      `<div class="dash-empty">لا توجد بيانات بعد — أتمّ اختبار قواعد أو اختباراً أو ملخصاً أو وصف صورة لبناء الرسم.</div>`;
    return;
  }

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d);
  }

  let html = "";
  days.forEach((d) => {
    const key = dayKey(d.getTime());
    const values = byDay[key];
    const avg = values && values.length
      ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      : null;
    const height = avg == null ? 2 : Math.max(4, Math.round((avg / 100) * 120));
    const label = `${d.getDate()}/${d.getMonth() + 1}`;
    html +=
      `<div class="bar-col">` +
      `<div class="bar-track">` +
      `<div class="bar" data-percent="${avg == null ? "—" : avg}" style="height:${height}px"></div>` +
      `</div>` +
      `<div class="bar-label">${label}</div>` +
      `</div>`;
  });

  holder.innerHTML =
    `<div class="bar-chart">${html}</div>` +
    `<div class="chart-tip">متوسط الدقة اليومي (القواعد + الاختبارات + الملخصات + وصف الصور) — مرّر فوق الأعمدة.</div>`;

  holder.querySelectorAll(".bar").forEach((bar) => {
    bar.title = `دقة ${bar.dataset.percent}%`;
  });
}

/* --------------------------------------
   Weak areas
-------------------------------------- */

function renderWeak(grammar) {
  const holder = $("dash-weak");
  if (!holder) return;
  const stats = loadKey(GRAMMAR_STATS_KEY);

  const missed = Object.keys((stats && stats.missed) || {}).filter(
    (key) => stats.missed[key] > 0
  ).length;

  if ($("dash-missed-link")) {
    $("dash-missed-link").hidden = missed === 0;
  }

  const lessons = (stats && stats.lessons) || {};
  const weak = grammar
    .filter((lesson) => lessons[lesson.id] != null && lessons[lesson.id] < 70)
    .sort((a, b) => lessons[a.id] - lessons[b.id]);

  if (!weak.length) {
    holder.innerHTML =
      `<div class="dash-empty">` +
      (Object.keys(lessons).length
        ? "🎉 لا توجد نقاط ضعف مسجلة — واصل الإتقان!"
        : "أتمّ اختبارات القواعد أولاً لتظهر نقاط الضعف هنا.") +
      `</div>`;
    return;
  }

  holder.innerHTML = "";
  weak.forEach((lesson) => {
    const best = lessons[lesson.id];
    const item = document.createElement("div");
    item.className = "dash-weak-row";
    item.innerHTML =
      `<span class="lesson-row-icon">${lesson.icon}</span>` +
      `<div class="dash-weak-main">` +
      `<div class="dash-weak-title">${escapeHTML(lesson.title)}</div>` +
      `<div class="dash-weak-bar"><div class="dash-weak-fill" style="width:${best}%"></div></div>` +
      `</div>` +
      `<span class="dash-weak-pct">${best}%</span>`;
    holder.appendChild(item);
  });
}

/* --------------------------------------
   Weak task items (SWT / Describe Image)
-------------------------------------- */

const TASK_LINKS = {
  "pte.swt.stats.v1": { label: "تلخيص", page: "swt.html" },
  "pte.di.stats.v1": { label: "وصف صورة", page: "describe-image.html" }
};

function renderWeakItems() {
  const holder = $("dash-task-weak");
  if (!holder) return;

  const now = Date.now();
  const rows = [];
  let dueToday = 0;

  Object.entries(TASK_LINKS).forEach(([key, meta]) => {
    getWeakItems(loadKey(key)).forEach((item) => {
      const schedule = describeDue(item, now);
      const isDue = Boolean(item.due && item.due <= now);
      if (isDue) dueToday += 1;
      rows.push({ ...item, ...meta, schedule, isDue });
    });
  });

  /* Items whose review date has arrived come first, then the weakest. */
  rows.sort(
    (a, b) =>
      Number(b.isDue) - Number(a.isDue) ||
      (a.due || Infinity) - (b.due || Infinity) ||
      a.best - b.best ||
      b.count - a.count ||
      a.id.localeCompare(b.id)
  );

  const summary = $("dash-task-weak-summary");
  if (summary) {
    summary.textContent = dueToday
      ? `${dueToday} بند مستحق للمراجعة اليوم`
      : "لا يوجد بند مستحق اليوم";
    summary.classList.toggle("is-due", dueToday > 0);
  }

  if (!rows.length) {
    const answered = Object.keys(TASK_LINKS).reduce(
      (sum, key) => sum + Number((loadKey(key) || {}).total || 0),
      0
    );
    holder.innerHTML =
      `<div class="dash-empty">` +
      (answered
        ? "🎉 لا توجد بنود ضعيفة — نتائجك في المهام جيدة."
        : "حلّ نصوص التلخيص أو صفات الصور لتظهر البنود الضعيفة هنا.") +
      `</div>`;
    return;
  }

  holder.innerHTML = "";
  rows.slice(0, 6).forEach((row) => {
    const link = document.createElement("a");
    link.className = `dash-weak-row dash-task-row${row.isDue ? " is-due" : ""}`;
    link.href = `${row.page}?item=${encodeURIComponent(row.id)}`;
    link.title = row.weak.length
      ? `لم تُغطَّ: ${row.weak.join(" · ")}`
      : "اضغط للتدريب على هذا البند";
    link.innerHTML =
      `<span class="dash-task-tag">${row.label}</span>` +
      `<div class="dash-weak-main">` +
      `<div class="dash-weak-title">${escapeHTML(row.title)}</div>` +
      `<div class="dash-weak-bar"><div class="dash-weak-fill" style="width:${row.best}%"></div></div>` +
      (row.weak.length
        ? `<div class="dash-task-weak-terms">${row.weak
            .slice(0, 3)
            .map((term) => `<span>${escapeHTML(term)}</span>`)
            .join("")}</div>`
        : "") +
      `</div>` +
      (row.schedule
        ? `<span class="dash-task-due is-${row.schedule.tone}">🔁 ${escapeHTML(row.schedule.label)}</span>`
        : `<span class="dash-weak-pct">${row.best}%</span>`);
    holder.appendChild(link);
  });

  if (rows.length > 6) {
    const more = document.createElement("div");
    more.className = "dash-task-more";
    more.textContent = `+${rows.length - 6} بند آخر`;
    holder.appendChild(more);
  }
}

/* --------------------------------------
   Exam goal vs estimated score
-------------------------------------- */

const GOAL_KEY = "pte.goal.v1";

const GOAL_SOURCES = [
  { key: SWT_STATS_KEY, label: "تلخيص", page: "swt.html" },
  { key: DI_STATS_KEY, label: "وصف صورة", page: "describe-image.html" },
  { key: "pte.ra.stats.v1", label: "قراءة بصوت عالٍ", page: "read-aloud.html" }
];

function loadGoal() {
  try {
    const raw = localStorage.getItem(GOAL_KEY);
    const value = Number(raw);
    return Number.isFinite(value) && value >= MIN_SCORE && value <= MAX_SCORE
      ? value
      : DEFAULT_TARGET;
  } catch {
    return DEFAULT_TARGET;
  }
}

function saveGoal(value) {
  try {
    localStorage.setItem(GOAL_KEY, String(value));
  } catch {
    /* storage may be unavailable; the input still works for this session */
  }
}

function renderGoal() {
  const holder = $("dash-goal");
  const input = $("dash-goal-input");
  if (!holder) return;

  const target = loadGoal();
  if (input) input.value = String(target);

  const rows = GOAL_SOURCES.map((source) => {
    const stats = loadKey(source.key) || {};
    const score = averageToOfficial(stats.correct, stats.total);
    const { gap, reached } = gapToTarget(score, target);
    return { ...source, score, gap, reached };
  });

  const answered = rows.filter((row) => row.score != null);
  const overall = answered.length
    ? Math.round(answered.reduce((sum, row) => sum + row.score, 0) / answered.length)
    : null;
  const overallGap = gapToTarget(overall, target);

  holder.innerHTML =
    `<div class="dash-goal-top">` +
    `<div class="dash-goal-score ${overallGap.reached ? "is-reached" : ""}">` +
    `<span class="dash-goal-number">${overall == null ? "—" : overall}</span>` +
    `<span class="dash-goal-of">/ 90</span>` +
    `</div>` +
    `<div class="dash-goal-caption">` +
    (overall == null
      ? "حلّ أي مهمة لتقدير درجتك"
      : overallGap.reached
        ? `🎉 بلغت هدفك (${overallGap.goal})`
        : `باقي ${overallGap.gap} نقطة لهدف ${overallGap.goal}`) +
    `</div>` +
    `</div>` +
    rows
      .map(
        (row) =>
          `<div class="dash-goal-row">` +
          `<a class="dash-goal-label" href="${row.page}">${row.label}</a>` +
          `<div class="dash-goal-bar"><div class="dash-goal-fill ${row.reached ? "is-reached" : row.score == null ? "is-empty" : ""}" style="width:${row.score == null ? 0 : Math.min(100, (row.score / MAX_SCORE) * 100)}%"></div>` +
          `<div class="dash-goal-target" style="left:${(target / MAX_SCORE) * 100}%"></div></div>` +
          `<span class="dash-goal-value">${row.score == null ? "—" : row.score}</span>` +
          `</div>`
      )
      .join("");

  if (input && !input.dataset.bound) {
    input.dataset.bound = "1";
    input.addEventListener("change", () => {
      const value = Math.min(MAX_SCORE, Math.max(MIN_SCORE, Number(input.value) || DEFAULT_TARGET));
      saveGoal(value);
      renderGoal();
    });
  }
}

/* --------------------------------------
   Backup: export / import / reset
-------------------------------------- */

function reportBackup(kind, heading, lines) {
  const box = $("dash-backup-report");
  if (!box) return;
  box.hidden = false;
  box.className = `dash-backup-report is-${kind}`;
  box.innerHTML =
    `<strong>${escapeHTML(heading)}</strong>` +
    (lines.length
      ? `<ul>${lines.map((line) => `<li>${escapeHTML(line)}</li>`).join("")}</ul>`
      : "");
}

function handleExport() {
  const snapshot = buildSnapshot(localStorage);
  const keys = describeKeys();
  const payload = {
    ...snapshot,
    stats: keys.stats,
    file: "pte-trainer-progress.json"
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `pte-progress-${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  reportBackup("ok", "تم تصدير تقدّمك ✅", [
    `${Object.keys(snapshot.data).length} عنصراً حُفظت في الملف.`,
    "احتفظ بالملف في مكان آمن — استورده في أي متصفح آخر."
  ]);
}

function handleImportFile(file) {
  const reader = new FileReader();

  reader.onload = () => {
    let parsed = null;
    try {
      parsed = JSON.parse(String(reader.result || ""));
    } catch {
      reportBackup("error", "تعذّر قراءة الملف", [
        "الملف ليس JSON صالح. تأكد أنه ملف التصدير من هذا التطبيق."
      ]);
      return;
    }

    const report = mergeSnapshot(localStorage, parsed);

    if (!report.ok) {
      reportBackup("error", "لم يتم الاستيراد ❌", report.errors);
      return;
    }

    const lines = [
      report.applied.length ? `حُدّث ${report.applied.length} مجموعة بيانات.` : "لا جديد في الملف.",
      report.alreadyImported.length ? `${report.alreadyImported.length} مجموعة كانت مستوردة سابقاً وتُركت كما هي.` : "",
      report.changedWords ? `${report.changedWords} كلمة في المفردات.` : "",
      ...report.warnings
    ].filter(Boolean);

    reportBackup("ok", "تم استيراد التقدّم ✅", lines);
    refreshDashboard();
  };

  reader.onerror = () => {
    reportBackup("error", "تعذّر قراءة الملف", ["حدث خطأ أثناء القراءة."]);
  };

  reader.readAsText(file);
}

function confirmReset(scope) {
  const statsOnly = scope === "stats";
  const message = statsOnly
    ? "سيُصفّر سجلّ كل المحاولات (قواعد، اختبارات، تلخيص، صور، قراءة).\nحالة المفردات وجدولة المراجعة ستبقى كما هي.\n\nهل تريد المتابعة؟"
    : "سيُحذف كل شيء: الإحصائيات وحالة المفردات وأهدافك وإعدادات الوضع.\nلا يمكن التراجع.\n\nهل تريد المتابعة؟";

  if (!window.confirm(message)) return;

  const cleared = statsOnly ? resetStats(localStorage) : resetEverything(localStorage);
  reportBackup("ok", statsOnly ? "تم تصفير الإحصائيات 🗑️" : "تم تصفير كل شيء ⚠️", [
    `${cleared.length} مفتاحاً حُذف.`,
    statsOnly ? "حالة المفردات محفوظة." : "ستبدأ من الصفر."
  ]);
  refreshDashboard();
}

function wireBackup() {
  const exportButton = $("dash-export");
  const importButton = $("dash-import");
  const importFile = $("dash-import-file");
  const resetStatsButton = $("dash-reset-stats");
  const resetAllButton = $("dash-reset-all");

  if (exportButton) exportButton.addEventListener("click", handleExport);
  if (importButton && importFile) {
    importButton.addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", () => {
      const file = importFile.files && importFile.files[0];
      if (file) handleImportFile(file);
      importFile.value = "";
    });
  }
  if (resetStatsButton) {
    resetStatsButton.addEventListener("click", () => confirmReset("stats"));
  }
  if (resetAllButton) {
    resetAllButton.addEventListener("click", () => confirmReset("all"));
  }
}

/* Re-read storage and repaint every panel (assets are cached). */
async function refreshDashboard() {
  const { vocabulary, grammar } = await loadAssets();
  renderStats(vocabulary, grammar);
  renderSrs(vocabulary);
  renderChart();
  renderWeak(grammar);
  renderWeakItems();
  renderGoal();
}

/* --------------------------------------
   Initialize
-------------------------------------- */

async function initialize() {
  const { vocabulary, grammar } = await loadAssets();
  renderStats(vocabulary, grammar);
  renderSrs(vocabulary);
  renderChart();
  renderWeak(grammar);
  renderWeakItems();
  renderGoal();
  wireBackup();
}

initialize();