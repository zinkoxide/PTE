/* ==========================================
   PTE Trainer — Vocabulary
   Application Entry Point
   ========================================== */

"use strict";

import {
  loadVocabulary,
  getWordAudio
} from "./vocabulary.js";
import {
  loadStudyState,
  setStudyStatus,
  getStudyStatus,
  getStudyEntry,
  isDue,
  judgeStudy,
  countDueToday,
  loadPronState,
  recordPronunciation,
  getPronunciation,
  needsPronunciation
} from "./storage.js";
import { SpeechEngine } from "./speech.js";
import { wordMatches } from "./pronounce.js";
import {
  VOCAB_COLUMNS,
  buildVocabularyCsv,
  csvFilename,
  downloadCsv
} from "./csv-export.js";
import {
  buildImportPreview,
  describePreview,
  toImportPayload
} from "./csv-import.js";

/* --------------------------------------
   State
-------------------------------------- */

let vocabulary = [];
let filteredVocabulary = [];
let currentIndex = 0;
let searchQuery = "";
let selectedCEFR = "all";
let selectedPartOfSpeech = "all";
let selectedStudyFilter = "all";

/* --------------------------------------
   DOM elements
-------------------------------------- */

const $ = (id) => document.getElementById(id);

const wordNumber = $("word-number");
const progressFill = $("progress-fill");
const wordLevel = $("word-level");
const wordPartOfSpeech = $("word-part-of-speech");
const wordElement = $("word");
const pronunciation = $("pronunciation");
const meaningEN = $("meaning-en");
const meaningAR = $("meaning-ar");
const collocations = $("collocations");
const synonyms = $("synonyms");
const examples = $("examples");
const wordFamily = $("word-family");
const commonMistakes = $("common-mistakes");
const previousButton = $("previous-button");
const nextButton = $("next-button");
const floatNext = $("float-next");
const backButton = $("back-button");
const audioButton = $("audio-button");
const pronunciationButton = $("pronunciation-button");
const pronunciationFeedback = $("pronunciation-feedback");
const learnedButton = $("learned-button");
const reviewButton = $("review-button");
const studyStatus = $("study-status");
const studyFilter = $("study-filter");
const exportButton = $("vocab-export-csv");
const importButton = $("vocab-import-csv");
const editWordButton = $("vocab-edit-word");
const importFileInput = $("vocab-import-file");
const importPanel = $("vocab-import-panel");
const importSummary = $("vocab-import-summary");
const importList = $("vocab-import-list");
const importConfirmButton = $("vocab-import-confirm");
const importCancelButton = $("vocab-import-cancel");
const importResult = $("vocab-import-result");
const searchInput = $("vocabulary-search");
const clearSearchButton = $("clear-search");
const searchResultsCount = $("search-results-count");
const pronSummary = $("pron-summary");
const pronStats = $("pron-stats");
const srsPanel = $("srs-panel");
const srsWord = $("srs-word");
const srsYes = $("srs-yes");
const srsNo = $("srs-no");
const studyCount = $("study-count");
const searchMatchInfo = $("search-match-info");
const cefrFilter = $("cefr-filter");
const partOfSpeechFilter = $("part-of-speech-filter");

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getArrayText(items) {
  if (!Array.isArray(items)) return "";
  return items.join(" ").toLowerCase();
}

function highlightText(text, query) {
  const safeText = escapeHTML(text);
  if (!query) return safeText;

  const safeQuery = escapeHTML(query.trim());
  if (!safeQuery) return safeText;

  const regex = new RegExp(`(${escapeRegExp(safeQuery)})`, "gi");
  return safeText.replace(regex, `<mark class="search-highlight">$1</mark>`);
}

function renderHighlightedText(element, text) {
  element.innerHTML = highlightText(text, searchQuery);
}

function renderList(element, items) {
  element.innerHTML = "";
  if (!Array.isArray(items) || !items.length) {
    element.textContent = "—";
    return;
  }
  items.forEach((item) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.innerHTML = highlightText(item, searchQuery);
    element.appendChild(tag);
  });
}

