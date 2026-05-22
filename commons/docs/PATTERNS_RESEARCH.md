# MuleSoft Integration Patterns Research Reference
> **Required reading for BMAD Architect Agent before walking the decision tree.**
> This document distills research from the EIP canonical catalog (65 patterns), the Microsoft/Hohpe
> Patterns & Practices PDF (intpatt.pdf), Gregor Hohpe's ramblings articles (2019–2022), and the
> Architecture & Governance integration patterns survey. Use it to understand WHY each decision in
> DESIGN_STANDARDS.md exists and to make judgment calls on edge cases.
>
> **MuleSoft preference rule:** Apply EIP patterns as design vocabulary, not as strict requirements.
> Where MuleSoft provides native support, use it. Where a pattern is outdated (SOAP/WS-*, screen
> scraping, CORBA), ignore it. Where a pattern fills a genuine gap in our scenarios, apply it.

---

## Sources

| Source | What it covers | Relevance |
|---|---|---|
| `intpatt.pdf` (Microsoft/Hohpe, 2004, 18K lines) | 12 patterns applied to a real bank scenario with BizTalk | High — compensation, entity aggregation, process integration warnings |
| EIP canonical site (Hohpe & Woolf, 2003, all 65 patterns) | Complete messaging pattern catalog | High — vocabulary, cross-cutting patterns, channel types |
| Ramblings: "Control Flow — The Other Half" (Hohpe, 2022) | Push vs. pull, queue inversion, hidden latency | High — missing from original EIP book, critical for cloud-native |
| Ramblings: "Queues Invert Control Flow But Require Flow Control" (2022) | TTL, tail drop, backpressure, Little's Law | High — operational patterns entirely absent from original EIP |
| Ramblings: "Event-driven = Loosely Coupled? Not so fast!" (2021) | 6 coupling dimensions, EDA uniqueness | High — prevents over-applying pub/sub |
| Ramblings: "The Many Facets of Coupling" (2019) | 8-dimension coupling framework | High — replaces binary coupled/decoupled thinking |
| Ramblings: "Starbucks Does Not Use Two-Phase Commit" (2005) | Write-off / retry / compensate decision | High — compensation strategy framework |
| Ramblings: "Correlation and Conversations" | CorrelationId vs ConversationId | Medium — when to generate vs. propagate |
| Architecture & Governance survey | Data-centric / Event-driven / App-centric groupings | Medium — useful framing, not directly actionable |
| EIP talks (Hohpe 2003–2022) | Architect Elevator, EDA maintenance problems, platforms | Medium — philosophy, not prescriptive |

---

## Part 1: Integration Styles — Top-Level Selection

Before selecting a pattern, choose the integration style. This is the EIP's foundational choice and is
missing from most integration frameworks. Each style has fundamentally different coupling properties.

### 1A. File Transfer
- Applications produce files at intervals; other applications consume them
- **Use when:** Batch processing acceptable; source system only produces files (SFTP, S3, FTP);
  large volumes where messaging overhead is prohibitive; EDI partners
- **Do NOT use:** Near-real-time needed; individual record audit trail required; high transformation complexity
- **MuleSoft:** SFTP connector, S3 connector, FTP connector → maps to scenarios E (file-based-etl) and C (batch)
- **Still relevant:** Yes — SFTP/S3 file exchange is ubiquitous in 2026

### 1B. Shared Database
- Multiple applications share a single database schema
- **Use when:** Absolute data consistency required; applications are tightly coupled by design; same team owns all apps
- **Do NOT use:** Different teams own different apps; different vendors; microservices; any cross-org integration
- **MuleSoft:** Database connector — technically possible, architecturally discouraged
- **Modern judgment:** This is an **anti-pattern** for new MuleSoft integrations. If a client uses shared DB
  today, the MuleSoft engagement is likely to migrate them away from it, not extend it.
- **Still relevant:** Only for legacy migration projects where shared DB must be wrapped in System APIs

### 1C. Remote Procedure Invocation (RPC / REST)
- Caller invokes function on remote system; waits for response
- **Use when:** Immediate response required; caller must block for result; single-record operations
- **Do NOT use:** High latency between systems; provider may be unavailable; high throughput needed; caller cannot wait
- **MuleSoft:** HTTP connector, SOAP/WSC connector → maps to scenario A (request-reply) and I (api-aggregation)
- **Still relevant:** Yes — REST APIs are the dominant integration mechanism. RPC = REST in 2026.

### 1D. Messaging
- Applications communicate via asynchronous message channels
- **Use when:** Decoupling needed; systems operate at different speeds; reliability > latency; multiple consumers; transformation during transit
- **Do NOT use:** Blocking response essential; distributed transactions required; sub-millisecond latency
- **MuleSoft:** Anypoint MQ, Kafka → maps to scenarios B, D, F, G, H, J, K, L, M, N
- **Still relevant:** Yes — foundational for all event-driven and async patterns

**Decision rule:** Choose Messaging unless the caller genuinely needs to wait (→ RPC) or the source
only produces files (→ File Transfer). Never choose Shared Database for new work.

---

## Part 2: EIP Canonical Pattern Catalog

All 65 EIP patterns assessed for MuleSoft relevance. Patterns marked ~~obsolete~~ should not be
implemented in new MuleSoft projects; they appear here for vocabulary only.

