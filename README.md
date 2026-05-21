# MuleSoft BMAD Planning System

> For tech leads and architects. Developers never touch this repo — they receive a generated GitHub repo they open in a Codespace and implement flows using Anypoint Studio.

---

## How to Use — New Client Engagement

### Step 0: Drop scoping notes and run Scout

After the initial scoping call — before you send the client an intake form — drop your raw notes into:

```
projects/{client}/scoping/
```

Anything works: call transcript, Gemini/Otter notes, email thread, slide deck, handwritten notes copied to a text file.

Then run Scout:

```
/bmad-agent-scout
```
or
```
Talk to Scout (the scoping analyst). Run SQ for projects/{client}/
```

Scout reads the scoping notes, infers which systems are involved (explicit and implied), cross-checks every detected system against the connector registry and existing playbooks, and produces:

- `projects/{client}/intake/intake-questionnaire.md` — tailored questionnaire with pre-filled understandings from the scoping notes, base questions, and system-specific gotcha questions generated dynamically per detected system

Scout also automatically registers every detected system in three commons artifacts (creating stubs if none exist):
- `mulesoft/playbooks/playbooks/{system}/{system}_playbook.json` — stub created on first detection, enriched as the project progresses
- `mulesoft/connector-registry.json` — stub entry with auth type to be confirmed
- `pipeline/intake-checklist.json` — baseline autoWarning so the next project sees this system flagged immediately

**Send the intake questionnaire to the client. Wait for their responses before proceeding to Step 1.**

This step prevents the two most common causes of mid-project blockers: undocumented API contracts and system-specific connector constraints (SAP JCo license, NetSuite PS256 JWT, ServiceNow OAuth metadata limitation, etc.) discovered too late.

### Step 1: Drop discovery documents

```
projects/{client}/intake/
```

Drop the client's completed intake questionnaire responses plus any supporting docs: API specs, architecture diagrams, existing data mappings, email threads.

### Step 2: Run the Analyst

```
/bmad-agent-analyst
```
or
```
Talk to Mary (the analyst). Analyse all docs in projects/{client}/intake/ and produce projects/{client}/prd.md
```

The Analyst produces:
- `projects/{client}/prd.md` — structured requirements
- `projects/{client}/api-discovery/{system}-contract.md` — one per undocumented system (curl-verified field contracts + targeted gap questions)

The Analyst also enriches the commons stubs Scout created — confirming auth types, object types, and known constraints from the intake documents. Analyst output goes into `projects/{client}/api-discovery/` and enriches `mulesoft/playbooks/playbooks/{system}/`.

**Do not proceed to Step 3 until you have sent the gap questions to the client and received confirmation.** The Architect needs confirmed field contracts, not guesses.

### Step 3: Run the Architect

```
/bmad-agent-architect
```
or
```
Talk to Winston (the architect). Read projects/{client}/prd.md. Walk the 6-level decision tree. Produce projects/{client}/architecture.md and projects/{client}/decisions.json
```

The Architect reads `pipeline/FIELD_KNOWLEDGE.md` and all existing `mulesoft/playbooks/playbooks/*/*_playbook.json` files before the decision tree. Verified field knowledge entries take precedence over scenario file defaults. For any system with an existing playbook, the Architect references its auth pattern and DWL files rather than redesigning from scratch.

**Validate before proceeding:**
```bash
node -e "
  const schema = require('./mulesoft/decisions-schema.json');
  const d = require('./projects/{client}/decisions.json');
  // check required fields: client, pattern, connectors, security, flows
  console.log('valid');
"
```

The three decisions a tech lead must personally review in `decisions.json`:
- `primaryPattern` — is this the right EIP pattern for the business case?
- `errorHandling.dlqEnabled` — is async + DLQ the right failure model here?
- `security.tier` — does the data classification match the security controls selected?

Everything else the Architect decides autonomously.

The Architect enriches all commons stubs before completing the MD run — `mulesoft/playbooks/playbooks/{system}/_playbook.json` updated with design-confirmed auth and objects, `mulesoft/connector-registry.json` updated with confirmed auth type, `pipeline/intake-checklist.json` updated with any specific gotchas found during architecture.

### Step 4: Run the PM

```
/bmad-agent-pm
```
or
```
Talk to John (the PM). Read projects/{client}/decisions.json and mulesoft/playbooks/stories/. Generate projects/{client}/stories.md
```

Stories reference exact file names, acceptance criteria, and coverage floors — developers pick them up without needing to interpret the architecture doc.

### Step 5: Generate and push the client repo

```bash
node mulesoft/generate.js --decisions projects/{client}/decisions.json --output /tmp/{client}-mule

GITHUB_TOKEN=ghp_... bash pipeline/tools/create-client-repo.sh \
  --client {client} \
  --org {your-github-org}
```

The script creates `github.com/{org}/{client}-mule`, pushes code, and prints a one-click Codespace URL. Send that URL to the developer — they open it, the project compiles, they fill in `// TODO` blocks.

**Total time: discovery docs → developer writing code, under an hour.**

### Step 6: Developer implements using Anypoint Studio

