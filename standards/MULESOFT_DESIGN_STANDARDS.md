# MuleSoft Design Standards
> **Architect reference.** Walk all 6 levels in order for every project. Every answer maps to a field in `decisions.json`.
> Never skip a level. Never deviate from these standards without a documented exception in `architecture.md`.
> See also: `docs/PATTERNS_RESEARCH.md` (research backing for pattern guidance).
> Last updated: May 2026

---

## Pre-Decision Checklist

Before starting the decision tree, confirm you have:
- [ ] `prd.md` for this client (Analyst Agent output)
- [ ] NFR section in prd: volume, latency, frequency, availability
- [ ] System inventory: all source and target systems named
- [ ] Security classification: internal / partner / regulated / government
- [ ] Read `docs/PATTERNS_RESEARCH.md` (required before walking Level 1)

---

## Level 0 — Integration Style Selection

Select the integration style **before** selecting a pattern. The style constrains which patterns are valid at Level 1.

| Style | Description | When to use | MuleSoft role |
|-------|-------------|-------------|---------------|
| **Messaging** | Async communication via message broker | Default for decoupled, resilient flows; when sender and receiver run at different speeds or reliabilities | Mule as producer, consumer, or router |
| **Remote Procedure Invocation (RPC)** | Synchronous API call — caller waits for response | Real-time queries; user-facing APIs; < 10s acceptable latency | Mule as API gateway or orchestrator |
| **File Transfer** | Batch files exchanged on schedule | Large data volumes; partner integrations; legacy systems without APIs | Mule as file processor (SFTP/S3/FTP) |
| **Shared Database** | Multiple applications read/write the same DB | **Avoid in new designs.** Only when integrating legacy monoliths with no API surface | Mule as DB poller or writer — tightly coupled |

### Selection Rules

- Caller waits for result → **RPC**
- Decoupled, async, or multi-consumer → **Messaging**
- Partner drops a file or batch is large → **File Transfer**
- Legacy system has no API, only a DB → **Shared Database** (last resort; document why in `architecture.md`)
- Multiple styles needed → **Messaging + RPC** is the most common combination (use Hybrid pattern O)

Write the selected style into `decisions.json` as `integration.integrationStyle`.

---

## Level 1 — Primary Integration Pattern

> REQUIRED: Read `docs/PATTERNS_RESEARCH.md` before walking this section.

Select **one** primary pattern. Each pattern has a dedicated scenario file in `standards/scenarios/` with reference architecture, `decisions.json` defaults, XML templates, error handling, and MUnit checklist.

### All 18 Patterns

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
```

### Pattern Decision Guide

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
None fits cleanly?                      → O (hybrid — must list secondaryPatterns)
```

### Rules

- A project has exactly **one** `primaryPattern`.
- `secondaryPatterns` is an array; list in data-flow sequence order.
- If HYBRID, document which flows map to which secondary pattern in `integration.flows`.
- Patterns P and Q are **always secondary** — they enhance a primary pattern, never replace one.

---

## Level 2 — NFR Profile

Answer all five. Use the exact enum values — they map directly to `decisions.json nfr`.

```
volume:       low (<100/day) | medium (<10K/day) | high (<1M/day) | bulk (millions+)
latency:      under-1s | under-3s | under-10s | async-ok
frequency:    real-time | scheduled | triggered | one-time
availability: best-effort | 99.9 | 99.99
throughput:   low | medium | high | very-high
```

**Standard defaults** (apply when prd.md is silent):
- volume: `medium`
- latency: `async-ok` for Messaging style; `under-3s` for RPC style
- availability: `99.9`
- throughput: `medium`

---

## Level 3 — Systems Involved

For every source and target system in the integration:

1. Search `standards/connector-registry.json` by `key` or `displayName`.
2. **Found** → check `lastVerified`. If > 30 days old: call MuleSoft MCP `search_asset`, update entry, then use.
3. **Not found** → call MuleSoft MCP `search_asset("{system name} connector")`.
   - Found on Exchange → add full entry to registry, commit, then use.
   - Not on Exchange, has REST/OpenAPI → classify as `http` connector; add `custom-{name}` entry.
   - Not on Exchange, has SOAP/WSDL → classify as `soap` connector; store WSDL in `resources/api/`.
   - Truly unknown → flag as `OPEN ITEM — BLOCKER` in `prd.md`. Do not proceed to architecture.

**Never look up the same connector twice.** Once in the registry it stays permanently.

