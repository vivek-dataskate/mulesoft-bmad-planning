#!/usr/bin/env node
'use strict';
/**
 * scaffold/validate-intake.js
 *
 * Validates intake documents BEFORE committing to GitHub.
 * Called by google-drive-watcher.js after downloading new Drive files.
 *
 * What it does:
 *   1. Reads all files in a local intake staging directory
 *   2. Calls Claude to assess them against standards/intake-checklist.json
 *   3. Returns a structured validation result:
 *        { valid, client, summary, missingMandatory, missingRecommended, warnings, nextSteps, architectNotes }
 *   4. If valid:   commits to projects/{client}/intake/ and triggers Slack summary
 *   5. If invalid: posts Slack rejection listing what's missing — does NOT commit
 *
 * Usage (standalone):
 *   ANTHROPIC_API_KEY=sk-... node scaffold/validate-intake.js /tmp/intake-staging/leolabs
 *
 * Usage (from google-drive-watcher.js):
 *   const { validateIntake } = require('./validate-intake');
 *   const result = await validateIntake(stagingDir, clientName);
 */

const Anthropic = require('@anthropic-ai/sdk');
const fs        = require('fs');
const path      = require('path');
const { execSync } = require('child_process');

const REPO_ROOT  = path.resolve(__dirname, '..');
const CHECKLIST  = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'standards', 'intake-checklist.json'), 'utf8'));

// ─── Read staging files ───────────────────────────────────────────────────────

function readStagingFiles(stagingDir) {
  const files = fs.readdirSync(stagingDir).filter(f => !f.startsWith('.'));
  const result = [];
  for (const f of files) {
    const full = path.join(stagingDir, f);
    if (!fs.statSync(full).isFile()) continue;
    const ext  = path.extname(f).toLowerCase();
    const text = ['.txt', '.md', '.json', '.yaml', '.yml', '.csv', '.html', '.rst'].includes(ext);
    result.push({
      name: f,
      content: text ? fs.readFileSync(full, 'utf8') : `[Binary — ${fs.statSync(full).size} bytes]`,
    });
  }
  return result;
}

// ─── Trigger-based auto-warnings ─────────────────────────────────────────────

function detectAutoWarnings(filesContent) {
  const combined = filesContent.toLowerCase();
  const triggered = [];
  for (const w of CHECKLIST.autoWarnings) {
    const pattern = new RegExp(w.trigger, 'i');
    if (pattern.test(combined)) triggered.push(w);
  }
  return triggered;
}

// ─── Build checklist prompt ───────────────────────────────────────────────────

function buildValidationPrompt(files, clientName) {
  const fileSection = files.map(f => `\n=== ${f.name} ===\n${f.content}`).join('\n');
  const mandatoryList = CHECKLIST.mandatory.map(m => `- ${m.id}: ${m.description}`).join('\n');
  const recommendedList = CHECKLIST.recommended.map(r => `- ${r.id}: ${r.description}`).join('\n');

  return `You are the BMAD Intake Validation Agent. A client called "${clientName}" has uploaded discovery documents for a MuleSoft integration project.

Your job is to assess whether these documents contain enough information to begin the analyst and architect phases.

## Mandatory Requirements (ALL must be present to proceed)
${mandatoryList}

## Recommended (missing items become OPEN ITEMS — do not block, but flag)
${recommendedList}

## Uploaded Documents
${fileSection}

## Your Output
Respond with a JSON object ONLY — no prose, no markdown fences. Use this exact structure:

{
  "valid": true|false,
  "client": "${clientName}",
  "confidence": "high|medium|low",
  "executiveSummary": "2-3 sentence plain English summary of what this client wants to build. No jargon. Suitable for sending directly to the client.",
  "whatIsBeingBuilt": ["bullet 1", "bullet 2"],
  "missingMandatory": ["id1", "id2"],
  "missingRecommended": ["id1", "id2"],
  "systemsIdentified": ["system1", "system2"],
  "estimatedComplexity": "low|medium|high",
  "estimatedFlows": 3,
  "nextSteps": ["step 1 for analyst", "step 2"],
  "architectNotes": [
    "specific thing architect must verify or decide",
    "risk or pattern consideration from these docs"
  ],
  "openItems": [
    "specific question that must be answered before architecture can be finalised"
  ],
  "reusableCapabilities": [
    "name any patterns/connectors from standards that clearly apply here"
  ]
}

Be specific in architectNotes. Name the actual systems, patterns, and risks. Do not give generic advice.
If valid=false, missingMandatory must be non-empty.`;
}

