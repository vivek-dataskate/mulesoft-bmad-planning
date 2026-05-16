# DataSkate Architect Guide
**For: Kailash / Raghuram — Internal Reference | DataSkate Confidential**

> The deployed version of this guide lives at `firebase/public/resources/architect-guide.html` (3-column docs layout, Firebase-gated).
> This file is the content source of truth — keep both in sync when updating.

---

## Part 1 — The DataSkate Proposition

### What Clients Are Actually Buying

What a client is evaluating is not integration flows. It is the ability to run their business on data — and eventually, to let AI handle the parts that don't need a human decision.

Every hour their team spends moving data manually — exporting spreadsheets, copying records between systems, chasing vendor reports — is an hour not spent on the business. Every manual step is a place where things go wrong, get delayed, or get dropped.

Connected systems eliminate that layer. Once it's gone, automation becomes possible. Once automation is in place, AI can take over workflows that currently require a person to notice something, decide something, and act on it.

That is the arc. Integrations are step one — but the destination is an operation that runs faster than their competition can react.

### The Three-Stage Journey

| Stage | Name | When | What Happens |
|---|---|---|---|
| Stage 1 | Connected | Year 1 | Systems talk to each other. Data moves automatically. The team stops doing manual data entry, stops running exports, stops being the integration layer between their software. |
| Stage 2 | Automated | Year 1 | Rules and triggers fire without human involvement. A customer goes quiet — a re-engagement sequence starts automatically. A vendor report arrives — it is parsed, matched, and loaded without anyone touching their inbox. |
| Stage 3 | Agentic | Renewal+ or Phase 2 SOW | AI agents monitor connected systems, detect patterns, and take actions. They surface next-best-action recommendations. They flag anomalies before vendors do. They operate business processes with the team in the loop for approvals, not execution. |

The 1-year managed service gets the client to Stage 2. Renewal opens Stage 3.

<div class="dg-flow">
  <div class="dg-step">
    <div class="dg-step-num">Stage 1</div>
    <div class="dg-step-name">Connected</div>
    <div class="dg-step-tag">Year 1</div>
    <div class="dg-step-desc">Systems talk to each other. Data moves automatically. Manual exports stop.</div>
  </div>
  <div class="dg-arrow">→</div>
  <div class="dg-step">
    <div class="dg-step-num">Stage 2</div>
    <div class="dg-step-name">Automated</div>
    <div class="dg-step-tag">Year 1</div>
    <div class="dg-step-desc">Rules and triggers fire without human involvement. Workflows run on their own.</div>
  </div>
  <div class="dg-arrow">→</div>
  <div class="dg-step highlight">
    <div class="dg-step-num">Stage 3</div>
    <div class="dg-step-name">Agentic</div>
    <div class="dg-step-tag">Renewal+</div>
    <div class="dg-step-desc">AI agents monitor, detect patterns, and act. The team approves — not executes.</div>
  </div>
</div>

### What We Guarantee

- **Delivery timeline is contractual.** 2 weeks for requirements, then 1.5 weeks per flow.
- **Billing starts at go-live — not at contract signing.** Only upfront cost is the retainer, credited at go-live.
- **Client owns the code from day one.** All code lives in their GitHub repository.
- **Continuous visibility.** Anypoint Monitoring is live from go-live — uptime, performance, error rates.
- **Changes are included.** Field mapping, config, performance tuning — covered. Action changes are change orders, scoped in writing before proceeding.

### What's Happening in Their Industry Right Now

Use this when the client or AE asks about AI relevance:

| Industry | What connected companies are already doing |
|---|---|
| Healthcare / GPO | AI predicting member churn 30–45 days out — re-engagement sequences fire before a rep notices |
| Construction | AI detecting budget variance from connected ERP + project data 3–4 weeks before a change order |
| Financial services | AI scoring account health daily from CRM + support + billing — at-risk accounts surface early |
| Distribution / Manufacturing | AI triggering procurement from connected inventory + supplier data — manual reorder cycle gone |

