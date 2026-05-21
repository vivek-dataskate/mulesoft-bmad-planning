'use strict';
// portal/tests/resources/helpers.js

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const BUILD_DIR = path.join(REPO_ROOT, 'portal/_build/resources');

const KNOWN_FILES = {
  'architect-guide':  'architect-guide.html',
  'ds-pricing-model': 'ds-pricing-model.html',
};

function getResourceHtmlPath(name) {
  const file = KNOWN_FILES[name];
  if (!file) throw new Error(`Unknown resource: ${name}`);
  return path.join(BUILD_DIR, file);
}

function getResourceHtml(name) {
  const p = getResourceHtmlPath(name);
  if (!fs.existsSync(p)) {
    throw new Error(`Built HTML not found: ${p}\nRun "npm run build:html" first.`);
  }
  return fs.readFileSync(p, 'utf8');
}

function getResourceUrl(name) {
  return `file://${getResourceHtmlPath(name)}`;
}

function getBuiltResources() {
  if (!fs.existsSync(BUILD_DIR)) return [];
  return Object.keys(KNOWN_FILES).filter(name =>
    fs.existsSync(path.join(BUILD_DIR, KNOWN_FILES[name]))
  );
}

module.exports = { getResourceHtmlPath, getResourceHtml, getResourceUrl, getBuiltResources };
