# Changelog

## v3.25 — Editing and deleting words, and an audit that trusts nothing

A word bank that can only grow was the last structural gap. Now:

- **✏️ تعديل / 🗑️ حذف** on every word in `vocabulary.html`, backed by
  `GET`, `PUT` and `DELETE` on `/api/word`. Renaming regenerates the audio
  under the same file number so the MP3 never lags behind the word, and
  deleting removes the file with the row.
- **`tools/validate_json.py` became a real audit**: it resolves every audio path
  through the index instead of trusting the entry's own `audio` field (which is
  empty for most committed words), checks the file is really on disk, and
  refuses duplicates, bad parts of speech and incomplete task items.
- Three bugs the audit and the browser tests exposed, all fixed: the audio file
  survived a rename/delete because only the empty `audio` field was consulted,
  the edit form demanded three collocations even though older entries have
  fewer, and **CORS did not list `PUT`/`DELETE`**, so the browser rejected every
  edit with a silent "Failed to fetch" while the server happily answered 200.
  That last one is now covered by a test.

## v3.24 — Fixing the CSV import for real use

An import that silently did nothing was reported as "still 1001 words". Three
causes, all fixed:

1. **The API address was assumed.** The page was served from a local static
   server while the add server runs on port 5000, so the relative `/api/...`
   request never reached it — the preview looked perfect and the save did
   nothing. The client now resolves the API address itself (relative when the
   add server serves the page, `http://127.0.0.1:5000` otherwise) and the local
   API answers loopback origins with CORS headers. Importing now works from any
   local server.
2. **Failures were invisible.** The panel now shows a server badge before you
   commit, names the real cause when a save cannot happen, and re-displays the
   last import report after a reload instead of losing it.
3. **A missing audio file could lose the word.** If Edge TTS is offline the
   server rejected the entry, so the count stayed unchanged with no explanation.
   The word is now added with an empty `audio` field and reported separately as
   "added without audio", which `tools/generate_vocabulary_audio.py` can fill in
   later.

Also: after a successful save the word bank is re-read, so the header count and
any search update immediately instead of waiting for a manual reload.

`samples/import-sample.csv` is provided for testing: one existing word and four
new ones that become 1002–1005.

## v3.23 — Vocabulary CSV import

- **⬆️ Import CSV** in the vocabulary toolbar, mirroring the export: pick a file
  and the browser previews the outcome before anything is written.
- Import **never overwrites**. A word already in the bank is skipped, the same
  word twice inside one file is collapsed, and a row missing a required field is
  reported rather than promised a number. The preview shows the counts and the
  exact number each new word will get — with 1001 words in the bank the
  additions become 1002, 1003, 1004.
- New endpoint `POST /api/import-words` on the add server: it re-checks for
  duplicates, validates each word with the same rules as the single-word form,
  generates the audio and updates `vocabulary.json` plus the audio index. It
  supports `dryRun` and caps a batch at 200 words.
- `tools/import_plan.py` holds the planning rules with **no dependencies**, so
  they are unit-tested without Flask or Edge TTS installed.

### Two problems found and fixed while building it
- The import reused `validate_entry` unchanged, which demands at least three
  synonyms, collocations **and** examples per word. A hand-written CSV would
  therefore have been rejected row by row. The list minimums now apply only to
  the single-word form; an import accepts what the file provides as long as the
  required fields are there.
- The browser preview was optimistic: it offered a number for a row the server
  would later refuse (a word with no IPA). The preview now applies the same
  required-field checks and lists what is missing, so the numbers shown before
  saving match the numbers reported after it. This also surfaced a
  client/server mismatch: repeats inside one file were called "skipped" by the
  server and "repeated" by the preview, so both now report them separately.

### Checks
- `tools/tests/test_import_plan.py` (13 tests) for the planner: request
  refusals, the batch cap, case-insensitive duplicates, in-file repeats,
  numbering up to 1002, rejection reasons, and that the bank is never mutated.
- `tools/tests/test-csv-import.mjs` (22 tests) for the browser half: quoted
  cells, CRLF, BOM, header aliases, list splitting, the four buckets, the
  numbering, an import of our own export adding nothing, and every required
  field being checked.
- `test-html.mjs` grew to 24 tests, including that the server exposes the
  endpoint and that the UI previews before saving.

## v3.22 — Vocabulary CSV export

- **⬇️ Export CSV** in the vocabulary toolbar writes the words **currently
  shown** to `pte-vocabulary-YYYY-MM-DD.csv`, so a search or any filter acts as
  the selection.
- 15 columns per word: pronunciation, part of speech, CEFR, frequency, both
  meanings, synonyms, collocations, examples, word family, common mistakes and
  audio — plus **Study status** and **Due**, computed from `localStorage` so the
  learner's SRS progress travels with the file instead of being left behind.
- Cells follow RFC 4180: quoted when they contain a comma, a quote, a newline
  or a tab, with internal quotes doubled. The file starts with a UTF-8 BOM so
  Excel opens the Arabic meaning column correctly rather than as mojibake.

