/*
==========================================
PTE Trainer
Vocabulary CSV import
==========================================

The mirror of `csv-export.js`: read a CSV of
words back, decide what is genuinely new,
and let the learner confirm before anything
is written.

Import never overwrites. A word that already
exists in the bank is skipped, the same word
twice inside the file is collapsed, and the
survivors are numbered on from the end of the
list — 1001 in the bank means the new words
become 1002, 1003, 1004 and so on, which is
what decides their audio filename.

Parsing and diffing are pure and unit-tested;
the writing itself happens in `app.py`.
==========================================
*/

"use strict";

import { LIST_SEPARATOR } from "./csv-export.js";

/* Header labels we accept, mapped to data fields. */
const HEADER_ALIASES = {
  word: "word",
  "word": "word",
  pronunciation: "pronunciation",
  "ipa": "pronunciation",
  "part of speech": "partOfSpeech",
  "partofspeech": "partOfSpeech",
  cefr: "cefrLevel",
  "cefr level": "cefrLevel",
  cefrlevel: "cefrLevel",
  frequency: "frequency",
  "meaning (en)": "meaningEN",
  meaningen: "meaningEN",
  "english meaning": "meaningEN",
  "meaning (ar)": "meaningAR",
  meaningar: "meaningAR",
  "arabic meaning": "meaningAR",
  synonyms: "synonyms",
  collocations: "collocations",
  examples: "examples",
  "word family": "wordFamily",
  wordfamily: "wordFamily",
  "common mistakes": "commonMistakes",
  commonmistakes: "commonMistakes",
  audio: "audio",
  "study status": null,
  due: null
};

const LIST_FIELDS = ["synonyms", "collocations", "examples", "wordFamily", "commonMistakes"];

/*
The fields the server insists on whatever the entry point. Checking them
here too keeps the preview honest: a row missing the IPA is reported as
incomplete instead of being promised a number the server will never give it.
*/
const REQUIRED_FIELDS = [
  "pronunciation",
  "partOfSpeech",
  "cefrLevel",
  "frequency",
  "meaningEN",
  "meaningAR"
];

export function missingRequiredFields(entry) {
  const candidate = entry || {};
  return REQUIRED_FIELDS.filter((field) => !String(candidate[field] || "").trim());
}

const TEXT_FIELDS = [
  "word",
  "pronunciation",
  "partOfSpeech",
  "cefrLevel",
  "frequency",
  "meaningEN",
  "meaningAR",
  "audio"
];

/*
RFC 4180 reader. Handles the UTF-8 BOM, CRLF
or LF line endings, quoted cells containing
commas, doubled quotes and embedded newlines.
Returns { header, rows } with rows as arrays of
strings, or null when there is no usable header.
*/
export function parseCsv(text) {
  const source = String(text || "").replace(/^﻿/, "");
  if (!source.trim()) return { header: [], rows: [] };

  const table = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r") {
      /* handled by the \n branch */
    } else if (char === "\n") {
      row.push(cell);
      table.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }

  if (cell !== "" || row.length) {
    row.push(cell);
    table.push(row);
  }

  const nonEmpty = table.filter((entry) => entry.some((value) => String(value).trim() !== ""));
  if (!nonEmpty.length) return { header: [], rows: [] };

  return { header: nonEmpty[0].map((value) => String(value).trim()), rows: nonEmpty.slice(1) };
}

/* Map our export labels (and raw field names) onto data fields. */
export function headerToFields(header) {
  const fields = {};
  (header || []).forEach((label, index) => {
    const key = HEADER_ALIASES[String(label).trim().toLowerCase()];
    if (key !== undefined && fields[key] === undefined) fields[key] = index;
  });
  return fields;
}

