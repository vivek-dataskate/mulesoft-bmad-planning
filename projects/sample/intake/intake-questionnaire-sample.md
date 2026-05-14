# Vertex Cloud Solutions × DataSkate — Integration Discovery Questionnaire
**Generated:** 2026-04-22 | **Architect:** Kailash Chanda | **Go-live target:** 2026-08-01
**Systems:** HubSpot · NetSuite · Slack | **Flows in scope:** 3

---

> **How to use this document**
> Required questions are marked with `*`. Pre-filled answers (sourced from your April 18 discovery session) are shown in `[brackets]` — confirm or correct them. Leave blank if unknown; DataSkate will follow up.
> The HTML version of this questionnaire (`intake-questionnaire-sample.html`) has pill-selectors and auto-saves to DataSkate's intake system.

---

## P0 Blockers (Must Resolve Before Week 1)

- [ ] **HubSpot Private App Authorization** — A HubSpot Private App token with read/write access to Deals, Contacts, Companies, and Custom Properties must be created by a HubSpot Super Admin. DataSkate provides the required scope list. *Owner: Vertex HubSpot admin.*

- [ ] **NetSuite REST API + OAuth 2.0 Setup** — NetSuite REST Web Services must be enabled and an OAuth 2.0 integration record created by a NetSuite admin. DataSkate provides step-by-step setup instructions. Credentials stored in CloudHub Secrets Manager. *This is a hard blocker — no architecture work can begin until confirmed. Owner: Vertex NetSuite admin (Derek confirmed admin is responsive — targeting this week).*

---

## Section 1 — Use Cases

### UC-1: HubSpot Closed-Won Deal → NetSuite Subscription + Invoice (Event-Driven)

Triggered when a HubSpot deal moves to Closed-Won. Creates a NetSuite customer (if not exists), subscription, and first invoice from the deal line items. NetSuite subscription ID written back to HubSpot deal as an external reference property.

**Q1.** What is the exact HubSpot deal stage value that triggers subscription creation in NetSuite? `*`
*"Closed Won" was referenced in the discovery session — confirm the exact pipeline stage name.*
> Pre-filled: `Closed Won`
> Your answer: _______________

**Q2.** If a NetSuite subscription already exists for this HubSpot deal (re-trigger scenario), what should happen? `*`
- [ ] Skip — leave existing subscription unchanged
- [ ] Update the existing subscription
- [ ] Create a new subscription regardless
> Your answer: _______________

**Q3.** Which HubSpot deal properties should be written back after the NetSuite subscription is created?
*From the session: NetSuite subscription ID, subscription status, and invoice ID were mentioned. Confirm or update the list.*
> Pre-filled: `netsuite_subscription_id (custom), netsuite_invoice_id (custom), netsuite_customer_id (custom) — confirm or correct HubSpot property names`
> Your answer: _______________

**Scope clarification (UC-1):**
- In scope: event-driven deal→subscription creation; NS subscription ID written back; deal line items → NS subscription items
- Assumed pre-exists: NetSuite Customer matchable to HubSpot Company by email domain; custom HubSpot properties created before dev starts
- Out of scope: NetSuite credit checks or approval workflows; creating HubSpot line item objects from scratch

---

### UC-2: NetSuite Invoice Status → HubSpot Deal (Scheduled Sync)

Scheduled pull of NetSuite invoice payment status into HubSpot deal records. Enables account managers to see billing health (Paid, Overdue, Partial) in HubSpot without running NetSuite reports.

**Q4.** How frequently should invoice payment status sync from NetSuite to HubSpot? `*`
- [ ] Every 15 minutes
- [ ] Hourly
- [ ] Daily (end of day)
> Pre-filled: `Hourly`
> Your answer: _______________

**Q5.** Which HubSpot deal property should store the invoice payment status (e.g. Paid, Overdue, Partial)? `*`
*If this property does not exist yet, DataSkate can provide the field spec for your HubSpot admin to create it.*
- [ ] `invoice_payment_status` (create new)
- [ ] Existing property — specify below
> Your answer: _______________

**Q6.** Should overdue invoices (30+ days) automatically create a HubSpot task or update the deal owner?
- [ ] Yes — create a HubSpot task on 30-day overdue
- [ ] No — property update only, HubSpot workflows handle the rest
> Your answer: _______________

**Scope clarification (UC-2):**
- In scope: scheduled NS→HubSpot invoice status sync; overdue flag update; optional HubSpot task creation on overdue
- Assumed pre-exists: HubSpot deal matched to NS subscription via `netsuite_subscription_id` written in UC-1
- Out of scope: sending invoice PDFs to HubSpot; creating HubSpot workflows (client manages those)

---

### UC-3: NetSuite Billing Events → Slack Notifications (Event-Driven)

Key billing events in NetSuite — subscription created, invoice overdue, renewal approaching — trigger formatted Slack messages to designated channels. Eliminates the need for anyone to monitor a NetSuite dashboard.

