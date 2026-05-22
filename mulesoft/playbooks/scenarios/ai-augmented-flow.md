# Scenario: AI-Augmented Integration Flow

> **Pattern:** `ai-augmented-flow`
> **Trigger:** Any — HTTP, MQ subscriber, scheduler, file listener, webhook
> **Latency target:** +1–5s overhead per LLM call (budget into overall flow SLA)
> **Volume:** Low–medium (LLM API calls are rate-limited and expensive; cache aggressively)

---

## When to Use This Pattern

- A step in an existing integration flow requires intelligence that cannot be expressed as deterministic rules
- Natural language extraction: parse unstructured text (emails, PDFs, support tickets) into structured fields
- Classification / routing: route a message to different downstream systems based on semantic content
- Semantic transformation: translate between schemas where the mapping is context-dependent
- Data enrichment: augment records with AI-derived fields (sentiment, category, risk score)
- Anomaly detection: flag records that deviate from expected patterns before writing to target

**This pattern adds an AI call INTO an existing integration flow — it is not a standalone AI application.**
The integration pattern (request-reply, event-driven, batch, etc.) remains the primary pattern.
AI-augmented is always a secondary pattern applied to one or more steps within another pattern.

**Do not use** for: replacing deterministic DataWeave transforms that work correctly, bulk
processing where per-record LLM latency and cost are prohibitive (> 10K records), or when
a rules engine or regex achieves the same result.

---

## Reference Architecture

### AI-Augmented Event Processing

```
MQ / HTTP / File trigger
        │
        ▼
{domain}-proc-api
  ├── Receive raw message (email body, ticket text, document content)
  ├── Call AI step (MuleSoft AI Chain / Inference / HTTP to LLM API)
  │     ├── Input:  unstructured text + system prompt
  │     └── Output: structured JSON (extracted fields, classification, score)
  ├── Validate AI output (schema check; fallback if confidence < threshold)
  ├── Merge AI-derived fields with original record
  └── Route to target system(s) based on AI output
        │
        ▼
{target-system}-sys-api
```

### AI-Augmented Batch Enrichment

