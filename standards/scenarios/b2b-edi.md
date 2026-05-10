# Scenario: B2B / EDI Partner Integration

> **Pattern:** `b2b-edi`
> **Trigger:** AS2 inbound transmission, SFTP file drop, or HTTP EDI endpoint
> **Latency target:** Minutes (async-ok; functional ACK required within 30 min typically)
> **Volume:** Low–medium per transmission; high cumulative over time

---

## When to Use This Pattern

- Trading partner sends/receives EDI documents (EDIFACT, X12, RosettaNet, HL7)
- B2B document exchange requiring acknowledgement (ANSI X12 997 FA, EDIFACT CONTRL)
- Partner onboarding requiring trading partner management and per-partner transformation rules
- AS2 transport with signed/encrypted payloads
- Retail, manufacturing, healthcare, or logistics verticals with established EDI standards

**Do not use** for: internal system integration (no trading partners), non-EDI file exchange
(use `file-based-etl`), or when partners have modern REST APIs (use `request-reply` or `event-driven`).

---

## Reference Architecture

### Inbound EDI (Partner → Internal)

```
Trading Partner
  │  AS2 / SFTP / HTTP
  ▼
MuleSoft B2B Gateway (Experience layer)
  ├── AS2 receiver / SFTP listener
  ├── Decrypt + verify signature
  ├── EDI parse (X12 / EDIFACT)
  ├── Validate against EDI schema
  ├── Send functional ACK (997 / CONTRL)
  ├── Transform to canonical internal model
  └── Publish to internal broker (Anypoint MQ)
        │
        ▼
{domain}-proc-api (Process layer)
  ├── Subscribe from MQ
  ├── Apply business rules (routing, enrichment)
  └── Call system API
        │
        ▼
{target-system}-sys-api → ERP / WMS / TMS
```

### Outbound EDI (Internal → Partner)

```
Internal System event (order, invoice, ASN)
        │
        ▼
{domain}-proc-api
  ├── Transform internal model to EDI canonical
  ├── Publish to outbound MQ queue
        │
        ▼
B2B Gateway (Experience layer)
  ├── Subscribe from outbound MQ
  ├── Map canonical to partner-specific EDI layout
  ├── Generate EDI document (X12 / EDIFACT)
  ├── Sign + encrypt (AS2)
  └── Transmit to partner
```

---

## decisions.json Defaults

```json
{
  "integration": {
    "integrationStyle": "hybrid",
    "primaryPattern": "b2b-edi",
    "direction": "bidirectional"
  },
  "nfr": {
    "latency": "async-ok",
    "frequency": "triggered",
    "volume": "low"
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "compensationStrategy": "retry",
    "maxRetries": 3,
    "backoff": "exponential",
    "dlq": true,
    "invalidMessageChannel": true,
    "invalidMessageChannelName": "{domain}-edi-invalid-messages-queue",
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
  "security": {
    "level": "partner",
    "apiAuth": "oauth2-client-credentials",
    "mtls": true
  },
  "devops": {
    "munitCoverage": 80
  }
}
```

---

## EDI Connector Selection

| Standard | MuleSoft Connector | Notes |
|----------|------------------|-------|
| EDIFACT | `mule-edifact-edi-connector` | Supports D96A, D01B, and most UN/CEFACT versions |
| X12 | `mule-x12-edi-connector` | Covers 4010, 5010, 6020 versions |
| RosettaNet | `mule-rosettanet-connector` | PIPs for high-tech supply chain |
| HL7 v2.x | `mule-hl7-mllp-connector` | For MLLP transport; see `healthcare.md` |
| AS2 transport | `mule-as2-connector` | Handles MDN, signing, encryption |

Verify all connector versions in `standards/connector-registry.json` before use.
Run `node scaffold/check-registry-freshness.js` — EDI connector versions change frequently.

---

## Flow Structure

### AS2 Inbound Receiver

