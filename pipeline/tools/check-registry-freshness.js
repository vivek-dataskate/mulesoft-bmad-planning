#!/usr/bin/env node
/**
 * check-registry-freshness.js
 * Run: node scaffold/check-registry-freshness.js
 * Purpose: Enforce the connector registry staleness policy:
 *   Green  (≤ 30 days) — current
 *   Yellow (31–60 days) — verify on Exchange before use in new project
 *   Red    (> 60 days)  — MUST call MuleSoft MCP search_asset and update registry
 *
 * Per PLANNING_CONTEXT.md: run on the 1st of each month.
 * Exit code 0 = all green. Exit code 1 = any red connectors found (CI gate).
 */

const fs   = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '..', 'standards', 'connector-registry.json');
const TODAY         = new Date();
TODAY.setHours(0, 0, 0, 0);

const GREEN_DAYS  = 30;
const YELLOW_DAYS = 60;

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.floor((TODAY - d) / (1000 * 60 * 60 * 24));
}

function badge(days) {
  if (days <= GREEN_DAYS)  return '✅ GREEN ';
  if (days <= YELLOW_DAYS) return '⚠️  YELLOW';
  return '🔴 RED   ';
}

function run() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    console.error(`❌ Registry not found: ${REGISTRY_PATH}`);
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));

  const results   = [];
  let   redCount  = 0;
  let   yellCount = 0;

  // BUG-28: The old recursive walk() passed `key` as `category` when recursing, so every
  // connector ended up with category="connectors" instead of its real category name.
  // Fix: traverse registry.categories directly — the structure is known and stable.
  for (const [catKey, catObj] of Object.entries(registry.categories ?? {})) {
    if (!catObj || typeof catObj !== 'object') continue;
    const catName = catObj.displayName ?? catKey;
    for (const [key, entry] of Object.entries(catObj.connectors ?? {})) {
      if (!entry || typeof entry !== 'object') continue;
      const days = daysSince(entry.lastVerified);
      const b    = badge(days);
      results.push({ category: catName, key, days, b, lastVerified: entry.lastVerified || null, displayName: entry.displayName || key, exchangeUrl: entry.exchangeUrl || '' });
      if (days > YELLOW_DAYS) redCount++;
      else if (days > GREEN_DAYS) yellCount++;
    }
  }

  results.sort((a, b) => b.days - a.days);

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`  Connector Registry Freshness Report — ${TODAY.toISOString().split('T')[0]}`);
  console.log(`${'═'.repeat(90)}`);
  console.log(`  Policy: ✅ ≤${GREEN_DAYS}d  ⚠️  ${GREEN_DAYS + 1}–${YELLOW_DAYS}d  🔴 >${YELLOW_DAYS}d`);
  console.log(`${'─'.repeat(90)}`);
  console.log(`  ${'STATUS'.padEnd(10)} ${'DAYS'.padStart(4)}  ${'LAST VERIFIED'.padEnd(14)} ${'KEY'.padEnd(30)} DISPLAY NAME`);
  console.log(`${'─'.repeat(90)}`);

  for (const r of results) {
    const daysStr  = r.days === Infinity ? '????' : String(r.days).padStart(4);
    const keyStr   = r.key.padEnd(30);
    const nameStr  = r.displayName;
    console.log(`  ${r.b}  ${daysStr}  ${(r.lastVerified || 'MISSING').padEnd(14)} ${keyStr} ${nameStr}`);
  }

  console.log(`${'─'.repeat(90)}`);
  console.log(`  Total: ${results.length} connectors  |  🔴 Red: ${redCount}  |  ⚠️  Yellow: ${yellCount}  |  ✅ Green: ${results.length - redCount - yellCount}`);
  console.log(`${'═'.repeat(90)}\n`);

  if (redCount > 0) {
    console.log(`🔴 ACTION REQUIRED: ${redCount} connector(s) are RED (>${YELLOW_DAYS} days stale).`);
    console.log(`   For each red connector:`);
    console.log(`     1. Call MuleSoft MCP tool: search_asset("{connector} connector")`);
    console.log(`     2. Verify version on Anypoint Exchange`);
    console.log(`     3. Update lastVerified to today in standards/connector-registry.json`);
    console.log(`     4. Commit: "registry: Verify {connector} connector [monthly-freshness]"\n`);
    process.exit(1);
  }

  if (yellCount > 0) {
    console.log(`⚠️  WARNING: ${yellCount} connector(s) are YELLOW (${GREEN_DAYS + 1}–${YELLOW_DAYS} days).`);
    console.log(`   Verify on Exchange before using in any new project.\n`);
  } else {
    console.log(`✅ All connectors are within the freshness policy (≤${GREEN_DAYS} days).\n`);
  }

  process.exit(0);
}

run();
