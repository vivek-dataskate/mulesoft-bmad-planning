// Data sidecar for architect-guide.njk — reads commons/sales/architect-guide.md
// and exposes it (plus title extracted from H1) to the page.

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

module.exports = function() {
  const md = fs.readFileSync(path.join(ROOT, 'commons', 'sales', 'architect-guide.md'), 'utf8');
  const titleMatch = md.match(/^#+ (.+)/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Architect Guide';
  return {
    contentMd: md,
    title,
    docTitle: title + ' — DataSkate',
    eyebrow: 'DataSkate Internal'
  };
};
