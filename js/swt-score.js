/*
==========================================
PTE Trainer
Summarize Written Text — Scoring module

Content scoring:
- Main Idea
- Key Points
- Overall Coverage

Form, Grammar, Vocabulary remain unchanged.

NOTE:
This is a practice scoring heuristic.
It is NOT Pearson's official scoring algorithm.
==========================================
*/

"use strict";

/* ==========================================
   Basic normalization
========================================== */

function norm(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-zA-Z' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ==========================================
   Sentence / word counting
========================================== */

function countSentences(text) {
  const trimmed = String(text || "").trim();

  if (!trimmed) return 0;

  const matches = trimmed.match(/[.!?]+(?=\s|$)/g);

  return matches ? matches.length : 0;
}

function countWords(text) {
  const trimmed = String(text || "").trim();

  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/* ==========================================
   Existing keyword scoring
   Kept for compatibility with the UI
========================================== */

function hasKeyword(normalizedText, keyword) {
  const target = norm(keyword);

  if (!target) return false;

  const words = target.split(" ");

  if (words.length > 1) {
    return normalizedText.includes(target);
  }

  const re = new RegExp(
    `(^|\\s|')${target.replace(/['']/g, "")}(?=(\\s|'|$))`
  );

  return re.test(normalizedText.replace(/['']/g, "'"));
}

function scoreKeywords(normalizedText, keywords) {
  if (!normalizedText) {
    return {
      coverage: 0,
      hits: 0,
      total: keywords.length
    };
  }

  const hits = keywords.filter((keyword) =>
    hasKeyword(normalizedText, keyword)
  ).length;

  const coverage = keywords.length
    ? hits / keywords.length
    : 0;

  return {
    coverage,
    hits,
    total: keywords.length
  };
}

/* ==========================================
   Stop words

   These words carry little meaning when
   measuring content overlap.
========================================== */

const stopWords = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "if",
  "then",
  "than",
  "that",
  "this",
  "these",
  "those",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "from",
  "with",
  "by",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "it",
  "its",
  "they",
  "their",
  "them",
  "he",
  "she",
  "his",
  "her",
  "we",
  "our",
  "you",
  "your",
  "can",
  "could",
  "may",
  "might",
  "will",
  "would",
  "should",
  "must",
  "has",
  "have",
  "had",
  "do",
  "does",
  "did",
  "also",
  "more",
  "most",
  "very",
  "such",
  "than",
  "into",
  "over",
  "under",
  "about",
  "through"
]);

/* ==========================================
   Lightweight academic synonym groups

   This helps recognize common paraphrases
   without pretending to perform full
   semantic/NLP analysis.
========================================== */

const synonymGroups = [
  ["important", "significant", "essential", "major", "critical"],
  ["increase", "increases", "increased", "increasing", "growth", "grow", "growing"],
  ["reduce", "reduces", "reduced", "reducing", "lower", "lowers", "lowered"],
  ["improve", "improves", "improved", "improving", "enhance", "enhances", "enhanced"],
  ["benefit", "benefits", "beneficial", "advantage", "advantages"],
  ["problem", "problems", "challenge", "challenges", "difficulty", "difficulties"],
  ["require", "requires", "required", "requiring", "need", "needs", "necessary"],
  ["support", "supports", "supported", "supporting", "help", "helps", "assist"],
  ["provide", "provides", "provided", "providing", "offer", "offers", "offered"],
  ["protect", "protects", "protected", "protecting", "preserve", "preserves"],
  ["use", "uses", "used", "using", "utilize", "utilizes"],
  ["people", "person", "individuals", "individual"],
  ["health", "healthy", "wellbeing"],
  ["environment", "environmental"],
  ["pollution", "pollutants"],
  ["energy", "electricity", "power"],
  ["education", "educational", "learning"],
  ["student", "students", "learner", "learners"],
  ["technology", "technologies", "technological"],
  ["organization", "organizations", "institution", "institutions"],
  ["government", "governments", "authorities"],
  ["transportation", "transport", "transit"],
  ["communication", "communications"],
  ["access", "accessibility", "accessible"],
  ["security", "secure", "safety"],
  ["maintain", "maintains", "maintained", "maintenance"],
  ["develop", "develops", "developed", "development"],
  ["practice", "practices", "practicing"],
  ["information", "inform", "informs"],
  ["accurate", "accuracy"],
  ["regular", "regularly", "consistent", "consistently"]
];

/* ==========================================
   Create synonym lookup
========================================== */

const synonymMap = new Map();

for (const group of synonymGroups) {
  for (const word of group) {
    synonymMap.set(word, group);
  }
}

/* ==========================================
   Lightweight word normalization

   Examples:
   benefits → benefit
   reducing → reduce
   improved → improve
========================================== */

