#!/usr/bin/env node
// promote-library.js
// Promotes libraryContributions[] from per-client vera.json files into:
//   1. standards/usecases/{vertical}.json  — use case library
//   2. standards/client-registry.json      — prospect entries (isProspect: true)
// Vera stages entries with pendingPromotion: true — this script does the actual write.
//
// Field semantics:
//   DS entries:  clients[]        — DataSkate engagements where we BUILT this integration
//   web entries: researchedFrom[] — DataSkate engagements that DISCOVERED this via research
//   These are different things. Never put a research client into clients[].
//
// Usage:
//   node DSPipeline/promote-library.js                        # all clients
//   node DSPipeline/promote-library.js --client agilemind     # one client
//   node DSPipeline/promote-library.js --dry-run              # preview only, no writes

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const PROJECTS = path.join(ROOT, 'projects');
const USECASES = path.join(ROOT, 'standards', 'usecases');
const REGISTRY = path.join(ROOT, 'standards', 'client-registry.json');

function dedupeKey(entry) {
  const uc = (entry.useCase || '').toLowerCase().trim();
  if (entry.source === 'DS') {
    const sys = (entry.systems || []).slice().sort().join('+').toLowerCase();
    return `ds|${sys}|${uc}`;
  }
  const co = (entry.sourceCompany || '').toLowerCase().trim();
  return `web|${co}|${uc}`;
}

function loadLibrary(verticalSlug) {
  const libPath = path.join(USECASES, `${verticalSlug}.json`);
  if (fs.existsSync(libPath)) {
    return { libPath, lib: JSON.parse(fs.readFileSync(libPath, 'utf8')) };
  }
  return { libPath, lib: { _vertical: verticalSlug, usecases: [] } };
}

function promoteLibrary({ clientSlug = null, dryRun = false } = {}) {
  const slugs = clientSlug
    ? [clientSlug]
    : fs.readdirSync(PROJECTS).filter(d =>
        fs.statSync(path.join(PROJECTS, d)).isDirectory() &&
        fs.existsSync(path.join(PROJECTS, d, 'run', 'vera.json'))
      );

  let totalNew     = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  for (const slug of slugs) {
    const veraPath = path.join(PROJECTS, slug, 'run', 'vera.json');
    if (!fs.existsSync(veraPath)) continue;

    const vera = JSON.parse(fs.readFileSync(veraPath, 'utf8'));

    // Prospect promotion runs on all isProspect:true entries regardless of pendingPromotion (idempotent)
    const allProspects = (vera.libraryContributions || []).filter(e => e.isProspect === true && e.sourceCompany);
    const prospectsAdded = promoteProspects({ slug, entries: allProspects, dryRun });
    if (prospectsAdded > 0) {
      console.log(`[${slug}] ${prospectsAdded} prospect(s) added to client-registry.json`);
    }

    const pending = (vera.libraryContributions || []).filter(c => c.pendingPromotion === true);
    if (pending.length === 0) {
      console.log(`[${slug}] No pending library contributions — skipped.`);
      continue;
    }

    // Group by vertical
    const byVertical = {};
    for (const entry of pending) {
      const v = entry.verticalSlug;
      if (!v) {
        console.warn(`[${slug}] WARN: entry missing verticalSlug — skipped: "${entry.useCase?.slice(0, 60)}"`);
        continue;
      }
      if (!byVertical[v]) byVertical[v] = [];
      byVertical[v].push(entry);
    }

    for (const [vertical, entries] of Object.entries(byVertical)) {
      const { libPath, lib } = loadLibrary(vertical);

      for (const entry of entries) {
        const key         = dedupeKey(entry);
        const existingIdx = lib.usecases.findIndex(u => dedupeKey(u) === key);

        if (existingIdx >= 0) {
          const existing = lib.usecases[existingIdx];

          if (entry.source === 'DS') {
            // DS: append DataSkate client to clients[] if not already listed
            if (!Array.isArray(existing.clients)) existing.clients = [];
            const clientName = entry.clients?.[0]?.displayName;
            if (clientName && !existing.clients.some(c => c.displayName === clientName)) {
              if (!dryRun) existing.clients.push(entry.clients[0]);
              console.log(`[${slug}] UPDATE clients[]+= ${clientName}: ${entry.useCase?.slice(0, 50)}`);
              totalUpdated++;
            } else {
              console.log(`[${slug}] SKIP (DS client already listed): ${entry.useCase?.slice(0, 60)}`);
              totalSkipped++;
            }
          } else {
            // Web: append slug to relevantTo[] if not already there
            if (!Array.isArray(existing.relevantTo)) existing.relevantTo = [];
            if (!existing.relevantTo.includes(slug)) {
              if (!dryRun) existing.relevantTo.push(slug);
              console.log(`[${slug}] UPDATE relevantTo[]+= ${slug}: ${entry.useCase?.slice(0, 50)}`);
              totalUpdated++;
            } else {
              console.log(`[${slug}] SKIP (already in relevantTo): ${entry.useCase?.slice(0, 60)}`);
              totalSkipped++;
            }
          }
          continue;
        }

        // New entry — build clean promoted object
        const promoted = { ...entry };
        delete promoted.pendingPromotion;
        delete promoted.verticalSlug;
        delete promoted.isProspect;
        delete promoted.prospectNote;
        delete promoted.researchedFrom;
        delete promoted.promotedFrom;
        delete promoted.promotedAt;

        if (entry.source === 'DS') {
          // clients[] = DataSkate clients we built this for
          promoted.clients = entry.clients || [];
        } else {
          // Web: clients[] = the source company (who actually has this use case)
          //      relevantTo[] = DataSkate engagements for whom Vera surfaced this as FOMO research
          promoted.clients       = [{ displayName: entry.sourceCompany }];
          promoted.relevantTo    = [slug];
          promoted.discoveredDate = new Date().toISOString().split('T')[0];
        }

        if (!dryRun) lib.usecases.push(promoted);
        console.log(`[${slug}] ADD:  ${entry.useCase?.slice(0, 70)}`);
        totalNew++;
      }

      if (!dryRun) {
        fs.writeFileSync(libPath, JSON.stringify(lib, null, 2) + '\n');
        console.log(`[${slug}] Wrote ${vertical}.json (${lib.usecases.length} total entries)`);
      }
    }

    // Mark all pending as promoted in vera.json
    if (!dryRun) {
      vera.libraryContributions = vera.libraryContributions.map(c =>
        c.pendingPromotion === true ? { ...c, pendingPromotion: false } : c
      );
      fs.writeFileSync(veraPath, JSON.stringify(vera, null, 2) + '\n');
    }
  }

  const suffix = dryRun ? ' (DRY RUN — nothing written)' : '';
  console.log(`\nDone: ${totalNew} added, ${totalUpdated} updated, ${totalSkipped} skipped.${suffix}`);
}

