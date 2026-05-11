# DataSkate — Client Proposal Structure
**Authoritative template for all client-facing proposals | Internal Use Only**

---

## Core Principle

Every DataSkate proposal must lead with the client's AI transformation journey — not with pricing, not with integrations. Pricing and scope answer *how*; the journey answers *why*.

The primary message: **We are not selling integrations. We are selling the foundation for AI-enabled operations.**

Integrations (the flows we scope and build) are Stage 1. The proposal must make clear what Stage 2 and Stage 3 look like for *this specific client* — with real examples drawn from their business context, not generic statements.

---

## Mandatory Section Order

1. **Header** — client name, tagline about their AI journey (never just "connecting systems"), date, architect, flow count
2. **The Challenge** — 3–4 specific pain points grounded in scoping notes; quote concrete details from calls
3. **The Solution** — MuleSoft as the hub; SVG architecture diagram; one line on managed service
4. **Your Journey to AI-Enabled Operations** — three-stage arc (see below)
5. **Proposed Integrations** — flow-by-flow cards with source → target, complexity badge, business value
6. **What You Get** — operational outcome cards; last card is always AI-Ready Foundation
7. **ROI / Business Case** *(conditional)* — include when specific numbers from scoping justify it; skip if no hard data
8. **Delivery Timeline** — weeks by phase; final phase references Year 2 automation roadmap
9. **Investment** — intro paragraph leads with transformation value; pricing models follow; rate schedule table
10. **What's Included** — managed service scope (6 standard items)
11. **About DataSkate** *(optional)* — include for first-time clients or when AE is new to DataSkate; omit for repeat clients
12. **What's Not Included** — explicit out-of-scope list; always include; minimum 4 items, client-specific
13. **Key Assumptions & Dependencies** — what must be true before development begins; use table format (assumption, owner, when needed)
14. **Next Steps** — 4 steps in horizontal flow; last step always references Year 2 plan alongside go-live

**Do not lead with pricing.** Pricing is Section 9 of 14 (or 9 of 13 when ROI/Business Case is skipped).

---

## The Three-Stage Journey Section

This is the most important section. Every proposal must have it. Populate with client-specific examples — never use generic filler.

### Stage 1 — Connected (Year 1 · The flows in this proposal)
CSS class: `stage1` (background `#FFF0F0`, top border `var(--brand)` red `#ed1c24`)
Badge label: `Starting Now` (CSS class: `current`)

What to write here: the specific operational outcomes from these flows, in plain business terms. Not "integrations are built" — name the person who stops doing the manual task, or the backlog that clears on day one. Source from the client's actual pain points in scoping.

### Stage 2 — Automated (Year 1–2 · Built on Stage 1)
CSS class: `stage2` (background `#F0FFF6`, top border `var(--green)` `#2E9E6B`)
Badge label: `Year 1–2` (CSS class: `next`)

What to write here: rules and triggers that fire automatically once Stage 1 data is reliable. These are specific business scenarios, not technical features:
- A status change in System A triggers action in System B without human touch
- An anomaly detected → alert sent before it becomes a problem
- A manual sorting/routing task that disappears because rules handle it

Source from the client's biggest manual/repetitive processes mentioned in scoping.

### Stage 3 — Agentic (Year 2+ · AI acting on connected data)
CSS class: `stage3` (background `#F2F4F8`, top border dark navy `#1C2B3A`)
Badge label: `Year 2+` (CSS class: `next`)

What to write here: AI agent actions specific to this client's domain. Must be grounded in the data their Stage 1 flows will create. Examples by vertical:

**Healthcare GPO / Member Organizations:**
- Agents surface at-risk members before they churn (utilization drop + engagement drop)
- Anomalies in vendor utilization reports flagged before vendors report them
- Next-best-action for sales reps based on purchase patterns and certification status

**Home Services / Contractor (e.g. fencing, HVAC, roofing):**
- AI monitors job cycle times across ERP and CRM — surfaces at-risk installs before customer complaints
- Contract compliance patterns scored over time — high-error reps identified for coaching
- Seasonal demand signals from lead volume alert operations proactively

**Manufacturing / Distribution:**
- Agents flag inventory anomalies across ERP and order management
- Demand signals from CRM feed proactive procurement recommendations
- Agents monitor SLA compliance and escalate before breach

**SaaS / Tech:**
- Agents detect trial-to-paid conversion risk and surface to account team
- Usage pattern monitoring triggers proactive CSM outreach

### Closing line for the journey section
Always end with this verbatim:
> *"The 2-year managed service is how [Client] gets from Stage 1 to Stage 3 without rebuilding anything. The architecture we lay down in week one determines what is possible in year two. No other integration partner structures an engagement with this arc in mind."*

