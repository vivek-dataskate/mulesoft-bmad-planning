# MuleSoft BMAD Planning System — Master Context
> Read this file before doing ANYTHING in this repo.
> This is the single source of truth for all decisions made during system design.
> Every Claude Code session starts by reading this file.

---

## WHAT THIS SYSTEM IS

A single GitHub planning repo that a tech lead uses to take any client discovery
document as input and automatically produce a ready-to-open MuleSoft project for
developers. The developer opens the generated repo in a GitHub Codespace and starts
filling in TODOs immediately. No blank projects. No manual setup. Standards enforced
automatically.

---

## THE COMPLETE FLOW

```
INPUT (any combination):
  - Sales call transcript
  - Discovery / requirements doc
  - Slide deck / pricing deck
  - Email threads
  - Existing architecture docs
  All dropped into: projects/{client}/intake/
        ↓
BMAD ANALYST AGENT
  Reads all intake docs
  Extracts: systems, flows, pain points, NFRs,
            constraints, budget, timeline, stakeholders
  Output → projects/{client}/prd.md
        ↓
BMAD ARCHITECT AGENT
  Reads prd.md + standards/MULESOFT_DESIGN_STANDARDS.md
  Walks the 6-level decision tree
  Selects: pattern, NFRs, systems, ops needs, devops
  Output → projects/{client}/architecture.md
         + projects/{client}/decisions.json
        ↓
BMAD PM AGENT
  Reads decisions.json + story-library/
  Generates MuleSoft-specific sprint stories
  Output → projects/{client}/stories.md
        ↓
SCAFFOLD GENERATOR (Node.js)
  Reads decisions.json + connector-registry.json
  Reads XML templates from scaffold/xml-templates/
  Generates complete valid Mule project code
  Output → /tmp/{client}-mule/ (temporary)
        ↓
CREATE CLIENT REPO SCRIPT (shell)
  Reads decisions.json
  Runs scaffold generator
  Creates new GitHub repo: github.com/{org}/{client}-mule
  Pushes generated code
  Sends developer the link
        ↓
DEVELOPER
  Opens github.com/{org}/{client}-mule in Codespace
  Anypoint Code Builder opens automatically
  Project compiles immediately
  Developer fills in TODO comments
  Runs MUnit tests
  Deploys to CloudHub 2.0
```

---

## TWO REPO MODEL

### Repo 1 — THIS REPO (Planning)
- `github.com/{org}/mulesoft-bmad-planning`
- Used by: Tech lead only
- Contains: BMAD agents, standards, templates, scaffold generator
- Per client: One folder in `projects/{client}/`
- Client never sees this repo
- Lives forever, grows with every new project

### Repo 2 — Client Dev Repo (Generated per client)
- `github.com/{org}/{client}-mule`
- Used by: Developers only
- Contains: Generated Mule project code only
- No BMAD, no standards, no planning artifacts
- Developer opens in Codespace directly from GitHub
- No cloning needed

---

## REPO FOLDER STRUCTURE (THIS REPO)

