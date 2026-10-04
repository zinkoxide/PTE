/* ==========================================
   PTE Trainer — Describe Image units
   Scoring + SVG renderer sanity checks
   Run: node tools/tests/test-di.mjs
   ========================================== */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scoreDescription } from "../../js/di-score.js";
import { renderImage, CATEGORY_LABELS } from "../../js/di-render.js";
import { buildGuide, renderGuideHTML } from "../../js/di-guide.js";

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
  if (!condition) throw new Error(message);
}

const images = JSON.parse(
  readFileSync(new URL("../../data/describe-images.json", import.meta.url), "utf8")
);

test("data file has at least one image per requested category", () => {
  const categories = new Set(images.map((i) => i.category));
  ["bar-chart", "line-graph", "pie-chart", "table", "map", "process-diagram"].forEach(
    (category) => assert(categories.has(category), `missing category ${category}`)
  );
});

test("every image has reference + keywords and an id", () => {
  images.forEach((image) => {
    assert(image.id, "image missing id");
    assert(image.reference && image.reference.trim().length > 40, `short reference in ${image.id}`);
    assert(Array.isArray(image.keywords) && image.keywords.length >= 5, `need >=5 keywords in ${image.id}`);
  });
});

test("every image renders a complete svg with drawn shapes in it", () => {
  images.forEach((image) => {
    const svg = renderImage(image);
    assert(svg.startsWith("<svg") && svg.endsWith("</svg>"), `${image.id}: not an svg string`);
    assert(
      /<(line|path|polygon|polyline|rect|circle)/.test(svg),
      `${image.id}: no drawn shape found`
    );
  });
});

test("a complete spoken description scores high", () => {
  const text =
    "The bar chart compares visitors in thousands for 2019 and 2023 across four quarters. Visitors increased each year, and the highest numbers appeared in quarter four.";
  const result = scoreDescription(images[0], text);
  assert(result.total >= 70, `expected total >= 70, got ${result.total}`);
  assert(result.criteria.Fluency === 2, `expected full fluency, got ${result.criteria.Fluency}`);
});

test("the scorer reports which keywords the answer left out", () => {
  const keywords = images[0].keywords;
  const text = `This bar chart shows one thing about ${keywords[0]} only.`;
  const result = scoreDescription(images[0], text);
  assert(result.missedKeywords.length === keywords.length - result.hits, "every missing keyword must be reported");
  assert(result.hits >= 1, "the keyword that was used must not be reported as missed");
  assert(
    result.missedKeywords.every((word) => keywords.includes(word)),
    "missed keywords must come from the item"
  );
});

test("an empty response scores zero", () => {
  const result = scoreDescription(images[0], "");
  assert(result.total === 0, `expected 0, got ${result.total}`);});

test("a short response is penalised on fluency", () => {
  const result = scoreDescription(images[2], "The pie chart shows electricity.");
  assert(result.words < 15, "test wording must be short");
  assert(result.criteria.Fluency < 2, `expected fluency penalty, got ${result.criteria.Fluency}`);
});

test("CATEGORY_LABELS covers all used categories", () => {
  images.forEach((image) => {
    assert(CATEGORY_LABELS[image.category], `no label for ${image.category}`);
  });
});

test("the training guide has the 3-step method, frames, tips and a model per image", () => {
  images.forEach((image) => {
    const guide = buildGuide(image);
    assert(guide.threeSteps.length === 3, `${image.id}: need exactly 3 steps`);
    assert(guide.frames.length >= 4, `${image.id}: need pick-up sentence frames`);
    assert(guide.tips.length >= 2, `${image.id}: need tips`);
    assert(guide.avoid.length >= 2, `${image.id}: need don'ts`);
    assert(guide.highlights.length >= 1, `${image.id}: guide must use the image's own data`);
    assert(guide.model === image.reference, `${image.id}: model mismatch`);
  });
});

