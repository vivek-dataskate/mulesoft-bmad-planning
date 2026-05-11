%dw 2.0
/**
 * build-audit-record.dwl
 * Builds tamper-evident audit log records for regulated/government profiles.
 * Import: import buildAuditRecord, buildAccessAuditRecord from "dwl/build-audit-record.dwl"
 *
 * Audit records are append-only and must never be modified after creation.
 * Fields follow the CEF (Common Event Format) naming convention for SIEM compatibility.
 */
import maskPayload, MASKED_FIELDS from "dwl/pii-mask.dwl"

/**
 * Standard integration event audit record.
 * Use for: data writes, state changes, cross-system synchronisation events.
 *
 * @param correlationId  Mule correlationId — links all events in the same flow invocation
 * @param action         What happened: "CREATE", "UPDATE", "DELETE", "SYNC", "PUBLISH"
 * @param resource       What was affected: "Opportunity/0065000001234", "Customer/CUST-001"
 * @param result         "SUCCESS" or "FAILURE"
 * @param actor          Who/what triggered it: service account name or "SYSTEM"
 * @param payload        The full payload — will be PII-masked before writing
 */
fun buildAuditRecord(
    correlationId: String,
    action: String,
    resource: String,
    result: String,
    actor: String = "SYSTEM",
    payload: Any = null
) = {
    auditId:       correlationId ++ "-" ++ (now() as Number { unit: "milliseconds" } as String),
    correlationId: correlationId,
    timestamp:     now() as String { format: "yyyy-MM-dd'T'HH:mm:ss.SSSZ" },
    environment:   p("mule.env"),
    actor:         actor,
    action:        action,
    resource:      resource,
    result:        result,
    // PII is masked before writing — do NOT store raw PII in audit records
    maskedPayload: if (payload == null) null else maskPayload(payload, MASKED_FIELDS)
}

/**
 * API access audit record — for regulated profiles requiring API access logging.
 * Use for: inbound API calls to Experience APIs.
 *
 * @param method       HTTP method: "GET", "POST", "PUT", "DELETE"
 * @param path         Request path: "/orders/123"
 * @param statusCode   HTTP response status: 200, 400, 500
 * @param clientId     Anypoint client ID of the calling application
 */
fun buildAccessAuditRecord(
    correlationId: String,
    method: String,
    path: String,
    statusCode: Number,
    clientId: String = "UNKNOWN"
) = {
    auditId:       correlationId ++ "-access-" ++ (now() as Number { unit: "milliseconds" } as String),
    correlationId: correlationId,
    timestamp:     now() as String { format: "yyyy-MM-dd'T'HH:mm:ss.SSSZ" },
    environment:   p("mule.env"),
    eventType:     "API_ACCESS",
    actor:         clientId,
    action:        method,
    resource:      path,
    result:        if (statusCode >= 500) "FAILURE" else if (statusCode >= 400) "CLIENT_ERROR" else "SUCCESS",
    statusCode:    statusCode
}