The developer opens the Codespace URL. The scaffold compiles immediately. They work through `projects/{client}/stories.md` story by story, implementing business logic in Anypoint Studio, confirming field mappings against the systems, and running MUnit tests until all coverage floors pass.

No BMAD agent is involved in this step. The developer uses the MuleSoft platform directly. The architect does not need to be in the client repo. When the developer confirms stories are done, the engagement is ready for close-out.

### Step 7: Run the close-out

After the developer confirms stories are done — come back to this planning repo and run the close-out. **This is mandatory, not optional.** It is the mechanism by which every project makes the next project faster.

```
/bmad-agent-architect-debrief
```
Then select `CO` and specify the client.

The close-out reads every internal flag from the intake questionnaire, every open item from architecture.md, every story that was built, and every system involved. It interviews the architect question by question — per system (auth, connector behaviour, field mapping surprises), per internal flag (was it resolved? how?), per architecture open item, and per cross-cutting pattern. Based on the answers it automatically updates:

- `pipeline/FIELD_KNOWLEDGE.md` — new FK entries for any non-obvious finding
- `mulesoft/playbooks/playbooks/{system}/` — implementation learnings, confirmed DWL mappings, maturity update
- `pipeline/intake-checklist.json` — new or updated autoWarnings so the next project sees these issues at intake time
- `mulesoft/connector-registry.json` — confirmed auth types, versions, and any new connectors used

### Step 8: Ad-hoc debrief (any time)

Any time during the engagement — mid-architecture, mid-implementation, post-UAT — if a specific finding is worth capturing immediately without waiting for close-out:

```
/bmad-agent-architect-debrief
```
Then select `DK`.

Describe what you observed in plain language. The agent asks focused questions and writes the field knowledge entry. Run `PK` when a finding has been confirmed on a second engagement — the agent promotes it to the target commons file automatically.

---

## What This System Produces

For every client engagement:

| Artifact | Who uses it | Where |
|----------|-------------|-------|
| Intake questionnaire (HTML) | Client fills it in | `projects/{client}/intake/intake-questionnaire-{client}.html` |
| Corporate Brief (HTML) | Client — pre-call research summary | `projects/{client}/intake/corporate-brief-{client}.html` |
| Proposal (HTML) | Client reads + signs | `projects/{client}/intake/proposal-{client}.html` |
| Integration Deck (HTML) | AE/Architect internal briefing | `projects/{client}/intake/integration-deck-{client}.html` |
| Client Portal (HTML) | Client — live project hub | `portal/public/portal/{client}.html` |
| PRD | Tech lead review, client sign-off | `projects/{client}/prd.md` |
| API contract files | Send gap questions to client | `projects/{client}/api-discovery/` |
| Architecture doc | Tech lead approval | `projects/{client}/architecture.md` |
| `decisions.json` | Drives all code generation | `projects/{client}/decisions.json` |
| Sprint stories | Developer task board | `projects/{client}/stories.md` |
| Compiling Mule project | Developer codes against it | `github.com/{org}/{client}-mule` |
| Codespace URL | Developer opens it, done | Printed by `pipeline/tools/create-client-repo.sh` |

After close-out, every project also contributes to the commons:

| Commons artifact | Updated by | What grows |
|-----------------|-----------|-----------|
| `pipeline/FIELD_KNOWLEDGE.md` | Architect (DK / CO) | FK entries — lessons from every project |
| `mulesoft/playbooks/playbooks/{system}/` | Scout (stub) → Architect (design) → CO (implementation) | Auth, DWL mappings, known quirks per system |
| `pipeline/intake-checklist.json` | Scout (stub) → Architect Debrief Q6 / CO | autoWarnings — every system ever seen gets an entry |
| `mulesoft/connector-registry.json` | Scout (stub) → Analyst → Architect → CO | Confirmed auth, versions, staleness |

---

## Engagement Documents & Template System

DataSkate maintains a template system that generates all client-facing and internal HTML documents. All templates live in `portal/_includes/layouts/`. Content is always sourced from JSON or Markdown — never hardcoded into HTML. The build is driven by Eleventy via `npm run build:html` (from the repo root). See `portal/template-registry.json` for the authoritative template inventory.

### Dynamic documents — Firestore-loaded at runtime

All per-client documents are dynamic. The HTML shell loads content from Firestore when the page renders. No per-client HTML is committed to this repo.

| Document | Who uses it | Generated by | Layout |
|---|---|---|---|
| Intake Questionnaire | Client fills it in | Scout | `portal/_includes/layouts/intake.njk` |
| Proposal | Client reads + agrees | Scout | `portal/_includes/layouts/proposal.njk` |
| Corporate Brief | Client — pre-call research summary | Scout | `portal/_includes/layouts/corporate-brief.njk` |
| Integration Deck | AE/Architect internal briefing deck | Scout (research session) | `portal/_includes/layouts/integration-deck.njk` |
| Client Portal | Client — live project hub | scaffold | `portal/_includes/layouts/client-portal.njk` |

Per-client output paths:
- Intake / Proposal / Corporate Brief / Integration Deck → `projects/{client}/intake/{type}-{client}.html`
- Client Portal → `portal/public/portal/{client}.html`

