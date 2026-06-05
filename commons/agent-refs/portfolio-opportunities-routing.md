# Portfolio Opportunities Routing (Corporate-Brief-Bound Only)

Portfolio opportunities — populates a SEPARATE bucket portfolioOpportunities[] in flo.json. These entries land in the CORPORATE BRIEF only. They are NEVER surfaced in the proposal (proposal-content.json) or the intake (intake-content.json). The orchestrator's renderCorporateBrief() reads this bucket post-Flo and appends it as a 'Portfolio Integration Opportunities' section.

  WHY THIS BUCKET EXISTS: Vera surfaces the overall corporate structure (operating brand → siblings → platform → sponsor → strategic partnerships) and Rex enumerates EVERY system at the operating brand. The combined view contains integration opportunities that are NOT part of the current engagement's scope but ARE the natural next-engagement / next-sibling / next-portco template deployments. Putting these in the proposal makes the deal feel like sales overreach (buyer asked for X, got 3X). Putting them in the intake confuses the operational team. The corporate brief — read by the architect + AE + future deal team — is the right home.

  HARD ROUTING RULE: every portfolioOpportunities[] entry MUST carry proposalExclusion: true and intakeExclusion: true. Petra and Quinn filter on these flags as defense-in-depth — a misplaced entry can never leak into the proposal or intake by construction.

  SOURCES — generate entries from these signals (every entry MUST tag source):
  A. REX-UNCOVERED OPERATING-BRAND SYSTEMS (source: 'rex-uncovered-system'):
     Read rex.json system inventory. For each system at the operating brand that (a) no confirmed flow touches AND (b) does NOT qualify as scope-adjacent under the Adjacent Flow Detection principle, generate a portfolio entry. These are future engagements at the SAME client — not extensions of THIS one.
     Example: confirmed flows touch SFDC + HD Portal + ComputerEase. Rex catalogues Acumatica + ADP + Slack at the operating brand. None of those share entities with the confirmed flows → portfolio entries for 'Acumatica → SFDC finance sync (future engagement)', 'ADP → ComputerEase HR sync (future engagement)'.
  B. SIBLING-TEMPLATE DEPLOYMENT (source: 'sibling-template'):
     Read vera.json.corporateStackEnrichment.operatingPlatform.siblingBrands[]. For each Tier-A sibling with applicableUseCases[] entries marked applicable=true, generate ONE portfolio entry per applicable UC restated as a sibling-template flow. Pull the regional adaptation directly from siblingBrands[N].applicableUseCases[M].transferNote. Reference both the source UC id and the sibling slug. Skip siblings flagged isCurrentClient=true.
     Example: 'Imperial Fence — UC1 HD Portal → Salesforce Lead (template deployment): same 10-min polling pattern as Peerless; regional adaptation: separate ComputerEase company code for IL state-line.'
  C. LEGACY SUB-ROLLUP BOLT-ON (source: 'legacy-boltOn'):
     Read vera.json.corporateStack.operatingBrand.legacyBoltOns[]. For each bolt-on whose note indicates it 'operates as separate brand' (NOT 'absorbed'), generate one portfolio entry: 'template the current engagement to {boltOn.name}'.
     Skip bolt-ons noted as fully absorbed.
  D. SPONSOR PORTFOLIO CROSS-DEPLOYMENT (source: 'sponsor-portco'):
     Read vera.json.corporateStackEnrichment.financialSponsor.portfolioCompanies[]. For each portco in an adjacent industry (sector overlap with the operating brand's sector), generate ONE portfolio entry: 'template the current engagement to {portco.name} ({portco.category})'.
  E. STRATEGIC-PARTNERSHIP INTEGRATION (source: 'strategic-partnership'):
     Read vera.json.corporateStack.strategicPartnerships[]. For each partnership whose integrationImpact field names a system or channel NOT in confirmedFlows[] (e.g. 'Adds a B2B EDI channel', 'Multi-state ComputerEase company codes'), generate one portfolio entry restating the partnership-driven integration.

  ENTRY SCHEMA (each portfolioOpportunities[] entry):
    {
      id:               'PO-{NNN}',                              // sequential, scoped to flo.json
      source:           'rex-uncovered-system' | 'sibling-template' | 'legacy-boltOn' | 'sponsor-portco' | 'strategic-partnership',
      title:            '{short name — what would be integrated}',
      systems:          ['{source}', '{target}'],                // 1+ entries; sibling-template entries restate current UC systems
      entity:           '{primary entity}',                       // Customer | Lead | PO | Invoice | etc.
      atEntity:         '{operating brand | sibling name | portco name | partnership name}',
      atEntitySlug:     '{kebab-case slug for the receiving entity}',
      referenceUcId:    '{UC{N} when source is sibling-template; null otherwise}',
      rationale:        '1-2 sentences — what makes this a portfolio opportunity, not a scope-adjacent flow',
      regionalAdaptation: '1 sentence' | null,                    // sibling-template only
      whenToEngage:     '1 sentence — what signal to wait for before pursuing',
      sourceUrl:        '{evidence URL from vera.json / rex.json}' | null,
      proposalExclusion: true,                                    // ALWAYS true — defense-in-depth
      intakeExclusion:   true                                     // ALWAYS true — defense-in-depth
    }

  PROMOTION TESTS (apply per entry — drop entries that fail):
    - Buyer-reading-proposal test: would the buyer reading the proposal say 'we didn't ask for any of that'? If YES → portfolio (correct), if NO → potentialFlows (correct bucket is Adjacent Flow Detection).
    - Different-legal-entity test: does the flow involve a different legal entity from the engagement entity (vera.json.corporateStack.engagementEntity)? If YES → portfolio (sibling / portco / partnership). If NO and no confirmed flow touches the system → portfolio (future-engagement at same entity).
    - Single-source test: every entry MUST cite at least one upstream source — vera.json corporate stack path OR rex.json system inventory path. No source = drop the entry.

  CAPS — keep the bucket curated, not exhaustive:
    - rex-uncovered-system:  up to 6 entries (the most operationally relevant; prefer systems that share a buyer with confirmed flows).
    - sibling-template:      up to 4 siblings × up to 2 UCs each = 8 max (rank by sibling tier + applicableUseCases length).
    - legacy-boltOn:         up to 4 entries (only bolt-ons operating as separate brands).
    - sponsor-portco:        up to 4 entries (only adjacent-industry portcos).
    - strategic-partnership: up to 3 entries.
    Total cap: 25 portfolio opportunities. If the natural list exceeds this, write the count to portfolioOpportunitiesTruncatedNote with what was excluded.

  EMPTY-OK: if Vera flagged ownership='independent' AND Rex's full system inventory is contained within confirmedFlows[], it is correct to write portfolioOpportunities: [] with a note 'No portfolio opportunities — operating brand is independent and full system inventory is in scope.' Do NOT invent entries to fill the bucket.
