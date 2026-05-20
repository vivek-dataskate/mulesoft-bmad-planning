---
name: feedback-scout-raghuram-patterns
description: "Raghuram Potluri's architect methodology extracted from 4 construction/CE-vertical scoping transcripts (Apr 14–17 2026) — codified into Scout"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 1fc27932-20a1-4b56-8922-bc344fae81cb
---

Deep analysis of Raghuram Potluri's discovery methodology across 4 construction/CE-vertical scoping calls. All patterns codified into `_bmad/custom/bmad-agent-scout.toml` as principles and workflow steps.

**Key patterns extracted:**

1. **Pre-call research overnight** — Found CE Live Service relay topology between Apr 16 and Apr 17 calls. Scout must do web research before generating questions.
2. **Blocker-first every call** — Opens every call: "What's the status on [last blocker]?" P0 blockers go first in questionnaire and proposal assumptions table.
3. **GET-only production guardrail** — If no sandbox: development does GET-only in production. No POST/PUT until UAT sign-off.
4. **Legacy API relay topology** — CE Live Service: MuleSoft → Deltek cloud URL → relay → client VM. Not a standard REST API. Requires vendor support ticket + API version number.
5. **Access chain mapping** — Jean → pw-maintenance → API user creation. Single admin = single point of failure. Always map who owns what.
6. **Sandbox vs production API separately per system** — ComputerEase sandbox has no API access (only production does). Must be asked per system.
7. **Security flags as Internal Flags** — Open SSH/RDP from 0.0.0.0/0 = "really poor practice." Auto-flag any on-premise system with open network access.
8. **Port listening diagnostic** — Uses netstat to verify which port the application actually listens on. Do not assume 443.
9. **Bundling efficiency** — "If CE Live Service call happens, ask about cloud migration in the same call." Combine vendor calls.
10. **Reverse KT before building** — Proposes walking back the business process to validate understanding before development starts.

**Codified as:**
- 3 new principles: Legacy & On-Premise API Topology, Access Chain Mapping, P0 Blocker Identification
- ComputerEase/Deltek entry added to Known System Gotchas
- Workflow Steps 1b (Architect Knowledge Extraction) and 1c (Mandatory Web Research) added
- Step 8 expanded to 4 sub-steps: FK write-back, PLAYBOOK update, PLANNING_CONTEXT Critical Notes, Connector Registry update
- 2 new principles: Mandatory Web Research per System, Architect Insight Extraction from Transcripts

**Why:**
User asked to "do deep analysis on all Raghuram questions starting from first and want us to align our scout agent accordingly." Vivek also wants Scout to continuously learn from architect transcripts and update knowledge base files automatically.

**How to apply:**
All patterns now in Scout toml. When Scout runs on the next engagement, it will:
- Do mandatory web research for every system before generating questions
- Extract architect insights from transcripts and write them to FIELD_KNOWLEDGE.md / {system}_playbook.json / PLANNING_CONTEXT.md
- Flag legacy systems with on-premise topology questions automatically
- Map access chains for every system
- Identify and surface P0 blockers before questionnaire assembly
