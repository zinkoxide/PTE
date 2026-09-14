"""
==========================================
PTE Trainer
Vocabulary Audio Generator
==========================================

Reads Vocabulary data from JSON and
generates MP3 files using Microsoft Edge TTS.

This generator is completely independent
from the Repeat Sentence audio generator.
"""

import asyncio
import json
from pathlib import Path

import edge_tts


# ==========================================
# Configuration
# ==========================================

VOICE = "en-US-AndrewNeural"

PROJECT_ROOT = Path(__file__).resolve().parent.parent

DATA_FILE = (
    PROJECT_ROOT
    / "data"
    / "vocabulary.json"
)

AUDIO_DIRECTORY = (
    PROJECT_ROOT
    / "assets"
    / "audio"
    / "vocabulary"
)

AUDIO_INDEX_FILE = (
    PROJECT_ROOT
    / "data"
    / "vocabulary_audio_index.json"
)


# ==========================================
# Load Vocabulary
# ==========================================

def load_vocabulary():

    with DATA_FILE.open(
        "r",
        encoding="utf-8"
    ) as file:

        return json.load(file)


# ==========================================
# Load Audio Index
# ==========================================

def load_audio_index():

    if not AUDIO_INDEX_FILE.exists():

        return {}

    with AUDIO_INDEX_FILE.open(
        "r",
        encoding="utf-8"
    ) as file:

        return json.load(file)


# ==========================================
# Save Audio Index
# ==========================================

def save_audio_index(audio_index):

    with AUDIO_INDEX_FILE.open(
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            audio_index,
            file,
            ensure_ascii=False,
            indent=4
        )


# ==========================================
# Generate One Audio File
# ==========================================

async def generate_audio(
    text,
    output_file
):

    communicate = edge_tts.Communicate(
        text,
        VOICE
    )

    await communicate.save(
        str(output_file)
    )


# ==========================================
# Main Generator
# ==========================================

async def main():

    AUDIO_DIRECTORY.mkdir(
        parents=True,
        exist_ok=True
    )

    vocabulary = load_vocabulary()

    audio_index = load_audio_index()

    total = len(vocabulary)

    generated = 0
    skipped = 0
    failed = 0

    print()
    print("==========================================")
    print("PTE Trainer - Vocabulary Audio Generator")
    print("==========================================")
    print(f"Voice: {VOICE}")
    print(f"Words: {total}")
    print()

    for index, item in enumerate(
        vocabulary,
        start=1
    ):

        word = item["word"]

        # --------------------------------------
        # Create safe audio filename
        # --------------------------------------

        audio_name = (
            f"{index:03d}.mp3"
        )

        output_file = (
            AUDIO_DIRECTORY
            / audio_name
        )

        print(
            f"[{index}/{total}] "
            f"{word}"
        )

        # --------------------------------------
        # Skip existing files
        # --------------------------------------

        if output_file.exists():

            print(
                "    -> Already exists. Skipping."
            )

            audio_index[word] = (
                f"assets/audio/vocabulary/"
                f"{audio_name}"
            )

            skipped += 1

            continue

        # --------------------------------------
        # Generate
        # --------------------------------------

        try:

            await generate_audio(
                word,
                output_file
            )

            print(
                "    -> Generated successfully."
            )

            audio_index[word] = (
                f"assets/audio/vocabulary/"
                f"{audio_name}"
            )

            generated += 1

        except Exception as error:

            print(
                f"    -> FAILED: {error}"
            )

            failed += 1

    # ------------------------------------------
    # Save Index
    # ------------------------------------------

    save_audio_index(
        audio_index
    )

    # ==========================================
    # Summary
    # ==========================================

    print()
    print("==========================================")
    print("Generation Complete")
    print("==========================================")

    print(f"Generated : {generated}")
    print(f"Skipped   : {skipped}")
    print(f"Failed    : {failed}")
    print(f"Total     : {total}")
    print()

    print(
        f"Audio Index: "
        f"{AUDIO_INDEX_FILE}"
    )

    print()


# ==========================================
# Entry Point
# ==========================================

if __name__ == "__main__":

    asyncio.run(main())