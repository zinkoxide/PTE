# Architecture

The app is a lightweight, browser-based PTE trainer built from small ES modules.
Every page is static HTML + CSS + ES modules; the only server-side piece is the
optional Flask add-word server (`app.py`), needed **at save time only**.

## Structure

### Pages

- `index.html` — dashboard (stats cards, 14-day activity chart, weak areas).
- `repeat.html` — repeat-sentence trainer (audio, recording, scoring).
- `describe-image.html` — Describe Image (SVG charts, speech or typing, training guide).
- `read-aloud.html` — Read Aloud (record or type a reading, fluency + pronunciation).
- `vocabulary.html` — vocabulary trainer (search, filters, SRS, pronunciation check).
- `grammar.html` — bilingual grammar reference + quizzes.
- `swt.html` — Summarize Written Text (one-sentence summary, training guide).
- `quiz.html` — interactive vocabulary tests.
- `add-word.html` — on-demand word form (needs the Flask server when saving).

### Stylesheets (`css/`)

`base.css` (shared shell, buttons, pills, inputs, theme tokens, the
`.pte-official` score chip and the **shared task components**) plus one
page-specific sheet each: `dash.css`, `repeat.css`, `read-aloud.css`, `di.css`,
`vocab.css`, `gram.css`, `swt.css`, `quiz.css`, `addw.css`.

Class names stay page-scoped (`di-*`, `swt-*`, `ra-*`) and a harness test
enforces that no page, stylesheet or module borrows another page's prefix.
Components that all three task pages use — the mode switch, the status/timer
and progress bars, the training guide and the result card with its criteria
bars — live **once** in `base.css` as a grouped selector:

```css
.swt-step, .ra-step { … }
.di-result-content, .ra-result-content, .swt-result-content { … }
```

This keeps the three pages from drifting apart without renaming a single class
in the HTML or the JS that generates the markup. A second harness test fails
the build if an identical top-level rule body reappears in two page sheets.
Rules inside `@media` are exempt, because each page picks its own breakpoint.

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
| `read-aloud.js` | Read Aloud flow (prepare timer, recording, typing fallback, result) |
| `read-aloud-score.js` | Content / Fluency / Pronunciation scoring for a reading |
| `pte-scale.js` | converts a 0–100 practice total into an official 10–90 estimate |
| `task-stats.js` | shared per-item attempt recording and weak-item selection |
| `progress-io.js` | builds a portable backup file, validates and merges it, resets scopes |
| `add-word.js` | add-word form logic (check + save via the Flask API) |

### Data (`data/`)

- `repeat_sentences.json` — 100 sentences (`id`, `text`, `level`, `audio`).
- `vocabulary.json` — 1001 words; `vocabulary_audio_index.json` — word → MP3 path.
- `grammar/` — 18 topic files listed in `manifest.json`; 29 lessons,
  450 quiz items, 12 categories.
- `swt.json` — 18 passages (`id`, `title`, `passage`, `mainIdea`, `keyPoints`,
  `keywords`, `reference`).
- `describe-images.json` — 13 items across 9 categories (`id`, `title`,
  `category`, `data` for the SVG, `reference`, `keywords`).
- `read_aloud.json` — 12 short texts (`id`, `text`, `level`, `tip`); playback
  uses the browser speech synthesis, so no audio files are needed.

`assets/audio/` holds the generated MP3s (sentences in the root, vocabulary
under `assets/audio/vocabulary/`).

### Tools (`tools/`)

- `run_checks.sh` — one command that runs everything below.
- `validate_json.py` — data sanity checks.
- `generate_audio.py`, `generate_vocabulary_audio.py` — Edge TTS audio generation.
- `start_add_word.sh` — starts the Flask add server.
- `tests/test-*.mjs` — unit harnesses (html wiring, grammar, storage,
  pronunciation, swt, di, task stats, read aloud + the official scale,
  progress backup/merge).

## Data flow (repeat)

1. `app.js` fetches `data/repeat_sentences.json`.
2. Student listens to audio managed by `audio.js`.
3. `speech.js` returns a transcript.
4. `compare.js` tokenizes, normalizes numbers, and aligns both texts.
5. `score.js` (the single source of truth) converts counts to accuracy/score/level.

## Backup and restore

`js/progress-io.js` is the only module allowed to serialise the whole of
`localStorage`. It exports a single file:

```
{ app: "pte-trainer", version, exportedAt, data: { <key>: <value> } }
```

Import validates before writing anything (wrong app, missing `data` or no known
keys are refused; unknown keys only warn), then merges per key family:

| family | merge rule |
| --- | --- |
| stats (`correct/total/history`) | new attempts only; overlap detected by history timestamp, and a fingerprint of each payload blocks a repeated import of a file whose history was already capped |
| `missed` (task items) | best score kept, newest `lastT` wins, missed terms unioned, attempt count takes the maximum so it cannot inflate |
| `missed` (grammar questions) | counters summed — the one figure that can drift on a repeated import, because a miss carries no timestamp |
| `lessons` | best score kept |
| vocabulary study | the more advanced entry wins (learned over review, then the longer interval) but the earlier `due` date is kept so the word still surfaces |
| pronunciation | attempts and correct counts added, newest verdict wins |
| settings (theme, goal, modes) | the imported file wins |

Fingerprint bookkeeping lives in `pte.backup.applied.v1` and is deliberately not
part of a backup, so restoring into a fresh browser applies the whole file.

## Score reporting

Practice totals are 0–100; the exam reports 10–90. `js/pte-scale.js` converts
between them with a documented monotonic anchor table and adds a coarse band
label. The estimate is shown next to every practice total and aggregated per
task on the dashboard, where the learner can set a target (`pte.goal.v1`) and
see the remaining gap. It is an approximation for motivation only — the real
score comes from item-level difficulty scaling in the official test.

## Data flow (Describe Image / SWT / Read Aloud)

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
`pte.di.mode`, `pte.ra.stats.v1`, `pte.ra.mode`, `pte.goal.v1`.

Stats share one shape so the dashboard can read them uniformly:
`{ correct, total, history: [{ t, percent }] }`.

The two timed tasks add per-item detail on top of that, managed by
`js/task-stats.js` (pure functions, no storage access):

```
missed: {
  [itemId]: { count, best, last, lastT, title, weak: [...] }
}
```

`best` is the highest score ever reached for that item, so an item drops out of
the weak list (`getWeakItems`, threshold 60) as soon as it is answered well.
`weak` holds the parts the answer left out — uncovered key points for SWT,
missing keywords for Describe Image.

Weak items also carry a review schedule, borrowing the Leitner ladder already
used by the vocabulary SRS:

| field | meaning |
| --- | --- |
| `streak` | consecutive weak reviews, capped at the longest interval |
| `due` | timestamp when the item should be practised again (0 = none) |

`REVIEW_INTERVALS = [1, 3, 7, 14]` days. Answering well sets both to 0;
reviewing early and failing restarts the ladder at one day.
`getDueItems()` and `getUpcomingItems()` split the weak list into what to
practise now and what to leave alone, and `describeDue()` produces the wording
shown in the dashboard and on the result screen. Both task pages accept a deep link
(`?item=<id>`) which the dashboard uses to send the learner straight to the
item that needs work.

## Notes

- A local HTTP server is required (ES modules + `fetch` do not work from `file://`).
- Speech recognition requires Chrome/Edge; every speech task also has a typing
  fallback so the pages stay fully usable without a microphone.