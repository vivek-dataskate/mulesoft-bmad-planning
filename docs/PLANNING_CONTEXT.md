# MuleSoft BMAD Planning System — Master Context
> Read this file before doing ANYTHING in this repo.
> This is the single source of truth for all decisions made during system design.
> Every Claude Code session starts by reading this file.
> Last updated: May 2026

---

## WHAT THIS SYSTEM IS

A single GitHub planning repo that a tech lead uses to take any client discovery
document as input and automatically produce a ready-to-open MuleSoft project for
developers. The developer opens the generated repo in a GitHub Codespace and starts
filling in TODOs immediately. No blank projects. No manual setup. Standards enforced
automatically.

---

## THE COMPLETE FLOW

```
INPUT (any combination):
  - Sales call transcript
  - Discovery / requirements doc
  - Slide deck / pricing deck
  - Email threads
  - Existing architecture docs
  All dropped into: projects/{client}/intake/
        ↓
BMAD ANALYST AGENT
  Reads all intake docs
  Extracts: systems, flows, pain points, NFRs,
            constraints, budget, timeline, stakeholders
  Checks connector-registry.json for every identified system
  Triggers API Contract Discovery for any system with no spec
  Output → projects/{client}/prd.md
         + projects/{client}/api-discovery/ (per undocumented system)
        ↓
API CONTRACT DISCOVERY  [runs when Analyst flags a system as spec-unknown]
  For each system without a complete API spec:
    GET-first: probe all known GET endpoints, capture response shapes
    Classify fields: server-generated vs required-on-create vs optional
    Try minimal POST: iterate curl attempts, log each error response
    Document: working curl, confirmed fields, ambiguous fields
    Gap list: specific best-guess questions only — never open-ended asks
  Output → projects/{client}/api-discovery/{system}-contract.md
        ↓
BMAD ARCHITECT AGENT
  Reads prd.md + standards/MULESOFT_DESIGN_STANDARDS.md
  Reads docs/PATTERNS_RESEARCH.md (required before walking decision tree)
  Walks the 6-level decision tree (Level 0 → Level 6)
  Selects: integration style, pattern, NFRs, systems, ops needs, devops
  Output → projects/{client}/architecture.md
         + projects/{client}/decisions.json
        ↓
BMAD PM AGENT
  Reads decisions.json + story-library/
  Generates MuleSoft-specific sprint stories
  Output → projects/{client}/stories.md
        ↓
SCAFFOLD GENERATOR (Node.js)
  Reads decisions.json + standards/connector-registry.json
  Reads XML templates from scaffold/xml-templates/
  Selects scaffold profile from decisions.json (see SCAFFOLD PROFILE SELECTION)
  Generates complete valid Mule project code
  Warns if any connector lastVerified > 6 months
  Output → /tmp/{client}-mule/ (temporary)
        ↓
CREATE CLIENT REPO SCRIPT (shell)
  Reads decisions.json
  Runs scaffold generator
  Creates new GitHub repo via GitHub API
  Pushes generated code
  Developer opens repo in Codespace — no cloning needed
        ↓
DEVELOPER
  Opens github.com/{org}/{client}-mule in Codespace
  Anypoint Code Builder opens automatically
  Project compiles immediately
  Developer fills in TODO comments
  Runs MUnit tests
  Deploys to CloudHub 2.0
```

---

## TWO REPO MODEL

### Repo 1 — THIS REPO (Planning)
- `github.com/{org}/mulesoft-bmad-planning`
- Used by: Tech lead only
- ONE repo for ALL clients forever
- Per client: New folder added to `projects/{client}/`
- Gets smarter with every project — registry grows
- Client never sees this repo

### Repo 2 — Client Dev Repo (Generated per client)
- `github.com/{org}/{client}-mule`
- Used by: Developers only
- Contains: Generated Mule code only
- No BMAD, no standards, no planning artifacts
- Developer opens in Codespace directly — no cloning

---

## GENERATED CLIENT PROJECT STRUCTURE

The scaffold generator produces a standard Maven MuleSoft project. Every generated repo
follows this exact layout — developers can navigate it without instructions.

```
{client}-mule/
  ├── pom.xml                              ← connectors declared here (TODO: verify exact version on Exchange)
  ├── mule-artifact.json
  ├── src/
  │     ├── main/
  │     │     ├── mule/
  │     │     │     ├── global-config.xml  ← connector configs, properties placeholder, HTTP listener config
  │     │     │     ├── error-handler.xml  ← global error handler, DLQ routing, notification dispatch
  │     │     │     └── {domain}-flows.xml ← one file per logical flow group (named per decisions.json flows[])
  │     │     ├── resources/
  │     │     │     ├── api/
  │     │     │     │     └── {api-name}.yaml        ← OAS 3.0 spec (stubbed; developer completes)
  │     │     │     ├── dwl/
  │     │     │     │     └── {verb}-{source}-to-{target}.dwl  ← external DataWeave transforms
  │     │     │     └── properties/
  │     │     │           ├── local.yaml
  │     │     │           ├── dev.yaml
  │     │     │           ├── uat.yaml
  │     │     │           └── prod.yaml
  │     └── test/
  │           └── munit/
  │                 └── {flow-name}-test.xml  ← MUnit stubs per flow (happy path + error scenarios)
  └── .github/
        └── workflows/
              └── deploy.yml                  ← GitHub Actions CI/CD (generated when cicd=github-actions)
```

**Rules the scaffold enforces:**
- One `{domain}-flows.xml` per entry in `decisions.json flows[]` — no monolithic single-file projects
- All DataWeave transforms > 10 lines live in `dwl/` — never inline
- Properties split by environment — no hardcoded values anywhere
- `global-config.xml` contains all connector config elements — flows files contain only flows
- `error-handler.xml` is always generated — never skipped
- MUnit file generated per flow file — empty stubs if logic is unknown; developer fills in

---

## REPO FOLDER STRUCTURE (THIS REPO)

```
mulesoft-bmad-planning/
  ├── docs/
  │     ├── PLANNING_CONTEXT.md       ← this file
  │     ├── CHUNK_PROGRESS.md
  │     └── PATTERNS_RESEARCH.md      ← required reading for Architect Agent
  ├── _bmad/
  │     └── custom/
  │           ├── bmad-agent-analyst.toml   ← Analyst (Mary) team overrides
  │           ├── bmad-agent-architect.toml ← Architect (Winston) team overrides
  │           ├── bmad-agent-pm.toml        ← PM (John) team overrides
  │           └── bmad-agent-dev.toml       ← Dev (Amelia) team overrides
  ├── standards/
  │     ├── MULESOFT_DESIGN_STANDARDS.md
  │     ├── decisions-schema.json
  │     ├── connector-registry.json
  │     └── scenarios/
  │           ├── real-time.md              (A: request-reply)
  │           ├── event-driven.md           (B: event-driven 1-to-1)
  │           ├── batch.md                  (C: batch scope)
  │           ├── scheduled-sync.md         (D: periodic delta)
  │           ├── file-based-etl.md         (E: SFTP/S3 file drop)
  │           ├── cdc-streaming.md          (F: change data capture)
  │           ├── b2b-edi.md                (G: AS2/EDIFACT/X12)
  │           ├── process-orchestration.md  (H: saga workflow)
  │           ├── api-aggregation.md        (I: scatter-gather)
  │           ├── webhook-ingestion.md      (J: inbound SaaS events)
  │           ├── data-migration.md         (K: one-time bulk load)
  │           ├── streaming-pipeline.md     (L: Kafka→data lake)
  │           ├── pubsub-fanout.md          (M: broadcast 1-to-N)
  │           ├── outbound-notification.md  (N: alert dispatch)
  │           ├── hybrid.md                 (O: combination)
  │           ├── ai-augmented-flow.md      (P: LLM/AI mid-flow)
  │           ├── rag-data-pipeline.md      (Q: vector store ingestion)
  │           ├── agentic-mcp-integration.md (R: agent tool layer)
  │           ├── transactional-outbox.md   (S: guaranteed DB+event atomicity)
  │           ├── reverse-etl.md            (T: warehouse → operational system)
  │           └── ai-gateway.md             (U: centralized LLM proxy)
  ├── templates/
  │     ├── prd-template.md
  │     ├── architecture-template.md
  │     ├── story-template.md
  │     └── connectors/
  │           └── (one XML per connector in registry)
  ├── story-library/
  │     └── (13 story template files)
  ├── scaffold/
  │     ├── generate.js
  │     ├── create-client-repo.sh
  │     └── xml-templates/
  │           └── (all Mule project template files)
  ├── projects/
  │     └── leolabs/
  │           ├── intake/
  │           ├── prd.md
  │           ├── architecture.md
  │           ├── decisions.json
  │           └── stories.md
  ├── .devcontainer/devcontainer.json
  ├── .gitignore
  └── README.md
```

