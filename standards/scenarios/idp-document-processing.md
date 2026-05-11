# Scenario: IDP Document Processing

> **Pattern:** `idp-document-processing`
> **Code:** V
> **Trigger:** HTTP multipart upload | S3/Azure Blob event | SFTP file drop | Email attachment (IMAP)
> **Latency target:** 15–60s per document (IDP is async; poll up to 30s before timeout)
> **Volume:** Low–medium (IDP processes one document per execution; batch via parallel async)

---

## When to Use This Pattern

- Documents arrive in any format (PDF, PNG, JPEG, TIFF) and structured data must be extracted from them
- Use cases: invoice processing, contract data extraction, onboarding form digitization, purchase order ingestion, ID document verification, receipt capture
- The extracted fields need to flow into a downstream operational system (ERP, CRM, database)
- The client has defined at least one IDP "action" (extraction schema) in the Anypoint IDP UI

**Do not use** when: the document is structured data already (CSV, XML, JSON) — use file-based-etl (E) or batch (C) instead. IDP is for unstructured/semi-structured documents where field positions vary.

**Primary pattern** — IDP document processing is the integration purpose, not a mid-flow step. If IDP extraction is a single step inside a larger flow, use ai-augmented-flow (P) as a secondary pattern instead.

---

## Anypoint IDP API Reference (verified May 2026)

```
Base URL:  https://idp-rt.{region}.anypoint.mulesoft.com/api/v1/
           Regions: us-east-1 | eu-central-1
Auth:      OAuth 2.0 client credentials (Anypoint Connected App)
Token URL: https://anypoint.mulesoft.com/accounts/api/v2/oauth2/token
Scope:     EMPTY — access controlled by Connected App "Execute Published Actions" permission
           (DO NOT pass urn:anypoint:idp — it will cause invalid_scope)

Submit execution:
  POST /organizations/{orgId}/actions/{actionId}/versions/{versionId}/executions
  Content-Type: application/json
  Body: { "file": "<base64>", "fileName": "<name.pdf>" }
        (field is "file" NOT "content"; companion is "fileName" NOT "mimeType")
        Alternative: multipart/form-data — `file` binary part + optional `callback` JSON part
  → 200/202: { "id": "<executionId>", "documentName": "<name.pdf>" }

Poll result (NOTE: /v2 suffix is REQUIRED):
  GET /organizations/{orgId}/actions/{actionId}/versions/{versionId}/executions/{id}/v2
  → { "status": "...", "pages": [{ "page": 1,
        "fields": { "fieldLabel": { "value": "...", "confidence": 0.98 } },
        "tables": {},
        "prompts": { "name": { "answer": { "value": "..." } } }
      }] }

Terminal statuses: SUCCEEDED | FAILED | PARTIAL_SUCCESS | MANUAL_VALIDATION_REQUIRED
Non-terminal:      ACKNOWLEDGED | IN_PROGRESS | RESULTS_PENDING
Result path:       pages[0].fields.{fieldLabel}.value  (NOT result.{field})
Min polling:       10 seconds (IDP quota docs — faster polling may be rate-limited)
P50 latency: 7.6s | P99: 13.4s | Max file: 10MB | Max pages: 50

Callback alternative (eliminates polling):
  Submit with `callback` field: { "noAuthUrl": "https://your-mule-endpoint/idp/callback" }
  IDP sends PATCH to callback with executionId. Then GET /executions/{id}/v2 for result.

Supported file types: application/pdf | image/png | image/jpeg | image/tiff
```

---

## Reference Architecture

### HTTP Multipart Upload

```
Client → POST /documents/process (multipart/form-data)
        │
        ▼
{domain}-exp-api
  ├── Extract document bytes from multipart payload
  ├── Return 202 Accepted + correlationId (async — never block client for IDP result)
  │
  ▼
{domain}-proc-api (async, via MQ)
  ├── Base64 encode document bytes
  ├── POST to IDP execution endpoint → executionId
  ├── Poll GET /executions/{executionId} (every 3s, max 10 attempts)
  │     ├── SUCCEEDED → extract result fields → continue
  │     ├── IN_PROGRESS → wait → retry
  │     └── FAILED / timeout → → manual-review-queue + alert
  ├── DataWeave: IDP result → canonical {entity} schema
  └── POST to {target}-sys-api (ERP / CRM / DB)
```

