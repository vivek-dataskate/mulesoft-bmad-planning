/**
 * UC-03 DataWeave Transform
 * Source : D365 FO Contact (OData entity)
 * Target : HubSpot Contact (CRM v3 properties object)
 */
%dw 2.0
output application/json

var d365ContactId = payload.contactid
var storedHsId    = payload.cr000_hubspot_contact_id default null
---
{
  properties: {
    // ── Name ────────────────────────────────────────────────────────────────
    firstname: payload.firstname   default null,
    lastname:  payload.lastname    default null,

    // ── Contact details ─────────────────────────────────────────────────────
    email:     payload.emailaddress1,
    phone:     payload.telephone1  default null,

    // ── Parent company reference ─────────────────────────────────────────────
    // HubSpot requires separate association call; this stores the D365 parent ID
    // for post-processing association
    associatedcompanyid: null,  // resolved post-create via association API

    // ── Correlation keys ─────────────────────────────────────────────────────
    d365_contact_id:  payload.contactid,
    d365_account_id:  payload."_parentcustomerid_value" default null,

    // ── Metadata ────────────────────────────────────────────────────────────
    uc03_last_sync_source: "MULESOFT_UC03",
    uc03_last_sync_ts:     now() as String {format: "yyyy-MM-dd'T'HH:mm:ss'Z'"}
  }
}
