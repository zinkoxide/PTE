"""
==========================================
PTE Trainer
Vocabulary import planning
==========================================

The pure part of a CSV import: given the
current bank and a list of candidate words,
decide what is new, what already exists and
what is incomplete — and number the survivors
on from the end of the bank.

Kept apart from `app.py` on purpose: this
module imports nothing, so it can be tested
without Flask or Edge TTS installed, and the
same rules can be reused by any future entry
point. `app.py` still owns writing the file
and generating the audio.
==========================================
"""

MAX_IMPORT_WORDS = 200


def normalize(word):
    return str(word or "").strip().lower()


def existing_words_lower(vocabulary):
    return {normalize(item.get("word")) for item in vocabulary or []}


def number_from_path(path):
    """
    The sequence number inside an audio path such as
    `assets/audio/vocabulary/1005.mp3`.

    Only the stem is scanned: the "3" in ".mp3" is not a digit of the number,
    which is exactly the trap that produced 10054 once.
    """
    stem = str(path or "").rsplit("/", 1)[-1].rsplit(".", 1)[0]
    digits = "".join(char for char in stem if char.isdigit())
    return int(digits) if digits else 0


def next_free_number(vocabulary, audio_index=None):
    """
    The next sequential number for a new word.

    `len(vocabulary) + 1` is not enough: deleting a word leaves a hole, and
    the next addition would overwrite an existing audio file. The highest
    number actually in use wins instead.
    """
    highest = len(vocabulary or [])

    for path in (audio_index or {}).values():
        highest = max(highest, number_from_path(path))

    for item in vocabulary or []:
        highest = max(highest, number_from_path(item.get("audio")))

    return highest + 1


def plan_import(vocabulary, words, validate_entry, max_words=MAX_IMPORT_WORDS,
                audio_index=None):
    """
    Work out what an import would do, without touching anything.

    `validate_entry` is the caller's own validator (the same one the
    single-word form uses) so both entry points enforce identical rules.

    Returns a dict with:
      added     — validated new entries, each carrying its `number`/`audio`
      skipped   — words the bank already has
      repeated  — the same word twice in this one request
      rejected  — incomplete rows with the reasons
      errors    — problems with the request itself

    `repeated` is kept apart from `skipped` on purpose: it mirrors the
    browser preview, so the numbers the learner reads before saving are the
    same numbers they read after it.
    """
    result = {"added": [], "skipped": [], "repeated": [], "rejected": [], "errors": []}

    if not isinstance(words, list) or not words:
        result["errors"].append("لا توجد كلمات للاستيراد.")
        return result

    if len(words) > max_words:
        result["errors"].append(f"الحد الأقصى {max_words} كلمة في المرة الواحدة.")
        return result

    bank = existing_words_lower(vocabulary)
    known = set(bank)
    next_number = next_free_number(vocabulary, audio_index)

    for item in words:
        entry, errors = validate_entry(item if isinstance(item, dict) else {})

        if errors:
            word = str((item or {}).get("word", "")).strip() or "—"
            result["rejected"].append({"word": word, "errors": list(errors.values())})
            continue

        word = entry["word"]
        key = normalize(word)

        if key in bank:
            result["skipped"].append(word)
            continue
        if key in known:
            result["repeated"].append(word)
            continue

        number = next_number
        next_number += 1

        entry["audio"] = f"assets/audio/vocabulary/{number:03d}.mp3"
        known.add(key)
        result["added"].append({"word": word, "number": number, "audio": entry["audio"], "entry": entry})

    return result
