# Shared Decisions Logging Pattern

Each agent appends to its own `projects/{client}/scoping/run/{agent}-decisions.json` file with a per-agent ID prefix. orchestrate.js aggregates all `*-decisions.json` files into the final `decisions.json` — agents NEVER write `decisions.json` directly. Append only; never modify existing entries. Prefixes: Sage SD-NNN, Vera VD-NNN, Rex RD-NNN, Flo FD-NNN, Hawk HD-NNN, Petra PD-NNN.

## Flo (FD-NNN) — verbatim from flo.toml

Log to run/flo-decisions.json (agent-scoped; orchestrate.js aggregates into decisions.json):
  One flow-classification entry per confirmed flow (why confirmed, evidence from sage.json).
  One flow-classification entry per potential flow (why potential not confirmed, what would promote it).
  One pricing entry (flow count, all computed numbers, recommended model and rationale, any edge cases).
  Append only — never modify existing entries. Prefix IDs as FD-NNN.

## Hawk (HD-NNN) — verbatim from hawk.toml

Log to run/hawk-decisions.json (agent-scoped; orchestrate.js aggregates into decisions.json): one content-adaptation entry per major framing decision (challengeLead, fomoAngle rewrites, closingLine variant choice, journeyHeadline). For each: what the default would have been, what changed, which profile modifier drove it. Prefix IDs as HD-NNN.

## Petra (PD-NNN) — verbatim from petra.toml

Log to projects/{client}/scoping/run/petra-decisions.json (agent-scoped; orchestrate.js aggregates all *-decisions.json files into the final decisions.json — Petra NEVER writes decisions.json directly). One content-adaptation entry per major field adapted by psychology (challenge.lead, fomo ordering, closingLine, Stage 3 AgentForce adaptation). For each: what the default would have been, what changed, which hawk.json field drove it. Shape: { client, generatedAt, decisions: [{ id: 'PD-NNN', step, type: 'content-adaptation', decision: '1 sentence', rationale: '1-2 sentences', source: 'hawk.json.{field}' }] }. Prefix IDs as PD-NNN (matches Sage SD-NNN, Hawk HD-NNN, Flo FD-NNN). Append only — never modify existing entries.
