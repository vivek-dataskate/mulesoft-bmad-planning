# Paylocity System Playbook

**System:** Paylocity (HR / Payroll / Time & Labor) | **Maturity:** stub | **Last updated:** 2026-05-12 | **Clients:** cas-industries-customer (1)

## Status: Stub created by Scout. Enriched by Architect after design, completed by CO after delivery.

## ⚠️ ACCESS GATING — Submit Form Before Kickoff

Paylocity API access requires a formal **Web Services Access Request Form** signed by an authorized Paylocity client contact.
Approval is multi-week. Submit immediately at project kickoff — this is a critical path item.
Upon approval: Paylocity provides OAuth 2.0 Client ID + Secret + sandbox access.

## API Access

- **Auth:** OAuth 2.0 Client Credentials (Bearer token)
- **Base URL:** `https://api.paylocity.com/api/v2/`
- **Token endpoint:** `https://api.paylocity.com/IdentityServer/connect/token`
- **Sandbox:** Provisioned by Paylocity after form approval — not self-service
- **Developer portal:** https://developer.paylocity.com
- **MuleSoft connector:** No dedicated connector on Exchange — use HTTP connector with OAuth2 Client Credentials config

## Known Quirks (pre-design)

- Access request form must list specific endpoints — prepare endpoint list before submitting
- Rate limits not publicly documented — confirm during Paylocity onboarding call
- Webhooks available (must be listed in access request form if needed)
- Company ID is required on all API calls (`paylocity.companyId` property)

## Supported Objects (to confirm)

- Employees (profile, status, position)
- Pay codes
- Time and Labor (clock-in, time cards, hours by pay period)
- Earnings / Deductions
- Jobs / Cost Centers (labor cost allocation by job number)

## Maturity Log

| Date | Client count | Knowledge added | Status |
|------|-------------|-----------------|--------|
| 2026-05-12 | 1 | Initial stub — access form requirement research | stub |