The **DS Pricing Model** card is hardcoded into every client portal — always present, no configuration needed.

### Static documents — regenerated from Markdown source

Internal and shared resources are regenerated from their Markdown source files when content changes, then deployed to Firebase Hosting.

| Document | Audience | Access | Source | Output |
|---|---|---|---|---|
| Architect Guide | Internal | @dataskate.ai login | `commons/sales/architect-guide.md` | `portal/public/resources/architect-guide.html` |
| DS Pricing Model | External | Public | `commons/sales/pricing-model.md` (rates parsed) | `portal/public/resources/ds-pricing-model.html` |
| Knowledge Base | Internal | @dataskate.ai login | Live-read from `pipeline/scout/pipeline.json`, `mulesoft/playbooks/*`, `pipeline/FIELD_KNOWLEDGE.md` | `portal/public/resources/capabilities.html` |

### The Architect Guide — single internal reference

`commons/sales/architect-guide.md` is the authoritative guide for architects. It contains:
- DataSkate proposition and the 3-stage AI journey (Connected → Automated → Agentic)
- Pricing reference (key tables parsed from `commons/sales/pricing-model.md`)
- AE briefing — discovery call playbook, IaaS pitch, objection handling
- Client presentation guide
- Phase 2 AI pivot narrative and email templates
- Closing guide

`commons/sales/pricing-model.md` is kept as a separate source file because both the Eleventy build and the Scout agent parse it for live pricing calculations. Never delete it or hardcode rates from it.

### Generating documents

```bash
# All templates — run from repo root (builds tokens + Eleventy)
npm run build:html

# Watch mode during template development
npm run build:html:watch

# Generate the knowledge base (capabilities) page
node pipeline/tools/generate-knowledge-base.js
```

Content for per-client documents is sourced from:
- `projects/{client}/intake/intake-content.json` → intake
- `projects/{client}/intake/proposal-content.json` → proposal
- `projects/{client}/intake/corporate-brief-content.json` → corporate brief
- `projects/{client}/intake/integration-deck-content.json` → integration deck
- `projects/{client}/portal-content.json` → client portal

### Template registry

`portal/template-registry.json` is the authoritative dictionary of all templates. Each entry carries: `id`, `name`, `audience` (internal/external), `loginRequired`, `loginDomain`, `category`, `purpose`, `templateFile`, `cssFile`, `outputPath`, `firebasePath`, `generatedBy`, `fillCommand`, `perClient`. The registry is the single source of truth — update it whenever a template is added, renamed, or removed.

### Document naming history

| Old name | Replaced by | Notes |
|---|---|---|
| Architect Flyer | DS Pricing Model | Client-facing one-pager; attached to every client portal |
| Pricing Model — Internal | _(deleted)_ | Content merged into Architect Guide |
| Client Pitch Kit | Integration Deck | Per-client only; generated by Scout during deep-research session. Now auth-gated internal. |
| AE Pitch Kit | _(deleted)_ | Content merged into Architect Guide |
| Proposal Structure HTML | _(deleted)_ | Stays as `commons/sales/proposal-structure.md` only — consumed by agents, never an HTML deliverable |
| `docs/eleventy/` | `portal/` | Eleventy build merged into portal/ during folder structure refactor |
| `firebase/` | `portal/` | Firebase Hosting root and deploy script merged into portal/ |
| `scaffold/` | `mulesoft/` + `pipeline/tools/` | Code generator and tools split from scaffold/ by concern |
| `standards/` | `mulesoft/` + `pipeline/` | Playbooks/registry → mulesoft/; intake-checklist/FIELD_KNOWLEDGE → pipeline/ |

---

## Why It Exists

Every new MuleSoft engagement used to start the same way: a tech lead spending the first week making identical decisions — which pattern, which connectors, how to handle errors, how to structure flows. The decisions were inconsistent between projects, junior developers had no guardrails, and every repo started from blank files.

**This system encodes those decisions once, at the right abstraction level, and automates everything downstream.**

Three specific problems it solves:

1. **Consistency** — all generated projects share the same error handling, correlation ID propagation, security controls, and naming conventions. No project deviates unless explicitly configured.

2. **Speed** — the Analyst, Architect, and PM agents each take minutes. Code generation takes seconds. The bottleneck becomes client response time, not internal setup time.

3. **Accumulation** — every new project teaches the system something. Lessons go into `pipeline/FIELD_KNOWLEDGE.md`, agents apply them on future projects automatically, and the playbooks in `mulesoft/playbooks/playbooks/` grow with each system touched. The close-out (Step 7) is the mechanism that makes this happen systematically.

---

## Folder Structure

