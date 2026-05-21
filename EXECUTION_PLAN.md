# Folder Structure Refactor — Execution Plan

> **For any Claude Code session continuing this work**: read this file first, then check the todo list.
> This is a multi-session refactor. Each phase ends with a commit. Pick up from the first incomplete phase.

**Branch:** `refactor/folder-structure`  
**Started:** 2026-05-21  
**Status:** Phase 2 is next (Phases 0–1 complete)

---

## Final Target Structure

```
/
├── pipeline/           # agent orchestration engine (was DSPipeline + scripts + scaffold tools)
├── portal/             # web UI — Eleventy build + Firebase deploy (merged)
├── mulesoft/           # MuleSoft code generation + knowledge base
├── projects/           # client workspaces (one folder per client)
├── commons/            # shared branding, tokens, sales collateral
├── docs/               # GitHub Pages output only (do not edit manually)
│   └── capabilities/
├── tests/              # portal + pipeline tests (backstop moved here)
├── _inbox/             # raw inbound (Krisp/ moved here)
└── _bmad/              # BMAD framework (output/ moved inside)
```

### `pipeline/`
```
pipeline/
├── agents/             # Sage, Vera, Rex, Ivy, Flo, Hawk, Quinn, Petra, Sol, Mira
├── scout/              # orchestrate.js, pipeline.json
├── marketing/          # future pipeline
├── renewal/            # future pipeline
├── scripts/            # was root scripts/
├── tools/              # was scaffold/ (minus generate.js, connectors, xml-templates)
├── telemetry/
├── tests/
├── logs/
├── promote-library.js
├── ARCHITECTURE.md
├── AGENT-BOUNDARY-POLICY.md
├── FIELD_KNOWLEDGE.md
└── PLANNING_CONTEXT.md
```

### `portal/`
```
portal/
├── src/                # Eleventy source (was docs/eleventy/site/)
│   ├── intake/
│   ├── internal/
│   ├── portal/
│   └── resources/
├── _includes/
├── _data/
├── _build/
├── public/             # Firebase Hosting served files
├── functions/
├── scripts/            # was firebase/scripts/
├── tests/              # BackstopJS visual regression
├── template-registry.json
├── version-manifest.json
├── firestore.rules
├── storage.rules
├── firebase.json
├── .firebaserc
├── deploy.sh
├── SETUP.md
└── HTML_PIPELINE_MIGRATION.md
```

### `mulesoft/`
```
mulesoft/
├── generate.js         # decisions.json → compilable Mule project
├── connectors/         # XML connector config stubs
├── templates/          # Mule project scaffolding (flows, pom, munit, DWL)
│   └── devcontainer/
├── canonical-models/
├── playbooks/
│   ├── salesforce/
│   ├── netsuite/ ...   # 30+ connector playbooks
│   ├── scenarios/
│   ├── usecases/
│   └── stories/
├── diagram-templates/  # Mermaid .mmd templates by engagement level
│   ├── scoping/
│   ├── sow/
│   ├── prd/
│   ├── architecture/
│   ├── dev/
│   ├── production/
│   └── hypercare/
├── src/                # Mule application source (was commons/src/)
├── tests/
├── doc-templates/      # PRD, story, architecture templates
├── connector-registry.json
├── connector-names.json
├── snippet-registry.json
├── diagram-registry.json
├── diagram-theme.json
├── build-connector-index.js
├── query-connector.py
├── DESIGN_STANDARDS.md
├── PATTERNS_RESEARCH.md
├── DIAGRAM_FRAMEWORK.md
└── pom.xml
```