---

## PATTERNS RESEARCH REFERENCE

`docs/PATTERNS_RESEARCH.md` is a living reference document maintained by the Architect.
It is **not** the system definition — that is `standards/MULESOFT_DESIGN_STANDARDS.md`.

Consult `PATTERNS_RESEARCH.md` when:
- No scenario file clearly fits the client's integration need
- A pattern choice between two candidates is non-obvious
- A new pattern or technology needs to be evaluated before updating the standards
- The reasoning behind a standard decision needs to be traced back to first principles

Do not consult it on routine projects where the scenario file covers the case.
The Architect should update it when discovering new patterns, revising flow control
guidance, or deprecating an approach — and then decide whether the finding warrants
a change to `MULESOFT_DESIGN_STANDARDS.md` or a scenario file.

---

## THE 6-LEVEL DECISION TREE

### Level 0 — Integration Style Selection

Before selecting a pattern, select the integration style. This is a pre-pattern decision that
constrains which patterns are valid at Level 1.

| Style | Description | When to use | MuleSoft role |
|-------|-------------|------------|---------------|
| **Messaging** | Async communication via message broker | Default for decoupled, resilient flows; when sender and receiver run at different speeds or reliabilities | Mule as producer, consumer, or router |
| **Remote Procedure Invocation (RPC)** | Synchronous API call — caller waits for response | Real-time queries; user-facing APIs; < 10s acceptable latency | Mule as API gateway or orchestrator |
| **File Transfer** | Batch files exchanged on schedule | Large data volumes; partner integrations; legacy systems without APIs | Mule as file processor (SFTP/S3/FTP) |
| **Shared Database** | Multiple applications read/write the same DB | **Avoid in new designs.** Only when integrating legacy monoliths with no API surface. | Mule as DB poller or writer — tightly coupled |

**Selection rules:**
- Caller waits for result → **RPC**
- Decoupled, async, or multi-consumer → **Messaging**
- Partner drops a file or batch is large → **File Transfer**
- Legacy system has no API, only a DB → **Shared Database** (last resort; document why)
- Multiple styles needed → **Messaging + RPC** is the most common combination (use Hybrid pattern O)

**Write the selected style into decisions.json `integration.integrationStyle`.**

---

### Level 1 — Primary Integration Pattern (pick one)

> REQUIRED: Read `docs/PATTERNS_RESEARCH.md` before walking this section.

Each pattern has a dedicated scenario file in `standards/scenarios/` with reference architecture,
decisions.json defaults, XML templates, error handling, and MUnit checklist.

```
A. request-reply          → caller waits, HTTP sync response (< 10s)
                            Style: RPC
                            See: standards/scenarios/real-time.md

B. event-driven           → react to MQ/Kafka/Platform Event message (1-to-1 consumer)
                            Style: Messaging
                            See: standards/scenarios/event-driven.md

C. batch                  → bulk record processing via Mule batch scope + scheduler
                            Style: Messaging or File Transfer
                            See: standards/scenarios/batch.md

D. scheduled-sync         → periodic incremental delta sync (< 10K records per run)
                            Style: RPC + watermark
                            See: standards/scenarios/scheduled-sync.md

E. file-based-etl         → SFTP/S3/FTP file drop → parse → transform → load
                            Style: File Transfer
                            See: standards/scenarios/file-based-etl.md

F. cdc-streaming          → DB/platform change capture → near-real-time propagation
                            Salesforce Platform Events, Debezium/Kafka, DB polling
                            Style: Messaging
                            See: standards/scenarios/cdc-streaming.md

G. b2b-edi                → AS2/EDIFACT/X12/RosettaNet trading partner integration
                            Requires: EDI connector, ACK/NACK, partner registry
                            Style: File Transfer + Messaging
                            See: standards/scenarios/b2b-edi.md

H. process-orchestration  → multi-step workflow with saga compensation
                            Returns 202; state in Object Store; status polling
                            Style: RPC + Messaging
                            See: standards/scenarios/process-orchestration.md

I. api-aggregation        → scatter-gather fan-out + response composition
                            Parallel calls to N systems → merge into one response
                            Style: RPC
                            See: standards/scenarios/api-aggregation.md

J. webhook-ingestion      → receive inbound HTTP POST from external SaaS
                            Stripe, GitHub, DocuSign, HubSpot, Shopify, custom
                            Style: Messaging (push-from-source)
                            See: standards/scenarios/webhook-ingestion.md

K. data-migration         → one-time or phased bulk historical load
                            Resumable via checkpoint; idempotent upserts; audit log
                            Style: File Transfer or RPC
                            See: standards/scenarios/data-migration.md

L. streaming-pipeline     → continuous high-throughput stream to analytics/data lake
                            Kafka/Kinesis consumer → enrich → S3/BigQuery/Redshift
                            Style: Messaging (high-volume)
                            See: standards/scenarios/streaming-pipeline.md

M. pubsub-fanout          → broadcast one event to N independent consumers
                            Anypoint MQ Exchange or Kafka consumer groups
                            Style: Messaging (1-to-N)
                            See: standards/scenarios/pubsub-fanout.md

N. outbound-notification  → event → alert dispatch (email/Slack/Teams/SMS)
                            Fire-and-forget; never breaks primary flow
                            Style: Messaging
                            See: standards/scenarios/outbound-notification.md

O. hybrid                 → explicit combination of 2+ patterns above
                            Must list secondaryPatterns in decisions.json
                            See: standards/scenarios/hybrid.md

P. ai-augmented-flow      → LLM/AI called mid-flow for extraction, classification,
                            semantic routing, or enrichment of integration data
                            Always secondary to another primary pattern
                            Style: RPC (to LLM API)
                            See: standards/scenarios/ai-augmented-flow.md

Q. rag-data-pipeline      → chunk + embed + upsert enterprise docs to vector store
                            Grounds AI assistants in current enterprise knowledge
                            Style: Messaging or File Transfer
                            See: standards/scenarios/rag-data-pipeline.md

R. agentic-mcp-integration → MuleSoft APIs exposed as tools for AI agents (MCP or OpenAPI)
                            Agent is the caller; MuleSoft is the governed integration layer
                            Style: RPC (MuleSoft as server)
                            See: standards/scenarios/agentic-mcp-integration.md

S. transactional-outbox   → guarantee DB write + event publish happen atomically
                            MuleSoft polls outbox table; publishes to MQ; marks as published
                            Solves dual-write problem when source app is NOT MuleSoft
                            Style: Messaging
                            See: standards/scenarios/transactional-outbox.md

T. reverse-etl            → data warehouse enriched data → operational CRM/ERP
                            ML scores, segments, KPIs computed in warehouse pushed to Salesforce/NetSuite
                            Directional inverse of ETL (patterns E, C, K)
                            Style: Messaging or RPC
                            See: standards/scenarios/reverse-etl.md

U. ai-gateway             → centralized LLM proxy: rate-limit, PII-redact, model-route, cost-track
                            All AI traffic from all teams routes through a single governed endpoint
                            Style: RPC (MuleSoft as proxy)
                            See: standards/scenarios/ai-gateway.md
```

