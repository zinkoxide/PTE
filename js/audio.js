/* ==========================================
   PTE Trainer
   Audio Engine
   ========================================== */

"use strict";

/*
Spoken task audio lives in `assets/audio`, one
folder per task so the numbered files cannot
overwrite each other. The path is rebuilt from
the item id, which means the page never has to
trust (or even read) an audio field in the JSON.

`tools/generate_audio.py` writes these files
with Edge TTS. When one is missing the caller
falls back to the browser voice, so a task is
never dead because a file is absent.
*/
const AUDIO_ROOT = "./assets/audio";

export const TASK_AUDIO_FOLDERS = {
  repeat: "",
  "read-aloud": "read-aloud/"
};

export function taskAudioPath(dataset, fileName) {
  const folder = TASK_AUDIO_FOLDERS[dataset];
  if (folder == null) throw new Error(`Unknown audio dataset: ${dataset}`);
  return fileName ? `${AUDIO_ROOT}/${folder}${fileName}` : "";
}

/* "ra-07" -> "ra-07.mp3" */
export function audioFileName(itemId) {
  const id = String(itemId == null ? "" : itemId).trim();
  if (!id) return "";
  return id.endsWith(".mp3") ? id : `${id}.mp3`;
}

/*
Does a recorded file exist? A HEAD request is
cheap and keeps the browser from guessing: a
missing file is a normal state here, not an
error worth logging.
*/
export function audioFileExists(path) {
  if (!path) return Promise.resolve(false);
  return fetch(path, { method: "HEAD" })
    .then((response) => response.ok)
    .catch(() => false);
}

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