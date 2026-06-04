# Archive: Monolithic Orchestrator (v1)

**Archived:** 2026-06-04  
**Replaced by:** `pipeline/langgraph/orchestrator.mjs`

## What's here

The original Claude-CLI-subprocess orchestrator and its supporting files, preserved for reference.

| File | Role |
|---|---|
| `orchestrate.js` | 2,584-line monolithic Scout pipeline runner; spawned `claude` CLI as a subprocess per agent |
| `infer-client.js` | Gemini-based client name inference from `_inbox/` documents; only called by orchestrate.js |
| `tools/cost-model.js` | Token cost calculator; only used by orchestrate.js |
| `tools/session-decomp.js` | Session decomposition utilities; only used by orchestrate.js |
| `agents/*.toml` | Per-agent system prompts (11 agents); replaced by `pipeline/langgraph/agents/*-runner.mjs` |

## Why it was replaced

- Agents (hawk, mira) often exited without calling the Write tool, silently producing no output
- Full TOML re-sent every turn — vera.toml was 103KB of context waste per round
- No structured checkpointing; state in `pipeline-state.json` was fragile
- Claude-CLI subprocess dependency made CI/cloud runs brittle

## Production entry point

```
OPENROUTER_API_KEY=sk-or-... node pipeline/langgraph/orchestrator.mjs --client <slug> --pipeline
```

Agent registry: `pipeline/scout/pipeline.json` (still the source of truth)