/* Split a joined cell back into a list. */
function splitList(value) {
  if (value == null) return [];
  return String(value)
    .split(/\s*\|\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/*
Turn one CSV row into a candidate word. Anything
without a word is rejected outright; the rest is
left to the server's own validation so both
entry points enforce the same rules.
*/
export function rowToWord(row, fields) {
  const read = (key) => {
    const index = fields[key];
    if (index === undefined || index < 0) return "";
    const value = row[index];
    return value == null ? "" : String(value).trim();
  };

  const word = read("word");
  if (!word) return { word: "", invalid: true };

  const entry = { word };
  TEXT_FIELDS.forEach((key) => {
    if (key === "word") return;
    const value = read(key);
    if (value) entry[key] = value;
  });
  LIST_FIELDS.forEach((key) => {
    entry[key] = splitList(read(key));
  });

  return entry;
}

function normalize(word) {
  return String(word || "").trim().toLowerCase();
}

/*
Decide the fate of every candidate:

  fresh      — not in the bank, and the first
               time it appears in this file
  duplicates — already in the vocabulary bank
  repeated   — the same word twice in this file
  invalid    — no word in the row at all
*/
export function diffWords(existingWords, candidates) {
  const known = new Set((existingWords || []).map((entry) => normalize(typeof entry === "string" ? entry : entry && entry.word)));
  const seenInFile = new Set();

  const result = { fresh: [], duplicates: [], repeated: [], invalid: [] };

  (candidates || []).forEach((candidate) => {
    const word = candidate && candidate.word ? String(candidate.word).trim() : "";
    if (!word || (candidate && candidate.invalid)) {
      result.invalid.push(candidate && candidate.word ? candidate.word : "");
      return;
    }

    const key = normalize(word);
    if (known.has(key)) {
      result.duplicates.push(word);
      return;
    }
    if (seenInFile.has(key)) {
      result.repeated.push(word);
      return;
    }

    seenInFile.add(key);
    result.fresh.push({ ...candidate, word });
  });

  return result;
}

/*
The number each new word will get, and therefore
its audio filename: the bank ends at 1001, so the
first addition is 1002.
*/
export function assignNumbers(existingCount, freshWords) {
  const start = Number(existingCount) || 0;
  return (freshWords || []).map((entry, index) => {
    const number = start + index + 1;
    return {
      ...entry,
      number,
      audio: `assets/audio/vocabulary/${String(number).padStart(3, "0")}.mp3`
    };
  });
}

/* Full preview for the confirmation step. */
export function buildImportPreview(csvText, existingWords) {
  const { header, rows } = parseCsv(csvText);
  const fields = headerToFields(header);

  if (!header.length) {
    return { ok: false, reason: "empty", header, rows: 0 };
  }
  if (fields.word === undefined) {
    return { ok: false, reason: "no-word-column", header, rows: rows.length };
  }

  const candidates = rows.map((row) => rowToWord(row, fields));

  /* Rows the server would reject are set aside before anything is numbered. */
  const incomplete = [];
  const complete = [];
  candidates.forEach((candidate) => {
    const missing = candidate.invalid ? ["word"] : missingRequiredFields(candidate);
    if (missing.length) incomplete.push({ word: candidate.word || "", missing });
    else complete.push(candidate);
  });

  const diff = diffWords(existingWords, complete);
  const numbered = assignNumbers((existingWords || []).length, diff.fresh);

  return {
    ok: true,
    header,
    rows: rows.length,
    fresh: numbered,
    duplicates: diff.duplicates,
    repeated: diff.repeated,
    invalid: diff.invalid,
    incomplete,
    totals: {
      rows: rows.length,
      add: numbered.length,
      skip: diff.duplicates.length + diff.repeated.length,
      invalid: diff.invalid.length + incomplete.length
    }
  };
}

/* Plain numbers for the confirmation line. */
export function describePreview(preview) {
  if (!preview.ok) {
    return preview.reason === "empty"
      ? "The file looks empty."
      : "No word column was found — the first header must be the word.";
  }
  const { rows, add, skip, invalid } = preview.totals;
  const parts = [`${rows} row${rows === 1 ? "" : "s"} read`];
  parts.push(`${add} new`);
  if (skip) parts.push(`${skip} already in the bank`);
  if (invalid) parts.push(`${invalid} incomplete or without a word`);
  return parts.join(" · ");
}

/* Split a preview into the payload the server expects. */
export function toImportPayload(preview) {
  return {
    words: preview.fresh.map((entry) => {
      const copy = { ...entry };
      delete copy.number;
      delete copy.audio;
      return copy;
    })
  };
}

export { LIST_SEPARATOR };
