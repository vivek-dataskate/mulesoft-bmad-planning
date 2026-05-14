# DataSkate HTML Design Standards
> Last updated: 2026-05-13

> **Living document rule:** Any time the user gives negative feedback on HTML output, the pattern must be added to "What NOT to Do" immediately — and also saved to `memory/` and `CLAUDE.md`. No UI mistake repeats.

All CSS lives in the templates. This file covers: (1) what HTML classes to write inside `<!-- FILL:... -->` content slots, (2) what never to do, (3) how to run the template pipeline.

---

## 1. Content Class Reference

Agents writing content JSON files must use these class names in any HTML fragments they generate. The CSS for all classes lives in the relevant `*-template.html`.

### UC Blocks (intake, proposal)

```html
<details class="uc">
  <summary class="uc-hd">
    <span class="uc-tag">UC1</span>
    <h3>Use Case Title</h3>
    <span class="uc-chevron">▼</span>
  </summary>
  <div class="uc-body">
    <p class="uc-note">What we already know — plain paragraph, no border box.</p>
    <!-- questions go here -->
  </div>
</details>
```

UC blocks are collapsed by default. The chevron rotates when open.

### Question Blocks (intake)

```html
<div class="q">
  <span class="q-num"></span><!-- filled by JS at runtime -->
  <div class="q-body">
    <div class="q-text">Question text here <span class="req">*</span></div>
    <div class="q-hint">Hint text — italic, secondary.</div>
    <div class="q-options">
      <span class="pill" onclick="pickPill(this,'q1')">Option A</span>
    </div>
    <textarea class="answer is-prefilled" id="q1" data-required="true">Pre-filled value</textarea>
  </div>
</div>
```

Answer state classes — add to `textarea.answer`:
| State | Class | Visual |
|---|---|---|
| Pre-filled by Scout | `is-prefilled` | amber left border |
| Answered by user | `is-answered` | green left border |
| Empty, required | `mandatory-empty` | red border + bg |

### Business Context Panel (intake)

Content framing rules (these affect what Scout writes, not the CSS):
- **Snapshot:** 2–3 sentences showing business understanding — not generic filler
- **Phase labels:** always "Connected", "Automated", "Agentic"
- **Phase descriptions:** specific to this client's flows — never generic
- **P0 Blockers:** add `.no-print` — never shown in PDF

```html
<div class="journey-grid">
  <div class="journey-card phase-1">
    <div class="jc-phase">Phase 1</div>
    <div class="jc-label">Connected</div>
    <div class="jc-headline">Short specific headline</div>
    <div class="jc-body">1–2 sentences specific to this client.</div>
  </div>
  <!-- phase-2, phase-3 same structure -->
</div>
```

Journey card border-top colors: `phase-1` → green, `phase-2` → amber, `phase-3` → purple (`#C084FC`). White bg throughout.

### Scope Items (intake, proposal)

```html
<div class="scope-grid">
  <div class="scope-item scope-in">
    <span class="scope-label">In Scope</span>
    Description text
  </div>
  <div class="scope-item scope-assumed">
    <span class="scope-label">Assumed</span>
    Description text
  </div>
  <div class="scope-item scope-out">
    <span class="scope-label">Out of Scope</span>
    Description text
  </div>
</div>
```

Neutral `#FAFAFA` bg on all items — label color is the only differentiator.

### Badges (proposal flow cards, assumption tables)

**Complexity** — add to `.complexity-badge`:
| Class | Meaning |
|---|---|
| `.high` | Amber bg (`#FEF3C7`), dark amber text |
| `.medium` | Light gray bg (`#EBEBEB`), `--mid` text |
| `.low` | Green bg (`#D1FAE5`), dark green text |

**Owner** — add to `.owner-badge`:
| Class | Meaning |
|---|---|
| `.owner-client` | Light red bg (`--light`), `--brand-dk` text |
| `.owner-ds` | Green bg, dark green text |
| `.owner-both` | Amber-bg, amber text |
| `.owner-vendor` | Amber-light bg, amber text |

