%dw 2.0
/**
 * canonical-to-ns-customer.dwl
 * canonical-customer → NetSuite Customer REST PUT body.
 *
 * Import:
 *   import canonicalToNsCustomer from "playbooks/netsuite/objects/customer/canonical-to-ns-customer.dwl"
 *
 * Cross-system usage (Salesforce Account → NetSuite Customer):
 *   import sfAccountToCanonical  from "playbooks/salesforce/objects/account/sf-account-to-canonical.dwl"
 *   import canonicalToNsCustomer from "playbooks/netsuite/objects/customer/canonical-to-ns-customer.dwl"
 *   ---
 *   canonicalToNsCustomer(sfAccountToCanonical(payload))
 *
 * CLIENT TODO:
 *   - subsidiary: Required for OneWorld accounts. Add subsidiaryId argument or hardcode per client.
 *   - taxCode: NS requires internalId of the tax code, not the name.
 *   - salesRep: Map from canonical ownerId to NS employee internalId.
 *   - Custom body fields: custbody_fieldname per client's field list.
 *
 * DO NOT include: id, dateCreated, lastModifiedDate — all read-only.
 */
import toISODate from "dwl/canonical-date.dwl"

fun canonicalToNsCustomer(canonical: Object, subsidiaryId: String = ""): Object = do {

    // Strip system prefixes to get raw IDs
    fun stripPrefix(id: String): String =
        id replace "SF-ACCT-" with ""
          replace "NS-CUST-" with ""

    ---
    {
        // externalId = source system record ID for idempotent upsert
        externalId: canonical.customerId,

        companyName: canonical.name,
        isPerson:    false,   // B2B default; set true for individual contacts (B2C)

        // NetSuite requires email for customer records (used for portal login if enabled)
        email: if (!(isEmpty(canonical.contacts default [])))
                   (canonical.contacts[0].email default null)
               else null,

        phone: if (!(isEmpty(canonical.contacts default [])))
                   (canonical.contacts[0].phone default null)
               else null,

        isActive: canonical.status == "ACTIVE",

        // OneWorld: subsidiary required on create
        (subsidiary: { id: subsidiaryId }) if (subsidiaryId != ""),

        // Payment terms (NS internalId — client must provide)
        (terms: { id: canonical.financial.paymentTerms }) if (canonical.financial.paymentTerms != null),

        // Currency (NS internalId, e.g. "USD")
        (currency: { id: canonical.financial.currency }) if (canonical.financial.currency != null),

        creditLimit: canonical.financial.creditLimit default null,

        // Parent company for hierarchy
        (parent: { id: stripPrefix(canonical.relationships.parentCustomerId) })
            if (canonical.relationships.parentCustomerId != null),

        // Address book — billing address as first entry
        (addressBook: {
            items: [
                {
                    defaultBilling:  true,
                    defaultShipping: false,
                    label:           "Billing",
                    addressBookAddress: {
                        addr1:   canonical.addresses.billing.line1      default null,
                        city:    canonical.addresses.billing.city        default null,
                        state:   canonical.addresses.billing.state       default null,
                        zip:     canonical.addresses.billing.postalCode  default null,
                        (country: { id: canonical.addresses.billing.country })
                            if (canonical.addresses.billing.country != null)
                    }
                },
                {
                    defaultBilling:  false,
                    defaultShipping: true,
                    label:           "Shipping",
                    addressBookAddress: {
                        addr1:   canonical.addresses.shipping.line1      default null,
                        city:    canonical.addresses.shipping.city        default null,
                        state:   canonical.addresses.shipping.state       default null,
                        zip:     canonical.addresses.shipping.postalCode  default null,
                        (country: { id: canonical.addresses.shipping.country })
                            if (canonical.addresses.shipping.country != null)
                    }
                }
            ]
        }) if (canonical.addresses != null),

        // CLIENT: add custom fields here:
        // custentity_sf_account_id:   canonical.externalIds.salesforceAccountId,
        // custentity_segment:          canonical.segment,
        // custentity_industry:         canonical.industry

    } -- { (k): v if (v == null) }
    // The -- {k:v if null} removes null fields to avoid accidentally clearing NS fields
}
