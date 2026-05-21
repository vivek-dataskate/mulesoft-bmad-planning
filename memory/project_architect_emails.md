---
name: project-architect-emails
description: Architect email lookup table — used by Scout onboarding and all client-facing HTML/proposals
metadata: 
  node_type: memory
  type: project
  originSessionId: 34a31019-8a56-44a9-b35f-7dbbd672419d
---

Two architects available for assignment. Selection happens during Scout onboarding (numbered choice, not free-text).

| Architect | Email | Default? |
|---|---|---|
| Kailash Chanda | kailash@dataskate.ai | Yes — default for new engagements |
| Raghuram Potluri | raghuram@dataskate.ai | CE/legacy-ERP engagements |

**Why:** Vivek asked that architect email is derived from the selection, not typed manually, to avoid errors.

**How to apply:**
- `orchestrate.js` onboarding stores both `architect` (display name) and `architectEmail` (email) in `project.json` via the numbered picker prompt.
- When generating intake HTML or proposals: read `project.json` → use `architectEmail` in the CC field and proposal footer.
- Never hardcode a specific architect email in templates or HTML — always derive from `project.json`.
- Vivek's email (`vivek@dataskate.ai`) is ALWAYS included alongside the architect email in CC fields.

[[project-team-roles]]
