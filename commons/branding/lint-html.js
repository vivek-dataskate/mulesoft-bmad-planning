#!/usr/bin/env node
// DataSkate HTML linter — self-contained, no external config files.
// Run automatically via PostToolUse hook on any .html file edit.
// Also runnable manually:
//   node commons/branding/lint-html.js               ← lint all known HTML files
//   node commons/branding/lint-html.js path/to/file  ← lint one file
//
// Rules live here as code. To add a rule: add a check to CHECKS.
// To add a hex exception: add to HEX_EXCEPTIONS_RAW below.
// To add a CSS var: add to tokens/*.json and run npm run build:tokens.

'use strict';
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { HTMLHint } = require('htmlhint');

// Load .htmlhintrc from repo root — standard HTML rules (tag-pair, attr-lowercase, etc.)
const HTMLHINT_RC_PATH = path.resolve(__dirname, '../../.htmlhintrc');
const HTMLHINT_RULES = fs.existsSync(HTMLHINT_RC_PATH)
  ? JSON.parse(fs.readFileSync(HTMLHINT_RC_PATH, 'utf8'))
  : {};

const COMPETITORS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'competitors.json'), 'utf8')
);

// ── Allowed CSS vars — derived from tokens.css, never hand-maintained ─────────
// Add new vars to tokens/*.json and run: npm run build:tokens
const TOKENS_CSS = fs.readFileSync(path.join(__dirname, 'generated/tokens.css'), 'utf8');
const ALLOWED_VARS = new Set(
  [...TOKENS_CSS.matchAll(/^\s*(--[a-zA-Z][a-zA-Z0-9-]*):/gm)].map(m => m[1])
);

// ── Logo heights — derived from tokens.js, keyed by template type ─────────────
// Values come from tokens/logo.json via build:tokens. Template key map is here
// because it's linter logic, not a token concern.
const TOKENS = require('./generated/tokens.js');
const LOGO_HEIGHTS = {
  intake:   TOKENS.LogoHeightIntake,
  proposal: TOKENS.LogoHeightProposal,
  guide:    TOKENS.LogoHeightGuide,
  portal:   TOKENS.LogoHeightPortal,
  deck:     TOKENS.LogoHeightDeck,
};
const LOGO_TEMPLATE_KEY = {
  'intake':           'intake',
  'proposal':         'proposal',
  'architect-guide':  'guide',
  'client-portal':    'portal',
  'integration-deck': 'deck',
  'corporate-brief':  'proposal',
  'ds-pricing-model': 'guide',
};

function expectedLogoHeightForFile(content) {
  const m = content.match(/<!--\s*DS-GENERATED:\s*template=([a-z-]+)/i);
  if (!m) return null;
  const key = LOGO_TEMPLATE_KEY[m[1]] || m[1];
  return LOGO_HEIGHTS[key] || null;
}

