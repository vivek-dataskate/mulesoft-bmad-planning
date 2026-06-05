/**
 * Agentic loop for a single pipeline agent via OpenRouter + MCP knowledge server.
 *
 * Tool routing:
 *   write_output  — handled locally (orchestrator owns disk writes)
 *   everything else (search_knowledge, read_stage, read_resource) → mcpClient
 *
 * Pattern: tool-use loop until agent calls write_output or hits budget ceiling.
 */
import { createClient, modelId, computeCost } from './openrouter.mjs';

// Validate agentSlug before embedding in the instruction string (D5: prompt injection guard)
// Slug always comes from pipeline.json registry, but assert it here as a defence-in-depth measure.
const SAFE_SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/i;
function assertSafeSlug(slug) {
  if (!slug || !SAFE_SLUG_RE.test(slug))
    throw new Error(`Unsafe agent slug "${slug}" — must be alphanumeric with hyphens/underscores only`);
  return slug;
}

const HEADLESS_INSTRUCTION = (agentSlug, ceiling) => {
  assertSafeSlug(agentSlug);
  return `\
Execute your complete workflow now in HEADLESS/PIPELINE mode. Follow every step.

HARD COST CEILING: $${ceiling.toFixed(2)} total for this run. Be concise — long reasoning burns budget.

TOOLS AVAILABLE:
  read_stage({ agent_slug: "${agentSlug}" })
    Your ONLY agent-specific data source. Start here. Contains pre-staged client context.

  search_knowledge({ query: "...", top_k: 5 })
    Semantic search over the knowledge corpus: planning context, field knowledge,
    playbooks, canonical models, design standards, patterns, agent refs.
    Use this for ANY domain question — do not try to read large files directly.

  read_resource({ name: "..." })
    Small structured refs. Available: pricing-model, competitors, psychology-profiles,
    proposal-structure, connector-names, reference-network, client-registry,
    intake-layout, pricing-model-doc.

  lookup_connectors({ keys: ["salesforce", "netsuite"] })
    Look up specific connector entries from the registry by key — auth type, authOptions,
    configTemplate, gotchas. Use AFTER you identify which systems are in scope.

  read_client_artifact({ name: "..." })
    Read a generated client content file. Available: proposal-content, intake-content,
    integration-deck-content, corporate-brief-content. (Mira uses this for auditing.)

  list_scoping_files()
    List readable text files in the client scoping directory. (Sage uses this first.)

  read_scoping_file({ filename: "transcript.txt" })
    Read a specific text file from the client scoping directory. (Sage only.)

  write_output({ content: { ...complete JSON... } })
    Call ONCE when all steps are complete. Must contain fully populated JSON.

DO NOT attempt to read vera.json, flo.json, hawk.json, or any raw agent output files directly.
SKIP any "CONVERSATIONAL REVIEW", "Wait for user response", or "present to user" steps.

MANDATORY FINAL STEP: Call write_output with your complete ${agentSlug}.json as the
"content" value — every field filled in, not a skeleton. Do NOT call write_output early.`;
};

const WRITE_OUTPUT_SCHEMA = {
  type:     'function',
  function: {
    name:        'write_output',
    description: 'Write your complete final output JSON. Call exactly once when all workflow steps are complete.',
    parameters:  {
      type:       'object',
      properties: {
        content: { type: 'object', description: 'The complete output JSON (e.g. hawk.json, petra.json).' },
      },
      required: ['content'],
    },
  },
};

/**
 * Run one agent via OpenRouter with MCP-backed tool calls.
 *
 * @param {object} params
 * @param {object} params.agentDef        Agent entry from pipeline.json
 * @param {string} params.clientSlug      e.g. "peerless"
 * @param {string} params.systemPrompt    TOML file contents (or focused sub-step prompt)
 * @param {string} params.outputPath      Resolved absolute path for output file
 * @param {number} params.ceiling         Budget ceiling in USD
 * @param {object} params.mcpClient       ScoutMcpClient instance
 * @param {string} [params.userInstruction] Override the default HEADLESS_INSTRUCTION
 * @param {boolean} [params.forceSingleTurn] Strip all MCP tools and force write_output on turn 1.
 *   Use for sub-agents whose full context is injected in the system prompt (e.g. sage sub-steps).
 *   Eliminates multi-turn re-sends, guarantees single API call, keeps cost within tight ceilings.
 * @returns {{ cost, killed, output }}
 */