None of these companies started with AI. They started by connecting their systems.

### Positioning Statements

**One sentence:**
> DataSkate connects your systems today so your business can run on AI tomorrow.

**Three sentences:**
> We build and manage MuleSoft integrations as a service — fixed monthly rate per flow, fully managed for the contract term. Every integration we build is architected to support automation and AI workflows as your business evolves. Clients who start with us in year one are positioned for agent-assisted operations at renewal.

**One paragraph (for proposals):**
> Most businesses are one layer away from operating with AI. That layer is reliable, connected, well-maintained data infrastructure — and it is exactly what DataSkate builds. We start with the most pressing integration needs, architect them for long-term automation readiness, and manage them in production so the team never has to. The result is not just connected systems — it is a business that can respond faster, scale without adding headcount, and eventually run workflows that the competition is still doing manually.

---

## Part 2 — Pricing Reference

*Rates are in `commons/sales/pricing-model.md` — always read that file. Never quote numbers from memory.*

### Two Engagement Models

| Model | Implementation Fee | Ongoing | How It Works | Use When |
|---|---|---|---|---|
| **IaaS (Managed Service)** | $0 — included in monthly rate | $300/flow/month · 1-year minimum | DataSkate builds and runs everything. 24/7 uptime, connector upgrades, minor enhancements all included. | Client does not have a dedicated integration engineer. Recommended for most engagements. |
| **Implementation Only** | $3,500/flow · 50% at SOW, 50% at UAT | None — code ownership transfers | DataSkate builds and hands off. Client owns all ops from day one. | Client has a developer who will maintain the integration. Pivot to Phase 2 at go-live. |

Every proposal shows exactly these two models. No hybrids, no bundles.

<div class="dg-cards">
  <div class="dg-card primary">
    <div class="dg-card-label">Recommended</div>
    <div class="dg-card-title">IaaS — Managed Service</div>
    <div class="dg-card-row"><span class="dg-card-row-label">Implementation fee</span><strong>$0 — included</strong></div>
    <div class="dg-card-row"><span class="dg-card-row-label">Ongoing</span><strong>$300/flow/month</strong></div>
    <div class="dg-card-row"><span class="dg-card-row-label">Commitment</span>1-year minimum per flow</div>
    <div class="dg-card-row"><span class="dg-card-row-label">Who runs it</span>DataSkate — 24/7 uptime, upgrades, tuning</div>
    <div class="dg-card-row"><span class="dg-card-row-label">Use when</span>Client has no dedicated integration engineer</div>
  </div>
  <div class="dg-card">
    <div class="dg-card-label">Alternative</div>
    <div class="dg-card-title">Implementation Only</div>
    <div class="dg-card-row"><span class="dg-card-row-label">Implementation fee</span><strong>$3,500/flow</strong></div>
    <div class="dg-card-row"><span class="dg-card-row-label">Ongoing</span>None — code transfers at UAT</div>
    <div class="dg-card-row"><span class="dg-card-row-label">Commitment</span>None after delivery</div>
    <div class="dg-card-row"><span class="dg-card-row-label">Who runs it</span>Client owns all ops from day one</div>
    <div class="dg-card-row"><span class="dg-card-row-label">Use when</span>Client has a developer who will maintain it</div>
  </div>
</div>

### IaaS Kickoff Retainer

| Engagement Size | Retainer |
|---|---|
| 1–5 flows | $2,500 |
| 6–10 flows | $5,000 |
| 11+ flows | $7,500 |

Non-refundable if client cancels. Fully credited against first 6-month payment at go-live.

### Rate Schedule

| Period | Months | Rate / Flow / Month |
|---|---|---|
| Period 1 | 1–6 | $300.00 |
| Period 2 | 7–12 | $315.00 |
| Period 3 | Year 2 H1 | $330.75 |
| Period 4 | Year 2 H2 | $347.29 |

Escalates 5% every 6 months. No discounts, no exceptions. Flows scoped now lock in Period 1.

### Change Orders

