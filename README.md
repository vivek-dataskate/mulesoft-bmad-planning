# MuleSoft BMAD Planning System

> For tech leads and architects. Developers never touch this repo — they receive a generated GitHub repo they open in a Codespace.

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

Scout reads the scoping notes, infers which systems are involved (explicit and implied), cross-checks every detected system against the connector registry for known quirks, and produces:

- `projects/{client}/intake-questionnaire.md` — a tailored questionnaire with base questions + system-specific gotcha questions generated dynamically per detected system

**Send the intake questionnaire to the client. Wait for their responses before proceeding to Step 1.**

This step prevents the two most common causes of mid-project blockers: undocumented API contracts and system-specific connector constraints (SAP JCo license, NetSuite PS256 JWT, ServiceNow OAuth metadata limitation, etc.) discovered too late.

### Step 1: Drop discovery documents

```
projects/{client}/intake/
```

Drop the client's completed intake questionnaire responses plus any supporting docs: API specs, architecture diagrams, existing data mappings, email threads.

### Step 2: Run the Analyst

In this Claude Code chat, send:

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

**Do not proceed to Step 3 until you have sent the gap questions to the client and received confirmation.** The Architect needs confirmed field contracts, not guesses.

### Step 3: Run the Architect

```
/bmad-agent-architect
```
or
```
Talk to Winston (the architect). Read projects/{client}/prd.md. Walk the 6-level decision tree. Produce projects/{client}/architecture.md and projects/{client}/decisions.json
```

The Architect reads `docs/FIELD_KNOWLEDGE.md` before the decision tree and applies any verified lessons that match the project's systems or patterns.

**Validate before proceeding:**
```bash
node -e "
  const schema = require('./standards/decisions-schema.json');
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

### Step 4: Run the PM

```
/bmad-agent-pm
```
or
```
Talk to John (the PM). Read projects/{client}/decisions.json and story-library/. Generate projects/{client}/stories.md
```

Stories reference exact file names, acceptance criteria, and coverage floors — developers pick them up without needing to interpret the architecture doc.

### Step 5: Generate and push the client repo

```bash
node scaffold/generate.js --decisions projects/{client}/decisions.json --output /tmp/{client}-mule

GITHUB_TOKEN=ghp_... bash scaffold/create-client-repo.sh \
  --client {client} \
  --org {your-github-org}
```

The script creates `github.com/{org}/{client}-mule`, pushes code, and prints a one-click Codespace URL. Send that URL to the developer — they open it, the project compiles, they fill in `// TODO` blocks.

**Total time: discovery docs → developer writing code, under an hour.**

### Step 6: Debrief after any milestone

Any time during or after the engagement — mid-architecture, post-UAT, post-production — if you learned something worth keeping, capture it:

```
/bmad-agent-architect-debrief
```
or
```
Talk to the Architect Debrief agent. Select DK.
```

Describe what you observed in plain language. The agent asks 6 questions and writes the field knowledge entry. No code needed, no client names recorded — counts only.

When a finding has been confirmed on a second engagement, run `PK` to promote it: the agent drafts the exact change to the target file (scenario, standards doc, playbook, or commons DWL) and applies it. That learning then travels to every future project automatically.

---

## What This System Produces

For every client engagement:

| Artifact | Who uses it | Where |
|----------|-------------|-------|
| PRD | Tech lead review, client sign-off | `projects/{client}/prd.md` |
| API contract files | Send gap questions to client | `projects/{client}/api-discovery/` |
| Architecture doc | Tech lead approval | `projects/{client}/architecture.md` |
| `decisions.json` | Drives all code generation | `projects/{client}/decisions.json` |
| Sprint stories | Developer task board | `projects/{client}/stories.md` |
| Compiling Mule project | Developer codes against it | `github.com/{org}/{client}-mule` |
| Codespace URL | Developer opens it, done | Printed by `create-client-repo.sh` |

---

## Why It Exists

Every new MuleSoft engagement used to start the same way: a tech lead spending the first week making identical decisions — which pattern, which connectors, how to handle errors, how to structure flows. The decisions were inconsistent between projects, junior developers had no guardrails, and every repo started from blank files.

**This system encodes those decisions once, at the right abstraction level, and automates everything downstream.**

Three specific problems it solves:

1. **Consistency** — all generated projects share the same error handling, correlation ID propagation, security controls, and naming conventions. No project deviates unless explicitly configured.

2. **Speed** — the Analyst, Architect, and PM agents each take minutes. Code generation takes seconds. The bottleneck becomes client response time, not internal setup time.

3. **Accumulation** — every new project teaches the system something. Lessons go into `docs/FIELD_KNOWLEDGE.md`, agents apply them on future projects automatically, and the playbooks in `commons/playbooks/` grow with each system touched.