function stemWord(word) {
  let w = word.toLowerCase();

  if (w.length > 5 && w.endsWith("ing")) {
    w = w.slice(0, -3);
  }

  if (w.length > 4 && w.endsWith("ed")) {
    w = w.slice(0, -2);
  }

  if (w.length > 4 && w.endsWith("es")) {
    w = w.slice(0, -2);
  } else if (w.length > 3 && w.endsWith("s")) {
    w = w.slice(0, -1);
  }

  return w;
}

/* ==========================================
   Convert text into meaningful concepts
========================================== */

function conceptTokens(text) {
  const normalized = norm(text);

  if (!normalized) return [];

  return normalized
    .split(/\s+/)
    .filter((word) => !stopWords.has(word))
    .map((word) => stemWord(word));
}

/* ==========================================
   Determine whether two words represent
   the same basic concept.
========================================== */

function conceptsMatch(a, b) {
  if (a === b) return true;

  const groupA = synonymMap.get(a);
  const groupB = synonymMap.get(b);

  if (groupA && groupB && groupA === groupB) {
    return true;
  }

  return false;
}

/* ==========================================
   Calculate how much of an idea is present
   in the student's response.

   Returns a value between 0 and 1.
========================================== */

function ideaCoverage(responseText, ideaText) {
  const responseTokens = conceptTokens(responseText);
  const ideaTokens = conceptTokens(ideaText);

  if (!responseTokens.length || !ideaTokens.length) {
    return 0;
  }

  let matched = 0;

  for (const ideaToken of ideaTokens) {
    const found = responseTokens.some((responseToken) =>
      conceptsMatch(responseToken, ideaToken)
    );

    if (found) {
      matched++;
    }
  }

  return matched / ideaTokens.length;
}

/* ==========================================
   Content scoring

   Weight:
   Main Idea  = 40%
   Key Points = 60%

   Final Content score = /2
========================================== */

function scoreContent(normalizedText, passage) {
  const mainIdea = passage.mainIdea || "";
  const keyPoints = Array.isArray(passage.keyPoints)
    ? passage.keyPoints
    : [];

  /*
  ------------------------------------------
  Fallback for old questions
  ------------------------------------------
  */

  if (!mainIdea && !keyPoints.length) {
    const keywordResult = scoreKeywords(
      normalizedText,
      passage.keywords || []
    );

    return {
      score: Math.min(
        2,
        Number((keywordResult.coverage * 2).toFixed(2))
      ),

      coverage: keywordResult.coverage,

      mainIdeaCoverage: null,

      keyPointCoverage: [],

      keyPointsCovered: keywordResult.hits,

      keyPointsTotal: keywordResult.total,

      hits: keywordResult.hits,

      total: keywordResult.total,

      reasons: [
        `Keyword coverage: ${Math.round(
          keywordResult.coverage * 100
        )}%`
      ]
    };
  }

  /*
  ------------------------------------------
  Main Idea
  ------------------------------------------
  */

  const mainIdeaCoverage = mainIdea
    ? ideaCoverage(normalizedText, mainIdea)
    : 0;

  /*
  ------------------------------------------
  Key Points
  ------------------------------------------
  */

  const keyPointCoverage = keyPoints.map((point) => {
    const coverage = ideaCoverage(
      normalizedText,
      point
    );

    return {
      text: point,
      coverage,
      covered: coverage >= 0.45
    };
  });

  const keyPointAverage = keyPointCoverage.length
    ? keyPointCoverage.reduce(
        (sum, item) => sum + item.coverage,
        0
      ) / keyPointCoverage.length
    : 0;

  const keyPointsCovered = keyPointCoverage.filter(
    (item) => item.covered
  ).length;

  /*
  ------------------------------------------
  Overall content coverage

  Main Idea: 40%
  Key Points: 60%
  ------------------------------------------
  */

  const coverage =
    (mainIdeaCoverage * 0.4) +
    (keyPointAverage * 0.6);

  const score = Math.min(
    2,
    Number((coverage * 2).toFixed(2))
  );

  /*
  ------------------------------------------
  Feedback
  ------------------------------------------
  */

  const reasons = [];

  reasons.push(
    `Main idea coverage: ${Math.round(
      mainIdeaCoverage * 100
    )}%`
  );

  if (keyPoints.length) {
    reasons.push(
      `Key points covered: ${keyPointsCovered}/${keyPoints.length}`
    );
  }

  reasons.push(
    `Overall content coverage: ${Math.round(
      coverage * 100
    )}%`
  );

  return {
    score,

    coverage,

    mainIdeaCoverage,

    keyPointCoverage,

    keyPointsCovered,

    keyPointsTotal: keyPoints.length,

    /*
    Keep these fields so the existing UI
    continues to work.
    */
    hits: keyPointsCovered,
    total: keyPoints.length,

    reasons
  };
}

