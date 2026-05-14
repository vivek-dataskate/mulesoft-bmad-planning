---
name: feedback-scout-scoping-v2
description: "Architect feedback on Scout scoping — no-combine rule, vertical research, prerequisites, field mapping proposals"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c27917cc-6db4-4ed7-a879-ad3fc6c05c69
---

Scout v1 combined similar flows (Shopify Store 1 + Store 2 = one UC) and missed prerequisite scope boundaries. Architect review of MRN project identified 10 flows vs Scout's 5.

**No-combine rule:** Each system instance = one separate flow. Never merge. Shopify Store 1 ≠ Store 2. PharmacyHub ≠ Pipeline Medical. Gravity Forms→SF ≠ Gravity Forms→Mailchimp.

**Why:** Maintainability, independent deployment, and contract clarity (managed service is per-flow — combining obscures billing).

**Business vertical research:** Scout must research the client's industry BEFORE flow analysis. Web search client website, identify canonical business objects for that vertical. This anchors field mapping and use case completeness.

**System prerequisites:** Every target system has prerequisites (Mailchimp needs existing campaign; Salesforce needs existing objects/fields). Scout must explicitly state IN SCOPE / ASSUMED PRE-EXISTS / OUT OF SCOPE per UC.

**Field mapping proposals:** Don't ask "do you have field mapping docs?" — propose the standard field set for the vertical+system pair and ask client to confirm/correct.

**How to apply:** All four rules now encoded in Scout principles and scoping workflow steps (Step 0, 0b, 2 NO-COMBINE, 5b, and Section 1 output format).
