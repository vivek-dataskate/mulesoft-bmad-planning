'use strict';
// portal/tests/corporate-brief/helpers.js

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BUILD_DIR = path.join(REPO_ROOT, 'portal/_build/intake');

function getBriefHtmlPath(slug) {
  return path.join(BUILD_DIR, `corporate-brief-${slug}.html`);
}

function getBriefHtml(slug) {
  const p = getBriefHtmlPath(slug);
  if (!fs.existsSync(p)) {
    throw new Error(`Built HTML not found: ${p}\nRun "npm run build:html" first.`);
  }
  return fs.readFileSync(p, 'utf8');
}

function getBuiltSlugs() {
  if (!fs.existsSync(BUILD_DIR)) return [];
  return fs.readdirSync(BUILD_DIR)
    .filter(f => f.startsWith('corporate-brief-') && f.endsWith('.html'))
    .map(f => f.replace('corporate-brief-', '').replace('.html', ''));
}

module.exports = { getBriefHtmlPath, getBriefHtml, getBuiltSlugs };
