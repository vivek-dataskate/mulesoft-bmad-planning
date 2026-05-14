# Scout Session 2 Handoff — Vertex Cloud Solutions — 2026-04-22
**Status:** READY-FOR-SESSION-3A

---

## 1. Session 2 Inputs Loaded

| Input | File | Key Fields Consumed |
|-------|------|---------------------|
| Project context | `projects/sample/project.json` | client, architect, architectEmail, flowCount |
| Confirmed flows | `projects/sample/company_context.json` | confirmedFlows[], systemFindings[], psychologyProfile |
| HubSpot playbook | `playbooks/hubspot/PLAYBOOK.md` | Auth model (Private App token), deal stage webhook, supported objects |
| NetSuite playbook | `playbooks/netsuite/PLAYBOOK.md` | REST API requirements, OAuth 2.0 TBA, subscription object schema |
| Slack playbook | `playbooks/slack/PLAYBOOK.md` | Bot token auth, channel posting API |

---

## 2. Questionnaire Sections Generated

| Section | ID | Questions Generated | Pre-filled from Transcript |
|---------|----|--------------------|-----------------------------|
| Use Cases | S01 | 8 | 5 |
| Systems and Connectivity | S02 | 7 | 0 |
| Testing and Go-Live | S03 | 4 | 1 |

Total questions: **19** | Required (marked `*`): **11** | Pre-filled: **6**

---

## 3. Pre-Fill Decisions (Transcript → Questionnaire)

| Q# | Field | Pre-filled Value | Source |
|----|-------|------------------|--------|
| q-01 | HubSpot deal stage trigger | `Closed Won` | Sarah: "rep marks it Closed-Won" |
| q-03 | NetSuite write-back properties | `netsuite_subscription_id, netsuite_invoice_id, netsuite_customer_id` | Kailash architecture note |
| q-04 | Invoice sync frequency | `Hourly` | Architect recommendation (15-min poll) |
| q-07 | Slack channels | `#ops-alerts — confirm. Overdue: #revenue-ops?` | Sarah: "#revenue-ops channel" |
| q-08 | Billing event types | `All of the above — confirm` | Sarah + Kailash: sub created, overdue, renewal |
| q-16 | Go-live target | `September 2026` | Kailash: "live before August" (tightened to confirmed Aug 1) |

---

## 4. Internal Architect Flags Embedded

| Flag | Content |
|------|---------|
| Auth model | HubSpot = Private App token (no OAuth callback); NetSuite = OAuth 2.0 TBA; credentials in CloudHub Secrets Manager |
| P0 gate | Both P0 blockers must be resolved before architecture kickoff; timeline slips if pending |
| Idempotency | Use HubSpot Deal ID as external ID on NetSuite Subscription to prevent duplicate creation on re-trigger |
| Buyer profile | roi-analytical (primary) + operational-pragmatist (secondary); challenge framing uses 48-hour lag number |

---

## 5. Scope Grid Decisions (per UC)

### UC1 — HubSpot Deal → NetSuite Subscription + Invoice
- **In scope:** Event-driven deal→subscription creation; NS subscription ID written back; deal line items → NS subscription items
- **Assumed pre-exists:** NetSuite Customer matchable by email domain; custom HubSpot properties created before dev starts
- **Out of scope:** NetSuite credit checks or approval workflows; creating HubSpot line item objects from scratch

### UC2 — NetSuite Invoice Status → HubSpot Deal
- **In scope:** Scheduled NS→HubSpot invoice status sync; overdue flag update; optional HubSpot task creation
- **Assumed pre-exists:** HubSpot deal linked to NS subscription via netsuite_subscription_id (written in UC1)
- **Out of scope:** Sending invoice PDFs to HubSpot; creating HubSpot workflows (client manages those)

### UC3 — NetSuite Billing Events → Slack
- **In scope:** Subscription created, invoice overdue, renewal approaching → formatted Slack messages with NS record link
- **Assumed pre-exists:** Slack workspace app with bot token available; target channels exist
- **Out of scope:** Interactive Slack commands; writing back to NetSuite from Slack actions

---

## 6. Playbook Findings Surfaced in Questionnaire

**HubSpot (from playbook):**
- Private App token is the correct auth model — no OAuth callback required; simpler than OAuth2
- Webhook on deal stage change fires within seconds of transition (confirmed by Kailash in S1)
- Required HubSpot scopes: `crm.objects.deals.read`, `crm.objects.deals.write`, `crm.objects.contacts.read`, `crm.objects.companies.read`

**NetSuite (from playbook):**
- REST Web Services must be enabled via Setup → Company → Enable Features → SuiteCloud
- OAuth 2.0 TBA requires Integration record in Setup → Integration → Manage Integrations
- Subscription object in NetSuite supports `externalId` field — use HubSpot Deal ID for idempotency
- Polling interval: 15-minute minimum recommended for invoice status; 60-minute acceptable for Vertex volume (80 deals/year)

**Slack (from playbook):**
- Bot token (`xoxb-...`) with `chat:write` scope is sufficient for posting
- Channel must be specified by channel ID (not name) in API calls — confirm channel IDs at field mapping session

---

## 7. Session 2 Output Written

| File | Status |
|------|--------|
| `projects/sample/intake/intake-questionnaire-sample.md` | ✓ Written |
| `projects/sample/intake/intake-content.json` | ✓ Written |
| HTML render: `intake-questionnaire-sample.html` | ✓ Built via `fill-template.js intake sample` |

---

**Next:** Session 3a — Proposal assembly using `company_context.json` (confirmedFlows, psychologyProfile, competitorFOMO) → `proposal-content.json`.
