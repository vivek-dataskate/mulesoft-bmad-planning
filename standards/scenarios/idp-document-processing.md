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

## Anypoint IDP API Reference

```
Base URL:  https://anypoint.mulesoft.com/idp/api/v1/
Auth:      OAuth 2.0 client credentials (Anypoint Connected App)
Token URL: https://anypoint.mulesoft.com/accounts/api/v2/oauth2/token
Scope:     urn:anypoint:idp

Submit execution:
  POST /organizations/{orgId}/actions/{actionId}/versions/{versionId}/executions
  Content-Type: application/json
  Body: { "document": { "content": "<base64>", "mimeType": "application/pdf" } }
  → 202 Accepted: { "id": "<executionId>", "status": "IN_PROGRESS" }

Poll result:
  GET /organizations/{orgId}/executions/{executionId}
  → { "status": "COMPLETED|FAILED|IN_PROGRESS", "result": { ... extracted fields ... } }

Supported MIME types: application/pdf | image/png | image/jpeg | image/tiff
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
  │     ├── COMPLETED → extract result fields → continue
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
  ├── Poll until COMPLETED or timeout
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
  ├── Poll until COMPLETED or timeout
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
  ├── Poll until COMPLETED or timeout
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

## Connector Configuration

The IDP connection uses two HTTP connector configs:

1. **Anypoint token config** — fetches OAuth bearer token from Anypoint Platform
2. **IDP API config** — calls the IDP REST API with the bearer token

```xml
<!-- In global-config.xml -->

<!-- 1. Token provider (Anypoint Connected App) -->
<http:request-config name="Anypoint_Token_Config" doc:name="Anypoint Token Config">
  <http:request-connection protocol="HTTPS"
    host="anypoint.mulesoft.com"
    port="443"/>
</http:request-config>

<!-- 2. IDP API config -->
<http:request-config name="IDP_API_Config" doc:name="IDP API Config">
  <http:request-connection protocol="HTTPS"
    host="anypoint.mulesoft.com"
    port="443">
    <http:authentication>
      <http:oauth-client-credentials-grant-type
        clientId="${anypoint.client.id}"
        clientSecret="${anypoint.client.secret}"
        tokenUrl="https://anypoint.mulesoft.com/accounts/api/v2/oauth2/token"
        scopes="urn:anypoint:idp"/>
    </http:authentication>
  </http:request-connection>
</http:request-config>
```

---

## Flow Structure

### Core IDP Sub-Flow (shared across all document sources)

```xml
<!-- idp-document-flows.xml -->

