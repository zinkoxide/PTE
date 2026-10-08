#!/usr/bin/env python3
"""Validate the JSON data files used by the trainer."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent / 'data'
ok = True

for file_name in [
    'repeat_sentences.json',
    'random_sentences.json',
    'vocabulary.json',
    'vocabulary_audio_index.json',
]:
    path = root / file_name
    if not path.exists():
        continue
    with path.open('r', encoding='utf-8') as handle:
        json.load(handle)
    print(f'Validated {path}')


# ==========================================
# Vocabulary bank audit
#
# The files above only had to parse. This checks the content itself, because a
# hand-edited or imported word can be structurally valid and still be wrong:
# no audio on disk, a level outside the allowed set, a duplicate spelling, or
# a row the audio index knows about but the bank does not.
# ==========================================

ALLOWED_LEVELS = {'A1', 'A2', 'B1', 'B2', 'C1', 'C2'}
ALLOWED_FREQUENCIES = {'2', '3', '4', '5'}
ALLOWED_PARTS = {
    'Noun', 'Verb', 'Adjective', 'Adverb', 'Pronoun',
    'Conjunction', 'Preposition', 'Determiner',
}
REQUIRED_TEXT = ('pronunciation', 'meaningEN', 'meaningAR')
REQUIRED_LISTS = ('synonyms', 'collocations', 'examples')

project = root.parent
vocabulary_path = root / 'vocabulary.json'
audio_index_path = root / 'vocabulary_audio_index.json'

if vocabulary_path.exists():
    problems = []
    with vocabulary_path.open('r', encoding='utf-8') as handle:
        bank = json.load(handle)

    audio_index = {}
    if audio_index_path.exists():
        with audio_index_path.open('r', encoding='utf-8') as handle:
            audio_index = json.load(handle)

    seen = {}
    with_audio = 0

    for position, entry in enumerate(bank):
        word = str(entry.get('word', '')).strip()
        label = word or f'#{position + 1}'

        if not word:
            problems.append(f"entry #{position + 1}: no word")
            continue

        key = word.lower()
        if key in seen:
            problems.append(f"'{word}': duplicate of entry #{seen[key] + 1}")
        else:
            seen[key] = position

        for field in REQUIRED_TEXT:
            if not str(entry.get(field, '')).strip():
                problems.append(f"'{word}': missing {field}")

        # The bank stores compound labels such as "Noun; Verb", so each part
        # is checked on its own.
        parts = [p.strip() for p in str(entry.get('partOfSpeech', '')).replace(',', ';').split(';')]
        parts = [p for p in parts if p]
        if not parts:
            problems.append(f"'{word}': no part of speech")
        for part in parts:
            if part not in ALLOWED_PARTS:
                problems.append(f"'{word}': partOfSpeech '{part}' is not allowed")
        if entry.get('cefrLevel') not in ALLOWED_LEVELS:
            problems.append(f"'{word}': cefrLevel '{entry.get('cefrLevel')}' is not allowed")
        if str(entry.get('frequency', '')) not in ALLOWED_FREQUENCIES:
            problems.append(f"'{word}': frequency '{entry.get('frequency')}' is not allowed")

        for field in REQUIRED_LISTS:
            values = entry.get(field)
            if not isinstance(values, list) or not any(str(v).strip() for v in values):
                problems.append(f"'{word}': {field} is empty")

        # The committed bank leaves the entry's own `audio` field empty and
        # relies on the index, while freshly added words carry both. Either is
        # fine as long as exactly one of them resolves to a file on disk.
        own_audio = str(entry.get('audio', '')).strip()
        indexed_audio = str(audio_index.get(word, '')).strip()

        if own_audio and indexed_audio and own_audio != indexed_audio:
            problems.append(
                f"'{word}': index says {indexed_audio} but the entry says {own_audio}"
            )

        resolved = own_audio or indexed_audio
        if not resolved:
            problems.append(f"'{word}': no audio in the entry or the index")
        elif not (project / resolved).exists():
            problems.append(f"'{word}': audio file missing ({resolved})")
        else:
            with_audio += 1

    for word, path in audio_index.items():
        if word.lower() not in seen:
            problems.append(f"audio index has '{word}' but the bank does not")

    numbers = set()
    for entry in bank:
        word = entry.get('word', '')
        # Use the resolved path: the entry's own field is empty for the
        # committed bank, which keeps its paths in the index.
        audio = str(entry.get('audio') or audio_index.get(word, ''))
        stem = audio.rsplit('/', 1)[-1].rsplit('.', 1)[0]
        digits = ''.join(ch for ch in stem if ch.isdigit())
        if digits:
            if digits in numbers:
                problems.append(f"audio number {int(digits)} is used twice")
            numbers.add(digits)

    print(
        f'vocabulary: {len(bank)} words, {with_audio} with audio on disk, '
        f'{len(audio_index)} index rows, {len(numbers)} distinct audio numbers'
    )

    if problems:
        ok = False
        print(f'vocabulary problems: {len(problems)}')
        for message in problems[:40]:
            print(f'  - {message}')
        if len(problems) > 40:
            print(f'  ... and {len(problems) - 40} more')
    else:
        print('vocabulary: every entry is complete and consistent.')


# ==========================================
# Task data audit
# ==========================================

def audit_simple_list(path, required_fields, label):
    global ok
    if not path.exists():
        return
    with path.open('r', encoding='utf-8') as handle:
        items = json.load(handle)

    found = []
    identifiers = set()
    for position, item in enumerate(items):
        name = item.get('id') or f'#{position + 1}'
        for field in required_fields:
            if not item.get(field):
                found.append(f"{label} '{name}': missing {field}")
        if item.get('id') in identifiers:
            found.append(f"{label}: duplicate id '{item['id']}'")
        identifiers.add(item.get('id'))

    print(f'{label}: {len(items)} items')
    if found:
        ok = False
        for message in found[:20]:
            print(f'  - {message}')


audit_simple_list(
    root / 'read_aloud.json',
    ('text',),
    'read_aloud',
)
audit_simple_list(
    root / 'swt.json',
    ('title', 'passage', 'mainIdea', 'keyPoints', 'reference'),
    'swt',
)

grammar_dir = root / 'grammar'
grammar_files = (
    sorted(p for p in grammar_dir.glob('*.json') if p.name != 'manifest.json')
    if grammar_dir.exists() else []
)
lesson_fields = [
    'id', 'title', 'category', 'icon', 'description', 'explanation',
    'rules', 'examples', 'commonMistakes', 'quiz',
]
required = []
seen_ids = set()
mcq = tf = 0
tf_true = tf_false = 0
no_markers = 0
all_lessons = []
MCQ_TYPES = ('mcq', 'multiple_choice', 'multiple-choice')
TF_TYPES = ('tf', 'true_false', 'true-false')
for grammar_path in grammar_files:
    with grammar_path.open('r', encoding='utf-8') as handle:
        lessons = json.load(handle)
    all_lessons.extend(lessons)
    for lesson in lessons:
        for field in lesson_fields:
            if field not in lesson:
                required.append(f"lesson '{lesson.get('id')}' missing '{field}'")
        if lesson['id'] in seen_ids:
            print(f"NON-UNIQUE lesson id: {lesson['id']}")
            ok = False
        seen_ids.add(lesson['id'])
        markers = lesson.get('markers')
        if markers is not None:
            if not isinstance(markers, list) or not all(
                isinstance(m, str) and m.strip() for m in markers
            ):
                print(f"BAD markers in '{lesson['id']}' (want list of strings)")
                ok = False
        else:
            no_markers += 1
        for idx, item in enumerate(lesson['quiz']):
            qtype = item['type']
            if qtype not in MCQ_TYPES + TF_TYPES:
                print(f"BAD quiz type in {lesson['id']}[{idx}]: {qtype}")
                ok = False
            if 'why' not in item:
                print(f"MISSING why in {lesson['id']}[{idx}]")
                ok = False
            options = item.get('options')
            if qtype in MCQ_TYPES:
                mcq += 1
                if not isinstance(options, list) or len(options) != 4:
                    print(f"mcq not 4 options in {lesson['id']}[{idx}]")
                    ok = False
                elif len(set(options)) != 4:
                    print(f"duplicate options in {lesson['id']}[{idx}]")
                    ok = False
                answer = item.get('answer')
                correct = item.get('correct')
                idx_from_answer = (
                    answer if isinstance(answer, int) else
                    (options.index(answer) if isinstance(answer, str) and answer in (options or []) else None)
                )
                idx_from_correct = (
                    correct if isinstance(correct, int) else
                    (options.index(correct) if isinstance(correct, str) and correct in (options or []) else None)
                )
                if idx_from_answer is None and idx_from_correct is None:
                    print(f"no valid answer/correct in {lesson['id']}[{idx}]")
                    ok = False
                elif (idx_from_answer is not None and idx_from_correct is not None
                        and idx_from_answer != idx_from_correct):
                    print(f"answer/correct mismatch in {lesson['id']}[{idx}] ({answer!r} vs {correct!r})")
                    ok = False
            elif qtype in TF_TYPES:
                tf += 1
                correct = item.get('correct')
                answer = item.get('answer')
                if not (
                    isinstance(correct, bool)
                    or correct in ('True', 'False')
                    or answer in ('True', 'False')
                ):
                    print(f"tf/true_false answer not True/False in {lesson['id']}[{idx}]")
                    ok = False
                is_true = correct is True or correct == 'True' or answer == 'True'
                if is_true:
                    tf_true += 1
                else:
                    tf_false += 1
if required:
    for msg in required:
        print(msg)
    ok = False
if not 0.3 <= tf_true / max(tf, 1) <= 0.7:
    print(f'TF imbalance warning: {tf_true} true vs {tf_false} false')
if no_markers:
    print(f'markers missing on {no_markers} lessons (optional)')
print(
    f'grammar: {len(all_lessons)} lessons across {len(grammar_files)} file(s), '
    f'{mcq} mcq, {tf} tf, {tf_true} true / {tf_false} false'
)
for grammar_path in grammar_files:
    print(f'  {grammar_path.name}')
if not ok:
    sys.exit(1)

print('All grammar checks passed.' if ok else 'Grammar validation FAILED.')