function renderExamples(items) {
  examples.innerHTML = "";
  if (!Array.isArray(items) || !items.length) {
    const li = document.createElement("li");
    li.textContent = "—";
    examples.appendChild(li);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = highlightText(item, searchQuery);
    examples.appendChild(li);
  });
}

function renderMistakes(items) {
  commonMistakes.innerHTML = "";
  if (!Array.isArray(items) || !items.length) {
    commonMistakes.textContent = "—";
    return;
  }
  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "mistake-item";
    div.innerHTML = highlightText(item, searchQuery);
    commonMistakes.appendChild(div);
  });
}

/* --------------------------------------
   Study status
-------------------------------------- */

function updateStudyStatus() {
  const item = filteredVocabulary[currentIndex];
  if (!item) return;

  const entry = getStudyEntry(item.word);
  const status = entry ? entry.status : null;

  learnedButton.classList.toggle("active-learned", status === "learned");
  reviewButton.classList.toggle("active-review", status === "review");

  studyStatus.textContent =
    status === "learned"
      ? "✓ Marked as learned."
      : status === "review"
        ? "↻ Added to review."
        : "Not studied yet.";

  if (srsPanel) {
    const due = Boolean(entry) && isDue(item.word);
    srsPanel.hidden = !due;
    if (due && srsWord) srsWord.textContent = item.word;
  }
}

function updatePronunciationStats() {
  const item = filteredVocabulary[currentIndex];
  if (!pronStats) return;

  if (!item) {
    pronStats.hidden = true;
    return;
  }
  const pron = getPronunciation(item.word);
  if (!pron || !pron.attempts) {
    pronStats.hidden = true;
    pronStats.className = "pron-pill";
    return;
  }
  pronStats.hidden = false;
  pronStats.classList.toggle("needs-attention", pron.lastCorrect === false);
  pronStats.textContent =
    pron.lastCorrect === false
      ? `🎤 تحتاج نطقاً — ${pron.correct}/${pron.attempts}`
      : `🎤 ${pron.correct}/${pron.attempts} نطق صحيح`;
}

function updatePronSummary() {
  if (!pronSummary) return;
  const entries = Object.values(loadPronState());
  const attempts = entries.reduce((sum, e) => sum + e.attempts, 0);
  const correct = entries.reduce((sum, e) => sum + e.correct, 0);
  pronSummary.hidden = !attempts;
  if (attempts) {
    pronSummary.textContent = `🎤 ${correct}/${attempts} نطق صحيح`;
  }
}

function toggleStudyStatus(status) {
  const item = filteredVocabulary[currentIndex];
  if (!item) return;

  const current = getStudyStatus(item.word);
  const next = current === status ? null : status;
  setStudyStatus(item.word, next);

  if (matchesStudyFilter(item)) {
    updateStudyStatus();
  } else {
    filterVocabulary();
  }
  updateStudyCount();
}

function updateStudyCount() {
  const entries = Object.values(loadStudyState());
  const learned = entries.filter((e) => e.status === "learned").length;
  const review = entries.filter((e) => e.status === "review").length;
  const due = countDueToday();
  if (studyCount) {
    studyCount.textContent = `✓ ${learned} learned · ↻ ${review} review · ⏰ ${due} due`;
  }
}

function matchesStudyFilter(item) {
  const status = getStudyStatus(item.word);
  switch (selectedStudyFilter) {
    case "learned":
      return status === "learned";
    case "review":
      return status === "review";
    case "due":
      return Boolean(getStudyEntry(item.word)) && isDue(item.word);
    case "needs-pron":
      return needsPronunciation(item.word);
    case "unstudied":
      return status === null;
    default:
      return true;
  }
}

learnedButton.addEventListener("click", () => toggleStudyStatus("learned"));
reviewButton.addEventListener("click", () => toggleStudyStatus("review"));

srsYes.addEventListener("click", () => {
  const item = filteredVocabulary[currentIndex];
  if (!item) return;
  judgeStudy(item.word, true);
  updateStudyStatus();
  updateStudyCount();
});

srsNo.addEventListener("click", () => {
  const item = filteredVocabulary[currentIndex];
  if (!item) return;
  judgeStudy(item.word, false);
  updateStudyStatus();
  updateStudyCount();
});

/* --------------------------------------
   Audio playback
-------------------------------------- */

