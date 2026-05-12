#!/usr/bin/env node
/**
 * Rebuild connector-names.json and connector-index.json from connector-registry.json.
 * Run this whenever connector-registry.json is updated.
 *
 * Usage: node standards/build-connector-index.js
 */
const fs = require("fs");
const path = require("path");

const REGISTRY = path.join(__dirname, "connector-registry.json");
const INDEX_OUT = path.join(__dirname, "connector-index.json");
const NAMES_OUT = path.join(__dirname, "connector-names.json");

// Fields included in the agent lookup index (connector-index.json)
const AGENT_FIELDS = new Set([
  "displayName", "auth", "authOptions", "notes", "category", "licenseRequired", "type",
]);

// Fields included in the names-only tier (connector-names.json)
const NAMES_FIELDS = new Set([
  "displayName", "auth", "category", "licenseRequired", "type",
]);

const registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));

// Build connector-index.json
const index = {
  _metadata: {
    description:
      "Agent lookup index — subset of connector-registry.json. Contains fields needed by Scout/Analyst for system inference, gotcha detection, and stub creation. For Maven coordinates, configTemplate, propertiesRequired, and URLs, use connector-registry.json.",
    generatedFrom: "standards/connector-registry.json",
    agentFields: [...AGENT_FIELDS].sort(),
    regenerate: "node standards/build-connector-index.js",
  },
  categories: {},
};

// Build connector-names.json
const names = {
  _metadata: {
    description:
      "Tier-1 names lookup — for system inference only. Load this to match system names from transcripts to connector keys. For gotchas and authOptions, call: python3 standards/query-connector.py <key> [<key> ...]",
    howToUse:
      "1. Load this file. 2. Match detected system names to connector keys. 3. Run query-connector.py with matched keys to get full gotchas/auth from connector-index.json.",
    regenerate: "node standards/build-connector-index.js",
    totalConnectors: 0,
  },
  connectors: {},
};

let total = 0;

for (const [catKey, catVal] of Object.entries(registry.categories || {})) {
  const indexConns = {};
  for (const [connKey, connVal] of Object.entries(catVal.connectors || {})) {
    // Index entry
    const indexEntry = {};
    for (const [k, v] of Object.entries(connVal)) {
      if (AGENT_FIELDS.has(k)) indexEntry[k] = v;
    }
    indexConns[connKey] = indexEntry;

    // Names entry
    const namesEntry = {};
    for (const [k, v] of Object.entries(connVal)) {
      if (NAMES_FIELDS.has(k)) namesEntry[k] = v;
    }
    namesEntry._category = catKey;
    names.connectors[connKey] = namesEntry;

    total++;
  }
  index.categories[catKey] = {
    displayName: catVal.displayName || catKey,
    connectors: indexConns,
  };
}

names._metadata.totalConnectors = total;

fs.writeFileSync(INDEX_OUT, JSON.stringify(index, null, 2));
fs.writeFileSync(NAMES_OUT, JSON.stringify(names, null, 2));

const indexKB = Math.round(fs.statSync(INDEX_OUT).size / 1024);
const namesKB = Math.round(fs.statSync(NAMES_OUT).size / 1024);
const registryKB = Math.round(fs.statSync(REGISTRY).size / 1024);

console.log(`connector-registry.json  ${registryKB} KB  (full build manifest — scaffold only)`);
console.log(`connector-index.json     ${indexKB} KB  (agent lookup — notes + auth)`);
console.log(`connector-names.json     ${namesKB} KB  (tier-1 inference — names only)`);
console.log(`Savings: ${registryKB - namesKB} KB vs loading full registry for system inference`);
