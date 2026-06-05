# Corporate Brief Consistency — Audit Checklist

CORPORATE BRIEF CONSISTENCY — when projects/{client}/intake/corporate-brief-content.json exists:
  Mira reads it as the buyer would and treats every fact as a public claim DataSkate is making about the buyer's corporate structure. Drift here is more damaging than drift in proposal/intake because this is the FIRST document the buyer reads — wrong facts here invalidate everything downstream.

  Verify every field against the source-of-truth chain:
    operatingBrand.name + website + linkedIn  → must match company_context.json.corporateStack.operatingBrand exactly
    operatingBrand.legacyBoltOns[]              → must match corporateStack.operatingBrand.legacyBoltOns[] exactly
    leadership.{founders,executiveChairman,ceo,president} → must match corporateStack.leadership exactly
    operatingPlatform                            → must match corporateStack.operatingPlatform exactly (incl. platformExecutiveTeam, regionalStrategy, platformShape)
    operatingPlatform.platformExecutiveTeam[]   → each named executive: verify name + title matches Vera's source. If any executive has isExecutiveSponsorCandidate: true: ensure they appear in the brief's 'People to Engage' section with that designation.
    financialSponsor                             → must match corporateStack.financialSponsor exactly (incl. thesisForClient, relationshipToOperatingPlatform)
    siblingBrands[].name + website + integrationSignal → must match corporateStack.operatingPlatform.siblingBrands[]
    strategicPartnerships[]                      → must match corporateStack.strategicPartnerships[]
    dealUrgencyMultipliers[]                     → must match company_context.json.dealUrgencyMultipliers[] verbatim
    publicStakeholders[]                         → every entry must have sources including 'transcript' in the underlying buyerMap.people[N] (no web-only entries in the public section — those go to internalCallPrep)
    citations[].url  → every URL must resolve (Mira fetches each; if any 404s, drop it from the citation list and re-render)

  Verify every siblingBrand.integrationSignal: either cites a real sourceUrl OR is the literal string 'unknown — no public integration footprint found'. Any other unsourced sentence is fabrication — REWRITE to 'unknown' with no fake citation.

  Verify forwardLookingTalkingPoints[] and intelTheBuyerLacks[]: every entry MUST have a sourceUrl. If Vera failed to attach one, drop the entry — better to ship a leaner brief than to claim an unsourced fact in the artifact that establishes our credibility.

  Verify ALL URLs in the JSON sourceUrl fields are https:// public URLs. No localhost, no firebase-internal paths. (Mira does NOT read the rendered HTML — the template emits these URLs verbatim, so JSON-level verification is sufficient.)

  If corporate-brief-content.json does NOT exist but company_context.json.corporateStack.operatingBrand IS populated: ESCALATE — orchestrate.js missed the post-Vera hook. Mira re-runs `npm run build:html` then copies portal/_build/intake/corporate-brief-{slug}.html → projects/{slug}/intake/client/corporate-brief-{slug}.html and records the recovery in mira.json escalations[].
