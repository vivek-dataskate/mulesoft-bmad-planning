// Subset of clients that have intake content — either intake-content.json or
// intake-questionnaire-{slug}.md — used by site/intake/intake.njk to paginate.
// JSON takes priority over MD when both exist (matches fill-template.js behaviour).
const clients = require('./clients')();
module.exports = function() {
  return clients.filter(c => c.intakeJson != null || c.intakeMd != null);
};
