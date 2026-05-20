#!/usr/bin/env node
// scripts/regen-all-clients.js
// Regenerates all client HTML files from their content JSONs.
// Called by PostToolUse hook when any *-template.html file is saved.
// Also callable manually: node scripts/regen-all-clients.js [--template <type>] [--client <slug>]
//
// Templates regenerated per client:
//   intake          → projects/{slug}/intake/intake-questionnaire-{slug}.html
//   proposal        → projects/{slug}/intake/proposal-{slug}.html
//   integration-deck→ projects/{slug}/intake/integration-deck-{slug}.html
//   client-portal   → firebase/public/portal/{slug}.html
//
// Only regenerates files where the source content JSON exists.

'use strict';
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

const filterTemplate  = args.indexOf('--template') !== -1 ? args[args.indexOf('--template') + 1] : null;
const filterClient    = args.indexOf('--client')   !== -1 ? args[args.indexOf('--client')   + 1] : null;
const forceRepublish  = args.includes('--force-republish');

// Returns true if projects/{slug}/project.json has frozen:true.
// Frozen clients have their HTML deliverables shipped to a client and must not
// be overwritten by template regeneration. Use --force-republish to override.
function isFrozen(slug) {
  const pjPath = path.join(root, 'projects', slug, 'project.json');
  if (!fs.existsSync(pjPath)) return false;
  try {
    const pj = JSON.parse(fs.readFileSync(pjPath, 'utf8'));
    return pj.frozen === true;
  } catch {
    return false;
  }
}

const TEMPLATES = [
  { type: 'intake',           contentFile: (s) => `projects/${s}/intake/intake-content.json` },
  { type: 'proposal',         contentFile: (s) => `projects/${s}/intake/proposal-content.json` },
  { type: 'integration-deck', contentFile: (s) => `projects/${s}/intake/integration-deck-content.json` },
  { type: 'client-portal',    contentFile: (s) => `projects/${s}/portal-content.json` },
];

// Discover all client slugs
const projectsDir = path.join(root, 'projects');
let clients = [];
if (fs.existsSync(projectsDir)) {
  clients = fs.readdirSync(projectsDir).filter(d => {
    const p = path.join(projectsDir, d);
    return fs.statSync(p).isDirectory() && d !== 'sample' && !d.startsWith('.');
  });
}

if (filterClient) {
  if (!clients.includes(filterClient)) {
    console.error(`Client not found: ${filterClient}`);
    process.exit(1);
  }
  clients = [filterClient];
}

const templates = filterTemplate
  ? TEMPLATES.filter(t => t.type === filterTemplate)
  : TEMPLATES;

let regenerated = 0;
let skipped = 0;
let frozenSkipped = 0;
let errors = 0;

for (const client of clients) {
  // Frozen-client guard: shipped clients are off-limits unless --force-republish.
  if (isFrozen(client) && !forceRepublish) {
    console.log(`⏭  ${client} — skipped (frozen — already shipped to client; pass --force-republish to override)`);
    frozenSkipped += templates.length;
    continue;
  }

  for (const tmpl of templates) {
    const contentPath = path.join(root, tmpl.contentFile(client));
    if (!fs.existsSync(contentPath)) {
      skipped++;
      continue;
    }

    const cmd = `node commons/branding/fill-template.js --template ${tmpl.type} --client ${client}${forceRepublish ? ' --force-republish' : ''}`;
    try {
      execSync(cmd, { cwd: root, stdio: 'pipe' });
      console.log(`✓  ${client} / ${tmpl.type}`);
      regenerated++;
    } catch (err) {
      console.error(`✗  ${client} / ${tmpl.type}: ${err.message}`);
      errors++;
    }
  }
}

console.log(`\nDone: ${regenerated} regenerated, ${skipped} skipped (no content JSON), ${frozenSkipped} skipped (frozen client), ${errors} errors`);
if (errors > 0) process.exit(1);
