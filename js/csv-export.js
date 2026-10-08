/*
==========================================
PTE Trainer
Vocabulary CSV export
==========================================

Turns the vocabulary bank into a spreadsheet
file. Two things matter here and are easy to
get wrong:

  1. Escaping — meanings, examples and
     mistakes contain commas, quotes and
     newlines, so every cell is quoted and
     internal quotes are doubled.
  2. Encoding — the list is bilingual, so the
     file starts with a UTF-8 BOM; without it
     Excel shows Arabic as mojibake.

The conversion functions are pure and take no
DOM, so they are unit-tested directly; only
`downloadCsv` touches the browser.
==========================================
*/

"use strict";

/* Excel and LibreOffice need this to read UTF-8 correctly. */
export const UTF8_BOM = "﻿";

/* How list fields (synonyms, examples…) are joined inside one cell. */
export const LIST_SEPARATOR = " | ";

export const VOCAB_COLUMNS = [
  { key: "word", label: "Word" },
  { key: "pronunciation", label: "Pronunciation" },
  { key: "partOfSpeech", label: "Part of speech" },
  { key: "cefrLevel", label: "CEFR" },
  { key: "frequency", label: "Frequency" },
  { key: "meaningEN", label: "Meaning (EN)" },
  { key: "meaningAR", label: "Meaning (AR)" },
  { key: "synonyms", label: "Synonyms", list: true },
  { key: "collocations", label: "Collocations", list: true },
  { key: "examples", label: "Examples", list: true },
  { key: "wordFamily", label: "Word family", list: true },
  { key: "commonMistakes", label: "Common mistakes", list: true },
  { key: "audio", label: "Audio" }
];

/*
The two columns that live in localStorage rather
than in vocabulary.json. They are defined here,
next to the file columns, because the picker has
to offer them in the same list and the export
cannot be rebuilt without them.
*/
export const STUDY_COLUMNS = [
  {
    key: "studyStatus",
    label: "Study status",
    value: (entry) => entry.studyStatus || ""
  },
  {
    key: "dueLabel",
    label: "Due",
    value: (entry) => entry.dueLabel || ""
  }
];

export const ALL_COLUMNS = [...VOCAB_COLUMNS, ...STUDY_COLUMNS];

export const DEFAULT_COLUMN_KEYS = ALL_COLUMNS.map((column) => column.key);

/*
Turn a saved list of keys back into columns.

Order always follows ALL_COLUMNS, so a file that
was written with the columns in a different order
still reads predictably. Unknown keys are dropped,
duplicates collapse, and an empty or unusable list
falls back to everything rather than exporting a
file with no columns at all.
*/
export function columnsForKeys(keys) {
  if (!Array.isArray(keys)) return [...ALL_COLUMNS];
  const wanted = new Set(keys.map(String));
  const picked = ALL_COLUMNS.filter((column) => wanted.has(column.key));
  return picked.length ? picked : [...ALL_COLUMNS];
}

export const COLUMN_KEYS_STORAGE = "pte.vocab.export.columns.v1";

/* Reading the pick, with a storage that may be unavailable or hold junk. */
export function loadColumnKeys(storage = localStorage) {
  try {
    const raw = storage.getItem(COLUMN_KEYS_STORAGE);
    if (!raw) return [...DEFAULT_COLUMN_KEYS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return [...DEFAULT_COLUMN_KEYS];
    return columnsForKeys(parsed).map((column) => column.key);
  } catch {
    return [...DEFAULT_COLUMN_KEYS];
  }
}

export function saveColumnKeys(keys, storage = localStorage) {
  const clean = columnsForKeys(keys).map((column) => column.key);
  try {
    storage.setItem(COLUMN_KEYS_STORAGE, JSON.stringify(clean));
  } catch {
    /* a private window may refuse; the pick still applies to this session */
  }
  return clean;
}

/*
Quote a single cell. Anything containing a
delimiter, a quote or a line break is wrapped,
and quotes inside are doubled — the RFC 4180
rule that Excel, Sheets and LibreOffice all
expect.
*/
export function escapeCsvValue(value, delimiter = ",") {
  if (value == null) return "";
  const text = Array.isArray(value) ? value.join(LIST_SEPARATOR) : String(value);
  /* A tab is not a delimiter, but several spreadsheet importers treat it as
     one, so it is quoted as well to survive a round trip. */
  const needsQuotes =
    text.includes(delimiter) || text.includes('"') || /[\r\n\t]/.test(text);
  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
}

/* Read one field off a word, honouring custom accessors. */
export function readField(word, column) {
  if (!word) return "";
  if (typeof column.value === "function") return column.value(word);
  const raw = word[column.key];
  if (column.list && Array.isArray(raw)) return raw.join(LIST_SEPARATOR);
  return raw == null ? "" : raw;
}

/*
Build the whole file. `columns` defaults to the
standard vocabulary columns; a column may add a
`value(word)` accessor (the study status does).
An empty list yields just the header row.
*/
export function buildVocabularyCsv(words, columns = VOCAB_COLUMNS, options = {}) {
  const delimiter = options.delimiter || ",";
  const bom = options.bom === false ? "" : UTF8_BOM;
  const list = Array.isArray(words) ? words : [];

  const header = columns.map((column) => escapeCsvValue(column.label, delimiter)).join(delimiter);
  const rows = list.map((word) =>
    columns
      .map((column) => escapeCsvValue(readField(word, column), delimiter))
      .join(delimiter)
  );

  return bom + [header, ...rows].join("\r\n") + (rows.length ? "\r\n" : "");
}

/* pte-vocabulary-2026-10-05.csv */
export function csvFilename(prefix = "pte-vocabulary", now = new Date()) {
  const stamp = now.toISOString().slice(0, 10);
  return `${prefix}-${stamp}.csv`;
}

/* Browser only: hand the file to the user. */
export function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
