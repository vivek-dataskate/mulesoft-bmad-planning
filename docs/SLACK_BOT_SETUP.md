# BMAD Architect Assistant — Slack Bot Setup

The bot runs in Socket Mode — no public URL needed, no hosting required beyond a machine with outbound internet.

## 1. Create the Slack App

1. Go to https://api.slack.com/apps → **Create New App** → **From scratch**
2. Name: `BMAD Architect Assistant`, choose your workspace
3. Under **Socket Mode** → enable it → generate an **App-Level Token** with `connections:write` scope
   - Save as `SLACK_APP_TOKEN` (starts with `xapp-`)

## 2. Add Bot Scopes

Under **OAuth & Permissions** → **Bot Token Scopes**, add:

| Scope | Why |
|---|---|
| `app_mentions:read` | Respond to @bmad mentions |
| `chat:write` | Post messages |
| `im:write` | Send DMs |
| `im:history` | Read DM history |
| `channels:history` | Read channel history for context |
| `canvases:write` | Create rich canvases |
| `canvases:read` | Read canvases |

## 3. Enable Events

Under **Event Subscriptions** → enable → **Subscribe to Bot Events**:
- `app_mention`
- `message.im`

## 4. Install to Workspace

**OAuth & Permissions** → **Install to Workspace** → copy the **Bot User OAuth Token**
- Save as `SLACK_BOT_TOKEN` (starts with `xoxb-`)

## 5. Invite bot to your pipeline channel

In Slack, open your pipeline channel and type:
```
/invite @BMAD Architect Assistant
```

## 6. Run the bot

```bash
# Install dependencies
npm install @slack/bolt @anthropic-ai/sdk

# Run
SLACK_BOT_TOKEN=xoxb-...  \
SLACK_APP_TOKEN=xapp-...  \
ANTHROPIC_API_KEY=sk-...  \
GITHUB_TOKEN=ghp-...      \
GITHUB_ORG=your-org       \
node scaffold/slack-bot.js
```

To keep it running permanently, use `pm2` or any process manager:
```bash
pm2 start scaffold/slack-bot.js --name bmad-bot \
  --env SLACK_BOT_TOKEN=xoxb-... \
  --env SLACK_APP_TOKEN=xapp-... \
  --env ANTHROPIC_API_KEY=sk-...
```

## 7. Talk to it

In your pipeline channel, mention the bot or DM it directly:

```
@bmad what clients do we have active?
@bmad run analyst for leolabs
@bmad looks good, run architect
@bmad re-run architect — change the pattern to H, client confirmed real-time is needed
@bmad what's the NetSuite risk on this project?
@bmad how did we standardise pagination?
@bmad show me the architecture decisions for leolabs
@bmad what should I review before approving this PRD?
@bmad generate the scaffold for leolabs
```

The bot maintains conversation context per Slack thread — ask follow-up questions naturally.

## Environment variables reference

| Variable | Required | Description |
|---|---|---|
| `SLACK_BOT_TOKEN` | Yes | `xoxb-...` bot token |
| `SLACK_APP_TOKEN` | Yes | `xapp-...` Socket Mode token |
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `GITHUB_TOKEN` | For repo creation | PAT with `repo` scope |
| `GITHUB_ORG` | For repo creation | GitHub org or username |
