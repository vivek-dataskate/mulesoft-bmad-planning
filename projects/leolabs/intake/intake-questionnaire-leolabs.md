# LeoLabs — MuleSoft Integration Intake Questionnaire
**Client:** LeoLabs  
**Date:** 2026-05-11  
**Prepared by:** Scout (Scoping Analyst — BMAD v6.6.0)  
**Source files:** `scoping/` — 3 documents (intro call transcript 2026-04-30, Salesforce+LeoLabs deck, SPM brief)  

---

## Instructions for LeoLabs

**Where you see "We understood:"** — these answers were inferred from your call and documents. Correct anything wrong inline; leave it blank if correct.  
**Where you see "Answer:"** — these are genuine unknowns. Please fill in.  
**Christine (Controller)** should answer all NetSuite-specific questions (NS-Q1 through NS-Q3 and UC-level NS fields).  
No checkboxes. Plain text is fine.  

---

## Section 1: Use Cases

### UC-1 — Sales Order Creation (Salesforce → NetSuite)

**We understood:**
- Trigger: contract is signed / deal closes — Claudia described this as "as soon as we sign the contract"
- Mule creates a NetSuite Sales Order with the Opportunity's products, line item amounts, contract start/end dates, and payment terms
- NetSuite generates a unique Order ID on creation
- Order updates and cancellations are **out of scope** (confirmed on call)
- Quotes are **out of scope** — push happens only at contract close, not quote stage

**UC1-Q1 — Trigger mechanism (architecture-blocking):**  
When a deal is ready to push to NetSuite, what technically signals "ready" in Salesforce?

- A) Opportunity Stage changes to "Closed Won" — Mule detects this automatically via Salesforce Change Data Capture (near real-time, within minutes)
- B) A custom checkbox on the Opportunity (e.g. "Send to NetSuite" = checked) set manually by Claudia or the rep — Mule polls for this flag
- C) A Salesforce Contract object that gets activated/executed separately from the Opportunity

Answer:

---

**UC1-Q2 — Cross-reference writebacks (called out as "a huge problem" on the call):**  
After Mule creates the NetSuite Sales Order, should the NetSuite Order ID be written back to the Salesforce Opportunity? And should the Salesforce Opportunity ID be stamped on the NetSuite Sales Order at creation time?

- A) Both directions: NS Order ID → SF Opportunity AND SF Opportunity ID → NS Sales Order record
- B) NS Order ID → SF Opportunity only (one-way writeback)
- C) Neither — will be handled manually outside the integration

Answer:

---

**UC1-Q3 — Field mapping confirmation (please correct this table):**

We understood the following mapping. Christine: please confirm the NetSuite field names, especially any custom fields.

| Salesforce Field | NetSuite Field | Notes / Confirm |
|-----------------|----------------|-----------------|
| Opportunity Name | Sales Order Memo | |
| Account Name | Customer | How is customer matched? By name or by a shared ID field? |
| Close Date | Transaction Date | |
| Contract Start Date | Start Date | Is Contract Start Date a custom field on SF Opportunity? |
| Contract End Date | End Date | Is Contract End Date a custom field on SF Opportunity? |
| Opportunity Line Items (Products) | Sales Order Lines | Are Products / Opportunity Line Items currently active in Salesforce? |
| Amount / Line Item Price | Unit Price | Salesforce list price, or quoted/discounted price? |
| Payment Terms | Terms | What NetSuite Terms values does LeoLabs use? (e.g. Net 30, Net 60) |
| Opportunity Owner | Sales Rep | Does NS Sales Order have a Sales Rep field? Custom or standard? |
| Opportunity ID | custbody_sf_opportunity_id | Does this custom body field exist in NetSuite yet? If not, Christine needs to create it. |

Answer (corrections / additions):

---

