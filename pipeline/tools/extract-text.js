#!/usr/bin/env node
'use strict';
/**
 * pipeline/tools/extract-text.js
 *
 * Extracts text from PDF, DOCX, XLSX, PPTX files in a directory, saving each
 * as a companion .txt file alongside the original. Skips files that already
 * have a .txt companion.
 *
 * For unrecognized binary file types, prompts:
 *   [y] Skip this file and continue
 *   [N] Auto-add handler, install package if needed, extract now
 *
 * Usage:
 *   node pipeline/tools/extract-text.js projects/{client}/scoping
 *   node pipeline/tools/extract-text.js projects/{client}/intake
 */

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const TEXT_EXTS = new Set(['.txt', '.md', '.json', '.yaml', '.yml', '.csv', '.rst']);
const KNOWN_BINARY_EXTS = new Set(['.pdf', '.docx', '.xlsx', '.xls', '.pptx', '.html', '.htm', '.mp4', '.svg']);

// Registry of known-but-not-yet-wired types.
// Each entry has:
//   package  — npm package to install (null if none needed)
//   extract  — async runtime function for the current session
//   handlerCode — source snippet to splice into extractFileContent for future runs
const TYPE_REGISTRY = {
  '.svg': {
    package: null,
    extract: async (fullPath) => {
      const raw = fs.readFileSync(fullPath, 'utf8');
      return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
    },
    handlerCode: [
      "  if (ext === '.svg') {",
      "    const raw = fs.readFileSync(fullPath, 'utf8');",
      "    return raw.replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim() || null;",
      "  }",
    ].join('\n'),
  },
  '.rtf': {
    package: 'strip-rtf',
    extract: async (fullPath, filename) => {
      try {
        const { stripRtf } = require('strip-rtf');
        const raw = fs.readFileSync(fullPath, 'utf8');
        return stripRtf(raw)?.trim() || null;
      } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND') { console.error('strip-rtf not installed. Run: npm install strip-rtf'); process.exit(1); }
        console.error('RTF extraction failed for ' + filename + ': ' + e.message);
        return null;
      }
    },
    handlerCode: [
      "  if (ext === '.rtf') {",
      "    try {",
      "      const { stripRtf } = require('strip-rtf');",
      "      const raw = fs.readFileSync(fullPath, 'utf8');",
      "      return stripRtf(raw)?.trim() || null;",
      "    } catch (e) {",
      "      if (e.code === 'MODULE_NOT_FOUND') { console.error('strip-rtf not installed. Run: npm install strip-rtf'); process.exit(1); }",
      "      console.error('RTF extraction failed for ' + filename + ': ' + e.message);",
      "      return null;",
      "    }",
      "  }",
    ].join('\n'),
  },
  '.odt': {
    package: 'officeparser',
    extract: async (fullPath, filename) => {
      try {
        const officeparser = require('officeparser');
        const text = await officeparser.parseOfficeAsync(fullPath);
        return text?.trim() || null;
      } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND') { console.error('officeparser not installed. Run: npm install officeparser'); process.exit(1); }
        console.error('ODT extraction failed for ' + filename + ': ' + e.message);
        return null;
      }
    },
    handlerCode: [
      "  if (ext === '.odt') {",
      "    try {",
      "      const officeparser = require('officeparser');",
      "      const text = await officeparser.parseOfficeAsync(fullPath);",
      "      return text?.trim() || null;",
      "    } catch (e) {",
      "      if (e.code === 'MODULE_NOT_FOUND') { console.error('officeparser not installed. Run: npm install officeparser'); process.exit(1); }",
      "      console.error('ODT extraction failed for ' + filename + ': ' + e.message);",
      "      return null;",
      "    }",
      "  }",
    ].join('\n'),
  },
  '.odp': {
    package: 'officeparser',
    extract: async (fullPath, filename) => {
      try {
        const officeparser = require('officeparser');
        const text = await officeparser.parseOfficeAsync(fullPath);
        return text?.trim() || null;
      } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND') { console.error('officeparser not installed. Run: npm install officeparser'); process.exit(1); }
        console.error('ODP extraction failed for ' + filename + ': ' + e.message);
        return null;
      }
    },
    handlerCode: [
      "  if (ext === '.odp') {",
      "    try {",
      "      const officeparser = require('officeparser');",
      "      const text = await officeparser.parseOfficeAsync(fullPath);",
      "      return text?.trim() || null;",
      "    } catch (e) {",
      "      if (e.code === 'MODULE_NOT_FOUND') { console.error('officeparser not installed. Run: npm install officeparser'); process.exit(1); }",
      "      console.error('ODP extraction failed for ' + filename + ': ' + e.message);",
      "      return null;",
      "    }",
      "  }",
    ].join('\n'),
  },
  '.ods': {
    package: 'xlsx',
    extract: async (fullPath, filename) => {
      try {
        const XLSX = require('xlsx');
        const workbook = XLSX.readFile(fullPath);
        const lines = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
          if (csv.trim()) lines.push('=== Sheet: ' + sheetName + ' ===\n' + csv);
        }
        return lines.join('\n\n').trim() || null;
      } catch (e) {
        if (e.code === 'MODULE_NOT_FOUND') { console.error('xlsx not installed. Run: npm install xlsx'); process.exit(1); }
        console.error('ODS extraction failed for ' + filename + ': ' + e.message);
        return null;
      }
    },
    handlerCode: [
      "  if (ext === '.ods') {",
      "    try {",
      "      const XLSX = require('xlsx');",
      "      const workbook = XLSX.readFile(fullPath);",
      "      const lines = [];",
      "      for (const sheetName of workbook.SheetNames) {",
      "        const sheet = workbook.Sheets[sheetName];",
      "        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });",
      "        if (csv.trim()) lines.push('=== Sheet: ' + sheetName + ' ===\\n' + csv);",
      "      }",
      "      return lines.join('\\n\\n').trim() || null;",
      "    } catch (e) {",
      "      if (e.code === 'MODULE_NOT_FOUND') { console.error('xlsx not installed. Run: npm install xlsx'); process.exit(1); }",
      "      console.error('ODS extraction failed for ' + filename + ': ' + e.message);",
      "      return null;",
      "    }",
      "  }",
    ].join('\n'),
  },
};

