#!/usr/bin/env bash
# PTE Trainer — Add Word server (on-demand only)
# Run when you want to add new words. Closable later from the page
# (⏻ button) — closing never saves anything.
set -e
cd "$(dirname "$0")/.."
PYTHON="$HOME/Desktop/PTE-Trainer/.venv/bin/python"
if [ ! -x "$PYTHON" ]; then
  echo "VENV not found: $PYTHON"
  exit 1
fi
echo "Starting PTE Add-Word server at http://127.0.0.1:5000/vocabulary.html"
sleep 1
nohup "$PYTHON" app.py > /tmp/opencode/pte-addword.log 2>&1 < /dev/null &
sleep 2
if command -v xdg-open > /dev/null 2>&1; then
  xdg-open "http://127.0.0.1:5000/vocabulary.html" > /dev/null 2>&1 || true
fi
echo "Server started (PID $!). Stop it from the page (⏻) or with: pkill -f '[a]pp.py'"
exit 0