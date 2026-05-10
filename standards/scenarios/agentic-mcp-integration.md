# Scenario: Agentic / MCP Integration

> **Pattern:** `agentic-mcp-integration`
> **Trigger:** AI agent invokes a MuleSoft API as a tool (via MCP protocol or direct HTTP)
> **Latency target:** < 3s per tool call (agent chains multiple calls; each must be fast)
> **Volume:** Low–medium (driven by agent session volume; one session = multiple tool calls)

---

## When to Use This Pattern

- An AI agent (Agentforce, Einstein Copilot, Claude, GPT-4o, custom LangChain/LlamaIndex) needs
  to take actions in enterprise systems — create records, query data, trigger workflows
- MuleSoft APIs are exposed as agent tools via MCP (Model Context Protocol) or OpenAPI
- The integration must be designed for agent consumption: deterministic, stateless, well-described
- You are building the tool layer that agents discover and invoke — not the agent itself
- Agent actions must be audited, rate-limited, and constrained to approved operations

**This pattern inverts the usual flow direction:** Instead of a human or scheduler triggering
MuleSoft, an AI agent is the caller. MuleSoft provides the reliable, governed integration layer
between agents and enterprise systems.

**Do not use** for: standard human-initiated API calls (use request-reply), bulk data operations
by agents (agents are not designed for bulk — use scheduled-sync or batch triggered separately),
or exposing raw system APIs directly to agents without a MuleSoft process layer.

---

## Reference Architecture

### MCP Server Pattern (MuleSoft as MCP Server)

```
AI Agent (Agentforce / Claude / GPT / custom)
        │  MCP protocol (JSON-RPC over HTTP/SSE)
        │  Discovers tools via: GET /mcp/tools
        │  Calls tools via:     POST /mcp/call/{toolName}
        ▼
MuleSoft Experience API (MCP-compatible)
  ├── Tool discovery endpoint  → list available tools with descriptions + schemas
  ├── Tool call dispatcher     → validates input, routes to correct process flow
  ├── Rate limiting            → per-agent-session token bucket
  ├── Audit logging            → every agent action logged to audit trail
  └── Response schema validation → ensures output matches tool contract
        │
        ▼
{domain}-proc-api  (existing process APIs; unchanged)
        │
        ▼
{system}-sys-api → Enterprise System
```

### Direct HTTP Tool Pattern (OpenAPI-described)

```
AI Agent
  │  Reads OpenAPI spec to discover capabilities
  │  Calls: POST /api/v1/orders, GET /api/v1/customers/{id}, etc.
  ▼
MuleSoft Experience API (standard HTTP; OpenAPI spec published to Exchange)
  ├── API spec must have: clear operationId, rich descriptions per endpoint/param
  ├── All endpoints idempotent where possible
  └── Response must include enough context for agent to reason about next step
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "primaryPattern": "agentic-mcp-integration",
    "direction": "unidirectional"
  },
  "nfr": {
    "latency": "under-3s",
    "frequency": "real-time",
    "volume": "low"
  },
  "errorHandling": {
    "strategy": "fail-fast",
    "maxRetries": 1,
    "backoff": "fixed",
    "dlq": false,
    "errorEnvelope": true
  },
  "security": {
    "level": "partner",
    "apiAuth": "oauth2-client-credentials"
  },
  "devops": {
    "munitCoverage": 80
  }
}
```

---

## MCP Connector

MuleSoft provides an MCP connector (Winter 2026). Check `standards/connector-registry.json`
under `protocols_core` category for the current verified version.

```xml
<!-- MCP server config -->
<mcp:server-config name="MCP_Server_Config"
  serverName="${app.name}"
  serverVersion="${app.version}"
  serverDescription="MuleSoft integration tools for ${client.name}"/>

<!-- Tool registration -->
<mcp:tool name="create-order"
  description="Creates a new order in the ERP system. Use when the customer confirms their purchase intent. Returns orderId and estimated fulfillment date."
  inputSchema="${file::schemas/mcp/create-order-input.json}"
  outputSchema="${file::schemas/mcp/create-order-output.json}"/>
```

---

## Flow Structure

### MCP Tool Discovery Endpoint

