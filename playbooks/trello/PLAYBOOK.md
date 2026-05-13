# Trello System Playbook

**System:** Trello (project management boards) | **Maturity:** stub | **Last updated:** 2026-05-12 | **Clients:** cas-industries-customer (1)

## Status: Stub created by Scout. Enriched by Architect after design, completed by CO after delivery.

## API Access

- **Auth:** API Key + Token (per user/workspace)
- **Base URL:** `https://api.trello.com/1/`
- **Auth params:** `key={apiKey}&token={token}` as query params on every request
- **Rate limits:** 100 requests per 10 seconds per token; 300 requests per 10 seconds per API key
- **MuleSoft connector:** No dedicated connector on Exchange — use HTTP connector with API key
- **Developer portal:** https://developer.atlassian.com/cloud/trello/

## Known Quirks (pre-design)

- Trello automations are internal to Trello only — they do NOT emit webhooks by default unless explicitly configured via API
- Webhook registration: POST /1/webhooks — must be configured for each board; callback URL must be reachable from Trello
- Each workspace/board has its own ID — must be captured in project properties
- CAS has automations in Trello that are Trello-internal (confirmed in call: "automations in Trello are specific to Trello; they don't talk to anything else")
- Card lists represent workflow states: for CAS electrical team — New Orders → Ordered → Received → Completed

## Supported Objects (confirmed from call)

- Boards (one per team/use-case at CAS — electrical has own board)
- Lists (workflow state columns)
- Cards (individual orders/jobs)
- Checklists (receiving info within a card)

## Maturity Log

| Date | Client count | Knowledge added | Status |
|------|-------------|-----------------|--------|
| 2026-05-12 | 1 | Initial stub — CAS electrical team Trello board pattern | stub |
