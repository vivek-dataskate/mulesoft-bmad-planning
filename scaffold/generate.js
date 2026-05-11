#!/usr/bin/env node
'use strict';

/**
 * scaffold/generate.js
 *
 * Reads decisions.json → generates a complete, compilable Mule 4.8.0 project
 * into /tmp/{client}-mule/ (or a custom output directory).
 *
 * Usage:
 *   node scaffold/generate.js projects/{client}/decisions.json
 *   node scaffold/generate.js projects/{client}/decisions.json /custom/output/path
 *
 * Reads:
 *   decisions.json                        — project decisions
 *   standards/connector-registry.json    — connector metadata + Maven coords
 *   scaffold/xml-templates/              — Mule project templates
 *   templates/connectors/                — per-connector config stubs
 *
 * Generates (in output directory):
 *   pom.xml
 *   mule-artifact.json
 *   src/main/mule/global-config.xml
 *   src/main/mule/error-handler.xml
 *   src/main/mule/{flow.name}-flows.xml  (one per flow)
 *   src/main/resources/api/{flow}.yaml   (per HTTP-triggered flow)
 *   src/main/resources/dwl/{transform}.dwl (one per flow)
 *   src/main/resources/properties/{local|dev|uat|prod}.yaml
 *   src/test/munit/{flow.name}-test.xml  (one per flow)
 *   .github/workflows/deploy.yml         (when cicd=github-actions)
 */

const fs   = require('fs');
const path = require('path');

// ─── Paths ────────────────────────────────────────────────────────────────────

const REPO_ROOT    = path.resolve(__dirname, '..');
const TMPL_DIR     = path.join(__dirname, 'xml-templates');
const CONN_TMPL    = path.join(REPO_ROOT, 'templates', 'connectors');
const REGISTRY_F   = path.join(REPO_ROOT, 'standards', 'connector-registry.json');
const SNIPPET_REG_F = path.join(REPO_ROOT, 'standards', 'snippet-registry.json');
const DEVCONTAINER_TMPL_DIR = path.join(__dirname, 'devcontainer-templates');

// Commons library version — read from commons/pom.xml when available
function readCommonsVersion() {
  const pomPath = path.join(REPO_ROOT, 'commons', 'pom.xml');
  if (!fs.existsSync(pomPath)) return '1.0.0';
  const xml = fs.readFileSync(pomPath, 'utf8');
  const m = xml.match(/<version>([^<]+)<\/version>/);
  return m ? m[1] : '1.0.0';
}

// ─── File I/O ─────────────────────────────────────────────────────────────────

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const rel = path.relative(process.cwd(), filePath);
  const remaining = content.match(/\{\{[A-Za-z_]+\}\}/g);
  if (remaining) {
    console.warn(`  ⚠  Unsubstituted tokens in ${rel}: ${[...new Set(remaining)].join(', ')}`);
  }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`  ✓ ${rel}`);
}

// ─── Template Engine ──────────────────────────────────────────────────────────

// Replace all {{TOKEN}} placeholders with values from the tokens map.
// Tokens not present in the map are left unchanged (not blanked).
function sub(template, tokens) {
  let result = template;
  for (const [key, value] of Object.entries(tokens)) {
    result = result.split(`{{${key}}}`).join(String(value ?? ''));
  }
  return result;
}

// Process {{#if FLAG}}...{{/if}} blocks.
// Blocks evaluate to their body when flags[FLAG] is truthy, empty string otherwise.
// Does not support nesting — nested {{#if}} inside a body will be left as-is and
// produce malformed output. Warn early so template authors catch the problem.
function processIf(template, flags) {
  return template.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, flag, body) => {
      if (/\{\{#if /.test(body)) {
        console.warn(`  ⚠  Nested {{#if}} detected inside {{#if ${flag}}} — nesting is not supported; inner block will not be evaluated.`);
      }
      return flags[flag] ? body : '';
    }
  );
}

// Full render pass: conditionals first, then token substitution.
function render(template, tokens = {}, flags = {}) {
  return sub(processIf(template, flags), tokens);
}

// Strip the XML declaration (<?xml ...?>) from a template string.
// Used when embedding connector config fragments into global-config.xml.
function stripXmlDecl(xml) {
  return xml.replace(/^<\?xml[^?]*\?>\s*/i, '');
}

// Extract the body of a <mule>...</mule> root element, stripping the wrapper.
// Connector config templates are complete mule XML documents; we only want the inner elements.
function extractMuleBody(xml) {
  const inner = xml.replace(/^[\s\S]*?<mule[^>]*>\s*/i, '')
                   .replace(/\s*<\/mule>\s*$/i, '');
  return inner.trim();
}

// ─── Profile Computation ──────────────────────────────────────────────────────

/**
 * Compute scaffold profile from decisions.json if not explicitly set.
 *
 * regulated:  security=regulated|government
 * enterprise: availability=99.99 OR customDashboard=true OR compensationStrategy=compensating-transaction
 * minimal:    security=internal AND availability=best-effort AND pattern=outbound-notification
 * standard:   everything else
 */
function computeProfile(d) {
  const sec   = d.security?.level ?? 'internal';
  const avail = d.nfr?.availability ?? 'best-effort';
  const comp  = d.errorHandling?.compensationStrategy ?? 'retry';
  const dash  = d.observability?.customDashboard ?? false;
  const pat   = d.integration?.primaryPattern ?? '';

  if (sec === 'regulated' || sec === 'government') return 'regulated';
  if (avail === '99.99' || dash || comp === 'compensating-transaction') return 'enterprise';
  if (sec === 'internal' && avail === 'best-effort' && pat === 'outbound-notification') return 'minimal';
  return 'standard';
}

// ─── MUnit Coverage Floors ────────────────────────────────────────────────────

const COVERAGE_MAP = {
  'request-reply':         80,
  'api-aggregation':       80,
  'event-driven':          75,
  'pubsub-fanout':         75,
  'batch':                 75,
  'data-migration':        75,
  'outbound-notification': 60,
};

// For hybrid patterns: use the lowest floor of any included pattern.
function getCoverageFloor(primary, secondary = []) {
  const all = [primary, ...secondary].filter(Boolean);
  const floors = all.map(p => COVERAGE_MAP[p] ?? 80);
  return floors.length ? Math.min(...floors) : 80;
}

// ─── Async / Idempotency Helpers ──────────────────────────────────────────────

// Patterns that require idempotency on every consumer flow.
const ASYNC_PATTERNS = new Set([
  'event-driven', 'pubsub-fanout', 'cdc-streaming',
  'transactional-outbox', 'streaming-pipeline', 'b2b-edi',
  'process-orchestration',
]);

