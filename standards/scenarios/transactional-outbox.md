# Scenario: Transactional Outbox

> **Pattern:** `transactional-outbox`
> **Trigger:** DB poll (scheduler + watermark on outbox table)
> **Latency target:** Near-real-time (seconds to minutes lag acceptable)
> **Volume:** Low–high (matches the application's transaction rate)

---

## When to Use This Pattern

- A microservice writes to its own database AND must publish an event to a message broker,
  but cannot guarantee both succeed atomically in a single operation
- You have seen silent message loss: the app writes to DB successfully but the broker publish
  fails — downstream consumers never see the event
- A client is migrating from a monolith to microservices and needs guaranteed event delivery
  without introducing distributed transactions (2PC)
- The source application is not MuleSoft — it is a Java/Node/.NET service that writes
  to a relational DB and needs a reliable event publishing side-car
- Pattern H (process-orchestration) requires saga compensation but the triggering application
  cannot be modified to publish events directly

**Do not use** when: MuleSoft is both the DB writer AND the event publisher in the same flow
(use event-driven B or cdc-streaming F instead — the outbox table is only needed when the
application writing to DB is NOT MuleSoft). Also do not use when CDC (F) via Debezium or
Kafka Connect is already in place — that already solves the dual-write problem at the DB level.

---

## The Dual-Write Problem

This pattern solves a fundamental distributed systems problem:

```
WITHOUT Transactional Outbox — two separate operations can fail independently:
  Application writes order to orders table  ← succeeds
  Application publishes "order-created" to MQ ← FAILS (network, broker down)
  Result: order exists in DB; downstream never knows

WITH Transactional Outbox — single atomic DB transaction:
  Application writes order to orders table   │ Single DB
  Application writes event to outbox table   │ transaction
  ↓
  MuleSoft polls outbox table (separate process)
  MuleSoft publishes event to MQ
  MuleSoft marks outbox row as published
  Result: guaranteed — if order is in DB, event will eventually be published
```

---

## Reference Architecture

```
Application DB
  ├── orders (or any domain table)          ← application writes here
  └── outbox_events                         ← application writes here IN SAME TRANSACTION
        columns: id, event_type, aggregate_id, payload (JSON),
                 created_at, published_at (NULL = unpublished), retry_count

MuleSoft Outbox Poller
  ├── Scheduler (every 5–30 seconds)
  │     ↓
  ├── SELECT unpublished rows (published_at IS NULL ORDER BY created_at ASC LIMIT 50)
  │     ↓
  ├── For each row:
  │     ├── Publish event to Anypoint MQ / Kafka
  │     ├── On success: UPDATE outbox_events SET published_at = NOW() WHERE id = row.id
  │     └── On failure: UPDATE retry_count = retry_count + 1 (retry up to maxRetries)
  │
  └── Dead-letter: rows with retry_count > maxRetries → alert ops + manual review

MQ / Kafka Topic → Downstream consumers (existing event-driven pattern B or pubsub-fanout M)
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "integrationStyle": "messaging",
    "primaryPattern": "transactional-outbox",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "async-ok",
    "frequency": "scheduled",
    "volume": "medium"
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "compensationStrategy": "retry",
    "maxRetries": 3,
    "backoff": "exponential",
    "dlq": true,
    "invalidMessageChannel": false,
    "errorEnvelope": true
  },
  "flowControl": {
    "direction": "pull",
    "messageTtlHours": 24,
    "maxConcurrency": 1,
    "backpressureEnabled": false,
    "deduplicationEnabled": true,
    "deduplicationTtlMinutes": 1440
  },
  "scheduling": {
    "required": true,
    "type": "fixed-frequency",
    "watermarking": false,
    "objectStore": "persistent"
  },
  "devops": {
    "munitCoverage": 80
  }
}
```

**Note on maxConcurrency=1:** The outbox poller must process rows sequentially and in order.
Do NOT set maxConcurrency > 1 — parallel publishing of the same outbox table causes duplicate
events and order violations. If throughput is insufficient, reduce the poll interval instead.

---

## Outbox Table Schema (Reference DDL)

```sql
CREATE TABLE outbox_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type     VARCHAR(100) NOT NULL,       -- e.g. 'order.created', 'payment.processed'
  aggregate_id   VARCHAR(100) NOT NULL,       -- the business key (orderId, customerId)
  aggregate_type VARCHAR(100) NOT NULL,       -- e.g. 'Order', 'Payment'
  payload        JSONB NOT NULL,              -- full event payload
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  published_at   TIMESTAMP,                  -- NULL = not yet published
  retry_count    INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT                        -- last failure message for ops review
);

-- Index for efficient poller queries
CREATE INDEX idx_outbox_unpublished ON outbox_events (created_at ASC)
  WHERE published_at IS NULL;
```

---

## Flow Structure

### Outbox Poller Flow

```xml
<flow name="scheduler-outbox-poll-{domain}-flow">
  <scheduler doc:name="Outbox Poll Scheduler">
    <scheduling-strategy>
      <fixed-frequency frequency="${outbox.poll.interval.ms}" timeUnit="MILLISECONDS"/>
    </scheduling-strategy>
  </scheduler>

  <!-- Poll up to batchSize unpublished rows in creation order -->
  <db:select config-ref="Database_Config" doc:name="Fetch Unpublished Events">
    <db:sql><![CDATA[
      SELECT id, event_type, aggregate_id, aggregate_type, payload, created_at
      FROM outbox_events
      WHERE published_at IS NULL
        AND retry_count < :maxRetries
      ORDER BY created_at ASC
      LIMIT :batchSize
    ]]></db:sql>
    <db:input-parameters><![CDATA[#[{
      maxRetries: ${outbox.max.retries},
      batchSize:  ${outbox.batch.size}
    }]]]></db:input-parameters>
  </db:select>

  <!-- Process each row sequentially -->
  <foreach collection="#[payload]" doc:name="Process Each Outbox Row">
    <try doc:name="Publish With Error Isolation">
      <flow-ref name="publish-outbox-event-subflow"/>
      <error-handler>
        <on-error-continue type="ANY">
          <!-- Increment retry count; do not stop pipeline -->
          <db:update config-ref="Database_Config" doc:name="Increment Retry Count">
            <db:sql><![CDATA[
              UPDATE outbox_events
              SET retry_count = retry_count + 1,
                  last_error  = :error
              WHERE id = :id
            ]]></db:sql>
            <db:input-parameters><![CDATA[#[{
              id:    payload.id,
              error: error.description
            }]]]></db:input-parameters>
          </db:update>
          <logger level="WARN"
            message="#['Outbox publish failed for id=' ++ payload.id ++ ': ' ++ error.description]"/>
        </on-error-continue>
      </error-handler>
    </try>
  </foreach>

  <error-handler ref="global-error-handler"/>
</flow>
```

### Publish Outbox Event Sub-flow

```xml
<sub-flow name="publish-outbox-event-subflow">
  <!-- Idempotency check: skip if already published (race condition guard) -->
  <os:retrieve key="#['outbox-published-' ++ payload.id]"
    target="alreadyPublished" defaultValue="false"
    objectStore="persistent-store" doc:name="Idempotency Check"/>

  <choice doc:name="Skip If Duplicate">
    <when expression="#[vars.alreadyPublished == true]">
      <logger level="INFO"
        message="#['Outbox row ' ++ payload.id ++ ' already published — skipping']"/>
    </when>
    <otherwise>
      <!-- Publish to Anypoint MQ; set event_type as message property for routing -->
      <anypoint-mq:publish config-ref="Anypoint_MQ_Config"
        destination="${mq.exchange.{domain}}"
        messageId="#[payload.id]"
        doc:name="Publish Event to MQ">
        <anypoint-mq:body>#[output application/json --- payload.payload]</anypoint-mq:body>
        <anypoint-mq:properties><![CDATA[#[{
          eventType:     payload.event_type,
          aggregateId:   payload.aggregate_id,
          aggregateType: payload.aggregate_type,
          outboxId:      payload.id as String,
          correlationId: correlationId
        }]]]></anypoint-mq:properties>
      </anypoint-mq:publish>

      <!-- Mark as published in DB -->
      <db:update config-ref="Database_Config" doc:name="Mark Published">
        <db:sql><![CDATA[
          UPDATE outbox_events SET published_at = NOW() WHERE id = :id
        ]]></db:sql>
        <db:input-parameters>#[{ id: payload.id }]</db:input-parameters>
      </db:update>

      <!-- Record in Object Store for idempotency TTL -->
      <os:store key="#['outbox-published-' ++ payload.id]"
        value="true" ttl="${outbox.dedup.ttl.minutes}" ttlUnit="MINUTES"
        objectStore="persistent-store" doc:name="Record Published"/>
    </otherwise>
  </choice>
</sub-flow>
```

---

## Property Defaults (per environment)

```yaml
# In {env}.yaml
outbox.poll.interval.ms: 10000        # poll every 10 seconds
outbox.batch.size: 50                 # rows per poll
outbox.max.retries: 3                 # rows beyond this are stalled — alert ops
outbox.dedup.ttl.minutes: 1440        # 24h — matches standard message TTL
mq.exchange.{domain}: "{domain}-events-{env}-exchange"
```

---

## Dead-Letter Rows (Stalled Events)

Rows that exceed `retry_count >= maxRetries` are stalled events — not retried, not published.
Set up a separate monitoring query (or Anypoint Monitoring custom metric) to alert ops:

```sql
-- Alert if this returns > 0 rows
SELECT COUNT(*) FROM outbox_events
WHERE published_at IS NULL AND retry_count >= 3;
```

Ops must investigate `last_error` column per row. Common causes:
- Broken event payload (app bug) — fix at source; manually reset retry_count to republish
- MQ credential/configuration issue — fix config; reset retry_count
- Schema mismatch between outbox payload and consumer expectation — schema governance issue

---

## Relationship to Other Patterns

| Pattern | Relationship |
|---------|-------------|
| **F (cdc-streaming)** | Alternative if Debezium/Kafka Connect available — log-based CDC reads the DB write log directly, no outbox table needed. Prefer CDC when you control the DB infrastructure. Use outbox when you don't. |
| **B (event-driven)** | What the downstream consumers use — outbox publishes to MQ; consumers use B |
| **H (process-orchestration)** | Outbox is often the trigger — saga starts when the first event appears on the MQ |
| **M (pubsub-fanout)** | If the outbox event needs N consumers, publish to an Exchange (fanout) not a Queue |

---

## Error Handling

Strategy: **retry-then-stall** (not DLQ — outbox rows stay in the DB table)

| Failure | Action |
|---------|--------|
| MQ publish fails (transient) | Increment retry_count; try again next poll cycle |
| MQ publish fails (permanent) | At maxRetries: set stalled state; alert ops; never drop the row |
| DB update (mark published) fails | Log WARN; the row will be re-polled next cycle and re-published — idempotency check prevents duplicate event |
| Poller crashes mid-batch | Unpublished rows remain in DB; next poll cycle resumes from the beginning |

---

## MUnit Test Coverage

- [ ] Happy path — unpublished row → publish to MQ → marked as published in DB
- [ ] MQ publish fails — retry_count incremented; row NOT marked published; pipeline continues
- [ ] Row with retry_count >= maxRetries — skipped by SELECT query
- [ ] Duplicate guard — if row somehow re-polled after publish, idempotency check skips it
- [ ] Empty outbox table — no error; scheduler exits cleanly
- [ ] DB mark-published fails — warning logged; row re-published on next poll (idempotent)
