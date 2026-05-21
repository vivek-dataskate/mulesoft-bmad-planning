# Story Template: Sprint 1 Contract Confirmation (API Discovery Open Gaps)

**Story Type:** Global Client Engagement (Conditional)
**When to include:** Only if any `projects/{client}/api-discovery/{system}-contract.md` has an **Open Gaps** section
**Priority:** P0 — blocks Story 3 (DataWeave) for all affected flows
**Standard:** `docs/PLANNING_CONTEXT.md → API Contract Discovery Protocol → Step 5`
**Blocks:** DataWeave transform stories for every flow touching the undocumented system

---

## User Story

As a developer, I need all Open Gap items from the API Contract Discovery confirmed by the client by Sprint 1 Day 2, so that DataWeave transforms can be implemented with confirmed field values rather than best guesses that create rework.

---

## Acceptance Criteria

### Client Response
- [ ] Each Open Gap item listed in `api-discovery/{system}-contract.md → Open Gaps — Client Input Required` section has a confirmed answer from the client
- [ ] Client response received by end of **Sprint 1 Day 2** (hard deadline — escalate to tech lead if not received)
- [ ] Confirmation documented in writing (email reply, Jira comment, or Slack thread screenshot) — not verbal

### Contract File Update
- [ ] Developer updates `api-discovery/{system}-contract.md` with confirmed values for each gap
- [ ] Open Gap items marked as RESOLVED with confirmed value and date confirmed

### DWL Update
- [ ] All `// TODO [OPEN ITEM]` comments in `.dwl` files replaced with implemented transform rules
- [ ] No `OPEN ITEM` TODOs remain in `.dwl` files after confirmation received
- [ ] Updated DWL committed before DataWeave story is closed

### Escalation Path
- [ ] If any gap cannot be confirmed by Sprint 1 Day 2: escalate to tech lead immediately
- [ ] Unresolved gap noted as sprint risk in stories.md Open Items section
- [ ] Affected DataWeave story remains open until gap resolved (do not close with placeholder logic)

---

## Open Gaps to Confirm
*(PM agent lists each open gap from api-discovery files here at story generation time)*

| System | Gap Description | Best Guess | Status |
|--------|----------------|-----------|--------|
| `{system}` | {gap description from contract.md} | {value from contract.md} | [ ] Confirmed |

---

## Client Communication Template

Use the targeted question format from `docs/PLANNING_CONTEXT.md → API Contract Discovery Protocol → Step 5`:

```
Subject: {System} API — we've tested what we can, {N} specific questions

We tested the {System} API and confirmed the write contract for {entity}.
We identified {N} points we cannot determine from testing alone:

1. [Specific question with best-guess answer and options — e.g., "taxCode: our test used 'TAX01'. Is this correct for your environment? Options: (a) use 'TAX01', (b) use ___, (c) leave null and let system default."]

For each, please confirm our best guess or choose the correct option.
If none fit, give us the correct value and we'll update accordingly.
```

**Never ask:** "Can you share the API documentation?" or "What is the data structure?"

---

## Implementation Notes

- Reference: `docs/PLANNING_CONTEXT.md → API Contract Discovery Protocol`
- Contract files live at `projects/{client}/api-discovery/{system}-contract.md`
- Each Open Gap becomes one `// TODO [OPEN ITEM]` in the corresponding `.dwl` file until confirmed
- This story is generated per-project, not per-flow — one confirmation story covers all systems with open gaps
