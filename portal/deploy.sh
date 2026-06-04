#!/usr/bin/env bash
# DataSkate Portal — deploy a single project or shared resource.
# Usage:
#   ./portal/deploy.sh <client-slug> [proposal|intake|corporate-brief|integration-deck|sow]
#   ./portal/deploy.sh architect-guide
#   ./portal/deploy.sh pricing-model
#   ./portal/deploy.sh firestore-rules   ← deploy Firestore security rules only
set -e

SLUG="$1"
TEMPLATE="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PUBLIC="$SCRIPT_DIR/public"

if [ -z "$SLUG" ]; then
  echo "ERROR: slug or resource name required."
  echo ""
  echo "Usage:"
  echo "  ./portal/deploy.sh <client-slug>                                        # all templates"
  echo "  ./portal/deploy.sh <client-slug> proposal|intake|corporate-brief|integration-deck"
  echo "  ./portal/deploy.sh architect-guide"
  echo "  ./portal/deploy.sh pricing-model"
  exit 1
fi

# ── Auth ──────────────────────────────────────────────────────────────────────
if [ -z "$FIREBASE_SA_KEY" ]; then
  echo "ERROR: FIREBASE_SA_KEY codespace secret is not set."
  exit 1
fi
echo "$FIREBASE_SA_KEY" > /tmp/firebase-sa.json
export GOOGLE_APPLICATION_CREDENTIALS="/tmp/firebase-sa.json"
unset FIREBASE_TOKEN

# ── Function dependencies ─────────────────────────────────────────────────────
echo "→ Installing function dependencies..."
cd "$SCRIPT_DIR/functions" && npm install --silent && cd "$REPO_ROOT"

# ── Shared resource deploy ────────────────────────────────────────────────────
if [ "$SLUG" = "architect-guide" ] || [ "$SLUG" = "pricing-model" ]; then
  echo "→ Building design tokens + HTML..."
  npm --prefix "$REPO_ROOT" run build:html
  echo "   portal/public/resources/$( [ "$SLUG" = "architect-guide" ] && echo "architect-guide.html" || echo "ds-pricing-model.html" )"
  echo "→ Deploying to Firebase Hosting..."
  FIREBASE_BIN="$REPO_ROOT/node_modules/.bin/firebase"
  [ -f "$FIREBASE_BIN" ] || FIREBASE_BIN="npx firebase"
  export GOOGLE_APPLICATION_CREDENTIALS="/tmp/firebase-sa.json"
  "$FIREBASE_BIN" deploy --only hosting --project dataskateclients --force
  rm -f /tmp/firebase-sa.json
  echo ""
  echo "Done. Portal: https://dataskateclients.web.app"
  exit 0
fi

# ── Firestore rules deploy ────────────────────────────────────────────────────
if [ "$SLUG" = "firestore-rules" ]; then
  FIREBASE_BIN="$REPO_ROOT/node_modules/.bin/firebase"
  [ -f "$FIREBASE_BIN" ] || FIREBASE_BIN="npx firebase"
  echo "→ Deploying Firestore security rules..."
  "$FIREBASE_BIN" deploy --only firestore:rules --project dataskateclients --force
  rm -f /tmp/firebase-sa.json
  echo ""
  echo "Done. Rules live at: https://console.firebase.google.com/project/dataskateclients/firestore/rules"
  exit 0
fi

# ── Client project deploy ─────────────────────────────────────────────────────
echo "→ Running Firebase sync for: $SLUG${TEMPLATE:+ ($TEMPLATE only)}"
node "$REPO_ROOT/pipeline/scripts/update-firebase.js" "$SLUG" ${TEMPLATE:+"$TEMPLATE"}

rm -f /tmp/firebase-sa.json
echo ""
echo "Done. Portal: https://dataskateclients.web.app"
