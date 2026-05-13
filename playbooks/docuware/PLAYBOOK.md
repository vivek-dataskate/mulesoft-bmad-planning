# DocuWare System Playbook

**System:** DocuWare (document management) | **Maturity:** stub | **Last updated:** 2026-05-12 | **Clients:** cas-industries-customer (1)

## Status: Stub created by Scout. Not scoped as integration target in current CAS engagement (document storage only).

## API Access

- **Auth:** Token-based (Cookie/Bearer via Platform Service)
- **Base URL:** `https://{tenant}.docuware.cloud/DocuWare/Platform/`
- **REST API docs:** https://developer.docuware.com/rest/index.html
- **MuleSoft connector:** No dedicated connector on Exchange — use HTTP connector; REST Connect can generate from OpenAPI spec if available
- **Developer portal:** https://developer.docuware.com

## CAS Usage Context

DocuWare is used by CAS for:
- Storing AP invoices + packing slips after processing through QuickBooks
- Storing AR invoices after project completion
- Indexed by job number — enables document retrieval by job

CAS currently uses DocuWare as an **archive** only (replacing physical filing cabinets). Not scoped as an active integration source in current engagement.

## Known Quirks (pre-design)

- Not currently in integration scope for CAS; document retrieval by job number could be a future flow
- DocuWare Cloud vs. DocuWare On-Premise have different API endpoints
- Postman collections available from DocuWare for quick start

## Maturity Log

| Date | Client count | Knowledge added | Status |
|------|-------------|-----------------|--------|
| 2026-05-12 | 1 | Initial stub — CAS document storage context; not in current scope | stub |
