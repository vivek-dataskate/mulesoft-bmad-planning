# Scout Pipeline Refactor — ≤ $10 for ANY client (proven on Peerless)

**Goal:** every client completes the full Scout pre-sales pipeline for **≤ $10** (down from a measured ~$98), faster, **without compromising any functionality**, by adopting industry-standard context and agent frameworks — the same way we standardized the HTML pipeline (registry + version-manifest) and diagram-as-code. **Peerless is the worked proof case; §6b shows why the ceiling holds for any client.**

**Status:** IN PROGRESS. Owner: Vivek. Last updated: 2026-05-23.
**Single source of truth.** Reproduce numbers: `node pipeline/scout/tools/cost-model.js` and `node pipeline/scout/tools/session-decomp.js <session.jsonl>`.

> **QUICK ORIENT FOR NEW SESSIONS — read this, skip the rest:**
> Active branch: `cost-discipline/flo-hawk-sonnet` (worktree: `.claude/worktrees/cost-discipline/`)
> Last commit: merge of `refactor/trim-tomls-and-extract-refs` (Phase 1.5 TOML trim) into cost-discipline.
> Phases 0 → 2 are code-complete and committed on `cost-discipline`. Phase 3 validation pipeline is running or pending.
> **Do NOT touch `orchestrate.js`, agent `reads[]`, or `scout-context.js` on any other branch** — the cost-discipline branch owns those files.
> Next unstarted work: **Phase 1.6** (convert .md→.json) and **Phase 3** (10→22 SDK subagents).

> **Live work tracker:**
> | Phase | What | Status | Commit / Branch |
> |---|---|---|---|
> | **0** | `build-graph.js` + `graph/` artifacts + `cost-model.js` + `session-decomp.js` | ✅ DONE | `3b58dd5` on `cost-discipline` |
> | **1** | `scout-context.js` + `stageContext()` in orchestrator — stage builders for Sage, Vera, Hawk (the 3 cost-killers) | ✅ DONE | `59a5c2e` on `cost-discipline` |
> | **1.5** | TOML trim — vera.json → company_context.json in Rex/Ivy/Quinn; agent-refs extraction; psychology-profiles split; architect-guide split | ✅ DONE, MERGED | `648ad57` (merge commit on `cost-discipline`) |
> | **2** | Stage builders for Rex, Ivy, Flo, Petra, Quinn, Mira; `computePricing()` deterministic; budget guard; all 9 agents use stage files | ✅ DONE | `023b62a` on `cost-discipline` |
> | **3 (validate)** | End-to-end peerless pipeline re-run — verify ≤$12 total, all 9 stage files written, flo.json.pricing has numeric fields | 🔄 IN PROGRESS | `cost-discipline` worktree |
> | **1.6** | Convert system-referenced `.md` → `.json`: `commons/sales/pricing-model.md`, `proposal-structure.md`, and `commons/agent-refs/*.md`; update `portal/_data/pricing.js` + all TOMLs. Fix proposal-structure investment section: T&M model added. **Note: 3 stubs exist in `refactor/trim-tomls-and-extract-refs` — delete before starting: `commons/sales/pricing-model.json`, `commons/agent-refs/shared-no-fabrication-pledge.json`, `commons/agent-refs/shared-decisions-logging.json`.** | ⏳ NEXT | new branch off `cost-discipline` |
> | **3 (split)** | Decompose 10 → 22 single-responsibility SDK subagents + model right-sizing | ⏳ PENDING | — |
> | **4** | Flip `SCOUT_GRAPH` default on; retire raw `reads[]`/monolith TOMLs | ⏳ PENDING | — |

---

## 8c. Handoff to next session (2026-05-23)

**Context:** Phases 0–2 are committed on `cost-discipline/flo-hawk-sonnet`. The Phase 1.5 TOML-trim branch has been merged in. An end-to-end pipeline run for peerless is in progress (background, may still be running when you start).

**Branch:** `cost-discipline/flo-hawk-sonnet` · Worktree: `.claude/worktrees/cost-discipline/`

**If the pipeline is still running:**
```bash
# Check pipeline status
cd .claude/worktrees/cost-discipline
node pipeline/scout/orchestrate.js --client peerless --status

# Check session cost so far
node pipeline/scout/tools/session-decomp.js ~/.claude/projects/-workspaces-mulesoft-bmad-planning/$(ls -t ~/.claude/projects/-workspaces-mulesoft-bmad-planning/ | head -1)
```

**Pipeline validation exit gate (Phase 3 validate):**
- Total cost < $12 (target ≤ $10 after Phase 3 split)
- All 9 stage files written: `ls projects/peerless/scoping/run/*-stage.json`
- flo.json.pricing has numeric fields (flowCount, period1RatePerFlow, etc.)
- Structural equivalence: petra.json, quinn.json, mira.json present and complete

**If pipeline completed successfully → mark Phase 3 (validate) ✅ and commit:**
```bash
git add pipeline/scout/orchestrate.js  # headless-mode + state-schema fixes
git commit -m "fix: headless pipeline mode + state schema normalization for e2e run"
```

**Next pending work (Phase 1.6):**
Convert `.md` → `.json`: `commons/sales/pricing-model.md`, `proposal-structure.md`, all `commons/agent-refs/*.md`.
- Delete 3 stubs first: `commons/sales/pricing-model.json`, `commons/agent-refs/shared-no-fabrication-pledge.json`, `commons/agent-refs/shared-decisions-logging.json`
- Update `portal/_data/pricing.js` + all agent TOMLs (`reads[]` + inline references)
- Fix proposal-structure investment section: add T&M as third model

**Known orchestrate.js fixes committed this session (not yet pushed):**
1. `process.stdout.isTTY` gate on tmux bootstrap (line ~2759) — skips tmux when not in a real terminal
2. `--print` flag added when not in TTY (headless agent runs)
3. `readState()` normalization: bridges `completed_agents` (§4b) ↔ `completed` (legacy field)

---

## 1. Diagnosis — where the money actually goes (measured, not estimated)

We parsed the Claude session JSONLs that `orchestrate.js` already bills from. The cost equation is:

```
billed_input(agent) ≈ Σ over LLM turns ( context_window_at_that_turn )
```

Each agent makes N LLM calls, and **every call re-sends the entire, growing context window**. Evidence from real sessions:

| Session | turns | last-turn context | billed input | matches CSV row |
|---|---|---|---|---|
| Hawk run | 40 | ~151K | 973,686 | hawk peerless = 973,686 ✓ |
| Vera run | 64 | ~142K | 1,238,819 | vera peerless ≈ 1.29M ✓ |
| long interactive | 315 | ~517K | 13.8M | — |