function playCurrentAudio() {
  const item = filteredVocabulary[currentIndex];
  if (!item) return;

  const path = item.audio || getWordAudio(item.word);
  if (!path) {
    console.log("No vocabulary audio available yet.");
    if (studyStatus) studyStatus.textContent = "Audio not available.";
    return false;
  }

  const audio = new Audio(path);
  audio.play().catch((error) => {
    console.error("Unable to play vocabulary audio:", error);
  });
  return true;
}

audioButton.addEventListener("click", playCurrentAudio);

/* --------------------------------------
   Pronunciation check
-------------------------------------- */

let speechEngine = null;
let speechMonitor = null;
const PRON_TIMEOUT_MS = 9000;

function setPronunciationState(state, message) {
  if (!pronunciationFeedback) return;
  pronunciationFeedback.hidden = false;
  pronunciationFeedback.className = `pron-feedback ${state}`;
  pronunciationFeedback.innerHTML = message;
  pronunciationButton.classList.toggle("listening", state === "listening");
  pronunciationButton.textContent =
    state === "listening" ? "⏹ إيقاف" : "🎤 تحقق من النطق";
  [audioButton, learnedButton, reviewButton, previousButton, nextButton, floatNext].forEach(
    (button) => {
      if (button) button.disabled = state === "listening";
    }
  );
}

function resetPronunciation() {
  stopPronunciationCheck();
  if (!pronunciationButton || !pronunciationFeedback) return;
  pronunciationButton.classList.remove("listening");
  pronunciationButton.textContent = "🎤 تحقق من النطق";
  pronunciationFeedback.hidden = true;
  pronunciationFeedback.className = "pron-feedback";
  [audioButton, learnedButton, reviewButton, previousButton, nextButton, floatNext].forEach(
    (button) => {
      if (button) button.disabled = false;
    }
  );
  if (filteredVocabulary.length) {
    const item = filteredVocabulary[currentIndex];
    if (item && currentIndex >= filteredVocabulary.length - 1) {
      if (floatNext) floatNext.hidden = true;
    }
  }
}

function stopPronunciationCheck() {
  if (speechMonitor) {
    clearTimeout(speechMonitor);
    speechMonitor = null;
  }
  if (speechEngine && speechEngine.isListening) {
    speechEngine.stop();
  }
}

function startPronunciationCheck() {
  const item = filteredVocabulary[currentIndex];
  if (!item || !item.word) return;

  if (!speechEngine) {
    try {
      speechEngine = new SpeechEngine();
    } catch (error) {
      setPronunciationState("error", "✋ التعرف على الصوت غير متاح في هذا المتصفح.");
      return;
    }
  }
  if (!speechEngine.isSupported()) {
    setPronunciationState("error", "✋ متصفحك لا يدعم التحقق من النطق — جرّب Chrome أو Edge.");
    return;
  }

  speechEngine.onStart = () => {
    setPronunciationState("listening", "🎧 استمع الآن… اقرأ الكلمة بصوتٍ واضح");
  };
  speechEngine.onResult = (transcript, confidence) => {
    const spoken = String(transcript || "").trim();
    const match = wordMatches(item.word, spoken);
    recordPronunciation(item.word, match);
    updatePronunciationStats();
    updatePronSummary();
    if (match) {
      const conf = Math.round((confidence || 0) * 100);
      setPronunciationState(
        "good",
        `✅ صحيح! نطق ممتاز للكلمة «${escapeHTML(item.word)}»` +
          (conf ? ` · الثقة ${conf}%` : "") +
          "."
      );
    } else {
      setPronunciationState(
        "bad",
        `❌ ليس صحيحاً — حاول مرة أخرى<br>` +
          `<span class="pron-heard">سُمِع: “${escapeHTML(spoken || "…")}”</span>`
      );
      playCurrentAudio();
    }
  };
  speechEngine.onError = (error) => {
    if (error === "not-allowed" || error === "service-not-allowed") {
      setPronunciationState("error", "🔇 يُرجى السماح باستخدام الميكروفون ثم المحاولة مجدداً.");
    } else if (error === "no-speech") {
      setPronunciationState("bad", "🤔 لم أسمع شيئاً — حاول مرة أخرى");
    } else if (error === "network") {
      setPronunciationState("error", "⚠️ فشل الاتصال بخدمة التعرف — تحقق من الإنترنت.");
    } else if (error === "aborted") {
      resetPronunciation();
    } else {
      setPronunciationState("error", `⚠️ حدث خطأ أثناء الاستماع (${escapeHTML(error || "unknown")}).`);
    }
  };
  speechEngine.onEnd = () => {
    if (speechMonitor) {
      clearTimeout(speechMonitor);
      speechMonitor = null;
    }
    pronunciationButton.classList.remove("listening");
  };

  try {
    speechEngine.start();
  } catch (error) {
    resetPronunciation();
    setPronunciationState("error", "⚠️ تعذر بدء الاستماع — تأكد من إذن الميكروفون.");
    return;
  }

  speechMonitor = setTimeout(() => {
    speechMonitor = null;
    if (speechEngine && speechEngine.isListening) {
      speechEngine.stop();
      setPronunciationState("bad", "⏱ انتهت مهلة الاستماع — حاول مرة أخرى");
    }
  }, PRON_TIMEOUT_MS);
}

