# Homage × DataSkate — Integration Discovery Questionnaire
**Date:** 2026-05-19 | **Source:** NewClient.txt (Scout Stage 1)
**Architect:** Kailash Chanda · kailash@dataskate.ai · DataSkate

---

**How to complete this form:**
Most answers are already filled in based on your briefing document and DataSkate's platform research. Where you see a pre-filled answer, simply confirm it is correct or make corrections. Blank answer lines are items we genuinely need from you. Items marked **⚠️ CRITICAL** affect development directly — please review these carefully.

---

## SECTION 1: USE CASES & INTEGRATION FLOWS

### UC1a — Shopify Order → NetSuite Cash Sale
*Shopify Plus → NetSuite | DTC / immediately paid orders | Trigger: orders/create + orders/paid webhook*

**Q-UC1a-1. ⚠️ CRITICAL — Order routing logic (Cash Sale vs. Sales Order)**
What determines whether an order becomes a Cash Sale (UC1a) vs. a Sales Order (UC1b)?

Pre-filled: `payment_status = "paid" AND customer is DTC (not tagged B2B) → Cash Sale; wholesale / net-terms / B2B accounts → Sales Order`
This routing logic currently lives in a Celigo pre-map JavaScript hook managed by Sikich.

Confirm: ☐ Correct  ☐ Correct it:
Answer: ___

**Q-UC1a-2.** Any Shopify tags, custom fields, or order attributes (e.g., order_type metafield, B2B customer tag) that affect NetSuite routing?

Pre-filled: `Unknown — likely a Shopify customer tag or order tag (e.g., "wholesale"). Sikich will know.`
Answer: ___

**Q-UC1a-3.** Which NetSuite subsidiary do these orders map to?

Pre-filled: `Single subsidiary — no OneWorld (assumed). Confirm, or provide subsidiary internalId if OneWorld is active.`
Answer: ___

**Scope Boundary for this flow:**
✅ IN SCOPE: Receive Shopify webhook → classify by payment/customer type → create NetSuite Cash Sale with line items, tax, and payment info
⚠️ ASSUMED PRE-EXISTS: NetSuite Cash Sale record type active; item internalId cross-reference table available; Shopify Custom App credentialed with orders webhook
❌ OUT OF SCOPE: NetSuite SuiteScript development; Chart of Accounts config; Shopify storefront changes

→ See Section 3.2 for pre-filled order field mapping.

---

### UC1b — Shopify Order → NetSuite Sales Order
*Shopify Plus → NetSuite | B2B / net-terms / wholesale orders | Trigger: orders/create + orders/paid webhook*

**Q-UC1b-1.** Which NetSuite payment terms apply to B2B/wholesale orders?

Pre-filled: `NET30 — driven by the customer's Terms field in NetSuite. Confirm or list actual terms codes used (e.g., NET30, NET60, NET45).`
Answer: ___

**Q-UC1b-2.** Do B2B orders use a different NetSuite department, class, or location than DTC orders?

Pre-filled: `Unknown — confirm. If yes, provide the NetSuite department/class/location internalId for wholesale.`
Answer: ___

**Scope Boundary for this flow:**
✅ IN SCOPE: Same webhook trigger as UC1a — opposite routing branch → create NetSuite Sales Order for wholesale/B2B orders
⚠️ ASSUMED PRE-EXISTS: NetSuite Sales Order record type active; B2B customer records pre-existing in NetSuite with correct payment terms
❌ OUT OF SCOPE: NetSuite ERP terms setup; Chart of Accounts changes

→ See Section 3.2 for pre-filled order field mapping.

---

### UC2a — Shopify Refund → NetSuite Credit Memo / Customer Refund
*Shopify Plus → NetSuite | Refunds | Trigger: refunds/create webhook*

**Q-UC2a-1. ⚠️ CRITICAL — Refund routing: Credit Memo vs. Customer Refund**

Pre-filled: `Partial refund → NetSuite Credit Memo; Full refund → NetSuite Customer Refund. Celigo likely handles this via refund.transactions[].kind. Confirm this rule is correct.`

Confirm: ☐ Correct  ☐ Correct it:
Answer: ___

**Q-UC2a-2.** How is the original NetSuite Cash Sale / Sales Order referenced from a Shopify refund?

Pre-filled: `Shopify order.id stored as externalId on the NetSuite Cash Sale/SO → lookup by externalId to get NS internalId. This is standard Celigo SIA pattern.`

Confirm: ☐ Correct  ☐ Correct it:
Answer: ___

**Scope Boundary for this flow:**
✅ IN SCOPE: Receive Shopify refund webhook → determine type → create NetSuite Credit Memo or Customer Refund
⚠️ ASSUMED PRE-EXISTS: Original NetSuite order record exists with Shopify order.id as externalId
❌ OUT OF SCOPE: Shopify refund policy setup; manual NetSuite adjustments; Loop Returns direct integration (separate potential flow)

→ See Section 3.3 for pre-filled returns field mapping.

---

### UC2b — NetSuite Return Authorization → Shopify Refund
*NetSuite → Shopify Plus | Return Authorization → Shopify refund | Trigger: NetSuite RA created/approved*

**Q-UC2b-1.** When should a Shopify refund be triggered from a NetSuite Return Authorization?

Pre-filled: `After RA is approved (status = Approved), not on creation. Confirm this matches Celigo's current behavior.`
Answer: ___

**Q-UC2b-2. ⚠️ CRITICAL — Celigo detection mechanism for NetSuite Return Authorizations**
How does Celigo currently detect a new/approved Return Authorization in NetSuite — SuiteScript webhook, polling, or SuiteAnalytics?

Pre-filled: `Likely SuiteQL polling (scheduled) — Celigo SIA standard pattern for NetSuite → Shopify flows. Sikich will confirm the exact mechanism.`
Answer: ___

**Scope Boundary for this flow:**
✅ IN SCOPE: Detect NetSuite RA approved → trigger Shopify refund for the matched order
⚠️ ASSUMED PRE-EXISTS: Shopify order ID stored on NetSuite transaction record as externalId; Loop Returns events handled by Shopify if applicable
❌ OUT OF SCOPE: NetSuite return merchandise workflow; Loop Returns configuration

→ See Section 3.3 for pre-filled returns field mapping.

---

### UC3a — NetSuite Item Fulfillment → Shopify Fulfillment Update
*NetSuite → Shopify Plus | Fulfillments | Trigger: NetSuite item fulfillment record created*

**Q-UC3a-1. ⚠️ CRITICAL — Celigo detection mechanism for NetSuite Item Fulfillments**
How does Celigo currently detect a new fulfillment record in NetSuite (SuiteScript, SuiteQL polling, or custom webhook)?

