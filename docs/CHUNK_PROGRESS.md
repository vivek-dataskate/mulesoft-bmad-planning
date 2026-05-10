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

CHUNK 7 — XML+DWL Tmpl   [x] COMPLETE (2026-05-10) + AUDIT FIXED (2026-05-10)
  scaffold/xml-templates/ (13 core files):
    pom.xml, mule-artifact.json, global-config.xml, error-handler.xml,
    flows-base.xml, munit-base.xml, oas-spec.yaml, transform.dwl, deploy.yml,
    local.yaml, dev.yaml, uat.yaml, prod.yaml
  scaffold/xml-templates/triggers/ (6 original + 3 new = 9 trigger templates):
    http-listener.xml, scheduler.xml, mq-subscriber.xml,
    kafka-listener.xml, sftp-on-new-file.xml, db-poll.xml
    [NEW] batch-scope.xml          — patterns B/C/K; scheduler + batch:job Steps 1+2 + on-complete watermark
    [NEW] scatter-gather.xml       — pattern I (api-aggregation); per-route target vars + composition DWL
    [NEW] process-orchestration.xml — pattern H (saga); 3 flows: initiate + process + status polling
  scaffold/xml-templates/snippets/ (6 cross-cutting pattern snippets):
    idempotency-check.xml, wire-tap.xml, invalid-message-channel-route.xml,
    claim-check-store.xml, claim-check-retrieve.xml, correlation-id-propagate.xml
  templates/connectors/ (24 original + 4 new = 28 connector config stubs):
    http-listener, http-generic, soap-generic, anypoint-mq, salesforce,
    netsuite, database (mysql/pg/mssql/oracle variants), object-store,
    sftp, amazon-s3, email, kafka, servicenow, workday, jira, sap,
    jms, amazon-sqs, azure-service-bus, azure-blob, mongodb,
    openai, anthropic, dynamics365
    [NEW] slack-config.xml         — Slack Bot Token + HTTP webhook alternative for simple notifications
    [NEW] redis-config.xml         — Redis non-cluster; token cache, rate-limit, cross-app idempotency
    [NEW] amqp-config.xml          — AMQP/RabbitMQ plain + AMQPS (TLS); DLX config note
    [NEW] ftp-config.xml           — Plain FTP + FTPS option; SFTP-preferred security warning
  scaffold/check-registry-freshness.js [NEW]:
    Node.js script; reads connector-registry.json; GREEN/YELLOW/RED by days since lastVerified;
    exits 1 if any RED connector (>60d); referenced in PLANNING_CONTEXT.md monthly task
  Standards enforced in every template:
    - Idempotency TTL = messageTtlHours × 60 (never hardcoded 24h)
    - Wire tap in async + try + error-handler (FK-009: on-error-continue must be inside error-handler, not bare in async)
    - Email/notification send in async + on-error-continue
    - MANUAL ack mode on all MQ subscribers
    - Watermark stored in persistent Object Store (not in-memory)
    - PII mask note at every audit/log publish point
    - SAP JCo license warning in sap-config.xml
    - CloudHub 2.0 ephemeral filesystem note in sftp/file configs
    - AI API key must be in Secrets Manager (noted in openai/anthropic configs)

  AUDIT FIXES (2026-05-10) — adversarial audit pass after initial chunk 7 commit:
  CRITICAL fixes:
    wire-tap.xml               — on-error-continue was bare child of async (invalid Mule 4 XML → FK-009)
                                 Fixed: wrapped publish + error-handler in try scope
                                 Also added real PII field masking DataWeave (was a comment placeholder)
    munit-base.xml             — expectedErrorType="MULE:COMPOSITE_ROUTING" always fails when
                                 Global_Error_Handler uses on-error-continue (FK-011)
                                 Fixed: removed expectedErrorType; assert on vars.httpStatus + payload.errorCode
    claim-check-retrieve.xml   — output application/java produces byte[] not JSON object (FK-012)
                                 Fixed: changed to output application/json
    dev.yaml                   — cron: "${scheduler.cron.dev}" self-referential property → startup failure
                                 Fixed: literal cron "0 0/5 * * * ?" with Runtime Manager override note
    uat.yaml                   — same self-referential cron → Fixed: "0 0 * * * ?" (hourly)
    prod.yaml                  — self-referential cron AND frequencySeconds → Fixed: literal values
  HIGH fixes:
    http-listener.xml          — set-variable does not update Mule event correlationId (FK-010)
                                 Fixed: replaced with set-correlation-id (Mule 4.6+ element)
    global-config.xml          — no Secrets Manager block; regulated/government profile had no config
                                 Fixed: added {{#if SECRETS_MANAGER_ENABLED}} conditional with AWS + Azure options
    mule-artifact.json         — SECURE_PROPERTIES format undocumented; devs guess incorrectly
                                 Fixed: added comment block with format rules and example values
    oas-spec.yaml              — client_secret as path param violates OAS 3.0; no 500 response; missing clientSecretScheme
                                 Fixed: complete rewrite with proper securitySchemes, 500 response, X-Correlation-ID headers
    deploy.yml                 — project built twice (no artifact hand-off); no develop branch UAT trigger
                                 Fixed: upload-artifact after build, download-artifact before deploy; added develop trigger
    pom.xml                    — coverage floor doc incomplete; Global_Error_Handler not in ignoreFlows
                                 Fixed: added {{munitCoveragePerFlow}} token; added Global_Error_Handler to ignoreFlows
    invalid-message-channel-route.xml — bare on-error-continue context missing; PII masking absent
                                 Fixed: complete rewrite with full usage diagram, correct flow wrapping context, PII masking
  MEDIUM fixes:
    error-handler.xml          — missing KAFKA:CONNECTIVITY, SFTP:CONNECTIVITY, FILE:FILE_NOT_FOUND error types
                                 Fixed: added to connectivity/timeout handler type list
    db-poll.xml                — foreach + watermark not wrapped in try; watermark could advance on partial failure (FK-007)
                                 Fixed: wrapped foreach in try/error-handler; watermark only advances on clean exit
    transform.dwl              — _correlationId field name (underscore prefix) rejected by MongoDB/Elasticsearch
                                 Fixed: renamed to integrationCorrelationId
    mq-subscriber.xml          — ACK/NACK behavior undocumented; devs omit NACK on error
                                 Fixed: added full ACK/NACK behavior documentation with all three paths

CHUNK 8 — Scaffold Gen   [x] COMPLETE (2026-05-10)
  File: scaffold/generate.js
  Reads decisions.json + scaffold/xml-templates/ + templates/connectors/
  Generates a complete, compilable Mule 4.8.0 project into /tmp/{client}-mule/
  Implemented:
    - Profile computation: minimal/standard/enterprise/regulated (auto or from decisions.json)
    - Validation guards: dedup TTL vs message TTL, watermark flag vs pattern, async idempotency
    - Staleness check: NOTICE >30d, WARNING >180d (6mo) per connector lastVerified
    - pom.xml: connector <dependency> blocks from registry with TODO Exchange URL comments
               munitCoverage + munitCoveragePerFlow tokens (per-pattern floor)
    - mule-artifact.json: secureProperties populated from connector propertiesRequired + security level
                          block comments stripped → valid JSON output
    - global-config.xml: connector config fragments extracted from templates/connectors/*.xml
                         SECRETS_MANAGER_ENABLED conditional block rendered
                         Additional xmlns/xsi:schemaLocation injected per connector
    - error-handler.xml: DLQ_ENABLED + INVALID_MESSAGE_CHANNEL_ENABLED conditionals resolved
                         DLQ destination = ${mq.queue.dlq} (standard property key)
    - Per-flow {name}-flows.xml: trigger template selected by flow.trigger
                                 Wire tap snippet injected for async flows when wireTap.enabled=true
                                 Watermark conditional rendered from scheduling.watermarking
                                 Additional namespaces + schemaLocations injected
    - Per-flow {name}-test.xml: 3 pre-scaffolded test cases (happy path, connectivity, validation)
                                Coverage floor tokens (75%/80%/60%) set per pattern
    - Per-flow {verb}-{source}-to-{target}.dwl: transform stub per transform.dwl template
    - OAS spec stub: generated per HTTP-triggered flow
    - Properties: local/dev/uat/prod.yaml with domain + artifactId token substitution
    - deploy.yml: generated only when devops.cicd=github-actions
    - Regulated profile: audit-trail-flows.xml generated (MQ subscriber → audit store stub)
  Validated: node scaffold/generate.js projects/leolabs/decisions.json → 17 files, no errors
  Bug fixed: connector-registry.json http.configTemplate http-requester → http-generic-config.xml

CHUNK 9 — Client Repo Sh [x] COMPLETE (2026-05-10)
  File: scaffold/create-client-repo.sh
  Implemented:
    - Uses GitHub API (curl) only — no gh CLI dependency
    - Reads client, primaryPattern, runtime from decisions.json via node -e
    - Runs generate.js from REPO_ROOT so template paths resolve correctly
    - Checks repo existence first (fail fast if HTTP 200) — never overwrites
    - Creates repo via POST /orgs/{org}/repos; auto-falls back to /user/repos
      if org endpoint returns 404 (handles personal accounts)
    - Pushes generated code as initial commit with informative message
    - Embeds GITHUB_TOKEN in HTTPS remote URL — no SSH key required
    - Outputs: repo URL + GitHub Codespace one-click URL for developer
    - Developer handoff block: step-by-step instructions printed to stdout

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

PATTERN EXPANSION 2026-05-10 — Modern Integration Patterns (A-R → A-U):
  Research: EIP-era patterns compared against microservices, data integration, and AI agent standards.
  Added 3 new scenario files + updated all reference docs. NO full chunk re-runs required.

  NEW SCENARIO FILES:
    standards/scenarios/transactional-outbox.md   (S) — dual-write problem; DB+event atomicity
    standards/scenarios/reverse-etl.md            (T) — warehouse enriched data → CRM/ERP
    standards/scenarios/ai-gateway.md             (U) — centralized LLM proxy (rate-limit, PII-redact)

  UPDATED: docs/PATTERNS_RESEARCH.md (Part 10), docs/PLANNING_CONTEXT.md (Level 1 tree, folder
  structure, decision guide, decisions.json enum), standards/MULESOFT_DESIGN_STANDARDS.md
  (pattern catalog + decision guide), standards/decisions-schema.json (primaryPattern enum).

  DOCUMENTED AS AWARENESS (not actionable as MuleSoft scenarios):
    CQRS (use B/F/M), Saga Choreography (use B per participant), Service Mesh (infra below Mule),
    CloudEvents (add normalizer sub-flow), AsyncAPI (design-time governance only).

  Chunks 8/9/10 not started — pick up new patterns naturally. Story library handles all patterns
  via generic conditional ACs — no Chunk 6 re-run needed.

NEW ARTIFACT 2026-05-10:
docs/FIELD_KNOWLEDGE.md  [x] CREATED — architect training + lesson accumulation system
                         [x] UPDATED — chunk 7 audit added FK-009 through FK-012:
                             FK-009: on-error-continue bare in async = invalid Mule 4 XML
                             FK-010: set-variable ≠ set-correlation-id (use Mule 4.6+ element)
                             FK-011: expectedErrorType fails when on-error-continue consumes error
                             FK-012: output application/java from S3 produces byte[], use application/json
