# HD Portal (Home Depot Service Center) System Playbook
**System:** Home Depot Service Center (HD Portal) — Home Depot's proprietary lead management and contract system for Pro contractor partners
**Maturity:** stub — not yet implemented
**Last updated:** 2026-05-11
**Clients using this playbook:** peerless

---

## Status
Stub created by Scout during Peerless scoping (2026-05-11). Enriched by Architect after design, completed by CO after delivery.

## Known quirks (pre-design)
- HD Portal is a Home Depot proprietary system — no public API documentation. API credentials and access are brokered through the client's HD partner contact (Marius / Greg).
- GET operations confirmed via API during discovery calls (Apr 14, 2026). Write endpoints (POST/PATCH) not yet tested — required for UC2 (Salesforce corrections → HD Portal).
- HD Portal login for sandbox/test environment requires creation by the Peerless account manager (Ashley Salerno), not the tech team.
- API support is through a ticketing system managed by a specific HD contact (Greg). Response times variable — not a traditional developer-facing API program.
- Leads appear in HD Portal first; there is approximately 10-minute polling lag before they appear in connected systems.
- Contracts (299A, 299B, 118) are PDF documents stored in HD Portal, accessible by lead number. Document download endpoint not yet confirmed.
- Lead status values observed: "Final" (signed, ready for processing). Other status values unknown — require discovery.
- HD Portal grades Peerless on lead quality — test leads must be labeled "Peerless test" and closed out properly after testing.

## Supported objects (pre-design)
- Leads (read confirmed)
- Documents / Contracts (read assumed — endpoint not confirmed)
- Quotes (read assumed)
- Order/Job status (read assumed)
- Write objects: TBD — pending write endpoint confirmation

## Auth
- API key authentication (key received from Marius)
- Separate keys per environment recommended — confirm with HD Portal team
- Auth format unknown (header vs. query param) — confirm during discovery

## Maturity log
| Date | Client count | Knowledge added | Status |
|------|-------------|-----------------|--------|
| 2026-05-11 | 1 | Initial stub created by Scout (Peerless engagement) | stub |