pronunciationButton.addEventListener("click", () => {
  if (speechEngine && speechEngine.isListening) {
    stopPronunciationCheck();
    resetPronunciation();
    return;
  }
  startPronunciationCheck();
});

/* --------------------------------------
   Search match info
-------------------------------------- */

function getSearchMatchLocations(item, query) {
  if (!query) return [];
  const locations = [];
  const normalizedQuery = query.toLowerCase();

  const check = (value, label) => {
    if (value && String(value).toLowerCase().includes(normalizedQuery)) {
      locations.push(label);
    }
  };

  check(item.word, "Word");
  check(item.meaningEN, "English Meaning");
  check(item.meaningAR, "Arabic Meaning");
  check(getArrayText(item.collocations), "Collocations");
  check(getArrayText(item.synonyms), "Synonyms");
  check(getArrayText(item.wordFamily), "Word Family");
  check(getArrayText(item.examples), "Examples");
  check(getArrayText(item.commonMistakes), "Common Mistakes");

  return locations;
}

function updateSearchMatchInfo() {
  const query = searchQuery.trim().toLowerCase();
  if (!query) {
    searchMatchInfo.textContent = "";
    return;
  }
  if (!filteredVocabulary.length) {
    searchMatchInfo.textContent = "No matches found.";
    return;
  }

  const item = filteredVocabulary[currentIndex];
  const locations = getSearchMatchLocations(item, query);
  if (!locations.length) {
    searchMatchInfo.textContent = "";
    return;
  }

  searchMatchInfo.innerHTML =
    `<strong>Matched in:</strong> ${locations.join(", ")}`;
}

function updateSearchResultsCount() {
  const total = filteredVocabulary.length;
  searchResultsCount.textContent = `${total} / ${vocabulary.length} words`;
}

/* --------------------------------------
   Search rankings
-------------------------------------- */

function getMatchScore(item, query) {
  if (!query) return 0;

  const normalizedQuery = query.toLowerCase();
  const word = String(item.word || "").toLowerCase();
  const meaningEN = String(item.meaningEN || "").toLowerCase();
  const meaningAR = String(item.meaningAR || "").toLowerCase();
  const collocations = getArrayText(item.collocations);
  const synonyms = getArrayText(item.synonyms);
  const wordFamily = getArrayText(item.wordFamily);
  const examples = getArrayText(item.examples);
  const commonMistakes = getArrayText(item.commonMistakes);

  if (word === normalizedQuery) return 1000;
  if (word.startsWith(normalizedQuery)) return 900;
  if (word.includes(normalizedQuery)) return 800;
  if (meaningEN.includes(normalizedQuery)) return 700;
  if (meaningAR.includes(normalizedQuery)) return 650;
  if (collocations.includes(normalizedQuery)) return 600;
  if (synonyms.includes(normalizedQuery)) return 500;
  if (wordFamily.includes(normalizedQuery)) return 400;
  if (examples.includes(normalizedQuery)) return 300;
  if (commonMistakes.includes(normalizedQuery)) return 200;

  return 0;
}