### `projects/`
```
projects/
├── _template/          # copied by orchestrate.js on new client
│   ├── project.json
│   ├── decisions.json
│   ├── company_context.json
│   ├── scoping/
│   │   ├── transcripts/.gitkeep
│   │   ├── run/.gitkeep
│   │   └── diagrams/.gitkeep
│   ├── intake/
│   │   ├── run/.gitkeep
│   │   ├── client/.gitkeep
│   │   └── diagrams/.gitkeep
│   ├── sow/
│   │   ├── run/.gitkeep
│   │   ├── client/.gitkeep
│   │   └── diagrams/.gitkeep
│   ├── requirements/
│   │   ├── prd/.gitkeep
│   │   ├── architecture/.gitkeep
│   │   └── diagrams/.gitkeep
│   ├── planning/
│   │   ├── epics/.gitkeep
│   │   ├── stories/.gitkeep
│   │   ├── sprints/.gitkeep
│   │   └── backlog/.gitkeep
│   ├── dev/
│   │   ├── {slug}-integration/    # MuleSoft stub — renamed on client copy
│   │   └── diagrams/.gitkeep
│   ├── test/
│   │   ├── plans/.gitkeep
│   │   ├── results/.gitkeep
│   │   └── smoke/.gitkeep
│   └── hypercare/
│       ├── monitoring/.gitkeep
│       └── checklist/.gitkeep
├── client-registry.json
├── project-statuses.json
├── decisions-schema.json
├── agilemind/
├── homage/
└── sample/
```

### `commons/`
```
commons/
├── branding/
├── templates/
├── tokens/             # moved from root tokens/
├── sales/
│   ├── pricing-model.md
│   ├── proposal-structure.md
│   ├── about-dataskate.md
│   ├── architect-guide.md
│   ├── tm-rates.json
│   ├── psychology-profiles.json
│   └── reference-network.json
└── social-proof/
    └── client-case-studies.json
```

---

## Phase Checklist

### Phase 0 — Pre-flight ✅
- [x] Create branch `refactor/folder-structure`
- [x] Run `npm test` — confirm baseline green (123/123)
- [x] Confirm `git status` clean
- 📌 **COMMIT: `chore: pre-refactor baseline — cleanup dead scaffold files, update scripts, add EXECUTION_PLAN`**

---

### Phase 1 — Zero-reference moves ✅
No code references to update — pure `git mv`.
- [x] `git mv Krisp/ _inbox/Krisp/`
- [x] `git mv tokens/ commons/tokens/`
- [x] `git mv _bmad-output/ _bmad/output/`
- [x] `mv backstop.json tests/backstop/` (gitignored — mv + .gitignore unchanged)
- [x] `git mv backstop_data/ tests/backstop/backstop_data/`
- 📌 **COMMIT: `refactor: move zero-reference files to final locations`**

---

### Phase 2 — Assemble `pipeline/`
- [ ] `git mv DSPipeline/ pipeline/`
- [ ] `git mv logs/ pipeline/logs/`
- [ ] `git mv scripts/ pipeline/scripts/`
- [ ] `git mv scaffold/extract-text.js pipeline/tools/`
- [ ] `git mv scaffold/generate-capabilities.js pipeline/tools/`
- [ ] `git mv scaffold/generate-client-portal.js pipeline/tools/`
- [ ] `git mv scaffold/generate-knowledge-base.js pipeline/tools/`
- [ ] `git mv scaffold/check-registry-freshness.js pipeline/tools/`
- [ ] `git mv scaffold/create-client-repo.sh pipeline/tools/`
- [ ] `git mv scaffold/create-github-issues.sh pipeline/tools/`
- [ ] `git mv docs/FIELD_KNOWLEDGE.md pipeline/`
- [ ] `git mv docs/PLANNING_CONTEXT.md pipeline/`
- [ ] `git mv docs/TEST_STRATEGY.md pipeline/`
- 📌 **COMMIT: `refactor: assemble pipeline/ from DSPipeline + scripts + scaffold tools`**

---

### Phase 3 — Assemble `mulesoft/`
- [ ] `git mv scaffold/generate.js mulesoft/`
- [ ] `git mv scaffold/connectors/ mulesoft/connectors/`
- [ ] `git mv scaffold/xml-templates/ mulesoft/templates/`
- [ ] `git mv scaffold/devcontainer-templates/ mulesoft/templates/devcontainer/`
- [ ] `git mv standards/canonical-models/ mulesoft/canonical-models/`
- [ ] `git mv standards/playbooks/ mulesoft/playbooks/`
- [ ] `git mv standards/scenarios/ mulesoft/playbooks/scenarios/`
- [ ] `git mv standards/usecases/ mulesoft/playbooks/usecases/`
- [ ] `git mv standards/stories/ mulesoft/playbooks/stories/`
- [ ] `git mv standards/connector-registry.json mulesoft/`
- [ ] `git mv standards/connector-names.json mulesoft/`
- [ ] `git mv standards/snippet-registry.json mulesoft/`
- [ ] `git mv standards/build-connector-index.js mulesoft/`
- [ ] `git mv standards/query-connector.py mulesoft/`
- [ ] `git mv standards/DESIGN_STANDARDS.md mulesoft/`
- [ ] `git mv standards/doc-templates/ mulesoft/doc-templates/`
- [ ] `git mv docs/PATTERNS_RESEARCH.md mulesoft/`
- [ ] `git mv docs/DIAGRAM_FRAMEWORK.md mulesoft/`
- [ ] `git mv commons/src/ mulesoft/src/`
- [ ] `git mv commons/pom.xml mulesoft/`
- [ ] `git mv commons/publish.sh mulesoft/`
- [ ] Remove empty `scaffold/` directory
- 📌 **COMMIT: `refactor: assemble mulesoft/ from scaffold + standards + commons Maven`**

