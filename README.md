# PTE Trainer

A lightweight browser-based trainer for PTE practice:
**Repeat Sentence** exercises with real-time speech recognition,
**Describe Image** and **Summarize Written Text** with a training guide for
each, and a **Vocabulary** bank with search, filters, and pronunciation audio.

## Structure

- `index.html` — dashboard.
- `repeat.html` — repeat-sentence trainer (audio, recording, scoring).
- `describe-image.html` — Describe Image trainer (charts drawn as SVG, speech or typing).
- `read-aloud.html` — Read Aloud trainer (read the text aloud in one breath).
- `swt.html` — Summarize Written Text trainer (one-sentence summary, scored on 4 criteria).
- `vocabulary.html` — searchable vocabulary trainer.
- `grammar.html` — bilingual grammar reference + interactive grammar quizzes.
- `quiz.html` — interactive tests (meaning→word, listening, cloze, spelling).
- `add-word.html` — on-demand page for adding words (needs Flask only at save time).
- `js/` — ES modules for audio, speech recognition, comparison, scoring, task flows
  (`swt.js`, `describe-image.js`), their guides (`swt-guide.js`, `di-guide.js`) and
  data helpers, plus a theme toggle (`theme.js`).
- `data/` — sentence, vocabulary, SWT and image data (JSON); `data/grammar/` holds one
  file per grammar topic (time/frequency expressions, prepositions, determiners,
  comparisons, and much more — 29 lessons / 12 categories / 450 questions,
  `tenses.json`, `modals.json`, `conditionals.json`, `relative-clauses.json`, …).
- `assets/audio/` — generated MP3 files.
- `tools/` — helper scripts for media generation, JSON validation and the test harnesses.
- `docs/` — architecture and changelog.

## Run locally

Because the app uses ES modules and `fetch`, serve it over HTTP:

```bash
cd PTE/
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

> Note: speech recognition requires Chrome or Edge and works in the `en-US` locale.

## Themes

Dark and light themes are available via the toggle in the sidebar.
Your choice is saved in `localStorage`; if you have not chosen, the app
follows your operating system preference.

## Audio generation

Audio files are already included. To regenerate or extend them after adding
new entries to the JSON data:

```bash
pip install -r tools/requirements.txt

# Sentence audio
python3 tools/generate_audio.py

