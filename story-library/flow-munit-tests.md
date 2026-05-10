# Story Template: Write MUnit Tests (Per Flow)

**Story Type:** Per-Flow — Testing
**Generated:** Once per entry in `decisions.json flows[]`
**Priority:** P1
**Standard:** `standards/MULESOFT_DESIGN_STANDARDS.md → MUnit Coverage by Pattern`
**Scaffold File:** `src/test/munit/{flow-name}-test.xml`

---

## User Story

As a developer, I need MUnit tests for `{flow-name}` that mock all connector operations and verify happy path, retry-to-DLQ routing, and validation-failure routing, so that the CI/CD coverage gate passes and no live calls to external systems occur during testing.

---

## Coverage Floor

Coverage floor for this flow based on `decisions.json integration.primaryPattern`:

| Pattern | Coverage Floor |
|---------|---------------|
| A — request-reply | **80%** |
| B — event-driven | **75%** |
| C — batch | **75%** |
| D — scheduled-sync | **80%** |
| E — file-based-etl | **80%** |
| F — cdc-streaming | **80%** |
| G — b2b-edi | **80%** |
| H — process-orchestration | **80%** |
| I — api-aggregation | **80%** |
| J — webhook-ingestion | **80%** |
| K — data-migration | **75%** |
| L — streaming-pipeline | **80%** |
| M — pubsub-fanout | **75%** |
| N — outbound-notification | **60%** |
| O, P, Q, R and all others | **80%** |

Connector calls are **excluded** from coverage measurement (they are mocked — measuring them is meaningless).

---

## Acceptance Criteria

### Test File and Structure
- [ ] MUnit file at `src/test/munit/{flow-name}-test.xml`
- [ ] MUnit version specified in `pom.xml` (`munit.version`)
- [ ] Test suite `name` attribute set to `{flow-name}-test-suite`
- [ ] All connector operations mocked with `munit-tools:mock-when` — zero live calls to external systems
- [ ] `munit-tools:mock-when` scope covers both the happy path and error-path stubs for each connector

### Required Test Cases (all three mandatory)

**Test 1: Happy Path**
- [ ] Input: valid payload with all required fields populated
- [ ] Mocks: all connector operations return successful responses per contract
- [ ] Assertions:
  - Response status code / acknowledgement matches expected
  - `correlationId` present and unchanged throughout flow
  - Downstream connector called with expected payload (assert call count = 1)
  - Response body matches expected schema (not just HTTP 200)
- [ ] No exceptions thrown

**Test 2: Downstream Unavailable (Retry → DLQ)**
- [ ] Input: valid payload
- [ ] Mock: target connector throws `MULE:CONNECTIVITY` (simulate unavailable)
- [ ] Assertions:
  - Retry logic triggers N times per `decisions.json errorHandling.maxRetries`
  - After max retries exhausted: message published to `{dlq-name}`
  - MANUAL ack NOT called until after DLQ publish (if async pattern)
  - Primary flow does NOT throw unhandled exception — error is handled gracefully
  - Error envelope published / returned has correct schema

**Test 3: Validation Failure → Invalid Message Channel**
- [ ] Input: invalid payload (missing required field, or wrong schema)
- [ ] Mock: no connector calls expected (validation happens before any downstream call)
- [ ] Assertions:
  - Route to `{domain}-invalid-messages-queue` confirmed (mock capture the publish)
  - Route does NOT go to DLQ
  - No downstream connector called (call count = 0)
  - Primary flow continues (if other flows still running)

### Additional Test Cases (include based on pattern)

| Applies When | Additional Test Case |
|--------------|---------------------|
| Async MQ consumer (any pattern) | **Duplicate message:** second delivery of same `messageId` → ACK + skip, no re-processing, downstream connector called 0 times |
| Pattern H — process-orchestration | **Saga rollback:** mid-saga failure → compensating transaction flows fire in correct order |
| Pattern I — api-aggregation | **Partial failure:** one scatter-gather leg fails → aggregate response includes error for that leg, other legs succeed |
| Pattern D — scheduled-sync | **Watermark advancement:** watermark Object Store value updated after successful run |
| Auth token expiry (any pattern calling OAuth2 system) | **Token refresh:** connector throws `HTTP:UNAUTHORIZED` → one refresh attempt → retry call → success |
| Notification flows (N, or secondary notification) | **Notification failure:** Slack/email mock throws exception → primary flow continues, WARN logged, no exception propagated |
| `aiIntegration.enabled = true` | **AI timeout:** AI connector mock throws timeout → fallback value used → primary flow continues |

---

## MUnit Test Case Table
*(PM agent uses this format when listing specific test cases in stories.md)*

| Test # | Test Name | Input Payload | Mock Setup | Expected Outcome | Connector Call Count |
|--------|-----------|--------------|-----------|-----------------|---------------------|
| 1 | Happy path | Valid {entity} payload | {connector} returns 200 with {response} | 201 / ACK | 1 |
| 2 | Downstream unavailable | Valid {entity} payload | {connector} throws CONNECTIVITY | 3 retries → DLQ publish | 0 (DLQ publish = 1) |
| 3 | Validation failure | {entity} with missing {field} | none (validate before connector) | Invalid-messages-queue publish | 0 |

---

## Implementation Notes

- Reference: `standards/MULESOFT_DESIGN_STANDARDS.md → MUnit Coverage by Pattern`
- Scaffold generates pre-stubbed happy path + 2 error scenarios — developer fills in payloads and mock responses
- Use `munit-tools:assert-that` for assertions — not `munit:assert-payload-equals` (deprecated)
- Mock connector config-ref must match exact config-ref name in the flow under test
- CI/CD gate configured to block deploy if coverage below floor (see `global-cicd-pipeline` story)
- For async flows: `munit-tools:mock-when` on `anypoint-mq:publish` to capture DLQ publish and assert payload
