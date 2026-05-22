#!/usr/bin/env node
// DataSkate HTML linter — DS-specific semantic checks only.
// Color/hex enforcement  → stylelint (.stylelintrc.json)
// Structure/tag rules    → htmlhint (.htmlhintrc)
// Formatting             → prettier (.prettierrc.json)
// Accessibility          → node pipeline/scripts/lint-a11y.js
//
// Run automatically via PostToolUse hook on any .html file edit.
// Also runnable manually:
//   node commons/branding/lint-html.js               ← lint all known HTML files
//   node commons/branding/lint-html.js path/to/file  ← lint one file

'use strict';
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');

const BRAND    = JSON.parse(fs.readFileSync(path.join(ROOT, 'commons/brand-standards.json'), 'utf8'));
const COMPETITORS = JSON.parse(fs.readFileSync(path.join(__dirname, 'competitors.json'), 'utf8'));

// Allowed CSS vars — derived from tokens.css, never hand-maintained.
// Add new vars to tokens/*.json and run: npm run build:tokens
const TOKENS_CSS  = fs.readFileSync(path.join(ROOT, BRAND.html.compiledCss), 'utf8');
const ALLOWED_VARS = new Set(
  [...TOKENS_CSS.matchAll(/^\s*(--[a-zA-Z][a-zA-Z0-9-]*):/gm)].map(m => m[1])
);

const LOGO_VIEWBOX = BRAND.html.logo.viewBox;

function getAllHtmlTargets() {
  try {
    const out = execSync(
      "find . -name '*.html' ! -path '*/node_modules/*' ! -path '*/.git/*'",
      { cwd: ROOT, encoding: 'utf8' }
    );
    return out.trim().split('\n').filter(Boolean).map(f => f.replace(/^\.\//, ''));
  } catch {
    return [];
  }
}

const EXCLUDE_PATTERNS = [
  /^commons\/branding\/templates\//,
  /^commons\/branding\/[^/]+-base\.css\.html$/,
  /^portal\/_includes\/shared-base\.css\.html$/,
  /^docs\/eleventy\/_build\/shared-base\.css\.html$/,
];

function isExcluded(rel) {
  return EXCLUDE_PATTERNS.some(p => p.test(rel));
}

const CHECKS = [
  {
    name: 'SVG logo',
    test: c => c.includes(`viewBox="${LOGO_VIEWBOX}"`),
    message: `Missing inline SVG logo (viewBox="${LOGO_VIEWBOX}") — every HTML doc must include the DataSkate wordmark SVG. Source: commons/brand-standards.json → html.logo.viewBox`,
  },
  {
    name: 'No off-palette CSS vars',
    test: c => {
      const styleBlocks = [...c.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]);
      const css = styleBlocks.join('\n');
      const defined = [...css.matchAll(/--([a-zA-Z][a-zA-Z0-9-]*)(?=\s*:)/g)].map(m => `--${m[1]}`);
      const offPalette = defined.filter(v => !ALLOWED_VARS.has(v));
      return offPalette.length === 0;
    },
    message: 'Off-palette CSS custom variables defined — only vars from tokens/*.json are permitted. Run: npm run build:tokens',
  },
  {
    name: 'No vivek@ in footer/contact',
    onlyPaths: /commons\/sales\//,
    test: c => !c.includes('vivek@dataskate.ai'),
    message: 'vivek@dataskate.ai found — sales material footers must use kailash@dataskate.ai (see CLAUDE.md Team section)',
  },
  {
    name: 'No competitor href links',
    test: c => {
      const found = COMPETITORS.domains.filter(domain =>
        new RegExp(`href=["'][^"']*${domain.replace('.', '\\.')}`, 'i').test(c)
      );
      if (found.length === 0) return true;
      CHECKS._competitorDomainsFound = found;
      return false;
    },
    message: () => `Competitor domain linked in href — remove the link but keep the use case text. Found: ${(CHECKS._competitorDomainsFound || []).join(', ')}`,
  },
  {
    name: 'No mailto in submit handler',
    test: c => {
      const fp = c.match(/<!--\s*DS-GENERATED:\s*template=([a-z-]+)/i);
      if (!fp || fp[1] !== 'intake') return true;
      return !/<form[^>]*action=["']\s*mailto:/i.test(c) &&
             !/\bon(?:click|submit)\s*=\s*["'][^"']*mailto:/i.test(c) &&
             !/location\.href\s*=\s*['"]mailto:/i.test(c);
    },
    message: 'mailto: detected in an intake submit handler — intake submits must save to Firestore only.',
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const single = args[0] ? path.resolve(process.cwd(), args[0]) : null;

let targets;
if (single) {
  const rel = path.relative(ROOT, single);
  if (!rel.endsWith('.html') || rel.includes('node_modules') || rel.includes('.git') || isExcluded(rel)) {
    process.exit(0);
  }
  targets = [rel];
} else {
  targets = getAllHtmlTargets().filter(rel => !isExcluded(rel));
}

if (targets.length === 0) process.exit(0);

let anyFail = false;

for (const rel of targets) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;

  const content  = fs.readFileSync(file, 'utf8');
  const failures = CHECKS.filter(c => {
    if (c.onlyPaths && !c.onlyPaths.test(rel)) return false;
    return !c.test(content);
  });

  if (failures.length) {
    anyFail = true;
    console.error(`\n✗  ${rel}`);
    failures.forEach(f => console.error(`   • [${f.name}] ${typeof f.message === 'function' ? f.message() : f.message}`));
  } else {
    console.log(`✓  ${rel}`);
  }
}

if (anyFail) {
  console.error('\nHTML lint FAILED — fix all violations before pushing.');
  process.exit(1);
} else {
  console.log('\nAll HTML checks passed.');
  process.exit(0);
}
