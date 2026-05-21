'use strict';
// docs/eleventy/site/intake/intake.11tydata.js
//
// Eleventy computed data for the intake questionnaire template.
//
// Two content paths:
//   1. intake-content.json              → buildFromJson()  (JSON path)
//   2. intake-questionnaire-{slug}.md   → buildFromMd()   (Markdown path)
// JSON takes priority when both exist.

const fs   = require('fs');
const path = require('path');

// docs/eleventy/site/intake/ → 4 levels up → project root
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

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
  return p0Blockers.map(b => ({
    target: b.sectionRef ? `sec:${b.sectionRef}` : 'biz',
    title:  b.title || b.system || 'P0 Blocker',
    body:   (b.clientAction || b.body || b.blocker || '').replace(/^\s*[—\-:·]+\s*/, ''),
  }));
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
  const secMeta        = [];
  const secEntries     = lifted.sections.map(sec => {
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
  };
}

// ─── MARKDOWN PATH ────────────────────────────────────────────────────────────

function buildPrefillContext(proj, ctx) {
  const patterns = [];
  const contacts = ctx.namedContacts || [];
  const primary  = proj.primaryContact || {};

  if (proj.targetGoLive && proj.targetGoLive !== 'TBD') {
    patterns.push({ regex: /go[\s-]?live|target.*date|launch date|planned.*date/i, value: proj.targetGoLive });
  }
  if (primary.name) {
    patterns.push({
      regex: /primary.*contact|testing.*contact|uat.*contact|sign[- ]?off.*approver|who.*will.*test|main.*point.*contact/i,
      value: `${primary.name} (primary contact — confirm role)`
    });
  }
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
  const h1    = (lines.find(l => l.startsWith('# ')) || '').replace(/^# /, '');
  const clientName = proj.displayName
    || h1.replace(/\b(Integration|Intake|Questionnaire|Discovery)\b/gi, '').replace(/\s+/g, ' ').trim()
    || 'Client';
  const prepLine = lines.find(l => l.startsWith('**Prepared by:**')) || '';
  let architect      = proj.architect      || 'Kailash Chanda';
  let architectEmail = proj.architectEmail || 'kailash@dataskate.ai';
  const pm = prepLine.match(/DataSkate\s*[·•]\s*(.+?)\s*\(([^)]+)\)/);
  if (pm) { architect = pm[1].trim(); architectEmail = pm[2].trim(); }
  const dateLine = lines.find(l => l.startsWith('**Date:**')) || '';
  const date     = dateLine.replace('**Date:**', '').trim();
  const srcLine  = lines.find(l => /^\*\*Source/.test(l)) || '';
  const source   = srcLine.replace(/^\*\*Source[^:]*:\*\*\s*/, '').trim();
  return { clientName, architect, architectEmail, date, source };
}

