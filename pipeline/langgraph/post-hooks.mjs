/**
 * Post-agent hooks — ported from pipeline/scout/orchestrate.js.
 *
 * Called by graph.mjs after each agent writes its output JSON.
 * Two layers:
 *   runUniversalHooks(slug, agentSlug) — runs after every agent
 *   runAgentHooks(slug, agentSlug)     — agent-specific work
 *
 * No LLM calls happen here — pure data transforms, renders, and deploys.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT         = path.resolve(fileURLToPath(import.meta.url), '../../..');
const PROJECTS_DIR = path.join(ROOT, 'projects');
const INBOX_DIR    = path.join(ROOT, '_inbox');

// ── Utilities ──────────────────────────────────────────────────────────────────

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return null; }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // Atomic write: write to temp file then rename so a SIGKILL mid-write never corrupts the target
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function mergeJson(filePath, updates) {
  const existing = readJson(filePath) || {};
  writeJson(filePath, deepMerge(existing, updates));
}

function deepMerge(target, source) {
  const out = Object.assign({}, target);
  for (const key of Object.keys(source)) {
    if (Array.isArray(source[key])) {
      out[key] = source[key];
    } else if (source[key] && typeof source[key] === 'object') {
      out[key] = deepMerge(target[key] || {}, source[key]);
    } else if (source[key] !== undefined && source[key] !== null) {
      out[key] = source[key];
    }
  }
  return out;
}

function isoNow() { return new Date().toISOString(); }
function today()   { return new Date().toISOString().split('T')[0]; }

// Shared timeout for all spawnSync subprocess calls (3 min)
const SPAWN_TIMEOUT_MS = 180_000;

// Safe slug characters — used to sanitize LLM-supplied keys before path joins
const SLUG_SAFE_RE = /^[a-z0-9][a-z0-9_-]*$/i;
function sanitizeSlug(raw) {
  if (!raw || typeof raw !== 'string') return null;
  // Strip anything that isn't alphanumeric, hyphen, or underscore
  const s = raw.replace(/[^a-z0-9_-]/gi, '').toLowerCase();
  return s.length ? s : null;
}

// Sanitize a string for safe embedding in Markdown/YAML — strips newlines and backticks
function sanitizeInlineText(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/[\r\n`]/g, ' ').trim();
}

// Quote a YAML scalar value if it contains special characters
function yamlScalar(raw) {
  if (!raw || typeof raw !== 'string') return '""';
  if (/[:\[\]{}&*!,|>'"%@`#\r\n]/.test(raw) || raw.trim() !== raw) {
    return `"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
  }
  return raw;
}

// ── assembleContext ────────────────────────────────────────────────────────────
// Merges run/{agent}.json → company_context.json after each agent completes.

export function assembleContext(slug, agentSlug) {
  const projectDir = path.join(PROJECTS_DIR, slug);
  const ctxPath    = path.join(projectDir, 'company_context.json');
  const ctx        = readJson(ctxPath) || {};

  const runFile = path.join(projectDir, 'scoping', 'run', `${agentSlug}.json`);
  const data    = readJson(runFile);
  if (!data) {
    console.log(`  [post-hooks] assembleContext(${agentSlug}): run file not found — skipping`);
    return;
  }

  switch (agentSlug) {

    case 'sage': {
      const updates = { generatedAt: isoNow() };
      if (data.businessContext) {
        if (data.businessContext.industry)           updates.industry = data.businessContext.industry;
        if (data.businessContext.companyDescription) updates.snapshot = data.businessContext.companyDescription;
      }
      if (Array.isArray(data.confirmedFlows))  updates.confirmedFlows = data.confirmedFlows;
      if (Array.isArray(data.potentialFlows))  updates.potentialFlows = data.potentialFlows;
      if (Array.isArray(data.signals))         updates.signals = data.signals.map(s => s.signal || s);
      if (Array.isArray(data.namedContacts))   updates.namedContacts  = data.namedContacts;
      Object.assign(ctx, updates);
      break;
    }

    case 'vera': {
      if (data.company) {
        const c = data.company;
        if (c.snapshot)        ctx.snapshot        = c.snapshot;
        if (c.industry)        ctx.industry        = c.industry;
        if (c.verticalSlug)    ctx.verticalSlug    = c.verticalSlug;
        if (c.hqLocation)      ctx.hqLocation      = c.hqLocation;
        if (c.revenueEstimate) ctx.revenueEstimate = c.revenueEstimate;
        if (c.revenueBracket)  ctx.revenueBracket  = c.revenueBracket;
        if (Array.isArray(c.businessObjects) && c.businessObjects.length)
          ctx.businessObjects = c.businessObjects;
        if (c.logoUrl !== undefined) ctx.logoUrl = c.logoUrl;
      }
      if (data.aiJourney)                           ctx.aiJourney           = data.aiJourney;
      if (Array.isArray(data.systemPrerequisites))  ctx.systemPrerequisites = data.systemPrerequisites;
      if (Array.isArray(data.nearbyPeers))          ctx.nearbyPeers         = data.nearbyPeers;
      if (Array.isArray(data.competitorFOMO))       ctx.competitorFOMO      = data.competitorFOMO;
      if (Array.isArray(data.aiThoughtStarters))    ctx.aiThoughtStarters   = data.aiThoughtStarters;
      ctx.generatedAt = isoNow();
      break;
    }

    case 'drew': {
      // Merge drew sibling cards into corporateStack so flo-portfolio and the corporate brief
      // have the full IT-leader + stack + applicableUseCases data without re-reading drew.json.
      if (data.status === 'skipped') break;
      ctx.corporateStack = ctx.corporateStack || {};
      ctx.corporateStack.operatingPlatform = ctx.corporateStack.operatingPlatform || {};
      if (Array.isArray(data.siblingBrands) && data.siblingBrands.length > 0) {
        // Merge drew cards into existing siblingBrands[] by name — preserve Vera's seed fields,
        // overlay Drew's research fields (itLeader, itStack, integrationSignal, etc.)
        const existing = ctx.corporateStack.operatingPlatform.siblingBrands || [];
        const nameKey  = s => String(s?.name || '').trim().toLowerCase();
        const byName   = new Map(existing.map(s => [nameKey(s), s]));
        for (const card of data.siblingBrands) {
          const key = nameKey(card);
          byName.set(key, { ...(byName.get(key) || {}), ...card });
        }
        ctx.corporateStack.operatingPlatform.siblingBrands = Array.from(byName.values());
      }
      if (Array.isArray(data.potentialUnmappedSiblings) && data.potentialUnmappedSiblings.length > 0) {
        ctx.corporateStack.operatingPlatform.potentialUnmappedSiblings = data.potentialUnmappedSiblings;
      }
      break;
    }

    case 'rex': {
      if (Array.isArray(data.systemFindings)) {
        ctx.systemFindings = [...(ctx.systemFindings || []), ...data.systemFindings];
      }
      if (Array.isArray(data.p0Blockers) && data.p0Blockers.length > 0) {
        ctx.p0Blockers = data.p0Blockers;
      }
      break;
    }

    case 'ivy': {
      if (data.psychologyProfile) ctx.psychologyProfile = data.psychologyProfile;
      break;
    }

    case 'flo': {
      if (Array.isArray(data.p0Blockers))     ctx.p0Blockers    = data.p0Blockers;
      if (Array.isArray(data.confirmedFlows)) ctx.confirmedFlows = data.confirmedFlows;
      if (Array.isArray(data.potentialFlows)) ctx.potentialFlows = data.potentialFlows;
      if (Array.isArray(data.portfolioOpportunities)) {
        ctx.portfolioOpportunities = data.portfolioOpportunities;
      }
      if (data.portfolioOpportunitiesTruncatedNote) {
        ctx.portfolioOpportunitiesTruncatedNote = data.portfolioOpportunitiesTruncatedNote;
      }
      break;
    }

    case 'hawk':
    case 'petra':
    case 'mira': {
      ctx.generatedAt = isoNow();
      break;
    }

    case 'quinn': {
      if (Array.isArray(data.p0Blockers) && data.p0Blockers.length > 0)
        ctx.p0Blockers = data.p0Blockers;
      if (data.aiJourney) ctx.aiJourney = data.aiJourney;
      if (Array.isArray(data.systemFindings) && data.systemFindings.length > 0) {
        const existing = ctx.systemFindings || [];
        const merged   = [...existing];
        for (const f of data.systemFindings) {
          if (!merged.find(e => e.system === f.system && e.finding === f.finding))
            merged.push(f);
        }
        ctx.systemFindings = merged;
      }
      ctx.generatedAt = isoNow();
      break;
    }
  }

  writeJson(ctxPath, ctx);
  console.log(`  [post-hooks] company_context.json updated (${agentSlug})`);
}

// ── aggregateDecisions ─────────────────────────────────────────────────────────
// Rebuilds decisions.json from all scoping/run/*-decisions.json files.

export function aggregateDecisions(slug) {
  const projectDir    = path.join(PROJECTS_DIR, slug);
  const runDir        = path.join(projectDir, 'scoping', 'run');
  const decisionsPath = path.join(projectDir, 'decisions.json');

  const decisionFiles = fs.existsSync(runDir)
    ? fs.readdirSync(runDir).filter(f => f.endsWith('-decisions.json')).sort()
    : [];
  if (!decisionFiles.length) return;

  const allDecisions = [];
  for (const file of decisionFiles) {
    const d = readJson(path.join(runDir, file));
    if (d && Array.isArray(d.decisions)) allDecisions.push(...d.decisions);
  }
  writeJson(decisionsPath, { client: slug, updatedAt: isoNow(), decisions: allDecisions });
  console.log(`  [post-hooks] decisions.json aggregated (${allDecisions.length} decisions)`);
}

// ── mergeVeraCorporateStackEnrichment ──────────────────────────────────────────
// Deep merge of vera.json corporateStack + buyerMap + contactCrossReferences
// into company_context.json. Orchestrator-owned write per agent-boundary rule.

export function mergeVeraCorporateStackEnrichment(slug) {
  const projectDir = path.join(PROJECTS_DIR, slug);
  const vera = readJson(path.join(projectDir, 'scoping', 'run', 'vera.json'));
  const ctx  = readJson(path.join(projectDir, 'company_context.json'));

  if (!vera || !ctx) {
    console.log(`  [post-hooks] mergeVeraCorporateStack: missing vera.json or company_context.json — skipped`);
    return;
  }

  ctx.corporateStack = ctx.corporateStack || {};

  // Step 1c seed merge
  if (vera.corporateStack && typeof vera.corporateStack === 'object') {
    const seed = vera.corporateStack;
    for (const key of ['ownership', 'operatingBrand', 'leadership', 'financialSponsor',
      'engagementEntity', 'subsidiaries', 'collaborators', 'strategicPartnerships',
      'dealUrgencyMultipliers', 'sourcesNote', 'confidence', 'researchedAt']) {
      if (seed[key] !== undefined) ctx.corporateStack[key] = seed[key];
    }
    if (seed.operatingPlatform) {
      ctx.corporateStack.operatingPlatform = ctx.corporateStack.operatingPlatform || {};
      for (const key of ['name', 'website', 'linkedIn', 'description', 'platformShape',
        'regionalStrategy', 'rollupHistoryNarrative', 'platformExecutiveTeam',
        'sourceUrl', 'relationshipUncertainty']) {
        if (seed.operatingPlatform[key] !== undefined)
          ctx.corporateStack.operatingPlatform[key] = seed.operatingPlatform[key];
      }
      if (Array.isArray(seed.operatingPlatform.siblingBrands))
        ctx.corporateStack.operatingPlatform.siblingBrands = seed.operatingPlatform.siblingBrands;
    }
  }

  // Step 2b enrichment — overlay onto seed siblings
  const enrich = vera.corporateStackEnrichment;
  if (enrich) {
    if (enrich.operatingPlatform && Array.isArray(enrich.operatingPlatform.siblingBrands)) {
      ctx.corporateStack.operatingPlatform = ctx.corporateStack.operatingPlatform || {};
      const seedSiblings = Array.isArray(ctx.corporateStack.operatingPlatform.siblingBrands)
        ? ctx.corporateStack.operatingPlatform.siblingBrands : [];
      const nameKey = (s) => String(s?.name || '').trim().toLowerCase();
      const byName  = new Map();
      for (const s of seedSiblings) if (nameKey(s)) byName.set(nameKey(s), s);
      for (const s of enrich.operatingPlatform.siblingBrands)
        if (nameKey(s)) byName.set(nameKey(s), { ...byName.get(nameKey(s)), ...s });
      ctx.corporateStack.operatingPlatform.siblingBrands = Array.from(byName.values());
      if (typeof enrich.operatingPlatform.siblingsTruncated === 'boolean')
        ctx.corporateStack.operatingPlatform.siblingsTruncated = enrich.operatingPlatform.siblingsTruncated;
    }
    if (enrich.financialSponsor && Array.isArray(enrich.financialSponsor.portfolioCompanies)) {
      ctx.corporateStack.financialSponsor = ctx.corporateStack.financialSponsor || {};
      ctx.corporateStack.financialSponsor.portfolioCompanies = enrich.financialSponsor.portfolioCompanies;
    }
  }

  // Step 2c buyer map
  if (vera.buyerMap && typeof vera.buyerMap === 'object') ctx.buyerMap = vera.buyerMap;
  if (vera.namedBuyers && typeof vera.namedBuyers === 'object') ctx.namedBuyers = vera.namedBuyers;

  // Contact cross-references → apply platformRole to namedContacts[]
  if (Array.isArray(vera.contactCrossReferences) && Array.isArray(ctx.namedContacts)) {
    for (const xref of vera.contactCrossReferences) {
      if (!xref?.name) continue;
      const xrefKey = String(xref.name).trim().toLowerCase();
      const contact = ctx.namedContacts.find(c => c?.name?.trim().toLowerCase() === xrefKey);
      if (contact) {
        contact.platformRole = {
          title:       xref.platformTitle || null,
          scope:       xref.platformScope || null,
          implication: xref.reclassificationImplication || null,
          isExecutiveSponsorCandidate: !!xref.isExecutiveSponsorCandidate,
        };
      }
    }
  }

  // Step 2d corporate profile
  if (typeof vera.corporateProfile === 'string' && vera.corporateProfile.length > 0) {
    ctx.corporateProfile = vera.corporateProfile;
    if (vera.corporateProfileMeta) ctx.corporateProfileMeta = vera.corporateProfileMeta;
  }

  if (Array.isArray(vera.dealUrgencyMultipliers))    ctx.dealUrgencyMultipliers    = vera.dealUrgencyMultipliers;
  if (Array.isArray(vera.forwardLookingTalkingPoints)) ctx.forwardLookingTalkingPoints = vera.forwardLookingTalkingPoints;
  if (Array.isArray(vera.intelTheBuyerLacks))        ctx.intelTheBuyerLacks        = vera.intelTheBuyerLacks;

  writeJson(path.join(projectDir, 'company_context.json'), ctx);
  console.log(`  [post-hooks] company_context.json — corporateStack + buyerMap + corporateProfile merged from vera.json`);
}

// ── writeClientRegistry ────────────────────────────────────────────────────────

export function writeClientRegistry(slug) {
  const registryPath = path.join(ROOT, 'projects/client-registry.json');
  const projectDir   = path.join(PROJECTS_DIR, slug);
  const project      = readJson(path.join(projectDir, 'project.json')) || {};
  const vera         = readJson(path.join(projectDir, 'scoping', 'run', 'vera.json')) || {};
  const flo          = readJson(path.join(projectDir, 'scoping', 'run', 'flo.json')) || {};
  const sage         = readJson(path.join(projectDir, 'scoping', 'run', 'sage.json')) || {};

  const systems = flo.confirmedFlows?.length
    ? flo.confirmedFlows.flatMap(f => f.systems || []).filter((v, i, a) => a.indexOf(v) === i)
    : (sage.systems || []).map(s => s.name).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

  const entry = {
    slug,
    displayName:    project.displayName || slug,
    vertical:       vera.company?.verticalSlug || null,
    sizeSegment:    vera.company?.revenueBracket || null,
    systems,
    architect:      project.architect || null,
    architectEmail: project.architectEmail || null,
    status:         'scoping',
    engagementDate: project.engagementDate || today(),
    projectContext: vera.company?.snapshot || null,
  };

  const registry = readJson(registryPath) || { clients: [] };
  if (!Array.isArray(registry.clients)) registry.clients = [];
  const idx = registry.clients.findIndex(c => c.slug === slug);
  if (idx >= 0) registry.clients[idx] = { ...registry.clients[idx], ...entry };
  else          registry.clients.push(entry);

  writeJson(registryPath, registry);
  console.log(`  [post-hooks] projects/client-registry.json updated`);
}

// ── mdToHtml ───────────────────────────────────────────────────────────────────
// Minimal markdown → HTML for Vera's corporate profile string.
// Used only by renderPitchKit — keeps the profile human-readable in JSON
// while emitting safe HTML for the Nunjucks template's | safe filter.

function mdToHtml(md) {
  if (typeof md !== 'string' || !md.length) return '';
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function inline(text) {
    const links = [];
    let s = String(text).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      links.push({ label, url }); return ` LINK${links.length - 1} `;
    });
    s = esc(s);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
    s = s.replace(/ LINK(\d+) /g, (_, i) => `<a href="${esc(links[+i].url)}" target="_blank" rel="noopener">${esc(links[+i].label)}</a>`);
    return s;
  }
  const blocks = md.replace(/\r\n/g, '\n').split(/\n{2,}/);
  const out = [];
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    const m = block.match(/^(#{2,3})\s+(.*)$/);
    if (m && !block.includes('\n')) { out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    const lines = block.split('\n');
    if (lines.every(l => /^\s*[-*]\s+/.test(l))) { out.push(`<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*[-*]\s+/,''))}</li>`).join('')}</ul>`); continue; }
    if (lines.every(l => /^\s*\d+\.\s+/.test(l))) { out.push(`<ol>${lines.map(l => `<li>${inline(l.replace(/^\s*\d+\.\s+/,''))}</li>`).join('')}</ol>`); continue; }
    out.push(`<p>${lines.map(inline).join('<br/>')}</p>`);
  }
  return out.join('\n');
}

// ── renderPitchKit ─────────────────────────────────────────────────────────────
// Assembles pitch-kit-content.json (Intel tab data) and runs Eleventy to produce
// /internal/{slug}.html. Called after vera (first render), drew (sibling enrichment),
// and hawk (per-person talking points merged in).

export function renderPitchKit(slug) {
  const projectDir = path.join(PROJECTS_DIR, slug);
  const project    = readJson(path.join(projectDir, 'project.json')) || {};
  const ctx        = readJson(path.join(projectDir, 'company_context.json')) || {};
  const hawk       = readJson(path.join(projectDir, 'scoping', 'run', 'hawk.json')) || {};
  const stack      = ctx.corporateStack || {};

  if (!stack.operatingBrand?.name) {
    console.log(`  [post-hooks] renderPitchKit: no corporateStack.operatingBrand — skipped`);
    return null;
  }

  // Merge hawk per-person talking points into buyer map people
  const hawkPerPerson = Array.isArray(hawk.perPersonTalkingPoints) ? hawk.perPersonTalkingPoints : [];
  const hawkByName    = new Map(hawkPerPerson.map(p => [String(p.name || '').trim().toLowerCase(), p]));
  const buyerMap      = ctx.buyerMap || {};
  const people        = (Array.isArray(buyerMap.people) ? buyerMap.people : []).map(p => {
    const hp = hawkByName.get(String(p.name || '').trim().toLowerCase());
    return { ...p, hawkTalkingPoint: hp?.hawkTalkingPoint || null, profileFraming: hp?.profileFraming || null };
  });

  // Pre-process dealUrgencyMultipliers into { tag, body } objects
  const dealUrgencyMultipliers = (ctx.dealUrgencyMultipliers || stack.dealUrgencyMultipliers || []).map(m => {
    const str = typeof m === 'string' ? m : (m.signal || String(m));
    const colonIdx = str.indexOf(':');
    if (colonIdx > 0) return { tag: str.slice(0, colonIdx).trim(), body: str.slice(colonIdx + 1).trim() };
    return { tag: null, body: str };
  });

  // Citations
  const citations = [];
  const addCite = (label, url) => { if (url && !citations.find(c => c.url === url)) citations.push({ label, url }); };
  addCite(`${stack.operatingBrand.name} website`,  stack.operatingBrand.website);
  addCite(`${stack.operatingBrand.name} LinkedIn`, stack.operatingBrand.linkedIn);
  if (stack.operatingPlatform) {
    addCite(`${stack.operatingPlatform.name} website`,  stack.operatingPlatform.website);
    addCite(`${stack.operatingPlatform.name} LinkedIn`, stack.operatingPlatform.linkedIn);
  }
  if (stack.financialSponsor) {
    addCite(`${stack.financialSponsor.name} website`,  stack.financialSponsor.website);
    addCite(`${stack.financialSponsor.name} LinkedIn`, stack.financialSponsor.linkedIn);
  }
  (stack.operatingPlatform?.siblingBrands || []).forEach(s => {
    if (s?.sourceUrl)            addCite(`${s.name} — source`,   s.sourceUrl);
    if (s?.itLeader?.sourceUrl)  addCite(`${s.name} IT leader`,  s.itLeader.sourceUrl);
    if (s?.itStack?.sourceUrl)   addCite(`${s.name} IT stack`,   s.itStack.sourceUrl);
  });
  (stack.operatingPlatform?.platformExecutiveTeam || []).forEach(exec => {
    if (exec?.sourceUrl) addCite(`${exec.name} (${exec.title || 'platform exec'})`, exec.sourceUrl);
  });

  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const content = {
    meta: {
      clientName:     project.displayName || stack.operatingBrand.name,
      clientSlug:     slug,
      architect:      project.architect      || 'DataSkate Team',
      architectEmail: project.architectEmail || 'kailash@dataskate.ai',
      date:           dateStr,
    },
    corporateStack: {
      operatingBrand:    stack.operatingBrand    || null,
      operatingPlatform: stack.operatingPlatform || null,
      financialSponsor:  stack.financialSponsor  || null,
    },
    dealUrgencyMultipliers,
    buyerMap: {
      people,
      futureBusinessChampions: buyerMap.futureBusinessChampions || [],
      preCallOutreach:         buyerMap.preCallOutreach         || [],
    },
    corporateProfileHtml: ctx.corporateProfile ? mdToHtml(ctx.corporateProfile) : null,
    corporateProfileMeta: ctx.corporateProfileMeta || null,
    citations,
  };

  const contentPath = path.join(projectDir, 'intake', 'pitch-kit-content.json');
  fs.mkdirSync(path.dirname(contentPath), { recursive: true });
  writeJson(contentPath, content);

  const result = spawnSync('npm', ['run', 'build:html'], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
  if (result.status !== 0) {
    console.log(`  [post-hooks] renderPitchKit: Eleventy build failed — ${(result.stderr || '').slice(0, 200)}`);
    return null;
  }

  const src = path.join(ROOT, 'portal', '_build', 'internal', `${slug}.html`);
  const dst = path.join(ROOT, 'portal', 'public', 'internal', `${slug}.html`);
  if (!fs.existsSync(src)) {
    console.log(`  [post-hooks] renderPitchKit: Eleventy did not produce internal/${slug}.html`);
    return null;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`  [post-hooks] portal/public/internal/${slug}.html — rendered`);
  return dst;
}

// ── renderIntake ───────────────────────────────────────────────────────────────

export function renderIntake(slug) {
  const projectDir = path.join(PROJECTS_DIR, slug);
  const quinnData  = readJson(path.join(projectDir, 'scoping', 'run', 'quinn.json')) || {};
  if (!quinnData.intakeContent) {
    console.log(`  [post-hooks] renderIntake: quinn.json missing intakeContent — skipped`);
    return null;
  }
  const contentPath = path.join(projectDir, 'intake', 'intake-content.json');
  fs.mkdirSync(path.dirname(contentPath), { recursive: true });
  writeJson(contentPath, quinnData.intakeContent);

  const result = spawnSync('npm', ['run', 'build:html'], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
  if (result.status !== 0) {
    console.log(`  [post-hooks] renderIntake: Eleventy build failed`);
    return null;
  }
  const src = path.join(ROOT, 'portal', '_build', 'intake', `intake-questionnaire-${slug}.html`);
  const dst = path.join(projectDir, 'intake', 'client', `intake-questionnaire-${slug}.html`);
  if (!fs.existsSync(src)) return null;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`  [post-hooks] projects/${slug}/intake/client/intake-questionnaire-${slug}.html — rendered`);
  return dst;
}

// ── renderProposalAndDeck ──────────────────────────────────────────────────────

export function renderProposalAndDeck(slug) {
  const projectDir = path.join(PROJECTS_DIR, slug);
  const petraData  = readJson(path.join(projectDir, 'scoping', 'run', 'petra.json')) || {};
  const intakeDir  = path.join(projectDir, 'intake');
  fs.mkdirSync(intakeDir, { recursive: true });

  let anyWritten = false;
  if (petraData.proposalContent) {
    writeJson(path.join(intakeDir, 'proposal-content.json'), petraData.proposalContent);
    anyWritten = true;
  }
  if (petraData.integrationDeckContent) {
    writeJson(path.join(intakeDir, 'integration-deck-content.json'), petraData.integrationDeckContent);
    anyWritten = true;
  }
  if (!anyWritten) {
    console.log(`  [post-hooks] renderProposalAndDeck: petra.json missing content fields — skipped`);
    return null;
  }

  const result = spawnSync('npm', ['run', 'build:html'], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
  if (result.status !== 0) {
    console.log(`  [post-hooks] renderProposalAndDeck: Eleventy build failed`);
    return null;
  }

  const copies = [
    [path.join('intake',   `proposal-${slug}.html`),           path.join(intakeDir, 'client', `proposal-${slug}.html`)],
    [path.join('internal', `integration-deck-${slug}.html`),   path.join(intakeDir, 'client', `integration-deck-${slug}.html`)],
  ];
  const out = [];
  for (const [buildRel, dst] of copies) {
    const src = path.join(ROOT, 'portal', '_build', buildRel);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    out.push(dst);
  }
  if (out.length) console.log(`  [post-hooks] proposal + integration deck HTML rendered (${out.length} files)`);
  return out.length ? out : null;
}

// ── renderSow ─────────────────────────────────────────────────────────────────

export function renderSow(slug) {
  const projectDir = path.join(PROJECTS_DIR, slug);
  const solData    = readJson(path.join(projectDir, 'scoping', 'run', 'sol.json')) || {};
  if (solData.status !== 'complete') {
    console.log(`  [post-hooks] renderSow: sol.json not complete — skipped`);
    return null;
  }

  const result = spawnSync('npm', ['run', 'build:html'], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
  if (result.status !== 0) {
    console.log(`  [post-hooks] renderSow: Eleventy build failed`);
    return null;
  }

  const buildSrc = path.join(ROOT, 'portal', '_build', 'delivery', `sow-${slug}.html`);
  if (!fs.existsSync(buildSrc)) {
    console.log(`  [post-hooks] renderSow: _build/delivery/sow-${slug}.html not found — clientsWithSow.js returned no match`);
    return null;
  }

  const publicDst = path.join(ROOT, 'portal', 'public', 'delivery', `sow-${slug}.html`);
  fs.mkdirSync(path.dirname(publicDst), { recursive: true });
  fs.copyFileSync(buildSrc, publicDst);

  console.log(`  [post-hooks] SOW rendered → portal/public/delivery/sow-${slug}.html`);
  return publicDst;
}

// ── applyMiraRewrites ──────────────────────────────────────────────────────────

export function applyMiraRewrites(slug) {
  const projectDir = path.join(PROJECTS_DIR, slug);
  const miraData   = readJson(path.join(projectDir, 'scoping', 'run', 'mira.json')) || {};
  const rewrites   = miraData.rewrittenContent || {};
  const intakeDir  = path.join(projectDir, 'intake');
  const BUILD      = path.join(ROOT, 'portal', '_build');

  const fileMap = {
    intake:          { content: 'intake-content.json',           buildSrc: path.join('intake',   `intake-questionnaire-${slug}.html`) },
    proposal:        { content: 'proposal-content.json',         buildSrc: path.join('intake',   `proposal-${slug}.html`) },
    integrationDeck: { content: 'integration-deck-content.json', buildSrc: path.join('internal', `integration-deck-${slug}.html`) },
  };

  let anyWritten = false;
  const toRender = [];
  for (const [key, { content, buildSrc }] of Object.entries(fileMap)) {
    if (!rewrites[key]) continue;
    writeJson(path.join(intakeDir, content), rewrites[key]);
    toRender.push(buildSrc);
    anyWritten = true;
  }

  if (!anyWritten) {
    console.log(`  [post-hooks] applyMiraRewrites: no rewrittenContent — skipped`);
    return null;
  }

  const result = spawnSync('npm', ['run', 'build:html'], { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
  if (result.status !== 0) {
    console.log(`  [post-hooks] applyMiraRewrites: Eleventy build failed`);
    return null;
  }

  for (const buildRel of toRender) {
    const src = path.join(BUILD, buildRel);
    const dst = path.join(intakeDir, 'client', path.basename(buildRel));
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  console.log(`  [post-hooks] Mira rewrites applied + HTML re-rendered (${toRender.length} file(s))`);
  return toRender;
}

// ── deployFirebase ─────────────────────────────────────────────────────────────

export function deployFirebase(slug) {
  const saPath    = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(ROOT, 'dataskateclients-firebase-adminsdk-fbsvc-6d3f67e197.json');
  const hasEnvKey  = !!process.env.FIREBASE_SA_KEY;
  const hasFileKey = fs.existsSync(saPath);

  if (!hasFileKey && !hasEnvKey) {
    console.log(`  [post-hooks] deployFirebase: no credentials — skipped`);
    console.log(`  Run manually: node pipeline/scripts/update-firebase.js ${slug}`);
    return { ok: false, reason: 'no-credentials' };
  }

  // Use spawnSync with args array — never interpolate slug into a shell string (injection risk)
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, 'pipeline/scripts/update-firebase.js'), slug],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: SPAWN_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 },
  );

  if (result.error || result.status !== 0) {
    const stderr = result.stderr || '';
    console.log(`  [post-hooks] deployFirebase FAILED — exit ${result.status}`);
    stderr.trim().split('\n').slice(-10).forEach(l => console.log(`  | ${l}`));
    console.log(`  Retry: node pipeline/scripts/update-firebase.js ${slug}`);
    return { ok: false, exitCode: result.status, stderr, reason: result.error ? 'spawn-error' : 'exit-nonzero' };
  }

  const tail = (result.stdout || '').trim().split('\n').slice(-8).filter(Boolean);
  tail.forEach(l => console.log(`  | ${l}`));
  console.log(`  [post-hooks] Firebase sync complete`);
  return { ok: true };
}

// ── archiveScopingFiles ────────────────────────────────────────────────────────

export function archiveScopingFiles(slug) {
  const scopingDir  = path.join(PROJECTS_DIR, slug, 'scoping');
  const scopingFiles = fs.existsSync(scopingDir)
    ? fs.readdirSync(scopingDir).filter(f => f !== '.gitkeep')
    : [];
  if (!scopingFiles.length) return;

  const result = spawnSync(process.execPath,
    [path.join(ROOT, 'pipeline/scripts/move-sources.js'), slug],
    { cwd: ROOT, stdio: 'inherit', encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
  if (result.error) {
    console.log(`  [post-hooks] archiveScopingFiles failed — run: node pipeline/scripts/move-sources.js ${slug}`);
  } else {
    console.log(`  [post-hooks] source files archived`);
  }
}

// ── assembleDiagramContent ────────────────────────────────────────────────────

function cleanSystemName(raw) {
  const orMatch = raw.match(/^(.+?)\s*\(or\s+([^)—,]+)/i);
  if (orMatch) {
    const part2 = orMatch[2].trim().replace(/\s+online\b/i, '').trim();
    return `${orMatch[1].trim()} / ${part2}`;
  }
  return raw.replace(/\s*\([^)]*\)/g, '').trim();
}

function extractSystemLists(confirmedFlows) {
  const sources = new Map();
  const targets = new Map();
  for (const flow of confirmedFlows) {
    const dir         = (flow.direction || '').trim();
    const flowSystems = (flow.systems || []).map(s => s.trim()).filter(Boolean);
    let srcDisplay, tgtDisplay;
    if (flowSystems.length >= 2) {
      srcDisplay = cleanSystemName(flowSystems[0]);
      tgtDisplay = cleanSystemName(flowSystems[flowSystems.length - 1]);
    } else if (dir) {
      const parts = dir.split(/\s*[→>]\s*/);
      if (parts.length >= 2) {
        srcDisplay = cleanSystemName(parts[0]);
        tgtDisplay = cleanSystemName(parts[parts.length - 1]);
      }
    }
    if (srcDisplay && !/^mulesoft$/i.test(srcDisplay)) sources.set(srcDisplay.toLowerCase(), srcDisplay);
    if (tgtDisplay && !/^mulesoft$/i.test(tgtDisplay)) targets.set(tgtDisplay.toLowerCase(), tgtDisplay);
  }
  return { sources: [...sources.values()], targets: [...targets.values()] };
}

