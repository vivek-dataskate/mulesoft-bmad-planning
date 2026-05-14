---
name: feedback-intake-form-ux
description: "Intake form UX patterns — compact question layout, collapsible UCs, reduced color noise"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: bfd4521b-d530-4e37-954e-60fdd0878d48
---

Q number must be inline with question text using a 2-column grid (36px | 1fr). Never on its own line — it wastes vertical space and a 20+ question form becomes exhausting to scroll.

**Why:** User reviewed a live side-by-side preview and confirmed the inline Q pattern is significantly more compact and scannable.

**How to apply:** Every `.q-block` in intake forms uses `display: grid; grid-template-columns: 36px 1fr`. The Q-number column acts as the visual separator between questions — no dashed borders needed.

---

UC blocks must be collapsed by default using `<details>`/`<summary>`. Client lands on a compact list of UC titles, expands only what they are filling in.

**Why:** Long intake forms (4-5+ sections, 3+ UCs each) are overwhelming if everything is open. Collapsed default = table of contents on load.

**How to apply:** Wrap every UC block in `<details class="uc-block">` with `<summary class="uc-head">`. No `open` attribute = collapsed by default.

---

Answer field states use border-left only — background stays `#fff`. No amber/green background fills.

**Why:** Colored backgrounds across 20+ fields look busy and carnival-like. A 3px colored left border communicates state without flooding the page.

---

Journey cards in the Business Context Panel use white background + top-border accent (brand/amber/mid) — not three different pastel backgrounds.

**Why:** Three different pastel backgrounds (green/yellow/purple) in one panel adds color noise. Top-border differentiation is sufficient.

---

Hint text uses inline italic + faint left rule only. No `#FAFAFA` background box.

**Why:** Background boxes on hints add another layer of visual nesting that makes the form feel busy.

---

`summary.uc-hd h3` must have `margin: 0` and `.uc-note` must have `margin-top: 0`. Browser defaults add `1em` top/bottom margin to both `h3` and `p` elements, creating a visible gap between the UC heading and its description note.

**Why:** Browser default margins on `h3` and `p` inside `details/summary` are not reset by the flex container — they add noticeable whitespace above the UC description.

**How to apply:** Always include `margin: 0` on `summary.uc-hd h3` and `margin: 0 0 12px` on `.uc-note`.