### Behaviour fixed while building it
- The first version fell back to the entire 1001-word bank whenever the filter
  matched nothing. A learner who typed a search with no results and clicked
  export would have received every word instead of an explanation; it now
  refuses with a clear message.

### Checks
- New harness `tools/tests/test-csv-export.mjs` (15 tests) with its own RFC 4180
  parser: commas and quotes cannot shift a column, newlines and tabs stay in
  one cell, a custom delimiter is honoured, list fields join readably, the
  header width matches every row, the whole 1001-word bank parses without losing
  a single cell, the Arabic meaning round-trips, an empty selection still yields
  a valid header-only file, and a non-array input cannot throw.
- `test-html.mjs` grew to 23 tests, asserting the export control is wired to the
  CSV builder and that the study status is included.

## v3.21 — Exam conditions

- A **🎯 Exam Conditions** toggle on Summarize Written Text, Describe Image and
  Read Aloud, driven by one shared flag (`pte.exam.v1`) so switching it on once
  applies it to all three pages.
- Under exam conditions the aids disappear: word and sentence counters, status
  hints, the Clear button, and the "Hear it first" playback on Read Aloud. The
  answer box itself stays, because in the test you do write or speak.
- The timer turns red and pulses in the **last 10 seconds** of any phase
  (preparation, speaking or recording).
- The result keeps the score, the criteria bars and the official-scale estimate
  but drops every hint: no model answer, no per-criterion explanation, no
  missed keywords, no review-schedule note.
- An exam attempt is still recorded, and a weak item is still scheduled for
  review, but `detailTermsFor()` returns nothing in this mode so the
  diagnostics are never written to storage — practice in exam conditions cannot
  pollute the review queue with "which word did I miss" data from an attempt
  where those aids were hidden.

### Bug caught while building this
- The first patch looked correct but silently did nothing on `swt.js` (the mode
  variable there is `currentMode`, not `mode`), which left `toggleExamMode`
  undefined: the module threw a ReferenceError at load, the toggle was never
  wired, and the page still looked fine because `initialize()` had already been
  called. Found by the browser pass, fixed, and the shared-state naming is now
  covered by the harness wiring test.

### Checks
- New harness `tools/tests/test-exam-mode.mjs` (6 tests): the flag is off by
  default, only the exact stored value enables it, unavailable storage never
  throws, the warning window is exactly the last ten seconds (and never fires
  at zero or on nonsense), and exam attempts never return diagnostics.
- `test-html.mjs` grew to 22 tests, asserting all three pages expose the toggle,
  that `base.css` owns the hidden aids and the warning, and that each module
  reads the shared flag, wires its button, drops diagnostics and warns.

## v3.20 — Maintenance: one home for the shared components

- Deleted `data/audio_index.json`. It was a 65-byte leftover from an older
  design (sentence id → mp3) that nothing read: sentences carry their own
  `audio` field and `app.py` writes `vocabulary_audio_index.json`. The stale
  entry was also removed from the validator's file list.
- Moved the **39 rule blocks that were byte-identical across `di.css`,
  `swt.css` and `read-aloud.css`** into `base.css` as grouped selectors — the
  mode switch, the status/timer and progress bars, the whole training guide and
  the result card with its criteria bars.
- Result: `di.css` 540 → 445 lines, `swt.css` 585 → 422, `read-aloud.css` 391 →
  228, with zero duplicated rule bodies left between the three sheets. The class
  names were **not** renamed, so no HTML or generated markup changed.
- Verified with a per-element CSS fingerprint: for every element on the four
  task pages, the exact list of matching declarations (selector + body, with
  the page prefix canonicalised) is **identical before and after** — 0 of 697
  elements changed.
- Rules inside `@media` were deliberately left alone: Describe Image uses a
  760px breakpoint where the other two use 700px, so unifying them would change
  the responsive behaviour of one page.
- Two new harness tests: page stylesheets must not share an identical top-level
  rule body, and `base.css` must own the shared components as one grouped
  selector.

## v3.19 — Weak items come back on a schedule

- Weak task items are now **rescheduled with the same Leitner idea as the
  vocabulary SRS**: `REVIEW_INTERVALS = [1, 3, 7, 14]` days. A score below 60%
  schedules the item, and each entry stores `streak` and `due`.
- Answering an item well clears the schedule completely (`streak`/`due` back to
  0) and it leaves the weak list. Retrying it **before** it is due and failing
  restarts the ladder at one day instead of growing it — an early failure means
  the item is not learned yet.
- Dashboard **🧩 بنود تحتاج تدريباً** now sorts items whose date has arrived to
  the top, gives each a 🔁 badge («مستحقة الآن», «متأخرة 3 يوم», «خلال 24 ساعة»,
  «بعد 2 يوم»), and the panel header states how many are due today.
- Each task result (SWT, Describe Image, Read Aloud) ends with a line saying
  when the item will return, so a low score reads as a plan rather than a dead
  end.
- `getDueItems()` / `getUpcomingItems()` split the queue, and `describeDue()`
  owns the wording so the dashboard and the result screens cannot drift apart.
