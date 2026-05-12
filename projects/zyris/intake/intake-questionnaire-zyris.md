# DataSkate × Zyris — MuleSoft Integration Intake Questionnaire
**Date:** May 2026
**Source:** Gemini-generated notes from Zyris + Salesforce sales call, Feb 17 2026
**Architect:** Kailash Chanda — kailash@dataskate.ai

---

**Instructions for Zyris team (Rodrigo, Alex):**
Pre-filled answers below are derived from your scoping call — leave them as-is if correct, or edit directly. Blank `Answer:` lines are genuine gaps we need you to fill before architecture begins. No attachments needed unless specifically requested.

---

## Section 1 — Use Cases

### UC1a — HubSpot → D365 FO Customer/Contact Sync (Scheduled Batch)

**What we understood:**
- HubSpot Companies (dental practices) in qualifying lifecycle stages → upserted into D365 FO as Customer records
- Scheduled batch job with watermark: queries HubSpot for records modified since last run
- Field data mapped via DataWeave; D365 FO Customer ID stamped back into HubSpot for cross-system linkage
- Prevents unnecessary API calls by skipping unmodified records

**Open questions:**
1. Which HubSpot lifecycle stages trigger sync to FO? (Our best guess: `customer` and `opportunity` — the stages where a dental practice has moved past prospect)
   Answer:

2. How often should the batch job run? (Our best guess: hourly or every 4 hours — dental equipment orders are not time-critical to the minute)
   Answer:

3. Is Contacts (individual dentists/hygienists) also synced to D365 FO, or only Companies (practices)? (Our best guess: both — Companies become FO Customers, Contacts become FO Contact persons attached to the Customer)
   Answer:

→ See Section 3.2 for pre-filled field mapping.

**Scope Boundary for UC1a:**
✅ IN SCOPE: Scheduled query of HubSpot Companies and Contacts → upsert to D365 FO → stamp FO Customer ID back to HubSpot
⚠️ ASSUMED PRE-EXISTS: D365 FO has a custom field on the Customer entity to store the HubSpot Company ID (e.g. `HubSpotId` — string field, max 50 chars). This field must be created by your FO admin before development begins.
❌ OUT OF SCOPE: HubSpot contact/company record design, lifecycle stage configuration, FO customer entity design, field creation in FO

---

### UC1b — HubSpot → D365 FO Customer/Contact Sync (Real-Time, Manual Trigger)

**What we understood:**
- A "sync now" button in HubSpot triggers immediate sync of a single record to D365 FO
- Same mapping and upsert logic as UC1a; different trigger (user action, not schedule)
- Enables reps to force-sync before a customer call without waiting for the next batch run

**Open questions:**
4. How is the real-time button implemented in HubSpot? Options: (a) HubSpot CRM Card (custom card on company record) that calls a MuleSoft Experience API → best practice for HubSpot extensions; (b) HubSpot Workflow with webhook action triggered manually; (c) Other
   Answer:

5. Should the real-time sync also handle Contacts, or Companies only?
   Answer:

→ See Section 3.2 for pre-filled field mapping.

**Scope Boundary for UC1b:**
✅ IN SCOPE: Receive HubSpot trigger (CRM card call or workflow webhook) → sync single record to D365 FO → return success/failure status to HubSpot
⚠️ ASSUMED PRE-EXISTS: HubSpot CRM Card or Workflow configured by Zyris HubSpot admin (DataSkate provides the API endpoint; HubSpot card/workflow setup is Zyris responsibility)
❌ OUT OF SCOPE: HubSpot CRM Card UI design, HubSpot Workflow configuration

---

### UC2a — Shopify → D365 FO Order Sync (Webhook on Order Creation)

**What we understood:**
- New order created in Shopify → MuleSoft webhook receiver → address normalization logic → D365 FO Customer lookup by normalized address → create D365 FO Sales Order
- Complex address normalization: Zyris sent a flowchart to the MuleSoft SE describing the logic for finding matching customer when multiple records share same email but different addresses
- FO Sales Order ID written back to Shopify order for system linkage

**Open questions:**
6. [P0 BLOCKER] Can you share the address normalization flowchart that was referenced on the Feb 17 call? This document is required before UC2a can be designed — it contains the if-else decision logic for matching records.
   Answer:

