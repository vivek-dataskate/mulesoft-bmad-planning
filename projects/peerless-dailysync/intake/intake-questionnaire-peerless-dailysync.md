# Peerless Fence Group × DataSkate — Integration Discovery Questionnaire

**Client:** Peerless Fence Group (peerless-dailysync)
**Date:** 2026-05-20
**Architect:** Raghuram Potluri — raghuram@dataskate.ai
**Source:** Peerless scoping calls (Apr 14 / Apr 15 / Apr 17 transcripts) + MuleSoft Automation Starter SOW
**Engagement:** 8 confirmed flows (UC1–UC8) · IaaS managed service recommended

---

## How to read this form

- **Pre-filled answers are shown after every question.** Read them, then either leave the answer (= you agree) or correct it.
- **Blank "Answer:" lines are genuine unknowns** — items only you can confirm (specific credentials, contact details, dates).
- **No checkboxes — plain text.** When a question lists options, type or paste the one(s) that apply.
- Most answers come from your team's calls with Raghuram, Marius, and Venkat between Apr 14 and Apr 17. Your job is to confirm what we heard correctly and fill in the blanks we genuinely couldn't know.

---

## SECTION 1 — USE CASES

This is the heart of the engagement. Eight confirmed flows. Each block: business problem solved → trigger → scope boundary → field-mapping cross-reference. Three potential flows ride along at the bottom as Phase 2 candidates.

### 1.1 UC1 — HD Portal Lead → Salesforce Lead (scheduled poll, ~10 min lag) [MEDIUM complexity]

**Business problem this solves:** Ashley described it directly — *"When we create a lead inside of Home Depot Service Center, it doesn't come through inside of Salesforce. So that part needs to be fixed."* Today HD Portal leads have to be retyped into Salesforce by hand, which costs the ops team an hour a day in reconciliation work and loses leads when retyping is missed. On go-live day that stops.

