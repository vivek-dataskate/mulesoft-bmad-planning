#!/usr/bin/env node
'use strict';
/**
 * scaffold/generate-client-report.js
 *
 * Generates a client-facing HTML progress report from:
 *   projects/{client}/decisions.json  — what's being built
 *   projects/{client}/stories.md      — sprint stories
 *   GitHub Issues API (optional)      — story completion status
 *
 * Usage:
 *   node scaffold/generate-client-report.js projects/leolabs/decisions.json
 *   node scaffold/generate-client-report.js projects/leolabs/decisions.json --open
 *
 *   With live GitHub issue counts:
 *   GITHUB_TOKEN=ghp_... GITHUB_ORG=my-org \
 *     node scaffold/generate-client-report.js projects/leolabs/decisions.json
 *
 * Output:
 *   projects/{client}/client-report.html
 *
 * The report shows:
 *   - What systems are being integrated
 *   - What flows are being built (plain language, no jargon)
 *   - Sprint progress (open vs closed GitHub Issues, or estimated from stories.md)
 *   - Timeline estimate based on story count × average dev velocity
 *   - Next milestone date
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

const REPO_ROOT = path.resolve(__dirname, '..');

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args         = process.argv.slice(2);
const decisionsArg = args.find(a => !a.startsWith('--'));
const openBrowser  = args.includes('--open');

if (!decisionsArg) {
  console.error('Usage: node scaffold/generate-client-report.js <path/to/decisions.json> [--open]');
  process.exit(1);
}

const decisionsPath = path.resolve(decisionsArg);
if (!fs.existsSync(decisionsPath)) {
  console.error(`Error: decisions.json not found: ${decisionsPath}`);
  process.exit(1);
}

const d       = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'));
const client  = d.project?.client ?? 'client';
const clientDir = path.dirname(decisionsPath);

// ─── Fetch GitHub issue counts (optional) ────────────────────────────────────

async function fetchIssueStats(org, repo, token) {
  return new Promise((resolve) => {
    if (!token || !org) {
      resolve({ open: null, closed: null, total: null });
      return;
    }
    const options = {
      hostname: 'api.github.com',
      path:     `/repos/${org}/${repo}/issues?state=all&per_page=1&labels=generated`,
      headers: {
        Authorization: `token ${token}`,
        Accept:        'application/vnd.github+json',
        'User-Agent':  'bmad-scaffold',
      },
    };
    const req = https.request(options, res => {
      // Total issues from Link header (pagination)
      const linkHeader = res.headers.link ?? '';
      let total = null;
      const lastMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
      if (lastMatch) total = parseInt(lastMatch[1], 10);

      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const issues = JSON.parse(data || '[]');
        resolve({ open: null, closed: null, total, sample: issues });
      });
    });
    req.on('error', () => resolve({ open: null, closed: null, total: null }));
    req.end();
  });
}

async function fetchOpenClosed(org, repo, token) {
  if (!token || !org) return { open: 0, closed: 0 };
  const fetch = (state) => new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path:     `/repos/${org}/${repo}/issues?state=${state}&per_page=1&labels=generated`,
      headers: {
        Authorization: `token ${token}`,
        Accept:        'application/vnd.github+json',
        'User-Agent':  'bmad-scaffold',
      },
    };
    const req = https.request(options, res => {
      const linkHeader = res.headers.link ?? '';
      const lastMatch  = linkHeader.match(/page=(\d+)>; rel="last"/);
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const issues = JSON.parse(data || '[]');
        const count = lastMatch ? parseInt(lastMatch[1], 10) : issues.length;
        resolve(count);
      });
    });
    req.on('error', () => resolve(0));
    req.end();
  });
  const [open, closed] = await Promise.all([fetch('open'), fetch('closed')]);
  return { open, closed };
}

// ─── Parse stories.md ────────────────────────────────────────────────────────

function parseStories(storiesPath) {
  if (!fs.existsSync(storiesPath)) return { global: [], perFlow: [] };
  const lines    = fs.readFileSync(storiesPath, 'utf8').split('\n');
  const global   = [];
  const perFlow  = [];
  let current    = null;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) {
        (current.isGlobal ? global : perFlow).push(current);
      }
      const title = line.slice(3).trim();
      const isGlobal = /global|error.handler|dlq|secrets|cicd|ci\/cd|mq.queue|wire.tap|invalid.message/i.test(title);
      current = { title, isGlobal, body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) (current.isGlobal ? global : perFlow).push(current);
  return { global, perFlow };
}

// ─── Plain-English flow descriptions ─────────────────────────────────────────

function describeFlow(flow) {
  const src = flow.source ?? 'Source System';
  const tgt = flow.target ?? 'Target System';
  const trigger = flow.trigger ?? 'http';
  const triggerDesc = {
    'http':          'Real-time API call',
    'scheduler':     'Scheduled job',
    'mq-subscriber': 'Event-driven',
    'kafka':         'Stream processing',
    'sftp':          'File pickup',
    'db-poll':       'Database polling',
    'platform-event':'Platform event',
    'cdc':           'Change capture',
  }[trigger] ?? 'Integration';
  return `${triggerDesc}: ${src} → ${tgt}`;
}

function patternDescription(pattern) {
  const map = {
    'request-reply':         'Real-time API integration (synchronous)',
    'event-driven':          'Event-driven integration (asynchronous)',
    'batch':                 'Batch processing',
    'scheduled-sync':        'Scheduled data synchronisation',
    'file-based-etl':        'File-based data transfer',
    'cdc-streaming':         'Real-time change data capture',
    'b2b-edi':               'B2B EDI trading partner integration',
    'process-orchestration': 'Multi-step workflow with compensation',
    'api-aggregation':       'API aggregation (parallel calls)',
    'webhook-ingestion':     'Inbound webhook processing',
    'data-migration':        'One-time data migration',
    'streaming-pipeline':    'High-volume streaming pipeline',
    'pubsub-fanout':         'Broadcast to multiple consumers',
    'outbound-notification': 'Alert and notification dispatch',
    'hybrid':                'Multiple integration patterns',
  };
  return map[pattern] ?? pattern;
}

// ─── Velocity estimate ────────────────────────────────────────────────────────

function estimateTimeline(totalStories, flows) {
  // Conservative estimate: 1.5 developer-days per story (accounts for review + test)
  const devDaysPerStory = 1.5;
  const totalDevDays    = totalStories * devDaysPerStory;
  const weeksRounded    = Math.ceil(totalDevDays / 5); // 5 dev days per week
  const flowCount       = flows.length;
  return {
    totalDevDays: Math.round(totalDevDays),
    weeks: weeksRounded,
    flowCount,
    storyCount: totalStories,
    devVelocityNote: `Based on ${totalStories} stories × ${devDaysPerStory} dev-days/story.`,
  };
}

// ─── HTML generation ─────────────────────────────────────────────────────────

function generateHtml(d, stories, progress, timeline) {
  const { global: globalStories, perFlow: flowStories } = stories;
  const totalStories = globalStories.length + flowStories.length;
  const closedCount  = progress.closed ?? 0;
  const openCount    = progress.open ?? totalStories;
  const pct          = totalStories > 0 ? Math.round((closedCount / totalStories) * 100) : 0;
  const flows        = d.integration?.flows ?? [];
  const connectors   = d.systems?.connectors ?? [];
  const pattern      = d.integration?.primaryPattern ?? '';
  const clientDisplay = client.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const generatedDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Format connectors as a readable list
  const systemList = [...new Set([...connectors, ...flows.map(f => f.source), ...flows.map(f => f.target)])]
    .filter(Boolean)
    .filter(s => s !== 'Source System' && s !== 'Target System')
    .map(s => `<span class="badge">${s}</span>`)
    .join(' ');

  const flowRows = flows.map(flow => `
    <tr>
      <td>${describeFlow(flow)}</td>
      <td><span class="status-badge status-progress">${flow.layer ?? 'process'} layer</span></td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${clientDisplay} Integration — Progress Report</title>
  <style>
    :root {
      --primary: #0070d2;
      --success: #2e844a;
      --warn:    #c97b00;
      --bg:      #f4f6f9;
      --card:    #ffffff;
      --text:    #2b2b2b;
      --muted:   #6b7280;
      --border:  #e0e0e0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); }
    .header { background: var(--primary); color: white; padding: 2rem; }
    .header h1 { font-size: 1.8rem; font-weight: 600; }
    .header p  { opacity: 0.85; margin-top: 0.4rem; }
    .container { max-width: 960px; margin: 2rem auto; padding: 0 1rem; display: grid; gap: 1.5rem; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1.5rem; }
    .card h2 { font-size: 1.1rem; color: var(--primary); margin-bottom: 1rem; border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; }
    .progress-bar-wrap { background: #e8ecf0; border-radius: 999px; height: 24px; overflow: hidden; margin: 0.75rem 0; }
    .progress-bar { background: var(--success); height: 100%; border-radius: 999px; transition: width 0.5s; display: flex; align-items: center; justify-content: center; color: white; font-size: 0.8rem; font-weight: 600; min-width: 2.5rem; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-top: 1rem; }
    .stat { text-align: center; padding: 1rem; background: var(--bg); border-radius: 6px; }
    .stat .num { font-size: 2rem; font-weight: 700; color: var(--primary); }
    .stat .lbl { font-size: 0.8rem; color: var(--muted); margin-top: 0.2rem; }
    .badge { display: inline-block; background: #e8f0fe; color: var(--primary); border-radius: 4px; padding: 0.2rem 0.5rem; font-size: 0.8rem; margin: 0.15rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border); text-align: left; }
    th { background: var(--bg); font-weight: 600; color: var(--muted); font-size: 0.8rem; text-transform: uppercase; }
    .status-badge { display: inline-block; border-radius: 4px; padding: 0.2rem 0.5rem; font-size: 0.75rem; font-weight: 600; }
    .status-progress { background: #fff3cd; color: #856404; }
    .status-done { background: #d4edda; color: #155724; }
    .timeline-note { font-size: 0.85rem; color: var(--muted); margin-top: 0.5rem; }
    .footer { text-align: center; color: var(--muted); font-size: 0.8rem; padding: 2rem 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${clientDisplay} — Integration Progress</h1>
    <p>Generated ${generatedDate} · Integration type: ${patternDescription(pattern)}</p>
  </div>

  <div class="container">

    <!-- Progress Overview -->
    <div class="card">
      <h2>Overall Progress</h2>
      <div class="progress-bar-wrap">
        <div class="progress-bar" style="width: ${pct}%">${pct > 8 ? pct + '%' : ''}</div>
      </div>
      <p>${pct}% complete — ${closedCount} of ${totalStories} tasks done</p>
      <div class="stats-grid">
        <div class="stat"><div class="num">${flows.length}</div><div class="lbl">Integrations</div></div>
        <div class="stat"><div class="num">${totalStories}</div><div class="lbl">Total Tasks</div></div>
        <div class="stat"><div class="num">${closedCount}</div><div class="lbl">Completed</div></div>
        <div class="stat"><div class="num">~${timeline.weeks}w</div><div class="lbl">Est. Duration</div></div>
      </div>
      <p class="timeline-note">${timeline.devVelocityNote} Timeline is an estimate and may change based on discovery findings.</p>
    </div>

    <!-- Systems being integrated -->
    <div class="card">
      <h2>Systems Being Integrated</h2>
      <p>${systemList || '<em>See decisions.json for system list</em>'}</p>
    </div>

    <!-- Integration flows -->
    <div class="card">
      <h2>What's Being Built</h2>
      <table>
        <thead><tr><th>Integration</th><th>Status</th></tr></thead>
        <tbody>${flowRows || '<tr><td colspan="2">No flows defined — check decisions.json</td></tr>'}</tbody>
      </table>
    </div>

  </div>

  <div class="footer">
    Confidential — prepared for ${clientDisplay} · Report generated by BMAD Scaffold
  </div>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const storiesPath = path.join(clientDir, 'stories.md');
  const stories     = parseStories(storiesPath);
  const totalStories = stories.global.length + stories.perFlow.length;

  // Try to get live issue counts from GitHub
  const token = process.env.GITHUB_TOKEN;
  const org   = process.env.GITHUB_ORG;
  const repo  = `${client}-mule`;
  let progress = { open: totalStories, closed: 0 };

  if (token && org) {
    process.stdout.write('Fetching issue counts from GitHub... ');
    try {
      progress = await fetchOpenClosed(org, repo, token);
      console.log(`${progress.closed} closed / ${progress.open} open`);
    } catch {
      console.log('(unavailable — using stories.md counts)');
    }
  } else {
    console.log('GITHUB_TOKEN/GITHUB_ORG not set — using stories.md story count (all open)');
  }

  const timeline   = estimateTimeline(totalStories, d.integration?.flows ?? []);
  const html       = generateHtml(d, stories, progress, timeline);
  const outputPath = path.join(clientDir, 'client-report.html');

  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`✓ Report written: ${path.relative(REPO_ROOT, outputPath)}`);

  if (openBrowser) {
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    require('child_process').spawnSync(opener, [outputPath]);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
