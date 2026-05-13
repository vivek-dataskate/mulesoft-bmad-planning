#!/usr/bin/env node
// commons/branding/fill-template.js
// Merges a content JSON file into an HTML shell template.
//
// Usage:
//   node commons/branding/fill-template.js --template proposal  --client acme
//   node commons/branding/fill-template.js --template intake    --client acme
//   node commons/branding/fill-template.js --template portal    --client acme
//   node commons/branding/fill-template.js --template flyer
//   node commons/branding/fill-template.js --template resource  --name architect-guide --src commons/sales/architect-guide.md

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

const KNOWN_TEMPLATES = ['proposal', 'intake', 'portal', 'flyer', 'resource'];

if (!templateType) {
  console.error('Usage: node fill-template.js --template <proposal|intake|portal|flyer|resource> [--client <slug>] [--name <slug> --src <path>]');
  process.exit(1);
}

if (!KNOWN_TEMPLATES.includes(templateType)) {
  const cap = templateType.charAt(0).toUpperCase() + templateType.slice(1);
  console.error(`\n❌ No template registered for type: "${templateType}"`);
  console.error(`   Known types: ${KNOWN_TEMPLATES.join(', ')}`);
  console.error(`\n   To add a new document type:`);
  console.error(`     1. Create commons/branding/templates/${templateType}-template.html`);
  console.error(`     2. Create commons/branding/${templateType}-base.css.html`);
  console.error(`     3. Add "${templateType}" to KNOWN_TEMPLATES in fill-template.js`);
  console.error(`     4. Add a build${cap}() function`);
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
  portal: {
    requiresClient: true,
    contentFile: (c) => path.join(root, 'projects', c, 'portal-content.json'),
    outFile:     (c) => path.join(root, 'firebase', 'public', 'portal', `${c}.html`),
  },
  flyer: {
    requiresClient: false,
    contentFile: () => path.join(root, 'commons', 'sales', 'flyer-content.json'),
    outFile:     () => path.join(root, 'commons', 'sales', 'architect-flyer.html'),
  },
  resource: {
    requiresClient: false,
    requiresName: true,
    // contentFile not used — resource reads its source markdown directly
    contentFile: () => null,
    outFile:     (_, name) => path.join(root, 'firebase', 'public', 'resources', `${name}.html`),
  },
};

const cfg = typeConfig[templateType];
if (cfg.requiresClient && !client) {
  console.error(`❌ --client <slug> is required for --template ${templateType}`);
  process.exit(1);
}
if (cfg.requiresName && !resourceName) {
  console.error(`❌ --name <slug> is required for --template resource`);
  console.error(`   Also provide --src <path/to/file.md> for markdown sources`);
  process.exit(1);
}

const templateFile = path.join(root, 'commons', 'branding', 'templates', `${templateType}-template.html`);
const cssFile      = path.join(root, 'commons', 'branding', `${templateType}-base.css.html`);
const outFile      = cfg.outFile(client, resourceName);

let html      = fs.readFileSync(templateFile, 'utf8');
const css     = fs.readFileSync(cssFile, 'utf8');

// For resource type, content is the raw markdown file (not a JSON)
let content;
if (templateType === 'resource') {
  const srcPath = resourceSrc
    ? path.resolve(process.cwd(), resourceSrc)
    : path.join(root, 'commons', 'sales', `${resourceName}.md`);
  content = fs.readFileSync(srcPath, 'utf8');
} else {
  const contentFilePath = cfg.contentFile(client);
  content = JSON.parse(fs.readFileSync(contentFilePath, 'utf8'));
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
  buildIntake(content);
} else if (templateType === 'portal') {
  buildPortal(content);
} else if (templateType === 'flyer') {
  buildFlyer(content);
} else {
  buildResource(content);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html, 'utf8');