### S3 / Azure Blob Event

```
S3 PutObject event / Azure Blob trigger
        │
        ▼
{domain}-proc-api
  ├── Download file bytes from S3/Blob using correlationId from event
  ├── Base64 encode bytes
  ├── POST to IDP → executionId
  ├── Poll until SUCCEEDED or timeout
  ├── DataWeave: IDP result → canonical schema
  └── → {target}-sys-api
```

### SFTP File Drop

```
SFTP listener (poll every 30s on /inbound/{docType}/)
        │
        ▼
{domain}-proc-api
  ├── Read file bytes (attributes.fileName drives docType routing)
  ├── Route by file extension / subfolder → select IDP actionId
  ├── Base64 encode → POST to IDP → executionId
  ├── Poll until SUCCEEDED or timeout
  ├── Move file to /processed/ or /failed/ based on outcome
  └── → {target}-sys-api
```

### Email Attachment (IMAP)

```
IMAP listener (poll every 60s on inbox folder)
        │
        ▼
{domain}-proc-api
  ├── For each attachment (PDF/image only — skip others)
  ├── Base64 encode attachment bytes
  ├── POST to IDP → executionId
  ├── Poll until SUCCEEDED or timeout
  ├── DataWeave: IDP result → canonical schema
  └── → {target}-sys-api
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "integrationStyle": "messaging",
    "primaryPattern": "idp-document-processing",
    "secondaryPatterns": [],
    "direction": "unidirectional"
  },
  "nfr": {
    "volume": "low",
    "latency": "async-ok",
    "frequency": "triggered",
    "availability": "99.9",
    "throughput": "low"
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "compensationStrategy": "retry",
    "maxRetries": 3,
    "backoff": "fixed",
    "dlq": true,
    "invalidMessageChannel": true,
    "errorEnvelope": true
  },
  "flowControl": {
    "direction": "push",
    "messageTtlHours": 24,
    "maxConcurrency": 2,
    "backpressureEnabled": true,
    "deduplicationEnabled": true,
    "deduplicationTtlMinutes": 1440
  },
  "idp": {
    "enabled": true,
    "actionId": "${anypoint.idp.actionId}",
    "actionVersionId": "${anypoint.idp.actionVersionId}",
    "orgId": "${anypoint.idp.orgId}",
    "documentSource": "http-multipart|s3|sftp|email",
    "outputEntity": "",
    "pollingIntervalSeconds": 3,
    "pollingMaxAttempts": 10,
    "manualReviewQueue": "${domain}-idp-manual-review-${env}-queue",
    "supportedMimeTypes": ["application/pdf", "image/png", "image/jpeg", "image/tiff"]
  },
  "systems": {
    "connectors": ["anypoint-idp", "anypoint-mq"]
  },
  "devops": {
    "munitCoverage": 80
  }
}
```

---

## Connector Selection

**Preferred: MuleSoft Forge IDP Connector** (`mulesoft-forge-idp` in registry)
- Universal connector — works across all action versions without connector sprawl
- Typed operations: Submit + Retrieve
- Available on Maven Central: `io.github.mulesoft-forge:mule-idp-connector:1.0.6`
- Requires adding Maven Central repo to pom.xml (not on Anypoint Exchange)
- See: `templates/connectors/idp-forge-config.xml`

**Fallback: Raw HTTP** (`anypoint-idp` in registry)
- Use when Forge connector cannot be used (org policy restricts Maven Central)
- See: `templates/connectors/idp-http-config.xml`