- The backup merge carries the schedule: `streak` takes the maximum and `due`
  takes the **earlier** date, so an old backup can never postpone a review that
  is already waiting.

### Checks
- `test-stats.mjs` grew to 16 tests covering the ladder, the early-retry reset,
  clearing after a pass, the due/upcoming split, ordering and the Arabic wording.

## v3.18 — Backup, merge and reset

### Export / import progress
- New **💾 نسخ احتياطي** card on the dashboard: one button exports every
  statistic, the whole vocabulary study state, pronunciation history, the goal
  and the mode settings into a single `pte-progress-YYYY-MM-DD.json` file.
- **Import merges, it never replaces.** `js/progress-io.js` validates the file
  first — a foreign app, a missing `data` block or a file with no known keys is
  refused before anything is written, and unknown keys only produce a warning.
- Merge rules per key family: new attempts only for statistics, best score and
  newest verdict kept per item or word, the more advanced study entry wins but
  the earlier due date is kept so overdue words still surface, and imported
  settings win.

### Idempotency (the important part)
- A repeated import changes **nothing**. Two guards make that true:
  1. attempts are identified by their history timestamp, so entries already
     present are subtracted from the incoming totals;
  2. each payload's shape is fingerprinted, which also covers a heavily used
     module whose history is capped at 400 entries while `total` keeps
     counting.
- Importing two *different* devices still adds their attempts together.
- Grammar's per-question miss counters are the one figure that can drift on a
  repeated import, because a miss carries no timestamp; this is documented in
  the module and in the architecture notes.

### Two reset scopes, both confirmed
- **🗑️ تصفير الإحصائيات** clears the five statistics keys and keeps the
  vocabulary study work and the goal.
- **⚠️ تصفير كل شيء** removes every key the app owns, behind a second,
  stronger confirmation.

### Bug found by the new tests
- A single corrupt number in an imported file (e.g. `total: "x"`) produced
  `NaN` totals, which would have silently destroyed every average on the
  dashboard. All merges now go through a numeric guard.

### Checks
- New harness `tools/tests/test-progress-io.mjs` (23 tests) with an in-memory
  `localStorage` double: round trips, refusal of bad files, warnings, the
  truncated-history case, double imports, two-device merges, both reset scopes,
  and the `NaN` guard.
- `test-html.mjs` grew to 19 tests, now asserting the backup card is wired to the
  progress module.

## v3.17 — More content, official score scale, and Read Aloud

### Content: 13 charts and 18 passages
- Describe Image grew from 7 to **13 items** and from 6 to **9 categories**.
  Three new SVG renderers were added to `js/di-render.js`:
  - **`decision-flow`** — entry box, a decision diamond, labelled Yes/No
    branches and a shared final stage.
  - **`cycle`** — stages around a circle with curved arrows and a centre label,
    for processes with no end point.
  - **`timeline`** — a time axis with alternating milestone cards.
- Six new items: a complaint decision flow, a bottle-recycling cycle, a library
  timeline, a waste pie chart, a bus-fare table and a rainfall bar chart.
- Table and map titles/captions are now **data-driven** instead of hardcoded to
  the old enrollment example, and table highlights read `subject`/`period` so
  they read correctly for any table.
- SWT grew from 10 to **18 passages** covering different argument shapes
  (problem–solution, claim–evidence, cause–effect, advantages, chronology).
  A harness check now verifies that **every model answer scores at least 75**
  when run through its own scorer, so no "model" can drift away from the rubric.

### Official 10–90 scale + a target
- New `js/pte-scale.js` converts a 0–100 practice total into an official-scale
  estimate using a documented monotonic anchor table, with coarse band labels
  ("Good", "Very good", …). It is an approximation for motivation, and the
  module says so.
- Every SWT, Describe Image and Read Aloud result now shows a **≈ NN / 90** chip
  beside the practice total.
- New dashboard card **🎯 هدفك في الاختبار**: an editable target (saved in
  `pte.goal.v1`), one averaged estimate across the three speaking/writing tasks,
  a per-task bar with a target marker, and the remaining gap.

### New task: Read Aloud (`read-aloud.html`)
- 12 short texts with the pronunciation tip that matters for each sentence.
- **🔊 Hear it first** uses the browser's speech synthesis, so the page needs no
  audio assets.
- Training / Practice switch (Training by default) teaching: read silently
  first, keep phrases together, one breath at 2.2–3.6 words per second.
- `js/read-aloud-score.js` scores Content / Fluency / Pronunciation on top of the
  existing comparison engine; fluency combines **pace and long pauses**, and the
  result lists skipped and mispronounced words. Microphone or typing fallback.
- Added to the sidebar of every page and to the dashboard goal card.

### Bug fix that also affected Repeat Sentence
- `compare.js` stripped only the ASCII apostrophe, so a typographic `’` in the
  source text never matched the plain `'` that speech recognition returns — a
  perfectly read sentence such as "o'clock" was marked wrong. All apostrophe
  variants are now normalised to one character before tokenising.

### Checks
- New harness `tools/tests/test-read-aloud.mjs` (13 tests) covering the scorer,
  pace and pause penalties, the data, and the monotonic 10–90 conversion.
