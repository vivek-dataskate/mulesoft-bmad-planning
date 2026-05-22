# Story Template: AI Gateway Infrastructure Setup

**Story Type:** Global Infrastructure (Conditional)
**When to include:** Only if `decisions.json integration.primaryPattern = "ai-gateway"`
**Priority:** P0 — governance controls must be wired before any LLM traffic flows through this proxy
**Standard:** `standards/scenarios/ai-gateway.md`
**Scenario File:** `standards/scenarios/ai-gateway.md`
**Scaffold Files:** `src/main/mule/global-config.xml`, `src/main/mule/{domain}-ai-gateway-flows.xml`

---

## User Story

As a developer, I need the AI Gateway proxy configured — rate limiting per caller, PII redaction before forwarding to the LLM provider, model routing, cost/token audit logging, and provider credentials secured — so that all internal LLM traffic flows through a single governed endpoint that enforces policy without adding more than 50ms overhead to each call.

---

## Acceptance Criteria

### Caller Authentication
- [ ] `client-id-enforcement` policy applied at Anypoint API Manager or inline via `<http:listener>` with client-id header validation
- [ ] Each team or application that calls the gateway has its own **Client Application** registered in Anypoint Exchange (one app per cost center / team)
- [ ] Client ID and Secret passed in `client_id` and `client_secret` headers (or Authorization header per agreed convention)
- [ ] Unknown / missing client ID → 401 Unauthorized immediately; request NOT forwarded to LLM provider
- [ ] Client identity extracted and stored as `vars.callerId` for downstream rate limiting and audit logging

