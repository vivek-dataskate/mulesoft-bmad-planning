# Intake Questionnaire — Peerless Fence Group
**Prepared by:** DataSkate · Raghuram Potluri (raghuram@dataskate.ai)
**Date:** May 12, 2026
**Source files:** MuleSoft Automation Starter SOW + Daily Sync transcripts Apr 14–17, 2026

---

**How to use this document:**
- Answers pre-filled from your scoping sessions are shown in *italics*. Leave them as-is or correct them.
- Lines marked `Answer:` are genuine unknowns — please fill in.
- The intent of every question is to prevent surprises during development. Blank answers = delays.
- Questions labeled `[INTERNAL]` are for our team only — please do not respond to those.

---

## Section 1: Use Cases

### UC1 — Cross-System Validation & Mismatch Detection

**What we understood:**
- Triggered when a new HD order arrives (lead status = "Final" in HD Portal) or a Salesforce opportunity is updated
- Pulls data from HD Portal, Salesforce, and ComputerEase and cross-references required fields (customer info, materials, pricing, contract values)
- Flags only material discrepancies for human review — minor mismatches filtered out
- Also performs Promotion SKU validation (UC4) and legal compliance checks (UC5) in the same orchestration

**Scope questions:**

**Q1.1** The SOW lists UC1 (field comparison), UC4 (SKU validation), and UC5 (legal compliance) as separate use cases but all have the same trigger (new HD order) and the same output (flag for review). Are these three validations part of **one combined validation flow** triggered together, or should they be **three independent flows** that can be triggered and configured separately?
Answer:

**Q1.2** When a discrepancy is detected, what is the notification mechanism? Who receives it, and how?
- *From transcripts: Ashley Salerno currently receives all flags manually.*
Answer: Confirm or change — who gets notified and how? (Email to Ashley? Salesforce Chatter? Slack?)

**Q1.3** When validating promotion SKUs (UC4), the system must confirm that the correct promotional SKU is selected and the discount allocation matches the contract. What are the current promotion types in use?
- *From transcripts: Two promotion types observed — (1) 12-month financing, (2) percentage-off promotion. Percentage-off requires the SF and I% off promo SKU; without it, HD doesn't correctly allocate the promotion.*
Answer: Are there other promotion types? Is the list maintained in Salesforce as a picklist, or in a separate document?

**Q1.4** For legal compliance checks (UC5): the 3-day right of rescission date must be at least 3 business days from the contract signature date. Should federal holidays be excluded from this calculation, or calendar days only?
- *From transcripts: Ashley mentioned federal holidays are not a business day but the approximate start dates are always Fridays regardless.*
Answer:

**Q1.5** For the signature legibility check (UC5): contracts are signed digitally on a tablet or virtually. Is the signature legibility check a visual/AI assessment of the signature image, or a binary check that a signature field is non-empty?
- *From transcripts: Ashley manually looks at signature pages to verify legible signatures. If AI-assisted: this would require Anypoint IDP.*
Answer:

→ See Section 3.2 for pre-filled field mapping for the validation layer.

**Scope Boundary for UC1/UC4/UC5:**
✅ IN SCOPE: Automated data comparison across HD Portal, Salesforce, and ComputerEase; flag material discrepancies; notify responsible party; validate promotion SKUs and compliance dates.
⚠️ ASSUMED PRE-EXISTS: HD Portal API access (GET) confirmed; Salesforce opportunity and quote records exist; ComputerEase job records accessible via API; notification recipient configured.
❌ OUT OF SCOPE: Resolving discrepancies automatically (human review required); managing HD Portal promotions; creating or modifying contracts.

---

### UC2 — Auto-Sync of Salesforce Corrections Back to HD Portal

**What we understood:**
- Triggered when a sales rep updates customer or quote data in Salesforce
- Syncs the correction back to HD Portal to eliminate the current one-way data flow
- Direction: Salesforce → HD Portal

**[P0 BLOCKER]** HD Portal write endpoints (POST/PATCH) have NOT been confirmed as available to contractor partners. GET operations are confirmed. Write access must be verified with HD's API team (Greg) before this flow can be scoped for development.

**Scope questions:**

**Q2.1** Which Salesforce fields, when updated, should trigger the sync back to HD Portal? The full list will determine scope and complexity.
Answer:

**Q2.2** When Salesforce corrections are pushed to HD Portal, should the flow UPDATE an existing HD Portal record, or CREATE a new one? What is the match key (lead number? order number?)?
Answer:

**Q2.3 [SYSTEM: HD Portal]** Before this flow can be scoped: please confirm with your HD partner contact (Greg) that HD Portal exposes write endpoints (POST or PATCH) to contractor partner API keys. Without this, UC2 must be redesigned as a notification-only flow.
Answer: Yes write endpoints available / No write endpoints — notification only / Unknown — escalating to Greg

