// Subset of clients that have a completed Sol SOW (scoping/run/sol.json with status='complete').
// Only included when the proposal was accepted — Sol's runner guards this.
const clients = require('./clients')();
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

module.exports = function () {
  return clients
    .map(c => {
      const sowPath = path.join(ROOT, 'projects', c.slug, 'scoping', 'run', 'sol.json');
      if (!fs.existsSync(sowPath)) return null;
      let sow;
      try { sow = JSON.parse(fs.readFileSync(sowPath, 'utf8')); } catch { return null; }
      if (!sow || sow.status !== 'complete') return null;
      return { ...c, sow };
    })
    .filter(Boolean);
};
