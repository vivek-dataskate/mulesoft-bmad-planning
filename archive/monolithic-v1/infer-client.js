'use strict';
/**
 * DSPipeline — AI Client Name Inference
 *
 * Reads extracted .txt files from _inbox/ and asks Gemini Flash to identify
 * the client company name. Called by orchestrate.js before project creation.
 *
 * Returns: { displayName, source, geminiCost, geminiTokens }
 *   source: 'ai-inference' | 'filename' | null
 *
 * Falls back to filename-based inference if GEMINI_API_KEY is not set or the
 * API call fails. Returns { displayName: null, source: null } if nothing works.
 */

const fs   = require('fs');
const path = require('path');

// ── Terminal colours ──────────────────────────────────────────────────────────
function dim(s)    { return `\x1b[2m${s}\x1b[0m`; }
function green(s)  { return `\x1b[32m${s}\x1b[0m`; }
function cyan(s)   { return `\x1b[36m${s}\x1b[0m`; }
function yellow(s) { return `\x1b[33m${s}\x1b[0m`; }
function bold(s)   { return `\x1b[1m${s}\x1b[0m`; }

// ── Gemini cost calculation ───────────────────────────────────────────────────
const PRICING_PATH    = path.join(__dirname, '../telemetry/model-pricing.json');
const GEMINI_KEY      = 'gemini-2.5-flash';

function calcGeminiCost(inputTokens, outputTokens) {
  let p = { input: 0.075, output: 0.30 };
  try { p = (JSON.parse(fs.readFileSync(PRICING_PATH, 'utf8')))[GEMINI_KEY] || p; } catch { /* use defaults */ }
  return ((inputTokens * p.input + outputTokens * p.output) / 1_000_000).toFixed(6);
}

const MAX_CHARS_PER_FILE = 4000;
const MAX_FILES          = 3;

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function filenameInference(inboxDir) {
  if (!fs.existsSync(inboxDir)) return { displayName: null, source: null };
  const files = fs.readdirSync(inboxDir).filter(f => f !== '.gitkeep' && !f.startsWith('.'));
  if (!files.length) return { displayName: null, source: null };
  const base = path.basename(files[0], path.extname(files[0]));
  const cleaned = base
    .replace(/[-_]?(scoping|call|meeting|transcript|notes|proposal|intake|deck)[-_]?/gi, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!cleaned) return { displayName: null, source: null };
  const displayName = cleaned.replace(/\b\w/g, c => c.toUpperCase());
  console.log(`  ${dim('Client inferred from filename:')} ${cyan(displayName)}`);
  return { displayName, source: 'filename' };
}

async function inferClientWithAI(inboxDir) {
  if (!fs.existsSync(inboxDir)) return { displayName: null, source: null };

  const txtFiles = fs.readdirSync(inboxDir)
    .filter(f => f.endsWith('.txt') && !f.startsWith('.'))
    .slice(0, MAX_FILES);

  if (!txtFiles.length) {
    console.log(`  ${dim('No .txt files in _inbox/ — skipping Gemini inference, trying filename')}`);
    return filenameInference(inboxDir);
  }

  // Build context: first N chars from each file
  const excerpts = txtFiles.map(f => {
    const content = fs.readFileSync(path.join(inboxDir, f), 'utf8');
    return `--- ${f} ---\n${content.slice(0, MAX_CHARS_PER_FILE)}`;
  }).join('\n\n');

  if (!process.env.GEMINI_API_KEY) {
    console.log(`  ${yellow('⚠')}  GEMINI_API_KEY not set — skipping AI inference, trying filename`);
    return filenameInference(inboxDir);
  }

  console.log(`  Calling ${bold('Gemini 2.5 Flash')} to identify client name from ${txtFiles.length} file(s)...`);

  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are reading excerpts from scoping call transcripts or project documents for a software integration consultancy.

Your job: identify the CLIENT company name — the company hiring the consultancy, NOT the consultancy itself (DataSkate).

Rules:
- Return ONLY the company's proper name as it appears in the text (e.g. "AgileMind", "MRN Healthcare", "Zyris")
- Do NOT return: DataSkate, MuleSoft, Salesforce, NetSuite, or any software vendor name
- If multiple company names appear, pick the one that is clearly the client (the one with a business problem to solve)
- If you cannot determine the company name with confidence, return null

Respond with valid JSON only, no markdown:
{"displayName": "<Company Name>" | null}

Documents:
${excerpts}`;

    const result = await model.generateContent(prompt);
    const text   = result.response.text().trim().replace(/^```json\s*|```$/g, '').trim();
    const parsed = JSON.parse(text);

    // Token usage from Gemini response
    const usage    = result.response.usageMetadata || {};
    const inTok    = usage.promptTokenCount      || 0;
    const outTok   = usage.candidatesTokenCount  || 0;
    const cost     = calcGeminiCost(inTok, outTok);

    console.log(`  ${dim(`Gemini: ${inTok.toLocaleString()} in / ${outTok.toLocaleString()} out — cost $${cost}`)}`);

    if (parsed.displayName && typeof parsed.displayName === 'string' && parsed.displayName.length >= 2) {
      const displayName = parsed.displayName.trim();
      console.log(`  ${green('✓')} Client identified: ${bold(cyan(displayName))}`);
      return { displayName, source: 'ai-inference', geminiCost: cost, geminiTokens: { in: inTok, out: outTok } };
    }

    console.log(`  ${yellow('⚠')}  Gemini returned null — falling back to filename inference`);
  } catch (e) {
    console.warn(`  ${yellow('⚠')}  Gemini inference failed (${e.message}) — falling back to filename`);
  }

  return filenameInference(inboxDir);
}

module.exports = { inferClientWithAI, slugify };