→ See Section 3.3 for pre-filled field mapping for UC2.

**Scope Boundary for UC2:**
✅ IN SCOPE: Sync corrections from Salesforce to HD Portal when specified fields are updated; idempotent update (will not create duplicates).
⚠️ ASSUMED PRE-EXISTS: HD Portal write endpoints confirmed available to Peerless API credentials; match key (lead/order number) consistent between systems.
❌ OUT OF SCOPE: HD Portal record creation (new jobs are created in CE, not HD Portal); bid/proposal submission to HD.

---

### UC3 — Automated Job Creation in ComputerEase

**What we understood:**
- Triggered when a new HD order reaches status "Final" in HD Portal AND the corresponding Salesforce opportunity is Closed Won
- Creates a new customer record in ComputerEase (if not already exists)
- Creates a new job in ComputerEase with all financial data: contract value, material amount, subcontractor amount, sales commission, overhead, territory, product type, fence description
- Job number is auto-generated in sequence: `{YY} HD {sequential-counter} {sales-rep-initials}` — MuleSoft must maintain the counter in Object Store
- Customer number is auto-generated: 3-letter last-name prefix + sequential counter (e.g., MUC180)

**[P0 BLOCKER]** CE Live Service not yet configured — Deltek support ticket filed Apr 17 by Jean Jacobs. No CE development can begin until the Deltek relay endpoint is confirmed and CE Live Service is operational.

**Scope questions:**

**Q3.1** The job number format is `{YY} HD {sequential-counter} {sales-rep-initials}`. The counter is currently maintained manually in a spreadsheet. Is the counter per state (one sequence for IL, another for WI) or one global sequence across all jobs?
Answer:

**Q3.2** When a customer already exists in ComputerEase (same last-name prefix, possible prior customer), should the integration skip customer creation and link to the existing record, or always create a new one?
Answer:

**Q3.3** The "Date Open" in ComputerEase backs to the prior Friday when processing occurs on a Monday. Should ALL days back to the nearest prior Friday (i.e., Saturday and Sunday also back to Friday), or only Mondays?
Answer:

**Q3.4** The material amount, subcontractor amount, commission, and overhead amounts come from the Salesforce budget worksheet. Please confirm: is this a standard Salesforce object (e.g., Quote, custom object), or is it a separate spreadsheet that must be attached/read?
- *From transcripts: Ashley enters these from an "ops review budget" and a "budget worksheet" visible in Salesforce. Appeared to be a Salesforce record.*
Answer:

**Q3.5** Overhead code for HD jobs: observed value was "HD overhead = 671.15" in test. Is this a fixed amount per job, or calculated as a percentage of contract value? Is the overhead code name "HD overhead" consistent in production?
Answer:

**Q3.6** The April 15 call identified these CE API access groups: Jobs, Cost Types, Subcontracts, Job Totals. Does UC3 also require the MuleSoft user to create **customer records** (not just job records) in ComputerEase? If yes, the API access group may need to be expanded.
Answer:

→ See Section 3.4 for pre-filled field mapping for UC3 (Salesforce/HD Portal → ComputerEase Job).

**Scope Boundary for UC3:**
✅ IN SCOPE: Automated creation of customer record (if not exists) and job record in ComputerEase when trigger conditions are met; auto-generation of job number and customer number with Object Store counter.
⚠️ ASSUMED PRE-EXISTS: CE Live Service operational; CE API user with API access group provisioned; ComputerEase accessible from CloudHub; material/commission data available in Salesforce as structured records (not attached documents).
❌ OUT OF SCOPE: ComputerEase object schema design; setting up CE department codes, territory codes, or overhead codes; budget worksheet creation; Anypoint IDP document parsing to extract material data (separate from CE job creation).

---

### UC4 — Promotion SKU Validation

*Addressed within UC1 section above. See Q1.3 and Q1.4.*

**Scope Boundary for UC4:**
✅ IN SCOPE: Validate that the promotion SKU on the contract matches the active HD promotion; flag if percentage-off SKU is missing when promotion type is percentage-off.
⚠️ ASSUMED PRE-EXISTS: HD promotion catalog available via HD Portal API (GET); Salesforce quote line items contain the SKU used.
❌ OUT OF SCOPE: Promotion catalog management; updating HD promotion schedules; applying promotions automatically.

---

### UC5 — Legal Compliance Checks

*Addressed within UC1 section above. See Q1.4 and Q1.5.*

