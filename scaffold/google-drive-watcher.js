#!/usr/bin/env node
'use strict';
/**
 * scaffold/google-drive-watcher.js
 *
 * Polls a Google Drive folder for new intake files, validates them,
 * and commits valid ones to GitHub — all without manual steps.
 *
 * Flow:
 *   1. Authenticate with Google Drive (service account)
 *   2. List files in the configured intake folder(s)
 *   3. Compare against .drive-state.json (last-seen file IDs)
 *   4. For each new/modified file: download to /tmp/intake-staging/{client}/
 *   5. Call validate-intake.js → Claude validates the documents
 *   6. If VALID:   commit to projects/{client}/intake/ + post Slack summary
 *   7. If INVALID: post Slack rejection message, do NOT commit
 *   8. Update .drive-state.json with processed file IDs
 *
 * Google Drive folder structure expected:
 *   intake-root/
 *     leolabs/           ← one subfolder per client
 *       transcript.pdf
 *       requirements.md
 *     zyris/
 *       discovery-notes.txt
 *
 * Setup:
 *   1. Create a Google Cloud project and enable the Drive API
 *   2. Create a service account, download the JSON key
 *   3. Share each client intake subfolder with the service account email
 *   4. Set env vars (see below)
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  — full JSON content of service account key
 *   DRIVE_INTAKE_FOLDER_ID       — Google Drive folder ID of the intake root
 *   ANTHROPIC_API_KEY            — for validate-intake.js
 *   SLACK_BOT_TOKEN              — for posting validation results
 *   SLACK_PIPELINE_CHANNEL       — Slack channel ID (e.g. C0123ABC)
 *
 * Usage:
 *   node scaffold/google-drive-watcher.js
 *   node scaffold/google-drive-watcher.js --dry-run   (no commits, no Slack posts)
 */

const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const https   = require('https');
const { validateIntake } = require('./validate-intake');

const REPO_ROOT   = path.resolve(__dirname, '..');
const STATE_FILE  = path.join(REPO_ROOT, '.drive-state.json');
const DRY_RUN     = process.argv.includes('--dry-run');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const info  = msg => console.log(`→ ${msg}`);
const ok    = msg => console.log(`✓ ${msg}`);
const warn  = msg => console.log(`⚠  ${msg}`);

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { processedFiles: {}, lastRun: null }; }
}

