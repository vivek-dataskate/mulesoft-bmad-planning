/**
 * Mira multi-step runner — 5 parallel sub-agents + deterministic merge.
 *
 * Architecture:
 *   - Runner reads all 4 content JSON files from disk ONCE and injects them
 *   - Sub-agents run in PARALLEL:
 *       mira-proposal-sweep (haiku,  $0.15): proposal — banned phrases + naming + AgentForce (mechanical)
 *       mira-proposal-deep  (sonnet, $0.45): proposal — authenticity + psychology + strategic/portfolio (reasoning)
 *       mira-intake         (sonnet, $0.55): audit intake-content.json
 *       mira-deck           (sonnet, $0.50): audit integration-deck-content.json
 *       mira-brief          (sonnet, $0.55): audit corporate-brief-content.json (if present)
 *   - Proposal sub-agents output PATCHES ONLY (rewrites[] / escalations[]) — no full rewritten doc.
 *     Runner applies patches to original proposal → builds rewritten.
 *   - intake/deck/brief sub-agents output full rewritten doc (unchanged pattern).
 *   - Runner merges all outputs into mira.json with rewrittenContent embedded.
 *
 * Cost target: $1.05 total (proposal split saves ~$0.15 vs single sonnet)
 * Orchestrator post-hook applyMiraRewrites() extracts rewrittenContent → writes files → re-renders HTML
 * Agent boundary: sub-agents write ONLY via write_output → mira.json
 *                 content JSON files are written by orchestrate post-hook, NOT by Mira
 */
import { createRequire } from 'module';
import { fileURLToPath }  from 'url';
import path               from 'path';
import fs                 from 'fs';
import { runAgent, runSubStep, readStage } from '../agent-runner.mjs';
import { BANNED_PHRASES }                 from '../constants.mjs';
import { subagentCache }  from './subagent-cache.mjs';

const require = createRequire(import.meta.url);
const ROOT    = path.resolve(fileURLToPath(import.meta.url), '../../../..');

// ── Shared audit rules injected into every sub-agent prompt ──────────────────

const SHARED_AUDIT_RULES = `\
AUDIT STANCE: Read as the buyer — not as the author. Find everything that would make THIS specific buyer
(per IVY_PROFILE.primaryProfile) hesitate, confuse, or distrust the document. Rewrite — do not flag for later.

BANNED PHRASES SWEEP: Remove/rewrite every instance of: ${BANNED_PHRASES}.
Also remove competitor brand names from COMPETITORS_DATA.brandNames[].

AUTHENTICITY AUDIT: For each sentence, ask:
  (a) Is this fact traceable to the stage data or scoping transcripts?
  (b) Does this use the client's exact words where it should?
  (c) Could this sentence appear in a proposal for a different company?
  If any answer fails: rewrite using only verifiable facts from STAGE_DATA.

PSYCHOLOGY CONSISTENCY: Apply IVY_PROFILE.primaryProfile lens:
  operational-pragmatist → specific manual steps, not vision language
  roi-analytical → dollar/time anchors, quantified outcomes
  peer-comparison → company names and proximity
  visionary-strategic → AI agent capability, not the integration itself
  risk-averse-conservative → stability and support model

REWRITE PROTOCOL — AGENT BOUNDARY RULE:
  DO NOT write any files to disk. DO NOT run npm run build:html.
  Build the COMPLETE rewritten version of the document.
  If a document needs NO rewrites: set rewritten to null.
  Record every change: { field, original, rewritten, reason }.`;

// ── Sub-agent prompts ─────────────────────────────────────────────────────────

// Proposal is split into two parallel sub-agents that output PATCHES ONLY (no full rewritten doc).
// Runner applies patches to build rewritten.