---

## Investment Section — Two Models Only

Do not open with model names. Open with the transformation value paragraph first.

Every proposal shows exactly **two models**. All rates, fees, and payment schedules are computed from `commons/sales/pricing-model.md` — do not hardcode numbers here.

**Model 1 (recommended): IaaS / Managed Service**
- Implementation: $0 — included in monthly rate
- Headline number: 2-year managed service total (computed from pricing-model.md)
- Sub-figures: $0 implementation badge (green) + Period 1 six-month payment

**Model 2: Implementation Only**
- Implementation fee: per-flow rate from pricing-model.md
- Headline number: the total implementation fee
- No ongoing DataSkate service

**Headline numbers must be visually distinct** — IaaS 2-year total vs OTB one-time fee. Never the same dollar amount on both cards.

### Rate schedule
Always show all 4 periods. Rates, escalation %, and payment cadence come from pricing-model.md. All integration code is owned by the client in their GitHub repo.

---

## What You Get — Last Card Rule

The last outcome card in the "What You Get" grid must always be **AI-Ready Foundation**, not an operational metric. Use:

> **AI-Ready Foundation** — Clean, connected, well-maintained data infrastructure is what AI agents need to operate. Every flow we build is a pipeline an AI agent will eventually use — built right from the start.

This anchors the operational outcomes back to the strategic destination.

---

## What's Not Included — Standard Items

Always include a minimum of 4 out-of-scope items, all client-specific. Standard categories:
- Platform/middleware the client owns (Salesforce object design, ERP field config, email template design)
- Third-party prerequisites that are not DataSkate's responsibility (CE Live Service, IDP model training, Shopify webhook setup)
- Historical data migration (this engagement handles net-new data from go-live forward)
- Vendor or partner operational tasks (HD Portal test lead management, Gravity Forms license upgrade, etc.)

---

## Key Assumptions — Table Format

Always use table format with three columns: **Assumption**, **Owner**, **When Needed**.

Owner badge CSS classes:
- `.owner-client` (blue) — client admin action
- `.owner-ds` (green) — DataSkate action
- `.owner-both` (purple) — joint effort
- `.owner-vendor` (amber) — third-party or partner

P0 blockers (hard blockers to development) go first in the table. Flag them explicitly in the assumption text.

---

## Timeline Calculation

```
Total weeks = 2 (requirements) + (N flows × 1.5) (development) + 2 (UAT) + 1 (go-live)
```

Round up to nearest whole week. Add buffer notes for known coordination dependencies (e.g. CE Live Service, IDP configuration, HD Portal write endpoint confirmation) in the timeline body text — do not inflate the week count for these.

---

## Diagram — SVG Architecture

Use the SVG pattern from the MRN reference (inline SVG, viewBox, no external assets):
- Left column: source system boxes — `fill:#fff; stroke:#C9302C` (red stroke, class `sv-src`)
- Center: MuleSoft hub — `fill:#E31F26` (red fill, class `sv-hub`), label "MuleSoft / DataSkate Managed"
- Right column: target system boxes — `fill:#fff; stroke:#2E9E6B` (green stroke, class `sv-tgt`)
- Connector lines: `stroke:#C8CACC` (gray, class `sv-line`)
- Source labels: `fill:#C9302C` red; target labels: `fill:#2E9E6B` green; hub label: `fill:#fff` white

For bidirectional flows: note bidirectionality in the diagram caption text, not by adding double arrows (keeps the SVG clean).

---

## Reference Implementations

- `projects/mrn-healthcare/intake/proposal-mrn-healthcare.html` — MRN Healthcare, May 2026, 10 flows, IaaS + One-Time models. Healthcare GPO vertical. ROI/Business Case section included (specific ARR numbers from scoping). CSS source of truth.
- `projects/peerless/intake/proposal-peerless.html` — Peerless Fence, May 2026, 7 flows, Standard + One-Time models, new AE intro pricing. Home services / contractor vertical. Key Assumptions table with P0 blockers (CE Live Service, HD Portal write endpoints). ROI section omitted (no specific volume data from scoping).

---

## What This Proposal Is NOT

- Not a cost-comparison document ("we're cheaper than a developer hire")
- Not a feature list ("here are 10 integrations we will build")
- Not an IT scope document (keep technical detail in the flow cards only)
- Not a commitment to AI delivery — Stage 2 and Stage 3 are painted as the trajectory, not contracted deliverables in Stage 1

The proposal's job is to help the client see where they are going, and understand that Stage 1 is how they start that journey.

---

*DataSkate — dataskate.ai | vivek@dataskate.ai*