```
mulesoft-bmad-planning/
├── _bmad/                          BMAD agent definitions
│   └── custom/
│       ├── bmad-agent-scout.toml            Scout: scoping notes → intake questionnaire + commons stubs
│       ├── bmad-agent-analyst.toml          Mary: intake docs → prd.md + stub enrichment
│       ├── bmad-agent-architect.toml        Winston: 6-level decision tree → decisions.json + stub enrichment
│       ├── bmad-agent-architect-debrief.toml  CO: post-delivery close-out; DK: ad-hoc FK capture; PK: promote to standard
│       └── bmad-agent-pm.toml               John: decisions.json → sprint stories
│           (bmad-agent-dev.toml is NOT used — developers use Anypoint Studio directly)
│
├── pipeline/                       Agent orchestration engine
│   ├── agents/                     Scout sub-agents (Sage, Vera, Rex, Ivy, Flo, Hawk, Quinn, Petra, Sol, Mira)
│   ├── scout/
│   │   ├── orchestrate.js          Scout pipeline runner — provisions new clients from projects/_template/
│   │   └── pipeline.json           Agent config: roles, prompts, output schema for all 10 sub-agents
│   ├── scripts/                    Automation scripts (build-tokens, bump-template, lint-a11y, etc.)
│   ├── tools/                      One-off tools (generate-capabilities, create-client-repo, check-registry-freshness)
│   ├── telemetry/                  Pipeline run logs and metrics
│   ├── tests/                      Pipeline-level test suites
│   ├── intake-checklist.json       Mandatory checks + autoWarnings per system (grows with every project)
│   ├── FIELD_KNOWLEDGE.md          Lessons from real projects; agents apply verified entries
│   ├── PLANNING_CONTEXT.md         Master system context — read before every session
│   ├── ARCHITECTURE.md             Pipeline internal architecture notes
│   └── AGENT-BOUNDARY-POLICY.md    Strict boundary rules: each agent writes only to its own JSON
│
├── mulesoft/                       MuleSoft code generation + knowledge base
│   ├── generate.js                 Code generator: decisions.json → complete Mule project
│   ├── connectors/                 XML connector config stubs (28 connectors)
│   ├── templates/                  Mule project scaffolding (flows, pom, MUnit, DWL, devcontainer)
│   ├── src/main/mule/              Commons sub-flows — injected by flow-ref into client projects
│   │   ├── common-error-handler.xml    DLQ routing, error response, notification dispatch
│   │   ├── common-retry.xml            Retry-queue pattern with exponential backoff
│   │   ├── common-notification.xml     Slack + email (scatter-gather, skips blank channels)
│   │   ├── common-batch.xml            Batch on-complete: log, alert, persist watermark
│   │   └── common-correlation.xml      Generate / propagate / extract correlation ID
│   ├── src/main/resources/dwl/     DWL modules — importable by any client project
│   │   ├── error-envelope.dwl          Standard error envelope builder
│   │   ├── pii-mask.dwl                Recursive payload masking (20+ field patterns)
│   │   ├── canonical-date.dwl          Date normalization (ISO, US, epoch, Salesforce format)
│   │   └── build-audit-record.dwl      CEF-compatible audit records; chains pii-mask
│   ├── playbooks/
│   │   ├── playbooks/              System playbooks (salesforce/, netsuite/, etc.)
│   │   ├── scenarios/              One reference file per integration pattern (A–U+)
│   │   ├── stories/                Reusable story templates the PM references
│   │   └── usecases/               Use-case reference files
│   ├── canonical-models/           Hub schemas — the canonical interchange format
│   ├── doc-templates/              PRD, architecture, and story templates
│   ├── DESIGN_STANDARDS.md         The constitution — all pattern decisions flow from here
│   ├── connector-registry.json     All known connectors: versions, Maven coords, auth types
│   ├── snippet-registry.json       Three-tier registry of all reusable code assets
│   ├── pom.xml                     Commons library pom (mule-plugin, deployed to Exchange)
│   └── publish.sh                  Publish commons library to Anypoint Exchange
│
├── portal/                         Web UI — Eleventy build + Firebase Hosting (merged)
│   ├── src/                        Eleventy source pages
│   │   ├── intake/
│   │   ├── internal/
│   │   ├── portal/
│   │   └── resources/
│   ├── _includes/layouts/          Nunjucks layout templates
│   │   ├── intake.njk              Intake questionnaire
│   │   ├── proposal.njk            Client proposal
│   │   ├── corporate-brief.njk     Pre-call research summary (1-pager)
│   │   ├── integration-deck.njk    AE/Architect internal briefing deck
│   │   ├── client-portal.njk       Client project hub
│   │   ├── ds-pricing-model.njk    Public pricing one-pager
│   │   ├── architect-guide.njk     Internal architect reference
│   │   └── base.njk                Shared base layout (inlines shared-base.css.html)
│   ├── _data/                      Eleventy global data files
│   ├── _build/                     Eleventy output (do not edit manually)
│   ├── public/                     Firebase Hosting root — deployed to dataskateclients.web.app
│   │   ├── index.html              Architect Portal — Google auth gated to @dataskate.ai
│   │   ├── resources/
│   │   │   ├── architect-guide.html    Internal — @dataskate.ai only
│   │   │   ├── ds-pricing-model.html   External — public
│   │   │   └── capabilities.html       Knowledge Base — @dataskate.ai only
│   │   └── portal/
│   │       └── {client}.html           Per-client project hub
│   ├── functions/                  Firebase Cloud Functions
│   ├── scripts/                    Firebase / portal utility scripts
│   ├── tests/                      Portal test suites (structural + behavioral per template)
│   ├── template-registry.json      Authoritative template inventory (v1.3)
│   ├── version-manifest.json       Per-template version pins (current: v1 for all templates)
│   ├── firebase.json               Firebase Hosting + Functions config
│   ├── deploy.sh                   Deploy portal/public to Firebase Hosting
│   └── SETUP.md                    Portal development setup guide
│
├── commons/                        Shared branding, sales collateral, design tokens
│   ├── branding/
│   │   ├── lint-html.js            Enforces HTML design standards (runs as PostToolUse hook)
│   │   ├── add-client-card.js      Adds a new client card to the Architect Portal
│   │   └── HTML_DESIGN_STANDARDS.json  Color palette, typography, component rules — the UI constitution
│   ├── templates/
│   │   └── shared-base.css.html    Typography reset + base styles (inlined by base.njk via |inline filter)
│   ├── tokens/                     Design tokens source (consumed by build:tokens)
│   ├── sales/                      Source markdown — agents read, Eleventy build parses
│   │   ├── architect-guide.md      Single internal reference: proposition, pricing, AE briefing, objections, Phase 2
│   │   ├── pricing-model.md        Authoritative rate source — parsed by Eleventy build and Scout
│   │   └── proposal-structure.md   Proposal section outline — used by Scout/Analyst; never an HTML file
│   └── social-proof/               Client testimonials and case study snippets
│
├── docs/
│   └── capabilities/               GitHub Pages output — capabilities portal static export
│
├── _inbox/                         Raw inbound files (Krisp recordings, call notes, etc.)
│
└── projects/
    ├── _template/                  Canonical new-client folder (copied by orchestrate.js)
    └── {client}/
        ├── scoping/                Drop raw scoping call notes here (Step 0)
        ├── intake/                 Drop completed intake questionnaire responses here (Step 1)
        │   ├── intake-questionnaire-{client}.md   Generated by Scout — send to client
        │   ├── intake-content.json               Content for intake HTML (Scout output)
        │   ├── intake-questionnaire-{client}.html  Client-facing intake form (dynamic, Firestore)
        │   ├── corporate-brief-content.json      Research summary content (Scout output)
        │   ├── corporate-brief-{client}.html     Pre-call research summary (dynamic, Firestore)
        │   ├── proposal-content.json             Content for proposal HTML (Scout output)
        │   ├── proposal-{client}.html            Client-facing proposal (dynamic, Firestore)
        │   ├── integration-deck-content.json     Research content for integration deck (Scout output)
        │   └── integration-deck-{client}.html    Internal AE briefing deck (auth-gated)
        ├── portal-content.json     Content for client portal (scaffold output)
        ├── project.json            Project metadata: client, architect, architectEmail, phase
        ├── company_context.json    Company research: industry, systems, peers, FOMO data, corporateStack
        ├── api-discovery/          API contract files (Analyst output)
        ├── prd.md
        ├── architecture.md
        ├── decisions.json
        └── stories.md
```