### Messaging Channels

| Pattern | MuleSoft Component | Notes |
|---|---|---|
| **Message Channel** | Anypoint MQ queue/exchange, Kafka topic | Logical abstraction — always use logical names, never physical |
| **Point-to-Point Channel** | Anypoint MQ Queue | Default for 1-to-1 async; Competing Consumers uses this |
| **Publish-Subscribe Channel** | Anypoint MQ Exchange → Queues; Kafka topic → Consumer Groups | Fan-out; each subscriber gets its own copy |
| **Datatype Channel** | Queue/topic naming convention: `{domain}-{eventtype}-queue` | No native routing by type — enforce via naming standard |
| **Invalid Message Channel** | Custom validation-failure queue (distinct from DLQ) | Validation failures ≠ delivery failures — don't conflate |
| **Dead Letter Channel** | Anypoint MQ DLQ; `{queue-name}-dlq` naming | Auto-created in Anypoint MQ when configured |
| **Guaranteed Delivery** | `acknowledgementMode="MANUAL"` on all subscribers | Critical — never use AUTO or IMMEDIATE in production |
| **Channel Adapter** | Every MuleSoft connector (Salesforce, SAP, NetSuite…) | This IS what connectors are |
| **Messaging Bridge** | MuleSoft flow: consume IBM MQ → publish Anypoint MQ | For legacy MOM migration |
| **Message Bus** | Anypoint Platform + Canonical Data Model in Process APIs | Requires org commitment to canonical schema |

### Message Construction

| Pattern | MuleSoft Implementation | Notes |
|---|---|---|
| **Command Message** | HTTP POST with action verb; MQ message with command intent | By convention — no native type enforcement |
| **Document Message** | HTTP PUT/POST with full document; MQ with document payload | Most common pattern |
| **Event Message** | Salesforce Platform Events; Anypoint MQ with event envelope | Canonical event envelope standard (see Cross-Cutting) |
| **Request-Reply** | HTTP request-response (sync); MQ with correlationId (async) | HTTP is native; async requires explicit correlation |
| **Return Address** | `JMSReplyTo` equivalent in MQ headers; `statusUrl` in 202 response | Must be included in all 202 Accepted responses |
| **Correlation Identifier** | MuleSoft's built-in `correlationId`; also `messageId` | Propagate incoming; only generate new at system entry points |
| **Message Sequence** | Custom sequence number in payload headers | No native MuleSoft support — implement manually when order matters |
| **Message Expiration** | Anypoint MQ queue TTL configuration | Set per business criticality — see Flow Control section |
| **Format Indicator** | `Content-Type` header; API version in path (`/v1/`, `/v2/`) | Standard HTTP practice; enforce in all APIs |

### Message Routing

| Pattern | MuleSoft Component | Notes |
|---|---|---|
| **Content-Based Router** | Choice Router, DataWeave conditional expressions | Core flow control — fully native |
| **Message Filter** | Choice Router with discard branch | Fully native |
| **Dynamic Router** | Custom: routing rules from Object Store or API call | Not native — implement when routing destinations change at runtime |
| **Recipient List** | For-Each scope; Scatter-Gather with dynamic branch list | Static branches = Scatter-Gather; dynamic = For-Each over recipient list |
| **Splitter** | For-Each scope; Batch:Input phase; DataWeave `map()` | Multiple native implementations |
| **Aggregator** | Scatter-Gather (automatic); Object Store (manual cross-flow) | Native for same-flow parallel; manual for cross-flow |
| **Resequencer** | Custom: Object Store + sequence number tracking | Not native — Kafka partitions for streams; custom for MQ |
| **Composed Message Processor** | Scatter-Gather + For-Each + aggregation DataWeave | Requires explicit orchestration in Process API |
| **Scatter-Gather** | Native Scatter-Gather Router | Key component of api-aggregation scenario |
| **Routing Slip** | Custom: routing list in message property + subflow chain | Not native — implement via headers when dynamic multi-step routing needed |
| **Process Manager** | Process API + Object Store for state + 202+poll pattern | No dedicated orchestration engine — MuleSoft uses flow composition |
| **Message Broker** | MuleSoft itself IS the message broker | The central architectural role of a MuleSoft deployment |

### Message Transformation

| Pattern | MuleSoft Component | Notes |
|---|---|---|
| **Envelope Wrapper** | DataWeave wrapping/unwrapping transforms | Standard DataWeave practice |
| **Content Enricher** | HTTP call + DataWeave merge; Scatter-Gather lookup branch | Very common — most integrations enrich before forwarding |
| **Content Filter** | DataWeave field selection | Standard DataWeave transform |
| **Claim Check** | Object Store store/retrieve with UUID key | **Use when payload > 1MB** — store body, pass reference. See Cross-Cutting. |
| **Normalizer** | Choice Router + per-format DataWeave transform | **Use when multiple sources send same entity in different formats.** See Cross-Cutting. |
| **Canonical Data Model** | Process API's data model (`.dwl` files) | Core of MuleSoft's API-led architecture — Process API owns canonical representation |

### Messaging Endpoints