**Decision guide — key differentiators:**
```
Caller waits for response?              → A (request-reply) or I (api-aggregation)
One event, one consumer?                → B (event-driven)
One event, many consumers?              → M (pubsub-fanout)
File arrives on SFTP/S3?                → E (file-based-etl)
DB row changes need propagating?        → F (cdc-streaming)
External SaaS POSTs events to you?      → J (webhook-ingestion)
3+ systems, rollback needed?            → H (process-orchestration)
EDI/AS2 trading partner?                → G (b2b-edi)
Move all historical data once?          → K (data-migration)
Millions of events/day to data lake?    → L (streaming-pipeline)
Periodic < 10K records delta?           → D (scheduled-sync)
Bulk records, batch scope needed?       → C (batch)
Just send an alert or email?            → N (outbound-notification)
LLM/AI call inside a flow?              → P (ai-augmented-flow, as secondary pattern)
Building knowledge base for AI?         → Q (rag-data-pipeline)
AI agent calling your APIs as tools?    → R (agentic-mcp-integration)
App writes to DB + must publish event?  → S (transactional-outbox)
Warehouse scores/segments → CRM/ERP?   → T (reverse-etl)
Multiple teams calling LLMs ungoverned? → U (ai-gateway)
None fits cleanly?                      → O (hybrid — must list secondaryPatterns)
```

---

### Level 2 — NFR Profile (answer all)
```
volume:       low (<100/day) | medium (<10K/day) | high (<1M/day) | bulk (millions+)
latency:      under-1s | under-3s | under-10s | async-ok
frequency:    real-time | scheduled | triggered | one-time
availability: best-effort | 99.9 | 99.99
throughput:   low | medium | high | very-high
```

---

### Level 3 — Systems Involved
```
Check connector-registry.json first.
If not found follow UNKNOWN SYSTEM HANDLING section.
```

---

### Level 4 — Operational Needs (multi-select)
```
□ anypoint-monitoring-basic
□ anypoint-monitoring-custom-dashboard
□ business-events (audit/KPI)
□ external-observability (splunk/datadog/azure-monitor)
□ email-notifications
□ sms-notifications
□ slack-notifications
□ teams-notifications
□ scheduling (cron/fixed-frequency)
□ watermarking (incremental sync)
□ dlq-and-retry
□ field-level-encryption
□ data-masking-in-logs
□ flow-control (rate-limiting, backpressure)
□ invalid-message-channel (separate from DLQ — for validation failures)
□ wire-tap (non-intrusive async copy of every message to audit queue — set retentionHours)
```

---

### Level 5 — Security Level
```
internal     → client-id-enforcement + rate-limiting
partner      → oauth2-client-credentials + rate-limiting
regulated    → oauth2 + jwt-validation + secrets-manager
government   → mtls + oauth2 + jwt + secrets-manager + field-encryption
```

---

### Level 6 — Client-Facing Needs (multi-select)
```
□ operations-dashboard
□ business-reporting
□ audit-trail
□ self-service-portal
□ ux-frontend
□ none (backend only)
```

---

## FLOW CONTROL STANDARDS

> From: Gregor Hohpe "Queues Are Databases" (2022) and flow control research.
> Production queues without TTL and depth monitoring cause "all lights green, system is down."

### The Three Flow Control Mechanisms

| Mechanism | Description | MuleSoft Implementation | When to apply |
|-----------|-------------|------------------------|---------------|
| **Message TTL (Expiration)** | Messages expire if not consumed within window | Anypoint MQ: `timeToLive` on publish; Kafka: `retention.ms` on topic | All async flows — default 24h for events, 7 days for critical |
| **Tail Drop (Queue Depth Limit)** | Drop new messages when queue is full | Anypoint MQ queue max size; alert at 80% depth; reject at 100% | High-volume queues; prevent memory exhaustion |
| **Backpressure** | Slow producer when consumer is overloaded | `maxConcurrency` on anypoint-mq:subscriber; HTTP rate-limiting policies on Flex Gateway | All MQ consumers; any flow called at high rate |

### Default TTL Policy

```
Critical business events (orders, payments, provisioning):  7 days
Standard integration events:                                24 hours
Notification events (alerts, emails):                       1 hour
Monitoring/audit events:                                    72 hours
CDC events (near-real-time):                                4 hours
```

Write TTL into decisions.json `flowControl.messageTtl`.

### Queue Depth Monitoring

| Queue depth | Action |
|-------------|--------|
| > 80% of configured max | Alert Ops — consumer may be slow or stopped |
| > 90% | Page on-call — consumer is falling behind |
| 100% (full) | Tail drop activates — NEW MESSAGES DROPPED — critical page |
| DLQ > 0 | Page on-call immediately — messages failed after max retries |

Configure Anypoint Monitoring alerts for all queues. DLQ depth > 0 is always a HIGH alert.

### Backpressure Configuration

```xml
<!-- maxConcurrency controls how many messages are processed in parallel -->
<!-- Set based on downstream system capacity, not Mule CPU -->
<anypoint-mq:subscriber
  config-ref="Anypoint_MQ_Config"
  destination="${mq.queue.name}"
  acknowledgementMode="MANUAL"
  maxConcurrency="4"/>   <!-- 4 is a safe default; tune per downstream system -->
```

### Push vs. Pull Selection

| Scenario | Control flow direction | Implementation |
|----------|----------------------|----------------|
| MuleSoft consumes from Anypoint MQ | **Push** (broker delivers) | anypoint-mq:subscriber |
| MuleSoft polls a REST API for new records | **Pull** (Mule pulls) | scheduler + HTTP GET + watermark |
| External SaaS pushes events to Mule | **Push** (SaaS delivers) | http:listener (webhook) |
| Mule polls a DB for changes | **Pull** (Mule pulls) | scheduler + db:select + watermark |
| Kafka consumer | **Pull** (consumer polls) | kafka:message-listener (internally polls) |

Write the control flow direction into decisions.json as `flowControl.direction: push|pull|hybrid`.

---

## COMPENSATION DECISION FRAMEWORK

> From: Gregor Hohpe "Starbucks Does Not Use Two-Phase Commit" (2004).
> Three distinct strategies — choose based on the business consequence of failure.

### The Three Strategies

| Strategy | When to use | MuleSoft implementation |
|----------|-------------|------------------------|
| **Write-off** | Failure is acceptable; cost of compensation exceeds cost of loss | Log at WARN; continue; do not retry; do not compensate. Examples: failed notification, failed audit log write, failed metric increment |
| **Retry** | Operation is idempotent; failure is transient | retry-then-dlq strategy; exponential backoff. Examples: API timeout, transient DB unavailability, MQ delivery failure |
| **Compensating Transaction** | Operation succeeded but must be undone due to downstream failure | Process orchestration with saga; explicit rollback flows. Examples: payment charged but order failed, user provisioned but license not assigned |

### Decision Rules

```
Did the operation mutate financial, provisioning, or compliance data?
  YES → compensating-transaction (saga rollback)
  NO  → continue to next question

Is the operation idempotent AND the failure transient?
  YES → retry
  NO  → continue to next question

Is the cost of recovery less than the cost of the loss?
  YES → retry or compensating-transaction
  NO  → write-off

Examples of write-off (do NOT use compensating-transaction for these):
  - Failed Slack notification (log WARN, continue)
  - Failed audit log write (log ERROR, continue — audit gap is acceptable)
  - Failed metric increment in monitoring system
  - Non-critical enrichment step failed (use cached/default value)

Examples requiring compensating-transaction:
  - Payment processed → order creation failed → issue refund
  - Salesforce opportunity created → NetSuite SO creation failed → delete Salesforce opportunity
  - User account created in IdP → license assignment failed → disable account + notify admin
```

Write compensation strategy into decisions.json `errorHandling.compensationStrategy`.

---

## CROSS-CUTTING PATTERNS

These patterns apply regardless of primary integration pattern. The Architect Agent must
evaluate each one for every project.

### Idempotent Receiver (MANDATORY for all async flows)

Every MQ consumer MUST implement idempotency. Duplicates will occur — guaranteed.

```
Key: {consumer-prefix}-{messageId}
Store: Object Store (persistent)
TTL: must EQUAL or EXCEED the queue's messageTtl (not a fixed 24h default)
     critical events (messageTtl=168h)  → deduplicationTtlMinutes=10080 (7 days)
     standard events (messageTtl=24h)   → deduplicationTtlMinutes=1440  (24 hours)
     notification events (messageTtl=1h)→ deduplicationTtlMinutes=60    (1 hour)
     CDC events (messageTtl=4h)         → deduplicationTtlMinutes=240   (4 hours)
Action on duplicate: ACK and skip (do NOT re-process)
```

**Architect MUST write decisions.json flowControl.deduplicationTtlMinutes = messageTtlHours × 60.**
Never leave at the schema default of 60 minutes — that is shorter than every standard message TTL.

