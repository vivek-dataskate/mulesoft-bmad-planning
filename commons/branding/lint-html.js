#!/usr/bin/env node
// Validates HTML files against HTML_DESIGN_STANDARDS.md.
// Run automatically via PostToolUse hook on any .html file edit.
// Also runnable manually:
//   node commons/branding/lint-html.js               ← lint all known HTML files
//   node commons/branding/lint-html.js path/to/file  ← lint one file

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '../..');

// Full-scan targets (used when no file arg is passed)
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

// Each check: test(content) returns true to PASS
const CHECKS = [
  // ── Logo ───────────────────────────────────────────────────────────────────
  {
    name: 'SVG logo',
    test: c => c.includes('viewBox="140 258 590 96"'),
    message: 'Missing inline SVG logo (viewBox="140 258 590 96") — every HTML doc must include the DataSkate wordmark SVG',
  },

  // ── Color variables ────────────────────────────────────────────────────────
  {
    name: ':root CSS vars',
    test: c => /:root\s*\{/.test(c),
    message: 'Missing :root CSS custom properties block — copy verbatim from HTML_DESIGN_STANDARDS.md',
  },
  {
    name: 'No off-palette CSS vars',
    test: c => {
      // Only the 11 standard vars are allowed. Flag any custom var definitions
      // like --blue, --gray, --purple, --teal, --navy, etc.
      const allowedVars = new Set([
        '--brand','--brand-dk','--dark','--mid','--light','--border',
        '--green','--amber','--amber-bg','--blue-bg','--blue-br',
      ]);
      const defined = [...c.matchAll(/--([a-z][a-z0-9-]*)(?=\s*:)/g)].map(m => `--${m[1]}`);
      const offPalette = defined.filter(v => !allowedVars.has(v));
      return offPalette.length === 0;
    },
    message: 'Off-palette CSS custom variables defined — only the 11 standard vars are allowed (see HTML_DESIGN_STANDARDS.md: Color Palette). Remove --blue, --gray, or any other invented vars.',
  },

  // ── Body background ────────────────────────────────────────────────────────
  {
    name: 'White body background',
    test: c => !/body\s*\{[^}]*background\s*:\s*(#(?!fff\b|ffffff\b)[0-9a-fA-F]{3,6}|var\(--dark\))/.test(c),
    message: 'Non-white body background — body must use background:#fff (not #F5F5F5 or dark colors). See HTML_DESIGN_STANDARDS.md: Page Layout.',
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  {
    name: 'No dark header background',
    test: c => !/\.header\s*\{[^}]*background\s*:\s*(var\(--dark\)|#1[Aa]1[Aa]1[Aa]|#111|#222|#333)/.test(c),
    message: 'Dark header background detected (.header { background: var(--dark) } or similar). Headers must be white. See HTML_DESIGN_STANDARDS.md: Header Component.',
  },

  // ── Section numbers ────────────────────────────────────────────────────────
  {
    name: 'No circle section numbers',
    test: c => {
      // Detects .section-num with both border-radius:50% and a background fill
      const block = c.match(/\.section-num\s*\{([^}]*)\}/);
      if (!block) return true;
      const body = block[1];
      const hasCircle = /border-radius\s*:\s*50%/.test(body);
      const hasBg = /background\s*:/.test(body);
      return !(hasCircle && hasBg);
    },
    message: 'Circle section numbers detected (.section-num with border-radius:50% + background). Section numbers must be plain red text, not filled circles. See HTML_DESIGN_STANDARDS.md: Section Headers.',
  },

  // ── Section wrappers ───────────────────────────────────────────────────────
  {
    name: 'No card-style section wrappers',
    test: c => {
      const block = c.match(/\.section\b[^{]*\{([^}]*)\}/);
      if (!block) return true;
      const body = block[1];
      return !/border-radius\s*:\s*(?!0)[0-9]/.test(body);
    },
    message: 'Card-style .section wrapper with border-radius detected — use flat sections with border-bottom separators instead. See HTML_DESIGN_STANDARDS.md: Page Layout ("no card boxes").',
  },

  // ── Email rules (sales materials only — not proposals/intake forms) ─────────
  {
    name: 'No vivek@ in footer/contact',
    onlyPaths: /commons\/sales\//,
    test: c => !c.includes('vivek@dataskate.ai'),
    message: 'vivek@dataskate.ai found — sales material footers must use kailash@dataskate.ai (see CLAUDE.md Team section)',
  },

  // ── Multi-page PDF rules ───────────────────────────────────────────────────
  {
    name: 'No full-page dark cover',
    test: c => !/\.cover\s*\{[^}]*height\s*:\s*100vh/.test(c),
    message: 'Full-page .cover { height:100vh } detected — use the standard .header pattern instead (HTML_DESIGN_STANDARDS.md: Multi-Page PDF Documents)',
  },
  {
    name: 'No dark-bg metric cards',
    test: c => !/\.metric\b[^}]*\{[^}]*background\s*:\s*var\(--dark\)/.test(c),
    message: 'Dark-background .metric cards detected — use .stat-row / .stat instead (HTML_DESIGN_STANDARDS.md: Multi-Page PDF Documents)',
  },

  // ── Logo (text fallback) ───────────────────────────────────────────────────
  {
    name: 'No CSS text logo',
    test: c => !/\.logo\s*\{[^}]*font-size/.test(c),
    message: 'CSS text logo (.logo { font-size... }) detected — use the inline SVG wordmark only, never a text/CSS logo',
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const single = args[0] ? path.resolve(process.cwd(), args[0]) : null;

// Paths excluded from linting — templates and CSS snippets are partial files
const EXCLUDE_PATTERNS = [
  /^commons\/branding\/templates\//,   // shell templates — CSS injected at fill time, not a full doc
  /^commons\/branding\/[^/]+-base\.css\.html$/,  // CSS snippet files — not full HTML documents
];

function isExcluded(rel) {
  return EXCLUDE_PATTERNS.some(p => p.test(rel));
}

let targets;
if (single) {
  const rel = path.relative(ROOT, single);
  if (!rel.endsWith('.html') || rel.includes('node_modules') || rel.includes('.git') || isExcluded(rel)) {
    process.exit(0); // not a lintable project HTML file — silent pass
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
    failures.forEach(f => console.error(`   • [${f.name}] ${f.message}`));
  } else {
    console.log(`✓  ${rel}`);
  }
}

if (anyFail) {
  console.error('\nHTML lint FAILED — fix all violations before pushing.');
  console.error('Reference: commons/branding/HTML_DESIGN_STANDARDS.md\n');
  process.exit(1);
} else {
  console.log('\nAll HTML checks passed.\n');
  process.exit(0);
}
