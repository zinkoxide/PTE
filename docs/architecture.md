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
| `audio.js` | loads/plays audio, dispatches `audioEnded` / `audioError`; also builds task paths (`taskAudioPath`, `audioFileName`) and probes a file with `audioFileExists` |
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
| `read-aloud.js` | Read Aloud flow (prepare timer, recording, typing fallback, result); plays the recorded model voice and falls back to the browser one |
| `fib.js` | pure Fill in the Blanks item builder: word forms, gap detection, option sets, per-blank scoring |
| `fib-app.js` | Fill in the Blanks flow (setup, timer, training guide, results, stats) |
| `read-aloud-score.js` | Content / Fluency / Pronunciation scoring for a reading |
| `pte-scale.js` | converts a 0–100 practice total into an official 10–90 estimate |
| `exam-mode.js` | one shared flag for exam conditions: hides the aids, owns the last-10-seconds warning, and suppresses stored diagnostics |
| `csv-export.js` | RFC 4180 escaping, the vocabulary column set, the saved column pick (`columnsForKeys` / `loadColumnKeys` / `saveColumnKeys`) and the browser download |
| `csv-import.js` | the CSV reader, the preview/diff that decides what is new, and the numbering preview |
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
- `validate_json.py` — data sanity checks. The audit is deliberately strict:
  it re-reads every vocabulary entry and the audio index, resolves each word's
  MP3 through the index (the `audio` field alone is not trusted), verifies the
  file exists on disk, refuses duplicate words or duplicate audio numbers,
  checks CEFR/frequency/part of speech (including compound labels such as
  *Noun/Verb*), and walks the SWT and Read Aloud item files for missing text
  or answer keys.
- `import_plan.py` — the numbering rules shared by the import and add paths:
  `next_free_number()` picks the number after the highest one in use (it never
  hands out a number whose audio file is taken, and it reads digits from the
  file stem only, so `1005.mp3` never looks like number 5).
- `generate_audio.py` — Edge TTS audio for the spoken tasks, one folder per
  dataset (`repeat` → `assets/audio/`, `read-aloud` → `assets/audio/read-aloud/`).
  `--only <dataset>` picks one, `--force` rebuilds what already exists.
- `generate_vocabulary_audio.py` — Edge TTS audio for the 1005 bank words.
- `start_add_word.sh` — starts the Flask add server.
- `tests/test-*.mjs` — unit harnesses (html wiring, grammar, storage,
  pronunciation, swt, di, task stats, read aloud + the official scale,
  progress backup/merge, csv export/import), plus `tests/test_import_plan.py`
  for the numbering rules.

## Data flow (spoken task audio)

`tools/generate_audio.py` speaks every item of a dataset with Edge TTS into its
own folder. The page never reads a path from the JSON: it rebuilds it from the
item id (`taskAudioPath(dataset, audioFileName(id))`), checks the file with a
HEAD request, plays it, and falls back to the browser voice if it is missing —
so a text without audio still works, and `tools/validate_json.py` reports it.

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

## CSV export

`js/csv-export.js` turns the vocabulary bank into a spreadsheet file. Two
details are easy to get wrong and are covered by tests:

- **Escaping** — meanings, examples and `commonMistakes` contain commas, quotes
  and arrows, so every cell is quoted when needed and internal quotes are
  doubled (RFC 4180). Tabs are quoted too, because several importers treat
  them as delimiters.
- **Encoding** — the file begins with a UTF-8 BOM; without it Excel renders the
  Arabic column as mojibake.

`vocabulary.html` exports `filteredVocabulary`, so the current search and
filters act as the selection. Two columns are computed from `localStorage`
rather than `vocabulary.json` — the learner's own **Study status** and review
**Due** date — so a backup of the file keeps the SRS state with the words.
A selection that matches nothing refuses instead of falling back to the whole
bank.

### Import

The mirror image, in three steps so nothing is written by surprise:

1. **Preview (browser, `js/csv-import.js`)** — the file is parsed with the
   same RFC 4180 reader, then every row is sorted into one of four buckets:
   already in the bank, repeated inside the file, incomplete (missing one of the
   fields the server insists on), or genuinely new. Only the new ones get a
   preview number, continuing from the end of the bank.
