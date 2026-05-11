#!/usr/bin/env node
'use strict';
/**
 * scaffold/run-pipeline.js
 *
 * Automated end-to-end pipeline: intake files → prd → architecture →
 * decisions.json → stories → scaffold → GitHub repo.
 *
 * Called by .github/workflows/intake-to-code.yml, but can also be
 * run locally by a tech lead:
 *
 *   ANTHROPIC_API_KEY=sk-... GITHUB_TOKEN=ghp_... GITHUB_ORG=my-org \
 *     node scaffold/run-pipeline.js leolabs
 *
 *   node scaffold/run-pipeline.js leolabs --skip-repo   (skip GitHub repo creation)
 *   node scaffold/run-pipeline.js leolabs --dry-run     (skip scaffold + repo)
 *
 * What it does:
 *   1. Reads PLANNING_CONTEXT.md + FIELD_KNOWLEDGE.md (shared context)
 *   2. Analyst pass  → projects/{client}/prd.md
 *   3. Architect pass → projects/{client}/architecture.md + decisions.json
 *   4. PM pass       → projects/{client}/stories.md
 *   5. Scaffold      → /tmp/{client}-mule/
 *   6. Create repo   → GitHub (if GITHUB_TOKEN + GITHUB_ORG set)
 *
 * Each agent pass uses claude-sonnet-4-6 with 8 000-token output budget.
 * Passes are sequential — each reads the output of the prior pass.
 * A pass is skipped if its output file already exists and --force is not set.
 */

const Anthropic  = require('@anthropic-ai/sdk');
const fs         = require('fs');
const path       = require('path');
const { execSync, spawnSync } = require('child_process');

// ─── Slack notification helper ────────────────────────────────────────────────

function notifySlack(stage, extraEnv = {}) {
  if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_CHANNEL) return;
  const result = spawnSync('node', ['scaffold/slack-agent.js'], {
    cwd:   path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env:   { ...process.env, PIPELINE_STAGE: stage, CLIENT: client, ...extraEnv },
  });
  if (result.status !== 0) warn(`Slack notification failed for stage: ${stage} (non-blocking)`);
}

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const client    = args.find(a => !a.startsWith('--'));
const skipRepo  = args.includes('--skip-repo');
const dryRun    = args.includes('--dry-run');
const force     = args.includes('--force');

// --stage analyst|architect|pm|scaffold  — run only one stage (used by slack-bot.js)
const stageArg  = (() => { const i = args.indexOf('--stage'); return i !== -1 ? args[i + 1] : null; })();
// --feedback "..."  — architect input to incorporate into this stage's prompt
const feedbackArg = (() => { const i = args.indexOf('--feedback'); return i !== -1 ? args[i + 1] : null; })();

if (!client) {
  console.error('Usage: node scaffold/run-pipeline.js <client> [--skip-repo] [--dry-run] [--force]');
  process.exit(1);
}

const REPO_ROOT    = path.resolve(__dirname, '..');
const CLIENT_DIR   = path.join(REPO_ROOT, 'projects', client);
const INTAKE_DIR   = path.join(CLIENT_DIR, 'intake');
const SCOPING_DIR  = path.join(CLIENT_DIR, 'scoping');

