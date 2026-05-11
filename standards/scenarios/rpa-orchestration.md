# Scenario: RPA Orchestration

> **Pattern:** `rpa-orchestration`
> **Letter:** W
> **Trigger:** Any inbound trigger (http-listener, mq-subscriber, scheduler) — MuleSoft is the caller, not the receiver
> **Latency target:** async-ok (RPA bot execution takes 30 seconds to 30+ minutes)
> **Volume:** low–medium (RPA bots are sequential per console session; not designed for high-throughput)

---

## When to Use This Pattern

- A business process requires automating a **legacy UI application** (mainframe, desktop app, web app
  without API) that has no REST or SOAP interface
- A human task must be delegated to an RPA bot (form filling, screen scraping, copy-paste workflows)
  and triggered by a Mule integration event
- An existing Anypoint RPA automation needs to be invoked as part of a larger integration flow
  (e.g., Salesforce opportunity won → RPA bot fills out legacy ERP order entry form)
- A long-running document processing or data entry task should be delegated to a bot while
  the Mule flow waits asynchronously for completion and processes the result

**Architectural position:** MuleSoft is always the **orchestrator** in this pattern. The RPA bot is
a long-running side-effect worker. MuleSoft invokes the bot, waits for completion via polling or
callback, and processes the output.

**Do not use** when:
- The target system has a REST or SOAP API — use the appropriate connector directly (A, B, D, etc.)
- Volume is high (> 100 invocations/hour) — RPA bots are single-threaded per console session
- Sub-second or under-10s latency is required — RPA is never synchronous in practice

---

## Prerequisite (RPA Team Responsibility — Not Developer)

**Before any Mule developer can use this pattern, the RPA team must:**

1. Build the automation in **Anypoint RPA Builder**
2. Deploy to a production phase in **Anypoint RPA Manager**
3. Create an **Invokable Run Configuration** for the deployment
4. **Publish to Anypoint Exchange** — this generates an OAS 3.0 API asset for the process

The Mule project references the published Exchange asset. If the Exchange asset does not exist,
the Mule integration cannot proceed. Flag this as a **prerequisite OPEN ITEM** in `architecture.md`.

---

## Reference Architecture

```
Trigger (http | mq | scheduler)
        │
        ▼
┌───────────────────────────────────────────────────────────────────┐
│  Mule Process API — RPA Orchestrator Flow                         │
│                                                                   │
│  1. Generate executionId (UUID)                                   │
│  2. Validate input / build RPA inputArguments                     │
│  3. PUT /executions/startProcess  ──────────────►  Anypoint RPA  │
│     (idempotent; same executionId = no double-run)                │
│  4. Store executionId in Object Store (survive restart)           │
│  5. until-successful: poll GET /executions/{id}/status            │
│     every 30s, up to 60 retries (30 min max)                     │
│  6. status="success" → extract outputArguments                    │
│     status="error"   → route to error handler + DLQ              │
│     MULE:RETRY_EXHAUSTED → timeout handler + notification         │
│  7. Transform RPA output → downstream system call                 │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
        │                                      │
  Success Path                           Error / Timeout
  Transform + forward                    DLQ + Ops alert
```

### Optional Callback Pattern (for processes > 10 minutes)

```
Mule Flow 1: RPA Invoke (trigger → PUT startProcess → store executionId → return 202)
Mule Flow 2: RPA Callback Listener (http-listener POST /rpa/callback → process result)

Include in PUT body:
  "callbackUri": "https://{mule-app}.cloudhub.io/api/rpa/callback",
  "label": "completion-callback"
```

Use the callback pattern when expected bot duration exceeds 10 minutes. The polling approach
(30s × 60 retries = 30 min) covers most UI automation tasks. For longer processes, the callback
avoids holding an until-successful thread.

---

## decisions.json Defaults