Pre-filled: `SuiteQL scheduled polling — standard Celigo SIA pattern for NetSuite outbound events. Sikich to confirm.`
Answer: ___

**Q-UC3a-2.** Does Homage ship from multiple NetSuite locations, and are tracking numbers per-location or consolidated?

Pre-filled: `Single shipping location assumed. Confirm or describe your warehouse/3PL setup.`
Answer: ___

**Scope Boundary for this flow:**
✅ IN SCOPE: Detect new NetSuite Item Fulfillment → write fulfillment record + tracking number to Shopify order
⚠️ ASSUMED PRE-EXISTS: Shopify order ID stored as externalId on NetSuite SO; item fulfillment created by Homage warehouse or 3PL
❌ OUT OF SCOPE: 3PL WMS integration; carrier selection; ShipStation integration (separate potential scope item)

→ See Section 3.4 for pre-filled fulfillment field mapping.

---

### UC3b — Shopify Fulfillment Event → NetSuite Order Status Update
*Shopify Plus → NetSuite | Fulfillment status | Trigger: fulfillments/create or fulfillments/update webhook*

**Q-UC3b-1.** When a Shopify fulfillment event fires, which NetSuite field is updated?

Pre-filled: `NetSuite Sales Order status field updated to "Partially Fulfilled" or "Fully Fulfilled" based on Shopify fulfillment completion. Confirm.`
Answer: ___

**Scope Boundary for this flow:**
✅ IN SCOPE: Receive Shopify fulfillment webhook → update NetSuite Sales Order status / fulfillment field
⚠️ ASSUMED PRE-EXISTS: NetSuite SO exists with Shopify order ID as externalId
❌ OUT OF SCOPE: Carrier API calls; customer email notifications (Shopify handles natively)

---

### UC4 — Inventory Sync (Scheduled + CSWOS Logic)
*NetSuite → Shopify Plus | Inventory levels | Trigger: Scheduled*

**Q-UC4-1.** What schedule should inventory sync run on?

Pre-filled: `Every 15 minutes (standard for Shopify Plus DTC brands). Confirm or specify preferred interval.`
Answer: ___

**Q-UC4-2. ⚠️ CRITICAL — CSWOS threshold rules**
Describe the CSWOS (Continue Selling While Out of Stock) rule in plain terms.

Pre-filled: `Set variant inventory_policy = 'continue' when NetSuite quantityOnHand drops below [THRESHOLD]. Set back to 'deny' when quantityOnHand rises above [RESTORE_THRESHOLD]. The threshold may differ by product line.`

⚠️ PLEASE FILL IN: What is the exact threshold value (e.g., "continue when qty ≤ 0; deny when qty > 5")?
Answer: ___

**Q-UC4-3. ⚠️ CRITICAL — Shopify variant ID ↔ NetSuite item internalId cross-reference table**

Pre-filled: `This table must be provided by Sikich before UC4 and UC5 development begins. Celigo uses it internally and Sikich should be able to export it. We will request it in our setup call.`

Confirm: ☐ Sikich can provide this  ☐ We will create it together  ☐ Other:
Answer: ___

**Scope Boundary for this flow:**
✅ IN SCOPE: Scheduled NetSuite inventory pull → apply CSWOS threshold per SKU → update Shopify inventory_level and inventory_policy per variant
⚠️ ASSUMED PRE-EXISTS: Shopify variant ↔ NetSuite item cross-reference table; NetSuite inventory locations configured
❌ OUT OF SCOPE: Physical inventory adjustments; 3PL inventory feeds; Toolio integration (separate potential scope)

→ See Section 3.5 for pre-filled inventory field mapping.

---

### UC5a — NetSuite Matrix Item → Shopify Product + Variants
*NetSuite → Shopify Plus | Products / variants (matrix items) | Trigger: Scheduled*

**Q-UC5a-1.** What schedule does Celigo run for product sync today, and what lag is acceptable?

Pre-filled: `Estimated: every 30–60 minutes (standard for catalog sync). Confirm current Celigo schedule.`
Answer: ___

**Q-UC5a-2.** What is the maximum number of variants on a single matrix item in your NetSuite catalog?

Pre-filled: `Unknown — Shopify GraphQL supports up to 2,048 variants. Please confirm your highest variant count to ensure no limit is exceeded.`
Answer: ___

**Q-UC5a-3. ⚠️ CRITICAL — Shopify metafield namespace + key definitions**

Pre-filled: `Estimated namespace = 'netsuite'. Estimated keys: matrix_parent_id, price_tier, [others unknown]. Metafield definitions MUST be created in Shopify Admin before this flow goes live — missing definitions cause silent failures.`

⚠️ PLEASE FILL IN: List all metafield namespace/key combinations Celigo writes today:
Answer: ___

**Scope Boundary for this flow:**
✅ IN SCOPE: Scheduled NetSuite matrix item (parent + children) → create/update Shopify product + variants + metafields via GraphQL Admin API
⚠️ ASSUMED PRE-EXISTS: Shopify metafield definitions created; Shopify variant ↔ NetSuite item cross-reference table; GraphQL API scoped on Custom App
❌ OUT OF SCOPE: Shopify product page/collection design; theme customization; Shopify app development

→ See Section 3.6 for pre-filled product field mapping.

---

### UC5b — NetSuite Price → Shopify Product Price
*NetSuite → Shopify Plus | Product pricing | Trigger: Scheduled (same run as UC5a)*

**Q-UC5b-1.** Which NetSuite price levels sync to Shopify?

Pre-filled: `Base Price → Shopify variant.price; Compare-At Price (retail/MSRP) → variant.compare_at_price. Confirm, or list additional price levels (e.g., wholesale, VIP).`
Answer: ___

**Scope Boundary for this flow:**
✅ IN SCOPE: NetSuite PricingMatrix → Shopify variant.price and compare_at_price fields
⚠️ ASSUMED PRE-EXISTS: NetSuite price levels configured per item; Shopify variant exists (created by UC5a)
❌ OUT OF SCOPE: Shopify B2B price lists; promotional discount codes

---

### UC5c — NetSuite Tax Code → Shopify Product Tax
*NetSuite → Shopify Plus | Product tax settings | Trigger: Scheduled (same run as UC5a)*

**Q-UC5c-1.** Which NetSuite tax schedule should set the Shopify taxable flag?

Pre-filled: `Items with a taxable NetSuite tax schedule → Shopify variant.taxable = true; items with non-taxable / exempt schedule → taxable = false. Confirm.`
Answer: ___

**Scope Boundary for this flow:**
✅ IN SCOPE: NetSuite item tax schedule → Shopify variant.taxable boolean
⚠️ ASSUMED PRE-EXISTS: NetSuite tax codes configured; Shopify tax zones configured natively
❌ OUT OF SCOPE: Tax nexus setup; Avalara/Shopify Tax configuration; Chart of Accounts changes