function matchesPartOfSpeechValue(value, selected) {
  if (!value) return false;
  return String(value)
    .toLowerCase()
    .split(";")
    .map((item) => item.trim())
    .includes(selected.toLowerCase());
}

/* --------------------------------------
   Filtering
-------------------------------------- */

function filterVocabulary() {
  const query = searchQuery.trim().toLowerCase();

  let results = vocabulary.filter((item) => {
    const matchesSearch = !query || getMatchScore(item, query) > 0;
    const matchesCEFR =
      selectedCEFR === "all" || item.cefrLevel === selectedCEFR;
    const matchesPartOfSpeech =
      selectedPartOfSpeech === "all" ||
      matchesPartOfSpeechValue(item.partOfSpeech, selectedPartOfSpeech);
    return matchesSearch && matchesCEFR && matchesPartOfSpeech && matchesStudyFilter(item);
  });

  if (query) {
    results.sort((a, b) => getMatchScore(b, query) - getMatchScore(a, query));
  }

  filteredVocabulary = results;
  currentIndex = 0;

  updateSearchResultsCount();
  updateWord();
}

/* --------------------------------------
   Word rendering
-------------------------------------- */

function clearWordDisplay() {
  wordNumber.textContent = "0 / 0";
  progressFill.style.width = "0%";
  wordLevel.textContent = "—";
  wordPartOfSpeech.textContent = "—";
  wordElement.textContent = "No results";
  pronunciation.textContent = "—";
  meaningEN.textContent = "No vocabulary matches your search.";
  meaningAR.textContent = "لا توجد نتائج مطابقة.";
  collocations.textContent = "—";
  synonyms.textContent = "—";
  examples.innerHTML = "<li>—</li>";
  wordFamily.textContent = "—";
  commonMistakes.textContent = "—";
  previousButton.disabled = true;
  nextButton.disabled = true;
  if (floatNext) floatNext.hidden = true;
  audioButton.disabled = true;
  pronunciationButton.disabled = true;
  learnedButton.disabled = true;
  reviewButton.disabled = true;
  searchMatchInfo.textContent = "";
  studyStatus.textContent = "";
  if (pronStats) pronStats.hidden = true;
  if (srsPanel) srsPanel.hidden = true;
}

function updateWord() {
  resetPronunciation();

  if (!filteredVocabulary.length) {
    clearWordDisplay();
    return;
  }

  const item = filteredVocabulary[currentIndex];

  wordNumber.textContent = `${currentIndex + 1} / ${filteredVocabulary.length}`;
  progressFill.style.width = `${((currentIndex + 1) / filteredVocabulary.length) * 100}%`;

  wordLevel.textContent = item.cefrLevel || "—";
  wordLevel.className = `cefr-tag cefr-${String(item.cefrLevel || "").toUpperCase()}`;

  wordPartOfSpeech.textContent = item.partOfSpeech || "—";
  renderHighlightedText(wordElement, item.word || "—");
  pronunciation.textContent = item.pronunciation || "—";

  renderHighlightedText(meaningEN, item.meaningEN || "—");
  renderHighlightedText(meaningAR, item.meaningAR || "—");

  renderList(collocations, item.collocations);
  renderList(synonyms, item.synonyms);
  renderExamples(item.examples);
  renderList(wordFamily, item.wordFamily);
  renderMistakes(item.commonMistakes);

  previousButton.disabled = currentIndex === 0;
  nextButton.disabled = currentIndex === filteredVocabulary.length - 1;
  audioButton.disabled = false;
  pronunciationButton.disabled = false;
  learnedButton.disabled = false;
  reviewButton.disabled = false;
  if (floatNext) {
    floatNext.hidden = currentIndex >= filteredVocabulary.length - 1;
    floatNext.disabled = false;
  }

  updateSearchMatchInfo();
  updateStudyStatus();
  updatePronunciationStats();
  updatePronSummary();
}

/* --------------------------------------
   Events
-------------------------------------- */

searchInput.addEventListener("input", (event) => {
  searchQuery = event.target.value;
  filterVocabulary();
});

clearSearchButton.addEventListener("click", () => {
  searchQuery = "";
  searchInput.value = "";
  filterVocabulary();
  searchInput.focus();
});

