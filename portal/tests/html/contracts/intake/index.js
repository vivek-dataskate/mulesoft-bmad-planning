'use strict';
// Intake-specific contracts. Each file exports { name, tests: [{ name, run }] }.
// regressions/index.js exports an array — spread it in.

module.exports = [
  require('./structural'),
  require('./system-filter'),
  require('./navigation-depth'),
  require('./progress'),
  ...require('./regressions/index'),
];
