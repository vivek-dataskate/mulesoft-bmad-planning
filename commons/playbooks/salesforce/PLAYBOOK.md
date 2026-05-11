# Salesforce System Playbook

**System:** Salesforce CRM / Platform  
**Maturity:** observation → verified (updated as clients accumulate)  
**Last updated:** 2026-05-11  
**Clients using this playbook:** leolabs

---

## Design principle

The Salesforce playbook is **object-centric and direction-aware**.
Every supported Salesforce object has:
- A `GET` sub-flow (query via SOQL or CDC) that returns an array of records
- A `POST/PATCH` sub-flow (create or update via REST upsert)
- A `{object}-to-canonical.dwl` that maps FROM Salesforce native format TO the canonical schema
- A `canonical-to-{object}.dwl` that maps FROM the canonical schema TO the Salesforce update body

This means: when any new ERP/system integrates with Salesforce, the Salesforce side is already built.
Only the new system's playbook needs to be created.

```
New integration: Salesforce ↔ SAP
  Salesforce side:  100% reused from this playbook (Account, Opportunity, Contact)
  SAP side:         Build commons/playbooks/sap/ (create once, reused forever)
  Cross-system DWL: sf-opportunity-to-canonical → canonical-to-sap-order (2 imports, no new code)
```

---

## Supported objects

| Object | GET | POST/PATCH | → Canonical | ← Canonical | Maturity |
|--------|-----|-----------|-------------|-------------|---------|
| Account | ✓ | ✓ | → canonical-customer | ← canonical-customer | observation |
| Opportunity | ✓ | ✓ | → canonical-order | ← canonical-order | observation |
| Contact | ✓ | ✓ | → canonical-contact | — | observation |

*Add new objects here as new client requirements arrive. Follow existing object folder pattern.*

---

## System-level components (shared across all objects)

| File | Purpose |
|------|---------|
| `system/sf-auth.xml` | OAuth2 JWT → Bearer token; handles token refresh |
| `system/sf-query.xml` | Generic SOQL paginator (any object, cursor-based) |
| `system/sf-bulk-query.xml` | Bulk API 2.0 async query for > 2,000 records |
| `system/sf-error-codes.dwl` | Translate Salesforce error codes to canonical error codes |

---

## Known system quirks

- **API version pinning:** Always pin (`/services/data/v59.0/`). Never use `/latest/`.
- **SOQL cursor pagination:** Use `nextRecordsUrl`. NEVER use OFFSET — fails silently on > 2,000 records.
- **Bulk API 2.0:** Required for bulk loads. Different endpoint, different async pattern from REST.
- **JWT auth:** Private key in Secrets Manager. Client ID safe in properties. Never swap.
- **External IDs:** Mark `SF_{TargetSystem}_ID__c` as External ID on each synced object. Enables idempotent upsert via externalId endpoint.
- **Rate limiting:** 15,000 API calls/day on Enterprise. Monitor `Sforce-Limit-Info` header. Alert at 12,000 (property: `salesforce.api.limit.warn.threshold`).
- **PATCH semantics:** Only send fields being changed. Sending null erases the field — omit to leave unchanged.
- **CDC vs polling:** CDC (Change Data Capture) preferred over SOQL polling for near-real-time. Subscribe to `ChangeEventHeader` channel.
- **Compound fields:** Address is a compound field in Salesforce — query sub-fields explicitly (`BillingStreet`, `BillingCity`, etc.).
- **BillingCountryCode / ShippingCountryCode:** Only exist when "State and Country Picklists" is enabled in Setup. On orgs without it, these fields throw `FIELD_INTEGRITY_EXCEPTION`. Check at project start. The `canonical-to-sf-account.dwl` function accepts a `useCountryCode` flag — default is `false` (safe free-text `BillingCountry`).
- **CurrencyIsoCode on Account:** Only writable/readable on multi-currency orgs. Single-currency orgs do not expose this field on Account at all. Check at project start. The `canonical-to-sf-account.dwl` function accepts an `isMultiCurrency` flag.
- **Connected App scopes:** Needs `api`, `refresh_token`. For CDC: also `cdp_ingest_api`.

---

## Required properties (all client projects)

```yaml
salesforce.instance.url: https://{org}.salesforce.com
salesforce.api.version: v59.0
salesforce.connected.app.client.id: ${secure::sf.client.id}
salesforce.jwt.private.key: ${secure::sf.jwt.private.key}
salesforce.user.email: integration@client.com
salesforce.api.limit.warn.threshold: 12000
```

---

## Adding a new Salesforce object

1. Create `objects/{object-name}/` folder
2. Copy an existing object folder as template (e.g. `account/`)
3. Implement GET sub-flow: adjust SOQL fields and filters
4. Implement POST/PATCH sub-flow: adjust required fields and upsert key
5. Write `{object}-to-canonical.dwl` mapping
6. Write `canonical-to-{object}.dwl` mapping
7. Add to Supported Objects table above
8. Update maturity log below

---

## Maturity log

| Date | Client | Knowledge added | Status |
|------|--------|----------------|--------|
| 2026-05-11 | leolabs | Auth, SOQL pagination, Opportunity/Account objects, CDC awareness | observation |
| 2026-05-11 | leolabs (Analyst) | CDC trigger for Flow 1 (Opportunity Closed Won) — trigger pattern OPEN (UC1-Q1). State/Country Picklists and multi-currency flags open. SF Connected App not yet created. | observation |

*Second Salesforce client → update Status to `verified`.*
*Third Salesforce client → evaluate promoting stable patterns to MULESOFT_DESIGN_STANDARDS.md.*
