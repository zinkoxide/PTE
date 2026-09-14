/* ==========================================
   PTE Trainer — إضافة كلمات (add-word.html)
   Standalone page; nothing runs automatically.
   Needs the Flask server (app.py) only at save time.
   ========================================== */

"use strict";

const $ = (id) => document.getElementById(id);

const form = $("add-word-form");
const submitButton = $("add-word-submit");
const shutdownButton = $("add-server-shutdown");
const retryButton = $("retry-service");
const errorsBox = $("add-form-errors");
const serviceStatus = $("add-service-status");
const submitHint = $("submit-hint");
const toast = $("toast");

const wordInput = $("aw-word");
const wordStatus = $("aw-word-status");

let wordExists = false;
let serverUp = false;
let serviceEnabled = false;

/* --------------------------------------
   Toast
-------------------------------------- */

let toastTimer = null;

function showToast(message, type = "") {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 5000);
}

/* --------------------------------------
   Submit button state (single source of truth)
-------------------------------------- */

function updateSubmitState() {
  const word = wordInput.value.trim();
  const canSubmit = serverUp && serviceEnabled && word && !wordExists;
  submitButton.disabled = !canSubmit;

  if (submitHint) {
    if (!word) {
      submitHint.textContent = "✍️ اكتب اسم الكلمة أولاً — سيتفعّل زر الحفظ تلقائياً.";
    } else if (!serverUp) {
      submitHint.textContent = "🔌 الخادم غير متصل — شغّله: bash tools/start_add_word.sh ثم اضغط «⟳ إعادة فحص».";
    } else if (!serviceEnabled) {
      submitHint.textContent = "⏸ خدمة الإضافة موقوفة مؤقتاً — لا يُحفظ شيء قبل التفعيل.";
    } else if (wordExists) {
      submitHint.textContent = "⚠️ كلمة مكررة — موجودة مسبقاً، اختر كلمة أخرى.";
    } else {
      submitHint.textContent = "✓ كل شيء جاهز — اضغط «حفظ الكلمة» (رقم تلقائي + صوت).";
    }
  }
}

/* --------------------------------------
   Service status
-------------------------------------- */

function setServiceStatus(kind, text) {
  serviceStatus.className = `aw-service-status ${kind}`;
  serviceStatus.textContent = text;
}

async function refreshServiceStatus() {
  shutdownButton.hidden = true;
  setServiceStatus("aw-service-loading", "التحقق من حالة خدمة الإضافة…");

  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    serverUp = true;
    serviceEnabled = Boolean(data.serviceEnabled);
    shutdownButton.hidden = false;

    if (serviceEnabled) {
      setServiceStatus(
        "aw-service-on",
        "✓ خدمة الإضافة مفعّلة — يمكنك الحفظ الآن (رقم تلقائي + توليد صوت)."
      );
    } else {
      setServiceStatus(
        "aw-service-off",
        "⏸ خدمة الإضافة موقوفة حالياً — لا يُحفظ شيء قبل الضغط على «حفظ الكلمة»."
      );
    }
  } catch {
    serverUp = false;
    serviceEnabled = false;
    shutdownButton.hidden = true;
    setServiceStatus(
      "aw-service-off",
      "✕ خادم الإضافة غير متصل — تشغيله فقط عند الحفظ:\n    bash tools/start_add_word.sh\nثم اضغط «⟳ إعادة فحص الخادم»."
    );
  }

  updateSubmitState();
}

retryButton.addEventListener("click", refreshServiceStatus);

shutdownButton.addEventListener("click", async () => {
  if (!confirm("إيقاف خادم الإضافة؟ لن يُحفظ أو يُحذف أي شيء — بياناتك تبقى كما هي.")) {
    return;
  }
  try {
    const response = await fetch("/api/shutdown", {
      method: "POST",
      cache: "no-store",
    });
    const data = await response.json();
    showToast(data.message || "أُوقف الخادم.", "success");
    shutdownButton.hidden = true;
    serverUp = false;
    serviceEnabled = false;
    setServiceStatus("aw-service-off", "⏹ تم إيقاف خادم الإضافة. يمكنك إغلاق هذه الصفحة أو متابعة تصفح الكلمات.");
  } catch {
    showToast("تعذر إيقاف الخادم.", "error");
  }
  updateSubmitState();
});

/* --------------------------------------
   Live duplicate check (debounced)
-------------------------------------- */

