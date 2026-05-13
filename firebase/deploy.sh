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

echo "→ Generating projects manifest..."
REPO_ROOT="$REPO_ROOT" PUBLIC="$PUBLIC" node -e "
const fs   = require('fs');
const path = require('path');
const REPO   = process.env.REPO_ROOT;
const PUBLIC = process.env.PUBLIC;
const PORTAL = 'https://dataskateclients.web.app';

const dirs = fs.readdirSync(path.join(REPO, 'projects'), { withFileTypes: true })
  .filter(d => d.isDirectory()).map(d => d.name);

const projects = [];
for (const slug of dirs) {
  const intakeDir = path.join(REPO, 'projects', slug, 'intake');
  const projFile  = path.join(REPO, 'projects', slug, 'project.json');
  if (!fs.existsSync(projFile)) continue;

  const hasIntake   = fs.existsSync(path.join(intakeDir, 'intake-questionnaire-' + slug + '.html'));
  const hasProposal = fs.existsSync(path.join(intakeDir, 'proposal-' + slug + '.html'));
  if (!hasIntake && !hasProposal) continue;

  const proj   = JSON.parse(fs.readFileSync(projFile, 'utf8'));
  const status = hasIntake ? 'intake_sent' : 'proposal_sent';
  const entry  = {
    id:             slug,
    name:           proj.displayName || slug,
    status,
    architect:      proj.architect      || null,
    architectEmail: proj.architectEmail || null,
    createdAt:      proj.createdAt      || null,
  };
  if (hasIntake)   entry.intakeUrl   = PORTAL + '/intake/'   + slug + '.html';
  if (hasProposal) entry.proposalUrl = PORTAL + '/proposal/' + slug + '.html';
  projects.push(entry);
}

projects.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
fs.writeFileSync(path.join(PUBLIC, 'projects-manifest.json'), JSON.stringify(projects, null, 2));
console.log('   ' + projects.length + ' project(s) written to projects-manifest.json');
"

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

echo "→ Generating client portals..."
node "$REPO_ROOT/scaffold/generate-client-portal.js"

echo "→ Installing function dependencies..."
cd "$SCRIPT_DIR/functions" && npm install --silent

echo "→ Deploying to Firebase..."
cd "$SCRIPT_DIR" && npx firebase-tools deploy --only hosting --project dataskateclients --force

rm -f "$SA_KEY_FILE"
echo ""
echo "Done. Portal: https://dataskateclients.web.app"
