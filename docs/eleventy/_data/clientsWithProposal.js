// Subset of clients that have a proposal-content.json — used by
// site/intake/proposal.njk to skip projects in scoping-only state.
const clients = require('./clients')();
module.exports = function() {
  return clients.filter(c => c.proposal && c.proposal.meta);
};
