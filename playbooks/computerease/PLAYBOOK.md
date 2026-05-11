# ComputerEase (Deltek) System Playbook
**System:** ComputerEase by Deltek — job costing and accounting system for specialty/residential contractors
**Note:** This is NOT the same as Deltek Costpoint or Vantagepoint (government contractor ERPs). ComputerEase is a Windows-based accounting application for trade contractors (fencing, roofing, HVAC, etc.).
**Maturity:** stub — not yet implemented
**Last updated:** 2026-05-11
**Clients using this playbook:** peerless

---

## Status
Stub created by Scout during Peerless scoping (2026-05-11). Enriched by Architect after design, completed by CO after delivery.

## Known quirks (pre-design)
- **CE Live Service blocker (CRITICAL):** ComputerEase API does NOT expose endpoints directly to the internet. Traffic routes through Deltek's "CE Live Service" installed on the same VM as ComputerEase → Deltek's routing servers → back to the CE application. This is a non-standard connectivity topology unique to legacy Deltek products.
  - CE Live Service must be installed and configured by Deltek support before any integration development can begin.
  - Deltek support ticket submitted by Peerless: Apr 17, 2026. Status unknown as of Scout run.
- **Sandbox API unavailability:** The API is NOT available in the ComputerEase practice/sandbox environment (P3). Only the production environment exposes the API. All development and testing will require controlled access to the production instance with strict GET-only rules until UAT sign-off.
- **Legacy Windows application:** ComputerEase is a DOS-era Windows application hosted on a GCP Windows VM (not a web application). Access during development via Cameo (remote desktop tool). External IP: 135.226.222.18. GCP firewall rules must be configured to allow inbound connections from MuleSoft CloudHub 2.0 static IPs.
- **User management:** Creating CE API users requires logging in with a maintenance user (pw-maintenance) — not from the regular user interface. Jean Jacobs (Peerless accounting admin) is the only full admin.
- **Company code:** Sandbox = P3 (practice). Production company codes: Illinois/Wisconsin = 00 (Home Depot residential = 00-South or 00-ES).
- **API version:** v1.00 (confirmed Apr 17, 2026).
- **Deltek support portal:** Accessible via Jean's credentials. CE support ticket process: file ticket → Deltek emails response within 2–4 hours (longer for legacy/non-cloud versions).
- **Job number format:** `{YY} HD {sequential-number} {sales-rep-initials}` — maintained in a spreadsheet today. MuleSoft must manage a sequence counter (Object Store).
- **Customer number format:** 3-letter prefix from last name + sequential counter (e.g., MUC180). Collision handling required.
- **Date business rules:** Date Open backs to the prior Friday if the processing occurs on a Monday.
- **Field mappings required (complexity high):** CE requires 15+ fields for a complete job record including material codes, department codes, territory codes, overhead codes, commission amounts from a budget worksheet. A complete mapping spreadsheet from Peerless is prerequisite to development.

## Supported objects (pre-design)
TBD — pending CE Live Service configuration and Deltek support confirmation. Based on access group setup (Apr 15), the following were in scope: Jobs, Cost Types, Subcontracts, Job Totals. Customer record creation via API not yet confirmed.

## Auth
- CE API user credentials (username: pw-mate pattern, API access group required)
- Auth format: TBD — confirm with Deltek support when CE Live Service is configured

## Maturity log
| Date | Client count | Knowledge added | Status |
|------|-------------|-----------------|--------|
| 2026-05-11 | 1 | Initial stub created by Scout (Peerless engagement). Critical blocker: CE Live Service required. | stub |
