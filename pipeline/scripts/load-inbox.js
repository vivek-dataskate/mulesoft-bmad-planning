#!/usr/bin/env node
/**
 * Stages one client's files from _bulkinbox/{client}/ into _inbox/
 * so Scout can process them with no behavior changes.
 *
 * Usage:
 *   node pipeline/scripts/load-inbox.js              — interactive list
 *   node pipeline/scripts/load-inbox.js econo-petro  — fuzzy match by name
 *
 * Rules:
 *   - _inbox/ must be empty before loading (warns if not)
 *   - MP4 files are skipped unless a .txt transcript exists alongside them
 *   - Copies files (originals stay in _bulkinbox/)
 *   - Skips clients that already have a projects/{slug}/ folder
 */

const fs = require("fs");
const path = require("path");

const BULKINBOX = path.join(__dirname, "..", "_bulkinbox");
const INBOX = path.join(__dirname, "..", "_inbox");
const PROJECTS = path.join(__dirname, "..", "projects");

function toSlug(name) {
  return name
    .replace(/_Customer$/i, "")
    .replace(/_customer$/i, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getClients() {
  return fs
    .readdirSync(BULKINBOX, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => ({
      folder: d.name,
      slug: toSlug(d.name),
      path: path.join(BULKINBOX, d.name),
    }));
}

function getInboxFiles() {
  if (!fs.existsSync(INBOX)) return [];
  return fs.readdirSync(INBOX).filter(f => !f.startsWith("."));
}

function getFilesToCopy(clientPath) {
  const all = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        all.push(full);
      }
    }
  }
  walk(clientPath);

  const result = [];
  const skipped = [];

  for (const f of all) {
    // Copy everything — Scout decides what to read; move-sources decides what to archive
    result.push(f);
  }

  return { result, skipped };
}

function loadClient(client) {
  // Check inbox is empty
  const inboxFiles = getInboxFiles();
  if (inboxFiles.length > 0) {
    console.log(`\nWARNING: _inbox/ is not empty (${inboxFiles.length} file(s) already there):`);
    inboxFiles.forEach(f => console.log(`  ${f}`));
    console.log("\nClear _inbox/ before loading a new client.");
    process.exit(1);
  }

  // Check if already processed
  const projectPath = path.join(PROJECTS, client.slug);
  if (fs.existsSync(projectPath)) {
    console.log(`\nNOTE: projects/${client.slug}/ already exists — this client may have been run through Scout already.`);
    console.log("Continuing anyway...\n");
  }

  const { result: files, skipped } = getFilesToCopy(client.path);

  if (files.length === 0) {
    console.log(`\nNo readable files found for ${client.folder}.`);
    if (skipped.length > 0) {
      console.log("Skipped:");
      skipped.forEach(s => console.log(`  ${s}`));
    }
    process.exit(1);
  }

  if (!fs.existsSync(INBOX)) fs.mkdirSync(INBOX);

  for (const src of files) {
    const dest = path.join(INBOX, path.basename(src));
    fs.copyFileSync(src, dest);
    console.log(`  Copied: ${path.basename(src)}`);
  }

  if (skipped.length > 0) {
    console.log("\nSkipped (no transcript):");
    skipped.forEach(s => console.log(`  ${s}`));
  }

  console.log(`\n_inbox/ loaded with ${files.length} file(s) for: ${client.folder}`);
  console.log(`Suggested Scout slug: ${client.slug}`);
  console.log("\nRun Scout now to process this client.");
}

function interactiveList(clients) {
  console.log("\nAvailable clients in _bulkinbox/:\n");
  clients.forEach((c, i) => {
    const done = fs.existsSync(path.join(PROJECTS, c.slug)) ? " [done]" : "";
    const { result, skipped } = getFilesToCopy(c.path);
    const status = skipped.length > 0 && result.length === 0
      ? " [needs transcript]"
      : skipped.length > 0
        ? " [partial — some MP4s need transcript]"
        : "";
    console.log(`  ${String(i + 1).padStart(2)}. ${c.folder}${done}${status}`);
    console.log(`      slug: ${c.slug} | files: ${result.length}`);
  });
  console.log(`\nUsage: node pipeline/scripts/load-inbox.js "<folder name or slug>"`);
}

function getSessionStatus(client) {
  const intakePath  = path.join(PROJECTS, client.slug, "intake");
  const statePath   = path.join(PROJECTS, client.slug, "scoping", "run", "pipeline-state.json");
  const hasIntakeHtml = fs.existsSync(path.join(intakePath, 'client', `intake-questionnaire-${client.slug}.html`));
  const hasProposal   = fs.existsSync(path.join(intakePath, 'client', `proposal-${client.slug}.html`));

  if (hasIntakeHtml && hasProposal) return { label: "DONE ✓",      next: null };

  if (fs.existsSync(statePath)) {
    try {
      const state    = JSON.parse(fs.readFileSync(statePath, "utf8"));
      const done     = (state.completed || []);
      const agents   = ["sage","vera","rex","ivy","flo","hawk","petra","quinn","mira"];
      const lastDone = agents.filter(a => done.includes(a)).pop();
      const nextUp   = agents.find(a => !done.includes(a));
      if (lastDone) return { label: `in progress (last: ${lastDone})`, next: `run orchestrate.js --client ${client.slug} to resume` };
    } catch { /* fall through */ }
    return { label: "pipeline started",  next: `run orchestrate.js --client ${client.slug} to resume` };
  }

  if (fs.existsSync(path.join(PROJECTS, client.slug, "project.json"))) {
    return { label: "project created",   next: `run orchestrate.js --client ${client.slug}` };
  }

  return { label: "not started", next: "run orchestrate.js to begin" };
}

function statusReport(clients) {
  console.log("\nPipeline status across all clients:\n");
  console.log("  #   Client                        Stage                 Next step");
  console.log("  ─── ─────────────────────────────────────────────────────────────────");
  clients.forEach((c, i) => {
    const { result, skipped } = getFilesToCopy(c.path);
    const blocked = skipped.length > 0 && result.length === 0 ? " [needs transcript]" : "";
    const status = getSessionStatus(c);
    const num = String(i + 1).padStart(3);
    const name = (c.folder.replace(/_Customer$/i, "").replace(/_customer$/i, "") + blocked).padEnd(32);
    console.log(`  ${num} ${name} ${status.label.padEnd(22)} ${status.next || ""}`);
  });
  console.log();
}

// --- main ---
const clients = getClients();
const arg = process.argv[2];

if (!arg || arg === "--status") {
  if (arg === "--status") {
    statusReport(clients);
  } else {
    interactiveList(clients);
  }
  process.exit(0);
}

const match = clients.find(
  c =>
    c.folder.toLowerCase().includes(arg.toLowerCase()) ||
    c.slug.includes(arg.toLowerCase())
);

if (!match) {
  console.error(`No client found matching "${arg}"`);
  process.exit(1);
}

console.log(`Loading: ${match.folder} → _inbox/`);
loadClient(match);
