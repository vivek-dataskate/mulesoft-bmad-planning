# Scout Session 1 Handoff — AgileMind — 2026-05-13
**Status:** READY-FOR-SESSION-2

---

## 1. Project Metadata
- Client slug: agilemind
- Display name: AgileMind
- Architect: Kailash Chanda <kailash@dataskate.ai>
- Engagement type: new integration | Go-live: 2026-07-15
- Primary contact: Maria Gonzalez-Pettway <mgonzalez@agilemind.com>
- AE: Samantha Telson | New to DataSkate: true
- Additional stakeholders: Holly Wale (Partner Services / Inventory), Crystal Robinson (Accounting / Invoicing), Linda (CFO — final budget approver), Chloe (Engineering/IT Director — Salesforce and system admin)

---

## 2. Business Vertical
- Industry: educational publishing | Vertical slug: commerce (OAGIS 10.x applies to their product/order/invoice objects)
- Canonical business objects: Program/Product (ISBN-keyed with regional variants), Agreement/Contract, Invoice, Inventory Item (physical print books), Account (School District), Opportunity, Payment
- Fiscal year: April 1 – March 31. Critical back-to-school production cycle: May/June order placement; July/August fulfillment.

---

## 3. Detected Systems
| System | Source | Connector Key | Auth Type | On-premise? | Playbook exists? |
|--------|--------|---------------|-----------|-------------|-----------------|
| Salesforce | All transcripts — explicit | salesforce | oauth-jwt | No (cloud) | Yes — playbooks/salesforce/PLAYBOOK.md |
| QuickBooks | All transcripts — explicit | quickbooks-online (if QBO confirmed) | oauth2 | No (likely cloud) | YES for QBO: playbooks/quickbooks-online/PLAYBOOK.md (new stub) |
| Excel / Google Sheets | AE transcript — explicit; Holly says "Google Sheets I own" (May 8) | google-sheets (if GSheets) OR file+sftp (if local Excel) | oauth2 / service-account | No | No |

---

## 4. Inferred Systems (need confirmation in questionnaire)
| Phrase | Likely system | Clarifying question |
|--------|--------------|---------------------|
| "my Google Sheets" (Holly, May 8) | Google Sheets (not local Excel) | "Is Holly's inventory demand worksheet a Google Sheet (sheets.google.com) or a local Excel file saved on a PC/OneDrive?" |
| "QuickBooks" (multiple references) | QuickBooks Online vs Desktop | P0: "Is your QuickBooks the cloud-hosted version at QuickBooks.com, or installed on a local server or PC at your office?" |
| "Chloe's IT team" | Internal Salesforce admin + IT infra | No separate system — IT involvement needed for SF custom object creation and any network/firewall config |

---

## 5. Confirmed Use Cases

### UC1: Salesforce Agreement → QuickBooks Invoice Creation
- Source: Salesforce (Agreement__c) → Target: QuickBooks Online | Direction: unidirectional with sync-back | Trigger: Agreement status change (Approved/Active) | Entity: Agreement + Invoice
- Evidence: "When an agreement is created in Salesforce, it will generate a new invoice in QuickBooks for an existing account." — Apr 28 session
- Evidence: "Crystal manually transfers the account details and line items to the QuickBooks invoice." — Apr 28 session (current pain point)
- Return sync: QB Invoice number, invoice date, due date → back to Salesforce Agreement fields (SF_QB_InvoiceId__c)
- Multi-year logic: (a) prepaid multi-year = full amount year 1, zero in subsequent years; (b) pay-per-year = annual agreement per year, only invoice when customer confirms payment for that year
- Invoicing due date rule: early orders (Jan–Mar) → invoice created immediately, due date set to July/Aug when school budget opens; summer orders → due within 30 days

