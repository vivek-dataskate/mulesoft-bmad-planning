%dw 2.0
/**
 * canonical-date.dwl
 * Normalises any date string to canonical ISO 8601 or epoch milliseconds.
 * Import: import toISODate, toISODateTime, toEpochMs, fromEpochMs from "dwl/canonical-date.dwl"
 *
 * Handles null safely — returns null for null input.
 *
 * Recognised input formats:
 *   ISO 8601:      "2024-01-15", "2024-01-15T14:30:00Z", "2024-01-15T14:30:00-05:00"
 *   US date:       "1/15/2024", "01/15/2024"
 *   Compact:       "20240115"
 *   Epoch ms:      1705316400000 (Number)
 *   Salesforce:    "2024-01-15T14:30:00.000+0000"
 *   NetSuite:      "1/15/2024" (US format), "01/15/2024 14:30:00"
 */

/**
 * Returns canonical ISO date string "yyyy-MM-dd" or null.
 */
fun toISODate(input: Any): String | Null =
    if (input == null or input == "") null
    else if (input is Number)
        (input as DateTime { unit: "milliseconds" }) as Date as String
    else
        do {
            var s = input as String
            ---
            if (s matches /^\d{4}-\d{2}-\d{2}(T.*)?$/)
                s[0..9]  // Already ISO — just take date part
            else if (s matches /^\d{1,2}\/\d{1,2}\/\d{4}/)
                do {
                    var parts = s splitBy "/"
                    ---
                    parts[2][0..3] ++ "-" ++ (if (sizeOf(parts[0]) == 1) "0" ++ parts[0] else parts[0])
                                   ++ "-" ++ (if (sizeOf(parts[1]) == 1) "0" ++ parts[1] else parts[1])
                }
            else if (s matches /^\d{8}$/)
                s[0..3] ++ "-" ++ s[4..5] ++ "-" ++ s[6..7]
            else
                null  // Unrecognised format — return null, caller must handle
        }

/**
 * Returns canonical ISO datetime string "yyyy-MM-dd'T'HH:mm:ss.SSSZ" or null.
 */
fun toISODateTime(input: Any): String | Null =
    if (input == null or input == "") null
    else if (input is Number)
        (input as DateTime { unit: "milliseconds" }) as String { format: "yyyy-MM-dd'T'HH:mm:ss.SSSZ" }
    else
        do {
            var s = input as String
            ---
            if (s matches /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
                // Normalise Salesforce "+0000" to "Z"
                s replace /\+0000$/ with "Z"
            else if (s matches /^\d{4}-\d{2}-\d{2}$/)
                s ++ "T00:00:00.000Z"
            else
                null
        }

/**
 * Returns epoch milliseconds (Number) from any date input, or null.
 */
fun toEpochMs(input: Any): Number | Null =
    if (input == null or input == "") null
    else if (input is Number) input
    else
        do {
            var iso = toISODateTime(input)
            ---
            if (iso == null) null
            else (iso as DateTime { format: "yyyy-MM-dd'T'HH:mm:ss.SSSZ" }) as Number { unit: "milliseconds" }
        }

/**
 * Returns ISO date string from epoch milliseconds, or null.
 */
fun fromEpochMs(epochMs: Number | Null): String | Null =
    if (epochMs == null) null
    else (epochMs as DateTime { unit: "milliseconds" }) as String { format: "yyyy-MM-dd'T'HH:mm:ss.SSSZ" }
