#!/usr/bin/env node
// scripts/visual-regression.js
//
// Pixel-accurate baseline + diff for every shipped HTML in this repo.
// Drift seatbelt: catches any unintended visual change to a client-facing
// HTML before it reaches a client.
//
// Usage:
//   node scripts/visual-regression.js baseline       ← capture baseline PNGs
//   node scripts/visual-regression.js diff           ← compare current vs baseline (all 29 pages)
//   node scripts/visual-regression.js diff --intake  ← compare INTAKE pages only (hard parity gate)
//   node scripts/visual-regression.js targets        ← list what would be captured
//
// Parity policy:
//   • Intake template is finalized — any diff on intake pages is a FAIL (non-zero exit).
//   • Proposal/portal/deck/resources templates are being iteratively refined —
//     diffs are surfaced but do NOT fail the run unless --strict is passed.
//     This matches the design workflow: templates evolve, clients regenerate,
//     intake stays pixel-stable so client URLs in hand keep working.
//
// Baselines live in tests/visual/baseline/<slug>.png (git-tracked).
// Diffs land in tests/visual/diff/<slug>.png (gitignored, written only on mismatch).
// A non-zero diff count exits non-zero so CI/regen scripts can fail fast.

'use strict';
const fs   = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const puppeteer  = require('puppeteer');

const ROOT     = path.resolve(__dirname, '..');
const BASELINE = path.join(ROOT, 'tests', 'visual', 'baseline');
const CURRENT  = path.join(ROOT, 'tests', 'visual', 'current');
const DIFF     = path.join(ROOT, 'tests', 'visual', 'diff');

// Viewport — desktop print width, matches the intake/proposal layout breakpoint
const VIEWPORT = { width: 1280, height: 1800, deviceScaleFactor: 1 };

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
        const base = file.replace(/\.html$/, '');
        targets.push({ slug: `proj-${slug}-${base}`, source: path.join('projects', slug, 'intake', file) });
      }
    }
  }

  const fbRoot = path.join(ROOT, 'firebase', 'public');
  if (fs.existsSync(fbRoot)) {
    const walk = (dir, prefix) => {
      for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) { walk(full, prefix + entry + '-'); continue; }
        if (!entry.endsWith('.html')) continue;
        const base = entry.replace(/\.html$/, '');
        targets.push({ slug: `fb-${prefix}${base}`, source: path.relative(ROOT, full) });
      }
    };
    walk(fbRoot, '');
  }

  return targets;
}

async function screenshotOne(browser, target, outDir) {
  const fullPath = path.join(ROOT, target.source);
  if (!fs.existsSync(fullPath)) return { skipped: true, reason: 'missing' };
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.goto('file://' + fullPath, { waitUntil: 'networkidle0', timeout: 30000 });
  // Kill animations/transitions for stable screenshots
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  const outPath = path.join(outDir, target.slug + '.png');
  await page.screenshot({ path: outPath, fullPage: true });
  await page.close();
  return { skipped: false, outPath };
}

async function captureAll(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const targets = discoverTargets();
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const results = [];
  try {
    for (const t of targets) {
      process.stdout.write(`  ${t.slug.padEnd(60)} `);
      try {
        const r = await screenshotOne(browser, t, outDir);
        if (r.skipped) { console.log(`SKIP (${r.reason})`); results.push({ ...t, status: 'skip' }); }
        else { console.log('OK'); results.push({ ...t, status: 'ok' }); }
      } catch (e) {
        console.log('ERROR: ' + e.message);
        results.push({ ...t, status: 'error', error: e.message });
      }
    }
  } finally { await browser.close(); }
  return results;
}

