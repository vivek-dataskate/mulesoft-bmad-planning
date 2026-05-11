#!/usr/bin/env node
'use strict';
/**
 * scaffold/slack-bot.js
 *
 * BMAD Architect Assistant — a Claude agent embedded in Slack.
 * The architect talks to this bot in plain English. It guides them through
 * every pipeline stage, answers any question about standards/patterns/field
 * knowledge, and runs agents on request.
 *
 * Usage:
 *   SLACK_BOT_TOKEN=xoxb-... \
 *   SLACK_APP_TOKEN=xapp-... \
 *   ANTHROPIC_API_KEY=sk-... \
 *   node scaffold/slack-bot.js
 *
 * Required Slack App setup (see docs/SLACK_BOT_SETUP.md):
 *   - Socket Mode enabled (needs SLACK_APP_TOKEN xapp-...)
 *   - Bot scopes: app_mentions:read, chat:write, im:write, im:history,
 *                 channels:history, canvases:write, canvases:read
 *   - Event subscriptions: app_mention, message.im
 *
 * The architect can:
 *   @bmad run analyst for leolabs
 *   @bmad looks good, run architect
 *   @bmad re-run architect — change the pattern to H, we need event-driven
 *   @bmad what's the NetSuite risk on this project?
 *   @bmad how did we standardise pagination across projects?
 *   @bmad show me the architecture decisions for leolabs
 *   @bmad generate the scaffold and create the repo
 *   @bmad what should I be thinking about before approving this PRD?
 */

const { App } = require('@slack/bolt');
const Anthropic = require('@anthropic-ai/sdk');
const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Conversation memory (per Slack thread) ───────────────────────────────────
// Keeps the full message history so the architect can ask follow-up questions
const threadHistory = new Map();

function getHistory(threadTs) {
  if (!threadHistory.has(threadTs)) threadHistory.set(threadTs, []);
  return threadHistory.get(threadTs);
}

// ─── File helpers ─────────────────────────────────────────────────────────────

function read(fp) {
  try { return fs.readFileSync(fp, 'utf8'); }
  catch { return null; }
}

function projectPath(client, filename) {
  return path.join(REPO_ROOT, 'projects', client, filename);
}

function pipelineStatus(client) {
  const dir = path.join(REPO_ROOT, 'projects', client);
  const check = f => fs.existsSync(path.join(dir, f));
  return {
    intake:       check('intake')           ? 'complete' : 'missing',
    prd:          check('prd.md')           ? 'complete' : 'missing',
    architecture: check('architecture.md')  ? 'complete' : 'missing',
    decisions:    check('decisions.json')   ? 'complete' : 'missing',
    stories:      check('stories.md')       ? 'complete' : 'missing',
    scaffold:     check('_scaffold_done')   ? 'complete' : 'missing',
  };
}

function listClients() {
  try {
    const dir = path.join(REPO_ROOT, 'projects');
    return fs.readdirSync(dir)
      .filter(f => fs.statSync(path.join(dir, f)).isDirectory());
  } catch { return []; }
}

// ─── Pipeline stage runner ────────────────────────────────────────────────────

function runStage(client, stage, feedback) {
  const args = ['scaffold/run-pipeline.js', client, '--stage', stage, '--skip-repo'];
  if (feedback) args.push('--feedback', feedback);

  const r = spawnSync('node', args, {
    cwd:     REPO_ROOT,
    stdio:   'pipe',
    env:     { ...process.env, SLACK_BOT_TOKEN: '', SLACK_APP_TOKEN: '' }, // avoid re-notifying
    timeout: 360_000, // 6 min
  });

  return {
    ok:     r.status === 0,
    stdout: (r.stdout?.toString() ?? '').slice(-2000),
    stderr: (r.stderr?.toString() ?? '').slice(-1000),
  };
}

// ─── Canvas poster ────────────────────────────────────────────────────────────

