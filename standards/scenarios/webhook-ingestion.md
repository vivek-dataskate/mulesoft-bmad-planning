# Scenario: Webhook Ingestion

> **Pattern:** `webhook-ingestion`
> **Trigger:** Inbound HTTP POST from an external system (push, not poll)
> **Latency target:** < 200ms to acknowledge; processing async (< 5s)
> **Volume:** Low–medium (bursty; driven by external system's event rate)

---

## When to Use This Pattern

- External SaaS platform pushes events to your endpoint (Stripe, GitHub, DocuSign, HubSpot, Shopify)
- You are the receiver — the external system initiates the call
- Events arrive unpredictably; you cannot poll the source for changes
- Source system expects a fast acknowledgement (HTTP 200) — processing must be asynchronous
- Signature-based authentication: HMAC-SHA256, bearer token, or shared secret

**Distinguish from event-driven:** Event-driven uses a broker (Anypoint MQ, Kafka) you control.
Webhook ingestion receives HTTP POST calls from a third-party system you don't control.

**Distinguish from request-reply:** Request-reply — you call out to a system. Webhook — a system
calls in to you. The caller expects a fast 200 OK, not a computed response.

**Do not use** for: internal system calls (use request-reply), bulk data delivery (use file-based-etl),
or when you control the source and can publish to a broker instead.

---

## Reference Architecture

```
External SaaS (Stripe / GitHub / DocuSign / HubSpot / custom)
        │  POST /webhooks/{source}/{eventType}
        │  X-Signature: sha256=...
        ▼
{consumer}-exp-api (Webhook Receiver)
  ├── Verify signature (HMAC-SHA256 or bearer token)
  ├── Return 200 OK immediately (before processing)
  ├── Publish raw event to Anypoint MQ
  └── (Processing is decoupled from acknowledgement)
        │
        ▼
Anypoint MQ (webhook ingestion queue)
        │
        ▼
{domain}-proc-api (Webhook Processor)
  ├── Parse event type and payload
  ├── Idempotency check (deduplicate by event ID)
  ├── Route by event type
  ├── Apply business logic
  └── Call system API(s)
        │
        ▼
{target-system}-sys-api
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "primaryPattern": "webhook-ingestion",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "under-1s",
    "frequency": "triggered",
    "volume": "low"
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "maxRetries": 5,
    "backoff": "exponential",
    "dlq": true,
    "errorEnvelope": true
  },
  "systems": {
    "connectors": ["anypoint-mq"]
  },
  "devops": {
    "munitCoverage": 80
  }
}
```

---

## Flow Structure

### Webhook Receiver (returns 200 immediately)

```xml
<flow name="http-receive-{source}-webhook-flow">
  <http:listener config-ref="HTTP_Listener_config"
    path="/webhooks/{source}/{eventType}"
    method="POST"/>

  <!-- 1. Verify signature FIRST — reject unauthenticated calls -->
  <flow-ref name="verify-{source}-signature-subflow"/>

  <!-- 2. Return 200 OK immediately — before any processing -->
  <!-- Processing is async; if we wait, external system may timeout and retry -->
  <set-variable variableName="incomingPayload" value="#[payload]"/>
  <set-variable variableName="eventId"
    value="#[attributes.headers['X-{Source}-Event-Id'] default uuid()]"/>

  <!-- 3. Publish to MQ for async processing -->
  <anypoint-mq:publish
    config-ref="Anypoint_MQ_Config"
    destination="${mq.queue.webhook.{source}}"
    messageId="#[vars.eventId]">
    <anypoint-mq:body>#[vars.incomingPayload]</anypoint-mq:body>
    <anypoint-mq:properties>
      <anypoint-mq:property key="eventType" value="#[attributes.uriParams.eventType]"/>
      <anypoint-mq:property key="source" value="{source}"/>
    </anypoint-mq:properties>
  </anypoint-mq:publish>

  <!-- Return 200 OK with no body or minimal acknowledgement -->
  <set-payload value='#[{ "received": true }]'/>
  <http:set-response statusCode="200"/>

  <error-handler>
    <on-error-propagate type="SECURITY:INVALID_SIGNATURE">
      <http:set-response statusCode="401"/>
      <set-payload value='#[{ "error": "Invalid signature" }]'/>
    </on-error-propagate>
    <on-error-propagate type="ANY">
      <!-- Return 500 — external system will retry -->
      <http:set-response statusCode="500"/>
    </on-error-propagate>
  </error-handler>
</flow>
```

### Signature Verification Sub-flow (HMAC-SHA256)

```xml
<sub-flow name="verify-{source}-signature-subflow">
  <!-- Compute expected signature from raw body + secret -->
  <set-variable variableName="expectedSignature"
    value="#['sha256=' ++ hmacWith(payload as Binary, Mule::p('{source}.webhook.secret') as Binary, 'HmacSHA256') as String {base: 'hex'}]"/>

  <!-- Compare with header (constant-time comparison to prevent timing attacks) -->
  <choice>
    <when expression="#[attributes.headers['X-{Source}-Signature-256'] != vars.expectedSignature]">
      <raise-error type="SECURITY:INVALID_SIGNATURE" description="Webhook signature mismatch"/>
    </when>
  </choice>
</sub-flow>
```

### Webhook Processor (async consumer)

```xml
<flow name="mq-process-{source}-webhook-flow">
  <anypoint-mq:subscriber
    config-ref="Anypoint_MQ_Config"
    destination="${mq.queue.webhook.{source}}"
    acknowledgementMode="MANUAL"/>

  <!-- 1. Idempotency check by eventId -->
  <os:retrieve
    key="#['webhook-' ++ attributes.messageId]"
    target="alreadyProcessed"
    objectStore="persistent-store"/>
  <choice>
    <when expression="#[vars.alreadyProcessed != null]">
      <logger level="INFO" message="#['Duplicate webhook ' ++ attributes.messageId ++ ' — skipping']"/>
      <anypoint-mq:ack messageId="#[attributes.messageId]"/>
    </when>
    <otherwise>
      <!-- 2. Parse and route by event type -->
      <set-variable variableName="eventType"
        value="#[attributes.properties.eventType]"/>

      <!-- 3. Process -->
      <flow-ref name="{source}-handle-#[vars.eventType]-flow"/>

      <!-- 4. Mark as processed -->
      <os:store
        key="#['webhook-' ++ attributes.messageId]"
        value="#[now() as String]"
        objectStore="persistent-store"
        entryTtl="24"
        entryTtlUnit="HOURS"/>

      <anypoint-mq:ack messageId="#[attributes.messageId]"/>
    </otherwise>
  </choice>

  <error-handler ref="global-error-handler"/>
</flow>
```

---

## Signature Verification by Provider

| Provider | Signature header | Algorithm | Notes |
|----------|-----------------|-----------|-------|
| Stripe | `Stripe-Signature` | HMAC-SHA256 with timestamp | Include `t=` timestamp in computed value |
| GitHub | `X-Hub-Signature-256` | HMAC-SHA256 | `sha256=` prefix |
| Shopify | `X-Shopify-Hmac-Sha256` | HMAC-SHA256 | Base64-encoded |
| HubSpot | `X-HubSpot-Signature-v3` | HMAC-SHA256 | Include timestamp header |
| DocuSign | `X-DocuSign-Signature-1` | RSA-SHA256 | Public key verification |
| Custom / Simple | Bearer token | n/a | Compare `Authorization: Bearer {secret}` |

Never skip signature verification in production. An unsecured webhook endpoint is a public
injection surface. Reject unsigned requests immediately (401) before any processing.

---

## Retry Semantics

External systems retry on non-2xx responses. Design around this:

| Scenario | Our response | Effect |
|----------|-------------|--------|
| Signature invalid | 401 | External system will NOT retry (auth failure) |
| Our system down | 5xx | External system WILL retry → idempotency required |
| MQ publish failure | 500 | External system WILL retry → idempotency prevents double-process |
| Slow processing | Return 200 fast | External system satisfied; we process async |

---

## Idempotency

External systems may deliver the same event more than once (network retry, timeout). All webhook
processing must be idempotent:
- Use the external event ID as the idempotency key (Stripe: `id`, GitHub: `X-GitHub-Delivery`)
- Store in persistent Object Store; TTL = 24 hours
- On duplicate: log INFO, ack MQ message, skip processing

---

## Error Handling

Strategy: **retry-then-dlq** (on the MQ processor side)

| Failure | Action |
|---------|--------|
| Signature invalid | 401 immediately; no MQ publish |
| MQ publish failure | Return 500 → external system retries → we retry MQ publish on next delivery |
| Event parse failure | NACK → DLQ immediately (bad payload will always fail) |
| Target system connectivity | Retry 5× exponential; then NACK → DLQ |
| Unknown event type | Log WARN; ack (unrecognised events are expected as providers add new types) |

---

## MUnit Test Coverage

Each webhook flow must have tests for:
- [ ] Valid signature + known event type → 200 returned; event published to MQ; target called
- [ ] Invalid signature → 401 returned; nothing published to MQ
- [ ] Duplicate event (same eventId) → idempotency check fires; target NOT called twice
- [ ] Unknown event type → logged and acknowledged; no error
- [ ] Target system unavailable → retries fire; DLQ populated after exhaustion
- [ ] MQ publish failure → 500 returned to caller; no data lost

---

## Example Project

**Client:** E-commerce — Stripe payment webhooks (charge.succeeded, payment_intent.failed)
**Flows:** `http-receive-stripe-webhook-flow`, `verify-stripe-signature-subflow`,
          `mq-process-stripe-webhook-flow`
**Connectors:** `http`, `anypoint-mq`, `salesforce` (order update), `email` (payment failure alert)
**Security tier:** partner (HMAC signature + TLS)
**Deployment:** CloudHub 2.0, 0.2 vCores × 2 replicas
