# DataSkate MuleSoft Integration Services — Pricing Model
**Version 1.0 — May 2026 — Internal & AE Use**

---

## Engagement Types

| Type | Condition | Implementation Price |
|---|---|---|
| Standard | Existing AE or DS relationship | $3,500 / flow |
| New AE Introductory | AE's first DataSkate deal ever | $10,000 flat (up to 5 flows) |
| New AE — over 5 flows | Same deal, flows 6+ | $10,000 + $3,500 per additional flow |
| IaaS (Free Build) | AE sells full $50k Anypoint license | Free implementation |

**New AE definition:** A MuleSoft AE who has never sourced a deal to DataSkate before. Introductory pricing applies once per AE — second deal onwards is standard.

---

## Implementation Timeline

| Phase | Duration |
|---|---|
| Requirements & Analysis | 2 weeks (flat — all engagements) |
| Development & Testing | 1.5 weeks per flow |

Timeline is fixed regardless of pricing tier. No compression for lower-priced deals.

**Examples:**
- 5 flows → 2 + 7.5 = **9.5 weeks**
- 8 flows → 2 + 12 = **14 weeks**
- 10 flows → 2 + 15 = **17 weeks**

---

## Managed Service Contract

Applies to all engagements. Mandatory on IaaS deals. Strongly recommended on all others.

| Term | Detail |
|---|---|
| Starting rate | $150 / flow / month (Period 1) |
| Rate escalation | 5% increase every 6 months — applies to ALL active flows |
| Minimum duration | 2 years per flow, from go-live date |
| Payment cadence | Upfront every 6 months (4 payments over 2 years) |
| Discounts | None — no exceptions |
| Early termination | Not permitted |
| New flows added mid-contract | Start at the then-current period rate; own independent 2-year term from their go-live |

**How the rate works:** The rate starts at $150 and steps up 5% every 6 months for every active flow. The full 4-period schedule is disclosed in the contract at signing — no surprises at payment time.

---

## Rate Schedule — All Flows, All Periods

| Period | Months | Rate / Flow / Month | 6-Month Payment (5 flows) | 6-Month Payment (10 flows) |
|---|---|---|---|---|
| Period 1 | 1–6 | $150.00 | $4,500 | $9,000 |
| Period 2 | 7–12 | $157.50 | $4,725 | $9,450 |
| Period 3 | 13–18 | $165.38 | $4,961 | $9,923 |
| Period 4 | 19–24 | $173.64 | $5,209 | $10,418 |

---

## What Is Included in the Monthly Rate

| Service | Detail |
|---|---|
| Implementation | Initial build and delivery |
| Uptime monitoring | 24/7 monitoring with incident response |
| Performance management | Latency, throughput, error rate tracking and tuning |
| Notifications & alerting | Alert configuration and ongoing management |
| Upgrades | Connector version upgrades, Anypoint platform compatibility updates |
| Minor enhancements | Field mapping adjustments, configuration tweaks, performance tuning — no action changes |

**Not included (requires new SOW):**

| Out of scope | Example |
|---|---|
| Action changes | New trigger, new target system, new business logic, new object type |
| New flows | Each new flow is a separate engagement at the then-current period rate |
| Major redesign | Architectural changes to an existing flow |

---

## Pricing Examples

**Example 1 — Standard, 6 flows (Period 1)**
- Implementation: 6 × $3,500 = **$21,000**
- 6-month maintenance payment: 6 × $150 × 6 = **$5,400**
- 2-year maintenance total: **$21,600**
- Total engagement value: **$42,600**

**Example 2 — New AE, 5 flows (Period 1)**
- Implementation: **$10,000 flat**
- 6-month maintenance payment: 5 × $150 × 6 = **$4,500**
- 2-year maintenance total: **$18,000**
- Total engagement value: **$28,000**

**Example 3 — New AE, 7 flows (Period 1)**
- Implementation: $10,000 + (2 × $3,500) = **$17,000**
- 6-month maintenance payment: 7 × $150 × 6 = **$6,300**
- 2-year maintenance total: **$25,200**
- Total engagement value: **$42,200**

**Example 4 — IaaS, 10 flows (AE sells $50k license)**
- Implementation: **$0**
- 6-month maintenance payment: 10 × $150 × 6 = **$9,000**
- 2-year maintenance total: **$36,000**
- DS total revenue: **$36,000** (pure recurring, zero delivery cost absorbed)

---

## Flow Addition Mid-Contract

1. New flow is scoped at the **current catalog rate** at time of activation
2. New flow starts its own independent **2-year term** from go-live
3. Payment schedule is **independent** of existing flows
4. Original flows are unaffected — rate and term unchanged
5. Catalog rate creates natural urgency: adding a flow now is cheaper than adding it in 6 months

---

## IaaS Model Logic

| Party | Action | Benefit |
|---|---|---|
| MuleSoft AE | Sells full $50k Anypoint license | Full quota attainment |
| Client | Pays MuleSoft $50k + DS 2-year contract | Zero implementation cost, fully managed |
| DataSkate | Builds free, collects $150/flow/month for 24 months | Recurring revenue + long-term relationship |

---

## Rules & Policies

- New AE introductory pricing applies **once per AE**, not once per client
- No bundling discounts across flows
- No multi-year prepay discounts — 6-month upfront is the only payment cadence
- Emergency escalation clause exists in contract but is never used in normal operations and never mentioned in sales conversations
- Contract renewal after 2-year term: renegotiated at then-current catalog rate, new 2-year term required
- All integration code is owned by the client and lives in their GitHub repository

---

*DataSkate — 196 Princeton Hightstown Road, Building 2A Suite 11, West Windsor NJ 08550 — dataskate.ai*
