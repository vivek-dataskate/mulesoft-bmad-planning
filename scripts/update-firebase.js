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

// Service account: prefer the repo's Firebase Admin SDK key (canonical deploy SA,
// restored by .devcontainer/setup.sh from FIREBASE_SA_KEY) over GOOGLE_APPLICATION_CREDENTIALS.
// Reason: external tooling sometimes sets GOOGLE_APPLICATION_CREDENTIALS to /tmp/sa-key.json
// (the default Compute SA), which lacks Firebase permissions and fails the deploy with 403s
// on firebasestorage.defaultBucket.get etc. The repo SA is the one provisioned for this
// project and has the right roles. Fall back to env only if the repo file is missing.
const REPO_SA_PATH = path.join(ROOT, 'dataskateclients-firebase-adminsdk-fbsvc-6d3f67e197.json');
const SA_PATH      = fs.existsSync(REPO_SA_PATH)
  ? REPO_SA_PATH
  : process.env.GOOGLE_APPLICATION_CREDENTIALS;

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

// ── 1b. Sync client logo → firebase/public/logos/{slug}.{ext} ────────────────
// Looks for logo-{slug}.{ext} or {slug}.{ext} in projects/{slug}/intake/
// and copies to firebase/public/logos/{slug}.{ext} so fill-template.js can find it.
function syncLogo(slug) {
  const intakeDir  = path.join(ROOT, 'projects', slug, 'intake');
  const logosDir   = path.join(PUBLIC, 'logos');
  if (!fs.existsSync(intakeDir)) return;

  for (const ext of ['.svg', '.png']) {
    const candidates = [`logo-${slug}${ext}`, `${slug}${ext}`];
    for (const candidate of candidates) {
      const src = path.join(intakeDir, candidate);
      if (fs.existsSync(src)) {
        fs.mkdirSync(logosDir, { recursive: true });
        const dest = path.join(logosDir, `${slug}${ext}`);
        fs.copyFileSync(src, dest);
        log(`[${slug}] logo synced → firebase/public/logos/${slug}${ext}`);
        return;
      }
    }
  }
}

