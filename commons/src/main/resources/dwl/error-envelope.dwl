%dw 2.0
/**
 * error-envelope.dwl
 * Builds the standard integration error envelope.
 * Import: import buildEnvelope, buildValidationEnvelope from "dwl/error-envelope.dwl"
 *
 * Never expose Java stack traces or internal system details in the envelope.
 * errorCode is the MuleSoft error type identifier (e.g. "HTTP:CONNECTIVITY").
 */

/**
 * Standard error envelope for all non-validation errors.
 * Used in: error-handler.xml, common-route-to-dlq-subflow
 */
fun buildEnvelope(error: Object, correlationId: String, failingComponent: String) = {
    correlationId:    correlationId,
    errorCode:        error.errorType.identifier default "UNKNOWN",
    message:          (
        if ((error.errorType.identifier default "") contains "CONNECTIVITY")
            "A downstream system is unavailable. The request has been queued for retry."
        else if ((error.errorType.identifier default "") contains "TIMEOUT")
            "A downstream system did not respond in time. The request has been queued for retry."
        else if ((error.errorType.identifier default "") contains "UNAUTHORIZED")
            "Authentication failed. Check credentials configuration."
        else if ((error.errorType.identifier default "") contains "FORBIDDEN")
            "Access denied by downstream system."
        else
            "An integration error occurred. Contact support with correlationId."
    ),
    timestamp:        now() as String { format: "yyyy-MM-dd'T'HH:mm:ss.SSSZ" },
    failingComponent: failingComponent
}

/**
 * Validation error envelope — for invalid message channel routing.
 * Includes the specific field(s) that failed validation.
 * Used in: invalid-message-channel-route.xml
 */
fun buildValidationEnvelope(validationMessage: String, correlationId: String, failingComponent: String) = {
    correlationId:    correlationId,
    errorCode:        "VALIDATION:INVALID_MESSAGE",
    message:          validationMessage,
    timestamp:        now() as String { format: "yyyy-MM-dd'T'HH:mm:ss.SSSZ" },
    failingComponent: failingComponent,
    resolution:       "Message cannot be retried — fix the source data and resubmit."
}
