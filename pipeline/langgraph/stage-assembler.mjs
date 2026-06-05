/**
 * Stage assembler for the LangGraph pipeline.
 *
 * Ported from pipeline/scout/mcp/scout-context.js (CommonJS) to ESM.
 * Called in graph.mjs before each agent node runs to write
 * projects/{client}/scoping/run/{agent}-stage.json — a focused, pre-projected
 * context bundle so agents don't need to load large raw JSON files themselves.
 *
 * Key difference from scout-context.js:
 *   - Updated INPUT_PROJECTION and stage builders to match the new multi-step
 *     runner output schemas (rex-runner, flo-runner, hawk-runner, vera-runner).
 *   - Pure ESM — no require().
 *
 * Public API:
 *   buildAndWriteStage(agentSlug, clientSlug, completedAgents) → stagePath
 */
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ROOT         = path.resolve(fileURLToPath(import.meta.url), '../../..');
const PIPELINE_JSON = path.join(ROOT, 'pipeline/scout/pipeline.json');
const PROJECTS_DIR = path.join(ROOT, 'projects');
const GRAPH_DIR    = path.join(ROOT, 'pipeline/scout/graph');

const PROPOSAL_STRUCTURE_MD  = path.join(ROOT, 'commons/sales/proposal-structure.md');
const REFERENCE_NETWORK_JSON = path.join(ROOT, 'commons/sales/reference-network.json');
const PSYCH_PROFILES_JSON    = path.join(ROOT, 'commons/sales/psychology-profiles.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function readText(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); }
  catch { return null; }
}

function isoNow() { return new Date().toISOString(); }

// Resolve agent output path from pipeline.json (relative outputFile → absolute)
let _pipeline = null;
function getPipeline() {
  if (!_pipeline) _pipeline = readJson(PIPELINE_JSON);
  return _pipeline;
}

function agentOutputPath(clientSlug, agentSlug) {
  const pipeline = getPipeline();
  const agent = (pipeline?.agents || []).find(a => a.slug === agentSlug);
  if (!agent) return null;
  return path.join(PROJECTS_DIR, clientSlug, agent.outputFile);
}

function readAgentOutput(clientSlug, agentSlug) {
  const p = agentOutputPath(clientSlug, agentSlug);
  if (!p || !fs.existsSync(p)) return null;
  return readJson(p);
}

// ── Graph reference accessors ─────────────────────────────────────────────────

function getReferenceSections(slug, headingPatterns) {
  const node = readJson(path.join(GRAPH_DIR, 'nodes', 'reference', `${slug}.json`));
  if (!node) return [];
  return (node.sections || []).filter(s =>
    headingPatterns.some(p =>
      p instanceof RegExp ? p.test(s.heading) : s.heading.toLowerCase().includes(p.toLowerCase())
    )
  );
}

// ── INPUT_PROJECTION map ─────────────────────────────────────────────────────
// Updated for new multi-step runner output schemas:
//   rex-runner  → systemProfiles, detectedSystems, confirmedFlows, potentialFlows, p0Blockers
//   flo-runner  → confirmedFlows, potentialFlows, p0Blockers, pricing, flags
//   vera-runner → company, businessObjects, aiJourney, systemPrerequisites, corporateStack,
//                 dealUrgencyMultipliers, competitorFOMO, nearbyPeers, buyerMap, namedBuyers

const INPUT_PROJECTION = {
  vera:  { sage: ['businessContext', 'confirmedFlows', 'potentialFlows', 'signals', 'namedContacts'] },
  drew:  { vera: ['corporateStack', 'company'], sage: ['confirmedFlows'] },
  rex:   { vera: ['company', 'systemPrerequisites'] },
  ivy:   { vera: ['buyerMap', 'namedBuyers'], sage: ['namedContacts'] },
  flo:   { vera: ['corporateStack', 'company', 'corporateStackEnrichment'], drew: ['siblingBrands', 'potentialUnmappedSiblings'] },
  hawk:  { vera: ['company', 'aiJourney', 'corporateStack', 'dealUrgencyMultipliers', 'competitorFOMO', 'credentialingAnchors'],
           rex:  ['p0Blockers'],
           flo:  ['p0Blockers', 'confirmedFlows', 'potentialFlows', 'flags'] },
  petra: { vera: ['company', 'buyerMap', 'namedBuyers', 'dealUrgencyMultipliers', 'aiJourney'],
           rex:  ['p0Blockers'],
           flo:  ['confirmedFlows', 'potentialFlows', 'p0Blockers', 'pricing'] },
  // quinn reads company_context.json + project.json directly — no agent projection needed
  quinn: {},
  mira:  { vera: ['company'], flo: ['confirmedFlows', 'pricing'] },
};

