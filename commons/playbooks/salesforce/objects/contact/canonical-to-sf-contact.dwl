%dw 2.0
/**
 * canonical-to-sf-contact.dwl
 * canonical contact entry → Salesforce Contact PATCH body.
 *
 * Import:
 *   import canonicalToSfContact from "playbooks/salesforce/objects/contact/canonical-to-sf-contact.dwl"
 *
 * The canonical contact is embedded in canonical-customer.contacts[].
 * Extract the relevant contact entry before passing to this transform.
 *
 * Example (upsert primary contact from NetSuite Customer):
 *   import nsCustomerToCanonical from "playbooks/netsuite/objects/customer/ns-customer-to-canonical.dwl"
 *   import canonicalToSfContact  from "playbooks/salesforce/objects/contact/canonical-to-sf-contact.dwl"
 *   var canonical = nsCustomerToCanonical(payload)
 *   ---
 *   canonicalToSfContact(canonical.contacts[0], canonical.externalIds.salesforceAccountId)
 *
 * Only includes fields Salesforce allows PATCH on.
 * DO NOT include: Id, CreatedDate, CreatedById, IsDeleted, SystemModstamp — read-only.
 */

fun canonicalToSfContact(contact: Object, salesforceAccountId: String = null): Object = {

    FirstName: contact.firstName default null,
    LastName:  contact.lastName  default "Unknown",
    Title:     contact.title     default null,
    Email:     contact.email     default null,
    Phone:     contact.phone     default null,

    // Link to parent Account
    (AccountId: salesforceAccountId) if (salesforceAccountId != null),

    // Description — append sync note
    Description: "Last synced: " ++ (now() as String { format: "yyyy-MM-dd HH:mm:ss z" }),

    // CLIENT: Add custom field updates here:
    // NetSuite_Contact_ID__c:  contact.externalIds.netsuiteInternalId,
    // Department__c:            contact.department,
    // Contact_Role__c:          contact.role

} -- { (k): v if (v == null) }
// The -- {k:v if null} removes null fields so we don't overwrite SF fields with blank
