#!/usr/bin/env node
'use strict';

/**
 * DSPipeline — Scout Orchestrator
 *
 * Entry point for the DataSkate pre-sales pipeline.
 * Handles onboarding, state tracking, company_context.json assembly, and telemetry.
 *
 * Usage:
 *   node DSPipeline/scout/orchestrate.js                    # full run (onboarding + pipeline)
 *   node DSPipeline/scout/orchestrate.js --client mrn       # resume specific client
 *   node DSPipeline/scout/orchestrate.js --client mrn --skip-onboarding
 *   node DSPipeline/scout/orchestrate.js --client mrn --pipeline  # auto-confirm all gates
 *   node DSPipeline/scout/orchestrate.js --client mrn --mode delta --recording scoping/may-amendment.txt
 *   node DSPipeline/scout/orchestrate.js --client mrn --check-acceptance
 */

const fs   = require('fs');
const path = require('path');
const readline = require('readline');

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT          = path.resolve(__dirname, '../..');
const INBOX_DIR     = path.join(ROOT, '_inbox');
const PROJECTS_DIR  = path.join(ROOT, 'projects');
const PIPELINE_JSON = path.join(__dirname, 'pipeline.json');
const TELEMETRY_CSV   = path.join(ROOT, 'DSPipeline/telemetry/usage.csv');
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

function inferClientFromInbox() {
  if (!fs.existsSync(INBOX_DIR)) return null;
  const files = fs.readdirSync(INBOX_DIR).filter(f => f !== '.gitkeep' && !f.startsWith('.'));
  if (!files.length) return null;
  // Take the first filename, strip extension, strip common suffixes
  const base = path.basename(files[0], path.extname(files[0]));
  const cleaned = base
    .replace(/[-_]?(scoping|call|meeting|transcript|notes|proposal|intake|deck)[-_]?/gi, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return cleaned || null;
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

// ─── Readline Gate ────────────────────────────────────────────────────────────

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, ans => { rl.close(); resolve(ans.trim()); });
  });
}

