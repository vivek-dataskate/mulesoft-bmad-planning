#!/usr/bin/env node
'use strict';
/**
 * scaffold/slack-agent.js
 *
 * Posts pipeline stage updates to a single shared Slack channel.
 * Each client project gets ONE persistent canvas that is updated at every
 * stage — so the team always sees current project state in one place.
 *
 * Canvas lifecycle per project:
 *   intake_validation  → canvas CREATED with project overview + intake summary
 *   analyst_complete   → canvas UPDATED: PRD section added
 *   architect_complete → canvas UPDATED: Architecture section added
 *   pm_complete        → canvas UPDATED: Sprint plan section added
 *   scaffold_complete  → canvas UPDATED: Repo + done status
 *
 * Canvas state stored in: projects/{client}/.slack-canvas-state.json
 *   { canvasId, channelId, intake, analyst, architect, pm, scaffold }
 *
 * Required env vars:
 *   SLACK_BOT_TOKEN   — xoxb-... bot token
 *   SLACK_CHANNEL     — channel ID where all project canvases live
 *   ANTHROPIC_API_KEY — Claude API key
 *   PIPELINE_STAGE    — intake_validation | analyst_complete | architect_complete | pm_complete | scaffold_complete
 *   CLIENT            — client name (all stages except intake_validation which reads from VALIDATION_RESULTS_B64)
 *
 *   intake_validation:
 *     VALIDATION_RESULTS_B64  — base64 JSON array from validate-intake.js
 *     VALID_CLIENTS / INVALID_CLIENTS — comma-separated fallback
 *   scaffold_complete:
 *     CLIENT_REPO_URL — GitHub repo URL
 */

const https     = require('https');
const fs        = require('fs');
const path      = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const REPO_ROOT = path.resolve(__dirname, '..');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
        Authorization:   `Bearer ${token}`,
        'Content-Type':  'application/json; charset=utf-8',
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

const STAGE_ORDER = ['intake', 'analyst', 'architect', 'pm', 'scaffold'];

function stageIcon(state, key) {
  if (!state[key])             return '⬜';
  if (state[key].status === 'blocked') return '🚫';
  if (state[key].status === 'invalid') return '❌';
  return '✅';
}

