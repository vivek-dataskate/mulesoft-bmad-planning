# Story Template: Implement Flow (Per Flow)

**Story Type:** Per-Flow — Implementation
**Generated:** Once per entry in `decisions.json flows[]`
**Priority:** P0
**Standard:** `standards/DESIGN_STANDARDS.md`
**Scenario File:** `standards/scenarios/{pattern-letter}-{pattern-name}.md`
**Scaffold File:** `src/main/mule/{domain}-flows.xml`

---

## User Story

As a developer, I need the `{flow-name}` flow implemented in `{domain}-flows.xml` with correct layer placement, error handling, correlation ID propagation, and validation-before-downstream routing, so that the integration is standards-compliant and production-ready from the first commit.

---

## Acceptance Criteria

### Structure and Naming
- [ ] Flow exists in `src/main/mule/{domain}-flows.xml`, named `{action}-{entity}-flow` (kebab-case)
- [ ] API-Led layer: `{layer}` (system / process / experience) — matches `decisions.json flows[].layer`
- [ ] Only one logical flow group per `{domain}-flows.xml` file — no monolithic single-file project
- [ ] `global-error-handler` from `error-handler.xml` wired via `errorHandlerRef` — no per-flow error handler block duplicated

### Correlation ID
- [ ] `X-Correlation-ID` received on inbound request (HTTP header) or generated if absent (UUID)
- [ ] `correlationId` set as Mule `correlationId` (not as a variable) — propagates automatically through sub-flows
- [ ] `correlationId` propagated explicitly on MQ publish (set as `messageId`) — not lost at async boundary
- [ ] `X-Correlation-ID` set as outbound HTTP header on all downstream calls
- [ ] `correlationId` NEVER regenerated mid-flow, NEVER lost when crossing MQ or HTTP boundaries

### Logging
- [ ] Log at flow entry, pre-connector call, post-connector call, and exit
- [ ] Every log line includes: `correlationId`, `flowName`, `payloadSize`, `environment`
- [ ] Log levels: local/dev=DEBUG, uat=INFO, prod=WARN
- [ ] No PII, credentials, or raw payloads logged at INFO or above
- [ ] JSON log format for all non-local environments
- [ ] Wire logging (full HTTP payload): DEV / LOCAL only — never enabled in uat or prod

### Validation (MUST happen before any downstream call)
- [ ] All required field validations placed as the FIRST processing elements after the logger
- [ ] Validation failures → `on-error-continue` → route to `{domain}-invalid-messages-queue` (NOT DLQ)
- [ ] No downstream connector call ever made on a structurally invalid message

### Credentials and Config
- [ ] No credentials hardcoded — all from `${secrets.{key}}`
- [ ] No URLs hardcoded — all from `${config.{key}}` per-environment properties
- [ ] No queue names hardcoded — all from `${mq.queue.{name}}` properties

### DataWeave
- [ ] All DataWeave transforms > 10 lines in `src/main/resources/dwl/` — none inline in flow XML
- [ ] DWL file named: `{verb}-{source}-to-{target}.dwl`
- [ ] Reference: `<ee:transform doc:name="..."><ee:message><ee:set-payload resource="dwl/{verb}-{source}-to-{target}.dwl"/>`

### Open Items
- [ ] All Open Items from `architecture.md → Flow: {flow-name} → Open Items` section listed below
- [ ] Developer confirms each Open Item with client BEFORE coding the affected section
- [ ] Open Items not yet confirmed become `// TODO [OPEN ITEM]` in DWL — not guessed logic in flow XML

---

## Pattern-Specific Acceptance Criteria

Include the rows that match this flow's pattern from `decisions.json integration.primaryPattern`:

| Applies When | AC |
|--------------|-----|
| Any async MQ consumer (B, C, F, J, M, N) | **Idempotency check at flow entry:** Object Store persistent, key=`{prefix}-${attributes.messageId}`, TTL=`{messageTtlHours × 60}` minutes. ACK + skip on duplicate. |
| Any async MQ consumer | **MANUAL ack mode** on `anypoint-mq:subscriber` — `ACK` only after successful processing |
| Any async MQ consumer | `maxConcurrency` set on subscriber per `decisions.json flowControl.maxConcurrency` |
| Payload may exceed 1MB (any pattern) | **Claim Check:** write payload to `{S3/Blob}` (key=`correlationId`), publish token to MQ, consumer retrieves full payload, **deletes from store after processing** |
| D — scheduled-sync | Watermark using **persistent** Object Store (not in-memory). Watermark field: last-modified timestamp or sequence ID. `scheduling.watermarking=true` in decisions.json. |
| G — b2b-edi | Partner registry consulted. EDI envelope validated before processing. ACK/NACK sent to trading partner. EDIFACT/X12 doc per agreed transaction set. |
| H — process-orchestration | Returns **202 Accepted** immediately with `jobId`. Saga state stored in Object Store (persistent). Status polling endpoint at `GET /jobs/{jobId}`. Compensating transaction flows defined for each saga step. |
| I — api-aggregation | `scatter-gather` with individual timeout per leg. One leg failure does NOT fail the aggregate — partial response with error detail per failing leg. |
| K — data-migration | Resumable checkpoint stored in Object Store. Idempotent upserts (not blind inserts). Audit log of records migrated per run. |
| L — streaming-pipeline | High-throughput consumer: `maxConcurrency` tuned per downstream system capacity. Backpressure monitoring active. |
| Q — rag-data-pipeline | Chunk + embed + upsert pipeline. Embedding model + vector store index configured (see global-ai-provider story). Delete stale embeddings when source document is updated. |
| R — agentic-mcp-integration | MuleSoft exposes operations as tools (OpenAPI spec or MCP manifest). Input validation strict — agent may send unexpected parameter combinations. |
| `security.level = regulated or government` | mTLS configured at Flex Gateway level. JWT validation policy applied. PII fields: decryption only in System API. See `global-field-encryption` story for field list. |
| `aiIntegration.enabled = true` | AI call wrapped in `on-error-continue`. Fallback behavior active on timeout. AI response validated before use in downstream call. |

---

## Open Items for This Flow
*(PM agent copies from architecture.md → Flow: {flow-name} → Open Items)*

- [ ] OPEN ITEM: {question} — best guess: {value} — confirm with client before coding

---

## Implementation Notes

- Read `standards/scenarios/{scenario}.md` BEFORE implementing — it contains the reference architecture, XML patterns, and error handling rules specific to this pattern
- Reference: `standards/DESIGN_STANDARDS.md → Naming`, `→ Error Handling`, `→ Logging`
- Scaffold generates flow XML stub with TODO comments — developer fills in connector operations and transform references
