# Claude Code — Project Conventions

Read `docs/PLANNING_CONTEXT.md` at the start of every session before doing anything else.

**UI feedback rule:** Any time the user gives negative feedback on UI or HTML output (e.g. "this is wrong", "fix this", "don't do that"), immediately save that feedback to three places:
1. `commons/branding/HTML_DESIGN_STANDARDS.json` — add to the `forbidden` array (keep the .md as a human pointer only)
2. `memory/` — save or update a feedback memory file
3. This `CLAUDE.md` file — add to the relevant section if it's a recurring pattern

Do not wait to be asked. The goal is that no UI mistake is ever repeated across sessions.

**HTML lint enforcement:** `commons/branding/lint-html.js` runs automatically (via PostToolUse hook) after every `.html` file is written or edited. If it reports violations, fix them immediately — do not defer or explain them away. Every `.html` file in this repo must pass all lint checks before the session ends.

**FROZEN TEMPLATE — `commons/templates/intake-template.html`:** This file is frozen as of 2026-05-14. The current design (collapsible section tiles, compact Q grid, sticky bar, UC details/summary, white-page standards) is the approved baseline. Do NOT modify this file without explicit user approval. If a change is needed, state what will change and wait for confirmation before touching the file.

**Recurring HTML violations — never repeat these:**
- No dark header (`.header { background: var(--dark) }`) — headers must be white
- No gray page background (`background: #F5F5F5`) — body must be `background: #fff`
- No circle section numbers (`.section-num` with `border-radius:50%` + fill)
- No card-style section wrappers (`.section` with `border-radius`)
- No off-palette CSS variables (`--blue`, `--gray`, etc.) — only the 11 standard vars allowed
- These rules apply to ALL document types: portals, intake forms, proposals, sales materials

---

## Team

### Architects (choose one per engagement during Scout onboarding)
| Name | Email | Notes |
|---|---|---|
| Kailash Chanda | kailash@dataskate.ai | Default for new engagements |
| Raghuram Potluri | raghuram@dataskate.ai | Assigned to Peerless and CE/legacy-ERP engagements |

- **Business lead / account:** Vivek Yadlapalli — vivek@dataskate.ai
- **Slack default invite email for new project channels:** vivek@dataskate.ai (hardcoded as `SLACK_DEFAULT_ARCHITECT_EMAIL` in slack-agent.js)

The assigned architect is stored in `project.json` as both `architect` (display name) and `architectEmail` (email). The CC on all client-facing emails (intake HTML, proposal) must use `architectEmail` from project.json — never hardcode a specific architect's email.

**Footer rule for DataSkate sales materials** (flyer, pricing guide, architect guide): use `kailash@dataskate.ai` as the primary contact. Kailash Chanda is the owner of the DataSkate integration service. Do not use `vivek@dataskate.ai` in footers of these documents.

---

## Issue Tracking (Three-Track Strategy)

- **Jira** — client-facing tickets (client sees these; external coordination)
- **GitHub Issues in client dev repo** — developer task coordination (auto-created from `stories.md` by Chunk 9)
- **GitHub Issues in planning repo** — tech lead only — system learning and cross-project decisions

Labels on client dev repo issues: pattern name, layer (system/process/experience), priority
Labels on planning repo issues: `field-knowledge-candidate`, `cross-project`, pattern name
Milestones in client dev repo: one per project sprint
A `field-knowledge-candidate` label on a planning repo issue = candidate for FK-NNN entry in FIELD_KNOWLEDGE.md
Planning repo will be made private once all 10 chunks are complete.

---

## FIELD_KNOWLEDGE.md Format

- `Status` appears **only** in the Index table row — never in the FK detail body.
- The detail body contains: Date, Project, Trigger, Scenario, What failed, What worked, Client question used, Promotes to.

---

## Scout Output Path

- The intake questionnaire is always written to `projects/{client}/intake/intake-questionnaire-{client}.md` — client name appended to the filename for easy sharing. Never written to the client root folder.
- **The intake questionnaire file is Scout-generated and must never be manually edited.** If something is wrong in the questionnaire, fix the Scout agent definition (`_bmad/custom/bmad-agent-scout.toml`) and regenerate via Scout. Manual edits bypass the generation logic and create structural divergence that breaks downstream agents.

---

## Pipeline

Scout → Analyst → **VP (Validate PRD)** → Architect (MD) → PM → Scaffold → **Client repo created** → Developer (Anypoint Studio) → **Dev agent (VR — Verify)** → Architect (CO)

**Planning repo** (this repo) — used by tech lead / architect only:
- All agent steps up to and including Scaffold run here
- stories.md is included in the generated client repo

