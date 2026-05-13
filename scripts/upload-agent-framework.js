#!/usr/bin/env node
/**
 * Upload the .agent/ framework folder to Firebase Storage as a tarball.
 *
 * Run this any time the BMAD agent framework is updated:
 *   node scripts/upload-agent-framework.js
 *
 * The restore counterpart (restore-agents.js) is called automatically by
 * devcontainer postCreateCommand so every rebuilt Codespace gets the agents.
 *
 * Storage path: agent-framework/agents-latest.tar.gz
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

function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function humanSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

async function main() {
  if (!fs.existsSync(AGENT_DIR)) {
    console.error(`ERROR: ${AGENT_DIR} not found. Nothing to upload.`);
    process.exit(1);
  }

  if (!fs.existsSync(SA_PATH)) {
    console.error(`ERROR: Service account not found at ${SA_PATH}.\nSet GOOGLE_APPLICATION_CREDENTIALS or restore from FIREBASE_SA_KEY secret.`);
    process.exit(1);
  }

  // Build tarball
  const tmp = path.join(os.tmpdir(), 'agents-latest.tar.gz');
  log('Creating tarball…');
  execSync(`tar -czf "${tmp}" -C "${ROOT}" .agent`, { stdio: 'pipe' });
  const size = fs.statSync(tmp).size;
  log(`Tarball created: ${humanSize(size)}`);

  // Upload
  admin.initializeApp({
    credential:    admin.credential.cert(JSON.parse(fs.readFileSync(SA_PATH, 'utf8'))),
    storageBucket: BUCKET,
  });
  const bucket = admin.storage().bucket();

  log(`Uploading to gs://${BUCKET}/${STORAGE_PATH}…`);
  await bucket.upload(tmp, {
    destination: STORAGE_PATH,
    metadata: {
      contentType: 'application/gzip',
      metadata: { uploadedAt: new Date().toISOString() },
    },
  });

  fs.unlinkSync(tmp);
  log(`Done. Agents uploaded (${humanSize(size)}) → ${STORAGE_PATH}`);
  log('Restore with: node scripts/restore-agents.js');
}

main().catch(err => { console.error(err.message); process.exit(1); });