function askUser(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function autoAddHandler(ext, fullPath, filename) {
  const entry = TYPE_REGISTRY[ext];
  if (!entry) {
    console.error(`   No known handler for "${ext}" in TYPE_REGISTRY.`);
    console.error(`   Add an entry to TYPE_REGISTRY in pipeline/tools/extract-text.js and re-run.`);
    process.exit(1);
  }

  // Install package if not already present
  if (entry.package) {
    try {
      require(entry.package);
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') {
        console.log(`   Installing ${entry.package}...`);
        const { execSync } = require('child_process');
        execSync(`npm install ${entry.package} --save`, { stdio: 'inherit' });
      }
    }
  }

  // Patch this script for future runs:
  // 1. Add ext to KNOWN_BINARY_EXTS
  // 2. Splice handler code before `return 'UNKNOWN_TYPE';`
  let src = fs.readFileSync(__filename, 'utf8');
  src = src.replace(
    /const KNOWN_BINARY_EXTS = new Set\(\[([^\]]+)\]\);/,
    (match, inner) => `const KNOWN_BINARY_EXTS = new Set([${inner.trimEnd()}, '${ext}']);`
  );
  src = src.replace("  if (ext === '.svg') {
    const raw = fs.readFileSync(fullPath, 'utf8');
    return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
  }

  return 'UNKNOWN_TYPE';", `${entry.handlerCode}\n\n  return 'UNKNOWN_TYPE';`);
  fs.writeFileSync(__filename, src, 'utf8');
  console.log(`   ✓ Handler for "${ext}" added to extract-text.js (permanent)`);

  // Extract for the current run using the in-memory function
  return entry.extract(fullPath, filename);
}