// ── Hex exceptions — legacy values present in older generated files ────────────
// Blessed so the linter stays green on deployed files. Migrate toward CSS vars
// when each file is next touched. Remove an entry once it has zero occurrences.
const HEX_EXCEPTIONS_RAW = [
  '#fff', '#ccc',
  // Status badge colours (submitted/progress/blocked) — now in tokens as --green-bg etc.
  '#D1FAE5', '#A7F3D0', '#065F46',   // green badge
  '#FEF3C7', '#FDE68A', '#92400E',   // amber badge
  '#FEE2E2', '#FECACA', '#991B1B',   // red/blocked badge
  '#FEF2F2', '#7F1D1D',              // P0 block
  // Scope / phase indicators
  '#276749', '#9B2335', '#7C5E10', '#78350F',
  '#68D391', '#F87171', '#C084FC',   // submit success, mandatory-empty, phase-3
  // Rail / surface tints (legacy portals)
  '#FFFAFA', '#FFE4E4', '#F1EEEE', '#FFF0F0',
  '#FFF5F5', '#F0FFF4', '#F0FFF6', '#F2F4F8',
  '#FAFAFA', '#f3f4f6', '#f7f7f7', '#F0F0F0',
  '#f0f0f2', '#e5e7eb', '#d1d5db', '#e2e8f0',
  '#ebebeb', '#e5e5ea', '#f2f2f4', '#fddede',
  '#FED7D7', '#f8d7da', '#d4edda', '#e0e7ff',
  '#dbeafe', '#bfdbfe', '#eff6ff', '#f0f4ff',
  '#f0f6ff', '#F0FFF6',
  // Legacy text/border colours in older files
  '#44546A', '#1C2B3A', '#718096', '#1a1a1a',
  '#3730a3', '#1e40af', '#1d4ed8', '#3b82f6',
  '#aaaaaa', '#999', '#888', '#333', '#111',
  '#1c1c1e', '#92640a', '#856404', '#721c24',
  '#fff3cd', '#fffbeb', '#d69e2e', '#ed1c24',
  '#FEE2E2', '#155724',
  '#1234',
];
const HEX_EXCEPTIONS = new Set(HEX_EXCEPTIONS_RAW.map(h => h.toLowerCase()));

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
    test: c => /:root\s*\{/.test(c) || /href=["'][^"']*\/tokens\.css["']/.test(c),
    message: 'Missing :root CSS custom properties block — either inline :root vars or link to /tokens.css',
  },
  {
    name: 'No off-palette CSS vars',
    test: c => {
      // Only check <style> blocks — inline style= attributes may use per-element
      // vars that are not palette-level definitions.
      const styleBlocks = [...c.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]);
      const css = styleBlocks.join('\n');
      const defined = [...css.matchAll(/--([a-zA-Z][a-zA-Z0-9-]*)(?=\s*:)/g)].map(m => `--${m[1]}`);
      const offPalette = defined.filter(v => !ALLOWED_VARS.has(v));
      return offPalette.length === 0;
    },
    message: 'Off-palette CSS custom variables defined — only vars from tokens/*.json are permitted. Add the new var to the relevant tokens/*.json file and run: npm run build:tokens',
  },

  // ── Body background ────────────────────────────────────────────────────────
  {
    name: 'White body background',
    test: c => !/body\s*\{[^}]*background\s*:\s*(#(?!fff\b|ffffff\b)[0-9a-fA-F]{3,6}|var\(--dark\))/.test(c),
    message: 'Non-white body background — body must use background:#fff (not #F5F5F5 or dark colors). ',
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  {
    name: 'No dark header background',
    test: c => !/\.header\s*\{[^}]*background\s*:\s*(var\(--dark\)|#1[Aa]1[Aa]1[Aa]|#111|#222|#333)/.test(c),
    message: 'Dark header background detected (.header { background: var(--dark) } or similar). Headers must be white.',
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
    message: 'Circle section numbers detected (.section-num with border-radius:50% + background). Section numbers must be plain red text, not filled circles.',
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
    message: 'Card-style .section wrapper with border-radius detected — use flat sections with border-bottom separators instead.',
  },

  // ── Email rules (sales materials only — not proposals/intake forms) ─────────
  {
    name: 'No vivek@ in footer/contact',
    onlyPaths: /commons\/sales\//,
    test: c => !c.includes('vivek@dataskate.ai'),
    message: 'vivek@dataskate.ai found — sales material footers must use kailash@dataskate.ai (kailash@dataskate.ai is the DataSkate sales contact)',
  },

  // ── Multi-page PDF rules ───────────────────────────────────────────────────
  {
    name: 'No full-page dark cover',
    test: c => !/\.cover\s*\{[^}]*height\s*:\s*100vh/.test(c),
    message: 'Full-page .cover { height:100vh } detected — use the standard .header pattern instead',
  },
  {
    name: 'No dark-bg metric cards',
    test: c => !/\.metric\b[^}]*\{[^}]*background\s*:\s*var\(--dark\)/.test(c),
    message: 'Dark-background .metric cards detected — use .stat-row / .stat instead',
  },

  // ── Logo (text fallback) ───────────────────────────────────────────────────
  {
    name: 'No CSS text logo',
    test: c => !/\.logo\s*\{[^}]*font-size/.test(c),
    message: 'CSS text logo (.logo { font-size... }) detected — use the inline SVG wordmark only, never a text/CSS logo',
  },

  // ── Competitor links ───────────────────────────────────────────────────────
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
    message: () => `Competitor domain linked in href — remove the link but keep the use case text. Found: ${(CHECKS._competitorDomainsFound || []).join(', ')}. See commons/branding/competitors.json.`,
  },

  // ── Arbitrary hex colors ───────────────────────────────────────────────────
  // Strips three legitimate-hex zones first so they don't false-flag:
  //  1. <svg>…</svg> — the inline wordmark uses literal brand colors
  //  2. :root { ... } — palette variable definitions own their hex values
  //  3. Any `--name: #xxx;` declaration line (per-component palette extensions)
  // Everything remaining must be in HEX_EXCEPTIONS_RAW in this file.
  {
    name: 'No arbitrary hex colors',
    test: c => {
      const stripped = c
        .replace(/<svg[\s\S]*?<\/svg>/gi, '')
        .replace(/:root\s*\{[^}]*\}/g, '')
        .replace(/--[a-z][a-z0-9-]*\s*:\s*#[0-9a-fA-F]{3,8}\s*;?/g, '');
      // Match 3/4/6/8-digit hex. Negative lookbehind on `&` skips HTML numeric
      // entities like &#9660; that would otherwise match as `#9660`. For 8-digit
      // (#RRGGBBAA), check if the base 6-digit is in the exceptions list —
      // palette+alpha overlays count as legitimate uses of the palette.
      const matches = stripped.match(/(?<!&)#[0-9a-fA-F]{3,8}\b/g) || [];
      const offenders = [...new Set(matches.map(h => h.toLowerCase()))]
        .filter(h => {
          if (HEX_EXCEPTIONS.has(h)) return false;
          if (h.length === 9) {                                  // #RRGGBBAA
            const base = h.slice(0, 7);                          // #RRGGBB
            if (HEX_EXCEPTIONS.has(base)) return false;
          }
          return true;
        });
      if (offenders.length === 0) return true;
      CHECKS._hexOffenders = offenders;
      return false;
    },
    message: () => `Hex colors used outside palette and exceptions list: ${(CHECKS._hexOffenders || []).join(', ')}. Replace with a CSS variable from the palette.`,
  },

  // ── Logo height per template type ──────────────────────────────────────────
  // Reads DS-GENERATED fingerprint to learn which template emitted the file,
  // then verifies the inline SVG height matches logo.heights[template].
  {
    name: 'Logo height matches spec',
    test: c => {
      const expected = expectedLogoHeightForFile(c);
      if (!expected) return true;                 // unknown template — skip silently
      const m = c.match(/viewBox="140 258 590 96"[^>]*?height:(\d+)px/);
      if (!m) return true;                        // no inline-height (CSS-sized) — separate check handles SVG presence
      const actual = m[1] + 'px';
      if (actual === expected) return true;
      CHECKS._logoExpected = expected;
      CHECKS._logoActual = actual;
      return false;
    },
    message: () => `Logo height ${CHECKS._logoActual} does not match tokens/logo.json (${CHECKS._logoExpected}). Update the inline SVG style attribute.`,
  },

  // ── Mailto in submit handlers ──────────────────────────────────────────────
  // Intake forms must save to Firestore only — no mailto: in submit handlers.
  // Intake submits MUST go to Firestore — no email composition fallback.
  // Proposal selection flows are allowed to use mailto as a supplementary
  // notification since they also write to Firestore (logDiscount).
  {
    name: 'No mailto in submit handler',
    test: c => {
      // Scope by DS-GENERATED fingerprint — only enforce on intake template.
      const fp = c.match(/<!--\s*DS-GENERATED:\s*template=([a-z-]+)/i);
      if (!fp || fp[1] !== 'intake') return true;
      const formAction   = /<form[^>]*action=["']\s*mailto:/i.test(c);
      const clickMailto  = /\bon(?:click|submit)\s*=\s*["'][^"']*mailto:/i.test(c);
      const locationSet  = /location\.href\s*=\s*['"]mailto:/i.test(c);
      return !(formAction || clickMailto || locationSet);
    },
    message: 'mailto: detected in an intake submit handler (form action / onclick / location.href). Intake submits must save to Firestore only.',
  },
];

// ─── DS-GENERATED fingerprint detection ──────────────────────────────────────
// Every HTML file emitted by commons/branding/fill-template.js carries a
// fingerprint comment as its last line:
//
//   <!-- DS-GENERATED: template={id} body-hash={16hex} inputs-hash={16hex} -->
//
// • body-hash   = sha256("template={id}|" + bodyWithoutFingerprint).slice(0,16)
//                 → detects direct edits to a generated file (FORBIDDEN).
// • inputs-hash = sha256(templateFile + shared-base.css.html).slice(0,16)
//                 → detects template / shared-CSS drift since file was emitted.
//
// THESE HELPERS MUST COMPUTE IDENTICALLY TO fill-template.js. If you change
// one, change the other in the same commit.
const FINGERPRINT_RE = /[\r\n]*<!-- DS-GENERATED:[^\n]*-->\s*$/m;
const FINGERPRINT_KV = /<!-- DS-GENERATED: template=(\S+) body-hash=(\S+) inputs-hash=(\S+) -->/;

function stripFingerprint(html) {
  return html.replace(FINGERPRINT_RE, '').replace(/\s*$/, '\n');
}

function hash16(...buffers) {
  const h = crypto.createHash('sha256');
  for (const b of buffers) h.update(b);
  return h.digest('hex').slice(0, 16);
}

function inputsHashOf(templateId) {
  const tplPath = path.join(ROOT, 'commons', 'templates', `${templateId}-template.html`);
  const cssPath = path.join(ROOT, 'commons', 'templates', 'shared-base.css.html');
  if (!fs.existsSync(tplPath) || !fs.existsSync(cssPath)) return null;
  return hash16(fs.readFileSync(tplPath), fs.readFileSync(cssPath));
}

// Map a file path back to its client slug, if any. Used to skip the inputs-hash
// check on frozen clients (intentional staleness).
function findClientSlug(rel) {
  let m;
  if ((m = rel.match(/^projects\/([^/]+)\//)))                                              return m[1];
  if ((m = rel.match(/^firebase\/public\/(?:intake|proposal|internal|portal)\/([^/]+)\.html$/))) return m[1];
  return null;
}

function isFrozenClient(slug) {
  if (!slug) return false;
  const pj = path.join(ROOT, 'projects', slug, 'project.json');
  if (!fs.existsSync(pj)) return false;
  try {
    return JSON.parse(fs.readFileSync(pj, 'utf8')).frozen === true;
  } catch {
    return false;
  }
}

// Returns array of violations: [{name, message}, …]. Empty if file is not a
// generated artifact (no fingerprint) or if both hashes match.
function validateFingerprint(content, rel) {
  const m = content.match(FINGERPRINT_KV);
  if (!m) return []; // not generated; nothing to validate
  const [, templateId, claimedBody, claimedInputs] = m;
  const violations = [];

  // 1) body-hash — any drift here means the generated file was edited directly.
  //                That is forbidden on every generated artifact, frozen or not.
  const body         = stripFingerprint(content);
  const actualBody   = hash16(`template=${templateId}|`, body);
  if (actualBody !== claimedBody) {
    violations.push({
      name: 'DS-GENERATED body-hash drift',
      message:
        `Generated file appears to have been edited directly ` +
        `(body-hash ${claimedBody} → ${actualBody}). ` +
        `Edit the source — docs/eleventy/_includes/layouts/${templateId}.njk or ` +
        `the corresponding content JSON — then re-run fill-template.js. ` +
        `Never hand-edit a DS-GENERATED file.`,
    });
  }

  // 2) inputs-hash — drift here means the template / shared CSS changed since
  //                  this file was emitted. SKIPPED for frozen clients: their
  //                  output is intentionally pinned to the template version
  //                  that was live when they were shipped.
  const slug = findClientSlug(rel);
  if (!isFrozenClient(slug)) {
    const actualInputs = inputsHashOf(templateId);
    if (actualInputs && actualInputs !== claimedInputs) {
      violations.push({
        name: 'DS-GENERATED inputs-hash drift',
        message:
          `Template or shared-base.css.html has changed since this file was ` +
          `generated (inputs-hash ${claimedInputs} → ${actualInputs}). ` +
          `Re-run fill-template.js to refresh.`,
      });
    }
  }

  return violations;
}

// ── Main ──────────────────────────────────────────────────────────────────────
const args   = process.argv.slice(2);
const single = args[0] ? path.resolve(process.cwd(), args[0]) : null;

// Paths excluded from linting — templates, CSS snippets, and Eleventy build artifacts
const EXCLUDE_PATTERNS = [
  /^commons\/branding\/templates\//,              // shell templates — CSS injected at fill time
  /^commons\/branding\/[^/]+-base\.css\.html$/,   // CSS snippets in branding/
  /^commons\/templates\//,                        // all files in templates/ are partials or design previews
  /^docs\/eleventy\/_build\/shared-base\.css\.html$/, // Eleventy passthrough of the CSS partial
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

  // Standard HTML validation via htmlhint (tag balance, attr rules, etc.)
  const hintMessages = Object.keys(HTMLHINT_RULES).length
    ? HTMLHint.verify(content, HTMLHINT_RULES)
    : [];
  const hintFailures = hintMessages.map(m => ({
    name: `htmlhint:${m.rule.id}`,
    message: `${m.message} (line ${m.line}, col ${m.col})`,
  }));

  // DataSkate-specific semantic checks
  const failures = CHECKS.filter(c => {
    if (c.onlyPaths && !c.onlyPaths.test(rel)) return false;
    return !c.test(content);
  });

  // Fingerprint check is separate from CHECKS because it needs the file path
  // (to discover templateId from the embedded comment + frozen-client lookup).
  const fpFailures = validateFingerprint(content, rel);
  const allFailures = [...hintFailures, ...failures, ...fpFailures];

  if (allFailures.length) {
    anyFail = true;
    console.error(`\n✗  ${rel}`);
    allFailures.forEach(f => console.error(`   • [${f.name}] ${typeof f.message === 'function' ? f.message() : f.message}`));
  } else {
    console.log(`✓  ${rel}`);
  }
}

if (anyFail) {
  console.error('\nHTML lint FAILED — fix all violations before pushing.');
  console.error('Fix violations before continuing\n');
  process.exit(1);
} else {
  console.log('\nAll HTML checks passed.\n');
  process.exit(0);
}
