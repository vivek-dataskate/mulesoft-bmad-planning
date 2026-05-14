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
const fs   = require('fs');
const path = require('path');

const args         = process.argv.slice(2);
const templateType = args[args.indexOf('--template') + 1];
const clientIdx    = args.indexOf('--client');
const client       = clientIdx !== -1 ? args[clientIdx + 1] : null;
const nameIdx      = args.indexOf('--name');
const resourceName = nameIdx !== -1 ? args[nameIdx + 1] : null;
const srcIdx       = args.indexOf('--src');
const resourceSrc  = srcIdx !== -1 ? args[srcIdx + 1] : null;

const KNOWN_TEMPLATES = ['proposal', 'intake', 'integration-deck', 'client-portal', 'ds-pricing-model', 'architect-guide'];

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
const root = path.resolve(__dirname, '../..');

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
};

const cfg = typeConfig[templateType];
if (cfg.requiresClient && !client) {
  console.error(`❌ --client <slug> is required for --template ${templateType}`);
  process.exit(1);
}
const templateFile = path.join(root, 'commons', 'templates', `${templateType}-template.html`);
const cssFile      = path.join(root, 'commons', 'templates', 'shared-base.css.html');
const outFile      = cfg.outFile(client);

let html      = fs.readFileSync(templateFile, 'utf8');
const css     = fs.readFileSync(cssFile, 'utf8');

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
  buildIntegrationDeck(content);
} else if (templateType === 'architect-guide') {
  buildResource(content);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html, 'utf8');
console.log(`✓ Written: ${outFile}`);

if (templateType === 'proposal' && client) {
  saveProposalContentToFirestore(content, client);
}

// ─── PROPOSAL ────────────────────────────────────────────────────────────────

function buildProposal(c) {
  const m = c.meta;

  fill('client-name',       m.clientName);
  fill('proposal-title',    m.title  || `MuleSoft Integration for ${esc(m.clientName)}`);
  fill('proposal-subtitle', m.subtitle || '');
  fill('architect',         m.architect);
  fill('architect-email',   m.architectEmail);
  fill('date',              m.date);
  fill('scope',             `${m.flowCount} integration flow${m.flowCount !== 1 ? 's' : ''}`);

  fill('client-slug',        m.clientSlug || client || '');

  fill('challenge-headline', c.challenge.headline);
  fill('challenge-lead',     c.challenge.lead);
  fill('challenge-cards', c.challenge.cards.map(card =>
    `<div class="challenge-card">
      <div class="label">${esc(card.label)}</div>
      <p>${card.body}</p>
    </div>`
  ).join('\n'));

  fill('solution-lead',    c.solution.lead);
  fill('solution-diagram', buildDiagramSvg(c.solution.diagramNodes));
  fill('diagram-caption',  c.solution.diagramCaption || '');

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
  fill('journey-closing', c.journey.closingLine || '');

  fill('flows-headline', `${m.flowCount} Proposed Integration Flow${m.flowCount !== 1 ? 's' : ''}`);
  fill('flow-cards', c.flows.map(f =>
    `<div class="flow-card">
      <div class="flow-num">Flow ${esc(String(f.num))}</div>
      <span class="complexity-badge ${esc(f.complexity)}">${esc(f.complexity)}</span>
      <div class="flow-name">${esc(f.name)}</div>
      <div class="flow-route">${esc(f.route)}</div>
      <div class="flow-value">${f.value}</div>
    </div>`
  ).join('\n'));

  fill('outcome-cards', c.outcomes.map(o =>
    `<div class="outcome-card">
      <div class="outcome-icon">${o.icon}</div>
      <h4>${esc(o.title)}</h4>
      <p>${o.body}</p>
    </div>`
  ).join('\n'));

  fill('roi-section', c.roi
    ? `<section><h2>ROI / Business Case</h2><h3>${esc(c.roi.headline)}</h3>${c.roi.body}</section>`
    : '');

  const { timelineWeeks } = c.pricing;
  fill('timeline-headline', `${timelineWeeks}-week delivery from signed SOW`);
  fill('timeline-items', c.timeline.map((t, i) => {
    const cls = i === 0 ? '' : i === c.timeline.length - 1 ? 'phase3' : 'phase2';
    return `<div class="tl-item">
      <div class="tl-dot${cls ? ' ' + cls : ''}">${esc(t.phase)}</div>
      <div class="tl-content">
        <div class="tl-weeks">${esc(t.weeks)}</div>
        <h4>${esc(t.title)}</h4>
        <p>${t.body}</p>
      </div>
    </div>`;
  }).join('\n'));

  fill('investment-section', buildInvestmentSection(c.pricing, m.flowCount));

  fill('included-items', c.included.map(i =>
    `<div class="included-item">
      <span class="check">✓</span>
      <div class="text"><strong>${esc(i.title)}</strong><span>${esc(i.detail)}</span></div>
    </div>`
  ).join('\n'));

  fill('about-section', c.about
    ? `<section><h2>About DataSkate</h2>${c.about}</section>`
    : '');

  fill('oos-items', c.oos.map(o =>
    `<div class="oos-item">
      <span class="x-mark">✕</span>
      <div class="text"><strong>${esc(o.title)}</strong><span>${esc(o.detail)}</span></div>
    </div>`
  ).join('\n'));

  const ownerLabel = { ds: 'DataSkate', client: 'Client', both: 'Shared', vendor: 'Vendor' };
  fill('assumption-rows', c.assumptions.map(a =>
    `<tr>
      <td>${a.p0 ? '<span class="p0-flag">P0</span>' : ''}${a.assumption}</td>
      <td><span class="owner-badge owner-${esc(a.owner)}">${esc(ownerLabel[a.owner] || a.owner)}</span></td>
      <td>${esc(a.when)}</td>
    </tr>`
  ).join('\n'));

  fill('next-steps', c.nextSteps.map((n, i) =>
    `<div class="ns-item">
      <div class="ns-num">${i + 1}</div>
      <h4>${esc(n.title)}</h4>
      <p>${n.body}</p>
    </div>`
  ).join('\n'));
}

