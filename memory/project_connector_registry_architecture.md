---
name: project_connector_registry_architecture
description: Connector registry split into 3 files; agent index files auto-rebuilt via hook on every registry edit
metadata: 
  node_type: memory
  type: project
  originSessionId: 12b28f68-1a25-46ee-844b-f830283c4f71
---

The 368KB `connector-registry.json` is the source of truth (build manifest for scaffold). Agents never load it directly.

Two lightweight derived files are generated from it:
- `standards/connector-names.json` (~65KB) — display names + auth + category for all 350 connectors. Loaded by Rex (pipeline agent 3) for connector matching.
- `standards/connector-registry.json` (~155KB) — adds `notes` + `authOptions`. Queried on-demand after inference via `python3 standards/query-connector.py key1 key2 ...`.

**Rebuild script:** `node standards/build-connector-index.js`

**Auto-rebuild hook:** `.claude/settings.json` PostToolUse on `Edit|Write` — fires whenever `connector-registry.json` is edited and automatically rebuilds both index files. This is committed to the repo and survives Codespace rebuilds.

**Why:** loading the full 368KB registry into agent context every session was a major driver of context explosion. The 2-tier approach reduces per-session registry footprint by 82%.

**How to apply:** never tell Vivek to run the build script manually — it runs automatically on every registry edit.
