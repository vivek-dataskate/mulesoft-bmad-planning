#!/usr/bin/env node
'use strict';
/**
 * scaffold/slack-agent.js
 *
 * Posts pipeline stage updates to a shared Slack channel.
 * Each client project gets ONE persistent canvas updated at every stage.
 * The canvas contains full detail + clickable GitHub links at every section.
 *
 * Canvas state: projects/{client}/.slack-canvas-state.json
 *
 * Required env vars:
 *   SLACK_BOT_TOKEN        — xoxb-...
 *   SLACK_CHANNEL          — channel ID
 *   ANTHROPIC_API_KEY      — Claude API key
 *   PIPELINE_STAGE         — intake_validation | analyst_complete | architect_complete | pm_complete | scaffold_complete
 *   CLIENT                 — client name (stages 2-5)
 *   GITHUB_SERVER_URL      — auto-set in GitHub Actions (https://github.com)
 *   GITHUB_REPOSITORY      — auto-set in GitHub Actions (org/repo)
 *   GITHUB_ORG             — org name for client dev repos
 *
 *   intake_validation only:
 *     VALIDATION_RESULTS_B64  — base64 JSON from validate-intake.js
 *     VALID_CLIENTS / INVALID_CLIENTS
 *   scaffold_complete only:
 *     CLIENT_REPO_URL  — GitHub URL of generated client repo
 */

const https     = require('https');
const fs        = require('fs');
const path      = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const REPO_ROOT = path.resolve(__dirname, '..');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── GitHub URL helpers ───────────────────────────────────────────────────────

function githubBase() {
  const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  const repo   = process.env.GITHUB_REPOSITORY ?? '';
  return repo ? `${server}/${repo}/blob/main` : null;
}

function githubLink(label, filePath) {
  const base = githubBase();
  if (!base) return `\`${filePath}\``;
  return `[${label}](${base}/${filePath})`;
}

function clientRepoLink(clientName) {
  const repoUrl = process.env.CLIENT_REPO_URL;
  if (repoUrl) return repoUrl;
  const org = process.env.GITHUB_ORG;
  if (org) return `https://github.com/${org}/${clientName}-mule`;
  return null;
}

// ─── Slack API ────────────────────────────────────────────────────────────────