**Scope Boundary for UC5:**
✅ IN SCOPE: Validate 3-day right of rescission date; check signature field presence on 299A and 299B; flag non-compliant contracts for Ashley's review.
⚠️ ASSUMED PRE-EXISTS: Contracts (299A/299B) accessible via HD Portal API with field-level data (rescission date, signature status); business day calendar configured.
❌ OUT OF SCOPE: Visual assessment of signature legibility (unless Anypoint IDP is confirmed in scope — see Q1.5); legal advice or compliance certification.

---

### UC6 — Automated Contract Download and Attachment

**What we understood:**
- Triggered when a new HD order is confirmed (lead status "Final")
- Downloads signed contracts 299A and 299B from HD Portal as PDF files
- Uploads/attaches them to the corresponding Salesforce opportunity or account record
- Real-time trigger (not scheduled)

**Scope questions:**

**Q6.1** The 118 waiver form is currently generated manually via DocHub, signed, and then uploaded back to HD Portal. Should UC6 also handle 118 form download from HD Portal once it has been uploaded? Or is the 118 form attachment to Salesforce out of scope?
Answer:

**Q6.2** In Salesforce, where should the downloaded PDFs be attached — to the Opportunity record, the Account, or both?
Answer:

**Q6.3 [SYSTEM: HD Portal]** Document download endpoint (for 299A/299B PDFs by lead number) has not been explicitly confirmed via API testing. Based on HD Portal access, is there an API endpoint that returns the PDF document for a given lead number?
Answer: Confirmed / Not confirmed — must verify with Greg

→ See Section 3.5 for pre-filled field mapping for UC6.

**Scope Boundary for UC6:**
✅ IN SCOPE: Download 299A and 299B from HD Portal API as PDF; attach to Salesforce record.
⚠️ ASSUMED PRE-EXISTS: HD Portal PDF document endpoint available via API; Salesforce Files / ContentDocumentLink objects accessible; lead number consistent as match key.
❌ OUT OF SCOPE: 118 form generation or DocHub integration; contract creation or modification; OCR/data extraction from PDFs (separate from UC7).

---

### UC7 — Change Order Processing

**What we understood:**
- Source: Change Orders arrive via email (as PDF attachments) or are stored in Google Drive
- Integration Type: Real-time or near-real-time depending on source
- Process: Extract structured data from PDF via document processing (Anypoint IDP), then update the relevant records in Salesforce and/or ComputerEase

**Scope questions:**

**Q7.1** Change Orders arrive via both email and Google Drive. Are these **two separate flows** (one email-triggered, one Google Drive polling) or can both be handled by one flow with a common PDF handler?
Answer:

**Q7.2** Which email inbox receives Change Order PDFs? Is it a dedicated mailbox (e.g., changeorders@peerlessfence.com) or does it arrive in a shared inbox with other emails?
Answer:

**Q7.3** For Google Drive: is there a specific folder where Change Order PDFs are placed? What naming convention do they follow?
Answer:

**Q7.4** What specific fields need to be extracted from a Change Order PDF? 
- *Based on the business process: at minimum — customer name, job number, change description, change amount, revised contract total, authorization signature.*
Answer: Confirm the above fields, or provide a sample Change Order to validate.

**Q7.5** After data is extracted, which systems are updated? Salesforce only, ComputerEase only, or both?
Answer:

→ See Section 3.6 for pre-filled field mapping for UC7 (Change Order PDF → structured data).

**Scope Boundary for UC7:**
✅ IN SCOPE: Monitor email inbox or Google Drive for Change Order PDFs; extract structured fields using Anypoint IDP; update Salesforce and/or ComputerEase records.
⚠️ ASSUMED PRE-EXISTS: Anypoint IDP configured and trained on Change Order document format; dedicated email folder or Google Drive folder for Change Orders; IDP model training data (sample Change Order PDFs) available before development begins.
❌ OUT OF SCOPE: Change Order approval workflow; sending revised contracts to customers; payment processing for change order amounts.

---

### Potential Additional Flows — Scope Confirmation

**[POTENTIAL FLOW A: HD Portal Lead → Salesforce Sync]**
From the Apr 14 scoping call, Ashley Salerno stated: *"When we create a lead inside of Home Depot Service Center, it doesn't come through inside of Salesforce. So that part needs to be fixed."* There is currently a ~10-minute polling lag and the sync is described as broken/unreliable. Every other UC depends on Salesforce having up-to-date lead data from HD Portal.

We did not see this flow listed as a separate UC in the SOW. Confirm: is this **already handled by an existing integration**, **intentionally out of scope** (manual process), or should it be **included as UC0 in this engagement**?
Answer:

**[POTENTIAL FLOW B: CE Job Status → Salesforce]**
Once a job is created in ComputerEase, job status updates (e.g., material ordered, scheduled, installed, complete) are not mentioned as flowing back to Salesforce. Is bidirectional CE ↔ Salesforce job status sync in scope for this engagement?
Answer:

