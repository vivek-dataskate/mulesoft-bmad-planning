# Scenario: API Aggregation / Composition

> **Pattern:** `api-aggregation`
> **Trigger:** HTTP inbound (synchronous request)
> **Latency target:** < 3 seconds total (parallel calls reduce wall-clock time)
> **Volume:** Low per call; response size can be large (composite payloads)

---

## When to Use This Pattern

- Consumer needs a single response that combines data from 2+ backend systems
- Experience layer must shield consumers from knowing about multiple underlying APIs
- Mobile or SPA frontend that cannot afford multiple round-trips
- Aggregation of related records: customer + orders + invoices in one call
- Fan-out reads where results from multiple systems must be merged into one response shape

**Distinguish from request-reply:** Simple request-reply calls one system. Aggregation calls multiple
systems (in parallel or in sequence) and stitches the response.

**Do not use** for: writes that must be atomic across systems (use `process-orchestration` with saga),
high-volume streaming data (use `streaming-pipeline`), or when one system is the single source of truth.

---

## Reference Architecture

### Parallel Scatter-Gather

```
Consumer (HTTP GET /customers/{id}/full-profile)
        │
        ▼
{consumer}-exp-api
        │
        ▼
{domain}-proc-api
  ├── Parallel execution (scatter-gather)
  │     ├── Call customer-sys-api  → customer record
  │     ├── Call orders-sys-api    → last 10 orders
  │     └── Call invoices-sys-api  → open invoices
  ├── Merge results into composite response
  ├── Apply view-specific transformations
  └── Return single response to consumer
        │
  ┌─────┼──────┐
  ▼     ▼      ▼
CRM   OMS   Finance
```

### Sequential Aggregation (result from step N is input to step N+1)

```
{domain}-proc-api
  ├── Step 1: GET /customer/{id}            → customerId, accountType
  ├── Step 2: GET /orders?customerId={id}   → orders (needs customerId)
  └── Step 3: GET /shipments?orderId={...}  → shipments (needs orderIds)
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "primaryPattern": "api-aggregation",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "under-3s",
    "frequency": "real-time",
    "volume": "low"
  },
  "errorHandling": {
    "strategy": "fail-fast",
    "maxRetries": 2,
    "backoff": "fixed",
    "dlq": false,
    "errorEnvelope": true
  },
  "devops": {
    "munitCoverage": 80
  }
}
```

---

## Flow Structure

### Scatter-Gather (Parallel Calls)

```xml
<flow name="http-get-{composite-resource}-flow">
  <http:listener config-ref="HTTP_Listener_config"
    path="/{version}/{resource}/{id}" method="GET"/>

  <scatter-gather doc:name="Aggregate {resource}">
    <route>
      <!-- Route 1: CRM data -->
      <http:request config-ref="Customer_Sys_API_Config"
        path="/customers/#[attributes.uriParams.id]"
        method="GET"
        responseTimeout="3000"/>
      <set-variable variableName="customerData" value="#[payload]"/>
    </route>
    <route>
      <!-- Route 2: Order data -->
      <http:request config-ref="Orders_Sys_API_Config"
        path="/orders"
        method="GET"
        responseTimeout="3000">
        <http:query-params><![CDATA[#[{ "customerId": attributes.uriParams.id, "limit": 10 }]]]></http:query-params>
      </http:request>
      <set-variable variableName="orderData" value="#[payload]"/>
    </route>
    <route>
      <!-- Route 3: Invoice data -->
      <http:request config-ref="Finance_Sys_API_Config"
        path="/invoices"
        method="GET"
        responseTimeout="3000">
        <http:query-params><![CDATA[#[{ "customerId": attributes.uriParams.id, "status": "OPEN" }]]]></http:query-params>
      </http:request>
      <set-variable variableName="invoiceData" value="#[payload]"/>
    </route>
  </scatter-gather>

  <!-- Merge results: payload is array of route results -->
  <ee:transform>
    <ee:message>
      <ee:set-payload><![CDATA[%dw 2.0
        output application/json
        var customer  = payload[0].payload
        var orders    = payload[1].payload
        var invoices  = payload[2].payload
        ---
        {
          customer:  customer,
          orders:    orders,
          invoices:  invoices,
          summary: {
            openInvoiceCount:  sizeOf(invoices filter ($.status == "OPEN")),
            recentOrderCount:  sizeOf(orders),
            totalOpenAmount:   sum(invoices map ($.amount))
          }
        }]]>
      </ee:set-payload>
    </ee:message>
  </ee:transform>

  <error-handler ref="global-error-handler"/>
</flow>
```