| Tier | What It Covers | Fee |
|---|---|---|
| Config | Field mapping, credentials, performance tuning | Free |
| Modification | New logic, branch, transform | $750 |
| Extension | New object type, new secondary system | $1,500 |
| Flow Replacement | New trigger/target/process — old flow closes + fresh 12-month contract | $1,500 |

### Timeline Formula

- Requirements phase: 2 weeks (flat, all engagements)
- Development: 1.5 weeks per flow
- 5 flows → 9.5 weeks | 7 flows → 12.5 weeks | 10 flows → 17 weeks

<div class="dg-timeline">
  <div class="dg-tl-row">
    <div class="dg-tl-label">Requirements</div>
    <div class="dg-tl-bar-wrap"><div class="dg-tl-bar req" style="width:12%">2 wks</div></div>
    <div class="dg-tl-weeks">2 weeks</div>
  </div>
  <div class="dg-tl-row">
    <div class="dg-tl-label">5 flows</div>
    <div class="dg-tl-bar-wrap"><div class="dg-tl-bar dev" style="width:56%">+ 7.5 wks dev</div></div>
    <div class="dg-tl-weeks">9.5 weeks</div>
  </div>
  <div class="dg-tl-row">
    <div class="dg-tl-label">7 flows</div>
    <div class="dg-tl-bar-wrap"><div class="dg-tl-bar dev" style="width:74%">+ 10.5 wks dev</div></div>
    <div class="dg-tl-weeks">12.5 weeks</div>
  </div>
  <div class="dg-tl-row">
    <div class="dg-tl-label">10 flows</div>
    <div class="dg-tl-bar-wrap"><div class="dg-tl-bar dev" style="width:100%">+ 15 wks dev</div></div>
    <div class="dg-tl-weeks">17 weeks</div>
  </div>
</div>

---

## Part 3 — Briefing a MuleSoft AE

### Your Opening (30 seconds)

> "DataSkate plugs a gap that kills a lot of MuleSoft deals — the implementation cost objection. We absorb the build cost through a managed service model: $0 upfront for the client, we build it, we run it, and we invoice monthly. Your client gets integrations running without a budget fight. You close the full $50k license. We'll walk through exactly how that works."

Share the DS Pricing Model one-pager at the start. Walk through it, don't read it.

### Why IaaS Helps the AE's Quota

| Traditional deal | DataSkate IaaS deal |
|---|---|
| SI takes $20k–$30k of your $50k budget | You sell the full $50k — full quota credit |
| SI delivers and disappears | DataSkate manages for 12 months — client success is baked in |
| Renewal depends on whether integrations held up | Renewal is confident — you know they are live and growing |

### What to Say When a Client Asks About AI

> *"The honest answer is: AI only works on connected, consistent data. Right now, your systems don't talk to each other — so there's nothing for an AI to act on reliably. What we're doing in year one is building that foundation. Clean APIs, real-time data streams, consistent models. By renewal, you have something an AI agent can actually call. That's what puts you ahead of competitors who are still debating whether to start."*

### The IaaS Pitch

> *"Before you finalize your implementation approach — there's a model worth understanding. DataSkate builds and manages MuleSoft integrations as a managed service. Zero upfront on implementation. Fixed monthly rate per flow, starting when you go live — not when you sign. They build it, run it, monitor it, and keep it current. Your team owns none of the ops."*

### The FOMO Close (When a Deal Stalls)

> *"The [industry] companies that got connected in 2023 are running AI workflows today. The ones getting connected now will have that capability by 2026. The ones still evaluating will be building what their competitors already finished. That window is not closing dramatically — it is just closing."*

### AE Objections

**"My client just wants to own the integration."**
> That's the Implementation Only model — $3,500/flow, 50% at SOW, 50% at UAT. Clean handoff, no ongoing fees. The question to ask: who on their team will maintain it, upgrade connectors, and handle incidents at 2am? If they have that person, Implementation Only is right. If they don't, IaaS protects them and protects your renewal.

