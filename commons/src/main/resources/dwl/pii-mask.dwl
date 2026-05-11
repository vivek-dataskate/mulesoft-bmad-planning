%dw 2.0
/**
 * pii-mask.dwl
 * Field-level PII masking for logs, wire tap, and audit records.
 * Import: import maskField, maskPayload, MASKED_FIELDS from "dwl/pii-mask.dwl"
 *
 * Usage in transforms:
 *   import maskPayload, MASKED_FIELDS from "dwl/pii-mask.dwl"
 *   ---
 *   maskPayload(payload, MASKED_FIELDS)
 *
 * Usage for a single field:
 *   import maskField from "dwl/pii-mask.dwl"
 *   ---
 *   maskField("email", "john.doe@example.com")
 */

/**
 * Default set of field names to mask across all payloads.
 * Add project-specific fields by passing a custom list to maskPayload.
 */
var MASKED_FIELDS: Array<String> = [
    "email", "emailAddress", "email_address",
    "phone", "phoneNumber", "phone_number", "mobile", "mobileNumber",
    "ssn", "socialSecurityNumber", "social_security_number", "sin",
    "creditCard", "credit_card", "cardNumber", "card_number", "pan",
    "cvv", "cvc", "securityCode",
    "password", "passwd", "secret", "token", "apiKey", "api_key",
    "dob", "dateOfBirth", "date_of_birth", "birthDate", "birth_date",
    "address", "streetAddress", "street_address", "addressLine1",
    "bankAccount", "bank_account", "iban", "routingNumber",
    "licenseNumber", "passportNumber", "driversLicense"
]

/**
 * Mask a single field value based on the field name and value type.
 * Returns the masked string or "***MASKED***" for types that cannot be pattern-masked.
 */
fun maskField(fieldName: String, value: Any): Any =
    if (value == null) null
    else if ((fieldName lower) contains "email")
        (value as String)[0..2] ++ "***@***.***"
    else if ((fieldName lower) contains "phone" or (fieldName lower) contains "mobile")
        "***-***-" ++ (value as String)[-4..-1]
    else if ((fieldName lower) contains "ssn" or (fieldName lower) contains "sin")
        "***-**-" ++ (value as String)[-4..-1]
    else if ((fieldName lower) contains "card" or (fieldName lower) contains "pan")
        "****-****-****-" ++ (value as String)[-4..-1]
    else if ((fieldName lower) contains "dob" or (fieldName lower) contains "birth")
        "****-**-**"
    else
        "***MASKED***"

/**
 * Recursively masks all matching fields in a payload object.
 * Handles nested objects and arrays.
 * fieldsToMask defaults to MASKED_FIELDS if not provided.
 */
fun maskPayload(payload: Any, fieldsToMask: Array<String> = MASKED_FIELDS): Any =
    payload match {
        case is Object  -> payload mapObject ((value, key) ->
            if (fieldsToMask contains (key as String))
                { (key): maskField(key as String, value) }
            else
                { (key): maskPayload(value, fieldsToMask) }
        )
        case is Array   -> payload map maskPayload($, fieldsToMask)
        case is String  -> payload
        case is Number  -> payload
        case is Boolean -> payload
        else            -> payload
    }