if (!fs.existsSync(INTAKE_DIR) && !fs.existsSync(SCOPING_DIR)) {
  console.error(`Error: No intake or scoping directory found for client: ${client}`);
  console.error(`Create projects/${client}/intake/ or projects/${client}/scoping/ and drop discovery documents there.`);
  process.exit(1);
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const MODEL     = 'claude-sonnet-4-6';
const MAX_TOKENS = 8000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const info  = msg => console.log(`→ ${msg}`);
const ok    = msg => console.log(`✓ ${msg}`);
const warn  = msg => console.log(`⚠  ${msg}`);
const sep   = ()  => console.log('─'.repeat(60));

function readFile(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function writeOutput(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  ok(`Wrote ${path.relative(REPO_ROOT, filePath)}`);
}

const TEXT_EXTS = new Set(['.txt', '.md', '.json', '.yaml', '.yml', '.csv', '.html', '.htm', '.rst']);

// ─── Text extraction for manual uploads (bypass validate-intake.js) ───────────

async function extractFileContent(fullPath, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (TEXT_EXTS.has(ext)) return fs.readFileSync(fullPath, 'utf8');

  if (ext === '.pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fs.readFileSync(fullPath));
      return data.text?.trim() || '[PDF — no text layer found]';
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') return '[PDF — run: npm install pdf-parse@1.1.1]';
      return `[PDF — extraction failed: ${e.message}]`;
    }
  }

  if (ext === '.docx') {
    try {
      const mammoth = require('mammoth');
      const result  = await mammoth.extractRawText({ path: fullPath });
      return result.value?.trim() || '[DOCX — no text extracted]';
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') return '[DOCX — run: npm install mammoth]';
      return `[DOCX — extraction failed: ${e.message}]`;
    }
  }

  return null; // not extractable
}

async function extractBinaries(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter(f => !f.startsWith('.'))) {
    const fullPath = path.join(dir, f);
    if (!fs.statSync(fullPath).isFile()) continue;
    if (TEXT_EXTS.has(path.extname(f).toLowerCase())) continue;
    const txtPath = path.join(dir, f.replace(/\.[^.]+$/, '.txt'));
    if (fs.existsSync(txtPath)) continue;
    const text = await extractFileContent(fullPath, f);
    if (text) {
      fs.writeFileSync(txtPath, text, 'utf8');
      ok(`Extracted → ${path.relative(REPO_ROOT, txtPath)}`);
    }
  }
}

function readTextDir(dir) {
  if (!fs.existsSync(dir)) return [];
  const contents = [];
  for (const f of fs.readdirSync(dir).filter(f => !f.startsWith('.'))) {
    const fullPath = path.join(dir, f);
    if (!fs.statSync(fullPath).isFile()) continue;
    if (TEXT_EXTS.has(path.extname(f).toLowerCase())) {
      contents.push(`\n\n=== ${f} ===\n${fs.readFileSync(fullPath, 'utf8')}`);
    }
  }
  return contents;
}

function readIntakeFiles() {
  return [...readTextDir(INTAKE_DIR), ...readTextDir(SCOPING_DIR)].join('\n');
}

function buildSystemContext() {
  const planCtx   = readFile(path.join(REPO_ROOT, 'docs', 'PLANNING_CONTEXT.md'))  ?? '';
  const fieldKnow = readFile(path.join(REPO_ROOT, 'docs', 'FIELD_KNOWLEDGE.md'))   ?? '';
  const registry  = readFile(path.join(REPO_ROOT, 'standards', 'connector-registry.json')) ?? '{}';
  // Trim registry to first 8 000 chars to stay within context — full file is 300 KB
  const registryExcerpt = registry.length > 8000
    ? registry.slice(0, 8000) + '\n\n[... registry truncated — full file at standards/connector-registry.json ...]'
    : registry;

  return [
    '# SYSTEM CONTEXT — READ THIS FIRST\n',
    planCtx,
    '\n\n---\n\n# FIELD KNOWLEDGE\n',
    fieldKnow,
    '\n\n---\n\n# CONNECTOR REGISTRY (excerpt)\n```json\n',
    registryExcerpt,
    '\n```',
  ].join('');
}

async function callAgent(stepName, systemCtx, userPrompt, outputPath) {
  if (!force && fs.existsSync(outputPath)) {
    warn(`${stepName}: ${path.basename(outputPath)} already exists — skipping (use --force to regenerate)`);
    return readFile(outputPath);
  }

  info(`${stepName} — calling ${MODEL}...`);
  const start = Date.now();

  const response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: MAX_TOKENS,
    system:     systemCtx,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const content = response.content[0]?.text ?? '';
  ok(`${stepName} complete in ${elapsed}s (${content.length} chars)`);
  writeOutput(outputPath, content);
  return content;
}

// ─── Agent Passes ─────────────────────────────────────────────────────────────

async function runAnalyst(sysCtx, extraContext = '') {
  sep();
  info('PASS 1 — BMAD Analyst Agent (Mary)');
  const intakeContent = readIntakeFiles();
  const prompt = `You are the BMAD Analyst Agent (Mary). A client named "${client}" needs a MuleSoft integration.

Their discovery documents are below. Read everything carefully, then produce a complete PRD following the analyst agent guidelines in PLANNING_CONTEXT.md.

## Intake Documents
${intakeContent}
${extraContext}

## Your Output
Write ONLY the contents of prd.md — no preamble, no explanation. Start directly with the markdown content.

Follow the prd-template.md structure from PLANNING_CONTEXT.md. Check every identified system against the connector registry. Flag any system not in the registry as needing API Contract Discovery.`;

  return callAgent('Analyst', sysCtx, prompt, path.join(CLIENT_DIR, 'prd.md'));
}

