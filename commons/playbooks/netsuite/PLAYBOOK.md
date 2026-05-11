# NetSuite System Playbook

**System:** NetSuite ERP (REST API + SuiteQL)  
**Maturity:** observation → verified (updated as clients accumulate)  
**Last updated:** 2026-05-11  
**Clients using this playbook:** leolabs

---

## Design principle

The NetSuite playbook is **object-centric and direction-aware** — identical structure to the Salesforce playbook.
Every supported NetSuite record type has:
- A `GET` sub-flow (SuiteQL query with offset pagination)
- A `POST/PATCH` sub-flow (REST upsert using externalId for idempotency)
- A `ns-{object}-to-canonical.dwl` mapping FROM NetSuite native → canonical schema
- A `canonical-to-ns-{object}.dwl` mapping FROM canonical → NetSuite REST request body

When any new CRM/system integrates with NetSuite, the NetSuite side is already built.

---

## CRITICAL: Authentication

**NetSuite REST uses PS256 JWT — NOT RS256.**  
The MuleSoft JWT Module does NOT support PS256.  
Implementation: Nimbus JOSE Java library (see `system/ns-auth.xml`).

This is the most common NetSuite integration blocker. Developers who don't know this
try RS256, get a 401, and spend hours debugging. The auth sub-flow in this playbook
handles it correctly — do not reimplement.

---

## Supported record types

| Record | GET | POST/PATCH | → Canonical | ← Canonical | Maturity |
|--------|-----|-----------|-------------|-------------|---------|
| Customer | ✓ | ✓ | → canonical-customer | ← canonical-customer | observation |
| Sales Order | ✓ | ✓ | → canonical-order | ← canonical-order | observation |
| Invoice | ✓ | — (read-only) | → canonical-invoice | — | observation |

*Add new record types as new client requirements arrive.*

---

## System-level components

| File | Purpose |
|------|---------|
| `system/ns-auth.xml` | PS256 JWT → Bearer token (Nimbus JOSE) |
| `system/ns-query.xml` | Generic SuiteQL paginator (any record type) |
| `system/ns-upsert.xml` | Generic REST upsert (externalId-based) |
| `system/ns-error-codes.dwl` | Translate NetSuite error codes to canonical |

---

## Known system quirks

- **PS256 JWT:** NetSuite requires PS256 (not RS256). See `system/ns-auth.xml`.
- **Internal IDs vs External IDs:** Use `externalId` for idempotent upserts. Set `externalId` to source system record ID (e.g. Salesforce Opportunity ID) on create. Subsequent updates can find the record by `externalId`.
- **SuiteQL limit:** Max 1,000 records per page (hard limit). Use offset pagination.
- **Governance units:** ~5 units per SuiteQL. Default 1,000/slot. Implement backoff when 429 received.
- **Custom fields:** Body fields: `custbody_fieldname`. Line fields: `custcol_fieldname`. Client must provide their exact field names.
- **Multi-subsidiary (OneWorld):** `subsidiary.id` is required on every write. Not present on single-subsidiary accounts. Check at project start.
- **Item matching:** Cannot look up items by product code/name via REST. Need internal ID or externalId. Build item mapping table per client (product code → NS item internalId).
- **Invoice is read-only:** NetSuite invoices are system-generated from Sales Orders. You cannot POST to create an invoice directly. Only update status-related fields on existing invoices.
- **Tax codes:** NetSuite requires internal ID of the tax code record, not the tax code name. Client must provide their tax code internal IDs.
- **Currency:** Must match subsidiary default currency unless multi-currency is enabled.

---

## Required properties (all client projects)

```yaml
netsuite.account.id: 1234567
netsuite.base.url: https://{accountId}.suitetalk.api.netsuite.com/services/rest
netsuite.consumer.key: ${secure::ns.consumer.key}
netsuite.consumer.secret: ${secure::ns.consumer.secret}
netsuite.token.id: ${secure::ns.token.id}
netsuite.token.secret: ${secure::ns.token.secret}
# Optional (OneWorld only):
netsuite.subsidiary.id: 1
```

---

## Adding a new NetSuite record type

1. Create `objects/{record-type}/` folder
2. Implement GET sub-flow using `system/ns-query.xml` pattern
3. Implement POST/PATCH sub-flow using `system/ns-upsert.xml` pattern
4. Write `ns-{record}-to-canonical.dwl`
5. Write `canonical-to-ns-{record}.dwl`
6. Add to Supported record types table above
7. Update maturity log

---

## Maturity log

| Date | Client | Knowledge added | Status |
|------|--------|----------------|--------|
| 2026-05-11 | leolabs | Auth (PS256 discovery), SuiteQL pagination, SO + Invoice + Customer objects | observation |
| 2026-05-11 | leolabs (Analyst) | Confirmed: REST API + HTTP connector used for all 5 flows. SOAP connector not used. OneWorld/subsidiary.id status open (NS-Q2 blocker). Item internal ID mapping dependency confirmed (Flow 2 → Flow 1). TBA credentials pending. | observation |
