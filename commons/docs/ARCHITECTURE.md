# DSPipeline Architecture

**Status:** Design complete — implementation pending
**Decided:** 2026-05-14

---

## Core Principle

> One agent, one artifact, clear input contract.

Agents are reusable capabilities, not pipeline steps. The Scout pipeline is one way to chain them — not the only way.

---

## Folder Structure

```
DSPipeline/
  agents/              ← shared across all pipelines, owned by none
    registry.json      ← agent definitions, models, estimated tokens
    sage.toml
    vera.toml
    rex.toml
    ivy.toml
    flo.toml
    hawk.toml
  langgraph/
    orchestrator.mjs   ← CLI entry point (production): LangGraph + OpenRouter
    graph.mjs          ← StateGraph builder — one node per agent
    agents/            ← per-agent dedicated runners (*-runner.mjs)
  scout/
    pipeline.json      ← DAG definition: agent slugs, models, output paths, gate config
  telemetry/
    usage.csv          ← append-only: date,client,pipeline,agent,model,input_tokens,output_tokens,cost_usd,duration_ms,status
```

---

## Agent Roster

| Agent | Name | Role | Model | Boundary |
|---|---|---|---|---|
| sage | Sage | Document Analyst | Haiku | Ingests raw scoping files once. No other agent reads raw transcripts. |
| vera | Vera | Vertical Intelligence Analyst | Opus | Researches company vertical, market, competitors, FOMO entries |
| rex | Rex | Systems Analyst | Sonnet | Researches system maturity, connector gotchas, prerequisites |
| ivy | Ivy | Buyer Intelligence Analyst | Sonnet | Profiles buyer psychology, communication style, content modifiers |
| flo | Flo | Integration Flow Analyst + Pricing | Opus | Maps flows, infers P0 blockers, owns ALL pricing calculation |
| hawk | Hawk | Deal Urgency Strategist | Opus | Builds cost-of-inaction, competitive threat, closing argument |
| quinn | Quinn | Intake Specialist | Sonnet | Assembles discovery questionnaire, pre-fills from known data |
| petra | Petra | Proposal Writer | Opus | Writes client-facing proposal using psychology + urgency framing |
| sol | Sol | Delivery Analyst | Sonnet | Writes SOW, scopes delivery |
| mira | Mira | Buyer Advocate | Opus | Audits ALL client/ docs through buyer's eyes, rewrites what doesn't land |

---

## DAG

Sequential — no parallel execution:

```
Sage → Vera → Rex → Ivy → Flo → Hawk → Quinn → Petra → Mira
```

Sol is parked — net-new capability (SOW), no Scout precedent. Design separately.

## Interaction Mode

| Agent | Mode | Reason |
|---|---|---|
| Sage | Gated | Pure extraction — summary + confirm |
| Vera | Conversational | Vertical research — user may redirect or add nuance |
| Rex | Conversational | Systems — user has insider knowledge not in transcripts |
| Ivy | Conversational | Buyer psychology — qualitative, user knows the buyer |
| Flo | Gated | Flow count + pricing is formulaic — confirm numbers |
| Hawk | Conversational | Deal urgency + competitive strategy |
| Quinn | Conversational | Intake form — user may customize questions per client |
| Petra | Conversational | Proposal — highest stakes, tone and emphasis need direction |
| Mira | Conversational | Final audit — user challenges findings before rewrites |

**Correction propagation:** Corrections are baked into each agent's output file. Downstream agents read the finalized output file as normal — no automatic re-propagation.

---

## Project Folder Structure

```
projects/{client}/
  project.json              ← engagement metadata (onboarding, architect, go-live)
  decisions.json            ← append-only reasoning audit trail (all agents write here)
  company_context.json      ← client intelligence profile, built incrementally by orchestrate.js
  scoping/                  ← raw transcripts, read-only after ingest
  run/
    pipeline-state.json     ← orchestrator progress tracker
    sage.json
    vera.json
    rex.json
    ivy.json
    flo.json
    hawk.json
    quinn.json
    petra.json
  client/                   ← everything the client sees
    proposal.html
    intake-questionnaire-{client}.html
    sow.html
```

**Rule:** if it goes to the client → `client/`. Everything else → flat or `run/`.

---

## Key Design Decisions

### 1. Agents are capabilities, not pipeline steps
Every agent works standalone. Pass any input, get structured output. The pipeline chains them — agents don't know other agents exist.

