/*
==========================================
PTE Trainer
Describe Image — Training guide
Turns an image item into a step-by-step
lesson using its own data, so every guide
is concrete rather than generic.
==========================================
*/

"use strict";

export const THREE_STEPS = [
  {
    title: "1 · Identify the image",
    body: "Open with one sentence stating the type of image and what it shows (axis or subject). Keep it short and neutral.",
    frame: "This is a bar chart showing … between 2019 and 2023."
  },
  {
    title: "2 · Describe the key features",
    body: "Spend 2–3 sentences on the most visible facts: the highest or lowest values, a clear comparison, or a trend. Always include numbers.",
    frame: "It peaked at … in …, while … was the lowest at …."
  },
  {
    title: "3 · Conclude with an overview",
    body: "End with one sentence that sums up the overall pattern or the final step. Do not add opinions or speculate about causes.",
    frame: "Overall, … increased across all categories."
  }
];

function maxValue(values, labels) {
  const index = values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
  return { value: values[index], label: labels ? labels[index] : String(index + 1) };
}

function numeric(values) {
  return values.map((v) => Number(String(v).replace(/[^0-9.+-]/g, "")) || 0);
}

function trend(values) {
  const nums = numeric(values);
  if (nums.length < 2) return "";
  const diff = nums[nums.length - 1] - nums[0];
  if (Math.abs(diff) < 0.01) return "remained broadly stable";
  return diff > 0 ? `rose from ${nums[0]} to ${nums[nums.length - 1]}` : `fell from ${nums[0]} to ${nums[nums.length - 1]}`;
}

/* ------------- per-category helpers ------------- */

function highlightsBarLine(data) {
  const { labels } = data;
  const groups = data.groups || data.series;
  const lines = [];
  groups.forEach((group) => {
    const { value, label } = maxValue(group.values, labels);
    lines.push(`For ${group.label}, the highest figure is ${label} at ${value}.`);
  });
  if (groups.length === 2) {
    const base = numeric(groups[0].values);
    const current = numeric(groups[1].values);
    const baseTotal = base.reduce((a, b) => a + b, 0);
    const currentTotal = current.reduce((a, b) => a + b, 0);
    lines.push(
      currentTotal > baseTotal
        ? `Overall, ${groups[1].label} outranks ${groups[0].label} (${currentTotal} vs ${baseTotal}).`
        : `Overall, ${groups[0].label} is still slightly above ${groups[1].label} (${baseTotal} vs ${currentTotal}).`
    );
  }
  return lines;
}

function highlightsPie(data) {
  const sorted = data.values.slice().sort((a, b) => b.value - a.value);
  const largest = sorted[0];
  const second = sorted[1] || null;
  const total = data.values.reduce((a, v) => a + v.value, 0);
  const pct = Math.round((largest.value / total) * 100);
  let line = `${largest.label} accounts for the largest share at ${pct}% of the total.`;
  if (second) {
    const secondPct = Math.round((second.value / total) * 100);
    line += ` ${second.label} follows with ${secondPct}%.`;
  }
  return [line];
}

function highlightsTable(data) {
  const rows = data.rows;
  const numsByRow = rows.map((row) => numeric(row));
  const lastCol = numsByRow.map((nums) => nums[nums.length - 1]);
  const growthIndex = lastCol.reduce((best, v, i) => (v > lastCol[best] ? i : best), 0);
  const lowestIndex = lastCol.reduce((best, v, i) => (v < lastCol[best] ? i : best), 0);
  return [
    `All ${rows.length} departments show growth between ${data.headers[1]} and ${data.headers[2]}.`,
    `${rows[growthIndex][0]} grew fastest at +${lastCol[growthIndex]}% growth.`,
    `${rows[lowestIndex][0]} remains the smallest at ${rows[lowestIndex][rows[lowestIndex].length - 2]} students in ${data.headers[2]}.`
  ];
}

function highlightsMap(data) {
  const regions = data.regions;
  const nums = regions.map((r) => numeric([r.value])[0]);
  const high = nums.reduce((b, v, i) => (v > nums[b] ? i : b), 0);
  const low = nums.reduce((b, v, i) => (v < nums[b] ? i : b), 0);
  return [
    `${regions[high].label} is the largest producer at ${regions[high].value}.`,
    `${regions[low].label} records the smallest output at ${regions[low].value}.`
  ];
}

function highlightsProcess(data) {
  const steps = data.steps;
  if (data.cycle) {
    return [
      `The process is circular: it begins with ${steps[0].label} and eventually returns to ${steps[steps.length - 1].label}.`,
      `${steps[1].label} connects directly to ${steps[2].label} in the sequence.`
    ];
  }
  return [
    `The process is linear, moving from ${steps[0].label} to ${steps[steps.length - 1].label}.`,
    `${steps.length} stages appear in a fixed order with no branching or repeats.`
  ];
}