---

## Folder Structure

```
mulesoft-bmad-planning/
├── _bmad/                          BMAD agent definitions
│   └── custom/
│       ├── bmad-agent-analyst.toml          Mary: PRD + API contract discovery
│       ├── bmad-agent-architect.toml        Winston: 6-level decision tree → decisions.json
│       ├── bmad-agent-architect-debrief.toml  DK: capture field knowledge; PK: promote to standard
│       ├── bmad-agent-pm.toml               John: decisions.json → sprint stories
│       └── bmad-agent-dev.toml              Dev agent: standards enforcer during coding
│
├── standards/
│   ├── MULESOFT_DESIGN_STANDARDS.md   The constitution — all pattern decisions flow from here
│   ├── decisions-schema.json           Schema + empty template for decisions.json
│   ├── connector-registry.json         All known connectors: versions, Maven coords, required props
│   ├── snippet-registry.json           Three-tier registry of all reusable code assets
│   └── scenarios/                      One reference file per integration pattern (A–U)
│
├── templates/
│   ├── prd-template.md
│   ├── architecture-template.md
│   ├── story-template.md
│   └── connectors/                     XML config stubs per connector (28 connectors)
│
├── story-library/                      Reusable story templates the PM references
│   ├── global-*.md                     Always-on or conditional global stories (10 files)
│   └── flow-*.md                       Per-flow story templates (5 files)
│
├── scaffold/
│   ├── generate.js                     Code generator: decisions.json → complete Mule project
│   ├── create-client-repo.sh           Creates GitHub repo and pushes generated project
│   ├── generate-capabilities.js        Builds the capabilities portal (HTML)
│   ├── check-registry-freshness.js     Flags connectors not verified in >60 days
│   └── xml-templates/                  Source XML the generator renders (triggers, snippets, etc.)
│
├── commons/                            Reusable library — shared across ALL client projects
│   ├── pom.xml                         Packaged as mule-plugin; deployed to Anypoint Exchange
│   ├── publish.sh                      Publish script (username+pass or connected app auth)
│   ├── src/main/mule/                  Sub-flows injected by reference (flow-ref)
│   │   ├── common-error-handler.xml    DLQ routing, error response, notification dispatch
│   │   ├── common-retry.xml            Retry-queue pattern with exponential backoff
│   │   ├── common-notification.xml     Slack + email (scatter-gather, skips blank channels)
│   │   ├── common-batch.xml            Batch on-complete: log, alert, persist watermark
│   │   └── common-correlation.xml      Generate / propagate / extract correlation ID
│   ├── src/main/resources/dwl/         DWL modules — importable by any client project
│   │   ├── error-envelope.dwl          Standard error envelope builder
│   │   ├── pii-mask.dwl                Recursive payload masking (20+ field patterns)
│   │   ├── canonical-date.dwl          Date normalization (ISO, US, epoch, Salesforce format)
│   │   └── build-audit-record.dwl      CEF-compatible audit records; chains pii-mask
│   ├── exchange/                        Canonical schema fragments published to Anypoint Exchange
│   │   ├── canonical-order.yaml
│   │   ├── canonical-customer.yaml
│   │   └── canonical-invoice.yaml
│   └── playbooks/                      System-specific reusable code (grows with each project)
│       ├── salesforce/                 See: Playbooks section below
│       └── netsuite/
│
├── docs/
│   ├── PLANNING_CONTEXT.md            Master system context — read before every session
│   ├── FIELD_KNOWLEDGE.md             Lessons from real projects; agents apply verified entries
│   ├── PATTERNS_RESEARCH.md           Research reference: EIP, flow control, coupling, compensation
│   ├── CHUNK_PROGRESS.md              Build progress log
│   └── capabilities/index.html        Generated capabilities portal (auto-updated by GitHub Actions)
│
└── projects/
    └── {client}/
        ├── intake/                     Drop raw discovery docs here
        ├── api-discovery/              API contract files (Analyst output)
        ├── prd.md
        ├── architecture.md
        ├── decisions.json
        └── stories.md
```

---

## The Decision Tree (What the Architect Does)

The Architect walks 6 decisions in order. Every decision has a schema constraint in `decisions-schema.json`. The tech lead's job is to review the output, not re-walk the tree.

