# Scenario: Process Orchestration (Long-Running Workflow)

> **Pattern:** `process-orchestration`
> **Trigger:** HTTP request, MQ event, or scheduler (starts a multi-step business process)
> **Latency target:** Seconds to hours per step; overall process may run for minutes to days
> **Volume:** Low–medium (each orchestration instance is heavyweight)

---

## When to Use This Pattern

- A business process spans 3 or more systems and requires coordination
- Steps must be compensated (rolled back) if a later step fails — saga pattern
- Human-in-the-loop: approvals, reviews, or decisions interrupt the flow
- Long-running processes where the initiating caller cannot wait (return 202 Accepted immediately)
- Order-to-cash, employee onboarding, loan origination, provisioning workflows

**Distinguish from request-reply:** Request-reply completes in one HTTP round-trip (< 10s). Process
orchestration returns 202 immediately and the caller polls for status or receives a callback.

**Distinguish from event-driven:** Event-driven reacts to one event and calls one or two systems.
Orchestration manages a stateful, multi-step process with branching, retries, and compensation.

**Do not use** for: single-system operations, simple 2-system integrations, or any flow that
completes synchronously in under 10 seconds.

---

## Reference Architecture

```
Initiator (HTTP / MQ / Scheduler)
        │  POST /orders  → 202 Accepted + correlationId
        ▼
{domain}-proc-api (Orchestrator)
  ├── Step 1: Validate + enrich (System A)
  ├── Step 2: Reserve inventory (System B)
  ├── Step 3: Charge payment (System C)
  ├── Step 4: Fulfil shipment (System D)
  ├── Step 5: Notify customer (email/SMS)
  └── On any step failure → execute compensation
        │  Compensation (reverse completed steps in reverse order)
        │    Compensate Step 3: Refund payment
        │    Compensate Step 2: Release inventory
        ▼
Status API (GET /orders/{correlationId}/status)
  └── Read process state from Object Store
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "primaryPattern": "process-orchestration",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "async-ok",
    "frequency": "triggered",
    "volume": "low"
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
    "objectStore": "persistent"
  },
  "devops": {
    "munitCoverage": 80
  }
}
```

---

## Flow Structure

### Initiator Flow (returns 202 immediately)

```xml
<flow name="http-post-{process}-initiate-flow">
  <http:listener config-ref="HTTP_Listener_config" path="/{version}/{process}" method="POST"/>

  <!-- Generate correlationId if not provided -->
  <set-variable variableName="correlationId"
    value="#[correlationId default uuid()]"/>

  <!-- Persist initial state -->
  <os:store
    key="#[vars.correlationId]"
    value='#[{ "status": "INITIATED", "createdAt": now() as String, "payload": payload }]'
    objectStore="persistent-store"/>

  <!-- Publish to orchestration queue for async processing -->
  <anypoint-mq:publish
    config-ref="Anypoint_MQ_Config"
    destination="${mq.queue.{process}.orchestrate}"
    messageId="#[vars.correlationId]"/>

  <!-- Return 202 immediately -->
  <set-payload value='#[{ "correlationId": vars.correlationId, "status": "ACCEPTED", "statusUrl": "/api/v1/{process}/" ++ vars.correlationId }]'/>
  <http:set-response statusCode="202"/>

  <error-handler ref="global-error-handler"/>
</flow>
```

### Orchestrator Flow (async, saga steps)

```xml
<flow name="mq-orchestrate-{process}-flow">
  <anypoint-mq:subscriber
    config-ref="Anypoint_MQ_Config"
    destination="${mq.queue.{process}.orchestrate}"
    acknowledgementMode="MANUAL"/>

  <try>
    <!-- Step 1 -->
    <flow-ref name="{process}-step1-validate-flow"/>
    <flow-ref name="{process}-update-status-subflow">
      <with-attributes><attribute key="step" value="STEP1_COMPLETE"/></with-attributes>
    </flow-ref>

    <!-- Step 2 -->
    <flow-ref name="{process}-step2-reserve-flow"/>
    <flow-ref name="{process}-update-status-subflow">
      <with-attributes><attribute key="step" value="STEP2_COMPLETE"/></with-attributes>
    </flow-ref>

    <!-- ... additional steps ... -->

    <!-- All steps done -->
    <flow-ref name="{process}-update-status-subflow">
      <with-attributes><attribute key="step" value="COMPLETED"/></with-attributes>
    </flow-ref>
    <anypoint-mq:ack messageId="#[attributes.messageId]"/>

    <error-handler>
      <on-error-propagate type="ANY">
        <!-- Saga compensation: reverse completed steps -->
        <flow-ref name="{process}-compensate-flow"/>
        <flow-ref name="{process}-update-status-subflow">
          <with-attributes><attribute key="step" value="FAILED"/></with-attributes>
        </flow-ref>
        <anypoint-mq:nack messageId="#[attributes.messageId]"/>
      </on-error-propagate>
    </error-handler>
  </try>
</flow>
```