| Pattern | MuleSoft Component | Notes |
|---|---|---|
| **Messaging Gateway** | System API layer | System API IS the Messaging Gateway — wraps backend access |
| **Messaging Mapper** | DataWeave transforms | All transforms live in `.dwl` files |
| **Transactional Client** | Anypoint MQ MANUAL ack; Database JTA transactions | MANUAL ack is the critical idempotency mechanism |
| **Polling Consumer** | Scheduler + Anypoint MQ pull / Kafka poll | Scheduler-triggered flows; Kafka consumer |
| **Event-Driven Consumer** | Anypoint MQ subscriber; Kafka consumer; Salesforce CDC listener | Core of event-driven patterns |
| **Competing Consumers** | `maxConcurrency` on subscriber; multiple CloudHub 2.0 replicas | Multiple workers consuming same queue — scales horizontally |
| **Message Dispatcher** | Custom: content-based routing after receive with `maxConcurrency=1` | Not native — implement when strict ordering AND dispatch needed |
| **Selective Consumer** | Choice Router after receiving | Filter by content type after message consumed |
| **Durable Subscriber** | Anypoint MQ Queue bound to Exchange; Kafka consumer group offsets | Queue IS the durable subscription mechanism — survives subscriber downtime |
| **Idempotent Receiver** | Object Store with `messageId` + TTL | **Mandatory for ALL event-driven flows.** See Cross-Cutting. |
| **Service Activator** | Flows with both HTTP listener AND MQ subscriber triggering same logic | Dual-mode access pattern — same sub-flow called from both |

### System Management

| Pattern | MuleSoft Component | Notes |
|---|---|---|
| **Control Bus** | Anypoint Monitoring; Runtime Manager; separate audit flows | Management traffic separate from application traffic |
| **Detour** | Feature flag property → Choice Router bypass | Useful for A/B routing during deployments |
| **Wire Tap** | Async publish to monitoring queue; Scatter-Gather logging branch | Not native — must implement explicitly. See Cross-Cutting. |
| **Message History** | `correlationId` propagation; custom `x-message-history` header | Manual accumulation — use for distributed tracing |
| **Message Store** | Anypoint Monitoring event store; custom Object Store audit logging | No dedicated component — implement via logging standard |
| **Smart Proxy** | Not needed — use `correlationId`/`conversationId` directly | Avoid this pattern; over-engineered for MuleSoft |
| **Test Message** | Health check flows; synthetic monitoring endpoints | Implement as `/health` and `/ping` endpoints |
| **Channel Purger** | Runtime Manager → Purge Queue; admin endpoint | Available via UI and Anypoint Platform API |

---

## Part 3: Additional Patterns from intpatt.pdf

These patterns from the Microsoft/Hohpe PDF (2004) are NOT in the standard EIP book but are highly
relevant for MuleSoft engagements.

### Entity Aggregation
**Problem:** Enterprise data for a single entity (Customer, Account, Product) is split across multiple
systems of record. Applications need a single consistent representation.

**Solution:** Introduce a logical entity aggregation layer with a master reference key mapped to each
repository's native key. Reads come from the authoritative source for each attribute.

**Two approaches:**
1. **Straight-Through:** Real-time concurrent calls to all repositories (our api-aggregation scenario)
2. **Replication:** Data warehouse approach — periodic sync to a single store (our scheduled-sync or batch)

**MuleSoft application:** When a client has Customer in both Salesforce and SAP, the Process API is the
Entity Aggregation layer. Document which system is authoritative for which fields in `architecture.md`.

**Key warning from intpatt.pdf:** "Semantic dissonance — data that appears to be the same may not mean
the same thing." ZIP codes, region definitions, fiscal periods — even if formatted identically, they
may have different business meanings. Architects MUST document semantic authority, not just data source.

### Process Integration Warning
**Documented verbatim in intpatt.pdf:** *"Because Process Integration can be used to solve nearly any
integration problem, some people take this as an indication that every integration problem should be
solved using Process Integration. This is not true. Using Process Integration frivolously can lead to
overarchitected and sometimes inefficient solutions — for example, in cases where a Message Broker
would be perfectly appropriate."*

**MuleSoft rule:** Only use process-orchestration scenario (H) when:
1. 3+ systems involved AND rollback/compensation required
2. Long-running (cannot complete in a single HTTP round-trip)
3. Human approval gate needed
Otherwise use event-driven (B) or api-aggregation (I).

### Compensation Strategies (from Starbucks article + intpatt.pdf)
Three strategies for handling distributed system failures. Choose the appropriate one per flow:

| Strategy | When to Use | Example |
|---|---|---|
| **Write-off** | Error rate × cost < correction system cost; small losses acceptable | Failed Slack notification — log and continue |
| **Retry** | Failure is likely transient; receiver is idempotent | Target system temporarily unavailable |
| **Compensating Transaction** | Committed state must be reversed; financial accuracy required | Payment charged but order failed — issue refund |

**Critical insight:** Many MuleSoft flows use compensating transactions when write-off is actually correct.
Failed notifications, failed audit log writes, and failed non-critical enrichments should almost always
be write-off, not compensation.

### Half Synch / Half Asynch (POSA pattern, referenced in intpatt.pdf)
**Problem:** A synchronous request needs data from a slow upstream source while also doing fast local work.
**Solution:** Issue the slow call asynchronously, do the fast work synchronously, then join results.
**Different from Scatter-Gather:** Scatter-Gather is all-parallel from the start. Half Synch/Half Asynch
starts one async call, does sync work in parallel on the same thread, then awaits the async result.
**MuleSoft application:** Use `async` scope for the slow call + synchronous work inline, then Object Store
to pass result back — or restructure as two flows with MQ handoff.