### Rate Limiting (per caller)
- [ ] `<os:retrieve>` reads call count for `vars.callerId` from persistent Object Store at flow entry
- [ ] Rate limit thresholds per caller defined in properties (not hardcoded):
  - `ai.gateway.rateLimit.{callerId}.requestsPerMinute` (fallback to `ai.gateway.rateLimit.default.requestsPerMinute`)
  - Default: 60 requests per minute per caller (tune per LLM provider's own rate limits)
- [ ] If caller exceeds limit → 429 Too Many Requests with `Retry-After` header; request NOT forwarded
- [ ] Counter stored in persistent Object Store, key: `ai-ratelimit-{callerId}-{minuteWindow}`, TTL: 2 minutes
- [ ] `minuteWindow` = `now() as String {format: "yyyyMMddHHmm"}` (rolling 1-minute window)
- [ ] Rate limit counters survive worker restart — persistent OS required

### PII Redaction (before forwarding to LLM provider)
- [ ] PII scan applied to request `messages[].content` before the LLM provider call
- [ ] PII patterns redacted (minimum set per `architecture.md` data classification):
  - Email addresses → `[EMAIL_REDACTED]`
  - Phone numbers → `[PHONE_REDACTED]`
  - SSN / NIN → `[SSN_REDACTED]`
  - Credit card numbers (Luhn-valid) → `[CARD_REDACTED]`
  - Additional patterns from `architecture.md` data sensitivity section
- [ ] DataWeave regex-based redaction in `src/main/resources/dwl/redact-pii-from-prompt.dwl`
- [ ] Original prompt **never logged** — only redacted version logged at DEBUG
- [ ] Redaction summary logged: `{ correlationId, callerId, piiTypesFound: [...], fieldCount: N }` at INFO level
- [ ] If PII redaction is **blocking** (client requires no PII to reach provider): 400 returned with `{ "error": "prompt contains restricted content" }` instead of forwarding

### Model Routing
- [ ] Request body contains `model` field (or caller-level default applies):
  - `"gpt-4o"` → route to OpenAI API
  - `"claude-*"` → route to Anthropic API
  - `"amazon.titan-*"` or `"anthropic.claude-*"` → route to AWS Bedrock
  - `"gemini-*"` → route to Google Gemini API
  - Unknown model → 400 Bad Request with list of supported models
- [ ] Model routing defined in properties (not hardcoded): `ai.gateway.routing.{modelPrefix}={provider}`
- [ ] Default model per caller configurable: `ai.gateway.default.model.{callerId}`
- [ ] Each provider has a dedicated HTTP connector config in `global-config.xml` with credentials from Secrets Manager

### LLM Provider Connector Configs (global-config.xml)
- [ ] One `<http:request-config>` per active provider, named `{Provider}_AI_Config`
- [ ] API keys / credentials in Secrets Manager:
  - OpenAI: `openai.apiKey`
  - Anthropic: `anthropic.apiKey`
  - AWS Bedrock: IAM role-based auth preferred; fallback: `aws.accessKeyId` + `aws.secretAccessKey`
  - Azure OpenAI: `azure.openai.apiKey` + `azure.openai.endpoint`
- [ ] Timeout per provider config: `${ai.gateway.provider.{provider}.timeoutSeconds}` (default: 30s)
- [ ] Provider unavailable → 502 Bad Gateway to caller (never expose provider error detail)

### Audit Logging (async — must NOT add latency to the critical path)
- [ ] Async `<anypoint-mq:publish>` to `{domain}-ai-audit-{env}-queue` after LLM response received
- [ ] Audit payload (never log full prompt or response — only metadata):
  ```json
  {
    "correlationId": "...",
    "callerId": "...",
    "model": "...",
    "provider": "...",
    "promptTokens": N,
    "completionTokens": N,
    "totalTokens": N,
    "latencyMs": N,
    "piiRedacted": true/false,
    "piiTypes": [...],
    "timestamp": "..."
  }
  ```
- [ ] Token counts extracted from provider response (`usage.prompt_tokens`, `usage.completion_tokens`)
- [ ] Audit queue TTL: 72 hours (monitoring/audit category)
- [ ] Audit queue failure wrapped in `<on-error-continue>` — audit log failure NEVER breaks the primary flow

### Error Handling
- [ ] All provider errors normalized to a consistent error envelope before returning to caller
- [ ] Provider 429 (rate limited by LLM provider): retry 2× with exponential backoff 1s/3s; if still 429 → 503 to caller
- [ ] Provider 5xx: retry 2× exponential; if still failing → 502 to caller
- [ ] Provider timeout: 504 Gateway Timeout to caller with `Retry-After: 30`
- [ ] No provider error message or stack trace exposed in response to caller

### Monitoring
- [ ] Alert: gateway error rate > 5% in 5 min → HIGH
- [ ] Alert: p95 latency > 10s → MEDIUM (LLM calls are slow; 10s is the agreed ceiling)
- [ ] Alert: any provider 429 rate > 10% → MEDIUM (approaching provider rate limits — reduce default rate limit or increase provider quota)
- [ ] Alert: audit queue DLQ > 0 → MEDIUM (audit records being lost)
- [ ] Custom dashboard metric: total tokens per caller per hour (for cost allocation)

### MUnit Tests
- [ ] Valid caller + valid prompt: mock provider returns 200; assert response forwarded; assert audit message published
- [ ] Unknown caller: missing client-id header → assert 401; verify provider NOT called
- [ ] Rate limit exceeded: mock Object Store returning count > limit → assert 429 with `Retry-After` header; verify provider NOT called
- [ ] PII in prompt: inject email address in prompt → assert `[EMAIL_REDACTED]` in forwarded request; assert original prompt NOT forwarded
- [ ] Unknown model: `model: "llama-3"` → assert 400 with supported model list
- [ ] Provider 5xx: mock provider returns 500 twice → assert retry fires → assert 502 returned to caller after max retries
- [ ] Audit failure: mock MQ publish throws error → assert primary flow still returns 200; audit failure only logged

---

## Caller Registry
*(PM agent populates from architecture.md)*

| Caller / Team | Client App Name | Rate Limit (req/min) | Default Model | Cost Center |
|--------------|----------------|---------------------|---------------|-------------|
| `{teamName}` | `{appName}` | `{N}` | `{model}` | `{costCenter}` |

---

## Implementation Notes

- The gateway adds < 50ms overhead target — PII redaction DataWeave must be optimized (no regex on large payloads; use `java!java.util.regex.Pattern` compiled patterns if needed)
- AWS Bedrock uses a different request format than OpenAI API (`messages` vs `prompt`) — the model router DataWeave must normalize the request format per provider
- Anthropic API requires `anthropic-version` header and `x-api-key` (not `Authorization: Bearer`) — do not reuse the OpenAI HTTP config for Anthropic
- Rate limiting via Object Store is a soft mechanism — under extreme concurrency, two requests may read the same counter simultaneously; this is acceptable over-counting, not a security issue
- For strict rate limiting, use Flex Gateway `rate-limiting` policy at the API Manager level instead
- Reference: `standards/scenarios/ai-gateway.md` — full reference architecture, decisions.json defaults, and provider normalization patterns