```json
{
  "integration": {
    "integrationStyle": "messaging",
    "primaryPattern": "rpa-orchestration",
    "direction": "unidirectional"
  },
  "nfr": {
    "volume": "low",
    "latency": "async-ok",
    "frequency": "triggered",
    "availability": "99.9",
    "throughput": "low"
  },
  "security": {
    "level": "partner",
    "apiAuth": "oauth2-client-credentials",
    "secretsManager": true
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "compensationStrategy": "retry",
    "maxRetries": 3,
    "backoff": "exponential",
    "dlq": true,
    "errorEnvelope": true
  },
  "flowControl": {
    "direction": "push",
    "messageTtlHours": 24,
    "maxConcurrency": 2,
    "backpressureEnabled": true,
    "deduplicationEnabled": false
  },
  "devops": {
    "munitCoverage": 80
  }
}
```

**`maxConcurrency: 2`** — RPA bots run sequentially per console session. Running more than 2–3
concurrent invocations against a single bot will queue them in RPA Manager. Set based on the
number of licensed bot sessions, not Mule capacity.

---

## Implementation: HTTP Connector Approach (Recommended)

The RPA Automation API is published to Exchange as an OAS 3.0 asset. MuleSoft Anypoint Studio can
import it via **Search in Exchange → Add dependency** (REST Connect generates a typed connector
automatically). However, for scaffold generation and reuse across clients, the **HTTP connector
approach** is preferred because:

- No dependency on a specific client's Exchange org or published process version
- Works identically across all environments
- Connector config is static XML; OAS asset changes when the process parameters change

### Authentication

**Production (required): OAuth 2.0 Client Credentials**

```
Token URL: https://anypoint.mulesoft.com/accounts/api/v2/oauth2/token
           (EU: https://eu1.anypoint.mulesoft.com/accounts/api/v2/oauth2/token)
Grant type: client_credentials
Required scopes: "RPA Integrator" and "RPA Invocable Process"
Connected App type: "App acts on its own behalf (client credentials)"
```

Create the Connected App in Anypoint Platform → Access Management → Connected Apps.
The Connected App's Client ID + Client Secret go into Secrets Manager.

**Development only: API Key**
```
Header: x-apikey: <value>
Created in: RPA Manager → User Management → User API Keys
Expiry: configurable — always set an expiry; key shown only once at creation
```

Never use API key in production. Key is user-scoped — if the user account is deactivated or
the key expires, all integrations using it break simultaneously.

### API Endpoints

```
Base URL: https://{tenant}.rpa.mulesoft.com/rpa/api/v2   (OAuth — use this)
          https://{tenant}.rpa.mulesoft.com/rpa/api/v1   (API key — dev only)

PUT  /executions/startProcess              — Start process (idempotent by executionId)
POST /executions/startProcessNonIdempotent — Start process (always executes — use for fire-and-forget)
GET  /executions/{executionId}/getProcessExecutionStatus — Poll for status
```

### Request / Response

```json
// PUT /executions/startProcess — request body
{
  "executionId": "550e8400-e29b-41d4-a716-446655440000",
  "inputArguments": {
    "customerName": "Acme Corp",
    "orderNumber": "ORD-12345"
  },
  "callbackUri": "https://my-mule-app.cloudhub.io/api/rpa/callback"
}

// PUT response: 201 Created (first run) | 204 No Content (duplicate executionId — safe to ignore)
// POST response: 201 Created (always)

// GET /executions/{id}/getProcessExecutionStatus — response body
{
  "executionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "success",
  "outputArguments": {
    "confirmationNumber": "CONF-67890",
    "processingTime": "45s"
  }
}
```

**Status values (use lowercase in DataWeave conditions):**
- `"notStarted"` — queued, bot not yet executing
- `"running"` — bot currently executing
- `"success"` — completed; `outputArguments` available
- `"error"` — bot execution failed; check RPA Manager logs for details

---

## Core Flow XML

