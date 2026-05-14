# DataSkate MuleSoft Integration Services — Pricing Model
**Version 1.2 — May 2026 — Internal & AE Use**

---

## Two Models. That's It.

| Model | Implementation Fee | Ongoing | How It Works |
|---|---|---|---|
| **IaaS (Managed Service)** | **$0** — included in monthly rate | $300/flow/month · 1-year minimum | DataSkate builds and runs everything. Client pays nothing upfront. |
| **Implementation Only** | See rate table below | None — code ownership transfers | DataSkate builds and hands off. Client pays once. |

Every proposal shows exactly these two models. No hybrids, no bundles, no custom structures.

---

## IaaS Model

- **Implementation:** $0 — included in the monthly managed service rate
- **Rate:** $300/flow/month (Period 1), escalating 5% every 6 months
- **Minimum term:** 1 year per flow from go-live
- **Payment cadence:** Upfront every 6 months (2 payments over 1 year)
- **Billing starts:** At go-live — not at contract signing
- **What's covered:** Build, deployment, 24/7 monitoring, incident response, connector upgrades, minor enhancements, code ownership, AI roadmap

The $300/flow/month rate absorbs the implementation cost. There is no separate upfront charge beyond the kickoff retainer.

### IaaS Kickoff Retainer

A non-refundable retainer is due at SOW signing before any work begins. It covers the requirements and scoping phase and is credited against the first 6-month payment at go-live.

| Engagement Size | Retainer |
|---|---|
| 1–5 flows | $2,500 |
| 6–10 flows | $5,000 |
| 11+ flows | $7,500 |

- Non-refundable if client cancels before go-live
- Fully credited against first 6-month payment if project proceeds
- Billing (monthly rate) begins at go-live — retainer bridges the development gap

---

## Implementation Only Model

Client pays the implementation fee once. Code ownership transfers at go-live. No ongoing DataSkate service — future phases scoped separately.

| Condition | Implementation Price |
|---|---|
| Standard | $3,500 / flow |
| AE sells full $50K Anypoint license | $0 — same as IaaS model |

### Implementation Only Payment Schedule

| Milestone | Amount | When |
|---|---|---|
| SOW signed | 50% of total fee | Before work begins |
| UAT sign-off | 50% of total fee | After client approves testing |

Both payments are non-refundable once the milestone is reached. If client cancels before UAT, the first 50% is forfeit and any completed work beyond requirements is billed as a cancellation fee at the change order Extension rate.

---

## Implementation Timeline

Same for both models.

| Phase | Duration |
|---|---|
| Requirements & Analysis | 2 weeks (flat) |
| Development & Testing | 1.5 weeks per flow |

**Examples:**
- 5 flows → 2 + 7.5 = **9.5 weeks**
- 7 flows → 2 + 10.5 = **12.5 weeks**
- 10 flows → 2 + 15 = **17 weeks**

---

## IaaS Rate Schedule

| Period | Months | Rate / Flow / Month | 6-Month Payment (5 flows) | 6-Month Payment (7 flows) | 6-Month Payment (10 flows) |
|---|---|---|---|---|---|
| Period 1 | 1–6 | $300.00 | $9,000 | $12,600 | $18,000 |
| Period 2 | 7–12 | $315.00 | $9,450 | $13,230 | $18,900 |
| **1-Year Total** | | | **$18,450** | **$25,830** | **$36,900** |

Rate escalation applies to all active flows every 6 months. No discounts, no exceptions. Early termination not permitted within the 1-year term.

---

## Pricing Examples

**Example 1 — IaaS, 7 flows (Peerless model)**
- Implementation: **$0**
- 6-month payment Period 1: 7 × $300 × 6 = **$12,600**
- 1-year total: **$25,830**

**Example 2 — Implementation Only, 7 flows**
- Implementation: 7 × $3,500 = **$24,500**
- Ongoing: **$0**

**Example 3 — IaaS, 10 flows (MRN model — AE sells $50K license)**
- Implementation: **$0**
- 6-month payment Period 1: 10 × $300 × 6 = **$18,000**
- 1-year total: **$36,900**