**UC1-Q4 — Discount handling:**  
The call mentioned that quoted prices may differ from NetSuite's listed item price. Should Mule insert a **discount line item** on the Sales Order when quoted price ≠ list price, or should line prices on the SO exactly match the Salesforce quoted price regardless of the NetSuite list price?

Answer:

---

### UC-2 — Product & Price Creation (Salesforce → NetSuite)

**We understood:**
- Salesforce is the system of truth for Products and Pricing (confirmed by Claudia: "I had to do this at Maxar — we built the product tables and pricing in Salesforce and that pushed everything to NetSuite")
- Direction: Salesforce → NetSuite (one-way)
- Scope note from deck: "Scope does not cover Inventory Management and Historical Data Transfer"

**UC2-Q1 — Trigger and frequency:**  
Should product sync run on a schedule (nightly) or trigger immediately when a product is created/updated in Salesforce?

- A) Nightly scheduled sync — Mule polls Salesforce for products changed since yesterday
- B) Near real-time — trigger immediately when a product is created or updated in Salesforce

Answer:

---

**UC2-Q2 — NetSuite Item type:**  
What NetSuite Item Type should Salesforce products map to? LeoLabs sells space data/tracking services — not physical goods.

- A) Service Item (most common for SaaS/data/professional services)
- B) Non-Inventory Item
- C) Other — please specify

Answer:

---

**UC2-Q3 — Item mapping dependency (architecture-blocking):**  
NetSuite's REST API cannot look up items by product code or name — only by internal ID. To create Sales Order lines (UC-1), Mule needs a **Salesforce Product Code → NetSuite Item Internal ID mapping table**. Two options:

- A) Flow 2 (Product Sync) builds and maintains this mapping. Flow 2 must be delivered and running before Flow 1 can create orders with line items.
- B) A manual mapping spreadsheet/table already exists — provide it and Mule will load it as reference data.

Which applies? And are NetSuite items for LeoLabs' product catalog already created in NetSuite, or does this integration need to create them from scratch?

Answer:

---

### UC-3 — Price Updates (Salesforce → NetSuite)

**We understood:**
- Ongoing sync: when prices change in Salesforce, Mule updates the corresponding NetSuite item prices
- Same direction: Salesforce → NetSuite

**UC3-Q1 — NetSuite price levels:**  
Does NetSuite use Price Levels (Base Price, Customer-specific prices, volume tiers)? Or is there a single list price per item?

Answer:

---

### UC-4 — Invoice Sync (NetSuite → Salesforce)

**We understood:**
- NetSuite generates invoices from approved Sales Orders (invoices are read-only via API — cannot be created via Mule)
- Mule reads invoices from NetSuite and writes invoice number, due date, and amount to Salesforce
- Finance team uses this for cash flow forecasting

**UC4-Q1 — Salesforce destination object:**  
Which Salesforce object should invoice data be written to?

- A) A custom Invoice object (does it already exist, or needs to be created in Salesforce?)
- B) Fields on the Opportunity (invoice number, due date, amount as custom fields)
- C) Fields on a Salesforce Contract object

Answer:

---

**UC4-Q2 — Sync frequency:**  
How often should invoice data sync from NetSuite to Salesforce?

- A) Nightly (sufficient for forecasting use case)
- B) Near real-time (within minutes of invoice being generated in NetSuite)

Answer:

---

### UC-5 — Payment Updates (NetSuite → Salesforce)

**We understood:**
- When payment status changes in NetSuite, Mule updates Salesforce
- Finance uses this for cash forecasting and payment term tracking (confirmed on call: "the finance team uses all of that for their forecasting")

**UC5-Q1 — Payment statuses to sync:**  
What NetSuite payment statuses should trigger a Salesforce update? (e.g. Open, Paid in Full, Partially Paid, Overdue, Voided)

Answer:

---

**UC5-Q2 — Payment structure:**  
Does LeoLabs invoice with single payments, milestone-based payments, or recurring subscriptions? This determines how many payment events per order Mule will handle.

