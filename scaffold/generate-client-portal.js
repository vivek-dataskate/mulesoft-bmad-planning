#!/usr/bin/env node
'use strict';
/**
 * scaffold/generate-client-portal.js
 *
 * Generates firebase/public/portal/{client}.html for every client
 * that has a project.json. Shows engagement phase, document links,
 * intake response status, and a live sprint status board parsed from
 * stories.md when available.
 *
 * Usage:
 *   node scaffold/generate-client-portal.js              # all clients
 *   node scaffold/generate-client-portal.js zyris        # one client
 */

const fs      = require('fs');
const path    = require('path');
const https   = require('https');

const REPO_ROOT    = path.resolve(__dirname, '..');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_DEPLOY_TOKEN || null;
const PUBLIC    = path.join(REPO_ROOT, 'firebase', 'public');
const PORTAL    = 'https://dataskateclients.web.app';

// ── DataSkate SVG logo (inline) ───────────────────────────────────────────────
const DS_LOGO = `<svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" rx="12" fill="#ed1c24"/>
  <text x="50" y="72" font-family="Arial Black,Arial,sans-serif" font-size="62" font-weight="900" fill="white" text-anchor="middle">D</text>
</svg>`;

// ── Phase config ──────────────────────────────────────────────────────────────
const PHASES = ['Discovery', 'Requirements', 'Build', 'Testing', 'Go Live'];

function statusToPhase(status) {
  const s = (status || '').toLowerCase();
  if (s === 'live')                                     return { done: 5, active: 4 };
  if (s === 'testing')                                  return { done: 3, active: 3 };
  if (s === 'dev' || s === 'development')               return { done: 2, active: 2 };
  if (s === 'architecture_ready' || s === 'prd_ready')  return { done: 1, active: 1 };
  if (s === 'intake_complete')                          return { done: 0, active: 1 };
  return { done: 0, active: 0 }; // intake_sent, scoping, default
}

