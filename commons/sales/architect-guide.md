# DataSkate Architect Presentation Guide
**For: Kailash / Raghuram — When briefing MuleSoft AEs or presenting to clients**

---

## How to Use This Guide

Two distinct audiences. Different concerns. Different language.

- **Briefing a MuleSoft AE** — AE cares about deal velocity, quota impact, and not creating friction with their client. Lead with what DataSkate does for the AE, not for the client.
- **Presenting to a client** — Client cares about risk, cost, flexibility, and outcomes. Lead with what they get, not how DataSkate works.

Share the one-page flyer (`DataSkate-Pricing-Flyer.pdf`) at the start of either conversation. Walk through it, don't read it.

---

## Part 1 — Briefing a MuleSoft AE

### Your opening (30 seconds)

> "DataSkate plugs a gap that kills a lot of MuleSoft deals — the implementation cost objection. We absorb the build cost through a managed service model: $0 upfront for the client, we build it, we run it, and we invoice monthly. Your client gets integrations running without a budget fight. You close the full $50k license. We'll walk through exactly how that works."

---

### AE Objections

**"My client just wants to own the integration — they don't want monthly fees."**
> That's the Implementation Only model — $3,500/flow, 50% at SOW, 50% at UAT. Clean handoff, no ongoing fees. We handle both models. The question to ask your client is: who on their team is going to maintain it, upgrade connectors, and handle incidents at 2am? If they have that person, Implementation Only is right. If they don't, IaaS protects them — and protects your renewal because the integrations stay healthy.

---

**"The retainer will slow down the deal. Clients don't want to pay before we start."**
> The retainer is $2,500–$5,000 depending on size — it's credited back at go-live, so it's not an extra cost, it's a timing shift. More importantly, it filters out clients who aren't serious. A client who won't commit $2,500 before we assign engineers was going to be a problem client. The retainer actually accelerates your deal by removing bad-fit clients early.

---

**"I already have budget approved for the implementation — they're expecting a one-time number."**
> If the budget is approved, Implementation Only is the right path. We scope, build, hand off. The 50/50 payment structure (SOW signing + UAT) maps cleanly to milestones your client already understands. The Phase 2 conversation — agent development — is separate and comes after go-live once they've seen the value of connected systems.

---

**"12 months is too long. My client wants flexibility."**
> The 1-year term is per flow, not per client. They can start with 2 flows, prove the model, and add more. Each new flow starts its own 1-year clock independently. The commitment is smaller than it sounds — it's not "lock in your entire integration roadmap for a year," it's "commit to this one flow working reliably for a year."

---

**"Another SI quoted them less."**
> Ask what's included after go-live. Most SIs deliver and disappear — your client owns the maintenance burden from day one. DataSkate's monthly rate covers build, deployment, 24/7 uptime, incident response, connector upgrades, and minor enhancements. When you compare that to an internal hire ($100k+/year) or a traditional SI project plus a support contract, the number looks different.

---

**"The client wants hourly billing so they can control costs."**
> Hourly billing is the most expensive model for the client — they pay for every conversation, every estimate, every rework. DataSkate's fixed rate gives them total cost certainty. They know every payment before they sign. That's a feature, not a limitation. If a client insists on hourly, they're a better fit for a traditional SI, not DataSkate.

---

**"What if DataSkate can't deliver on time or the client isn't happy?"**
> Scope is locked before development starts — client signs off on a scope document at the end of the requirements phase. That protects both sides. If something in the delivery falls short, we fix it — that's what the managed service covers. The retainer is only forfeit if the client cancels, not if DataSkate misses something.

---

**"How do I explain the escalating rate to my client?"**
> Tell them it's transparent and predictable — both payment amounts are in the contract before they sign. The 5% step-up every 6 months is less than inflation for what's covered. More importantly, it creates urgency: flows scoped now lock in the Period 1 rate. Waiting costs them more.

---

## Part 2 — Presenting to a Client

### Your opening (60 seconds)

> "Before I walk through the technical architecture, I want to spend five minutes on the commercial model — because how we structure the engagement affects what we build. DataSkate runs two models: managed service, where we build and run everything for a fixed monthly rate, and implementation only, where we build and hand off. The right choice depends on whether you have a team that can own integration maintenance. Let me show you both."

Share the flyer. Give them 30 seconds to read it before you talk.

---

### Client Objections

**"We don't want to pay monthly. We want to own the integration."**
> You own it either way — all the code lives in your GitHub repository from day one. Under IaaS, you own the asset, we operate it. Under Implementation Only, you own it and operate it. The monthly fee is for the service, not the code. The question is whether your team has the bandwidth to handle 24/7 monitoring, connector upgrades, and incident response on top of everything else they're doing.

---

