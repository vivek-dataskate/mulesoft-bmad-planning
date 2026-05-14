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
- **API port unknown — NOT 443 or 8081:** Confirmed via netstat on the GCP VM (Apr 16, 2026, Brian Cook). CE application is NOT listening on 443 or 8081. Actual API port must be discovered by running `netstat -a` on the production VM (135.226.222.18) and identifying the CE process port. FireWall rules for MuleSoft CloudHub cannot be finalized until port is known.
- **Sandbox API unavailability:** The API is NOT available in the ComputerEase practice/sandbox environment (P3). "Can't access API from practice" message confirmed by both Brian Cook and Jean Jacobs on Apr 17, 2026. Only the production environment exposes the API. All development and testing will require controlled access to the production instance with strict GET-only rules until UAT sign-off.
- **Legacy Windows application:** ComputerEase is a DOS-era Windows application hosted on a GCP Windows VM (not a web application). Access during development via Cameo (remote desktop tool). External IP: 135.226.222.18 (static — confirmed). GCP firewall rules must be configured to allow inbound connections from MuleSoft CloudHub 2.0 static IPs.
- **SECURITY FLAG — GCP VM:** SSH and RDP allowed from 0.0.0.0/0 — flagged as critical security risk by Raghuram Potluri and Brian Cook on Apr 15, 2026. Anyone on the internet can attempt brute-force login. Must be locked down to MuleSoft CloudHub static IPs + Peerless office IPs only. Do not leave open after deployment.
- **User management:** Creating CE API users requires logging in with a maintenance user (pw-maintenance) — not from the regular user interface. Jean Jacobs (Peerless accounting admin) is the only full admin. Single-admin = single point of failure (flagged as risk by Brian Cook Apr 16).
- **Company code:** Sandbox = P3 (practice). Production company codes: Illinois/Wisconsin = 00 (Home Depot residential = 00-South or 00-ES). Department code = 3 for IL and WI.
- **API version:** v1.00 (confirmed Apr 17, 2026).
- **API access group created in production (Apr 15, 2026):** Objects: Jobs, Cost Types, Subcontracts, Job Totals. Payroll and Vendors explicitly excluded per Ashley Salerno.
- **Customer type code:** R05 = Home Depot residential customer type.
- **Deltek support portal:** Accessible via Jean Jacobs' credentials (jeanj@peerlessfence.com). CE support ticket process: file ticket → Deltek emails response within 2–4 hours (longer for legacy/non-cloud versions). Peerless is on a legacy (non-cloud) product tier.
- **Job number format:** `{YY} HD {sequential-number} {sales-rep-initials}` (e.g., "26 HD 565 AS") — maintained in a spreadsheet today. MuleSoft must manage a sequence counter (Object Store). Counter is per state/company-code.
- **Customer number format:** 3-letter prefix from last name + sequential counter (e.g., MUC180). Collision handling required.
- **Date business rules:** Date Open backs to the prior Friday if the processing occurs on a Monday. Approximate start/finish dates on 299B must be Fridays (4th and 6th Friday from contract sign date).
- **Field mappings required (complexity HIGH):** CE requires 15+ fields for a complete job record including material codes (from budget worksheet), department codes, territory codes, overhead codes (HD overhead = 671.15 in test), commission amounts, product type (AL=aluminum, PVC=vinyl), fence description, target price. A complete mapping spreadsheet from Peerless is prerequisite to development.
- **DocHub used for 118 form:** The 118 waiver form is generated, signed, and uploaded via DocHub. DocHub integration is NOT in scope per SOW; this step remains manual.

## Supported objects (pre-design)
TBD — pending CE Live Service configuration and Deltek support confirmation. Based on access group setup (Apr 15), the following were in scope: Jobs, Cost Types, Subcontracts, Job Totals. Customer record creation via API not yet confirmed.

## Auth
- CE API user credentials (username: pw-mate pattern, API access group required)
- Auth format: TBD — confirm with Deltek support when CE Live Service is configured

## Maturity log
| Date | Client count | Knowledge added | Status |
|------|-------------|-----------------|--------|
| 2026-05-11 | 1 | Initial stub created by Scout (Peerless engagement). Critical blocker: CE Live Service required. | stub |
| 2026-05-12 | 1 | Scout deep transcript analysis (Apr 14–17 daily sync calls). Added: port discovery finding (NOT 443/8081), GCP security flag (SSH/RDP open), API access group objects confirmed, customer type R05, date business rules (Fridays), DocHub for 118 form (out of scope), budget worksheet fields, Deltek support ticket filed Apr 17 by Jean Jacobs. | stub |
