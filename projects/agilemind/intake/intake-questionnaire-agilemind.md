# Intake Questionnaire — AgileMind
**Prepared by:** DataSkate · Kailash Chanda (kailash@dataskate.ai)
**Date:** May 13, 2026
**Source files:** AgileMind Discovery Session (Apr 28, 2026), Agile Mind + DataSkate (May 8, 2026), AgileMind AE Discussion, Answers from Print Procurement and Print Fulfillment side

---

**How to use this document:**
- Answers pre-filled from your scoping sessions are shown in *italics*. Leave them as-is or correct them if anything has changed.
- Lines marked `Answer:` are genuine unknowns — please fill in.
- The intent of every question is to prevent surprises during development. Blank answers = delays.
- Questions labeled `[INTERNAL]` are for our team only — please do not respond to those.

---

## Section 1: Use Cases

### UC1 — Salesforce Agreement → QuickBooks Invoice (Event-Driven)

**What we understood:**
- Triggered when an Agreement in Salesforce changes status to Approved or Active
- Creates a new invoice in QuickBooks Online for an existing customer account
- Maps Agreement line items (programs, quantities, pricing) to QuickBooks Invoice line items
- Returns the QuickBooks Invoice number, invoice date, and due date back to the Salesforce Agreement record (`SF_QB_InvoiceId__c`)
- Invoicing due date logic: early orders placed Jan–Mar → due date set to July/August; summer orders → due within 30 days of invoice creation

**Scope questions:**

**Q1.1** On the Agreement in Salesforce, which **specific status value** should trigger invoice creation in QuickBooks?
- *From sessions: "Approved" and "Active" were both mentioned. Kailash asked Abby if a single status change is the trigger.*
Answer: Confirm the exact Salesforce Agreement Status picklist value that fires the trigger (e.g. "Approved", "Active", or a different value):

**Q1.2** What is the exact Salesforce API name of the Agreement custom object?
- *From sessions: referred to as "Agreement__c" throughout. Crystal confirmed it exists as a custom object.*
Answer: Confirm API name (Agreement__c) or correct it:

**Q1.3** Should the trigger fire once per Agreement record, or can re-triggering occur (e.g. if an Agreement is re-approved after a reversal)? Should the integration check whether a QB invoice already exists before creating a new one?
- *From sessions: no re-trigger scenario was discussed. Kailash proposed an idempotent check.*
Answer: If a QB invoice already exists for an Agreement, should the integration skip / update / create a new one?

**Q1.4** The sessions mentioned an invoice **due date column** based on order timing. Please confirm both scenarios:
- a) Orders placed January–March: due date = what specific month/day (e.g. July 31)?
- b) Summer orders placed after April 1: due date = 30 calendar days from invoice creation?
- *From sessions: Kailash committed to the July/Aug rule; Crystal and Maria confirmed the 30-day rule for summer orders.*
Answer:

**Q1.5** Multi-year agreements — prepaid scenario: the full contract amount is invoiced in Year 1 only, and subsequent year Agreements are set to $0. When a Year 1 Agreement triggers, should the integration include Year 2/3 lines at $0 on the QB invoice, or only include the Year 1 amount?
Answer:

**Q1.6** Multi-year agreements — pay-per-year scenario: each year is treated as a separate Agreement at ~90% probability, closed-won only when the customer confirms payment for that year. Should each confirmed Annual Agreement create its own separate QB invoice, or should there be any consolidation logic?
- *From sessions: "treated similarly to regular year-to-year opportunities" — Abby Dawson.*
Answer:

**Q1.7** The return sync writes the QB Invoice number and dates back to Salesforce Agreement. Which Salesforce fields should be updated on sync-back?
- *From sessions: `SF_QB_InvoiceId__c` (Invoice number), plus invoice date, due date, and open balance were mentioned.*
Answer: Confirm the list of Salesforce Agreement fields to update on sync-back:

→ See Section 3.1 for pre-filled field mapping for UC1.

**Scope Boundary for UC1:**
✅ IN SCOPE: Event-driven Agreement→Invoice creation; QB Invoice number + dates written back to Salesforce Agreement; due date logic (early orders vs. summer orders); multi-year handling per confirmed rules.
⚠️ ASSUMED PRE-EXISTS: Agreement__c is an existing custom object in Salesforce; `SF_QB_InvoiceId__c` External ID field will be created on Agreement__c before development begins; QB Customer records already exist matching Salesforce Accounts.
❌ OUT OF SCOPE: Creating QB Customer records from Salesforce Accounts (separate flow, not in scope); collections follow-up and escalation notes (remains manual per Crystal's confirmation).

---

### UC2 — QuickBooks Payment Status → Salesforce Agreement (Scheduled Sync)

**What we understood:**
- Scheduled nightly poll of QuickBooks Online Invoices and Payments
- Syncs QB Invoice status (Open / Paid / Partially Paid), open balance amount, and payment date back to Salesforce Agreement
- Target Salesforce fields: QB Invoice status, open balance, payment received date
- These are separate from UC1 (UC1 creates the invoice; UC2 tracks payment lifecycle)

**Scope questions:**

**Q2.1** What is the desired polling schedule? Once per night (e.g. 2 AM CT)? Or multiple times per day?
Answer:

**Q2.2** Which Salesforce fields should be updated when QB payment status changes?
- *From sessions: invoice status, open balance amount, payment date were mentioned. Crystal confirmed she currently updates these manually.*
Answer: Confirm or add fields (e.g. Payment_Status__c, Open_Balance__c, Last_Payment_Date__c):

**Q2.3** When QB shows an invoice as "Partially Paid," should the integration update the open balance in Salesforce in real time, or wait until the invoice is fully Paid?
Answer:

**Q2.4** Should the integration log each payment event (payment received, partial payment) as a Salesforce Activity/Task, or only update the field values on the Agreement record?
Answer:

→ See Section 3.2 for pre-filled field mapping for UC2.

**Scope Boundary for UC2:**
✅ IN SCOPE: Nightly scheduled poll of QB Invoices + Payments; sync of payment status, open balance, and payment date to Salesforce Agreement.
⚠️ ASSUMED PRE-EXISTS: QB Invoice was created by UC1 and the Invoice ID is stored in `SF_QB_InvoiceId__c` on the Agreement; QB Company Admin has completed OAuth consent.
❌ OUT OF SCOPE: Payment reminders, overdue alerts, or collections escalation (remains manual); creating or modifying QB payments from Salesforce.

---

### UC3 — Excel / Google Sheets Inventory → Salesforce Custom Inventory Object (Scheduled)

**What we understood:**
- Holly Wale maintains an inventory demand worksheet
- This worksheet contains: product title, ISBN, quantity-on-hand, committed quantity, available quantity, unit cost, and buffer percentage
- Integration pushes this data into a custom Salesforce Inventory object (does not yet exist — prerequisite: Chloe's team creates it)
- Provides a Salesforce-based dashboard for inventory visibility across the team

**[P0 BLOCKER]** The Salesforce custom Inventory object (`Inventory__c`) does not exist. Chloe's IT team must design and create it before this flow can be built.

**Scope questions:**

**Q3.1** Is Holly's inventory worksheet a **Google Sheet** (hosted at sheets.google.com) or a **local Excel file** saved on a PC or shared network drive?
- *From sessions: Holly said "Google Sheets I own" on May 8 and "Excel" on the AE call. This distinction changes the connector entirely.*
Answer: Google Sheet / Local Excel file / Excel on OneDrive or SharePoint:

**Q3.2** What is the update schedule for Holly's worksheet? Is it updated continuously throughout the week, or only at specific intervals (daily end-of-day, weekly on Monday morning)?
Answer:

**Q3.3** What is the maximum number of rows (ISBN/title combinations) in Holly's worksheet at peak?
Answer:

**Q3.4** Should this flow **replace** all Salesforce Inventory records on each run (full refresh), or **upsert** only changed rows (incremental by ISBN)?
Answer: Full refresh / Upsert by ISBN / Other:

**Q3.5** If QB is the primary source of record for inventory (per the Apr 28 session decision), what is the intended relationship between this flow (UC3) and UC4 (QB → SF)? Should UC3 continue after UC4 is live, or does UC3 become a one-time initial load?
- *From sessions: Kailash proposed QB as primary source; Maria and Holly agreed QB has the reports they need. UC3 may be Holly's demand planning overlay rather than raw QOH data.*
Answer: UC3 continues as ongoing demand overlay / UC3 is initial load only (UC4 takes over for QOH) / Other:

→ See Section 3.3 for pre-filled field mapping for UC3.

**Scope Boundary for UC3:**
✅ IN SCOPE: Scheduled sync of inventory data from Holly's worksheet into Salesforce Inventory__c; upsert by ISBN; committed/available inventory separation.
⚠️ ASSUMED PRE-EXISTS: Salesforce custom Inventory__c object created by Chloe's team with fields aligned to Holly's worksheet columns; Holly's sheet is shared with DataSkate's service account (if Google Sheets).
❌ OUT OF SCOPE: Salesforce Inventory object design (client-side prerequisite); modifying Holly's worksheet; inventory valuation or cost accounting.

---

### UC4 — QuickBooks Inventory Items → Salesforce Custom Inventory Object (Scheduled Nightly)

**What we understood:**
- Scheduled nightly pull from QuickBooks Online Item objects (type = Inventory)
- Syncs quantity-on-hand from QB (automatically decremented by QB when invoices are created) into Salesforce Inventory__c
- QB is the source-of-record for raw QOH; UC4 surfaces that data in Salesforce for dashboards and reporting
- Relationship to UC3: UC4 provides the raw QOH from QB; UC3 may provide Holly's demand planning overlay

**[P0 BLOCKER]** QuickBooks version MUST be confirmed as QBO (cloud) before this flow can be scoped. If QuickBooks Desktop/Enterprise is confirmed, this architecture changes entirely.

**[P0 BLOCKER]** QBO inventory tracking requires the **Plus or Advanced plan**. Essentials/Simple Start plans have no inventory API. Must confirm plan tier.

**Scope questions:**

**Q4.1** [P0] Is your QuickBooks the **cloud-hosted version** at quickbooks.intuit.com (QuickBooks Online), or is it **installed on a local server or PC** at your office (QuickBooks Desktop/Enterprise)?
- *From sessions: strong indicators of QBO (Holly runs reports online, Maria accesses QB from multiple locations), but version was never explicitly stated.*
Answer: QuickBooks Online (cloud) / QuickBooks Desktop (local install) / QuickBooks Enterprise:

**Q4.2** [P0 — if QBO confirmed] What QuickBooks Online plan is AgileMind on?
- *Context: Inventory tracking via QBO API is only available on Plus or Advanced. Essentials and Simple Start do not expose inventory data via API.*
Answer: Simple Start / Essentials / Plus / Advanced / Unknown:

**Q4.3** Has a QuickBooks Company Admin (Maria or Linda) already registered a developer application in the Intuit Developer Portal, or will DataSkate need to walk through the OAuth app registration?
Answer: Already registered / Not yet — we will do this when DataSkate requests / Unknown:

**Q4.4** What is the desired nightly sync schedule for UC4?
Answer:

**Q4.5** Should UC4 sync ALL QB Inventory Items (all ISBNs/titles), or only items belonging to a specific QB class, category, or list?
Answer: All inventory items / Filter by: [specify QB class or category] / Other:

→ See Section 3.4 for pre-filled field mapping for UC4.

**Scope Boundary for UC4:**
✅ IN SCOPE: Nightly scheduled pull of QB Inventory Items (type=Inventory); sync of QOH to Salesforce Inventory__c by ISBN.
⚠️ ASSUMED PRE-EXISTS: Salesforce custom Inventory__c object exists (same prerequisite as UC3); QBO Plus/Advanced plan confirmed; QB OAuth consent completed by QB Company Admin.
❌ OUT OF SCOPE: Modifying QB inventory items or quantities; inventory valuation; creating QB items from Salesforce.

---

## Section 2: Systems and Connectivity

### 2A — Salesforce

**Q5.1** Which Salesforce edition are you on?
- *From sessions: Enterprise edition was referenced in context of API call limits.*
Answer: Professional / Enterprise / Unlimited / Developer / Other:

**Q5.2** Does your Salesforce org have API access enabled for all profiles that will need to be accessed by the integration user?
Answer:

**Q5.3** Who is the Salesforce administrator who will create the required custom fields (`SF_QB_InvoiceId__c` on Agreement__c, and the Inventory__c custom object)?
- *From sessions: Chloe (Engineering/IT Director) manages Salesforce administration.*
Answer: Confirm Chloe and her team will handle this, or provide the contact:

**Q5.4** Are Platform Events or Change Data Capture (CDC) currently enabled in your Salesforce org? (UC1 may use one of these mechanisms to listen for Agreement status changes.)
Answer: Yes — already in use / Enabled but not in use / Not enabled / Unknown:

**Q5.5** Is there a Connected App in Salesforce already set up for server-to-server (JWT) integration, or will DataSkate need to create one?
Answer: Existing Connected App / Need to create one / Unknown:

**Q5.6** Are there any governor-limit concerns we should know about? (e.g. API call count close to the daily limit, existing integrations consuming most of the daily allocation.)
Answer:

---

### 2B — QuickBooks

**Q6.1** [P0 — covered in Q4.1] Confirming QB version: QuickBooks Online (cloud) or Desktop/Enterprise?
Answer:

**Q6.2** [If QBO confirmed] What is your QuickBooks Company ID (realmId)? This is the numeric identifier visible in the URL when you are logged into QuickBooks Online (e.g. https://app.qbo.intuit.com/app/homepage?**realmId=123456789**).
Answer:

**Q6.3** Who should DataSkate coordinate with to complete the one-time OAuth authorization for API access? This person must be a **Company Admin** in QuickBooks.
- *From sessions: Maria Gonzalez-Pettway and Linda (CFO) were identified as likely QB admins.*
Answer:

**Q6.4** Are all the products/ISBNs that AgileMind sells already set up as **Inventory Items** in QuickBooks (not Non-Inventory or Service type)?
- *From sessions: Maria confirmed she has already inputted items in QB. Holly confirmed QB has good QOH reports.*
Answer: Yes — all set up as Inventory Items / Partially — some are non-inventory / No — need to be converted:

---

### 2C — Google Sheets / Excel (UC3 only)

**Q7.1** [Already covered in Q3.1] Confirm: is Holly's worksheet a Google Sheet or an Excel file?
Answer:

**Q7.2** [If Google Sheets] Will Holly's sheet be shared with a DataSkate service account email address? (DataSkate will provide the email address — no OAuth prompt required for the integration; sharing is a one-time action by Holly.)
Answer: Yes, Holly will share it / Holly needs guidance on how to do this / Other:

**Q7.3** Is there a consistent **tab/sheet name** in Holly's workbook that the integration should always read from, or does the tab name change by quarter or year?
Answer: Consistent name (provide it): ________ / Changes by quarter or year:

**Q7.4** What is the header row layout in Holly's worksheet? Confirm the column names exactly as they appear in Row 1:
- *Expected from sessions: Product Title, ISBN, Quantity on Hand, Committed Quantity, Available Quantity, Unit Cost, Buffer %*
Answer: Confirm or provide the actual column headers:

---

## Section 3: Field Mapping Tables

### 3.1 — UC1 Field Mapping: Salesforce Agreement → QuickBooks Invoice

<div class="tbl-hint">Review the pre-filled values below. Type "Yes" to confirm each row, or enter the correct value if the mapping is different for your system.</div>

| # | Source: Salesforce Agreement | Canonical Field | Target: QuickBooks Invoice | Pre-filled | Confirm? |
|---|---|---|---|---|---|
| 1 | `Agreement__c.Name` | `orderId` | `Invoice.DocNumber` (or auto-generated by QB) | QB auto-generates DocNumber; Mule stores it in return sync | |
| 2 | `Agreement__c.AccountId` → Account Name | `customerId` | `Invoice.CustomerRef` (QB Customer name/ID) | Lookup QB Customer by Salesforce Account Name | |
| 3 | `Agreement__c.Status__c` (trigger field) | `agreementStatus` | (Trigger only — not written to QB) | Status = Approved/Active triggers flow | |
| 4 | Agreement Line Items — Product Name | `lines[].description` | `Invoice.Line[].Description` | Product title from Agreement | |
| 5 | Agreement Line Items — ISBN / Product Code | `lines[].productId` | `Invoice.Line[].ItemRef` (QB Item lookup by ISBN) | ISBN lookup table maps SF product → QB Item | |
| 6 | Agreement Line Items — Quantity | `lines[].quantity` | `Invoice.Line[].Qty` | From Agreement line items | |
| 7 | Agreement Line Items — Unit Price | `lines[].unitPrice` | `Invoice.Line[].UnitPrice` | From Agreement line items | |
| 8 | Calculated: due date logic (early/summer rule) | `invoiceDueDate` | `Invoice.DueDate` | July/Aug for Jan–Mar orders; +30 days for summer orders | |
| 9 | QB Invoice auto-generated → return sync | `externalIds.quickbooksInvoiceId` | `Agreement__c.SF_QB_InvoiceId__c` | Written back after QB invoice creation | |

**Q3.1a** When matching a Salesforce Account to a QuickBooks Customer, what is the match key? Account Name only, or is there a separate QB Customer reference field on the Salesforce Account object?
Answer:

**Q3.1b** The ISBN lookup table (configurable logic table in Salesforce): what Salesforce object will store it? Custom Metadata Type? Custom Object? A static lookup field on the Product record?
- *From sessions: Kailash proposed a Custom Metadata Type for the state→ISBN mapping.*
Answer: Custom Metadata Type (recommended) / Custom Object / Other:

**Q3.1c** When a product has state-specific ISBN variants, how does the system currently know which state to use? Is the mailing state on the Salesforce Account record the key?
- *From sessions: Holly confirmed the mailing state is used to determine which ISBN variant applies.*
Answer:

---

### 3.2 — UC2 Field Mapping: QuickBooks Payment → Salesforce Agreement

| # | Source: QuickBooks | Canonical Field | Target: Salesforce Agreement | Pre-filled | Confirm? |
|---|---|---|---|---|---|
| 1 | `Invoice.DocNumber` | `externalIds.quickbooksInvoiceId` | `Agreement__c.SF_QB_InvoiceId__c` (match key — lookup) | Used to find the matching Agreement | |
| 2 | `Invoice.Balance` | `totals.amountDue` | `Agreement__c.Open_Balance__c` (field to be created) | Open balance after partial/full payment | |
| 3 | `Invoice.TotalAmt` | `totals.total` | `Agreement__c.Invoice_Total__c` (field to be created) | Total invoice amount | |
| 4 | `Payment.TxnDate` | `payment.paidDate` | `Agreement__c.Last_Payment_Date__c` (field to be created) | Date of most recent payment | |
| 5 | `Invoice.EmailStatus` + `Invoice.Balance` (derived) | `status` | `Agreement__c.QB_Invoice_Status__c` (field to be created) | Open / Partially Paid / Paid | |

**Q3.2a** Confirm the desired Salesforce API field names for the new Agreement fields listed above (or we will use the pre-filled suggestions):
Answer:

---

### 3.3 — UC3 Field Mapping: Google Sheets / Excel → Salesforce Inventory__c

| # | Source: Holly's Worksheet Column | Canonical Field | Target: Salesforce Inventory__c Field | Pre-filled | Confirm? |
|---|---|---|---|---|---|
| 1 | Product Title | `name` | `Inventory__c.Product_Title__c` | Primary display label | |
| 2 | ISBN | `externalIds.isbn` | `Inventory__c.ISBN__c` (External ID / upsert key) | 13-digit ISBN | |
| 3 | Quantity on Hand | `inventory.quantityOnHand` | `Inventory__c.Quantity_On_Hand__c` | Raw QOH from Holly's count | |
| 4 | Committed Quantity | `inventory.quantityCommitted` | `Inventory__c.Committed_Quantity__c` | Open orders not yet fulfilled | |
| 5 | Available Quantity | `inventory.quantityAvailable` | `Inventory__c.Available_Quantity__c` | On Hand minus Committed | |
| 6 | Unit Cost | `pricing.costPrice` | `Inventory__c.Unit_Cost__c` | Cost per book (for valuation) | |
| 7 | Buffer % | `inventory.bufferPct` | `Inventory__c.Buffer_Pct__c` | Safety stock buffer per title | |

**Q3.3a** Will Chloe's team create the `Inventory__c` object with these exact field API names, or will DataSkate provide the field specification for them to use?
Answer: Chloe's team will use these names / DataSkate should send a field spec / Other:

---

### 3.4 — UC4 Field Mapping: QuickBooks Inventory Items → Salesforce Inventory__c

| # | Source: QuickBooks Item | Canonical Field | Target: Salesforce Inventory__c Field | Pre-filled | Confirm? |
|---|---|---|---|---|---|
| 1 | `Item.Name` | `name` | `Inventory__c.Product_Title__c` | Item name in QB | |
| 2 | `Item.Sku` | `externalIds.isbn` | `Inventory__c.ISBN__c` (upsert key) | ISBN stored in QB Item SKU field — confirm this is correct | |
| 3 | `Item.QtyOnHand` | `inventory.quantityOnHand` | `Inventory__c.Quantity_On_Hand__c` | QB QOH — auto-decremented on invoice creation | |
| 4 | `Item.PurchaseCost` | `pricing.costPrice` | `Inventory__c.Unit_Cost__c` | Unit cost from QB | |
| 5 | `Item.UnitPrice` | `pricing.listPrice` | `Inventory__c.List_Price__c` | List price from QB | |

**Q3.4a** In QuickBooks, where is the ISBN stored on inventory items — in the **SKU field**, the **Description**, or a custom field?
- *From sessions: Holly manages inventory by ISBN in QB. ISBNs are the primary product identifier.*
Answer:

**Q3.4b** Should UC4 upsert Salesforce Inventory records using ISBN as the External ID, or QB Item ID?
Answer: ISBN (preferred — stable across systems) / QB Item ID / Other:

---

## Section 4: Data Volume and Scheduling

**Q8.1** For UC2 (payment sync): approximately how many active QB Invoices will the nightly poll need to read through? (Helps size the batch window and ensure we complete within your QuickBooks Online API rate limits.)
Answer:

**Q8.2** For UC4 (inventory sync): approximately how many Inventory Items (SKU/ISBN combinations) are in QuickBooks today?
Answer:

**Q8.3** For UC3 (if Google Sheets): approximately how many rows are in Holly's inventory worksheet at peak (end-of-season)?
Answer:

**Q8.4** Are there any time windows when QuickBooks should NOT be polled? (e.g. if the QB admin runs month-end close processes that lock records from 10 PM–2 AM on the last day of each month.)
Answer:

**Q8.5** Is there a hard time deadline by which the nightly inventory sync (UC4) must complete — for example, "results must be in Salesforce by 7 AM so Holly can review before the day starts"?
Answer:

---

## Section 5: ISBN Mapping and Product Catalog

**Q9.1** How many unique program titles does AgileMind currently sell as print materials?
Answer:

**Q9.2** How many total ISBN variants (national + state-specific) are in use across all titles today?
Answer:

**Q9.3** Who is responsible for maintaining the ISBN lookup table in Salesforce once DataSkate builds it? Will that person have Salesforce admin access to update Custom Metadata records?
- *From sessions: Kailash proposed the configurable lookup table; Holly or Chloe's team would likely maintain it.*
Answer:

**Q9.4** When a new title or a new ISBN variant is introduced mid-year (new print run with a different ISBN), what is the current process for updating all systems? Who initiates the update?
- *From sessions: Holly raised this as a challenge — new ISBNs require manual oversight.*
Answer:

**Q9.5** When the state lookup fails (no matching ISBN found for a given state), should the integration:
a) Hold the Agreement and route it to a manual review queue
b) Create the QB Invoice anyway with a placeholder item, and flag for correction
c) Abort and send an alert to Crystal / Maria
- *From sessions: Kailash proposed routing to manual review queue. Maria agreed.*
Answer: Option a / Option b / Option c / Other:

---

## Section 6: Testing and Go-Live

**Q10.1** Is there a Salesforce **sandbox** environment DataSkate can use for integration testing (separate from your production Salesforce org)?
Answer:

**Q10.2** Does QuickBooks Online have a **sandbox company** we can use for testing, or will initial testing be done against a test Salesforce + a separate QBO test company?
- *Note: Intuit auto-provisions a sandbox per developer account. DataSkate will use that for initial QB integration testing.*
Answer: Use Intuit sandbox / Use a QBO test company / Other arrangement:

**Q10.3** Planned go-live is **July 15, 2026** (per project brief). Confirm: is this date still the target?
- *Risk flag: July 15 falls within the back-to-school production window (May–August). Order placement is in progress May/June and fulfillment peaks July/August. A July 15 go-live is feasible but requires zero downtime cutover. If any delays occur, we recommend moving go-live to September to avoid the production window.*
Answer: July 15 confirmed / Prefer September (after back-to-school) / Other:

**Q10.4** Who from AgileMind will serve as the primary integration testing contact and sign-off approver for UAT?
Answer:

**Q10.5** Are there any deployment freeze windows DataSkate should be aware of? (e.g. "no deployments to Salesforce production in July/August during fulfillment peak.")
Answer:

**Q10.6** AgileMind's fiscal year starts **April 1**. Will go-live need to align with fiscal year start, or is mid-year rollout acceptable?
- *From sessions: Maria confirmed April 1 fiscal year. Go-live was originally discussed for April 2026 and has slipped to July 2026.*
Answer:

---

## Section 7: Potential Additional Flows (Confirmation Needed)

The following flows were mentioned in discovery but not formally scoped. Please indicate your interest level for each.

**Q11.1** **Product/ISBN Catalog Sync — Salesforce Products ↔ QB Items**
- Context: Holly noted that maintaining two separate product lists (one in QB, one in Salesforce) for the same ISBNs creates divergence risk. A bi-directional or master-to-slave sync would standardize the catalog.
- Estimated complexity: Medium (depends on whether Salesforce Products or QB Items is the master)
Answer: Yes — include in scope / No — manage manually / Discuss later:

**Q11.2** **Opportunity Demand Visibility — Salesforce Open Opportunities → Inventory Dashboard**
- Context: Holly reviews open opportunities to forecast inventory demand. Making pipeline visibility a native part of the inventory dashboard would eliminate her manual report-building step.
- Estimated complexity: Low (read-only Salesforce data surfaced on the Inventory__c dashboard)
Answer: Yes — include in scope / No — manage manually / Discuss later:

**Q11.3** **Invoice Overdue Alert — QB Overdue Invoices → Email/Slack Notification to Crystal/Maria**
- Context: Collections follow-up is currently manual. An automated alert when an invoice passes its due date would reduce Crystal's manual monitoring burden.
- Estimated complexity: Low (outbound notification only — no write-back to QB or Salesforce required)
Answer: Yes — include in scope / No — manage manually / Discuss later:

---

## Section 8: Pricing Confirmation

Based on the confirmed scope, DataSkate has pre-calculated the following engagement pricing for your review:

| Item | Detail | Amount |
|---|---|---|
| Confirmed flow count | UC1 + UC2 + UC3 + UC4 | **4 flows** |
| Kickoff retainer (1–5 flows) | One-time, credited against first 6-month period | **$2,500** |
| IaaS — Period 1 (6 months) | 4 flows × $250/mo × 6 months | **$6,000** |
| IaaS — Period 2 (months 7–12) | 4 flows × $262.50/mo × 6 months | **$6,300** |
| IaaS total — 12 months | | **$12,300** |
| Implementation only (alternative) | 4 flows × $3,500/flow | **$14,000** |
| Estimated build timeline | 2 weeks setup + 4 flows × 1.5 weeks/flow | **~8 weeks from signed SOW** |

**Q12.1** Have you had a chance to review the pricing model with Linda (CFO)? Are there any budget or approval questions we should address before finalizing the SOW?
Answer:

**Q12.2** Are any of the three potential additional flows (Q11.1–Q11.3) likely to be added to scope? If yes, we can revise pricing accordingly.
Answer:

---

## [INTERNAL] Section 9: Architecture Pre-Decisions

*Do not share this section with the client. For DataSkate technical team use only.*