function slackPost(method, body) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error('SLACK_BOT_TOKEN is not set');
  const json = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'slack.com',
      path:     `/api/${method}`,
      method:   'POST',
      headers: {
        Authorization:    `Bearer ${token}`,
        'Content-Type':   'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(json),
      },
    }, res => {
      const parts = [];
      res.on('data', d => parts.push(d));
      res.on('end', () => {
        try {
          const r = JSON.parse(Buffer.concat(parts).toString());
          if (!r.ok) reject(new Error(`Slack ${method}: ${r.error}`));
          else resolve(r);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(json);
    req.end();
  });
}

// ─── Canvas state ─────────────────────────────────────────────────────────────

function stateFilePath(clientName) {
  return path.join(REPO_ROOT, 'projects', clientName, '.slack-canvas-state.json');
}

function loadState(clientName) {
  try { return JSON.parse(fs.readFileSync(stateFilePath(clientName), 'utf8')); }
  catch { return { canvasId: null, channelId: null, intake: null, analyst: null, architect: null, pm: null, scaffold: null }; }
}

function saveState(clientName, state) {
  const dir = path.join(REPO_ROOT, 'projects', clientName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(stateFilePath(clientName), JSON.stringify(state, null, 2), 'utf8');
}

// ─── Canvas markdown builder ──────────────────────────────────────────────────

function stageIcon(state, key) {
  if (!state[key])                     return '⬜';
  if (state[key].status === 'blocked') return '🚫';
  if (state[key].status === 'invalid') return '❌';
  return '✅';
}

function buildCanvasMarkdown(clientName, state) {
  const intake  = state.intake ?? {};
  const systems = (intake.systemsIdentified ?? []).join(' → ') || 'TBD';

  const overallStatus = (() => {
    if (state.scaffold?.status === 'complete')  return '🚀 Complete';
    if (state.pm?.status === 'complete')        return '📅 Sprint plan done — scaffold pending';
    if (state.architect?.status === 'complete') return '🏗️ Architecture done — PM running';
    if (state.analyst?.status === 'complete')   return '📋 PRD done — architect running';
    if (intake.valid === false)                 return '❌ Intake incomplete — waiting on presales';
    if (intake.valid === true)                  return '📥 Intake validated — analyst running';
    return '⏳ Pending';
  })();

  const L = [];   // lines accumulator

  // ── Header ──────────────────────────────────────────────────────────────────
  L.push(`# ${clientName}`);
  L.push(`**Systems:** ${systems}`);
  L.push(`**Status:** ${overallStatus}`);
  L.push('');

  // ── Progress tracker ────────────────────────────────────────────────────────
  L.push('## Pipeline');
  L.push(`${stageIcon(state, 'intake')}   Intake validation`);
  L.push(`${stageIcon(state, 'analyst')}   Analyst — PRD`);
  L.push(`${stageIcon(state, 'architect')}   Architecture & decisions`);
  L.push(`${stageIcon(state, 'pm')}   Sprint planning`);
  L.push(`${stageIcon(state, 'scaffold')}   Scaffold & repo`);
  L.push('');

  // ── Links bar (shown once all docs exist) ───────────────────────────────────
  const links = [
    state.analyst   ? githubLink('📄 PRD',          `projects/${clientName}/prd.md`) : null,
    state.architect ? githubLink('🏗️ Architecture', `projects/${clientName}/architecture.md`) : null,
    state.architect ? githubLink('⚙️ Decisions',    `projects/${clientName}/decisions.json`) : null,
    state.pm        ? githubLink('📅 Stories',       `projects/${clientName}/stories.md`) : null,
    state.scaffold?.repoUrl || clientRepoLink(clientName)
      ? `[🚀 Dev Repo](${state.scaffold?.repoUrl ?? clientRepoLink(clientName)})` : null,
  ].filter(Boolean);
  if (links.length > 0) {
    L.push(links.join('   ·   '));
    L.push('');
  }

  // ── Persistent warnings ─────────────────────────────────────────────────────
  const warnings = intake.autoWarnings ?? [];
  if (warnings.length > 0) {
    L.push('## ⚠️ Project Warnings');
    for (const w of warnings) {
      const icon = w.severity === 'high' ? '🔴' : '🟡';
      L.push(`${icon} **${w.id.replace(/_/g, ' ')}**`);
      L.push(`   ${w.warning}`);
      L.push('');
    }
  }

  // ── 📥 INTAKE ────────────────────────────────────────────────────────────────
  L.push('---');
  L.push('## 📥 Intake');
  if (intake.valid === false) {
    L.push('**Result:** ❌ Incomplete — pipeline blocked');
    L.push('');
    L.push('### What Is Missing');
    for (const gap of (intake.gapDetails ?? [])) {
      L.push(`**${gap.label}**`);
      L.push(gap.failMessage);
      if (gap.example) L.push(`> *Example:* ${gap.example}`);
      L.push('');
    }
    L.push('### How to Fix');
    L.push('Ask presales to upload a `gap-fill.md` to the Drive folder for this client.');
    L.push('The system re-validates within 20 minutes of upload.');
  } else if (intake.valid === true) {
    L.push(`**Summary:** ${intake.executiveSummary ?? ''}`);
    L.push('');
    if ((intake.whatIsBeingBuilt ?? []).length > 0) {
      L.push('### What Is Being Built');
      for (const item of intake.whatIsBeingBuilt) L.push(`- ${item}`);
      L.push('');
    }
    L.push('### Systems');
    for (const s of (intake.systemsIdentified ?? [])) L.push(`- ${s}`);
    L.push('');
    L.push('| Complexity | Flows | Confidence |');
    L.push('|---|---|---|');
    L.push(`| ${intake.estimatedComplexity ?? '?'} | ${intake.estimatedFlows ?? '?'} | ${intake.confidence ?? '?'} |`);
    if (intake.architectNotes) {
      L.push('');
      L.push('### Architect: Verify Before Designing');
      L.push(intake.architectNotes);
    }
    if ((intake.openItems ?? []).length > 0) {
      L.push('');
      L.push('### Open Questions');
      for (const q of intake.openItems) L.push(`- ${q}`);
    }
    if ((intake.reusableCapabilities ?? []).length > 0) {
      L.push('');
      L.push('### Reusable Capabilities');
      for (const r of intake.reusableCapabilities) L.push(`- ${r}`);
    }
    if ((intake.missingRecommended ?? []).length > 0) {
      L.push('');
      L.push('### Missing Recommended (Non-Blocking)');
      for (const m of intake.missingRecommended) L.push(`- ${m}`);
    }
  } else {
    L.push('Pending...');
  }
  L.push('');

  // ── 📋 ANALYST ───────────────────────────────────────────────────────────────
  L.push('---');
  L.push('## 📋 Analyst — PRD');
  if (state.analyst) {
    L.push(state.analyst.canvasSection ?? '');
    L.push('');
    L.push(`> ${githubLink('Open full PRD →', `projects/${clientName}/prd.md`)}`);
  } else {
    L.push('Pending...');
  }
  L.push('');

  // ── 🏗️ ARCHITECTURE ──────────────────────────────────────────────────────────
  L.push('---');
  L.push('## 🏗️ Architecture');
  if (state.architect) {
    L.push(state.architect.canvasSection ?? '');
    L.push('');
    L.push([
      `> ${githubLink('Architecture →', `projects/${clientName}/architecture.md`)}`,
      `  ${githubLink('Decisions JSON →', `projects/${clientName}/decisions.json`)}`,
    ].join('   '));
  } else {
    L.push('Pending...');
  }
  L.push('');

  // ── 📅 SPRINT PLANNING ───────────────────────────────────────────────────────
  L.push('---');
  L.push('## 📅 Sprint Planning');
  if (state.pm) {
    L.push(state.pm.canvasSection ?? '');
    L.push('');
    L.push(`> ${githubLink('Open full sprint plan →', `projects/${clientName}/stories.md`)}`);
  } else {
    L.push('Pending...');
  }
  L.push('');

  // ── 🚀 SCAFFOLD & REPO ───────────────────────────────────────────────────────
  L.push('---');
  L.push('## 🚀 Scaffold & Repo');
  if (state.scaffold) {
    const repoUrl = state.scaffold.repoUrl ?? clientRepoLink(clientName);
    if (repoUrl) L.push(`**Repo:** [${clientName}-mule](${repoUrl})`);
    L.push('');
    L.push(state.scaffold.canvasSection ?? '');
  } else {
    L.push('Pending...');
  }

  return L.join('\n');
}

// ─── Sync canvas ──────────────────────────────────────────────────────────────

async function syncCanvas(clientName, state) {
  const channel = process.env.SLACK_CHANNEL;
  if (!channel) { console.log('⚠  SLACK_CHANNEL not set'); return; }

  const markdown = buildCanvasMarkdown(clientName, state);

  if (!state.canvasId) {
    try {
      const res = await slackPost('conversations.canvases.create', {
        channel_id:       channel,
        document_content: { type: 'markdown', markdown },
      });
      state.canvasId  = res.canvas_id ?? res.channel_canvas?.canvas_id ?? null;
      state.channelId = channel;
      console.log(`✓ Canvas created: ${state.canvasId}`);
    } catch (e) {
      console.log(`⚠  Canvas create failed: ${e.message}`);
    }
  } else {
    try {
      await slackPost('canvases.update', {
        canvas_id: state.canvasId,
        changes: [{ operation: 'replace', document_content: { type: 'markdown', markdown } }],
      });
      console.log(`✓ Canvas updated: ${state.canvasId}`);
    } catch (e) {
      console.log(`⚠  Canvas update failed: ${e.message} — posting text fallback`);
      await slackPost('chat.postMessage', {
        channel: state.channelId ?? channel,
        text:    `*${clientName}* pipeline update. See GitHub for full output.`,
        mrkdwn:  true,
      });
    }
  }

  // Short feed message so team sees the activity without opening the canvas
  const stageLabels = {
    intake_validation:  `📥 Intake ${state.intake?.valid ? 'validated ✅' : 'incomplete ❌'}`,
    analyst_complete:   '📋 PRD complete ✅',
    architect_complete: '🏗️ Architecture complete ✅',
    pm_complete:        '📅 Sprint plan complete ✅',
    scaffold_complete:  '🚀 Scaffold ready ✅',
  };
  const label = stageLabels[process.env.PIPELINE_STAGE ?? ''] ?? 'Pipeline update';
  await slackPost('chat.postMessage', {
    channel:  state.channelId ?? channel,
    text:     `*${clientName}* — ${label}  ·  Canvas updated ↑`,
    mrkdwn:   true,
  });
}

// ─── File helpers ─────────────────────────────────────────────────────────────

function read(fp) {
  try { return fs.readFileSync(fp, 'utf8'); }
  catch { return null; }
}

function projectFile(clientName, filename) {
  return read(path.join(REPO_ROOT, 'projects', clientName, filename));
}

function loadChecklist() {
  try { return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'standards', 'intake-checklist.json'), 'utf8')); }
  catch { return { mandatory: [], recommended: [], autoWarnings: [] }; }
}

