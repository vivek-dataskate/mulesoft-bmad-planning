# DataSkate — Client Proposal Structure
**Authoritative template for all client-facing proposals | Internal Use Only**

---

## Core Principle

Every DataSkate proposal must lead with the client's AI transformation journey — not with pricing, not with integrations. Pricing and scope answer *how*; the journey answers *why*.

The primary message: **We are not selling integrations. We are selling the foundation for AI-enabled operations.**

Integrations (the flows we scope and build) are Stage 1. The proposal must make clear what Stage 2 and Stage 3 look like for *this specific client* — with real examples drawn from their business context, not generic statements.

---

## Mandatory Section Order

1. **Header** — client name, tagline about their journey (not "connecting systems"), date, flow count
2. **The Challenge** — 3–4 specific pain points grounded in scoping notes; these are Stage 0
3. **The Solution** — MuleSoft as the hub; architecture diagram; one line on managed service
4. **Your Journey to AI-Enabled Operations** — three-stage arc (see below); MRN is the reference
5. **Proposed Integrations** — flow-by-flow list with source → target, complexity, and business value
6. **What You Get** — outcomes from day one; last card should be AI-Ready Foundation
7. **Delivery Timeline** — weeks by phase; final step references Year 2 automation roadmap
8. **Investment** — intro paragraph leads with transformation value; pricing tables follow
9. **What's Included** — managed service scope
10. **Next Steps** — 4 steps; last step references Year 2 plan alongside go-live

**Do not lead with pricing.** Pricing is Section 8 of 10.

---

## The Three-Stage Journey Section

This is the most important section. Every proposal must have it. Populate with client-specific examples — never use generic filler.

### Stage 1 — Connected (Year 1 · The flows in this proposal)
Color: blue (`#0066CC`)  
Badge label: `Starting Now`

What to write here: the specific operational outcomes from these flows, in plain business terms. Not "integrations are built" — "Caralina stops exporting spreadsheets" or "the 55-member onboarding backlog clears on day one." Source these from the client's actual pain points in the scoping notes.

### Stage 2 — Automated (Year 1–2 · Built on Stage 1)
Color: green (`#38A169`)  
Badge label: `Year 1–2`

What to write here: rules and triggers that will fire automatically once Stage 1 is live. These are specific business scenarios, not technical features. Examples:
- Member goes quiet for 90 days → re-engagement sequence starts automatically
- Utilization data drives live segmentation — no weekly exports
- A status change in System A triggers a workflow in System B without human touch

Source these from the client's biggest manual/repetitive processes mentioned in scoping.

### Stage 3 — Agentic (Year 2+ · AI acting on connected data)
Color: purple (`#7C3AED`)  
Badge label: `Year 2+`

What to write here: AI agent actions specific to this client's domain. Must be grounded in the data their Stage 1 flows will create. Examples by vertical:

**Healthcare GPO:**
- Agents surface at-risk members before they churn (utilization drop + engagement drop)
- Anomalies in vendor utilization reports flagged before vendors report them
- Next-best-action for sales reps based on purchase patterns and certification status

**Manufacturing/Distribution:**
- Agents flag inventory anomalies across ERP and order management
- Demand signals from CRM feed proactive procurement recommendations
- Agents monitor SLA compliance and escalate before breach

**SaaS/Tech:**
- Agents detect trial-to-paid conversion risk and surface to account team
- Usage pattern monitoring triggers proactive CSM outreach

### Closing line for the journey section
Always end with:
> *"The 2-year managed service is how [Client] gets from Stage 1 to Stage 3 without rebuilding anything. The architecture we lay down in week one determines what is possible in year two. No other integration partner structures an engagement with this arc in mind."*

---

## Investment Section Framing

Do not open with "three engagement models." Open with the transformation value:

> *"This is the infrastructure investment that takes [Client] from manual operations to AI-enabled workflows. The 2-year managed service means DataSkate has a direct stake in your success — not just in delivering flows, but in making sure they drive outcomes."*

Then present the pricing models.

---

## What You Get — Last Card Rule

The last outcome card in the "What You Get" grid must always be **AI-Ready Foundation**, not an operational metric. Use:

> **AI-Ready Foundation** — Clean, connected, well-maintained data infrastructure is what AI agents need to operate. Every flow we build is a pipeline an AI agent will eventually use — built right from the start.

This anchors the operational outcomes back to the strategic destination.

---

## Reference Implementation

`projects/mrn-healthcare/intake/proposal-mrn-healthcare.html` — MRN Healthcare, May 2026, 10 flows. Full three-stage journey section, correct rate schedule ($150 → $157.50 → $165.38 → $173.64), IaaS + Standard + Introductory models. Use as the base template for all future HTML proposals.

---

## What This Proposal Is NOT

- Not a cost-comparison document ("we're cheaper than a developer hire")
- Not a feature list ("here are 10 integrations we will build")
- Not an IT scope document (keep technical detail in the flow cards only)
- Not a commitment to AI delivery — Stage 2 and Stage 3 are painted as the trajectory, not contracted deliverables in Stage 1

The proposal's job is to help the client see where they are going, and understand that Stage 1 is how they start that journey.

---

*DataSkate — dataskate.ai | vivek@dataskate.ai*
