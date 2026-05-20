# HTML Pipeline Migration — Status & Resume Guide

> **For any Claude Code session continuing this work**: read this file first.
> It captures the migration of DataSkate's HTML generation from the legacy
> hand-rolled `fill-template.js` pipeline to **Eleventy + DTCG tokens + Nunjucks
> components**. Multiple sessions are expected — durable state lives here.

**Started:** 2026-05-20
**Current owner:** active migration
**Status:** foundation complete + **4 of 6 templates ported with CLI shim dispatching** (ds-pricing-model, architect-guide, client-portal, integration-deck). The 4 ported templates produce HTML via Eleventy now; the legacy `fill-template.js` shim copies output to the original paths so all 9 callers and 3 agent .tomls work unchanged. Remaining: corporate-brief (blocked — template file missing from repo), proposal (heavy), intake (HARD parity gate).

---

## Why this migration

The legacy pipeline is `commons/branding/fill-template.js` — a 2,267-line file
of `build<Type>()` functions that emit HTML strings via template literals.
Every new client triggered hand-edits that drifted from earlier output. The
new pipeline makes drift structurally impossible:

- **Tokens** (`tokens/*.json`) are the only source for color/typography/breakpoints. Compiled by Style Dictionary to `commons/branding/generated/tokens.css`.
- **Layouts** (`docs/eleventy/_includes/layouts/<template>.njk`) own the document shell.
- **Components** (`docs/eleventy/_includes/components/<name>.njk`) own one visual unit each. Reused, never re-invented.
- **Data** (`docs/eleventy/_data/*.js`) is the input — everything else is mechanical.
- **CLI shim** (planned): `fill-template.js` becomes a thin wrapper that calls Eleventy for ported templates and falls through to legacy for the rest. Agents (`petra.toml`, `quinn.toml`, `mira.toml`) and 9 consumer scripts keep working unchanged during incremental migration.

---

## Current state (2026-05-20)

### ✅ Completed

| Layer | Status | Files |
|---|---|---|
| Visual regression seatbelt | **working** — 29 baselines locked, hard parity gate on intake pages | `scripts/visual-regression.js`, `tests/visual/baseline/*.png` |
| DTCG design tokens | **working** — Style Dictionary v3 compiles `tokens/*.json` → `tokens.css` + `tokens.js` | `tokens/{color,typography,logo,breakpoint}.json`, `scripts/build-tokens.js` |
| Eleventy scaffold | **working** — v2.0.1 (CJS), Nunjucks engine, smoke-tested | `.eleventy.js`, `docs/eleventy/` |
| Markdown converter | **factored** — shared between legacy + Eleventy | `commons/branding/md-to-html.js` |
| `ds-pricing-model` port | **working** — structurally identical to shipped HTML | `docs/eleventy/_includes/layouts/ds-pricing-model.njk` + `_data/pricing.js` + 3 components |
| `architect-guide` port | **working** — pulls `commons/sales/architect-guide.md`, renders via `mdToHtml` filter | `docs/eleventy/_includes/layouts/architect-guide.njk` + `site/resources/architect-guide.11tydata.js` |
| `client-portal` port | **working** — paginated over `_data/clientsWithPortal.js`, generates one HTML per client with portal-content.json | `docs/eleventy/_includes/layouts/client-portal.njk` + 3 components + `site/portal/client.njk` + `_data/clients.js` |
| `integration-deck` port | **working** — shell with Firestore runtime fetch; CLIENT_SLUG injected via `window.__CLIENT_SLUG` outside the raw block | `docs/eleventy/_includes/layouts/integration-deck.njk` + `site/internal/deck.njk` |
| **CLI shim in `fill-template.js`** | **working** — for the 4 ported templates the script now runs `npm run build:html` (Eleventy) and copies the matching `docs/eleventy/_build/...` file to the legacy outFile path. All 9 consumers (regen scripts, agent .tomls, firebase deploy) keep working without change. Frozen-client guard still fires before the Eleventy dispatch. | `commons/branding/fill-template.js` lines ~160–215 (look for `ELEVENTY_TEMPLATES`) |
| Hard parity gate after CLI shim | **passing** — `npm run vr:diff:intake` reports 5 clean, 0 HARD-failed after the new pipeline regenerated ds-pricing-model, architect-guide, homage portal, agilemind integration-deck via the shim | `npm run vr:diff:intake` |
| npm scripts | **working** | `npm run build:tokens`, `npm run build:html`, `npm run vr:baseline`, `npm run vr:diff`, `npm run vr:diff:intake` |
| Codespace persistence | **working** — `.devcontainer/devcontainer.json` `postCreateCommand` runs `npm install` on rebuild; all new deps in `package.json` devDependencies | — |