function buildInputContract(agentSlug, clientSlug, completedAgents) {
  const projections = INPUT_PROJECTION[agentSlug] || {};
  const contract = { _generatedAt: isoNow(), _forAgent: agentSlug };

  for (const [sourceAgent, fields] of Object.entries(projections)) {
    if (!completedAgents.includes(sourceAgent)) continue;
    const data = readAgentOutput(clientSlug, sourceAgent);
    if (!data) continue;
    const projected = {};
    for (const field of fields) {
      if (data[field] !== undefined) projected[field] = data[field];
    }
    if (Object.keys(projected).length > 0) contract[sourceAgent] = projected;
  }
  return contract;
}

// ── Per-agent stage builders ─────────────────────────────────────────────────

function buildSageStage(clientSlug) {
  const fkSections   = getReferenceSections('field-knowledge', ['Index', /^FK-\d+/]);
  const planSections = getReferenceSections('planning-context', ['Critical Notes']);
  return {
    _generatedAt: isoNow(),
    _forAgent: 'sage',
    fieldKnowledgeSections: fkSections,
    planningNotes:          planSections,
  };
}

function buildVeraStage(clientSlug, completedAgents) {
  return buildInputContract('vera', clientSlug, completedAgents);
}

function buildDrewStage(clientSlug) {
  // Read vera.json + sage.json directly from disk — Drew may run in a fresh LangGraph
  // session where vera is not in completedAgents (completed in a prior session).
  const stage = { _generatedAt: isoNow(), _forAgent: 'drew' };
  const veraData = readAgentOutput(clientSlug, 'vera');
  if (veraData) {
    stage.vera = {
      corporateStack: veraData.corporateStack ?? null,
      company:        veraData.company        ?? null,
    };
  }
  const sageData = readAgentOutput(clientSlug, 'sage');
  if (sageData) {
    stage.sage = { confirmedFlows: sageData.confirmedFlows ?? null };
  }
  return stage;
}

function buildRexStage(clientSlug, completedAgents) {
  const proj = buildInputContract('rex', clientSlug, completedAgents);
  const sageData = readAgentOutput(clientSlug, 'sage');
  if (sageData) {
    proj.sage = {
      confirmedFlows: sageData.confirmedFlows ?? null,
      potentialFlows: sageData.potentialFlows ?? null,
      signals:        sageData.signals        ?? null,
    };
  }
  return proj;
}

function buildIvyStage(clientSlug, completedAgents) {
  return buildInputContract('ivy', clientSlug, completedAgents);
}

function buildFloStage(clientSlug, completedAgents) {
  const proj = buildInputContract('flo', clientSlug, completedAgents);

  const sageData = readAgentOutput(clientSlug, 'sage');
  if (sageData) {
    proj.sage = {
      confirmedFlows: sageData.confirmedFlows ?? null,
      potentialFlows: sageData.potentialFlows ?? null,
    };
  }

  // rex-runner outputs systemProfiles + confirmedFlows + p0Blockers
  const rexData = readAgentOutput(clientSlug, 'rex');
  if (rexData) {
    proj.rex = {
      systemProfiles: rexData.systemProfiles ?? null,
      confirmedFlows: rexData.confirmedFlows ?? null,
      p0Blockers:     rexData.p0Blockers     ?? null,
    };
  }

  // Drew sibling cards — read from disk (may not be in completedAgents if cross-session)
  const drewData = readAgentOutput(clientSlug, 'drew');
  if (drewData && drewData.status !== 'skipped') {
    proj.drew = {
      siblingBrands:             drewData.siblingBrands             ?? null,
      potentialUnmappedSiblings: drewData.potentialUnmappedSiblings ?? null,
    };
  }
  return proj;
}

function buildHawkStage(clientSlug, completedAgents) {
  const proj = buildInputContract('hawk', clientSlug, completedAgents);

  const ivyData = readAgentOutput(clientSlug, 'ivy');
  if (ivyData) {
    proj.ivy = { psychologyProfile: ivyData.psychologyProfile };
  }

  const sageData = readAgentOutput(clientSlug, 'sage');
  if (sageData) {
    proj.sage = {
      primaryPainQuote: sageData.quotes?.primaryPainQuote ?? null,
      aspirationQuote:  sageData.quotes?.aspirationQuote  ?? null,
    };
  }

  proj._proposalStructure = readText(PROPOSAL_STRUCTURE_MD);
  proj._referenceNetwork  = readJson(REFERENCE_NETWORK_JSON);

  // Only include psychology profiles if a secondary profile exists (28 KB)
  if (proj.ivy?.psychologyProfile?.secondaryProfile) {
    proj._psychologyGuidance = readJson(PSYCH_PROFILES_JSON);
  }
  return proj;
}

