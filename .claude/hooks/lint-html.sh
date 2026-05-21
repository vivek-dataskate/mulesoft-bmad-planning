#!/bin/sh
# PostToolUse hook — lint any .html file written or edited by Claude.
# Receives tool input as JSON on stdin: { "tool_input": { "file_path": "..." } }
# Runs: htmlhint → stylelint → DS semantic checks (lint-html.js)
# a11y (axe) is NOT run on every save — too slow. Run manually: npm run lint:a11y
input=$(cat)
file=$(printf '%s' "$input" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try { process.stdout.write(JSON.parse(d).tool_input.file_path||'') } catch {}
  });
")
if [ -z "$file" ] || ! echo "$file" | grep -q '\.html$'; then
  exit 0
fi
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
fail=0

npx --prefix "$ROOT" htmlhint "$file" --config "$ROOT/.htmlhintrc" || fail=1
npx --prefix "$ROOT" stylelint "$file" || fail=1
node "$ROOT/commons/branding/lint-html.js" "$file" || fail=1

exit $fail
