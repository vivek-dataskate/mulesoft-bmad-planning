/**
 * Flo multi-step runner — 2 focused sub-agents + deterministic pricing.
 *
 * Architecture:
 *   - Orchestrator reads flo-stage.json ONCE and injects it (no read_stage MCP calls inside)
 *   - flo-flows  (sonnet, $0.45): flow consolidation, P0 synthesis, flags, pricing judgment
 *   - flo-portfolio (sonnet, $0.30): portfolio opportunities from corporate stack — runs in PARALLEL
 *   - Orchestrator merges both + computes numeric pricing (zero LLM cost)
 *
 * Each sub-agent is autonomous: injected context → write_output.
 * flo-flows and flo-portfolio are independent — both only need stage data → run in PARALLEL.
 *
 * Cost max: $0.75 (vs $0.75 kill on $0.55 ceiling)
 */
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAgent, runSubStep, readStage } from '../agent-runner.mjs';
import { subagentCache } from './subagent-cache.mjs';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');

const FLOWS_PROMPT = `\
You are flo-flows. Consolidate integration flows and pricing judgment for the DataSkate Scout pipeline.

STAGE_DATA:
{STAGE_JSON}

OUTPUT — call write_output with exactly:
{
  "confirmedFlows": [
    {
      "id": "UC1", "name": "short name", "source": "System", "target": "System",
      "entity": "Lead|Customer|Contract|Job|...",
      "direction": "source-to-target|bidirectional",
      "trigger": "event|polling|scheduled", "frequency": "10-min|daily|real-time|...",
      "complexity": "high|medium|low",
      "description": "1-sentence description"
    }
  ],
  "potentialFlows": [
    {
      "id": "PF1", "name": "...", "source": "...", "target": "...", "entity": "...",
      "rationale": "why potential not confirmed",
      "scopeBoundary": "operating-brand",
      "sourceTag": "inferred: reverse of UC1 | inferred: scope-adjacent system from sage transcript"
    }
  ],
  "p0Blockers": [
    {
      "title": "...", "clientAction": "plain English — no jargon",
      "body": "architect detail", "system": "slug", "severity": "p0|p1|p2"
    }
  ],
  "pricing": {
    "recommendedModel": "IaaS|ImplementationOnly",
    "recommendedModelRationale": "2-4 sentences grounded in THIS client's signals",
    "edgeCases": [],
    "proposalCaveat": null
  },
  "flags": {
    "salesforceDetected": true,
    "computerEaseDetected": false,
    "idpDetected": false
  },
  "downstreamLoadList": {
    "playbooks": ["mulesoft/playbooks/salesforce/salesforce_playbook.json"],
    "canonicalModels": ["mulesoft/canonical-models/{vertical}/canonical-*.yaml"],
    "connectorKeys": ["salesforce", "computerease"]
  }
}

RULES:
- confirmedFlows: start from STAGE_DATA.rex.confirmedFlows (gold standard, already verified).
  Cross-check against STAGE_DATA.sage.confirmedFlows — add any sage flow not in rex.
  Apply NO-COMBINE: each system instance = one flow. Split merged flows.
  complexity: high = bidirectional/3+ systems/on-prem/PII; medium = unidirectional/scheduled; low = simple webhook.
- potentialFlows: scope-ADJACENT only (same project, more of it). NOT portfolio (different entity/sibling).
  Each entry needs scopeBoundary="operating-brand" and sourceTag.
- p0Blockers: take from STAGE_DATA.rex.p0Blockers. De-duplicate. Bundle same-vendor calls.
  Every entry needs all 3 fields: title, clientAction (plain English), body (technical).
- pricing.recommendedModel: IaaS is default. ImplementationOnly ONLY if client has in-house MuleSoft dev.
  Check STAGE_DATA.sage.signals for IT staff / developer signals.
- flags: set salesforceDetected=true if Salesforce appears in any confirmedFlow.
- downstreamLoadList: list what Quinn/Petra will need (playbook paths, connector keys).
- Cap search_knowledge at 3 calls — most data comes from injected stage.
- Call write_output once when done.`;