async function confirm(message, defaultYes = true) {
  if (pipelineMode) { console.log(`  ${dim('(pipeline mode — auto-confirm)')}`); return true; }
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const ans  = await prompt(`${message} ${hint}: `);
  if (!ans) return defaultYes;
  return ans.toLowerCase().startsWith('y');
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

async function onboard() {
  const inferred = inferClientFromInbox();
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
  const rawName     = await prompt(`  1. Client name      [${bold(defaultName)}]: `);
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

  // Create project structure
  const projectDir = path.join(PROJECTS_DIR, slug);
  fs.mkdirSync(path.join(projectDir, 'intake'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'scoping'), { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'run'),     { recursive: true });

  // Move _inbox/ files to scoping/
  const scopingDir = path.join(projectDir, 'scoping');
  let moved = 0;
  for (const file of inboxFiles) {
    const src  = path.join(INBOX_DIR, file);
    const dest = path.join(scopingDir, file);
    fs.renameSync(src, dest);
    moved++;
  }
  console.log(`\n  ${green('✓')} Moved ${moved} file(s) to projects/${slug}/scoping/`);

  // Write project.json
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
  console.log(`  ${green('✓')} Created projects/${slug}/project.json`);

  // Initialize decisions.json
  const decisionsPath = path.join(projectDir, 'decisions.json');
  if (!fs.existsSync(decisionsPath)) {
    writeJson(decisionsPath, { client: slug, createdAt: isoNow(), decisions: [] });
    console.log(`  ${green('✓')} Initialized projects/${slug}/decisions.json`);
  }

  // Initialize company_context.json shell
  const ctxPath = path.join(projectDir, 'company_context.json');
  if (!fs.existsSync(ctxPath)) {
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
    console.log(`  ${green('✓')} Initialized projects/${slug}/company_context.json`);
  }

  // Initialize pipeline-state.json
  const statePath = path.join(projectDir, 'run', 'pipeline-state.json');
  writeJson(statePath, {
    client:      slug,
    startedAt:   isoNow(),
    currentStep: 1,
    completed:   [],
  });
  console.log(`  ${green('✓')} Initialized projects/${slug}/run/pipeline-state.json`);

  // Ensure telemetry directory exists
  fs.mkdirSync(path.dirname(TELEMETRY_CSV), { recursive: true });
  if (!fs.existsSync(TELEMETRY_CSV)) {
    fs.writeFileSync(TELEMETRY_CSV, 'date,client,pipeline,agent,model,input_tokens,output_tokens,cost_usd,duration_ms,status\n');
    console.log(`  ${green('✓')} Initialized DSPipeline/telemetry/usage.csv`);
  }

  console.log(`\n  ${green('✓')} Project ${bold(displayName)} ready.`);
  return slug;
}

// ─── Pipeline State ───────────────────────────────────────────────────────────

function readState(slug) {
  const statePath = path.join(PROJECTS_DIR, slug, 'run', 'pipeline-state.json');
  return readJson(statePath) || { client: slug, currentStep: 1, completed: [] };
}

function writeState(slug, state) {
  const statePath = path.join(PROJECTS_DIR, slug, 'run', 'pipeline-state.json');
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
const MODEL_PRICING = readJson(path.join(ROOT, 'DSPipeline/telemetry/model-pricing.json')) || {};

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

  const runFile = path.join(projectDir, 'run', `${agentSlug}.json`);
  const data    = readJson(runFile);
  if (!data) return;

  switch (agentSlug) {

    case 'sage': {
      // Sage: extract document facts into company_context
      const updates = { generatedAt: isoNow() };
      if (data.businessContext) {
        if (data.businessContext.industry)      updates.industry    = data.businessContext.industry;
        if (data.businessContext.companyDescription) updates.snapshot = data.businessContext.companyDescription;
      }
      if (Array.isArray(data.confirmedFlows))  updates.confirmedFlows = data.confirmedFlows;
      if (Array.isArray(data.potentialFlows))  updates.potentialFlows = data.potentialFlows;
      if (Array.isArray(data.signals))         updates.signals = data.signals.map(s => s.signal || s);
      if (Array.isArray(data.namedContacts))   updates.namedContacts  = data.namedContacts;
      Object.assign(ctx, updates);
      break;
    }

    case 'vera': {
      // Project vera.json fields into company_context
      if (data.company) {
        const c = data.company;
        if (c.snapshot)        ctx.snapshot        = c.snapshot;
        if (c.industry)        ctx.industry        = c.industry;
        if (c.verticalSlug)    ctx.verticalSlug    = c.verticalSlug;
        if (c.hqLocation)      ctx.hqLocation      = c.hqLocation;
        if (c.revenueEstimate) ctx.revenueEstimate = c.revenueEstimate;
        if (c.revenueBracket)  ctx.revenueBracket  = c.revenueBracket;
        if (Array.isArray(c.businessObjects) && c.businessObjects.length) ctx.businessObjects = c.businessObjects;
        if (c.logoUrl !== undefined) ctx.logoUrl   = c.logoUrl;
      }
      if (data.aiJourney)                                         ctx.aiJourney           = data.aiJourney;
      if (Array.isArray(data.systemPrerequisites))                ctx.systemPrerequisites = data.systemPrerequisites;
      if (Array.isArray(data.nearbyPeers))                        ctx.nearbyPeers         = data.nearbyPeers;
      if (Array.isArray(data.competitorFOMO))                     ctx.competitorFOMO      = data.competitorFOMO;
      if (Array.isArray(data.aiThoughtStarters))                  ctx.aiThoughtStarters   = data.aiThoughtStarters;
      ctx.generatedAt = isoNow();
      break;
    }

    case 'rex': {
      // Rex: system findings + initial p0Blockers
      if (Array.isArray(data.systemFindings)) {
        ctx.systemFindings = [...(ctx.systemFindings || []), ...data.systemFindings];
      }
      if (Array.isArray(data.p0Blockers) && data.p0Blockers.length > 0) {
        ctx.p0Blockers = data.p0Blockers; // will be overwritten by Flo's consolidated version
      }
      break;
    }

    case 'ivy': {
      // Ivy: psychology profile
      if (data.psychologyProfile) ctx.psychologyProfile = data.psychologyProfile;
      break;
    }

    case 'flo': {
      // Flo: consolidated p0Blockers + flow updates
      if (Array.isArray(data.p0Blockers))    ctx.p0Blockers    = data.p0Blockers;
      if (Array.isArray(data.confirmedFlows)) ctx.confirmedFlows = data.confirmedFlows;
      if (Array.isArray(data.potentialFlows)) ctx.potentialFlows = data.potentialFlows;
      break;
    }

    case 'hawk':
    case 'petra':
    case 'mira': {
      ctx.generatedAt = isoNow();
      break;
    }

    case 'quinn': {
      // 8e: Quinn surfaces final p0Blockers, aiJourney updates, and systemFindings
      // during questionnaire assembly — merge them into company_context here.
      if (Array.isArray(data.p0Blockers) && data.p0Blockers.length > 0) {
        ctx.p0Blockers = data.p0Blockers;
      }
      if (data.aiJourney) ctx.aiJourney = data.aiJourney;
      if (Array.isArray(data.systemFindings) && data.systemFindings.length > 0) {
        const existing = ctx.systemFindings || [];
        const merged   = [...existing];
        for (const f of data.systemFindings) {
          if (!merged.find(e => e.system === f.system && e.finding === f.finding)) {
            merged.push(f);
          }
        }
        ctx.systemFindings = merged;
      }
      ctx.generatedAt = isoNow();
      break;
    }
  }

  writeJson(ctxPath, ctx);
}

// ─── Decisions Aggregation ────────────────────────────────────────────────────
// Called after every agent. Reads all run/*-decisions.json and rebuilds decisions.json.

function aggregateDecisions(slug) {
  const projectDir    = path.join(PROJECTS_DIR, slug);
  const runDir        = path.join(projectDir, 'run');
  const decisionsPath = path.join(projectDir, 'decisions.json');
  const decisionFiles = fs.existsSync(runDir)
    ? fs.readdirSync(runDir).filter(f => f.endsWith('-decisions.json')).sort()
    : [];
  if (!decisionFiles.length) return;
  const allDecisions = [];
  for (const file of decisionFiles) {
    const d = readJson(path.join(runDir, file));
    if (d && Array.isArray(d.decisions)) allDecisions.push(...d.decisions);
  }
  writeJson(decisionsPath, { client: slug, updatedAt: isoNow(), decisions: allDecisions });
}

// ─── Client Registry Write (post-Flo) ────────────────────────────────────────
// Writes a complete entry to standards/client-registry.json once Flo has confirmed
// the flow list (systems[]) and Vera has confirmed vertical + sizeSegment.

function writeClientRegistry(slug) {
  const registryPath = path.join(ROOT, 'standards', 'client-registry.json');
  const projectDir   = path.join(PROJECTS_DIR, slug);
  const project      = readJson(path.join(projectDir, 'project.json')) || {};
  const vera         = readJson(path.join(projectDir, 'run', 'vera.json')) || {};
  const flo          = readJson(path.join(projectDir, 'run', 'flo.json')) || {};

  // Prefer flo.confirmedFlows (most accurate); fall back to sage.systems[] before Flo runs
  const sage = readJson(path.join(projectDir, 'run', 'sage.json')) || {};
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
  } else {
    registry.clients.push(entry);
  }

  writeJson(registryPath, registry);
}

