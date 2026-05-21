# Folder Structure Refactor — Execution Plan

> **For any Claude Code session continuing this work**: read this file first, then check the todo list.
> This is a multi-session refactor. Each phase ends with a commit. Pick up from the first incomplete phase.

**Branch:** `refactor/folder-structure`  
**Started:** 2026-05-21  
**Status:** Phase 9 is next (Phases 0–8 complete)

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

### Phase 2 — Assemble `pipeline/` ✅
- [x] `git mv DSPipeline/ pipeline/`
- [x] `mv logs/ pipeline/logs/` (gitignored — mv only)
- [x] `git mv scripts/ pipeline/scripts/`
- [x] `git mv scaffold/extract-text.js pipeline/tools/`
- [x] `git mv scaffold/generate-capabilities.js pipeline/tools/`
- [x] `git mv scaffold/generate-client-portal.js pipeline/tools/`
- [x] `git mv scaffold/generate-knowledge-base.js pipeline/tools/`
- [x] `git mv scaffold/check-registry-freshness.js pipeline/tools/`
- [x] `git mv scaffold/create-client-repo.sh pipeline/tools/`
- [x] `git mv scaffold/create-github-issues.sh pipeline/tools/`
- [x] `git mv docs/FIELD_KNOWLEDGE.md pipeline/`
- [x] `git mv docs/PLANNING_CONTEXT.md pipeline/`
- [x] `git mv docs/TEST_STRATEGY.md pipeline/`
- 📌 **COMMIT: `refactor: assemble pipeline/ from DSPipeline + scripts + scaffold tools`**

---

### Phase 3 — Assemble `mulesoft/` ✅
- [x] `git mv scaffold/generate.js mulesoft/`
- [x] `git mv scaffold/connectors/ mulesoft/connectors/`
- [x] `git mv scaffold/xml-templates/ mulesoft/templates/`
- [x] `git mv scaffold/devcontainer-templates/ mulesoft/templates/devcontainer/`
- [x] `git mv standards/canonical-models/ mulesoft/canonical-models/`
- [x] `git mv standards/playbooks/ mulesoft/playbooks/`
- [x] `git mv standards/scenarios/ mulesoft/playbooks/scenarios/`
- [x] `git mv standards/usecases/ mulesoft/playbooks/usecases/`
- [x] `git mv standards/stories/ mulesoft/playbooks/stories/`
- [x] `git mv standards/connector-registry.json mulesoft/`
- [x] `git mv standards/connector-names.json mulesoft/`
- [x] `git mv standards/snippet-registry.json mulesoft/`
- [x] `git mv standards/build-connector-index.js mulesoft/`
- [x] `git mv standards/query-connector.py mulesoft/`
- [x] `git mv standards/DESIGN_STANDARDS.md mulesoft/`
- [x] `git mv standards/doc-templates/ mulesoft/doc-templates/`
- [x] `git mv docs/PATTERNS_RESEARCH.md mulesoft/`
- [x] ~~`git mv docs/DIAGRAM_FRAMEWORK.md mulesoft/`~~ reverted — lives in `docs/`
- [x] `git mv commons/src/ mulesoft/src/`
- [x] `git mv commons/pom.xml mulesoft/`
- [x] `git mv commons/publish.sh mulesoft/`
- [x] Remove empty `scaffold/` directory
- 📌 **COMMIT: `refactor: assemble mulesoft/ from scaffold + standards + commons Maven`**

---

### Phase 4 — Assemble `portal/` ✅
- [x] `git mv docs/eleventy/_includes/ portal/_includes/`
- [x] `git mv docs/eleventy/_data/ portal/_data/`
- [x] `mv docs/eleventy/_build/ portal/_build/` (gitignored — mv only)
- [x] `git mv docs/eleventy/site/ portal/src/`
- [x] `git mv docs/eleventy/template-registry.json portal/`
- [x] `git mv docs/eleventy/version-manifest.json portal/`
- [x] `git mv firebase/public/ portal/public/`
- [x] `git mv firebase/functions/ portal/functions/`
- [x] `git mv firebase/scripts/ portal/scripts/`
- [x] `git mv firebase/firestore.rules portal/`
- [x] `git mv firebase/storage.rules portal/`
- [x] `git mv firebase/firebase.json portal/`
- [x] `git mv firebase/.firebaserc portal/`
- [x] `git mv firebase/deploy.sh portal/`
- [x] `git mv firebase/SETUP.md portal/`
- [x] `git mv firebase/firestore.indexes.json portal/` (was in firebase/, not in plan)
- [x] `git mv docs/HTML_PIPELINE_MIGRATION.md portal/`
- [x] Remove empty `firebase/` and `docs/eleventy/` directories
- 📌 **COMMIT: `refactor: merge firebase + eleventy into portal/`**

---

### Phase 5 — Restructure `commons/` and `projects/` ✅
- [x] `git mv standards/reference-network.json commons/sales/`
- [x] `git mv standards/intake-checklist.json pipeline/`
- [x] `git mv standards/client-registry.json projects/`
- [x] `git mv standards/project-statuses.json projects/`
- [x] `git mv standards/decisions-schema.json projects/`
- [x] Remove empty `standards/` directory
- [x] Create `projects/_template/` with all phase folders + placeholder files
- [x] Create placeholder `project.json`, `decisions.json`, `company_context.json` in `_template/`
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

