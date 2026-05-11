# Story Template: B2B Partner Registry and EDI Infrastructure Setup

**Story Type:** Global Infrastructure (Conditional)
**When to include:** Only if `decisions.json integration.primaryPattern = "b2b-edi"`
**Priority:** P0 — no EDI flows can run without partner profiles, certificates, and EDI schema references in place
**Standard:** `standards/scenarios/b2b-edi.md`
**Scenario File:** `standards/scenarios/b2b-edi.md`
**Scaffold Files:** `src/main/mule/global-config.xml`, `src/main/resources/api/{partner}-{doctype}.edi`

---

## User Story

As a developer, I need trading partner profiles configured in Anypoint Partner Manager, AS2 transport configured, EDI schemas referenced, and ACK/NACK flows wired, so that inbound and outbound EDI transmissions are processed reliably with proper acknowledgement and per-partner transformation rules.

---

## Acceptance Criteria

### Anypoint Partner Manager — Platform Configuration (not code)
- [ ] **Host profile** configured in Anypoint Partner Manager:
  - ISA Sender/Receiver ID (X12): `{client ISA qualifier}:{client ISA ID}` (confirm with client)
  - GS Application Sender/Receiver ID (X12): as provided by client
  - DUNS number or GLN if using EDIFACT (UNB sender/receiver)