Write all connectors to `decisions.json systems.connectors[]`.

### Critical Notes (always apply)

- **NetSuite REST:** Connector 11.0+ does NOT support REST. Use HTTP connector + PS256 JWT via Nimbus JOSE helper JAR.
- **SAP JCo:** Requires a separate MuleSoft license AND SAP JCo native JARs — these cannot go in `pom.xml`.
- **ServiceNow:** OAuth 2.0 Authorization Code does not work with metadata. Use basic auth for Studio metadata resolution.
- **File connector on CloudHub 2.0:** Local filesystem is ephemeral. Use S3, SFTP, or Azure Blob for persistence.
- **Oracle JDBC driver:** `ojdbc11.jar` cannot be in `pom.xml` (Oracle license). Place in shared lib on CloudHub 2.0.

---

## Level 4 — Operational Needs

Multi-select. Check every box that applies. Each selection adds to `decisions.json`.

```
□ anypoint-monitoring-basic            → always on (no exceptions)
□ anypoint-monitoring-custom-dashboard → for client-facing projects
□ business-events                      → for audit / KPI tracking
□ external-observability               → Splunk / Datadog / Azure Monitor integration
□ email-notifications                  → for operational alerts
□ sms-notifications                    → for critical on-call alerts
□ slack-notifications                  → for operational visibility
□ teams-notifications                  → for operational visibility
□ scheduling                           → cron or fixed-frequency triggers
□ watermarking                         → required for all scheduled-sync (D) flows
□ dlq-and-retry                        → required for all async flows
□ field-level-encryption               → for PII / regulated data
□ data-masking-in-logs                 → for any data touching PII
□ flow-control                         → rate-limiting + backpressure (all high-volume)
□ invalid-message-channel              → separate from DLQ — for validation failures
```

**Standard defaults** (apply when prd.md is silent):
- `anypoint-monitoring-basic`: always selected
- `dlq-and-retry`: always selected for async flows
- `watermarking`: selected when `scheduling` is selected and pattern is D
- `data-masking-in-logs`: selected when security level is `regulated` or `government`
- `flow-control`: selected when volume is `high` or `bulk`

---

## Level 5 — Security Level

Select exactly one. Each level inherits all controls from the level below it.

```
internal     → client-id-enforcement + rate-limiting
partner      → oauth2-client-credentials + rate-limiting
regulated    → oauth2 + jwt-validation + Secrets Manager
government   → mtls + oauth2 + jwt + Secrets Manager + field-encryption
```

**Standard default:** `internal` unless prd.md states otherwise.

Write to `decisions.json security.level` and populate the corresponding `apiAuth`, `gatewayPolicies`, `secretsManager`, `fieldEncryption`, `mtls` fields.

---

## Level 6 — Client-Facing Needs

Multi-select. Drives which additional components the scaffold generates.

```
□ operations-dashboard   → Anypoint custom dashboard; auto-selects anypoint-monitoring-custom-dashboard
□ business-reporting     → BusinessEvents + export job
□ audit-trail            → Wire Tap pattern to audit queue; archive to S3/Blob
□ self-service-portal    → Experience API + UI spec required
□ ux-frontend            → Frontend spec + API-led experience layer required
□ none                   → backend only (most projects)
```

**Standard default:** `none` unless prd.md explicitly calls for a portal or reporting.

---

## Flow Control Standards

> Source: Gregor Hohpe "Queues Are Databases" (2022).
> Production queues without TTL and depth monitoring cause "all lights green, system is down."

### The Three Mechanisms

| Mechanism | Description | MuleSoft Implementation | When to apply |
|-----------|-------------|------------------------|---------------|
| **Message TTL (Expiration)** | Messages expire if not consumed within window | Anypoint MQ: `timeToLive` on publish; Kafka: `retention.ms` on topic | All async flows — apply always |
| **Tail Drop (Queue Depth Limit)** | Drop new messages when queue is full | Anypoint MQ queue max size; alert at 80% depth; reject at 100% | High-volume queues; prevent memory exhaustion |
| **Backpressure** | Slow producer when consumer is overloaded | `maxConcurrency` on `anypoint-mq:subscriber`; HTTP rate-limiting on Flex Gateway | All MQ consumers; any high-rate inbound flow |

### Default TTL Policy