### 2. Validation-first (every agent)
Before any real work, each agent validates input with ~100 tokens:
- Invalid input → `{ "status": "invalid", "reason": "...", "tokensUsed": N }` → exit
- Out of scope → `{ "status": "out_of_scope", "reason": "...", "redirect": "agent-name" }` → exit
- Orchestrate.js stops pipeline on any non-success status. No tokens burned on garbage input.

### 3. Input is free text — no rigid schema
Agents accept any text that identifies what they need. Company name, LinkedIn URL, description, transcript — all valid. LLMs parse ambiguous input naturally. Recommended minimum: company name + city (avoids ambiguity).

### 4. Pricing owned by Flo only
Flo reads `pricing-model.md` and calculates pricing from flow count + complexity. Petra, Quinn, Sol read `flo.json` and present pricing — they never calculate it. One change to Flo updates every downstream document.

### 5. HTML rendering via fill-template.js
Agents write structured content JSON. `fill-template.js` renders HTML from content JSON + template. One content source + one template = one HTML output. Not a merge step — a render step.

### 6. company_context.json is the BMAD bridge
orchestrate.js updates it incrementally after each agent completes. Each agent owns specific non-overlapping keys. BMAD agents (Analyst, Architect) read this — they never know DSPipeline exists.

### 7. Mira is the final gate
Nothing goes to the client without passing through Mira. She reads Ivy's psychology profile and audits every file in `client/` through the buyer's eyes. She rewrites — not just flags.

### 8. Model assignment rationale
- **Haiku** — pure extraction (Sage): fast, cheap, deterministic
- **Sonnet** — structured research (Rex, Ivy, Quinn, Sol): needs reasoning, not full Opus
- **Opus** — high-stakes output (Vera, Flo, Hawk, Petra, Mira): client-facing or complex judgment

### 9. Telemetry
CSV only — no database. `orchestrate.js` appends one row per agent to `DSPipeline/telemetry/usage.csv`. Queryable by client, day, agent, pipeline in Excel. Move to database only if concurrent writers cause conflicts.

### 10. Library promotion via promote-library.js
Vera stages discovered use cases (competitors, DS flows) in `vera.json.libraryContributions[]` with `pendingPromotion: true`. She never writes directly to `standards/usecases/{vertical}.json`. Promotion is a separate explicit step:

```
node DSPipeline/promote-library.js --client agilemind   # one client
node DSPipeline/promote-library.js                       # all clients
node DSPipeline/promote-library.js --dry-run             # preview
```

The script deduplicates by `(systems + useCase)` for DS entries and `(sourceCompany + useCase)` for web entries, then appends new entries with `promotedFrom` and `promotedAt` fields. After promotion, `pendingPromotion` is set to `false` in vera.json.

**Why this pattern:** per-client research artifacts (`vera.json`) stay isolated from shared knowledge (`standards/`). Promotion is reviewable and explicit — a Vera run never silently modifies the shared library.

---

## BMAD vs DSPipeline Split

| | BMAD | DSPipeline |
|---|---|---|
| Purpose | Dev workflow | Sales workflow |
| Agents | Mary, Winston, John, Dev | Sage, Vera, Rex, Ivy, Flo, Hawk, Quinn, Petra, Sol, Mira |
| Human involvement | Always present | Onboarding only |
| Entry point | "talk to Scout/Mary/Winston" | `node pipeline/langgraph/orchestrator.mjs --client <slug> --pipeline` |
| Bridge | reads `company_context.json` | writes `company_context.json` |

---

## Entry Point

```
OPENROUTER_API_KEY=sk-or-... node pipeline/langgraph/orchestrator.mjs --client <slug> --pipeline
  → loads pipeline/scout/pipeline.json for agent roster and config
  → builds LangGraph StateGraph: Sage → Vera → Drew → Rex → Ivy → Flo → Hawk → Quinn → Petra → Sol → Mira
  → each node is a dedicated runner in pipeline/langgraph/agents/*-runner.mjs
  → checkpoints state to projects/<slug>/scoping/run/.langgraph-checkpoint.json after each agent
  → resume after interruption: re-run the same command, already-completed agents are skipped

Single agent: --agent hawk
Status check: --status
```

---

## Future Pipelines

```
DSPipeline/
  scout/       ← pre-sales (this pipeline)
  marketing/   ← future: reuses Vera, Ivy, Hawk
  renewal/     ← future: reuses Vera, Ivy, Mira
```

Same agents, different orchestrators. No copying.