function loadFieldKnowledge() {
  return read(path.join(REPO_ROOT, 'docs', 'FIELD_KNOWLEDGE.md')) ?? '';
}

// ─── Claude helper ────────────────────────────────────────────────────────────

async function askClaude(system, user) {
  const r = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2500,
    system,
    messages: [{ role: 'user', content: user }],
  });
  return r.content[0]?.text ?? '';
}

// ─── Stage handlers ───────────────────────────────────────────────────────────

async function handleIntakeValidation() {
  let results = [];
  if (process.env.VALIDATION_RESULTS_B64) {
    try { results = JSON.parse(Buffer.from(process.env.VALIDATION_RESULTS_B64, 'base64').toString('utf8')); }
    catch { /* ignore */ }
  }
  const validList   = (process.env.VALID_CLIENTS   ?? '').split(',').filter(Boolean);
  const invalidList = (process.env.INVALID_CLIENTS ?? '').split(',').filter(Boolean);
  if (results.length === 0) {
    for (const c of validList)   results.push({ client: c, valid: true,  missingMandatory: [], autoWarnings: [] });
    for (const c of invalidList) results.push({ client: c, valid: false, missingMandatory: ['unknown'], autoWarnings: [] });
  }

  const fieldKnow = loadFieldKnowledge();
  const checklist = loadChecklist();

  const gapExamples = {
    systems_named:    '"We integrate Salesforce (source) with NetSuite (target)."',
    business_problem: '"Orders in Salesforce are manually re-keyed into NetSuite — 2 hrs/day, 5% error rate."',
    data_direction:   '"When Opportunity closes in Salesforce, create Sales Order in NetSuite within 5 min."',
  };

  for (const result of results) {
    const clientName = result.client;
    const state      = loadState(clientName);

    state.intake = {
      valid:               result.valid,
      executiveSummary:    result.executiveSummary  ?? null,
      whatIsBeingBuilt:    result.whatIsBeingBuilt  ?? [],
      systemsIdentified:   result.systemsIdentified ?? [],
      estimatedComplexity: result.estimatedComplexity ?? null,
      estimatedFlows:      result.estimatedFlows    ?? null,
      confidence:          result.confidence        ?? null,
      autoWarnings:        result.autoWarnings       ?? [],
      missingMandatory:    result.missingMandatory   ?? [],
      missingRecommended:  result.missingRecommended ?? [],
      openItems:           result.openItems          ?? [],
      reusableCapabilities: result.reusableCapabilities ?? [],
      fileNames:           result.fileNames          ?? [],
      gapDetails: (result.missingMandatory ?? []).map(id => {
        const item = checklist.mandatory.find(m => m.id === id);
        return { label: item?.label ?? id, failMessage: item?.failMessage ?? 'Required.', example: gapExamples[id] ?? null };
      }),
    };

    if (result.valid) {
      const notes = await askClaude(
        `You are a MuleSoft expert. List 3-4 specific things the architect must verify before designing this integration. Name actual systems. Reference field knowledge (FK-NNN) where relevant.\nField Knowledge:\n${fieldKnow.slice(0, 1500)}`,
        `Client: ${clientName}\n${JSON.stringify({ systemsIdentified: result.systemsIdentified, architectNotes: result.architectNotes, openItems: result.openItems, autoWarnings: result.autoWarnings, reusableCapabilities: result.reusableCapabilities }, null, 2)}\n\nFormat: bullet points.`
      );
      state.intake.architectNotes = notes;
    }

    saveState(clientName, state);
    await syncCanvas(clientName, state);
  }
}

