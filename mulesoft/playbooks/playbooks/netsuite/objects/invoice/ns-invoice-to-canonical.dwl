%dw 2.0
/**
 * ns-invoice-to-canonical.dwl
 * NetSuite Invoice (REST API response) → canonical-invoice schema.
 *
 * NOTE: NetSuite invoices are system-generated from Sales Orders.
 * You cannot POST/PUT to create an invoice directly (read-only in terms of creation).
 * Only directional mapping exists: NS Invoice → canonical (no canonical → NS direction).
 *
 * Import:
 *   import nsInvoiceToCanonical from "playbooks/netsuite/objects/invoice/ns-invoice-to-canonical.dwl"
 *
 * Cross-system usage (NetSuite Invoice → Salesforce Opportunity update):
 *   import nsInvoiceToCanonical    from "playbooks/netsuite/objects/invoice/ns-invoice-to-canonical.dwl"
 *   import canonicalToSfOpportunity from "playbooks/salesforce/objects/opportunity/canonical-to-sf-opportunity.dwl"
 *   ---
 *   canonicalToSfOpportunity(nsInvoiceToCanonical(payload))
 *
 * NetSuite Invoice status values:
 *   open, partiallyPaid, paid, overdue, voided, writeOff
 */
import toISODate, toISODateTime from "dwl/canonical-date.dwl"

fun nsInvoiceToCanonical(ns: Object): Object = {
    invoiceId: "NS-INV-" ++ ns.id,

    externalIds: {
        netsuiteInternalId:  ns.id,
        netsuiteExternalId:  ns.externalId default null,
        netsuiteSalesOrderId: (ns.createdFrom.id default null) as String
    },

    customerId: "NS-CUST-" ++ ((ns.entity.id default "UNKNOWN") as String),

    orderId: if (ns.createdFrom.id != null)
                 "NS-SO-" ++ (ns.createdFrom.id as String)
             else null,

    status: (
        (ns.status.id default "") match {
            case "open"            -> "OPEN"
            case "partiallyPaid"   -> "PARTIALLY_PAID"
            case "paid"            -> "PAID"
            case "overdue"         -> "OVERDUE"
            case "voided"          -> "VOID"
            case "writeOff"        -> "WRITTEN_OFF"
            else                   -> "OPEN"
        }
    ),

    invoiceNumber: ns.tranId default null,

    lines: do {
        var lineItems = ns.item.items default []
        ---
        lineItems map (line, i) -> {
            lineId:      (ns.id as String) ++ "-L" ++ (i + 1),
            productId:   (line.item.id default "UNKNOWN") as String,
            description: line.description default null,
            quantity:    line.quantity default 1,
            unitPrice:   line.rate default 0,
            lineTotal:   line.amount default 0,
            taxCode:     (line.taxCode.id default null) as String
        }
    },

    totals: {
        subtotal:   ns.subTotal       default 0,
        discount:   ns.discountTotal  default 0,
        tax:        ns.taxTotal       default 0,
        shipping:   ns.shippingCost   default 0,
        total:      ns.total          default 0,
        amountDue:  ns.amountRemaining default 0,
        currency:   ns.currency.id    default "USD"
    },

    payment: {
        terms:       ns.terms.id      default null,
        dueDate:     toISODate(ns.dueDate      default null),
        paidDate:    toISODate(ns.paidDate     default null),
        paymentRef:  ns.paymentEventResult     default null
    },

    timestamps: {
        createdAt:   toISODateTime(ns.createdDate         default null),
        updatedAt:   toISODateTime(ns.lastModifiedDate    default null),
        invoicedAt:  toISODate(ns.tranDate                default null),
        sentAt:      null
    }
}