- `test-di.mjs` grew to 15 tests: every category must have a label, a renderer
  and a guide; the three new process types must draw real shapes; and the guide
  sentences must be grammatical English rather than raw labels.
- `test-html.mjs` grew to 18 tests, now including the Read Aloud page wiring and
  sidebar links, and prefix isolation for the new stylesheet.

## v3.16 — Weak-item tracking + a guide that matches the scorer

### SWT training guide now teaches what is actually scored
- `data/swt.json` already carried `mainIdea` and `keyPoints`, and
  `js/swt-score.js` weighted Content as **Main Idea 40% + Key Points 60%** —
  but the guide showed a flat keyword list. It now presents **the claim** and
  **the numbered supporting points** for the passage on screen, states how much
  each is worth, and keeps the keyword chips as a vocabulary hint. Passages
  without those fields fall back to the old keyword panel.

### Weak items are now tracked per passage and per image
- New pure module `js/task-stats.js` records each graded attempt as
  `{ count, best, last, lastT, title, weak }` per item, keeping the existing
  `correct / total / history` fields the dashboard already reads.
- `weak` records **what the answer left out**: uncovered key points for SWT,
  missing keywords for Describe Image (both scorers now return this).
- `getWeakItems()` lists anything never scored above **60%**, weakest first; an
  item clears itself as soon as it is answered well.

### Dashboard
- New **🧩 بنود تحتاج تدريباً** panel: every weak passage/image with its best
  score, the missed keywords as chips, and a link that opens that exact item
  (`swt.html?item=<id>`, `describe-image.html?item=<id>` — both pages now
  accept a deep link).
- The 14-day activity chart spans the full width again now that the grid holds
  three panels.
- Empty states: a friendly message when nothing is weak yet.

### Checks
- New harness `tools/tests/test-stats.mjs` (9 tests) covering the stats shape,
  history capping, term de-duplication, input immutability and weak-item
  ordering; it caught a real bug where `normalizeTaskStats` shared the caller's
  `history` array.
- SWT and DI harnesses extended for the new scorer output and guide structure.

## v3.15 — New PTE tasks: Summarize Written Text & Describe Image

### Summarize Written Text (`swt.html`)
- New task page with **10 passages** (`data/swt.json`): read the passage and
  write **one** sentence of **5–75 words** inside a 10-minute timer.
- Live validation while typing: word count (5–75), sentence count, and a clear
  "one sentence required" status.
- Scored on the four PTE criteria — **Content / Form / Grammar / Vocabulary**
  (`js/swt-score.js`) — with keyword coverage, detected grammar issues, a
  model answer, and a `/100` total that is recorded to `pte.swt.stats.v1`.
- Attempts feed the dashboard (`📝 Summarize Written Text` card + badge) and the
  last-14-days activity chart.

### Describe Image (`describe-image.html`)
- 7 items across **6 categories** (bar chart, line graph, pie chart, table,
  map, process diagram) drawn as **SVG** by `js/di-render.js` — no image
  assets, so every chart is crisp and themeable.
- **🎙️ speak or ⌨️ type**: `speech.js` records the answer; if the microphone is
  missing or permission is denied, a typing fallback takes over automatically.
- Scored on **Content / Fluency / Vocabulary** (`js/di-score.js`) against the
  item's keywords, with word count, transcript and model answer.
- Attempts feed the dashboard (`🖼️ Describe Image` card + badge).

### Training modes (both new pages)
- Each page has a **📖 Training / Practice** switch, defaulting to **Training**
  on a first visit and remembered afterwards (`pte.swt.mode`, `pte.di.mode`).
- The guide is generated from the **item currently on screen**, not generic
  advice: chart highlights (peak, largest share, steepest growth, region
  totals) and the ideas each passage should cover.
- SWT teaches the PTE method — find the main idea → keep the strongest supports
  → merge into one sentence with linking words — with 6 linking frames,
  do/don't tips and an annotated model answer. DI teaches the per-type
  sentence pattern (overview → key features → summary).
- In training mode the timer and answer controls are hidden and the passage or
  chart stays visible for reference; a CTA jumps straight into practice.

### Fixes & cleanup
- **Chart clipping fixed**: the bar-chart axis ceiling was computed with a broken
  rounding expression (max 230 was scaled against 77), pushing bars above the
  viewBox. A `niceMax()` helper now rounds to a sensible ceiling, and a
  regression check confirms every image's content stays inside the viewBox.
- **No more cross-page class leakage**: `describe-image.html` was using
  `swt-*` classes that only existed inside `css/di.css`. All DI classes are now
  `di-*`, and a harness test fails the build if any page, stylesheet or module
  borrows another page's prefix.
- Removed dead CSS (`.icon-btn`, `.tag-port`, `.muted`, `.modal-overlay`,
  `.modal-header`, `.modal-title`) and 24 duplicated comment-opener lines.
- `docs/architecture.md` rewritten to match the current 8 pages / 23 modules /
  9 stylesheets, and the README now documents both new tasks.

## v3.14 — Smart learning: SRS, dashboard, targeted grammar

