#!/usr/bin/env node
'use strict';

const fs   = require('fs');
const path = require('path');

// Minimal YAML parser for simple flat canonical model files (no js-yaml needed)
function parseSimpleYaml(raw) {
  const result = {};
  const lines  = raw.split('\n');
  let inProps  = false;
  let propCount = 0;
  for (const line of lines) {
    // Detect entry into properties block
    if (/^properties\s*:/.test(line)) { inProps = true; continue; }
    // Count direct child keys of properties (2-space indent, key: anything)
    if (inProps) {
      if (/^  [a-zA-Z_]/.test(line) && /:\s/.test(line)) { propCount++; continue; }
      if (/^[a-zA-Z]/.test(line)) inProps = false; // left properties block
    }
    // Top-level key: value
    const m = line.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.*)/);
    if (!m) continue;
    const [, key, val] = m;
    result[key] = val.replace(/^["']|["']$/g, '').trim();
  }
  if (propCount) result._propertyCount = propCount;
  return result;
}

const ROOT = path.join(__dirname, '..');
const OUT  = path.join(ROOT, 'firebase/public/resources/capabilities.html');

// ── 1. Load pipeline ──────────────────────────────────────────────────────────
const pipeline = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'DSPipeline/scout/pipeline.json'), 'utf8')
);

// ── 2. Load playbooks ─────────────────────────────────────────────────────────
const playbooksDir = path.join(ROOT, 'standards/playbooks');
const playbooks = [];
for (const slug of fs.readdirSync(playbooksDir).sort()) {
  const dir = path.join(playbooksDir, slug);
  if (!fs.statSync(dir).isDirectory()) continue;
  const jsonFile = path.join(dir, `${slug}_playbook.json`);
  if (!fs.existsSync(jsonFile)) continue;
  try {
    const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
    const rawName = data.displayName || data.system || slug;
    // strip markdown artifacts (e.g. "Foo | **Maturity:** stub ...")
    const name = rawName.replace(/\s*\|.*$/, '').replace(/\*\*/g, '').trim();
    if (!name || name === 'undefined') continue;
    playbooks.push({
      slug,
      name,
      maturity: data.maturity || 'stub',
      clients: (data.clients || []).length,
      quirks: (data.knownQuirks || []),
      p0: (data.p0Conditions || []),
      lastUpdated: data.lastUpdated || null,
      connectorKey: data.connectorKey || slug,
    });
  } catch (e) {
    // skip malformed
  }
}
playbooks.sort((a, b) => {
  if (a.maturity === 'verified' && b.maturity !== 'verified') return -1;
  if (b.maturity === 'verified' && a.maturity !== 'verified') return 1;
  return a.name.localeCompare(b.name);
});

// ── 3. Load canonical models ──────────────────────────────────────────────────
const canonicalDir = path.join(ROOT, 'standards/canonical-models');
const verticals = {};
for (const vertical of fs.readdirSync(canonicalDir).sort()) {
  const vDir = path.join(canonicalDir, vertical);
  if (!fs.statSync(vDir).isDirectory()) continue;
  const models = [];
  for (const f of fs.readdirSync(vDir).sort()) {
    if (!/\.ya?ml$/.test(f)) continue;
    try {
      const raw  = fs.readFileSync(path.join(vDir, f), 'utf8');
      const data = parseSimpleYaml(raw);
      models.push({
        file:       f,
        title:      data.title || f.replace(/\.ya?ml$/, ''),
        version:    data.version || '?',
        standard:   data.standard || '—',
        description:data.description || '',
        fieldCount: data._propertyCount || 0,
        createdFrom:data.createdFrom || '',
        note:       data.note || '',
      });
    } catch (e) { /* skip */ }
  }
  if (models.length) verticals[vertical] = models;
}