async function runArchitect(sysCtx, prd) {
  sep();
  info('PASS 2 — BMAD Architect Agent (Winston)');
  const scenariosDir = path.join(REPO_ROOT, 'standards', 'scenarios');
  const scenarios    = fs.readdirSync(scenariosDir)
    .filter(f => f.endsWith('.md'))
    .map(f => `\n=== ${f} ===\n${fs.readFileSync(path.join(scenariosDir, f), 'utf8')}`)
    .join('\n');
  const schema = readFile(path.join(REPO_ROOT, 'standards', 'decisions-schema.json')) ?? '{}';

  const prompt = `You are the BMAD Architect Agent (Winston). Walk the 6-Level Decision Tree from PLANNING_CONTEXT.md for client "${client}".

## PRD
${prd}

## Decisions Schema
\`\`\`json
${schema}
\`\`\`

## Scenario Files (all 21 patterns)
${scenarios}

## Your Output
Produce TWO files. Output them in this EXACT format — start each with a fence tag:

<<<ARCHITECTURE_MD>>>
[full contents of architecture.md here]
<<<END_ARCHITECTURE_MD>>>

<<<DECISIONS_JSON>>>
[full, valid decisions.json here matching the schema above]
<<<END_DECISIONS_JSON>>>

Fill ALL fields in decisions.json. Set deduplicationTtlMinutes = messageTtlHours × 60.`;

  const raw = await callAgent('Architect', sysCtx, prompt, path.join(CLIENT_DIR, '_architect_raw.md'));

  // Split the raw output into architecture.md and decisions.json
  const archMatch = raw.match(/<<<ARCHITECTURE_MD>>>([\s\S]*?)<<<END_ARCHITECTURE_MD>>>/);
  const jsonMatch = raw.match(/<<<DECISIONS_JSON>>>([\s\S]*?)<<<END_DECISIONS_JSON>>>/);

  if (archMatch) {
    writeOutput(path.join(CLIENT_DIR, 'architecture.md'), archMatch[1].trim());
  } else {
    warn('Could not extract architecture.md from architect output — check _architect_raw.md');
  }

  if (jsonMatch) {
    let decisionsText = jsonMatch[1].trim();
    // Strip markdown code fence if the model added one
    decisionsText = decisionsText.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
    try {
      JSON.parse(decisionsText); // validate
      writeOutput(path.join(CLIENT_DIR, 'decisions.json'), decisionsText);
    } catch (e) {
      warn(`decisions.json is not valid JSON: ${e.message} — check _architect_raw.md`);
    }
  } else {
    warn('Could not extract decisions.json from architect output — check _architect_raw.md');
  }

  return raw;
}

async function runPm(sysCtx, prd) {
  sep();
  info('PASS 3 — BMAD PM Agent (John)');

  const decisionsPath = path.join(CLIENT_DIR, 'decisions.json');
  const decisions     = readFile(decisionsPath) ?? '{}';

  // Read all story library templates
  const storyDir = path.join(REPO_ROOT, 'story-library');
  const storyLib = fs.readdirSync(storyDir)
    .filter(f => f.endsWith('.md'))
    .map(f => `\n=== ${f} ===\n${fs.readFileSync(path.join(storyDir, f), 'utf8')}`)
    .join('\n');

  const prompt = `You are the BMAD PM Agent (John). Generate sprint stories for client "${client}".

## decisions.json
\`\`\`json
${decisions}
\`\`\`

## Story Library Templates
${storyLib}

## Your Output
Write ONLY the contents of stories.md. Start with # Sprint Stories — ${client}.
Include global stories (error handler, MQ queues, secrets, CI/CD) and per-flow stories (API spec, implementation, DataWeave, MUnit, monitoring) using the story library templates. Reference the exact scaffold file names from decisions.json flows[].`;

  return callAgent('PM', sysCtx, prompt, path.join(CLIENT_DIR, 'stories.md'));
}

// ─── Scaffold + Repo ──────────────────────────────────────────────────────────

