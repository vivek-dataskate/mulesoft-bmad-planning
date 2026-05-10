%dw 2.0
output application/json

import * from dw::core::Strings

// ── Helpers ────────────────────────────────────────────────────────────────
fun toTitleCase(s: String): String =
  s splitBy " " map (w) -> upper(w[0]) ++ lower(w[1 to -1]) joinBy " "

fun cleanPhone(p: String | Null): String =
  if (p == null) "" else p replace /[^0-9+\-().x ]/ with ""

// ── Variable side-effects (consumed by downstream match steps) ─────────────
var hsCompanyId    = payload.hs_object_id
var hsCompanyEmail = payload.domain default ""    // Company-level email/domain
---
// Set variables for downstream use (Mule vars set via set-variable separately)
// This transform outputs the D365 Account body for upsert

{
  // ── Core fields ────────────────────────────────────────────────────────
  name:                   payload.name,
  emailaddress1:          payload.domain        default null,
  telephone1:             cleanPhone(payload.phone),

  // ── Address entity ─────────────────────────────────────────────────────
  "address1_line1":       payload.address       default null,
  "address1_city":        payload.city          default null,
  "address1_stateorprovince": payload.state     default null,
  "address1_postalcode":  payload.zip           default null,
  "address1_country":     payload.country       default null,

  // ── Correlation / idempotency keys ─────────────────────────────────────
  // Custom field: HubSpot Company ID stored as D365 External ID
  "cr000_hubspot_company_id": payload.hs_object_id,

  // ── Metadata ───────────────────────────────────────────────────────────
  "cr000_last_sync_source": "MULESOFT_UC03",
  "cr000_last_sync_ts":     now() as String {format: "yyyy-MM-dd'T'HH:mm:ss'Z'"}
}