Failure to implement idempotency in async flows is a P0 bug.

### Claim Check (MANDATORY when payload > 1MB)

Do not put large payloads in MQ messages. Put a reference instead.

```
Threshold: > 1MB
Implementation:
  1. Write payload to S3/Azure Blob with key = correlationId
  2. Publish message with key only (claim check token)
  3. Consumer reads key, retrieves full payload from store
  4. Consumer deletes from store after processing (or TTL expires)
```

### Normalizer (when receiving N payload formats for same entity)

```
Condition: Multiple source systems send the same entity type in different formats
Implementation:
  - One normalizer flow per entity type
  - Converts ALL formats to canonical schema
  - All downstream flows consume canonical only
  - Never let multiple formats propagate past the entry point
```

### Wire Tap (non-intrusive monitoring)

Use for audit trails, debugging, and message capture without modifying the primary flow.

```xml
<!-- Async publish — does not affect primary flow latency or reliability -->
<async doc:name="Wire Tap">
  <anypoint-mq:publish
    config-ref="Anypoint_MQ_Config"
    destination="${mq.queue.audit}"
    messageId="#[correlationId]">
    <anypoint-mq:body>
      #[output application/json --- { flow: flow.name, payload: payload, ts: now() as String }]
    </anypoint-mq:body>
  </anypoint-mq:publish>
</async>
```

### Correlation ID Rules

```
Generation: API gateway (Experience API) generates UUID on inbound request
Propagation: Set as Mule correlationId (not a variable) — propagates automatically
HTTP header: X-Correlation-ID (inbound and outbound)
MQ messages: Set as messageId on publish; read from attributes.messageId on consume
Log: Always include in every log line
Never: Generate a new correlationId mid-flow
Never: Lose correlationId when crossing async boundaries (publish it explicitly)
```

### Invalid Message Channel vs Dead Letter Queue

**These are NOT the same thing.** Conflating them is a common mistake.

| Channel | Purpose | Retry? | Example |
|---------|---------|--------|---------|
| **Invalid Message Channel** | Validation failures — message is structurally or semantically wrong | NO — it will always fail again | Missing required field, wrong JSON schema, unknown order type |
| **Dead Letter Queue (DLQ)** | Delivery failures — message is valid but downstream unavailable | YES — retry when system recovers | Target API timeout, DB connection refused, MQ ACK timeout |

**Implementation:** Route to Invalid Message Channel BEFORE attempting any downstream call.
Never put a validation failure in the DLQ — it will fail on every retry and consume retry budget.

```xml
<!-- Validate early; route invalid messages BEFORE any downstream call -->
<validation:is-not-null value="#[payload.orderId]" message="orderId is required"/>
<!-- On ValidationException → on-error-continue → publish to invalid-messages-queue -->
```

### Semantic Dissonance Documentation

When integrating two systems that use the same field name for different concepts, document it
explicitly. Examples: ZIP code (US 5-digit vs. international postal), fiscal periods (different
year-end dates), region codes (sales region vs. geographic region).

Required in architecture.md when present:
```markdown
## Semantic Dissonance
| Field | System A meaning | System B meaning | Resolution |
|-------|-----------------|-----------------|------------|
| region | Sales territory | Geographic ISO region | Map via lookup table in DWL |
```

This is "notoriously difficult to resolve" — document before coding, not after.

---

## EDA FIT ASSESSMENT

Event-Driven Architecture's unique advantage over point-to-point async is **topology decoupling**:
add a new consumer without changing the publisher. This advantage only matters if you don't
control the event source, or if consumers evolve independently.

**Run this checklist before recommending EDA (Messaging style + B/M/F patterns):**

```
□ Do publisher and consumer teams evolve independently?
    YES → EDA warranted (topology decoupling has real value)
    NO  → Point-to-point async may be simpler

□ Will new consumers be added over time without publisher changes?
    YES → EDA warranted (fan-out value)
    NO  → Consider direct async call or scheduled-sync

□ Does the consumer need to replay events (rewind to past state)?
    YES → Kafka required (not Anypoint MQ — no replay)
    NO  → Anypoint MQ is sufficient

□ Is throughput > 100K messages/day or consumers > 10?
    YES → Kafka required
    NO  → Anypoint MQ is sufficient

□ Is the publisher internal and under your control?
    YES → Async RPC (HTTP + async response) may be simpler than full EDA
    NO  → EDA is correct (you don't control the source)

□ Does each consumer need guaranteed independent delivery?
    YES → Anypoint MQ Exchange (one queue per consumer) or Kafka consumer groups
    NO  → Single queue with competing consumers (B: event-driven)
```

**Anti-pattern:** Using EDA for point-to-point flows where you control both ends adds complexity
with no topology decoupling benefit. Use B (event-driven) 1-to-1, not M (pubsub-fanout).

---

## ANTI-PATTERNS

Patterns that are prohibited or require explicit justification.

| Anti-pattern | Problem | Correct alternative |
|-------------|---------|-------------------|
| **Shared Database integration** | Schema coupling — any DB change breaks all consumers | Add an API layer; use System API pattern |
| **Synchronous fan-out** | One slow downstream stalls all others; cascading failures | Use scatter-gather (I) with timeout per leg, or async fan-out (M) |
| **Process Integration overuse** | Coordinating everything through a central hub creates single point of failure and tight coupling | Use EDA for autonomous consumers; reserve orchestration (H) for workflows that genuinely require saga compensation |
| **Polling without watermark** | Full table scan on every poll; misses records updated during poll window | Always use watermark (last-modified timestamp or sequence ID) on scheduled-sync (D) |
| **Large payloads in MQ** | Broker memory pressure; serialization cost; potential size limit violations | Use Claim Check pattern — store in S3/Blob, pass reference |
| **DLQ as Invalid Message Channel** | Validation failures retry forever, consuming retry budget | Validate first; route structural failures to separate Invalid Message Channel |
| **Fire-and-forget on critical mutations** | No delivery guarantee for financial or compliance data | Use MANUAL ack on MQ consumers; confirm delivery before ACK |
| **Correlating by payload field** | Correlation breaks when field is null, renamed, or absent | Always generate and propagate correlationId from the gateway |
| **Inline complex DataWeave** | Untestable, uncacheable, hard to maintain | External .dwl files only for any transform > 10 lines |
| **Java class in DataWeave** | Tight coupling to Java runtime; breaks on Mule version updates | Use DataWeave 2.0 native functions; if Java interop truly needed, isolate in a Java module |

---

## CONNECTOR REGISTRY

**File: `standards/connector-registry.json`**
This is a separate file — do not inline connector data here. The registry is the single source
of truth for all connector metadata: groupId, artifactId, auth, config templates, docs URLs,
Exchange URLs, required properties, and staleness dates.

### Version Policy
MuleSoft does NOT publish exact patch versions on public docs pages. The `docVersion` field in
the registry is the major.minor version from the docs page title (e.g. "Salesforce Connector 11.4").
Developers MUST visit the `exchangeUrl` to get the exact patch version before adding to pom.xml.
Scaffold generator adds a TODO comment for this on every dependency.

### Staleness Policy — MANDATORY
Every connector entry has `lastVerified` (YYYY-MM-DD) and `lastAddedDate` (YYYY-MM-DD).

| Status | Age | Action |
|--------|-----|--------|
| Green | ≤ 30 days | Use as-is |
| Yellow | 31–60 days | Verify on Exchange before using in new project |
| Red | > 60 days | **MUST** call MuleSoft MCP `search_asset` and update registry before use |

**Monthly review:** Run `node scaffold/check-registry-freshness.js` on the 1st of each month.
All entries older than 30 days get MCP-verified and updated.

**Per-project rule:** If any connector selected in `decisions.json` has `lastVerified` older than
30 days, the BMAD Architect agent MUST call MuleSoft MCP `search_asset` to verify before
finalising the decision. Update `lastVerified` after the check.

### Adding a New Connector
1. Add full entry to `standards/connector-registry.json` in the correct category
2. Set `lastAddedDate` and `lastVerified` to today (YYYY-MM-DD)
3. Set `lastVerifiedBy` to `mcp-check`
4. Create XML config template at `templates/connectors/{key}-config.xml`
5. `git commit -m 'registry: Add {displayName} connector [{category}]'`
6. **Never search for the same connector twice** — registry is the permanent cache