// ─── Firebase Deploy (post-Mira) ─────────────────────────────────────────────
// Runs 11a-11c after Mira has audited all client-facing documents.

function deployFirebase(slug) {
  const { execSync } = require('child_process');
  const projectDir   = path.join(PROJECTS_DIR, slug);
  const project      = readJson(path.join(projectDir, 'project.json')) || {};

  if (!process.env.FIREBASE_SA_KEY && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log(`  ${yellow('⚠')}  FIREBASE_SA_KEY not set — skipping Firebase deploy.`);
    return;
  }

  // 11a — Deploy hosting
  console.log('  Deploying to Firebase Hosting...');
  try {
    execSync('bash firebase/deploy.sh', { cwd: ROOT, stdio: 'inherit' });
    console.log(`  ${green('✓')} Hosting deployed`);
  } catch (e) {
    console.log(`  ${yellow('⚠')}  firebase/deploy.sh failed — check output above`);
    return;
  }

  // 11b — Seed Firestore
  const intakeUrl   = `https://dataskateclients.web.app/intake/${slug}.html`;
  const proposalUrl = `https://dataskateclients.web.app/proposal/${slug}.html`;
  console.log('  Seeding Firestore...');
  try {
    const seedScript = `
      const admin = require('./firebase/functions/node_modules/firebase-admin');
      admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'dataskateclients' });
      admin.firestore().collection('projects').doc('${slug}').set({
        name: ${JSON.stringify(project.displayName || slug)},
        status: 'intake_sent',
        architect: ${JSON.stringify(project.architect || '')},
        architectEmail: ${JSON.stringify(project.architectEmail || '')},
        intakeUrl: '${intakeUrl}',
        proposalUrl: '${proposalUrl}',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).then(() => { console.log('Seeded'); process.exit(0); });
    `;
    execSync(`node -e "${seedScript.replace(/\n/g, ' ')}"`, { cwd: ROOT, stdio: 'inherit' });
    console.log(`  ${green('✓')} Firestore seeded`);
  } catch (e) {
    console.log(`  ${yellow('⚠')}  Firestore seed failed — seed manually`);
  }

  // Write intakeUrl + proposalUrl to project.json
  mergeJson(path.join(projectDir, 'project.json'), { intakeUrl, proposalUrl });
  console.log(`  ${green('✓')} project.json updated with intakeUrl and proposalUrl`);
}

