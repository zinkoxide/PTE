"""==========================================
PTE Trainer — Vocabulary Add Server (Flask)
===========================================

Serves the static PTE Trainer site and exposes
API endpoints for adding new vocabulary words:

  GET  /api/check-word?word=Inn...  → { exists, word }
  POST /api/add-word                → adds (validates, generates
                                      audio, assigns next index)

Audio is generated with Microsoft Edge TTS
(reusing the same voice as generate_vocabulary_audio.py).
"""

import asyncio
import json
import sys
import threading
from pathlib import Path

import edge_tts
from flask import Flask, jsonify, request, send_from_directory

# tools/import_plan.py holds the dependency-free import rules.
sys.path.insert(0, str(Path(__file__).resolve().parent / "tools"))

import import_plan  # noqa: E402

VOICE = "en-US-AndrewNeural"

PROJECT_ROOT = Path(__file__).resolve().parent

DATA_FILE = PROJECT_ROOT / "data" / "vocabulary.json"
AUDIO_INDEX_FILE = PROJECT_ROOT / "data" / "vocabulary_audio_index.json"
AUDIO_DIRECTORY = PROJECT_ROOT / "assets" / "audio" / "vocabulary"

ALLOWED_LEVELS = {"A1", "A2", "B1", "B2", "C1", "C2"}
ALLOWED_FREQUENCIES = {"2", "3", "4", "5"}
ALLOWED_PARTS = {"Noun", "Verb", "Adjective", "Adverb"}

FIELDS = [
    "word", "pronunciation", "audio", "partOfSpeech", "cefrLevel",
    "frequency", "meaningEN", "meaningAR", "collocations",
    "commonMistakes", "synonyms", "examples", "wordFamily",
]

_lock = threading.Lock()

SERVICE_ENABLED = True
SERVER = None

app = Flask(__name__, static_folder=".", static_url_path="")

# The app is normally browsed through this server, but a learner may keep any
# static server for reading and only start this one to add words. Those
# requests come from a different loopback port, so the local API answers them
# with CORS headers. Only loopback origins are ever allowed: this is a
# single-user desktop tool and nothing here should be reachable from a site.
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "[::1]", "::1"}


def _origin_allowed(origin):
    if not origin:
        return False
    host = origin.split("//", 1)[-1].split("/", 1)[0].split(":")[0].strip("[]")
    return host in LOOPBACK_HOSTS


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin", "")
    if _origin_allowed(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


def load_json(path):
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_json(path, data, indent=2):
    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=indent)


def existing_words_lower(vocabulary):
    return {str(item.get("word", "")).strip().lower() for item in vocabulary}


async def generate_audio(text, output_file):
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(str(output_file))


def valid_part_of_speech(value):
    return all(part.strip() in ALLOWED_PARTS for part in value.split(";"))


