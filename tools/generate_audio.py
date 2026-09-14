"""
==========================================
PTE Trainer
Automatic Audio Generator
==========================================

Reads Repeat Sentence data from JSON and
generates MP3 files using Microsoft Edge TTS.
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
    / "repeat_sentences.json"
)

AUDIO_DIRECTORY = (
    PROJECT_ROOT
    / "assets"
    / "audio"
)


# ==========================================
# Load Sentences
# ==========================================

def load_sentences():

    with DATA_FILE.open(
        "r",
        encoding="utf-8"
    ) as file:

        return json.load(file)


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

    sentences = load_sentences()

    total = len(sentences)

    generated = 0
    skipped = 0
    failed = 0

    print()
    print("==========================================")
    print("PTE Trainer - Audio Generator")
    print("==========================================")
    print(f"Voice: {VOICE}")
    print(f"Sentences: {total}")
    print()

    for index, sentence in enumerate(
        sentences,
        start=1
    ):

        sentence_id = sentence["id"]
        text = sentence["text"]

        audio_name = sentence.get(
            "audio",
            f"{sentence_id:04d}.mp3"
        )

        output_file = (
            AUDIO_DIRECTORY
            / audio_name
        )

        print(
            f"[{index}/{total}] "
            f"Sentence {sentence_id}"
        )

        # -------------------------------
        # Skip existing files
        # -------------------------------

        if output_file.exists():

            print(
                "    -> Already exists. Skipping."
            )

            skipped += 1

            continue

        # -------------------------------
        # Generate
        # -------------------------------

        try:

            await generate_audio(
                text,
                output_file
            )

            print(
                "    -> Generated successfully."
            )

            generated += 1

        except Exception as error:

            print(
                f"    -> FAILED: {error}"
            )

            failed += 1

    # ======================================
    # Summary
    # ======================================

    print()
    print("==========================================")
    print("Generation Complete")
    print("==========================================")

    print(f"Generated : {generated}")
    print(f"Skipped   : {skipped}")
    print(f"Failed    : {failed}")
    print(f"Total     : {total}")
    print()


# ==========================================
# Entry Point
# ==========================================

if __name__ == "__main__":

    asyncio.run(main())