function parseList(value) {
  return value
    .split("\n")
    .flatMap((line) => line.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

async function checkWord(word) {
  try {
    const response = await fetch(`/api/check-word?word=${encodeURIComponent(word)}`, { cache: "no-store" });
    serverUp = response.ok;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.exists;
  } catch {
    serverUp = false;
    return false;
  }
}

let checkTimer = null;

wordInput.addEventListener("input", () => {
  clearTimeout(checkTimer);
  const value = wordInput.value.trim();
  wordExists = false;

  if (!value) {
    wordStatus.textContent = "";
    wordStatus.className = "aw-status add-status";
    updateSubmitState();
    return;
  }

  checkTimer = setTimeout(async () => {
    wordExists = await checkWord(value);

    if (!serverUp) {
      wordStatus.textContent = "خادم الإضافة غير متصل.";
      wordStatus.className = "aw-status add-status server-down";
    } else if (!serviceEnabled) {
      wordStatus.textContent = "الخدمة موقوفة مؤقتاً.";
      wordStatus.className = "aw-status add-status duplicate";
    } else if (wordExists) {
      wordStatus.textContent = "⚠️ كلمة مكررة — موجودة مسبقاً";
      wordStatus.className = "aw-status add-status duplicate";
    } else {
      wordStatus.textContent = "✓ الكلمة متاحة";
      wordStatus.className = "aw-status add-status available";
    }

    updateSubmitState();
  }, 350);
});

wordInput.addEventListener("blur", () => {
  clearTimeout(checkTimer);
});

/* --------------------------------------
   Validation before submit
-------------------------------------- */

function getFieldValue(id) {
  return $(id).value.trim();
}

function reportErrors(errors) {
  const items = Object.entries(errors)
    .map(([key, message]) => `• ${message}`)
    .join("\n");
  errorsBox.textContent = items;
  errorsBox.hidden = false;
}

function validateForm() {
  const errors = {};

  const word = getFieldValue("aw-word");
  const meaningEn = getFieldValue("aw-meaning-en");
  const meaningAr = getFieldValue("aw-meaning-ar");

  if (!word) errors.word = "أدخل اسم الكلمة.";
  if (!wordExists && word) {
    const parts = parseList($("aw-collocations").value);
    const synonyms = parseList($("aw-synonyms").value);
    const examples = parseList($("aw-examples").value);
    if (parts.length < 3) errors.collocations = `المصاحبات: أدخل 3 فأكثر (وجدت ${parts.length}).`;
    if (synonyms.length < 3) errors.synonyms = `المرادفات: أدخل 3 فأكثر (وجدت ${synonyms.length}).`;
    if (examples.length < 3) errors.examples = `أمثلة الجمل: أدخل 3 فأكثر (وجدت ${examples.length}).`;
  }
  if (!meaningEn) errors.meaningEN = "أدخل المعنى بالإنجليزية.";
  if (!meaningAr) errors.meaningAR = "أدخل المعنى بالعربية.";
  if (!serverUp) errors.server = "خادم الإضافة غير متصل — شغّل app.py ثم أعد المحاولة.";
  if (serverUp && !serviceEnabled) errors.server = "خدمة الإضافة موقوفة مؤقتاً.";

  return errors;
}

/* --------------------------------------
   Submit (the ONLY thing that saves)
-------------------------------------- */

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorsBox.hidden = true;
  submitButton.disabled = true;

  const errors = validateForm();
  if (Object.keys(errors).length) {
    reportErrors(errors);
    updateSubmitState();
    return;
  }

  const payload = {
    word: getFieldValue("aw-word"),
    pronunciation: getFieldValue("aw-pronunciation"),
    partOfSpeech: $("aw-pos").value,
    cefrLevel: $("aw-cefr").value,
    frequency: $("aw-frequency").value,
    meaningEN: getFieldValue("aw-meaning-en"),
    meaningAR: getFieldValue("aw-meaning-ar"),
    collocations: parseList($("aw-collocations").value),
    synonyms: parseList($("aw-synonyms").value),
    examples: parseList($("aw-examples").value),
    commonMistakes: parseList($("aw-mistakes").value),
    wordFamily: parseList($("aw-family").value),
  };

  try {
    const response = await fetch("/api/add-word", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const fields = data.errors || {};
      if (data.duplicate) {
        wordStatus.textContent = "⚠️ كلمة مكررة — موجودة مسبقاً";
        wordStatus.className = "aw-status add-status duplicate";
        wordExists = true;
        showToast(data.error, "error");
      } else if (Object.keys(fields).length) {
        reportErrors(fields);
      } else {
        setServiceStatus("aw-service-off", data.error || "تعذر الحفظ.");
      }
      updateSubmitState();
      return;
    }

    form.reset();
    wordStatus.textContent = "";
    wordStatus.className = "aw-status add-status";
    errorsBox.hidden = true;
    wordExists = false;
    showToast(`✅ أُضيفت «${data.word}» برقم #${data.number} مع الصوت`, "success");
  } catch {
    showToast("فشل الاتصال بخادم الإضافة — شغّل app.py", "error");
  }

  updateSubmitState();
});

refreshServiceStatus();