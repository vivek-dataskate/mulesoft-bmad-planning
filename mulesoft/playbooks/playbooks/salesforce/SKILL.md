---
name: Salesforce CRM / Platform
description: Salesforce CRM/Platform integration playbook. Covers JWT auth, SOQL cursor pagination, Bulk API 2.0, external-ID upsert patterns, and daily API limits. The most-used playbook in the library (verified across four clients) and the basis for AgentForce-readiness framing when Salesforce is detected. In use at leolabs, mrn-healthcare, cherish-care, peerless.
maturity: verified
whenToInvoke:
  - A confirmed flow reads from or writes to Salesforce (Account, Contact, Opportunity, or custom objects)
  - Configuring Salesforce JWT auth or pinning an API version (/services/data/vNN.0/)
  - Designing SOQL pagination (use nextRecordsUrl, never OFFSET) or Bulk API 2.0 loads
  - Setting up SF_{TargetSystem}_ID__c external-ID fields for idempotent upserts
  - flo.json flags.salesforceDetected = true and AgentForce Stage-3 framing applies
coverage:
  objects: [Account, Contact, Opportunity]
  direction: [inbound, outbound, bidirectional]
  clients: [leolabs, mrn-healthcare, cherish-care, peerless]
  apiVersion: pinned per project (e.g. v59.0)
playbook: ./salesforce_playbook.json
docs: ./salesforce_playbook.md
---

# Salesforce CRM / Platform Playbook

Invoke when a flow touches Salesforce. Key quirks: pin the API version (never /latest/), use nextRecordsUrl cursor pagination (OFFSET fails silently past 2,000 rows), Bulk API 2.0 for bulk loads, JWT private key in Secrets Manager, External-ID fields for upserts, and the 15,000 calls/day Enterprise limit (watch the Sforce-Limit-Info header). Load the linked JSON for the full knownQuirks + p0Conditions and the .md for the walkthrough. Per-object detail (Account, Contact, Opportunity) lives under ./objects/.
