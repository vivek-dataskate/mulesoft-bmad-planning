# Scenario: Real-Time Integration

> **Pattern:** `real-time`  
> **Trigger:** HTTP inbound (synchronous request/response)  
> **Latency target:** < 1 second (< 3 seconds maximum)  
> **Volume:** Low–medium per call (< 500 records)

---

## When to Use This Pattern

- Consumer needs an immediate response (UI, partner API, webhook)
- Single-record lookups, creates, or updates
- Synchronous orchestration across 2–3 systems
- Fan-out reads that must return in one response

**Do not use** for: large-volume data movement, fire-and-forget writes, or any flow where the consumer can tolerate eventual consistency.

---

## Reference Architecture

```
Consumer (HTTP)
     │
     ▼
{consumer}-exp-api       ← formats response for this consumer
     │  HTTP
     ▼
{domain}-proc-api        ← orchestrates, applies business rules
     │  HTTP       HTTP
     ▼             ▼
{system-a}-sys-api  {system-b}-sys-api   ← wrap backend systems
     │                    │
     ▼                    ▼
  System A             System B
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "integrationStyle": "rpc",
    "primaryPattern": "real-time",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "under-1s",
    "frequency": "real-time"
  },
  "errorHandling": {
    "strategy": "fail-fast",
    "compensationStrategy": "retry",
    "maxRetries": 3,
    "backoff": "exponential",
    "dlq": false,
    "invalidMessageChannel": false,
    "errorEnvelope": true
  },
  "flowControl": {
    "direction": "push",
    "messageTtlHours": null,
    "maxConcurrency": 4,
    "backpressureEnabled": false,
    "deduplicationEnabled": false
  },
  "devops": {
    "munitCoverage": 80
  }
}
```

---

## Flow Structure

### Experience API

```xml
<!-- http-get-{object}-flow in {consumer}-exp-api -->
<flow name="http-get-{object}-flow">
  <http:listener config-ref="HTTP_Listener_config" path="/{version}/{resource}"/>
  <flow-ref name="http-get-{object}-proc-flow"/>
  <error-handler ref="global-error-handler"/>
</flow>
```

### Process API

```xml
<!-- Orchestrate system APIs, apply business rules -->
<flow name="http-get-{object}-flow">
  <http:listener config-ref="HTTP_Listener_config" path="/{version}/{resource}"/>
  <!-- 1. Validate input -->
  <!-- 2. Call system API A -->
  <!-- 3. Call system API B (if needed) -->
  <!-- 4. Transform to canonical -->
  <!-- 5. Return -->
  <error-handler ref="global-error-handler"/>
</flow>
```

---

## Retry Policy

All HTTP calls from proc-api → sys-api must use:
```xml
<http:request-config name="HTTP_Request_Config">
  <reconnection>
    <reconnect count="3" frequency="1000"/>
  </reconnection>
</http:request-config>
```

Timeout configuration:
```xml
<http:request-config name="HTTP_Request_Config"
  responseTimeout="5000"
  connectionIdleTimeout="30000"/>
```

---

## Error Handling

Strategy: **fail-fast**

All errors return the standard envelope with appropriate HTTP status:

| Error type | HTTP status | errorCode |
|-----------|------------|---------|
| Validation failure | 400 | `VALIDATION:INVALID_INPUT` |
| Backend system 404 | 404 | `HTTP:NOT_FOUND` |
| Backend connectivity | 503 | `CONNECTIVITY:TIMEOUT` |
| Unexpected | 500 | `ANY` |

---

## Performance Considerations

- Set `responseTimeout` on all outbound HTTP calls (max 5000 ms recommended)
- Use persistent HTTP connections where possible (keep-alive)
- For fan-out patterns, use `parallel-foreach` to call system APIs concurrently
- Cache read-heavy reference data in Object Store (TTL 5–15 min)

---

## MUnit Test Coverage

Each real-time flow must have tests for:
- [ ] Happy path with valid input
- [ ] Invalid input (missing required field)
- [ ] Backend system returns 404
- [ ] Backend system times out / connectivity error
- [ ] Response shape matches RAML spec

---

## Example Project

**Client:** Any consumer needing account lookup across Salesforce + NetSuite  
**Flows:** `http-get-account-flow` in each layer  
**Connectors:** `http`, `salesforce`, `netsuite`  
**Security tier:** partner  
**Deployment:** CloudHub 2.0, 0.2 vCores × 2 replicas
