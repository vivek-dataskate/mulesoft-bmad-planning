---
name: feedback_intake_scout_only
description: The intake questionnaire MD file must never be manually edited — it is generated and owned by Scout only
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7fc32df1-4519-4473-8e2c-43749c99a285
---

The `intake-questionnaire-{client}.md` file is a Scout-generated artifact. It must never be manually edited directly.

**Why:** Manual edits bypass Scout's generation logic, introduce structural inconsistencies (e.g. field mapping in wrong sections), and create divergence from the template that breaks downstream agents (Analyst, Architect).

**How to apply:** If something is wrong in the intake form, fix the Scout agent definition (`_bmad/custom/bmad-agent-scout.toml`) and regenerate via Scout. The only exception is the current MRN file, which was corrected once to fix the Section 1/Section 3 field mapping duplication bug — that bug is now fixed in Scout's toml so it won't recur.