```
mulesoft-bmad-planning/
  │
  ├── .bmad/                          ← BMAD config (installed)
  ├── .claude/
  │     └── skills/                   ← BMAD agents
  │           ├── bmad-agent-analyst/ ← customized for MuleSoft
  │           ├── bmad-agent-architect/
  │           ├── bmad-agent-pm/
  │           └── bmad-agent-dev/
  │
  ├── standards/
  │     ├── MULESOFT_DESIGN_STANDARDS.md  ← the constitution
  │     ├── decisions-schema.json          ← empty template
  │     ├── connector-registry.json        ← all known connectors
  │     └── scenarios/
  │           ├── real-time.md
  │           ├── batch.md
  │           ├── event-driven.md
  │           ├── scheduled-sync.md
  │           └── hybrid.md
  │
  ├── templates/
  │     ├── prd-template.md
  │     ├── architecture-template.md
  │     ├── story-template.md
  │     └── connectors/               ← XML config stubs per connector
  │           ├── salesforce-config.xml
  │           ├── netsuite-config.xml
  │           ├── anypoint-mq-config.xml
  │           ├── http-requester-config.xml
  │           ├── mysql-config.xml
  │           ├── postgresql-config.xml
  │           ├── mongodb-config.xml
  │           ├── sftp-config.xml
  │           ├── email-config.xml
  │           ├── kafka-config.xml
  │           ├── workday-config.xml
  │           ├── sap-config.xml
  │           ├── servicenow-config.xml
  │           └── dynamics365-config.xml
  │
  ├── story-library/
  │     ├── create-api-spec-story.md
  │     ├── implement-system-api-story.md
  │     ├── implement-process-api-story.md
  │     ├── implement-experience-api-story.md
  │     ├── dataweave-transform-story.md
  │     ├── munit-test-story.md
  │     ├── error-handler-story.md
  │     ├── scheduler-story.md
  │     ├── watermark-story.md
  │     ├── notification-story.md
  │     ├── monitoring-alert-story.md
  │     ├── cicd-pipeline-story.md
  │     └── exchange-publish-story.md
  │
  ├── scaffold/
  │     ├── generate.js                ← main scaffold generator
  │     ├── create-client-repo.sh      ← creates GitHub repo
  │     └── xml-templates/
  │           ├── global-config.xml
  │           ├── error-handler.xml
  │           ├── flow-template.xml
  │           ├── scheduler-flow.xml
  │           ├── notification-flow.xml
  │           ├── munit-suite.xml
  │           ├── pom.xml
  │           ├── log4j2.xml
  │           ├── default.properties
  │           ├── env.properties
  │           ├── gitignore-template
  │           ├── devcontainer.json    ← for client dev repo
  │           ├── github-actions.yml
  │           └── azure-pipelines.yml
  │
  ├── projects/                        ← one folder per client
  │     ├── leolabs/
  │     │     ├── intake/              ← discovery docs
  │     │     ├── prd.md
  │     │     ├── architecture.md
  │     │     ├── decisions.json
  │     │     └── stories.md
  │     └── {new-client}/
  │           └── intake/
  │
  ├── .devcontainer/
  │     └── devcontainer.json          ← for planning repo
  ├── PLANNING_CONTEXT.md              ← THIS FILE
  ├── CHUNK_PROGRESS.md                ← tracks what is built
  ├── .gitignore
  └── README.md
```

---

## THE 6-LEVEL DECISION TREE

The BMAD Architect agent walks all 6 levels for every project.
Each answer drives specific standards selections documented in
standards/MULESOFT_DESIGN_STANDARDS.md.

### Level 1 — Primary Integration Pattern (pick one)
```
A. request-reply      → caller waits, sync response
B. event-driven       → react to something that happened
C. batch              → bulk record processing
D. scheduled-sync     → periodic data synchronisation
E. hybrid             → combination of above
```

### Level 2 — NFR Profile (answer all)
```
volume:       low (<100/day) | medium (<10K/day) | high (<1M/day) | bulk (millions+)
latency:      under-1s | under-3s | under-10s | async-ok
frequency:    real-time | scheduled | triggered | one-time
availability: best-effort | 99.9 | 99.99
throughput:   low | medium | high | very-high
```

### Level 3 — Systems Involved
```
Known connectors (from connector-registry.json):
  salesforce, netsuite, anypoint-mq, http,
  database-mysql, database-postgresql, mongodb,
  sftp, email, kafka, workday, sap, servicenow,
  dynamics365

Unknown systems → handled by:
  1. Search Anypoint Exchange via MuleSoft MCP tool: search_asset
  2. Custom REST → type: rest, provide OpenAPI spec URL
  3. Custom SOAP → type: soap, provide WSDL URL
  4. Document in decisions.json under customSystems block
```

