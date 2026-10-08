/* ==========================================
   PTE Trainer — page wiring checks (no jsdom)
   Run: node tools/tests/test-html.mjs
   ========================================== */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

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
  if (!condition) throw new Error(message || "assertion failed");
}

function read(rel) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

const html = {
  index: read("../../index.html"),
  repeat: read("../../repeat.html"),
  vocabulary: read("../../vocabulary.html"),
  grammar: read("../../grammar.html"),
  quiz: read("../../quiz.html"),
  "add-word": read("../../add-word.html"),
  swt: read("../../swt.html"),
  di: read("../../describe-image.html"),
  ra: read("../../read-aloud.html")
};

/* ---------- vocabulary page wiring ---------- */

test("vocabulary page has SRS + pronunciation widgets", () => {
  const ids = ["pron-stats", "srs-panel", "srs-word", "srs-yes", "srs-no", "pron-summary"];
  ids.forEach((id) => assert(html.vocabulary.includes(`id="${id}"`), `missing #${id}`));
});

test("vocabulary page has floating next button", () => {
  assert(html.vocabulary.includes('id="float-next"'), "missing #float-next");
});

test("vocabulary study filter includes due and needs-pron", () => {
  assert(html.vocabulary.includes('value="due"'), "missing due option");
  assert(html.vocabulary.includes('value="needs-pron"'), "missing needs-pron option");
});

test("vocabulary page exposes the CSV export control", () => {
  [
    "vocab-export-csv",
    "vocab-export-note",
    "vocab-import-csv",
    "vocab-import-file",
    "vocab-import-panel",
    "vocab-import-summary",
    "vocab-import-list",
    "vocab-import-confirm",
    "vocab-import-cancel",
    "vocab-import-result"
  ].forEach((id) =>
    assert(html.vocabulary.includes(`id="${id}"`), `vocabulary.html: missing #${id}`)
  );
  const app = read("../../js/vocab-app.js");
  assert(/buildVocabularyCsv/.test(app), "vocab-app.js must build the CSV");
  assert(/downloadCsv/.test(app), "vocab-app.js must hand the file to the user");
  assert(/csvFilename/.test(app), "vocab-app.js must name the file with a date");
  assert(/Study status/.test(app), "the export must include the learner's own study status");

  assert(/buildImportPreview/.test(app), "vocab-app.js must preview the file before saving");
  assert(/api\/import-words/.test(app), "vocab-app.js must send the new words to the add server");
  assert(/confirmImport/.test(app), "the import must wait for a confirmation");
});

test("the add server exposes a bulk import endpoint that re-checks everything", () => {
  const server = read("../../app.py");
  assert(/api\/import-words/.test(server), "app.py must expose /api/import-words");
  assert(/existing_words_lower/.test(server), "the import must re-check for duplicates server-side");
  assert(/validate_entry/.test(server), "the import must reuse the single-word validation");
  assert(/MAX_IMPORT_WORDS/.test(server), "the import must cap the batch size");
  assert(/dryRun/.test(server), "the import must support a dry run");
});

test("vocabulary page loads stats via vocab-app.js and speech.js", () => {
  assert(html.vocabulary.includes('src="./js/vocab-app.js"'), "missing vocab-app.js module");
});

/* ---------- grammar page wiring ---------- */

test("grammar page has category + missed test buttons", () => {
  assert(html.grammar.includes('id="grammar-test-cat"'), "missing grammar-test-cat");
  assert(html.grammar.includes('id="grammar-test-missed"'), "missing grammar-test-missed");
});

test("grammar page keeps core reader ids", () => {
  ["grammar-cat-filter", "grammar-lesson-list", "grammar-detail", "grammar-test-all", "grammar-crumb"].forEach(
    (id) => assert(html.grammar.includes(`id="${id}"`), `missing #${id}`)
  );
});

/* ---------- dashboard wiring ---------- */

test("index page has dashboard widgets and module", () => {
  const ids = ["dash-srs", "dash-srs-title", "dash-srs-detail", "dash-srs-link", "dash-vocab",
    "dash-due", "dash-grammar", "dash-quiz", "dash-pron", "dash-chart", "dash-weak",
    "mode-badge-words", "mode-badge-grammar", "mode-badge-quiz"];
  ids.forEach((id) => assert(html.index.includes(`id="${id}"`), `missing #${id}`));
  assert(html.index.includes('src="./js/dashboard.js"'), "missing dashboard.js module");
  assert(html.index.includes('href="vocabulary.html?study=due"'), "missing SRS deep link");
});

