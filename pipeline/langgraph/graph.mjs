/**
 * Scout pipeline as a LangGraph StateGraph.
 *
 * Each agent is a node. The graph is sequential: sage → vera → rex → ... → mira → END.
 * Completed agents are tracked in state.completedAgents — nodes skip themselves if already done.
 * This enables resume-from-checkpoint across sessions by loading existing pipeline-state.json.
 *
 * Why LangGraph here:
 *   - State is typed and accumulated cleanly across nodes
 *   - MemorySaver gives within-session checkpointing; swap to FileSaver for cross-session
 *   - Conditional edges allow budget-stop and branching without rewriting the loop
 *   - Adding a new agent = addNode + addEdge, nothing else changes
 */
import { StateGraph, MemorySaver, START, END } from '@langchain/langgraph';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';

import { PipelineState } from './state.mjs';
import { runSage } from './agents/sage-runner.mjs';
import { runVera } from './agents/vera-runner.mjs';
import { runDrew } from './agents/drew-runner.mjs';
import { runRex } from './agents/rex-runner.mjs';
import { runFlo } from './agents/flo-runner.mjs';
import { runHawk } from './agents/hawk-runner.mjs';
import { runPetra } from './agents/petra-runner.mjs';
import { runQuinn } from './agents/quinn-runner.mjs';
import { runIvy  } from './agents/ivy-runner.mjs';
import { runMira } from './agents/mira-runner.mjs';
import { runSol  } from './agents/sol-runner.mjs';
import { runUniversalHooks, runAgentHooks, archiveScopingFiles } from './post-hooks.mjs';
import { buildAndWriteStage } from './stage-assembler.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

// Ceiling for monolith fallback path only (agents not matched to a dedicated runner below)
const DEFAULT_CEILING = 0.50;

function makePipelineJson() {
  return require(`${ROOT}/pipeline/scout/pipeline.json`);
}

function hasRealContent(output) {
  if (!output || typeof output !== 'object') return false;
  const keys = Object.keys(output);
  if (keys.length === 0) return false;
  // Reject bare error stubs: {"status":"invalid"} or {"status":"complete","client":"..."} with ≤2 keys
  if (keys.length <= 2 && keys.every(k => ['status','client','reason'].includes(k))) return false;
  return true;
}

/**
 * Build a node function for one agent.
 * mcpClient is started once in orchestrator.mjs and shared across all nodes.
 */