---

## The Decision Tree (What the Architect Does)

The Architect walks 6 decisions in order. Every decision has a schema constraint in `mulesoft/decisions-schema.json`. The tech lead's job is to review the output, not re-walk the tree.

| Level | Decision | Why it comes first |
|-------|----------|-------------------|
| 1 | Integration pattern (A–U) | Everything else depends on this: error strategy, retry model, test approach |
| 2 | Message TTL and dedup TTL | Prevents phantom retries and idempotency holes; TTL = messageTtlHours × 60 minutes |
| 3 | Error handling model | DLQ + retry-queue for async; 4xx/5xx mapping for sync |
| 4 | Security tier | Determines connector config, property encryption, Flex Gateway requirement |
| 5 | Deployment profile | minimal / standard / enterprise / regulated — drives which sub-flows are generated |
| 6 | Connector selection | Registry lookup, version pinning, playbook lookup, staleness check (>60d = warning) |

The 21 integration patterns (A–U) are in `mulesoft/playbooks/scenarios/`. Each scenario file specifies the integration style, compensation strategy, flow control config, and EDA fit assessment so the Architect isn't deriving them from first principles every time.

---

## The Commons Library — Cross-Client Reuse

Every generated client project declares `mulesoft-commons` as a Maven dependency. This means:

- Error handling, retry, notifications, and audit logging are **one implementation, one place to fix**
- A bug fix in `mulesoft/src/main/mule/common-error-handler.xml` benefits all client projects on next deploy — not just the one that found the bug
- New client projects automatically inherit any sub-flow improvements published to Exchange

The commons library source lives in `mulesoft/src/`. Publish to Exchange with `bash mulesoft/publish.sh`.

**Why retry-queue instead of `until-successful`:**
`until-successful` blocks the consumer thread for the entire retry duration and loses state on Mule restart. The retry-queue pattern publishes a message back to a retry queue with `X-Retry-Attempt` metadata, releases the consumer immediately, and survives restarts. `mulesoft/src/main/mule/common-retry.xml` implements this with exponential backoff.

**Why `set-correlation-id` instead of `set-variable`:**
Mule 4.6+ introduced `set-correlation-id` as a first-class element. `set-variable` creates a flow variable — it does not set the Mule event's `correlationId`, which is what appears in logs and gets propagated by the runtime. `mulesoft/src/main/mule/common-correlation.xml` uses `set-correlation-id` everywhere.

