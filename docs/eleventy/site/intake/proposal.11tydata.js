'use strict';
const fs   = require('fs');
const path = require('path');

// docs/eleventy/site/intake/ → 4 levels up → project root
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const PROFILE_RECOMMENDED_MODEL = {
  'roi-analytical':       'iaas',
  'risk-averse':          'iaas',
  'relationship-builder': 'iaas',
  'technical-champion':   'tm',
  'budget-conscious':     'impl',
};

function escSvg(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    return `<rect class="sv-src" x="5" y="${cy - BOX_H / 2}" width="140" height="${BOX_H}" rx="6"/>
    <text class="sv-lsrc" x="75" y="${cy + 5}" text-anchor="middle">${escSvg(name)}</text>
    <line class="sv-line" x1="145" y1="${cy}" x2="${hubX}" y2="${hubY}" marker-end="url(#arr)"/>`;
  });

  const tgtRects = targets.map((name, i) => {
    const cy = Math.round(tgtStep * (i + 1));
    return `<rect class="sv-tgt" x="355" y="${cy - BOX_H / 2}" width="140" height="${BOX_H}" rx="6"/>
    <text class="sv-ltgt" x="425" y="${cy + 5}" text-anchor="middle">${escSvg(name)}</text>
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
  <rect class="sv-hub" x="${hubX}" y="${hubY - hubH / 2}" width="${hubW}" height="${hubH}" rx="8"/>
  <text class="sv-lhub" x="${hubX + hubW / 2}" y="${hubY - 4}" text-anchor="middle">MuleSoft</text>
  <text class="sv-lsub" x="${hubX + hubW / 2}" y="${hubY + 12}" text-anchor="middle">DataSkate Managed</text>
  ${tgtRects.join('\n  ')}
</svg>`;
}

function computeProposalPricing(proposal, pricing) {
  const n               = proposal.meta.flowCount;
  const primaryProfile  = (proposal.buyerProfile && proposal.buyerProfile.primary) || '';
  const recModel        = PROFILE_RECOMMENDED_MODEL[primaryProfile] || 'iaas';

  const fmt  = v => '$' + Math.round(v).toLocaleString('en-US');
  const fmtD = v => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const p1total   = pricing.baseRate * n * 6;
  const p2total   = pricing.p2rate   * n * 6;
  const yearTotal = p1total + p2total;
  const implTotal = pricing.implPerFlow * n;
  const retainer  = n <= 5 ? pricing.retainer1 : pricing.retainer2;
  const weeks     = Math.ceil(2 + 1.5 * n);
  const diff      = yearTotal - implTotal;

  let tm = null;
  if (pricing.tm) {
    const tmPerFlow = pricing.tm.resources.reduce((s, r) => s + r.ratePerHour * r.typicalHoursPerFlow, 0);
    const tmTotal   = tmPerFlow * n;
    tm = {
      perFlow:     tmPerFlow,
      perFlowFmt:  fmt(tmPerFlow),
      total:       tmTotal,
      totalFmt:    fmt(tmTotal),
      invoiceCycle:   pricing.tm.invoiceCycle,
      minimumHours:   pricing.tm.minimumHours,
      resources: pricing.tm.resources.map(r => ({
        role:           r.role,
        ratePerHour:    r.ratePerHour,
        ratePerHourFmt: fmtD(r.ratePerHour),
        hoursPerFlow:   r.typicalHoursPerFlow,
        totalHours:     r.typicalHoursPerFlow * n,
        rowTotal:       r.ratePerHour * r.typicalHoursPerFlow * n,
        rowTotalFmt:    fmt(r.ratePerHour * r.typicalHoursPerFlow * n),
      })),
    };
  }

  return {
    recModel,
    n,
    yearFmt:        fmt(yearTotal),
    p1Fmt:          fmt(p1total),
    p2Fmt:          fmt(p2total),
    baseFmtD:       fmtD(pricing.baseRate),
    p2FmtD:         fmtD(pricing.p2rate),
    retainerFmt:    fmt(retainer),
    implTotalFmt:   fmt(implTotal),
    implPerFlowFmt: fmt(pricing.implPerFlow),
    weeks,
    diffFmt:        fmt(diff),
    tm,
  };
}

function computeProposalAbout() {
  const mdPath = path.join(ROOT, 'commons', 'sales', 'about-dataskate.md');
  if (!fs.existsSync(mdPath)) return '';
  const raw = fs.readFileSync(mdPath, 'utf8').trim();
  if (raw.startsWith('<')) return raw;
  return raw.split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p>${p}</p>`).join('\n');
}

function computeProposalCS(proposal) {
  const csPath = path.join(ROOT, 'commons', 'social-proof', 'client-case-studies.json');
  if (!fs.existsSync(csPath)) return [];
  const allCS = JSON.parse(fs.readFileSync(csPath, 'utf8')).caseStudies || [];

  const sol = proposal.solution || {};
  const clientSystems = [];
  if (sol.diagramNodes) {
    [...(sol.diagramNodes.sources || []), ...(sol.diagramNodes.targets || [])]
      .forEach(s => clientSystems.push(s.toLowerCase()));
  }
  (proposal.flows || []).forEach(f => {
    f.route.split(/[→\-\s]+/).map(s => s.trim().toLowerCase())
      .filter(s => s && s !== 'mulesoft').forEach(s => clientSystems.push(s));
  });

  const flowSignals = (proposal.flows || [])
    .map(f => f.name.toLowerCase() + ' ' + f.route.toLowerCase()).join(' ');

  const scored = allCS.map(cs => {
    let score = 0;
    (cs.systems || []).forEach(sys => {
      const sl = sys.toLowerCase();
      if (clientSystems.some(s => s.includes(sl) || sl.includes(s))) score += 3;
    });
    (cs.relevanceTags || []).forEach(tag => {
      if (flowSignals.includes(tag.toLowerCase())) score += 1;
    });
    return { cs, score };
  }).sort((a, b) => b.score - a.score);

  const relevant = scored.filter(x => x.score > 0).slice(0, 2);
  return relevant.length > 0 ? relevant.map(x => x.cs) : scored.slice(0, 2).map(x => x.cs);
}

function computeProposalDiagram(proposal, slug) {
  if (slug) {
    const svgPath = path.join(ROOT, 'projects', slug, 'intake', 'system-diagram.svg');
    if (fs.existsSync(svgPath)) return fs.readFileSync(svgPath, 'utf8');
  }
  const diagramNodes = (proposal.solution || {}).diagramNodes;
  if (!diagramNodes) return '';
  const svg = buildDiagramSvg(diagramNodes);
  if (slug) {
    const svgPath = path.join(ROOT, 'projects', slug, 'intake', 'system-diagram.svg');
    try { fs.writeFileSync(svgPath, svg); } catch (_) { /* non-fatal */ }
  }
  return svg;
}

module.exports = {
  eleventyComputed: {
    proposal: data => data.client && data.client.proposal,

    docTitle: data => {
      const p = data.client && data.client.proposal;
      if (!p) return 'DataSkate';
      return 'DataSkate × ' + (p.meta.clientName || (data.client && data.client.slug) || 'Client') + ' — Integration Roadmap';
    },

    proposalPricing: data => {
      const p = data.client && data.client.proposal;
      if (!p || !p.pricing) return null;
      return computeProposalPricing(p, data.pricing);
    },

    proposalAbout: () => computeProposalAbout(),

    proposalCS: data => {
      const p = data.client && data.client.proposal;
      if (!p) return [];
      return computeProposalCS(p);
    },

    proposalDiagram: data => {
      const p   = data.client && data.client.proposal;
      const slug = data.client && data.client.slug;
      if (!p) return '';
      return computeProposalDiagram(p, slug);
    },

    proposalDeployments: data => {
      const deps = (data.client && data.client.meta && data.client.meta.deployments) || [];
      return deps
        .filter(d => d.template === 'proposal')
        .map(d => ({ ...d, dateLabel: (d.publishedAt || '').slice(0, 10) }));
    },
  },
};
