# Corporate Stack Inference (Origination — Step 1c)

Step 1c — Corporate stack inference (origination — deep research):
  Vera ORIGINATES the corporate-stack seed. No upstream agent does this. Step 2b enrichment + downstream agents (Hawk template-angle, Petra portfolio context, Mira corporate brief) all depend on what Step 1c writes here.

  GOAL: produce a multi-layer ownership lattice with NAMED people at every level. Surface-level Google snippets are insufficient — Vera digs into 'Our Team' / 'Leadership' / 'About' / 'Investor Relations' / 'Press' pages on every entity in the lattice (operating brand, sub-rollup brands, operating platform, financial sponsor) and captures named executives + their roles + the specific facts that make this deal time-sensitive.

  PRINCIPLE: more sourced detail = better Hawk framing, better Petra copy, better Mira brief, better Corporate Profile in Step 1d. If a fact is on the public web with a working URL, capture it. If a fact is implied but not sourceable, set to null — never guess.

  RESEARCH PASSES — run in this order. Do NOT stop after Pass 2 just because the company has 'no parent'; many platforms are discoverable only via Pass 4 (executive cross-reference) or Pass 8 (strategic partnerships).

  1. OPERATING BRAND (always — this is the client itself):
     - Reuse the homepage HTML already fetched in Step 1. Read 'About', 'Company', 'Our Story', 'Our Team', 'Leadership', 'Press', 'News', 'History', footer.
     - Capture explicit ownership disclosures: 'A {Brand} company', 'Part of {Platform}', 'A portfolio company of {Sponsor}', '{Year} acquired by {X}', '{Year} platform investment from {Sponsor}', '{Year} joined {Platform}', 'In partnership with {X}'.
     - Capture LEADERSHIP: founders (still active?), current CEO / President / Executive Chairman, any leadership transition with date. Search '{ClientName} new president OR CEO appointment {year}' AND '{ClientName} executive changes site:businesswire.com OR site:prnewswire.com'.
     - Capture FOUNDED YEAR, full HQ ADDRESS (street + city + state + ZIP if listed in footer or 'Contact'), all BRANCH / OFFICE LOCATIONS (state + city per branch — these matter for sibling-region comparison later), SHORT DESCRIPTION (1-2 sentence positioning blurb).
     - LinkedIn URL: search '{ClientName} site:linkedin.com/company' OR scan homepage social links.
     - Capture: { name, website, linkedIn, foundedYear, hqAddress, branchLocations: [{ city, state, role (e.g. 'HQ' | 'branch' | 'service center') }], description, slug (kebab-case), sourceUrl }.

  2. SUB-ROLLUP UNDER OPERATING BRAND (pre-platform M&A history — common when the operating brand was itself a roll-up before joining a larger platform):
     - On the operating brand's website, read 'About' / 'Our Company' / 'History' / 'Acquisitions' for a list of acquired companies and acquisition years.
     - These are the legacy bolt-ons — distinct from platform-level siblings. They sit UNDER the operating brand in the lattice, not beside it.
     - For each entry: { name, acquisitionYear, originalLocation, website (if still separately maintained), sourceUrl, slug, note (one-line on whether it operates as separate brand or was absorbed) }.
     - Write to operatingBrand.legacyBoltOns[]. Empty array if the operating brand has no acquisition history.
     - Example: Peerless Fence Group has 10 pre-Elevate bolt-ons (Tru-Link, Imperial, Shogren, IFFT, Total, Link-n-Wood, Woodland, The Fence Store, Peerless Fence Supply, Peerless Systems) acquired 2013-2019 BEFORE joining Elevate. These live in operatingBrand.legacyBoltOns[], not in operatingPlatform.siblingBrands[].

  3. PARENT / OPERATING PLATFORM (if the client is a brand under a multi-brand holding, OR if the client itself is the platform rollup vehicle):
     - Search: '{ClientName} parent company' AND '{ClientName} owned by' AND '{ClientName} acquired by' AND '{ClientName} platform investment' AND '{ClientName} joined OR partnered with' AND '{ClientName} family of brands OR portfolio'.
     - Three common shapes — handle all:
       (a) PLATFORM-ABOVE: client is one brand under a larger multi-brand holding. Platform has its own website and 'Our Brands' / 'Our Family of Companies' / 'Portfolio' page (e.g. Authority Brands, Empower Brands, Elevate Fence Partners).
       (b) PLATFORM-IS-CLIENT: client itself is the PE-funded rollup vehicle and acquires bolt-ons directly under its own brand. Platform name == operatingBrand.name.
       (c) PLATFORM-VIA-ALLIANCE: client describes the relationship as a 'partnership' or 'alliance' rather than acquisition — but the partner entity has its own executive team, sibling brands list, and central infrastructure. This is functionally a platform even if the operating brand framing is softer. Confirm by checking the platform's 'Leadership' / 'Our Team' page for a centralized exec team and a multi-brand portfolio. If both exist, classify as platform-above regardless of how the operating brand describes the relationship.
     - Fetch the platform website 'Our Brands' / 'Portfolio' / 'Companies' / 'Family of Brands' / 'Our Company' / 'History' / 'Acquisitions' / 'Service Areas' / 'Locations' page.
     - For EACH sibling brand, capture at SEED TIME: { name, region (geographic region the platform assigns this brand — e.g. 'Midwest', 'Southeast (Florida)', 'Northeast', 'Digital / Direct-to-Consumer'), footprint (specific city/state branch locations the platform discloses for this sibling), website (if separately maintained), linkedIn (if found), acquisitionYear (if disclosed), sourceUrl, slug, isCurrentClient: true|false }.
     - REGIONAL-BRAND PATTERN: many platforms operate a 'one brand per region' strategy. Surface that pattern explicitly in operatingPlatform.regionalStrategy with sample: 'Platform operates 6 sibling brands by region: Midwest (X), Southeast-FL (Y, Z), Southeast-GA (W), Northeast (V), Digital (U).'
     - Capture: { name, website, linkedIn, description (platform thesis), platformShape: 'platform-above' | 'platform-is-client' | 'platform-via-alliance', regionalStrategy, rollupHistoryNarrative, siblingBrands: [...], sourceUrl }.
     - If no platform is found after 3 searches: set operatingPlatform = null AND record that the operating brand has no platform parent (don't leave it ambiguous).

  4. PLATFORM EXECUTIVE TEAM (CRITICAL — runs only if operatingPlatform != null):
     - Fetch the platform website 'Our Team' / 'Leadership' / 'Executive Team' / 'About' page.
     - For EACH named executive, capture: { name, title (verbatim), scope (1-2 sentence description of their portfolio-wide responsibility), linkedIn (if found), sourceUrl }.
     - Common platform roles to look for: CEO, CFO, COO, Director / VP of M&A, Director of FP&A, Director of Accounting, Director of Marketing, Director / VP of IT, Director / VP of Operations, General Counsel.
     - Write to operatingPlatform.platformExecutiveTeam[].
     - CROSS-REFERENCE TO sage.json namedContacts[]: for each platform executive, check if their name matches any entry in sage.json.namedContacts (case-insensitive substring match on first + last name).
        - If a match is found: flag it. Example — Brian Cook appears in sage.json as 'Peerless IT / infrastructure admin' AND in operatingPlatform.platformExecutiveTeam[] as 'Elevate Fence Partners — Director of IT'. The sage.json title is operating-brand-local; the platform title is the real role. The match means this person operates at the PLATFORM level, not just the operating-brand level — their decisions during scoping are platform-wide standard-setting, not one-off tasks.
        - Write the match into vera.json.contactCrossReferences[]: { sageContactName, sageTitle, platformTitle, platformScope, implication (one sentence), isExecutiveSponsorCandidate: true|false }.
        - Orchestrate.js will apply this to company_context.json.namedContacts[N].platformRole (added field) — sage.json itself is NEVER modified per agent boundary rule.
     - Identify executive-sponsor candidates: the platform executive whose role MATERIALLY DRIVES the engagement scope (e.g. Director of IT for an integration / ERP engagement; Director of M&A for a portfolio-template engagement). Mark with isExecutiveSponsorCandidate: true.

  5. FINANCIAL SPONSOR (PE / VC / strategic acquirer):
     - Search: '{operatingPlatform.name} OR {ClientName} private equity' AND '{X} acquired by' AND '{X} majority investor' AND '{X} portfolio company' AND '{operatingPlatform.name} {currentYear-3 to currentYear} acquisition OR funding'.
     - Sponsor may sit at the PLATFORM level (most common — Akoya invests in Elevate Fence Partners, which owns Peerless) OR at the OPERATING-BRAND level (Akoya invests in Peerless directly, which then joins Elevate independently). Capture the relationship explicitly.
     - Cross-check via: BusinessWire / PRNewswire press releases, Mergr / Crunchbase mentions in news snippets, the PE firm's own website portfolio page.
     - From the PE firm's site capture: founded year, HQ city, stated investment range (e.g. '$25M-$200M revenue middle-market'), sector focus list, and — critically — the THESIS for THIS investment ('Akoya stated explicit intent to acquire a Platform Investment in Residential Home Services').
     - Capture: { name, website, hq, foundedYear, investmentRange, sectorFocus: [...], thesisForClient (1-2 sentence verbatim from sponsor's site or release), acquisitionDate (full ISO date if disclosed, else year only), relationshipToOperatingPlatform: 'invested-in-platform' | 'invested-in-operating-brand' | 'invested-in-both' | 'unclear', sourceUrl }.
     - If the relationship to the platform is unclear (e.g. sponsor acquired operating brand at year X, platform first appears in public sources at year Y > X): set relationshipToOperatingPlatform = 'unclear' AND write a 'relationshipUncertainty' note explaining the open question.
     - If no sponsor is found after 2 searches: set financialSponsor = null.

  6. SUBSIDIARIES (brands the OPERATING BRAND itself owns — NOT pre-rollup bolt-ons, which live in operatingBrand.legacyBoltOns[]):
     - Check the client's own website for 'Our Companies', 'Our Brands', 'Subsidiaries', 'Divisions' that are CURRENTLY OPERATED as distinct subsidiaries (not just historical acquisitions absorbed into the parent).
     - Capture as subsidiaries[] with { name, website, foundedOrAcquiredYear, sourceUrl }. Empty array if none.
     - When platform is platform-is-client (shape b): sibling brands live in operatingPlatform.siblingBrands[] — do NOT duplicate them into subsidiaries[].

  7. COLLABORATORS (strategic partners, channel partners, or major-customer relationships that MATERIALLY shape integration scope):
     - Sources: homepage 'Partners' page, sage.json businessContext (e.g. a Home Depot pro-services channel relationship that drives the lead flow), press releases, named-customer logos on website.
     - Include only relationships that influence what gets integrated. EXCLUDE generic vendor logos (the client uses Salesforce — Salesforce is a system, not a collaborator).
     - Capture as collaborators[] with { name, relationshipType ('channel-partner' | 'strategic-partner' | 'major-customer' | 'reseller' | 'franchise'), website, sourceUrl, why (1 sentence on how it shapes integration scope) }.

  8. STRATEGIC PARTNERSHIPS / CONSORTIUMS (distinct from collaborators — these are higher-stakes alliances that CHANGE the client's growth trajectory):
     - Sources: press releases ('{ClientName} announces strategic partnership'), homepage 'Partnerships' page, news searches for '{ClientName} joins' AND '{ClientName} alliance' AND '{ClientName} consortium'.
     - Distinct from collaborators in two ways: (a) they're company-level, not deal-level; (b) they enable growth / national expansion / category extension rather than just channel routing.
     - If a strategic partnership LOOKS like a platform (the partner has its own exec team and multiple brands), reclassify it as operatingPlatform via Pass 3 logic — don't double-record.
     - Capture as strategicPartnerships[] with { name, partnerType ('national-expansion' | 'category-extension' | 'consortium' | 'joint-venture'), website, sourceUrl, description (2-3 sentences on what the partnership does), integrationImpact (specific sentence on how this partnership reshapes integration scope — e.g. 'Multi-state ComputerEase company codes' or 'Adds a B2B EDI channel') }.

  9. ENGAGEMENT ENTITY (the legal entity DataSkate contracts with):
     - Default: engagementEntity.name == operatingBrand.name, sameAsOperatingBrand: true.
     - If the client is a subsidiary that signs under the parent platform's MSA: sameAsOperatingBrand: false, name = parent legal entity name.
     - Add a 'note' field describing the contracting flow AND why a successful engagement creates downstream value for the parent / sponsor.

  10. DEAL URGENCY MULTIPLIERS (the strategic 'why now' angles that fall out of the lattice — single most valuable Hawk input):
      - Generate 3-6 entries. Each entry is 1-2 sentences. Patterns to use:
        - PORTFOLIO-TEMPLATE angle: 'The current engagement is being designed inside {operatingBrand} but the {platform} executive team manages standardized integrations across {N} sibling brands. This is a portfolio-template play from day 1.'
        - PE-FUTURE-DEAL angle: '{Sponsor} is explicitly hunting for another {sector} platform — a successful {client} integration template is the most direct way to position DataSkate as the integration partner of record for {sponsor}'s next acquisition.'
        - SIBLING-EXPANSION angle: '{Platform} operates a regional-brand strategy with {N} siblings in {regions}. Each new sibling brand = a new ComputerEase company code + state-specific permit/tax rules + HD Portal tenant. Build the template once for {operatingBrand}, deploy it N times.'
        - SUB-ROLLUP-EXPANSION angle: '{OperatingBrand}'s own pre-platform rollup history ({named legacy bolt-ons}) means even WITHIN the operating brand there are sibling-like brands that retain separate operations — each one is a same-template second engagement candidate.'
        - NEW-LEADERSHIP angle: '{New executive} (appointed {date}) is in a first-18-months window where IT modernization decisions tend to be made.'
        - EXEC-SPONSOR-IN-ROOM angle: '{Platform Director of IT name} is already actively engaged in scoping conversations (per sage.json transcripts) — the platform executive sponsoring the integration standard is in the room. This is the rarest deal-urgency multiplier of all.'
        - NATIONAL-EXPANSION angle: '{OperatingBrand} is mid-transition from regional to national via {strategic partnership / platform}. The integration template being designed NOW is the foundation for every new-state rollout.'
        - GREENFIELD angle: 'No sibling has a known integration footprint — DataSkate sets the template from scratch and every future sibling inherits it.'
      - Each multiplier must reference SPECIFIC facts captured in passes 1-9 (named people, named brands, named regions, dated events). NO generic deal-urgency platitudes ('growth company', 'digital transformation') — those are filtered out.
      - Write to vera.json.corporateStack.dealUrgencyMultipliers[] AND mirror to top-level vera.json.dealUrgencyMultipliers[] so Hawk reads it without traversal.

  WRITE to vera.json.corporateStack:
    {
      ownership: 'independent' | 'subsidiary' | 'brand-of-platform' | 'platform-rollup-vehicle' | 'pe-backed' | 'pe-backed-platform-of-brands' | 'unknown',
      operatingBrand: {
        name, website, linkedIn, foundedYear, hqAddress,
        branchLocations: [ { city, state, role } ],
        description, slug, sourceUrl,
        legacyBoltOns: [ { name, acquisitionYear, originalLocation, website, sourceUrl, slug, note } ]
      },
      leadership: {
        founders: [{ name, role, stillActive }],
        executiveChairman: { name, transitionedFrom, transitionDate } | null,
        ceo: { name, appointmentDate } | null,
        president: { name, appointmentDate } | null,
        leadershipTransitionNote: '1-2 sentence summary of any recent transition' | null
      },
      operatingPlatform: {
        name, website, linkedIn,
        description (1-2 sentence platform thesis),
        platformShape: 'platform-above' | 'platform-is-client' | 'platform-via-alliance',
        regionalStrategy: '1 sentence — how the platform groups its sibling brands by region/channel' | null,
        rollupHistoryNarrative,
        siblingBrands: [ { name, region, footprint, website, linkedIn, acquisitionYear, sourceUrl, slug, isCurrentClient } ],
        platformExecutiveTeam: [ { name, title, scope, linkedIn, sourceUrl, isExecutiveSponsorCandidate } ],
        sourceUrl,
        relationshipUncertainty: '... if relationship to sponsor is unclear' | null
      } | null,
      financialSponsor: {
        name, website, hq, foundedYear, investmentRange,
        sectorFocus: [...],
        thesisForClient,
        acquisitionDate,
        relationshipToOperatingPlatform: 'invested-in-platform' | 'invested-in-operating-brand' | 'invested-in-both' | 'unclear',
        sourceUrl
      } | null,
      engagementEntity: { name, sameAsOperatingBrand, note },
      subsidiaries: [ { name, website, foundedOrAcquiredYear, sourceUrl } ],
      collaborators: [ { name, relationshipType, website, sourceUrl, why } ],
      strategicPartnerships: [ { name, partnerType, website, sourceUrl, description, integrationImpact } ],
      dealUrgencyMultipliers: [ '1-2 sentence specific multiplier — see Pass 10' ],
      sourcesNote: '2-4 sentence narrative listing the primary URLs used',
      confidence: 'high | medium | low',
      researchedAt: '{ISO date}'
    }

  ALSO write top-level vera.json.dealUrgencyMultipliers[] (mirror of corporateStack.dealUrgencyMultipliers[]) so Hawk reads it without traversal.
  ALSO write vera.json.contactCrossReferences[] (from Pass 4) for orchestrate.js to apply to company_context.json.namedContacts[N].platformRole.
  ALSO write company.foundedYear, company.hqAddress, company.sizeSegment ('smb' | 'midmarket' | 'enterprise' — derived from revenueBracket) to vera.json.company so Petra/Mira read them flat.

  INDEPENDENCE DETERMINATION:
    Only after ALL passes (1-5, 8) complete with no parent / no platform / no sponsor / no strategic-alliance-with-platform-shape signal AND the client's own website does not claim subsidiaries:
      Set ownership = 'independent'. operatingPlatform = null, financialSponsor = null, subsidiaries = []. Pass 10 multipliers may still be populated from leadership / collaborator / sub-rollup angles. Step 2b will skip cleanly.

  NEVER fabricate ownership relationships, leadership names, acquisition dates, executive titles, or thesis language. If a search returns ambiguous or thin results (one blog post citing a rumor): set confidence = 'low' and append the suffix ' (unverified)' to the field value. If nothing is found: set the field to null — not a guess. Every field with content must have a sourceUrl that resolves.

  COST GUARDRAIL: cap at ~16-20 web searches total for this step (was 10-12; expanded for platform executive team + sub-rollup + strategic partnerships + cross-reference). If the first 3-4 searches show no parent / no acquisition / no PE / no alliance: stop and write ownership = 'independent'. Family-owned / regional businesses are still the common case — do NOT keep searching just to fill the slot, but DO go deeper when ANY signal of platform / sponsor / alliance appears.
