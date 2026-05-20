#!/usr/bin/env node
'use strict';
/**
 * scaffold/extract-text.js
 *
 * Extracts text from PDF and DOCX files in a directory, saving each as
 * a companion .txt file alongside the original. Skips files that already
 * have a .txt companion.
 *
 * Usage:
 *   node scaffold/extract-text.js projects/{client}/scoping
 *   node scaffold/extract-text.js projects/{client}/intake
 */

const fs   = require('fs');
const path = require('path');

const TEXT_EXTS = new Set(['.txt', '.md', '.json', '.yaml', '.yml', '.csv', '.rst']);

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

  if (ext === '.html' || ext === '.htm') {
    const raw = fs.readFileSync(fullPath, 'utf8');
    // Strip tags, collapse whitespace, decode common entities
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

  return null;
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scaffold/extract-text.js <directory>');
    process.exit(1);
  }
  if (!fs.existsSync(dir)) {
    console.error(`Directory not found: ${dir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
  let extracted = 0;
  let skipped = 0;

  for (const f of files) {
    const fullPath = path.join(dir, f);
    if (!fs.statSync(fullPath).isFile()) continue;
    if (TEXT_EXTS.has(path.extname(f).toLowerCase())) continue;

    const txtPath = path.join(dir, f.replace(/\.[^.]+$/, '.txt'));
    if (fs.existsSync(txtPath)) {
      console.log(`→ skipped (already extracted): ${txtPath}`);
      skipped++;
      continue;
    }

    const text = await extractFileContent(fullPath, f);
    if (text) {
      fs.writeFileSync(txtPath, text, 'utf8');
      console.log(`✓ extracted: ${txtPath}`);
      extracted++;
    }
  }

  console.log(`\nDone. ${extracted} extracted, ${skipped} skipped.`);
}

main().catch(e => { console.error(e); process.exit(1); });
