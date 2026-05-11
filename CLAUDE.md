# Claude Code — Project Conventions

Read `docs/PLANNING_CONTEXT.md` at the start of every session before doing anything else.

---

## Team

- **Primary architect:** Vivek Yadlapalli — default assignee for all new BMAD client projects
- **Email:** vivek@dataskate.ai
- **Slack default invite email for new project channels:** vivek@dataskate.ai (hardcoded as `SLACK_DEFAULT_ARCHITECT_EMAIL` in slack-agent.js)

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

---

## Pipeline

Scout → Analyst → Architect (MD) → PM → Scaffold → **Developer uses Anypoint Studio** → Architect (CO)

The Dev agent (`bmad-agent-dev`) is NOT used. Developers implement flows directly in Anypoint Studio against the generated scaffold. The planning repo is only used by the tech lead / architect.

---

## Commons Structure

- `commons/playbooks/{system}/` — the authoritative source for system-specific field knowledge. Each playbook contains PLAYBOOK.md (quirks, auth, supported objects, maturity log) + DataWeave mapping files (canonical ↔ system) + reusable Mule XML sub-flows. Field knowledge lives here, not in `standards/`.
- `standards/scenarios/` — generic integration pattern templates (webhook-ingestion, batch, scheduled-sync, etc.). Promoted FK entries that describe a general pattern land here.
- `standards/field-schemas/` — DO NOT CREATE files here. This directory should not exist. System field knowledge belongs in `commons/playbooks/{system}/PLAYBOOK.md`.
- When a new system is encountered on a client project, create a new playbook under `commons/playbooks/{system}/` — not a field schema file.
