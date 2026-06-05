# Buyer Map (Step 2c — Transcripts × Web Cross-Match)

Step 2c — Buyer map: identify the right person for THIS proposal and for FUTURE business, by cross-matching transcript-named people against web-researched leadership.

  GOAL: produce a per-person roster classifying each stakeholder as economic buyer, champion, technical influencer, operational influencer, future-business champion, or detractor — each with a specific positioning angle for Hawk and a psychology hint for Ivy.

  PRINCIPLE: a person who appears in BOTH sage.json.namedContacts[] AND web research (Step 1c leadership, LinkedIn 'People' tab, press release announcements) is the highest-value signal — we know who they are, we know they're in the room, and we have public context (background, tenure, prior role). Optimize for surfacing these matches.

  RESEARCH PASSES (run in order — cap total searches at ~15-20 for this step):

  1. SEED FROM TRANSCRIPTS — read sage.json.namedContacts[]. For each entry, capture { name, titleFromTranscript, email, systemsOwned[], responsibilitiesFromTranscript[], accessChain }. These are the transcript-side seeds.

  2. SEED FROM CORPORATE STACK — read corporateStack.leadership (already populated in Step 1c). Add founders, CEO, President, Executive Chairman as web-side seeds.

  3. AGGRESSIVE PER-ROLE WEB RESEARCH — for the operating brand, search EACH of these roles whether or not the transcript named them:
     - CFO / VP Finance (budget approver / economic-buyer candidate)
     - CIO / CTO / VP IT / Director of IT (technical decision veto)
     - COO / VP Operations (operational pain owner)
     - VP / Director of the FUNCTION this integration serves (Revenue Ops, Customer Success, Field Ops, Project Ops — derive from sage.json.confirmedFlows[])
     - Head of Data / Analytics (if any flow surfaces reporting)
     - General Counsel / VP Legal (only if the deal touches PII / HIPAA / contract data)
     Search pattern per role:
       '{ClientName} {role} site:linkedin.com/in'
       '{ClientName} new {role} appointment {currentYear} OR {currentYear-1}'
       '{ClientName} {role} site:businesswire.com OR site:prnewswire.com'
     Capture per person: { name, title, linkedIn, tenureMonths (compute from earliest LinkedIn-visible start date if shown), priorRole (most recent prior, if shown), backgroundSummary (1-2 sentence summary of LinkedIn About / press release context — what industries/companies they came from, what they tend to optimize for), sourceUrl }.

  4. PE / PLATFORM FUTURE-BUSINESS PASS — when corporateStack.operatingPlatform.name OR corporateStack.financialSponsor.name is set:
     - Search '{operatingPlatform.name} VP Integration OR Head of IT OR Chief Digital Officer site:linkedin.com/in'
     - Search '{financialSponsor.name} operating partner technology OR operations site:linkedin.com/in'
     - Search '{financialSponsor.name} operating partner {sectorFocus from corporateStack.financialSponsor.sectorFocus[0]}'
     The platform's shared-services / integration lead is the highest-value future-business champion (every sibling rolls up to them). The sponsor's sector-focused operating partner is the cross-portfolio future-business champion (next bolt-on inherits the playbook).
     Capture each as a futureBusinessChampion entry — NOT in the main people[] roster (they're not on THIS deal), but in a separate futureBusinessChampions[] array.

  5. CROSS-MATCH (transcripts × web) — for each transcript person, find the best web match:
     - Match key 1: first name + last name string equality (case-insensitive) → match
     - Match key 2: first name + role tokens overlap (e.g. transcript says 'our CFO Jean', web has 'Jean Jacobs, CFO') → match if role tokens overlap by ≥1
     - Match key 3: first name only + sole web candidate at that company → match with confidence 'medium'
     - No match → keep as transcript-only entry
     Set matchConfidence: 'high' (full name + title corroborated) | 'medium' (first-name + role-overlap) | 'low' (first-name only, ambiguous) | 'transcript-only' | 'web-only'.

  6. CLASSIFY ROLE — for each person assign role from this enum, based on title + transcript signals + accessChain:
     - 'economicBuyer'         — signs the PO. Default heuristic: CEO/President for ≤$250K deals at <$50M revenue; CFO/COO at $50M-$500M; CFO + IT veto at $500M+. Override with transcript evidence (Ivy's 'I own the budget' / 'I sign off' signals if Sage captured them).
     - 'championOnCall'        — the person driving the internal sale. Heuristic: the most-quoted name in sage.json or the contact who scheduled the call.
     - 'technicalInfluencer'   — IT / Eng leader who can veto on tech merit. accessChain.isSystemAdmin = true is a strong tag.
     - 'operationalInfluencer' — function head whose team feels the pain (Revenue Ops VP, Ops Director).
     - 'detractor'             — flagged only when (a) sage.json transcript shows skepticism explicitly attributed to a named person, OR (b) web research surfaces a recent transition where the new hire's prior employer competes with DataSkate or with the integration approach (e.g. former Boomi VP just hired as CIO).
     - 'unknown'               — title insufficient to classify. Surface in conversational review.
     Exactly one person should be classified 'economicBuyer' and exactly one 'championOnCall' per call. If sage.json suggests they're the same person: set isSameAsCaller: true on the championOnCall entry and add a duplicate 'economicBuyer' entry with isSameAsChampion: true.

  7. PER-PERSON ANGLES — for each classified person (NOT for detractors except via warning field), produce:
     - angleForHawk:  1 sentence on which deal-urgency angle from corporateStack.dealUrgencyMultipliers[] resonates with THIS person, given their background. Example: 'Recent CFO from a PE-backed rollup → leads with templated-playbook angle (multiplier #2), not greenfield risk.'
     - angleForIvy:   1 sentence psychology hint based on title + background + tenure. Example: '18 months tenure, came from a Big-4 consulting practice → likely systematic-evaluator with roi-analytical secondary.' Ivy treats this as a HINT — her signal scoring on sage.json transcript phrases still has priority.
     - talkToBefore:  true | false. Set true ONLY for technicalInfluencer / operationalInfluencer who was NOT on the call but whose veto is structural (e.g. the sole ComputerEase admin who has to grant API access). Default false for economicBuyer (talking to the EB pre-call is the AE's job, not the architect's).
     - talkToBeforeRationale: 1 sentence — only set when talkToBefore = true.
     - talkingPointSeed: 1 sentence the architect can drop in a pre-call email or in the call to engage THIS person specifically — grounded in their background (e.g. 'Jean — I saw you've been the sole ComputerEase admin since 2019. The integration design preserves your control over user access groups; nothing changes about how you manage CE users today.')

  WRITE to vera.json.buyerMap:
    {
      summary: {
        economicBuyer:  { name, title, matchConfidence, missingSignal: null | '1 sentence if confidence < high' } | null,
        championOnCall: { name, title, matchConfidence } | null,
        coverageNote:   '1-2 sentences — who do we wish was in the room but isnt named? e.g. "No IT/CIO named yet — Brent (transcript) is infrastructure-only; the Salesforce admin should be identified before kickoff."'
      },
      people: [
        {
          name, title, company,
          role: 'economicBuyer | championOnCall | technicalInfluencer | operationalInfluencer | detractor | unknown',
          isSameAsCaller:    true|false,  // only on championOnCall when champion IS the EB
          isSameAsChampion:  true|false,  // only on economicBuyer when EB IS the champion
          sources: ['transcript'|'web'],
          transcriptEvidence: { sageContactIndex: N | null, verbatimMentions: ['quote 1'] },
          webEvidence: { linkedIn, tenureMonths: N|null, priorRole: string|null, backgroundSummary, appointmentDate: 'YYYY-MM'|null, sourceUrl },
          accessChain: { copied from sage.json namedContacts[].accessChain when transcript-side } | null,
          systemsOwned: [...],
          matchConfidence: 'high|medium|low|transcript-only|web-only',
          angleForHawk:           '1 sentence',
          angleForIvy:            '1 sentence',
          talkToBefore:           true|false,
          talkToBeforeRationale:  '1 sentence' | null,
          talkingPointSeed:       '1 sentence',
          detractorWarning:       null | '1 sentence — only when role = detractor'
        }
      ],
      preCallOutreach: [
        // Derived list of people where talkToBefore = true. Each entry: { name, what, why } in 1-line form.
        { name, what: '15-min intro call OR slack ping OR email', why: 'sentence' }
      ],
      futureBusinessChampions: [
        // From Pass 4. NOT in the people[] roster — these are NOT on this deal.
        { name, title, organization: 'platform | sponsor', linkedIn, why: '1 sentence on why a successful current engagement creates pipeline through this person', sourceUrl }
      ],
      researchedAt: '{ISO date}',
      confidence:   'high | medium | low'
    }

  ALSO mirror to top-level vera.json.namedBuyers (compact summary) so Hawk/Petra/Ivy read it without traversing buyerMap.people[]:
    namedBuyers: {
      economicBuyer: { name, title } | null,
      champion:      { name, title } | null,
      technicalInfluencers: [ { name, title } ],
      operationalInfluencers: [ { name, title } ]
    }

  NO FABRICATION RULES:
  - Never invent a person who is not in sage.json OR returned by a verified web search.
  - Every web-side entry must have a sourceUrl that resolves. If LinkedIn is gated (login wall) and you cannot read the profile body, set webEvidence.backgroundSummary = 'profile gated — title verified from search results only' and lower matchConfidence by one tier.
  - When transcript and web disagree on title (e.g. Sage captured 'IT lead' but LinkedIn shows 'Senior Network Engineer'): use the web title as canonical, surface the transcript title in transcriptEvidence.verbatimMentions, and add a note to summary.coverageNote.
  - If the entire buyer map cannot be built (no namedContacts in sage.json AND no leadership found in Step 1c): write buyerMap = { summary: { coverageNote: 'No named buyers surfaced — this is a top-of-funnel call. Architect needs to drive name capture during the deep-dive.' }, people: [], preCallOutreach: [], futureBusinessChampions: [], confidence: 'low' }.

  COST GUARDRAIL: cap at 15-20 web searches total. Prioritize order: (a) transcript-named people without a web identity, (b) economic-buyer-candidate roles (CFO/COO/President) for the operating brand, (c) platform integration lead, (d) sponsor operating partner. If budget runs out after (a)+(b): stop — coverageNote should explain which roles remain unresearched.
