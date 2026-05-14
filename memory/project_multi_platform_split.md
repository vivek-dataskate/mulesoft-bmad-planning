---
name: Multi-platform BMAD architecture split
description: Vivek's plan to split technology-agnostic scoping/intake from technology-specific platform repos (MuleSoft, Boomi, Workato, n8n)
type: project
originSessionId: b9d5ae47-e6ac-4212-8d4f-368f04f569ac
---
Vivek wants to restructure BMAD so the planning pipeline is split into two tiers:

**Tier 1 — Technology-agnostic (this planning repo):**
Scout → Intake → Analyst → PRD → Validate PRD → Epics & Stories
`stories.md` is the handoff artifact. Sales team can own this tier independently.

**Tier 2 — Technology-specific (separate repos per platform):**
Architect → Scaffold → Developer → Dev agent → Testing framework
One repo per platform: `bmad-mulesoft`, `bmad-boomi`, `bmad-workato`, `bmad-n8n` etc.
Each has its own commons/playbooks, standards, scaffold, and dev agent tuned to that platform.

**Preferred model:** Model 1 — one planning repo + separate technology repos (not monorepo).
Reason: sales team only touches the planning repo; platform standards stay isolated per architect.

**Open design question (unresolved):**
At what step does the technology get selected?
- Option A: Known during Scout → capture in intake form
- Option B: Architect decision post-PRD → needs an explicit "select platform → fork to platform repo" pipeline step

**Why:** Vivek works across multiple integration platforms and wants different architects in their own codespaces. This is not yet being acted on — saved for future revisit.
