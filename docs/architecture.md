# Architecture

The app is a lightweight, browser-based trainer built from small ES modules.

## Structure

- `index.html` — dashboard.
- `repeat.html` — repeat-sentence trainer page.
- `vocabulary.html` — vocabulary trainer page.
- `css/style.css` — single shared stylesheet (Midnight Glass theme).
- `js/` — ES modules:
  - `app.js` — orchestrates the repeat-sentence practice flow.
  - `audio.js` — loads and plays audio, dispatches `audioEnded`/`audioError`.
  - `speech.js` — wraps the Web Speech API (`SpeechEngine` class).
  - `compare.js` — Levenshtein edit-distance word alignment and normalization.
  - `score.js` — single definition of accuracy and the practice score.
  - `vocabulary.js` — loads vocabulary + audio index data.
  - `vocab-app.js` — search, filters, rendering, and study state for vocabulary.
  - `storage.js` — persists vocabulary study status (learned/review) in localStorage.
  - `theme.js` — dark/light theme toggle persisted in localStorage (classic script, runs in `<head>`).
- `data/` — JSON data:
  - `repeat_sentences.json` — sentence, level, audio filename.
  - `vocabulary.json` — word entries (meaning, collocations, examples, …).
  - `audio_index.json` — sentence id → audio filename.
  - `vocabulary_audio_index.json` — word → audio path.
- `assets/audio/` — generated MP3 files for sentences and vocabulary.
- `tools/` — Python helpers:
  - `generate_audio.py` — generates sentence MP3s via Edge TTS.
  - `generate_vocabulary_audio.py` — generates word MP3s + updates the index.
  - `validate_json.py` — sanity-checks the data files.

## Data flow (repeat)

1. `app.js` fetches `data/repeat_sentences.json`.
2. Student listens to audio managed by `audio.js`.
3. `speech.js` returns a transcript.
4. `compare.js` tokenizes, normalizes numbers, and aligns both texts.
5. `score.js` (the single source of truth) converts counts to accuracy/score/level.

## Notes

- Required only a local HTTP server (ES modules + `fetch` do not work from `file://`).