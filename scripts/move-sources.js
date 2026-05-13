#!/usr/bin/env node
/**
 * Archives all client source files from _bulkinbox/{client}_Customer/ to Firebase Storage.
 * Writes filename, size, and URL for each file into projects/{client}/project.json
 * under sourceFiles[], then deletes the local copies (and scoping/ folder if empty).
 *
 * All file types are uploaded — call recordings, transcripts, PDFs, decks, etc.
 * Nothing needs to stay local once Scout has generated the intake.
 *
 * Usage:
 *   node scripts/move-sources.js <client>
 *   node scripts/move-sources.js <client> --dir <custom-source-dir>
 *   node scripts/move-sources.js <client> --keep   # upload but don't delete locals
 *
 * Called automatically by Scout at the end of Session 3.
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const BUCKET = "dataskateclients.firebasestorage.app";
const SERVICE_ACCOUNT_PATH = path.resolve(
  __dirname,
  "..",
  "dataskateclients-firebase-adminsdk-fbsvc-6d3f67e197.json"
);

function initFirebase() {
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), storageBucket: BUCKET });
  }
  return admin.storage().bucket();
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function findAllFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => fs.statSync(path.join(dir, f)).isFile())
    .map(f => path.join(dir, f));
}

function detectSourceDir(client, customDir) {
  if (customDir) return customDir;
  return path.resolve(__dirname, "..", "projects", client, "scoping");
}

async function uploadFile(bucket, localPath, client) {
  const filename = path.basename(localPath);
  const sizeBytes = fs.statSync(localPath).size;
  const destination = `source-files/${client}/${filename}`;
  const uploadedAt = new Date().toISOString().slice(0, 10);

  process.stdout.write(`  Uploading: ${filename} (${humanSize(sizeBytes)}) ... `);

  await bucket.upload(localPath, {
    destination,
    metadata: { cacheControl: "private, max-age=0" },
  });

  const url = `https://console.cloud.google.com/storage/browser/_details/${BUCKET}/${destination}`;

  console.log("done");
  return { name: filename, size: humanSize(sizeBytes), url, uploadedAt };
}

function updateProjectJson(client, newEntries) {
  const projectJsonPath = path.resolve(__dirname, "..", "projects", client, "project.json");
  if (!fs.existsSync(projectJsonPath)) {
    console.error(`  ERROR: project.json not found at ${projectJsonPath}`);
    return;
  }
  const proj = JSON.parse(fs.readFileSync(projectJsonPath, "utf8"));
  const existing = proj.sourceFiles || [];
  const existingUrls = new Set(existing.map(e => e.url));
  const toAdd = newEntries.filter(e => !existingUrls.has(e.url));
  proj.sourceFilesFolder = `https://console.cloud.google.com/storage/browser/${BUCKET}/source-files/${client}`;
  proj.sourceFiles = [...existing, ...toAdd];
  fs.writeFileSync(projectJsonPath, JSON.stringify(proj, null, 2) + "\n");
  console.log(`\n  project.json updated — ${toAdd.length} file(s) archived.`);
}

function cleanupScopingFolder(client) {
  const scopingDir = path.resolve(__dirname, "..", "projects", client, "scoping");
  if (!fs.existsSync(scopingDir)) return;
  const remaining = fs.readdirSync(scopingDir);
  if (remaining.length === 0) {
    fs.rmdirSync(scopingDir);
    console.log(`  Removed empty scoping/ folder.`);
  } else {
    console.log(`  scoping/ still has ${remaining.length} file(s) — not removed.`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (!args[0]) {
    console.error("Usage: node scripts/move-sources.js <client> [--dir <path>] [--keep]");
    process.exit(1);
  }

  const client = args[0];
  const dirIdx = args.indexOf("--dir");
  const customDir = dirIdx !== -1 ? args[dirIdx + 1] : null;
  const keepLocal = args.includes("--keep");

  const sourceDir = detectSourceDir(client, customDir);
  if (!sourceDir) {
    console.log(`No source folder found for client "${client}" in _bulkinbox/ — nothing to archive.`);
    return;
  }

  const files = findAllFiles(sourceDir);
  if (files.length === 0) {
    console.log(`No files found in ${sourceDir} — nothing to upload.`);
    return;
  }

  console.log(`\nClient:     ${client}`);
  console.log(`Source dir: ${sourceDir}`);
  console.log(`Files:      ${files.length}\n`);

  const bucket = initFirebase();
  const uploaded = [];

  for (const file of files) {
    try {
      const entry = await uploadFile(bucket, file, client);
      uploaded.push(entry);
      if (!keepLocal) {
        fs.unlinkSync(file);
      }
    } catch (err) {
      console.error(`  FAILED: ${path.basename(file)} — ${err.message}`);
    }
  }

  if (uploaded.length > 0) {
    updateProjectJson(client, uploaded);
    if (!keepLocal) {
      // Remove the now-empty source dir
      try {
        fs.rmdirSync(sourceDir);
        console.log(`  Removed source dir: ${path.basename(sourceDir)}`);
      } catch (_) {
        // Not empty — leave it
      }
      cleanupScopingFolder(client);
    }
  }

  console.log(`\nDone. ${uploaded.length}/${files.length} file(s) uploaded to:`);
  console.log(`  gs://${BUCKET}/source-files/${client}/\n`);
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