---

### UC6 — Shopify Product Image URL → NetSuite Item
*Shopify Plus → NetSuite | Product image URLs | Trigger: products/update webhook*

**Q-UC6-1. ⚠️ CRITICAL — NetSuite custom field name for image URL**

Pre-filled: `Estimated: custbody_shopify_image_url (custom body field on Item record). Confirm the exact field name — Sikich will have it.`
Answer: ___

**Scope Boundary for this flow:**
✅ IN SCOPE: Shopify products/update webhook (image URL change detected) → write image URL to NetSuite item record custom field
⚠️ ASSUMED PRE-EXISTS: NetSuite item custom field for image URL already exists; item ID cross-reference table available
❌ OUT OF SCOPE: Image CDN management; image resizing; Shopify product image creation

---

### UC7a — Shopify Customer Created → NetSuite Customer
*Shopify Plus → NetSuite | New customers | Trigger: customers/create webhook*

**Q-UC7a-1. ⚠️ CRITICAL — Customer deduplication strategy**

Pre-filled: `Lookup NetSuite customer by email. If found → update (not create). If not found → create new. This prevents duplicate records when a customer exists in both systems. Standard Celigo SIA pattern.`

Confirm: ☐ Correct  ☐ Correct it:
Answer: ___

**Q-UC7a-2.** What NetSuite fields are required when creating a new customer (beyond name, email, phone, address)?

Pre-filled: `Subsidiary (required on all NS records); Terms (payment terms — default "Net 30" for new customers); isPerson = true for DTC customers; Type = "Customer". Confirm or add missing required fields.`
Answer: ___

**Scope Boundary for this flow:**
✅ IN SCOPE: Shopify customers/create webhook → lookup NetSuite by email → create NetSuite customer if new
⚠️ ASSUMED PRE-EXISTS: NetSuite subsidiary and default terms configured; Shopify Custom App credentialed
❌ OUT OF SCOPE: B2B account hierarchy management; NetSuite credit limit setup

→ See Section 3.7 for pre-filled customer field mapping.

---

### UC7b — Shopify Customer Updated → NetSuite Customer
*Shopify Plus → NetSuite | Customer updates | Trigger: customers/update webhook*

**Q-UC7b-1.** Which customer fields should propagate from Shopify → NetSuite on update?

Pre-filled: `All core fields: name, email, phone, shipping/billing address. Optionally: customer tags (if used for B2B flag). Confirm or add exclusions.`
Answer: ___

**Scope Boundary for this flow:**
✅ IN SCOPE: Shopify customers/update webhook → lookup NetSuite customer by Shopify ID externalId → update matched fields
⚠️ ASSUMED PRE-EXISTS: Shopify customer ID stored on NetSuite customer record as externalId
❌ OUT OF SCOPE: NetSuite credit management; payment terms changes

---

### UC7c — NetSuite Customer → Shopify Customer
*NetSuite → Shopify Plus | Customer updates | Trigger: NetSuite customer record modified*

**Q-UC7c-1. ⚠️ CRITICAL — Master record system for customer data**

Pre-filled: `Shopify = master for DTC consumer accounts (email, address, phone updates come from storefront). NetSuite = master for B2B/wholesale accounts (terms, credit, billing details come from ERP). When both fire, the master system wins.`

Confirm: ☐ Correct  ☐ Correct it:
Answer: ___

**Q-UC7c-2. ⚠️ CRITICAL — Loop prevention mechanism**

Pre-filled: `Celigo uses a "last modified by" flag or custom boolean field (e.g., custentity_updated_by_mulesoft) to prevent the NetSuite update from firing the Shopify→NetSuite webhook again. Sikich will know the exact mechanism.`

Confirm or describe how loop prevention works today:
Answer: ___

**Scope Boundary for this flow:**
✅ IN SCOPE: NetSuite customer modification → update Shopify customer record, with loop-prevention logic
⚠️ ASSUMED PRE-EXISTS: Loop-prevention mechanism designed before development; master-system decision above confirmed
❌ OUT OF SCOPE: Shopify account type changes; customer group management

→ See Section 3.7 for pre-filled customer field mapping.

---

### UC8 — Shopify Payment → NetSuite Customer Deposit
*Shopify Plus → NetSuite | Payment transactions → Customer deposits | Trigger: orders/paid webhook*

**Q-UC8-1. ⚠️ CRITICAL — Payment gateway → NetSuite account mapping**

Pre-filled: `Each Shopify payment gateway maps to a NetSuite bank account / payment method. Below is our best guess — PLEASE CORRECT with your actual NetSuite account internalIds:`

| Shopify Gateway | Estimated NetSuite Payment Method | NetSuite Bank Account | Confirm? |
|---|---|---|---|
| shopify_payments | Shopify Payments | [clearing account TBD] | ☐ |
| afterpay | Afterpay Clearing | [clearing account TBD] | ☐ |
| paypal | PayPal | [clearing account TBD] | ☐ |
| gift_card | Gift Card Liability | [liability account TBD] | ☐ |
| Other: ___ | ___ | ___ | |

Answer (corrections / additions): ___

**Q-UC8-2.** Should the Customer Deposit be created immediately when payment fires, or only after the Sales Order / Cash Sale is confirmed created?

Pre-filled: `After SO/Cash Sale is confirmed created — the deposit must link to an existing NetSuite transaction. A short wait (poll for SO existence) or event-chaining is standard.`

Confirm: ☐ Correct  ☐ Different sequencing needed:
Answer: ___

**Scope Boundary for this flow:**
✅ IN SCOPE: Shopify orders/paid → create NetSuite Customer Deposit against the corresponding SO/Cash Sale
⚠️ ASSUMED PRE-EXISTS: NetSuite SO/Cash Sale created by UC1 (dependent flow); payment method → NetSuite account mapping confirmed above
❌ OUT OF SCOPE: NetSuite bank reconciliation; Shopify Payments configuration; Chart of Accounts changes

→ See Section 3.8 for pre-filled billing field mapping.

---

### UC9 — NetSuite Sales Order → Invoice Trigger
*NetSuite → NetSuite (internal) | Sales Orders / Invoices | Trigger: SO reaches billing-eligible status*

**⚠️ ARCHITECT REVIEW FLAG (DataSkate internal):**
*NetSuite invoices are system-generated — MuleSoft cannot POST to create invoices directly. Kailash must confirm the Celigo mechanism with Sikich before this flow is designed. It may be a status update only, or may descope as fully NetSuite-internal.*

