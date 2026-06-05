---
name: Intuit QuickBooks Online (QBO)
description: QuickBooks Online (QBO) integration playbook — Intuit's cloud accounting product using OAuth 2.0 REST API v3. Explicitly NOT QuickBooks Desktop/Enterprise (which uses QBXML + Web Connector — see the quickbooks-enterprise playbook). Covers OAuth refresh-token expiry, realmId requirements, customer-before-invoice ordering, batch limits, and webhook verification. Stub maturity. In use at agilemind.
maturity: stub
whenToInvoke:
  - A confirmed flow reads from or writes to QuickBooks Online
  - Confirming the client runs QBO cloud vs. QuickBooks Desktop/Enterprise (different connector + protocol)
  - Configuring QBO OAuth 2.0 (refresh token expires after 100 days of non-use)
  - Creating invoices/items in QBO where a Customer record must pre-exist
  - Handling QBO webhooks (intuit-signature HMAC-SHA256 verification) or batch chunking (30 ops/call)
coverage:
  objects: [Customer, Invoice, Item]
  direction: [inbound, outbound, bidirectional]
  clients: [agilemind]
  apiVersion: REST API v3 (OAuth 2.0)
playbook: ./quickbooks-online_playbook.json
docs: ./quickbooks-online_playbook.md
---

# Intuit QuickBooks Online (QBO) Playbook

Invoke when a flow touches QuickBooks Online. ALWAYS confirm cloud (QBO) vs. Desktop first — different connectors. Key quirks: OAuth refresh token expires after 100 days idle; realmId required on every call; a QB Customer must pre-exist before invoice creation; Batch API caps at 30 ops/call; webhooks use intuit-signature (HMAC-SHA256). Full quirks + p0Conditions in the linked JSON; walkthrough in the .md.
