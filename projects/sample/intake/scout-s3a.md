# Scout Session 3a Handoff — Vertex Cloud Solutions — 2026-04-24
**Status:** READY-FOR-SESSION-3B

---

## 1. Session 3a Inputs Loaded

| Input | File | Key Fields Consumed |
|-------|------|---------------------|
| Company context | `projects/sample/company_context.json` | confirmedFlows[], aiJourney, psychologyProfile, competitorFOMO |
| Project metadata | `projects/sample/project.json` | architect, architectEmail, flowCount, pricingComputed |
| Questionnaire | `projects/sample/intake/intake-questionnaire-sample.md` | Pre-filled answers (q-01 through q-08) |
| Proposal structure | `commons/sales/proposal-structure.md` | Section order, Stage 3 writing rules, authenticity rules |
| About DataSkate | `commons/sales/about-dataskate.md` | Static company narrative (5 paragraphs) |

---

## 2. Psychology Profile Applied

**Primary:** roi-analytical (6 signal matches, high confidence)
**Secondary:** operational-pragmatist (4 signal matches)

**Content modifiers applied:**

| Modifier | Rule Applied | Evidence in Output |
|----------|-------------|-------------------|
| challengeFraming | Open with $400K ARR figure before naming the manual process | Challenge lead sentence starts "$400K+" |
| fomoFirstField | Lead FOMO card with savings amount before company name | "11 hrs/week recovered" opens the anonymized card |
| journeyFraming | Stage 1 items cite specific stopped behaviors + time outcomes | "account managers see billing health in the tool they live in" |
| closingLineVariant | ROI-analytical: managed service rate vs. cost of staying manual | Closing line: "the cost of staying manual vs. the monthly service rate" |
| roiSection | Include explicit ROI section with client-derived stats | ROI section present; $400K stat is Sarah's own estimate |

---

## 3. Challenge Section

**Lead anchor:** Sarah's $400K deferred ARR estimate used verbatim as the opening figure (per roi-analytical modifier — anchor in a number they recognized when they said it).

**Cards generated from transcript:**
1. "Deal-to-Invoice Lag" — 48-hour relay, verbatim reference to manual NetSuite entry
2. "No Billing Visibility in HubSpot" — AM discovers overdue on renewal call (Sarah's exact scenario)
3. "Renewal Blind Spots" — Two lost renewals, 90-day window, NetSuite/HubSpot disconnect (Sarah's words)

---

## 4. Journey Framing (3-Stage)

| Stage | Headline | Frame Decision |
|-------|----------|----------------|
| Phase 1 — Connected | "Closed-Won to Invoiced Without the Relay" | Named the relay specifically (sales→finance→NetSuite); outcome in minutes |
| Phase 2 — Automated | "Revenue Health Monitoring, Automatic Escalations" | Named the 30/60/90-day escalation ladder; renewal auto-create in HubSpot |
| Phase 3 — Agentic | "Revenue Questions That Answer Themselves" | Three specific operational questions Vertex would recognize; Monday reconciliation is Derek's exact pain |

**Stage 3 specific questions written (not generic AI language):**
- "Which of Vertex's 80 accounts has an overdue invoice AND no HubSpot activity in 30 days — surfaced every Monday morning"
- "Which closed-won deals from last quarter still have no NetSuite subscription created — and how much ARR is sitting unrecognized right now"
- "The weekly finance reconciliation between HubSpot pipeline and NetSuite actuals runs automatically and flags only the deals where the numbers don't match"

**Why these:** All three are derived directly from Derek's Monday reconciliation pain and Sarah's renewal blind-spot stories. No AI noise words used. Each names a specific operational question AI answers, removing a specific decision from a human's plate.

---

## 5. FOMO / Peer Comparison

**Selection rationale:**

| Entry | Type | Decision | Reason |
|-------|------|----------|--------|
| B2B SaaS company (anonymized) | Client story | No `sourceUrl` → anonymized | DataSkate client; no public case study exists |
| MuleSoft 2024 Connectivity Benchmark | Industry stat | Include with `sourceUrl` | Public report; HubSpot→NetSuite pattern validated |
| Salesforce State of Sales 2024 | Industry stat | Include with `sourceUrl` | Quantifies reps-on-manual-entry penalty; roi-analytical audience |

**Naming rule applied:** Real company name only when `sourceUrl` is a real, working, public URL the client can click and verify. Anonymous client entry uses `displayName = "B2B SaaS company (anonymized)"`.

**fomoAngle differentiation check:**
- Anonymous client card → Monday reconciliation auto-run (Year 2 ops angle)
- Stage 3 items → specific account-risk questions answered Monday morning (Year 2 data questions angle)
- These are different angles on the same foundation — no repetition of identical AI use case. ✓

---

## 6. Authenticity Self-Check

Before writing each section, Scout verified:

| Check | Status |
|-------|--------|
| Every claim traceable to transcript quote or confirmed system fact | ✓ |
| No phrase could appear unchanged in a generic B2B SaaS proposal | ✓ |
| "48 hours" — Sarah's exact words used | ✓ |
| "$400K deferred ARR" — Sarah's own estimate, not Scout's | ✓ |
| "80 accounts" — Derek's exact number | ✓ |
| "Monday reconciliation" — Derek's exact pain point | ✓ |
| "on a renewal call — in front of the customer" — Sarah's exact words | ✓ |
| Stage 3 items name Vertex-specific entities (accounts, closed-won deals, NetSuite subscriptions) | ✓ |
| No banned phrases used | ✓ (checked: no "leverage AI," "digital transformation," "seamless," "future-proof," "unlock insights," "single source of truth," "data contracts") |

---

## 7. ROI Section

**Stats included:**
- `$400K+` — deferred ARR recognition per quarter at current lag (Sarah's estimate, validated by Kailash math)
- `3.2×` — faster invoice-to-cash, industry median with CRM-billing integration (MuleSoft benchmark)
- `18 hrs/wk` — finance ops recovered at comparable companies post-integration (anonymized client data)

**Attribution:** $400K labeled as "your own estimate" in Section 4 of proposal to avoid false precision. Stats framed as directional, not guaranteed.

---

## 8. Flows Section

| Flow | Route | Value Proposition Written |
|------|-------|--------------------------|
| Deal-to-Subscription | HubSpot → MuleSoft → NetSuite | Eliminates 48-hour relay; provisioning begins in minutes |
| Invoice & Payment Sync | NetSuite → MuleSoft → HubSpot | AMs see billing health without NetSuite access; overdue surfaces before renewal call |
| Revenue Alerts | NetSuite → MuleSoft → Slack | Billing events → Slack; no dashboard monitoring required |

---

## 9. Session 3a Output Written

| File | Status |
|------|--------|
| `projects/sample/intake/proposal-content.json` | ✓ Written |
| `projects/sample/company_context.json` | Updated: `competitorFOMO[]` populated |

---

**Next:** Session 3b — Intake HTML build. Run `node commons/branding/fill-template.js proposal sample` to render `proposal-sample.html` from `proposal-content.json` + `proposal-template.html`. Then run `fill-template.js intake sample` to render `intake-questionnaire-sample.html` from `intake-content.json`.
