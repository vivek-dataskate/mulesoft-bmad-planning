# CHUNK 1 — Repo Foundation — COMPLETE

Completed: 2026-05-10

## What Was Built

### Standards
- `standards/decisions-schema.json` — empty template for architect to fill per project
- `standards/connector-registry.json` — all 14 connectors with versions, auth types, and required properties
- `standards/scenarios/` — placeholder (filled in CHUNK 2)

### Templates
- `templates/connectors/` — placeholder (filled in CHUNK 6)

### Story Library
- `story-library/` — placeholder (filled in CHUNK 5)

### Scaffold
- `scaffold/xml-templates/` — placeholder (filled in CHUNK 6)
- `scaffold/generate.js` — placeholder (CHUNK 7)
- `scaffold/create-client-repo.sh` — placeholder (CHUNK 8)

### Projects
- `projects/leolabs/intake/` — ready for LeoLabs discovery docs
- `projects/new-client/intake/` — template folder for any new client

### Repo Config
- `.devcontainer/devcontainer.json` — planning repo Codespace (Node 18, GitHub CLI, MuleSoft MCP Server)
- `.gitignore` — excludes node_modules, secrets, generated output
- `README.md` — full tech lead instructions: quick start, folder guide, standards reference

## Connector Registry Coverage

All 14 connectors registered with correct Maven coordinates:

| Key | Artifact | Version |
|-----|---------|---------|
| `salesforce` | mule-salesforce-connector | 10.18.0 |
| `netsuite` | mule-netsuite-connector | 10.5.0 |
| `anypoint-mq` | mule-anypoint-mq-connector | 4.0.5 |
| `http` | mule-http-connector | 1.9.3 |
| `database-mysql` | mule-db-connector | 1.14.4 |
| `database-postgresql` | mule-db-connector | 1.14.4 |
| `mongodb` | mule-mongodb-connector | 6.3.11 |
| `sftp` | mule-sftp-connector | 2.2.0 |
| `email` | mule-email-connector | 1.7.3 |
| `kafka` | mule-kafka-connector | 4.8.1 |
| `workday` | mule-workday-connector | 16.2.0 |
| `sap` | mule-sap-connector | 5.10.3 |
| `servicenow` | mule-servicenow-connector | 6.13.0 |
| `dynamics365` | mule-microsoft-dynamics-365-connector | 2.4.1 |

## Next Step

**CHUNK 2 — MuleSoft Standards Document**
- `standards/MULESOFT_DESIGN_STANDARDS.md` (full decision tree, all 6 levels)
- `standards/scenarios/real-time.md`
- `standards/scenarios/batch.md`
- `standards/scenarios/event-driven.md`
- `standards/scenarios/scheduled-sync.md`
- `standards/scenarios/hybrid.md`