// ─── Source File Archival ─────────────────────────────────────────────────────
// Runs once at the end of the full pipeline, after all agents complete.
// Independent of Firebase hosting — archives regardless of deploy status.

function archiveScopingFiles(slug) {
  const { execSync } = require('child_process');
  const scopingDir = path.join(PROJECTS_DIR, slug, 'scoping');
  if (!fs.existsSync(scopingDir) || fs.readdirSync(scopingDir).filter(f => f !== '.gitkeep').length === 0) {
    console.log(`  ${dim('scoping/ already empty — nothing to archive')}`);
    return;
  }
  console.log('  Archiving scoping source files to Firebase Storage...');
  try {
    execSync(`node scripts/move-sources.js ${slug}`, { cwd: ROOT, stdio: 'inherit' });
    console.log(`  ${green('✓')} Source files archived`);
  } catch (e) {
    console.log(`  ${yellow('⚠')}  move-sources.js failed — run manually: node scripts/move-sources.js ${slug}`);
  }
}

// ─── Agent Gate Display ───────────────────────────────────────────────────────

function printAgentBanner(agent, slug) {
  const totalAgents = 9;
  const cmd = `claude --agent-file ${agent.toml}`;
  console.log('\n' + bold('━'.repeat(60)));
  console.log(bold(`  NEXT: ${agent.name} — ${agent.role}  [${agent.position}/${totalAgents}]`));
  console.log(bold('━'.repeat(60)));
  console.log(`  Mode:    ${agent.mode === 'gated' ? yellow('GATED (confirm numbers)') : cyan('CONVERSATIONAL (Q&A loop)')}`);
  console.log(`  Model:   ${agent.model}`);
  console.log(`  Client:  ${slug}`);
  console.log();
  console.log(`  ${bold('Run in a new terminal:')}`);
  console.log(`  ┌${'─'.repeat(56)}┐`);
  console.log(`  │  ${green(cmd)}${' '.repeat(Math.max(0, 54 - cmd.length))}│`);
  console.log(`  └${'─'.repeat(56)}┘`);
  console.log();
  console.log(`  When ${agent.name} is complete and you have confirmed the output:`);
}

// ─── Main Pipeline Loop ───────────────────────────────────────────────────────