### Vocabulary — spaced repetition (SRS)
- Study entries upgraded from `{ word: "learned" }` to
  `{ word: { status, due, intervalDays, ease } }`; legacy data is migrated
  automatically on load (`js/storage.js`).
- Marking a word **✓ Learned** schedules its first review in **3 days**;
  **↻ Review** makes it due immediately. A **⏰ مراجعة مستحقة** filter and a
  **due count** in the toolbar show today's queue (`vocabulary.html?study=due`
  deep-links straight into it).
- Due words show an inline **SRS panel** on the card: "هل تتذكرها؟" with
  **✓ أتذكرها / ✗ لا أتذكرها**. Remembering grows the interval (×1.5, capped
  at 60 days); forgetting resets it to 1 day — a simple Leitner-style schedule.

### Vocabulary — smarter pronunciation check
- Confidence is now surfaced: ✅ feedback shows **الثقة N%** from the ASR.
- Attempts are tracked per word (`pte.vocab.pron.v1`) and shown under the
  word ("🎤 3/5") with a **🎤 تحتاج نطقاً** filter for words whose last attempt
  failed; an overall "نطق صحيح" counter appears in the toolbar and dashboard.
- On a wrong attempt the reference audio **replays automatically** so the user
  hears the correct sound before trying again.

### Dashboard (index.html) — now live
- New `js/dashboard.js` renders: acquired-vocabulary / due-today / grammar /
  quiz / pronunciation stat cards, a **📈 النشاط — آخر 14 يوماً** bar chart
  (built from per-attempt `history` now recorded by grammar & quiz), a
  **🎯 نقاط الضعف في القواعد** list (lessons with best < 70%), and a
  **🔁 daily SRS review banner** with a deep link into the review queue.
- Mode badges (word / lesson / quiz-mode counts) are filled dynamically.

### Grammar — targeted practice
- **🎯 اختبار فئة** button: quiz one category at a time (enabled when a
  category chip is active).
- **💥 ركّز على أخطائك**: wrong answers are tracked per question
  (`stats.missed`), and one click rebuilds a quiz from your most-missed items.
- Weakness indicators: a lesson whose best score is below 70% gets an amber
  **weak** badge in the sidebar and a warn-colored "أفضل نتيجة" pill in its
  hero.
- `toSentences()` moved into `js/grammar.js` and now keeps dotted abbreviations
  (`U.S.`, `e.g.`, `a.m.`) attached to their clause instead of fragmenting the
  reader text.

### Tooling
- `tools/run_checks.sh`: one command for validator + JS syntax + CSS balance +
  automated tests; test harnesses now live in **`tools/tests/`**
  (`test-grammar.mjs` 946 checks, `test-storage.mjs`, `test-pronounce.mjs`,
  `test-html.mjs`) and a root `package.json` enables them (`"type":"module"`).
- All pages bumped to "PTE Trainer · v3".
- **🔜 Floating Next**: the vocabulary page shows a fixed **التالي ←** pill at
  the bottom-right of the viewport so a known word can be skipped without
  scrolling to the page footer; it hides on the last result and disables while
  the pronunciation check is listening.

## v3.13 — Vocabulary: pronunciation check

- Added a **🎤 تحقق من النطق** button to the vocabulary word card. It uses the
  Web Speech API (`js/speech.js` `SpeechEngine`, en-US) so the user speaks the
  word and the app judges it:
  - While listening, the button pulses, toggles to "⏹ إيقاف", and shows an
    Arabic listening hint; a 9-second timeout keeps sessions short.
  - **Result**: ✅ "صحيح! نطق ممتاز" on a match, ❌ "ليس صحيحاً — حاول مرة
    أخرى" (with what was heard) otherwise, plus graceful messages for
    no-speech, mic permission, network, and unsupported browsers.
  - Clicking again stops early; changing the word resets the check.
- New `js/pronounce.js`: `wordMatches()`/`levenshtein()`/`normalizeSpoken()`
  tolerate punctuation, articles ("a challenge"), trailing words, and minor
  ASR variations (Levenshtein similarity ≥ 0.8), while rejecting clearly
  different words ("mask" vs "task").
- CSS: `.pron-feedback` states (listening/good/bad/error) + pulsing ring on
  `.btn-record.listening`.
- Note: speech recognition requires **Chrome/Edge** and a secure context, so
  run it from the app server (`http://127.0.0.1:5000/`) rather than `file://`.

## v3.12 — Grammar: modern app UI (sidebar + reader)

- **Layout**: the grammar page was redesigned as a modern app: a fixed
  **sidebar** (كتف مخطّط — logo, live stats, 🔍 search box, category chips
  with per-category counts, scrollable lesson list, and a "اختبار كل الدروس"
  button) beside a **main reader panel** with a lesson **hero banner**
  (gradient card, round icon tile, marker chips, prominent test button),
  a **breadcrumb**, a **segmented tab control**, and content cards. The
  `.grammar-app` container is **RTL**: the library sidebar sits on the
  **right** with the reader to its **left** (nav/rows/tabs mirror in RTL).