function buildInvestmentSection(p, flowCount) {
  const n      = flowCount;
  const period = (rate, months) => (parseFloat(rate) * n * months).toLocaleString('en-US');
  const total  = ['period1', 'period2', 'period3', 'period4'].reduce(
    (sum, key) => sum + parseFloat(p[key].rate) * n * 6, 0
  );

  return `<div class="model-grid">
  <div class="model-card recommended" data-model="iaas">
    <div class="rec-badge">Recommended</div>
    <div class="model-name">Model 1 — IaaS (Managed Service)</div>
    <div class="model-impl">$0</div>
    <div class="model-impl-label">Implementation — included in managed service</div>
    <div class="model-service">$${esc(p.period1.rate)}/flow/month</div>
    <div class="model-service-label">Period 1 rate (Month 1–6) · ${n} flow${n !== 1 ? 's' : ''}</div>
    <hr class="model-divider">
    <div class="best-for">Best for</div>
    <div class="model-vp">Predictable monthly spend. DataSkate owns design, build, and ongoing support. No upfront capital.</div>
    <p class="model-instruction no-print"><em>Select this model to proceed with a managed service. You can propose a different entry rate before sending.</em></p>
    <button class="btn btn-primary model-select-btn no-print" onclick="selectModel('iaas','Model 1 — IaaS (Managed Service)','$${esc(p.period1.rate)}/flow/month (Period 1)')">Select this Model →</button>
  </div>
  <div class="model-card" data-model="impl">
    <div class="model-name">Model 2 — Implementation Only</div>
    <div class="model-impl">$${Number(p.implOnly).toLocaleString('en-US')}</div>
    <div class="model-impl-label">One-time fee · ${esc(String(p.timelineWeeks))}-week delivery</div>
    <hr class="model-divider">
    <div class="best-for">Best for</div>
    <div class="model-vp">Client owns post-go-live support. Optional managed service available at renewal.</div>
    <p class="model-instruction no-print"><em>Select this model if you prefer a one-time build. You can propose a different project fee before sending.</em></p>
    <button class="btn btn-outline model-select-btn no-print" onclick="selectModel('impl','Model 2 — Implementation Only','$${Number(p.implOnly).toLocaleString('en-US')} one-time fee')">Select this Model →</button>
  </div>
</div>
<div class="managed-intro">
  <h3>Managed Service Rate Schedule</h3>
  <p>IaaS pricing adjusts each period as flows stabilize and value is realized.</p>
</div>
<table class="managed-table">
  <thead>
    <tr>
      <th>Period</th><th>Duration</th>
      <th>Rate / flow / month</th><th>Period total (${n} flows)</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Period 1</td><td>Month 1–6</td><td>$${esc(p.period1.rate)}</td><td>$${period(p.period1.rate, 6)}</td></tr>
    <tr><td>Period 2</td><td>Month 7–12</td><td>$${esc(p.period2.rate)}</td><td>$${period(p.period2.rate, 6)}</td></tr>
    <tr><td>Period 3</td><td>Year 2, H1</td><td>$${esc(p.period3.rate)}</td><td>$${period(p.period3.rate, 6)}</td></tr>
    <tr><td>Period 4</td><td>Year 2, H2</td><td>$${esc(p.period4.rate)}</td><td>$${period(p.period4.rate, 6)}</td></tr>
    <tr>
      <td colspan="3"><strong>2-year managed service total</strong></td>
      <td><strong>$${total.toLocaleString('en-US')}</strong></td>
    </tr>
  </tbody>
</table>
<p style="font-size:12px;color:var(--mid);margin-top:12px;">
  MuleSoft Anypoint Platform license sold separately by your MuleSoft AE.
  DataSkate manages the integration layer; platform licensing is a direct relationship
  between your organization and MuleSoft/Salesforce.
</p>
<div class="negotiate-panel no-print" id="negotiate-panel" style="display:none">
  <div class="negotiate-header">
    <div class="negotiate-label">Your Selection</div>
    <h3 id="selected-model-name">—</h3>
    <p>Listed rate: <strong id="selected-rate">—</strong>. Leave the rate field blank to accept as listed, or enter a proposed rate below.</p>
  </div>
  <div class="negotiate-grid">
    <div>
      <label class="negotiate-field-label">Proposed rate <span class="negotiate-optional">(optional)</span></label>
      <input class="cta-input" type="text" id="negotiate-rate" placeholder="e.g. $700/flow/month" />
    </div>
    <div>
      <label class="negotiate-field-label">Notes or questions <span class="negotiate-optional">(optional)</span></label>
      <textarea class="cta-input" id="negotiate-notes" placeholder="What's driving this for you?"></textarea>
    </div>
  </div>
  <button class="btn btn-primary btn-submit" onclick="submitSelection()">Send Selection to DataSkate →</button>
  <div class="accept-success" id="selection-success">
    ✓ Selection sent — your email app should open. We'll follow up within one business day.
  </div>
</div>`;
}

