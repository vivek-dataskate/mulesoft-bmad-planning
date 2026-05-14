---
name: Scout always runs first — scoping folder is the entry point
description: Workflow preference for when to use Scout vs. jumping straight to Analyst
type: feedback
originSessionId: efd32474-a4c7-4ef1-9a82-f83052417c41
---
Always run Scout first, regardless of what documents are available. Scout reads from projects/{client}/scoping/ and decides whether there is enough information to proceed to the Analyst, or whether more clarification is needed.

**Why:** The user does not control what information is provided before files arrive. Scout acts as the gate — it infers systems, generates the intake questionnaire, identifies blockers, and signals readiness for the Analyst. Jumping straight to the Analyst skips this gate and risks missing system-specific gotchas and open items.

**How to apply:**
- When starting any new client project, first move/copy all pre-sales documents (transcripts, slides, emails, SPM briefs) to projects/{client}/scoping/
- Run the bmad-agent-scout skill against the scoping folder
- Scout writes intake-questionnaire.md to projects/{client}/intake/
- Only after Scout completes (and the questionnaire is written) proceed to the Analyst
- Scout's "Internal Flags" section indicates whether there are blockers that must be resolved before the Analyst can write a complete PRD
