#!/usr/bin/env node
// Thin passthrough — all Firebase logic lives in update-firebase.js (single-window pattern).
// Usage: node commons/branding/add-client-card.js --client <slug> [--status <status>]
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

// Map --client X → --add-client X (update-firebase.js uses --add-client)
const raw = process.argv.slice(2);
const clientIdx = raw.indexOf('--client');
const client    = clientIdx !== -1 ? raw[clientIdx + 1] : null;
if (!client) {
  console.error('Usage: node commons/branding/add-client-card.js --client <slug> [--status <status>]');
  process.exit(1);
}
const statusIdx = raw.indexOf('--status');
const fwdArgs   = ['--add-client', client, ...(statusIdx !== -1 ? ['--status', raw[statusIdx + 1]] : [])];

const result = spawnSync(
  'node',
  [path.join(__dirname, '../../scripts/update-firebase.js'), ...fwdArgs],
  { stdio: 'inherit' }
);
process.exit(result.status ?? 1);