async function handleAnalystComplete() {
  const clientName = process.env.CLIENT;
  if (!clientName) { console.log('⚠  CLIENT not set'); return; }

  const state     = loadState(clientName);
  const prd       = projectFile(clientName, 'prd.md') ?? '';
  const fieldKnow = loadFieldKnowledge();

  const canvasSection = await askClaude(
    `You are a MuleSoft expert writing a Slack canvas section summarising a completed PRD.
Field Knowledge (apply verified FK entries): ${fieldKnow.slice(0, 1500)}`,
    `Client: ${clientName}
PRD (first 4000 chars):
${prd.slice(0, 4000)}

Write a detailed markdown section. Include ALL of:

### Summary
[3-4 specific bullets: scope, systems, integration type, key constraints]

### Systems in Scope
| System | Role | Connector Status |
|---|---|---|
[role = source/target/orchestrator — connector status = Green ≤30d / Yellow 31-60d / Red >60d / not-found]

### Flows Identified
[list each flow: name, trigger, source → target]

### Open Items (Must Resolve Before Architecture)
[every OPEN ITEM, TBD, BLOCKER, ❓ — state what decision is needed and who owns it]
[If none: "None — PRD complete"]

### Field Knowledge Flags
[FK-NNN entries that apply to these specific systems — name the FK and what it means here]`
  );

  state.analyst = { status: 'complete', canvasSection };
  saveState(clientName, state);
  await syncCanvas(clientName, state);
}