---

## Section 2: Systems and Access

| System | Cloud / On-Prem | Sandbox Available | Current Status |
|--------|----------------|-------------------|----------------|
| HD Portal | *Cloud (HD-managed)* | *No dedicated sandbox — test leads labeled "Peerless test"* | API key received (Apr 15); portal login pending |
| Salesforce | *Cloud (Salesforce.com)* | *Yes — sandbox user being created by Cora Barahi* | API credentials pending |
| ComputerEase | *On-premise (GCP VM, Windows)* | *Yes (P3 practice company) — but API NOT available in P3* | Deltek support ticket filed Apr 17 |
| Google Drive | *Cloud (Google)* | *Yes* | Credentials TBD |
| Email | *TBD — see Q2.1 in Section 7* | *N/A* | TBD |

**Q2.1** Do you have an existing Anypoint Platform subscription? If yes, what tier and how many vCores are allocated?
Answer:

**Q2.2** Are there any existing assets published to Anypoint Exchange from prior MuleSoft work?
Answer:

**Q2.3** ComputerEase is accessed via Cameo (remote desktop). Does the DataSkate team have Cameo access configured? Brian Cook shared credentials on Apr 16 — confirm this is sufficient for development.
Answer:

---

## Section 3: Data and Field Mapping

### 3.1 External ID Fields (Idempotent Upsert)

| Object | System | External ID Field | Status |
|--------|--------|-------------------|--------|
| Lead / Order | HD Portal | Lead Number (F-number) | Confirmed via transcripts |
| Opportunity | Salesforce | HD_Lead_Number__c (proposed) | To be created before go-live |
| Account / Customer | Salesforce | To be confirmed | Answer: what is the unique customer ID? |
| Customer Record | ComputerEase | Customer Number (e.g., MUC180) | Auto-generated by integration |
| Job Record | ComputerEase | Job Number (e.g., 26 HD 565 AS) | Auto-generated by integration |

**Q3.1** Does a custom External ID field already exist on Salesforce Opportunity for the HD Portal lead number? If not, DataSkate will need Peerless's SF admin to create `HD_Lead_Number__c` before development begins.
Answer:

### 3.2 Field Mapping — UC1/UC4/UC5: Cross-System Validation

Based on the business process observed in the Apr 15–16 transcripts, the validation layer compares these fields:

| Validation Check | HD Portal Field | Salesforce Field | CE Field | Notes |
|-----------------|----------------|-----------------|----------|-------|
| Customer name | Lead: customer name | Account.Name | Customer name | Match expected |
| Address | Lead: service address | Account.BillingStreet/City/State/Zip | Job address | Match expected |
| Phone | Lead: customer phone | Account.Phone | Customer phone | Match expected |
| Contract value | Quote total price | Opportunity.Amount | Job contract value | Must match exactly |
| Promotion SKU | Quote: product SKU line | Quote Line Item: product code | N/A | Validate SKU format |
| Rescission date | Contract: right of rescission date | N/A | N/A | Must be ≥ 3 business days from sign date |
| Signature status | Contract: signature fields | N/A | N/A | Must be non-empty |
| Deposit amount | 299B deposit amount | N/A | N/A | 100% for IL/IN/OH; 99% for WI |
| Material type | Quote: product description | Quote Line Item: product description | Job product type | For wood: picket type required |
| Fence description | Quote: specifications | Quote Line Item: specifications | Job user fields | Height, series, color, rail type |

**Q3.2a** Please confirm this validation field list is complete, or add any fields we missed:
Answer:

**Q3.2b** For the deposit amount rule (100% IL/IN/OH, 99% WI): how does the system know the state? Is it from the job address, or from the Peerless branch/territory?
Answer:

### 3.3 Field Mapping — UC2: Salesforce Corrections → HD Portal

Based on our knowledge of HD Portal's data model (GET operations confirmed):

| Salesforce Field | HD Portal Field | Notes |
|-----------------|----------------|-------|
| Account.Name | Lead: customer name | |
| Account.BillingStreet | Lead: service address | |
| Account.Phone | Lead: customer phone | |
| Opportunity.Amount | Quote: total price | If write endpoint supports this |
| Quote Line Item: product | Quote: product description | |

**Q3.3a** Confirm these are the fields Salesforce reps typically correct. Are there other fields not shown above?
Answer:

**Q3.3b** What is the match key between Salesforce and HD Portal? HD Lead Number stored in Salesforce?
Answer:

### 3.4 Field Mapping — UC3: Salesforce/HD Portal → ComputerEase Job

Based on the detailed walkthrough in the Apr 16 transcript, the ComputerEase job record requires:

| CE Field | Source | Value / Logic |
|----------|--------|---------------|
| Job Number | Auto-generated | {YY} HD {sequence} {rep-initials} — Object Store counter |
| Customer Number | Auto-generated | 3-letter last-name prefix + sequential counter |
| Company Code | Lookup | 00 (IL/WI); sub-code: South or ES for HD residential |
| Department | Lookup | 3 (IL and WI) — confirm other states |
| Date Open | Trigger date | Back to prior Friday if Monday |
| Contract Value | Salesforce Opportunity.Amount | |
| Material Amount | Salesforce budget worksheet | Specific field name TBD — see Q3.4a |
| Subcontractor Amount | Salesforce budget worksheet | Specific field name TBD |
| Sales Commission | Salesforce budget worksheet | Specific field name TBD |
| Overhead Amount | Salesforce budget worksheet | HD overhead code (~671.15 observed) |
| Territory | Salesforce Opportunity territory | Territory 1 = West Chicago observed |
| Product Type | Salesforce Quote Line Item | AL=aluminum, PVC=vinyl, WD=wood |
| Fence Description | Salesforce Quote Line Item | Height + series + color + rail type |
| Target Price | Salesforce budget worksheet | Under/over target price from budget |
| Sales Rep Initials | Salesforce Opportunity owner | Map SF user to CE rep initials |
| Customer Type | Lookup | R05 for HD residential |
| Sign Date | HD Portal contract | Date contract was signed |

**Q3.4a** The material amount, subcontractor amount, commission, and overhead amounts come from the "budget worksheet" / "ops review budget" — what is the exact Salesforce object name or API name for this? (e.g., custom object Budget_Worksheet__c, or Quote fields?)
Answer:

**Q3.4b** The rep initials in the job number (e.g., AS = Ashley Salerno) are the sales rep's initials. Is there a field in Salesforce that stores these initials? Or should the integration derive them from the Salesforce user's first/last name?
Answer:

**Q3.4c** For the company code: how does the integration know if it's "00-South" vs "00-ES" for a given job? Is there a flag in Salesforce or HD Portal?
Answer:

**Q3.4d** Are there additional states beyond IL and WI (e.g., IN, OH) that have different company codes or department codes in ComputerEase?
Answer:

### 3.5 Field Mapping — UC6: HD Portal Contracts → Salesforce

| Action | Source | Target | Notes |
|--------|--------|--------|-------|
| Download 299A PDF | HD Portal: lead number + document type 299A | Salesforce Files | Triggered by lead status = "Final" |
| Download 299B PDF | HD Portal: lead number + document type 299B | Salesforce Files | Same trigger |
| Attach to record | Salesforce Files | Opportunity.ContentDocumentLink | Or Account? See Q6.2 |

**Q3.5a** Is there a consistent naming convention for the downloaded PDF files? Should the filename include lead number, customer name, and document type?
Answer:

### 3.6 Field Mapping — UC7: Change Order PDF → Structured Data

Based on industry standard Change Order forms for residential contractors:

| Extracted Field | Source (PDF) | Target (Salesforce / CE) | Notes |
|----------------|-------------|--------------------------|-------|
| Job / Order Number | Change Order header | CE Job Number / SF Opportunity external ID | Match key |
| Customer Name | Change Order header | Account.Name | Verification |
| Change Description | Body text | Change_Order__c.Description | Free text |
| Change Amount | Financial section | Change_Order__c.Amount | Dollar value |
| Revised Contract Total | Financial section | Opportunity.Amount | Update SF if approved |
| Authorization Signature | Signature fields | Non-empty check | Legibility check if IDP supports |
| Change Order Date | Date field | Change_Order__c.Date | |

**Q3.6a** Confirm the above fields are what you need extracted. Can you provide 2–3 sample Change Order PDFs so we can train the IDP model?
Answer:

**Q3.6b** Is there an existing Salesforce custom object for Change Orders (e.g., Change_Order__c), or does DataSkate need to work with your SF admin to create one?
Answer:

---

## Section 4: Volume and Performance

**Q4.1** How many new HD orders (leads that reach "Final" status) does Peerless receive per day? Per week? What is the typical peak period?
- *From transcripts: Ashley's ops list showed multiple jobs being processed per session, but no specific volume stated.*
Answer:

**Q4.2** How many Salesforce corrections per day on average trigger a sync back to HD Portal (UC2)?
Answer:

**Q4.3** How many change orders are received per week, and what is their typical arrival pattern (batch on certain days, or spread throughout the week)?
Answer:

**Q4.4** For the cross-system validation (UC1): is sub-second response required (Ashley waits for the result), or is it acceptable for the validation to run asynchronously in the background and notify her when complete?
- *Based on transcripts: Ashley currently processes jobs one at a time. Async notification (< 30 seconds) seems acceptable.*
Answer:

**Q4.5** What is the maximum acceptable delay for the CE job creation after an HD order is confirmed?
- *Based on business process: Ashley currently creates CE jobs manually within hours. Real-time (< 5 minutes) seems like the target.*
Answer:

**Q4.6** Uptime SLA for the integration — best-effort acceptable, or is 99.9% uptime required?
Answer:

---

## Section 5: Security and Compliance

**Q5.1** The integration handles customer PII (names, addresses, phone numbers, email). Does Peerless have any specific data handling policies for PII in transit?
Answer:

**Q5.2** Regulatory requirements: are there any specific compliance requirements (HIPAA, PCI-DSS, GDPR, SOX, state-specific) beyond the right of rescission verification already in scope?
Answer:

**Q5.3** Authentication:
- *HD Portal: API key authentication (key from Marius)*
- *Salesforce: OAuth 2.0 JWT (standard MuleSoft connector)*
- *ComputerEase: auth method TBD — pending CE Live Service configuration confirmation from Deltek*
- *Google Drive: OAuth 2.0 service account*
- *Email: SMTP/IMAP credentials*

Please confirm the above or add missing details. For ComputerEase specifically: what auth mechanism does the CE API use after CE Live Service is configured?
Answer:

---

## Section 6: Error Handling

**Q6.1** If the HD Portal API is unavailable when a new order triggers the validation flow, should the system: (a) retry for up to 30 minutes then alert Ashley, (b) queue the validation and retry when the API recovers, or (c) fail immediately and alert?
Answer:

**Q6.2** If ComputerEase job creation fails after the order is confirmed in Salesforce, should the failed job be retried automatically, or should Ashley receive an alert to create the job manually?
Answer:

**Q6.3** Who should receive failure notifications — and how? (Email to Ashley? Slack? Salesforce task?)
Answer:

**Q6.4** Is zero data-loss required for job creation events (if the CE API is down, no job should ever be silently dropped)? Or is best-effort acceptable?
Answer:

**Q6.5** Does processing the same HD order twice cause a problem in ComputerEase (e.g., creates a duplicate job)? CE does not appear to have native deduplication.
Answer:

---

## Section 7: Deployment and DevOps

**Q7.1** Deployment model preference: CloudHub 2.0 (DataSkate manages) is the default. Any specific region requirements?
- *Default: CloudHub 2.0, us-east-1.*
Answer: Confirm or change region.

**Q7.2** Environments needed: dev, UAT, production?
Answer:

**Q7.3** Network/firewall — GCP VM (ComputerEase):
- **[P0 BLOCKER]** CE application is NOT listening on port 443 or 8081 (confirmed Apr 16). Actual port must be identified via `netstat -an | findstr LISTENING` on the VM before the CloudHub firewall rule can be finalized.
- Once the API port is known: a GCP firewall rule allowing inbound TCP from MuleSoft CloudHub 2.0 static IPs must be created. Currently the rule allows all traffic (0.0.0.0/0) — this must be restricted after go-live.

Action required from Peerless (Brian Cook): run netstat on the production GCP VM and provide the port CE is listening on.
Answer: Port confirmed as _____

**Q7.4** CI/CD tools in use? (GitHub Actions is our default — confirm or change.)
Answer:

**Q7.5** Secrets management: how are credentials stored today? (DataSkate default: Anypoint Secrets Manager or environment-specific properties.)
Answer:

---

### 7.A Access Chain Table

| System | Admin Owner | API User Creator | Backup Admin | Env Available | Status |
|--------|-------------|-----------------|--------------|---------------|--------|
| HD Portal | Ashley Salerno | Ashley Salerno → HD team (Greg) | TBD | Production only (test leads labeled "Peerless test") | Portal login pending |
| Salesforce | Marius (primary) + Cora Barahi | Cora Barahi | TBD — client to confirm | Sandbox (user being created) | In progress |
| ComputerEase | Jean Jacobs (ONLY admin — single point of failure) | pw-maintenance account (Jean) | Laura (limited) | P3 practice (no API) / Production GET-only | Deltek ticket filed |
| Google Drive | TBD | TBD | TBD | Yes | TBD |
| Email | TBD | TBD | TBD | TBD | TBD |

**Q7.A.1** For ComputerEase: Jean Jacobs is the only full admin — this is a single point of failure risk. Brian Cook raised this on Apr 16. Can a second admin (Laura or another team member) be granted admin access before development begins?
Answer:

**Q7.A.2** For the DataSkate CE API user: once Jean creates it via pw-maintenance, what will the credentials be, and how will they be securely transmitted to DataSkate?
Answer:

---

## Section 8: Operations and Support

**Q8.1** Logging and monitoring tools currently in use? (DataSkate default: Anypoint Monitoring.)
Answer:

**Q8.2** After go-live, who owns operational support on the Peerless side — Ashley, IT (Brian Cook), or a dedicated operations team?
Answer:

**Q8.3** Is there a requirement for a business-facing dashboard showing integration health (how many jobs created, how many validation flags, etc.), or is Anypoint Monitoring sufficient for internal visibility?
Answer:

---

## Section 9: Testing and Go-Live

**Q9.1** HD Portal test leads must be labeled "Peerless test" and closed out after testing (confirmed by Ashley Apr 14). Who is responsible for creating test leads in HD Portal during development?
Answer:

**Q9.2** ComputerEase production is the only environment with API access — we will use GET-only guardrail in production until UAT sign-off. Who approves the switch from GET-only to full write access in production?
Answer:

**Q9.3** UAT acceptance criteria: who signs off that each use case is working correctly? Ashley? Jeff Kelly?
Answer:

**Q9.4** Are there any blackout periods — month-end close, fiscal year-end, high-volume HD promotion periods — when changes should not be deployed?
Answer:

**Q9.5** Target go-live date or deadline (if any)?
Answer:

---

## Section 10: System-Specific Details

### 10.1 ComputerEase / Deltek

**[P0 BLOCKER — CE Live Service]**
Deltek support ticket submitted Apr 17, 2026 by Jean Jacobs. DataSkate (Raghuram) must be added as a contact so Deltek responses come directly to the team. Jean confirmed she would forward responses — verify this is set up.

**[P0 BLOCKER — API Port]**
CE application is NOT listening on 443 or 8081. Brian Cook to run `netstat -an | findstr LISTENING` on the production GCP VM and share the full output so DataSkate can identify the CE API port.

**Q10.1.1** When Deltek responds to the CE Live Service ticket, what is the API base URL format? Based on our research:
- *Expected format: a Deltek relay URL (not direct GCP IP) that routes to CE Live Service on your VM*
- Answer: Confirm format when Deltek provides it.

**Q10.1.2** The CE API access group created on Apr 15 includes: Jobs, Cost Types, Subcontracts, Job Totals. Does creating a new customer record in CE require an additional access group entry (e.g., Customers)?
Answer:

**Q10.1.3** [SYSTEM: ComputerEase] The CE API requires the company code as part of the request. For multi-state jobs: is the company code derived from the job's billing state, or from the Peerless branch that entered the job?
Answer:

### 10.2 HD Portal (Home Depot Service Center)

**[P0 BLOCKER — Write Endpoints]**
Write API endpoints not confirmed. Must verify with Greg (HD API team) before UC2 development begins.

**Q10.2.1** HD Portal login for the DataSkate team: Ashley is waiting for a response from HD. What is the expected ETA, and should DataSkate follow up directly with Greg?
Answer:

**Q10.2.2** [SYSTEM: HD Portal] The lead status "Final" is the trigger for UC1, UC3, and UC6. Are there intermediate statuses between lead creation and "Final" that the integration should monitor or filter out?
Answer:

**Q10.2.3** [SYSTEM: HD Portal] HD grades Peerless on lead quality. Test leads created during development must be labeled "Peerless test" and closed properly. Who manages this grading issue during the development and UAT phase?
Answer:

### 10.3 Salesforce

**Q10.3.1** [SYSTEM: Salesforce] Are "State and Country Picklists" enabled in the Salesforce org? (Affects how BillingCountryCode is written — required to avoid FIELD_INTEGRITY_EXCEPTION.)
Answer:

**Q10.3.2** [SYSTEM: Salesforce] Is this a multi-currency Salesforce org? (Affects CurrencyIsoCode writability on Account.)
Answer:

**Q10.3.3** [SYSTEM: Salesforce] What Salesforce API version is the org on? (DataSkate pins to v59.0 — confirm this is compatible.)
Answer:

### 10.4 Anypoint IDP (for UC5 signature check and UC7 Change Order processing)

**Q10.4.1** For UC7 (Change Order processing): has Peerless been through an IDP onboarding? Is an Anypoint Platform Connected App for IDP already configured, or does DataSkate need to set this up?
Answer:

**Q10.4.2** IDP requires sample documents to train the extraction model. For Change Orders: can Peerless provide 5–10 sample Change Order PDFs (with PII redacted if needed) for model training?
Answer:

**Q10.4.3** For UC5 (signature legibility check via IDP): the IDP model would need to be trained on 299A/299B contract formats. Are all 299A/299B documents in a consistent template, or do they vary by sales rep or region?
Answer:

---