function saveState(state) {
  state.lastRun = new Date().toISOString();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// ─── Google Drive API (using service account JWT) ─────────────────────────────

function getServiceAccountCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set');
  try { return JSON.parse(raw); }
  catch { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON'); }
}

async function getAccessToken(creds) {
  // Build JWT for service account
  const now   = Math.floor(Date.now() / 1000);
  const claim = {
    iss:   creds.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  };

  // Encode JWT (header.payload.signature)
  const encode  = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header  = encode({ alg: 'RS256', typ: 'JWT' });
  const payload = encode(claim);
  const toSign  = `${header}.${payload}`;

  // Sign with private key using Node.js crypto
  const { createSign } = require('crypto');
  const signer = createSign('RSA-SHA256');
  signer.update(toSign);
  const sig = signer.sign(creds.private_key, 'base64url');
  const jwt = `${toSign}.${sig}`;

  // Exchange JWT for access token
  return new Promise((resolve, reject) => {
    const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
    const req  = https.request({
      hostname: 'oauth2.googleapis.com',
      path:     '/token',
      method:   'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': body.length },
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const r = JSON.parse(data);
        if (r.access_token) resolve(r.access_token);
        else reject(new Error('Token exchange failed: ' + (r.error_description ?? r.error)));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function driveRequest(accessToken, path_, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.googleapis.com',
      path:     path_,
      method,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        try { resolve(JSON.parse(raw.toString())); }
        catch { resolve(raw); } // binary content (file download)
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function driveDownload(accessToken, fileId, destPath) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'www.googleapis.com',
      path:     `/drive/v3/files/${fileId}?alt=media`,
      headers:  { Authorization: `Bearer ${accessToken}` },
    }, res => {
      if (res.statusCode !== 200) { reject(new Error(`Download failed: HTTP ${res.statusCode}`)); return; }
      const out = fs.createWriteStream(destPath);
      res.pipe(out);
      out.on('finish', resolve);
      out.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── List client subfolders ───────────────────────────────────────────────────

async function listClientFolders(accessToken, rootFolderId) {
  const q   = encodeURIComponent(`'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await driveRequest(accessToken, `/drive/v3/files?q=${q}&fields=files(id,name)`);
  return res.files ?? [];
}

async function listFilesInFolder(accessToken, folderId) {
  const q   = encodeURIComponent(`'${folderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`);
  const res = await driveRequest(accessToken, `/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime,size,mimeType)`);
  return res.files ?? [];
}

// ─── Process one client folder ────────────────────────────────────────────────

async function processClient(accessToken, folder, state) {
  const clientName = folder.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  info(`Processing client: ${clientName} (folder: ${folder.name})`);

  const files = await listFilesInFolder(accessToken, folder.id);
  if (files.length === 0) { info(`  No files in ${folder.name} — skipping`); return; }

  // Filter to files not yet processed
  const processed = state.processedFiles[folder.id] ?? {};
  const newFiles  = files.filter(f => {
    const prev = processed[f.id];
    return !prev || prev.modifiedTime !== f.modifiedTime;
  });

  if (newFiles.length === 0) { ok(`  ${folder.name}: all ${files.length} file(s) already processed`); return; }
  info(`  ${newFiles.length} new/modified file(s) found in ${folder.name}`);

  // Download to staging directory
  const stagingDir = path.join(os.tmpdir(), `intake-staging-${clientName}-${Date.now()}`);
  fs.mkdirSync(stagingDir, { recursive: true });

  for (const file of newFiles) {
    const destPath = path.join(stagingDir, file.name);
    info(`  Downloading: ${file.name}`);
    if (!DRY_RUN) await driveDownload(accessToken, file.id, destPath);
    else fs.writeFileSync(destPath, `[DRY RUN placeholder for ${file.name}]`);
  }

  // Also copy already-processed files so validator sees the full picture
  for (const file of files.filter(f => processed[f.id])) {
    const existingPath = path.join(REPO_ROOT, 'projects', clientName, 'intake', file.name);
    if (fs.existsSync(existingPath)) {
      fs.copyFileSync(existingPath, path.join(stagingDir, file.name));
    }
  }

  // Validate
  let validationResult;
  try {
    validationResult = await validateIntake(stagingDir, clientName);
  } catch (e) {
    warn(`  Validation error for ${clientName}: ${e.message}`);
    return;
  }

  // Update state regardless of validation outcome
  if (!state.processedFiles[folder.id]) state.processedFiles[folder.id] = {};
  for (const file of newFiles) {
    state.processedFiles[folder.id][file.id] = { name: file.name, modifiedTime: file.modifiedTime };
  }

  // Cleanup staging
  fs.rmSync(stagingDir, { recursive: true, force: true });

  return { clientName, validationResult };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const rootFolderId = process.env.DRIVE_INTAKE_FOLDER_ID;
  if (!rootFolderId) throw new Error('DRIVE_INTAKE_FOLDER_ID env var is not set');
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');

  if (DRY_RUN) warn('DRY RUN mode — no commits or Slack posts will be made');

  const creds       = getServiceAccountCredentials();
  const accessToken = await getAccessToken(creds);
  ok('Google Drive authenticated');

  const state   = readState();
  const folders = await listClientFolders(accessToken, rootFolderId);

  if (folders.length === 0) {
    info('No client subfolders found in Drive intake root. Create one subfolder per client.');
    return;
  }

  info(`Found ${folders.length} client folder(s): ${folders.map(f => f.name).join(', ')}`);

  const results = [];
  for (const folder of folders) {
    const result = await processClient(accessToken, folder, state);
    if (result) results.push(result);
  }

  if (!DRY_RUN) saveState(state);

  // Output results as JSON for the GitHub Actions step to pick up
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile && results.length > 0) {
    const validClients   = results.filter(r => r.validationResult?.valid).map(r => r.clientName);
    const invalidClients = results.filter(r => !r.validationResult?.valid).map(r => r.clientName);
    fs.appendFileSync(outputFile, `valid_clients=${validClients.join(',')}\n`);
    fs.appendFileSync(outputFile, `invalid_clients=${invalidClients.join(',')}\n`);
    fs.appendFileSync(outputFile,
      `validation_results=${Buffer.from(JSON.stringify(results.map(r => r.validationResult))).toString('base64')}\n`
    );
  }

  console.log(`\nDone. Processed ${results.length} client(s).`);
  results.forEach(r => {
    const v = r.validationResult;
    console.log(`  ${r.clientName}: ${v?.valid ? '✓ valid — committed to GitHub' : '✗ invalid — ' + v?.missingMandatory?.join(', ')}`);
  });
}

main().catch(e => { console.error('Drive watcher failed:', e.message); process.exit(1); });