```xml
<!-- Main RPA orchestrator flow (trigger omitted — any inbound trigger works) -->
<flow name="invoke-rpa-process-flow">

  <!-- Step 1: Generate idempotent executionId (UUID) -->
  <set-variable variableName="rpaExecutionId"
    value="#[java!java::util::UUID::randomUUID() as String]"
    doc:name="Generate Execution ID"/>

  <!-- Step 2: Build RPA input arguments from upstream payload -->
  <ee:transform doc:name="Build RPA Input">
    <ee:set-variable variableName="rpaInput">
      <![CDATA[%dw 2.0
      output application/json
      ---
      {
        executionId: vars.rpaExecutionId,
        inputArguments: {
          // TODO: Map from payload to process-specific input parameters
          // Parameter names must match the Invokable Run Configuration definition in RPA Manager
          param1: payload.fieldA,
          param2: payload.fieldB
        }
      }
      ]]>
    </ee:set-variable>
  </ee:transform>

  <!-- Step 3: Invoke RPA process (idempotent PUT) -->
  <http:request config-ref="Anypoint_RPA_Config"
    path="/executions/startProcess"
    method="PUT"
    doc:name="Start RPA Process">
    <http:body>#[vars.rpaInput]</http:body>
    <http:headers><![CDATA[#[{ 'X-Correlation-ID': correlationId }]]]></http:headers>
    <http:response-validator>
      <!-- Accept 201 (created) and 204 (duplicate executionId — idempotent safe) -->
      <http:success-status-code-validator values="201,204"/>
    </http:response-validator>
  </http:request>

  <!-- Step 4: Persist executionId (survive Mule restart during long poll) -->
  <os:store key="#['rpa-exec-' ++ vars.rpaExecutionId]"
    value="#[vars.rpaExecutionId]"
    ttl="2" ttlUnit="HOURS"
    objectStore="persistent-store"
    doc:name="Persist Execution ID"/>

  <!-- Step 5: Poll for completion -->
  <until-successful maxRetries="60" millisBetweenRetries="30000"
    doc:name="Poll RPA Status (30s × 60 = 30 min max)">

    <http:request config-ref="Anypoint_RPA_Config"
      path="#['/executions/' ++ vars.rpaExecutionId ++ '/getProcessExecutionStatus']"
      method="GET"
      doc:name="Get RPA Status"/>

    <ee:transform doc:name="Check Status">
      <ee:set-variable variableName="rpaStatus">
        <![CDATA[%dw 2.0
        output application/java
        ---
        payload.status
        ]]>
      </ee:set-variable>
    </ee:transform>

    <!-- Fail until-successful continues polling while status is not terminal -->
    <validation:is-true expression="#[vars.rpaStatus == 'success' or vars.rpaStatus == 'error']"
      message="#['RPA still running. Status: ' ++ (vars.rpaStatus default 'unknown')]"/>

  </until-successful>

  <!-- Step 6: Branch on final status -->
  <choice doc:name="Route on RPA Result">
    <when expression="#[vars.rpaStatus == 'success']">
      <!-- Step 7: Extract output and continue downstream -->
      <ee:transform doc:name="Extract RPA Output">
        <ee:set-variable variableName="rpaOutput">
          <![CDATA[%dw 2.0
          output application/java
          ---
          payload.outputArguments
          ]]>
        </ee:set-variable>
      </ee:transform>
      <!-- TODO: Downstream system call using vars.rpaOutput -->
    </when>
    <otherwise>
      <!-- RPA bot returned "error" status -->
      <logger level="ERROR"
        message="#['RPA process failed. executionId=' ++ vars.rpaExecutionId ++ ' status=' ++ vars.rpaStatus ++ ' correlationId=' ++ correlationId]"/>
      <raise-error type="RPA:PROCESS_FAILED"
        description="#['RPA bot returned error status for executionId=' ++ vars.rpaExecutionId]"/>
    </otherwise>
  </choice>

  <error-handler>
    <!-- Polling timeout: until-successful exhausted all 60 retries -->
    <on-error-continue type="MULE:RETRY_EXHAUSTED">
      <logger level="ERROR"
        message="#['RPA polling timeout after 30 minutes. executionId=' ++ vars.rpaExecutionId ++ ' correlationId=' ++ correlationId]"/>
      <flow-ref name="common-dispatch-notification-subflow"/>
      <!-- Route to DLQ with timeout context so operations can investigate -->
      <ee:transform doc:name="Build Timeout Error">
        <ee:set-payload><![CDATA[%dw 2.0
        output application/json
        ---
        { error: "RPA_TIMEOUT", executionId: vars.rpaExecutionId, correlationId: correlationId,
          message: "Bot did not complete within 30 minutes" }
        ]]></ee:set-payload>
      </ee:transform>
      <anypoint-mq:publish config-ref="Anypoint_MQ_Config"
        destination="${mq.queue.rpa-dlq}" doc:name="Publish to DLQ"/>
    </on-error-continue>
    <!-- Bot returned error status (raised by raise-error above) -->
    <on-error-continue type="RPA:PROCESS_FAILED">
      <flow-ref name="common-route-to-dlq-subflow"/>
    </on-error-continue>
    <!-- Auth failure — Connected App expired or missing scope -->
    <on-error-continue type="HTTP:UNAUTHORIZED, HTTP:FORBIDDEN">
      <logger level="ERROR"
        message="#['RPA auth failure — check Connected App scopes and Secrets Manager. correlationId=' ++ correlationId]"/>
      <flow-ref name="common-dispatch-notification-subflow"/>
    </on-error-continue>
  </error-handler>

</flow>
```

