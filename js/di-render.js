/*
==========================================
PTE Trainer
Describe Image — SVG renderer
Turns the data spec of an image item into
a stand-alone SVG string (white panel).
==========================================
*/

"use strict";

const PALETTE = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4"];

const W = 600;
const H = 420;

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function text(x, y, content, size, anchor, weight, fill) {
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" text-anchor="${anchor || "start"}" font-weight="${weight || "normal"}" fill="${fill || "#334155"}">${esc(content)}</text>`;
}

function svgBody(inner) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Practice image">` +
    `<rect x="0" y="0" width="${W}" height="${H}" rx="14" fill="#ffffff"/>` +
    inner +
    `</svg>`
  );
}

function chartFrame(yLabel, title) {
  return swatch({
    panel: `<rect x="34" y="26" width="${W - 50}" height="${H - 60}" rx="10" fill="#f8fafc"/>`,
    title: text(30, 56, title, 17, "start", "700", "#1e293b"),
    yTitle: text(24, 210, yLabel, 12, "start", "600", "#64748b")
  });
}

function swatch(parts) {
  return parts;
}

/* Round a raw maximum up to a "nice" axis ceiling. */
function niceMax(raw) {
  if (raw <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function axis(seriesMax, yLabel, plot) {
  const tickCount = 4;
  return { max: Math.max(1, niceMax(seriesMax)), tickCount };
}

function plotCoords(plotLeft, plotTop, plotW, plotH, max) {
  function point(value, slot, slots) {
    const x = plotLeft + (slot + 0.5) * (plotW / slots);
    const y = plotTop + plotH - (value / max) * plotH;
    return { x, y };
  }
  return { point };
}

function renderAxis(plotLeft, plotTop, plotW, plotH, max, yLabel, ticks) {
  const rows = [];
  for (let i = 0; i <= ticks; i++) {
    const value = (max / ticks) * i;
    const y = plotTop + plotH - (i / ticks) * plotH;
    rows.push(
      `<line x1="${plotLeft}" y1="${y}" x2="${plotLeft + plotW}" y2="${y}" stroke="#e2e8f0" stroke-width="1"/>` +
      text(plotLeft - 8, y + 4, String(Math.round(value)), 11, "end", "400", "#64748b")
    );
  }
  rows.push(
    `<line x1="${plotLeft}" y1="${plotTop}" x2="${plotLeft}" y2="${plotTop + plotH}" stroke="#cbd5e1" stroke-width="1.5"/>` +
    `<line x1="${plotLeft}" y1="${plotTop + plotH}" x2="${plotLeft + plotW}" y2="${plotTop + plotH}" stroke="#cbd5e1" stroke-width="1.5"/>`
  );
  return rows.join("");
}

function renderLegend(series, title) {
  let inner = "";
  series.forEach((entry, index) => {
    inner +=
      `<rect x="${W - 150}" y="${40 + index * 22}" width="13" height="13" rx="3" fill="${entry.color}"/>` +
      text(W - 131, 51 + index * 22, entry.label, 12, "start", "600", "#475569");
  });
  return `<g>${text(W - 150, 34, title, 13, "start", "700", "#334155")}${inner}</g>`;
}

/* ------------------ Bar chart ------------------ */

function renderBarChart(data) {
  const plotLeft = 60;
  const plotTop = 84;
  const plotW = W - plotLeft - 30;
  const plotH = 250;
  const groups = data.groups;
  const n = data.labels.length;
  const { max } = axis(Math.max(...groups.map((g) => Math.max(...g.values))), data.yLabel, {});
  const groupW = plotW / n;
  const barW = (groupW * 0.72) / groups.length;
  const pad = (groupW - barW * groups.length) / 2;

  let inner = renderAxis(plotLeft, plotTop, plotW, plotH, max, data.yLabel, 4);

  groups.forEach((group, gi) => {
    group.values.forEach((value, ci) => {
      const { y } = plotCoords(plotLeft, plotTop, plotW, plotH, max).point(value, ci, n);
      const x = plotLeft + ci * groupW + pad + gi * barW + barW * 0.12;
      const bh = plotTop + plotH - y;
      inner +=
        `<rect x="${x}" y="${y}" width="${barW * 0.76}" height="${bh}" rx="3" fill="${PALETTE[gi % PALETTE.length]}"/>` +
        text(x + barW * 0.38, y - 6, String(value), 11, "middle", "600", "#475569");
    });
  });

  data.labels.forEach((label, ci) => {
    inner += text(plotLeft + ci * groupW + groupW / 2, plotTop + plotH + 22, label, 12, "middle", "600", "#475569");
  });

  inner += renderLegend(
    groups.map((g, gi) => ({ label: g.label, color: PALETTE[gi % PALETTE.length] })),
    "Year"
  );

  const frame = chartFrame(data.yLabel, "Bar chart — " + data.yLabel.replace(/\(.*\)/, "").trim());
  return svgBody(frame.panel + frame.title + frame.yTitle + inner);
}

/* ------------------ Line graph ------------------ */

function renderLineGraph(data) {
  const plotLeft = 60;
  const plotTop = 84;
  const plotW = W - plotLeft - 30;
  const plotH = 250;
  const max = Math.max(...data.series.flatMap((s) => s.values));
  const { point } = plotCoords(plotLeft, plotTop, plotW, plotH, max);

  let inner = renderAxis(plotLeft, plotTop, plotW, plotH, max, data.yLabel, 4);

  data.series.forEach((series, si) => {
    const pts = series.values
      .map((v, i) => {
        const p = point(v, i, series.values.length);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join(" ");
    inner +=
      `<polyline points="${pts}" fill="none" stroke="${PALETTE[si % PALETTE.length]}" stroke-width="3"/>` +
      series.values
        .map((v, i) => {
          const p = point(v, i, series.values.length);
          return `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#ffffff" stroke="${PALETTE[si % PALETTE.length]}" stroke-width="2.5"/>`;
        })
        .join("");
    series.values.forEach((v, i) => {
      const p = point(v, i, series.values.length);
      inner += text(p.x, p.y - 9, String(v), 10.5, "middle", "600", "#475569");
    });
  });

  data.labels.forEach((label, i) => {
    inner += text(plotLeft + ((i + 0.5) * plotW) / data.labels.length, plotTop + plotH + 22, label, 12, "middle", "600", "#475569");
  });

  inner += renderLegend(
    data.series.map((s, si) => ({ label: s.label, color: PALETTE[si % PALETTE.length] })),
    "City"
  );

  const frame = chartFrame(data.yLabel, "Line graph — " + data.yLabel.replace(/\(.*\)/, "").trim());
  return svgBody(frame.panel + frame.title + frame.yTitle + inner);
}

/* ------------------ Pie chart ------------------ */

function renderPieChart(data) {
  const cx = 190;
  const cy = 230;
  const r = 132;
  const total = data.values.reduce((acc, v) => acc + v.value, 0);
  let angle = -90;
  let slices = "";
  let legend = "";

  data.values.forEach((slice, index) => {
    const sweep = (slice.value / total) * 360;
    const start = (angle * Math.PI) / 180;
    const end = ((angle + sweep) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = sweep > 180 ? 1 : 0;
    slices +=
      `<path d="M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${slice.color}" stroke="#ffffff" stroke-width="2"/>`;
    const mid = ((angle + sweep / 2) * Math.PI) / 180;
    const pmx = cx + r * 0.62 * Math.cos(mid);
    const pmy = cy + r * 0.62 * Math.sin(mid);
    const percent = Math.round((slice.value / total) * 100);
    if (percent >= 8) {
      slices += text(pmx, pmy + 4, `${percent}%`, 13, "middle", "700", "#ffffff");
    }
    legend +=
      `<rect x="${370}" y="${56 + index * 34}" width="16" height="16" rx="4" fill="${slice.color}"/>` +
      text(396, 69 + index * 34, slice.label, 13, "start", "600", "#475569") +
      text(W - 26, 69 + index * 34, `${percent}%`, 13, "end", "700", "#1e293b");
    angle += sweep;
  });

  return svgBody(
    text(30, 44, data.title || "Pie chart — Distribution", 17, "start", "700", "#1e293b") +
    slices +
    legend +
    text(30, 390, data.caption || "Percentage share of total", 12, "start", "600", "#64748b")
  );
}

/* ------------------ Table ------------------ */

function renderTable(data) {
  const left = 40;
  const top = 96;
  const width = W - 80;
  const cols = data.headers.length;
  const colW = width / cols;
  const cellH = 56;
  const headerH = 52;

  let grid = "";
  data.rows.forEach((row, ri) => {
    row.forEach((cell, ci) => {
      const fill = ri % 2 ? "#f8fafc" : "#ffffff";
      grid +=
        `<rect x="${left + ci * colW}" y="${top + (ri + 1) * cellH}" width="${colW}" height="${cellH}" fill="${fill}"/>` +
        text(left + ci * colW + colW / 2, top + (ri + 1) * cellH + cellH / 2 + 5, cell, 14, "middle", ri === data.rows.length - 1 ? "700" : "400", ri === data.rows.length - 1 ? "#1e293b" : "#334155");
    });
  });

  grid += `<rect x="${left}" y="${top}" width="${width}" height="${headerH}" fill="#eef2ff"/>`;
  data.headers.forEach((cell, ci) => {
    grid += text(left + ci * colW + colW / 2, top + headerH / 2 + 5, cell, 15, "middle", "700", "#3730a3");
  });

  grid +=
    `<line x1="${left}" y1="${top}" x2="${left + width}" y2="${top}" stroke="#c7d2fe" stroke-width="2"/>` +
    `<line x1="${left}" y1="${top + headerH}" x2="${left + width}" y2="${top + headerH}" stroke="#c7d2fe" stroke-width="2"/>` +
    `<line x1="${left}" y1="${top + headerH + cellH * data.rows.length}" x2="${left + width}" y2="${top + headerH + cellH * data.rows.length}" stroke="#c7d2fe" stroke-width="2"/>` +
    [...Array(cols + 1).keys()]
      .map((ci) => `<line x1="${left + ci * colW}" y1="${top}" x2="${left + ci * colW}" y2="${top + headerH + cellH * data.rows.length}" stroke="#c7d2fe" stroke-width="1.5"/>`)
      .join("") +
    [...Array(data.rows.length - 1).keys()]
      .map((ri) => `<line x1="${left}" y1="${top + headerH + (ri + 1) * cellH}" x2="${left + width}" y2="${top + headerH + (ri + 1) * cellH}" stroke="#e2e8f0" stroke-width="1"/>`)
      .join("");
  grid += text(W - 30, 390, data.caption || "Figures as shown in the table", 11, "end", "600", "#64748b");

  return svgBody(
    text(30, 52, data.title || "Table — Comparison", 17, "start", "700", "#1e293b") +
    `<rect x="${left}" y="${top}" width="${width}" height="${headerH + cellH * data.rows.length}" fill="#f8fafc"/>` +
    grid
  );
}

/* ------------------ Map ------------------ */

function renderMap(data) {
  let regions = "";
  data.regions.forEach((region) => {
    regions +=
      `<polygon points="${region.points}" fill="${region.color}" stroke="#ffffff" stroke-width="2.5"/>` +
      text(region.cx || 200, region.cy || 240, region.label, 15, "middle", "700", "#ffffff");
  });
  const legend = data.regions
    .map(
      (region, i) =>
        `<rect x="${46 + i * 132}" y="352" width="14" height="14" rx="3" fill="${region.color}"/>` +
        text(66 + i * 132, 364, `${region.label}  ${region.value}`, 12, "start", "600", "#475569")
    )
    .join("");

  return svgBody(
    text(30, 44, data.title || "Map — Regional distribution", 17, "start", "700", "#1e293b") +
    `<rect x="36" y="56" width="528" height="280" rx="10" fill="#f1f5f9"/>` +
    regions +
    legend +
    text(30, 392, data.caption || "Values are approximate", 11, "start", "600", "#64748b")
  );
}

/* ------------------ Process diagram ------------------ */

function renderProcess(data) {
  const n = data.steps.length;
  const left = 24;
  const top = 130;
  const arrow = 34;
  const stepW = (W - left * 2 - arrow * (n - 1)) / n;
  const stepH = 118;
  let boxes = "";

  data.steps.forEach((step, i) => {
    const x = left + i * (stepW + arrow);
    boxes +=
      `<rect x="${x}" y="${top}" width="${stepW}" height="${stepH}" rx="12" fill="#eef2ff" stroke="#6366f1" stroke-width="2"/>` +
      `<rect x="${x}" y="${top}" width="${stepW}" height="44" rx="12" fill="#6366f1"/>` +
      text(x + stepW / 2, top + 28, step.label, 15, "middle", "700", "#ffffff") +
      text(x + stepW / 2, top + 78, step.desc, 12, "middle", "500", "#475569");
    if (i < n - 1) {
      const ax = x + stepW + 6;
      boxes +=
        `<line x1="${ax}" y1="${top + 22}" x2="${ax + arrow - 12}" y2="${top + 22}" stroke="#6366f1" stroke-width="2.5"/>` +
        `<polygon points="${ax + arrow - 12},${top + 16} ${ax + arrow - 2},${top + 22} ${ax + arrow - 12},${top + 28}" fill="#6366f1"/>`;
    }
  });

  const cycle = data.cycle
    ? `<path d="M ${left} ${top + stepH + 18} H ${W - left} " stroke="#f59e0b" stroke-width="2" stroke-dasharray="5 4" fill="none"/>` +
      `<text x="${W / 2}" y="${top + stepH + 42}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#b45309" font-family="Arial">cycle repeats</text>`
    : "";

  const caption = data.cycle
    ? text(30, 392, "A circular process with no fixed starting or ending point", 12, "start", "600", "#64748b")
    : text(30, 392, "A linear process with a clear first and final stage", 12, "start", "600", "#64748b");

  return svgBody(
    text(30, 44, "Process diagram — Sequence", 17, "start", "700", "#1e293b") +
    `<rect x="16" y="90" width="${W - 32}" height="218" rx="10" fill="#f8fafc"/>` +
    boxes +
    cycle +
    caption
  );
}

/* ------------------ Decision flow ------------------ */

function arrowHead(x, y, angleDeg, color, size) {
  const a = (angleDeg * Math.PI) / 180;
  const tip = `${x.toFixed(1)},${y.toFixed(1)}`;
  const left = `${(x - size * Math.cos(a - 0.42)).toFixed(1)},${(y - size * Math.sin(a - 0.42)).toFixed(1)}`;
  const right = `${(x - size * Math.cos(a + 0.42)).toFixed(1)},${(y - size * Math.sin(a + 0.42)).toFixed(1)}`;
  return `<polygon points="${tip} ${left} ${right}" fill="${color}"/>`;
}

function nodeBox(x, y, w, h, node, headerColor) {
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="11" fill="#ffffff" stroke="${headerColor}" stroke-width="2"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="34" rx="11" fill="${headerColor}"/>` +
    text(x + w / 2, y + 23, node.label, 13.5, "middle", "700", "#ffffff") +
    text(x + w / 2, y + 54, node.desc, 11.5, "middle", "500", "#475569")
  );
}

function renderDecisionFlow(data) {
  const yes = data.yes;
  const no = data.no;
  const cx = W / 2;
  let inner = "";

  inner += nodeBox(cx - 100, 72, 200, 62, data.start, "#334155");
  inner += `<line x1="${cx}" y1="134" x2="${cx}" y2="152" stroke="#334155" stroke-width="2.5"/>`;
  inner += arrowHead(cx, 156, 90, "#334155", 8);

  inner +=
    `<polygon points="${cx},152 ${cx + 104},196 ${cx},240 ${cx - 104},196" fill="#eef2ff" stroke="#6366f1" stroke-width="2.5"/>` +
    text(cx, 192, data.decision.label, 13.5, "middle", "700", "#3730a3") +
    text(cx, 210, data.decision.desc, 11, "middle", "500", "#4f46e5");

  inner +=
    `<polyline points="${cx - 104},196 150,196 150,262" fill="none" stroke="#10b981" stroke-width="2.5"/>` +
    arrowHead(150, 266, 90, "#10b981", 8) +
    text(184, 189, "Yes", 12.5, "start", "700", "#047857");

  inner +=
    `<polyline points="${cx + 104},196 450,196 450,262" fill="none" stroke="#f59e0b" stroke-width="2.5"/>` +
    arrowHead(450, 266, 90, "#f59e0b", 8) +
    text(416, 189, "No", 12.5, "end", "700", "#b45309");

  inner += nodeBox(40, 270, 220, 62, yes, "#10b981");
  inner += nodeBox(340, 270, 220, 62, no, "#f59e0b");

  inner +=
    `<polyline points="150,332 150,368 236,368" fill="none" stroke="#64748b" stroke-width="2"/>` +
    arrowHead(240, 368, 0, "#64748b", 7) +
    `<polyline points="450,332 450,368 364,368" fill="none" stroke="#64748b" stroke-width="2"/>` +
    arrowHead(360, 368, 180, "#64748b", 7);

  inner += nodeBox(cx - 110, 340, 220, 58, data.end, "#0ea5e9");

  return svgBody(
    text(30, 46, "Process diagram — Decision flow", 17, "start", "700", "#1e293b") +
    `<rect x="16" y="58" width="${W - 32}" height="352" rx="10" fill="#f8fafc"/>` +
    inner +
    text(30, 400, "Two possible routes through the same starting and final stage", 11.5, "start", "600", "#64748b")
  );
}

/* ------------------ Cycle ------------------ */

function renderCycle(data) {
  const stages = data.stages;
  const n = stages.length;
  const cx = 300;
  const cy = 226;
  const r = 138;
  const boxW = 132;
  const boxH = 56;

  let inner = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="6 5"/>`;

  const points = stages.map((_, i) => {
    const a = (-90 + (360 / n) * i) * (Math.PI / 180);
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });

  points.forEach((p, i) => {
    const next = points[(i + 1) % n];
    const mid = { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 };
    const bulge = { x: cx + (mid.x - cx) * 1.16, y: cy + (mid.y - cy) * 1.16 };
    inner +=
      `<path d="M ${p.x.toFixed(1)} ${p.y.toFixed(1)} Q ${bulge.x.toFixed(1)} ${bulge.y.toFixed(1)} ${next.x.toFixed(1)} ${next.y.toFixed(1)}" fill="none" stroke="#6366f1" stroke-width="2.5"/>`;
    const angle = (Math.atan2(next.y - bulge.y, next.x - bulge.x) * 180) / Math.PI;
    inner += arrowHead(next.x, next.y, angle, "#6366f1", 9);
  });

  stages.forEach((stage, i) => {
    const p = points[i];
    const x = p.x - boxW / 2;
    const y = p.y - boxH / 2;
    inner +=
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${boxW}" height="${boxH}" rx="11" fill="#eef2ff" stroke="#6366f1" stroke-width="2"/>` +
      text(p.x, p.y - 4, stage.label, 13, "middle", "700", "#3730a3") +
      text(p.x, p.y + 14, stage.desc, 10.5, "middle", "500", "#475569");
  });

  inner += text(cx, cy - 6, data.centerLabel || "repeats", 12.5, "middle", "700", "#b45309");
  inner += text(cx, cy + 12, "no fixed start", 11, "middle", "600", "#64748b");

  return svgBody(
    text(30, 46, "Process diagram — Cycle", 17, "start", "700", "#1e293b") +
    `<rect x="16" y="58" width="${W - 32}" height="352" rx="10" fill="#f8fafc"/>` +
    inner +
    text(30, 400, "A circular process with no fixed starting or ending point", 11.5, "start", "600", "#64748b")
  );
}

/* ------------------ Timeline ------------------ */

function renderTimeline(data) {
  const events = data.events;
  const n = events.length;
  const axisY = 228;
  const x0 = 62;
  const x1 = W - 62;
  const span = x1 - x0;

  let inner =
    `<line x1="${x0 - 18}" y1="${axisY}" x2="${x1 + 18}" y2="${axisY}" stroke="#334155" stroke-width="3"/>` +
    arrowHead(x1 + 22, axisY, 0, "#334155", 9) +
    text(W - 24, axisY - 14, data.axisLabel || "time", 11.5, "end", "600", "#64748b");

  events.forEach((event, i) => {
    const x = n === 1 ? (x0 + x1) / 2 : x0 + (span / (n - 1)) * i;
    const above = i % 2 === 0;
    const boxW = 118;
    const boxH = 76;
    const boxY = above ? axisY - 42 - boxH : axisY + 42;

    inner +=
      `<line x1="${x.toFixed(1)}" y1="${above ? boxY + boxH : axisY}" x2="${x.toFixed(1)}" y2="${above ? axisY - 8 : boxY}" stroke="#94a3b8" stroke-width="1.8"/>` +
      `<circle cx="${x.toFixed(1)}" cy="${axisY}" r="7" fill="#ffffff" stroke="#6366f1" stroke-width="3"/>` +
      `<rect x="${(x - boxW / 2).toFixed(1)}" y="${boxY}" width="${boxW}" height="${boxH}" rx="11" fill="#eef2ff" stroke="#6366f1" stroke-width="2"/>` +
      text(x, boxY + 22, event.year, 13.5, "middle", "700", "#3730a3") +
      text(x, boxY + 41, event.label, 11.5, "middle", "600", "#334155") +
      text(x, boxY + 58, event.desc, 10.5, "middle", "500", "#64748b");
  });

  return svgBody(
    text(30, 46, "Process diagram — Timeline", 17, "start", "700", "#1e293b") +
    `<rect x="16" y="58" width="${W - 32}" height="352" rx="10" fill="#f8fafc"/>` +
    inner +
    text(30, 400, data.caption || "Stages shown in chronological order", 11.5, "start", "600", "#64748b")
  );
}

/* ------------------ Dispatcher ------------------ */

export function renderImage(item) {
  const kind = item.category;
  if (kind === "bar-chart") return renderBarChart(item.data);
  if (kind === "line-graph") return renderLineGraph(item.data);
  if (kind === "pie-chart") return renderPieChart(item.data);
  if (kind === "table") return renderTable(item.data);
  if (kind === "map") return renderMap(item.data);
  if (kind === "process-diagram") return renderProcess(item.data);
  if (kind === "decision-flow") return renderDecisionFlow(item.data);
  if (kind === "cycle") return renderCycle(item.data);
  if (kind === "timeline") return renderTimeline(item.data);
  return svgBody(text(30, 100, "Unknown image type", 20, "start", "700", "#b91c1c"));
}

export const CATEGORY_LABELS = {
  "bar-chart": "Bar chart",
  "line-graph": "Line graph",
  "pie-chart": "Pie chart",
  table: "Table",
  map: "Map",
  "process-diagram": "Process diagram",
  "decision-flow": "Decision flow",
  cycle: "Cycle",
  timeline: "Timeline"
};