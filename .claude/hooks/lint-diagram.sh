#!/bin/sh
# PostToolUse hook — lint any .mmd file written or edited by Claude.
# Receives tool input as JSON on stdin: { "tool_input": { "file_path": "..." } }
input=$(cat)
file=$(printf '%s' "$input" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try { process.stdout.write(JSON.parse(d).tool_input.file_path||'') } catch {}
  });
")
if [ -z "$file" ] || ! echo "$file" | grep -q '\.mmd$'; then
  exit 0
fi
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
node "$ROOT/commons/branding/lint-diagram.js" "$file"
