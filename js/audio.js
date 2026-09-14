/* ==========================================
   PTE Trainer
   Audio Engine
   ========================================== */

"use strict";

let currentAudio = null;

export function createAudio(audioPath) {
  if (!audioPath) {
    console.warn("No audio path provided.");
    return null;
  }
  const audio = new Audio(audioPath);
  audio.preload = "auto";
  return audio;
}

export function playAudio(audioPath) {
  stopAudio();

  currentAudio = createAudio(audioPath);
  if (!currentAudio) return;

  currentAudio.currentTime = 0;

  currentAudio.addEventListener(
    "canplaythrough",
    () => {
      if (!currentAudio) return;
      currentAudio.currentTime = 0;
      currentAudio.addEventListener(
        "ended",
        () => {
          document.dispatchEvent(new CustomEvent("audioEnded"));
        },
        { once: true }
      );
      currentAudio.play().catch((error) => {
        console.error("Unable to play audio:", error);
        document.dispatchEvent(new CustomEvent("audioError"));
      });
    },
    { once: true }
  );

  currentAudio.load();
}

export function stopAudio() {
  if (!currentAudio) return;
  currentAudio.pause();
  currentAudio.currentTime = 0;
  currentAudio = null;
}