Answer:

---

**UC5-Q3 — Sync frequency:**  
How often should payment status sync from NetSuite to Salesforce?

- A) Nightly scheduled sync
- B) Near real-time (within minutes of payment being posted in NetSuite)

Answer:

---

### UC-6 — Spiff / Commission Tool Integration (Scope Confirmation)

*[INFERRED from: "Phase 2 (Crucial): Automated integration via MuleSoft (or Spiff's native connectors) to pull NetSuite Revenue and Salesforce Bookings" — SPM document]*  
*[INFERRED from: "if there's that connector that goes both ways" — transcript]*

**UC6-Q1 — Is Spiff integration in scope for this MuleSoft project?**

- A) **Yes — include as Flow 6:** Nightly sync of NetSuite revenue actuals → Spiff (eliminates Claudia's manual CSV uploads entirely)
- B) **Out of scope for now** — 5 flows only (Salesforce ↔ NetSuite). Spiff integration is a future phase.
- C) **Document as Phase 2 in PRD** but do not implement in this engagement

Answer:

---

**UC6-Q2 [only if UC6-Q1 = A]:**  
Does Spiff have a documented REST API for pushing revenue/booking data into it? Or does it only support file import and native connectors (Salesforce, NetSuite)?

Answer:

---

---

---

## Potential Additional Flows — Scope Confirmation

*The 5 flows in the MuleSoft scope deck cover the explicitly discussed integrations. The following data movements were NOT listed as flows but are standard for a Salesforce ↔ NetSuite integration and may be needed. Please confirm: in scope, out of scope, or future phase.*

---

### [POTENTIAL FLOW A] — NetSuite Customer Creation from Salesforce Account

**We noticed:** Flow 1 (Sales Order Creation) requires a matching NetSuite Customer for every Salesforce Account. The 5-flow scope does not include a flow that creates or updates NetSuite Customers when Salesforce Accounts are created or modified.

**Today:** Are NetSuite Customers created manually by Christine when a new Account is added to Salesforce? Or does a Customer record already exist in NetSuite for every active LeoLabs account?

**PFQA-1 — Confirm scope:**
- A) **This flow IS needed** — add as Flow 6: Salesforce Account created/updated → create or upsert NetSuite Customer record (prerequisite for Flow 1 accuracy)
- B) **Not needed** — NetSuite Customers are created manually and we will maintain that process
- C) **Already handled** — NetSuite already has a Customer for every Salesforce Account; no automation needed

Answer:

---

### [POTENTIAL FLOW B] — Contact Sync (Salesforce Contact → NetSuite)

**We noticed:** The scope covers Accounts and Orders but not Contacts. NetSuite uses Contact records for invoice billing addresses and customer communications.

**PFQB-1 — Confirm scope:**
- A) **Not needed** — LeoLabs does not use Contact-level billing in NetSuite; Account-level is sufficient
- B) **Needed** — when a Contact is added to a Salesforce Account, create a linked Contact in NetSuite
- C) **Future phase** — not for this engagement

Answer:

---

### [POTENTIAL FLOW C] — Credit Memo / Refund (NetSuite → Salesforce)

**We noticed:** The scope covers invoices (Flow 4) and payment updates (Flow 5) but not credits or refunds. If LeoLabs issues a partial credit or service adjustment in NetSuite, Salesforce would not reflect it — which could affect commission calculations in Spiff (net revenue vs. gross bookings).

**PFQC-1 — Confirm scope:**
- A) **Not needed** — LeoLabs does not issue credits or refunds against existing orders
- B) **Needed** — credit memos in NetSuite should flow back to Salesforce (alongside invoices in Flow 4)
- C) **Future phase** — not for this engagement; will revisit when Spiff is in scope

Answer:

---

## Section 2: Systems and Access

**Q2.1:** Both Salesforce and NetSuite are cloud SaaS. Confirm?

