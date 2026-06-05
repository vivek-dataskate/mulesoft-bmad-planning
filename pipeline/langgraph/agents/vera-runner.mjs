/**
 * Vera multi-step runner — 4 focused sub-agents replacing the 103KB monolith.
 *
 * Architecture:
 *   - Orchestrator reads stage data ONCE, injects it as context (eliminates read_stage MCP calls)
 *   - vera-profile runs first (sequential) — produces company identity
 *   - vera-stack + vera-peers run in PARALLEL (both only need profile output)
 *   - vera-sponsor runs CONDITIONALLY after vera-stack (PE-backed clients only)
 *   - vera-buyermap runs after vera-stack (needs leadership context)
 *   - vera-narrative runs last (sequential — needs all prior outputs)
 *   - Orchestrator merges all into vera.json (zero LLM cost)
 *
 * Each sub-agent is autonomous: input contract injected → write_output → done.
 * No read_stage calls from sub-agents. No cross-agent file reads.
 *
 * Cost model (max):
 *   vera-profile   haiku   $0.20
 *   vera-stack     sonnet  $0.50  ┐ parallel
 *   vera-peers     sonnet  $0.30  ┘
 *   vera-sponsor   haiku   $0.10  (conditional — PE-backed only)
 *   vera-buyermap  sonnet  $0.35
 *   vera-narrative sonnet  $0.40
 *   ─────────────────────────────
 *   Total max      $1.85  (vs $2.00+ monolith kill)
 */
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runAgent, runSubStep, readStage } from '../agent-runner.mjs';
import { subagentCache } from './subagent-cache.mjs';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');
const REFERENCE_NETWORK_PATH = path.join(ROOT, 'commons/sales/reference-network.json');

// ── Sub-step system prompts ───────────────────────────────────────────────────
// Each is <3KB — contrast with 103KB vera.toml re-sent every turn in monolith.

const PROFILE_PROMPT = `\
You are vera-profile. Extract company identity from the client stage data provided in your input.

OUTPUT — call write_output with exactly:
{
  "company": {
    "name": "...", "website": "...", "industry": "...", "verticalSlug": "...",
    "hqLocation": "...", "hqAddress": null, "revenueEstimate": null,
    "revenueBracket": null, "sizeSegment": "smb|midmarket|enterprise",
    "foundedYear": null, "logoUrl": null
  },
  "businessObjects": ["Lead", "Customer", "Contract", "Job", "..."],
  "aiJourney": {
    "phase1": { "headline": "...", "detail": "..." },
    "phase2": { "headline": "...", "detail": "..." },
    "phase3": { "headline": "...", "detail": "..." }
  },
  "systemPrerequisites": [
    { "system": "...", "prerequisite": "..." }
  ],
  "legacyBoltOns": [
    {
      "name": "...",
      "acquisitionYear": null,
      "originalLocation": "city, state or null",
      "website": "url or null",
      "sourceUrl": "url or null",
      "slug": "kebab-case",
      "note": "separate-brand | absorbed"
    }
  ]
}

RULES:
- Extract company name, industry, verticalSlug from businessContext in the stage data.
- businessObjects come from the confirmed flows — what entities move between systems.
- AI journey phases must reference client's ACTUAL systems (not generic "data" or "AI").
  Phase 3 must mention AgentForce if Salesforce is present.
- systemPrerequisites: one entry per detected system, specific to what must be confirmed.
- legacyBoltOns: scan the company's About/History/Acquisitions page for brands the operating company itself acquired BEFORE joining any platform. Empty array [] if none. Set note="absorbed" if they no longer operate separately.
- Cap search_knowledge at 4 calls if you need vertical/business-object context.
- Set unknown fields to null — never guess.
- Call write_output once when done.`;

