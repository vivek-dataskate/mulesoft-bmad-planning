#!/usr/bin/env bash
# scaffold/create-github-issues.sh
#
# Parses projects/{client}/stories.md and creates GitHub Issues in the
# client's generated repo ({client}-mule). Developers get a real sprint board
# instead of a YAML file nobody reads.
#
# Usage:
#   GITHUB_TOKEN=ghp_... GITHUB_ORG=my-org \
#     ./scaffold/create-github-issues.sh projects/leolabs/decisions.json
#
# Required env vars:
#   GITHUB_TOKEN  — PAT with repo:write scope on the client repo
#   GITHUB_ORG    — GitHub org that owns the {client}-mule repo
#
# Optional env vars:
#   MILESTONE     — Milestone title (default: "Sprint 1")
#   DRY_RUN=true  — Print issues without creating them

set -euo pipefail

die()  { echo "ERROR: $*" >&2; exit 1; }
info() { echo "→ $*"; }
ok()   { echo "✓ $*"; }
warn() { echo "⚠  $*"; }

# ─── Prerequisites ────────────────────────────────────────────────────────────

[[ -n "${GITHUB_TOKEN:-}" ]] || die "GITHUB_TOKEN is not set."
[[ -n "${GITHUB_ORG:-}"   ]] || die "GITHUB_ORG is not set."

command -v node >/dev/null 2>&1 || die "node is not installed."
command -v curl >/dev/null 2>&1 || die "curl is not installed."

DECISIONS="${1:-}"
[[ -n "$DECISIONS" ]] || die "Usage: $0 projects/{client}/decisions.json"
[[ -f "$DECISIONS" ]] || die "File not found: $DECISIONS"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CLIENT="$(node -e "process.stdout.write(require('$(realpath "$DECISIONS")').project.client)")" \
  || die "Could not read project.client from decisions.json"
REPO_NAME="${CLIENT}-mule"
STORIES_FILE="$REPO_ROOT/projects/$CLIENT/stories.md"

[[ -f "$STORIES_FILE" ]] || die "stories.md not found: $STORIES_FILE. Run the PM agent first."

MILESTONE="${MILESTONE:-Sprint 1}"
DRY_RUN="${DRY_RUN:-false}"

info "Client:     $CLIENT"
info "Repo:       ${GITHUB_ORG}/${REPO_NAME}"
info "Stories:    $STORIES_FILE"
info "Milestone:  $MILESTONE"
[[ "$DRY_RUN" == "true" ]] && info "Mode:       DRY RUN (no issues created)"
echo ""

# ─── Verify repo exists ───────────────────────────────────────────────────────

REPO_STATUS="$(curl -s -o /dev/null -w "%{http_code}" \
  --max-time 15 --connect-timeout 5 \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${GITHUB_ORG}/${REPO_NAME}")"

[[ "$REPO_STATUS" == "200" ]] || die "Repo ${GITHUB_ORG}/${REPO_NAME} not found (HTTP $REPO_STATUS). Create the client repo first with create-client-repo.sh."

# ─── Create or find milestone ─────────────────────────────────────────────────

create_or_get_milestone() {
  # Check if milestone exists
  MILESTONES="$(curl -s --max-time 15 \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${GITHUB_ORG}/${REPO_NAME}/milestones?state=open&per_page=50")"

  MILESTONE_NUMBER="$(echo "$MILESTONES" | node -e "
    let b=''; process.stdin.on('data',d=>b+=d);
    process.stdin.on('end',()=>{
      const ms = JSON.parse(b);
      const found = ms.find(m => m.title === process.env.MILESTONE);
      process.stdout.write(found ? String(found.number) : '');
    });" MILESTONE="$MILESTONE")"

  if [[ -n "$MILESTONE_NUMBER" ]]; then
    ok "Milestone '${MILESTONE}' already exists (#${MILESTONE_NUMBER})"
    echo "$MILESTONE_NUMBER"
    return
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    echo "0"
    return
  fi

  PAYLOAD="$(node -e "process.stdout.write(JSON.stringify({title: process.env.MILESTONE, state: 'open'}))" MILESTONE="$MILESTONE")"
  RESPONSE="$(curl -s --max-time 15 \
    -X POST \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/${GITHUB_ORG}/${REPO_NAME}/milestones" \
    -d "$PAYLOAD")"
  NUMBER="$(echo "$RESPONSE" | node -e "let b=''; process.stdin.on('data',d=>b+=d); process.stdin.on('end',()=>{ process.stdout.write(String(JSON.parse(b).number)); });")"
  ok "Created milestone '${MILESTONE}' (#${NUMBER})"
  echo "$NUMBER"
}

# ─── Create GitHub labels ─────────────────────────────────────────────────────

create_label_if_missing() {
  local name="$1" color="$2"
  EXISTING="$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${GITHUB_ORG}/${REPO_NAME}/labels/$(node -e "process.stdout.write(encodeURIComponent('$name'))")")"
  if [[ "$EXISTING" == "200" ]]; then return; fi
  [[ "$DRY_RUN" == "true" ]] && return
  PAYLOAD="$(node -e "process.stdout.write(JSON.stringify({name: '$name', color: '$color'}))")"
  curl -s -o /dev/null --max-time 10 \
    -X POST \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    "https://api.github.com/repos/${GITHUB_ORG}/${REPO_NAME}/labels" \
    -d "$PAYLOAD" || true
}

