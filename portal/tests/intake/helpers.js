'use strict';
// tests/intake/helpers.js — shared utilities for intake HTML test suite.

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BUILD_DIR = path.join(REPO_ROOT, 'portal/_build/intake');

function getIntakeHtmlPath(slug) {
  return path.join(BUILD_DIR, `intake-questionnaire-${slug}.html`);
}

function getIntakeHtml(slug) {
  const p = getIntakeHtmlPath(slug);
  if (!fs.existsSync(p)) {
    throw new Error(`Built HTML not found: ${p}\nRun "npm run build:html" first.`);
  }
  return fs.readFileSync(p, 'utf8');
}

// file:// URL for Puppeteer page.goto()
function getIntakeUrl(slug) {
  return `file://${getIntakeHtmlPath(slug)}`;
}

// Discover all slugs that have a built intake HTML
function getBuiltSlugs() {
  if (!fs.existsSync(BUILD_DIR)) return [];
  return fs.readdirSync(BUILD_DIR)
    .filter(f => f.startsWith('intake-questionnaire-') && f.endsWith('.html'))
    .map(f => f.replace('intake-questionnaire-', '').replace('.html', ''));
}

// Wait for intake JS to finish initialising (DOMContentLoaded + updateProgress run)
async function waitForIntakeReady(page) {
  await page.waitForSelector('.sticky-bar', { timeout: 10000 });
  // progress-fill is set by updateProgress() — its presence means JS ran
  await page.waitForFunction(
    () => document.getElementById('answered-count') &&
          document.getElementById('answered-count').textContent !== '',
    { timeout: 10000 }
  );
}

module.exports = { getIntakeHtmlPath, getIntakeHtml, getIntakeUrl, getBuiltSlugs, waitForIntakeReady };
