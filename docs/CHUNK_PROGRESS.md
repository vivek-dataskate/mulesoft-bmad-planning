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

CHUNK 10 — E2E Test      [~] PARTIAL (2026-05-11) — scaffold validation only
  Full pipeline test using LeoLabs intake docs (projects/leolabs/)
  NOTE: Analyst → Architect → PM pipeline NOT run — no prd.md / architecture.md / stories.md exist.
        LeoLabs intake PDFs not yet extracted. decisions.json was pre-existing from 2026-05-10.
        mvn compile and mvn test NOT run (requires commons published to Exchange first).

  Scaffold validation checks:
    ✓ decisions.json: pattern=event-driven, connectors=[salesforce,netsuite,anypoint-mq,http]
                      messageTtlHours=24, deduplicationTtlMinutes=1440 (=24h×60), cicd=github-actions
    ✓ All flow files generated (one per decisions.json flows[] entry)
    ✓ All MUnit test files generated (one per flow)
    ✓ No hardcoded credentials in local/dev/uat/prod.yaml property files
    ✓ pom.xml: salesforce 11.4.0, netsuite 11.11.0, anypoint-mq 4.0.7 with Exchange TODO comments
    ✓ deploy.yml generated (.github/workflows/deploy.yml), Java 17 correct
    ✓ Zero unsubstituted {{tokens}} in all XML files
    ✗ mvn compile — NOT RUN (commons not on Exchange; run after commons/publish.sh)
    ✗ mvn test    — NOT RUN (same dependency gap)

  BUGS FIXED during E2E scaffold run:
    scaffold/generate.js: {{WATERMARK_ENABLED}} not substituted in scheduler.xml comment line
    scaffold/generate.js: {{WIRE_TAP_RETENTION_HOURS}}, {{SYSTEM_NAME}}, {{system_key}}
      not substituted in connector config blocks embedded in global-config.xml
    scaffold/xml-templates/oas-spec.yaml: {{DOMAIN}} not in token map
    standards/connector-registry.json: salesforce 10.18.0→11.4.0, netsuite 10.5.0→11.11.0,
      anypoint-mq 4.0.5→4.0.7

  BUGS FIXED during adversarial review (2026-05-11):
    mq-subscriber.xml: idempotency os:store was BEFORE processing (pre-store drops messages
      that fail on first attempt — at-most-once instead of at-least-once)
      → Fixed: os:store moved to AFTER successful processing, before ACK
    scheduler.xml: watermark stored as now() — skips records updated during run window
      → Fixed: stores vars.newWatermark (set by developer during foreach/batch)
    generate.js genProperties: per-flow scheduler cron key missing from YAML output
      → Runtime PropertyNotFoundException on startup for scheduler flows
      → Fixed: genProperties now appends scheduler.{flowKey}.cron for each scheduler flow
    generate.js: {{DOMAIN}} in OAS spec mapped to client name (semantically wrong for API tag)
      → Fixed: derived from flow name second segment (noun), e.g. "get-integration-status" → "integration"
    generate.js: {{SYSTEM_NAME}} substituted with conn.displayName ("HTTP / HTTPS") — meaningless
      → Fixed: generic http/soap connectors get explicit TODO placeholder
    decisions.json LeoLabs: 3 flows but PLANNING_CONTEXT.md specifies 5 flows
      → Fixed: added listen-opportunity-event-flow (platform-event trigger) and
               sync-accounts-to-netsuite-flow (scheduler trigger)
    generate.js TRIGGER_TEMPLATE_MAP: platform-event mapped to mq-subscriber.xml (wrong pattern)
      → Fixed: new scaffold/xml-templates/triggers/platform-event.xml created
               (SF subscribe-channel-listener → publish to MQ)
    scaffold/generate.js default output: was /tmp/{client}-mule (ephemeral, user can't find files)
      → Fixed: default is now projects/{client}/generated/ (gitignored, always visible locally)

  REMAINING GAPS (deferred — require human agent runs or external tooling):
    - Run Analyst agent on LeoLabs intake PDFs → generate prd.md
    - Run Architect agent → generate architecture.md + validate decisions.json
    - Run PM agent → generate stories.md
    - Run mvn compile + mvn test (requires commons published to Anypoint Exchange first)

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

CHUNK 11 — Commons Library [x] COMPLETE (2026-05-10)
  commons/pom.xml                              — mule-plugin packaging; Nimbus JOSE dep; Exchange deploy
  commons/publish.sh                           — Anypoint Exchange publish script (user+pass or connected app)
  commons/src/main/mule/:
    common-error-handler.xml                   — route-to-dlq, build-error-response, dispatch-notification sub-flows
    common-retry.xml                           — retry-queue pattern (not until-successful); exponential backoff
    common-notification.xml                    — scatter-gather Slack+email; skips channels when props blank
    common-batch.xml                           — on-complete log+alert; watermark persistence
    common-correlation.xml                     — generate, propagate, extract correlation ID sub-flows (set-correlation-id)
  commons/src/main/resources/dwl/:
    error-envelope.dwl                         — buildEnvelope + buildValidationEnvelope functions
    pii-mask.dwl                               — 20+ field patterns; maskPayload recursive traversal
    canonical-date.dwl                         — toISODate, toISODateTime, toEpochMs, fromEpochMs
    build-audit-record.dwl                     — CEF-format audit records; chains pii-mask.dwl
  commons/exchange/:
    canonical-order.yaml                       — 8-status order schema with OrderLine, Totals, Fulfillment
    canonical-customer.yaml                    — customer schema with Contact, Financial, Address nested types
    canonical-invoice.yaml                     — invoice schema with InvoiceLine, Totals, PaymentInfo

CHUNK 12 — Capabilities Portal [x] COMPLETE (2026-05-10)
  scaffold/generate-capabilities.js            — Node.js HTML portal generator
  .github/workflows/capabilities.yml          — auto-regenerate on push; commits with [skip ci]
  Portal tabs: Connectors | Code Assets | System Playbooks | Client Usage
  Features: staleness badges, search/filter, stats bar, playbook maturity table

CHUNK 13 — System Playbooks [x] COMPLETE (2026-05-11)
  Both playbooks follow identical object-centric, bidirectional design:
    System DWL = always-ready; cross-system flow = compose(sf→canonical, canonical→ns)

  commons/playbooks/salesforce/
    PLAYBOOK.md                                — quirks, cursor pagination, JWT auth, maturity log
    system/sf-auth.xml                         — OAuth2 JWT Bearer; RS256; token in vars.sfToken
    system/sf-query.xml                        — SOQL cursor paginator (nextRecordsUrl); accumulates vars.sfQueryResults
    objects/account/sf-account-to-canonical.dwl    — Account → canonical-customer (segment, type, contacts, addresses)
    objects/account/canonical-to-sf-account.dwl    — canonical-customer → Account PATCH (null-strip)
    objects/opportunity/sf-opportunity-to-canonical.dwl — Opp → canonical-order (StageName→status, line items)
    objects/opportunity/canonical-to-sf-opportunity.dwl — canonical-order → Opp PATCH (status→StageName, null-strip)
    objects/contact/sf-contact-to-canonical.dwl    — Contact → canonical contact entry
    objects/contact/canonical-to-sf-contact.dwl    — canonical contact → Contact PATCH (null-strip)

  commons/playbooks/netsuite/
    PLAYBOOK.md                                — CRITICAL PS256 JWT note; quirks (internal IDs, SuiteQL 1000/page, GUs,
                                                 item matching, invoice read-only, OneWorld subsidiary, tax codes)
    system/ns-auth.xml                         — PS256 JWT via Nimbus JOSE Groovy scripting; token in vars.nsToken
    system/ns-query.xml                        — SuiteQL paginator; 429 exponential backoff; accumulates vars.nsQueryResults
    system/ns-upsert.xml                       — PUT /record/{type}/eid:{externalId}; extracts internalId from Location header
    objects/sales-order/ns-order-to-canonical.dwl  — SO → canonical-order (status mapping, lines, totals, addresses)
    objects/sales-order/canonical-to-ns-order.dwl  — canonical-order → SO PUT (itemMapping helper, subsidiaryId, null-strip)
    objects/invoice/ns-invoice-to-canonical.dwl    — Invoice → canonical-invoice (read-only direction; SO link preserved)
    objects/customer/ns-customer-to-canonical.dwl  — Customer → canonical-customer (isPerson flag, addressBook structured)
    objects/customer/canonical-to-ns-customer.dwl  — canonical-customer → Customer PUT (addressBook items, null-strip)

  Cross-system composition pattern established:
    SF Opp → NS Sales Order:   canonicalToNsOrder(sfOpportunityToCanonical(payload))
    NS Invoice → SF Opp update: canonicalToSfOpportunity(nsInvoiceToCanonical(payload))
    SF Account → NS Customer:  canonicalToNsCustomer(sfAccountToCanonical(payload))
    NS Customer → SF Account:  canonicalToSfAccount(nsCustomerToCanonical(payload))

RPA PATTERN EXPANSION 2026-05-11 — [x] COMPLETE (research-backed)
  Research: Deep web research across official MuleSoft docs (docs-rpa GitHub repo), MuleSoft workshops,
  community blogs (makesensesoft, cloudfirstlabs, infomentum, medium), and Anypoint Exchange.
  Key finding: No dedicated Mule connector JAR exists. Integration uses HTTP connector against
  Anypoint RPA REST API v2 with OAuth 2.0 Connected App (scopes: RPA Integrator + RPA Invocable Process).

  NEW FILES:
    standards/scenarios/rpa-orchestration.md     — Pattern W scenario file; full invoke-and-poll
                                                   reference architecture; gotchas; MUnit checklist
    templates/connectors/anypoint-rpa-config.xml — HTTP requester with OAuth 2.0 CC; API key option
                                                   (dev only); setup checklist; property keys
    scaffold/xml-templates/snippets/rpa-invoke-and-poll.xml — Full 7-step snippet: generate UUID
                                                   → PUT startProcess (idempotent) → persist to OS
                                                   → poll via until-successful → branch success/error
                                                   → cleanup → error handler (timeout DLQ + auth alert)

  UPDATED FILES:
    standards/connector-registry.json   — anypoint-rpa entry in new platform_services category;
                                         platformGaps updated to note RPA is now HANDLED
    standards/snippet-registry.json     — rpa-invoke-and-poll registered with tokens + prerequisites
    standards/decisions-schema.json     — rpa-orchestration added to primaryPattern enum
    standards/MULESOFT_DESIGN_STANDARDS.md — Pattern W added to catalog and decision guide
    docs/PLANNING_CONTEXT.md            — Pattern W added to Level 1 tree, decision guide,
                                         folder structure, and primaryPattern enum
    scaffold/generate.js                — rpa-orchestration added to COVERAGE_MAP (80%);
                                         RPA guards (auto-add anypoint-rpa + anypoint-mq connectors,
                                         tenant/dlq warnings, poll config log); rpa-invoke-and-poll.xml
                                         loaded in SNIPPET_NAMES; snippet injected in genFlowFile
                                         (replaces <!-- TODO: Add flow implementation here --> anchor)
    README.md                           — RPA moved from "Not Handled" to "Handled"

  KNOWN FIELD GOTCHAS (from research — add as FK entries after first client use):
    - No dedicated connector JAR; HTTP approach is more portable than REST Connect per-process asset
    - API key is user-scoped and expires — OAuth CC is mandatory for production
    - Idempotent PUT returns 204 on duplicate executionId — validator must accept both 201 and 204
    - Status values are lowercase in API v2 ("success" not "SUCCESS")
    - Bot must be in OK state; capacity limited to licensed console sessions
    - until-successful is correct for polling up to 30 min; callback URI needed for longer processes

AGENTFORCE CONNECTOR EXPANSION 2026-05-11 — [~] FUNCTIONAL BUT UNVERIFIED
  New files (patterns P, R, O):
    templates/connectors/agentforce-config.xml     — OAuth2 CC connection config + usage examples
    scaffold/xml-templates/snippets/agentforce-invoke.xml — stateless agent invocation snippet

  Registry updates:
    standards/connector-registry.json             — agentforce.agentId + agentforce.timeoutSec
                                                     added to propertiesRequired (were missing → startup failure)
    standards/snippet-registry.json               — agentforce-invoke registered with verifyBeforeUse=true

  Two-pass adversarial review run (first critic: standards compliance; second critic: doc-research backed):
    Total findings: 28 (first pass) + 23 (second pass, 9 new UNVERIFIED items)

  FIXES APPLIED (all VERIFIED findings):
    BL-1: Nested XML comments removed — inner comment markers converted to plain prose
    BL-2: XML comment inside DataWeave block → DataWeave // comment syntax
    H-6:  Snippet registered in snippet-registry.json
    H-7:  agentId + timeoutSec added to connector-registry.json propertiesRequired
    M-1:  invoke-agent uses target="agentforceResponse" directly — removes fragile set-variable capture
    M-2:  Snippet no longer overwrites the fallback value set by the caller
    M-4:  Catch-all on-error-continue type="ANY" added — no uncaught error type escapes the try block
    L-3:  primaryPayload renamed to agentforcePrimaryPayload — safe in multi-agent flows
    L-4:  responseSize added to success log; catch-all logs errorType identifier
    Session leak: stateful example now wraps in try with end-session in error handler
    Fallback default: changed from null to {} (empty object) — prevents NULL_POINTER on field access
    Timeout comment: updated to 60s recommendation for complex agents (was 30s — at lower bound)
    PII note: input-variables TODO explicitly warns against passing raw payload
    Log fields: all loggers now include env=p("mule.env") — was missing from all log statements

  DOC RESEARCH PASS (2026-05-11) — official MuleSoft docs verified:
    CONFIRMED: Namespace prefix is ms-agentforce (NOT agentforce) — files fully corrected
    CONFIRMED: Namespace URI = http://www.mulesoft.org/schema/mule/ms-agentforce
    CONFIRMED: XSD = mule-ms-agentforce.xsd
    CONFIRMED: No invoke-agent operation. Correct sequence:
               ms-agentforce:start-agent-conversation → ms-agentforce:send-message-sync
               → ms-agentforce:end-agent-conversation
    CONFIRMED: continue-agent-conversation is DEPRECATED in v1.3 — never use
    CONFIRMED: Agent ID attribute name is "agent" (NOT agentId)
    CONFIRMED: Connection element = ms-agentforce:oauth-client-credentials-connection
               with child ms-agentforce:oauth-client-credentials (clientId + clientSecret)
    CONFIRMED: Error types use MS-AGENTFORCE: prefix:
               MS-AGENTFORCE:CONNECTIVITY, MS-AGENTFORCE:RETRY_EXHAUSTED,
               MS-AGENTFORCE:AGENT_API_ERROR, MS-AGENTFORCE:AGENT_OPERATIONS_FAILURE,
               MS-AGENTFORCE:AGENT_METADATA_FAILURE, MS-AGENTFORCE:INVALID_CONNECTION

  COMMUNITY SEARCH (2026-05-11) — GitHub / code platforms:
    No third-party community standards found beyond official MuleSoft docs.
    MuleSoft AI Chain Project (mac-project.ai / GitHub: MuleSoft-AI-Chain-Project) exists
    as a reference implementation but does not publish a separate connector standard.
    No established community DataWeave patterns for agent variable mapping found.

  OPUS CRITIC PASS (2026-05-11) — 34 new findings, all VERIFIED items fixed:
    B1: end-agent-conversation in error handlers threw when session never opened (null sessionId)
        Fixed: all error-path session closes now guarded by choice (#[vars.agentforceSessionId != null])
               wrapped in inner try/on-error-continue to swallow close failures
    B2: Payload non-deterministic across paths — success path never restored it
        Fixed: set-payload to agentforcePrimaryPayload added after success logger on all paths
    B3: correlationId bare reference — documented dependency on Mule 4 event binding
    B4: instanceUrl attribute name likely wrong — added as separate VERIFY-D sub-item
    H1: vars.agentSession.sessionId assumed object shape — could be scalar
        Fixed: vars.agentforceSessionId normalises both:
               (vars.agentSession.sessionId default vars.agentSession) as String
    H2: Multi-turn stateful example had no try wrapper — demonstrated the leak it warned against
        Fixed: full try/error-handler with guarded session close added to both patterns
    H3: agentforce.timeoutSec required but never wired — removed from propertiesRequired
        Moved to propertiesOptional with VERIFY-D note pending attribute name confirmation
    H4: PII contradiction — agent input built without redaction scaffolding
        Fixed: vars.agentforceInput introduced; built from specific fields with PII warning
    H5: injectOn field used machine-rule syntax but was documented as non-machine-parsed
        Fixed: rewritten as plain English prose
    H6: verifyBeforeUse flag had no enforcement in generate.js
        Fixed: removed from snippet-registry; warnApplicableSnippets() added to generate.js —
               prints ⚠ MANUAL SNIPPET APPLICABLE when agentforce-invoke matches project patterns
    H7: einstein-ai added to NS_REGISTRY with no backing templates or registry entry
        Fixed: removed; comment added noting it's deferred
    H8: MS-AGENTFORCE:RETRY_EXHAUSTED caught but no reconnection strategy configured (dead handler)
        Fixed: removed from connectivity handler; noted requires reconnection strategy to be reachable
    M2: VERIFY-C note in config template said vars.sessionId.sessionId — inconsistent with snippet
        Fixed: unified to agentforceSessionId normalisation pattern in both files
    M3: lastVerified month-only in connector registry vs full date in snippet registry
        Fixed: connector registry normalised to 2026-05-11
    M10: error.description logged raw — could break Splunk/Datadog regex extraction
        Fixed: all error.description references truncated to 200 chars: [0..200]
    M6: Idempotency caveat for write-effect agents added to snippet footer and config critical notes
    generate.js: SNIPPET_REG_F was declared but never read (pre-existing unused variable hint)
        Fixed: warnApplicableSnippets() now reads snippet-registry.json and uses SNIPPET_REG_F

  STILL UNVERIFIED — check before first client use:
    VERIFY-A: send-message-sync child element/attribute for passing context variables
    VERIFY-B: send-message-sync response field path to extract agent reply
    VERIFY-C: session ID field path (handled defensively — agentforceSessionId normalises both shapes)
    VERIFY-D: (a) responseTimeout attribute name on connection element
              (b) instanceUrl attribute name — may be salesforceUrl or orgUrl
              (c) whether timeout belongs on connection child or on ms-agentforce:config
    VERIFY-E: exact patch version (update connector-registry.json version field once confirmed)
    All VERIFY items marked inline in both template files.

PATTERN V — Anypoint IDP (idp-document-processing) [x] COMPLETE (2026-05-11)
  Implemented full scaffold support for Intelligent Document Processing as Pattern V.
  All implementation details are web-research-verified against live MuleSoft docs (May 2026).

  NEW / MODIFIED FILES:
    standards/scenarios/idp-document-processing.md  [NEW] — full pattern V scenario file
    standards/connector-registry.json               [MODIFIED] — added mulesoft-forge-idp + anypoint-idp entries
    standards/decisions-schema.json                 [MODIFIED] — added idp block + idp-document-processing enum value
    scaffold/xml-templates/idp-document-flow.xml    [NEW] — IDP execute+poll sub-flows
    scaffold/xml-templates/triggers/email-imap.xml  [NEW] — IMAP attachment trigger
    scaffold/xml-templates/triggers/s3-event.xml    [NEW] — S3 object-created trigger (also used for blob-event)
    templates/connectors/idp-forge-config.xml       [NEW] — MuleSoft Forge IDP connector config
    templates/connectors/idp-http-config.xml        [REWRITTEN] — HTTP fallback connector config
    scaffold/generate.js                            [MODIFIED] — IDP generation support
    standards/intake-checklist.json                 [MODIFIED] — added anypoint_idp auto-warning
    docs/PLANNING_CONTEXT.md                        [MODIFIED] — Pattern V in Level 1 tree + corrected Critical Note

  CONNECTORS:
    PREFERRED: MuleSoft Forge community connector io.github.mulesoft-forge:mule-idp-connector:1.0.6
               Maven Central (NOT Anypoint Exchange). Released September 7, 2025. Requires Mule 4.6+.
               Universal — works across all IDP action versions without per-action connector sprawl.
    FALLBACK: HTTP connector with OAuth 2.0 client credentials against IDP REST API.

  API FACTS VERIFIED BY WEB RESEARCH (corrected from training data — all 12 errors fixed):
    Base URL:        https://idp-rt.{region}.anypoint.mulesoft.com/api/v1/
                     (NOT anypoint.mulesoft.com/idp/api/v1/ — training data was wrong)
    Submit:          POST .../executions — body { "file": "<base64>", "fileName": "name.pdf" }
                     (NOT { document: { content: ..., mimeType: ... } })
    Poll:            GET .../executions/{id}/v2   (/v2 suffix REQUIRED — v1 is deprecated)
    OAuth scope:     EMPTY — access controlled by "Execute Published Actions" permission in
                     Access Management. NEVER pass urn:anypoint:idp (causes invalid_scope).
    Terminal statuses: SUCCEEDED | FAILED | PARTIAL_SUCCESS | MANUAL_VALIDATION_REQUIRED
                     (NOT "COMPLETED" — COMPLETED does not exist as an IDP status)
    Result path:     pages[0].fields.{fieldLabel}.value  (NOT payload.result)
    Min poll interval: 10 seconds per IDP quota docs
    P50 latency: 7.6s | P99: 13.4s | Max file: 10MB | Max pages: 50

  POLLING PATTERN (Mule 4 correctness):
    CORRECT:  <until-successful maxRetries="18" millisBetweenRetries="10000">
                  with <validation:is-true> to trigger retry on non-terminal status
    WRONG:    <foreach collection="#[1 to N]"> — foreach has no sleep/break in Mule 4
    WRONG:    <scheduler> mid-flow — scheduler is a source element only

  DOCUMENT SOURCES SUPPORTED (all 4):
    http-multipart — HTTP listener; multipart upload or base64 JSON body; optional MQ callback
    s3             — S3 object-created listener; base64 encode bytes immediately (stream = single-read)
    sftp           — SFTP on-new-file; path-based action routing
    email          — IMAP listener; pluck attachments; MIME type filter before IDP submit

  GENERATE.JS ADDITIONS:
    - idp-document-processing added to ASYNC_PATTERNS and COVERAGE_MAP (80%)
    - TRIGGER_TEMPLATE_MAP: email-imap→email-imap.xml, s3-event→s3-event.xml, blob-event→s3-event.xml
    - TRIGGER_CONNECTOR_MAP: email-imap→[email], s3-event→[amazon-s3], blob-event→[azure-blob]
    - skipMavenDependency check in genPom() — prevents anypoint-idp HTTP entry adding duplicate dep
    - genIdpFlow(d, outDir): renders idp-document-flow.xml with IDP_MQ_CONSUMER flag
    - genIdpDwlTransform(d, outDir): generates map-idp-result-to-{entity}.dwl with correct
      vars.idpPages[0].fields.{fieldLabel}.value structure
    - IDP properties block in genProperties() for all 4 env YAMLs
    - validateDecisions(): auto-enables idp.enabled, checks required fields, auto-adds connectors
    - warnApplicableSnippets(): prints ⚠ when manual snippets apply
