# Scenario: Pub/Sub Fan-Out (Broadcast)

> **Pattern:** `pubsub-fanout`
> **Trigger:** Internal system event, MQ publish, or Kafka topic message
> **Latency target:** < 5 seconds per consumer leg (total delivery across all consumers)
> **Volume:** Medium (event rate determines fan-out load; each event multiplied by consumer count)

---

## When to Use This Pattern

- One event must be delivered to 2+ independent consumers that each do different things with it
- Consumers are decoupled — they evolve independently; publisher doesn't know about them
- Adding a new consumer must not require changes to the publisher
- Guaranteed delivery to each consumer independently (one consumer failing doesn't affect others)
- Domain events in event-driven architecture: OrderPlaced, InvoicePaid, UserProvisioned

**Distinguish from event-driven:** Event-driven (1-to-1) — one event → one consumer process.
Pub/Sub fan-out — one event → N consumer processes, each independent.

**Distinguish from process-orchestration:** Orchestration is one process coordinating multiple steps.
Fan-out is parallel, independent, autonomous consumption — no coordinator.

**Distinguish from streaming-pipeline:** Streaming pipeline is high-throughput analytics. Fan-out is
medium-volume domain event distribution between operational systems.

**Do not use** for: sequential multi-step workflows (use process-orchestration), point-to-point single
consumer (use event-driven), high-throughput analytics (use streaming-pipeline).

---

## Reference Architecture

### Anypoint MQ Message Exchange (Fan-Out)

```
Publisher (any MuleSoft flow)
  ├── Publishes event to: Anypoint MQ Exchange: {domain}-{event}-exchange
        │
        │  Anypoint MQ automatically delivers to all bound queues
        │
   ┌────┼────────────┐
   ▼    ▼            ▼
Queue A  Queue B   Queue C      ← one queue per consumer domain
   │       │          │
Proc A  Proc B     Proc C       ← independent consumer apps/flows
  (ERP)  (CRM)   (Notification) ← each acks independently
```

### Kafka Topic Fan-Out (Consumer Groups)

```
Producer publishes to: Kafka topic: {domain}.{event}
        │
   ┌────┼───────────┐
   ▼    ▼           ▼
Group A  Group B  Group C       ← independent consumer groups
  │        │         │
App A    App B     App C        ← each reads full stream independently
```

---

## EDA Fit Assessment

Before finalising this pattern, run the EDA fit checklist from `docs/PLANNING_CONTEXT.md → EDA FIT ASSESSMENT`.

Key questions for pub/sub fan-out:
- Will new consumers be added over time without publisher changes? → YES = pubsub-fanout is warranted; this is the core value
- Do publisher and consumer teams evolve independently? → YES = EDA warranted
- Is each consumer guaranteed independent delivery? → YES = Anypoint MQ Exchange (one queue per consumer) or Kafka consumer groups
- Is throughput > 100K events/day OR consumers > 10? → YES = Kafka required; NO = Anypoint MQ Exchange is sufficient
- Does the consumer need to replay events? → YES = Kafka required

**Anti-pattern check:** If you control both publisher and consumer and have exactly one consumer,
use `event-driven` (1-to-1) not pubsub-fanout — the topology decoupling adds cost with no benefit.

---

## decisions.json Defaults

```json
{
  "integration": {
    "integrationStyle": "messaging",
    "primaryPattern": "pubsub-fanout",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "under-3s",
    "frequency": "triggered",
    "volume": "medium"
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "compensationStrategy": "retry",
    "maxRetries": 5,
    "backoff": "exponential",
    "dlq": true,
    "invalidMessageChannel": true,
    "invalidMessageChannelName": "{consumer-domain}-invalid-messages-queue",
    "errorEnvelope": true
  },
  "flowControl": {
    "direction": "push",
    "messageTtlHours": 24,
    "maxConcurrency": 4,
    "backpressureEnabled": true,
    "deduplicationEnabled": true,
    "deduplicationTtlMinutes": 1440
  },
  "systems": {
    "connectors": ["anypoint-mq"]
  },
  "devops": {
    "munitCoverage": 75
  }
}
```

---

## Broker Selection: Anypoint MQ Exchange vs Kafka

| Criterion | Anypoint MQ Exchange | Kafka Topic |
|-----------|---------------------|------------|
| Max consumers | ~20 (one queue per consumer) | Unlimited (consumer groups) |
| Message retention | 14 days (configurable) | Configurable (days to forever) |
| Replay capability | No (consumed message gone) | Yes (rewind to any offset) |
| Setup complexity | Low — no Kafka ops | Higher — Kafka cluster required |
| Throughput | Moderate (< 100K/day per exchange) | Very high (millions/day) |
| Use when | < 10 consumers; Anypoint-native | > 10 consumers; replay needed; > 100K/day |

Default: **Anypoint MQ Exchange** for MuleSoft-native projects.
Use Kafka when replay, high throughput, or > 10 consumers are required.

---

## Flow Structure

### Publisher Flow (sends to exchange)

```xml
<sub-flow name="publish-{domain}-{event}-event-subflow">
  <!-- Build canonical event envelope -->
  <ee:transform>
    <ee:message>
      <ee:set-payload><![CDATA[%dw 2.0
        output application/json
        ---
        {
          eventId:       uuid(),
          eventType:     "{domain}.{event}",
          source:        "${app.name}",
          occurredAt:    now() as String,
          correlationId: correlationId,
          data:          payload
        }]]>
      </ee:set-payload>
    </ee:message>
  </ee:transform>

  <!-- Publish to exchange — MQ delivers to all bound queues -->
  <anypoint-mq:publish
    config-ref="Anypoint_MQ_Config"
    destination="${mq.exchange.{domain}.{event}}"
    messageId="#[payload.eventId]"/>
</sub-flow>
```

### Consumer Flow (one per consumer domain)

```xml
<!-- {consumer-a}-proc-api: consumes {domain}-{event}-queue-a -->
<flow name="mq-consume-{domain}-{event}-{consumer-a}-flow">
  <anypoint-mq:subscriber
    config-ref="Anypoint_MQ_Config"
    destination="${mq.queue.{domain}.{event}.{consumer-a}}"
    acknowledgementMode="MANUAL"
    maxConcurrency="4"/>

  <!-- 1. Idempotency check -->
  <os:retrieve
    key="#['{consumer-a}-' ++ attributes.messageId]"
    target="alreadyProcessed"
    objectStore="persistent-store"/>

  <choice>
    <when expression="#[vars.alreadyProcessed != null]">
      <logger level="INFO" message="Duplicate event — skipping"/>
      <anypoint-mq:ack messageId="#[attributes.messageId]"/>
    </when>
    <otherwise>
      <!-- 2. {consumer-a}-specific processing -->
      <flow-ref name="{consumer-a}-handle-{domain}-{event}-flow"/>

      <!-- 3. Mark processed -->
      <os:store
        key="#['{consumer-a}-' ++ attributes.messageId]"
        value="#[now() as String]"
        objectStore="persistent-store"
        entryTtl="24"
        entryTtlUnit="HOURS"/>

      <anypoint-mq:ack messageId="#[attributes.messageId]"/>
    </otherwise>
  </choice>

  <error-handler ref="global-error-handler"/>
</flow>
```

---

## Event Envelope Standard

All fan-out events must use a canonical envelope. Never publish raw payloads:

```json
{
  "eventId":       "uuid-v4",
  "eventType":     "orders.placed",
  "source":        "orders-proc-api",
  "occurredAt":    "2026-05-10T14:32:00Z",
  "correlationId": "req-abc123",
  "schemaVersion": "1.0",
  "data": {
    /* domain-specific payload */
  }
}
```

- `eventId` is the idempotency key for all consumers
- `eventType` format: `{domain}.{verb-past-tense}` (e.g., `orders.placed`, `invoices.paid`)
- `schemaVersion` must be incremented on breaking changes
- Consumers must ignore unknown fields (forward compatibility)

---

## Consumer Independence

Consumers are fully autonomous — publisher has no knowledge of who consumes events.

Rules:
1. Publisher never waits for or checks consumer outcomes
2. Adding a new consumer = bind new queue to exchange (no publisher change)
3. Removing a consumer = unbind queue from exchange (no publisher change)
4. Consumer failure does not affect publisher or other consumers
5. Each consumer has its own DLQ (`{queue-name}-dlq`)

Document consumer registry in `architecture.md`:

| Event | Queue | Consumer App | Owner |
|-------|-------|-------------|-------|
| orders.placed | orders-placed-erp-queue | erp-proc-api | ERP team |
| orders.placed | orders-placed-crm-queue | crm-proc-api | CRM team |
| orders.placed | orders-placed-notify-queue | notification-proc-api | Ops team |

---

## Schema Evolution

When event payload structure must change:
- **Additive changes** (new optional fields): publish new version alongside old; consumers
  upgrade at their own pace
- **Breaking changes**: publish to new topic/exchange (`{event}.v2`); migrate consumers;
  deprecate old topic with sunset date
- Never remove fields from existing events without a migration period

---

## Ordering Considerations

Anypoint MQ Exchange does not guarantee delivery order across queues. If consumers need
ordered delivery:
- Use Kafka with partition key = entity ID (ordered per partition, per consumer group)
- Or include a sequence number in the event envelope and handle ordering in the consumer

---

## Error Handling

Strategy: **retry-then-dlq** (per consumer; independent)

| Failure | Consumer A action | Effect on Consumer B |
|---------|------------------|---------------------|
| Consumer A target unavailable | Retry → DLQ | No effect — B continues |
| Consumer A DLQ full | Alert Consumer A team | No effect — B continues |
| Malformed event | Consumer A → DLQ | Consumer B → DLQ (same bad event) |
| Exchange publish failure | Publisher retries; event not delivered to any consumer | |

---

## Anypoint MQ Exchange Setup

Define exchanges and queue bindings in `decisions.json` or `architecture.md`:

```json
{
  "exchange": "{domain}-{event}-exchange",
  "boundQueues": [
    "{domain}-{event}-{consumer-a}-queue",
    "{domain}-{event}-{consumer-b}-queue",
    "{domain}-{event}-{consumer-a}-queue-dlq",
    "{domain}-{event}-{consumer-b}-queue-dlq"
  ]
}
```

Queues must be created before the application starts. Include queue/exchange provisioning in
the CI/CD pipeline or document as a manual pre-deployment step.

---

## MUnit Test Coverage

Each consumer flow must have tests for:
- [ ] Happy path — event received → consumer-specific processing executed
- [ ] Duplicate event (same eventId) — idempotency check fires; processing skipped
- [ ] Consumer target system unavailable — retry fires; DLQ populated; no effect on other consumers
- [ ] Malformed event envelope — DLQ populated; no exception propagates
- [ ] Publisher publishes to exchange — verify event reaches all bound queues (integration test)

---

## Example Project

**Client:** Order management — OrderPlaced event → ERP (create SO), CRM (update pipeline),
Notification service (send customer email)
**Flows:** `publish-orders-placed-event-subflow`,
          `mq-consume-orders-placed-erp-flow`,
          `mq-consume-orders-placed-crm-flow`,
          `mq-consume-orders-placed-notify-flow`
**Connectors:** `anypoint-mq`, `netsuite`, `salesforce`, `email`
**Security tier:** internal
**Deployment:** CloudHub 2.0 — each consumer app: 0.2 vCores × 2 replicas
