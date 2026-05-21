'use strict';
// portal/tests/deck/helpers.js

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BUILD_DIR = path.join(REPO_ROOT, 'portal/_build/internal');

function getDeckHtmlPath(slug) {
  return path.join(BUILD_DIR, `integration-deck-${slug}.html`);
}

function getDeckHtml(slug) {
  const p = getDeckHtmlPath(slug);
  if (!fs.existsSync(p)) {
    throw new Error(`Built HTML not found: ${p}\nRun "npm run build:html" first.`);
  }
  return fs.readFileSync(p, 'utf8');
}

function getBuiltSlugs() {
  if (!fs.existsSync(BUILD_DIR)) return [];
  return fs.readdirSync(BUILD_DIR)
    .filter(f => f.startsWith('integration-deck-') && f.endsWith('.html'))
    .map(f => f.replace('integration-deck-', '').replace('.html', ''));
}

module.exports = { getDeckHtmlPath, getDeckHtml, getBuiltSlugs };
