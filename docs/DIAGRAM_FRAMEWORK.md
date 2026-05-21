# Diagram-as-Code (DaC) Framework

> **Status:** Architecture decided — not yet implemented  
> **Mirrors:** HTML pipeline framework (`docs/HTML_PIPELINE_MIGRATION.md`) — same data-contract → renderer → output pattern  
> **Last updated:** 2026-05-21

---

## 1. Core Principle

Diagrams are treated exactly like HTML templates — **software engineering assets, not manual deliverables**.

```
Agent JSON
    └── orchestrator assembles
              └── diagram-content.json      ← data contract (per client)
                        └── generate-diagram.js  ← token engine + mmdc dispatcher
                                  └── projects/{client}/intake/diagrams/{id}.svg
```

No agent writes diagram files directly. The orchestrator assembles the data contract from agent outputs and calls the renderer. This mirrors the HTML pipeline:

| HTML pipeline | Diagram pipeline |
|---|---|
| `intake-content.json` | `diagram-content.json` |
| Eleventy + `.njk` layouts | Mermaid CLI + `.mmd` templates |
| `template-registry.json` | `diagram-registry.json` |
| `npm run build:html` | `node scripts/generate-diagram.js {client}` |

---

## 2. Tool Decision: Mermaid CLI

**Renderer:** `@mermaid-js/mermaid-cli` (`mmdc`)

```bash
mmdc -i template.mmd -o output.svg -c standards/diagram-theme.json
```

**Why Mermaid CLI:**
- Claude/LLM agents write Mermaid syntax natively and accurately
- Single tool covers all diagram types needed across all engagement levels
- Zero runtime dependencies beyond Node.js — no Java, no external service
- Deterministic output: same input always produces the same SVG
- CI/CD-friendly: runs headless in GitHub Actions

**Diagram types supported:**

| Type | Mermaid syntax | Used at level |
|---|---|---|
| System flow | `flowchart LR` | Scoping, SOW |
| Decision tree | `flowchart TD` | Scoping, SOW, Dev |
| Sequence | `sequenceDiagram` | PRD, Arch, Dev |
| Entity state | `stateDiagram-v2` | PRD, Dev |
| Canonical data model | `erDiagram` | PRD, Arch, Dev |
| C4 Context | `C4Context` | Arch |
| C4 Container | `C4Container` | Arch |
| C4 Component | `C4Component` | Arch, Dev |
| Timeline / phases | `gantt` | SOW |
| User journey | `journey` | PRD |
| Deployment topology | `flowchart TD` | Arch |

---

## 3. Directory Structure

```
standards/
├── diagram-templates/              ← core blueprints — never recreated, only parameterized
│   ├── scoping/
│   │   ├── system-flow-dual-panel.mmd      current vs future state
│   │   ├── integration-scope-boundary.mmd  in-scope flows + systems
│   │   └── decision-scoping-gate.mmd       p0 blockers + go/no-go
│   ├── sow/
│   │   ├── phased-timeline.mmd             gantt — discovery → build → UAT → go-live
│   │   ├── scope-boundary.mmd              in vs out of scope
│   │   └── assumptions-map.mmd             owner → assumption → dependency
│   ├── prd/
│   │   ├── use-case-integration.mmd        actor → system interactions
│   │   ├── sequence-happy-path.mmd         nominal request/response per use case
│   │   ├── sequence-error-handling.mmd     failure modes, retries, fallbacks
│   │   ├── entity-state.mmd               order/customer/product lifecycle
│   │   └── scenario-journey.mmd            client admin day-in-the-life
│   ├── architecture/
│   │   ├── c4-context.mmd                  system landscape — what talks to MuleSoft
│   │   ├── c4-container.mmd               exp / process / system API layers
│   │   ├── c4-component.mmd               internals of each API
│   │   ├── canonical-data-model.mmd        Order/Customer/Product schema
│   │   ├── deployment-topology.mmd         CloudHub 2.0, workers, VPCs
│   │   └── pattern-architecture.mmd        per integration pattern (webhook, CDC, etc.)
│   ├── dev/                                ← future pipeline (not yet built)
│   │   ├── sequence-detailed.mmd           full chain incl. auth, retry, DLQ
│   │   ├── field-mapping.mmd               source → DataWeave → target
│   │   ├── error-handling-flow.mmd         on-error-continue / propagate / DLQ
│   │   ├── dataweave-logic.mmd             transform branches, enrichment
│   │   └── test-scenario-matrix.mmd        happy path + all edge cases
│   ├── production/                         ← future pipeline (not yet built)
│   │   ├── runtime-topology.mmd            live system topology + worker config
│   │   ├── monitoring-alerting.mmd         alert thresholds → notify → escalate
│   │   ├── incident-response-flow.mmd      on-call runbook decision tree
│   │   └── api-dependency-map.mmd          C4 context ops variant
│   └── hypercare/                          ← future pipeline (not yet built)
│       ├── issue-triage-flow.mmd           incident classification → owner → SLA
│       ├── error-rate-health.mmd           DLQ / retry trend visualization
│       ├── scope-change-impact.mmd         reuse scope-boundary + delta overlay
│       └── handoff-checklist-flow.mmd      hypercare exit criteria gate
│
├── diagram-registry.json           ← links templates → scenarios → playbooks → tokens
├── diagram-theme.json              ← DataSkate brand tokens (single source of truth)
└── scenarios/                      ← existing — scenarios reference their diagram template
    └── webhook-ingestion.md        → diagramRef: sequence-happy-path.mmd
```