// ── 4. Parse FK index ─────────────────────────────────────────────────────────
const fkMd = fs.readFileSync(path.join(ROOT, 'docs/FIELD_KNOWLEDGE.md'), 'utf8');
const fkEntries = [];
for (const line of fkMd.split('\n')) {
  if (!line.startsWith('| [FK-')) continue;
  const cols = line.split('|').map(s => s.trim()).filter(Boolean);
  if (cols.length < 6) continue;
  const numM   = cols[0].match(/FK-(\d+)/);
  const anchorM= cols[0].match(/\(#([^)]+)\)/);
  fkEntries.push({
    id:      numM   ? `FK-${numM[1]}`  : '?',
    anchor:  anchorM ? anchorM[1]       : '',
    title:   cols[1],
    pattern: cols[2],
    status:  cols[3],
    added:   cols[4],
    times:   cols[6] || '1',
  });
}

// ── 5. Helpers ────────────────────────────────────────────────────────────────
const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function maturityBadge(m) {
  const map = {
    verified: ['var(--green)',   '#fff',           'Verified'],
    active:   ['var(--amber)',   '#fff',           'Active'],
    stub:     ['var(--border)',  'var(--mid)',      'Stub'],
  };
  const [bg, color, label] = map[m] || map.stub;
  return `<span style="display:inline-block;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:700;background:${bg};color:${color};">${label}</span>`;
}

function modelBadge(model) {
  const styles = {
    haiku:  'background:var(--amber-bg);color:#92640A;border:1px solid var(--amber);',
    sonnet: 'background:var(--blue-bg);color:#1D4ED8;border:1px solid var(--blue-br);',
    opus:   'background:var(--light);color:var(--brand);border:1px solid var(--brand);',
  };
  const s = styles[model] || 'background:#F0F0F2;color:var(--mid);border:1px solid var(--border);';
  return `<span style="display:inline-block;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:700;${s}">${esc(model)}</span>`;
}

function statusBadge(status) {
  const map = {
    'verified':           ['var(--green)',   '#fff'],
    'promoted-to-standard':['var(--blue-br)','#fff'],
    'observation':        ['var(--border)',  'var(--mid)'],
  };
  const [bg, color] = map[status] || map['observation'];
  return `<span style="display:inline-block;padding:1px 7px;border-radius:3px;font-size:10px;font-weight:700;background:${bg};color:${color};">${esc(status)}</span>`;
}

// Strip **bold** markdown from quirk text for HTML display
const stripMd = s => s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');

// ── 6. Build HTML sections ────────────────────────────────────────────────────

// Section: BMAD Pipeline
const bmadStages = [
  { num: 1, name: 'Scout', tag: '9 AI Agents', desc: 'Pre-sales pipeline — research, proposal, intake', highlight: true },
  { num: 2, name: 'Analyst', tag: 'PRD', desc: 'Requirements + flow mapping' },
  { num: 3, name: 'VP', tag: 'Validate', desc: 'PRD gate review' },
  { num: 4, name: 'Architect', tag: 'MD', desc: 'Technical architecture design' },
  { num: 5, name: 'PM', tag: 'Stories', desc: 'Sprint stories + acceptance criteria' },
  { num: 6, name: 'Scaffold', tag: 'Repo', desc: 'Client repo + Mule XML stubs' },
  { num: 7, name: 'Developer', tag: 'Anypoint', desc: 'Implementation in Anypoint Studio' },
];

function renderPipelineSection() {
  const steps = bmadStages.map((s, i) => {
    const cls = s.highlight ? 'dg-step highlight' : 'dg-step';
    const arrow = i < bmadStages.length - 1 ? '<div class="dg-arrow">›</div>' : '';
    return `
    <div class="${cls}">
      <div class="dg-step-num">Stage ${s.num}</div>
      <div class="dg-step-name">${esc(s.name)}</div>
      <div class="dg-step-tag">${esc(s.tag)}</div>
      <div class="dg-step-desc">${esc(s.desc)}</div>
    </div>${arrow}`;
  }).join('');

  return `
<h2 id="pipeline">BMAD Pipeline</h2>
<p>DataSkate's end-to-end delivery pipeline — from first sales contact to verified implementation. Scout (Stage 1) is fully automated with 9 specialist AI agents.</p>
<div class="dg-flow" style="flex-wrap:wrap;gap:8px;">${steps}</div>
<h3 id="pipeline-repos">Two-Repo Model</h3>
<p>The pipeline spans two Git repositories:</p>
<table class="md-table">
  <thead><tr><th>Repo</th><th>Who uses it</th><th>What runs here</th></tr></thead>
  <tbody>
    <tr><td><strong>Planning repo</strong> (this repo)</td><td>Tech lead / architect</td><td>Scout through Scaffold — all pre-dev stages. Stores decisions.json, PRD, stories, and generated client portal HTML.</td></tr>
    <tr><td><strong>Client dev repo</strong></td><td>Developers</td><td>Anypoint Studio implementation. Developer fills in TODO stubs. Dev agent (VR) runs MUnit verification. Never contains planning artifacts.</td></tr>
  </tbody>
</table>
<h3 id="pipeline-knowledge">Knowledge Capture Loop</h3>
<p>Every engagement feeds back into the knowledge base:</p>
<ul>
  <li><strong>Vera</strong> stages use-case findings → <code>run/vera.json → libraryContributions[]</code></li>
  <li><strong>Sol</strong> promotes to <code>standards/usecases/{vertical}.json</code> (FOMO library)</li>
  <li>Field incidents → <strong>FK entries</strong> (this page, Field Knowledge section)</li>
  <li>System quirks → <strong>Playbook JSONs</strong> (this page, System Playbooks section)</li>
  <li>Canonical record types → <strong>YAML stubs</strong> (this page, Canonical Models section)</li>
</ul>`;
}

// Section: Scout Agents
function renderScoutSection() {
  const agentRows = pipeline.agents.map(a => {
    const modeIcon = a.mode === 'gated'
      ? '<span style="color:var(--amber);font-weight:700;">⊙ Gated</span>'
      : '<span style="color:var(--mid);">◎ Conversational</span>';
    return `
<h3 id="sa-${a.slug}">${esc(a.position)}. ${esc(a.name)} — ${esc(a.role)}</h3>
<p style="display:flex;gap:8px;align-items:center;margin:4px 0 6px;">${modelBadge(a.model)} ${modeIcon}</p>
<p style="margin:0;color:var(--mid);font-size:12px;">Output: <code>${esc(a.outputFile)}</code>${a.gatePrompt ? ` &nbsp;·&nbsp; Gate: <em>${esc(a.gatePrompt)}</em>` : ''}</p>`;
  }).join('');

  // Visual flow strip
  const agentFlow = pipeline.agents.map((a, i) => {
    const modelColors = {
      haiku:  '#D69E2E',
      sonnet: '#3B82F6',
      opus:   '#ed1c24',
    };
    const color = modelColors[a.model] || '#888';
    const arrow = i < pipeline.agents.length - 1 ? '<span style="color:var(--border);font-size:16px;padding:0 3px;">›</span>' : '';
    return `<span style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;padding:6px 10px;border:1px solid ${color}22;border-radius:5px;background:${color}08;">
  <span style="font-size:10px;font-weight:800;color:${color};">${esc(a.name)}</span>
  <span style="font-size:9px;color:var(--mid);">${esc(a.model)}</span>
</span>${arrow}`;
  }).join(' ');

  return `
<h2 id="scout">Scout Agents</h2>
<p>Scout is a 9-agent pre-sales pipeline that runs fully automatically. Each agent reads a designated input and writes its own output JSON — no agent touches pipeline state or coordination (that lives in <code>orchestrate.js</code>).</p>
<div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:12px;background:#FAFAFA;border:1px solid var(--border);border-radius:6px;margin:10px 0;">${agentFlow}</div>
<p style="font-size:11px;color:var(--mid);margin-top:4px;">Color = AI model: <span style="color:#D69E2E;font-weight:700;">Haiku</span> · <span style="color:#3B82F6;font-weight:700;">Sonnet</span> · <span style="color:#ed1c24;font-weight:700;">Opus</span></p>
${agentRows}`;
}

// Section: System Playbooks
function renderPlaybooksSection() {
  const summaryRows = playbooks.map(p => {
    const quirksCell = p.quirks.length
      ? `<span style="font-weight:700;color:var(--dark);">${p.quirks.length}</span>`
      : '<span style="color:var(--border);">—</span>';
    const clientsCell = p.clients
      ? `<span style="font-weight:700;color:var(--dark);">${p.clients}</span>`
      : '<span style="color:var(--border);">0</span>';
    const p0Cell = p.p0.length
      ? `<span style="color:var(--brand);font-weight:700;">${p.p0.length} P0</span>`
      : '<span style="color:var(--border);">—</span>';
    return `<tr>
  <td><a href="#pb-${esc(p.slug)}" style="font-weight:600;color:var(--dark);text-decoration:none;">${esc(p.name)}</a></td>
  <td>${maturityBadge(p.maturity)}</td>
  <td style="text-align:center;">${clientsCell}</td>
  <td style="text-align:center;">${quirksCell}</td>
  <td style="text-align:center;">${p0Cell}</td>
</tr>`;
  }).join('');

  const details = playbooks.map(p => {
    const quirksHtml = p.quirks.length
      ? `<ul style="margin:8px 0 0 16px;">${p.quirks.map(q => `<li style="margin:4px 0;font-size:12px;line-height:1.6;">${stripMd(esc(q))}</li>`).join('')}</ul>`
      : '<p style="color:var(--mid);font-size:12px;">No known quirks documented yet.</p>';
    const p0Html = p.p0.length
      ? `<div style="margin-top:10px;"><h4>P0 Blockers</h4><ul style="margin:4px 0 0 16px;">${p.p0.map(c => `<li style="font-size:12px;color:var(--brand);margin:3px 0;">${esc(c)}</li>`).join('')}</ul></div>`
      : '';
    return `
<h3 id="pb-${esc(p.slug)}">${esc(p.name)}</h3>
<p style="display:flex;gap:8px;align-items:center;margin:4px 0 8px;">${maturityBadge(p.maturity)}<span style="font-size:11px;color:var(--mid);">${p.clients} client${p.clients === 1 ? '' : 's'} · ${p.quirks.length} known quirk${p.quirks.length === 1 ? '' : 's'}${p.lastUpdated ? ' · last updated ' + p.lastUpdated : ''}</span></p>
<h4>Known Quirks</h4>${quirksHtml}${p0Html}`;
  }).join('');

  return `
<h2 id="playbooks">System Playbooks</h2>
<p>One playbook JSON per system — authoritative source for quirks, P0 blockers, client usage, and DWL transform files. Rex agent loads all playbooks at startup; Scout queries them per detected system.</p>
<table class="md-table" style="margin-bottom:20px;">
  <thead><tr><th>System</th><th>Maturity</th><th style="text-align:center;">Clients</th><th style="text-align:center;">Quirks</th><th style="text-align:center;">P0s</th></tr></thead>
  <tbody>${summaryRows}</tbody>
</table>
${details}`;
}

// Section: Canonical Models
function renderCanonicalSection() {
  const verticalNames = {
    commerce:    'Commerce',
    construction:'Construction',
    education:   'Education',
    healthcare:  'Healthcare',
  };

  const verticalBlocks = Object.entries(verticals).map(([v, models]) => {
    const label = verticalNames[v] || v;
    const rows = models.map(m => {
      const fieldBadge = m.fieldCount
        ? `<span style="font-weight:700;">${m.fieldCount} fields</span>`
        : '<span style="color:var(--mid);">stub</span>';
      return `<tr>
  <td><strong>${esc(m.title)}</strong></td>
  <td><code style="font-size:11px;">${esc(m.version)}</code></td>
  <td style="font-size:11px;">${esc(m.standard)}</td>
  <td style="text-align:center;">${fieldBadge}</td>
  <td style="font-size:11px;max-width:280px;">${esc(m.description)}</td>
</tr>`;
    }).join('');
    return `
<h3 id="cm-${esc(v)}">${esc(label)}</h3>
<p style="font-size:12px;color:var(--mid);margin-bottom:8px;">${models.length} record type${models.length === 1 ? '' : 's'} · path: <code>standards/canonical-models/${esc(v)}/</code></p>
<table class="md-table">
  <thead><tr><th>Record</th><th>Version</th><th>Standard</th><th style="text-align:center;">Fields</th><th>Description</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
  }).join('');

  return `
<h2 id="canonical">Canonical Models</h2>
<p>Hub schemas organized by industry vertical — planning-time reference schemas. Agents read them during field mapping; the DWL transforms in <code>standards/playbooks/</code> implement them. Stubs are promoted to versioned schemas when confirmed fields from 2+ clients are accumulated.</p>
<blockquote><p><strong>Registry:</strong> <code>standards/canonical-models/registry.json</code> maps vertical → industry standard → record → key field alignments. All agents must consult it before creating canonical stubs or validating field mappings.</p></blockquote>
${verticalBlocks}`;
}

// Section: Field Knowledge
function renderFKSection() {
  const rows = fkEntries.map(f => {
    const timesNum = parseInt(f.times, 10);
    const timesStyle = timesNum >= 3
      ? 'font-weight:800;color:var(--brand);'
      : timesNum >= 2 ? 'font-weight:700;color:var(--dark);' : 'color:var(--mid);';
    return `<tr>
  <td><a href="https://github.com/dataskateclients/planning/blob/main/docs/FIELD_KNOWLEDGE.md#${esc(f.anchor)}" target="_blank" style="font-weight:700;color:var(--dark);text-decoration:none;">${esc(f.id)}</a></td>
  <td style="font-size:12px;">${esc(f.title)}</td>
  <td style="font-size:11px;color:var(--mid);">${esc(f.pattern)}</td>
  <td>${statusBadge(f.status)}</td>
  <td style="font-size:11px;color:var(--mid);">${esc(f.added)}</td>
  <td style="text-align:center;font-size:12px;${timesStyle}">${esc(f.times)}</td>
</tr>`;
  }).join('');

  const verifiedCount  = fkEntries.filter(f => f.status === 'verified').length;
  const promotedCount  = fkEntries.filter(f => f.status === 'promoted-to-standard').length;
  const observedCount  = fkEntries.filter(f => f.status === 'observation').length;

  return `
<h2 id="fk">Field Knowledge</h2>
<p>Real-project lessons captured from every engagement. Agents apply <em>verified</em> entries as active guidance and flag <em>observations</em> for architect review. Entries promoted to standard remain here for traceability.</p>
<div style="display:flex;gap:16px;margin:10px 0 14px;flex-wrap:wrap;">
  <div style="padding:8px 14px;border:1px solid var(--border);border-radius:5px;">
    <div style="font-size:22px;font-weight:800;color:var(--dark);">${fkEntries.length}</div>
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--mid);">Total Entries</div>
  </div>
  <div style="padding:8px 14px;border:1px solid var(--green);border-radius:5px;background:#F0FFF4;">
    <div style="font-size:22px;font-weight:800;color:var(--green);">${verifiedCount}</div>
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--mid);">Verified</div>
  </div>
  <div style="padding:8px 14px;border:1px solid var(--border);border-radius:5px;">
    <div style="font-size:22px;font-weight:800;color:var(--mid);">${observedCount}</div>
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--mid);">Observations</div>
  </div>
  ${promotedCount ? `<div style="padding:8px 14px;border:1px solid var(--blue-br);border-radius:5px;background:var(--blue-bg);">
    <div style="font-size:22px;font-weight:800;color:var(--blue-br);">${promotedCount}</div>
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--mid);">Promoted</div>
  </div>` : ''}
</div>
<h3 id="fk-index">All Entries</h3>
<table class="md-table">
  <thead><tr><th>ID</th><th>Title</th><th>Pattern / System</th><th>Status</th><th>Added</th><th style="text-align:center;">Times</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<p style="font-size:11px;color:var(--mid);margin-top:8px;">To add an entry: run the Architect Debrief agent (<code>_bmad/custom/bmad-agent-architect-debrief.toml</code>) and select DK. The agent asks 6 questions and writes the index row + full detail block.</p>`;
}

// ── 7. Assemble full HTML ─────────────────────────────────────────────────────
const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DataSkate Knowledge Base — Internal</title>
<style>
:root {
  --brand:    #ed1c24;
  --brand-dk: #a01019;
  --dark:     #1A1A1A;
  --mid:      #555F6E;
  --light:    #FFF5F5;
  --border:   #E8E0E0;
  --green:    #2E9E6B;
  --amber:    #D69E2E;
  --amber-bg: #FFFBEB;
  --blue-bg:  #F0F6FF;
  --blue-br:  #3B82F6;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 15px; line-height: 1.6; color: var(--dark); background: #fff;
}
a { color: var(--brand); }

/* ── TOP BAR ── */
.top-bar {
  position: sticky; top: 0; z-index: 200;
  background: #fff; border-bottom: 2px solid var(--brand);
  display: flex; align-items: center; gap: 14px;
  padding: 0 20px; height: 44px;
}
.top-bar-logo { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.top-bar-divider { width: 1px; height: 24px; background: var(--border); }
.top-bar-title { font-size: 12px; font-weight: 700; color: var(--dark); }
.top-bar-eyebrow { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: var(--mid); }
.top-bar-meta { margin-left: auto; font-size: 10px; color: var(--mid); flex-shrink: 0; }

/* ── 3-COLUMN LAYOUT ── */
.docs-shell {
  display: grid;
  grid-template-columns: 200px 1fr 180px;
  min-height: calc(100vh - 44px);
  max-width: 1440px;
  margin: 0 auto;
}

/* ── LEFT NAV ── */
.nav-left {
  position: sticky; top: 44px;
  height: calc(100vh - 44px); overflow-y: auto;
  border-right: 1px solid var(--border);
  padding: 14px 0 24px;
}
.nav-left::-webkit-scrollbar { width: 3px; }
.nav-left::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.nav-section { margin-bottom: 1px; }
.nav-section-link {
  display: block; padding: 5px 14px;
  font-size: 12px; font-weight: 600; color: var(--mid);
  text-decoration: none; border-left: 3px solid transparent;
  transition: color .1s, border-color .1s, background .1s;
  line-height: 1.35;
}
.nav-section-link:hover { color: var(--dark); background: #FAFAFA; }
.nav-section-link.active { color: var(--brand); border-left-color: var(--brand); background: var(--light); font-weight: 700; }

/* ── CONTENT ── */
.doc-content {
  padding: 20px 32px 48px;
  min-width: 0; font-size: 13px;
}
.doc-content h2 {
  font-size: 16px; font-weight: 800; color: var(--dark);
  margin: 36px 0 6px;
  border-bottom: 2px solid var(--border); padding-bottom: 6px;
  scroll-margin-top: 52px;
}
.doc-content h2:first-child { margin-top: 0; }
.doc-content h3 {
  font-size: 13px; font-weight: 700; color: var(--brand-dk);
  margin: 20px 0 5px; scroll-margin-top: 52px;
}
.doc-content h4 {
  font-size: 11px; font-weight: 700; color: var(--mid);
  text-transform: uppercase; letter-spacing: 0.7px;
  margin: 14px 0 4px;
}
.doc-content p { margin: 5px 0; line-height: 1.6; color: var(--dark); }
.doc-content > *:first-child { margin-top: 0; }
.doc-content ul, .doc-content ol { margin: 5px 0 5px 18px; }
.doc-content ul li { list-style: disc; margin: 2px 0; line-height: 1.55; }
.doc-content ol li { list-style: decimal; margin: 2px 0; line-height: 1.55; }
.doc-content blockquote {
  margin: 10px 0; padding: 8px 14px;
  border-left: 3px solid var(--brand); background: var(--light);
  border-radius: 0 4px 4px 0;
}
.doc-content blockquote p { margin: 0; font-style: italic; color: var(--dark); font-size: 12px; }
code {
  background: #F2F2F4; padding: 1px 5px; border-radius: 3px;
  font-size: 12px; font-family: 'SF Mono', 'Fira Code', Consolas, 'Courier New', monospace;
  color: var(--brand-dk);
}
strong { font-weight: 700; }
em { font-style: italic; }

/* Tables */
.md-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
.md-table th {
  background: var(--dark); color: #fff;
  padding: 6px 10px; text-align: left; font-weight: 600; font-size: 11px;
}
.md-table th:first-child { border-radius: 4px 0 0 0; }
.md-table th:last-child  { border-radius: 0 4px 0 0; }
.md-table td { padding: 5px 10px; border-bottom: 1px solid var(--border); vertical-align: top; line-height: 1.5; }
.md-table tr:nth-child(even) td { background: #FAFAFA; }
.md-table tr:last-child td { border-bottom: 2px solid var(--border); }

/* Pipeline flow */
.dg-flow {
  display: flex; align-items: stretch; gap: 0;
  margin: 12px 0; overflow-x: auto;
}
.dg-step {
  flex: 1; min-width: 110px;
  border: 1px solid var(--border); border-radius: 7px;
  padding: 8px 10px; background: #fff;
  display: flex; flex-direction: column; gap: 3px;
}
.dg-step.highlight { border-color: var(--brand); background: var(--light); }
.dg-step-num { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--mid); }
.dg-step-name { font-size: 12px; font-weight: 800; color: var(--dark); }
.dg-step.highlight .dg-step-name { color: var(--brand); }
.dg-step-tag { font-size: 10px; font-weight: 600; color: var(--mid); background: #F0F0F2; border-radius: 20px; padding: 1px 7px; align-self: flex-start; }
.dg-step.highlight .dg-step-tag { background: #FDDEDE; color: var(--brand); }
.dg-step-desc { font-size: 10px; color: var(--mid); line-height: 1.4; margin-top: 2px; }
.dg-arrow { display: flex; align-items: center; padding: 0 4px; color: var(--border); font-size: 16px; flex-shrink: 0; }

/* ── RIGHT NAV ── */
.nav-right {
  position: sticky; top: 44px;
  height: calc(100vh - 44px); overflow-y: auto;
  border-left: 1px solid var(--border);
  padding: 14px 0 24px;
}
.nav-right::-webkit-scrollbar { width: 3px; }
.nav-right::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
.nav-right-label {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 1.2px; color: var(--mid); padding: 0 14px; margin-bottom: 6px;
}
.nav-sub-link {
  display: block; padding: 3px 14px;
  font-size: 11px; color: var(--mid); text-decoration: none;
  border-left: 2px solid transparent; transition: color .1s, border-color .1s;
  line-height: 1.35;
}
.nav-sub-link:hover { color: var(--dark); }
.nav-sub-link.active { color: var(--brand-dk); border-left-color: var(--brand); font-weight: 600; }

/* ── FOOTER ── */
.doc-footer {
  border-top: 1px solid var(--border); padding: 10px 32px;
  font-size: 11px; color: var(--mid);
  display: flex; justify-content: space-between; align-items: center;
  grid-column: 2;
}

/* ── RESPONSIVE ── */
@media (max-width: 1100px) {
  .docs-shell { grid-template-columns: 180px 1fr; }
  .nav-right { display: none; }
}
@media (max-width: 720px) {
  .docs-shell { grid-template-columns: 1fr; }
  .nav-left { position: static; height: auto; border-right: none; border-bottom: 1px solid var(--border); padding: 10px 0; }
  .doc-content { padding: 16px 16px 40px; }
}
</style>
</head>
<body>

<!-- TOP BAR -->
<div class="top-bar">
  <div class="top-bar-logo">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="140 258 590 96" style="height:18px;width:auto;display:block;" aria-label="DataSkate">
      <path fill="#ed1c24" d="m195.02,287.72v-12.49c21.94,0,38.48,10.29,38.48,23.93s-16.55,23.93-38.48,23.93v-12.49c15.86,0,25.99-6.77,25.99-11.44s-10.13-11.44-25.99-11.44Z"/>
      <path fill="#231f20" d="m195.02,327.75v12.49c-21.94,0-38.48-10.29-38.48-23.93s16.55-23.93,38.48-23.93v12.49c-15.86,0-25.99,6.77-25.99,11.44s10.13,11.44,25.99,11.44Z"/>
      <path fill="#231f20" d="m245.22,314.79c0-15.55,11.59-23.46,22.63-23.46,6.53,0,11.96,2.76,15.18,7.82v-26.49h10.95v42.23c0,14.72-9.94,24.29-24.2,24.29s-24.56-9.94-24.56-24.38Zm37.81.46c0-8-5.33-13.71-13.34-13.71s-13.43,5.7-13.43,13.71,5.43,13.71,13.43,13.71,13.34-5.7,13.34-13.71Z"/>
      <path fill="#231f20" d="m302.54,315.71c0-14.44,10.12-24.38,24.56-24.38s24.2,9.66,24.2,24.29v22.35h-10.03v-8.92c-2.76,6.72-8.92,10.12-16.1,10.12-11.04,0-22.63-7.91-22.63-23.46Zm37.81-.46c0-8-5.33-13.71-13.34-13.71s-13.43,5.7-13.43,13.71,5.43,13.71,13.43,13.71,13.34-5.7,13.34-13.71Z"/>
      <path fill="#231f20" d="m361.69,320.49v-44.07h10.95v16.1h23.46v9.94h-23.46v18.03c0,6.07,3.13,8.46,7.64,8.46s7.64-2.3,7.64-8.46v-1.2h10.95v1.2c0,12.6-7.54,18.68-18.58,18.68s-18.58-6.07-18.58-18.68Z"/>
      <path fill="#231f20" d="m405.39,315.71c0-14.44,10.12-24.38,24.56-24.38s24.2,9.66,24.2,24.29v22.35h-10.03v-8.92c-2.76,6.72-8.92,10.12-16.1,10.12-11.04,0-22.63-7.91-22.63-23.46Zm37.81-.46c0-8-5.33-13.71-13.34-13.71s-13.43,5.7-13.43,13.71,5.43,13.71,13.43,13.71,13.34-5.7,13.34-13.71Z"/>
      <path fill="#ed1c24" d="m471.93,324.82h8.83c.18,3.77,3.68,6.44,10.03,6.44s10.03-2.85,10.03-6.44c0-4.32-4.78-4.88-10.49-5.61-7.91-1.01-17.48-2.48-17.48-12.88,0-8.92,6.99-15,17.85-15s17.57,6.16,17.75,13.98h-8.65c-.28-3.5-3.5-6.07-9.02-6.07-5.8,0-9.11,2.76-9.11,6.35,0,4.32,4.78,4.78,10.4,5.52,7.91,1.01,17.57,2.48,17.57,12.88,0,9.2-7.45,15.18-18.86,15.18s-18.58-6.07-18.86-14.35Z"/>
      <path fill="#ed1c24" d="m520.51,272.65h8.74v40.02l20.88-20.15h11.5l-23.73,22.17,24.56,23.27h-11.68l-21.53-21.16v21.16h-8.74v-65.32Z"/>
      <path fill="#ed1c24" d="m565.49,315.62c0-14.26,10.12-24.29,24.56-24.29s24.2,9.75,24.2,24.29v22.35h-8v-9.94c-3.04,7.36-9.75,11.13-17.66,11.13-11.87,0-23.09-8.56-23.09-23.55Zm40.11-.37c0-9.2-6.25-15.82-15.64-15.82s-15.64,6.62-15.64,15.82,6.26,15.82,15.64,15.82,15.64-6.62,15.64-15.82Z"/>
      <path fill="#ed1c24" d="m624.65,320.77v-44.34h8.74v16.1h25.02v8h-25.02v20.24c0,7.18,3.77,10.3,9.48,10.3s9.57-3.04,9.57-10.3v-1.01h8.65v1.01c0,12.33-7.36,18.4-18.21,18.4s-18.21-6.07-18.21-18.4Z"/>
      <path fill="#ed1c24" d="m667.89,315.25c0-13.8,10.12-23.92,24.47-23.92s24.29,10.12,24.29,23.92v3.22h-39.56c1.29,8.1,7.36,12.6,15.27,12.6,5.89,0,10.03-1.84,12.7-5.8h9.66c-3.5,8.46-11.78,13.89-22.35,13.89-14.35,0-24.47-10.12-24.47-23.92Zm39.56-4.6c-1.75-7.27-7.73-11.22-15.09-11.22s-13.25,4.05-15,11.22h30.08Z"/>
    </svg>
  </div>
  <div class="top-bar-divider"></div>
  <div>
    <div class="top-bar-eyebrow">DataSkate Internal</div>
    <div class="top-bar-title">Knowledge Base</div>
  </div>
  <div class="top-bar-meta">Generated ${generatedAt} · ${playbooks.length} systems · ${fkEntries.length} FK entries</div>
</div>

<!-- 3-COLUMN SHELL -->
<div class="docs-shell">
  <nav class="nav-left" id="navLeft"></nav>

  <main class="doc-content" id="docContent">
    ${renderPipelineSection()}
    ${renderScoutSection()}
    ${renderPlaybooksSection()}
    ${renderCanonicalSection()}
    ${renderFKSection()}
  </main>

  <nav class="nav-right" id="navRight">
    <div class="nav-right-label">On this page</div>
  </nav>
</div>

<footer class="doc-footer">
  <span>DataSkate Knowledge Base — auto-generated from live JSON/YAML/MD sources</span>
  <span>Generated ${generatedAt}</span>
</footer>

<script>
(function () {
  const navLeft  = document.getElementById('navLeft');
  const navRight = document.getElementById('navRight');
  const content  = document.getElementById('docContent');

  const h2s = Array.from(content.querySelectorAll('h2'));
  const h3s = Array.from(content.querySelectorAll('h3'));

  // Build left nav
  h2s.forEach(h2 => {
    const a = document.createElement('a');
    a.href = '#' + h2.id;
    a.className = 'nav-section-link';
    a.textContent = h2.textContent;
    a.addEventListener('click', e => {
      e.preventDefault();
      h2.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    const div = document.createElement('div');
    div.className = 'nav-section';
    div.appendChild(a);
    navLeft.appendChild(div);
  });

  // Build right nav for a given H2 section
  function buildRightNav(activeH2) {
    navRight.innerHTML = '<div class="nav-right-label">On this page</div>';
    if (!activeH2) return;
    const idx  = h2s.indexOf(activeH2);
    const next = h2s[idx + 1];
    const sectionH3s = h3s.filter(h3 => {
      const afterH2    = h3.offsetTop >= activeH2.offsetTop;
      const beforeNext = !next || h3.offsetTop < next.offsetTop;
      return afterH2 && beforeNext;
    });
    sectionH3s.forEach(h3 => {
      const a = document.createElement('a');
      a.href = '#' + h3.id;
      a.className = 'nav-sub-link';
      a.textContent = h3.textContent;
      a.addEventListener('click', e => {
        e.preventDefault();
        h3.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      navRight.appendChild(a);
    });
  }

  let activeH2 = h2s[0] || null;
  let activeH3 = null;

  function setActiveH2(el) {
    if (el === activeH2) return;
    activeH2 = el;
    navLeft.querySelectorAll('.nav-section-link').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === '#' + el.id);
    });
    buildRightNav(el);
  }

  function setActiveH3(el) {
    if (el === activeH3) return;
    activeH3 = el;
    navRight.querySelectorAll('.nav-sub-link').forEach(a => {
      a.classList.toggle('active', el && a.getAttribute('href') === '#' + el.id);
    });
  }

  function onScroll() {
    const scrollY = window.scrollY + 52;
    let currentH2 = h2s[0];
    for (const h2 of h2s) {
      if (h2.offsetTop <= scrollY) currentH2 = h2;
      else break;
    }
    if (currentH2) setActiveH2(currentH2);

    const idx  = h2s.indexOf(currentH2);
    const next = h2s[idx + 1];
    const sectionH3s = h3s.filter(h3 => {
      const afterH2    = h3.offsetTop >= (currentH2 ? currentH2.offsetTop : 0);
      const beforeNext = !next || h3.offsetTop < next.offsetTop;
      return afterH2 && beforeNext;
    });
    let currentH3 = null;
    for (const h3 of sectionH3s) {
      if (h3.offsetTop <= scrollY) currentH3 = h3;
      else break;
    }
    setActiveH3(currentH3);
  }

  if (h2s.length) {
    setActiveH2(h2s[0]);
    buildRightNav(h2s[0]);
    navLeft.querySelector('.nav-section-link').classList.add('active');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
})();
</script>

</body>
</html>`;

fs.writeFileSync(OUT, html, 'utf8');
console.log(`✓ Knowledge base generated → ${path.relative(ROOT, OUT)}`);
console.log(`  ${pipeline.agents.length} Scout agents · ${playbooks.length} system playbooks · ${Object.values(verticals).flat().length} canonical models · ${fkEntries.length} FK entries`);
