# Scenario: Batch Integration

> **Pattern:** `batch`  
> **Trigger:** Scheduler or SFTP file drop  
> **Latency target:** Minutes to hours (async-ok)  
> **Volume:** High–very-high (> 10,000 records per run)

---

## When to Use This Pattern

- Large file ingestion (CSV, fixed-width, JSON Lines from SFTP/S3)
- Daily or periodic data sync (ERP → data warehouse, CRM bulk load)
- End-of-day financial reconciliation
- Any scenario where records = thousands and completion time = acceptable

**Do not use** for: sub-second latency requirements, when source publishes events, or when records need to flow individually to the target immediately.

---

## Reference Architecture

```
SFTP / DB / File source
        │
        ▼  (Scheduler trigger)
{domain}-proc-api
  ├── Batch Job (scope/commit)
  │     ├── Input phase   — read source, apply watermark
  │     ├── Process phase — transform, validate per record
  │     └── Output phase  — write to target in chunks
  │
  └── Error: route failed records to DLQ / error file
        │
        ▼
{system-a}-sys-api   {system-b}-sys-api
        │                    │
     System A             System B
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "primaryPattern": "batch",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "async-ok",
    "frequency": "scheduled",
    "volume": "high"
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "maxRetries": 2,
    "backoff": "fixed",
    "dlq": true,
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

### Scheduler Trigger Flow

```xml
<flow name="scheduler-trigger-{object}-batch-flow">
  <scheduler>
    <scheduling-strategy>
      <cron expression="${batch.cron.expression}" timeZone="UTC"/>
    </scheduling-strategy>
  </scheduler>
  <flow-ref name="{object}-batch-job"/>
</flow>
```

### Batch Job

```xml
<batch:job name="{object}-batch-job" maxFailedRecords="-1" blockSize="200">
  <batch:input>
    <!-- Read from source; apply watermark -->
    <os:retrieve key="lastRunTimestamp" target="lastRun" defaultValue="1970-01-01T00:00:00Z"/>
    <{connector}:{operation} .../>
  </batch:input>
  <batch:process-records>
    <batch:step name="validate-step">
      <!-- Validate each record; use on-error-continue to skip bad records -->
    </batch:step>
    <batch:step name="transform-step">
      <!-- Transform to target format -->
    </batch:step>
    <batch:step name="write-step" acceptExpression="#[batchData.failedOnInputPhase == false]">
      <!-- Write to target system API -->
    </batch:step>
  </batch:process-records>
  <batch:on-complete>
    <!-- Store watermark; send summary notification; log totals -->
    <os:store key="lastRunTimestamp" value="#[now() as String]"/>
  </batch:on-complete>
</batch:job>
```

---

## Watermarking

Watermark stores the last successful run timestamp in Object Store:
- Use `persistent` Object Store (survives restart)
- Key: `{flowName}-lastRunTimestamp`
- Value: ISO-8601 UTC string
- Store in `batch:on-complete` only after full success

```dataweave
// Read watermark
vars.lastRun default "1970-01-01T00:00:00Z"

// Store watermark (on-complete)
now() as String {format: "yyyy-MM-dd'T'HH:mm:ss'Z'"}
```

---

## Error Handling

Strategy: **retry-then-dlq**

| Phase | On failure | Action |
|-------|-----------|--------|
| Input (read source) | Connectivity | Retry 2× fixed 5s, then abort job + alert |
| Process (per record) | Validation | Mark record failed, continue batch |
| Process (per record) | Transform error | Mark record failed, continue batch |
| Output (write target) | Connectivity | Retry 2× fixed 5s, then DLQ the record |
| Output (write target) | Business reject | Write to error file / DLQ |

Failed records in the output phase must be routed to a DLQ or error file with:
- Original payload
- Error envelope
- Batch step name
- Record sequence number

---

## File Handling (SFTP pattern)

```
Inbound file lands in:   /inbound/{client}/{object}/
Move to:                 /inbound/{client}/{object}/processing/  (before read)
Move to:                 /inbound/{client}/{object}/processed/   (on success)
Move to:                 /inbound/{client}/{object}/error/       (on failure)
```

Never delete source files — archive them. Retention: 30 days minimum.

---

## Block Size Guidelines

| Record count | blockSize | Notes |
|-------------|-----------|-------|
| < 5,000 | 100 | Default safe value |
| 5,000–50,000 | 200 | Tune per target API rate limits |
| > 50,000 | 500 | Monitor memory; may need larger workers |

---

## Performance Considerations

- Set `maxConcurrency` on batch steps to control parallelism (default: 4)
- Use `acceptExpression` to skip failed-input records in later steps
- Batch jobs are memory-intensive — size workers at `high` or `very-high`
- For very large files (> 1M records), use streaming with `com.mulesoft.mule.runtime.module.batch`

---

## MUnit Test Coverage

Each batch flow must have tests for:
- [ ] Successful end-to-end with sample file
- [ ] Empty source (zero records — no error)
- [ ] Record with invalid data (should skip, not abort)
- [ ] Target system connectivity failure (retry then DLQ)
- [ ] Watermark advances on success; stays on failure

---

## Example Project

**Client:** ERP nightly product sync to Salesforce  
**Flows:** `scheduler-trigger-product-batch-flow`, `product-batch-job`  
**Connectors:** `sftp`, `salesforce`, `anypoint-mq` (DLQ)  
**Security tier:** internal  
**Deployment:** CloudHub 2.0, 1.0 vCores × 1 replica (scale to 2 during batch window)