---

## System Playbooks — How Integration Knowledge Accumulates

The playbooks in `mulesoft/playbooks/playbooks/` encode what we know about each external system. Each playbook is **system-specific, not pair-specific** — the Salesforce playbook is reused whether the other side is NetSuite, SAP, Workday, or anything else.

```
mulesoft/playbooks/playbooks/salesforce/    mulesoft/playbooks/playbooks/netsuite/
  system/sf-auth.xml                          system/ns-auth.xml
  system/sf-query.xml                         system/ns-query.xml
  objects/account/                            system/ns-upsert.xml
  objects/opportunity/                        objects/sales-order/
  objects/contact/                            objects/invoice/
                                              objects/customer/
```

**Every object has bidirectional DWL transforms:**
- `{system}-{object}-to-canonical.dwl` — maps FROM the system's native format TO the canonical schema
- `canonical-to-{system}-{object}.dwl` — maps FROM canonical TO the system's REST request body

**Cross-system flows become two imports:**
```dataweave
import sfOpportunityToCanonical from "mulesoft/playbooks/playbooks/salesforce/objects/opportunity/sf-opportunity-to-canonical.dwl"
import canonicalToNsOrder       from "mulesoft/playbooks/playbooks/netsuite/objects/sales-order/canonical-to-ns-order.dwl"
---
canonicalToNsOrder(sfOpportunityToCanonical(payload))
```

No new code needed. The full field mapping, null handling, and status enum translation is already inside the two functions.

**When a second client needs Salesforce ↔ NetSuite:** the infrastructure is already here. Only the business-rule customizations (`// CLIENT TODO` blocks) need to change.

### How playbooks grow

| Stage | Who | What happens |
|-------|-----|-------------|
| Scout run | Scout | Stub {system}_playbook.json created on first detection — marks system as known |
| Analyst run | Analyst | Stub enriched with auth type and object types confirmed from intake |
| Architect MD run | Architect | Stub enriched with design-confirmed auth, objects needed, and known quirks |
| CO run (post-delivery) | Architect | Real implementation learnings added to `mulesoft/playbooks/playbooks/{system}/` — confirmed DWL mappings, maturity updated, gotchas documented |
| Second client | CO run | Maturity advances from `observation` to `verified` — Architect applies it automatically |

### Known critical quirks encoded in the playbooks

| System | Quirk | Where it's handled |
|--------|-------|-------------------|
| NetSuite | REST requires **PS256 JWT** — MuleSoft JWT Module does NOT support PS256 | `mulesoft/playbooks/playbooks/netsuite/system/ns-auth.xml` (Nimbus JOSE via Groovy) |
| NetSuite | SuiteQL max 1,000 records/page; governance units → 429 on overrun | `mulesoft/playbooks/playbooks/netsuite/system/ns-query.xml` (exponential backoff) |
| NetSuite | Invoices are system-generated — cannot POST to create one | `mulesoft/playbooks/playbooks/netsuite/objects/invoice/ns-invoice-to-canonical.dwl` (read-only direction only) |
| NetSuite | Item lookup requires internalId — no lookup by product code via REST | `mulesoft/playbooks/playbooks/netsuite/objects/sales-order/canonical-to-ns-order.dwl` (itemMapping helper parameter) |
| Salesforce | SOQL OFFSET breaks silently on > 2,000 records | `mulesoft/playbooks/playbooks/salesforce/system/sf-query.xml` (cursor pagination via `nextRecordsUrl`) |
| Salesforce | `BillingCountryCode` only exists if "State and Country Picklists" feature is enabled | `mulesoft/playbooks/playbooks/salesforce/objects/account/canonical-to-sf-account.dwl` (`useCountryCode` flag) |
| Salesforce | `CurrencyIsoCode` on Account only writable on multi-currency orgs | `mulesoft/playbooks/playbooks/salesforce/objects/account/canonical-to-sf-account.dwl` (`isMultiCurrency` flag) |

### Playbook maturity model

| Status | Meaning | Agent behaviour |
|--------|---------|----------------|
| `stub` | Detected by Scout, not yet implemented | Architect flags "New Playbook Required" open item |
| `observation` | Implemented on one client | Available but not auto-applied |
| `verified` | Confirmed on 2+ clients | Applied automatically by Architect |
| `promoted-to-standard` | Clear universal pattern | Moved into `DESIGN_STANDARDS.md` |

---

## How Field Knowledge Accumulates

`pipeline/FIELD_KNOWLEDGE.md` is the architect's lesson log. When any engagement surfaces something not covered by existing standards — during analysis, architecture, UAT, or production — it goes here.

All agents read `pipeline/FIELD_KNOWLEDGE.md` at the start of every session and apply `verified` entries automatically. You do not need to re-educate developers — the knowledge travels with the agent.

**How a finding travels from a project to a system improvement:**