<!-- Sub-flow: submit document to IDP and poll for result -->
<!-- Input variable: vars.documentBase64 (String), vars.documentMimeType (String) -->
<!-- Output variable: vars.idpResult (Object - extracted fields) -->
<sub-flow name="idp-execute-and-poll-subflow">

  <!-- Submit execution -->
  <http:request method="POST" config-ref="IDP_API_Config"
    path="/idp/api/v1/organizations/${anypoint.idp.orgId}/actions/${anypoint.idp.actionId}/versions/${anypoint.idp.actionVersionId}/executions">
    <http:body>
      #[output application/json ---
        { document: { content: vars.documentBase64, mimeType: vars.documentMimeType } }]
    </http:body>
    <http:response-validator>
      <http:success-status-code-validator values="202"/>
    </http:response-validator>
  </http:request>

  <set-variable variableName="idpExecutionId" value="#[payload.id]"/>
  <set-variable variableName="idpPollAttempt" value="#[0]"/>
  <set-variable variableName="idpStatus" value="#['IN_PROGRESS']"/>

  <!-- Poll loop (max 10 attempts × 3s = 30s timeout) -->
  <foreach collection="#[1 to ${anypoint.idp.pollingMaxAttempts}]"
    counterVariableName="idpPollAttempt">
    <choice>
      <when expression="#[vars.idpStatus != 'COMPLETED' and vars.idpStatus != 'FAILED']">
        <scheduler doc:name="Poll Delay">
          <scheduling-strategy>
            <fixed-frequency frequency="${anypoint.idp.pollingIntervalSeconds}" timeUnit="SECONDS" startDelay="3"/>
          </scheduling-strategy>
        </scheduler>
        <http:request method="GET" config-ref="IDP_API_Config"
          path="/idp/api/v1/organizations/${anypoint.idp.orgId}/executions/#[vars.idpExecutionId]"/>
        <set-variable variableName="idpStatus" value="#[payload.status]"/>
        <set-variable variableName="idpResult" value="#[payload.result default {}]"/>
      </when>
    </choice>
  </foreach>

  <!-- Route on terminal status -->
  <choice>
    <when expression="#[vars.idpStatus == 'COMPLETED']">
      <!-- idpResult is set — caller proceeds -->
    </when>
    <otherwise>
      <!-- FAILED or timed out (still IN_PROGRESS after max attempts) -->
      <logger level="ERROR"
        message="#['IDP execution ' ++ vars.idpExecutionId ++ ' ended with status ' ++ vars.idpStatus ++ ' after ' ++ vars.idpPollAttempt ++ ' attempts. correlationId=' ++ correlationId]"/>
      <flow-ref name="idp-manual-review-route-subflow"/>
      <raise-error type="IDP:EXTRACTION_FAILED" description="#['IDP extraction failed: ' ++ vars.idpStatus]"/>
    </otherwise>
  </choice>

  <error-handler ref="global-error-handler"/>
</sub-flow>

<!-- Sub-flow: route to manual review queue on IDP failure -->
<sub-flow name="idp-manual-review-route-subflow">
  <async>
    <anypoint-mq:publish config-ref="Anypoint_MQ_Config"
      destination="${domain}-idp-manual-review-${env}-queue"
      messageId="#[correlationId]">
      <anypoint-mq:body>
        #[output application/json ---
          {
            correlationId: correlationId,
            executionId: vars.idpExecutionId default 'unknown',
            status: vars.idpStatus default 'unknown',
            documentMimeType: vars.documentMimeType default 'unknown',
            failedAt: now() as String,
            originalPayload: payload
          }]
      </anypoint-mq:body>
    </anypoint-mq:publish>
  </async>
</sub-flow>

<!-- Main flow: HTTP multipart document ingestion -->
<flow name="http-receive-document-flow">
  <http:listener config-ref="HTTP_Listener_Config" path="/documents/process" allowedMethods="POST"/>

  <!-- Validate content type -->
  <validation:is-true expression="#[attributes.headers.'content-type' contains 'multipart']"
    message="Request must be multipart/form-data"/>

  <!-- Extract document part -->
  <set-variable variableName="documentBase64"
    value="#[output application/java --- payload.parts.document.content as Binary {base64: true} as String]"/>
  <set-variable variableName="documentMimeType"
    value="#[payload.parts.document.headers.'Content-Type' default 'application/pdf']"/>

  <!-- Validate MIME type -->
  <validation:is-true
    expression="#[['application/pdf','image/png','image/jpeg','image/tiff'] contains vars.documentMimeType]"
    message="#['Unsupported document type: ' ++ vars.documentMimeType]"/>

  <!-- Async: publish to processing queue; return 202 immediately -->
  <async>
    <anypoint-mq:publish config-ref="Anypoint_MQ_Config"
      destination="${domain}-idp-inbound-${env}-queue"
      messageId="#[correlationId]">
      <anypoint-mq:body>
        #[output application/json ---
          { documentBase64: vars.documentBase64, documentMimeType: vars.documentMimeType, correlationId: correlationId }]
      </anypoint-mq:body>
    </anypoint-mq:publish>
  </async>

  <set-payload value="#[output application/json --- { correlationId: correlationId, status: 'ACCEPTED' }]"/>
  <http:response statusCode="202"/>

  <error-handler ref="global-error-handler"/>
</flow>

