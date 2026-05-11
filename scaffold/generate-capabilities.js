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
      rows.push({
        key,
        category: catKey,
        displayName: conn.displayName ?? key,
        version: conn.version ?? conn.docVersion ?? '—',
        auth: conn.authType ?? '—',
        lastVerified: conn.lastVerified ?? null,
        exchangeUrl: conn.exchangeUrl ?? '#',
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
      const maturityMatch = md.match(/Maturity:\*\*\s+(\w+)/i);
      const clientsMatch  = md.match(/Clients using this playbook:\*\*\s+(.+)/i);
      const subFlowsMatch = [...md.matchAll(/\|\s*`([\w-]+)`\s*\|/g)].map(m => m[1]);
      return {
        name,
        maturity: maturityMatch?.[1] ?? 'observation',
        clients:  clientsMatch?.[1]?.split(',').map(s => s.trim()) ?? [],
        subFlowCount: subFlowsMatch.length,
      };
    });
}

function loadClientUsage() {
  const projectsDir = path.join(REPO_ROOT, 'projects');
  if (!fs.existsSync(projectsDir)) return [];
  const clients = [];
  for (const dir of fs.readdirSync(projectsDir)) {
    const djPath = path.join(projectsDir, dir, 'decisions.json');
    const dj = readJSON(djPath);
    if (!dj) continue;
    clients.push({
      client:    dj.project?.client ?? dir,
      pattern:   dj.integration?.primaryPattern ?? '—',
      connectors: dj.systems?.connectors ?? [],
      security:  dj.security?.level ?? '—',
      profile:   dj.scaffold?.profile ?? '—',
    });
  }
  return clients;
}

// ─── HTML generation ──────────────────────────────────────────────────────────

function badge(cls, text) {
  return `<span class="badge ${cls}">${text}</span>`;
}

