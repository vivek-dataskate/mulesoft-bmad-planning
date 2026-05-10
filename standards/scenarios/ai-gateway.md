# Scenario: AI Gateway

> **Pattern:** `ai-gateway`
> **Trigger:** HTTP listener (synchronous proxy)
> **Latency target:** under-10s (adds < 50ms overhead to LLM call)
> **Volume:** medium–high (all AI/LLM traffic from all internal teams routes through this)

---

## When to Use This Pattern

- Multiple internal teams or applications call LLM APIs (OpenAI, Anthropic, Bedrock, Gemini)
  and there is no centralized control over usage, cost, or model selection
- Uncontrolled LLM API key usage is exposing the organization to cost overruns or rate-limit failures
- PII or confidential data may be leaking into LLM prompts sent to third-party AI providers
- Clients want to switch LLM providers or models without changing application code
- Audit logging of all AI prompts and responses is required for compliance
- AI quota must be allocated per team, application, or cost center

**This pattern positions MuleSoft as the AI traffic proxy layer:**
```
Internal App / MuleSoft Flow (P: ai-augmented-flow)
        │  POST /ai/completions (internal endpoint)
        ▼
AI Gateway (this pattern) — MuleSoft Experience or Process API
  ├── Authenticate caller (client-id or OAuth2)
  ├── Identify cost center / team
  ├── Rate limit (per team / per app)
  ├── PII scan + redaction (before sending to LLM)
  ├── Model routing (route to correct LLM provider/model)
  ├── Forward to LLM provider API
  ├── Audit log (prompt hash, response summary, token usage, cost)
  └── Return response to caller
        │
        ▼
LLM Provider (OpenAI / Anthropic / AWS Bedrock / Azure OpenAI / Google Gemini)
```

**Do not use** when: only one team calls one LLM and cost/governance is not a concern — use
pattern P (ai-augmented-flow) directly. The gateway adds operational overhead that is only
justified when governance, cost allocation, or multi-team usage is required.

---

## Reference Architecture

```
                    ┌─────────────────────────────────────────────────────┐
                    │         AI Gateway — Experience API Layer           │
Caller (any app)    │                                                     │
POST /ai/completions│  1. Auth (client-id-enforcement or OAuth2)          │
────────────────►   │  2. Rate limit check (Anypoint policy or Object Store)│
                    │  3. PII scan — redact before forwarding             │
                    │  4. Model router — select provider + model          │
                    │  5. Forward to LLM provider                         │
                    │  6. Audit log (async — does not affect latency)     │
                    │  7. Return response                                  │
                    │                                                     │
                    │  Anypoint MQ (audit queue, async write-behind)      │
                    └─────────────────────────────────────────────────────┘
                              │             │              │
                    ┌─────────┘    ┌────────┘    ┌────────┘
                    ▼              ▼             ▼
               OpenAI API    Anthropic API   AWS Bedrock
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "integrationStyle": "rpc",
    "primaryPattern": "ai-gateway",
    "direction": "bidirectional"
  },
  "nfr": {
    "latency": "under-10s",
    "frequency": "real-time",
    "volume": "medium",
    "availability": "99.9"
  },
  "security": {
    "level": "partner",
    "apiAuth": "oauth2-client-credentials",
    "gatewayPolicies": ["client-id-enforcement", "rate-limiting"],
    "secretsManager": true,
    "dataMasking": true
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "compensationStrategy": "retry",
    "maxRetries": 2,
    "backoff": "exponential",
    "dlq": false,
    "errorEnvelope": true
  },
  "flowControl": {
    "direction": "push",
    "maxConcurrency": 20,
    "backpressureEnabled": true,
    "deduplicationEnabled": false
  },
  "devops": {
    "munitCoverage": 80
  }
}
```

---

## Core Capabilities

### 1. Authentication and Caller Identity

Every AI gateway call must be authenticated. The caller's identity determines:
- Which model they are allowed to use
- What rate limit applies
- Which cost center is charged

```xml
<!-- Client ID enforcement is sufficient for internal gateways -->
<!-- Use OAuth2 if calling from external or partner applications -->
<api-gateway:client-id-enforcement
  clientIdExpression="#[attributes.headers['client_id']]"
  clientSecretExpression="#[attributes.headers['client_secret']]"/>

<!-- Extract caller metadata for routing and rate limiting -->
<ee:transform doc:name="Identify Caller">
  <ee:set-variable variableName="callerApp">
    <![CDATA[%dw 2.0
    output application/java
    ---
    {
      appId:      attributes.headers['client_id'],
      costCenter: attributes.headers['X-Cost-Center'] default "unassigned",
      tier:       attributes.headers['X-AI-Tier'] default "standard"
    }
    ]]>
  </ee:set-variable>
</ee:transform>
```

### 2. Rate Limiting (per team / per cost center)