- **كلمات دليلية** marker chips recolored from cyan to **soft violet**
  (`var(--violet)` / `rgba(139,92,246,...)`) for better contrast next to the
  cyan→violet hero gradient and improved readability on both themes.
- **Search**: `grammar-app.js` now filters lessons live by title/category/
  description (`grammar-search`), with result counts and empty-state messages.
- **Professional styling**: layer-based gradient hero, glow shadows, refined
  typography, rounded segmented tabs with gradient active state, hover
  affordances on list rows and cards, logical-property borders (RTL), and
  responsive stacking below 980 px. The duplicated/legacy grammar CSS was
  fully rewritten and cleaned (`css/style.css` grammar section).
- The whole lesson reader still works fully offline with the same tabs
  (نظرة عامة / القواعد / أمثلة / أخطاء شائعة), quizzes, timer, streak,
  review, and per-lesson best scores.
- Totals updated (user added 13 new questions to `tenses.json` during the
  redesign): **29 lessons / 450 questions** (429 mcq + 21 tf, 12 true /
  9 false) across 12 categories and 18 files.

## v3.11 — Full grammar library (18 files / 29 lessons)

- All per-topic grammar files created by the user are now wired into the app.
  **`data/grammar/manifest.json`** lists the 18 files in load order, and
  `js/grammar.js` fetches the manifest first, then merges every file into one
  lesson bank (was a hard-coded `GRAMMAR_FILES` of two).
- Quiz schema handling broadened: **`multiple-choice`** and **`true-false`**
  (hyphenated) normalize exactly like `multiple_choice`/`true_false`, and the
  loader now resolves answers whether given as an index or as the option text.
  `tools/validate_json.py` accepts all spellings, checks `answer`/`correct`
  consistency for the whole family, and skips `manifest.json`.
- Overview tab: sentence splitting in `grammar-app.js` keeps common
  abbreviations together (Dr., Mr., e.g., etc., U.S., …) so long explanations
  no longer break into stray fragments.
- Totals: **29 lessons / 437 questions** (418 mcq + 19 tf, 11 true / 8 false)
  across **12 categories** and 18 files under `data/grammar/`.
- README and Dashboard badge updated (29 lessons / 437 questions).

## v3.10 — Multi-file grammar + modals lesson

- Grammar split continues: **`data/grammar/modals.json`** adds the
  **«الأفعال الناقصة»** lesson (modal verbs): 32 rules, 20 examples,
  10 common mistakes, 15 quiz items (14 multiple-choice + 1 true/false)
  all with `why`, plus time-marker chips.
- **`js/grammar.js`** now loads **`GRAMMAR_FILES`** (`tenses.json`,
  `modals.json`) and merges them, so more per-topic files can be added by
  extending the manifest.
- `tools/validate_json.py` validates **every `*.json` under `data/grammar/`**
  and reports totals across files.
- Totals: **13 lessons / 113 questions** (95 mcq + 18 tf, 10 true / 8 false)
  across 3 categories (الأزمنة، القواعد الأساسية، الأفعال الناقصة).
- README and Dashboard badge updated (13 lessons / 113 questions).

## v3.9 — Grammar data folder + new quiz schema

- Grammar content moved into **`data/grammar/`**: `grammar.json` was renamed
  to **`tenses.json`** to prepare for splitting the grammar into multiple
  per-topic files.
- Revised lesson/quiz data: 12 lessons (11 tenses + "القواعد الأساسية"
  subject-verb-agreement, 10 questions), 98 quiz items (81 multiple choice
  + 17 true/false, balanced 9/8). Quiz items may use either
  `mcq`/`tf` (index / boolean) or `multiple_choice`/`true_false`
  ("answer" holds the option text / "True"/"False"); `js/grammar.js`
  **normalizes both spellings** to `mcq`/`tf` at load.
- `tools/validate_json.py` now understands both formats and validates the
  new path; answer-key spread was rebalanced across A–D deterministically.
- Loader path, README counts (12 lessons / 98 questions), Dashboard badge,
  and validation script all updated.

## v3.8 — Past simple × present perfect split

