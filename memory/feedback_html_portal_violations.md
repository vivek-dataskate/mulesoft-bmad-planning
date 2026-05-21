---
name: feedback_html_portal_violations
description: "Portal/dashboard HTML repeatedly violated white-page standards — dark headers, gray body, card sections, circle numbers, off-palette vars"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 98fc27ca-f1df-49aa-9e45-b04d41fcdeb8
---

Never apply a "dashboard exception" to HTML design standards. All HTML files — portals, intake forms, proposals, sales materials — must follow the same white-page standards.

**Why:** Client engagement portals were built with dark headers, gray page backgrounds, circle section numbers, card-style sections, and off-palette CSS vars (`--blue`, `--gray`). Every one of these violates HTML_DESIGN_STANDARDS.json. The lint hook was only covering `commons/sales/` so portals escaped validation.

**How to apply:**
- Before writing any HTML, read `commons/branding/HTML_DESIGN_STANDARDS.json`
- After writing any HTML, the lint hook will fire automatically — if it reports violations, fix them immediately
- Specific patterns to avoid every time:
  - `.header { background: var(--dark) }` — dark header → must be white
  - `body { background: #F5F5F5 }` — gray body → must be `#fff`
  - `.section-num` with `border-radius:50%` + background fill → plain red text only
  - `.section` with `border-radius` → flat sections with border-bottom only
  - Any custom CSS var (`--blue`, `--gray`, etc.) not in the standard 11-var palette

See also: [[reference_html_design_standards]], [[feedback_html_single_source]]
