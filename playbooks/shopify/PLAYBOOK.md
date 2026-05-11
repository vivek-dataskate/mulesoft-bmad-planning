# Shopify System Playbook

**System:** Shopify (eCommerce / order management)
**Maturity:** stub — not yet implemented
**Last updated:** 2026-05-11
**Clients using this playbook:** mrn

---

## Status

Stub created by Scout. Enriched by Architect after design, completed by CO after delivery.

## Known quirks (pre-design)

> **CRITICAL (FK-005):** `mule4-shopify-connector v1.1` is registered but uses `http-generic-config.xml` as its configTemplate — indicating it may be a thin wrapper with limited operation coverage. Confirmed from Zyris project: `fulfillment_orders GET` and `fulfillments POST` required HTTP connector fallback with manual OAuth token management (token eviction on 401 is non-negotiable). Architect must verify MRN-required operations against Exchange connector palette before committing to native connector.

> **DESIGN NOTE (MRN):** MRN has two Shopify instances. Global-config.xml must support two separate Shopify connector configs with different credentials. Multi-tenant Shopify connection pattern required.

> **LegitScript certification event:** MRN requires Shopify event (order completion for specific product SKU, or customer tag addition) to trigger a Salesforce field update. Confirm the exact Shopify event type from client (SH3 in intake questionnaire).

## Supported objects

None yet — populated by Architect during MD run.

## Maturity log

| Date | Client count | Knowledge added | Status |
|------|-------------|-----------------|--------|
| 2026-05-11 | 1 | Initial stub created by Scout (MRN engagement) | stub |