### Connector Lookup Process (BMAD Architect Agent)
```
1. Identify system from prd.md
2. Search standards/connector-registry.json by key or displayName
3. FOUND → check lastVerified. If > 30 days: call MCP search_asset to verify, update entry, then use.
4. NOT FOUND → call MuleSoft MCP search_asset with system name
5.   Found on Exchange → add full entry to registry, commit, then use
6.   Not on Exchange → classify: REST (use "http" key) or SOAP (use "soap" key), add custom-{name} entry
7.   Truly unknown → flag as OPEN ITEM in prd.md (BLOCKER — do not proceed)
```

### Registry Categories (in connector-registry.json)
- `salesforce_ecosystem` — Salesforce, Data Cloud, Marketing Cloud, Commerce Cloud, Agentforce, Einstein AI, Composite
- `erp_finance` — NetSuite, NetSuite RESTlet, NetSuite OpenAir, SAP JCo (**LICENSE REQUIRED**), SAP S/4HANA Cloud, SAP Concur, Workday, Oracle EBS 12.1/12.2, PeopleSoft, Siebel, QuickBooks Online
- `crm_marketing` — Dynamics 365 (CE/Sales), Business Central, Finance & Ops, AX 2012, CRM on-prem, GP, NAV, Marketo, Mailchimp, Intercom
- `itsm_service` — ServiceNow, Jira, Asana, DocuSign
- `messaging_eventing` — Anypoint MQ, Kafka, Confluent Schema Registry, AMQP/RabbitMQ, JMS, IBM MQ, IBM CTG, Azure Service Bus, Azure Service Bus Management, Azure Event Hubs, Amazon SQS, Amazon SNS, Amazon Kinesis, Google Pub/Sub, MQTT, MCP
- `database` — Database (MySQL/PG/Oracle/MSSQL/MariaDB + driver configs), MongoDB, Neo4J, DynamoDB, Amazon RDS, Redshift, Redis, Cassandra, Azure Cosmos DB, Google BigQuery, Hadoop HDFS
- `file_storage` — File, FTP, FTPS, SFTP, Amazon S3, Azure Blob, Azure Data Lake, Box, Dropbox, Google Drive
- `communication` — Email (SMTP/IMAP/POP3), Gmail, Microsoft Teams, Microsoft Outlook 365
- `aws_cloud` — Amazon Bedrock, Lambda, EC2, Secrets Manager Properties Provider
- `azure_cloud` — Azure Key Vault, Azure Key Vault Properties Provider
- `google_cloud` — Google Calendar, Google Sheets, Google Gemini
- `microsoft_productivity` — SharePoint, OneDrive, Excel Online, Power BI, .NET, MSMQ, PowerShell
- `edi_b2b` — EDIFACT, AS2, A2A, RosettaNet, DHL Tracking
- `ai_ml` — MuleSoft AI Chain, MuleSoft Inference, MuleSoft Vectors
- `healthcare` — HL7 EDI, HL7 MLLP, CAQH
- `protocols_core` — HTTP, SOAP/WSC, WebSocket, gRPC, LDAP, Object Store, CloudHub Connector, Aggregators, Cryptography, Compression, Java Module, JSON Module, Kerberos, OAuth Module

### Critical Notes (always apply)
- **NetSuite REST:** Connector 11.0+ does NOT support REST. For REST use HTTP connector + PS256 JWT via Nimbus JOSE helper JAR (MuleSoft JWT Module does not support PS256).
- **SAP JCo:** REQUIRES SEPARATE MULESOFT LICENSE. Also requires SAP JCo native JARs — cannot go in pom.xml.
- **ServiceNow:** Metadata does NOT work with OAuth 2.0 Authorization Code. Use basic auth for metadata resolution in Studio.
- **File connector on CloudHub 2.0:** Local filesystem is ephemeral. Use S3, SFTP, or Azure Blob for persistence.
- **Oracle JDBC driver:** ojdbc11.jar cannot be in pom.xml (Oracle license). Must be placed in shared lib folder on CloudHub 2.0.

### VERIFIED VERSIONS (May 2026 — see registry for full detail)

**CRM**
- salesforce: mule-salesforce-connector 11.4.0 | oauth-jwt | com.mulesoft.connectors
- dynamics365: mule-microsoft-dynamics-365-connector 3.1.0 | oauth2-client-credentials
- hubspot: mule-hubspot-connector 1.0.0 | oauth2-client-credentials

**ERP / Finance**
- netsuite: mule-netsuite-connector 11.11.0 | oauth2-client-credentials | com.mulesoft.connectors
  NOTE: REST API needs PS256 JWT via Java helper (Nimbus JOSE library)
- sap: mule-sap-connector 5.9.0 | sap-logon | com.mulesoft.connectors | LICENSE REQUIRED
  NOTE: Requires SAP JCo libraries. Contact MuleSoft for license.
- workday: mule-workday-connector 16.4.0 | basic | com.mulesoft.connectors
- quickbooks: mule-quickbooks-online-connector 3.0.0 | oauth2
- sage: mule-sage-connector 1.0.0 | oauth2

**ITSM / Service Management**
- servicenow: mule-servicenow-connector 6.18.0 | basic | com.mulesoft.connectors
  NOTE: Metadata does not work with OAuth 2.0 Authorization Code
- jira: mule-jira-connector 1.4.0 | basic + api-token
- zendesk: mule-zendesk-connector 1.2.0 | basic + api-token + oauth2

**Marketing**
- marketo: mule-marketo-connector 2.0.0 | oauth2-client-credentials
- salesforce-marketing-cloud: mule-sfdc-marketing-cloud-connector 1.2.0 | oauth2-client-credentials

**Messaging / Event Streaming**
- anypoint-mq: anypoint-mq-connector 4.0.7 | client-credentials | com.mulesoft.connectors
  SUPPORTS: queues, FIFO queues, message exchanges, circuit breaker, prefetch + polling
- kafka: mule-kafka-connector 4.8.0 | sasl-or-none | com.mulesoft.connectors
- activemq/jms: mule-jms-connector 1.9.0 | basic | org.mule.connectors
- rabbitmq/amqp: mule-amqp-connector 1.8.0 | basic | com.mulesoft.connectors
- ibm-mq: mule-ibm-mq-connector 2.4.0 | basic | NOTE: IBM MQ client libs required
- azure-service-bus: mule-azure-service-bus-connector 2.3.0 | connection-string
- amazon-sqs: mule-amazon-sqs-connector 5.11.0 | aws-credentials

**Databases — Relational**
All use: mule-db-connector 1.14.0 | org.mule.connectors
- database (generic), mysql, postgresql, mssql, oracle-db
  NOTE: Oracle requires JDBC driver JAR in lib/

**Databases — NoSQL**
- mongodb: mule-mongodb-connector 6.3.5 | username-password | com.mulesoft.connectors
- dynamodb: mule-amazon-dynamodb-connector 2.3.0 | aws-credentials
- redis: mule-redis-connector 3.3.2 | password | com.mulesoft.connectors
- elasticsearch: mule-elasticsearch-connector 1.4.0 | basic

**File / Storage**
- amazon-s3: mule-amazon-s3-connector 5.10.0 | aws-credentials
- azure-blob: mule-azure-blob-storage-connector 1.3.0 | connection-string
- sftp: mule-sftp-connector 2.3.0 | username-password + private-key | org.mule.connectors
- ftp: mule-ftp-connector 1.8.0 | username-password | org.mule.connectors
- file: mule-file-connector 1.5.0 | none | org.mule.connectors
- sharepoint: mule-sharepoint-connector 3.1.0 | oauth2
- box: mule-box-connector 4.2.0 | oauth2

**Communication / Notifications**
- email: mule-email-connector 1.7.0 | smtp-credentials | org.mule.connectors
- slack: mule-slack-connector 1.1.0 | oauth2 | NOTE: simple notifs use HTTP webhook
- teams: mule-microsoft-teams-connector 1.0.0 | webhook-url
- twilio: mule-twilio-connector 4.0.0 | basic (accountSid + authToken)

**Payments**
- stripe: mule-stripe-connector 1.2.0 | api-key

**HTTP / Generic (always in registry — fallback)**
- http: mule-http-connector 1.9.0 | varies | org.mule.connectors
  USE FOR: any REST API not in registry