**"The retainer will slow down the deal."**
> The retainer is $2,500–$5,000 depending on size — credited back at go-live. It filters out clients who aren't serious. A client who won't commit $2,500 before we assign engineers was going to be a problem client. The retainer actually accelerates your deal.

**"I already have budget approved for a one-time number."**
> Implementation Only is the right path. 50/50 payment structure maps cleanly to milestones. Phase 2 — agent development — comes after go-live.

**"12 months is too long."**
> The 1-year term is per flow, not per client. They can start with 2 flows, prove the model, and add more. Each new flow starts its own 1-year clock independently.

**"Another SI quoted them less."**
> Ask what's included after go-live. Most SIs deliver and disappear. DataSkate's rate covers build, deployment, 24/7 uptime, incident response, connector upgrades, and minor enhancements.

**"The client wants hourly billing."**
> Hourly billing is the most expensive model for the client — they pay for every conversation, every estimate, every rework. Fixed rate gives total cost certainty.

**"What if DataSkate can't deliver on time?"**
> Scope is locked before development starts. If something falls short, we fix it — that's what the managed service covers. The retainer is only forfeit if the client cancels.

**"How do I explain the escalating rate?"**
> It's transparent and predictable — both payment amounts are in the contract before they sign. The 5% step-up is less than inflation for what's covered. It also creates urgency: flows scoped now lock in Period 1.

### Questions AEs Ask Us

**"Do you pay referral fees?"**
> No. You sell the full Anypoint license at full value — full quota credit, zero split. The real return is a client who is live and using the platform at renewal.

**"How do I introduce DataSkate without it sounding like a referral?"**
> Don't lead with "I have a partner." Lead with the model: *"Before you finalize your implementation approach, there's a managed service structure worth understanding."* You're presenting a smarter delivery structure.

**"What if the client has a problem with DataSkate's delivery?"**
> The SOW is between DataSkate and your client. Delivery issues are our problem to fix. We have a direct financial incentive to keep every client healthy.

**"What can I promise about uptime?"**
> 99.9% uptime per flow, measured monthly. P1 incident response within 4 hours. All SLA terms are in the DataSkate SOW.

**"What if the client tries to negotiate DataSkate's rate?"**
> The per-flow rate is fixed. If cost is the concern, the conversation moves to scope — fewer flows at the right rate beats a discounted rate that under-resources the engagement.

**"What if the client already has an SI in mind?"**
> Don't compete head-on. Trigger the support question: *"Before you finalize, ask them: who owns this integration at 2am six months from now?"*

**"How fast can you turn around a proposal?"**
> First call within 48 hours of intro. Proposal within 5 business days.

**"What if the deal is small — 1 or 2 flows?"**
> We take it. Small engagements are how the model gets proven. A 2-flow managed service that gets the client to Stage 2 is our strongest reference for a 10-flow Phase 2 SOW.

### AE Email Templates

**First Mention — Discovery Call Follow-Up**

Subject: One more thing from today's call — implementation approach

> Hi [Name], One thing I wanted to flag before you finalize. We work with a delivery partner — DataSkate — who does MuleSoft implementations differently. Their model: managed service at a fixed monthly rate per flow, starting when you go live. They build it, run it, monitor it, upgrade it. Zero upfront on implementation. More relevant to where you're headed: every integration they build is structured so AI can act on it in year two. Worth 30 minutes before you lock in an approach? [Your name]

**Warm Follow-Up — After Demo or Trial**

Subject: DataSkate — why I think the model fits [Company]

> Hi [Name], Year one: they connect your systems. Data flows automatically. Year two: those pipelines become the foundation for automation. For [Company], that means [specific example]. Zero upfront on implementation. Monthly rate per flow, starting at go-live. Happy to arrange 30 minutes with their architect. [Your name]

**Urgency — Rate Period Closing**

Subject: Timing note before [date]

> Hi [Name], Quick note — DataSkate's monthly rate steps up 5% every 6 months. Flows contracted in the current period lock in the current rate for the full term. Not trying to rush a decision — just making sure the timing picture is visible. [Your name]