const PROPOSAL_SWEEP_PROMPT = `\
You are mira-proposal-sweep. Do ONLY these mechanical scans on PROPOSAL_CONTENT.
Output rewrites[] patches only — do NOT output the full rewritten document.

STAGE_DATA (pre-staged Mira context):
{STAGE_JSON}

COMPETITORS_DATA:
{COMPETITORS_JSON}

PROPOSAL_CONTENT (current proposal-content.json):
{PROPOSAL_JSON}

YOUR THREE CHECKS:

1. BANNED PHRASES SWEEP — scan every string field in PROPOSAL_CONTENT.
   Remove or rewrite every instance of: ${BANNED_PHRASES}.
   Also remove any competitor brand names from COMPETITORS_DATA.brandNames[].
   For each instance found: output a rewrite patch with the corrected sentence.

2. NAMING RULES (fomoSection[] entries only):
   Each entry showing a real company name must have a non-empty sourceUrl.
   If real name shown but sourceUrl missing/empty → change company name to 'A {industry} company (anonymized)'.
   If first fomoSection[] entry ends up anonymized → add to escalations (cannot promote it).
   No competitor domains (workato.com, boomi.com, zapier.com, mulesoft.com) in any sourceUrl → remove.

3. AGENTFORCE CONSISTENCY — only run if STAGE_DATA.flo?.flags?.salesforceDetected = true:
   Stage 3 (journey/solution stage with "Agentic" or index 2) headline must reference "AgentForce" by name.
   Stage 3 bullet items must name specific Salesforce objects and specific AI agent actions — not generic categories.
   closingLine (at top level or in solution section) must reference "AgentForce activation".
   Rewrite any field that fails.

DO NOT check: authenticity, psychology, strategic context, portfolio context — those are handled by mira-proposal-deep.

OUTPUT — call write_output with exactly:
{
  "file": "proposal-content.json",
  "checkTypes": ["banned-phrase", "naming", "agentforce"],
  "rewrites": [
    { "field": "dot.path.here", "original": "...", "rewritten": "...", "reason": "..." }
  ],
  "escalations": [
    { "issue": "...", "field": "...", "resolution": "human required" }
  ]
}

Field path format: use dot notation with bracket indexes, e.g. "fomoSection[0].company" or "challenge.lead".
If no issues found: set rewrites to [] and escalations to [].
Call write_output exactly once.`;

const PROPOSAL_DEEP_PROMPT = `\
You are mira-proposal-deep. Do ONLY these reasoning-intensive checks on PROPOSAL_CONTENT.
Output rewrites[] patches only — do NOT output the full rewritten document.

STAGE_DATA (pre-staged Mira context):
{STAGE_JSON}

IVY_PROFILE (psychology profile for THIS buyer):
{IVY_JSON}

PROPOSAL_CONTENT (current proposal-content.json):
{PROPOSAL_JSON}

YOUR FOUR CHECKS:

1. AUTHENTICITY AUDIT

   FOMO ENTRIES — different sourcing rules (market research, NOT client-specific):
   FOMO entries describe what OTHER companies built. Their aiAgentDescription, savings figures,
   and outcome text describe that reference company's result — they are NOT expected to mention
   the client's systems. Do NOT flag FOMO entries as inauthentic because they lack client-specific
   details. FOMO sourcing follows a hierarchy: (1) competitor within 100 miles, (2) US-level
   company same market size + vertical, (3) related industry same pain. Generic industry language
   in aiAgentDescriptions is CORRECT — do not rewrite these.
   ONLY flag a FOMO entry if: (a) it claims a specific metric with no sourceUrl,
   OR (b) it is structurally identical to the CLIENT's own proposed flows (mirror-of-engagement risk).

   ROI STATS — verified external references are acceptable:
   ROI stats do NOT need to be traceable to the scoping transcript. A stat is valid if it cites
   a specific verifiable published source (McKinsey, Gartner, industry report, named case study).
   Only flag if: (a) no source is cited at all, OR (b) the stat misquotes its cited source.
   Do NOT remove stats solely because they don't appear in STAGE_DATA transcripts.

   ALL OTHER content (challenge cards, solution text, outcomes, pain quotes):
   (a) Is this fact traceable to STAGE_DATA (sage quotes, vera research, confirmed flows)?
   (b) Could this sentence appear in a proposal for a completely different company?
   If (a) fails or (b) is yes: rewrite using only verifiable facts from STAGE_DATA.
   Use the client's exact words and pain quotes from stage where possible.

2. PSYCHOLOGY CONSISTENCY — apply IVY_PROFILE.psychologyProfile.primaryProfile lens:
   challenge.lead: must open with the right hook for this profile:
     operational-pragmatist → specific manual steps / broken process
     roi-analytical → cost/time anchor up front
     peer-comparison → named peer company doing it already
     visionary-strategic → AI agent capability framing
     risk-averse-conservative → stability / support model framing
   challenge.cards[]: must use the client's own pain language from sage quotes in stage.
   fomoSection[]: ordered/framed per IVY_PROFILE.contentModifiers.fomoFraming lens?
   journey stages: is the right stage emphasized per IVY_PROFILE.contentModifiers.journeyFraming?
   closingLine: is IVY_PROFILE.contentModifiers.closingLineVariant applied exactly?
   Rewrite any misaligned field.

3. STRATEGIC CONTEXT — if PROPOSAL_CONTENT.strategicContext is non-null:
   summary: must reference operating brand, platform (if non-null), and at least one deal-urgency multiplier by name.
   whyNow: must contain 2+ verbatim deal-urgency multipliers from STAGE_DATA.dealUrgencyMultipliers[].
   If whyNow paraphrases instead of quoting verbatim: rewrite to verbatim.
   sourceUrls[]: flag obviously malformed paths (not https://, or localhost) → add to escalations.

4. PORTFOLIO CONTEXT — if PROPOSAL_CONTENT.portfolioContext is non-null:
   platformName, sponsorName, siblings[] must match STAGE_DATA corporate stack exactly.
   Every sibling.integrationSignal: real sourceUrl OR literal 'unknown — no public integration footprint found'.
   templateAngle must reference actual platformName and at least one named sibling (not generic 'sister brands').
   financialSponsor: null IS INTENTIONAL when the engagement is directly with the operating brand — do NOT escalate.
   executiveAngle MUST be absent when STAGE_DATA.corporateStack.financialSponsor is null. Remove it if present.
   Rewrite any drifted field; escalate missing portfolioContext when platform has 2+ siblings.

DO NOT check: banned phrases, naming rules, AgentForce — those are handled by mira-proposal-sweep.

OUTPUT — call write_output with exactly:
{
  "file": "proposal-content.json",
  "checkTypes": ["authenticity", "psychology", "strategic-context", "portfolio-context"],
  "rewrites": [
    { "field": "dot.path.here", "original": "...", "rewritten": "...", "reason": "..." }
  ],
  "escalations": [
    { "issue": "...", "field": "...", "resolution": "human required" }
  ]
}

Field path format: use dot notation with bracket indexes, e.g. "strategicContext.whyNow" or "fomoSection[1].headline".
If no issues found: set rewrites to [] and escalations to [].
Call write_output exactly once.`;

