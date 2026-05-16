#!/usr/bin/env node
'use strict';
/**
 * scaffold/generate-client-portal.js
 *
 * Gathers live project data (project.json, responses.json, stories.md, GitHub)
 * and writes portal-content.json for each client, then delegates HTML rendering
 * to commons/branding/fill-template.js.
 *
 * HTML is NEVER generated here — only data is gathered.
 *
 * Usage:
 *   node scaffold/generate-client-portal.js              # all clients
 *   node scaffold/generate-client-portal.js zyris        # one client
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');
const { spawnSync } = require('child_process');

const REPO_ROOT     = path.resolve(__dirname, '..');
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN || process.env.GITHUB_DEPLOY_TOKEN || null;
const PUBLIC        = path.join(REPO_ROOT, 'firebase', 'public');
const FILL_TEMPLATE = path.join(REPO_ROOT, 'commons', 'branding', 'fill-template.js');

const STATUSES = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'standards', 'project-statuses.json'), 'utf8'));
const PHASES   = STATUSES.phases;

// ── Status helpers ────────────────────────────────────────────────────────────

function statusToPhase(status) {
  const s   = (status || '').toLowerCase();
  const def = STATUSES.statuses.find(p => p.value === s);
  const idx = def ? def.phaseIndex : 0;
  if (s === 'live') return { done: 5, active: 4 };
  return { done: idx, active: idx };
}

function buildPhasesArray(status) {
  const { done, active } = statusToPhase(status);
  return PHASES.map((label, i) => ({
    label,
    status: i < done ? 'done' : i === active ? 'active' : 'future',
  }));
}

function normalizeStatus(raw) {
  const s = (raw || '').toLowerCase().trim();
  if (s === 'done' || s === 'complete' || s === 'completed') return 'Done';
  if (s.includes('progress') || s === 'active' || s === 'wip') return 'In Progress';
  if (s === 'review' || s === 'in review') return 'Review';
  return 'Planned';
}

function normalizeStatusClass(raw) {
  const label = normalizeStatus(raw);
  const map = { 'Done': 'done', 'In Progress': 'active', 'Review': 'review', 'Planned': 'planned' };
  return map[label] || 'planned';
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

// ── GitHub API fetch ──────────────────────────────────────────────────────────

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

// ── Logo download ─────────────────────────────────────────────────────────────

function fetchUrl(url, opts = {}) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'dataskate-portal', ...opts.headers }, timeout: 8000 }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        fetchUrl(next, opts).then(resolve);
        return;
      }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function extFromContentType(ct) {
  if (/svg/i.test(ct)) return '.svg';
  if (/webp/i.test(ct)) return '.webp';
  if (/png/i.test(ct)) return '.png';
  if (/jpe?g/i.test(ct)) return '.jpg';
  if (/ico/i.test(ct)) return '.ico';
  return '.png';
}

async function fetchLogoFromSite(domain) {
  const baseUrl = `https://${domain}`;
  const res = await fetchUrl(baseUrl);
  if (!res || res.status !== 200) return null;
  const html = res.body.toString('utf8');
  const candidates = [];
  const ogImg = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
               || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogImg) candidates.push(ogImg[1]);
  const ati = html.match(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i);
  if (ati) candidates.push(ati[1]);
  const iconPng = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+type=["']image\/png["'][^>]+href=["']([^"']+)["']/i);
  if (iconPng) candidates.push(iconPng[1]);
  for (const candidate of candidates) {
    const logoUrl = candidate.startsWith('http') ? candidate : `${baseUrl}${candidate.startsWith('/') ? '' : '/'}${candidate}`;
    return logoUrl;
  }
  return null;
}

async function downloadLogo(logoUrl, destPaths) {
  const res = await fetchUrl(logoUrl);
  if (!res || res.status !== 200) return { saved: false, ext: '.png' };
  const contentType = res.headers['content-type'] || '';
  if (!/image\//i.test(contentType)) return { saved: false, ext: '.png' };
  const ext = extFromContentType(contentType);
  let saved = false;
  for (const dest of destPaths) {
    const finalDest = dest.replace(/\.\w+$/, ext);
    try {
      fs.mkdirSync(path.dirname(finalDest), { recursive: true });
      fs.writeFileSync(finalDest, res.body);
      saved = true;
    } catch {}
  }
  return { saved, ext };
}

// ── Stats ─────────────────────────────────────────────────────────────────────

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

// ── Doc card builder ──────────────────────────────────────────────────────────

function buildDocCards({ archivedFiles, sourceFilesUrl, localScopingCount, intakeUrl, proposalUrl, devRepoUrl, docUrls }) {
  const card = (icon, title, sub, href, status) => ({ icon, title, sub: sub || '', href: href || null, status });
  const docUrls2 = docUrls || {};

  return [
    archivedFiles.length > 0
      ? card('📁', 'Scoping Documents', `${archivedFiles.length} file${archivedFiles.length !== 1 ? 's' : ''} archived →`, sourceFilesUrl, 'available')
      : localScopingCount > 0
        ? card('📁', 'Scoping Documents', `${localScopingCount} file${localScopingCount !== 1 ? 's' : ''} — pending archive`, null, 'pending')
        : card('📁', 'Scoping Documents', 'Not yet uploaded', null, 'na'),
    { ...card('📋', 'Intake Questionnaire', intakeUrl ? 'Please complete →' : 'Not yet sent', intakeUrl, intakeUrl ? 'pending' : 'na'), id: 'intake-questionnaire' },
    card('📄', 'Proposal', proposalUrl ? 'View proposal →' : 'Not yet sent', proposalUrl, proposalUrl ? 'available' : 'na'),
    docUrls2.sow         ? card('📜', 'SOW',          'View SOW →',         docUrls2.sow,          'available') : card('📜', 'SOW',          'Not yet issued',    null, 'na'),
    docUrls2.prd         ? card('📝', 'Requirements', 'View PRD →',         docUrls2.prd,          'available') : card('📝', 'Requirements', 'Not yet finalized', null, 'na'),
    docUrls2.architecture? card('🏗️', 'Architecture', 'View design doc →',  docUrls2.architecture, 'available') : card('🏗️', 'Architecture', 'Not yet finalized', null, 'na'),
    card('⚙️',  'Git Code',   devRepoUrl ? 'View on GitHub →' : 'Not yet created', devRepoUrl, devRepoUrl ? 'available' : 'na'),
    docUrls2.testCases   ? card('🧪', 'Test Cases',   'View test plan →',   docUrls2.testCases,    'available') : card('🧪', 'Test Cases',   'Not yet created',   null, 'na'),
    docUrls2.hypercare   ? card('🛡️', 'Hypercare',    'View plan →',        docUrls2.hypercare,    'available') : card('🛡️', 'Hypercare',    'Not yet started',   null, 'na'),
  ];
}

// ── Per-client data gatherer ──────────────────────────────────────────────────

async function buildPortalContent(slug) {
  const projectDir = path.join(REPO_ROOT, 'projects', slug);
  const projFile   = path.join(projectDir, 'project.json');
  if (!fs.existsSync(projFile)) return null;

  const proj        = JSON.parse(fs.readFileSync(projFile, 'utf8'));
  const displayName = proj.displayName || slug;
  const architect   = proj.architect     || 'DataSkate Team';
  const archEmail   = proj.architectEmail || 'kailash@dataskate.ai';
  const targetGoLive = proj.targetGoLive || 'TBD';
  const fmtDate = iso => iso
    ? new Date(iso + (iso.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const createdAt = fmtDate(proj.createdAt);

  // Client logo — read from vera.json, download to intake/ and firebase/public/logos/
  let clientLogoPath = null;
  const veraFile = path.join(projectDir, 'run', 'vera.json');
  if (fs.existsSync(veraFile)) {
    try {
      const vera = JSON.parse(fs.readFileSync(veraFile, 'utf8'));
      let logoUrl = vera.company?.logoUrl || null;

      // Resolve domain: from Clearbit pattern, logoUrl hostname, or company snapshot
      function extractDomain(url) {
        if (!url) return null;
        const clearbitM = url.match(/clearbit\.com\/([a-z0-9.-]+\.[a-z]{2,})/i);
        if (clearbitM) return clearbitM[1];
        try { return new URL(url).hostname.replace(/^www\./, ''); } catch {}
        return null;
      }

      const intakeDest = path.join(projectDir, 'intake', `logo-${slug}.png`);
      const publicDest = path.join(PUBLIC, 'logos', `${slug}.png`);

      // Try the stored logoUrl first (skip Clearbit — it's dead)
      if (logoUrl && !/clearbit/i.test(logoUrl)) {
        const { saved, ext } = await downloadLogo(logoUrl, [intakeDest, publicDest]);
        if (saved) clientLogoPath = `/logos/${slug}${ext}`;
      }

      // If still no logo, scrape the company website for og:image / apple-touch-icon
      if (!clientLogoPath) {
        const domain = extractDomain(logoUrl) ||
          (() => { const m = (vera.company?.snapshot || '').match(/https?:\/\/(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})/i); return m ? m[1] : null; })();
        if (domain) {
          console.log(`  Fetching logo from ${domain}...`);
          const scraped = await fetchLogoFromSite(domain);
          if (scraped) {
            const { saved, ext } = await downloadLogo(scraped, [intakeDest, publicDest]);
            if (saved) clientLogoPath = `/logos/${slug}${ext}`;
          }
        }
      }

      if (clientLogoPath) {
        console.log(`  ✓  Logo saved → ${clientLogoPath}`);
      }
    } catch (e) {
      console.log(`  ⚠  Logo fetch failed: ${e.message}`);
    }
  }

  // Manifest: status + document URLs
  const manifestFile = path.join(PUBLIC, 'projects-manifest.json');
  let manifest = [];
  if (fs.existsSync(manifestFile)) {
    try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch {}
  }
  const entry      = manifest.find(m => m.id === slug) || {};
  const status     = entry.status      || 'intake_sent';
  const intakeUrl   = entry.intakeUrl   || null;
  const proposalUrl = entry.proposalUrl || null;
  const pitchKitUrl = entry.pitchKitUrl || null;
  const sowSigned   = entry.sowSigned   || false;

  // Scoping files
  const scopingDir       = path.join(projectDir, 'scoping');
  const archivedFiles    = proj.sourceFiles || [];
  const localScopingCount = fs.existsSync(scopingDir)
    ? fs.readdirSync(scopingDir).filter(f => !f.startsWith('.')).length
    : 0;

  // Dev repo URL + docUrls
  const decisionsFile = path.join(projectDir, 'decisions.json');
  let devRepoUrl = null;
  if (fs.existsSync(decisionsFile)) {
    try {
      const d = JSON.parse(fs.readFileSync(decisionsFile, 'utf8'));
      devRepoUrl = d.repoUrl || d.devRepo || null;
    } catch {}
  }
  const sourceFilesUrl = proj.sourceFilesFolder || null;
  const docUrls        = proj.docUrls || {};

  // Stories — try GitHub then local
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
  }

  const stats = storyStats(epics);
  const lastUpdated = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return {
    meta: {
      clientName:     displayName,
      clientSlug:     slug,
      engagementType: proj.engagementType || 'Integration Project',
      architect,
      architectEmail: archEmail,
      projectStarted: createdAt,
      targetGoLive,
      updated:        lastUpdated,
      clientLogoPath: clientLogoPath || null,
    },
    phases: buildPhasesArray(status),
    sowSigned,
    docCards: buildDocCards({
      archivedFiles, sourceFilesUrl, localScopingCount,
      intakeUrl, proposalUrl, devRepoUrl, docUrls,
    }),
    internalDocs: pitchKitUrl
      ? [{ icon: '📊', title: 'Pitch Kit', href: pitchKitUrl }]
      : [],
    sprintStats: stats.total > 0
      ? { total: stats.total, done: stats.done, active: stats.active, review: stats.review, planned: stats.planned }
      : null,
    sprints: epics.map(epic => {
      const total    = epic.stories.length;
      const doneCount = epic.stories.filter(s => normalizeStatus(s.status) === 'Done').length;
      return {
        id:    epic.id,
        title: epic.title,
        pct:   total ? Math.round((doneCount / total) * 100) : 0,
        stories: epic.stories.map(s => ({
          id:          s.id,
          title:       s.title,
          status:      normalizeStatusClass(s.status),
          statusLabel: normalizeStatus(s.status),
          desc:        s.description || '',
        })),
      };
    }),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const targetSlug = process.argv[2] || null;

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
    const content = await buildPortalContent(slug);
    if (!content) { console.log(`  ⚠  ${slug} — no project.json, skipping`); continue; }

    const contentFile = path.join(REPO_ROOT, 'projects', slug, 'portal-content.json');
    fs.writeFileSync(contentFile, JSON.stringify(content, null, 2), 'utf8');
    console.log(`  ✓  projects/${slug}/portal-content.json`);

    const result = spawnSync('node', [FILL_TEMPLATE, '--template', 'client-portal', '--client', slug], {
      cwd: REPO_ROOT, stdio: 'inherit',
    });
    if (result.status !== 0) {
      console.error(`  ✗  ${slug} — fill-template.js rendering failed`);
      continue;
    }
    count++;
  }

  console.log(`\n${count} client portal(s) generated → firebase/public/portal/`);
}

main().catch(e => { console.error(e); process.exit(1); });
