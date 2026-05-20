#!/usr/bin/env bash
# deploy-and-test.sh <file-path>
#
# Called by the PostToolUse hook whenever Claude writes an intake HTML file.
# Extracts the client slug from the path, runs update-firebase.js (upload +
# seed Firestore + deploy), then hits the live URLs to verify they return 200.
#
# Usage (direct):   bash scripts/deploy-and-test.sh projects/homage/intake/proposal-homage.html
# Usage (hook):     same — hook passes the written file path

set -euo pipefail

FILE_PATH="${1:-}"

if [ -z "$FILE_PATH" ]; then
  echo "Usage: deploy-and-test.sh <file-path>"
  exit 1
fi

# Extract slug from path like: .../projects/{slug}/intake/...
SLUG=$(echo "$FILE_PATH" | sed -n 's|.*projects/\([^/]*\)/intake/.*|\1|p')

if [ -z "$SLUG" ]; then
  echo "Could not extract slug from path: $FILE_PATH"
  exit 0
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORTAL="https://dataskateclients.web.app"

echo ""
echo "=== Auto-deploy: $SLUG ==="
node "$ROOT/scripts/update-firebase.js" "$SLUG"

echo ""
echo "=== Testing live URLs ==="

pass=0
fail=0

test_url() {
  local label="$1"
  local url="$2"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$url" 2>/dev/null || echo "000")
  if [ "$status" = "200" ]; then
    echo "  ✓  $label — 200 OK"
    pass=$((pass + 1))
  else
    echo "  ✗  $label — $status  ($url)"
    fail=$((fail + 1))
  fi
}

test_url "Intake"    "$PORTAL/intake/$SLUG.html"
test_url "Proposal"  "$PORTAL/proposal/$SLUG.html"
test_url "Pitch kit" "$PORTAL/internal/$SLUG.html"

echo ""
if [ "$fail" -eq 0 ]; then
  echo "  All $pass URLs live ✓"
else
  echo "  $pass passed / $fail failed — check URLs above"
fi