### Level 4 — Operational Needs (multi-select)
```
□ anypoint-monitoring-basic
□ anypoint-monitoring-custom-dashboard
□ business-events (audit/KPI)
□ external-observability (splunk/datadog/azure-monitor)
□ email-notifications
□ sms-notifications
□ slack-notifications
□ teams-notifications
□ scheduling (cron/fixed-frequency)
□ watermarking (incremental sync)
□ dlq-and-retry
□ field-level-encryption
□ data-masking-in-logs
```

### Level 5 — Security Level
```
internal     → client-id-enforcement + rate-limiting
partner      → oauth2-client-credentials + rate-limiting
regulated    → oauth2 + jwt-validation + secrets-manager
government   → mtls + oauth2 + jwt + secrets-manager + field-encryption
```

### Level 6 — Client-Facing Needs (multi-select)
```
□ operations-dashboard
□ business-reporting
□ audit-trail
□ self-service-portal
□ ux-frontend
□ none (backend only)
```

---

## DECISIONS.JSON SCHEMA

This is the machine-readable contract between planning and scaffold.
The BMAD Architect agent produces this file.
The scaffold generator reads this file.
Full empty template lives at: standards/decisions-schema.json

```json
{
  "project": {
    "name": "",
    "client": "",
    "description": "",
    "generatedAt": "",
    "bmadVersion": "6.6.0"
  },

  "integration": {
    "primaryPattern": "",
    "secondaryPatterns": [],
    "direction": "unidirectional | bidirectional",
    "flows": [
      {
        "name": "",
        "layer": "system | process | experience",
        "source": "",
        "target": "",
        "trigger": "http | scheduler | platform-event | mq-subscriber | cdc | sftp | db-poll",
        "description": ""
      }
    ]
  },

  "nfr": {
    "volume": "low | medium | high | bulk",
    "latency": "under-1s | under-3s | under-10s | async-ok",
    "frequency": "real-time | scheduled | triggered | one-time",
    "availability": "best-effort | 99.9 | 99.99",
    "throughput": "low | medium | high | very-high"
  },

  "systems": {
    "connectors": [],
    "exchangeConnectors": {},
    "customSystems": {},
    "database": null,
    "nosql": null
  },

  "security": {
    "level": "internal | partner | regulated | government",
    "apiAuth": "client-id | oauth2-client-credentials | jwt | mtls",
    "gatewayPolicies": [],
    "secretsManager": true,
    "fieldEncryption": false,
    "dataMasking": true,
    "mtls": false
  },

  "errorHandling": {
    "strategy": "retry-then-dlq | fail-fast | retry-only",
    "maxRetries": 3,
    "backoff": "fixed | exponential",
    "dlq": true,
    "dlqName": "",
    "retryQueueName": "",
    "errorEnvelope": true
  },

  "observability": {
    "anypointMonitoring": true,
    "customDashboard": false,
    "businessEvents": false,
    "externalPlatform": "null | splunk | datadog | azure-monitor | opentelemetry",
    "logLevel": {
      "local": "DEBUG",
      "dev": "DEBUG",
      "uat": "INFO",
      "prod": "WARN"
    },
    "alerts": []
  },

  "notifications": {
    "email": false,
    "sms": false,
    "slack": false,
    "teams": false,
    "slackWebhook": null,
    "emailRecipients": []
  },

  "scheduling": {
    "required": false,
    "type": "cron | fixed-frequency",
    "expression": null,
    "watermarking": false,
    "objectStore": "in-memory | persistent"
  },

  "clientFacing": {
    "operationsDashboard": false,
    "businessReporting": false,
    "auditTrail": false,
    "selfServicePortal": false,
    "uxFrontend": false
  },

  "devops": {
    "cicd": "github-actions | azure-devops | jenkins | none",
    "environments": ["dev", "prod"],
    "munitRequired": true,
    "munitCoverage": 80,
    "exchangePublish": false,
    "deployment": "cloudhub2 | runtime-fabric | hybrid",
    "region": "us-east-1"
  },

  "scaffold": {
    "runtime": "4.8.0",
    "java": "17",
    "groupId": "com.yourcompany",
    "apiLedLayers": [],
    "generateMunit": true,
    "generateCicd": true,
    "generateNotifications": false,
    "generateScheduler": false,
    "generateWatermark": false
  }
}
```

