# Architecture

The app is a lightweight, browser-based PTE trainer built from small ES modules.
Every page is static HTML + CSS + ES modules; the only server-side piece is the
optional Flask add-word server (`app.py`), needed **at save time only**.

## Structure

### Pages

- `index.html` — dashboard (stats cards, 14-day activity chart, weak areas).
- `repeat.html` — repeat-sentence trainer (audio, recording, scoring).
- `describe-image.html` — Describe Image (SVG charts, speech or typing, training guide).
- `vocabulary.html` — vocabulary trainer (search, filters, SRS, pronunciation check).
- `grammar.html` — bilingual grammar reference + quizzes.
- `swt.html` — Summarize Written Text (one-sentence summary, training guide).
- `quiz.html` — interactive vocabulary tests.
- `add-word.html` — on-demand word form (needs the Flask server when saving).

### Stylesheets (`css/`)

`base.css` (shared shell, buttons, pills, inputs, theme tokens) plus one
page-specific sheet each: `dash.css`, `repeat.css`, `di.css`, `vocab.css`,
`gram.css`, `swt.css`, `quiz.css`, `addw.css`.

Class names are page-scoped (`di-*`, `swt-*`, …) and a harness test enforces
that no page, stylesheet or module borrows another page's prefix.

### Modules (`js/`)

| Module | Role |
| --- | --- |
| `theme.js` | dark/light toggle persisted in `localStorage` (classic script, runs in `<head>`) |
| `audio.js` | loads/plays audio, dispatches `audioEnded` / `audioError` |
| `speech.js` | Web Speech API wrapper (`SpeechEngine`, optional continuous mode) |
| `compare.js`, `pronounce.js`, `score.js` | repeat-sentence alignment, word matching, scoring |
| `app.js` | repeat-sentence practice flow |
| `vocabulary.js`, `vocab-app.js`, `storage.js` | vocabulary data, UI, study/SRS state |
| `grammar.js`, `grammar-app.js` | grammar data loader, reference + quiz UI |
| `quiz.js`, `quiz-app.js` | question builders and quiz UI |
| `dashboard.js` | aggregates all `localStorage` stats into the dashboard |
| `describe-image.js` | Describe Image flow (mode switch, mic, fallback, result) |
| `di-render.js` | draws each chart type as SVG (bar, line, pie, table, map, process) |
| `di-score.js` | Content / Fluency / Vocabulary scoring |
| `di-guide.js` | per-image training guide (steps, data highlights, tips, model) |
| `swt.js` | Summarize Written Text flow (mode switch, timer, submit, result) |
| `swt-score.js` | Content / Form / Grammar / Vocabulary scoring for summaries |
| `swt-guide.js` | SWT training guide (3-step method, linking frames, tips) |
| `add-word.js` | add-word form logic (check + save via the Flask API) |

### Data (`data/`)

- `repeat_sentences.json` — 100 sentences (`id`, `text`, `level`, `audio`).
- `vocabulary.json` — 1001 words; `vocabulary_audio_index.json` — word → MP3 path.
- `grammar/` — 18 topic files listed in `manifest.json`; 29 lessons,
  450 quiz items, 12 categories.
- `swt.json` — 10 passages (`title`, `passage`, `reference`, `keywords`).
- `describe-images.json` — 7 items across 6 categories (`id`, `title`,
  `category`, `data` for the SVG, `reference`, `keywords`).

`assets/audio/` holds the generated MP3s (sentences in the root, vocabulary
under `assets/audio/vocabulary/`).

### Tools (`tools/`)

- `run_checks.sh` — one command that runs everything below.
- `validate_json.py` — data sanity checks.
- `generate_audio.py`, `generate_vocabulary_audio.py` — Edge TTS audio generation.
- `start_add_word.sh` — starts the Flask add server.
- `tests/test-*.mjs` — unit harnesses (html wiring, grammar, storage,
  pronunciation, swt, di).

## Data flow (repeat)

1. `app.js` fetches `data/repeat_sentences.json`.
2. Student listens to audio managed by `audio.js`.
3. `speech.js` returns a transcript.
4. `compare.js` tokenizes, normalizes numbers, and aligns both texts.
5. `score.js` (the single source of truth) converts counts to accuracy/score/level.

## Data flow (Describe Image / SWT)

1. The page module loads its JSON data and calls the matching guide builder.
2. **Training mode** renders the 3-step method built from the *current* item's
   own data (chart values, keywords) — no timer runs.
3. **Practice mode** runs the real task: `di-render.js` draws the SVG,
   `speech.js` (or the typing fallback) captures the answer, the `*-score.js`
   module scores it, and the attempt is appended to the module's stats key.
4. `dashboard.js` reads every stats key and updates cards, badges and the chart.

## localStorage keys

`pte.theme`, `pte.vocab.study.v1`, `pte.vocab.pron.v1`, `pte.grammar.stats.v1`,
`pte.quiz.stats.v1`, `pte.swt.stats.v1`, `pte.swt.mode`, `pte.di.stats.v1`,
`pte.di.mode`.

Stats share one shape so the dashboard can read them uniformly:
`{ correct, total, history: [{ t, percent }] }`.

## Notes

- A local HTTP server is required (ES modules + `fetch` do not work from `file://`).
- Speech recognition requires Chrome/Edge; every speech task also has a typing
  fallback so the pages stay fully usable without a microphone.