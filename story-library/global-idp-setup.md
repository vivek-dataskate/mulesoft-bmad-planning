# Story Template: Anypoint IDP Infrastructure Setup

**Story Type:** Global Infrastructure (Conditional)
**When to include:** Only if `decisions.json integration.primaryPattern = "idp-document-processing"` OR `decisions.json idp.enabled = true`
**Priority:** P0 — IDP flows cannot run until these are in place
**Standard:** `standards/scenarios/idp-document-processing.md`
**Scenario File:** `standards/scenarios/idp-document-processing.md`
**Scaffold Files:** `src/main/mule/global-config.xml`, `src/main/resources/properties/{env}.yaml`

---

## User Story

As a developer, I need the Anypoint IDP infrastructure configured — Connected App, IDP action verified, HTTP connector auth wired, and manual-review queue created — so that document-processing flows can submit executions and poll results reliably without breaking on auth failures or missing pre-requisites.

---

## Acceptance Criteria

### Pre-Requisite: Anypoint IDP Action (Platform Config — not code)
- [ ] IDP action exists in Anypoint IDP UI for each document type this project processes
  - Action name confirmed with tech lead: `{decisions.json idp.actionId context}`
  - Action version ID confirmed: `{decisions.json idp.actionVersionId context}`
  - Org ID confirmed: `{decisions.json idp.orgId context}`
- [ ] IDP action has been **published** (not just saved as draft) — submissions fail silently against unpublished draft actions
- [ ] Supported MIME types for the action confirmed: at minimum `application/pdf`; optionally `image/png`, `image/jpeg`, `image/tiff`
- [ ] Test execution run manually in the IDP UI to confirm the action extracts the expected fields before wiring Mule

### Anypoint Connected App (Platform Config — not code)
- [ ] Connected App created in Anypoint Access Management: **Service Account** type (not User)
- [ ] Scope granted: `urn:anypoint:idp` (exact string — no other scope is accepted by the IDP API)
- [ ] Client ID and Client Secret recorded and stored in Secrets Manager under keys:
  - `anypoint.client.id`
  - `anypoint.client.secret`
- [ ] Connected App has the minimum required Anypoint Platform role — **IDP Contributor** or equivalent; confirm with Anypoint admin

### global-config.xml — Two HTTP Connector Configs Required
- [ ] `Anypoint_Token_Config` — HTTPS to `anypoint.mulesoft.com:443` (used for token endpoint; no auth element)
- [ ] `IDP_API_Config` — HTTPS to `anypoint.mulesoft.com:443` with `<http:oauth-client-credentials-grant-type>`:
  - `clientId="${anypoint.client.id}"`
  - `clientSecret="${anypoint.client.secret}"`
  - `tokenUrl="https://anypoint.mulesoft.com/accounts/api/v2/oauth2/token"`
  - `scopes="urn:anypoint:idp"`
- [ ] No other auth approach (basic, API key, manual bearer) — OAuth 2.0 client credentials is the only supported auth for IDP API

### Properties (per environment)
- [ ] `anypoint.idp.orgId` set per environment (same value across envs unless multi-org)
- [ ] `anypoint.idp.actionId` set per environment (or per document type if multi-action routing)
- [ ] `anypoint.idp.actionVersionId` set per environment
- [ ] `anypoint.idp.pollingIntervalSeconds: 3` (default; increase to 5 for high-latency documents)
- [ ] `anypoint.idp.pollingMaxAttempts: 10` (default; 10 × 3s = 30s max wait per document)
- [ ] `domain` property set (used in queue names)
- [ ] `idp.outputEntity` property set (used in DWL file name and target flow reference)

### Anypoint MQ Queues (IDP-specific)
- [ ] `{domain}-idp-inbound-{env}-queue` created per environment — inbound documents pending IDP processing
- [ ] `{domain}-idp-manual-review-{env}-queue` created per environment — documents that failed extraction or timed out
- [ ] Both queues configured with TTL: **24 hours** (standard event category)
- [ ] DLQ paired with inbound queue: `{domain}-idp-inbound-{env}-queue-dlq`
- [ ] Monitoring alert: manual-review queue depth > 0 → **MEDIUM** → notify ops (documents failing extraction)
- [ ] Monitoring alert: inbound queue depth > 80% → **MEDIUM** (IDP processing bottleneck)

### IDP Sub-Flow Wired
- [ ] `idp-execute-and-poll-subflow` exists in `src/main/mule/{domain}-idp-flows.xml`
- [ ] Sub-flow accepts `vars.documentBase64` (String) and `vars.documentMimeType` (String) as inputs
- [ ] Sub-flow sets `vars.idpResult` on COMPLETED status
- [ ] Polling loop: `foreach 1 to ${anypoint.idp.pollingMaxAttempts}` with `fixed-frequency` delay
- [ ] Terminal routing: COMPLETED → continue; FAILED or timeout → `idp-manual-review-route-subflow` + `raise-error`
- [ ] `idp-manual-review-route-subflow` publishes async to manual-review queue (does NOT block the error path)
- [ ] `vars.documentBase64` is **never logged** at any level — documents contain PII

### MUnit Tests
- [ ] Mock `IDP_API_Config` POST → returns `{ "id": "exec-123", "status": "IN_PROGRESS" }` → 202
- [ ] Mock GET poll: first 2 calls return `IN_PROGRESS`, 3rd returns `COMPLETED` with result → flow succeeds
- [ ] Mock GET poll: all 10 attempts return `IN_PROGRESS` → manual-review queue message published; error raised
- [ ] Mock GET poll: returns `FAILED` → manual-review queue message published; error raised
- [ ] Verify `documentBase64` field never appears in any log output (use spy/assertion)
- [ ] Verify OAuth token is NOT logged (token refresh happens transparently via HTTP OAuth config)

---

## IDP Action Inventory
*(PM agent populates from architecture.md or client intake)*

| Document Type | IDP Action Name | Action ID Placeholder | MIME Types |
|--------------|----------------|----------------------|------------|
| `{docType}` | `{actionName}` | `${anypoint.idp.{docType}.actionId}` | `application/pdf` |

---

## Implementation Notes

- There is **no dedicated Mule connector for Anypoint IDP** — always use the HTTP connector
- The IDP API is at `https://anypoint.mulesoft.com/idp/api/v1/` — not the Anypoint Platform API base URL
- The Connected App **must be Service Account type** — user-based apps break when the user's session expires
- IDP actions must be pre-configured and published in the Anypoint IDP UI before any code runs; this is the most common pre-flight blocker
- Polling: 3s × 10 attempts = 30s max. For large or complex documents (multi-page PDFs), increase `pollingMaxAttempts` to 20 (60s total)
- `maxConcurrency="2"` on the MQ subscriber is the recommended default — IDP has per-org rate limits; exceeding them returns 429
- Reference: `standards/scenarios/idp-document-processing.md` — full XML, DWL skeleton, and error handling table