---

## CONNECTOR REGISTRY STRUCTURE

Lives at: standards/connector-registry.json
Scaffold reads this to get pom.xml dependencies and config stubs.

```json
{
  "salesforce": {
    "groupId": "com.mulesoft.connectors",
    "artifactId": "mule-salesforce-connector",
    "version": "10.18.0",
    "auth": "oauth-jwt",
    "configTemplate": "templates/connectors/salesforce-config.xml",
    "exchangeUrl": "https://anypoint.mulesoft.com/exchange/com.mulesoft.connectors/mule-salesforce-connector",
    "propertiesRequired": [
      "sfdc.consumerKey",
      "sfdc.keyStorePath",
      "sfdc.keyStorePassword",
      "sfdc.username",
      "sfdc.tokenEndpoint"
    ]
  }
}
```

Known connectors to include:
salesforce, netsuite, anypoint-mq, http,
database-mysql, database-postgresql, mongodb,
sftp, email, kafka, workday, sap,
servicenow, dynamics365

---

## UNKNOWN SYSTEM HANDLING

When BMAD Architect encounters a system not in connector-registry.json:

1. Search Exchange via MuleSoft MCP tool: search_asset
   - If found → add to decisions.json exchangeConnectors block
   - Scaffold generates pom.xml dependency + generic stub

2. Custom REST API
   - Add to decisions.json customSystems block as type: rest
   - Provide OpenAPI/Swagger spec URL
   - Scaffold generates HTTP requester config stub

3. Custom SOAP/WSDL
   - Add to decisions.json customSystems block as type: soap
   - Provide WSDL URL
   - Scaffold generates Web Service Consumer stub

4. Unknown → flag in prd.md as open item
   - "Unknown system: [X] — need API spec, auth method confirmed before architecture"

---

## SCAFFOLD OUTPUT — WHAT GETS GENERATED

The scaffold generator produces a complete valid Mule project.
Files compile and open in Anypoint Code Builder immediately.
Connector-specific details have structured TODO comments.
Developer fills in TODOs — no blank files, no guessing structure.

### Generated Client Dev Repo Structure:
```
{client}-mule/
  src/
    main/
      mule/
        global-config.xml       ← all connector configs with TODOs
        error-handler.xml       ← pre-built, wired to DLQ/notifications
        {flow-name}-flow.xml    ← one per flow in decisions.json
        notification-flow.xml   ← if notifications selected
        scheduler-flow.xml      ← if scheduling selected
      resources/
        dwl/
          map-{source}-to-{target}.dwl  ← one per flow
          modules/
            common-transforms.dwl
        api/
          {api-name}.yaml       ← OAS 3.0 stub
        dev.properties          ← same keys, values are TODO
        uat.properties
        prod.properties
        default.properties      ← non-sensitive defaults pre-filled
        log4j2.xml              ← JSON logging, correlation ID, masking
    test/
      munit/
        {flow-name}-test-suite.xml  ← happy path + error scenarios
  .github/
    workflows/
      mule-cicd.yml             ← if github-actions selected
  pom.xml                       ← correct deps from connector-registry
  .gitignore
  .devcontainer/
    devcontainer.json           ← Java 17, Maven, Anypoint Code Builder
  README.md                     ← developer TODO checklist
```

### TODO Pattern in generated XML:
```xml
<!-- TODO: Configure Salesforce connection -->
<!-- Standard: OAuth JWT bearer flow -->
<!-- Reference: standards/security.md#salesforce -->
<sfdc:sfdc-config name="Salesforce_Config">
  <sfdc:oauth-jwt-connection
    consumerKey="${sfdc.consumerKey}"
    keyStorePath="${sfdc.keyStorePath}"
    storePassword="${sfdc.keyStorePassword}"
    principal="${sfdc.username}"/>
</sfdc:sfdc-config>
```

---

## BMAD AGENT CUSTOMIZATIONS NEEDED