function buildPetraStage(clientSlug, completedAgents) {
  const proj = buildInputContract('petra', clientSlug, completedAgents);

  const sageData = readAgentOutput(clientSlug, 'sage');
  if (sageData) {
    proj.sage = {
      quotes:          sageData.quotes          ?? null,
      businessContext: sageData.businessContext ?? null,
    };
  }

  const ivyData = readAgentOutput(clientSlug, 'ivy');
  if (ivyData) proj.ivy = ivyData; // small (~9 KB)

  // Supplement hawk fields Petra uses
  const hawkData = readAgentOutput(clientSlug, 'hawk');
  if (hawkData) {
    proj.hawk = {
      challengeLead:            hawkData.challengeLead            ?? null,
      costOfWaiting:            hawkData.costOfWaiting            ?? null,
      fomoOrdered:              hawkData.fomoOrdered              ?? null,
      closingLine:              hawkData.closingLine              ?? null,
      portfolioTemplateFraming: hawkData.portfolioTemplateFraming ?? null,
      perPersonTalkingPoints:   hawkData.perPersonTalkingPoints   ?? null,
      competitorCounterpunch:   hawkData.competitorCounterpunch   ?? null,
    };
  }

  const projPath = path.join(PROJECTS_DIR, clientSlug, 'project.json');
  const projData = readJson(projPath);
  if (projData) {
    proj._project = {
      flowCount:       projData.flowCount       ?? null,
      pricingComputed: projData.pricingComputed ?? null,
      architect:       projData.architect       ?? null,
      architectEmail:  projData.architectEmail  ?? null,
    };
  }

  proj._proposalStructure = readText(PROPOSAL_STRUCTURE_MD);
  return proj;
}

function buildQuinnStage(clientSlug) {
  // Quinn reads only from orchestrator-maintained canonical files.
  // company_context.json is the single merged source of truth — the orchestrator
  // writes to it after every agent via assembleContext(). Quinn never touches
  // raw agent JSONs (vera.json, flo.json, rex.json, etc.).
  const ctx  = readJson(path.join(PROJECTS_DIR, clientSlug, 'company_context.json')) || {};
  const proj = readJson(path.join(PROJECTS_DIR, clientSlug, 'project.json'))          || {};

  return {
    _generatedAt:        isoNow(),
    _forAgent:           'quinn',

    // Integration flows — from sage + flo via orchestrator
    confirmedFlows:      ctx.confirmedFlows      ?? [],
    potentialFlows:      ctx.potentialFlows       ?? [],
    p0Blockers:          ctx.p0Blockers           ?? [],

    // System knowledge — from vera + rex via orchestrator
    systemPrerequisites: ctx.systemPrerequisites  ?? [],
    systemFindings:      ctx.systemFindings        ?? [],

    // People — from sage via orchestrator
    namedContacts:       ctx.namedContacts         ?? [],
    snapshot:            ctx.snapshot              ?? null,
    industry:            ctx.industry              ?? null,

    // Buyer psychology — from ivy via orchestrator
    psychologyProfile:   ctx.psychologyProfile     ?? null,

    // Project metadata — from project.json
    architect:           proj.architect            ?? null,
    architectEmail:      proj.architectEmail       ?? null,
    pricingComputed:     proj.pricingComputed       ?? null,
    displayName:         proj.displayName           ?? null,
  };
}

