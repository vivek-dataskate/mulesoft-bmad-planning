---
name: feedback-proposal-ux
description: "Proposal template UX patterns — collapsible sections, compact padding, sticky bar; user wants shorter documents"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 46774b27-0204-4fbc-ac4e-d4f3b175d454
---

Proposal documents must use collapsible `<details class="section-block">` sections, not static `<section>` elements. Padding reduced ~40% vs original (header `28px 40px`, section-body `4px 40px 24px`). Sticky bar with Expand All / Print / Accept CTA.

**Why:** User explicitly asked to "save space, expand text, show segregated, avoid too many pages." Same pattern from intake form, applied to proposals.

**How to apply:**
- All proposal-type documents use `details.section-block` + `summary.section-head` + `.section-body`
- Key sections default `open`: Journey, Flows, Investment (or similar high-value sections)
- Secondary sections default collapsed: Outcomes, Timeline, Included, OOS, Assumptions
- Sticky bar always present at top
- `toggleAllSections()` JS function handles expand/collapse all
- Print CSS: `details.section-block > .section-body { display: block !important }` to force all sections visible when printing

Related: [[feedback-intake-form-ux]], [[feedback_html_portal_violations]]