```xml
<!-- HTTP fallback config — generated into global-config.xml -->
<!-- CORRECT host: idp-rt.{region}.anypoint.mulesoft.com (NOT anypoint.mulesoft.com/idp) -->
<http:request-config
    name="IDP_API_Config"
    doc:name="Anypoint IDP API Config"
    basePath="/api/v1">
    <http:request-connection
        protocol="HTTPS"
        host="idp-rt.${anypoint.idp.region}.anypoint.mulesoft.com"
        port="443">
        <http:authentication>
            <!-- Scope intentionally EMPTY — access controlled by Connected App permissions -->
            <http:oauth-client-credentials-grant-type
                clientId="${anypoint.client.id}"
                clientSecret="${anypoint.client.secret}"
                tokenUrl="https://anypoint.mulesoft.com/accounts/api/v2/oauth2/token"/>
        </http:authentication>
    </http:request-connection>
</http:request-config>
```

---

## Flow Structure

> **Authoritative generated XML:** `scaffold/xml-templates/idp-document-flow.xml`
> The scaffold generates `idp-document-flows.xml` containing the sub-flows below.
> Source-specific trigger flows are generated separately per `decisions.json flows[]`.

### Key implementation notes

**Polling pattern:** Use `until-successful`, NOT `foreach`. Mule 4 `foreach` has no sleep/break.

```xml
<!-- CORRECT: until-successful polls every 10s (IDP minimum), retries up to 18× (~3 min) -->
<until-successful maxRetries="18" millisBetweenRetries="10000">
    <!-- GET with /v2 suffix — required for current poll endpoint -->
    <http:request method="GET" config-ref="IDP_API_Config"
        path="#['/organizations/' ++ p('anypoint.idp.orgId') ++ '/actions/' ++ p('anypoint.idp.actionId')
                ++ '/versions/' ++ p('anypoint.idp.actionVersionId')
                ++ '/executions/' ++ vars.idpExecutionId ++ '/v2']"/>
    <set-variable variableName="idpStatus" value="#[payload.status]"/>
    <set-variable variableName="idpPages"  value="#[payload.pages default []]"/>
    <!-- Throw to retry when not yet terminal -->
    <validation:is-true
        expression="#[['SUCCEEDED','FAILED','PARTIAL_SUCCESS','MANUAL_VALIDATION_REQUIRED'] contains vars.idpStatus]"
        message="#['IDP not yet terminal: ' ++ vars.idpStatus]"/>
</until-successful>
```

**Submit body:** Field name is `file` (NOT `content`), companion is `fileName` (NOT `mimeType`):

```json
{ "file": "<base64>", "fileName": "invoice-2026.pdf" }
```

**Input/output variables for `idp-execute-and-poll-subflow`:**
```
Input:   vars.documentBase64    (String) — base64-encoded bytes
         vars.documentFileName  (String) — filename with extension (e.g. "invoice.pdf")
         vars.idpActionId       (String, optional) — override for multi-action routing
         vars.idpActionVersionId (String, optional)

Output:  vars.idpPages          (Array)  — pages[].fields / pages[].tables / pages[].prompts
         vars.idpExecutionId    (String)
         vars.idpStatus         (String) — SUCCEEDED | PARTIAL_SUCCESS | MANUAL_VALIDATION_REQUIRED
```

---

## DataWeave Transform Skeleton

File: `src/main/resources/dwl/map-idp-result-to-{entity}.dwl`

```dataweave
%dw 2.0
output application/json
// IDP API response structure: payload.pages[].fields.{fieldLabel}.value
// vars.idpPages = payload.pages default [] (set by idp-execute-and-poll-subflow)
// Field labels match the names defined in your IDP action in Anypoint IDP UI.
---
do {
  var page = (vars.idpPages default [])[0].fields default {}
  ---
  {
    // TODO: map IDP extracted fields to your canonical schema
    // Each extracted field: page.{fieldLabel}.value
    // Confidence per field: page.{fieldLabel}.confidence (0.0–1.0)

    // Example for invoice:
    // invoiceNumber:  page."Invoice Number".value  default "",
    // vendorName:     page."Vendor Name".value     default "",
    // totalAmount:    page."Total Amount".value as Number default 0,
    // invoiceDate:    page."Invoice Date".value as Date {format: "MM/dd/yyyy"} default null,
    // lineItems:      (vars.idpPages flatMap (pg) -> pg.fields."Line Items".value default []) map (item) -> {
    //   description: item."Description".value default "",
    //   quantity:    item."Quantity".value as Number default 0,
    //   unitPrice:   item."Unit Price".value as Number default 0
    // },
    correlationId:   correlationId,
    idpExecutionId:  vars.idpExecutionId,
    idpStatus:       vars.idpStatus
  }
}
```

