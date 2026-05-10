# Story Template: Invalid Message Channel Setup

**Story Type:** Global Infrastructure (Conditional)
**When to include:** Only if `decisions.json errorHandling.invalidMessageChannel = true`
**Priority:** P0
**Standard:** `standards/MULESOFT_DESIGN_STANDARDS.md → Cross-Cutting Patterns → Invalid Message Channel vs DLQ`
**Scaffold File:** `src/main/mule/error-handler.xml`

---

## User Story

As an integration developer, I need a dedicated Invalid Message Channel separate from the DLQ, so that validation failures (structurally wrong messages) are isolated from delivery failures (valid messages that couldn't be delivered), and retry budget is not wasted on messages that will always fail.

---

## Acceptance Criteria

### Queue Creation
- [ ] `{domain}-invalid-messages-{env}-queue` created in Anypoint MQ per environment
- [ ] Queue name in `decisions.json errorHandling.invalidMessageChannelName` — used for all property references
- [ ] Invalid message channel is **NOT a DLQ** — messages are NOT retried automatically
- [ ] No DLQ paired with the invalid-messages-queue (messages here are not retried)

### Routing Logic (Critical Rule)
- [ ] Validation executes **BEFORE** any downstream connector call — validation errors never reach the DLQ
- [ ] All flows route structural failures to the invalid-messages-queue:
  - Missing required field (e.g., `orderId is null`)
  - Wrong JSON/XML schema (fails `validation:validate-schema`)
  - Unknown enum value (field value not in permitted set)
  - Malformed payload (unparseable)
- [ ] Delivery failures (target system unavailable, timeout, auth failure) continue to route to DLQ with retry
- [ ] `on-error-continue` used for `VALIDATION:INVALID_VALUE`, `VALIDATION:NULL`, `VALIDATION:MISSING_CONTENT` → route to invalid-messages-queue, ack message (do not leave in original queue)

### Message Format Published to Invalid Channel
- [ ] Each invalid message published with original payload + error context:
  ```json
  {
    "correlationId": "<correlationId>",
    "originalPayload": "<base64 or truncated>",
    "validationError": "<error message from validator>",
    "failingField": "<field name if determinable>",
    "timestamp": "<ISO-8601>",
    "sourceQueue": "<original queue name>",
    "environment": "<env>"
  }
  ```

### Monitoring and Operations
- [ ] Anypoint Monitoring alert: invalid-messages-queue depth > 0 → **MEDIUM** alert → Ops team
- [ ] Ops runbook updated: triage process for reviewing invalid messages (documented in project wiki or architecture.md)
- [ ] Message visibility period set to allow ops review before expiry (minimum 72h TTL on invalid-messages-queue)
- [ ] DLQ for invalid-messages-queue optional — add if ops needs a retry path after manual correction (not default)

### MUnit Test
- [ ] Test: send message with missing required field → verify routes to invalid-messages-queue, NOT DLQ
- [ ] Test: send valid message → verify does NOT route to invalid-messages-queue

---

## Implementation Notes

- Reference: `standards/MULESOFT_DESIGN_STANDARDS.md → Cross-Cutting Patterns → Invalid Message Channel vs DLQ`
- The single most common mistake: putting validation failures in the DLQ. They will retry N times, all fail, and burn retry budget
- Validate early (first element in the flow after logger) — never after a connector call
- XML example:
  ```xml
  <validation:is-not-null
    value="#[payload.orderId]"
    message="orderId is required"
    doc:name="Validate orderId"/>
  <!-- On ValidationException: on-error-continue → publish to invalid-messages-queue -->
  ```
