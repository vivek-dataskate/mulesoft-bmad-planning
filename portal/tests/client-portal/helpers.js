'use strict';
// portal/tests/client-portal/helpers.js

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BUILD_DIR = path.join(REPO_ROOT, 'portal/_build/portal');

function getPortalHtmlPath(slug) {
  return path.join(BUILD_DIR, `${slug}.html`);
}

function getPortalHtml(slug) {
  const p = getPortalHtmlPath(slug);
  if (!fs.existsSync(p)) {
    throw new Error(`Built HTML not found: ${p}\nRun "npm run build:html" first.`);
  }
  return fs.readFileSync(p, 'utf8');
}

function getBuiltSlugs() {
  if (!fs.existsSync(BUILD_DIR)) return [];
  return fs.readdirSync(BUILD_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => f.replace('.html', ''));
}

module.exports = { getPortalHtmlPath, getPortalHtml, getBuiltSlugs };