/* ==========================================
   Form scoring
   UNCHANGED
========================================== */

function scoreForm(sentences, words) {
  if (sentences !== 1) {
    return {
      score: 0,
      reason: `${sentences} sentences — one sentence is required`
    };
  }

  if (words < 5 || words > 75) {
    return {
      score: 1,
      reason: `One sentence, but ${words} words (5–75 required)`
    };
  }

  return {
    score: 2,
    reason: "One sentence within the 5–75 word range"
  };
}

/* ==========================================
   Grammar scoring
   UNCHANGED
========================================== */

function scoreGrammar(text, words) {
  if (!text.trim()) {
    return {
      score: 0,
      reason: "No response"
    };
  }

  let score = 2;

  const issues = [];

  const normalized = text
    .replace(/['']/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  const repeated = normalized
    .split(" ")
    .find(
      (token, index, arr) =>
        token && arr[index + 1] === token
    );

  if (repeated) {
    score -= 0.5;

    issues.push(
      `repeated word "${repeated}"`
    );
  }

  const endsWithPunctuation =
    /[.!?]$/.test(text.trim());

  if (!endsWithPunctuation) {
    score -= 0.5;

    issues.push(
      "missing terminal punctuation"
    );
  }

  const startsCapital =
    /^[A-Z]/.test(text.trim());

  if (!startsCapital && words > 1) {
    score -= 0.25;

    issues.push(
      "should start with a capital letter"
    );
  }

  if (score < 0) score = 0;

  return {
    score,
    issues
  };
}

/* ==========================================
   Vocabulary scoring
   UNCHANGED
========================================== */

function scoreVocabulary(normalizedText, words) {
  if (!words) {
    return {
      score: 0,
      reason: "No response"
    };
  }

  const unique = new Set(
    normalizedText
      ? normalizedText.split(" ")
      : []
  );

  const diversity =
    unique.size / words;

  const score = Math.min(
    2,
    Number((diversity * 2).toFixed(2))
  );

  return {
    score,

    reason:
      `${unique.size} unique words across ${words} total ` +
      `(lexical diversity ${Math.round(
        diversity * 100
      )}%)`
  };
}

/* ==========================================
   Main scoring function
========================================== */

export function scoreSummary(
  passage,
  userText
) {
  const text = String(userText || "");

  const normalized = norm(text);

  const words = countWords(text);

  const sentences = countSentences(text);

  /*
  Content
  */

  const content = scoreContent(
    normalized,
    passage
  );

  /*
  Form
  */

  const form = scoreForm(
    sentences,
    words
  );

  /*
  Grammar
  */

  const grammar = scoreGrammar(
    text,
    words
  );

  /*
  Vocabulary
  */

  const vocabulary = scoreVocabulary(
    normalized,
    words
  );

  /*
  Criteria
  */

  const criteria = {
    Content: Number(
      content.score.toFixed(2)
    ),

    Form: Number(
      form.score.toFixed(2)
    ),

    Grammar: Number(
      grammar.score.toFixed(2)
    ),

    Vocabulary: Number(
      vocabulary.score.toFixed(2)
    )
  };

  /*
  Total

  IMPORTANT:
  This calculation remains unchanged.
  */

  const sum = Object.values(criteria)
    .reduce((a, b) => a + b, 0);

  const total = Math.round(
    (sum / 8) * 100
  );

  /*
  Return everything needed by swt.js
  */

  return {
    total,

    criteria,

    words,

    sentences,

    /*
    Existing UI compatibility.
    This remains based on the original
    keyword list.
    */

    keywordCoverage:
      scoreKeywords(
        normalized,
        passage.keywords || []
      ).coverage,

    hits: content.hits,

    keywordTotal:
      passage.keywords
        ? passage.keywords.length
        : 0,

    /*
    New Stage 3 content information
    */

    mainIdeaCoverage:
      content.mainIdeaCoverage,

    keyPointCoverage:
      content.keyPointCoverage,

    keyPointsCovered:
      content.keyPointsCovered,

    keyPointsTotal:
      content.keyPointsTotal,

    /*
    What the answer left out — used by the
    training guide and the weak-item tracker.
    */

    mainIdeaCovered:
      (content.mainIdeaCoverage || 0) >= 0.45,

    missedPoints: (
      content.keyPointCoverage || []
    )
      .filter((point) => !point.covered)
      .map((point) => point.text),

    contentReasons:
      content.reasons,

    formReason:
      form.reason,

    grammarIssues:
      grammar.issues,

    vocabularyReason:
      vocabulary.reason
  };
}