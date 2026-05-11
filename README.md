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
- `commons/playbooks/{system}/PLAYBOOK.md` — stub created on first detection, enriched as the project progresses
- `standards/connector-registry.json` — stub entry with auth type to be confirmed
- `standards/intake-checklist.json` — baseline autoWarning so the next project sees this system flagged immediately

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

The Analyst also enriches the commons stubs Scout created — confirming auth types, object types, and known constraints from the intake documents.

**Do not proceed to Step 3 until you have sent the gap questions to the client and received confirmation.** The Architect needs confirmed field contracts, not guesses.

### Step 3: Run the Architect

```
/bmad-agent-architect
```
or
```
Talk to Winston (the architect). Read projects/{client}/prd.md. Walk the 6-level decision tree. Produce projects/{client}/architecture.md and projects/{client}/decisions.json
```

The Architect reads `docs/FIELD_KNOWLEDGE.md` and all existing `commons/playbooks/*/PLAYBOOK.md` files before the decision tree. Verified field knowledge entries take precedence over scenario file defaults. For any system with an existing playbook, the Architect references its auth pattern and DWL files rather than redesigning from scratch.

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

The Architect enriches all commons stubs before completing the MD run — playbook PLAYBOOK.md updated with design-confirmed auth and objects, connector-registry updated with confirmed auth type, intake-checklist updated with any specific gotchas found during architecture.

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

- `docs/FIELD_KNOWLEDGE.md` — new FK entries for any non-obvious finding
- `commons/playbooks/{system}/` — implementation learnings, confirmed DWL mappings, maturity update
- `standards/intake-checklist.json` — new or updated autoWarnings so the next project sees these issues at intake time
- `standards/connector-registry.json` — confirmed auth types, versions, and any new connectors used

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
| Intake questionnaire | Sent to client | `projects/{client}/intake/intake-questionnaire.md` |
| PRD | Tech lead review, client sign-off | `projects/{client}/prd.md` |
| API contract files | Send gap questions to client | `projects/{client}/api-discovery/` |
| Architecture doc | Tech lead approval | `projects/{client}/architecture.md` |
| `decisions.json` | Drives all code generation | `projects/{client}/decisions.json` |
| Sprint stories | Developer task board | `projects/{client}/stories.md` |
| Compiling Mule project | Developer codes against it | `github.com/{org}/{client}-mule` |
| Codespace URL | Developer opens it, done | Printed by `create-client-repo.sh` |

After close-out, every project also contributes to the commons:

| Commons artifact | Updated by | What grows |
|-----------------|-----------|-----------|
| `docs/FIELD_KNOWLEDGE.md` | Architect (DK / CO) | FK entries — lessons from every project |
| `commons/playbooks/{system}/` | Scout (stub) → Architect (design) → CO (implementation) | Auth, DWL mappings, known quirks per system |
| `standards/intake-checklist.json` | Scout (stub) → Architect Debrief Q6 / CO | autoWarnings — every system ever seen gets an entry |
| `standards/connector-registry.json` | Scout (stub) → Analyst → Architect → CO | Confirmed auth, versions, staleness |

---

## Why It Exists

Every new MuleSoft engagement used to start the same way: a tech lead spending the first week making identical decisions — which pattern, which connectors, how to handle errors, how to structure flows. The decisions were inconsistent between projects, junior developers had no guardrails, and every repo started from blank files.

**This system encodes those decisions once, at the right abstraction level, and automates everything downstream.**

Three specific problems it solves:

1. **Consistency** — all generated projects share the same error handling, correlation ID propagation, security controls, and naming conventions. No project deviates unless explicitly configured.

2. **Speed** — the Analyst, Architect, and PM agents each take minutes. Code generation takes seconds. The bottleneck becomes client response time, not internal setup time.

