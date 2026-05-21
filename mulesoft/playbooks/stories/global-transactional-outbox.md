# Story Template: Transactional Outbox Infrastructure Setup

**Story Type:** Global Infrastructure (Conditional)
**When to include:** Only if `decisions.json integration.primaryPattern = "transactional-outbox"`
**Priority:** P0 — outbox table must exist and poller must be configured before any events can be reliably published
**Standard:** `standards/scenarios/transactional-outbox.md`
**Scenario File:** `standards/scenarios/transactional-outbox.md`
**Scaffold Files:** `src/main/mule/global-config.xml`, `src/main/mule/{domain}-outbox-flows.xml`

---

## User Story

As a developer, I need the outbox table created in the application database, the MuleSoft poller flow configured to poll unpublished rows and publish them to Anypoint MQ, and stalled-event alerting in place, so that events written by the source application are guaranteed to reach downstream consumers even if the MQ publish fails transiently.

---

## Acceptance Criteria

### Pre-Requisite: Outbox Table (Application DB — not Mule code)
- [ ] `outbox_events` table created in the application's database (same DB that the application writes its domain objects to)
- [ ] DDL confirmed with the application team and reviewed against `standards/scenarios/transactional-outbox.md → Outbox Table Schema`:
  ```sql
  CREATE TABLE outbox_events (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type     VARCHAR(100) NOT NULL,
    aggregate_id   VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    payload        JSONB NOT NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    published_at   TIMESTAMP,          -- NULL = not yet published
    retry_count    INTEGER NOT NULL DEFAULT 0,
    last_error     TEXT
  );
  CREATE INDEX idx_outbox_unpublished ON outbox_events (created_at ASC)
    WHERE published_at IS NULL;
  ```
- [ ] Index on `(created_at ASC) WHERE published_at IS NULL` created — poller query relies on this; without it, full-table scan on every poll interval
- [ ] Application team has confirmed they write to `outbox_events` **in the same DB transaction** as their domain table write — the dual-write atomicity is the application's responsibility, not MuleSoft's
- [ ] `published_at` is a **TIMESTAMP** (not a boolean) — enables reprocessing by resetting to NULL; boolean flags cannot be reset without a schema change

### Database Connector Configuration (global-config.xml)
- [ ] `<db:config>` configured for the application database
- [ ] JDBC URL, username, password from Secrets Manager: `db.url`, `db.username`, `db.password`
- [ ] Connection pool: `minPoolSize=2`, `maxPoolSize=5` (poller is single-threaded; small pool is sufficient)
- [ ] `maxConcurrency="1"` on the outbox poller flow — **never higher** — parallel polling of the same outbox table causes duplicate events and ordering violations

### Outbox Poller Properties (per environment)
- [ ] `outbox.poll.interval.ms: 10000` (poll every 10 seconds; tune down to 5s for near-real-time; up to 30s for low-volume)
- [ ] `outbox.batch.size: 50` (rows per poll; keep small to avoid long-running transactions)
- [ ] `outbox.max.retries: 3` (rows beyond this retry count are stalled — excluded from SELECT query)
- [ ] `outbox.dedup.ttl.minutes: 1440` (24h — matches standard message TTL)
- [ ] `mq.exchange.{domain}: "{domain}-events-{env}-exchange"` (or queue name if using a queue, not an exchange)

### Poller Flow Structure (verify scaffold output)
- [ ] `scheduler-outbox-poll-{domain}-flow` exists in `{domain}-outbox-flows.xml`
- [ ] Scheduler uses `<fixed-frequency>` with `${outbox.poll.interval.ms}` milliseconds
- [ ] SELECT query filters: `published_at IS NULL AND retry_count < :maxRetries ORDER BY created_at ASC LIMIT :batchSize`
- [ ] `<foreach>` with `<try>/<on-error-continue>` per row — one row's publish failure does NOT stop the batch
- [ ] On MQ publish success: `UPDATE outbox_events SET published_at = NOW() WHERE id = :id`
- [ ] On MQ publish failure: `UPDATE outbox_events SET retry_count = retry_count + 1, last_error = :error WHERE id = :id`
- [ ] Idempotency check in `publish-outbox-event-subflow` using persistent Object Store:
  - Key: `outbox-published-{row.id}`
  - On hit: log INFO and skip — row was published but DB update failed; prevents duplicate event
  - TTL: `${outbox.dedup.ttl.minutes}` minutes