| Event type | TTL |
|------------|-----|
| Critical business events (orders, payments, provisioning) | 7 days |
| Standard integration events | 24 hours |
| Notification events (alerts, emails, SMS) | 1 hour |
| Monitoring / audit events | 72 hours |
| CDC events (near-real-time) | 4 hours |

Write TTL to `decisions.json flowControl.messageTtlHours`. Never leave at broker default (unlimited).

### Queue Depth Monitoring

| Queue depth | Action |
|-------------|--------|
| > 80% of configured max | Alert Ops — MEDIUM alert |
| > 90% | Page on-call — HIGH alert |
| 100% (full) | Tail drop active — NEW MESSAGES DROPPED — critical page |
| DLQ > 0 | Page on-call immediately — HIGH alert always |

Configure Anypoint Monitoring alerts for all queues. DLQ depth > 0 is always HIGH.

### Backpressure Configuration

```xml
<!-- Set maxConcurrency based on downstream system capacity, not Mule CPU -->
<anypoint-mq:subscriber
  config-ref="Anypoint_MQ_Config"
  destination="${mq.queue.name}"
  acknowledgementMode="MANUAL"
  maxConcurrency="4"/>   <!-- 4 is a safe default; tune per downstream system -->
```

### Push vs. Pull

| Scenario | Direction | Implementation |
|----------|-----------|----------------|
| MuleSoft consumes from Anypoint MQ | Push (broker delivers) | `anypoint-mq:subscriber` |
| MuleSoft polls a REST API for new records | Pull (Mule pulls) | scheduler + HTTP GET + watermark |
| External SaaS pushes events to Mule | Push (SaaS delivers) | `http:listener` (webhook) |
| Mule polls a DB for changes | Pull (Mule pulls) | scheduler + `db:select` + watermark |
| Kafka consumer | Pull (consumer polls broker) | `kafka:message-listener` |

Write direction to `decisions.json flowControl.direction: push|pull|hybrid`.

---

## Compensation Decision Framework

> Source: Gregor Hohpe "Starbucks Does Not Use Two-Phase Commit" (2004).
> Three distinct strategies — choose based on business consequence of failure.

### The Three Strategies

| Strategy | When to use | MuleSoft implementation |
|----------|-------------|------------------------|
| **Write-off** | Failure is acceptable; cost of compensation exceeds cost of loss | Log at WARN; continue; do not retry; do not compensate |
| **Retry** | Operation is idempotent; failure is transient | retry-then-dlq; exponential backoff |
| **Compensating Transaction** | Operation succeeded but must be undone due to downstream failure | Process orchestration with saga; explicit rollback flows |

### Decision Rules

```
Did the operation mutate financial, provisioning, or compliance data?
  YES → compensating-transaction (saga rollback)
  NO  → continue

Is the operation idempotent AND the failure transient?
  YES → retry
  NO  → continue

Is the cost of recovery less than the cost of the loss?
  YES → retry or compensating-transaction
  NO  → write-off
```

**Write-off examples (do NOT use compensating-transaction):**
- Failed Slack notification → log WARN, continue
- Failed audit log write → log ERROR, continue (audit gap is acceptable)
- Failed metric increment in monitoring
- Non-critical enrichment step failed → use cached/default value

**Compensating-transaction examples:**
- Payment processed → order creation failed → issue refund
- Salesforce opportunity created → NetSuite SO creation failed → delete Salesforce opportunity
- User account created in IdP → license assignment failed → disable account + notify admin

Write strategy to `decisions.json errorHandling.compensationStrategy`.

---

## Cross-Cutting Patterns

Apply these to every project regardless of primary pattern. The Architect must evaluate each one.

### Idempotent Receiver (MANDATORY for all async flows)

Every MQ consumer MUST implement idempotency. Duplicates will occur — guaranteed.

```
Key:    {consumer-prefix}-{messageId}
Store:  Object Store (persistent), TTL = 24 hours (match or exceed message TTL)
Action: On duplicate → ACK and skip (do NOT re-process)
```

Failure to implement idempotency in async flows is a P0 bug.

### Claim Check (MANDATORY when payload > 1 MB)

Do not put large payloads in MQ messages. Put a reference instead.

```
Threshold: > 1 MB
Steps:
  1. Write payload to S3/Azure Blob; key = correlationId
  2. Publish message with key only (the claim check token)
  3. Consumer reads key, retrieves full payload from store
  4. Consumer deletes from store after processing (or let TTL expire)
```

### Normalizer (when receiving N payload formats for the same entity)