test("index page mode cards link to all four trainers", () => {
  ["repeat.html", "vocabulary.html", "grammar.html", "quiz.html"].forEach(
    (href) => assert(html.index.includes(`href="${href}"`), `missing link ${href}`)
  );
});

/* ---------- CSS / JS references exist ---------- */

const CSS_BY_PAGE = {
  index: ["base", "dash"],
  repeat: ["base", "repeat"],
  vocabulary: ["base", "vocab"],
  grammar: ["base", "gram"],
  quiz: ["base", "quiz"],
  "add-word": ["base", "addw"],
  swt: ["base", "swt"],
  di: ["base", "di"],
  ra: ["base", "read-aloud"]
};

test("every page loads base.css first then its page css", () => {
  Object.entries(CSS_BY_PAGE).forEach(([page, sheets]) => {
    const linkTags = [...html[page].matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(
      (m) => m[1]
    );
    assert(
      linkTags.join(" ").startsWith("./css/base.css"),
      `${page}.html must load base.css first`
    );
    sheets.slice(1).forEach((sheet) =>
      assert(linkTags.includes(`./css/${sheet}.css`), `${page}.html missing ./css/${sheet}.css`)
    );
    assert(!linkTags.some((l) => l.endsWith("/style.css")), `${page}.html still loads style.css`);
  });
});

test("every page stylesheet exists and is shared css + one page sheet", () => {
  const used = [...new Set(Object.values(CSS_BY_PAGE).flat())];
  assert(used.length === 10, `expected 10 css files, got ${used.length}`);
  used.forEach((sheet) => read(`../../css/${sheet}.css`));
});

test("css files have no broken comment headers (no swallowed rules)", () => {
  const files = ["base", "dash", "repeat", "vocab", "gram", "quiz", "addw", "swt", "di", "read-aloud"];
  const lineRe = /^\s*=+\s*\*?\s*$/;
  const commentRe = /\/\*/;
  files.forEach((sheet) => {
    const lines = read(`../../css/${sheet}.css`).split("\n");
    let inComment = false;
    let orphan = false;
    for (const line of lines) {
      if (inComment) {
        if (line.includes("*/")) inComment = false;
        orphan = false;
        continue;
      }
      if (line.includes("/*")) {
        inComment = !line.split("/*")[1].includes("*/");
        orphan = false;
        continue;
      }
      const textOnly = /^\s*[A-Za-z\u0600-\u06FF\uff00-\uffef]/.test(line);
      if (textOnly) orphan = true;
      if (lineRe.test(line)) {
        assert(!orphan, `${sheet}.css: orphan comment header at line beginning ${line.trim()}`);
      }
      if (line.includes("*/")) {
        assert(false, `${sheet}.css: stray */ outside comment`);
      }
    }
    assert(!inComment, `${sheet}.css: unterminated /* comment`);
  });
});

test("quiz page has stats + history wiring elements", () => {
  ["quiz-stats", "quiz-setup", "quiz-view", "quiz-results"].forEach(
    (id) => assert(html.quiz.includes(`id="${id}"`), `missing #${id}`)
  );
});

test("swt page has full wiring and loads base+swt css + swt modules", () => {
  [
    "question-number",
    "timer",
    "passage",
    "passage-word-count",
    "response-input",
    "word-count",
    "sentence-count",
    "sentence-status",
    "response-hint",
    "submit-button",
    "clear-button",
    "previous-button",
    "next-button",
    "swt-progress-fill",
    "result-section",
    "result-content",
    "swt-mode-train",
    "swt-mode-practice",
    "swt-training",
    "swt-training-content",
    "swt-train-go-practice"
  ].forEach((id) => assert(html.swt.includes(`id="${id}"`), `swt: missing #${id}`));

  assert(/css\/base\.css/.test(html.swt), "swt.html must load css/base.css first");
  assert(/css\/swt\.css/.test(html.swt), "swt.html must load css/swt.css");
  assert(/js\/swt\.js/.test(html.swt), "swt.html must load js/swt.js");
  const swtJs = read("../../js/swt.js");
  assert(/import \{ scoreSummary \} from "\.\/swt-score\.js"/.test(swtJs), "swt.js must import scoreSummary from swt-score.js");
  assert(/import \{ buildSwtGuide, renderSwtGuideHTML \} from "\.\/swt-guide\.js"/.test(swtJs), "swt.js must import the training guide helpers");
});

test("describe-image page has full wiring and loads base+di css + di modules", () => {
  [
    "di-question-number",
    "di-phase-pill",
    "di-timer",
    "di-progress-fill",
    "di-image-title",
    "di-image-box",
    "di-hint",
    "di-record-button",
    "di-stop-button",
    "di-transcript",
    "di-word-count",
    "di-fallback-wrap",
    "di-fallback-input",
    "di-submit-fallback",
    "di-previous-button",
    "di-next-button",
    "di-result-section",
    "di-result-content",
    "di-mode-train",
    "di-mode-practice",
    "di-training",
    "di-training-content",
    "di-train-go-practice"
  ].forEach((id) => assert(html.di.includes(`id="${id}"`), `describe-image: missing #${id}`));

  assert(/css\/base\.css/.test(html.di), "describe-image.html must load css/base.css first");
  assert(/css\/di\.css/.test(html.di), "describe-image.html must load css/di.css");
  assert(/js\/describe-image\.js/.test(html.di), "describe-image.html must load js/describe-image.js");

  const diJs = read("../../js/describe-image.js");
  assert(/renderImage/.test(diJs), "describe-image.js must use the SVG renderer");
  assert(/scoreDescription/.test(diJs), "describe-image.js must use the scorer");
  assert(/buildGuide/.test(diJs), "describe-image.js must build the training guide");
  assert(/renderGuideHTML/.test(diJs), "describe-image.js must render the training guide");
});

test("read-aloud page has full wiring and loads base+read-aloud css", () => {
  [
    "ra-question-number",
    "ra-timer",
    "ra-progress-fill",
    "ra-text",
    "ra-word-count",
    "ra-play-button",
    "ra-tip",
    "ra-phase-pill",
    "ra-record-button",
    "ra-stop-button",
    "ra-transcript",
    "ra-fallback-wrap",
    "ra-fallback-input",
    "ra-submit-fallback",
    "ra-result-section",
    "ra-result-content",
    "ra-previous-button",
    "ra-next-button",
    "ra-mode-train",
    "ra-mode-practice",
    "ra-training",
    "ra-training-content",
    "ra-train-go-practice"
  ].forEach((id) => assert(html.ra.includes(`id="${id}"`), `read-aloud: missing #${id}`));

  assert(/css\/base\.css/.test(html.ra), "read-aloud.html must load css/base.css first");
  assert(/css\/read-aloud\.css/.test(html.ra), "read-aloud.html must load css/read-aloud.css");
  assert(/js\/read-aloud\.js/.test(html.ra), "read-aloud.html must load js/read-aloud.js");
  const raJs = read("../../js/read-aloud.js");
  assert(/scoreReadAloud/.test(raJs), "read-aloud.js must use the Read Aloud scorer");
  assert(/speechSynthesis/.test(raJs), "read-aloud.js must offer text playback");
});

test("dashboard has the backup card wired to the progress module", () => {
  ["dash-backup", "dash-export", "dash-import", "dash-import-file",
   "dash-reset-stats", "dash-reset-all", "dash-backup-report"].forEach((id) =>
    assert(html.index.includes(`id="${id}"`), `index.html: missing #${id}`)
  );
  const dashJs = read("../../js/dashboard.js");
  assert(/buildSnapshot/.test(dashJs), "dashboard must export the progress snapshot");
  assert(/mergeSnapshot/.test(dashJs), "dashboard must merge an imported snapshot");
  assert(/resetStats/.test(dashJs) && /resetEverything/.test(dashJs), "dashboard must offer both reset scopes");
  assert(/css\/dash\.css/.test(html.index), "index.html must load css/dash.css");
});

test("every page sidebar links to read-aloud.html", () => {
  ["index", "repeat", "vocabulary", "grammar", "quiz", "add-word", "swt", "di", "ra"].forEach((key) => {
    assert(html[key].includes('href="read-aloud.html"'), `${key}.html: missing sidebar link to read-aloud.html`);
  });
});

test("every page sidebar links to swt.html and describe-image.html", () => {
  ["index", "repeat", "vocabulary", "grammar", "quiz", "add-word", "ra"].forEach((key) => {
    assert(html[key].includes('href="swt.html"'), `${key}.html: missing sidebar link to swt.html`);
    assert(html[key].includes('href="describe-image.html"'), `${key}.html: missing sidebar link to describe-image.html`);
  });
});

test("all three task pages expose the shared exam-conditions toggle", () => {
  ["swt", "di", "ra"].forEach((prefix) => {
    assert(html[prefix].includes(`id="${prefix}-exam-toggle"`), `${prefix}: missing the exam toggle`);
    assert(html[prefix].includes(`${prefix}-header-actions`), `${prefix}: header controls must be grouped`);
  });

  const base = read("../../css/base.css");
  assert(/\.exam-toggle/.test(base), "base.css must style the exam toggle");
  assert(/body\.exam-mode/.test(base), "base.css must hide the aids under exam mode");
  assert(/\.is-warning/.test(base), "base.css must style the timer warning");

  ["swt", "describe-image", "read-aloud"].forEach((name) => {
    const module = read(`../../js/${name}.js`);
    assert(/isExamMode/.test(module), `${name}.js must read the shared exam flag`);
    assert(/exam-toggle/.test(module), `${name}.js must wire its toggle button`);
    assert(/detailTermsFor/.test(module), `${name}.js must drop diagnostics in exam mode`);
    assert(/shouldWarn/.test(module), `${name}.js must warn in the final seconds`);
  });

  const exam = read("../../js/exam-mode.js");
  assert(/EXAM_KEY = "pte\.exam\.v1"/.test(exam), "exam mode must use one shared key");
});

test("page stylesheets do not duplicate rules that base.css already owns", () => {
  /*
  Grouped selectors in base.css are the shared home for task components, so an
  identical top-level rule appearing in two page sheets is duplication. Rules
  inside @media are ignored on purpose: each page picks its own breakpoint for
  responsive tweaks.
  */
  const bodiesOf = (file) => {
    const css = read(`../../css/${file}`);
    const bodies = new Map();
    let index = 0;

    while (index < css.length) {
      const open = css.indexOf("{", index);
      if (open < 0) break;
      const selector = css.slice(index, open).trim();
      let depth = 1;
      let cursor = open + 1;
      while (cursor < css.length && depth > 0) {
        if (css[cursor] === "{") depth += 1;
        else if (css[cursor] === "}") depth -= 1;
        cursor += 1;
      }
      const body = css.slice(open + 1, cursor - 1);

      if (selector.startsWith("@")) {
        index = cursor;
        continue;
      }

      if (selector.startsWith(".") && depth === 1) {
        const key =
          selector.replace(/^\.(di|swt|ra)-/, ".") + " ||| " + body.replace(/\s+/g, " ").trim();
        if (!bodies.has(key)) bodies.set(key, selector);
      }

      index = cursor;
    }

    return bodies;
  };

  const pages = ["di", "swt", "read-aloud"];
  const sheets = pages.map((name) => [name, bodiesOf(`${name}.css`)]);
  const repeated = [];

  for (let i = 0; i < sheets.length; i += 1) {
    for (let j = i + 1; j < sheets.length; j += 1) {
      sheets[i][1].forEach((_value, key) => {
        if (sheets[j][1].has(key)) {
          repeated.push(`${sheets[i][0]}.css / ${sheets[j][0]}.css: ${key.split(" ||| ")[0]}`);
        }
      });
    }
  }

  assert(
    repeated.length === 0,
    `these rules are duplicated across page stylesheets and belong in base.css:\n${repeated.join("\n")}`
  );
});

test("base.css owns the shared task components as grouped selectors", () => {
  const base = read("../../css/base.css");
  [
    ".di-result-content",
    ".swt-result-content",
    ".ra-result-content",
    ".swt-step",
    ".ra-step",
    ".swt-mode-btn.is-on",
    ".ra-mode-btn.is-on"
  ].forEach((selector) => {
    assert(base.includes(selector), `base.css must own ${selector}`);
  });
  const grouped = /\.di-result-content,\s*\n?\.ra-result-content,\s*\n?\.swt-result-content/.test(base);
  assert(grouped, "shared components must use one grouped selector, not three copies");
});

test("no page, stylesheet or module leaks another page's class prefix", () => {
  const diCss = read("../../css/di.css");
  const swtCss = read("../../css/swt.css");
  assert(!/\.swt-/.test(diCss), "di.css must not contain .swt- rules");
  assert(!/\.di-/.test(swtCss), "swt.css must not contain .di- rules");
  assert(!/class="[^"]*\bswt-/.test(html.di), "describe-image.html must not use swt- classes");
  assert(!/class="[^"]*\bdi-/.test(html.swt), "swt.html must not use di- classes");
  assert(!/["'`]swt-/.test(read("../../js/describe-image.js")), "describe-image.js must not emit swt- classes");
  assert(!/["'`]di-/.test(read("../../js/swt.js")), "swt.js must not emit di- classes");
  const raCss = read("../../css/read-aloud.css");
  assert(!/\.di-/.test(raCss), "read-aloud.css must not contain .di- rules");
  assert(!/\.swt-/.test(raCss), "read-aloud.css must not contain .swt- rules");
  assert(!/class="[^"]*\b(di|swt)-/.test(html.ra), "read-aloud.html must not use di-/swt- classes");
});

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);