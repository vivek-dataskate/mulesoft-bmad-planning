// commons/branding/md-to-html.js
//
// Project-local markdown-to-HTML converter used by:
//   • .eleventy.js  (via the mdToHtml / mdH1 filters)
//
// This is deliberately project-specific — it knows about DataSkate's
// architect-guide structure (skip first H1, .md-table class on tables,
// .code-block class on pre, etc.). Don't replace with a generic markdown-it
// without updating the architect-guide CSS class hooks.

'use strict';

function escText(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function mdInline(text) {
  text = escText(text);
  text = text.replace(/\*\*\*([^*]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  text = text.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  text = text.replace(/`([^`]+?)`/g, (_, c) => `<code>${c}</code>`);
  text = text.replace(/\[([^\]]+?)\]\(([^)]+?)\)/g, '<a href="$2">$1</a>');
  return text;
}

function buildMdTable(lines) {
  const parseRow = (line) => line.split('|').slice(1, -1).map(c => c.trim());
  const headers = parseRow(lines[0]);
  const rows = lines.slice(2).map(parseRow);

  const thead = `<thead><tr>${headers.map(h => `<th>${mdInline(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r =>
    `<tr>${r.map(c => `<td>${mdInline(c)}</td>`).join('')}</tr>`
  ).join('\n')}</tbody>`;

  return `<table class="md-table">${thead}${tbody}</table>`;
}

function mdToHtml(md) {
  const lines = md.split('\n');
  const blocks = [];
  let i = 0;
  let skippedH1 = false;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!skippedH1 && /^# /.test(line)) { skippedH1 = true; i++; continue; }
    if (trimmed === '') { i++; continue; }

    if (line.startsWith('```') || trimmed.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]); i++;
      }
      i++;
      blocks.push(`<pre class="code-block"><code>${escText(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    const hMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (hMatch) {
      const level = Math.min(hMatch[1].length, 4);
      blocks.push(`<h${level}>${mdInline(hMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    if (trimmed.startsWith('|') && i + 1 < lines.length) {
      const sep = lines[i + 1].trim();
      if (sep.startsWith('|') && /\|[\s\-:]+\|/.test(sep)) {
        const tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i].trim()); i++;
        }
        blocks.push(buildMdTable(tableLines));
        continue;
      }
    }

    if (/^<(div|figure|svg|section|aside|details|summary)[\s>]/.test(trimmed)) {
      const htmlLines = [];
      const openTag = trimmed.match(/^<(\w+)/)[1];
      let depth = 0;
      while (i < lines.length) {
        const l = lines[i];
        const t = l.trim();
        depth += (t.match(new RegExp(`<${openTag}[\\s>]`, 'g')) || []).length;
        depth -= (t.match(new RegExp(`</${openTag}>`, 'g')) || []).length;
        htmlLines.push(l);
        i++;
        if (depth <= 0) break;
      }
      blocks.push(htmlLines.join('\n'));
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) { blocks.push('<hr>'); i++; continue; }

    if (trimmed.startsWith('> ')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(mdInline(lines[i].trim().slice(2))); i++;
      }
      blocks.push(`<blockquote><p>${quoteLines.join('<br>')}</p></blockquote>`);
      continue;
    }

    if (/^[-*+] /.test(trimmed)) {
      const items = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === '') {
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === '') j++;
          if (j < lines.length && /^[-*+] /.test(lines[j].trim())) { i = j; continue; }
          break;
        }
        if (!/^[-*+] /.test(t)) break;
        items.push(`<li>${mdInline(t.replace(/^[-*+] /, ''))}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+\. /.test(trimmed)) {
      const items = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === '') {
          let j = i + 1;
          while (j < lines.length && lines[j].trim() === '') j++;
          if (j < lines.length && /^\d+\. /.test(lines[j].trim())) { i = j; continue; }
          break;
        }
        if (!/^\d+\. /.test(t)) break;
        items.push(`<li>${mdInline(t.replace(/^\d+\. /, ''))}</li>`);
        i++;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const paraLines = [];
    while (i < lines.length) {
      const l = lines[i];
      const t = l.trim();
      if (t === '') break;
      if (/^#{1,6} /.test(l)) break;
      if (t.startsWith('```')) break;
      if (/^[-*_]{3,}$/.test(t)) break;
      if (t.startsWith('> ')) break;
      if (/^[-*+] /.test(t)) break;
      if (/^\d+\. /.test(t)) break;
      if (t.startsWith('|') && i + 1 < lines.length && /\|[\s\-:]+\|/.test(lines[i + 1].trim())) break;
      paraLines.push(mdInline(l));
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(`<p>${paraLines.join('<br>')}</p>`);
    }
  }

  return blocks.join('\n');
}

// Extract h1 title from markdown — used by the Eleventy mdH1 filter in architect-guide.njk.
// Returns the first '# Heading' text, or null.
function extractH1Title(md) {
  const m = md.match(/^#+ (.+)/m);
  return m ? m[1].trim() : null;
}

module.exports = { mdToHtml, mdInline, buildMdTable, escText, extractH1Title };