function connectorTable(connectors) {
  let html = `<table><thead><tr>
    <th>Connector</th><th>Category</th><th>Version</th><th>Auth</th><th>Verified</th><th>Links</th>
  </tr></thead><tbody>`;
  for (const c of connectors) {
    const sc = stalenessClass(c.lastVerified);
    html += `<tr>
      <td><strong>${esc(c.displayName)}</strong><br><code>${esc(c.key)}</code>${c.note ? `<br><small class="note">${esc(c.note)}</small>` : ''}</td>
      <td>${esc(c.category.replace(/_/g,' '))}</td>
      <td><code>${esc(c.version)}</code></td>
      <td>${esc(c.auth)}</td>
      <td>${badge(sc, stalenessLabel(c.lastVerified))}</td>
      <td><a href="${esc(c.exchangeUrl)}" target="_blank">Exchange ↗</a></td>
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

function buildHtml(connectors, snippets, playbooks, clients) {
  const now = new Date().toISOString().split('T')[0];
  const totalCaps = connectors.length
    + Object.values(snippets).flat().length
    + playbooks.reduce((s, p) => s + p.subFlowCount, 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>MuleSoft BMAD — Capabilities Registry</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
           font-size: 14px; color: #1a1a1a; background: #f5f7fa; }
    header { background: #0067b8; color: white; padding: 20px 32px; }
    header h1 { font-size: 22px; font-weight: 600; }
    header p  { font-size: 13px; opacity: 0.8; margin-top: 4px; }
    .stats { display: flex; gap: 24px; padding: 16px 32px; background: white;
             border-bottom: 1px solid #e0e0e0; flex-wrap: wrap; }
    .stat { text-align: center; }
    .stat .n { font-size: 28px; font-weight: 700; color: #0067b8; }
    .stat .l { font-size: 12px; color: #666; }
    nav { display: flex; gap: 0; background: white; border-bottom: 2px solid #0067b8;
          padding: 0 32px; overflow-x: auto; }
    nav button { padding: 12px 20px; border: none; background: none; cursor: pointer;
                 font-size: 14px; color: #444; border-bottom: 3px solid transparent;
                 white-space: nowrap; margin-bottom: -2px; }
    nav button.active { color: #0067b8; border-bottom-color: #0067b8; font-weight: 600; }
    nav button:hover:not(.active) { background: #f0f4ff; }
    main { padding: 24px 32px; }
    section { display: none; }
    section.active { display: block; }
    h2 { font-size: 18px; margin-bottom: 16px; color: #222; }
    h3 { font-size: 15px; margin: 20px 0 10px; color: #333; border-bottom: 1px solid #eee; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; background: white;
            border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    th { background: #f0f4ff; font-weight: 600; text-align: left; padding: 10px 12px;
         font-size: 12px; text-transform: uppercase; letter-spacing: .5px; color: #555; }
    td { padding: 10px 12px; border-top: 1px solid #f0f0f0; vertical-align: top; }
    tr:hover td { background: #fafcff; }
    code { font-family: 'Courier New', monospace; font-size: 12px;
           background: #f0f0f0; padding: 2px 5px; border-radius: 3px; }
    a { color: #0067b8; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px;
             font-size: 11px; font-weight: 600; }
    .badge.fresh { background: #d4edda; color: #155724; }
    .badge.warn  { background: #fff3cd; color: #856404; }
    .badge.stale { background: #f8d7da; color: #721c24; }
    .badge.tier  { background: #e0e7ff; color: #3730a3; }
    .note { color: #e74c3c; font-style: italic; }
    .search { width: 100%; padding: 10px 14px; border: 1px solid #ddd; border-radius: 6px;
              font-size: 14px; margin-bottom: 16px; }
    .playbook-card { background: white; border-radius: 8px; padding: 20px 24px; margin-bottom: 16px;
                     box-shadow: 0 1px 3px rgba(0,0,0,.08); border-left: 4px solid #0067b8; }
    .playbook-card h3 { margin: 0 0 8px; border: none; padding: 0; }
    .meta { font-size: 12px; color: #666; }
    .client-card { background: white; border-radius: 8px; padding: 16px 20px; margin-bottom: 12px;
                   box-shadow: 0 1px 3px rgba(0,0,0,.08); display: flex; gap: 24px; flex-wrap: wrap; }
    .client-card strong { font-size: 16px; }
    footer { text-align: center; padding: 24px; color: #888; font-size: 12px; border-top: 1px solid #eee; margin-top: 32px; }
  </style>
</head>
<body>

<header>
  <h1>MuleSoft BMAD — Capabilities Registry</h1>
  <p>All registered connectors, reusable code assets, playbooks, and client usage. Generated ${now}.</p>
</header>

<div class="stats">
  <div class="stat"><div class="n">${connectors.length}</div><div class="l">Connectors</div></div>
  <div class="stat"><div class="n">${snippets.t1.length}</div><div class="l">Snippets (Tier 1)</div></div>
  <div class="stat"><div class="n">${snippets.t2.length + snippets.t2dwl.length}</div><div class="l">Commons Assets (Tier 2)</div></div>
  <div class="stat"><div class="n">${snippets.t3.length}</div><div class="l">Exchange Fragments (Tier 3)</div></div>
  <div class="stat"><div class="n">${playbooks.length}</div><div class="l">System Playbooks</div></div>
  <div class="stat"><div class="n">${clients.length}</div><div class="l">Active Clients</div></div>
  <div class="stat"><div class="n">${totalCaps}</div><div class="l">Total Capabilities</div></div>
</div>

<nav>
  <button class="active" onclick="show('connectors',this)">Connectors</button>
  <button onclick="show('snippets',this)">Code Assets</button>
  <button onclick="show('playbooks',this)">System Playbooks</button>
  <button onclick="show('clients',this)">Client Usage</button>
</nav>

<main>

<!-- ── Connectors ────────────────────────────────────────────────────────── -->
<section id="connectors" class="active">
  <h2>Connector Registry</h2>
  <input class="search" type="text" placeholder="Filter connectors…" oninput="filterTable('connectors-table',this.value)"/>
  ${connectorTable(connectors)}
</section>

<!-- ── Code Assets ───────────────────────────────────────────────────────── -->
<section id="snippets">
  <h2>Reusable Code Assets</h2>

  <h3>Tier 1 — Injectable Snippets (auto-injected at scaffold time)</h3>
  <table id="snippets-table">
    <thead><tr><th>Tier</th><th>Key</th><th>Description</th><th>Injection</th><th>Verified</th><th>Used by</th></tr></thead>
    <tbody>
      ${snippetRows(snippets.t1, 'T1 Snippet')}
    </tbody>
  </table>

  <h3>Tier 2 — Commons Library Sub-flows (published to Exchange as mule-plugin)</h3>
  <table>
    <thead><tr><th>Tier</th><th>Key</th><th>Description</th><th>Injection</th><th>Verified</th><th>Used by</th></tr></thead>
    <tbody>
      ${snippetRows(snippets.t2, 'T2 Sub-flow')}
    </tbody>
  </table>

  <h3>Tier 2 — Commons DWL Modules (import in any DataWeave transform)</h3>
  <table>
    <thead><tr><th>Tier</th><th>Key</th><th>Description</th><th>Import</th><th>Verified</th><th>Used by</th></tr></thead>
    <tbody>
      ${snippets.t2dwl.map(s => `<tr>
        <td>${badge('tier','T2 DWL')}</td>
        <td><code>${esc(s.key)}</code></td>
        <td>${esc(s.description ?? '')}</td>
        <td><code style="font-size:10px">${esc(s.importAs ?? '')}</code></td>
        <td>${badge(stalenessClass(s.lastVerified ?? null), stalenessLabel(s.lastVerified ?? null))}</td>
        <td>${(s.usedBy ?? []).length > 0 ? esc((s.usedBy ?? []).join(', ')) : '<em>none yet</em>'}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <h3>Tier 3 — Anypoint Exchange Fragments (canonical schemas, OAS $ref)</h3>
  <table>
    <thead><tr><th>Tier</th><th>Key</th><th>Description</th><th>Injection</th><th>Verified</th><th>Used by</th></tr></thead>
    <tbody>
      ${snippetRows(snippets.t3, 'T3 Exchange')}
    </tbody>
  </table>
</section>

<!-- ── System Playbooks ───────────────────────────────────────────────────── -->
<section id="playbooks">
  <h2>System-Pair Integration Playbooks</h2>
  <p style="margin-bottom:16px;color:#555">
    Each playbook is a pre-built, tested integration pattern for a specific system pair.
    New clients using the same system pair reuse the playbook — only business-rule TODOs remain.
  </p>
  ${playbooks.length === 0
    ? '<p><em>No playbooks yet. Run a project with a known system pair to create the first playbook.</em></p>'
    : playbooks.map(p => `
    <div class="playbook-card">
      <h3>${esc(p.name.replace(/-/g, ' → ').replace(/\b\w/g, c => c.toUpperCase()))}</h3>
      <div class="meta">
        ${badge(p.maturity === 'verified' ? 'fresh' : p.maturity === 'promoted-to-standard' ? 'fresh' : 'warn', p.maturity)}
        &nbsp;
        ${p.subFlowCount} reusable sub-flows/transforms
        &nbsp;·&nbsp;
        ${p.clients.length > 0 ? 'Clients: ' + esc(p.clients.join(', ')) : 'No clients yet'}
      </div>
      <p style="margin-top:8px;font-size:13px">
        See <code>playbooks/${esc(p.name)}/PLAYBOOK.md</code> for full details,
        quirks, and customisation guide.
      </p>
    </div>`).join('')}
</section>

<!-- ── Client Usage ───────────────────────────────────────────────────────── -->
<section id="clients">
  <h2>Client Usage</h2>
  ${clients.length === 0
    ? '<p><em>No client projects found in projects/ folder.</em></p>'
    : clients.map(c => `
    <div class="client-card">
      <div>
        <strong>${esc(c.client)}</strong><br>
        <span class="meta">Pattern: ${badge('tier', c.pattern)}</span>
      </div>
      <div>
        <span class="meta">Security: ${esc(c.security)}</span><br>
        <span class="meta">Profile: ${esc(c.profile)}</span>
      </div>
      <div>
        <span class="meta">Connectors: ${c.connectors.map(k => `<code>${esc(k)}</code>`).join(' ')}</span>
      </div>
    </div>`).join('')}
</section>

</main>

<footer>
  Generated by <code>scaffold/generate-capabilities.js</code> on ${now} ·
  <a href="../PLANNING_CONTEXT.md">Planning Context</a> ·
  <a href="https://anypoint.mulesoft.com/exchange/" target="_blank">Anypoint Exchange ↗</a>
</footer>

<script>
  function show(id, btn) {
    document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    btn.classList.add('active');
  }
  function filterTable(tableId, q) {
    const lq = q.toLowerCase();
    const rows = document.querySelectorAll('#' + tableId + ' tbody tr');
    rows.forEach(r => r.style.display = r.textContent.toLowerCase().includes(lq) ? '' : 'none');
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
