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
    'audio_index.json',
    'vocabulary_audio_index.json',
]:
    path = root / file_name
    if not path.exists():
        continue
    with path.open('r', encoding='utf-8') as handle:
        json.load(handle)
    print(f'Validated {path}')

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