### AE Slack / Teams Starters

**Opening a new prospect:**
> Hey [Name] — quick question on the MuleSoft evaluation. Is the bigger concern getting integrations live without a lot of internal ops overhead — or making sure there's a path to AI on top of them once they're running? Asking because the answer shapes how I'd structure the engagement recommendation.

**After a stalled deal:**
> [Name] — on the implementation cost concern from last time. DataSkate does it as a managed service, $0 upfront on IaaS. But the more relevant angle: every connection they build is AI-ready from day one. Worth 20 minutes to see if that changes the picture?

**Introducing after close:**
> [Name] — looping in Vivek from DataSkate who'll run the implementation and managed service. He'll kick off scoping and map the automation roadmap for year two as part of the engagement.

---

## Part 4 — Presenting to a Client

### Your Opening (60 seconds)

> "Before I walk through the technical architecture, I want to spend five minutes on the commercial model — because how we structure the engagement affects what we build. DataSkate runs two models: managed service, where we build and run everything for a fixed monthly rate, and implementation only, where we build and hand off. The right choice depends on whether you have a team that can own integration maintenance. Let me show you both."

Share the DS Pricing Model one-pager. Give them 30 seconds to read it before you talk.

### Reading the Room Before You Pitch

| What They Say | What It Means | How You Lead |
|---|---|---|
| "We have too much manual work" | Stage 1 problems — connections don't exist | Lead with reliability and time savings |
| "Our data is always out of sync" | Stage 1/2 — connections exist but aren't maintained | Lead with managed service and uptime |
| "We want AI but our data is a mess" | Needs Stage 1 before Stage 3 is possible | Lead with "clean foundation for AI" |
| "We're growing fast and can't keep up" | Stage 2 — automation is the unlock | Lead with scale without headcount |
| "We want to reduce IT costs" | Practical constraint | Lead with cost comparison vs. internal dev |

### The Cost Conversation

| Option | What It Costs | What's Missing |
|---|---|---|
| Internal developer hire | $100k–$120k/year | No 24/7, single point of failure, slow to scale |
| Traditional SI project | $30k–$80k upfront | Maintenance falls on client from day one |
| DIY tools (Zapier, Make) | Low upfront, variable | Breaks at enterprise data volumes |
| **DataSkate managed service** | **Fixed monthly rate/flow** | **Nothing — all included** |

> *"The rate is transparent and predictable — you'll know every payment amount before you commit. It steps up modestly every 6 months, less than inflation for what it covers. What stays constant is the scope: uptime, performance, upgrades, minor enhancements — all included at every rate, every period."*

Don't lead with the escalation. Lead with: you pay when you are live, you know every number before you sign, nothing is hidden.

### Client Objections

**"We don't want to pay monthly. We want to own the integration."**
> You own it either way — all the code lives in your GitHub from day one. Under IaaS, you own the asset, we operate it. The monthly fee is for the service, not the code.

**"Why do we pay a retainer before seeing any work?"**
> The retainer covers the requirements and scoping phase — two weeks of work where we analyse your systems, map your data, and produce the scope document you'll sign off on. It's fully credited against your first payment.

**"What if our requirements change during development?"**
> That's exactly what scope sign-off is for. You approve the scope document before we write a single line of code. Changes after that point are change orders — scoped and priced in writing before we proceed.

**"What if we need to change a flow completely after go-live?"**
> That's a flow replacement — flat $1,500 fee, old flow closes, fresh 12-month contract on the new flow. You get a full year on the new build.

**"What if a flow becomes useless after 6 months?"**
> Replace it with a flow you actually need — $1,500 replacement fee and start fresh. The 1-year term is what lets us charge $0 upfront. Shorter commitments would mean higher rates.

**"We have our own IT team. We don't need managed service."**
> Then Implementation Only is the right model. Where we'd come back is Phase 2: agent development. Once your systems are connected, the next layer is AI agents that use those connections to automate workflows. That's specialised work most IT teams aren't set up for.

