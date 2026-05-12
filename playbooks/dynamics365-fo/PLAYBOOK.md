# Microsoft Dynamics 365 Finance & Operations — System Playbook

**System:** Microsoft Dynamics 365 Finance & Operations (D365 FO / D365FO)
**Maturity:** stub — not yet implemented
**Last updated:** 2026-05-12
**Clients using this playbook:** zyris

---

## Status

Stub created by Scout (Zyris engagement). Enriched by Architect after design, completed by CO after delivery.

## Known quirks (pre-design)

> **CRITICAL (FK-005):** D365 ForOperations connector v3.1.x does **NOT support PATCH** on OData entities. Any update operation requiring PATCH (customer record updates, order status write-back) requires HTTP connector fallback with manual OAuth token management. Token caching pattern: ObjectStore (maxEntries=1, TTL=55 min for 60-min Azure AD tokens); evict on HTTP:UNAUTHORIZED → refresh → retry. This is a confirmed pattern from Zyris project.

> **AUTH:** D365 FO uses OAuth 2.0 with Azure Active Directory. Flow: Client Credentials grant (client_id + client_secret → Azure AD tenant endpoint). Connector registry: `mule-microsoft-dynamics-365-connector 3.1.0 | oauth2-client-credentials`. Token endpoint: `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`. Scope: `https://{d365-hostname}/.default`.

> **API STYLE:** OData v4 REST API. Base URL: `https://{d365-hostname}/data/`. Entities accessed as OData collections: `/data/Customers`, `/data/SalesOrders`, `/data/SalesOrderLines`, etc.

> **PAGINATION (FK-006):** D365 FO OData API returns `@odata.nextLink` for pagination. nextLink is an absolute URL — use it directly for next page. Use recursive sub-flow for < 1000 records; batch scope for > 1000.

> **EXTERNAL ID FIELDS:** D365 FO requires a custom data entity field (or existing field) to store HubSpot Company ID and Shopify Order ID for deduplication. This field must be created by the Zyris FO admin before integration development begins. Confirm: (a) field name for HubSpot ID on Customer entity, (b) field name for Shopify Order ID on SalesOrder entity. Common pattern: extend Customer entity with `HubSpotId` (string 50) and SalesOrder with `ShopifyOrderId` (string 50).

> **UPSERT PATTERN:** D365 FO supports upsert via OData `patch` (with `If-None-Match: *` header for create, or no header for update). Use external ID field for lookup. The native connector supports GET and some POST — for PATCH operations use raw HTTP fallback (see FK-005).

> **ADDRESS NORMALIZATION (Zyris-specific):** Shopify → FO order sync includes complex address normalization logic. Zyris has a flowchart with if-else conditions to find matching D365 customer by normalized address when multiple records share same email. This document is P0 blocker — cannot architect UC2a without it.

> **DATA ENTITIES:** Frequently used D365 FO OData entities for commerce integrations:
>   - `Customers` — customer accounts (GET/PATCH with external ID)
>   - `SalesOrders` — sales order headers (GET/POST/PATCH)
>   - `SalesOrderLines` — sales order line items (GET/POST)
>   - `ReleasedProducts` — product catalog (GET)
>   - `CustomerGroups` — customer tier classification

> **ENVIRONMENTS:** D365 FO typically has separate sandbox (UAT) and production environments with different hostnames. Confirm sandbox hostname and whether it has data representative of production for testing.

## Supported objects

None yet — populated by Architect during MD run.

## Maturity log

| Date | Client count | Knowledge added | Status |
|------|-------------|-----------------|--------|
| 2026-05-12 | 1 | Initial stub created by Scout (Zyris engagement) — pre-design research from D365 FO OData API docs, FK-005 PATCH limitation confirmed | stub |