**"Why do we pay a retainer before seeing any work?"**
> The retainer covers the requirements and scoping phase — two weeks of work where we analyse your systems, map your data, and produce the scope document you'll sign off on. That work has real cost. The retainer also means we can assign our best engineers to your project immediately rather than queuing you behind projects that are already funded. And it's fully credited against your first payment — so it's not an extra charge, just an advance on what you'd pay anyway.

---

**"What if our requirements change during development?"**
> That's exactly what the scope sign-off is for. You review and approve the scope document before we write a single line of code. Changes after that point are change orders — scoped and priced in writing before we proceed. Config changes and minor tweaks are included at no charge. More significant changes have a flat fee. Nothing is open-ended.

---

**"What if we need to change a flow completely after go-live?"**
> If the flow needs a fundamentally different design — new trigger, new target, new business logic — that's a flow replacement. You pay a flat replacement fee, the old flow closes, and a fresh 12-month contract starts on the new flow. You get a full year on the new build, not just whatever was left on the old one. It's designed to give you flexibility without penalising DataSkate for rework.

---

**"What if a flow becomes useless after 6 months? Why should we keep paying?"**
> Because you committed to a 1-year contract on that flow. If it's truly obsolete, the cleanest path is replacement — swap it for a flow you actually need, pay the flat replacement fee, and start a fresh year on something useful. If you want to decommission with nothing in its place, the remaining balance accelerates. The way to think about it: the 1-year term is what lets us charge $0 upfront and absorb the build cost. Shorter commitments would mean higher rates.

---

**"We have our own IT team. We don't need managed service."**
> Then Implementation Only is the right model — and potentially Phase 2 later. We build the flows, hand off the code, and your team takes it from there. Where we'd come back is for Phase 2: agent development. Once your systems are connected, the next layer is AI agents that use those connections to automate workflows. That's specialised work your IT team probably isn't set up for — and it's where DataSkate adds the most value after the integration layer is stable.

---

**"Your rates are higher than what we've seen from other providers."**
> Compare what's included. A freelancer or offshore team quotes build cost only — you own incident response, upgrades, and maintenance from day one. DataSkate's rate covers build, deployment, 24/7 monitoring, connector upgrades, and minor enhancements. When you add a $100k internal hire or ongoing support contracts to the alternatives, the comparison changes significantly. And the architecture we deliver is built for AI readiness from day one — that's not something most SIs design for.

---

**"What do we actually get for the monthly fee after go-live?"**
> Five things: uptime monitoring and incident response (24/7), performance management, connector and platform upgrades when MuleSoft releases changes, notifications and alerting, and minor enhancements like field mapping updates and config changes. The only things not included are action changes — if the flow needs to do something fundamentally different, that's a change order or replacement conversation. Everything else is covered.

---

**"Can we start with fewer flows and add more later?"**
> Yes — and that's actually the recommended approach for most clients. Start with the 2–3 highest-impact flows, prove the model, then expand. Each new flow gets its own independent 12-month contract from its go-live date. Existing flows are unaffected in rate or term. You build the integration footprint incrementally without committing the full roadmap upfront.

---

**"What happens at the end of 12 months?"**
> We renegotiate. You've had 12 months of working integrations, you know exactly what you're getting, and we agree a new 1-year term at the then-current catalog rate. If you decide not to renew, you already own all the code — it's in your GitHub. You take it and operate it yourself or bring someone else in. Nothing is locked. The 1-year term is a commitment to the service, not to staying with DataSkate forever.

---

**"We talked to [other SI] and they don't have all these policies."**
> That's true — most SIs don't have them because they deliver and disappear. They don't need policies about what happens at month 8 because they're not there at month 8. DataSkate is. Our policies exist because we're in a 12-month relationship with you, not a 12-week project. The change order tiers, the replacement fee, the scope lock — those protect you as much as they protect us. You know exactly what every change costs before you approve it.

---

## Part 3 — Closing the Conversation

### If the client is hesitating on model choice

> "The simplest way to decide: do you have someone on your team whose job it will be to wake up at 2am when an integration breaks and fix it? If yes — Implementation Only. If no — IaaS."

### If the AE is hesitating on introducing DataSkate

> "Your client is going to ask you who's running the integrations after go-live. Most SIs make that your client's problem. DataSkate makes it ours. That's the conversation."

### If either audience asks about AI / agents

> "Phase 2 is where this gets interesting. The integration layer we build in Phase 1 is the data foundation every AI use case runs on. Agent development, automated workflows, decision intelligence — none of it works without clean, reliable, connected data. We architect Phase 1 so Phase 2 is possible. Most SIs don't think past the delivery."

---

*DataSkate — dataskate.ai | vivek@dataskate.ai*
*Rates and terms: see pricing-model.md — do not quote specific numbers from memory*
