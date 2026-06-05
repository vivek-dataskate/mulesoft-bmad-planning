/**
 * Sub-agent result cache for multi-step runners.
 *
 * Each runner stores successful sub-agent outputs to:
 *   projects/{client}/scoping/run/{agent}-subagent-cache.json
 *
 * On re-run (e.g. after a ceiling kill), cached sub-agents are skipped instantly.
 * Cache clears automatically when all sub-agents in the runner succeed.
 *
 * API:
 *   const cache = subagentCache(clientSlug, 'rex');
 *   const result = await cache.runOrLoad(step, () => runSubStep(step));
 *   cache.clearIfAllSucceeded(results);
 */
import fs   from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const ROOT    = path.resolve(fileURLToPath(import.meta.url), '../../../..');

export function subagentCache(clientSlug, agentSlug) {
  const cachePath = path.join(ROOT, 'projects', clientSlug, 'scoping', 'run',
    `${agentSlug}-subagent-cache.json`);

  let data = {};
  try { data = JSON.parse(fs.readFileSync(cachePath, 'utf8')); }
  catch { data = {}; }

  function save() {
    try { fs.writeFileSync(cachePath, JSON.stringify(data, null, 2)); }
    catch (_) {}
  }

  function clear() {
    try { fs.unlinkSync(cachePath); } catch (_) {}
  }

  /**
   * Return cached result for stepName, or run fn() and cache the result.
   * Only caches non-killed results with real output.
   *
   * @param {string} stepName  — unique step identifier (e.g. 'rex-systems')
   * @param {Function} fn      — async () => { cost, killed, output }
   * @param {string} label     — display label for the log line
   */
  async function runOrLoad(stepName, fn, label) {
    if (data[stepName]) {
      const hit = data[stepName];
      console.log(`    [${agentSlug}] ${label || stepName} — ✓ cached ($${hit.cost.toFixed(4)})`);
      return { cost: hit.cost, killed: false, output: hit.output };
    }
    const result = await fn();
    if (!result.killed && result.output) {
      data[stepName] = { cost: result.cost, output: result.output };
      save();
    }
    return result;
  }

  function cachedCount(stepNames) {
    return stepNames.filter(n => data[n]).length;
  }

  function clearIfAllSucceeded(results) {
    if (!results.some(r => r.killed)) clear();
  }

  return { runOrLoad, cachedCount, clearIfAllSucceeded };
}
