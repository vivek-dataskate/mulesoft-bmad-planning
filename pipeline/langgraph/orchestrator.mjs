#!/usr/bin/env node
// Node 18: langgraph-checkpoint's bundled uuid uses bare `crypto` global (browser-style).
// Polyfill before any LangGraph import so the reference resolves.
import { webcrypto } from 'crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
/**
 * DataSkate Scout Pipeline — LangGraph + OpenRouter Orchestrator
 *
 * Replaces the claude-CLI-subprocess approach in pipeline/scout/orchestrate.js with:
 *   - OpenRouter for LLM calls (vendor independent — swap models via OPENROUTER_MODELS in openrouter.mjs)
 *   - LangGraph StateGraph for sequential agent orchestration + checkpointing
 *   - Orchestrator owns output file writes (agents call write_output tool → JSON returned → we write disk)
 *     This eliminates the "Write tool not called" failure mode in the claude-CLI approach.
 *
 * Key advantage over orchestrate.js:
 *   hawk/mira never wrote output because they'd exit after "presenting" without calling Write tool.
 *   Here, the agent MUST call write_output to finish the tool loop — no ambiguity.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-... node pipeline/langgraph/orchestrator.mjs --client peerless --pipeline
 *   OPENROUTER_API_KEY=sk-or-... node pipeline/langgraph/orchestrator.mjs --client peerless --agent hawk
 *   node pipeline/langgraph/orchestrator.mjs --client peerless --status
 *
 * Phase plan:
 *   Phase 1 (now):    OpenRouter + LangGraph replaces claude CLI subprocess
 *   Phase 2 (later):  Extract each agent into a versioned npm package
 *   Phase 3 (later):  Add conditional edges, parallel nodes, branching
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

import { buildScoutGraph } from './graph.mjs';
import { archiveScopingFiles } from './post-hooks.mjs';
import { ScoutMcpClient } from './mcp/client.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

// ── CLI argument parsing ────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const get     = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const hasFlag = (flag) => args.includes(flag);

const clientArg    = get('--client');
const agentArg     = get('--agent');     // single-agent run: --agent hawk
const pipelineMode = hasFlag('--pipeline');
const retryMode    = hasFlag('--retry-failed');  // re-run only agents in failedAgents
const statusMode   = hasFlag('--status');

if (!clientArg) {
  console.error('Usage: orchestrator.mjs --client <slug> [--pipeline | --retry-failed | --agent <slug> | --status]');
  process.exit(1);
}

// ── Checkpoint ─────────────────────────────────────────────────────────────────

const RUN_DIR         = path.join(ROOT, 'projects', clientArg, 'scoping/run');
const CHECKPOINT_PATH = path.join(RUN_DIR, '.langgraph-checkpoint.json');

function loadCheckpoint() {
  if (!fs.existsSync(CHECKPOINT_PATH)) return null;
  return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
}

function saveCheckpoint(state) {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify({
    completedAgents:  state.completedAgents,
    failedAgents:     state.failedAgents || [],
    runningTotalUsd:  state.runningTotalUsd,
    updatedAt:        new Date().toISOString(),
  }, null, 2));

}

// ── Status mode ─────────────────────────────────────────────────────────────

if (statusMode) {
  const cp = loadCheckpoint();
  if (!cp) { console.log(`No checkpoint found for ${clientArg}`); process.exit(0); }
  console.log(`\nClient:    ${clientArg}`);
  console.log(`Budget:    $${cp.runningTotalUsd?.toFixed(2)}`);
  console.log(`Completed: ${cp.completedAgents.join(', ') || 'none'}`);
  console.log(`Failed:    ${cp.failedAgents.join(', ')    || 'none'}`);
  console.log(`Updated:   ${cp.updatedAt}`);
  process.exit(0);
}

// ── Pipeline / agent run ─────────────────────────────────────────────────────

if (!pipelineMode && !retryMode && !agentArg) {
  console.error('Specify --pipeline, --retry-failed, or --agent <slug>');
  process.exit(1);
}

const checkpoint    = loadCheckpoint() || {};
const alreadyDone   = checkpoint.completedAgents || [];
const previousFailed = checkpoint.failedAgents   || [];

// --retry-failed: keep completed, treat failed as pending (don't pass them as completedAgents)
// --pipeline:     run all agents not in completedAgents (including previously failed)
// --agent hawk:   single-agent run regardless of state
const onlyAgents = agentArg ? [agentArg] : null;

console.log(`\n▶ DataSkate Scout — LangGraph + OpenRouter`);
console.log(`  Client: ${clientArg} | Completed: ${alreadyDone.join(', ') || 'none'} | Failed: ${previousFailed.join(', ') || 'none'}\n`);

const mcpClient = new ScoutMcpClient(clientArg);
await mcpClient.start();

const app = buildScoutGraph({ onlyAgents, mcpClient });

const initialState = {
  client:          clientArg,
  slug:            clientArg,
  completedAgents: alreadyDone,      // graph nodes skip these automatically
  failedAgents:    [],               // reset per run — graph re-evaluates
  runningTotalUsd: checkpoint.runningTotalUsd || 0,
  errors:          [],
  lastResult:      null,
};

const config = { configurable: { thread_id: clientArg } };

try {
  const finalState = await app.invoke(initialState, config);
  await mcpClient.stop();

  saveCheckpoint(finalState);

  const allDone   = finalState.completedAgents;
  const allFailed = finalState.failedAgents || [];

  console.log(`\n✓ Pipeline run complete`);
  console.log(`  Completed: ${allDone.join(', ')   || 'none'}`);
  console.log(`  Failed:    ${allFailed.join(', ') || 'none'}`);
  console.log(`  Total cost: $${finalState.runningTotalUsd.toFixed(4)}`);
  if (finalState.errors.length > 0) {
    console.log(`  Errors: ${finalState.errors.join(' | ')}`);
  }
  if (allFailed.length > 0) {
    console.log(`\n  Re-run failed agents with: --retry-failed`);
  }

  if (pipelineMode && allFailed.length === 0) archiveScopingFiles(clientArg);
} catch (err) {
  await mcpClient.stop();
  console.error(`\n✗ Pipeline failed: ${err.message}`);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
}
