// Subset of clients that have a portal-content.json — used by site/portal/client.njk
// to skip projects in scoping-only state.
const clients = require('./clients')();
module.exports = function() {
  return clients.filter(c => c.portal && c.portal.meta);
};
