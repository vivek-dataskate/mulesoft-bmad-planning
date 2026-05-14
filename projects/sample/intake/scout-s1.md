# Scout Session 1 Handoff — Vertex Cloud Solutions — 2026-04-20
**Status:** READY-FOR-SESSION-2

---

## 1. Project Metadata
- Client slug: sample
- Display name: Vertex Cloud Solutions
- Architect: Kailash Chanda <kailash@dataskate.ai>
- Engagement type: new integration | Go-live: 2026-08-01
- Primary contact: Sarah Chen <schen@vertexcloud.io> (VP Revenue Operations)
- AE: Jordan Mills | New to DataSkate: false
- Additional stakeholders: Derek Okafor (Finance Manager — NetSuite owner, Monday reconciliation pain)

---

## 2. Business Vertical
- Industry: B2B SaaS | Vertical slug: commerce (OAGIS 10.x applies to subscription/invoice/customer objects)
- Canonical business objects: Deal (HubSpot), Customer (NetSuite), Subscription (NetSuite), Invoice (NetSuite), Contact/Account (HubSpot)
- Revenue motion: direct sales, 80 new logos/year, $50K–$500K ACV, net-30 terms

---

## 3. Detected Systems
| System | Source | Connector Key | Auth Type | On-premise? | Playbook exists? |
|--------|--------|---------------|-----------|-------------|-----------------|
| HubSpot | Transcript — explicit | hubspot | oauth2 | No (cloud) | Check playbooks/hubspot/ |
| NetSuite | Transcript — explicit | netsuite | oauth2-tba | No (cloud) | Check playbooks/netsuite/ |
| Slack | Transcript — explicit | slack | bot-token | No (cloud) | Check playbooks/slack/ |

---

## 4. Confirmed Use Cases

### UC1: HubSpot Deal → NetSuite Customer + Subscription + Invoice (Create)
- Source: HubSpot (Deal, stage = Closed-Won) → Target: NetSuite (Customer + Subscription + Invoice)
- Direction: unidirectional | Trigger: event-driven (HubSpot webhook on deal stage change) | Pattern: event-driven
- Entity: Customer / Subscription / Invoice
- Evidence: "deal closes in HubSpot — nothing automated — someone on finance logs into NetSuite, creates the customer, subscription, invoice — 48 hours minimum" — Sarah Chen
- Evidence: "we're closing roughly 80 new logos a year — 80 times we're doing this manually" — Derek Okafor
- Complexity: high (three NetSuite objects created in sequence; field mapping across deal → customer → subscription → invoice)
- P0 dependency: HubSpot deal record must have company name, deal value, subscription term as required fields at Closed-Won (Sarah confirmed these are already required)

### UC2: NetSuite Invoice Status → HubSpot Deal (Sync-back)
- Source: NetSuite (Invoice payment status) → Target: HubSpot (Deal record)
- Direction: unidirectional | Trigger: scheduled (15-min poll recommended; NetSuite webhooks require SuiteScript) | Pattern: scheduled-sync
- Entity: Invoice
- Evidence: "account managers live in HubSpot — invoice payment status lives in NetSuite — the only way an AM knows if overdue is if Derek's team tells them" — Sarah Chen
- Evidence: "we've had situations where an AM is on a renewal call and finds out the customer is 90 days overdue — in front of the customer" — Sarah Chen
- Complexity: medium

### UC3: NetSuite Billing Events → Slack Alerts
- Source: NetSuite (Invoice overdue, subscription created, renewal approaching) → Target: Slack (#ops-alerts, #finance-ops, #revenue-ops)
- Direction: unidirectional | Trigger: event-driven | Pattern: event-driven
- Entity: Invoice / Subscription
- Evidence: "there's no systematic alerting — Slack messages about new customers are manual and inconsistent" — Sarah Chen
- Complexity: low

---

## 5. Potential Flows (not confirmed — raise in questionnaire)

### UC4: NetSuite Subscription End Date → HubSpot Renewal Opportunity (Scheduled)
- Evidence: "we've lost two renewals this year because nobody was tracking the 90-day window — the contract end date is in NetSuite, the opportunity needs to be in HubSpot, there's no connection" — Sarah Chen
- Trigger: scheduled (90 days before NetSuite subscription end date)
- Complexity: low-medium
- Note: Sarah raised this as a pain point. Not confirmed in scope but strong signal. Raise as potential flow in intake S7.

---

## 6. P0 Blockers

| P0 | Client action required |
|----|----------------------|
| NetSuite REST Web Services must be enabled | Ask NetSuite admin to enable in Setup > Company > Enable Features > SuiteCloud. Takes ~20 minutes. Derek said admin is responsive — targeting this week. |
| NetSuite OAuth integration record | Admin creates an Integration record under Setup > Integration > Manage Integrations. Provides DataSkate with Client ID + Client Secret. |

---

## 7. Pitch Kit Research

### 7a. Company Profile
- HQ: Austin, TX (inferred from domain + AE territory)
- Revenue estimate: $15M–$25M ARR (80 logos × $200K average ACV)
- Employee count: est. 80–150

### 7b. Nearby Peers
- None found within 100 miles matching B2B SaaS + integration investment signal. nearbyPeers: []

### 7c. Competitor FOMO
- No named company case studies found with public source URLs matching HubSpot + NetSuite + B2B SaaS + AI layer.
- Two industry-stat entries included from MuleSoft 2024 Connectivity Benchmark and Salesforce State of Sales 2024 (both publicly linkable).
- competitorFOMO populated with 1 anonymized client entry + 2 industry benchmarks.

### 7d. Psychology Profile
- Primary: **roi-analytical** (confidence: high)
- Signal phrases matched: "what's the ROI," "48 hours minimum," "lost two renewals," "put a number on it," "payback period," "business case," "deferred ARR recognition"
- Secondary: **operational-pragmatist** (signal: "relay fails at least once a week," "48 hours. Every time.")
- Applied content modifiers: challenge framing opens with the $400K estimate; FOMO leads with savings number before company name; Stage 3 bullets answer specific operational questions, not AI categories.

---

## 8. Architect Knowledge Extracted
- Kailash confirmed HubSpot webhook on deal stage is reliable and fires within seconds of stage change.
- NetSuite REST polling at 15-minute intervals is recommended over webhooks for invoice status — avoids SuiteScript dependency.
- Three NetSuite object creation sequence (customer → subscription → invoice) must handle partial failures — dead-letter queue + retry required on UC1.
- Slack channel names to confirm in intake: #ops-alerts, #finance-ops, #revenue-ops.

---

## 9. Session 1 Outputs Written
| File | Status |
|------|--------|
| `projects/sample/project.json` | ✓ Written |
| `projects/sample/company_context.json` | ✓ Written |

---

**Next:** Session 2 — Questionnaire assembly using company_context.json confirmedFlows + systemFindings.