// Trigger types that indicate an async consumer (need idempotency).
const ASYNC_TRIGGERS = new Set([
  'mq-subscriber', 'kafka', 'platform-event', 'cdc',
]);

function isAsyncPattern(d) {
  const primary    = d.integration?.primaryPattern ?? '';
  const secondary  = d.integration?.secondaryPatterns ?? [];
  return ASYNC_PATTERNS.has(primary) || secondary.some(p => ASYNC_PATTERNS.has(p));
}

function isAsyncTrigger(trigger) {
  return ASYNC_TRIGGERS.has(trigger);
}

// ─── Registry Lookup ──────────────────────────────────────────────────────────

// Build a flat map of connectorKey → connector metadata from the nested registry.
function buildRegistryLookup(registry) {
  const map = {};
  for (const cat of Object.values(registry.categories ?? {})) {
    for (const [key, conn] of Object.entries(cat.connectors ?? {})) {
      map[key] = conn;
    }
  }
  return map;
}

// Print staleness warnings. Thresholds: >60 days = WARNING (Red), >30 days = NOTICE (Yellow).
// lastVerified is YYYY-MM. We use the last day of that month (day 0 of month+1) so that a
// connector verified at any point during the month is not penalised by a full 30-day shift.
// Using Date.UTC avoids local-timezone drift on build servers.
function checkStaleness(key, conn) {
  if (!conn.lastVerified) return;
  const parts = conn.lastVerified.split('-').map(Number);
  if (parts.length < 2 || !parts[0] || !parts[1]) return;
  // day 0 of (month+1) = last day of month
  const verifiedDate = new Date(Date.UTC(parts[0], parts[1], 0));
  const daysDiff = (Date.now() - verifiedDate.getTime()) / 86_400_000;
  const name = conn.displayName ?? key;
  const url  = conn.exchangeUrl ?? 'https://anypoint.mulesoft.com/exchange/';
  if (daysDiff > 60) {
    console.warn(`\n⚠  WARNING: ${key} (${name}) last verified ${conn.lastVerified} (${Math.round(daysDiff)}d ago)`);
    console.warn(`   May be outdated. Check: ${url}`);
    console.warn(`   Update connector-registry.json after verifying.`);
  } else if (daysDiff > 30) {
    console.warn(`\n⚡ NOTICE:  ${key} (${name}) last verified ${conn.lastVerified} — verify on Exchange before project start`);
  }
}

// Build a <dependency> block for pom.xml injection.
// Registry stores docVersion (major.minor from docs page title, e.g. "11.4").
// Maven needs an exact version (e.g. "11.4.0"). Developers MUST visit Exchange
// to find the current patch version before running mvn compile.
// The TODO comment is intentional — do not remove it.
function connectorDepXml(key, conn) {
  const rawVersion  = conn.version ?? conn.docVersion ?? 'VERIFY_ON_EXCHANGE';
  const exchangeUrl = conn.exchangeUrl ?? 'https://anypoint.mulesoft.com/exchange/';
  // If version looks like major.minor (no patch component), append .x as a reminder
  const hasExactVersion = /^\d+\.\d+\.\d+/.test(rawVersion);
  const version = hasExactVersion ? rawVersion : rawVersion;  // keep as-is; TODO comment handles it
  const todoNote = hasExactVersion
    ? `<!-- Version ${version} — verify latest patch at ${exchangeUrl} -->`
    : `<!-- TODO: Replace "${version}" with exact patch version from Exchange: ${exchangeUrl} -->`;
  return [
    `        ${todoNote}`,
    `        <dependency>`,
    `            <groupId>${conn.groupId}</groupId>`,
    `            <artifactId>${conn.artifactId}</artifactId>`,
    `            <version>${version}</version>`,
    `            <classifier>mule-plugin</classifier>`,
    `        </dependency>`,
  ].join('\n');
}

// ─── Namespace Registry ───────────────────────────────────────────────────────

// Maps connector key → XML namespace info for injection into flow file headers.
const NS_REGISTRY = {
  salesforce:          { prefix: 'salesforce',  uri: 'http://www.mulesoft.org/schema/mule/salesforce'          },
  'salesforce-data-cloud': { prefix: 'sdc',     uri: 'http://www.mulesoft.org/schema/mule/sdc'                 },
  netsuite:            { prefix: 'netsuite',    uri: 'http://www.mulesoft.org/schema/mule/netsuite'            },
  'anypoint-mq':       { prefix: 'anypoint-mq', uri: 'http://www.mulesoft.org/schema/mule/anypoint-mq'         },
  kafka:               { prefix: 'kafka',        uri: 'http://www.mulesoft.org/schema/mule/kafka'               },
  'amazon-s3':         { prefix: 's3',           uri: 'http://www.mulesoft.org/schema/mule/s3'                  },
  database:            { prefix: 'db',           uri: 'http://www.mulesoft.org/schema/mule/db'                  },
  mysql:               { prefix: 'db',           uri: 'http://www.mulesoft.org/schema/mule/db'                  },
  postgresql:          { prefix: 'db',           uri: 'http://www.mulesoft.org/schema/mule/db'                  },
  mssql:               { prefix: 'db',           uri: 'http://www.mulesoft.org/schema/mule/db'                  },
  'oracle-db':         { prefix: 'db',           uri: 'http://www.mulesoft.org/schema/mule/db'                  },
  sftp:                { prefix: 'sftp',          uri: 'http://www.mulesoft.org/schema/mule/sftp'                },
  ftp:                 { prefix: 'ftp',           uri: 'http://www.mulesoft.org/schema/mule/ftp'                 },
  file:                { prefix: 'file',          uri: 'http://www.mulesoft.org/schema/mule/file'                },
  email:               { prefix: 'email',         uri: 'http://www.mulesoft.org/schema/mule/email'               },
  mongodb:             { prefix: 'mongodb',       uri: 'http://www.mulesoft.org/schema/mule/mongodb'             },
  redis:               { prefix: 'redis',         uri: 'http://www.mulesoft.org/schema/mule/redis'               },
  servicenow:          { prefix: 'servicenow',    uri: 'http://www.mulesoft.org/schema/mule/servicenow'          },
  workday:             { prefix: 'workday',       uri: 'http://www.mulesoft.org/schema/mule/workday'             },
  jira:                { prefix: 'jira',           uri: 'http://www.mulesoft.org/schema/mule/jira'               },
  sap:                 { prefix: 'sap',            uri: 'http://www.mulesoft.org/schema/mule/sap'                },
  slack:               { prefix: 'slack',          uri: 'http://www.mulesoft.org/schema/mule/slack'              },
  'azure-service-bus': { prefix: 'azure-sb',       uri: 'http://www.mulesoft.org/schema/mule/azure-sb'           },
  'amazon-sqs':        { prefix: 'sqs',            uri: 'http://www.mulesoft.org/schema/mule/sqs'                },
  'azure-blob':        { prefix: 'azure-blob',     uri: 'http://www.mulesoft.org/schema/mule/azure-blob'         },
  jms:                 { prefix: 'jms',             uri: 'http://www.mulesoft.org/schema/mule/jms'               },
  amqp:                { prefix: 'amqp',            uri: 'http://www.mulesoft.org/schema/mule/amqp'              },
  dynamics365:         { prefix: 'dynamics365',     uri: 'http://www.mulesoft.org/schema/mule/dynamics365'        },
};