const STACK_PROMPT = `\
You are vera-stack. Research corporate ownership for the company profile below.
Use search_knowledge to find platform, PE sponsor, sibling brands, deal urgency signals.
Cap at 6 search_knowledge calls. Never fabricate — null if not found.

COMPANY_PROFILE:
{PROFILE_JSON}

OUTPUT — call write_output with exactly:
{
  "corporateStack": {
    "ownership": "independent|subsidiary|brand-of-platform|pe-backed|pe-backed-platform-of-brands|unknown",
    "operatingBrand": { "name": "...", "website": null, "foundedYear": null, "description": "...", "slug": "..." },
    "leadership": { "ceo": null, "president": null, "founders": [] },
    "operatingPlatform": {
      "name": "...", "website": null, "platformShape": "platform-above|platform-is-client|platform-via-alliance",
      "description": "...", "regionalStrategy": null,
      "siblingBrands": [ { "name": "...", "region": "...", "website": null, "slug": "..." } ],
      "platformExecutiveTeam": [ { "name": "...", "title": "...", "scope": "..." } ]
    },
    "financialSponsor": { "name": "...", "website": null, "thesisForClient": "...", "acquisitionDate": null, "sectorFocus": [] },
    "engagementEntity": { "name": "...", "sameAsOperatingBrand": true, "note": "..." },
    "subsidiaries": [], "collaborators": [], "strategicPartnerships": [],
    "dealUrgencyMultipliers": ["..."],
    "confidence": "high|medium|low", "researchedAt": "ISO-date"
  },
  "dealUrgencyMultipliers": ["..."],
  "contactCrossReferences": []
}

RULES:
- search_knowledge("corporate ownership {company name}") first.
- If platform found: search_knowledge("sibling brands {platform name}").
- dealUrgencyMultipliers: 3-6 specific "why now" angles with named entities, not generic.
- If independent after 3 searches: stop, set ownership="independent", operatingPlatform=null.
- Call write_output once when done.`;

const PEERS_PROMPT = `\
You are vera-peers. Find FOMO-worthy integration examples and nearby peers for this company.
Check the knowledge corpus first — use search_knowledge for library lookups.
Cap at 5 search_knowledge calls.

COMPANY_PROFILE:
{PROFILE_JSON}

OUTPUT — call write_output with exactly:
{
  "competitorFOMO": [
    {
      "displayName": "...",
      "industry": "...", "sizeSegment": "...", "systems": ["source", "target"],
      "whatWasBuilt": "...", "outcome": "...",
      "aiAgentDescription": "An AI agent [trigger] → [action] → [output]",
      "relevanceTier": 1,
      "analogyNote": null, "sourceUrl": null,
      "fomoProfileFit": "roi-analytical|operational-pragmatist|systematic-evaluator|peer-pressure"
    }
  ],
  "aiThoughtStarters": ["Teams in {industry} are using AI agents to..."],
  "nearbyPeers": [ { "name": "...", "location": "...", "whatTheyIntegrated": "...", "outcome": "...", "sourceUrl": null } ],
  "libraryContributions": [],
  "useCaseLibraryUpdates": { "stagedForPromotion": 0, "alreadyInLibrary": 0 }
}

RULES:
- search_knowledge("use case library {vertical} {systems}") — find existing FOMO entries first.
- search_knowledge("competitor FOMO {vertical} integration automation") for web-sourced examples.
- Produce at least 3 competitorFOMO entries. First entry MUST have a real company name (not anonymized).
- Tier 1 = same vertical + same systems. Tier 4 = analyst stat (always valid fallback).
- aiThoughtStarters: 3-4 ideas not already in competitorFOMO.
- Call write_output once when done.`;