**"Your rates are higher than what we've seen."**
> Compare what's included. A freelancer quotes build cost only — you own incident response and maintenance from day one. DataSkate's rate covers build, deployment, 24/7 monitoring, connector upgrades, and minor enhancements.

**"What do we get for the monthly fee after go-live?"**
> Uptime monitoring and incident response (24/7), performance management, connector upgrades, alerting, and minor enhancements. Action changes — if the flow needs to do something fundamentally different — are change orders. Everything else is covered.

**"Can we start with fewer flows?"**
> Yes — and that's the recommended approach. Start with the 2–3 highest-impact flows, prove the model, then expand. Each new flow gets its own independent 12-month contract.

**"What happens at the end of 12 months?"**
> We renegotiate. If you decide not to renew, you already own all the code — it's in your GitHub. Nothing is locked. The 1-year term is a commitment to the service, not to staying with DataSkate forever.

**"The monthly cost adds up."**
> It does — and so does everything it replaces. One integration developer at $100k/year. Support contracts. Incident response at 2am. When you add that up, the managed service rate is usually more cost-effective.

**"A year is too long."**
> The 1 year is the minimum needed to get you to Stage 2. The first 3–4 months, your systems get connected and reliable. By month 6–12, you're starting to automate. A 3-month project just delivers flows and leaves.

**"We talked to [other SI] and they don't have all these policies."**
> That's because they deliver and disappear. They don't need policies about month 8 because they're not there at month 8. DataSkate is. Our policies protect you as much as they protect us.

**"You're too expensive compared to offshore developers."**
> Offshore development is a different product. An offshore team builds the flows — then your team owns incidents at 3am, upgrades when Salesforce changes an API, debugging six months after go-live. DataSkate's rate is the full cost: build, run, maintain, improve.

**"We're a small company."**
> MuleSoft is the platform of choice for your industry — not because companies are large, but because the systems they run on are. The question is whether you want to build and maintain integrations yourself or have a team run it for you.

**"What if DataSkate goes away?"**
> All code is in your GitHub. Any MuleSoft developer could pick it up from day one. The dependency is on MuleSoft and Anypoint, not on DataSkate.

**"Can I talk to a reference customer?"**
> Yes — a client live for at least 6 months in the same phase you are considering. We only use clients with enough running time to speak to the managed service experience.

### Client Email Templates

**Cold Outreach — Known Integration Pain**

Subject: Automating [specific pain] at [Company]

> Hi [Name], I'll be direct. Companies in [industry] typically spend [X hours/week] managing data between [System A] and [System B] manually. We've fixed this pattern for several [industry] organizations consistently. DataSkate builds and manages MuleSoft integrations as a service — fixed monthly rate, all-in. We architecture every integration to be AI-ready. Worth 20 minutes to see if [Company] fits the pattern? [Your name] | DataSkate

**Warm Outreach — Referral or AE Introduction**

Subject: DataSkate intro — [AE Name] thought we should connect

> Hi [Name], [AE Name] suggested I reach out. You're evaluating MuleSoft for [use case] and they thought our model might be a better fit than a traditional implementation. We don't do one-off integration projects. We run your integrations as a managed service — built, monitored, and maintained — and architected from day one to support AI workflows as your business evolves. The cost is a fixed monthly rate per flow. Full payment schedule disclosed upfront. Can we find 30 minutes this week? [Your name] | DataSkate

**Follow-Up After Discovery Call**

Subject: DataSkate — what this looks like for [Company]

> Hi [Name], Based on our conversation, here is what I am seeing: **Where you are today:** [2–3 sentences summarizing their manual pain] **What Stage 1 looks like for [Company]:** [N] integrations connecting [systems]. Built in [X] weeks. Managed by DataSkate from go-live. Billing starts at go-live — not at contract signing. **What Stage 2 looks like (Year 1):** [Specific automation examples] **What Stage 3 looks like (Renewal+):** [Specific agentic example] Want to walk through this on a call, or should I put together a formal proposal? [Your name]

