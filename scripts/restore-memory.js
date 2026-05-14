#!/usr/bin/env node
// scripts/restore-memory.js
// Copies memory/ from the git repo back to ~/.claude/projects/... on container rebuild.
// Run automatically via postCreateCommand in devcontainer.json.

'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const repoRoot  = path.resolve(__dirname, '..');
const repoMem   = path.join(repoRoot, 'memory');

// Compute the Claude Code project memory path from the workspace path.
// Claude Code converts the workspace path to a slug by replacing / with -.
// e.g. /workspaces/mulesoft-bmad-planning → -workspaces-mulesoft-bmad-planning
const workspaceSlug = repoRoot.replace(/\//g, '-');
const claudeMem = path.join(os.homedir(), '.claude', 'projects', workspaceSlug, 'memory');

if (!fs.existsSync(repoMem)) {
  console.log('No memory/ directory in repo — nothing to restore.');
  process.exit(0);
}

fs.mkdirSync(claudeMem, { recursive: true });

const files = fs.readdirSync(repoMem).filter(f => f.endsWith('.md'));
let restored = 0;
for (const file of files) {
  const src  = path.join(repoMem, file);
  const dest = path.join(claudeMem, file);
  // Only restore if repo copy is newer or dest doesn't exist
  if (!fs.existsSync(dest) ||
      fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs) {
    fs.copyFileSync(src, dest);
    restored++;
  }
}

console.log(`✓ Memory restored: ${restored} file(s) → ${claudeMem}`);
