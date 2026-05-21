#!/bin/sh
# Lint any staged .html files before commit.
# Runs: htmlhint → stylelint → DS semantic checks (lint-html.js)
# Installed automatically by `npm install` (via the "prepare" script).
staged=$(git diff --cached --name-only --diff-filter=ACM | grep '\.html$')
if [ -z "$staged" ]; then
  exit 0
fi
ROOT="$(git rev-parse --show-toplevel)"
fail=0
for f in $staged; do
  npx --prefix "$ROOT" htmlhint "$ROOT/$f" --config "$ROOT/.htmlhintrc" || fail=1
  npx --prefix "$ROOT" stylelint "$ROOT/$f" || fail=1
  node "$ROOT/commons/branding/lint-html.js" "$ROOT/$f" || fail=1
done
if [ $fail -ne 0 ]; then
  echo ""
  echo "HTML lint failed — commit blocked. Fix violations above, then re-stage."
  exit 1
fi
