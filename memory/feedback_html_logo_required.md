---
name: feedback_html_logo_required
description: DataSkate logo SVG must appear in every HTML document header — intake forms and proposals alike
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4433e80b-56ca-4071-86ce-44aff4cf1b1e
---

Every HTML document (intake questionnaire and proposal) must include the DataSkate wordmark as an inline SVG in the header. This was flagged as a standard violation when the Zyris intake HTML was generated without a logo.

**Why:** The logo is part of the DataSkate brand identity for all client-facing documents. The MRN proposal has it; early intake forms generated without it were flagged as a standard violation.

**How to apply:**
- Copy the SVG verbatim from `projects/mrn-healthcare/intake/proposal-mrn-healthcare.html` (the `<svg viewBox="140 258 590 96"...>` block)
- For **proposals**: logo goes in `.header-top` flex row (left side), eyebrow text floats right
- For **intake forms**: logo goes above the `.eyebrow` div, inside `.doc-header`, in its own `<div style="margin-bottom:16px;">` wrapper
- Height: `32px` for proposals, `28px` for intake forms
- The HTML_DESIGN_STANDARDS.md Header Component section now documents this requirement explicitly
