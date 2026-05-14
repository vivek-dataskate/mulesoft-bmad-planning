---
name: project-folder-structure
description: Canonical top-level folder structure after May 2026 restructure — use this when creating files or referencing paths
metadata: 
  node_type: memory
  type: project
  originSessionId: c76a324f-6e9b-444d-91d0-4afc40a69e5d
---

Folder restructure completed 2026-05-11. All 123 tests pass.

**Why:** Simplify the repo so planning artifacts, scaffold code, and reusable system IP each have a clear home. Old structure mixed doc templates, story templates, and connector stubs in `templates/` alongside `story-library/` and `commons/standards/playbooks/` at different depths.

**New canonical structure:**

| Path | Purpose |
|------|---------|
| `standards/playbooks/{system}/` | System-specific IP — {system}_playbook.json, DWL transforms, XML sub-flows. Was `commons/standards/playbooks/`. |
| `commons/` | Anypoint Exchange published module only — `src/`, `exchange/`, `sales/`, `pom.xml`, `publish.sh`. No playbooks here anymore. |
| `standards/DESIGN_STANDARDS.md` | Design constitution. Was `standards/MULESOFT_DESIGN_STANDARDS.md`. |
| `standards/scenarios/` | Integration pattern scenario files (A–W). Unchanged. |
| `standards/doc-templates/` | Document templates — prd-template.md, architecture-template.md, story-template.md. Was `templates/`. |
| `standards/stories/` | PM agent reusable story templates. Was `story-library/`. |
| `scaffold/connectors/` | Per-connector XML config stubs used by generate.js. Was `templates/connectors/`. |
| `scaffold/generate.js` | Uses `path.join(__dirname, 'connectors')` for CONN_TMPL after restructure. |

**How to apply:** Whenever creating new files, use the new paths. All agent TOMLs, generate.js, run-pipeline.js, generate-capabilities.js, and capabilities.yml have been updated. Do NOT use old paths like `commons/standards/playbooks/`, `story-library/`, `templates/connectors/`, or `MULESOFT_DESIGN_STANDARDS.md`.

**Deleted:** `docs/SHIP_COMMAND.md`, `docs/CHUNK_PROGRESS.md`, `docs/SLACK_BOT_SETUP.md` (all stale). `projects/zyris/use-case-*/` and `projects/new-client/` (old placeholder structure).
