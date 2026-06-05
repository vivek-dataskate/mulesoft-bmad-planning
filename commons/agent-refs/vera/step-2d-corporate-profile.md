# Corporate Profile (Step 2d — Narrative Brief)

Step 2d — Corporate Profile (deep narrative brief). Runs LAST in the corporate-research arc, after Step 1c (lattice), Step 2b (sibling enrichment), Step 2c (buyer map). Synthesizes everything into an executive-quality brief.

  WHY THIS EXISTS: a mere Google search returns the company's marketing site and a few press releases. The Corporate Profile is what an experienced enterprise-sales architect would write after a day of digging — it surfaces the LATTICE, the NAMED PEOPLE (current engagement AND future business), the STRATEGIC SIGNALS, and the 'how we see you' framing that the buyer cannot get from their own website. Intended to feel like a private intelligence brief, not a recap.

  RULES:
    - Markdown-formatted multi-section document. Section headers as level-2 (##).
    - Length: target 1500-3000 words. Density over length — every paragraph must say something the next agent cannot derive from a one-line summary.
    - Every concrete claim (founders, acquisition dates, leadership transitions, executive titles, revenue estimates) must have a sourceUrl inline as a markdown link [text](url). If you can't source it, don't claim it.
    - No marketing platitudes ('industry-leading', 'innovative', 'cutting-edge'). Replace with specific facts.
    - Write in the voice of an internal DataSkate sales-engineering brief addressed to the architect on the engagement — confident, sourced, judgment-forward.
    - End every fact-paragraph with a 'why this matters' clause when the implication isn't obvious.

  REQUIRED SECTIONS (in this order):

    ## 1. Origin & History
      - Founding year, founders (named, with role), generational ownership story (e.g. 'second-generation family-owned, founder transitioned to Executive Chairman 2024-02-05').
      - Key transitions: PE acquisitions, mergers, leadership changes — with dates and sourceUrls.
      - Pre-platform sub-rollup history (if any): named bolt-on acquisitions with year, original location, current status. Read from corporateStack.operatingBrand.legacyBoltOns[].

    ## 2. Business Model
      - What they actually do: product mix, customer mix, geographic footprint with named branches.
      - Channel mix (e.g. 'X% Home Depot Pro channel, Y% direct-to-consumer, Z% commercial' — when knowable).
      - Revenue model + revenue estimate (with bracket and source).
      - Why this business model matters for the integration: which data is high-volume, which is high-stakes, which is regulatory-bound.

    ## 3. Corporate Stack — The Lattice
      - Operating brand → operating platform → financial sponsor — each layer named, sourced, dated.
      - Platform executive team: every person from corporateStack.operatingPlatform.platformExecutiveTeam[] — name, title, scope (1-2 sentences each). Flag exec-sponsor candidates.
      - Sub-rollup history under operating brand (if any): from corporateStack.operatingBrand.legacyBoltOns[].
      - Strategic partnerships / alliances (distinct from collaborators).
      - Relationship uncertainties flagged honestly (e.g. 'Akoya/Elevate relationship not fully resolvable from public sources — pending engagement-side confirmation').

    ## 3a. Sibling Brands — Portfolio Map (deep dive per Tier-A sibling)
      - One subsection per sibling brand from corporateStack.operatingPlatform.siblingBrands[]. Render Tier-A siblings (tierAResearched: true) as full cards; Tier-B siblings as a single-line summary at the bottom.
      - For each Tier-A sibling card include ALL of:
        - Header: '### {sibling.name} — {region}'
        - Footprint: branch cities/states.
        - Value prop: 1-2 sentences on what they do and how they differ from the operating brand (from siblingBrands[N].valueProp).
        - IT leader: name, title, [LinkedIn](url), tenure if known (from siblingBrands[N].itLeader). If null: write 'No public IT leader identified yet — capture at sibling intake.'
        - Known IT stack: bullet list of systems from siblingBrands[N].itStack.knownSystems. Include stackHints sentence as a follow-up paragraph if present.
        - Named customers: bullet list (up to 5) from siblingBrands[N].namedCustomers.
        - Applicable use cases — from current engagement: bullet list. For each entry in siblingBrands[N].applicableUseCases[]:
          - '{ucId} ({applicable ? 'applies' : 'does not apply'}): {transferNote}'
        - Integration signal: siblingBrands[N].integrationSignal (1 sentence or 'unknown — no public integration footprint found').
        - Future-engagement note: siblingBrands[N].futureEngagementNote — 1-2 sentences synthesizing when this sibling becomes a templated engagement candidate.
      - For Tier-B siblings (compact): single line — '{name} ({region}, {footprint}) — {integrationSignal}'.
      - End the subsection with 1 paragraph synthesizing the portfolio map: 'Out of N siblings, M operate as distinct entities with maintained websites, K have a known IT stack overlap with the current engagement, and J are the highest-likelihood templated second engagements based on {specific signals}.'

    ## 4. People to Engage — Current Engagement
      - Read buyerMap.people[] (Step 2c output). For each person, produce a pen-portrait paragraph:
        - Name, role at operating brand, role at platform (if applicable).
        - Source: transcript / web / both.
        - Deal role(s) assigned (economicBuyer, championOnCall, technicalInfluencer, operationalInfluencer).
        - 2-3 sentence pen-portrait — what they care about, what they came from (tenure / priorRole), what they're trying to optimize.
        - The angleForHawk and angleForIvy from buyerMap.people[].
        - The talkingPointSeed from buyerMap.people[].
      - Section MUST highlight CROSS-REFERENCED contacts prominently. Example: 'Brian Cook is in sage.json as the Peerless IT admin AND on the Elevate Fence Partners executive team as Director of IT (corporateStack.operatingPlatform.platformExecutiveTeam[N], cross-matched in buyerMap.people[M] with matchConfidence high). The same person, two views. The platform title is the real role — every architecture conversation in scoping is platform-template setting, not local IT triage.'
      - Include buyerMap.summary.coverageNote prominently so the architect knows who is missing.

    ## 5. People to Engage — Future Business
      - Read buyerMap.futureBusinessChampions[] (Step 2c Pass 4 output).
      - For each: name, role, organization (platform / sponsor), why they matter for the NEXT deal, when to engage, what signal to wait for before engaging.
      - One paragraph synthesizing 'recommended next touchpoints' across the next 6-12 months — specifically when to request the platform-level briefing and which sibling deal to use as the proof-point.

    ## 6. Strategic Position — Why Now
      - Deal urgency multipliers from corporateStack.dealUrgencyMultipliers[], rewritten as connected prose — not bullets.
      - Each multiplier as 1-2 paragraphs with the specific fact, the inference, and the implication.
      - Final paragraph synthesizes the deal-sizing collapse: 'If this engagement is treated as operating-brand-only, the deal is X. If it is treated as the platform template, the deal is NX plus M-acquisition-per-year recurring template deployment. The cost of the smaller framing is the cost of M future re-scopings.'

    ## 7. Signals to Watch
      - Recent news, leadership changes, M&A activity, regulatory shifts, technology decisions — anything from the last 12-18 months that affects the integration scope or the deal timing.
      - For each signal: source link, what it means, what it changes.
      - Surface buyerMap.people[].webEvidence.appointmentDate / tenureMonths data for recent appointments — these are deal-timing signals.

    ## 8. How We See You
      - 2-3 paragraphs in the voice of DataSkate addressed to the buyer.
      - Names the buyer's situation specifically: 'You are a {sizeSegment} {industry} {operatingBrand description} sitting inside {operatingPlatform} which is itself backed by {sponsor}. The integration you are scoping isn't an internal IT project — it's a portfolio-template decision that {platform Director of IT name} is in the room to make.'
      - Mirrors language and concepts from the buyer's own marketing materials AND from sage.json transcripts (the buyer's own words about their pain — the primaryPainQuote and aspirationQuote from sage.json.quotes).
      - Ends with the specific outcome the proposal will produce in the next 60-90 days.

  WRITE the markdown document to vera.json.corporateProfile (as a single string with literal '\n' newlines). Total length: 1500-3000 words.
  ALSO write vera.json.corporateProfileMeta:
    { wordCount, sectionCount, sourceUrlCount, namedContactCount, generatedAt: '{ISO date}', confidence: 'high | medium | low' }.

  Orchestrate.js post-Vera will read vera.json.corporateProfile + vera.json.buyerMap + vera.json.corporateStack and compose projects/{client}/intake/corporate-brief-content.json (replacing the current minimal renderCorporateBrief output). Mira then verifies the rendered brief; the build:html step renders the HTML deliverable.

  NEVER fabricate. Every section must be grounded in sources captured in Steps 1, 1b, 1c, 2b, or 2c. If a section would require a fact you don't have: shorten the section, flag the gap, do NOT invent.

  COST GUARDRAIL: this principle requires NO additional web searches — it operates entirely on data already in vera.json from prior steps. If 1-2 final fact-check searches are needed to resolve a specific claim, that's fine, but the budget for Steps 1c + 2b + 2c should have already produced everything needed.
