# Scenario: File-Based ETL Integration

> **Pattern:** `file-based-etl`
> **Trigger:** SFTP/S3 file drop (polling) or scheduler
> **Latency target:** Minutes to hours (async-ok; completion time matters, not per-record latency)
> **Volume:** Medium–very-high (thousands to millions of records per file)

---

## When to Use This Pattern

- Source system drops files (CSV, fixed-width, JSON Lines, XML, Excel) on SFTP or S3
- No real-time API available on the source — file is the integration surface
- Data warehouse loads, bulk ERP imports, partner data exchanges via file
- Periodic full or delta file exports that must be parsed, transformed, validated, and loaded

**Distinguish from batch:** File-based ETL is triggered by a file arriving, not a scheduler. The batch scope
handles per-record processing. Use `batch` when the source is an API query. Use this pattern when
the source is a file on a filesystem or object store.

**Do not use** for: sub-minute latency, when the source has a real-time API, or when record count is
low enough that a simple foreach inside a scheduled-sync flow suffices (< 2,000 records).

---

## Reference Architecture

```
SFTP / S3 / Azure Blob / FTP
  (file lands in /inbound/{client}/{object}/)
        │  polling listener
        ▼
{domain}-proc-api
  ├── Move file to /processing/
  ├── Parse file (CSV/JSON/XML streaming)
  ├── Batch Job
  │     ├── Input phase   — stream records from file
  │     ├── Process phase — validate + transform per record
  │     └── Output phase  — upsert to target system in chunks
  ├── On success → move file to /processed/
  ├── On failure → move file to /error/ + alert
  └── Completion notification (email / Slack)
        │
        ▼
{target-system}-sys-api
        │
    Target System
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "primaryPattern": "file-based-etl",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "async-ok",
    "frequency": "triggered",
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
    "required": false,
    "type": null,
    "watermarking": false,
    "objectStore": "persistent"
  },
  "devops": {
    "munitCoverage": 70
  }
}
```

---

## Flow Structure

### File Listener (SFTP)

```xml
<flow name="sftp-listener-{object}-etl-flow">
  <sftp:listener
    config-ref="SFTP_Config"
    directory="${sftp.inbound.dir}"
    moveToDirectory="${sftp.processing.dir}"
    filenamePattern="*.csv"
    watermarkEnabled="false">
    <scheduling-strategy>
      <fixed-frequency frequency="${sftp.poll.frequency}" timeUnit="SECONDS"/>
    </scheduling-strategy>
  </sftp:listener>

  <flow-ref name="{object}-etl-batch-job"/>
  <error-handler ref="global-error-handler"/>
</flow>
```

### S3 Trigger (Polling)

```xml
<flow name="s3-listener-{object}-etl-flow">
  <amazon-s3:list-objects
    config-ref="Amazon_S3_Config"
    bucketName="${s3.bucket.inbound}"
    prefix="${s3.prefix.inbound}"/>
  <!-- foreach object key → download → process → delete/archive -->
</flow>
```

### Batch Job

```xml
<batch:job name="{object}-etl-batch-job" maxFailedRecords="-1" blockSize="500">
  <batch:input>
    <!-- Parse CSV/JSON from file payload; streaming for large files -->
    <ee:transform>
      <ee:message>
        <ee:set-payload><![CDATA[%dw 2.0
          input payload application/csv separator=","
          output application/java
          ---
          payload]]>
        </ee:set-payload>
      </ee:message>
    </ee:transform>
  </batch:input>
  <batch:process-records>
    <batch:step name="validate-step">
      <!-- Validate required fields; set vars.skip = true for bad records -->
    </batch:step>
    <batch:step name="transform-step"
      acceptExpression="#[vars.skip != true]">
      <!-- Map to target canonical model -->
    </batch:step>
    <batch:step name="upsert-step"
      acceptExpression="#[vars.skip != true]">
      <!-- Call target sys-api; upsert by natural key -->
    </batch:step>
  </batch:process-records>
  <batch:on-complete>
    <!-- Log totals; send completion notification; archive or delete source file -->
    <logger level="INFO"
      message="#['ETL complete. Loaded: ' ++ batchResult.successfulRecords ++ ' Failed: ' ++ batchResult.failedRecords]"/>
  </batch:on-complete>
</batch:job>
```

