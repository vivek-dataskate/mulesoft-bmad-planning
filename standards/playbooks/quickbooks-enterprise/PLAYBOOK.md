# QuickBooks Enterprise (Desktop) System Playbook

**System:** Intuit QuickBooks Enterprise / Desktop | **Maturity:** stub | **Last updated:** 2026-05-12 | **Clients:** cas-industries-customer (1)

## Status: Stub created by Scout. Enriched by Architect after design, completed by CO after delivery.

## ⚠️ CRITICAL — Desktop vs. Online Distinction

QuickBooks Enterprise is the **Desktop** product. It is NOT QuickBooks Online (QBO).
The MuleSoft `quickbooks-online` connector (OAuth 2.0 REST API v3) does NOT work with QB Desktop.
**Always confirm with client: "Is your QuickBooks hosted by Intuit in the cloud, or installed locally on a server/PC?"**

## API Access Model

- **QB Desktop/Enterprise:** Uses QBXML format exchanged via Windows Web Connector service
  - Web Connector runs on the QB host machine (Windows only)
  - Your server waits; QB Web Connector polls and sends QBXML requests
  - NOT directly internet-accessible from MuleSoft CloudHub 2.0 without an intermediary
- **QB Online (QBO):** REST API v3 at quickbooks.api.intuit.com — use `quickbooks-online` MuleSoft connector

## Integration Approaches for QB Desktop/Enterprise

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| CData JDBC Driver | Third-party JDBC bridge: MuleSoft DB connector → CData JAR → QBXML | Proven, familiar JDBC pattern | CData license cost; JAR must be in CloudHub shared lib |
| Conductor (conductor.is) | REST API wrapper around QB Desktop SDK | Clean REST interface | Additional SaaS vendor + cost |
| Migrate to QBO | Client upgrades to QuickBooks Online | Eliminates problem; native connector available | Business change, data migration required |
| Direct QBXML/SOAP | MuleSoft WSC connector to client's Web Connector endpoint | No third-party vendor | Requires on-prem relay; Windows only; complex |

## Known Quirks (pre-design)

- Three separate QuickBooks companies (electrical, millwright, fabrication) — each requires separate JDBC/API connection
- No REST API; no sandbox accessible from CloudHub without relay infrastructure
- QuickBooks Desktop updates (version upgrades) can break integrations — warn client re: update coordination
- QBXML requires XML parsing — no JSON; DataWeave XML handling required

## Supported Objects (to confirm)

- Customers
- Vendors
- Jobs (sub-customers in QB model)
- Invoices (AP + AR)
- Purchase Orders
- Bills (AP)
- Employees (payroll context)
- Chart of Accounts

## Maturity Log

| Date | Client count | Knowledge added | Status |
|------|-------------|-----------------|--------|
| 2026-05-12 | 1 | Initial stub — QB Desktop P0 research | stub |
