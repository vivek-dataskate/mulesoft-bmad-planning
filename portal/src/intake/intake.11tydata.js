'use strict';
// portal/src/intake/intake.11tydata.js
//
// Eleventy computed data for the intake questionnaire template.
//
// Single content path: intake-content.json → buildFromJson()
// Written by orchestrate.js post-Quinn from quinn.json.intakeContent.

const fs   = require('fs');
const path = require('path');

// portal/src/intake/ → 3 levels up → project root
const ROOT = path.resolve(__dirname, '..', '..', '..');

// ─── SHARED HELPERS ──────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escText(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function mdInline(text) {
  text = escText(text);
  text = text.replace(/\*\*\*([^*]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  text = text.replace(/`([^`]+?)`/g, (_, c) => `<code>${c}</code>`);
  text = text.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, '<a href="$2">$1</a>');
  return text;
}

// ─── INTAKE CATEGORIES ────────────────────────────────────────────────────────

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

function intakeCatFor(rawId) {
  const raw = String(rawId || '').trim().toUpperCase();
  for (const cat of INTAKE_CATEGORIES) {
    if (cat.sections.includes(raw)) return cat.key;
  }
  const n = raw.replace(/[^0-9]/g, '').replace(/^0+/, '') || '0';
  for (const cat of INTAKE_CATEGORIES) {
    if (cat.sections.includes(n)) return cat.key;
  }
  return null;
}

// ─── RAIL NAV ─────────────────────────────────────────────────────────────────

function buildIntakeRailNavGroups(secMeta) {
  const byCat  = new Map(INTAKE_CATEGORIES.map(c => [c.key, []]));
  const orphans = [];
  for (const s of secMeta) {
    const cat = intakeCatFor(s.id);
    if (cat && byCat.has(cat)) byCat.get(cat).push(s);
    else orphans.push(s);
  }
  const groups = [];
  for (const cat of INTAKE_CATEGORIES) {
    const sections = byCat.get(cat.key);
    if (!sections || sections.length === 0) continue;
    groups.push({ label: cat.label, key: cat.key, sections });
  }
  if (orphans.length) groups.push({ label: 'Other', key: null, sections: orphans });
  return groups;
}

// ─── SECTION GROUPING ─────────────────────────────────────────────────────────

function groupIntakeSectionsByCategory(secEntries) {
  const byCat  = new Map(INTAKE_CATEGORIES.map(c => [c.key, []]));
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

// ─── CAT TABS ─────────────────────────────────────────────────────────────────

function buildIntakeCatTabItems(secEntries) {
  const counts = new Map(INTAKE_CATEGORIES.map(c => [c.key, 0]));
  for (const e of secEntries) {
    const cat = intakeCatFor(e.id);
    if (cat && counts.has(cat)) counts.set(cat, counts.get(cat) + 1);
  }
  return INTAKE_CATEGORIES
    .filter(c => counts.get(c.key) > 0)
    .map((c, i) => ({
      key:      c.key,
      num:      c.num,
      label:    c.label,
      blurb:    c.blurb,
      count:    counts.get(c.key),
      isActive: i === 0,
    }));
}

// ─── RAIL LINKS ───────────────────────────────────────────────────────────────
// Intake is client-facing — only external docs the client may legitimately need.
// Architect Guide is internal and must NEVER appear here.

function buildIntakeRailLinks(meta) {
  const client = meta.clientSlug || '';
  const links  = [
    { label: 'DS Pricing Model', url: 'https://dataskateclients.web.app/resources/ds-pricing-model.html' },
  ];
  if (client) {
    links.unshift({ label: 'Your Client Portal', url: `https://dataskateclients.web.app/portal/${client}.html` });
  }
  for (const l of (meta.links || [])) {
    if (l && l.label && l.url) links.push({ label: l.label, url: l.url });
  }
  return links;
}

// ─── RAIL ATTENTION ───────────────────────────────────────────────────────────

function buildIntakeRailAttention(p0Blockers) {
  if (!p0Blockers || !p0Blockers.length) return [];
  return p0Blockers.map(b => {
    let target = 'biz';
    if (b.sysHomeId)   target = `el:sys-home-${b.sysHomeId}`;
    else if (b.sectionRef) target = `sec:${b.sectionRef}`;
    return {
      target,
      title: b.title || b.system || 'P0 Blocker',
      body:  (b.clientAction || b.body || b.blocker || '').replace(/^\s*[—\-:·]+\s*/, ''),
    };
  });
}

// ─── PHASE CHIP ───────────────────────────────────────────────────────────────

function buildIntakePhaseChip(journeyCards) {
  if (!journeyCards || !journeyCards.length) return null;
  const raw      = (journeyCards[0].label || 'Connected').trim();
  const stripped = raw.replace(/^phase\s*\d+\s*[—\-:·]\s*/i, '');
  return { label: stripped };
}