cefrFilter.addEventListener("change", (event) => {
  selectedCEFR = event.target.value;
  filterVocabulary();
});

partOfSpeechFilter.addEventListener("change", (event) => {
  selectedPartOfSpeech = event.target.value;
  filterVocabulary();
});

studyFilter.addEventListener("change", (event) => {
  selectedStudyFilter = event.target.value;
  filterVocabulary();
});

function goNext() {
  if (currentIndex >= filteredVocabulary.length - 1) return;
  currentIndex++;
  updateWord();
}

previousButton.addEventListener("click", () => {
  if (currentIndex <= 0) return;
  currentIndex--;
  updateWord();
});

nextButton.addEventListener("click", goNext);
if (floatNext) floatNext.addEventListener("click", goNext);

backButton.addEventListener("click", () => {
  window.location.href = "index.html";
});

/* --------------------------------------
   Initialize
-------------------------------------- */

/* --------------------------------------
   CSV export

   Exports exactly what the learner is
   looking at, so a search or filter acts as
   the selection. The study status column
   comes from localStorage because it is not
   part of vocabulary.json.
-------------------------------------- */

function exportColumns() {
  return [
    ...VOCAB_COLUMNS,
    {
      key: "studyStatus",
      label: "Study status",
      value: (entry) => getStudyStatus(entry.word) || "—"
    },
    {
      key: "dueLabel",
      label: "Due",
      value: (entry) => {
        const study = getStudyEntry(entry.word);
        if (!study || !study.due) return "";
        const days = Math.round((study.due - Date.now()) / 86400000);
        if (days < 0) return `overdue ${Math.abs(days)}d`;
        if (days === 0) return "today";
        return `in ${days}d`;
      }
    }
  ];
}

function showExportNote(message, tone) {
  const note = $("vocab-export-note");
  if (!note) return;
  note.hidden = false;
  note.textContent = message;
  note.className = `vocab-export-note${tone ? ` is-${tone}` : ""}`;
}

/* True when the learner narrowed the list in any way. */
function hasActiveFilter() {
  return Boolean(
    searchQuery ||
      selectedCEFR !== "all" ||
      selectedPartOfSpeech !== "all" ||
      selectedStudyFilter !== "all"
  );
}

function handleExportCsv() {
  const scoped = hasActiveFilter();

  /*
  A search that matches nothing must not silently fall back to the whole
  bank — exporting 1001 rows when the learner asked for 3 would be a
  nasty surprise.
  */
  if (!filteredVocabulary.length) {
    showExportNote(
      vocabulary.length
        ? "Nothing matches the current search and filters — clear them to export the full list."
        : "There is nothing to export yet.",
      "warn"
    );
    return;
  }

  const words = filteredVocabulary;
  const csv = buildVocabularyCsv(words, exportColumns());
  const filename = downloadCsv(csvFilename(), csv);

  showExportNote(
    `Exported ${words.length} word${words.length === 1 ? "" : "s"}` +
      `${scoped ? " matching the current search and filters" : ""} to ${filename}.`,
    "ok"
  );
}

/* --------------------------------------
   CSV import

   The file is parsed and previewed in the
   browser first: words already in the bank
   are dropped, and only the survivors are
   sent to the add server, which re-checks,
   numbers them from the end of the bank and
   generates their audio.
-------------------------------------- */

const LAST_IMPORT_KEY = "pte.vocab.lastImport.v1";

let pendingImport = null;

const ADD_SERVER_ORIGIN = "http://127.0.0.1:5000";

/*
Where the add API lives. Normally the app is opened through the add server
itself, in which case a relative path is enough. When the learner keeps some
other static server for reading, the request goes straight to the add server
on port 5000 — the server allows loopback origins for exactly this case.
*/
function apiUrl(path) {
  return isAddServerOrigin() ? path : `${ADD_SERVER_ORIGIN}${path}`;
}

function isAddServerOrigin() {
  return location.port === "5000" || location.protocol === "http:" && location.hostname === "127.0.0.1" && location.port === "5000";
}

async function probeStatus(url) {
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}

