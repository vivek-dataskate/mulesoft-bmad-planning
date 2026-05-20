#!/usr/bin/env node
// Validates HTML files against HTML_DESIGN_STANDARDS.md.
// Run automatically via PostToolUse hook on any .html file edit.
// Also runnable manually:
//   node commons/branding/lint-html.js               ← lint all known HTML files
//   node commons/branding/lint-html.js path/to/file  ← lint one file

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const COMPETITORS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'competitors.json'), 'utf8')
);

const STANDARDS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'HTML_DESIGN_STANDARDS.json'), 'utf8')
);

// Hex exceptions allowlist for the arbitrary-hex rule — normalised to lowercase.
const HEX_EXCEPTIONS = new Set(
  ((STANDARDS.forbidden.find(f => f.id === 'arbitrary-hex') || {}).exceptions || [])
    .map(h => h.toLowerCase())
);

// Map of template id (read from DS-GENERATED fingerprint) → key in logo.heights.
const LOGO_TEMPLATE_KEY = {
  intake: 'intake',
  proposal: 'proposal',
  'architect-guide': 'guide',
  'client-portal': 'portal',
  'integration-deck': 'deck',
  'corporate-brief': 'proposal',
  'ds-pricing-model': 'guide',
};

function expectedLogoHeightForFile(content) {
  const m = content.match(/<!--\s*DS-GENERATED:\s*template=([a-z-]+)/i);
  if (!m) return null;
  const key = LOGO_TEMPLATE_KEY[m[1]] || m[1];
  return ((STANDARDS.logo || {}).heights || {})[key] || null;
}

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
  // Everything remaining must be in HTML_DESIGN_STANDARDS arbitrary-hex.exceptions.
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
    message: () => `Hex colors used outside palette and exceptions list: ${(CHECKS._hexOffenders || []).join(', ')}. Add to HTML_DESIGN_STANDARDS.json forbidden[arbitrary-hex].exceptions or replace with a CSS variable from the palette.`,
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
    message: () => `Logo height ${CHECKS._logoActual} does not match HTML_DESIGN_STANDARDS.json logo.heights spec (${CHECKS._logoExpected}). Update the inline SVG style attribute.`,
  },

  // ── <details> structural balance ───────────────────────────────────────────
  // Catches the class of bug where a generator slices through a <details>
  // wrapper and leaves an unclosed tag → browser auto-nests every subsequent
  // sibling inside the broken parent, rendering only the first one visibly.
  // Strips <script>/<style> first so JS-comment mentions of `<details>` don't
  // false-trigger.
  {
    name: '<details> balance',
    test: c => {
      const stripped = c
        .replace(/<script\b[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[\s\S]*?<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');
      const re = /<\/?details\b[^>]*>/g;
      let m, depth = 0, deepestOpen = null;
      while ((m = re.exec(stripped)) !== null) {
        if (m[0].startsWith('</')) {
          depth--;
          if (depth < 0) { CHECKS._detailsErr = 'orphaned </details> at byte ' + m.index; return false; }
        } else {
          depth++;
          deepestOpen = m.index;
        }
      }
      if (depth !== 0) {
        CHECKS._detailsErr = depth + ' unclosed <details> remaining (last open near byte ' + deepestOpen + ')';
        return false;
      }
      return true;
    },
    message: () => `<details> tags are not balanced: ${CHECKS._detailsErr || 'unbalanced'}. This causes the browser to nest every subsequent sibling section inside the broken parent — only the first one renders visibly.`,
  },

  // ── Mailto in submit handlers ──────────────────────────────────────────────
  // Intake-form-specific rule (HTML_DESIGN_STANDARDS.json forbidden[mailto-submit]).
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
    message: 'mailto: detected in an intake submit handler (form action / onclick / location.href). Intake submits must save to Firestore only. See HTML_DESIGN_STANDARDS.json forbidden[mailto-submit].',
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
        `Edit the source — commons/templates/${templateId}-template.html or ` +
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

// Paths excluded from linting — templates and CSS snippets are partial files
const EXCLUDE_PATTERNS = [
  /^commons\/branding\/templates\//,    // shell templates — CSS injected at fill time
  /^commons\/branding\/[^/]+-base\.css\.html$/,  // CSS snippets in branding/
  /^commons\/templates\//,             // all files in templates/ are partials or design previews
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

  // Fingerprint check is separate from CHECKS because it needs the file path
  // (to discover templateId from the embedded comment + frozen-client lookup).
  const fpFailures = validateFingerprint(content, rel);
  const allFailures = [...failures, ...fpFailures];

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
  console.error('Reference: commons/branding/HTML_DESIGN_STANDARDS.md\n');
  process.exit(1);
} else {
  console.log('\nAll HTML checks passed.\n');
  process.exit(0);
}