### Anypoint MQ Configuration
- [ ] MQ exchange (or queue) created: `{domain}-events-{env}-exchange` per environment
- [ ] TTL on exchange: **24 hours** (standard event category; upgrade to 7 days if events are critical business transactions)
- [ ] `eventType` message property set from `outbox_events.event_type` — enables consumer-side routing without parsing payload
- [ ] `correlationId` message property set — propagated to all downstream consumers
- [ ] Alert: MQ publish failure rate > 5% in 5 min → HIGH (stalled rows accumulating; ops must investigate)

### Stalled Event Monitoring
- [ ] Monitoring query runs on a separate schedule (every 5 minutes) to detect stalled rows:
  ```sql
  SELECT COUNT(*) FROM outbox_events
  WHERE published_at IS NULL AND retry_count >= 3
  ```
- [ ] If stalled count > 0: alert HIGH → page on-call — rows with exhausted retries will never be published without manual intervention
- [ ] Alert includes: `stalledCount`, `oldestStalledCreatedAt` (for SLA breach assessment)
- [ ] Ops runbook documented: how to inspect `last_error` column, fix root cause, and reset `retry_count = 0` to republish

### MUnit Tests
- [ ] Happy path: mock DB select returns 2 rows; mock MQ publish succeeds; assert `published_at` updated for both rows
- [ ] MQ publish fails (transient): mock MQ publish throws connection error; assert `retry_count` incremented; assert `published_at` NOT set; assert pipeline continues to next row
- [ ] Rows beyond max retries: mock DB select returns row with `retry_count = 3`; verify it is NOT in SELECT result (filtered by query); no publish attempt
- [ ] Idempotency guard: mock OS retrieve returns `true` (already published); assert MQ publish NOT called; assert `published_at` update NOT called
- [ ] Empty outbox: mock DB select returns 0 rows; assert no MQ publish; assert scheduler exits cleanly; no error
- [ ] DB mark-published fails: mock DB update throws error after MQ publish succeeds; assert WARN logged; assert same row published again on next poll (idempotency check prevents duplicate event delivery)
- [ ] Stalled event monitor: mock DB query returns count > 0; assert alert dispatched

---

## Outbox Event Type Inventory
*(PM agent populates from architecture.md)*

| Event Type | Aggregate Type | Published To | Expected Volume |
|-----------|----------------|-------------|-----------------|
| `{domain}.{entity}.created` | `{Entity}` | `{domain}-events-{env}-exchange` | `{N}/day` |
| `{domain}.{entity}.updated` | `{Entity}` | `{domain}-events-{env}-exchange` | `{N}/day` |

---

## Implementation Notes

- **The outbox table must be in the same database as the domain table** — the dual-write atomicity only holds if both writes are in the same ACID transaction; cross-database writes do not have this guarantee
- `maxConcurrency="1"` is a hard requirement — multiple parallel pollers on the same outbox table will cause duplicate event delivery and ordering violations; if throughput is insufficient, reduce `outbox.poll.interval.ms` instead
- `published_at` uses a TIMESTAMP, not a boolean — this allows ops to reset it to NULL for reprocessing without a schema change
- Use an MQ **Exchange** (not a queue) if there are multiple downstream consumers for the same event type — Exchange fanout delivers to all bound queues; a Queue delivers to only one consumer
- If the application team cannot guarantee atomic dual-write (e.g. they are using a NoSQL store or a distributed transaction is not feasible), consider Change Data Capture (pattern F) as an alternative — CDC reads the DB write-ahead log directly and does not require outbox table support from the application
- Reference: `standards/scenarios/transactional-outbox.md` — full flow XML, DDL, property defaults, and error handling table