Each agent gets a custom instruction file that overrides
default BMAD behaviour with MuleSoft-specific knowledge.

### Analyst Agent
Knows to extract from discovery docs:
- All systems mentioned (source + target)
- Integration direction per system pair
- Volume/frequency/latency requirements
- Security and compliance requirements
- Notification and scheduling needs
- Client-facing dashboard/reporting needs
- Budget and timeline constraints
- Unknown systems → flag as open items

### Architect Agent
Knows:
- The 6-level decision tree (from MULESOFT_DESIGN_STANDARDS.md)
- API-led connectivity (system/process/experience layers)
- Which pattern to select per scenario
- How to assign each flow to correct API layer
- How to handle unknown systems (Exchange search first)
- Must produce both architecture.md AND decisions.json
- decisions.json must validate against decisions-schema.json

### PM Agent
Knows:
- MuleSoft story templates (from story-library/)
- One epic per flow in decisions.json
- Stories per flow: API spec + implement flow + DataWeave +
  MUnit tests + monitoring alerts
- Global stories: error handler setup, MQ setup,
  Secrets Manager setup, CI/CD pipeline, Exchange publish
- Every story references its scaffold file by name
- Every story has MuleSoft-specific acceptance criteria
- Typical output: ~5 stories per flow + ~5 global stories

### Dev Agent
Knows:
- MuleSoft naming conventions
- Which scaffold file to open per story
- How to complete TODO comments
- DataWeave best practices
- MUnit test patterns
- How to deploy to CloudHub 2.0

---

## STORY GENERATION APPROACH

PM agent reads decisions.json flows array.
Per flow generates approximately 5 stories:
1. Create API spec (OAS/RAML) + publish to Exchange
2. Implement flow XML (correct layer, naming, error handler)
3. Complete DataWeave transformation (.dwl file)
4. Write MUnit tests (happy path + 2 error scenarios)
5. Configure monitoring alerts

Global stories (once per project):
- Configure global error handler + DLQ
- Set up Anypoint MQ queues (if async)
- Configure Secrets Manager
- Set up CI/CD pipeline
- Verify Anypoint Visualizer layer diagram

Example story format:
```
Story: Complete DataWeave transformation for sales-order-creation-flow

As a developer I need to complete the field mapping in
map-sfdc-opportunity-to-ns-order.dwl so that Salesforce
opportunity data is correctly transformed to NetSuite
sales order format.

Scaffold file: src/main/resources/dwl/map-sfdc-opportunity-to-ns-order.dwl
(already generated with TODO stubs)

Acceptance criteria:
- All TODO fields mapped per data mapping doc
- Input declared: application/json
- Output declared: application/json  
- Business rule implemented: 50% margin kicker
- No inline DW in XML files
- MUnit mock validates transform output
- Reviewed by tech lead
```

---

## TECHNICAL STANDARDS (KEY DECISIONS)

### Runtime
- Mule 4.8.0 / Java 17 (standard for all new projects)
- CloudHub 2.0 as default deployment
- Runtime Fabric for regulated/government

### API-Led Connectivity — MANDATORY
- Every integration uses 3-layer architecture
- System API: wraps ONE backend system only
- Process API: orchestrates system APIs, business logic
- Experience API: formats for specific consumer
- Naming: {system}-sys-api, {domain}-proc-api, {consumer}-exp-api

### Naming Conventions
- Projects: kebab-case {domain}-{layer}-api
- Flows: kebab-case {action}-{entity}-flow
- Variables: camelCase
- DWL files: {verb}-{source}-to-{target}.dwl
- Properties: dot.separated.lower
- MQ queues: {domain}-{action}-{env}-queue

### Error Handling — MANDATORY
- Global error handler in error-handler.xml
- Standard error envelope: {correlationId, errorCode, message, timestamp, failingComponent}
- Retry strategy per error type (see retry table below)
- DLQ routing for async flows
- Never expose Java stack traces