function runScaffold() {
  sep();
  info('PASS 4 — Scaffold Generator');
  const decisionsPath = path.join(CLIENT_DIR, 'decisions.json');
  if (!fs.existsSync(decisionsPath)) {
    warn('decisions.json not found — skipping scaffold');
    return false;
  }
  const result = spawnSync('node', ['scaffold/generate.js', decisionsPath], {
    cwd:   REPO_ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    warn('Scaffold generator failed — check decisions.json for errors');
    return false;
  }
  return true;
}

function createClientRepo() {
  sep();
  info('PASS 5 — Create GitHub Repo');
  const token = process.env.GITHUB_TOKEN;
  const org   = process.env.GITHUB_ORG;
  if (!token || !org) {
    warn('GITHUB_TOKEN or GITHUB_ORG not set — skipping repo creation');
    info('To create the repo manually: GITHUB_TOKEN=... GITHUB_ORG=... bash scaffold/create-client-repo.sh projects/' + client + '/decisions.json');
    return;
  }
  const decisionsPath = path.join(CLIENT_DIR, 'decisions.json');
  const result = spawnSync('bash', ['scaffold/create-client-repo.sh', decisionsPath], {
    cwd:   REPO_ROOT,
    stdio: 'inherit',
    env:   { ...process.env, GITHUB_TOKEN: token, GITHUB_ORG: org },
  });
  if (result.status !== 0) {
    warn('create-client-repo.sh failed — repo may already exist or credentials expired');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  BMAD Pipeline — client: ${client.padEnd(33)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // Extract any PDF/DOCX that don't yet have a .txt (manual uploads bypass validate-intake.js)
  await extractBinaries(INTAKE_DIR);
  await extractBinaries(SCOPING_DIR);

  const sysCtx = buildSystemContext();
  info(`System context: ${sysCtx.length} chars`);

  // ── Single-stage mode (called by slack-bot.js) ────────────────────────────
  if (stageArg) {
    const feedback = feedbackArg ? `\n\n## Architect Feedback (incorporate this)\n${feedbackArg}` : '';
    switch (stageArg) {
      case 'analyst':
        await runAnalyst(sysCtx, feedback);
        notifySlack('analyst_complete');
        break;
      case 'architect': {
        const prdContent = readFile(path.join(CLIENT_DIR, 'prd.md')) ?? '';
        await runArchitect(sysCtx, prdContent + feedback);
        notifySlack('architect_complete');
        break;
      }
      case 'pm': {
        const prdContent = readFile(path.join(CLIENT_DIR, 'prd.md')) ?? '';
        await runPm(sysCtx, prdContent + feedback);
        notifySlack('pm_complete');
        break;
      }
      case 'scaffold':
        if (!dryRun) {
          const ok = runScaffold();
          if (ok) notifySlack('scaffold_complete');
        }
        break;
      default:
        warn(`Unknown --stage value: ${stageArg}. Valid: analyst, architect, pm, scaffold`);
    }
    return;
  }

  // ── Full pipeline run ──────────────────────────────────────────────────────
  const prd = await runAnalyst(sysCtx);
  notifySlack('analyst_complete');

  await runArchitect(sysCtx, prd ?? '');
  notifySlack('architect_complete');

  await runPm(sysCtx, prd ?? '');
  notifySlack('pm_complete');

  if (!dryRun) {
    const scaffolded = runScaffold();
    if (scaffolded && !skipRepo) {
      createClientRepo();
    }
    if (scaffolded) notifySlack('scaffold_complete');
  } else {
    warn('--dry-run: skipping scaffold and repo creation');
  }

  sep();
  console.log('');
  console.log('Pipeline complete.');
  console.log('');
  console.log(`  prd.md:           projects/${client}/prd.md`);
  console.log(`  architecture.md:  projects/${client}/architecture.md`);
  console.log(`  decisions.json:   projects/${client}/decisions.json`);
  console.log(`  stories.md:       projects/${client}/stories.md`);
  if (!dryRun) {
    console.log(`  scaffold output:  /tmp/${client}-mule/`);
  }
  console.log('');
  console.log('Review the outputs before merging — agents may have questions');
  console.log('flagged as OPEN ITEMS in prd.md or architecture.md.');
  console.log('');
}

main().catch(err => {
  console.error('Pipeline failed:', err.message);
  process.exit(1);
});