const INTAKE_PROMPT = `\
You are mira-intake. Audit intake-content.json for the DataSkate Scout pipeline.
ALL DATA IS PRE-INJECTED BELOW. Do NOT call read_stage, search_knowledge, or any MCP tool.

STAGE_DATA (slimmed — only what intake audit needs):
{STAGE_JSON}

INTAKE_CONTENT (current intake-content.json):
{INTAKE_JSON}

BANNED_PHRASES: ${BANNED_PHRASES}

INTAKE-SPECIFIC CHECKS:

1. BANNED PHRASES SWEEP on all string fields in INTAKE_CONTENT (bodyHtml, snapshot, journeyCard bodies, etc.).
   Rewrite every instance of a banned phrase.

2. AUTHENTICITY: bizContext.snapshot — does it use the client's exact pain quote from STAGE_DATA.painQuotes?
   Is it generic (could apply to any company)? If so: rewrite using client-specific facts.
   journeyCards[]: grounded in STAGE_DATA.confirmedFlows (named systems, specific actions, real flow IDs)?
   p0Blockers[].clientAction: plain English a non-technical person can act on? No jargon?

3. PSYCHOLOGY CONSISTENCY for bizContext.snapshot (apply STAGE_DATA.psychologyProfile.primaryProfile):
   operational-pragmatist → ends with specific manual steps that stop on go-live day
   visionary-strategic → ends with AI future the client described
   roi-analytical → includes a cost-or-time anchor
   risk-averse-conservative → ends with stability and support model

4. PORTFOLIO OPPORTUNITIES ROUTING (intake must NOT contain portfolio opportunities):
   Confirm no system or flow in INTAKE_CONTENT references a sibling brand, sub-rollup,
   sponsor portco, or strategic-partnership entity. Intake is for STAGE_DATA.engagementEntity ONLY.
   If any leak found: record high-severity rewrite removing the offending entry.

5. AGENTFORCE CONSISTENCY (only if STAGE_DATA.salesforceDetected = true):
   journeyCards[2] (Phase 3/Agentic) must reference AgentForce specifically.
   Body must name specific Salesforce objects Phase 1 builds.

OUTPUT — call write_output with exactly:
{
  "file": "intake-content.json",
  "checkTypes": ["banned-phrase", "authenticity", "psychology", "portfolio-routing", "agentforce"],
  "rewrites": [
    { "field": "dot.path.here", "original": "...", "rewritten": "...", "reason": "..." }
  ],
  "escalations": []
}

Field path format: dot notation with bracket indexes, e.g. "bizContext.snapshot" or "sections[2].bodyHtml".
If no issues found: set rewrites to [] and escalations to [].
Call write_output exactly once.`;

