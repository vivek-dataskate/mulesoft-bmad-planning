#!/usr/bin/env node
'use strict';

/**
 * probe-api-schemas.js — zero-LLM API field discovery
 *
 * For each system in rex.json where GET endpoints are confirmed AND credentials
 * exist in projects/{client}/credentials.json, makes a live HTTP GET call,
 * parses the response schema (field names + types), and writes confirmed field
 * names back to:
 *   projects/{client}/scoping/run/api-schemas.json
 *
 * If intake-content.json exists, patches Section 3 field mapping tables to
 * replace [INFERRED] source fields with API-confirmed names, then rebuilds HTML.
 *
 * Usage:
 *   node pipeline/scripts/probe-api-schemas.js --client peerless
 *   node pipeline/scripts/probe-api-schemas.js --client peerless --dry-run
 *
 * credentials.json shape (never commit — add to .gitignore):
 * {
 *   "hd-portal":    { "apiKey": "...", "baseUrl": "https://..." },
 *   "salesforce":   { "instanceUrl": "https://...", "accessToken": "..." },
 *   "computerease": { "baseUrl": "https://relay.deltek.com/...", "username": "...", "password": "..." },
 *   "mulesoft-idp": { "accessToken": "...", "orgId": "..." }
 * }
 */

const fs            = require('fs');
const path          = require('path');
const https         = require('https');
const http          = require('http');
const { spawnSync } = require('child_process');

const ROOT         = path.resolve(__dirname, '../..');
const PROJECTS_DIR = path.join(ROOT, 'projects');

// ─── CLI Args ──────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const getArg   = flag => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const getFlag  = flag => args.includes(flag);

const clientSlug = getArg('--client');
const dryRun     = getFlag('--dry-run');

if (!clientSlug) {
  console.error('Usage: node pipeline/scripts/probe-api-schemas.js --client <slug> [--dry-run]');
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
}

function ok(msg)   { console.log(`  ✓  ${msg}`); }
function skip(msg) { console.log(`  ↳  ${msg}`); }
function warn(msg) { console.log(`  ⚠  ${msg}`); }

// Flatten a nested object into dot-notation field paths, max depth 3.
function flattenFields(obj, prefix = '', depth = 0) {
  if (depth > 3 || typeof obj !== 'object' || obj === null || Array.isArray(obj)) return [];
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    const type = Array.isArray(v) ? 'array' : typeof v;
    const leaf = { field: key, type, example: Array.isArray(v) ? `[${v.length} items]` : String(v).slice(0, 60) };
    return [leaf, ...flattenFields(v, key, depth + 1)];
  });
}

// Make a simple HTTP/HTTPS GET and return parsed JSON body (or null on error).
function httpGet(urlStr, headers = {}) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(urlStr);
      const mod    = parsed.protocol === 'https:' ? https : http;
      const req = mod.request({
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.pathname + parsed.search,
        method:   'GET',
        headers:  { 'Accept': 'application/json', 'User-Agent': 'DataSkate-Probe/1.0', ...headers },
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
          catch { resolve({ status: res.statusCode, body: null, raw: body.slice(0, 200) }); }
        });
      });
      req.on('error', e => resolve({ status: 0, error: e.message }));
      req.setTimeout(10000, () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
      req.end();
    } catch (e) {
      resolve({ status: 0, error: e.message });
    }
  });
}

// ─── Per-system probers ────────────────────────────────────────────────────────

/**
 * HD Portal — proprietary REST API, API key auth.
 * Attempts GET on a sample lead to discover real field names.
 * testLeadId comes from credentials.json (architect supplies a safe test F-number).
 */
async function probeHdPortal(creds, rexSystem) {
  if (!creds.apiKey || !creds.baseUrl) return { status: 'missing-credentials', fields: [] };
  const testLeadId = creds.testLeadId || 'test';
  const url = `${creds.baseUrl}/leads/${testLeadId}`;
  const res = await httpGet(url, { 'Authorization': `ApiKey ${creds.apiKey}` });
  if (res.status === 200 && res.body) {
    const fields = flattenFields(res.body);
    return { status: 'confirmed', httpStatus: res.status, sampleUrl: url, fields };
  }
  if (res.status === 404) {
    // 404 means the endpoint exists but the test lead ID is invalid — endpoint confirmed
    return { status: 'endpoint-confirmed-no-sample', httpStatus: res.status, note: 'Endpoint live but test lead ID not found. Provide a valid testLeadId in credentials.json.', fields: [] };
  }
  return { status: 'failed', httpStatus: res.status || 0, error: res.error || res.raw, fields: [] };
}

