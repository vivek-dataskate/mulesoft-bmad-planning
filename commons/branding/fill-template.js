#!/usr/bin/env node
// commons/branding/fill-template.js
// Merges a content JSON file into an HTML shell template.
//
// Usage:
//   node commons/branding/fill-template.js --template proposal          --client acme
//   node commons/branding/fill-template.js --template intake            --client acme
//   node commons/branding/fill-template.js --template integration-deck  --client acme
//   node commons/branding/fill-template.js --template client-portal     --client acme
//   node commons/branding/fill-template.js --template ds-pricing-model
//   node commons/branding/fill-template.js --template architect-guide   [--src path/to/file.md]

'use strict';
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const args           = process.argv.slice(2);
const templateType   = args[args.indexOf('--template') + 1];
const clientIdx      = args.indexOf('--client');
const client         = clientIdx !== -1 ? args[clientIdx + 1] : null;
const nameIdx        = args.indexOf('--name');
const resourceName   = nameIdx !== -1 ? args[nameIdx + 1] : null;
const srcIdx         = args.indexOf('--src');
const resourceSrc    = srcIdx !== -1 ? args[srcIdx + 1] : null;
const forceRepublish = args.includes('--force-republish');

const KNOWN_TEMPLATES = ['proposal', 'intake', 'integration-deck', 'client-portal', 'corporate-brief', 'ds-pricing-model', 'architect-guide'];
const PER_CLIENT_TEMPLATES = new Set(['proposal', 'intake', 'integration-deck', 'client-portal', 'corporate-brief']);

// Frozen-client guard. Shipped clients (those with their intake/proposal URL
// already in client hands) must not be overwritten by template regeneration.
// Trigger condition: projects/{slug}/project.json has "frozen": true.
// Override: pass --force-republish on the command line.
if (PER_CLIENT_TEMPLATES.has(templateType) && client && !forceRepublish) {
  const _root     = path.resolve(__dirname, '../..');
  const _projPath = path.join(_root, 'projects', client, 'project.json');
  if (fs.existsSync(_projPath)) {
    try {
      const _proj = JSON.parse(fs.readFileSync(_projPath, 'utf8'));
      if (_proj.frozen === true) {
        console.error(`✗ Refusing to regenerate ${templateType} for "${client}": client is frozen (shipped).`);
        console.error(`  This client's HTML has been deployed to Firebase and the URL is in client hands.`);
        console.error(`  Regenerating would change what the client sees.`);
        console.error(`  To override (e.g. you genuinely need to republish), re-run with --force-republish.`);
        process.exit(2);
      }
    } catch (_e) {
      // Malformed project.json — proceed; caller will hit a clearer error later.
    }
  }
}

// ─── DS-GENERATED fingerprint helpers ────────────────────────────────────────
// Embedded as the last line of every generated file so lint-html.js can detect:
//   • body-hash mismatch  → file was edited directly (forbidden; edit template)
//   • inputs-hash mismatch → template or shared CSS changed; regenerate
// Lint and fill MUST compute identically — keep these helpers in sync with the
// equivalent block in commons/branding/lint-html.js.
const FINGERPRINT_RE = /[\r\n]*<!-- DS-GENERATED:[^\n]*-->\s*$/m;

function stripFingerprint(html) {
  return html.replace(FINGERPRINT_RE, '').replace(/\s*$/, '\n');
}

function hash16(...buffers) {
  const h = crypto.createHash('sha256');
  for (const b of buffers) h.update(b);
  return h.digest('hex').slice(0, 16);
}

function inputsHashOf(templateId) {
  const r = path.resolve(__dirname, '../..');
  const tplPath = path.join(r, 'commons', 'templates', `${templateId}-template.html`);
  const cssPath = path.join(r, 'commons', 'templates', 'shared-base.css.html');
  return hash16(fs.readFileSync(tplPath), fs.readFileSync(cssPath));
}

function embedFingerprint(html, templateId) {
  const body     = stripFingerprint(html);
  const bodyHash = hash16(`template=${templateId}|`, body);
  const inHash   = inputsHashOf(templateId);
  return body + `<!-- DS-GENERATED: template=${templateId} body-hash=${bodyHash} inputs-hash=${inHash} -->\n`;
}

if (!templateType) {
  console.error('Usage: node fill-template.js --template <proposal|intake|portal|flyer|resource> [--client <slug>] [--name <slug> --src <path>]');
  process.exit(1);
}

if (!KNOWN_TEMPLATES.includes(templateType)) {
  const cap = templateType.charAt(0).toUpperCase() + templateType.slice(1);
  console.error(`\n❌ No template registered for type: "${templateType}"`);
  console.error(`   Known types: ${KNOWN_TEMPLATES.join(', ')}`);
  console.error(`\n   To add a new document type:`);
  console.error(`     1. Create commons/templates/${templateType}-template.html`);
  console.error(`        (add template-specific <style> after <!-- FILL:__css -->)`);
  console.error(`     2. Add "${templateType}" to KNOWN_TEMPLATES in fill-template.js`);
  console.error(`     3. Add a build${cap}() function`);
  console.error(`\n   Do NOT write raw HTML outside this system.`);
  process.exit(1);
}

// Per-type configuration: content JSON path and output HTML path
const root   = path.resolve(__dirname, '../..');
const PORTAL = 'https://dataskateclients.web.app';

function resolveClientLogoPath(slug) {
  if (!slug) return null;
  for (const ext of ['.svg', '.png']) {
    if (fs.existsSync(path.join(root, 'firebase', 'public', 'logos', slug + ext)))
      return `${PORTAL}/logos/${slug}${ext}`;
  }
  return null;
}

function clientLogoHtml(logoPath, clientName) {
  if (!logoPath) return '';
  return `<div class="client-logo-block"><div class="client-logo-sep"></div><img src="${esc(logoPath)}" alt="${esc(clientName)}" class="client-logo-img" onerror="this.parentNode.style.display='none'"></div>`;
}

const typeConfig = {
  proposal: {
    requiresClient: true,
    contentFile: (c) => path.join(root, 'projects', c, 'intake', 'proposal-content.json'),
    outFile:     (c) => path.join(root, 'projects', c, 'intake', `proposal-${c}.html`),
  },
  intake: {
    requiresClient: true,
    contentFile: (c) => path.join(root, 'projects', c, 'intake', 'intake-content.json'),
    outFile:     (c) => path.join(root, 'projects', c, 'intake', `intake-questionnaire-${c}.html`),
  },
  'client-portal': {
    requiresClient: true,
    contentFile: (c) => path.join(root, 'projects', c, 'portal-content.json'),
    outFile:     (c) => path.join(root, 'firebase', 'public', 'portal', `${c}.html`),
  },
  'ds-pricing-model': {
    requiresClient: false,
    contentFile: () => null,  // reads pricing-model.md directly — no JSON file needed
    outFile:     () => path.join(root, 'firebase', 'public', 'resources', 'ds-pricing-model.html'),
  },
  'architect-guide': {
    requiresClient: false,
    contentFile: () => null,  // reads architect-guide.md directly
    outFile:     () => path.join(root, 'firebase', 'public', 'resources', 'architect-guide.html'),
  },
  'integration-deck': {
    requiresClient: true,
    contentFile: (c) => path.join(root, 'projects', c, 'intake', 'integration-deck-content.json'),
    outFile:     (c) => path.join(root, 'projects', c, 'intake', `integration-deck-${c}.html`),
  },
  'corporate-brief': {
    requiresClient: true,
    contentFile: (c) => path.join(root, 'projects', c, 'intake', 'corporate-brief-content.json'),
    outFile:     (c) => path.join(root, 'projects', c, 'intake', `corporate-brief-${c}.html`),
  },
};

const cfg = typeConfig[templateType];
if (cfg.requiresClient && !client) {
  console.error(`❌ --client <slug> is required for --template ${templateType}`);
  process.exit(1);
}
const templateFile = path.join(root, 'commons', 'templates', `${templateType}-template.html`);
const cssFile      = path.join(root, 'commons', 'templates', 'shared-base.css.html');

// --out-override lets a caller (e.g. scripts/republish.js) redirect output to
// a dated-versioned path. When unset, the default per-type outFile applies.
const outIdx       = args.indexOf('--out-override');
const outOverride  = outIdx !== -1 ? args[outIdx + 1] : null;
const outFile      = outOverride
  ? path.resolve(root, outOverride)
  : cfg.outFile(client);

