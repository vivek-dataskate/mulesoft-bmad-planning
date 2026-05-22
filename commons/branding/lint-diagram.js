#!/usr/bin/env node
// DataSkate diagram linter — validates .mmd templates against commons/brand-standards.json.
// Run automatically via PostToolUse hook on any .mmd file edit.
// Also runnable manually:
//   node commons/branding/lint-diagram.js                           ← lint all templates
//   node commons/branding/lint-diagram.js commons/diagram-templates/prd/entity-state.mmd

'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT  = path.resolve(__dirname, '../..');
const BRAND = JSON.parse(fs.readFileSync(path.join(ROOT, 'commons/brand-standards.json'), 'utf8'));
const DIAG  = BRAND.diagram;

// Flatten all permitted hex values from the palette
const PERMITTED_FILLS   = new Set(Object.values(DIAG.palette).map(p => p.fill?.toLowerCase()).filter(Boolean));
const PERMITTED_STROKES = new Set(Object.values(DIAG.palette).map(p => p.stroke?.toLowerCase()).filter(Boolean));
const PERMITTED_TEXTS   = new Set(Object.values(DIAG.palette).map(p => p.text?.toLowerCase()).filter(Boolean));
const PERMITTED_CLASSES = new Set(Object.keys(DIAG.palette));

const FORBIDDEN_FILLS   = new Set(DIAG.forbiddenFills.map(h => h.toLowerCase()));
const FORBIDDEN_STROKES = new Set(DIAG.forbiddenStrokes.map(h => h.toLowerCase()));
const FORBIDDEN_TEXTS   = new Set(DIAG.forbiddenTexts.map(h => h.toLowerCase()));

function parseClassDefs(content) {
  // Extract all classDef lines: classDef <name> fill:#xxx,stroke:#yyy,...
  return [...content.matchAll(/^\s*classDef\s+(\S+)\s+([^\n]+)/gm)].map(m => ({
    name:  m[1],
    attrs: m[2].trim(),
    raw:   m[0].trim(),
  }));
}