const PORTFOLIO_PROMPT = `\
You are flo-portfolio. Generate portfolio integration opportunities from the corporate stack and system inventory.
These entries go in the corporate brief ONLY — never in the proposal or intake form.

STAGE_DATA:
{STAGE_JSON}

OUTPUT — call write_output with exactly:
{
  "portfolioOpportunities": [
    {
      "id": "PO-001",
      "source": "rex-uncovered-system|sibling-template|legacy-boltOn|sponsor-portco|strategic-partnership",
      "title": "short name — what would be integrated",
      "systems": ["source", "target"],
      "entity": "Customer|Lead|PO|Invoice|...",
      "atEntity": "operating brand | sibling name | portco name",
      "atEntitySlug": "kebab-case-slug",
      "referenceUcId": "UC1 or null",
      "rationale": "1-2 sentences — why this is a portfolio opportunity",
      "regionalAdaptation": "1 sentence or null",
      "whenToEngage": "what signal to wait for",
      "sourceUrl": null,
      "proposalExclusion": true,
      "intakeExclusion": true
    }
  ],
  "portfolioOpportunitiesTruncatedNote": null
}

RULES — five sources, check each:
A. rex-uncovered-system (≤6): systems in STAGE_DATA.rex.systemProfiles[] that no confirmedFlow touches.
   Generate "future engagement at same client" entries.
B. sibling-template (≤8): STAGE_DATA.drew.siblingBrands[] where tierAResearched=true and fastPathTriggered=false.
   Use applicableUseCases[].applicable=true entries for UC matching.
   One entry per applicable UC per Tier-A sibling. Include regionalAdaptation from transferNote.
   Fallback if drew is absent/skipped: STAGE_DATA.vera.corporateStack.operatingPlatform.siblingBrands[] (seed data only, no UC detail).
C. legacy-boltOn (≤4): STAGE_DATA.vera.corporateStack.operatingBrand.legacyBoltOns[] where note says "separate brand" (not absorbed).
D. sponsor-portco (≤4): STAGE_DATA.vera.corporateStackEnrichment.financialSponsor.portfolioCompanies[] in adjacent industries.
E. strategic-partnership (≤3): STAGE_DATA.vera.corporateStack.strategicPartnerships[] where integrationImpact names a system not in confirmedFlows.

PROMOTION TEST: would the buyer reading the proposal say "we didn't ask for any of that"? YES = correct portfolio bucket.
Every entry: proposalExclusion=true, intakeExclusion=true (ALWAYS — no exceptions).
Total cap: 25 entries. Set portfolioOpportunitiesTruncatedNote if exceeded.
If vera.corporateStack.ownership="independent" and all rex systems are in confirmedFlows: write portfolioOpportunities=[].
Cap search_knowledge at 2 calls — all data comes from injected stage.
Call write_output once when done.`;

export async function runFlo({ agentDef, clientSlug, mcpClient }) {
  // Read stage data ONCE — inject into both sub-agents
  const stageData = await readStage(mcpClient, 'flo');

  const stageJson = JSON.stringify(stageData, null, 2);

  const cache = subagentCache(clientSlug, 'flo');

  // Both sub-agents only need stage data — run in PARALLEL
  console.log(`    [flo] flo-flows ‖ flo-portfolio (parallel)`);
  const [p1, p2] = await Promise.all([
    cache.runOrLoad('flo-flows', () => runSubStep({
      agentSlug: 'flo', name: 'flo-flows', model: 'extractor',
      prompt: FLOWS_PROMPT.replace('{STAGE_JSON}', stageJson),
      ceiling: 0.20, agentDef, clientSlug, mcpClient,
      forceSingleTurn: true,
    }), 'flo-flows (haiku, $0.20)'),
    cache.runOrLoad('flo-portfolio', () => runSubStep({
      agentSlug: 'flo', name: 'flo-portfolio', model: 'extractor',
      prompt: PORTFOLIO_PROMPT.replace('{STAGE_JSON}', stageJson),
      ceiling: 0.15, agentDef, clientSlug, mcpClient,
      forceSingleTurn: true,
    }), 'flo-portfolio (haiku, $0.15)'),
  ]);

  const flows     = (p1.output && Object.keys(p1.output).length > 0) ? p1.output : {};
  const portfolio = (p2.output && Object.keys(p2.output).length > 0) ? p2.output : {};
  const totalCost = p1.cost + p2.cost;

  const flo = {
    status:      'complete',
    client:      clientSlug,
    generatedAt: new Date().toISOString(),
    confirmedFlows:    flows.confirmedFlows    || [],
    potentialFlows:    flows.potentialFlows    || [],
    p0Blockers:        flows.p0Blockers        || [],
    pricing:           flows.pricing           || { recommendedModel: 'IaaS' },
    flags:             flows.flags             || {},
    downstreamLoadList: flows.downstreamLoadList || {},
    portfolioOpportunities: portfolio.portfolioOpportunities || [],
    portfolioOpportunitiesTruncatedNote: portfolio.portfolioOpportunitiesTruncatedNote || null,
  };

  // Write flo-decisions.json — post-hooks aggregateDecisions() reads this
  const decisionsPath = path.join(ROOT, 'projects', clientSlug, 'scoping', 'run', 'flo-decisions.json');
  const decisions = [
    {
      id: 'FD-001',
      type: 'pricing',
      decision: `Recommended ${flo.pricing?.recommendedModel || 'IaaS'} — ${flo.confirmedFlows.length} confirmed flows`,
      rationale: flo.pricing?.recommendedModelRationale || 'IaaS default',
      evidence: `confirmedFlows.length = ${flo.confirmedFlows.length}`,
    },
    ...flo.confirmedFlows.map((f, i) => ({
      id: `FD-${String(i + 2).padStart(3, '0')}`,
      type: 'flow-classification',
      decision: `Confirmed flow ${f.id}: ${f.source || f.systems?.[0]} → ${f.target || f.systems?.[1]} (${f.entity})`,
      rationale: 'Confirmed by flo-flows sub-agent from rex + sage cross-check',
      evidence: f.id,
    })),
  ];
  try {
    fs.mkdirSync(path.dirname(decisionsPath), { recursive: true });
    fs.writeFileSync(decisionsPath, JSON.stringify({ decisions, generatedAt: new Date().toISOString() }, null, 2));
  } catch (_) {}

  cache.clearIfAllSucceeded([p1, p2].filter(Boolean));
  const hasContent = flo.confirmedFlows.length > 0;
  return { cost: totalCost, killed: !hasContent, output: hasContent ? flo : null };
}