### Phase 7 — Update config files ✅
- [x] `.eleventy.js` — input: `portal/src`, output: `portal/_build`, includes: `portal/_includes`, data: `portal/_data`; fix `clientLogo` shortcode logo path
- [x] `package.json` — all script paths, jest coverageFrom updated
- [x] `.gitignore` — `firebase/.firebase` → `portal/.firebase`, `docs/eleventy/_build` → `portal/_build`, backstop paths → `tests/backstop/backstop_data/`; untracked accidentally-committed build artifacts
- [x] `.prettierignore` — update paths
- [x] `.stylelintrc.json` — update paths
- [x] `.github/workflows/portal.yml` — all paths
- [x] `.github/workflows/capabilities.yml` — `standards/` → `mulesoft/`
- [x] `tests/backstop/backstop.json` — update firebase → portal URLs (on-disk copy; file is gitignored)
- 📌 **COMMIT: `refactor: update .eleventy.js, package.json, CI workflows, and gitignore paths (Phase 7)`**

---

### Phase 8 — Migrate existing clients to phase-based structure ✅
For `agilemind/`, `homage/`, `sample/`:
- [x] Create all phase folders matching `_template/` (sow/, requirements/, planning/, dev/, test/, hypercare/)
- [x] Move agent JSONs from `run/` → `scoping/run/`
- [x] Move intake HTML + logos → `intake/client/`
- [x] Move `intake/system-diagram.svg` → `intake/diagrams/`
- [x] `project.json`, `decisions.json`, `company_context.json` stay at client root
- [x] Update orchestrate.js, generate-backstop-config.js, generate-diagrams.js, update-firebase.js, proposal.11tydata.js
- [x] .gitignore: `projects/*/scoping/` → `projects/*/scoping/transcripts/` (allow `scoping/run/` to be tracked)
- [x] Also added `agilemind2/` with full phase structure
- 📌 **COMMIT: `refactor: migrate clients to phase-based structure + update all path references (Phase 8)`**

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

---

## Technical Safeguards for Scale

These are not part of the refactor execution but must be implemented as the system scales. Add as follow-on work items after Phase 12.

---

### Safeguard 1 — Protect `projects/_template/` from accidental drift

**Risk:** `orchestrate.js` treats `projects/_template/` as the absolute source of truth for new client structure. Any accidental structural change (added file, renamed folder, missing `.gitkeep`) will silently break or pollute all future client initializations.

**Actions required:**
- [ ] Add a pre-commit hook in `pipeline/scripts/git-hooks/pre-commit` that detects changes to `projects/_template/` and requires explicit confirmation (or blocks entirely)
- [ ] Add a CI check in `.github/workflows/portal.yml` that validates `_template/` structure against a known schema — fail the build if folders or placeholder files are missing
- [ ] Document in `projects/_template/README.md` that changes to this folder must be intentional and reviewed — never casual

---

### Safeguard 2 — Prevent Git bloat from high-frequency SVG commits

**Risk:** `mulesoft/diagram-templates/` generates SVGs into `projects/{client}/*/diagrams/` at multiple pipeline hooks (post-Flo, post-Petra, post-Quinn). If these regenerate on every run, `.git` history will balloon — SVGs are binary-like diffs and do not compress well in git history.

**Actions required:**
- [ ] Update `mulesoft/generate-diagram.js` (when built) to minify/optimize SVG output before writing — strip comments, whitespace, and metadata using `svgo` or equivalent
- [ ] Add a `.gitattributes` rule to treat `*.svg` files as binary (`*.svg binary`) to prevent line-diff noise
- [ ] Add a content-hash check in the diagram generator — only write the SVG if content has actually changed (compare hash of new output vs existing file before overwriting)
- [ ] Consider adding `projects/*/*/diagrams/*.svg` to a separate git-lfs tracking rule if diagram volume grows beyond ~500 SVGs total across all clients

---

### Safeguard 3 — Keep `dev/{client}-integration/` in sync with client GitHub repo

**Risk:** The local `projects/{client}/dev/{client}-integration/` folder is a backup copy. If the developer pushes changes directly to the client's external GitHub repo (hotfixes, config changes, dependency bumps), the local backup silently falls out of sync. There is currently no pull/sync mechanism.

**Actions required:**
- [ ] Add `pipeline/scripts/sync-client-repo.sh` — pulls latest from client GitHub repo into `projects/{client}/dev/{client}-integration/` and commits the delta with a `chore: sync {client} from upstream` message
- [ ] Add a `sync` command to `package.json` that runs sync for all clients: `node pipeline/scripts/regen-all-clients.js --sync`
- [ ] Document in `projects/_template/dev/` that this folder is a **backup**, not the working copy — developers should always push to the client GitHub repo first, then sync back here
- [ ] Add a staleness check to `pipeline/tools/check-registry-freshness.js` — warn if `dev/{client}-integration/` has not been synced in more than 14 days

---

### Phase 13 — Implement `docs/DIAGRAM_FRAMEWORK.md`

- [ ] Implement everything specified in `docs/DIAGRAM_FRAMEWORK.md`
- 📌 **COMMIT: `feat: implement diagram framework`**