- soap: mule-wsc-connector 1.8.0 | varies | org.mule.connectors
  USE FOR: any SOAP/WSDL service. Store WSDL in resources/api/

**AI Connectors (New Winter 2026)**
- openai: mule-openai-connector 1.0.0 | api-key | VERIFY on Exchange
- anthropic: mule-anthropic-connector 1.0.0 | api-key | VERIFY on Exchange

---

## UNKNOWN SYSTEM HANDLING

### The rule: Registry first. MCP second. Never look up same connector twice.

```
Step 1 — Check connector-registry.json
  Found → Check lastVerified. If > 30 days: call MCP search_asset to verify. Then use.

Step 2 — Not found → Call MuleSoft MCP tool: search_asset
  query: "{system name} connector"

  Found on Exchange:
    → Add full entry to connector-registry.json permanently
    → Create XML config template in templates/connectors/
    → Set lastVerified to current month
    → Commit: "Add {connector} to registry from Exchange"
    → Use for this project

  Not on Exchange — classify:

    Has REST API + complete OpenAPI/Swagger spec:
      → Add to registry as key "custom-{system-name}"
      → Use http connector (mule-http-connector)
      → configTemplate: templates/connectors/http-generic-config.xml
      → Note: "Custom REST - spec at {url}"
      → STILL run API Contract Discovery — specs are often incomplete on write endpoints

    Has REST API but NO spec or incomplete spec:
      → Trigger API Contract Discovery Protocol (see below)
      → Do NOT flag as blocker yet — investigate first

    Has SOAP/WSDL:
      → Add to registry as key "custom-{system-name}"
      → Use soap connector (mule-wsc-connector)
      → configTemplate: templates/connectors/soap-generic-config.xml
      → Store WSDL in resources/api/{system}.wsdl
      → Note: "Custom SOAP - WSDL at {url}"

    Truly unknown (no docs, no spec, no public API surface):
      → Flag in prd.md as OPEN ITEM — BLOCKER
      → "System {X}: API type and auth unknown.
         Need: API docs URL, auth type, sample payload.
         Cannot proceed to architecture until resolved."
```

---

## API CONTRACT DISCOVERY PROTOCOL

**Trigger:** Any system where connector-registry has `"via-http"` AND intake docs contain no
OpenAPI/Swagger/Postman collection for write operations, OR where a spec exists but POST/PUT
body schemas are missing or described as "see examples."

**Philosophy:** Arrive with evidence, not questions. Test everything testable first.
Only ask the client about what cannot be determined by testing.

### Step 1 — GET First

Probe all discoverable GET endpoints. Capture full response bodies.
```
GET /api/v1/{entity}          — collection shape
GET /api/v1/{entity}/{id}     — single record shape
GET /api/v1/{entity}/schema   — if schema endpoint exists (some ERPs)
GET /api/v1/metadata          — if metadata endpoint exists
```

From each GET response, extract and document the full field inventory.

### Step 2 — Classify Fields

For every field in the GET response, classify:
```
SERVER_GENERATED   — IDs, created/modified timestamps, computed status fields, audit fields
                     POST will ignore or reject these; never include in write payload
REQUIRED_ON_CREATE — non-nullable, no obvious default, business-key fields
                     These MUST be in POST body
OPTIONAL_ON_CREATE — nullable, has default, or conditional on other fields
                     Include if known; omit to discover defaults
ENUM_UNKNOWN       — field present, value is a string, but valid values are undocumented
                     Try known values; capture what the API rejects
```

### Step 3 — Minimal POST Then Expand

Start with the smallest possible POST — only REQUIRED_ON_CREATE fields.
Read every error response literally. A `400` or `422` with a validation message is information.
```
Attempt 1: Minimal body (required fields only)
  → Success: record what worked
  → 400/422: read validation errors, add missing fields, retry
  → 401/403: auth issue — document and flag for client
  → 404: wrong endpoint — try path variants

Attempt 2: Add OPTIONAL fields one group at a time
  → Isolates which optional fields cause unexpected rejections
  → Reveals undocumented field constraints (format, max length, enum values)

Attempt 3: Test enum values
  → For ENUM_UNKNOWN fields, try values seen in GET responses on other records
  → Try obvious values (ACTIVE, INACTIVE, PENDING, OPEN, CLOSED, etc.)
  → Each rejection response usually lists valid values
```

### Step 4 — Document Confirmed Contract

Produce `projects/{client}/api-discovery/{system}-contract.md`:
```markdown
## {System} Write Contract — Confirmed {date}

### Confirmed Working Endpoints
- POST /api/v1/orders — create order
  Working curl: [exact curl that succeeded]
  Confirmed required: orderId(server), customerId(required), lines[](required), ...
  Confirmed optional: notes, referenceNumber, ...
  Server-generated: id, createdAt, status, ...

### Enum Values Confirmed
- status: OPEN, CLOSED, PENDING (DRAFT rejected — not a valid value)
- fulfillmentType: SHIP, PICKUP (DELIVERY not tested)

### Open Gaps — Client Input Required
1. taxCode: field accepted but meaning unclear.
   Best guess: maps to tax schedule code in {system} config.
   Options: (a) leave null and let system default, (b) pass your standard code.
   Please confirm which applies to your setup.

2. warehouseId: required in our test instance but may vary.
   We used "WH001" — please confirm correct value for your environment.

### Not Tested (needs credentials or specific data)
- DELETE /api/v1/orders/{id} — confirm if soft delete or hard delete
```

### Step 5 — Targeted Client Questions Only

Client communication template:
```
Subject: {System} API — we've tested what we can, 3 specific questions

We tested the {System} API and have confirmed the write contract for {entity}.
We identified 3 points we can't determine from testing alone:

1. [Specific question with best-guess answer and options]
2. [Specific question with best-guess answer and options]
3. [Specific question with best-guess answer and options]

For each, please confirm our best guess or choose the correct option.
If none fit, give us the correct value and we'll update accordingly.
```

**Never ask:** "Can you share the API documentation?" or "What is the data structure?"
**Always ask:** Specific, testable questions with a best guess already provided.

---

## SCAFFOLD PROFILE SELECTION

The scaffold generator selects one of four profiles automatically from `decisions.json`.
The profile determines which templates and cross-cutting components are generated.

| Profile | Trigger conditions from decisions.json | What it generates |
|---------|----------------------------------------|-------------------|
| **minimal** | security=internal, availability=best-effort, pattern=outbound-notification only | HTTP listener, basic error handler, 1 flow file, MUnit stubs |
| **standard** | security=internal or partner, availability=99.9, any async pattern | Global error handler, DLQ, env properties, logging config, MUnit stubs, idempotency check if async |
| **enterprise** | availability=99.99, OR customDashboard=true, OR compensationStrategy=compensating-transaction | All of standard + retry framework, Anypoint Monitoring alerts, custom dashboard config, backpressure config, claim-check if payload>1MB indicated |
| **regulated** | security=regulated or government | All of enterprise + field encryption, Secrets Manager config, mTLS config, audit trail flow, compliance logging, invalid-message-channel always generated |

Profile is written to `decisions.json` as `scaffold.profile` by the Architect agent.
If not set, scaffold generator computes it from the rules above before generating.

**Profile does NOT override decisions.json flags.** If `generateWatermark=false` but the
pattern is `scheduled-sync`, the generator warns and generates the watermark anyway —
the pattern requirement takes precedence over the profile flag.

### Version Staleness Warning
Scaffold generator checks lastVerified on every connector.
If > 6 months old, prints warning:
```
⚠ WARNING: {connector} v{version} last verified {date}
  May be outdated. Check: {exchangeUrl}
  Update: Edit standards/connector-registry.json
```

---

## DECISIONS.JSON SCHEMA

