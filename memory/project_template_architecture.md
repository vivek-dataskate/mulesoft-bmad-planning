---
name: project-template-architecture
description: "Template system architecture — dynamic vs static strategy, registry location, document inventory, and all renames from May 2026 session"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7fb06946-f362-4cab-809a-a384135ad923
---

All template decisions made 2026-05-13. Registry is the authoritative source.

**Why:** Vivek wanted a clean dictionary of all templates with audience, category, and access rules. Also decided all per-client documents should be dynamic (Firestore-loaded), not static HTML files.

## Dynamic vs Static Strategy

**Dynamic (Firestore-loaded at runtime):** All per-client documents
- Intake Questionnaire
- Proposal
- Integration Deck
- Client Portal

**Static (regenerated from MD when content changes):**
- Architect Guide (`fill-template.js --template resource --name architect-guide`)
- DS Pricing Model (`fill-template.js --template flyer`)

**Static (never regenerated — single files):**
- Architect Portal (`firebase/public/index.html`)

Vivek said "those agreement [versioning] I will handle later" — dynamic proposal versioning is a deferred decision.

**How to apply:** Never generate static per-client HTML files and commit them. Dynamic docs are loaded from Firestore. When asked to "update" intake/proposal/integration-deck, update Firestore data or regenerate + upload to Firebase Storage.

## Template Registry

Single source of truth: `docs/eleventy/template-registry.json` (moved from `commons/templates/` 2026-05-21 — Eleventy migration complete)

Fields per template: `id`, `name`, `audience` (internal/external), `loginRequired`, `loginDomain`, `category`, `purpose`, `templateFile`, `cssFile`, `outputPath`, `generatedBy`, `fillCommand`, `perClient`, `notes`

## Document Inventory (current)

| Document | Audience | Access | Source |
|---|---|---|---|
| Intake Questionnaire | external | public | Scout → intake-content.json |
| Proposal | external | public | Scout → proposal-content.json |
| Integration Deck | external | public | Scout → integration-deck-content.json |
| Client Portal | external | public | scaffold → portal-content.json |
| Architect Portal | internal | @dataskate.ai login | static (index.html) |
| DS Pricing Model | external | public | fill-template.js --template flyer |
| Architect Guide | internal | @dataskate.ai login | fill-template.js --template resource --name architect-guide |

## Renames and Deletions (2026-05-13)

| Old name | New name | Action |
|---|---|---|
| Architect Flyer | DS Pricing Model | Renamed → `ds-pricing-model.html` |
| Pricing Model HTML | Pricing Model — Internal | Deleted — content merged into Architect Guide |
| Client Pitch Kit | Integration Deck | Renamed → `integration-deck-{client}.html` (per-client only) |
| AE Pitch Kit | — | Deleted — content merged into Architect Guide |
| Proposal Structure HTML | — | Deleted — stays as `commons/sales/proposal-structure.md` only |

## Architect Guide is now the single internal reference

`commons/sales/architect-guide.md` contains merged content from:
- Former `architect-guide.md` (AE briefing, client presentation, closing)
- Former `ae-pitch-kit.md` (IaaS pitch, AE objections, email templates, Phase 2 pivot)
- Former `client-pitch-kit.md` (proposition, 3-stage journey, client objections, cost conversation)
- Pricing reference section (key tables from `pricing-model.md`)

`commons/sales/pricing-model.md` is KEPT — still used by `fill-template.js` flyer generator and Scout agent for pricing calculations. Never delete it.

## Template Layouts (Eleventy — 2026-05-21)

All 7 templates ported to Eleventy. Edit layouts at `docs/eleventy/_includes/layouts/{template}.njk`.
Legacy `*-template.html` files in `commons/templates/` have been deleted.
`commons/templates/shared-base.css.html` is kept — inlined by `base.njk` via the `|inline` filter.
Version manifest: `docs/eleventy/version-manifest.json`.

## fill-template.js Commands (unchanged interface, now delegates to Eleventy)

```
--template intake          --client {slug}   → intake-questionnaire-{client}.html
--template proposal        --client {slug}   → proposal-{client}.html
--template integration-deck --client {slug}  → integration-deck-{client}.html
--template client-portal   --client {slug}   → firebase/public/portal/{client}.html
--template corporate-brief --client {slug}   → corporate-brief-{client}.html
--template ds-pricing-model                  → firebase/public/resources/ds-pricing-model.html
--template architect-guide                   → firebase/public/resources/architect-guide.html
```
