// Subset of clients that have a pitch-kit-content.json — used by
// src/internal/pitch-kit.njk to skip clients in scoping-only state.
const clients = require('./clients')();
module.exports = function() {
  return clients.filter(c => c.pitchKit && c.pitchKit.meta);
};
