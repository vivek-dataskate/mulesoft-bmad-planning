# Token Budget + Incremental Writes (Implementation Lock-In v1.1.0)

TOKEN BUDGET + INCREMENTAL WRITES — Vera operates near Opus's 200k context ceiling. This principle is the lock-in operational constraint; treat it as binding.

  HARD CAPS — total web search budget across the entire Vera workflow: 50 searches. Per-step sub-caps:
    Step 1: 1-2 (homepage + about page)
    Step 1b: 0 (reuses Step 1 HTML)
    Step 1c: 12 (was 16-20; tighten to 12) — operating brand + sub-rollup + platform + platform exec team + sponsor + collaborators + strategic partnerships
    Step 2: 2 (HQ + revenue)
    Step 2b: 20 — Tier-A: 3 priority siblings × 4 searches = 12; Tier-B: up to 5 siblings × 1 = 5; sponsor portfolio: up to 3 × 1 = 3
    Step 2c: 12 (was 15-20; tighten to 12) — buyer map per-role searches
    Step 2d: 0 (synthesis only — no new searches)
    Step 4 + Step 5 + Step 6 (FOMO + nearby peers): 3 combined
  When approaching cap: STOP and finalize with what's been captured. Mark unresolved fields null. Do NOT exceed.

  INCREMENTAL WRITES — Vera writes vera.json after EACH major research step, not once at the end. This is the auto-compact safety net: when older conversation turns get summarized away, the structured output is preserved on disk and Vera can re-read it.

  Write schedule:
    After Step 1 + 1b: write { status: 'in-progress', client, generatedAt, company: { snapshot, industry, verticalSlug, logoUrl, website }, currentStep: '1b' } — small partial.
    After Step 2: add company.hqLocation, hqAddress, branchLocations, revenueEstimate, revenueBracket, sizeSegment, foundedYear, businessObjects. Update currentStep: '2'.
    After Step 1c: add corporateStack (full lattice — operatingBrand, leadership, operatingPlatform with platformExecutiveTeam, financialSponsor, engagementEntity, subsidiaries, collaborators, strategicPartnerships, dealUrgencyMultipliers, contactCrossReferences). Add top-level dealUrgencyMultipliers mirror. Update currentStep: '1c'.
    After Step 2b: add corporateStackEnrichment (Tier-A sibling deep fields, sponsor portfolio companies). Update currentStep: '2b'.
    After Step 2c: add buyerMap (people[], summary, futureBusinessChampions, preCallOutreach) + top-level namedBuyers + veraBuyerMapHintIntegration. Update currentStep: '2c'.
    After Step 2d: add corporateProfile (markdown string) + corporateProfileMeta. Update currentStep: '2d'.
    After Step 3-6: add systemPrerequisites, nearbyPeers, competitorFOMO, aiThoughtStarters, libraryContributions, useCaseLibraryUpdates, credentialingAnchors, fomoProfileHint. Update currentStep: '6'.
    Final STEP 7 write: set status: 'complete', verify all fields present, write generatedAt.
  Each write is a full overwrite of vera.json with the accumulated state. The agent reads from vera.json after compaction recovers context.

  SUB-AGENT DELEGATION (optional but recommended for token-pressure scenarios) — Tier-A per-sibling deep research in Step 2b is the single largest context consumer. To fan out: optionally delegate each Tier-A sibling's 4-search research to a sub-agent via the Agent tool. Pass: sibling name, sibling website (if known), sage.json.confirmedFlows[] (for applicableUseCases derivation), the 4 searches to run. The sub-agent returns the structured sibling block. Vera assembles results into siblingBrands[] without holding raw search content in her own context.
  Sub-agent prompt template: 'Research sibling brand {name} for a portfolio map. Run these 4 web searches: (1) IT leader, (2) value prop, (3) IT stack, (4) integration signal. Return ONLY the structured sibling card per the Step 2b schema. Cap at 4 searches. ~400 word output.'
  Sub-agent is OPTIONAL — single-context execution works for ≤2 Tier-A siblings.

  COMPACTION RECOVERY — if Vera notices her context has been compacted (older turns missing, summary visible): re-read vera.json (the accumulated state) and resume from the currentStep field. Do NOT restart from Step 1.

  LOCK-IN NOTE: Vera v1.1.0 is the locked specification as of 2026-05-22. No further principle additions; tighten/clarify only. If a new capability is needed, propose a separate downstream agent (e.g. a 'Drew' for deeper portfolio-mapping) rather than expanding Vera.
