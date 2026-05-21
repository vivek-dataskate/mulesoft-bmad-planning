#!/usr/bin/env node
//
// scripts/republish.js
// Republish ONE frozen client's HTML at a new versioned URL.
//
// Republishing a frozen client renders a new dated+versioned file at:
//
//   portal/public/{template-type}/{client}/{YYYY-MM-DD}-{vN}.html
//
// The client's existing live URL — and all prior versioned URLs — are LEFT
// UNTOUCHED. The client's project.json is updated so {type}Url points at the
// new file, and deployments[] gets an append-only ledger entry recording the
// republish.
//
// Usage:
//
//   node scripts/republish.js --client agilemind --template proposal
//      → republishes at the manifest's current version for that template
//
//   node scripts/republish.js --client agilemind --template proposal --version v3
//      → forces a specific version (must already be the manifest's current,
//        i.e. the working template represents that version)
//
// Behaviour:
//   • Refuses if the client doesn't exist.
//   • Refuses if the client isn't frozen (only frozen clients have URLs already
//     out in the world that need version-preserving republishes).
//   • Bumps project.json.templateVersions[type] to the target version.
//   • Renders directly to the versioned portal path (skips local intermediate).
//   • Appends to deployments[]; updates the {type}Url convenience pointer.
//   • Never overwrites an existing dated-versioned file — if one already exists
//     at the computed path (same client, same date, same version), exits with
//     an error and tells you to bump the template version first.

'use strict';
const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT     = path.resolve(__dirname, '../..');
const MANIFEST = path.join(ROOT, 'portal', 'version-manifest.json');
const BUILD    = path.join(ROOT, 'portal', '_build');
const FIREBASE_HOST = 'https://dataskateclients.web.app';

// Maps template type → path within Eleventy's _build/ output directory.
const ELEVENTY_OUT = {
  proposal:           (c) => path.join(BUILD, 'intake',    `proposal-${c}.html`),
  intake:             (c) => path.join(BUILD, 'intake',    `intake-questionnaire-${c}.html`),
  'integration-deck': (c) => path.join(BUILD, 'internal',  `integration-deck-${c}.html`),
  'client-portal':    (c) => path.join(BUILD, 'portal',    `${c}.html`),
  'corporate-brief':  (c) => path.join(BUILD, 'intake',    `corporate-brief-${c}.html`),
};

const TEMPLATE_TO_PATH_SEGMENT = {
  proposal:           'proposal',
  intake:             'intake',
  'integration-deck': 'integration-deck',
  'client-portal':    'portal',
  'corporate-brief':  'corporate-brief',
};

const args     = process.argv.slice(2);
const argv     = (k) => { const i = args.indexOf(k); return i !== -1 ? args[i + 1] : null; };
const client   = argv('--client');
const template = argv('--template');
const version  = argv('--version');

if (!client || !template) {
  console.error('Usage: node scripts/republish.js --client <slug> --template <type> [--version <vN>]');
  console.error('       template: ' + Object.keys(TEMPLATE_TO_PATH_SEGMENT).join(' | '));
  process.exit(1);
}

if (!TEMPLATE_TO_PATH_SEGMENT[template]) {
  console.error(`Unknown template "${template}". Known: ${Object.keys(TEMPLATE_TO_PATH_SEGMENT).join(', ')}`);
  process.exit(1);
}

// ── Validate client + frozen state ──────────────────────────────────────────
const pjPath = path.join(ROOT, 'projects', client, 'project.json');
if (!fs.existsSync(pjPath)) {
  console.error(`Client not found: projects/${client}/project.json does not exist.`);
  process.exit(1);
}

const proj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
if (proj.frozen !== true) {
  console.error(`✗ "${client}" is not frozen. Republish is for frozen clients only.`);
  console.error(`  Unfrozen clients regenerate at their existing unversioned path via regen-all-clients.js.`);
  console.error(`  To freeze: set "frozen": true in projects/${client}/project.json.`);
  process.exit(1);
}

// ── Resolve target version ──────────────────────────────────────────────────
const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const tplEntry = manifest.templates[template];
if (!tplEntry) {
  console.error(`Template "${template}" not in version-manifest.json.`);
  process.exit(1);
}
const targetVersion = version || tplEntry.current;

if (version && version !== tplEntry.current) {
  console.error(`✗ --version ${version} requested but manifest current is ${tplEntry.current}.`);
  console.error(`  The working template represents the current version. To republish at an older`);
  console.error(`  version you'd need to restore that template file — not supported by this script.`);
  process.exit(1);
}

// ── Compute output path ─────────────────────────────────────────────────────
const today    = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const segment  = TEMPLATE_TO_PATH_SEGMENT[template];
const outRel   = path.posix.join('portal', 'public', segment, client, `${today}-${targetVersion}.html`);
const outAbs   = path.join(ROOT, outRel);
const url      = `${FIREBASE_HOST}/${segment}/${client}/${today}-${targetVersion}.html`;

