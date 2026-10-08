/* ==========================================
   PTE Trainer — vocabulary CSV import tests
   Run: node tools/tests/test-csv-import.mjs
   ========================================== */

import {
  parseCsv,
  headerToFields,
  rowToWord,
  diffWords,
  assignNumbers,
  buildImportPreview,
  describePreview,
  toImportPayload
} from "../../js/csv-import.js";
import { buildVocabularyCsv } from "../../js/csv-export.js";
import { readFileSync } from "node:fs";

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

const bank = JSON.parse(readFileSync(new URL("../../data/vocabulary.json", import.meta.url), "utf8"));

/* A complete CSV row: the server insists on these fields, so the preview
   does too. Anything less must be reported as incomplete. */
const HEADER =
  "Word,Pronunciation,Part of speech,CEFR,Frequency,Meaning (EN),Meaning (AR),Synonyms,Collocations,Examples,Word family,Common mistakes,Audio";

function csvRow(word, overrides = {}) {
  const cells = [
    word,
    overrides.pronunciation ?? "/test/",
    overrides.partOfSpeech ?? "Noun",
    overrides.cefrLevel ?? "B2",
    overrides.frequency ?? "5",
    overrides.meaningEN ?? "an English meaning",
    overrides.meaningAR ?? "معنى",
    "one | two",
    "a collocation",
    "An example.",
    "family (n.)",
    "a mistake",
    ""
  ];
  return cells.map((cell) =>
    /[",]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
  ).join(",");
}

function csvOf(rows) {
  return [HEADER, ...rows].join("\n");
}

/* ---------------- Parsing ---------------- */

test("a simple table parses into a header and rows", () => {
  const { header, rows } = parseCsv("Word,Meaning (EN)\nAdopt,to take in\nAbandon,to leave\n");
  assert(header.length === 2 && header[1] === "Meaning (EN)", "the header must be read");
  assert(rows.length === 2, `expected 2 rows, got ${rows.length}`);
  assert(rows[0][0] === "Adopt", "the first cell must be the word");
});

test("quoted cells keep their commas, quotes and newlines", () => {
  const csv = 'Word,Notes\nAbandon,"❌ give up, then leave → ✅ abandon"\nAdopt,"says ""hello"" twice"\nMultiply,"line one\nline two"\n';
  const { rows } = parseCsv(csv);
  assert(rows.length === 3, `expected 3 rows, got ${rows.length}`);
  assert(rows[0][1] === "❌ give up, then leave → ✅ abandon", "commas inside quotes must survive");
  assert(rows[1][1] === 'says "hello" twice', "doubled quotes must be unescaped");
  assert(rows[2][1] === "line one\nline two", "an embedded newline must stay in the cell");
});

test("CRLF line endings and a BOM are handled", () => {
  const csv = "﻿Word,CEFR\r\nAdopt,B2\r\nAbandon,B2\r\n";
  const { header, rows } = parseCsv(csv);
  assert(header[0] === "Word", "the BOM must not end up in the first header cell");
  assert(rows.length === 2, `expected 2 rows, got ${rows.length}`);
  assert(rows[0][1] === "B2", "no stray carriage return may survive");
});

test("empty input and a file with no data rows are handled", () => {
  assert(parseCsv("").rows.length === 0, "an empty file yields nothing");
  assert(parseCsv("   ").rows.length === 0, "whitespace only yields nothing");
  const headerOnly = parseCsv("Word,CEFR\n");
  assert(headerOnly.rows.length === 0, "a header-only file has no rows");
});

test("header labels and raw field names both map onto data fields", () => {
  const fromLabels = headerToFields(["Word", "Pronunciation", "Meaning (AR)", "Common mistakes", "Study status", "Due"]);
  assert(fromLabels.word === 0 && fromLabels.pronunciation === 1, "labels must map");
  assert(fromLabels.meaningAR === 2 && fromLabels.commonMistakes === 3, "Arabic and mistakes must map");

  const fromKeys = headerToFields(["word", "cefrLevel", "wordFamily"]);
  assert(fromKeys.cefrLevel === 1 && fromKeys.wordFamily === 2, "raw keys must map too");

  assert(headerToFields([]).word === undefined, "an empty header maps nothing");
});

/* ---------------- Rows ---------------- */

test("a row becomes a word with its lists split back apart", () => {
  const csv = "Word,Synonyms,Examples,Common mistakes\nAdopt,embrace | take in,He will adopt the plan.,❌ adopt to → ✅ adopt\n";
  const { header, rows } = parseCsv(csv);
  const fields = headerToFields(header);
  const word = rowToWord(rows[0], fields);

  assert(word.word === "Adopt", "the word must be read");
  assert(Array.isArray(word.synonyms) && word.synonyms.length === 2, "the joined list must split");
  assert(word.synonyms[1] === "take in", "list items must be trimmed");
  assert(word.examples[0] === "He will adopt the plan.", "examples must survive");
  assert(word.commonMistakes[0].startsWith("❌"), "mistakes must survive");
});

test("a row without a word is rejected, not imported as a blank", () => {
  const { header, rows } = parseCsv("Word,CEFR\n,B2\nAdopt,B2\n");
  const fields = headerToFields(header);
  assert(rowToWord(rows[0], fields).invalid === true, "an empty word cell must be invalid");
  assert(rowToWord(rows[1], fields).word === "Adopt", "the next row must still work");
});

/* ---------------- Diffing ---------------- */

test("words already in the bank are skipped, not duplicated", () => {
  const existing = bank.map((entry) => entry.word);
  const candidates = [
    { word: "Adopt" },
    { word: "Abandon" },
    { word: "Zzquibble" }
  ];
  const diff = diffWords(existing, candidates);

  assert(diff.fresh.length === 1 && diff.fresh[0].word === "Zzquibble", "only the new word may be fresh");
  assert(diff.duplicates.length === 2, `expected 2 duplicates, got ${diff.duplicates.length}`);
});

test("the duplicate check ignores case and stray spaces", () => {
  const diff = diffWords([{ word: "Adopt" }], [{ word: " adopt " }, { word: "ADOPT" }]);
  assert(diff.fresh.length === 0, "casing and padding must not create a false new word");
  assert(diff.duplicates.length === 2, "both spellings must be reported as duplicates");
});

test("the same word twice in one file is collapsed", () => {
  const diff = diffWords([], [{ word: "Zorbex" }, { word: "Zorbex" }, { word: "zorbex" }]);
  assert(diff.fresh.length === 1, "only the first occurrence may be added");
  assert(diff.repeated.length === 2, `expected 2 repeats, got ${diff.repeated.length}`);
});

test("the fixture bank is the real one", () => {
  /* The exact size changes whenever words are added; what matters is that
     the tests read the same file the app does. */
  assert(bank.length > 1000, `expected a full bank, got ${bank.length}`);
  assert(bank.every((entry) => typeof entry.word === "string" && entry.word), "every entry needs a word");
  assert(
    new Set(bank.map((entry) => entry.word.toLowerCase())).size === bank.length,
    "the bank must not contain duplicate words"
  );
});

/* ---------------- Numbering ---------------- */

test("new words continue the numbering from the end of the bank", () => {
  const numbered = assignNumbers(1001, [{ word: "Alpha" }, { word: "Beta" }, { word: "Gamma" }]);
  assert(numbered[0].number === 1002, `expected 1002, got ${numbered[0].number}`);
  assert(numbered[1].number === 1003 && numbered[2].number === 1004, "the numbers must be sequential");
  assert(numbered[0].audio === "assets/audio/vocabulary/1002.mp3", "the audio path must match the number");
  assert(numbered[2].audio.endsWith("1004.mp3"), "every word gets its own audio file");
});

test("numbering pads to three digits and survives a zero-size bank", () => {
  assert(assignNumbers(0, [{ word: "First" }])[0].audio.endsWith("001.mp3"), "001 must stay padded");
  assert(assignNumbers(1001, []).length === 0, "no words means no numbers");
});

/* ---------------- Preview ---------------- */

test("a preview of our own export adds nothing new", () => {
  const csv = buildVocabularyCsv(bank.slice(0, 50));
  const preview = buildImportPreview(csv, bank.map((entry) => entry.word));

  assert(preview.ok, "the preview must build");
  assert(preview.totals.rows === 50, `expected 50 rows, got ${preview.totals.rows}`);
  assert(preview.totals.add === 0, "nothing in the bank may look new");
  assert(preview.totals.skip === 50, "every row must be reported as already present");
  assert(preview.fresh[0] === undefined, "there must be no additions");
});

test("a preview mixing known and unknown words plans the right additions", () => {
  const csv = csvOf([
    csvRow("Zzorbex", { meaningAR: "كلمة جديدة" }),
    csvRow("Adopt"),
    csvRow("Adopt"),
    csvRow("", { meaningEN: "A row whose word cell is empty." })
  ]);

  const preview = buildImportPreview(csv, bank.map((entry) => entry.word));
  assert(preview.ok, "the preview must build");
  assert(preview.totals.rows === 4, `expected 4 rows, got ${preview.totals.rows}`);
  assert(preview.totals.add === 1, `expected 1 new word, got ${preview.totals.add}`);
  assert(preview.totals.skip === 2, `expected 2 skipped, got ${preview.totals.skip}`);
  assert(preview.totals.invalid === 1, `expected 1 invalid row, got ${preview.totals.invalid}`);
  const expectedNumber = bank.length + 1;
  assert(
    preview.fresh[0].number === expectedNumber,
    `the new word must continue the numbering at ${expectedNumber}, got ${preview.fresh[0].number}`
  );
  assert(preview.fresh[0].meaningAR === "كلمة جديدة", "the Arabic meaning must survive the round trip");
  assert(preview.fresh[0].synonyms.length === 2, "the synonyms must be split again");
});

test("a completely blank line is noise, not a rejected word", () => {
  const csv = `${HEADER}\n${csvRow("Zzadopt")}\n\n,,,,\n${csvRow("Zzabandon")}\n`;
  const preview = buildImportPreview(csv, []);
  assert(preview.totals.rows === 2, `expected 2 real rows, got ${preview.totals.rows}`);
  assert(preview.totals.invalid === 0, "a blank line must not be counted as an invalid word");
  assert(preview.totals.add === 2, "both real rows must be planned for import");
});

test("a row missing a required field is reported before anything is numbered", () => {
  /* The browser must not promise a number the server would refuse. */
  const csv = csvOf([
    csvRow("Zzorbex"),
    csvRow("Zznopa", { pronunciation: "" })
  ]);
  const preview = buildImportPreview(csv, []);

  assert(preview.totals.add === 1, `expected 1 addable word, got ${preview.totals.add}`);
  assert(preview.fresh[0].word === "Zzorbex", "only the complete row may be planned");
  assert(preview.fresh[0].number === 1, "numbering must skip the incomplete row");
  assert(preview.totals.invalid === 1, "the incomplete row must be counted");
  assert(preview.incomplete[0].word === "Zznopa", "the incomplete row must be named");
  assert(preview.incomplete[0].missing.includes("pronunciation"), "the missing field must be listed");
});

test("every required field is checked", () => {
  ["pronunciation", "partOfSpeech", "cefrLevel", "frequency", "meaningEN", "meaningAR"].forEach((field) => {
    const csv = csvOf([csvRow("Zorbex", { [field]: "" })]);
    const preview = buildImportPreview(csv, []);
    assert(preview.totals.add === 0, `a row without ${field} must not be planned`);
    assert(
      preview.incomplete[0] && preview.incomplete[0].missing.includes(field),
      `the preview must name ${field} as missing`
    );
  });
});

test("a file without a word column is refused before anything is sent", () => {
  const preview = buildImportPreview("Alpha,Beta\n1,2\n", []);
  assert(preview.ok === false, "the preview must fail");
  assert(preview.reason === "no-word-column", `unexpected reason: ${preview.reason}`);
  assert(describePreview(preview).includes("word column"), "the message must explain the problem");
});

test("an empty file is refused with its own message", () => {
  const preview = buildImportPreview("", []);
  assert(preview.ok === false && preview.reason === "empty", "an empty file must be refused");
  assert(describePreview(preview).includes("empty"), "the message must say so");
});

test("the confirmation line explains the numbers", () => {
  const preview = buildImportPreview(
    csvOf([csvRow("Zzorbex"), csvRow("Adopt")]),
    bank.map((entry) => entry.word)
  );
  const text = describePreview(preview);
  assert(text.includes("2 rows"), `expected the row count in: ${text}`);
  assert(text.includes("1 new"), `expected the new count in: ${text}`);
  assert(text.includes("already in the bank"), `expected the skip count in: ${text}`);
});

test("the server payload carries words without the preview-only fields", () => {
  const preview = buildImportPreview(csvOf([csvRow("Zzorbex")]), []);
  const payload = toImportPayload(preview);
  assert(payload.words.length === 1, "one word must be sent");
  assert(payload.words[0].word === "Zzorbex", "the word must be sent");
  assert(payload.words[0].number === undefined, "the preview number must not be sent");
  assert(payload.words[0].audio === undefined, "the preview audio path must not be sent");
});

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
