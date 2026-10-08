/* ==========================================
   PTE Trainer — vocabulary CSV export tests
   Run: node tools/tests/test-csv-export.mjs
   ========================================== */

import {
  UTF8_BOM,
  LIST_SEPARATOR,
  VOCAB_COLUMNS,
  ALL_COLUMNS,
  DEFAULT_COLUMN_KEYS,
  COLUMN_KEYS_STORAGE,
  columnsForKeys,
  loadColumnKeys,
  saveColumnKeys,
  escapeCsvValue,
  readField,
  buildVocabularyCsv,
  csvFilename
} from "../../js/csv-export.js";
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

/* Split one CSV line, honouring quoted cells (used to prove the file parses). */
function parseLine(line, delimiter = ",") {
  const cells = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  return cells;
}

const bank = JSON.parse(readFileSync(new URL("../../data/vocabulary.json", import.meta.url), "utf8"));

/* ---------------- Escaping ---------------- */

test("plain values are written without quotes", () => {
  assert(escapeCsvValue("significant") === "significant", "a simple word needs no quoting");
  assert(escapeCsvValue(42) === "42", "numbers are stringified");
  assert(escapeCsvValue(null) === "", "null becomes an empty cell");
  assert(escapeCsvValue(undefined) === "", "undefined becomes an empty cell");
  assert(escapeCsvValue("") === "", "an empty string stays empty");
});

test("commas force quoting so columns cannot shift", () => {
  assert(escapeCsvValue("important, substantial") === '"important, substantial"', "commas must be quoted");
  const cells = parseLine(escapeCsvValue("important, substantial"));
  assert(cells.length === 1, "a quoted comma stays inside one cell");
});

test("quotes are doubled, not dropped", () => {
  assert(escapeCsvValue('say "hello"') === '"say ""hello"""', "inner quotes must be doubled");
  assert(parseLine(escapeCsvValue('say "hello"'))[0] === 'say "hello"', "the value must round-trip");
});

test("newlines and tabs stay inside one cell", () => {
  const value = "first line\nsecond line";
  const quoted = escapeCsvValue(value);
  assert(quoted.startsWith('"') && quoted.endsWith('"'), "a newline must be quoted");
  assert(parseLine(quoted).length === 1, "a newline must not create a new column");
  assert(escapeCsvValue("a\tb") === '"a\tb"', "a tab is quoted too");
});

test("a semicolon delimiter is respected", () => {
  assert(escapeCsvValue("a;b", ";") === '"a;b"', "the custom delimiter must trigger quoting");
  assert(escapeCsvValue("a,b", ";") === "a,b", "a comma is harmless with a semicolon delimiter");
});

/* ---------------- Fields ---------------- */

test("list fields are joined into one readable cell", () => {
  const word = { synonyms: ["important", "notable"], collocations: [] };
  assert(readField(word, { key: "synonyms", list: true }) === "important | notable", "lists must be joined");
  assert(readField(word, { key: "collocations", list: true }) === "", "an empty list is empty");
  assert(LIST_SEPARATOR === " | ", "the separator must stay readable");
});

test("a column can read a value through an accessor", () => {
  const word = { word: "adopt" };
  const column = { key: "studyStatus", label: "Study status", value: (w) => (w.word === "adopt" ? "learned" : "—") };
  assert(readField(word, column) === "learned", "an accessor must win over the key");
  assert(readField(null, column) === "", "a missing word must not throw");
});

/* ---------------- Whole file ---------------- */

test("the file starts with a UTF-8 BOM so Arabic survives Excel", () => {
  const csv = buildVocabularyCsv([{ word: "كلمة", meaningAR: "مهم" }]);
  assert(csv.charCodeAt(0) === 0xfeff, "the BOM must be the very first character");
  assert(buildVocabularyCsv([], [], { bom: false }).charCodeAt(0) !== 0xfeff, "the BOM must be optional");
});

test("the header lists every column label and each row has the same width", () => {
  const csv = buildVocabularyCsv(bank.slice(0, 5));
  const [header, ...rows] = csv.replace(UTF8_BOM, "").trim().split("\r\n");
  const headerCells = parseLine(header);

  assert(headerCells.length === VOCAB_COLUMNS.length, `expected ${VOCAB_COLUMNS.length} columns, got ${headerCells.length}`);
  assert(headerCells[0] === "Word" && headerCells[1] === "Pronunciation", "labels must be readable");
  assert(headerCells.includes("Meaning (AR)"), "the Arabic meaning must be exported");

  rows.forEach((row) => {
    assert(parseLine(row).length === VOCAB_COLUMNS.length, "every row must match the header width");
  });
});

test("a real word round-trips through the file with its content intact", () => {
  const word = bank.find((entry) => entry.meaningAR && /[،]/.test(entry.meaningAR)) || bank[0];
  const csv = buildVocabularyCsv([word]);
  const [, row] = csv.replace(UTF8_BOM, "").trim().split("\r\n");
  const cells = parseLine(row);

  assert(cells[0] === word.word, "the word must be the first cell");
  const meaningIndex = VOCAB_COLUMNS.findIndex((c) => c.key === "meaningAR");
  assert(cells[meaningIndex] === word.meaningAR, `Arabic meaning must survive: ${cells[meaningIndex]}`);
  const synonymsIndex = VOCAB_COLUMNS.findIndex((c) => c.key === "synonyms");
  assert(cells[synonymsIndex].includes(word.synonyms[0]), "the first synonym must be present");
});