```xml
<!-- Check rate limit using Object Store (sliding window counter) -->
<os:retrieve key="#['ai-rate-' ++ vars.callerApp.appId ++ '-' ++ (now() as String {format: 'yyyy-MM-dd-HH'})]"
  target="requestCount" defaultValue="0" objectStore="persistent-store"/>

<choice doc:name="Enforce Rate Limit">
  <when expression="#[vars.requestCount >= ${ai.gateway.rate.limit.per.hour}]">
    <set-payload value="#[output application/json --- { error: 'rate_limit_exceeded', retryAfter: 3600 }]"/>
    <http:response-builder statusCode="429">
      <http:headers><![CDATA[#[{ 'Retry-After': '3600' }]]]></http:headers>
    </http:response-builder>
  </when>
  <otherwise>
    <os:store key="#['ai-rate-' ++ vars.callerApp.appId ++ '-' ++ (now() as String {format: 'yyyy-MM-dd-HH'})]"
      value="#[vars.requestCount + 1]" ttl="1" ttlUnit="HOURS" objectStore="persistent-store"/>
  </otherwise>
</choice>
```

### 3. PII Scan and Redaction

Before forwarding any prompt to an external LLM provider, scan for and redact PII.
Failure to do this is a compliance violation for regulated clients.

```xml
<sub-flow name="pii-scan-and-redact-subflow">
  <!-- Pattern-based PII detection in prompt text -->
  <ee:transform doc:name="Redact PII from Prompt">
    <ee:set-variable variableName="safePrompt">
      <![CDATA[%dw 2.0
      output application/java
      var prompt = payload.messages[-1].content
      // Redact common PII patterns before sending to third-party LLM
      var redacted = prompt
        replace /\b\d{3}-\d{2}-\d{4}\b/ with "[SSN-REDACTED]"           // US SSN
        replace /\b\d{16}\b/ with "[CARD-REDACTED]"                       // Credit card
        replace /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/ with "[EMAIL-REDACTED]"
        replace /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/ with "[PHONE-REDACTED]"  // US phone
      ---
      redacted
      ]]>
    </ee:set-variable>
  </ee:transform>

  <!-- Log PII detection event if redaction occurred (never log the PII itself) -->
  <choice doc:name="Log PII Detection">
    <when expression="#[vars.safePrompt != payload.messages[-1].content]">
      <logger level="WARN"
        message="#['PII detected and redacted in AI request from app=' ++ vars.callerApp.appId ++ ' correlationId=' ++ correlationId]"/>
    </when>
  </choice>
</sub-flow>
```

### 4. Model Router

Route to the appropriate LLM provider based on request metadata:

```xml
<sub-flow name="ai-model-router-subflow">
  <choice doc:name="Route to LLM Provider">
    <!-- Route based on requested model or caller tier -->
    <when expression="#[payload.model startsWith 'claude']">
      <set-variable variableName="llmProvider" value="anthropic"/>
    </when>
    <when expression="#[payload.model startsWith 'gpt']">
      <set-variable variableName="llmProvider" value="openai"/>
    </when>
    <when expression="#[payload.model startsWith 'amazon']">
      <set-variable variableName="llmProvider" value="bedrock"/>
    </when>
    <otherwise>
      <!-- Default model from configuration — allows provider swap without code change -->
      <set-variable variableName="llmProvider" value="${ai.gateway.default.provider}"/>
      <set-variable variableName="llmModel" value="${ai.gateway.default.model}"/>
    </otherwise>
  </choice>
</sub-flow>
```

### 5. Async Audit Logging (Wire Tap)

All AI requests must be audit logged. Use async to avoid adding latency to the critical path.
Never log the full prompt or response — log a hash, token count, and cost estimate only.

```xml
<async doc:name="Audit Log AI Request">
  <anypoint-mq:publish config-ref="Anypoint_MQ_Config"
    destination="${mq.queue.ai-audit}"
    messageId="#[correlationId]">
    <anypoint-mq:body><![CDATA[#[output application/json ---
    {
      correlationId: correlationId,
      appId:         vars.callerApp.appId,
      costCenter:    vars.callerApp.costCenter,
      provider:      vars.llmProvider,
      model:         payload.model default vars.llmModel,
      promptHash:    write(payload.messages, "application/json") hashWith "SHA-256",
      inputTokens:   vars.llmResponse.usage.input_tokens  default 0,
      outputTokens:  vars.llmResponse.usage.output_tokens default 0,
      estimatedCostUsd: (vars.llmResponse.usage.input_tokens default 0) * ${ai.cost.per.input.token}
                      + (vars.llmResponse.usage.output_tokens default 0) * ${ai.cost.per.output.token},
      latencyMs:     (now() - vars.requestStartTime) as Number,
      piiRedacted:   vars.piiDetected default false,
      ts:            now() as String
    }]]]>
    </anypoint-mq:body>
  </anypoint-mq:publish>
</async>
```

---

## Cost Tracking Properties

```yaml
# In {env}.yaml
ai.gateway.default.provider: anthropic
ai.gateway.default.model: claude-haiku-4-5-20251001
ai.gateway.rate.limit.per.hour: 100          # requests per app per hour
ai.cost.per.input.token: 0.000001            # update per provider pricing
ai.cost.per.output.token: 0.000005
mq.queue.ai-audit: ai-audit-{env}-queue
```