// ── 2. Upload intake + proposal HTML → Firebase Storage (public) ─────────────
// Files are kept locally in firebase/public/{type}/ for git tracking and also
// uploaded to Storage for serving. Source files in projects/{slug}/intake/ are
// not deleted.
//
// Frozen-client guard: clients with project.json.frozen=true have their shipped
// HTML in client hands at a known URL. This function would otherwise (a) copy
// local files over the shipped bytes at firebase/public/{type}/{slug}.html, and
// (b) reset project.json.{type}Url back to the legacy unversioned URL — undoing
// any republish that scripts/republish.js did. Skip the whole upload step for
// frozen clients; republish.js owns their files and URL fields.
async function uploadHtmlToStorage(slug) {
  const intakeDir = path.join(ROOT, 'projects', slug, 'intake');
  if (!fs.existsSync(intakeDir)) return;

  const projPathPre = path.join(ROOT, 'projects', slug, 'project.json');
  if (fs.existsSync(projPathPre)) {
    try {
      const projPre = JSON.parse(fs.readFileSync(projPathPre, 'utf8'));
      if (projPre.frozen === true) {
        log(`[${slug}] frozen — skipping HTML upload (republish.js owns versioned files + URLs)`);
        return;
      }
    } catch { /* malformed JSON; proceed cautiously */ }
  }

  // [localFilename, storageDest, projectJsonKey, firebase/public/ subdir, useHostingUrl]
  // useHostingUrl=true → serve from Firebase Hosting (no Storage auth wall)
  const pairs = [
    [`corporate-brief-${slug}.html`,      `client-docs/${slug}/corporate-brief.html`, 'briefUrl',    'brief',    true],
    [`intake-questionnaire-${slug}.html`, `client-docs/${slug}/intake.html`,  'intakeUrl',   'intake',   true],
    [`proposal-${slug}.html`,             `client-docs/${slug}/proposal.html`, 'proposalUrl', 'proposal', true],
    [`integration-deck-${slug}.html`,      `internal/${slug}/pitch-kit.html`,   'pitchKitUrl', 'internal', true],
  ];

  const projPath = path.join(ROOT, 'projects', slug, 'project.json');
  const proj = JSON.parse(fs.readFileSync(projPath, 'utf8'));
  let changed = false;

  for (const [src, dest, urlKey, pubSubdir, useHostingUrl] of pairs) {
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
    console.log('done');

    const url = useHostingUrl
      ? `${PORTAL}/${pubSubdir}/${slug}.html`
      : `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${dest.replace(/\//g, '%2F')}?alt=media`;

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


// ── 1c. Generate + sync system diagram SVG → firebase/public/diagrams/ ─────────
function syncDiagram(slug) {
  const projPath = path.join(ROOT, 'projects', slug, 'project.json');
  if (!fs.existsSync(projPath)) return;
  const proj = JSON.parse(fs.readFileSync(projPath, 'utf8'));
  if (!proj.systemDiagram || !proj.systemDiagram.current) return;

  try {
    execSync(`node ${path.join(ROOT, 'scripts', 'generate-diagrams.js')} ${slug}`, { cwd: ROOT, stdio: 'pipe' });
  } catch (e) {
    log(`[${slug}] diagram generation failed: ${e.message}`);
    return;
  }

  const svgSrc = path.join(ROOT, 'projects', slug, 'intake', 'system-diagram.svg');
  if (!fs.existsSync(svgSrc)) return;

  const diagramsDir = path.join(PUBLIC, 'diagrams');
  fs.mkdirSync(diagramsDir, { recursive: true });
  fs.copyFileSync(svgSrc, path.join(diagramsDir, `${slug}.svg`));
  log(`[${slug}] diagram synced → firebase/public/diagrams/${slug}.svg`);
}

// ── 3. Seed pitchKits/{slug} in Firestore (Admin SDK — rules say write:false) ──
async function seedPitchKit(slug) {
  const contentPath = path.join(ROOT, 'projects', slug, 'intake', `integration-deck-content.json`);
  if (!fs.existsSync(contentPath)) {
    log(`[${slug}] no integration-deck-content.json — pitchKits doc skipped`);
    return;
  }
  const contentJson = fs.readFileSync(contentPath, 'utf8');
  if (!admin.apps.length) getBucket(); // ensures admin is initialised
  const db = admin.firestore();

  const svgPublic = path.join(PUBLIC, 'diagrams', `${slug}.svg`);
  const systemDiagramUrl = fs.existsSync(svgPublic) ? `${PORTAL}/diagrams/${slug}.svg` : null;

  await db.collection('pitchKits').doc(slug).set({
    client:      slug,
    contentJson,
    ...(systemDiagramUrl ? { systemDiagramUrl } : {}),
    updatedAt:   new Date().toISOString(),
  }, { merge: true });
  log(`[${slug}] pitchKits/${slug} seeded in Firestore${systemDiagramUrl ? ' (with diagram URL)' : ''}`);
}

// ── Commit all generated HTML in firebase/public/ to git ─────────────────────
// Uses -c commit.gpgsign=false so this automated chore commit never depends on the
// user's GPG/SSH signing agent being authenticated. Without this, a stale signing
// agent (404 from the signing service) made the commit fail silently here while the
// pipeline still moved on, leaving generated HTML staged but never committed and never
// deployed. The chore commit doesn't need to be signed; signing belongs on human commits.
function gitCommitHtml() {
  try {
    execSync('git add firebase/public/', { cwd: ROOT, stdio: 'pipe' });
    const status = execSync('git status --porcelain firebase/public/', { cwd: ROOT }).toString().trim();
    if (!status) { log('git: no HTML changes to commit'); return; }
    execSync('git -c commit.gpgsign=false commit -m "chore: sync generated HTML to firebase/public"', { cwd: ROOT, stdio: 'inherit' });
    log('HTML files committed to git');
  } catch (e) {
    log(`git commit skipped: ${e.message}`);
  }
}

// ── 4. Regenerate projects-manifest.json ─────────────────────────────────────
function rebuildManifest() {
  const projectsDir  = path.join(ROOT, 'projects');
  const manifestFile = path.join(PUBLIC, 'projects-manifest.json');

  // Load existing manifest so we can preserve fields not in project.json (e.g. status, sowSigned)
  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch {}
  const existingMap = Object.fromEntries(existing.map(e => [e.id, e]));

  const projects = [];

  if (fs.existsSync(projectsDir)) {
    for (const d of fs.readdirSync(projectsDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const slug     = d.name;
      const projFile = path.join(projectsDir, slug, 'project.json');
      if (!fs.existsSync(projFile)) continue;

      const proj = JSON.parse(fs.readFileSync(projFile, 'utf8'));
      const prev = existingMap[slug] || {};

      // project.json is authoritative for these fields; fall back to existing manifest
      const briefUrl    = proj.briefUrl    || prev.briefUrl    || null;
      const intakeUrl   = proj.intakeUrl   || prev.intakeUrl   || null;
      const proposalUrl = proj.proposalUrl || prev.proposalUrl || null;
      const pitchKitUrl = proj.pitchKitUrl || prev.pitchKitUrl || null;

      const entry = {
        // Preserve any extra fields from existing manifest entry (status, sowSigned, etc.)
        ...prev,
        // Then overwrite with authoritative fields from project.json
        id:             slug,
        name:           proj.displayName    || slug,
        architect:      proj.architect      || null,
        architectEmail: proj.architectEmail || null,
        createdAt:      proj.createdAt      || null,
      };
      if (briefUrl)    entry.briefUrl    = briefUrl;
      if (intakeUrl)   entry.intakeUrl   = intakeUrl;
      if (proposalUrl) entry.proposalUrl = proposalUrl;
      if (pitchKitUrl) entry.pitchKitUrl = pitchKitUrl;
      const intakeFile = path.join(PUBLIC, 'intake', `${slug}.html`);
      if (fs.existsSync(intakeFile)) entry.intakePublished = true;
      projects.push(entry);
    }
  }

  projects.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  fs.writeFileSync(manifestFile, JSON.stringify(projects, null, 2));
  log(`Manifest: ${projects.length} project(s)`);
}

// ── 4. Regenerate client portal pages ────────────────────────────────────────
// slugs: empty array → regenerate every project (used by --all);
//        non-empty   → regenerate only those clients (so a single-client sync
//        doesn't rewrite portals for every project that has a project.json).
function rebuildPortals(slugs) {
  const args = [path.join(ROOT, 'scaffold', 'generate-client-portal.js'), ...(slugs || [])];
  const result = spawnSync('node', args, { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) log('WARNING: portal generation exited with errors');
}

// ── 5. Deploy to Firebase Hosting ────────────────────────────────────────────
function deploy() {
  log('Deploying to Firebase Hosting...');
  const env = { ...process.env };
  // Always use the service account key — never the expired FIREBASE_TOKEN
  if (fs.existsSync(SA_PATH)) env.GOOGLE_APPLICATION_CREDENTIALS = SA_PATH;
  delete env.FIREBASE_TOKEN;
  // Prefer local node_modules/.bin/firebase; fall back to npx
  const localBin = path.join(ROOT, 'node_modules', '.bin', 'firebase');
  const firebaseBin = fs.existsSync(localBin) ? `"${localBin}"` : 'npx firebase';
  execSync(
    `${firebaseBin} deploy --only hosting,storage --project ${FB_PROJ} --force`,
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
    try { syncLogo(s); } catch (e) { log(`  logo sync skipped: ${e.message}`); }
    try { syncDiagram(s); } catch (e) { log(`  diagram sync skipped: ${e.message}`); }
    try { await uploadHtmlToStorage(s); } catch (e) { log(`  html upload skipped: ${e.message}`); }
    try { await seedPitchKit(s); } catch (e) { log(`  pitchKit seed skipped: ${e.message}`); }
  }

  rebuildManifest();
  // --all → empty list (regenerate all portals); single client → just that slug.
  rebuildPortals(runAll ? [] : [slug]);
  gitCommitHtml();

  if (!noDeploy) {
    deploy();
  } else {
    log('--no-deploy: skipping deployment');
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
