/* ==========================================
   PTE Trainer — Repeat Sentence
   Application Entry Point
   ========================================== */

"use strict";

import { playAudio, stopAudio } from "./audio.js";
import { SpeechEngine } from "./speech.js";
import { compareSentences } from "./compare.js";
import { calculateScore } from "./score.js";

/* --------------------------------------
   DOM elements
-------------------------------------- */

const playButton = document.getElementById("play-button");
const audioStatus = document.getElementById("audio-status");
const questionNumber = document.getElementById("question-number");
const progressFill = document.getElementById("progress-fill");
const wordCount = document.getElementById("word-count");
const difficultySelect = document.getElementById("difficulty-select");
const sentenceDisplay = document.getElementById("sentence-display");
const previousButton = document.getElementById("previous-button");
const nextButton = document.getElementById("next-button");
const showSentenceButton = document.getElementById("show-sentence-button");
const recordButton = document.getElementById("record-button");
const stopButton = document.getElementById("stop-button");
const recordingStatus = document.getElementById("recording-status");
const speechResult = document.getElementById("speech-result");
const practiceScore = document.getElementById("practice-score");
const accuracyScore = document.getElementById("accuracy-score");
const correctCount = document.getElementById("correct-count");
const wrongCount = document.getElementById("wrong-count");
const missingCount = document.getElementById("missing-count");
const extraCount = document.getElementById("extra-count");
const performanceResult = document.getElementById("performance-result");
const wordComparison = document.getElementById("comparison-result");
const feedbackResult = document.getElementById("feedback-result");

/* --------------------------------------
   State
-------------------------------------- */

let sentences = [];
let allSentences = [];
let currentIndex = 0;
let sentenceVisible = false;

const speechEngine = new SpeechEngine();

/* --------------------------------------
   Helpers
-------------------------------------- */

function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).length;
}

