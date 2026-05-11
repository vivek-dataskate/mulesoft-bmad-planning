%dw 2.0
/**
 * canonical-to-ns-order.dwl
 * canonical-order → NetSuite Sales Order REST PUT body.
 *
 * Import:
 *   import canonicalToNsOrder from "playbooks/netsuite/objects/sales-order/canonical-to-ns-order.dwl"
 *
 * Cross-system usage (Salesforce Opportunity → NetSuite Sales Order):
 *   import sfOpportunityToCanonical from "playbooks/salesforce/objects/opportunity/sf-opportunity-to-canonical.dwl"
 *   import canonicalToNsOrder       from "playbooks/netsuite/objects/sales-order/canonical-to-ns-order.dwl"
 *   ---
 *   canonicalToNsOrder(sfOpportunityToCanonical(payload))
 *
 * CLIENT TODO:
 *   - itemNsInternalId: NetSuite item internalId per product line. NS cannot look up items by product
 *     code via REST — you must maintain a product code → NS internalId mapping table per client.
 *     See PLAYBOOK.md "Item matching" quirk.
 *   - subsidiary: Required for OneWorld accounts. Supply netsuite.subsidiary.id from properties.
 *   - taxCode: NS requires internalId of the tax code record, not the tax code name.
 *
 * DO NOT include read-only fields: id, createdDate, lastModifiedDate, status (system-managed).
 * Sending null for a field MAY clear it — use the null-strip pattern at the bottom.
 */
import toISODate from "dwl/canonical-date.dwl"

fun canonicalToNsOrder(canonical: Object, itemMapping: Object = {}, subsidiaryId: String = ""): Object = do {

    // Helper: look up NS item internalId from product mapping table
    // itemMapping = { "SKU-001": "1234", "SKU-002": "5678" }
    fun resolveItemId(line: Object): Object =
        if (line.sku != null and itemMapping[line.sku] != null)
            { id: itemMapping[line.sku] }
        else if (line.productId != null and itemMapping[line.productId] != null)
            { id: itemMapping[line.productId] }
        else
            { id: line.productId default "UNKNOWN" }   // fallback — must be replaced with real internalId

    ---
    {
        // externalId ties this record back to the source system — critical for idempotent upsert
        externalId: canonical.orderId,

        // NS entity = Customer (by internalId stripped from canonical customerId)
        entity: {
            id: canonical.customerId replace "NS-CUST-" with "" replace "SF-ACCT-" with ""
        },

        // Memo = human-readable reference
        memo: "Synced from " ++ (canonical.externalIds.salesforceOpportunityId
                                    default canonical.orderId default "external system"),

        // Transaction date from submittedAt or today
        tranDate: toISODate(canonical.timestamps.submittedAt default now()),

        // Currency
        currency: { id: canonical.totals.currency default "USD" },

        // OneWorld: subsidiary required. Leave blank for single-subsidiary.
        // Populated from property by caller when subsidiaryId is provided.
        (subsidiary: { id: subsidiaryId }) if (subsidiaryId != ""),

        // Shipping
        shipMethod: if (canonical.fulfillment.shipMethod != null)
                        { id: canonical.fulfillment.shipMethod }
                    else null,
        shipDate: toISODate(canonical.fulfillment.estimatedShipDate default null),

        // Line items — each line requires an NS item internalId
        item: {
            items: canonical.lines map (line) -> {
                item:        resolveItemId(line),
                quantity:    line.quantity default 1,
                rate:        line.unitPrice default 0,
                amount:      line.lineTotal default 0,
                description: line.description default null,
                (taxCode: { id: line.taxCode }) if (line.taxCode != null)
            }
        },

        // Billing address (if available)
        (billAddressList: {
            addressee: canonical.billing.billToName default null,
            addr1:     canonical.billing.line1 default null,
            city:      canonical.billing.city  default null,
            state:     canonical.billing.state default null,
            zip:       canonical.billing.postalCode default null,
            (country: { id: canonical.billing.country }) if (canonical.billing.country != null)
        }) if (canonical.billing != null),

        // CLIENT: add custom body fields here:
        // custbody_po_number:     canonical.customFields.poNumber,
        // custbody_project_code:  canonical.customFields.projectCode,
        // custbody_sf_opp_id:     canonical.externalIds.salesforceOpportunityId

    } -- { (k): v if (v == null) }
    // The -- {k:v if null} removes null fields to avoid accidentally clearing NS fields
}