---

## Circuit Breaker (Provider Unavailability)

When an LLM provider is unavailable, fail fast and fall back to the default provider or return
a structured error — never let a slow LLM stall the caller for 30+ seconds.

```xml
<try doc:name="LLM Call With Timeout">
  <http:request config-ref="${vars.llmProvider}_Config"
    path="/messages" method="POST"
    responseTimeout="${ai.gateway.timeout.ms}"/>
  <error-handler>
    <on-error-continue type="HTTP:TIMEOUT, HTTP:CONNECTIVITY">
      <logger level="WARN"
        message="#['LLM provider ' ++ vars.llmProvider ++ ' unavailable — falling back to default']"/>
      <!-- Attempt fallback provider if configured -->
      <flow-ref name="ai-gateway-fallback-provider-subflow"/>
    </on-error-continue>
  </error-handler>
</try>
```

---

## Request / Response Schema (Internal Contract)

The gateway exposes a **provider-neutral internal API** so callers don't couple to a specific LLM vendor.

```yaml
# Gateway internal request (caller sends this — does not change when provider changes)
POST /ai/v1/completions
Content-Type: application/json
client_id: {app-client-id}
client_secret: {app-client-secret}

{
  "model": "claude-haiku" | "gpt-4o-mini" | "default",  # or omit to use gateway default
  "messages": [{ "role": "user", "content": "..." }],
  "maxTokens": 1024,
  "temperature": 0.7
}

# Gateway internal response (normalized from provider-specific format)
{
  "content": "...",          # LLM response text
  "model": "claude-haiku-4-5-20251001",  # actual model used
  "usage": {
    "inputTokens": 150,
    "outputTokens": 210
  },
  "correlationId": "..."
}
```

**Critical:** Normalize provider-specific response formats to the internal contract in DataWeave.
OpenAI, Anthropic, and Bedrock all have different response schemas — the gateway handles this
so callers never need to know which provider is behind the gateway.

---

## Security Requirements

| Control | Implementation |
|---------|---------------|
| API keys for LLM providers | Secrets Manager only — never in properties files |
| Caller authentication | Client-ID enforcement + optional OAuth2 |
| PII redaction | Mandatory before any call to external LLM |
| Audit log retention | 90 days minimum (compliance); purge after retention period |
| mTLS to LLM providers | Use if provider supports it (Azure OpenAI supports mTLS) |
| Data residency | Route to regional LLM endpoint if data residency is required |

---

## Error Handling

Strategy: **fail-fast with structured error** (no DLQ — sync flow must return synchronously)

| Failure | HTTP Status | Action |
|---------|------------|--------|
| Caller rate limit exceeded | 429 | Return `{ error: 'rate_limit_exceeded', retryAfter: 3600 }` |
| PII detected and redacted | 200 | Continue; log WARN; add `X-PII-Redacted: true` response header |
| LLM provider timeout | 504 | Retry 1×; if fallback configured, try fallback; else return 504 |
| LLM provider 429 | 429 | Return to caller with provider's Retry-After; do not retry on gateway |
| Invalid model requested | 400 | Return `{ error: 'invalid_model', validModels: [...] }` |
| Audit log publish fails | 200 | Continue (audit is async write-off — never break primary flow) |

---

## Relationship to Other Patterns

| Pattern | Relationship |
|---------|-------------|
| **P (ai-augmented-flow)** | P calls the AI gateway (this pattern) rather than calling LLM APIs directly — the gateway is the governed entry point |
| **Q (rag-data-pipeline)** | RAG embeddings also route through the gateway for model governance |
| **A (request-reply)** | Gateway is a specialized request-reply — same HTTP sync mechanics |
| **N (outbound-notification)** | Cost overrun alerts from the gateway use N |

---

## MUnit Test Coverage

- [ ] Happy path — request authenticated → PII clean → model routed → LLM response returned
- [ ] Rate limit enforcement — 101st request in window returns 429
- [ ] PII detection — SSN in prompt is redacted before forwarding; WARN logged
- [ ] Model routing — `claude-haiku` routes to Anthropic; `gpt-4o-mini` routes to OpenAI; `default` uses config
- [ ] LLM provider timeout — fallback provider called; or 504 returned if no fallback
- [ ] Audit log failure — primary flow continues; WARN logged
- [ ] Response normalization — OpenAI and Anthropic response schemas both produce identical internal schema

---

## Example Project

**Client:** Enterprise with 8 internal teams all calling OpenAI — ungoverned cost and PII risk
**Flows:** `post-ai-completions-flow` (main gateway), `pii-scan-and-redact-subflow`,
          `ai-model-router-subflow`, `ai-gateway-fallback-provider-subflow`
**Connectors:** `http` (OpenAI, Anthropic, Bedrock), `anypoint-mq` (audit log), `object-store` (rate limiting)
**Secondary pattern:** `outbound-notification` (alert finance when monthly AI spend > threshold)
**Security tier:** partner (OAuth2 for internal callers; provider API keys in Secrets Manager)
**Deployment:** CloudHub 2.0; 0.5 vCores × 2 replicas for HA