// Build the xmlns and xsi:schemaLocation additions for a set of connector keys.
function buildNamespaceAdditions(connKeys) {
  const seenPrefix = new Set();
  const nsLines    = [];
  const schLines   = [];

  // Always add validation namespace — used in flow stubs for validation examples.
  const validationNs = 'http://www.mulesoft.org/schema/mule/validation';
  nsLines.push(`      xmlns:validation="${validationNs}"`);
  schLines.push(`        ${validationNs}\n          ${validationNs}/current/mule-validation.xsd`);
  seenPrefix.add('validation');

  for (const key of connKeys) {
    const ns = NS_REGISTRY[key];
    if (!ns || seenPrefix.has(ns.prefix)) continue;
    seenPrefix.add(ns.prefix);
    nsLines.push(`      xmlns:${ns.prefix}="${ns.uri}"`);
    schLines.push(`        ${ns.uri}\n          ${ns.uri}/current/mule-${ns.prefix}.xsd`);
  }

  return {
    ADDITIONAL_NAMESPACES:       nsLines.join('\n'),
    ADDITIONAL_SCHEMA_LOCATIONS: schLines.join('\n'),
  };
}

// ─── Trigger Template Selection ───────────────────────────────────────────────

const TRIGGER_TEMPLATE_MAP = {
  'http':                  'http-listener.xml',
  'scheduler':             'scheduler.xml',
  'mq-subscriber':         'mq-subscriber.xml',
  'platform-event':        'mq-subscriber.xml',  // Platform Events use same subscriber pattern
  'cdc':                   'mq-subscriber.xml',  // CDC via MQ after Debezium/connector
  'kafka':                 'kafka-listener.xml',
  'sftp':                  'sftp-on-new-file.xml',
  'db-poll':               'db-poll.xml',
  'batch-scope':           'batch-scope.xml',
  'scatter-gather':        'scatter-gather.xml',
  'process-orchestration': 'process-orchestration.xml',
};

// Connector namespaces implicitly required by each trigger type.
// Used by genFlowFile() to add only the relevant xmlns declarations — not all project connectors.
// Developers add target-connector namespaces manually when they implement the TODO stubs.
const TRIGGER_CONNECTOR_MAP = {
  'mq-subscriber':         ['anypoint-mq'],
  'platform-event':        ['anypoint-mq'],
  'cdc':                   ['anypoint-mq'],
  'kafka':                 ['kafka'],
  'sftp':                  ['sftp'],
  'db-poll':               ['db'],
  'process-orchestration': ['anypoint-mq'],
  // http, scheduler, batch-scope, scatter-gather: no additional connector namespace needed
};

function loadTriggerTemplate(trigger) {
  const filename = TRIGGER_TEMPLATE_MAP[trigger] ?? 'http-listener.xml';
  const fullPath = path.join(TMPL_DIR, 'triggers', filename);
  if (!fs.existsSync(fullPath)) {
    console.warn(`  ⚠  Trigger template not found: triggers/${filename} — falling back to http-listener.xml`);
    return readFile(path.join(TMPL_DIR, 'triggers', 'http-listener.xml'));
  }
  return readFile(fullPath);
}

// ─── Token Builder ────────────────────────────────────────────────────────────