test("every guide renders to html with its own data highlights", () => {
  images.forEach((image) => {
    const htmlFragment = renderGuideHTML(image, buildGuide(image));
    assert(htmlFragment.includes("How to describe this image"), `${image.id}: missing hero`);
    assert(htmlFragment.includes("di-step"), `${image.id}: missing step blocks`);
    assert(/di-highlights/.test(htmlFragment), `${image.id}: missing data highlights`);
    const opens = (htmlFragment.match(/<div/g) || []).length;
    const closes = (htmlFragment.match(/<\/div>/g) || []).length;
    assert(opens === closes, `${image.id}: unbalanced div tags (${opens} vs ${closes})`);
  });
});

test("every chart type has a label, a renderer and a training guide", () => {
  const categories = [...new Set(images.map((image) => image.category))];
  categories.forEach((category) => {
    assert(CATEGORY_LABELS[category], `no label for category ${category}`);
    const item = images.find((image) => image.category === category);
    assert(item, `no data item for category ${category}`);
    const guide = buildGuide(item);
    assert(guide.type, `no guide entry for category ${category}`);
    assert(guide.frames.length >= 4, `${category} needs at least 4 frames`);
    assert(guide.highlights.length >= 1, `${category} produced no data highlights`);
    assert(renderImage(item).includes("<svg"), `${category} produced no svg`);
  });
  assert(
    Object.keys(CATEGORY_LABELS).every((category) => categories.includes(category)),
    "every supported category must appear in the data so it can be practised"
  );
});

test("the new process types render their own shapes", () => {
  const flow = renderImage(images.find((i) => i.id === "complaint-decision"));
  assert((flow.match(/<polygon/g) || []).length >= 2, "a decision flow needs a diamond and arrowheads");
  assert(flow.includes("Yes") && flow.includes("No"), "both branches must be labelled");

  const cycle = renderImage(images.find((i) => i.id === "water-bottle-cycle"));
  assert(cycle.includes("<circle"), "a cycle is drawn around a circle");
  assert((cycle.match(/<path d="M /g) || []).length >= 6, "a six-stage cycle needs six curved arrows");

  const timeline = renderImage(images.find((i) => i.id === "library-timeline"));
  assert((timeline.match(/<circle/g) || []).length >= 5, "each milestone needs a marker on the axis");
  assert(timeline.includes("1857") && timeline.includes("2021"), "the timeline must show its years");
});

test("the timeline guide names the longest gap between milestones", () => {
  const guide = buildGuide(images.find((i) => i.id === "library-timeline"));
  assert(guide.highlights.some((line) => /longest interval/i.test(line)), "expected a longest-interval highlight");
  assert(guide.highlights.some((line) => line.includes("1857") && line.includes("2021")), "expected the first and last milestone");
});

test("new process guides produce grammatical English, not raw labels", () => {
  const flow = buildGuide(images.find((i) => i.id === "complaint-decision"));
  assert(
    !/\bwhether is\b/i.test(flow.highlights.join(" ")),
    "the decision highlight must not read 'whether is ...'"
  );
  assert(!/^If is /i.test(flow.example), "the decision example must not start with 'If is ...'");
  assert(/\?$/.test(flow.example.split(" — ")[1] || "") || flow.example.includes("?"), "the example keeps the question");

  const cycle = buildGuide(images.find((i) => i.id === "water-bottle-cycle"));
  assert(cycle.example.includes("no final stage"), "the cycle example must say the loop has no final stage");
  assert(!cycle.example.includes("undefined"), "no label may leak as undefined");

  const timeline = buildGuide(images.find((i) => i.id === "library-timeline"));
  assert(timeline.example.includes("1857") && timeline.example.includes("2021"), "the timeline example must use real years");
});

test("first-time visitors default to training mode", () => {
  const diJs = readFileSync(
    new URL("../../js/describe-image.js", import.meta.url),
    "utf8"
  );
  assert(/return "training";/.test(diJs), "training should be the initial mode");
});

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);