**Example 4 — Implementation Only, 6 flows (Standard)**
- Implementation: 6 × $3,500 = **$21,000**
- Ongoing: **$0**

---

## Scope Lock

Development does not begin until the client signs off on a scope document produced during the requirements phase. This gate protects both parties.

- Requirements phase (2 weeks, covered by retainer) produces a written scope doc
- Client signature required before build phase starts
- Any change after scope sign-off triggers a change order — no exceptions
- Scope sign-off is a contract milestone; DataSkate is not obligated to begin development until it is complete

---

## Change Orders

Monthly rate covers the existing flow as scoped and signed. Any change to what the flow does — not just how it does it — requires a change order.

**Rule of thumb:** Does this change *what* the flow does? Change order. Does it change *how* it does it (config, tuning)? Included.

| Tier | What It Covers | Flat Fee |
|---|---|---|
| **Config** | Field mapping updates, filter value changes, credential rotation, performance tuning | Free — included |
| **Modification** | New transformation logic, new condition/branch, additional field requiring new transform | $750 |
| **Extension** | New object type added to existing flow, one-directional becomes bidirectional, new secondary system added | $1,500 |

Change orders are scoped and quoted in writing before work begins. Client approves before DataSkate proceeds.

When a change is too significant for any of the above tiers — new trigger, new target, fundamentally different business process — it is a **flow replacement**, not a change order. See Flow Replacement section below.

---

## Flow Replacement (IaaS only)

When a flow's scope changes so significantly that it amounts to a different flow entirely — new trigger, new target system, new business process — it is treated as a replacement, not a change order.

**How it works:**
1. Old flow is decommissioned — its contract closes
2. Client pays a one-time **replacement fee: $1,500** (covers DataSkate's rebuild effort and unamortized development cost on the old flow)
3. New flow starts a **fresh 12-month contract** at the current catalog rate — billing continues without interruption

| | Client Gets | DataSkate Gets |
|---|---|---|
| Old flow closes | Contract ends cleanly | $1,500 replacement fee |
| New flow starts | Full 12-month contract at current rate | Full year of MRR on new build |

**Why this is better than inheriting the remaining term:**
- Client gets a full year on the new flow, not just whatever was left on the old one
- DataSkate is compensated for rebuilding, not penalised for a mid-contract business change
- No rate increase — the $1,500 fee is the cost of replacement, not a reason to elevate ongoing billing

If the client wants to decommission a flow with **no replacement**: remaining balance on the old contract accelerates and is payable immediately as a lump sum. The answer to "we don't need this anymore" is always: replace it with something you do need.

---

## Flow Addition Mid-Contract (IaaS only)

1. New flow scoped at the **current catalog rate** at time of activation
2. New flow starts its own independent **1-year term** from go-live
3. Payment schedule is **independent** of existing flows
4. Original flows unaffected — rate and term unchanged

---

## Rules & Policies

- **Decommissioning a flow does not cancel its payment obligation.** The 1-year term per flow is a contract commitment. If a flow is decommissioned before term end, remaining balance accelerates and is payable immediately — unless a flow replacement is agreed (see Flow Replacement section), in which case the $1,500 replacement fee applies and a fresh 12-month contract starts.
- **Client has in-house developer and will self-maintain:** Always propose Implementation Only (standard per-flow rate). Do not push IaaS — the managed service value proposition does not apply if the client is staffed to own operations. Scope the build, hand off the code, done. Then pivot to Phase 2: position agent development and automation roadmap as a follow-on SOW. Their developer runs the integration layer; DataSkate builds the intelligence layer on top. See architect-guide.md — "When the Client Self-Maintains" section.
- No bundling discounts across flows
- No multi-year prepay discounts — 6-month upfront is the only payment cadence
- Contract renewal after 1-year term: renegotiated at then-current catalog rate, new 1-year term required
- All integration code is owned by the client and lives in their GitHub repository

---

*DataSkate — 196 Princeton Hightstown Road, Building 2A Suite 11, West Windsor NJ 08550 — dataskate.ai*
