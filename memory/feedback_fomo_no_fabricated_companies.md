---
name: feedback_fomo_no_fabricated_companies
description: "Peer comparison / FOMO section must never use real company names with fabricated metrics — anonymize client stories, cite industry sources with hyperlinks"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 5183b83c-e5aa-43a1-90d3-e84523431b84
---

Never put real company names in the proposal FOMO/Peer Comparison section without a real public source URL. If a client Googles the company name and finds no matching case study, it destroys trust and DataSkate's credibility.

**Why:** Vivek flagged this directly — "if client believe we are f*king data, it will be reversed."

**How the pipeline works:**
- Vera (pipeline agent 2) does real web research → populates `vera.json competitorFOMO[]` with `sourceUrl`, `sourceLabel`, and `displayName`; orchestrator merges into `company_context.json`
- Petra (agent 7) copies those entries into `proposal-content.json fomo[]` including `sourceUrl` + `sourceLabel`
- fill-template.js renders: if `sourceUrl` exists → company name is a clickable link (`.fomo-co-link`) proving the claim; if no `sourceUrl` → anonymized name shown as plain text

**Naming rule (enforced in vera.toml and petra.toml):**
- Real company name → ONLY when `sourceUrl` is a real, working, public URL the client can click and verify
- No public source → `displayName` = "A {industry} company (anonymized)"
- Industry-stat entries → use analyst/report name (e.g. "MuleSoft 2024 Benchmark") with `sourceUrl` to the report page

**CSS:** `.fomo-co-link` (brand color, linked); `.fomo-source` (italic footer for industry-stat source label)