7. When Shopify triggers the webhook, is the order always associated with an existing D365 FO customer, or can new customers arrive via Shopify without a pre-existing FO record? (Our best guess: new customers arrive via Shopify since it's eCommerce — MuleSoft should create the FO customer if not found)
   Answer:

8. What Shopify webhook event triggers the sync? (Our best guess: `orders/create`)
   Answer: orders/create

9. Are there order types that should NOT sync to FO (e.g. test orders, cancelled orders)? (Our best guess: filter out `financial_status: voided` and `cancelled_at != null`)
   Answer:

→ See Section 3.3 for pre-filled field mapping.

**Scope Boundary for UC2a:**
✅ IN SCOPE: Receive Shopify `orders/create` webhook → normalize address → lookup/create FO customer → create FO Sales Order → stamp FO order ID back to Shopify
⚠️ ASSUMED PRE-EXISTS: Shopify webhook subscription configured for `orders/create` event pointing to MuleSoft endpoint; D365 FO has a custom field on SalesOrder to store Shopify Order ID
❌ OUT OF SCOPE: Shopify store design, product catalog setup in FO, FO sales order approval workflows, financial settlement

---

### UC2b — D365 FO → Shopify Order Status Sync (Real-Time or Scheduled)

**What we understood:**
- When a D365 FO order status changes to Delivered / Fulfilled → MuleSoft syncs that status update to Shopify
- Maintains consistency so dental practices see accurate delivery status on their Shopify account
- Can be real-time (FO event) or batch (scheduled poll of FO orders)

**Open questions:**
10. Should this be real-time or batch? (Our recommendation: batch scheduled poll — FO order status changes are infrequent per order, and near-real-time via scheduled-sync every 15–30 min is sufficient for delivery status)
    Answer:

11. Which D365 FO status values map to which Shopify fulfillment statuses? (Our best guess below)

| D365 FO Order Status | Shopify Fulfillment Status |
|---|---|
| Delivered | fulfilled |
| Invoiced | unfulfilled (or partial) |
| Backorder | unfulfilled |
| Cancelled | cancelled |

Please confirm these mappings or provide corrections.
    Answer:

→ See Section 3.4 for pre-filled field mapping.

**Scope Boundary for UC2b:**
✅ IN SCOPE: Poll D365 FO for order status changes since last watermark → update Shopify order fulfillment status via Shopify API
⚠️ ASSUMED PRE-EXISTS: Shopify Order ID stored in D365 FO (from UC2a — this flow depends on UC2a being in production first)
❌ OUT OF SCOPE: FO order lifecycle management, Shopify fulfillment notification emails (those are Shopify-native)

---

### UC3 — HubSpot Merge Event → External ID Preservation + D365 FO Record Consolidation

**What we understood:**
- HubSpot fires a merge event when two Company or Contact records are merged in HubSpot
- MuleSoft receives the merge event webhook and extracts external system IDs (FO Customer ID, Shopify Customer ID) from the loser record
- Those external IDs are stamped onto the winner record in HubSpot to prevent breaking cross-system links
- Additionally: if a FO Customer merge is warranted, MuleSoft can trigger FO record consolidation

**Open questions:**
12. Should the merge event also trigger record consolidation in D365 FO? Or just preserve the external IDs in HubSpot? (Alex asked about this on the call — confirm scope)
    Answer:

13. HubSpot merge events fire for both Contacts and Companies. Should both be handled, or only Companies?
    Answer:

→ See Section 3.5 for pre-filled field mapping.

**Scope Boundary for UC3:**
✅ IN SCOPE: Receive HubSpot `company.merge` (and optionally `contact.merge`) webhook → extract external IDs from loser record → stamp onto winner record in HubSpot → optionally update D365 FO
⚠️ ASSUMED PRE-EXISTS: HubSpot External ID fields configured for FO Customer ID and Shopify Customer ID (custom HubSpot properties)
❌ OUT OF SCOPE: HubSpot duplicate detection and merge initiation (that is a HubSpot-native operation); FO customer deactivation/archiving policies

---

### UC4 — Pricing / Sales Agreement Tag Sync (FO or HubSpot → Shopify Customer Tags)

**What we understood:**
- Sales agreements and customer pricing tiers can be authored or updated in either D365 FO or HubSpot
- When a pricing agreement changes, Shopify customer tags must be updated to reflect the current agreement (Shopify uses customer tags to apply pricing/discount rules)
- Real-time or batch capture depending on data volume

**Open questions:**
14. When a pricing agreement changes in D365 FO, which FO entity or field is the source of truth? (Our best guess: CustomerGroup or a custom PricingAgreement entity — confirm the D365 FO path)
    Answer:

15. When a pricing agreement changes in HubSpot, which HubSpot property is the trigger? (Our best guess: a custom HubSpot Company property like `sales_agreement_type` or a Deal-level pricing property)
    Answer:

16. Which Shopify customer tags correspond to which pricing agreements? Please provide a mapping:

| Pricing Agreement / Tier (FO / HubSpot) | Shopify Customer Tag |
|---|---|
| (e.g. Gold / Preferred Partner) | (e.g. "gold-partner") |
| (e.g. Standard / Distributor) | (e.g. "standard") |
| | |

    Answer:

17. Is UC4 bidirectional (FO ↔ HubSpot ↔ Shopify) or one-directional (one system drives, others receive)?
    Answer:

→ See Section 3.6 for pre-filled field mapping.

**Scope Boundary for UC4:**
✅ IN SCOPE: Detect pricing agreement changes in source system(s) → update Shopify customer tags to match
⚠️ ASSUMED PRE-EXISTS: Shopify pricing rules / discount scripts are already configured and keyed to the customer tags DataSkate will write. Tag creation and pricing script setup are Zyris responsibility.
❌ OUT OF SCOPE: Shopify discount script/function design, HubSpot Deal or pricing module setup, FO pricing module configuration

---

### Potential Additional Flows — Scope Confirmation

**[POTENTIAL FLOW: D365 FO Product Catalog → Shopify / HubSpot]**
We did not see product/item catalog synchronization mentioned in your scoping documents. Dental equipment products maintained in D365 FO may need to stay in sync with Shopify listings (pricing, availability, new SKUs). Confirm: is this intentionally out of scope, or should it be included?
Answer:

**[POTENTIAL FLOW: HubSpot → D365 FO Invoice / Billing Sync]**
Invoices generated in D365 FO (post-order) are often surfaced in HubSpot for reps to see billing status alongside opportunity history. Confirm: is invoice visibility in HubSpot in scope, or out of scope for this phase?
Answer:

**[POTENTIAL FLOW: D365 FO Inventory Level → Shopify Stock Sync]**
Shopify requires accurate inventory counts for dental equipment to prevent overselling. Inventory managed in D365 FO may need to sync to Shopify. Confirm: is inventory level sync in scope, or managed differently?
Answer:

---

## Section 2 — Systems and Access

18. D365 FO — environment type?
    Answer: Cloud (Microsoft Azure-hosted)

19. D365 FO — do you have a separate sandbox/UAT environment with data for development testing?
    Answer:

20. HubSpot — subscription tier? (Enterprise / Professional / Starter)
    Answer:

21. HubSpot — is there an existing HubSpot Workflows setup? Are webhooks already in use for other integrations?
    Answer:

22. Shopify — plan tier? (Basic / Shopify / Advanced / Plus)
    Answer:

23. Do you have an existing ESB, iPaaS, or middleware platform today? (Current tools handling the fragmented integrations mentioned on the call)
    Answer:

24. Do you have an existing Anypoint Platform subscription? (New subscription purchased per the Feb 17 call — 50 flows, 5M messages, 2 preprod + 2 prod managed APIs at $30K/year)
    Answer: Yes — per Feb 17 contract. Anypoint Platform includes 50 flows, 5M messages, 2 preprod + 2 prod managed APIs.

25. Deployment preference for MuleSoft runtime? (Our recommendation: CloudHub 2.0 — fully managed, no infra to maintain)
    Answer: CloudHub 2.0

---

## Section 3 — Data and Field Mapping

### 3.1 External ID Fields (required for deduplication across systems)

| System | Entity | External ID Field (proposed name) | Who creates it | Status |
|---|---|---|---|---|
| D365 FO | Customer | `HubSpotId` (string 50) | Zyris FO Admin | TBD — confirm field name |
| D365 FO | SalesOrder | `ShopifyOrderId` (string 50) | Zyris FO Admin | TBD — confirm field name |
| HubSpot | Company | `d365_customer_id` (custom property) | Zyris HubSpot Admin | TBD — confirm property name |
| HubSpot | Company | `shopify_customer_id` (custom property) | Zyris HubSpot Admin | TBD — confirm property name |
| Shopify | Customer | Uses D365/HubSpot ID via tags OR metafields | Zyris Shopify Admin | TBD |

Please confirm or correct the proposed field names in the Status column.

---

### 3.2 Field Mapping — UC1a/UC1b: HubSpot Company → D365 FO Customer

Based on HubSpot's standard Company properties and D365 FO Customer OData entity, we propose:

| HubSpot Field | D365 FO Field | Notes |
|---|---|---|
| `hs_object_id` | `HubSpotId` (custom) | External ID — deduplication key |
| `name` | `Name` (Customer.Name) | Company name |
| `lifecyclestage` | `CustomerGroupId` | Map: customer→CUSTOMER, opportunity→PROSPECT — confirm group codes |
| `email` | `Email` (primary) | |
| `phone` | `Phone` | |
| `address` | `AddressStreet` | Line 1 — confirm FO address entity structure |
| `city` | `AddressCity` | |
| `state` | `AddressState` | |
| `zip` | `AddressZipCode` | |
| `country` | `AddressCountry` | ISO code — confirm D365 expects 2-char or full name |
| D365 Customer ID (from FO response) | `d365_customer_id` (HubSpot custom) | Stamp back after upsert |

Please confirm, add missing fields, or flag any field that differs in your setup.
Answer:

---

### 3.3 Field Mapping — UC2a: Shopify Order → D365 FO Sales Order

Based on Shopify Order API and D365 FO SalesOrders OData entity:

| Shopify Field | D365 FO Field | Notes |
|---|---|---|
| `id` (order ID) | `ShopifyOrderId` (custom) | External ID — deduplication key |
| `customer.email` | Customer lookup by HubSpotId or email | Match existing FO customer |
| `created_at` | `OrderDate` | |
| `line_items[].title` | `SalesLine.ItemId` | Confirm FO item ID format |
| `line_items[].quantity` | `SalesLine.SalesQty` | |
| `line_items[].price` | `SalesLine.SalesPrice` | |
| `shipping_address.address1` | `DeliveryPostalAddress.Street` | After normalization |
| `shipping_address.city` | `DeliveryPostalAddress.City` | |
| `shipping_address.province` | `DeliveryPostalAddress.State` | |
| `shipping_address.zip` | `DeliveryPostalAddress.ZipCode` | |
| `shipping_address.country_code` | `DeliveryPostalAddress.CountryRegionId` | |
| `financial_status` | `SalesStatus` | confirmed→Backorder or Open |
| FO SalesOrder.SalesId (from response) | Shopify Order `note_attributes` or `metafield` | Stamp FO ID back to Shopify |

Please confirm mappings. Critical gaps: Shopify product SKU → D365 ItemId mapping table required.
Answer:

---

### 3.4 Field Mapping — UC2b: D365 FO Order Status → Shopify Fulfillment

| D365 FO SalesOrder Field | Shopify Fulfillment Status | Notes |
|---|---|---|
| `SalesStatus = Delivered` | `fulfilled` | |
| `SalesStatus = Invoiced` | `partial` or `unfulfilled` | Confirm — depends on Zyris FO process |
| `SalesStatus = Cancelled` | `cancelled` | |
| FO `ShopifyOrderId` | Shopify Order `id` | Used to find matching Shopify order |

Answer:

---

### 3.5 Field Mapping — UC3: HubSpot Merge Event Payload

HubSpot merge webhook payload (standard):

| HubSpot Merge Payload Field | Action | Notes |
|---|---|---|
| `objectId` (winner record) | Recipient of external ID stamp | |
| `mergedObjectIds[]` (loser record IDs) | Source of external IDs to extract | |
| Company property `d365_customer_id` | Extract from loser → stamp to winner | |
| Company property `shopify_customer_id` | Extract from loser → stamp to winner | |

Answer: [Confirm this is the correct payload structure]

---

### 3.6 Field Mapping — UC4: Pricing Agreement Sync

Answer: Mapping table to be completed after Q14–Q17 in Section 1 are answered.

---

### Data Quality

26. Are there known data quality issues in HubSpot? (e.g. duplicate companies, missing addresses, inconsistent lifecycle stage values)
    Answer:

27. Are Shopify customer records linked to HubSpot companies today? If yes, how? If no, will UC1a create that link?
    Answer:

---

## Section 4 — Volume and Performance

28. Estimated HubSpot Company records in qualifying lifecycle stages (for UC1a batch size):
    Answer:

29. Estimated Shopify orders per day / per month (for UC2a volume sizing):
    Answer:

30. For UC3 merge events: roughly how often do HubSpot record merges happen? (per week, per month)
    Answer:

31. Latency expectation for UC1b real-time sync button — acceptable response time? (Our best guess: under 5 seconds for user-facing sync)
    Answer: Under 5 seconds

32. Peak load periods? (e.g. trade show season, end-of-year promotions)
    Answer:

33. Uptime SLA requirement? (Our recommendation: 99.9% — standard for B2B operational integrations)
    Answer: 99.9%

---

## Section 5 — Security and Compliance

34. Is PII being transmitted? (Our assessment: YES — dental practice names, contact emails, phones, billing addresses are PII)
    Answer: Yes

35. Regulatory compliance requirements? (Our assessment: dental equipment B2B — not HIPAA-regulated since no patient health data is involved; standard PCI-DSS considerations for any order data)
    Answer:

36. HubSpot authentication method DataSkate will use: Private App token (recommended for server-to-server) or OAuth 2.0?
    Answer:

37. D365 FO authentication: Azure AD Application (client_id + client_secret) for OAuth 2.0 client credentials. Will a dedicated Azure AD App Registration be created for DataSkate?
    Answer:

38. Shopify authentication: Private App API key (Admin API access token). Will a dedicated Private App be created in your Shopify admin?
    Answer:

39. Data residency requirements? (data must stay in a specific region)
    Answer: No specific requirement — US-East CloudHub 2.0 default acceptable

---

## Section 6 — Error Handling

40. If D365 FO is unavailable during an order sync (UC2a) — preference: (a) retry with exponential backoff for up to 30 minutes, then route to a dead-letter queue for ops review; (b) fail immediately and return 200 to Shopify (order logged, manual retry); (c) other
    (Our recommendation: (a) — retry with DLQ, since missed orders = lost revenue)
    Answer:

41. If address normalization fails (no matching FO customer found for a Shopify order) — what should happen? Options: (a) Create a new FO customer from Shopify order data; (b) Route to a manual review queue; (c) Reject the order (return error to ops)
    Answer:

42. Who receives failure alerts? (email, Slack, Teams) and at what address/channel?
    Answer:

43. Is duplicate order processing a problem? (If Shopify fires the same webhook twice — does processing it twice cause a business issue? Our assumption: YES — must implement idempotency via Shopify order ID deduplication)
    Answer: Yes — idempotency required

---

## Section 7 — Deployment and DevOps

44. Environments needed: (Our recommendation: dev, UAT, prod)
    Answer: dev, UAT, prod

45. Network or firewall restrictions on D365 FO side? (Azure VNet, IP allowlisting for inbound MuleSoft calls)
    Answer:

46. CI/CD tools in use? (GitHub Actions / Azure DevOps / none)
    Answer:

47. Secrets management preference: (Our recommendation: Azure Key Vault — natural fit given D365 FO is Azure-hosted)
    Answer:

**Access Chain Table:**

| System | Admin Owner | API User/App Creator | Backup Admin | Sandbox Available | Status |
|---|---|---|---|---|---|
| HubSpot | TBD — client to confirm | Zyris HubSpot Admin | TBD | Yes (sandbox portal or staging) | TBD |
| D365 FO | TBD — client to confirm | Azure AD App Registration — Zyris IT | TBD | TBD — confirm sandbox env | TBD |
| Shopify | TBD — client to confirm | Zyris Shopify Admin (Private App) | TBD | No sandbox in standard Shopify | TBD |

Please fill in admin names and confirm backup admins. Single-admin on any system = integration delivery risk.

---

## Section 8 — Operations and Support

48. Logging and monitoring tools currently in use? (Splunk / Datadog / Azure Monitor / none)
    Answer:

49. Who owns operational support after go-live? (Zyris IT team — Rodrigo, Alex — or DataSkate managed service)
    Answer:

50. Need for a client-facing operations dashboard (integration health, message counts, error rates)?
    Answer:

---

## Section 9 — Testing and Go-Live

51. Are test environments available for D365 FO and HubSpot with representative data?
    Answer:

52. Automated testing capability on Zyris side? (or DataSkate manages all testing)
    Answer:

53. UAT acceptance criteria — who signs off on go-live readiness? (Rodrigo / Alex / both)
    Answer:

54. Blackout periods for changes? (e.g. end-of-quarter, trade shows)
    Answer:

55. Target go-live date?
    Answer:

---

## Section 10 — System-Specific Details

### [SYSTEM: HubSpot]

56. [P0 BLOCKER — FK-013] HubSpot connector: DataSkate's connector registry shows `mule-hubspot-connector 1.0.0` on Anypoint Exchange, but the Feb 17 MuleSoft SE stated no pre-built connector exists. We will verify on Exchange before architecture. However: can you confirm the HubSpot API type your instance uses? (Standard REST API — `api.hubapi.com/crm/v3/...` — and which auth method: Private App token or OAuth 2.0?)
    Answer:

57. [SYSTEM: HubSpot] HubSpot rate limit clarification: Standard Private App tokens support 100 requests / 10 seconds. For your batch sync volume (estimated in Q28), is this sufficient, or do you have a HubSpot Enterprise subscription with higher API limits?
    Answer:

58. [SYSTEM: HubSpot] Webhook signature verification: HubSpot sends `X-HubSpot-Signature` on all webhook events. Does your HubSpot instance already use webhooks to other systems? (We'll configure MuleSoft to verify the signature — just confirming you have access to the HubSpot App Secret for configuration)
    Answer:

### [SYSTEM: Dynamics 365 FO]

59. [P0 BLOCKER — FK-005] D365 FO update operations: Our research confirms the MuleSoft D365 FO connector does not support PATCH natively. DataSkate will implement an HTTP connector fallback with manual OAuth token management for all update operations. To configure this: what is your D365 FO OData base URL? (Expected format: `https://{your-d365-hostname}.operations.dynamics.com/data/`)
    Answer:

60. [SYSTEM: D365 FO] Azure AD App Registration: DataSkate requires a dedicated Azure AD App Registration to authenticate against D365 FO via OAuth 2.0 client credentials. Your Azure AD admin (Rodrigo / IT team) needs to create this and grant it the appropriate D365 FO permissions. Please confirm: (a) your Azure AD Tenant ID, (b) whether a DataSkate app registration can be created, (c) D365 FO environment URL (sandbox and prod)
    Answer:

61. [SYSTEM: D365 FO] What is the D365 FO version / application version? (Helps confirm OData API version and any known quirks)
    Answer:

### [SYSTEM: Shopify]

62. [SYSTEM: Shopify] Shopify plan tier and Admin API version in use? (Our assumption: Shopify Admin API 2024-01 or later — confirm)
    Answer:

63. [SYSTEM: Shopify] Shopify webhook endpoint: DataSkate will provide an HTTPS endpoint for Shopify to POST `orders/create` events. Are there any Shopify webhook restrictions (IP allowlisting, rate limits on webhook retries) we should know about?
    Answer:

64. [SYSTEM: Shopify] How are FO Customer IDs currently linked (if at all) to Shopify customers? Via customer metafields, customer tags, or not at all?
    Answer:

---

## INTERNAL FLAGS (Do not send to client)

**P0 BLOCKERS — must resolve before architecture begins:**

1. [P0] **Address normalization flowchart missing**: Zyris sent a flowchart to Sam McKay (MuleSoft SE) describing the address normalization business logic for Shopify → FO order matching. This document was NOT included in the scoping folder. UC2a cannot be architected without it. Request directly from Rodrigo or Alex.

2. [P0] **HubSpot connector verification**: Registry shows `mule-hubspot-connector 1.0.0` but Feb 2026 SE said no pre-built connector. Architect must verify on Anypoint Exchange before decisions.json is finalized. If connector lacks required operations (search, patch, webhook subscribe) → HTTP connector + manual OAuth token subflow required (FK-005 pattern). ALSO verify if HubSpot Private App tokens require OAuth or just bearer auth.

3. [P0] **D365 FO PATCH limitation**: FK-005 confirmed. ALL update operations in FO require HTTP connector fallback + manual Azure AD token caching (ObjectStore, 55-min TTL, evict on 401). Factor ~1 story per flow that requires FO write. This affects UC1a, UC1b, UC2b, UC4 at minimum.

4. [P0] **External ID fields in D365 FO**: Custom fields (`HubSpotId`, `ShopifyOrderId`) must be created in D365 FO Customer and SalesOrder entities before development begins. This requires FO admin access and data entity extension — potentially a D365 FO customization sprint. Clarify: does Zyris IT have FO Developer access, or is this through a D365 partner?

5. [P0] **D365 FO sandbox availability**: Sales call did not confirm whether a sandbox/UAT environment exists. Development against production with GET-only guardrail is possible but risky. Architect must get sandbox confirmation in first discovery call.

**Technical risks for architect:**

6. [MEDIUM] **UC1b real-time sync mechanism unknown**: "Sync button" in HubSpot can be implemented several ways (CRM Card, HubSpot Action, Workflow webhook). Each has different auth and trigger behavior. Architect must confirm implementation approach before designing the Experience API endpoint.

7. [MEDIUM] **UC4 bidirectionality ambiguity**: Scoping notes say pricing can be "authored or updated in FO or HubSpot" — this implies two separate source-of-truth triggers (FO → Shopify AND HubSpot → Shopify). If bidirectional sync between FO and HubSpot is ALSO required (not just → Shopify), this adds 2 more flows. Clarify scope in intake.

8. [MEDIUM] **Shopify → FO product/item ID mapping**: Shopify `line_items[].title` is a product title, not a structured SKU that maps directly to D365 FO `ItemId`. A lookup table or SKU-based mapping is required. If Shopify `line_items[].sku` matches FO item codes, this is simpler — confirm.

9. [LOW] **HubSpot pagination on bulk sync**: HubSpot API returns max 100 records per call with cursor pagination. For large Company lists, recursive sub-flow (FK-006 pattern) required. Confirm record count in Q28 to assess whether this needs batch scope instead.

10. [LOW] **Watermark field for UC2b FO status sync**: D365 FO SalesOrder modified timestamp field for watermark polling must be confirmed. Expected: `ModifiedDateTime` or `DeliveryDate` — architect to verify during API Contract Discovery.

**Source file note:**
This questionnaire is based on a sales call transcript (Feb 17 2026) — NOT a technical discovery call. Many technical details are assumed from research, not confirmed by the client. The intake responses will be the first ground-truth input.

---

## Pricing Summary (Internal — Do Not Send to Client)

**Flows confirmed: 6**
UC1a (HubSpot → FO batch), UC1b (HubSpot → FO real-time), UC2a (Shopify → FO order create), UC2b (FO → Shopify status sync), UC3 (HubSpot merge → external ID stamp), UC4 (Pricing tag sync)

*Note: UC4 may split into 2 flows if bidirectional FO↔HubSpot→Shopify is confirmed — total would then be 7 flows.*

**Implementation (IaaS model):** $0 — included in managed service
**Implementation timeline:** 2 + (6 × 1.5) = **11 weeks** from signed SOW

**Managed service rates:**
| Period | Months | Rate/flow/month | 6-month payment |
|---|---|---|---|
| Period 1 | 1–6 | $150.00 | $5,400 |
| Period 2 | 7–12 | $157.50 | $5,670 |
| Period 3 | 13–18 | $165.38 | $5,954 |
| Period 4 | 19–24 | $173.64 | $6,251 |
| **2-Year Total** | | | **$23,275** |

**Implementation Only alternative:** 6 × $3,500 = **$21,000** (one-time, no ongoing DataSkate service)

**AE note:** Zyris AE (Paris Thomas, MuleSoft) is new to DataSkate. Client paid $30K/year for Anypoint Platform. Implementation Only at $21K may be a good fit if client IT team (Rodrigo, Alex, Rafael) wants to own and maintain post-implementation.

**Recommended model:** Implementation Only — Zyris has developer resources (Rodrigo has dev background, Alex and Rafael are developers). DataSkate builds; Zyris team operates.
