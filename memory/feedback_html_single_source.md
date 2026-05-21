---
name: feedback_html_single_source
description: commons/branding/HTML_DESIGN_STANDARDS.json is the only source for all HTML/UI/flyer styling — never invent new CSS patterns
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ff77f889-b4c3-4ef8-b98d-68e137d4d040
---

`commons/branding/HTML_DESIGN_STANDARDS.json` is the single source of truth for all UI output in this system — proposals, intake forms, flyers, portals, or any other HTML document.

**Why:** Previously, the pricing flyer was built with invented CSS colors (`#c0392b`, blue model cards, off-palette grays) instead of the defined DataSkate palette and CSS variables. The standards file already existed and was ignored.

**How to apply:**
- Before writing CSS for any HTML file, read `commons/branding/HTML_DESIGN_STANDARDS.json` first
- Use only the CSS custom properties defined there (`--brand`, `--dark`, `--mid`, `--light`, `--border`, `--green`, `--amber-bg`, etc.)
- Never introduce new color hex values, new class naming conventions, or new layout patterns
- If a new component is genuinely needed, add it to the standards file — don't one-off it in the output file
- This applies to everything: proposals, intake questionnaires, sales flyers, capability portals, email templates

**UI feedback persistence rule:** When the user gives any negative feedback on UI/HTML output, immediately save it to all three places: `HTML_DESIGN_STANDARDS.json` (What NOT to Do or relevant section), a memory file, and `CLAUDE.md`. Do not wait to be asked. No UI mistake should ever repeat across sessions.