### Straight-Through Processing (STP)
**Definition:** Automated end-to-end processing of a transaction from initiation to settlement without
manual intervention. Common in financial services (trade settlement, payment clearing, invoice approval).
**Characteristics:**
- Each step is automated and sequential
- No human-in-the-loop (unlike process-orchestration with approval gates)
- Hard SLA per step (e.g., T+2 settlement in trading)
- Reconciliation loop catches discrepancies post-STP
**MuleSoft pattern:** Combination of event-driven trigger + sequential process-api calls + automated
compensation (no approval gates) + business events for audit + reconciliation scheduler.

---

## Part 4: Flow Control and Control Flow (Hohpe 2022 Ramblings)

This section covers what Hohpe calls "the other half of integration patterns" — missing from the
original EIP book and critical for production cloud-native systems.

### Push vs. Pull (Control Flow Direction)

Every integration flow has a control flow direction — who drives message consumption:

| Mode | Description | MuleSoft Example | Implication |
|---|---|---|---|
| **Push** | Messaging system delivers to consumer | Anypoint MQ subscriber (push mode) | Broker controls delivery rate; consumer may be overwhelmed |
| **Pull** | Consumer polls at its own rate | Scheduler + Kafka poll | Consumer controls ingestion rate; can implement backpressure |
| **Driver** | Active on both ends; controls fetch AND delivery rate | EventBridge Pipes equivalent; custom scheduler | Enables rate limiting and ordering; adds complexity |

**Hidden latency warning:** Cloud event routers (EventBridge ~500ms P90) contain internal queues that
add latency invisibly. Systems optimizing for throughput sacrifice latency. Always measure, never assume.

**Rule for each scenario:**
- A (request-reply): Push (HTTP listener)
- B (event-driven): Push (MQ subscriber) — consider pull if consumer is overwhelmed
- C (batch): Pull (Scheduler polls source)
- D (scheduled-sync): Pull (Scheduler polls source)
- E (file-based-etl): Pull (Scheduler polls SFTP/S3)
- F (cdc-streaming): Push (Salesforce CDC listener) or Pull (DB polling)
- J (webhook-ingestion): Push (external system calls in)
- L (streaming-pipeline): Pull (Kafka consumer poll)
- M (pubsub-fanout): Push (MQ Exchange delivers to bound queues)

### Queue Flow Control — Three Mechanisms

**Why this matters:** "Unlimited just means no explicit limit is set — it doesn't equate to infinite."
Little's Law: average wait time = items in queue ÷ arrival rate. Unbounded queues cause "all lights
green, system is down" scenarios where metrics look fine but users are experiencing unacceptable delays.

#### Mechanism 1: Message TTL (Time-to-Live)
- **What:** Aged messages are removed from the queue automatically
- **Use when:** Data has a freshness window beyond which processing is pointless
- **Examples:** CPU utilization metrics (stale after 60s), customer orders (stale after 30 min for Serverlesspresso), alert notifications (stale after 1h)
- **Do NOT set TTL:** For financial transactions, audit events, or any message where delayed processing is still valid
- **MuleSoft:** Configure at queue level in Anypoint MQ; document TTL in `decisions.json` `flowControl.messageTtlMinutes`

#### Mechanism 2: Tail Drop
- **What:** New arriving messages are rejected when queue approaches capacity
- **Use when:** Historical messages are more valuable than new ones; senders can detect rejection and retry
- **Example:** Application Load Balancer rejects excess traffic (returns 429)
- **MuleSoft:** Implement via rate-limiting policy on Experience API (Flex Gateway spike control)
- **Returns:** HTTP 429 with `Retry-After` header; caller implements exponential backoff

#### Mechanism 3: Backpressure
- **What:** Downstream consumer signals upstream to slow arrival rate
- **Use when:** Consumer cannot keep up; cascading failure risk if queue fills
- **Example:** RabbitMQ native backpressure — blocks publishing connections when memory threshold exceeded
- **MuleSoft:** Not natively supported in Anypoint MQ — implement via monitoring (queue depth alert)
  triggers Runtime Manager to pause/scale the publishing flow
- **`maxConcurrency`** is a form of backpressure — limits concurrent processing threads

### Queue Depth Monitoring (Operational Standard)

Every production queue must have a depth alert. If depth exceeds threshold, the system is falling behind:

| Queue type | Alert threshold | Action |
|---|---|---|
| DLQ | > 0 | HIGH — immediate investigation |
| Business event queue (high priority) | > 100 | MEDIUM — scale consumers or throttle producers |
| Notification queue (low priority) | > 500 | LOW — informational |
| Batch processing queue | > 10× normal batch size | MEDIUM — consumer lag |

---

## Part 5: Coupling Framework (Hohpe 2019–2021 Ramblings)

**Binary coupling is a myth.** Coupling has 8 independent dimensions. Architects must decide which
dimensions of coupling are acceptable for each integration, not simply "coupled" or "decoupled."

**Foundational principle:** *"The appropriate level of coupling depends on the level of control you have
over the endpoints."* Internal systems (same team) can tolerate higher coupling. External partners
(different org) require explicit decoupling.

