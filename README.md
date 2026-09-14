# PTE Trainer

A lightweight browser-based trainer for PTE practice:
**Repeat Sentence** exercises with real-time speech recognition,
and a **Vocabulary** bank with search, filters, and pronunciation audio.

## Structure

- `index.html` — dashboard.
- `repeat.html` — repeat-sentence trainer (audio, recording, scoring).
- `vocabulary.html` — searchable vocabulary trainer.
- `grammar.html` — bilingual grammar reference + interactive grammar quizzes.
- `quiz.html` — interactive tests (meaning→word, listening, cloze, spelling).
- `add-word.html` — on-demand page for adding words (needs Flask only at save time).
- `js/` — ES modules for audio, speech recognition, comparison, scoring, and data, plus a theme toggle (`theme.js`).
- `data/` — sentence and vocabulary data (JSON); `data/grammar/` holds one file per grammar topic time/frequency expressions, prepositions, determiners, comparisons, and
  much more — 29 lessons / 12 categories / 437 questions (`tenses.json`,
  `modals.json`, `conditionals.json`, `relative-clauses.json`, …).
- `assets/audio/` — generated MP3 files.
- `tools/` — helper scripts for media generation and JSON validation.
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

## Grammar (`grammar.html`)

Works on any static server or fully offline. Browse **29 bilingual lessons**
(شرح + قواعد + أمثلة + أخطاء شائعة) grouped by **12 categories**
(الأزمنة، الأفعال الناقصة، الأدوات، الأسماء، الضمائر والمحددات، حروف الجر،
الصفات والظروف، المقارنات، تراكيب الأفعال والجمل، الشروط، المبني للمجهول،
الجمل الموصولة/الاسمية، الكلام المنقول، أدوات الربط، محددات الكمية), then
practice with interactive quizzes:

- **اختبار في كل الدروس** — all **437 questions** (multiple choice + true/false)
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

## Validate data

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
- Edit grammar lessons/quizzes directly in the files under `data/grammar/` (lessons with `id`, `title`, `category`, `icon`, `description`, `explanation`, `rules`, `examples`, `commonMistakes`, `markers`, `quiz` — quiz items are `mcq`/`multiple_choice` with `options` (4) + `answer` (index or option text), or `tf`/`true_false` with `correct` boolean / `answer` "True"/"False"). The app normalizes both spellings in `js/grammar.js`. To add a new grammar file, append its name to `GRAMMAR_FILES` in `js/grammar.js`.
- Regenerate audio, then add new entries to the audio index files.