```
Scout detects a system for the first time
        ↓
Stub created in mulesoft/playbooks/playbooks/, mulesoft/connector-registry.json, pipeline/intake-checklist.json
        ↓
Analyst + Architect enrich the stubs with design knowledge
        ↓
Developer implements using Anypoint Studio (client Codespace)
        ↓
Architect runs CO → answers questions per system, per internal flag, per open item
        ↓
Agent mints FK-NNN (status: observation), enriches playbook, updates autoWarnings
        ↓
Second engagement hits the same system → CO again → status promoted to verified
        Agents now apply it automatically on future projects
        ↓
Architect decides it's universal → PK command → agent drafts the target file change
        Promoted to mulesoft/playbooks/scenarios/, mulesoft/DESIGN_STANDARDS.md, or mulesoft/src/
```

No client names are stored — counts only.

---

## Capabilities Portal

A generated HTML portal at `portal/public/resources/capabilities.html` (the **Knowledge Base**) shows every registered capability:

- **Connectors** — all connectors, versions, staleness badges (green/yellow/red by days since verified)
- **Code Assets** — all three tiers: snippets, commons sub-flows/DWL, Exchange schemas
- **System Playbooks** — all objects per system, maturity status, client count
- **Scout Agents** — all pipeline agents from `pipeline/scout/pipeline.json`, their roles and capabilities
- **Intake Warnings** — all autoWarnings in `pipeline/intake-checklist.json` with trigger keywords and severity
- **Field Knowledge** — FK entries from `pipeline/FIELD_KNOWLEDGE.md`

GitHub Actions auto-regenerates this on every push that touches a registry file or decisions.json. To regenerate manually:

```bash
node pipeline/tools/generate-knowledge-base.js
```

---

## Standards

### Runtime
- **Mule 4.8.0 / Java 17** — all new projects
- **CloudHub 2.0** — default deployment
- **Runtime Fabric** — regulated and government security tiers only

### Security Tiers

| Tier | Controls | When |
|------|---------|------|
| `internal` | client-id-enforcement + rate-limiting | Internal system-to-system |
| `partner` | oauth2-client-credentials + rate-limiting | External partner APIs |
| `regulated` | oauth2 + JWT via Flex Gateway + Secrets Manager | PII, financial data |
| `government` | mTLS + oauth2 + JWT + Secrets Manager + field-encryption | Government contracts |

### Error Handling
- Global error handler mandatory in `error-handler.xml`
- Standard error envelope: `{correlationId, errorCode, message, timestamp, failingComponent}`
- DLQ routing for all async flows via `common-error-handler.xml`
- Never expose Java stack traces in API responses

### Idempotency TTL Rule
`deduplicationTtlMinutes` must always equal `messageTtlHours × 60`. If a message can live in the queue for 24 hours, the idempotency store must cover 24 hours, or a replayed message after a restart will be processed twice.

### API-Led Connectivity (mandatory)
Three-layer naming enforced by all generated projects:
- `{system}-sys-api` — wraps one backend system
- `{domain}-proc-api` — orchestration and business logic
- `{consumer}-exp-api` — consumer-specific formatting

---

## How to Use — Adding a Capability

### Close out a completed project (CO)

After the developer confirms delivery — run the full close-out. This updates all commons artifacts in one structured interview:

```
/bmad-agent-architect-debrief → CO
```

The agent reads all project artifacts, builds a question list from every registered internal flag, open item, and system, then asks one question at a time. All commons updates are written automatically based on the answers.

### Capture an ad-hoc finding (DK)

Something non-obvious happened — capture it immediately without waiting for close-out:

```
/bmad-agent-architect-debrief → DK
```

Six questions, plain language, done. When the same thing happens on a second engagement: run `DK` again. The agent promotes it to `verified` — all agents then apply it automatically.

### Promote a verified finding to standard (PK)

When a `verified` finding is clearly universal — bake it into the target file:

```
/bmad-agent-architect-debrief → PK
```

The agent lists verified entries, you pick one, it drafts the exact change to the target file (`mulesoft/playbooks/scenarios/`, `mulesoft/DESIGN_STANDARDS.md`, `mulesoft/playbooks/playbooks/{system}/`, or `mulesoft/src/main/resources/dwl/`), applies it, and updates the FK status to `promoted-to-standard`.

### Add a new connector (NC)

```
/bmad-agent-architect-debrief → NC
```

The agent asks for the connector name, Exchange coordinates, auth type, and required properties. It writes the `mulesoft/connector-registry.json` entry, creates the XML config stub in `mulesoft/connectors/`, runs the freshness check, and suggests the commit message.

### Add a new integration pattern (NP)

```
/bmad-agent-architect-debrief → NP
```

The agent asks for the pattern letter, integration style, compensation strategy, EDA fit, and decision guide entry. It creates the scenario file in `mulesoft/playbooks/scenarios/`, adds the enum value to `mulesoft/decisions-schema.json`, and adds the catalog row to `mulesoft/DESIGN_STANDARDS.md`.

### Add a new system playbook (NB)

```
/bmad-agent-architect-debrief → NB
```

The agent asks for the system name, auth method, objects needing DWL transforms, and any known quirks. It scaffolds the full folder structure under `mulesoft/playbooks/playbooks/{system}/`, writes skeleton auth/query/upsert sub-flows and bidirectional DWL transforms, registers the assets in `mulesoft/snippet-registry.json`, and regenerates the knowledge base.