function diffPair(baselinePath, currentPath, diffPath) {
  const b = PNG.sync.read(fs.readFileSync(baselinePath));
  const c = PNG.sync.read(fs.readFileSync(currentPath));
  if (b.width !== c.width || b.height !== c.height) {
    return { changed: -1, w: b.width, h: b.height, cw: c.width, ch: c.height, dimensionMismatch: true };
  }
  const diff = new PNG({ width: b.width, height: b.height });
  const n = pixelmatch(b.data, c.data, diff.data, b.width, b.height, { threshold: 0.1 });
  if (n > 0) {
    fs.mkdirSync(path.dirname(diffPath), { recursive: true });
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
  }
  return { changed: n, w: b.width, h: b.height };
}

async function cmd_baseline() {
  console.log('Capturing baseline →', path.relative(ROOT, BASELINE));
  const results = await captureAll(BASELINE);
  const ok = results.filter(r => r.status === 'ok').length;
  console.log(`\n✓ Baseline complete: ${ok}/${results.length} pages captured.`);
}

// Intake pages are the hard parity gate — finalized template, shipped URLs in client hands.
// Any other diff is logged but doesn't fail the run (templates are still being refined).
function isIntakeTarget(filename) {
  // Matches: proj-<slug>-intake-questionnaire-<slug>.png, fb-intake-<slug>.png
  return /(^|-)intake(-questionnaire)?-/.test(filename) || /^fb-intake-/.test(filename);
}

async function cmd_diff(opts) {
  const intakeOnly = opts.intakeOnly;
  const strict     = opts.strict;
  console.log('Capturing current →', path.relative(ROOT, CURRENT));
  await captureAll(CURRENT);
  console.log(`\nDiffing current vs baseline${intakeOnly ? ' (intake pages only)' : ''}:`);
  fs.mkdirSync(DIFF, { recursive: true });
  let hardFailed = 0, softChanged = 0, clean = 0;
  for (const file of fs.readdirSync(BASELINE)) {
    if (!file.endsWith('.png')) continue;
    const isIntake = isIntakeTarget(file);
    if (intakeOnly && !isIntake) continue;
    const baselinePath = path.join(BASELINE, file);
    const currentPath  = path.join(CURRENT,  file);
    const gateLabel    = isIntake ? '[HARD]' : '[soft]';
    if (!fs.existsSync(currentPath)) {
      console.log(`  ${gateLabel} ${file.padEnd(64)} MISSING in current`);
      if (isIntake || strict) hardFailed++;
      continue;
    }
    const diffPath = path.join(DIFF, file);
    const r = diffPair(baselinePath, currentPath, diffPath);
    if (r.dimensionMismatch) {
      console.log(`  ${gateLabel} ${file.padEnd(64)} DIM MISMATCH ${r.w}x${r.h} -> ${r.cw}x${r.ch}`);
      if (isIntake || strict) hardFailed++; else softChanged++;
    } else if (r.changed > 0) {
      console.log(`  ${gateLabel} ${file.padEnd(64)} ${r.changed} px diff -> tests/visual/diff/${file}`);
      if (isIntake || strict) hardFailed++; else softChanged++;
    } else {
      console.log(`  ${gateLabel} ${file.padEnd(64)} clean`);
      clean++;
    }
  }
  console.log(`\n${clean} clean, ${softChanged} soft-changed (template-in-refinement), ${hardFailed} HARD-failed.`);
  if (hardFailed > 0) {
    console.error(`✗ Hard parity gate failed: ${hardFailed} intake page(s) diverge from baseline.`);
    process.exit(1);
  }
}

function cmd_targets() {
  for (const t of discoverTargets()) console.log(`${t.slug}\t${t.source}`);
}

const args = process.argv.slice(2);
const cmd  = args[0];
const opts = {
  intakeOnly: args.includes('--intake') || args.includes('--intake-only'),
  strict:     args.includes('--strict'),
};
if (cmd === 'baseline') cmd_baseline().catch(e => { console.error(e); process.exit(2); });
else if (cmd === 'diff') cmd_diff(opts).catch(e => { console.error(e); process.exit(2); });
else if (cmd === 'targets') cmd_targets();
else { console.error('Usage: visual-regression.js baseline | diff [--intake] [--strict] | targets'); process.exit(1); }
