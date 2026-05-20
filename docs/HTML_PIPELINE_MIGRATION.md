# HTML Pipeline Migration — Status & Resume Guide

> **For any Claude Code session continuing this work**: read this file first.
> It captures the migration of DataSkate's HTML generation from the legacy
> hand-rolled `fill-template.js` pipeline to **Eleventy + DTCG tokens + Nunjucks
> components**. Multiple sessions are expected — durable state lives here.

**Started:** 2026-05-20
**Current owner:** active migration
**Status:** foundation complete + **all 7 templates ported with CLI shim dispatching** (ds-pricing-model, architect-guide, client-portal, integration-deck, corporate-brief, proposal, intake). All 7 ported templates produce HTML via Eleventy; the legacy `fill-template.js` shim copies output to the original paths so all 9 callers and 3 agent .tomls work unchanged. HARD parity gate passed (5/5 VR baselines clean). Migration complete — only pending work is lint tooling replacement (low priority).

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
| `corporate-brief` port | **working** — layout + 3 components (stack-card, sibling-row, intel-card) + `clientsWithBrief.js` data filter + `site/intake/corporate-brief.njk` pagination; shim dispatches via `intake/corporate-brief-{slug}.html` permalink | `docs/eleventy/_includes/layouts/corporate-brief.njk` + 3 components + `_data/clientsWithBrief.js` + `site/intake/` |
| `proposal` port | **working** — layout + 5 components (flow-card, stage-card, fomo-card, cs-card, investment) + `clientsWithProposal.js` data filter + `site/intake/proposal.njk` pagination + `proposal.11tydata.js` sidecar (pricing math, case-study scoring, diagram SVG, proposalAbout); shim dispatches via `intake/proposal-{slug}.html` permalink | `docs/eleventy/_includes/layouts/proposal.njk` + 5 components + `_data/clientsWithProposal.js` + `site/intake/proposal*` |
| **`intake` port** | **working** — CSS + JS lifted verbatim from frozen `intake-template.html`; Nunjucks slots replace all `<!-- FILL:X -->` markers; `CLIENT_SLUG`/`architectEmail` injected outside `{% raw %}` block; Firestore submit + soft-lock banner intact; `clientsWithIntake.js` data filter; shim dispatches via `intake/intake-questionnaire-{slug}.html` permalink. HARD parity gate passed (5/5 VR baselines, 0 HARD diffs). | `docs/eleventy/_includes/layouts/intake.njk` + `_data/clientsWithIntake.js` + `site/intake/intake.njk` + `site/intake/intake.11tydata.js` |
| **CLI shim in `fill-template.js`** | **working** — for all 6 ported templates the script now runs `npm run build:html` (Eleventy) and copies the matching `docs/eleventy/_build/...` file to the legacy outFile path. All 9 consumers (regen scripts, agent .tomls, firebase deploy) keep working without change. Frozen-client guard still fires before the Eleventy dispatch. | `commons/branding/fill-template.js` lines ~160–215 (look for `ELEVENTY_TEMPLATES`) |
| Hard parity gate after CLI shim | **passing** — `npm run vr:diff:intake` reports 5 clean, 0 HARD-failed | `npm run vr:diff:intake` |
| npm scripts | **working** | `npm run build:tokens`, `npm run build:html`, `npm run vr:baseline`, `npm run vr:diff`, `npm run vr:diff:intake` |
| Codespace persistence | **working** — `.devcontainer/devcontainer.json` `postCreateCommand` runs `npm install` on rebuild; all new deps in `package.json` devDependencies | — |

### ⏳ Pending

| Order | Task | Risk | Estimated time |
|---|---|---|---|
| ~~1~~ | ~~Port `proposal` template~~ | ~~medium~~ | **done** |
| ~~2~~ | ~~Port `intake` template — HARD parity gate, Firestore submit JS must stay intact~~ | ~~high~~ | **done** |
| ~~3~~ | ~~Run `regen-all-clients` + `npm run vr:diff:intake`; resolve any HARD diffs to zero~~ | ~~low~~ | **done — 5/5 clean** |
| 4 | Replace `lint-html.js` with htmlhint + stylelint configs + custom DataSkate rules | medium | 60 min |
| 5 | Mobile-first responsive layer (deferred per user instruction — desktop-only for now, add later) | — | future |
| ~~6~~ | ~~Update `CLAUDE.md`, `HTML_DESIGN_STANDARDS.json`, `template-registry.json`~~ | ~~low~~ | **done** |

