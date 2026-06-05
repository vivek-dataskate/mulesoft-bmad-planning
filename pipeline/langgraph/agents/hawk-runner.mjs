/**
 * Hawk multi-step runner — 2 focused sub-agents + deterministic merge.
 *
 * Architecture:
 *   - Orchestrator reads hawk-stage.json + company_context.json ONCE and injects both
 *   - hawk-narrative (sonnet, $0.45): FOMO ordering/rewrite + narrative text pieces
 *   - hawk-tactics  (sonnet, $0.50): talking points, opening lines, portfolio framing, per-person TPs
 *   - Both only need injected data → run in PARALLEL
 *   - Orchestrator merges both + zero LLM cost
 *
 * Cost max: $1.15 (hawk-competitive conditional +$0.20; parallel wall-clock ≈ slower sub-agent)
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { runAgent, runSubStep, readStage } from '../agent-runner.mjs';
import { subagentCache } from './subagent-cache.mjs';

const require  = createRequire(import.meta.url);
const ROOT     = path.resolve(fileURLToPath(import.meta.url), '../../../..');

// Load profile lookup tables once at module init (deterministic — no LLM needed)
let _guidanceProfiles = null;
let _detectionProfiles = null;
function getProfileGuidance(profileId) {
  if (!_guidanceProfiles) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'commons/sales/psychology-profiles-guidance.json'), 'utf8'));
      _guidanceProfiles = raw.profiles || [];
    } catch (_) { _guidanceProfiles = []; }
  }
  return _guidanceProfiles.find(p => p.id === profileId) || null;
}
function getProfileDetection(profileId) {
  if (!_detectionProfiles) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'commons/sales/psychology-profiles-detection.json'), 'utf8'));
      _detectionProfiles = raw.profiles || [];
    } catch (_) { _detectionProfiles = []; }
  }
  return _detectionProfiles.find(p => p.id === profileId) || null;
}

const NARRATIVE_PROMPT = `\
You are hawk-narrative. Build the urgency narrative for the DataSkate Scout pipeline.

STAGE_DATA:
{STAGE_JSON}

CONTEXT_DATA (company_context.json — buyerMap + dealUrgencyMultipliers):
{CONTEXT_JSON}

OUTPUT — call write_output with exactly:
{
  "fomoOrdered": [
    {
      "name": "string",
      "displayName": "string",
      "relevanceTier": "string",
      "fomoAngleOriginal": "verbatim from vera.competitorFOMO[].fomoAngle",
      "fomoAngleAdapted": "rewritten for profile — same as original if no rewrite needed",
      "fomoAngleForSecondary": "rewrite for secondary profile, or null if no secondaryProfile",
      "savings": "string",
      "aiAgentDescription": "string or null",
      "sourceUrl": "string or null",
      "sourceLabel": "string or null"
    }
  ],
  "challengeLead": "1-2 sentences — verbatim primaryPainQuote anchor + profile framing applied",
  "closingLine": "verbatim line — contentModifiers variant, AgentForce override, or proposal default",
  "journeyHeadline": "callback to aspirationQuote or null",
  "costOfWaiting": {
    "figure": "$N or N hours",
    "basis": "1-sentence derivation citing the sage or vera field used",
    "sixMonthWindow": "same figure framed as 6-month cost of doing nothing"
  },
  "aeTalkingPoint": "For a {primaryProfileLabel} buyer, lead with: {fomoFraming first sentence}.",
  "competitorCounterpunch": {
    "likelyVendor": "vendor type or name",
    "theirRebuttal": "1-sentence — their strongest argument against DataSkate",
    "preemptiveLine": "1-sentence — embed in proposal to neutralize it",
    "embedIn": "challenge | solution | roi | journey | nextSteps"
  }
}

RULES:

FOMO ORDERING — sort CONTEXT_DATA.competitorFOMO[] by STAGE_DATA.ivy.psychologyProfile.socialProofAngle (now pre-computed in stage):
  'quantified-savings'  → largest savings figure first
  'peer-comparison'     → exact relevanceTier match first, then geo-proximity (same city > state > national)
  'proven-pattern'      → most overlap with this client's confirmedFlows
  'first-mover'         → most concrete AI action first
  'time-saved'          → largest hours/people recovered first
Write sorted list as fomoOrdered[].

FOMO ANGLE REWRITE — for each entry, apply STAGE_DATA.ivy.psychologyProfile.contentModifiers.fomoFraming as lens (pre-computed field — already present in STAGE_DATA):
  operational-pragmatist: lead with specific manual step that stops on go-live
  roi-analytical: lead with dollar figure or time savings anchor
  peer-comparison: lead with company name + proximity ('A company 12 miles from you')
  visionary-strategic: lead with AI agent capability, not the integration
  risk-averse-conservative: lead with support model and what was preserved, not disrupted
  Write rewritten fomoAngle to fomoAngleAdapted. If already correct hook → copy verbatim.

MULTI-PROFILE FOMO — if STAGE_DATA.ivy.psychologyProfile.secondaryProfile is non-null:
  For each fomoOrdered entry, generate fomoAngleForSecondary using secondary profile's fomoFraming lens.
  If secondary is 'systematic-evaluator': name a STAGE_DATA.vera credentialingAnchor whose systemsUsed overlaps.
  Else: null.

CHALLENGE FRAMING — apply ivy.contentModifiers.challengeFraming structure:
  Lead with STAGE_DATA.sage.primaryPainQuote verbatim (their exact words) as emotional anchor.
  If skepticismSignals present: acknowledge friction FIRST — do not open with solution.
  If roi-analytical: include cost anchor from transcript.
  Write challengeLead as 1-2 sentences Petra copies verbatim.

COST OF WAITING — compute: what does waiting 6 months cost this client?
  Priority: (a) sage volume×lag (N deals × M-day lag × $X ACV → monthly × 6)
            (b) sage manual hours (hours/week × wage estimate × 26 weeks)
            (c) vera competitorFOMO[] highest savings reframed as 6-month peer benchmark
  Produce one concrete figure. If no numeric data exists → set costOfWaiting to null.

CLOSING LINE:
  Check ivy.contentModifiers.closingLineVariant — if not null, use it.
  If STAGE_DATA.flo.flags.salesforceDetected is true: override with:
    "The Salesforce objects and MuleSoft event triggers established in Year 1 are what AgentForce reads in Year 2. That architecture is decided once."
  Else: extract default closingLine from STAGE_DATA._proposalStructure verbatim.

JOURNEY HEADLINE — if STAGE_DATA.sage.aspirationQuote is non-null:
  Write: "the path to [their aspiration, in their words]."
  Else: null.

AE TALKING POINT — template fill:
  "For a {ivy.psychologyProfile.primaryProfileLabel} buyer, lead with: {ivy.contentModifiers.fomoFraming first sentence}."

COMPETITOR COUNTERPUNCH — always produce (no signal required):
  Consider tech stack (flo.confirmedFlows), pain (sage), credentialingAnchors (vera), competitive signals (ivy).
  Most plausible competitor types: another MuleSoft partner, Boomi, Celigo, Zapier, in-house dev, staff-aug firm.
  Write preemptiveLine that Petra embeds in the proposal to neutralize it.

Cap search_knowledge at 3 calls — all key data comes from injected stage.
Call write_output once when done.`;

const TACTICS_PROMPT = `\
You are hawk-tactics. Build the architect's talking toolkit for the DataSkate Scout pipeline.

STAGE_DATA:
{STAGE_JSON}

CONTEXT_DATA (company_context.json — buyerMap + dealUrgencyMultipliers + corporateStack):
{CONTEXT_JSON}

OUTPUT — call write_output with exactly:
{
  "talkingPoints": [
    {
      "trigger": "when to use this line",
      "say": "exact words — grounded in client systems and pain",
      "impact": "measurable outcome to reference"
    }
  ],
  "openingLines": [
    { "context": "Opening — first 30 seconds", "line": "..." },
    { "context": "If they say they already have a plan", "line": "..." },
    { "context": "FOMO close — when deal stalls", "line": "..." },
    { "context": "AI question — how does this help with AI?", "line": "..." }
  ],
  "portfolioTemplateFraming": {
    "platformName": "string",
    "sponsorName": "string or null",
    "siblingCount": N,
    "siblingsWithIntegrationFootprint": N,
    "templateAngle": "1 sentence",
    "executiveSponsorAngle": "1 sentence or null",
    "executiveSponsorInRoomAngle": "1 sentence or null",
    "dealUrgencyMultipliers": [],
    "greenfieldFlag": true
  },
  "perPersonTalkingPoints": [
    {
      "name": "string",
      "title": "string",
      "role": "economicBuyer | championOnCall | technicalInfluencer | operationalInfluencer",
      "hawkTalkingPoint": "1-2 sentences — refined from Vera's talkingPointSeed, grounded in deal role + background + dealUrgencyMultiplier",
      "triggerCondition": "when on the call to use this",
      "profileFraming": "ivy profile lens"
    }
  ]
}

RULES:

TALKING POINTS — 3-5 entries:
  Each must be: specific to client's systems/pain from STAGE_DATA.sage, tied to a quantified outcome from STAGE_DATA.vera.competitorFOMO[], first-person conversational voice (not presentation language).
  trigger: when to use (e.g. 'When they mention manual reporting').
  say: exact words grounded in their specific systems.
  impact: measurable outcome to reference.

OPENING LINES — exactly 4 entries in this order:
  1. Opening (first 30 seconds): client-name-personalized, references industry + a pain from sage.
  2. If they say they already have a plan: redirect using sharpest fomoAngle from STAGE_DATA.vera.competitorFOMO[].
  3. FOMO close (when deal stalls): window + consequence framing tied to quantified savings from vera.
  4. AI question (how does this help with AI?): bridge: their systems → Phase 1 unlock → AI layer peers are using.

PORTFOLIO TEMPLATE FRAMING — check STAGE_DATA.vera.corporateStack.operatingPlatform:
  If operatingPlatform is null OR siblingBrands[] has fewer than 2 entries → set portfolioTemplateFraming to null.
  If 2+ siblings: compute:
    platformName: operatingPlatform.name
    sponsorName: vera.corporateStack.financialSponsor.name (null if none)
    siblingCount: count of siblingBrands[]
    siblingsWithIntegrationFootprint: count where integrationSignal != 'unknown — no public integration footprint found'
    templateAngle: "A successful integration with {operatingBrand.name} becomes the template for {siblingCount} sibling brands under {platformName}."
    executiveSponsorAngle: if sponsorName — "A {platformName} portfolio-wide integration standard reduces due-diligence overhead on the next {sponsorName} acquisition." Else null.
    executiveSponsorInRoomAngle: if a name in vera.corporateStack.operatingPlatform.platformExecutiveTeam[] also appears in STAGE_DATA.sage namedContacts context — write 1 sentence about platform-level role. Else null.
    dealUrgencyMultipliers: copy CONTEXT_DATA.dealUrgencyMultipliers[] verbatim.
    greenfieldFlag: true if siblingsWithIntegrationFootprint = 0.

PER-PERSON TALKING POINTS — from CONTEXT_DATA.buyerMap.people[]:
  For each person classified as economicBuyer / championOnCall / technicalInfluencer / operationalInfluencer (NOT detractors):
    hawkTalkingPoint: 1-2 sentences refined from talkingPointSeed, grounded in deal role + background + dealUrgencyMultiplier.
    triggerCondition: when on the call to use this.
    profileFraming: ivy profile lens (mirror angleForIvy when useful).
  Generation rules by role:
    economicBuyer: lead with cost / payback / risk — never operational detail.
    championOnCall: reinforce their internal-sale ammunition — give them sentences to repeat to their boss.
    technicalInfluencer: name a specific architectural concern + DataSkate answer (preserve veto authority).
    operationalInfluencer: name the specific manual step that stops on go-live.
    isSystemAdmin=true or sole-admin signal: add 'control preserved' clause naming what stays theirs.
    matchConfidence=high + sources includes both transcript + web: reference platform-level role explicitly.
  Cap at 6 entries. Priority: economicBuyer > championOnCall > cross-referenced execs > highest-tenure technicalInfluencer.

Cap search_knowledge at 2 calls — all key data comes from injected stage and context.
Call write_output once when done.`;

const COMPETITIVE_PROMPT = `\
You are hawk-competitive. Build the competitive positioning block for this DataSkate engagement.
Only runs when a competitive-evaluation signal or systematic-evaluator profile is detected.
ALL DATA IS INJECTED — cap search_knowledge at 2 calls.

CREDENTIALING_ANCHORS:
{ANCHORS_JSON}

CONFIRMED_FLOWS:
{FLOWS_JSON}

STAGE_DATA:
{STAGE_JSON}

OUTPUT — call write_output with exactly:
{
  "competitivePositioning": {
    "celigoMigrationClients": [
      {
        "slug": "...",
        "displayName": "...",
        "systems": [],
        "whatWasBuilt": "...",
        "relevanceNote": "1 sentence — why this reference is relevant to this prospect"
      }
    ],
    "proofPoints": [
      {
        "claim": "1-sentence factual claim about DataSkate capability",
        "evidence": "which anchor or flow supports this",
        "sourceSlug": "slug from CREDENTIALING_ANCHORS or null"
      }
    ],
    "vendorEvalFilter": {
      "likelyCompetitors": ["vendor name"],
      "ourDifferentiator": "1-2 sentences — what DataSkate has that they do not",
      "talkingTrack": "what the architect says when asked how we compare to [competitor]"
    }
  }
}

RULES:
- celigoMigrationClients: filter CREDENTIALING_ANCHORS to those whose systems[] overlap with CONFIRMED_FLOWS.
  relevanceNote must reference the specific overlap (e.g. "Both use Salesforce + NetSuite — same flow pattern").
- proofPoints: 2-4 entries. Each must be a verifiable claim grounded in an anchor, not a platitude.
- vendorEvalFilter.likelyCompetitors: 1-3 most plausible competitors given the tech stack in CONFIRMED_FLOWS.
  Most common: another MuleSoft partner, Boomi, Celigo, Zapier, in-house dev.
- ourDifferentiator: reference named anchor clients and specific systems — never generic.
- talkingTrack: architect-voice, conversational, 2-3 sentences max.
Call write_output once.`;

export async function runHawk({ agentDef, clientSlug, mcpClient }) {
  // Read stage data ONCE
  const stageData = await readStage(mcpClient, 'hawk');

  // Pre-compute contentModifiers + socialProofAngle from profile files (zero LLM cost)
  const primaryProfileId = stageData?.ivy?.psychologyProfile?.primaryProfile || null;
  if (primaryProfileId && stageData.ivy?.psychologyProfile) {
    const guidance  = getProfileGuidance(primaryProfileId);
    const detection = getProfileDetection(primaryProfileId);
    stageData.ivy.psychologyProfile.contentModifiers = {
      fomoFraming:         guidance?.fomoFraming        || null,
      challengeFraming:    guidance?.challengeFraming   || null,
      journeyFraming:      guidance?.journeyFraming     || null,
      closingLineVariant:  guidance?.closingLineVariant || null,
    };
    stageData.ivy.psychologyProfile.socialProofAngle = detection?.socialProofAngle || null;

    // Secondary profile contentModifiers (for multi-profile FOMO)
    const secondaryProfileId = stageData.ivy.psychologyProfile.secondaryProfile;
    if (secondaryProfileId) {
      const secGuidance  = getProfileGuidance(secondaryProfileId);
      const secDetection = getProfileDetection(secondaryProfileId);
      stageData.ivy.psychologyProfile.secondaryContentModifiers = {
        fomoFraming:      secGuidance?.fomoFraming      || null,
        challengeFraming: secGuidance?.challengeFraming || null,
      };
      stageData.ivy.psychologyProfile.secondarySocialProofAngle = secDetection?.socialProofAngle || null;
    }
  }

  // Read company_context.json for buyerMap, competitorFOMO, credentialingAnchors (not in stage)
  let contextData = {};
  try {
    const ctxPath = path.join(ROOT, 'projects', clientSlug, 'company_context.json');
    if (fs.existsSync(ctxPath)) {
      const raw = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
      contextData = {
        buyerMap:               raw.buyerMap               || null,
        dealUrgencyMultipliers: raw.dealUrgencyMultipliers || [],
        corporateStack:         raw.corporateStack         || null,
        competitorFOMO:         raw.competitorFOMO         || [],
        credentialingAnchors:   raw.credentialingAnchors   || [],
      };
    }
  } catch (_) {}

  const stageJson   = JSON.stringify(stageData,   null, 2);
  const contextJson = JSON.stringify(contextData, null, 2);

  // Slim tactics stage — strip large fields NARRATIVE needs but TACTICS doesn't
  const { _proposalStructure, _referenceNetwork, _psychologyGuidance, ...tacticsStageData } = stageData;
  const tacticsStageJson = JSON.stringify(tacticsStageData, null, 2);

  const cache = subagentCache(clientSlug, 'hawk');

  // Both sub-agents only need injected data → run in PARALLEL
  console.log(`    [hawk] hawk-narrative ‖ hawk-tactics (parallel)`);
  const [p1, p2] = await Promise.all([
    cache.runOrLoad('hawk-narrative', () => runSubStep({
      agentSlug: 'hawk', name: 'hawk-narrative', model: 'strategist',
      prompt: NARRATIVE_PROMPT
        .replace('{STAGE_JSON}',   stageJson)
        .replace('{CONTEXT_JSON}', contextJson),
      ceiling: 0.45, agentDef, clientSlug, mcpClient,
    }), 'hawk-narrative (sonnet, $0.45)'),
    cache.runOrLoad('hawk-tactics', () => runSubStep({
      agentSlug: 'hawk', name: 'hawk-tactics', model: 'strategist',
      prompt: TACTICS_PROMPT
        .replace('{STAGE_JSON}',   tacticsStageJson)
        .replace('{CONTEXT_JSON}', contextJson),
      ceiling: 0.50, agentDef, clientSlug, mcpClient,
    }), 'hawk-tactics (sonnet, $0.50)'),
  ]);

  const narrative = (p1.output && Object.keys(p1.output).length > 0) ? p1.output : {};
  const tactics   = (p2.output && Object.keys(p2.output).length > 0) ? p2.output : {};
  let totalCost = p1.cost + p2.cost;

  const hawk = {
    status:      'complete',
    client:      clientSlug,
    generatedAt: new Date().toISOString(),

    // hawk-narrative outputs
    fomoOrdered:           narrative.fomoOrdered           || [],
    challengeLead:         narrative.challengeLead         || null,
    closingLine:           narrative.closingLine           || null,
    journeyHeadline:       narrative.journeyHeadline       || null,
    costOfWaiting:         narrative.costOfWaiting         || null,
    aeTalkingPoint:        narrative.aeTalkingPoint        || null,
    competitorCounterpunch: narrative.competitorCounterpunch || null,

    // hawk-tactics outputs
    talkingPoints:            tactics.talkingPoints            || [],
    openingLines:             tactics.openingLines             || [],
    portfolioTemplateFraming: tactics.portfolioTemplateFraming || null,
    perPersonTalkingPoints:   tactics.perPersonTalkingPoints   || [],

    // hawk-competitive outputs (conditional)
    competitivePositioning: null,
  };

  // ── Step 3: hawk-competitive (conditional — competitive signal + credentialing anchors) ──
  let p3 = null;
  const competitiveSignal = !!(
    (stageData?.sage?.signals || []).some(s => s.signal === 'competitive-evaluation') ||
    stageData?.ivy?.psychologyProfile?.primaryProfile === 'systematic-evaluator' ||
    stageData?.ivy?.psychologyProfile?.secondaryProfile === 'systematic-evaluator'
  );
  if (competitiveSignal && (stageData?.vera?.credentialingAnchors?.length ?? 0) > 0) {
    p3 = await cache.runOrLoad('hawk-competitive', () => runSubStep({
      agentSlug: 'hawk',
      name: 'hawk-competitive', model: 'sonnet',
      prompt: COMPETITIVE_PROMPT
        .replace('{ANCHORS_JSON}', JSON.stringify(stageData.vera.credentialingAnchors, null, 2))
        .replace('{FLOWS_JSON}',   JSON.stringify(stageData.flo?.confirmedFlows || [], null, 2))
        .replace('{STAGE_JSON}',   stageJson),
      ceiling: 0.20, agentDef, clientSlug, mcpClient,
    }), 'hawk-competitive (sonnet, $0.20)');
    totalCost += p3.cost;
    hawk.competitivePositioning = p3.output?.competitivePositioning || null;
  }

  cache.clearIfAllSucceeded([p1, p2, p3].filter(Boolean));
  const hasContent = hawk.fomoOrdered.length > 0 || hawk.talkingPoints.length > 0;
  return { cost: totalCost, killed: !hasContent, output: hasContent ? hawk : null };
}