// ── Prospect Registry ────────────────────────────────────────────────────────

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function promoteProspects({ slug, entries, dryRun }) {
  if (entries.length === 0) return 0;

  const registry = JSON.parse(fs.existsSync(REGISTRY) ? fs.readFileSync(REGISTRY, 'utf8') : '{"clients":[]}');
  if (!Array.isArray(registry.clients)) registry.clients = [];

  let added = 0;
  for (const entry of entries) {
    const prospectSlug = slugify(entry.sourceCompany);
    if (registry.clients.find(c => c.slug === prospectSlug)) {
      console.log(`[${slug}] PROSPECT SKIP (exists): ${entry.sourceCompany}`);
      continue;
    }

    const prospect = {
      slug:           prospectSlug,
      displayName:    entry.sourceCompany,
      vertical:       entry.verticalSlug || null,
      sizeSegment:    (entry.sizeSegment || '').toLowerCase().replace('-', ''),
      systems:        entry.systems || [],
      architect:      null,
      architectEmail: null,
      status:         'prospect',
      discoveredDate: new Date().toISOString().split('T')[0],
      discoveredFrom: slug,
      prospectNote:   entry.prospectNote || null,
      projectContext: null,
    };

    if (!dryRun) registry.clients.push(prospect);
    console.log(`[${slug}] PROSPECT ADD: ${entry.sourceCompany}`);
    added++;
  }

  if (!dryRun && added > 0) {
    fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + '\n');
  }

  return added;
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const clientIdx  = args.indexOf('--client');
const clientSlug = clientIdx !== -1 ? args[clientIdx + 1] : null;
const dryRun     = args.includes('--dry-run');

promoteLibrary({ clientSlug, dryRun });

module.exports = { promoteLibrary, promoteProspects };