### UC2: QuickBooks Payment Status → Salesforce Agreement (scheduled sync)
- Source: QuickBooks Online (Invoice + Payment objects) → Target: Salesforce (Agreement__c) | Direction: unidirectional | Trigger: Scheduled (daily/nightly poll) | Entity: Payment
- Evidence: "update the invoice number, date, and other payment information back into the Salesforce agreement" — Apr 28 session
- Evidence: "track payment updates from QuickBooks to Salesforce, including the open balance" — Apr 28 session
- Fields: QB Invoice status (Open/Paid/Partially Paid), open balance amount, payment date → SF Agreement fields
- Note: UC1 creates the invoice; UC2 polls QB for payment status updates. These are separate flows (different triggers: event-driven vs scheduled).

### UC3: Excel / Google Sheets Inventory → Salesforce Custom Inventory Object
- Source: Google Sheets (likely) or Excel | Target: Salesforce custom Inventory__c object (does not exist yet) | Direction: unidirectional | Trigger: Scheduled or file-change trigger | Entity: Inventory Item
- Evidence: "inventory data that you need is in Excel... So, what we would do is push the data directly from Excel in real time or from QuickBooks if it's living in QuickBooks" — AE transcript
- Evidence: Holly says "if it starts out in spreadsheets I own or Google Sheets and gets into Salesforce... That'll be like the database" — AE transcript
- Data: Product title, ISBN, quantity-on-hand, committed quantity, available quantity, unit cost, buffer pct
- Business logic: Must separate committed inventory from available. Holly needs this view for demand planning and to answer exec questions.
- Note: **Prerequisite blocker** — Salesforce custom Inventory__c object must be designed and created by Chloe's team before this flow can be built.

### UC4: QuickBooks Inventory Items → Salesforce Custom Inventory Object
- Source: QuickBooks Online (Item object with inventory tracking) | Target: Salesforce Inventory__c | Direction: unidirectional | Trigger: Scheduled (nightly) | Entity: Inventory Item (QB Item type = Inventory)
- Evidence: "inventory is manually tracked and maintained in QuickBooks, not Salesforce. QuickBooks chosen for inventory maintenance due to existing reporting and access." — Apr 28 session
- Evidence: Maria Gonzalez-Pettway: "Maria Gonzalez-Pettway confirmed that QuickBooks has good reports, and Holly Wale has access to run them, making it acceptable to maintain inventory there." — Apr 28 session
- Note: QB is the source-of-record for inventory. When invoices are created in QB (via UC1), QB automatically decrements QOH. UC4 reads the updated QOH from QB → syncs to Salesforce for dashboard visibility.
- Relationship to UC3: UC3 (Excel/Sheets → SF) and UC4 (QB → SF) may overlap. Recommend: QB as primary source-of-record for inventory; Excel/Sheets as input channel for initial load or Holly's demand planning data only. Confirm with Maria/Holly during intake.

---

## 6. Potential Additional Flows
| Entity | System A → System B | Scoping signal | Priority |
|--------|---------------------|---------------|---------|
| [POTENTIAL FLOW] Product/ISBN Catalog | Salesforce Products ↔ QB Items | "maintaining two separate lists for what is fundamentally one list" (Holly, May 8); risk of ISBN divergence between QB and SF | High — misalignment blocks UC1 line item mapping |
| [POTENTIAL FLOW] Opportunity Demand Report | Salesforce Opportunities → Inventory dashboard | "I actually look at all open ops in a range... to see what is in demand" (Holly, AE transcript) — open opps need to be visible in inventory planning, not just closed-won | Medium |
| [POTENTIAL FLOW] Invoice Overdue Alert | QB Invoice (overdue) → Notification (Email/Slack to Crystal/Maria) | "follow-up date and escalation notes related to collections are expected to remain manual" — could be automated as an outbound notification flow | Low |

---

## 7. P0 Blockers
| System | Blocker | Owner | Must resolve before |
|--------|---------|-------|-------------------|
| QuickBooks | Version not confirmed — QBO vs Desktop/Enterprise. If Desktop, entire architecture changes. MuleSoft QBO connector does NOT work with QB Desktop. | Maria Gonzalez-Pettway | Intake response |
| Salesforce | Custom Inventory__c object does not exist. Must be designed and created by Chloe's IT team before UC3/UC4 integration can be built. | Chloe (Engineering Director) | Architecture phase |
| QuickBooks Online | Inventory tracking requires QBO Plus or Advanced plan. Essentials/Simple Start cannot track inventory via API. | Maria Gonzalez-Pettway | Intake response |
| QuickBooks Online | OAuth consent — QB Company Admin must authorize DataSkate app via developer.intuit.com. Generates refresh token stored in Secrets Manager. | Maria Gonzalez-Pettway / Linda | Before dev environment setup |

