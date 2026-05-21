# QuickBooks Online System Playbook

**System:** Intuit QuickBooks Online (QBO) | **Maturity:** stub | **Last updated:** 2026-05-13 | **Clients:** agilemind (1)

## Status: Stub created by Scout. Enriched by Architect after design, completed by CO after delivery.

---

## ⚠️ CRITICAL — Online vs. Desktop Distinction

QuickBooks Online (this playbook) is the **cloud product**. It is NOT QuickBooks Desktop/Enterprise.
The MuleSoft `quickbooks-online` connector uses OAuth 2.0 REST API v3 — **QBO only**.
QB Desktop uses QBXML and the Windows Web Connector — see `playbooks/quickbooks-enterprise/quickbooks-enterprise_playbook.md`.

**Always confirm with client:** "Is your QuickBooks hosted by Intuit in the cloud, or installed on a local server/PC?"

---

## API Access Model

- **Connector:** `com.mulesoft.connectors/mule-quickbooks-online-connector 3.0.0` (OAuth 2.0)
- **API:** Intuit QuickBooks Online REST API v3 — `quickbooks.api.intuit.com/v3/company/{realmId}/`
- **Auth:** OAuth 2.0 Authorization Code flow — Company Admin must authorize the app once
- **realmId (Company ID):** Required on every API call. Store in Secrets Manager. Obtained during OAuth consent.
- **Sandbox:** Auto-provisioned per Intuit Developer account. Does NOT share production realmId.
- **App registration:** Must register in Intuit Developer Portal (developer.intuit.com). Generates clientId + clientSecret.

---

## Plan Tier Requirement

| QBO Plan | Inventory Tracking | Required for |
|---|---|---|
| Simple Start | ❌ No | Basic invoicing only |
| Essentials | ❌ No | Basic invoicing only |
| **Plus** | ✅ Yes | Inventory items, QOH tracking, reorder points |
| **Advanced** | ✅ Yes | All Plus features + custom fields, batch processing |

**P0:** QBO inventory integration requires Plus or Advanced plan. Confirm client's plan before scoping inventory flows.

---

## Known Quirks

- **No PUT/PATCH:** QBO API uses POST for all creates AND updates. No PATCH. Updates require the full object. The `SyncToken` (version field) must be included on every update to prevent optimistic locking conflicts.
- **Access token TTL: 60 minutes (hard limit).** For batch flows over 60 min, implement 401-detect → refresh → retry. See FK-017. The MuleSoft QBO connector handles token refresh internally when configured with the refresh token.
- **Refresh token rotation (Nov 2025 Intuit policy):** Refresh tokens may rotate every 24–26 hours. Always update the stored refresh token after each refresh. Use Secrets Manager for storage — not properties files.
- **Rate limits:** 500 req/min per realmId; max 10 concurrent connections; batch endpoint: 120 req/min. For batch flows: set maxConcurrency ≤ 5.
- **realmId on every call:** Do not cache or hardcode. Pull from Secrets Manager at flow start.
- **Query language:** QBO uses Intuit's own SQL-like query language (IQQL), not standard SQL. Example: `SELECT * FROM Invoice WHERE DocNumber = '1001'`
- **Invoice SyncToken:** Must be current. Retrieve object before update to get current SyncToken. Stale SyncToken → 400 error. Always GET → then POST with SyncToken from GET response.
- **Inventory item quantity on hand:** QBO adjusts QOH automatically when invoices are created/voided. Direct QOH adjustment requires an InventoryAdjustment object (not an Item update).

---

## Supported Objects (confirmed from AgileMind engagement)

| Object | GET | POST/Create | POST/Update | Notes |
|--------|-----|-------------|-------------|-------|
| Invoice | ✓ | ✓ | ✓ (full obj + SyncToken) | Primary integration object |
| Customer | ✓ | ✓ | ✓ | Maps to Salesforce Account |
| Item (Inventory) | ✓ | ✓ | ✓ | Plus/Advanced plan required |
| Payment | ✓ | ✓ | — | Track payment status back to Salesforce |
| InventoryAdjustment | — | ✓ | — | Required for direct QOH adjustment |

---

## Key API Endpoints

```
Base URL: https://quickbooks.api.intuit.com/v3/company/{realmId}/

Invoices:
  GET  /invoice/{invoiceId}
  GET  /query?query=SELECT * FROM Invoice WHERE ...
  POST /invoice          (create)
  POST /invoice          (update — full object required, include SyncToken)

Payments:
  GET  /payment/{paymentId}
  GET  /query?query=SELECT * FROM Payment WHERE ...

Items:
  GET  /item/{itemId}
  GET  /query?query=SELECT * FROM Item WHERE Type = 'Inventory'
```

---

## Prerequisites per Engagement

1. QBO account (Plus or Advanced plan) with inventory items already set up in QB
2. Intuit Developer Portal account — clientId + clientSecret registered for DataSkate's app
3. QB Company Admin completes OAuth consent flow (one-time — generates refresh token)
4. realmId stored in Secrets Manager before development begins
5. Salesforce: External ID field `QB_InvoiceId__c` created on Agreement__c object
6. Salesforce: Custom Inventory object created before UC3/UC4 flow build begins

---

## Maturity Log

| Date | Client count | Knowledge added | Status |
|------|-------------|-----------------|--------|
| 2026-05-13 | 1 | Initial stub — agilemind engagement | stub |