---

### Phase 4 — Assemble `portal/`
- [ ] `git mv docs/eleventy/_includes/ portal/_includes/`
- [ ] `git mv docs/eleventy/_data/ portal/_data/`
- [ ] `git mv docs/eleventy/_build/ portal/_build/`
- [ ] `git mv docs/eleventy/site/ portal/src/`
- [ ] `git mv docs/eleventy/template-registry.json portal/`
- [ ] `git mv docs/eleventy/version-manifest.json portal/`
- [ ] `git mv firebase/public/ portal/public/`
- [ ] `git mv firebase/functions/ portal/functions/`
- [ ] `git mv firebase/scripts/ portal/scripts/`
- [ ] `git mv firebase/firestore.rules portal/`
- [ ] `git mv firebase/storage.rules portal/`
- [ ] `git mv firebase/firebase.json portal/`
- [ ] `git mv firebase/.firebaserc portal/`
- [ ] `git mv firebase/deploy.sh portal/`
- [ ] `git mv firebase/SETUP.md portal/`
- [ ] `git mv docs/HTML_PIPELINE_MIGRATION.md portal/`
- [ ] Remove empty `firebase/` and `docs/eleventy/` directories
- 📌 **COMMIT: `refactor: merge firebase + eleventy into portal/`**

---

### Phase 5 — Restructure `commons/` and `projects/`
- [ ] `git mv standards/reference-network.json commons/sales/`
- [ ] `git mv standards/intake-checklist.json pipeline/`
- [ ] `git mv standards/client-registry.json projects/`
- [ ] `git mv standards/project-statuses.json projects/`
- [ ] `git mv standards/decisions-schema.json projects/`
- [ ] Remove empty `standards/` directory
- [ ] Create `projects/_template/` with all phase folders + placeholder files
- [ ] Create placeholder `project.json`, `decisions.json`, `company_context.json` in `_template/`
- 📌 **COMMIT: `refactor: restructure commons/ + projects/ + create _template`**

---

### Phase 6 — Update path references in scripts and agents
Files to update (17 total):

| File | References to fix |
|---|---|
| `mulesoft/generate.js` | `standards/` → `mulesoft/`, `scaffold/xml-templates/` → `mulesoft/templates/`, `scaffold/connectors/` → `mulesoft/connectors/` |
| `pipeline/scout/orchestrate.js` | `DSPipeline/` → `pipeline/` |
| `pipeline/promote-library.js` | `standards/usecases/` → `mulesoft/playbooks/usecases/` |
| `pipeline/tools/generate-capabilities.js` | `standards/` → `mulesoft/`, `DSPipeline/` → `pipeline/` |
| `pipeline/tools/generate-knowledge-base.js` | `standards/` → `mulesoft/`, `DSPipeline/` → `pipeline/` |
| `pipeline/tools/generate-client-portal.js` | `firebase/public/` → `portal/public/`, `docs/eleventy/` → `portal/` |
| `pipeline/scripts/regen-all-clients.js` | `scaffold/` → `mulesoft/` + `pipeline/tools/` |
| `pipeline/scripts/update-firebase.js` | `firebase/` → `portal/` |
| `pipeline/scripts/build-tokens.js` | `tokens/` → `commons/tokens/` |
| `mulesoft/build-connector-index.js` | `standards/` → `mulesoft/` |
| `pipeline/agents/*.toml` (6 files) | `standards/` → `mulesoft/` |
| `_bmad/custom/*.toml` (5 files) | `standards/` → `mulesoft/`, `DSPipeline/` → `pipeline/` |
| `tests/integration/scaffold-generate.test.js` | `scaffold/` → `mulesoft/`, `standards/` → `mulesoft/` |
| `tests/unit/scaffold/*.test.js` (5 files) | `scaffold/` → `mulesoft/`, `standards/` → `mulesoft/` |
| `portal/_data/branding.js` | `commons/` paths |
| `portal/_data/clients.js` | `projects/` + `firebase/` paths |
| `portal/src/intake/*.11tydata.js` | `standards/` → `mulesoft/`, `commons/` paths |