**Trigger:** Scheduler polling the HD Portal lead-list endpoint every ~10 minutes (HD's downstream propagation floor was 30 min, reduced to 10 min per Marcos). Webhook NOT confirmed available — polling is the path.

**Q1.1 [TRIGGERED BY: scheduled]** What is the lookback window for each poll — last 15 minutes or longer to allow for HD propagation jitter? Evidence suggests: 15 minutes overlap + idempotency key on `F number` (HD lead identifier). Confirm or correct.
**Answer:** Inferred from industry pattern — confirm. 15-min lookback with idempotency on HD F-number is DataSkate default for ~10-min propagation floors.

**Q1.2 [SYSTEM: HD Portal]** Confirm DataSkate's read-only HD Portal UI login is now provisioned (originally requested Apr 14, pending Apr 17 — Ashley offered her own login as a temporary fallback). Marius is engaged for "another 15 days" from Apr 17 — this must resolve while he's still on the engagement.
**Answer:** Evidence suggests still pending as of Apr 17 — Ashley to follow up with HD before May 2. Provide username + temporary password handoff path.

**Q1.3** Which Salesforce object should the HD lead land on — Standard `Lead`, or directly as an `Opportunity` (since HD leads are already qualified prospects with a quote)? Evidence suggests: standard `Lead` object first, then converted to `Opportunity` when status reaches "Quoted" — DataSkate default. Cora Barahi (SF admin) to confirm.
**Answer:** Inferred from Salesforce playbook + sage.json — confirm with Cora Barahi.

**Scope Boundary for this flow:**
- ✅ IN SCOPE: Poll HD Portal lead-list endpoint every ~10 min; upsert into Salesforce `Lead` keyed by `HD_Portal_Id__c` (the F number); set Lead.Source = "Home Depot"; idempotent on F number.
- ⚠️ ASSUMED PRE-EXISTS: HD Portal API key shared via confidential email (Apr 15 — typed into secrets manager); HD Portal lead-list GET endpoint returns 200 (Venkat confirmed Apr 17); Salesforce sandbox user (Cora Barahi in flight); `HD_Portal_Id__c` External ID field on Lead — created by DataSkate.
- ❌ OUT OF SCOPE: HD-side lead routing logic, HD lead qualification workflow, push/webhook delivery from HD (not available). HD Portal UI changes are not in scope.

→ See Section 3.2 for pre-filled field mapping.

---

### 1.2 UC2 — Salesforce → HD Portal Customer + Quote Correction Write-Back (event-driven) [HIGH complexity]

**Business problem this solves:** Today the data flow is one-way. Sales reps fix customer info and quote details in Salesforce — phone numbers, addresses, line-item corrections — and HD Portal never sees those fixes. The discrepancies pile up. This flow closes the loop: corrections in Salesforce push back to HD Portal automatically.

**Trigger:** Salesforce Change Data Capture (CDC) on `Account` / `Contact` / `Quote` field changes, OR a Platform Event on a rep-initiated "Sync to HD" custom action button — chosen during architecture review. Streams to MuleSoft → HD Portal write endpoint.

> ⚠️ **P0 BLOCKER:** HD Portal write endpoints (POST/PATCH) for customer and quote correction have NOT yet been confirmed by HD API team. Ashley to escalate to Greg. If write endpoints do not exist, UC2 falls back to outbound email or partner-portal screen-scrape — both heavy and likely out of Automation Starter scope. See Q1.4.

**Q1.4 [P0] [SYSTEM: HD Portal]** Does the HD Portal API expose POST/PATCH endpoints for `customer` and `quote` correction? Ashley to escalate to Greg (HD API team). UC2 cannot be scoped until this lands.
**Answer:** Pending HD API team confirmation. Critical path item — required before architecture sign-off.

**Q1.5** Which Salesforce fields trigger the writeback — only "material" customer fields (name, address, phone, email), or every QuoteLineItem field too? Evidence suggests from Raghuram's FK-034 observation: Peerless uses standard QuoteLineItem + QuotedProductBundle for product/material data. Watch only customer-level fields (Account/Contact) + Quote header + total Amount — NOT every line item edit (would be too chatty). Confirm or correct.
**Answer:** Inferred from architect pattern — confirm. Default: Account name, BillingAddress, Phone, Email; Quote.TotalAmount, Quote.Status; QuoteLineItem only when SKU or Quantity changes.

**Q1.6 [TRIGGERED BY: event-driven]** Should the writeback be **immediate** (every change syncs) or **debounced** (5-min window — sync the latest state after the rep stops editing)? Evidence suggests: debounced 5-min window — reduces noise on HD and avoids syncing partial keystrokes. DataSkate default for CDC-based writebacks.
**Answer:** Inferred from DataSkate default — confirm. 5-min debounce window on Account/Quote CDC stream.

**Scope Boundary for this flow:**
- ✅ IN SCOPE: Listen to Salesforce CDC on Account/Quote/QuoteLineItem; debounce 5 min; transform via DWL; POST/PATCH to HD Portal write endpoint; idempotent on HD F-number.
- ⚠️ ASSUMED PRE-EXISTS: HD Portal write endpoints confirmed by HD API team (Q1.4); CDC enabled on Account, Quote, QuoteLineItem in the Salesforce org; integration user has Read+CDC permission on those objects.
- ❌ OUT OF SCOPE: Salesforce validation rule changes; Salesforce trigger / Apex changes; HD Portal UI changes. If HD does not expose writes, the fallback (outbound email or screen-scrape) is OUT of Automation Starter scope.

→ See Section 3.3 for pre-filled field mapping.

---

### 1.3 UC3 — HD Portal Signed Contract (299A/299B) → Salesforce Attachment (scheduled, ~10 min lag) [MEDIUM complexity]

**Business problem this solves:** Today signed 299A and 299B contracts live only in HD Portal. To find one in Salesforce, ops has to log in to HD Portal, locate the order, download the PDF, then attach to Salesforce by hand. This flow downloads new "Final"-status contracts from HD Portal and attaches them to the matching Salesforce record automatically.

**Trigger:** Scheduler polling HD Portal for contracts where status = "Final" (the green/blue button visual cue). When a new Final contract is found, download the 299A/299B/118 PDFs and attach to the matching Salesforce `Account` or `Contract` record.

> ⚠️ **P0 BLOCKER:** HD Portal document download endpoint has NOT yet been confirmed by HD API team. Ashley to escalate to Greg. If documents can't be retrieved via API, UC3 falls back to scheduled HD Portal UI screen-scrape (heavy) or is removed from scope. See Q1.7.

**Q1.7 [P0] [SYSTEM: HD Portal]** Does the HD Portal API expose a document download endpoint (or pre-signed URL / attachment ID + GET) for 299A/299B/118 PDFs? Ashley to escalate to Greg.
**Answer:** Pending HD API team confirmation. Required before architecture sign-off.

**Q1.8** Should ALL three document types (299A, 299B, 118) attach automatically, or just 299A + 299B (the legally-binding contract) and let 118 stay manual? Evidence suggests: all three — 118 (customer-approval form with takedown/Holloway exceptions) is part of the compliance package and Ashley does it manually today via DocHub. Auto-attaching 118 saves a manual step.
**Answer:** Inferred from pain-quote (Ashley's manual DocHub→SF step) — confirm. Default: attach all three (299A, 299B, 118).

**Q1.9** Which Salesforce object receives the attachment — `Account`, `Contract` (standard object), or a custom `HD_Order__c`? Evidence suggests: standard `Contract` object linked to `Account` — Raghuram's pattern (FK-034 — use Salesforce standard objects, don't build parallel custom mapping spreadsheets).
**Answer:** Inferred from architect FK-034 — confirm. Default: Salesforce standard `Contract` object, with `ContentDocumentLink` to the Account.

**Scope Boundary for this flow:**
- ✅ IN SCOPE: Poll HD Portal every ~10 min for Final-status contracts; download 299A/299B/118 PDFs via API; create `ContentVersion` + `ContentDocumentLink` on the matching Salesforce `Contract` record (linked to `Account`); idempotent on HD contract ID.
- ⚠️ ASSUMED PRE-EXISTS: HD Portal document download endpoint confirmed (Q1.7); Salesforce sandbox user; standard `Contract` object usable (it is — confirmed by Raghuram).
- ❌ OUT OF SCOPE: Document signing workflow (lives in HD Portal); document storage outside Salesforce (no separate S3 archive in Phase 1); OCR / text extraction of contract content (that is UC7's job, not UC3).

→ See Section 3.4 for pre-filled field mapping.

---

### 1.4 UC4 — HD Portal + Salesforce → ComputerEase Customer + Job (create on new HD order) [HIGH complexity]

**Business problem this solves:** Ashley described it on the call — *"We have no data points or information of what they've done with this customer, if anything, other than that they created a quote but not that they've given the customer a quote."* Today a new HD order means Ashley manually re-keys the customer + job into ComputerEase, including financials, commission calculations, overhead structure, sales-rep initials, and a job number picked from a shared spreadsheet to avoid race conditions. On go-live day that stops — Customer + Job land in ComputerEase automatically the moment the HD order reaches "Final."

**Trigger:** Scheduled poll when HD order reaches "Final" status — pulls the order + Salesforce sale data (commission, overhead, sales-rep initials) → writes Customer + Job to ComputerEase via the **CE Live Service relay** (the Deltek Windows-service relay on the GCP VM — NOT direct VM IP).

> ⚠️ **P0 BLOCKERS bundled here:**
> - CE Live Service must be installed on the GCP VM (Deltek ticket filed Apr 17 by Jean Jacobs, 4-hour SLA legacy tier).
> - ComputerEase API is **production-only** (no sandbox) — all testing happens against production with GET-only safety + idempotency keys + dry-run mode.
> - Jean Jacobs is the **sole CE admin** — backup admin must be designated (Brian recommends Laura; Kirk approval needed).
> - GCP firewall + port (likely 443 after CE Live Service install — was 445 SMB).

**Q1.10 [P0] [SYSTEM: ComputerEase]** Confirm: CE Live Service has been installed on the GCP VM and the relay URL has been received from Deltek support (Apr 17 ticket, 4-hour SLA).
**Answer:** Pending Deltek support response. Required before any CE write flow can be developed.

**Q1.11 [P0] [SYSTEM: ComputerEase]** Confirm the backup admin (Laura recommended by Brian). Kirk approval needed. The two-day delay during onboarding from Jean's unavailability is the explicit risk this resolves (FK-031).
**Answer:** Pending Kirk approval. Default: Laura.

**Q1.12** Confirm the CE job-number format and ownership of the "next number" decision: `{YY}{HD}{sequential-3digit}{sales-rep-initials}` e.g. `26HD565AS`. Today picked manually from a shared spreadsheet (race-condition risk). Does CE expose an atomic next-number endpoint, or must MuleSoft own the counter (Object Store, per-department key)?
**Answer:** Architect decision — confirm with Jean Jacobs. Default: MuleSoft owns the counter in Anypoint Object Store, keyed by `{YY}{department}{sales-rep-initials}`, locked per request. See Internal Flag #6.

**Q1.13** Confirm department-code / customer-type-code / sales-rep-initials mapping documents are in flight (CE uses free-form 2-3 char codes with no lookup table — e.g. R05 = retail Home Depot).
**Answer:** Inferred — Peerless to deliver before M1 sprint start. Default: Jean Jacobs to produce.

**Scope Boundary for this flow:**
- ✅ IN SCOPE: Detect HD order at "Final" status; enrich with Salesforce sale data; write Customer + Job to ComputerEase via CE Live Service relay; idempotency keys on every write; dry-run mode gated by ENV property; comprehensive payload logging.
- ⚠️ ASSUMED PRE-EXISTS: CE Live Service installed (Q1.10); CE API access groups (jobs, subcontracts, cost types, job totals — payroll EXCLUDED); API user provisioned by Jean Jacobs via the built-in `pwmaint` account; backup admin designated (Q1.11); free-form code mapping documents (Q1.13).
- ❌ OUT OF SCOPE: ComputerEase configuration (GL setup, chart of accounts, job-cost code structure, overhead rules); CE Live Service installation (Deltek's responsibility); CE user provisioning beyond the integration user; payroll integration (explicitly excluded per CE access group policy).

→ See Section 3.5 for pre-filled field mapping.

---

### 1.5 UC5 — Multi-System Validation: Customer + Materials + Pricing Mismatch Detection (api-aggregation) [HIGH complexity]

**Business problem this solves:** Today Ashley reconciles by hand across four systems. A new HD order means she has to check the customer info matches in HD + Salesforce, the materials match across all four, and the pricing matches the contract — and she catches mismatches only after they hit a margin issue. This flow runs that reconciliation automatically the moment the HD order is Final and only escalates **material discrepancies** for human review.

**Trigger:** Triggered when a new HD order reaches "Final" — aggregates data from HD Portal + Salesforce + Deltek (pending confirmation, see P0) + ComputerEase, compares validation fields, flags only material discrepancies.

> ⚠️ **P0 BLOCKER:** "Deltek" appears as a separate source system alongside ComputerEase in the SOW. Is Deltek a distinct Deltek product (Costpoint, Vantagepoint), or vendor-name overlap with ComputerEase (which is itself a Deltek product)? UC5 sizing changes based on the answer. See Q1.14.

**Q1.14 [P0] [SYSTEM: Deltek]** Is "Deltek" in the SOW Source Systems list a separate Deltek product (e.g. Costpoint or Vantagepoint, used by a different Peerless department), or vendor-name overlap with ComputerEase?
**Answer:** Pending confirmation from Peerless leadership (Jeff Kelly / Brian Cook). If separate: requires its own connector, playbook, admin contact — likely OUT of current Automation Starter scope and triggers a scope-change discussion. If overlap: remove from system list and UC5 reduces to three-system validation (HD + Salesforce + CE). Pricing is currently computed on 8 flows; if Deltek is separate, a scope-change conversation is required before SOW signing.

**Q1.15** What counts as a "material" discrepancy worth flagging? Evidence suggests: (a) customer name mismatch (any difference beyond whitespace/case), (b) material type mismatch (cedar vs aluminum vs PVC vs picket — these live on Salesforce QuoteLineItem + QuotedProductBundle per Raghuram FK-034), (c) pricing mismatch > $50 OR > 2% of total. Confirm or set explicit thresholds.
**Answer:** Inferred from operational practice — confirm with Ashley. Default: name (any non-whitespace difference), material type (any change), pricing ($50 or 2% threshold).

**Q1.16** Where should flagged mismatches land — a Salesforce list view on `Quote` with a `Reconciliation_Status__c` field, or a separate custom object `Mismatch__c`? Evidence suggests: Salesforce list view with a status field on the existing Quote/Opportunity record — DataSkate default. Avoids new object overhead. Ashley owns the queue daily.
**Answer:** Inferred from DataSkate default — confirm. Default: `Reconciliation_Status__c` picklist on Quote with status values [Match / Mismatch-Customer / Mismatch-Material / Mismatch-Pricing / Resolved].

**Scope Boundary for this flow:**
- ✅ IN SCOPE: On HD-order-Final trigger, fetch the matching records from HD Portal + Salesforce + ComputerEase (and Deltek if confirmed as a separate system); compare on the validation field set; write `Reconciliation_Status__c` on Salesforce Quote; post Chatter message to assigned rep on mismatch.
- ⚠️ ASSUMED PRE-EXISTS: All UC1–UC4 sources are reachable; CE Live Service live (UC4 prereq); Deltek scope resolved (Q1.14); `Reconciliation_Status__c` picklist field on Quote — created by DataSkate.
- ❌ OUT OF SCOPE: Auto-correction of mismatches (Ashley still reviews and resolves manually); historical reconciliation across past orders (Phase 2); machine-learned tolerance bands (Phase 3 AgentForce target).

→ See Section 3.6 for pre-filled field mapping.

---

### 1.6 UC6 — Promotion SKU + Discount Allocation Validation (event-driven) [MEDIUM complexity]

**Business problem this solves:** Today reps occasionally misapply discounts at the line level. A promotion SKU on HD doesn't match the discount allocation on the Salesforce Quote, the signed contract reflects the wrong allocation, and margin is lost silently. This flow validates the promotion SKU on HD against the discount allocation on the Salesforce Quote/QuoteLineItem against the signed contract — and flags margin-impacting mismatches before they hit the contract.

**Trigger:** Real-time validation at contract creation — fired on the same "Final" event as UC3 + UC4, but validates a different concern: promotion SKU + discount allocation.

**Q1.17** What is the validation rule? Evidence suggests: the HD promotion code (in SKU prefix) must match the Salesforce Quote discount type AND the discount % must match the contract footer. If any of those three disagree → flag. Confirm the exact rule.
**Answer:** Inferred from Sage's transcript reading + HD Portal quirk on promotion SKU validation — confirm. Default: (HD promotion code prefix) == (Salesforce Quote.DiscountType__c) AND (Salesforce Quote discount %) == (signed contract discount %).

**Q1.18** What is the action on mismatch — block contract creation, or only alert? Evidence suggests: alert only — flag on Quote + Chatter to rep + Ops manager (Jeff Kelly). Blocking contract creation is too aggressive for Phase 1; humans still decide.
**Answer:** Inferred from operational-pragmatist profile (don't break things) — confirm. Default: alert only.

**Q1.19** Confirm Jeff Kelly is the ops escalation contact for SKU/discount mismatches.
**Answer:** Inferred from sage.json namedContacts (Jeff Kelly = ops manager) — confirm name + email.

**Scope Boundary for this flow:**
- ✅ IN SCOPE: On Final-status contract, run validation rule against HD Portal SKU + Salesforce Quote + contract PDF (text-extracted by IDP); write `Promo_Discount_Status__c` on Quote; Chatter to assigned rep + Jeff Kelly on mismatch.
- ⚠️ ASSUMED PRE-EXISTS: UC3 has attached the contract PDF; UC7 IDP has extracted the discount % from the signed contract; `Promo_Discount_Status__c` picklist on Quote — created by DataSkate.
- ❌ OUT OF SCOPE: Auto-correction of the discount (humans resolve); historical promo audit (Phase 2); AI-driven recommendation of correct discount (Phase 3).

→ See Section 3.7 for pre-filled field mapping.

---

### 1.7 UC7 — Contract Compliance Validation: Right-of-Rescission Date + Signature/Legibility (event-driven) [HIGH complexity]

**Business problem this solves:** Federal and state law gives the customer 3 business days to rescind a fence contract (federal/state-holiday aware). Customer signatures must be present and legible — "declined" or "unavailable" placeholders break the contract. Today Ashley checks compliance by hand on every signed 299A/299B. This flow runs that check automatically and flags any contract that fails — before it becomes a legal exposure.

**Trigger:** Triggered when a contract reaches "Final" status — calculates the 3-business-day right-of-rescission date (federal + state-holiday aware), runs the IDP signature presence + legibility scoring on the contract PDF, writes a compliance status back to the Salesforce Contract record.

**Q1.20** State-specific holiday handling — federal holidays are universal, but state-only holidays vary (e.g. Lincoln's Birthday in IL). Do state-only holidays count toward the 3-business-day count? Evidence suggests: yes for IL, IN, OH, WI where Peerless operates — confirm with Peerless legal/compliance.
**Answer:** Inferred from compliance requirement — confirm. Default: federal + state holidays for IL/IN/OH/WI. Refresh annually.

**Q1.21 [TRIGGERED BY: AI/LLM]** Signature legibility scoring — what's the threshold below which a contract is flagged? Evidence suggests: IDP confidence < 80% on the signature field → flag for human review. DataSkate default per FK-040 (two-tier: overall ≥ 85% AND every critical field ≥ 80%).
**Answer:** Inferred from FK-040 architect rule — confirm. Default: overall confidence ≥ 85% AND signature field ≥ 80%, anything below routes to Salesforce review queue.

**Q1.22** Per HD Portal quirk: customer signature value cannot be "declined" or "unavailable" — must be `owner` / `occupant` / `owner+occupant`. Confirm the rejection list is complete.
**Answer:** Inferred from rex.json HD Portal quirks — confirm. Default reject list: ["declined", "unavailable", "n/a", "none", null, ""].

**Q1.23 [SYSTEM: Anypoint IDP]** State-specific deposit rule check (IL/IN/OH = 100%, WI = 99%) — should this be enforced as a compliance gate alongside right-of-rescission? Evidence suggests: yes, same flow — both are HD Portal contract quirks. Cheap to add.
**Answer:** Inferred from rex.json HD Portal quirks — confirm. Default: enforce as part of compliance status.

**Scope Boundary for this flow:**
- ✅ IN SCOPE: On Final-status contract, compute right-of-rescission date (DataWeave business-day function + IL/IN/OH/WI holiday calendar refreshed annually); submit contract PDF to Anypoint IDP for signature legibility scoring; check deposit % matches state rule; write `Compliance_Status__c` on Contract; Chatter to rep + ops manager on fail.
- ⚠️ ASSUMED PRE-EXISTS: UC3 attached the contract PDF; Anypoint IDP entitlement (see UC8); compliance field set defined in IDP Workshop; `Compliance_Status__c` picklist on Contract.
- ❌ OUT OF SCOPE: Legal interpretation of "right of rescission" by state (Peerless legal owns); LLM-based free-form clause extraction; auto-rejection of contracts (humans resolve).

→ See Section 3.8 for pre-filled field mapping.

---

### 1.8 UC8 — Change Order PDF → Anypoint IDP Extraction → Salesforce Update (hybrid) [HIGH complexity]

**Business problem this solves:** Change Orders arrive as PDF attachments — sometimes by email, sometimes dropped in Google Drive — and Ashley manually re-keys the changes into the matching Salesforce project/contract. This flow polls Email + Drive for new PDFs, extracts the change-order fields with Anypoint IDP, and updates the matching Salesforce record automatically.

**Trigger:** Scheduler polls (a) IMAP folder for new emails with PDF attachments AND/OR (b) Google Drive folder for new PDFs → POST attachment to Anypoint IDP → poll IDP for `SUCCEEDED` status → DWL transform → update matching Salesforce Project / Contract record.

> ⚠️ **P0 BLOCKERS bundled here:**
> - **UC8 source binding:** is the source Email, Google Drive, or BOTH? If both, NO-COMBINE splits UC8 into two flows (the flow count moves from 8 to 9 — pricing is currently locked on 8). See Q1.24.
> - **Anypoint IDP entitlement** on Peerless's MuleSoft subscription — confirm at intake.
> - **Sample documents:** 30+ samples per document class needed for IDP model training.

**Q1.24 [P0] [SYSTEM: Email/Google Drive]** Source binding for Change Order PDFs — Email inbox only, Google Drive folder only, or **both**? Identify the specific mailbox/folder.
**Answer:** Pending Peerless confirmation. If BOTH, flow count rises from 8 to 9 — re-priced before SOW signing.

**Q1.25 [SYSTEM: Email]** Tenant type — Microsoft 365 (Graph OAuth), Google Workspace (Gmail API), or another IMAP host? Microsoft 365 basic auth is deprecated — modern OAuth via Graph required for M365.
**Answer:** Inferred from peerlessfence.com email domain — confirm. Likely M365 based on domain pattern, but please verify.

**Q1.26 [P0] [SYSTEM: Anypoint IDP]** Confirm Anypoint IDP entitlement on Peerless's MuleSoft subscription. Workshop is SOW line item — cannot start without entitlement.
**Answer:** Pending Peerless MuleSoft contract review. If not currently licensed, this becomes a P0 scope item (entitlement add-on cost outside Automation Starter).

**Q1.27** Who provides the 30+ sample Change Order PDFs (and 30+ sample 299A/299B/118 contracts for UC7)? Evidence suggests: Ashley owns the samples (she is the one re-keying them today). Target delivery: 2 weeks before M1 sprint start.
**Answer:** Inferred — confirm with Ashley. Default: Ashley delivers redacted samples 2 weeks before M1.

**Q1.28** What is the routing rule on low-confidence IDP extraction? Evidence suggests per FK-040: overall ≥ 85% AND every critical field ≥ 80% → auto-update Salesforce. Anything below → route to Salesforce review queue. Critical-field list defined during IDP Workshop.
**Answer:** Inferred from FK-040 — confirm. Default: two-threshold rule (85% overall + 80% per critical field).

**Q1.29** What happens to the original inbound email/Drive file after IDP processes it — leave in place, move to a `processed/` folder, or delete? Evidence suggests: move to `processed/` — DataSkate default. Keeps the source uncluttered while preserving audit trail.
**Answer:** Inferred from DataSkate default — confirm. Default: move to `processed/`.

**Scope Boundary for this flow:**
- ✅ IN SCOPE: Poll Email + Google Drive sources at agreed cadence; stream attachments in-memory to Anypoint IDP (CloudHub 2.0 ephemeral filesystem — NEVER write to local disk); poll IDP every ≥10s; confidence-route high-confidence extractions to Salesforce update, low to review queue; idempotent on email messageId + IDP executionId.
- ⚠️ ASSUMED PRE-EXISTS: Anypoint IDP entitlement (Q1.26); IDP action published in Peerless's tenant, trained on Peerless's samples (Q1.27); Email OAuth credentials (Microsoft Graph or Gmail); Google Drive service account (preferred) or OAuth credentials; specific mailbox/folder IDs.
- ❌ OUT OF SCOPE: Training the IDP model itself (engagement-billable separately in IDP Workshop); building a custom review-queue UI (Phase 1 uses Salesforce list view); SPF/DKIM/DMARC on Peerless sending domain; outbound confirmation reply to sender.

→ See Section 3.9 for pre-filled field mapping.

---

### POTENTIAL FLOWS — Phase 2 candidates (not in current scope; logged so they don't get lost)

#### [POTENTIAL FLOW — UC9] Bidirectional Payment / Deposit Status Sync (HD Portal ↔ Salesforce) [Priority: High]
**What it solves:** Ashley named this directly — *"if that could integrate and flow back through an API, that would be awesome."* Today she manually enters deposit-paid status by going through Home Depot reporting. Sync this both ways and the manual step goes away.
**Question:** Phase 2 inclusion? Does HD Portal expose a payment-status endpoint? Evidence suggests: Phase 2 — adjacent to UC2 architecture. Logged here.
**Answer:** Inferred — confirm Phase 2 priority with Ashley.

#### [POTENTIAL FLOW — UC10] CE Task Assignment for Material Routing (ComputerEase ← Salesforce) [Priority: Medium]
**What it solves:** Ashley demonstrated creating CE tasks for Barb on aluminum/PVC material orders. Conditional routing rules exist ("aluminum and PVC get tasked to Barb"). Client explicitly deferred — *"Leave the tasking to last in the build out."*
**Question:** Phase 2 inclusion? Peerless to document routing rules in writing before promotion.
**Answer:** Inferred — confirm Phase 2 priority + ask Peerless to document routing rules.

#### [POTENTIAL FLOW — UC11] Atomic Job-Number Reservation (MuleSoft owns counter) [Priority: Medium]
**What it solves:** Job numbers (`26HD565AS` format) are picked manually from a shared spreadsheet to avoid race conditions. An atomic next-number reservation eliminates the manual coordination.
**Question:** Phase 1 or Phase 2? Does CE expose an atomic next-number endpoint, or does MuleSoft own the counter (Object Store, per-department key)?
**Answer:** Inferred — Architect decision needed. Default in UC4: MuleSoft owns it in Object Store. Promotion to its own flow only if Peerless wants a separate reservation API.

---

## SECTION 2 — SYSTEMS AND ACCESS

### 2.1 Salesforce (target — Phase 1)
**Deployment:** Cloud (Salesforce.com)
**Auth method:** OAuth 2.0 JWT Bearer Flow with dedicated integration user — DataSkate standard.
**API version:** v59.0 pinned (never `/latest/`).
*Evidence suggests confirmed.*

**Q2.1 [SYSTEM: Salesforce]** Confirm the Salesforce sandbox user has been created by Cora Barahi (in flight per Marius Apr 14). Provide credentials handoff path.
**Answer:** Pending. Cora Barahi owns. Default handoff: secrets manager (NOT confidential email).

**Q2.2 [SYSTEM: Salesforce]** Confirm State/Country Picklists enabled status, and confirm single-currency USD vs multi-currency.
**Answer:** Inferred from IL/IN/OH/WI US-only operations — confirm. Default: State/Country picklists enabled; single-currency USD.

**Q2.3 [SYSTEM: Salesforce]** Confirm the existing Salesforce integration was originally built by "Amarius" (HD-side dev). DataSkate is replacing/extending the broken HD-lead-pull, NOT building greenfield. Confirm what currently exists in the org so we don't double-build.
**Answer:** Inferred from sage.json — confirm with Cora Barahi. Default: investigate existing call before re-implementing UC1.

### 2.2 HD Portal (Home Depot Service Center)
**Deployment:** Cloud
**Vendor:** Home Depot — proprietary integration partner portal
**Auth method:** API key (shared by Marius Apr 15 via confidential email — clipboard-blocked; manually typed into secrets manager)
**API style:** REST — no MuleSoft native connector, use HTTP connector
*Evidence suggests confirmed.*

**Q2.4 [P0] [SYSTEM: HD Portal]** Confirm GET, POST/PATCH, and document download endpoint coverage (already covered in Q1.4, Q1.7) — bundle the answer with Greg in a single HD API ticket. Never burn two HD tickets where one suffices.
**Answer:** Pending HD API team response via Greg.

**Q2.5 [SYSTEM: HD Portal]** Test leads must be labeled "Peerless test" so HD compliance grading excludes them. Confirm test-data labeling convention with HD.
**Answer:** Inferred from rex.json HD Portal quirks — confirm with Marius/Greg. Default: prefix `PEERLESS-TEST-` on all test leads.

### 2.3 ComputerEase (target — Phase 1)
**Deployment:** On-premise (Windows VM on GCP — IP `35.222.218.224`)
**Vendor:** Deltek (legacy product — 4-hour support SLA, not 2-hour)
**Auth method:** Basic auth (apiUser + apiPassword) over CE Live Service relay
**API style:** REST — routes through Deltek CE Live Service relay (NOT direct VM IP)
*Evidence suggests confirmed.*

**Q2.6 [P0] [SYSTEM: ComputerEase]** Confirm post-CE-Live-Service-install: which port is the relay listening on (was 445 SMB — expected 443 after install)? Has Brian Cook restricted SSH/RDP to office + DataSkate engineer IPs only (currently open to internet — P0 security finding)?
**Answer:** Pending Brian Cook + Deltek support response.

**Q2.7 [SYSTEM: ComputerEase]** Confirm GCP hosting cost (~$5K/month) and whether Peerless is open to a future migration to Deltek cloud-hosted CE for hosting savings. (Phase 2 conversation — flagging here for visibility.)
**Answer:** Inferred from transcript (Jeff Kelly raised the $5K/month hosting cost) — confirm. Default: open to discussion at Phase 2.

### 2.4 Anypoint IDP
**Deployment:** Cloud — MuleSoft-managed
**Connector:** `io.github.mulesoft-forge:mule-idp-connector:1.0.6` (Maven Central — add `mavenCentral()` to pom.xml; requires Mule 4.6+)
**Auth method:** OAuth 2.0 Client Credentials via Anypoint Connected App (scope left empty — any value returns 401)
**Region:** US East default
*Evidence suggests confirmed.*

**Q2.8 [P0] [SYSTEM: Anypoint IDP]** IDP entitlement + sample documents — bundled with Q1.26 + Q1.27 above.

### 2.5 Email (Change Order intake)
**Deployment:** Cloud — Microsoft 365 (expected) or Google Workspace
**Auth method:** OAuth 2.0 via Microsoft Graph (M365) or Gmail API (Google) — basic auth deprecated on M365 for new tenants
*Evidence suggests confirmed.*

**Q2.9 [SYSTEM: Email]** Mailbox + tenant confirmation — bundled with Q1.25 above.

### 2.6 Google Drive (Change Order intake)
**Deployment:** Cloud
**Auth method:** Google Workspace service account (preferred for unattended polling) — domain-wide delegation required if impersonating a user
**Connector:** `mule4-google-drive-connector` v1.1
*Evidence suggests confirmed.*

**Q2.10 [SYSTEM: Google Drive]** Confirm: are Change Order PDFs in a **Shared Drive** (service account must be EXPLICITLY added as member) or in a user's **My Drive** (service account needs domain-wide delegation)? Provide the specific folder ID(s).
**Answer:** Pending — Peerless IT to confirm. Default recommendation: Shared Drive with service account as Member (cleanest pattern).

### 2.7 GCP / On-prem VM hosting (ComputerEase infrastructure)
*Not an integration target — hosting platform.* Brian Cook is GCP admin.

**Q2.11 [SYSTEM: GCP]** Confirm MuleSoft tenant IP allowlisted in GCP ingress firewall rule (post-deployment). DataSkate provides tenant IP at deployment time. Confirm Brian Cook owns this change.
**Answer:** Inferred — confirm with Brian Cook.

### 2.8 Deltek (UNCONFIRMED — separate product?)

**Q2.12 [P0] [SYSTEM: Deltek]** See Q1.14 above. Confirm Deltek is a separate Deltek product or vendor-name overlap with ComputerEase. Cannot finalize pricing or architecture until resolved.
**Answer:** Pending.

### 2.9 DocHub (currently manual — out of Phase 1 scope)

**Q2.13 [SYSTEM: DocHub]** Confirm: DocHub integration remains a manual step (Ashley generates + signs 118 forms by hand, then attaches to Salesforce via UC3). If you want this automated in Phase 2, please flag it now.
**Answer:** Inferred from Sage's reading of SOW — confirm. Default: manual workflow continues; flag for Phase 2 if desired.

### Q2.14 — Cross-system: Existing ESB or middleware?
**Answer:** Inferred — confirm with Brian Cook. Default: no ESB; existing Salesforce integration was point-to-point (Amarius-built HD lead pull, currently broken).

### Q2.15 — Existing Anypoint Platform subscription — tier + vCores?
**Answer:** Pending. Bundle with Q2.8 (IDP entitlement check) in same MuleSoft contract review with your MuleSoft Account Executive.

### Q2.16 — Existing Anypoint Exchange assets to reuse?
**Answer:** Inferred — confirm. Default: none; Phase 1 builds the first Peerless assets and publishes to Peerless's Exchange.

---

## SECTION 3 — DATA AND FIELD MAPPING

*All tables below are pre-filled from canonical-construction models + Salesforce, HD Portal, and ComputerEase playbook field knowledge. ⚠️ CRITICAL questions are ones where a wrong answer causes silent failure or rework — review carefully.*

### 3.1 External ID Cross-Reference (Idempotency Keys)

| Entity | Source System | Source Field | Target System | Target Field | Confirm? |
|---|---|---|---|---|---|
| Lead | HD Portal | F number | Salesforce | `Lead.HD_Portal_Id__c` (External ID) | Correct / Correct it: |
| Account / Customer | HD Portal | customerId | Salesforce | `Account.HD_Portal_Customer_Id__c` (External ID) | Correct / Correct it: |
| Customer | Salesforce | Account.Id | ComputerEase | `customer.externalRef` | Correct / Correct it: |
| Job | Salesforce | Opportunity.Id | ComputerEase | `job.externalRef` | Correct / Correct it: |
| Job Number | ComputerEase | jobNumber (e.g. `26HD565AS`) | Salesforce | `Opportunity.CE_Job_Number__c` | Correct / Correct it: |
| Contract Document | HD Portal | contractId (299A/299B/118) | Salesforce | `Contract.HD_Contract_Id__c` (External ID) | Correct / Correct it: |
| Change Order (IDP) | Email/Drive | messageId / driveFileId | Salesforce | `Project.Change_Order_Source_Id__c` | Correct / Correct it: |
| Change Order (IDP audit) | Anypoint IDP | executionId | Salesforce | `Project.IDP_Execution_Id__c` | Correct / Correct it: |

**Q3.1 ⚠️ CRITICAL [SYSTEM: cross-system]** Are there additional cross-reference keys to add? Common additions: an HD `orderId` separate from the F-number `leadId` on `Opportunity`; a separate `CE_Customer_Id__c` if CE customer ID differs from Salesforce Account.Id. Confirm or add.
**Answer:** Inferred — confirm. Default: add `Opportunity.HD_Order_Id__c` (External ID) to separate the lead F-number from the post-conversion order ID. Add `Account.CE_Customer_Id__c` (External ID) to capture the CE-side customer ID independently from Salesforce Account.Id.

### 3.2 UC1 — HD Portal Lead → Salesforce Lead (Field Mapping)

| Source Field (HD Portal) | Target Field (Salesforce) | Notes |
|---|---|---|
| F number (lead number) | `Lead.HD_Portal_Id__c` | Upsert key (External ID) |
| customer.firstName | `Lead.FirstName` | |
| customer.lastName | `Lead.LastName` | |
| customer.email | `Lead.Email` | |
| customer.phone | `Lead.Phone` | |
| customer.address (composed) | `Lead.Street`, `Lead.City`, `Lead.State`, `Lead.PostalCode` | If State/Country picklists enabled, use ISO codes |
| jobType | `Lead.Job_Type__c` | Picklist: residential-fence / commercial-fence / repair |
| materialType | `Lead.Material_Type__c` | Picklist: cedar / aluminum / PVC / picket |
| leadSource | `Lead.LeadSource` | Always "Home Depot" |
| createdAt | `Lead.CreatedDate` (informational) + `Lead.HD_Created_At__c` | HD timestamp preserved |
| status (HD-side) | `Lead.Status` | Open → "New"; Quoted → "Working - Contacted"; Final → convert to Opportunity |

### 3.3 UC2 — Salesforce → HD Portal Customer + Quote Correction (Field Mapping — write-back, pending Q1.4)

| Source Field (Salesforce) | Target Field (HD Portal) | Notes |
|---|---|---|
| Account.Name | customer.name | |
| Account.BillingStreet/City/State/PostalCode | customer.address | |
| Account.Phone | customer.phone | |
| Account.PersonEmail (or Contact.Email) | customer.email | |
| Quote.TotalAmount | quote.totalAmount | |
| Quote.Status | quote.status | Salesforce → HD status map TBD in IDP Workshop |
| QuoteLineItem.Product2.SKU | quote.lineItems[].sku | Only sync if SKU or Quantity changed (debounce) |
| QuoteLineItem.Quantity | quote.lineItems[].quantity | |
| QuoteLineItem.UnitPrice | quote.lineItems[].unitPrice | |
| QuoteLineItem.Discount | quote.lineItems[].discount | Promotion SKU validation — see UC6 |

### 3.4 UC3 — HD Portal Signed Contract → Salesforce Attachment (Field Mapping — pending Q1.7)

| Source Field (HD Portal) | Target Field (Salesforce) | Notes |
|---|---|---|
| contractId | `Contract.HD_Contract_Id__c` | External ID upsert key |
| contractType (299A / 299B / 118) | `Contract.Document_Type__c` | Picklist |
| signedAt | `Contract.SignedDate` (standard) | |
| signerName | `Contract.Customer_Signer__c` | |
| signerRole (owner / occupant / owner+occupant) | `Contract.Signer_Role__c` | Picklist; must NOT be "declined" / "unavailable" |
| depositPct | `Contract.Deposit_Pct__c` | IL/IN/OH = 100; WI = 99 |
| (PDF binary) | `ContentVersion.VersionData` + `ContentDocumentLink.LinkedEntityId = Contract.Id` | Attachment |

### 3.5 UC4 — HD Portal + Salesforce → ComputerEase Customer + Job (Field Mapping)

| Source Field | Target Field (ComputerEase) | Notes |
|---|---|---|
| HD customerName | `customer.name` | |
| HD customer address | `customer.address` | |
| HD customer phone/email | `customer.phone` / `customer.email` | |
| Salesforce Account.Id | `customer.externalRef` | Idempotency key |
| Salesforce Opportunity.Amount | `job.totalAmount` | |
| Salesforce Opportunity.SalesRep__c (initials) | `job.salesRepInitials` | Free-form 2-3 char code |
| Salesforce Opportunity.Department__c | `job.department` | Free-form code (R05 = retail Home Depot) |
| Salesforce Opportunity.CommissionPct__c | `job.commissionPct` | |
| Salesforce Opportunity.OverheadStructure__c | `job.overheadCode` | |
| (computed) jobNumber `{YY}{HD}{seq}{rep-initials}` | `job.jobNumber` | Atomic counter — MuleSoft Object Store or CE next-number endpoint (Q1.12) |
| HD installDate (Friday, 4-6 weeks out) | `job.scheduledInstallDate` | HD enforces Friday-only |
| material list (Salesforce QuoteLineItem) | `job.lineItems` | cedar / aluminum / PVC / picket |
| Salesforce Opportunity.Id | `job.externalRef` | Idempotency key |

### 3.6 UC5 — Multi-System Validation Fields (Compare List)

| Field | HD Portal | Salesforce | ComputerEase | Deltek (pending) | Threshold |
|---|---|---|---|---|---|
| Customer name | `customer.name` | `Account.Name` | `customer.name` | TBD | Any non-whitespace diff |
| Customer address | `customer.address` | `Account.BillingAddress` | `customer.address` | TBD | Normalized string diff |
| Material type | `lineItems[].materialType` | `QuoteLineItem.Material_Type__c` | `job.lineItems[].material` | TBD | Any change |
| Pricing — total | `quote.totalAmount` | `Quote.TotalAmount` | `job.totalAmount` | TBD | $50 OR 2% threshold (Q1.15) |
| Pricing — line item | `lineItems[].unitPrice` | `QuoteLineItem.UnitPrice` | `job.lineItems[].unitPrice` | TBD | $50 OR 2% |

### 3.7 UC6 — Promotion SKU + Discount Allocation (Field Mapping)

| Source Field | Comparison Rule | Action |
|---|---|---|
| HD `lineItems[].sku` (prefix = promo code) | Match to Salesforce `Quote.DiscountType__c` | If mismatch → flag |
| Salesforce `Quote.discountPct` | Match to signed contract `discountPct` (IDP-extracted) | If mismatch → flag |
| Salesforce `Quote.totalAmount` (after discount) | Match to signed contract `totalAmount` | If > $50 / 2% → flag |
| Write status | `Quote.Promo_Discount_Status__c` | Picklist: Match / Mismatch-SKU / Mismatch-Pct / Mismatch-Total |

### 3.8 UC7 — Contract Compliance Validation (Field Mapping)

| Source Field | Target Field (Salesforce) | Rule |
|---|---|---|
| Contract sign date (IDP-extracted) | `Contract.SignedDate` | Source of truth |
| (computed) rescission date = signedDate + 3 business days (federal + IL/IN/OH/WI holidays) | `Contract.Rescission_Date__c` | DataWeave business-day function; refresh annually |
| Contract signer name (IDP-extracted) | `Contract.Customer_Signer__c` | Confidence ≥ 80% else flag |
| Contract signer role (IDP-extracted) | `Contract.Signer_Role__c` | Must be owner/occupant/owner+occupant; reject "declined"/"unavailable" |
| Deposit % (IDP-extracted) | `Contract.Deposit_Pct__c` | Must match state rule (IL/IN/OH = 100; WI = 99) |
| (computed) compliance result | `Contract.Compliance_Status__c` | Picklist: Pass / Fail-Signature / Fail-Deposit / Fail-Signer-Role |

### 3.9 UC8 — Change Order PDF → IDP → Salesforce (Field Mapping)

| Source Field (IDP extracted) | Target Field (Salesforce) | Notes |
|---|---|---|
| documentClass (ChangeOrder) | `Project.Document_Type__c` | Always "ChangeOrder" |
| projectReference (HD F-number or jobNumber) | (lookup key) | Find matching `Project` |
| changeOrderDate | `Change_Order__c.ChangeOrderDate` | |
| changeDescription | `Change_Order__c.Description` | |
| changeAmount | `Change_Order__c.Amount` | |
| approvedBy (signer) | `Change_Order__c.ApprovedBy` | |
| (IDP) executionId | `Change_Order__c.IDP_Execution_Id__c` | Audit traceability |
| (IDP) confidenceOverall | `Change_Order__c.IDP_Confidence__c` | Drives routing — ≥ 85% else review |
| (Email/Drive) messageId / driveFileId | `Change_Order__c.Source_Id__c` | Idempotency key |

**Q3.2 [P1] [SYSTEM: ComputerEase]** Is there a separate `Change_Order__c` custom object in Salesforce today, or should DataSkate create it? Evidence suggests: create new — Peerless does not currently track Change Orders in Salesforce as a distinct object (Ashley re-keys them into Project notes).
**Answer:** Inferred — confirm with Cora Barahi. Default: DataSkate creates `Change_Order__c` (child of `Project`) with the fields above.

---

## SECTION 4 — VOLUME AND PERFORMANCE

**Q4.1** Expected transaction volume per flow — per hour, day, month?
**Answer:** Inferred from $31.8M ARR + 8-location residential fence contractor + Home Depot Pro channel — confirm.
- **UC1 (HD lead → SF):** ~50–100 leads/day across all 8 locations; peaks in spring/summer.
- **UC2 (SF → HD correction):** ~10–30 corrections/day (rep edits on Account/Quote fields).
- **UC3 (HD contract → SF attachment):** ~20–40 signed contracts/day in season.
- **UC4 (HD/SF → CE Customer+Job):** ~20–40 new jobs/day.
- **UC5 (multi-system validation):** Fires once per new Final HD order — same volume as UC4.
- **UC6 (Promo SKU validation):** Same volume as UC4 (~20–40/day).
- **UC7 (Compliance validation):** Same volume as UC3 (~20–40/day).
- **UC8 (Change Order PDF intake):** ~5–15 PDFs/day off-peak; 15–30/day in peak season.

**Q4.2** Peak load times — annual, monthly, daily?
**Answer:** Inferred from residential-fence industry pattern — confirm. Default: spring + summer peak (Apr–Sep); morning ingest spike for IDP as Change Orders arrive overnight; Friday install-date crunch (HD enforces Friday installs).

**Q4.3** Maximum acceptable latency per flow?
**Answer:** Inferred from rex.json HD propagation floor + DataSkate defaults — confirm.
- UC1, UC3: ≤15 min end-to-end (HD's 10-min propagation floor + 5-min poll cadence + processing).
- UC2: ≤10 min (Salesforce CDC debounced 5 min + processing).
- UC4: ≤15 min after UC3 success (depends on CE Live Service relay latency).
- UC5–UC7: ≤30 min (depends on UC3 + UC4 ahead of them).
- UC8: ≤10 min from email/Drive arrival to Salesforce update (IDP P50 = 7.6s, P99 = 13.4s).

**Q4.4** Uptime SLA required?
**Answer:** Inferred from DataSkate IaaS managed service standard — confirm. Default: 99.9% (CloudHub 2.0 platform baseline).

**Q4.5** Payload size range?
**Answer:** Inferred — confirm.
- UC1–UC2 (lead/quote events): < 50 KB JSON.
- UC3 + UC8 (PDF attachments): 1–10 MB typical (Anypoint IDP capped at 10 MB / 50 pages — split required for over-limit).
- UC4–UC7: < 200 KB JSON per record set.

**Q4.6** PDF size profiling — confirm 299A/299B/118 and Change Order PDFs typically stay under 50 pages / 10 MB? IDP hard limit means over-limit PDFs must be split client-side.
**Answer:** Pending — Ashley to confirm with sample PDFs.

---

## SECTION 5 — SECURITY AND COMPLIANCE

**Q5.1** Authentication method per system — confirm pre-filled from rex.json:
- Salesforce: OAuth 2.0 JWT Bearer with Connected App + integration user
- HD Portal: API key (already shared by Marius Apr 15 — typed into secrets manager)
- ComputerEase: Basic auth (apiUser + apiPassword) over CE Live Service relay
- Anypoint IDP: OAuth 2.0 Client Credentials via Anypoint Connected App (scope empty)
- Email: OAuth 2.0 Microsoft Graph or Gmail API
- Google Drive: Google Workspace service account (preferred)
**Answer:** Inferred — confirm or correct.

**Q5.2** Is PII or sensitive data transmitted in these flows?
**Answer:** Inferred — confirm. Default: yes — customer name, address, phone, email on every UC1–UC5; signature images on UC3 + UC7. Standard residential-contractor data class — not HIPAA / GLBA, but is subject to general PII handling under state privacy laws (IL BIPA / IL Personal Information Protection Act).

**Q5.3** Regulatory compliance requirements?
**Answer:** Inferred from IL/IN/OH/WI operating states + residential contracting industry — confirm. Default: state contractor licensing rules (sales-rep license number cascade on 299A/299B); federal + state right-of-rescission law (UC7); state-specific deposit rules (IL/IN/OH = 100% / WI = 99%); no HIPAA / no PCI / no GDPR.

**Q5.4** Data residency requirements?
**Answer:** Inferred from US-only operations — confirm. Default: US East region for CloudHub 2.0; no cross-border.

**Q5.5** Should integration credentials (OAuth tokens, HD API key, CE basic-auth password, Salesforce JWT private key, IDP client secret, Google service account JSON) be stored in **AWS Secrets Manager**?
**Answer:** Inferred from DataSkate IaaS standard — confirm. Default: yes — AWS Secrets Manager for all secrets. Brian Cook's team has no opinion on which secrets vault per sage transcript.

**Q5.6** Should field-level encryption be applied to specific Salesforce fields (e.g. SSN-adjacent fields like Customer phone, email)? Salesforce Shield Platform Encryption is a separate license.
**Answer:** Inferred — confirm. Default: no Shield in Phase 1 (encrypt-in-transit via TLS only). Flag for Phase 2 if compliance contract requires at-rest encryption in Salesforce.

**Q5.7** Is mTLS required between CloudHub and the ComputerEase CE Live Service relay?
**Answer:** Inferred — confirm with Brian Cook. Default: no mTLS for Phase 1 (basic auth + IP allowlist on GCP firewall provides perimeter security); revisit if Peerless legal requires it.

**Q5.8** Audit trail retention requirement?
**Answer:** Inferred from contractor / construction industry standard + IL contractor records — confirm. Default: 7 years for compliance-relevant records (UC3, UC7); CloudHub log retention is 90 days default → archive to S3 for sustained audit.

---

## SECTION 6 — ERROR HANDLING

**Q6.1** Target system unavailable — retry / queue / fail?
**Answer:** Inferred from DataSkate IaaS standard — confirm. Default: retry with queue then DLQ. 3 retries with exponential backoff (30s → 2 min → 5 min), then persist to Object Store / DLQ with alert. ComputerEase on-prem + HD Portal are the most likely candidates for transient unavailability.

**Q6.2** Message expiry in retry queue?
**Answer:** Inferred from DataSkate defaults — confirm.
- Critical (UC4 CE writes, UC7 compliance): 7 days TTL.
- Standard (UC1, UC3, UC8): 24 hours TTL.
- Notification (UC5/UC6 mismatch alerts): 1 hour TTL.

**Q6.3** Failure notification recipients and channel?
**Answer:** Inferred from sage.json namedContacts — confirm and provide emails.
- **Tier 1 — integration/system failures:** Brian Cook (Peerless IT) + Raghuram Potluri (DataSkate). Channel: email.
- **Tier 2 — business/process failures (UC5/UC6/UC7 flags, UC8 low-confidence IDP):** Ashley Salerno + Jeff Kelly (ops manager). Channel: email + Salesforce Chatter on the affected record.

**Q6.4** Zero data-loss or best-effort?
**Answer:** Inferred — confirm. Default: zero data-loss on UC2 (corrections), UC3 (contracts), UC4 (CE writes), UC7 (compliance). Best-effort acceptable on UC5/UC6 alerts (alerts can be re-fired manually).

**Q6.5** Idempotency requirement?
**Answer:** Inferred from CE-production-only constraint — confirm. Default: yes, mandatory on every flow. UC4 + UC8 are critical — UC4 writes to CE production, UC8 writes to Salesforce. Idempotency keys: HD F-number (UC1), Account.Id (UC2), contractId (UC3), Opportunity.Id (UC4), email messageId + IDP executionId (UC8).

**Q6.6** Rollback needed for financial / provisioning / compliance flows?
**Answer:** Inferred — confirm. Default: no rollback on Phase 1.
- UC4 (CE Customer + Job) — if CE write fails after Salesforce reads, no compensating action needed (CE is the only mutation). If a UC4 write succeeds but UC5 later detects a mismatch, the resolution path is human (Ashley) cancelling the CE job through CE's normal workflow — NOT a MuleSoft saga rollback.
- UC7 (compliance) — read-only; no rollback needed.
- Phase 2 (UC9 payment sync, UC10 task assignment) may require compensation; revisit then.

**Q6.7** On IDP `MANUAL_VALIDATION_REQUIRED` or `PARTIAL_SUCCESS` status — should the document always route to Salesforce review queue, or have a separate handling path?
**Answer:** Inferred — confirm. Default: always route to Salesforce review queue with the partial extraction visible + human-review flag.

---

## SECTION 7 — DEPLOYMENT AND DEVOPS

**Q7.1** Deployment model preference?
**Answer:** Inferred from flo.json — confirm. Default: **CloudHub 2.0** (DataSkate-managed IaaS). The on-prem ComputerEase System API runs against CE Live Service relay (relay handles the on-prem reach); CloudHub 2.0 is sufficient — NOT customer-managed runtime.

**Q7.2** Environments needed?
**Answer:** Inferred from DataSkate standard 3-env — confirm. Default: Development + UAT + Production.
- **CRITICAL:** ComputerEase has NO sandbox — UAT writes to CE production with GET-only safe mode + dry-run flag until UAT sign-off.
- Salesforce sandbox available (Cora Barahi provisioning).
- Anypoint IDP sandbox tenant available.

**Q7.3** Network / firewall restrictions?
**Answer:** Inferred from rex.json — confirm with Brian Cook. Default: MuleSoft tenant IP allowlisted in GCP ingress firewall on port 443 (post-CE-Live-Service-install); SSH/RDP restricted to office + DataSkate engineer IPs only (currently open to internet — P0 security finding).

**Q7.4** CI/CD tools?
**Answer:** Inferred from first-MuleSoft-engagement pattern — confirm. Default: none at Peerless today; DataSkate IaaS provides the GitHub Actions pipeline as standard.

**Q7.5** Secrets management solution? — see Q5.5.
**Answer:** Default AWS Secrets Manager.

### Access Chain Table

*Please complete or correct any pre-filled entries. Flag any system where there is no named backup admin (single-point-of-failure risk).*

| System | Admin Owner | API User Creator | Backup Admin | Vendor Support Login | Environments Available | Status |
|---|---|---|---|---|---|---|
| **Salesforce** | Cora Barahi (Salesforce admin) — **email needed** | Same | **[confirm — Amarius (initial dev) is named in sage but unclear if still active]** | N/A (DataSkate manages) | Sandbox (in flight) + Production | ⚠️ Q2.1 + Q2.3 pending |
| **HD Portal** | Marius (HD Portal liaison) | Marius / Greg (HD API team) | Marcos (HD platform contact) | Greg (HD API ticket system) | Production only | ⚠️ Q1.4 + Q1.7 + Q2.4 pending; UI login Q1.2 pending |
| **ComputerEase** | Jean Jacobs (jeanj@peerlessfence.com) — sole admin (P0 risk) | Jean Jacobs (via built-in `pwmaint` account) | **Laura (recommended by Brian; Kirk approval needed)** | Jean Jacobs (Deltek support ticket owner) | **Production only — no sandbox** | ⚠️ Q1.10 + Q1.11 pending |
| **Anypoint IDP** | **[Anypoint contract owner unconfirmed — likely Brian Cook]** | Anypoint Connected App | **[confirm]** | Raghuram + MuleSoft SE | Trained sandbox + Production | ⚠️ Q1.26 + Q1.27 + Q2.15 pending |
| **Email Intake** | **[confirm — Brian Cook expected]** | Same | **[confirm]** | M365 or Google Workspace admin | Single mailbox | ⚠️ Q1.25 pending |
| **Google Drive** | **[confirm — Brian Cook expected]** | Same | **[confirm]** | Google Workspace admin | Single Shared Drive (Q2.10) | ⚠️ Q2.10 pending |
| **GCP / On-prem VM** | Brian Cook (Peerless IT) | Brian Cook (firewall) | **[confirm]** | GCP console | Production only | ⚠️ Q2.6 pending — SSH/RDP lockdown P0 |
| **Deltek (UNCONFIRMED)** | **[depends on Q1.14]** | TBD | TBD | TBD | TBD | ⚠️ Q1.14 P0 |

**Q7.6** Please complete the Access Chain table — add full names + email addresses + backup contacts. Flag any system where the same person is the only admin (single-point-of-failure risk).
**Answer:** Pending — fill above. Jean Jacobs as sole CE admin is already flagged as a P0 schedule risk (FK-031).

**Q7.7** Should the integration user account for Salesforce be a dedicated service account (`mulesoft@peerlessfence.com`) or a shared credential?
**Answer:** Inferred from DataSkate standard + JWT bearer requirement — confirm. Default: dedicated service account. Required for OAuth JWT bearer flow. Salesforce Integration User license (~$10/user/mo) required.

---

## SECTION 8 — OPERATIONS AND SUPPORT

**Q8.1** Logging and monitoring tools at Peerless today?
**Answer:** Inferred from first-MuleSoft-engagement pattern — confirm with Brian Cook. Default: no integration-specific monitoring at Peerless; DataSkate IaaS includes Anypoint Monitoring as standard. Peerless IT may have a corporate tool (Datadog / Splunk / nothing) — please confirm.

**Q8.2** Who owns post-go-live support of the integration layer?
**Answer:** Inferred from flo.json IaaS recommendation — confirm. Default: **DataSkate IaaS managed service** (recommended for the four reasons in flo.json: high-complexity engagement, production-only CE API, no in-house MuleSoft developer at Peerless, $5K hosting savings + Ashley's daily reconciliation hour are the value anchors). Implementation-Only is offered as a comparison option only.

**Q8.3** Should there be a client-facing dashboard or audit trail showing integration run history, error counts, and last-sync timestamps?
**Answer:** Inferred — confirm. Default: yes — Salesforce-embedded dashboard. Ashley + Brian + Jeff Kelly need visibility without contacting DataSkate. DataSkate builds a `Integration_Status__c` custom object + dashboard as part of IaaS scope.

---

## SECTION 9 — TESTING AND GO-LIVE

**Q9.1** Test environments per system?
**Answer:** Inferred — confirm. Default:
- Salesforce sandbox: yes (Cora Barahi in flight).
- ComputerEase: **NO sandbox** — production-only API, GET-only safe mode during dev, write-back windows in UAT against production with dry-run gates.
- HD Portal: no sandbox; test leads labelled `PEERLESS-TEST-` to exclude from HD compliance grading.
- Anypoint IDP: separate sandbox tenant.
- Email: separate test mailbox can be created by Brian Cook.
- Google Drive: separate test folder under same Shared Drive.

**Q9.2** Automated testing capability at Peerless?
**Answer:** Inferred from first-MuleSoft-engagement pattern — confirm. Default: none at Peerless; DataSkate provides MUnit test suite as the automated test layer. Peerless participates as UAT.

**Q9.3** UAT acceptance criteria — confirm or adjust these DataSkate-standard criteria for the 8 confirmed Phase 1 flows:
**Answer:** Inferred — confirm or adjust. Default criteria:
- **UC1:** 5 test HD leads created → verify 5 Salesforce Lead records appear within 15 min, all with correct External ID, source, and customer fields. 0 duplicates on rerun.
- **UC2 (pending Q1.4):** 5 test Salesforce Account/Quote edits → verify 5 HD Portal write-backs within 10 min. Pending HD write endpoint confirmation.
- **UC3 (pending Q1.7):** 5 test contracts reach "Final" → verify 299A + 299B + 118 PDFs attach to the matching Salesforce Contract within 15 min.
- **UC4:** 5 test HD orders → verify 5 ComputerEase Customer + Job records (idempotency keys present, dry-run mode validated, no duplicates on rerun, job numbers atomic).
- **UC5:** 5 test orders with planted mismatches (1 customer name diff, 1 material type diff, 1 pricing diff > 2%, 2 matching) → verify 3 flags on Salesforce Quote with correct status; 2 marked as "Match."
- **UC6:** 5 test contracts with planted SKU/discount mismatches (3 mismatches, 2 matches) → verify Chatter alerts to the assigned rep and Jeff Kelly.
- **UC7:** 5 signed test contracts, 3 in IL/IN/OH (100% deposit) + 2 in WI (99% deposit), 1 with illegible signature, 1 with "declined" signer role → verify rescission dates calculated correctly with holiday awareness; 2 flagged.
- **UC8:** 10 test Change Order PDFs to email + 10 to Drive → IDP extracts within 2 min; 8/10 routed high-confidence to Salesforce update, 2/10 to review queue (one missing critical field, one < 85% overall).
- Zero duplicate records across any flow during a 24-hour parallel-run test.
- DLQ shows zero unintended messages after 24 hours of test traffic.
- MUnit test suite ≥ 80% coverage on Process API + System APIs + IDP submit/poll subflow.

**Q9.4** Blackout periods — no deployments allowed during?
**Answer:** Inferred from industry pattern — confirm. Default: avoid Friday (HD enforces Friday install dates — production must be stable Thursday night through Friday); avoid end-of-month accounting close (Jean Jacobs is unavailable for support); avoid Apr–Sep peak season for any structural change (additive deploys OK).

**Q9.5** Target go-live date?
**Answer:** Pending — project.json `targetGoLive` = "TBD". Jeff Kelly said *"I would like to start Peerless next week if we can"* — implies kickoff ~end of May 2026. Catalog formula = 14 weeks for 8 flows. Earliest plausible go-live: **early Sept 2026** if kickoff is end of May. Confirm target or set explicit constraint (e.g. "must be live before peak Q3 season ends").

---

## SECTION 10 — SYSTEM-SPECIFIC DETAILS

*Max 3 questions per system — hard-blocker priority.*

### 10.1 Salesforce
**Q10.1 [SYSTEM: Salesforce]** Confirm the `Trigger.IgnoreNotifications__c` (or fenced-owner routing) pattern for suppressing the "Save as Final" + "Ready for Permitting" notifications during non-prod runs. Without it, UAT writes will fire permitting-department notifications.
**Answer:** Inferred from rex.json Salesforce quirks — confirm with Cora Barahi. Default: add `Trigger.IgnoreNotifications__c` boolean to relevant objects + suppression rule in Process Builder.

**Q10.2 [SYSTEM: Salesforce]** SOQL OFFSET fails silently above 2,000 records — UC5 multi-system aggregation and UC4 CE customer/job lookup must use nextRecordsUrl cursor pagination. Confirm the integration user has the API-only profile (no UI access — prevents accidental UI-mediated rate-limit contention).
**Answer:** Inferred from rex.json + Salesforce playbook — confirm. Default: dedicated integration user, API-only profile, cursor pagination.

**Q10.3 [SYSTEM: Salesforce]** Daily API call budget for the integration user — 15,000 calls/day on Enterprise edition. Estimate against UC1–UC8 volumes in Q4.1. Confirm headroom or upgrade plan.
**Answer:** Inferred — confirm. Default: at projected ~200 leads/day + ~200 corrections + ~200 CDC events + ~200 IDP updates × ~2 calls each = ~1,600 calls/day → 11% utilization. Comfortable headroom. Monitor `Sforce-Limit-Info` header and alert at 12,000.

### 10.2 HD Portal
**Q10.4 [P0] [SYSTEM: HD Portal]** See Q1.4 + Q1.7 + Q2.4 (HD API endpoint coverage).

**Q10.5 [SYSTEM: HD Portal]** Sales-rep profile licensing numbers cascade onto every 299A/299B at print time — these MUST be populated in HD Portal before go-live. Confirm Ashley has captured each sales rep's state license number and populated the HD Portal profile.
**Answer:** Inferred from rex.json HD Portal quirks — confirm with Ashley. Default: Ashley delivers full sales-rep license number list (IL/IN/OH/WI) before M2 (UAT).

**Q10.6 [SYSTEM: HD Portal]** Install start/finish dates must fall on a Friday (4-6 weeks out from contract Final date). Confirm the UC4 job-creation flow respects this (`job.scheduledInstallDate` must be the first Friday ≥ 4 weeks after Final date).
**Answer:** Inferred from rex.json HD Portal quirks — confirm. Default: DataWeave computes the first Friday at Final + 28d (4 weeks) as the default; rep can override in HD Portal.

### 10.3 ComputerEase
**Q10.7 [P0] [SYSTEM: ComputerEase]** See Q1.10 (CE Live Service install) + Q1.11 (backup admin) + Q1.12 (job number reservation) + Q2.6 (firewall + port).

**Q10.8 [SYSTEM: ComputerEase]** CE API access groups — confirm the four required groups have been pre-created by Jean Jacobs: `jobs`, `subcontracts`, `cost types`, `job totals`. Payroll is explicitly EXCLUDED.
**Answer:** Pending Jean Jacobs. Required before any CE write flow.

**Q10.9 [SYSTEM: ComputerEase]** Sage notes the practice/sandbox company `P3` returns "Cannot access API from practice" — all CE testing happens in production with strict GET-only operations and idempotency keys. Confirm Peerless leadership has acknowledged this risk model (no undo button).
**Answer:** Inferred — confirm with Jeff Kelly / Kirk. Default: acknowledged; DataSkate implements dry-run mode gated by ENV property + business-validation gates before writes are enabled.

### 10.4 Anypoint IDP
**Q10.10 [P0] [SYSTEM: Anypoint IDP]** See Q1.26 + Q1.27 (entitlement + samples).

**Q10.11 [SYSTEM: Anypoint IDP]** Critical-field list per document class — defined during IDP Workshop. Confirm the workshop is scheduled (target before M1).
**Answer:** Inferred — confirm. Default: schedule IDP Workshop in Week 1 with Raghuram + Ashley + Lexi-equivalent (TBD owner). Doc classes: 299A, 299B, 118, ChangeOrder.

**Q10.12 [SYSTEM: Anypoint IDP]** Architect preference: rule-based extraction over LLM for legal/compliance fields (hallucination risk on right-of-rescission, signatures, deposit %). Confirm acceptance of this preference.
**Answer:** Inferred from FK-040 + Raghuram architect preference — confirm. Default: rule-based extraction on UC7 fields (signature presence, signer role, deposit %, sign date). LLM extraction is only acceptable on UC8 free-form Change Order description.

### 10.5 Email + Google Drive
**Q10.13 [P0] [SYSTEM: Email + Google Drive]** Bundled with Q1.24 + Q1.25 (source binding + tenant).

**Q10.14 [SYSTEM: Google Drive]** For Shared Drive, the service account must be EXPLICITLY added as a Shared Drive member (not just folder-shared). Confirm.
**Answer:** Inferred from rex.json Google Drive quirks — confirm with Brian Cook. Default: Shared Drive member with at least Viewer (or Editor if moving processed files).

---

## INTERNAL FLAGS — Technical risks (NOT for client send)

1. **HIGH** — UC2 + UC3 are P0-blocked on HD Portal write + document endpoint confirmation. Both flows go to fallback (outbound email / screen-scrape) or out of scope if HD does not expose them. Pricing is currently sized assuming both endpoints exist. Bundle the Q1.4 + Q1.7 questions into a single HD API support ticket via Greg — never burn two tickets where one suffices.
2. **HIGH** — ComputerEase production-only API + sole admin + CE Live Service installation pending → three blockers collectively put the first 2-week sprint at high schedule risk if Jean Jacobs has any unavailability. Backup admin designation (Q1.11) is mandatory before kickoff.
3. **HIGH** — Deltek (Q1.14) scope clarification is a P0 pricing dependency. If Deltek is a distinct product (Costpoint / Vantagepoint), a scope-change conversation is required before SOW signing. If overlap with ComputerEase, UC5 reduces to three-system validation. Pricing currently locked at 8 flows.
4. **HIGH** — UC8 source binding (Q1.24) — if BOTH Email AND Google Drive are confirmed sources, NO-COMBINE rule splits UC8 into two flows and the flow count moves from 8 to 9. A revised proposal with locked pricing must be issued before SOW signing if this triggers.
5. **MEDIUM** — UC1 trigger is scheduled-sync (poll), NOT real-time event-driven — HD Portal has not confirmed webhook availability. Architect must size accordingly. Floor latency is the 10-min HD propagation lag.
6. **MEDIUM** — UC4 job-number reservation: if CE does NOT expose an atomic next-number endpoint (Q1.12), MuleSoft owns the counter in Object Store with per-department-key locking. Counter must be department-scoped + sales-rep-aware. Architect decision documented during M1.
7. **MEDIUM** — UC7 right-of-rescission needs federal-holiday calendar (Mule has no built-in). Use DataWeave business-day function with hardcoded federal holiday list (refresh annually) OR call a holiday API. State-specific holidays (e.g. Lincoln's Birthday in IL) need explicit confirmation from Peerless legal/compliance.
8. **MEDIUM** — UC8 IDP confidence threshold defaults (overall ≥ 85%, critical ≥ 80%) need critical-field list defined per document class during IDP Workshop. Without this, single-threshold falls back and has known misfire pattern (FK-040).
9. **MEDIUM** — GCP firewall SSH/RDP open-to-internet was found at onboarding (Raghuram observation). Must be locked down before production cutover. NOT a Mule integration blocker but a delivery-quality gate item.
10. **MEDIUM** — Credential handoff via confidential email (clipboard-blocked) is a real operational pattern in this engagement — Marius shared HD Portal API credentials this way Apr 15. Build secrets-manager handoff into delivery plan (NOT AI OCR — hallucination risk per FK-030).
11. **MEDIUM** — Existing Salesforce integration was originally built by "Amarius" (HD-side dev) — provided HD Portal lead-pull API call in the original build. DataSkate is replacing/extending, NOT building greenfield. Confirm what exists today before re-implementing UC1 to avoid double-build.
12. **LOW** — DocHub (Q2.13) is currently a manual step. Public REST API exists at dochub.com/api. Flag for Phase 2 if Peerless wants the 118-form generation step automated.

---

## PRICING SUMMARY (Internal — Do Not Send to Client)

*(From flo.json — NOT recalculated here. See `projects/peerless-dailysync/run/flo.json` `pricing` block for source.)*

| Item | Value |
|---|---|
| Engagement model | **IaaS — DataSkate Managed Service** (recommended) |
| Confirmed Phase 1 flows | 8 (UC1–UC8) |
| Kickoff retainer (IaaS) | $5,000 (non-refundable; credited against first 6-month payment at go-live) |
| Implementation fee (IaaS) | $0 |
| Implementation-Only alternative | $28,000 (8 flows × $3,500; offered as comparison only — NOT recommended) |
| Period 1 IaaS rate (months 1–6) | $300/flow/mo × 8 = $2,400/mo → $14,400 per 6-month payment |
| Period 2 IaaS rate (months 7–12) | $315/flow/mo × 8 = $2,520/mo → $15,120 per 6-month payment |
| Period 3 IaaS rate (months 13–18) | $330.75/flow/mo × 8 → $15,876 per 6-month payment |
| Period 4 IaaS rate (months 19–24) | $347.29/flow/mo × 8 → $16,670 per 6-month payment |
| **One-year IaaS total** | **$29,520** |
| **Two-year IaaS total** | **$62,066** |
| Delivery timeline | 14 weeks (catalog formula: 2 weeks Requirements + 1.5 weeks × 8 flows) |
| Recommendation rationale | High-complexity engagement (5/8 flows HIGH); production-only CE API; no in-house MuleSoft developer; $5K hosting savings + Ashley's daily reconciliation hour are the value anchors. |
| Proposal caveat | Two open scope items can change flow count: (a) UC8 source binding → if BOTH Email AND Google Drive, NO-COMBINE splits UC8 to 2 flows (count goes from 8 to 9); (b) Deltek separate-product confirmation → if distinct, scope-change discussion required. Both will be resolved at intake; a revised proposal with locked pricing is issued before SOW signing if either condition changes. |

---
*End of questionnaire. Quinn-generated 2026-05-20 from sage/vera/rex/ivy/flo upstream agents. Do not manually edit — re-run Quinn via `node DSPipeline/scout/orchestrate.js --client peerless-dailysync` if changes are needed.*
