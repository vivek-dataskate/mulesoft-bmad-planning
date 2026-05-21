#!/usr/bin/env node
//
// scripts/republish.js
// Republish ONE frozen client's HTML at a new versioned URL.
//
// Republishing a frozen client renders a new dated+versioned file at:
//
//   firebase/public/{template-type}/{client}/{YYYY-MM-DD}-{vN}.html
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
//   • Renders directly to the versioned firebase path (skips local intermediate).
//   • Appends to deployments[]; updates the {type}Url convenience pointer.
//   • Never overwrites an existing dated-versioned file — if one already exists
//     at the computed path (same client, same date, same version), exits with
//     an error and tells you to bump the template version first.

'use strict';
const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT     = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'docs', 'eleventy', 'version-manifest.json');
const FILL     = path.join(ROOT, 'commons', 'branding', 'fill-template.js');
const FIREBASE_HOST = 'https://dataskateclients.web.app';

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
const outRel   = path.posix.join('firebase', 'public', segment, client, `${today}-${targetVersion}.html`);
const outAbs   = path.join(ROOT, outRel);
const url      = `${FIREBASE_HOST}/${segment}/${client}/${today}-${targetVersion}.html`;

if (fs.existsSync(outAbs)) {
  console.error(`✗ Refusing to overwrite existing republish at ${outRel}.`);
  console.error(`  Bump the template version (node scripts/bump-template.js --template ${template})`);
  console.error(`  before republishing the same client twice on the same day at the same version.`);
  process.exit(1);
}

// ── Render via fill-template.js, --force-republish + --out-override ─────────
fs.mkdirSync(path.dirname(outAbs), { recursive: true });

console.log(`→ Republishing ${client} / ${template} at ${targetVersion}`);
console.log(`  Output:  ${outRel}`);
console.log(`  URL:     ${url}`);

const r = spawnSync('node', [
  FILL,
  '--template', template,
  '--client',   client,
  '--force-republish',
  '--out-override', outAbs,
], { stdio: 'inherit' });

if (r.status !== 0) {
  console.error(`✗ fill-template.js failed (exit ${r.status}). Republish aborted.`);
  // Clean up empty output file if fill-template left one.
  if (fs.existsSync(outAbs)) {
    const sz = fs.statSync(outAbs).size;
    if (sz === 0) fs.unlinkSync(outAbs);
  }
  process.exit(r.status);
}

// ── Update project.json: bump pin, append deployment, update *Url pointer ──
proj.templateVersions = proj.templateVersions || {};
proj.templateVersions[template] = targetVersion;

proj.deployments = proj.deployments || [];
proj.deployments.push({
  template,
  version:     targetVersion,
  filePath:    outRel,
  url,
  publishedAt: new Date().toISOString(),
});

// Convenience pointer field — e.g. proposalUrl, intakeUrl, integrationDeckUrl
const urlField = {
  proposal:           'proposalUrl',
  intake:             'intakeUrl',
  'integration-deck': 'integrationDeckUrl',
  'client-portal':    'pitchKitUrl',
  'corporate-brief':  'corporateBriefUrl',
}[template];
if (urlField) proj[urlField] = url;

fs.writeFileSync(pjPath, JSON.stringify(proj, null, 2) + '\n');

console.log(`\n✓ Republished locally.`);
console.log(`  projects/${client}/project.json updated:`);
console.log(`    templateVersions.${template} = ${targetVersion}`);
console.log(`    ${urlField || '(no convenience pointer for this template)'} = ${url}`);
console.log(`    deployments[] += entry`);
console.log(`\nNext steps to make it live:`);
console.log(`  1) node scripts/update-firebase.js ${client}`);
console.log(`     → rebuilds projects-manifest.json with the new URL`);
console.log(`     → (HTML upload step skips frozen clients automatically)`);
console.log(`  2) cd firebase && firebase deploy --only hosting`);
console.log(`     → ships ${outRel} + updated manifest to the CDN`);
console.log(`\nThe legacy URL (${proj.deployments[0] && proj.deployments[0].url}) keeps serving its original bytes.`);
