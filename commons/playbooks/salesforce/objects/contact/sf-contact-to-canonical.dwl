%dw 2.0
/**
 * sf-contact-to-canonical.dwl
 * Salesforce Contact (REST API response) → canonical-customer.contacts[] entry.
 *
 * Note: A Salesforce Contact maps to a contact entry within a canonical-customer,
 * not a top-level canonical object. Use this for syncing Contact changes to the
 * contacts array of the parent Account's canonical representation.
 *
 * Import:
 *   import sfContactToCanonical from "playbooks/salesforce/objects/contact/sf-contact-to-canonical.dwl"
 *
 * If you need to upsert a full customer canonical with contacts from Salesforce,
 * compose with sf-account-to-canonical.dwl — the Account transform already handles
 * contact sub-records via sf.Contacts.records. Use this transform for standalone
 * Contact sync flows (e.g. Contact updated → sync to ERP contact record).
 */
import toISODate, toISODateTime from "dwl/canonical-date.dwl"

fun sfContactToCanonical(sf: Object): Object = {
    contactId: sf.Id,
    firstName: sf.FirstName default null,
    lastName:  sf.LastName  default "",
    title:     sf.Title     default null,
    email:     sf.Email     default null,
    phone:     sf.Phone     default sf.MobilePhone default null,
    isPrimary: false,
    role:      "OTHER",

    // Extended fields not in canonical-customer minimal schema — available for enrichment
    accountId:   sf.AccountId    default null,
    department:  sf.Department   default null,
    leadSource:  sf.LeadSource   default null,
    description: sf.Description  default null,

    externalIds: {
        salesforceContactId:  sf.Id,
        salesforceAccountId:  sf.AccountId default null
    },

    timestamps: {
        createdAt: toISODateTime(sf.CreatedDate),
        updatedAt: toISODateTime(sf.LastModifiedDate)
    }
}
