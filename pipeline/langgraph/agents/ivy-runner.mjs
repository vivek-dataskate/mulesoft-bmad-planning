/**
 * Ivy multi-step runner — 5 focused sub-agents + zero-cost JS empirical writeback.
 *
 * Architecture (4 waves):
 *   Wave 1: ivy-caller-role    (haiku,  $0.04) — classify caller role + title
 *   Wave 2: ivy-champion-score (sonnet, $0.12) ‖ ivy-quote-extract (haiku, $0.05) — parallel
 *   Wave 2b: ivy-new-profile   (sonnet, $0.20) — CONDITIONAL: only if newProfileSuspected
 *   Wave 3: ivy-eb-profile     (sonnet, $0.10) — CONDITIONAL: only if callerRole='champion'
 *   Wave 4: ivy-content-layers (haiku,  $0.04) + empirical-writeback (JS, $0) — parallel
 *
 * To mature a sub-agent: edit its prompt const below (CALLER_ROLE_PROMPT, CHAMPION_SCORE_PROMPT, etc.)
 * Data is pre-injected by the runner — sub-agents make zero MCP calls.
 *
 * Cost targets:
 *   Normal (champion + no new profile): ~$0.31
 *   Caller IS the EB (skip eb-profile):  ~$0.21
 *   With new profile detection (rare):   ~$0.51
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { runAgent, runSubStep } from '../agent-runner.mjs';
import { subagentCache } from './subagent-cache.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');

// ─────────────────────────────────────────────────────────────────────────────
// CALLER_ROLE_PROMPT — ivy-caller-role (haiku, $0.04)
// Classifies caller as champion | economic-buyer | unknown from contact signals.
// SME: add signal phrases, improve title→role mapping, tune conflict resolution.
// ─────────────────────────────────────────────────────────────────────────────
const CALLER_ROLE_PROMPT = `\
You are ivy-caller-role. Classify the caller's role from transcript and contact signals.

CHAMPION signals (caller is internal advocate, not the budget owner):
'need to run this by', 'my boss', 'need approval', 'my CFO', 'my CEO', 'my VP', 'my President',
'I use it day to day', 'we would have to get sign-off', 'make the case internally',
'check with', 'run by', 'get approval', 'bring this to'

EB signals (caller owns the budget and makes the final call):
'I own the budget', 'I sign off on', 'I make the final call', 'my team uses it',
'I brought this to them', 'I decide', 'my call to make', 'I approved'

CONTACT_SIGNALS:
{CONTACT_SIGNALS_JSON}

OUTPUT — call write_output with exactly:
{
  "callerRole": "economic-buyer | champion | unknown",
  "callerTitle": "string or null",
  "callerName": "string or null",
  "detectionRationale": "1 sentence — which exact signal(s) drove the classification"
}

RULES:
1. Check contactTitle first — senior exec (CEO/CFO/COO/Owner/President/Founder) → economic-buyer; operational/process/IT role → champion.
2. Scan callerSignalLines for signal phrases above.
3. Conflict: 2+ CHAMPION transcript phrases override EB contactTitle heuristic.
4. callerName: use namedContacts[0].name if that person is the primary speaker.
5. callerRole = 'unknown' only when genuinely ambiguous — not as safe default.

ALL DATA IS INJECTED. Call write_output once when done.`;

// ─────────────────────────────────────────────────────────────────────────────
// CHAMPION_SCORE_PROMPT — ivy-champion-score (sonnet, $0.12)
// Scores champion against all profiles, integrates Vera buyerMap hints.
// SME: tune secondaryProfile threshold (2+ matches), Vera convergence rules,
//      newProfileSuspected threshold (3+ unmatched recurring phrases).
// ─────────────────────────────────────────────────────────────────────────────
const CHAMPION_SCORE_PROMPT = `\
You are ivy-champion-score. Score the champion caller against psychology profiles.

CALLER_ROLE: {CALLER_ROLE}
CALLER_TITLE: {CALLER_TITLE}

TRANSCRIPT_CONTEXT (source quotes, signals, pre-extracted quotes from sage.json):
{TRANSCRIPT_CONTEXT_JSON}

PROFILES (signal phrase library):
{PROFILES_JSON}

VERA_BUYER_HINTS (web-researched buyerMap — hints only, transcript wins):
{VERA_BUYER_HINTS_JSON}

OUTPUT — call write_output with exactly:
{
  "primaryProfile": "profile-id",
  "primaryProfileLabel": "display label",
  "secondaryProfile": "profile-id or null",
  "secondaryProfileLabel": "label or null",
  "signalCounts": { "profile-id": N },
  "matchedPhrases": { "profile-id": ["verbatim phrase 1", "verbatim phrase 2", "verbatim phrase 3"] },
  "profileRationale": "2-3 sentences — why this profile, citing top matched phrases",
  "blendNote": "1 sentence on secondary modifier, or null",
  "veraBuyerMapHintIntegration": {
    "championHintProfileId": "from caller angleForIvy or null",
    "championHintMatch": "converged | conflicted | transcript-only | hint-only",
    "ebHintProfileId": "from EB person angleForIvy or null",
    "ebHintMatch": "converged | conflicted | transcript-only | hint-only | not-applicable",
    "reconciliationNote": "1-2 sentences — what was done with Vera hints"
  },
  "newProfileSuspected": false,
  "unmatchedSignals": []
}

RULES:
1. Scan ALL entries in TRANSCRIPT_CONTEXT: quotes dict fields, sourceQuotes[].quote, signalTriggerPhrases[].phrase, architectKnowledge[].finding.
2. Per profile: count distinct signalPhrase matches (verbatim or near-verbatim). Record matched phrases (max 3 per profile, exact text).
3. primaryProfile = highest count. Tiebreak by tiebreakerPriority (lower wins). Fallback: Vera hint → 'operational-pragmatist'.
4. secondaryProfile = runner-up with 2+ matches and a meaningfully different lens.
5. Vera integration: match CALLER_TITLE to buyerMapPeople[]. Read angleForIvy. Determine convergence/conflict.
6. For EB hint: find any person in buyerMapPeople with dealRole including 'economicBuyer'; record their angleForIvy as ebHintProfileId.
7. newProfileSuspected = true ONLY when 3+ recurring phrases form a coherent stance not covered by any existing profile. List exact verbatim phrases in unmatchedSignals.
8. signalCounts must include ALL profile IDs (even 0-count ones).

ALL DATA IS INJECTED. Call write_output once when done.`;

// ─────────────────────────────────────────────────────────────────────────────
// QUOTE_EXTRACT_PROMPT — ivy-quote-extract (haiku, $0.05)
// Extracts verbatim quotes — pain, aspiration, skepticism, excitement, EB-attributed.
// SME: tighten primaryPainQuote criteria, add quote categories,
//      improve ebAttributedQuote detection patterns.
// ─────────────────────────────────────────────────────────────────────────────
const QUOTE_EXTRACT_PROMPT = `\
You are ivy-quote-extract. Extract verbatim quotes from the transcript context.

TRANSCRIPT_CONTEXT:
{TRANSCRIPT_CONTEXT_JSON}

OUTPUT — call write_output with exactly:
{
  "primaryPainQuote": "verbatim sentence or null",
  "aspirationQuote": "verbatim sentence or null",
  "skepticismSignals": ["verbatim phrase"],
  "excitementPhrases": ["verbatim phrase"],
  "ebAttributedQuotes": ["verbatim phrase where champion describes EB priorities"]
}

RULES:
1. primaryPainQuote: use TRANSCRIPT_CONTEXT.quotes.primaryPainQuote if it exists and names a specific system/task/number. Otherwise scan sourceQuotes[] for a more vivid candidate. Must be exact words.
2. aspirationQuote: scan for 'if that could...', 'what would be amazing...', 'ideally...'. Null if not stated.
3. skepticismSignals: start with TRANSCRIPT_CONTEXT.quotes.skepticismSignals (Sage pre-extracted). Add from sourceQuotes[]. Max 6. Verbatim only.
4. excitementPhrases: start with TRANSCRIPT_CONTEXT.quotes.excitementPhrases. Add from sourceQuotes[]. Max 4.
5. ebAttributedQuotes: NOT pre-extracted by Sage — scan sourceQuotes[] and signalTriggerPhrases[] for 'my [boss/CFO/CEO/VP/owner] ...' patterns or champion-to-EB attribution ('he needs to see ROI', 'she keeps asking about payback'). Empty array if callerRole = 'economic-buyer' or none found.
6. All values must be verbatim text from TRANSCRIPT_CONTEXT. Never paraphrase.

ALL DATA IS INJECTED. Call write_output once when done.`;

// ─────────────────────────────────────────────────────────────────────────────
// NEW_PROFILE_PROMPT — ivy-new-profile (sonnet, $0.20) — CONDITIONAL
// Researches and creates a new psychology profile for unmatched buyer signals.
// SME: adjust research query templates, minimum evidence bar, add required fields,
//      improve naming conventions.
// ─────────────────────────────────────────────────────────────────────────────
const NEW_PROFILE_PROMPT = `\
You are ivy-new-profile. Research and define a new B2B buyer psychology profile.

UNMATCHED_SIGNALS (3+ recurring phrases not matching any existing profile):
{UNMATCHED_SIGNALS_JSON}

CLIENT: {CLIENT}

EXISTING_PROFILE_IDS (must not duplicate):
{EXISTING_PROFILES}

OUTPUT — call write_output with exactly:
{
  "profileId": "kebab-case-id",
  "profileLabel": "Display Name (2-4 words)",
  "description": "2 sentences — core motivation and decision-making lens",
  "signalPhrases": ["phrase 1", "phrase 2", "phrase 3"],
  "socialProofAngle": "quantified-savings | peer-comparison | proven-pattern | first-mover | time-saved",
  "contentModifiers": {
    "challengeFraming": "instruction starting with a verb (Lead with / Open with / Name the...)",
    "fomoFraming": "instruction starting with a verb",
    "journeyFraming": "instruction starting with a verb",
    "closingLineVariant": "closing line instruction or null"
  },
  "notes": [
    { "source": "URL or framework name", "finding": "1 sentence — research backing" }
  ]
}

RULES:
1. Use search_knowledge: '{buyer stance} B2B buyer psychology' and '{key phrases} enterprise software sales archetype'. Cap at 4 calls.
2. If an established archetype matches: use their terminology for profileLabel. Cite source.
3. signalPhrases: include UNMATCHED_SIGNALS plus 2-4 additional from research.
4. contentModifiers: actionable writing instructions — start every field with a verb.
5. profileId must not match any EXISTING_PROFILE_IDS.
6. notes[].source must be a real URL, named framework, or 'DataSkate field observation: {client}'.

Call write_output once when done.`;

// ─────────────────────────────────────────────────────────────────────────────
// EB_PROFILE_PROMPT — ivy-eb-profile (sonnet, $0.10) — CONDITIONAL
// Infers economic buyer profile from champion-attributed quotes and buyerMap.
// SME: add title→profile heuristics, improve confidence tiers,
//      add industry-specific EB patterns.
// ─────────────────────────────────────────────────────────────────────────────
const EB_PROFILE_PROMPT = `\
You are ivy-eb-profile. Infer the economic buyer's psychology profile from champion-attributed evidence.

CALLER_ROLE: {CALLER_ROLE}
CALLER_TITLE: {CALLER_TITLE}

EB_ATTRIBUTED_QUOTES (phrases where champion describes EB priorities — may be empty):
{EB_ATTRIBUTED_QUOTES_JSON}

EB_BUYER_MAP (Vera web-researched EB candidates):
{EB_BUYER_MAP_JSON}

PROFILES (signal phrase library):
{PROFILES_JSON}

OUTPUT — call write_output with exactly:
{
  "isSameAsCaller": false,
  "inferredTitle": "string or null",
  "inferredFrom": "verbatim phrase that revealed EB identity/psychology, or null",
  "profile": "profile-id or null",
  "profileLabel": "display label or null",
  "profileConfidence": "high | medium | low | unknown",
  "profileRationale": "2-3 sentences — evidence source (attributed transcript / Vera hint / title heuristic / fallback)"
}

RULES:
1. Score EB_ATTRIBUTED_QUOTES against PROFILES signal phrases. 2+ distinct matches = high; 1 match = medium.
2. If empty quotes: check EB_BUYER_MAP.ebCandidates for angleForIvy → medium confidence assignment.
3. If no attributed quotes and no buyerMap match: apply title heuristics (CFO/Finance → roi-analytical; CEO/Owner → visionary-strategic or roi-analytical; COO/VP Ops → operational-pragmatist). Low confidence.
4. If no evidence at all: profile = null, profileConfidence = 'unknown'.
5. inferredTitle: from ebAttributedQuotes first ('my CFO' → 'CFO'), then EB_BUYER_MAP.ebCandidates[0].title, then EB_BUYER_MAP.namedBuyers.economicBuyer.
6. profileRationale: be explicit about which source was used. Never claim transcript evidence if only title heuristics were used.
7. isSameAsCaller is always false here.

ALL DATA IS INJECTED. Call write_output once when done.`;

// ─────────────────────────────────────────────────────────────────────────────
// CONTENT_LAYERS_PROMPT — ivy-content-layers (haiku, $0.04)
// Copies contentModifiers from matched profiles. Applies secondary blending.
// Writes executiveSummaryFraming.
// SME: improve executiveSummaryFraming templates per EB profile (highest-impact tuning),
//      tighten secondary blending rules, add new fomoFirstField mappings.
// ─────────────────────────────────────────────────────────────────────────────
const CONTENT_LAYERS_PROMPT = `\
You are ivy-content-layers. Assemble champion and EB content framing layers from matched profiles.

PRIMARY_PROFILE_ID: {PRIMARY_PROFILE_ID}
SECONDARY_PROFILE_ID: {SECONDARY_PROFILE_ID}
EB_PROFILE_ID: {EB_PROFILE_ID}
EB_CONFIDENCE: {EB_CONFIDENCE}
IS_SAME_AS_CALLER: {IS_SAME_AS_CALLER}

CLIENT_CONTEXT:
{CLIENT_CONTEXT_JSON}

GUIDANCE_PROFILES (only matched profiles — 2-3 records):
{GUIDANCE_PROFILES_JSON}

OUTPUT — call write_output with exactly:
{
  "champion": {
    "challengeFraming": "verbatim from primary profile",
    "fomoFraming": "verbatim from primary profile",
    "journeyFraming": "verbatim from primary profile",
    "closingLineVariant": "verbatim from primary profile or null",
    "fomoFirstField": "savings | time | peer",
    "socialProofAngle": "quantified-savings | peer-comparison | proven-pattern | first-mover | time-saved"
  },
  "economicBuyer": {
    "executiveSummaryFraming": "1-sentence verb-first instruction for opening exec summary, or null if EB unknown",
    "challengeFraming": "verbatim from EB profile or null",
    "fomoFraming": "verbatim from EB profile or null",
    "closingLineVariant": "verbatim from EB profile or null",
    "fomoFirstField": "savings | time | peer | null",
    "socialProofAngle": "quantified-savings | peer-comparison | proven-pattern | first-mover | time-saved | null"
  },
  "blendNote": "1 sentence on secondary modifier applied, or null"
}

RULES:
1. Find PRIMARY_PROFILE_ID in GUIDANCE_PROFILES. Copy all contentModifiers verbatim to champion layer.
2. fomoFirstField: use profile record value, or derive: quantified-savings→savings, time-saved→time, peer-comparison→peer, else→savings.
3. Secondary blending: if SECONDARY_PROFILE_ID is not null and found — pick the ONE field most distinctly different from primary that adds value without conflict. Apply that field from secondary to champion. Write blendNote.
4. EB layer: if IS_SAME_AS_CALLER='true' → copy champion layer exactly. If EB_CONFIDENCE='unknown' → all EB fields null. Else: find EB_PROFILE_ID in GUIDANCE_PROFILES and copy verbatim.
5. executiveSummaryFraming: 1-sentence verb-first instruction for the EB's lens.
   roi-analytical → 'Open with a payback period and cost figure before naming any feature.'
   operational-pragmatist → 'Open with the specific manual task that stops on go-live day, framed as operational risk relief.'
   visionary-strategic → 'Open with the Year 2 AI capability unlock, framed as a platform decision made once.'
   risk-averse-conservative → 'Open with the managed service model and what is preserved, not what changes.'
   Personalize using CLIENT_CONTEXT.companyName where natural. Null if EB_CONFIDENCE='unknown'.

ALL DATA IS INJECTED. Call write_output once when done.`;

// ── Profile file helpers ───────────────────────────────────────────────────────
let _detection = null, _guidance = null;
function detectionProfiles() {
  if (!_detection) {
    try {
      _detection = JSON.parse(fs.readFileSync(
        path.join(ROOT, 'commons/sales/psychology-profiles-detection.json'), 'utf8'
      )).profiles || [];
    } catch (_) { _detection = []; }
  }
  return _detection;
}
function guidanceProfiles() {
  if (!_guidance) {
    try {
      _guidance = JSON.parse(fs.readFileSync(
        path.join(ROOT, 'commons/sales/psychology-profiles-guidance.json'), 'utf8'
      )).profiles || [];
    } catch (_) { _guidance = []; }
  }
  return _guidance;
}

// ── Caller signal phrase lists ─────────────────────────────────────────────────
const CHAMPION_SIGNALS = [
  'need to run', 'my boss', 'need approval', 'my cfo', 'my ceo', 'my vp', 'my president',
  'i use it day to day', "we'd have to get", 'make the case', 'get sign-off',
  'check with', 'run by', 'get approval', 'bring to', 'pass it up',
];
const EB_SIGNALS = [
  'i own the budget', 'i sign off', 'i make the final', 'my team uses',
  'i brought this', 'i decide', 'my call', 'i have authority', 'i approved',
];

function extractCallerSignalLines(sage) {
  const allSignals = [...CHAMPION_SIGNALS, ...EB_SIGNALS];
  const candidates = [];
  for (const sf of sage.systemFindings || []) {
    const q = sf.sourceQuote || '';
    if (allSignals.some(s => q.toLowerCase().includes(s))) candidates.push(q);
  }
  for (const sig of sage.signals || []) {
    const t = sig.triggerPhrase || '';
    if (allSignals.some(s => t.toLowerCase().includes(s))) candidates.push(t);
  }
  for (const sk of sage.quotes?.skepticismSignals || []) {
    if (allSignals.some(s => sk.toLowerCase().includes(s))) candidates.push(sk);
  }
  return [...new Set(candidates)].slice(0, 40);
}

// ── Empirical write-back — zero LLM cost ──────────────────────────────────────
function runEmpiricalWriteback(primaryProfileId, clientSlug, matchedPhrases) {
  if (!primaryProfileId) return;
  try {
    const projectsDir = path.join(ROOT, 'projects');
    const priorMatches = [];
    for (const client of fs.readdirSync(projectsDir)) {
      if (client === clientSlug) continue;
      const ivyPath = path.join(projectsDir, client, 'scoping/run/ivy.json');
      if (!fs.existsSync(ivyPath)) continue;
      try {
        const ivyData = JSON.parse(fs.readFileSync(ivyPath, 'utf8'));
        if (ivyData.psychologyProfile?.primaryProfile === primaryProfileId) {
          priorMatches.push({
            client,
            phrases: (ivyData.psychologyProfile?.matchedPhrases?.[primaryProfileId] || []).slice(0, 3),
          });
        }
      } catch (_) {}
    }
    if (priorMatches.length === 0) return;
    const detPath = path.join(ROOT, 'commons/sales/psychology-profiles-detection.json');
    if (!fs.existsSync(detPath)) return;
    const detData = JSON.parse(fs.readFileSync(detPath, 'utf8'));
    const profile = (detData.profiles || []).find(p => p.id === primaryProfileId);
    if (!profile) return;
    if (!profile.notes) profile.notes = [];
    for (const m of priorMatches) {
      if (!profile.notes.some(n => (n.source || '').includes(m.client))) {
        profile.notes.push({
          source:  `observed in ${m.client}`,
          finding: `signal phrases matched: ${m.phrases.join(', ')}`,
        });
      }
    }
    fs.writeFileSync(detPath, JSON.stringify(detData, null, 2));
    console.log(`    [ivy-writeback] notes appended for ${priorMatches.length} prior client(s) on '${primaryProfileId}'`);
  } catch (e) {
    console.log(`    [ivy-writeback] skipped — ${e.message}`);
  }
}

const IVY_SUB_INSTRUCTION = `Execute your task. ALL DATA IS INJECTED — do NOT call read_stage or read any files. Call write_output once when done.`;

// ── Main runner ────────────────────────────────────────────────────────────────
export async function runIvy({ agentDef, clientSlug, mcpClient }) {
  // Load source files once
  let sage = {}, ctx = {};
  try {
    const sagePath = path.join(ROOT, 'projects', clientSlug, 'scoping/run/sage.json');
    if (fs.existsSync(sagePath)) sage = JSON.parse(fs.readFileSync(sagePath, 'utf8'));
  } catch (_) {}
  try {
    const ctxPath = path.join(ROOT, 'projects', clientSlug, 'company_context.json');
    if (fs.existsSync(ctxPath)) ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
  } catch (_) {}

  // Trim data slices — each sub-agent gets only what it needs
  const contactSignalsJson = JSON.stringify({
    contactTitle:      ctx.contactTitle  || null,
    contactName:       ctx.contactName   || null,
    companyName:       ctx.companyName   || null,
    namedContacts:     (sage.namedContacts || []).slice(0, 10).map(c => ({
      name: c.name, title: c.title,
    })),
    callerSignalLines: extractCallerSignalLines(sage),
    businessContext:   {
      engagementType: sage.businessContext?.engagementType || null,
      goLiveUrgency:  sage.businessContext?.goLiveUrgency  || null,
      budgetSignals:  sage.businessContext?.budgetSignals  || null,
    },
  }, null, 2);

  // Transcript context: pre-extracted quotes + source quotes embedded in sage output
  const transcriptContextJson = JSON.stringify({
    quotes:                 sage.quotes || {},
    sourceQuotes:           (sage.systemFindings || [])
                              .filter(f => f.sourceQuote)
                              .map(f => ({ system: f.system, quote: f.sourceQuote })),
    signalTriggerPhrases:   (sage.signals || [])
                              .filter(s => s.triggerPhrase)
                              .map(s => ({ signal: s.signal, phrase: s.triggerPhrase })),
    architectKnowledge:     (sage.architectKnowledge || []).map(a => ({
                              speaker: a.speaker, finding: a.finding,
                            })),
    budgetSignals:          sage.businessContext?.budgetSignals || null,
  }, null, 2);

  const profilesDetectionJson = JSON.stringify({
    profiles: detectionProfiles().map(p => ({
      id:                 p.id,
      label:              p.label || p.id,
      signalPhrases:      p.signalPhrases || [],
      tiebreakerPriority: p.tiebreakerPriority || null,
      minimumSignals:     p.minimumSignals || 1,
      socialProofAngle:   p.socialProofAngle || null,
    })),
  }, null, 2);

  const veraBuyerHintsJson = JSON.stringify({
    buyerMapPeople: (ctx.buyerMap?.people || []).map(p => ({
      name:        p.name,
      title:       p.title,
      dealRole:    p.dealRole,
      angleForIvy: p.angleForIvy || null,
      webEvidence: p.webEvidence ? {
        priorRole:         p.webEvidence.priorRole,
        tenureMonths:      p.webEvidence.tenureMonths,
        backgroundSummary: p.webEvidence.backgroundSummary,
      } : null,
    })),
    namedBuyers: ctx.namedBuyers || null,
  }, null, 2);

  const cache = subagentCache(clientSlug, 'ivy');

  // ── Wave 1: ivy-caller-role ──────────────────────────────────────────────────
  console.log(`    [ivy] Wave 1 — ivy-caller-role`);
  const p1 = await cache.runOrLoad('ivy-caller-role', () => runSubStep({
    agentSlug: 'ivy', name: 'ivy-caller-role', model: 'classifier',
    prompt: CALLER_ROLE_PROMPT.replace('{CONTACT_SIGNALS_JSON}', contactSignalsJson),
    ceiling: 0.04, agentDef, clientSlug, mcpClient,
    userInstruction: IVY_SUB_INSTRUCTION,
  }), 'ivy-caller-role (haiku, $0.04)');

  const callerResult = p1.output || {};
  const callerRole   = callerResult.callerRole  || 'unknown';
  const callerTitle  = callerResult.callerTitle || null;

  // ── Wave 2: ivy-champion-score ‖ ivy-quote-extract (parallel) ───────────────
  console.log(`    [ivy] Wave 2 — ivy-champion-score ‖ ivy-quote-extract (parallel)`);
  const [p2, p3] = await Promise.all([
    cache.runOrLoad('ivy-champion-score', () => runSubStep({
      agentSlug: 'ivy', name: 'ivy-champion-score', model: 'analyst',
      prompt: CHAMPION_SCORE_PROMPT
        .replace('{TRANSCRIPT_CONTEXT_JSON}', transcriptContextJson)
        .replace('{PROFILES_JSON}',           profilesDetectionJson)
        .replace('{VERA_BUYER_HINTS_JSON}',   veraBuyerHintsJson)
        .replace('{CALLER_ROLE}',             callerRole)
        .replace('{CALLER_TITLE}',            callerTitle || 'unknown'),
      ceiling: 0.06, agentDef, clientSlug, mcpClient,
      userInstruction: IVY_SUB_INSTRUCTION,
    }), 'ivy-champion-score (sonnet, $0.12)'),

    cache.runOrLoad('ivy-quote-extract', () => runSubStep({
      agentSlug: 'ivy', name: 'ivy-quote-extract', model: 'extractor',
      prompt: QUOTE_EXTRACT_PROMPT.replace('{TRANSCRIPT_CONTEXT_JSON}', transcriptContextJson),
      ceiling: 0.05, agentDef, clientSlug, mcpClient,
      userInstruction: IVY_SUB_INSTRUCTION,
    }), 'ivy-quote-extract (haiku, $0.05)'),
  ]);

  const championScore = p2.output || {};
  const quoteExtract  = p3.output || {};

  // ── Wave 2b: ivy-new-profile (conditional) ───────────────────────────────────
  let p2b = null;
  const newProfileSuspected = championScore.newProfileSuspected === true
    && Array.isArray(championScore.unmatchedSignals)
    && championScore.unmatchedSignals.length >= 3;

  if (newProfileSuspected) {
    console.log(`    [ivy] Wave 2b — ivy-new-profile (${championScore.unmatchedSignals.length} unmatched signals)`);
    const existingIds = detectionProfiles().map(p => `${p.id} (${p.label || p.id})`).join(', ');
    p2b = await cache.runOrLoad('ivy-new-profile', () => runSubStep({
      agentSlug: 'ivy', name: 'ivy-new-profile', model: 'analyst',
      prompt: NEW_PROFILE_PROMPT
        .replace('{UNMATCHED_SIGNALS_JSON}', JSON.stringify(championScore.unmatchedSignals, null, 2))
        .replace('{CLIENT}',                clientSlug)
        .replace('{EXISTING_PROFILES}',     existingIds),
      ceiling: 0.20, agentDef, clientSlug, mcpClient,
      userInstruction: IVY_SUB_INSTRUCTION,
    }), 'ivy-new-profile (sonnet, $0.20)');
  }

  // New profile overrides primaryProfile if created
  const primaryProfileId   = p2b?.output?.profileId || championScore.primaryProfile || 'operational-pragmatist';
  const secondaryProfileId = championScore.secondaryProfile || null;

  // ── Wave 3: ivy-eb-profile (conditional on callerRole='champion') ────────────
  let p4 = null;
  if (callerRole === 'champion') {
    console.log(`    [ivy] Wave 3 — ivy-eb-profile`);
    const ebBuyerMapJson = JSON.stringify({
      namedBuyers:  ctx.namedBuyers || null,
      ebCandidates: (ctx.buyerMap?.people || [])
        .filter(p => (p.dealRole || '').toLowerCase().includes('economicbuyer')
                  || (p.dealRole || '').toLowerCase().includes('economic-buyer')
                  || (p.dealRole || '').toLowerCase().includes('economic buyer'))
        .map(p => ({
          name: p.name, title: p.title, dealRole: p.dealRole,
          angleForIvy: p.angleForIvy || null,
          webEvidence: p.webEvidence || null,
        })),
    }, null, 2);

    p4 = await cache.runOrLoad('ivy-eb-profile', () => runSubStep({
      agentSlug: 'ivy', name: 'ivy-eb-profile', model: 'analyst',
      prompt: EB_PROFILE_PROMPT
        .replace('{CALLER_ROLE}',               callerRole)
        .replace('{CALLER_TITLE}',              callerTitle || 'unknown')
        .replace('{EB_ATTRIBUTED_QUOTES_JSON}', JSON.stringify(quoteExtract.ebAttributedQuotes || [], null, 2))
        .replace('{EB_BUYER_MAP_JSON}',         ebBuyerMapJson)
        .replace('{PROFILES_JSON}',             profilesDetectionJson),
      ceiling: 0.10, agentDef, clientSlug, mcpClient,
      userInstruction: IVY_SUB_INSTRUCTION,
    }), 'ivy-eb-profile (sonnet, $0.10)');
  }

  const ebResult = callerRole === 'economic-buyer'
    ? {
        isSameAsCaller:    true,
        inferredTitle:     null,
        inferredFrom:      null,
        profile:           primaryProfileId,
        profileLabel:      null,
        profileConfidence: 'high',
        profileRationale:  'Caller is the economic buyer — EB profile mirrors champion.',
      }
    : (p4?.output || { isSameAsCaller: false, profile: null, profileConfidence: 'unknown' });

  const ebProfileId = ebResult.isSameAsCaller ? primaryProfileId : (ebResult.profile || null);

  // ── Wave 4: ivy-content-layers + empirical-writeback (parallel) ──────────────
  console.log(`    [ivy] Wave 4 — ivy-content-layers + empirical-writeback`);

  const matchedIds = [primaryProfileId, secondaryProfileId, ebProfileId].filter(Boolean);
  const guidanceSliceJson = JSON.stringify({
    profiles: guidanceProfiles()
      .filter(p => matchedIds.includes(p.id))
      .map(p => ({
        id: p.id, label: p.label,
        challengeFraming:       p.challengeFraming       || null,
        fomoFraming:            p.fomoFraming            || null,
        journeyFraming:         p.journeyFraming         || null,
        closingLineVariant:     p.closingLineVariant     || null,
        fomoFirstField:         p.fomoFirstField         || 'savings',
        socialProofAngle:       p.socialProofAngle       || null,
        executiveSummaryPrompt: p.executiveSummaryPrompt || null,
      })),
  }, null, 2);

  const clientContextJson = JSON.stringify({
    companyName: ctx.companyName || null,
    industry:    ctx.industry || sage.businessContext?.industry || null,
  }, null, 2);

  const [p5] = await Promise.all([
    cache.runOrLoad('ivy-content-layers', () => runSubStep({
      agentSlug: 'ivy', name: 'ivy-content-layers', model: 'extractor',
      prompt: CONTENT_LAYERS_PROMPT
        .replace('{PRIMARY_PROFILE_ID}',     primaryProfileId)
        .replace('{SECONDARY_PROFILE_ID}',   secondaryProfileId || 'null')
        .replace('{EB_PROFILE_ID}',          ebProfileId        || 'null')
        .replace('{EB_CONFIDENCE}',          ebResult.profileConfidence || 'unknown')
        .replace('{IS_SAME_AS_CALLER}',      String(ebResult.isSameAsCaller === true))
        .replace('{GUIDANCE_PROFILES_JSON}', guidanceSliceJson)
        .replace('{CLIENT_CONTEXT_JSON}',    clientContextJson),
      ceiling: 0.04, agentDef, clientSlug, mcpClient,
      userInstruction: IVY_SUB_INSTRUCTION,
    }), 'ivy-content-layers (haiku, $0.04)'),

    Promise.resolve().then(() =>
      runEmpiricalWriteback(primaryProfileId, clientSlug, championScore.matchedPhrases || {})
    ),
  ]);

  const contentLayers = p5?.output || {};

  // ── Merge → ivy.json ─────────────────────────────────────────────────────────
  cache.clearIfAllSucceeded([p1, p2, p3, p4, p5].filter(Boolean));
  const totalCost = [p1, p2, p3, p2b, p4, p5]
    .filter(Boolean).reduce((s, r) => s + (r.cost || 0), 0);

  const newProfileRecord = p2b?.output || null;
  const det = detectionProfiles();
  const primaryProfileLabel = newProfileRecord?.profileLabel
    || det.find(p => p.id === primaryProfileId)?.label
    || primaryProfileId;
  const secondaryProfileLabel = secondaryProfileId
    ? (det.find(p => p.id === secondaryProfileId)?.label || secondaryProfileId)
    : null;

  const ivy = {
    status:      'complete',
    client:      clientSlug,
    generatedAt: new Date().toISOString(),

    callerRole,
    callerTitle,

    psychologyProfile: {
      primaryProfile:       primaryProfileId,
      primaryProfileLabel,
      secondaryProfile:     secondaryProfileId,
      secondaryProfileLabel,
      signalCounts:         championScore.signalCounts   || {},
      matchedPhrases:       championScore.matchedPhrases || {},
      primaryPainQuote:     quoteExtract.primaryPainQuote  || null,
      aspirationQuote:      quoteExtract.aspirationQuote   || null,
      skepticismSignals:    quoteExtract.skepticismSignals  || [],
      excitementPhrases:    quoteExtract.excitementPhrases  || [],
      ebAttributedQuotes:   quoteExtract.ebAttributedQuotes || [],
      blendNote:            contentLayers.blendNote || championScore.blendNote || null,
      detectedAt:           new Date().toISOString().split('T')[0],
      newProfileCreated:    newProfileRecord !== null,
      newProfileId:         newProfileRecord?.profileId || null,
    },

    economicBuyer: {
      isSameAsCaller:    ebResult.isSameAsCaller    ?? (callerRole === 'economic-buyer'),
      inferredTitle:     ebResult.inferredTitle     || null,
      inferredFrom:      ebResult.inferredFrom      || null,
      profile:           ebProfileId,
      profileLabel:      ebResult.profileLabel
                         || (ebProfileId ? (det.find(p => p.id === ebProfileId)?.label || ebProfileId) : null),
      profileConfidence: ebResult.profileConfidence || 'unknown',
      profileRationale:  ebResult.profileRationale  || null,
    },

    veraBuyerMapHintIntegration: championScore.veraBuyerMapHintIntegration || {
      championHintProfileId: null,
      championHintMatch:     'transcript-only',
      ebHintProfileId:       null,
      ebHintMatch:           'not-applicable',
      reconciliationNote:    null,
    },

    contentLayers: {
      downstreamRouting: {
        championLayer:      'Hawk/Petra/Quinn read this for proposal body — challenge description, Stage 1-2-3 bullets, team benefit language',
        economicBuyerLayer: 'Hawk/Petra/Mira read this for executive summary, ROI section, FOMO entries, and closing',
      },
      champion:      contentLayers.champion      || {},
      economicBuyer: contentLayers.economicBuyer || {},
    },
  };

  const hasContent = ivy.callerRole !== 'unknown'
    || Object.keys(ivy.psychologyProfile.signalCounts).length > 0;

  return { cost: totalCost, killed: !hasContent, output: hasContent ? ivy : null };
}
