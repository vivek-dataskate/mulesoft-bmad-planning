#!/usr/bin/env node
/**
 * Overnight batch pipeline — runs Scout end-to-end for every pending client in _bulkinbox/.
 *
 * For each client:
 *   1. Stage files into _inbox/ (txt preferred over pdf/docx; audio → transcript only)
 *   2. Run a single Claude invocation covering all 3 Scout sessions
 *   3. Discover the slug Scout actually created (Scout owns folder naming)
 *   4. Verify intake HTML was produced
 *   5. Git commit + push
 *
 * Usage:
 *   node scripts/run-scout-pipeline.js           — process next pending client
 *   node scripts/run-scout-pipeline.js --all     — process all pending clients
 *   node scripts/run-scout-pipeline.js zyris     — process one specific client
 *   node scripts/run-scout-pipeline.js --status  — show pipeline state
 */

const { spawnSync, execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const CLAUDE = process.env.CLAUDE_BIN ||
  "/home/node/.vscode-remote/extensions/anthropic.claude-code-2.1.140-linux-x64/resources/native-binary/claude";
const ROOT    = path.join(__dirname, "..");
const BULKINBOX = path.join(ROOT, "_bulkinbox");
const INBOX   = path.join(ROOT, "_inbox");
const PROJECTS = path.join(ROOT, "projects");
const LOGS    = path.join(ROOT, "logs", "scout-pipeline");

// --- helpers ---

function toSlug(name) {
  return name
    .replace(/_Customer$/i, "").replace(/_customer$/i, "")
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function allFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...allFiles(full));
    else out.push(full);
  }
  return out;
}

function hasReadableFiles(dir) {
  return allFiles(dir).some(f => !f.match(/\.mp4$/i));
}

// --- inbox ---

function clearInbox() {
  if (!fs.existsSync(INBOX)) { fs.mkdirSync(INBOX); return; }
  for (const f of fs.readdirSync(INBOX))
    fs.rmSync(path.join(INBOX, f), { recursive: true, force: true });
}

function stageInbox(clientPath) {
  const files = allFiles(clientPath);
  clearInbox();
  let copied = 0;
  for (const f of files) {
    // Copy everything — Scout decides what to read; move-sources decides what to archive
    fs.copyFileSync(f, path.join(INBOX, path.basename(f)));
    copied++;
  }
  return copied;
}

// --- slug discovery ---
// Scout owns folder naming. After a run, scan projects/ for what was actually created.

function findNewProjectSlug(knownSlugs, sessionFile = "scout-s1.md") {
  if (!fs.existsSync(PROJECTS)) return null;
  for (const d of fs.readdirSync(PROJECTS, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    if (knownSlugs.has(d.name)) continue;
    const candidate = path.join(PROJECTS, d.name, "intake", sessionFile);
    if (fs.existsSync(candidate)) return d.name;
  }
  return null;
}

function existingProjectSlugs() {
  if (!fs.existsSync(PROJECTS)) return new Set();
  return new Set(
    fs.readdirSync(PROJECTS, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
  );
}

// --- session check ---

function getSessionStatus(slug) {
  const intake = path.join(PROJECTS, slug, "intake");
  const s1 = fs.existsSync(path.join(intake, "scout-s1.md"));
  const s2 = fs.existsSync(path.join(intake, "scout-s2.md"));
  const files = fs.existsSync(intake) ? fs.readdirSync(intake) : [];
  const hasIntakeHtml   = files.some(f => f.startsWith("intake-questionnaire-") && f.endsWith(".html"));
  const hasProposalHtml = files.some(f => f.startsWith("proposal-") && f.endsWith(".html"));
  if (hasIntakeHtml && hasProposalHtml) return "done";
  if (s2)   return "needs-s3";
  if (s1)   return "needs-s2";
  return "not-started";
}

// --- claude run ---

function runScoutSession(slug, session, logFile) {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });

  const prompts = {
    1: `talk to Scout. PIPELINE MODE — no human is present.
Run Session 1 (Research) only. Process files in _inbox/.
Use all onboarding defaults: architect = Kailash Chanda, engagement type = new integration, go-live = TBD.
Do not stop or wait for input. Write scout-s1.md before finishing. Stop after Session 1 — do not continue to Session 2.`,

    2: `talk to Scout. PIPELINE MODE — no human is present.
Client slug: ${slug}. Session 1 is complete (scout-s1.md exists).
Run Session 2 (Questionnaire) only.
Do not stop or wait for input. Write scout-s2.md and intake-questionnaire-${slug}.md before finishing. Stop after Session 2 — do not continue to Session 3.`,

    3: `talk to Scout. PIPELINE MODE — no human is present.
Client slug: ${slug}. Sessions 1 and 2 are complete (scout-s1.md and scout-s2.md exist).
Run Session 3 (HTML deliverables) only.
Do not stop or wait for input.
You MUST write BOTH files before finishing:
  1. projects/${slug}/intake/proposal-${slug}.html
  2. projects/${slug}/intake/intake-questionnaire-${slug}.html
Do not finish until both HTML files are written and deployed to Firebase.`,
  };

  const result = spawnSync(
    CLAUDE,
    ["-p", prompts[session], "--dangerously-skip-permissions", "--permission-mode", "auto"],
    {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 20 * 60 * 1000, // 20 min per session
      maxBuffer: 50 * 1024 * 1024,
    }
  );

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  fs.writeFileSync(logFile, output, "utf8");
  return result.status === 0;
}

// --- git ---

function gitCommit(slug) {
  try {
    execSync(`git add projects/${slug}/`, { cwd: ROOT, stdio: "pipe" });
    execSync(`git commit -m "scout: complete onboarding for ${slug}"`, { cwd: ROOT, stdio: "pipe" });
    execSync("git push", { cwd: ROOT, stdio: "pipe" });
    return true;
  } catch { return false; }
}

