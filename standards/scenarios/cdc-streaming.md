# Scenario: Change Data Capture (CDC) Streaming

> **Pattern:** `cdc-streaming`
> **Trigger:** Database/platform change feed — row insert/update/delete events
> **Latency target:** < 5 seconds (near-real-time; not synchronous)
> **Volume:** Medium–high (continuous stream; volume proportional to source change rate)

---

## When to Use This Pattern

- Source system changes (inserts, updates, deletes) must propagate downstream in near-real-time
- No event API on the source — only a database or changelog is available
- Salesforce Platform Events / Streaming API for CRM change propagation
- Database row-level change streaming to messaging backbone (Debezium → Kafka → MuleSoft)
- Audit trail requirements: every state change must be captured and forwarded

**Distinguish from event-driven:** Event-driven uses a message broker that the source explicitly
publishes to. CDC captures changes at the data layer without requiring the source app to publish.

**Distinguish from scheduled-sync:** Scheduled-sync polls periodically. CDC is push-based — changes
arrive the moment they happen. Use CDC when latency of minutes is unacceptable.

**Do not use** for: batch historical loads, scenarios where the source has a proper event API, or
when the source database does not support change feeds or binlog access.

---

## Reference Architecture

### Salesforce CDC

```
Salesforce (object changed)
        │  Platform Event / CDC topic
        ▼
{domain}-proc-api
  ├── salesforce:replay-channel-listener
  ├── Extract change type (CREATE/UPDATE/DELETE)
  ├── Transform changed fields to canonical model
  ├── Route by change type
  └── Call target sys-api(s)
        │
        ▼
{target-system}-sys-api
```

### Database CDC via Kafka (Debezium)

```
Source DB (MySQL / PG / Oracle)
        │  Debezium connector → Kafka topic
        ▼
Kafka (topic: dbserver1.schema.table)
        │  Kafka consumer
        ▼
{domain}-proc-api
  ├── Parse Debezium envelope (before/after images)
  ├── Extract op type (c/u/d/r)
  ├── Transform to canonical model
  └── Call target sys-api
        │
        ▼
{target-system}-sys-api
```

### Database Polling CDC (no Kafka — watermark-based)

```
Source DB
        │  DB connector poll (SELECT where lastModified > watermark)
        ▼
{domain}-proc-api
  ├── Scheduler (high-frequency: every 30s–2min)
  ├── Read watermark from Object Store
  ├── Query changed rows since watermark
  ├── foreach → transform + forward
  └── Advance watermark on success
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "primaryPattern": "cdc-streaming",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "under-3s",
    "frequency": "triggered",
    "volume": "medium"
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "maxRetries": 5,
    "backoff": "fixed",
    "dlq": true,
    "errorEnvelope": true
  },
  "systems": {
    "connectors": ["salesforce"]
  },
  "scheduling": {
    "required": false,
    "watermarking": true,
    "objectStore": "persistent"
  },
  "devops": {
    "munitCoverage": 75
  }
}
```

---

## Flow Structure

### Salesforce CDC Listener

```xml
<flow name="salesforce-cdc-listen-{object}-flow">
  <salesforce:replay-channel-listener
    config-ref="Salesforce_Config"
    channel="/data/{ObjectName}ChangeEvent"
    replayOption="LATEST">
    <!-- Use LATEST for new deployments; use replayId for resumable replay -->
  </salesforce:replay-channel-listener>

  <!-- Extract change type from CDC envelope -->
  <set-variable variableName="changeType"
    value="#[payload.ChangeEventHeader.changeType]"/>

  <!-- Route by change type -->
  <choice>
    <when expression="#[vars.changeType == 'CREATE' or vars.changeType == 'UPDATE']">
      <flow-ref name="process-{object}-upsert-flow"/>
    </when>
    <when expression="#[vars.changeType == 'DELETE']">
      <flow-ref name="process-{object}-delete-flow"/>
    </when>
  </choice>

  <error-handler ref="global-error-handler"/>
</flow>
```

### Kafka CDC Consumer (Debezium envelope)

