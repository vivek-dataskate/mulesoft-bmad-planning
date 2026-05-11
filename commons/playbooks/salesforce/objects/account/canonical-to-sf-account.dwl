%dw 2.0
/**
 * canonical-to-sf-account.dwl
 * canonical-customer → Salesforce Account PATCH body.
 *
 * Import:
 *   import canonicalToSfAccount from "playbooks/salesforce/objects/account/canonical-to-sf-account.dwl"
 *
 * Cross-system usage (NetSuite Customer → Salesforce Account update):
 *   import nsCustomerToCanonical from "playbooks/netsuite/objects/customer/ns-customer-to-canonical.dwl"
 *   import canonicalToSfAccount  from "playbooks/salesforce/objects/account/canonical-to-sf-account.dwl"
 *   ---
 *   canonicalToSfAccount(nsCustomerToCanonical(payload))
 *
 * Only includes fields Salesforce allows PATCH on.
 * DO NOT include: Id, CreatedDate, CreatedById, IsDeleted, SystemModstamp — read-only.
 * Sending null for a field CLEARS it — omit fields you don't want to change.
 */

fun canonicalToSfAccount(canonical: Object): Object = {

    Name: canonical.name,

    Type: (canonical.type match {
        case "CUSTOMER"  -> "Customer"
        case "PARTNER"   -> "Partner"
        case "PROSPECT"  -> "Prospect"
        case "RESELLER"  -> "Channel Partner / Reseller"
        else             -> "Customer"
    }),

    // Billing address
    BillingStreet:      canonical.addresses.billing.line1      default null,
    BillingCity:        canonical.addresses.billing.city        default null,
    BillingState:       canonical.addresses.billing.state       default null,
    BillingPostalCode:  canonical.addresses.billing.postalCode  default null,
    BillingCountryCode: canonical.addresses.billing.country     default null,

    // Shipping address
    ShippingStreet:      canonical.addresses.shipping.line1      default null,
    ShippingCity:        canonical.addresses.shipping.city        default null,
    ShippingState:       canonical.addresses.shipping.state       default null,
    ShippingPostalCode:  canonical.addresses.shipping.postalCode  default null,
    ShippingCountryCode: canonical.addresses.shipping.country     default null,

    // Financials
    AnnualRevenue: canonical.financial.annualRevenue default null,

    // Description — append sync note
    Description: "Last synced: " ++ (now() as String { format: "yyyy-MM-dd HH:mm:ss z" }),

    // CLIENT: Add custom field updates here:
    // NetSuite_Customer_ID__c:  canonical.externalIds.netsuiteInternalId,
    // Payment_Terms__c:          canonical.financial.paymentTerms,
    // Credit_Limit__c:           canonical.financial.creditLimit,
    // Customer_Segment__c:       canonical.segment

} -- { (k): v if (v == null) }
// The -- {k:v if null} removes null fields so we don't overwrite SF fields with blank