function buildSolStage(clientSlug, completedAgents) {
  const stage = { _generatedAt: isoNow(), _forAgent: 'sol' };

  // flo: confirmed flows + pricing + p0Blockers (core SOW inputs)
  const floData = readAgentOutput(clientSlug, 'flo');
  if (floData) {
    stage.flo = {
      confirmedFlows: floData.confirmedFlows ?? [],
      p0Blockers:     floData.p0Blockers     ?? [],
      pricing:        floData.pricing        ?? null,
    };
  }

  // rex: system profiles for credential requirements in assumptions
  const rexData = readAgentOutput(clientSlug, 'rex');
  if (rexData) {
    stage.rex = {
      systemProfiles: rexData.systemProfiles ?? [],
      p0Blockers:     rexData.p0Blockers     ?? [],
    };
  }

  // petra: oos + included items + deliverables (avoid regenerating what proposal already has)
  const petraData = readAgentOutput(clientSlug, 'petra');
  if (petraData?.proposalContent) {
    stage.petra = {
      proposalContent: {
        oos:         petraData.proposalContent.oos         ?? [],
        included:    petraData.proposalContent.included    ?? [],
        assumptions: petraData.proposalContent.assumptions ?? [],
        timeline:    petraData.proposalContent.timeline    ?? [],
        flows:       petraData.proposalContent.flows       ?? [],
      },
    };
  }

  // sage: discovery date for SOW basisDate
  const sageData = readAgentOutput(clientSlug, 'sage');
  if (sageData?.businessContext) {
    stage.sage = { businessContext: sageData.businessContext };
  }

  // project.json: client info, pricing, architect
  const projPath = path.join(PROJECTS_DIR, clientSlug, 'project.json');
  const projData = readJson(projPath);
  if (projData) {
    stage._project = {
      displayName:       projData.displayName       ?? null,
      legalName:         projData.legalName          ?? null,
      primaryContact:    projData.primaryContact     ?? null,
      architect:         projData.architect          ?? null,
      architectEmail:    projData.architectEmail     ?? null,
      targetGoLive:      projData.targetGoLive        ?? null,
      flowCount:         projData.flowCount           ?? null,
      pricingComputed:   projData.pricingComputed     ?? null,
      // Negotiated & accepted price — set by onProposalAccepted Cloud Function
      // Sol uses this as the authoritative fee in the SOW instead of computing from pricingComputed
      acceptedPrice:     projData.acceptedPrice       ?? null,
      acceptedModel:     projData.acceptedModel       ?? null,
      negotiationThread: projData.negotiationThread   ?? null,
    };
  }

  return stage;
}

function buildMiraStage(clientSlug, completedAgents) {
  const proj = buildInputContract('mira', clientSlug, completedAgents);

  const ivyData = readAgentOutput(clientSlug, 'ivy');
  if (ivyData) proj.ivy = ivyData;

  const hawkData = readAgentOutput(clientSlug, 'hawk');
  if (hawkData) {
    proj.hawk = {
      perPersonTalkingPoints:   hawkData.perPersonTalkingPoints   ?? null,
      portfolioTemplateFraming: hawkData.portfolioTemplateFraming ?? null,
      challengeLead:            hawkData.challengeLead            ?? null,
      costOfWaiting:            hawkData.costOfWaiting            ?? null,
    };
  }

  const sageData = readAgentOutput(clientSlug, 'sage');
  if (sageData) {
    proj.sage = { quotes: sageData.quotes ?? null };
  }

  const ccPath = path.join(PROJECTS_DIR, clientSlug, 'company_context.json');
  const cc = readJson(ccPath);
  if (cc) {
    proj._companyContext = {
      corporateStack:         cc.corporateStack         ?? null,
      dealUrgencyMultipliers: cc.dealUrgencyMultipliers ?? null,
      buyerMap:               cc.buyerMap               ?? null,
      namedBuyers:            cc.namedBuyers            ?? null,
      corporateProfile:       cc.corporateProfile       ?? null,
    };
  }
  return proj;
}

// ── Public API ────────────────────────────────────────────────────────────────

function buildAgentStage(agentSlug, clientSlug, completedAgents) {
  switch (agentSlug) {
    case 'sage':  return buildSageStage(clientSlug);
    case 'vera':  return buildVeraStage(clientSlug, completedAgents);
    case 'drew':  return buildDrewStage(clientSlug);
    case 'rex':   return buildRexStage(clientSlug, completedAgents);
    case 'ivy':   return buildIvyStage(clientSlug, completedAgents);
    case 'flo':   return buildFloStage(clientSlug, completedAgents);
    case 'hawk':  return buildHawkStage(clientSlug, completedAgents);
    case 'petra': return buildPetraStage(clientSlug, completedAgents);
    case 'quinn': return buildQuinnStage(clientSlug);
    case 'sol':   return buildSolStage(clientSlug, completedAgents);
    case 'mira':  return buildMiraStage(clientSlug, completedAgents);
    default:      return { _generatedAt: isoNow(), _forAgent: agentSlug, _note: 'no stage builder defined' };
  }
}

export function buildAndWriteStage(agentSlug, clientSlug, completedAgents) {
  const stage     = buildAgentStage(agentSlug, clientSlug, completedAgents);
  const stagePath = path.join(PROJECTS_DIR, clientSlug, 'scoping', 'run', `${agentSlug}-stage.json`);
  fs.mkdirSync(path.dirname(stagePath), { recursive: true });

  // Atomic write — protect against SIGKILL mid-write
  const tmp = `${stagePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(stage, null, 2));
  fs.renameSync(tmp, stagePath);

  return stagePath;
}
