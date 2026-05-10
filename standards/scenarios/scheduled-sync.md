# Scenario: Scheduled Sync

> **Pattern:** `scheduled-sync`  
> **Trigger:** Scheduler (cron or fixed frequency)  
> **Latency target:** Minutes (async-ok; not batch scale)  
> **Volume:** Low–medium (< 10,000 records per run)

---

## When to Use This Pattern

- Periodic lightweight sync between two systems (every 15 min, hourly, nightly)
- Reference data refresh (product catalogue, account lists, currency rates)
- Status polling when the source has no event capability
- Incremental delta sync via watermarking (only changed records since last run)

**Distinguish from batch:** Scheduled-sync handles low-to-medium volumes with simple read → transform → write flows. If volume exceeds 10,000 records or requires a batch scope/commit, use the `batch` pattern instead.

---

## Reference Architecture

```
Scheduler (cron)
     │
     ▼
{domain}-proc-api
  ├── Read watermark from Object Store
  ├── Query source system (changed since watermark)
  ├── foreach → transform each record
  ├── Write to target system
  ├── Update watermark on success
  └── On error → log + alert (no DLQ for low volume)
        │
        ▼
{source-system}-sys-api    {target-system}-sys-api
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "primaryPattern": "scheduled-sync",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "async-ok",
    "frequency": "scheduled",
    "volume": "low"
  },
  "errorHandling": {
    "strategy": "retry-only",
    "maxRetries": 3,
    "backoff": "exponential",
    "dlq": false,
    "errorEnvelope": true
  },
  "scheduling": {
    "required": true,
    "type": "cron",
    "watermarking": true,
    "objectStore": "persistent"
  },
  "devops": {
    "munitCoverage": 70
  }
}
```

---

## Flow Structure

### Scheduler Flow

```xml
<flow name="scheduler-sync-{object}-flow">
  <scheduler>
    <scheduling-strategy>
      <cron expression="${scheduler.cron.{object}}" timeZone="UTC"/>
    </scheduling-strategy>
  </scheduler>

  <!-- 1. Read watermark -->
  <os:retrieve key="{object}-lastSync" target="lastSync"
    defaultValue="1970-01-01T00:00:00Z"
    objectStore="persistent-store"/>

  <!-- 2. Query source since lastSync -->
  <!-- 3. foreach record -->
  <!-- 4. Transform + write to target -->
  <!-- 5. Update watermark -->
  <os:store key="{object}-lastSync"
    value="#[now() as String {format: &quot;yyyy-MM-dd'T'HH:mm:ss'Z'&quot;}]"
    objectStore="persistent-store"/>

  <error-handler ref="global-error-handler"/>
</flow>
```

### Object Store Config (global-config.xml)

```xml
<os:object-store name="persistent-store"
  persistent="true"
  maxEntries="1000"
  entryTtl="30"
  entryTtlUnit="DAYS"/>
```

---

## Watermark Strategy

| Source capability | Watermark field | Notes |
|------------------|-----------------|-------|
| Has `lastModifiedDate` | `lastModifiedDate` | Most common; use ISO-8601 |
| Has sequence ID | `id > lastId` | Use for insert-only sources |
| No change tracking | None | Full sync; use with caution on large sets |

Watermark must be persisted to Object Store **after successful write to target**, not after read from source.

If the sync fails mid-run:
- Watermark is NOT advanced
- Next run re-reads from the previous safe checkpoint
- This may cause duplicate writes → target system must handle upserts

---

## Foreach vs Batch

- Use `foreach` for < 2,000 records per run (simpler, easier to test)
- Switch to the `batch` pattern if record count routinely exceeds 10,000

### Foreach with Error Isolation

```xml
<foreach collection="#[payload]" counterVariableName="counter">
  <try>
    <!-- Transform + write one record -->
    <error-handler>
      <on-error-continue type="ANY">
        <!-- Log the single-record failure; continue loop -->
        <logger level="WARN" message="#['Record ' ++ vars.counter ++ ' failed: ' ++ error.description]"/>
      </on-error-continue>
    </error-handler>
  </try>
</foreach>
```

---

## Error Handling

Strategy: **retry-only**

| Failure | Action |
|---------|--------|
| Source system unavailable | Retry 3× exponential; skip run; alert |
| Target system unavailable | Retry 3× exponential; skip record with log |
| Transform error | Log and skip record; continue |
| All records fail | Alert ops; watermark NOT advanced |

No DLQ needed for scheduled-sync — the next scheduled run is the natural retry.

---

## Cron Expression Reference

| Frequency | Cron expression |
|-----------|----------------|
| Every 15 minutes | `0 0/15 * * * ?` |
| Hourly | `0 0 * * * ?` |
| Every 6 hours | `0 0 0/6 * * ?` |
| Nightly at 2am UTC | `0 0 2 * * ?` |
| Weekdays at 6am UTC | `0 0 6 ? * MON-FRI` |

Always run cron expressions in UTC. Store timezone in properties, not hardcoded.

---

## Performance Considerations

- Set `maxConcurrency="1"` on scheduler flow to prevent overlapping runs
- Add a circuit breaker: if last N runs all failed, stop and alert (Object Store flag)
- Page large result sets from source APIs (use `offset`/`limit` or cursor)
- Worker sizing: `low` (0.1 vCores) is typically sufficient

---

## MUnit Test Coverage

Each scheduled-sync flow must have tests for:
- [ ] First run (watermark is default date — returns full set)
- [ ] Subsequent run (watermark filters correctly)
- [ ] All records succeed (watermark advances)
- [ ] Single record fails (loop continues; watermark NOT advanced for that record)
- [ ] Source system unavailable (retry logic fires; watermark unchanged)

---

## Example Project

**Client:** Nightly product catalogue sync from NetSuite to Salesforce (hourly delta)  
**Flows:** `scheduler-sync-product-flow`  
**Connectors:** `netsuite`, `salesforce`  
**Security tier:** internal  
**Deployment:** CloudHub 2.0, 0.1 vCores × 1 replica
