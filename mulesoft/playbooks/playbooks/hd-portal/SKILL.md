---
name: HD Portal (Home Depot Service Center)
description: HD Portal (Home Depot Service Center) integration playbook — Home Depot's proprietary lead-management and contract system for Pro contractor partners. No public API docs; access is brokered through the client's HD partner contact. Covers F-number lead identifiers, ~10-minute polling lag, partial existing sync breakage, credential-delivery friction, and lead-quality grading. Stub maturity. In use at peerless.
maturity: stub
whenToInvoke:
  - A confirmed flow reads leads or contracts from HD Portal (e.g. HD Portal -> Salesforce Lead)
  - Designing around the ~10-minute HD Portal polling lag before leads appear downstream
  - Looking up leads by F-number (not a UUID/numeric ID)
  - Planning write-back (POST/PATCH) to HD Portal — write endpoints not yet confirmed
  - Handling HD credential delivery (copy-paste-blocked email) or HD ticketing-based API support
coverage:
  objects: [Lead, Contract]
  direction: [inbound, outbound]
  clients: [peerless]
  apiVersion: proprietary (no public API documentation)
playbook: ./hd-portal_playbook.json
docs: ./hd-portal_playbook.md
---

# HD Portal (Home Depot Service Center) Playbook

Invoke when a flow touches HD Portal — a proprietary Home Depot system with no public API docs; access is brokered through the client's HD contact. Key quirks: leads keyed by F-number; ~10-min polling lag; existing HD -> Salesforce sync partially broken; GET confirmed but writes untested; lead-quality grading means test leads must be flagged and closed out. Full quirks + p0Conditions in the linked JSON; narrative in the .md.
