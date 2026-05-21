'use strict';
// tests/html/helpers.js — shared utilities for all generated HTML tests.

const fs   = require('fs');
const path = require('path');

const BUILD_DIR = path.resolve(__dirname, '../../portal/_build');

// Discover all built HTML files, grouped by template type.
// Returns: { intake: [...paths], proposal: [...paths], portal: [...paths], ... }
function discoverBuiltHtml() {
  const result = {};
  if (!fs.existsSync(BUILD_DIR)) return result;

  function walk(dir, relDir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), entry.name);
      } else if (entry.name.endsWith('.html') &&
                 entry.name !== 'shared-base.css.html') {
        const type = relDir || 'root';
        if (!result[type]) result[type] = [];
        result[type].push(path.join(dir, entry.name));
      }
    }
  }
  walk(BUILD_DIR, '');
  return result;
}

function fileUrl(absPath) {
  return `file://${absPath}`;
}

// Wait for a page's JS to finish bootstrapping.
// Falls back gracefully if the page has no progress counter.
async function waitForReady(page, timeout = 10000) {
  await page.waitForSelector('body', { timeout });
  try {
    // Intake pages expose answered-count after updateProgress() runs
    await page.waitForFunction(
      () => {
        const el = document.getElementById('answered-count');
        return !el || el.textContent.trim() !== '';
      },
      { timeout }
    );
  } catch {
    // Non-intake pages — just wait for DOMContentLoaded to settle
    await new Promise(r => setTimeout(r, 800));
  }
}

module.exports = { discoverBuiltHtml, fileUrl, waitForReady, BUILD_DIR };
