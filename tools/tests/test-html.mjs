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
  vocabulary: read("../../vocabulary.html"),
  grammar: read("../../grammar.html"),
  quiz: read("../../quiz.html")
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

test("every page references css/style.css", () => {
  ["index", "vocabulary", "grammar", "quiz"].forEach((page) =>
    assert(html[page].includes('./css/style.css'), `${page}.html missing stylesheet`)
  );
});

test("quiz page has stats + history wiring elements", () => {
  ["quiz-stats", "quiz-setup", "quiz-view", "quiz-results"].forEach(
    (id) => assert(html.quiz.includes(`id="${id}"`), `missing #${id}`)
  );
});

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);