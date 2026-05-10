RESEARCH PHASE           [x] COMPLETE (2026-05-10)
CHUNK 1 — Repo Foundation[x] COMPLETE (2026-05-10)
CHUNK 2 — Standards Doc  [x] COMPLETE (2026-05-10)
CHUNK 3 — Scenario Files [x] COMPLETE (2026-05-10)
CHUNK 4 — BMAD Agents    [ ] NOT STARTED
  SCOPE UPDATED 2026-05-10:
  + Analyst: API Contract Discovery Protocol (trigger, GET-first, POST iteration, gap questions)
  + Analyst: reads FIELD_KNOWLEDGE.md; produces api-discovery/{system}-contract.md
  + Architect: reads FIELD_KNOWLEDGE.md before decision tree; applies verified entries
  + Architect: writes scaffold.profile to decisions.json
  + All agents: reads FIELD_KNOWLEDGE.md at session start
  + Dev: references api-discovery contracts if present
CHUNK 5 — BMAD Templates [ ] NOT STARTED
  SCOPE UPDATED 2026-05-10:
  + architecture-template.md must include per-flow Field Mapping table
    (Source Field | Source System | Target Field | Target System | Transform Rule)
  + architecture-template.md must include per-flow Business Rules section
    (client-confirmed constants, conditionals, lookup values — copied into DWL comments)
  + architecture-template.md must include per-flow Open Items section
    (unresolved fields developer must confirm with client in sprint 1)
  + These tables feed Chunk 8 scaffold generator — without them, DWL TODOs are generic
CHUNK 6 — Story Library  [ ] NOT STARTED
CHUNK 7 — XML+DWL Tmpl   [ ] NOT STARTED
CHUNK 8 — Scaffold Gen   [ ] NOT STARTED
  SCOPE UPDATED 2026-05-10:
  + Profile selection: minimal/standard/enterprise/regulated (computed from decisions.json)
  + MUnit stubs pre-scaffolded with happy path + 2 error scenarios per flow
  + Coverage floors enforced by pattern (80%/75%/60%) — NOT 100%
  + Wire-tap generated when profile=enterprise or regulated
  + Claim-check stub generated when payload>1MB indicated
  + Regulated profile: always generates field-encryption + audit-trail flow
CHUNK 9 — Client Repo Sh [ ] NOT STARTED
CHUNK 10 — E2E Test      [ ] NOT STARTED

NEW ARTIFACT 2026-05-10:
docs/FIELD_KNOWLEDGE.md  [x] CREATED — architect training + lesson accumulation system
