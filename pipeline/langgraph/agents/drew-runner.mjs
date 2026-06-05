/**
 * Drew multi-step runner — sibling roster validation + per-sibling fan-out.
 *
 * Architecture:
 *   drew-validate (haiku, $0.10) — cross-checks platform website + recent acquisition
 *     press releases against vera's sibling list; returns potentialNew[] for audit trail.
 *   Per-sibling sub-agents (sonnet, $0.15 each, parallel) — one per non-current-client
 *     sibling; fast-path gate: if no standalone website found → absorbed card + stop.
 *   Orchestrator merges all cards at zero LLM cost.
 *
 * Activation: skipped when no operatingPlatform or siblingBrands[] is empty.
 *
 * Cost model (Peerless: 5 siblings):
 *   drew-validate       haiku   $0.10
 *   5 × sibling cards   sonnet  $0.15 each = $0.75 max, ~$0.35 realistic (60% fast-path)
 *   ─────────────────────────────────────────
 *   Total max $0.85 / realistic ~$0.45
 */
import { runAgent, runSubStep, readStage } from '../agent-runner.mjs';
import { subagentCache } from './subagent-cache.mjs';

// ── Sub-step prompts ──────────────────────────────────────────────────────────

const VALIDATE_PROMPT = `\
You are drew-validate. Cross-check the sibling brand roster for an operating platform.
Vera's research capped at ~16–20 searches for the full corporate stack, so this roster may
be incomplete — new acquisitions get announced before websites are updated.

PLATFORM_NAME: {PLATFORM_NAME}
PLATFORM_WEBSITE: {PLATFORM_WEBSITE}
VERA_SIBLINGS: {VERA_SIBLINGS_JSON}

TASK:
Search 1: Fetch {PLATFORM_WEBSITE} — look for any "Our Brands", "Our Companies", "Portfolio",
  or "Family of Companies" page. List every brand/company name found.
Search 2: "{PLATFORM_NAME}" acquires OR acquisition OR "new brand" OR "joins" — filter to
  the last 2 years. Scan press releases, BusinessWire, PRNewswire snippets.

OUTPUT — call write_output with exactly:
{
  "foundOnSite": ["name1", "name2"],
  "potentialNew": [
    { "name": "...", "sourceUrl": "...", "evidence": "1 sentence" }
  ]
}
where potentialNew = entities found in searches NOT already in VERA_SIBLINGS list.

RULES:
- Cap at 2 search_knowledge calls total.
- NEVER fabricate — only include names explicitly found in search results.
- If platform website is unavailable or returns no brand listing: potentialNew=[].
- Call write_output once when done.`;

const SIBLING_PROMPT = `\
You are drew-sibling. Research one sibling brand for the DataSkate Portfolio Map.

SIBLING:
{SIBLING_JSON}

CONFIRMED_FLOWS (for applicableUseCases — no search needed):
{FLOWS_JSON}

TASK:
Search 0 (FAST-PATH GATE — mandatory first):
  "{NAME} {VERTICAL} official website" — check if a standalone primary domain exists.
  If results contain ONLY directory listings (Yelp, BBB, Procore, aggregators) with NO
  standalone primary domain: STOP. Write absorbed card (see ABSORBED OUTPUT below).
  If a standalone website IS found: proceed with Searches 1–5.

Search 1 (IT leader): "{NAME} CIO OR CTO OR VP IT OR Director of Technology site:linkedin.com/in"
Search 2 (value prop): fetch sibling homepage / About page — 1-2 sentence value prop.
Search 3 (IT stack): "{NAME} Salesforce OR NetSuite OR HubSpot OR SAP OR Workday" — scan job postings too.
Search 4 (named customers): scan homepage / Clients / Case Studies — up to 5 named customers.
Search 5 (integration signal): "{NAME} integration OR automation OR ERP" — 1 concrete signal.

APPLICABLEUSECASES (no search): for each flow in CONFIRMED_FLOWS, decide if the system
pattern applies to this sibling based on its stack/value prop. Write applicable=true|false|"unknown".
Include 1-2 sentence transferNote per flow.

FUTUREENAGEMENTNOTE: 1-2 sentences — when this sibling becomes a template engagement candidate
and what signal to wait for.

FULL OUTPUT — call write_output with:
{
  "name": "...", "website": "...", "linkedIn": "...", "sourceUrl": "...", "slug": "kebab",
  "tierAResearched": true, "fastPathTriggered": false,
  "integrationSignal": "1 sentence or 'unknown — no public integration footprint found'",
  "itLeader": { "name": "...", "title": "...", "linkedIn": "...", "tenureMonths": null, "sourceUrl": "..." } | null,
  "valueProp": "1-2 sentences" | null,
  "itStack": { "knownSystems": ["..."], "stackHints": "...", "sourceUrl": "..." } | null,
  "namedCustomers": ["..."],
  "applicableUseCases": [ { "ucId": "...", "applicable": true, "transferNote": "..." } ] | null,
  "futureEngagementNote": "..." | null
}

ABSORBED OUTPUT (fast-path):
{
  "name": "...", "website": null, "linkedIn": null, "sourceUrl": "...", "slug": "kebab",
  "tierAResearched": false, "fastPathTriggered": true,
  "integrationSignal": "unknown — no separately maintained website; likely absorbed",
  "itLeader": null, "valueProp": null, "itStack": null, "namedCustomers": [],
  "applicableUseCases": null,
  "futureEngagementNote": "Not a near-term templated engagement candidate — absorbed entity."
}

RULES: cap at 6 searches. NEVER fabricate. Set unfound fields to null. Call write_output once.`;

