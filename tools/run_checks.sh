#!/usr/bin/env bash
# PTE Trainer — run all checks: data validation, JS syntax, CSS balance, unit tests.
set -u

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

fail=0

step() { printf '\n\033[1;34m== %s ==\033[0m\n' "$1"; }
note() { printf '\033[0;32m%s\033[0m\n' "$1"; }
err()  { printf '\033[0;31m%s\033[0m\n' "$1"; fail=1; }

# ----- Python interpreter (prefer the PTE-Trainer venv if present) -----
PY="${PYTHON:-}"
if [ -z "$PY" ]; then
  for cand in /home/waled/Desktop/PTE-Trainer/.venv/bin/python python3 python; do
    if command -v "$cand" >/dev/null 2>&1; then PY="$cand"; break; fi
  done
fi

step "1/5  Data validation"
if [ -n "$PY" ]; then
  if "$PY" tools/validate_json.py; then note "validator OK"; else err "validator FAILED"; fi
else
  err "no python interpreter found — skipping validator"
fi

step "2/5  JS syntax (node --check)"
for f in js/*.js; do
  if ! node --check "$f" 2> /tmp/pte_check.err; then
    err "syntax failed: $f"; sed 's/^/    /' /tmp/pte_check.err | head -3
  fi
done
[ "$fail" -eq 0 ] || exit 1
note "all JS files parse cleanly"

step "3/5  CSS brace balance (all css/*.css)"
for f in css/*.css; do
  opens=$(grep -c '{' "$f")
  closes=$(grep -c '}' "$f")
  if [ "$opens" -ne "$closes" ]; then
    err "CSS unbalanced: $f ($opens { vs $closes })"
  fi
done
[ "$fail" -eq 0 ] && note "CSS balanced across all page files"

step "4/5  Harness: grammar data"
if node tools/tests/test-grammar.mjs; then :; else err "grammar harness FAILED"; fi

step "5/5  Harness: vocabulary SRS + pronunciation + pages"
if node tools/tests/test-storage.mjs; then :; else err "storage harness FAILED"; fi
if node tools/tests/test-pronounce.mjs; then :; else err "pronounce harness FAILED"; fi
if node tools/tests/test-html.mjs; then :; else err "html harness FAILED"; fi
if node tools/tests/test-swt.mjs; then :; else err "swt harness FAILED"; fi

if [ "$fail" -eq 0 ]; then
  note "ALL CHECKS PASSED"
else
  err "SOME CHECKS FAILED"
  exit 1
fi