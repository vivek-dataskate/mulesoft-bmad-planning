/**
 * UC-03 DataWeave Transform
 * Source : HubSpot Contact (CRM v3 properties object)
 * Target : D365 FO Contact (OData entity)
 */
%dw 2.0
output application/json

fun cleanPhone(p: String | Null): String =
  if (p == null) "" else p replace /[^0-9+\-().x ]/ with ""

var hsContactId = payload.hs_object_id
---
{
  // ── Name fields ─────────────────────────────────────────────────────────
  firstname:    payload.firstname  default null,
  lastname:     payload.lastname   default null,
  fullname:     (payload.firstname default "") ++ " " ++ (payload.lastname default "") trim,

  // ── Contact details ─────────────────────────────────────────────────────
  emailaddress1: payload.email,
  telephone1:    cleanPhone(payload.phone),

  // ── Parent account linkage ───────────────────────────────────────────────
  // D365 Account lookup — resolved by associatedcompanyid via separate step
  // Set to null here; caller sets parentcustomerid@odata.bind after account upsert
  "parentcustomerid_account@odata.bind": null,

  // ── Correlation keys ────────────────────────────────────────────────────
  "cr000_hubspot_contact_id":  payload.hs_object_id,
  "cr000_hubspot_company_id":  payload.associatedcompanyid default null,

  // ── Metadata ────────────────────────────────────────────────────────────
  "cr000_last_sync_source": "MULESOFT_UC03",
  "cr000_last_sync_ts":     now() as String {format: "yyyy-MM-dd'T'HH:mm:ss'Z'"}
}
