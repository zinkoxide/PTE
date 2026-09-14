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
  getStudyStatus
} from "./storage.js";

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
const backButton = $("back-button");
const audioButton = $("audio-button");
const learnedButton = $("learned-button");
const reviewButton = $("review-button");
const studyStatus = $("study-status");
const studyFilter = $("study-filter");
const searchInput = $("vocabulary-search");
const clearSearchButton = $("clear-search");
const searchResultsCount = $("search-results-count");
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

  const status = getStudyStatus(item.word);

  learnedButton.classList.toggle("active-learned", status === "learned");
  reviewButton.classList.toggle("active-review", status === "review");

  studyStatus.textContent =
    status === "learned"
      ? "✓ Marked as learned."
      : status === "review"
        ? "↻ Added to review."
        : "Not studied yet.";
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
  const statuses = Object.values(loadStudyState());
  const learned = statuses.filter((s) => s === "learned").length;
  const review = statuses.filter((s) => s === "review").length;
  if (studyCount) {
    studyCount.textContent = `✓ ${learned} learned · ↻ ${review} review`;
  }
}

function matchesStudyFilter(item) {
  const status = getStudyStatus(item.word);
  switch (selectedStudyFilter) {
    case "learned":
      return status === "learned";
    case "review":
      return status === "review";
    case "unstudied":
      return status === null;
    default:
      return true;
  }
}

learnedButton.addEventListener("click", () => toggleStudyStatus("learned"));
reviewButton.addEventListener("click", () => toggleStudyStatus("review"));

/* --------------------------------------
   Audio playback
-------------------------------------- */

audioButton.addEventListener("click", () => {
  const item = filteredVocabulary[currentIndex];
  if (!item) return;

  const path = item.audio || getWordAudio(item.word);
  if (!path) {
    console.log("No vocabulary audio available yet.");
    studyStatus.textContent = "Audio not available.";
    return;
  }

  const audio = new Audio(path);
  audio.play().catch((error) => {
    console.error("Unable to play vocabulary audio:", error);
  });
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
  audioButton.disabled = true;
  learnedButton.disabled = true;
  reviewButton.disabled = true;
  searchMatchInfo.textContent = "";
  studyStatus.textContent = "";
}

function updateWord() {
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
  learnedButton.disabled = false;
  reviewButton.disabled = false;

  updateSearchMatchInfo();
  updateStudyStatus();
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

previousButton.addEventListener("click", () => {
  if (currentIndex <= 0) return;
  currentIndex--;
  updateWord();
});

nextButton.addEventListener("click", () => {
  if (currentIndex >= filteredVocabulary.length - 1) return;
  currentIndex++;
  updateWord();
});

backButton.addEventListener("click", () => {
  window.location.href = "index.html";
});

/* --------------------------------------
   Initialize
-------------------------------------- */

async function initializeVocabulary() {
  vocabulary = await loadVocabulary();
  if (!vocabulary.length) {
    console.error("Vocabulary is empty.");
    return;
  }

  filteredVocabulary = [...vocabulary];
  currentIndex = 0;
  updateStudyCount();
  updateSearchResultsCount();
  updateWord();
  console.log("Vocabulary application ready.");
}

initializeVocabulary();