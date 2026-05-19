# AgileMind Integration Intake Questionnaire
**Date:** 2026-05-19
**Prepared by:** DataSkate / Quinn (Intake Specialist)
**Source:** Pre-sales discovery sessions (2026-04-28, 2026-05-08)
**Architect:** Kailash Chanda — kailash@dataskate.ai

---

**Instructions:** Pre-filled answers are shown based on your discovery calls with DataSkate — leave them as-is if correct, or update them. Blank *Answer* lines are genuine unknowns where we need your input. Please complete and return to Kailash Chanda (kailash@dataskate.ai).

---

## SECTION 1 — USE CASES

### 1.1 UC1 — Salesforce Agreement → QuickBooks Invoice Creation [HIGH complexity]

**Business problem this solves:** Crystal Robinson manually creates the QuickBooks invoice after each Salesforce Agreement is closed — re-entering account details, line items, and product details that already exist in Salesforce. This flow eliminates that manual step entirely.

**Trigger:** Salesforce Platform Event or Change Data Capture (CDC) on the Agreement object (Closed Won / Agreement Created). MuleSoft subscribes as the consumer.
> ⚠️ Confirm with Chloe (IT) that Platform Events or CDC is enabled on your Agreement object — see Q54.

**Q1.** When you create a new Agreement in Salesforce — does that always mean a signed district PO is in hand, or does the Agreement sometimes get created before the PO arrives? [TRIGGERED BY: K-12 district PO timing — FKC-004]
Evidence suggests: Agreement creation = Closed Won in the sales process — Abby creates the Agreement after a deal is won (from discovery). However, K-12 district invoicing requires a valid PO before an invoice can be legally accepted (FKC-004 pattern). If Agreements are ever created speculatively before PO receipt, we need to add a confirmation gate before UC1 fires — confirm or correct:

**Q2.** How does the team currently resolve the correct ISBN for each line item — is there a lookup table (state × product → ISBN), or does someone look this up manually?
Evidence suggests: manual lookup today — when no ISBN match exists, it lands on Abby's desk for resolution ("this lookup currently has no automated path; when it breaks, it lands on Abby's desk" — from discovery). No automated lookup table currently exists in Salesforce. DataSkate will build a configurable Salesforce metadata lookup table (State × Product → ISBN) as part of UC1 scope — confirm or correct:

**Q3.** QB Customer matching: do QuickBooks Customer names match Salesforce Account names exactly (e.g., "Austin ISD" in SF = "Austin ISD" in QB)? If there are mismatches, is a QB Customer ID stored anywhere on the Salesforce Account? [SYSTEM: QuickBooks]
Evidence suggests: QB Customer records exist for all active districts (confirmed in discovery — Maria confirmed QB accounts are set up). Name alignment is unconfirmed and is a risk — "Austin ISD" in Salesforce may differ from "Austin Independent School District" in QuickBooks. No QB Customer ID is currently stored on Salesforce Account (integration is manual today). DataSkate recommends adding a QB_CustomerId__c field to SF Account to eliminate name-matching risk — confirm or correct:

**Scope Boundary for this flow:**
✅ IN SCOPE: Create a QuickBooks invoice with line items when a Salesforce Agreement reaches Closed Won; stamp the QB Invoice ID back to the Agreement record (QB_InvoiceId__c)
⚠️ ASSUMED PRE-EXISTS: QB Customer records for all AgileMind school districts already in QuickBooks (confirmed in discovery); Salesforce Opportunity stages and Agreement custom object already exist
❌ OUT OF SCOPE: Creating new QB Customer records for new districts; QB payment processing; Salesforce licensing or Agentforce enablement

→ See Section 3.2 for pre-filled field mapping.

#### [POTENTIAL FLOW — UC6] CCR Pre-Fulfillment Flag [Priority: Medium]
**What it solves:** Holly confirmed that sales ships materials against Contract Change Requests (CCRs) before an Agreement is formally closed in Salesforce. When the Agreement arrives, UC1 would fire and create a duplicate QB invoice for materials already shipped and billed. A CCR flag on the Agreement prevents duplicate invoicing.
**Question:** Is there a field or step in Salesforce today that marks an Agreement as "pre-shipped via CCR"? If not, can Holly or Abby flag this manually as part of the CCR workflow?
Evidence suggests: no current CCR flag exists in Salesforce (manual coordination today via phone call between Holly and sales — from discovery). This is a medium-priority prerequisite for UC1 accuracy — confirm or correct:

---

### 1.2 UC2 — QuickBooks Invoice Status → Salesforce Agreement Sync [MEDIUM complexity]

**Business problem this solves:** Crystal manually checks QuickBooks for payment status and copies the invoice number, payment date, and open balance back to the Salesforce Agreement. This flow polls QuickBooks on a schedule and writes that data back automatically — Crystal stops toggling between two systems.

**Trigger:** Scheduled poll of QuickBooks invoices, filtered by LastModifiedDate using QuickBooks' April 1 fiscal year offset.
> Evidence from discovery: "track payment updates from QuickBooks to Salesforce, including the open balance... update the number, amount, dates"

**Q4.** How frequently should payment status sync from QuickBooks to Salesforce?
Evidence suggests: hourly polling during business hours (Mon–Fri 8am–6pm CT) — Crystal currently checks QB manually throughout the day, indicating that at minimum hourly accuracy is needed. DataSkate default for scheduled-sync payment flows. If overnight accuracy is sufficient, nightly is simpler — confirm preferred frequency:

**Q5.** Which fields should sync from QuickBooks to the Salesforce Agreement?
Evidence suggests from discovery: QB Invoice Number, Invoice Date, Due Date, Total Amount, Open Balance, Payment Date, Payment Status — Crystal manually copies exactly these fields today. Confirm or add/remove:
Invoice Number ✓ | Invoice Date ✓ | Due Date ✓ | Total Amount ✓ | Open Balance ✓ | Payment Date ✓ | Payment Status ✓ — confirm or correct:

**Scope Boundary for this flow:**
✅ IN SCOPE: Scheduled sync of QB invoice payment status to Salesforce Agreement fields; idempotent upsert via QB_InvoiceId__c external ID
⚠️ ASSUMED PRE-EXISTS: QB_InvoiceId__c external ID field on Salesforce Agreement (DataSkate creates this in sprint scope)
❌ OUT OF SCOPE: Real-time webhook-based payment notifications; automated payment processing in QB; AR escalation email drafting (Phase 3 — Agentforce)

→ See Section 3.3 for pre-filled field mapping.

---

### 1.3 UC3 — Holly's Demand Worksheet → Salesforce Inventory__c [MEDIUM complexity]

**Business problem this solves:** Holly's inventory demand worksheet is the only place AgileMind tracks quantities on hand, committed stock, and projected shorts. Leadership cannot answer inventory questions without calling Holly directly. This flow reads her worksheet on a schedule and loads that data into a new Salesforce Inventory__c custom object — which DataSkate creates as part of this sprint.

**Trigger:** Scheduled poll of Holly's demand worksheet.
> ⚠️ P0 BLOCKER: The connector path (Google Sheets vs Microsoft Excel Online) depends on where Holly's file is stored. This must be resolved before build starts.

**Q6 [P0]:** Where is Holly Wale's inventory demand worksheet stored?
Evidence suggests: likely Google Sheets or Excel — "Holly's demand worksheet" was referenced in multiple calls but storage location was explicitly left unconfirmed ("Holly's inventory worksheet lives in Excel (or Google Sheets — still unconfirmed as of the last call)" — from discovery). P0 blocker — confirm which option:
- (a) Holly's local laptop — cannot integrate directly; file must move to cloud storage first
- (b) SharePoint or OneDrive (Microsoft 365)
- (c) Google Drive or Google Sheets
Answer (select one):

**Q7.** What are the exact column header names in Holly's worksheet?
Evidence suggests from discovery and integration design: columns likely include Title/Book Name, ISBN, State, Quantity on Hand, Quantity Committed, Quantity Available, Projected Shorts flag (the "red cells" Holly uses for shortage alerts), Buffer Threshold (3%). Holly tracks these manually to flag shortage risk. Provide exact column header names as they appear at the top of the spreadsheet (case-sensitive — DataWeave mapping depends on exact names). A sample row export would be ideal — confirm or correct:

**Q8.** How frequently is Holly's worksheet updated — continuously throughout the day, or once at end of day?
Evidence suggests: updated throughout the day by Holly ("the moment she closes her laptop, the rest of the team is working from stale data" — from discovery). Once moved to cloud storage, continuous updates expected. Scheduled polling every 30–60 minutes recommended — confirm update frequency:

**Scope Boundary for this flow:**
✅ IN SCOPE: Scheduled sync from Holly's spreadsheet into Salesforce Inventory__c; UC3 owns: QuantityOnHand__c, QuantityCommitted__c, QuantityAvailable__c, BufferThreshold__c, ProjectedShort__c; DataSkate creates the Inventory__c object schema as part of this sprint
⚠️ ASSUMED PRE-EXISTS: Holly's worksheet structure exists and column headers are stable (to be confirmed above); Google Service Account (if Google Sheets) or Azure AD app registration (if SharePoint) provisioned by Chloe
❌ OUT OF SCOPE: File migration from local laptop to cloud storage (IT responsibility if needed); automated shortage alerts (Phase 2); Google Workspace or Microsoft 365 licensing

→ See Section 3.4 for pre-filled field mapping.

#### [POTENTIAL FLOW — UC5] Product Catalog Sync — Salesforce ↔ QuickBooks [Priority: High — dependency risk for UC1 and UC4]
**What it solves:** Maria adds new curriculum titles to QuickBooks and Salesforce separately. Without sync, the QB Item list and SF Product catalog will diverge — breaking UC1 line item matching and UC4 cost lookup silently. This is a dependency risk for UC1 and UC4.
**Question:** Who creates new product/title records, and do you add them to QuickBooks and Salesforce independently? Which system is the system of record for the product catalog?
Evidence suggests: Maria manages the product catalog in both systems separately today (confirmed in discovery — "Maria is adding new titles to QB and Salesforce separately"). No system of record confirmed. Deferred pending Maria's input — confirm or correct:

---

### 1.4 UC4 — QuickBooks Inventory Items → Salesforce Inventory__c (Cost Data) [MEDIUM complexity]

**Business problem this solves:** Maria cannot answer "what have we spent on Intensified Algebra Vol 1 over the last 5 years?" without manually cross-referencing QuickBooks. This flow pulls QB inventory item cost data into the same Salesforce Inventory__c object UC3 writes to — enabling cost-per-program analysis directly in Salesforce.

**Trigger:** Scheduled poll of QB Inventory Items (Item type); runs after UC3 in the same scheduling window to prevent field overwrite.
> Evidence from discovery: "you are going to be able to see like...algebra 6 books six equals x amount...value of inventory...cost per district, cost per program"

