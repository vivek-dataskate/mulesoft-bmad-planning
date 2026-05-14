---
name: reference_html_design_standards
description: "DataSkate HTML design standards — JSON is authoritative, .md is a human pointer; read JSON before building any HTML"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 46774b27-0204-4fbc-ac4e-d4f3b175d454
---

`commons/branding/HTML_DESIGN_STANDARDS.json` — machine-readable source of truth. Structure:
- `palette.allowedVars` — the 11 CSS vars permitted; `forbiddenVars` list
- `forbidden[]` — each entry has `id`, `rule`, `pattern`, `fix`
- `components{}` — HTML snippets for collapsibleSection, stickyBar, ucBlock, questionBlock, badges, etc.
- `templates{}` — fill command and paths for all 6 template types
- `print.css` — print overrides (force details open, hide sticky-bar)

`commons/branding/HTML_DESIGN_STANDARDS.md` — human-readable pointer ONLY. Do not add rules there.

**Before writing any HTML fragment for a content JSON**, read the JSON for the correct class names and component patterns. Do not invent classes or CSS variables.

Canonical template implementations: `commons/templates/`