| Dimension | Description | MuleSoft Guidance |
|---|---|---|
| **Technology** | Platform/protocol coupling (JMS vs. HTTP, Java vs. .NET) | Acceptable for internal systems; use HTTP for external |
| **Location** | Hard-coded addresses vs. logical names | Always use logical names via properties files; never hardcode URLs |
| **Topology** | Adding/removing participants requires changes | Use Pub-Sub for external sources you don't control; P2P for internal |
| **Data Format** | Fixed schema vs. tagged/flexible formats | Always use tagged formats (JSON, XML); never fixed-width for new work |
| **Semantic** | Same field name ≠ same meaning (the dissonance problem) | Document field authority in canonical model; never assume same name = same meaning |
| **Conversation** | Retry rules, idempotency contracts, order assumptions | Explicitly document all retry semantics in scenario files |
| **Order** | Message sequence assumptions | If order matters, document it and implement Resequencer or Kafka partitioning |
| **Temporal** | Synchronous coupling = temporal dependency | Default to async; only use sync when immediate response is genuinely required |

**EDA uniqueness:** The ONLY coupling dimension where Pub-Sub provides unique advantage over
point-to-point async is **topology coupling** — adding consumers without changing the publisher.
This benefit only materializes when you **do not control the event source**. For internal
systems where you control both sender and receiver, point-to-point async provides nearly identical
decoupling with less complexity.

**Hidden coupling warning:** Serverless appears topology-decoupled (logical ARNs, topic names) but
is often data-format coupled — changing message schema breaks all consumers simultaneously.
Topology decoupling without schema governance creates unmaintainable systems as they grow.

---

## Part 6: Cross-Cutting Patterns (Apply to All Relevant Scenarios)

These patterns apply across multiple scenarios and must be implemented consistently.

### Idempotent Receiver (Mandatory for all async flows)
- Every event-driven, webhook, CDC, and pub/sub flow MUST be idempotent
- Store processed message IDs in persistent Object Store with TTL
- Key: `${app.name}-${flow.name}-${messageId}`; TTL: 24 hours (adjust per business SLA)
- On duplicate: log at INFO, ack the message, skip processing — never throw an error
- **NOT needed for:** synchronous HTTP flows (caller retries are a new request with new correlationId)

### Claim Check (For large payloads > 1MB)
- **Problem:** Messaging infrastructure has payload size limits; large payloads slow message routing
- **Solution:** Store payload in S3/Azure Blob with a UUID key; put the UUID in the message; downstream retrieves via Content Enricher
- **When to use:** Any async flow where payload may exceed 1MB (documents, images, large XML files)
- **Key generation:** `${app.name}-${correlationId}-${uuid()}`
- **TTL:** Match to message TTL + processing buffer (e.g., if queue TTL = 30min, Object Store TTL = 45min)
- **MuleSoft:** `amazon-s3:put-object` to store; `amazon-s3:get-object` in downstream enrichment sub-flow

### Normalizer (For multi-source ingestion)
- **Problem:** Multiple external partners send the same business entity in different formats (X12, EDIFACT, JSON, CSV, proprietary XML)
- **Solution:** Content-Based Router detects format → routes to format-specific DataWeave transform → all produce the same canonical output
- **Format detection strategies (in priority order):**
  1. Explicit `Content-Type` header or file extension
  2. MQ message property set by sender/adapter
  3. XML root element or JSON top-level key inspection
  4. File naming convention (folder-based: `/inbound/partner-a/`, `/inbound/partner-b/`)
