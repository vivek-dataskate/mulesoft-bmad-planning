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
 */

const fs   = require('fs');
const path = require('path');
const readline = require('readline');

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT          = path.resolve(__dirname, '../..');
const INBOX_DIR     = path.join(ROOT, '_inbox');
const PROJECTS_DIR  = path.join(ROOT, 'projects');
const PIPELINE_JSON = path.join(__dirname, 'pipeline.json');
const TELEMETRY_CSV = path.join(ROOT, 'DSPipeline/telemetry/usage.csv');
const ARCHITECTS    = {
  '1': { name: 'Kailash Chanda',    email: 'kailash@dataskate.ai' },
  '2': { name: 'Raghuram Potluri',  email: 'raghuram@dataskate.ai' },
};

// ─── CLI Args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getFlag  = (flag) => { const i = args.indexOf(flag); return i !== -1; };
const getArg   = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const clientArg      = getArg('--client');
const skipOnboarding = getFlag('--skip-onboarding');
const pipelineMode   = getFlag('--pipeline');   // auto-confirm all gates

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

function markComplete(slug, agentSlug, durationMs) {
  const state = readState(slug);
  if (!state.completed.includes(agentSlug)) {
    state.completed.push(agentSlug);
  }
  state.currentStep = state.completed.length + 1;
  state[`${agentSlug}CompletedAt`] = isoNow();
  writeState(slug, state);
  appendTelemetry(slug, agentSlug, durationMs, 'complete');
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

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
      // Vera writes company_context.json directly — just ensure generatedAt is fresh
      // and copy any fields it may have set to the in-memory ctx for the next agent
      const veraCtx = readJson(ctxPath); // re-read after Vera's direct write
      if (veraCtx) Object.assign(ctx, veraCtx);
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
    case 'quinn':
    case 'mira': {
      // These agents don't contribute structured fields to company_context.
      // Quinn updates project.json (intakeUrl) directly.
      ctx.generatedAt = isoNow();
      break;
    }
  }

  writeJson(ctxPath, ctx);
}

// ─── Agent Gate Display ───────────────────────────────────────────────────────

function printAgentBanner(agent, slug) {
  const totalAgents = 9;
  console.log('\n' + bold('━'.repeat(60)));
  console.log(bold(`  NEXT: ${agent.name} — ${agent.role}  [${agent.position}/${totalAgents}]`));
  console.log(bold('━'.repeat(60)));
  console.log(`  Mode:    ${agent.mode === 'gated' ? yellow('GATED (confirm numbers)') : cyan('CONVERSATIONAL (Q&A loop)')}`);
  console.log(`  Model:   ${agent.model}`);
  console.log(`  Client:  ${slug}`);
  console.log();
  console.log(`  ${bold('Load this agent in Claude Code:')}`);
  console.log(`  ${dim('─'.repeat(54))}`);
  console.log(`  ${cyan('Talk to ' + agent.name)} — load: ${bold(agent.toml)}`);
  console.log(`  ${dim('─'.repeat(54))}`);
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

    // Post-agent: assemble company_context.json
    assembleContext(slug, agent.slug);
    console.log(`  ${green('✓')} company_context.json updated`);

    // Mark complete in state
    markComplete(slug, agent.slug, durationMs);
    console.log(`  ${green('✓')} ${agent.name} marked complete (${(durationMs / 1000).toFixed(0)}s)`);

    // Gate prompt for next agent (unless this is the last)
    if (agent.gatePrompt && agents.indexOf(agent) < agents.length - 1) {
      console.log();
    }
  }

  // Pipeline complete
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

// ─── Entry Point ─────────────────────────────────────────────────────────────

async function main() {
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

  await runPipeline(slug);
}

main().catch(err => {
  console.error(red('\n  Fatal error: ' + err.message));
  process.exit(1);
});