async function handleArchitectComplete() {
  const clientName = process.env.CLIENT;
  if (!clientName) { console.log('⚠  CLIENT not set'); return; }

  const state        = loadState(clientName);
  const architecture = projectFile(clientName, 'architecture.md') ?? '';
  const decisions    = projectFile(clientName, 'decisions.json')   ?? '{}';
  const fieldKnow    = loadFieldKnowledge();

  let dec = {};
  try { dec = JSON.parse(decisions); } catch { /* ignore */ }

  const canvasSection = await askClaude(
    `You are a MuleSoft expert writing a Slack canvas section summarising completed architecture.
Field Knowledge (verified = active guidance): ${fieldKnow.slice(0, 1500)}`,
    `Client: ${clientName}
Pattern: ${dec.integrationPatternId ?? '?'} | Trigger: ${dec.triggerType ?? '?'} | Flows: ${(dec.flows ?? []).length}
Architecture (first 3000 chars): ${architecture.slice(0, 3000)}
Decisions: ${decisions.slice(0, 2000)}

Write a detailed markdown section. Include ALL of:

### Key Decisions
| Decision | Choice | Rationale |
|---|---|---|
[pattern, trigger, error strategy, security tier, scaffold profile, compensation — one row each]

### Flows
| Flow | Trigger | Source → Target |
|---|---|---|
[one row per flow from decisions.json]

### Reusable Capabilities
[specific BMAD commons, shared connectors, patterns — with file paths where known]

### 🔴 Design Risks
[per risk: system name, the risk, what must be verified — no generic advice, name FK-NNN if relevant]

### Review Checklist
- [ ] PRD open items resolved
- [ ] Pattern fits volume/latency NFRs
- [ ] Compensating transactions defined for multi-system mutations
- [ ] Security tier correct for data sensitivity
- [ ] Watermark advances AFTER success (FK-007)
- [ ] deduplicationTtlMinutes = messageTtlHours × 60`
  );

  state.architect = { status: 'complete', canvasSection };
  saveState(clientName, state);
  await syncCanvas(clientName, state);
}

