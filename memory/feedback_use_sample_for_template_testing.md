---
name: feedback_use_sample_for_template_testing
description: Always use the sample project (projects/sample/) when testing template changes or copy changes — never any other client
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 45f62f5d-a137-41de-87db-436e4547e17b
---

Always use `projects/sample/` when regenerating or testing any change to a template (proposal, intake, portal, etc.) or any copy/wording change.

**Why:** The sample project is the designated test harness for the whole process template. Using it keeps test artifacts isolated from real client data.

**How to apply:** After any edit to `commons/templates/*.html` or `commons/branding/fill-template.js`, run:
```
node commons/branding/fill-template.js --template proposal --client sample
```
(or the relevant template type). Never use a real client slug for template testing.