```xml
<flow name="as2-receive-{partner}-{doctype}-flow">
  <!-- AS2 connector or HTTP listener for MDN-capable endpoint -->
  <as2-mule4:listener
    config-ref="AS2_Config"
    path="/as2/receive/{partner}"/>

  <!-- 1. Verify signature; decrypt payload -->
  <!-- 2. Send synchronous MDN (receipt acknowledgement) -->
  <as2-mule4:send-mdn
    requestAttributes="#[attributes]"
    messageId="#[attributes.messageId]"
    subject="MDN for #[attributes.messageId]"/>

  <!-- 3. Parse EDI -->
  <x12-edi:read config-ref="X12_Config" ediType="850"/>

  <!-- 4. Validate schema -->
  <!-- 5. Send 997 Functional Acknowledgement -->
  <flow-ref name="send-997-fa-{partner}-flow"/>

  <!-- 6. Transform to canonical + publish to MQ -->
  <anypoint-mq:publish
    config-ref="Anypoint_MQ_Config"
    destination="${mq.queue.edi.inbound.{doctype}}"/>

  <error-handler ref="global-error-handler"/>
</flow>
```

### 997 Functional Acknowledgement

```xml
<flow name="send-997-fa-{partner}-flow">
  <!-- Generate 997 from parsed X12 payload -->
  <x12-edi:write config-ref="X12_Config" ediType="997"/>
  <!-- Transmit back to partner via AS2 or SFTP -->
</flow>
```

---

## Partner Management

Each trading partner must have a dedicated configuration entry. Store partner metadata in
`standards/connector-registry.json` under a `b2b_partners` section or in a separate
`standards/trading-partners.json` file:

```json
{
  "partnerId": "ACME-CORP",
  "name": "Acme Corporation",
  "ediStandard": "X12",
  "ediVersion": "4010",
  "transport": "AS2",
  "as2Id": "ACMECORP",
  "inboundQueue": "edi-inbound-po-dev-queue",
  "outboundQueue": "edi-outbound-invoice-dev-queue",
  "documentTypes": ["850", "856", "810"],
  "acknowledgement": "997",
  "signingAlgorithm": "SHA256withRSA",
  "encryptionAlgorithm": "AES256"
}
```

---

## Document Types Reference

| X12 | EDIFACT | Document |
|-----|---------|----------|
| 850 | ORDERS | Purchase Order |
| 855 | ORDRSP | PO Acknowledgement |
| 856 | DESADV | Ship Notice / ASN |
| 810 | INVOIC | Invoice |
| 997 | CONTRL | Functional Acknowledgement |
| 204 | — | Motor Carrier Load Tender |
| 214 | IFTSTA | Shipment Status |

---

## Error Handling

Strategy: **retry-then-dlq**

| Failure | Action |
|---------|--------|
| AS2 receive failure | Return negative MDN; no retry (partner will retransmit) |
| EDI parse / schema violation | Send 999/CONTRL rejection ACK; route to DLQ |
| Business rule violation | Send 997 AK9=R (rejected); route to DLQ with error details |
| Target system connectivity | Retry 3× exponential; then DLQ with full EDI payload |
| ACK transmission failure | Retry 3× fixed 30s; alert partner manager |

**Never** silently discard a received EDI document. Every inbound document must produce either
a positive ACK or a documented rejection in the DLQ and audit trail.

---

## Compliance and Audit Requirements

All B2B flows must maintain an audit trail:
- Log: partner ID, message ID, ISA control number, timestamp, document type, status
- Retain raw inbound/outbound EDI in S3/Azure Blob for minimum 7 years (check vertical regulations)
- Enable Business Events in Anypoint Monitoring for EDI transactions
- Never log PII fields inline — mask sensitive data per `MULESOFT_DESIGN_STANDARDS.md`

---

## MUnit Test Coverage

Each B2B/EDI flow must have tests for:
- [ ] Happy path — valid EDI received → parsed → ACK sent → canonical published to MQ
- [ ] Invalid EDI schema — rejection ACK sent, DLQ populated
- [ ] Duplicate message (same ISA control number) — idempotency check fires
- [ ] Target system connectivity failure — retries fire; DLQ populated after exhaustion
- [ ] Outbound: canonical → correct EDI generated for partner-specific layout
- [ ] ACK transmission failure — retry fires; alert generated

---

## Example Project

**Client:** Retail PO/ASN/Invoice exchange with 3 trading partners
**Flows:** `as2-receive-acme-850-flow`, `send-997-fa-acme-flow`, `mq-subscriber-process-po-flow`,
          `outbound-810-invoice-acme-flow`
**Connectors:** `as2`, `x12-edi`, `anypoint-mq`, `amazon-s3` (EDI archive), `email` (alerts)
**Security tier:** partner (mTLS + OAuth2)
**Deployment:** CloudHub 2.0, 0.5 vCores × 2 replicas