```xml
<flow name="mcp-list-tools-flow">
  <mcp:listener config-ref="MCP_Server_Config" path="/mcp/tools" method="GET"/>

  <!-- Return tool definitions with rich descriptions and JSON schemas -->
  <set-payload value="#[MCP::listTools()]"/>

  <error-handler ref="global-error-handler"/>
</flow>
```

### MCP Tool Call Dispatcher

```xml
<flow name="mcp-call-tool-flow">
  <mcp:listener config-ref="MCP_Server_Config" path="/mcp/call" method="POST"/>

  <!-- Validate agent identity and rate limit -->
  <flow-ref name="validate-agent-session-subflow"/>

  <!-- Audit: log every agent tool call BEFORE execution -->
  <flow-ref name="audit-agent-action-subflow"/>

  <!-- Route to correct tool implementation -->
  <choice>
    <when expression="#[payload.name == 'create-order']">
      <flow-ref name="mcp-tool-create-order-flow"/>
    </when>
    <when expression="#[payload.name == 'get-customer']">
      <flow-ref name="mcp-tool-get-customer-flow"/>
    </when>
    <when expression="#[payload.name == 'check-inventory']">
      <flow-ref name="mcp-tool-check-inventory-flow"/>
    </when>
    <otherwise>
      <mcp:error type="TOOL_NOT_FOUND" message="Unknown tool: #[payload.name]"/>
    </otherwise>
  </choice>

  <error-handler ref="global-error-handler"/>
</flow>
```

### MCP Tool Implementation

```xml
<flow name="mcp-tool-create-order-flow">
  <!-- 1. Validate tool input against schema -->
  <json:validate-schema schemaLocation="schemas/mcp/create-order-input.json"/>

  <!-- 2. Map MCP input to internal canonical model -->
  <ee:transform>
    <ee:message>
      <ee:set-payload resource="dwl/mcp-input-to-order-canonical.dwl"/>
    </ee:message>
  </ee:transform>

  <!-- 3. Call existing process API (reuse; do NOT duplicate logic) -->
  <flow-ref name="http-post-order-process-flow"/>

  <!-- 4. Map internal response to MCP tool output -->
  <ee:transform>
    <ee:message>
      <ee:set-payload resource="dwl/order-canonical-to-mcp-output.dwl"/>
    </ee:message>
  </ee:transform>

  <!-- 5. Post-audit: log result -->
  <flow-ref name="audit-agent-action-result-subflow"/>
</flow>
```

---

## Tool Design Principles

Tools are the interface between agents and your integration layer. Bad tool design causes
agents to fail silently, loop, or take wrong actions.

### Tool naming and description
- Name: short verb-noun (`create-order`, `get-customer`, `check-inventory`, `cancel-shipment`)
- Description: tell the agent WHEN to use this tool, not just WHAT it does
  - Bad: "Gets a customer by ID"
  - Good: "Retrieves full customer profile including contact info, account status, and open orders. Use when you need to verify a customer exists before creating an order, or when the customer asks about their account."
- Description must also state preconditions and what it returns

### Input schema
- Only include fields the agent needs to provide — do not expose internal IDs
- Make field descriptions explicit about format, allowed values, examples
- Use `required` strictly — agents struggle with optional fields
- Avoid nested objects more than 2 levels deep

### Output schema
- Include a human-readable `summary` string in every response — agents read this for context
- Include `nextSteps` hint array for multi-step workflows (tells agent what to do next)
- Return enough context for the agent to reason without calling you again

```json
{
  "orderId":    "ORD-2026-00123",
  "status":     "CREATED",
  "summary":    "Order ORD-2026-00123 created successfully for customer C-4567. Estimated fulfillment: May 17, 2026.",
  "nextSteps":  ["confirm-payment", "notify-customer"],
  "details": { ... }
}
```

---

## Safety and Guardrails

Agents can and will call tools in unexpected ways. Every agentic API must enforce:

1. **Idempotency** — agents retry on failure; tools must be safe to call twice with same input
   - POST endpoints: use client-supplied idempotency key in request + Object Store check
   - Pattern: `Idempotency-Key` header; store in Object Store; return same result on duplicate

2. **Confirmation for destructive actions** — for deletes, cancellations, financial operations:
   - Two-step: first call returns a `confirmationToken`; second call (with token) executes
   - Token expires in 5 minutes (Object Store TTL)
   - Log both steps to audit trail

