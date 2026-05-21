// Subset of clients that have intake-content.json — used by site/intake/intake.njk to paginate.
const clients = require('./clients')();
module.exports = function() {
  return clients.filter(c => c.intakeJson != null);
};
