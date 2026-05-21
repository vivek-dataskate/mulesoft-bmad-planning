# Scenario: Event-Driven Integration

> **Pattern:** `event-driven`  
> **Trigger:** Message broker (Anypoint MQ, Kafka) or Salesforce Platform Event / CDC  
> **Latency target:** < 5 seconds from publish to consume  
> **Volume:** Medium–high (steady stream of events)

---

## When to Use This Pattern

- Source system publishes events (order created, invoice updated, CDC record change)
- Target processing must be decoupled from source (fire-and-forget from source perspective)
- Fan-out: one event must reach multiple consumers
- Guaranteed delivery required (message survives target downtime)
- Real-time but not synchronous (no caller waiting for a response)

**Do not use** for: synchronous request/response, bulk historical data movement, or when message order is critical and the broker cannot guarantee it.

---

## Reference Architecture

```
Source System (Salesforce, ERP, custom app)
        │  Platform Event / CDC / REST POST
        ▼
  Message Broker (Anypoint MQ / Kafka)
        │
        │  subscriber
        ▼
{domain}-proc-api
  ├── MQ/Kafka subscriber flow
  ├── Transform to canonical
  ├── Apply business rules
  ├── Call system APIs
  └── On failure → DLQ
        │
        ▼
{system-a}-sys-api   {system-b}-sys-api
        │                    │
     System A             System B
```

### Fan-Out Pattern

```
Message Broker (exchange / topic)
        │
   ┌────┴────┐
   ▼         ▼
Queue A   Queue B      ← one queue per consumer domain
   │         │
Proc A    Proc B
```

---

## EDA Fit Assessment

Before finalising this pattern, run the EDA fit checklist from `docs/PLANNING_CONTEXT.md → EDA FIT ASSESSMENT`.

Key questions for event-driven (1-to-1):
- Do publisher and consumer teams evolve independently? → YES = EDA warranted
- Will only one consumer process each event? → YES = this pattern; NO = use `pubsub-fanout`
- Does the consumer need event replay? → YES = Kafka required (not Anypoint MQ)
- Is throughput > 100K messages/day? → YES = Kafka required

If publisher is internal and both ends are under your control, consider async RPC (HTTP + async response)
as a simpler alternative before committing to a broker.

---

## decisions.json Defaults

```json
{
  "integration": {
    "integrationStyle": "messaging",
    "primaryPattern": "event-driven",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "under-3s",
    "frequency": "triggered"
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "compensationStrategy": "retry",
    "maxRetries": 5,
    "backoff": "fixed",
    "dlq": true,
    "invalidMessageChannel": true,
    "invalidMessageChannelName": "{domain}-invalid-messages-queue",
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

## Flow Structure

### Anypoint MQ Subscriber

```xml
<flow name="mq-subscriber-process-{object}-flow">
  <anypoint-mq:subscriber
    config-ref="Anypoint_MQ_Config"
    destination="${mq.queue.{object}}"
    acknowledgementMode="MANUAL"/>

  <!-- 1. Parse and validate message -->
  <!-- 2. Transform to canonical model -->
  <!-- 3. Route by event type if needed -->
  <!-- 4. Call system API(s) -->

  <!-- Acknowledge only on success -->
  <anypoint-mq:ack messageId="#[attributes.messageId]"/>

  <error-handler ref="global-error-handler"/>
</flow>
```

### Kafka Consumer

```xml
<flow name="kafka-consumer-process-{object}-flow">
  <kafka:consumer
    config-ref="Kafka_Consumer_Config"
    topic="${kafka.topic.{object}}"
    groupId="${kafka.groupId}"/>

  <!-- Process message -->

  <error-handler ref="global-error-handler"/>
</flow>
```

### Salesforce Platform Event Subscriber

```xml
<flow name="salesforce-cdc-process-{object}-flow">
  <salesforce:replay-channel-listener
    config-ref="Salesforce_Config"
    channel="/event/{ObjectName}__e"
    replayOption="ALL"/>

  <!-- Transform CDC envelope to canonical -->
  <!-- Call process logic -->

  <error-handler ref="global-error-handler"/>
</flow>
```

---

## Error Handling

Strategy: **retry-then-dlq**

| Step | On failure | Action |
|------|-----------|--------|
| Message parse | Bad payload | NACK → DLQ immediately (no retry) |
| Business validation | Invalid data | NACK → DLQ immediately |
| System API call | Connectivity | Retry 5× fixed 2s, then NACK → DLQ |
| System API call | Business reject | NACK → DLQ with error envelope |

### Acknowledgement Strategy (Anypoint MQ)

- Use `MANUAL` acknowledgement always.
- `NACK` (negative acknowledge) routes to the MQ DLQ automatically.
- Never use `IMMEDIATE` — message is lost if processing fails.
- Never use `AUTO` for production flows.

### DLQ Structure

- DLQ name: `{queue-name}-dlq`
- DLQ message must carry: original payload + error envelope as message properties
- Dead-letter reprocessing flow: `mq-reprocess-{object}-dlq-flow` (manual trigger, separate file)

---

## Message Ordering

Anypoint MQ does **not** guarantee strict FIFO. If order matters:
1. Use Kafka with a single-partition topic (ordered per partition)
2. Or include a sequence number in the message and handle ordering in the process API
3. Document the ordering decision in `architecture.md`

---

## Idempotency

All event-driven flows must be idempotent:
- Store processed message IDs in Object Store (persistent, TTL = 24 h)
- Check before processing; skip duplicates
- Log skipped duplicates at INFO level

```dataweave
// Idempotency check key
"${app.name}-" ++ attributes.messageId
```

---

## Concurrency

| Message rate | `maxConcurrency` | Notes |
|-------------|-----------------|-------|
| < 10/sec | 1 | Default; safe for ordered processing |
| 10–100/sec | 4 | Watch target system rate limits |
| > 100/sec | 8–16 | Profile under load; tune per target |

---

## MUnit Test Coverage

Each event-driven flow must have tests for:
- [ ] Happy path with valid message payload
- [ ] Invalid / malformed message (→ DLQ, not exception)
- [ ] Duplicate message (idempotency check)
- [ ] Target system connectivity failure (retry → DLQ)
- [ ] DLQ reprocess flow (manual trigger)

---

## Broker Choice Guide

| Broker | Use when |
|--------|---------|
| Anypoint MQ | Default; Anypoint-native; no Kafka expertise needed |
| Kafka | > 100K msg/day; multi-team fan-out; retention replay needed |
| Salesforce Platform Events | Source is Salesforce and CDC is available |

---

## Example Project

**Client:** Order management — Salesforce order creation → NetSuite invoice  
**Flows:** `salesforce-cdc-process-order-flow`, `mq-subscriber-process-invoice-flow`  
**Connectors:** `salesforce`, `anypoint-mq`, `netsuite`  
**Security tier:** partner  
**Deployment:** CloudHub 2.0, 0.2 vCores × 2 replicas
