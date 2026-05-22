#!/usr/bin/env node
// Thin passthrough — all Firebase logic lives in update-firebase.js (single-window pattern).
// Usage: node pipeline/scripts/upload-agent-framework.js
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const result = spawnSync(
  'node',
  [path.join(__dirname, 'update-firebase.js'), '--upload-agents'],
  { stdio: 'inherit' }
);
process.exit(result.status ?? 1);
