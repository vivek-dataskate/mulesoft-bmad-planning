# Story Template: Field Encryption and Audit-Trail Flow

**Story Type:** Global Security / Compliance (Conditional)
**When to include:** Only if `decisions.json scaffold.profile = regulated`
**Priority:** P0
**Standard:** `standards/MULESOFT_DESIGN_STANDARDS.md → Security Tiers → regulated`
**Scaffold Files:** `src/main/mule/error-handler.xml` (audit-trail flow), `src/main/mule/global-config.xml` (crypto config)

---

## User Story

As a compliance officer, I need PII fields encrypted at rest and a tamper-evident audit trail that records every mutation event, so that the integration meets the data protection requirements specified in the compliance section of the PRD.

---

## Acceptance Criteria

### Field Encryption
- [ ] PII fields identified in `architecture.md → Compliance / PII` section are encrypted at rest using Mule Cryptography module
- [ ] Encryption algorithm: AES-256-GCM (or per compliance requirement specified in prd.md)
- [ ] Encryption keys stored exclusively in Secrets Manager — NEVER in:
  - Properties files (`.yaml`)
  - Object Store
  - Source code
  - CI/CD pipeline variables (pipeline needs a reference, not the key itself)
- [ ] Separate encryption keys for dev, uat, and prod environments
- [ ] Field decryption occurs ONLY in the designated System API layer — never decrypted in Process or Experience APIs

### Decryption Access Control
- [ ] Only the System API that owns the encrypted entity can decrypt
- [ ] Process APIs receive and propagate encrypted values without decrypting
- [ ] Experience APIs never receive decrypted PII — only masked or tokenized representations
- [ ] MUnit test: verify that the flow output of Process and Experience APIs contains only encrypted/masked values for PII fields

### Audit-Trail Flow
- [ ] Dedicated audit-trail flow configured in `error-handler.xml` or as a separate `audit-flows.xml`
- [ ] Audit-trail flow fires on every create, update, and delete mutation event (not on reads)
- [ ] Audit records published to a **separate compliance audit store** (not the wire-tap audit queue):
  - AWS: S3 with object lock (WORM) + DynamoDB for queryable index
  - Azure: Azure Blob with immutability policy + Cosmos DB for index
  - CloudHub 2.0 native: Anypoint Object Store v2 (persistent) with append-only design
- [ ] Audit record format:
  ```json
  {
    "eventId": "<UUID>",
    "correlationId": "<correlationId>",
    "timestamp": "<ISO-8601>",
    "eventType": "CREATE | UPDATE | DELETE",
    "entity": "<entity-name>",
    "entityId": "<redacted or tokenized>",
    "actor": "<correlationId or API consumer ID>",
    "changedFields": ["<field-name>"],
    "environment": "<env>"
  }
  ```
- [ ] Audit records are **immutable** (append-only store; existing records cannot be modified or deleted)
- [ ] Audit records retained per compliance requirement stated in `prd.md → Compliance` section

### Retention and Access
- [ ] Retention period configured as specified in prd.md (default: 7 years for regulated data if not specified)
- [ ] Audit store access restricted to authorized roles only (not accessible from application flows except audit-trail write)
- [ ] Audit log query capability confirmed (ops team can look up by correlationId, date range, entity ID)

### MUnit Tests
- [ ] Test: verify PII field in flow output is encrypted (cannot be read as plaintext)
- [ ] Test: verify audit record is published on mutation event with correct eventType
- [ ] Test: verify decryption does NOT occur in Process or Experience API flow mocks

---

## PII Fields to Encrypt
*(PM agent populates from architecture.md → Compliance / PII section)*

| Field Name | Entity | System API | Encryption Required |
|-----------|--------|-----------|-------------------|
| `{field}` | `{entity}` | `{sys-api-name}` | Yes |

---

## Implementation Notes

- Reference: `standards/MULESOFT_DESIGN_STANDARDS.md → Security Tiers → regulated`
- Mule Cryptography module: `org.mule.modules:mule-cryptography-module` in pom.xml
- Wire tap (Global 6 story) and audit-trail (this story) are SEPARATE — wire tap is for ops debugging, audit trail is for compliance
- If `security.level=government`: also requires mTLS and JWT validation per `security-government.md` story
