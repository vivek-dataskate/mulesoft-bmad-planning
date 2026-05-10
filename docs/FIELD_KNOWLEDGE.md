# Field Knowledge — MuleSoft BMAD Planning System
> Append-only log of real-project lessons that are not yet (or not fully) covered by scenario files
> or standards. Read by all BMAD agents at session start. Architect maintains this file.
>
> Format: FK-NNN | Date | Trigger | Scenario | What worked | Status
> Status: observation → verified → promoted-to-standard
>
> HOW TO ADD AN ENTRY:
>   1. Add a row to the Index table (status=observation, Times=1, Added=today, Last Seen=today)
>   2. Add the full detail entry below
>   3. On each recurrence: increment Times, update Last Seen, update status if threshold reached
>      observation → verified at 2 occurrences on different clients
>      verified → promoted-to-standard: update the target file, keep entry for traceability
>   4. Commit: "field-knowledge: Add FK-NNN [{system or pattern}]"
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

*Last updated: 2026-05-10*
*Next review: after first project using Chunk 4+ agents*
