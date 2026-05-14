---
name: feedback-design-standards-json
description: "HTML_DESIGN_STANDARDS converted from .md to .json — JSON is the authoritative source, .md is a human pointer"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 46774b27-0204-4fbc-ac4e-d4f3b175d454
---

HTML design standards are in `commons/branding/HTML_DESIGN_STANDARDS.json`, not the .md file. The .md is a pointer only.

**Why:** User said agents reading JSON can infer faster than reading prose Markdown. Machine-readable structure (palette vars, forbidden patterns, component HTML snippets) is more useful than narrative documentation.

**How to apply:**
- When adding a new forbidden pattern: add to the `forbidden` array in the JSON
- When adding a new component pattern: add to the `components` object in the JSON
- CLAUDE.md now references the JSON for the UI feedback rule
- lint-html.js error messages still say `.md` but the actual standards are in `.json`
- The .md says "see JSON" and has a quick-reference table only