```xml
<flow name="kafka-cdc-consume-{object}-flow">
  <kafka:consumer
    config-ref="Kafka_Consumer_Config"
    topic="${kafka.topic.{object}.cdc}"
    groupId="${kafka.groupId}"/>

  <!-- Debezium envelope: op = c (create), u (update), d (delete), r (read/snapshot) -->
  <set-variable variableName="op" value="#[payload.op]"/>
  <set-variable variableName="before" value="#[payload.before]"/>
  <set-variable variableName="after" value="#[payload.after default payload.before]"/>

  <choice>
    <when expression="#[vars.op == 'c' or vars.op == 'u' or vars.op == 'r']">
      <flow-ref name="process-{object}-upsert-flow"/>
    </when>
    <when expression="#[vars.op == 'd']">
      <flow-ref name="process-{object}-delete-flow"/>
    </when>
  </choice>

  <error-handler ref="global-error-handler"/>
</flow>
```

---

## Replay / Resume Strategy

| Broker | Resume mechanism | Configuration |
|--------|-----------------|---------------|
| Salesforce Platform Events | `replayId` stored in Object Store | Use `STORED` replay option; update after each successful event |
| Kafka | Consumer group offsets | Kafka manages offsets; commit after successful processing |
| Database polling | Watermark in Object Store | Advance only after confirmed target write |

**Salesforce replayId persistence:**
```dataweave
// Store after each successful event
"${app.name}-salesforce-{object}-replayId"
// Value: attributes.replayId as String
```

---

## Idempotency

CDC events may be delivered more than once (at-least-once guarantee). All CDC flows must be idempotent:
- Natural key: use source system record ID (e.g., Salesforce ID, DB primary key)
- Object Store check: `"${app.name}-cdc-{object}-" ++ recordId` with TTL = 1 hour
- On duplicate: log at DEBUG, skip processing, ack/commit the message

---

## Handling Deletes

Downstream systems handle deletes differently. Document the delete strategy in `architecture.md`:

| Strategy | When to use |
|----------|------------|
| Hard delete on target | Target supports it; data lifecycle is coupled |
| Soft delete (set isDeleted = true) | Audit requirements; target may reference the record |
| Archive to separate store | Regulatory retention requirements |
| Publish tombstone event | Fan-out; let consumers decide what to do |

---

## Error Handling

Strategy: **retry-then-dlq**

| Failure | Action |
|---------|--------|
| Malformed CDC envelope | NACK → DLQ immediately (no retry) |
| Target system connectivity | Retry 5× fixed 2s, then NACK → DLQ |
| Target business reject | NACK → DLQ with error envelope |
| replayId store failure | Log WARN; continue (will replay from LATEST on restart) |

DLQ message must carry: original CDC payload + change type + source record ID + error envelope.

---

## Ordering Considerations

CDC events for the same record must be processed in order. Violations corrupt target data.

| Broker | Ordering guarantee | Mitigation |
|--------|-------------------|-----------|
| Salesforce Platform Events | No strict FIFO | Use sequence number in CDC envelope; detect out-of-order |
| Kafka | Ordered per partition | Partition by record ID (same key → same partition) |
| DB polling | Ordered by `lastModified` | Risk: same-second updates may be missed — use `id >=` fallback |

---

## MUnit Test Coverage

Each CDC flow must have tests for:
- [ ] CREATE event — record created on target
- [ ] UPDATE event — record updated on target (correct fields only)
- [ ] DELETE event — correct delete strategy applied on target
- [ ] Duplicate event (idempotency check) — skipped, not reprocessed
- [ ] Malformed CDC envelope — routed to DLQ, no exception bubbles
- [ ] Target system unavailable — retry fires; event lands in DLQ on exhaustion

---

## Example Project

**Client:** Salesforce Opportunity CDC → NetSuite revenue recognition trigger
**Flows:** `salesforce-cdc-listen-opportunity-flow`, `process-opportunity-upsert-flow`
**Connectors:** `salesforce`, `netsuite`, `anypoint-mq` (DLQ)
**Security tier:** internal
**Deployment:** CloudHub 2.0, 0.2 vCores × 2 replicas