**Per-client output:**
```
projects/{client}/
└── intake/
    └── diagrams/
        ├── diagram-content.json    ← assembled by orchestrator (data contract)
        ├── system-flow.svg
        ├── sequence-order-sync.svg
        ├── c4-context.svg
        └── ...
```

---

## 4. DataSkate Brand Theme

**File:** `standards/diagram-theme.json`

```json
{
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#F0FFF4",
    "primaryTextColor": "#276749",
    "primaryBorderColor": "#2E9E6B",
    "lineColor": "#C0C5CC",
    "secondaryColor": "#FFF5F5",
    "secondaryTextColor": "#c0392b",
    "secondaryBorderColor": "#ed1c24",
    "tertiaryColor": "#F8F8F8",
    "tertiaryTextColor": "#1A1A1A",
    "tertiaryBorderColor": "#D4D4D8",
    "fontFamily": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    "fontSize": "14px"
  },
  "sequence": {
    "actorMargin": 50,
    "boxMargin": 10,
    "useMaxWidth": true
  }
}
```

**Node type → color convention** (enforced via theme, not inline style directives):

| Node type | Meaning | Fill | Border |
|---|---|---|---|
| `source` | Existing system integrating | white | neutral `#D4D4D8` |
| `deprecated` | Legacy / fragmented (being replaced) | `#FFF5F5` | red `#ed1c24` |
| `hub` | MuleSoft — DataSkate managed | `#F0FFF4` | green `#2E9E6B` |
| `target` | System being written to | white | neutral `#D4D4D8` |

Agents declare node **type**, never hex codes. The theme resolves colors.

---

## 5. Data Contract: diagram-content.json

One file per client. Assembled by the orchestrator from agent JSON outputs.

```json
{
  "client": "homage",
  "assembledAt": "2026-05-21T10:00:00Z",
  "diagrams": [
    {
      "id": "system-flow",
      "level": "scoping",
      "type": "flowchart",
      "templateRef": "standards/diagram-templates/scoping/system-flow-dual-panel.mmd",
      "scenarioRef": null,
      "title": "System Integration Overview",
      "generatedBy": "rex+flo",
      "tokens": {
        "__CLIENT_NAME__": "Homage",
        "__CURRENT_SYSTEMS__": "Shopify Plus, ShipStation, Orderful EDI",
        "__DEPRECATED__": "Celigo (Sikich managed), Turbine (standalone)",
        "__HUB__": "MuleSoft (DataSkate managed)",
        "__TARGETS__": "NetSuite, Fanatics · DSG · Rallyhouse",
        "__FLOW_COUNT__": "22+"
      }
    },
    {
      "id": "sequence-order-sync",
      "level": "prd",
      "type": "sequence",
      "templateRef": "standards/diagram-templates/prd/sequence-happy-path.mmd",
      "scenarioRef": "standards/scenarios/webhook-ingestion.md",
      "title": "Order Sync — Happy Path",
      "generatedBy": "flo+petra",
      "tokens": {
        "__SOURCE_PLATFORM__": "Shopify Plus",
        "__EVENT_TYPE__": "order/created",
        "__HUB__": "MuleSoft",
        "__TARGET_SYSTEM__": "NetSuite",
        "__LATENCY__": "< 30s"
      }
    }
  ]
}
```

