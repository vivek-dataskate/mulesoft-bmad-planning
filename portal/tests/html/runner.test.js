'use strict';
/**
 * tests/html/runner.test.js
 *
 * Generic HTML contract runner — discovers every built HTML file, groups it by
 * template type, and runs shared + type-specific contracts against it via Puppeteer.
 *
 * Adding a new HTML template type:
 *   1. Create tests/html/contracts/<type>/index.js  (exports array of contracts)
 *   2. Add a `typeContracts` entry and a filename-to-type rule in `resolveType()`.
 *   That's it. The runner picks it up on the next build.
 *
 * Adding a new contract to an existing type:
 *   Edit tests/html/contracts/<type>/index.js — no changes needed here.
 */

const puppeteer = require('puppeteer');
const path = require('path');
const { discoverBuiltHtml, fileUrl, waitForReady } = require('./helpers');

// ── Shared contracts run against every HTML file ──────────────────────────────
const sharedContracts = [
  require('./contracts/shared/page-load'),
  require('./contracts/shared/no-broken-anchors'),
  require('./contracts/shared/print-safe'),
];

// ── Per-type contract lists ───────────────────────────────────────────────────
const typeContracts = {
  'intake-questionnaire': require('./contracts/intake/index'),
  'proposal':             require('./contracts/proposal/index'),
  'portal':               require('./contracts/portal/index'),
  'internal':             require('./contracts/internal/index'),
  'resources':            require('./contracts/resources/index'),
};

/**
 * Map a built HTML file to its contract type key.
 * `buildDir` is the immediate subdirectory (e.g. "intake", "portal").
 * `filename` is the basename (e.g. "intake-questionnaire-agilemind.html").
 */
function resolveType(buildDir, filename) {
  if (buildDir === 'intake') {
    if (filename.startsWith('intake-questionnaire-')) return 'intake-questionnaire';
    if (filename.startsWith('proposal-'))             return 'proposal';
    return null; // corporate-brief or other — shared only
  }
  if (buildDir === 'portal')    return 'portal';
  if (buildDir === 'internal')  return 'internal';
  if (buildDir === 'resources') return 'resources';
  return null;
}

// ── Build-time discovery (synchronous — must complete before Jest collects) ───
const builtFiles = discoverBuiltHtml();
const BUILD_ROOT = path.resolve(__dirname, '../../portal/_build');

// Flatten to [{label, filePath, buildDir}] for cleaner iteration
const allFiles = [];
for (const [buildDir, files] of Object.entries(builtFiles)) {
  for (const filePath of files) {
    const label = path.relative(BUILD_ROOT, filePath);
    allFiles.push({ label, filePath, buildDir, filename: path.basename(filePath) });
  }
}

if (allFiles.length === 0) {
  test('no built HTML files found — run `npm run build:html` first', () => {
    throw new Error('portal/_build is empty. Build the portal before running html tests.');
  });
}

// ── Global Puppeteer browser ──────────────────────────────────────────────────
let browser;
beforeAll(async () => {
  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}, 30000);

afterAll(async () => {
  if (browser) await browser.close();
});

// ── Contract runner helper ────────────────────────────────────────────────────
/**
 * Registers a contract as a Jest describe block against a Puppeteer page.
 * Each contract gets its own page (fresh navigation) so tests are independent.
 */
function mountContract(contract, filePath) {
  describe(contract.name, () => {
    let page;
    const jsErrors = [];

    beforeAll(async () => {
      page = await browser.newPage();
      page._jsErrors = jsErrors;
      await page.setViewport({ width: 1280, height: 900 });
      page.on('pageerror', e => jsErrors.push(e.message));
      page.on('requestfailed', () => {}); // silence network errors for local files
      await page.goto(fileUrl(filePath), { waitUntil: 'domcontentloaded', timeout: 20000 });
      await waitForReady(page);
    }, 30000);

    afterAll(async () => {
      if (page && !page.isClosed()) await page.close();
    });

    for (const t of contract.tests) {
      test(t.name, () => t.run(page), 20000);
    }
  });
}

// ── One describe block per built HTML file ────────────────────────────────────
for (const { label, filePath, buildDir, filename } of allFiles) {
  describe(label, () => {
    // Shared contracts — every file
    for (const contract of sharedContracts) {
      mountContract(contract, filePath);
    }

    // Type-specific contracts
    const type = resolveType(buildDir, filename);
    if (type && typeContracts[type]) {
      for (const contract of typeContracts[type]) {
        mountContract(contract, filePath);
      }
    }
  });
}
