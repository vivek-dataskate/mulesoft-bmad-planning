%dw 2.0
/**
 * canonical-to-sf-opportunity.dwl
 * canonical-order → Salesforce Opportunity PATCH body.
 * Used when updating Salesforce after processing in a downstream system.
 *
 * Import:
 *   import canonicalToSfOpportunity from "playbooks/salesforce/objects/opportunity/canonical-to-sf-opportunity.dwl"
 *
 * Cross-system usage (e.g. NetSuite Invoice → Salesforce Opportunity update):
 *   import nsInvoiceToCanonical    from "playbooks/netsuite/objects/invoice/ns-invoice-to-canonical.dwl"
 *   import canonicalToSfOpportunity from "playbooks/salesforce/objects/opportunity/canonical-to-sf-opportunity.dwl"
 *   ---
 *   canonicalToSfOpportunity(nsInvoiceToCanonical(payload))
 *
 * Only includes fields Salesforce allows PATCH on.
 * Do NOT include: Id, CreatedDate, CreatedById, IsDeleted, SystemModstamp — they are read-only.
 * Sending null for a field CLEARS it — omit fields you don't want to change.
 */

fun canonicalToSfOpportunity(canonical: Object): Object = {
    // Update StageName based on canonical status
    StageName: (
        canonical.status match {
            case "APPROVED"    -> "Closed Won"
            case "CANCELLED"   -> "Closed Lost"
            case "SUBMITTED"   -> "Proposal/Price Quote"
            case "PROCESSING"  -> "Negotiation/Review"
            case "FULFILLED"   -> "Closed Won"
            else               -> null  // null = don't update StageName
        }
    ),

    // Update amount if changed downstream (e.g. ERP adjusted order total)
    Amount: canonical.totals.total default null,

    // Description — append sync note
    Description: "Last synced: " ++ (now() as String { format: "yyyy-MM-dd HH:mm:ss z" }),

    // CLIENT: Add custom field updates here:
    // NetSuite_SO_ID__c:     canonical.externalIds.netsuiteInternalId,
    // Invoice_Status__c:     canonical.status,
    // Invoice_Due_Date__c:   canonical.timestamps.dueAt,
    // ERP_Order_Number__c:   canonical.externalIds.erpOrderNumber
} -- { (k): v if (v != null) }
// The -- {k:v if null} removes null fields from the output so we don't overwrite SF fields with blank
