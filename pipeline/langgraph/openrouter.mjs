/**
 * OpenRouter client + model routing.
 * OpenRouter is OpenAI-API-compatible — same SDK, different baseURL + key.
 * All model decisions live here; changing a model tier requires only this file.
 */
import OpenAI from 'openai';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

// OpenRouter model IDs — maps functional tier names to provider/model strings.
// Swap any tier here to change providers without touching any runner code.
export const OPENROUTER_MODELS = {
  // Cheap/fast: binary decisions and structured extraction from pre-loaded text
  classifier: 'anthropic/claude-haiku-4-5',
  extractor:  'anthropic/claude-haiku-4-5',
  // Shorthand aliases used by some runners
  haiku:      'anthropic/claude-haiku-4-5',
  sonnet:     'anthropic/claude-sonnet-4-6',
  opus:       'anthropic/claude-opus-4-8',
  // Web search + structured extraction (Gemini Flash — ~10x cheaper than Sonnet)
  researcher: 'google/gemini-2.5-flash',
  // Synthesis and scoring on extracted data (Gemini Flash — structured JSON in, structured JSON out)
  analyst:    'google/gemini-2.5-flash',
  // Client-facing proposal prose — quality matters, keep Sonnet
  writer:     'anthropic/claude-sonnet-4-6',
  // Template-driven HTML generation (Quinn sections — rigid structure, Gemini Flash sufficient)
  scribe:     'google/gemini-2.5-flash',
  // Mechanical rule-based review (banned phrases, naming checks)
  auditor:    'anthropic/claude-haiku-4-5',
  // Deep reasoning audit — psychology, strategy, authenticity (Petra proposal only)
  reviewer:   'anthropic/claude-sonnet-4-6',
  // Structural completeness audit — gap flagging, field checks (Gemini Flash sufficient)
  checker:    'google/gemini-2.5-flash',
  // High-stakes framing and psychology-aware synthesis
  strategist: 'openai/gpt-4o',
};

export function modelId(tier = 'analyst') {
  return OPENROUTER_MODELS[tier] || OPENROUTER_MODELS.analyst;
}

export function createClient() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY not set. Get one at https://openrouter.ai/keys');
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: key,
    defaultHeaders: {
      'HTTP-Referer': 'https://dataskate.io',
      'X-Title': 'DataSkate Scout Pipeline',
    },
  });
}

/**
 * Compute cost from OpenRouter usage object.
 * OpenRouter returns { prompt_tokens, completion_tokens, total_tokens }.
 * We read rates from model-pricing.json so one update propagates everywhere.
 */
// Map shorthand model names to canonical pricing tier keys in model-pricing.json.
// This keeps model-pricing.json clean (linter-safe) — no shorthand keys needed there.
const TIER_ALIASES = {
  haiku:  'extractor',
  sonnet: 'writer',
  opus:   'reviewer',
};

export function computeCost(usage = {}, tier = 'sonnet') {
  const pricing = require(`${ROOT}/pipeline/telemetry/model-pricing.json`);
  const resolved = TIER_ALIASES[tier] || tier;
  const rates = pricing[resolved] || pricing.writer || { input: 3.00, output: 15.00, cached: 0.30 };
  const M = 1_000_000;
  const cachedTokens   = usage.cache_read_input_tokens || 0;
  const uncachedTokens = (usage.prompt_tokens || 0) - cachedTokens;
  return (
    (uncachedTokens * rates.input  / M) +
    (cachedTokens  * (rates.cached || rates.input * 0.1) / M) +
    ((usage.completion_tokens || 0) * rates.output / M)
  );
}