def validate_entry(payload, require_rich_lists=True):
    errors = {}

    word = str(payload.get("word", "")).strip()
    pronunciation = str(payload.get("pronunciation", "")).strip()
    part_of_speech = str(payload.get("partOfSpeech", "")).strip()
    cefr_level = str(payload.get("cefrLevel", "")).strip()
    frequency = str(payload.get("frequency", "")).strip()
    meaning_en = str(payload.get("meaningEN", "")).strip()
    meaning_ar = str(payload.get("meaningAR", "")).strip()

    if not word:
        errors["word"] = "أدخل اسم الكلمة."
    elif not word.isalpha() and not any(ch.isalpha() for ch in word):
        errors["word"] = "اسم الكلمة يجب أن يحتوي على أحرف."

    if not pronunciation:
        errors["pronunciation"] = "أدخل النطق (IPA)."
    if not part_of_speech:
        errors["partOfSpeech"] = "اختر قسم الكلام."
    elif not valid_part_of_speech(part_of_speech):
        errors["partOfSpeech"] = "قسم الكلام غير صالح."
    if cefr_level not in ALLOWED_LEVELS:
        errors["cefrLevel"] = "اختر مستوى CEFR صحيحاً."
    if frequency not in ALLOWED_FREQUENCIES:
        errors["frequency"] = "اختر درجة التكرار الصحيحة."
    if not meaning_en:
        errors["meaningEN"] = "أدخل المعنى بالإنجليزية."
    if not meaning_ar:
        errors["meaningAR"] = "أدخل المعنى بالعربية."

    list_fields = [
        ("collocations", "المصاحبات اللغوية", 3),
        ("synonyms", "المرادفات", 3),
        ("examples", "أمثلة الجمل", 3),
        ("commonMistakes", "الأخطاء الشائعة", 1),
        ("wordFamily", "عائلة الكلمة", 1),
    ]
    cleaned_lists = {}
    for key, label, minimum in list_fields:
        values = payload.get(key)

        # A bulk CSV import may legitimately carry one example per word, so
        # the "at least three" rule applies to the single-word form only.
        if not require_rich_lists:
            if values is None:
                cleaned_lists[key] = []
                continue
            if isinstance(values, str):
                values = [values]
            if not isinstance(values, list):
                continue
            cleaned_lists[key] = [str(v).strip() for v in values if str(v).strip()]
            continue

        if not isinstance(values, list):
            errors[key] = f"أدخل {label}."
            continue
        cleaned = [str(v).strip() for v in values if str(v).strip()]
        cleaned_lists[key] = cleaned
        if len(cleaned) < minimum:
            errors[key] = (
                f"{label}: أدخل {minimum} أو أكثر (وجدت {len(cleaned)})."
            )

    return (
        {
            "word": word,
            "pronunciation": pronunciation,
            "audio": "",
            "partOfSpeech": part_of_speech,
            "cefrLevel": cefr_level,
            "frequency": frequency,
            "meaningEN": meaning_en,
            "meaningAR": meaning_ar,
            "collocations": cleaned_lists.get("collocations", []),
            "commonMistakes": cleaned_lists.get("commonMistakes", []),
            "synonyms": cleaned_lists.get("synonyms", []),
            "examples": cleaned_lists.get("examples", []),
            "wordFamily": cleaned_lists.get("wordFamily", []),
        },
        errors,
    )


@app.route("/")
def index():
    return send_from_directory(PROJECT_ROOT, "index.html")


@app.route("/api/status")
def api_status():
    """Service on/off state. Closing never writes to any file."""
    return jsonify({"running": True, "serviceEnabled": SERVICE_ENABLED})


@app.route("/api/service", methods=["POST"])
def set_service():
    """Toggle the add-word service. No data is written here."""
    global SERVICE_ENABLED
    body = request.get_json(silent=True) or {}
    SERVICE_ENABLED = bool(body.get("enabled"))
    return jsonify({"running": True, "serviceEnabled": SERVICE_ENABLED})


@app.route("/api/shutdown", methods=["POST"])
def shutdown_server():
    """Stop the add-word server cleanly. Nothing is saved or changed —
    data is only written when a word is successfully added."""
    def _stop():
        if SERVER is not None:
            SERVER.shutdown()
    threading.Thread(target=_stop, daemon=True).start()
    return jsonify({
        "success": True,
        "message": "تم إيقاف خادم الإضافة. بياناتك لم تتغير.",
    }), 200


@app.route("/api/check-word")
def check_word():
    if not SERVICE_ENABLED:
        return jsonify({
            "success": False,
            "error": "خدمة الإضافة متوقفة مؤقتاً — شغّلها أولاً.",
        }), 503

    word = request.args.get("word", "").strip().lower()
    if not word:
        return jsonify({"exists": False, "word": ""})

    with _lock:
        vocabulary = load_json(DATA_FILE)
    exists = word in existing_words_lower(vocabulary)

    return jsonify({"exists": exists, "word": word})