```
Batch input (records from source system)
        │
        ▼
Batch process-records step
  ├── For each record:
  │     ├── Check cache (Object Store): already classified?
  │     ├── If cached → use cached result
  │     └── If not cached → call LLM → cache result (TTL 24h)
  ├── Merge enrichment into record
  └── Write enriched record to target
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "integrationStyle": "messaging",
    "primaryPattern": "event-driven",
    "secondaryPatterns": ["ai-augmented-flow"]
  },
  "nfr": {
    "latency": "under-10s",
    "frequency": "triggered",
    "volume": "low"
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "compensationStrategy": "retry",
    "maxRetries": 2,
    "backoff": "fixed",
    "dlq": true,
    "invalidMessageChannel": false,
    "errorEnvelope": true
  },
  "flowControl": {
    "direction": "push",
    "messageTtlHours": 24,
    "maxConcurrency": 4,
    "backpressureEnabled": true,
    "deduplicationEnabled": true,
    "deduplicationTtlMinutes": 1440
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

## Connector Selection

| Use case | Connector | Notes |
|---------|-----------|-------|
| MuleSoft-native LLM orchestration | `mule-ai-chain-connector` (MuleSoft AI Chain) | Supports OpenAI, Anthropic, Azure OpenAI, Bedrock; prompt templates; tools |
| Direct LLM inference (simple calls) | `mule-inference-connector` (MuleSoft Inference) | Lighter than AI Chain; for single-turn calls |
| Vector store operations | `mule-vectors-connector` (MuleSoft Vectors) | Embed + upsert + similarity search |
| OpenAI directly | `mule-openai-connector` or `http` | Verify version on Exchange; fallback to HTTP |
| Anthropic directly | `mule-anthropic-connector` or `http` | Verify version on Exchange; fallback to HTTP |
| Amazon Bedrock | `amazon-bedrock` connector | For AWS-native deployments; supports Claude, Titan, Llama |
| Azure OpenAI | `http` + Azure endpoint | No dedicated connector; use HTTP with AAD auth |

Default: **MuleSoft AI Chain connector** for new projects — it abstracts provider, handles retries,
supports prompt templates and tool calling natively.

---

## Flow Structure

### AI Extraction / Classification Step

```xml
<flow name="{trigger}-process-{entity}-ai-flow">
  <!-- Existing trigger (MQ subscriber, HTTP listener, etc.) -->

  <!-- 1. Extract text content to process -->
  <set-variable variableName="inputText" value="#[payload.bodyText default payload as String]"/>

  <!-- 2. Check AI result cache (skip LLM call if recently processed same content) -->
  <set-variable variableName="cacheKey"
    value="#[DigestUtils::md5Hex(vars.inputText)]"/>
  <os:retrieve key="#[vars.cacheKey]" target="cachedAiResult" objectStore="ai-cache-store"/>

  <choice>
    <when expression="#[vars.cachedAiResult == null]">
      <!-- 3a. Call LLM -->
      <ai-chain:prompt-template
        config-ref="AI_Chain_Config"
        template="${ai.prompt.{entity}.extraction}"
        target="aiResult">
        <ai-chain:variables>
          <ai-chain:variable key="input">#[vars.inputText]</ai-chain:variable>
        </ai-chain:variables>
      </ai-chain:prompt-template>

      <!-- 4. Parse LLM JSON output -->
      <ee:transform>
        <ee:set-variable variableName="aiResult">
          <![CDATA[%dw 2.0
          output application/java
          ---
          payload.response as Object {class: "java.util.HashMap"}]]>
        </ee:set-variable>
      </ee:transform>

      <!-- 5. Cache result -->
      <os:store key="#[vars.cacheKey]" value="#[vars.aiResult]"
        objectStore="ai-cache-store" entryTtl="24" entryTtlUnit="HOURS"/>
    </when>
    <otherwise>
      <set-variable variableName="aiResult" value="#[vars.cachedAiResult]"/>
    </otherwise>
  </choice>

  <!-- 6. Validate AI output; fallback if confidence below threshold -->
  <choice>
    <when expression="#[(vars.aiResult.confidence default 0) lt 0.7]">
      <flow-ref name="{entity}-ai-fallback-flow"/>
    </when>
    <otherwise>
      <!-- 7. Merge AI fields with original payload and continue -->
      <flow-ref name="{entity}-process-with-ai-result-flow"/>
    </otherwise>
  </choice>

  <error-handler ref="global-error-handler"/>
</flow>
```

### Prompt Template File (stored in src/main/resources/prompts/)

```
# {entity}-extraction-prompt.txt

You are an integration assistant. Extract the following fields from the input text.
Return ONLY valid JSON. Do not include explanation or markdown.

Required fields:
- category (string): one of [ORDER, COMPLAINT, INQUIRY, ESCALATION]
- priority (string): one of [LOW, MEDIUM, HIGH, CRITICAL]
- summary (string): one sentence, max 100 characters
- entities (array): list of company names, product names, or order IDs mentioned
- confidence (number): 0.0–1.0, your confidence in the extraction

Input:
{{input}}
```

---

## Prompt Engineering Standards

- Store all prompts as external `.txt` files in `src/main/resources/prompts/`
- Never hardcode prompts inline in XML — they require iteration and review
- Always specify output format explicitly in the prompt (JSON schema, field names, allowed values)
- Include a `confidence` field in extraction prompts — use it to trigger fallback
- System prompts: define role and constraints. User prompts: provide input data
- Version prompts with a comment header: `# v1.2 | updated 2026-05-10 | reason: added entities field`
- Test prompts independently before embedding in flows

---

## Fallback Strategy

LLM calls WILL produce unexpected output. Every AI step must have a fallback:

| Failure mode | Fallback |
|-------------|---------|
| LLM API timeout (> 10s) | Route to manual review queue; log WARNING |
| LLM returns malformed JSON | Attempt JSON extraction with regex; if fails → manual queue |
| Confidence < threshold | Route to manual review queue with original payload |
| LLM API unavailable (5xx) | Retry 2× fixed 3s; if still down → route to manual review queue |
| Token limit exceeded | Truncate input to max tokens; log WARN with original length |

