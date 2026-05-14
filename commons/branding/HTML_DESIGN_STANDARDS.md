# DataSkate HTML Design Standards

> **This file is a human pointer. Machine-readable rules live in `HTML_DESIGN_STANDARDS.json`.**
> Agents must read the JSON, not this file. When adding a new forbidden pattern or component rule, add it to the `forbidden` or `components` array in the JSON.

---

## Quick Reference

| Need | Go to |
|---|---|
| Palette vars, forbidden patterns, component HTML | `commons/branding/HTML_DESIGN_STANDARDS.json` |
| Template pipeline (which template + fill command) | `commons/branding/HTML_DESIGN_STANDARDS.json` → `templates` key |
| Lint enforcement | `commons/branding/lint-html.js` |

---

## Key Rules (summary only — full rules in JSON)

- **Header:** white bg, `border-bottom: 3px solid var(--brand)`, always inline SVG logo
- **Body:** `background: #fff` — never `#F5F5F5`
- **Sections:** `details.section-block` + `summary.section-head` — no static `<section>` with card padding
- **Palette:** only 11 vars (`--brand`, `--brand-dk`, `--dark`, `--mid`, `--light`, `--border`, `--green`, `--amber`, `--amber-bg`, `--blue-bg`, `--blue-br`) — no `--blue`, `--gray`, etc.
- **Intake submit:** Firestore only — no `mailto:`
- **Emails:** read `architectEmail` from `project.json` — never hardcoded

---

## Changelog

| Date | Change |
|---|---|
| 2026-05-14 | Converted to JSON-first. This .md is now a human pointer only. |
| 2026-05-13 | Stripped to 3 sections: content class reference, what not to do, pipeline. |
| 2026-05-13 | UC blocks, question blocks, portal violations, 5 recurring forbidden patterns added. |
