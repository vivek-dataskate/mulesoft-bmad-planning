#!/usr/bin/env node
//
// scripts/bump-template.js
// Increments a template's `current` version in commons/templates/version-manifest.json.
// Run this after you've finished editing a working template and want to declare
// a new shippable version. New clients created after the bump pin to the new
// version automatically; existing frozen clients keep their pinned version.
//
// Usage:
//   node scripts/bump-template.js --template proposal
//   node scripts/bump-template.js --template intake
//
// Templates supported: proposal | intake | integration-deck | client-portal | corporate-brief

'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'commons', 'templates', 'version-manifest.json');

const args = process.argv.slice(2);
const tIdx = args.indexOf('--template');
const tpl  = tIdx !== -1 ? args[tIdx + 1] : null;

if (!tpl) {
  console.error('Usage: node scripts/bump-template.js --template <proposal|intake|integration-deck|client-portal|corporate-brief>');
  process.exit(1);
}

if (!fs.existsSync(MANIFEST)) {
  console.error(`Missing: ${MANIFEST}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
if (!manifest.templates[tpl]) {
  console.error(`Unknown template: "${tpl}". Known: ${Object.keys(manifest.templates).join(', ')}`);
  process.exit(1);
}

const current = manifest.templates[tpl].current;
const m       = /^v(\d+)$/.exec(current);
if (!m) {
  console.error(`Cannot parse current version "${current}" for ${tpl}. Expected /^v\\d+$/.`);
  process.exit(1);
}
const next = `v${parseInt(m[1], 10) + 1}`;

manifest.templates[tpl].current  = next;
manifest.templates[tpl].bumpedAt = new Date().toISOString();

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

console.log(`✓ ${tpl}: ${current} → ${next}  (bumpedAt ${manifest.templates[tpl].bumpedAt})`);
console.log(`  New clients created from now on will pin to ${next}.`);
console.log(`  Existing frozen clients stay on their current pin until you republish them.`);