// ─── POTENTIAL FLOWS EXTRACTION ───────────────────────────────────────────────

function extractPotentialFlowsBlock(bodyHtml) {
  if (!bodyHtml || typeof bodyHtml !== 'string') return { kept: bodyHtml, extracted: null };
  const re = /<h3[^>]*>[^<]*(?:Potential|Future)\s+Flows[^<]*<\/h3>\s*(?:<p\b[\s\S]*?<\/p>\s*)*<table[\s\S]*?<\/table>/i;
  const m  = bodyHtml.match(re);
  if (!m) return { kept: bodyHtml, extracted: null };
  const kept      = bodyHtml.slice(0, m.index) + bodyHtml.slice(m.index + m[0].length);
  const extracted = m[0];
  const detailsDepth = s => {
    const r = /<\/?details\b[^>]*>/g;
    let dm, d = 0;
    while ((dm = r.exec(s)) !== null) d += dm[0].startsWith('</') ? -1 : 1;
    return d;
  };
  if (detailsDepth(kept) !== detailsDepth(bodyHtml) || detailsDepth(extracted) !== 0) {
    return { kept: bodyHtml, extracted: null };
  }
  return { kept, extracted };
}

function countPotentialFlowRows(html) {
  if (!html) return 0;
  const tbody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbody) return 0;
  return (tbody[1].match(/<tr\b/gi) || []).length;
}