---

## 8. Triggered Conditional Signals
| Signal phrase | Question set triggered |
|--------------|----------------------|
| "scheduled / nightly" (inventory sync context) | Batch/scheduled question set — resume-from-checkpoint, worst-case record count, time window |
| "real-time / immediately" (invoice creation context) | Real-time/latency question — sub-3s acceptable? Will Crystal trigger manually or automated on Agreement status? |
| "fiscal year April 1" (Maria, AE transcript) | Deployment timing — go-live constraints; no deployment during back-to-school peak (May–Aug) |
| "Chloe engineering director / IT involved" | Network/firewall question — any IT restrictions on CloudHub 2.0 outbound connections? Secrets management approach? |
| "permissions / role-based access" (Holly re: inventory visibility) | Salesforce profile/permission set design — inventory dashboard visible only to Holly + select users |

---

## 9. System Research Findings

### Salesforce
- Auth: OAuth JWT | API style: REST + Bulk API v2 + Platform Events | Rate limits: 100K API calls/day (Enterprise)
- Key quirks: SOQL OFFSET silent failure > 2,000 records — use nextRecordsUrl cursor; pin API version; External IDs must be created on Agreement__c before upsert
- Prerequisites: External ID field `QB_InvoiceId__c` on Agreement__c; CDC/Platform Events may be needed for event-driven trigger on Agreement status change
- Playbook exists at playbooks/salesforce/PLAYBOOK.md — mature, covers Account, Opportunity, Contact
- Source: playbooks/salesforce/PLAYBOOK.md | Confidence: high

### QuickBooks Online (assumes QBO confirmed — P0 if Desktop)
- Auth: OAuth 2.0 (Authorization Code flow) | API style: REST v3 | Rate limits: 500 req/min, max 10 concurrent
- Key quirks: No PUT/PATCH — all updates via POST with full object + SyncToken; 60-min access token expiry (FK-017 verified); refresh token may rotate every 24-26 hours; realmId required on every call; QBO inventory only in Plus/Advanced plan
- Prerequisites: Intuit Developer Portal app registration; QB Company Admin OAuth consent (one-time); realmId in Secrets Manager
- Connector: mule-quickbooks-online-connector 3.0.0, oauth2, com.mulesoft.connectors
- New playbook created: playbooks/quickbooks-online/PLAYBOOK.md
- Source: FK-017, web research (Intuit developer docs 2026, getknit.dev QBO guide) | Confidence: high (assumes QBO)

### Google Sheets / Excel
- Auth: oauth2 or service-account (Google Sheets) | API style: REST (Google Sheets API v4)
- Key quirks: Service account auth preferred for unattended server-to-server flows (no user OAuth consent required); sheet must be shared with service account email; large sheets (10K+ rows) use batch read
- Alternative: If Excel → SFTP drop or OneDrive/SharePoint connector depending on where file lives
- Source: connector-index.json (google-sheets entry) | Confidence: high (if Google Sheets confirmed)
- No web results needed — standard pattern

---

## 10. Architect Knowledge Extracted
| System | Finding | Written to |
|--------|---------|-----------|
| Salesforce | Kailash proposed configurable ISBN lookup table in Salesforce (custom metadata type recommended) to automate state → ISBN mapping. If no match found → route to manual review queue. | playbooks/salesforce/PLAYBOOK.md Known Quirks (update in Session 2) |
| Salesforce | Kailash designed two inventory options: (a) QB-only, (b) sync to custom SF Inventory object. Team deferred to Maria. | scout-s1.md UC3/UC4 scope boundary |
| Salesforce | Kailash committed to invoice due date column logic based on discussed scenarios (early orders = July/Aug due; summer orders = 30 days). This becomes a questionnaire item for confirmation. | UC1 questionnaire — Section 10 |
| QuickBooks Online | Kailash participated in Apr 28 discovery. Did not explicitly surface QB quirks on that call — likely was already aware of FK-017 from prior research. | N/A (FK-017 already in FIELD_KNOWLEDGE.md) |

