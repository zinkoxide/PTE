/* ==========================================
   PTE Trainer
   Vocabulary Data Engine
   ========================================== */

"use strict";

let vocabulary = [];
let audioMap = {};

export async function loadVocabulary() {
  try {
    const [vocabResponse, audioResponse] = await Promise.all([
      fetch("./data/vocabulary.json"),
      fetch("./data/vocabulary_audio_index.json")
    ]);

    if (!vocabResponse.ok) {
      throw new Error(`HTTP ${vocabResponse.status}`);
    }

    const data = await vocabResponse.json();
    if (!Array.isArray(data)) {
      throw new Error("Vocabulary data is not an array.");
    }

    vocabulary = data;

    if (audioResponse.ok) {
      const audioData = await audioResponse.json();
      audioMap = audioData && typeof audioData === "object" ? audioData : {};
    } else {
      audioMap = {};
    }

    console.log("Vocabulary loaded:", vocabulary.length);
    return vocabulary;
  } catch (error) {
    console.error("Unable to load vocabulary:", error);
    vocabulary = [];
    audioMap = {};
    return [];
  }
}

export function getVocabulary() {
  return vocabulary;
}

export function getWord(index) {
  if (index < 0 || index >= vocabulary.length) return null;
  return vocabulary[index];
}

export function getWordAudio(word) {
  return audioMap[word] || "";
}