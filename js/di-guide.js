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
  const headers = data.headers;
  const subject = data.subject || "departments";
  const from = (data.period && data.period.from) || headers[1];
  const to = (data.period && data.period.to) || headers[headers.length - 2];
  const pctIndex = headers.findIndex((header) => /%|growth|change/i.test(header));
  const valueIndex = pctIndex >= 0 ? headers.length - 2 : headers.length - 1;

  const changes = rows.map((row) => numeric([row[pctIndex >= 0 ? pctIndex : valueIndex]])[0]);
  const finals = rows.map((row) => numeric([row[valueIndex]])[0]);

  const topChange = changes.reduce((b, v, i) => (v > changes[b] ? i : b), 0);
  const lowFinal = finals.reduce((b, v, i) => (v < finals[b] ? i : b), 0);

  return [
    `All ${rows.length} ${subject} increased between ${from} and ${to}.`,
    `${rows[topChange][0]} recorded the largest increase at ${changes[topChange]}%.`,
    `${rows[lowFinal][0]} had the lowest figure in ${to} at ${rows[lowFinal][valueIndex]}.`
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

function highlightsDecisionFlow(data) {
  return [
    `The process begins with ${data.start.label} and ends at ${data.end.label}.`,
    `Everything turns on one question — ${data.decision.label} If the answer is yes the route is ${data.yes.label}; if not, it is ${data.no.label}.`
  ];
}

function highlightsCycle(data) {
  const stages = data.stages;
  return [
    `The cycle starts with ${stages[0].label} and returns to it after ${stages.length} stages, so there is no final step.`,
    `${stages[0].label} leads to ${stages[1].label}, and the last stage, ${stages[stages.length - 1].label}, feeds back into the beginning.`
  ];
}

function highlightsTimeline(data) {
  const events = data.events;
  const first = events[0];
  const last = events[events.length - 1];
  const lines = [
    `The timeline covers ${events.length} milestones, beginning with ${first.label} in ${first.year} and ending with ${last.label} in ${last.year}.`
  ];

  const years = events.map((event) => parseInt(String(event.year).replace(/[^0-9]/g, ""), 10));
  if (years.every((year) => !Number.isNaN(year)) && years.length > 1) {
    let gap = -1;
    let gapIndex = 1;
    for (let i = 1; i < years.length; i += 1) {
      const size = years[i] - years[i - 1];
      if (size > gap) {
        gap = size;
        gapIndex = i;
      }
    }
    lines.push(
      `The longest interval is between ${events[gapIndex - 1].label} (${events[gapIndex - 1].year}) and ${events[gapIndex].label} (${events[gapIndex].year}), a gap of ${gap} years.`
    );
  }

  return lines;
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
  },
  "decision-flow": {
    howTo: "Say the entry point, name the question that is being asked, then describe each route separately and finish at the shared final stage. Both branches must be mentioned.",
    frames: [
      "The flowchart shows how … is handled from start to finish.",
      "It begins when … arrives at the decision point.",
      "If the answer is yes, it is …; if not, it is ….",
      "In either case the process ends with …."
    ]
  },
  cycle: {
    howTo: "State clearly that the process is circular and has no end point, then walk through the stages in order using 'then' and 'finally', and finish by saying the cycle repeats.",
    frames: [
      "The diagram illustrates a cycle of … stages.",
      "It starts with … and is then ….",
      "After … the material returns to the beginning.",
      "This loop repeats continuously with no final stage."
    ]
  },
  timeline: {
    howTo: "Announce that the diagram is a chronological sequence, then move from the earliest milestone to the latest one using dates as signposts, and finish with where the process stands today.",
    frames: [
      "The diagram shows the development of … over time.",
      "It began in … when ….",
      "By …, … had been introduced.",
      "The most recent stage, in …, is …."
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

function exampleDecisionFlow(data) {
  return `One question decides the route — ${data.decision.label} A yes answer means ${data.yes.label.toLowerCase()}; a no answer means ${data.no.label.toLowerCase()}, and both routes end at ${data.end.label.toLowerCase()}.`;
}

function exampleCycle(data) {
  const stages = data.stages;
  return `It starts with ${stages[0].label.toLowerCase()}, is then ${stages[1].label.toLowerCase()}, and after ${stages[stages.length - 1].label.toLowerCase()} it returns to the beginning, so the loop repeats with no final stage.`;
}

function exampleTimeline(data) {
  const events = data.events;
  return `It began in ${events[0].year} with ${events[0].label.toLowerCase()}, and the most recent stage, in ${events[events.length - 1].year}, is ${events[events.length - 1].label.toLowerCase()}.`;
}

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
    : category === "decision-flow" ? highlightsDecisionFlow(data)
    : category === "cycle" ? highlightsCycle(data)
    : category === "timeline" ? highlightsTimeline(data)
    : [];

  const example =
    category === "bar-chart" ? "In both 2019 and 2023, Q4 recorded the highest number of visitors."
    : category === "line-graph" ? "Melbourne is cooler than Sydney every month, with the biggest gap in summer."
    : category === "pie-chart" ? "Electricity is the largest single category at 42% of household demand."
    : category === "table" ? "All four departments increased, with Information Technology growing fastest at +40%."
    : category === "map" ? "The eastern region produces the most wheat at 40,000 tonnes."
    : category === "decision-flow" ? exampleDecisionFlow(data)
    : category === "cycle" ? exampleCycle(data)
    : category === "timeline" ? exampleTimeline(data)
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