**Manual review queue:** Anypoint MQ queue `{domain}-ai-manual-review-{env}-queue` — ops team
processes these. Never silently drop records that the AI cannot handle.

---

## Cost and Rate Limit Management

LLM API calls are expensive and rate-limited. Apply all of these:

1. **Cache aggressively** — same input text → same output (Object Store, TTL 24h, key = MD5 of input)
2. **Batch where possible** — for batch flows, group records and call LLM once per group (if prompt allows)
3. **Truncate inputs** — set a max input length (tokens); most extraction tasks need < 500 tokens
4. **Rate limit at flow level** — use a fixed-frequency policy if processing high volumes
5. **Monitor spend** — log token usage per call; set Anypoint Monitoring alert on LLM call volume

Approximate token cost guidance (update from provider pricing):
- OpenAI GPT-4o: ~$2.50/1M input tokens, ~$10/1M output tokens
- Anthropic Claude Sonnet 4.6: ~$3/1M input tokens, ~$15/1M output tokens
- For enrichment flows: budget 500 input + 200 output tokens per record

---

## Data Masking — MANDATORY

Before sending any payload to an external LLM API:
- Strip PII: names, emails, phone numbers, SSNs, account numbers, DOBs
- Strip credentials: API keys, passwords, tokens
- Strip company-confidential fields unless the LLM is deployed privately (e.g., Azure OpenAI in tenant)
- Log a WARN if any masked fields are detected; include field names in the log (not values)

Use DataWeave masking transform before the AI connector call. Store masking rules in a shared DWL file:
`dwl/mask-pii-for-ai.dwl`

For regulated (HIPAA, PCI, GDPR) data: **use only private/tenant-isolated LLM deployments.**
Do not send regulated data to public LLM APIs.

---

## Observability

Log the following for every AI call:
- `correlationId`, `flowName`, `modelId`, `inputTokens`, `outputTokens`, `latencyMs`
- `confidence` (if returned), `cacheHit` (true/false)
- Never log the full prompt or LLM response — they may contain PII or sensitive data

Alert thresholds:
- AI call p95 latency > 8s → MEDIUM alert
- AI fallback rate > 10% in 10 min → HIGH alert (model degrading or prompt broken)
- LLM API error rate > 5% → HIGH alert

---

## Error Handling

Strategy: **retry-then-dlq** with mandatory fallback

| Failure | Action |
|---------|--------|
| LLM API timeout | Retry 2× fixed 3s; then → manual review queue |
| LLM bad output / low confidence | No retry; → manual review queue with original payload |
| LLM API 429 (rate limit) | Retry with exponential 5/15/45s backoff |
| LLM API 5xx | Retry 2×; then → manual review queue; alert |
| Cache store unavailable | Bypass cache; call LLM directly; log WARN |

---

## MUnit Test Coverage

Each AI-augmented flow must have tests for:
- [ ] Happy path — valid input → LLM returns structured JSON → fields merged into payload
- [ ] Cache hit — LLM connector NOT called on second request with same input
- [ ] LLM returns low confidence — fallback route fires; manual queue populated
- [ ] LLM returns malformed JSON — fallback fires; no exception propagates
- [ ] LLM API unavailable — retries fire; manual review queue populated
- [ ] PII masking step runs before LLM call (verify masked payload, not raw)

---

## Example Project

**Client:** Customer service automation — inbound email → AI extracts category/priority/entities →
routes to correct team queue in ServiceNow
**Flows:** `mq-subscribe-email-process-flow`, `email-ai-classify-flow`, `servicenow-create-ticket-flow`
**Connectors:** `anypoint-mq`, `ai-chain` (Claude Sonnet 4.6), `servicenow`, `email`
**Secondary pattern:** `outbound-notification` (alerts when AI fallback rate spikes)
**Security tier:** internal (Azure OpenAI in tenant — no PII leaves org boundary)
**Deployment:** CloudHub 2.0, 0.5 vCores × 2 replicas