**Q-UC9-1. ⚠️ CRITICAL — Celigo's exact mechanism for "NetSuite SO → Invoice"**
Does Celigo trigger a NetSuite SuiteScript billing workflow, update an SO status field, or do something else to initiate invoice generation?

Pre-filled: `Most likely: Celigo updates the SO status to a billing-eligible value → NetSuite's internal billing workflow generates the invoice. MuleSoft would replicate only the status update — not invoice creation.`
Answer: ___

**Q-UC9-2.** If this turns out to be a purely internal NetSuite SuiteScript process, would you like to descope UC9 from MuleSoft (keep it as-is in NetSuite) and reduce the flow count accordingly?

Pre-filled: `DataSkate recommendation: yes — if NetSuite handles it natively, don't add MuleSoft in the middle. This reduces complexity and cost.`

Answer: ___

---

### UC10 — Shopify Store Metadata → NetSuite Custom Records
*Shopify Plus → NetSuite | Store metadata → NetSuite custom records | Trigger: Shopify event*

**Q-UC10-1. ⚠️ CRITICAL — NetSuite custom record type ID and field names**
What is the NetSuite custom record type internal ID, and what are the custom field names (custrecord_*) that this flow writes to?

Pre-filled: `Unknown — Sikich must provide the custom record type ID and complete field list. We will request this in the same Sikich call as TBA credentials.`

⚠️ PLEASE FILL IN (or confirm Sikich will provide):
Answer: ___

**Q-UC10-2.** What Shopify event triggers this flow (specific webhook topic, scheduled, or manual)?

Pre-filled: `Unknown from briefing — confirm the trigger type.`
Answer: ___

**Scope Boundary for this flow:**
✅ IN SCOPE: Shopify event detected → create/update NetSuite custom record with store metadata
⚠️ ASSUMED PRE-EXISTS: NetSuite custom record type already exists and Sikich has provided type ID + field names
❌ OUT OF SCOPE: Custom record type creation; Shopify store admin configuration

---

### UC-CUSTOM-1 through UC-CUSTOM-5 — Uncharacterized Custom Flows

⚠️ **P0 BLOCKER: DataSkate needs the Celigo flow inventory spreadsheet to characterize and price these 5 flows.**

The briefing states ~23 flows total. DataSkate has named 17 flows from the briefing + domain knowledge. The remaining 5 slots correspond to the 3 custom Celigo integrations beyond the Standard Integration App. Once we receive the spreadsheet, we will name each flow and confirm pricing within 2–3 business days.

**Action for Homage:** Please request this spreadsheet from Sikich (your Celigo account manager). They manage it day-to-day and should have it immediately available. Bundle this request with the NetSuite TBA credentials call.

---

### Potential Flows — Identified Expansion Scope (Not Priced in This Proposal)

