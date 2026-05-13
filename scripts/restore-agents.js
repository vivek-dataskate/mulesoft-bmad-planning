#!/usr/bin/env node
/**
 * Download and extract the BMAD agent framework into .agent/ during container rebuild.
 *
 * Called automatically by devcontainer postCreateCommand.
 * Safe to run manually anytime — skips if .agent/ already exists unless --force is passed.
 *
 * Usage:
 *   node scripts/restore-agents.js           # skip if already present
 *   node scripts/restore-agents.js --force   # always re-download
 *
 * Requires FIREBASE_SA_KEY env var or service account JSON at repo root.
 */

const admin    = require('firebase-admin');
const { execSync } = require('child_process');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');

const ROOT    = path.join(__dirname, '..');
const BUCKET  = 'dataskateclients.firebasestorage.app';
const STORAGE_PATH = 'agent-framework/agents-latest.tar.gz';
const AGENT_DIR    = path.join(ROOT, '.agent');

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(ROOT, 'dataskateclients-firebase-adminsdk-fbsvc-6d3f67e197.json');

const force = process.argv.includes('--force');

function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function humanSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

async function main() {
  // Skip if already present (unless --force)
  if (!force && fs.existsSync(AGENT_DIR)) {
    log('.agent/ already present — skipping restore. Use --force to re-download.');
    return;
  }

  if (!fs.existsSync(SA_PATH)) {
    log('WARNING: Service account not found — skipping agent framework restore.');
    log('  Set FIREBASE_SA_KEY secret in Codespace settings and rebuild to get agents.');
    return;
  }

  log('Restoring BMAD agent framework from Firebase Storage…');

  admin.initializeApp({
    credential:    admin.credential.cert(JSON.parse(fs.readFileSync(SA_PATH, 'utf8'))),
    storageBucket: BUCKET,
  });
  const bucket = admin.storage().bucket();

  const tmp = path.join(os.tmpdir(), 'agents-latest.tar.gz');

  log(`Downloading gs://${BUCKET}/${STORAGE_PATH}…`);
  await bucket.file(STORAGE_PATH).download({ destination: tmp });

  const size = fs.statSync(tmp).size;
  log(`Downloaded ${humanSize(size)} — extracting…`);

  // Remove stale .agent/ before extracting to avoid leftover files
  if (fs.existsSync(AGENT_DIR)) {
    fs.rmSync(AGENT_DIR, { recursive: true });
  }

  execSync(`tar -xzf "${tmp}" -C "${ROOT}"`, { stdio: 'pipe' });
  fs.unlinkSync(tmp);

  const fileCount = execSync(`find "${AGENT_DIR}" -type f | wc -l`).toString().trim();
  log(`Done. Agent framework restored: ${fileCount} files in .agent/`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