Key findings that **redirect the optimization**:
- The tokens are **not** web-research HTML (only ~136K of tool-results in a 315-turn session). They are **the same context re-sent every turn** — and a large share is **prior agents' full JSON outputs** loaded wholesale (`company_context.json`, `vera.json`, etc.).
- Cost is therefore **multiplicative across three independent levers**: `cost ≈ turns × context_per_turn × model_rate`.
- **Output tokens are the floor.** Total pipeline output ≈ 819K tokens. At Sonnet ($15/M) that alone is ~$12 — **even a perfect input refactor cannot reach $10 without also reducing output volume.**

### Worked example — HAWK (clean run, verifies against telemetry)
Session `25581308…jsonl`, decomposed via `tools/session-decomp.js`:

| measured | value |
|---|---|
| turns (LLM calls) | **40** |
| first-turn context (prefix: system prompt + initial load) | **21K** |
| max context window | **151K** |
| billed input | **973,686** ← *matches the peerless `usage.csv` hawk row exactly* |
| output / model | 96K / opus → **$21.82** |
| files read **in full** mid-run | `vera.json`, `ivy.json`, `flo.json`, `sage.json`, `company_context.json`, `decisions.json` + 3 sales docs |

The prefix is only 21K — context balloons to 151K because Hawk **loads six full upstream JSON documents**, then re-sends that 151K on all 40 turns. **The spend is the prior-agent outputs, re-sent every turn** — not web research, not the static corpus.

### The four levers, with mechanism (measured, not guessed)
| Lever | Mechanism | Reduction |
|---|---|---|
| **L1 · context_per_turn** | Agents are autonomous (§3b): orchestrator hands each a **self-contained input contract** (thin field projection + GraphRAG slice, ≤25–30K); the agent reads no sibling JSONs, so context **can't grow** mid-run. Hawk 151K→~25–30K. *Audited feasible — see §8b projection map; PR #44 already dropped `vera.json` in prod.* | ~5× heavy, ~2–2.5× light |
| **L2 · turns** | Split multi-job monoliths into single-responsibility subagents (converge faster) + cap research passes. | ~1.3–2× on multi-job agents |
| **L3 · model_rate** | Opus→Sonnet (5×) where rule-application; Sonnet→Haiku (3.75×) for extraction/structured output. | 5× / 3.75× |
| **L4 · output_tokens** (the floor) | Orchestrator **templates boilerplate JSON**; agents emit only decision-bearing fields. Required: 819K output ≈ $12 on Sonnet alone. | output ×0.35–0.78 |

L1·L2·L3 **multiply**: Hawk = ctx 5× · turns ~1.5× · model 5× ⇒ ~37× on input → $21.82 to ~$1.36.

---

## 2. Baseline & target — the proof

