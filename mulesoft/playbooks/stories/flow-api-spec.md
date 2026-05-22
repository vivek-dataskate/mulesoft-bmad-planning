# Story Template: Create API Spec (Per Flow)

**Story Type:** Per-Flow — API Design
**Generated:** Once per entry in `decisions.json flows[]`
**Priority:** P0 — spec must be published to Exchange before implementation starts
**Standard:** `standards/DESIGN_STANDARDS.md → API-Led Connectivity`
**Scaffold File:** `src/main/resources/api/{api-name}.yaml` (OAS 3.0) or `{api-name}.raml` (RAML)

---

## User Story

As a developer, I need a complete, published API spec for `{api-name}` before writing any implementation, so that the APIkit router generates correct routing and the API contract is visible in Anypoint Exchange before the flow is coded.

---

## Acceptance Criteria

### Spec Format
- [ ] Default: **OAS 3.0 YAML** (`{api-name}.yaml`)
- [ ] Use RAML instead ONLY if client's existing API platform requires RAML (check `prd.md → API Platform` or `decisions.json`)
- [ ] Never use OAS 2.0 (Swagger 2.0) for new specs — OAS 3.0 only

### Spec Completeness
- [ ] All request/response schemas defined — no `{}`, `any`, or `object` (untyped) schemas
- [ ] All required fields marked as `required: [...]` in schema
- [ ] Error responses defined for every operation: **400, 401, 404, 500, 503** at minimum
- [ ] `X-Correlation-ID` header defined as a request header on all operations
- [ ] `X-Correlation-ID` included in all error responses
- [ ] HTTP status codes match the pattern:
  - Sync response flows (pattern A, I): 200/201/202/400/401/404/500/503
  - Async flows returning 202 (pattern H): 202 on accept, 200/404 on status polling endpoint

### Naming and Versioning
- [ ] API name follows: `{system}-sys-api`, `{domain}-proc-api`, or `{consumer}-exp-api`
- [ ] Version: `1.0.0` for new APIs; increment minor for non-breaking changes
- [ ] `info.title` matches the API application name in `decisions.json`

### Exchange Publishing
- [ ] Spec published to Anypoint Exchange as `{api-name}` version `{version}`
- [ ] APIkit router generated FROM this published spec (Design Center → Anypoint Studio scaffold OR manually via API kit CLI)
- [ ] Not hand-coded routing — APIkit router enforces the contract

### Review Gate
- [ ] Tech lead reviewed and approved spec before story is closed
- [ ] PR / review comment trail confirms approval

---

## Pattern-Specific Spec Notes

| Pattern | Additional Spec Requirements |
|---------|------------------------------|
| A — request-reply | Define synchronous 200/201 response with full schema. |
| D — scheduled-sync | No API spec required (scheduler-triggered). Skip this story if trigger=scheduler. |
| E — file-based-etl | No inbound API spec required. Skip if trigger=sftp or s3. Define outbound API spec if exposing status endpoint. |
| H — process-orchestration | Two endpoints: (1) POST `/jobs` → 202 Accepted + jobId; (2) GET `/jobs/{jobId}` → 200 with status + result schema |
| I — api-aggregation | Define aggregated response schema — all upstream field sets merged into unified canonical response |
| J — webhook-ingestion | Inbound spec matches the SaaS provider's webhook payload schema (Stripe, GitHub, etc.) |
| R — agentic-mcp-integration | Spec follows OpenAPI tool-calling conventions: operationId set, all params described, response schemas precise enough for AI agent to parse |

---

## Implementation Notes

- Reference: `standards/DESIGN_STANDARDS.md → API-Led Connectivity`
- Scaffold generates an OAS 3.0 stub from decisions.json flows[] — developer completes schemas
- APIkit router scaffold: Design Center → download spec → File > Import in Anypoint Studio → generates router and mappings
- If client uses a custom Exchange organization: confirm org ID in `prd.md → Anypoint Platform` before publishing
