#!/usr/bin/env node
'use strict';

/**
 * DSPipeline — Scout Orchestrator
 *
 * Entry point for the DataSkate pre-sales pipeline.
 * Handles onboarding, state tracking, company_context.json assembly, and telemetry.
 *
 * Usage:
 *   node pipeline/scout/orchestrate.js                    # new client — Gemini infers name from _inbox/
 *   node pipeline/scout/orchestrate.js --pipeline         # fully headless — infers name, no prompts
 *   node pipeline/scout/orchestrate.js --client mrn       # resume specific client
 *   node pipeline/scout/orchestrate.js --client mrn --skip-onboarding
 *   node pipeline/scout/orchestrate.js --client mrn --pipeline  # resume headless
 *   node pipeline/scout/orchestrate.js --client mrn --mode delta --recording scoping/may-amendment.txt
 *   node pipeline/scout/orchestrate.js --client mrn --check-acceptance
 */

const fs            = require('fs');
const path          = require('path');
const os            = require('os');
const readline      = require('readline');
const { spawnSync } = require('child_process');
const { inferClientWithAI } = require('./infer-client');

// ─── Claude Binary Resolution ────────────────────────────────────────────────
// CLAUDE_CODE_EXECPATH is set inside the agent sandbox but not in user terminals.
// Try multiple locations in order so pipeline mode works in both contexts.

function resolveClaudeBin() {
  // 1. Env var — set by Claude Code when running inside the VSCode extension agent
  if (process.env.CLAUDE_CODE_EXECPATH && fs.existsSync(process.env.CLAUDE_CODE_EXECPATH)) {
    return process.env.CLAUDE_CODE_EXECPATH;
  }
  // 2. System PATH (global npm install, CI, etc.)
  try {
    const r = spawnSync('which', ['claude'], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  } catch { /* not on PATH */ }
  // 3. VSCode extension directory — pick the highest-version build present
  const extDir = path.join(os.homedir(), '.vscode-remote', 'extensions');
  if (fs.existsSync(extDir)) {
    const match = fs.readdirSync(extDir)
      .filter(d => d.startsWith('anthropic.claude-code-'))
      .sort().reverse()
      .map(d => path.join(extDir, d, 'resources', 'native-binary', 'claude'))
      .find(p => fs.existsSync(p));
    if (match) return match;
  }
  return 'claude'; // last resort — will fail at spawn with a clear ENOENT
}

const CLAUDE_BIN = resolveClaudeBin();

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT          = path.resolve(__dirname, '../..');
const INBOX_DIR     = path.join(ROOT, '_inbox');
const PROJECTS_DIR  = path.join(ROOT, 'projects');
const PIPELINE_JSON = path.join(__dirname, 'pipeline.json');
const TELEMETRY_CSV   = path.join(ROOT, 'pipeline/telemetry/usage.csv');
const CLAUDE_SESSIONS = path.join(require('os').homedir(), '.claude/projects/-workspaces-mulesoft-bmad-planning');
const ARCHITECTS    = {
  '1': { name: 'Kailash Chanda',    email: 'kailash@dataskate.ai' },
  '2': { name: 'Raghuram Potluri',  email: 'raghuram@dataskate.ai' },
};

// ─── CLI Args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getFlag  = (flag) => { const i = args.indexOf(flag); return i !== -1; };
const getArg   = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const clientArg           = getArg('--client');
const skipOnboarding      = getFlag('--skip-onboarding');
const pipelineMode        = getFlag('--pipeline');        // auto-confirm all gates
const deltaMode           = getArg('--mode') === 'delta'; // scope amendment run
const recordingArg        = getArg('--recording');        // recording file for delta
const checkAcceptanceMode = getFlag('--check-acceptance'); // read Firestore acceptance → lockedPricing

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function mergeJson(filePath, updates) {
  const existing = readJson(filePath) || {};
  const merged = deepMerge(existing, updates);
  writeJson(filePath, merged);
}

function deepMerge(target, source) {
  const out = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    if (Array.isArray(source[key])) {
      // Arrays: replace (caller decides merge strategy per key)
      out[key] = source[key];
    } else if (source[key] && typeof source[key] === 'object') {
      out[key] = deepMerge(target[key] || {}, source[key]);
    } else if (source[key] !== undefined && source[key] !== null) {
      out[key] = source[key];
    }
  }
  return out;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Convert all files in dir to .txt companions before text processing.
// Runs synchronously and non-interactively. Failures are non-fatal.
function preExtractInbox(dir) {
  if (!fs.existsSync(dir)) return;
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, 'pipeline/tools/extract-text.js'), dir, '--auto-skip'],
    { cwd: ROOT, encoding: 'utf8' }
  );
  if (result.error) console.warn(dim(`  ⚠  Pre-extraction warning: ${result.error.message}`));
}


function today() {
  return new Date().toISOString().split('T')[0];
}

function isoNow() {
  return new Date().toISOString();
}