// ─── Commit to GitHub ─────────────────────────────────────────────────────────

function commitToGitHub(stagingDir, clientName) {
  const targetDir = path.join(REPO_ROOT, 'projects', clientName, 'intake');
  fs.mkdirSync(targetDir, { recursive: true });

  const files = fs.readdirSync(stagingDir).filter(f => !f.startsWith('.'));
  for (const f of files) {
    const src  = path.join(stagingDir, f);
    const dest = path.join(targetDir, f);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, dest);
    }
  }

  try {
    execSync('git add projects/' + clientName + '/intake/', { cwd: REPO_ROOT, stdio: 'pipe' });
    execSync(
      `git commit -m "intake: ${clientName} — ${files.length} document(s) from Google Drive [skip pipeline-notification]"`,
      { cwd: REPO_ROOT, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 'BMAD Drive Sync', GIT_AUTHOR_EMAIL: 'bmad-drive@noreply.github.com', GIT_COMMITTER_NAME: 'BMAD Drive Sync', GIT_COMMITTER_EMAIL: 'bmad-drive@noreply.github.com' } }
    );
    execSync('git push', { cwd: REPO_ROOT, stdio: 'pipe' });
    return true;
  } catch (e) {
    const msg = e.stderr?.toString() ?? e.message;
    if (msg.includes('nothing to commit')) return true; // already committed
    throw new Error('Git commit/push failed: ' + msg);
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function validateIntake(stagingDir, clientName) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const files   = readStagingFiles(stagingDir);
  if (files.length === 0) {
    return { valid: false, client: clientName, reason: 'No files found in staging directory.' };
  }

  const combined      = files.map(f => f.content).join('\n');
  const autoWarnings  = detectAutoWarnings(combined);

  const anthropic = new Anthropic({ apiKey });
  const response  = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role:    'user',
      content: buildValidationPrompt(files, clientName),
    }],
  });

  let result;
  try {
    let text = response.content[0]?.text ?? '{}';
    text = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
    result = JSON.parse(text);
  } catch (e) {
    throw new Error('Validation agent returned invalid JSON: ' + e.message);
  }

  // Merge auto-detected warnings (keyword-based, no LLM needed)
  result.autoWarnings = autoWarnings;
  result.fileCount    = files.length;
  result.fileNames    = files.map(f => f.name);

  // If valid, commit to GitHub
  if (result.valid) {
    console.log(`✓ Intake valid for "${clientName}" — committing to GitHub`);
    commitToGitHub(stagingDir, clientName);
    result.committed = true;
  } else {
    console.log(`✗ Intake invalid for "${clientName}" — missing: ${result.missingMandatory?.join(', ')}`);
    result.committed = false;
  }

  return result;
}

module.exports = { validateIntake };

// ─── CLI entry point ──────────────────────────────────────────────────────────

if (require.main === module) {
  const stagingDir = process.argv[2];
  const clientName = process.argv[3] ?? path.basename(stagingDir ?? 'unknown');
  if (!stagingDir) {
    console.error('Usage: node scaffold/validate-intake.js <staging-dir> [client-name]');
    process.exit(1);
  }
  validateIntake(stagingDir, clientName)
    .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(r.valid ? 0 : 1); })
    .catch(e => { console.error('Error:', e.message); process.exit(2); });
}