```json
{
  "project": {
    "name": "",
    "client": "",
    "description": "",
    "generatedAt": "",
    "bmadVersion": "6.6.0"
  },
  "integration": {
    "integrationStyle": "messaging|rpc|file-transfer|shared-db|hybrid",
    "primaryPattern": "request-reply|event-driven|batch|scheduled-sync|file-based-etl|cdc-streaming|b2b-edi|process-orchestration|api-aggregation|webhook-ingestion|data-migration|streaming-pipeline|pubsub-fanout|outbound-notification|hybrid|ai-augmented-flow|rag-data-pipeline|agentic-mcp-integration|transactional-outbox|reverse-etl|ai-gateway",
    "secondaryPatterns": [],
    "direction": "unidirectional|bidirectional",
    "flows": [
      {
        "name": "",
        "layer": "system|process|experience",
        "source": "",
        "target": "",
        "trigger": "http|scheduler|platform-event|mq-subscriber|cdc|sftp|db-poll",
        "description": ""
      }
    ]
  },
  "nfr": {
    "volume": "low|medium|high|bulk",
    "latency": "under-1s|under-3s|under-10s|async-ok",
    "frequency": "real-time|scheduled|triggered|one-time",
    "availability": "best-effort|99.9|99.99",
    "throughput": "low|medium|high|very-high"
  },
  "systems": {
    "connectors": [],
    "customSystems": {},
    "database": null,
    "nosql": null
  },
  "security": {
    "level": "internal|partner|regulated|government",
    "apiAuth": "client-id|oauth2-client-credentials|jwt|mtls",
    "gatewayPolicies": [],
    "secretsManager": true,        // mandatory for regulated|government; set false for internal|partner to skip auto-injection (template still generated as commented-out block)
    "fieldEncryption": false,
    "dataMasking": true,
    "mtls": false
  },
  "errorHandling": {
    "strategy": "retry-then-dlq|fail-fast|retry-only",
    "compensationStrategy": "write-off|retry|compensating-transaction",
    "maxRetries": 3,
    "backoff": "fixed|exponential",
    "dlq": true,
    "dlqName": "",
    "retryQueueName": "",
    "invalidMessageChannel": false,
    "invalidMessageChannelName": "",
    "errorEnvelope": true
  },
  "flowControl": {
    "direction": "push|pull|hybrid",
    "messageTtlHours": 24,
    "maxConcurrency": 4,
    "queueDepthAlertPct": 80,
    "backpressureEnabled": true,
    "deduplicationEnabled": true,
    "deduplicationTtlMinutes": 1440
  },
  "observability": {
    "anypointMonitoring": true,
    "customDashboard": false,
    "businessEvents": false,
    "externalPlatform": null,
    "logLevel": {
      "local": "DEBUG",
      "dev": "DEBUG",
      "uat": "INFO",
      "prod": "WARN"
    },
    "alerts": []
  },
  "notifications": {
    "email": false,
    "sms": false,
    "slack": false,
    "teams": false,
    "slackWebhook": null,
    "emailRecipients": []
  },
  "wireTap": {
    "enabled": false,
    "retentionHours": 72,
    "queueName": ""
  },
  "scheduling": {
    "required": false,
    "type": "cron|fixed-frequency",
    "expression": null,
    "watermarking": false,
    "objectStore": "in-memory|persistent"
  },
  "aiIntegration": {
    "enabled": false,
    "provider": "openai|anthropic|bedrock|gemini|azure-openai",
    "model": "",
    "useCase": "extraction|classification|semantic-routing|enrichment|embedding|generation",
    "timeoutSeconds": 30,
    "fallbackOnTimeout": true,
    "storeEmbeddingsIn": "pinecone|weaviate|pgvector|opensearch|none"
  },
  "clientFacing": {
    "operationsDashboard": false,
    "businessReporting": false,
    "auditTrail": false,
    "selfServicePortal": false,
    "uxFrontend": false
  },
  "devops": {
    "cicd": "github-actions|azure-devops|jenkins|none",
    "environments": ["dev", "prod"],
    "munitRequired": true,
    "munitCoverage": 80,
    "exchangePublish": false,
    "deployment": "cloudhub2|runtime-fabric|hybrid",
    "region": "us-east-1"
  },
  "scaffold": {
    "runtime": "4.8.0",
    "java": "17",
    "groupId": "com.yourcompany",
    "apiLedLayers": [],
    "generateMunit": true,
    "generateCicd": true,
    "generateNotifications": false,
    "generateScheduler": false,
    "generateWatermark": false,
    "generateFlowControl": false,
    "generateInvalidMessageChannel": false
  }
}
```

---

## STORY GENERATION

PM agent reads decisions.json flows array.
Per flow generates ~5 stories:
1. Create API spec (OAS/RAML) + publish to Exchange
2. Implement flow XML (correct layer, naming, error handler)
3. Complete DataWeave transformation (.dwl file)
4. Write MUnit tests (happy path + 2 error scenarios)
5. Configure monitoring alerts

Global stories (once per project, ~5 total):
- Configure global error handler + DLQ
- Set up Anypoint MQ queues (if async) including TTL and depth alerts
- Configure Secrets Manager
- Set up CI/CD pipeline
- Verify Anypoint Visualizer layer diagram

Every story:
- References exact scaffold file name
- Has MuleSoft-specific acceptance criteria
- Specifies which standard applies

---

## TECHNICAL STANDARDS

### Runtime
- Mule 4.8.0 / Java 17 ONLY
- Java 11 support ends Aug 2026 for 4.6 LTS
- CloudHub 2.0 default (not 1.0 — deprecated)

### API-Led Connectivity — MANDATORY
- 3 layers: system / process / experience
- System API: ONE backend system only
- Process API: orchestrates + business logic
- Experience API: formats for consumer
- Naming: {system}-sys-api | {domain}-proc-api | {consumer}-exp-api

### Naming
- Projects: {domain}-{layer}-api (kebab-case)
- Flows: {action}-{entity}-flow (kebab-case)
- Variables: camelCase
- DWL: {verb}-{source}-to-{target}.dwl
- Properties: dot.separated.lower
- MQ queues: {domain}-{action}-{env}-queue
- DLQ: {queue-name}-dlq (always append -dlq, never a separate naming convention)
- Invalid Message Channel: {domain}-invalid-messages-queue

### Error Handling — MANDATORY
- Global error handler in error-handler.xml
- Error envelope: {correlationId, errorCode, message, timestamp, failingComponent}
- Never expose Java stack traces
- Notification failures NEVER break the primary flow (wrap in on-error-continue)

### Retry Table
```
Sync API timeout    → 3 retries, 5s fixed, return 503 + Retry-After
Async MQ            → 3 retries, exponential 30/90/270s, then DLQ
Batch record        → 1 retry, continue batch, report at end
Auth token expiry   → 1 refresh attempt, halt + alert if fails
Notification (Slack/email/SMS) → 2-3 retries, fixed 2-5s, log WARN on fail, continue always
```

### Security Tiers
```
internal    → client-id + rate-limiting
partner     → oauth2-client-credentials + rate-limiting
regulated   → oauth2 + jwt (Flex Gateway) + Secrets Manager
government  → mtls + oauth2 + jwt + Secrets Manager + field-encryption
```

### Logging — MANDATORY
- Always: correlationId, flowName, timestamp, payloadSize, environment
- Never: credentials, PII, raw payloads, full stack traces in prod
- JSON format for non-local
- Wire logging: DEV/LOCAL only

### Monitoring Alerts (production mandatory)
- DLQ count > 0 → HIGH → page on-call
- Error rate > 5% / 5min → HIGH
- p95 latency > 3s → MEDIUM
- Memory > 80% → MEDIUM
- Auth refresh failure → HIGH
- MQ queue depth > 80% → MEDIUM
- MQ queue depth > 90% → HIGH

### DataWeave
- External .dwl files only — no inline for complex transforms (> 10 lines)
- Input content-type always declared
- indent=false for large payloads
- Comments for business rules only (not for what the code obviously does)

### MUnit Coverage by Pattern
```
request-reply, api-aggregation:    80% minimum
event-driven, pubsub-fanout:       75% minimum
batch, data-migration:             75% minimum
outbound-notification:             60% minimum
all others:                        80% minimum
```

Happy path + 2 error scenarios per flow minimum.
Mock all connector operations.
CI/CD gate — must pass before deploy.

---

## BMAD AGENT DECISION POLICY

### Decisions-First, Questions-Last
Every BMAD agent applies all standards defaults automatically. Agents do NOT ask clarifying
questions unless the answer is:
1. Missing from all intake documents AND
2. Has no applicable standard default AND
3. Getting it wrong would cause rework (not just a TODO)

**Maximum 3 questions per agent run.** Everything else defaults or becomes a developer TODO
comment in the generated code.