export function assembleDiagramContent(slug, levels) {
  const projectDir = path.join(PROJECTS_DIR, slug);
  const project    = readJson(path.join(projectDir, 'project.json')) || {};
  const flo        = readJson(path.join(projectDir, 'scoping', 'run', 'flo.json')) || {};
  const petra      = readJson(path.join(projectDir, 'scoping', 'run', 'petra.json')) || {};
  const registry   = readJson(path.join(ROOT, 'commons', 'diagram-registry.json')) || { templates: [] };

  const contentPath = path.join(projectDir, 'intake', 'diagrams', 'diagram-content.json');
  const existing    = readJson(contentPath) || { client: slug, assembledAt: isoNow(), diagrams: [] };

  const confirmedFlows = flo.confirmedFlows || [];
  const { sources, targets } = extractSystemLists(confirmedFlows);
  const flowNames  = confirmedFlows.map(f => f.name).filter(Boolean);
  const flowCount  = confirmedFlows.length;

  const scopingTokens = {
    '__CLIENT_NAME__':      project.displayName || slug,
    '__CURRENT_SYSTEMS__':  sources.join(', '),
    '__DEPRECATED__':       '',
    '__HUB__':              'MuleSoft (DataSkate managed)',
    '__TARGETS__':          targets.join(', '),
    '__FLOW_COUNT__':       String(flowCount),
    '__CONFIRMED_FLOWS__':  flowNames.slice(0, 20).join(', '),
    '__OUT_OF_SCOPE__':     '',
    '__P0_BLOCKERS__':      (flo.p0Blockers || []).map(b => b.title || b.blocker || b.description).filter(Boolean).join(', '),
  };
  const sowTokens = {
    ...scopingTokens,
    '__TIMELINE_BODY__': petra.proposalContent?.timeline?.mermaidBody || [
      '    section Discovery',
      '    Requirements & Architecture :disc, 2026-06-01, 2w',
      '    section Implementation',
      '    Integration Build           :build, after disc, 6w',
      '    section Validation',
      '    UAT & Go-Live               :uat, after build, 2w',
    ].join('\n'),
    '__IN_SCOPE__':           flowNames.slice(0, 20).join(', '),
    '__OUT_OF_SCOPE__':       '',
    '__ASSUMPTIONS_BODY__':   '',
  };

  for (const template of registry.templates) {
    if (!levels.includes(template.level)) continue;
    const tokens = template.level === 'sow' ? sowTokens : scopingTokens;
    const entry = {
      id: template.outputId, level: template.level, type: template.type,
      templateRef: template.templateFile, title: template.title,
      generatedBy: template.generatedBy,
      tokens: Object.fromEntries((template.tokens || []).map(t => [t, tokens[t] ?? ''])),
    };
    const idx = existing.diagrams.findIndex(d => d.id === template.outputId);
    if (idx >= 0) existing.diagrams[idx] = entry;
    else          existing.diagrams.push(entry);
  }

  // Ownership-lattice diagram — add when corporate stack has a platform or PE sponsor.
  // The SVG renderer in generate-diagram.js reads vera.json directly; only the entry is written here.
  const vera      = readJson(path.join(projectDir, 'scoping', 'run', 'vera.json')) || {};
  const ownership = vera.corporateStack?.ownership || 'independent';
  if (ownership !== 'independent') {
    const latticeEntry = {
      id:          'ownership-lattice',
      level:       'corporate',
      type:        'custom-svg',
      templateRef: 'commons/diagram-templates/corporate/ownership-lattice.mmd',
      title:       'Corporate Ownership Lattice',
      generatedBy: 'vera+drew+flo',
      tokens:      { '__CLIENT_NAME__': project.displayName || slug },
    };
    const idx = existing.diagrams.findIndex(d => d.id === 'ownership-lattice');
    if (idx >= 0) existing.diagrams[idx] = latticeEntry;
    else          existing.diagrams.push(latticeEntry);
  }

  existing.assembledAt = isoNow();
  fs.mkdirSync(path.dirname(contentPath), { recursive: true });
  writeJson(contentPath, existing);
}