| ID | Flow | Priority | What We Need to Confirm |
|---|---|---|---|
| UC11 | EDI (Orderful) ↔ NetSuite | High | Is Orderful ↔ NetSuite in scope for this engagement? |
| UC12 | ShipStation — Turbine Replacement | High | Is Turbine replacement in scope? Can Sikich document Turbine's logic? |
| UC14 | ShipStation Tracking → NetSuite + Shopify | High | Confirmed with UC12 |
| UC15 | Loop Returns → NetSuite (if Loop doesn't fire Shopify webhook) | Medium | Do Loop return events surface as Shopify refund webhooks (UC2 covers it) or need a direct Loop API call? |
| UC16–18 | Orderful EDI split flows (850/856/810 individually) | High | Confirmed with UC11 |

---

## SECTION 2: SYSTEMS AND ACCESS

**Q-2-1.** Systems involved — name, vendor, version/edition

Pre-filled:
- NetSuite ERP — Oracle/NetSuite, edition unknown. **⚠️ CRITICAL: Confirm single-subsidiary or OneWorld (multi-subsidiary)**
- Shopify Plus — Shopify Inc., cloud SaaS
- Orderful — Orderful Inc., cloud EDI gateway (potential scope)
- ShipStation — ShipStation / Auctane, cloud shipping (potential scope)
- Laravel + Vapor API Gateway — custom internal (Homage engineering team, hosted on AWS)

Corrections / additions: ___

**Q-2-2.** Cloud, on-premise, or hybrid per system?

Pre-filled: `All cloud — NetSuite SaaS, Shopify SaaS, Laravel/Vapor on AWS (cloud). Confirm.`
Answer: ___

**Q-2-3.** API documentation + sandbox availability per system?

Pre-filled:
- NetSuite: SuiteTalk SOAP documented; sandbox available via Sikich
- Shopify Plus: developer.shopify.com; Shopify development store available
- ShipStation: REST API documented; **⚠️ NO SANDBOX — testing against production account**
- Orderful: REST API; sandbox likely available (confirm)

Corrections: ___

**Q-2-4.** Existing middleware / ESB?

Pre-filled: `Celigo — managed by Sikich (being replaced). Turbine — custom in-house middleware between NetSuite and ShipStation (potential replacement scope).`

Confirm: ☐ Correct  ☐ Other middleware:
Answer: ___

**Q-2-5.** Existing Anypoint Platform subscription?

Pre-filled: `None (new subscription — DataSkate will provision as part of onboarding).`

Confirm: ☐ Correct  ☐ We already have Anypoint:
Answer: ___

**Q-2-6.** Existing Anypoint Exchange assets to reuse?

Pre-filled: `None expected for a new subscription. Confirm.`
Answer: ___

---

## SECTION 3: DATA AND FIELD MAPPING

### 3.1 — External ID Cross-Reference (Idempotency Keys)

These identifiers link records across systems and prevent duplicate creation on message retry.

| Entity | Shopify Field | NetSuite Field | Status |
|---|---|---|---|
| Order | order.id (integer) | externalId on Cash Sale / SO | Confirm |
| Customer | customer.id | externalId on Customer | Confirm |
| Product/Variant | variant.id | (cross-ref table required — P0) | ⚠️ Needs cross-ref table |
| Fulfillment | fulfillment.id | externalId on Item Fulfillment | Confirm |
| Return / Refund | refund.id | externalId on Credit Memo / Customer Refund | Confirm |
| Payment | transaction.id | externalId on Customer Deposit | Confirm |

**Q-3-1-1. ⚠️ CRITICAL — Are there additional cross-reference keys Celigo uses today?**

Pre-filled: `Celigo SIA standard uses Shopify IDs as NetSuite externalIds across all entities. Any exceptions or additions?`
Answer: ___

**Q-3-1-2.** Format for the Shopify variant ID ↔ NetSuite item internalId cross-reference table?

Pre-filled: `Sikich likely has this as a spreadsheet or database export from Celigo. Request: CSV with columns: shopify_variant_id, netsuite_item_internal_id, sku.`
Answer: ___

---

### 3.2 — UC1 Order Field Mapping (Shopify → NetSuite Cash Sale / Sales Order)

Pre-filled from canonical order model + Shopify + NetSuite playbook knowledge:

| Canonical Field | Shopify Source | NetSuite Target | Confidence | Notes |
|---|---|---|---|---|
| orderId (externalId) | order.id | externalId | High | Shopify integer → NS externalId string |
| orderNumber | order.name (#1234) | tranId | High | Shopify order name → NS transaction number |
| customerId | order.customer.id | entity via externalId lookup | High | |
| status | order.financial_status | status | High | paid→APPROVED; pending→PENDING_APPROVAL |
| totals.subtotal | order.subtotal_price | subtotal | High | |
| totals.discount | order.total_discounts | discountTotal | High | |
| totals.tax | order.total_tax | taxTotal | High | |
| totals.shipping | order.shipping_lines[0].price | shippingCost | High | |
| totals.total | order.total_price | total | High | |
| lines[].sku | line_item.sku | item.internalId via cross-ref | High | Requires cross-ref table (P0) |
| lines[].quantity | line_item.quantity | quantity | High | |
| lines[].unitPrice | line_item.price | rate | High | |
| lines[].taxAmount | line_item.tax_lines[].price | taxAmount | High | |
| fulfillment.shippingAddress | order.shipping_address | shipAddress | High | |
| billing.billingAddress | order.billing_address | billAddress | High | |
| timestamps.createdAt | order.created_at | tranDate | High | |

**Q-3-2-1. ⚠️ CRITICAL — Custom fields on NetSuite orders**

Pre-filled: `Celigo populates custom fields on NS orders (custbody_*). Examples: discount code, Shopify order tags, channel source. Sikich must provide the full list of custbody_ fields used.`
Answer: ___

**Q-3-2-2.** NetSuite department/class/location for orders — static or driven by order attributes?

Pre-filled: `Static (single department/class) for most DTC brands. Confirm or provide the internalId if assignment is needed.`
Answer: ___

---

### 3.3 — UC2 Returns / Refund Field Mapping (Shopify ↔ NetSuite)

| Canonical Field | Source Field | Target Field | Direction |
|---|---|---|---|
| refundId (externalId) | Shopify refund.id | externalId on Credit Memo | Shopify→NS |
| originalOrderRef | Shopify order.id | appliedToTransaction (NS) | Shopify→NS |
| refundLines[].sku | line_item.sku | item via cross-ref | Shopify→NS |
| refundLines[].quantity | line_item.quantity | quantity | Shopify→NS |
| refundLines[].amount | line_item.subtotal | amount | Shopify→NS |
| refundTotal | refund.transactions[].amount | total | Shopify→NS |
| returnAuthId | NS returnAuthorization.id | Shopify order lookup key | NS→Shopify |
| refundAmount | NS returnAuthorization.total | Shopify refund amount | NS→Shopify |

**Q-3-3-1.** For UC2b (NS RA → Shopify): what Shopify refund `reason` code should be set?

Pre-filled: `"other" (Shopify default for system-initiated refunds). Confirm or specify: "restock", "customer", "fraud", "other".`
Answer: ___

---

### 3.4 — UC3 Fulfillment Field Mapping (NetSuite ↔ Shopify)

| Canonical Field | Source Field | Target Field | Direction |
|---|---|---|---|
| fulfillmentId (externalId) | NS itemFulfillment.id | Shopify fulfillment.id | NS→Shopify |
| trackingNumber | NS package[].trackingNumber | fulfillment.tracking_number | NS→Shopify |
| carrierCode | NS shipMethod | fulfillment.tracking_company | NS→Shopify |
| fulfillmentDate | NS tranDate | fulfillment.created_at | NS→Shopify |
| orderRef | Shopify order.id (from NS SO externalId) | fulfillment.order_id | NS→Shopify |

**Q-3-4-1. ⚠️ CRITICAL — NetSuite carrier code → Shopify carrier name mapping**

Pre-filled: `NetSuite uses carrier names like "FedEx", "UPS", "USPS". Shopify requires specific strings. Standard mapping: NetSuite "FedEx" → Shopify "FedEx"; "UPS" → "UPS"; "USPS" → "USPS". Confirm your carrier list and whether the names match Shopify's expected format.`
Answer: ___

---

### 3.5 — UC4 Inventory Field Mapping (NetSuite → Shopify)

| Canonical Field | NetSuite Source | Shopify Target | Notes |
|---|---|---|---|
| itemId | item.internalId | via cross-ref → variant.id | Cross-ref table required (P0) |
| quantityOnHand | inventoryItem.quantityOnHand | inventory_level.available | Primary quantity |
| locationId | inventoryItem.location | Shopify location (if multi-location) | Confirm single vs. multi-location |
| inventoryPolicy | (CSWOS logic — computed) | variant.inventory_policy | 'continue' or 'deny' |

**Q-3-5-1.** Does Homage use Shopify's multi-location inventory?

Pre-filled: `Single Shopify location assumed (standard for DTC brands without multi-warehouse Shopify setup). Confirm, or specify how many Shopify locations.`
Answer: ___

---

### 3.6 — UC5 Product Field Mapping (NetSuite Matrix Item → Shopify Product + Variants)

| Canonical Field | NetSuite Source | Shopify Target | Notes |
|---|---|---|---|
| productId | matrixItem.internalId | product externalId | Permanent cross-ref key |
| name | matrixItem.displayName | product.title | |
| description | matrixItem.description | product.body_html | May need HTML encoding |
| vendor | matrixItem.vendor | product.vendor | |
| productType | matrixItem.category | product.product_type | |
| isActive | matrixItem.isInactive | product.status (active/archived) | |
| variantSku | childItem.itemId | variant.sku | |
| weight | childItem.weight | variant.weight | Confirm unit: lb vs kg |
| barcode | childItem.upcCode | variant.barcode | |
| price | pricingMatrix[base] | variant.price | Via UC5b |
| compareAtPrice | pricingMatrix[msrp] | variant.compare_at_price | Via UC5b |
| taxable | taxSchedule.taxable | variant.taxable | Via UC5c |
| [metafield: confirm namespace/keys] | matrixItem fields | Shopify metafields | ⚠️ Must confirm all keys |

**Q-3-6-1. ⚠️ CRITICAL — Complete metafield namespace/key list**

Pre-filled: `Estimated: namespace='netsuite', keys: matrix_parent_id, price_tier, [others unknown]. MUST confirm before development — missing metafield definitions cause silent sync failures.`
Answer: ___

**Q-3-6-2.** Product variant options (size, color) — are these NetSuite matrix dimensions, and what are the dimension names?

Pre-filled: `Standard licensed apparel matrix: Size + Color (or Style). Confirm dimension names as they appear in your NetSuite matrix item setup.`
Answer: ___

---

### 3.7 — UC7 Customer Field Mapping (Shopify ↔ NetSuite)

| Canonical Field | Shopify Field | NetSuite Field | Direction |
|---|---|---|---|
| customerId (externalId) | customer.id | externalId | Both |
| firstName | customer.first_name | firstName | Both |
| lastName | customer.last_name | lastName | Both |
| email | customer.email | email (dedup key) | Both |
| phone | customer.phone | phone | Both |
| billingAddress | customer.default_address | defaultAddress | Both |
| type | customer.tags ("B2B"?) | isPerson / customerType | Both |
| paymentTerms | (NS only) | terms.internalId | NS→Shopify |

**Q-3-7-1. ⚠️ CRITICAL — How are B2B customers identified in Shopify?**

Pre-filled: `Estimated: Shopify customer tag "wholesale" or "b2b", OR Shopify Plus company account. Confirm which method Homage uses.`
Answer: ___

**Q-3-7-2.** Any additional customer fields Celigo syncs not in the table above?

Pre-filled: `Unknown — Sikich to confirm. Common extras: loyalty tier, credit limit, sales rep.`
Answer: ___

---

### 3.8 — UC8 Payment / Customer Deposit Field Mapping (Shopify → NetSuite)

| Canonical Field | Shopify Source | NetSuite Target | Notes |
|---|---|---|---|
| depositId (externalId) | order.transactions[].id | externalId on CustomerDeposit | |
| orderRef | order.id | sales_order.internalId | Link deposit to SO/Cash Sale |
| amount | transaction.amount | payment | |
| paymentMethod | transaction.gateway | paymentMethod.internalId | Gateway → NS payment method (see Q-UC8-1) |
| depositAccount | (mapped from gateway) | account.internalId | Bank/clearing account per gateway |
| timestamp | transaction.created_at | tranDate | |

---

## SECTION 4: VOLUME AND PERFORMANCE

**Q-4-1.** Transaction volume per flow — per day / peak day

Pre-filled: `Estimated for ~$30M ARV DTC brand: 500–2,000 orders/day standard; 3,000–8,000 orders/day peak (Black Friday, new license drops). Confirm or provide actuals.`
Answer: ___

**Q-4-2.** Peak load times?

Pre-filled: `Holiday season (Nov–Dec); major license drops (new NFL/NBA season, Star Wars launches); flash sales. Confirm or add specific dates/events.`
Answer: ___

**Q-4-3.** Max latency per flow type?

Pre-filled:
- Webhook flows (orders, customers, fulfillments, refunds): under 10 seconds
- Scheduled flows (inventory sync, product sync): async-ok (result delivered within one sync window)

Confirm: ☐ Correct  ☐ Adjust:
Answer: ___

**Q-4-4.** Uptime SLA required?

Pre-filled: `99.9% (three nines — standard for Celigo replacement tier; equivalent to ~8.7 hours downtime/year). Confirm.`
Answer: ___

**Q-4-5.** Active SKU count in NetSuite (for sizing inventory + product sync batch)?

Pre-filled: `Unknown — confirm total active SKU count. This determines batch run time and NetSuite API governance unit consumption.`
Answer: ___

**Q-4-6 [TRIGGERED BY: scheduled flows].** Resume from checkpoint or restart on sync failure?

Pre-filled: `Resume from checkpoint — prevents full re-scan and avoids NetSuite API governance overruns. Standard DataSkate approach.`

Confirm: ☐ Correct  ☐ Full restart preferred:
Answer: ___

---

## SECTION 5: SECURITY AND COMPLIANCE

**Q-5-1.** Authentication method per system?

Pre-filled (confirmed from DataSkate platform research):
- NetSuite: Token-Based Auth (TBA) — 5 credentials: accountId, consumerKey, consumerSecret, tokenId, tokenSecret. Provisioned by Sikich.
- Shopify Plus: Custom App permanent access token (Private Apps are deprecated)
- ShipStation: Basic auth — API Key:Secret (Base64 encoded)
- Orderful: API key (Bearer token in Authorization header)
- Laravel API Gateway: ⚠️ Unknown — confirm auth method

Corrections: ___

**Q-5-2.** PII transmitted?

Pre-filled: `Yes — UC7 customer sync transmits name, email, phone, address. Shopify Payments tokenizes card data — no raw card numbers transmitted.`

Confirm: ☐ Correct  ☐ Additional PII fields:
Answer: ___

**Q-5-3.** Regulatory compliance requirements?

Pre-filled: `CCPA likely applicable (California consumers). PCI-DSS Level covered by Shopify Payments tokenization. No HIPAA/SOX/GDPR indicated.`

Confirm: ☐ Correct  ☐ Additional requirements:
Answer: ___

**Q-5-4.** Data residency requirements?

Pre-filled: `US-only (standard for US DTC brand). Confirm.`
Answer: ___

---

## SECTION 6: ERROR HANDLING

**Q-6-1.** Target system unavailable — retry strategy?

Pre-filled: `Retry-then-DLQ. 3 retries with exponential backoff: 30s → 90s → 270s. After 3 failures → Dead Letter Queue for manual review. DataSkate standard.`

Confirm: ☐ Correct  ☐ Adjust:
Answer: ___

**Q-6-2.** Message retention in retry queue?

Pre-filled: `24 hours for standard events (orders, customers, fulfillments). 7 days for financial events (payments, deposits). DataSkate standard.`

Confirm: ☐ Correct  ☐ Adjust:
Answer: ___

**Q-6-3.** Failure notification — who to notify and via which channel?

Pre-filled: `DataSkate on-call engineer + Homage technical contact. Channel: email + Slack. Confirm Slack workspace / channel name and technical contact email.`

⚠️ PLEASE FILL IN: Slack channel and technical contact email:
Answer: ___

**Q-6-4.** Zero data-loss or best-effort?

Pre-filled: `Zero data-loss for financial flows (UC1 orders, UC8 payments, UC2 returns). Best-effort acceptable for non-critical flows (UC6 image URL sync, UC3b status writeback).`

Confirm: ☐ Correct  ☐ Adjust:
Answer: ___

**Q-6-5.** Idempotency required?

Pre-filled: `Yes — required on all webhook-triggered flows. Shopify webhooks can be duplicated. Celigo uses this today. DataSkate implements with Shopify order/customer ID as idempotency key.`

Confirm: ☐ Correct  ☐ Confirm it's not needed:
Answer: ___

**Q-6-6.** Rollback needed if a financial flow partially fails?

Pre-filled: `Yes for UC1+UC8 sequence: if UC8 (customer deposit) fails after UC1 (order) succeeds, the deposit should be retried (not rolled back — order is confirmed). If UC1 fails, no deposit should be created. DataSkate handles via event sequencing.`

Confirm: ☐ Correct  ☐ Different rollback needed:
Answer: ___

---

## SECTION 7: DEPLOYMENT AND DEVOPS

**Q-7-1.** Deployment model?

Pre-filled: `MuleSoft CloudHub 2.0 (standard cloud deployment, US East). No infrastructure to manage.`

Confirm: ☐ Correct  ☐ Different preference:
Answer: ___

**Q-7-2.** Environments needed?

Pre-filled: `Dev + UAT + Production (standard 3-environment setup).`

Confirm: ☐ Correct  ☐ Different:
Answer: ___

**Q-7-3.** Network / firewall restrictions for CloudHub 2.0 to reach NetSuite or Shopify?

Pre-filled: `None expected — both NetSuite (SaaS) and Shopify (SaaS) are publicly accessible. Confirm no VPN or IP whitelist requirements on your end.`
Answer: ___

**Q-7-4.** CI/CD tool preference?

Pre-filled: `GitHub Actions — aligned with Homage's existing GitHub-based engineering workflow on AWS/Vapor.`

Confirm: ☐ Correct  ☐ Different:
Answer: ___

**Q-7-5.** Secrets management?

Pre-filled: `AWS Secrets Manager — aligned with Homage's existing AWS infrastructure.`

Confirm: ☐ Correct  ☐ Different:
Answer: ___

**Q-7-6 [TRIGGERED BY: migrate/replace].** Migration approach — big bang or phased?

Pre-filled: `Phased migration strongly recommended: migrate flow groups in waves (e.g., inventory + products first, then orders + payments, then customers). Celigo and MuleSoft run in parallel per wave. Decommission Celigo per flow group after UAT passes.`

Confirm: ☐ Phased  ☐ Big bang (all at once)
Answer: ___

**Q-7-7 [TRIGGERED BY: migrate/replace].** Celigo license renewal date / hard decommission deadline?

Pre-filled: `Unknown — please confirm. If Celigo renewal is approaching, this may create a deadline that compresses our UAT window.`
Answer: ___

**Q-7-8 [TRIGGERED BY: migrate/replace].** Parallel run period — how to prevent duplicate NetSuite records during cutover?

Pre-filled: `DataSkate will configure MuleSoft idempotency keys (Shopify ID as externalId) so that even if both Celigo and MuleSoft process the same event, NetSuite will update the existing record rather than create a duplicate.`

Confirm: ☐ Correct  ☐ Different approach preferred:
Answer: ___

---

### Access Chain Table — Please Complete

| System | Admin Owner (Name + Email) | API User Creator | Backup Admin | Vendor Support Login | Service Account Policy | Sandbox Available? |
|---|---|---|---|---|---|---|
| NetSuite | Sikich account manager — name: ___ email: ___ | Sikich | ___ | Sikich | Dedicated service account (DataSkate creates) | Yes — via Sikich |
| Shopify Plus | ___ | Homage dev team | ___ | ___ | Custom App (permanent token) | Yes — dev store |
| Orderful | ___ | ___ | ___ | ___ | API key | Confirm |
| ShipStation | ___ | ___ | ___ | ___ | API Key:Secret | No — prod only |
| Laravel API Gateway | Homage engineering lead | Homage engineering | ___ | ___ | Internal auth (TBD) | Dev environment |

---

## SECTION 8: OPERATIONS AND SUPPORT

**Q-8-1.** Logging and monitoring tools at Homage today?

Pre-filled: `AWS CloudWatch (Homage uses AWS/Vapor stack) + likely Datadog or similar APM. Confirm monitoring stack.`
Answer: ___

**Q-8-2.** Who owns post-go-live support of the integration layer?

Pre-filled: `DataSkate (IaaS model — DataSkate monitors, maintains, and operates all 22+ flows). This replaces the current Sikich/Celigo support model.`

Confirm: ☐ IaaS (DataSkate owns)  ☐ Implementation-Only (Homage dev team takes over post go-live — requires dedicated MuleSoft resource internally)
Answer: ___

**Q-8-3.** Client-facing operations dashboard or audit trail required?

Pre-filled: `Not required at launch (DataSkate monitors internally via Anypoint Monitoring). Confirm, or request one.`
Answer: ___

---

## SECTION 9: TESTING AND GO-LIVE

**Q-9-1.** Test environments available per system?

Pre-filled: `NetSuite sandbox: Yes (via Sikich). Shopify dev store: Yes. ShipStation: No (production only — test with dummy orders). Orderful: Likely yes (confirm).`

Corrections: ___

**Q-9-2.** Automated testing capability at Homage?

Pre-filled: `Unknown — confirm whether Homage has Postman collections, Newman scripts, or other API testing tools we can leverage for UAT.`
Answer: ___

**Q-9-3.** UAT acceptance criteria — what must be proven before go-live?

Pre-filled (DataSkate standard UAT criteria for Celigo migrations):
- ☐ 100% of UC1 order types (cash sale + SO routing) process correctly in UAT environment
- ☐ Inventory sync validated: NetSuite levels match Shopify for 48 hours without manual correction
- ☐ Product sync validated: 100 matrix items sync correctly including variants and metafields
- ☐ Zero duplicate NetSuite records across all entities during parallel run
- ☐ DLQ shows zero messages after 24 hours of test traffic
- ☐ All 22 flows pass MUnit test suite (≥80% coverage)

Add or remove criteria: ___

**Q-9-4.** Blackout periods — no deployments allowed during?

Pre-filled: `Holiday season (Nov 15 – Jan 5); major licensed-product drops (confirm dates); Fanatics/DSG/Rallyhouse EDI fulfillment windows (if EDI in scope).`

Confirm or add dates: ___

**Q-9-5.** Target go-live date?

Pre-filled: `TBD — confirm target. If driven by a Celigo contract renewal date, please share that date.`
Answer: ___

---

## SECTION 10: SYSTEM-SPECIFIC DETAILS

### 10.1 — NetSuite (Token-Based Auth — 5 Credentials via Sikich)

**Q-10-NS-1. ⚠️ CRITICAL — Single subsidiary or OneWorld (multi-subsidiary)?**

Pre-filled: `Single subsidiary assumed. If OneWorld is active, every NetSuite write requires subsidiary.internalId — a missing subsidiary causes all writes to fail.`

Confirm: ☐ Single subsidiary  ☐ OneWorld — subsidiary internalId: ___
Answer: ___

**Q-10-NS-2. ⚠️ CRITICAL — Custom record type ID + field names for UC10**

Pre-filled: `Unknown — Sikich must provide: (1) custom record type internalId, (2) complete list of custrecord_fieldname values. Request in the Sikich credentials call.`
Answer: ___

**Q-10-NS-3. ⚠️ CRITICAL — Custom body/line fields used in Celigo flows**

Pre-filled: `Celigo likely populates custbody_* fields on orders and custcol_* fields on line items. Sikich has the complete list. Example fields: custbody_shopify_order_id, custbody_channel, custbody_discount_code.`

⚠️ PLEASE FILL IN (or confirm Sikich will provide):
Answer: ___

---

### 10.2 — Shopify Plus (Custom App + GraphQL Admin API)

**Q-10-SH-1. ⚠️ CRITICAL — Custom App creation status**

Pre-filled: `Shopify Private Apps are deprecated. A Custom App must be created in Shopify Admin → Settings → Apps → Develop Apps. Required scopes: read/write orders, inventory, products, customers, fulfillments.`

Status: ☐ Already created — access token ready to share  ☐ Not yet created — DataSkate will walk you through it  ☐ Sikich will create it
Answer: ___

**Q-10-SH-2. ⚠️ CRITICAL — Metafield namespace + key definitions (must exist before UC5 go-live)**

Pre-filled: `Estimated namespace: 'netsuite'. Metafield definitions created in Shopify Admin → Settings → Custom data → Products. Missing definitions cause silent failures on sync.`

⚠️ PLEASE LIST all metafield namespace/key combinations Celigo writes today:
Answer: ___

**Q-10-SH-3.** Does Homage use Shopify B2B (company accounts + price lists)?

Pre-filled: `Not indicated in briefing — likely B2B is managed in NetSuite rather than Shopify Plus B2B features. Confirm.`
Answer: ___

---

### 10.3 — Orderful (Potential Scope Only)

**Q-10-OR-1.** Is Orderful ↔ NetSuite EDI in scope for this project?

Pre-filled: `Not currently in Celigo scope. DataSkate can add this — Orderful's REST API eliminates the need for an X12 EDI connector, making this simpler than traditional EDI.`

Answer: ☐ Yes, add it to scope  ☐ Not now (expansion scope later)  ☐ Already handled separately
Details: ___

**Q-10-OR-2.** If in scope: trading partners and transaction types?

Pre-filled: `Fanatics (850/856/810), Dick's Sporting Goods (850/856/810), Rallyhouse (850/856/810). Confirm or add/remove.`
Answer: ___

---

### 10.4 — ShipStation (Potential Scope — Turbine Replacement)

**Q-10-SS-1.** Is replacing Turbine (custom NetSuite ↔ ShipStation middleware) in scope?

Pre-filled: `Not currently in Celigo scope. DataSkate can replace Turbine — ShipStation uses a simple REST API via HTTP connector.`

Answer: ☐ Yes, add Turbine replacement to scope  ☐ Not now  ☐ Turbine is no longer used
Details: ___

**Q-10-SS-2.** If in scope: can Sikich or Homage engineering provide Turbine's field mapping and business rules?

Pre-filled: `DataSkate cannot replicate Turbine without its field mapping logic. This is a prerequisite for scoping the replacement.`
Answer: ___

---

## INTERNAL FLAGS — DO NOT SEND TO CLIENT

**FLAG-1 [HIGH — NetSuite / UC9]:** Invoice creation mechanism unconfirmed. NetSuite invoices are system-generated — MuleSoft cannot POST to create directly. Kailash must confirm with Sikich whether UC9 is a SuiteScript-triggered billing workflow, an SO status update only, or fully NetSuite-internal (descope candidate).

**FLAG-2 [HIGH — Shopify Plus / UC5]:** Shopify connector v1.1 GraphQL coverage for bulk product mutations needs verification before UC5 development. If connector doesn't support `productCreate` with variants + metafields via GraphQL, implement via HTTP connector + Shopify GraphQL endpoint directly.

**FLAG-3 [MEDIUM — Cross-system]:** Shopify variant ID ↔ NetSuite item internalId cross-reference table is a prerequisite for UC4 and UC5. Not a MuleSoft deliverable — must coordinate with Sikich in the first setup call.

**FLAG-4 [HIGH — Celigo migration]:** Celigo custom JS transforms (pre-map, post-response, post-submit hooks) must be extracted and documented per flow before DataWeave porting. Sikich holds this knowledge — make this a Day 1 request.

**FLAG-5 [MEDIUM — Laravel/Vapor API Gateway]:** Scope boundary unresolved. If MuleSoft integrates WITH the gateway (needs its API contract); if MuleSoft REPLACES some gateway functions (significant re-scoping). Clarify in scoping call.

**FLAG-6 [MEDIUM — Competitive]:** Homage is evaluating 3–4 vendors. Celigo flow inventory spreadsheet is the single most critical missing artifact. Bundle this request with the Sikich credentials call.

**FLAG-7 [MEDIUM — Buyer profile]:** Operational Pragmatist. Ivy probe: ask "Once you've finished your vendor conversations, how does the final decision typically work — is this yours to make, or does it need sign-off from a broader team?" Natural in a vendor eval context; surfaces approval chain without telegraphing.

---

## PRICING SUMMARY — INTERNAL ONLY

**BASED ON FLO.JSON — DO NOT RECALCULATE**

| Item | Value |
|---|---|
| Confirmed named flows | 22 (17 named + 5 placeholders) |
| Kickoff retainer (11+ tier) | $7,500 — credited against first 6-month IaaS payment |
| Implementation fee (IaaS) | $0 |
| Implementation-Only fee | $77,000 (50% at SOW, 50% at UAT sign-off) |
| Period 1 IaaS (6-month) | $39,600 ($300/flow/mo × 22 × 6) |
| Period 2 IaaS (6-month) | $41,580 |
| Period 3 IaaS (6-month) | $43,659 |
| Period 4 IaaS (6-month) | $45,842 |
| 2-year IaaS total | $170,681 |
| Timeline | ~35 weeks (2 req + 22 × 1.5 dev) |
| Recommended model | **IaaS** — replaces Sikich/Celigo dependency; same operational model, better platform |

**Proposal caveat (verbatim):** "Pricing above covers the 22 flows we have identified from your briefing. One flow from your stated scope of ~23 remains uncharacterized — once we receive the Celigo flow inventory spreadsheet, we will confirm the full list and issue a revised proposal with final flow count and locked pricing before any SOW is signed. The spreadsheet review typically takes 2–3 business days."

**Adjacent flows (not priced):** UC14–UC18 (ShipStation tracking writeback, Loop Returns reconciliation, Orderful EDI splits). Each has a clear promotion gate. Present as expansion scope.
