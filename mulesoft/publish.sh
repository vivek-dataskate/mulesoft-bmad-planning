#!/usr/bin/env bash
# commons/publish.sh
#
# Publishes the mulesoft-commons library to Anypoint Exchange.
#
# Usage:
#   ANYPOINT_ORG_ID=abc123 ANYPOINT_USERNAME=user ANYPOINT_PASSWORD=pass \
#     ./commons/publish.sh
#
# Or with connected app (preferred for CI/CD):
#   ANYPOINT_ORG_ID=abc123 ANYPOINT_CLIENT_ID=cid ANYPOINT_CLIENT_SECRET=csec \
#     ./commons/publish.sh
#
# Required env vars:
#   ANYPOINT_ORG_ID        — Anypoint Organisation ID (from Anypoint Platform → Access Management)
#
# Auth (one of two options):
#   Option A — username/password:
#     ANYPOINT_USERNAME, ANYPOINT_PASSWORD
#   Option B — connected app (CI/CD preferred):
#     ANYPOINT_CLIENT_ID, ANYPOINT_CLIENT_SECRET
#
# What it does:
#   1. Validates env vars
#   2. Obtains Anypoint access token
#   3. Runs mvn deploy with org ID injected
#   4. Prints Exchange URL for the published asset

set -euo pipefail

die()  { echo "ERROR: $*" >&2; exit 1; }
info() { echo "→ $*"; }
ok()   { echo "✓ $*"; }

# ─── Validate env ──────────────────────────────────────────────────────────────

[[ -n "${ANYPOINT_ORG_ID:-}" ]] || die "ANYPOINT_ORG_ID is not set. Find it in Anypoint Platform → Access Management → Organisation."

command -v mvn  >/dev/null 2>&1 || die "mvn is not installed. Install Maven 3.8+."
command -v curl >/dev/null 2>&1 || die "curl is not installed."
command -v node >/dev/null 2>&1 || die "node is not installed."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── Read version from pom.xml ─────────────────────────────────────────────────

VERSION="$(node -e "
  const fs = require('fs');
  const xml = fs.readFileSync('${SCRIPT_DIR}/pom.xml', 'utf8');
  const m = xml.match(/<version>([^<]+)<\/version>/);
  process.stdout.write(m ? m[1] : 'unknown');
")"

info "Publishing mulesoft-commons version $VERSION to org $ANYPOINT_ORG_ID"
echo ""

# ─── Obtain Anypoint access token ─────────────────────────────────────────────

if [[ -n "${ANYPOINT_CLIENT_ID:-}" ]] && [[ -n "${ANYPOINT_CLIENT_SECRET:-}" ]]; then
  info "Authenticating with Connected App..."
  TOKEN_RESPONSE="$(curl -s -X POST \
    "https://anypoint.mulesoft.com/accounts/api/v2/oauth2/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "grant_type=client_credentials&client_id=${ANYPOINT_CLIENT_ID}&client_secret=${ANYPOINT_CLIENT_SECRET}")"
elif [[ -n "${ANYPOINT_USERNAME:-}" ]] && [[ -n "${ANYPOINT_PASSWORD:-}" ]]; then
  info "Authenticating with username/password..."
  TOKEN_RESPONSE="$(curl -s -X POST \
    "https://anypoint.mulesoft.com/accounts/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"${ANYPOINT_USERNAME}\",\"password\":\"${ANYPOINT_PASSWORD}\"}")"
else
  die "Set either (ANYPOINT_CLIENT_ID + ANYPOINT_CLIENT_SECRET) or (ANYPOINT_USERNAME + ANYPOINT_PASSWORD)."
fi

ACCESS_TOKEN="$(echo "$TOKEN_RESPONSE" | node -e "
  let b=''; process.stdin.on('data',d=>b+=d);
  process.stdin.on('end',()=>{
    const r = JSON.parse(b);
    process.stdout.write(r.access_token || r.token_type && '' || '');
  });")" || die "Could not parse access token from Anypoint response."

[[ -n "$ACCESS_TOKEN" ]] || die "Authentication failed. Check credentials."
ok "Authenticated — token obtained."
echo ""

# ─── Run mvn deploy ────────────────────────────────────────────────────────────

info "Running mvn deploy (this may take 2-5 minutes)..."

cd "$SCRIPT_DIR"

mvn deploy \
  -Danypoint.org.id="${ANYPOINT_ORG_ID}" \
  -Danypoint.access.token="${ACCESS_TOKEN}" \
  -DskipTests=false \
  --settings "${SCRIPT_DIR}/../.mvn/anypoint-settings.xml" 2>&1 | tee /tmp/commons-publish.log

DEPLOY_STATUS="${PIPESTATUS[0]}"

if [[ "$DEPLOY_STATUS" -ne 0 ]]; then
  echo ""
  echo "Maven deploy failed. Last 20 lines of output:" >&2
  tail -20 /tmp/commons-publish.log >&2
  die "mvn deploy exited with status $DEPLOY_STATUS."
fi

ok "mvn deploy completed."
echo ""

# ─── Print result ──────────────────────────────────────────────────────────────

EXCHANGE_URL="https://anypoint.mulesoft.com/exchange/${ANYPOINT_ORG_ID}/mulesoft-commons/${VERSION}/"

echo "════════════════════════════════════════════════════════════"
echo "  mulesoft-commons v${VERSION} PUBLISHED"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "  Exchange URL: ${EXCHANGE_URL}"
echo ""
echo "  Next steps:"
echo "  1. Open the Exchange URL and verify the asset appears"
echo "  2. Update standards/snippet-registry.json _meta.commonsVersion if bumped"
echo "  3. Regenerate any client projects that need this version bump:"
echo "     node scaffold/generate.js projects/{client}/decisions.json"
echo "  4. Client projects pull the new version via: mvn clean compile"
echo ""
echo "════════════════════════════════════════════════════════════"
