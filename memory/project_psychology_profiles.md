---
name: project-psychology-profiles
description: "Scout now extracts buyer psychology profiles from transcripts (Step 1d) and applies them to ALL client/AE-facing content — proposal, integration deck, intake form welcome text"
metadata: 
  node_type: memory
  type: project
  originSessionId: 20f09748-fbe4-4a50-a7b5-d2a1358a07b9
---

Scout Session 1 now includes Step 1d: Buyer Psychology & Social Proof Profile Extraction.

**Why:** Every client-facing document (proposal, integration deck, intake welcome text) must be adapted to the buyer's psychological profile — not generic. The profile shapes challenge framing, FOMO ordering, journey stage emphasis, and the closing line.

**How to apply:** 
- `commons/sales/psychology-profiles.json` defines 5 named profiles with signal phrases, content modifiers, and social proof angles.
- Scout reads the file in Session 1 activation, scores transcript signals against all profiles, writes `psychologyProfile` to `company_context.json`.
- Steps 3c (proposal), 3d (integration deck), and Step 10 (intake HTML welcome text) all apply `psychologyProfile.contentModifiers`.
- New profile patterns are researched immediately (B2B buyer psychology, Challenger Sale, Gartner archetypes, etc.) and added directly to `profiles[]` — no human review gate, no observation threshold. Scout names the archetype, populates all fields, and assigns it to the current client as `primaryProfile` in the same session.

**5 profiles:**
- `roi-analytical` — lead with numbers; sort FOMO by savings amount
- `peer-pressure` — lead with peer name; sort FOMO by closest peer
- `risk-averse-conservative` — proven-pattern framing; stability language
- `visionary-strategic` — first-mover; Stage 3 heavy; AI journey front and center
- `operational-pragmatist` — 'things that stop on go-live day'; Stage 1 heavy (default/fallback)
