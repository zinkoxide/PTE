/* ==========================================
   PTE Trainer — spoken task audio tests
   Run: node tools/tests/test-audio.mjs
   ========================================== */

import {
  taskAudioPath,
  audioFileName,
  audioFileExists,
  TASK_AUDIO_FOLDERS
} from "../../js/audio.js";
import { existsSync, readFileSync } from "node:fs";

const fromRoot = (relative) => new URL(`../../${relative}`, import.meta.url);
const readRoot = (relative) => readFileSync(fromRoot(relative), "utf8");
const existsRoot = (relative) => existsSync(fromRoot(relative));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK: ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL: ${name} — ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

test("each task gets its own folder", () => {
  /* The numbered files of Repeat Sentence must not sit next to the
     Read Aloud files of the same number. */
  assert(taskAudioPath("repeat", "0001.mp3") === "./assets/audio/0001.mp3",
    "repeat sentence audio lives directly in assets/audio");
  assert(taskAudioPath("read-aloud", "ra-01.mp3") === "./assets/audio/read-aloud/ra-01.mp3",
    "read aloud audio lives in its own folder");
});

test("an unknown dataset is refused instead of guessed", () => {
  let threw = false;
  try {
    taskAudioPath("speaking", "x.mp3");
  } catch {
    threw = true;
  }
  assert(threw, "an unknown dataset must throw");
  assert(Object.keys(TASK_AUDIO_FOLDERS).includes("read-aloud"),
    "read-aloud must be a known dataset");
});

test("file names get the extension once", () => {
  assert(audioFileName("ra-07") === "ra-07.mp3", "the extension is added");
  assert(audioFileName("ra-07.mp3") === "ra-07.mp3", "the extension is not doubled");
  assert(audioFileName("") === "", "an empty id has no file");
  assert(audioFileName(null) === "", "a null id has no file");
});

test("every dataset in the page data has an audio file", () => {
  /* The page rebuilds the path from the id alone, so the generator must
     have written exactly the name the browser asks for. */
  const repeat = JSON.parse(readRoot("data/repeat_sentences.json"));
  for (const item of repeat.slice(0, 12)) {
    const name = audioFileName(String(item.id).padStart(4, "0"));
    assert(existsRoot(taskAudioPath("repeat", name).replace("./", "")),
      `repeat sentence ${item.id} is missing ${name}`);
  }

  const readAloud = JSON.parse(readRoot("data/read_aloud.json"));
  for (const item of readAloud) {
    const path = taskAudioPath("read-aloud", audioFileName(item.id)).replace("./", "");
    assert(existsRoot(path), `read aloud ${item.id} is missing ${audioFileName(item.id)}`);
  }
});

test("the Read Aloud page plays the file and keeps a fallback", () => {
  const source = readRoot("js/read-aloud.js");
  assert(/taskAudioPath\("read-aloud"/.test(source),
    "the page must build the recorded path");
  assert(/audioFileExists\(/.test(source),
    "the page must check the file before playing it");
  assert(/playBrowserVoice/.test(source),
    "the browser voice must stay as the fallback");
  /* The fallback has to be reachable when the file is missing, not only when
     playback fails halfway. */
  assert(/if \(!exists\) \{\s*playBrowserVoice\(\);/.test(source),
    "a missing file must fall back to the browser voice");
  const playTextBody = source.split("function playText")[1] || "";
  assert(!/speechSynthesis\.speak/.test(playTextBody),
    "playText must reach for the recorded file before the browser voice");
});

test("a missing file is not an error", async () => {
  /* audioFileExists answers a promise; the page only uses the boolean, so a
     rejected request must resolve to false instead of throwing. */
  const result = await audioFileExists("./does-not-exist-" + Date.now() + ".mp3");
  assert(result === false, "a missing file resolves to false");
  assert((await audioFileExists("")) === false, "an empty path resolves to false");
});

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);