---

## Intake UX improvements — in progress (session 4 handoff, 2026-05-20)

All 7 templates are ported and committed. The next body of work is 13 UX/visual improvements to the intake questionnaire. These go **only into `docs/eleventy/_includes/layouts/intake.njk`** — the frozen `commons/templates/intake-template.html` is never touched.

**Uncommitted right now:** `intake.njk` has improvement #1 applied but not yet committed. `commons/branding/generated/tokens.js` has a minor regen change.

### Improvement checklist

| # | Description | Status | Where in intake.njk |
|---|---|---|---|
| 1 | Progress bar + rail card + progress number turn green at 100% | **done, uncommitted** | CSS after `.progress-fill` + `updateProgress()` |
| 2 | Section-head green checkmark when 100% complete | todo | `.section-head` CSS + `updateProgress()` loop |
| 3 | Auto-resize textareas (expand as user types) | todo | DOMContentLoaded init block |
| 4 | Keyboard accessibility for pills (`role="button"`, `tabindex="0"`, `onkeydown`) | todo | HTML pill template in `intake.11tydata.js` |
| 5 | Auto-save draft to localStorage (restore on load, "Draft restored" banner) | todo | new `autosaveDraft()` + `restoreDraft()` functions |
| 6 | "Next unanswered →" button in sticky bar | todo | `.bar-tools` HTML + `jumpToFirstUnanswered()` call |
| 7 | Biz-context auto-opens on first visit (localStorage `bc_seen_{slug}` flag) | todo | `toggleBC()` + DOMContentLoaded |
| 8 | Percentage in sticky bar progress pill | todo | `updateProgress()` — one line |
| 9 | Minimum-answer length hint on open-ended questions (via `data-minhint` attr) | todo | `intake.11tydata.js` question render + hint CSS |
| 10 | "Next: [Section Name] →" CTA at bottom of each section body | todo | `intake.11tydata.js` section render |
| 11 | Completion celebration at 100% (submit button pulses green, "Complete ✓" banner) | todo | CSS + `updateProgress()` |
| 12 | `?q=Q15` deep-link support (copy-link per question + on-load scroll/focus) | todo | DOMContentLoaded + per-Q copy button |
| 13 | Word count hint on textareas with `data-minwords` attribute | todo | `intake.11tydata.js` + input handler |

