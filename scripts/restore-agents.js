#!/usr/bin/env node
// Thin passthrough — all Firebase logic lives in update-firebase.js (single-window pattern).
// Usage: node scripts/restore-agents.js [--force]
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const result = spawnSync(
  'node',
  [path.join(__dirname, 'update-firebase.js'), '--restore-agents', ...process.argv.slice(2)],
  { stdio: 'inherit' }
);
process.exit(result.status ?? 1);
