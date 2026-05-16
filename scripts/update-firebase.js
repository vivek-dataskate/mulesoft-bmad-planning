#!/usr/bin/env node
/**
 * Unified Firebase sync — the single entry point for all Firebase updates.
 *
 * What it does per project:
 *   1. Archive projects/{slug}/scoping/ files → Firebase Storage (private)
 *   2. Copy intake + proposal HTML       → firebase/public/intake|proposal/
 *   3. Regenerate projects-manifest.json
 *   4. Regenerate firebase/public/portal/{slug}.html
 *   5. Deploy to Firebase Hosting
 *
 * Called by: Scout (session 3), run-scout-pipeline.js, deploy.sh
 *
 * Usage:
 *   node scripts/update-firebase.js agilemind
 *   node scripts/update-firebase.js --all
 *   node scripts/update-firebase.js --all --no-deploy
 */

const admin = require('firebase-admin');
const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const PUBLIC   = path.join(ROOT, 'firebase', 'public');
const BUCKET   = 'dataskateclients.firebasestorage.app';
const PORTAL   = 'https://dataskateclients.web.app';
const FB_PROJ  = 'dataskateclients';

// Service account: file in repo root (restored by devcontainer) or env var path
const SA_PATH  = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(ROOT, 'dataskateclients-firebase-adminsdk-fbsvc-6d3f67e197.json');

function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

let _bucket = null;
function getBucket() {
  if (_bucket) return _bucket;
  if (!fs.existsSync(SA_PATH)) {
    throw new Error(`Service account not found at ${SA_PATH}. Set GOOGLE_APPLICATION_CREDENTIALS or restore from FIREBASE_SA_KEY secret.`);
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      credential:    admin.credential.cert(JSON.parse(fs.readFileSync(SA_PATH, 'utf8'))),
      storageBucket: BUCKET,
    });
  }
  _bucket = admin.storage().bucket();
  return _bucket;
}

// ── 1. Archive scoping/ → Firebase Storage ───────────────────────────────────
async function archiveScoping(slug) {
  const scopingDir = path.join(ROOT, 'projects', slug, 'scoping');
  if (!fs.existsSync(scopingDir)) return;

  const files = fs.readdirSync(scopingDir)
    .filter(f => fs.statSync(path.join(scopingDir, f)).isFile());
  if (!files.length) {
    fs.rmdirSync(scopingDir);
    return;
  }

  const projPath = path.join(ROOT, 'projects', slug, 'project.json');
  const proj = JSON.parse(fs.readFileSync(projPath, 'utf8'));
  const already = new Set((proj.sourceFiles || []).map(e => e.name));
  const bucket  = getBucket();
  const uploaded = [];

  for (const f of files) {
    const localPath = path.join(scopingDir, f);
    if (already.has(f)) {
      fs.unlinkSync(localPath);
      continue;
    }
    const dest = `source-files/${slug}/${f}`;
    process.stdout.write(`  [${slug}] upload: ${f} ... `);
    await bucket.upload(localPath, {
      destination: dest,
      metadata: { cacheControl: 'private, max-age=0' },
    });
    uploaded.push({
      name:       f,
      size:       humanSize(fs.statSync(localPath).size),
      uploadedAt: new Date().toISOString().slice(0, 10),
      url:        `https://console.cloud.google.com/storage/browser/_details/${BUCKET}/${dest}`,
    });
    fs.unlinkSync(localPath);
    console.log('done');
  }

  if (uploaded.length) {
    proj.sourceFiles       = [...(proj.sourceFiles || []), ...uploaded];
    proj.sourceFilesFolder = `https://console.cloud.google.com/storage/browser/${BUCKET}/source-files/${slug}`;
    fs.writeFileSync(projPath, JSON.stringify(proj, null, 2) + '\n');
    log(`[${slug}] ${uploaded.length} file(s) archived to Storage, project.json updated`);
  }

  const remaining = fs.readdirSync(scopingDir);
  if (!remaining.length) fs.rmdirSync(scopingDir);
}