export function runDiagramRenderer(slug) {
  const result = spawnSync(process.execPath,
    [path.join(ROOT, 'pipeline/scripts/generate-diagram.js'), slug],
    { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: SPAWN_TIMEOUT_MS });
  if (result.error) {
    console.log(`  [post-hooks] generate-diagram.js error: ${result.error.message}`);
    return false;
  }
  if (result.status === 0) {
    console.log(`  [post-hooks] diagrams rendered → projects/${slug}/intake/diagrams/`);
  }
  return result.status === 0;
}

// ── fanOutRexStubs ─────────────────────────────────────────────────────────────
// Rex writes intent to rex.json.stubsCreated — this hook materializes the files.
// Rex cannot write files in the MCP pipeline (no write tool except write_output),
// so orchestrator-side post-hooks own all file creation.

export function fanOutRexStubs(slug) {
  const projectDir = path.join(PROJECTS_DIR, slug);
  const rexData    = readJson(path.join(projectDir, 'scoping', 'run', 'rex.json')) || {};
  const systems    = rexData.systems || [];
  const stubs      = rexData.stubsCreated || {};

  if (!systems.length) {
    console.log(`  [post-hooks] fanOutRexStubs: no systems in rex.json — skipped`);
    return;
  }

  let playbookCount = 0;
  let yamlCount     = 0;

  // ── 1. Playbook stubs ──────────────────────────────────────────────────────
  for (const sys of systems) {
    // P3: connKey from LLM — sanitize to alphanumeric+hyphens before using as directory name
    const rawKey  = sys.connectorKey;
    const connKey = sanitizeSlug(rawKey);
    if (!connKey) {
      console.log(`  [post-hooks] fanOutRexStubs: skipping system with invalid connectorKey "${rawKey}"`);
      continue;
    }

    const playbooksDir = path.join(ROOT, 'mulesoft', 'playbooks', 'playbooks', connKey);
    const skillPath    = path.join(playbooksDir, 'SKILL.md');
    if (!fs.existsSync(skillPath)) {
      fs.mkdirSync(playbooksDir, { recursive: true });
      // P5: sanitize all LLM-supplied string fields — strip newlines and backticks before
      //     embedding in Markdown to prevent structure injection
      const safeName       = sanitizeInlineText(sys.name)       || connKey;
      const safeAuthType   = sanitizeInlineText(sys.authType)   || 'unknown';
      const safeAuthDetail = sanitizeInlineText(sys.authDetail) || '';
      const safeApiStyle   = sanitizeInlineText(sys.apiStyle)   || 'unknown';
      const safeDeployment = sanitizeInlineText(sys.deploymentType) || 'unknown';
      const safeQuirks     = (sys.knownQuirks   || []).map(q => sanitizeInlineText(String(q))).filter(Boolean);
      const safePrereqs    = (sys.prerequisites || []).map(p => sanitizeInlineText(String(p))).filter(Boolean);

      fs.writeFileSync(skillPath, [
        `# ${safeName} Playbook`,
        ``,
        `> Auto-stub created from ${slug} engagement (Rex). Fill in during project delivery.`,
        ``,
        `## Connector`,
        `- Key: \`${connKey}\``,
        `- Auth: ${safeAuthType} — ${safeAuthDetail}`,
        `- API Style: ${safeApiStyle}`,
        `- Deployment: ${safeDeployment}`,
        ``,
        `## Known Quirks`,
        ...safeQuirks.map(q => `- ${q}`),
        ``,
        `## Prerequisites`,
        ...safePrereqs.map(p => `- ${p}`),
        ``,
        `## Notes`,
        `<!-- Add implementation notes, DWL patterns, gotchas here -->`,
      ].join('\n'));
      playbookCount++;
    }
  }
  if (playbookCount) console.log(`  [post-hooks] fanOutRexStubs: ${playbookCount} playbook stub(s) created`);

  // ── 2. canonical-extensions.yaml shell ────────────────────────────────────
  const ctx = readJson(path.join(projectDir, 'company_context.json')) || {};
  const businessObjects = Array.isArray(ctx.businessObjects) ? ctx.businessObjects : [];
  const extPath = path.join(projectDir, 'canonical-extensions.yaml');

  if (!fs.existsSync(extPath) && businessObjects.length) {
    const lines = [
      `# Canonical field extensions for ${slug}`,
      `# Populated by the Analyst during PRD development.`,
      `# Rex created this shell from company_context.json businessObjects[].`,
      ``,
      `client: ${slug}`,
      `version: 1.0.0-stub`,
      `records:`,
    ];
    for (const obj of businessObjects) {
      const raw    = typeof obj === 'string' ? obj : (obj.name || obj.type || String(obj));
      // P4: YAML injection — quote record names that contain special characters or whitespace
      const record = yamlScalar(sanitizeInlineText(raw));
      lines.push(`  ${record}:`);
      lines.push(`    addedFields: []`);
      lines.push(`    renamedFields: []`);
      lines.push(`    omittedFields: []`);
    }
    fs.writeFileSync(extPath, lines.join('\n') + '\n');
    yamlCount++;
    console.log(`  [post-hooks] fanOutRexStubs: canonical-extensions.yaml created (${businessObjects.length} record types)`);
  }

  // ── 3. Intake checklist autoWarnings ─────────────────────────────────────
  const checklistPath = path.join(ROOT, 'commons', 'intake-checklist.json');
  if (fs.existsSync(checklistPath) && Array.isArray(stubs.registryStubs)) {
    const checklist = readJson(checklistPath) || { autoWarnings: [] };
    if (!Array.isArray(checklist.autoWarnings)) checklist.autoWarnings = [];

    for (const rawKey of stubs.registryStubs) {
      const safeKey = sanitizeSlug(rawKey);
      if (!safeKey) continue;
      const exists = checklist.autoWarnings.find(w => w.connectorKey === safeKey);
      if (!exists) {
        checklist.autoWarnings.push({
          connectorKey: safeKey,
          message:      `Verify ${safeKey} credentials and sandbox access before integration build`,
          addedBy:      `rex/${slug}`,
          addedAt:      today(),
        });
      }
    }
    writeJson(checklistPath, checklist);
    console.log(`  [post-hooks] fanOutRexStubs: intake-checklist.json updated`);
  }
}

