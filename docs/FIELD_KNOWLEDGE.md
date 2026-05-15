# Field Knowledge — MuleSoft BMAD Planning System
> Append-only log of real-project lessons that are not yet (or not fully) covered by scenario files
> or standards. Read by all BMAD agents at session start. Architect maintains this file.
>
> Format: FK-NNN | Date | Trigger | Scenario | What worked | Status
> Status: observation → verified → promoted-to-standard
>
> HOW TO ADD AN ENTRY:
>   Invoke the Architect Debrief agent — _bmad/custom/bmad-agent-architect-debrief.toml — and select DK.
>   The agent asks 6 questions and writes the index row, full detail entry, and commit message.
>   No client names are stored — counts only.
>
>   To promote a verified entry to standard: select PK from the same agent.
>
> STATUS LADDER:
>   observation → verified at 2+ occurrences across multiple engagements
>   verified → promoted-to-standard: agent drafts the target file change; update the target file, keep entry for traceability
>
> HOW AGENTS USE THIS FILE:
>   - observation entries: flag if situation matches current project; do not auto-apply
>   - verified entries: apply as active guidance, takes precedence over generic scenario defaults
>   - promoted-to-standard: kept for traceability only; guidance now lives in the promoted file

---

## Index

| FK | Title | Pattern / System | Status | Added | Last Seen | Times |
|----|-------|-----------------|--------|-------|-----------|-------|
| [FK-001](#fk-001) | POST body reverse-engineering from GET response | Any REST API without write spec | verified | 2026-05-10 | 2026-05-10 | 3+ |
| [FK-002](#fk-002) | SYSPRO ERP: no dedicated connector, HTTP with basic auth | SYSPRO | observation | 2026-05-10 | 2026-05-10 | 1 |
| [FK-003](#fk-003) | Scaffold profile mismatch: observability not in intake docs | scaffold profile selection | observation | 2026-05-10 | 2026-05-10 | 1 |
| [FK-004](#fk-004) | MUnit coverage floor vs. coverage theater | MUnit / testing | verified | 2026-05-10 | 2026-05-10 | 2+ |
| [FK-005](#fk-005) | Connector missing HTTP method coverage → raw HTTP + manual token | Any connector with partial operation coverage | verified | 2026-05-10 | 2026-05-10 | 4 |
| [FK-006](#fk-006) | Any paginated REST API requires a while-loop workaround in Mule 4 | Any paginated REST API | verified | 2026-05-10 | 2026-05-10 | 3+ |
| [FK-007](#fk-007) | Watermark must advance AFTER processing confirms success, not before | pattern D / C / K / CDC | verified | 2026-05-10 | 2026-05-10 | 2 |
| [FK-008](#fk-008) | Webhook idempotency: return 200 always, store event ID after success, DLQ for failures | pattern J / any webhook | verified | 2026-05-10 | 2026-05-10 | 1 |
| [FK-009](#fk-009) | `on-error-continue` as direct child of `async` is invalid Mule 4 XML — wrap in `try` + `error-handler` | wire-tap / any async error isolation | verified | 2026-05-10 | 2026-05-10 | 1 |
| [FK-010](#fk-010) | `set-variable` does not update the Mule event's `correlationId` — use `set-correlation-id` (Mule 4.6+) | HTTP listener / correlation ID propagation | verified | 2026-05-10 | 2026-05-10 | 1 |
| [FK-011](#fk-011) | MUnit `expectedErrorType` must not be set when Global_Error_Handler uses `on-error-continue` | MUnit / error handler testing | verified | 2026-05-10 | 2026-05-10 | 1 |
| [FK-012](#fk-012) | Claim-check S3 getObject returns InputStream — `output application/java` produces byte array, not JSON | claim-check pattern / S3 / Azure Blob | verified | 2026-05-10 | 2026-05-10 | 1 |
| [FK-013](#fk-013) | HubSpot connector registry vs. sales call divergence — verify Exchange before committing | HubSpot / connector selection | observation | 2026-05-11 | 2026-05-11 | 1 |
| [FK-014](#fk-014) | Multi-instance SaaS: two Shopify stores require separate connector configs in global-config.xml | Shopify / multi-tenant connector design | observation | 2026-05-11 | 2026-05-11 | 1 |
| [FK-015](#fk-015) | ComputerEase (Deltek) API requires CE Live Service relay — not directly internet-accessible | ComputerEase / legacy on-prem ERP connectivity | observation | 2026-05-11 | 2026-05-11 | 1 |
| [FK-016](#fk-016) | HD Portal (Home Depot) is a proprietary contractor-partner API — write endpoints must be explicitly confirmed before scoping write flows | HD Portal / custom API discovery | observation | 2026-05-11 | 2026-05-11 | 1 |
| [FK-017](#fk-017) | QuickBooks Online OAuth access tokens expire after 60 min — Mule flows must detect 401 mid-batch and proactively refresh | QuickBooks Online / OAuth token management | observation | 2026-05-12 | 2026-05-12 | 1 |
| [FK-018](#fk-018) | Trimble Vista ERP does have a REST API via AppXchange — client claim of "no open API" was wrong; API requires AppXchange license purchase and applies only to cloud-hosted Vista | Trimble Vista ERP / API access | observation | 2026-05-12 | 2026-05-12 | 1 |
| [FK-019](#fk-019) | MuleSoft IDP hard limit: 50 pages / 10MB per document submission — spec books or documents over 50 pages must be split before IDP submission | MuleSoft IDP / large document processing | observation | 2026-05-12 | 2026-05-12 | 1 |
| [FK-020](#fk-020) | QuickBooks Enterprise (Desktop) is NOT QuickBooks Online — no REST API, incompatible with QBO connector, requires QBXML Web Connector or third-party bridge | QuickBooks Enterprise / Desktop / API access | observation | 2026-05-12 | 2026-05-12 | 1 |
| [FK-021](#fk-021) | Paylocity API access requires formal signed Web Services Access Request Form — approval is multi-week; must submit before project kickoff | Paylocity / API access | observation | 2026-05-12 | 2026-05-12 | 1 |
| [FK-022](#fk-022) | Sandata CalEVV aggregator: REST API, Basic Auth + EntityGuid header, JSON/XML; alternate EVV vendor registration required before integration can be tested | Sandata / California EVV aggregator | observation | 2026-05-12 | 2026-05-12 | 1 |
| [FK-023](#fk-023) | Legacy EVV platforms (DCI et al.) have no public API — data migration requires file-based bulk export before account termination; schedule export request immediately at scoping | DCI / legacy EVV / data migration | observation | 2026-05-12 | 2026-05-12 | 1 |
| [FK-024](#fk-024) | Always confirm QuickBooks product type at scoping — Online vs Desktop/Enterprise are incompatible integration paths; never proceed to architecture without version confirmation | QuickBooks / scoping question gap | observation | 2026-05-14 | 2026-05-14 | 1 |
| [FK-025](#fk-025) | When Excel or Google Sheets is detected as a data source, confirm file storage location before designing the flow — local files are inaccessible from CloudHub 2.0; must be on SharePoint, OneDrive, or Google Drive | Excel / Google Sheets / CloudHub 2.0 file access | observation | 2026-05-14 | 2026-05-14 | 1 |
| [FK-026](#fk-026) | Time-varying config (API pricing, rate limits, external identifiers) must never be hardcoded in source files — always externalize to a config file in the relevant folder | DSPipeline / tooling conventions | observation | 2026-05-15 | 2026-05-15 | 1 |

---

## FK-001 — POST body reverse-engineering from GET response
Date: 2026-05-10
Project: general (recurring across multiple projects)
Trigger: System has a REST API but POST/PUT body is undocumented or spec is missing write schemas.
         Common with: manufacturing ERPs (SYSPRO, Epicor), older SaaS platforms, in-house systems.

Scenario:
  Client says "we have an API" but cannot provide POST body schema.
  Developer asks client → client escalates to their IT team → IT team says "check the docs" →
  docs only show GET examples → project stalls for 1-2 weeks.

What failed:
  Asking client for data structure / API docs — they either don't have it or route it through
  people who don't know either. Open-ended questions cause open-ended delays.

What worked:
  1. GET first — hit all discoverable GET endpoints, capture full response shapes
  2. Classify every field in the GET response:
       SERVER_GENERATED (IDs, timestamps, status) → exclude from POST
       REQUIRED_ON_CREATE (non-null, business-key fields) → include in minimal POST
       OPTIONAL_ON_CREATE (nullable, has defaults) → include in second attempt
       ENUM_UNKNOWN (string field, valid values unknown) → try values seen in GET responses
  3. Minimal POST first — only REQUIRED_ON_CREATE fields. Read every 400/422 error literally.
     Each validation error tells you exactly what's missing or wrong.
  4. Expand iteratively — add one group of optional fields at a time to isolate constraints.
  5. Document working curl + confirmed field contract in api-discovery/{system}-contract.md
  6. Ask client ONLY about what testing cannot determine — with a best guess already provided.

Client question template that worked:
  "We tested the {System} API and confirmed the write contract for {entity}.
   We identified {N} points we cannot determine from testing. For each, please confirm
   our best guess or choose the correct option: [specific question + options]"

Promotes to: docs/PLANNING_CONTEXT.md (API CONTRACT DISCOVERY PROTOCOL section) — DONE 2026-05-10

---

## FK-002 — SYSPRO ERP: no dedicated connector, HTTP with basic auth
Date: 2026-05-10
Project: general
Trigger: Client uses SYSPRO ERP. Architect looks for connector on Exchange.

Scenario:
  No dedicated MuleSoft connector exists for SYSPRO on Anypoint Exchange.
  SYSPRO has two API surfaces depending on version:
    - SYSPRO 7 and earlier: SOAP Web Services only (WCF-based)
    - SYSPRO 8+: REST API at /syspro/api/v1 with basic auth (userId + password + companyId)
  Client often doesn't know which version they're on.

What worked:
  1. Check connector-registry.json → entry exists, flagged as "via-http"
  2. Confirm SYSPRO version with client (one specific question: "What version of SYSPRO are you on?")
  3. SYSPRO 8+ REST: use http connector, basic auth, required properties:
       syspro.baseUrl, syspro.userId, syspro.password, syspro.companyId
  4. SYSPRO 7 SOAP: use soap/WSC connector, store WSDL in resources/api/syspro.wsdl
  5. Apply FK-001 (POST reverse-engineering) for any write endpoints — SYSPRO REST docs
     cover GETs well but POST schemas are often missing or outdated in public docs.

Auth note:
  SYSPRO 8 REST requires companyId as a header or query param in addition to basic auth.
  This is non-obvious and not in the main docs — must be discovered via testing.

Promotes to: standards/connector-registry.json SYSPRO notes field (update when verified)

---

## FK-003 — Scaffold profile mismatch: client needs enterprise but decisions.json says standard
Date: 2026-05-10
Project: general
Trigger: Architect sets security=internal and availability=99.9, scaffold selects "standard" profile.
         Client later reveals they have Splunk for observability and expect wire taps + custom alerts.

Scenario:
  Observability requirements (Splunk, Datadog, custom dashboards) are often not stated in
  initial discovery docs — they come out during development or demo review.
  Standard profile doesn't generate wire-tap or external observability config.
  Developer has to retrofit — more expensive than generating it up front.

What worked:
  During PRD extraction, Analyst explicitly asks: "Does the client use any external monitoring
  platform (Splunk, Datadog, Azure Monitor, New Relic)?" even if not mentioned in intake docs.
  If yes → set observability.externalPlatform in decisions.json → scaffold selects enterprise profile.

What failed:
  Assuming "internal security + 99.9 availability" means the client doesn't need enterprise-grade
  observability. Observability tier and security tier are independent decisions.

Promotes to: PLANNING_CONTEXT.md SCAFFOLD PROFILE SELECTION — add explicit observability check
             to profile selection logic when this recurs

---

## FK-004 — MUnit coverage floor vs. coverage theater
Date: 2026-05-10
Project: general
Trigger: Team pursues 100% MUnit coverage, inflating test count with trivial connector mock tests.

Scenario:
  100% coverage requirement causes developers to write tests that mock every connector operation
  just to hit a line — not testing actual flow logic or business rules.
  Tests pass but give false confidence. A real payload transformation bug gets missed because
  the DataWeave is mocked out with a hardcoded return value.

What worked:
  Coverage floors by pattern (80%/75%/60%) with mandatory scenario requirements:
    - Happy path: real DataWeave transform with representative payload
    - Error scenario 1: target system unavailable (connector throws CONNECTIVITY error)
    - Error scenario 2: invalid input (validation failure routed to invalid-message-channel or DLQ)
  These 3 scenarios per flow give more real signal than chasing 100%.

  Explicit exclusions from coverage count:
    - Connector operation calls (mocked by definition in MUnit)
    - Logger statements
    - Error handler re-raise steps

  What IS counted:
    - DataWeave transform logic (must be tested with real payload shapes)
    - Choice router branches (each branch must have at least one test)
    - Retry logic paths
    - Idempotency check branch (duplicate detected → skip)

Promotes to: PLANNING_CONTEXT.md MUnit section (add exclusion list) — planned for Chunk 8

---

## FK-005 — Connector missing HTTP method coverage → raw HTTP + manual token management
Date: 2026-05-10
Project: Zyris UC2 (confirmed), likely recurring
Trigger: A connector exists for a target system but does not support a specific HTTP method
         (commonly PATCH or DELETE) on a specific OData/REST entity. Developer discovers this
         at runtime when the connector throws an unsupported operation error or simply has no
         matching operation in the palette.

Scenario:
  Developer uses a native connector for reads and creates (connector supports those operations).
  Needs to PATCH a record — connector has no PATCH operation for that entity type.
  Falls back to raw HTTP request. But the raw HTTP request needs an OAuth token separately
  because the connector manages tokens internally and doesn't expose them.
  Developer has to build a full manual token subflow: fetch, cache in ObjectStore,
  evict on 401, retry. This subflow becomes permanent infrastructure in the project.

What worked:
  Standard manual OAuth token subflow pattern:
  1. os:retrieve from a dedicated token ObjectStore (TTL slightly less than token expiry, e.g. 55 min for 60-min tokens)
  2. If token empty: HTTP POST to token endpoint, os:store result
  3. on-error-continue for HTTP:UNAUTHORIZED / HTTP:FORBIDDEN:
       os:remove the cached token → flow-ref back to token subflow → retry the original request
  4. Dedicated ObjectStore for token only (maxEntries=1, TTL=55 minutes)

Key detail:
  The token ObjectStore TTL must be slightly LESS than the actual token expiry.
  If TTL equals expiry, the token may expire between the retrieve check and the actual HTTP call.
  Buffer of 5 minutes is sufficient for most OAuth providers.

What failed:
  Using the native connector for reads + raw HTTP for writes with no token coordination.
  The connector and the manual HTTP call each have separate token lifecycles — one expiring
  while the other is still valid causes intermittent 401s that are hard to trace.

Applies to: Any system where a native connector exists but does not cover all required
            HTTP methods. Not specific to any vendor. Confirmed on:
              - D365 ForOperations connector 3.1.13: PATCH on OData entities (UC2, UC3, UC5)
              - Shopify connector 1.1.11: fulfillment_orders GET and fulfillments POST (UC4)
            At least 4 independent instances across 4 separate flows in one client project alone.

Client question that revealed this:
  Not a client question — discovered during development. Architect should check connector
  operation coverage against required HTTP methods BEFORE committing to a connector in
  decisions.json. Add note to connector-registry.json if partial coverage confirmed.

Additional finding (UC4):
  Token eviction on 401 is the single most commonly missed step. UC4's Shopify subflow
  fetches and caches the token correctly but does NOT evict on 401. A stale token silently
  fails all requests for up to 50 minutes. The evict→refresh→retry step is non-negotiable.
  Without it, the caching provides no resilience — only a performance benefit on happy path.

Promotes to: standards/connector-registry.json — add "patchSupport: false" flag to affected
             connectors when verified; scaffold generates manual token subflow automatically
             when this flag is set — READY TO IMPLEMENT in Chunk 7/8

---

## FK-006 — Any paginated REST API requires a while-loop workaround in Mule 4
Date: 2026-05-10
Project: general (Zyris UC3 trigger; applies to all projects)
Trigger: Any REST endpoint that returns results in pages — cursor-based, offset-based,
         nextLink-based, or Link-header-based pagination — where all pages must be fetched
         before processing begins.

Scenario:
  Mule 4 has no native while-loop construct in flows. You cannot write
  "fetch pages until no more pages" as a flow primitive.
  Every developer independently rediscovers this and invents a workaround.
  The workarounds differ across projects, making the codebase inconsistent.

Examples of paginated systems (not exhaustive):
  - cursor-based: HubSpot (after param, paging.next.after in response)
  - nextLink-based: D365 OData (@odata.nextLink in response), Microsoft Graph
  - nextRecordsUrl-based: Salesforce (nextRecordsUrl in response)
  - offset/limit: most custom REST APIs, PostgreSQL REST, many SaaS platforms
  - Link header: GitHub, GitLab, many standard REST APIs (RFC 5988)

The four workarounds and their trade-offs:

  1. until-successful + raise-error (what UC3 does)
     How: raise a custom error (e.g. PAGINATION:DONE) when no more pages;
          catch it outside the until-successful scope
     Problem: any real connectivity error inside the loop is indistinguishable
              from "no more pages" — errors are silently swallowed as pagination termination
     Use when: dataset is small, failure impact is low, simplicity is priority

  2. Recursive sub-flow
     How: sub-flow calls itself with next page token until token is null/empty
     Problem: deep recursion for large datasets hits Mule call stack limits;
              each recursive call holds memory for the accumulated result set
     Use when: dataset is bounded and known to be small (< 500 records)

  3. Batch scope with page-aware iterator
     How: outer scheduler fetches page 1, batch:job processes it, on-complete
          checks for nextPage and triggers next run via scheduler or flow-ref chain
     Problem: complex to implement; pagination state must survive across batch runs
     Use when: very large datasets (10K+ records); need per-record error isolation

  4. Single DataWeave with recursive do-while equivalent
     How: DataWeave `do` block with recursive function accumulates all pages
          via sequential HTTP calls using dw::io or http module functions
     Problem: entire dataset held in memory simultaneously; DataWeave HTTP
              support is limited in Mule 4.x without ee: transform + java helper
     Use when: dataset fits in memory; transform and fetch must be atomic

Recommended default:
  - Up to ~1000 records per run → recursive sub-flow (clean, debuggable)
  - Over 1000 records per run → batch scope with page-aware iterator
  - Never use until-successful as a pagination loop in new code

What to do in code:
  For recursive sub-flow approach:
  ```xml
  <sub-flow name="fetch-all-pages">
    <flow-ref name="fetch-one-page"/>
    <choice>
      <when expression="#[vars.nextPageToken != null and !isEmpty(vars.nextPageToken)]">
        <flow-ref name="fetch-all-pages"/>  <!-- recursive call -->
      </when>
    </choice>
  </sub-flow>
  ```
  Accumulate results in a variable before recursing.

Promotes to: standards/scenarios/ — add pagination handling note to any scenario file
             where the source system is a REST API (scheduled-sync, data-migration,
             api-aggregation, webhook-ingestion). Template for recursive sub-flow
             goes into scaffold/xml-templates/ in Chunk 7.

---

## FK-007 — Watermark must advance AFTER processing confirms success, not before
Date: 2026-05-10
Project: general (Zyris UC1 and UC3 both have this bug)
Trigger: Any scheduled-sync or batch flow that uses a watermark (last-processed timestamp
         or sequence ID stored in ObjectStore) to track incremental progress.

Scenario:
  Developer stores the new watermark value before iterating over fetched records.
  Rationale: "if we fail mid-loop, at least the watermark is already updated."
  Actual result: if processing fails on record N of M, the watermark has advanced
  past all M records. On next run, those records are not fetched again.
  Records between N and M are permanently skipped — silently, with no error.
  This is data loss with no alert and no recovery path.

What failed:
  ```xml
  <os:retrieve .../>  <!-- get lastSyncTime -->
  <!-- fetch records -->
  <os:store .../>     <!-- store new watermark  ← WRONG: before processing -->
  <foreach>
    <!-- process each record — failure here loses records N+1 to M -->
  </foreach>
  ```

What worked:
  Move the watermark store to AFTER the foreach completes successfully.
  Use a try/error-handler around the foreach: only advance watermark on clean exit.
  ```xml
  <os:retrieve .../>   <!-- get lastSyncTime -->
  <!-- fetch records -->
  <try>
    <foreach>
      <!-- process each record -->
    </foreach>
    <os:store .../>    <!-- store new watermark ONLY after all records succeed -->
    <error-handler>
      <on-error-continue>
        <logger level="ERROR" message="Processing failed. Watermark NOT advanced. Will retry from #[vars.lastSyncTime]."/>
        <!-- optionally: page on-call, publish to DLQ -->
      </on-error-continue>
    </error-handler>
  </try>
  ```

  For batch scope: advance watermark in on-complete only if
  `batchJobResult.failedOnCompletePhase == 0 and batchJobResult.failedRecords == 0`.

Additional consideration:
  The watermark value to store should be the MAX of the processed records' timestamps,
  not the current clock time. If records have timestamps and the API returns them
  slightly out of order, using now() as the new watermark can miss records that
  arrived after the query was built but before now().

Applies to: Any scheduled-sync (pattern D), batch (pattern C), data-migration (pattern K),
            or CDC polling flow that uses watermarking. System-agnostic.

Promotes to: standards/scenarios/scheduled-sync.md and standards/scenarios/batch.md —
             add explicit watermark advancement rule to both scenario files.

---

## FK-008 — Webhook idempotency: return 200 always, store event ID after success, route failures to DLQ
Date: 2026-05-10
Project: Zyris UC5 (HubSpot merge webhook → D365 deactivation)
Trigger: Any inbound webhook flow where the source system (HubSpot, Shopify, Stripe, GitHub, etc.)
         retries on non-2xx responses. Developer must ensure: (a) no duplicate processing,
         (b) source doesn't get stuck retrying, (c) failures don't silently disappear.

Scenario:
  HubSpot (and most SaaS webhook sources) treats any non-2xx response as a delivery failure
  and retries — sometimes aggressively (exponential backoff for hours). Developer has three
  competing constraints:
    1. Return non-2xx to get a retry  → source retries; duplicate risk on next attempt
    2. Return 200 always              → source stops retrying; failed events silently lost
    3. Return 200 + idempotency store → prevents retries of duplicates, but a failure before
       the store means the event is lost with no way to recover

  UC5 correctly handles constraints 1 and 2 (always 200, eventId stored after success).
  It misses constraint 3: if the D365 PATCH fails with a non-auth error (D365 500, timeout),
  the catch-all returns 200 to HubSpot. HubSpot doesn't retry. The eventId is never stored
  (storage only happens post-success). Result: the loser record is never deactivated, silently.

What failed:
  Any of these alone:
    - Return non-2xx  → retry storms from HubSpot; intermittent infra errors cause flood
    - Return 200 always with no failure routing → silent data loss on non-auth errors
    - Store eventId before processing → duplicate detection blocks legitimate retry on partial failure

What worked (complete pattern):
  1. Always return 200 OK to the webhook source — non-2xx triggers retry storms
  2. Deduplicate by eventId BEFORE processing (os:contains → skip if seen)
  3. Process: validate → route → write to downstream system
  4. Store eventId to dedup store ONLY AFTER all downstream writes succeed (not before)
  5. On non-auth processing failure: publish to DLQ (not return non-2xx; don't store eventId)
     → DLQ alert pages on-call → on-call replays from DLQ manually or via retry flow
     → On replay: eventId not yet in store, so it processes normally

  The DLQ in step 5 is critical. Without it:
    - You return 200 (source won't retry) + eventId not stored (dedup won't block retry if one came)
    - The failed event disappears with only a log line as evidence

  The sequence guarantees:
    - Duplicate events: caught by dedup check, return 200, no downstream call
    - Successful events: processed once, stored, never re-processed
    - Failed events: go to DLQ for manual/automated replay, never silently lost

Additional detail:
  eventId storage payload should include: processedAt, winnerId/loserId, eventType, downstream
  entity key — enough context for ops to understand the event without re-querying the source.

Applies to: Any flow triggered by an inbound webhook from a system that retries on non-2xx.
            System-agnostic: HubSpot, Shopify, Stripe, GitHub, DocuSign, Salesforce Platform
            Events, custom webhook producers. Pattern J (webhook-ingestion) always applies this.

Promotes to: standards/scenarios/webhook-ingestion.md — add full 5-step idempotency pattern
             and DLQ requirement. Scaffold generates this automatically for pattern J.

---

---

## FK-009 — `on-error-continue` as direct child of `async` is invalid Mule 4 XML
Date: 2026-05-10
Project: general (found during chunk 7 scaffold template audit)
Trigger: Developer adds error handling inside an `async` block to prevent wire-tap or
         notification failures from surfacing to the primary flow.

Scenario:
  The intuitive pattern is to put `on-error-continue` directly inside `async` so any error
  in the async block is silently consumed. This compiles in some tooling versions but fails
  at runtime — or is rejected by the Mule schema validator during project load.
  The correct parent element for `on-error-continue` is always `error-handler`, and
  `error-handler` can only appear inside `try`, `flow`, or `sub-flow`.

What failed:
  ```xml
  <!-- INVALID — on-error-continue cannot be a direct child of async -->
  <async doc:name="Wire Tap">
      <anypoint-mq:publish .../>
      <on-error-continue type="ANY">
          <logger level="WARN" .../>
      </on-error-continue>
  </async>
  ```
  Result: schema validation failure on project load; Mule Studio may show no error
  but Runtime rejects it.

What worked:
  ```xml
  <async doc:name="Wire Tap — Audit Capture">
      <try doc:name="Wire Tap with Error Isolation">
          <anypoint-mq:publish .../>
          <error-handler>
              <on-error-continue type="ANY">
                  <logger level="WARN" .../>
              </on-error-continue>
          </error-handler>
      </try>
  </async>
  ```
  The `try` scope creates a valid error-handler attachment point inside the `async` block.
  Errors in the publish are caught by the `on-error-continue` and consumed — the async
  block exits cleanly and the primary flow is unaffected.

Applies to: Any `async` block containing operations that can fail (MQ publish, HTTP request,
            external notification). Wire-tap, Slack notification, audit trail publish — all
            require this pattern. The outer `async` only provides the thread-fork boundary;
            error isolation requires the inner `try`.

Promotes to: scaffold/xml-templates/snippets/wire-tap.xml — FIXED in chunk 7 audit 2026-05-10

---

## FK-010 — `set-variable` does not update the Mule event's `correlationId`
Date: 2026-05-10
Project: general (found during chunk 7 scaffold template audit)
Trigger: HTTP listener flow copies inbound X-Correlation-ID header to a flow variable
         so it can be included in outbound calls and error payloads.

Scenario:
  Developers store the inbound correlation ID as a variable:
    `<set-variable variableName="correlationId" value="#[attributes.headers['X-Correlation-ID'] default correlationId]"/>`
  This makes `vars.correlationId` available in DataWeave transforms, but it does NOT
  update the actual Mule event's built-in `correlationId`. The built-in `correlationId`
  is what appears in default log output, what error handlers reference via
  `#[correlationId]` (no `vars.` prefix), and what propagates to child flows.
  If the variable name shadows the built-in, DataWeave expressions that use
  `correlationId` (no prefix) will resolve to the variable in some contexts and
  to the built-in Mule event property in others — creating inconsistency.

What failed:
  ```xml
  <set-variable variableName="correlationId"
                value="#[attributes.headers['X-Correlation-ID'] default correlationId]"/>
  ```
  This creates a flow variable, not a Mule event correlationId update. The Mule runtime
  logging framework still uses the internally-generated UUID as the correlation ID
  in all log output and error handler context.

What worked:
  ```xml
  <set-correlation-id
      value="#[attributes.headers['X-Correlation-ID'] default correlationId]"
      doc:name="Adopt Inbound Correlation ID"/>
  ```
  `set-correlation-id` is a first-class Mule 4.6+ element that updates the Mule event's
  actual correlation ID. After this call, `correlationId` in DataWeave expressions,
  log output, error handler context, and all child flow invocations uses the adopted value.

Key detail:
  `set-correlation-id` was introduced in Mule 4.6.0. Projects targeting Mule < 4.6 must
  use a flow variable with a unique name (e.g. `httpCorrelationId`) and never shadow
  the built-in `correlationId` keyword. As of the BMAD system standard (Mule 4.8.0),
  `set-correlation-id` is the correct and only approach.

Applies to: Every HTTP listener flow that must adopt an inbound X-Correlation-ID.
            Also applies to MQ subscriber flows that receive correlationId in message
            properties — use `set-correlation-id` there too.

Promotes to: scaffold/xml-templates/triggers/http-listener.xml — FIXED in chunk 7 audit 2026-05-10

---

## FK-011 — MUnit `expectedErrorType` must not be set when Global_Error_Handler consumes the error
Date: 2026-05-10
Project: general (found during chunk 7 scaffold template audit)
Trigger: MUnit test for a connectivity failure scenario (e.g., HTTP target unavailable)
         uses `expectedErrorType="MULE:COMPOSITE_ROUTING"` expecting the error to propagate
         to the test.

Scenario:
  The Global_Error_Handler uses `on-error-continue` for all error categories. `on-error-continue`
  consumes the error — the flow completes without propagating an exception. A MUnit test that
  sets `expectedErrorType` on its event expects an exception to reach the test boundary. Since
  the error handler consumed the error, no exception propagates, and the test fails with:
    "Expected error of type X but no error was thrown."

  This is especially confusing because the flow IS handling the error correctly — the test
  setup is just wrong.

What failed:
  ```xml
  <munit:test name="test-connectivity-failure" expectedErrorType="MULE:COMPOSITE_ROUTING">
      <!-- trigger a connectivity error -->
  </munit:test>
  ```
  The Global_Error_Handler's `on-error-continue` converts the error into a 503 response.
  The test sees a successful flow execution (returning the error payload), not an exception.
  Result: "Expected error but no error was thrown" — test always fails.

What worked:
  Remove `expectedErrorType`. Assert on the error response payload that the Global_Error_Handler
  set instead:
  ```xml
  <munit:test name="test-connectivity-failure">
      <!-- trigger a connectivity error -->
      <munit:validation>
          <munit-tools:assert-equals actual="#[vars.httpStatus]" expected="#[503]"/>
          <munit-tools:assert-equals actual="#[payload.errorCode]" expected="#['SERVICE_UNAVAILABLE']"/>
      </munit:validation>
  </munit:test>
  ```
  Also ensure the test event includes all required attributes (method, requestPath,
  X-Correlation-ID header) so the error handler can build a complete error envelope.

Rule:
  If the flow under test has an error handler that uses `on-error-continue`, NEVER set
  `expectedErrorType` in the MUnit test. The error is consumed, not propagated.
  Assert on the flow's output payload and variables instead.
  Only use `expectedErrorType` when the flow uses `on-error-propagate` (error re-thrown)
  or has no error handler (error propagates to MUnit framework).

Applies to: Any MUnit test for a flow whose error handler uses `on-error-continue`.
            In the BMAD system this means ALL flows — Global_Error_Handler always uses
            `on-error-continue` by design.

Promotes to: scaffold/xml-templates/munit-base.xml — FIXED in chunk 7 audit 2026-05-10

---

## FK-012 — Claim-check S3 getObject returns InputStream — `output application/java` produces byte array
Date: 2026-05-10
Project: general (found during chunk 7 scaffold template audit)
Trigger: Claim-check retrieve step reads a JSON payload from S3 (or Azure Blob) using
         the Amazon S3 connector's getObject operation.

Scenario:
  S3 getObject returns the object content as an InputStream wrapped in Mule's message payload.
  The DataWeave transform after the retrieve step must convert this InputStream into a
  usable data structure. The wrong output type causes the downstream flow to receive raw bytes
  instead of a structured object.

What failed:
  ```xml
  <ee:transform>
      <ee:message>
          <ee:set-payload><![CDATA[%dw 2.0
  output application/java
  ---
  payload]]></ee:set-payload>
      </ee:message>
  </ee:transform>
  ```
  `output application/java` with an InputStream payload produces a raw `byte[]` Java object.
  Subsequent DataWeave transforms cannot access fields on a byte array — they fail with
  a type error. Even if the downstream connector accepts bytes, the original JSON structure
  is lost.

What worked:
  ```xml
  <ee:transform>
      <ee:message>
          <ee:set-payload><![CDATA[%dw 2.0
  output application/json
  ---
  payload]]></ee:set-payload>
      </ee:message>
  </ee:transform>
  ```
  `output application/json` triggers Mule's DataWeave reader to parse the InputStream as
  JSON and produce a structured object. Subsequent DataWeave expressions can access fields
  normally (e.g., `payload.customerId`).

Alternative (if original content type is unknown):
  Use `output application/octet-stream` to pass bytes through unchanged, then let the next
  transform determine the type. But for claim-check payloads (always JSON in the BMAD system),
  `output application/json` is always correct.

Additional note:
  After reading and processing the retrieved payload, the original S3 object should be
  deleted (or archived) to prevent re-processing and control storage costs:
  ```xml
  <s3:delete-object config-ref="S3_Config"
      bucketName="${s3.claimCheck.bucket}"
      key="#[vars.claimCheckKey]"
      doc:name="Delete Claim Check Payload"/>
  ```

Applies to: Any claim-check retrieve step reading from S3, Azure Blob, or SFTP.
            The output type mistake is easy to make because `application/java` looks like
            "just pass through the Java object" but actually transforms to byte array.

Promotes to: scaffold/xml-templates/snippets/claim-check-retrieve.xml — FIXED in chunk 7 audit 2026-05-10

---

---

## FK-013 — HubSpot connector registry vs. sales call divergence
Date: 2026-05-11
Project: Zyris (scoping analysis)
Trigger: Scoping notes explicitly state "we do not have a HubSpot connector that's pre-built" (said by MuleSoft SE on the Feb 17, 2026 sales call). Connector registry (lastVerified 2026-05) shows `hubspot-crm` → `mule-hubspot-connector 1.0.0` with groupId `com.mulesoft.connectors`.

Scenario:
  Sales calls often use out-of-date connector knowledge — SEs may not know about recently
  released connectors, or may be referring to a connector that was community-built vs. officially
  supported. The registry entry for HubSpot uses `http-generic-config.xml` as its configTemplate
  and the docsUrl points to HubSpot developer docs (not MuleSoft docs page), suggesting this
  may be a thin wrapper or recently added connector with limited operation coverage.

  Architect cannot assume the registry entry = full native connector support without Exchange verification.

What to do:
  Before committing to `mule-hubspot-connector` in decisions.json:
  1. Visit Anypoint Exchange and confirm: is this a MuleSoft-certified connector or a community connector?
  2. Confirm which operations it covers (List/Get contacts, Create/Update contacts, Search, Webhooks)
  3. If operation coverage is partial → fall back to HTTP connector with manual token management (FK-005 pattern)
  4. If full coverage → use native connector and document which version was verified

What failed:
  Assuming scoping call SE statements about connector availability are current.
  SE statements are point-in-time and connector Exchange changes frequently.

Client question used:
  N/A — internal check only. Do not ask client.

Promotes to: connector-registry.json — add `exchangeVerified: true/false` flag + `operationCoverage` list
             to any connector where partial coverage is suspected (after second occurrence)

---

## FK-014 — Multi-instance SaaS: two stores of the same platform require separate connector configs
Date: 2026-05-11
Project: MRN (scoping analysis)
Trigger: Client operates two instances of the same SaaS platform (e.g., two Shopify stores, two Salesforce orgs, two NetSuite accounts) and both need to be connected to MuleSoft in the same project.

Scenario:
  MRN operates two Shopify stores (one for products/consumables, one for LegitScript certification).
  The MuleSoft SE stated "it's just pointing the second one into MuleSoft and reusing workflows."
  This is true at the flow level, but NOT at the connector config level.
  A single `<shopify:config>` in global-config.xml is bound to one shopName + one accessToken.
  Two Shopify instances require two separate connector config elements:
    `<shopify:config name="Shopify_Config_Store1" .../>` and
    `<shopify:config name="Shopify_Config_Store2" .../>`
  Flows can be parameterized (pass the config-ref as a variable) or duplicated (simpler but verbose).
  The same applies to any multi-instance SaaS: two HubSpot portals, two NetSuite accounts,
  two Mailchimp accounts across business units.

What to do:
  1. Create one connector config element per instance, with environment-specific properties:
       shopify.store1.shopName, shopify.store1.accessToken
       shopify.store2.shopName, shopify.store2.accessToken
  2. If the flows are identical (same transforms, same logic), use a single parameterized sub-flow
     that accepts config-ref as a parameter. DataWeave does not accept connector config-ref
     as a variable — use a choice router keyed on a flow variable (e.g., vars.shopifyInstance)
     to select which connector config to use.
  3. If the flows differ (different objects, different transforms), generate separate flow files
     per instance — cleaner than conditional branching in shared flows.

What failed:
  Assuming one connector config serves multiple instances of the same system. MuleSoft connector
  configs are static — credentials are bound at config element level, not at runtime invocation level.

Applies to: Any client with multiple instances of the same SaaS platform (Shopify, HubSpot,
            NetSuite, Salesforce, Mailchimp, etc.). Common in multi-brand, multi-region, or
            multi-subsidiary businesses.

Promotes to: standards/DESIGN_STANDARDS.md — add multi-instance connector note when verified on second client

---

## FK-015 — ComputerEase (Deltek) API requires CE Live Service relay — not directly internet-accessible
Date: 2026-05-11
Project: Peerless (scoping analysis)
Trigger: Client uses ComputerEase (Deltek specialty contractor ERP). Architect or developer attempts to call ComputerEase API directly from MuleSoft CloudHub.

Scenario:
  ComputerEase is a Windows-based legacy application hosted on a client-managed server (GCP VM in Peerless case).
  Unlike modern SaaS, the CE API does NOT expose endpoints directly to the internet.
  Traffic must route through Deltek's "CE Live Service" — a Windows service installed on the same VM as ComputerEase —
  which then routes requests through Deltek's servers back to the CE application.
  This is a non-standard relay architecture unique to Deltek's legacy product line.

  Additionally: the API is NOT available in the ComputerEase sandbox (practice) environment.
  All development and testing requires controlled access to the production environment.
  GCP firewall rules must be configured to allow inbound traffic from MuleSoft CloudHub 2.0 static IPs.

What to do:
  1. Confirm CE Live Service is installed and configured by Deltek support BEFORE starting architecture.
     This is a critical path blocker — architecture cannot be finalized without knowing the API endpoint format.
  2. Obtain the CE API base URL format from Deltek support (expected: routes through Deltek relay endpoint,
     not directly to the client's GCP IP).
  3. Configure GCP firewall rule: allow inbound TCP/443 from MuleSoft CloudHub 2.0 static IP ranges.
  4. Create a dedicated CE API user (pw-mate pattern + API access group) — must be done via maintenance login, not regular CE UI.
  5. Plan for production-only testing with strict GET-only access until UAT sign-off.

What failed:
  Assuming ComputerEase API is a standard REST API accessible directly by IP:port.
  Direct telnet to GCP external IP confirmed no service listening on 443 or 8081 — the service is not directly exposed.
  CE Live Service must mediate all connections.

Status: observation
Promotes to: standards/playbooks/computerease/computerease_playbook.json (once verified on second client, promote connectivity model to this entry)

---

## FK-016 — HD Portal (Home Depot) is a proprietary partner API — write endpoints must be confirmed before scoping write flows
Date: 2026-05-11
Project: Peerless (scoping analysis)
Trigger: Client is a Home Depot Pro contractor partner. Architect needs to assess HD Portal API scope for a Salesforce → HD Portal correction sync flow.

Scenario:
  HD Portal (Home Depot Service Center) is a proprietary system accessed by HD Pro contractor partners.
  API access is not self-service — credentials are brokered through the client's HD partner contact (not a developer portal).
  GET operations were confirmed during discovery calls (Apr 2026) — leads, quotes, and order data can be read.
  Write operations (POST/PATCH — needed for bidirectional sync back to HD) were NOT tested during discovery.
  It is unknown whether HD Portal exposes write endpoints to contractor partners at all, or under what conditions.

What to do:
  1. Before scoping any flow that writes to HD Portal: explicitly confirm write endpoints exist and are available to the client's API credentials.
  2. Ask the client to verify with their HD partner contact (Greg) which entities can be written to via API.
  3. If write endpoints are unavailable: scope the Salesforce → HD Portal sync as a notification/alert flow only (not a data write).
  4. Document download endpoint (PDF contracts 299A/299B) must also be explicitly confirmed — not assumed.

What failed:
  Assuming API key access implies full CRUD. Many partner APIs are intentionally read-only from the partner side.

Status: observation
Promotes to: standards/playbooks/hd-portal/hd-portal_playbook.json (once write endpoint status confirmed, update playbook)

*Last updated: 2026-05-11*
*Next review: after first project using Chunk 4+ agents*

---

## FK-017 — QuickBooks Online OAuth access tokens expire after 60 minutes
Date: 2026-05-12
Project: agile-mind-customer (first engagement using QuickBooks Online)
Trigger: Any Mule flow that integrates with QuickBooks Online API.

Scenario:
  QuickBooks Online OAuth 2.0 access tokens have a hard 60-minute expiry — shorter than most SaaS APIs.
  For batch flows (e.g. syncing 200+ invoices), a single Mule job can outlast the token's validity.
  Additionally, Intuit's Nov 2025 policy change means refresh tokens may rotate every 24–26 hours,
  so the stored refresh token itself needs to be updated after each use.

Key facts:
  - Access token TTL: 60 minutes (non-negotiable; cannot be extended)
  - Refresh token TTL: historically 100 days, now up to 5 years but may rotate every 24–26 hours
  - 401 response handling: detect 401 → refresh access token using stored refresh token → retry once.
    If second attempt also returns 401: flag account as disconnected (admin revoked app access).
  - realmId (Company ID): mandatory on every QB API call; must be stored as secure property
  - Rate limits: 500 req/min per realmId, max 10 concurrent; batch endpoint: 120 req/min
  - Sandbox: auto-provisioned per Intuit developer account; shares production rate limits
  - App registration: must be registered in Intuit Developer Portal (developer.intuit.com)
    — clientId + clientSecret are generated there; requires QB Company Admin to complete OAuth consent flow

What to do:
  1. Use the MuleSoft QuickBooks Online connector (com.mulesoft.connectors/mule-quickbooks-online-connector)
     which handles token refresh internally when properly configured with qb.refreshToken.
  2. Store qb.clientId, qb.clientSecret, qb.companyId, qb.refreshToken in Secrets Manager.
  3. For batch flows: set maxConcurrency ≤ 5 to stay under the 10-concurrent-request limit.
  4. Add 401 retry logic at the HTTP level as a safety net even when using the connector.
  5. Flag admin-revoked tokens as HIGH alerts — they require manual re-consent, not automated recovery.

What failed:
  Not yet observed in production. Flagged from web research on Intuit API behavior during Scout S1.

Status: observation
Promotes to: standards/playbooks/quickbooks-online/quickbooks-online_playbook.json (create after first full engagement)

*Added: 2026-05-12 — Source: web research during Scout S1 for agile-mind-customer*

---

## FK-018 — Trimble Vista ERP does have a REST API via AppXchange — client claim of "no open API" was wrong
Date: 2026-05-12
Project: bear-electrical-customer (Scout S1 research)
Trigger: Client is on Trimble Vista ERP. Scoping notes state "Vista does not have an open API and integrations must run exclusively through the Trimble marketplace."

Scenario:
  Client developers stated Vista has no open API and that integrations must go through the Trimble Marketplace.
  Web research during Scout S1 confirmed: Trimble Vista does expose a bidirectional REST API via AppXchange
  (direct-api.xchange.trimble.com). The API IS the Trimble Marketplace integration path — the client's statement
  is partially correct but framed in a way that suggests no API access, which is inaccurate.

Key facts:
  - REST API base URL: direct-api.xchange.trimble.com
  - Auth: API keys (per-vendor, scoped) + OAuth clients for third-party integrations
  - Rate limits: 2,000 requests/min (rolling 60-second window; HTTP 429 on excess)
  - Test environment: api-test.xchange.trimble.com (confirmed available)
  - Applies to: cloud-hosted Vista instances ONLY (not on-premise)
  - License: Requires AppXchange API license purchase from Trimble Marketplace — not free
  - Documentation: https://direct-api.xchange.trimble.com/docs/vista-api-overview
  - No dedicated MuleSoft connector — use MuleSoft HTTP connector with API key header

What to do:
  1. Ask client to confirm whether their Vista instance is cloud-hosted or on-premise.
  2. Ask whether they have purchased (or can purchase) the AppXchange API license.
  3. If cloud-hosted + license available: scope Vista integration using MuleSoft HTTP connector.
  4. If on-premise: the API path is NOT available — must use file-based integration or vendor middleware only.
  5. Reach out to Trimble support to confirm API scope (which Vista modules/entities are exposed) before flow design.
  6. Register an API user per vendor (DataSkate) in AppXchange — separate from the Bear IT admin user.

What failed:
  Accepting the client developer statement at face value without web research.
  The API exists and is the intended integration path — "Trimble Marketplace = API access point," not API absence.

Status: observation
Promotes to: standards/playbooks/trimble-vista/trimble-vista_playbook.json (create once Vista integration is confirmed and scoped)

*Added: 2026-05-12 — Source: web research during Scout S1 for bear-electrical-customer*

---

## FK-019 — MuleSoft IDP hard limit: 50 pages / 10MB per document submission — must split large PDFs first
Date: 2026-05-12
Project: bear-electrical-customer (Scout S1 research)
Trigger: Any MuleSoft IDP use case where source documents may exceed 50 pages or 10MB.

Scenario:
  Bear Electrical receives public works bid specification books of 100+ pages (confirmed from sample files).
  MuleSoft Anypoint IDP has a hard limit of 50 pages and 10MB per document submission — this cannot be
  overridden. Submitting a 100+ page PDF will fail or silently truncate.
  The only valid approach is to split the PDF before submission.

Key facts:
  - IDP hard limits: 50 pages per submission, 10MB per file
  - Minimum polling interval after submit: 10 seconds (per IDP quota docs)
  - P50 extraction latency: 7.6s, P99: 13.4s (per connector-registry.json)
  - Status flow: ACKNOWLEDGED → IN_PROGRESS → RESULTS_PENDING → SUCCEEDED / FAILED / PARTIAL_SUCCESS / MANUAL_VALIDATION_REQUIRED
  - PARTIAL_SUCCESS and MANUAL_VALIDATION_REQUIRED are valid outcomes — design flows to handle them, not just SUCCEEDED/FAILED
  - For 100+ page PDFs: split to 40-page chunks with 5-page overlap at boundaries to avoid splitting mid-clause
  - Adobe PDF Services (HTTP connector) can split PDFs programmatically before IDP submission
  - Alternative: use page-range extraction to pull only known relevant sections (e.g. Notice Inviting Bids, Special Provisions, Insurance Requirements) rather than processing all pages

What to do:
  1. Before UC1 architecture: agree on whether to process full PDF (split strategy) or targeted sections only.
  2. If full document: add pre-processing sub-flow using Adobe PDF Services to split into 40-page chunks.
  3. If targeted sections: design IDP document action to extract from pages 1-50 of spec (cover + bid terms typically within this range for public works specs).
  4. Design IDP document action fields based on confirmed canonical-bid fields in canonical-extensions.yaml.
  5. Handle PARTIAL_SUCCESS: define minimum confidence thresholds per field; route to manual review queue if below threshold.
  6. 90% accuracy threshold (set by Brent Paulson) applies to the full extraction pipeline — not just IDP.

What failed:
  Not yet observed in production. Flagged from connector-registry.json research during Scout S1.
  Sample spec files in scoping/ confirmed 100+ pages (City of Encinitas CS22B = 175+ page PDF).

Status: observation
Promotes to: standards/playbooks/mulesoft-idp/mulesoft-idp_playbook.json (create after first full IDP engagement delivery)

*Added: 2026-05-12 — Source: connector-registry.json + sample spec book analysis during Scout S1 for bear-electrical-customer*

---

## FK-020 — QuickBooks Enterprise (Desktop) ≠ QuickBooks Online — no REST API, incompatible with QBO connector
Date: 2026-05-12
Project: cas-industries-customer (Scout S1 research)
Trigger: Client says "we're on QuickBooks Enterprise." Sales team demos Salesforce-QuickBooks integration without distinguishing Desktop vs. Online. Architect selects `quickbooks-online` connector — it will not work.

Scenario:
  CAS Industries confirmed they are on QuickBooks Enterprise (the Desktop product, not QuickBooks Online).
  The MuleSoft `quickbooks-online` connector (com.mulesoft.connectors/mule-quickbooks-online-connector)
  communicates with Intuit's REST API v3 — which is exclusively for QuickBooks Online (cloud).
  QuickBooks Desktop/Enterprise has NO REST API. It uses:
    - QBXML: an XML format exchanged via a Windows-only Web Connector service that runs on the QB host machine
    - The Web Connector polls for work; your server (MuleSoft) cannot push to it — the Desktop app pulls
    - SDK: Intuit QuickBooks Desktop SDK (Windows only; not suitable for CloudHub deployment)
  This makes cloud-based MuleSoft integration architecturally difficult:
    - Direct REST call to QB Desktop: not possible (no listening REST service)
    - QBXML via WSC connector: requires Windows-based intermediary; not native CloudHub 2.0
    - CData JDBC Driver: third-party bridge that translates JDBC calls to QBXML — viable but adds vendor dependency
    - Conductor (conductor.is): REST API wrapper around QB Desktop SDK — cloud-accessible but adds SaaS cost

Key facts:
  - MuleSoft QBO connector: OAuth 2.0 REST API v3 — FOR QuickBooks ONLINE ONLY
  - QB Desktop Web Connector: local Windows service, polls your SOAP endpoint — NOT CloudHub-accessible natively
  - CData JDBC Driver approach: MuleSoft DB connector → CData JDBC jar → QBXML over Web Connector → QB Desktop
    (requires CData license; JDBC jar must be placed in shared lib on CloudHub 2.0)
  - QB Online upgrade path: if CAS can migrate to QBO, the native connector works and all integration patterns apply

What to do (as DataSkate):
  1. Immediately clarify with CAS: "You're on QuickBooks Enterprise — is this the Desktop (local/server install) version
     or QuickBooks Online Advanced (cloud)?" These are different products despite similar names.
  2. If Desktop confirmed: present three options with trade-offs:
     (a) CData JDBC bridge — adds ~$500-2000/yr license; proven MuleSoft path
     (b) Conductor REST wrapper — adds SaaS subscription; cleaner REST interface
     (c) Migrate to QBO — eliminates the problem entirely; Intuit sales incentive
  3. Do NOT scope UC1 (Salesforce ↔ QuickBooks) until this is resolved.
  4. Flag as P0 blocker in intake questionnaire and scout-s1.md.

What failed:
  Sales teams routinely conflate "QuickBooks" with "QuickBooks Online" because QBO is the product
  pushed in modern demos. A client saying "QuickBooks Enterprise" almost always means Desktop.
  Josh Bates (sales) asked "which version?" and got "Enterprise" but did not follow up to confirm
  Desktop vs. Online — a common gap in pre-sales technical qualification.

Client question that reveals this:
  "You mentioned QuickBooks Enterprise — is your installation cloud-hosted by Intuit (QuickBooks Online),
   or is it installed on a local server or Windows PC at your office? The integration approach is
   completely different depending on the answer."

Status: observation
Promotes to: PLANNING_CONTEXT.md Critical Notes (QuickBooks) — add QB Desktop/Enterprise warning when this is seen on a second client

*Added: 2026-05-12 — Source: web research + Intuit developer docs during Scout S1 for cas-industries-customer*

---

## FK-021 — Paylocity API access requires formal signed request form — multi-week approval; submit before kickoff
Date: 2026-05-12
Project: cas-industries-customer (Scout S1 research)
Trigger: Any project integrating with Paylocity (HR/payroll platform). Developer tries to use Paylocity API and finds no self-service signup path.

Scenario:
  Paylocity API access is gated behind a formal "Web Services Access Request Form."
  The form must be completed with details of the integration (which endpoints, which webhooks),
  signed by a Paylocity-authorized contact at the client, and submitted to the client's assigned
  Paylocity Sales Account Executive or Current Client Consultant.
  Only after approval does Paylocity issue OAuth 2.0 Client ID + Client Secret and sandbox access.
  Approval timeline is not SLA-bound but is typically multi-week.

Key facts:
  - Auth: OAuth 2.0 Client Credentials (Bearer token)
  - Base URL: https://api.paylocity.com/api/v2/
  - Sandbox: provided after form approval; not self-service
  - Form required fields: integration description, endpoints needed, webhook subscriptions, authorized contact
  - No dedicated MuleSoft connector on Anypoint Exchange — use HTTP connector with OAuth2 config
  - Rate limits: not publicly documented; assumed standard (confirm with Paylocity during onboarding)
  - Developer portal: developer.paylocity.com

What to do:
  1. Flag in intake questionnaire: "Submit Paylocity Web Services Access Request Form immediately.
     Provide the name and email of your Paylocity Account Executive."
  2. DataSkate should assist with completing the form — list the specific API endpoints needed based on use case.
  3. Allow 2-4 weeks in project timeline for approval + sandbox provisioning before development starts.
  4. In the meantime: obtain QB/Salesforce credentials first (QB P0 resolution may take longer anyway).

What failed:
  Not yet observed in production. Flagged from web research during Scout S1.
  Similar access request delays have been observed with other payroll platforms (ADP, Paychex).

Status: observation
Promotes to: standards/playbooks/paylocity/paylocity_playbook.json (create after first full engagement)

*Added: 2026-05-12 — Source: developer.paylocity.com + web research during Scout S1 for cas-industries-customer*

---

## FK-022 — Sandata CalEVV aggregator: REST API, Basic Auth + EntityGuid header
Date: 2026-05-12
Project: healthcare / HCBS (1 engagement)
Trigger: Client is a California home-based services provider (HCBS) required by DDS to submit EVV data
         to the state aggregator. DCI handled this automatically; new EVV platform requires direct integration.

Scenario:
  Client transitions EVV platform. New system (e.g. Salesforce) does not automatically submit to the
  California state EVV aggregator. MuleSoft must bridge: Salesforce → Sandata CalEVV.

What worked (from research — not yet tested in production):
  Auth: HTTP Basic Auth — Base64 encode "username:password" in Authorization header.
  EntityGuid: Required header for alternate EVV vendors submitting on behalf of clients.
  API style: REST (JSON primary, XML also accepted).
  Model: Real-time submission preferred by California DDS (not batch).
  Endpoint registration: Must register with California as Alternate EVV Vendor BEFORE testing.
    Contact: CAAltEVV@sandata.com | (855) 943-6069
  EntityGuid is issued by Sandata upon successful alternate vendor registration.

Key prerequisite (P0):
  EntityGuid must be obtained from Sandata before any integration testing can begin.
  Registration requires confirming: EVV vendor name, FEIN, state(s), Medicaid program type.
  Registration timeline: unknown — flag immediately at scoping kickoff.

Client question used:
  "Has your Salesforce EVV product already been registered as an Alternate EVV Vendor with
   Sandata for California? If yes, do you have an EntityGuid? If not, we need to initiate
   registration immediately — DataSkate can assist. Confirm who owns this vendor relationship."

Notes:
  - No dedicated MuleSoft connector on Exchange — use HTTP connector with Basic Auth config.
  - 90-day backdated visit submission: Sandata API may accept backdated timestamps — must confirm
    during API Contract Discovery. Client requires 90-day backdating capability.
  - California DDS EVV compliance deadline: February 27, 2026 (QIP eligibility at stake).

Status: observation
Promotes to: standards/playbooks/sandata/sandata_playbook.json (create stub in Session 2)

*Added: 2026-05-12 — Source: California DDS EVV page + Sandata web research during Scout S1 for cherish-care*

---

## FK-023 — Legacy EVV platforms have no public API — file-based export before termination is P0
Date: 2026-05-12
Project: healthcare / HCBS (1 engagement)
Trigger: Client is migrating from a niche EVV SaaS (DCI, AlayaCare, etc.) that is being terminated
         or replaced. Client assumes historical data can be extracted via API.

Scenario:
  Legacy EVV platform (DCI — Direct Care Innovations) has no public REST API.
  All data extraction is manual: portal-based report downloads (Excel, PDF).
  Client's DCI contract terminated June 3 2026 — earlier than anticipated (was September 2026).
  All historical EVV, employee, client, and authorization records must be exported before that date.

What worked:
  1. Flag this as a P0 blocker at first scoping call, not during discovery.
  2. Initiate formal bulk data export request to DCI vendor support immediately.
     DCI/similar vendors often have a structured offboarding export — but only if requested in advance.
  3. Get the export in: employee records, client/consumer records, authorization records, EVV visit history.
  4. Define the migration format: CSV or Excel → one-time Mule batch flow to load into Salesforce.
  5. Pattern K (data-migration) applies for the historical load.

What failed:
  Waiting until architecture phase to discover the API doesn't exist.
  By then, the client may have already lost access to the legacy system.

Client question used:
  "DCI has no public API for data extraction. You must request a bulk data export from DCI support
   BEFORE your June 3 termination date. Have you already requested this? If not, do this week.
   Confirm: what format will DCI provide (CSV, Excel, XML)? We will build the migration load around
   whatever DCI provides."

Applies to: any niche EVV platform, homecare scheduling software, legacy HCBS platforms.
Similar platforms to watch: AlayaCare, ClearCare, WellSky, Therap.

Status: observation
Promotes to: standards/playbooks/dci/dci_playbook.json (create stub — flag API unavailability as permanent note)

*Added: 2026-05-12 — Source: Scoping transcripts + web research during Scout S1 for cherish-care*

---

## FK-024 — Always confirm QuickBooks product type at scoping
Date: 2026-05-14
Project: agilemind (scoping — version unconfirmed in any transcript)
Trigger: QuickBooks detected as a system in scoping transcripts without version specification.
Scenario:
  Client says "QuickBooks" without specifying Online vs Desktop/Enterprise. Two incompatible
  connector paths exist: mule-quickbooks-online-connector (REST + OAuth 2.0) vs QB Desktop
  (no REST API — requires QBXML Web Connector relay or third-party bridge like DBSync).
  Architecture cannot be selected until version is confirmed.

What failed:
  Proceeding to architecture with "QuickBooks" as a system without confirming version.
  FK-020 (verified) documents the incompatibility. This FK captures the scoping question gap.

What worked:
  Raise as P0 immediately at Sage stage. Question to ask:
  "Which QuickBooks product are you using — QuickBooks Online (cloud), QuickBooks Pro,
  QuickBooks Premier, or QuickBooks Enterprise? If you're not sure, check the Help menu →
  About QuickBooks."

Client question used:
  "Which QuickBooks product are you using — QuickBooks Online, QuickBooks Pro/Premier
  (desktop), or QuickBooks Enterprise? This determines whether we use a standard connector
  or a different integration approach."

Status: observation
Promotes to: DSPipeline/agents/sage.toml — add QuickBooks to P0 system gotchas;
             Scout toml — add QuickBooks version confirmation to system-specific question set

*Added: 2026-05-14 — Source: AgileMind scoping transcripts — Sage pass*

---

## FK-025 — Excel / Google Sheets: confirm file storage location before designing flow
Date: 2026-05-14
Project: agilemind (scoping — Excel/Google Sheets location unconfirmed)
Trigger: Excel or Google Sheets detected as a data source in scoping transcripts.
Scenario:
  Client mentions "Excel spreadsheets" or "Google Sheets" as a data source. CloudHub 2.0
  has an ephemeral local filesystem — it cannot read files from a local machine or shared
  Windows drive. If client's files are local, MuleSoft cannot access them without migrating
  to cloud storage first.

What failed:
  Assuming Excel files are accessible. Local Excel files on a Windows shared drive or laptop
  are completely inaccessible from CloudHub 2.0 without a bridge (SFTP server, etc.).

What worked:
  Raise as P0 at Sage stage. Determine file location first:
  (a) Local machine / shared Windows drive → must migrate to SharePoint, OneDrive, or Google Drive first
  (b) SharePoint / OneDrive → use microsoft-excel-online connector
  (c) Google Drive / Google Sheets → use google-sheets connector
  (d) SFTP server → use sftp connector

Client question used:
  "Where do your Excel inventory spreadsheets live — on a local machine or shared network
  drive, SharePoint/OneDrive, Google Drive, or are they Google Sheets? This determines
  which connector and architecture we use."

Status: observation
Promotes to: DSPipeline/agents/sage.toml — add Excel/Google Sheets to P0 system gotchas;
             standards/scenarios/file-based-etl.md — add CloudHub 2.0 file access note

*Added: 2026-05-14 — Source: AgileMind scoping transcripts — Sage pass*

---

## FK-026 — Time-varying config must never be hardcoded in source files
Date: 2026-05-15
Project: DSPipeline tooling (orchestrate.js)
Trigger: Claude wrote `MODEL_PRICING` as a JS constant inside `orchestrate.js` instead of externalizing it.

Scenario:
  API pricing, rate limits, model IDs, and external identifiers change over time.
  Hardcoding them in source files means every pricing update requires a code change,
  creating noise in git history and risk of stale values persisting across models.

What failed:
  MODEL_PRICING written as a hardcoded constant in orchestrate.js — any Anthropic pricing
  update would require editing source code rather than a config file.

What worked:
  Extracted to DSPipeline/telemetry/model-pricing.json.
  orchestrate.js reads it at runtime via readJson(). Fallback default guards against
  missing/corrupt file only — it is not the authoritative value.

Rule:
  Any value that changes independently of code belongs in a config file in the domain folder:
    - API pricing → DSPipeline/telemetry/model-pricing.json
    - Rate limits → standards/playbooks/{system}/{system}_playbook.json
    - Model IDs → DSPipeline/telemetry/model-pricing.json (modelId field)
    - Environment URLs → project.json or .env (never source)
  Source code reads config; fallback literals in code are last-resort guards only.

Promotes to: CLAUDE.md (No hardcoding of time-varying config — added 2026-05-15)

*Added: 2026-05-15 — Source: DSPipeline telemetry implementation review*