- **Output:** Always canonical model (same as Process API's data model)
- **MuleSoft:** Required for any b2b-edi or file-based-etl flow with multiple source formats

### Wire Tap (For non-intrusive monitoring)
- **Problem:** Need to inspect/log messages flowing through flows without disrupting primary processing
- **Solution:** Async publish a copy to a monitoring channel; primary flow continues unaffected
- **MuleSoft implementation:**
  ```xml
  <async doc:name="Wire Tap">
    <anypoint-mq:publish destination="${mq.queue.audit}" messageId="#[correlationId]">
      <anypoint-mq:body>#[output application/json --- { flow: flow.name, payload: payload, ts: now() as String }]</anypoint-mq:body>
    </anypoint-mq:publish>
  </async>
  ```
- **Use for:** Audit requirements; debugging specific message types in production; compliance logging
- **Never:** Use Wire Tap in the critical path (always `<async>`); never log full PII payloads

### Correlation Identifier (Generation Rules)
- **Generate a NEW correlationId when:**
  - Message arrives from an external system with no correlationId header
  - New business transaction originates in MuleSoft (scheduler trigger, file trigger)
  - B2B inbound transmission received (map partner's ISA control number to internal correlationId)
- **Propagate the EXISTING correlationId when:**
  - Message flows between MuleSoft applications in the same business transaction
  - MQ subscriber receives a message with correlationId in properties — preserve it
  - HTTP request contains `X-Correlation-Id` header — extract and set as MuleSoft correlationId
- **ConversationId vs. CorrelationId:**
  - `correlationId`: Identifies one specific message/request (narrow scope)
  - `conversationId`: Identifies a multi-step business process (wide scope — use for process-orchestration)
  - In MuleSoft: use `correlationId` for single-request tracking; add `conversationId` property for orchestrations

### Invalid Message Channel (Distinct from DLQ)
- **DLQ:** Message the system could not DELIVER after retries (infrastructure/connectivity failure)
- **Invalid Message Channel:** Message the system received but CANNOT PROCESS (validation failure, wrong format, missing required fields)
- **Never route validation failures to the DLQ** — DLQ implies "retry later," but an invalid message will always fail on retry
- **MuleSoft:** Create a separate `{domain}-validation-failure-queue` for Invalid Message Channel
- **Handling:** Write original payload + validation errors to the Invalid Message Channel; alert operations; do NOT retry

### Semantic Dissonance Documentation (Required in architecture.md)
- Every integration involving the same entity from multiple systems MUST document:
  - Which system is the **authority** for each attribute group
  - Known semantic differences (e.g., "NetSuite uses fiscal periods; Salesforce uses calendar months")
  - Conflict resolution rule (authority source wins; or latest-modified wins; or manual resolution required)
- **Template for architecture.md:**
  ```
  Entity: Customer
  Attributes and authorities:
    - Name, Address: Salesforce (CRM is master)
    - Credit Limit, Payment Terms: NetSuite (ERP is master)
    - Known conflict: NetSuite "Region" = US Census regions; Salesforce "Territory" = sales-defined regions
    - Conflict resolution: Keep both fields separate in canonical model; do not coerce
  ```

---

## Part 7: EDA Fit Assessment

Before recommending an event-driven or pub/sub pattern, verify it is warranted. EDA has a maintenance
cost that grows non-linearly as the number of event types and consumers grows.

**EDA IS the right choice when:**
- [ ] You do NOT control the event source (external SaaS, trading partner, third-party webhook)
- [ ] Multiple independent consumers need the same event and evolve at different rates
- [ ] Adding new consumers must not require publisher changes (topology decoupling genuinely needed)
- [ ] Guaranteed delivery despite consumer downtime is required
- [ ] Volume is high enough that synchronous fan-out would degrade publisher performance

**EDA is NOT worth the overhead when:**
- [ ] You control both publisher and all consumers (internal systems, same team)
- [ ] Only ONE consumer will ever exist for this event
- [ ] The event chain is short (2 hops) and both ends are always available
- [ ] Message ordering is critical and cannot be guaranteed by the broker

**If EDA criteria not met:** Use point-to-point async (event-driven scenario B with a single consumer)
or synchronous HTTP (request-reply scenario A). Both provide most EDA decoupling benefits without
the pub/sub overhead.

**Schema governance requirement for EDA:** Any project using pub/sub fan-out MUST maintain an
event catalog in `architecture.md` documenting: event name, schema version, producer, consumers, TTL,
and deprecation policy. Without this, the system becomes unmaintainable as it grows.

---

## Part 8: Obsolete Patterns — Do Not Implement

These EIP patterns were valid in 2003 but should not be implemented in new MuleSoft projects.
They appear here only for legacy migration and vocabulary.

| Pattern | Why Obsolete | Modern Alternative |
|---|---|---|
| **Shared Database integration** | Anti-pattern for decoupled systems; schema coupling | API-led (System APIs) + Canonical Data Model |
| **Presentation Integration (Screen Scraping)** | Fragile; vendor UI changes break it | Use vendor REST/SOAP API; or RPA tools for truly UI-only systems |
| **SOAP/WS-*** | Replaced by REST + JSON + OAuth2 | HTTP connector + OAS spec; keep SOAP/WSC only for legacy WSDL systems |
| **CORBA/DCOM/RMI** | Completely obsolete | REST, gRPC |
| **Proprietary MOM (MSMQ, custom)** | Vendor lock-in; replaced by cloud-native | Anypoint MQ, Kafka, Azure Service Bus |
| **Smart Proxy** | Over-engineered for modern systems | Use `correlationId` + `Return Address` header instead |
| **Two-Phase Commit (2PC)** | Kills availability in distributed systems | Write-off / Retry / Compensating Transaction (Starbucks framework) |
| **BizTalk Orchestration-style process engines** | Heavyweight; replaced by serverless orchestrators | MuleSoft Process API + Object Store; or AWS Step Functions for complex state |

---

## Part 9: What Changed Since EIP Was Written (2003 → 2026)

From Hohpe's own retrospective articles ("A Decade of EIP," "20 Years of Patterns' Impact"):

**Became MORE important:**
- Event-Driven Architecture (niche in 2003 → mainstream in 2026)
- Flow control and backpressure (not in original book → critical for cloud-native)
- Coupling as a multi-dimensional framework (binary then → 8-dimension now)
- API-First Design (SOAP then → REST/OAS/AsyncAPI now)
- Cost as an architectural driver (not a concern in 2003 → first-class in serverless)
- Idempotency (implied then → explicitly mandatory now due to at-least-once delivery)
- Schema governance and event catalogs (ignored then → critical for EDA maintenance now)

**Became LESS important / Obsolete:**
- SOAP/WS-* stack (BizTalk, ASP.NET Web Services, XSLT)
- Proprietary MOM (IBM MQ, MSMQ as primary options)
- Screen scraping (RPA tools handle this now)
- Distributed Object standards (CORBA, DCOM, RMI)
- XML as the universal integration format (JSON dominant; Avro/Protobuf for streaming)

**Changed meaning:**
- Channel Adapter (2003: custom code) → Connector marketplace (2026: Anypoint Exchange)
- Message Bus (2003: custom infrastructure) → Anypoint Platform with API management
- Process Manager (2003: BizTalk Orchestration) → Object Store + 202-polling + compensation flows
- Claim Check (2003: local DB) → S3/Azure Blob with presigned URLs

---

## Part 10: Judgment Guidelines for MuleSoft Architects

These are practical rules derived from the research for making judgment calls in the field:

1. **When a client says "we need real-time"** — ask if they mean sub-second response or sub-minute delivery. Sub-minute = event-driven is fine; only true sub-second = synchronous RPC.

2. **When a client says "we need loose coupling"** — identify WHICH coupling dimension matters. Temporal decoupling (no waiting) → async messaging. Topology decoupling (add consumers freely) → pub/sub only if you don't control the source.

3. **When a client proposes a process orchestration** — verify all three criteria: 3+ systems, rollback needed, long-running. If any is missing, downgrade to event-driven or request-reply.

4. **When designing error handling** — always start with write-off assessment. Is the error actually business-critical? Failed notifications, failed audit log writes, and failed enrichments are usually write-off.

5. **When multiple systems hold the same entity** — immediately document which is the semantic authority for each attribute group. Never assume same field name = same meaning.

6. **When recommending EDA** — check the EDA Fit Assessment checklist. Most internal system integrations don't need topology decoupling and should use simpler point-to-point async.

7. **When setting up queues** — always define: TTL, depth monitoring threshold, DLQ vs. Invalid Message Channel routing, and whether flow is push or pull.

8. **When a client uses shared database integration** — this is a migration opportunity, not an integration pattern to extend.

---

---

## Part 10: Modern Patterns Beyond EIP — 2024–2026 Additions

These patterns are not in the EIP 2003 catalog and were not materially covered by Hohpe's 2019–2022
ramblings. They emerged from microservices adoption, cloud-native data stacks, and AI/LLM integration.
Each has a dedicated scenario file in `standards/scenarios/`.

### 10A. Transactional Outbox (Scenario S)

**The problem it solves:** The dual-write problem — an application writes to its own DB AND must publish
an event to a message broker. These are two separate operations; either can fail independently, causing
silent data loss (DB write succeeds, event never published).

**The solution:** Application writes to an `outbox_events` table in the same DB transaction as its
domain write. MuleSoft polls this outbox table, publishes each row to MQ, and marks it as published.
The two-step sequence (atomic DB write → eventual MQ publish) guarantees at-least-once delivery without
distributed transactions.

**Why it is NOT in EIP:** EIP assumes the sender IS the message-oriented middleware or has a reliable
client library. The outbox pattern addresses the gap where the application is a non-MuleSoft service
that cannot reliably publish to a broker atomically with its own persistence.

**When to use vs. CDC (F):** Prefer CDC (Debezium/Kafka Connect) when you control the DB infrastructure
and can attach a log reader. Use Transactional Outbox when you don't control the infra or when CDC
adds too much operational complexity. The outbox pattern is simpler to operate: it just requires a
table and a scheduled poller.

**MuleSoft role:** Poller — scheduler + db:select on outbox table + anypoint-mq:publish + db:update.

**Key constraints:**
- `maxConcurrency=1` on the poller — must process rows in creation order; parallel polling causes duplicates
- Object Store idempotency check as duplicate guard (race condition between poll cycles)
- Never advance the watermark — outbox uses a `published_at IS NULL` filter, not a watermark
- Stalled rows (retry_count > maxRetries) are NOT moved to DLQ — they stay in the DB table for ops review

**See:** `standards/scenarios/transactional-outbox.md`

---

### 10B. Reverse ETL (Scenario T)

**The problem it solves:** Data warehouses and ML platforms generate enriched data (customer segments,
propensity scores, LTV predictions) that must flow back into operational systems (Salesforce, NetSuite,
Dynamics 365) so teams can act on it. Classic ETL moves data from operational → analytics; Reverse ETL
moves it back.

**Why it is NOT in EIP:** EIP assumes the message flow is operational-system-to-operational-system.
The data warehouse as a source of truth for enriched operational data is a post-2018 pattern driven by
the modern data stack (dbt, Snowflake, Databricks).

**Architectural distinction from ETL/batch:**
- Pattern E (file-based-ETL) and K (data-migration): operational → warehouse (forward direction)
- Pattern T (reverse-ETL): warehouse → operational (reverse direction)
- Pattern D (scheduled-sync): operational ↔ operational (lateral sync)
- T is the only pattern where a data warehouse is the **source** in MuleSoft

**Key constraints:**
- JDBC driver for Snowflake/Redshift/BigQuery cannot go in pom.xml — flagged as TODO in scaffold
- Always use **upsert** (not insert) at the operational system — idempotency by external ID
- Stale score guard: skip records where `score_date` > staleness threshold (broken model signal)
- Watermark must NOT advance if the batch fails — next run re-processes the failed window
- PII in ML scores: log aggregates only; never log individual scores with identifying fields

**MuleSoft role:** Batch processor — scheduler + db:select (warehouse) + transform + upsert (operational system).

**See:** `standards/scenarios/reverse-etl.md`

---

### 10C. AI Gateway (Scenario U)

**The problem it solves:** As multiple internal teams start using LLM APIs (OpenAI, Anthropic, AWS
Bedrock), AI traffic becomes ungoverned — no cost tracking, no rate limiting, no PII guardrails,
no model routing, and all API keys embedded in individual applications.

**The solution:** MuleSoft as a centralized AI proxy layer. All LLM calls from all applications route
through a single managed endpoint that enforces authentication, rate limits per team, PII redaction
before sending to external LLMs, model routing, and async audit logging.

**Why it is NOT in EIP:** EIP predates LLM APIs. The AI Gateway is a specialized variant of the
API Gateway / Message Router pattern, but with LLM-specific concerns: token-based cost tracking,
PII in prompt text, model version routing, and provider fallback.

**Relationship to P (ai-augmented-flow):** Pattern P describes calling an LLM from within a MuleSoft
flow. The AI Gateway (U) is the governed endpoint that P calls instead of calling the LLM API directly.
When a client has 3+ teams using AI, upgrade P calls to route through U.

**Key capabilities to implement:**
1. **Auth + caller identity:** client-id-enforcement; identify team/cost-center per call
2. **Rate limiting:** Object Store sliding window counter per app per hour
3. **PII redaction:** regex-based scan + redact before forwarding to external LLM
4. **Model routing:** normalize model names → route to correct provider config
5. **Provider-neutral internal API:** callers don't couple to OpenAI/Anthropic schemas
6. **Response normalization:** OpenAI and Anthropic have different response formats; gateway normalizes
7. **Async audit log:** prompt hash + token count + cost estimate → MQ audit queue (never log full prompt)
8. **Circuit breaker + fallback:** LLM provider timeout → try fallback provider or return 504

**Key constraints:**
- All LLM provider API keys MUST be in Secrets Manager — never in properties files
- Audit log failure is **write-off** — never let audit MQ publish failure break the primary LLM call
- PII redaction is MANDATORY before any external LLM call — compliance requirement for regulated clients
- Rate limit counter uses persistent Object Store with 1-hour TTL sliding window
- Response timeout must be explicit: LLM calls can take 30+ seconds; default HTTP timeout will fire

**MuleSoft role:** Synchronous proxy — http:listener → enrich/validate → http:request (LLM) → normalize → respond.

**See:** `standards/scenarios/ai-gateway.md`

---

### 10D. Notable Gaps (Documented, Not Implemented as Scenarios)

These patterns are real but either operate below MuleSoft's layer or are too infrastructure-specific
to warrant MuleSoft scenario files. Architects should be aware of them when clients raise them.

#### CQRS (Command Query Responsibility Segregation)
Separates write model (commands) from read model (queries) with eventual consistency via events.
MuleSoft's integration role: the event bus between the command side (writes) and the query side
(read model materialization) uses Patterns B or M. CQRS is an application architecture decision,
not an integration pattern MuleSoft implements. When a client uses CQRS, MuleSoft is the event relay
(patterns B, F, M) between the command and query sides.

#### Saga Choreography (vs. Orchestration)
Pattern H covers saga **orchestration** (central coordinator). Choreography sagas have no central
coordinator — each service reacts to events and publishes its own. MuleSoft's role in choreography
sagas is as one of the participants (event subscriber + publisher), not the coordinator. Use Pattern B
(event-driven) for each choreography saga step. Document the full saga event sequence in architecture.md.

#### Service Mesh (Istio/Linkerd)
Operates below MuleSoft at the Kubernetes pod networking layer. When `deployment=runtime-fabric` and
the client runs Istio: the service mesh handles mTLS, retry, and circuit-breaking at the network level.
**Do NOT duplicate these in MuleSoft flows** — it creates conflicting retry behavior. Document the
boundary: MuleSoft handles business-layer error handling; Istio handles network-layer reliability.

#### CloudEvents v1.0 (CNCF Standard)
Vendor-neutral event envelope standard with required fields: `specversion`, `id`, `source`, `type`.
When integrating with AWS EventBridge, Azure Event Grid, or GCP Pub/Sub, inbound events arrive in
CloudEvents format. Add a normalizer sub-flow (see Cross-Cutting: Normalizer) to strip the CloudEvents
envelope and extract the business payload before processing. Document the CloudEvents → canonical
mapping in architecture.md.

#### AsyncAPI 3.0
The OpenAPI equivalent for event-driven APIs — describes Kafka topics, MQ queues, WebSockets.
Currently not natively supported in Anypoint Design Center. Use AsyncAPI as the design-time spec
for async flows; publish the spec to Exchange manually or via CI/CD. This does not change flow
implementation — it changes documentation and governance.

---

*Research compiled: 2026-05-10*
*Updated: 2026-05-10 — Added Part 10 covering post-EIP patterns (Transactional Outbox, Reverse ETL, AI Gateway, CQRS/Choreography awareness, Service Mesh boundary, CloudEvents, AsyncAPI)*
*Sources: EIP canonical (Hohpe & Woolf, 2003, all 65 patterns), intpatt.pdf (Microsoft/Hohpe, 2004, full text), Ramblings articles (Hohpe, 2019–2022), Architecture & Governance survey, microservices.io, AWS/Azure prescriptive guidance, CNCF CloudEvents spec, AsyncAPI spec*
*Review annually — integration landscape evolves; EIP patterns are stable but implementation guidance changes*