---

## Required Properties Per Environment

```yaml
# properties/{env}.yaml

anypoint:
  idp:
    baseUrl: "https://anypoint.mulesoft.com"
    orgId: "TODO: your-anypoint-org-id"
    actionId: "TODO: your-idp-action-id"
    actionVersionId: "TODO: your-idp-action-version-id"
    pollingIntervalSeconds: 3
    pollingMaxAttempts: 10
  client:
    id: "TODO: connected-app-client-id"         # Store in Secrets Manager
    secret: "TODO: connected-app-client-secret"  # Store in Secrets Manager

domain: "TODO: your-domain-name"
idp:
  outputEntity: "TODO: target-entity-name"
```

---

## SFTP-Specific: File Routing by Document Type

When documents arrive via SFTP in typed subfolders, route to different IDP actions:

```xml
<flow name="sftp-receive-document-flow">
  <sftp:listener config-ref="SFTP_Config"
    directory="/inbound"
    recursive="true"
    moveToDirectory="/processing"
    autoDelete="false"/>

  <!-- Derive document type from directory path -->
  <set-variable variableName="docType"
    value="#[attributes.path splitBy '/' [-2] default 'unknown']"/>

  <!-- Route to correct IDP action based on docType -->
  <choice>
    <when expression="#[vars.docType == 'invoices']">
      <set-variable variableName="idpActionId" value="${anypoint.idp.invoices.actionId}"/>
      <set-variable variableName="idpActionVersionId" value="${anypoint.idp.invoices.actionVersionId}"/>
    </when>
    <when expression="#[vars.docType == 'contracts']">
      <set-variable variableName="idpActionId" value="${anypoint.idp.contracts.actionId}"/>
      <set-variable variableName="idpActionVersionId" value="${anypoint.idp.contracts.actionVersionId}"/>
    </when>
    <otherwise>
      <!-- Unknown type → manual review immediately -->
      <flow-ref name="idp-manual-review-route-subflow"/>
      <sftp:move config-ref="SFTP_Config" sourcePath="#[attributes.path]"
        targetPath="#['/failed/' ++ attributes.fileName]"/>
      <logger level="WARN" message="#['Unknown document type from path: ' ++ attributes.path]"/>
    </otherwise>
  </choice>

  <set-variable variableName="documentBase64"
    value="#[payload as Binary {base64: true} as String]"/>
  <set-variable variableName="documentMimeType"
    value="#[if (attributes.fileName endsWith '.pdf') 'application/pdf' else 'image/jpeg']"/>

  <flow-ref name="idp-execute-and-poll-subflow"/>

  <!-- TODO: DataWeave + target system call per docType -->

  <sftp:move config-ref="SFTP_Config" sourcePath="#[attributes.path]"
    targetPath="#['/processed/' ++ attributes.fileName]"/>

  <error-handler>
    <on-error-propagate>
      <sftp:move config-ref="SFTP_Config" sourcePath="#[attributes.path]"
        targetPath="#['/failed/' ++ attributes.fileName]"/>
      <logger level="ERROR" message="#['SFTP IDP processing failed: ' ++ error.description]"/>
    </on-error-propagate>
  </error-handler>
</flow>
```

---

## Email Attachment Ingestion

