---
name: Scout and Mary must infer potential additional flows — not just list what the deck says
description: Behavioral preference for flow completeness checking in both Scout and Analyst
type: feedback
originSessionId: efd32474-a4c7-4ef1-9a82-f83052417c41
---
Always run a flow inference / flow completeness check — do not limit flows to what the sales deck or scoping call explicitly listed.

**Why:** The 5 flows in the LeoLabs deck were the Salesforce Account Team's scoping, not necessarily everything LeoLabs needs. Sales decks capture what was discussed, not everything needed. Missing a flow that surfaces in Sprint 3 costs weeks. The user wants Scout and Mary to proactively surface potential additional flows and ask the client to confirm in/out of scope.

**How to apply:**
- Sage (pipeline agent 1): extracts all mentioned flows; Flo (agent 5) reconciles and applies the no-combine rule — each system instance = one flow. Both agents flag potential additional flows based on standard entity categories for the system pair.
- Mary (Analyst): before writing the PRD flows table, cross-check all intake docs against standard entity types for the system pair. Add gaps as Non-Blocker open items with scope-confirmation questions. Add a "Potential Future Flows (Phase 2)" section for likely phase-2 items.
- Both pipeline and Analyst: never silently limit to what a sales deck says. Always surface gaps. The client can say "out of scope" in 10 seconds.
- Flo's no-combine rule is encoded in `pipeline/agents/flo.toml`.
