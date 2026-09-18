# Changelog

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