# Scout Session 3a Handoff — AgileMind — 2026-05-13
**Status:** READY-FOR-SESSION-3b

---

## Session 3a Deliverables

| File | Status |
|------|--------|
| `projects/agilemind/intake/proposal-content.json` | ✓ Written |
| `projects/agilemind/intake/proposal-agilemind.html` | ✓ Generated (lint passes) |

---

## Proposal Summary

- **Flows:** 4 (UC1 Agreement-to-Invoice, UC2 Payment Sync-Back, UC3 Inventory Upload, UC4 QB Item Sync)
- **IaaS 1-year total:** $12,300 (Period 1: $6,000 · Period 2: $6,300)
- **Kickoff retainer:** $2,500 (credited at go-live)
- **Implementation Only:** $14,000 (4 × $3,500)
- **Timeline:** 11 weeks
- **About DataSkate section:** Included (ae.isNewToDataSkate = true)
- **ROI section:** Omitted (no specific volume data from scoping)

---

## P0 Blockers Included in Proposal Assumptions

| P0 | Owner | When |
|----|-------|------|
| QuickBooks Online version confirmed (not Desktop/Enterprise) | Client | Before requirements |
| QBO plan tier Plus or Advanced confirmed | Client | Before requirements |
| Salesforce Inventory__c object created before build | Both | Week 3 |

---

## Session 3b Instructions (Intake HTML Generation)

### Source files:
- `projects/agilemind/intake/intake-questionnaire-agilemind.md`
- `projects/agilemind/company_context.json`
- `projects/agilemind/project.json`

### Build command:
1. Write `projects/agilemind/intake/intake-content.json`
2. Run: `node commons/branding/fill-template.js --template intake --client agilemind`

### HTML notes:
- Architect CC: `kailash@dataskate.ai` (from project.json)
- Submit: Firebase Firestore only — no mailto. Primary CTA: "Submit to DataSkate". Sticky bar + success banner.
- P0 blockers: `.no-print internal-block` — internal only
- AE new to DataSkate: yes (Samantha Telson)
- Primary contact: Maria Gonzalez-Pettway (mgonzalez@agilemind.com)
- Pre-filled answers: add value between textarea tags (JS adds prefilled styling)
- Lint: `node commons/branding/lint-html.js` — fix all violations before session ends
- Deploy: `bash firebase/deploy.sh` → seed Firestore → archive scoping/ → done

---

*Scout Session 3a complete — 2026-05-13*
