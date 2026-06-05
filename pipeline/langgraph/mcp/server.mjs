#!/usr/bin/env node
/**
 * Scout Knowledge — MCP stdio server
 *
 * Seven tools for pipeline agents:
 *   search_knowledge     — BM25 or vector search over the indexed corpus
 *   read_stage           — read this agent's own pre-assembled stage file
 *   read_resource        — read a small structured reference file by name
 *   read_client_artifact — read a generated client content JSON (Mira audit use)
 *   lookup_connectors    — look up specific connector entries by key (replaces query-connector.py)
 *   list_scoping_files   — list readable text files in the client scoping directory (Sage only)
 *   read_scoping_file    — read a specific scoping text file by relative path (Sage only)
 *
 * Usage (spawned by client.mjs — not invoked manually):
 *   node pipeline/langgraph/mcp/server.mjs --client peerless --root /path/to/repo
 *
 * Can also be registered in .claude/settings.json as an MCP server for
 * direct use in Claude Code sessions.
 */
import { Server }               from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import path         from 'path';
import fs           from 'fs';
import { fileURLToPath } from 'url';
import { buildIndex, search } from './vector-index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const get        = (f) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : null; };
const clientSlug = get('--client') || 'unknown';
const ROOT       = get('--root')   || path.resolve(__dirname, '../../..');

// Validate clientSlug — must be a simple slug (no path separators, no dots)
// Prevents path traversal via --client ../../../etc
const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/i;
if (clientSlug !== 'unknown' && !SLUG_RE.test(clientSlug)) {
  console.error(`[mcp] ERROR: invalid --client "${clientSlug}" — must be alphanumeric with hyphens/underscores only`);
  process.exit(1);
}

// ── Knowledge corpus directories ─────────────────────────────────────────────
const KNOWLEDGE_DIRS = [
  'commons/docs',
  'commons/agent-refs',
  'mulesoft/playbooks',
  'mulesoft/canonical-models',
  'pipeline/scout/graph',       // Vera: vertical nodes, FOMO use case library
];

// ── Small structured refs exposed via read_resource ──────────────────────────
const STATIC_RESOURCES = {
  'pricing-model':       'commons/sales/pricing-model.json',
  'competitors':         'commons/branding/competitors.json',
  'psychology-profiles': 'commons/sales/psychology-profiles.json',
  'proposal-structure':  'pipeline/doc-templates/proposal-structure.md',
  'connector-names':     'mulesoft/connector-names.json',        // Rex/Sage: system name → connector key matching
  'reference-network':   'commons/sales/reference-network.json', // Vera: credentialing anchors (competitive-evaluation signal)
  'client-registry':     'projects/client-registry.json',        // Vera: resolve reference client details
  'intake-layout':       'portal/_includes/layouts/intake.njk',  // Quinn: canonical intake layout reference
  'pricing-model-doc':   'commons/sales/pricing-model.md',       // Quinn: pricing model terms for summary prose
};

// ── Scoping file access (Sage only) ──────────────────────────────────────────
const SCOPING_TEXT_EXTENSIONS = new Set(['.txt', '.md', '.json', '.yaml', '.yml', '.csv', '.html']);
const SCOPING_SKIP_DIRS       = new Set(['run', 'diagrams', '.git']); // checked case-insensitively
const SCOPING_MAX_BYTES       = 5 * 1024 * 1024; // 5 MB — prevent OOM from large CSVs or HTML exports

function listScopingFiles() {
  const scopingDir = path.join(ROOT, 'projects', clientSlug, 'scoping');
  if (!fs.existsSync(scopingDir)) return [];

  const results = [];
  function walk(dir, rel) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SCOPING_SKIP_DIRS.has(entry.name.toLowerCase()))
          walk(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (SCOPING_TEXT_EXTENSIONS.has(ext))
          results.push(rel ? `${rel}/${entry.name}` : entry.name);
      }
    }
  }
  walk(scopingDir, '');
  return results;
}

// ── Connector registry lookup (replaces query-connector.py) ──────────────────
let _connectorRegistry = null;

function getConnectorRegistry() {
  if (!_connectorRegistry) {
    const registryPath = path.join(ROOT, 'mulesoft/connector-registry.json');
    if (!fs.existsSync(registryPath)) return null;
    try {
      _connectorRegistry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    } catch (e) {
      return null; // malformed JSON — caller gets "not found" response; don't cache the failure
    }
  }
  return _connectorRegistry;
}