**No-Response Follow-Up (5 Days)**

Subject: Re: DataSkate proposal — one question

> Hi [Name], One question before I follow up further: is the hesitation about budget, timeline, or the 1-year commitment? Each of those has a different answer and I don't want to send you generic follow-ups. [Your name]

### Client Slack / Teams Messages

**Opening:**
> Hey [Name] — genuine question. If you could wave a wand and fix one thing about how your team moves data between your systems today, what would it be? Asking because that's usually where we start, and it's often a much faster fix than people expect.

**After discovery:**
> [Name] — thinking about what you shared. The [specific pain] is a classic Stage 1 problem. We've solved this pattern for [similar company type]. Want me to send over what that looked like?

**On the agentic angle:**
> [Name] — one thing I didn't mention: clients who start with our managed service get their data clean, connected, and AI-ready within year one — so renewal opens the door to agentic automation without rebuilding anything. Worth including in your evaluation criteria?

---

## Part 5 — When the Client Self-Maintains (Phase 2 Pivot)

When a client has a developer and plans to own integration maintenance, do not push IaaS. Agree with them, close Implementation Only, and plant the Phase 2 seed immediately.

### The Phase 2 Pivot

| Phase | Who Owns It | What It Is |
|---|---|---|
| Phase 1 — Connected | Client's developer | Integration flows built by DataSkate, maintained in-house |
| Phase 2 — Automated & Agentic | DataSkate (SOW) | AI agents that use the connected data to automate workflows |

<div class="dg-flow">
  <div class="dg-step">
    <div class="dg-step-num">Phase 1</div>
    <div class="dg-step-name">Connected</div>
    <div class="dg-step-tag">Client owns ops</div>
    <div class="dg-step-desc">DataSkate builds. Client developer maintains. Code lives in their GitHub.</div>
  </div>
  <div class="dg-arrow">→</div>
  <div class="dg-step highlight">
    <div class="dg-step-num">Phase 2</div>
    <div class="dg-step-name">Agentic</div>
    <div class="dg-step-tag">DataSkate SOW</div>
    <div class="dg-step-desc">AI agents act on connected data. Separate engagement, scoped at go-live.</div>
  </div>
</div>

### What to Say

**At scoping:**
> *"That makes sense — Implementation Only is the right structure for you. Your developer runs the integration layer, you own the code. What I want to put on the roadmap now is Phase 2: once your systems are connected, the next unlock is agents — AI that uses those connections to automate decisions and surface what your team doesn't have time to find manually. Separate engagement, separate timeline. Let's get Phase 1 right and come back to this at go-live."*

**At go-live:**
> *"Your flows are live. This is exactly the moment to scope Phase 2 — your data is clean, connected, and ready. We know where the agent opportunities are in your stack. Worth 30 minutes to map it out?"*

### Signals That Phase 2 is Ready

- Flows have been live 60–90 days and are stable
- Client team is using the connected data in their workflows
- Client mentions manual reporting, repetitive decisions, or "we still export to Excel"
- AI or automation comes up in any context

---

## Part 6 — Closing the Conversation

### If the Client is Hesitating on Model Choice

> "The simplest way to decide: do you have someone on your team whose job it will be to wake up at 2am when an integration breaks and fix it? If yes — Implementation Only. If no — IaaS."

### If the AE is Hesitating on Introducing DataSkate

> "Your client is going to ask you who's running the integrations after go-live. Most SIs make that your client's problem. DataSkate makes it ours. That's the conversation."

### If Either Audience Asks About AI / Agents

> "Phase 2 is where this gets interesting. The integration layer we build in Phase 1 is the data foundation every AI use case runs on. Agent development, automated workflows, decision intelligence — none of it works without clean, reliable, connected data. We architect Phase 1 so Phase 2 is possible. Most SIs don't think past the delivery."

---

*DataSkate — dataskate.ai | kailash@dataskate.ai*
*Rates and terms: see `commons/sales/pricing-model.md` — do not quote specific numbers from memory*