We understood: Yes — both cloud.  
Confirm or correct:

---

**Q2.2:** Do you have **sandbox / test environments** for both Salesforce and NetSuite that can be used for development and testing?

Answer:

---

**Q2.3:** Are there any existing integrations (Zapier, native connectors, scripts, manual processes other than CSV) between Salesforce and NetSuite today that this project replaces or runs alongside?

We understood: No existing automated integration — it is entirely manual (CSV export/import + email).  
Confirm or correct:

---

**Q2.4:** Are there any existing published assets on Anypoint Exchange that DataSkate should be aware of or reuse?

Answer:

---

---

## Section 3: Data and Field Mapping

**Q3.1 [SYSTEM: Salesforce] — State and Country Picklists:**  
Is the **"State and Country Picklists"** feature enabled in your Salesforce org? (This is found under Setup → State and Country/Territory Picklists. It's not visible in normal UI but affects how country fields must be written — using ISO codes vs. free text.)

Answer:

---

**Q3.2 [SYSTEM: Salesforce] — Multi-currency org:**  
Is this a multi-currency Salesforce org? (Setup → Company Settings → Manage Currencies)

Answer:

---

**Q3.3 [SYSTEM: NetSuite] — External ID field for Salesforce Opportunity ID:**  
Does a custom body field named something like `custbody_sf_opportunity_id` already exist on the NetSuite Sales Order record type? If not, Christine needs to create it before integration development begins. This is the cross-reference field that links NS orders back to SF opportunities.

Answer (Christine):

---

**Q3.4 [SYSTEM: NetSuite] — Tax code internal IDs:**  
NetSuite requires the **internal ID** of a Tax Code record on line items — not the tax code name. What tax code internal IDs does LeoLabs use for standard domestic and international deals?

Answer (Christine):

---

**Q3.5 — Data quality cleanup:**  
The call acknowledged duplicate customer names, mismatched addresses, and products/pricing not yet in sync between systems. Will a data cleanup (customer deduplication, address normalization, product catalog alignment) happen before integration go-live? Who owns this, and is it on the critical path?

Answer:

---

**Q3.6 — Customer matching key:**  
How should Mule match a Salesforce Account to an existing NetSuite Customer when creating a Sales Order? Options:

- A) By a shared external ID field (e.g. NS Customer has a `custentity_sf_account_id` field storing the SF Account ID)
- B) By exact company name match (fragile — see data quality concern above)
- C) By a shared field like DUNS, EIN, or another business identifier

Answer:

---

---

## Section 4: Volume and Performance

**Q4.1 — Order volume:**  
Approximately how many new Closed Won deals (Sales Orders) does LeoLabs close per month today? And what is the 12-month projected volume as the sales team grows?

We understood: Low volume currently ("not a high volume yet" — roughly 10–20 deals/month based on ~30 reps). No exact number given.

Answer (current / projected):

---

**Q4.2 — Product catalog size:**  
How many products / SKUs are currently in the Salesforce product catalog?

Answer:

---

**Q4.3 — Invoice and payment frequency:**  
How many invoices does NetSuite generate per month, and how frequently do payment status changes occur?

Answer:

---

**Q4.4 — Peak periods:**  
Are there predictable peaks (end of quarter, US Government fiscal year-end, contract renewal cycles) when order volume spikes?

We understood: Yes — end of quarter is a crunch period.  
Please describe typical vs. peak volume:

Answer:

---

**Q4.5 — Acceptable delay: Salesforce → NetSuite (Flow 1):**  
What is the maximum acceptable delay between a deal closing in Salesforce and the Sales Order appearing in NetSuite?

- A) Within minutes (near real-time — event-driven via Salesforce CDC)
- B) Within hours (same business day is fine)
- C) Nightly is acceptable (next morning)

Answer:

---

**Q4.6 — Availability SLA:**  
What uptime is required for the integration?