| Level | Decision | Why it comes first |
|-------|----------|-------------------|
| 1 | Integration pattern (A–U) | Everything else depends on this: error strategy, retry model, test approach |
| 2 | Message TTL and dedup TTL | Prevents phantom retries and idempotency holes; TTL = messageTtlHours × 60 minutes |
| 3 | Error handling model | DLQ + retry-queue for async; 4xx/5xx mapping for sync |
| 4 | Security tier | Determines connector config, property encryption, Flex Gateway requirement |
| 5 | Deployment profile | minimal / standard / enterprise / regulated — drives which sub-flows are generated |
| 6 | Connector selection | Registry lookup, version pinning, staleness check (>60d = warning) |

The 21 integration patterns (A–U) are in `standards/scenarios/`. Each scenario file specifies the integration style, compensation strategy, flow control config, and EDA fit assessment so the Architect isn't deriving them from first principles every time.

---

## The Commons Library — Cross-Client Reuse

Every generated client project declares `mulesoft-commons` as a Maven dependency. This means:

- Error handling, retry, notifications, and audit logging are **one implementation, one place to fix**
- A bug fix in `common-error-handler.xml` benefits all client projects on next deploy — not just the one that found the bug
- New client projects automatically inherit any sub-flow improvements published to Exchange

**Why retry-queue instead of `until-successful`:**
`until-successful` blocks the consumer thread for the entire retry duration and loses state on Mule restart. The retry-queue pattern publishes a message back to a retry queue with `X-Retry-Attempt` metadata, releases the consumer immediately, and survives restarts. The commons `common-retry.xml` implements this with exponential backoff.

**Why `set-correlation-id` instead of `set-variable`:**
Mule 4.6+ introduced `set-correlation-id` as a first-class element. `set-variable` creates a flow variable — it does not set the Mule event's `correlationId`, which is what appears in logs and gets propagated by the runtime. `common-correlation.xml` uses `set-correlation-id` everywhere.

---

## System Playbooks — How Integration Knowledge Accumulates

The playbooks in `commons/playbooks/` encode what we know about each external system. Each playbook is **system-specific, not pair-specific** — the Salesforce playbook is reused whether the other side is NetSuite, SAP, Workday, or anything else.

```
commons/playbooks/salesforce/       commons/playbooks/netsuite/
  system/sf-auth.xml                  system/ns-auth.xml
  system/sf-query.xml                 system/ns-query.xml
  objects/account/                    system/ns-upsert.xml
  objects/opportunity/                objects/sales-order/
  objects/contact/                    objects/invoice/
                                      objects/customer/
```

**Every object has bidirectional DWL transforms:**
- `{system}-{object}-to-canonical.dwl` — maps FROM the system's native format TO the canonical schema
- `canonical-to-{system}-{object}.dwl` — maps FROM canonical TO the system's REST request body

**Cross-system flows become two imports:**
```dataweave
import sfOpportunityToCanonical from "playbooks/salesforce/objects/opportunity/sf-opportunity-to-canonical.dwl"
import canonicalToNsOrder       from "playbooks/netsuite/objects/sales-order/canonical-to-ns-order.dwl"
---
canonicalToNsOrder(sfOpportunityToCanonical(payload))
```

No new code needed. The full field mapping, null handling, and status enum translation is already inside the two functions.

**When a second client needs Salesforce ↔ NetSuite:** the infrastructure is already here. Only the business-rule customizations (`// CLIENT TODO` blocks) need to change.

### Known critical quirks encoded in the playbooks

| System | Quirk | Where it's handled |
|--------|-------|-------------------|
| NetSuite | REST requires **PS256 JWT** — MuleSoft JWT Module does NOT support PS256 | `ns-auth.xml` (Nimbus JOSE via Groovy) |
| NetSuite | SuiteQL max 1,000 records/page; governance units → 429 on overrun | `ns-query.xml` (exponential backoff) |
| NetSuite | Invoices are system-generated — cannot POST to create one | `ns-invoice-to-canonical.dwl` (read-only direction only) |
| NetSuite | Item lookup requires internalId — no lookup by product code via REST | `canonical-to-ns-order.dwl` (itemMapping helper parameter) |
| Salesforce | SOQL OFFSET breaks silently on > 2,000 records | `sf-query.xml` (cursor pagination via `nextRecordsUrl`) |
| Salesforce | `BillingCountryCode` only exists if "State and Country Picklists" feature is enabled | `canonical-to-sf-account.dwl` (`useCountryCode` flag) |
| Salesforce | `CurrencyIsoCode` on Account only writable on multi-currency orgs | `canonical-to-sf-account.dwl` (`isMultiCurrency` flag) |

### Playbook maturity model

| Status | Meaning | Agent behaviour |
|--------|---------|----------------|
| `observation` | Seen once (one client) | Available but not auto-applied |
| `verified` | Seen on 2+ clients | Applied automatically by Architect |
| `promoted-to-standard` | Clear universal pattern | Moved into `MULESOFT_DESIGN_STANDARDS.md` |