let html      = fs.readFileSync(templateFile, 'utf8');
const css     = fs.readFileSync(cssFile, 'utf8');
const aboutMdPath = path.join(root, 'commons', 'sales', 'about-dataskate.md');
const ABOUT_HTML  = fs.existsSync(aboutMdPath)
  ? (() => {
      const raw = fs.readFileSync(aboutMdPath, 'utf8').trim();
      return raw.startsWith('<') ? raw
        : raw.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p>${p}</p>`).join('\n');
    })()
  : '';

// architect-guide and ds-pricing-model read directly from markdown — no JSON content file
let content;
if (templateType === 'architect-guide') {
  const srcPath = resourceSrc
    ? path.resolve(process.cwd(), resourceSrc)
    : path.join(root, 'commons', 'sales', 'architect-guide.md');
  content = fs.readFileSync(srcPath, 'utf8');
} else if (templateType === 'ds-pricing-model') {
  const srcPath = resourceSrc
    ? path.resolve(process.cwd(), resourceSrc)
    : path.join(root, 'commons', 'sales', 'pricing-model.md');
  content = fs.readFileSync(srcPath, 'utf8');
} else {
  const contentFilePath = cfg.contentFile(client);
  const fromMd = args.includes('--from-md');
  const jsonExists = !fromMd && fs.existsSync(contentFilePath);
  if (jsonExists) {
    content = JSON.parse(fs.readFileSync(contentFilePath, 'utf8'));
  } else if (templateType === 'intake') {
    const mdPath = path.join(root, 'projects', client, 'intake', `intake-questionnaire-${client}.md`);
    if (!fs.existsSync(mdPath)) {
      console.error(`❌ No intake-content.json or intake-questionnaire-${client}.md found for client: ${client}`);
      process.exit(1);
    }
    content = fs.readFileSync(mdPath, 'utf8');
  } else {
    content = JSON.parse(fs.readFileSync(contentFilePath, 'utf8'));
  }
}

function fill(key, value) {
  const marker = `<!-- FILL:${key} -->`;
  html = html.split(marker).join(value != null ? String(value) : '');
}

// Inject CSS
fill('__css', css);

// Psychology profile → recommended model mapping (must be declared before buildProposal dispatch)
const PROFILE_RECOMMENDED_MODEL = {
  'roi-analytical':     'iaas',
  'risk-averse':        'iaas',
  'relationship-builder': 'iaas',
  'technical-champion': 'tm',
  'budget-conscious':   'impl',
};

// Intake section → category mapping (must be declared before buildIntake dispatch).
// Sticky cat-tabs at top of intake render in this order. The synthetic
// "future" bucket holds Scout-inferred flows not priced in the current
// proposal — extracted at render time and shown as its own tab + rail card.
const INTAKE_CATEGORIES = [
  { key: 'business',   num: '01', label: 'Business',
    blurb: "What we're building and where data flows",
    sections: ['1', '2', '3', '10'] },
  { key: 'technical',  num: '02', label: 'Technical',
    blurb: 'How well it must work',
    sections: ['4', '5', '6'] },
  { key: 'production', num: '03', label: 'Production',
    blurb: 'How we ship and run it',
    sections: ['7', '8', '9'] },
  { key: 'future',     num: '04', label: 'Future Flows',
    blurb: 'Potential flows — not priced in this proposal',
    sections: ['PF'] },
];

if (templateType === 'proposal') {
  buildProposal(content);
} else if (templateType === 'intake') {
  if (typeof content === 'string') buildIntakeFromMd(content, client);
  else buildIntake(content);
} else if (templateType === 'client-portal') {
  buildPortal(content);
} else if (templateType === 'ds-pricing-model') {
  buildFlyer(content);
} else if (templateType === 'integration-deck') {
  // Shell only — content lives in Firestore, fetched post-auth at runtime
  fill('client-slug', client);
  fill('client-logo', clientLogoHtml(resolveClientLogoPath(client), client));
} else if (templateType === 'corporate-brief') {
  buildCorporateBrief(content);
} else if (templateType === 'architect-guide') {
  buildResource(content);
}

// Embed DS-GENERATED fingerprint so lint-html.js can detect direct edits
// (body-hash mismatch) or stale generations (inputs-hash mismatch).
html = embedFingerprint(html, templateType);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html, 'utf8');
console.log(`✓ Written: ${outFile}`);

// Inline HTML lint — STRICT. Bad output is removed and the process fails.
// fill-template.js is the primary gate; the pre-commit hook is a secondary net.
// A non-zero exit here halts whoever called us (regen-all-clients.js, scripts,
// CI). Violation details have already been printed to stderr by lint-html.js.
try {
  const { spawnSync } = require('child_process');
  const lintPath = path.join(root, 'commons', 'branding', 'lint-html.js');
  const r = spawnSync('node', [lintPath, outFile], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`✗ lint-html.js rejected ${outFile}`);
    console.error(`  Deleting bad output to keep the working tree clean.`);
    console.error(`  Fix the template or content JSON, then re-run fill-template.js.`);
    try { fs.unlinkSync(outFile); } catch (_) { /* best-effort */ }
    process.exit(3);
  }
} catch (e) {
  console.error(`✗ Could not run lint-html.js: ${e.message}`);
  process.exit(3);
}

if (templateType === 'proposal' && client) {
  saveProposalContentToFirestore(content, client);
}

if (templateType === 'integration-deck' && client) {
  savePitchKitToFirestore(content, client);
  // Persist systemDiagram.current + future to project.json
  if (content.systemDiagram) {
    const projPath = path.join(root, 'projects', client, 'project.json');
    if (fs.existsSync(projPath)) {
      try {
        const proj = JSON.parse(fs.readFileSync(projPath, 'utf8'));
        if (!proj.systemDiagram) proj.systemDiagram = {};
        if (content.systemDiagram.current) proj.systemDiagram.current = content.systemDiagram.current;
        if (content.systemDiagram.future)  proj.systemDiagram.future  = content.systemDiagram.future;
        fs.writeFileSync(projPath, JSON.stringify(proj, null, 2) + '\n');
      } catch (e) { /* non-fatal */ }
    }
  }
}

// ─── PROPOSAL ────────────────────────────────────────────────────────────────

function buildProposal(c) {
  const m = c.meta;
  const bp = c.buyerProfile || {};
  const primaryProfile   = bp.primary   || '';
  const secondaryProfile = bp.secondary || '';

  fill('client-name',       m.clientName);
  fill('proposal-title',    m.title  || `MuleSoft Integration for ${esc(m.clientName)}`);
  fill('proposal-subtitle', m.subtitle || '');
  fill('architect',         m.architect);
  fill('architect-email',   m.architectEmail);
  fill('date',              m.date);
  fill('scope',             `${m.flowCount} integration flow${m.flowCount !== 1 ? 's' : ''}`);
  fill('client-slug',        m.clientSlug || client || '');
  fill('buyer-profile',      primaryProfile);
  fill('client-logo', clientLogoHtml(resolveClientLogoPath(m.clientSlug || client), m.clientName));

  // Optional pull-quote at top of Journey section (from challenge.lead or challenge.pullquote)
  const pullquoteText = c.challenge && (c.challenge.pullquote || c.challenge.lead);
  fill('challenge-pullquote', pullquoteText ? `<p class="pull-quote">${esc(pullquoteText)}</p>` : '');

  fill('journey-headline', c.journey.headline || 'From Connected to AI-Enabled');
  fill('stage-cards', ['stage1', 'stage2', 'stage3'].map(key => {
    const s = c.journey[key];
    return `<div class="stage-card ${key}">
      <div class="stage-label">${esc(s.label)}</div>
      <div class="stage-year">${esc(s.year)}</div>
      <h4>${esc(s.headline)}</h4>
      <ul>${(s.items || []).map(i => `<li>${i}</li>`).join('')}</ul>
    </div>`;
  }).join('\n'));
  fill('journey-closing', c.journey.closingLine
    ? `<p class="pull-quote">${esc(c.journey.closingLine)}</p>` : '');

  fill('flows-headline', `${m.flowCount} Proposed Integration Flow${m.flowCount !== 1 ? 's' : ''}`);
  fill('flow-cards', c.flows.map(f =>
    `<div class="flow-card">
      <div class="flow-num">Flow ${esc(String(f.num))}</div>
      ${f.complexity ? `<span class="complexity-badge ${esc(f.complexity)}">${esc(f.complexity)}</span>` : ''}
      <div class="flow-name">${esc(f.name)}</div>
      <div class="flow-route">${esc(f.route)}</div>
      <div class="flow-value">${f.value}</div>
    </div>`
  ).join('\n'));

  fill('outcome-cards', c.outcomes.map(o =>
    `<div class="outcome-card">
      <div class="outcome-icon">${o.icon}</div>
      <div class="outcome-card-text"><h4>${esc(o.title)}</h4><p>${o.body}</p></div>
    </div>`
  ).join('\n'));

  const FOMO_TIERS = {
    'exact-match':       { label: 'Exact match',       cls: 'tier-exact' },
    'same-industry':     { label: 'Same industry',     cls: 'tier-adjacent' },
    'adjacent-industry': { label: 'Adjacent industry', cls: 'tier-adjacent' },
    'industry-stat':     { label: 'Industry data',     cls: 'tier-stat' },
  };
  const fomo = c.fomo || [];
  fill('fomo-section', fomo.length > 0
    ? `<details class="section-block" open>
  <summary class="section-head">
    <div class="section-summary">
      <div class="section-eyebrow">Peer Comparison</div>
      <div class="section-title">Companies like yours are already doing this</div>
    </div>
    <span class="section-chevron">&#9660;</span>
  </summary>
  <div class="section-body">
    <div class="fomo-grid">
      ${fomo.map(f => {
        const tier = FOMO_TIERS[f.relevanceTier] || { label: f.relevanceTier || '', cls: 'tier-stat' };
        // Company name becomes the link when a source URL exists — max credibility
        const coName = f.sourceUrl
          ? `<a href="${esc(f.sourceUrl)}" target="_blank" rel="noopener" class="fomo-co-link">${esc(f.name)} ↗</a>`
          : esc(f.name);
        // Only show separate source line for industry stats (where the stat label ≠ the company name)
        const sourceFooter = f.sourceUrl && f.sourceLabel && f.relevanceTier === 'industry-stat'
          ? `<div class="fomo-source"><a href="${esc(f.sourceUrl)}" target="_blank" rel="noopener">${esc(f.sourceLabel)}</a></div>`
          : '';
        return `<div class="fomo-card">
  <div class="fomo-card-head">
    <div><div class="fomo-co">${coName}</div>${f.revenue ? `<div class="fomo-meta">${esc(f.revenue)}</div>` : ''}</div>
    ${tier.label ? `<span class="fomo-tier-badge ${esc(tier.cls)}">${esc(tier.label)}</span>` : ''}
  </div>
  ${f.analogyNote ? `<div class="fomo-analogy">${esc(f.analogyNote)}</div>` : ''}
  ${f.savings ? `<div class="fomo-savings-val">${esc(f.savings)}</div>` : ''}
  <div class="fomo-built">${esc(f.whatTheyBuilt || f.what || '')}</div>
  ${f.aiAgentDescription ? `<div class="fomo-agent">${esc(f.aiAgentDescription)}</div>` : ''}
  ${f.fomoAngle ? `<div class="fomo-angle">${esc(f.fomoAngle)}</div>` : ''}
  ${sourceFooter}
</div>`;
      }).join('\n      ')}
    </div>
  </div>
</details>`
    : '');

  const starters = c.fomoThoughtStarters || [];
  fill('fomo-thought-starters', starters.length > 0
    ? `<div class="ai-starters">
  <div class="ai-starters-eyebrow">What else teams like yours are exploring</div>
  <ul class="ai-starters-list">
    ${starters.map(s => `<li>${esc(s)}</li>`).join('\n    ')}
  </ul>
</div>`
    : '');

  fill('next-steps', c.nextSteps.map((n, i) =>
    `<div class="ns-item">
      <div class="ns-num">${i + 1}</div>
      <h4>${esc(n.title)}</h4>
      <p>${n.body}</p>
    </div>`
  ).join('\n'));

  // Challenge cards
  fill('challenge-cards', (c.challenge && c.challenge.cards && c.challenge.cards.length)
    ? `<div class="challenge-grid">${c.challenge.cards.map(card =>
        `<div class="challenge-card">
          <div class="card-label">${esc(card.label)}</div>
          <p>${esc(card.text)}</p>
        </div>`
      ).join('\n')}</div>`
    : '');

  // Solution section
  const sol = c.solution || {};
  fill('solution-lead', sol.lead ? `<p class="lead">${esc(sol.lead)}</p>` : '');

  // Generate two-panel system diagram (current + future state) via generate-diagrams.js
  // Falls back to simple future-only SVG if project.json has no systemDiagram.current
  let diagramSvgInline = null;
  if (client) {
    const projPath = path.join(root, 'projects', client, 'project.json');
    const projForDiagram = fs.existsSync(projPath) ? JSON.parse(fs.readFileSync(projPath, 'utf8')) : {};
    if (projForDiagram.systemDiagram && projForDiagram.systemDiagram.current) {
      // Full two-panel diagram
      try {
        require('child_process').execSync(
          `node ${path.join(root, 'scripts', 'generate-diagrams.js')} ${client}`,
          { cwd: root, stdio: 'pipe' }
        );
        const svgPath = path.join(root, 'projects', client, 'intake', 'system-diagram.svg');
        if (fs.existsSync(svgPath)) diagramSvgInline = fs.readFileSync(svgPath, 'utf8');
      } catch (e) { /* non-fatal — fall through to simple diagram */ }
    }
  }
  if (!diagramSvgInline) {
    // Fallback: simple future-state-only diagram from diagramNodes
    const diagramNodes = sol.diagramNodes || null;
    if (diagramNodes) {
      diagramSvgInline = buildDiagramSvg(diagramNodes);
      if (client) {
        const svgPath = path.join(root, 'projects', client, 'intake', 'system-diagram.svg');
        try { fs.writeFileSync(svgPath, diagramSvgInline); } catch (e) { /* non-fatal */ }
      }
    }
  }
  fill('solution-diagram', diagramSvgInline
    ? `<div class="diagram-wrap">${diagramSvgInline}</div>`
    : '');
  fill('diagram-caption', sol.diagramCaption ? `<p class="diagram-caption">${esc(sol.diagramCaption)}</p>` : '');

  // ROI / Business Case — conditional full <details> block
  // roi-analytical profile: opens by default so numbers are immediately visible
  const roiOpen = primaryProfile === 'roi-analytical' ? ' open' : '';
  fill('roi-section', c.roi
    ? `<details class="section-block"${roiOpen}>
  <summary class="section-head">
    <div class="section-summary">
      <div class="section-eyebrow">ROI / Business Case</div>
      <div class="section-title">${esc(c.roi.headline || 'The business case')}</div>
    </div>
    <span class="section-chevron">&#9660;</span>
  </summary>
  <div class="section-body">
    <p>${c.roi.body || ''}</p>
    ${(c.roi.stats || []).length ? `<div style="display:flex;gap:24px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);flex-wrap:wrap;">${c.roi.stats.map(s =>
      `<div style="flex:1;min-width:120px;"><span style="font-size:22px;font-weight:800;color:var(--brand);line-height:1;">${esc(s.value)}</span><div style="font-size:11px;color:var(--mid);margin-top:3px;line-height:1.4;">${esc(s.label)}</div></div>`
    ).join('')}</div>` : ''}
  </div>
</details>`
    : '');

  // Included items — 2-col card grid
  fill('included-items', (c.included || []).map(item =>
    `<div class="inc-card">
      <div class="inc-check">&#10003;</div>
      <div><strong>${esc(item.title)}</strong><span>${esc(item.detail || '')}</span></div>
    </div>`
  ).join('\n'));

  // Out-of-scope items — 2-col card grid
  fill('oos-items', (c.oos || []).map(item =>
    `<div class="oos-card">
      <div class="oos-x">&#215;</div>
      <div><strong>${esc(item.title)}</strong><span>${esc(item.detail || '')}</span></div>
    </div>`
  ).join('\n'));

  // Assumption rows
  const ownerClsMap = { DataSkate: 'owner-ds', Client: 'owner-client', Both: 'owner-both', Vendor: 'owner-vendor' };
  fill('assumption-rows', (c.assumptions || []).map(a =>
    `<tr>
      <td>${a.p0 ? '<span class="p0-flag">P0</span>' : ''}${esc(a.assumption)}</td>
      <td><span class="owner-badge ${ownerClsMap[a.owner] || 'owner-ds'}">${esc(a.owner)}</span></td>
      <td>${esc(a.when || '')}</td>
    </tr>`
  ).join('\n'));

  // Delivery Timeline — conditional full <details> block
  fill('timeline-section', (c.timeline && c.timeline.length > 0)
    ? `<details class="section-block">
  <summary class="section-head">
    <div class="section-summary">
      <div class="section-eyebrow">Delivery Timeline</div>
      <div class="section-title">Indicative project schedule</div>
    </div>
    <span class="section-chevron">&#9660;</span>
  </summary>
  <div class="section-body">
    <div class="timeline">
      ${c.timeline.map((ph, i) => {
        const dotCls = i === 0 ? '' : i === 1 ? ' phase2' : ' phase3';
        return `<div class="tl-item">
        <div class="tl-dot${dotCls}">${i + 1}</div>
        <div class="tl-content">
          <div class="tl-weeks">${esc(ph.weeks || '')}</div>
          <h4>${esc(ph.label)}</h4>
          ${(ph.tasks || []).length ? `<ul style="margin:4px 0 0;padding-left:16px;">${ph.tasks.map(t => `<li style="font-size:12px;color:#44546A;line-height:1.5;">${esc(t)}</li>`).join('')}</ul>` : ''}
        </div>
      </div>`;
      }).join('\n      ')}
    </div>
  </div>
</details>`
    : '');

  // Investment / Pricing — loads rates from pricing-model.md and tm-rates.json
  if (c.pricing) {
    const pmPath = path.join(root, 'commons', 'sales', 'pricing-model.md');
    const pmText = fs.existsSync(pmPath) ? fs.readFileSync(pmPath, 'utf8') : '';
    const pm = parsePricingModelMd(pmText);
    const tmPath2 = path.join(root, 'commons', 'sales', 'tm-rates.json');
    const tmData = fs.existsSync(tmPath2) ? JSON.parse(fs.readFileSync(tmPath2, 'utf8')) : null;
    fill('investment-section', `<details class="section-block" id="investment-details">
  <summary class="section-head">
    <div class="section-summary">
      <div class="section-eyebrow">Investment</div>
      <div class="section-title">Pricing &amp; engagement model</div>
    </div>
    <span class="section-chevron">&#9660;</span>
  </summary>
  <div class="section-body">
    ${buildInvestmentSection(pm, m.flowCount, tmData, primaryProfile)}
  </div>
</details>`);
    // Fill proposal JS constants so Firestore acceptance records real values
    fill('proposal-rate',       String(pm.baseRate));
    fill('proposal-flow-count', String(m.flowCount));
    fill('proposal-model',      'iaas');
  } else {
    fill('investment-section', '');
    fill('proposal-rate',       '0');
    fill('proposal-flow-count', '0');
    fill('proposal-model',      '');
  }

  // About DataSkate — read from commons/sales/about-dataskate.md at build time
  fill('about-section', c.about || ABOUT_HTML);

  // Case studies — load library, score against client's systems + flow use cases, pick top 2
  const csLibPath = path.join(root, 'commons', 'social-proof', 'client-case-studies.json');
  let selectedCS = [];
  if (fs.existsSync(csLibPath)) {
    const allCS = JSON.parse(fs.readFileSync(csLibPath, 'utf8')).caseStudies || [];

    // Extract system signals from diagram nodes + flow routes
    const clientSystems = [];
    const sol = c.solution || {};
    if (sol.diagramNodes) {
      [...(sol.diagramNodes.sources || []), ...(sol.diagramNodes.targets || [])]
        .forEach(s => clientSystems.push(s.toLowerCase()));
    }
    c.flows.forEach(f => {
      f.route.split(/[→\-\s]+/).map(s => s.trim().toLowerCase())
        .filter(s => s && s !== 'mulesoft').forEach(s => clientSystems.push(s));
    });

    // Extract use-case signals from flow names + routes
    const flowSignals = c.flows.map(f => f.name.toLowerCase() + ' ' + f.route.toLowerCase()).join(' ');

    const scored = allCS.map(cs => {
      let score = 0;
      cs.systems.forEach(sys => {
        const sl = sys.toLowerCase();
        if (clientSystems.some(s => s.includes(sl) || sl.includes(s))) score += 3;
      });
      (cs.relevanceTags || []).forEach(tag => {
        if (flowSignals.includes(tag.toLowerCase())) score += 1;
      });
      return { cs, score };
    }).sort((a, b) => b.score - a.score);

    const relevant = scored.filter(x => x.score > 0).slice(0, 2);
    selectedCS = relevant.length > 0 ? relevant.map(x => x.cs) : scored.slice(0, 2).map(x => x.cs);
  }

  fill('case-studies-section', selectedCS.length > 0
    ? `<details class="section-block" open>
  <summary class="section-head">
    <div class="section-summary">
      <div class="section-eyebrow">Client Results</div>
      <div class="section-title">How similar teams have used DataSkate</div>
    </div>
    <span class="section-chevron">&#9660;</span>
  </summary>
  <div class="section-body">
    <div class="cs-grid">
      ${selectedCS.map(cs => `<div class="cs-card">
  <div class="cs-co">${esc(cs.company)}</div>
  <div class="cs-meta">${esc(cs.size)} &middot; ${esc((cs.systems || []).join(', '))}</div>
  <div class="cs-headline">${esc(cs.headline)}</div>
  <div class="cs-built">${esc(cs.whatWeBuilt)}</div>
  <div class="cs-outcome">&#10003; ${esc(cs.outcome)}</div>
  <div class="cs-ai">AI in Year 2: ${esc(cs.aiAngle)}</div>
</div>`).join('\n      ')}
    </div>
  </div>
</details>`
    : '');
}

function parsePricingModelMd(mdText) {
  const num        = s => parseFloat(String(s).replace(/[,$]/g, ''));
  const baseRate   = num((mdText.match(/\*\*Rate:\*\* \$([0-9,]+(?:\.\d+)?)/) || [,'300'])[1]);
  const escalation = parseFloat(((mdText.match(/escalating (\d+)%/) || [,'5'])[1])) / 100;
  const p2rate     = Math.round(baseRate * (1 + escalation) * 100) / 100;
  const implPerFlow = num((mdText.match(/\| Standard \| \$([0-9,]+)/) || [,'3500'])[1]);
  const retainer1  = num((mdText.match(/1[–\-]5 flows[^|]*\|\s*\$([0-9,]+)/) || [,'2500'])[1]);
  const retainer2  = num((mdText.match(/6[–\-]10 flows[^|]*\|\s*\$([0-9,]+)/) || [,'5000'])[1]);
  return { baseRate, p2rate, implPerFlow, retainer1, retainer2 };
}

// PROFILE_RECOMMENDED_MODEL declared above near top-level dispatch block

function buildInvestmentSection(pm, flowCount, tm, primaryProfile) {
  const n        = flowCount;
  const fmt      = v => '$' + Math.round(v).toLocaleString('en-US');
  const fmtD     = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const p1total  = pm.baseRate * n * 6;
  const p2total  = pm.p2rate  * n * 6;
  const yearTotal = p1total + p2total;
  const implTotal = pm.implPerFlow * n;
  const retainer  = n <= 5 ? pm.retainer1 : pm.retainer2;
  const weeks     = Math.ceil(2 + 1.5 * n);
  const diff = yearTotal - implTotal;

  // Psychology-driven model highlight
  const recModel = PROFILE_RECOMMENDED_MODEL[primaryProfile] || 'iaas';
  const iaasRec  = recModel === 'iaas' ? ' recommended' : '';
  const implRec  = recModel === 'impl' ? ' recommended' : '';
  const tmRec    = recModel === 'tm'   ? ' recommended' : '';

  // T&M calculations
  let tmCardHtml = '';
  let tmSectionHtml = '';
  if (tm) {
    const tmPerFlow = tm.resources.reduce((s, r) => s + r.ratePerHour * r.typicalHoursPerFlow, 0);
    const tmTotal   = tmPerFlow * n;
    tmCardHtml = `<div class="model-card${tmRec}" data-model="tm">
  ${tmRec ? '<div class="rec-badge">Recommended for you</div>' : ''}
  <div class="model-name">Model 3 — Time &amp; Materials</div>
  <div class="model-impl">${fmt(tmTotal)}</div>
  <div class="model-impl-label">Estimated total · ${n} flow${n !== 1 ? 's' : ''} · billed on actual hours logged</div>
  <hr class="model-divider">
  <div class="best-for">Resource rates</div>
  <table class="tm-rate-table">
    <thead><tr><th>Role</th><th>Rate/hr</th><th>~hrs/flow</th></tr></thead>
    <tbody>
      ${tm.resources.map(r => `<tr><td>${esc(r.role)}</td><td>${fmtD(r.ratePerHour)}</td><td>~${r.typicalHoursPerFlow}h</td></tr>`).join('\n      ')}
    </tbody>
  </table>
  <div class="model-vp">Scope can evolve mid-engagement. DataSkate logs hours in a shared sheet; you only pay for actual work done. Ideal when requirements are still forming.</div>
  <button class="btn btn-outline model-select-btn no-print" onclick="selectModel('tm','Model 3 — Time &amp; Materials','${fmt(tmPerFlow)}/flow est.')">Select this Model →</button>
</div>`;
    tmSectionHtml = `<div id="tm-rate-section" style="display:none">
  <div class="managed-intro">
    <h3>T&amp;M Resource Breakdown</h3>
    <p>Estimates based on typical hours per flow. Actual hours may vary; scope increases require written approval before work begins.</p>
  </div>
  <table class="managed-table">
    <thead>
      <tr><th>Role</th><th>Rate/hr</th><th>Est. hrs (${n} flows)</th><th>Estimated cost</th></tr>
    </thead>
    <tbody>
      ${tm.resources.map(r => `<tr><td>${esc(r.role)}</td><td>${fmtD(r.ratePerHour)}</td><td>~${r.typicalHoursPerFlow * n}h</td><td>${fmt(r.ratePerHour * r.typicalHoursPerFlow * n)}</td></tr>`).join('\n      ')}
      <tr><td colspan="3"><strong>Total estimate</strong></td><td><strong>${fmt(tm.resources.reduce((s, r) => s + r.ratePerHour * r.typicalHoursPerFlow * n, 0))}</strong></td></tr>
    </tbody>
  </table>
  <p style="font-size:12px;color:var(--mid);margin-top:10px;">Invoiced ${esc(tm.invoiceCycle)} based on actual hours logged. Minimum engagement: ${tm.minimumHours} hours. Time tracked via shared sheet provided at SOW signing.</p>
</div>`;
  }

  const iaasRecBadge = iaasRec ? '<div class="rec-badge">Recommended for you</div>' : '';
  const implRecBadge = implRec ? '<div class="rec-badge">Recommended for you</div>' : '';
  // IaaS detail section visible by default only when iaas is the recommended model
  const iaasDisplay = recModel !== 'iaas' ? ' style="display:none"' : '';

  return `<div class="model-grid">
  <div class="model-card${iaasRec}" data-model="iaas">
    ${iaasRecBadge}
    <div class="model-name">Model 1 — IaaS (Managed Service)</div>
    <div class="model-impl">${fmt(yearTotal)}</div>
    <div class="model-impl-label">1-year total · two 6-month payments · billing starts at go-live</div>
    <div class="model-service">${fmtD(pm.baseRate)}/flow/month</div>
    <div class="model-service-label">Period 1 rate · ${n} flow${n !== 1 ? 's' : ''} · DataSkate owns support all year</div>
    <div class="model-retainer">${fmt(retainer)} kickoff retainer — credited at go-live</div>
    <hr class="model-divider">
    <div class="best-for">What's covered</div>
    <div class="model-vp">Design, build, deployment, monitoring, and all support for 12 months. At month 12: renew at the same rate, or take full code ownership — your choice.</div>
    <div class="iaas-ai-callout">
      <div class="iaas-ai-callout-head">AI Included — Within Year 1</div>
      <p>By month 12, DataSkate begins building your first AI agent within the same engagement — full data automation and AI agent stack. No separate SOW, no Year 2 wait. The field structure and data layer we establish in week one is exactly what the model reads.</p>
    </div>
    <button class="btn btn-primary model-select-btn no-print" onclick="selectModel('iaas','Model 1 — IaaS (Managed Service)','${fmtD(pm.baseRate)}/flow/month (Period 1)')">Select this Model →</button>
  </div>
  <div class="model-card${implRec}" data-model="impl">
    ${implRecBadge}
    <div class="model-name">Model 2 — Implementation Only</div>
    <div class="model-impl">${fmt(implTotal)}</div>
    <div class="model-impl-label">One-time fee · ${n} flows × ${fmt(pm.implPerFlow)}/flow · ${weeks}-week delivery</div>
    <hr class="model-divider">
    <div class="best-for">What's covered</div>
    <div class="model-vp">Design, build, and deployment. Code ownership transfers at go-live. Your team handles support after handoff.</div>
    <button class="btn btn-outline model-select-btn no-print" onclick="selectModel('impl','Model 2 — Implementation Only','${fmt(implTotal)} one-time fee')">Select this Model →</button>
  </div>
  ${tmCardHtml}
</div>

<div id="iaas-rate-section"${iaasDisplay}>
  <div class="managed-intro">
    <h3>IaaS Payment Schedule</h3>
    <p>Two payments over 12 months. Billing begins at go-live — not at signing.</p>
  </div>
  <table class="managed-table">
    <thead>
      <tr><th>Period</th><th>Duration</th><th>Rate / flow / month</th><th>6-month payment (${n} flows)</th></tr>
    </thead>
    <tbody>
      <tr><td>Period 1</td><td>Month 1–6</td><td>${fmtD(pm.baseRate)}</td><td>${fmt(p1total)}</td></tr>
      <tr><td>Period 2</td><td>Month 7–12</td><td>${fmtD(pm.p2rate)}</td><td>${fmt(p2total)}</td></tr>
      <tr><td colspan="3"><strong>1-year total</strong></td><td><strong>${fmt(yearTotal)}</strong></td></tr>
    </tbody>
  </table>
  <p style="font-size:12px;color:var(--mid);margin-top:10px;">Your Anypoint Platform license is already in place through your MuleSoft AE relationship. Kickoff retainer (${fmt(retainer)}) due at SOW signing, credited against your first payment at go-live. At month 12: renew at the same rate, or take full code ownership — no escalation at renewal.</p>
</div>

<div id="impl-persuasion" style="display:none">
  <div class="impl-pitch">
    <div class="impl-pitch-head">Here's how the three models compare at the 12-month mark</div>
    <div class="impl-pitch-row"><span class="impl-pitch-icon">→</span><span><strong>Total cost at 12 months:</strong> Implementation Only ${fmt(implTotal)} · IaaS ${fmt(yearTotal)} — a difference of ${fmt(diff)}. IaaS spreads payment over two invoices; Implementation Only is due in two lump sums during build.</span></div>
    <div class="impl-pitch-row"><span class="impl-pitch-icon">→</span><span><strong>Support:</strong> IaaS — DataSkate owns all monitoring, incident response, and fixes for 12 months. Implementation Only — your team owns support from go-live.</span></div>
    <div class="impl-pitch-row"><span class="impl-pitch-icon">→</span><span><strong>At month 12:</strong> IaaS clients choose to renew at the current rate or take code ownership. Either way, they've had 12 months of DataSkate-managed uptime.</span></div>
    <div class="impl-pitch-row"><span class="impl-pitch-icon">→</span><span><strong>MuleSoft expertise:</strong> Implementation Only requires someone on your team who can administer Anypoint Platform after handoff. IaaS does not.</span></div>
    <div class="impl-pitch-row"><span class="impl-pitch-icon">→</span><span><strong>AI readiness — included at no charge:</strong> Before go-live, DataSkate delivers a personalized Agentic Readiness Document — mapping your integrated data layer to specific AI agents, with timing and cost estimates. Free for all implementation clients.</span></div>
    <p class="impl-pitch-note">If Implementation Only is still the right fit, continue below.</p>
  </div>
</div>

${tmSectionHtml}

<div class="negotiate-panel no-print" id="negotiate-panel" style="display:none">
  <div class="negotiate-header">
    <div class="negotiate-label">Your Selection</div>
    <h3 id="selected-model-name">—</h3>
    <p>Listed: <strong id="selected-rate">—</strong>. Leave the field blank to accept as listed, or enter a proposed figure to discuss.</p>
  </div>
  <div class="negotiate-grid">
    <div>
      <label class="negotiate-field-label">Your name <span class="negotiate-required">*</span></label>
      <input class="cta-input" type="text" id="negotiate-name" placeholder="Your full name" autocomplete="name" />
    </div>
    <div>
      <label class="negotiate-field-label" id="negotiate-rate-label">Proposed rate (optional)</label>
      <input class="cta-input" type="text" id="negotiate-rate" placeholder="e.g. $275/flow/month" oninput="onRateInput(this.value)" />
    </div>
  </div>
  <div style="margin-bottom:20px">
    <label class="negotiate-field-label">Notes <span class="negotiate-optional">(optional)</span></label>
    <textarea class="cta-input" id="negotiate-notes" placeholder="Any context or questions?" oninput="onNotesInput(this)"></textarea>
  </div>
  <button class="btn btn-primary btn-submit" id="negotiate-btn" onclick="submitSelection()">Confirm Selection →</button>
  <div class="accept-success" id="selection-success">&#10003; Your email app should open. We'll follow up within one business day.</div>
</div>`;
}

function diagramNodesToMermaid(nodes) {
  const sources = (nodes.sources || []);
  const targets = (nodes.targets || []);
  const lines = ['graph LR'];
  sources.forEach((s, i) => lines.push(`  S${i}["${s}"] --> MS`));
  lines.push('  MS["MuleSoft\\n(DataSkate managed)"]');
  targets.forEach((t, i) => lines.push(`  MS --> T${i}["${t}"]`));
  lines.push('  style MS fill:#F0FFF4,stroke:#38A169,color:#276749');
  return lines.join('\n');
}

function buildDiagramSvg(nodes) {
  const sources = nodes.sources || [];
  const targets = nodes.targets || [];
  const rows    = Math.max(sources.length, targets.length, 1);
  const BOX_H   = 32, GAP = 12;
  const h       = Math.max(120, rows * (BOX_H + GAP) + GAP * 2);
  const srcStep = h / (sources.length + 1);
  const tgtStep = h / (targets.length + 1);
  const hubY    = h / 2;
  const hubX    = 190, hubW = 120, hubH = 52;

  const srcRects = sources.map((name, i) => {
    const cy = Math.round(srcStep * (i + 1));
    return `<rect class="sv-src" x="5" y="${cy - BOX_H/2}" width="140" height="${BOX_H}" rx="6"/>
    <text class="sv-lsrc" x="75" y="${cy + 5}" text-anchor="middle">${esc(name)}</text>
    <line class="sv-line" x1="145" y1="${cy}" x2="${hubX}" y2="${hubY}" marker-end="url(#arr)"/>`;
  });

  const tgtRects = targets.map((name, i) => {
    const cy = Math.round(tgtStep * (i + 1));
    return `<rect class="sv-tgt" x="355" y="${cy - BOX_H/2}" width="140" height="${BOX_H}" rx="6"/>
    <text class="sv-ltgt" x="425" y="${cy + 5}" text-anchor="middle">${esc(name)}</text>
    <line class="sv-line" x1="${hubX + hubW}" y1="${hubY}" x2="355" y2="${cy}" marker-end="url(#arr)"/>`;
  });

  return `<svg viewBox="0 0 500 ${h}" style="width:100%;max-width:500px;height:auto;display:block;margin:8px auto;" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 Z" fill="var(--border)"/></marker>
    <style>
      .sv-src,.sv-tgt{fill:#fff;stroke:var(--border);stroke-width:1.5}
      .sv-hub{fill:#E8F5EE;stroke:var(--green);stroke-width:2}
      .sv-line{stroke:var(--border);stroke-width:1.5;fill:none}
      .sv-lsrc,.sv-ltgt{font:600 11px system-ui,sans-serif;fill:var(--dark)}
      .sv-lhub{font:700 12px system-ui,sans-serif;fill:var(--green)}
      .sv-lsub{font:400 9px system-ui,sans-serif;fill:var(--green)}
    </style>
  </defs>
  ${srcRects.join('\n  ')}
  <rect class="sv-hub" x="${hubX}" y="${hubY - hubH/2}" width="${hubW}" height="${hubH}" rx="8"/>
  <text class="sv-lhub" x="${hubX + hubW/2}" y="${hubY - 4}" text-anchor="middle">MuleSoft</text>
  <text class="sv-lsub" x="${hubX + hubW/2}" y="${hubY + 12}" text-anchor="middle">DataSkate Managed</text>
  ${tgtRects.join('\n  ')}
</svg>`;
}

// ─── INTAKE ──────────────────────────────────────────────────────────────────
// INTAKE_CATEGORIES is declared and exported near the top of this file
// (before the dispatch block) so buildIntake/buildIntakeFromMd helpers
// can reference it without TDZ errors.

// Map any incoming section id to its bucket key.
//   "1" / "S01" / " 10 " → numeric bucket (1-10)
//   "PF" / "FUTURE"      → synthetic Future-Flows bucket
function intakeCatFor(rawId) {
  const raw = String(rawId || '').trim().toUpperCase();
  // Match literal alpha IDs first (e.g. "PF") — preserves exact mapping
  for (const cat of INTAKE_CATEGORIES) {
    if (cat.sections.includes(raw)) return cat.key;
  }
  // Fall back to numeric matching
  const n = raw.replace(/[^0-9]/g, '').replace(/^0+/, '') || '0';
  for (const cat of INTAKE_CATEGORIES) {
    if (cat.sections.includes(n)) return cat.key;
  }
  return null;
}

// Build right-rail nav HTML grouped by category, given an ordered list of
// { id, displayId, title, anchorId } seen in this intake.
function buildIntakeRailNav(secMeta) {
  const byCat = new Map(INTAKE_CATEGORIES.map(c => [c.key, []]));
  const orphans = [];
  for (const s of secMeta) {
    const cat = intakeCatFor(s.id);
    if (cat && byCat.has(cat)) byCat.get(cat).push(s);
    else orphans.push(s);
  }
  const parts = [];
  for (const cat of INTAKE_CATEGORIES) {
    const items = byCat.get(cat.key);
    if (!items || items.length === 0) continue;
    parts.push(`<div class="nav-cat">${esc(cat.label)}</div>`);
    for (const s of items) {
      parts.push(
        `<a href="#${esc(s.anchorId)}" data-section="${esc(s.anchorId)}">` +
        `<span>§${esc(s.displayId)} ${esc(s.title)}</span>` +
        `<span class="nav-count"></span></a>`
      );
    }
  }
  if (orphans.length) {
    parts.push(`<div class="nav-cat">Other</div>`);
    for (const s of orphans) {
      parts.push(
        `<a href="#${esc(s.anchorId)}" data-section="${esc(s.anchorId)}">` +
        `<span>§${esc(s.displayId)} ${esc(s.title)}</span>` +
        `<span class="nav-count"></span></a>`
      );
    }
  }
  return parts.join('\n');
}

// Wrap an ordered list of section HTML blocks with hidden category anchors.
// The sticky cat-tabs are the visual category UI; the anchors are scroll
// targets so a tab click can jump to the start of each bucket.
function groupIntakeSectionsByCategory(secEntries) {
  // secEntries: [{ id, html }]
  const byCat = new Map(INTAKE_CATEGORIES.map(c => [c.key, []]));
  const orphans = [];
  for (const e of secEntries) {
    const cat = intakeCatFor(e.id);
    if (cat && byCat.has(cat)) byCat.get(cat).push(e.html);
    else orphans.push(e.html);
  }
  const out = [];
  for (const cat of INTAKE_CATEGORIES) {
    const items = byCat.get(cat.key);
    if (!items || items.length === 0) continue;
    out.push(`<a class="cat-anchor" id="cat-${cat.key}" data-cat="${cat.key}" aria-hidden="true"></a>`);
    out.push(items.join('\n\n'));
  }
  if (orphans.length) {
    out.push(`<a class="cat-anchor" id="cat-other" data-cat="other" aria-hidden="true"></a>`);
    out.push(orphans.join('\n\n'));
  }
  return out.join('\n\n');
}

// Sticky top tab bar — one tab per non-empty category.
function buildIntakeCatTabs(secEntries) {
  const counts = new Map(INTAKE_CATEGORIES.map(c => [c.key, 0]));
  for (const e of secEntries) {
    const cat = intakeCatFor(e.id);
    if (cat && counts.has(cat)) counts.set(cat, counts.get(cat) + 1);
  }
  return INTAKE_CATEGORIES
    .filter(c => counts.get(c.key) > 0)
    .map((c, i) => {
      const n = counts.get(c.key);
      const cls = i === 0 ? 'cat-tab is-active' : 'cat-tab';
      return (
        `<button type="button" class="${cls}" data-cat="${c.key}">` +
          `<span class="ct-num">${esc(c.num)} · ${esc(c.label.toUpperCase())}</span>` +
          `<span class="ct-title">${esc(c.label)}</span>` +
          `<span class="ct-meta">${n} ${n === 1 ? 'section' : 'sections'} · ${esc(c.blurb)}</span>` +
        `</button>`
      );
    })
    .join('\n');
}

// Default rail-links for every intake. Intake is client-facing — only external
// docs the client may legitimately need belong here. Architect Guide is internal
// (loginRequired, @dataskate.ai-gated) and must NEVER be linked from intake.
function buildIntakeRailLinks(meta) {
  const client = meta.clientSlug || '';
  const links = [
    { label: 'DS Pricing Model', url: 'https://dataskateclients.web.app/resources/ds-pricing-model.html' },
  ];
  if (client) {
    links.unshift(
      { label: 'Your Client Portal', url: `https://dataskateclients.web.app/portal/${client}.html` }
    );
  }
  for (const l of (meta.links || [])) {
    if (l && l.label && l.url) links.push({ label: l.label, url: l.url });
  }
  return links
    .map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a></li>`)
    .join('\n');
}

// Right-rail Needs-Attention seeded from p0Blockers. Dynamic
// required-unanswered items are appended client-side by rebuildAttention().
// Each li is clickable — data-target tells the rail JS where to jump:
//   "biz"        → expand biz-context (where the full P0 detail lives)
//   "sec:<id>"   → open that section block and scroll to it
function buildIntakeRailAttention(p0Blockers) {
  if (!p0Blockers || !p0Blockers.length) return '';
  return p0Blockers.map(b => {
    const target = b.sectionRef ? `sec:${b.sectionRef}` : 'biz';
    // Strip leading separator characters from the body — historical data carries
    // ' — '/'— '/': '/'- ' prefixes from when title+body rendered inline. With
    // the title now display:block, that punctuation looks orphaned at body start.
    const rawBody = (b.clientAction || b.body || b.blocker || '').replace(/^\s*[—\-:·]+\s*/, '');
    return (
      `<li data-target="${esc(target)}" tabindex="0" role="link">` +
        `<strong class="attn-title">${esc(b.title || b.system || 'P0 Blocker')}</strong>` +
        `<span class="attn-body">${esc(rawBody)}</span>` +
      `</li>`
    );
  }).join('\n');
}

// Phase chip shown next to the biz-context teaser when collapsed.
// Uses the first journey card's label ("Connected" / "Automated" / "Agentic")
// and tolerates labels that already include the "Phase N —" prefix.
function buildIntakePhaseChip(journeyCards) {
  if (!journeyCards || !journeyCards.length) return '';
  const raw = (journeyCards[0].label || 'Connected').trim();
  // Strip a leading "Phase N —" / "Phase N -" / "Phase N:" so we render uniformly.
  const stripped = raw.replace(/^phase\s*\d+\s*[—\-:·]\s*/i, '');
  return `<span class="bc-phase-chip">Phase 1 · ${esc(stripped)}</span>`;
}

// Pull any "Potential Flows" sub-block out of a section's bodyHtml so it can
// be promoted to the synthetic "future" bucket. Stops at the close of the
// first <table> so we don't accidentally swallow a trailing </details> or
// </div> that belongs to an enclosing UC wrapper (that bug nested all
// subsequent sections inside section 1 in browsers).
function extractPotentialFlowsBlock(bodyHtml) {
  if (!bodyHtml || typeof bodyHtml !== 'string') return { kept: bodyHtml, extracted: null };
  // Match: <h3>...Potential|Future Flows...</h3>(optional paragraphs)<table>...</table>
  // The terminating </table> is the hard boundary — never extend past it.
  const re = /<h3[^>]*>[^<]*(?:Potential|Future)\s+Flows[^<]*<\/h3>\s*(?:<p\b[\s\S]*?<\/p>\s*)*<table[\s\S]*?<\/table>/i;
  const m = bodyHtml.match(re);
  if (!m) return { kept: bodyHtml, extracted: null };
  const kept      = bodyHtml.slice(0, m.index) + bodyHtml.slice(m.index + m[0].length);
  const extracted = m[0];
  // Safety: refuse to extract if the slice would unbalance <details> tags in
  // either the kept content or the extracted block. Better to leave PF inline
  // than to ship malformed DOM that nests every subsequent section.
  const detailsDepth = (s) => {
    const r = /<\/?details\b[^>]*>/g;
    let dm, d = 0;
    while ((dm = r.exec(s)) !== null) d += dm[0].startsWith('</') ? -1 : 1;
    return d;
  };
  if (detailsDepth(kept) !== detailsDepth(bodyHtml) || detailsDepth(extracted) !== 0) {
    console.warn('⚠ Potential Flows extraction would unbalance <details> — keeping inline.');
    return { kept: bodyHtml, extracted: null };
  }
  return { kept, extracted };
}

// Count rows in the Potential-Flows table for the right-rail badge.
function countPotentialFlowRows(html) {
  if (!html) return 0;
  const tbody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbody) return 0;
  return (tbody[1].match(/<tr\b/gi) || []).length;
}

// Right-rail Future Flows card was removed by user feedback 2026-05-20 — the
// top "Future Flows" tab + the dedicated section already surface this. Keep
// the function as a no-op so the fill() call sites stay stable; restore the
// markup by returning the card HTML if it's ever re-introduced.
function buildIntakeRailFuture(/* flowCount */) {
  return '';
}

// Walk an array of sections, extract Potential Flows from any that contain it,
// merge all extracted blocks into a single synthetic "PF" section, and return
// the updated sections + the row count for the rail-future card.
function liftPotentialFlowsToOwnSection(sections) {
  const cleaned = [];
  const extracts = [];
  for (const sec of sections) {
    const { kept, extracted } = extractPotentialFlowsBlock(sec.bodyHtml || '');
    cleaned.push({ ...sec, bodyHtml: kept });
    if (extracted) extracts.push(extracted);
  }
  if (extracts.length === 0) return { sections: cleaned, flowCount: 0 };
  const merged = extracts.join('\n');
  cleaned.push({
    id: 'PF',
    title: 'Potential Flows — Not Priced in This Proposal',
    bodyHtml: merged,
  });
  return { sections: cleaned, flowCount: countPotentialFlowRows(merged) };
}

// Render the Source meta line. Hyperlinks to the storage folder when a
// sourceFilesFolder URL exists in project.json or meta.sourceUrl is set.
// Returns pre-escaped HTML (caller hands it to fill() without further escape).
function buildIntakeSource(sourceText, sourceUrl) {
  if (!sourceText) return '';
  if (!sourceUrl)  return esc(sourceText);
  return `<a class="source-link" href="${esc(sourceUrl)}" target="_blank" rel="noopener" title="Open source files in storage">${esc(sourceText)} <span class="src-icon">↗</span></a>`;
}

function buildIntake(c) {
  const m = c.meta;

  // sourceFilesFolder lives in project.json — read here so the Source line
  // can hyperlink to GCS storage without changing the intake-content.json schema.
  let sourceUrl = m.sourceUrl || '';
  if (!sourceUrl && client) {
    const projPath = path.join(root, 'projects', client, 'project.json');
    if (fs.existsSync(projPath)) {
      try {
        const proj = JSON.parse(fs.readFileSync(projPath, 'utf8'));
        sourceUrl = proj.sourceFilesFolder || '';
      } catch { /* non-fatal */ }
    }
  }

  fill('client-name',     m.clientName);
  fill('client-slug',     m.clientSlug || client);
  fill('eyebrow',         m.eyebrow || `DataSkate × ${esc(m.clientName)}`);
  fill('doc-title',       m.docTitle || m.title || '');
  fill('doc-subtitle',    m.docSubtitle || m.subtitle || '');
  fill('date',            m.date);
  fill('architect',       m.architect);
  fill('architect-email', m.architectEmail);
  fill('source',          buildIntakeSource(m.source || '', sourceUrl));

  const bc = c.bizContext || {};
  fill('bc-snapshot',    bc.snapshot || '');
  fill('bc-phase-chip',  buildIntakePhaseChip(bc.journeyCards));
  fill('journey-cards', (bc.journeyCards || []).map((jc, i) =>
    `<div class="journey-card ${jc.phase || `phase-${i + 1}`}">
      <div class="jc-phase">Phase ${i + 1}</div>
      <div class="jc-label">${esc(jc.label)}</div>
      <div class="jc-headline">${esc(jc.headline)}</div>
      <div class="jc-body">${jc.body}</div>
    </div>`
  ).join('\n'));

  fill('p0-blockers', bc.p0Blockers && bc.p0Blockers.length > 0
    ? `<div class="action-required">
        <h4>Action Required Before We Begin</h4>
        <ul>${bc.p0Blockers.map(b =>
          `<li><strong>${esc(b.title)}</strong>${esc(b.clientAction || b.body)}</li>`
        ).join('')}</ul>
      </div>`
    : '');

  // Lift any "Potential Flows" sub-block out of existing sections into its own
  // synthetic PF section so it can render as a Future-Flows tab + rail card.
  const lifted = liftPotentialFlowsToOwnSection(c.sections || []);
  const futureFlowCount = lifted.flowCount;

  // Build per-section HTML blocks + rail-nav metadata in one pass so anchor ids stay in sync.
  const secMeta = [];
  const secEntries = lifted.sections.map(sec => {
    const rawId     = String(sec.id || '');
    const displayId = rawId.replace(/^S?0*/i, '') || rawId;   // "S01" / "01" → "1"
    const anchorId  = `sec-${displayId || rawId}`;
    const catKey    = intakeCatFor(rawId) || 'other';
    secMeta.push({ id: rawId, displayId, title: sec.title || '', anchorId });
    return {
      id: rawId,
      html:
        `<details class="section-block" id="${esc(anchorId)}" data-section-id="${esc(displayId)}" data-cat="${esc(catKey)}">\n` +
        `  <summary class="section-head">\n` +
        `    <div class="section-num">${esc(displayId)}</div>\n` +
        `    <div class="section-title">${esc(sec.title)}</div>\n` +
        `    <span class="section-count"></span>\n` +
        `    <span class="section-chevron">▼</span>\n` +
        `  </summary>\n` +
        `  <div class="section-body">\n    ${sec.bodyHtml || ''}\n  </div>\n` +
        `</details>`,
    };
  });

  fill('cat-tabs',        buildIntakeCatTabs(secEntries));
  fill('form-sections',   groupIntakeSectionsByCategory(secEntries));
  fill('rail-nav',        buildIntakeRailNav(secMeta));
  fill('rail-future',     buildIntakeRailFuture(futureFlowCount));
  fill('rail-attention',  buildIntakeRailAttention(bc.p0Blockers));
  fill('rail-links',      buildIntakeRailLinks(m));

  fill('internal-flags', (c.internalFlags && c.internalFlags.bodyHtml)
    ? `<div class="internal-block no-print">
        <h3>Internal Technical Flags — Do Not Send to Client</h3>
        ${c.internalFlags.bodyHtml}
      </div>`
    : '');

  fill('pricing-summary', (c.pricingSummary && c.pricingSummary.bodyHtml)
    ? `<div class="internal-block no-print">
        <h3>Pricing Summary — Internal Only</h3>
        ${c.pricingSummary.bodyHtml}
      </div>`
    : '');
}

// ─── INTAKE FROM MARKDOWN ────────────────────────────────────────────────────
// Reads the Scout-generated intake-questionnaire-{client}.md and builds HTML.
// No intake-content.json required — falls back to this when JSON is absent.

function buildIntakeFromMd(md, clientSlug) {
  // Load project.json + company_context.json for pre-fill and biz context
  const slug    = clientSlug || '';
  const projPath = path.join(root, 'projects', slug, 'project.json');
  const ctxPath  = path.join(root, 'projects', slug, 'company_context.json');
  const proj = slug && fs.existsSync(projPath) ? JSON.parse(fs.readFileSync(projPath, 'utf8')) : {};
  const ctx  = slug && fs.existsSync(ctxPath)  ? JSON.parse(fs.readFileSync(ctxPath, 'utf8'))  : {};

  const meta = parseMdIntakeMeta(md, proj);
  const prefillCtx = buildPrefillContext(proj, ctx);

  fill('client-name',     meta.clientName);
  fill('client-slug',     slug || meta.clientName.toLowerCase().replace(/\s+/g, '-'));
  fill('eyebrow',         `DataSkate × ${esc(meta.clientName)} — Intake Questionnaire`);
  fill('doc-title',       `${esc(meta.clientName)} × DataSkate — Integration Discovery`);
  fill('doc-subtitle',    'Scoping supplement for your MuleSoft engagement');
  fill('date',            meta.date);
  fill('architect',       meta.architect);
  fill('architect-email', meta.architectEmail);
  fill('source',          buildIntakeSource(meta.source, proj.sourceFilesFolder || ''));

  // Biz context — populate from company_context.json if available
  const journeyArr = ctx.aiJourney
    ? Object.entries(ctx.aiJourney).map(([, s]) => s)
    : [];
  fill('bc-snapshot', ctx.snapshot ? esc(ctx.snapshot) : '');
  fill('bc-phase-chip', buildIntakePhaseChip(journeyArr));
  fill('journey-cards', journeyArr.length
    ? journeyArr.map((s, i) =>
        `<div class="journey-card phase-${i + 1}">
          <div class="jc-phase">Phase ${i + 1}</div>
          <div class="jc-label">${esc(s.label)}</div>
          <div class="jc-headline">${esc(s.headline)}</div>
          <div class="jc-body">${s.body}</div>
        </div>`
      ).join('\n')
    : '');
  fill('p0-blockers', ctx.p0Blockers && ctx.p0Blockers.length
    ? `<div class="bc-blockers no-print">
        <h4>Internal — Technical Blockers (P0) — Not Shown in PDF</h4>
        <ul>${ctx.p0Blockers.map(b => `<li>${esc(b.system)}: ${esc(b.blocker)}</li>`).join('')}</ul>
      </div>`
    : '');

  const sections    = splitMdIntakeSections(md);
  const clientSecs  = sections.filter(s => !s.isInternal);
  const internalSec = sections.find(s => s.isInternal);

  const secMetaMd = [];
  const secEntriesMd = clientSecs.map(sec => {
    const rawId     = sec.id || '';
    const displayId = rawId.replace(/^S?0*/i, '') || rawId;
    const anchorId  = `sec-${displayId || rawId}`;
    const catKey    = intakeCatFor(rawId) || 'other';
    secMetaMd.push({ id: rawId, displayId, title: sec.title || '', anchorId });
    return {
      id: rawId,
      html:
        `<details class="section-block" id="${esc(anchorId)}" data-section-id="${esc(displayId)}" data-cat="${esc(catKey)}">\n` +
        `  <summary class="section-head">\n` +
        `    <div class="section-num">${esc(displayId)}</div>\n` +
        `    <div class="section-title">${esc(sec.title)}</div>\n` +
        `    <span class="section-count"></span>\n` +
        `    <span class="section-chevron">▼</span>\n` +
        `  </summary>\n` +
        `  <div class="section-body">${renderMdIntakeSection(sec.body, prefillCtx)}</div>\n` +
        `</details>`,
    };
  });

  fill('cat-tabs',      buildIntakeCatTabs(secEntriesMd));
  fill('form-sections', groupIntakeSectionsByCategory(secEntriesMd));
  fill('rail-nav',      buildIntakeRailNav(secMetaMd));
  // MD path doesn't currently surface inferred-flow tables in section bodies;
  // empty by default. Future work: parse "Potential Flows" markdown table.
  fill('rail-future',   buildIntakeRailFuture(0));
  // ctx.p0Blockers in company_context.json uses {system, blocker} — adapt for attention list
  const railP0 = (ctx.p0Blockers || []).map(b => ({
    title: b.system, clientAction: b.blocker, body: b.blocker,
  }));
  fill('rail-attention', buildIntakeRailAttention(railP0));
  fill('rail-links',     buildIntakeRailLinks({ clientSlug: slug }));

  fill('internal-flags', internalSec
    ? `<div class="internal-block no-print">
        <h3>${esc(internalSec.title)}</h3>
        ${renderMdInternalSection(internalSec.body)}
      </div>`
    : '');

  fill('pricing-summary', '');
}

function buildPrefillContext(proj, ctx) {
  const patterns = [];
  const contacts = ctx.namedContacts || [];
  const primary  = proj.primaryContact || {};

  // Go-live date
  if (proj.targetGoLive && proj.targetGoLive !== 'TBD') {
    patterns.push({ regex: /go[\s-]?live|target.*date|launch date|planned.*date/i, value: proj.targetGoLive });
  }

  // Primary / UAT / testing contact
  if (primary.name) {
    patterns.push({
      regex: /primary.*contact|testing.*contact|uat.*contact|sign[- ]?off.*approver|who.*will.*test|main.*point.*contact/i,
      value: `${primary.name} (primary contact — confirm role)`
    });
  }

  // Named contacts by responsibility keyword + system
  for (const c of contacts) {
    const label = c.title ? `${c.name} (${c.title})` : c.name;
    for (const resp of (c.responsibilities || [])) {
      const kw = resp.toLowerCase();
      if (kw.includes('admin') || kw.includes('oauth') || kw.includes('authorized')) {
        const sysNames = (c.systems || []).join('|').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (sysNames) {
          patterns.push({
            regex: new RegExp(`(${sysNames}).*admin|(admin|authorize|consent|oauth).*${sysNames}`, 'i'),
            value: `${label} — confirm`
          });
        }
      }
      if (kw.includes('custom object') || kw.includes('create') || kw.includes('it lead')) {
        const sysNames = (c.systems || []).join('|').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (sysNames) {
          patterns.push({
            regex: new RegExp(`${sysNames}.*(object|field|custom|create)|who.*${sysNames}`, 'i'),
            value: `${label} — confirm`
          });
        }
      }
    }
  }

  return patterns;
}

function parseMdIntakeMeta(md, proj) {
  proj = proj || {};
  const lines = md.split('\n');
  const h1 = (lines.find(l => l.startsWith('# ')) || '').replace(/^# /, '');
  // Prefer project.json displayName; fall back to stripping generic words from the heading
  const clientName = proj.displayName
    || h1.replace(/\b(Integration|Intake|Questionnaire|Discovery)\b/gi, '').replace(/\s+/g, ' ').trim()
    || 'Client';
  const prepLine = lines.find(l => l.startsWith('**Prepared by:**')) || '';
  let architect = proj.architect || 'Kailash Chanda';
  let architectEmail = proj.architectEmail || 'kailash@dataskate.ai';
  const pm = prepLine.match(/DataSkate\s*[·•]\s*(.+?)\s*\(([^)]+)\)/);
  if (pm) { architect = pm[1].trim(); architectEmail = pm[2].trim(); }
  const dateLine = lines.find(l => l.startsWith('**Date:**')) || '';
  const date = dateLine.replace('**Date:**', '').trim();
  const srcLine = lines.find(l => /^\*\*Source/.test(l)) || '';
  const source = srcLine.replace(/^\*\*Source[^:]*:\*\*\s*/, '').trim();
  return { clientName, architect, architectEmail, date, source };
}

function splitMdIntakeSections(md) {
  const chunks = md.split(/^(?=## )/m).filter(s => s.trim().startsWith('## '));
  return chunks.map(raw => {
    const header = raw.split('\n')[0].trim();
    const body   = raw.split('\n').slice(1).join('\n').trim();
    const isInternal = /\[INTERNAL\]/i.test(header);
    const numMatch = header.match(/Section\s+(\d+)/i);
    const id    = numMatch ? `S${numMatch[1].padStart(2, '0')}` : '';
    const title = header.replace(/^## /, '').replace(/\[INTERNAL\]\s*/i, '').replace(/Section\s+\d+[:\s—–-]+/i, '').trim();
    return { id, title, isInternal, body };
  });
}

function renderMdIntakeSection(body, prefillCtx) {
  const lines = body.split('\n');
  const out   = [];
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t || t === '---' || t.startsWith('→ See Section') || t.startsWith('*End of intake')) { i++; continue; }
    // skip "How to use" block
    if (/^\*\*How to use/.test(t)) { while (i < lines.length && lines[i].trim() !== '---') i++; i++; continue; }

    // UC block: ### UCN — Title
    const ucM = t.match(/^### (UC[-\s]?\d+)\s*[—–-]+\s*(.+)/i);
    if (ucM) {
      const ucLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().match(/^###/) && !lines[i].trim().match(/^## /)) {
        ucLines.push(lines[i]); i++;
      }
      out.push(buildMdUcBlock(ucM[1].replace(/\s/g,'').toUpperCase(), ucM[2], ucLines, prefillCtx));
      continue;
    }

    // Subsection header: ### 2A — Salesforce
    const subM = t.match(/^### (.+)/);
    if (subM) { out.push(`<h3>${esc(subM[1])}</h3>`); i++; continue; }

    // P0 Blocker line
    if (t.includes('[P0 BLOCKER]')) {
      const txt = t.replace(/\*{0,2}\[P0 BLOCKER\]\*{0,2}\s*/, '').trim();
      out.push(`<div class="p0-block"><div class="p0-label">P0 Blocker</div><p>${mdInline(txt)}</p></div>`);
      i++; continue;
    }

    // Question: **Q1.1** text
    const qM = t.match(/^\*\*(Q[\d.a-z]+)\*\*\s*(.*)/i);
    if (qM) {
      const qLines = [lines[i]]; i++;
      while (i < lines.length) {
        const nt = lines[i].trim();
        if (nt.match(/^\*\*(Q[\d.a-z]+)\*\*/i) || nt.match(/^###/) || nt.match(/^## /)) break;
        qLines.push(lines[i]); i++;
      }
      out.push(buildMdQuestion(qM[1], qM[2], qLines.slice(1), prefillCtx));
      continue;
    }

    // Markdown table
    if (t.startsWith('|') && i + 1 < lines.length && lines[i+1].trim().match(/^\|[-\s:|]+\|/)) {
      const tbl = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { tbl.push(lines[i].trim()); i++; }
      out.push(buildMdFieldTable(tbl));
      continue;
    }

    // Scope boundary
    if (t.startsWith('**Scope Boundary') || t.startsWith('✅') || t.startsWith('⚠️') || t.startsWith('❌')) {
      if (t.startsWith('**Scope Boundary')) { i++; while (i < lines.length && !lines[i].trim()) i++; }
      const scope = [];
      while (i < lines.length) {
        const sl = lines[i].trim();
        if (sl.startsWith('✅') || sl.startsWith('⚠️') || sl.startsWith('❌')) { scope.push(sl); i++; }
        else break;
      }
      if (scope.length) out.push(buildMdScopeGrid(scope));
      continue;
    }

    // Raw HTML passthrough (e.g. <div class="tbl-hint">)
    if (t.startsWith('<')) { out.push(t); i++; continue; }

    i++;
  }
  return out.join('\n');
}

function buildMdUcBlock(ucId, title, bodyLines, prefillCtx) {
  const noteLines = [];
  let j = 0;
  while (j < bodyLines.length && !bodyLines[j].trim()) j++;
  if (bodyLines[j] && bodyLines[j].trim() === '**What we understood:**') {
    j++;
    while (j < bodyLines.length) {
      const lt = bodyLines[j].trim();
      if (!lt || lt.startsWith('**') || lt.startsWith('[P0')) break;
      if (lt.startsWith('- ')) noteLines.push(lt.slice(2));
      j++;
    }
  }
  const noteHtml = noteLines.length
    ? `<p class="uc-note">${noteLines.map(n => mdInline(n)).join('<br>')}</p>` : '';
  const bodyHtml = renderMdIntakeSection(bodyLines.join('\n'), prefillCtx);
  return `<details class="uc">
  <summary class="uc-hd">
    <span class="uc-tag">${esc(ucId)}</span>
    <h3>${esc(title)}</h3>
    <span class="uc-chevron">▼</span>
  </summary>
  <div class="uc-body">${noteHtml}${bodyHtml}</div>
</details>`;
}

function buildMdQuestion(qRef, qTextRaw, restLines, prefillCtx) {
  const safeId = `q-${qRef.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  let qText = qTextRaw.trim();
  const hints = [];
  let answerValue = null;
  let pills = [];
  let isRequired = false;

  for (const rline of restLines) {
    const rt = rline.trim();
    if (!rt) continue;
    // Session note: - *From sessions: ...*
    if (/^-\s*\*.*\*\s*$/.test(rt) || /^-\s*\*From sessions/.test(rt)) {
      hints.push(rt.replace(/^-\s*\*/, '').replace(/\*\s*$/, '').trim()); continue;
    }
    // Context/note line
    if (/^-\s*(Context|Note|Risk flag):/.test(rt)) {
      hints.push(rt.replace(/^-\s*(?:Context|Note|Risk flag):\s*/, '').trim()); continue;
    }
    // Answer line
    if (rt.startsWith('Answer:')) {
      const ans = rt.replace('Answer:', '').trim();
      if (!ans) { answerValue = ''; isRequired = true; }
      else if (ans.includes(' / ')) {
        pills = ans.split(' / ').map(o => o.trim().replace(/:$/, '')).filter(Boolean);
        answerValue = ''; isRequired = true;
      } else if (/^(Confirm|Provide|Please|Check|Verify|Tbd)/i.test(ans)) {
        hints.push(ans); answerValue = '';
      } else {
        answerValue = ans;
      }
      continue;
    }
    // Sub-options a) b) c) — append to question text
    if (/^[abc]\)/.test(rt)) { qText += ' ' + rt; }
  }

  if (/\[P0/.test(qTextRaw)) isRequired = true;

  // Auto pre-fill from context if answer is still blank
  if (!answerValue && prefillCtx && prefillCtx.length) {
    const qLower = qText.toLowerCase();
    for (const { regex, value } of prefillCtx) {
      if (regex.test(qLower)) { answerValue = value; break; }
    }
  }

  const cleanQ = qText.replace(/\[P0[^\]]*\]\s*/g, '').trim();
  const p0Badge = /\[P0/.test(qTextRaw)
    ? ' <span style="font-size:10px;font-weight:700;color:#991B1B;background:#FEE2E2;padding:1px 5px;border-radius:3px;">P0</span>' : '';

  const hintHtml = hints.length
    ? `<div class="q-hint">${hints.map(h => esc(h)).join('<br>')}</div>` : '';
  const pillHtml = pills.length
    ? `<div class="q-options">${pills.map(p =>
        `<span class="pill" onclick="pickPill(this,'${safeId}')">${esc(p)}</span>`
      ).join('')}</div>` : '';

  const isPrefilled = !!answerValue;
  const cls = `answer${isPrefilled ? ' is-prefilled' : ''}`;
  const req = isRequired ? ' data-required="true"' : '';
  const reqStar = isRequired ? ' <span class="req">*</span>' : '';
  const textarea = `<textarea class="${cls}" id="${safeId}"${req}>${isPrefilled ? esc(answerValue) : ''}</textarea>`;

  return `<div class="q">
  <span class="q-num"></span>
  <div class="q-body">
    <div class="q-text">${mdInline(cleanQ)}${p0Badge}${reqStar}</div>
    ${hintHtml}${pillHtml}${textarea}
  </div>
</div>`;
}

function buildMdFieldTable(lines) {
  const parseRow = l => l.split('|').slice(1, -1).map(c => c.trim());
  const headers  = parseRow(lines[0]);
  const confIdx  = headers.findIndex(h => /confirm/i.test(h));
  const thead = `<thead><tr>${headers.map(h => `<th>${mdInline(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${lines.slice(2).map(row => {
    const cells = parseRow(row);
    return `<tr>${cells.map((c, idx) =>
      idx === confIdx
        ? `<td><input type="text" class="tbl-ans" placeholder="✓ confirm"></td>`
        : `<td>${mdInline(c)}</td>`
    ).join('')}</tr>`;
  }).join('\n')}</tbody>`;
  return `<table class="dtbl">${thead}${tbody}</table>`;
}

function buildMdScopeGrid(lines) {
  const items = lines.map(l => {
    let cls = 'scope-in', label = 'In Scope';
    if (l.startsWith('⚠️')) { cls = 'scope-assumed'; label = 'Assumed'; }
    if (l.startsWith('❌')) { cls = 'scope-out';     label = 'Out of Scope'; }
    const text = l.replace(/^[✅⚠️❌]\s*(IN SCOPE|ASSUMED PRE-EXISTS|OUT OF SCOPE):\s*/i, '').trim();
    return `<div class="scope-item ${cls}"><span class="scope-label">${label}</span>${esc(text)}</div>`;
  });
  return `<div class="scope-grid">${items.join('\n')}</div>`;
}

function renderMdInternalSection(body) {
  const items = [];
  let cur = null;
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t || t === '---') continue;
    const m = t.match(/^(\d+)\.\s*\*\*([^*]+)\*\*:\s*(.*)/);
    if (m) {
      if (cur) items.push(cur);
      cur = { num: m[1], title: m[2], body: m[3] };
    } else if (cur) {
      cur.body += ' ' + t;
    }
  }
  if (cur) items.push(cur);
  return items.map(it =>
    `<div class="flag-item">
      <div class="flag-num">${it.num}</div>
      <div class="flag-body"><strong>${esc(it.title)}</strong>: ${mdInline(it.body)}</div>
    </div>`
  ).join('\n') || `<div class="flag-body">${mdToHtml(body)}</div>`;
}

// ─── PORTAL ──────────────────────────────────────────────────────────────────

function buildPortal(c) {
  const m = c.meta;

  fill('client-name',      m.clientName);
  fill('client-slug',      m.clientSlug || client);
  fill('engagement-type',  m.engagementType || 'Integration Project');
  fill('architect',        m.architect);
  fill('architect-email',  m.architectEmail);
  fill('client-logo', m.clientLogoPath
    ? `<div class="client-logo-block"><div class="client-logo-sep"></div><img src="${esc(m.clientLogoPath)}" alt="${esc(m.clientName)}" class="client-logo-img" onerror="this.parentNode.style.display=\'none\'"></div>`
    : '');
  fill('project-started',  m.projectStarted || '');
  fill('target-go-live',   m.targetGoLive   || 'TBD');
  fill('updated',          m.updated        || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
  fill('sow-signed',       c.sowSigned ? 'true' : 'false');

  // Phase bar — phases array: [{ label, status: 'done'|'active'|'future' }]
  const phases = c.phases || [
    { label: 'Discovery',     status: 'active' },
    { label: 'Requirements',  status: 'future' },
    { label: 'Build',         status: 'future' },
    { label: 'Testing',       status: 'future' },
    { label: 'Go Live',       status: 'future' },
  ];
  fill('phase-bar', phases.map((p, i) => {
    const parts = [`<div class="phase-step phase-${esc(p.status)}"><div class="phase-dot"></div><div class="phase-label">${esc(p.label)}</div></div>`];
    if (i < phases.length - 1) parts.push(`<div class="phase-line${p.status === 'done' ? ' done' : ''}"></div>`);
    return parts.join('');
  }).join(''));

  // Client portal is publicly accessible — strip internal-only docs (e.g.
  // Pitch Kit / integration-deck) so they never leak to clients. The Pitch
  // Kit lives on the architect portal (firebase/public/index.html) only.
  const INTERNAL_DOC_TITLES = /^(pitch\s*kit|integration\s*deck|architect\s*guide)$/i;
  const internalDocs = (c.internalDocs || [])
    .filter(d => d && d.href && !INTERNAL_DOC_TITLES.test(d.title || ''));
  fill('internal-docs', internalDocs.length > 0
    ? `<div class="internal-docs">
        <span class="internal-docs-label">Internal</span>
        ${internalDocs.map(d =>
          `<a class="internal-doc-link" href="${esc(d.href)}" target="_blank">${d.icon || '📄'} ${esc(d.title)} ›</a>`
        ).join('')}
      </div>`
    : '');

  // Doc cards — array of { icon, title, sub, status: 'available'|'pending'|'na', href? }
  fill('doc-cards', (c.docCards || []).map(d => {
    const cls = `doc-card doc-${esc(d.status || 'na')}`;
    const idAttr = d.id ? ` id="card-${esc(d.id)}"` : '';
    const inner = `<div class="doc-icon">${d.icon || '📄'}</div>
      <div class="doc-info"><div class="doc-title">${esc(d.title)}</div><div class="doc-sub">${esc(d.sub || '')}</div></div>
      ${d.status === 'available' ? '<div class="doc-arrow">→</div>' : ''}`;
    return d.href
      ? `<a${idAttr} class="${cls}" href="${esc(d.href)}" target="_blank">${inner}</a>`
      : `<div${idAttr} class="${cls}">${inner}</div>`;
  }).join('\n'));

  // Sprint section — empty state or stats bar + epic/story blocks
  if (!c.sprints || c.sprints.length === 0) {
    fill('sprint-section', `<div class="sprint-empty">
      <div class="sprint-empty-icon">📋</div>
      <div class="sprint-empty-title">Sprint planning not yet started</div>
      <div class="sprint-empty-body">Stories and epics will appear here once your project moves into the Build phase.</div>
    </div>`);
  } else {
    const st = c.sprintStats;
    const statBar = st ? `<div class="sprint-stats">
      <div class="sprint-stat"><span class="sn sn-total">${st.total}</span><span class="sl">Total Stories</span></div>
      <div class="sprint-stat"><span class="sn sn-done">${st.done}</span><span class="sl">Done</span></div>
      <div class="sprint-stat"><span class="sn sn-active">${st.active}</span><span class="sl">In Progress</span></div>
      <div class="sprint-stat"><span class="sn sn-review">${st.review}</span><span class="sl">Review</span></div>
      <div class="sprint-stat"><span class="sn sn-planned">${st.planned}</span><span class="sl">Planned</span></div>
    </div>` : '';
    fill('sprint-section', statBar + c.sprints.map(epic =>
      `<details class="epic-block" open>
        <summary class="epic-header">
          <span class="epic-num">${esc(epic.id)}</span>
          <span class="epic-title">${esc(epic.title)}</span>
          <span class="epic-progress">
            <span class="epic-bar"><span class="epic-bar-fill" style="width:${epic.pct || 0}%"></span></span>
            <span class="epic-pct">${epic.pct || 0}%</span>
          </span>
          <span class="epic-count">${(epic.stories || []).length} stories</span>
        </summary>
        <div class="epic-stories">
          ${(epic.stories || []).map(s =>
            `<div class="story-row">
              <span class="story-id">${esc(s.id)}</span>
              <span class="story-title">${esc(s.title)}</span>
              <span class="chip chip-${esc(s.status || 'planned')}">${esc(s.statusLabel || s.status || 'Planned')}</span>
              ${s.desc ? `<span class="story-desc">${esc(s.desc)}</span>` : ''}
            </div>`
          ).join('\n')}
        </div>
      </details>`
    ).join('\n'));
  }
}

// ─── FLYER ───────────────────────────────────────────────────────────────────
// Reads pricing-model.md — single source of truth for all pricing values.

function buildFlyer(md) {
  const num  = s => parseFloat(String(s).replace(/[,$]/g, ''));
  const fmt  = n => '$' + Math.round(n).toLocaleString('en-US');
  const fmtD = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Parse pricing values from markdown
  const baseRate   = num((md.match(/\*\*Rate:\*\* \$([0-9,]+(?:\.\d+)?)/) || [,'300'])[1]);
  const escalation = parseFloat(((md.match(/escalating (\d+)%/) || [,'5'])[1])) / 100;
  const p2rate     = Math.round(baseRate * (1 + escalation) * 100) / 100;
  const retainer1  = num((md.match(/1[–\-]5 flows[^|]*\|\s*\$([0-9,]+)/) || [,'2500'])[1]);
  const retainer2  = num((md.match(/6[–\-]10 flows[^|]*\|\s*\$([0-9,]+)/) || [,'5000'])[1]);
  const stdImpl    = num((md.match(/\| Standard \| \$([0-9,]+)/) || [,'3500'])[1]);
  const coMod      = num((md.match(/\*\*Modification\*\*[^|]*\|\s*\$([0-9,]+)/) || [,'750'])[1]);
  const coExt      = num((md.match(/\*\*Extension\*\*[^|]*\|\s*\$([0-9,]+)/) || [,'1500'])[1]);
  const replacement = num((md.match(/replacement fee: \$([0-9,]+)/) || [,'1500'])[1]);

  fill('header-tagline', 'MuleSoft Integration Services — Pricing Overview');
  fill('iaas-rate',      fmtD(baseRate));
  fill('iaas-period2',   `${fmtD(p2rate)}/flow/mo`);
  fill('retainer-range', `${fmt(retainer1)}–${fmt(retainer2)}`);
  fill('impl-rate',      fmt(stdImpl));
  fill('phase2-body',    'Once systems are connected, DataSkate returns for a Phase 2 SOW: AI agents that use those integrations to automate workflows, surface decisions, and reduce manual operations. Available under all three models.');
  fill('footer-address', '196 Princeton Hightstown Road, Building 2A Suite 11, West Windsor NJ 08550');
  fill('footer-contact', 'dataskate.ai | kailash@dataskate.ai');

  // T&M model
  const tmPath = path.join(root, 'commons', 'sales', 'tm-rates.json');
  const tm = fs.existsSync(tmPath) ? JSON.parse(fs.readFileSync(tmPath, 'utf8')) : null;
  if (tm) {
    fill('tm-card-rows', tm.resources.map(r =>
      `<div class="model-row"><span class="lbl">${esc(r.role)}</span><span class="val big">$${r.ratePerHour}<span style="font-size:9px;font-weight:400;color:var(--mid);">/hr · ~${r.typicalHoursPerFlow}h/flow</span></span></div>`
    ).join('\n      '));
    fill('tm-invoice', esc(tm.invoiceCycle));
    fill('tm-minimum', `${tm.minimumHours} hrs`);
  } else {
    fill('tm-card-rows', '');
    fill('tm-invoice', 'bi-weekly');
    fill('tm-minimum', '80 hrs');
  }

  fill('change-order-rows', [
    ['Config',       'Field mapping, credentials, tuning',    '<strong>Free</strong>'],
    ['Modification', 'New logic, branch, transform',          `<strong>${fmt(coMod)}</strong>`],
    ['Extension',    'New object type, new secondary system', `<strong>${fmt(coExt)}</strong>`],
  ].map(([tier, what, fee]) =>
    `<tr><td>${tier}</td><td>${what}</td><td>${fee}</td></tr>`
  ).join('\n'));

  fill('decommission-rows', [
    ['Flow replaced by new flow',    `<strong>${fmt(replacement)} fee</strong> + fresh 12-mo contract`],
    ['Decommission, no replacement', 'Remaining balance <strong>accelerates</strong> — payable immediately'],
    ['Scope change within same flow','Change order applies (see left)'],
  ].map(([scenario, outcome]) =>
    `<tr><td>${scenario}</td><td>${outcome}</td></tr>`
  ).join('\n'));
}

// ─── INTEGRATION DECK ────────────────────────────────────────────────────────

function buildIntegrationDeck(c) {
  const m = c.meta;

  fill('client-name',    m.clientName);
  fill('subtitle',       m.subtitle || `${esc(m.industry)} · ${esc(m.flowCount)} flows · ${esc(m.revenue)}`);
  fill('location',       m.location  || '');
  fill('industry',       m.industry  || '');
  fill('revenue',        m.revenue   || '');
  fill('architect',      m.architect || '');
  fill('date',           m.date      || '');

  // Snapshot
  fill('snapshot-description', c.snapshot.description || '');
  fill('snapshot-cards', [
    { label: 'Industry',  value: m.industry  || '—' },
    { label: 'Revenue',   value: m.revenue   || '—' },
    { label: 'Location',  value: m.location  || '—' },
    { label: 'Flows',     value: `${m.flowCount || '—'} integration flows` },
    ...(c.snapshot.systems || []).map(s => ({ label: 'System', value: s })),
  ].map(card =>
    `<div class="snapshot-card">
      <div class="sc-label">${esc(card.label)}</div>
      <div class="sc-value">${esc(card.value)}</div>
    </div>`
  ).join('\n'));

  fill('pain-points', (c.snapshot.painPoints || []).map(p =>
    `<li>${esc(p)}</li>`
  ).join('\n'));

  // Talking points
  fill('talking-points', (c.talkingPoints || []).map(tp =>
    `<div class="tp-block">
      <div class="tp-trigger">${esc(tp.trigger)}</div>
      <div class="tp-say">${esc(tp.say)}</div>
      ${tp.impact ? `<div class="tp-impact"><strong>Impact:</strong> ${esc(tp.impact)}</div>` : ''}
    </div>`
  ).join('\n'));

  // Nearby peers
  const peers = c.nearbyPeers || [];
  fill('search-radius',  m.searchRadius || '100 miles');
  fill('peer-rows', peers.length > 0
    ? peers.map(p =>
        `<tr>
          <td>
            <div class="peer-name">${esc(p.name)}</div>
            <div><span class="peer-dist">${esc(p.distance)}</span></div>
            <div style="font-size:12px;color:var(--mid);margin-top:4px">${esc(p.location || '')} · ${esc(p.revenue || '')}</div>
            ${p.source ? `<div class="peer-source">${esc(p.source)}</div>` : ''}
          </td>
          <td>${esc(p.what)}</td>
          <td>${esc(p.outcome)}</td>
        </tr>`
      ).join('\n')
    : `<tr><td colspan="3" style="text-align:center;color:var(--mid);padding:20px">No peer companies found within search radius.</td></tr>`
  );

  // Competitor FOMO cards
  const fomo = c.competitorFOMO || [];
  fill('revenue-bracket', m.revenueBracket || m.revenue || 'comparable');
  const TIER_LABELS = {
    'exact-match':       { label: 'Exact match',        cls: 'tier-exact' },
    'same-industry':     { label: 'Same industry',      cls: 'tier-adjacent' },
    'adjacent-industry': { label: 'Adjacent industry',  cls: 'tier-adjacent' },
    'industry-stat':     { label: 'Industry data',      cls: 'tier-stat' },
  };
  fill('fomo-cards', fomo.length > 0
    ? fomo.map(f => {
        const systems = (f.systemsUsed || []).join(' → ');
        const tier = TIER_LABELS[f.relevanceTier] || { label: f.relevanceTier || '', cls: 'tier-stat' };
        return `<div class="fomo-card">
  <div class="fomo-card-head">
    <span class="fomo-co-name">${esc(f.name)}</span>
    <span class="fomo-co-meta">${[f.location, f.revenue, systems].filter(Boolean).map(esc).join(' · ')}</span>
    ${tier.label ? `<span class="fomo-tier-badge ${esc(tier.cls)}">${esc(tier.label)}</span>` : ''}
  </div>
  ${f.analogyNote ? `<div class="fomo-analogy">${esc(f.analogyNote)}</div>` : ''}
  <div class="fomo-card-body">
    <div class="fomo-cell">
      <span class="fomo-cell-label">What They Built</span>
      <span class="fomo-cell-value">${esc(f.whatTheyBuilt || f.what || '')}</span>
    </div>
    <div class="fomo-cell">
      <span class="fomo-cell-label">AI Use Case</span>
      <span class="fomo-cell-value">${esc(f.aiUseCase || '—')}</span>
    </div>
    <div class="fomo-cell">
      <span class="fomo-cell-label">Savings / ROI</span>
      <span class="fomo-savings">${esc(f.savings || '—')}</span>
    </div>
    <div class="fomo-cell">
      <span class="fomo-cell-label">Status</span>
      <span class="fomo-cell-value"><span class="fomo-status">${esc(f.status || '')}</span></span>
      ${f.source ? `<span style="font-size:11px;color:var(--mid);margin-top:4px;font-style:italic">${esc(f.source)}</span>` : ''}
    </div>
  </div>
  ${(f.before || f.after) ? `<div class="fomo-before-after">
    <div class="fomo-before"><div class="fomo-ba-label">Before</div><div class="fomo-ba-text">${esc(f.before || '—')}</div></div>
    <div class="fomo-after"><div class="fomo-ba-label">After</div><div class="fomo-ba-text">${esc(f.after || '—')}</div></div>
  </div>` : ''}
  ${f.fomoAngle ? `<div class="fomo-angle">${esc(f.fomoAngle)}</div>` : ''}
</div>`;
      }).join('\n')
    : `<div style="text-align:center;color:var(--mid);padding:24px;border:1px dashed var(--border);border-radius:6px;margin-top:14px">No verified competitor data found for this revenue bracket and use case.</div>`
  );

  // Opening lines
  fill('opening-lines', (c.openingLines || []).map(ol =>
    `<div class="ol-block">
      <div class="ol-context">${esc(ol.context)}</div>
      <div class="ol-line">${esc(ol.line)}</div>
    </div>`
  ).join('\n'));

  // AI journey narrative
  fill('ai-narrative', c.aiJourneyNarrative || '');
}

// ─── CORPORATE BRIEF ─────────────────────────────────────────────────────────
//
// 1-page pre-call research summary sent to the buyer 48h before the deep-dive
// call. Renders projects/{slug}/intake/corporate-brief-content.json against
// commons/templates/corporate-brief-template.html.
//
// Source of truth: company_context.json.corporateStack — populated by Scout's
// grounded inference (operating brand) and enriched by Vera (operating
// platform's full sibling list, financial sponsor's portfolio companies,
// integration signals per sibling).
//
// Content shape (see orchestrate.js renderCorporateBrief() for the writer):
//   meta:               { clientName, clientSlug, date, architect, architectEmail, subtitle }
//   intro:              one-paragraph cover line
//   operatingBrand:     { name, website, linkedIn, industry, hqLocation, founded, scale, evidence }
//   operatingPlatform:  { name, website, linkedIn, evidence, greenfieldFlag, siblingBrands[] } | null
//   financialSponsor:   { name, website, linkedIn, evidence } | null
//   forwardLookingTalkingPoints: [{ horizon: '6mo'|'18mo'|'5yr', insight, sourceUrl }]
//   intelTheBuyerLacks:          [{ insight, sourceUrl, whyTheyLackIt }]
//   citations:          [{ label, url }]
//   closing:            one-line sign-off
function buildCorporateBrief(c) {
  const m = c.meta || {};
  fill('client-name',     m.clientName);
  fill('client-slug',     m.clientSlug || client || '');
  fill('subtitle',        m.subtitle || 'What we noticed before the deep-dive call');
  fill('architect',       m.architect       || 'DataSkate Team');
  fill('architect-email', m.architectEmail  || 'kailash@dataskate.ai');
  fill('date',            m.date            || '');
  fill('client-logo',     clientLogoHtml(resolveClientLogoPath(m.clientSlug || client), m.clientName));

  fill('intro', c.intro
    ? `<strong>Before our deep-dive call:</strong> ${esc(c.intro)}`
    : `<strong>Before our deep-dive call:</strong> Here's what we noticed about your business in public records and industry data. We don't pitch what you already know — this brief tells you what we observed so we can spend the call on what's <em>not</em> in public records.`);

  // ── Corporate stack: 3 cards (operating brand, platform, sponsor) ─────────
  const cardOrEmpty = (role, modifier, entity, evidenceFallback) => {
    if (!entity || !entity.name) {
      return `<div class="stack-card empty-card">
        <div class="stack-role">${esc(role)}</div>
        <div class="stack-name">Not applicable — independent / family-owned</div>
      </div>`;
    }
    const meta = [
      entity.industry  ? esc(entity.industry)  : null,
      entity.hqLocation? esc(entity.hqLocation): null,
      entity.founded   ? `Founded ${esc(entity.founded)}` : null,
      entity.scale     ? esc(entity.scale)     : null,
    ].filter(Boolean).join(' · ');
    const links = [
      entity.website  ? `<a href="${esc(entity.website)}" target="_blank" rel="noopener">${esc(entity.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>` : null,
      entity.linkedIn ? `<a href="${esc(entity.linkedIn)}" target="_blank" rel="noopener">LinkedIn</a>` : null,
    ].filter(Boolean).join(' &middot; ');
    return `<div class="stack-card ${modifier}">
      <div class="stack-role">${esc(role)}</div>
      <div class="stack-name">${esc(entity.name)}</div>
      ${meta   ? `<div class="stack-meta">${meta}</div>` : ''}
      ${links  ? `<div class="stack-meta">${links}</div>` : ''}
      ${entity.evidence ? `<div class="stack-evidence">${esc(entity.evidence)}</div>` : (evidenceFallback ? `<div class="stack-evidence">${esc(evidenceFallback)}</div>` : '')}
    </div>`;
  };
  fill('stack-cards',
    cardOrEmpty('Operating brand',    'brand-card',    c.operatingBrand,    null) +
    cardOrEmpty('Operating platform', 'platform-card', c.operatingPlatform, null) +
    cardOrEmpty('Financial sponsor',  'sponsor-card',  c.financialSponsor,  null)
  );

  // ── Siblings ──────────────────────────────────────────────────────────────
  const platform   = c.operatingPlatform || {};
  const siblings   = Array.isArray(platform.siblingBrands) ? platform.siblingBrands : [];
  const greenfield = platform.greenfieldFlag === true;
  fill('siblings-eyebrow', siblings.length ? ` — ${siblings.length} under ${esc(platform.name || 'platform')}` : '');
  fill('greenfield-banner', greenfield && siblings.length
    ? `<div class="sibling-greenfield-banner"><strong>Greenfield opportunity:</strong> none of the ${siblings.length} sibling brands shows a public integration footprint yet. The first sibling to invest sets the playbook for the rest.</div>`
    : '');
  fill('sibling-rows', siblings.length
    ? siblings.map(s => {
        const name = typeof s === 'string' ? s : (s.name || '');
        if (!name) return '';
        const obj  = typeof s === 'string' ? {} : s;
        const link = obj.website ? `<a href="${esc(obj.website)}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name);
        const sig  = obj.integrationSignal || 'unknown — no public integration footprint found';
        const sigClass = /^unknown/i.test(sig) ? 'sibling-signal unknown' : 'sibling-signal';
        const src = obj.sourceUrl ? ` <a href="${esc(obj.sourceUrl)}" target="_blank" rel="noopener" style="font-size:11px;color:var(--mid)">[source]</a>` : '';
        return `<div class="sibling-row">
          <div>
            <div class="sibling-name">${link}</div>
            ${obj.website ? `<div class="sibling-meta">${esc(obj.website.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</div>` : ''}
          </div>
          <div class="${sigClass}">${esc(sig)}${src}</div>
        </div>`;
      }).filter(Boolean).join('\n')
    : `<div style="font-size:12px;color:var(--mid);font-style:italic">No sibling brands identified — operating brand stands alone.</div>`
  );

  // ── Intel (forward-looking + intelTheBuyerLacks) ──────────────────────────
  const horizonLabels = { '6mo': '6 months', '18mo': '18 months', '5yr': '5 years' };
  const fwd = Array.isArray(c.forwardLookingTalkingPoints) ? c.forwardLookingTalkingPoints : [];
  const gap = Array.isArray(c.intelTheBuyerLacks)          ? c.intelTheBuyerLacks          : [];
  const intelCards = [
    ...fwd.map(f => `<div class="intel-card">
      <span class="intel-tag horizon-${esc(f.horizon || '18mo')}">In ${esc(horizonLabels[f.horizon] || f.horizon || '18 months')}</span>
      <div class="intel-text">${esc(f.insight || '')}</div>
      ${f.sourceUrl ? `<div class="intel-source"><a href="${esc(f.sourceUrl)}" target="_blank" rel="noopener">source</a></div>` : ''}
    </div>`),
    ...gap.map(g => `<div class="intel-card">
      <span class="intel-tag you-lack">Worth knowing</span>
      <div class="intel-text">${esc(g.insight || '')}</div>
      ${g.whyTheyLackIt ? `<div class="intel-source" style="color:var(--mid)">Why it's not in your research: ${esc(g.whyTheyLackIt)}</div>` : ''}
      ${g.sourceUrl ? `<div class="intel-source"><a href="${esc(g.sourceUrl)}" target="_blank" rel="noopener">source</a></div>` : ''}
    </div>`),
  ].join('\n');
  fill('intel-eyebrow', (fwd.length + gap.length) ? ` — ${fwd.length + gap.length} signal${fwd.length + gap.length === 1 ? '' : 's'}` : '');
  fill('intel-cards', intelCards || `<div style="font-size:12px;color:var(--mid);font-style:italic">No forward-looking or gap intel surfaced yet — Vera enriches this on Step 2c/2d.</div>`);

  // ── Citations ─────────────────────────────────────────────────────────────
  const cites = Array.isArray(c.citations) ? c.citations : [];
  fill('citations', cites.length
    ? cites.map(ct => `<span class="citation-chip"><a href="${esc(ct.url || '#')}" target="_blank" rel="noopener">${esc(ct.label || ct.url || 'source')}</a></span>`).join('')
    : `<span class="citation-chip" style="font-style:italic">No citations recorded for this engagement yet.</span>`
  );

  // ── Closing ───────────────────────────────────────────────────────────────
  fill('closing', c.closing
    ? `<p>${esc(c.closing)}</p>`
    : `<p>This brief is the homework. The call is for the rest.</p>`);
}

// ─── RESOURCE ────────────────────────────────────────────────────────────────

function buildResource(mdText) {
  const title = (mdText.match(/^#+ (.+)/m) || ['', resourceName || 'DataSkate Internal'])[1].trim();
  fill('eyebrow', 'DataSkate Internal');
  fill('title',   title);
  fill('content', mdToHtml(mdText));
}

function mdToHtml(md) {
  const lines = md.split('\n');
  const blocks = [];
  let i = 0;
  let skippedH1 = false;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip the first h1 — already shown in page header
    if (!skippedH1 && /^# /.test(line)) {
      skippedH1 = true;
      i++;
      continue;
    }

    // Blank line
    if (trimmed === '') { i++; continue; }

    // Fenced code block
    if (line.startsWith('```') || trimmed.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push(`<pre class="code-block"><code>${escText(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (hMatch) {
      const level = Math.min(hMatch[1].length, 4);
      blocks.push(`<h${level}>${mdInline(hMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Table — detect by: line starts with |, next line is a separator |---|
    if (trimmed.startsWith('|') && i + 1 < lines.length) {
      const sep = lines[i + 1].trim();
      if (sep.startsWith('|') && /\|[\s\-:]+\|/.test(sep)) {
        const tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }
        blocks.push(buildMdTable(tableLines));
        continue;
      }
    }

    // Raw HTML block — pass through verbatim (for inline diagrams/SVGs)
    if (/^<(div|figure|svg|section|aside|details|summary)[\s>]/.test(trimmed)) {
      const htmlLines = [];
      const openTag = trimmed.match(/^<(\w+)/)[1];
      let depth = 0;
      while (i < lines.length) {
        const l = lines[i];
        const t = l.trim();
        depth += (t.match(new RegExp(`<${openTag}[\\s>]`, 'g')) || []).length;
        depth -= (t.match(new RegExp(`</${openTag}>`, 'g')) || []).length;
        htmlLines.push(l);
        i++;
        if (depth <= 0) break;
      }
      blocks.push(htmlLines.join('\n'));
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push('<hr>');
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(mdInline(lines[i].trim().slice(2)));
        i++;
      }
      blocks.push(`<blockquote><p>${quoteLines.join('<br>')}</p></blockquote>`);
      continue;
    }

    // Unordered list (supports blank lines between items — loose lists)
    if (/^[-*+] /.test(trimmed)) {
      const items = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === '') {
          // Peek: if next non-blank line is another list item, continue
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === '') j++;
          if (j < lines.length && /^[-*+] /.test(lines[j].trim())) { i = j; continue; }
          break;
        }
        if (!/^[-*+] /.test(t)) break;
        items.push(`<li>${mdInline(t.replace(/^[-*+] /, ''))}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list (supports blank lines between items — loose lists)
    if (/^\d+\. /.test(trimmed)) {
      const items = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === '') {
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === '') j++;
          if (j < lines.length && /^\d+\. /.test(lines[j].trim())) { i = j; continue; }
          break;
        }
        if (!/^\d+\. /.test(t)) break;
        items.push(`<li>${mdInline(t.replace(/^\d+\. /, ''))}</li>`);
        i++;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Paragraph — collect until a blank line or block-level marker
    const paraLines = [];
    while (i < lines.length) {
      const l = lines[i];
      const t = l.trim();
      if (t === '') break;
      if (/^#{1,6} /.test(l)) break;
      if (t.startsWith('```')) break;
      if (/^[-*_]{3,}$/.test(t)) break;
      if (t.startsWith('> ')) break;
      if (/^[-*+] /.test(t)) break;
      if (/^\d+\. /.test(t)) break;
      // Table lookahead
      if (t.startsWith('|') && i + 1 < lines.length && /\|[\s\-:]+\|/.test(lines[i + 1].trim())) break;
      paraLines.push(mdInline(l));
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(`<p>${paraLines.join('<br>')}</p>`);
    }
  }

  return blocks.join('\n');
}

function buildMdTable(lines) {
  const parseRow = (line) => line.split('|').slice(1, -1).map(c => c.trim());
  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow);

  const thead = `<thead><tr>${headers.map(h => `<th>${mdInline(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r =>
    `<tr>${r.map(c => `<td>${mdInline(c)}</td>`).join('')}</tr>`
  ).join('\n')}</tbody>`;

  return `<table class="md-table">${thead}${tbody}</table>`;
}

function mdInline(text) {
  // Escape HTML entities first so raw < > & in source text are safe
  text = escText(text);
  // Bold+italic ***text*** (must precede ** and *)
  text = text.replace(/\*\*\*([^*]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold **text**
  text = text.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  // Italic *text* (single star remaining after ** processing)
  text = text.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  // Inline code — re-escape the captured content
  text = text.replace(/`([^`]+?)`/g, (_, c) => `<code>${c}</code>`);
  // Links [text](url)
  text = text.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, '<a href="$2">$1</a>');
  return text;
}

function escText(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── PROPOSAL FIRESTORE SAVE ─────────────────────────────────────────────────
// Writes proposal-content.json to Firestore proposalContent/{clientSlug}
// so the data is available for the architect portal and notifications.

function saveProposalContentToFirestore(contentObj, clientSlug) {
  const https   = require('https');
  const API_KEY = 'AIzaSyDCpzgZAMWWGwedG5At5Ml3gn_yA0dRVZk';
  const body    = JSON.stringify({
    fields: {
      client:      { stringValue: clientSlug },
      contentJson: { stringValue: JSON.stringify(contentObj) },
      generatedAt: { stringValue: new Date().toISOString() }
    }
  });
  const options = {
    hostname: 'firestore.googleapis.com',
    path:     `/v1/projects/dataskateclients/databases/(default)/documents/proposalContent/${clientSlug}?key=${API_KEY}`,
    method:   'PATCH',
    headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
  };
  const req = https.request(options, res => {
    if (res.statusCode === 200) console.log(`✓ Proposal content saved to Firestore: proposalContent/${clientSlug}`);
    else console.warn(`⚠ Firestore save returned HTTP ${res.statusCode} for proposalContent/${clientSlug}`);
  });
  req.on('error', err => console.warn(`⚠ Firestore save failed: ${err.message}`));
  req.write(body);
  req.end();
}

function savePitchKitToFirestore(contentObj, clientSlug) {
  // pitchKits collection requires Admin SDK (allow write: if false in rules).
  // Seeding is handled by update-firebase.js seedPitchKit() which runs as part of the deploy pipeline.
  console.log(`  ℹ pitchKits/${clientSlug} will be seeded by update-firebase.js (Admin SDK required)`);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
