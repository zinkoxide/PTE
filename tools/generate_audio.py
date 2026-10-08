"""
==========================================
PTE Trainer
Task Audio Generator (Edge TTS)
==========================================

Speaks the text of the timed spoken tasks and
writes one MP3 per item:

  * Repeat Sentence  -> assets/audio/<id>.mp3
  * Read Aloud       -> assets/audio/read-aloud/<id>.mp3

Two tasks share this tool because they share
everything that matters: one voice, one file
naming rule, one "skip what already exists"
rule. A missing MP3 never blocks the page --
the JavaScript falls back to the browser voice,
so a generation failure is a nicety lost, not a
broken task.

    python3 tools/generate_audio.py              # every dataset
    python3 tools/generate_audio.py --only read-aloud
    python3 tools/generate_audio.py --force      # rebuild existing files
"""

import argparse
import asyncio
import json
from pathlib import Path

import edge_tts


# ==========================================
# Configuration
# ==========================================

VOICE = "en-US-AndrewNeural"

PROJECT_ROOT = Path(__file__).resolve().parent.parent

AUDIO_DIRECTORY = (
    PROJECT_ROOT
    / "assets"
    / "audio"
)

# ==========================================
# Datasets
# ==========================================
#
# `file_name(item)` decides the MP3 name, so the
# browser can rebuild the path from the item id
# alone and never has to read the JSON to find a
# file. `directory` keeps the spoken tasks apart:
# both are numbered, and sharing one folder would
# let a repeat sentence overwrite a Read Aloud
# text of the same number.

DATASETS = {
    "repeat": {
        "label": "Repeat Sentence",
        "data": PROJECT_ROOT / "data" / "repeat_sentences.json",
        "directory": AUDIO_DIRECTORY,
        "file_name": lambda item: f"{int(item['id']):04d}.mp3",
    },
    "read-aloud": {
        "label": "Read Aloud",
        "data": PROJECT_ROOT / "data" / "read_aloud.json",
        "directory": AUDIO_DIRECTORY / "read-aloud",
        "file_name": lambda item: f"{item['id']}.mp3",
    },
}


# ==========================================
# Helpers
# ==========================================

def load_items(data_file):

    with data_file.open(
        "r",
        encoding="utf-8"
    ) as file:

        return json.load(file)


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
# One Dataset
# ==========================================

async def generate_dataset(
    name,
    config,
    force=False
):

    dataset_label = config["label"]
    data_file = config["data"]
    directory = config["directory"]
    file_name_of = config["file_name"]

    if not data_file.exists():
        print(
            f"[{dataset_label}] "
            f"no data file at {data_file} -- skipped."
        )
        return None

    directory.mkdir(
        parents=True,
        exist_ok=True
    )

    items = load_items(data_file)

    total = len(items)

    generated = 0
    skipped = 0
    failed = 0

    print()
    print("==========================================")
    print(f"PTE Trainer - {dataset_label} Audio")
    print(f"Voice: {VOICE}")
    print(f"Folder: {directory}")
    print(f"Items: {total}")
    print()

    for index, item in enumerate(
        items,
        start=1
    ):

        item_id = item.get("id", index)
        text = item.get("text", "")

        if not text.strip():
            print(
                f"[{index}/{total}] "
                f"Item {item_id} has no text -- skipped."
            )
            continue

        output_file = (
            directory
            / file_name_of(item)
        )

        print(
            f"[{index}/{total}] "
            f"Item {item_id}"
        )

        # -------------------------------
        # Skip existing files
        # -------------------------------

        if output_file.exists() and not force:
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

    print()
    print(f"{dataset_label}: generated {generated}, "
          f"skipped {skipped}, failed {failed}, total {total}")

    return {
        "generated": generated,
        "skipped": skipped,
        "failed": failed,
        "total": total,
    }


# ==========================================
# Main Generator
# ==========================================

async def main():

    parser = argparse.ArgumentParser(
        description="Generate the task audio with Edge TTS."
    )
    parser.add_argument(
        "--only",
        choices=sorted(DATASETS),
        action="append",
        help="Only this dataset (repeat it for several)."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Rebuild files that already exist."
    )
    args = parser.parse_args()

    chosen = args.only or sorted(DATASETS)

    summaries = {}

    for name in chosen:
        summaries[name] = await generate_dataset(
            name,
            DATASETS[name],
            force=args.force
        )

    # ======================================
    # Summary
    # ======================================

    print()
    print("==========================================")
    print("Generation Complete")
    print("==========================================")

    for name in chosen:
        summary = summaries.get(name)
        if not summary:
            continue
        print(
            f"{DATASETS[name]['label']:<16} "
            f"generated {summary['generated']}, "
            f"skipped {summary['skipped']}, "
            f"failed {summary['failed']}, "
            f"total {summary['total']}"
        )

    print()


# ==========================================
# Entry Point
# ==========================================

if __name__ == "__main__":

    asyncio.run(main())