console.log(`✓ Written: ${outFile}`);

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
  <div class="model-card recommended">
    <div class="rec-badge">Recommended</div>
    <div class="model-name">Model 1 — IaaS (Managed Service)</div>
    <div class="model-impl">$0</div>
    <div class="model-impl-label">Implementation — included in managed service</div>
    <div class="model-service">$${esc(p.period1.rate)}/flow/month</div>
    <div class="model-service-label">Period 1 rate (Month 1–6) · ${n} flow${n !== 1 ? 's' : ''}</div>
    <hr class="model-divider">
    <div class="best-for">Best for</div>
    <div class="model-vp">Predictable monthly spend. DataSkate owns design, build, and ongoing support. No upfront capital.</div>
  </div>
  <div class="model-card">
    <div class="model-name">Model 2 — Implementation Only</div>
    <div class="model-impl">$${Number(p.implOnly).toLocaleString('en-US')}</div>
    <div class="model-impl-label">One-time fee · ${esc(String(p.timelineWeeks))}-week delivery</div>
    <hr class="model-divider">
    <div class="best-for">Best for</div>
    <div class="model-vp">Client owns post-go-live support. Optional managed service available at renewal.</div>
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
</p>`;
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
    ? `<div class="bc-blockers no-print">
        <h4>Internal — Technical Blockers (P0) — Not Shown in PDF</h4>
        <ul>${bc.p0Blockers.map(b => `<li>${esc(b.title)}: ${b.body}</li>`).join('')}</ul>
      </div>`
    : '');

  fill('form-sections', (c.sections || []).map(sec =>
    `<div class="section-block">
  <div class="section-head">
    <div class="section-num">${esc(sec.id || '')}</div>
    <div class="section-title">${esc(sec.title)}</div>
  </div>
  <div class="section-body">
    ${sec.bodyHtml || ''}
  </div>
</div>`
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

  // Sprint section — empty state or epic/story blocks
  if (!c.sprints || c.sprints.length === 0) {
    fill('sprint-section', `<div class="sprint-empty">
      <div class="sprint-empty-icon">📋</div>
      <div class="sprint-empty-title">Sprint planning not yet started</div>
      <div class="sprint-empty-body">Stories and epics will appear here once your project moves into the Build phase.</div>
    </div>`);
  } else {
    fill('sprint-section', c.sprints.map(epic =>
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
              <span class="chip chip-${esc(s.status || 'planned')}">${esc(s.status || 'Planned')}</span>
              ${s.desc ? `<span class="story-desc">${esc(s.desc)}</span>` : ''}
            </div>`
          ).join('\n')}
        </div>
      </details>`
    ).join('\n'));
  }
}

// ─── FLYER ───────────────────────────────────────────────────────────────────

function buildFlyer(c) {
  fill('header-tagline',   c.headerTagline   || 'MuleSoft Integration Services — Pricing Overview');
  fill('iaas-rate',        c.iaasRate        || '$250.00');
  fill('iaas-period2',     c.iaasPeriod2     || '$262.50/flow/mo');
  fill('retainer-range',   c.retainerRange   || '$2,500–$5,000');
  fill('impl-rate',        c.implRate        || '$3,500');
  fill('phase2-body',      c.phase2Body      || 'Once systems are connected, DataSkate returns for a Phase 2 SOW: AI agents that use those integrations to automate workflows, surface decisions, and reduce manual operations.');
  fill('footer-address',   c.footerAddress   || '196 Princeton Hightstown Road, Building 2A Suite 11, West Windsor NJ 08550');
  fill('footer-contact',   c.footerContact   || 'dataskate.ai | kailash@dataskate.ai');

  fill('change-order-rows', (c.changeOrderRows || [
    ['Config',       'Field mapping, credentials, tuning',          '<strong>Free</strong>'],
    ['Modification', 'New logic, branch, transform',                '<strong>$750</strong>'],
    ['Extension',    'New object type, new secondary system',       '<strong>$1,500</strong>'],
  ]).map(([tier, what, fee]) =>
    `<tr><td>${tier}</td><td>${what}</td><td>${fee}</td></tr>`
  ).join('\n'));

  fill('decommission-rows', (c.decommissionRows || [
    ['Flow replaced by new flow',         '<strong>$1,500 fee</strong> + fresh 12-mo contract'],
    ['Decommission, no replacement',      'Remaining balance <strong>accelerates</strong> — payable immediately'],
    ['Scope change within same flow',     'Change order applies (see left)'],
  ]).map(([scenario, outcome]) =>
    `<tr><td>${scenario}</td><td>${outcome}</td></tr>`
  ).join('\n'));
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

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