/**
 * Salesforce — REST API, access token auth (architect pre-fetches token for probe).
 * Describes the Lead object to get confirmed field names.
 */
async function probeSalesforce(creds) {
  if (!creds.instanceUrl || !creds.accessToken) return { status: 'missing-credentials', fields: [] };
  const url = `${creds.instanceUrl}/services/data/v59.0/sobjects/Lead/describe`;
  const res = await httpGet(url, { 'Authorization': `Bearer ${creds.accessToken}` });
  if (res.status === 200 && res.body && res.body.fields) {
    const fields = res.body.fields.map(f => ({ field: f.name, type: f.type, label: f.label }));
    return { status: 'confirmed', httpStatus: res.status, sampleUrl: url, fields };
  }
  return { status: 'failed', httpStatus: res.status || 0, error: res.error, fields: [] };
}

/**
 * ComputerEase via CE Live Service relay — Basic auth.
 * Attempts GET /jobs to list available job fields.
 */
async function probeComputerEase(creds) {
  if (!creds.baseUrl || !creds.username || !creds.password) return { status: 'missing-credentials', fields: [] };
  const b64 = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
  const url = `${creds.baseUrl}/jobs?limit=1`;
  const res = await httpGet(url, { 'Authorization': `Basic ${b64}` });
  if (res.status === 200 && res.body) {
    const sample = Array.isArray(res.body) ? res.body[0] : res.body;
    const fields = sample ? flattenFields(sample) : [];
    return { status: 'confirmed', httpStatus: res.status, sampleUrl: url, fields };
  }
  return { status: 'failed', httpStatus: res.status || 0, error: res.error || res.raw, fields: [] };
}

/**
 * MuleSoft IDP — OAuth 2.0 Client Credentials.
 * Lists published IDP actions to confirm org ID and action IDs.
 */
async function probeMulesoftIdp(creds) {
  if (!creds.orgId || !creds.accessToken) return { status: 'missing-credentials', fields: [] };
  const region = creds.region || 'us-east-1';
  const url = `https://idp-rt.${region}.anypoint.mulesoft.com/api/v1/organizations/${creds.orgId}/actions`;
  const res = await httpGet(url, { 'Authorization': `Bearer ${creds.accessToken}` });
  if (res.status === 200 && res.body) {
    const actions = Array.isArray(res.body) ? res.body : (res.body.actions || []);
    const fields = actions.map(a => ({ field: a.id || a.actionId, type: 'idp-action', label: a.name || a.actionName || '(unnamed)' }));
    return { status: 'confirmed', httpStatus: res.status, sampleUrl: url, fields };
  }
  return { status: 'failed', httpStatus: res.status || 0, error: res.error, fields: [] };
}

// ─── Intake patch ─────────────────────────────────────────────────────────────
// Patches intake-content.json field mapping tables: for each confirmed system,
// adds an [API-CONFIRMED] annotation to field names that match confirmed API fields.