test("the whole bank exports one row per word", () => {
  const csv = buildVocabularyCsv(bank);
  const lines = csv.replace(UTF8_BOM, "").trim().split("\r\n");
  assert(lines.length === bank.length + 1, `expected ${bank.length + 1} lines, got ${lines.length}`);
});

test("the whole bank survives parsing without losing a cell", () => {
  /* The hardest real rows: mistakes contain arrows, quotes and commas. */
  const tricky = bank.filter((entry) =>
    (entry.commonMistakes || []).some((m) => /[",→]/.test(m))
  );
  assert(tricky.length > 0, "the corpus should contain rows that need escaping");

  const csv = buildVocabularyCsv(tricky);
  const [header, ...rows] = csv.replace(UTF8_BOM, "").trim().split("\r\n");
  const width = parseLine(header).length;
  rows.forEach((row, index) => {
    assert(parseLine(row).length === width, `row ${index + 1} of ${tricky.length} lost or gained a cell`);
  });
});

test("an empty selection still yields a usable header-only file", () => {
  const csv = buildVocabularyCsv([]);
  const lines = csv.replace(UTF8_BOM, "").trim().split("\r\n");
  assert(lines.length === 1, "only the header should remain");
  assert(parseLine(lines[0]).length === VOCAB_COLUMNS.length, "the header must be complete");
});

test("a non-array input is treated as empty instead of throwing", () => {
  assert(buildVocabularyCsv(null).replace(UTF8_BOM, "").trim().split("\r\n").length === 1, "null must not throw");
  assert(buildVocabularyCsv(undefined).includes("Word"), "undefined must not throw");
});

test("the filename carries the date", () => {
  const name = csvFilename("pte-vocabulary", new Date("2026-10-05T12:00:00Z"));
  assert(name === "pte-vocabulary-2026-10-05.csv", `unexpected filename: ${name}`);
  assert(csvFilename(undefined, new Date("2026-01-02T00:00:00Z")).endsWith(".csv"), "the extension must stay");
});

/* ---------- the column picker ---------- */

/* A storage stand-in, so the tests never touch the real localStorage. */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    get size() { return map.size; }
  };
}

test("the picker offers the file columns and the study columns", () => {
  assert(ALL_COLUMNS.length === VOCAB_COLUMNS.length + 2, "two study columns are added");
  assert(DEFAULT_COLUMN_KEYS.length === ALL_COLUMNS.length, "the default is every column");
  assert(DEFAULT_COLUMN_KEYS.includes("studyStatus"), "the study status is offered");
  assert(DEFAULT_COLUMN_KEYS.includes("dueLabel"), "the review date is offered");
});

test("a chosen set keeps the file order, whatever order it was saved in", () => {
  const keys = columnsForKeys(["meaningAR", "word", "audio"]).map((c) => c.key);
  assert(keys.join(",") === "word,meaningAR,audio", `got ${keys.join(",")}`);
});

test("unknown keys are dropped and duplicates collapse", () => {
  const keys = columnsForKeys(["word", "word", "nonsense"]).map((c) => c.key);
  assert(keys.join(",") === "word", `got ${keys.join(",")}`);
});

test("an empty or broken pick falls back to every column", () => {
  assert(columnsForKeys([]).length === ALL_COLUMNS.length, "an empty list");
  assert(columnsForKeys(["nope"]).length === ALL_COLUMNS.length, "nothing known");
  assert(columnsForKeys(null).length === ALL_COLUMNS.length, "not a list");
  /* A file with no columns would be a header line and nothing else. */
  assert(columnsForKeys([]).length > 0, "an export always has columns");
});

test("the pick survives a reload", () => {
  const storage = fakeStorage();
  const saved = saveColumnKeys(["word", "meaningAR"], storage);
  assert(saved.join(",") === "word,meaningAR", "saved in file order");
  assert(loadColumnKeys(storage).join(",") === "word,meaningAR", "read back the same");
  assert(storage.getItem(COLUMN_KEYS_STORAGE).includes("word"), "written under one key");
});

test("junk in storage does not break the export", () => {
  assert(loadColumnKeys(fakeStorage({ [COLUMN_KEYS_STORAGE]: "not json" })).length === ALL_COLUMNS.length,
    "unparseable value");
  assert(loadColumnKeys(fakeStorage({ [COLUMN_KEYS_STORAGE]: '{"a":1}' })).length === ALL_COLUMNS.length,
    "an object instead of a list");
  assert(loadColumnKeys(fakeStorage({ [COLUMN_KEYS_STORAGE]: "[]" })).length === ALL_COLUMNS.length,
    "an empty list");
  assert(loadColumnKeys(fakeStorage()).length === ALL_COLUMNS.length, "nothing stored yet");
});

test("a storage that refuses to write still returns a usable pick", () => {
  const broken = { getItem: () => null, setItem: () => { throw new Error("no"); } };
  assert(saveColumnKeys(["word"], broken).length === 1, "the session keeps its choice");
});

test("a two-column file really contains two columns", () => {
  const csv = buildVocabularyCsv([{ word: "Benefit", meaningAR: "فائدة" }], columnsForKeys(["word", "meaningAR"]));
  const [header, row] = csv.replace(UTF8_BOM, "").trim().split("\r\n");
  assert(header === "Word,Meaning (AR)", `header was ${header}`);
  assert(row === "Benefit,فائدة", `row was ${row}`);
});

console.log(`RESULT: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
