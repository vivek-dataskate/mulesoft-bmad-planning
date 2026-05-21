#!/usr/bin/env node
/**
 * Rebuild connector-names.json from connector-registry.json.
 * connector-index.json is eliminated — query-connector.py reads the registry directly.
 * Run this whenever connector-registry.json is updated.
 *
 * Usage: node mulesoft/build-connector-index.js
 */
const fs = require("fs");
const path = require("path");

const REGISTRY = path.join(__dirname, "connector-registry.json");
const NAMES_OUT = path.join(__dirname, "connector-names.json");

// Fields included in the names-only tier (connector-names.json)
const NAMES_FIELDS = new Set([
  "displayName", "auth", "category", "licenseRequired", "type",
]);

const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));

const names = {
  _metadata: {
    description:
      "Tier-1 names lookup — for system inference only. Load this to match system names from transcripts to connector keys. For gotchas and authOptions, call: python3 mulesoft/query-connector.py <key> [<key> ...]",
    howToUse:
      "1. Load this file. 2. Match detected system names to connector keys. 3. Run query-connector.py with matched keys to get full data directly from connector-registry.json.",
    regenerate: "node mulesoft/build-connector-index.js",
    totalConnectors: 0,
  },
  connectors: {},
};

let total = 0;

for (const [catKey, catVal] of Object.entries(registry.categories || {})) {
  for (const [connKey, connVal] of Object.entries(catVal.connectors || {})) {
    const namesEntry = {};
    for (const [k, v] of Object.entries(connVal)) {
      if (NAMES_FIELDS.has(k)) namesEntry[k] = v;
    }
    namesEntry._category = catKey;
    names.connectors[connKey] = namesEntry;
    total++;
  }
}

names._metadata.totalConnectors = total;

fs.writeFileSync(NAMES_OUT, JSON.stringify(names, null, 2));

const namesKB = Math.round(fs.statSync(NAMES_OUT).size / 1024);
const registryKB = Math.round(fs.statSync(REGISTRY).size / 1024);

console.log(`connector-registry.json  ${registryKB} KB  (source of truth — scaffold + query-connector.py)`);
console.log(`connector-names.json     ${namesKB} KB  (tier-1 inference — names only)`);
console.log(`Savings: ${registryKB - namesKB} KB vs loading full registry for system inference`);