// ── applyIvyProfileWritebacks ──────────────────────────────────────────────────
// Ivy cannot write to commons/sales/psychology-profiles.json in the MCP pipeline
// (write_output only writes ivy.json). It signals new profiles + empirical notes
// via ivy.json.newProfiles[] and ivy.json.profileNoteUpdates[].

export function applyIvyProfileWritebacks(slug) {
  const projectDir  = path.join(PROJECTS_DIR, slug);
  const ivyData     = readJson(path.join(projectDir, 'scoping', 'run', 'ivy.json')) || {};
  const profilesPath = path.join(ROOT, 'commons', 'sales', 'psychology-profiles.json');

  const newProfiles      = ivyData.newProfiles      || [];
  const profileNoteUpdates = ivyData.profileNoteUpdates || [];

  if (!newProfiles.length && !profileNoteUpdates.length) return;

  const profilesDoc = readJson(profilesPath);
  if (!profilesDoc || !Array.isArray(profilesDoc.profiles)) {
    console.log(`  [post-hooks] applyIvyProfileWritebacks: psychology-profiles.json not found — skipped`);
    return;
  }

  // Required fields for a valid profile entry (P10: reject malformed LLM objects)
  const REQUIRED_PROFILE_FIELDS = ['id', 'description', 'signalPhrases'];

  let added = 0;
  let noted = 0;

  // Add genuinely new profiles — validate shape before touching the shared corpus
  for (const np of newProfiles) {
    if (!np || typeof np !== 'object') continue;
    // P10: enforce required fields — silently skip malformed entries
    if (REQUIRED_PROFILE_FIELDS.some(f => !np[f])) {
      console.log(`  [post-hooks] applyIvyProfileWritebacks: skipping malformed profile entry (missing required fields)`);
      continue;
    }
    // P10: id must be a safe slug — prevent a crafted id from shadowing existing profiles
    if (!SLUG_SAFE_RE.test(np.id)) {
      console.log(`  [post-hooks] applyIvyProfileWritebacks: skipping profile with unsafe id "${np.id}"`);
      continue;
    }
    const existing = profilesDoc.profiles.find(p => p.id === np.id);
    if (!existing) {
      profilesDoc.profiles.push(np);
      added++;
    }
  }

  // Append empirical notes to existing profiles
  for (const update of profileNoteUpdates) {
    if (!update.profileId || !update.note) continue;
    if (!SLUG_SAFE_RE.test(update.profileId)) continue;
    const profile = profilesDoc.profiles.find(p => p.id === update.profileId);
    if (profile) {
      if (!Array.isArray(profile.notes)) profile.notes = [];
      // P9: deduplicate — skip if this exact note text already exists for this profile
      const noteText = typeof update.note === 'string' ? update.note : JSON.stringify(update.note);
      const alreadyLogged = profile.notes.some(n =>
        (typeof n === 'string' ? n : JSON.stringify(n)) === noteText
      );
      if (!alreadyLogged) {
        profile.notes.push(update.note);
        noted++;
      }
    }
  }

  if (added || noted) {
    writeJson(profilesPath, profilesDoc);
    console.log(`  [post-hooks] applyIvyProfileWritebacks: ${added} profile(s) added, ${noted} note(s) appended`);
  }
}