async function postCanvas(client, channelId, title, markdown) {
  try {
    await client.conversations.canvases.create({
      channel_id:       channelId,
      document_content: { type: 'markdown', markdown },
    });
    return true;
  } catch (e) {
    console.log(`Canvas skipped (${e.message}) — will post as text`);
    return false;
  }
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'run_pipeline_stage',
    description: `Run a BMAD pipeline stage for a client.
Stages in order: analyst → architect → pm → scaffold → create_repo.
Call this when the architect says "run analyst", "proceed", "looks good, run architect", "re-run with [feedback]", etc.
The stage runs synchronously and takes 1-5 minutes. Post a status message before calling.`,
    input_schema: {
      type: 'object',
      properties: {
        client:   { type: 'string', description: 'Client name e.g. leolabs' },
        stage:    { type: 'string', enum: ['analyst', 'architect', 'pm', 'scaffold', 'create_repo'] },
        feedback: { type: 'string', description: 'Architect feedback or change instructions to incorporate into this run. Optional.' },
      },
      required: ['client', 'stage'],
    },
  },
  {
    name: 'read_project_file',
    description: 'Read a project output file for a client to answer questions or review content.',
    input_schema: {
      type: 'object',
      properties: {
        client:   { type: 'string' },
        filename: { type: 'string', description: 'prd.md | architecture.md | decisions.json | stories.md | intake/{file}' },
      },
      required: ['client', 'filename'],
    },
  },
  {
    name: 'read_knowledge',
    description: `Read a standards, knowledge, or scenario file to answer architect questions.
Use this for: "how did we standardise X", "what does FK-007 mean", "show me the batch pattern",
"what are the NetSuite gotchas", "what connectors do we have for X".
Available files: FIELD_KNOWLEDGE.md, PLANNING_CONTEXT.md, decisions-schema.json,
connector-registry.json, intake-checklist.json, scenarios/{pattern}.md`,
    input_schema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'Filename relative to docs/ or standards/ or standards/scenarios/' },
      },
      required: ['filename'],
    },
  },
  {
    name: 'get_pipeline_status',
    description: 'Check which pipeline stages are complete for a client. Use when architect asks about project state or what stage we are at.',
    input_schema: {
      type: 'object',
      properties: {
        client: { type: 'string' },
      },
      required: ['client'],
    },
  },
  {
    name: 'list_clients',
    description: 'List all active client projects.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'post_canvas',
    description: 'Post a rich Slack Canvas with detailed content (PRD summaries, architecture breakdowns, sprint plans, etc). Use for long-form structured content.',
    input_schema: {
      type: 'object',
      properties: {
        title:    { type: 'string', description: 'Canvas title' },
        markdown: { type: 'string', description: 'Full markdown content for the canvas' },
      },
      required: ['title', 'markdown'],
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(toolName, input, slackClient, channelId, threadTs, say) {
  switch (toolName) {

    case 'run_pipeline_stage': {
      const { client, stage, feedback } = input;
      await say({ text: `Running *${stage}* for \`${client}\`... 🔄 (this takes 1–5 minutes)`, thread_ts: threadTs });

      if (stage === 'create_repo') {
        const token = process.env.GITHUB_TOKEN;
        const org   = process.env.GITHUB_ORG;
        if (!token || !org) return 'GITHUB_TOKEN or GITHUB_ORG not set — set these env vars and re-run.';
        const r = spawnSync('bash', ['scaffold/create-client-repo.sh', `projects/${client}/decisions.json`], {
          cwd: REPO_ROOT, stdio: 'pipe',
          env: { ...process.env, GITHUB_TOKEN: token, GITHUB_ORG: org },
          timeout: 120_000,
        });
        return r.status === 0
          ? `Repo created. ${r.stdout?.toString().slice(-500)}`
          : `Repo creation failed: ${r.stderr?.toString().slice(-400)}`;
      }

      const result = runStage(client, stage, feedback);
      if (!result.ok) return `Stage *${stage}* failed.\n\`\`\`${result.stderr || result.stdout}\`\`\``;

      // Mark scaffold done
      if (stage === 'scaffold') {
        try { fs.writeFileSync(projectPath(client, '_scaffold_done'), new Date().toISOString()); }
        catch { /* non-critical */ }
      }

      return `Stage *${stage}* complete for \`${client}\`.\n${result.stdout}`;
    }

    case 'read_project_file': {
      const { client, filename } = input;
      const content = read(projectPath(client, filename));
      if (!content) return `File not found: projects/${client}/${filename}`;
      return content.length > 8000 ? content.slice(0, 8000) + '\n\n[... truncated]' : content;
    }

    case 'read_knowledge': {
      const { filename } = input;
      const searchPaths = [
        path.join(REPO_ROOT, 'docs', filename),
        path.join(REPO_ROOT, 'standards', filename),
        path.join(REPO_ROOT, 'standards', 'scenarios', filename),
        path.join(REPO_ROOT, 'scaffold', filename),
      ];
      for (const p of searchPaths) {
        const content = read(p);
        if (content) return content.length > 8000 ? content.slice(0, 8000) + '\n\n[... truncated]' : content;
      }
      return `File not found: ${filename}. Available: FIELD_KNOWLEDGE.md, PLANNING_CONTEXT.md, connector-registry.json, decisions-schema.json, or scenarios/{name}.md`;
    }

    case 'get_pipeline_status': {
      const status = pipelineStatus(input.client);
      const lines  = Object.entries(status).map(([k, v]) => `${v === 'complete' ? '✅' : '⬜'} ${k}`);
      return lines.join('\n');
    }

    case 'list_clients': {
      const clients = listClients();
      if (!clients.length) return 'No client projects found in projects/.';
      return clients.map(c => {
        const s = pipelineStatus(c);
        const done = Object.values(s).filter(v => v === 'complete').length;
        return `• *${c}* — ${done}/${Object.keys(s).length} stages complete`;
      }).join('\n');
    }

    case 'post_canvas': {
      const { title, markdown } = input;
      const posted = await postCanvas(slackClient, channelId, title, markdown);
      return posted ? `Canvas "${title}" posted to the channel.` : `Canvas API failed — content will be in the text reply.`;
    }

    default:
      return `Unknown tool: ${toolName}`;
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt() {
  const fieldKnow = read(path.join(REPO_ROOT, 'docs', 'FIELD_KNOWLEDGE.md')) ?? '';
  const planCtx   = read(path.join(REPO_ROOT, 'docs', 'PLANNING_CONTEXT.md')) ?? '';

  return `You are the BMAD Architect Assistant — a senior MuleSoft integration expert embedded in this Slack channel.
You are the single point of contact for the architect throughout the entire pipeline.

## Your role
- Guide the architect through each BMAD pipeline stage, telling them what to look for and what decisions matter
- Run pipeline stages when asked (or when intent is clear — "looks good", "proceed", "run it")
- Answer ANY question about standards, patterns, field knowledge, connector behaviour, or project history
- Be proactive: after every action or answer, always tell the architect what the next step is
- Be specific: name systems, FK entries, pattern IDs, risks — never give generic advice
- If a stage output has open items or risks, flag them before the architect asks

## Pipeline stages (in order)
1. **analyst** → reads intake docs → produces prd.md
   Architect should check: open items, systems identified, scope accuracy
2. **architect** → walks 6-level decision tree → produces architecture.md + decisions.json
   Architect should check: pattern choice rationale, compensating transactions, security tier, connector versions
3. **pm** → produces stories.md from decisions.json
   Architect should check: story completeness, critical path, foundation stories first
4. **scaffold** → generates compilable MuleSoft 4.8.0 project
   Architect should check: connector versions (approximate ones need Exchange verification before mvn compile)
5. **create_repo** → pushes scaffold to GitHub with devcontainer

## How to respond
- Short and direct — bullet points preferred
- Always end with: what just happened + what the architect should do or think about next
- For large content (full PRD review, architecture breakdown) → use post_canvas tool
- If architect says "re-run X" or "change Y and re-run" → run_pipeline_stage with their feedback as the feedback param
- If architect asks "how did we..." or "what's the standard for..." → read_knowledge then answer from it

## Handling yes/no replies
The pipeline posts a question after every stage (e.g. "Should I run the analyst?").
- If architect replies *yes* (or "go ahead", "proceed", "do it", "looks good") → immediately run the stage that was just asked about. Do not ask again.
- If architect replies *no* → ask what they want to change or review first.
- Use the thread history to know which stage was last asked about.

## When architect gives feedback for a re-run
Pass it verbatim in the feedback field of run_pipeline_stage. The agent will incorporate it.
Example: "re-run architect — we need event-driven not scheduled, client confirmed real-time"
→ stage: architect, feedback: "we need event-driven not scheduled, client confirmed real-time"

## Field Knowledge Index (call read_knowledge FIELD_KNOWLEDGE.md for full entries)
${fieldKnow.slice(0, 2000)}

## BMAD System Summary
${planCtx.slice(0, 1000)}`;
}

// ─── Agent agentic loop ───────────────────────────────────────────────────────

async function runAgent(userText, slackClient, channelId, threadTs, say, inferredClient) {
  const history = getHistory(threadTs);

  // Prepend client context so architect never has to say "for leolabs"
  const clientContext = inferredClient
    ? `[Context: you are in the #proj-${inferredClient} channel. The active client is "${inferredClient}". All commands apply to this client unless the architect says otherwise.]`
    : `[Context: this is a DM. If the architect doesn't specify a client, ask which one.]`;

  const messageWithContext = `${clientContext}\n\n${userText}`;
  history.push({ role: 'user', content: messageWithContext });

  // Cap history to last 20 turns to avoid token bloat
  const recentHistory = history.slice(-20);

  while (true) {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4000,
      system:     buildSystemPrompt(),
      tools:      TOOLS,
      messages:   recentHistory,
    });

    // Collect text blocks
    const textBlocks = response.content.filter(b => b.type === 'text');
    const toolCalls  = response.content.filter(b => b.type === 'tool_use');

    // Post text to Slack (only when not about to make tool calls)
    if (textBlocks.length > 0 && response.stop_reason !== 'tool_use') {
      const text = textBlocks.map(b => b.text).join('\n').trim();
      if (text) await say({ text, thread_ts: threadTs, mrkdwn: true });
    }

    // Done when no tool calls
    if (toolCalls.length === 0) {
      history.push({ role: 'assistant', content: response.content });
      break;
    }

    // Execute tools
    recentHistory.push({ role: 'assistant', content: response.content });
    history.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    for (const tool of toolCalls) {
      console.log(`→ Tool: ${tool.name}`, JSON.stringify(tool.input).slice(0, 120));
      const result = await executeTool(tool.name, tool.input, slackClient, channelId, threadTs, say);
      toolResults.push({ type: 'tool_result', tool_use_id: tool.id, content: String(result) });
    }

    recentHistory.push({ role: 'user', content: toolResults });
    history.push({ role: 'user', content: toolResults });
  }
}

// ─── Slack App ────────────────────────────────────────────────────────────────

const app = new App({
  token:      process.env.SLACK_BOT_TOKEN,
  appToken:   process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// Infer client name from channel name (proj-leolabs → leolabs)
async function resolveClient(slackClient, channelId) {
  try {
    const info = await slackClient.conversations.info({ channel: channelId });
    const name = info.channel?.name ?? '';
    if (name.startsWith('proj-')) return name.slice(5); // strip proj- prefix
  } catch { /* ignore */ }
  return null;
}

// @mention in a channel
app.event('app_mention', async ({ event, client, say }) => {
  const text      = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  const threadTs  = event.thread_ts ?? event.ts;
  const channelId = event.channel;

  // Infer client from channel name — architect doesn't need to specify it
  const inferredClient = await resolveClient(client, channelId);

  try {
    await runAgent(text, client, channelId, threadTs, say, inferredClient);
  } catch (e) {
    console.error('Agent error:', e.message);
    await say({ text: `⚠️ Agent error: ${e.message}`, thread_ts: threadTs });
  }
});

// Direct messages
app.message(async ({ message, client, say }) => {
  if (message.bot_id || message.subtype) return;
  if (message.channel_type !== 'im') return;

  const threadTs  = message.thread_ts ?? message.ts;
  const channelId = message.channel;
  const text      = message.text ?? '';

  try {
    await runAgent(text, client, channelId, threadTs, say, null);
  } catch (e) {
    console.error('Agent error:', e.message);
    await say({ text: `⚠️ Agent error: ${e.message}`, thread_ts: threadTs });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

(async () => {
  if (!process.env.SLACK_BOT_TOKEN)   throw new Error('SLACK_BOT_TOKEN not set');
  if (!process.env.SLACK_APP_TOKEN)   throw new Error('SLACK_APP_TOKEN not set (xapp-... Socket Mode token)');
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');

  await app.start();
  console.log('');
  console.log('⚡ BMAD Architect Assistant running (Slack Socket Mode)');
  console.log('   Mention @bmad in any channel, or DM the bot');
  console.log('   Clients:', listClients().join(', ') || 'none yet');
  console.log('');
})().catch(e => { console.error(e.message); process.exit(1); });
