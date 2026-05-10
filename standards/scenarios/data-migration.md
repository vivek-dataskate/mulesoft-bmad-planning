# Scenario: Data Migration

> **Pattern:** `data-migration`
> **Trigger:** Manual/one-time execution; may run in phases over days or weeks
> **Latency target:** Throughput over latency — completion time matters, not per-record speed
> **Volume:** Very-high to bulk (millions of records; entire historical dataset)

---

## When to Use This Pattern

- System replacement: move all historical data from legacy system to new platform
- Phased cutover: migrate historical records before go-live; incremental delta on top
- Data consolidation: merge two systems' data into one (acquisition, reorg)
- Schema migration: transform data to new canonical model during platform change
- One-time or time-bounded — not an ongoing integration (use `scheduled-sync` or `cdc-streaming` post-cutover)

**Distinguish from batch:** Batch is a repeating scheduled job. Data migration runs once (or a few times
in phases) and terminates. The entire operational posture is different: throughput maximised, production
monitoring not required, resumability is critical.

**Distinguish from file-based-etl:** File-based ETL handles ongoing file drops from operational systems.
Migration handles a finite historical dataset extracted specifically for the migration event.

**Do not use** for: ongoing operational integrations, small record sets (< 10,000 records — use a
manual export), or scenarios where the migration is actually a recurring sync.

---

## Reference Architecture

### Phase 1 — Historical Load (pre-cutover)

```
Legacy System
  │  Full extract (API or DB export)
  ▼
Staging Store (Amazon S3 / SFTP)
  │  Migration files (chunked by entity or date range)
  ▼
Migration Runner (MuleSoft)
  ├── Read chunk → transform to target model
  ├── Validate each record (business rules, required fields, referential integrity)
  ├── Upsert to target system (batch scope, 500–1000 records/chunk)
  ├── Write pass/fail per record to migration audit log (S3)
  ├── Advance watermark (resume from last successful chunk on restart)
  └── Completion report (totals, failed record list)
        │
        ▼
Target System
```

### Phase 2 — Delta Sync (cutover window)

```
Legacy System (still live during cutover)
  │  Delta extract (records changed since Phase 1 watermark)
  ▼
Migration Runner — delta pass
  └── Same pipeline; handles smaller volume
        │
        ▼
Target System (now primary)
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "primaryPattern": "data-migration",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "async-ok",
    "frequency": "one-time",
    "volume": "bulk",
    "throughput": "very-high"
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "maxRetries": 3,
    "backoff": "exponential",
    "dlq": true,
    "errorEnvelope": true
  },
  "scheduling": {
    "required": false,
    "watermarking": true,
    "objectStore": "persistent"
  },
  "devops": {
    "munitCoverage": 60,
    "environments": ["dev", "uat", "prod"]
  }
}
```

---

## Flow Structure

### Migration Runner

```xml
<flow name="migration-run-{entity}-flow">
  <!-- Manual trigger via HTTP POST or scheduler for phased runs -->
  <http:listener config-ref="HTTP_Listener_config"
    path="/migration/{entity}/run" method="POST"/>

  <!-- Read resume checkpoint from Object Store -->
  <os:retrieve
    key="{entity}-migration-checkpoint"
    target="checkpoint"
    defaultValue='#[{ "chunkIndex": 0, "processedCount": 0, "failedCount": 0 }]'
    objectStore="persistent-store"/>

  <flow-ref name="{entity}-migration-batch-job"/>

  <error-handler ref="global-error-handler"/>
</flow>
```

### Migration Batch Job

```xml
<batch:job name="{entity}-migration-batch-job"
  maxFailedRecords="-1"
  blockSize="1000">
  <batch:input>
    <!-- Read from staging S3 or legacy API, starting from checkpoint -->
    <amazon-s3:get-object
      config-ref="Amazon_S3_Config"
      bucketName="${migration.s3.bucket}"
      key="${migration.s3.prefix}/{entity}/chunk-#[vars.checkpoint.chunkIndex].json"/>
  </batch:input>
  <batch:process-records>
    <batch:step name="validate-step">
      <!-- Validate required fields, data types, referential integrity checks -->
      <!-- Set vars.skip = true for unrecoverable records -->
    </batch:step>
    <batch:step name="transform-step"
      acceptExpression="#[vars.skip != true]">
      <!-- Map legacy schema to target canonical model -->
      <!-- Apply business transformations (e.g. concatenate name fields, normalise dates) -->
    </batch:step>
    <batch:step name="upsert-step"
      acceptExpression="#[vars.skip != true]">
      <!-- Upsert to target; use natural key from legacy system for idempotency -->
      <!-- Log each record result to audit log file on S3 -->
    </batch:step>
  </batch:process-records>
  <batch:on-complete>
    <!-- Advance checkpoint -->
    <os:store
      key="{entity}-migration-checkpoint"
      value="#[{ chunkIndex: vars.checkpoint.chunkIndex + 1, processedCount: vars.checkpoint.processedCount + batchResult.successfulRecords, failedCount: vars.checkpoint.failedCount + batchResult.failedRecords }]"
      objectStore="persistent-store"/>

    <!-- Write completion summary to S3 audit log -->
    <!-- Send summary notification (email to migration team) -->
    <logger level="INFO"
      message="#['Migration chunk ' ++ vars.checkpoint.chunkIndex ++ ' complete. Loaded: ' ++ batchResult.successfulRecords ++ ' Failed: ' ++ batchResult.failedRecords]"/>
  </batch:on-complete>
</batch:job>
```

