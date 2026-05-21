#!/usr/bin/env node
// Accessibility audit via axe-core + puppeteer.
// Usage:
//   node scripts/lint-a11y.js                    ← audit key public pages
//   node scripts/lint-a11y.js path/to/file.html  ← audit one file
//
// Runs automatically via: npm run lint:a11y
// Not wired into PostToolUse hook (puppeteer startup is too slow for per-save use).

'use strict';
const path      = require('path');
const fs        = require('fs');
const puppeteer = require('puppeteer');

// axe-core ships as a browser-side script — load it from node_modules
const AXE_SOURCE = fs.readFileSync(
  path.join(__dirname, '../node_modules/axe-core/axe.min.js'),
  'utf8'
);

const ROOT = path.resolve(__dirname, '../..');

const DEFAULT_TARGETS = [
  'portal/public/index.html',
  'portal/public/resources/ds-pricing-model.html',
  'portal/public/resources/architect-guide.html',
];

async function auditFile(browser, relPath) {
  const absPath = path.resolve(ROOT, relPath);
  if (!fs.existsSync(absPath)) {
    console.warn(`  skip (not found): ${relPath}`);
    return { violations: [] };
  }

  const page = await browser.newPage();
  try {
    await page.goto(`file://${absPath}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.addScriptTag({ content: AXE_SOURCE });
    const results = await page.evaluate(() =>
      window.axe.run({ runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'best-practice'] } })
    );
    return results;
  } finally {
    await page.close();
  }
}

async function main() {
  const arg = process.argv[2];
  const targets = arg
    ? [path.relative(ROOT, path.resolve(process.cwd(), arg))]
    : DEFAULT_TARGETS;

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  let anyFail = false;

  for (const rel of targets) {
    process.stdout.write(`  axe: ${rel} … `);
    try {
      const results = await auditFile(browser, rel);
      const v = results.violations || [];
      if (v.length === 0) {
        console.log('✓');
      } else {
        console.log(`✗  ${v.length} violation(s)`);
        anyFail = true;
        v.forEach(violation => {
          console.error(`     [${violation.impact}] ${violation.id} — ${violation.description}`);
          violation.nodes.slice(0, 2).forEach(n => console.error(`       ${n.html.slice(0, 100)}`));
        });
      }
    } catch (err) {
      console.log(`✗  error: ${err.message}`);
      anyFail = true;
    }
  }

  await browser.close();

  if (anyFail) {
    console.error('\nAccessibility audit FAILED — fix violations above.');
    process.exit(1);
  } else {
    console.log('\nAll accessibility checks passed.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
