# Build Plan + Progress
# Status and specs live here. PLANNING_CONTEXT.md contains system design only.
# Update this file — and only this file — when a chunk completes or specs change.

RESEARCH PHASE           [x] COMPLETE (2026-05-10)
  docs/PATTERNS_RESEARCH.md — comprehensive EIP + flow control + coupling research
  docs/PLANNING_CONTEXT.md  — full rewrite incorporating all research

CHUNK 1 — Repo Foundation[x] COMPLETE (2026-05-10)
  decisions-schema.json, connector-registry.json (full),
  folder structure, .devcontainer, .gitignore, README, CHUNK_PROGRESS.md
  NOTE: No changes needed — foundation is solid

CHUNK 2 — Standards Doc  [x] COMPLETE (2026-05-10)
  standards/MULESOFT_DESIGN_STANDARDS.md — FULL REWRITE
  Must include: Level 0-6 complete, all 18 patterns (A-R),
  flow control standards, compensation framework, cross-cutting patterns,
  EDA fit assessment, anti-patterns table

CHUNK 3 — Scenario Files [x] COMPLETE (2026-05-10)
  Rewrote all 15 existing scenario files (A-O) + created 3 new:
    standards/scenarios/ai-augmented-flow.md      (P)
    standards/scenarios/rag-data-pipeline.md      (Q)
    standards/scenarios/agentic-mcp-integration.md (R)
  Each file: integrationStyle, compensationStrategy, flowControl block,
  invalidMessageChannel where applicable, EDA fit assessment note

CHUNK 4 — BMAD Agents    [x] COMPLETE (2026-05-10)
  Files: _bmad/custom/bmad-agent-analyst.toml
         _bmad/custom/bmad-agent-architect.toml
         _bmad/custom/bmad-agent-pm.toml
         _bmad/custom/bmad-agent-dev.toml
  Analyst: API Contract Discovery trigger; reads FIELD_KNOWLEDGE.md; MA + AC menu items
  Architect: reads PATTERNS_RESEARCH.md + FIELD_KNOWLEDGE.md pre-decision-tree;
             walks 6-level tree; writes scaffold.profile; MD + CV menu items
  PM: reads FIELD_KNOWLEDGE.md; MS menu item with per-flow + global story templates
  Dev: reads FIELD_KNOWLEDGE.md; checks api-discovery contracts; MI menu item with
       full MUnit, idempotency, claim-check, and file-layout enforcement

CHUNK 4+5 AUDIT + FIX PASS [x] COMPLETE (2026-05-10)
  Opus-model adversarial audit found 71 issues (7 CRITICAL, 36 HIGH, 28 MEDIUM).
  All 71 fixed in priority order. Key fixes:
  - PLANNING_CONTEXT.md: corrected _bmad/custom/ paths (was .claude/skills/ — wrong)
  - decisions-schema.json: deduplicationTtlMinutes 60 → 1440 (was shorter than message TTL)
  - PLANNING_CONTEXT.md: idempotency TTL rule clarified — must equal messageTtlHours × 60
  - All 4 agent TOMLs: coverage floors unified (all 18 patterns covered, "all others=80%" added)
  - All 4 agent TOMLs: FIELD_KNOWLEDGE.md write-back requirement added
  - bmad-agent-analyst.toml: 4-branch connector lookup, both discovery trigger conditions,
    blocker-stop rule, staleness recording in prd.md, PII handling rule, MULESOFT_DESIGN_STANDARDS
    and prd-template.md added to persistent_facts
  - bmad-agent-architect.toml: per-class TTL policy table embedded, compensation decision rule
    (financial/provisioning → saga), EDA fit assessment mandate, cross-cutting patterns
    evaluation checklist, anti-patterns guard, scaffold profile rules embedded, CV menu
    now calls MCP (not just flags), Level 0 selection rules in MD prompt, scenario files
    mandatory at Level 1, dedup formula (= messageTtlHours × 60), architecture-template.md
    added to persistent_facts, watermark enforcement
  - bmad-agent-pm.toml: story-template.md added to persistent_facts; architecture.md Field
    Mapping/Business Rules/Open Items required reading; 4 conditional global stories added
    (wire tap, field encryption, IMC, contract confirmation); AI provider story added;
    removed "ask 3 questions" (PM has no questions — all in decisions.json);
    watermark AC added for pattern D; OAS/RAML per client platform; security-tier ACs
  - bmad-agent-dev.toml: scenario files required pre-implementation; idempotency TTL
    = messageTtlHours × 60 (not hardcoded 24h); error envelope format specified;
    retry table embedded; claim-check step 4 (delete after processing) added; per-env
    log levels specified; MULESOFT_DESIGN_STANDARDS added to persistent_facts
  - prd-template.md: staleness + freshness column added to Systems table; API Format column;
    credentials-available column in API Discovery Triggers; per-flow volume+latency in Flows
    table; Compliance and Data Residency section added; FIELD_KNOWLEDGE entries section;
    PII caution note on intake quotes
  - architecture-template.md: Decision Summary now includes TTL, compensation, AI rows;
    EDA verdict has 3 options (warranted / not warranted / Kafka required); Field Mapping
    table has Confirmed/Open Item status column; per-flow compensation rationale and saga
    steps in flow section; AI Integration section added; API-Led Architecture View section
    added; Idempotent Receiver TTL row includes class hint; region field un-hardcoded;
    Level 4 deduplication notes; sign-off checklist expanded with 9 new items
  - story-template.md: story ID scheme ({CLIENT}-{NNN}); Story Index has pattern + coverage
    floor columns; 5 new conditional global stories (wire tap, field encryption, IMC,
    contract confirmation, AI provider); MQ TTL story has all 5 event categories; MQ story
    has alert channel AC; Implement Flow story has claim-check AC, validation-before-
    downstream AC, pattern-conditional ACs table; MUnit story has structured test case table
    with mock column + extended error scenarios note; CI/CD story specifies Java 17 +
    mule-maven-plugin; Visualizer story has property location (mule-artifact.json)

