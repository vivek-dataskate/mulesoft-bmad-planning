# Story Template: AI Provider Configuration

**Story Type:** Global Infrastructure (Conditional)
**When to include:** Only if `decisions.json aiIntegration.enabled = true`
**Priority:** P0
**Standard:** `standards/MULESOFT_DESIGN_STANDARDS.md → Connector Registry → AI Connectors`
**Scaffold File:** `src/main/mule/global-config.xml`
**Scenario Files:** `standards/scenarios/ai-augmented-flow.md` (P), `standards/scenarios/rag-data-pipeline.md` (Q), `standards/scenarios/agentic-mcp-integration.md` (R)

---

## User Story

As a developer, I need the AI provider connector configured in global-config.xml with credentials from Secrets Manager and a timeout/fallback policy, so that AI-augmented flows can call the LLM API reliably without breaking primary flow execution on AI failure.

---

## Acceptance Criteria

### Connector Configuration
- [ ] AI connector configured in `global-config.xml` for provider: `{decisions.json aiIntegration.provider}`
  - `openai` → `mule-openai-connector` (verify version on Exchange before adding to pom.xml)
  - `anthropic` → `mule-anthropic-connector` (verify version on Exchange before adding to pom.xml)
  - `bedrock` → `amazon-bedrock` connector via `aws-credentials`
  - `gemini` → `google-gemini` connector or `mule-http-connector` (verify on Exchange)
  - `azure-openai` → `mule-http-connector` with Azure OpenAI endpoint
- [ ] Model specified: `{decisions.json aiIntegration.model}`
- [ ] `VERIFY on Exchange` note added as TODO comment in pom.xml for AI connectors (AI connector versions change frequently)

### Credentials
- [ ] API key / credentials in Secrets Manager — NEVER hardcoded
- [ ] Secret key: `{provider}.apiKey` or `{provider}.clientSecret` per provider type
- [ ] For AWS Bedrock: IAM role-based auth preferred over access key + secret (CloudHub 2.0 instance profile)

### Timeout and Reliability
- [ ] Timeout set to `{decisions.json aiIntegration.timeoutSeconds}` seconds (default: 30s)
- [ ] HTTP request timeout configured at connector level, not per-flow
- [ ] If `aiIntegration.fallbackOnTimeout = true`:
  - [ ] Fallback behavior documented in architecture.md and implemented in the flow
  - [ ] AI call wrapped in `on-error-continue` — timeout/failure uses fallback value, never breaks primary flow
  - [ ] Fallback response logged at WARN level with `correlationId` and timeout duration

### Vector Store (if `aiIntegration.storeEmbeddingsIn != "none"`)
- [ ] Vector store connection configured in `global-config.xml`:
  - `pinecone` → HTTP connector with Pinecone API endpoint + API key in Secrets Manager
  - `pgvector` → Database connector (PostgreSQL) with `pgvector` extension enabled
  - `weaviate` → HTTP connector with Weaviate endpoint
  - `opensearch` → Amazon OpenSearch connector or HTTP connector
- [ ] Index / collection name specified as property: `${ai.vectorStore.index}`
- [ ] Embedding model dimension matches vector store index configuration

### MUnit Tests
- [ ] Test: mock AI connector returning expected response → verify flow processes AI output correctly
- [ ] Test: mock AI connector throwing timeout exception → verify fallback path activates, primary flow continues
- [ ] Test: verify API key does NOT appear in any log line at any level

---

## AI Integration Summary
*(PM agent populates from decisions.json aiIntegration block)*

| Setting | Value |
|---------|-------|
| Provider | `{aiIntegration.provider}` |
| Model | `{aiIntegration.model}` |
| Use Case | `{aiIntegration.useCase}` |
| Timeout | `{aiIntegration.timeoutSeconds}` seconds |
| Fallback on timeout | `{aiIntegration.fallbackOnTimeout}` |
| Vector store | `{aiIntegration.storeEmbeddingsIn}` |

---

## Implementation Notes

- Reference: `standards/MULESOFT_DESIGN_STANDARDS.md → Connector Registry → AI Connectors (New Winter 2026)`
- AI connector versions change frequently — always verify on Exchange before adding to pom.xml
- AI calls are always secondary to the primary integration pattern — they must not become a single point of failure
- For `rag-data-pipeline` (pattern Q): vector store configuration is the critical path; AI connector is secondary
- For `agentic-mcp-integration` (pattern R): MuleSoft is the server; this story configures the AI provider only if Mule also calls AI internally
