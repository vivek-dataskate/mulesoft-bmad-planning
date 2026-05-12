#!/usr/bin/env node
'use strict';
/**
 * scaffold/generate-capabilities.js
 *
 * Reads all three registries + playbooks + client projects → generates
 * docs/capabilities/index.html (served via GitHub Pages).
 *
 * Usage:
 *   node scaffold/generate-capabilities.js
 *   node scaffold/generate-capabilities.js --out /custom/path/index.html
 *
 * Sources:
 *   standards/connector-registry.json     — Tier 0: connector catalog
 *   standards/snippet-registry.json       — Tier 1/2/3: all capabilities
 *   standards/exchange-registry.json      — Tier 3: Exchange assets (if exists)
 *   playbooks/{system}/PLAYBOOK.md         — system playbooks
 *   projects/{client}/decisions.json      — per-client usage tracking
 */

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DEFAULT = path.join(REPO_ROOT, 'docs', 'capabilities', 'index.html');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function stalenessClass(lastVerified) {
  if (!lastVerified) return 'stale';
  const [y, m] = lastVerified.split('-').map(Number);
  const days = (Date.now() - new Date(y, m - 1, 1).getTime()) / 86_400_000;
  if (days <= 30)  return 'fresh';
  if (days <= 60)  return 'warn';
  return 'stale';
}

function stalenessLabel(lastVerified) {
  if (!lastVerified) return 'Unknown';
  const [y, m] = lastVerified.split('-').map(Number);
  const days = Math.round((Date.now() - new Date(y, m - 1, 1).getTime()) / 86_400_000);
  if (days <= 30)  return `${days}d ago ✓`;
  if (days <= 60)  return `${days}d ago ⚠`;
  return `${days}d ago ✗`;
}

// ─── Data loading ─────────────────────────────────────────────────────────────

function loadConnectors() {
  const reg = readJSON(path.join(REPO_ROOT, 'standards', 'connector-registry.json'));
  if (!reg) return [];
  const rows = [];
  for (const [catKey, cat] of Object.entries(reg.categories ?? {})) {
    for (const [key, conn] of Object.entries(cat.connectors ?? {})) {
      const displayName = conn.displayName ?? key;
      const builtUrl = conn.groupId && conn.artifactId
        ? `https://anypoint.mulesoft.com/exchange/${conn.groupId}/${conn.artifactId}/`
        : null;
      const searchUrl = `https://anypoint.mulesoft.com/exchange/#!/search/?term=${encodeURIComponent(displayName)}`;
      const resolvedUrl = conn.exchangeUrl ?? builtUrl ?? searchUrl;

      // Persist the resolved URL back to the registry if it was missing
      if (!conn.exchangeUrl && builtUrl) conn.exchangeUrl = builtUrl;

      rows.push({
        key,
        category: catKey,
        displayName,
        version: conn.version ?? conn.docVersion ?? '—',
        auth: conn.authType ?? '—',
        lastVerified: conn.lastVerified ?? null,
        exchangeUrl: resolvedUrl,
        note: conn.note ?? null,
      });
    }
  }
  return rows.sort((a, b) => a.category.localeCompare(b.category) || a.displayName.localeCompare(b.displayName));
}

function loadSnippets() {
  const reg = readJSON(path.join(REPO_ROOT, 'standards', 'snippet-registry.json'));
  if (!reg) return { t1: [], t2: [], t2dwl: [], t3: [] };
  return {
    t1:    Object.entries(reg.tier1_snippets ?? {}).map(([k, v]) => ({ key: k, ...v })),
    t2:    Object.entries(reg.tier2_commons  ?? {}).map(([k, v]) => ({ key: k, ...v })),
    t2dwl: Object.entries(reg.tier2_dwl     ?? {}).map(([k, v]) => ({ key: k, ...v })),
    t3:    Object.entries(reg.tier3_exchange ?? {}).map(([k, v]) => ({ key: k, ...v })),
  };
}