<!-- Consumer: process document from queue -->
<flow name="mq-process-document-flow">
  <anypoint-mq:subscriber config-ref="Anypoint_MQ_Config"
    destination="${domain}-idp-inbound-${env}-queue"
    acknowledgementMode="MANUAL"
    maxConcurrency="2"/>

  <!-- Idempotency check -->
  <os:retrieve key="#['idp-' ++ attributes.messageId]" target="alreadyProcessed" objectStore="idempotency-store"/>
  <choice>
    <when expression="#[vars.alreadyProcessed != null]">
      <anypoint-mq:ack config-ref="Anypoint_MQ_Config" ackToken="#[attributes.ackToken]"/>
      <logger level="INFO" message="#['IDP duplicate skipped: ' ++ attributes.messageId]"/>
    </when>
    <otherwise>
      <set-variable variableName="documentBase64" value="#[payload.documentBase64]"/>
      <set-variable variableName="documentMimeType" value="#[payload.documentMimeType]"/>

      <!-- Call IDP execute + poll sub-flow -->
      <flow-ref name="idp-execute-and-poll-subflow"/>

      <!-- TODO: DataWeave transform — map vars.idpResult fields to your canonical {entity} schema -->
      <!-- See: src/main/resources/dwl/map-idp-result-to-{entity}.dwl -->
      <ee:transform>
        <ee:set-payload resource="dwl/map-idp-result-to-${idp.outputEntity}.dwl"/>
      </ee:transform>

      <!-- Write to target system -->
      <!-- TODO: replace with actual target system API call -->
      <flow-ref name="${idp.outputEntity}-create-flow"/>

      <!-- Mark processed -->
      <os:store key="#['idp-' ++ attributes.messageId]" value="#[true]"
        objectStore="idempotency-store" entryTtl="1440" entryTtlUnit="MINUTES"/>

      <anypoint-mq:ack config-ref="Anypoint_MQ_Config" ackToken="#[attributes.ackToken]"/>

      <error-handler>
        <on-error-propagate>
          <anypoint-mq:nack config-ref="Anypoint_MQ_Config" ackToken="#[attributes.ackToken]"/>
        </on-error-propagate>
      </error-handler>
    </otherwise>
  </choice>
</flow>
```

---

## DataWeave Transform Skeleton

File: `src/main/resources/dwl/map-idp-result-to-{entity}.dwl`

```dataweave
%dw 2.0
output application/json
---
{
  // TODO: map IDP extracted fields to your canonical schema
  // vars.idpResult contains the raw IDP extraction output
  // Field names match your IDP action schema definition

  // Example for invoice:
  // invoiceNumber:  vars.idpResult.invoice_number.value default "",
  // vendorName:     vars.idpResult.vendor_name.value default "",
  // totalAmount:    vars.idpResult.total_amount.value as Number default 0,
  // invoiceDate:    vars.idpResult.invoice_date.value as Date {format: "MM/dd/yyyy"} default now() as Date,
  // lineItems:      (vars.idpResult.line_items default []) map (item) -> {
  //   description: item.description.value default "",
  //   quantity:    item.quantity.value as Number default 0,
  //   unitPrice:   item.unit_price.value as Number default 0
  // },
  // confidence:     vars.idpResult.confidence default 0,
  correlationId:  correlationId
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
- `pollingAttempts`, `idpStatus`, `latencyMs` (from submit to COMPLETED)
- `confidence` if returned by IDP action
- Never log `documentBase64` — documents contain PII

Alert thresholds:
- IDP manual-review-queue depth > 0 → MEDIUM (documents failing extraction)
- IDP polling timeout rate > 10% → HIGH (IDP service degraded)
- IDP 5xx rate > 5% in 5 min → HIGH → page on-call

---

## MUnit Test Coverage (80% minimum)

- [ ] Happy path — valid PDF submitted → IDP returns COMPLETED → extracted fields mapped → target system called
- [ ] IDP polling — first 2 polls return IN_PROGRESS, 3rd returns COMPLETED → flow succeeds
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