function buildDiagramSvg(nodes) {
  const sources = nodes.sources || [];
  const targets = nodes.targets || [];
  const rows    = Math.max(sources.length, targets.length, 1);
  const h       = Math.max(130, rows * 50 + 40);
  const srcStep = h / (sources.length + 1);
  const tgtStep = h / (targets.length + 1);
  const hubY    = h / 2;

  const srcRects = sources.map((name, i) => {
    const cy = Math.round(srcStep * (i + 1));
    return `<rect class="sv-src" x="5" y="${cy - 15}" width="140" height="30" rx="6"/>
    <text class="sv-lsrc" x="75" y="${cy + 5}" text-anchor="middle">${esc(name)}</text>
    <line class="sv-line" x1="145" y1="${cy}" x2="190" y2="${hubY}"/>`;
  });

  const tgtRects = targets.map((name, i) => {
    const cy = Math.round(tgtStep * (i + 1));
    return `<rect class="sv-tgt" x="355" y="${cy - 15}" width="138" height="30" rx="6"/>
    <text class="sv-ltgt" x="424" y="${cy + 5}" text-anchor="middle">${esc(name)}</text>
    <line class="sv-line" x1="310" y1="${hubY}" x2="355" y2="${cy}"/>`;
  });

  return `<svg viewBox="0 0 500 ${h}" style="width:100%;max-width:500px;height:auto;display:block;margin:0 auto;" xmlns="http://www.w3.org/2000/svg">
  <defs><style>
    .sv-src{fill:#fff;stroke:#C9302C;stroke-width:1.5}
    .sv-hub{fill:#E31F26;stroke:#8B1515;stroke-width:1.5}
    .sv-tgt{fill:#fff;stroke:#2E9E6B;stroke-width:1.5}
    .sv-line{stroke:#C8CACC;stroke-width:1.5;fill:none}
    .sv-lsrc{font:600 11px system-ui,sans-serif;fill:#C9302C}
    .sv-lhub{font:700 13px system-ui,sans-serif;fill:#fff}
    .sv-lsub{font:400 9px system-ui,sans-serif;fill:rgba(255,255,255,.85)}
    .sv-ltgt{font:600 11px system-ui,sans-serif;fill:#2E9E6B}
  </style></defs>
  ${srcRects.join('\n  ')}
  <rect class="sv-hub" x="190" y="${hubY - 25}" width="120" height="50" rx="8"/>
  <text class="sv-lhub" x="250" y="${hubY - 5}" text-anchor="middle">MuleSoft</text>
  <text class="sv-lsub" x="250" y="${hubY + 11}" text-anchor="middle">DataSkate Managed</text>
  ${tgtRects.join('\n  ')}
</svg>`;
}

