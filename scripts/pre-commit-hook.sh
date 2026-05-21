#!/bin/sh
# Lint any staged .html files before commit.
# Calls commons/branding/lint-html.js which runs htmlhint + DataSkate checks.
# Installed automatically by `npm install` (via the "prepare" script).
staged=$(git diff --cached --name-only --diff-filter=ACM | grep '\.html$')
if [ -z "$staged" ]; then
  exit 0
fi
ROOT="$(git rev-parse --show-toplevel)"
fail=0
for f in $staged; do
  node "$ROOT/commons/branding/lint-html.js" "$ROOT/$f" || fail=1
done
if [ $fail -ne 0 ]; then
  echo ""
  echo "HTML lint failed — commit blocked. Fix violations above, then re-stage."
  exit 1
fi
