---
name: project-psychology-profiles
description: "Ivy extracts buyer psychology profiles from transcripts and applies them to all client-facing content — proposal, integration deck, intake form welcome text"
metadata: 
  node_type: memory
  type: project
  originSessionId: 20f09748-fbe4-4a50-a7b5-d2a1358a07b9
---

Ivy (pipeline agent 4) runs buyer psychology profile extraction from scoping transcripts.

**Why:** Every client-facing document (proposal, integration deck, intake welcome text) must be adapted to the buyer's psychological profile — not generic. The profile shapes challenge framing, FOMO ordering, journey stage emphasis, and the closing line.

**How to apply:** 
- `commons/sales/psychology-profiles.json` defines 5 named profiles with signal phrases, content modifiers, and social proof angles.
- Ivy scores transcript signals against all profiles, writes `psychologyProfile` to `scoping/run/ivy.json`; the orchestrator merges it into `company_context.json`.
- Hawk, Petra, Quinn, and Mira all consume `ivy.json.contentModifiers` to adapt their output.
- New profile patterns can be added directly to `profiles[]` — no human review gate, no observation threshold.

**5 profiles:**
- `roi-analytical` — lead with numbers; sort FOMO by savings amount
- `peer-pressure` — lead with peer name; sort FOMO by closest peer
- `risk-averse-conservative` — proven-pattern framing; stability language
- `visionary-strategic` — first-mover; Stage 3 heavy; AI journey front and center
- `operational-pragmatist` — 'things that stop on go-live day'; Stage 1 heavy (default/fallback)
