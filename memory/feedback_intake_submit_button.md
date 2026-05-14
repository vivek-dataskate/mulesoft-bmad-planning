---
name: feedback_intake_submit_button
description: "Intake forms use Firebase submit (not email/mailto) — button is Submit to DataSkate, not Email/Send"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 41b85d1a-91a2-40ce-8ee1-070b0bd9aaa3
---

Intake form primary action is **Submit to DataSkate** (saves to Firestore). No mailto, no email config strip.

**Why:** Firebase captures all responses; the old mailto was a workaround before Firebase existed. It was redundant and unreliable (8000-char truncation, no real attachment).

**How to apply:**
- Sticky bar buttons: `[Print / Save PDF]` (outline, left) · `[Submit to DataSkate]` (primary, right)
- Bottom of form: large centered `[Submit to DataSkate]` button + `.submit-success` banner
- `submitForm()`: validate required fields (warn, don't block) → Firestore save → show green success banner
- No config strip (no To/CC email fields) in the sticky bar
- Full spec in `commons/branding/HTML_DESIGN_STANDARDS.md` Sticky Action Bar section