Measured peerless run (agilemind used as proxy for quinn/mira, which didn't complete for peerless). Rates per 1M tok: haiku 0.80/4.00, sonnet 3.00/15.00, opus 15.00/75.00.

### Baseline (measured)
| agent | model | in | out | cost | time |
|---|---|---|---|---|---|
| sage | haiku | 2.20M | 125K | $2.26 | 824s |
| vera | opus | 1.24M | 145K | $29.47 | 1200s |
| rex | sonnet | 0.56M | 89K | $3.01 | 569s |
| ivy | sonnet | 0.51M | 47K | $2.23 | 723s |
| flo | opus | 0.17M | 23K | $4.32 | 236s |
| hawk | opus | 0.97M | 96K | $21.82 | 825s |
| petra | opus | 0.73M | 74K | $16.48 | 427s |
| quinn | sonnet | 1.22M | 170K | $6.21 | 1565s |
| mira | opus | 0.56M | 50K | $12.07 | 546s |
| **TOTAL** | | **8.16M** | **819K** | **$97.87** | **115 min** |

### Scenario 1 — graph + model right-sizing ONLY
Thin static context via the graph + Opus→Sonnet. Output unchanged.
**TOTAL: $18.29 (81% cheaper), ~51 min (56% faster). ❌ misses $10.**

### Scenario 2 — FULL (graph + model + agent split + orchestrator output-templating)
Adds: split into single-responsibility subagents (fewer turns each), Haiku for output-heavy extraction (Quinn, Ivy), and the orchestrator templating boilerplate JSON so agents emit only decision-bearing fields.

| agent | model | in | out | cost | time |
|---|---|---|---|---|---|
| sage | haiku | 0.59M | 90K | $0.83 | 371s |
| vera | sonnet | 0.21M | 70K | $1.66 | 360s |
| rex | sonnet | 0.17M | 59K | $1.41 | 313s |
| ivy | haiku | 0.21M | 35K | $0.31 | 398s |
| flo | sonnet | 0.07M | 18K | $0.49 | 142s |
| hawk | sonnet | 0.18M | 55K | $1.36 | 330s |
| petra | sonnet | 0.22M | 45K | $1.34 | 235s |
| quinn | haiku | 0.27M | 60K | $0.46 | 626s |
| mira | sonnet | 0.17M | 30K | $0.96 | 273s |
| **TOTAL** | | **2.09M** | **461K** | **$8.82** | **~51 min** |

**Result: $8.82/client (91% cheaper), 56% faster — clears the $10 target with ~$1.18 headroom.**

### Sensitivity — the headroom is honest, not slack
- If de-Opus quality forces **Vera + Petra to stay on Opus**: +~$10 → **~$19**. ❌ — Opus removal is essential and must pass the equivalence gate.
- If **output-templating delivers half** the assumed reduction (L4 weak): +~$3 → **~$12**. ⚠️ — output-templating is load-bearing, a first-class deliverable.
- If **context-thinning under-delivers** (L1 only 3× not 5× on heavy agents): +~$2 → **~$11**. ⚠️ — Phase 1 measures real L1 on Hawk/Vera before committing downstream.

**$10 needs all four levers; any single lever failing breaches it. That is why each phase has a measured gate (§6).**

---

## 3. Industry-standard frameworks adopted

Same philosophy as the HTML standardization (template-registry + version-manifest) and diagram-as-code: replace bespoke, per-agent ad-hoc loading with recognized, documented standards.

| Concern | Today (bespoke) | Standard we adopt | Why |
|---|---|---|---|
| **Context framework** | Each agent TOML has `reads = [raw file paths]`; loads whole files | **Model Context Protocol (MCP)** — a `scout-context` MCP server exposes the corpus as scoped, queryable resources/tools | Industry standard for agent context (Anthropic open protocol); agents request *only* the resource slice they need instead of whole files |
| **Retrieval** | Whole playbook/canonical/registry files loaded | **GraphRAG** (named pattern): deterministic graph keyed by `vertical / system / usecase`, distilled nodes, optional embedding fallback later | Matches the structured nature of retrieval here; "graph rag" done the documented way |
| **Agent framework** | Hand-rolled TOML + `spawnSync('claude')` monoliths that read sibling outputs | **Claude Agent SDK** autonomous subagents in the **orchestrator-worker** pattern; each a pure contract-defined function, no cross-agent reads, fixed context budget (never compacts), portable across pipelines | Standard decomposition; small single-purpose **reusable** workers, deterministic orchestrator owns the DAG |
| **Agent I/O contract** | Free-form JSON, drift-prone | **JSON Schema / structured outputs** per agent | No drift; orchestrator validates; enables output-templating |
| **Build/freshness** | Re-read full corpus every client | **Content-hash incremental build** (like the version-manifest) | "Graph once, modify on update" — re-distill only changed source files |
| **Equivalence** | none | **Golden-baseline behavioral testing** vs the peerless outputs | Guarantees "no functionality compromised" |

---

## 3b. Non-negotiable agent principles (autonomous · boundaried · compaction-free)

These are hard constraints, not goals. They make agents reusable across *any* pipeline (not just Scout) and guarantee functionality is never silently lost.

1. **Autonomous & boundaried — no cross-agent dependency.** An agent reads **nothing** about its siblings, the pipeline DAG, or `projects/.../run/*.json`. It receives a single self-contained, schema-typed **input contract** and emits a schema-typed **output contract**. It is a pure function `input → output`. The *orchestrator* is the only component that knows the pipeline order and assembles each agent's input contract (from prior outputs + GraphRAG). Swap the orchestrator and the same agent runs in a different pipeline unchanged.

2. **Compaction-free by construction.** Each agent runs inside a fixed **context budget** (system prompt + input contract + working turns + output) sized so the Agent SDK **never triggers compaction**. Compaction is lossy and unpredictable — it would both inflate cost and risk dropping content (a functionality compromise). Budget guardrails per agent:
   - input contract ≤ ~25–30K tokens (thin projection + graph slice only)
   - working context ceiling ≤ ~80–100K tokens (well under the window)
   - bounded turns (single-responsibility ⇒ converges fast); research passes hard-capped
   - if an agent would exceed budget, that is a **split signal**, not a compaction event.

3. **Reusable / portable.** Every agent ships with an `input.schema.json`, `output.schema.json`, a `model` hint, and a manifest entry — registered like the HTML `template-registry`. Pipelines compose agents by name; agents never hard-code Scout paths or sibling names.

**Consequence for cost:** principle 1 is the strongest form of lever L1 — context cannot balloon by reading siblings (the exact 151K re-send that made Hawk cost $21.82, see §1). Principle 2 caps turns × context.

---

## 3c. Context blockers — what causes context to explode (and how each is sealed)

These are the specific mechanisms that inflate context in the current pipeline. Each must be sealed before the $10 target is achievable; leaving any one open re-introduces the balloon even after the agent split.

| Blocker | Mechanism | How it manifests | Seal |
|---|---|---|---|
| **Sibling JSON reads** | Agent loads `vera.json`, `company_context.json`, etc. wholesale via `reads[]` or inline `Read` tool calls — adds 30–80K tokens permanently to context | Hawk: 6 files loaded, context 21K→151K on turn 1, re-sent all 40 turns | §3b principle 1: agent receives input contract only; sibling files are never opened |
| **Inline file refs in TOML** | A `principle:` or `workflow:` line names a sibling path → the SDK `Read`s it mid-run even if `reads[]` is empty | Silent: looks like the TOML is clean but context still balloons | §8b gotcha #2: scrub every `principle`/`workflow`/`instructions` line that names a file; not just `reads[]` |
| **Tool result accumulation** | Each web-fetch or `Read` tool call appends the full response to the running context; a 40-turn research pass accumulates N × (avg tool result size) | Vera: research turns compound on top of the initial 80K load | Research passes hard-capped per agent; orchestrator pre-loads corpus into GraphRAG so agents never fetch corpus files directly |
| **Unbounded conversational turns** | Every new turn re-sends all prior turns; a monolith that "thinks out loud" for 40 turns re-sends prefix + Σ(all prior) on every call | Vera 64-turn run billed 1.24M input despite only ~145K output | Single-responsibility split → each subagent converges in 8–15 turns; SDK invocation sets a hard `max_turns` cap |
| **Compaction (the silent cost killer)** | Claude Code auto-compacts when context approaches the window limit — it summarizes prior turns, which is lossy, unpredictable, and adds extra summarization tokens to the bill | Can't tell it happened until agent output is wrong; billed input spikes on the summarization call | §3b principle 2: context budget sized per agent so compaction never triggers; if an agent would exceed budget it is a **split signal** not a compaction event (see §4b for orchestrator-level session management) |
| **Orchestrator session accumulation** | The orchestrator session itself grows as it spawns agents, reads outputs, and assembles next input contracts — over 22 agents it can easily approach limits | A long pipeline run in a single Claude Code session risks the orchestrator compacting mid-run, silently losing assembled context | §4b: multi-session execution engine — orchestrator checkpoints after each agent and resumes in a fresh session rather than compacting |
| **Large templated outputs** | Agents that generate large structured artifacts (Quinn's `intake.njk`, Petra's proposal JSON) emit huge output tokens that also sit in context for subsequent turns in the same agent session | Quinn and Petra are among the biggest output emitters in the baseline | Output-templating (L4): orchestrator pre-templates JSON skeleton; agent emits only variable fields; schema-validated before merge |
| **Oversized system prompt (agent TOML)** | The agent's own `.toml` system prompt is the per-turn *prefix* — re-sent on **every** turn. The §1 Hawk example assumes a 21K prefix, but the prefix is whatever the TOML weighs: Vera's was **102 KB ≈ 26K tokens × N turns**. This is the floor that survives even a perfect sibling-read seal. | Vera's prompt alone was larger than the *entire* ≤25–30K input-contract budget §3b targets — the biggest fixed component of every Vera turn | §3d: extract rarely-needed procedure (per-step playbooks, output schemas) to on-demand `commons/agent-refs/` files; agent loads a step's detail only when it enters that step. Distillation splits + Skills frontmatter for the same reason. |

### Blocker severity ranking (by cost impact on baseline)

| Rank | Blocker | Estimated cost contribution | Priority |
|---|---|---|---|
| 1 | Sibling JSON reads (re-sent every turn) | ~60–70% of total input bill | P0 — seal in Phase 1 |
| 2 | Unbounded turns on monoliths | ~15–20% (multiplicative with #1) | P0 — sealed by agent split (Phase 3) |
| 3 | Compaction (orchestrator session) | Unpredictable — can 2–5× a session | P0 — sealed by §4b session engine |
| 4 | Oversized system prompt (re-sent every turn) | ~10–15% on Vera today; **rises to #1 once blocker #1 is sealed** (it is the irreducible prefix) | P1 — trimmed on branch `refactor/trim-tomls-and-extract-refs` (DONE, §3d) |
| 5 | Tool result accumulation | ~5–10% | P1 — capped in Phase 1 |
| 6 | Large templated outputs | ~5% | P1 — output-templating in Phase 2 |
| 7 | Inline TOML file refs | Small absolute; high risk of silent regression | P1 — scrubbed in Phase 2 |

---

## 3d. System-prompt weight — the irreducible per-turn floor (IMPLEMENTED · 2026-05-22)

The §1 cost equation is `billed_input ≈ Σ over turns (context_window_at_that_turn)`. §3b·L1 attacks the part of that window that *grows* (sibling reads). This subsection attacks the part that is *fixed and re-sent on every single turn*: **the agent's own `.toml` system prompt**. The Hawk worked example calls this the "21K prefix" — but the prefix is whatever the TOML weighs, and Vera's was **102 KB ≈ 26K tokens, larger than the entire ≤25–30K input-contract budget §3b targets for the rest of context.** Sealing sibling reads does nothing to this floor; it must be trimmed separately.

**Why it ranks low today but P0-critical post-Phase-1:** while sibling reads inflate Vera to 142K/turn, the 26K prompt is ~18% of context. Once L1 seals sibling reads and context drops to ~25–30K, the system prompt becomes **50–80% of every remaining turn** — the dominant fixed cost. Trimming it is what makes the §3b budget physically reachable, not just nominally.

**Mechanism (same philosophy as L1, applied to the prompt itself):** an agent does not need its full procedure resident on every turn. Rarely-traversed step playbooks, output schemas, and shared boilerplate are extracted to on-demand `commons/agent-refs/` files; the TOML keeps a **gate statement** that names the ref, the trigger condition, and the can't-violate guards (no-fabrication, cost caps, sequencing) — those stay inline so they fire every turn. The agent `Read`s a step's full detail only when it enters that step, and only for the turns that step spans.

**Measured result (branch `refactor/trim-tomls-and-extract-refs`, byte-accounted verbatim — no content lost):**

| agent .toml | before | after | delta |
|---|---|---|---|
| vera | 102,530 B (~26K tok) | 62,848 B (~16K tok) | **−39% / −9.9K tok/turn** |
| flo | 27,815 | 22,083 | −5.7 KB |
| petra | 29,647 | 26,426 | −3.2 KB |
| mira | 31,955 | 30,381 | −1.6 KB |
| hawk / ivy / rex | — | — | +0.2–0.3 KB each (gained shared-ref pointers; no large block to extract) |
| **trimmed-7 corpus** | **269,665 B** | **220,330 B** | **−49 KB / −18%** |

Extracted to: 10 `commons/agent-refs/` files (4 Vera step-playbooks, flo portfolio routing, petra proposal schema, mira brief-audit, 3 shared patterns: decisions-logging / token-budget / no-fabrication). Plus two **distillation splits** so an agent loads only the half it uses: `psychology-profiles.json` (28 KB) → `-detection.json` (15 KB, for agents that *detect* a persona: Vera, Ivy) + `-guidance.json` (13 KB, for agents that *generate* copy: Hawk, Ivy); `architect-guide.json` (29 KB) → `-core.json` (7 KB) + `-templates.json` (22 KB, Petra only). And 6 `SKILL.md` frontmatters on the system playbooks so an agent reads the ~300-byte menu entry and skips loading the 96 KB NetSuite / 76 KB Salesforce body unless the flow needs it.

**Impact in the doc's own billing model** (input billed at full model rate, no cache discount): Vera's −9.9K tok/turn × ~64 turns ≈ **−0.63M billed input** — ≈ −$9.5 at today's Opus rate, ≈ −$1.9 once Vera moves to Sonnet (§2 Scenario 2). Real-dollar savings are lower because the prompt prefix is cache-read-eligible, but in the Σ-context model this is a first-class L1 contribution. Behavior is preserved: every gate statement retains its principle's inline guards verbatim; all 7 TOMLs parse; all referenced paths resolve; the source `psychology-profiles.json` / `architect-guide.json` / `_playbook.*` files are unchanged (splits and SKILL.md are additive).

**Phasing:** this is **Phase 1.5** — independent of the GraphRAG/agent-split work, shippable now, and a prerequisite for the §3b ≤25–30K budget to hold once sibling reads are sealed. It does not by itself reach $10 (it trims the fixed floor, not the sibling balloon), but it removes the largest obstacle to the post-seal budget.

**Does NOT impact Phase 1 (read before sealing sibling reads):** Phase 1.5 touched only three surfaces, none of which is the context-assembly path Phase 1 owns:
- **`principles[]` gate statements** (the trim) — pure prompt-weight reduction. Orthogonal to input contracts; they *compound* with Phase 1 (smaller prefix on top of a thin contract). KEEP as-is when Phase 1 lands.
- **Extracted `commons/agent-refs/*.md`** — on-demand step playbooks/schemas. When Phase 1 builds the `scout-context` layer, these become resources the layer can serve on request; until then the agent `Read`s them directly. No change to sibling-output flow.
- **Agent `reads[]` edits** (added agent-refs paths; swapped `psychology-profiles.json` → `-detection`/`-guidance`, `architect-guide.json` → `-templates`) — **this is the only overlap surface with Phase 1**, which will replace `reads[]` wholesale with a schema-typed input contract. Treat the Phase-1.5 `reads[]` as transitional: when the input contract lands, fold these static-corpus references into the contract/graph slice (the *which-slice* decision the distillation splits already encode) and drop the raw paths. The splits and SKILL.md menu are exactly the granularity Phase 1's GraphRAG should serve. **`orchestrate.js`, `company_context.json` assembly, and all sibling-output reads were NOT touched by Phase 1.5.**

**Pending Phase-1.5 follow-ups (small, do alongside or after Phase 1 — recorded here so they aren't lost):**
1. **Trim `sage.toml` (22 KB) + `quinn.toml` (24 KB)** the same way — they were out of the first pass; check for large extractable step/schema blocks. ~Same mechanism.
2. **Wire the SKILL.md menu** — the 6 `mulesoft/playbooks/playbooks/*/SKILL.md` frontmatters exist but nothing consumes them yet. Either the orchestrator surfaces the menu in the agent's input contract, or Rex/Petra reference it; goal is the agent loads the 96 KB NetSuite / 76 KB Salesforce body only when a flow needs it.
3. **Wire the `_index.json` files** — `mulesoft/canonical-models/_index.json` + `mulesoft/playbooks/usecases/_index.json` exist; orchestrate.js / agents should read the index first and fetch the one vertical file on demand instead of whole-corpus loads (this is the GraphRAG-lite path; folds naturally into Phase 1's graph build).
4. **Delete the split originals** — once every `reads[]`/contract points at the splits, remove `commons/sales/psychology-profiles.json` + `architect-guide.json` (kept for now so nothing breaks mid-migration).
5. **Equivalence gate** — run the §6 golden-baseline check on a trimmed-prompt Vera/Hawk to confirm the gate statements lost no behavior before merge.
6. **Convert all system-referenced `.md` files to `.json`** (Phase 1.6 — do in its own session). Scope: 12 files total.
   - `commons/sales/pricing-model.md` → structured data JSON (update `portal/_data/pricing.js` from regex-parse to direct JSON read; add T&M model alongside IaaS + impl-only)
   - `commons/sales/proposal-structure.md` → JSON (fix investment section: "Two Models Only" → three models including T&M)
   - `commons/agent-refs/shared-no-fabrication-pledge.md`, `shared-decisions-logging.md`, `shared-token-budget-discipline.md`, `portfolio-opportunities-routing.md`, `proposal-content-schema.md`, `corporate-brief-audit-checklist.md` → `.json`
   - `commons/agent-refs/vera/step-1c-corporate-stack.md`, `step-2c-buyer-map.md`, `step-2d-corporate-profile.md`, `implementation-lock-in.md` → `.json`
   - Update all agent TOMLs: `flo`, `hawk`, `petra`, `quinn`, `vera`, `ivy`, `mira`, `rex` — both `reads[]` arrays AND every inline string reference
   - Delete all 12 original `.md` files after
   - **Pre-clean:** delete the 3 partial files already created in this session before starting: `commons/sales/pricing-model.json`, `commons/agent-refs/shared-no-fabrication-pledge.json`, `commons/agent-refs/shared-decisions-logging.json`

---

## 4. Target architecture

```
                         ┌──────────────────────────────────────────────┐
   ONE-TIME / ON-UPDATE  │  build-graph.js  (content-hash incremental)    │
   (graphed once,        │  playbooks + canonical + connectors + FK +     │
    reused all clients)  │  PLANNING  →  graph/nodes/*.json + index.json   │
                         └───────────────────────┬──────────────────────┘
                                                  │ served by
                         ┌────────────────────────▼─────────────────────┐
                         │   scout-context  MCP server                    │
                         │   resources: node(vertical|system|usecase),    │
                         │   projection(prior-agent, fields[])             │
                         └───────────────────────┬───────────────────────┘
                                                  │ scoped queries only
   ORCHESTRATOR (deterministic; owns GraphRAG + JSON assembly + staging)   │
   ── selects retrieval keys (vertical, systems) ── builds thin bundle ────┤
   ── computes deterministic fields (e.g. PRICING) ── templates JSON skel ─┤
   ── validates each agent output against JSON Schema ── assembleContext() ┘
                                                  │ thin bundle (~25–40K) +
                                                  │ templated skeleton
                         ┌────────────────────────▼─────────────────────┐
                         │  20+ AUTONOMOUS SDK subagents                   │
                         │  each: pure input-contract → output-contract ·  │
                         │  reads NOTHING about siblings/pipeline ·        │
                         │  fixed context budget (never compacts) ·        │
                         │  right-sized model · schema'd output            │
                         └────────────────────────────────────────────────┘
```

Boundary rules preserved & hardened (see §3b): subagents are **autonomous** — they receive a self-contained input contract and write **only** their own output; they never read sibling outputs or know the pipeline. The **orchestrator** is the sole component that knows the DAG, assembles each input contract, and is sole writer of `company_context.json` / `decisions.json` and sole holder of Firebase/render side-effects. Because agents are contract-defined, the same agent runs in any pipeline.

**Who calls MCP — implementation clarification:** The **orchestrator is the sole caller** of `scout-context`. Agents never call MCP directly. The flow is: orchestrator queries MCP (which serves slices from `graph/nodes/*.json`) → gets the relevant node(s) → field-projects any prior-agent outputs it needs → assembles the thin bundle → passes it to the agent as resolved JSON. The agent sees a clean input contract, not an MCP interface. MCP is the serving layer on top of the graph; the graph is the indexed, distilled form of the static corpus. For sibling outputs (e.g. vera.json fields needed by Rex), no retrieval is needed — the orchestrator field-projects deterministically using the §8b projection map and injects the slice directly. If an agent would need mid-run access to corpus data that couldn't be anticipated at contract-build time, that is a signal the orchestrator's pre-fetch logic needs to be smarter — not that the agent should have live MCP access (which would break the fixed context budget).

---

## 4b. Execution engine — multi-session orchestration

The full pipeline spans ~51 minutes and 22 agent invocations across up to 5 phases. This **cannot be a single uninterrupted Claude Code session**: the orchestrator session itself grows as it reads outputs and assembles input contracts, and risks compaction mid-run — which is exactly the silent killer identified in §3c. The solution: treat the orchestrator as a **stateful execution engine** that writes a durable checkpoint after every agent and can resume from a fresh session at any point.

### Why a new session (not compaction)

Compaction is not an acceptable substitute for session management:

| | Compaction | New session + checkpoint |
|---|---|---|
| **Lossiness** | Lossy — summarizes prior turns, may drop field values, JSON structure, numeric details | Lossless — every agent output is written to disk before the session ends |
| **Predictability** | Unpredictable — cannot know what was dropped until an agent produces wrong output | Deterministic — new session reads exactly the files it needs, nothing more |
| **Cost** | Inflates billed input (extra summarization tokens) | Zero cost — disk reads are free |
| **Equivalence gate** | Breaks §6/E3 — if content silently drops, parity with golden baseline cannot be verified | Preserved — new session constructs input contracts from the same persisted output files |
| **Debuggability** | No audit trail of what was lost | Full audit trail — each agent's output file is the ground truth |

**Rule: the orchestrator MUST NOT compact. If the orchestrator session approaches its context budget, it checkpoints and halts. The next run uses `--resume`.**

### Pipeline state — `projects/<client>/scoping/run/pipeline-state.json`

The orchestrator writes this file after every agent completes. It is the **single resume artifact** — a new session needs only this file to know exactly where to pick up.

```json
{
  "client": "peerless",
  "run_id": "2026-05-22-001",
  "phase": 1,
  "status": "in_progress",
  "completed_agents": [
    "sage-extract", "sage-systems", "sage-contacts", "vera-profile"
  ],
  "pending_agents": [
    "vera-vertical", "vera-peers", "vera-stack", "vera-buyermap",
    "rex-systems", "rex-blockers", "ivy-profile", "flo-flows",
    "hawk-urgency", "hawk-competitive", "petra-proposal", "petra-deck",
    "quinn-intake", "mira-audit"
  ],
  "agent_outputs": {
    "sage-extract":  "projects/peerless/scoping/run/sage-extract.json",
    "sage-systems":  "projects/peerless/scoping/run/sage-systems.json",
    "sage-contacts": "projects/peerless/scoping/run/sage-contacts.json",
    "vera-profile":  "projects/peerless/scoping/run/vera-profile.json"
  },
  "context_budget_used": {
    "sage-extract":  { "in_tokens": 42000, "out_tokens": 11000, "cost_usd": 0.08 },
    "sage-systems":  { "in_tokens": 38000, "out_tokens":  8500, "cost_usd": 0.07 },
    "sage-contacts": { "in_tokens": 35000, "out_tokens":  7000, "cost_usd": 0.06 },
    "vera-profile":  { "in_tokens": 25000, "out_tokens": 12000, "cost_usd": 0.11 }
  },
  "running_total_usd": 0.32,
  "budget_ceiling_usd": 10.00,
  "orchestrator_context_tokens": 31400,
  "checkpoint_at": "2026-05-22T10:23:00Z",
  "resumed_from": null
}
```

Key fields:
- `pending_agents` — ordered list; resume starts at `pending_agents[0]`
- `agent_outputs` — path map used by orchestrator to build input contracts for downstream agents; no agent file is read twice unless its fields are needed
- `context_budget_used` — per-agent actuals written from `usage.csv` after each run; used by the budget guard (§6b)
- `orchestrator_context_tokens` — the orchestrator's own session token count at checkpoint time; if this approaches ~80K on next wake, trigger another checkpoint
- `running_total_usd` — cumulative; if this exceeds `budget_ceiling_usd` mid-run, the budget guard halts the pipeline

### Session handoff protocol

```
[Session N]
  orchestrate.js starts (or resumes from pipeline-state.json)
  for each pending_agent in order:
    1. orchestrator builds thin input contract
       (field projection from completed outputs + GraphRAG slice)
       — reads ONLY the specific output files needed, not all prior outputs
    2. spawn SDK subagent with input contract + schema
    3. agent runs, emits output.json
    4. orchestrator validates output against JSON Schema
    5. orchestrator writes agent's output to disk
    6. orchestrator appends actual cost to pipeline-state.json
    7. CHECKPOINT: write updated pipeline-state.json
    8. CHECK: if orchestrator_context_tokens > 80K threshold
       → HALT SESSION: print "run: node orchestrate.js --client peerless --resume"
       → exit cleanly (no compaction)

[Session N+1]
  node orchestrate.js --client peerless --resume
  reads pipeline-state.json
  skips completed_agents
  picks up at pending_agents[0]
  orchestrator context starts FRESH (~5K prefix only)
```

### When to trigger a new session (checkpoint conditions)

| Trigger | Action |
|---|---|
| Orchestrator's own context approaches ~80K tokens | Checkpoint after current agent completes; halt; prompt user to `--resume` |
| Any agent's actual cost exceeds its §2 budget ceiling | Flag in `pipeline-state.json`; halt pipeline; surface the over-budget agent |
| Running total `running_total_usd` > `budget_ceiling_usd` | Budget guard fires; halt; surface cost breakdown before spending more |
| Agent hits its `max_turns` hard cap | Treat as split signal; log to `pipeline-state.json`; skip agent; flag for §3b decomposition review |
| Any agent output fails JSON Schema validation | Halt; do not proceed; schema violation means input contract assembly for downstream is broken |

### Implementation — orchestrator changes needed

These are new functions in `orchestrate.js`; existing `assembleContext()` / agent-spawn logic is refactored to call them:

| Function | Responsibility |
|---|---|
| `checkpoint(state)` | Writes `pipeline-state.json`; called after every `await agent.run()` resolves and output is validated |
| `resume(clientDir)` | Reads `pipeline-state.json`; returns `{ completedOutputs, pendingAgents }`; skips any agent in `completed_agents` |
| `probeOrchestratorContext()` | Returns current orchestrator session token count via SDK usage API; called before spawning each agent |
| `budgetGuard(state)` | Checks `running_total_usd` vs `budget_ceiling_usd` and per-agent actuals vs §2 ceilings; throws `BudgetExceeded` if breached |
| `buildInputContract(agentName, state)` | Reads only the specific output files listed in `agent_outputs` that the named agent's projection map requires (§8b); never reads all prior outputs |

CLI entry points:
```bash
node orchestrate.js --client peerless              # fresh run; writes new pipeline-state.json
node orchestrate.js --client peerless --resume     # resume from existing pipeline-state.json
node orchestrate.js --client peerless --status     # print pipeline-state.json summary, cost so far
node orchestrate.js --client peerless --reset      # delete pipeline-state.json (start over)
```

### Session count expectation (Peerless proof run)

With the 22-agent split and orchestrator context probed every agent:

| Phase | Agents | Expected sessions | Reason |
|---|---|---|---|
| Phase 1 | Vera, Hawk, Sage (MCP switch) | 1–2 | Orchestrator context stays low; these are the first 3 converted |
| Phase 2 | Rex, Ivy, Flo, Petra, Quinn, Mira | 1–2 | Output-templating reduces output size; less to read back |
| Phase 3 | Full 22-agent split | 2–3 | 22 agents; orchestrator likely crosses 80K threshold once mid-run |
| **Total proof run** | all | **~3–5 sessions** | Each is a clean fresh context; no compaction at any point |

3–5 `--resume` invocations is the expected normal operating mode for any full-pipeline client run, not an exception.

---

## 5. Agent decomposition — 10 → 22

Splitting reduces turns-per-agent (the first cost lever) and lets each worker use the cheapest viable model. Deterministic work moves OUT of agents into the orchestrator (zero tokens). Each micro-agent is autonomous: the orchestrator assembles its self-contained input contract (column 3); the agent reads only that, never sibling files.

| # | Today | → micro-agents (model) | self-contained input contract |
|---|---|---|---|
| 1 | sage | sage-extract (h), sage-systems (h), sage-contacts (h) | raw docs slice only |
| 2 | vera | vera-profile (h), vera-vertical (s), vera-peers (s), vera-stack (s, capped research), vera-buyermap (s) | usecase node + sage projection |
| 3 | rex | rex-systems (s), rex-blockers (s) | connector node(s) for detected systems only |
| 4 | ivy | ivy-profile (h) | psychology node + sage/vera projection |
| 5 | flo | flo-flows (s) · **flo-pricing → orchestrator (deterministic, 0 tok)** | flow inputs only; pricing is formula |
| 6 | hawk | hawk-urgency (s), hawk-competitive (s) | vera-stack + reference node |
| 7 | petra | petra-proposal (s), petra-deck (s) | projected flows/blockers + templated skeleton |
| 8 | quinn | quinn-intake (h) | flo projection + relevant FK nodes; scaffold templated |
| 9 | mira | mira-audit (s) | rendered diffs/projection, not full HTML |
| (sol) | parked | split when activated | — |

= **19 LLM subagents + pricing-as-code + a graph-keys router** → ~21–22 units. (h)=Haiku, (s)=Sonnet. Opus reserved only if an equivalence test proves a worker regresses on Sonnet.

**Reusability split — design note for schema authoring (Phase 3):** The decomposition above was driven by cost (reduce turns, right-size models). The contract architecture (`input.schema.json` + `output.schema.json` + manifest entry per agent) enables reusability as a side effect — but the schemas have not been written yet. When authoring them, frame agents around their **purpose**, not Scout's pipeline order, so the schema doesn't leak MuleSoft assumptions into agents that don't need them.

| Genuinely reusable (any sales pipeline) | Scout/MuleSoft-specific |
|---|---|
| `vera-profile` (company enrichment) | `sage-systems` (detects integration systems) |
| `vera-stack` (corporate/ownership structure) | `rex-systems` (MuleSoft integration readiness) |
| `vera-buyermap` (buyer mapping + deal roles) | `rex-blockers` (integration blockers) |
| `vera-peers` (peer/competitor discovery) | `flo-flows` (MuleSoft use-case mapping) |
| `vera-vertical` (industry/vertical research) | `petra-proposal` (MuleSoft proposal) |
| `ivy-profile` (buyer psychology detection) | `quinn-intake` (MuleSoft intake form) |
| `hawk-urgency` (deal urgency signals) | `mira-audit` (Scout portal audit) |
| `hawk-competitive` (competitive analysis) | |
| `sage-extract` (structured extraction from raw docs) | |
| `sage-contacts` (contact extraction from docs) | |

Agents in the left column can run unchanged in a non-Scout sales pipeline if their schemas are written without Scout-specific field names. Agents in the right column are intentionally domain-specific — no need to generalize them.

---

## 6. How we PROVE peerless ≤ $10 — empirical validation protocol

The §2 model is the *prediction*. Proof = the instrument already in place (`usage.csv`) plus a golden-baseline gate. No phase ships on the projection alone.

- **E0 — Freeze the golden baseline.** Snapshot current peerless `company_context.json`, `decisions.json`, and every rendered artifact (corporate brief, proposal, deck, intake, diagrams). Tag the baseline `usage.csv` rows (total **$97.87**).
- **E1 — Re-run, flag-gated.** Re-run peerless with `SCOUT_GRAPH=1`; telemetry writes fresh `usage.csv` rows automatically.
- **E2 — Cost gate (the $10 proof).** Sum the new peerless rows. **Pass iff total ≤ $10.** Each agent row is checked against the §2 budget; any agent over budget is investigated before proceeding. A direct, audited measurement — not a model.
- **E3 — Functionality gate (no compromise).** Diff new outputs vs the E0 snapshot against a fixed equivalence checklist: same systems verified (Rex), same **flow count & pricing** (Flo), same **p0 blockers**, same **buyer map / named contacts** (Vera/Ivy), **intake question parity** (Quinn), proposal/deck section parity (Petra), audit corrections preserved (Mira), all diagrams + Firebase deploy succeed. **Pass iff** every item is equivalent-or-better. A cost win that loses content **fails**.
- **E4 — Per-phase ratchet.** Each phase (0→4) re-runs E1–E3 and merges only if cost is **monotonically lower** and functionality holds. Old path stays behind the flag for instant rollback until Phase 4.

**All post-hooks preserved:** Vera corporate-brief render, Flo diagram assembly, Petra proposal/deck render, Quinn intake render, Mira Firebase deploy — untouched contracts.

**Falsifiability:** if E2 can't reach ≤ $10 while E3 holds, the claim is wrong — and the §2 sensitivity table says the likely cause is Opus-removal quality or weak output-templating. Both are measured first (Phase 1), so we learn it cheaply, not at the end.

---

## 6b. Why ≤ $10 holds for ANY client — a structural ceiling, not a peerless fluke

Peerless proves the *numbers*; the *architecture* proves the **ceiling**. Per-agent cost = `turns × context_per_turn × model_rate (+ output × rate_out)`. The refactor caps **every term independent of the client**:

| Term | What bounds it per client | Cap |
|---|---|---|
| context_per_turn | §3b input contract is a **fixed field projection + graph slice** — not "whatever the client produced." | ≤ ~25–30K, same for every client |
| turns | single-responsibility agents converge fast; **research passes hard-capped** (a complex ownership lattice cannot run 200 passes) | bounded per agent |
| model_rate | fixed per agent in `pipeline.json` | constant |
| output | orchestrator templates the JSON skeleton; agent emits only variable fields | bounded per agent |

So the pipeline total is a **sum of bounded per-agent ceilings** ⇒ a per-client maximum that doesn't scale with client complexity. Peerless (a non-trivial client) lands at $8.82 with $1.18 headroom under that ceiling.

**The one client-variable input — raw scoping documents (Sage).** Doc volume genuinely varies (Peerless: ~189KB transcripts). Mitigation, so even an outlier stays bounded:
- Sage works from an orchestrator **pre-stage** that chunks/segments large doc sets and feeds Sage bounded windows, rather than dumping all transcripts into one growing context.
- A **per-client cost budget guard** in the orchestrator: if any agent's live `usage.csv` row exceeds its §2 ceiling, the run flags (and can halt) instead of silently overspending — so $10 is *enforced*, not just *hoped*.

This guard is itself a Phase-2 deliverable: the $10 target becomes a runtime invariant, validated on peerless and enforced on all future clients.

---

## 7. Token burn to ACHIEVE this (one-time investment + ROI)

| Item | Tokens / cost | Notes |
|---|---|---|
| One-time GraphRAG build (LLM-distill 111 playbooks + FK 80K + PLANNING 85K + registry 385K ≈ 313K in) on Haiku | ~$0.6 | Incremental after: pennies per corpus change (hash) |
| Validation pipeline re-runs during tuning (~5 runs, $18→$9 as it converges) | ~$50–70 | The bulk of build-time spend; each run also proves the number |
| Dev-time implementation (MCP server + SDK subagents + orchestrator changes + 20-agent split), Claude Code session tokens | ~$100–200 | Estimate; depends on iteration |
| **Total one-time** | **~$150–270** | |

**ROI:** saving ≈ $89/client → **payback in ~2–3 clients**, then ~$89 saved every client thereafter. Plus ~64 min faster per run.

---

## 8. Phasing (incremental, flag-gated; context-graph first, then split)

- **Phase 0** ✅ DONE (`3b58dd5`) — `build-graph.js` + `graph/` artifacts + content-hash manifest + `cost-model.js` + `session-decomp.js`. Exit: graph builds, one vertical validated, model committed.
- **Phase 1** ✅ DONE (`59a5c2e`) — `scout-context` MCP server + orchestrator `stageContext()`; stage builders for Sage, Vera, Hawk (the 3 cost-killers). Exit: those 3 agents read thin pre-staged input instead of raw JSON siblings.
- **Phase 1.5** ✅ DONE (merged `648ad57`) — TOML trim: vera.json → company_context.json in Rex/Ivy/Quinn reads[]; agent-refs extraction; psychology-profiles/architect-guide split. Merged into cost-discipline branch.
- **Phase 2** ✅ DONE (`023b62a`) — stage builders for Rex, Ivy, Flo, Petra, Quinn, Mira; `computePricing()` deterministic from confirmedFlows[]; budget guard ($10 ceiling); all 9 agents use stage files. Exit: full pipeline ≤ ~$12 (projected), equivalence holds.
- **Phase 3 (validate)** 🔄 IN PROGRESS — end-to-end peerless pipeline re-run to prove E2 (≤$12) + E3 (equivalence). Exit: total < $12, all 9 stage files written, flo.json.pricing has numeric fields.
- **Phase 1.6** ⏳ NEXT — convert `pricing-model.md`, `proposal-structure.md`, and `commons/agent-refs/*.md` to `.json`; update `portal/_data/pricing.js` + all TOMLs.
- **Phase 3 (split)** ⏳ PENDING — decompose 10 → 22 single-responsibility SDK subagents. Exit: full pipeline **≤ $10**, equivalence holds, time ↓ ~50%.
- **Phase 4** ⏳ PENDING — flip `SCOUT_GRAPH` default on; retire raw `reads`/monolith TOMLs.

---

## 8b. Tactical handoff — confirmed applicable (folded in from the prior ≤$20 pass)

A parallel ≤$20 cost pass produced findings that fold directly into this plan (reviewed & confirmed 2026-05-22):

- **Open PRs:** #43 (Flo+Hawk→Sonnet, *this branch*) is the single biggest tactical win and on-plan — keep. #44 (drop `vera.json` from Rex/Ivy/Quinn) is a partial down-payment on §3b autonomy; its wholesale `company_context.json` read is **superseded** by orchestrator-staged thin input contracts (that assembled doc is large — it was part of Hawk's 151K balloon).
- **Graph is secondary to $:** static-corpus trimming is low-value (Sage's `connector-names` drop = 0.7% of its bill). GraphRAG earns its keep on *corpus-heavy* agents (Rex's 385K connector-registry, Quinn's FK/`intake.njk`, Vera's canonical) and the "graph-once / cross-pipeline reuse" requirement — **not** as the primary cost lever. Bulk saving = prior-output projection + split + model + output-templating.

### Audited projection map — the input-contract source (REUSE THIS)
The orchestrator builds each downstream input contract from these field mappings instead of re-auditing. Source: `assembleContext()` case `'vera'` (~586–606) + `mergeVeraCorporateStackEnrichment()` (~938–1070) in `orchestrate.js`. **Audited GO** — the orchestrator already projects everything downstream agents consume from `vera.json`, so those agents never need the raw file.

| company_context.json field | from vera.json | line | mode |
|---|---|---|---|
| `snapshot, industry, verticalSlug, hqLocation, revenueEstimate, revenueBracket, businessObjects, logoUrl` | `company.*` flattened | 590–597 | full |
| `aiJourney, systemPrerequisites, nearbyPeers, competitorFOMO, aiThoughtStarters` | same names | 599–603 | full |
| `corporateStack.{ownership, operatingBrand(+legacyBoltOns[]), leadership, financialSponsor, engagementEntity, subsidiaries, collaborators, strategicPartnerships, dealUrgencyMultipliers, sourcesNote, confidence, researchedAt}` | `corporateStack.*` | 964–966 | 12-key whitelist |
| `corporateStack.operatingPlatform.{name, website, linkedIn, description, platformShape, regionalStrategy, rollupHistoryNarrative, platformExecutiveTeam, sourceUrl, relationshipUncertainty}` | same | 971–973 | 10-key whitelist |
| `corporateStack.operatingPlatform.siblingBrands[]` | seed + enrichment overlay | 975–995 | additive `{...seed, ...enrich}` — Tier-A deep fields survive |
| `corporateStack.financialSponsor.portfolioCompanies[]` | `corporateStackEnrichment…` | 1002–1004 | full array |
| `buyerMap` (incl. `people[].angleForIvy`, `webEvidence`, `dealRole`) | `buyerMap` | 1010–1011 | full replace |
| `namedBuyers` | `namedBuyers` | 1016–1017 | full replace |
| `corporateProfile`, `corporateProfileMeta` | same | 1045–1047 | full |
| `dealUrgencyMultipliers, forwardLookingTalkingPoints, intelTheBuyerLacks` | same | 1053–1063 | full |

Per-agent vera usage (all covered above ⇒ all GO to drop `vera.json`): **Rex** → `businessObjects, industry, systemPrerequisites`; **Ivy** → `buyerMap.people[].angleForIvy, namedBuyers`; **Quinn** → `systemPrerequisites`; **Flo** → `corporateStack` + `corporateStackEnrichment` for `portfolioOpportunities[]`. (PR #44 did Rex/Ivy/Quinn; Flo held to avoid conflict with PR #43.)

### Implementation gotchas (must not repeat)
1. **Model is set in `pipeline.json`, not the TOML.** `orchestrate.js:1689-1697` passes `pipeline.json`'s `model` field as `--model`; the TOML `model` is documentation. **Edit both together** or the swap is silent.
2. **Autonomy requires scrubbing *inline* file refs, not just `reads[]`.** If any `principle`/`workflow` line names a sibling file, the agent still `Read`s it. §3b "reads no siblings" must remove every inline reference.
3. **Quinn `intake.njk` (99KB) output-templating** needs a content-schema artifact matching the frozen `intake.njk`, validated by an Eleventy render before shipping (ties to the `feedback_intake_template_frozen` memory).

---

## 9. Risks & mitigations

- **Sonnet/Haiku quality regression on synthesis agents (Vera, Petra)** → equivalence gate; selectively keep Opus only where a worker provably regresses.
- **Output-templating reduces nuance** → template only structural boilerplate, never decision-bearing prose; equivalence checklist covers content parity.
- **More agents = more orchestration/turn overhead** → net win is proven (Scenario 2) because per-turn context + model rate fall faster than turn count rises; watch for fixed per-invocation overhead.
- **MCP adds a moving part** → keep it a thin local server over the committed graph; deterministic, no network.
- **Graph staleness** → content-hash manifest forces re-distill of changed sources.
- **Outlier client (huge transcripts)** → Sage pre-stage chunking + runtime cost-budget guard (§6b) keep the $10 ceiling enforced, not just projected.
- **Orchestrator compaction mid-run** → §4b session engine: orchestrator checkpoints and halts before hitting 80K; `--resume` starts fresh. If compaction fires before the probe catches it, the run is invalid — discard `pipeline-state.json`, reset, and re-run. Probe threshold must be tuned conservatively (80K not 100K) to give the orchestrator room to finish the current agent before halting.
- **Inline TOML file refs (silent blocker)** → §3c / §8b gotcha #2: a grep audit of all `principle`/`workflow`/`instructions` fields for file paths must be part of the Phase 2 checklist; not just `reads[]`. Miss one and an agent silently loads a sibling file and the context balloon is back.
- **`pipeline-state.json` corruption or partial write** → `checkpoint()` must write atomically (write to `.pipeline-state.tmp`, then rename); a torn write leaves the pipeline in an unknown state. Validate the JSON on every `--resume` load before trusting `completed_agents`.
- **Budget guard not firing in time** → the guard checks after each agent completes; a single rogue agent could overspend before the guard runs. Mitigation: SDK subagent invocation includes a token-count soft-limit hint; if the agent's live `usage.csv` row exceeds 2× its §2 ceiling mid-run, the orchestrator kills it via the Agent SDK's cancellation API.
- **Multi-session user friction** → 3–5 `--resume` invocations is expected normal operating mode (§4b); document this as the standard flow, not an error. The `--status` flag surfaces pipeline progress so users know what's running and what's done without reading raw JSON.