### Pattern for each improvement
1. Edit `docs/eleventy/_includes/layouts/intake.njk` only
2. Run `npm run build:html` and verify the change appears in `docs/eleventy/_build/intake/intake-questionnaire-homage.html`
3. Pause for user review
4. Commit after user says "next"

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
- **Client-logo flow + sizing (documented, not yet hardened)**: the per-client logo shown next to the DataSkate wordmark on the corporate-brief / proposal / integration-deck / client-portal flows through this chain:
  1. **Vera scrapes a URL** ([`DSPipeline/agents/vera.toml`](../DSPipeline/agents/vera.toml) Step 1b) — first match of `og:image` → `apple-touch-icon` → `icon`, stored as `vera.json` `company.logoUrl`. Clearbit fallback is dead.
  2. **Download** ([`scaffold/generate-client-portal.js`](../scaffold/generate-client-portal.js) `downloadLogo()`) writes the image to **`projects/{slug}/intake/logo-{slug}.png`** *and* `firebase/public/logos/{slug}.png`.
  3. **Sync net** ([`scripts/update-firebase.js`](../scripts/update-firebase.js) `syncLogo()`) re-copies `intake/logo-{slug}.{ext}` → `firebase/public/logos/{slug}.{ext}`.
  4. **Resolve** — legacy `resolveClientLogoPath()` and Eleventy `_data/clients.js` both read **`firebase/public/logos/{slug}.{ext}`** (NOT the intake folder directly) and emit the public URL into `<img class="client-logo-img">`.
  - **Sizing is owned entirely by CSS**: `.client-logo-img { height:32px; width:auto; max-width:140px; object-fit:contain; }` plus `onerror="…display='none'"`. This guarantees the header layout never breaks for any source dimensions.
  - **Known unmanaged risk (decision 2026-05-20: document, don't fix yet)**: image *selection* is not validated. `og:image` is preferred first but is usually a 1200×630 social banner, not a square logo — squeezed to 32px tall it can be illegible. There is no aspect-ratio / min-dimension guard and no human approval gate before the client-facing corporate brief ships. Revisit (selection guard, or review gate via a `project.json` `logoApproved` flag) when a real client surfaces a bad logo.

### Decisions / preferences locked in

- **Engine**: Eleventy v2 (CJS-compatible) over v3 (ESM-only). Pinned in `package.json`.
- **Style Dictionary**: v3 (CJS). Pinned.
- **Template language**: Nunjucks (`.njk`).
- **Data model**: Eleventy data cascade — sidecar `.11tydata.js` for page-specific data, `_data/*.js` for global.
- **Markdown**: project-local converter in `commons/branding/md-to-html.js`, not markdown-it. Preserves the `.md-table` / `.code-block` class hooks the architect-guide CSS depends on.
- **Component naming**: kebab-case, `<noun>-card.njk` for repeating units, `<name>.njk` for layouts.
- **`esc` filter returns a Nunjucks `SafeString`** (`.eleventy.js`): Nunjucks autoescape is ON by default, so a plain-string `esc` result was being double-escaped (`M&A` → `M&amp;amp;A`). The filter now escapes `& < > "` (NOT `'`, matching the legacy `esc()` in `fill-template.js`) and marks the result safe so it is the only escape. For text without special chars this is identical to bare `{{ x }}`, so it's a safe drop-in — this fixed a latent double-escape in the previously-ported templates too (re-baselined `fb-portal-homage`). Helper filters added alongside: `domainOnly` (strip scheme/trailing slash) and `iStartsWith` (case-insensitive prefix test).

---

## Proposal port — implementation plan (ready to execute)

Research was completed in the session ending 2026-05-20. Start coding directly — no re-reading needed.

### Files to CREATE (8 new files)

```
docs/eleventy/_data/clientsWithProposal.js      ← filter clients where c.proposal != null
docs/eleventy/site/intake/proposal.njk           ← paginated entry: permalink /intake/proposal-{slug}.html
docs/eleventy/site/intake/proposal.11tydata.js   ← eleventyComputed: proposal, proposalPricing, proposalAbout, proposalCS, proposalDiagram, docTitle
docs/eleventy/_includes/layouts/proposal.njk     ← main layout (CSS lifted verbatim from proposal-template.html)
docs/eleventy/_includes/components/proposal-flow-card.njk
docs/eleventy/_includes/components/proposal-stage-card.njk
docs/eleventy/_includes/components/proposal-fomo-card.njk
docs/eleventy/_includes/components/proposal-cs-card.njk
docs/eleventy/_includes/components/proposal-investment.njk   ← model grid + rate tables + negotiate panel
```

### File to MODIFY

`commons/branding/fill-template.js` — add `'proposal'` to `ELEVENTY_TEMPLATES` set (line ~176) and add `'proposal': (c) => path.join(eleventyBuildDir, 'intake', `proposal-${c}.html`)` to `eleventyOutMap` (after line ~193).

### Key implementation notes

**`proposal.11tydata.js` sidecar — `eleventyComputed` functions:**
- `proposal` → `data.client.proposal`
- `proposalPricing` → only computed when `proposal.pricing == true`; reads `data.pricing` (global), uses `data.client.proposal.meta.flowCount` + `data.client.proposal.buyerProfile.primary`; outputs: `{ recModel, n, yearFmt, p1Fmt, p2Fmt, implTotalFmt, retainerFmt, diffFmt, implPerFlowFmt, baseFmtD, p2FmtD, tmTotalFmt, tmPerFlowFmt, tm, ... }`
- `PROFILE_RECOMMENDED_MODEL` map: `{ 'roi-analytical':'iaas', 'risk-averse':'iaas', 'relationship-builder':'iaas', 'technical-champion':'tm', 'budget-conscious':'impl' }` — default `'iaas'` for any unmapped profile (e.g. `'operational-pragmatist'`)
- `proposalAbout` → read `commons/sales/about-dataskate.md`; if content starts with `<`, return raw; else wrap paragraphs. Same logic as `fill-template.js` line 242–246.
- `proposalCS` → read `commons/social-proof/client-case-studies.json`; score by system overlap (from `diagramNodes` + flow routes, +3 per match) + relevance tags (+1); pick top 2
- `proposalDiagram` → check `projects/{slug}/intake/system-diagram.svg` first; fallback: build inline SVG from `proposal.solution.diagramNodes` using `buildDiagramSvg()` (copy from `fill-template.js` line 894–937, using local `esc()`)
- `docTitle` → `'DataSkate × ' + clientName + ' — Integration Roadmap'`

**JS constants injection pattern (same as integration-deck.njk):**
```html
<script>
window.__PROP_SLUG  = "{{ (proposal.meta.clientSlug or '') | esc }}";
window.__PROP_NAME  = "{{ (proposal.meta.clientName or '') | esc }}";
window.__PROP_EMAIL = "{{ (proposal.meta.architectEmail or '') | esc }}";
window.__PROP_ARCH  = "{{ (proposal.meta.architect or '') | esc }}";
window.__PROP_RATE  = {{ pricing.baseRate if proposalPricing else 0 }};
window.__PROP_FLOWS = {{ proposal.meta.flowCount if proposal else 0 }};
window.__PROP_MODEL = "{{ (proposalPricing.recModel if proposalPricing else '') | esc }}";
</script>
{% raw %}<script>
const CLIENT_SLUG         = window.__PROP_SLUG;
...rest of Firebase JS verbatim from proposal-template.html lines 554-780...
</script>{% endraw %}
```

**`body` tag:** `<body data-buyer-profile="{{ ((proposal.buyerProfile and proposal.buyerProfile.primary) or '') | esc }}">`

**HTML escape rules (critical):**
- `| esc`: all user text (names, titles, labels, assumptions, etc.)
- `| safe`: pre-rendered HTML that should NOT be re-escaped: `proposalAbout`, `proposalDiagram`, `flow.value`, `outcome.body`, `step.body`, `proposal.roi.body`, stage items (`stage.items[i]`)
- Bare `{{ x }}` is fine for numeric values (Nunjucks autoescape won't change them)
- Price strings in `onclick` attrs (e.g. `$300.00`) have no special chars — bare `{{ proposalPricing.baseFmtD }}` is safe

**Conditional sections:**
- ROI: `{% if proposal.roi %}` — open by default when `proposal.buyerProfile.primary == 'roi-analytical'`
- Timeline: `{% if proposal.timeline and proposal.timeline | length > 0 %}`
- FOMO: `{% if proposal.fomo and proposal.fomo | length > 0 %}`
- Thought starters: `{% if proposal.fomoThoughtStarters and proposal.fomoThoughtStarters | length > 0 %}`
- Investment: `{% if proposalPricing %}` — wraps `<details id="investment-details">` + includes `proposal-investment.njk`
- Case studies: `{% if proposalCS and proposalCS | length > 0 %}`

**Stage card loop:**
```njk
{% for stageKey in ['stage1', 'stage2', 'stage3'] %}
{% set stage = proposal.journey[stageKey] %}
{% set stageNum = loop.index %}
{% include "components/proposal-stage-card.njk" %}
{% endfor %}
```

**Investment component `proposal-investment.njk`:**
In scope from layout: `proposalPricing`, `pricing` (global). IaaS is default-visible when `recModel == 'iaas'` (iaasDisplay = `style="display:none"` if not iaas). T&M card only rendered when `proposalPricing.tm` is non-null.

**Test client:** `agilemind` has `projects/agilemind/intake/proposal-content.json` (4 flows, `pricing: true`, `buyerProfile.primary: 'operational-pragmatist'`). After build, output should be at `docs/eleventy/_build/intake/proposal-agilemind.html`.

**CLI shim test:** `node commons/branding/fill-template.js --template proposal --client agilemind`

### Data shape reference

All fields documented in `projects/agilemind/intake/proposal-content.json`. Top-level keys: `meta`, `challenge`, `solution`, `roi`, `journey`, `flows`, `outcomes`, `included`, `oos`, `assumptions`, `timeline`, `pricing`, `fomo`, `buyerProfile`, `fomoThoughtStarters`, `nextSteps`, `about`.

---

## Index of resume-relevant memories

- `feedback_intake_template_frozen.md` — the FROZEN intake template + soft-lock policy
- (to add) `project_html_pipeline_migration.md` — pointer to this file