async function handlePmComplete() {
  const clientName = process.env.CLIENT;
  if (!clientName) { console.log('⚠  CLIENT not set'); return; }

  const state   = loadState(clientName);
  const stories = projectFile(clientName, 'stories.md') ?? '';

  const storyCount   = (stories.match(/^### /gm) ?? stories.match(/^## Story/gm) ?? []).length;
  const estimateDays = Math.ceil(storyCount * 1.5);

  const canvasSection = await askClaude(
    `You are a MuleSoft PM writing a Slack canvas section summarising sprint planning.`,
    `Client: ${clientName}
Total stories: ${storyCount} | Estimate: ~${estimateDays} dev-days
Stories (first 4000 chars):
${stories.slice(0, 4000)}

Write a detailed markdown section. Include ALL of:

### Sprint Overview
**${storyCount} stories** · **~${estimateDays} dev-days** · **~${Math.ceil(estimateDays / 5)} calendar weeks** (1 developer)

### Story Breakdown
| Area | Stories | Est. Days |
|---|---|---|
[group by: Foundation/Global, then one row per flow]

### Start Here — Critical Path
[foundation stories that must be done first — they unblock everything else]
[flag any cross-flow dependencies]

### Per-Flow Summary
| Flow | Stories | Key Transforms | MUnit Target |
|---|---|---|---|
[one row per flow]

### Open Items in Stories
[any story with TBD, OPEN ITEM, or "Confirm with client" — must resolve before coding]
[If none: "None — stories are complete"]`
  );

  state.pm = { status: 'complete', canvasSection };
  saveState(clientName, state);
  await syncCanvas(clientName, state);
}

async function handleScaffoldComplete() {
  const clientName = process.env.CLIENT;
  if (!clientName) { console.log('⚠  CLIENT not set'); return; }

  const state     = loadState(clientName);
  const decisions = projectFile(clientName, 'decisions.json') ?? '{}';
  const repoUrl   = process.env.CLIENT_REPO_URL ?? clientRepoLink(clientName) ?? '';

  let dec = {};
  try { dec = JSON.parse(decisions); } catch { /* ignore */ }

  const canvasSection = await askClaude(
    `You are a MuleSoft expert writing the final scaffold-complete canvas section.`,
    `Client: ${clientName}
Repo: ${repoUrl || '(not yet pushed)'}
Decisions: ${decisions.slice(0, 1500)}

Write a markdown section covering:

### What Was Generated
| File | Purpose |
|---|---|
[list: pom.xml, global-config.xml, error-handler.xml, each flow XML, MUnit files, devcontainer.json, post-create.sh]

### Developer Onboarding
1. Open ${repoUrl ? `[the repo](${repoUrl})` : 'the GitHub repo'}
2. **Code → Open in Codespace** (or open Dev Container locally)
3. Wait ~3 min — MuleSoft extensions + BMAD install silently, no action needed
4. Run \`mvn validate\` before first \`mvn compile\`
5. Open GitHub Issues — start with stories labelled \`foundation\`

### ⚠️ Before mvn compile
[list any connectors in decisions.json flagged as approximate version — need Exchange verification]
[If none: "All connector versions verified — safe to compile"]

### Client Progress Report
Plain-English report ready at \`projects/${clientName}/client-report.html\`
Share with client — shows scope and % complete as GitHub Issues close.`
  );

  state.scaffold = {
    status:       'complete',
    repoUrl:      repoUrl || null,
    canvasSection,
  };

  saveState(clientName, state);
  await syncCanvas(clientName, state);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  if (!process.env.SLACK_BOT_TOKEN)   throw new Error('SLACK_BOT_TOKEN is not set');

  const stage = process.env.PIPELINE_STAGE;
  if (!stage) throw new Error('PIPELINE_STAGE is required');

  console.log(`→ Slack agent stage=${stage} client=${process.env.CLIENT ?? '(from validation)'}`);

  switch (stage) {
    case 'intake_validation':   await handleIntakeValidation();  break;
    case 'analyst_complete':    await handleAnalystComplete();   break;
    case 'architect_complete':  await handleArchitectComplete(); break;
    case 'pm_complete':         await handlePmComplete();        break;
    case 'scaffold_complete':   await handleScaffoldComplete();  break;
    default: throw new Error(`Unknown PIPELINE_STAGE: "${stage}"`);
  }

  console.log('✓ Slack agent done');
}

main().catch(e => { console.error('Slack agent failed:', e.message); process.exit(1); });
