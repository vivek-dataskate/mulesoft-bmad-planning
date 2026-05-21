'use strict';
// portal/tests/proposal/helpers.js

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BUILD_DIR = path.join(REPO_ROOT, 'portal/_build/intake');

function getProposalHtmlPath(slug) {
  return path.join(BUILD_DIR, `proposal-${slug}.html`);
}

function getProposalHtml(slug) {
  const p = getProposalHtmlPath(slug);
  if (!fs.existsSync(p)) {
    throw new Error(`Built HTML not found: ${p}\nRun "npm run build:html" first.`);
  }
  return fs.readFileSync(p, 'utf8');
}

function getProposalUrl(slug) {
  return `file://${getProposalHtmlPath(slug)}`;
}

function getBuiltSlugs() {
  if (!fs.existsSync(BUILD_DIR)) return [];
  return fs.readdirSync(BUILD_DIR)
    .filter(f => f.startsWith('proposal-') && f.endsWith('.html'))
    .map(f => f.replace('proposal-', '').replace('.html', ''));
}

async function waitForProposalReady(page) {
  await page.waitForSelector('.sticky-bar', { timeout: 10000 });
  await page.waitForSelector('.tab-nav',    { timeout: 10000 });
}

module.exports = { getProposalHtmlPath, getProposalHtml, getProposalUrl, getBuiltSlugs, waitForProposalReady };