### Retry Table
```
Sync API call timeout    → 3 retries, 5s fixed, return 503
Async MQ message         → 3 retries, exponential 30/90/270s, DLQ
Batch record failure     → 1 retry, continue batch, report at end
Auth token expiry        → 1 retry (refresh), halt if fails
```

### Security Tiers
```
internal    → client-id-enforcement + rate-limiting
partner     → oauth2-client-credentials + rate-limiting
regulated   → oauth2 + jwt via Flex Gateway + Secrets Manager
government  → mtls + oauth2 + jwt + Secrets Manager + field-encryption
```

### Logging — MANDATORY
- Always log: correlationId, flowName, timestamp, payloadSize, environment
- Never log: credentials, PII, raw payloads
- JSON format for non-local environments
- Wire logging: DEV/LOCAL only, NEVER UAT/PROD

### Monitoring Alerts — MANDATORY FOR PRODUCTION
- DLQ message count > 0 → HIGH → page on-call
- Error rate > 5% over 5min → HIGH → alert team
- p95 latency > 3s → MEDIUM → notify team
- Memory > 80% → MEDIUM → scale worker
- Auth token refresh failure → HIGH → alert immediately

### DataWeave Standards
- All transforms in external .dwl files
- Input content-type always declared
- indent=false for large payloads
- Comments required for business rules
- No Java/Groovy in DataWeave

### MUnit Standards
- Minimum 80% coverage
- Happy path test required
- Minimum 2 error scenario tests
- Mock all connector operations
- Run in CI/CD pipeline as gate

### DevOps Standards
- Maven + GitHub Actions (default) or Azure DevOps
- MUnit must pass before deploy
- Properties injected at deploy time via Runtime Manager
- Never commit env-specific properties
- Exchange publish for all APIs

---

## BUILD CHUNKS

Build in this order. Each chunk produces a CHUNK_N_COMPLETE.md.

```
CHUNK 1 — Repo Foundation
  - decisions-schema.json (empty template)
  - connector-registry.json (all connectors)
  - Folder structure with .gitkeep files
  - .devcontainer/devcontainer.json (planning repo)
  - .gitignore
  - README.md (tech lead instructions)
  - CHUNK_1_COMPLETE.md

CHUNK 2 — MuleSoft Standards Document
  - standards/MULESOFT_DESIGN_STANDARDS.md
    Full decision tree, all 6 levels
    Per-pattern: components, error strategy, NFR guidance
    Security standards per tier
    Observability standards per tier
  - standards/scenarios/ (one file per pattern)
  - CHUNK_2_COMPLETE.md

CHUNK 3 — BMAD Agent Customizations
  - .claude/skills/bmad-agent-analyst/ (MuleSoft-aware)
  - .claude/skills/bmad-agent-architect/ (decision tree aware)
  - .claude/skills/bmad-agent-pm/ (story library aware)
  - .claude/skills/bmad-agent-dev/ (scaffold aware)
  - CHUNK_3_COMPLETE.md

CHUNK 4 — BMAD Templates
  - templates/prd-template.md
  - templates/architecture-template.md (includes decisions.json block)
  - templates/story-template.md
  - CHUNK_4_COMPLETE.md

CHUNK 5 — Story Library
  - story-library/ (13 story templates)
  - Each with MuleSoft-specific acceptance criteria
  - Each referencing scaffold file names
  - CHUNK_5_COMPLETE.md

CHUNK 6 — XML + DWL Templates
  - templates/connectors/ (one XML per connector)
  - scaffold/xml-templates/global-config.xml
  - scaffold/xml-templates/error-handler.xml
  - scaffold/xml-templates/flow-template.xml
  - scaffold/xml-templates/scheduler-flow.xml
  - scaffold/xml-templates/notification-flow.xml
  - scaffold/xml-templates/munit-suite.xml
  - scaffold/xml-templates/pom.xml
  - scaffold/xml-templates/log4j2.xml
  - scaffold/xml-templates/default.properties
  - scaffold/xml-templates/env.properties
  - scaffold/xml-templates/devcontainer.json
  - scaffold/xml-templates/github-actions.yml
  - scaffold/xml-templates/azure-pipelines.yml
  - CHUNK_6_COMPLETE.md

CHUNK 7 — Scaffold Generator
  - scaffold/generate.js
    Reads decisions.json + connector-registry.json
    Builds complete Mule project from XML templates
    One flow XML per flow in decisions.json
    One DWL stub per flow
    pom.xml with correct dependencies
    README with developer TODO checklist
  - CHUNK_7_COMPLETE.md

CHUNK 8 — Create Client Repo Script
  - scaffold/create-client-repo.sh
    Reads decisions.json
    Runs generate.js
    Creates GitHub repo via GitHub API
    Pushes generated code
    Sets up devcontainer in client repo
    Outputs summary
  - CHUNK_8_COMPLETE.md

CHUNK 9 — End to End Test (LeoLabs)
  - projects/leolabs/intake/ (LeoLabs docs already known)
  - Run analyst → verify prd.md
  - Run architect → verify architecture.md + decisions.json
  - Run PM → verify stories.md
  - Run scaffold → verify Mule project structure
  - Run create-client-repo → verify GitHub repo created
  - CHUNK_9_COMPLETE.md
```