// ── Stories.md parser ─────────────────────────────────────────────────────────
function parseStories(md) {
  const epics = [];
  let currentEpic = null;
  let currentStory = null;

  const flush = () => {
    if (currentStory && currentEpic) currentEpic.stories.push(currentStory);
    currentStory = null;
  };

  for (const raw of md.split('\n')) {
    const line = raw.trim();

    const epicM = line.match(/^##\s+(?:epic\s+)?(\d+)[:\.\s–—-]+(.+)/i);
    if (epicM) {
      flush();
      if (currentEpic) epics.push(currentEpic);
      currentEpic = { id: epicM[1], title: epicM[2].trim(), stories: [] };
      continue;
    }

    const storyM = line.match(/^###\s+(?:story\s+)?([\d.]+)[:\.\s–—-]+(.+)/i);
    if (storyM) {
      flush();
      if (currentEpic) {
        currentStory = { id: storyM[1], title: storyM[2].trim(), status: 'Planned', description: '' };
      }
      continue;
    }

    if (!currentStory) continue;

    const statusM = line.match(/\*?\*?status\*?\*?[:\s]+(.+)/i);
    if (statusM) { currentStory.status = statusM[1].replace(/\*+/g, '').trim(); continue; }

    const descM = line.match(/\*?\*?description\*?\*?[:\s]+(.+)/i);
    if (descM && !currentStory.description) {
      currentStory.description = descM[1].replace(/\*+/g, '').trim();
    }
  }

  flush();
  if (currentEpic) epics.push(currentEpic);
  return epics.filter(e => e.stories.length > 0);
}

// ── GitHub API fetch (used to pull stories.md from client dev repo) ───────────
function fetchFromGitHub(owner, repo, filePath) {
  return new Promise((resolve) => {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    const headers = { 'User-Agent': 'dataskate-portal', 'Accept': 'application/vnd.github.v3+json' };
    if (GITHUB_TOKEN) headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    https.get(url, { headers }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode !== 200) { resolve(null); return; }
        try {
          const json    = JSON.parse(body);
          const content = Buffer.from(json.content, 'base64').toString('utf8');
          resolve(content);
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function parseRepoSlug(repoUrl) {
  if (!repoUrl) return null;
  const m = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.\s]+)/);
  return m ? { owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
}

function normalizeStatus(raw) {
  const s = (raw || '').toLowerCase().trim();
  if (s === 'done' || s === 'complete' || s === 'completed') return 'Done';
  if (s.includes('progress') || s === 'active' || s === 'wip') return 'In Progress';
  if (s === 'review' || s === 'in review') return 'Review';
  return 'Planned';
}

// ── Stat helpers ──────────────────────────────────────────────────────────────
function storyStats(epics) {
  let done = 0, active = 0, review = 0, planned = 0;
  for (const e of epics) {
    for (const s of e.stories) {
      const st = normalizeStatus(s.status);
      if (st === 'Done') done++;
      else if (st === 'In Progress') active++;
      else if (st === 'Review') review++;
      else planned++;
    }
  }
  return { done, active, review, planned, total: done + active + review + planned };
}

// ── HTML generator ────────────────────────────────────────────────────────────
function renderPhaseBar(status) {
  const { done, active } = statusToPhase(status);
  return PHASES.map((label, i) => {
    const cls = i < done ? 'phase-done' : i === active ? 'phase-active' : 'phase-future';
    return `<div class="phase-step ${cls}">
      <div class="phase-dot"></div>
      <div class="phase-label">${label}</div>
    </div>`;
  }).join('<div class="phase-line"></div>');
}

function renderStatusChip(raw) {
  const st = normalizeStatus(raw);
  const cls = { Done: 'chip-done', 'In Progress': 'chip-active', Review: 'chip-review', Planned: 'chip-planned' }[st];
  const icon = { Done: '✓', 'In Progress': '▶', Review: '↺', Planned: '○' }[st];
  return `<span class="chip ${cls}">${icon} ${st}</span>`;
}

function renderEpicProgress(stories) {
  const total = stories.length;
  const done  = stories.filter(s => normalizeStatus(s.status) === 'Done').length;
  const pct   = total ? Math.round((done / total) * 100) : 0;
  return `<div class="epic-progress">
    <div class="epic-bar"><div class="epic-bar-fill" style="width:${pct}%"></div></div>
    <span class="epic-pct">${pct}%</span>
  </div>`;
}

function renderSprintBoard(epics) {
  if (!epics || epics.length === 0) {
    return `<div class="sprint-empty">
      <div class="sprint-empty-icon">📋</div>
      <div class="sprint-empty-title">Sprint planning not yet started</div>
      <div class="sprint-empty-body">Stories and epics will appear here once your project moves into the Build phase.</div>
    </div>`;
  }

  const stats = storyStats(epics);
  const statBar = `<div class="sprint-stats">
    <div class="sprint-stat"><span class="sn sn-total">${stats.total}</span><span class="sl">Total Stories</span></div>
    <div class="sprint-stat"><span class="sn sn-done">${stats.done}</span><span class="sl">Done</span></div>
    <div class="sprint-stat"><span class="sn sn-active">${stats.active}</span><span class="sl">In Progress</span></div>
    <div class="sprint-stat"><span class="sn sn-review">${stats.review}</span><span class="sl">Review</span></div>
    <div class="sprint-stat"><span class="sn sn-planned">${stats.planned}</span><span class="sl">Planned</span></div>
  </div>`;

  const epicBlocks = epics.map((epic, i) => {
    const stories = epic.stories.map(s => `
      <div class="story-row">
        <span class="story-id">S${s.id}</span>
        <span class="story-title">${escHtml(s.title)}</span>
        ${renderStatusChip(s.status)}
        ${s.description ? `<span class="story-desc">${escHtml(s.description)}</span>` : ''}
      </div>`).join('');

    return `<details class="epic-block" ${i === 0 ? 'open' : ''}>
      <summary class="epic-header">
        <span class="epic-num">Epic ${epic.id}</span>
        <span class="epic-title">${escHtml(epic.title)}</span>
        ${renderEpicProgress(epic.stories)}
        <span class="epic-count">${epic.stories.length} stories</span>
      </summary>
      <div class="epic-stories">${stories}</div>
    </details>`;
  }).join('');

  return statBar + epicBlocks;
}

function renderDocCard(icon, title, subtitle, href, status) {
  // status: 'available' | 'pending' | 'na'
  const cls = { available: 'doc-available', pending: 'doc-pending', na: 'doc-na' }[status] || 'doc-na';
  const content = href
    ? `<a href="${href}" target="_blank" class="doc-card ${cls}">
        <div class="doc-icon">${icon}</div>
        <div class="doc-info"><div class="doc-title">${title}</div><div class="doc-sub">${subtitle}</div></div>
        <div class="doc-arrow">↗</div>
      </a>`
    : `<div class="doc-card ${cls}">
        <div class="doc-icon">${icon}</div>
        <div class="doc-info"><div class="doc-title">${title}</div><div class="doc-sub">${subtitle}</div></div>
      </div>`;
  return content;
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Minimal Markdown → HTML renderer (headings, bold, lists, paragraphs) ──────
function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let inList = false;

  const flushList = () => { if (inList) { out.push('</ul>'); inList = false; } };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (/^######\s/.test(line)) { flushList(); out.push(`<h6>${escHtml(line.replace(/^#{6}\s+/, ''))}</h6>`); continue; }
    if (/^#####\s/.test(line))  { flushList(); out.push(`<h5>${escHtml(line.replace(/^#{5}\s+/, ''))}</h5>`); continue; }
    if (/^####\s/.test(line))   { flushList(); out.push(`<h4>${escHtml(line.replace(/^#{4}\s+/, ''))}</h4>`); continue; }
    if (/^###\s/.test(line))    { flushList(); out.push(`<h3>${escHtml(line.replace(/^#{3}\s+/, ''))}</h3>`); continue; }
    if (/^##\s/.test(line))     { flushList(); out.push(`<h2>${escHtml(line.replace(/^#{2}\s+/, ''))}</h2>`); continue; }
    if (/^#\s/.test(line))      { flushList(); out.push(`<h1>${escHtml(line.replace(/^#\s+/, ''))}</h1>`); continue; }

    if (/^[-*]\s/.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inlineMd(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      flushList(); out.push('<ol>'); inList = true;
      out.push(`<li>${inlineMd(line.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }

    flushList();
    if (line === '' || line === '---') { out.push('<br>'); continue; }
    out.push(`<p>${inlineMd(line)}</p>`);
  }

  flushList();
  return out.join('\n');
}

function inlineMd(text) {
  return escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function renderDocPage(mdContent, title, clientName, architect, archEmail) {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${escHtml(title)} — ${escHtml(clientName)}</title>
<style>
:root{--brand:#ed1c24;--dark:#1A1A1A;--mid:#555F6E;--border:#E8E0E0;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.7;color:var(--dark);background:#F5F5F5;}
.header{background:var(--dark);color:white;padding:20px 40px 16px;border-bottom:3px solid var(--brand);}
.header-top{display:flex;align-items:center;gap:12px;margin-bottom:8px;}
.back{font-size:12px;color:rgba(255,255,255,.5);text-decoration:none;}
.back:hover{color:white;}
.doc-title{font-size:22px;font-weight:800;border-left:4px solid var(--brand);padding-left:14px;}
.doc-meta{font-size:12px;color:rgba(255,255,255,.4);padding-left:18px;margin-top:2px;}
.wrap{max-width:820px;margin:0 auto;padding:40px 40px 80px;background:white;min-height:calc(100vh - 80px);}
h1{font-size:22px;font-weight:800;margin:32px 0 10px;padding-bottom:8px;border-bottom:2px solid var(--brand);}
h2{font-size:18px;font-weight:700;margin:28px 0 8px;color:var(--dark);}
h3{font-size:15px;font-weight:700;margin:20px 0 6px;color:var(--dark);}
h4,h5,h6{font-size:13px;font-weight:700;margin:16px 0 4px;color:var(--mid);}
p{margin:6px 0;font-size:14px;}
ul,ol{margin:8px 0 8px 20px;}
li{font-size:14px;margin:3px 0;}
code{font-family:monospace;font-size:12px;background:#F3F4F6;padding:2px 5px;border-radius:3px;}
strong{font-weight:700;}
@media(max-width:600px){.wrap{padding:24px 20px 60px;}.header{padding:16px 20px;}}
</style>
</head><body>
<div class="header">
  <div class="header-top">
    <a class="back" href="../${escHtml(clientName.toLowerCase().replace(/\s+/g,'-'))}.html">← Back to Portal</a>
  </div>
  <div class="doc-title">${escHtml(title)}</div>
  <div class="doc-meta">${escHtml(clientName)} · Architect: ${escHtml(architect)}</div>
</div>
<div class="wrap">${mdToHtml(mdContent)}</div>
</body></html>`;
}

// ── Per-client builder ────────────────────────────────────────────────────────
async function buildPortal(slug) {
  const projectDir = path.join(REPO_ROOT, 'projects', slug);
  const projFile   = path.join(projectDir, 'project.json');
  if (!fs.existsSync(projFile)) return null;

  const proj          = JSON.parse(fs.readFileSync(projFile, 'utf8'));
  const displayName   = proj.displayName || slug;
  const architect     = proj.architect     || 'DataSkate Team';
  const archEmail     = proj.architectEmail || 'kailash@dataskate.ai';
  const targetGoLive  = proj.targetGoLive  || 'TBD';
  const createdAt     = proj.createdAt     || '';

  // ── Load manifest for status + URLs ──
  const manifestFile = path.join(PUBLIC, 'projects-manifest.json');
  let manifest = [];
  if (fs.existsSync(manifestFile)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch {}
  }
  const entry = manifest.find(m => m.id === slug) || {};
  const status    = entry.status     || 'intake_sent';
  const intakeUrl = entry.intakeUrl  || null;
  const proposalUrl = entry.proposalUrl || null;

  // ── Responses ──
  const responsesFile = path.join(projectDir, 'intake', 'responses.json');
  let responsesStatus = 'pending', responsesDate = null;
  if (fs.existsSync(responsesFile)) {
    try {
      const r = JSON.parse(fs.readFileSync(responsesFile, 'utf8'));
      responsesStatus = 'available';
      responsesDate   = r.submittedAt || r.timestamp || null;
    } catch {}
  }

  // ── Scoping files ──
  const scopingDir = path.join(projectDir, 'scoping');
  const scopingCount = fs.existsSync(scopingDir)
    ? fs.readdirSync(scopingDir).filter(f => !f.startsWith('.')).length
    : 0;

  // ── Decisions / dev repo ──
  const decisionsFile = path.join(projectDir, 'decisions.json');
  let devRepoUrl = null;
  if (fs.existsSync(decisionsFile)) {
    try {
      const d = JSON.parse(fs.readFileSync(decisionsFile, 'utf8'));
      devRepoUrl = d.repoUrl || d.devRepo || null;
    } catch {}
  }

  // ── Source files link ──
  const sourceFilesUrl = proj.sourceFilesFolder || null;

  // ── Planning docs (PRD, architecture, stories for display) ──
  const docsOutDir  = path.join(PUBLIC, 'portal', 'docs', slug);
  const docPortalBase = `${PORTAL}/portal/docs/${slug}`;
  const planningDocs = [
    { file: 'prd.md',           label: 'Product Requirements',  icon: '📝', outName: 'prd.html' },
    { file: 'architecture.md',  label: 'Architecture Design',   icon: '🏗️', outName: 'architecture.html' },
    { file: 'stories.md',       label: 'Epics & Stories',       icon: '🗂️', outName: 'stories.html' },
  ];
  const docLinks = {};
  for (const doc of planningDocs) {
    const srcFile = path.join(projectDir, doc.file);
    if (fs.existsSync(srcFile)) {
      fs.mkdirSync(docsOutDir, { recursive: true });
      const mdContent = fs.readFileSync(srcFile, 'utf8');
      const docHtml   = renderDocPage(mdContent, doc.label, displayName, architect, archEmail);
      fs.writeFileSync(path.join(docsOutDir, doc.outName), docHtml);
      docLinks[doc.file] = `${docPortalBase}/${doc.outName}`;
    }
  }

  // ── Stories — fetch from client dev repo first, fall back to planning repo ──
  let storiesMd = null;
  const repoSlug = parseRepoSlug(devRepoUrl);
  if (repoSlug && GITHUB_TOKEN) {
    storiesMd = await fetchFromGitHub(repoSlug.owner, repoSlug.repo, 'stories.md');
    if (storiesMd) console.log(`     fetched stories.md from ${repoSlug.owner}/${repoSlug.repo}`);
  }
  if (!storiesMd) {
    const localStories = path.join(projectDir, 'stories.md');
    if (fs.existsSync(localStories)) storiesMd = fs.readFileSync(localStories, 'utf8');
  }
  let epics = [];
  if (storiesMd) {
    try { epics = parseStories(storiesMd); } catch {}
    // Also write the stories doc page from wherever we got it
    if (!docLinks['stories.md'] && storiesMd) {
      fs.mkdirSync(docsOutDir, { recursive: true });
      const docHtml = renderDocPage(storiesMd, 'Epics & Stories', displayName, architect, archEmail);
      fs.writeFileSync(path.join(docsOutDir, 'stories.html'), docHtml);
      docLinks['stories.md'] = `${docPortalBase}/stories.html`;
    }
  }

  const lastUpdated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // ── HTML ──────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DataSkate × ${escHtml(displayName)} — Engagement Portal</title>
<style>
:root {
  --brand:#ed1c24; --brand-dk:#a01019; --dark:#1A1A1A; --mid:#555F6E;
  --light:#FFF5F5; --border:#E8E0E0; --green:#059669; --amber:#D97706;
  --blue:#2563EB; --gray:#6B7280;
}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.6;color:var(--dark);background:#F5F5F5;}
a{color:var(--brand);text-decoration:none;}

/* ── HEADER ── */
.header{background:var(--dark);color:white;padding:24px 40px 20px;border-bottom:3px solid var(--brand);}
.header-top{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;flex-wrap:wrap;}
.header-brand{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
.header-eyebrow{font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.45);}
.header-client{font-size:28px;font-weight:900;line-height:1.15;border-left:4px solid var(--brand);padding-left:16px;margin-top:4px;}
.header-sub{font-size:13px;color:rgba(255,255,255,0.5);padding-left:20px;margin-top:2px;}
.arch-badge{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:12px 16px;min-width:200px;}
.arch-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.4);margin-bottom:4px;}
.arch-name{font-size:14px;font-weight:700;color:white;}
.arch-email{font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px;}
.arch-email a{color:rgba(255,255,255,0.6);}
.header-meta{display:flex;gap:0;background:#111;font-size:12px;color:rgba(255,255,255,0.4);flex-wrap:wrap;margin:0 -40px;padding:0 40px;}
.header-meta span{padding:8px 24px 8px 0;margin-right:24px;border-right:1px solid rgba(255,255,255,0.07);}
.header-meta span:last-child{border-right:none;}

/* ── LAYOUT ── */
.container{max-width:1100px;margin:0 auto;padding:32px 40px 80px;}

/* ── SECTION ── */
.section{background:white;border:1px solid var(--border);border-radius:10px;margin-bottom:24px;overflow:hidden;}
.section-head{padding:16px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;}
.section-num{width:26px;height:26px;border-radius:50%;background:var(--brand);color:white;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.section-title{font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:1px;}
.section-body{padding:24px;}

/* ── PHASE BAR ── */
.phase-bar{display:flex;align-items:center;padding:20px 24px;}
.phase-step{display:flex;flex-direction:column;align-items:center;gap:6px;flex-shrink:0;}
.phase-dot{width:20px;height:20px;border-radius:50%;border:2px solid var(--border);}
.phase-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--mid);white-space:nowrap;}
.phase-line{flex:1;height:2px;background:var(--border);min-width:24px;}
.phase-done .phase-dot{background:var(--green);border-color:var(--green);}
.phase-done .phase-label{color:var(--green);}
.phase-active .phase-dot{background:var(--brand);border-color:var(--brand);box-shadow:0 0 0 4px rgba(237,28,36,.15);}
.phase-active .phase-label{color:var(--brand);font-weight:800;}
.phase-future .phase-dot{background:#F3F4F6;border-color:#D1D5DB;}

/* ── DOC CARDS ── */
.doc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;}
.doc-card{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1.5px solid var(--border);border-radius:8px;transition:border-color .15s,box-shadow .15s;cursor:default;}
a.doc-card{cursor:pointer;}
a.doc-card:hover{border-color:var(--brand);box-shadow:0 2px 8px rgba(237,28,36,.1);}
.doc-available{border-color:#A7F3D0;}
.doc-pending{border-color:#FDE68A;background:#FFFBEB;}
.doc-na{border-color:var(--border);background:#FAFAFA;}
.doc-icon{font-size:22px;flex-shrink:0;}
.doc-info{flex:1;min-width:0;}
.doc-title{font-size:13px;font-weight:700;color:var(--dark);}
.doc-sub{font-size:11px;color:var(--mid);margin-top:1px;}
.doc-arrow{font-size:16px;color:var(--brand);flex-shrink:0;}
.doc-na .doc-title{color:var(--mid);}

/* ── SPRINT STATS ── */
.sprint-stats{display:flex;gap:0;border-bottom:1px solid var(--border);flex-wrap:wrap;}
.sprint-stat{flex:1;min-width:80px;text-align:center;padding:16px 8px;border-right:1px solid var(--border);}
.sprint-stat:last-child{border-right:none;}
.sn{display:block;font-size:28px;font-weight:900;line-height:1;}
.sl{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--mid);margin-top:4px;}
.sn-total{color:var(--dark);}
.sn-done{color:var(--green);}
.sn-active{color:var(--amber);}
.sn-review{color:var(--blue);}
.sn-planned{color:var(--gray);}

/* ── EPIC BLOCKS ── */
.epic-block{border-bottom:1px solid var(--border);}
.epic-block:last-child{border-bottom:none;}
.epic-header{display:flex;align-items:center;gap:12px;padding:14px 24px;cursor:pointer;user-select:none;list-style:none;}
.epic-header::-webkit-details-marker{display:none;}
.epic-block[open] .epic-header{background:var(--light);}
.epic-num{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--brand);flex-shrink:0;}
.epic-title{font-size:14px;font-weight:700;flex:1;}
.epic-progress{display:flex;align-items:center;gap:8px;flex-shrink:0;}
.epic-bar{width:80px;height:6px;background:#E5E7EB;border-radius:3px;overflow:hidden;}
.epic-bar-fill{height:100%;background:var(--green);border-radius:3px;transition:width .3s;}
.epic-pct{font-size:11px;font-weight:700;color:var(--mid);width:28px;text-align:right;}
.epic-count{font-size:11px;color:var(--mid);flex-shrink:0;}

/* ── STORY ROWS ── */
.epic-stories{padding:0 24px 16px;}
.story-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #F3F4F6;flex-wrap:wrap;}
.story-row:last-child{border-bottom:none;}
.story-id{font-size:11px;font-weight:800;color:var(--brand);background:var(--light);padding:2px 6px;border-radius:4px;flex-shrink:0;font-family:monospace;}
.story-title{font-size:13px;font-weight:600;flex:1;min-width:160px;}
.story-desc{font-size:12px;color:var(--mid);width:100%;padding-left:2px;}

/* ── STATUS CHIPS ── */
.chip{font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;white-space:nowrap;flex-shrink:0;}
.chip-done{background:#D1FAE5;color:#065F46;}
.chip-active{background:#FEF3C7;color:#92400E;}
.chip-review{background:#DBEAFE;color:#1E40AF;}
.chip-planned{background:#F3F4F6;color:#6B7280;}

/* ── EMPTY STATE ── */
.sprint-empty{padding:48px 24px;text-align:center;}
.sprint-empty-icon{font-size:36px;margin-bottom:12px;}
.sprint-empty-title{font-size:16px;font-weight:700;color:var(--dark);margin-bottom:6px;}
.sprint-empty-body{font-size:13px;color:var(--mid);max-width:380px;margin:0 auto;}

/* ── FOOTER ── */
.footer{text-align:center;padding:32px;font-size:12px;color:var(--mid);}
.footer a{color:var(--brand);}

@media(max-width:640px){
  .header{padding:20px 24px 16px;}
  .container{padding:20px 16px 60px;}
  .header-meta{padding:0 24px;}
  .phase-bar{overflow-x:auto;gap:0;}
}
</style>
</head>
<body>

<div class="header">
  <div class="header-top">
    <div>
      <div class="header-brand">
        ${DS_LOGO}
        <span class="header-eyebrow">DataSkate Engagement Portal</span>
      </div>
      <div class="header-client">${escHtml(displayName)}</div>
      <div class="header-sub">Integration Project</div>
    </div>
    <div class="arch-badge">
      <div class="arch-label">Your Architect</div>
      <div class="arch-name">${escHtml(architect)}</div>
      <div class="arch-email"><a href="mailto:${escHtml(archEmail)}">${escHtml(archEmail)}</a></div>
    </div>
  </div>
  <div class="header-meta">
    <span>Project started: ${createdAt || 'TBD'}</span>
    <span>Target go-live: ${escHtml(targetGoLive)}</span>
    <span>Updated: ${lastUpdated}</span>
  </div>
</div>

<div class="container">

  <!-- Phase tracker -->
  <div class="section">
    <div class="section-head">
      <div class="section-num">1</div>
      <div class="section-title">Engagement Phase</div>
    </div>
    <div class="phase-bar">${renderPhaseBar(status)}</div>
  </div>

  <!-- Documents -->
  <div class="section">
    <div class="section-head">
      <div class="section-num">2</div>
      <div class="section-title">Documents &amp; Resources</div>
    </div>
    <div class="section-body">
      <div class="doc-grid">
        ${renderDocCard('📋', 'Intake Questionnaire', intakeUrl ? 'Open form →' : 'Not yet sent', intakeUrl, intakeUrl ? 'available' : 'na')}
        ${renderDocCard(
          responsesStatus === 'available' ? '✅' : '⏳',
          'Intake Responses',
          responsesStatus === 'available'
            ? (responsesDate ? `Submitted ${responsesDate}` : 'Submitted')
            : 'Awaiting your submission',
          null,
          responsesStatus === 'available' ? 'available' : 'pending'
        )}
        ${renderDocCard('📄', 'Proposal', proposalUrl ? 'View proposal →' : 'Not yet sent', proposalUrl, proposalUrl ? 'available' : 'na')}
        ${renderDocCard('📁', 'Scoping Documents', scopingCount > 0 ? `${scopingCount} file${scopingCount !== 1 ? 's' : ''} on record` : 'In progress', null, scopingCount > 0 ? 'available' : 'pending')}
        ${docLinks['prd.md'] ? renderDocCard('📝', 'Product Requirements', 'View PRD →', docLinks['prd.md'], 'available') : renderDocCard('📝', 'Product Requirements', 'Not yet finalized', null, 'na')}
        ${docLinks['architecture.md'] ? renderDocCard('🏗️', 'Architecture Design', 'View design doc →', docLinks['architecture.md'], 'available') : renderDocCard('🏗️', 'Architecture Design', 'Not yet finalized', null, 'na')}
        ${docLinks['stories.md'] ? renderDocCard('🗂️', 'Epics & Stories', 'View full list →', docLinks['stories.md'], 'available') : renderDocCard('🗂️', 'Epics & Stories', 'Sprint planning pending', null, 'pending')}
        ${sourceFilesUrl ? renderDocCard('📁', 'Source Files', 'View in cloud storage →', sourceFilesUrl, 'available') : ''}
        ${devRepoUrl ? renderDocCard('⚙️', 'Dev Repository', 'View on GitHub →', devRepoUrl, 'available') : ''}
      </div>
    </div>
  </div>

  <!-- Sprint board -->
  <div class="section">
    <div class="section-head">
      <div class="section-num">3</div>
      <div class="section-title">Sprint Status</div>
    </div>
    ${renderSprintBoard(epics)}
  </div>

</div>

<div class="footer">
  Powered by <a href="https://dataskate.ai" target="_blank">DataSkate</a> · This page updates automatically as your project progresses.
</div>

</body>
</html>`;

  return html;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const targetSlug = process.argv[2] || null;
  const outDir = path.join(PUBLIC, 'portal');
  fs.mkdirSync(outDir, { recursive: true });

  let slugs;
  if (targetSlug) {
    slugs = [targetSlug];
  } else {
    slugs = fs.readdirSync(path.join(REPO_ROOT, 'projects'), { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  }

  if (!GITHUB_TOKEN) console.log('  ⚠  No GITHUB_TOKEN — sprint data will use local stories.md only');

  let count = 0;
  for (const slug of slugs) {
    const html = await buildPortal(slug);
    if (!html) { console.log(`  ⚠  ${slug} — no project.json, skipping`); continue; }
    const outFile = path.join(outDir, slug + '.html');
    fs.writeFileSync(outFile, html);
    console.log(`  ✓  portal/${slug}.html`);
    count++;
  }
  console.log(`\n${count} client portal(s) generated → firebase/public/portal/`);
}

main().catch(e => { console.error(e); process.exit(1); });