## Internal Flags
*(Do not send to client — for DataSkate / Raghuram's review only)*

1. **[P0] CE Live Service not configured** — All ComputerEase integration work is blocked. Deltek support ticket filed Apr 17 by Jean Jacobs. DataSkate must be CC'd on the Deltek response. Do not begin CE architecture until relay endpoint URL is confirmed. Raghuram: bundle CE Live Service questions with the port discovery question in ONE Deltek call.

2. **[P0] CE API port unknown** — Application is NOT on 443 or 8081. Brian Cook needs to SSH into the production VM and run netstat. Raghuram: send Brian the exact command (`netstat -an | findstr LISTENING`) — do not wait for him to figure this out.

3. **[P0] HD Portal write endpoints unconfirmed** — UC2 scope cannot be finalized until Greg confirms POST/PATCH availability. If not available: UC2 redesign required (notification-only). Raghuram: escalate to Ashley directly — "We need a decision on UC2 scope within 1 week or the timeline shifts."

4. **[P0] CE API sandbox = production only** — All CE testing will be in production with GET-only guardrail. Strict control required. Create a separate DataSkate API user — never use Jean's or Brian's personal credentials.

5. **[SECURITY] GCP VM SSH/RDP open from 0.0.0.0/0** — Flagged by Raghuram and Brian Cook Apr 15. This is a critical security vulnerability on the client's GCP VM. Must be locked down. Include this in the architecture handoff — Architect to flag in architecture.md as a prerequisite to go-live (not DataSkate's responsibility to fix, but DataSkate must not go live leaving it open).

6. **[SINGLE ADMIN] Jean Jacobs is the only CE admin** — Single point of failure. Brian Cook raised this Apr 16. Any delays in CE API user creation will block development. Get Jean to create the DataSkate API user before architecture is finalized.

7. **[SCOPE QUESTION] UC1/UC4/UC5 combined vs. separate flows** — The SOW lists 3 separate UCs but all have the same trigger and output. If combined into one validation flow, this reduces the confirmed flow count from 7 to 5. Confirm with Jeff Kelly whether each has independent scheduling/enable/disable requirements (if yes: 3 flows; if no: 1 flow is cleaner).

8. **[MISSING FLOW] HD Lead → Salesforce sync** — Ashley stated explicitly on Apr 14 that this is currently broken. Without this sync, the triggers for UC1, UC3, and UC6 don't have reliable data to work from. This may need to be scoped as UC0 or treated as a prerequisite. If it's in scope, flow count goes to 8.

9. **[COMPLEXITY HIGH] CE Job Creation (UC3)** — 15+ fields required, multi-lookup tables (company codes, department codes, territory codes, overhead codes, customer type), auto-generated job/customer numbers. This is the highest-complexity flow in the engagement. Timeline risk if field mapping doc is not delivered early.

10. **[IDP DEPENDENCY] Anypoint IDP for Change Orders (UC7) and signature legibility (UC5)** — IDP requires model training before development begins. Client must provide sample documents early. IDP Connected App must be configured on the Anypoint Platform org. If Peerless doesn't have Anypoint IDP in their subscription, this is a separate purchase decision.

11. **[ARCHITECTURE NOTE] "Deltek" in SOW likely = ComputerEase** — The SOW lists "Deltek" and "ComputerEase" as separate source systems in UC1. From all transcripts, only ComputerEase is discussed. Raghuram: confirm with Jeff Kelly that these refer to the same system, not two separate ERPs.

12. **[AE NOTE] New AE, new DataSkate client** — Include the "About DataSkate" section in the proposal. AE should be briefed on the CE Live Service complexity and timeline risk — this is not a standard SaaS integration project. Manage AE expectations on timeline: earliest start of CE development is after Deltek support resolves the CE Live Service ticket.

---

## Pricing Summary
*(Internal — Do Not Send to Client)*

**Flows confirmed per SOW:** 7 (per pricing-model.md Peerless example)
- UC1+UC4+UC5 (validation layer) — if combined: reduces to 5 flows; if separate: remains 3 flows
- Pending confirmation on UC0 (HD Lead → SF sync): +1 flow if in scope

**Pricing (7 flows, IaaS — Peerless reference model):**
- Implementation: **$0** (included in managed service)
- Timeline: 2 + (7 × 1.5) = **12.5 weeks** from signed SOW
- Period 1 rate: $150/flow/month
- 6-month payment (Period 1): 7 × $150 × 6 = **$6,300**
- 2-year managed service total: **$27,154**

**Implementation Only alternative (7 flows):**
- One-time implementation fee: 7 × $3,500 = **$24,500**
- Ongoing: $0

**AE context:** New AE, new DataSkate client. Include "About DataSkate" in proposal. No AE discount applies.

**Risk note for timeline:** CE Live Service dependency could add 1–2 weeks to the timeline if Deltek support does not respond promptly. Factor into the kickoff conversation with the AE.