```
Condition: Multiple source systems send the same entity type in different formats
Implementation:
  - One normalizer flow per entity type
  - Converts ALL formats to canonical schema
  - All downstream flows consume canonical only
  - Never let multiple formats propagate past the entry point
```

### Wire Tap (non-intrusive monitoring)

Use for audit trails and message capture without modifying the primary flow.

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
Generation:  API gateway (Experience API) generates UUID on inbound request
Propagation: Set as Mule correlationId (not a variable) — propagates automatically
HTTP header: X-Correlation-ID (inbound and outbound)
MQ messages: Set as messageId on publish; read from attributes.messageId on consume
Logging:     Always include in every log line

Never:       Generate a new correlationId mid-flow
Never:       Lose correlationId when crossing async boundaries (publish it explicitly)
```

### Invalid Message Channel vs. Dead Letter Queue

**These are NOT the same thing.**

| Channel | Purpose | Retry? | Example |
|---------|---------|--------|---------|
| **Invalid Message Channel** | Validation failures — message is structurally or semantically wrong | NO — it will always fail again | Missing required field, wrong JSON schema, unknown order type |
| **Dead Letter Queue (DLQ)** | Delivery failures — message is valid but downstream unavailable | YES — retry when system recovers | API timeout, DB connection refused, MQ ACK timeout |

Route to Invalid Message Channel **before** any downstream call. Never put a validation failure in the DLQ — it will fail on every retry.

```xml
<!-- Validate early; route invalid messages BEFORE any downstream call -->
<validation:is-not-null value="#[payload.orderId]" message="orderId is required"/>
<!-- On ValidationException → on-error-continue → publish to invalid-messages-queue -->
```

### Semantic Dissonance Documentation

When two systems use the same field name for different concepts, document it in `architecture.md` before coding.

```markdown
## Semantic Dissonance
| Field  | System A meaning   | System B meaning        | Resolution                      |
|--------|--------------------|-------------------------|---------------------------------|
| region | Sales territory    | Geographic ISO region   | Map via lookup table in DWL     |
```

Examples: ZIP code (US 5-digit vs. international postal), fiscal periods (different year-end dates), region codes.

---

## EDA Fit Assessment

Event-Driven Architecture's unique advantage over point-to-point async is **topology decoupling**: add a new consumer without changing the publisher. This advantage only matters if you don't control the event source, or if consumers evolve independently.

Run this checklist before recommending EDA (Messaging style + B/M/F patterns):

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

**Anti-pattern:** Using EDA for point-to-point flows where you control both ends adds complexity with no topology decoupling benefit. Use B (event-driven) 1-to-1, not M (pubsub-fanout).

---

## Anti-Patterns

| Anti-pattern | Problem | Correct alternative |
|-------------|---------|-------------------|
| **Shared Database integration** | Schema coupling — any DB change breaks all consumers | Add an API layer; use System API pattern |
| **Synchronous fan-out** | One slow downstream stalls all others; cascading failures | Use scatter-gather (I) with timeout per leg, or async fan-out (M) |
| **Process Integration overuse** | Central hub creates single point of failure and tight coupling | Use EDA for autonomous consumers; reserve orchestration (H) for workflows that genuinely require saga compensation |
| **Polling without watermark** | Full table scan on every poll; misses records updated during poll window | Always use watermark (last-modified timestamp or sequence ID) on scheduled-sync (D) |
| **Large payloads in MQ** | Broker memory pressure; serialization cost; size limit violations | Use Claim Check — store in S3/Blob, pass reference |
| **DLQ as Invalid Message Channel** | Validation failures retry forever, consuming retry budget | Validate first; route structural failures to Invalid Message Channel |
| **Fire-and-forget on critical mutations** | No delivery guarantee for financial or compliance data | Use MANUAL ack on MQ consumers; confirm delivery before ACK |
| **Correlating by payload field** | Correlation breaks when field is null, renamed, or absent | Always generate and propagate correlationId from the gateway |
| **Inline complex DataWeave** | Untestable, uncacheable, hard to maintain | External `.dwl` files for any transform > 10 lines |
| **Java class in DataWeave** | Tight coupling to Java runtime; breaks on Mule version updates | Use DataWeave 2.0 native functions; isolate Java interop in a Java module |

---

## Technical Standards Reference

### Runtime
- Mule **4.8.0** / Java **17** ONLY
- Java 11 support ends Aug 2026 for 4.6 LTS
- CloudHub **2.0** default (not 1.0 — deprecated)

### API-Led Connectivity — MANDATORY
- 3 layers: system / process / experience
- System API: ONE backend system only
- Process API: orchestrates + business logic
- Experience API: formats for consumer
- Naming: `{system}-sys-api` | `{domain}-proc-api` | `{consumer}-exp-api`

### Naming Conventions
- Projects: `{domain}-{layer}-api` (kebab-case)
- Flows: `{action}-{entity}-flow` (kebab-case)
- Variables: camelCase
- DWL files: `{verb}-{source}-to-{target}.dwl`
- Properties: `dot.separated.lower`
- MQ queues: `{domain}-{action}-{env}-queue`
- DLQ: `{queue-name}-dlq` (append `-dlq` to the source queue name)
- Invalid Message Channel queue: `{domain}-invalid-messages-queue`

### Error Handling — MANDATORY
- Global error handler in `error-handler.xml` — always generated
- Error envelope: `{correlationId, errorCode, message, timestamp, failingComponent}`
- Never expose Java stack traces in responses
- Notification failures NEVER break the primary flow — always wrap in `on-error-continue`

### Retry Table
```
Sync API timeout             → 3 retries, 5s fixed, return 503 + Retry-After header
Async MQ                     → 3 retries, exponential 30/90/270s, then DLQ
Batch record failure         → 1 retry, continue batch, report failures at end
Auth token expiry            → 1 refresh attempt, halt + alert if refresh fails
Notification (email/Slack)   → 2-3 retries, fixed 2-5s, log WARN on fail, always continue
```

### Logging — MANDATORY
- Always include: `correlationId`, `flowName`, `timestamp`, `payloadSize`, `environment`
- Never log: credentials, PII, raw payloads in full, Java stack traces in prod
- Format: JSON for all non-local environments
- Wire logging: DEV and LOCAL only

### Monitoring Alerts (production mandatory)
```
DLQ count > 0          → HIGH  → page on-call immediately
Error rate > 5% / 5min → HIGH
p95 latency > 3s       → MEDIUM
Memory > 80%           → MEDIUM
Auth refresh failure    → HIGH
MQ queue depth > 80%   → MEDIUM
MQ queue depth > 90%   → HIGH
```

### DataWeave
- External `.dwl` files only — no inline transforms > 10 lines
- Always declare input content-type
- Use `indent=false` for large payloads
- Comments for business rules only — never for what the code obviously does

### MUnit Coverage by Pattern
```
request-reply, api-aggregation    → 80% minimum
event-driven, pubsub-fanout       → 75% minimum
batch, data-migration             → 75% minimum
outbound-notification             → 60% minimum
all others                        → 80% minimum
```
- Happy path + minimum 2 error scenarios per flow
- Mock all connector operations in MUnit
- CI/CD gate — must pass before deploy

---

## BMAD Architect Agent Decision Policy

### Decisions-First, Questions-Last

Apply all standards defaults automatically. Do NOT ask clarifying questions unless the answer is:
1. Missing from all intake documents **AND**
2. Has no applicable standard default **AND**
3. Getting it wrong would cause rework (not just a TODO)

**Maximum 3 questions per agent run.** Everything else defaults or becomes a developer TODO comment.

### Walking the 6-Level Tree

At each level:
- Apply the decision from `prd.md` if stated explicitly
- Apply the standard default if not stated
- Only question the client if no default exists and the decision is a blocker

### Standard Defaults Applied Automatically

```
Integration style:    determined by primary pattern (Level 0 table)
Runtime:              Mule 4.8.0 / Java 17
Deployment:           CloudHub 2.0, us-east-1
Error handling:       retry-then-dlq, 3 retries, exponential backoff
Compensation:         retry — unless financial/provisioning/compliance → compensating-transaction
Flow control:         messageTtlHours=24, maxConcurrency=4, queueDepthAlertPct=80
Monitoring:           Anypoint Monitoring basic always on
Logging:              JSON, correlationId, no PII, WARN in prod
MUnit:                required; coverage per pattern table above
Security:             internal (unless stated otherwise)
Watermarking:         persistent Object Store (not in-memory) for all scheduled flows
Idempotency:          required on ALL async MQ consumers — no exceptions
Claim Check:          required for payloads > 1 MB
```

---

*Updated: May 2026 — full rewrite incorporating EIP, flow control, compensation, and all 18 patterns (A–R)*
*Do not edit manually — update via Claude Code sessions only*