```xml
<flow name="email-receive-attachment-flow">
  <email:listener-imap config-ref="Email_IMAP_Config" checkFrequency="60000">
    <scheduling-strategy>
      <fixed-frequency frequency="60" timeUnit="SECONDS"/>
    </scheduling-strategy>
  </email:listener-imap>

  <!-- Process each attachment -->
  <foreach collection="#[attributes.attachments]">
    <set-variable variableName="attachmentName" value="#[payload.key]"/>
    <set-variable variableName="attachmentBytes" value="#[payload.value.content]"/>
    <set-variable variableName="documentMimeType" value="#[payload.value.headers.'Content-Type' default 'application/pdf']"/>

    <!-- Skip non-document attachments -->
    <choice>
      <when expression="#[['application/pdf','image/png','image/jpeg','image/tiff'] contains vars.documentMimeType]">
        <set-variable variableName="documentBase64"
          value="#[vars.attachmentBytes as Binary {base64: true} as String]"/>
        <flow-ref name="idp-execute-and-poll-subflow"/>
        <!-- TODO: DataWeave + target system call -->
      </when>
      <otherwise>
        <logger level="DEBUG" message="#['Skipping non-document attachment: ' ++ vars.attachmentName]"/>
      </otherwise>
    </choice>
  </foreach>

  <error-handler ref="global-error-handler"/>
</flow>
```

---

## Error Handling

| Failure | Action |
|---------|--------|
| IDP API 401/403 | Token refresh (handled by HTTP OAuth config); if fails → halt + alert |
| IDP API 4xx (bad request) | Route to Invalid Message Channel — document will always fail; do not retry |
| IDP execution FAILED | Route to manual-review-queue + alert; NACK message |
| IDP polling timeout (30s) | Route to manual-review-queue + alert; NACK message |
| IDP API 5xx | Retry 3× exponential; if still failing → DLQ |
| Unsupported MIME type | Route to Invalid Message Channel — structural failure |
| Target system write fails | Retry per standard retry table; DLQ after max retries |

---

## Observability

Log for every IDP execution:
- `correlationId`, `executionId`, `documentMimeType`, `docType` (if multi-type routing)
- `pollingAttempts`, `idpStatus`, `latencyMs` (from submit to SUCCEEDED)
- `confidence` if returned by IDP action
- Never log `documentBase64` — documents contain PII

Alert thresholds:
- IDP manual-review-queue depth > 0 → MEDIUM (documents failing extraction)
- IDP polling timeout rate > 10% → HIGH (IDP service degraded)
- IDP 5xx rate > 5% in 5 min → HIGH → page on-call

---

## MUnit Test Coverage (80% minimum)

- [ ] Happy path — valid PDF submitted → IDP returns SUCCEEDED → extracted fields mapped → target system called
- [ ] IDP polling — first 2 polls return IN_PROGRESS, 3rd returns SUCCEEDED → flow succeeds
- [ ] IDP FAILED status — execution fails → manual-review-queue populated → error raised; target NOT called
- [ ] IDP polling timeout — 10 polls all return IN_PROGRESS → manual-review-queue populated → error raised
- [ ] Unsupported MIME type — validation fails → Invalid Message Channel populated; IDP NOT called
- [ ] Idempotency — same messageId submitted twice → second execution skipped; target called once only
- [ ] IDP 5xx → retry fires; mock 5xx then 202; verify eventual success
- [ ] SFTP routing — invoice subfolder → invoices IDP action selected; contracts subfolder → contracts action

---

## Example Project

**Client:** Accounts payable automation — vendor invoices arrive via SFTP as PDFs → Anypoint IDP extracts vendor name, invoice number, amount, line items → creates payable record in NetSuite
**Flows:** `sftp-receive-document-flow`, `idp-execute-and-poll-subflow`, `map-idp-result-to-invoice.dwl`, `netsuite-create-payable-flow`
**Connectors:** `sftp`, `anypoint-idp` (via HTTP), `anypoint-mq`, `netsuite`
**Secondary patterns:** `outbound-notification` (Slack alert when invoice routed to manual review)
**Security tier:** internal (documents stay within org boundary; Anypoint IDP is on-platform)
**Deployment:** CloudHub 2.0, 0.5 vCores × 2 replicas
**IDP action:** "invoice-extraction-v2" (configured in Anypoint IDP UI)