---

## 6. Diagram Registry

**File:** `standards/diagram-registry.json`

Links every template to its scenario reference, which playbook systems it applies to, and which agent tokens it needs.

```json
{
  "version": "1.0",
  "templates": [
    {
      "id": "system-flow-dual-panel",
      "level": "scoping",
      "type": "flowchart",
      "title": "Current vs Future State",
      "templateFile": "standards/diagram-templates/scoping/system-flow-dual-panel.mmd",
      "scenarioRef": null,
      "playbookSystems": ["*"],
      "tokens": ["__CURRENT_SYSTEMS__", "__DEPRECATED__", "__HUB__", "__TARGETS__", "__FLOW_COUNT__"],
      "generatedBy": "rex+flo",
      "audience": "external",
      "outputId": "system-flow"
    },
    {
      "id": "sequence-happy-path",
      "level": "prd",
      "type": "sequence",
      "title": "Integration Happy Path",
      "templateFile": "standards/diagram-templates/prd/sequence-happy-path.mmd",
      "scenarioRef": "standards/scenarios/webhook-ingestion.md",
      "playbookSystems": ["shopify", "hubspot", "salesforce"],
      "tokens": ["__SOURCE_PLATFORM__", "__EVENT_TYPE__", "__HUB__", "__TARGET_SYSTEM__", "__LATENCY__"],
      "generatedBy": "flo",
      "audience": "external",
      "outputId": "sequence-{usecase-id}"
    },
    {
      "id": "c4-container",
      "level": "architecture",
      "type": "C4Container",
      "title": "API-Led Architecture",
      "templateFile": "standards/diagram-templates/architecture/c4-container.mmd",
      "scenarioRef": null,
      "playbookSystems": ["*"],
      "tokens": ["__CLIENT_NAME__", "__EXP_APIS__", "__PROC_APIS__", "__SYS_APIS__"],
      "generatedBy": "petra",
      "audience": "internal",
      "outputId": "c4-container"
    }
  ]
}
```

---

## 7. Agent → Token Responsibility

Strict agent boundary applies — agents write to their own JSON only. The orchestrator reads agent outputs and assembles `diagram-content.json`.

**Scout is the engagement pipeline — it covers pre-sales through SOW only.** Once the SOW is signed, separate delivery pipelines take over (PRD, Architecture, Dev, Production, Hypercare). Those pipelines do not exist yet and will be designed independently. The DaC framework and `diagram-registry.json` are built to accommodate them — the renderer and template structure are pipeline-agnostic.

### Scout Pipeline (Scoping + SOW)

| Agent | Writes to | Diagram tokens provided |
|---|---|---|
| **Rex** | `rex.json` | Current system landscape, deprecated systems, integration points |
| **Flo** | `flo.json` | Confirmed flows, flow count, source/target systems, scenario pattern, p0 blockers |
| **Petra** | `petra.json` | Proposal narrative, SOW phasing, assumptions, scope boundary |
| **Quinn** | `quinn.json` | Client-facing requirements, intake responses |

**Scout orchestrator hooks:**

| Hook point | Action |
|---|---|
| Post-Rex | Assembles `systemTopology.current` tokens |
| Post-Flo | Assembles `diagram-content.json` — runs scoping diagrams |
| Post-Petra | Appends SOW diagrams to `diagram-content.json` — reruns renderer |

### Future Pipeline Agents (PRD → Hypercare)

> **Not yet designed.** The agents below are placeholders — names, responsibilities, and boundaries to be defined when this pipeline is built.

| Level | Agent (TBD) | Diagram tokens provided |
|---|---|---|
| **PRD** | Requirements agent | Use case actors, happy/error path sequences, entity states |
| **Architecture** | Architecture agent | C4 layers, canonical data model, deployment topology |
| **Dev** | Dev handoff agent | Field mappings, DataWeave branches, test matrix, detailed sequences |
| **Production** | Ops agent | Runtime topology, monitoring thresholds, incident runbook |
| **Hypercare** | Hypercare agent (Sol?) | Issue triage, error trends, handoff exit criteria |