const DECK_PROMPT = `\
You are mira-deck. Audit integration-deck-content.json for the DataSkate Scout pipeline.
ALL DATA IS PRE-INJECTED BELOW. Do NOT call read_stage, search_knowledge, or any MCP tool.

STAGE_DATA (slimmed — confirmedFlows + salesforceDetected only):
{STAGE_JSON}

DECK_CONTENT (current integration-deck-content.json):
{DECK_JSON}

BANNED_PHRASES: ${BANNED_PHRASES}

INTEGRATION DECK-SPECIFIC CHECKS:

1. BANNED PHRASES SWEEP on all string fields in DECK_CONTENT.

2. AUTHENTICITY: Every slide — client systems named specifically (not "your systems")?
   Confirmed flow IDs (UC1, UC2, etc.) from STAGE_DATA.confirmedFlows referenced correctly?
   Outcome statements quantified (time saved, manual steps eliminated)?
   Generic slides that could apply to any company → rewrite with client-specific details.

3. MERMAID DIAGRAM (if solution.mermaid is present):
   Verify: sources left side, targets right side, MuleSoft node center (green: fill:#F0FFF4).
   System names must match STAGE_DATA.confirmedFlows[].systems exactly.
   If diagram is generic (no client systems named) → add escalation.

4. TIMELINE (if timeline section exists):
   Week counts consistent with STAGE_DATA.confirmedFlows length (4 flows → ~8 weeks standard)?
   Phase names realistic?

OUTPUT — call write_output with exactly:
{
  "file": "integration-deck-content.json",
  "checkTypes": ["banned-phrase", "authenticity", "mermaid", "timeline"],
  "rewrites": [
    { "field": "dot.path.here", "original": "...", "rewritten": "...", "reason": "..." }
  ],
  "escalations": []
}

Field path format: dot notation with bracket indexes, e.g. "solution.mermaid" or "slides[1].body".
If no issues found: set rewrites to [] and escalations to [].
Call write_output exactly once.`;