- A) Best-effort (occasional downtime acceptable)
- B) 99.9% (< 8.7 hours downtime/year — standard)
- C) 99.99% (< 52 minutes downtime/year — enterprise)

Answer:

---

---

## Section 5: Security and Compliance

**Q5.1 — PII:**  
Does this integration transmit Personally Identifiable Information? Customer names, contact names, and email addresses from Salesforce Accounts/Contacts would qualify.

Answer:

---

**Q5.2 — Regulatory compliance (aerospace / government):**  
LeoLabs operates in the space situational awareness domain and has US Government (USG) customers. Does any data transmitted by this integration fall under **ITAR (International Traffic in Arms Regulations)**, **EAR (Export Administration Regulations)**, or other export control frameworks?

Answer:

---

**Q5.3 — Data residency:**  
Is there a requirement that data remain within a specific geographic region or country (e.g. US only)?

Answer:

---

**Q5.4 [SYSTEM: Salesforce] — Connected App:**  
Has a MuleSoft Connected App been created in your Salesforce org? If yes, please provide the Consumer Key (Client ID). We will request the private key via secure channel separately.

Answer:

---

**Q5.5 [SYSTEM: NetSuite] — TBA setup:**  
Has a Token-Based Authentication (TBA) integration record been created in NetSuite for MuleSoft? (NetSuite Setup → Integration → Manage Integrations)

If yes: please provide the Account ID, Consumer Key, Consumer Secret, Token ID, and Token Secret via secure channel.  
If not: Christine (or a NetSuite admin) needs to create one before development can begin.

Answer:

---

**Q5.6 — Secrets management:**  
Where should integration credentials be stored?

- A) Anypoint Secrets Manager (CloudHub 2.0 native — recommended, included in Anypoint Platform)
- B) AWS Secrets Manager
- C) Azure Key Vault
- D) HashiCorp Vault
- E) Environment properties only (acceptable for non-regulated projects)

Answer:

---

---

## Section 6: Error Handling

**Q6.1 — NetSuite unavailability (Flow 1):**  
If NetSuite is temporarily down when Mule tries to create a Sales Order, what should happen?

- A) Retry automatically (3 retries, exponential backoff: 30s / 90s / 270s), then park in a Dead Letter Queue and alert the team
- B) Retry, then send an email/Slack alert to Claudia and Christine if all retries fail
- C) Fail immediately and alert on-call

Answer:

---

**Q6.2 — Split-state on NS Order ID writeback:**  
If the NetSuite Sales Order is successfully created but Mule then fails to write the NS Order ID back to Salesforce — what is the right response?

- A) Compensating transaction: delete the NetSuite order, alert team to retry the whole flow manually
- B) Accept the split state: log an error + alert, team manually copies the NS Order ID to SF
- C) Retry the SF writeback only (do NOT undo the NS order) — eventually consistent

Answer:

---

**Q6.3 — Failure notification:**  
Who should receive failure alerts, and how? (email addresses, Slack channel names, PagerDuty)

Answer:

---

**Q6.4 — Duplicate order protection:**  
If a retry causes the same Salesforce Opportunity to be sent to NetSuite twice, NetSuite will create a duplicate Sales Order. Should Mule implement idempotency (check if an NS order with this SF Opportunity ID already exists before creating)?

- A) Yes — implement idempotency using the SF Opportunity ID as the dedup key (recommended)
- B) No — handle duplicates manually if they occur

Answer:

---

**Q6.5 — Zero data loss requirement:**  
For the financial flows (invoices, payments) — is zero data loss required, or is best-effort acceptable?

Answer:

---

---

## Section 7: Deployment and DevOps

**Q7.1 — Deployment model:**  
We understood: CloudHub 2.0 (included in the Anypoint Integration Starter package).  
Confirm or correct:

---

**Q7.2 — Environments:**