function liftPotentialFlowsToOwnSection(sections) {
  const cleaned  = [];
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

// ─── SOURCE META ──────────────────────────────────────────────────────────────

function buildIntakeSource(sourceText, sourceUrl) {
  if (!sourceText) return '';
  if (!sourceUrl)  return esc(sourceText);
  return `<a class="source-link" href="${esc(sourceUrl)}" target="_blank" rel="noopener" title="Open source files in storage">${esc(sourceText)} <span class="src-icon">↗</span></a>`;
}

// ─── SYSTEM MAP ───────────────────────────────────────────────────────────────

// Parse section 10's h3 subsections and return one metadata object per system.
// The section 10 bodyHtml has h3 headers like "<h3>10.1 — Salesforce</h3>"
// followed by question blocks. We extract each system's id/label/questionCount.
function extractSystemNodes(sections) {
  const sec10 = sections.find(s => String(s.id) === '10');
  if (!sec10 || !sec10.bodyHtml) return [];

  const html = sec10.bodyHtml;
  const h3Re = /<h3[^>]*>([\s\S]*?)<\/h3>/g;
  const positions = [];
  let m;
  while ((m = h3Re.exec(html)) !== null) {
    const rawText = m[1].replace(/<[^>]+>/g, '').trim();
    const labelMatch = rawText.match(/^[\d.]+\s*[—\-]\s*(.+)$/);
    const label = labelMatch ? labelMatch[1].trim() : rawText;
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    positions.push({ matchIndex: m.index, end: m.index + m[0].length, label, id });
  }

  return positions.map((pos, i) => {
    const bodyStart = pos.end;
    const bodyEnd = i + 1 < positions.length ? positions[i + 1].matchIndex : html.length;
    const bodyHtml = html.slice(bodyStart, bodyEnd);
    const questionCount = (bodyHtml.match(/<textarea/g) || []).length;
    return { id: pos.id, label: pos.label, questionCount };
  });
}

// Wrap each system's question group in section 10 with a portal-home div
// so the JS can move it into the system drawer without losing event listeners.
function wrapSystemHomesInSec10(sections) {
  return sections.map(sec => {
    if (String(sec.id) !== '10' || !sec.bodyHtml) return sec;

    const html = sec.bodyHtml;
    const h3Re = /<h3[^>]*>([\s\S]*?)<\/h3>/g;
    const positions = [];
    let m;
    while ((m = h3Re.exec(html)) !== null) {
      const rawText = m[1].replace(/<[^>]+>/g, '').trim();
      const labelMatch = rawText.match(/^[\d.]+\s*[—\-]\s*(.+)$/);
      const label = labelMatch ? labelMatch[1].trim() : rawText;
      const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      positions.push({ matchIndex: m.index, end: m.index + m[0].length, h3Html: m[0], id });
    }

    if (positions.length === 0) return sec;

    let newHtml = html.slice(0, positions[0].matchIndex); // pre-first-h3 content
    for (let i = 0; i < positions.length; i++) {
      const { h3Html, id, end } = positions[i];
      const bodyEnd = i + 1 < positions.length ? positions[i + 1].matchIndex : html.length;
      const bodyHtml = html.slice(end, bodyEnd);
      newHtml += h3Html;
      newHtml += `<div id="sys-home-${id}" class="sys-home" data-sys="${id}">${bodyHtml}</div>`;
    }

    return { ...sec, bodyHtml: newHtml };
  });
}

// ─── JSON PATH ────────────────────────────────────────────────────────────────

function buildFromJson(c, slug) {
  const m = c.meta;

  let sourceUrl = m.sourceUrl || '';
  if (!sourceUrl && slug) {
    const projPath = path.join(ROOT, 'projects', slug, 'project.json');
    if (fs.existsSync(projPath)) {
      try {
        const proj = JSON.parse(fs.readFileSync(projPath, 'utf8'));
        sourceUrl = proj.sourceFilesFolder || '';
      } catch { /* non-fatal */ }
    }
  }

  const bc = c.bizContext || {};

  const journeyCardsHtml = (bc.journeyCards || []).map((jc, i) =>
    `<div class="journey-card ${jc.phase || `phase-${i + 1}`}">
      <div class="jc-phase">Phase ${i + 1}</div>
      <div class="jc-label">${esc(jc.label)}</div>
      <div class="jc-headline">${esc(jc.headline)}</div>
      <div class="jc-body">${jc.body}</div>
    </div>`
  ).join('\n');

  const p0BlockersHtml = bc.p0Blockers && bc.p0Blockers.length > 0
    ? `<div class="action-required">
        <h4>Action Required Before We Begin</h4>
        <ul>${bc.p0Blockers.map(b =>
          `<li><strong>${esc(b.title)}</strong>${esc(b.clientAction || b.body)}</li>`
        ).join('')}</ul>
      </div>`
    : '';

  const lifted         = liftPotentialFlowsToOwnSection(c.sections || []);
  const systemNodes    = extractSystemNodes(lifted.sections);
  const buildSections  = systemNodes.length > 0
    ? wrapSystemHomesInSec10(lifted.sections)
    : lifted.sections;
  const secMeta        = [];
  const secEntries     = buildSections.map(sec => {
    const rawId     = String(sec.id || '');
    const displayId = rawId.replace(/^S?0*/i, '') || rawId;
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

  const internalFlagsHtml = (c.internalFlags && c.internalFlags.bodyHtml)
    ? `<div class="internal-block no-print">
        <h3>Internal Technical Flags — Do Not Send to Client</h3>
        ${c.internalFlags.bodyHtml}
      </div>`
    : '';

  const pricingSummaryHtml = (c.pricingSummary && c.pricingSummary.bodyHtml)
    ? `<div class="internal-block no-print">
        <h3>Pricing Summary — Internal Only</h3>
        ${c.pricingSummary.bodyHtml}
      </div>`
    : '';

  return {
    clientName:       m.clientName,
    clientSlug:       m.clientSlug || slug,
    eyebrow:          m.eyebrow || `DataSkate × ${esc(m.clientName)}`,
    docTitle:         m.docTitle || m.title || '',
    docSubtitle:      m.docSubtitle || m.subtitle || '',
    date:             m.date,
    architect:        m.architect,
    architectEmail:   m.architectEmail,
    sourceHtml:       buildIntakeSource(m.source || '', sourceUrl),
    bcSnapshot:       bc.snapshot || '',
    phaseChip:        buildIntakePhaseChip(bc.journeyCards),
    journeyCardsHtml,
    p0BlockersHtml,
    catTabs:          buildIntakeCatTabItems(secEntries),
    formSectionsHtml: groupIntakeSectionsByCategory(secEntries),
    railNav:          buildIntakeRailNavGroups(secMeta),
    railAttention:    buildIntakeRailAttention(bc.p0Blockers),
    railLinks:        buildIntakeRailLinks(m),
    internalFlagsHtml,
    pricingSummaryHtml,
    systemNodes,
    systemNodesJson: JSON.stringify(systemNodes),
  };
}

// ─── MAIN ENTRY ───────────────────────────────────────────────────────────────
// JSON-only pipeline. intake-content.json is extracted from quinn.json by orchestrate.js.

function buildIntakeAll(client) {
  if (!client) return null;
  if (client.intakeJson) return buildFromJson(client.intakeJson, client.slug);
  return null;
}

// ─── ELEVENTY COMPUTED ────────────────────────────────────────────────────────

module.exports = {
  eleventyComputed: {
    docTitle: data => {
      if (!data.client) return 'DataSkate';
      const r = buildIntakeAll(data.client);
      if (!r) return 'DataSkate';
      return `DataSkate × ${r.clientName} — Intake Questionnaire`;
    },

    intakeRendered: data => buildIntakeAll(data.client),

    intakeDeployments: data => {
      const deps = (data.client && data.client.meta && data.client.meta.deployments) || [];
      return deps
        .filter(d => d.template === 'intake')
        .map(d => ({ ...d, dateLabel: (d.publishedAt || '').slice(0, 10) }));
    },
  },
};

// MD path retired — intake-content.json (JSON-only) is the sole input.