**Q9.** In QuickBooks, what type of Item represents your print curriculum materials — Inventory Part, Non-Inventory Part, or Service? [SYSTEM: QuickBooks]
Evidence suggests: Inventory Part items (QB Item type used for physical inventory tracking with quantity-on-hand — UC4 was explicitly identified as polling QB "Inventory Items" in pre-sales analysis). Confirm item type — Inventory Part, Non-Inventory Part, or Service:

**Q10.** Should UC4 sync include only physical print book inventory, or also digital access / license items?
Evidence suggests: physical print curriculum materials only (Student Activity Books — SABs). Digital access is tracked separately as Subscriptions/Licenses in Salesforce, not as QB Inventory items (from company business objects confirmed in discovery). Confirm: physical books only, or include digital SKUs:

**Scope Boundary for this flow:**
✅ IN SCOPE: Scheduled sync of QB inventory item cost data to Salesforce Inventory__c; UC4 owns: UnitCost__c, QB_ItemId__c reference; runs after UC3 to prevent field overwrite
⚠️ ASSUMED PRE-EXISTS: QB Items already created for all curriculum titles (confirmed in discovery); Inventory__c object created as part of UC3 sprint scope
❌ OUT OF SCOPE: QB purchase order creation; historical cost data backfill; multi-currency cost reporting

→ See Section 3.5 for pre-filled field mapping.

#### [POTENTIAL FLOW — UC7] Inventory Decrement on Fulfillment [Priority: Medium]
**What it solves:** Each order decrements inventory in QuickBooks, but UC4's scheduled sync means Salesforce Inventory__c shows stale counts between runs — Holly's dashboard may show incorrect available stock mid-day.
**Question:** Is the lag in inventory counts between UC4 sync runs a business problem today, or is end-of-day accuracy acceptable? If near-real-time accuracy is needed, UC7 becomes a separate event-driven flow.
Evidence suggests: end-of-day accuracy may be acceptable based on the current manual workflow (Holly updates the spreadsheet — not real-time). Partially covered by UC3/UC4 scheduled sync — confirm whether lag is a business problem:

---

## SECTION 2 — SYSTEMS AND ACCESS

### 2.1 Salesforce

**Deployment:** Cloud (Salesforce.com)
Evidence suggests: confirmed cloud — all discovery calls reference Salesforce.com online access — confirm:

**Auth method:** OAuth 2.0 JWT Bearer (dedicated integration user; Connected App registered by Chloe IT Director)
Evidence suggests: confirmed — OAuth 2.0 JWT Bearer is the standard for MuleSoft-to-Salesforce server-to-server auth; Connected App provisioning is Chloe's responsibility (from pre-sales analysis) — confirm:

**API version:** v59.0 (DataSkate standard pinned version)
Evidence suggests: v59.0 is the DataSkate default — confirm or specify if your org has restrictions:

**Q11 [P0]:** Are Salesforce State/Country Picklists enabled in your org? If yes, please share a sample mailing state field value from an Agreement record (e.g., "California" vs "CA" vs "US-CA"). [SYSTEM: Salesforce]
This is a P0 blocker: if Picklists are enabled, state values are ISO codes (US-CA) not free-text — the ISBN lookup DataWeave key must match exactly or all UC1 invoice routing silently fails — no evidence to pre-fill — confirm:

**Q12.** What is your Salesforce org edition, and approximately how many API calls per day do existing tools/reports generate? [SYSTEM: Salesforce]
Evidence suggests: Enterprise Edition (supports custom objects, Platform Events, CDC — all required for this engagement; Enterprise baseline is ~15,000 API calls/24h). Existing API call volume from reports and other integrations is unknown — confirm edition and estimate current daily API usage:

**Q13.** What is Chloe's (IT Director) last name and email address? She is the provisioner for: Salesforce Connected App, Google Service Account (if Google Sheets), and Azure AD app registration (if SharePoint). All three credential flows are blocked without this. [SYSTEM: cross-system]
Evidence suggests: Chloe is IT Director at AgileMind (confirmed in discovery across multiple calls). Last name and email were never captured — confirm last name + email:

### 2.2 QuickBooks

> ⚠️ **P0 BLOCKER — The entire integration architecture changes based on Q14. QuickBooks Online uses a clean REST/OAuth 2.0 integration. QuickBooks Desktop has no REST API and requires a Windows relay bridge adding $1,500–$5,000/yr in licensing. Confirm Q14 before all other QB questions.**

**Q14 [P0]:** Which QuickBooks product does your team use? [SYSTEM: QuickBooks]
Evidence suggests: QuickBooks Online (assumed — AgileMind is a cloud-first SMB, Salesforce and cloud storage are primary tools; no on-premise infrastructure indicated in discovery). This is an assumption — P0 blocker, must confirm. Maria Gonzalez-Pettway or Crystal Robinson can confirm:
- (a) QuickBooks Online — web-based, accessed at app.qbo.intuit.com in a browser
- (b) QuickBooks Desktop Pro or Premier — installed program on a Windows PC
- (c) QuickBooks Enterprise — advanced desktop version
Answer:

**Q15.** Who will authorize the QuickBooks Connected App OAuth access — Crystal Robinson or Maria Gonzalez-Pettway? [SYSTEM: QuickBooks]
Evidence suggests: Crystal Robinson (manages QB invoicing daily and has confirmed direct QB access — "Crystal Robinson manually creates... the QuickBooks invoice" from discovery) or Maria Gonzalez-Pettway (Finance Director with QB visibility). Either has QB access. Authorizing person must log into developer.intuit.com with QB admin credentials — confirm who will handle this:

**Q16.** Can you provide your QuickBooks Company ID (realmId)? [SYSTEM: QuickBooks]
Evidence suggests: visible in the QB Online URL when logged in — app.qbo.intuit.com/app/homepage?realmId=XXXXXX. Maria or Crystal can retrieve this. Pending QB version confirmation (Q14) — provide once Q14 is confirmed:

### 2.3 Google Sheets / Microsoft Excel Online

*(Complete whichever path applies after Q6 above.)*

**If Google Sheets (Q6 = option c):**
**Q17a.** Can Chloe (IT) provision a Google Service Account (JSON key file) with Editor access to Holly's spreadsheet, and share the spreadsheet URL? [SYSTEM: Google Sheets]
Evidence suggests: Chloe is the provisioner for all service account credentials (confirmed as IT Director responsibility in pre-sales analysis). Google Service Account is the preferred auth method for MuleSoft server-to-server — no user token rotation issues — confirm Chloe can provision and share the spreadsheet URL:

**If SharePoint / OneDrive (Q6 = option b):**
**Q17b.** Can Chloe register an Azure AD app with Files.ReadWrite.All or Sites.ReadWrite.All Microsoft Graph API permissions? What is the exact SharePoint site URL and file path? [SYSTEM: Excel Online]
Evidence suggests: Chloe (IT Director) handles Azure AD app registrations (confirmed as IT Director responsibility). Exact SharePoint site URL and file path are unknown — confirm Chloe can register and provide the exact path:

---

## SECTION 3 — DATA AND FIELD MAPPING

### 3.1 External ID Fields

| System | Object | External ID Field | Purpose | Who Creates |
|---|---|---|---|---|
| Salesforce | Agreement | QB_InvoiceId__c | UC1/UC2 idempotent upsert — links QB invoice to SF Agreement | DataSkate (sprint scope) |
| Salesforce | Inventory__c | ISBN__c + Title__c (composite) | UC3/UC4 upsert key | DataSkate (sprint scope) |
| QuickBooks | Customer | Matched by name to SF Account | UC1 invoice creation lookup | Client — confirm name alignment (Q3) |

**Q18.** Are there any external ID fields already set up on your Salesforce Account object for school district records (e.g., a district ID, LEA code, or state education agency ID)?
Evidence suggests: no existing QB Customer ID or external integration ID on Salesforce Account — current process is fully manual with no external ID linkage (confirmed in discovery: no existing integrations). District LEA codes or state IDs may exist but were not referenced. Confirm if any district identifier field exists on the Account object — or confirm no existing external IDs:

### 3.2 UC1 — Salesforce Agreement → QuickBooks Invoice (Field Mapping)

*Pre-filled from canonical-invoice.yaml and discovery. Confirm, add custom fields, or flag naming differences.*

| Source Field (Salesforce Agreement) | Target Field (QuickBooks Invoice) | Notes |
|---|---|---|
| Account.Name | Customer.DisplayName | Must match QB Customer name exactly — see Q3 |
| Agreement line items: Product Name | Line.Item.Name | Resolved from ISBN lookup table (state × product → ISBN) |
| Agreement line items: Quantity | Line.Qty | Per line item |
| Agreement line items: Unit Price | Line.UnitPrice | Per line item |
| Computed: ISBN | Line.Item code / Description | State × product lookup step required before QB call |
| Agreement billing state (ISO or free-text — see Q11) | ISBN lookup key | Format must match Q11 confirmation |
| Today's date | TxnDate | Invoice creation date |
| Net 30 / Net 60 (see Q19) | DueDate | Based on payment terms |
| Salesforce Agreement ID | Invoice Memo/DocNumber | Audit traceability — DataSkate default (see Q20) |

**Q19.** Does AgileMind use standard payment terms for district invoices in QuickBooks (e.g., Net 30, Net 60)?
Evidence suggests: Net 30 is standard for K-12 educational publishers selling to government-funded districts (common industry default). Not specifically stated in discovery — confirm payment terms and whether they are uniform across all districts or district-specific:

**Q20.** Should the QB Invoice include a memo or reference linking back to the Salesforce Agreement ID?
Evidence suggests: yes — DataSkate standard practice for audit traceability. Including the Salesforce Agreement ID as a QB Invoice memo allows Crystal to trace any QB invoice back to its source Agreement. Will be implemented by default — confirm or opt out:

### 3.3 UC2 — QuickBooks Invoice → Salesforce Agreement (Payment Status Sync)

| Source Field (QuickBooks Invoice) | Target Field (Salesforce Agreement) | Notes |
|---|---|---|
| Id | QB_InvoiceId__c | Upsert key — External ID field |
| DocNumber | QB_InvoiceNumber__c | Invoice number visible to Crystal |
| TxnDate | QB_InvoiceDate__c | Invoice creation date |
| DueDate | QB_DueDate__c | Due date |
| TotalAmt | QB_TotalAmount__c | Total invoice amount (USD) |
| Balance | QB_OpenBalance__c | Unpaid balance — AR visibility for Crystal |
| (linked payment record date) | QB_PaymentDate__c | Date payment received |
| Balance = 0 → PAID | QB_InvoiceStatus__c | PAID / OVERDUE / PENDING |

**Q21.** Are there additional fields on your Salesforce Agreement that should receive data from QuickBooks — for example, payment method, district payment reference, or AR aging bucket?
Evidence suggests: no additional fields beyond the table above were mentioned in discovery — Crystal's manual workflow covers exactly Invoice Number, Date, Amount, Open Balance, Payment Date. Confirm if any QB fields are missing from the mapping — or confirm the table above is complete:

### 3.4 UC3 — Holly's Demand Worksheet → Salesforce Inventory__c (Quantity Fields)

*UC3 owns: demand and quantity fields. UC4 owns: cost fields. Both upsert by ISBN__c + Title__c composite to prevent overwrite conflicts.*

| Source Column (Holly's Worksheet — header names TBD per Q7) | Target Field (Salesforce Inventory__c) | Notes |
|---|---|---|
| Title / Book Name (exact header: confirm Q7) | Title__c | Upsert key — composite with ISBN |
| ISBN (exact header: confirm Q7) | ISBN__c | Upsert key — state-specific identifier |
| State (exact header: confirm Q7) | State__c | Jurisdiction this ISBN applies to |
| Quantity on Hand (exact header: confirm Q7) | QuantityOnHand__c | Physical stock count |
| Quantity Committed (exact header: confirm Q7) | QuantityCommitted__c | Reserved for closed/high-prob agreements |
| (computed: On Hand − Committed) | QuantityAvailable__c | Computed in MuleSoft DataWeave transform |
| Projected Short / Red flag (exact header: confirm Q7) | ProjectedShort__c | Boolean — drives Phase 2 shortage alert |
| Buffer % (exact header: confirm Q7) | BufferThreshold__c | 0.03 = 3% — confirm whether per-title or global |

**Q22.** What are the exact column header names in Holly's worksheet as they appear at the top of the spreadsheet?
Evidence suggests from discovery and canonical inventory model: Title/Book Name, ISBN, State, Quantity on Hand, Quantity Committed, Quantity Available, Projected Shorts flag (the "red cells"), Buffer Threshold (3%). These are inferred — DataWeave mapping depends on exact spelling and case. Provide the exact header row — confirm or correct:

**Q23.** Is "Quantity Committed" calculated in the worksheet, or does Holly enter it manually?
Evidence suggests: manually entered by Holly — the worksheet is described as "a highly manual process in an Excel worksheet" (from discovery). Holly tracks committed quantities based on her knowledge of the Salesforce pipeline. Confirm: manually entered or a formula:

### 3.5 UC4 — QuickBooks Inventory Items → Salesforce Inventory__c (Cost Fields)

*UC4 owns: cost and value fields only. Must run after UC3 in the scheduling window.*

| Source Field (QuickBooks Item) | Target Field (Salesforce Inventory__c) | Notes |
|---|---|---|
| Name | Title__c (match key) | Used to locate existing Inventory__c record created by UC3 |
| AverageCost (see Q24) | UnitCost__c | Per-unit cost |
| QuantityOnHand | QuantityOnHand__c | QB stock count — reconcile with UC3 spreadsheet source |
| Id | QB_ItemId__c | QB Item reference (new field on Inventory__c) |

**Q24.** In QuickBooks, is unit cost stored as "Purchase Cost," "Average Cost," or a custom field on the inventory item? [SYSTEM: QuickBooks]
Evidence suggests: Average Cost (QuickBooks Online defaults to Average Cost method — AVCO — for Inventory Part items; this is the standard QB Online inventory valuation method). Confirm: Purchase Cost, Average Cost, or custom field:

**Q25.** Confirm the UC3/UC4 field ownership split to prevent overwrite conflicts:
Evidence suggests from pre-sales architecture: UC3 owns demand/quantity fields (QuantityOnHand, QuantityCommitted, QuantityAvailable, BufferThreshold, ProjectedShort); UC4 owns cost fields only (UnitCost__c, QB_ItemId__c). UC4 runs after UC3. This split is the confirmed DataSkate proposal — confirm or adjust:

---

## SECTION 4 — VOLUME AND PERFORMANCE

**Q26.** Approximately how many new Agreements are created in Salesforce per month?
Evidence suggests: 10–30/month off-peak; 40–80/month during May–July back-to-school peak — estimated from $18M ARR and typical K-12 district contract size ($20K–$100K annual). Volume is heavily seasonal. Confirm actual monthly average and peak volume:

**Q27.** Approximately how many active QuickBooks invoices will UC2 need to poll on each sync cycle?
Evidence suggests: 50–150 active open invoices at any time — annual contract model, districts typically pay within 60–90 days of invoice, AgileMind client base estimated at 100–300 active districts. Confirm approximate count of open invoices at any given time:

**Q28.** How many rows does Holly's demand worksheet typically contain?
Evidence suggests: 100–400 rows — one row per curriculum title × state ISBN combination (AgileMind carries state-specific ISBNs for ~10–15 curriculum titles across 30+ active states). Confirm actual row count and whether rows are per-title-per-state or per-title only:

**Q29.** What is your peak order volume period?
Evidence suggests from discovery: May–August back-to-school procurement and shipping window (district budgets close June 30; AgileMind's QB fiscal year opens April 1; materials must ship before school starts in August). This is the 60-day crunch described in discovery. Confirm and note any secondary peak (e.g., mid-year CCR window):

**Q30.** For UC1 — what is the maximum acceptable lag between an Agreement being created in Salesforce and the QB invoice appearing?
Evidence suggests: same-business-day latency is acceptable (invoice creation is an internal workflow — not a real-time customer-facing transaction). DataSkate default: sub-60-second latency for event-driven flows under normal conditions. Confirm or set an explicit SLA:

**Q31.** What is your uptime SLA requirement for the integration?
Evidence suggests: business hours coverage at minimum (Mon–Fri 8am–6pm CT — Grapevine TX location); 24×7 monitoring strongly recommended during May–August peak given financial impact of a missed invoice. CloudHub 2.0 platform default: 99.9% uptime. Confirm SLA requirement:

---

## SECTION 5 — SECURITY AND COMPLIANCE

**Q32.** Does any data in these flows include student PII (names, student IDs, grades, assessments)?
Evidence suggests: No — these flows operate at district/account level (Agreement, Invoice, Inventory quantities, product costs) — not individual student records. No student data is exchanged in UC1–UC4. Confirm or correct:

**Q33.** Are FERPA, COPPA, or state-level student data privacy laws relevant to this integration?
Evidence suggests: FERPA may technically apply since AgileMind acts as a "school official" under district data sharing agreements — however, UC1–UC4 do not exchange individual student records, only district-level financial and inventory data. Confirm whether your legal team has assessed FERPA scope for this integration, or whether any district contracts impose data handling requirements on your vendors:

**Q34.** Should integration credentials (OAuth tokens, QB realmId, Salesforce JWT private key) be stored in a Secrets Manager?
Evidence suggests: yes — DataSkate recommends AWS Secrets Manager (CloudHub 2.0 compatible) for all OAuth tokens and private keys; this is the standard DataSkate managed service configuration. QB OAuth refresh tokens in particular require secure automated rotation (100-day expiry risk — see Q59). Confirm preference or note if Savvas IT has a policy:

**Q35.** Does AgileMind have data residency requirements?
Evidence suggests: US-only (Grapevine TX, all clients are US school districts, USD billing). CloudHub 2.0 region will be configured as US East (N. Virginia) by default. Confirm or specify any contractual residency requirement from Savvas or district contracts:

---

## SECTION 6 — ERROR HANDLING

**Q36.** UC1 — If QuickBooks is temporarily unavailable when a Salesforce Agreement fires, what should happen?
Evidence suggests: retry with queue is appropriate for a financial flow (zero data-loss required per Q39). DataSkate default: retry 3× with exponential backoff (30s → 2min → 5min), then persist to Anypoint Object Store with email alert to Maria and Chloe. Confirm or adjust retry count, backoff timing, and alert recipients:

**Q37.** UC1 — If the ISBN lookup returns no match (new state or new product not in the lookup table), what should happen?
Evidence suggests from discovery: route to manual review queue — "when it breaks, it lands on Abby's desk." Abby receives an email notification with the Agreement details and must update the lookup table before the invoice can be created. NOT a silent discard. DataSkate will implement this as the default — confirm or adjust:

**Q38.** Who should receive failure notifications for integration errors?
Evidence suggests: two tiers — (1) IT/connector failures: Chloe (IT Director — email needed per Q13); (2) Business/process failures (ISBN lookup miss, invoice creation error): Maria Gonzalez-Pettway and/or Abby (who resolves manual ISBN issues). Confirm names and emails for both tiers:

**Q39.** Is zero data-loss required for UC1, or is best-effort acceptable?
Evidence suggests: zero data-loss required — UC1 creates financial records (QuickBooks invoices) and a missed Agreement event would result in an unbilled district contract. Confirm:

**Q40.** Idempotency — if the same Agreement event fires twice (retrigger after a transient error), should the integration create a duplicate QB invoice or detect and skip?
Evidence suggests: idempotent — QB Invoice ID is stamped to the Salesforce Agreement (QB_InvoiceId__c) on first creation; re-fires check for an existing Invoice ID and skip duplicate creation. This is the DataSkate standard and is required to prevent double-invoicing. Confirm:

---

## SECTION 7 — DEPLOYMENT AND DEVOPS

**Q41.** Deployment model preference:
Evidence suggests: CloudHub 2.0 (DataSkate-managed IaaS) — confirmed as the recommended model in pricing analysis given AgileMind has no MuleSoft developer or integration engineer on staff. Confirm or specify:

**Q42.** Which environments are needed?
Evidence suggests: Development + UAT + Production — DataSkate standard three-environment setup. Confirm or add/remove:

**Q43.** Are there network or firewall restrictions that would prevent outbound HTTPS calls from CloudHub 2.0 to api.salesforce.com, quickbooks.api.intuit.com, or sheets.googleapis.com?
Evidence suggests: no firewall restrictions expected — AgileMind uses Salesforce.com and QuickBooks Online (both SaaS), indicating standard HTTPS egress is available from AgileMind's corporate network. CloudHub 2.0 calls these APIs outbound via standard HTTPS. Chloe (IT) to confirm no corporate proxy or egress filtering applies — confirm or correct:

**Q44.** Do you have CI/CD tools in use at AgileMind or Savvas (GitHub Actions, Jenkins, Azure DevOps, Bitbucket Pipelines)?
Evidence suggests: no current CI/CD tooling for MuleSoft — this is AgileMind's first integration engagement. DataSkate's IaaS managed service handles the deployment pipeline. Savvas IT may have existing CI/CD from other teams. Confirm if AgileMind has a preference or Savvas IT has a standard toolchain:

**Q45.** How are credentials and secrets managed today?
Evidence suggests: no formal secrets manager currently in use — new integration, no existing MuleSoft deployment or API credential storage identified in discovery. DataSkate will introduce AWS Secrets Manager as part of this engagement. Confirm whether Savvas IT has an existing credential management policy or preferred vault:

### Access Chain Table

Please complete or correct any pre-filled entries. Flag any system where there is no named backup admin (single point of failure risk).

| System | Admin Owner | API User Creator | Backup Admin | Vendor Support Login | Environments Available | Status |
|---|---|---|---|---|---|---|
| Salesforce | Chloe (IT Director — last name/email: **Q13 needed**) | Chloe (IT) | **[confirm backup]** | **[confirm]** | Sandbox confirmed + Production | ⚠️ Chloe email required |
| QuickBooks Online | Crystal Robinson or Maria Gonzalez-Pettway | Chloe or Maria | **[confirm backup]** | **[confirm]** | Sandbox (developer.intuit.com) + Production | ⚠️ Awaiting P0 QB version (Q14) |
| Google Sheets / Excel | Chloe (IT Director) | Chloe (IT) | **[confirm backup]** | N/A | Holly's sheet + test copy | ⚠️ Awaiting storage location (Q6) |

**Q46.** Please complete the Access Chain table — add full names, email addresses, and backup contacts for each system. Note any system with no named backup admin.
Evidence suggests: Chloe is the primary admin for all three systems (confirmed as IT Director in discovery). Crystal Robinson is the QB operational owner. Maria Gonzalez-Pettway has finance system oversight. Backup admins are unknown — confirm and complete:

---

## SECTION 8 — OPERATIONS AND SUPPORT

**Q47.** Who owns post-go-live support for integration issues?
Evidence suggests: DataSkate managed service (IaaS model — confirmed in pricing recommendation: AgileMind has no MuleSoft developer on staff; Chloe is IT Director but no integration engineer). Confirm:

**Q48.** Should there be a dashboard or audit log in Salesforce showing integration run history, error counts, and last-sync timestamps?
Evidence suggests: yes — Holly, Maria, and Crystal all need integration visibility today without contacting DataSkate ("the moment she closes her laptop, the rest of the team is working from stale data" — Holly's situation drives the need for real-time visibility). Recommended: Salesforce dashboard showing last sync timestamp per flow, error count, and recent transaction log. DataSkate will build this as part of the managed service. Confirm or specify preferred approach:

**Q49.** Do you use a specific logging or monitoring tool (Splunk, Datadog, Salesforce Event Monitoring, PagerDuty)?
Evidence suggests: no current integration monitoring tool in use (first integration engagement). DataSkate includes Anypoint Monitoring (CloudHub 2.0 built-in) with configurable alerts. Confirm if Savvas IT requires a specific monitoring platform to integrate with:

---

## SECTION 9 — TESTING AND GO-LIVE

**Q50.** Do you have separate test environments for each system?
Evidence suggests: Salesforce sandbox — yes (standard for all Salesforce orgs). QuickBooks Online sandbox — needs provisioning at developer.intuit.com (free; separate from production company). Google Sheets test copy — can be created by Holly. Confirm or note any gaps:

**Q51.** What are the UAT acceptance criteria?
Evidence suggests default UAT criteria for 4 flows: (1) UC1 — create 5 test Agreements in SF sandbox → verify 5 QB sandbox invoices with correct line items, ISBN, and district customer match; (2) UC2 — mark 3 QB sandbox invoices as paid → verify Salesforce Agreement fields updated within next poll cycle; (3) UC3 — update Holly's test worksheet tab → verify Salesforce Inventory__c records upserted correctly; (4) UC4 — update QB Item cost in sandbox → verify Inventory__c UnitCost__c updated after next poll. Confirm or add AgileMind-specific acceptance criteria:

**Q52.** Are there blackout periods when go-live should NOT occur?
Evidence suggests from discovery: avoid August 1–15 (back-to-school peak shipping — the highest-stress operational window); avoid March 31 (QuickBooks fiscal year close). Confirm and add any additional blackout dates (e.g., Savvas quarterly close):

**Q53.** What is the target go-live date or sprint start date?
Evidence suggests: TBD — not confirmed in discovery ("there's still a few things we need to nail down" — Maria). Provide a target date or constraint (e.g., "must be live before May 1 ordering window" or "aiming for Q3 2026"):

---

## SECTION 10 — SYSTEM-SPECIFIC DETAILS

### 10.1 Salesforce [max 3 questions]

**Q54.** Is Change Data Capture (CDC) or Platform Events currently enabled on your Agreement object in Salesforce? [SYSTEM: Salesforce]
Evidence suggests: likely NOT yet enabled — this was flagged as a prerequisite in pre-sales analysis that has not been confirmed as active. Chloe (IT) should verify in Salesforce Setup → Change Data Capture. This is a required step before UC1 build can start — DataSkate cannot enable this remotely. Confirm status:

**Q55.** What is the exact API name of the Agreement custom object in your Salesforce org? [SYSTEM: Salesforce]
Evidence suggests: Agreement__c — standard Salesforce custom object naming convention (confirmed as a custom object in discovery: "existing QB Invoice # / date / payment custom fields" on the Agreement object). Exact API name is visible in Salesforce Setup → Object Manager. Confirm exact API name:

**Q56.** Is your Salesforce org a multi-currency org? [SYSTEM: Salesforce]
Evidence suggests: single-currency USD — AgileMind sells exclusively to US school districts in USD, no international billing mentioned in discovery. CurrencyIsoCode field will not be present on Account/Agreement in a single-currency org. Confirm: single-currency USD:

### 10.2 QuickBooks [max 3 questions]

**Q57.** Is your QuickBooks Online sandbox a separate company from production? [SYSTEM: QuickBooks]
Evidence suggests: yes — QuickBooks Online sandbox companies are always separate from production (different realmId, provisioned at developer.intuit.com under a developer account — free, no paid subscription required). Confirm that a sandbox company exists or needs to be created:

**Q58.** Who will authorize the QuickBooks Connected App OAuth connection in developer.intuit.com? [SYSTEM: QuickBooks]
Evidence suggests: Crystal Robinson (manages QB invoicing daily — confirmed in discovery) or Maria Gonzalez-Pettway (Finance Director with QB access). The authorizing person must have QB admin-level credentials to grant OAuth permissions. Confirm who will handle this step:

**Q59.** QuickBooks OAuth 2.0 refresh tokens expire after 100 days of non-use — if not rotated, all sync flows break silently. Is DataSkate authorized to implement automated token refresh via AWS Secrets Manager? [SYSTEM: QuickBooks]
Evidence suggests: automated rotation is required — 100-day expiry risk was flagged as HIGH severity in pre-sales analysis (FK-020): "QBO OAuth refresh token (100-day expiry): if not handled, production sync will break silently after first refresh window." DataSkate will implement automated rotation by default. Confirm Savvas IT has no policy requiring manual credential rotation:

### 10.3 Spreadsheet Connector [max 3 questions]

*(Answer based on Q6 storage location.)*

**Q60.** What is the exact name of Holly's worksheet tab (the tab name at the bottom of the spreadsheet)? [SYSTEM: Google Sheets / Excel]
Evidence suggests: likely named "Inventory," "Demand," "Stock," or "Holly" — exact tab name not captured in discovery. The tab name is visible at the bottom of the spreadsheet and must remain stable after integration build — any rename breaks the connector config. Confirm exact tab name:

**Q61.** Are there any merged cells or multi-row headers in Holly's worksheet? [SYSTEM: Google Sheets / Excel]
Evidence suggests: possible — Excel/Google Sheets inventory worksheets commonly use merged cells for visual grouping of title/state combinations. If any merged cells or multi-row headers exist, they must be normalized to a flat single-row header row before DataWeave mapping can be finalized. Confirm: any merged cells? If yes, Chloe or Holly to flatten before build starts:

**Q62.** Approximately how many rows does the worksheet contain, and are rows organized per-title-per-state or per-title only? [SYSTEM: Google Sheets / Excel]
Evidence suggests: 100–400 rows — one row per curriculum title × state ISBN combination (AgileMind carries state-specific ISBNs; ~10–15 curriculum titles × 30+ active states = 100–400+ rows). This determines batch processing design. Confirm actual row count and row structure:

---

*End of intake questionnaire — AgileMind | DataSkate*

---

## INTERNAL FLAGS — DO NOT SEND TO CLIENT

1. **[HIGH]** QBO OAuth refresh token 100-day expiry risk: if not handled, production sync breaks silently after the first refresh window. Kailash must specify automated token refresh strategy — either Secrets Manager rotation or MuleSoft OAuth2 provider with token refresh endpoint configured. This is the single highest operational risk in this engagement.

2. **[MEDIUM]** UC3 and UC4 both write to Salesforce Inventory__c — field ownership conflict risk. Confirmed split: UC3 owns QuantityOnHand, QuantityCommitted, QuantityAvailable, BufferThreshold, ProjectedShort; UC4 owns UnitCost, QB_ItemId. Must be documented in scaffold DWL before build starts.

3. **[MEDIUM]** UC1 trigger timing — Agreement Created must imply a signed district PO in hand (FKC-004). If Agreements are sometimes created ahead of PO receipt, UC1 would generate a QB invoice that the district cannot legally accept. Q1 in this intake addresses this directly.

4. **[MEDIUM]** Chloe (IT Director) is the provisioner for all three credential flows: Salesforce Connected App, Google Service Account (if Google Sheets), Azure AD app registration (if SharePoint). Her last name and email are unknown. Q13 and Q46 are the unlock — do not proceed to environment setup until Chloe is identified.

5. **[MEDIUM]** UC5-potential (Product/Title master data sync) is a dependency risk for UC1 and UC4. If Maria adds new titles to QB and Salesforce separately, UC1 line item matching and UC4 cost lookups will silently fail for new titles. Must be resolved before go-live on UC1 and UC4.

6. **[LOW]** Education vertical canonical models (canonical-invoice.yaml, canonical-inventory-record.yaml) are stubs derived from OAGIS. Appropriate for AgileMind scope. Promote to versioned schemas after delivery. SIF (Schools Interoperability Framework) is the closest formal K-12 data standard for future reference.

---

## PRICING SUMMARY — INTERNAL — DO NOT SEND TO CLIENT

*(From flo.json — not recalculated here)*

| Item | Value |
|---|---|
| Engagement model | IaaS — DataSkate Managed Service |
| Confirmed flows | 4 |
| Kickoff retainer | $2,500 (credited at go-live) |
| Implementation fee | $0 (IaaS model) |
| Monthly rate — Year 1 H1 (4 flows × $300) | $1,200/month |
| Monthly rate — Year 1 H2 (4 flows × $315) | $1,260/month |
| One-year total (managed service) | $14,760 |
| Two-year managed service total | $31,033 |
| Implementation-only alternative | $14,000 |

**Why IaaS recommended:** AgileMind has no dedicated integration engineer or MuleSoft developer on staff. $0 upfront removes the budget barrier given stated cash-flow sensitivity and "$0–$2,500" implementation cost expectation. QBO OAuth refresh token rotation (100-day expiry = silent production break without automation) and connector upgrades are operational concerns AgileMind cannot manage internally. The IaaS managed service covers both.