// Build all template tokens for a single flow.
// This is the single source of truth for per-flow tokens.
function buildFlowTokens(flow, d, coverageFloor) {
  const client    = d.project?.client ?? 'client';
  const domain    = client.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const primary   = d.integration?.primaryPattern ?? 'request-reply';
  const ttlHours  = d.flowControl?.messageTtlHours ?? 24;
  const dedupMins = d.flowControl?.deduplicationTtlMinutes ?? ttlHours * 60;
  const maxConc   = d.flowControl?.maxConcurrency ?? 4;
  const cronExpr  = d.scheduling?.expression ?? '0 0 2 * * ?';

  const flowName  = flow.name ?? 'unnamed-flow';
  const src       = flow.source ?? 'source-system';
  const tgt       = flow.target ?? 'target-system';

  // HTTP path: strip -flow suffix and leading action verb for a REST-style path.
  // Example: get-orders-flow → /orders, process-payment-flow → /payment
  const httpPathBase = flowName
    .replace(/-flow$/, '')
    .replace(/^(get|post|put|delete|patch|process|sync|send|receive|create|update)-/, '');
  const httpPath = '/' + httpPathBase.replace(/-/g, '/');

  // DWL file name convention: transform-{source}-to-{target}
  const dwlName = `transform-${src.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-to-${tgt.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  // Queue property key for MQ subscriber flows (mq.queue.{key})
  const queueProp = flowName.replace(/-flow$/, '').replace(/-/g, '.');

  // Consumer prefix for idempotency Object Store key (avoids key collision across flows)
  const consumerPrefix = flowName.replace(/-flow$/, '');

  // DB table name derived from source system name
  const dbTable = src.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  return {
    // Flow identity
    FLOW_NAME:            flowName,
    FLOW_FILE_NAME:       flowName,
    FLOW_DESCRIPTION:     flow.description ?? `${src} → ${tgt}`,
    FLOW_SOURCE:          src,
    FLOW_TARGET:          tgt,
    PRIMARY_PATTERN:      primary,
    API_LAYER:            flow.layer ?? 'process',
    TRIGGER_TYPE:         flow.trigger ?? 'http',

    // HTTP
    HTTP_PATH:            httpPath,
    HTTP_METHODS:         flow.httpMethods ?? 'POST,GET',
    // RESOURCE_PATH is the path without the leading '/'; used in OAS paths section
    RESOURCE_PATH:        httpPath.slice(1),

    // DataWeave
    DWL_FILE_NAME:        dwlName,
    VERB:                 'transform',

    // MQ / async — TOPIC_PROPERTY is the Kafka variant of QUEUE_PROPERTY (same value)
    QUEUE_PROPERTY:       queueProp,
    TOPIC_PROPERTY:       queueProp,
    MAX_CONCURRENCY:      maxConc,
    MESSAGE_TTL_HOURS:    ttlHours,
    DEDUP_TTL_MINUTES:    dedupMins,
    CONSUMER_PREFIX:      consumerPrefix,
    WIRE_TAP_RETENTION_HOURS: d.wireTap?.retentionHours ?? 72,

    // Scheduler / watermark
    CRON_EXPRESSION:      cronExpr,
    WATERMARK_FIELD:      'updated_at',
    DB_TABLE:             dbTable,

    // OAS spec
    API_TITLE:            flow.description ?? `${client} ${flowName} API`,
    API_DESCRIPTION:      `${flow.description ?? 'Generated API stub'}\n\nDeveloper completes field-level schema before publishing to Exchange.`,
    PROJECT_TEAM:         client,
    base_url:             `${domain}.cloudhub2.io`,
    DOMAIN:               domain,

    // Project-level — artifactId uses the sanitised domain slug, not the raw client name,
    // so it is always a valid Maven artifactId (lowercase, hyphens only).
    domain,
    artifactId:           `${domain}-mule`,

    // MUnit
    MUNIT_COVERAGE:       coverageFloor,

    // Scheduler / watermark — WATERMARK_ENABLED appears as a plain token in scheduler.xml
    // comments (in addition to {{#if WATERMARK_ENABLED}} blocks). Duplicate in tokens map
    // so comment lines are also substituted.
    WATERMARK_ENABLED:    String(!!(d.scheduling?.watermarking)),
  };
}

// ─── pom.xml ──────────────────────────────────────────────────────────────────

function genPom(d, lookup, outDir) {
  const client    = d.project?.client ?? 'client';
  const coverage  = getCoverageFloor(d.integration?.primaryPattern, d.integration?.secondaryPatterns);
  const connKeys  = d.systems?.connectors ?? [];
  const seen      = new Set();
  const deps      = [];

  // http connector is always needed (HTTP listener + outbound calls)
  for (const key of ['http', ...connKeys]) {
    if (seen.has(key)) continue;
    seen.add(key);
    const conn = lookup[key];
    if (!conn) {
      if (key !== 'http') console.warn(`  ⚠  Connector "${key}" not found in registry — skipping dependency`);
      continue;
    }
    checkStaleness(key, conn);
    deps.push(connectorDepXml(key, conn));
  }

  // Always add the commons library dependency — it provides shared sub-flows and DWL modules
  const commonsVersion = readCommonsVersion();
  const commonsGroupId  = d.scaffold?.groupId ?? 'com.yourcompany';
  const commonsDep = [
    `        <!-- mulesoft-commons: shared error handling, retry, notifications, DWL modules -->`,
    `        <!-- Run commons/publish.sh before building — must be published to Exchange first -->`,
    `        <dependency>`,
    `            <groupId>${commonsGroupId}</groupId>`,
    `            <artifactId>mulesoft-commons</artifactId>`,
    `            <version>${commonsVersion}</version>`,
    `            <classifier>mule-plugin</classifier>`,
    `        </dependency>`,
  ].join('\n');

  const domain = client.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const tmpl   = readFile(path.join(TMPL_DIR, 'pom.xml'));
  const result = sub(tmpl, {
    groupId:                d.scaffold?.groupId ?? 'com.yourcompany',
    artifactId:             `${domain}-mule`,
    awsRegion:              d.devops?.region ?? 'us-east-1',
    CONNECTOR_DEPENDENCIES: commonsDep + '\n\n' + deps.join('\n\n'),
    munitCoverage:          coverage,
    munitCoveragePerFlow:   Math.max(coverage - 5, 0),
  });
  writeFile(path.join(outDir, 'pom.xml'), result);
}

// ─── mule-artifact.json ───────────────────────────────────────────────────────

function genMuleArtifact(d, lookup, outDir) {
  const connKeys  = d.systems?.connectors ?? [];
  const secLevel  = d.security?.level ?? 'internal';
  const secProps  = new Set();

  // Always protect connected app secret
  secProps.add('"anypoint.connectedApp.clientSecret"');

  // Collect sensitive properties from connector metadata
  for (const key of connKeys) {
    const conn = lookup[key];
    if (!conn?.propertiesRequired) continue;
    for (const prop of conn.propertiesRequired) {
      // Match only when the last dot-separated segment ends with a sensitive term.
      // Substring match would produce false positives: sftp.keystore.path (contains "key"),
      // or any property with "monkey" in its name. End-of-segment matching is precise.
      const lastSeg = prop.split('.').pop() ?? prop;
      if (/(password|secret|key|token|passphrase|credential)s?$/i.test(lastSeg)) {
        secProps.add(`"${prop}"`);
      }
    }
  }

  // Regulated/government profiles always add field encryption key
  if (secLevel === 'regulated' || secLevel === 'government') {
    secProps.add('"encryption.key"');
  }

  const propLines = [...secProps].map(p => `    ${p}`).join(',\n');
  const tmpl   = readFile(path.join(TMPL_DIR, 'mule-artifact.json'));
  let result = sub(tmpl, {
    SECURE_PROPERTIES: '\n' + propLines + '\n    ',
  });
  // Strip block comments (/* ... */) — mule-artifact.json must be valid JSON
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  writeFile(path.join(outDir, 'mule-artifact.json'), result);
}

// ─── global-config.xml ───────────────────────────────────────────────────────

function genGlobalConfig(d, lookup, outDir) {
  const connKeys    = d.systems?.connectors ?? [];
  const secLevel    = d.security?.level ?? 'internal';
  const secretsMgr  = d.security?.secretsManager ??
    (secLevel === 'regulated' || secLevel === 'government');
  const nsLines     = [];
  const schLines    = [];
  const configBlocks = [];
  const seenNs      = new Set();

  for (const key of connKeys) {
    const conn = lookup[key];
    if (!conn) {
      console.warn(`  ⚠  Connector "${key}" not in registry — skipping config block`);
      configBlocks.push(`    <!-- TODO: Add config for "${key}" — not found in connector-registry.json -->`);
      continue;
    }

    // Locate the config template file
    const tmplRelative = conn.configTemplate ?? `templates/connectors/${key}-config.xml`;
    const tmplName     = path.basename(tmplRelative);
    const tmplPath     = path.join(CONN_TMPL, tmplName);

    if (!fs.existsSync(tmplPath)) {
      const fallback = `    <!-- TODO: Add config for ${conn.displayName} — template not found: ${tmplName} -->`;
      configBlocks.push(fallback);
      console.warn(`  ⚠  Connector template not found: ${tmplName} — generated TODO placeholder`);
      continue;
    }

    // Extract the connector config element(s) from the full mule XML document.
    // Apply per-connector token substitution before embedding so that tokens like
    // {{WIRE_TAP_RETENTION_HOURS}}, {{SYSTEM_NAME}}, {{system_key}} are resolved.
    const raw    = readFile(tmplPath);
    const body   = extractMuleBody(stripXmlDecl(raw));
    const connTokens = {
      WIRE_TAP_RETENTION_HOURS: d.wireTap?.retentionHours ?? 72,
      SYSTEM_NAME:              conn.displayName ?? key,
      system_key:               key,
    };
    configBlocks.push(sub(body, connTokens));

    // Collect namespace info for global-config xmlns declarations
    const ns = NS_REGISTRY[key];
    if (ns && !seenNs.has(ns.prefix)) {
      seenNs.add(ns.prefix);
      nsLines.push(`      xmlns:${ns.prefix}="${ns.uri}"`);
      schLines.push(`        ${ns.uri}\n          ${ns.uri}/current/mule-${ns.prefix}.xsd`);
    }
  }

  const tmpl   = readFile(path.join(TMPL_DIR, 'global-config.xml'));
  const flags  = { SECRETS_MANAGER_ENABLED: secretsMgr };
  const tokens = {
    CONNECTOR_CONFIGS:           configBlocks.join('\n\n    '),
    ADDITIONAL_NAMESPACES:       nsLines.join('\n'),
    ADDITIONAL_SCHEMA_LOCATIONS: schLines.join('\n'),
  };
  writeFile(path.join(outDir, 'src/main/mule/global-config.xml'), render(tmpl, tokens, flags));
}

// ─── error-handler.xml ───────────────────────────────────────────────────────

function genErrorHandler(d, outDir) {
  const dlqEnabled  = d.errorHandling?.dlq ?? true;
  const imcEnabled  = d.errorHandling?.invalidMessageChannel ?? false;
  const pattern     = d.integration?.primaryPattern ?? '';
  const isAsync     = isAsyncPattern(d);
  const hasNotify   = d.notifications?.slack || d.notifications?.email;

  // Generate error-handler.xml that delegates to commons sub-flows.
  // commons sub-flows (common-route-to-dlq-subflow, common-build-error-response-subflow,
  // common-dispatch-error-notification-subflow) are provided by the mulesoft-commons dependency.
  const errorHandlerXml = `<?xml version="1.0" encoding="UTF-8"?>
<!--
    error-handler.xml — Global error handler for ${d.project?.client ?? 'client'}.

    Delegates to commons sub-flows from mulesoft-commons dependency:
      common-route-to-dlq-subflow              → publish to DLQ with error envelope
      common-build-error-response-subflow      → build HTTP error JSON for sync flows
      common-dispatch-error-notification-subflow → Slack/email alert on DLQ routing

    To change error handling behaviour, update the commons library (commons/)
    and bump the version — do NOT add logic here.
    This file is regenerated by scaffold; local changes will be overwritten.
-->
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="
        http://www.mulesoft.org/schema/mule/core
          http://www.mulesoft.org/schema/mule/core/current/mule.xsd">

    <error-handler name="Global_Error_Handler">

        <!--
            CONNECTIVITY / TIMEOUT errors — infrastructure failures.
            Route to DLQ for async flows; return 503 for sync flows.
        -->
        <on-error-continue
            type="CONNECTIVITY, TIMEOUT, HTTP:CONNECTIVITY, HTTP:TIMEOUT,
                  DB:CONNECTIVITY, KAFKA:CONNECTIVITY, SFTP:CONNECTIVITY, FILE:FILE_NOT_FOUND"
            logException="false">

${isAsync ? `            <!-- Async flow: route failed message to DLQ -->
            <flow-ref name="common-route-to-dlq-subflow"/>
${hasNotify ? `            <!-- Alert ops team on DLQ routing -->
            <flow-ref name="common-dispatch-error-notification-subflow"/>` : '            <!-- Enable notifications: set notifications.slack.webhook.url or notifications.email.to in properties -->'}
` : `            <!-- Sync flow: return 503 with Retry-After header -->
            <flow-ref name="common-build-error-response-subflow"/>
            <set-variable variableName="httpStatus" value="503"/>
`}
        </on-error-continue>

        <!--
            VALIDATION errors — structurally invalid messages.
            These go to the Invalid Message Channel (NOT the DLQ) — never retried.
        -->
${imcEnabled ? `        <on-error-continue type="MULE:EXPRESSION, VALIDATION:INVALID, VALIDATION:INVALID_BOOLEAN" logException="false">
            <logger
                level="WARN"
                message='#["[INVALID_MSG] correlationId=" ++ correlationId ++ " | error=" ++ error.description]'
                doc:name="Log Invalid Message"/>
            <anypoint-mq:publish
                config-ref="Anypoint_MQ_Config"
                destination="\${mq.queue.invalid-messages}"
                doc:name="Route to Invalid Message Channel">
                <anypoint-mq:body>#[output application/json --- {
                    correlationId:    correlationId,
                    errorCode:        "VALIDATION:INVALID_MESSAGE",
                    message:          error.description,
                    timestamp:        now() as String { format: "yyyy-MM-dd'T'HH:mm:ss.SSSZ" },
                    failingComponent: flow.name,
                    resolution:       "Fix source data and resubmit — this message will NOT be retried"
                }]</anypoint-mq:body>
            </anypoint-mq:publish>
        </on-error-continue>
` : '        <!-- Invalid Message Channel not enabled for this project (decisions.json errorHandling.invalidMessageChannel=false) -->'}

        <!--
            All other errors — unexpected runtime failures.
            Sync flows: return 500 error envelope.
            Async flows: route to DLQ.
        -->
        <on-error-continue logException="false">
${isAsync ? `            <flow-ref name="common-route-to-dlq-subflow"/>
${hasNotify ? `            <flow-ref name="common-dispatch-error-notification-subflow"/>` : ''}` : `            <flow-ref name="common-build-error-response-subflow"/>
            <set-variable variableName="httpStatus" value="500"/>`}
        </on-error-continue>

    </error-handler>

</mule>
`;

  writeFile(path.join(outDir, 'src/main/mule/error-handler.xml'), errorHandlerXml);
}

// ─── {flow.name}-flows.xml ────────────────────────────────────────────────────

function genFlowFile(flow, d, snippets, outDir, coverageFloor) {
  const trigger   = flow.trigger ?? 'http';
  const connKeys  = d.systems?.connectors ?? [];
  const wireTap   = d.wireTap?.enabled ?? false;
  const tokens    = buildFlowTokens(flow, d, coverageFloor);
  const flags     = {
    WATERMARK_ENABLED: !!(d.scheduling?.watermarking),
  };

  // 1. Load and render the trigger fragment
  let flowContent = render(loadTriggerTemplate(trigger), tokens, flags);

  // 2. Inject wire-tap snippet for async flows when wireTap is enabled
  if (wireTap && (isAsyncTrigger(trigger) || isAsyncPattern(d))) {
    if (snippets['wire-tap.xml']) {
      const wireTapXml = sub(snippets['wire-tap.xml'], tokens);
      const ANCHOR = '<error-handler ref="Global_Error_Handler"/>';
      if (!flowContent.includes(ANCHOR)) {
        console.warn(`  ⚠  Wire-tap injection failed for ${flow.name}: anchor "${ANCHOR}" not found in trigger template — wire-tap was NOT inserted.`);
      } else {
        flowContent = flowContent.replace(
          ANCHOR,
          wireTapXml.trim() + '\n\n        ' + ANCHOR
        );
      }
    }
  }

  // 3. Build namespace additions for ONLY the connectors this trigger type requires.
  // Using all project connectors (connKeys) would add unnecessary xmlns declarations to every
  // flow file. Developers add target-connector namespaces manually when implementing TODOs.
  const triggerConnKeys = TRIGGER_CONNECTOR_MAP[trigger] ?? [];
  const { ADDITIONAL_NAMESPACES, ADDITIONAL_SCHEMA_LOCATIONS } = buildNamespaceAdditions(triggerConnKeys);

  // 4. Wrap flow content in flows-base.xml
  const baseTmpl = readFile(path.join(TMPL_DIR, 'flows-base.xml'));
  const result   = render(baseTmpl, {
    ...tokens,
    FLOW_CONTENT:                flowContent,
    ADDITIONAL_NAMESPACES,
    ADDITIONAL_SCHEMA_LOCATIONS,
  }, flags);

  writeFile(path.join(outDir, `src/main/mule/${flow.name}-flows.xml`), result);
}

// ─── {flow.name}-test.xml ─────────────────────────────────────────────────────

function genMunitFile(flow, d, outDir, coverageFloor) {
  const tokens = buildFlowTokens(flow, d, coverageFloor);
  const tmpl   = readFile(path.join(TMPL_DIR, 'munit-base.xml'));
  writeFile(
    path.join(outDir, `src/test/munit/${flow.name}-test.xml`),
    render(tmpl, tokens)
  );
}

// ─── {transform}.dwl ─────────────────────────────────────────────────────────

function genDwlFile(flow, d, outDir) {
  const tokens  = buildFlowTokens(flow, d, 80);
  const dwlName = tokens.DWL_FILE_NAME;
  const tmpl    = readFile(path.join(TMPL_DIR, 'transform.dwl'));
  writeFile(
    path.join(outDir, `src/main/resources/dwl/${dwlName}.dwl`),
    sub(tmpl, tokens)
  );
}

// ─── OAS spec stub ────────────────────────────────────────────────────────────

function genOasSpec(flow, d, outDir) {
  const tokens   = buildFlowTokens(flow, d, 80);
  const specName = (flow.name ?? 'api').replace(/-flow$/, '');
  const tmpl     = readFile(path.join(TMPL_DIR, 'oas-spec.yaml'));
  writeFile(
    path.join(outDir, `src/main/resources/api/${specName}.yaml`),
    sub(tmpl, tokens)
  );
}

// ─── Properties files ─────────────────────────────────────────────────────────

function genProperties(d, outDir) {
  const client   = d.project?.client ?? 'client';
  const domain   = client.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const tokens   = { domain, artifactId: `${domain}-mule` };

  for (const env of ['local', 'dev', 'uat', 'prod']) {
    const tmplPath = path.join(TMPL_DIR, `${env}.yaml`);
    if (!fs.existsSync(tmplPath)) continue;
    writeFile(
      path.join(outDir, `src/main/resources/properties/${env}.yaml`),
      sub(readFile(tmplPath), tokens)
    );
  }
}

// ─── deploy.yml ───────────────────────────────────────────────────────────────

function genDeployYml(d, outDir) {
  if ((d.devops?.cicd ?? 'none') !== 'github-actions') return;
  const client = d.project?.client ?? 'client';
  const domain = client.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const tokens = {
    artifactId: `${domain}-mule`,
    awsRegion:  d.devops?.region ?? 'us-east-1',
  };
  const tmpl = readFile(path.join(TMPL_DIR, 'deploy.yml'));
  writeFile(path.join(outDir, '.github/workflows/deploy.yml'), sub(tmpl, tokens));
}

// ─── Regulated Profile Extras ─────────────────────────────────────────────────

// For regulated/government profile: generate a skeleton audit-trail flow file.
function genAuditTrailFlow(d, outDir) {
  const client = d.project?.client ?? 'client';
  const domain = client.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!--
    audit-trail-flows.xml — Regulated/government profile: compliance audit trail.
    Generated by scaffold generator (profile=${d.scaffold?.profile}).

    This flow subscribes to a dedicated audit queue and writes to a
    tamper-evident audit store (DB, S3, or SIEM).

    TODO: Configure the audit store destination before going live.
    Regulatory requirement: retain audit records for {N} years per your compliance framework.
-->
<mule xmlns="http://www.mulesoft.org/schema/mule/core"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xmlns:anypoint-mq="http://www.mulesoft.org/schema/mule/anypoint-mq"
      xmlns:ee="http://www.mulesoft.org/schema/mule/ee/core"
      xsi:schemaLocation="
        http://www.mulesoft.org/schema/mule/core
          http://www.mulesoft.org/schema/mule/core/current/mule.xsd
        http://www.mulesoft.org/schema/mule/anypoint-mq
          http://www.mulesoft.org/schema/mule/anypoint-mq/current/mule-anypoint-mq.xsd
        http://www.mulesoft.org/schema/mule/ee/core
          http://www.mulesoft.org/schema/mule/ee/core/current/mule-ee.xsd">

    <flow name="write-audit-trail-flow" doc:name="Write Audit Trail — Compliance">

        <anypoint-mq:subscriber
            config-ref="Anypoint_MQ_Config"
            destination="\${mq.queue.audit}"
            acknowledgementMode="MANUAL"
            maxConcurrency="2"
            doc:name="MQ Subscriber — Audit Queue"/>

        <logger
            level="INFO"
            message='#["[AUDIT] flow=" ++ flow.name ++ " | correlationId=" ++ correlationId ++ " | messageId=" ++ (attributes.messageId default "unknown")]'
            doc:name="Log Audit Event Received"/>

        <!--
            TODO: Implement audit store write.
            Options (choose per compliance framework):
              A. Write to dedicated audit DB table (immutable insert, no UPDATE/DELETE)
              B. Append to S3 with Object Lock (WORM)
              C. Forward to SIEM (Splunk/Datadog) via HTTP connector
              D. Write to Azure Blob with immutability policy

            Audit record MUST include:
              correlationId, eventType, userId (if available),
              timestamp, payload (PII-masked), source system
        -->
        <ee:transform doc:name="Build Audit Record">
            <ee:message>
                <ee:set-payload><![CDATA[%dw 2.0
output application/json
// TODO [COMPLIANCE]: Mask PII before audit write
---
{
    auditId:       correlationId ++ '-' ++ (now() as Number as String),
    correlationId: correlationId,
    timestamp:     now() as String { format: "yyyy-MM-dd'T'HH:mm:ss.SSSZ" },
    environment:   p("mule.env"),
    event:         payload
    // TODO: Add userId, eventType, source system fields
}]]></ee:set-payload>
            </ee:message>
        </ee:transform>

        <!-- TODO: Write to audit store (DB/S3/SIEM) -->

        <anypoint-mq:ack
            ackToken="#[attributes.ackToken]"
            config-ref="Anypoint_MQ_Config"
            doc:name="ACK Audit Message"/>

        <error-handler ref="Global_Error_Handler"/>
    </flow>

</mule>
`;
  writeFile(path.join(outDir, 'src/main/mule/audit-trail-flows.xml'), content);
}

