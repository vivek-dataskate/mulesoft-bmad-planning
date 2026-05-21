#!/usr/bin/env node
// scripts/regen-all-clients.js
// Regenerates all client HTML files via Eleventy.
// Runs `npm run build:html` once, then copies outputs from _build/ to their
// final destinations. Called by PostToolUse hook when any Nunjucks layout is
// saved. Also callable manually:
//   node scripts/regen-all-clients.js [--template <type>] [--client <slug>]
//
// Templates regenerated per client:
//   intake          → projects/{slug}/intake/intake-questionnaire-{slug}.html
//   proposal        → projects/{slug}/intake/proposal-{slug}.html
//   integration-deck→ projects/{slug}/intake/integration-deck-{slug}.html
//   client-portal   → firebase/public/portal/{slug}.html
//
// Only copies files that Eleventy actually produced (i.e. client had content).

'use strict';
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root  = path.resolve(__dirname, '..');
const BUILD = path.join(root, 'docs', 'eleventy', '_build');
const args  = process.argv.slice(2);

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
  {
    type:     'intake',
    buildSrc: (s) => path.join(BUILD, 'intake',    `intake-questionnaire-${s}.html`),
    dest:     (s) => path.join(root, 'projects', s, 'intake', `intake-questionnaire-${s}.html`),
  },
  {
    type:     'proposal',
    buildSrc: (s) => path.join(BUILD, 'intake',    `proposal-${s}.html`),
    dest:     (s) => path.join(root, 'projects', s, 'intake', `proposal-${s}.html`),
  },
  {
    type:     'integration-deck',
    buildSrc: (s) => path.join(BUILD, 'internal',  `integration-deck-${s}.html`),
    dest:     (s) => path.join(root, 'projects', s, 'intake', `integration-deck-${s}.html`),
  },
  {
    type:     'client-portal',
    buildSrc: (s) => path.join(BUILD, 'portal',    `${s}.html`),
    dest:     (s) => path.join(root, 'firebase', 'public', 'portal', `${s}.html`),
  },
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

// Run Eleventy once — it builds all templates for all clients in one pass.
try {
  execSync('npm run build:html', { cwd: root, stdio: 'inherit' });
} catch {
  console.error('✗ Eleventy build failed. Aborting.');
  process.exit(1);
}

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
    const src = tmpl.buildSrc(client);
    if (!fs.existsSync(src)) {
      skipped++;
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(tmpl.dest(client)), { recursive: true });
      fs.copyFileSync(src, tmpl.dest(client));
      console.log(`✓  ${client} / ${tmpl.type}`);
      regenerated++;
    } catch (err) {
      console.error(`✗  ${client} / ${tmpl.type}: ${err.message}`);
      errors++;
    }
  }
}

console.log(`\nDone: ${regenerated} regenerated, ${skipped} skipped (no content), ${frozenSkipped} skipped (frozen client), ${errors} errors`);
if (errors > 0) process.exit(1);