---

## Connector Config (HTTP-based)

See `scaffold/connectors/anypoint-rpa-config.xml` for the full connector config template.

Key property keys required in `{env}.yaml`:
```yaml
rpa.tenant:                 your-org          # subdomain of .rpa.mulesoft.com
rpa.client.id:              "${secure::rpa.client.id}"
rpa.client.secret:          "${secure::rpa.client.secret}"
rpa.token.url:              https://anypoint.mulesoft.com/accounts/api/v2/oauth2/token
rpa.process.api.base:       /rpa/api/v2
rpa.poll.retries:           60
rpa.poll.interval.ms:       30000
mq.queue.rpa-dlq:           rpa-orchestration-dlq-{env}-queue
```

---

## Operational Requirements

### Bot Capacity Planning
- Each RPA console session runs **one process at a time**
- `maxConcurrency` in the Mule subscriber must not exceed the number of licensed bot sessions
- Monitor: RPA Manager → Activity dashboard for queue depth and session utilization

### Object Store Usage
Execution IDs are stored in persistent Object Store (TTL 2h) to allow flow recovery after
Mule restart. If a flow restarts mid-poll, it should re-read the executionId and resume polling
rather than starting a duplicate execution.

### RPA Manager Monitoring Integration
- RPA Manager has its own audit dashboard — link it in `architecture.md` under External Systems
- Configure RPA Manager email alerts for bot failures independently of Mule alerting
- Both systems should alert on failure — defense in depth

---

## Compensation Strategy

**compensationStrategy: retry**

The idempotent `PUT /executions/startProcess` is safe to retry. The same `executionId` will not
cause a duplicate execution in RPA Manager (returns 204 instead of 201).

Exception: `POST /executions/startProcessNonIdempotent` is NOT idempotent. Never retry this
operation. Use `PUT /executions/startProcess` in all generated flows.

For processes that mutate financial or provisioning data in the target system (not the RPA bot
itself, but downstream from the bot output), apply compensating-transaction to the downstream
call, not the RPA invocation.

---

## EDA Fit Assessment

```
□ Do publisher and consumer teams evolve independently? → N/A (MuleSoft is caller, RPA is worker)
□ Will new consumers be added over time without publisher changes? → N/A (1-to-1 invocation)
□ Does the consumer need to replay events? → No — RPA processes are stateful in RPA Manager
□ Is throughput > 100K/day? → No — RPA is inherently low-throughput by design
```

**EDA verdict: not warranted.** RPA orchestration is a direct invocation pattern, not an event-
driven fan-out. MuleSoft orchestrates; RPA executes. Use direct HTTP call + polling, not a
message broker in between (unless the trigger is already async, e.g., MQ message triggers the RPA flow).

---

## Known Gotchas (Field Knowledge)

