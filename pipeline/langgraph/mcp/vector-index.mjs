/**
 * Knowledge corpus indexer — incremental, cache-backed.
 *
 * Strategy:
 *   - BM25 keyword search by default (no API key, no model download)
 *   - GOOGLE_API_KEY present → Google text-embedding-004 + cosine similarity
 *   - Incremental: compares file mtime against .cache/chunk-manifest.json;
 *     only re-chunks (and re-embeds) files that changed since last run.
 *   - Chunks stored in .cache/chunks-{md5}.json; warm starts load from disk.
 *
 * Chunking:
 *   - Markdown: split by ## headers, further split at 1500 chars
 *   - JSON:     one chunk per top-level key
 *   - YAML:     one chunk per top-level key block
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const CACHE_DIR     = path.join(path.dirname(fileURLToPath(import.meta.url)), '.cache');
const MANIFEST_PATH = path.join(CACHE_DIR, 'chunk-manifest.json');
const EMBED_CACHE   = path.join(CACHE_DIR, 'embeddings.json');
const CHUNK_MAX     = 1500; // chars ≈ 400 tokens

// ── Filesystem helpers ───────────────────────────────────────────────────────

function walkDir(dir, exts) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkDir(full, exts));
    else if (exts.includes(path.extname(entry.name).toLowerCase())) results.push(full);
  }
  return results;
}

function pathKey(absPath) {
  return crypto.createHash('md5').update(absPath).digest('hex');
}

function chunkCachePath(absPath) {
  return path.join(CACHE_DIR, `chunks-${pathKey(absPath)}.json`);
}

// ── Chunking ─────────────────────────────────────────────────────────────────

function chunkMarkdown(content, source) {
  const parts = content.split(/^(#{1,3} .+)$/m);
  const chunks = [];
  let header = '';
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (/^#{1,3} /.test(trimmed)) { header = trimmed; continue; }
    for (let i = 0; i < trimmed.length; i += CHUNK_MAX) {
      chunks.push({ source, chunk: `${header}\n${trimmed.slice(i, i + CHUNK_MAX)}`.trim() });
    }
  }
  return chunks.length ? chunks : [{ source, chunk: content.slice(0, CHUNK_MAX) }];
}

function chunkJson(content, source) {
  try {
    const obj = JSON.parse(content);
    if (Array.isArray(obj)) {
      const out = [];
      for (let i = 0; i < obj.length; i += 5)
        out.push({ source, chunk: JSON.stringify(obj.slice(i, i + 5), null, 2).slice(0, CHUNK_MAX) });
      return out;
    }
    return Object.entries(obj).map(([k, v]) => ({
      source,
      chunk: `${k}: ${JSON.stringify(v, null, 2)}`.slice(0, CHUNK_MAX),
    }));
  } catch {
    return [{ source, chunk: content.slice(0, CHUNK_MAX) }];
  }
}

function chunkYaml(content, source) {
  const lines = content.split('\n');
  const sections = [];
  let current = [];
  for (const line of lines) {
    if (/^\S/.test(line) && current.length > 0) { sections.push(current.join('\n')); current = []; }
    current.push(line);
  }
  if (current.length) sections.push(current.join('\n'));
  return sections.filter(s => s.trim()).map(s => ({ source, chunk: s.slice(0, CHUNK_MAX) }));
}

function chunkFile(content, absPath, root) {
  const source = path.relative(root, absPath);
  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.md')   return chunkMarkdown(content, source);
  if (ext === '.json') return chunkJson(content, source);
  if (ext === '.yaml' || ext === '.yml') return chunkYaml(content, source);
  return [{ source, chunk: content.slice(0, CHUNK_MAX) }];
}

// ── Incremental loader ────────────────────────────────────────────────────────

function loadManifest() {
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch { return {}; }
}

function saveManifest(manifest) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function loadCachedChunks(absPath) {
  const p = chunkCachePath(absPath);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function saveCachedChunks(absPath, chunks) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(chunkCachePath(absPath), JSON.stringify(chunks));
}

// ── BM25 ─────────────────────────────────────────────────────────────────────

function tokenize(text) { return text.toLowerCase().match(/\w+/g) || []; }

function bm25(query, indexedChunks, k1 = 1.5, b = 0.75) {
  const qTokens = tokenize(query);
  const avgLen  = indexedChunks.reduce((s, c) => s + c.tokens.length, 0) / (indexedChunks.length || 1);

  // Per-token document frequency (cached on index)
  const df = {};
  for (const c of indexedChunks) {
    const seen = new Set(c.tokens);
    for (const t of seen) df[t] = (df[t] || 0) + 1;
  }

  return indexedChunks.map(c => {
    const freq = {};
    for (const t of c.tokens) freq[t] = (freq[t] || 0) + 1;
    let score = 0;
    for (const qt of qTokens) {
      const tf  = freq[qt] || 0;
      if (!tf) continue;
      const idf = Math.log((indexedChunks.length + 1) / ((df[qt] || 0) + 1));
      score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * c.tokens.length / avgLen));
    }
    return { ...c, score };
  });
}

// ── Google Embeddings ─────────────────────────────────────────────────────────

async function embedChunks(rawChunks) {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const model = genai.getGenerativeModel({ model: 'text-embedding-004' });

  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(EMBED_CACHE, 'utf8')); } catch {}

  let newCount = 0;
  const embedded = [];
  for (const c of rawChunks) {
    const hash = crypto.createHash('md5').update(c.chunk).digest('hex');
    let embedding = cache[hash];
    if (!embedding) {
      const r = await model.embedContent(c.chunk);
      embedding = r.embedding.values;
      cache[hash] = embedding;
      newCount++;
    }
    embedded.push({ ...c, embedding });
  }

  if (newCount > 0) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(EMBED_CACHE, JSON.stringify(cache));
    console.error(`[mcp] Embedded ${newCount} new chunks (total cached: ${Object.keys(cache).length})`);
  }
  return embedded;
}

function cosine(a, b) {
  let dot = 0, mA = 0, mB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; mA += a[i] * a[i]; mB += b[i] * b[i]; }
  return dot / (Math.sqrt(mA) * Math.sqrt(mB) + 1e-8);
}

// ── Module state ──────────────────────────────────────────────────────────────

let _indexedChunks  = []; // { source, chunk, tokens }
let _embeddedChunks = null; // { source, chunk, embedding } — set if GOOGLE_API_KEY

// ── Public API ────────────────────────────────────────────────────────────────

export async function buildIndex(root, knowledgeDirs) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const exts     = ['.md', '.json', '.yaml', '.yml'];
  const manifest = loadManifest();
  const updated  = { ...manifest };
  const rawChunks = [];
  let   hits = 0, misses = 0;

  for (const dir of knowledgeDirs) {
    const files = walkDir(path.join(root, dir), exts);
    for (const absPath of files) {
      const mtime = fs.statSync(absPath).mtimeMs;
      const entry = manifest[absPath];

      if (entry && entry.mtime === mtime) {
        // Cache hit — load pre-chunked data
        const cached = loadCachedChunks(absPath);
        if (cached) { rawChunks.push(...cached); hits++; continue; }
      }

      // Cache miss — re-chunk
      try {
        const content = fs.readFileSync(absPath, 'utf8');
        const chunks  = chunkFile(content, absPath, root);
        saveCachedChunks(absPath, chunks);
        updated[absPath] = { mtime, chunkCount: chunks.length };
        rawChunks.push(...chunks);
        misses++;
      } catch { /* skip unreadable files */ }
    }
  }

  saveManifest(updated);
  console.error(`[mcp] Index: ${rawChunks.length} chunks — ${hits} files from cache, ${misses} re-chunked`);

  _indexedChunks = rawChunks.map(c => ({ ...c, tokens: tokenize(c.chunk) }));

  if (process.env.GOOGLE_API_KEY) {
    try {
      _embeddedChunks = await embedChunks(rawChunks);
      console.error(`[mcp] Embedding mode active (${_embeddedChunks.length} chunks)`);
    } catch (err) {
      console.error(`[mcp] Embedding failed, falling back to BM25: ${err.message}`);
      _embeddedChunks = null;
    }
  } else {
    console.error('[mcp] BM25 mode (set GOOGLE_API_KEY to enable semantic search)');
  }
}

export async function search(query, topK = 5) {
  if (_embeddedChunks) {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genai.getGenerativeModel({ model: 'text-embedding-004' });
    const r = await model.embedContent(query);
    const qEmb = r.embedding.values;
    return _embeddedChunks
      .map(c => ({ source: c.source, chunk: c.chunk, score: cosine(qEmb, c.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  return bm25(query, _indexedChunks)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ source, chunk, score }) => ({ source, chunk, score }));
}