### Partial Failure Handling (tolerate missing data)

```xml
<scatter-gather doc:name="Aggregate with tolerance">
  <collect-list/>  <!-- default: fail-fast if any route fails -->
  <!-- To tolerate partial failure, wrap each route in try/error-handler -->
  <route>
    <try>
      <http:request .../>
      <error-handler>
        <on-error-continue>
          <!-- Return empty/default value; log warning -->
          <set-payload value="#[{ data: null, source: 'unavailable' }]"/>
        </on-error-continue>
      </error-handler>
    </try>
  </route>
</scatter-gather>
```

---

## Aggregation Strategy Selection

| Strategy | When to use | DWL approach |
|----------|------------|-------------|
| **Merge** | Responses are complementary (different fields) | One output object combining all |
| **Union** | Responses are same type from different sources | `payload[0].payload ++ payload[1].payload` |
| **Join** | Responses share a key; enrich one with other | `payload[0].payload map (item) -> item ++ (payload[1].payload filter ($.id == item.id))[0]` |
| **Reduce** | Compute aggregate metrics across responses | `sum`, `avg`, `sizeOf`, `max`, `min` |

Document the chosen strategy and merge key in `architecture.md`.

---

## Caching

For read-heavy aggregation endpoints where reference data changes slowly:
- Cache individual sys-api responses in Object Store (TTL: 5–15 min)
- Cache key: `{app.name}-{resource}-{id}`
- Apply at the exp-api or proc-api level (not sys-api — sys-api must stay stateless)
- Expose `Cache-Control: max-age=300` header to consumer

```xml
<os:retrieve key="#['customer-' ++ attributes.uriParams.id]"
  target="cachedCustomer"
  objectStore="cache-store"/>
<choice>
  <when expression="#[vars.cachedCustomer != null]">
    <set-payload value="#[vars.cachedCustomer]"/>
  </when>
  <otherwise>
    <http:request config-ref="Customer_Sys_API_Config" .../>
    <os:store key="#['customer-' ++ attributes.uriParams.id]"
      value="#[payload]"
      objectStore="cache-store"/>
  </otherwise>
</choice>
```

---

## Timeout Strategy

The overall response must complete within the consumer SLA (typically 3–5s). Budget time across calls:

| Call type | Recommended timeout |
|-----------|-------------------|
| Parallel scatter-gather routes | 3000 ms per route |
| Sequential call | 2000 ms per step |
| Total flow timeout | Set HTTP listener `readTimeout` = sum of sequential calls + 1s buffer |

If any parallel route exceeds timeout and partial failure is not tolerated, fail fast and return 503.

---

## Error Handling

Strategy: **fail-fast** (default) or **partial-success** (when some data is optional)

Document which response fields are required vs. optional in the RAML/OAS spec.

| Failure | Fail-fast | Partial-success |
|---------|-----------|----------------|
| Required source unavailable | 503 immediately | N/A — required fields must succeed |
| Optional source unavailable | 503 immediately | Return `null` for that section; log WARN |
| Source returns 404 for ID | 404 to consumer | Return `null` for that section |
| Timeout | 503 + `Retry-After` header | Return partial response with timeout flag |

---

## MUnit Test Coverage

Each aggregation flow must have tests for:
- [ ] Happy path — all sources return valid data → composite response correctly merged
- [ ] One optional source returns 404 → partial response returned (if tolerance configured)
- [ ] One required source unavailable → 503 returned
- [ ] Response shape matches OAS spec (all required fields present)
- [ ] Scatter-gather routes are actually parallel (verify via mock timing or call counts)
- [ ] Cache hit path — sys-api not called on second request within TTL

---

## Example Project

**Client:** Customer 360 portal — single-page app needs customer + orders + invoices
**Flows:** `http-get-customer-profile-flow` (exp-api), `http-get-customer-aggregate-flow` (proc-api)
**Connectors:** `http`, `salesforce` (customer), `netsuite` (invoices), `custom-oms` (orders via HTTP)
**Security tier:** partner
**Deployment:** CloudHub 2.0, 0.2 vCores × 2 replicas