2. **Confirmation** — the learner sees the counts and the words, and can cancel.
3. **Save** — `js/vocab-app.js` resolves the API address itself: a relative
   path when the page is served by the add server, otherwise
   `http://127.0.0.1:5000`, so importing works from any local server the learner
   happens to browse on. A failed audio generation keeps the word with an empty
   `audio` field instead of dropping it, and the word count is re-read from the
   data file so the header updates without a manual reload.
4. **`POST /api/import-words` on the server** — re-checks
   everything; `tools/import_plan.py` holds those rules with no dependencies, so
   they are testable without Flask or Edge TTS. The server skips duplicates,
   validates each entry with the same `validate_entry` used by the single-word
   form (with the "at least three examples" rule relaxed, because a bulk file
   may legitimately carry one), numbers the words, generates their audio and
   updates both `vocabulary.json` and the audio index. `dryRun` reports the plan
   without writing, and a batch is capped at 200 words.

The local API answers loopback origins with CORS headers, which is what lets a
page served from another local port reach it; any other origin is refused.

`tools/tests/test_import_plan.py` covers the planner (13 tests) and
`tools/tests/test-csv-import.mjs` covers the browser half (22 tests).

## Data flow (Describe Image / SWT / Read Aloud)

1. The page module loads its JSON data and calls the matching guide builder.
2. **Training mode** renders the 3-step method built from the *current* item's
   own data (chart values, keywords) — no timer runs.
3. **Practice mode** runs the real task: `di-render.js` draws the SVG,
   `speech.js` (or the typing fallback) captures the answer, the `*-score.js`
   module scores it, and the attempt is appended to the module's stats key.
4. `dashboard.js` reads every stats key and updates cards, badges and the chart.

## Data flow (Fill in the Blanks)

There is no data file. `js/fib.js` builds the items from `vocabulary.json` so
the task can never run out of material:

1. Pick a word and one of its `examples` that really contains it (long enough to
   be fair). Only forms the word can take are matched, so "art" cannot swallow
   "article".
2. Blank it with `____`. The form the sentence uses — "benefited", not
   "benefit" — is the answer, because the sentence already proves it.
3. `form` items offer three other forms of the same word, built from the part of
   speech the bank records; `audio` items offer three other words from the bank
   plus the word's MP3 from the audio index.
4. Anything that cannot make an honest item returns `null` and is skipped: no
   sentence, too short, no audio, or not enough distinct distractors.
5. The page scores one mark per blank (`scoreFibSet`) and records each blank on
   its own, so the dashboard's weak panel lists words rather than sets.

## Data flow (edit / delete a word)

1. `vocabulary.html` shows an **✏️ تعديل** button per word and links to
   `add-word.html?edit=<word>`; the page can be opened directly too.
2. The form loads the entry with `GET /api/word?word=<word>`, fills every field,
   and switches its button to **حفظ التعديلات** (the duplicate check stops
   mattering — the word is supposed to exist).
3. Saving sends `PUT /api/word` with the original word as `originalWord`. The
   server validates the entry, keeps the **same audio number** when the name is
   unchanged, regenerates the MP3 under the new name when it is changed, and
   rewrites the index row.
4. **🗑️ حذف** sends `DELETE /api/word?word=<word>`, which drops the entry, the
   index row and the MP3 file.
5. Numbers are never reused: a later import simply continues after the highest
   number still in use, so the deleted slot is left alone.

## localStorage keys

`pte.theme`, `pte.vocab.study.v1`, `pte.vocab.pron.v1`, `pte.grammar.stats.v1`,
`pte.quiz.stats.v1`, `pte.swt.stats.v1`, `pte.swt.mode`, `pte.di.stats.v1`,
`pte.di.mode`, `pte.ra.stats.v1`, `pte.ra.mode`, `pte.goal.v1`, `pte.exam.v1`.

`pte.exam.v1` is shared by the three task pages on purpose: exam conditions are a
way of answering, not a per-page preference. When it is on, each page adds
`exam-mode` to `<body>`, `base.css` hides the aids, the timer gains
`is-warning` inside the final ten seconds, and the result keeps only the score,
the criteria bars and the official estimate. `detailTermsFor()` returns an
empty list in that mode, so the attempt is recorded while the diagnostics
(missed keywords, uncovered key points) are never written to storage.

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