async function runPipeline(slug) {
  const pipeline    = readJson(PIPELINE_JSON);
  const agents      = pipeline.agents;
  const state       = readState(slug);
  const projectDir  = path.join(PROJECTS_DIR, slug);
  const projectJson = readJson(path.join(projectDir, 'project.json'));

  console.log('\n' + bold('━'.repeat(60)));
  console.log(bold(`  DSPipeline — ${projectJson.displayName}`));
  console.log(`  ${dim('Architect: ')}${projectJson.architect}`);
  console.log(`  ${dim('Slug: ')}projects/${slug}/`);
  if (state.completed.length > 0) {
    console.log(`  ${dim('Completed: ')}${state.completed.join(', ')}`);
  }
  console.log(bold('━'.repeat(60)));

  for (const agent of agents) {
    if (state.completed.includes(agent.slug)) {
      console.log(`  ${green('✓')} ${agent.name} — ${dim('already complete')}`);
      continue;
    }

    printAgentBanner(agent, slug);

    const startMs = Date.now();

    if (pipelineMode) {
      console.log(`  ${dim('(pipeline mode — press Enter to mark complete and continue)')}`);
    }

    // Wait for user to confirm agent completion
    const ans = await prompt('  Press Enter when complete (or type "skip" to mark done, "quit" to stop): ');

    if (ans.toLowerCase() === 'quit') {
      console.log(`\n  ${yellow('Paused.')} Run again with --client ${slug} to resume.`);
      process.exit(0);
    }

    // Verify output file exists
    const outputPath = path.join(projectDir, agent.outputFile);
    if (!fs.existsSync(outputPath)) {
      const force = await confirm(
        `  ${yellow('⚠')}  Output file not found: ${agent.outputFile}. Mark as complete anyway?`,
        false
      );
      if (!force) {
        console.log(`  ${yellow('Retrying...')} Complete ${agent.name} and press Enter again.`);
        // re-run this agent
        agents.splice(agents.indexOf(agent), 0, agent);
        continue;
      }
    } else {
      const output = readJson(outputPath);
      if (output && output.status !== 'complete') {
        console.log(`  ${yellow('⚠')}  ${agent.outputFile} has status="${output.status}" — check agent output.`);
      }
    }

    const durationMs = Date.now() - startMs;

    // Auto-read token usage from the Claude session JSONL written during this agent run
    let tokens = { model: agent.model };
    const usage = readSessionTokens(startMs);
    if (usage && (usage.inp + usage.out) > 0) {
      const { inp, cacheCreate, cacheRead, out } = usage;
      const billableIn = inp + cacheCreate + Math.round(cacheRead * 0.1); // cache reads are ~10% cost
      tokens = { model: agent.model, input: billableIn, output: out, cost: calcCost(agent.model, billableIn, out) };
      const cacheNote = cacheRead > 0 ? ` | cache read: ${cacheRead.toLocaleString()}` : '';
      console.log(`  ${dim(`Tokens: ${billableIn.toLocaleString()} in (${inp.toLocaleString()} fresh + ${cacheCreate.toLocaleString()} write${cacheNote}) / ${out.toLocaleString()} out — cost ≈ $${tokens.cost}`)}`);
    } else {
      console.log(`  ${dim('Token usage: not captured (agent may have run before this session started)')}`);
    }

    // Post-agent: assemble company_context.json + rebuild decisions.json
    assembleContext(slug, agent.slug);
    console.log(`  ${green('✓')} company_context.json updated`);
    aggregateDecisions(slug);

    // Post-Vera: write initial client-registry entry + promote library contributions
    if (agent.slug === 'vera') {
      writeClientRegistry(slug);
      console.log(`  ${green('✓')} standards/client-registry.json — initial entry written (status: scoping)`);
      try {
        require('child_process').execSync(`node DSPipeline/promote-library.js --client ${slug}`, { cwd: ROOT, stdio: 'inherit' });
        console.log(`  ${green('✓')} Library contributions promoted to standards/usecases/`);
      } catch (e) {
        console.log(`  ${yellow('⚠')}  promote-library.js failed — run manually: node DSPipeline/promote-library.js --client ${slug}`);
      }
    }

    // Post-Rex: rebuild connector index (Rex may have added/updated registry stubs)
    if (agent.slug === 'rex') {
      try {
        require('child_process').execSync('node standards/build-connector-index.js', { cwd: ROOT, stdio: 'inherit' });
        console.log(`  ${green('✓')} connector-names.json + connector-index.json rebuilt`);
      } catch (e) {
        console.log(`  ${yellow('⚠')}  build-connector-index.js failed — run manually`);
      }
    }

    // Post-Flo: write flowCount + pricingComputed to project.json, aggregate decisions, write registry
    if (agent.slug === 'flo') {
      const floData = readJson(path.join(projectDir, 'run', 'flo.json')) || {};
      if (floData.pricing) {
        mergeJson(path.join(projectDir, 'project.json'), {
          flowCount:       floData.pricing.flowCount,
          pricingComputed: floData.pricing,
        });
        console.log(`  ${green('✓')} project.json updated (flowCount, pricingComputed)`);
      }

      aggregateDecisions(slug);
      console.log(`  ${green('✓')} decisions.json aggregated`);

      writeClientRegistry(slug);
      console.log(`  ${green('✓')} standards/client-registry.json updated`);
    }

    // Post-Mira: deploy to Firebase (all docs audited — safe to publish)
    if (agent.slug === 'mira') {
      deployFirebase(slug);
    }

    // Mark complete in state
    markComplete(slug, agent.slug, durationMs, tokens);
    console.log(`  ${green('✓')} ${agent.name} marked complete (${(durationMs / 1000).toFixed(0)}s)`);

    // Gate prompt for next agent (unless this is the last)
    if (agent.gatePrompt && agents.indexOf(agent) < agents.length - 1) {
      console.log();
    }
  }

  // Pipeline complete — archive scoping files now that all agents are done
  archiveScopingFiles(slug);

  console.log('\n' + bold('═'.repeat(60)));
  console.log(bold('  PIPELINE COMPLETE'));
  console.log(bold('═'.repeat(60)));

  const project = readJson(path.join(projectDir, 'project.json'));
  console.log(`
  ${bold('Client deliverables:')}
    Proposal:      projects/${slug}/intake/proposal-${slug}.html
    Intake form:   projects/${slug}/intake/intake-questionnaire-${slug}.html
    Integration deck: projects/${slug}/intake/integration-deck-${slug}.html

  ${bold('Live URLs:')}
    Intake:    ${project.intakeUrl  || dim('(set after Quinn runs)')}
    Proposal:  ${project.proposalUrl || dim('(set after Quinn runs)')}

  ${bold('Internal:')}
    Run files: projects/${slug}/run/
    Context:   projects/${slug}/company_context.json
    Decisions: projects/${slug}/decisions.json
  `);
}