### Status / Progress API

```xml
<flow name="http-get-migration-status-flow">
  <http:listener config-ref="HTTP_Listener_config"
    path="/migration/{entity}/status" method="GET"/>
  <os:retrieve
    key="{entity}-migration-checkpoint"
    objectStore="persistent-store"/>
  <error-handler ref="global-error-handler"/>
</flow>
```

---

## Resumability — Critical Requirement

Migrations fail partway. Every migration MUST be resumable without reprocessing already-loaded records.

Resumability strategy:
1. **Chunk files** — split total extract into fixed-size files on S3 (1,000–10,000 records each)
2. **Checkpoint** — store last completed chunk index in persistent Object Store after each chunk
3. **Idempotency** — all target writes use upsert (not insert); natural key from legacy system
4. **Restart** — rerun migration trigger; it reads checkpoint and skips completed chunks

Never run migration with pure inserts — re-runs will create duplicate records.

---

## Data Quality Validation

Before loading to target, validate:

| Check | Severity | Action |
|-------|----------|--------|
| Required field missing | ERROR | Skip record; write to rejection log |
| Field exceeds max length | WARNING | Truncate with log; or skip |
| Invalid date format | ERROR | Skip record |
| Referential integrity (FK missing) | ERROR | Queue for second-pass after parent loaded |
| Duplicate natural key within chunk | WARNING | Keep first occurrence; log duplicate |
| Enum value not in target system | ERROR | Map to default or skip |

All rejections must be written to a rejection CSV on S3 with: chunk index, record index, field name,
original value, rejection reason.

---

## Migration Audit Log

Every migration run produces a permanent audit trail:
- `s3://{bucket}/migration-audit/{entity}/{runDate}/summary.json` — totals, timing
- `s3://{bucket}/migration-audit/{entity}/{runDate}/rejections.csv` — failed records
- `s3://{bucket}/migration-audit/{entity}/{runDate}/loaded.json` — sample of loaded IDs

Retain audit logs indefinitely (or per data governance policy). Do not delete after migration closes.

---

## Performance Tuning

| Parameter | Starting point | Notes |
|-----------|---------------|-------|
| `blockSize` | 1000 | Increase to 2000 for simple transforms |
| `maxConcurrency` on upsert step | 4 | Reduce if target has strict rate limits |
| Worker size | 2.0 vCores | Scale up during migration window; scale down after |
| Chunk file size | 10,000 records | Smaller for complex transforms; larger for simple |
| Target rate limiting | Check API docs | Most SaaS APIs: 1,000–10,000 calls/min |

For bulk loads into Salesforce: use Salesforce Bulk API (batch connector supports `bulkApi` mode).
For large database targets: use JDBC batch inserts, not single upserts per record.

---

## Cutover Checklist

- [ ] Phase 1 historical load complete + audit log reviewed
- [ ] Rejection count < agreed threshold (document threshold in `architecture.md`)
- [ ] Delta pass run against records changed since Phase 1 watermark
- [ ] Reconciliation counts match between legacy and target
- [ ] Target system accessible to business users; acceptance testing passed
- [ ] Legacy system frozen (read-only) at cutover moment
- [ ] Rollback plan documented: if target fails post-cutover, legacy remains accessible

---

## Error Handling

Strategy: **retry-then-dlq** (per record, within batch step)

| Failure | Action |
|---------|--------|
| Record validation failure | Skip; write to rejection log; continue batch |
| Target system rate limit (429) | Retry with exponential backoff; reduce concurrency |
| Target system unavailable | Abort chunk; alert team; do NOT advance checkpoint |
| Referential integrity failure | Queue to second-pass list; process after parent entities loaded |
| Complete batch failure | Checkpoint not advanced; restart safe |

---

## MUnit Test Coverage

Migration flows require different test coverage than operational flows:

- [ ] Happy path — 1,000 valid records loaded to target
- [ ] Checkpoint advances after successful chunk; skipped on restart
- [ ] Record with missing required field — rejected to rejection log; batch continues
- [ ] Target returns 429 rate limit — retry + backoff fires
- [ ] Idempotency — re-running a completed chunk does not create duplicates
- [ ] Status API returns current checkpoint

---

## Example Project

**Client:** CRM migration — legacy Dynamics CRM → Salesforce; 2M account and contact records
**Phases:** Phase 1 accounts (1M), Phase 2 contacts (1M), Phase 3 delta (< 50K changes during cutover)
**Flows:** `migration-run-account-flow`, `account-migration-batch-job`, `http-get-migration-status-flow`
**Connectors:** `amazon-s3`, `salesforce` (bulk API mode), `email` (completion alerts)
**Security tier:** internal
**Deployment:** CloudHub 2.0, 2.0 vCores × 1 replica (migration window only; terminate after)
