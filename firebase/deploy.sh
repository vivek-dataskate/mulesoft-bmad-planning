#!/usr/bin/env bash
# DataSkate Portal — full rebuild and deploy.
# For a single-project update (e.g. from Scout), call:
#   node scripts/update-firebase.js <slug>
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PUBLIC="$SCRIPT_DIR/public"

# ── Auth ──────────────────────────────────────────────────────────────────────
if [ -z "$FIREBASE_SA_KEY" ]; then
  echo "ERROR: FIREBASE_SA_KEY codespace secret is not set."
  exit 1
fi
echo "$FIREBASE_SA_KEY" > /tmp/firebase-sa.json
export GOOGLE_APPLICATION_CREDENTIALS="/tmp/firebase-sa.json"

# ── Sales resources ───────────────────────────────────────────────────────────
echo "→ Publishing sales resources..."
mkdir -p "$PUBLIC/resources"

# Copy pre-built HTML resources (e.g. proposals, intake forms copied for reference)
for f in "$REPO_ROOT"/commons/sales/*.html; do
  [ -f "$f" ] || continue
  cp "$f" "$PUBLIC/resources/$(basename "$f")"
  echo "   resources/$(basename "$f")"
done

# Convert markdown resources to HTML via the resource template
for f in "$REPO_ROOT"/commons/sales/*.md; do
  [ -f "$f" ] || continue
  base="$(basename "$f" .md)"
  node "$REPO_ROOT/commons/branding/fill-template.js" \
    --template resource \
    --name "$base" \
    --src "$f"
  echo "   resources/${base}.html (from .md)"
done

# ── Function dependencies ─────────────────────────────────────────────────────
echo "→ Installing function dependencies..."
cd "$SCRIPT_DIR/functions" && npm install --silent && cd "$REPO_ROOT"

# ── Core sync: archive scoping, sync HTML, rebuild manifest + portals, deploy ─
echo "→ Running unified Firebase sync..."
node "$REPO_ROOT/scripts/update-firebase.js" --all

rm -f /tmp/firebase-sa.json
echo ""
echo "Done. Portal: https://dataskateclients.web.app"