// ─── .devcontainer ────────────────────────────────────────────────────────────

// Generate .devcontainer/devcontainer.json and .devcontainer/post-create.sh
// from the templates in scaffold/devcontainer-templates/.
// The post-create.sh runs silently on first Codespace open:
//   - installs MuleSoft MCP server
//   - configures Claude Code MCP
//   - installs BMAD developer skills
//   - writes Maven settings.xml (Anypoint Exchange repos)
//   - pre-warms Maven dependency cache in background
function genDevContainer(d, outDir) {
  const client       = d.project?.client ?? 'client';
  const domain       = client.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const artifactId   = `${domain}-mule`;
  // Produce a readable display name: "leolabs" → "LeoLabs", "my-client" → "My Client"
  const displayName  = client
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  const tokens = {
    CLIENT_DISPLAY_NAME: displayName,
    ARTIFACT_ID:         artifactId,
  };

  const dcTmplPath   = path.join(DEVCONTAINER_TMPL_DIR, 'devcontainer.json');
  const pcTmplPath   = path.join(DEVCONTAINER_TMPL_DIR, 'post-create.sh');

  if (!fs.existsSync(dcTmplPath) || !fs.existsSync(pcTmplPath)) {
    console.warn('  ⚠  devcontainer templates missing in scaffold/devcontainer-templates/ — skipping .devcontainer generation');
    return;
  }

  writeFile(
    path.join(outDir, '.devcontainer/devcontainer.json'),
    sub(readFile(dcTmplPath), tokens)
  );
  writeFile(
    path.join(outDir, '.devcontainer/post-create.sh'),
    sub(readFile(pcTmplPath), tokens)
  );
}