function shuffle(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function setAudioPlaying(playing) {
  playButton.disabled = playing;
  recordButton.disabled = playing;
  audioStatus.textContent = playing ? "Playing…" : "Ready";
}

/* --------------------------------------
   Load data
-------------------------------------- */

async function loadSentences() {
  try {
    const response = await fetch("./data/repeat_sentences.json");
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

    allSentences = await response.json();
    sentences = [...allSentences];
    console.log("Sentences loaded:", sentences.length);

    updateQuestion();
  } catch (error) {
    console.error("Unable to load sentences:", error);
    sentenceDisplay.textContent = "Unable to load sentence data.";
  }
}

/* --------------------------------------
   Question rendering
-------------------------------------- */

function updateQuestion() {
  if (!sentences.length) return;

  stopAudio();
  setAudioPlaying(false);

  const sentence = sentences[currentIndex];

  questionNumber.textContent = `${currentIndex + 1} / ${sentences.length}`;
  progressFill.style.width = `${((currentIndex + 1) / sentences.length) * 100}%`;
  wordCount.textContent = `${countWords(sentence.text)} words`;
  difficultySelect.value = sentence.level || "random";

  sentenceDisplay.textContent = "Listen carefully…";
  sentenceDisplay.classList.remove("revealed");
  sentenceVisible = false;
  showSentenceButton.textContent = "👁 Show Sentence";
  showSentenceButton.disabled = true;

  // Reset results
  speechResult.textContent = "Your answer will appear here.";
  practiceScore.textContent = "0";
  accuracyScore.textContent = "0%";
  correctCount.textContent = "0";
  wrongCount.textContent = "0";
  missingCount.textContent = "0";
  extraCount.textContent = "0";
  performanceResult.textContent = "—";
  wordComparison.innerHTML = "";
  wordComparison.textContent = "Your comparison will appear here.";
  feedbackResult.textContent = "Your feedback will appear here.";

  recordingStatus.textContent = "Ready";
  recordingStatus.className = "pill";
  recordButton.disabled = false;
  stopButton.disabled = true;
  audioStatus.textContent = "Ready";

  previousButton.disabled = currentIndex === 0;
  nextButton.disabled = currentIndex === sentences.length - 1;
}

/* --------------------------------------
   Audio
-------------------------------------- */

function playCurrentAudio() {
  if (!sentences.length) return;
  const sentence = sentences[currentIndex];
  if (!sentence.audio) {
    console.warn("No audio file assigned.");
    audioStatus.textContent = "No audio";
    return;
  }
  setAudioPlaying(true);
  playAudio(`./assets/audio/${sentence.audio}`);
}

document.addEventListener("audioEnded", () => {
  setAudioPlaying(false);
  showSentenceButton.disabled = false;
});

document.addEventListener("audioError", () => {
  setAudioPlaying(false);
  audioStatus.textContent = "Playback failed";
  showSentenceButton.disabled = false;
});

playButton.addEventListener("click", playCurrentAudio);

/* --------------------------------------
   Show / hide sentence
-------------------------------------- */

showSentenceButton.addEventListener("click", () => {
  const sentence = sentences[currentIndex];
  if (!sentence) return;

  sentenceVisible = !sentenceVisible;
  if (sentenceVisible) {
    sentenceDisplay.textContent = sentence.text;
    sentenceDisplay.classList.add("revealed");
    showSentenceButton.textContent = "👁 Hide Sentence";
  } else {
    sentenceDisplay.textContent = "Listen carefully…";
    sentenceDisplay.classList.remove("revealed");
    showSentenceButton.textContent = "👁 Show Sentence";
  }
});

/* --------------------------------------
   Difficulty filter
-------------------------------------- */

difficultySelect.addEventListener("change", () => {
  const selectedLevel = difficultySelect.value;

  sentences =
    selectedLevel === "random"
      ? shuffle(allSentences)
      : allSentences.filter((sentence) => sentence.level === selectedLevel);

  currentIndex = 0;
  updateQuestion();
  console.log(
    `Difficulty: ${selectedLevel} — ${sentences.length} sentences`
  );
});

/* --------------------------------------
   Navigation (blocked while recording)
-------------------------------------- */

function canNavigate() {
  return stopButton.disabled;
}

nextButton.addEventListener("click", () => {
  if (!canNavigate()) return;
  if (currentIndex < sentences.length - 1) {
    currentIndex++;
    updateQuestion();
  }
});

previousButton.addEventListener("click", () => {
  if (!canNavigate()) return;
  if (currentIndex > 0) {
    currentIndex--;
    updateQuestion();
  }
});

/* --------------------------------------
   Comparison rendering
-------------------------------------- */

function renderComparison(operations) {
  wordComparison.innerHTML = "";
  feedbackResult.innerHTML = "";

  const missingWords = [];
  const wrongWords = [];
  const extraWords = [];

  operations.forEach((operation) => {
    const span = document.createElement("span");

    switch (operation.type) {
      case "correct":
        span.textContent = `${operation.spoken} `;
        span.className = "word-correct";
        break;
      case "normalized":
        span.textContent = `[${operation.spoken} ≈ ${operation.original}] `;
        span.className = "word-normalized";
        break;
      case "wrong":
        span.textContent = `[${operation.spoken} → ${operation.original}] `;
        span.className = "word-wrong";
        wrongWords.push({ spoken: operation.spoken, original: operation.original });
        break;
      case "missing":
        span.textContent = `[missing: ${operation.original}] `;
        span.className = "word-missing";
        missingWords.push(operation.original);
        break;
      case "extra":
        span.textContent = `[extra: ${operation.spoken}] `;
        span.className = "word-extra";
        extraWords.push(operation.spoken);
        break;
    }

    wordComparison.appendChild(span);
  });

  const hasErrors =
    missingWords.length > 0 || wrongWords.length > 0 || extraWords.length > 0;

  if (!hasErrors) {
    const good = document.createElement("div");
    good.className = "feedback-good";
    good.textContent = "Excellent! No word errors.";
    feedbackResult.appendChild(good);
    return;
  }

  const build = (title, words, renderer) => {
    if (!words.length) return;
    const heading = document.createElement("h4");
    heading.textContent = title;
    feedbackResult.appendChild(heading);
    words.forEach((word) => {
      const item = document.createElement("div");
      item.className = "feedback-item";
      item.innerHTML = renderer(word);
      feedbackResult.appendChild(item);
    });
  };

  build("Missing:", missingWords, (w) => `• ${w}`);
  build("Wrong:", wrongWords, (w) => `• <b>${w.spoken}</b> → ${w.original}`);
  build("Extra:", extraWords, (w) => `• ${w}`);
}

/* --------------------------------------
   Speech recognition flow
-------------------------------------- */

speechEngine.onStart = () => {
  recordingStatus.textContent = "Listening…";
  recordingStatus.className = "pill live";
  recordButton.disabled = true;
  stopButton.disabled = false;
  playButton.disabled = true;
  showSentenceButton.disabled = true;
  speechResult.textContent = "Listening…";
};

speechEngine.onResult = (transcript, confidence) => {
  speechResult.textContent = transcript;

  const currentSentence = sentences[currentIndex];
  if (!currentSentence) return;

  const comparison = compareSentences(currentSentence.text, transcript);
  const result = calculateScore(comparison);

  practiceScore.textContent = result.score;
  accuracyScore.textContent = `${Math.round(result.accuracy)}%`;
  correctCount.textContent = result.correct;
  wrongCount.textContent = result.wrong;
  missingCount.textContent = result.missing;
  extraCount.textContent = result.extra;
  performanceResult.textContent = result.level;

  renderComparison(comparison.operations);

  console.log("Comparison:", comparison);
  console.log("Score:", result);
  console.log("Confidence:", confidence);
};

speechEngine.onEnd = () => {
  recordingStatus.textContent = "Ready";
  recordingStatus.className = "pill";
  recordButton.disabled = false;
  stopButton.disabled = true;
  playButton.disabled = false;
  showSentenceButton.disabled = false;
};

speechEngine.onError = (error) => {
  recordingStatus.textContent = `Error: ${error}`;
  recordingStatus.className = "pill warn";
  recordButton.disabled = false;
  stopButton.disabled = true;
  playButton.disabled = false;
  showSentenceButton.disabled = false;
  console.error("Speech recognition error:", error);
};

recordButton.addEventListener("click", () => {
  try {
    speechEngine.start();
  } catch (error) {
    console.error("Unable to start speech recognition:", error);
    recordingStatus.textContent = "Not supported in this browser";
    recordingStatus.className = "pill warn";
  }
});

stopButton.addEventListener("click", () => speechEngine.stop());

/* --------------------------------------
   Initialize
-------------------------------------- */

loadSentences();