// ─── INTAKE ──────────────────────────────────────────────────────────────────

function buildIntake(c) {
  const m = c.meta;

  fill('client-name',     m.clientName);
  fill('client-slug',     m.clientSlug || client);
  fill('eyebrow',         m.eyebrow || `DataSkate × ${esc(m.clientName)}`);
  fill('doc-title',       m.docTitle || m.title || '');
  fill('doc-subtitle',    m.docSubtitle || m.subtitle || '');
  fill('date',            m.date);
  fill('architect',       m.architect);
  fill('architect-email', m.architectEmail);
  fill('source',          m.source || '');

  const bc = c.bizContext;
  fill('bc-snapshot', bc.snapshot);
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

  fill('form-sections', (c.sections || []).map(sec =>
    `<details class="section-block">
  <summary class="section-head">
    <div class="section-num">${esc(sec.id || '')}</div>
    <div class="section-title">${esc(sec.title)}</div>
    <span class="section-chevron">▼</span>
  </summary>
  <div class="section-body">
    ${sec.bodyHtml || ''}
  </div>
</details>`
  ).join('\n\n'));

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
  fill('source',          meta.source);

  // Biz context — populate from company_context.json if available
  fill('bc-snapshot', ctx.snapshot ? esc(ctx.snapshot) : '');
  fill('journey-cards', ctx.aiJourney
    ? Object.entries(ctx.aiJourney).map(([, s], i) =>
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

  fill('form-sections', clientSecs.map(sec =>
    `<details class="section-block">
  <summary class="section-head">
    <div class="section-num">${esc(sec.id)}</div>
    <div class="section-title">${esc(sec.title)}</div>
    <span class="section-chevron">▼</span>
  </summary>
  <div class="section-body">${renderMdIntakeSection(sec.body, prefillCtx)}</div>
</details>`
  ).join('\n\n'));

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
  const h1 = lines.find(l => l.startsWith('# ')) || '';
  const clientName = h1.replace(/^# Intake Questionnaire[^—–-]*[—–-]\s*/, '').trim() || proj.displayName || 'Client';
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
    const title = header.replace(/^## /, '').replace(/\[INTERNAL\]\s*/i, '').replace(/Section\s+\d+:\s*/i, '').trim();
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
  fill('project-started',  m.projectStarted || '');
  fill('target-go-live',   m.targetGoLive   || 'TBD');
  fill('updated',          m.updated        || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));

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

  // Doc cards — array of { icon, title, sub, status: 'available'|'pending'|'na', href? }
  fill('doc-cards', (c.docCards || []).map(d => {
    const cls = `doc-card doc-${esc(d.status || 'na')}`;
    const inner = `<div class="doc-icon">${d.icon || '📄'}</div>
      <div class="doc-info"><div class="doc-title">${esc(d.title)}</div><div class="doc-sub">${esc(d.sub || '')}</div></div>
      ${d.status === 'available' ? '<div class="doc-arrow">→</div>' : ''}`;
    return d.href
      ? `<a class="${cls}" href="${esc(d.href)}" target="_blank">${inner}</a>`
      : `<div class="${cls}">${inner}</div>`;
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
  fill('phase2-body',    'Once systems are connected, DataSkate returns for a Phase 2 SOW: AI agents that use those integrations to automate workflows, surface decisions, and reduce manual operations. Available under both models.');
  fill('footer-address', '196 Princeton Hightstown Road, Building 2A Suite 11, West Windsor NJ 08550');
  fill('footer-contact', 'dataskate.ai | kailash@dataskate.ai');

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

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