export async function runAgent({ agentDef, clientSlug, systemPrompt, outputPath, ceiling, mcpClient, userInstruction, forceSingleTurn = false, maxTokens = 8192 }) {
  const client = createClient();

  // forceSingleTurn: only expose write_output — no MCP tools, model must call it immediately.
  const toolSchemas = forceSingleTurn
    ? [WRITE_OUTPUT_SCHEMA]
    : [...mcpClient.getToolSchemas(), WRITE_OUTPUT_SCHEMA];

  const messages = [
    {
      role: 'system',
      content: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    },
    { role: 'user', content: userInstruction || HEADLESS_INSTRUCTION(agentDef.slug, ceiling) },
  ];

  let totalCost     = 0;
  let killed        = false;
  let pendingOutput = null;
  const MAX_TURNS   = forceSingleTurn ? 1 : 20;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // Budget warning (multi-turn mode only)
    if (!forceSingleTurn && totalCost > ceiling * 0.75) {
      messages.push({
        role:    'user',
        content: `BUDGET WARNING: $${totalCost.toFixed(4)} of $${ceiling} used. ` +
                 `Call write_output NOW with best available output. Fill missing fields with null.`,
      });
    }
    const response = await client.chat.completions.create({
      model:       modelId(agentDef.model || 'sonnet'),
      messages,
      tools:       toolSchemas,
      tool_choice: forceSingleTurn ? { type: 'function', function: { name: 'write_output' } } : 'auto',
      temperature: 0,
      max_tokens:  maxTokens,
    });

    const msg   = response.choices[0].message;
    const usage = response.usage || {};
    totalCost  += computeCost(usage, agentDef.model || 'sonnet');
    if (usage.cache_read_input_tokens) {
      console.log(`    [cache] ${usage.cache_read_input_tokens} tokens from cache (turn ${turn + 1})`);
    }
    messages.push(msg);

    if (totalCost > ceiling) {
      killed = true;
      console.error(`  ✗ ${agentDef.name} KILLED at $${totalCost.toFixed(4)} — exceeded $${ceiling}`);
      break;
    }

    if (!msg.tool_calls || msg.tool_calls.length === 0) break;

    let wroteOutput = false;

    for (const toolCall of msg.tool_calls) {
      const name    = toolCall.function.name;
      const rawArgs = toolCall.function.arguments;
      const args    = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : rawArgs;

      let result;

      if (name === 'write_output') {
        pendingOutput = (args.content !== undefined) ? args.content : args;
        const len = JSON.stringify(pendingOutput).length;
        const isEmpty = !pendingOutput || (typeof pendingOutput === 'object' && Object.keys(pendingOutput).length === 0);

        if (isEmpty) {
          result = `write_output received an empty object. Call write_output again with the complete ${agentDef.slug}.json — every field populated.`;
          pendingOutput = null;
        } else {
          result = `Output captured (${len} chars). Orchestrator will write to ${outputPath}`;
          wroteOutput = true;
        }
      } else {
        // Route all other tools to MCP server
        result = await mcpClient.callTool(name, args);
      }

      messages.push({
        role:        'tool',
        tool_call_id: toolCall.id,
        content:     typeof result === 'string' ? result : JSON.stringify(result),
      });
    }

    if (wroteOutput) break;
  }

  // Gemini Flash (analyst/scribe/checker/researcher) sometimes returns JSON as plain text
  // instead of calling write_output, even with tool_choice forcing. Extract it as fallback.
  if (pendingOutput === null && messages.length > 2) {
    const lastMsg = messages[messages.length - 1];
    const text = typeof lastMsg.content === 'string' ? lastMsg.content
      : Array.isArray(lastMsg.content) ? lastMsg.content.map(c => c.text || '').join('') : '';
    if (text) {
      try {
        const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        const raw = codeBlock ? codeBlock[1] : text.match(/(\{[\s\S]*\})/)?.[1];
        if (raw) {
          const parsed = JSON.parse(raw.trim());
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
            console.log(`    [${agentDef.slug}] text-fallback: extracted JSON from text response (${JSON.stringify(parsed).length} chars)`);
            pendingOutput = parsed;
          }
        }
      } catch (_) {}
    }
  }

  return { cost: totalCost, killed, output: pendingOutput };
}

// Default instruction for sub-steps that inject all data — avoids spurious read_stage calls.
// Runners with custom behaviour (ivy, mira, quinn, sage) override via userInstruction.
const DEFAULT_SUB_INSTRUCTION =
  `Execute your task. Cap search_knowledge as instructed. Call write_output once when done. Fill missing fields with null.`;

/**
 * Run one sub-step within a multi-step runner.
 * Thin wrapper around runAgent for split-agent patterns.
 *
 * @param {object} params
 * @param {string} params.agentSlug     e.g. 'vera' — used in console prefix
 * @param {string} params.name          Sub-step name, e.g. 'vera-profile'
 * @param {string} params.model         Model tier: 'haiku' | 'sonnet' | 'opus'
 * @param {string} params.prompt        System prompt for this sub-step
 * @param {number} params.ceiling       Budget ceiling in USD
 * @param {object} params.agentDef      Agent entry from pipeline.json
 * @param {string} params.clientSlug    e.g. "peerless"
 * @param {object} params.mcpClient     ScoutMcpClient instance
 * @param {string} [params.userInstruction]  Override (defaults to DEFAULT_SUB_INSTRUCTION)
 */
export async function runSubStep({
  agentSlug, name, model, prompt, ceiling, agentDef, clientSlug, mcpClient,
  userInstruction, forceSingleTurn = false, maxTokens = 8192,
}) {
  const stepDef = { ...agentDef, name, model };
  console.log(`    [${agentSlug}] ${name} (${model}, $${ceiling})`);
  return runAgent({
    agentDef: stepDef, clientSlug,
    systemPrompt: prompt,
    outputPath: null, ceiling, mcpClient,
    userInstruction: userInstruction ?? DEFAULT_SUB_INSTRUCTION,
    forceSingleTurn, maxTokens,
  });
}

/**
 * Read stage data for an agent via MCP.
 * Centralises the try/catch + JSON-parse pattern used by every runner.
 *
 * @param {object} mcpClient    ScoutMcpClient instance
 * @param {string} agentSlug   e.g. 'vera'
 * @returns {object}           Parsed stage object, or {} on any error
 */
export async function readStage(mcpClient, agentSlug) {
  try {
    const raw = await mcpClient.callTool('read_stage', { agent_slug: agentSlug });
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch { return {}; }
}
