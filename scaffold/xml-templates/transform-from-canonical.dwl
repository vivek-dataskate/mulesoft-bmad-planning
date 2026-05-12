%dw 2.0
/**
 * Transform: canonical-{{ENTITY}}-to-{{TARGET_SYSTEM}}.dwl
 * Flow:      {{FLOW_NAME}}
 * Direction: Canonical {{ENTITY_TITLE}} → {{TARGET_SYSTEM}}
 * Schema:    {{CANONICAL_MODEL_PATH}}
 *
 * This file maps the canonical {{ENTITY_TITLE}} schema into TARGET system fields.
 * Input is ALWAYS canonical — never raw source system payload.
 * When {{TARGET_SYSTEM}}'s API changes, only THIS file changes.
 * When a new target system is added, write a new canonical-{{ENTITY}}-to-{newSystem}.dwl —
 * the upstream flow and canonical schema do not change.
 *
 * Field Mapping — Canonical → {{TARGET_SYSTEM}}:
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical Field           | Target Field ({{TARGET_SYSTEM}})   | Rule
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO: Complete from architecture.md field mapping table for this flow
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Business Rules:
 * TODO: Copy business rules from architecture.md that apply at write time
 *
 * Client Extensions ({{CLIENT}} — from canonical-extensions.yaml):
 * TODO: Client-specific renamedFields that differ in {{TARGET_SYSTEM}} go here
 */

// Input is always canonical — declare explicit type for IDE support
// input payload application/json

output application/json
// output application/json indent=false  // uncomment for large payloads

---
// ── {{TARGET_SYSTEM}} payload output ─────────────────────────────────────────
// Map FROM canonical fields only — never reference _meta or source-system fields
// Omit fields that {{TARGET_SYSTEM}} does not accept (see omittedFields in canonical-extensions.yaml)

{
    // ── Required {{TARGET_SYSTEM}} fields ─────────────────────────────────────
    // TODO: Map canonical.{entity}Id to the correct {{TARGET_SYSTEM}} field name
    // If {{TARGET_SYSTEM}} has a different field name (renamedField), use that here
    // Example (ComputerEase): "job_number": payload.erpMetadata.erpJobNumber
    // Example (Salesforce): "External_Id__c": payload.externalIds.salesforceOpptyId

{{TARGET_FIELD_STUBS}}

    // ── Status mapping ────────────────────────────────────────────────────────
    // TODO: Map canonical status enum to {{TARGET_SYSTEM}} status values
    // Pattern: "targetStatus": { "ACTIVE": "A", "INACTIVE": "I" }[payload.status] default "A"

    // ── Client extensions going TO {{TARGET_SYSTEM}} ──────────────────────────
    // TODO [CLIENT EXTENSION]: Map addedFields from canonical-extensions.yaml that
    // {{TARGET_SYSTEM}} accepts. Omit fields listed in omittedFields[].

    // ── Idempotency key ───────────────────────────────────────────────────────
    // Always include — {{TARGET_SYSTEM}} uses this for upsert deduplication
    // TODO: Confirm the external ID field name in {{TARGET_SYSTEM}}
    // "TODO_EXTERNAL_ID_FIELD__c": payload.{{ENTITY}}Id
}