function slugify(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function runDrew({ agentDef, clientSlug, mcpClient }) {
  // Read stage data
  const stageData = await readStage(mcpClient, 'drew');

  const corporateStack = stageData?.vera?.corporateStack || null;
  const platform       = corporateStack?.operatingPlatform || null;
  const allSiblings    = platform?.siblingBrands || [];
  const confirmedFlows = stageData?.sage?.confirmedFlows || [];

  // Activation check — skip if no platform or no siblings
  if (!platform || allSiblings.length === 0) {
    return {
      cost: 0, killed: false,
      output: {
        status: 'skipped', client: clientSlug,
        reason: 'no operating platform siblings — Drew activation condition not met',
        siblingBrands: [],
      },
    };
  }

  const cache      = subagentCache(clientSlug, 'drew');
  let   totalCost  = 0;

  // Compact flows payload for sibling prompts — ucId + name + systems only
  const flowsLean = confirmedFlows.map(f => ({
    ucId: f.id || f.ucId, name: f.name,
    systems: f.systems || [f.source, f.target].filter(Boolean),
  }));

  // ── Pass 0: validate sibling roster ────────────────────────────────────────
  const validatePrompt = VALIDATE_PROMPT
    .replaceAll('{PLATFORM_NAME}',    platform.name || '')
    .replaceAll('{PLATFORM_WEBSITE}', platform.website || platform.name || '')
    .replace(  '{VERA_SIBLINGS_JSON}', JSON.stringify(allSiblings.map(s => s.name)));

  const pValidate = await cache.runOrLoad('drew-validate', () => runSubStep({
    agentSlug: 'drew', name: 'drew-validate', model: 'extractor',
    prompt: validatePrompt,
    ceiling: 0.10, agentDef, clientSlug, mcpClient,
  }), 'drew-validate (haiku, $0.10)');
  totalCost += pValidate.cost;

  const validateOut     = pValidate.output || {};
  const potentialNew    = Array.isArray(validateOut.potentialNew) ? validateOut.potentialNew : [];
  // Note: in the MJS runner there is no interactive confirmation.
  // potentialNew[] goes into drew.json for human review before the next run.

  // ── Step 1: Per-sibling fan-out (parallel) ──────────────────────────────────
  // Research all non-current-client siblings from Vera's list.
  // (Potential additions from validate are logged but not auto-added — require human confirmation.)
  const siblingsToResearch = allSiblings.filter(s => !s.isCurrentClient);
  const verticalHint = stageData?.vera?.company?.verticalSlug || stageData?.sage?.businessContext?.industry || '';

  const siblingResults = await Promise.all(
    siblingsToResearch.map(sibling => {
      const slug   = slugify(sibling.name || '');
      // Use replaceAll (or regex /g) — {NAME} appears 4 times in the prompt template
      // Sanitize curly braces so sibling name can't misfire on other template slots
      const sibName  = (sibling.name || '').replace(/[{}]/g, '');
      const prompt = SIBLING_PROMPT
        .replaceAll('{NAME}',        sibName)
        .replaceAll('{VERTICAL}',    verticalHint)
        .replace(  '{SIBLING_JSON}', JSON.stringify({ ...sibling, verticalHint }))
        .replace(  '{FLOWS_JSON}',   JSON.stringify(flowsLean));
      return cache.runOrLoad(
        `drew-sibling-${slug}`,
        () => runSubStep({
          agentSlug: 'drew', name: `drew-sibling-${slug}`, model: 'researcher',
          prompt, ceiling: 0.15, agentDef, clientSlug, mcpClient,
        }),
        `drew-sibling-${slug} (sonnet, $0.15)`,
      );
    }),
  );

  siblingResults.forEach(r => { totalCost += r.cost; });

  // ── Merge ──────────────────────────────────────────────────────────────────
  const cards = siblingResults.map((r, i) => {
    if (!r.output || r.killed) {
      // Error stub — preserve sibling identity
      const s = siblingsToResearch[i];
      return {
        name: s.name, slug: slugify(s.name || ''),
        tierAResearched: false, fastPathTriggered: false,
        integrationSignal: 'sub-agent error — re-run Drew for this sibling',
        itLeader: null, valueProp: null, itStack: null,
        namedCustomers: [], applicableUseCases: null, futureEngagementNote: null,
      };
    }
    return r.output;
  });

  const fastPathCount = cards.filter(c => c.fastPathTriggered).length;
  const tierACount    = cards.filter(c => c.tierAResearched).length;

  const drew = {
    status:      'complete',
    client:      clientSlug,
    generatedAt: new Date().toISOString(),
    siblingCount: siblingsToResearch.length,
    fastPathCount,
    tierACount,
    potentialUnmappedSiblings: potentialNew.map(n => ({ ...n, userConfirmed: false })),
    siblingBrands: cards,
  };

  cache.clearIfAllSucceeded([pValidate, ...siblingResults].filter(Boolean));

  const hasContent = drew.siblingBrands.length > 0;
  return { cost: totalCost, killed: false, output: hasContent ? drew : null };
}