function loadPlaybooks() {
  const playbooksDir = path.join(REPO_ROOT, 'playbooks');
  if (!fs.existsSync(playbooksDir)) return [];
  return fs.readdirSync(playbooksDir)
    .filter(d => fs.statSync(path.join(playbooksDir, d)).isDirectory())
    .map(name => {
      const md = readFile(path.join(playbooksDir, name, 'PLAYBOOK.md')) ?? '';
      const maturityMatch = md.match(/\*\*Maturity:\*\*\s+([^\n]+)/i);
      const clientsMatch  = md.match(/\*\*Clients using this playbook:\*\*\s+([^\n]+)/i);
      const systemMatch   = md.match(/\*\*System:\*\*\s+([^\n]+)/i);
      const subFlowsMatch = [...md.matchAll(/\|\s*`([\w-]+)`\s*\|/g)].map(m => m[1]);

      // Extract quirk bullets from "Known quirks" or "Known system quirks" section
      const quirksSection = md.match(/##\s+Known\s+(?:system\s+)?quirks[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i)?.[1] ?? '';
      const quirks = quirksSection
        .split('\n')
        .filter(l => l.trim().startsWith('-') || l.trim().startsWith('*'))
        .map(l => {
          const text = l.replace(/^[\s\-*]+/, '').trim();
          // Strip bold markers and truncate
          const clean = text.replace(/\*\*([^*]+)\*\*/g, '$1');
          return clean.length > 160 ? clean.slice(0, 157) + '…' : clean;
        })
        .filter(Boolean)
        .slice(0, 5);

      // Extract supported objects list
      const objectsSection = md.match(/##\s+Supported objects[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i)?.[1] ?? '';
      const objects = objectsSection
        .split('\n')
        .filter(l => l.includes('|') && !l.includes('---') && !l.includes('Object'))
        .map(l => l.split('|')[1]?.trim())
        .filter(Boolean)
        .slice(0, 6);

      // Auth summary
      const authSection = md.match(/##\s+Auth[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i)?.[1] ?? '';
      const authLines = authSection.split('\n').filter(l => l.trim().startsWith('-')).slice(0, 2)
        .map(l => l.replace(/^[\s\-*]+/, '').trim());

      return {
        name,
        systemName: systemMatch?.[1]?.split('—')[0]?.trim() ?? name,
        maturity: maturityMatch?.[1]?.trim() ?? 'stub',
        clients:  clientsMatch?.[1]?.split(',').map(s => s.trim()) ?? [],
        subFlowCount: subFlowsMatch.length,
        quirks,
        objects,
        authLines,
      };
    });
}

function loadClientUsage() {
  const projectsDir = path.join(REPO_ROOT, 'projects');
  if (!fs.existsSync(projectsDir)) return [];
  const clients = [];
  for (const dir of fs.readdirSync(projectsDir)) {
    const fullDir = path.join(projectsDir, dir);
    if (!fs.statSync(fullDir).isDirectory()) continue;

    const dj = readJSON(path.join(fullDir, 'decisions.json'));
    const pj = readJSON(path.join(fullDir, 'project.json'));

    // Determine pipeline stage from what files exist
    const hasPrd        = fs.existsSync(path.join(fullDir, 'prd.md'));
    const hasArch       = fs.existsSync(path.join(fullDir, 'architecture.md'));
    const hasDecisions  = !!dj;
    const hasStories    = fs.existsSync(path.join(fullDir, 'stories.md'));
    const stage = hasStories ? 'PM ✓' : hasDecisions ? 'Architect ✓' : hasArch ? 'Architect' : hasPrd ? 'Analyst ✓' : 'Scout ✓';

    clients.push({
      client:     dj?.project?.client ?? pj?.client ?? dir,
      displayName: pj?.displayName ?? dj?.project?.client ?? dir,
      architect:  pj?.architect ?? '—',
      engagementType: pj?.engagementType ?? '—',
      createdAt:  pj?.createdAt ?? '—',
      pattern:    dj?.integration?.primaryPattern ?? '—',
      connectors: dj?.systems?.connectors ?? [],
      security:   dj?.security?.level ?? '—',
      profile:    dj?.scaffold?.profile ?? '—',
      stage,
    });
  }
  return clients;
}

// ─── HTML generation ──────────────────────────────────────────────────────────

function badge(cls, text) {
  return `<span class="badge ${cls}">${text}</span>`;
}

function connectorTable(connectors) {
  let html = `<table id="connectors-table"><thead><tr>
    <th>Connector</th><th>Category</th><th>Version</th><th>Auth</th><th>Verified</th><th>Exchange</th>
  </tr></thead><tbody>`;
  for (const c of connectors) {
    const sc = stalenessClass(c.lastVerified);
    html += `<tr>
      <td><a href="${esc(c.exchangeUrl)}" target="_blank"><strong>${esc(c.displayName)}</strong></a><br><code>${esc(c.key)}</code>${c.note ? `<br><small class="note">${esc(c.note)}</small>` : ''}</td>
      <td>${esc(c.category.replace(/_/g,' '))}</td>
      <td><code>${esc(c.version)}</code></td>
      <td><code>${esc(c.auth)}</code></td>
      <td>${badge(sc, stalenessLabel(c.lastVerified))}</td>
      <td><a href="${esc(c.exchangeUrl)}" target="_blank" class="ext-link">Search ↗</a></td>
    </tr>`;
  }
  return html + '</tbody></table>';
}

function snippetRows(items, tierLabel) {
  return items.map(s => `<tr>
    <td>${badge('tier', tierLabel)}</td>
    <td><code>${esc(s.key)}</code></td>
    <td>${esc(s.description ?? '')}</td>
    <td>${s.autoInject ? badge('fresh','auto') : badge('warn','manual')}</td>
    <td>${badge(stalenessClass(s.lastVerified ?? s.version), stalenessLabel(s.lastVerified ?? null))}</td>
    <td>${(s.usedBy ?? []).length > 0 ? esc((s.usedBy ?? []).join(', ')) : '<em>none yet</em>'}</td>
  </tr>`).join('');
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Full HTML page ───────────────────────────────────────────────────────────

function playbookCard(p) {
  const matClass = (p.maturity === 'verified' || p.maturity === 'promoted-to-standard') ? 'fresh' : 'warn';
  const title = p.name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const clientStr = p.clients.length > 0 ? 'Clients: ' + esc(p.clients.join(', ')) : 'No clients yet';
  const quirksHtml = p.quirks.length > 0
    ? `<ul class="quirk-list">${p.quirks.map(q => `<li>${esc(q)}</li>`).join('')}</ul>`
    : '<p class="no-quirks">No quirks documented yet.</p>';
  const objectsHtml = p.objects.length > 0
    ? `<div class="pb-objects"><span class="pb-label">Supported objects:</span> ${p.objects.map(o => `<code>${esc(o)}</code>`).join(' ')}</div>`
    : '';
  const authHtml = p.authLines.length > 0
    ? `<div class="pb-auth"><span class="pb-label">Auth:</span> ${esc(p.authLines[0])}</div>`
    : '';

  return `<div class="playbook-card" onclick="togglePlaybook(this)">
  <div class="pb-head">
    <div class="pb-head-left">
      <div class="pb-title">${esc(title)}</div>
      <div class="meta">
        ${badge(matClass, p.maturity)}
        &nbsp;·&nbsp; ${p.subFlowCount} sub-flows/transforms
        &nbsp;·&nbsp; ${clientStr}
      </div>
    </div>
    <div class="pb-toggle">▼</div>
  </div>
  <div class="pb-body">
    <div class="pb-section-label">Known Quirks &amp; Learnings</div>
    ${quirksHtml}
    ${objectsHtml}
    ${authHtml}
    <a href="../../playbooks/${esc(p.name)}/PLAYBOOK.md" class="pb-link" onclick="event.stopPropagation()">
      View full playbook →
    </a>
  </div>
</div>`;
}

function buildHtml(connectors, snippets, playbooks, clients) {
  const now = new Date().toISOString().split('T')[0];
  const totalCaps = connectors.length
    + Object.values(snippets).flat().length
    + playbooks.reduce((s, p) => s + p.subFlowCount, 0);

  const navBtns = [
    { id: 'connectors', label: 'Connectors' },
    { id: 'snippets',   label: 'Code Assets' },
    { id: 'playbooks',  label: 'System Playbooks' },
    { id: 'clients',    label: 'Client Usage' },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>DataSkate — MuleSoft BMAD Capabilities</title>
  <style>
    :root {
      --brand:    #ed1c24;
      --brand-dk: #a01019;
      --dark:     #1A1A1A;
      --mid:      #555F6E;
      --light:    #FFF5F5;
      --border:   #E8E0E0;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           font-size: 15px; line-height: 1.6; color: var(--dark); background: #F5F5F5; }

    /* ── Header ── */
    .ds-header { background: var(--dark); color: white; padding: 24px 32px 16px;
                 border-bottom: 3px solid var(--brand); }
    .ds-eyebrow { font-size: 11px; font-weight: 700; text-transform: uppercase;
                  letter-spacing: 1px; color: rgba(255,255,255,0.5); margin-bottom: 10px; }
    .ds-title-block { border-left: 4px solid var(--brand); padding-left: 20px; }
    .ds-title { font-size: 26px; font-weight: 800; line-height: 1.2; }
    .ds-subtitle { font-size: 15px; color: rgba(255,255,255,0.6); margin-top: 4px; }
    .ds-meta { display: flex; gap: 0; background: #111; font-size: 12px;
               color: rgba(255,255,255,0.45); flex-wrap: wrap; }
    .ds-meta span { padding: 8px 20px; border-right: 1px solid rgba(255,255,255,0.08); }

    /* ── Stats ── */
    .stats { display: flex; background: white; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
    .stat { flex: 1; min-width: 80px; text-align: center; padding: 16px 8px;
            cursor: pointer; transition: background 0.15s; border-right: 1px solid var(--border); }
    .stat:last-child { border-right: none; }
    .stat:hover { background: var(--light); }
    .stat .n { font-size: 26px; font-weight: 800; color: var(--brand); }
    .stat .l { font-size: 10px; font-weight: 700; text-transform: uppercase;
               letter-spacing: 0.5px; color: var(--mid); margin-top: 2px; }

    /* ── Nav ── */
    nav { display: flex; background: white; border-bottom: 2px solid var(--border);
          padding: 0 32px; overflow-x: auto; }
    nav button { padding: 13px 20px; border: none; background: none; cursor: pointer;
                 font-size: 14px; font-weight: 500; color: var(--mid);
                 border-bottom: 3px solid transparent; white-space: nowrap;
                 margin-bottom: -2px; transition: color 0.15s; }
    nav button.active { color: var(--brand); border-bottom-color: var(--brand); font-weight: 700; }
    nav button:hover:not(.active) { background: var(--light); color: var(--brand-dk); }

    /* ── Layout ── */
    main { padding: 28px 32px; }
    section { display: none; }
    section.active { display: block; }

    /* ── Section headers ── */
    .section-head { display: flex; align-items: center; gap: 12px;
                    padding-bottom: 12px; border-bottom: 2px solid var(--brand); margin-bottom: 20px; }
    .section-num { width: 32px; height: 32px; border-radius: 50%; background: var(--brand);
                   color: white; display: flex; align-items: center; justify-content: center;
                   font-weight: 800; font-size: 15px; flex-shrink: 0; }
    .section-title { font-size: 18px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; }
    h3 { font-size: 15px; font-weight: 700; margin: 28px 0 12px; color: var(--dark);
         border-bottom: 1px solid var(--border); padding-bottom: 8px; }

    /* ── Tables ── */
    table { width: 100%; border-collapse: collapse; background: white;
            border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
            box-shadow: 0 1px 4px rgba(0,0,0,.06); margin-bottom: 24px; }
    th { background: var(--dark); color: white; font-weight: 600; text-align: left;
         padding: 10px 13px; font-size: 12px; text-transform: uppercase; letter-spacing: .5px; }
    td { padding: 10px 13px; border-bottom: 1px solid var(--border); vertical-align: top; font-size: 13px; }
    tr:last-child td { border-bottom: none; }
    tbody tr:hover td { background: var(--light); }
    code { font-family: 'Courier New', monospace; font-size: 12px;
           background: #f0f0f0; padding: 2px 5px; border-radius: 3px; }

    /* ── Links ── */
    a { color: var(--brand); text-decoration: none; font-weight: 500; }
    a:hover { color: var(--brand-dk); text-decoration: underline; }
    .ext-link { font-size: 12px; white-space: nowrap; }

    /* ── Badges ── */
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px;
             font-size: 11px; font-weight: 700; }
    .badge.fresh { background: #d4edda; color: #155724; }
    .badge.warn  { background: #fff3cd; color: #856404; }
    .badge.stale { background: #f8d7da; color: #721c24; }
    .badge.tier  { background: #e0e7ff; color: #3730a3; }
    .note { color: var(--brand); font-style: italic; font-size: 11px; }

    /* ── Search ── */
    .search { width: 100%; padding: 10px 14px; border: 1.5px solid var(--border);
              border-radius: 6px; font-size: 14px; margin-bottom: 16px; outline: none; }
    .search:focus { border-color: var(--brand); box-shadow: 0 0 0 2px rgba(237,28,36,0.1); }

    /* ── Playbook cards ── */
    .playbook-card { background: white; border-radius: 8px; margin-bottom: 14px;
                     border: 1px solid var(--border); border-left: 4px solid var(--brand);
                     overflow: hidden; cursor: pointer; transition: box-shadow 0.15s; }
    .playbook-card:hover { box-shadow: 0 2px 8px rgba(237,28,36,0.12); }
    .pb-head { display: flex; align-items: center; justify-content: space-between;
               padding: 16px 20px; gap: 12px; }
    .pb-head-left { flex: 1; }
    .pb-title { font-size: 15px; font-weight: 700; color: var(--dark); margin-bottom: 4px; }
    .pb-toggle { font-size: 13px; color: var(--mid); transition: transform 0.2s; flex-shrink: 0; }
    .playbook-card.open .pb-toggle { transform: rotate(180deg); }
    .pb-body { display: none; padding: 0 20px 16px; border-top: 1px solid var(--border); }
    .playbook-card.open .pb-body { display: block; }
    .pb-section-label { font-size: 11px; font-weight: 700; text-transform: uppercase;
                        letter-spacing: 0.5px; color: var(--brand); margin: 14px 0 8px; }
    .quirk-list { list-style: none; padding: 0; margin: 0; }
    .quirk-list li { font-size: 13px; color: var(--dark); padding: 5px 0 5px 16px;
                     border-bottom: 1px solid var(--border); position: relative; }
    .quirk-list li::before { content: '›'; position: absolute; left: 0; color: var(--brand); font-weight: 700; }
    .quirk-list li:last-child { border-bottom: none; }
    .no-quirks { font-size: 13px; color: var(--mid); font-style: italic; padding: 8px 0; }
    .pb-objects, .pb-auth { font-size: 13px; color: var(--dark); margin-top: 10px; }
    .pb-label { font-weight: 700; color: var(--mid); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .pb-link { display: inline-block; margin-top: 14px; font-size: 13px; font-weight: 700;
               color: var(--brand); }
    .pb-link:hover { color: var(--brand-dk); }
    .meta { font-size: 12px; color: var(--mid); }

    /* ── Client cards ── */
    .client-card { background: white; border-radius: 8px; padding: 16px 20px; margin-bottom: 12px;
                   border: 1px solid var(--border); border-left: 4px solid var(--brand);
                   display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
    .cc-main { min-width: 160px; }
    .cc-name { font-size: 16px; font-weight: 800; color: var(--dark); margin-bottom: 4px; }

    /* ── Footer ── */
    footer { text-align: center; padding: 24px; color: var(--mid); font-size: 12px;
             border-top: 1px solid var(--border); margin-top: 32px; }

    @media print {
      .ds-meta, nav, .search, .pb-toggle { display: none !important; }
      .pb-body { display: block !important; }
      body { background: white; }
    }
  </style>
</head>
<body>

<div class="ds-header">
  <div class="ds-eyebrow">DataSkate Integration Intelligence</div>
  <div class="ds-title-block">
    <div class="ds-title">MuleSoft BMAD — Capabilities Registry</div>
    <div class="ds-subtitle">Registered connectors, reusable code assets, system playbooks, and client usage</div>
  </div>
</div>
<div class="ds-meta">
  <span>Generated: ${now}</span>
  <span>Runtime: Mule 4.8.0 / Java 17</span>
  <span>Deployment: CloudHub 2.0</span>
  <span><a href="https://anypoint.mulesoft.com/exchange/" target="_blank" style="color:rgba(255,255,255,0.5)">Anypoint Exchange ↗</a></span>
</div>

<div class="stats">
  <div class="stat" onclick="showTab('connectors')" title="View connectors">
    <div class="n">${connectors.length}</div><div class="l">Connectors</div>
  </div>
  <div class="stat" onclick="showTab('snippets')" title="View code assets">
    <div class="n">${snippets.t1.length}</div><div class="l">T1 Snippets</div>
  </div>
  <div class="stat" onclick="showTab('snippets')" title="View code assets">
    <div class="n">${snippets.t2.length + snippets.t2dwl.length}</div><div class="l">T2 Commons</div>
  </div>
  <div class="stat" onclick="showTab('snippets')" title="View code assets">
    <div class="n">${snippets.t3.length}</div><div class="l">T3 Exchange</div>
  </div>
  <div class="stat" onclick="showTab('playbooks')" title="View playbooks">
    <div class="n">${playbooks.length}</div><div class="l">Playbooks</div>
  </div>
  <div class="stat" onclick="showTab('clients')" title="View client usage">
    <div class="n">${clients.length}</div><div class="l">Clients</div>
  </div>
  <div class="stat" title="Total capabilities">
    <div class="n">${totalCaps}</div><div class="l">Total</div>
  </div>
</div>

<nav>
  ${navBtns.map((b, i) => `<button${i === 0 ? ' class="active"' : ''} onclick="show('${b.id}',this)">${b.label}</button>`).join('\n  ')}
</nav>

<main>

<!-- ── Connectors ── -->
<section id="connectors" class="active">
  <div class="section-head">
    <div class="section-num">1</div>
    <div class="section-title">Connector Registry</div>
  </div>
  <input class="search" type="text" placeholder="Filter by name, category, auth…" oninput="filterTable('connectors-table',this.value)"/>
  ${connectorTable(connectors)}
</section>

<!-- ── Code Assets ── -->
<section id="snippets">
  <div class="section-head">
    <div class="section-num">2</div>
    <div class="section-title">Reusable Code Assets</div>
  </div>

  <h3>Tier 1 — Injectable Snippets (auto-injected at scaffold time)</h3>
  <table id="snippets-table">
    <thead><tr><th>Tier</th><th>Key</th><th>Description</th><th>Injection</th><th>Verified</th><th>Used by</th></tr></thead>
    <tbody>${snippetRows(snippets.t1, 'T1 Snippet')}</tbody>
  </table>

  <h3>Tier 2 — Commons Sub-flows (published to Exchange as mule-plugin)</h3>
  <table>
    <thead><tr><th>Tier</th><th>Key</th><th>Description</th><th>Injection</th><th>Verified</th><th>Used by</th></tr></thead>
    <tbody>${snippetRows(snippets.t2, 'T2 Sub-flow')}</tbody>
  </table>

  <h3>Tier 2 — Commons DWL Modules (import in any DataWeave transform)</h3>
  <table>
    <thead><tr><th>Tier</th><th>Key</th><th>Description</th><th>Import</th><th>Verified</th><th>Used by</th></tr></thead>
    <tbody>${snippets.t2dwl.map(s => `<tr>
      <td>${badge('tier','T2 DWL')}</td>
      <td><code>${esc(s.key)}</code></td>
      <td>${esc(s.description ?? '')}</td>
      <td><code style="font-size:10px">${esc(s.importAs ?? '')}</code></td>
      <td>${badge(stalenessClass(s.lastVerified ?? null), stalenessLabel(s.lastVerified ?? null))}</td>
      <td>${(s.usedBy ?? []).length > 0 ? esc((s.usedBy ?? []).join(', ')) : '<em>none yet</em>'}</td>
    </tr>`).join('')}</tbody>
  </table>

  <h3>Tier 3 — Anypoint Exchange Fragments (canonical schemas, OAS $ref)</h3>
  <table>
    <thead><tr><th>Tier</th><th>Key</th><th>Description</th><th>Injection</th><th>Verified</th><th>Used by</th></tr></thead>
    <tbody>${snippetRows(snippets.t3, 'T3 Exchange')}</tbody>
  </table>
</section>

<!-- ── System Playbooks ── -->
<section id="playbooks">
  <div class="section-head">
    <div class="section-num">3</div>
    <div class="section-title">System Playbooks</div>
  </div>
  <p style="margin-bottom:20px;color:var(--mid);font-size:14px">
    Each playbook captures system-specific quirks, auth patterns, supported objects, and field mappings
    learned across client engagements. Click any card to expand learnings.
  </p>
  ${playbooks.length === 0
    ? '<p style="color:var(--mid);font-style:italic">No playbooks yet.</p>'
    : playbooks.map(playbookCard).join('\n')}
</section>

<!-- ── Client Usage ── -->
<section id="clients">
  <div class="section-head">
    <div class="section-num">4</div>
    <div class="section-title">Client Usage</div>
  </div>
  ${clients.length === 0
    ? '<p style="color:var(--mid);font-style:italic">No client projects found in projects/ folder.</p>'
    : clients.map(c => `<div class="client-card">
      <div class="cc-main">
        <div class="cc-name">${esc(c.displayName)}</div>
        <div class="meta">${badge('tier', c.stage)} &nbsp;·&nbsp; ${esc(c.engagementType)} &nbsp;·&nbsp; Started: ${esc(c.createdAt)}</div>
      </div>
      <div>
        <span class="meta">Architect: <strong>${esc(c.architect)}</strong></span><br>
        ${c.pattern !== '—' ? `<span class="meta">Pattern: ${badge('tier', c.pattern)}</span><br>` : ''}
        ${c.security !== '—' ? `<span class="meta">Security: <code>${esc(c.security)}</code></span>` : ''}
      </div>
      <div>
        ${c.connectors.length > 0 ? `<span class="meta">Connectors: ${c.connectors.map(k => `<code>${esc(k)}</code>`).join(' ')}</span>` : '<span class="meta" style="font-style:italic">No decisions.json yet — still in planning</span>'}
      </div>
    </div>`).join('')}
</section>

</main>

<footer>
  Generated by <a href="../../scaffold/generate-capabilities.js">scaffold/generate-capabilities.js</a> on ${now} ·
  <a href="../../docs/PLANNING_CONTEXT.md">Planning Context</a> ·
  <a href="https://anypoint.mulesoft.com/exchange/" target="_blank">Anypoint Exchange ↗</a>
</footer>

<script>
  function show(id, btn) {
    document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    btn.classList.add('active');
  }
  function showTab(id) {
    const idx = ['connectors','snippets','playbooks','clients'].indexOf(id);
    if (idx < 0) return;
    const btn = document.querySelectorAll('nav button')[idx];
    if (btn) show(id, btn);
  }
  function filterTable(tableId, q) {
    const lq = q.toLowerCase();
    document.querySelectorAll('#' + tableId + ' tbody tr').forEach(r => {
      r.style.display = r.textContent.toLowerCase().includes(lq) ? '' : 'none';
    });
  }
  function togglePlaybook(card) {
    card.classList.toggle('open');
  }
</script>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args    = process.argv.slice(2);
  const outIdx  = args.indexOf('--out');
  const outPath = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : OUT_DEFAULT;

  console.log('Generating capabilities portal...');

  const connectors = loadConnectors();
  const snippets   = loadSnippets();
  const playbooks  = loadPlaybooks();
  const clients    = loadClientUsage();

  console.log(`  Connectors:    ${connectors.length}`);
  console.log(`  Snippets (T1): ${snippets.t1.length}`);
  console.log(`  Commons (T2):  ${snippets.t2.length + snippets.t2dwl.length}`);
  console.log(`  Exchange (T3): ${snippets.t3.length}`);
  console.log(`  Playbooks:     ${playbooks.length}`);
  console.log(`  Clients:       ${clients.length}`);

  const html = buildHtml(connectors, snippets, playbooks, clients);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');

  const rel = path.relative(process.cwd(), outPath);
  console.log(`\n✅ Capabilities portal written to: ${rel}`);
  console.log('   Serve locally: npx serve docs/capabilities/ -p 4000');
  console.log('   GitHub Pages: push docs/ and enable Pages on main branch');
}

main();