/*
The add server is a separate process on port 5000, and the app must be opened
through it for saving to work. When the page is served by some other static
server the relative /api call can never succeed, so that case is detected and
named instead of failing silently.
*/
async function checkAddServer() {
  const reachable = async (url) => {
    try {
      return await probeStatus(url);
    } catch (error) {
      return null;
    }
  };

  const data = await reachable(apiUrl("/api/status"));

  if (data && data.running) {
    if (data.serviceEnabled === false) {
      return { ok: false, text: "Add server: the service is stopped", elsewhere: false };
    }
    return {
      ok: true,
      elsewhere: !isAddServerOrigin(),
      text: isAddServerOrigin()
        ? "Add server: running"
        : "Add server: running on port 5000 — saving from here works"
    };
  }

  return {
    ok: false,
    elsewhere: false,
    text: "Add server: not running — start it with bash tools/start_add_word.sh"
  };
}

function renderServerBadge(status) {
  const badge = $("vocab-import-server");
  if (!badge) return;
  badge.textContent = status.text;
  badge.classList.toggle("is-ok", status.ok);
}

function rememberReport(report) {
  try {
    localStorage.setItem(LAST_IMPORT_KEY, JSON.stringify(report));
  } catch {
    /* storage may be unavailable */
  }
}

function showRememberedReport() {
  let report = null;
  try {
    const raw = localStorage.getItem(LAST_IMPORT_KEY);
    report = raw ? JSON.parse(raw) : null;
  } catch {
    report = null;
  }
  if (!report || !report.text) return;

  openImportPanel();
  showImportResult(report.text, report.tone === "ok" ? "ok" : "warn");
}

/* Re-read the word bank so the counts update without a manual reload. */
async function refreshVocabulary() {
  vocabulary = await loadVocabulary();
  filterVocabulary();
  updateStudyCount();
}

function openImportPanel() {
  if (importPanel) importPanel.hidden = false;
}

function showImportResult(message, tone) {
  if (!importResult) return;
  importResult.hidden = false;
  importResult.textContent = message;
  importResult.className = `vocab-export-note${tone ? ` is-${tone}` : ""}`;
}

function closeImportPanel() {
  pendingImport = null;
  if (importPanel) importPanel.hidden = true;
  if (importConfirmButton) importConfirmButton.disabled = false;
  if (importResult) importResult.hidden = true;
}

function renderImportPreview(csvText) {
  const existingWords = vocabulary.map((entry) => entry.word);
  const preview = buildImportPreview(csvText, existingWords);

  if (!importPanel) return;

  if (!preview.ok) {
    importPanel.hidden = false;
    importSummary.textContent = describePreview(preview);
    importList.innerHTML = "";
    if (importConfirmButton) importConfirmButton.disabled = true;
    showImportResult(
      "شغّل «تصدير CSV» من هذه الصفحة أولاً لتحصل على ملف بالشكل الصحيح.",
      "warn"
    );
    return;
  }

  pendingImport = preview;

  const incompleteNote = preview.incomplete && preview.incomplete.length
    ? ` Missing or incomplete: ${preview.incomplete
        .slice(0, 5)
        .map((entry) => `${entry.word || "(no word)"} [${entry.missing.join(", ")}]`)
        .join(" · ")}${preview.incomplete.length > 5 ? ` … +${preview.incomplete.length - 5}` : ""}`
    : "";

  importSummary.textContent =
    `${describePreview(preview)} — ` +
    (preview.totals.add
      ? `the new words will be numbered from ${preview.fresh[0].number}.`
      : "nothing will be added.") +
    incompleteNote;

  importList.innerHTML = preview.fresh
    .slice(0, 40)
    .map(
      (entry) =>
        `<li>${escapeForCsv(entry.word)} <b>#${entry.number}</b></li>`
    )
    .join("");

  if (preview.fresh.length > 40) {
    importList.innerHTML += `<li>… +${preview.fresh.length - 40} more</li>`;
  }

  if (importConfirmButton) importConfirmButton.disabled = preview.totals.add === 0;

  showImportResult(
    preview.totals.add
      ? "Words that already exist are skipped automatically. Saving needs the add server."
      : "Nothing new in this file.",
    preview.totals.add ? "ok" : "warn"
  );

  importPanel.hidden = false;
}