const BRIEF_PROMPT = `\
You are mira-brief. Audit corporate-brief-content.json for the DataSkate Scout pipeline.
ALL DATA IS PRE-INJECTED BELOW. Do NOT call read_stage, search_knowledge, or any MCP tool.

STAGE_DATA (slimmed — corporateStack + dealUrgencyMultipliers + hawk talking points + flo portfolioOpportunities):
{STAGE_JSON}

COMPETITORS_DATA:
{COMPETITORS_JSON}

BRIEF_CONTENT (current corporate-brief-content.json):
{BRIEF_JSON}

BANNED_PHRASES: ${BANNED_PHRASES}

CORPORATE BRIEF-SPECIFIC CHECKS (high stakes — first document the buyer reads):

1. BANNED PHRASES SWEEP on all string fields (brief is buyer-facing).

2. CORPORATE STACK ACCURACY — every field against STAGE_DATA source-of-truth:
   operatingBrand.name + website + linkedIn → match stage exactly
   leadership.{founders, CEO, etc.} → match stage exactly
   operatingPlatform: name, website, platformShape, regionalStrategy → match stage
   financialSponsor: name, thesisForClient → match stage
   siblingBrands[].name + website + integrationSignal → match stage
   dealUrgencyMultipliers[] → match stage verbatim
   publicStakeholders[] → every entry must have 'transcript' in its sources (no web-only)

3. SIBLING integrationSignal: each must be real sourceUrl OR literal:
   'unknown — no public integration footprint found'
   Any other unsourced sentence = fabrication → REWRITE to 'unknown'.

4. FORWARD LOOKING TALKING POINTS + INTEL THE BUYER LACKS:
   Every entry MUST have a sourceUrl. No sourceUrl → DROP the entry entirely (better lean than unsourced).

5. PORTFOLIO OPPORTUNITIES ROUTING:
   BRIEF_CONTENT.portfolioOpportunities must be present when STAGE_DATA.flo.portfolioOpportunities[] is non-empty.
   Every entry must have: proposalExclusion: true, intakeExclusion: true.
   If either flag is false → REWRITE to true.

6. PER-SIBLING DEPTH (Tier-A siblings with tierAResearched: true):
   Each must have: itLeader (or null note), valueProp (non-empty), itStack (or null note),
   namedCustomers (array), applicableUseCases (non-empty), integrationSignal, futureEngagementNote.
   Missing derivable fields (valueProp, applicableUseCases, integrationSignal, futureEngagementNote) → ESCALATE.

7. URL VERIFICATION: Every sourceUrl field — must be https:// public URL. No localhost/firebase-internal.
   (Mira does NOT fetch URLs in pipeline mode — flag only obviously malformed paths.)

8. PER-PERSON TALKING POINTS (if hawk.perPersonTalkingPoints[] in stage):
   Every person's name must exist in stage buyerMap.people[].
   economicBuyer role: must open with cost/payback/risk framing — not operational detail.
   No banned phrases in talking points.

OUTPUT — call write_output with exactly:
{
  "file": "corporate-brief-content.json",
  "checkTypes": ["banned-phrase", "corporate-stack", "sibling-signals", "talking-points", "portfolio-routing", "per-sibling-depth", "url-check"],
  "rewrites": [
    { "field": "dot.path.here", "original": "...", "rewritten": "...", "reason": "..." }
  ],
  "escalations": [
    { "issue": "...", "field": "...", "resolution": "human required" }
  ]
}

Field path format: dot notation with bracket indexes, e.g. "operatingBrand.name" or "siblingBrands[0].integrationSignal".
If no issues found: set rewrites to [] and escalations to [].
If BRIEF_CONTENT is null or empty: output { "file": "corporate-brief-content.json", "skipped": true, "rewrites": [], "escalations": [] }.
Call write_output exactly once.`;

// ── Patch applier (for proposal split — sweep+deep output patches only) ──────

function setByPath(obj, dotPath, value) {
  const parts = dotPath.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur == null || typeof cur !== 'object') return;
    cur = cur[k];
  }
  if (cur != null && typeof cur === 'object') {
    cur[parts[parts.length - 1]] = value;
  }
}

function applyPatches(original, rewrites) {
  if (!rewrites || rewrites.length === 0) return null;
  const result = JSON.parse(JSON.stringify(original));
  for (const rw of rewrites) {
    if (rw.field && rw.rewritten !== undefined) setByPath(result, rw.field, rw.rewritten);
  }
  return result;
}

// ALL data pre-injected — forbid MCP calls (agents cost 2-3x higher without this)
const MIRA_SUB_INSTRUCTION = `ALL DATA IS PRE-INJECTED in the system prompt above. Do NOT call read_stage, search_knowledge, or any MCP tool. Your ONLY allowed tool call is write_output — call it exactly once when done. Output patches (rewrites[]) and escalations[] only — do NOT include a rewritten field with the full document.`;

// ── Read content file safely ──────────────────────────────────────────────────

