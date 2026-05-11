# Story Template: Scheduled Sync — Watermark and Object Store Setup

**Story Type:** Global Infrastructure (Conditional)
**When to include:** Only if `decisions.json integration.primaryPattern = "scheduled-sync"` OR `decisions.json scheduling.watermarking = true`
**Priority:** P0 — scheduler flows must not run without a persistent watermark store; in-memory Object Store loses state on restart
**Standard:** `standards/scenarios/scheduled-sync.md`
**Scenario File:** `standards/scenarios/scheduled-sync.md`
**Scaffold Files:** `src/main/mule/global-config.xml`, `src/main/resources/properties/{env}.yaml`

---

## User Story

As a developer, I need a persistent Object Store configured for watermarking and the scheduler triggers wired with correct cron expressions, so that scheduled-sync flows pick up only changed records since the last successful run — even after worker restarts — without full-table scans or duplicate processing.

---

## Acceptance Criteria

### Object Store Configuration (global-config.xml)
- [ ] `<os:object-store name="persistent-store" persistent="true" .../>` declared in `global-config.xml`
- [ ] `persistent="true"` — **never `persistent="false"` (in-memory) for watermarks** — state lost on CloudHub 2.0 worker restart
- [ ] `maxEntries` set to at least `1000` (accommodates multiple watermark keys + idempotency keys)
- [ ] `entryTtl` set to `30` days and `entryTtlUnit="DAYS"` — watermark entries must survive between runs; 24h TTL causes watermark loss on infrequent schedules
- [ ] Object Store v2 used on CloudHub 2.0 (default — no additional config needed; confirm it is NOT Object Store v1 which is deprecated)

### Watermark Key Per Sync Flow
- [ ] Each scheduled-sync flow has a **unique watermark key** in Object Store: `{object}-lastSync` (e.g. `product-lastSync`, `account-lastSync`)
- [ ] Default value on first run: `"1970-01-01T00:00:00Z"` (ISO-8601 UTC epoch) — triggers full initial load
- [ ] Watermark field selection confirmed from architecture.md:
  - `lastModifiedDate` preferred (most systems support it)
  - `id > lastId` (sequence ID) for insert-only sources with no modified timestamp
  - Full sync (no watermark) only if source has no change tracking — must be explicitly documented in architecture.md
- [ ] Watermark **advanced AFTER successful write to target**, not after read from source
  - If flow fails mid-run: watermark NOT advanced; next run re-reads from the last safe checkpoint
  - Implication: target system must support upserts (not blind inserts) to handle re-processing

### Scheduler Trigger Configuration
- [ ] `<scheduler>` with `<cron>` strategy used for business-hours or daily schedules
- [ ] `<scheduler>` with `<fixed-frequency>` used for regular intervals (every 15 min, hourly)
- [ ] Cron expression stored in properties, not hardcoded: `${scheduler.cron.{object}}`
- [ ] All cron expressions run in **UTC** timezone (`timeZone="UTC"`)
- [ ] `maxConcurrency="1"` on the scheduler flow — prevents overlapping runs on the same sync job
- [ ] Common cron expressions verified (from `standards/scenarios/scheduled-sync.md`):
  - Every 15 min: `0 0/15 * * * ?`
  - Hourly: `0 0 * * * ?`
  - Nightly 2am UTC: `0 0 2 * * ?`
  - Weekdays 6am UTC: `0 0 6 ? * MON-FRI`

### Properties (per environment)
- [ ] `scheduler.cron.{object}` defined per environment (dev may run more frequently; prod on business schedule)
- [ ] Watermark default confirmed in code (not a property — `os:retrieve defaultValue` attribute)

### Watermark Flow Structure (per sync flow)
- [ ] `<os:retrieve>` reads watermark at flow start: `key="{object}-lastSync"`, `target="lastSync"`, `defaultValue="1970-01-01T00:00:00Z"`
- [ ] Source system query uses `vars.lastSync` as the `lastModifiedDate` filter parameter
- [ ] `<foreach>` with `<try>/<on-error-continue>` wraps each record — single-record failure does NOT stop the run
- [ ] `<os:store>` writes updated watermark **after the foreach completes successfully**: `key="{object}-lastSync"`, `value="#[now() as String {format: \"yyyy-MM-dd'T'HH:mm:ss'Z'\"}]"`
- [ ] Watermark NOT advanced if an exception propagates out of the flow (handled by global error handler)

### Error Handling (scheduled-sync specific — differs from async patterns)
- [ ] Strategy: `retry-only` (no DLQ — next scheduled run is the natural retry)
- [ ] Source system unavailable: retry 3× exponential; skip this run; alert ops
- [ ] All records fail: alert ops; watermark NOT advanced
- [ ] Pagination: if source API paginates, `offset`/`limit` or cursor loop implemented before the foreach

### Monitoring
- [ ] Alert: scheduler flow error rate > 0 in last run → MEDIUM (sync may be falling behind)
- [ ] Alert: source system 5xx rate > 5% → HIGH (source degraded; sync failing)
- [ ] Log at each run: `correlationId`, `lastSync` watermark used, record count returned, record count written, new watermark set

### MUnit Tests
- [ ] First run: mock `os:retrieve` returns default epoch value; mock source returns full record set; assert watermark advanced to `now()`
- [ ] Subsequent run: mock `os:retrieve` returns previous watermark; mock source returns only changed records; assert correct filter parameter passed to source query
- [ ] All records succeed: assert `os:store` called once with updated watermark
- [ ] Single record fails: assert loop continues; assert watermark still advances (partial success)
- [ ] Source unavailable: mock source throws connection error; assert `os:store` NOT called (watermark unchanged)
- [ ] Empty result: source returns 0 records; assert `os:store` still called (watermark advances even on no-op runs)

---

## Sync Flow Inventory
*(PM agent populates from decisions.json flows[])*

| Flow Name | Watermark Key | Watermark Field | Schedule (prod) | Source | Target |
|-----------|--------------|-----------------|-----------------|--------|--------|
| `scheduler-sync-{object}-flow` | `{object}-lastSync` | `lastModifiedDate` | `{cron}` | `{source}` | `{target}` |

---

## Implementation Notes

- **Persistent Object Store is mandatory on CloudHub 2.0** — in-memory OS is destroyed when the worker restarts or is redeployed; watermarks reset to epoch and cause a full re-sync
- Object Store v2 has a 10 MB per-key limit — watermark strings are tiny; this is not a concern
- If the source API has a rate limit, add a `<flow-control:rate-limiter>` or `Thread.sleep` inside the foreach to avoid hitting the limit mid-run
- `foreach` is appropriate for < 2,000 records per run; if the source routinely returns > 10,000 records, switch to the `batch` pattern (C)
- Circuit breaker: after N consecutive failed runs, the scheduler should raise an alert and optionally disable itself (Object Store flag `{object}-circuitOpen = true`)
- Reference: `standards/scenarios/scheduled-sync.md` → Watermark Strategy and Foreach vs Batch sections