- [ ] **Trading partner profile** created for each partner in `architecture.md`:
  - Partner name, AS2 ID, ISA/GS identifiers
  - Inbound and outbound document types per partner (e.g. 850 PO inbound, 856 ASN outbound)
  - Certificate for AS2 signature verification (partner's public cert uploaded)
  - Encryption certificate if AS2 encryption is used (partner's public cert)
- [ ] **Message flow** created in Anypoint Partner Manager per document type per partner
- [ ] **Acknowledgement rules** configured per partner:
  - X12: 997 Functional Acknowledgement required? (default: yes)
  - EDIFACT: CONTRL acknowledgement required? (confirm with partner)
  - Acknowledgement turnaround time: typically within 30 minutes

### AS2 Connector Configuration (global-config.xml)
- [ ] `<as2:inbound-config>` or `<as2:listener-config>` configured with:
  - Own private key for signing outbound MDN (AS2 MDN = Message Disposition Notification)
  - `signingAlgorithm`: `SHA256withRSA` (minimum; `SHA512withRSA` for high-security partners)
  - `encryptionAlgorithm`: `AES128_CBC` or `AES256_CBC` (confirm per partner agreement)
- [ ] AS2 listening endpoint exposed: `POST /as2/receive` (or per partner-specific path)
- [ ] AS2 outbound config points to each partner's AS2 URL (from Partner Manager profile)
- [ ] Certificates stored in Secrets Manager — never in the project's `resources/` folder:
  - Own private key: `as2.private.key`
  - Partner public cert: `as2.partner.{partnerName}.cert`

### EDI Schema References
- [ ] EDI schema files placed in `src/main/resources/schemas/` (not EDI module built-ins — always use project-local copies for version control)
- [ ] Schema file per document type: `X12-{version}-{transactionSet}.edi` or `EDIFACT-{version}-{messageType}.edi`
  - Example X12: `X12-005010-850.edi` (Purchase Order), `X12-005010-856.edi` (ASN), `X12-005010-997.edi` (FA)
  - Example EDIFACT: `EDIFACT-D01B-ORDERS.edi`, `EDIFACT-D01B-DESADV.edi`
- [ ] EDI module config references local schema path: `schemaPath="classpath:schemas/X12-005010-850.edi"`
- [ ] Version matches partner's agreed EDI version (confirm in partner profile — DO NOT assume)

### Inbound EDI Flow Checklist
- [ ] AS2 receiver / SFTP listener → EDI parse → validate → canonical transform → publish to internal MQ
- [ ] EDI validation errors route to **Invalid Message Channel** (not DLQ) — bad EDI will never succeed on retry
- [ ] Functional ACK (997/CONTRL) generated and sent **synchronously** before publishing to internal MQ
  - ACK sent even if downstream processing is async — partner expects ACK within 30 min of receipt
  - ACK content: AK9 segment indicates accepted (A) or rejected (R) based on EDI validation result
- [ ] Correlation ID derived from: ISA Control Number (X12) or UNB Reference Number (EDIFACT) — set as Mule `correlationId`
- [ ] Inbound MQ queue named: `{domain}-edi-inbound-{env}-queue`; TTL: 24h (standard)

### Outbound EDI Flow Checklist
- [ ] Internal canonical → EDI transform via `edi:write` operation with correct schema
- [ ] ISA Control Number auto-incremented per partner (stored in persistent Object Store, key: `isa-control-{partnerName}`)
- [ ] GS Group Control Number incremented similarly
- [ ] Outbound message published to `{domain}-edi-outbound-{env}-queue` before AS2 send (preserve the message if AS2 send fails)
- [ ] AS2 MDN receipt (synchronous or asynchronous per partner agreement) verified before marking sent
- [ ] Outbound retry: if partner AS2 endpoint unavailable → retry 3× exponential 30/90/270s → DLQ after max retries

### Anypoint MQ Queues
- [ ] `{domain}-edi-inbound-{env}-queue` — inbound EDI pending internal processing; TTL: 24h
- [ ] `{domain}-edi-outbound-{env}-queue` — outbound EDI pending AS2 send; TTL: 7 days (critical business docs)
- [ ] `{domain}-edi-invalid-{env}-queue` — invalid EDI (validation failures); TTL: 7 days (for ops review)
- [ ] DLQ for outbound queue only: `{domain}-edi-outbound-{env}-queue-dlq`
- [ ] Alert: invalid-messages queue > 0 → HIGH (malformed EDI from partner; partner must be notified)
- [ ] Alert: outbound DLQ > 0 → HIGH (failed outbound transmission; SLA risk)

### Partner Onboarding Runbook
- [ ] Connectivity test completed with each trading partner in **test/UAT environment** before prod go-live
- [ ] Test transmission sent and ACK received from each partner
- [ ] Ops runbook documented: how to add a new partner profile, upload certificates, create message flows in Partner Manager

### MUnit Tests
- [ ] Inbound happy path: mock AS2 receive → valid EDI → parse → validate → canonical output asserted → 997 ACK generated
- [ ] Inbound validation failure: invalid EDI segment → EDI validation exception → invalid-message-channel populated; ACK with rejection code sent
- [ ] Outbound happy path: canonical input → EDI generated → AS2 transmitted → MDN verified
- [ ] Outbound AS2 failure: mock AS2 send throws error → retry fires → after max retries, DLQ populated
- [ ] Control number increment: two consecutive outbound calls → assert ISA Control Numbers are sequential

---

## Partner Inventory
*(PM agent populates from architecture.md)*

| Partner Name | AS2 ID | EDI Standard | Inbound Doc Types | Outbound Doc Types | ACK Required |
|-------------|--------|-------------|-------------------|--------------------|--------------|
| `{partnerName}` | `{as2Id}` | X12 / EDIFACT | `{docTypes}` | `{docTypes}` | Yes |

---

## Implementation Notes

- **Anypoint Partner Manager is required** for B2B/EDI; it is not bundled with base Anypoint Platform — confirm the client has a Partner Manager entitlement before proceeding
- AS2 certificates expire — set a calendar reminder to renew both own cert and partner certs before expiry; expired certs cause silent transmission failures (partner rejects signed payload)
- ISA Control Numbers must be unique per trading partner per interchange; use persistent Object Store — in-memory counter resets on worker restart and causes ISA 004 rejections (duplicate control number)
- 997 ACK must be sent even when downstream processing is async — the ACK acknowledges EDI receipt and syntactic validity only, not business processing
- Never put EDI schema files in `.gitignore` — they are required at runtime and must be in version control
- Reference: `standards/scenarios/b2b-edi.md` — full architecture, inbound/outbound flow structure, error handling table