function makeAgentNode(agentDef, mcpClient) {
  return async (state) => {
    if (state.completedAgents.includes(agentDef.slug)) {
      console.log(`  ✓ ${agentDef.name} — already complete`);
      return {};
    }

    const outputFile   = agentDef.outputFile.replace('{client}', state.client);
    const outputPath   = path.resolve(ROOT, 'projects', state.client, outputFile.replace(`projects/${state.client}/`, ''));
    const ceiling      = DEFAULT_CEILING;

    // Build the stage file for this agent from prior agent outputs.
    // Split-runners (vera, rex, ivy, flo, hawk, petra, quinn, mira) read stage/files themselves.
    // Monolithic agents (sage) receive it via the read_stage MCP tool.
    try {
      const stagePath = buildAndWriteStage(agentDef.slug, state.client, state.completedAgents);
      console.log(`    [stage] ${path.basename(stagePath)} written`);
    } catch (e) {
      console.log(`    [stage] WARNING: stage build failed for ${agentDef.slug} — ${e.message}`);
    }

    // Pre-Sage: transcribe recordings + extract text from docs so Sage reads .txt only
    if (agentDef.slug === 'sage') {
      const scopingDir = path.join(ROOT, 'projects', state.client, 'scoping');
      const transcribeScript = path.join(ROOT, 'pipeline/scripts/transcribe-recordings.js');
      if (fs.existsSync(transcribeScript) && process.env.GEMINI_API_KEY) {
        const r = spawnSync(process.execPath, [transcribeScript, '--dir', scopingDir],
          { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: 300_000 }); // 5 min max
        if (r.status === 0) console.log(`    [pre-sage] recordings transcribed`);
        else console.log(`    [pre-sage] transcription skipped/failed (${(r.stderr || '').slice(0, 120)})`);
      } else if (!process.env.GEMINI_API_KEY) {
        console.log(`    [pre-sage] GEMINI_API_KEY not set — transcription skipped`);
      }
    }

    const splitLabels = {
      vera: 'multi-step $1.85', drew: 'validate+fan-out $0.85', rex: 'multi-step $0.65', flo: 'multi-step $0.75',
      ivy: '5-agent 4-wave $0.35', hawk: 'multi-step $1.15', petra: 'multi-step $1.75',
      quinn: '12-agent parallel $0.65', sol: '5-agent parallel $1.00', mira: '4-agent parallel $1.20',
    };
    const ceilingLabel = splitLabels[agentDef.slug] || `ceiling $${ceiling}`;
    console.log(`  ▶ ${agentDef.name} (${agentDef.model || 'sonnet'}, ${ceilingLabel})`);

    const dispatchMap = {
      sage:  runSage,  vera:  runVera,  drew: runDrew,  rex:   runRex,
      ivy:   runIvy,   flo:   runFlo,   hawk: runHawk,  petra: runPetra,
      quinn: runQuinn, sol:   runSol,   mira: runMira,
    };
    const runner = dispatchMap[agentDef.slug];
    if (!runner) throw new Error(`No dedicated runner for agent: ${agentDef.slug}. Add a runner in pipeline/langgraph/agents/.`);
    const result = await runner({ agentDef, clientSlug: state.client, mcpClient });

    const succeeded = !result.killed && hasRealContent(result.output);
    console.log(`  ${succeeded ? '✓' : '✗'} ${agentDef.name} — $${result.cost.toFixed(4)} — ${result.killed ? 'KILLED' : succeeded ? 'ok' : 'empty output'}`);

    if (!succeeded) {
      const reason = result.killed
        ? `failed or produced no usable output ($${result.cost.toFixed(4)})`
        : `produced empty output`;
      throw new Error(`PIPELINE_ABORT: ${agentDef.name} (${agentDef.slug}) ${reason}. Fix the agent then re-run.`);
    }

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(result.output, null, 2));
    console.log(`    → wrote ${outputPath}`);
    runUniversalHooks(state.client, agentDef.slug);
    runAgentHooks(state.client, agentDef.slug);

    return {
      completedAgents: [agentDef.slug],
      failedAgents:    [],
      runningTotalUsd: result.cost,
      lastResult:      { slug: agentDef.slug, cost: result.cost, killed: false, wrote: true },
      errors:          [],
    };
  };
}

/**
 * Build and compile the scout StateGraph.
 *
 * @param {object} opts
 * @param {string[]} opts.onlyAgents   If set, run only these slugs
 * @param {object}  opts.mcpClient     ScoutMcpClient (already started)
 * @returns compiled LangGraph app
 */
export function buildScoutGraph({ onlyAgents, mcpClient } = {}) {
  const pipeline = makePipelineJson();
  // Exclude parked agents always. Exclude delivery-phase agents from full --pipeline runs
  // (they run standalone via --agent sol after the proposal is accepted).
  const agents   = pipeline.agents.filter(a => a.status !== 'parked' && (onlyAgents || a.phase !== 'delivery'));
  const filtered = onlyAgents ? agents.filter(a => onlyAgents.includes(a.slug)) : agents;

  if (!filtered.length) {
    throw new Error(
      onlyAgents
        ? `No agents matched --agent filter [${onlyAgents.join(', ')}]. Check slug spelling.`
        : 'Pipeline has no active agents (all are parked).'
    );
  }

  const graph = new StateGraph(PipelineState);

  for (const agent of filtered) {
    graph.addNode(agent.slug, makeAgentNode(agent, mcpClient));
  }

  graph.addEdge(START, filtered[0].slug);
  for (let i = 0; i < filtered.length - 1; i++) {
    graph.addEdge(filtered[i].slug, filtered[i + 1].slug);
  }
  graph.addEdge(filtered[filtered.length - 1].slug, END);

  return graph.compile({ checkpointer: new MemorySaver() });
}
