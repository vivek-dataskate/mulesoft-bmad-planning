%dw 2.0
/**
 * sf-account-to-canonical.dwl
 * Salesforce Account (REST API response) → canonical-customer schema.
 * Import: import sfAccountToCanonical from "playbooks/salesforce/objects/account/sf-account-to-canonical.dwl"
 */
import toISODate, toISODateTime from "dwl/canonical-date.dwl"

fun sfAccountToCanonical(sf: Object): Object = {
    customerId: "SF-ACCT-" ++ sf.Id,

    externalIds: {
        salesforceAccountId: sf.Id
        // netsuiteInternalId: sf.NetSuite_Customer_ID__c   // CLIENT: add when synced
    },

    name:   sf.Name,
    type:   (sf.Type match {
                case "Customer"  -> "CUSTOMER"
                case "Partner"   -> "PARTNER"
                case "Prospect"  -> "PROSPECT"
                else             -> "CUSTOMER"
             }),
    status: if (sf.IsDeleted default false) "INACTIVE" else "ACTIVE",

    segment: (sf.NumberOfEmployees default 0) match {
        case n if (n >= 1000) -> "ENTERPRISE"
        case n if (n >= 200)  -> "MID_MARKET"
        case n if (n >= 50)   -> "SMB"
        else                  -> "STARTUP"
    },

    industry: sf.Industry default null,

    contacts: (sf.Contacts.records default []) map (c) -> {
        contactId: c.Id,
        firstName: c.FirstName default null,
        lastName:  c.LastName default "",
        title:     c.Title default null,
        email:     c.Email default null,
        phone:     c.Phone default null,
        isPrimary: false,
        role:      "OTHER"
    },

    addresses: {
        billing: {
            line1:      sf.BillingStreet default null,
            city:       sf.BillingCity default null,
            state:      sf.BillingState default null,
            postalCode: sf.BillingPostalCode default null,
            country:    sf.BillingCountryCode default sf.BillingCountry default null
        },
        shipping: {
            line1:      sf.ShippingStreet default null,
            city:       sf.ShippingCity default null,
            state:      sf.ShippingState default null,
            postalCode: sf.ShippingPostalCode default null,
            country:    sf.ShippingCountryCode default sf.ShippingCountry default null
        }
    },

    financial: {
        creditLimit:   null,              // SF doesn't have this; comes from ERP
        paymentTerms:  null,
        currency:      sf.DefaultCurrencyIsoCode default null,
        taxExempt:     false,
        annualRevenue: sf.AnnualRevenue default null
    },

    relationships: {
        parentCustomerId: if (sf.ParentId != null) "SF-ACCT-" ++ sf.ParentId else null,
        ownerId:          sf.OwnerId default null
    },

    timestamps: {
        createdAt: toISODateTime(sf.CreatedDate),
        updatedAt: toISODateTime(sf.LastModifiedDate)
    }
}
