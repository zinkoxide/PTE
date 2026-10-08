# ==========================================
#    PTE Trainer — import planning tests
#    Run: python3 tools/tests/test_import_plan.py
# ==========================================

"""Dependency-free tests for tools/import_plan.py (no Flask, no Edge TTS)."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import import_plan  # noqa: E402

passed = 0
failed = 0


def test(name, fn):
    global passed, failed
    try:
        fn()
        passed += 1
        print(f"OK: {name}")
    except AssertionError as error:
        failed += 1
        print(f"FAIL: {name} — {error}")
    except Exception as error:  # noqa: BLE001
        failed += 1
        print(f"FAIL: {name} — {error}")


def validate_entry_strict(payload):
    """A stand-in for app.validate_entry: the word and both meanings matter."""
    errors = {}
    word = str(payload.get("word", "")).strip()
    if not word:
        errors["word"] = "missing"
    if not str(payload.get("meaningEN", "")).strip():
        errors["meaningEN"] = "missing"
    if not str(payload.get("meaningAR", "")).strip():
        errors["meaningAR"] = "missing"
    if errors:
        return {}, errors
    return {"word": word, "meaningEN": payload["meaningEN"], "meaningAR": payload["meaningAR"]}, {}


def good(word):
    return {"word": word, "meaningEN": f"about {word}", "meaningAR": f"عن {word}"}


BANK = [{"word": "Adopt"}, {"word": "Abandon"}, {"word": "Develop"}]


def test_empty_request_is_refused():
    plan = import_plan.plan_import(BANK, [], validate_entry_strict)
    assert plan["errors"], "an empty request must be refused"


def test_a_non_list_is_refused():
    plan = import_plan.plan_import(BANK, "Adopt", validate_entry_strict)
    assert plan["errors"], "a string must be refused"


def test_the_batch_size_is_capped():
    words = [good(f"Word{i}") for i in range(201)]
    plan = import_plan.plan_import(BANK, words, validate_entry_strict)
    assert plan["errors"], "201 words must be refused"
    assert "200" in plan["errors"][0], "the cap must be named in the message"


def test_existing_words_are_skipped():
    plan = import_plan.plan_import(BANK, [good("Adopt"), good("Zorbex")], validate_entry_strict)
    assert plan["skipped"] == ["Adopt"], f"expected Adopt skipped, got {plan['skipped']}"
    assert [record["word"] for record in plan["added"]] == ["Zorbex"], "only the new word may be added"


def test_duplicates_are_case_insensitive_and_trimmed():
    plan = import_plan.plan_import(BANK, [good(" adopt "), good("ADOPT")], validate_entry_strict)
    assert len(plan["skipped"]) == 2, f"expected both spellings skipped, got {plan['skipped']}"
    assert not plan["added"], "nothing may be added"


def test_the_same_word_twice_in_one_request_is_collapsed():
    plan = import_plan.plan_import(BANK, [good("Zorbex"), good("zorbex")], validate_entry_strict)
    assert len(plan["added"]) == 1, "only the first occurrence may be added"
    assert not plan["skipped"], "the repeat is neither added nor reported as already present"


def test_numbering_continues_from_the_end_of_the_bank():
    plan = import_plan.plan_import(BANK, [good("Alpha"), good("Beta")], validate_entry_strict)
    numbers = [record["number"] for record in plan["added"]]
    assert numbers == [4, 5], f"expected 4 and 5, got {numbers}"
    assert plan["added"][0]["audio"].endswith("004.mp3"), "the audio path must follow the number"


def test_numbering_reaches_1002_on_the_real_bank():
    bank = [{"word": f"W{i}"} for i in range(1001)]
    plan = import_plan.plan_import(bank, [good("Newest")], validate_entry_strict)
    assert plan["added"][0]["number"] == 1002, f"expected 1002, got {plan['added'][0]['number']}"
    assert plan["added"][0]["audio"] == "assets/audio/vocabulary/1002.mp3", "the audio path must be 1002"


def test_incomplete_rows_are_rejected_with_a_reason():
    plan = import_plan.plan_import(BANK, [{"word": "Broken", "meaningEN": "only english"}], validate_entry_strict)
    assert not plan["added"], "an incomplete row must not be added"
    assert plan["rejected"], "an incomplete row must be reported"
    assert plan["rejected"][0]["word"] == "Broken", "the rejection must name the word"
    assert plan["rejected"][0]["errors"], "the rejection must carry a reason"


def test_a_row_without_a_word_is_reported_not_crashed():
    plan = import_plan.plan_import(BANK, [{"meaningEN": "x", "meaningAR": "y"}], validate_entry_strict)
    assert plan["rejected"], "a wordless row must be rejected"
    assert plan["rejected"][0]["word"] == "—", "a missing word must be shown as a dash"


def test_the_bank_is_never_mutated():
    before = [dict(entry) for entry in BANK]
    import_plan.plan_import(BANK, [good("Alpha")], validate_entry_strict)
    assert BANK == before, "planning must not touch the bank"


def test_a_mixed_request_splits_into_three_buckets():
    plan = import_plan.plan_import(
        BANK,
        [good("Adopt"), good("Alpha"), good("alpha"), {"word": "Broken", "meaningEN": "x"}],
        validate_entry_strict,
    )
    assert plan["skipped"] == ["Adopt"], f"expected one skip, got {plan['skipped']}"
    assert [record["word"] for record in plan["added"]] == ["Alpha"], "one new word expected"
    assert len(plan["rejected"]) == 1, "one rejection expected"


def test_an_empty_bank_starts_numbering_at_one():
    plan = import_plan.plan_import([], [good("First"), good("Second")], validate_entry_strict)
    assert [record["number"] for record in plan["added"]] == [1, 2], "numbering must start at 1"
    assert plan["added"][0]["audio"].endswith("001.mp3"), "the first audio file must be padded"


test("empty request is refused", test_empty_request_is_refused)
test("a non-list is refused", test_a_non_list_is_refused)
test("the batch size is capped", test_the_batch_size_is_capped)
test("existing words are skipped", test_existing_words_are_skipped)
test("duplicates are case-insensitive and trimmed", test_duplicates_are_case_insensitive_and_trimmed)
test("the same word twice in one request is collapsed", test_the_same_word_twice_in_one_request_is_collapsed)
test("numbering continues from the end of the bank", test_numbering_continues_from_the_end_of_the_bank)
test("numbering reaches 1002 on the real bank", test_numbering_reaches_1002_on_the_real_bank)
test("incomplete rows are rejected with a reason", test_incomplete_rows_are_rejected_with_a_reason)
test("a row without a word is reported, not crashed", test_a_row_without_a_word_is_reported_not_crashed)
test("the bank is never mutated", test_the_bank_is_never_mutated)
test("a mixed request splits into three buckets", test_a_mixed_request_splits_into_three_buckets)
test("an empty bank starts numbering at one", test_an_empty_bank_starts_numbering_at_one)

print(f"RESULT: {passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