3. **Accumulation** — every new project teaches the system something. Lessons go into `docs/FIELD_KNOWLEDGE.md`, agents apply them on future projects automatically, and the playbooks in `commons/playbooks/` grow with each system touched. The close-out (Step 7) is the mechanism that makes this happen systematically.

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
├── standards/
│   ├── MULESOFT_DESIGN_STANDARDS.md   The constitution — all pattern decisions flow from here
│   ├── decisions-schema.json           Schema + empty template for decisions.json
│   ├── connector-registry.json         All known connectors: versions, Maven coords, auth types
│   ├── intake-checklist.json           Mandatory checks + autoWarnings per system (grows with every project)
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
│   └── playbooks/                      System-specific reusable code (grows with every project)
│       ├── salesforce/                 Verified: auth, account, contact, opportunity
│       ├── netsuite/                   Verified: PS256 auth, customer, sales-order, invoice
│       └── {system}/                   Stub created by Scout on first detection; enriched by CO
│
├── docs/
│   ├── PLANNING_CONTEXT.md            Master system context — read before every session
│   ├── FIELD_KNOWLEDGE.md             Lessons from real projects; agents apply verified entries
│   ├── PATTERNS_RESEARCH.md           Research reference: EIP, flow control, coupling, compensation
│   └── CHUNK_PROGRESS.md              Build progress log
│
└── projects/
    └── {client}/
        ├── scoping/                    Drop raw scoping call notes here (Step 0)
        ├── intake/                     Drop completed intake questionnaire responses here (Step 1)
        │   └── intake-questionnaire.md  Generated by Scout — send to client
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
| 6 | Connector selection | Registry lookup, version pinning, playbook lookup, staleness check (>60d = warning) |

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

### How playbooks grow

| Stage | Who | What happens |
|-------|-----|-------------|
| Scout run | Scout | Stub PLAYBOOK.md created on first detection — marks system as known |
| Analyst run | Analyst | Stub enriched with auth type and object types confirmed from intake |
| Architect MD run | Architect | Stub enriched with design-confirmed auth, objects needed, and known quirks |
| CO run (post-delivery) | Architect | Real implementation learnings added — confirmed DWL mappings, maturity updated, gotchas documented |
| Second client | CO run | Maturity advances from `observation` to `verified` — Architect applies it automatically |

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
| `stub` | Detected by Scout, not yet implemented | Architect flags "New Playbook Required" open item |
| `observation` | Implemented on one client | Available but not auto-applied |
| `verified` | Confirmed on 2+ clients | Applied automatically by Architect |
| `promoted-to-standard` | Clear universal pattern | Moved into `MULESOFT_DESIGN_STANDARDS.md` |

---

## How Field Knowledge Accumulates

`docs/FIELD_KNOWLEDGE.md` is the architect's lesson log. When any engagement surfaces something not covered by existing standards — during analysis, architecture, UAT, or production — it goes here.

All agents read this file at the start of every session and apply `verified` entries automatically. You do not need to re-educate developers — the knowledge travels with the agent.

**How a finding travels from a project to a system improvement:**

```
Scout detects a system for the first time
        ↓
Stub created in playbooks/, connector-registry, intake-checklist
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
        Promoted to scenario file, standards doc, or commons playbook
```

No client names are stored — counts only.

---

## Capabilities Portal

A generated HTML portal at `docs/capabilities/index.html` shows every registered capability:

- **Connectors** — all connectors, versions, staleness badges (green/yellow/red by days since verified)
- **Code Assets** — all three tiers: snippets, commons sub-flows/DWL, Exchange schemas
- **System Playbooks** — all objects per system, maturity status, client count
- **Intake Warnings** — all autoWarnings in intake-checklist.json with trigger keywords and severity

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

The agent lists verified entries, you pick one, it drafts the exact change to the target file (scenario, standards doc, playbook, or commons DWL), applies it, and updates the FK status to `promoted-to-standard`.

### Add a new connector (NC)

```
/bmad-agent-architect-debrief → NC
```

The agent asks for the connector name, Exchange coordinates, auth type, and required properties. It writes the `connector-registry.json` entry, creates the XML config stub in `templates/connectors/`, runs the freshness check, and suggests the commit message.

### Add a new integration pattern (NP)

```
/bmad-agent-architect-debrief → NP
```

The agent asks for the pattern letter, integration style, compensation strategy, EDA fit, and decision guide entry. It creates the scenario file in `standards/scenarios/`, adds the enum value to `decisions-schema.json`, and adds the catalog row to `MULESOFT_DESIGN_STANDARDS.md`.

### Add a new system playbook (NB)

```
/bmad-agent-architect-debrief → NB
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