### ⏳ Pending

| Order | Task | Risk | Estimated time |
|---|---|---|---|
| 1 | Port `corporate-brief` template — **blocked**: `commons/templates/corporate-brief-template.html` is missing from the repo (not present in HEAD). `buildCorporateBrief` exists in `fill-template.js` but has no template to fill. Reverse-engineer from `projects/sample/intake/corporate-brief-sample.html` (the only known output) or create from scratch. Defer until source template is reconstructed. | blocked | 60 min (after unblock) |
| 2 | Port `proposal` template — move pricing math, FOMO scoring, case-study selection, diagram-gen to computed-data helpers | medium | 2–3 hr |
| 3 | Port `intake` template — **HARD parity gate**, Firestore submit JS must stay intact | high | 2–3 hr |
| 4 | Build CLI shim: `fill-template.js` dispatches to Eleventy for ported templates, falls back to legacy for the rest | low | 45 min |
| 5 | Run `regen-all-clients` + `npm run vr:diff:intake`; resolve any HARD diffs to zero | low (gated) | 30 min |
| 6 | Replace `lint-html.js` with htmlhint + stylelint configs + custom DataSkate rules | medium | 60 min |
| 7 | Mobile-first responsive layer (deferred per user instruction — desktop-only for now, add later) | — | future |
| 8 | Update `CLAUDE.md`, `HTML_DESIGN_STANDARDS.json`, `template-registry.json` | low | 30 min |

---

## How to resume in a new session

### Sanity-check (≈ 2 min)

```bash
# tokens compile cleanly?
npm run build:tokens

# Eleventy builds the ported templates?
npm run build:html

# Visual regression diff against intake baselines?
npm run vr:diff:intake
```

If all three pass, the foundation is intact. Continue with the next pending task.

### Where things live

```
.eleventy.js                              ← Eleventy config (filters, passthroughs, shortcodes)
tokens/                                    ← DTCG design tokens (color, typography, logo, breakpoint)
scripts/build-tokens.js                   ← Style Dictionary build
scripts/visual-regression.js              ← Pixel-diff seatbelt
commons/branding/md-to-html.js            ← Shared MD→HTML converter (legacy + Eleventy both use)
commons/branding/generated/tokens.css     ← AUTO-GENERATED; do not edit
commons/templates/                        ← LEGACY templates (still in use until ported)
commons/branding/fill-template.js         ← LEGACY renderer (still in use; CLI shim will wrap it)
docs/eleventy/
  ├── site/                               ← entry pages (one per output URL)
  │   └── resources/{ds-pricing-model,architect-guide}.njk
  ├── _includes/
  │   ├── layouts/                        ← per-template document shells
  │   │   ├── base.njk                    ← shared <head> + tokens.css + shared-base.css
  │   │   ├── ds-pricing-model.njk
  │   │   └── architect-guide.njk
  │   └── components/                     ← one visual unit per file
  │       └── pricing-model-card-{iaas,impl,tm}.njk
  ├── _data/                              ← shared data (pricing, branding)
  │   ├── pricing.js                      ← parses commons/sales/pricing-model.md + tm-rates.json
  │   └── branding.js                     ← company + logo SVG
  └── _build/                             ← Eleventy output (gitignored eventually)
tests/visual/baseline/                    ← 29 baseline PNGs (committed)
```

