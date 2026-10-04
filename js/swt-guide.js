/*
==========================================
PTE Trainer
Summarize Written Text — Training guide
A 3-step PTE method for writing ONE 5–75
word summary sentence, built around the
actual passage the learner is viewing.
==========================================
*/

"use strict";

export const THREE_STEPS = [
  {
    title: "1 · Find the main idea",
    body: "Read the whole passage once before writing anything. The central claim usually sits in the first or last sentence: it states the topic and the author's position. Ask yourself 'what is this text really arguing?'",
    frame: "The passage discusses …, arguing that …."
  },
  {
    title: "2 · Keep only the strongest supports",
    body: "Select two or three points that justify the claim — typically a cause, a contrast or a condition. Leave out dates, examples and minor details unless they are essential to the argument.",
    frame: "…, because of … and despite …."
  },
  {
    title: "3 · Merge into one sentence",
    body: "Join the claim and its supports with linking words such as because, although, while, which or due to. Stay inside the official bounds — one sentence, 5–75 words — and finish with a single full stop.",
    frame: "Although …, it is argued that …, provided that …."
  }
];

export const FRAMES = [
  "The passage discusses …, explaining that ….",
  "Because of …, the author argues that ….",
  "Although …, it is clear that ….",
  "…, which has led to …, despite ….",
  "The text attributes … to …, concluding that ….",
  "Overall, the writer contends that …, subject to …."
];

export const TIPS = [
  "Rephrase in your own words; copying a whole clause costs you Content and Vocabulary marks.",
  "Draft on the screen, then trim to around 30–50 words — the safest range inside the 5–75 limit.",
  "Use linking words to fold the supports into one clause instead of writing two sentences.",
  "Reserve the final minute to check the comma, the word count and the closing period."
];

export const AVOID = [
  "Do not write two sentences — the form is one sentence only.",
  "Do not exceed 75 words or drop below 5.",
  "Do not add opinions, advice or outside knowledge.",
  "Do not list every detail; keep the strongest three points at most."
];

/* ---------- passage-specific guidance ---------- */

/*
The scorer weights Content as Main Idea 40% + Key Points 60%, and a key point
counts as covered at 45% idea overlap. The guide therefore teaches exactly
those two things instead of a flat keyword list. Older passages without those
fields fall back to their keyword list.
*/

function buildCover(item) {
  const mainIdea = item.mainIdea || "";
  const keyPoints = Array.isArray(item.keyPoints) ? item.keyPoints : [];

  if (mainIdea || keyPoints.length) {
    return {
      mode: "points",
      mainIdea,
      keyPoints,
      supportTarget: Math.min(keyPoints.length, 2),
      keywords: (item.keywords || []).slice(0, 6)
    };
  }

  const keywords = item.keywords || [];
  return {
    mode: "keywords",
    mainIdea: "",
    keyPoints: [],
    supportTarget: 0,
    keywords
  };
}

export function buildSwtGuide(item) {
  return {
    title: item.title || "this passage",
    threeSteps: THREE_STEPS,
    frames: FRAMES,
    tips: TIPS,
    avoid: AVOID,
    cover: buildCover(item)
  };
}

/* ---------- render ---------- */

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderSwtGuideHTML(item, guide) {
  const steps = guide.threeSteps
    .map(
      (s) =>
        `<div class="swt-step">` +
        `<div class="swt-step-head"><span class="swt-step-tag">${s.title.split(" ")[0]}</span><strong>${esc(s.title.slice(s.title.indexOf(" ") + 1))}</strong></div>` +
        `<p>${esc(s.body)}</p>` +
        `<p class="swt-frame">“${esc(s.frame)}”</p>` +
        `</div>`
    )
    .join("");

  const cover = guide.cover;

  const coverPanel =
    cover.mode === "points"
      ? `<div class="swt-panel swt-cover">` +
        `<h4>1 · The claim you must state</h4>` +
        `<p class="swt-claim">${esc(cover.mainIdea)}</p>` +
        `<p class="swt-panel-note">This alone is 40% of your Content mark — paraphrase it, do not copy it.</p>` +
        `<h4 class="swt-subhead">2 · The supporting points (60% of Content)</h4>` +
        `<ol class="swt-supports">${cover.keyPoints
          .map((p) => `<li>${esc(p)}</li>`)
          .join("")}</ol>` +
        `<p class="swt-panel-note">Each point counts once you have expressed about half of it. Cover at least ${cover.supportTarget} of them — there is no room for all ${cover.keyPoints.length} in one sentence.</p>` +
        (cover.keywords.length
          ? `<h4 class="swt-subhead">Words that earn the vocabulary mark</h4>` +
            `<ul class="swt-frames">${cover.keywords
              .map((k) => `<li>${esc(k)}</li>`)
              .join("")}</ul>`
          : "") +
        `</div>`
      : `<div class="swt-panel">` +
        `<h4>Ideas this passage should cover</h4>` +
        `<ul class="swt-frames">${cover.keywords
          .map((k) => `<li>${esc(k)}</li>`)
          .join("")}</ul>` +
        `<p class="swt-panel-note">Pick the claim plus two or three of the strongest points above; you do not have to mention all of them.</p>` +
        `</div>`;

  return (
    `<div class="swt-training-card">` +

    `<div class="swt-training-hero">` +
    `<div class="swt-training-title">How to summarise “${esc(guide.title)}”</div>` +
    `<p class="swt-training-sub">A 3-step PTE method for one controlled sentence, applied to the passage on the left.</p>` +
    `</div>` +

    `<div class="swt-steps">${steps}</div>` +

    coverPanel +

    `<div class="swt-panel">` +
    `<h4>Linking frames for one sentence</h4>` +
    `<ul class="swt-frames">${guide.frames.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` +
    `</div>` +

    `<div class="swt-panel">` +
    `<h4>Do &amp; don't</h4>` +
    `<p class="swt-tips-label">✓ Do</p><ul class="swt-tips">${guide.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` +
    `<p class="swt-tips-label is-avoid">✗ Don't</p><ul class="swt-tips is-avoid">${guide.avoid.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` +
    `</div>` +

    `<details class="swt-model-guide">` +
    `<summary>Annotate the model answer</summary>` +
    `<p class="swt-model-text">${esc(item.reference)}</p>` +
    `<p class="swt-model-note">One sentence: claim + supports joined by connectors + one full stop. Compare your draft clause by clause.</p>` +
    `</details>` +

    `</div>`
  );
}