# Agent Boundary Policy

## Rule

Every DSPipeline agent writes **only its own `run/{agent}.json`** output file.
No agent writes HTML, calls `npm run build:html`, or writes any other project file.

## Rationale

Agents run via the LangGraph orchestrator (`pipeline/langgraph/orchestrator.mjs`) and
have no guaranteed access to the repo's build toolchain. The orchestrator owns the
build pipeline — it runs post-hooks after each agent completes and is the single place
where Eleventy is invoked and HTML files are copied into place. This makes the pipeline
tool-agnostic and keeps agent sessions short and focused.

## Agent output contract

| Agent | Writes | Orchestrator post-step |
|-------|--------|------------------------|
| Sage  | `run/sage.json` | merges company_context.json |
| Rex   | `run/rex.json` | rebuilds connector index |
| Flo   | `run/flo.json` | writes flowCount + pricing to project.json |
| Vera  | `run/vera.json` | merges corporate stack, writes client-registry, renders corporate-brief HTML |
| Ivy   | `run/ivy.json` | merges psychology profile into company_context.json |
| Hawk  | `run/hawk.json` | merges talking points into company_context.json |
| Quinn | `run/quinn.json` (includes `intakeContent` field) | extracts intake-content.json → build:html → copies intake HTML |
| Petra | `run/petra.json` (includes `proposalContent` + `integrationDeckContent` fields) | extracts content JSONs → build:html → copies proposal + deck HTML |
| Mira  | `run/mira.json` (includes `rewrittenContent` field) | applies rewrites → build:html → copies affected HTML → deploys |

## What agents embed in their JSON

### Quinn — `intakeContent`
The complete object that was previously written as `intake-content.json`.
The orchestrator extracts it and writes the file, then calls Eleventy.

### Petra — `proposalContent` + `integrationDeckContent`
The complete objects that were previously written as `proposal-content.json`
and `integration-deck-content.json`. Orchestrator extracts, writes, then calls Eleventy.

### Mira — `rewrittenContent`
```json
{
  "intake":          { ...complete rewritten intake-content.json... }  | null,
  "proposal":        { ...complete rewritten proposal-content.json... } | null,
  "integrationDeck": { ...complete rewritten integration-deck-content.json... } | null,
  "corporateBrief":  { ...complete rewritten corporate-brief-content.json... } | null
}
```
`null` means no rewrites were needed for that document.
Orchestrator writes any non-null entries, then calls Eleventy once, then copies HTML.

## Enforcement

- Each agent has a dedicated runner in `pipeline/langgraph/agents/*-runner.mjs` that defines its own boundary.
- Any principle or workflow step that says "run `npm run build:html`" or "copy from `_build/`"
  is a policy violation — remove it and move the work to `pipeline/langgraph/post-hooks.mjs`.
- The `.md` intermediate format is retired. All intake content flows through
  `intake-content.json` (JSON-only pipeline).