---

## 11. Scout Self-Improvement Proposals
| Type | Trigger | Question | Scout section |
|------|---------|---------|--------------|
| Base question gap | Educational publishers have academic fiscal years that don't align with Jan 1. | Add to base questions: "What is your fiscal year start date? Any deployment blackout periods?" | Section 9 (Testing/Go-live) |
| Conditional signal | Inventory with committed vs available distinction indicates complex data model | Add conditional: if "committed vs available inventory" mentioned → add question about inventory reservation logic and whether it needs to be replicated in Salesforce | Section 1 UC scope |

---

## 12. Canonical Models
| Business Object | Record name | Stub exists? | Session 2 action |
|----------------|-------------|-------------|-----------------|
| Agreement / Contract | order (maps to OAGIS ProcessPurchaseOrder) | No — commerce/canonical-order.yaml missing | CREATE stub with education-specific addedFields |
| Invoice | invoice (maps to OAGIS ProcessInvoice) | No — commerce/canonical-invoice.yaml missing | CREATE stub |
| Inventory Item / Book | product (maps to OAGIS SyncItem) | No — commerce/canonical-product.yaml missing | CREATE stub with ISBN + committed/available fields |
| Account (School/District) | customer (maps to OAGIS SyncCustomerParty) | No — commerce/canonical-customer.yaml missing | CREATE stub |

---

## 13. Files Written This Session
- projects/agilemind/project.json ✓ (existed from prior Scout run)
- projects/agilemind/company_context.json ✓
- projects/agilemind/canonical-extensions.yaml (shell) ✓
- playbooks/quickbooks-online/PLAYBOOK.md ✓ (new stub)
- Scoping files moved from _inbox/ to projects/agilemind/scoping/ ✓
- FK-017 (FIELD_KNOWLEDGE.md) — already exists, re-verified for AgileMind context, second occurrence noted

---

## 14. Session 2 Load List
- Playbooks to load:
  - playbooks/salesforce/PLAYBOOK.md
  - playbooks/quickbooks-online/PLAYBOOK.md (new — Session 1 created)
- Canonical models to load:
  - standards/canonical-models/commerce/ (create stubs for order, invoice, product, customer — none exist yet)
- Confirmed flow count for pricing: **4 flows** (UC1 + UC2 + UC3 + UC4)
- Pricing pre-calculation:
  - IaaS: $0 implementation; $250/flow/month × 4 flows
  - Kickoff retainer: $2,500 (1–5 flows bracket)
  - 6-month payment Period 1: 4 × $250 × 6 = **$6,000**
  - 6-month payment Period 2: 4 × $262.50 × 6 = **$6,300**
  - 1-year IaaS total: **$12,300** (+ $2,500 retainer credited)
  - Implementation only: 4 × $3,500 = **$14,000**
  - Timeline: 2 + (4 × 1.5) = **8 weeks** from signed SOW
- Special notes for Session 2:
  - P0 blocker section must be prominent — QB version is unknown and blocks architecture
  - The Salesforce Inventory__c custom object dependency must be highlighted as a client-side prerequisite
  - Field mapping for UC1 (Agreement line items → QB Invoice line items) needs ISBN lookup table design discussion
  - Holly is the inventory SME; Crystal is the QB/invoicing SME; Maria is the budget/operations decision-maker; Linda is the final financial approver; Chloe owns IT/Salesforce admin
  - Go-live April 1 (prior fiscal year target from AE call) — May 2026 scoping calls suggest this slipped; current project.json has 2026-07-15. Use 2026-07-15 but flag the back-to-school risk window (production orders placed May/June, fulfillment July/Aug)