function lookupConnectorKeys(keys) {
  const registry = getConnectorRegistry();
  if (!registry) return { error: 'connector-registry.json not found' };
  const results = {};
  for (const key of keys) {
    for (const [, catVal] of Object.entries(registry.categories || {})) {
      if (catVal.connectors?.[key]) {
        results[key] = { ...catVal.connectors[key] };
        break;
      }
    }
    if (!results[key]) results[key] = null; // not found
  }
  return results;
}

// ── Tool definitions (JSON Schema) ───────────────────────────────────────────
const TOOLS = [
  {
    name:        'search_knowledge',
    description: 'Search the knowledge corpus — planning context, field knowledge, playbooks, canonical models, design standards, patterns, agent refs. Use this for any domain question instead of reading full files.',
    inputSchema: {
      type:       'object',
      properties: {
        query: { type: 'string', description: 'What you want to know' },
        top_k: { type: 'number', description: 'Number of results to return (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name:        'read_stage',
    description: "Read this agent's pre-assembled stage file — the only agent-specific data source. Contains client context distilled for this agent.",
    inputSchema: {
      type:       'object',
      properties: {
        agent_slug: { type: 'string', description: 'The agent slug, e.g. hawk, vera, rex' },
      },
      required: ['agent_slug'],
    },
  },
  {
    name:        'read_resource',
    description: `Read a small structured reference file by name. Available: ${Object.keys(STATIC_RESOURCES).join(', ')}.`,
    inputSchema: {
      type:       'object',
      properties: {
        name: { type: 'string', description: `Resource name. One of: ${Object.keys(STATIC_RESOURCES).join(', ')}` },
      },
      required: ['name'],
    },
  },
  {
    name:        'read_client_artifact',
    description: 'Read a generated client content file by name. Available: proposal-content, intake-content, integration-deck-content, corporate-brief-content. Used by Mira to audit rendered content before finalizing.',
    inputSchema: {
      type:       'object',
      properties: {
        name: {
          type:        'string',
          description: 'Artifact name. One of: proposal-content, intake-content, integration-deck-content, corporate-brief-content',
        },
      },
      required: ['name'],
    },
  },
  {
    name:        'list_scoping_files',
    description: 'List all readable text files in the client scoping directory (excludes run/, diagrams/, and binaries). Sage uses this to discover what source documents are available before reading them.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name:        'read_scoping_file',
    description: 'Read a specific text file from the client scoping directory by its relative path (as returned by list_scoping_files). Only text files are accessible. Sage uses this to read transcripts and extracted text documents.',
    inputSchema: {
      type:       'object',
      properties: {
        filename: { type: 'string', description: 'Relative path within scoping/, e.g. "transcript.txt" or "Krisp/meeting.txt"' },
      },
      required: ['filename'],
    },
  },
  {
    name:        'lookup_connectors',
    description: 'Look up specific connector entries from the registry by key — returns auth type, authOptions, notes, configTemplate, gotchas. Use AFTER system inference when connector keys are known. Never loads the full registry. Example: lookup_connectors(["salesforce", "netsuite"])',
    inputSchema: {
      type:       'object',
      properties: {
        keys: {
          type:        'array',
          items:       { type: 'string' },
          description: 'Connector keys to look up, e.g. ["salesforce", "netsuite", "shopify"]',
        },
      },
      required: ['keys'],
    },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handleSearchKnowledge({ query, top_k = 5 }) {
  const results = await search(query, top_k);
  if (!results.length) return 'No results found for that query.';
  return results.map((r, i) =>
    `[${i + 1}] ${r.source} (score: ${r.score.toFixed(3)})\n${r.chunk}`
  ).join('\n\n---\n\n');
}

const KNOWN_AGENT_SLUGS = new Set(['sage','vera','rex','ivy','flo','hawk','petra','quinn','mira','sol','drew']);

function handleReadStage({ agent_slug }) {
  if (!agent_slug || !SLUG_RE.test(agent_slug))
    return `ERROR: invalid agent_slug "${agent_slug}" — must be alphanumeric with hyphens/underscores only`;
  const stagePath = path.join(ROOT, 'projects', clientSlug, 'scoping/run', `${agent_slug}-stage.json`);
  if (!fs.existsSync(stagePath))
    return `ERROR: Stage file not found: projects/${clientSlug}/scoping/run/${agent_slug}-stage.json`;
  return fs.readFileSync(stagePath, 'utf8');
}

function handleReadResource({ name }) {
  const rel = STATIC_RESOURCES[name];
  if (!rel) return `Unknown resource "${name}". Available: ${Object.keys(STATIC_RESOURCES).join(', ')}`;
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return `ERROR: Resource file not found: ${rel}`;
  return fs.readFileSync(abs, 'utf8');
}

const CLIENT_ARTIFACTS = {
  'proposal-content':        'intake/proposal-content.json',
  'intake-content':          'intake/intake-content.json',
  'integration-deck-content': 'intake/integration-deck-content.json',
  'corporate-brief-content': 'intake/corporate-brief-content.json',
};

function handleReadClientArtifact({ name }) {
  const rel = CLIENT_ARTIFACTS[name];
  if (!rel) return `Unknown artifact "${name}". Available: ${Object.keys(CLIENT_ARTIFACTS).join(', ')}`;
  const abs = path.join(ROOT, 'projects', clientSlug, rel);
  if (!fs.existsSync(abs)) return `File not found: projects/${clientSlug}/${rel} — may not have been generated yet.`;
  return fs.readFileSync(abs, 'utf8');
}

function handleListScopingFiles() {
  const files = listScopingFiles();
  if (!files.length) return `No readable text files found in projects/${clientSlug}/scoping/ (excluding run/ and diagrams/).`;
  return `Text files in projects/${clientSlug}/scoping/:\n${files.map(f => `  ${f}`).join('\n')}`;
}

function handleReadScopingFile({ filename }) {
  if (!filename || typeof filename !== 'string')
    return 'ERROR: filename is required';

  // Sanitize: reject path traversal
  const normalized = path.normalize(filename).replace(/^(\.\.\/)+/, '');
  if (normalized.startsWith('..') || path.isAbsolute(normalized))
    return 'ERROR: invalid filename — path traversal not allowed';

  // Reject run/ and diagrams/ subdirectories — case-insensitive to defeat capitalisation bypasses
  const firstSegment = normalized.split(path.sep)[0].toLowerCase();
  if (SCOPING_SKIP_DIRS.has(firstSegment))
    return `ERROR: "${normalized.split(path.sep)[0]}/" is not accessible via read_scoping_file`;

  const ext = path.extname(normalized).toLowerCase();
  if (!SCOPING_TEXT_EXTENSIONS.has(ext))
    return `ERROR: "${normalized}" is not a readable text file (extension ${ext || 'none'} not allowed)`;

  const abs = path.join(ROOT, 'projects', clientSlug, 'scoping', normalized);
  if (!fs.existsSync(abs))
    return `ERROR: File not found: projects/${clientSlug}/scoping/${normalized}`;

  const { size } = fs.statSync(abs);
  if (size > SCOPING_MAX_BYTES)
    return `ERROR: "${normalized}" is ${(size / 1024 / 1024).toFixed(1)} MB — exceeds 5 MB limit. Use search_knowledge instead.`;

  return fs.readFileSync(abs, 'utf8');
}

// ── Server setup ──────────────────────────────────────────────────────────────

async function main() {
  console.error(`[mcp] Building index for client=${clientSlug} root=${ROOT}`);
  await buildIndex(ROOT, KNOWLEDGE_DIRS);

  const server = new Server(
    { name: 'scout-knowledge', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const args = rawArgs || {};

    let text;
    try {
      if (name === 'search_knowledge')         text = await handleSearchKnowledge(args);
      else if (name === 'read_stage')           text = handleReadStage(args);
      else if (name === 'read_resource')        text = handleReadResource(args);
      else if (name === 'read_client_artifact') text = handleReadClientArtifact(args);
      else if (name === 'list_scoping_files')   text = handleListScopingFiles();
      else if (name === 'read_scoping_file')    text = handleReadScopingFile(args);
      else if (name === 'lookup_connectors')    text = JSON.stringify(lookupConnectorKeys(args.keys || []), null, 2);
      else text = `Unknown tool: ${name}`;
    } catch (err) {
      text = `ERROR in ${name}: ${err.message}`;
    }

    return { content: [{ type: 'text', text }] };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[mcp] Server ready');
}

main().catch(err => {
  console.error('[mcp] Fatal:', err.message);
  process.exit(1);
});
