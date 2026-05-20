// Subset of clients that have a corporate-brief-content.json — used by
// site/intake/corporate-brief.njk to skip projects in scoping-only state.
const clients = require('./clients')();
module.exports = function() {
  return clients.filter(c => c.corporateBrief && c.corporateBrief.meta);
};