function splitMdIntakeSections(md) {
  const chunks = md.split(/^(?=## )/m).filter(s => s.trim().startsWith('## '));
  return chunks.map(raw => {
    const header     = raw.split('\n')[0].trim();
    const body       = raw.split('\n').slice(1).join('\n').trim();
    const isInternal = /\[INTERNAL\]/i.test(header);
    const numMatch   = header.match(/Section\s+(\d+)/i);
    const id         = numMatch ? `S${numMatch[1].padStart(2, '0')}` : '';
    const title      = header.replace(/^## /, '').replace(/\[INTERNAL\]\s*/i, '').replace(/Section\s+\d+[:\s—–-]+/i, '').trim();
    return { id, title, isInternal, body };
  });
}

// ─── MD SECTION RENDERING (auto-fill, Q blocks, UC blocks, tables, scope) ────

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
  let qText    = qTextRaw.trim();
  const hints  = [];
  let answerValue = null;
  let pills       = [];
  let isRequired  = false;

  for (const rline of restLines) {
    const rt = rline.trim();
    if (!rt) continue;
    if (/^-\s*\*.*\*\s*$/.test(rt) || /^-\s*\*From sessions/.test(rt)) {
      hints.push(rt.replace(/^-\s*\*/, '').replace(/\*\s*$/, '').trim()); continue;
    }
    if (/^-\s*(Context|Note|Risk flag):/.test(rt)) {
      hints.push(rt.replace(/^-\s*(?:Context|Note|Risk flag):\s*/, '').trim()); continue;
    }
    if (rt.startsWith('Answer:')) {
      const ans = rt.replace('Answer:', '').trim();
      if (!ans)                                    { answerValue = ''; isRequired = true; }
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
    if (/^[abc]\)/.test(rt)) { qText += ' ' + rt; }
  }

  if (/\[P0/.test(qTextRaw)) isRequired = true;

  if (!answerValue && prefillCtx && prefillCtx.length) {
    const qLower = qText.toLowerCase();
    for (const { regex, value } of prefillCtx) {
      if (regex.test(qLower)) { answerValue = value; break; }
    }
  }

  const cleanQ   = qText.replace(/\[P0[^\]]*\]\s*/g, '').trim();
  const p0Badge  = /\[P0/.test(qTextRaw)
    ? ' <span style="font-size:10px;font-weight:700;color:#991B1B;background:#FEE2E2;padding:1px 5px;border-radius:3px;">P0</span>' : '';
  const hintHtml = hints.length
    ? `<div class="q-hint">${hints.map(h => esc(h)).join('<br>')}</div>` : '';
  const pillHtml = pills.length
    ? `<div class="q-options">${pills.map(p =>
        `<span class="pill" role="button" tabindex="0" onclick="pickPill(this,'${safeId}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();pickPill(this,'${safeId}')}">${esc(p)}</span>`
      ).join('')}</div>` : '';

  const isPrefilled = !!answerValue;
  const cls         = `answer${isPrefilled ? ' is-prefilled' : ''}`;
  const req         = isRequired ? ' data-required="true"' : '';
  const reqStar     = isRequired ? ' <span class="req">*</span>' : '';
  const textarea    = `<textarea class="${cls}" id="${safeId}"${req}>${isPrefilled ? esc(answerValue) : ''}</textarea>`;

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
  const thead    = `<thead><tr>${headers.map(h => `<th>${mdInline(h)}</th>`).join('')}</tr></thead>`;
  const tbody    = `<tbody>${lines.slice(2).map(row => {
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

function renderMdIntakeSection(body, prefillCtx) {
  const lines = body.split('\n');
  const out   = [];
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t || t === '---' || t.startsWith('→ See Section') || t.startsWith('*End of intake')) { i++; continue; }
    if (/^\*\*How to use/.test(t)) { while (i < lines.length && lines[i].trim() !== '---') i++; i++; continue; }

    const ucM = t.match(/^### (UC[-\s]?\d+)\s*[—–-]+\s*(.+)/i);
    if (ucM) {
      const ucLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().match(/^###/) && !lines[i].trim().match(/^## /)) {
        ucLines.push(lines[i]); i++;
      }
      out.push(buildMdUcBlock(ucM[1].replace(/\s/g, '').toUpperCase(), ucM[2], ucLines, prefillCtx));
      continue;
    }

    const subM = t.match(/^### (.+)/);
    if (subM) { out.push(`<h3>${esc(subM[1])}</h3>`); i++; continue; }

    if (t.includes('[P0 BLOCKER]')) {
      const txt = t.replace(/\*{0,2}\[P0 BLOCKER\]\*{0,2}\s*/, '').trim();
      out.push(`<div class="p0-block"><div class="p0-label">P0 Blocker</div><p>${mdInline(txt)}</p></div>`);
      i++; continue;
    }

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

    if (t.startsWith('|') && i + 1 < lines.length && lines[i + 1].trim().match(/^\|[-\s:|]+\|/)) {
      const tbl = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { tbl.push(lines[i].trim()); i++; }
      out.push(buildMdFieldTable(tbl));
      continue;
    }

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

    if (t.startsWith('<')) { out.push(t); i++; continue; }

    i++;
  }
  return out.join('\n');
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
  ).join('\n') || `<div class="flag-body">${body}</div>`;
}

function buildFromMd(md, slug, proj) {
  const ctxPath = path.join(ROOT, 'projects', slug, 'company_context.json');
  const ctx     = fs.existsSync(ctxPath)
    ? (() => { try { return JSON.parse(fs.readFileSync(ctxPath, 'utf8')); } catch { return {}; } })()
    : {};

  const meta       = parseMdIntakeMeta(md, proj);
  const prefillCtx = buildPrefillContext(proj, ctx);

  const journeyArr = ctx.aiJourney
    ? Object.entries(ctx.aiJourney).map(([, s]) => s)
    : [];

  const journeyCardsHtml = journeyArr.length
    ? journeyArr.map((s, i) =>
        `<div class="journey-card phase-${i + 1}">
          <div class="jc-phase">Phase ${i + 1}</div>
          <div class="jc-label">${esc(s.label)}</div>
          <div class="jc-headline">${esc(s.headline)}</div>
          <div class="jc-body">${s.body}</div>
        </div>`
      ).join('\n')
    : '';

  const p0BlockersHtml = ctx.p0Blockers && ctx.p0Blockers.length
    ? `<div class="bc-blockers no-print">
        <h4>Internal — Technical Blockers (P0) — Not Shown in PDF</h4>
        <ul>${ctx.p0Blockers.map(b => `<li>${esc(b.system)}: ${esc(b.blocker)}</li>`).join('')}</ul>
      </div>`
    : '';

  const sections    = splitMdIntakeSections(md);
  const clientSecs  = sections.filter(s => !s.isInternal);
  const internalSec = sections.find(s => s.isInternal);

  const secMeta    = [];
  const secEntries = clientSecs.map(sec => {
    const rawId     = sec.id || '';
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
        `  <div class="section-body">${renderMdIntakeSection(sec.body, prefillCtx)}</div>\n` +
        `</details>`,
    };
  });

  const railP0 = (ctx.p0Blockers || []).map(b => ({
    title: b.system, clientAction: b.blocker, body: b.blocker,
  }));

  const internalFlagsHtml = internalSec
    ? `<div class="internal-block no-print">
        <h3>${esc(internalSec.title)}</h3>
        ${renderMdInternalSection(internalSec.body)}
      </div>`
    : '';

  const sourceUrl = proj.sourceFilesFolder || '';

  return {
    clientName:       meta.clientName,
    clientSlug:       slug || meta.clientName.toLowerCase().replace(/\s+/g, '-'),
    eyebrow:          `DataSkate × ${esc(meta.clientName)} — Intake Questionnaire`,
    docTitle:         `${esc(meta.clientName)} × DataSkate — Integration Discovery`,
    docSubtitle:      'Scoping supplement for your MuleSoft engagement',
    date:             meta.date,
    architect:        meta.architect,
    architectEmail:   meta.architectEmail,
    sourceHtml:       buildIntakeSource(meta.source, sourceUrl),
    bcSnapshot:       ctx.snapshot ? esc(ctx.snapshot) : '',
    phaseChip:        buildIntakePhaseChip(journeyArr),
    journeyCardsHtml,
    p0BlockersHtml,
    catTabs:          buildIntakeCatTabItems(secEntries),
    formSectionsHtml: groupIntakeSectionsByCategory(secEntries),
    railNav:          buildIntakeRailNavGroups(secMeta),
    railAttention:    buildIntakeRailAttention(railP0),
    railLinks:        buildIntakeRailLinks({ clientSlug: slug }),
    internalFlagsHtml,
    pricingSummaryHtml: '',
  };
}

// ─── MAIN ENTRY ───────────────────────────────────────────────────────────────

function buildIntakeAll(client) {
  if (!client) return null;
  if (client.intakeJson) return buildFromJson(client.intakeJson, client.slug);
  if (client.intakeMd)   return buildFromMd(client.intakeMd, client.slug, client.meta || {});
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
