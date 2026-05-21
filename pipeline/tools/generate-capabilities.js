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
 *   standards/playbooks/{system}/{system}_playbook.md         — system playbooks
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
  const playbooksDir = path.join(REPO_ROOT, 'standards', 'playbooks');
  if (!fs.existsSync(playbooksDir)) return [];
  return fs.readdirSync(playbooksDir)
    .filter(d => fs.statSync(path.join(playbooksDir, d)).isDirectory())
    .map(name => {
      const jsonPath = path.join(playbooksDir, name, `${name}_playbook.json`);
      let pb = {};
      try { pb = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch {}

      const quirks = (pb.knownQuirks ?? [])
        .map(q => q.replace(/\*\*([^*]+)\*\*:\s*/g, '$1: '))
        .map(q => q.length > 160 ? q.slice(0, 157) + '…' : q)
        .slice(0, 5);

      // Count DWL/XML sub-flow files in the system folder
      const subFlowCount = (() => {
        try {
          return fs.readdirSync(path.join(playbooksDir, name), { recursive: true })
            .filter(f => f.endsWith('.dwl') || f.endsWith('.xml')).length;
        } catch { return 0; }
      })();

      return {
        name,
        systemName: pb.displayName ?? name,
        maturity:   pb.maturity ?? 'stub',
        clients:    pb.clients ?? [],
        subFlowCount,
        quirks,
        objects:    [],
        authLines:  [],
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
    <a href="../../standards/playbooks/${esc(p.name)}/${esc(p.name)}_playbook.json" class="pb-link" onclick="event.stopPropagation()">
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
      --green:    #2E9E6B;
      --amber:    #D69E2E;
      --amber-bg: #FFFBEB;
      --blue-bg:  #F0F6FF;
      --blue-br:  #3B82F6;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           font-size: 15px; line-height: 1.6; color: var(--dark); background: #fff; }

    /* ── Header ── */
    .ds-header { background: #fff; padding: 24px 32px 0;
                 border-bottom: 3px solid var(--brand); }
    .ds-header-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .ds-eyebrow { font-size: 11px; font-weight: 700; text-transform: uppercase;
                  letter-spacing: 1px; color: var(--brand-dk); margin-bottom: 10px; }
    .ds-title-block { border-left: 4px solid var(--brand); padding-left: 20px; }
    .ds-title { font-size: 26px; font-weight: 800; line-height: 1.2; color: var(--dark); }
    .ds-subtitle { font-size: 15px; color: var(--mid); margin-top: 4px; }
    .ds-meta { display: flex; gap: 0; border-top: 1px solid var(--border); font-size: 12px;
               color: var(--mid); flex-wrap: wrap; margin: 16px -32px 0; padding: 0 32px; }
    .ds-meta span { padding: 8px 20px 8px 0; margin-right: 20px; border-right: 1px solid var(--border); }
    .ds-meta span:last-child { border-right: none; }

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
    .section-num { font-size: 11px; font-weight: 700; color: var(--brand);
                   text-transform: uppercase; letter-spacing: 0.5px; flex-shrink: 0; }
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
  <div class="ds-header-brand">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="140 258 590 96" style="height:28px;width:auto;display:block;" aria-label="DataSkate">
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
  <div class="ds-eyebrow">DataSkate Integration Intelligence</div>
  <div class="ds-title-block">
    <div class="ds-title">MuleSoft BMAD — Capabilities Registry</div>
    <div class="ds-subtitle">Registered connectors, reusable code assets, system playbooks, and client usage</div>
  </div>
  <div class="ds-meta">
    <span>Generated: ${now}</span>
    <span>Runtime: Mule 4.8.0 / Java 17</span>
    <span>Deployment: CloudHub 2.0</span>
    <span><a href="https://anypoint.mulesoft.com/exchange/" target="_blank">Anypoint Exchange ↗</a></span>
  </div>
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