# Vocabulary audio (also refreshes data/vocabulary_audio_index.json)
python3 tools/generate_vocabulary_audio.py
```

## Read Aloud (`read-aloud.html`)

- 12 short texts in `data/read_aloud.json`, each with the pronunciation tip that
  matters for that sentence (which phrase carries the stress, what must not be
  split).
- 🔊 **Hear it first** reads the text aloud with the browser's own speech
  synthesis, so the page needs no audio files.
- **📖 Training mode** teaches the three habits that raise the marks: read it
  silently first, keep phrases together, one smooth breath at 2.2–3.6 words per
  second.
- Scored on **Content / Fluency / Pronunciation** (`js/read-aloud-score.js`),
  reusing the Repeat Sentence comparison engine. Fluency combines pace *and*
  long pauses, so a slow or hesitant reading loses marks even when every word is
  right. The result lists skipped and mispronounced words.
- 🎙️ record with the microphone, or type the sentence if no mic is available.

## Describe Image (`describe-image.html`)

- **13 items across 9 chart types**, all drawn as SVG: bar chart, line graph,
  pie chart, table, map, linear process, **decision flow**, **cycle** and
  **timeline** — each with a model description and keywords.
- **🎙️ speak or ⌨️ type**: record with the Web Speech API (`speech.js`), or fall
  back to a text box whenever the microphone is unavailable or permission is
  denied — the task stays fully usable.
- Scored on **Content / Fluency / Vocabulary** (`js/di-score.js`) with keyword
  coverage, a word count and the model answer for comparison.
- **📖 Training mode** (the default on a first visit) teaches a 3-step method
  built from the *current* image's own data — the peak, the largest share, the
  fastest growth — plus ready-made frames, do/don't tips and an annotated model
  answer. Switch to **Practice mode** (remembered in `localStorage`) for the
  real 25-second task.

## Summarize Written Text (`swt.html`)

- 10 passages in `data/swt.json`; write **one** summary sentence of **5–75 words**
  inside a 10-minute timer, with live word/sentence validation.
- Content is weighted the way the real task is: the passage's `mainIdea`
  (40%) plus its `keyPoints` (60%).
- Scored on **Content / Form / Grammar / Vocabulary** (`js/swt-score.js`),
  including keyword coverage, grammar issues and the model answer.
- **📖 Training mode** (default on a first visit) explains the PTE method:
  find the main idea → keep only the strongest supports → merge them into a
  single sentence with linking words. It teaches the *exact* fields the scorer
  reads — the claim (`mainIdea`, 40% of Content) and the supporting points
  (`keyPoints`, 60%) — plus 6 linking frames, do/don't tips and an annotated
  model answer.

## Interactive Tests (`quiz.html`)

Runs fully in the browser with no server. Pick one or more question modes,
a question count, CEFR level, study filter, number of choices, optional
per-question timer, and click start:

- **المعنى ← الكلمة** — choose the word from its Arabic/English meaning.
- **الكلمة ← المعنى** — the reverse: choose the Arabic meaning of a word.
- **الصوت ← الكلمة** — listen and choose the correct spelling.
- **الصوت ← المعنى** — listen and choose the correct meaning.
- **جملة ناقصة** — fill the blank inside a real example sentence.
- **الإملاء** — type the word from its meaning.
- **المرادف ← الكلمة** — choose the correct synonym.
- **رتب الحروف** — unscramble the word's letters and pick it.

Each answer gives instant feedback (meaning + audio + pronunciation).
You can **تخطّي (skip)** any question, a 🔥 streak counter tracks consecutive
correct answers, and the optional timer auto-reveals the answer on timeout.
The optional "علام الكلمة الصحيحة كـ مُتعلَّمة" toggle syncs correct answers
with the Vocabulary study status. The results screen shows your percentage,
best score, best streak, per-mode breakdown in `localStorage`, and a full
review of every question.

## Vocabulary (`vocabulary.html`)

- Searchable trainer over 1001 PTE words: search (word/meaning, Arabic
  supported), filters (CEFR A1–C2, part of speech, study status), IPA,
  details (meanings, collocations, synonyms, examples, word family, mistakes),
  and MP3 playback (▶ Play).
- Mark words **✓ Learned** / **↻ Review**. **Spaced repetition (SRS)**:
  learned words are rescheduled (`+3d`, then ×1.5 per correct review, 1 day
  after a miss); a **⏰ مراجعة مستحقة** filter and due-count pill surface
  today's queue, and a per-word "هل تتذكرها؟" panel judges each review.
  State lives in `localStorage` (`pte.vocab.study.v1`).
- **🎤 تحقق من النطق**: speak the current word and get instant feedback —
  ✅ correct (with ASR **confidence %**) or ❌ "حاول مرة أخرى" with what was
  heard and an automatic replay of the reference audio. Attempts are tracked
  per word (🎤 3/5 pill) with a **🎤 تحتاج نطقاً** filter for failing words.
  Requires **Chrome/Edge** and a secure context (e.g.
  `http://127.0.0.1:5000/vocabulary.html`).

## Dashboard (`index.html`)

Live overview: vocabulary acquired, due reviews today, grammar/quiz/pron/SWT/
Describe-Image/Read-Aloud accuracy, a **last-14-days activity chart** across every module,
weak grammar lessons (best < 70%), a daily SRS review banner linking into
the review queue, and a **🧩 بنود تحتاج تدريباً** panel listing the SWT
passages and chart images you have never scored above 60% — each row shows the
keywords or key points you missed and links straight to that item
(`?item=<id>`). An item leaves the list as soon as you answer it well.
- A **💾 نسخ احتياطي** card exports every statistic, your vocabulary study state
  and your goal into **one JSON file**, and imports it back. Importing
  **merges** instead of replacing, and is idempotent: the same file twice
  changes nothing (see `js/progress-io.js`). Two reset scopes are offered —
  statistics only, or absolutely everything.
- A **🎯 هدفك في الاختبار** card converts every task average to the official
  **10–90** scale (`js/pte-scale.js`), averages them into one estimate, and
  shows the gap to a target you can change (saved in `localStorage`).

## Grammar (`grammar.html`)

Works on any static server or fully offline. Browse **29 bilingual lessons**
(شرح + قواعد + أمثلة + أخطاء شائعة) grouped by **12 categories**
(الأزمنة، الأفعال الناقصة، الأدوات، الأسماء، الضمائر والمحددات، حروف الجر،
الصفات والظروف، المقارنات، تراكيب الأفعال والجمل، الشروط، المبني للمجهول،
الجمل الموصولة/الاسمية، الكلام المنقول، أدوات الربط، محددات الكمية), then
practice with interactive quizzes:

- **اختبار في كل الدروس** — all **450 questions** (multiple choice + true/false)
  shuffled in one session.
- **اختبار في درس محدد** — the quiz items of a chosen lesson.
- Every lesson shows its **كلمات دليلية** (common time markers such as
  *at the moment, since, by the time*) under the lesson hero.
- MCQ option order is re-shuffled on every question so answers can't be
  predicted by position; the choice of "true/false" answers is balanced.