**Pre-decisions locked for architecture phase:**
1. **Auth model**: Salesforce = OAuth JWT (service account). QB = OAuth 2.0 Authorization Code with refresh token stored in CloudHub Secrets Manager.
2. **QB update pattern**: No PATCH — all QB updates via POST with full object + current SyncToken (retrieved via GET immediately before each POST). See FK-017.
3. **QB token management**: MuleSoft QBO connector handles 60-min token refresh automatically when configured with refresh token. For batch flows exceeding 60 min, implement 401-detect → refresh → retry wrapper. See FK-017.
4. **QB version gate**: If Q4.1 answer is anything other than "QuickBooks Online (cloud)" — escalate immediately to Kailash. QB Desktop requires completely different architecture (QBXML / Windows Web Connector). See FK-020.
5. **Google Sheets**: Use service-account auth (no user OAuth prompt required for unattended flow). Sheet must be shared with DataSkate service account email.
6. **Salesforce trigger for UC1**: Prefer Platform Event or CDC on Agreement__c rather than polling. Requires Chloe to confirm CDC is enabled in their org.
7. **ISBN lookup table**: Custom Metadata Type in Salesforce is the recommended approach. Supports runtime update without code deployment. Kailash proposed this; Maria agreed.
8. **Inventory committed/available**: Must be calculated in the integration layer or in Salesforce (QOH - committed = available). Committed quantity is derived from open Agreement line items, not directly available from QB.
9. **Back-to-school deployment risk**: Go-live target July 15, 2026. Back-to-school fulfillment peaks July–August. Recommend cutover on a Tuesday at off-peak hours (early AM CT) with Crystal and Maria on standby. If anything slips past July 1, recommend rescheduling to September.
10. **Realmid storage**: QBO realmId must be stored in CloudHub Secrets Manager, not in property files or app configuration. Retrieve at flow startup.

---

*End of intake questionnaire — AgileMind — generated by Scout on 2026-05-13*