function extractHex(str) {
  return [...str.matchAll(/#([0-9a-fA-F]{3,8})\b/g)].map(m => ('#' + m[1]).toLowerCase());
}

function detectDiagramType(content) {
  if (/^\s*sequenceDiagram/m.test(content))  return 'sequenceDiagram';
  if (/^\s*stateDiagram-v2/m.test(content))  return 'stateDiagram-v2';
  if (/^\s*erDiagram/m.test(content))        return 'erDiagram';
  if (/^\s*gantt/m.test(content))            return 'gantt';
  if (/^\s*C4Context/m.test(content))        return 'C4Context';
  if (/^\s*C4Container/m.test(content))      return 'C4Container';
  if (/^\s*C4Component/m.test(content))      return 'C4Component';
  if (/flowchart\s+LR/m.test(content))       return 'flowchart LR';
  if (/flowchart\s+TD/m.test(content))       return 'flowchart TD';
  if (/flowchart\s+TB/m.test(content))       return 'flowchart TB';
  return 'unknown';
}

function needsInitHeader(type) {
  return ['flowchart LR', 'flowchart TD', 'flowchart TB', 'stateDiagram-v2', 'erDiagram', 'gantt'].includes(type);
}

const CHECKS = [
  {
    name: 'Init header',
    skip: (_, type) => !needsInitHeader(type),
    test: (content) => content.trimStart().startsWith("%%{init: {'theme': 'base'}}%%"),
    message: (_, type) => `Missing %%{init: {'theme': 'base'}}%% header (required for ${type}). See brand-standards.json → diagram.requiredInitFlowchart`,
  },
  {
    name: 'No forbidden fill colors',
    test: (content) => {
      const defs = parseClassDefs(content);
      const bad  = [];
      for (const def of defs) {
        const fillMatch = def.attrs.match(/fill:([^,\s]+)/);
        if (!fillMatch) continue;
        const hex = fillMatch[1].toLowerCase();
        if (FORBIDDEN_FILLS.has(hex)) bad.push(`${def.name}: fill:${hex}`);
      }
      CHECKS._forbiddenFills = bad;
      return bad.length === 0;
    },
    message: () => `Off-brand fill colors in classDef — blue and amber fills are not permitted in diagrams. Found: ${CHECKS._forbiddenFills.join(', ')}. See brand-standards.json → diagram.forbiddenFills`,
  },
  {
    name: 'No forbidden stroke colors',
    test: (content) => {
      const defs = parseClassDefs(content);
      const bad  = [];
      for (const def of defs) {
        const strokeMatch = def.attrs.match(/stroke:([^,\s]+)/);
        if (!strokeMatch) continue;
        const hex = strokeMatch[1].toLowerCase();
        if (FORBIDDEN_STROKES.has(hex)) bad.push(`${def.name}: stroke:${hex}`);
      }
      CHECKS._forbiddenStrokes = bad;
      return bad.length === 0;
    },
    message: () => `Off-brand stroke colors in classDef — blue and amber strokes are not permitted in diagrams. Found: ${CHECKS._forbiddenStrokes.join(', ')}. See brand-standards.json → diagram.forbiddenStrokes`,
  },
  {
    name: 'No forbidden text colors',
    test: (content) => {
      const defs = parseClassDefs(content);
      const bad  = [];
      for (const def of defs) {
        const colorMatch = def.attrs.match(/(?:^|,)\s*color:([^,\s]+)/);
        if (!colorMatch) continue;
        const hex = colorMatch[1].toLowerCase();
        if (FORBIDDEN_TEXTS.has(hex)) bad.push(`${def.name}: color:${hex}`);
      }
      CHECKS._forbiddenTexts = bad;
      return bad.length === 0;
    },
    message: () => `Off-brand text colors in classDef. Found: ${CHECKS._forbiddenTexts.join(', ')}. See brand-standards.json → diagram.forbiddenTexts`,
  },
  {
    name: 'Only permitted class names',
    test: (content) => {
      const defs = parseClassDefs(content);
      const bad  = defs.filter(d => !PERMITTED_CLASSES.has(d.name)).map(d => d.name);
      CHECKS._unknownClasses = bad;
      return bad.length === 0;
    },
    message: () => `Unknown classDef names — add to brand-standards.json → diagram.palette first. Found: ${CHECKS._unknownClasses.join(', ')}`,
  },
];

function lintFile(filePath) {
  const rel     = path.relative(ROOT, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const type    = detectDiagramType(content);

  const failures = CHECKS.filter(c => {
    if (c.skip && c.skip(content, type)) return false;
    return !c.test(content, type);
  });

  return { rel, type, failures };
}

function getAllTemplates() {
  const dir = path.join(ROOT, 'commons/diagram-templates');
  const results = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.mmd')) results.push(full);
    }
  }
  walk(dir);
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const arg = process.argv[2];
const targets = arg
  ? [path.resolve(process.cwd(), arg)]
  : getAllTemplates();

if (targets.length === 0) {
  console.log('No .mmd templates found.');
  process.exit(0);
}

let anyFail = false;

for (const filePath of targets) {
  if (!fs.existsSync(filePath) || !filePath.endsWith('.mmd')) continue;
  const { rel, type, failures } = lintFile(filePath);

  if (failures.length) {
    anyFail = true;
    console.error(`\n✗  ${rel}  [${type}]`);
    failures.forEach(f => console.error(`   • [${f.name}] ${typeof f.message === 'function' ? f.message(null, type) : f.message}`));
  } else {
    console.log(`✓  ${rel}  [${type}]`);
  }
}

if (anyFail) {
  console.error('\nDiagram lint FAILED — fix all violations before pushing.');
  process.exit(1);
} else {
  console.log('\nAll diagram checks passed.');
  process.exit(0);
}
