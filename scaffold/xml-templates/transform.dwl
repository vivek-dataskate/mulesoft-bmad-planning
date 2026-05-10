%dw 2.0
/**
 * Transform: {{VERB}}-{{FLOW_SOURCE}}-to-{{FLOW_TARGET}}.dwl
 * Flow:      {{FLOW_NAME}}
 * Source:    {{FLOW_SOURCE}}
 * Target:    {{FLOW_TARGET}}
 *
 * Field Mapping (from architecture.md):
 * ─────────────────────────────────────────────────────────────────────
 * Source Field        | Target Field        | Transform Rule
 * ─────────────────────────────────────────────────────────────────────
 * TODO: Copy field mapping table from architecture.md for this flow
 *
 * Business Rules (from architecture.md):
 * TODO: Copy business rules section from architecture.md for this flow
 *
 * Open Items (resolve with client in Sprint 1):
 * TODO: Copy open items from architecture.md for this flow
 *       Format: [ ] OPEN ITEM: {question} — best guess: {value}
 * ─────────────────────────────────────────────────────────────────────
 *
 * Rules:
 *  - This file is for transforms > 10 lines; inline otherwise
 *  - Input content-type MUST be declared (see input directive below)
 *  - Use indent=false for large payloads (performance)
 *  - Comments describe business rules ONLY, not what the code does
 */

// Declare input content type (prevents DataWeave from inferring at runtime)
// input payload application/json

output application/json
// output application/json indent=false  // uncomment for large payloads (> 10K records)

---
// TODO: Implement {{FLOW_SOURCE}} → {{FLOW_TARGET}} mapping below.
//       Replace each field with the actual transform from the Field Mapping table.

{
    // ── TODO: Map each field from architecture.md Field Mapping table ───

    // Example canonical field mapping:
    // targetField: payload.sourceField,

    // Example with type coercion:
    // amount: payload.totalAmount as Number,

    // Example with conditional / default:
    // status: payload.status default "PENDING",

    // Example with lookup / enum mapping:
    // region: {
    //   "NE": "Northeast",
    //   "SE": "Southeast",
    //   "MW": "Midwest"
    // }[payload.regionCode] default payload.regionCode,

    // Example with date format conversion:
    // createdAt: payload.created_date as DateTime { format: "yyyy-MM-dd" } as String { format: "yyyy-MM-dd'T'HH:mm:ss.SSSZ" },

    // Correlation ID always included in target payload for tracing
    _correlationId: correlationId

    // TODO [OPEN ITEM]: {question from architecture.md} — best guess: {value}
}