CHUNK 5 — BMAD Templates [x] COMPLETE (2026-05-10)
  Files: templates/prd-template.md
         templates/architecture-template.md
         templates/story-template.md
  PRD: stakeholders, systems (registry status), flows, NFR, constraints, API discovery
       triggers, open items (blockers vs non-blockers), assumptions, out-of-scope
  Architecture: all 6 decision levels, per-flow Field Mapping table
    (Source Field | Source System | Target Field | Target System | Transform Rule),
    per-flow Business Rules section, per-flow Open Items section,
    semantic dissonance table, cross-cutting patterns, flow control config,
    EDA fit assessment, scaffold profile selection, architect sign-off checklist
  Story: global stories (error handler, MQ queues, secrets, CI/CD, Visualizer),
         per-flow block (API spec, flow impl, DataWeave, MUnit, monitoring alerts),
         story index, coverage floors, MUnit test case table, open-item TODO format

CHUNK 6 — Story Library  [x] COMPLETE (2026-05-10)
  Files: story-library/global-error-handler-dlq.md
         story-library/global-mq-queues.md
         story-library/global-secrets-manager.md
         story-library/global-cicd-pipeline.md
         story-library/global-visualizer.md
         story-library/global-wire-tap.md
         story-library/global-field-encryption.md
         story-library/global-invalid-message-channel.md
         story-library/global-contract-confirmation.md
         story-library/global-ai-provider.md
         story-library/flow-api-spec.md
         story-library/flow-implementation.md
         story-library/flow-dataweave.md
         story-library/flow-munit-tests.md
         story-library/flow-monitoring-alerts.md
  Global (10): 5 always-on + 5 conditional (wire-tap, field-encryption, IMC, contract, AI)
  Per-flow (5): api-spec, implementation (all 18 pattern conditional ACs), dataweave,
                munit-tests (coverage floors + pattern-specific extra test cases), monitoring-alerts
  Each file: conditions, priority, full AC set, pattern-conditional rows, implementation notes

CHUNK 7 — XML+DWL Tmpl   [x] COMPLETE (2026-05-10)
  scaffold/xml-templates/ (13 core files):
    pom.xml, mule-artifact.json, global-config.xml, error-handler.xml,
    flows-base.xml, munit-base.xml, oas-spec.yaml, transform.dwl, deploy.yml,
    local.yaml, dev.yaml, uat.yaml, prod.yaml
  scaffold/xml-templates/triggers/ (6 files — one per trigger type):
    http-listener.xml, scheduler.xml, mq-subscriber.xml,
    kafka-listener.xml, sftp-on-new-file.xml, db-poll.xml
  scaffold/xml-templates/snippets/ (6 cross-cutting pattern snippets):
    idempotency-check.xml, wire-tap.xml, invalid-message-channel-route.xml,
    claim-check-store.xml, claim-check-retrieve.xml, correlation-id-propagate.xml
  templates/connectors/ (24 connector config stubs):
    http-listener, http-generic, soap-generic, anypoint-mq, salesforce,
    netsuite, database (mysql/pg/mssql/oracle variants), object-store,
    sftp, amazon-s3, email, kafka, servicenow, workday, jira, sap,
    jms, amazon-sqs, azure-service-bus, azure-blob, mongodb,
    openai, anthropic, dynamics365
  Standards enforced in every template:
    - Idempotency TTL = messageTtlHours × 60 (never hardcoded 24h)
    - Wire tap in async + on-error-continue (never affects primary flow)
    - Email/notification send in async + on-error-continue
    - MANUAL ack mode on all MQ subscribers
    - Watermark stored in persistent Object Store (not in-memory)
    - PII mask note at every audit/log publish point
    - SAP JCo license warning in sap-config.xml
    - CloudHub 2.0 ephemeral filesystem note in sftp/file configs
    - AI API key must be in Secrets Manager (noted in openai/anthropic configs)