@app.route("/api/add-word", methods=["POST"])
def add_word():
    if not SERVICE_ENABLED:
        return jsonify({
            "success": False,
            "error": "خدمة الإضافة متوقفة مؤقتاً — شغّلها أولاً.",
        }), 503

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"success": False, "error": "بيانات غير صالحة."}), 400

    entry, errors = validate_entry(payload)
    if errors:
        return jsonify({"success": False, "errors": errors}), 400

    with _lock:
        vocabulary = load_json(DATA_FILE)

        word = entry["word"]
        if word.lower() in existing_words_lower(vocabulary):
            return jsonify({
                "success": False,
                "duplicate": True,
                "error": f"الكلمة «{word}» موجودة مسبقاً — مكررة.",
            }), 409

        number = len(vocabulary) + 1
        audio_name = f"{number:03d}.mp3"
        audio_path = AUDIO_DIRECTORY / audio_name
        audio_rel = f"assets/audio/vocabulary/{audio_name}"

        try:
            asyncio.run(generate_audio(word, audio_path))
        except Exception as error:  # noqa: BLE001
            return jsonify({
                "success": False,
                "error": f"فشل توليد الصوت: {error}",
            }), 500

        vocabulary.append(entry)
        save_json(DATA_FILE, vocabulary, indent=2)

        audio_index = load_json(AUDIO_INDEX_FILE)
        audio_index[word] = audio_rel
        save_json(AUDIO_INDEX_FILE, audio_index, indent=4)

    return jsonify({
        "success": True,
        "number": number,
        "word": word,
        "audio": audio_rel,
    }), 200


# A single import must not be able to rewrite the whole bank by accident.
MAX_IMPORT_WORDS = import_plan.MAX_IMPORT_WORDS


@app.route("/api/import-words", methods=["POST"])
def import_words():
    """
    Add several words from a CSV import.

    The browser sends only the words it already checked as new, but this
    endpoint is still the authority: `tools/import_plan.py` re-checks for
    duplicates, `validate_entry` enforces the same rules as the single-word
    form, and the new words are numbered on from the end of the bank
    (1001 -> 1002, 1003, ...) which is what names their audio file.

    `dryRun` reports the plan without writing anything.
    """
    if not SERVICE_ENABLED:
        return jsonify({
            "success": False,
            "error": "خدمة الإضافة متوقفة مؤقتاً — شغّلها أولاً.",
        }), 503

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"success": False, "error": "بيانات غير صالحة."}), 400

    dry_run = bool(payload.get("dryRun"))

    with _lock:
        vocabulary = load_json(DATA_FILE)
        plan = import_plan.plan_import(
            vocabulary,
            payload.get("words"),
            lambda item: validate_entry(item, require_rich_lists=False),
            MAX_IMPORT_WORDS,
        )

        if plan["errors"]:
            return jsonify({"success": False, "error": plan["errors"][0]}), 400

        added = []
        without_audio = []
        rejected = list(plan["rejected"])

        for record in plan["added"]:
            entry = record["entry"]
            if dry_run:
                added.append({"word": record["word"], "number": record["number"], "audio": record["audio"]})
                continue

            audio_rel = record["audio"]
            try:
                asyncio.run(generate_audio(entry["word"], AUDIO_DIRECTORY / f"{record['number']:03d}.mp3"))
            except Exception as error:  # noqa: BLE001
                # A missing audio file is recoverable: the word can be
                # regenerated later with tools/generate_vocabulary_audio.py,
                # so the word itself is kept rather than dropped. Losing the
                # entry because TTS is offline would be far worse.
                entry["audio"] = ""
                audio_rel = ""
                without_audio.append({
                    "word": record["word"],
                    "error": str(error)[:160],
                })

            vocabulary.append(entry)
            added.append({
                "word": record["word"],
                "number": record["number"],
                "audio": audio_rel,
                "hasAudio": bool(audio_rel),
            })

        if not dry_run and added:
            save_json(DATA_FILE, vocabulary, indent=2)

            audio_index = load_json(AUDIO_INDEX_FILE)
            for record in added:
                if record["audio"]:
                    audio_index[record["word"]] = record["audio"]
                else:
                    audio_index.pop(record["word"], None)
            save_json(AUDIO_INDEX_FILE, audio_index, indent=4)

    return jsonify({
        "success": True,
        "dryRun": dry_run,
        "added": added,
        "skipped": plan["skipped"],
        "repeated": plan["repeated"],
        "rejected": rejected,
        "withoutAudio": without_audio,
        "total": len(vocabulary) if not dry_run else None,
    }), 200


if __name__ == "__main__":
    from werkzeug.serving import make_server

    SERVER = make_server("127.0.0.1", 5000, app, threaded=True)
    print("PTE Trainer — Add Word server")
    print("Open http://127.0.0.1:5000/vocabulary.html")
    print("Stop it anytime from the page (⏻ button) — nothing is saved on stop.")
    try:
        SERVER.serve_forever()
    except KeyboardInterrupt:
        pass