// ─── Delta Pipeline (scope amendment) ────────────────────────────────────────
// Runs Sage → Flo → Quinn → Petra → Mira on a new recording.
// Preserves lockedPricing, answered intake questions, and existing proposal flows.

async function runDeltaPipeline(slug, recordingFile) {
  const projectDir = path.join(PROJECTS_DIR, slug);
  const project    = readJson(path.join(projectDir, 'project.json')) || {};
  const amendments = project.amendments || [];
  const amdNum     = String(amendments.length + 1).padStart(3, '0');
  const amdId      = `AMD-${amdNum}`;

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
    { slug: 'sage',  name: 'Sage',  role: 'Document Intelligence', outputFile: 'run/sage.json',  note: `Point Sage at: ${relRecording}` },
    { slug: 'flo',   name: 'Flo',   role: 'Flow Analyst + Pricing', outputFile: 'run/flo.json',   note: 'Flo reads sage.json — will flag new flows vs existing' },
    { slug: 'quinn', name: 'Quinn', role: 'Intake Questionnaire',   outputFile: 'run/quinn.json', note: 'Quinn preserves answered questions; new gaps get [NEW] badge' },
    { slug: 'petra', name: 'Petra', role: 'Proposal Writer',        outputFile: 'run/petra.json', note: 'Petra appends [NEW] flows — preserves pricing section' },
    { slug: 'mira',  name: 'Mira',  role: 'Proposal Auditor',       outputFile: 'run/mira.json',  note: 'Final audit before re-deploy' },
  ];

  for (const agent of deltaAgents) {
    const cmd = `claude --agent-file DSPipeline/agents/${agent.slug}.toml`;
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
      console.log(`\n  ${yellow('Paused.')} Re-run with --client ${slug} --mode delta --recording ${recordingFile}`);
      process.exit(0);
    }

    // Post-Flo: if lockedPricing exists, override Flo's recalculated pricing with locked rate
    if (agent.slug === 'flo' && project.lockedPricing && project.lockedPricing.ratePerFlowPerMonth) {
      const lockedRate = project.lockedPricing.ratePerFlowPerMonth;
      const floPath    = path.join(projectDir, 'run', 'flo.json');
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

    assembleContext(slug, agent.slug);
    markComplete(slug, agent.slug, Date.now() - startMs);
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
  // Delta and acceptance modes require an explicit --client slug
  if ((deltaMode || checkAcceptanceMode) && !clientArg) {
    console.error(red('\n  Error: --mode delta and --check-acceptance require --client <slug>'));
    process.exit(1);
  }

  let slug = clientArg;

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

  if (!slug) {
    // Check if project.json already exists for the inferred client
    const inferred = inferClientFromInbox();
    if (inferred) {
      const inferredSlug = slugify(inferred);
      const projectJson  = path.join(PROJECTS_DIR, inferredSlug, 'project.json');
      if (fs.existsSync(projectJson) && !skipOnboarding) {
        const proj = readJson(projectJson);
        console.log(`\n  Resuming ${bold(proj.displayName)} (projects/${inferredSlug}/) — architect: ${proj.architect}.`);
        const resume = await confirm('  Proceed?');
        slug = resume ? inferredSlug : null;
      }
    }
  }

  if (!slug) {
    // Full onboarding
    slug = await onboard();
  }

  // Verify project exists
  const projectPath = path.join(PROJECTS_DIR, slug, 'project.json');
  if (!fs.existsSync(projectPath)) {
    console.error(red(`\n  Error: No project found at projects/${slug}/. Run without --client to onboard.`));
    process.exit(1);
  }

  if (checkAcceptanceMode) {
    await checkAcceptance(slug);
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
