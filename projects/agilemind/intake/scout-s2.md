# Scout Session 2 Handoff — AgileMind — 2026-05-13
**Status:** READY-FOR-SESSION-3

---

## Session 2 Deliverables

| File | Status |
|------|--------|
| `projects/agilemind/intake/intake-questionnaire-agilemind.md` | ✓ Written |
| `standards/canonical-models/commerce/canonical-product.yaml` | ✓ Created (new stub — Session 2) |
| `standards/canonical-models/commerce/canonical-order.yaml` | ✓ Already existed — verified aligned to AgileMind UC1 |
| `standards/canonical-models/commerce/canonical-invoice.yaml` | ✓ Already existed — verified aligned to AgileMind UC1/UC2 |
| `standards/canonical-models/commerce/canonical-customer.yaml` | ✓ Already existed — verified aligned |

---

## Questionnaire Summary

**Total questions:** 54 client-facing questions across 8 sections + 10 internal pre-decisions (Section 9)

| Section | Topic | Question count |
|---------|-------|---------------|
| 1 — Use Cases | UC1 (7Q), UC2 (4Q), UC3 (5Q), UC4 (5Q) | 21 |
| 2 — Systems | Salesforce (6Q), QuickBooks (4Q), Google Sheets/Excel (4Q) | 14 |
| 3 — Field Mapping | Tables UC1–UC4 + follow-up sub-questions | 8 |
| 4 — Data Volume / Scheduling | Volumes, time windows, deadlines | 5 |
| 5 — ISBN Mapping | Catalog, lookup table, new-ISBN process | 5 |
| 6 — Testing and Go-Live | Sandbox, go-live, freeze windows | 6 |
| 7 — Potential Additional Flows | 3 potential flows | 3 |
| 8 — Pricing Confirmation | Budget review, scope expansion | 2 |

---

## P0 Questions Embedded in Questionnaire

| P0 | Question | Location |
|----|----------|----------|
| QB version (Online vs Desktop) | Q4.1 | Section 1 UC4 + Section 2B Q6.1 |
| QBO plan tier (Plus/Advanced required for inventory) | Q4.2 | Section 1 UC4 |
| QB OAuth consent — who is the Company Admin | Q4.3, Q6.3 | Section 1 UC4 + Section 2B |
| SF custom Inventory__c object prerequisite | Q3.3a, Q10.1 | Section 3.3, 3.4 + Section 6 |

---

## Canonical Models Status

| Model | File | Status | AgileMind extension |
|-------|------|--------|---------------------|
| Order (Agreement) | `standards/canonical-models/commerce/canonical-order.yaml` | Existing stub | `canonical-extensions.yaml`: agreementStatus, schoolStartDate, fiscalYear, invoiceDueDate |
| Invoice | `standards/canonical-models/commerce/canonical-invoice.yaml` | Existing stub | `canonical-extensions.yaml`: QB_InvoiceId__c → invoiceId rename |
| Product / Inventory Item | `standards/canonical-models/commerce/canonical-product.yaml` | **NEW stub — Session 2** | `canonical-extensions.yaml`: isbn, isbnVariants, committedQuantity, availableQuantity, bufferPct |
| Customer (Account) | `standards/canonical-models/commerce/canonical-customer.yaml` | Existing stub | No extensions required at this time |

---

## Field Mapping Coverage

| UC | Source | Target | Mapping table in questionnaire | Key open question |
|----|--------|--------|-------------------------------|------------------|
| UC1 | Salesforce Agreement__c | QuickBooks Invoice | Section 3.1 (9 rows) | Q3.1a: SF Account → QB Customer match key; Q3.1b: ISBN lookup table object type |
| UC2 | QuickBooks Invoice + Payment | Salesforce Agreement__c | Section 3.2 (5 rows) | Q3.2a: SF field API names for new Agreement fields |
| UC3 | Google Sheets / Excel | Salesforce Inventory__c | Section 3.3 (7 rows) | Q3.3a: Chloe to use provided field names or DataSkate to send spec |
| UC4 | QuickBooks Items | Salesforce Inventory__c | Section 3.4 (5 rows) | Q3.4a: where ISBN is stored in QB Item (SKU field vs Description) |

---

## Pricing Pre-Calculation (confirmed in S1, reproduced for S3)

| Item | Amount |
|------|--------|
| Flow count | 4 flows (UC1 + UC2 + UC3 + UC4) |
| Kickoff retainer | $2,500 |
| IaaS Period 1 (6 months) | $6,000 |
| IaaS Period 2 (months 7–12) | $6,300 |
| IaaS 12-month total | $12,300 |
| Implementation only | $14,000 |
| Build timeline | ~8 weeks from signed SOW |

---

## Session 3 Instructions (HTML Generation)

### Files to generate:
1. `projects/agilemind/intake/intake-questionnaire-agilemind.html` — Firebase intake form

### HTML build notes:
- Source: `projects/agilemind/intake/intake-questionnaire-agilemind.md` + `projects/agilemind/company_context.json`
- Design standards: `commons/branding/HTML_DESIGN_STANDARDS.md`
- Logo: inline SVG from `projects/mrn-healthcare/intake/proposal-mrn-healthcare.html`, height 28px
- Business Context Panel: use `company_context.json` snapshot + AI journey phases + P0 blockers
- Submit button: Firebase Firestore only — no mailto. Primary CTA: "Submit to DataSkate". Sticky submit bar + success banner.
- Pre-filled fields: use `--amber-bg` / amber border styling
- P0 blocker section: `.no-print` — internal only, never shown in PDF
- Architect CC: read `kailash@dataskate.ai` from `project.json` architectEmail field
- Lint: run `node commons/branding/lint-html.js` after writing — fix all violations before session ends
- Forbidden patterns: dark header, gray body (#F5F5F5), circle section numbers, card section wrappers, off-palette CSS vars

### Firebase deployment:
After HTML is generated and lint passes:
- Run `bash firebase/deploy.sh` to deploy to Firebase Hosting
- Seed Firestore `projects` collection with agilemind project data from `projects/agilemind/project.json`
- Confirm deployment URL

---

*Scout Session 2 complete — 2026-05-13*
