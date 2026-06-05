# Proposal Content JSON Schema

Proposal-content.json schema — write EXACTLY these top-level keys in this order:

  meta: { clientName, clientSlug, title ('The Connected {ClientName}: Your AI Integration Roadmap'), subtitle (one-line — AI journey angle, not 'connecting systems'), date, architect, architectEmail (from project.json — never hardcode), flowCount, addressedTo: { name, title, source } }

  strategicContext: { summary, operatingBrandPositioning, lattice, whyNow, sourceUrls[] } — populate from Vera Step 2d corporateProfile + dealUrgencyMultipliers (see PROPOSAL STRATEGIC CONTEXT principle). null when corporateProfile is null.

  challenge: {
    lead: hawk.json challengeLead verbatim,
    cards: [ { label: '{short label}', text: '{1-2 sentences — specific to this client, not generic}' } ] — 2-3 cards, each naming a specific pain from sage.json
  }

  solution: {
    lead: 1-2 sentences explaining the MuleSoft managed layer (no jargon). Contrast with native marketplace connectors — name the gap (retry logic, DLQ, ops layer).
    diagramNodes: { sources: ['{system}'], targets: ['{system}'] } — derive from flo.json confirmedFlows[]
    diagramCaption: one line — 'DataSkate-managed MuleSoft layer — no code changes required in {systemA} or {systemB}'
    mermaid: Mermaid graph LR string for the FUTURE STATE architecture — sources on left flowing into MuleSoft center node, targets on right. Style the MuleSoft node green (fill:#F0FFF4,stroke:#38A169,color:#276749). Use short system names. Add edge labels where meaningful (e.g. flow counts). Example: "graph LR\n  SH[\"Shopify Plus\"] --> MS[\"MuleSoft\\n(DataSkate managed)\"]\n  MS --> NS[\"NetSuite\"]\n  style MS fill:#F0FFF4,stroke:#38A169,color:#276749"
  }

  roi: {
    headline: 'The business case for moving now',
    body: 2-3 sentences — use specific numbers from sage.json (volume, lag time, manual hours). Name the industry median benchmark from vera.json if available. NO generic language.
    stats: [ { value: '{specific metric}', label: '{what it means}' } ] — 3 stats. Source from sage.json quotes + vera.json benchmarks. Never fabricate.
  }

  journey: { headline (hawk.json journeyHeadline), stage1 (label/year/headline/items[]), stage2, stage3 (items: read Stage 3 writing rules in proposal-structure.md first), closingLine (hawk.json closingLine verbatim) }

  flows[]: { num, name, route ('System A → MuleSoft → System B'), value (1-2 sentence business outcome — NOT technical detail) }. Derive from flo.json confirmedFlows[]. No complexity field.

  outcomes[]: 3 cards { icon, title, body }. Last must be AI-Ready Foundation verbatim from proposal-structure.md.

  included[]: { title, detail } — one item per deliverable. Pull from proposal-structure.md standard included items + adjust for this flow count. Always include: integration flows (N count), MuleSoft hosting, field mapping, error handling, UAT support, 30-day hypercare.

  oos[]: { title, detail } — 4+ client-specific out-of-scope items. Derive from vera.json systemPrerequisites[] and standard exclusions in proposal-structure.md.

  assumptions[]: { assumption, owner, when, p0? } — from flo.json p0Blockers[]. p0=true for items that block build start.

  timeline[]: { label, weeks, tasks[] } — 4 phases: Discovery & Field Mapping (Wks 1-2), Build & Unit Test (Wks 3-N based on flow count), UAT & Integration Testing (2 wks), Go Live & Handoff (1 wk). Tasks name actual systems and flows.

  pricing: true — always set to boolean true. The template reads flo.json directly for pricing numbers. Never embed pricing values in proposal-content.json.

  fomo[]: from hawk.json fomoOrdered[] — top 2-4. { name=displayName, revenue, relevanceTier, savings, whatTheyBuilt, fomoAngle=fomoAngleAdapted verbatim, analogyNote, aiAgentDescription, sourceUrl, sourceLabel }. Pass all verbatim.

  buyerProfile: { primary: ivy.json primaryProfile, secondary: ivy.json secondaryProfile (or null), signals: ivy.json keySignals[], contentModifiersApplied: [ '{key}: {what changed and why}' ] — one entry per hawk.json adaptation, closingLineVariant: ivy.json primaryProfile }

  fomoThoughtStarters: copy vera.json aiThoughtStarters[] verbatim — array of strings.

  nextSteps[]: 4 fixed steps { title, body }: (1) Fill Out Intake Form, (2) Schedule Technical Deep Dive (name architect from project.json), (3) Review Integration Deck, (4) Align on Scope and SOW.

  about: null UNLESS project.json ae.isNewToDataSkate = true — then populate the About DataSkate section from proposal-structure.md.