### BMAD Architect Agent — Walking the 6-Level Tree
The architect walks all 6 levels in order. At each level:
- Apply the decision from prd.md if stated explicitly
- Apply the standard default if not stated
- Only ask the client (via question) if no default exists and the decision is a blocker

**Standard defaults applied automatically:**
- Integration style: determined by primary pattern (see Level 0 table)
- Runtime: Mule 4.8.0 / Java 17
- Deployment: CloudHub 2.0, us-east-1
- Error handling: retry-then-dlq, 3 retries, exponential backoff
- Compensation: retry (unless financial/provisioning/compliance data → compensating-transaction)
- Flow control: messageTtl=24h, maxConcurrency=4, queueDepthAlert=80%
- Monitoring: Anypoint Monitoring basic always on
- Logging: JSON, correlationId, no PII, WARN in prod
- MUnit: required, coverage per pattern table above
- Security: defaults to `internal` unless stated otherwise
- Watermarking: persistent Object Store (not in-memory) for all scheduled flows
- Idempotency: required on all async MQ consumers (no exceptions)
- Claim Check: required for payloads > 1MB

### Unknown System Handling
```
1. Check standards/connector-registry.json first (key or displayName search)
2. Not found → call MuleSoft MCP search_asset with system name
3. Found on Exchange → add full entry to registry, commit, then use
4. Not on Exchange → classify as REST (use "http") or SOAP (use "soap")
                   → add custom-{system-name} entry to registry
5. Truly unknown → flag as OPEN ITEM in prd.md — BLOCKER, do not proceed
```
**Never look up the same connector twice.** Once it's in the registry it stays there permanently.

---

## FIELD KNOWLEDGE SYSTEM

**Problem:** Every MuleSoft project surfaces edge cases not covered by standards. Without a capture
mechanism, the same hard-won lesson gets rediscovered on the next project.

**Solution:** A living append-only log at `docs/FIELD_KNOWLEDGE.md`. The architect adds entries
after any project where something unexpected occurred — and agents read it before every session.

### When to add an entry

Add an entry to FIELD_KNOWLEDGE.md whenever:
- A system behaved differently than the standard scenario file predicted
- An API contract discovery revealed a non-obvious pattern (missing POST schema, undocumented enum, auth quirk)
- A scaffold profile didn't match what the client actually needed and had to be adjusted
- An MUnit coverage target was wrong for the actual flow complexity
- A client question was asked that should have been anticipated and pre-answered

Do NOT add entries for:
- Things already covered by a scenario file or standard
- One-off mistakes with no recurring pattern
- Client-specific data (anonymize or exclude)

### Entry format

```markdown
## FK-{NNN} — {Short title}
Date: YYYY-MM-DD
Project: {anonymized or "general"}
Trigger: {what condition activates this knowledge}
Scenario: {what happened}
What worked: {the correct approach}
What failed: {what was tried first that didn't work, if relevant}
Client question used: {exact phrasing if a targeted question was needed}
Status: observation | verified | promoted-to-standard
Promotes to: {which file to update when status = promote}
```

### Status lifecycle

```
observation  → seen once; worth capturing but not yet a pattern
verified     → seen 2+ times across different clients; reliable
promoted-to-standard → incorporated into scenario file or standard; entry kept for history
```

**When an entry reaches `verified` status,** the architect evaluates whether it belongs in:
- A scenario file (`standards/scenarios/*.md`) — if it changes the reference architecture
- `MULESOFT_DESIGN_STANDARDS.md` — if it changes a decision rule or default
- `PLANNING_CONTEXT.md` — if it changes agent behavior or the discovery protocol
- Stays in FIELD_KNOWLEDGE.md — if it's too client-specific to generalize

### How agents use it

Every BMAD agent reads `docs/FIELD_KNOWLEDGE.md` at session start (same as PLANNING_CONTEXT.md).
Agents apply `verified` and `promoted-to-standard` entries as active guidance.
Agents treat `observation` entries as awareness — flag if the situation matches, don't auto-apply.

The Architect agent checks FIELD_KNOWLEDGE.md entries tagged with relevant systems or patterns
before walking the decision tree. If a verified entry matches the current project's system or
integration type, it takes precedence over the generic scenario file default.

### Architect training workflow

```
After each project:
1. Open docs/FIELD_KNOWLEDGE.md
2. Add one entry per non-obvious finding (use FK-NNN numbering)
3. Set status = observation
4. After second occurrence on a different project: update status = verified
5. After third occurrence or when generalization is clear:
   - Update the relevant standard/scenario file
   - Set status = promoted-to-standard
   - Add "Promotes to: {file}" so the trail is traceable
6. Commit: "field-knowledge: Add FK-{NNN} [{system or pattern}]"
```

---

## REALISTIC TIMELINE (per project)

The automated pipeline runs steps 1-4 automatically when intake files land.
A tech lead's role is review and go/no-go at each gate, not running each step manually.

| Phase | Who | Time | Automated? |
|-------|-----|------|-----------|
| Drop intake files | Tech lead | 5 min | — |
| Analyst → prd.md | Pipeline (`intake-to-code.yml`) | 10–15 min | ✓ Auto |
| **Review prd.md, resolve OPEN ITEMS** | Tech lead | 15–45 min | Manual gate |
| Architect → architecture.md + decisions.json | Pipeline | 15–20 min | ✓ Auto |
| **Review decisions.json** | Tech lead | 10–20 min | Manual gate |
| PM → stories.md | Pipeline | 5–10 min | ✓ Auto |
| Scaffold → /tmp/{client}-mule/ | Pipeline | < 1 min | ✓ Auto |
| **Approve repo creation** | Tech lead | 2 min | Manual gate |
| GitHub repo created + Codespace link | `create-client-repo.sh` | 2 min | Manual trigger |

**Typical total clock time:** 1.5–3 hours (mostly waiting for pipeline + review)
**Developer can open Codespace:** same day in most cases
**Complex projects (API discovery needed):** 1–2 days to resolve OPEN ITEMS

The "30-minute estimate" referenced in earlier sessions was aspirational and did not
account for human review gates. The actual pipeline automation saves ~3 hours of
manual agent-running but review time is irreducible and project-dependent.

---

## HOW TO START EACH CLAUDE CODE SESSION

```
Read docs/PLANNING_CONTEXT.md and docs/CHUNK_PROGRESS.md, then start next chunk.
```

This file contains system design only. Build plan, specs, and status all live in `docs/CHUNK_PROGRESS.md`.

---

## LEOLABS REFERENCE (TEST PROJECT)

5 flows | connectors: salesforce 11.4.0, netsuite 11.11.0, anypoint-mq 4.0.7
Pattern: event-driven + scheduled-sync | Security: internal
NFR: medium volume, async-ok, 99.9% | Notifications: email + slack
Scheduler: cron 0 0 2 * * ? | Watermarking: yes, persistent
CI/CD: github-actions | Environments: dev, uat, prod
Deployment: cloudhub2 us-east-1
Flow control: messageTtl=24h, maxConcurrency=4, backpressureEnabled=true
Compensation: retry (no financial mutations)

---

## CONSTRAINTS

- Mule 4.8.0 / Java 17 ONLY
- CloudHub 2.0 only (not 1.0)
- GitHub API for repo creation (not gh CLI)
- Scaffold generates VALID XML that compiles immediately
- decisions.json = ONLY interface between planning and scaffold
- standards/connector-registry.json = ONLY source for connector metadata and dependency versions
- Connector lastVerified > 30 days → MUST call MuleSoft MCP search_asset before use
- Client dev repo = code only, no planning artifacts
- Registry grows with every project — never look up same connector twice
- BMAD agents: decisions-first, max 3 questions per run, everything else defaults or becomes TODO
- Architect Agent: consult docs/PATTERNS_RESEARCH.md when no scenario file clearly fits or pattern choice is non-obvious
- All async flows: idempotency check MANDATORY — no exceptions
- All MQ queues: TTL MANDATORY — never leave at default unlimited
- Notification failures: NEVER break primary flow — always wrap in on-error-continue
- DLQ ≠ Invalid Message Channel — validation failures go to invalid-messages-queue, not DLQ

---
*Updated: May 2026 — post deep-research rewrite incorporating EIP, flow control, and coupling frameworks*
*Do not edit manually — update via Claude Code sessions only*