const TYPE_GUIDES = {
  "bar-chart": {
    howTo: "Say the type, the subject, and the units first. Then name the tallest and shortest bars per category or year, and finish with a comparison of the totals.",
    frames: [
      "This is a bar chart showing … across four quarters.",
      "… peaked at … in ….",
      "… was considerably higher/lower than ….",
      "Overall, … outranked … in every category."
    ]
  },
  "line-graph": {
    howTo: "Describe direction first, not single values: where each line rises, falls, or plateaus. Then mention the peak and finish with which series stays higher throughout.",
    frames: [
      "This line graph shows the trend of … between … and ….",
      "The line for … declined steadily until ….",
      "… reached its highest point of … in ….",
      "Overall, … remained consistently above …."
    ]
  },
  "pie-chart": {
    howTo: "Name the largest slice with its percentage, then the second-largest, and group the small slices together. Finish with one sentence about how concentrated the distribution is.",
    frames: [
      "This pie chart shows how … is distributed.",
      "… accounts for the largest proportion at …%.",
      "… follows closely at …%.",
      "Taken together, the small slices make up only …%."
    ]
  },
  table: {
    howTo: "Announce what the table measures and over which period. Compare columns rather than rows, name the biggest increase, and end with the subject that stays smallest or largest.",
    frames: [
      "This table compares … for the years … and ….",
      "All subjects increased, with … growing fastest at …%.",
      "… attracted the highest numbers in both years.",
      "Overall, … remained the smallest department."
    ]
  },
  map: {
    howTo: "Say what the map measures (units included), name the largest and smallest regions by value, and add which parts of the country are most productive.",
    frames: [
      "This map shows … by region, measured in ….",
      "The … region leads production with … tonnes.",
      "… records the lowest output of the four regions.",
      "Overall, production concentrates in the east and north."
    ]
  },
  "process-diagram": {
    howTo: "Use sequencing words: first, then, next, finally. For a cycle, say it repeats rather than ends. State the input and the final output clearly.",
    frames: [
      "The diagram illustrates how … is produced.",
      "First, … happens when ….",
      "It then passes through … before reaching ….",
      "Finally, … and the process begins again."
    ]
  }
};

export const TIPS = [
  "Practice speaking continuously for the full 40 seconds — a steady pace beats short answers.",
  "Always mention numbers, units, or percentages; they are the quickest way to raise the Content score.",
  "Describe only what you can see; never invent causes or compare with outside knowledge.",
  "Use sequencing words for processes: first, then, next, finally."
];

export const AVOID = [
  "Do not describe colors or visual styling — only the data matters.",
  "Do not read every label out loud; name only the standout values.",
  "Do not repeat the same sentence frame twice in one answer."
];

/* ------------- build the lesson for one item ------------- */

export function buildGuide(item) {
  const category = item.category;
  const type = TYPE_GUIDES[category];
  const data = item.data;

  const highlights =
    category === "bar-chart" || category === "line-graph" ? highlightsBarLine(data)
    : category === "pie-chart" ? highlightsPie(data)
    : category === "table" ? highlightsTable(data)
    : category === "map" ? highlightsMap(data)
    : category === "process-diagram" ? highlightsProcess(data)
    : [];

  const example =
    category === "bar-chart" ? "In both 2019 and 2023, Q4 recorded the highest number of visitors."
    : category === "line-graph" ? "Melbourne is cooler than Sydney every month, with the biggest gap in summer."
    : category === "pie-chart" ? "Electricity is the largest single category at 42% of household demand."
    : category === "table" ? "All four departments increased, with Information Technology growing fastest at +40%."
    : category === "map" ? "The eastern region produces the most wheat at 40,000 tonnes."
    : "First the rain is collected, then filtered, treated, and finally stored for supply.";

  return {
    category,
    type,
    highlights,
    example,
    typeHowTo: type ? type.howTo : "",
    frames: type ? type.frames : [],
    threeSteps: THREE_STEPS,
    tips: TIPS,
    avoid: AVOID,
    model: item.reference
  };
}

/* ------------- render to HTML ------------- */

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderGuideHTML(item, guide) {
  const steps = guide.threeSteps
    .map(
      (s, index) =>
        `<div class="di-step">` +
        `<div class="di-step-head"><span class="di-step-tag">${s.title.split(" ")[0]}</span><strong>${esc(s.title.slice(s.title.indexOf(" ") + 1))}</strong></div>` +
        `<p>${esc(s.body)}</p>` +
        (index === 1
          ? `<ul class="di-highlights">${guide.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` +
            `<p class="di-example">Example: ${esc(guide.example)}</p>`
          : `<p class="di-frame">“${esc(s.frame)}”</p>`)
        + `</div>`
    )
    .join("");

  const frames = guide.frames.map((f) => `<li>${esc(f)}</li>`).join("");

  return (
    `<div class="di-training-card">` +

    `<div class="di-training-hero">` +
    `<div class="di-training-title">How to describe this image</div>` +
    `<p class="di-training-sub">A 3-step method that works for every PTE image, applied to this ${esc(guide.category.replace("-", " "))}.</p>` +
    `</div>` +

    `<div class="di-steps">${steps}</div>` +

    `<div class="di-panel">` +
    `<h4>Pick-up sentences for this type</h4>` +
    `<p class="di-panel-note">${esc(guide.typeHowTo)}</p>` +
    `<ul class="di-frames">${frames}</ul>` +
    `</div>` +

    `<div class="di-panel">` +
    `<h4>Do &amp; don't</h4>` +
    `<p class="di-tips-label">✓ Do</p><ul class="di-tips">${guide.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` +
    `<p class="di-tips-label is-avoid">✗ Don't</p><ul class="di-tips is-avoid">${guide.avoid.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` +
    `</div>` +

    `<details class="di-model-guide">` +
    `<summary>Read the model answer (40 s)</summary>` +
    `<p class="di-model-text">${esc(guide.model)}</p>` +
    `<p class="di-model-note">Intro sentence → key features with numbers → one overview sentence. Aim for roughly this length.</p>` +
    `</details>` +

    `</div>`
  );
}