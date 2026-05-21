#!/usr/bin/env node
// commons/branding/fill-template.js
// CLI shim: delegates to the Eleventy + DTCG tokens + Nunjucks pipeline.
// All 7 templates are fully ported — this script is now a thin wrapper that
// runs `npm run build:html` (Eleventy) then copies the output to the legacy
// outFile path so the 9 callers (regen-all-clients, republish, update-firebase,
// generate-client-portal, firebase/deploy.sh, DSPipeline/scout/orchestrate.js,
// petra.toml, quinn.toml, mira.toml) keep working unchanged.

'use strict';
const fs   = require('fs');
const path = require('path');

const args          = process.argv.slice(2);
const templateType  = args[args.indexOf('--template') + 1];
const clientIdx     = args.indexOf('--client');
const client        = clientIdx !== -1 ? args[clientIdx + 1] : null;
const forceRepublish = args.includes('--force-republish');

const KNOWN_TEMPLATES     = ['proposal', 'intake', 'integration-deck', 'client-portal', 'corporate-brief', 'ds-pricing-model', 'architect-guide'];
const PER_CLIENT_TEMPLATES = new Set(['proposal', 'intake', 'integration-deck', 'client-portal', 'corporate-brief']);

// Frozen-client guard. Shipped clients (those with their intake/proposal URL
// already in client hands) must not be overwritten by template regeneration.
// Trigger condition: projects/{slug}/project.json has "frozen": true.
// Override: pass --force-republish on the command line.
if (PER_CLIENT_TEMPLATES.has(templateType) && client && !forceRepublish) {
  const _root     = path.resolve(__dirname, '../..');
  const _projPath = path.join(_root, 'projects', client, 'project.json');
  if (fs.existsSync(_projPath)) {
    try {
      const _proj = JSON.parse(fs.readFileSync(_projPath, 'utf8'));
      if (_proj.frozen === true) {
        console.error(`✗ Refusing to regenerate ${templateType} for "${client}": client is frozen (shipped).`);
        console.error(`  This client's HTML has been deployed to Firebase and the URL is in client hands.`);
        console.error(`  Regenerating would change what the client sees.`);
        console.error(`  To override (e.g. you genuinely need to republish), re-run with --force-republish.`);
        process.exit(2);
      }
    } catch (_e) {
      // Malformed project.json — proceed; caller will hit a clearer error later.
    }
  }
}

if (!templateType) {
  console.error('Usage: node fill-template.js --template <type> [--client <slug>]');
  console.error(`  Known types: ${KNOWN_TEMPLATES.join(', ')}`);
  process.exit(1);
}

if (!KNOWN_TEMPLATES.includes(templateType)) {
  console.error(`\n❌ No template registered for type: "${templateType}"`);
  console.error(`   Known types: ${KNOWN_TEMPLATES.join(', ')}`);
  console.error(`\n   To add a new document type:`);
  console.error(`     1. Create docs/eleventy/_includes/layouts/${templateType}.njk`);
  console.error(`     2. Add a site entry under docs/eleventy/site/`);
  console.error(`     3. Add "${templateType}" to KNOWN_TEMPLATES and the eleventyOutMap below`);
  process.exit(1);
}

const root = path.resolve(__dirname, '../..');

const typeConfig = {
  proposal: {
    requiresClient: true,
    outFile: (c) => path.join(root, 'projects', c, 'intake', `proposal-${c}.html`),
  },
  intake: {
    requiresClient: true,
    outFile: (c) => path.join(root, 'projects', c, 'intake', `intake-questionnaire-${c}.html`),
  },
  'client-portal': {
    requiresClient: true,
    outFile: (c) => path.join(root, 'firebase', 'public', 'portal', `${c}.html`),
  },
  'ds-pricing-model': {
    requiresClient: false,
    outFile: () => path.join(root, 'firebase', 'public', 'resources', 'ds-pricing-model.html'),
  },
  'architect-guide': {
    requiresClient: false,
    outFile: () => path.join(root, 'firebase', 'public', 'resources', 'architect-guide.html'),
  },
  'integration-deck': {
    requiresClient: true,
    outFile: (c) => path.join(root, 'projects', c, 'intake', `integration-deck-${c}.html`),
  },
  'corporate-brief': {
    requiresClient: true,
    outFile: (c) => path.join(root, 'projects', c, 'intake', `corporate-brief-${c}.html`),
  },
};

const cfg = typeConfig[templateType];
if (cfg.requiresClient && !client) {
  console.error(`❌ --client <slug> is required for --template ${templateType}`);
  process.exit(1);
}

// ─── ELEVENTY DISPATCH ───────────────────────────────────────────────────────
const { spawnSync } = require('child_process');
const eleventyBuildDir = path.join(root, 'docs', 'eleventy', '_build');

// Eleventy output path for each template. Mirrors permalinks in docs/eleventy/site/**/*.njk.
const eleventyOutMap = {
  'ds-pricing-model': () => path.join(eleventyBuildDir, 'resources', 'ds-pricing-model.html'),
  'architect-guide':  () => path.join(eleventyBuildDir, 'resources', 'architect-guide.html'),
  'client-portal':    (c) => path.join(eleventyBuildDir, 'portal', `${c}.html`),
  'integration-deck': (c) => path.join(eleventyBuildDir, 'internal', `integration-deck-${c}.html`),
  'corporate-brief':  (c) => path.join(eleventyBuildDir, 'intake', `corporate-brief-${c}.html`),
  'proposal':         (c) => path.join(eleventyBuildDir, 'intake', `proposal-${c}.html`),
  'intake':           (c) => path.join(eleventyBuildDir, 'intake', `intake-questionnaire-${c}.html`),
};
const eleventySrc = eleventyOutMap[templateType](client);

// Resolve target path (--out-override lets republish.js redirect to a versioned path)
const _outIdx      = args.indexOf('--out-override');
const _outOverride = _outIdx !== -1 ? args[_outIdx + 1] : null;
const finalOutFile = _outOverride
  ? path.resolve(root, _outOverride)
  : cfg.outFile(client);

const buildResult = spawnSync('npm', ['run', 'build:html'], { cwd: root, stdio: 'inherit' });
if (buildResult.status !== 0) {
  console.error(`✗ Eleventy build failed for template "${templateType}".`);
  process.exit(buildResult.status || 1);
}

if (!fs.existsSync(eleventySrc)) {
  console.error(`✗ Eleventy did not produce expected output: ${eleventySrc}`);
  console.error(`  Check pagination filters in docs/eleventy/site/*.njk and ensure`);
  console.error(`  the client has the right content files (project.json, portal-content.json, etc.).`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(finalOutFile), { recursive: true });
fs.copyFileSync(eleventySrc, finalOutFile);
console.log(`✓ Written (via Eleventy): ${finalOutFile}`);