CHUNK 8 — Scaffold Gen   [ ] NOT STARTED
  File: scaffold/generate.js
  Reads decisions.json + scaffold/xml-templates/ + templates/connectors/
  Generates a complete, compilable Mule 4.8.0 project into /tmp/{client}-mule/
  Requirements:
    - Compute scaffold.profile if not set: minimal/standard/enterprise/regulated
        minimal:    security=internal, availability=best-effort, pattern=outbound-notification only
        standard:   security=internal or partner, availability=99.9, any async pattern
        enterprise: availability=99.99 OR customDashboard=true OR compensationStrategy=compensating-transaction
        regulated:  security=regulated or government
    - pom.xml: inject connector <dependency> blocks from connector-registry.json
               add TODO comment per connector: "Verify exact patch version at {exchangeUrl}"
               warn if connector lastVerified > 30 days
    - global-config.xml: inject selected connector config blocks from templates/connectors/
    - error-handler.xml: inject {{DLQ_ENABLED}} and {{INVALID_MESSAGE_CHANNEL_ENABLED}} flags
    - One {flow.name}-flows.xml per entry in decisions.json flows[]
        Select trigger template from triggers/ based on flow.trigger value
        Inject idempotency-check snippet when pattern is async (MQ/Kafka)
        Inject wire-tap snippet when wireTap.enabled=true
        Inject claim-check-store snippet when payload > 1MB indicated
        Inject correlation-id-propagate snippet on every outbound HTTP call
    - One {flow.name}-test.xml per flow, based on munit-base.xml
        Pre-scaffold 3 test cases: happy path + connectivity error + validation error
        Set coverage floor from pattern table (80%/75%/60%) in munit-maven-plugin
        Connector calls excluded from coverage
    - DataWeave stubs: one .dwl per flow, based on transform.dwl
        Read architecture.md Field Mapping table for the flow
        Each confirmed mapping → one-line DWL comment: // {sourceField} ({sourceSystem}) → {targetField}: {rule}
        Each Open Item → // TODO [OPEN ITEM]: {question} — best guess: {value}
        If no Field Mapping table → generic TODO only
    - OAS spec stub per HTTP-triggered flow, based on oas-spec.yaml
    - Properties files: local/dev/uat/prod.yaml with correct queue names and env suffixes
    - deploy.yml: only when decisions.json devops.cicd = "github-actions"
    - Regulated profile additions: field-encryption config + audit-trail flow always generated
    - mule-artifact.json: populate secureProperties list based on security level
  Output: /tmp/{client}-mule/ matching the exact structure in PLANNING_CONTEXT.md

CHUNK 9 — Client Repo Sh [ ] NOT STARTED
  File: scaffold/create-client-repo.sh
  Requirements:
    - Uses GitHub API (not gh CLI — gh may not be installed in all environments)
    - Reads decisions.json for repo name: {client}-mule
    - Calls scaffold/generate.js to produce /tmp/{client}-mule/
    - Creates new GitHub repo via POST /orgs/{org}/repos (private, no wiki, no projects)
    - Pushes generated code as initial commit
    - Sets up Codespace configuration if .devcontainer present in generated project
    - Outputs: repo URL + Codespace URL for developer
    - Error handling: fail fast if repo already exists; do not overwrite

CHUNK 10 — E2E Test      [ ] NOT STARTED
  Full pipeline test using LeoLabs intake docs (projects/leolabs/)
  Sequence: Analyst → Architect → PM → Scaffold → (manual) repo check
  Validates:
    - decisions.json produced with correct pattern, connectors, TTL, profile
    - Generated code compiles (mvn compile — no deploy needed)
    - MUnit tests pass (mvn test)
    - All flow files present (one per decisions.json flows[] entry)
    - No hardcoded credentials in generated property files
    - pom.xml has correct connector versions and TODO comments
    - deploy.yml generated (LeoLabs uses github-actions)

NEW ARTIFACT 2026-05-10:
docs/FIELD_KNOWLEDGE.md  [x] CREATED — architect training + lesson accumulation system