---

## How Field Knowledge Accumulates

`docs/FIELD_KNOWLEDGE.md` is the architect's lesson log. When any engagement surfaces something not covered by existing standards — during analysis, architecture, coding, UAT, or production — it goes here.

All agents read this file at the start of every session and apply `verified` entries automatically. You do not need to re-educate developers — the knowledge travels with the agent.

**To add or update an entry:** invoke the Architect Debrief agent and select `DK`. Six questions, plain language, no code required. The agent handles numbering, formatting, and status promotion logic.

```
Talk to the Architect Debrief agent. Select DK.
```

**How a finding travels from a project to a system improvement:**

```
Architect observes something unexpected (any time — discovery, arch, code, or prod)
        ↓
Opens Architect Debrief agent → DK → describes it in plain language
        ↓
Agent mints FK-NNN (status: observation, Times: 1)
        ↓
Second engagement hits the same thing → DK again → agent increments to verified
        Agents now apply it automatically on future projects
        ↓
Architect decides it's universal → PK command → agent drafts the target file change
        Promoted to scenario file, standards doc, or commons playbook
```

No client names are stored — counts only. Current verified entries: PS256 JWT (NetSuite), `set-correlation-id` vs `set-variable`, `on-error-continue` inside async scope, byte[] from S3 claim-check, MUnit `expectedErrorType` with `on-error-continue`.

---

## Capabilities Portal

A generated HTML portal at `docs/capabilities/index.html` shows every registered capability:

- **Connectors** — all 28 connectors, versions, staleness badges (green/yellow/red by days since verified)
- **Code Assets** — all three tiers: snippets, commons sub-flows/DWL, Exchange schemas
- **System Playbooks** — all objects per system, maturity status, clients using each
- **Client Usage** — per-client pattern, security tier, connector profile

GitHub Actions auto-regenerates this on every push that touches a registry file or decisions.json. To regenerate manually:

```bash
node scaffold/generate-capabilities.js
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

### Capture a field knowledge observation (any time)

Something non-obvious happened on a project — a connector quirk, a Mule XML gotcha, a pattern that didn't fit. Capture it before it's forgotten:

```
/bmad-agent-architect-debrief
```
or
```
Talk to the Architect Debrief agent. Select DK.
```

Describe what you observed in plain language. Six questions, done. The agent writes the FK entry, updates the index, and suggests the commit message. No client names — counts only.

When the same thing happens on a second engagement: run `DK` again. The agent finds the existing entry and promotes it to `verified`. All agents then apply it automatically on future projects.

### Promote a verified finding to standard (PK)

When a `verified` finding is clearly universal — not just a pattern for one system type — bake it into the target file so no agent has to read the FK entry to know it:

```
/bmad-agent-architect-debrief
```
or
```
Talk to the Architect Debrief agent. Select PK.
```

The agent lists verified entries, you pick one, it drafts the exact change to the target file (scenario file, standards doc, playbook, or commons DWL), applies it, and updates the FK status to `promoted-to-standard`.

### Add a new connector

```
/bmad-agent-architect-debrief
```
or
```
Talk to the Architect Debrief agent. Select NC.
```

The agent asks for the connector name, Exchange coordinates, auth type, and required properties. It writes the `connector-registry.json` entry, creates the XML config stub in `templates/connectors/`, runs the freshness check, and suggests the commit message.

### Add a new integration pattern

```
/bmad-agent-architect-debrief
```
or
```
Talk to the Architect Debrief agent. Select NP.
```

The agent asks for the pattern letter, integration style, compensation strategy, EDA fit, and decision guide entry. It creates the scenario file in `standards/scenarios/`, adds the enum value to `decisions-schema.json`, and adds the catalog row to `MULESOFT_DESIGN_STANDARDS.md`.

### Add a new system playbook

```
/bmad-agent-architect-debrief
```
or
```
Talk to the Architect Debrief agent. Select NB.
```

The agent asks for the system name, auth method, objects needing DWL transforms, and any known quirks. It scaffolds the full folder structure under `commons/playbooks/{system}/`, writes skeleton auth/query/upsert sub-flows and bidirectional DWL transforms, registers the assets in `snippet-registry.json`, and regenerates the capabilities portal.

---

## Issue Tracking

| Track | Tool | Who sees it |
|-------|------|------------|
| Client deliverables | Jira | Client + delivery team |
| Developer tasks | GitHub Issues in client dev repo | Developers |
| System learning | GitHub Issues in this repo | Tech lead only |

Only the **extracted finding** crosses into this planning repo — not the client issue itself.

---

*Mule 4.8.0 / Java 17 / CloudHub 2.0 — System built May 2026*