---

## 8. Diagrams by Engagement Level

### Scoping *(Scout pipeline — pre-sales)*
**Audience:** Client stakeholders, MuleSoft AE  
**Goal:** Make the problem and solution visible fast

| Diagram | Template | Agent tokens |
|---|---|---|
| Current vs future state | `system-flow-dual-panel.mmd` | Rex + Flo |
| Integration scope boundary | `integration-scope-boundary.mmd` | Flo |
| Scoping decision / p0 gate | `decision-scoping-gate.mmd` | Flo |

---

### SOW *(statement of work — post-scoping)*
**Audience:** Legal, PM, client operations  
**Goal:** Lock the boundary — what's included, excluded, assumed

| Diagram | Template | Agent tokens |
|---|---|---|
| Phased timeline (Gantt) | `phased-timeline.mmd` | Flo + Petra |
| Scope boundary (in vs out) | `scope-boundary.mmd` | Flo |
| Assumptions + owners map | `assumptions-map.mmd` | Flo |

---

### PRD *(requirements)*
**Audience:** Architect, client IT lead  
**Goal:** Capture what each flow must do — behavior, not implementation

| Diagram | Template | Agent tokens |
|---|---|---|
| Use case (actor → system) | `use-case-integration.mmd` | Quinn |
| Happy path sequence | `sequence-happy-path.mmd` | Flo |
| Error / edge case sequence | `sequence-error-handling.mmd` | Flo + Petra |
| Entity state lifecycle | `entity-state.mmd` | Petra |
| Scenario journey | `scenario-journey.mmd` | Petra |

---

### Architecture *(technical design)*
**Audience:** MuleSoft architect, client engineering lead  
**Goal:** Define runtime topology and API-led structure

| Diagram | Template | Agent tokens |
|---|---|---|
| C4 Context (system landscape) | `c4-context.mmd` | Rex + Flo |
| C4 Container (API-led layers) | `c4-container.mmd` | Petra |
| C4 Component (API internals) | `c4-component.mmd` | Petra |
| Canonical data model (ER) | `canonical-data-model.mmd` | Petra |
| Deployment topology | `deployment-topology.mmd` | Petra |
| Pattern architecture | `pattern-architecture.mmd` | Flo (scenarioRef) |

---

### Dev *(build and handoff)*
**Audience:** MuleSoft developer, QA  
**Goal:** Implementation-ready detail — no ambiguity

| Diagram | Template | Agent tokens |
|---|---|---|
| Detailed sequence (auth, retry, DLQ) | `sequence-detailed.mmd` | Petra |
| Field mapping (source → DW → target) | `field-mapping.mmd` | Petra |
| Error handling flow | `error-handling-flow.mmd` | Petra |
| DataWeave logic branches | `dataweave-logic.mmd` | Petra |
| Test scenario matrix | `test-scenario-matrix.mmd` | Petra + Quinn |

---

### Production *(go-live and operational)*
**Audience:** Client IT ops, DataSkate architect on-call  
**Goal:** Operational visibility — what's running, what to watch, how to respond

| Diagram | Template | Agent tokens |
|---|---|---|
| Runtime topology (live) | `runtime-topology.mmd` | Petra |
| Monitoring + alerting flow | `monitoring-alerting.mmd` | Petra |
| Incident response runbook | `incident-response-flow.mmd` | Petra |
| Data volume / flow metrics | `flowchart LR` (ops view) | Petra |
| API dependency map | `c4-context.mmd` (ops variant) | Petra |

---

### Hypercare *(30-day post go-live)*
**Audience:** Client stakeholders, DataSkate architect  
**Goal:** Confirm stability, surface issues early, document lessons learned

| Diagram | Template | Agent tokens |
|---|---|---|
| Issue triage flow | `decision-issue-triage.mmd` | Post-go-live (manual / Sol) |
| Error rate trend | `flowchart TD` (health check) | Post-go-live |
| Retry / DLQ resolution flow | `error-handling-flow.mmd` | Reuse from Dev level |
| Scope change impact map | `integration-scope-boundary.mmd` | Reuse from SOW level |
| Handoff checklist flow | `flowchart TD` | Post-go-live |

