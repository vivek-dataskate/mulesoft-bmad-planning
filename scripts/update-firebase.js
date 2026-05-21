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
 * Called by: DSPipeline/scout/orchestrate.js (post-Mira), deploy.sh
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
const BUILD    = path.join(ROOT, 'docs', 'eleventy', '_build');
const MANIFEST = path.join(ROOT, 'docs', 'eleventy', 'version-manifest.json');

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
// and copies to firebase/public/logos/{slug}.{ext} so Eleventy can resolve logo URLs.
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

// ── 2a. Versioned publish for frozen clients ──────────────────────────────────
// Frozen clients have their HTML in client hands at a stable URL. Instead of
// overwriting the flat file, we publish a new dated+versioned file and update
// a thin redirect at the flat path — so the client's saved link never breaks.
// Called automatically by uploadHtmlToStorage when a client is frozen.
function republishFrozenHtml(slug) {
  const projPath = path.join(ROOT, 'projects', slug, 'project.json');
  const proj     = JSON.parse(fs.readFileSync(projPath, 'utf8'));
  proj.deployments = proj.deployments || [];

  if (!fs.existsSync(MANIFEST)) {
    log(`[${slug}] no version-manifest.json — frozen publish skipped`);
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const today    = new Date().toISOString().slice(0, 10);

  // segment = Firebase Hosting subdir; src = Eleventy _build/ output path
  const templates = [
    { type: 'proposal',          segment: 'proposal',  src: path.join(BUILD, 'intake',   `proposal-${slug}.html`) },
    { type: 'intake',            segment: 'intake',    src: path.join(BUILD, 'intake',   `intake-questionnaire-${slug}.html`) },
    { type: 'integration-deck',  segment: 'internal',  src: path.join(BUILD, 'internal', `integration-deck-${slug}.html`) },
    { type: 'corporate-brief',   segment: 'corporate-brief', src: path.join(BUILD, 'intake', `corporate-brief-${slug}.html`) },
  ];

  let changed = false;

  for (const tmpl of templates) {
    if (!fs.existsSync(tmpl.src)) continue;
    const tplEntry = manifest.templates && manifest.templates[tmpl.type];
    if (!tplEntry) continue;
    const version = tplEntry.current;

    const outRel = `firebase/public/${tmpl.segment}/${slug}/${today}-${version}.html`;
    const outAbs = path.join(ROOT, outRel);
    const url    = `${PORTAL}/${tmpl.segment}/${slug}/${today}-${version}.html`;

    if (fs.existsSync(outAbs)) {
      log(`[${slug}] ${tmpl.type} ${version} already published today — skipping`);
      continue;
    }

    fs.mkdirSync(path.dirname(outAbs), { recursive: true });
    fs.copyFileSync(tmpl.src, outAbs);
    log(`[${slug}] ${tmpl.type} → ${outRel}`);

    // First versioned publish: archive the legacy flat file so version history
    // has a direct link to v1 rather than pointing at the redirect.
    const flatPath  = path.join(PUBLIC, tmpl.segment, `${slug}.html`);
    const legacyIdx = proj.deployments.findIndex(
      d => d.template === tmpl.type && d.legacyUnversioned
    );
    if (legacyIdx !== -1) {
      const leg     = proj.deployments[legacyIdx];
      const legDate = (leg.publishedAt || '').slice(0, 10);
      const legVer  = leg.version || 'v1';
      const legRel  = `firebase/public/${tmpl.segment}/${slug}/${legDate}-${legVer}.html`;
      const legAbs  = path.join(ROOT, legRel);
      if (!fs.existsSync(legAbs) && fs.existsSync(flatPath)) {
        fs.mkdirSync(path.dirname(legAbs), { recursive: true });
        fs.copyFileSync(flatPath, legAbs);
        log(`[${slug}] archived legacy ${legVer} → ${legRel}`);
      }
      const legUrl = `${PORTAL}/${tmpl.segment}/${slug}/${legDate}-${legVer}.html`;
      const { legacyUnversioned: _drop, ...legRest } = leg;
      proj.deployments[legacyIdx] = { ...legRest, url: legUrl, filePath: legRel };
    }

    // Overwrite flat file with a redirect to the new versioned URL.
    // The flat URL is what was shared with the client and must stay stable.
    if (fs.existsSync(flatPath)) {
      const redirect = [
        '<!DOCTYPE html>',
        '<html><head><meta charset="utf-8">',
        '<title>Redirecting…</title>',
        `<meta http-equiv="refresh" content="0;url=${url}">`,
        `<script>location.replace(${JSON.stringify(url)})</script>`,
        '</head><body></body></html>',
      ].join('\n') + '\n';
      fs.writeFileSync(flatPath, redirect);
      log(`[${slug}] redirect updated → ${tmpl.segment}/${slug}.html → ${version}`);
    }

    proj.templateVersions        = proj.templateVersions || {};
    proj.templateVersions[tmpl.type] = version;
    proj.deployments.push({ template: tmpl.type, version, filePath: outRel, url, publishedAt: new Date().toISOString() });
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(projPath, JSON.stringify(proj, null, 2) + '\n');
    log(`[${slug}] project.json updated (versioned deployments)`);
  }
}

// ── 2. Upload intake + proposal HTML → Firebase Storage (public) ─────────────
// Files are kept locally in firebase/public/{type}/ for git tracking and also
// uploaded to Storage for serving. Source files in projects/{slug}/intake/ are
// not deleted.
async function uploadHtmlToStorage(slug) {
  const intakeDir = path.join(ROOT, 'projects', slug, 'intake');
  if (!fs.existsSync(intakeDir)) return;

  const projPathPre = path.join(ROOT, 'projects', slug, 'project.json');
  if (fs.existsSync(projPathPre)) {
    try {
      const projPre = JSON.parse(fs.readFileSync(projPathPre, 'utf8'));
      if (projPre.deployments && projPre.deployments.length > 0) {
        republishFrozenHtml(slug);
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

// ── CMD: Export discount log → CSV ───────────────────────────────────────────
async function cmdExportDiscounts(args) {
  const projIdx    = args.indexOf('--project');
  const filterSlug = projIdx !== -1 ? args[projIdx + 1] : null;
  const outIdx     = args.indexOf('--out');
  const outFile    = outIdx !== -1 ? args[outIdx + 1] : path.join(process.cwd(), 'discount-log.csv');

  if (!admin.apps.length) getBucket();
  const db   = admin.firestore();
  const col  = db.collection('discountLog');
  const snap = filterSlug
    ? await col.where('project', '==', filterSlug).get()
    : await col.get();

  const CSV_COLS = ['Date', 'Project', 'Client', 'Architect', 'Model', 'Listed Rate', 'Proposed Rate', 'Has Discount', 'Contact Name', 'Notes'];
  const rows = [CSV_COLS];
  snap.forEach(doc => {
    const data = doc.data();
    for (const e of (data.entries || [])) {
      rows.push([
        e.ts ? new Date(e.ts).toLocaleDateString('en-US') : '',
        e.project  || data.project || doc.id,
        e.client   || data.client  || '',
        e.architect || '',
        e.model || '',
        e.listedRate   || '',
        e.proposedRate || '',
        e.hasDiscount  ? 'Yes' : 'No',
        e.contactName  || '',
        (e.notes || '').replace(/[\r\n]+/g, ' '),
      ]);
    }
  });

  const csv = rows
    .map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))
    .join('\n');
  fs.writeFileSync(outFile, csv, 'utf8');
  log(`Exported ${rows.length - 1} discount entries → ${outFile}`);
  if (filterSlug) log(`  (filtered to project: ${filterSlug})`);
}

// ── CMD: Upload agent framework → Firebase Storage ────────────────────────────
async function cmdUploadAgents() {
  const os = require('os');
  const AGENT_DIR    = path.join(ROOT, '.agent');
  const STORAGE_PATH = 'agent-framework/agents-latest.tar.gz';

  if (!fs.existsSync(AGENT_DIR)) {
    console.error(`ERROR: ${AGENT_DIR} not found. Nothing to upload.`);
    process.exit(1);
  }

  const tmp = path.join(os.tmpdir(), 'agents-latest.tar.gz');
  log('Creating tarball…');
  execSync(`tar -czf "${tmp}" -C "${ROOT}" .agent`, { stdio: 'pipe' });
  log(`Tarball: ${humanSize(fs.statSync(tmp).size)}`);

  const bucket = getBucket();
  log(`Uploading to gs://${BUCKET}/${STORAGE_PATH}…`);
  await bucket.upload(tmp, {
    destination: STORAGE_PATH,
    metadata: { contentType: 'application/gzip', metadata: { uploadedAt: new Date().toISOString() } },
  });
  fs.unlinkSync(tmp);
  log(`Done. Agent framework uploaded → ${STORAGE_PATH}`);
  log('Restore with: node scripts/restore-agents.js');
}

// ── CMD: Restore agent framework from Firebase Storage ────────────────────────
async function cmdRestoreAgents(args) {
  const os = require('os');
  const force = args.includes('--force');
  const AGENT_DIR    = path.join(ROOT, '.agent');
  const STORAGE_PATH = 'agent-framework/agents-latest.tar.gz';

  if (!force && fs.existsSync(AGENT_DIR)) {
    log('.agent/ already present — skipping restore. Use --force to re-download.');
    return;
  }

  if (!fs.existsSync(SA_PATH)) {
    log('WARNING: Service account not found — skipping agent framework restore.');
    log('  Set FIREBASE_SA_KEY secret in Codespace settings and rebuild to get agents.');
    return;
  }

  const bucket = getBucket();
  const tmp = path.join(os.tmpdir(), 'agents-latest.tar.gz');
  log(`Downloading gs://${BUCKET}/${STORAGE_PATH}…`);
  await bucket.file(STORAGE_PATH).download({ destination: tmp });
  log(`Downloaded ${humanSize(fs.statSync(tmp).size)} — extracting…`);

  if (fs.existsSync(AGENT_DIR)) fs.rmSync(AGENT_DIR, { recursive: true });
  execSync(`tar -xzf "${tmp}" -C "${ROOT}"`, { stdio: 'pipe' });
  fs.unlinkSync(tmp);

  const fileCount = execSync(`find "${AGENT_DIR}" -type f | wc -l`).toString().trim();
  log(`Done. Agent framework restored: ${fileCount} files in .agent/`);
}

// ── CMD: Archive source files → Firebase Storage ─────────────────────────────
async function cmdMoveSources(args) {
  const msIdx    = args.indexOf('--move-sources');
  const client   = args[msIdx + 1];
  if (!client || client.startsWith('--')) {
    console.error('Usage: node scripts/update-firebase.js --move-sources <client> [--dir path] [--keep]');
    process.exit(1);
  }
  const dirIdx    = args.indexOf('--dir');
  const customDir = dirIdx !== -1 ? args[dirIdx + 1] : null;
  const keepLocal = args.includes('--keep');
  const sourceDir = customDir || path.join(ROOT, 'projects', client, 'scoping');

  if (!fs.existsSync(sourceDir)) {
    log(`No source folder at ${sourceDir} — nothing to archive.`);
    return;
  }

  const files = fs.readdirSync(sourceDir)
    .filter(f => fs.statSync(path.join(sourceDir, f)).isFile())
    .map(f => path.join(sourceDir, f));

  if (!files.length) { log(`No files in ${sourceDir} — nothing to upload.`); return; }

  log(`Client: ${client}  Source: ${sourceDir}  Files: ${files.length}`);
  const bucket   = getBucket();
  const uploaded = [];

  for (const file of files) {
    const filename = path.basename(file);
    const dest     = `source-files/${client}/${filename}`;
    process.stdout.write(`  [${client}] upload: ${filename} (${humanSize(fs.statSync(file).size)}) ... `);
    try {
      await bucket.upload(file, { destination: dest, metadata: { cacheControl: 'private, max-age=0' } });
      console.log('done');
      uploaded.push({
        name: filename,
        size: humanSize(fs.statSync(file).size),
        url: `https://console.cloud.google.com/storage/browser/_details/${BUCKET}/${dest}`,
        uploadedAt: new Date().toISOString().slice(0, 10),
      });
      if (!keepLocal) fs.unlinkSync(file);
    } catch (err) {
      console.log('FAILED');
      console.error(`  ${err.message}`);
    }
  }

  if (uploaded.length) {
    const projPath = path.join(ROOT, 'projects', client, 'project.json');
    if (fs.existsSync(projPath)) {
      const proj = JSON.parse(fs.readFileSync(projPath, 'utf8'));
      const existingUrls = new Set((proj.sourceFiles || []).map(e => e.url));
      proj.sourceFiles = [...(proj.sourceFiles || []), ...uploaded.filter(e => !existingUrls.has(e.url))];
      proj.sourceFilesFolder = `https://console.cloud.google.com/storage/browser/${BUCKET}/source-files/${client}`;
      fs.writeFileSync(projPath, JSON.stringify(proj, null, 2) + '\n');
      log(`project.json updated — ${uploaded.length} file(s) archived.`);
    }
    if (!keepLocal) { try { fs.rmdirSync(sourceDir); } catch (_) {} }
  }
  log(`Done. ${uploaded.length}/${files.length} file(s) uploaded to gs://${BUCKET}/source-files/${client}/`);
}

// ── CMD: Register client in Firestore projects collection ────────────────────
async function cmdAddClient(args) {
  const idx    = args.indexOf('--add-client');
  const client = args[idx + 1];
  if (!client || client.startsWith('--')) {
    console.error('Usage: node scripts/update-firebase.js --add-client <client> [--status status]');
    process.exit(1);
  }
  const statusIdx = args.indexOf('--status');
  const status    = statusIdx !== -1 ? args[statusIdx + 1] : 'intake_sent';
  const VALID = ['intake_sent', 'intake_in_progress', 'intake_complete', 'proposal_sent', 'in_progress', 'complete'];
  if (!VALID.includes(status)) {
    console.error(`Invalid status "${status}". Valid: ${VALID.join(', ')}`);
    process.exit(1);
  }

  const projFile = path.join(ROOT, 'projects', client, 'project.json');
  if (!fs.existsSync(projFile)) {
    console.error(`project.json not found: ${projFile}`);
    process.exit(1);
  }
  const proj = JSON.parse(fs.readFileSync(projFile, 'utf8'));

  if (!admin.apps.length) getBucket();
  const db = admin.firestore();
  await db.collection('projects').doc(client).set({
    name:              proj.clientName || client,
    slug:              client,
    industry:          proj.industry   || proj.vertical || '',
    architect:         proj.architect  || '',
    architectEmail:    proj.architectEmail || '',
    status,
    completionPercent: 0,
    intakeUrl:         `https://${FB_PROJ}.web.app/portal/${client}.html`,
    proposalUrl:       proj.proposalUrl || null,
    createdAt:         admin.firestore.FieldValue.serverTimestamp(),
    lastActivityAt:    admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  log(`Client "${proj.clientName || client}" registered in Firestore (status: ${status})`);
  log(`  View at: https://${FB_PROJ}.web.app`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--export-discounts')) { await cmdExportDiscounts(args); return; }
  if (args.includes('--upload-agents'))    { await cmdUploadAgents();        return; }
  if (args.includes('--restore-agents'))   { await cmdRestoreAgents(args);   return; }
  if (args.includes('--move-sources'))     { await cmdMoveSources(args);     return; }
  if (args.includes('--add-client'))       { await cmdAddClient(args);       return; }

  const runAll   = args.includes('--all');
  const noDeploy = args.includes('--no-deploy');
  const slug     = args.find(a => !a.startsWith('--'));

  if (!runAll && !slug) {
    console.error('Usage:');
    console.error('  node scripts/update-firebase.js <slug>|--all [--no-deploy]');
    console.error('  node scripts/update-firebase.js --export-discounts [--project slug] [--out file]');
    console.error('  node scripts/update-firebase.js --upload-agents');
    console.error('  node scripts/update-firebase.js --restore-agents [--force]');
    console.error('  node scripts/update-firebase.js --move-sources <client> [--dir path] [--keep]');
    console.error('  node scripts/update-firebase.js --add-client <client> [--status status]');
    process.exit(1);
  }

  const slugs = runAll ? allSlugs() : [slug];

  // Run Eleventy once up front so republishFrozenHtml() has fresh _build/ output.
  const needsBuild = slugs.some(s => {
    try { const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'projects', s, 'project.json'), 'utf8')); return p.deployments && p.deployments.length > 0; }
    catch { return false; }
  });
  if (needsBuild) {
    log('Previously published client(s) detected — running Eleventy build...');
    execSync('npm run build:html', { cwd: ROOT, stdio: 'inherit' });
  }

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
