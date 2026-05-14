%dw 2.0
/**
 * ns-customer-to-canonical.dwl
 * NetSuite Customer (REST API response) → canonical-customer schema.
 *
 * Import:
 *   import nsCustomerToCanonical from "playbooks/netsuite/objects/customer/ns-customer-to-canonical.dwl"
 *
 * Cross-system usage (NetSuite Customer → Salesforce Account update):
 *   import nsCustomerToCanonical from "playbooks/netsuite/objects/customer/ns-customer-to-canonical.dwl"
 *   import canonicalToSfAccount  from "playbooks/salesforce/objects/account/canonical-to-sf-account.dwl"
 *   ---
 *   canonicalToSfAccount(nsCustomerToCanonical(payload))
 *
 * NetSuite Customer isPerson flag:
 *   isPerson=true → individual (B2C) — companyName comes from firstName+lastName
 *   isPerson=false → company (B2B) — companyName is in companyName field
 */
import toISODate, toISODateTime from "dwl/canonical-date.dwl"

fun nsCustomerToCanonical(ns: Object): Object = do {

    var isPerson = ns.isPerson default false
    var fullName = if (isPerson)
                       (ns.firstName default "") ++ " " ++ (ns.lastName default "")
                   else
                       ns.companyName default ns.entityId default "UNKNOWN"

    ---
    {
        customerId: "NS-CUST-" ++ ns.id,

        externalIds: {
            netsuiteInternalId:  ns.id,
            netsuiteExternalId:  ns.externalId default null
            // salesforceAccountId: ns.externalId  // if externalId = Salesforce Account ID
        },

        name:   fullName,
        type:   "CUSTOMER",
        status: if (ns.isInactive default false) "INACTIVE" else "ACTIVE",

        segment: null,   // NS doesn't store segment; derive from annual revenue or custom field if needed

        industry: null,  // NS doesn't have an industry field by default; map from custom field if available

        contacts: do {
            var contactList = ns.contactRoles.items default []
            ---
            contactList map (c) -> {
                contactId:  (c.contact.id default "") as String,
                firstName:  null,   // Contact details require separate GET call to /contact/{id}
                lastName:   c.contact.id default "",   // Only have contact internalId from contactRoles
                title:      c.role.id default null,
                email:      null,
                phone:      null,
                isPrimary:  (c.role.id default "") == "Primary Contact",
                role:       "OTHER"
            }
        },

        addresses: {
            billing: {
                line1:      ns.defaultAddress default null,
                city:       null,    // NS defaultAddress is a formatted string; use addressBook for structured
                state:      null,
                postalCode: null,
                country:    (ns.addressBook.items[0].addressBookAddress.country.id default null)
            },
            shipping: {
                line1:      null,
                city:       null,
                state:      null,
                postalCode: null,
                country:    null
            }
        },

        // Structured address from addressBook (first entry)
        // Note: for full addresses, iterate ns.addressBook.items and match by defaultBilling/defaultShipping
        (addressesStructured: do {
            var billAddr = (ns.addressBook.items filter ($.defaultBilling == true))[0].addressBookAddress
            var shipAddr = (ns.addressBook.items filter ($.defaultShipping == true))[0].addressBookAddress
            ---
            {
                billing: {
                    line1:      billAddr.addr1 default null,
                    line2:      billAddr.addr2 default null,
                    city:       billAddr.city  default null,
                    state:      billAddr.state default null,
                    postalCode: billAddr.zip   default null,
                    country:    billAddr.country.id default null
                },
                shipping: {
                    line1:      shipAddr.addr1 default null,
                    line2:      shipAddr.addr2 default null,
                    city:       shipAddr.city  default null,
                    state:      shipAddr.state default null,
                    postalCode: shipAddr.zip   default null,
                    country:    shipAddr.country.id default null
                }
            }
        }) if ((ns.addressBook.items default []) != []),

        financial: {
            creditLimit:   ns.creditLimit  default null,
            paymentTerms:  ns.terms.id     default null,
            currency:      ns.currency.id  default null,
            taxExempt:     ns.isTaxable    default false,
            annualRevenue: null            // NS doesn't store this by default
        },

        relationships: {
            parentCustomerId: if (ns.parent.id != null) "NS-CUST-" ++ (ns.parent.id as String) else null,
            ownerId:          (ns.salesRep.id default null) as String
        },

        timestamps: {
            createdAt: toISODateTime(ns.dateCreated      default null),
            updatedAt: toISODateTime(ns.lastModifiedDate default null)
        }
    }
}