---

## File Lifecycle Management

```
Inbound:    /inbound/{client}/{object}/
Processing: /inbound/{client}/{object}/processing/    ← move before reading (prevents reprocessing)
Processed:  /inbound/{client}/{object}/processed/     ← move on batch success
Error:      /inbound/{client}/{object}/error/         ← move on batch failure
```

- **Never delete source files.** Always archive to `/processed/` or `/error/`.
- Retention policy: 30 days minimum (configure SFTP server-side cleanup separately).
- Include original filename and timestamp in error envelope when moving to `/error/`.
- On CloudHub 2.0: do NOT use local `file` connector for inbound — local filesystem is ephemeral.
  Use SFTP, Amazon S3, or Azure Blob Storage only.

---

## File Format Support

| Format | MuleSoft handling | Notes |
|--------|------------------|-------|
| CSV | `application/csv` DataWeave reader | Declare separator, header flag |
| JSON Lines | `application/json` with streaming | Use `streaming=true` for large files |
| XML | `application/xml` DataWeave reader | Use XPath for large docs; streaming for > 10 MB |
| Fixed-width | Custom DWL or Java helper | No native reader — parse with `substring` |
| Excel (.xlsx) | Java module or HTTP to conversion service | No native connector; consider pre-conversion |
| EDIFACT / X12 | See `b2b-edi.md` | Requires B2B EDI connector |

---

## Duplicate File Detection

Use Object Store to track processed filenames:
```dataweave
// Key: app name + filename + file size + modified date
"${app.name}-" ++ attributes.fileName ++ "-" ++ (attributes.size as String)
```
- TTL: 7 days
- Log and skip if already processed; do not error

---

## Error Handling

Strategy: **retry-then-dlq**

| Failure | Action |
|---------|--------|
| File unreadable / corrupt | Move to `/error/`; alert; no retry |
| Record validation failure | Mark record failed; continue batch; report in completion notification |
| Target system connectivity | Retry 2× fixed 10s per record; on 3rd failure → DLQ record |
| Full batch input failure | Abort job; move file to `/error/`; page on-call |
| Duplicate file detected | Skip silently; log at INFO |

Failed records must be written to a DLQ or error file with:
- Source filename + line/sequence number
- Original record payload
- Error envelope (`correlationId`, `errorCode`, `message`, `timestamp`)

---

## Performance Considerations

- `blockSize`: start at 200–500; tune per target API rate limits
- `maxConcurrency` on batch steps: 4 is a safe default; reduce if target has strict rate limits
- For files > 100 MB: use streaming DataWeave reader (`streaming=true`)
- Worker sizing: minimum 1.0 vCores during batch window; scale down after
- CloudHub 2.0: use Object Store for job-level idempotency (file already processed check)

---

## MUnit Test Coverage

Each file-based ETL flow must have tests for:
- [ ] Happy path — valid file → all records loaded
- [ ] Empty file — zero records — no error, completion notification sent
- [ ] File with mixed valid/invalid records — valid records load; bad records reported
- [ ] Target system connectivity failure — records routed to DLQ
- [ ] Duplicate file detected — skipped, not reprocessed
- [ ] File corrupt / unparseable — moved to `/error/`, alert fired

---

## Example Project

**Client:** ERP nightly product export → Salesforce bulk load
**Flows:** `sftp-listener-product-etl-flow`, `product-etl-batch-job`
**Connectors:** `sftp`, `salesforce`, `anypoint-mq` (DLQ), `email` (completion alert)
**Security tier:** internal
**Deployment:** CloudHub 2.0, 1.0 vCores × 1 replica (scale to 2 during batch window)