- The combined "الماضي البسيط والمضارع التام" lesson was split into two
  independent lessons:
  - **past-simple** 🕰️ — completed past actions at a specific time
    (didn't + verb, Did…?, used to, yesterday/last year/in 2020).
  - **present-perfect** ✅ — past action tied to the present result
    (have/has + p.p., since/for, yet/already/just, ever/never).
- Each gets 5 new questions (with `why`), its own examples, mistakes, and
  time markers. The tense group now reads: present-tenses → present-perfect
  → present-perfect-continuous → past-simple → past-continuous → past-perfect
  → past-perfect-continuous → future family.
- Bank totals: **20 lessons, 91 questions (70 mcq + 21 tf)**, true/false
  still close to balanced (11/10); mcq answer keys re-rotated across A–D.
- Dashboard badge and README counts updated to **20 lessons / 91 questions**.

## v3.7 — Complete tenses + time markers (grammar)

- **All major tenses covered**: added 7 new lessons — present-perfect-
  continuous 🌱, past-continuous 🎞️, past-perfect ⏮️, past-perfect-
  continuous ⏳, future-continuous 📅, future-perfect 🏁, future-perfect-
  continuous ⏱️ — each with شرح، 6 قواعد، 4 أمثلة، 4 أخطاء شائعة، و5 أسئلة
  جديدة. The tense group is now in a logical teaching order (present past →
  past → future family).
- **Time markers for every lesson**: each lesson now has a **«كلمات
  دليلية»** row (`markers` array, e.g. *at the moment, since, by the time*)
  rendered as chips under the lesson hero.
- Quiz bank grew to **85 questions (65 mcq + 20 tf)** across 19 lessons;
  true/false stays balanced **10 true / 10 false**, and mcq answer keys were
  re-rotated across A–D (17/17/16/15).
- `js/grammar-app.js` renders lesson markers; new `.lesson-markers` /
  `.marker-chip` styles in `css/style.css`.
- Dashboard grammar card badge and README counts updated to **19 lessons /
  85 questions**.

## v3.6 — Grammar quiz overhaul (appeal + balance)

- **MCQ options are re-shuffled at display time** (`shuffleOptions` in
  `js/grammar.js`), so answer position can never be guessed. Answer keys in
  the file were also rebalanced to spread across A–D.
- **True/false answers rebalanced** 6 true / 7 false (previously 10/1), and
  two new TF items were added to `subject-verb-agreement` (now 6 questions).
  Total quiz bank: 50 questions (37 mcq + 13 tf).
- **Every question now has a short `why` explanation**, shown right after
  answering and on wrong answers in the review screen — with new
  `.quiz-why` / `.rv-why` styles.
- **Generic prompts varied** ("اختر الجملة الصحيحة:" appears once instead of
  21 times); each MCQ prompt now targets the specific rule.
- **Content fixes**: corrected a typo in `comparatives`
  («إنجليزيتها تتحسّن»), clarified the two-syllable adjectives rule
  (careful/useful take *more*), and fixed the garbled `gerunds-infinitives`
  note about like/start/begin.
- `tools/validate_json.py` now checks `grammar.json`: required lesson fields,
  unique ids, 4 distinct options + in-range answer, boolean `correct`, and
  a `why` for every item (with a TF-balance warning).

## v3.5 — Grammar section (grammar.html)

- New **grammar.html** page + `js/grammar.js` data engine and
  `js/grammar-app.js` entry. Works fully offline (no server).
- **Reference lessons**: 12 bilingual (English + Arabic) lessons grouped by
  category (الأزمنة، الشرط، الصيغ، المفردات), each with شرح، قواعد، أمثلة،
  وأخطاء شائعة. Content lives in **`data/grammar.json`** — fully editable
  without touching code.
- **Interactive quizzes**: multiple choice (mcq) + true/false (tf) over
  `data/grammar.json`, with shuffle, optional per-question timer (15/30 s)
  that auto-reveals the answer, ⏭ skip, 🔥 streak, instant feedback, and a
  full review on the results screen.
- **Two scopes**: "اختبار في كل الدروس" (48 questions) and "اختبار في الدرس
  المحدد" (the 4 questions of a selected lesson).
- Per-lesson best percentages + overall accuracy/attempts/best saved in
  `localStorage` (`pte.grammar.stats.v1`), with an "إعادة تعيين الإحصائيات"
  button. Best-score pills shown directly on the lesson list.
- Grammar link added to every sidebar and a dashboard mode card.

## v3.4 — Quiz: new modes + practice features

- Four new question modes (8 total):
  **الكلمة ← المعنى** (reverse), **الصوت ← المعنى**, **المرادف ← الكلمة**,
  and **رتب الحروف** (anagram with scrambled letters).
- New features: skipped-question button (⏭), 🔥 streak counter (live pill +
  best streak on results), optional per-question timer (15/30/45 s with
  timeout auto-reveal), configurable number of choices (3/4/5), and an
  auto-learn toggle that marks correctly-answered words as "learned" in the
  Vocabulary study state.
- Results screen adds "أفضل سلسلة" card and a "إعادة تعيين الإحصائيات"
  button (clears `pte.quiz.stats.v1`).
- Engine now builds distinct option sets for word-, meaning-, and
  synonym-based choices and skips words that cannot form a valid question.

## v3.3 — Interactive Tests (quiz.html)

- New **quiz.html** page + `js/quiz.js` engine and `js/quiz-app.js` entry.
  Works fully offline (no server, no speech API).
- Four question modes: **م**عنى ← كلمة (MCQ), **ص**وت ← كلمة (listening),
  **ج**ملة ناقصة (cloze from real examples), and **إ**ملاء (spelling typing).
- Configurable count (10/25/50/100), CEFR filter, and study-status filter
  (unstudied / learned / review).
- Smart distractors (same CEFR first), audio replay in feedback and review,
  with a results screen: percentage, per-mode accuracy tracked across
  attempts in `localStorage` (`pte.quiz.stats.v1`), best score, and a full
  per-question review.
- Added to every sidebar, plus a dashboard mode card.

## v3.2 — Add Words as a separate on-demand page

- Add-word UI moved out of the vocabulary page entirely — browsing is pure
  (no button, no modal, no auto-checks on `vocabulary.html`).
- New standalone page **`add-word.html`** ("إضافة كلمات"), reachable only via
  the sidebar option of the same name. Nothing runs automatically; the
  add-server (`app.py`) is started only when saving a word via
  `bash tools/start_add_word.sh`.
- Flask server (`app.py`) endpoints: `GET /api/check-word` (case-insensitive
  duplicate check), `GET /api/status` + `POST /api/service` (on/off state),
  `POST /api/add-word` (validates all 13 fields, ≥3 collocations / synonyms /
  examples, rejects duplicates 409, generates MP3 via Edge TTS, assigns the
  next number — wordlist at 1000 so the first is #1001), and
  `POST /api/shutdown` (stops the server without touching any file).
- **Closing the page never saves** — only the "حفظ الكلمة" button writes
  data; the "⏻ إيقاف خادم الإضافة" button shuts the server down cleanly.
- Verified: no crontab / autostart / systemd / profile auto-launch of the
  add-server exists. Nothing is scheduled to run at boot.

## v3.1 — Vocabulary expansion (1000 words)

- Expanded `vocabulary.json` from 750 to 1000 words in five sub-batches (6a–6e).
- Distribution: A2: 80, B1: 280, B2: 420, C1: 180, C2: 40 — all 13 fields complete, no duplicates, ≥3 examples per entry (final coverage check lists NONE).
- Fixed the plan/label drift for `Arrest` (moved C1→... kept C1) and cleaned a few garbled strings in batch 6e.
- Generated 250 new MP3 files via Edge TTS, 0 failures; `vocabulary_audio_index.json` rebuilt and consistent (1000/1000).

## v3.0 — Vocabulary expansion (750 words)

- Expanded `vocabulary.json` from 513 to 750 words in one 237-word batch (five sub-batches: 5a–5e).
- Distribution: A2: 65, B1: 209, B2: 317, C1: 132, C2: 27 — all 13 fields complete, no duplicates, ≥3 examples per entry.
- Generated 237 new MP3 files via Edge TTS, 0 failures; `vocabulary_audio_index.json` rebuilt and consistent (750/750).

## v2.5 — Vocabulary expansion (200 words)

- Expanded `vocabulary.json` from 313 to 513 words in four sub-batches (a–d).
- Distribution: A2: 51, B1: 141, B2: 220, C1: 86, C2: 15 — all 13 fields complete, no duplicates.
- Every entry now carries at least 3 PTE-style example sentences (also upgraded 46 older batch-1 entries from 2 to 3 examples).
- Generated 200 new MP3 files via Edge TTS, 0 failures; `vocabulary_audio_index.json` rebuilt and fully consistent (513/513).

## v2.4 — Vocabulary expansion (100 words)

- Expanded `vocabulary.json` from 163 to 313 words in three batches.
- Distribution: A2: 31, B1: 81, B2: 145, C1: 51, C2: 5 — all 13 fields complete (no empty CEFR / POS / frequency).
- Each word keeps the full entry schema: IPA, meanings (EN/AR), collocations, common mistakes, synonyms, PTE-style examples, word family.
- Fixed a few sloppy-quality `commonMistakes` strings and an empty `Criteria` entry (now B2, Noun).
- Generated all 150 new MP3 files via Edge TTS (voice `en-US-AndrewNeural`), 0 failures; `vocabulary_audio_index.json` fully rebuilt and consistent.
- Added A1 and C2 options to the CEFR filter in `vocabulary.html` (CSS badges already existed).

## v2.1 — Themes

- Added dark / light theme toggle in the sidebar (`js/theme.js`).
- Choice persists in localStorage; falls back to the OS preference.
- CSS refactored around theme CSS variables for both modes.

## v2.3 — Sentence bank expansion

- Expanded `repeat_sentences.json` from 28 to 100 PTE-style sentences.
- Distribution: 30 easy, 35 medium, 35 hard.
- Topics cover education, business, environment, technology, health, society, and daily campus life, with proper punctuation.

## v2.2 — Vocabulary study tools

- Study filter (All / Not studied / Learned / Review).
- Learned and Review counters shown in the vocabulary toolbar.

- Added dark / light theme toggle in the sidebar (`js/theme.js`).
- Choice persists in localStorage; falls back to the OS preference.
- CSS refactored around theme CSS variables for both modes.

## v2.0 — Redesign

- Rebuilt UI with a new dark "Midnight Glass" theme (sidebar, gradients, glass cards).
- Fixed vocabulary audio playback by wiring the audio button to `vocabulary_audio_index.json`.
- Made "Learned" / "Review" buttons functional; status persists in localStorage.
- Unified the accuracy formula: single definition in `score.js`.
- Cleaned up inconsistent code style across the JS modules.
- Rewrote generator scripts for the new layout.

## v1.x — Original (PTE-Trainer)

- Repeat-sentence trainer with word-level comparison and scoring.
- Vocabulary bank with search, CEFR and part-of-speech filters.
- Edge TTS audio generators and JSON validation tools.