info "Setting up labels..."
create_label_if_missing "global"       "0075ca"
create_label_if_missing "per-flow"     "e4e669"
create_label_if_missing "api-spec"     "d93f0b"
create_label_if_missing "implementation" "0e8a16"
create_label_if_missing "dataweave"    "bfd4f2"
create_label_if_missing "munit"        "fbca04"
create_label_if_missing "monitoring"   "c5def5"
create_label_if_missing "generated"    "ededed"
ok "Labels ready"

# ─── Parse stories.md and create issues ──────────────────────────────────────

MILESTONE_NUMBER="$(create_or_get_milestone)"

# Parse stories.md: each ## heading becomes an issue title.
# The body is everything from that heading to the next ## heading.
node - "$STORIES_FILE" "$GITHUB_ORG" "$REPO_NAME" "$MILESTONE_NUMBER" \
  "$GITHUB_TOKEN" "$DRY_RUN" << 'NODEEOF'
const fs   = require('fs');
const https = require('https');

const [, , storiesFile, org, repo, milestoneStr, token, dryRun] = process.argv;
const milestone = parseInt(milestoneStr, 10) || undefined;
const isDry = dryRun === 'true';

const content = fs.readFileSync(storiesFile, 'utf8');
const lines   = content.split('\n');

// Split on ## headings
const sections = [];
let current = null;
for (const line of lines) {
  if (line.startsWith('## ')) {
    if (current) sections.push(current);
    current = { title: line.slice(3).trim(), body: [] };
  } else if (current) {
    current.body.push(line);
  }
}
if (current) sections.push(current);

if (sections.length === 0) {
  console.log('No ## headings found in stories.md — no issues to create.');
  process.exit(0);
}

console.log(`\nFound ${sections.length} stories in stories.md`);

function inferLabels(title, body) {
  const t = title.toLowerCase() + ' ' + body.toLowerCase();
  const labels = ['generated'];
  if (t.includes('global') || t.includes('error handler') || t.includes('dlq') ||
      t.includes('secrets') || t.includes('cicd') || t.includes('ci/cd') ||
      t.includes('mq queue') || t.includes('wire tap')) labels.push('global');
  else labels.push('per-flow');
  if (t.includes('api spec') || t.includes('oas') || t.includes('openapi')) labels.push('api-spec');
  if (t.includes('dataweave') || t.includes('.dwl')) labels.push('dataweave');
  if (t.includes('munit') || t.includes('test')) labels.push('munit');
  if (t.includes('monitoring') || t.includes('alert')) labels.push('monitoring');
  if (t.includes('implement') || t.includes('flow')) labels.push('implementation');
  return [...new Set(labels)];
}

function createIssue(title, body, labels, milestoneNum, cb) {
  if (isDry) {
    console.log(`  [DRY RUN] Would create: "${title}" labels=[${labels.join(',')}]`);
    cb(null, { number: 0, html_url: '(dry-run)' });
    return;
  }
  const payload = JSON.stringify({
    title,
    body: body.trim() || title,
    labels,
    ...(milestoneNum && !isNaN(milestoneNum) ? { milestone: milestoneNum } : {}),
  });
  const options = {
    hostname: 'api.github.com',
    path:     `/repos/${org}/${repo}/issues`,
    method:   'POST',
    headers: {
      Authorization:  `token ${token}`,
      Accept:         'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent':   'bmad-scaffold',
      'Content-Length': Buffer.byteLength(payload),
    },
  };
  const req = https.request(options, res => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      try {
        const issue = JSON.parse(data);
        if (issue.number) cb(null, issue);
        else cb(new Error(issue.message || 'Unknown error'), null);
      } catch (e) { cb(e, null); }
    });
  });
  req.on('error', cb);
  req.write(payload);
  req.end();
}

// Create issues sequentially to avoid rate limits
let idx = 0;
let created = 0;
function next() {
  if (idx >= sections.length) {
    console.log(`\n✓ ${created} issues created in ${org}/${repo}`);
    return;
  }
  const { title, body } = sections[idx++];
  const bodyText = body.join('\n');
  const labels   = inferLabels(title, bodyText);
  createIssue(title, bodyText, labels, milestone, (err, issue) => {
    if (err) {
      console.warn(`  ⚠  Failed to create "${title}": ${err.message}`);
    } else {
      console.log(`  ✓ #${issue.number}: ${title}`);
      created++;
    }
    // 250 ms gap to stay under secondary rate limits
    setTimeout(next, isDry ? 0 : 250);
  });
}
next();
NODEEOF

echo ""
ok "Done — check issues at: https://github.com/${GITHUB_ORG}/${REPO_NAME}/issues"
echo ""
echo "  Developers can now track progress directly in GitHub Issues."
echo "  Close issues as stories are completed to see real % progress."
echo ""