**Q7.** Which Slack channels should receive billing event notifications? `*`
*From the session: #ops-alerts was mentioned. Confirm channel name and whether overdue + renewal events go to the same channel or separate ones.*
> Pre-filled: `#ops-alerts — confirm. Overdue invoices: same channel or separate (e.g. #revenue-ops)?`
> Your answer: _______________

**Q8.** Which billing events should trigger Slack notifications? `*`
- [ ] Subscription created
- [ ] Invoice overdue (30 days)
- [ ] Renewal approaching (90 days)
- [ ] All of the above
> Pre-filled: `All of the above — confirm or remove any events not needed`
> Your answer: _______________

**Scope clarification (UC-3):**
- In scope: subscription created, invoice overdue, renewal approaching events → formatted Slack messages with NetSuite record link
- Assumed pre-exists: Slack workspace app with incoming webhook or bot token available; target channels exist
- Out of scope: interactive Slack commands (e.g. /lookup invoice); writing back to NetSuite from Slack actions

---

## Section 2 — Systems and Connectivity

### 2A — HubSpot

**Q9.** Which HubSpot subscription tier is Vertex on?
- [ ] Sales Hub Professional
- [ ] Sales Hub Enterprise
- [ ] Operations Hub (separate)
> Your answer: _______________

**Q10.** Is there a HubSpot developer test portal (sandbox) DataSkate can use for integration testing? `*`
- [ ] Yes — developer test portal available
- [ ] No — testing against production (requires careful coordination)
- [ ] Unknown
> Your answer: _______________

### 2B — NetSuite

**Q11.** Who is the NetSuite administrator who will create the OAuth 2.0 integration record and enable REST Web Services? `*`
*DataSkate provides step-by-step setup instructions — takes approximately 20 minutes.*
> Your answer: _______________

**Q12.** Is NetSuite REST Web Services currently enabled in your account? `*`
*Found under: Setup → Company → Enable Features → SuiteCloud → REST Web Services.*
- [ ] Yes — already enabled
- [ ] Not enabled — IT can enable it
- [ ] Unknown
> Your answer: _______________

**Q13.** Is there a NetSuite sandbox account DataSkate can use for development and testing? `*`
- [ ] Yes — sandbox available
- [ ] No — development against production (risk: increased coordination overhead)
- [ ] Unknown
> Your answer: _______________

### 2C — Slack

**Q14.** What is the Slack workspace name DataSkate will post to?
> Your answer: _______________

**Q15.** Does Vertex have an existing Slack app or bot DataSkate can use, or should DataSkate set up a new one?
- [ ] Use an existing bot — provide token separately
- [ ] DataSkate sets up a new Slack app
> Your answer: _______________

---

## Section 3 — Testing and Go-Live

**Q16.** The discovery session referenced a go-live target before the new AE class is fully ramped. Is the target still August 2026? `*`
- [ ] August 2026 confirmed
- [ ] Earlier — specify below
- [ ] September is fine — specify below
> Pre-filled: `August 2026 — confirm exact date target if possible`
> Your answer: _______________

**Q17.** Who from Vertex will serve as the primary testing contact and UAT sign-off approver? `*`
> Your answer: _______________

**Q18.** Are there any production deployment freeze windows DataSkate should be aware of?
*e.g. no deploys during month-end close (last 3 business days), no deploys during board reporting window.*
> Your answer: _______________

**Q19.** For UAT: will Vertex be testing with synthetic (fake) deal data in HubSpot, or with real historical deals cloned to a sandbox?
- [ ] Synthetic test deals in HubSpot test portal
- [ ] Real deal data in a HubSpot sandbox
- [ ] To be determined
> Your answer: _______________

---

## For DataSkate Use Only — Internal Architect Flags

1. **Auth model:** HubSpot = Private App token (no OAuth callback required — simplest path). NetSuite = OAuth 2.0 token-based auth (TBA). All credentials in CloudHub Secrets Manager, rotated every 90 days.

2. **P0 gate:** Both P0 blockers must be confirmed resolved before architecture kickoff. If HubSpot app token or NS REST API setup is pending at discovery start, project timeline slips accordingly.

3. **Deal→Subscription idempotency:** Use HubSpot Deal ID as the external ID on the NetSuite Subscription record to prevent duplicate creation on re-trigger. Confirm that NetSuite supports `externalId` on Subscription records (it does — confirm with NS admin at field mapping session).

4. **Buyer profile detected:** roi-analytical (primary) + operational-pragmatist (secondary). Challenge framing uses the 48-hour lag number. Journey Stage 1 items lead with specific stopped behaviors. ROI section included in proposal.

---

*Questionnaire generated by Scout Session 2 · 2026-04-22 · Source: discovery session 2026-04-18*
*HTML render: `node commons/branding/fill-template.js intake sample`*