- A) Dev + Production only (lean — budget-conscious)
- B) Dev + UAT + Production (standard — lets Claudia and Christine validate before go-live)
- C) Dev + QA + UAT + Production

Answer:

---

**Q7.3 — Network / firewall restrictions:**  
Are there any IP whitelists, VPN requirements, or private network restrictions needed to reach NetSuite or Salesforce from CloudHub 2.0?

Answer:

---

**Q7.4 — CI/CD preference:**

- A) GitHub Actions (default)
- B) Azure DevOps
- C) Jenkins
- D) None — manual deploy is fine

Answer:

---

**Q7.5 — GitHub org:**  
What GitHub organization should the generated client repo be created under?

Answer:

---

---

## Section 8: Operations and Support

**Q8.1 — External monitoring:**  
Does LeoLabs use Splunk, Datadog, Azure Monitor, ELK, or any other external log/monitoring platform that the integration should send alerts or logs to?

Answer:

---

**Q8.2 — Post go-live ownership:**  
Who owns monitoring and first-response for integration failures after go-live? DataSkate managed services, internal IT, or Claudia/Christine watching Anypoint Monitoring?

Answer:

---

**Q8.3 — Business dashboard:**  
Does the accounting team (Christine) need a business-facing operations dashboard — e.g. "Orders synced today: 12, Failures: 1, Pending: 0"?

Answer:

---

---

## Section 9: Testing and Go-Live

**Q9.1 — Test environments:**  
Are sandbox environments available for both Salesforce and NetSuite with representative data (real customer names, products, pricing)?

Answer:

---

**Q9.2 — UAT sign-off:**  
What are the acceptance criteria for UAT sign-off, and who signs off — Claudia, Christine, both, or ELT?

Answer:

---

**Q9.3 — Blackout periods:**  
Are there periods when no system changes can be deployed? (month-end close, end-of-quarter, government fiscal year-end)

We understood: Month-end close is already painful (14–17 days). Deployments during close should be avoided.  
Please specify exact blackout dates or windows:

Answer:

---

**Q9.4 — Go-live target:**  
What is the target go-live date? Claudia mentioned it depends on ELT budget approval — Q3 or Q4 2026 if approval is delayed.

Answer:

---

**Q9.5 — Phased go-live:**  
Is there appetite for phased delivery — e.g. Flow 2 (Product Sync) first, then Flow 1 (Sales Order Creation), then Flows 4–5 (Invoice + Payment)?

Answer:

---

---

## Section 10: System-Specific Details

### [SYSTEM: Salesforce]

**SF-Q1 [TRIGGERED BY: Salesforce CDC architecture]:**  
Is **Change Data Capture (CDC)** enabled in your Salesforce org for the Opportunity object? If not, are you open to enabling it? (Setup → Integrations → Change Data Capture). This is needed for near-real-time triggering of Flow 1 without polling every few minutes.

Answer:

---

**SF-Q2 [TRIGGERED BY: Salesforce Connected App setup]:**  
What Salesforce edition are you on? (Essentials / Professional / Enterprise / Unlimited / Developer)  
This determines daily API call limits — Enterprise gets 15,000 calls/day; Professional gets 1,000/day, which may be insufficient for the integration.

Answer:

---

**SF-Q3 [TRIGGERED BY: Salesforce JWT auth]:**  
Does your Salesforce Connected App use **OAuth 2.0 JWT Bearer (server-to-server)** flow, or Username-Password? JWT Bearer is required for MuleSoft on CloudHub 2.0 (no user interaction at runtime). If the Connected App hasn't been created yet, DataSkate will create it.

Answer:

---

### [SYSTEM: NetSuite]

**NS-Q1 ⚠ HIGH PRIORITY [TRIGGERED BY: NetSuite PS256 JWT — autoWarning netsuite_rest]:**  
The MuleSoft NetSuite Connector (v11.x) uses SOAP/SuiteTalk and **does not support NetSuite's REST API**. We will use the HTTP connector with a **PS256 JWT authentication sub-flow** (Nimbus JOSE Java library). This is confirmed architecture — not optional.