### Migration pattern (use this for every remaining template)

1. **Read** the existing template `commons/templates/<name>-template.html` and the corresponding `build<Type>()` function in `fill-template.js`.
2. **Identify** the `<!-- FILL:* -->` markers — each becomes a `{{ }}` expression in Nunjucks.
3. **Lift** the entire `<style>` block + body structure verbatim into `docs/eleventy/_includes/layouts/<name>.njk` (extending `base.njk`).
4. **Extract** any repeating visual units into `docs/eleventy/_includes/components/<unit>.njk`. Reuse existing components where applicable.
5. **Move** computed data (pricing math, scoring, etc.) from `fill-template.js` into either `docs/eleventy/_data/<topic>.js` (global) or `docs/eleventy/site/<page>.11tydata.js` (per-page sidecar).
6. **Wrap** all inline `<script>` blocks in `{% raw %}…{% endraw %}` so Nunjucks doesn't interpret JS object literals.
7. **Build**: `npm run build:html`. Output lands in `docs/eleventy/_build/`.
8. **Diff**: `npm run vr:diff` — soft diffs are expected on in-flux templates, hard diffs on intake pages fail the gate.
9. Commit with message `feat(html-pipeline): port <name> template to Eleventy`.

### Parity policy (user-confirmed)

- **`intake-template.html` is FROZEN as of 2026-05-20.** Output must be pixel-identical to the baselines in `tests/visual/baseline/*-intake-*.png`. The visual-regression diff with `--intake` is the hard gate. Any diff fails the migration.
- **All other templates are in-flux.** User is iterating on the designs. Soft diffs are expected and acceptable. Don't burn time chasing 100% parity on proposal/portal/deck/architect-guide/pricing-model/corporate-brief.
- **Mobile-first**: deferred per user instruction. Desktop-only for now. Breakpoint tokens are in place (`--breakpoint-mobile/-tablet/-desktop/-wide`) so mobile work later is a single-pass design exercise on each layout, not a token refactor.

### Risk surface to keep in mind

- **Frozen shipped clients**: AgileMind, Homage, Pacific Title — their intake HTMLs are in client hands. Baseline screenshots in `tests/visual/baseline/`. Don't break them.
- **9 consumers of `fill-template.js`**: `scripts/regen-all-clients.js`, `scripts/republish.js`, `scripts/update-firebase.js`, `scaffold/generate-client-portal.js`, `firebase/deploy.sh`, `DSPipeline/scout/orchestrate.js`, plus 3 agent .tomls (`petra.toml`, `quinn.toml`, `mira.toml`). The CLI shim must preserve `--template X --client Y` interface exactly.
- **Firestore runtime fetch**: per-client documents (intake, proposal, integration-deck, client-portal) load content dynamically from Firestore at runtime. The build-time templates render the shell; runtime JS fetches data. Don't break the inline `<script>` blocks that talk to Firestore.
- **Template versioning (PR #33)**: `scripts/bump-template.js` and the Layer 2 versioning system have their own `templateFile/cssFile` assumptions in `template-registry.json`. Update the registry when porting each template.

### Decisions / preferences locked in

- **Engine**: Eleventy v2 (CJS-compatible) over v3 (ESM-only). Pinned in `package.json`.
- **Style Dictionary**: v3 (CJS). Pinned.
- **Template language**: Nunjucks (`.njk`).
- **Data model**: Eleventy data cascade — sidecar `.11tydata.js` for page-specific data, `_data/*.js` for global.
- **Markdown**: project-local converter in `commons/branding/md-to-html.js`, not markdown-it. Preserves the `.md-table` / `.code-block` class hooks the architect-guide CSS depends on.
- **Component naming**: kebab-case, `<noun>-card.njk` for repeating units, `<name>.njk` for layouts.

---

## Index of resume-relevant memories

- `feedback_intake_template_frozen.md` — the FROZEN intake template + soft-lock policy
- (to add) `project_html_pipeline_migration.md` — pointer to this file
