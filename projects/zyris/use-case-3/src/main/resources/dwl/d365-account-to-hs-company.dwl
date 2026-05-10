/**
 * UC-03 DataWeave Transform
 * Source : D365 FO Account (OData entity)
 * Target : HubSpot Company (CRM v3 properties object)
 *
 * Also sets vars.d365AccountId and vars.hsCompanyId for downstream routing.
 */
%dw 2.0
output application/json

fun stripCountryCode(phone: String | Null): String =
  if (phone == null) "" else phone

var d365AccountId  = payload.accountid
var storedHsId     = payload.cr000_hubspot_company_id default null
---
// Wrapped in HubSpot's expected { properties: {...} } envelope
{
  properties: {
    // ── Core fields ────────────────────────────────────────────────────────
    name:    payload.name,
    phone:   stripCountryCode(payload.telephone1),
    domain:  payload.emailaddress1 default null,

    // ── Address ────────────────────────────────────────────────────────────
    address:  payload.address1_line1              default null,
    city:     payload.address1_city               default null,
    state:    payload.address1_stateorprovince    default null,
    zip:      payload.address1_postalcode         default null,
    country:  payload.address1_country            default null,

    // ── Correlation keys ────────────────────────────────────────────────────
    // Write D365 Account ID to HubSpot custom property for traceability
    d365_account_id: payload.accountid,

    // ── Metadata ────────────────────────────────────────────────────────────
    uc03_last_sync_source: "MULESOFT_UC03",
    uc03_last_sync_ts:     now() as String {format: "yyyy-MM-dd'T'HH:mm:ss'Z'"}
  }
}
