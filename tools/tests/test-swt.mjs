/* ==========================================
   PTE Trainer — SWT scoring module unit tests
   Run: node tools/tests/test-swt.mjs
   ========================================== */

import { scoreSummary } from "../../js/swt-score.js";
import { readFileSync } from "node:fs";
import {
  buildSwtGuide,
  renderSwtGuideHTML,
  THREE_STEPS as SWT_STEPS,
  FRAMES as SWT_FRAMES,
  TIPS as SWT_TIPS,
  AVOID as SWT_AVOID
} from "../../js/swt-guide.js";
import {
  THREE_STEPS as DI_STEPS,
  TIPS as DI_TIPS,
  AVOID as DI_AVOID
} from "../../js/di-guide.js";

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
  if (!condition) throw new Error(message);
}

const passage = {
  keywords: ["renewable energy", "electricity", "fossil fuels", "energy security", "investment in infrastructure"]
};

test("a good summary scores high across all four criteria", () => {
  const text =
    "Renewable energy produces electricity with lower emissions than fossil fuels and can improve energy security, but it requires investment in infrastructure.";
  const result = scoreSummary(passage, text);
  assert(result.sentences === 1, `expected 1 sentence, got ${result.sentences}`);
  assert(result.words >= 5 && result.words <= 75, `word count ${result.words} must be 5-75`);
  assert(result.total >= 80, `expected total >= 80, got ${result.total}`);
  Object.values(result.criteria).forEach((v) => assert(v >= 1, `criterion too low: ${v}`));
});

test("no response scores zero", () => {
  const result = scoreSummary(passage, "");
  assert(result.total === 0, `expected 0, got ${result.total}`);
  assert(result.criteria.Form === 0, "empty text should fail Form");
});

test("multiple sentences fail the Form criterion", () => {
  const text = "This is the first sentence. And this is a second one to force the rule into action today.";
  const result = scoreSummary(passage, text);
  assert(result.sentences === 2, `expected 2 sentences, got ${result.sentences}`);
  assert(result.criteria.Form === 0, `expected Form 0, got ${result.criteria.Form}`);
});

test("keyword coverage is counted correctly", () => {
  const text = "Renewable energy produces electricity while burning fewer fossil fuels, improving energy security.";
  const result = scoreSummary(passage, text);
  assert(result.keywordTotal === passage.keywords.length, "keywordTotal mismatch");
  assert(result.hits >= 4, `expected >=4 keyword hits, got ${result.hits}`);
});

test("SWT training guide builds 3 steps with frames + passage cover ideas", () => {
  const guide = buildSwtGuide({ title: "Sample", keywords: ["a", "b", "c", "d", "e", "f"] });
  assert(guide.threeSteps.length === 3, "guide must have exactly 3 steps");
  guide.threeSteps.forEach((s) => assert(s.title && s.body && s.frame, "each step needs title/body/frame"));
  assert(guide.frames.length >= 6, "expected at least 6 linking frames");
  assert(guide.tips.length >= 4 && guide.avoid.length >= 4, "expected do & don't lists");
  assert(guide.cover.keywords.length === 6, "expected the keyword list as cover ideas");
  assert(guide.cover.mode === "keywords", "a passage without mainIdea/keyPoints must fall back to keywords");
});

test("SWT guide teaches the claim and the supporting points the scorer looks for", () => {
  const item = {
    title: "The Growth of Renewable Energy",
    keywords: ["renewable energy", "electricity"],
    mainIdea: "Renewable energy matters for cleaner electricity and security.",
    keyPoints: ["It produces lower emissions.", "It improves energy security.", "It needs storage."]
  };
  const guide = buildSwtGuide(item);
  assert(guide.cover.mode === "points", "mainIdea + keyPoints must switch the guide to the claim/supports layout");
  assert(guide.cover.mainIdea === item.mainIdea, "the claim must reach the guide");
  assert(guide.cover.keyPoints.length === 3, "all key points must reach the guide");
  assert(guide.cover.supportTarget === 2, "the guide must tell the learner to aim for two supports");

  const html = renderSwtGuideHTML(item, guide);
  assert(html.includes("The claim you must state"), "claim panel must be rendered");
  assert(html.includes(item.mainIdea), "claim text must be rendered");
  assert(html.includes("supporting points"), "supports panel must be rendered");
  assert(html.includes("It needs storage."), "every key point must be rendered");
  assert((html.match(/<li>/g) || []).length >= guide.cover.keyPoints.length, "each support is a list item");
});

test("every SWT passage in data/swt.json carries a claim and key points", async () => {
  const passages = JSON.parse(readFileSync(new URL("../../data/swt.json", import.meta.url), "utf8"));
  passages.forEach((passage) => {
    assert(typeof passage.mainIdea === "string" && passage.mainIdea.length > 10, `${passage.id}: missing mainIdea`);
    assert(Array.isArray(passage.keyPoints) && passage.keyPoints.length >= 2, `${passage.id}: needs at least 2 keyPoints`);
  });
});

test("SWT guide renders hero, keywords and model reference with balanced markup", () => {
  const item = {
    title: "The Growth of Renewable Energy",
    keywords: ["renewable energy", "electricity", "fossil fuels"],
    reference: "Renewable energy is growing because it cuts emissions."
  };
  const html = renderSwtGuideHTML(item, buildSwtGuide(item));
  assert(html.includes("How to summarise “The Growth of Renewable Energy”"), "hero must name the passage");
  assert(html.includes("renewable energy") && html.includes("fossil fuels"), "keywords must render");
  assert(html.includes(item.reference), "model reference must render");
  assert(html.includes('class="swt-step"'), "guide must render steps");
  const open = (html.match(/<div/g) || []).length;
  const close = (html.match(/<\/div>/g) || []).length;
  assert(open === close, `div tags unbalanced: ${open} vs ${close}`);
});

test("SWT training sentences do not repeat Describe Image training sentences", () => {
  const normalize = (s) => s.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  const swtPool = [
    ...SWT_STEPS.map((s) => s.body),
    ...SWT_STEPS.map((s) => s.frame),
    ...SWT_FRAMES,
    ...SWT_TIPS,
    ...SWT_AVOID
  ].map(normalize);
  const diPool = [
    ...DI_STEPS.map((s) => s.body),
    ...DI_STEPS.map((s) => s.frame),
    ...DI_TIPS,
    ...DI_AVOID
  ].map(normalize);
  const repeated = swtPool.filter((s) => diPool.includes(s));
  assert(repeated.length === 0, `repeated sentences: ${repeated.join(" | ")}`);
});

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);