function escapeForCsv(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function confirmImport() {
  if (!pendingImport || !pendingImport.totals.add) return;

  if (importConfirmButton) {
    importConfirmButton.disabled = true;
    importResult.textContent = "Saving…";
  }

  try {
    const response = await fetch(apiUrl("/api/import-words"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toImportPayload(pendingImport))
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      let text = data.error || "";
      if (response.status === 404 || !text) {
        const status = await checkAddServer();
        text = status.elsewhere
          ? `الصفحة مفتوحة من خادم آخر. ${status.text}`
          : text || "تعذّر الحفظ — تأكد أن خادم الإضافة يعمل.";
      }
      showImportResult(text, "warn");
      rememberReport({ text, tone: "warn", at: Date.now() });
      if (importConfirmButton) importConfirmButton.disabled = false;
      return;
    }

    const parts = [`تمت إضافة ${data.added.length} كلمة.`];
    if (data.withoutAudio && data.withoutAudio.length) {
      parts.push(
        `${data.withoutAudio.length} كلمة بدون صوت (${data.withoutAudio
          .map((entry) => entry.word)
          .join(", ")}) — يمكنك توليد الصوت لاحقاً.`
      );
    }
    if (data.skipped && data.skipped.length) {
      parts.push(`${data.skipped.length} مكررة تم تخطّيها.`);
    }
    if (data.repeated && data.repeated.length) {
      parts.push(`${data.repeated.length} مكررة داخل الملف نفسه تم تخطّيها.`);
    }
    if (data.rejected && data.rejected.length) {
      parts.push(
        `${data.rejected.length} مرفوضة: ${data.rejected
          .map((entry) => `${entry.word} (${entry.errors[0]})`)
          .join(" · ")}`
      );
    }
    const text = parts.join(" ");
    showImportResult(text, "ok");
    rememberReport({ text, tone: "ok", at: Date.now() });

    importSummary.textContent = `Added: ${data.added
      .map((entry) => `${entry.word} #${entry.number}`)
      .join(" · ")}`;
    importList.innerHTML = "";
    pendingImport = null;

    /* Pull the new bank in so the header count is right immediately. */
    if (data.added.length) await refreshVocabulary();
  } catch (error) {
    const status = await checkAddServer();
    const text = status.elsewhere
      ? `الصفحة مفتوحة من خادم آخر. ${status.text} ثم أعد الاستيراد.`
      : "تعذّر الاتصال بخادم الإضافة — شغّل: bash tools/start_add_word.sh ثم أعد المحاولة.";
    showImportResult(text, "warn");
    rememberReport({ text, tone: "warn", at: Date.now() });
    if (importConfirmButton) importConfirmButton.disabled = false;
  }
}

async function initializeVocabulary() {
  vocabulary = await loadVocabulary();
  if (!vocabulary.length) {
    console.error("Vocabulary is empty.");
    return;
  }

  filteredVocabulary = [...vocabulary];
  currentIndex = 0;
  const params = new URLSearchParams(window.location.search);
  if (params.get("study") === "due" || params.get("due") === "1") {
    selectedStudyFilter = "due";
    if (studyFilter) studyFilter.value = "due";
    filterVocabulary();
  } else {
    updateStudyCount();
    updateSearchResultsCount();
    updateWord();
  }
  console.log("Vocabulary application ready.");
}

if (exportButton) exportButton.addEventListener("click", handleExportCsv);
if (importButton && importFileInput) {
  importButton.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", async () => {
    const file = importFileInput.files && importFileInput.files[0];
    if (!file) return;
    openImportPanel();
    const status = await checkAddServer();
    renderServerBadge(status);
    renderImportPreview(await file.text());
  });
}
if (importConfirmButton) importConfirmButton.addEventListener("click", confirmImport);
if (importCancelButton) importCancelButton.addEventListener("click", closeImportPanel);
if (editWordButton) {
  editWordButton.addEventListener("click", () => {
    const item = filteredVocabulary[currentIndex];
    if (!item) return;
    window.location.href = `./add-word.html?edit=${encodeURIComponent(item.word)}`;
  });
}
showRememberedReport();

initializeVocabulary();