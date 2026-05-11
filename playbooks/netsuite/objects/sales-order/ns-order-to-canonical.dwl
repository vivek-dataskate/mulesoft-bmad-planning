%dw 2.0
/**
 * ns-order-to-canonical.dwl
 * NetSuite Sales Order (REST API response) → canonical-order schema.
 *
 * Import:
 *   import nsOrderToCanonical from "playbooks/netsuite/objects/sales-order/ns-order-to-canonical.dwl"
 *
 * Cross-system usage (NetSuite SO → Salesforce Opportunity update):
 *   import nsOrderToCanonical       from "playbooks/netsuite/objects/sales-order/ns-order-to-canonical.dwl"
 *   import canonicalToSfOpportunity from "playbooks/salesforce/objects/opportunity/canonical-to-sf-opportunity.dwl"
 *   ---
 *   canonicalToSfOpportunity(nsOrderToCanonical(payload))
 *
 * NetSuite Sales Order status values:
 *   pendingApproval, pendingFulfillment, partiallyFulfilled, pendingBilling,
 *   pendingBillingPartFulfilled, billed, cancelled, closed
 */
import toISODate, toISODateTime from "dwl/canonical-date.dwl"

fun nsOrderToCanonical(ns: Object): Object = {
    orderId: "NS-SO-" ++ ns.id,

    externalIds: {
        netsuiteInternalId:    ns.id,
        netsuiteExternalId:    ns.externalId default null,
        // Source system ID stored in externalId on create — could be SF Opportunity ID:
        salesforceOpportunityId: if ((ns.externalId default "") startsWith "SF-OPP-")
                                     (ns.externalId replace "SF-OPP-" with "")
                                 else null
    },

    customerId: "NS-CUST-" ++ ((ns.entity.id default ns.entity default "UNKNOWN") as String),

    status: (
        (ns.status.id default ns.status default "") match {
            case "pendingApproval"               -> "SUBMITTED"
            case "pendingFulfillment"            -> "APPROVED"
            case "partiallyFulfilled"            -> "PROCESSING"
            case "pendingBilling"                -> "PROCESSING"
            case "pendingBillingPartFulfilled"   -> "PROCESSING"
            case "billed"                        -> "FULFILLED"
            case "cancelled"                     -> "CANCELLED"
            case "closed"                        -> "CLOSED"
            else                                 -> "DRAFT"
        }
    ),

    channel: "API",

    lines: do {
        var lineItems = ns.item.items default []
        ---
        lineItems map (line, i) -> {
            lineId:      (ns.id as String) ++ "-L" ++ (i + 1),
            productId:   (line.item.id default "UNKNOWN") as String,
            sku:         null,   // NS doesn't return product code in line; enrich separately if needed
            description: line.description default null,
            quantity:    line.quantity default 1,
            unitPrice:   line.rate default 0,
            discount:    line.discount default 0,
            lineTotal:   line.amount default ((line.quantity default 1) * (line.rate default 0)),
            taxCode:     (line.taxCode.id default null) as String
        }
    },

    totals: {
        subtotal: ns.subTotal  default 0,
        discount: ns.discountTotal default 0,
        tax:      ns.taxTotal  default 0,
        shipping: ns.shippingCost default 0,
        total:    ns.total     default 0,
        currency: ns.currency.id default "USD"
    },

    fulfillment: {
        warehouseId:    (ns.location.id default null) as String,
        shipMethod:     ns.shipMethod.id default null,
        trackingNumber: null,    // NS: on FulfillmentRequest, not SalesOrder
        estimatedShipDate: toISODate(ns.shipDate default null)
    },

    billing: {
        billToName:  ns.billAddress.addressee default null,
        line1:       ns.billAddress.addr1 default null,
        city:        ns.billAddress.city  default null,
        state:       ns.billAddress.state default null,
        postalCode:  ns.billAddress.zip   default null,
        country:     ns.billAddress.country.id default null
    },

    timestamps: {
        createdAt:   toISODateTime(ns.createdDate  default null),
        updatedAt:   toISODateTime(ns.lastModifiedDate default null),
        submittedAt: toISODateTime(ns.tranDate     default null),
        closedAt:    null
    }
}