if (fs.existsSync(outAbs)) {
  console.error(`✗ Refusing to overwrite existing republish at ${outRel}.`);
  console.error(`  Bump the template version (node scripts/bump-template.js --template ${template})`);
  console.error(`  before republishing the same client twice on the same day at the same version.`);
  process.exit(1);
}

// ── Render via Eleventy, then copy to versioned output path ─────────────────
fs.mkdirSync(path.dirname(outAbs), { recursive: true });

console.log(`→ Republishing ${client} / ${template} at ${targetVersion}`);
console.log(`  Output:  ${outRel}`);
console.log(`  URL:     ${url}`);

const buildResult = spawnSync('npm', ['run', 'build:html'], { cwd: ROOT, stdio: 'inherit' });
if (buildResult.status !== 0) {
  console.error(`✗ Eleventy build failed. Republish aborted.`);
  process.exit(buildResult.status || 1);
}

const eleventySrc = ELEVENTY_OUT[template](client);
if (!fs.existsSync(eleventySrc)) {
  console.error(`✗ Eleventy did not produce expected output: ${eleventySrc}`);
  console.error(`  Check that client "${client}" has the required content JSON for template "${template}".`);
  process.exit(1);
}

fs.copyFileSync(eleventySrc, outAbs);

// ── Write stable redirect at the flat URL ───────────────────────────────────
// The flat path (e.g. portal/public/proposal/homage.html) is what was
// originally shared with the client. Overwrite it with a thin JS/meta redirect
// to the new versioned file so the client's bookmarked link always resolves to
// current without the URL ever changing in their hands.
proj.deployments = proj.deployments || [];

const flatPath = path.join(ROOT, 'firebase', 'public', segment, `${client}.html`);

// If v1 was published at the flat path (legacyUnversioned), archive its bytes
// to a dated+versioned path first so version history has a real direct link.
const legacyIdx = proj.deployments.findIndex(
  d => d.template === template && d.legacyUnversioned
);
if (legacyIdx !== -1) {
  const leg    = proj.deployments[legacyIdx];
  const legDate = (leg.publishedAt || '').slice(0, 10);
  const legVer  = leg.version || 'v1';
  const legRel  = path.posix.join('portal', 'public', segment, client, `${legDate}-${legVer}.html`);
  const legAbs  = path.join(ROOT, legRel);
  if (!fs.existsSync(legAbs) && fs.existsSync(flatPath)) {
    fs.mkdirSync(path.dirname(legAbs), { recursive: true });
    fs.copyFileSync(flatPath, legAbs);
    console.log(`  Archived legacy ${legVer} → ${legRel}`);
  }
  const legUrl = `${FIREBASE_HOST}/${segment}/${client}/${legDate}-${legVer}.html`;
  const { legacyUnversioned: _drop, ...legRest } = leg;
  proj.deployments[legacyIdx] = { ...legRest, url: legUrl, filePath: legRel };
}

if (fs.existsSync(flatPath)) {
  const redirect = [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8">',
    '<title>Redirecting…</title>',
    `<meta http-equiv="refresh" content="0;url=${url}">`,
    `<script>location.replace(${JSON.stringify(url)})</script>`,
    '</head><body></body></html>',
  ].join('\n') + '\n';
  fs.writeFileSync(flatPath, redirect);
  console.log(`  Stable redirect updated → portal/public/${segment}/${client}.html`);
} else {
  console.log(`  ⚠ No flat file at portal/public/${segment}/${client}.html — stable redirect not written`);
}

// ── Update project.json: bump pin, append versioned deployment ───────────────
// The stable URL (flat path) already lives in project.json from initial publish
// and must not be overwritten — the redirect there resolves to current.
proj.templateVersions = proj.templateVersions || {};
proj.templateVersions[template] = targetVersion;

proj.deployments.push({
  template,
  version:     targetVersion,
  filePath:    outRel,
  url,
  publishedAt: new Date().toISOString(),
});

fs.writeFileSync(pjPath, JSON.stringify(proj, null, 2) + '\n');

const stableUrl = `${FIREBASE_HOST}/${segment}/${client}.html`;
console.log(`\n✓ Republished locally.`);
console.log(`  projects/${client}/project.json updated:`);
console.log(`    templateVersions.${template} = ${targetVersion}`);
console.log(`    deployments[] += entry`);
console.log(`\nNext steps to make it live:`);
console.log(`  1) node scripts/update-firebase.js ${client}`);
console.log(`     → rebuilds projects-manifest.json`);
console.log(`     → (HTML upload step skips frozen clients automatically)`);
console.log(`  2) cd firebase && firebase deploy --only hosting`);
console.log(`     → ships versioned file + updated redirect + manifest to CDN`);
console.log(`\nStable URL (unchanged): ${stableUrl}`);
console.log(`Versioned URL:          ${url}`);
