// Data sidecar for architect-guide.njk — reads commons/sales/architect-guide.json

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

module.exports = function() {
  const jsonPath = path.join(ROOT, 'commons', 'sales', 'architect-guide.json');
  const guide = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const meta  = guide.meta || {};
  return {
    parts:    guide.parts || [],
    meta,
    title:    meta.title    || 'Architect Guide',
    docTitle: meta.docTitle || (meta.title ? meta.title + ' — DataSkate' : 'Architect Guide — DataSkate'),
    eyebrow:  meta.eyebrow  || 'DataSkate Internal',
  };
};
