/**
 * Petra multi-step runner — 4 focused sub-agents + deterministic merge.
 *
 * Architecture:
 *   - Orchestrator reads petra-stage.json, hawk.json, company_context.json ONCE and injects
 *   - petra-context     (sonnet, $0.45): meta, strategicContext, challenge, solution
 *   - petra-journey     (sonnet, $0.50): roi, journey stages 1-3, fomo, buyerProfile, nextSteps, portfolioContext
 *   - petra-deliverables(sonnet, $0.40): flows, outcomes, included, oos, assumptions, timeline
 *   - petra-deck        (sonnet, $0.40): integrationDeckContent
 *   - All 4 are independent → run in PARALLEL
 *   - Orchestrator merges all 4 into petra.json (proposalContent = context+journey+deliverables)
 *
 * Cost max: $1.75 (vs $1.35 2-agent approach that killed petra-proposal at $0.91)
 * Stage note: hawk is NOT in petra-stage.json — runner reads it directly from disk.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { runAgent, runSubStep, readStage } from '../agent-runner.mjs';
import { subagentCache } from './subagent-cache.mjs';
import { BANNED_PHRASES_INLINE } from '../constants.mjs';

const require = createRequire(import.meta.url);
const ROOT    = path.resolve(fileURLToPath(import.meta.url), '../../../..');

// ─── Sub-agent prompts ────────────────────────────────────────────────────────

const CONTEXT_PROMPT = `\
You are petra-context. Write the opening sections of the DataSkate proposal for this client.
Every fact must trace to STAGE_DATA or HAWK_DATA — no hallucination.

${BANNED_PHRASES_INLINE}

STAGE_DATA (petra-stage.json):
{STAGE_JSON}

HAWK_DATA (hawk.json):
{HAWK_JSON}

OUTPUT — call write_output with exactly:
{
  "meta": {
    "clientName": "string",
    "clientSlug": "string",
    "title": "The Connected {ClientName}: Your AI Integration Roadmap",
    "subtitle": "one-line — AI journey angle, not 'connecting systems'",
    "date": "ISO date string",
    "architect": "STAGE_DATA._project.architect",
    "architectEmail": "STAGE_DATA._project.architectEmail",
    "flowCount": N,
    "addressedTo": { "name": "string or null", "title": "string or null", "source": "namedBuyers | ivy-inferred | project-fallback" }
  },
  "strategicContext": {
    "summary": "2-3 sentence paragraph: Origin + Corporate Stack + sharpest deal-urgency multiplier",
    "operatingBrandPositioning": "1 sentence from corporateProfile section 2 — what client does",
    "lattice": "1-2 sentences: operating brand → platform → sponsor",
    "whyNow": "2-3 sentences quoting verbatim from STAGE_DATA.vera.dealUrgencyMultipliers[] top 2",
    "sourceUrls": ["top 3-5 URLs from corporateProfile"]
  },
  "challenge": {
    "lead": "HAWK_DATA.challengeLead VERBATIM — do not rephrase",
    "cards": [
      { "label": "short label", "text": "1-2 sentences — specific pain from STAGE_DATA.sage.quotes" }
    ]
  },
  "solution": {
    "lead": "1-2 sentences — MuleSoft managed layer. Contrast native connectors gap (retry, DLQ, ops layer). No jargon.",
    "diagramNodes": { "sources": ["system"], "targets": ["system"] },
    "diagramCaption": "DataSkate-managed MuleSoft layer — no code changes required in {systemA} or {systemB}",
    "mermaid": "Mermaid graph LR — sources left → MuleSoft (green: fill:#F0FFF4,stroke:#38A169,color:#276749) → targets right. Short system names. Edge labels for flow counts."
  }
}

RULES:
- meta.flowCount: count STAGE_DATA.flo.confirmedFlows[]. Must be exact.
- meta.addressedTo: STAGE_DATA.vera.namedBuyers.economicBuyer.name → STAGE_DATA.ivy.economicBuyer.inferredTitle → STAGE_DATA._project.primaryContact. Record source field.
- strategicContext: from STAGE_DATA.vera.corporateProfile + dealUrgencyMultipliers. null if corporateProfile is null.
- challenge.lead: HAWK_DATA.challengeLead VERBATIM (copy exactly — this is the psychology-adapted opening).
- challenge.cards: 2-3 cards. Each names a specific pain from sage.quotes (their exact words or direct paraphrase). No generic language.
- solution.mermaid: derive systems from STAGE_DATA.flo.confirmedFlows[]. MuleSoft center node is green.
- SELF-CHECK: every sentence — "Could this appear in a different company's proposal?" If yes, rewrite.
- Cap search_knowledge at 1 call.
Call write_output once when done.`;

const JOURNEY_PROMPT = `\
You are petra-journey. Write the ROI, three-stage journey, FOMO, buyer profile, and close sections of the DataSkate proposal.
Hawk decides what to say; you apply it exactly. No hallucination.

${BANNED_PHRASES_INLINE}

STAGE_DATA (petra-stage.json):
{STAGE_JSON}

HAWK_DATA (hawk.json):
{HAWK_JSON}

AGENTFORCE_MODE: {AGENTFORCE_MODE}

OUTPUT — call write_output with exactly:
{
  "roi": {
    "headline": "The business case for moving now",
    "body": "2-3 sentences — specific numbers from STAGE_DATA.sage.businessContext. Name industry median from STAGE_DATA.vera if available. No generic language.",
    "stats": [
      { "value": "specific metric", "label": "what it means" }
    ]
  },
  "journey": {
    "headline": "HAWK_DATA.journeyHeadline OR 'From Connected Data to AgentForce — Your Three-Stage Roadmap' if agentforceMode=true",
    "stage1": { "label": "Stage 1", "year": "Year 1", "headline": "string", "items": ["bullet"] },
    "stage2": { "label": "Stage 2", "year": "Year 2", "headline": "string", "items": ["bullet"] },
    "stage3": { "label": "Stage 3", "year": "Year 3", "headline": "string", "items": ["bullet"] },
    "closingLine": "HAWK_DATA.closingLine VERBATIM"
  },
  "fomo": [
    {
      "name": "HAWK_DATA.fomoOrdered[N].displayName",
      "revenue": "string",
      "relevanceTier": "string",
      "savings": "string",
      "whatTheyBuilt": "string",
      "fomoAngle": "HAWK_DATA.fomoOrdered[N].fomoAngleAdapted VERBATIM",
      "analogyNote": "string or null",
      "aiAgentDescription": "string or null",
      "sourceUrl": "string or null",
      "sourceLabel": "string or null"
    }
  ],
  "buyerProfile": {
    "primary": "STAGE_DATA.ivy.psychologyProfile.primaryProfile",
    "secondary": "STAGE_DATA.ivy.psychologyProfile.secondaryProfile or null",
    "signals": [],
    "contentModifiersApplied": ["key: what changed — one per hawk adaptation"],
    "closingLineVariant": "STAGE_DATA.ivy.psychologyProfile.primaryProfile"
  },
  "fomoThoughtStarters": ["copy STAGE_DATA.vera.aiJourney.thoughtStarters[] verbatim if present, else []"],
  "nextSteps": [
    { "title": "Fill Out Intake Form", "body": "string" },
    { "title": "Schedule Technical Deep Dive", "body": "string — name STAGE_DATA._project.architect" },
    { "title": "Review Integration Deck", "body": "string" },
    { "title": "Align on Scope and SOW", "body": "string" }
  ],
  "about": null,
  "portfolioContext": {
    "platformName": "HAWK_DATA.portfolioTemplateFraming.platformName",
    "sponsorName": "HAWK_DATA.portfolioTemplateFraming.sponsorName",
    "siblingCount": N,
    "templateAngle": "HAWK_DATA.portfolioTemplateFraming.templateAngle VERBATIM",
    "executiveAngle": "HAWK_DATA.portfolioTemplateFraming.executiveSponsorAngle VERBATIM",
    "siblings": [{ "name": "string", "website": "string", "integrationSignal": "string" }],
    "greenfieldFlag": true
  }
}

RULES:
- journey.closingLine: HAWK_DATA.closingLine VERBATIM (copy exactly).
- fomo[]: top 2-4 from HAWK_DATA.fomoOrdered[]. Use displayName as name. fomoAngle = fomoAngleAdapted VERBATIM.
- AGENTFORCE (if agentforceMode=true):
    journey.stage3.headline = "AgentForce — Activated"
    Stage 3 bullets: each names an exact Salesforce object + what the AgentForce agent specifically does using data Stage 1 creates.
    Never: "AgentForce automates your workflows." Name the exact action + exact object + exact trigger.
    Stage 3 AI use case must NOT duplicate any fomo[].fomoAngle AI use case (different capability).
- STAGE 3 DATA GROUNDING: each Stage 3 bullet maps to a confirmedFlow in STAGE_DATA.flo. Name the source system. Answer "Which {entity} is {condition} right now?" for a named role.
- portfolioContext: from HAWK_DATA.portfolioTemplateFraming + STAGE_DATA.vera.corporateStack siblings. null if portfolioTemplateFraming is null.
- roi.stats: 3 stats. Source from STAGE_DATA.sage.quotes + STAGE_DATA.vera data. Never fabricate a number.
- Cap search_knowledge at 1 call.
Call write_output once when done.`;

const DELIVERABLES_PROMPT = `\
You are petra-deliverables. Write the structured deliverables sections of the DataSkate proposal.
These are the concrete, legally-meaningful sections — flows, timeline, inclusions, exclusions, assumptions.

${BANNED_PHRASES_INLINE}

STAGE_DATA (petra-stage.json):
{STAGE_JSON}

HAWK_DATA (hawk.json — for solution diagramNodes):
{HAWK_JSON}

OUTPUT — call write_output with exactly:
{
  "flows": [
    {
      "num": "UC1",
      "name": "short name",
      "route": "SystemA → MuleSoft → SystemB",
      "value": "1-2 sentence business outcome — NOT technical detail. Name the person/team who benefits."
    }
  ],
  "outcomes": [
    { "icon": "string", "title": "string", "body": "string" }
  ],
  "included": [
    { "title": "string", "detail": "string" }
  ],
  "oos": [
    { "title": "string", "detail": "string" }
  ],
  "assumptions": [
    { "assumption": "string", "owner": "string", "when": "string", "p0": true }
  ],
  "timeline": [
    { "label": "string", "weeks": "string", "tasks": ["string"] }
  ],
  "pricing": true
}

RULES:
- flows[]: derive from STAGE_DATA.flo.confirmedFlows[]. One entry per confirmed flow. route = source → MuleSoft → target. value = business outcome, not technical detail.
- outcomes[]: exactly 3 cards. Last card MUST be "AI-Ready Foundation" with exact body from STAGE_DATA._proposalStructure.
- included[]: standard items from STAGE_DATA._proposalStructure adjusted for flow count. Always include: integration flows (N count), MuleSoft hosting, field mapping, error handling, UAT support, 30-day hypercare.
- oos[]: 4+ items. Derive from STAGE_DATA.rex.p0Blockers systemPrerequisites[] + standard exclusions from STAGE_DATA._proposalStructure. Be client-specific.
- assumptions[]: from STAGE_DATA.flo.p0Blockers[]. p0=true for items blocking build start. clientAction = plain English non-technical person can act on.
  P0 COVERAGE: if confirmedFlows includes external SaaS needing credentials (Salesforce, NetSuite, HubSpot, Shopify, SAP) and p0Blockers is empty → synthesize at least 1 p0=true assumption naming the system + exact pre-work.
- timeline[]: 4 phases in order:
    1. "Discovery & Field Mapping" (Wks 1-2): tasks name actual systems and flows
    2. "Build & Unit Test" (Wks 3-N — N based on flow count: 1-2 flows = Wk 5, 3-4 flows = Wk 7, 5+ flows = Wk 9)
    3. "UAT & Integration Testing" (2 wks after build)
    4. "Go Live & Handoff" (1 wk after UAT)
  Tasks name actual systems from confirmedFlows.
- pricing: always true (template reads flo.json directly for numbers).
- Cap search_knowledge at 1 call.
Call write_output once when done.`;

const DECK_PROMPT = `\
You are petra-deck. Write the integrationDeckContent JSON for the DataSkate architect pitch kit.
This is the architect's reference document — grounded in specific systems and peer data.

HAWK_DATA (talking points, openings — copy verbatim):
{HAWK_JSON}

DECK_CONTEXT (company, peers, FOMO, project info):
{DECK_JSON}

OUTPUT — call write_output with exactly:
{
  "meta": {
    "clientName": "string",
    "clientSlug": "string",
    "date": "ISO date",
    "architect": "DECK_CONTEXT._project.architect",
    "architectEmail": "DECK_CONTEXT._project.architectEmail",
    "location": "DECK_CONTEXT.vera.company.hqLocation",
    "revenue": "DECK_CONTEXT.vera.company.revenueEstimate",
    "industry": "DECK_CONTEXT.vera.company.industry",
    "flowCount": N,
    "searchRadius": "50 miles",
    "revenueBracket": "DECK_CONTEXT.vera.company.revenueBracket",
    "subtitle": "one-line architect framing"
  },
  "snapshot": {
    "description": "DECK_CONTEXT.vera.company.snapshot verbatim",
    "systems": ["system names from DECK_CONTEXT.flo.confirmedFlows"],
    "painPoints": ["specific pain from sage — max 5. NOT generic."]
  },
  "talkingPoints": "HAWK_DATA.talkingPoints[] VERBATIM",
  "nearbyPeers": "DECK_CONTEXT.vera.nearbyPeers[] VERBATIM or []",
  "competitorFOMO": "DECK_CONTEXT.vera.competitorFOMO[] VERBATIM or []",
  "openingLines": "HAWK_DATA.openingLines[] VERBATIM",
  "aiJourneyNarrative": "3-4 sentences referencing actual system names and industry. Phase 1: what connecting these systems unlocks. Phase 2: automation possible. Phase 3: agentic endgame for their specific role/industry. No placeholder language.",
  "portfolioContext": {
    "platformName": "HAWK_DATA.portfolioTemplateFraming.platformName",
    "sponsorName": "HAWK_DATA.portfolioTemplateFraming.sponsorName",
    "siblingCount": N,
    "siblingsWithIntegrationFootprint": N,
    "templateAngle": "HAWK_DATA.portfolioTemplateFraming.templateAngle VERBATIM",
    "executiveAngle": "HAWK_DATA.portfolioTemplateFraming.executiveSponsorAngle VERBATIM",
    "siblings": [{ "name": "string", "website": "string", "integrationSignal": "string", "sourceUrl": "string or null" }],
    "greenfieldFlag": true
  },
  "aeTalkingPoint": "HAWK_DATA.aeTalkingPoint VERBATIM"
}

RULES:
- talkingPoints[], openingLines[], aeTalkingPoint: VERBATIM from HAWK_DATA — do NOT rephrase a single word.
- nearbyPeers[], competitorFOMO[]: VERBATIM from DECK_CONTEXT — if null/empty use [].
- flowCount: count DECK_CONTEXT.flo.confirmedFlows[].
- snapshot.painPoints: specific from scoping (max 5). "Ashley re-keys every closed deal" NOT "manual data entry."
- aiJourneyNarrative: name actual systems from confirmedFlows. 3-4 sentences. No boilerplate.
- portfolioContext: from HAWK_DATA.portfolioTemplateFraming + DECK_CONTEXT.vera siblings. null if portfolioTemplateFraming is null.
- Cap search_knowledge at 1 call.
Call write_output once when done.`;

// ─── Runner ───────────────────────────────────────────────────────────────────

export async function runPetra({ agentDef, clientSlug, mcpClient }) {
  // Read petra-stage.json via MCP (already built by stage-assembler before this node runs)
  const stageData = await readStage(mcpClient, 'petra');

  // Read hawk.json from disk (not in stage)
  let hawkData = {};
  try {
    const hawkPath = path.join(ROOT, 'projects', clientSlug, 'scoping/run/hawk.json');
    if (fs.existsSync(hawkPath)) hawkData = JSON.parse(fs.readFileSync(hawkPath, 'utf8'));
  } catch (_) {}

  // Read company_context.json for deck-only fields (nearbyPeers, competitorFOMO — not in stage)
  let deckContext = {};
  try {
    const ctxPath = path.join(ROOT, 'projects', clientSlug, 'company_context.json');
    if (fs.existsSync(ctxPath)) {
      const raw = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
      deckContext = {
        vera: {
          company:        stageData.vera?.company        || {},
          nearbyPeers:    raw.nearbyPeers                || [],
          competitorFOMO: raw.competitorFOMO              || [],
          aiJourney:      stageData.vera?.aiJourney       || {},
        },
        _project: stageData._project || {},
        flo: { confirmedFlows: stageData.flo?.confirmedFlows || [] },
        sage: { quotes: stageData.sage?.quotes || {}, businessContext: stageData.sage?.businessContext || {} },
      };
    }
  } catch (_) {}

  const agentforceMode = !!(stageData.flo?.flags?.salesforceDetected);
  const stageJson  = JSON.stringify(stageData,   null, 2);
  // Slim stage: strip _proposalStructure for sub-agents that don't need it (~10KB saved per agent)
  const { _proposalStructure: _dropPropStructure, ...stageDataSlim } = stageData;
  const stageJsonSlim = JSON.stringify(stageDataSlim, null, 2);
  const hawkJson   = JSON.stringify(hawkData,    null, 2);
  const deckJson   = JSON.stringify(deckContext, null, 2);

  const cache = subagentCache(clientSlug, 'petra');

  // All 4 sub-agents are independent → run in PARALLEL
  console.log(`    [petra] petra-context ‖ petra-journey ‖ petra-deliverables ‖ petra-deck (parallel)`);
  const [p1, p2, p3, p4] = await Promise.all([
    cache.runOrLoad('petra-context', () => runSubStep({
      agentSlug: 'petra', name: 'petra-context', model: 'writer',
      prompt: CONTEXT_PROMPT
        .replace('{STAGE_JSON}', stageJsonSlim)
        .replace('{HAWK_JSON}',  hawkJson),
      ceiling: 0.45, agentDef, clientSlug, mcpClient,
    }), 'petra-context (sonnet, $0.45)'),
    cache.runOrLoad('petra-journey', () => runSubStep({
      agentSlug: 'petra', name: 'petra-journey', model: 'writer',
      prompt: JOURNEY_PROMPT
        .replace('{STAGE_JSON}',       stageJsonSlim)
        .replace('{HAWK_JSON}',        hawkJson)
        .replace('{AGENTFORCE_MODE}',  String(agentforceMode)),
      ceiling: 0.50, agentDef, clientSlug, mcpClient,
    }), 'petra-journey (sonnet, $0.50)'),
    cache.runOrLoad('petra-deliverables', () => runSubStep({
      agentSlug: 'petra', name: 'petra-deliverables', model: 'writer',
      prompt: DELIVERABLES_PROMPT
        .replace('{STAGE_JSON}', stageJson)
        .replace('{HAWK_JSON}',  hawkJson),
      ceiling: 0.40, agentDef, clientSlug, mcpClient,
    }), 'petra-deliverables (sonnet, $0.40)'),
    cache.runOrLoad('petra-deck', () => runSubStep({
      agentSlug: 'petra', name: 'petra-deck', model: 'writer',
      prompt: DECK_PROMPT
        .replace('{HAWK_JSON}', hawkJson)
        .replace('{DECK_JSON}', deckJson),
      ceiling: 0.40, agentDef, clientSlug, mcpClient,
    }), 'petra-deck (sonnet, $0.40)'),
  ]);

  const context     = (p1.output && Object.keys(p1.output).length > 0) ? p1.output : {};
  const journey     = (p2.output && Object.keys(p2.output).length > 0) ? p2.output : {};
  const deliverables = (p3.output && Object.keys(p3.output).length > 0) ? p3.output : {};
  const deck        = (p4.output && Object.keys(p4.output).length > 0) ? p4.output : null;
  const totalCost   = p1.cost + p2.cost + p3.cost + p4.cost;

  // Assemble proposalContent from all 3 proposal sub-agents
  const proposalContent = {
    // From petra-context
    meta:            context.meta            || null,
    strategicContext: context.strategicContext || null,
    challenge:       context.challenge        || null,
    solution:        context.solution         || null,
    // From petra-journey
    roi:                  journey.roi                  || null,
    journey:              journey.journey              || null,
    fomo:                 journey.fomo                 || [],
    buyerProfile:         journey.buyerProfile         || null,
    fomoThoughtStarters:  journey.fomoThoughtStarters  || [],
    nextSteps:            journey.nextSteps            || [],
    about:                journey.about                || null,
    portfolioContext:     journey.portfolioContext      || null,
    // From petra-deliverables
    flows:       deliverables.flows       || [],
    outcomes:    deliverables.outcomes    || [],
    included:    deliverables.included    || [],
    oos:         deliverables.oos         || [],
    assumptions: deliverables.assumptions || [],
    timeline:    deliverables.timeline    || [],
    pricing:     true,
  };

  const petra = {
    status:                 'complete',
    client:                 clientSlug,
    generatedAt:            new Date().toISOString(),
    proposalContent:        proposalContent,
    integrationDeckContent: deck,
    profileApplied:         stageData.ivy?.psychologyProfile?.primaryProfileLabel || null,
    agentforceMode,
    aboutSectionIncluded:   false,
  };

  cache.clearIfAllSucceeded([p1, p2, p3, p4].filter(Boolean));
  const hasContent = !!(proposalContent.meta || deck?.meta);
  return { cost: totalCost, killed: !hasContent, output: hasContent ? petra : null };
}