### Status Check Flow

```xml
<flow name="http-get-{process}-status-flow">
  <http:listener config-ref="HTTP_Listener_config"
    path="/{version}/{process}/{correlationId}" method="GET"/>

  <os:retrieve
    key="#[attributes.uriParams.correlationId]"
    objectStore="persistent-store"
    target="processState"/>

  <choice>
    <when expression="#[vars.processState != null]">
      <set-payload value="#[vars.processState]"/>
    </when>
    <otherwise>
      <http:set-response statusCode="404"/>
      <set-payload value='#[{ "error": "Process not found" }]'/>
    </otherwise>
  </choice>

  <error-handler ref="global-error-handler"/>
</flow>
```

---

## Saga Compensation Pattern

Each step that mutates state must have a corresponding compensation action. Document the
compensation matrix in `architecture.md`:

| Step | Action | Compensation |
|------|--------|-------------|
| validate-enrich | Read-only | None needed |
| reserve-inventory | POST /reservations | DELETE /reservations/{id} |
| charge-payment | POST /charges | POST /refunds with chargeId |
| create-shipment | POST /shipments | POST /shipments/{id}/cancel |
| notify-customer | Send email | Cannot undo — log only |

Compensation flows execute in **reverse order** of completed steps.

---

## Process State Management

Use persistent Object Store for all process state:
- Key: `{app.name}-{process}-{correlationId}`
- Value: JSON state object with `status`, `completedSteps[]`, `stepOutputs{}`, timestamps
- TTL: set based on SLA (e.g., 7 days for order workflows; 30 days for approval workflows)
- Update state **after each successful step**, not before

State transitions:
```
INITIATED → STEP1_COMPLETE → STEP2_COMPLETE → ... → COMPLETED
                                    └──────────────────────→ FAILED (+ compensation)
                                                        └──→ COMPENSATED
```

---

## Human-in-the-Loop (Approval) Pattern

For workflows requiring human approval:

```
Step N completes → set status = AWAITING_APPROVAL
                → send approval request email/Slack with approve/reject URL
                → pause (process is suspended — no thread held)

Approver clicks approve/reject URL
  → HTTP POST to /api/v1/{process}/{correlationId}/approve
  → MuleSoft resumes from Object Store state
  → Continues to next step or compensation
```

Key: MuleSoft does NOT hold a thread during approval wait — the process state lives in Object Store
and resumes via a new HTTP request. This is different from BPEL/BPM platforms.

---

## Timeout and Escalation

- Per-step timeout: set `responseTimeout` on each outbound call (never rely on infinite wait)
- Process-level timeout: scheduler polls Object Store for processes stuck in non-terminal state
  beyond SLA; escalates via notification
- Idempotency on resume: if a step failed partway, re-entering must be safe (check if step output
  already exists in Object Store before re-executing)

---

## Error Handling

Strategy: **retry-then-dlq**

| Failure | Action |
|---------|--------|
| Step connectivity failure | Retry 3× exponential; on exhaustion: NACK → DLQ → compensation |
| Step business rejection | No retry; immediate compensation |
| Compensation step failure | Log CRITICAL; alert ops; set status = COMPENSATION_FAILED (manual intervention) |
| Object Store unavailable | Retry 5× fixed 1s; if persistent — halt and alert |

---

## MUnit Test Coverage

Each orchestration flow must have tests for:
- [ ] Happy path — all steps complete → status = COMPLETED
- [ ] Step 2 fails → compensation reverses Step 1 → status = COMPENSATED
- [ ] Final step fails → all prior steps compensated
- [ ] Status endpoint returns INITIATED, STEP_N_COMPLETE, COMPLETED, FAILED states
- [ ] Duplicate initiation with same correlationId — idempotency check
- [ ] Human approval path — process resumes correctly after approval callback

---

## Example Project

**Client:** Order-to-cash — order entry → inventory check → payment → ERP → notification
**Flows:** `http-post-order-initiate-flow`, `mq-orchestrate-order-flow`, `http-get-order-status-flow`,
          `order-compensate-flow`
**Connectors:** `http`, `anypoint-mq`, `salesforce`, `netsuite`, `stripe`, `email`
**Security tier:** partner
**Deployment:** CloudHub 2.0, 0.5 vCores × 2 replicas