Never use blue or purple in badges.

---

## 2. What NOT to Do

- **No dark header** — headers must be white with `3px solid var(--brand)` bottom border
- **No gray page background** — body must be `background: #fff`, never `#F5F5F5`
- **No circle section numbers** — `.section-num` is plain red text, no `border-radius: 50%` fill
- **No card-style section wrappers** — use flat `border-bottom` separators, no `border-radius` on `.section`
- **No off-palette CSS variables** — only the 11 standard vars in `:root` (`--brand`, `--brand-dk`, `--dark`, `--mid`, `--light`, `--border`, `--green`, `--amber`, `--amber-bg`, `--blue-bg`, `--blue-br`). Never add `--blue`, `--gray`, `--navy`, etc.
- **No arbitrary hex colors** — use CSS variables defined in `shared-base.css.html`
- **No external CSS frameworks** — files must be self-contained
- **No external fonts** — system font stack only
- **No text/CSS logo** — always use the inline SVG wordmark (`height:28px` for intake/compact, `height:32px` for proposals/guides)
- **No dark-background metric cards** — use `.stat-row`/`.stat` (white bg, brand border-top)
- **No dark gradient cover pages** — use standard `.doc-header` pattern
- **No mailto submit** — intake forms save to Firestore only; `submitForm()` calls `saveToFirestore()`, no `mailto:`
- **No hardcoded contact emails** — read architect email from `project.json`; see `CLAUDE.md` for footer rules

**These rules apply to ALL HTML types** — no exceptions for dashboards, portals, or sales materials.

---

## 3. Template Pipeline

Agents output content JSON, then run the fill command. Never write raw HTML.

**Shared base CSS:** `commons/templates/shared-base.css.html` — palette vars, reset, base body. Injected into every template at `<!-- FILL:__css -->`. Template-specific CSS lives inside each `*-template.html`.

| Template type | Shell template | Content source | Fill command |
|---|---|---|---|
| `proposal` | `proposal-template.html` | `projects/{client}/intake/proposal-content.json` | `node commons/branding/fill-template.js --template proposal --client {client}` |
| `intake` | `intake-template.html` | `projects/{client}/intake/intake-content.json` | `node commons/branding/fill-template.js --template intake --client {client}` |
| `integration-deck` | `integration-deck-template.html` | `projects/{client}/intake/integration-deck-content.json` | `node commons/branding/fill-template.js --template integration-deck --client {client}` |
| `client-portal` | `client-portal-template.html` | `projects/{client}/portal-content.json` | `node commons/branding/fill-template.js --template client-portal --client {client}` |
| `ds-pricing-model` | `ds-pricing-model-template.html` | *(reads `pricing-model.md` directly)* | `node commons/branding/fill-template.js --template ds-pricing-model` |
| `architect-guide` | `architect-guide-template.html` | *(reads `architect-guide.md` directly)* | `node commons/branding/fill-template.js --template architect-guide` |

All templates live in `commons/templates/`. If no template exists for a document type — stop and flag it before writing raw HTML.

`fill-template.js` exits with an error if an unregistered template type is requested.

---

## Changelog

| Date | Change |
|---|---|
| 2026-05-13 | Stripped to 3 sections: content class reference, what not to do, pipeline. Removed CSS/typography/layout docs — those live in the templates. |
| 2026-05-13 | UC blocks → details/summary; questions → inline grid .q/.q-num/.q-body; answer states → border-left-only; journey cards → white + border-top; scope items → neutral #FAFAFA; BC header → var(--light) |
| 2026-05-13 | 5 portal rules added to What NOT to Do; lint-html.js enforces all .html files |
| 2026-05-12 | Firebase submit replaces mailto; ds-pricing-model and architect-guide template names |
| 2026-05-11 | Initial version |