To configure this, we need a **Token-Based Authentication (TBA)** integration record in NetSuite. Has this been created? If not, Christine will need to set it up under: NetSuite → Setup → Integration → Manage Integrations → New.

Once created, please provide via secure channel: Account ID, Consumer Key, Consumer Secret, Token ID, Token Secret.

Answer (Christine):

---

**NS-Q2 [TRIGGERED BY: NetSuite OneWorld multi-subsidiary]:**  
Does LeoLabs use **NetSuite OneWorld** (multiple subsidiaries under one NetSuite account)? If yes, what is the **subsidiary internal ID** for the entity that Sales Orders, Invoices, and Customer records belong to?  
(If you're unsure: NetSuite → Setup → Company → Subsidiaries. If this menu option exists, you have OneWorld.)

Answer (Christine):

---

**NS-Q3 [TRIGGERED BY: NetSuite item matching — cannot look up by name]:**  
NetSuite's REST API **cannot look up items by product code or name** — only by internal ID. Creating Sales Order lines requires a mapping of Salesforce Product Code → NetSuite Item Internal ID.

a) Does this mapping currently exist anywhere (spreadsheet, field in NetSuite or Salesforce)?  
b) Are NetSuite Item records already created for LeoLabs' product catalog, or do they need to be created by Flow 2 first?

Answer (Christine):

---

### [SYSTEM: Spiff — Commission/SPM Tool]

*[INFERRED from: "Salesforce Spiff", "Phase 1: Stand up Spiff", "if we have SPIFF set up" — named explicitly in SPM document and transcript]*

**SPIFF-Q1 [scope confirmation]:**  
Is Spiff connectivity in scope for this MuleSoft project? (See UC6-Q1 above for options.)

Answer:

---

**SPIFF-Q2 [only if Spiff is in scope]:**  
Does Spiff have a **REST API** for pushing data into it programmatically? If yes, is there API documentation or a Postman collection? If not, what's the supported method — file import, native connectors, or webhooks?

Answer:

---

**SPIFF-Q3 [only if Spiff is in scope]:**  
What data from NetSuite does Spiff need for commission calculations? The SPM document mentions revenue actuals, margin data, and backlog. Which specific NetSuite record types and fields?

Answer:

---

---

## 🔒 Internal Flags — Do Not Send to Client

*Technical risks and blockers for the architect. Exclude from client-facing communications.*

**FLAG-1 — BLOCKER [NetSuite PS256 JWT]**  
`autoWarning: netsuite_rest` triggered. MuleSoft NetSuite Connector v11.x does NOT support REST API. Architecture must use HTTP connector + PS256 JWT sub-flow via Nimbus JOSE. Budget 1 additional story for `ns-auth.xml`. Stub already exists in `commons/playbooks/netsuite/system/ns-auth.xml`. Confirm this sub-flow is production-ready before scaffold.

**FLAG-2 — BLOCKER [NetSuite Item Mapping — Flow 1 dependency on Flow 2]**  
Flow 1 (Sales Order Creation with line items) cannot be implemented without a Salesforce Product Code → NetSuite Item Internal ID mapping. If NS items don't exist yet, Flow 2 (Product Sync) must be delivered and operational BEFORE Flow 1 can go live. Delivery sequence constraint: Flow 2 → Flow 1. Raise as explicit dependency in stories.md.

**FLAG-3 — BLOCKER [Flow 1 Trigger Pattern — architecture decision]**  
UC1-Q1 not answered in scoping docs. This is the primary pattern decision: event-driven CDC (Pattern B/F) vs. scheduled poll (Pattern D). Cannot finalize architecture.md until this is confirmed. Analyst should flag as OPEN ITEM.