function buildCanvasMarkdown(clientName, state) {
  const intake = state.intake ?? {};
  const systems = (intake.systemsIdentified ?? []).join(' → ') || 'TBD';
  const overallStatus = (() => {
    if (state.scaffold?.status === 'complete') return '🚀 Complete';
    if (state.pm?.status === 'complete')       return '📅 Sprint planning done — scaffold pending';
    if (state.architect?.status === 'complete') return '🏗️ Architecture done — PM running';
    if (state.analyst?.status === 'complete')   return '📋 PRD done — architect running';
    if (intake.valid === false)                 return '❌ Intake incomplete';
    if (intake.valid === true)                  return '📥 Intake validated — analyst running';
    return '⏳ Pending';
  })();

  const lines = [];

  // ── Header ──
  lines.push(`# ${clientName}`);
  lines.push(`**Systems:** ${systems}`);
  lines.push(`**Status:** ${overallStatus}`);
  lines.push('');

  // ── Progress tracker ──
  lines.push('## Pipeline Progress');
  lines.push(`${stageIcon(state, 'intake')}   Intake validation`);
  lines.push(`${stageIcon(state, 'analyst')}   Analyst — PRD`);
  lines.push(`${stageIcon(state, 'architect')}   Architecture & decisions`);
  lines.push(`${stageIcon(state, 'pm')}   Sprint planning`);
  lines.push(`${stageIcon(state, 'scaffold')}   Scaffold & repo`);
  lines.push('');

  // ── Warnings (from intake — shown throughout) ──
  const warnings = (intake.autoWarnings ?? []);
  if (warnings.length > 0) {
    lines.push('## ⚠️ Warnings (Review Before Designing)');
    for (const w of warnings) {
      const icon = w.severity === 'high' ? '🔴' : '🟡';
      lines.push(`${icon} **${w.id.replace(/_/g, ' ')}:** ${w.warning}`);
    }
    lines.push('');
  }

  // ── Intake section ──
  lines.push('## 📥 Intake');
  if (intake.valid === false) {
    lines.push('**Status:** ❌ Incomplete — pipeline blocked');
    lines.push('');
    lines.push('**Missing:**');
    for (const m of (intake.missingMandatory ?? [])) {
      lines.push(`- ${m}`);
    }
    lines.push('');
    lines.push('**Next step:** Ask presales to upload the missing information to the Google Drive folder.');
  } else if (intake.valid === true) {
    lines.push(`**Summary:** ${intake.executiveSummary ?? ''}`);
    lines.push('');
    if ((intake.whatIsBeingBuilt ?? []).length > 0) {
      lines.push('**What is being built:**');
      for (const item of intake.whatIsBeingBuilt) lines.push(`- ${item}`);
    }
    lines.push('');
    lines.push(`**Complexity:** ${intake.estimatedComplexity ?? '?'} | **Flows:** ${intake.estimatedFlows ?? '?'} | **Confidence:** ${intake.confidence ?? '?'}`);
    if ((intake.missingRecommended ?? []).length > 0) {
      lines.push('');
      lines.push('**Missing recommended (non-blocking):** ' + intake.missingRecommended.join(', '));
    }
  } else {
    lines.push('Pending...');
  }
  lines.push('');

  // ── Analyst section ──
  lines.push('## 📋 Analyst — PRD');
  if (state.analyst) {
    lines.push(state.analyst.summary ?? '');
    if ((state.analyst.openItems ?? []).length > 0) {
      lines.push('');
      lines.push('**Open items:**');
      for (const item of state.analyst.openItems) lines.push(`- ${item}`);
    }
    lines.push(`\n*Full PRD: \`projects/${clientName}/prd.md\`*`);
  } else {
    lines.push('Pending...');
  }
  lines.push('');

  // ── Architecture section ──
  lines.push('## 🏗️ Architecture');
  if (state.architect) {
    lines.push(state.architect.summary ?? '');
    if (state.architect.pattern) lines.push(`\n**Pattern:** ${state.architect.pattern} | **Trigger:** ${state.architect.trigger ?? '?'}`);
    if ((state.architect.risks ?? []).length > 0) {
      lines.push('');
      lines.push('**Risks:**');
      for (const r of state.architect.risks) lines.push(`- 🔴 ${r}`);
    }
    lines.push(`\n*Full decisions: \`projects/${clientName}/decisions.json\`*`);
  } else {
    lines.push('Pending...');
  }
  lines.push('');

  // ── Sprint planning section ──
  lines.push('## 📅 Sprint Planning');
  if (state.pm) {
    lines.push(state.pm.summary ?? '');
    if (state.pm.storyCount)   lines.push(`\n**Stories:** ${state.pm.storyCount}`);
    if (state.pm.estimateDays) lines.push(`**Estimate:** ~${state.pm.estimateDays} dev-days`);
    lines.push(`\n*Full sprint plan: \`projects/${clientName}/stories.md\`*`);
  } else {
    lines.push('Pending...');
  }
  lines.push('');

  // ── Scaffold section ──
  lines.push('## 🚀 Scaffold & Repo');
  if (state.scaffold) {
    if (state.scaffold.repoUrl) lines.push(`**Repo:** ${state.scaffold.repoUrl}`);
    lines.push(state.scaffold.summary ?? '');
    lines.push('\n**Developer:** Open repo → Code → Open in Codespace. Wait ~3 min for silent setup.');
  } else {
    lines.push('Pending...');
  }

  return lines.join('\n');
}

// ─── Create or update canvas ──────────────────────────────────────────────────