// --- client list ---

function getClients() {
  const seen = new Set();
  const clients = [];

  // New clients from _bulkinbox/
  for (const d of fs.readdirSync(BULKINBOX, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name === "pipeline-status.json") continue;
    const slug = toSlug(d.name);
    seen.add(slug);
    clients.push({ folder: d.name, slug, path: path.join(BULKINBOX, d.name), resumable: false });
  }

  // Resumable clients — have s1 or s2 but no HTML, no _bulkinbox/ entry needed
  if (fs.existsSync(PROJECTS)) {
    for (const d of fs.readdirSync(PROJECTS, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      if (seen.has(d.name)) continue;
      const status = getSessionStatus(d.name);
      if (status === "needs-s2" || status === "needs-s3")
        clients.push({ folder: d.name, slug: d.name, path: path.join(PROJECTS, d.name), resumable: true });
    }
  }

  return clients;
}

// --- process one client ---

async function processClient(client) {
  const status = getSessionStatus(client.slug);
  if (status === "done") { log(`SKIP  ${client.slug} — already complete`); return "done"; }

  log(`START ${client.folder}`);

  if (!client.resumable) {
    const count = stageInbox(client.path);
    log(`  Staged ${count} file(s) into _inbox/`);
    if (count === 0) { log(`  SKIP — no readable files`); return "skipped"; }
  }

  // Snapshot existing projects before S1 so we can detect Scout's new folder
  const beforeSlugs = existingProjectSlugs();
  let resolvedSlug = client.slug;

  const sessionsToRun = status === "not-started" ? [1, 2, 3]
    : status === "needs-s2" ? [2, 3]
    : [3];

  for (const session of sessionsToRun) {
    const logFile = path.join(LOGS, `${resolvedSlug}-s${session}.log`);
    log(`  Session ${session} running... (log: logs/scout-pipeline/${resolvedSlug}-s${session}.log)`);
    runScoutSession(resolvedSlug, session, logFile);

    // After S1, discover the slug Scout actually created
    if (session === 1) {
      const discovered = findNewProjectSlug(beforeSlugs);
      if (discovered && discovered !== resolvedSlug) {
        log(`  Slug resolved: ${resolvedSlug} → ${discovered}`);
        resolvedSlug = discovered;
      }
      clearInbox();
    }

    const newStatus = getSessionStatus(resolvedSlug);
    const expectedAfter = session === 1 ? "needs-s2" : session === 2 ? "needs-s3" : "done";
    if (newStatus !== expectedAfter && newStatus !== "done") {
      log(`  FAILED at Session ${session} — expected ${expectedAfter}, got ${newStatus}. Check logs/scout-pipeline/${resolvedSlug}-s${session}.log`);
      return "failed";
    }
    log(`  Session ${session} ✓`);
  }

  // Deploy to Firebase (archive scoping, sync HTML, manifest, portal, hosting)
  log(`  Firebase sync...`);
  const fbResult = spawnSync(
    "node", [path.join(ROOT, "scripts", "update-firebase.js"), resolvedSlug],
    { cwd: ROOT, encoding: "utf8", timeout: 5 * 60 * 1000 }
  );
  if (fbResult.status === 0) {
    log(`  Firebase: ✓`);
  } else {
    log(`  Firebase: FAILED — run manually: node scripts/update-firebase.js ${resolvedSlug}`);
    if (fbResult.stderr) process.stderr.write(fbResult.stderr);
  }

  const pushed = gitCommit(resolvedSlug);
  log(`  Git push: ${pushed ? "✓" : "FAILED — push manually"}`);
  log(`DONE  ${resolvedSlug}`);
  return "done";
}

// --- status report ---

function statusReport(clients) {
  console.log("\nScout pipeline status:\n");
  console.log("  Folder                          Stage");
  console.log("  ─────────────────────────────── ─────────────");
  for (const c of clients) {
    const status = getSessionStatus(c.slug);
    const ready = c.resumable || hasReadableFiles(c.path);
    const tag = !ready ? "[needs transcript]" : "";
    console.log(`  ${(c.folder + " " + tag).padEnd(32)} ${status}`);
  }
  console.log();
}

// --- main ---

async function main() {
  if (!fs.existsSync(CLAUDE)) {
    console.error(`Claude binary not found at: ${CLAUDE}`);
    console.error("Set CLAUDE_BIN env var to the correct path.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const runAll   = args.includes("--all");
  const showStatus = args.includes("--status");
  const clientArg = args.find(a => !a.startsWith("--"));

  const clients = getClients();

  if (showStatus) { statusReport(clients); return; }

  let pool = clients;
  if (clientArg)
    pool = clients.filter(c => c.slug.includes(clientArg) || c.folder.toLowerCase().includes(clientArg));
  if (pool.length === 0) { console.error(`No client matching "${clientArg}"`); process.exit(1); }

  const pending = pool.filter(c => getSessionStatus(c.slug) !== "done");
  const ready   = pending.filter(c => c.resumable || hasReadableFiles(c.path));
  const toRun   = (runAll || clientArg) ? ready : ready.slice(0, 1);

  log(`Scout pipeline — ${toRun.length} client(s) to process`);
  console.log();

  let completed = 0, failed = 0;
  for (const client of toRun) {
    const result = await processClient(client);
    if (result === "done") completed++; else if (result === "failed") failed++;
    console.log();
  }

  log(`Complete — ${completed} done, ${failed} failed`);
  if (failed > 0) log(`Check logs/scout-pipeline/ for details`);
}

main().catch(err => { console.error("Fatal:", err.message); process.exit(1); });