3. **Scope limitation** — an agent session can only affect records belonging to its scope:
   - JWT claims must include `agentScope` (e.g., `customerId`, `sessionContext`)
   - Every query must be filtered by scope; never expose cross-tenant data

4. **Rate limiting per session** — per OAuth client (agent session): max 100 tool calls/minute
   - Use Anypoint API Gateway rate-limiting policy
   - Return 429 with `Retry-After` header; agents understand this

5. **Read vs write separation** — define separate OAuth scopes for read tools vs write tools
   - `integration:read` scope: query tools only
   - `integration:write` scope: mutation tools; requires elevated auth

---

## Audit Trail — MANDATORY

Every agent action must be immutably logged:

```json
{
  "auditId":        "uuid",
  "timestamp":      "ISO-8601",
  "agentId":        "from JWT sub claim",
  "agentType":      "agentforce | einstein | claude | custom",
  "sessionId":      "agent session ID",
  "toolName":       "create-order",
  "inputSummary":   "Create order for customer C-4567, 3x SKU-001",
  "outputSummary":  "Order ORD-2026-00123 created",
  "durationMs":     342,
  "status":         "SUCCESS | FAILED | REJECTED",
  "correlationId":  "mule correlation ID"
}
```

Write audit records to a dedicated Anypoint MQ queue + persistent store. Never overwrite or delete.
Enable Business Events in Anypoint Monitoring for agent-facing APIs.

---

## Error Handling

Strategy: **fail-fast** (agents need clear errors to adjust their reasoning)

| Failure | Response to agent | Notes |
|---------|-----------------|-------|
| Invalid tool input | 400 + specific field error message | Agents use this to correct and retry |
| Resource not found | 404 + "Resource X not found" | Clear; agent stops trying to reference it |
| Precondition not met | 409 + reason + what must happen first | Agent uses this for next step planning |
| Rate limited | 429 + `Retry-After` header | Agent waits and retries |
| System unavailable | 503 + "Try again in 30 seconds" | Agent retries after delay |
| Scope violation | 403 + "Access denied for this resource" | Agent escalates to human |

Never return 500 with a stack trace. Every error must be an actionable message the agent can reason about.

---

## OpenAPI Spec Requirements for Agent Discovery

When exposing tools via standard HTTP (not MCP), the OpenAPI spec must be agent-optimized:

```yaml
paths:
  /orders:
    post:
      operationId: createOrder          # agents use this as the function name
      summary: Create a new order
      description: |
        Creates a new order in the ERP system. Use this tool when the customer has
        confirmed their intent to purchase. Requires customerId and at least one lineItem.
        Returns orderId which is needed for subsequent shipment and payment operations.
      x-agent-hints:                    # optional MuleSoft extension
        confirmationRequired: false
        destructive: false
        nextTools: [confirmPayment, notifyCustomer]
```

Publish all agent-facing APIs to Anypoint Exchange with the `agent-tool` tag so they are
discoverable by Agentforce and other MuleSoft-native agent frameworks.

---

## MUnit Test Coverage

Each agentic tool endpoint must have tests for:
- [ ] Happy path — valid tool input → process API called → MCP-formatted response returned
- [ ] Invalid input (missing required field) → 400 with specific field error
- [ ] Idempotent repeat call (same idempotency key) → same result, system API NOT called twice
- [ ] Scope violation (agent tries to access another customer's data) → 403
- [ ] Destructive action: confirmation flow — token issued on first call; executes on second call with token
- [ ] Rate limit exceeded → 429 with Retry-After header
- [ ] Audit record written for every tool call (including failed ones)

---

## Example Project

**Client:** Agentforce sales agent — agent helps reps create quotes, check inventory, and
file opportunities directly from a Slack conversation
**Tools exposed:** `get-customer`, `check-inventory`, `create-quote`, `submit-opportunity`
**Flows:** `mcp-call-tool-flow`, `mcp-tool-create-quote-flow`, `audit-agent-action-subflow`
**Connectors:** `mcp` (MuleSoft MCP connector), `salesforce`, `netsuite`, `anypoint-mq` (audit)
**Security tier:** partner (OAuth2 client credentials per agent; scope-limited JWT)
**Deployment:** CloudHub 2.0, 0.2 vCores × 2 replicas (low CPU; latency-critical)