async function syncCanvas(clientName, state) {
  const channel = process.env.SLACK_CHANNEL;
  if (!channel) { console.log('⚠  SLACK_CHANNEL not set — skipping canvas'); return; }

  const markdown = buildCanvasMarkdown(clientName, state);

  if (!state.canvasId) {
    // Create new canvas for this project
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
    // Update existing canvas with full new content
    try {
      await slackPost('canvases.update', {
        canvas_id: state.canvasId,
        changes: [{
          operation:        'replace',
          document_content: { type: 'markdown', markdown },
        }],
      });
      console.log(`✓ Canvas updated: ${state.canvasId}`);
    } catch (e) {
      console.log(`⚠  Canvas update failed: ${e.message} — posting as message instead`);
      // Fallback: post a plain message
      await slackPost('chat.postMessage', {
        channel: state.channelId ?? channel,
        text:    `*${clientName}* pipeline update — see \`projects/${clientName}/\` for full output.`,
        mrkdwn:  true,
      });
    }
  }

  // Post a short notification message so team sees activity in the feed
  const stageLabels = {
    intake_validation:  `📥 Intake ${state.intake?.valid ? 'validated ✅' : 'incomplete ❌'}`,
    analyst_complete:   `📋 PRD complete ✅`,
    architect_complete: `🏗️ Architecture complete ✅`,
    pm_complete:        `📅 Sprint plan complete ✅`,
    scaffold_complete:  `🚀 Scaffold ready ✅`,
  };
  const currentStage = process.env.PIPELINE_STAGE ?? '';
  const label = stageLabels[currentStage] ?? 'Pipeline update';

  await slackPost('chat.postMessage', {
    channel: state.channelId ?? channel,
    text:    `*${clientName}* — ${label}. Canvas updated ↑`,
    mrkdwn:  true,
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
    max_tokens: 1500,
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

  const fieldKnow  = loadFieldKnowledge();
  const checklist  = loadChecklist();

  for (const result of results) {
    const clientName = result.client;
    const state      = loadState(clientName);

    // Store intake data in state
    state.intake = {
      valid:               result.valid,
      executiveSummary:    result.executiveSummary ?? null,
      whatIsBeingBuilt:    result.whatIsBeingBuilt ?? [],
      systemsIdentified:   result.systemsIdentified ?? [],
      estimatedComplexity: result.estimatedComplexity ?? null,
      estimatedFlows:      result.estimatedFlows ?? null,
      confidence:          result.confidence ?? null,
      autoWarnings:        result.autoWarnings ?? [],
      missingMandatory:    result.missingMandatory ?? [],
      missingRecommended:  result.missingRecommended ?? [],
      fileNames:           result.fileNames ?? [],
    };

    // For invalid intake: generate gap detail for the canvas via Claude
    if (!result.valid) {
      const missing    = result.missingMandatory ?? [];
      const gapDetails = missing.map(id => {
        const item = checklist.mandatory.find(m => m.id === id);
        return item ? `${item.label}: ${item.failMessage}` : id;
      }).join('\n');

      const examples = {
        systems_named:    `"We integrate Salesforce (source) with NetSuite (target)."`,
        business_problem: `"Orders in Salesforce are manually re-keyed into NetSuite — 2 hrs/day, 5% error rate."`,
        data_direction:   `"When Opportunity closes in Salesforce, create Sales Order in NetSuite within 5 min."`,
      };

      state.intake.gapInstructions = missing.map(id => {
        const item = checklist.mandatory.find(m => m.id === id);
        return `**${item?.label ?? id}:** ${item?.failMessage ?? 'Required.'}\nExample: ${examples[id] ?? 'Describe in plain English.'}`;
      }).join('\n\n');
    } else {
      // For valid intake: ask Claude to extract architect warnings
      const system = `You are a MuleSoft expert. Extract 2-3 specific architect warnings from this intake validation result. Be brief and specific.
Field Knowledge: ${fieldKnow.slice(0, 1000)}`;
      const notes = await askClaude(system,
        `Client: ${clientName}
Validation result: ${JSON.stringify({ systemsIdentified: result.systemsIdentified, architectNotes: result.architectNotes, openItems: result.openItems, autoWarnings: result.autoWarnings }, null, 2)}

List 2-3 specific things the architect must verify before designing. One line each.`
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

  // Extract open items and summary from PRD via Claude
  const summary = await askClaude(
    `You are a MuleSoft expert. Summarise a PRD in 2-3 bullet points. Extract open items (lines with OPEN ITEM, TBD, ❓). Be brief.`,
    `Client: ${clientName}\nPRD (first 3000 chars):\n${prd.slice(0, 3000)}\n\nRespond with:\nSUMMARY:\n- bullet\n- bullet\n\nOPEN ITEMS:\n- item (or "None")`
  );

  const summaryMatch   = summary.match(/SUMMARY:\n([\s\S]*?)(?:\n\nOPEN ITEMS:|$)/);
  const openItemsMatch = summary.match(/OPEN ITEMS:\n([\s\S]*?)$/);

  state.analyst = {
    status:    'complete',
    summary:   summaryMatch?.[1]?.trim() ?? summary,
    openItems: (openItemsMatch?.[1] ?? '')
      .split('\n')
      .map(l => l.replace(/^-\s*/, '').trim())
      .filter(l => l && l !== 'None'),
  };

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

  // Extract key facts + risks via Claude
  const analysis = await askClaude(
    `You are a MuleSoft expert. Extract key architecture facts and risks. Be specific and brief.
Field Knowledge: ${fieldKnow.slice(0, 1000)}`,
    `Client: ${clientName}
Pattern: ${dec.integrationPatternId ?? '?'} | Trigger: ${dec.triggerType ?? '?'}
Architecture (first 2000 chars): ${architecture.slice(0, 2000)}

Respond with:
SUMMARY:
1-2 sentence summary

RISKS:
- risk 1 (be specific, name the system)
- risk 2`
  );

  const summaryMatch = analysis.match(/SUMMARY:\n([\s\S]*?)(?:\n\nRISKS:|$)/);
  const risksMatch   = analysis.match(/RISKS:\n([\s\S]*?)$/);

  state.architect = {
    status:  'complete',
    pattern: dec.integrationPatternId ?? null,
    trigger: dec.triggerType ?? null,
    flows:   (dec.flows ?? []).length,
    summary: summaryMatch?.[1]?.trim() ?? '',
    risks:   (risksMatch?.[1] ?? '')
      .split('\n')
      .map(l => l.replace(/^-\s*/, '').trim())
      .filter(Boolean),
  };

  saveState(clientName, state);
  await syncCanvas(clientName, state);
}

async function handlePmComplete() {
  const clientName = process.env.CLIENT;
  if (!clientName) { console.log('⚠  CLIENT not set'); return; }

  const state   = loadState(clientName);
  const stories = projectFile(clientName, 'stories.md') ?? '';

  // Count stories and estimate
  const storyCount   = (stories.match(/^### /gm) ?? stories.match(/^## Story/gm) ?? []).length;
  const estimateDays = Math.ceil(storyCount * 1.5);

  const summary = await askClaude(
    `You are a MuleSoft PM. Summarise a sprint plan in 2-3 bullets. Focus on critical path and foundation stories.`,
    `Client: ${clientName}\nStories (first 2000 chars):\n${stories.slice(0, 2000)}\n\nGive 2-3 bullets on story breakdown and what to start with.`
  );

  state.pm = {
    status:       'complete',
    storyCount,
    estimateDays,
    summary,
  };

  saveState(clientName, state);
  await syncCanvas(clientName, state);
}

async function handleScaffoldComplete() {
  const clientName = process.env.CLIENT;
  if (!clientName) { console.log('⚠  CLIENT not set'); return; }

  const state   = loadState(clientName);
  const repoUrl = process.env.CLIENT_REPO_URL ?? '';

  state.scaffold = {
    status:  'complete',
    repoUrl: repoUrl || null,
    summary: repoUrl
      ? `Project scaffolded and pushed to GitHub.`
      : `Scaffold generated locally. Run \`create-client-repo.sh\` to push to GitHub.`,
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