function readContentFile(projectDir, filename) {
  const p = path.join(projectDir, 'intake', filename);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

// ── Main runner ───────────────────────────────────────────────────────────────

export async function runMira({ agentDef, clientSlug, mcpClient }) {
  const projectDir = path.join(ROOT, 'projects', clientSlug);

  // Read stage data ONCE
  const stageData = await readStage(mcpClient, 'mira');

  // Read competitors from commons
  const competitorsData = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'commons', 'branding', 'competitors.json'), 'utf8')); }
    catch { return { brandNames: [] }; }
  })();

  // Read all 4 content files from disk (runner-owned reads — no MCP calls inside sub-agents)
  const proposalContent  = readContentFile(projectDir, 'proposal-content.json');
  const intakeContent    = readContentFile(projectDir, 'intake-content.json');
  const deckContent      = readContentFile(projectDir, 'integration-deck-content.json');
  const briefContent     = readContentFile(projectDir, 'corporate-brief-content.json');

  const stageJson      = JSON.stringify(stageData,            null, 2);
  const ivyJson        = JSON.stringify(stageData.ivy || {}, null, 2);
  const competitorsJson = JSON.stringify(competitorsData,     null, 2);

  const filesAudited = [
    proposalContent  && 'proposal-content.json',
    intakeContent    && 'intake-content.json',
    deckContent      && 'integration-deck-content.json',
    briefContent     && 'corporate-brief-content.json',
  ].filter(Boolean);

  // Pre-slice stage data per sub-agent — avoid injecting irrelevant large fields.
  // Key savings: corporateProfile (26k chars) and buyerMap.people (9.5k chars) dropped from agents that don't need them.
  const cc = stageData._companyContext || {};
  const cs = cc.corporateStack || {};

  const slimProposalSweep = JSON.stringify({
    salesforceDetected: stageData.flo?.flags?.salesforceDetected || false,
  }, null, 2);

  const slimProposalDeep = JSON.stringify({
    psychologyProfile:    stageData.ivy?.psychologyProfile,
    contentLayers:        stageData.ivy?.contentLayers,
    economicBuyer:        stageData.ivy?.economicBuyer,
    painQuotes:           stageData.sage?.quotes,
    dealUrgencyMultipliers: cc.dealUrgencyMultipliers,
    corporateStack: {
      operatingBrand:   cs.operatingBrand,
      financialSponsor: cs.financialSponsor,
      engagementEntity: cs.engagementEntity,
      operatingPlatform: { name: cs.operatingPlatform?.name, platformShape: cs.operatingPlatform?.platformShape },
    },
    portfolioTemplateFraming: stageData.hawk?.portfolioTemplateFraming,
    salesforceDetected: stageData.flo?.flags?.salesforceDetected || false,
  }, null, 2);

  const slimIntake = JSON.stringify({
    salesforceDetected:  stageData.flo?.flags?.salesforceDetected || false,
    confirmedFlows:      stageData.flo?.confirmedFlows,
    portfolioOpportunities: stageData.flo?.portfolioOpportunities,
    psychologyProfile:   stageData.ivy?.psychologyProfile,
    contentLayers:       stageData.ivy?.contentLayers,
    painQuotes:          stageData.sage?.quotes,
    engagementEntity:    cs.engagementEntity,
  }, null, 2);

  const slimDeck = JSON.stringify({
    confirmedFlows:     stageData.flo?.confirmedFlows,
    salesforceDetected: stageData.flo?.flags?.salesforceDetected || false,
  }, null, 2);

  const slimBrief = JSON.stringify({
    corporateStack:        cs,                           // needs full stack for accuracy checks
    dealUrgencyMultipliers: cc.dealUrgencyMultipliers,
    namedBuyers:           cc.namedBuyers,
    perPersonTalkingPoints: stageData.hawk?.perPersonTalkingPoints,
    portfolioOpportunities: stageData.flo?.portfolioOpportunities,
    buyerMapPeopleSummary: cc.buyerMap?.summary,         // summary only, not full people list
    // corporateProfile (26k chars) excluded — brief-content.json already has it
  }, null, 2);

  // Build sub-step configs.
  // ALL sub-agents are now patch-only (rewrites[] patches + no rewritten doc in output).
  // Deck switched to haiku — mostly structural/mechanical checks.
  const proposalJson = JSON.stringify(proposalContent, null, 2) || 'null';
  const STEPS = [
    {
      name: 'mira-proposal-sweep', model: 'auditor', ceiling: 0.15,
      file: 'proposal-content.json', patchOnly: true,
      prompt: PROPOSAL_SWEEP_PROMPT
        .replace('{STAGE_JSON}',       slimProposalSweep)
        .replace('{COMPETITORS_JSON}',  competitorsJson)
        .replace('{PROPOSAL_JSON}',     proposalJson),
      skip: !proposalContent,
    },
    {
      name: 'mira-proposal-deep', model: 'reviewer', ceiling: 0.45,
      file: 'proposal-content.json', patchOnly: true,
      prompt: PROPOSAL_DEEP_PROMPT
        .replace('{STAGE_JSON}',      slimProposalDeep)
        .replace('{IVY_JSON}',        ivyJson)
        .replace('{PROPOSAL_JSON}',   proposalJson),
      skip: !proposalContent,
    },
    {
      name: 'mira-intake', model: 'extractor', ceiling: 0.45,
      file: 'intake-content.json', patchOnly: true,
      prompt: INTAKE_PROMPT
        .replace('{STAGE_JSON}',  slimIntake)
        .replace('{INTAKE_JSON}', JSON.stringify(intakeContent, null, 2) || 'null'),
      skip: !intakeContent,
    },
    {
      name: 'mira-deck', model: 'auditor', ceiling: 0.20,
      file: 'integration-deck-content.json', patchOnly: true,
      prompt: DECK_PROMPT
        .replace('{STAGE_JSON}', slimDeck)
        .replace('{DECK_JSON}',  JSON.stringify(deckContent, null, 2) || 'null'),
      skip: !deckContent,
    },
    {
      name: 'mira-brief', model: 'extractor', ceiling: 0.65,
      file: 'corporate-brief-content.json', patchOnly: true,
      prompt: BRIEF_PROMPT
        .replace('{STAGE_JSON}',       slimBrief)
        .replace('{COMPETITORS_JSON}',  competitorsJson)
        .replace('{BRIEF_JSON}',        JSON.stringify(briefContent, null, 2) || 'null'),
      skip: false,
    },
  ];

  const activeSteps = STEPS.filter(s => !s.skip);
  const cache = subagentCache(clientSlug, 'mira');
  const cachedCount = cache.cachedCount(activeSteps.map(s => s.name));
  const pendingCount = activeSteps.length - cachedCount;
  console.log(`    [mira] ${activeSteps.length} sub-agents in PARALLEL [proposal:sweep(haiku)+deep(sonnet), intake, deck, brief] — ${cachedCount} cached, ${pendingCount} pending`);

  const results = await Promise.all(
    activeSteps.map(step => cache.runOrLoad(
      step.name,
      () => runSubStep({
        agentSlug: 'mira', name: step.name, model: step.model,
        prompt: step.prompt,
        ceiling: step.ceiling, agentDef, clientSlug, mcpClient,
        userInstruction: MIRA_SUB_INSTRUCTION,
        forceSingleTurn: true,
      }),
      step.name,
    ))
  );

  cache.clearIfAllSucceeded(results);

  const totalCost = results.reduce((sum, r) => sum + r.cost, 0);

  // Extract outputs — pair each result with its step definition
  const stepOutputs = activeSteps.map((step, i) => ({
    step,
    output: (results[i].output && Object.keys(results[i].output).length > 0) ? results[i].output : null,
  })).filter(s => s.output);

  // Merge audit findings across all sub-agents
  const allRewrites    = stepOutputs.flatMap(s => s.output.rewrites    || []);
  const allEscalations = stepOutputs.flatMap(s => s.output.escalations || []);

  // Per-file audit summary (merge same-file entries from proposal split)
  const auditsByFile = {};
  for (const { step, output } of stepOutputs) {
    if (output.skipped) continue;
    const key = step.file;
    if (!auditsByFile[key]) auditsByFile[key] = { file: key, checkTypes: [], rewrites: [] };
    auditsByFile[key].checkTypes.push(...(output.checkTypes || []));
    auditsByFile[key].rewrites.push(...(output.rewrites || []));
  }
  const audits = Object.values(auditsByFile);

  // All sub-agents are patch-only — apply rewrites[] patches to each original file.
  const patchesFor = (filename) => stepOutputs
    .filter(s => s.step.file === filename)
    .flatMap(s => s.output.rewrites || []);

  const rewrittenContent = {
    proposal:        applyPatches(proposalContent, patchesFor('proposal-content.json')),
    intake:          applyPatches(intakeContent,   patchesFor('intake-content.json')),
    integrationDeck: applyPatches(deckContent,     patchesFor('integration-deck-content.json')),
    corporateBrief:  applyPatches(briefContent,    patchesFor('corporate-brief-content.json')),
  };

  // Determine profile used
  const profileUsed = stageData?.ivy?.psychologyProfile?.primaryProfileLabel
    || stageData?.ivy?.psychologyProfile?.primaryProfile
    || 'unknown';

  const hasContent = stepOutputs.length > 0;

  const mira = {
    status:          'complete',
    client:          clientSlug,
    generatedAt:     new Date().toISOString(),
    profileUsed,
    filesAudited,
    audits,
    rewrittenContent,
    escalations:     allEscalations,
    totalRewrites:   allRewrites.length,
    totalEscalations: allEscalations.length,
  };

  return { cost: totalCost, killed: !hasContent, output: hasContent ? mira : null };
}