function bold(s)   { return `\x1b[1m${s}\x1b[0m`; }
function dim(s)    { return `\x1b[2m${s}\x1b[0m`; }
function green(s)  { return `\x1b[32m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function cyan(s)   { return `\x1b[36m${s}\x1b[0m`; }
function red(s)    { return `\x1b[31m${s}\x1b[0m`; }

// ─── Step Logger ──────────────────────────────────────────────────────────────

let _logFile  = null;
let _logJsonl = null;
let _logSlug  = null;

function setLogFile(slug) {
  _logSlug = slug;
  const logDir = path.join(ROOT, 'pipeline/logs', 'scout-pipeline');
  fs.mkdirSync(logDir, { recursive: true });
  _logFile  = path.join(logDir, `${slug}.log`);
  _logJsonl = path.join(logDir, `${slug}.jsonl`);
  // Session-start separator — makes multiple runs in the same file visually distinct
  const sep = `\n${'='.repeat(80)}\n  SESSION START  ${new Date().toISOString()}  client=${slug}\n${'='.repeat(80)}\n`;
  try { fs.appendFileSync(_logFile,  sep); } catch { /* non-fatal */ }
  try { fs.appendFileSync(_logJsonl, JSON.stringify({ _sessionStart: true, ts: new Date().toISOString(), client: slug }) + '\n'); } catch { /* non-fatal */ }
}

function _writeLog(lineText, rec) {
  if (_logFile)  { try { fs.appendFileSync(_logFile,  lineText + '\n'); } catch { /* non-fatal */ } }
  if (_logJsonl) { try { fs.appendFileSync(_logJsonl, JSON.stringify(rec) + '\n'); } catch { /* non-fatal */ } }
}

function stepLog(msg, level = 'INFO', data = null) {
  const now    = new Date();
  const ts     = now.toISOString();
  const tsFmt  = ts.replace('T', ' ').slice(0, 23); // 2024-01-15 10:30:15.123
  const lvl    = level.padEnd(5);
  const suffix = data ? '  ' + JSON.stringify(data) : '';
  const line   = `[${tsFmt}] [${lvl}] ${msg}${suffix}`;

  if      (level === 'START') console.log(`  ${cyan('▶')} ${dim(tsFmt)} ${bold(msg)}`);
  else if (level === 'END')   console.log(`  ${green('■')} ${dim(tsFmt)} ${msg}`);
  else if (level === 'WARN')  console.log(`  ${yellow('!')} ${dim(tsFmt)} ${msg}`);
  else if (level === 'ERROR') console.log(`  ${red('✗')} ${dim(tsFmt)} ${msg}`);
  else if (level === 'DATA')  console.log(`  ${dim('[DATA] ' + msg)}`);
  else                         console.log(`  ${dim(tsFmt + ' ' + msg)}`);

  _writeLog(line, { ts, level, msg, ...(data || {}) });
}

// Log a structured data object — multiline pretty-print in .log, single JSON line in .jsonl
function logObj(label, obj) {
  const ts  = new Date().toISOString();
  const txt = JSON.stringify(obj, null, 2).split('\n').map(l => '    ' + l).join('\n');
  if (_logFile)  { try { fs.appendFileSync(_logFile,  `  [DATA] ${label}:\n${txt}\n`); } catch { /* non-fatal */ } }
  if (_logJsonl) { try { fs.appendFileSync(_logJsonl, JSON.stringify({ ts, level: 'DATA', label, data: obj }) + '\n'); } catch { /* non-fatal */ } }
}

// Log file existence + size; for JSON files also logs top-level keys
function logFileInfo(filePath, label) {
  const tag = label || path.relative(ROOT, filePath);
  try {
    if (!fs.existsSync(filePath)) { stepLog(`FILE NOT FOUND: ${tag}`, 'WARN'); return; }
    const stat = fs.statSync(filePath);
    const kb   = (stat.size / 1024).toFixed(1);
    if (path.extname(filePath).toLowerCase() === '.json' && stat.size < 512 * 1024) {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const keys   = Array.isArray(parsed) ? `[array len=${parsed.length}]` : Object.keys(parsed).join(', ');
        stepLog(`FILE ${tag}: ${kb} KB — keys: ${keys}`, 'DATA');
        return;
      } catch { /* fall through */ }
    }
    stepLog(`FILE ${tag}: ${kb} KB`, 'DATA');
  } catch { /* non-fatal */ }
}

// Horizontal section divider — makes long log files easier to scan
function logSection(title) {
  const line = `\n${'─'.repeat(70)}\n  ${title}\n${'─'.repeat(70)}`;
  if (_logFile)  { try { fs.appendFileSync(_logFile,  line + '\n'); } catch { /* non-fatal */ } }
  if (_logJsonl) { try { fs.appendFileSync(_logJsonl, JSON.stringify({ ts: new Date().toISOString(), level: 'SECTION', title }) + '\n'); } catch { /* non-fatal */ } }
}

// ─── Readline Gate ────────────────────────────────────────────────────────────

async function prompt(question) {
  if (pipelineMode) return '';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, ans => { rl.close(); resolve(ans.trim()); });
  });
}

async function confirm(message, defaultYes = true) {
  if (pipelineMode) {
    if (!defaultYes) {
      // defaultYes=false means this is a destructive/warning confirmation — never auto-approve in pipeline mode
      stepLog(`Pipeline mode: refusing auto-confirm for warning prompt: ${message}`, 'ERROR');
      console.error(`  ${red('✗')} Pipeline mode cannot auto-confirm: ${message}`);
      console.error(`  ${red('✗')} Run agents manually first, then re-run --pipeline.`);
      process.exit(1);
    }
    console.log(`  ${dim('(pipeline mode — auto-confirm)')}`);
    return true;
  }
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const ans  = await prompt(`${message} ${hint}: `);
  if (!ans) return defaultYes;
  return ans.toLowerCase().startsWith('y');
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

async function onboard({ displayName: inferred, source: inferredSource } = {}) {
  const inboxFiles = fs.existsSync(INBOX_DIR)
    ? fs.readdirSync(INBOX_DIR).filter(f => f !== '.gitkeep' && !f.startsWith('.'))
    : [];

  console.log('\n' + bold('━'.repeat(60)));
  console.log(bold('  DSPipeline — Scout Onboarding'));
  console.log(bold('━'.repeat(60)));

  if (inboxFiles.length > 0) {
    console.log(`\n  Found ${cyan(inboxFiles.length)} file(s) in _inbox/:`);
    inboxFiles.forEach(f => console.log(`    ${dim('•')} ${f}`));
  } else {
    console.log(yellow('\n  ⚠  _inbox/ is empty. Drop scoping files there and re-run.'));
    process.exit(1);
  }

  console.log('\n  Pre-filled defaults shown in bold. Press Enter to accept, or type a new value.\n');

  const defaultName = inferred || 'Unknown Client';
  const sourceNote  = inferredSource === 'ai-inference'
    ? dim('  ← Gemini read your transcript')
    : inferredSource === 'filename'
    ? dim('  ← inferred from filename')
    : '';
  if (inferred) {
    console.log(`  Suggested client name: ${bold(cyan(inferred))}${sourceNote}`);
  }
  const rawName     = await prompt(inferred
    ? `  Accept or type a different name: `
    : `  1. Client name: `);
  const displayName = rawName || defaultName;

  const defaultSlug = slugify(displayName);
  const rawSlug     = await prompt(`  2. Folder slug      [${bold(defaultSlug)}]: `);
  const slug        = slugify(rawSlug || defaultSlug);

  const rawArch     = await prompt(`  3. Architect        [${bold('1')} = Kailash Chanda | 2 = Raghuram Potluri]: `);
  const archKey     = (rawArch === '2') ? '2' : '1';
  const architect   = ARCHITECTS[archKey];

  const defaultType = 'new integration';
  const rawType     = await prompt(`  4. Engagement type  [${bold(defaultType)}] (or: migration / enhancement): `);
  const engType     = rawType || defaultType;

  const rawGoLive   = await prompt(`  5. Go-live target   [${bold('TBD')}]: `);
  const goLive      = rawGoLive || 'TBD';

  const rawContact  = await prompt(`  6. Client contact   [${bold('skip')}] (name, email — or press Enter): `);
  const contactParts = rawContact ? rawContact.split(',').map(s => s.trim()) : [];
  const contact     = rawContact
    ? { name: contactParts[0] || null, email: contactParts[1] || null }
    : { name: null, email: null };

  const rawAE       = await prompt(`  7. MuleSoft AE      [${bold('skip')}] (name — or press Enter): `);
  const ae          = { name: rawAE || null, isNewToDataSkate: true };

  const rawNewAE    = rawAE ? await prompt(`  8. AE new to DataSkate? [${bold('yes')}] (yes/no): `) : null;
  if (rawNewAE) ae.isNewToDataSkate = !rawNewAE.toLowerCase().startsWith('n');

  console.log('\n  ' + '─'.repeat(56));
  console.log(`  ${bold('Project:')}    ${displayName}`);
  console.log(`  ${bold('Slug:')}       projects/${slug}/`);
  console.log(`  ${bold('Architect:')}  ${architect.name} <${architect.email}>`);
  console.log(`  ${bold('Type:')}       ${engType}`);
  console.log(`  ${bold('Go-live:')}    ${goLive}`);
  console.log(`  ${bold('Contact:')}    ${contact.name || '—'} ${contact.email ? `<${contact.email}>` : ''}`);
  console.log(`  ${bold('AE:')}         ${ae.name || '—'} (new to DataSkate: ${ae.isNewToDataSkate})`);
  console.log('  ' + '─'.repeat(56));

  const ok = await confirm('\n  Confirm and create project?');
  if (!ok) { console.log('  Aborted.'); process.exit(0); }

  // Open the per-client log now that we have a slug
  setLogFile(slug);

  logSection('ONBOARDING');
  stepLog(`ONBOARD START — ${displayName} (${slug})`, 'START');
  logObj('onboard.inputs', {
    displayName, slug,
    inferredSource: inferredSource || 'manual',
    architect:      `${architect.name} <${architect.email}>`,
    engagementType: engType,
    targetGoLive:   goLive,
    contact,
    ae,
    inboxFiles,
  });

  const projectDir  = path.join(PROJECTS_DIR, slug);
  const templateDir = path.join(PROJECTS_DIR, '_template');

  // Provision full folder structure from _template/ — single source of truth for new clients
  stepLog(`Provisioning project from _template/: cp -r → projects/${slug}/`);
  const cpResult = spawnSync('cp', ['-r', templateDir, projectDir], { encoding: 'utf8' });
  if (cpResult.error || cpResult.status !== 0) {
    const errMsg = (cpResult.stderr || '') + (cpResult.error?.message || '');
    stepLog(`cp -r _template/ failed: ${errMsg}`, 'ERROR');
    console.error(`  ${red('✗')} Failed to provision project from _template/: ${errMsg}`);
    process.exit(1);
  }

  // Rename dev/{slug}-integration/ placeholder to dev/${slug}-integration/
  const devStub = path.join(projectDir, 'dev', '{slug}-integration');
  const devReal = path.join(projectDir, 'dev', `${slug}-integration`);
  if (fs.existsSync(devStub)) {
    fs.renameSync(devStub, devReal);
    stepLog(`Renamed dev/{slug}-integration/ → dev/${slug}-integration/`, 'DATA');
  }

  stepLog('Project directory structure provisioned from _template/', 'END');

  // Move only text files to scoping/ — binary originals stay in _inbox/ until after Sage
  // (keeps Sage's context clean: no duplicate binary+txt representations)
  logSection('INBOX → SCOPING');
  stepLog('Moving inbox text files → scoping/', 'START');
  const TEXT_EXTS = new Set(['.txt', '.md', '.json', '.yaml', '.yml', '.csv', '.rst']);
  const scopingDir = path.join(projectDir, 'scoping');
  let moved = 0;
  let binaryCount = 0;
  const movedFiles = [], heldFiles = [];
  for (const file of inboxFiles) {
    const ext = path.extname(file).toLowerCase();
    if (!TEXT_EXTS.has(ext)) { binaryCount++; heldFiles.push(file); continue; }
    fs.renameSync(path.join(INBOX_DIR, file), path.join(scopingDir, file));
    stepLog(`  MOVE  _inbox/${file} → scoping/${file}`, 'DATA');
    movedFiles.push(file);
    moved++;
  }
  if (heldFiles.length > 0) {
    stepLog(`  HELD in _inbox/ (binaries, move after Sage): ${heldFiles.join(', ')}`, 'DATA');
  }
  console.log(`\n  ${green('✓')} Moved ${moved} text file(s) to projects/${slug}/scoping/`);
  if (binaryCount > 0) {
    console.log(`  ${dim(`  ${binaryCount} source binary file(s) remain in _inbox/ — will move to scoping/ after Sage completes`)}`);
  }
  stepLog(`Moved ${moved} text file(s) to scoping/ (${binaryCount} binaries held back)`, 'END', { moved: movedFiles, held: heldFiles });

  // Write project.json
  logSection('INITIALIZING PROJECT FILES');
  stepLog('Initializing project JSON files', 'START');
  const projectJson = {
    client:        slug,
    displayName:   displayName,
    architect:     architect.name,
    architectEmail: architect.email,
    engagementType: engType,
    targetGoLive:  goLive,
    primaryContact: contact,
    ae:            ae,
    createdAt:     today(),
    createdBy:     'orchestrate.js',
    sessionStatus: {},
  };
  writeJson(path.join(projectDir, 'project.json'), projectJson);
  logFileInfo(path.join(projectDir, 'project.json'), `projects/${slug}/project.json`);
  console.log(`  ${green('✓')} Created projects/${slug}/project.json`);

  // Initialize decisions.json — always overwrite the template placeholder
  const decisionsPath = path.join(projectDir, 'decisions.json');
  writeJson(decisionsPath, { client: slug, createdAt: isoNow(), decisions: [] });
  stepLog(`INIT decisions.json (empty)`, 'DATA');
  console.log(`  ${green('✓')} Initialized projects/${slug}/decisions.json`);

  // Initialize company_context.json shell — always overwrite the template placeholder
  const ctxPath = path.join(projectDir, 'company_context.json');
  writeJson(ctxPath, {
    client:          slug,
    generatedAt:     isoNow(),
    snapshot:        null,
    industry:        null,
    businessObjects: [],
    hqLocation:      null,
    revenueEstimate: null,
    aiJourney:       { phase1: null, phase2: null, phase3: null },
    confirmedFlows:  [],
    potentialFlows:  [],
    signals:         [],
    namedContacts:   [],
    systemFindings:  [],
    p0Blockers:      [],
    nearbyPeers:     [],
    competitorFOMO:  [],
    aiThoughtStarters: [],
    psychologyProfile: null,
  });
  stepLog(`INIT company_context.json (shell — all fields null/empty)`, 'DATA');
  console.log(`  ${green('✓')} Initialized projects/${slug}/company_context.json`);

  // Initialize pipeline-state.json
  const statePath = path.join(projectDir, 'scoping', 'run', 'pipeline-state.json');
  writeJson(statePath, {
    client:      slug,
    startedAt:   isoNow(),
    currentStep: 1,
    completed:   [],
  });
  stepLog(`INIT pipeline-state.json (step=1, completed=[])`, 'DATA');
  console.log(`  ${green('✓')} Initialized projects/${slug}/scoping/run/pipeline-state.json`);

  // Ensure telemetry directory exists
  fs.mkdirSync(path.dirname(TELEMETRY_CSV), { recursive: true });
  if (!fs.existsSync(TELEMETRY_CSV)) {
    fs.writeFileSync(TELEMETRY_CSV, 'date,client,pipeline,agent,model,input_tokens,output_tokens,cost_usd,duration_ms,status\n');
    stepLog(`INIT telemetry/usage.csv (new file with header)`, 'DATA');
    console.log(`  ${green('✓')} Initialized pipeline/telemetry/usage.csv`);
  }

  stepLog(`ONBOARD END — project files initialized`, 'END');
  console.log(`\n  ${green('✓')} Project ${bold(displayName)} ready.`);
  return slug;
}

// ─── Pipeline State ───────────────────────────────────────────────────────────

function readState(slug) {
  const statePath = path.join(PROJECTS_DIR, slug, 'scoping', 'run', 'pipeline-state.json');
  return readJson(statePath) || { client: slug, currentStep: 1, completed: [] };
}

function writeState(slug, state) {
  const statePath = path.join(PROJECTS_DIR, slug, 'scoping', 'run', 'pipeline-state.json');
  writeJson(statePath, state);
}

function markComplete(slug, agentSlug, durationMs, tokens = {}) {
  const state = readState(slug);
  if (!state.completed.includes(agentSlug)) {
    state.completed.push(agentSlug);
  }
  state.currentStep = state.completed.length + 1;
  state[`${agentSlug}CompletedAt`] = isoNow();
  writeState(slug, state);
  appendTelemetry(slug, agentSlug, durationMs, 'complete', tokens);
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

// Loaded from telemetry/model-pricing.json — edit that file when rates change
const MODEL_PRICING = readJson(path.join(ROOT, 'pipeline/telemetry/model-pricing.json')) || {};

function calcCost(model, inputTokens, outputTokens) {
  const p = MODEL_PRICING[model] || MODEL_PRICING.sonnet || { input: 3.00, output: 15.00 };
  return ((inputTokens * p.input + outputTokens * p.output) / 1_000_000).toFixed(4);
}

// Read the most recently modified Claude session JSONL written after `sinceMs`
// and sum all token usage across every assistant message turn.
function readSessionTokens(sinceMs) {
  try {
    if (!fs.existsSync(CLAUDE_SESSIONS)) return null;
    const files = fs.readdirSync(CLAUDE_SESSIONS)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ f, mtime: fs.statSync(path.join(CLAUDE_SESSIONS, f)).mtimeMs }))
      .filter(({ mtime }) => mtime > sinceMs)
      .sort((a, b) => b.mtime - a.mtime);
    if (!files.length) return null;

    const lines = fs.readFileSync(path.join(CLAUDE_SESSIONS, files[0].f), 'utf8')
      .split('\n').filter(Boolean);

    let inp = 0, cacheCreate = 0, cacheRead = 0, out = 0;
    for (const line of lines) {
      try {
        const rec = JSON.parse(line);
        const u = rec?.message?.usage;
        if (!u) continue;
        inp         += u.input_tokens                  || 0;
        cacheCreate += u.cache_creation_input_tokens   || 0;
        cacheRead   += u.cache_read_input_tokens       || 0;
        out         += u.output_tokens                 || 0;
      } catch { /* malformed line — skip */ }
    }
    return { inp, cacheCreate, cacheRead, out };
  } catch {
    return null;
  }
}

function appendTelemetry(slug, agentSlug, durationMs, status, tokens = {}) {
  const row = [
    today(),
    slug,
    'scout',
    agentSlug,
    tokens.model || '',
    tokens.input  || '',
    tokens.output || '',
    tokens.cost   || '',
    durationMs    || '',
    status,
  ].join(',');
  try { fs.appendFileSync(TELEMETRY_CSV, row + '\n'); }
  catch { /* non-fatal */ }
}

// ─── company_context.json Assembly ───────────────────────────────────────────
// Called after each agent completes. Maps run/{agent}.json → company_context.json.

function assembleContext(slug, agentSlug) {
  const projectDir = path.join(PROJECTS_DIR, slug);
  const ctxPath    = path.join(projectDir, 'company_context.json');
  const ctx        = readJson(ctxPath) || {};

  const runFile = path.join(projectDir, 'scoping', 'run', `${agentSlug}.json`);
  const data    = readJson(runFile);
  if (!data) {
    stepLog(`assembleContext(${agentSlug}): scoping/run/${agentSlug}.json not found — skipping merge`, 'WARN');
    return;
  }

  stepLog(`assembleContext(${agentSlug}): merging scoping/run/${agentSlug}.json → company_context.json`, 'START');
  logFileInfo(runFile, `run/${agentSlug}.json`);

  // Track which fields we update for the log
  const updated = [];

  switch (agentSlug) {

    case 'sage': {
      // Sage: extract document facts into company_context
      const updates = { generatedAt: isoNow() };
      if (data.businessContext) {
        if (data.businessContext.industry)           { updates.industry  = data.businessContext.industry;               updated.push('industry'); }
        if (data.businessContext.companyDescription) { updates.snapshot  = data.businessContext.companyDescription;     updated.push('snapshot'); }
      }
      if (Array.isArray(data.confirmedFlows))  { updates.confirmedFlows = data.confirmedFlows; updated.push(`confirmedFlows[${data.confirmedFlows.length}]`); }
      if (Array.isArray(data.potentialFlows))  { updates.potentialFlows = data.potentialFlows; updated.push(`potentialFlows[${data.potentialFlows.length}]`); }
      if (Array.isArray(data.signals))         { updates.signals = data.signals.map(s => s.signal || s); updated.push(`signals[${data.signals.length}]`); }
      if (Array.isArray(data.namedContacts))   { updates.namedContacts  = data.namedContacts;  updated.push(`namedContacts[${data.namedContacts.length}]`); }
      Object.assign(ctx, updates);
      break;
    }

    case 'vera': {
      // Project vera.json fields into company_context
      if (data.company) {
        const c = data.company;
        if (c.snapshot)        { ctx.snapshot        = c.snapshot;        updated.push('snapshot'); }
        if (c.industry)        { ctx.industry        = c.industry;        updated.push(`industry=${c.industry}`); }
        if (c.verticalSlug)    { ctx.verticalSlug    = c.verticalSlug;    updated.push(`vertical=${c.verticalSlug}`); }
        if (c.hqLocation)      { ctx.hqLocation      = c.hqLocation;      updated.push(`hq=${c.hqLocation}`); }
        if (c.revenueEstimate) { ctx.revenueEstimate = c.revenueEstimate; updated.push(`revenue=${c.revenueEstimate}`); }
        if (c.revenueBracket)  { ctx.revenueBracket  = c.revenueBracket;  updated.push(`revenueBracket=${c.revenueBracket}`); }
        if (Array.isArray(c.businessObjects) && c.businessObjects.length) { ctx.businessObjects = c.businessObjects; updated.push(`businessObjects[${c.businessObjects.length}]`); }
        if (c.logoUrl !== undefined) { ctx.logoUrl   = c.logoUrl;         updated.push('logoUrl'); }
      }
      if (data.aiJourney)                    { ctx.aiJourney           = data.aiJourney;           updated.push('aiJourney'); }
      if (Array.isArray(data.systemPrerequisites)) { ctx.systemPrerequisites = data.systemPrerequisites; updated.push(`systemPrereqs[${data.systemPrerequisites.length}]`); }
      if (Array.isArray(data.nearbyPeers))   { ctx.nearbyPeers         = data.nearbyPeers;         updated.push(`nearbyPeers[${data.nearbyPeers.length}]`); }
      if (Array.isArray(data.competitorFOMO)){ ctx.competitorFOMO      = data.competitorFOMO;      updated.push(`competitorFOMO[${data.competitorFOMO.length}]`); }
      if (Array.isArray(data.aiThoughtStarters)){ ctx.aiThoughtStarters= data.aiThoughtStarters;  updated.push(`aiThoughtStarters[${data.aiThoughtStarters.length}]`); }
      ctx.generatedAt = isoNow();
      break;
    }

    case 'rex': {
      // Rex: system findings + initial p0Blockers
      if (Array.isArray(data.systemFindings)) {
        const before = (ctx.systemFindings || []).length;
        ctx.systemFindings = [...(ctx.systemFindings || []), ...data.systemFindings];
        updated.push(`systemFindings: ${before} → ${ctx.systemFindings.length}`);
      }
      if (Array.isArray(data.p0Blockers) && data.p0Blockers.length > 0) {
        ctx.p0Blockers = data.p0Blockers;
        updated.push(`p0Blockers[${data.p0Blockers.length}] (will be overwritten by Flo)`);
      }
      break;
    }

    case 'ivy': {
      // Ivy: psychology profile
      if (data.psychologyProfile) { ctx.psychologyProfile = data.psychologyProfile; updated.push('psychologyProfile'); }
      break;
    }

    case 'flo': {
      // Flo: consolidated p0Blockers + flow updates
      if (Array.isArray(data.p0Blockers))     { ctx.p0Blockers    = data.p0Blockers;    updated.push(`p0Blockers[${data.p0Blockers.length}]`); }
      if (Array.isArray(data.confirmedFlows)) { ctx.confirmedFlows = data.confirmedFlows; updated.push(`confirmedFlows[${data.confirmedFlows.length}]`); }
      if (Array.isArray(data.potentialFlows)) { ctx.potentialFlows = data.potentialFlows; updated.push(`potentialFlows[${data.potentialFlows.length}]`); }
      break;
    }

    case 'hawk':
    case 'petra':
    case 'mira': {
      ctx.generatedAt = isoNow();
      updated.push('generatedAt (touch only)');
      break;
    }

    case 'quinn': {
      // 8e: Quinn surfaces final p0Blockers, aiJourney updates, and systemFindings
      // during questionnaire assembly — merge them into company_context here.
      if (Array.isArray(data.p0Blockers) && data.p0Blockers.length > 0) {
        ctx.p0Blockers = data.p0Blockers;
        updated.push(`p0Blockers[${data.p0Blockers.length}]`);
      }
      if (data.aiJourney) { ctx.aiJourney = data.aiJourney; updated.push('aiJourney'); }
      if (Array.isArray(data.systemFindings) && data.systemFindings.length > 0) {
        const existing = ctx.systemFindings || [];
        const merged   = [...existing];
        for (const f of data.systemFindings) {
          if (!merged.find(e => e.system === f.system && e.finding === f.finding)) {
            merged.push(f);
          }
        }
        updated.push(`systemFindings: ${existing.length} → ${merged.length}`);
        ctx.systemFindings = merged;
      }
      ctx.generatedAt = isoNow();
      break;
    }
  }

  stepLog(`assembleContext(${agentSlug}): updated fields — ${updated.join(' | ') || 'none'}`, 'DATA', { agent: agentSlug, updatedFields: updated });
  writeJson(ctxPath, ctx);
  logFileInfo(ctxPath, 'company_context.json (after merge)');
  stepLog(`assembleContext(${agentSlug}): done`, 'END');
}

// ─── Decisions Aggregation ────────────────────────────────────────────────────
// Called after every agent. Reads all run/*-decisions.json and rebuilds decisions.json.

function aggregateDecisions(slug) {
  const projectDir    = path.join(PROJECTS_DIR, slug);
  const runDir        = path.join(projectDir, 'scoping', 'run');
  const decisionsPath = path.join(projectDir, 'decisions.json');
  const decisionFiles = fs.existsSync(runDir)
    ? fs.readdirSync(runDir).filter(f => f.endsWith('-decisions.json')).sort()
    : [];
  if (!decisionFiles.length) {
    stepLog('aggregateDecisions: no *-decisions.json files found — skipping', 'DATA');
    return;
  }
  stepLog(`aggregateDecisions: reading ${decisionFiles.length} decision file(s): ${decisionFiles.join(', ')}`, 'DATA');
  const allDecisions = [];
  for (const file of decisionFiles) {
    const d = readJson(path.join(runDir, file));
    if (d && Array.isArray(d.decisions)) {
      stepLog(`  ${file}: ${d.decisions.length} decision(s)`, 'DATA');
      allDecisions.push(...d.decisions);
    } else {
      stepLog(`  ${file}: no decisions array — skipped`, 'WARN');
    }
  }
  writeJson(decisionsPath, { client: slug, updatedAt: isoNow(), decisions: allDecisions });
  stepLog(`aggregateDecisions: wrote ${allDecisions.length} total decision(s) to decisions.json`, 'DATA');
  logFileInfo(decisionsPath, 'decisions.json (after aggregate)');
}

// ─── Diagram Content Assembly + Renderer (post-Flo / post-Petra) ─────────────
// Assembles diagram-content.json from agent outputs, then runs generate-diagram.js
// to produce SVGs. Only the Scout pipeline levels are assembled here (scoping + sow).
// Future pipelines (PRD → Hypercare) assemble their own diagram-content entries.

// Strips parentheticals and collapses "(or X ...)" alternatives into "A / B" labels.
// "Google Sheets (or Excel Online — conditional...)" → "Google Sheets / Excel"
function cleanSystemName(raw) {
  const orMatch = raw.match(/^(.+?)\s*\(or\s+([^)—,]+)/i);
  if (orMatch) {
    const part1 = orMatch[1].trim();
    const part2 = orMatch[2].trim().replace(/\s+online\b/i, '').trim();
    return `${part1} / ${part2}`;
  }
  return raw.replace(/\s*\([^)]*\)/g, '').trim();
}

// Bidirectional: a system appearing as source in ANY flow goes left; target in ANY flow goes right.
// Uses flow.systems[] for canonical display names (not the short direction strings).
// Systems can appear on both sides — matching the old system-diagram SVG behaviour.
function extractSystemLists(confirmedFlows) {
  const sources = new Map(); // normalized-key → display name
  const targets = new Map();

  for (const flow of confirmedFlows) {
    const dir = (flow.direction || '').trim();
    const flowSystems = (flow.systems || []).map(s => s.trim()).filter(Boolean);

    let srcDisplay, tgtDisplay;

    if (flowSystems.length >= 2) {
      // flow.systems[] is position-ordered: [0] is source side, [-1] is target side.
      // Use these for canonical display names; direction only confirms ordering.
      srcDisplay = cleanSystemName(flowSystems[0]);
      tgtDisplay = cleanSystemName(flowSystems[flowSystems.length - 1]);
    } else if (dir) {
      const parts = dir.split(/\s*[→>]\s*/);
      if (parts.length >= 2) {
        srcDisplay = cleanSystemName(parts[0]);
        tgtDisplay = cleanSystemName(parts[parts.length - 1]);
      }
    }

    if (srcDisplay && !/^mulesoft$/i.test(srcDisplay))
      sources.set(srcDisplay.toLowerCase(), srcDisplay);
    if (tgtDisplay && !/^mulesoft$/i.test(tgtDisplay))
      targets.set(tgtDisplay.toLowerCase(), tgtDisplay);
  }

  return { sources: [...sources.values()], targets: [...targets.values()] };
}

function assembleDiagramContent(slug, levels) {
  const projectDir  = path.join(PROJECTS_DIR, slug);
  const project     = readJson(path.join(projectDir, 'project.json')) || {};
  const flo         = readJson(path.join(projectDir, 'scoping', 'run', 'flo.json')) || {};
  const rex         = readJson(path.join(projectDir, 'scoping', 'run', 'rex.json')) || {};
  const petra       = readJson(path.join(projectDir, 'scoping', 'run', 'petra.json')) || {};
  const registry    = readJson(path.join(ROOT, 'commons', 'diagram-registry.json')) || { templates: [] };

  const contentPath = path.join(projectDir, 'intake', 'diagrams', 'diagram-content.json');
  const existing    = readJson(contentPath) || { client: slug, assembledAt: isoNow(), diagrams: [] };

  const confirmedFlows = flo.confirmedFlows || [];
  const { sources, targets } = extractSystemLists(confirmedFlows);

  const flowNames   = confirmedFlows.map(f => f.name).filter(Boolean);
  const flowCount   = confirmedFlows.length;

  const scopingTokens = {
    '__CLIENT_NAME__':      project.displayName || slug,
    '__CURRENT_SYSTEMS__':  sources.join(', '),
    '__DEPRECATED__':       '',
    '__HUB__':              'MuleSoft (DataSkate managed)',
    '__TARGETS__':          targets.join(', '),
    '__FLOW_COUNT__':       String(flowCount),
    '__CONFIRMED_FLOWS__':  flowNames.slice(0, 20).join(', '),
    '__OUT_OF_SCOPE__':     '',
    '__P0_BLOCKERS__':      (flo.p0Blockers || []).map(b => b.title || b.blocker || b.description).filter(Boolean).join(', '),
  };

  // SOW tokens: Petra provides proposal phasing — use basic timeline if not available
  const sowTokens = {
    ...scopingTokens,
    '__TIMELINE_BODY__': (petra.proposalContent?.timeline?.mermaidBody) || [
      '    section Discovery',
      '    Requirements & Architecture :disc, 2026-06-01, 2w',
      '    section Implementation',
      '    Integration Build           :build, after disc, 6w',
      '    section Validation',
      '    UAT & Go-Live               :uat, after build, 2w',
    ].join('\n'),
    '__IN_SCOPE__':      flowNames.slice(0, 20).join(', '),
    '__OUT_OF_SCOPE__':  '',
    '__ASSUMPTIONS_BODY__': '',
  };

  for (const template of registry.templates) {
    if (!levels.includes(template.level)) continue;
    const tokens = template.level === 'sow' ? sowTokens : scopingTokens;

    const entry = {
      id:          template.outputId,
      level:       template.level,
      type:        template.type,
      templateRef: template.templateFile,
      title:       template.title,
      generatedBy: template.generatedBy,
      tokens:      Object.fromEntries(
        (template.tokens || []).map(t => [t, tokens[t] ?? ''])
      ),
    };

    const existingIdx = existing.diagrams.findIndex(d => d.id === template.outputId);
    if (existingIdx >= 0) existing.diagrams[existingIdx] = entry;
    else existing.diagrams.push(entry);
  }

  existing.assembledAt = isoNow();
  fs.mkdirSync(path.dirname(contentPath), { recursive: true });
  writeJson(contentPath, existing);
  logFileInfo(contentPath, `intake/diagrams/diagram-content.json (levels: ${levels.join(',')})`);
}

function runDiagramRenderer(slug) {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, 'pipeline/scripts/generate-diagram.js'), slug],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' }
  );
  const out = (result.stdout || '').trim();
  const err = (result.stderr || '').trim();
  if (out) out.split('\n').forEach(l => stepLog(l, 'DATA'));
  if (err) err.split('\n').forEach(l => stepLog(l, 'WARN'));
  if (result.error) {
    stepLog(`generate-diagram.js error: ${result.error.message}`, 'ERROR');
    return false;
  }
  return result.status === 0;
}

// ─── Client Registry Write (post-Flo) ────────────────────────────────────────
// Writes a complete entry to projects/client-registry.json once Flo has confirmed
// the flow list (systems[]) and Vera has confirmed vertical + sizeSegment.

function writeClientRegistry(slug) {
  const registryPath = path.join(ROOT, 'projects/client-registry.json');
  const projectDir   = path.join(PROJECTS_DIR, slug);
  const project      = readJson(path.join(projectDir, 'project.json')) || {};
  const vera         = readJson(path.join(projectDir, 'scoping', 'run', 'vera.json')) || {};
  const flo          = readJson(path.join(projectDir, 'scoping', 'run', 'flo.json')) || {};

  // Prefer flo.confirmedFlows (most accurate); fall back to sage.systems[] before Flo runs
  const sage = readJson(path.join(projectDir, 'scoping', 'run', 'sage.json')) || {};
  const systems = flo.confirmedFlows?.length
    ? (flo.confirmedFlows).flatMap(f => f.systems || []).filter((v, i, a) => a.indexOf(v) === i)
    : (sage.systems || []).map(s => s.name).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

  const entry = {
    slug,
    displayName:     project.displayName || slug,
    vertical:        vera.company?.verticalSlug || null,
    sizeSegment:     vera.company?.revenueBracket || null,
    systems,
    architect:       project.architect || null,
    architectEmail:  project.architectEmail || null,
    status:          'scoping',
    engagementDate:  project.engagementDate || today(),
    projectContext:  vera.company?.snapshot || null,
  };

  const registry = readJson(registryPath) || { clients: [] };
  if (!Array.isArray(registry.clients)) registry.clients = [];

  const existingIdx = registry.clients.findIndex(c => c.slug === slug);
  if (existingIdx >= 0) {
    registry.clients[existingIdx] = { ...registry.clients[existingIdx], ...entry };
    stepLog(`writeClientRegistry: updated existing entry for ${slug} (index ${existingIdx})`, 'DATA');
  } else {
    registry.clients.push(entry);
    stepLog(`writeClientRegistry: new entry added for ${slug} (now ${registry.clients.length} clients in registry)`, 'DATA');
  }
  logObj('clientRegistry.entry', entry);

  writeJson(registryPath, registry);
  logFileInfo(registryPath, 'client-registry.json (after write)');
}

// ─── Vera Corporate-Stack Enrichment Merge (post-Vera, pre-brief) ───────────
// Per the agent-boundary rule, Vera writes her sibling + sponsor-portfolio
// research into vera.json.corporateStackEnrichment instead of writing back
// into company_context.json directly. The orchestrator is the only writer
// allowed to mutate company_context.json, so the merge happens here.
//
// Runs immediately after Vera and BEFORE renderCorporateBrief() / Petra /
// Mira read the stack — so by the time any downstream consumer touches
// company_context.json.corporateStack, the enriched data is already there.
//
// Merge rules (per-list keyed by case-insensitive name):
//   - siblingBrands[]:           Vera's entries WIN over Scout's seeded ones.
//                                Scout-only siblings are preserved.
//   - portfolioCompanies[]:      Vera-only (Scout's seed doesn't populate this).
//   - siblingsTruncated:         Carried through verbatim.
function mergeVeraCorporateStackEnrichment(slug) {
  const projectDir = path.join(PROJECTS_DIR, slug);
  const veraPath   = path.join(projectDir, 'scoping', 'run', 'vera.json');
  const ctxPath    = path.join(projectDir, 'company_context.json');

  const vera = readJson(veraPath);
  const ctx  = readJson(ctxPath);

  if (!vera || !vera.corporateStackEnrichment) {
    stepLog('mergeVeraCorporateStackEnrichment: vera.json has no corporateStackEnrichment — skipping', 'DATA');
    return;
  }
  if (!ctx) {
    stepLog('mergeVeraCorporateStackEnrichment: company_context.json missing — skipping', 'WARN');
    return;
  }

  ctx.corporateStack = ctx.corporateStack || {};
  const enrich = vera.corporateStackEnrichment;

  // Operating platform siblings — merge by name (Vera's research overrides Scout's seed)
  if (enrich.operatingPlatform && Array.isArray(enrich.operatingPlatform.siblingBrands)) {
    ctx.corporateStack.operatingPlatform = ctx.corporateStack.operatingPlatform || {};
    const seedSiblings   = Array.isArray(ctx.corporateStack.operatingPlatform.siblingBrands)
      ? ctx.corporateStack.operatingPlatform.siblingBrands : [];
    const veraSiblings   = enrich.operatingPlatform.siblingBrands;
    const nameKey = (s) => String(s && s.name || '').trim().toLowerCase();
    const byName  = new Map();
    for (const s of seedSiblings) if (nameKey(s)) byName.set(nameKey(s), s);
    for (const s of veraSiblings) if (nameKey(s)) byName.set(nameKey(s), { ...byName.get(nameKey(s)), ...s });
    ctx.corporateStack.operatingPlatform.siblingBrands = Array.from(byName.values());
    if (typeof enrich.operatingPlatform.siblingsTruncated === 'boolean') {
      ctx.corporateStack.operatingPlatform.siblingsTruncated = enrich.operatingPlatform.siblingsTruncated;
    }
    stepLog(`mergeVeraCorporateStackEnrichment: merged ${veraSiblings.length} sibling enrichment(s) into ${byName.size} total`, 'DATA');
  }

  // Financial sponsor portfolio companies — Vera-only field
  if (enrich.financialSponsor && Array.isArray(enrich.financialSponsor.portfolioCompanies)) {
    ctx.corporateStack.financialSponsor = ctx.corporateStack.financialSponsor || {};
    ctx.corporateStack.financialSponsor.portfolioCompanies = enrich.financialSponsor.portfolioCompanies;
    stepLog(`mergeVeraCorporateStackEnrichment: wrote ${enrich.financialSponsor.portfolioCompanies.length} sponsor portfolio company(ies)`, 'DATA');
  }

  // Forward-looking talking points + intel-they-lack arrays (vera.toml Step 2c/2d)
  // The brief reads these from company_context.json — copy them across so the
  // post-Vera renderCorporateBrief() call picks them up without a separate read
  // of vera.json. Replace, don't merge: Vera owns these arrays end-to-end.
  if (Array.isArray(vera.forwardLookingTalkingPoints)) {
    ctx.forwardLookingTalkingPoints = vera.forwardLookingTalkingPoints;
    stepLog(`mergeVeraCorporateStackEnrichment: carried ${vera.forwardLookingTalkingPoints.length} forwardLookingTalkingPoint(s) to company_context`, 'DATA');
  }
  if (Array.isArray(vera.intelTheBuyerLacks)) {
    ctx.intelTheBuyerLacks = vera.intelTheBuyerLacks;
    stepLog(`mergeVeraCorporateStackEnrichment: carried ${vera.intelTheBuyerLacks.length} intelTheBuyerLacks entry(ies) to company_context`, 'DATA');
  }

  writeJson(ctxPath, ctx);
  logFileInfo(ctxPath, 'company_context.json (after Vera enrichment merge)');
  console.log(`  ${green('✓')} company_context.json — corporateStack enriched from vera.json`);
}

// ─── Corporate Brief (post-Vera) ─────────────────────────────────────────────
// Composes projects/{slug}/intake/corporate-brief-content.json from the data
// Scout's grounded inference already wrote into company_context.json, then
// renders the HTML via Eleventy. Runs alongside writeClientRegistry()
// in the post-Vera hook so the brief is ready as soon as research completes —
// long before Petra/Quinn finish their work, which means the architect can
// email the brief 48h pre-call without waiting on the full deliverable set.
//
// Source-of-truth chain (so the brief never drifts):
//   company_context.json.corporateStack  → operating / platform / sponsor
//   company_context.json.forwardLookingTalkingPoints[]  (Vera 2c)
//   company_context.json.intelTheBuyerLacks[]           (Vera 2d)
//   project.json                         → architect, displayName, date
function renderCorporateBrief(slug) {
  const projectDir   = path.join(PROJECTS_DIR, slug);
  const project      = readJson(path.join(projectDir, 'project.json')) || {};
  const ctx          = readJson(path.join(projectDir, 'company_context.json')) || {};
  const stack        = ctx.corporateStack || {};

  // Bail if Scout's inference produced nothing — no point rendering an empty brief.
  if (!stack.operatingBrand || !stack.operatingBrand.name) {
    stepLog('renderCorporateBrief: no corporateStack.operatingBrand — skipping brief', 'WARN');
    return null;
  }

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Auto-build citation chips from the entities we cite — these are the URLs
  // the architect wants surfaced as "sources" in the brief footer.
  const citations = [];
  const addCite = (label, url) => { if (url && !citations.find(c => c.url === url)) citations.push({ label, url }); };
  addCite(`${stack.operatingBrand.name} website`,    stack.operatingBrand.website);
  addCite(`${stack.operatingBrand.name} LinkedIn`,   stack.operatingBrand.linkedIn);
  if (stack.operatingPlatform) {
    addCite(`${stack.operatingPlatform.name} website`,  stack.operatingPlatform.website);
    addCite(`${stack.operatingPlatform.name} LinkedIn`, stack.operatingPlatform.linkedIn);
  }
  if (stack.financialSponsor) {
    addCite(`${stack.financialSponsor.name} website`,  stack.financialSponsor.website);
    addCite(`${stack.financialSponsor.name} LinkedIn`, stack.financialSponsor.linkedIn);
  }
  // Promote any per-sibling sourceUrl into the citation list too.
  (stack.operatingPlatform?.siblingBrands || []).forEach(s => {
    if (typeof s === 'object' && s.sourceUrl) addCite(`${s.name} — source`, s.sourceUrl);
  });

  // Inherit fields Vera enriches if present; otherwise leave the brief lean and
  // let the template render a "no signals yet" placeholder.
  const content = {
    meta: {
      clientName:     project.displayName || stack.operatingBrand.name,
      clientSlug:     slug,
      date:           today,
      architect:      project.architect      || 'DataSkate Team',
      architectEmail: project.architectEmail || 'kailash@dataskate.ai',
      subtitle:       'What we noticed before the deep-dive call',
    },
    intro: null, // template substitutes default copy when null
    operatingBrand:    stack.operatingBrand    || null,
    operatingPlatform: stack.operatingPlatform || null,
    financialSponsor:  stack.financialSponsor  || null,
    forwardLookingTalkingPoints: ctx.forwardLookingTalkingPoints || [],
    intelTheBuyerLacks:          ctx.intelTheBuyerLacks          || [],
    citations,
    closing: null, // template substitutes default sign-off when null
  };

  const contentPath = path.join(projectDir, 'intake', 'corporate-brief-content.json');
  fs.mkdirSync(path.dirname(contentPath), { recursive: true });
  writeJson(contentPath, content);
  logFileInfo(contentPath, 'corporate-brief-content.json');

  // Run Eleventy to render the corporate brief (and all other templates).
  const result = spawnSync('npm', ['run', 'build:html'], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    stepLog(`renderCorporateBrief: Eleventy build exited ${result.status} — ${(result.stderr || '').slice(0, 300)}`, 'WARN');
    return null;
  }

  // Copy from _build/ to the canonical project path.
  const eleventySrc = path.join(ROOT, 'portal', '_build', 'intake', `corporate-brief-${slug}.html`);
  const outPath     = path.join(projectDir, 'intake', 'client', `corporate-brief-${slug}.html`);
  if (!fs.existsSync(eleventySrc)) {
    stepLog(`renderCorporateBrief: Eleventy did not produce corporate-brief-${slug}.html`, 'WARN');
    return null;
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.copyFileSync(eleventySrc, outPath);
  logFileInfo(outPath, `corporate-brief-${slug}.html`);
  return outPath;
}

// ─── Render Intake (post-Quinn) ───────────────────────────────────────────────
// Extracts quinn.json.intakeContent → writes intake-content.json → Eleventy → copies HTML.

function renderIntake(slug) {
  const projectDir = path.join(PROJECTS_DIR, slug);
  const quinnData  = readJson(path.join(projectDir, 'scoping', 'run', 'quinn.json')) || {};
  if (!quinnData.intakeContent) {
    stepLog('renderIntake: quinn.json has no intakeContent — skipping', 'WARN');
    console.log(`  ${yellow('⚠')}  quinn.json missing intakeContent — intake HTML not rendered`);
    return null;
  }
  const contentPath = path.join(projectDir, 'intake', 'intake-content.json');
  fs.mkdirSync(path.dirname(contentPath), { recursive: true });
  writeJson(contentPath, quinnData.intakeContent);
  logFileInfo(contentPath, 'intake-content.json');
  const result = spawnSync('npm', ['run', 'build:html'], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    stepLog(`renderIntake: Eleventy build failed — ${(result.stderr || '').slice(0, 300)}`, 'WARN');
    return null;
  }
  const src = path.join(ROOT, 'portal', '_build', 'intake', `intake-questionnaire-${slug}.html`);
  const dst = path.join(projectDir, 'intake', 'client', `intake-questionnaire-${slug}.html`);
  if (!fs.existsSync(src)) {
    stepLog(`renderIntake: Eleventy did not produce intake-questionnaire-${slug}.html`, 'WARN');
    return null;
  }
  fs.copyFileSync(src, dst);
  logFileInfo(dst, `intake-questionnaire-${slug}.html`);
  return dst;
}

// ─── Render Proposal + Integration Deck (post-Petra) ─────────────────────────
// Extracts petra.json.proposalContent + integrationDeckContent → writes JSON → Eleventy → copies HTML.

function renderProposalAndDeck(slug) {
  const projectDir = path.join(PROJECTS_DIR, slug);
  const petraData  = readJson(path.join(projectDir, 'scoping', 'run', 'petra.json')) || {};
  const intakeDir  = path.join(projectDir, 'intake');
  fs.mkdirSync(intakeDir, { recursive: true });
  let anyWritten = false;
  if (petraData.proposalContent) {
    writeJson(path.join(intakeDir, 'proposal-content.json'), petraData.proposalContent);
    logFileInfo(path.join(intakeDir, 'proposal-content.json'), 'proposal-content.json');
    anyWritten = true;
  }
  if (petraData.integrationDeckContent) {
    writeJson(path.join(intakeDir, 'integration-deck-content.json'), petraData.integrationDeckContent);
    logFileInfo(path.join(intakeDir, 'integration-deck-content.json'), 'integration-deck-content.json');
    anyWritten = true;
  }
  if (!anyWritten) {
    stepLog('renderProposalAndDeck: petra.json has no proposalContent or integrationDeckContent — skipping', 'WARN');
    console.log(`  ${yellow('⚠')}  petra.json missing content fields — proposal/deck HTML not rendered`);
    return null;
  }
  const result = spawnSync('npm', ['run', 'build:html'], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    stepLog(`renderProposalAndDeck: Eleventy build failed — ${(result.stderr || '').slice(0, 300)}`, 'WARN');
    return null;
  }
  const copies = [
    [path.join('intake', `proposal-${slug}.html`),           path.join(intakeDir, 'client', `proposal-${slug}.html`)],
    [path.join('internal', `integration-deck-${slug}.html`), path.join(intakeDir, 'client', `integration-deck-${slug}.html`)],
  ];
  const out = [];
  for (const [buildRel, dst] of copies) {
    const src = path.join(ROOT, 'portal', '_build', buildRel);
    if (!fs.existsSync(src)) { stepLog(`renderProposalAndDeck: missing ${buildRel}`, 'WARN'); continue; }
    fs.copyFileSync(src, dst);
    logFileInfo(dst, path.basename(dst));
    out.push(dst);
  }
  return out.length ? out : null;
}

// ─── Apply Mira Rewrites (post-Mira) ─────────────────────────────────────────
// Reads mira.json.rewrittenContent → writes any non-null content JSONs → Eleventy → copies HTML.

function applyMiraRewrites(slug) {
  const projectDir = path.join(PROJECTS_DIR, slug);
  const miraData   = readJson(path.join(projectDir, 'scoping', 'run', 'mira.json')) || {};
  const rewrites   = miraData.rewrittenContent || {};
  const intakeDir  = path.join(projectDir, 'intake');
  const BUILD      = path.join(ROOT, 'portal', '_build');
  const fileMap = {
    intake:          { content: 'intake-content.json',           buildSrc: path.join('intake',    `intake-questionnaire-${slug}.html`) },
    proposal:        { content: 'proposal-content.json',         buildSrc: path.join('intake',    `proposal-${slug}.html`) },
    integrationDeck: { content: 'integration-deck-content.json', buildSrc: path.join('internal',  `integration-deck-${slug}.html`) },
    corporateBrief:  { content: 'corporate-brief-content.json',  buildSrc: path.join('intake',    `corporate-brief-${slug}.html`) },
  };
  let anyWritten = false;
  const toRender = [];
  for (const [key, { content, buildSrc }] of Object.entries(fileMap)) {
    if (!rewrites[key]) continue;
    writeJson(path.join(intakeDir, content), rewrites[key]);
    logFileInfo(path.join(intakeDir, content), content);
    toRender.push(buildSrc);
    anyWritten = true;
  }
  if (!anyWritten) {
    stepLog('applyMiraRewrites: no rewrittenContent in mira.json — no re-render needed', 'DATA');
    return null;
  }
  const result = spawnSync('npm', ['run', 'build:html'], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    stepLog(`applyMiraRewrites: Eleventy build failed — ${(result.stderr || '').slice(0, 300)}`, 'WARN');
    return null;
  }
  for (const buildRel of toRender) {
    const src = path.join(BUILD, buildRel);
    const dst = path.join(intakeDir, 'client', path.basename(buildRel));
    if (!fs.existsSync(src)) { stepLog(`applyMiraRewrites: missing ${buildRel}`, 'WARN'); continue; }
    fs.copyFileSync(src, dst);
    logFileInfo(dst, path.basename(dst));
  }
  return toRender;
}

// ─── Firebase Deploy (post-Mira) ─────────────────────────────────────────────
// Runs after Mira has audited all client-facing documents.
// Delegates entirely to update-firebase.js — the single canonical sync script —
// which handles: HTML upload, pitchKits Firestore seeding, manifest rebuild,
// portal rebuild, git commit, and hosting deploy.

function deployFirebase(slug) {
  const { execSync } = require('child_process');

  logSection('FIREBASE DEPLOY');
  stepLog('deployFirebase: checking credentials', 'START');

  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(ROOT, 'dataskateclients-firebase-adminsdk-fbsvc-6d3f67e197.json');

  const hasEnvKey  = !!process.env.FIREBASE_SA_KEY;
  const hasFileKey = fs.existsSync(saPath);
  stepLog(`deployFirebase: GOOGLE_APPLICATION_CREDENTIALS=${saPath}  fileExists=${hasFileKey}  FIREBASE_SA_KEY env=${hasEnvKey}`, 'DATA');

  if (!hasFileKey && !hasEnvKey) {
    stepLog('deployFirebase: no credentials — deploy skipped', 'WARN');
    console.log(`  ${yellow('⚠')}  No Firebase credentials found — skipping deploy.`);
    console.log(`  ${dim('Run manually: node pipeline/scripts/update-firebase.js ' + slug)}`);
    return { ok: false, reason: 'no-credentials' };
  }

  const cmd = `node pipeline/scripts/update-firebase.js ${slug}`;
  stepLog(`deployFirebase: running: ${cmd}`, 'DATA');

  // stdio: pipe stdout+stderr so we capture the actual failure reason into the
  // per-client log instead of losing it to the terminal (as happened before, when
  // stdio:'inherit' meant we only saw Node's generic "Command failed: ..." in catch).
  // After completion, the full captured output is appended to the log file; on failure,
  // the tail is also surfaced to the user's terminal so the root cause is visible.
  try {
    const stdout = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,  // 32 MB — firebase deploy can be noisy
    });
    if (_logFile && stdout) {
      try { fs.appendFileSync(_logFile, `\n[update-firebase.js stdout]\n${stdout}\n`); } catch { /* non-fatal */ }
    }
    // Mirror the tail to the terminal so the user gets some feedback without seeing every line
    const tail = stdout.trim().split('\n').slice(-8).filter(Boolean);
    if (tail.length) tail.forEach(l => console.log(dim('  | ' + l)));
    stepLog('deployFirebase: success — HTML uploaded, Firestore seeded, manifest rebuilt, deployed', 'END');
    console.log(`  ${green('✓')} Firebase sync complete (HTML uploaded, Firestore seeded, manifest rebuilt, deployed)`);
    return { ok: true, stdout };
  } catch (e) {
    const stdout   = (e.stdout && e.stdout.toString()) || '';
    const stderr   = (e.stderr && e.stderr.toString()) || '';
    const exitCode = e.status != null ? e.status : -1;

    if (_logFile) {
      try {
        fs.appendFileSync(_logFile,
          `\n[update-firebase.js exit=${exitCode}]\n` +
          `--- stdout ---\n${stdout}\n` +
          `--- stderr ---\n${stderr}\n`);
      } catch { /* non-fatal */ }
    }
    stepLog(`deployFirebase: FAILED — exit ${exitCode}`, 'ERROR', { exitCode });
    if (stderr.trim()) {
      stepLog(`update-firebase.js stderr (tail): ${stderr.trim().slice(-1000)}`, 'ERROR');
    }

    // Surface the actual error to the terminal so the user sees the root cause immediately.
    console.log('');
    console.log(`  ${red('✗')}  update-firebase.js failed (exit ${exitCode})`);
    const combined = (stdout + '\n' + stderr).split('\n').filter(Boolean);
    const tail     = combined.slice(-15);
    if (tail.length) {
      console.log(red('  ── update-firebase.js output (last 15 lines) ──'));
      tail.forEach(line => console.log(red('  | ') + line));
    }
    console.log(`  ${dim('Full output saved to: ' + (_logFile || 'logs/scout-pipeline/' + slug + '.log'))}`);
    console.log(`  ${dim('Retry with: node pipeline/scripts/update-firebase.js ' + slug)}`);
    return { ok: false, exitCode, stdout, stderr, reason: 'exit-nonzero' };
  }
}

// ─── Source File Archival ─────────────────────────────────────────────────────
// Runs once at the end of the full pipeline, after all agents complete.
// Independent of Firebase hosting — archives regardless of deploy status.

function archiveScopingFiles(slug) {
  const { execSync } = require('child_process');
  logSection('SOURCE FILE ARCHIVAL');
  stepLog('archiveScopingFiles: checking scoping/ directory', 'START');
  const scopingDir = path.join(PROJECTS_DIR, slug, 'scoping');
  const scopingFiles = fs.existsSync(scopingDir)
    ? fs.readdirSync(scopingDir).filter(f => f !== '.gitkeep')
    : [];
  if (scopingFiles.length === 0) {
    stepLog('archiveScopingFiles: scoping/ is empty — nothing to archive', 'DATA');
    console.log(`  ${dim('scoping/ already empty — nothing to archive')}`);
    return;
  }
  stepLog(`archiveScopingFiles: ${scopingFiles.length} file(s) to archive: ${scopingFiles.join(', ')}`, 'DATA');
  console.log('  Archiving scoping source files to Firebase Storage...');
  try {
    execSync(`node pipeline/scripts/move-sources.js ${slug}`, { cwd: ROOT, stdio: 'inherit' });
    stepLog('archiveScopingFiles: archive complete', 'END');
    console.log(`  ${green('✓')} Source files archived`);
  } catch (e) {
    stepLog(`archiveScopingFiles: FAILED — ${e.message}`, 'ERROR');
    console.log(`  ${yellow('⚠')}  move-sources.js failed — run manually: node pipeline/scripts/move-sources.js ${slug}`);
  }
}

// ─── Agent Gate Display ───────────────────────────────────────────────────────

function resolvedAgentToml(agent, slug) {
  const src    = path.join(ROOT, agent.toml);
  const outDir = path.join(PROJECTS_DIR, slug, 'scoping', 'run');
  const outPath = path.join(outDir, `${agent.slug}.toml`);
  fs.mkdirSync(outDir, { recursive: true });
  const raw = fs.readFileSync(src, 'utf8');
  const resolved = raw.replace(/\{client\}/g, slug);
  fs.writeFileSync(outPath, resolved);
  return path.relative(ROOT, outPath);  // e.g. projects/pacific-title-company/scoping/run/vera.toml
}

function printAgentBanner(agent, slug, resolvedToml, totalAgents) {
  console.log('\n' + bold('━'.repeat(60)));
  console.log(bold(`  NEXT: ${agent.name} — ${agent.role}  [${agent.position}/${totalAgents}]`));
  console.log(bold('━'.repeat(60)));
  console.log(`  Mode:    ${agent.mode === 'gated' ? yellow('GATED (confirm numbers)') : cyan('CONVERSATIONAL (Q&A loop)')}`);
  console.log(`  Model:   ${agent.model}`);
  console.log(`  Client:  ${slug}`);
  if (!pipelineMode) {
    console.log(`  ${dim('Claude launching below — type /exit when done')}`);
  }
  console.log();
}

// ─── Main Pipeline Loop ───────────────────────────────────────────────────────

async function runPipeline(slug) {
  // onboard() already called setLogFile if it ran; call again for resume paths (no-op if already set)
  if (!_logFile) setLogFile(slug);
  const pipeline    = readJson(PIPELINE_JSON);
  const agents      = pipeline.agents;
  const state       = readState(slug);
  const projectDir  = path.join(PROJECTS_DIR, slug);
  const projectJson = readJson(path.join(projectDir, 'project.json'));

  const totalAgents = agents.length;
  logSection('PIPELINE START');
  stepLog(`PIPELINE START — ${projectJson.displayName} (${slug}) — ${totalAgents} agents`, 'START');
  logObj('pipeline.project', {
    displayName:    projectJson.displayName,
    slug,
    architect:      projectJson.architect,
    architectEmail: projectJson.architectEmail,
    engagementType: projectJson.engagementType,
    targetGoLive:   projectJson.targetGoLive,
    createdAt:      projectJson.createdAt,
    completedSoFar: state.completed,
    pipelineMode,
    deltaMode,
  });

  console.log('\n' + bold('━'.repeat(60)));
  console.log(bold(`  DSPipeline — ${projectJson.displayName}`));
  console.log(`  ${dim('Architect: ')}${projectJson.architect}`);
  console.log(`  ${dim('Slug: ')}projects/${slug}/`);
  if (state.completed.length > 0) {
    console.log(`  ${dim('Completed: ')}${state.completed.join(', ')}`);
  }
  console.log(bold('━'.repeat(60)));

  // Retry deploy if Mira already completed but a prior deploy failed (or was never tracked).
  // Avoids re-running Mira ($28+ in tokens) when the only thing that needs to happen is
  // re-invoking update-firebase.js. Triggers for legacy projects whose pipeline ran before
  // deployStatus tracking existed — first retry is harmless (idempotent) and sets the flag.
  if (state.completed.includes('mira') && state.deployStatus !== 'success') {
    logSection('RETRY FIREBASE DEPLOY');
    const reason = state.deployStatus === 'failed'
      ? `prior deploy failed: ${state.deployError || '(no details)'}`
      : `deployStatus not tracked (legacy run)`;
    stepLog(`Mira already complete — retrying deploy without re-running agent (${reason})`, 'START');
    console.log('\n' + bold('━'.repeat(60)));
    console.log(bold(`  Retrying Firebase deploy for ${projectJson.displayName}`));
    console.log(`  ${dim(reason)}`);
    console.log(bold('━'.repeat(60)));

    const retryResult = deployFirebase(slug);
    const updated    = readState(slug);
    updated.deployStatus      = retryResult.ok ? 'success' : 'failed';
    updated.deployAttemptedAt = isoNow();
    if (retryResult.ok) {
      delete updated.deployError;
    } else {
      const errTail = ((retryResult.stderr || retryResult.stdout || '').trim().split('\n').slice(-5).join('\n'));
      updated.deployError = errTail || retryResult.reason || 'unknown';
    }
    writeState(slug, updated);

    if (!retryResult.ok) {
      console.log('\n' + bold(red('═'.repeat(60))));
      console.log(bold(red('  DEPLOY STILL FAILING — see log for details')));
      console.log(bold(red('═'.repeat(60))));
      console.log(`  ${dim('Log: ' + (_logFile || 'logs/scout-pipeline/' + slug + '.log'))}`);
      process.exit(1);
    }
    console.log(`\n  ${green('✓')} Deploy retry succeeded — pipeline now fully published.\n`);
    return;
  }

  for (const agent of agents) {
    if (state.completed.includes(agent.slug)) {
      console.log(`  ${green('✓')} ${agent.name} — ${dim('already complete')}`);
      stepLog(`STEP ${agent.position}/${totalAgents}: ${agent.name} (${agent.slug}) — skipped (already complete)`);
      continue;
    }

    // Skip parked agents
    if (agent.status === 'parked') {
      stepLog(`STEP ${agent.position}/${totalAgents}: ${agent.name} (${agent.slug}) — skipped (parked)`, 'DATA');
      continue;
    }

    logSection(`AGENT ${agent.position}/${totalAgents}: ${agent.name.toUpperCase()} (${agent.slug})`);
    stepLog(`STEP ${agent.position}/${totalAgents}: ${agent.name} (${agent.slug}) — STARTED`, 'START', {
      role:       agent.role,
      model:      agent.model,
      mode:       agent.mode,
      toml:       agent.toml,
      outputFile: agent.outputFile,
    });

    const resolvedToml = resolvedAgentToml(agent, slug);
    const activeAgentCount = agents.filter(a => a.status !== 'parked').length;
    printAgentBanner(agent, slug, resolvedToml, activeAgentCount);

    const startMs = Date.now();

    const outputPath = path.join(projectDir, agent.outputFile);

    if (pipelineMode) {
      // Run the agent interactively so output streams live to the terminal.
      // --dangerously-skip-permissions auto-approves all tool calls (file I/O, web search)
      // so the agent runs without stopping for approval. spawnSync blocks until the user
      // types /exit, then the orchestrator checks for the output file and continues.
      const tomlContent = fs.readFileSync(path.join(ROOT, resolvedToml), 'utf8');
      console.log(`\n  ${cyan('▶')} Running ${bold(agent.name)} — type ${bold('/exit')} when done\n`);
      stepLog(`Running ${agent.name} interactively`, 'START');

      const result = spawnSync(
        CLAUDE_BIN,
        ['--dangerously-skip-permissions', '--system-prompt', tomlContent,
         'Execute your complete workflow now. Follow every step in the workflow section, then type /exit when finished.'],
        { stdio: 'inherit', cwd: ROOT }
      );

      if (result.error) {
        stepLog(`${agent.name} error: ${result.error.message}`, 'ERROR');
        console.log(`\n  ${red('✗')}  ${agent.name} failed: ${result.error.message}`);
        process.exit(1);
      }
      stepLog(`${agent.name} exited (status ${result.status})`, 'DATA');
    } else {
      // Interactive mode: user runs the agent manually and presses Enter when done
      const ans = await prompt('  Press Enter when complete (or type "skip" to mark done, "quit" to stop): ');
      stepLog(`User response after ${agent.name}: "${ans || '<Enter>'}"`, 'DATA');
      if (ans.toLowerCase() === 'quit') {
        stepLog(`PIPELINE PAUSED by user after ${agent.name} (${agent.slug})`, 'WARN');
        console.log(`\n  ${yellow('Paused.')} Run again with --client ${slug} to resume.`);
        process.exit(0);
      }
    }

    // Verify output file exists
    logSection(`OUTPUT VALIDATION — ${agent.name}`);
    if (!fs.existsSync(outputPath)) {
      stepLog(`OUTPUT MISSING: ${agent.outputFile} not found after ${agent.name} completed`, 'WARN');
      if (!pipelineMode) {
        // Interactive mode: ask user whether to retry or force-complete
        const force = await confirm(
          `  ${yellow('⚠')}  Output file not found: ${agent.outputFile}. Mark as complete anyway?`,
          false
        );
        if (!force) {
          stepLog(`Retrying ${agent.name} — user declined to force-complete`, 'WARN');
          console.log(`  ${yellow('Retrying...')} Complete ${agent.name} and press Enter again.`);
          agents.splice(agents.indexOf(agent), 0, agent);
          continue;
        }
      }
      stepLog(`Force-completing ${agent.name} without output file`, 'WARN');
    } else {
      logFileInfo(outputPath, agent.outputFile);
      const output = readJson(outputPath);
      if (output) {
        const statusField = output.status || '(no status field)';
        stepLog(`${agent.outputFile}: status="${statusField}"`, 'DATA');
        if (output.status !== 'complete') {
          stepLog(`${agent.outputFile}: status is not "complete" — review agent output`, 'WARN');
          console.log(`  ${yellow('⚠')}  ${agent.outputFile} has status="${output.status}" — check agent output.`);
        }
        // Log top-level keys and array lengths for easy scanning
        const summary = Object.fromEntries(
          Object.entries(output).map(([k, v]) =>
            [k, Array.isArray(v) ? `[array len=${v.length}]` : typeof v === 'object' && v ? '{object}' : v]
          )
        );
        logObj(`${agent.slug}.json summary`, summary);
      }
    }

    // Verify additional required deliverables (e.g. intake-content.json for Quinn)
    if (Array.isArray(agent.additionalOutputs)) {
      const resolved = agent.additionalOutputs.map(p => p.replace('{slug}', slug));
      stepLog(`Checking ${resolved.length} additional output(s): ${resolved.join(', ')}`, 'DATA');
      const missing = resolved.filter(p => !fs.existsSync(path.join(projectDir, p)));
      if (missing.length > 0) {
        stepLog(`ADDITIONAL OUTPUTS MISSING: ${missing.join(', ')}`, 'WARN');
        console.log(`\n  ${yellow('⚠')}  ${agent.name} is missing required deliverables:`);
        missing.forEach(p => console.log(`       ${yellow('✗')}  ${p}`));
        const force = await confirm(
          `  These files were not created. ${agent.name} is incomplete — mark done anyway?`,
          false
        );
        if (!force) {
          stepLog(`Retrying ${agent.name} — missing additional outputs, user declined force`, 'WARN');
          console.log(`  ${yellow('Retrying...')} Complete all deliverables and press Enter again.`);
          agents.splice(agents.indexOf(agent), 0, agent);
          continue;
        }
        stepLog(`Force-completing ${agent.name} despite missing additional outputs (user confirmed)`, 'WARN');
      } else {
        resolved.forEach(p => logFileInfo(path.join(projectDir, p), p));
      }
    }

    const durationMs = Date.now() - startMs;

    // Auto-read token usage from the Claude session JSONL written during this agent run
    logSection(`TOKEN USAGE — ${agent.name}`);
    let tokens = { model: agent.model };
    const usage = readSessionTokens(startMs);
    if (usage && (usage.inp + usage.out) > 0) {
      const { inp, cacheCreate, cacheRead, out } = usage;
      const billableIn = inp + cacheCreate + Math.round(cacheRead * 0.1); // cache reads are ~10% cost
      tokens = { model: agent.model, input: billableIn, output: out, cost: calcCost(agent.model, billableIn, out) };
      const cacheNote = cacheRead > 0 ? ` | cache read: ${cacheRead.toLocaleString()}` : '';
      stepLog(`Tokens: ${billableIn.toLocaleString()} in (${inp.toLocaleString()} fresh + ${cacheCreate.toLocaleString()} write${cacheNote}) / ${out.toLocaleString()} out — cost ≈ $${tokens.cost}`, 'DATA', {
        model: agent.model, inputFresh: inp, cacheCreate, cacheRead, billableIn, output: out, cost: tokens.cost,
      });
      console.log(`  ${dim(`Tokens: ${billableIn.toLocaleString()} in (${inp.toLocaleString()} fresh + ${cacheCreate.toLocaleString()} write${cacheNote}) / ${out.toLocaleString()} out — cost ≈ $${tokens.cost}`)}`);
    } else {
      stepLog('Token usage: not captured (agent ran before this session started — check JSONL files)', 'WARN');
      console.log(`  ${dim('Token usage: not captured (agent may have run before this session started)')}`);
    }

    // Post-agent: assemble company_context.json + rebuild decisions.json
    logSection(`POST-STEP — ${agent.name}`);
    stepLog(`POST-STEP: assembleContext for ${agent.slug}`, 'START');
    assembleContext(slug, agent.slug);
    stepLog('assembleContext done', 'END');
    console.log(`  ${green('✓')} company_context.json updated`);
    stepLog('POST-STEP: aggregateDecisions', 'START');
    aggregateDecisions(slug);
    stepLog('aggregateDecisions done', 'END');

    // Post-Sage: move binary source files from _inbox/ to scoping/ for archival
    // (Sage is done reading — safe to land originals alongside the .txt companions)
    if (agent.slug === 'sage') {
      const remaining = fs.existsSync(INBOX_DIR)
        ? fs.readdirSync(INBOX_DIR).filter(f => f !== '.gitkeep' && !f.startsWith('.'))
        : [];
      if (remaining.length > 0) {
        stepLog(`POST-SAGE: moving ${remaining.length} binary file(s) from _inbox/ to scoping/: ${remaining.join(', ')}`, 'START');
        const scopingDir = path.join(projectDir, 'scoping');
        for (const file of remaining) {
          fs.renameSync(path.join(INBOX_DIR, file), path.join(scopingDir, file));
          stepLog(`  MOVE _inbox/${file} → scoping/${file}`, 'DATA');
        }
        console.log(`  ${green('✓')} Moved ${remaining.length} source binary file(s) from _inbox/ to scoping/ (archival)`);
        stepLog(`POST-SAGE: all ${remaining.length} binary file(s) moved`, 'END');
      } else {
        stepLog('POST-SAGE: no binary files in _inbox/ to move', 'DATA');
      }
    }

    // Post-Vera: write initial client-registry entry + promote library contributions
    if (agent.slug === 'vera') {
      // Per the agent-boundary rule, Vera writes her sibling/portfolio research
      // into vera.json.corporateStackEnrichment — NOT directly into
      // company_context.json. The orchestrator owns that merge, so the file
      // remains the single source of truth before any downstream agent reads
      // it (Hawk, Petra, Mira) or any derivative renders (corporate brief,
      // proposal portfolioContext, integration-deck portfolio block).
      stepLog('POST-VERA: merging corporateStackEnrichment into company_context.json', 'START');
      try {
        mergeVeraCorporateStackEnrichment(slug);
        stepLog('POST-VERA: corporate stack merge done', 'END');
      } catch (e) {
        stepLog(`POST-VERA: corporate stack merge FAILED — ${e.message}`, 'WARN');
        console.log(`  ${yellow('⚠')}  Corporate stack merge failed — siblings/sponsor portfolio may be stale in company_context.json`);
      }

      stepLog('POST-VERA: writing client-registry entry', 'START');
      writeClientRegistry(slug);
      console.log(`  ${green('✓')} projects/client-registry.json — initial entry written (status: scoping)`);
      stepLog('POST-VERA: client-registry written', 'END');

      // Generate the pre-call corporate brief immediately so the architect can
      // email it 48h before the deep-dive without waiting on the full Petra /
      // Quinn deliverable set. Skips silently if Vera couldn't surface a
      // corporate stack (independent / family-owned clients).
      stepLog('POST-VERA: rendering corporate-brief', 'START');
      try {
        const briefHtml = renderCorporateBrief(slug);
        if (briefHtml) {
          console.log(`  ${green('✓')} projects/${slug}/intake/client/corporate-brief-${slug}.html — generated`);
        } else {
          console.log(`  ${dim('↳ corporate brief skipped — no corporate stack in company_context.json')}`);
        }
        stepLog('POST-VERA: corporate-brief done', 'END');
      } catch (e) {
        stepLog(`POST-VERA: corporate-brief FAILED — ${e.message}`, 'WARN');
        console.log(`  ${yellow('⚠')}  Corporate brief render failed — re-run manually: npm run build:html (then copy _build/intake/corporate-brief-${slug}.html → projects/${slug}/intake/client/)`);
      }

      stepLog('POST-VERA: running promote-library.js', 'START');
      try {
        require('child_process').execSync(`node pipeline/promote-library.js --client ${slug}`, { cwd: ROOT, stdio: 'inherit' });
        console.log(`  ${green('✓')} Library contributions promoted to mulesoft/playbooks/usecases/`);
        stepLog('POST-VERA: promote-library done', 'END');
      } catch (e) {
        stepLog(`POST-VERA: promote-library FAILED — ${e.message}`, 'WARN');
        console.log(`  ${yellow('⚠')}  promote-library.js failed — run manually: node pipeline/promote-library.js --client ${slug}`);
      }
    }

    // Post-Rex: rebuild connector index (Rex may have added/updated registry stubs)
    if (agent.slug === 'rex') {
      stepLog('POST-REX: rebuilding connector index (build-connector-index.js)', 'START');
      try {
        require('child_process').execSync('node mulesoft/build-connector-index.js', { cwd: ROOT, stdio: 'inherit' });
        console.log(`  ${green('✓')} connector-names.json + connector-index.json rebuilt`);
        stepLog('POST-REX: connector index rebuilt', 'END');
      } catch (e) {
        stepLog(`POST-REX: build-connector-index FAILED — ${e.message}`, 'WARN');
        console.log(`  ${yellow('⚠')}  build-connector-index.js failed — run manually`);
      }
    }

    // Post-Flo: write flowCount + pricingComputed to project.json, aggregate decisions, write registry
    if (agent.slug === 'flo') {
      stepLog('POST-FLO: updating project.json with pricing', 'START');
      const floData = readJson(path.join(projectDir, 'scoping', 'run', 'flo.json')) || {};
      if (floData.pricing) {
        stepLog(`POST-FLO: pricing — flowCount=${floData.pricing.flowCount}, period1Rate=${floData.pricing.period1RatePerFlow}`, 'DATA');
        logObj('flo.pricing', floData.pricing);
        mergeJson(path.join(projectDir, 'project.json'), {
          flowCount:       floData.pricing.flowCount,
          pricingComputed: floData.pricing,
        });
        console.log(`  ${green('✓')} project.json updated (flowCount, pricingComputed)`);
        stepLog('POST-FLO: project.json pricing updated', 'END');
      } else {
        stepLog('POST-FLO: flo.json has no pricing block — skipping project.json update', 'WARN');
      }

      stepLog('POST-FLO: aggregating decisions', 'START');
      aggregateDecisions(slug);
      console.log(`  ${green('✓')} decisions.json aggregated`);
      stepLog('POST-FLO: decisions aggregated', 'END');

      stepLog('POST-FLO: updating client-registry', 'START');
      writeClientRegistry(slug);
      console.log(`  ${green('✓')} projects/client-registry.json updated`);
      stepLog('POST-FLO: client-registry updated', 'END');

      stepLog('POST-FLO: assembling diagram-content.json (scoping)', 'START');
      try {
        assembleDiagramContent(slug, ['scoping']);
        const ok = runDiagramRenderer(slug);
        if (ok) {
          console.log(`  ${green('✓')} Scoping diagrams rendered → projects/${slug}/intake/diagrams/`);
          // Write system-flow.svg into company_context.json so integration-deck can inline it
          const svgPath = path.join(ROOT, 'projects', slug, 'intake', 'diagrams', 'system-flow.svg');
          if (fs.existsSync(svgPath)) {
            const ctxPath = path.join(ROOT, 'projects', slug, 'company_context.json');
            const ctx = readJson(ctxPath) || {};
            ctx.systemDiagram = { svg: fs.readFileSync(svgPath, 'utf8') };
            writeJson(ctxPath, ctx);
            stepLog('POST-FLO: systemDiagram.svg written to company_context.json', 'DATA');
          }
        } else {
          console.log(`  ${yellow('⚠')}  Diagram render failed — mmdc may not be installed (npm install --save-dev @mermaid-js/mermaid-cli)`);
        }
        stepLog('POST-FLO: diagram assembly done', 'END');
      } catch (e) {
        stepLog(`POST-FLO: diagram assembly FAILED — ${e.message}`, 'WARN');
        console.log(`  ${yellow('⚠')}  Diagram assembly failed — run manually: node pipeline/scripts/generate-diagram.js ${slug}`);
      }
    }

    // Post-Quinn: extract intakeContent → write intake-content.json → build → copy HTML
    if (agent.slug === 'quinn') {
      stepLog('POST-QUINN: rendering intake HTML', 'START');
      try {
        const intakeHtml = renderIntake(slug);
        if (intakeHtml) console.log(`  ${green('✓')} projects/${slug}/intake/client/intake-questionnaire-${slug}.html — rendered`);
        stepLog('POST-QUINN: intake render done', 'END');
      } catch (e) {
        stepLog(`POST-QUINN: renderIntake FAILED — ${e.message}`, 'WARN');
        console.log(`  ${yellow('⚠')}  renderIntake failed — run manually: node -e "require('./pipeline/scout/orchestrate.js')" (or check logs)`);
      }
    }

    // Post-Petra: extract proposalContent + integrationDeckContent → build → copy HTML
    if (agent.slug === 'petra') {
      stepLog('POST-PETRA: rendering proposal + integration deck HTML', 'START');
      try {
        const rendered = renderProposalAndDeck(slug);
        if (rendered) console.log(`  ${green('✓')} proposal + integration deck HTML rendered (${rendered.length} files)`);
        stepLog('POST-PETRA: proposal/deck render done', 'END');
      } catch (e) {
        stepLog(`POST-PETRA: renderProposalAndDeck FAILED — ${e.message}`, 'WARN');
        console.log(`  ${yellow('⚠')}  renderProposalAndDeck failed — check logs`);
      }

      stepLog('POST-PETRA: assembling diagram-content.json (scoping + sow)', 'START');
      try {
        assembleDiagramContent(slug, ['scoping', 'sow']);
        const ok = runDiagramRenderer(slug);
        if (ok) console.log(`  ${green('✓')} SOW diagrams rendered → projects/${slug}/intake/diagrams/`);
        else     console.log(`  ${yellow('⚠')}  SOW diagram render failed — mmdc may not be installed`);
        stepLog('POST-PETRA: SOW diagram assembly done', 'END');
      } catch (e) {
        stepLog(`POST-PETRA: SOW diagram assembly FAILED — ${e.message}`, 'WARN');
        console.log(`  ${yellow('⚠')}  SOW diagram assembly failed — run manually: node pipeline/scripts/generate-diagram.js ${slug}`);
      }
    }

    // Post-Mira: apply rewrites → re-render → deploy to Firebase
    if (agent.slug === 'mira') {
      stepLog('POST-MIRA: applying Mira rewrites', 'START');
      try {
        const applied = applyMiraRewrites(slug);
        if (applied) console.log(`  ${green('✓')} Mira rewrites applied + HTML re-rendered (${applied.length} file(s))`);
        else console.log(`  ${dim('↳ no rewrites to apply')}`);
        stepLog('POST-MIRA: Mira rewrites done', 'END');
      } catch (e) {
        stepLog(`POST-MIRA: applyMiraRewrites FAILED — ${e.message}`, 'WARN');
        console.log(`  ${yellow('⚠')}  applyMiraRewrites failed — check logs`);
      }
    }

    // Post-Mira: deploy to Firebase (all docs audited — safe to publish)
    if (agent.slug === 'mira') {
      stepLog('POST-MIRA: deploying to Firebase', 'START');
      const deployResult = deployFirebase(slug);
      stepLog('POST-MIRA: Firebase deploy step done', 'END');

      // Persist deploy outcome in pipeline-state.json. Mira is still marked complete
      // (her audit work is done — don't waste $28 in tokens re-running her), but if
      // deploy failed we record it so a subsequent orchestrate run retries only the
      // deploy step. See the retry block at the top of runPipeline().
      const postMiraState = readState(slug);
      postMiraState.deployStatus      = deployResult.ok ? 'success' : 'failed';
      postMiraState.deployAttemptedAt = isoNow();
      if (deployResult.ok) {
        delete postMiraState.deployError;
      } else {
        const errTail = ((deployResult.stderr || deployResult.stdout || '').trim().split('\n').slice(-5).join('\n'));
        postMiraState.deployError = errTail || deployResult.reason || 'unknown';
      }
      writeState(slug, postMiraState);
    }

    // Mark complete in state
    markComplete(slug, agent.slug, durationMs, tokens);
    const durationSec = (durationMs / 1000).toFixed(0);
    stepLog(`STEP ${agent.position}/${totalAgents}: ${agent.name} (${agent.slug}) — COMPLETE`, 'END', {
      durationSec: Number(durationSec),
      durationMs,
      model:  tokens.model,
      cost:   tokens.cost || null,
      input:  tokens.input || null,
      output: tokens.output || null,
    });
    console.log(`  ${green('✓')} ${agent.name} marked complete (${durationSec}s)`);

    // Gate: show checkpoint message and confirm before launching the next agent
    if (!pipelineMode) {
      const nextActive = agents.slice(agents.indexOf(agent) + 1).find(a => a.status !== 'parked');
      if (nextActive) {
        const gateMsg = agent.gatePrompt || `Proceed to ${nextActive.name}?`;
        const proceed = await confirm(`\n  ${bold(gateMsg)}`);
        if (!proceed) {
          stepLog(`PIPELINE PAUSED by user after ${agent.name} gate`, 'WARN');
          console.log(`\n  ${yellow('Paused.')} Run again with --client ${slug} to resume.`);
          process.exit(0);
        }
      }
    }
  }

  // Pipeline complete — archive scoping files now that all agents are done
  logSection('PIPELINE COMPLETE — POST-PROCESSING');
  stepLog('POST-PIPELINE: archiving scoping files', 'START');
  archiveScopingFiles(slug);
  stepLog('POST-PIPELINE: scoping files archived', 'END');

  // Check deploy status for the final banner — Mira can complete successfully but
  // a transient deploy failure should be loudly visible at the end (and exit non-zero
  // so any caller / CI wrapper sees the failure).
  const finalState   = readState(slug);
  const deployFailed = finalState.completed.includes('mira') && finalState.deployStatus && finalState.deployStatus !== 'success';

  stepLog(`PIPELINE END — ${projectJson.displayName} (${slug}) — deployStatus=${finalState.deployStatus || 'n/a'}`, deployFailed ? 'WARN' : 'END');
  console.log('\n' + (deployFailed ? bold(red('═'.repeat(60))) : bold('═'.repeat(60))));
  console.log(deployFailed ? bold(red('  PIPELINE COMPLETE — DEPLOY FAILED')) : bold('  PIPELINE COMPLETE'));
  console.log(deployFailed ? bold(red('═'.repeat(60))) : bold('═'.repeat(60)));

  const project = readJson(path.join(projectDir, 'project.json'));
  console.log(`
  ${bold('Client deliverables:')}
    Proposal:         projects/${slug}/intake/client/proposal-${slug}.html
    Intake form:      projects/${slug}/intake/client/intake-questionnaire-${slug}.html
    Integration deck: projects/${slug}/intake/client/integration-deck-${slug}.html

  ${bold('Live URLs:')}
    Intake:    ${project.intakeUrl   || dim('(not deployed yet)')}
    Proposal:  ${project.proposalUrl || dim('(not deployed yet)')}
    Pitch kit: ${project.pitchKitUrl || dim('(not deployed yet)')}

  ${bold('Internal:')}
    Run files: projects/${slug}/scoping/run/
    Context:   projects/${slug}/company_context.json
    Decisions: projects/${slug}/decisions.json
  `);

  if (deployFailed) {
    console.log(red(`  ⚠  Mira ran successfully, but Firebase deploy FAILED — client docs are NOT published.`));
    console.log(red(`     deployError: ${finalState.deployError || '(no captured stderr — see log)'}`));
    console.log(`  ${bold('Fix and retry:')}`);
    console.log(`    ${green('node pipeline/scripts/update-firebase.js ' + slug)}`);
    console.log(`  ${dim('  …or re-run orchestrate.js --client ' + slug + ' to auto-retry deploy.')}`);
    console.log(`  ${dim('Log: ' + (_logFile || 'logs/scout-pipeline/' + slug + '.log'))}\n`);
    process.exit(1);
  }
}

// ─── Delta Pipeline (scope amendment) ────────────────────────────────────────
// Runs Sage → Flo → Quinn → Petra → Mira on a new recording.
// Preserves lockedPricing, answered intake questions, and existing proposal flows.

async function runDeltaPipeline(slug, recordingFile) {
  setLogFile(slug);
  const projectDir = path.join(PROJECTS_DIR, slug);
  const project    = readJson(path.join(projectDir, 'project.json')) || {};
  const amendments = project.amendments || [];
  const amdNum     = String(amendments.length + 1).padStart(3, '0');
  const amdId      = `AMD-${amdNum}`;

  stepLog(`DELTA PIPELINE START — ${project.displayName || slug} — ${amdId}`, 'START');
  console.log('\n' + bold('━'.repeat(60)));
  console.log(bold(`  DSPipeline DELTA — ${project.displayName || slug} — ${amdId}`));
  if (project.lockedPricing) {
    console.log(`  ${dim('Locked rate:')} $${project.lockedPricing.ratePerFlowPerMonth}/flow/month`);
  } else {
    console.log(`  ${yellow('⚠')}  No lockedPricing — Flo will recalculate. Run --check-acceptance first if client has accepted.`);
  }
  console.log(bold('━'.repeat(60)));

  // Copy recording to scoping/ if it lives outside the project folder
  const scopingDir   = path.join(projectDir, 'scoping');
  const recordingAbs = path.isAbsolute(recordingFile) ? recordingFile : path.join(ROOT, recordingFile);
  let   recordingDest = recordingAbs;
  if (!recordingAbs.startsWith(scopingDir)) {
    const destName  = `${amdId.toLowerCase()}-${path.basename(recordingAbs)}`;
    recordingDest   = path.join(scopingDir, destName);
    if (!fs.existsSync(recordingDest)) {
      fs.copyFileSync(recordingAbs, recordingDest);
    }
    console.log(`  ${green('✓')} Recording copied → scoping/${path.basename(recordingDest)}`);
  }

  const relRecording = path.relative(ROOT, recordingDest);

  const deltaAgents = [
    { slug: 'sage',  name: 'Sage',  role: 'Document Intelligence', toml: 'pipeline/agents/sage.toml',  outputFile: 'scoping/run/sage.json',  note: `Point Sage at: ${relRecording}` },
    { slug: 'flo',   name: 'Flo',   role: 'Flow Analyst + Pricing', toml: 'pipeline/agents/flo.toml',   outputFile: 'scoping/run/flo.json',   note: 'Flo reads sage.json — will flag new flows vs existing' },
    { slug: 'quinn', name: 'Quinn', role: 'Intake Questionnaire',   toml: 'pipeline/agents/quinn.toml', outputFile: 'scoping/run/quinn.json', note: 'Quinn preserves answered questions; new gaps get [NEW] badge' },
    { slug: 'petra', name: 'Petra', role: 'Proposal Writer',        toml: 'pipeline/agents/petra.toml', outputFile: 'scoping/run/petra.json', note: 'Petra appends [NEW] flows — preserves pricing section' },
    { slug: 'mira',  name: 'Mira',  role: 'Proposal Auditor',       toml: 'pipeline/agents/mira.toml',  outputFile: 'scoping/run/mira.json',  note: 'Final audit before re-deploy' },
  ];

  for (const [di, agent] of deltaAgents.entries()) {
    const stepLabel = `DELTA STEP ${di + 1}/${deltaAgents.length}: ${agent.name}`;
    stepLog(`${stepLabel} (${agent.slug}) — STARTED`, 'START');
    const resolvedToml = resolvedAgentToml(agent, slug);
    const cmd = `claude --dangerously-skip-permissions --system-prompt "$(cat ${resolvedToml})" 'Execute your complete workflow now. Follow every step in the workflow section, then type /exit when finished.'`;
    console.log('\n' + bold('─'.repeat(60)));
    console.log(bold(`  DELTA: ${agent.name} — ${agent.role}`));
    if (agent.note) console.log(`  ${dim(agent.note)}`);
    console.log();
    console.log(`  ${bold('Run in a new terminal:')}`);
    console.log(`  ┌${'─'.repeat(56)}┐`);
    console.log(`  │  ${green(cmd)}${' '.repeat(Math.max(0, 54 - cmd.length))}│`);
    console.log(`  └${'─'.repeat(56)}┘`);

    const startMs = Date.now();
    const ans = await prompt('\n  Press Enter when complete (or "quit" to stop): ');
    if (ans.toLowerCase() === 'quit') {
      stepLog(`${stepLabel} — INTERRUPTED by user`, 'WARN');
      console.log(`\n  ${yellow('Paused.')} Re-run with --client ${slug} --mode delta --recording ${recordingFile}`);
      process.exit(0);
    }

    // Post-Flo: if lockedPricing exists, override Flo's recalculated pricing with locked rate
    if (agent.slug === 'flo' && project.lockedPricing && project.lockedPricing.ratePerFlowPerMonth) {
      const lockedRate = project.lockedPricing.ratePerFlowPerMonth;
      const floPath    = path.join(projectDir, 'scoping', 'run', 'flo.json');
      const floData    = readJson(floPath);
      if (floData && floData.pricing) {
        const n  = Number(floData.pricing.flowCount) || (floData.confirmedFlows || []).length;
        const p1 = lockedRate;
        const p2 = Math.round(p1 * 1.05 * 100) / 100;
        const p3 = Math.round(p2 * 1.05 * 100) / 100;
        const p4 = Math.round(p3 * 1.05 * 100) / 100;
        floData.pricing.period1RatePerFlow          = String(p1);
        floData.pricing.period2RatePerFlow          = String(p2);
        floData.pricing.period3RatePerFlow          = String(p3);
        floData.pricing.period4RatePerFlow          = String(p4);
        floData.pricing.period1Payment6mo           = String(n * p1 * 6);
        floData.pricing.period2Payment6mo           = String(n * p2 * 6);
        floData.pricing.period3Payment6mo           = String(n * p3 * 6);
        floData.pricing.period4Payment6mo           = String(n * p4 * 6);
        floData.pricing.oneYearTotal                = String(n * p1 * 6 + n * p2 * 6);
        floData.pricing.twoYearManagedServiceTotal  = String(n * p1 * 6 + n * p2 * 6 + n * p3 * 6 + n * p4 * 6);
        writeJson(floPath, floData);
        console.log(`  ${green('✓')} flo.json pricing anchored to locked rate $${lockedRate}/flow/month (${n} flows)`);
        mergeJson(path.join(projectDir, 'project.json'), {
          flowCount: floData.pricing.flowCount,
          pricingComputed: floData.pricing,
        });
        aggregateDecisions(slug);
        writeClientRegistry(slug);
        console.log(`  ${green('✓')} decisions.json + client-registry updated`);
      }
    }

    stepLog(`DELTA POST-STEP: assembleContext for ${agent.slug}`, 'START');
    assembleContext(slug, agent.slug);
    stepLog(`DELTA POST-STEP: assembleContext done`, 'END');
    const deltaDurationMs = Date.now() - startMs;
    markComplete(slug, agent.slug, deltaDurationMs);
    stepLog(`DELTA STEP ${di + 1}/${deltaAgents.length}: ${agent.name} (${agent.slug}) — ENDED (${(deltaDurationMs / 1000).toFixed(0)}s)`, 'END');
    console.log(`  ${green('✓')} ${agent.name} delta complete`);
  }

  // Record amendment in project.json
  const newAmendment = {
    id:        amdId,
    date:      today(),
    recording: relRecording,
    trigger:   'scope-expansion',
    note:      `Delta run for ${path.basename(recordingDest)}`,
  };
  mergeJson(path.join(projectDir, 'project.json'), { amendments: [...amendments, newAmendment] });

  stepLog(`DELTA PIPELINE END — ${amdId} complete`, 'END');
  console.log('\n' + bold('═'.repeat(60)));
  console.log(bold(`  DELTA COMPLETE — ${amdId}`));
  console.log(bold('═'.repeat(60)));
  console.log(`\n  Amendment recorded in project.json.`);
  console.log(`  Re-deploy to Firebase to publish updated proposal.\n`);
}

// ─── Check Proposal Acceptance ────────────────────────────────────────────────
// Reads Firestore proposals/{slug} — if accepted, writes lockedPricing to project.json.

async function checkAcceptance(slug) {
  const projectDir  = path.join(PROJECTS_DIR, slug);
  const projectPath = path.join(projectDir, 'project.json');
  const project     = readJson(projectPath) || {};

  console.log('\n' + bold('━'.repeat(60)));
  console.log(bold(`  Check Proposal Acceptance — ${project.displayName || slug}`));
  console.log(bold('━'.repeat(60)));

  if (project.lockedPricing) {
    console.log(`\n  ${green('✓')} lockedPricing already set in project.json`);
    console.log(`     Rate:    $${project.lockedPricing.ratePerFlowPerMonth}/flow/month`);
    console.log(`     Locked:  ${project.lockedPricing.lockedAt}`);
    if (project.lockedPricing.acceptedAt) {
      console.log(`     Accepted: ${project.lockedPricing.acceptedAt} by ${project.lockedPricing.acceptedBy}`);
    }
    return;
  }

  if (!process.env.FIREBASE_SA_KEY && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(`\n  ${yellow('⚠')}  No Firebase credentials found (GOOGLE_APPLICATION_CREDENTIALS not set).`);
    console.log(`\n  Manual check — Firestore console:`);
    console.log(`  dataskateclients → proposals → ${slug}`);
    console.log(`\n  If accepted, add to projects/${slug}/project.json:`);
    console.log(`  "lockedPricing": {`);
    console.log(`    "ratePerFlowPerMonth": <rate>,`);
    console.log(`    "scope": "all-flows-current-and-future",`);
    console.log(`    "lockedAt": "${today()}",`);
    console.log(`    "lockedBy": "client-acceptance",`);
    console.log(`    "acceptedAt": "<ISO timestamp>",`);
    console.log(`    "acceptedBy": "<client email>"`);
    console.log(`  }`);
    return;
  }

  try {
    const { execSync } = require('child_process');
    const readScript = [
      `const admin = require('./firebase/functions/node_modules/firebase-admin');`,
      `if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'dataskateclients' });`,
      `admin.firestore().collection('proposals').doc('${slug}').get().then(doc => {`,
      `  if (!doc.exists) { console.log(JSON.stringify({ found: false })); process.exit(0); }`,
      `  const d = doc.data();`,
      `  console.log(JSON.stringify({ found: true, acceptedAt: d.acceptedAt ? d.acceptedAt.toDate().toISOString() : null, acceptedBy: d.acceptedBy, ratePerFlow: d.ratePerFlow, flowCount: d.flowCount, model: d.model }));`,
      `  process.exit(0);`,
      `}).catch(e => { console.error(e.message); process.exit(1); });`,
    ].join(' ');
    const result = execSync(`node -e "${readScript}"`, { cwd: ROOT, encoding: 'utf8' });
    const data   = JSON.parse(result.trim());

    if (!data.found || !data.acceptedAt) {
      console.log(`\n  ${yellow('○')}  No acceptance recorded yet in proposals/${slug}`);
      return;
    }

    const acceptedByEmail = data.acceptedBy && typeof data.acceptedBy === 'object'
      ? data.acceptedBy.email
      : data.acceptedBy;
    console.log(`\n  ${green('✓')} Accepted by ${acceptedByEmail} on ${data.acceptedAt}`);

    mergeJson(projectPath, {
      lockedPricing: {
        ratePerFlowPerMonth: data.ratePerFlow,
        scope:               'all-flows-current-and-future',
        lockedAt:            today(),
        lockedBy:            'client-acceptance',
        acceptedAt:          data.acceptedAt,
        acceptedBy:          acceptedByEmail,
      },
    });
    console.log(`  ${green('✓')} lockedPricing written to project.json — $${data.ratePerFlow}/flow/month`);
  } catch (e) {
    console.log(`  ${red('✗')}  Firestore read failed: ${e.message}`);
  }
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

async function main() {
  const mode = deltaMode ? 'delta' : checkAcceptanceMode ? 'check-acceptance' : pipelineMode ? 'pipeline' : 'interactive';
  console.log(dim(`  [orchestrate.js] starting — mode: ${mode}`));

  // Delta and acceptance modes require an explicit --client slug
  if ((deltaMode || checkAcceptanceMode) && !clientArg) {
    console.error(red('\n  Error: --mode delta and --check-acceptance require --client <slug>'));
    process.exit(1);
  }

  // ── Auto-tmux bootstrap ──────────────────────────────────────────────────────
  // When running --pipeline outside of tmux, re-launch inside a named tmux session
  // so agents can be spawned in split panes automatically. The user runs one command
  // and tmux opens with the orchestrator on the left and each agent on the right.
  if (pipelineMode && clientArg && !process.env.TMUX) {
    const tmuxSession = `ds-${clientArg}`;
    const args = process.argv.slice(2).join(' ');
    const relaunchCmd = `cd '${ROOT}' && node '${__filename}' ${args}`;
    // Kill any stale session with the same name, then create fresh
    spawnSync('tmux', ['kill-session', '-t', tmuxSession], { stdio: 'pipe' });
    spawnSync('tmux', ['new-session', '-d', '-s', tmuxSession, '-x', '220', '-y', '50'], { stdio: 'pipe' });
    spawnSync('tmux', ['send-keys', '-t', tmuxSession, relaunchCmd, 'Enter'], { stdio: 'pipe' });
    // Attach — this blocks until the tmux session exits
    spawnSync('tmux', ['attach-session', '-t', tmuxSession], { stdio: 'inherit' });
    process.exit(0);
  }

  let slug = clientArg;

  // Extract PDFs/DOCX first so .txt files are available for Gemini inference
  preExtractInbox(INBOX_DIR);

  // Infer client name once — reused for resume check and onboarding
  const aiInference = slug ? { displayName: null, source: null } : await inferClientWithAI(INBOX_DIR);
  if (!slug && aiInference.geminiCost) {
    appendTelemetry('_inference', 'infer-client', null, 'complete', {
      model:  'gemini-2.5-flash',
      input:  aiInference.geminiTokens?.in  || '',
      output: aiInference.geminiTokens?.out || '',
      cost:   aiInference.geminiCost,
    });
  }

  if (!slug) {
    // Check for existing projects to resume
    if (fs.existsSync(PROJECTS_DIR)) {
      const existing = fs.readdirSync(PROJECTS_DIR)
        .filter(d => fs.existsSync(path.join(PROJECTS_DIR, d, 'project.json')));
      if (existing.length === 1 && !skipOnboarding) {
        const proj = readJson(path.join(PROJECTS_DIR, existing[0], 'project.json'));
        console.log(`\n  Found existing project: ${bold(proj.displayName)} (${existing[0]})`);
        const resume = await confirm('  Resume this project?');
        if (resume) { slug = existing[0]; }
      }
    }
  }

  if (!slug && aiInference.displayName) {
    // Check if project.json already exists for the inferred client
    const inferredSlug = slugify(aiInference.displayName);
    const projectJson  = path.join(PROJECTS_DIR, inferredSlug, 'project.json');
    if (fs.existsSync(projectJson) && !skipOnboarding) {
      const proj = readJson(projectJson);
      console.log(`\n  Resuming ${bold(proj.displayName)} (projects/${inferredSlug}/) — architect: ${proj.architect}.`);
      const resume = await confirm('  Proceed?');
      slug = resume ? inferredSlug : null;
    }
  }

  if (!slug) {
    // Full onboarding — pass cached inference so Gemini is not called again
    slug = await onboard(aiInference);
  }

  // Verify project exists
  const projectPath = path.join(PROJECTS_DIR, slug, 'project.json');
  if (!fs.existsSync(projectPath)) {
    console.error(red(`\n  Error: No project found at projects/${slug}/. Run without --client to onboard.`));
    process.exit(1);
  }

  if (checkAcceptanceMode) {
    setLogFile(slug);
    stepLog('CHECK-ACCEPTANCE START', 'START');
    await checkAcceptance(slug);
    stepLog('CHECK-ACCEPTANCE END', 'END');
    return;
  }

  if (deltaMode) {
    if (!recordingArg) {
      console.error(red('\n  Error: --mode delta requires --recording <file>'));
      process.exit(1);
    }
    const recordingPath = path.isAbsolute(recordingArg) ? recordingArg : path.join(ROOT, recordingArg);
    if (!fs.existsSync(recordingPath)) {
      console.error(red(`\n  Error: Recording file not found: ${recordingArg}`));
      process.exit(1);
    }
    await runDeltaPipeline(slug, recordingArg);
    return;
  }

  await runPipeline(slug);
}

main().catch(err => {
  console.error(red('\n  Fatal error: ' + err.message));
  process.exit(1);
});