const BUYERMAP_PROMPT = `\
You are vera-buyermap. Map buyer roles by cross-matching transcript contacts with corporate leadership.
Cap at 4 search_knowledge calls.

COMPANY_PROFILE:
{PROFILE_JSON}

CORPORATE_STACK:
{STACK_JSON}

TRANSCRIPT_CONTACTS:
{CONTACTS_JSON}

OUTPUT — call write_output with exactly:
{
  "buyerMap": {
    "summary": {
      "economicBuyer": { "name": "...", "title": "...", "matchConfidence": "high|medium|low|transcript-only" } | null,
      "championOnCall": { "name": "...", "title": "...", "matchConfidence": "..." } | null,
      "coverageNote": "..."
    },
    "people": [
      {
        "name": "...", "title": "...", "company": "...",
        "role": "economicBuyer|championOnCall|technicalInfluencer|operationalInfluencer|detractor|unknown",
        "sources": ["transcript","web"],
        "matchConfidence": "high|medium|low|transcript-only|web-only",
        "angleForHawk": "...", "angleForIvy": "...",
        "talkToBefore": false, "talkingPointSeed": "...",
        "webEvidence": {
          "linkedIn": "url or null",
          "tenureMonths": null,
          "priorRole": "most recent prior role or null",
          "backgroundSummary": "1-2 sentences or null",
          "appointmentDate": "YYYY-MM or null",
          "sourceUrl": "url or null"
        }
      }
    ],
    "preCallOutreach": [], "futureBusinessChampions": [],
    "confidence": "high|medium|low"
  },
  "namedBuyers": {
    "economicBuyer": null, "champion": null,
    "technicalInfluencers": [], "operationalInfluencers": []
  },
  "credentialingAnchors": [],
  "fomoProfileHint": []
}

RULES:
- TRANSCRIPT_CONTACTS above are your primary seeds — classify each one first.
- CORPORATE_STACK.leadership provides the web-side seeds.
- Cross-match: same name in both → high confidence, set both source tags.
- webEvidence: for each person in CORPORATE_STACK.leadership, add their LinkedIn and title as webEvidence. For transcript-only people: set webEvidence.linkedIn = null, webEvidence.backgroundSummary = null.
- search_knowledge("linkedin {name} {company}") for web-side seeds — cap at 2 calls total for web lookups.
- search_knowledge("psychology profiles {vertical}") for fomoProfileHint.
- economicBuyer heuristic: CEO/President for <$50M revenue; CFO/COO for larger.
- Call write_output once when done.`;

const SPONSOR_PROMPT = `\
You are vera-sponsor. Research the financial sponsor's portfolio companies for cross-sell signals.
Cap at 4 search_knowledge calls for portfolio research.

SPONSOR:
{SPONSOR_JSON}

OUTPUT — call write_output with exactly:
{
  "portfolioCompanies": [
    { "name": "...", "website": null, "category": "...", "integrationSignal": "...", "sourceUrl": null, "slug": "..." }
  ]
}

RULES:
- search_knowledge("portfolio companies {sponsor name}") to find portcos.
- integrationSignal: why this portco would benefit from MuleSoft/Celigo integration — 1 sentence.
- category: "services" | "software" | "saas" | "manufacturing" | "healthcare" | "other"
- slug: kebab-case of the company name.
- Return [] if sponsor has no researchable portfolio or integrationSignal is not clear.
Call write_output once.`;

const CORPORATE_NARRATIVE_PROMPT = `\
You are vera-narrative. Write the DataSkate corporate intelligence brief for this client.
ALL DATA IS INJECTED — do NOT call search_knowledge.

COMPANY_PROFILE: {PROFILE_JSON}
CORPORATE_STACK: {STACK_JSON}
PEERS_DATA: {PEERS_JSON}
BUYER_MAP: {BUYERMAP_JSON}

OUTPUT — call write_output with exactly:
{
  "corporateProfile": "## 1. Origin & History\\n...\\n## 2. Business Model\\n...\\n## 3. Corporate Stack\\n...\\n## 4. People — Current Engagement\\n...\\n## 5. People — Future Business\\n...\\n## 6. Strategic Position\\n...\\n## 7. Signals to Watch\\n...\\n## 8. How We See You\\n...",
  "corporateProfileMeta": {
    "wordCount": 0,
    "sectionCount": 8,
    "sourceUrlCount": 0,
    "namedContactCount": 0,
    "generatedAt": "ISO-date",
    "confidence": "high|medium|low"
  }
}

RULES:
- 8 sections in order, each with ## header
- 1200-2500 words total — density over length
- Every concrete claim must have a [text](url) markdown link where sourced
- No marketing platitudes — specific facts only
- Write in voice of DataSkate internal briefing to the architect
- Cap search_knowledge at 0 — all data is injected
Call write_output once.`;

// ── credentialingAnchors lookup — zero LLM cost ──────────────────────────────

