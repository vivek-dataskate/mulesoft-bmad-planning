%dw 2.0
/**
 * Transform: {{SOURCE_SYSTEM}}-to-canonical-{{ENTITY}}.dwl
 * Flow:      {{FLOW_NAME}}
 * Direction: {{SOURCE_SYSTEM}} → Canonical {{ENTITY_TITLE}}
 * Schema:    {{CANONICAL_MODEL_PATH}}
 *
 * This file maps SOURCE system fields into the canonical {{ENTITY_TITLE}} schema.
 * The canonical schema is the contract — downstream flows consume only canonical.
 * When {{SOURCE_SYSTEM}}'s API changes, only THIS file changes.
 *
 * Canonical fields pre-populated from: {{CANONICAL_MODEL_PATH}}
 * Client extensions from:             projects/{{CLIENT}}/canonical-extensions.yaml
 *
 * Field Mapping — {{SOURCE_SYSTEM}} → Canonical:
 * ─────────────────────────────────────────────────────────────────────────────
 * Source Field ({{SOURCE_SYSTEM}})     | Canonical Field          | Rule
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO: Complete from architecture.md field mapping table for this flow
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Business Rules:
 * TODO: Copy business rules from architecture.md that apply at ingestion time
 *
 * Client Extensions ({{CLIENT}} — from canonical-extensions.yaml):
 * TODO: Client-specific addedFields and renamedFields go here
 */

// Declare input content type (prevents DataWeave from inferring at runtime)
// input payload application/json

output application/json
// output application/json indent=false  // uncomment for large payloads (> 10K records)

import toISODate from "dwl/canonical-date.dwl"

---
// ── Canonical {{ENTITY_TITLE}} schema output ──────────────────────────────────
// Every field below maps to canonical-{{ENTITY}}.yaml
// Do not remove or rename canonical fields — add client extensions at the bottom

{
    // ── Required canonical fields ─────────────────────────────────────────────
    "{{ENTITY}}Id": payload.TODO_SOURCE_ID_FIELD,                    // canonical required

    "externalIds": {
        "{{SOURCE_SYSTEM_KEY}}Id": payload.TODO_SOURCE_ID_FIELD      // source system ref
    },

    // ── Core fields ───────────────────────────────────────────────────────────
    // TODO: Map each canonical field from the schema below.
    // Pattern: "canonicalField": payload.sourceField
    // Status enum: map source values to canonical enum — never pass source strings directly
    // Example: "status": { "ACTIVE": "ACTIVE", "1": "ACTIVE", "0": "INACTIVE" }[payload.status] default "ACTIVE",

{{CANONICAL_FIELD_STUBS}}

    // ── Timestamps ────────────────────────────────────────────────────────────
    "timestamps": {
        "createdAt": toISODate(payload.TODO_CREATED_DATE_FIELD),
        "updatedAt": toISODate(payload.TODO_UPDATED_DATE_FIELD)
    },

    // ── Client extensions ({{CLIENT}}-specific — not in canonical schema) ─────
    // TODO [CLIENT EXTENSION]: Add fields from canonical-extensions.yaml addedFields[]
    // Pattern: "extensionFieldName": payload.sourceExtensionField
    // Example: "companyCode": payload.company_code default "00"

    // ── Integration metadata (always include) ─────────────────────────────────
    "_meta": {
        "sourceSystem":    "{{SOURCE_SYSTEM}}",
        "correlationId":   correlationId,
        "transformedAt":   now() as String { format: "yyyy-MM-dd'T'HH:mm:ss.SSSZ" },
        "schemaVersion":   "{{CANONICAL_SCHEMA_VERSION}}"
    }
}
