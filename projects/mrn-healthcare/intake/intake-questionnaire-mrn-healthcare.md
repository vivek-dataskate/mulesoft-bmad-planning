# MRN (Med Results Network) — MuleSoft Integration Intake Questionnaire
**Prepared by:** Scout / DataSkate  
**Date:** 2026-05-11  
**Source files:** `MRN __ Salesforce Integration [Hold] - 2026_05_05 08_30 PDT - Transcript (3).pdf`, WhatsApp scoping images  
**Architect:** Vivek Yadlapalli  

---

**Instructions for client:**  
Pre-filled answers below are drawn from the May 5 scoping call — please leave or correct them.  
Blank `Answer:` lines are genuine unknowns — your input here unblocks the architecture phase.  
Return this document with responses filled in. No checkboxes, no forms — just plain text edits inline.

---

## Section 1: Use Cases

> **10 flows were identified from the scoping call and shared integration diagram. Each is treated as a separate, independently deployable integration.**

---

### UC1 — WordPress Member Intake
**What we understood:**
- A new or returning member completes a Gravity Forms form on the WordPress website
- MuleSoft receives the form submission via HTTP webhook (Gravity Forms Webhook Add-On)
- MuleSoft creates or updates an Account + Contact record in Salesforce
- MuleSoft simultaneously adds or updates the contact in Mailchimp (member audience)
- This resolves the current 55-member onboarding backlog and prevents future manual entry

