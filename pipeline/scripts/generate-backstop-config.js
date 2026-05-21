#!/usr/bin/env node
// Generates backstop.json from the set of HTML files currently in this repo.
// Run before every backstop reference/test so the scenario list stays in sync
// with the actual file tree (new clients, new portal pages, etc.).
//
// Usage:
//   node scripts/generate-backstop-config.js           ← all pages
//   node scripts/generate-backstop-config.js --intake  ← intake pages only (CI gate)

'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT      = path.resolve(__dirname, '../..');
const intakeOnly = process.argv.includes('--intake');

function isIntakeLabel(label) {
  return /(^|-)intake(-questionnaire)?-/.test(label) || /^fb-intake-/.test(label);
}

function discoverTargets() {
  const targets = [];

  const projectsDir = path.join(ROOT, 'projects');
  if (fs.existsSync(projectsDir)) {
    for (const slug of fs.readdirSync(projectsDir)) {
      if (slug.startsWith('_')) continue;
      const projDir = path.join(projectsDir, slug);
      if (!fs.statSync(projDir).isDirectory()) continue;
      const intakeDir = path.join(projDir, 'intake');
      if (!fs.existsSync(intakeDir)) continue;
      for (const file of fs.readdirSync(intakeDir)) {
        if (!file.endsWith('.html')) continue;
        targets.push({
          label: `proj-${slug}-${file.replace(/\.html$/, '')}`,
          absPath: path.join(intakeDir, file),
        });
      }
    }
  }

  const fbRoot = path.join(ROOT, 'portal', 'public');
  if (fs.existsSync(fbRoot)) {
    const walk = (dir, prefix) => {
      for (const entry of fs.readdirSync(dir)) {
        const full  = path.join(dir, entry);
        const stat  = fs.statSync(full);
        if (stat.isDirectory()) { walk(full, prefix + entry + '-'); continue; }
        if (!entry.endsWith('.html')) continue;
        targets.push({
          label:   `fb-${prefix}${entry.replace(/\.html$/, '')}`,
          absPath: full,
        });
      }
    };
    walk(fbRoot, '');
  }

  return intakeOnly ? targets.filter(t => isIntakeLabel(t.label)) : targets;
}

const targets = discoverTargets();

if (targets.length === 0) {
  console.error('No HTML targets found. Build the site first (npm run build:html).');
  process.exit(1);
}

const scenarios = targets.map(t => ({
  label:                t.label,
  url:                  'file://' + t.absPath,
  delay:                0,
  selectors:            ['document'],
  selectorExpansion:    true,
  misMatchThreshold:    0,
  requireSameDimensions: false,
}));

const config = {
  id: 'dataskate-portals',
  viewports: [{ label: 'desktop', width: 1280, height: 900 }],
  onReadyScript: 'puppet/onReady.js',
  scenarios,
  paths: {
    bitmaps_reference: 'backstop_data/bitmaps_reference',
    bitmaps_test:      'backstop_data/bitmaps_test',
    html_report:       'backstop_data/html_report',
    ci_report:         'backstop_data/ci_report',
    engine_scripts:    'backstop_data/engine_scripts',
  },
  report:      ['CI'],
  engine:      'puppeteer',
  engineOptions: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
  asyncCaptureLimit:  3,
  asyncCompareLimit:  50,
  debug:       false,
  debugWindow: false,
};

const out = path.join(ROOT, 'tests', 'backstop', 'backstop.json');
fs.writeFileSync(out, JSON.stringify(config, null, 2));
console.log(`backstop.json written — ${scenarios.length} scenario(s)${intakeOnly ? ' [intake only]' : ''}`);
