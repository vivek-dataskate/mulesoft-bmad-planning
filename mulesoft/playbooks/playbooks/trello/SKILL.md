---
name: Trello
description: Trello (project-management boards) integration playbook. No dedicated MuleSoft Exchange connector — integrate via the HTTP connector against the Trello REST API (key + token auth). Covers per-board webhook registration, board/workspace ID capture, and rate limits. Stub maturity; referenced for cas-industries-customer.
maturity: stub
whenToInvoke:
  - A confirmed flow reads from or writes to Trello boards, lists, or cards
  - Configuring Trello API key + token auth (query params on every request)
  - Registering per-board webhooks (POST /1/webhooks) with a reachable callback URL
  - Capturing board/workspace IDs into project properties
  - Building against Trello with the HTTP connector (no Exchange connector available)
coverage:
  objects: [Board, List, Card]
  direction: [inbound, outbound]
  clients: [cas-industries-customer]
  apiVersion: Trello REST API v1
playbook: ./trello_playbook.json
docs: ./trello_playbook.md
---

# Trello Playbook

Invoke when a flow touches Trello. No Exchange connector — use the HTTP connector against https://api.trello.com/1/ with key + token query params. Key quirks: automations don't emit webhooks by default (configure via API); webhooks register per board (POST /1/webhooks) with a reachable callback; board/workspace IDs must be captured in properties; rate limits 100 req/10s per token. Full quirks in the linked JSON; walkthrough in the .md.