// ── 2. Upload intake + proposal HTML → Firebase Storage (public) ─────────────
// Files are kept locally in firebase/public/{type}/ for git tracking and also
// uploaded to Storage for serving. Source files in projects/{slug}/intake/ are
// not deleted.
async function uploadHtmlToStorage(slug) {
  const intakeDir = path.join(ROOT, 'projects', slug, 'intake');
  if (!fs.existsSync(intakeDir)) return;

  // [localFilename, storageDest, projectJsonKey, firebase/public/ subdir]
  const pairs = [
    [`intake-questionnaire-${slug}.html`, `client-docs/${slug}/intake.html`,  'intakeUrl',   'intake'],
    [`proposal-${slug}.html`,             `client-docs/${slug}/proposal.html`, 'proposalUrl', 'proposal'],
    [`pitch-kit-${slug}.html`,            `internal/${slug}/pitch-kit.html`,   'pitchKitUrl', 'pitch-kit'],
  ];

  const projPath = path.join(ROOT, 'projects', slug, 'project.json');
  const proj = JSON.parse(fs.readFileSync(projPath, 'utf8'));
  let changed = false;

  for (const [src, dest, urlKey, pubSubdir] of pairs) {
    const srcPath = path.join(intakeDir, src);
    if (!fs.existsSync(srcPath)) continue;

    // Copy to firebase/public/{subdir}/ for git tracking
    const pubDir = path.join(PUBLIC, pubSubdir);
    fs.mkdirSync(pubDir, { recursive: true });
    fs.copyFileSync(srcPath, path.join(pubDir, `${slug}.html`));

    const bucket = getBucket();
    process.stdout.write(`  [${slug}] uploading ${src} → Storage ... `);
    await bucket.upload(srcPath, {
      destination: dest,
      metadata: { contentType: 'text/html; charset=utf-8', cacheControl: 'public, max-age=3600' },
    });
    const encodedDest = dest.replace(/\//g, '%2F');
    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodedDest}?alt=media`;
    console.log('done');

    if (proj[urlKey] !== url) {
      proj[urlKey] = url;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(projPath, JSON.stringify(proj, null, 2) + '\n');
    log(`[${slug}] project.json updated with Storage URLs`);
  }
}


// ── Commit all generated HTML in firebase/public/ to git ─────────────────────
function gitCommitHtml() {
  try {
    execSync('git add firebase/public/', { cwd: ROOT, stdio: 'pipe' });
    const status = execSync('git status --porcelain firebase/public/', { cwd: ROOT }).toString().trim();
    if (!status) { log('git: no HTML changes to commit'); return; }
    execSync('git commit -m "chore: sync generated HTML to firebase/public"', { cwd: ROOT, stdio: 'inherit' });
    log('HTML files committed to git');
  } catch (e) {
    log(`git commit skipped: ${e.message}`);
  }
}

// ── 4. Regenerate projects-manifest.json ─────────────────────────────────────
function rebuildManifest() {
  const projectsDir = path.join(ROOT, 'projects');
  const projects = [];

  if (fs.existsSync(projectsDir)) {
    for (const d of fs.readdirSync(projectsDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const slug     = d.name;
      const projFile = path.join(projectsDir, slug, 'project.json');
      if (!fs.existsSync(projFile)) continue;

      const proj = JSON.parse(fs.readFileSync(projFile, 'utf8'));

      const entry = {
        id:             slug,
        name:           proj.displayName    || slug,
        architect:      proj.architect      || null,
        architectEmail: proj.architectEmail || null,
        createdAt:      proj.createdAt      || null,
      };
      if (proj.intakeUrl)    entry.intakeUrl    = proj.intakeUrl;
      if (proj.proposalUrl)  entry.proposalUrl  = proj.proposalUrl;
      if (proj.pitchKitUrl)  entry.pitchKitUrl  = proj.pitchKitUrl;
      const intakeFile = path.join(PUBLIC, 'intake', `${slug}.html`);
      if (fs.existsSync(intakeFile)) entry.intakePublished = true;
      projects.push(entry);
    }
  }

  projects.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  fs.writeFileSync(path.join(PUBLIC, 'projects-manifest.json'), JSON.stringify(projects, null, 2));
  log(`Manifest: ${projects.length} project(s)`);
}

// ── 4. Regenerate client portal pages ────────────────────────────────────────
function rebuildPortals() {
  const result = spawnSync('node', [path.join(ROOT, 'scaffold', 'generate-client-portal.js')], {
    cwd: ROOT, stdio: 'inherit',
  });
  if (result.status !== 0) log('WARNING: portal generation exited with errors');
}

// ── 5. Deploy to Firebase Hosting ────────────────────────────────────────────
function deploy() {
  log('Deploying to Firebase Hosting...');
  const env = { ...process.env };
  // Always use the service account key — never the expired FIREBASE_TOKEN
  if (fs.existsSync(SA_PATH)) env.GOOGLE_APPLICATION_CREDENTIALS = SA_PATH;
  delete env.FIREBASE_TOKEN;
  execSync(
    `npx firebase-tools deploy --only hosting,storage --project ${FB_PROJ} --force`,
    { cwd: path.join(ROOT, 'firebase'), stdio: 'inherit', env }
  );
  log(`Live: ${PORTAL}`);
}

// ── All project slugs ─────────────────────────────────────────────────────────
function allSlugs() {
  const projectsDir = path.join(ROOT, 'projects');
  if (!fs.existsSync(projectsDir)) return [];
  return fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args     = process.argv.slice(2);
  const runAll   = args.includes('--all');
  const noDeploy = args.includes('--no-deploy');
  const slug     = args.find(a => !a.startsWith('--'));

  if (!runAll && !slug) {
    console.error('Usage: node scripts/update-firebase.js <slug>|--all [--no-deploy]');
    process.exit(1);
  }

  const slugs = runAll ? allSlugs() : [slug];

  for (const s of slugs) {
    const projFile = path.join(ROOT, 'projects', s, 'project.json');
    if (!fs.existsSync(projFile)) { log(`SKIP ${s} — no project.json`); continue; }
    log(`Processing: ${s}`);
    try { await archiveScoping(s); } catch (e) { log(`  scoping archive skipped: ${e.message}`); }
    try { await uploadHtmlToStorage(s); } catch (e) { log(`  html upload skipped: ${e.message}`); }
  }

  rebuildManifest();
  rebuildPortals();
  gitCommitHtml();

  if (!noDeploy) {
    deploy();
  } else {
    log('--no-deploy: skipping deployment');
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