1. **No dedicated Mule connector JAR** — There is no `mule-anypoint-rpa-connector` on Exchange.
   The "connector" approach requires the RPA team to publish the process to Exchange, then import
   that specific OAS asset (REST Connect generates a per-process typed connector). The HTTP approach
   used by this system is more portable and works without Exchange publish dependencies.

2. **API key is user-scoped and expires** — API key authentication ties the integration to a
   specific user account with a configurable expiry. If the account is deactivated or the key
   expires, all integrations using it fail silently. Use OAuth 2.0 Connected App for all
   production deployments.

3. **One invocable run configuration per process** — Each automation can have exactly one
   invokable run configuration. You cannot create multiple invokable configs with different
   parameter sets for the same process. Coordinate with the RPA team before design.

4. **Editing the process creates a new Exchange version** — When the RPA team modifies and
   republishes an invokable process, it creates a new Exchange asset version. If using the
   REST Connect (typed connector) approach, developer must update the pom.xml dependency version.
   The HTTP approach is immune to this — API endpoint is stable.

5. **Bot must be in OK state** — Invocations only execute if at least one assigned bot session
   is in `OK` state. If all bots are down, invocations may queue silently in RPA Manager.
   Add a monitoring alert in RPA Manager for bot session failures.

6. **PUT returns 204 on duplicate executionId** — This is correct behaviour (idempotent).
   The HTTP response validator must accept both 201 and 204, otherwise the flow will throw
   an error on the first retry attempt.

7. **Status values are lowercase in API v2** — `"success"` not `"SUCCESS"`. The Composer UI
   shows `SUCCESS` in its trigger filter, but the REST API v2 returns lowercase. Use
   lowercase in all DataWeave condition checks.

8. **until-successful is correct for polling** — Do not implement polling with a scheduler +
   Object Store state machine (over-engineered for most cases). `until-successful` with
   30s interval and 60 retries covers up to 30 minutes of bot execution. For longer
   processes, switch to the callback URI approach.

---

## MUnit Test Coverage (80% floor)

- [ ] Happy path — input → RPA start (201) → polling → status=success → output extracted → downstream called
- [ ] Idempotent retry — same executionId returns 204 — flow continues correctly
- [ ] Bot error status — status=error → RPA:PROCESS_FAILED raised → DLQ routing → notification dispatched
- [ ] Polling timeout — until-successful exhausted after 60 retries → MULE:RETRY_EXHAUSTED caught → timeout DLQ + alert
- [ ] Auth failure — HTTP:UNAUTHORIZED on startProcess → alert dispatched; no DLQ (auth issues don't benefit from retry)
- [ ] RPA Manager unreachable — HTTP:CONNECTIVITY → retry via until-successful; eventually MULE:RETRY_EXHAUSTED → DLQ

---

## Relationship to Other Patterns

| Pattern | Relationship |
|---------|-------------|
| **A (request-reply)** | If the inbound caller needs a synchronous response and RPA completes in < 10s (rare) — use request-reply as outer wrapper; embed RPA polling inside |
| **H (process-orchestration)** | When RPA is one step in a multi-system saga — H coordinates the whole saga; W is one step within it |
| **B (event-driven)** | Common trigger: an MQ message triggers the RPA flow (MQ consumer → RPA invoke) |
| **N (outbound-notification)** | Always pair N with W — bot failures and timeouts must alert operations |
| **O (hybrid)** | W + B is the most common combination: MQ event triggers → RPA bot → downstream write |

---

## Example Project

**Client:** Financial services firm with legacy mainframe for loan document processing
**Flow:** `process-loan-document-flow` — triggered by Salesforce webhook; RPA bot fills mainframe
         forms; completion result updates Salesforce case status
**Connectors:** `http` (Anypoint RPA API), `salesforce`, `anypoint-mq` (DLQ + notifications)
**Bot expected duration:** 2–5 minutes
**Polling config:** 30s × 20 retries = 10 min max (sufficient for 5 min + margin)
**Secondary pattern:** `outbound-notification` (Slack alert on bot failure)
**Security tier:** regulated (financial data; Secrets Manager required)
**Deployment:** CloudHub 2.0; maxConcurrency=3 (matches licensed bot session count)
