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

echo "→ Syncing intake forms..."
cp "$REPO_ROOT/projects/zyris/intake/intake-questionnaire-zyris.html"       "$PUBLIC/intake/zyris.html"
cp "$REPO_ROOT/projects/peerless/intake/intake-questionnaire-peerless.html" "$PUBLIC/intake/peerless.html"

echo "→ Syncing proposals..."
cp "$REPO_ROOT/projects/zyris/intake/proposal-zyris.html"                   "$PUBLIC/proposal/zyris.html"
cp "$REPO_ROOT/projects/peerless/intake/proposal-peerless.html"             "$PUBLIC/proposal/peerless.html"
cp "$REPO_ROOT/projects/mrn-healthcare/intake/proposal-mrn-healthcare.html" "$PUBLIC/proposal/mrn-healthcare.html"

echo "→ Installing function dependencies..."
cd "$SCRIPT_DIR/functions" && npm install --silent

echo "→ Deploying to Firebase..."
cd "$SCRIPT_DIR" && npx firebase-tools deploy --project dataskateclients

rm -f "$SA_KEY_FILE"
echo ""
echo "Done. Portal: https://dataskateclients.web.app"