- 📌 **COMMIT: `refactor: update all internal path references to new folder structure`**

---

### Phase 7 — Update config files
- [ ] `.eleventy.js` — input: `portal/src`, output: `portal/_build`, includes: `portal/_includes`, data: `portal/_data`
- [ ] `package.json` — all script paths
- [ ] `.gitignore` — `firebase/.firebase` → `portal/.firebase`, `docs/eleventy/_build` → `portal/_build`
- [ ] `.prettierignore` — update paths
- [ ] `.stylelintrc.json` — update paths
- [ ] `.github/workflows/portal.yml` — all paths
- [ ] `.github/workflows/capabilities.yml` — `standards/` → `mulesoft/`
- [ ] `tests/backstop/backstop.json` — update report/bitmap paths
- 📌 **COMMIT: `refactor: update .eleventy.js, package.json, and CI workflow paths`**

---

### Phase 8 — Migrate existing clients to phase-based structure
For `agilemind/`, `homage/`, `sample/`:
- [ ] Create all phase folders matching `_template/`
- [ ] Move agent JSONs from `run/` → `scoping/run/`
- [ ] Move intake HTML → `intake/client/`
- [ ] Move raw transcripts → `scoping/transcripts/`
- [ ] `project.json`, `decisions.json`, `company_context.json` stay at client root
- 📌 **COMMIT: `refactor: migrate agilemind + homage + sample to phase-based structure`**

---

### Phase 9 — Update `DIAGRAM_FRAMEWORK.md`
- [ ] Update all `standards/diagram-templates/` → `mulesoft/diagram-templates/`
- [ ] Update `standards/diagram-registry.json` → `mulesoft/diagram-registry.json`
- [ ] Update `standards/diagram-theme.json` → `mulesoft/diagram-theme.json`
- [ ] Add `production/` level section (runtime topology, monitoring, incident response, api-dependency-map)
- [ ] Confirm `hypercare/` level is complete (issue-triage, error-rate, scope-change, handoff-checklist)
- [ ] Add `production/` and `hypercare/` diagram folders to `projects/_template/` diagrams
- [ ] Update `projects/{client}/diagrams/` references throughout doc
- 📌 **COMMIT: `docs: update DIAGRAM_FRAMEWORK.md — new paths + production + hypercare levels`**

---

### Phase 10 — Update `orchestrate.js` for `_template`
- [ ] Replace ad-hoc folder creation with `cp -r projects/_template/ projects/{client}/`
- [ ] Replace `{slug}` placeholder in `dev/{slug}-integration/` with actual client slug on copy
- [ ] Test new client provisioning end to end
- 📌 **COMMIT: `feat: orchestrate.js provisions new clients from _template/`**

---

### Phase 11 — Verification
- [ ] `npm run build` — portal builds clean
- [ ] `npm test` — all tests pass
- [ ] `node pipeline/scout/orchestrate.js --client homage --skip-onboarding` — pipeline runs
- [ ] `node mulesoft/generate.js projects/sample/decisions.json` — generates stub
- [ ] GitHub Actions workflow syntax check
- 📌 **COMMIT: `test: post-refactor verification — all systems green`**

---

### Phase 12 — Cleanup
- [ ] `grep -r "standards/\|DSPipeline/\|scaffold/\|firebase/public\|docs/eleventy"` — catch stragglers
- [ ] Remove any remaining empty directories
- [ ] Update `README.md` with new folder map
- [ ] Update memory files
- 📌 **COMMIT: `chore: post-refactor cleanup — remove empty dirs + update README`**