**FLAG-4 — HIGH [Financial Data — Compensation Strategy Required]**  
`autoWarning: financial_data` triggered (invoice, payment, revenue, margin, commission). Flow 1 creates financial records in NetSuite. If NS order creation succeeds but SF writeback fails, a split state exists. Architect must choose: write-off (retry SF only) vs. compensating transaction (undo NS order). This is not a developer TODO — it is an architectural decision. Prompt in Q6.2.

**FLAG-5 — HIGH [Spiff Connector Unknown]**  
Spiff is not in the connector registry. If scope includes Spiff, architect must check Anypoint Exchange for a Spiff connector. If none exists (likely), use HTTP connector + API Contract Discovery. Do NOT include Spiff flows in scaffold until connector type and API shape are confirmed. See stub added to registry.

**FLAG-6 — MEDIUM [NetSuite OneWorld / Subsidiary ID]**  
If LeoLabs uses OneWorld, `subsidiary.id` is required on every NetSuite write. This is a hard validation failure if omitted. NS-Q2 must be answered before development begins.

**FLAG-7 — MEDIUM [NS Customer External ID field missing]**  
Mule needs to match SF Accounts to NS Customers. If there is no external ID field on NS Customer storing the SF Account ID, matching must fall back to name — fragile given acknowledged data quality issues. Recommend: create `custentity_sf_account_id` on NS Customer before development.

**FLAG-8 — MEDIUM [Salesforce State/Country Picklists]**  
If enabled, `BillingCountryCode` (ISO) must be used instead of free-text `BillingCountry`. Salesforce playbook `canonical-to-sf-account.dwl` has `useCountryCode` flag — set based on Q3.1 answer. Sending free-text country when picklists are enabled throws `FIELD_INTEGRITY_EXCEPTION`.

**FLAG-9 — MEDIUM [Data Cleanliness Risk — pre-go-live gate required]**  
LeoLabs has acknowledged duplicate customer names, mismatched addresses, and products/pricing out of sync. The integration will propagate garbage-in garbage-out if data is not cleaned before go-live. Recommend a formal data cleanup checkpoint (Claudia + Christine sign-off) as a UAT gate.

**FLAG-10 — LOW [No In-House NetSuite Expertise]**  
Only Christine has NetSuite functional knowledge. All NS-side configuration (TBA setup, custom fields, item records, subsidiary ID) must be done by Christine or DataSkate's NetSuite SME (Ryan Albretsen). Build this dependency into the project timeline — NS configuration cannot be parallelized with Mule development if Christine is the sole resource.

**FLAG-11 — LOW [Anypoint Platform new purchase — no existing assets]**  
Confirmed: new Anypoint Platform subscription (Integration Starter). No existing MuleSoft assets to reuse or conflicts to avoid. Clean start.

---

## Scout Assessment: Ready for Analyst?

**Status: CONDITIONAL GO**

The scoping documents provide sufficient information for the Analyst to write a **draft PRD** covering all 5 flows with clear OPEN ITEMS. The Analyst should proceed but must flag Flags 1–4 as blockers that must be resolved before the Architect can finalize decisions.

**Can draft now:** Business problem, all 5 use cases, systems, stakeholders, data entities, high-level NFRs, scope boundaries.

**Must be resolved before architecture.md:**
- UC1-Q1 (trigger mechanism — determines integration pattern)
- NS-Q1 (TBA credentials — confirms REST API architecture)
- NS-Q2 (OneWorld — affects every NS write)
- NS-Q3 + UC2-Q3 (item mapping — determines Flow 1 line-item feasibility)
- UC6-Q1 (Spiff scope — determines if a 6th flow exists)
- Q6.2 (compensation strategy — financial mutation risk)

---
*Generated by Scout — BMAD v6.6.0 — 2026-05-11*  
*Send Sections 1–10 (excluding Internal Flags and Scout Assessment) to Claudia and Christine.*