**Client dev repo** — used by developers:
- Developer implements flows in Anypoint Studio / Anypoint Code Builder (fills in TODO comments)
- Dev agent (`bmad-agent-dev`) is run in the client repo Codespace **only for test verification**:
  - Runs MUnit test suite (`mvn munit:test`)
  - Checks coverage floors from decisions.json against actual results
  - Verifies all FRs and NFRs from stories.md are addressed in the implementation
  - Produces a verification report — PASS or list of gaps
  - Does NOT generate MuleSoft XML code — that is the developer's job in Anypoint Studio

---

## Folder Structure

- `standards/playbooks/{system}/` — the authoritative source for system-specific field knowledge. Each playbook contains {system}_playbook.json (quirks, auth, supported objects, maturity log) + DataWeave mapping files (canonical ↔ system) + reusable Mule XML sub-flows.
- `standards/canonical-models/{vertical}/` — canonical hub schemas organized by industry vertical (e.g. `commerce/`, `construction/`, `hr/`). One YAML per record type (e.g. `canonical-job.yaml`, `canonical-contract.yaml`). These are planning-time reference schemas — agents read them during field mapping; the DWL transforms in standards/playbooks/ implement them. **Never put canonical models in `commons/`** — commons is runtime code only.
- `standards/client-registry.json` — authoritative list of all DataSkate client engagements. Scout writes a new entry at S1-CLOSE. Fields: slug, displayName, vertical, sizeSegment, systems[], architect, architectEmail, status, engagementDate, projectContext. Use case library DS entries reference clients by slug — look up displayName/projectContext here.
- `standards/usecases/{vertical}.json` — use case library, one file per industry vertical (b2b-saas, construction, healthcare, etc.). source: "web" entries keep full fields (sourceCompany, sourceUrl). source: "DS" entries are lean — only sizeSegment, systems[], useCase, whatWasBuilt, outcome, aiLayer, clients[] (displayName/projectContext resolved from client-registry.json). Scout reads before web research (vertical+size+systems → FOMO; vertical+size only → aiThoughtStarters tiles) and writes back after each session.
- `standards/scenarios/` — generic integration pattern templates (webhook-ingestion, batch, scheduled-sync, etc.). Promoted FK entries that describe a general pattern land here.
- `standards/stories/` — reusable story templates for the PM agent. One file per story type.
- `standards/doc-templates/` — document templates: prd-template.md, architecture-template.md, story-template.md.
- `scaffold/connectors/` — per-connector XML config stubs used by the scaffold generator.
- `commons/branding/` — canonical UI/design standards for all HTML output in this system. `HTML_DESIGN_STANDARDS.json` is the machine-readable source of truth for palette vars, forbidden patterns, component HTML, and template pipeline. `HTML_DESIGN_STANDARDS.md` is a human-readable pointer to the JSON — do not add rules there. Every HTML file generated by any agent or written manually must conform to the JSON.
- `commons/` — DataSkate's own reusable **runtime** MuleSoft code: Mule XML sub-flows, DWL utilities, pom.xml, branding, sales materials. NOT for canonical schemas or planning artifacts.
- `projects/{client}/canonical-extensions.yaml` — per-client field extensions to the canonical models. Created by Scout (shell), populated by Analyst (confirmed fields). Documents addedFields, renamedFields, omittedFields per record type for this client.
- `standards/field-schemas/` — DO NOT CREATE files here. This directory should not exist. System field knowledge belongs in `standards/playbooks/{system}/{system}_playbook.json`.
- When a new system is encountered on a client project, create a new playbook under `standards/playbooks/{system}/` — not a field schema file.

## Canonical Model Maintenance Rules

- **Vertical is derived from `company_context.json` `industry` field** — never inferred from the client name.
- **`standards/canonical-models/registry.json`** is the authoritative map of vertical → industry standard → record → field alignments. Agents must read it before creating canonical stubs or validating field mappings. Standards covered: OAGIS 10.x (commerce), ACORD XML (insurance), HL7 FHIR R4 (healthcare), HR Open Standards 4.x (hr), IFX/MISMO (financial-services), X12/EDIFACT (edi-b2b), derived (construction, nonprofit).
- **Scout** creates canonical model stubs when a new vertical or record type is detected (Step 7D). Reads `businessObjects[]` from `company_context.json`, then reads registry.json to pre-populate the stub with the correct `standard`/`standardBody`/`standardRef`/`deviations` headers.
- **Analyst** validates all field mapping tables against canonical models (Step 5c), consulting registry.json `keyFieldAlignments` as the reference for canonical field names, and populates `canonical-extensions.yaml` per client.
- **Playbook DWL files** implement canonical ↔ system transforms; they reference the canonical schema but live in `standards/playbooks/{system}/`.
- **generate.js** conditionally generates two DWL files (source→canonical, canonical→target) when a flow has `entity` + `canonicalModel` set, is bidirectional, or the same entity appears in 3+ flows. Single DWL otherwise.
- When a canonical stub accumulates confirmed fields from 2+ clients, the Architect promotes it from stub to a versioned schema.
- `commons/exchange/` does not exist — any file found there is misplaced and must be moved to `standards/canonical-models/{vertical}/`.