---

## LEOLABS REFERENCE (TEST PROJECT)

Use LeoLabs as the test case throughout development.

### Known facts about LeoLabs:
- Aerospace startup, 40% YoY growth
- ~30 sales reps
- CRM: Salesforce (source of bookings + territory)
- ERP: NetSuite (source of revenue, backlog, margin)
- Problem: Manual Excel process between systems
- Commission tool: Salesforce Spiff (planned)

### LeoLabs 5 Flows:
```
Flow 1: Sales Order Creation     SFDC → NetSuite   trigger: platform-event
Flow 2: Product & Price Creation SFDC → NetSuite   trigger: platform-event
Flow 3: Price Updates            SFDC → NetSuite   trigger: platform-event
Flow 4: Invoice Sync             NetSuite → SFDC   trigger: scheduler (nightly)
Flow 5: Payment Updates          NetSuite → SFDC   trigger: scheduler
```

### LeoLabs decisions.json (reference):
```json
{
  "project": {
    "name": "leolabs-sfdc-netsuite",
    "client": "LeoLabs",
    "description": "Salesforce to NetSuite bidirectional integration for order-to-cash and commissions"
  },
  "integration": {
    "primaryPattern": "event-driven",
    "secondaryPatterns": ["scheduled-sync"],
    "direction": "bidirectional",
    "flows": [
      {
        "name": "sales-order-creation",
        "layer": "process",
        "source": "salesforce",
        "target": "netsuite",
        "trigger": "platform-event",
        "description": "On opportunity close create sales order in NetSuite"
      },
      {
        "name": "product-price-creation",
        "layer": "system",
        "source": "salesforce",
        "target": "netsuite",
        "trigger": "platform-event",
        "description": "Sync product and price catalog from SFDC to NetSuite"
      },
      {
        "name": "price-updates",
        "layer": "system",
        "source": "salesforce",
        "target": "netsuite",
        "trigger": "platform-event",
        "description": "Push price updates from SFDC to NetSuite"
      },
      {
        "name": "invoice-sync",
        "layer": "process",
        "source": "netsuite",
        "target": "salesforce",
        "trigger": "scheduler",
        "description": "Nightly sync of NetSuite invoices back to Salesforce"
      },
      {
        "name": "payment-updates",
        "layer": "system",
        "source": "netsuite",
        "target": "salesforce",
        "trigger": "scheduler",
        "description": "Push payment status from NetSuite to Salesforce"
      }
    ]
  },
  "nfr": {
    "volume": "medium",
    "latency": "async-ok",
    "frequency": "triggered-and-scheduled",
    "availability": "99.9",
    "throughput": "low"
  },
  "systems": {
    "connectors": ["salesforce", "netsuite", "anypoint-mq"]
  },
  "security": {
    "level": "internal",
    "apiAuth": "oauth2-client-credentials",
    "gatewayPolicies": ["client-id-enforcement", "rate-limiting"],
    "secretsManager": true,
    "fieldEncryption": false,
    "dataMasking": true,
    "mtls": false
  },
  "errorHandling": {
    "strategy": "retry-then-dlq",
    "maxRetries": 3,
    "backoff": "exponential",
    "dlq": true,
    "dlqName": "leolabs-error-dlq",
    "retryQueueName": "leolabs-retry-queue",
    "errorEnvelope": true
  },
  "observability": {
    "anypointMonitoring": true,
    "customDashboard": false,
    "businessEvents": true,
    "externalPlatform": null,
    "logLevel": {
      "local": "DEBUG",
      "dev": "DEBUG",
      "uat": "INFO",
      "prod": "WARN"
    },
    "alerts": ["dlq-message-count", "error-rate-5pct", "latency-p95"]
  },
  "notifications": {
    "email": true,
    "sms": false,
    "slack": true,
    "teams": false,
    "emailRecipients": ["ops@leolabs.com"]
  },
  "scheduling": {
    "required": true,
    "type": "cron",
    "expression": "0 0 2 * * ?",
    "watermarking": true,
    "objectStore": "persistent"
  },
  "clientFacing": {
    "operationsDashboard": false,
    "businessReporting": false,
    "auditTrail": true,
    "selfServicePortal": false,
    "uxFrontend": false
  },
  "devops": {
    "cicd": "github-actions",
    "environments": ["dev", "uat", "prod"],
    "munitRequired": true,
    "munitCoverage": 80,
    "exchangePublish": true,
    "deployment": "cloudhub2",
    "region": "us-east-1"
  },
  "scaffold": {
    "runtime": "4.8.0",
    "java": "17",
    "groupId": "com.dataskate",
    "apiLedLayers": ["system", "process"],
    "generateMunit": true,
    "generateCicd": true,
    "generateNotifications": true,
    "generateScheduler": true,
    "generateWatermark": true
  }
}
```

