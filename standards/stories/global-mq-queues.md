# Story Template: Set Up Anypoint MQ Queues with TTL and Depth Alerts

**Story Type:** Global Infrastructure
**When to include:** Only if decisions.json has any async flows (trigger=mq-subscriber, or primaryPattern in [event-driven, pubsub-fanout, batch, cdc-streaming, process-orchestration])
**Priority:** P0 — required before flow deployment
**Standard:** `standards/DESIGN_STANDARDS.md → Flow Control Standards`
**Scaffold File:** `src/main/mule/global-config.xml` (Anypoint MQ config element)

---

## Acceptance Criteria

### Queue Creation
- [ ] All queues created per environment: `{devops.environments}` (typically dev / uat / prod)
- [ ] Queue names follow convention: `{domain}-{action}-{env}-queue`
- [ ] DLQ paired with every primary queue: `{queue-name}-dlq`
- [ ] Invalid message channel queue created (if `errorHandling.invalidMessageChannel=true`): `{domain}-invalid-messages-{env}-queue`
- [ ] FIFO queues used where ordering is required (check architecture.md for ordering requirements)

### TTL Configuration (NEVER leave at broker default unlimited)
- [ ] **Critical business events** (orders, payments, provisioning): **168 hours (7 days)**
- [ ] **Standard integration events**: **24 hours**
- [ ] **Notification events** (alerts, email, SMS): **1 hour**
- [ ] **CDC events** (near-real-time change capture): **4 hours**
- [ ] **Monitoring / audit events**: **72 hours**
- [ ] Event category for each queue confirmed against architecture.md flow descriptions
- [ ] TTL applied to both primary queue AND DLQ

### Consumer Configuration
- [ ] `maxConcurrency` set on all `anypoint-mq:subscriber` elements (value from `decisions.json flowControl.maxConcurrency`, default 4)
- [ ] `acknowledgementMode="MANUAL"` on all subscribers — ACK only after successful processing
- [ ] Prefetch strategy reviewed for high-volume queues (reduce prefetch if downstream is slow)

### Anypoint Monitoring Alerts (all queues, production mandatory)
- [ ] Queue depth > **80%** of configured max → **MEDIUM** alert → Ops team
- [ ] Queue depth > **90%** → **HIGH** alert → page on-call
- [ ] Queue depth = **100%** (tail drop active) → **CRITICAL** alert → page on-call immediately
- [ ] DLQ depth > **0** → **HIGH** alert → page on-call immediately (no grace period)
- [ ] Alert notification channels configured per `decisions.json notifications.*` (email / Slack / PagerDuty)

### Idempotency — Object Store
- [ ] Persistent Object Store configured for deduplication on all async consumers
- [ ] Deduplication key: `{consumer-prefix}-${attributes.messageId}`
- [ ] Deduplication TTL: **`{flowControl.messageTtlHours × 60}` minutes** — NEVER a fixed 60 min default
  - Critical events (TTL=168h) → deduplicationTtlMinutes = **10080** (7 days)
  - Standard events (TTL=24h) → deduplicationTtlMinutes = **1440** (24 hours)
  - Notification events (TTL=1h) → deduplicationTtlMinutes = **60** (1 hour)
  - CDC events (TTL=4h) → deduplicationTtlMinutes = **240** (4 hours)
- [ ] On duplicate detected: ACK and skip — do NOT re-process

---

## Queue Inventory
*(PM agent populates from decisions.json flows[] and event category classification)*

| Queue Name (env=dev) | Event Category | TTL | DLQ | maxConcurrency |
|---------------------|---------------|-----|-----|----------------|
| `{domain}-{action}-dev-queue` | {category} | {N}h | `{queue-name}-dev-queue-dlq` | {N} |

---

## Implementation Notes

- Anypoint MQ queues are created in Anypoint Platform console — NOT generated in code
- Queue config element in `global-config.xml` references queue name via `${mq.queue.{name}}` property
- Property values in `properties/{env}.yaml`: `mq.queue.{name}: {domain}-{action}-{env}-queue`
- Reference: `standards/DESIGN_STANDARDS.md → Flow Control Standards → Default TTL Policy`
- Reference: `standards/DESIGN_STANDARDS.md → Cross-Cutting Patterns → Idempotent Receiver`
