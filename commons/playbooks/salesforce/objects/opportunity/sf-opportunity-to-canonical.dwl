%dw 2.0
/**
 * sf-opportunity-to-canonical.dwl
 * Salesforce Opportunity (REST API response) → canonical-order schema.
 *
 * Import:
 *   import sfOpportunityToCanonical from "playbooks/salesforce/objects/opportunity/sf-opportunity-to-canonical.dwl"
 *
 * Cross-system usage pattern (e.g. Salesforce → NetSuite):
 *   import sfOpportunityToCanonical from "playbooks/salesforce/objects/opportunity/sf-opportunity-to-canonical.dwl"
 *   import canonicalOrderToNsOrder  from "playbooks/netsuite/objects/sales-order/canonical-to-ns-order.dwl"
 *   ---
 *   canonicalOrderToNsOrder(sfOpportunityToCanonical(payload))
 *
 * This transform handles STRUCTURAL mapping only.
 * Business rules (which stage triggers sync, custom field values) are client-specific
 * and must be configured in the calling flow's vars before invoking this transform.
 *
 * CLIENT TODO: Add your custom field mappings in the customFields block at the bottom.
 */
import toISODate, toISODateTime from "dwl/canonical-date.dwl"

fun sfOpportunityToCanonical(sf: Object): Object = {
    orderId: "SF-OPP-" ++ sf.Id,

    externalIds: {
        salesforceOpportunityId: sf.Id,
        salesforceAccountId:     sf.AccountId
        // Add target system IDs here as they are synced:
        // netsuiteInternalId: sf.NetSuite_SO_ID__c
    },

    customerId: "SF-ACCT-" ++ (sf.AccountId default "UNKNOWN"),

    status: (
        sf.StageName match {
            case "Closed Won"              -> "APPROVED"
            case "Closed Lost"             -> "CANCELLED"
            case "Proposal/Price Quote"    -> "SUBMITTED"
            case "Value Proposition"       -> "SUBMITTED"
            case "Perception Analysis"     -> "DRAFT"
            case "Needs Analysis"          -> "DRAFT"
            case "Qualification"           -> "DRAFT"
            else                           -> "DRAFT"
        }
    ),

    channel: "API",

    lines: do {
        var lineItems = sf.OpportunityLineItems.records default []
        ---
        if (!isEmpty(lineItems))
            lineItems map (line, i) -> {
                lineId:      line.Id,
                productId:   line.Product2Id default "UNKNOWN",
                sku:         line.Product2.ProductCode default null,
                description: line.Product2.Name default (line.Description default sf.Name),
                quantity:    line.Quantity default 1,
                unitPrice:   line.UnitPrice default 0,
                discount:    line.Discount default 0,
                lineTotal:   line.TotalPrice default (line.Quantity default 1) * (line.UnitPrice default 0),
                taxCode:     null   // CLIENT: map from custom field if needed
            }
        else
            // No line items — create single line from opportunity total
            [{
                lineId:      sf.Id ++ "-L1",
                productId:   "UNKNOWN",
                description: sf.Name,
                quantity:    1,
                unitPrice:   sf.Amount default 0,
                discount:    0,
                lineTotal:   sf.Amount default 0
            }]
    },

    totals: {
        subtotal: sf.Amount default 0,
        discount: 0,
        tax:      0,
        shipping: 0,
        total:    sf.Amount default 0,
        currency: sf.CurrencyIsoCode default "USD"
    },

    timestamps: {
        createdAt:   toISODateTime(sf.CreatedDate),
        updatedAt:   toISODateTime(sf.LastModifiedDate),
        submittedAt: null,
        closedAt:    if (sf.IsClosed default false) toISODateTime(sf.LastModifiedDate) else null
    }

    // CLIENT: Uncomment and populate custom field mappings for this client:
    // ,customFields: {
    //     referenceNumber: sf.Your_Custom_Field__c,
    //     projectCode:     sf.Project_Code__c,
    //     poNumber:        sf.PO_Number__c
    // }
}