---

## HOW TO START EACH CLAUDE CODE SESSION

### First message every session:
```
Read PLANNING_CONTEXT.md before doing anything.
Also read CHUNK_PROGRESS.md to see what is already built.
We are working on CHUNK {N}: {title}.
```

### Then paste the CHUNK_N_COMPLETE.md from previous session
for any additional context specific to that chunk.

---

## CHUNK PROGRESS TRACKING

File: CHUNK_PROGRESS.md (updated after each chunk)

```
CHUNK 1 — Repo Foundation          [ ] NOT STARTED
CHUNK 2 — Standards Document       [ ] NOT STARTED
CHUNK 3 — BMAD Agent Customizations[ ] NOT STARTED
CHUNK 4 — BMAD Templates           [ ] NOT STARTED
CHUNK 5 — Story Library            [ ] NOT STARTED
CHUNK 6 — XML + DWL Templates      [ ] NOT STARTED
CHUNK 7 — Scaffold Generator       [ ] NOT STARTED
CHUNK 8 — Create Client Repo Script[ ] NOT STARTED
CHUNK 9 — End to End Test          [ ] NOT STARTED
```

---

## IMPORTANT CONSTRAINTS

- Mule runtime: 4.8.0 / Java 17 ONLY (not 4.6 LTS, Java 11 support ends)
- CloudHub 2.0 not CloudHub 1.0 (deprecated)
- MuleSoft MCP Server: npm install -g mulesoft-mcp-server
- MCP tools available: create_mule_project, implement_api_spec,
  generate_mule_flow, generate_munit_test, search_asset,
  deploy_mule_application, create_api_spec_project
- Scaffold generates VALID XML that compiles immediately
- Every connector config has structured TODO comments
- Developer never needs to know folder structure — it is generated
- Client dev repo has NO planning artifacts — code only
- decisions.json is the ONLY interface between planning and scaffold
- connector-registry.json is the ONLY source for dependency versions

---
*Generated from design session: May 2026*
*Do not edit manually — this is the system contract*
