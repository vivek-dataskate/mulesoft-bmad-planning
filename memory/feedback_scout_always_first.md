---
name: Scout pipeline always runs first — scoping folder is the entry point
description: Workflow preference for when to run the scout pipeline vs. jumping straight to Analyst
type: feedback
originSessionId: efd32474-a4c7-4ef1-9a82-f83052417c41
---
Always run the scout pipeline first, regardless of what documents are available. The pipeline reads from `projects/{client}/scoping/` and produces all pre-sales deliverables before the Analyst, Architect, or PM are invoked.

**Why:** The pipeline acts as the gate — it infers systems, generates the intake questionnaire, proposal, integration deck, and corporate brief, and signals readiness for the Analyst. Jumping straight to the Analyst skips this gate and risks missing system-specific gotchas and open items.

**How to apply:**
- Drop all pre-sales documents (transcripts, slides, emails, SPM briefs) into `_inbox/`
- Run: `node pipeline/scout/orchestrate.js` (interactive) or `node pipeline/scout/orchestrate.js --client {slug}` (resume)
- The pipeline runs 9 agents: Sage→Vera→Rex→Ivy→Flo→Hawk→Petra→Quinn→Mira
- After Mira completes, all deliverables are in `projects/{slug}/intake/client/` and deployed to Firebase
- Only after the full pipeline completes should the Analyst be invoked for PRD work

**Entry point:** `pipeline/scout/orchestrate.js`