function patchIntakeFieldMappings(projectDir, apiSchemas) {
  const intakePath = path.join(projectDir, 'intake', 'intake-content.json');
  if (!fs.existsSync(intakePath)) { skip('intake-content.json not found — skipping patch'); return false; }

  const intake = readJson(intakePath);
  let patched = false;

  for (const [system, schema] of Object.entries(apiSchemas)) {
    if (schema.status !== 'confirmed' || !schema.fields?.length) continue;
    const confirmedNames = new Set(schema.fields.map(f => f.field));

    // For each section bodyHtml, annotate matching field names in table cells
    for (const section of intake.sections) {
      const before = section.bodyHtml;
      section.bodyHtml = section.bodyHtml.replace(
        /<td>([^<]{2,60})<\/td>/g,
        (match, cell) => {
          const trimmed = cell.trim();
          // Check if any confirmed API field name appears in this cell
          for (const name of confirmedNames) {
            if (trimmed === name || trimmed.startsWith(name + '.') || trimmed.endsWith('.' + name)) {
              if (!trimmed.includes('[API-CONFIRMED]')) {
                patched = true;
                return `<td>${trimmed} <span style="font-size:9px;color:#065F46;background:#D1FAE5;padding:1px 5px;border-radius:3px;font-weight:600;">API-CONFIRMED</span></td>`;
              }
            }
          }
          return match;
        }
      );
    }
  }

  if (patched) {
    if (!dryRun) writeJson(intakePath, intake);
    ok(`intake-content.json patched with API-CONFIRMED annotations${dryRun ? ' (dry-run)' : ''}`);
  } else {
    skip('intake-content.json — no field name matches to annotate');
  }
  return patched;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\nprobe-api-schemas — client: ${clientSlug}${dryRun ? ' (DRY RUN)' : ''}\n`);

  const projectDir    = path.join(PROJECTS_DIR, clientSlug);
  const rexPath       = path.join(projectDir, 'scoping', 'run', 'rex.json');
  const credsPath     = path.join(projectDir, 'credentials.json');
  const schemasOut    = path.join(projectDir, 'scoping', 'run', 'api-schemas.json');

  const rex   = readJson(rexPath);
  const creds = readJson(credsPath);

  if (!rex) { console.error(`rex.json not found at ${rexPath}`); process.exit(1); }
  if (!creds) {
    skip(`No credentials.json found at ${credsPath}`);
    console.log(`\n  Create ${credsPath} with keys per system to enable live probing.`);
    console.log('  Example shape:\n  {\n    "hd-portal": { "apiKey": "...", "baseUrl": "https://...", "testLeadId": "F-12345" },\n    "salesforce": { "instanceUrl": "https://...", "accessToken": "..." }\n  }\n');
    process.exit(0);
  }

  const probers = {
    'hd-portal':        (c, sys) => probeHdPortal(c, sys),
    'salesforce':       (c)      => probeSalesforce(c),
    'computerease':     (c)      => probeComputerEase(c),
    'mulesoft-forge-idp': (c)    => probeMulesoftIdp(c),
    'mulesoft-idp':     (c)      => probeMulesoftIdp(c),
  };

  const results = {};

  for (const sys of (rex.systems || [])) {
    const key = sys.connectorKey;
    if (!key) { skip(`${sys.name} — no connectorKey, skipping`); continue; }

    const prober  = probers[key];
    const sysCreds = creds[key];

    if (!prober) { skip(`${sys.name} — no prober implemented for key "${key}"`); continue; }
    if (!sysCreds) { skip(`${sys.name} — no credentials in credentials.json for key "${key}"`); continue; }

    console.log(`  Probing ${sys.name}...`);
    try {
      const result = await prober(sysCreds, sys);
      results[key] = {
        system:   sys.name,
        probedAt: new Date().toISOString(),
        authType: sys.authType,
        ...result,
      };

      if (result.status === 'confirmed') {
        ok(`${sys.name} — ${result.fields.length} fields confirmed from live API`);
      } else if (result.status === 'endpoint-confirmed-no-sample') {
        warn(`${sys.name} — endpoint live but no sample: ${result.note}`);
      } else if (result.status === 'missing-credentials') {
        skip(`${sys.name} — credentials present in credentials.json but incomplete`);
      } else {
        warn(`${sys.name} — probe failed (HTTP ${result.httpStatus}): ${result.error || ''}`);
      }
    } catch (e) {
      warn(`${sys.name} — unexpected error: ${e.message}`);
      results[key] = { system: sys.name, status: 'error', error: e.message, fields: [] };
    }
  }

  // Write api-schemas.json
  if (!dryRun) writeJson(schemasOut, { client: clientSlug, probedAt: new Date().toISOString(), systems: results });
  ok(`api-schemas.json written to ${schemasOut}${dryRun ? ' (dry-run)' : ''}`);

  // Patch intake field mapping tables
  const patched = patchIntakeFieldMappings(projectDir, results);

  // Rebuild HTML if anything was patched
  if (patched && !dryRun) {
    console.log('\n  Rebuilding HTML...');
    const build = spawnSync('npm', ['run', 'build:html'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    if (build.status === 0) {
      ok('HTML rebuilt');
      // Sync to public/
      const src  = path.join(ROOT, 'portal', '_build', 'intake', `intake-questionnaire-${clientSlug}.html`);
      const dest = path.join(ROOT, 'portal', 'public', 'intake', `${clientSlug}.html`);
      if (fs.existsSync(src)) { fs.copyFileSync(src, dest); ok(`portal/public/intake/${clientSlug}.html synced`); }
    } else {
      warn(`HTML build failed: ${(build.stderr || '').slice(0, 200)}`);
    }
  }

  console.log('\nDone.\n');
})();