---

## GitHub Actions — Automated Workflows

Two workflows run automatically on GitHub's servers. No Codespace needs to be open.

| Workflow | File | Trigger | What it does |
|----------|------|---------|--------------|
| **Regenerate Knowledge Base** | `capabilities.yml` | Push to `mulesoft/connector-registry.json`, `mulesoft/playbooks/`, `mulesoft/snippet-registry.json`, or `pipeline/scout/pipeline.json` | Rebuilds `portal/public/resources/capabilities.html` and commits to main |
| **Regenerate Client Portals** | `portal.yml` | Every 30 min + push to any `projects/*/` config file | Generates per-client portal HTML and deploys to Firebase Hosting |

### Client Portal

Each client gets a live portal at `https://dataskateclients.web.app/portal/{client}.html` showing:

- **Engagement phase tracker** — Discovery → Requirements → Build → Testing → Go Live
- **Documents** — intake form, responses, proposal, PRD, architecture, epics & stories, scoping files (popup with download links), source files, dev repo link
- **Sprint status board** — epics with progress bars and story-level status chips (Planned / In Progress / Review / Done), pulled live from the client's dev repo every 30 minutes

### Required Secrets (Settings → Secrets → Actions)

| Secret | What it is |
|--------|------------|
| `FIREBASE_SA_KEY` | Firebase service account JSON — authenticates Hosting deploys |
| `GITHUB_DEPLOY_TOKEN` | GitHub PAT — reads `stories.md` from client dev repos at deploy time |

`GITHUB_TOKEN` is automatic — GitHub provides it, no setup needed.

### Manual Deploy

To push immediately from your Codespace (requires `FIREBASE_SA_KEY` as a Codespace secret):

```bash
bash portal/deploy.sh
```

---

## Issue Tracking

| Track | Tool | Who sees it |
|-------|------|------------|
| Client deliverables | Jira | Client + delivery team |
| Developer tasks | GitHub Issues in client dev repo | Developers |
| System learning | GitHub Issues in this repo | Tech lead only |

Only the **extracted finding** crosses into this planning repo — not the client issue itself.

---

## MuleSoft Product Coverage

This system automates the **integration runtime pipeline** — the path from discovery to a running Mule application. It does not cover MuleSoft products that are UI-configured, developer tooling for building connectors, or products outside the integration runtime.

### Handled

| Product | How |
|---------|-----|
| **Mule Runtime 4.8.0** | Core output — all flow XML, pom.xml, properties files generated |
| **Anypoint Studio / Code Builder** | Target IDE — generated projects compile immediately when opened in Codespace |
| **CloudHub 2.0** | Default deployment target — `deploy.yml` generated per project |
| **Runtime Fabric (RTF)** | Available as `devops.deployment` option in `decisions.json` |
| **API Manager + API Gateway** | OAS 3.0 specs generated per HTTP flow; security policies (client-id, OAuth2, mTLS) driven from `decisions.json` security tier |
| **Anypoint Exchange** | Connector versions pinned from Exchange; `commons/publish.sh` publishes the shared library |
| **Anypoint Connectors** | 28 connector config stubs in `mulesoft/connectors/`; 345 entries in `mulesoft/connector-registry.json` with auth types, versions, and Maven coordinates |
| **Anypoint MQ** | Subscriber and publisher configs generated; queue setup, DLQ, TTL, and depth alert stories generated per async flow |
| **Anypoint Monitoring** | Alert configs and custom dashboard stories generated; mandatory in all non-minimal scaffold profiles |
| **Anypoint Visualizer** | API-led layer tags written into `mule-artifact.json`; a dedicated Visualizer verification story is generated per project |
| **Anypoint IDP** | Pattern V (`idp-document-processing`) — scenario file, trigger template, and manual-review queue generated |
| **MuleSoft AI Chain** | Registered in `connector-registry.json` (`ai_ml` category); usable via Pattern P (`ai-augmented-flow`) |
| **Agentforce** | Config stub and invocation snippet generated; marked `verifyBeforeUse=true` until confirmed against Exchange |
| **Anypoint RPA** | Pattern W (`rpa-orchestration`) — full invoke-and-poll lifecycle via HTTP connector against RPA REST API v2. OAuth 2.0 Connected App auth. Scenario file, connector config template, invoke-and-poll snippet, and scaffold generator injection all included. |

### Not Handled

| Product | Why not |
|---------|---------|
| **Anypoint Design Center** | This system generates OAS specs that go directly into Studio and Exchange. Design Center is a browser-based design alternative to Studio — it is bypassed, not integrated. |
| **Anypoint DataGraph** | DataGraph is a GraphQL federation layer configured in Anypoint Platform — not a flow-level concern. It sits above the APIs this system generates, and requires its own governance tooling. |
| **Connector DevKit / PDK** | This system consumes connectors from Exchange. Building custom connectors is a separate Java/SDK discipline outside the planning pipeline. |
| **CloudHub 1.0** | Deprecated. Explicitly excluded — all generated projects target CloudHub 2.0 only. |

---

*Mule 4.8.0 / Java 17 / CloudHub 2.0 — System built May 2026*
