#!/usr/bin/env bash
# DataSkate Portal — deploy script
# Uses FIREBASE_SA_KEY codespace secret (JSON content) for auth — no login token needed.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PUBLIC="$SCRIPT_DIR/public"
SA_KEY_FILE="/tmp/firebase-sa.json"

# Write service account key from codespace secret
if [ -z "$FIREBASE_SA_KEY" ]; then
  echo "ERROR: FIREBASE_SA_KEY codespace secret is not set."
  echo "Go to GitHub repo → Settings → Secrets → Codespaces → add FIREBASE_SA_KEY"
  exit 1
fi
echo "$FIREBASE_SA_KEY" > "$SA_KEY_FILE"
export GOOGLE_APPLICATION_CREDENTIALS="$SA_KEY_FILE"

mkdir -p "$PUBLIC/intake" "$PUBLIC/proposal"

echo "→ Syncing intake forms..."
for html in "$REPO_ROOT"/projects/*/intake/intake-questionnaire-*.html; do
  [ -f "$html" ] || continue
  filename="$(basename "$html")"
  slug="${filename#intake-questionnaire-}"
  slug="${slug%.html}"
  cp "$html" "$PUBLIC/intake/${slug}.html"
  echo "   intake/${slug}.html"
done

echo "→ Syncing proposals..."
for html in "$REPO_ROOT"/projects/*/intake/proposal-*.html; do
  [ -f "$html" ] || continue
  filename="$(basename "$html")"
  slug="${filename#proposal-}"
  slug="${slug%.html}"
  cp "$html" "$PUBLIC/proposal/${slug}.html"
  echo "   proposal/${slug}.html"
done

echo "→ Installing function dependencies..."
cd "$SCRIPT_DIR/functions" && npm install --silent

echo "→ Deploying to Firebase..."
cd "$SCRIPT_DIR" && npx firebase-tools deploy --only hosting --project dataskateclients --force

rm -f "$SA_KEY_FILE"
echo ""
echo "Done. Portal: https://dataskateclients.web.app"