function buildCredentialingAnchors(stageData) {
  const competitiveSignal = (stageData?.sage?.signals || [])
    .some(s => s.signal === 'competitive-evaluation');
  if (!competitiveSignal) return [];

  let refNetwork = {};
  try { refNetwork = JSON.parse(fs.readFileSync(REFERENCE_NETWORK_PATH, 'utf8')); }
  catch { return []; }

  const clientSystems = (stageData?.sage?.systems || [])
    .map(s => s.connectorKey)
    .filter(Boolean);

  return (refNetwork.references || [])
    .filter(r => r.referenceType !== 'TBD' && r.authorizedUsage !== 'TBD')
    .filter(r => (r.systems || []).some(s => clientSystems.includes(s)))
    .map(r => ({
      slug:               r.slug,
      displayName:        r.displayName,
      industry:           r.industry,
      sizeSegment:        r.sizeSegment,
      systems:            (r.systems || []).filter(s => clientSystems.includes(s)),
      whatDataSkateBuilt: r.whatDataSkateBuilt,
      authorizedUsage:    r.authorizedUsage,
      bestUsedFor:        r.bestUsedFor,
    }));
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function runVera({ agentDef, clientSlug, mcpClient }) {
  // Read stage data ONCE in orchestrator — sub-agents get it as injected context
  // (eliminates a read_stage MCP call from every sub-agent)
  const stageData = await readStage(mcpClient, 'vera');

  const stageJson    = JSON.stringify(stageData, null, 2);
  const contactsJson = JSON.stringify(stageData?.sage?.namedContacts || [], null, 2);

  const cache = subagentCache(clientSlug, 'vera');
  let totalCost = 0;

  // ── Step 1: vera-profile (sequential — needed by all others) ──────────────
  const p1 = await cache.runOrLoad('vera-profile', () => runSubStep({
    agentSlug: 'vera', name: 'vera-profile', model: 'extractor',
    prompt: PROFILE_PROMPT + `\n\nCLIENT_STAGE_DATA:\n${stageJson}`,
    ceiling: 0.20, agentDef, clientSlug, mcpClient,
  }), 'vera-profile (haiku, $0.20)');
  totalCost += p1.cost;
  const profile = (p1.output && Object.keys(p1.output).length > 1) ? p1.output : { company: { name: clientSlug } };
  const profileJson = JSON.stringify(profile, null, 2);

  // ── Steps 2+3: vera-stack ‖ vera-peers (parallel — both only need profile) ─
  console.log(`    [vera] vera-stack ‖ vera-peers (parallel)`);
  const [p2, p3] = await Promise.all([
    cache.runOrLoad('vera-stack', () => runSubStep({
      agentSlug: 'vera', name: 'vera-stack', model: 'researcher',
      prompt: STACK_PROMPT.replace('{PROFILE_JSON}', profileJson),
      ceiling: 0.50, agentDef, clientSlug, mcpClient,
    }), 'vera-stack (sonnet, $0.50)'),
    cache.runOrLoad('vera-peers', () => runSubStep({
      agentSlug: 'vera', name: 'vera-peers', model: 'researcher',
      prompt: PEERS_PROMPT.replace('{PROFILE_JSON}', profileJson),
      ceiling: 0.30, agentDef, clientSlug, mcpClient,
    }), 'vera-peers (sonnet, $0.30)'),
  ]);
  totalCost += p2.cost + p3.cost;

  const stack = (p2.output && Object.keys(p2.output).length > 0) ? p2.output : {};
  const peers  = (p3.output && Object.keys(p3.output).length > 0) ? p3.output : {};

  // ── Step 2b: vera-sponsor (conditional — PE-backed clients only) ──────────
  let p2b = null;
  let sponsorPortcos = [];
  if (stack.corporateStack?.financialSponsor?.name) {
    p2b = await cache.runOrLoad('vera-sponsor', () => runSubStep({
      agentSlug: 'vera',
      name: 'vera-sponsor', model: 'haiku',
      prompt: SPONSOR_PROMPT.replace('{SPONSOR_JSON}', JSON.stringify(stack.corporateStack.financialSponsor, null, 2)),
      ceiling: 0.10, agentDef, clientSlug, mcpClient,
    }), 'vera-sponsor (haiku, $0.10)');
    totalCost += p2b.cost;
    sponsorPortcos = p2b.output?.portfolioCompanies || [];
  }

  // ── Step 4: vera-buyermap (sequential — needs stack for leadership context) ─
  const p4 = await cache.runOrLoad('vera-buyermap', () => runSubStep({
    agentSlug: 'vera', name: 'vera-buyermap', model: 'analyst',
    prompt: BUYERMAP_PROMPT
      .replace('{PROFILE_JSON}', profileJson)
      .replace('{STACK_JSON}',   JSON.stringify(stack, null, 2))
      .replace('{CONTACTS_JSON}', contactsJson),
    ceiling: 0.35, agentDef, clientSlug, mcpClient,
  }), 'vera-buyermap (sonnet, $0.35)');
  totalCost += p4.cost;
  const buyermap = (p4.output && Object.keys(p4.output).length > 0) ? p4.output : {};

  // ── Step 5: vera-narrative (sequential — needs all prior outputs) ─────────
  const p5 = await cache.runOrLoad('vera-narrative', () => runSubStep({
    agentSlug: 'vera',
    name: 'vera-narrative', model: 'sonnet',
    prompt: CORPORATE_NARRATIVE_PROMPT
      .replace('{PROFILE_JSON}',  profileJson)
      .replace('{STACK_JSON}',    JSON.stringify(stack, null, 2))
      .replace('{PEERS_JSON}',    JSON.stringify(peers, null, 2))
      .replace('{BUYERMAP_JSON}', JSON.stringify(buyermap, null, 2)),
    ceiling: 0.40, agentDef, clientSlug, mcpClient,
  }), 'vera-narrative (sonnet, $0.40)');
  totalCost += p5.cost;
  const narrative = (p5.output && Object.keys(p5.output).length > 0) ? p5.output : {};

  // ── Merge — zero LLM cost ──────────────────────────────────────────────────
  const vera = {
    status:      'complete',
    client:      clientSlug,
    generatedAt: new Date().toISOString(),
    // Step 1
    company:             profile.company             || {},
    businessObjects:     profile.businessObjects     || [],
    aiJourney:           profile.aiJourney           || {},
    systemPrerequisites: profile.systemPrerequisites || [],
    legacyBoltOns:       profile.legacyBoltOns       || [],
    // Step 2 (stack)
    corporateStack:         stack.corporateStack         || null,
    dealUrgencyMultipliers: stack.dealUrgencyMultipliers || [],
    contactCrossReferences: stack.contactCrossReferences || [],
    // Step 2b (sponsor — conditional)
    corporateStackEnrichment: {
      financialSponsor: { portfolioCompanies: sponsorPortcos },
    },
    // Step 3 (peers)
    competitorFOMO:        peers.competitorFOMO        || [],
    aiThoughtStarters:     peers.aiThoughtStarters     || [],
    nearbyPeers:           peers.nearbyPeers           || [],
    libraryContributions:  peers.libraryContributions  || [],
    useCaseLibraryUpdates: peers.useCaseLibraryUpdates || {},
    // Step 4 (buyermap)
    buyerMap:             buyermap.buyerMap             || {},
    namedBuyers:          buyermap.namedBuyers          || {},
    credentialingAnchors: buyermap.credentialingAnchors || [],
    fomoProfileHint:      buyermap.fomoProfileHint      || [],
    // Step 5 (narrative)
    corporateProfile:     narrative.corporateProfile     || null,
    corporateProfileMeta: narrative.corporateProfileMeta || null,
  };

  // P3-C: override with zero-cost JS lookup from reference-network.json
  vera.credentialingAnchors = buildCredentialingAnchors(stageData);

  cache.clearIfAllSucceeded([p1, p2, p2b, p3, p4, p5].filter(Boolean));
  const hasContent = Object.keys(vera.company || {}).length > 0 && vera.company.name;
  return { cost: totalCost, killed: !hasContent, output: hasContent ? vera : null };
}