// ─── Validation Guards ────────────────────────────────────────────────────────

// Log override warnings when decisions.json flags conflict with pattern requirements.
function validateDecisions(d) {
  const pattern   = d.integration?.primaryPattern ?? '';
  const secondary = d.integration?.secondaryPatterns ?? [];
  const scaffold  = d.scaffold ?? {};

  if ((pattern === 'scheduled-sync' || secondary.includes('scheduled-sync')) &&
      scaffold.generateScheduler === false) {
    console.warn('\n⚠  OVERRIDE: scaffold.generateScheduler=false but pattern requires scheduler — generating anyway');
  }

  if (d.scheduling?.watermarking && scaffold.generateWatermark === false) {
    console.warn('\n⚠  OVERRIDE: scheduling.watermarking=true but scaffold.generateWatermark=false — generating watermark');
  }

  if (isAsyncPattern(d) && d.flowControl?.deduplicationEnabled === false) {
    console.warn('\n⚠  WARNING: Async pattern selected but flowControl.deduplicationEnabled is false — idempotency is MANDATORY for all async consumers');
  }

  const ttlHours       = d.flowControl?.messageTtlHours ?? 24;
  const requiredDedup  = ttlHours * 60;
  const configuredDedup = d.flowControl?.deduplicationTtlMinutes;
  if (configuredDedup !== undefined && configuredDedup < requiredDedup) {
    console.warn(`\n⚠  AUTO-CORRECTING: deduplicationTtlMinutes was ${configuredDedup} but messageTtlHours×60 = ${requiredDedup}.`);
    console.warn(`   Idempotency window MUST be ≥ message TTL. Setting deduplicationTtlMinutes = ${requiredDedup}.`);
    console.warn(`   Fix decisions.json flowControl.deduplicationTtlMinutes = ${requiredDedup} to suppress this warning.`);
    if (!d.flowControl) d.flowControl = {};
    d.flowControl.deduplicationTtlMinutes = requiredDedup;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scaffold/generate.js <path/to/decisions.json> [output-dir]');
    console.error('');
    console.error('Examples:');
    console.error('  node scaffold/generate.js projects/leolabs/decisions.json');
    console.error('  node scaffold/generate.js projects/leolabs/decisions.json /custom/output/path');
    process.exit(1);
  }

  const decisionsPath = path.resolve(args[0]);
  if (!fs.existsSync(decisionsPath)) {
    console.error(`Error: decisions.json not found: ${decisionsPath}`);
    process.exit(1);
  }

  let d;
  try {
    d = JSON.parse(readFile(decisionsPath));
  } catch (err) {
    console.error(`Error: Failed to parse decisions.json: ${err.message}`);
    process.exit(1);
  }

  const client = d.project?.client;
  if (!client) {
    console.error('Error: decisions.json missing required field: project.client');
    process.exit(1);
  }

  // Compute scaffold profile if not already set by Architect Agent
  if (!d.scaffold?.profile) {
    const computed = computeProfile(d);
    console.log(`\nProfile: computed → ${computed} (set decisions.json scaffold.profile to override)`);
    if (!d.scaffold) d.scaffold = {};
    d.scaffold.profile = computed;
  } else {
    console.log(`\nProfile: ${d.scaffold.profile} (from decisions.json)`);
  }

  const outDir = args[1] ? path.resolve(args[1]) : `/tmp/${client}-mule`;

  console.log(`Client:  ${client}`);
  console.log(`Output:  ${outDir}`);
  console.log(`Pattern: ${d.integration?.primaryPattern ?? '(not set)'}`);
  console.log(`Flows:   ${(d.integration?.flows ?? []).length}`);
  console.log(`CICD:    ${d.devops?.cicd ?? 'none'}`);
  console.log(`Security: ${d.security?.level ?? 'internal'}`);
  console.log('');

  validateDecisions(d);

  // Load connector registry
  if (!fs.existsSync(REGISTRY_F)) {
    console.error(`Error: Connector registry not found: ${REGISTRY_F}`);
    process.exit(1);
  }
  const registry = JSON.parse(readFile(REGISTRY_F));
  const lookup   = buildRegistryLookup(registry);

  // Load snippets that are actively injected into generated flow files.
  //
  // Snippet injection map:
  //   wire-tap.xml                  → injected into async flows when wireTap.enabled=true (genFlowFile)
  //
  // Snippets NOT loaded here because they live inline in their trigger templates:
  //   idempotency-check.xml         → inline in mq-subscriber.xml and kafka-listener.xml
  //   correlation-id-propagate.xml  → inline in http-listener.xml (set-correlation-id) and mq-subscriber.xml
  //
  // Snippets available in scaffold/xml-templates/snippets/ for developer reference but not
  // auto-injected (patterns that require per-flow configuration decisions):
  //   claim-check-store.xml         → inject manually when payload > 1MB (per-flow decision)
  //   claim-check-retrieve.xml      → inject manually at consumer side
  //   invalid-message-channel-route.xml → inject manually before downstream calls requiring strict validation
  const SNIPPET_NAMES = [
    'wire-tap.xml',
  ];
  const snippets = {};
  for (const name of SNIPPET_NAMES) {
    const p = path.join(TMPL_DIR, 'snippets', name);
    if (fs.existsSync(p)) snippets[name] = readFile(p);
  }

  const coverageFloor = getCoverageFloor(
    d.integration?.primaryPattern,
    d.integration?.secondaryPatterns ?? []
  );
  console.log(`Coverage floor: ${coverageFloor}%`);
  console.log('');
  console.log('Generating files:');

  // ── Project-level files ──────────────────────────────────────────────────
  genPom(d, lookup, outDir);
  genMuleArtifact(d, lookup, outDir);
  genGlobalConfig(d, lookup, outDir);
  genErrorHandler(d, outDir);
  genProperties(d, outDir);
  genDeployYml(d, outDir);
  genDevContainer(d, outDir);

  // ── Regulated/government extras ──────────────────────────────────────────
  const profile = d.scaffold?.profile;
  if (profile === 'regulated') {
    genAuditTrailFlow(d, outDir);
  }

  // ── Per-flow files ───────────────────────────────────────────────────────
  const flows = d.integration?.flows ?? [];
  if (flows.length === 0) {
    console.warn('\n⚠  decisions.json integration.flows[] is empty — no flow files generated');
    console.warn('   Add flow entries with: name, trigger, source, target, layer, description');
  }

  for (const flow of flows) {
    if (!flow.name) {
      console.warn('\n  ⚠  Flow missing "name" field — skipping');
      continue;
    }
    console.log(`\n  Flow: ${flow.name}  trigger=${flow.trigger ?? 'http'}  layer=${flow.layer ?? 'process'}`);
    genFlowFile(flow, d, snippets, outDir, coverageFloor);
    genMunitFile(flow, d, outDir, coverageFloor);
    genDwlFile(flow, d, outDir);
    if ((flow.trigger ?? 'http') === 'http') {
      genOasSpec(flow, d, outDir);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const flowCount  = flows.filter(f => f.name).length;
  const httpFlows  = flows.filter(f => (f.trigger ?? 'http') === 'http' && f.name).length;
  const totalFiles = 6 + (profile === 'regulated' ? 1 : 0)  // project-level
                   + 2                                        // .devcontainer files
                   + flowCount * 3                            // flows + munit + dwl
                   + httpFlows                                // OAS specs
                   + (d.devops?.cicd === 'github-actions' ? 1 : 0);

  // Warn about connectors whose registry version is not a full semver (no patch component).
  // Maven requires exact versions — major.minor versions will fail to resolve on Exchange.
  const approxVersions = [];
  for (const key of d.systems?.connectors ?? []) {
    const conn = lookup[key];
    if (!conn) continue;
    const v = conn.version ?? conn.docVersion ?? '';
    if (v && !/^\d+\.\d+\.\d+/.test(v)) approxVersions.push({ key, v, url: conn.exchangeUrl ?? '' });
  }
  if (approxVersions.length > 0) {
    console.log('');
    console.log('⚠  BEFORE RUNNING mvn compile — verify exact patch versions on Exchange:');
    for (const { key, v, url } of approxVersions) {
      console.log(`   ${key}: "${v}" is approximate → visit ${url || 'Anypoint Exchange'}`);
    }
    console.log('   Update pom.xml with exact versions (e.g. 11.4.0) before compiling.');
  }

  console.log('');
  console.log(`✅ Generation complete — ${totalFiles} files`);
  console.log(`   Project directory: ${outDir}`);
  console.log('');
  const commonsVer = readCommonsVersion();
  console.log('   Next steps for developer:');
  console.log(`   0. Publish commons library (first time only): commons/publish.sh`);
  console.log(`      commons v${commonsVer} must be on Exchange before mvn compile will resolve it`);
  console.log('   1. Complete DataWeave mappings in src/main/resources/dwl/');
  console.log('      Import shared DWL: import toISODate from "dwl/canonical-date.dwl"');
  console.log('      Import PII mask:   import maskPayload from "dwl/pii-mask.dwl"');
  console.log('   2. Fill TODO items in each flows.xml (business-rule TODOs only)');
  console.log('   3. Add connector credentials to dev/uat/prod.yaml properties');
  console.log('      Set notification channels: notifications.slack.webhook.url / notifications.email.to');
  console.log('   4. Run: mvn compile   (compiles against commons + all connectors)');
  console.log('   5. Run: mvn test      (MUnit stubs pass; add field assertions)');
  if (d.devops?.cicd === 'github-actions') {
    console.log('   6. Configure GitHub Actions secrets (see .github/workflows/deploy.yml)');
  }
  if (profile === 'regulated') {
    console.log('   ⚠  Regulated profile: complete audit-trail-flows.xml before go-live');
    console.log('   ⚠  Regulated profile: uncomment Secrets Manager block in global-config.xml');
  }
  console.log('');
  console.log('   Capabilities portal: node scaffold/generate-capabilities.js');
}

main();
