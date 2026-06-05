/**
 * Rex multi-step runner — 2 focused sub-agents replacing the monolith.
 *
 * Architecture:
 *   - Orchestrator reads stage data ONCE and injects it (eliminates read_stage MCP calls)
 *   - rex-systems (sonnet, $0.30): per-system connector/auth/gotcha research
 *   - rex-blockers (sonnet, $0.35): P0 synthesis, flow confirmation, potential flows
 *   - Sequential: blockers need system profiles
 *
 * Each sub-agent is autonomous: injected context → search_knowledge → write_output.
 * No cross-agent file reads. No read_stage calls inside sub-agents.
 *
 * Cost max: $0.65 (vs $0.50 kill on $0.35 ceiling for monolith)
 */
import { runAgent, runSubStep, readStage } from '../agent-runner.mjs';
import { subagentCache } from './subagent-cache.mjs';

const SYSTEMS_PROMPT = `\
You are rex-systems. Research each integration system's connector, auth method, and known MuleSoft gotchas.

STAGE_DATA:
{STAGE_JSON}

OUTPUT — call write_output with exactly:
{
  "systemProfiles": [
    {
      "system": "DisplayName",
      "slug": "system-slug",
      "connectorType": "http|jms|db|sftp|custom|unknown",
      "authMethod": "oauth2-client-credentials|basic|api-key|jwt|ps256-jwt|unknown",
      "apiStyle": "rest|soap|jdbc|sftp|unknown",
      "sandboxAvailable": true,
      "onPremise": false,
      "knownQuirks": ["string"],
      "p0Risk": "description or null",
      "prerequisite": "what client must confirm before go-live or null"
    }
  ],
  "detectedSystems": ["slug1", "slug2"]
}

RULES:
- Extract systems from confirmedFlows[] and potentialFlows[] in the stage data.
- For each system: search_knowledge("connector auth {system name} MuleSoft") — 1 call per system.
- Apply these known P0 flags immediately (no search needed):
    NetSuite → authMethod=ps256-jwt, p0Risk="REST API requires PS256 JWT via Nimbus JOSE — not native MuleSoft JWT Module"
    SAP → p0Risk="Requires SAP JCo connector license — confirm before engagement"
    ComputerEase/Deltek → onPremise=true, sandboxAvailable=false, p0Risk="CE Live Service relay required; Deltek vendor support ticket needed"
    Oracle DB → p0Risk="ojdbc11.jar cannot be declared in pom.xml — manual classpath required"
    Salesforce → knownQuirks=["SOQL OFFSET breaks >2000 records","State/Country Picklists feature-flag","CurrencyIsoCode multi-currency only"]
    ServiceNow → knownQuirks=["OAuth2 breaks metadata resolution in Anypoint Studio"]
- Cap search_knowledge at 1 call per system (max 6 total).
- Call write_output once when done.`;

const BLOCKERS_PROMPT = `\
You are rex-blockers. Synthesize P0/P1/P2 blockers, confirm flows, and identify gaps.

STAGE_DATA:
{STAGE_JSON}

SYSTEM_PROFILES:
{SYSTEMS_JSON}

OUTPUT — call write_output with exactly:
{
  "confirmedFlows": [
    {
      "id": "UC1", "source": "SystemA", "target": "SystemB",
      "entity": "EntityType", "direction": "source-to-target|bidirectional",
      "trigger": "event|polling|scheduled", "frequency": "string", "description": "string"
    }
  ],
  "potentialFlows": [
    { "id": "PF1", "source": "...", "target": "...", "entity": "...", "rationale": "..." }
  ],
  "p0Blockers": [
    {
      "title": "short label",
      "clientAction": "plain English — what client must do, no jargon",
      "body": "technical architect detail",
      "system": "slug", "severity": "p0"
    }
  ],
  "internalFlags": [
    { "id": "IF1", "flag": "description", "severity": "p1|p2", "system": "slug" }
  ],
  "playbookStubs": [
    { "system": "slug", "action": "create|update", "knownQuirks": [] }
  ],
  "connectorRegistryStubs": [
    { "system": "slug", "authType": "...", "connectorType": "..." }
  ],
  "status": "complete",
  "generatedAt": "ISO-date"
}

RULES:
- confirmedFlows: take from stage confirmedFlows[]. Apply NO-COMBINE: each system instance = one flow.
- p0Blockers: every system with p0Risk in SYSTEM_PROFILES becomes a p0Blocker entry.
  clientAction must be plain English a non-technical person can act on.
- potentialFlows: 1-3 flows not in confirmedFlows that are likely gaps (e.g. Account sync, Contact sync).
- internalFlags: p1 = architect must decide; p2 = note for future engagement.
- playbookStubs: one entry per detected system — action=create if new, update if existing.
- search_knowledge("integration patterns {systems}") ONLY if genuinely unsure about a flow structure.
  Cap at 2 search_knowledge calls total.
- Call write_output once when done.`;

export async function runRex({ agentDef, clientSlug, mcpClient }) {
  // Read stage data ONCE — inject into both sub-agents (no read_stage MCP calls inside)
  const stageData = await readStage(mcpClient, 'rex');

  const stageJson = JSON.stringify(stageData, null, 2);
  let totalCost = 0;

  const cache = subagentCache(clientSlug, 'rex');

  // Step 1: rex-systems
  const p1 = await cache.runOrLoad('rex-systems', () => runSubStep({
    agentSlug: 'rex', name: 'rex-systems', model: 'researcher',
    prompt: SYSTEMS_PROMPT.replace('{STAGE_JSON}', stageJson),
    ceiling: 0.30, agentDef, clientSlug, mcpClient,
  }), 'rex-systems (sonnet, $0.30)');
  totalCost += p1.cost;
  const systems = (p1.output && Object.keys(p1.output).length > 0) ? p1.output
    : { systemProfiles: [], detectedSystems: [] };

  // Step 2: rex-blockers (needs system profiles)
  const p2 = await cache.runOrLoad('rex-blockers', () => runSubStep({
    agentSlug: 'rex', name: 'rex-blockers', model: 'analyst',
    prompt: BLOCKERS_PROMPT
      .replace('{STAGE_JSON}',   stageJson)
      .replace('{SYSTEMS_JSON}', JSON.stringify(systems, null, 2)),
    ceiling: 0.35, agentDef, clientSlug, mcpClient,
  }), 'rex-blockers (sonnet, $0.35)');
  totalCost += p2.cost;

  cache.clearIfAllSucceeded([p1, p2].filter(Boolean));
  const blockers = (p2.output && Object.keys(p2.output).length > 0) ? p2.output : {};

  // Merge
  const rex = {
    status:      'complete',
    client:      clientSlug,
    generatedAt: new Date().toISOString(),
    systemProfiles:         systems.systemProfiles         || [],
    detectedSystems:        systems.detectedSystems        || [],
    confirmedFlows:         blockers.confirmedFlows         || [],
    potentialFlows:         blockers.potentialFlows         || [],
    p0Blockers:             blockers.p0Blockers             || [],
    internalFlags:          blockers.internalFlags          || [],
    playbookStubs:          blockers.playbookStubs          || [],
    connectorRegistryStubs: blockers.connectorRegistryStubs || [],
  };

  const hasContent = rex.systemProfiles.length > 0 || rex.confirmedFlows.length > 0;
  return { cost: totalCost, killed: !hasContent, output: hasContent ? rex : null };
}