---

### The Thread Across All Levels

The same systems appear at every level — they get more specific as the engagement deepens:

```
Scoping     →  "Shopify connects to NetSuite via MuleSoft"
SOW         →  "22 flows in scope across 3 phases"
PRD         →  "UC-1: Order created in Shopify → synced to NetSuite within 30s"
Arch        →  "exp-api receives webhook → proc-api enriches → netsuite-sys-api writes"
Dev         →  "On HTTP 429 from NetSuite: exponential backoff × 3, then DLQ publish"
Production  →  "Worker 1 handles order webhook; DLQ threshold alert at 10 messages"
Hypercare   →  "Issue #3: NetSuite 429 spike on 2026-05-24 — root cause: batch job collision"
```

Templates at each level reuse tokens from earlier levels — `__SOURCE_PLATFORM__` set during scoping flows through to the production monitoring diagram unchanged.

---

## 9. Scenario Cross-Reference

Each scenario file in `standards/scenarios/` references its diagram template. When Flo identifies the scenario pattern for a client, the orchestrator automatically selects the matching templates.

| Scenario | Diagram templates triggered |
|---|---|
| `webhook-ingestion` | `sequence-happy-path`, `sequence-error-handling`, `pattern-architecture` |
| `scheduled-sync` | `sequence-happy-path`, `phased-timeline`, `pattern-architecture` |
| `event-driven` | `sequence-happy-path`, `sequence-error-handling`, `c4-container` |
| `b2b-edi` | `sequence-happy-path`, `sequence-error-handling`, `field-mapping` |
| `real-time` | `sequence-detailed`, `deployment-topology`, `c4-container` |
| `data-migration` | `phased-timeline`, `field-mapping`, `test-scenario-matrix` |
| `cdc-streaming` | `sequence-detailed`, `pattern-architecture`, `c4-container` |
| `batch` | `sequence-happy-path`, `phased-timeline`, `field-mapping` |

---

## 10. CI/CD Integration

Diagrams regenerate automatically on two triggers:

**Trigger 1 — Template change** (any `.mmd` in `standards/diagram-templates/` modified):
- GitHub Action recompiles all client instances using the updated template
- Ensures no client has a stale diagram after a template fix

**Trigger 2 — Pipeline run** (orchestrator post-Flo / post-Petra hooks):
- `generate-diagram.js {client}` runs inline during Scout pipeline
- SVGs written to `projects/{client}/intake/diagrams/`
- Firebase deploy picks them up via `update-firebase.js`

**File:** `.github/workflows/portal.yml` — extend existing workflow to watch `standards/diagram-templates/**/*.mmd`

---

## 11. What Replaces What

| Old | New | Reason |
|---|---|---|
| `buildDiagramSvg()` in `proposal.11tydata.js` | Removed — reads pre-generated SVG only | Two renderers writing to same file caused inconsistency |
| `scripts/generate-diagrams.js` | Replaced by `scripts/generate-diagram.js` | Single renderer, all types, registry-driven |
| `project.json.systemDiagram.mermaid` | `diagram-content.json` tokens | Structured data contract, not raw Mermaid strings |
| Ad-hoc hex colors in Mermaid `style` directives | Node `type` field + `diagram-theme.json` | Consistent brand, agents never write hex codes |

---

## 12. Implementation Order

1. `standards/diagram-theme.json` — brand tokens
2. `standards/diagram-registry.json` — template registry
3. `standards/diagram-templates/scoping/system-flow-dual-panel.mmd` — first template (prove the pattern)
4. `scripts/generate-diagram.js` — token engine + mmdc dispatcher
5. Post-Flo hook in `orchestrate.js` — assemble `diagram-content.json`, run renderer
6. `template-registry.json` — add `system-diagram` entry
7. Strip `buildDiagramSvg` from `proposal.11tydata.js`
8. Scout pipeline delivers: Scoping + SOW templates only
9. PRD → Hypercare templates built when their respective pipelines are designed
9. `.github/workflows/portal.yml` — add template-change trigger