async function extractFileContent(fullPath, filename) {
  const ext = path.extname(filename).toLowerCase();

  if (ext === '.pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(fs.readFileSync(fullPath));
      return data.text?.trim() || null;
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') {
        console.error('pdf-parse not installed. Run: npm install pdf-parse@1.1.1');
        process.exit(1);
      }
      console.error(`PDF extraction failed for ${filename}: ${e.message}`);
      return null;
    }
  }

  if (ext === '.docx') {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: fullPath });
      return result.value?.trim() || null;
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') {
        console.error('mammoth not installed. Run: npm install mammoth');
        process.exit(1);
      }
      console.error(`DOCX extraction failed for ${filename}: ${e.message}`);
      return null;
    }
  }

  if (ext === '.xlsx' || ext === '.xls') {
    try {
      const XLSX = require('xlsx');
      const workbook = XLSX.readFile(fullPath);
      const lines = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        if (csv.trim()) lines.push(`=== Sheet: ${sheetName} ===\n${csv}`);
      }
      return lines.join('\n\n').trim() || null;
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') {
        console.error('xlsx not installed. Run: npm install xlsx');
        process.exit(1);
      }
      console.error(`XLSX extraction failed for ${filename}: ${e.message}`);
      return null;
    }
  }

  if (ext === '.pptx') {
    try {
      const officeparser = require('officeparser');
      const text = await officeparser.parseOfficeAsync(fullPath);
      return text?.trim() || null;
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') {
        console.error('officeparser not installed. Run: npm install officeparser');
        process.exit(1);
      }
      console.error(`PPTX extraction failed for ${filename}: ${e.message}`);
      return null;
    }
  }

  if (ext === '.html' || ext === '.htm') {
    const raw = fs.readFileSync(fullPath, 'utf8');
    return raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&#?\w+;/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim() || null;
  }

  return 'UNKNOWN_TYPE';
}

async function main() {
  const args      = process.argv.slice(2);
  const autoSkip  = args.includes('--auto-skip');   // set by orchestrate.js (non-interactive)
  const dir       = args.find(a => !a.startsWith('--'));
  if (!dir) {
    console.error('Usage: node pipeline/tools/extract-text.js <directory> [--auto-skip]');
    process.exit(1);
  }
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
  let extracted = 0;
  let skipped = 0;
  let userSkipped = 0;

  for (const f of files) {
    const fullPath = path.join(dir, f);
    if (!fs.statSync(fullPath).isFile()) continue;

    const ext = path.extname(f).toLowerCase();
    if (TEXT_EXTS.has(ext)) continue;

    if (!KNOWN_BINARY_EXTS.has(ext)) {
      if (autoSkip) {
        console.log(`→ auto-skipped (no handler): ${f}`);
        userSkipped++;
        continue;
      }
      const inRegistry = !!TYPE_REGISTRY[ext];
      console.log(`\n⚠  Unknown file type: ${f} (${ext})`);
      console.log(`   extract-text.js has no handler for "${ext}" files.`);
      console.log(`   [y] Skip this file and continue`);
      console.log(`   [N] Auto-add handler${inRegistry ? '' : ' — NOT in registry, will abort'} and extract it`);
      const ans = await askUser(`   Choice [y/N]: `);
      if (ans.toLowerCase() === 'y') {
        console.log(`   → skipped by user: ${f}`);
        userSkipped++;
        continue;
      }
      // N = add handler and extract
      const txtPath = path.join(dir, f.replace(/\.[^.]+$/, '.txt'));
      const text = await autoAddHandler(ext, fullPath, f);
      if (text) {
        fs.writeFileSync(txtPath, text, 'utf8');
        console.log(`✓ extracted: ${txtPath}`);
        extracted++;
      }
      continue;
    }

    const txtPath = path.join(dir, f.replace(/\.[^.]+$/, '.txt'));
    if (fs.existsSync(txtPath)) {
      console.log(`→ skipped (already extracted): ${txtPath}`);
      skipped++;
      continue;
    }

    const text = await extractFileContent(fullPath, f);
    if (text && text !== 'UNKNOWN_TYPE') {
      fs.writeFileSync(txtPath, text, 'utf8');
      console.log(`✓ extracted: ${txtPath}`);
      extracted++;
    }
  }

  const skippedMsg = userSkipped > 0 ? `, ${userSkipped} skipped by user` : '';
  console.log(`\nDone. ${extracted} extracted, ${skipped} skipped${skippedMsg}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