**Trigger:** Inbound HTTP POST from Gravity Forms webhook  
**Source:** WordPress / Gravity Forms  
**Targets:** Salesforce (Account + Contact), Mailchimp (audience member)  
**Complexity:** Medium  
[INFERRED from: 'there's been a backlog because of that connectivity issue' — scoping call; Gravity Forms explicitly named by Basil Rizwan]

→ See **Section 3.2** for pre-filled field mapping.

**Open questions — UC1:**

UC1-Q1: What is the exact name of the External ID field in Salesforce used to deduplicate member records? (Our best guess: `NPI__c` on Account — confirm or provide the correct field name.)  
Answer:

UC1-Q2: What Gravity Forms license tier is the MRN WordPress install on? (The Webhook Add-On requires Developer or Elite license. If on Basic or Pro, this integration requires a different trigger method.)  
[SYSTEM: Gravity Forms] Answer:

UC1-Q3: Which Mailchimp audience (list) should new members be added to? (Best guess: "Members — Full Database" based on the call discussion.)  
[SYSTEM: Mailchimp] Answer:

UC1-Q4: Is the lat/long for each practice currently collected in the Gravity Forms form? Or is it calculated after submission?  
Answer:

UC1-Q5: When a returning member resubmits the form (e.g., updating contact info), should MuleSoft update the existing Salesforce record or create a new one? Best guess: upsert (update if NPI found, create if not).  
Answer:

**Scope Boundary — UC1:**  
✅ IN SCOPE: Receive Gravity Forms submission, create/update Salesforce Account + Contact, add/update contact in Mailchimp audience.  
⚠️ ASSUMED PRE-EXISTS: Salesforce Account and Contact objects with required custom fields (NPI__c or equivalent External ID). Gravity Forms Webhook Add-On installed (Developer or Elite license). Mailchimp audience exists. WordPress SMTP issue is a separate matter — MuleSoft bypasses WordPress SMTP entirely.  
❌ OUT OF SCOPE: Salesforce object design, field creation, validation rules, page layouts. Mailchimp audience creation. WordPress SMTP fix. Campaign creation or email scheduling.

---

### UC2 — Welcome Email Automation
**What we understood:**
- When a new member is confirmed (triggered after UC1 Salesforce write succeeds), MuleSoft triggers a Mailchimp welcome email to the new member
- This resolves the current SMTP issue blocking automatic welcome emails
- MuleSoft bypasses WordPress SMTP entirely — sends the trigger directly to Mailchimp

**Trigger:** Salesforce record creation event (downstream of UC1) OR direct trigger from UC1 flow  
**Source:** WordPress (new member event)  
**Target:** Mailchimp (trigger welcome automation)  
**Complexity:** Low  
[INFERRED from: 'we've got to have an automated system that says yeah' and 'the SMTP issue preventing automated welcome emails' — Jeff and Caralina, scoping call]

**Open questions — UC2:**

UC2-Q1: Does a Mailchimp welcome automation/journey already exist and is it active? If yes, MuleSoft adds the contact to the audience and Mailchimp sends the email automatically. If no, a one-time setup is needed in Mailchimp before go-live.  
[SYSTEM: Mailchimp] Answer:

UC2-Q2: Should the welcome email be sent as part of the UC1 flow (same transaction) or as a separate flow triggered by a Salesforce Platform Event after the Account is created?  
Best guess: same transaction (simpler, faster to go-live).  
Answer:

**Scope Boundary — UC2:**  
✅ IN SCOPE: Trigger Mailchimp welcome email automation upon new member creation.  
⚠️ ASSUMED PRE-EXISTS: Mailchimp welcome journey/automation exists and is active. Sending domain is verified. Unsubscribe/compliance setup is client responsibility.  
❌ OUT OF SCOPE: Email template design, content, journey creation, deliverability, CAN-SPAM/CASL compliance configuration.

---

### UC3 — Shopify Store 1 Customer Sync
**What we understood:**
- When a customer is created or updated in Shopify Store 1, MuleSoft receives the event via Shopify webhook
- MuleSoft creates or updates the corresponding Account + Contact in Salesforce
- Represents member practices purchasing through Shopify Store 1 (consumables / main product store)

**Trigger:** Shopify webhook (customers/create, customers/update)  
**Source:** Shopify Store 1  
**Target:** Salesforce (Account + Contact)  
**Complexity:** High  
[EXPLICIT: WhatsApp integration diagram — "Shopify Store 1 Customer Sync — Customer Create & updates"]

→ See **Section 3.3** for pre-filled field mapping.

**Open questions — UC3:**

UC3-Q1: What is the Shopify Store 1 URL (shopName)? Example: `medresults-consumables.myshopify.com`  
[SYSTEM: Shopify] Answer:

UC3-Q2: If a Shopify customer email matches an existing Salesforce Contact, should MuleSoft update the existing record or create a new one? Best guess: upsert (update if email match found).  
Answer:

**Scope Boundary — UC3:**  
✅ IN SCOPE: Receive Shopify Store 1 customer webhook, create/update Salesforce Account + Contact.  
⚠️ ASSUMED PRE-EXISTS: Shopify Store 1 is live and configured. Shopify webhook subscriptions for customer events will be configured by DataSkate against the MuleSoft endpoint URL at go-live. Salesforce Account + Contact objects have External ID fields for Shopify customer ID. Shopify Store 1 and Store 2 each require a separate connector configuration.  
❌ OUT OF SCOPE: Product sync, inventory, fulfillment (explicitly out of scope). Shopify store setup. Order processing (separate flow — UC4).

---

### UC4 — Shopify Store 1 Order Sync
**What we understood:**
- When a new order is placed in Shopify Store 1, MuleSoft receives the order webhook
- MuleSoft creates a purchase/order record in Salesforce linked to the member Account
- This enables contract utilization tracking and the "top 10% high-utilizer" visibility Jeff requested

**Trigger:** Shopify webhook (orders/create)  
**Source:** Shopify Store 1  
**Target:** Salesforce (custom Order/Purchase object)  
**Complexity:** High  
[EXPLICIT: WhatsApp integration diagram — "Shopify Store 1 Order Sync — New Order Creation"]

→ See **Section 3.4** for pre-filled field mapping.

**Open questions — UC4:**

UC4-Q1: Does a custom Salesforce object exist for tracking member purchases/orders? If yes, what is its API name? If no, we need Salesforce admin to create it before go-live.  
Best guess: custom object named `Purchase__c` or `Contract_Utilization__c`.  
Answer:

UC4-Q2: Should MuleSoft create Salesforce records for order line items as a related object (one record per product line) or as a summarized single record per order?  
Best guess: summarized single record per order (simpler to query for utilization reports).  
Answer:

UC4-Q3: **Shopify orders: are we scoping ONLY new order creation, or also cancellations and returns?**  
(Confirmed out of scope per your image notes: fulfillment and shipment not in scope. Please confirm: cancellation/return events out of scope too?)  
Answer:

UC4-Q4: **Are Shopify Store 1 and Store 2 selling the same products, or different product catalogs?**  
(Raised in your own open questions in the scoping image. Best guess from transcript: Store 1 = main consumables store, Store 2 = LegitScript certification-related. Confirm.)  
Answer:

**Scope Boundary — UC4:**  
✅ IN SCOPE: Receive new order webhook from Shopify Store 1, create order/purchase record in Salesforce linked to member.  
⚠️ ASSUMED PRE-EXISTS: Salesforce custom object for purchase/order records exists with required fields. Shopify Store 1 order webhook configured.  
❌ OUT OF SCOPE: Fulfillment, shipment tracking, returns, cancellations (confirm above). Product catalog sync, inventory (explicitly out of scope).

---

### UC5 — Shopify Store 2 Customer Sync
**What we understood:**
- Identical logic to UC3, but connected to Shopify Store 2 (separate instance, separate credentials)
- Requires a separate connector configuration — cannot reuse Store 1 credentials
- [SYSTEM: Shopify] FK-014 applies: two Shopify stores = two separate connector configs in global-config.xml

**Trigger:** Shopify webhook (customers/create, customers/update) — Store 2  
**Source:** Shopify Store 2  
**Target:** Salesforce (Account + Contact)  
**Complexity:** High  

**Open questions — UC5:**

UC5-Q1: What is the Shopify Store 2 URL (shopName)?  
[SYSTEM: Shopify] Answer:

UC5-Q2: Is the LegitScript certification status update part of the customer sync for Store 2 (via customer.tags), or is it triggered by a specific order/product purchase in Store 2?  
[TRIGGERED BY: 'we've got to create a new field in Salesforce for everybody who's legit script certified. That's part of one of our Shopify things' — Jeff, scoping call]  
Best guess: when a customer purchases a specific LegitScript certification product SKU in Store 2, a boolean field (`LegitScript_Certified__c`) on the Salesforce Account is set to true.  
Answer:

**Scope Boundary — UC5:** Same as UC3. Separate MuleSoft connector config for Store 2 credentials.

---

### UC6 — Shopify Store 2 Order Sync
**What we understood:**
- Identical logic to UC4, but for Shopify Store 2 orders
- Tagged with "Store 2" in the Salesforce order record for source tracking

**Trigger:** Shopify webhook (orders/create) — Store 2  
**Source:** Shopify Store 2  
**Target:** Salesforce (custom Order/Purchase object)  
**Complexity:** High  

**Open questions — UC6:** None beyond UC4 answers (same object model assumed). Field mapping: same as Section 3.4 but with `Purchase__c.Store__c = "Store 2"`.

**Scope Boundary — UC6:** Same as UC4. Independent flow — not combined with Store 1.

---

### UC7 — Mailchimp Engagement Sync
**What we understood:**
- When members interact with Mailchimp campaigns (open, click, unsubscribe), Mailchimp pushes webhook events to MuleSoft
- MuleSoft updates the corresponding Salesforce Contact with behavioral engagement data
- This enables the "behavioral segmentation" capability Jeff called out — replacing "spaghetti marketing"
- Updates at "Campaign Level" per the integration diagram

**Trigger:** Inbound Mailchimp webhook (open, click, unsubscribe events)  
**Source:** Mailchimp  
**Target:** Salesforce (Contact, Campaign Member)  
**Complexity:** Medium  
[EXPLICIT: WhatsApp diagram — "Mailchimp Engagement Sync — Status Update at Campaign Level"]

→ See **Section 3.5** for pre-filled field mapping.

**Open questions — UC7:**

UC7-Q1: Are Salesforce Campaigns used currently? If yes, should engagement events update CampaignMember status (per campaign), or should they update a field directly on the Contact?  
Answer:

UC7-Q2: When a member unsubscribes from one Mailchimp campaign/vendor audience, should the Salesforce Contact be marked as Email Opt Out globally? Or should it only flag opt-out for that specific vendor?  
(Context: Caralina mentioned vendor-specific unsubscribes should NOT affect other vendor communications.)  
Answer:

**Scope Boundary — UC7:**  
✅ IN SCOPE: Receive Mailchimp webhook events (opens, clicks, unsubscribes), update Salesforce Contact engagement fields.  
⚠️ ASSUMED PRE-EXISTS: Mailchimp webhooks are available on your current plan (all paid plans). Salesforce Contact has engagement fields available. Mailchimp webhook URL will be configured to point to the MuleSoft endpoint.  
❌ OUT OF SCOPE: Campaign creation, email scheduling, content management. Mailchimp analytics reporting. Salesforce Campaign setup.

---

### UC8 — PharmacyHub Utilization Import
**What we understood:**
- PharmacyHub delivers utilization reports (member purchase data by contract) to an SFTP location
- MuleSoft polls the SFTP location on a schedule, picks up the file, parses it, and upserts utilization records to Salesforce
- "Considering only SFTP" — confirmed: API integration with PharmacyHub is NOT being explored

**Trigger:** Scheduled SFTP file poll (frequency TBD)  
**Source:** PharmacyHub (SFTP file)  
**Target:** Salesforce (utilization/contract records)  
**Complexity:** High  
[INFERRED from: 'Considering only SFTP' — integration diagram; 'we get utilization reports... they're probably just sitting in your email' — Caralina, scoping call]

**Open questions — UC8:**

UC8-Q1: What is the SFTP server host, port, and authentication method for the PharmacyHub file drop?  
(Credentials to be shared separately via secure channel — confirm the authentication type: username/password or private key.)  
[SYSTEM: SFTP] [TRIGGERED BY: file/SFTP signal] Answer:

UC8-Q2: Based on standard GPO utilization report formats, we expect the PharmacyHub file to look like this. Please confirm each column name is correct, flag any that differ, and add any columns we're missing:

| Our best-guess column name | Correct column name in your file | Notes |
|---|---|---|
| Member_ID or Account_Number | | Unique identifier for the practice |
| Practice_Name | | |
| Contract_Number | | GPO contract identifier |
| Manufacturer | | |
| Product_Description | | |
| NDC_Code | | National Drug Code (if pharmaceutical) |
| Purchase_Date or Period | | Date or month/year of purchase |
| Units_Quantity | | |
| Purchase_Amount | | Dollar amount of purchase |
| Fee_Amount | | DataSkate's fee on this transaction |
| Invoice_Number | | |

File format best guess: CSV, monthly drop, one row per transaction.  
Answer (confirm or correct the table above):

UC8-Q3: What is the file naming convention? How do you know a file is ready for processing? (e.g., presence of a specific filename pattern, or a `.done` flag file)  
[TRIGGERED BY: file/SFTP signal] Answer:

UC8-Q4: What frequency does PharmacyHub drop files? (Daily, weekly, monthly?)  
Answer:

UC8-Q5: What Salesforce object should utilization data be written to? (e.g., a custom `Contract_Utilization__c` object with fields: Member, Contract, Purchase Amount, Month/Period, Vendor)  
Answer:

UC8-Q6: What is the unique record identifier in the PharmacyHub file used to deduplicate records in Salesforce on repeat loads?  
Answer:

**Scope Boundary — UC8:**  
✅ IN SCOPE: Poll SFTP location, read PharmacyHub file, parse, transform, upsert utilization records to Salesforce.  
⚠️ ASSUMED PRE-EXISTS: PharmacyHub SFTP server is accessible from CloudHub 2.0 (outbound IP allowlist may be needed — confirm firewall rules). Salesforce utilization object exists with required fields. SFTP credentials provided to DataSkate before go-live.  
❌ OUT OF SCOPE: PharmacyHub SFTP server setup and maintenance. Salesforce object/field design. File generation by PharmacyHub.

---

### UC9 — Pipeline Medical Utilization Import
**What we understood:**
- Identical pattern to UC8, but for Pipeline Medical as the data source
- Separate SFTP location, separate file format (likely similar structure)
- Treated as a completely separate flow — not merged with UC8

**Trigger:** Scheduled SFTP file poll  
**Source:** Pipeline Medical (SFTP file)  
**Target:** Salesforce (utilization/contract records)  
**Complexity:** High  

**Open questions — UC9:**

UC9-Q1: Same SFTP server as PharmacyHub, or a different SFTP host?  
[SYSTEM: SFTP] Answer:

UC9-Q2: Pipeline Medical is a GPO distributor for aesthetics practices — we expect a similar utilization report structure to PharmacyHub (UC8-Q2 above). Our best guess for Pipeline Medical columns:

| Our best-guess column name | Correct column name in your file | Notes |
|---|---|---|
| Member_ID or Account_Number | | |
| Practice_Name | | |
| Product_Category | | e.g. Injectables, Surgical, Pharma |
| Product_Description | | |
| NDC_or_SKU_Code | | |
| Purchase_Date or Period | | |
| Units_Quantity | | |
| Purchase_Amount | | |
| Fee_Amount | | |
| Distributor_Invoice | | |

Please confirm which columns match Pipeline Medical's actual report and flag any differences from PharmacyHub's format.  
Answer:

UC9-Q3: What frequency does Pipeline Medical drop files?  
Answer:

UC9-Q4: Same Salesforce utilization object as PharmacyHub (UC8), with a "Vendor" field to distinguish, or separate object?  
Best guess: same object with a `Source_Vendor__c = "Pipeline Medical"` tag.  
Answer:

**Scope Boundary — UC9:** Same as UC8 — substitute Pipeline Medical SFTP credentials and file format. Independent flow.

---

### UC10 — Vendor Report File Processing
**What we understood:**
- Additional utilization vendors (beyond PharmacyHub and Pipeline Medical) will push data to a REST API endpoint that MuleSoft exposes
- "API to be exposed" = MuleSoft acts as the inbound API — vendors POST their report data to a MuleSoft HTTP listener
- MuleSoft validates, transforms, and writes the vendor data to Salesforce

**Trigger:** Inbound HTTP POST from vendor system (REST API call)  
**Source:** External vendor API caller  
**Target:** Salesforce (utilization/contract records)  
**Complexity:** High  
[EXPLICIT: WhatsApp diagram — "Vendor Report File Processing — Considering API to be exposed"]

**Open questions — UC10:**

UC10-Q1: How many vendors will use this inbound API endpoint? Is this one endpoint for all vendors, or separate endpoints per vendor?  
Answer:

UC10-Q2: What authentication will vendors use to call the MuleSoft endpoint? Best guess: API key per vendor.  
Answer:

UC10-Q3: What is the expected payload format from vendors? (JSON, XML, CSV?) Can you provide a sample vendor payload?  
Answer:

UC10-Q4: Is the Vendor Report API completely separate from PharmacyHub and Pipeline Medical, or are PharmacyHub/Pipeline Medical expected to eventually migrate from SFTP to this API?  
Answer:

**Scope Boundary — UC10:**  
✅ IN SCOPE: Expose a secure HTTP API endpoint, accept vendor POST payloads, validate, transform, write to Salesforce.  
⚠️ ASSUMED PRE-EXISTS: Salesforce utilization objects and fields exist (same as UC8/UC9). Vendor has agreed to DataSkate's API spec and will implement the call on their side. API credentials managed by DataSkate.  
❌ OUT OF SCOPE: Vendor system changes to call our API. API documentation for vendors beyond the spec DataSkate generates.

---

### Potential Additional Flows — Scope Confirmation

> These flows were NOT named in your scoping documents, but are common for this system combination and business model. Please confirm: intentionally out of scope, or should they be included?

**[POTENTIAL FLOW 1: Salesforce existing members → Mailchimp historical sync]**  
Context: The 55-member backlog and any historical Salesforce contacts not yet in Mailchimp need to be added. The UC1 flow handles NEW members going forward but does not backfill existing ones.  
Confirm: Is this intentionally out of scope (you'll handle manually), or should a one-time bulk migration be included?  
Answer:

**[POTENTIAL FLOW 2: LegitScript certification event → Salesforce field update (standalone)]**  
Context: Jeff said "when they get certified, it automatically finds them in our database and says yes, they're legit script certified." If LegitScript certification is a distinct Shopify product purchase (not part of the general order sync), this may need to be a separate flow with its own business logic — not just a tag in the customer sync.  
Confirm: Is LegitScript certification triggered by a specific product SKU purchase in Shopify Store 2, and does it need field-level logic beyond what the standard order sync provides?  
Answer:

**[POTENTIAL FLOW 3: Inactive member identification → notification or suppression]**  
Context: Jeff mentioned wanting to "kick out inactive members." This may require a scheduled Salesforce scan flow that flags or suppresses contacts with no purchase activity in a defined period (e.g., 12 months), then triggers a notification to the MRN team or suppresses them in Mailchimp.  
Confirm: Is this in scope for this engagement, or a future phase?  
Answer:

---

## Section 2: Systems and Access

**2.1** For each system below, confirm: cloud or on-premise?  

| System | Cloud / On-Prem | Confirmed |
|---|---|---|
| Salesforce | Cloud | Answer: |
| Shopify Store 1 | Cloud | Answer: |
| Shopify Store 2 | Cloud | Answer: |
| WordPress / Gravity Forms | Cloud (hosted WordPress) | Answer: |
| Mailchimp | Cloud | Answer: |
| PharmacyHub SFTP | ? | Answer: |
| Pipeline Medical SFTP | ? | Answer: |

**2.2** For each system, do you have sandbox / test environments available?  

| System | Sandbox Available | Sandbox URL / Details |
|---|---|---|
| Salesforce | Answer: | Answer: |
| Shopify Store 1 | Answer: | Answer: |
| Shopify Store 2 | Answer: | Answer: |
| Mailchimp | Answer: | Answer: |
| PharmacyHub | Answer: | Answer: |
| Pipeline Medical | Answer: | Answer: |

**2.3** Do you currently have an Anypoint Platform subscription? If yes, what tier and how many vCores are allocated?  
Answer:

**2.4** Do you have any existing published assets on Anypoint Exchange to reuse?  
Answer:

**2.5** Are there existing integrations at risk of being broken by this work? (e.g., anything already connecting Shopify or Gravity Forms to Salesforce — even manual exports or Zapier automations)  
Answer:

---

## Section 3: Data and Field Mapping

**3.1** External ID fields — for idempotent upsert, Salesforce needs an External ID field on each synced object. Please confirm which fields will serve as External IDs:

| Object | External ID Field Name | Field Exists? |
|---|---|---|
| Account (from Gravity Forms) | NPI__c (best guess) | Answer: |
| Account (from Shopify Store 1) | Shopify_Store1_Customer_ID__c (best guess) | Answer: |
| Account (from Shopify Store 2) | Shopify_Store2_Customer_ID__c (best guess) | Answer: |
| Purchase/Order (from Shopify) | Shopify_Order_ID__c (best guess) | Answer: |
| Utilization (from PharmacyHub) | PharmacyHub_Record_ID__c (best guess) | Answer: |
| Utilization (from Pipeline Medical) | Pipeline_Record_ID__c (best guess) | Answer: |

---

**3.2 Field Mapping — UC1: Gravity Forms → Salesforce + Mailchimp**

*Gravity Forms → Salesforce Account:*

| Source Field (Gravity Forms) | Target Field (Salesforce) | Notes |
|---|---|---|
| Practice / Business Name | Account.Name | Required |
| NPI Number | Account.NPI__c | Confirm field name — used as External ID for deduplication |
| Practice Type | Account.Practice_Type__c | Confirm picklist values: Med Spa / Plastic Surgery / Dermatology / Other |
| Specialty | Account.Specialty__c | Confirm field name |
| Billing Street | Account.BillingStreet | |
| Billing City | Account.BillingCity | |
| Billing State | Account.BillingState | |
| Billing Zip | Account.BillingPostalCode | |
| Latitude | Account.BillingLatitude | Jeff mentioned lat/long — confirm if your form collects this |
| Longitude | Account.BillingLongitude | |

*Gravity Forms → Salesforce Contact:*

| Source Field (Gravity Forms) | Target Field (Salesforce) | Notes |
|---|---|---|
| Contact First Name | Contact.FirstName | |
| Contact Last Name | Contact.LastName | |
| Contact Email | Contact.Email | Required — deduplication key |
| Contact Phone | Contact.Phone | |
| Contact Role / Title | Contact.Title | Confirm field |

*Gravity Forms → Mailchimp:*

| Source Field (Gravity Forms) | Target Mailchimp Field | Notes |
|---|---|---|
| Contact Email | Email Address | Required — list key |
| Contact First Name | FNAME merge tag | |
| Contact Last Name | LNAME merge tag | |
| Practice Name | COMPANY merge tag | |
| Practice Type | PRACTICE_TYPE (custom merge tag) | Confirm if this merge tag exists in your Mailchimp account |

Please confirm or correct these mappings. Add any Gravity Forms fields not listed above.  
Answer:

---

**3.3 Field Mapping — UC3 / UC5: Shopify Customer → Salesforce**

*Applies to both Store 1 (UC3) and Store 2 (UC5) — same mapping, different source credentials.*

| Source Field (Shopify) | Target Field (Salesforce) | Notes |
|---|---|---|
| customer.id | Account.Shopify_Store1_Customer_ID__c | External ID — Store 2 uses Shopify_Store2_Customer_ID__c |
| customer.email | Contact.Email | Deduplication key — lookup existing Contact |
| customer.first_name | Contact.FirstName | |
| customer.last_name | Contact.LastName | |
| customer.phone | Contact.Phone | |
| customer.default_address.company | Account.Name | Practice name |
| customer.default_address.address1 | Account.BillingStreet | |
| customer.default_address.city | Account.BillingCity | |
| customer.default_address.province | Account.BillingState | |
| customer.default_address.zip | Account.BillingPostalCode | |
| customer.default_address.country | Account.BillingCountry | |
| customer.tags | Account.Customer_Tags__c | Comma-separated — includes LegitScript flag if applicable |

Please confirm or correct these mappings.  
Answer:

---

**3.4 Field Mapping — UC4 / UC6: Shopify Order → Salesforce**

*Applies to both Store 1 (UC4) and Store 2 (UC6). UC6 uses `Purchase__c.Store__c = "Store 2"` instead of "Store 1".*

| Source Field (Shopify) | Target Field (Salesforce) | Notes |
|---|---|---|
| order.id | Purchase__c.Shopify_Order_ID__c | External ID — confirm object and field name |
| order.name | Purchase__c.Order_Number__c | e.g., #1001 |
| order.email | Contact / Account lookup by Email | Links order to member |
| order.created_at | Purchase__c.Order_Date__c | |
| order.total_price | Purchase__c.Total_Amount__c | |
| order.financial_status | Purchase__c.Payment_Status__c | paid/pending/refunded — confirm picklist values |
| order.line_items[].title | Purchase_Line__c.Product_Name__c | Confirm if line items stored separately |
| order.line_items[].price | Purchase_Line__c.Unit_Price__c | |
| order.line_items[].quantity | Purchase_Line__c.Quantity__c | |
| "Store 1" / "Store 2" (metadata) | Purchase__c.Store__c | Tag to distinguish Store 1 vs Store 2 |

Please confirm or correct these mappings.  
Answer:

---

**3.5 Field Mapping — UC7: Mailchimp Engagement → Salesforce**

| Source Field (Mailchimp) | Target Field (Salesforce) | Notes |
|---|---|---|
| data.email | Contact.Email | Lookup key |
| data.action (open/click) | Contact.Last_Email_Activity__c | Confirm field — or use Campaign Member Status |
| data.campaign_id | Campaign__c lookup by Mailchimp Campaign ID | Confirm if Campaigns exist in Salesforce |
| fired_at (timestamp) | Contact.Last_Engaged_Date__c | |
| data.action = unsubscribe | Contact.Email_Opt_Out = true | Confirm unsubscribe should set this |

Please confirm or correct these mappings.  
Answer:

---

**3.6** Are there any known data quality issues in source systems? (e.g., duplicate Shopify customers, inconsistent practice names, missing NPI numbers in Gravity Forms submissions)  
Answer:

**3.7** Reference / lookup data: are there shared lookup tables we need to sync? (e.g., product codes, contract IDs, vendor codes that need to match between Shopify/PharmacyHub and Salesforce)  
Answer:

**3.8** Salesforce State and Country Picklists: is this feature enabled in your Salesforce org? (Affects how billing address fields are written — our system handles both cases.)  
[SYSTEM: Salesforce] Answer:

**3.9** Is this a multi-currency Salesforce org?  
[SYSTEM: Salesforce] Answer:

---

## Section 4: Volume and Performance

**4.1** Transaction volumes per flow:

| Flow | Current Volume | Projected 12-Month Volume | Peak Period |
|---|---|---|---|
| UC1: Gravity Forms member intake | ~55/month backlog; ongoing TBD | Answer: | Answer: |
| UC2: Welcome email | Same as UC1 | | |
| UC3: Shopify Store 1 customer sync | Answer: | Answer: | Answer: |
| UC4: Shopify Store 1 order sync | Answer: | Answer: | Answer: |
| UC5: Shopify Store 2 customer sync | Answer: | Answer: | Answer: |
| UC6: Shopify Store 2 order sync | Answer: | Answer: | Answer: |
| UC7: Mailchimp engagement sync | Answer: (email opens/clicks across 4,000 members) | Answer: | Answer: |
| UC8: PharmacyHub utilization import | Answer: (records per file drop) | Answer: | Answer: |
| UC9: Pipeline Medical utilization import | Answer: | Answer: | Answer: |
| UC10: Vendor Report API | Answer: | Answer: | Answer: |

**4.2** Maximum acceptable latency:  
- Member onboarding (UC1/UC2): Answer: (best guess: under 10 seconds — member expects near-instant confirmation)  
- Shopify order sync (UC4/UC6): Answer: (best guess: async OK — within 5 minutes of order placement)  
- Utilization imports (UC8/UC9): Answer: (best guess: same-day processing is sufficient)  
- Mailchimp engagement sync (UC7): Answer: (best guess: within 1 hour of event)  

**4.3** Uptime SLA required: best-effort / 99.9% / 99.99%?  
Answer:

---

## Section 5: Security and Compliance

**5.1** Is PII being transmitted? (Yes — member names, email addresses, practice addresses, phone numbers.)  
Please confirm: does any flow involve health record data, patient data, or physician prescribing data that would be subject to HIPAA?  
Best guess: No — MRN handles practice/member business data, not patient health records.  
Answer:

**5.2** Regulatory compliance requirements: HIPAA / PCI-DSS / GDPR / CCPA / other?  
Answer:

**5.3** Authentication methods per system (for DataSkate to configure credentials):

| System | Auth Method | Notes |
|---|---|---|
| Salesforce | OAuth 2.0 JWT (Connected App) | Confirm: has a Connected App been created for MuleSoft? |
| Shopify Store 1 | API Key / Access Token | Confirm access token scope: read_customers, read_orders, write_webhooks |
| Shopify Store 2 | API Key / Access Token | Separate token from Store 1 |
| Mailchimp | API Key | Confirm API key available |
| PharmacyHub SFTP | Username/Password or Private Key | |
| Pipeline Medical SFTP | Username/Password or Private Key | |
| Vendor Report API | API Key (inbound — issued by DataSkate) | DataSkate generates and manages this |

**5.4** Data residency requirements: does any data need to stay in a specific region or country?  
Answer:

**5.5** Are there network or firewall restrictions that would block outbound calls from CloudHub 2.0? (e.g., SFTP servers or Salesforce org restricted by IP allowlist?)  
[TRIGGERED BY: file/SFTP signal] Answer:

---

## Section 6: Error Handling

**6.1** If Salesforce is unavailable when a Gravity Forms submission arrives — should MuleSoft:  
(a) Queue the message and retry up to 3 times over 5 minutes, then DLQ  
(b) Fail immediately and return an error to the user  
Best guess: (a) — retry with queue.  
Answer:

**6.2** If a PharmacyHub or Pipeline Medical SFTP file is malformed or fails validation:  
(a) Skip the bad file and alert the team  
(b) Process valid records, skip invalid rows, report exceptions at end  
(c) Fail entire run and do not process  
Best guess: (b) — partial processing with exception report.  
Answer:

**6.3** Who gets notified on integration failure? (email address, Slack channel, etc.)  
Answer:

**6.4** If MuleSoft processes a Shopify order and then Salesforce write fails — is the order at risk of being duplicated on retry? (idempotency)  
Best guess: handled automatically — MuleSoft uses the Shopify Order ID as External ID for upsert, so reprocessing is safe.  
Confirm: does the Salesforce External ID setup for orders support this? (See Section 3.1)  
Answer:

**6.5** Zero data-loss requirement: are any flows touching financial data or compliance records that would require guaranteed delivery and rollback if a step fails?  
Best guess: utilization data (UC8/UC9) is financial in nature — will treat as requiring guaranteed delivery.  
Answer:

---

## Section 7: Deployment and DevOps

**7.1** Deployment preference: CloudHub 2.0 (our default — fully managed, no infrastructure) / Runtime Fabric (self-hosted) / Hybrid?  
Best guess: CloudHub 2.0.  
Answer:

**7.2** Environments needed: dev + prod (our minimum) or dev + UAT + prod?  
Answer:

**7.3** CI/CD tools currently in use: GitHub Actions / Azure DevOps / Jenkins / none?  
Answer:

**7.4** Secrets management solution: AWS Secrets Manager / Azure Key Vault / HashiCorp Vault / none?  
Answer:

---

## Section 8: Operations and Support

**8.1** Monitoring tools already in use? (Splunk, Datadog, ELK, Azure Monitor, or Anypoint Monitoring only)  
Answer:

**8.2** Who owns operational support after go-live? (DataSkate provides managed service — this question is about who on the MRN/Gemini side is the point of contact for escalations)  
Answer:

**8.3** Is a client-facing operations dashboard or audit trail required? (e.g., "show me which member submissions were processed today")  
Answer:

---

## Section 9: Testing and Go-Live

**9.1** Test environments available for each connected system? (Confirmed in Section 2.2 — answering here enables test planning)  
Answer:

**9.2** Automated testing capability on your side for UAT sign-off? (Or will DataSkate coordinate UAT with your team manually?)  
Answer:

**9.3** What are the UAT acceptance criteria for this integration to be considered done? (e.g., "100 test member submissions processed, all appear in Salesforce within 10 seconds")  
Answer:

**9.4** Are there blackout periods for changes? (e.g., month-end processing, board meetings, trade shows)  
Answer:

**9.5** Go-live target: TBD (per project.json). Any hard deadlines or events driving urgency?  
Answer:

---

## Section 10: System-Specific Details

### [SYSTEM: Salesforce]

SF1: Has a MuleSoft Connected App been created in your Salesforce org? If yes, share the Client ID (not the secret — that goes via secure channel).  
Answer:

SF2: On your Salesforce org, are SOQL queries expected to return more than 2,000 records in a single query? (Relevant for utilization data queries.) Best guess: yes for aggregate reports on 4,000+ member org. DataSkate will use cursor-based pagination automatically.  
Answer:

SF3: What is your Salesforce org's daily API call limit? (Check Setup → System Overview → API Usage.) Our monitoring alerts at 80%.  
Answer:

---

### [SYSTEM: Shopify Store 1 and Store 2]

SH1: For each store, confirm the access token scopes needed:  
- `read_customers` (UC3/UC5)  
- `write_customers` (if MuleSoft ever writes back to Shopify — confirm if needed)  
- `read_orders` (UC4/UC6)  
- `write_webhooks` (DataSkate configures webhook subscriptions at go-live)  
Answer:

SH2: For Store 2 specifically — what is the exact Shopify product SKU or product type that identifies a LegitScript certification purchase? DataSkate will use this to apply conditional field logic in the order sync flow.  
Answer:

SH3: Are the two Shopify stores on the same Shopify Plus plan, or separate standard plans?  
Answer:

---

### [SYSTEM: Gravity Forms / WordPress]

WP1: Gravity Forms license tier: Basic / Pro / Developer / Elite? (Developer or Elite required for Webhook Add-On.)  
Answer:

WP2: Can you share a sample Gravity Forms member submission payload (JSON format from the webhook)? This is needed to build the DataWeave field mapping. Alternatively, share a screenshot of the form fields.  
Answer:

WP3: What is the WordPress hosting provider? (Kinsta, WP Engine, AWS, self-hosted?) — relevant for network routing.  
Answer:

---

### [SYSTEM: Mailchimp]

MC1: What Mailchimp plan tier are you on? (Context: Standard plan has a 5-audience limit, and you mentioned hitting it.)  
Answer:

MC2: Is the Mailchimp webhook feature available on your current plan? (Available on all paid Mailchimp plans — just confirm.)  
Answer:

MC3: What is the API key for MuleSoft's Mailchimp connection? (Share via secure channel — confirm this can be generated.)  
Answer:

---

### [SYSTEM: PharmacyHub]

PH1: Is PharmacyHub a vendor-managed SFTP server, or does MRN host the SFTP drop location?  
Answer:

PH2: What company/product is "PharmacyHub"? Is there a vendor portal or API documentation we can reference to understand the file format?  
Answer:

PH3: Are PharmacyHub utilization records keyed by a unique transaction ID, or by member ID + product + date?  
Answer:

---

### [SYSTEM: Pipeline Medical]

PM1: Same SFTP host as PharmacyHub, or a different server?  
Answer:

PM2: What company/product is "Pipeline Medical"? Is there documentation on the file format?  
Answer:

PM3: Same file format as PharmacyHub, or different?  
Answer:

---

## Internal Flags
> **DO NOT SEND TO CLIENT** — Architect must resolve before MD run.

1. **BLOCKER RISK — Gravity Forms license:** UC1 depends on Gravity Forms Webhook Add-On (Developer or Elite license). If MRN is on Basic or Pro, the trigger mechanism must change to polling (Pattern D scheduler polling the WordPress REST API for new form entries). This changes implementation complexity and timeline. Confirm via WP1 before architecture.

2. **BLOCKER RISK — Salesforce External ID fields:** Multiple flows require External ID fields on Account and Contact that likely do not exist yet (Shopify_Store1_Customer_ID__c, NPI__c, etc.). Salesforce admin must create these BEFORE integration testing. Flag to Gemini/Caralina as a dependency.

3. **BLOCKER RISK — Salesforce custom object for purchases/utilization:** UC4/UC6/UC8/UC9/UC10 all write to Salesforce objects that likely don't exist yet (`Purchase__c`, `Contract_Utilization__c`). Client's Salesforce admin must build these objects before architecture is finalized. Confirm with SF1.

4. **RISK — Shopify connector operation coverage (FK-005):** The registered `mule4-shopify-connector v1.1` uses `http-generic-config.xml` as its configTemplate — suggesting thin wrapper or limited operations. For webhook ingestion (UCs 3-6), the integration is inbound (MuleSoft as HTTP listener) so the Shopify connector may not be needed at all — inbound webhooks use the HTTP connector. Verify: is the Shopify connector only needed for outbound API calls back to Shopify? Architect to confirm connector selection.

5. **RISK — Multi-instance Shopify (FK-014):** Two Shopify stores require two separate `<shopify:config>` or HTTP connector config elements with different credentials. Se parate property sets: `shopify.store1.*` and `shopify.store2.*`. Flow logic must tag each record with its source store.

6. **RISK — Mailchimp connector coverage (FK-013 pattern):** `mule4-mailchimp-marketing-connector v1.0` is a low-version connector. Architect must verify Exchange coverage for add/update member operations before committing. Fallback: HTTP connector with API key auth (simpler and well-understood).

7. **UNKNOWN SYSTEM — PharmacyHub:** Not in connector registry. API type and format unknown. Will be file-based (SFTP) per scoping diagram. No playbook exists yet. Stub created. Architect must confirm SFTP file format and field structure before architecture.

8. **UNKNOWN SYSTEM — Pipeline Medical:** Same status as PharmacyHub. Stub created. Separate flow — do not combine with UC8.

9. **UNKNOWN SYSTEM — Vendor Report API (UC10):** "API to be exposed" suggests MuleSoft as HTTP listener. Need to confirm: who are the vendors, what format do they send, how many concurrent vendors. Could grow scope if multiple additional vendors are onboarded over time — raise with Jeff/Caralina.

10. **QUESTION — UC1 dual-target atomicity:** UC1 writes to BOTH Salesforce AND Mailchimp. If Salesforce write succeeds but Mailchimp add fails — does the flow retry Mailchimp only, or retry the entire flow? Confirm compensation strategy. Recommend: retry Mailchimp add separately (write-off on failure is acceptable for marketing list add).

11. **OPEN — AE pricing tier:** AE name is Jason Ng (MuleSoft). IsNewToDataSkate is unknown. Confirm with Vivek before pricing summary is finalized.

12. **OBSERVATION — LegitScript certification may be a separate flow:** If LegitScript certification is triggered by a specific product SKU purchase in Shopify Store 2 AND requires distinct business logic (e.g., a 30-day processing window, an external LegitScript API check), this becomes UC11 — a separate flow. Confirm UC5-Q2 before counting flows for pricing.

---

## Pricing Summary
> **INTERNAL — DO NOT SEND TO CLIENT**

**Flows confirmed:** 10  
**AE channel:** Unknown (Jason Ng, MuleSoft — confirm if new to DataSkate)  

| Scenario | Implementation Price |
|---|---|
| Standard (existing AE) | 10 × $3,500 = **$35,000** |
| New AE Introductory | $10,000 + (5 × $3,500) = **$27,500** |
| IaaS (AE sells $50k license) | **$0** (implementation only — still billed managed service) |

**Timeline:** 2 weeks requirements + 15 weeks development = **17 weeks from signed SOW**

**Managed service — 10 flows:**

| Period | Months | Rate/Flow/Month | 6-Month Payment |
|---|---|---|---|
| Period 1 | 1–6 | $150.00 | **$9,000** |
| Period 2 | 7–12 | $157.50 | $9,450 |
| Period 3 | 13–18 | $165.38 | $9,923 |
| Period 4 | 19–24 | $173.64 | $10,418 |

**2-year managed service total (10 flows):** $38,791  
**Recommended model:** Confirm AE status with Vivek before presenting. If New AE → $27,500 implementation + $38,791 managed = **$66,291 total engagement value**. If Standard → $35,000 + $38,791 = **$73,791 total engagement value**.

> Note: If LegitScript certification is confirmed as a separate UC11, flow count rises to 11. Pricing adjusts accordingly (+$3,500 implementation, +$150/month/flow managed).