- Optional per-question timer (15/30 s) with auto-reveal, a 🔥 streak counter,
  skip, full review on the results screen, and per-lesson best scores.
- Every question carries a short **💡 why**: shown right after answering and
  on wrong answers in the review.
- Results are saved in `localStorage` (`pte.grammar.stats.v1`): overall
  accuracy, best result, attempts, and the best percentage per lesson.
- Content lives in **`data/grammar/`** — one JSON file per topic
  (`tenses.json`, `modals.json`, `conditionals.json`, …), each an array of
  lessons. The app loads the file list from **`data/grammar/manifest.json`**;
  add a new file, append its name to the manifest, reload, and run the
  validate script after editing. Quiz items may be `mcq`/`multiple_choice`/
  `multiple-choice` (`options` 4 + `answer` index/text) or `tf`/`true_false`/
  `true-false` (`correct` boolean / `answer` "True"/"False").

## Checks

Run everything (data validation, JS syntax, CSS balance, and the unit
harnesses in `tools/tests/`) with one command:

```bash
bash tools/run_checks.sh
```

Or just the data validator:

```bash
python3 tools/validate_json.py
```

## Add new words (separate page, on demand only)

Nothing starts automatically and browsing is never blocked.

- Open your word pages normally (any static server) — the vocabulary page
  is pure browsing; there is no add UI on it.
- When you want to add words, use the **"إضافة كلمات"** option in the
  sidebar (on every page) → it opens `add-word.html`.
- On that page:
  1. Run the add-server when needed:
     ```bash
     bash tools/start_add_word.sh
     ```
     (starts `app.py` and opens the add page at
     `http://127.0.0.1:5000/add-word.html`)
  2. Fill the form. A word that already exists is rejected: **مكررة**.
     The new word gets the next number automatically (1001, 1002, …)
     and its audio is generated automatically (Edge TTS).
  3. Only the **"حفظ الكلمة"** button writes data — closing/leaving the
     page never saves anything.
  4. The **"⏻ إيقاف خادم الإضافة"** button stops the server cleanly
     without changing any file.

> The add-server is needed only at save time (audio + files). Reading words
> never requires it. Nothing is scheduled to start at boot.

## Extending data

- Add sentences to `data/repeat_sentences.json` (fields: `id`, `text`, `level`, `audio`).
- Add words via the Flask "Add Word" form, or directly to `data/vocabulary.json` (any new field is rendered if present).
- Edit grammar lessons/quizzes directly in the files under `data/grammar/` (lessons with `id`, `title`, `category`, `icon`, `description`, `explanation`, `rules`, `examples`, `commonMistakes`, `markers`, `quiz` — quiz items are `mcq`/`multiple_choice` with `options` (4) + `answer` (index or option text), or `tf`/`true_false` with `correct` boolean / `answer` "True"/"False"). The app normalizes both spellings in `js/grammar.js`. To add a new grammar file, append its name to `data/grammar/manifest.json`.
- Add SWT passages to `data/swt.json` (`id`, `title`, `passage`, `mainIdea`,
  `keyPoints`, `keywords`, `reference`) — the guide and the Content score both
  read `mainIdea` and `keyPoints`, so keep the reference sentence a learner could
  actually write in 5–75 words.
- Add Read Aloud texts to `data/read_aloud.json` (`id`, `text`, `level`, `tip`).
- Add Describe Image items to `data/describe-images.json` (`id`, `title`, `category`, `data`, `reference`, `keywords`); `category` must be one of the keys of `CATEGORY_LABELS` in `js/di-render.js`, and `data` must match that chart type's shape:
  `bar-chart` `{ yLabel, labels, groups:[{label, values}] }`,
  `line-graph` `{ yLabel, labels, series:[…] }`,
  `pie-chart` `{ values:[{label, value, color}] }`,
  `table` `{ headers, rows, subject?, period?, title?, caption? }`,
  `map` `{ regions:[{label, value, color, points, cx?, cy?}] }`,
  `process-diagram` `{ steps:[{label, desc}], cycle? }`,
  `decision-flow` `{ start, decision, yes, no, end }` (each `{label, desc}`),
  `cycle` `{ stages:[{label, desc}], centerLabel? }`,
  `timeline` `{ events:[{year, label, desc}], axisLabel?, caption? }`.
  The guide builds its highlights from the same fields, so no extra work is needed.
- Regenerate audio, then add new entries to the audio index files.
- Take a backup now and then: **Dashboard → 💾 نسخ احتياطي → ⬇️ تصدير**. Keep the
  file somewhere safe; `⬆️ استيراد` restores it in any browser, and merging two
  devices adds their attempts together instead of overwriting them.