// ── Public API: called from graph.mjs ─────────────────────────────────────────

/** Runs after every agent without exception. */
export function runUniversalHooks(slug, agentSlug) {
  assembleContext(slug, agentSlug);
  aggregateDecisions(slug);
}

/** Runs agent-specific post-processing after the universal hooks. */
export function runAgentHooks(slug, agentSlug) {
  switch (agentSlug) {

    case 'sage': {
      // Move binary source files from _inbox/ to scoping/ now that Sage is done reading
      if (!fs.existsSync(INBOX_DIR)) break;
      const binaries = fs.readdirSync(INBOX_DIR).filter(f => f !== '.gitkeep' && !f.startsWith('.'));
      if (!binaries.length) break;
      const scopingDir = path.join(PROJECTS_DIR, slug, 'scoping');
      for (const file of binaries) {
        fs.renameSync(path.join(INBOX_DIR, file), path.join(scopingDir, file));
      }
      console.log(`  [post-hooks] moved ${binaries.length} binary file(s) from _inbox/ to scoping/`);
      break;
    }

    case 'vera': {
      mergeVeraCorporateStackEnrichment(slug);
      writeClientRegistry(slug);
      try { renderPitchKit(slug); } catch (e) { console.log(`  [post-hooks] renderPitchKit (vera) failed: ${e.message}`); }
      // Promote library contributions
      const promoteResult = spawnSync(process.execPath,
        [path.join(ROOT, 'pipeline/promote-library.js'), '--client', slug],
        { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
      if (promoteResult.status === 0) console.log(`  [post-hooks] library contributions promoted`);
      else console.log(`  [post-hooks] promote-library.js failed — run manually: node pipeline/promote-library.js --client ${slug}`);
      break;
    }

    case 'drew': {
      try { renderPitchKit(slug); } catch (e) { console.log(`  [post-hooks] renderPitchKit (drew) failed: ${e.message}`); }
      break;
    }

    case 'rex': {
      // Fan out file stubs that Rex signalled but cannot write (write_output only)
      fanOutRexStubs(slug);

      // Rebuild connector index
      const idxResult = spawnSync(process.execPath,
        [path.join(ROOT, 'mulesoft/build-connector-index.js')],
        { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
      if (idxResult.status === 0) console.log(`  [post-hooks] connector-names.json + connector-index.json rebuilt`);
      else console.log(`  [post-hooks] build-connector-index.js failed — run manually`);

      // Zero-LLM API schema probe
      const probeResult = spawnSync(process.execPath,
        [path.join(ROOT, 'pipeline/scripts/probe-api-schemas.js'), '--client', slug],
        { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: SPAWN_TIMEOUT_MS });
      if (probeResult.status === 0) console.log(`  [post-hooks] API schema probe complete`);
      else console.log(`  [post-hooks] API schema probe skipped (credentials not present yet)`);
      break;
    }

    case 'flo': {
      // Write flowCount + pricingComputed to project.json
      const floData = readJson(path.join(PROJECTS_DIR, slug, 'scoping', 'run', 'flo.json')) || {};
      if (floData.pricing) {
        mergeJson(path.join(PROJECTS_DIR, slug, 'project.json'), {
          flowCount:       floData.pricing.flowCount,
          pricingComputed: floData.pricing,
        });
        console.log(`  [post-hooks] project.json updated (flowCount, pricingComputed)`);
      }
      aggregateDecisions(slug);
      writeClientRegistry(slug);
      try {
        assembleDiagramContent(slug, ['scoping']);
        const ok = runDiagramRenderer(slug);
        if (ok) {
          // Inline system-flow.svg into company_context.json for integration deck
          const svgPath = path.join(ROOT, 'projects', slug, 'intake', 'diagrams', 'system-flow.svg');
          if (fs.existsSync(svgPath)) {
            const ctxPath = path.join(ROOT, 'projects', slug, 'company_context.json');
            const ctx = readJson(ctxPath) || {};
            ctx.systemDiagram = { svg: fs.readFileSync(svgPath, 'utf8') };
            writeJson(ctxPath, ctx);
            console.log(`  [post-hooks] systemDiagram.svg written to company_context.json`);
          }
        }
      } catch (e) { console.log(`  [post-hooks] diagram assembly failed: ${e.message}`); }
      break;
    }

    case 'hawk': {
      try { renderPitchKit(slug); } catch (e) { console.log(`  [post-hooks] renderPitchKit (hawk) failed: ${e.message}`); }
      break;
    }

    case 'ivy': {
      applyIvyProfileWritebacks(slug);
      break;
    }

    case 'quinn': {
      try { renderIntake(slug); } catch (e) { console.log(`  [post-hooks] renderIntake failed: ${e.message}`); }
      break;
    }

    case 'petra': {
      try { renderProposalAndDeck(slug); } catch (e) { console.log(`  [post-hooks] renderProposalAndDeck failed: ${e.message}`); }
      try {
        assembleDiagramContent(slug, ['scoping', 'sow']);
        runDiagramRenderer(slug);
      } catch (e) { console.log(`  [post-hooks] SOW diagram assembly failed: ${e.message}`); }
      break;
    }

    case 'sol': {
      try { renderSow(slug); } catch (e) { console.log(`  [post-hooks] renderSow failed: ${e.message}`); }
      break;
    }

    case 'mira': {
      try { applyMiraRewrites(slug); } catch (e) { console.log(`  [post-hooks] applyMiraRewrites failed: ${e.message}`); }
      deployFirebase(slug);
      break;
    }
  }
}
