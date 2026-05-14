---
name: feedback-intake-template-frozen
description: intake-template.html is frozen — do not modify without explicit user approval
metadata: 
  node_type: memory
  type: feedback
  originSessionId: cd8625dd-3d05-4809-8685-c4739b4ea130
---

`commons/templates/intake-template.html` is frozen as of 2026-05-14. The approved design baseline includes: collapsible section tiles (details/summary), compact Q grid (28px | 1fr), sticky bar with logo + submit, UC details/summary, white-page standards throughout.

**Why:** User reviewed the sample intake output and said "i like what we have now in sample project, can you freeze this and stop any more modifications to it". This is the approved client-facing design.

**How to apply:** Before making any CSS or structural change to intake-template.html, explicitly warn the user: "intake-template.html is frozen — this change will modify the approved baseline. Proceed?" Do not edit the file until the user confirms. Log the change in the freeze notice in CLAUDE.md and template-registry.json.
