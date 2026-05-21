#!/usr/bin/env node
/**
 * generate-diagrams.js <client-slug>
 *
 * Reads project.json systemDiagram.current + .future (Mermaid graph LR strings),
 * renders a two-panel side-by-side SVG and saves it to
 * projects/{client}/intake/system-diagram.svg
 *
 * Usage: node scripts/generate-diagrams.js homage
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const slug = process.argv[2];
if (!slug) { console.error('Usage: node scripts/generate-diagrams.js <slug>'); process.exit(1); }

const projPath = path.join(ROOT, 'projects', slug, 'project.json');
if (!fs.existsSync(projPath)) { console.error(`No project.json at projects/${slug}/`); process.exit(1); }

const proj     = JSON.parse(fs.readFileSync(projPath, 'utf8'));
const diagrams = proj.systemDiagram;
if (!diagrams) { console.error(`No systemDiagram in project.json`); process.exit(1); }

const svg     = buildDualPanelSvg(diagrams.current, diagrams.future);
const outPath = path.join(ROOT, 'projects', slug, 'intake', 'system-diagram.svg');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, svg);
console.log(`✓ Written: projects/${slug}/intake/system-diagram.svg`);

// ─── Mermaid graph LR parser ─────────────────────────────────────────────────

function parseMermaid(text) {
  if (!text) return { nodes: {}, edges: [] };
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && l !== 'graph LR');
  const nodes = {};
  const edges = [];

  function upsert(id, label) {
    if (!nodes[id]) nodes[id] = { id, label: label || id, fill: null, stroke: null, color: null };
    else if (label && label !== id) nodes[id].label = label;
  }

  for (const line of lines) {
    // style directive
    const sm = line.match(/^style\s+(\w+)\s+(.*)/);
    if (sm) {
      upsert(sm[1], null);
      nodes[sm[1]].fill   = (sm[2].match(/fill:([^,;\s]+)/)   || [])[1] || null;
      nodes[sm[1]].stroke = (sm[2].match(/stroke:([^,;\s]+)/) || [])[1] || null;
      nodes[sm[1]].color  = (sm[2].match(/color:([^,;\s]+)/)  || [])[1] || null;
      continue;
    }
    // edge: A["lbl"] -->|"edge"| B["lbl"]  (all parts optional except A and B ids)
    const em = line.match(/^(\w+)(?:\["([^"]*)"\])?\s*-->(?:\|"?([^"|]*)"?\|)?\s*(\w+)(?:\["([^"]*)"\])?/);
    if (em) {
      const [, fi, fl, el, ti, tl] = em;
      upsert(fi, fl ? fl.replace(/\\n/g, '\n') : null);
      upsert(ti, tl ? tl.replace(/\\n/g, '\n') : null);
      edges.push({ from: fi, to: ti, label: el ? el.trim() : null });
    }
  }
  return { nodes, edges };
}

// ─── Graph layout (column + row) ─────────────────────────────────────────────

function layout(nodes, edges) {
  const ids = Object.keys(nodes);
  if (!ids.length) return {};

  const outEdges = {};
  const inEdges  = {};
  ids.forEach(id => { outEdges[id] = []; inEdges[id] = []; });
  edges.forEach(e => { outEdges[e.from].push(e.to); inEdges[e.to].push(e.from); });

  // BFS column assignment from sources
  const col   = {};
  const queue = ids.filter(id => !inEdges[id].length);
  if (!queue.length) queue.push(ids[0]);
  queue.forEach(id => { col[id] = 0; });

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    outEdges[cur].forEach(to => {
      const next = (col[cur] || 0) + 1;
      if (col[to] === undefined || col[to] < next) {
        col[to] = next;
        queue.push(to);
      }
    });
  }
  ids.forEach(id => { if (col[id] === undefined) col[id] = 0; });

  // Push all sinks to a uniform rightmost column
  const sinks   = ids.filter(id => !outEdges[id].length);
  const nonSink = ids.filter(id =>  outEdges[id].length);
  if (sinks.length && nonSink.length) {
    const maxNonSink = Math.max(...nonSink.map(id => col[id]));
    sinks.forEach(id => { col[id] = maxNonSink + 1; });
  }

  // Group by column → assign rows
  const byCol = {};
  ids.forEach(id => { const c = col[id]; (byCol[c] = byCol[c] || []).push(id); });

  const pos = {};
  Object.entries(byCol).forEach(([c, colIds]) => {
    colIds.forEach((id, i) => {
      pos[id] = { col: Number(c), row: i, totalInCol: colIds.length };
    });
  });
  return pos;
}

// ─── Text utilities ───────────────────────────────────────────────────────────

function wrapLabel(text, maxChars = 16) {
  // Split on existing \n first
  const forced = text.split('\n');
  const lines  = [];
  for (const seg of forced) {
    if (seg.length <= maxChars) { lines.push(seg); continue; }
    // Break at nearest space
    let remaining = seg;
    while (remaining.length > maxChars) {
      let cut = remaining.lastIndexOf(' ', maxChars);
      if (cut <= 0) cut = maxChars;
      lines.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) lines.push(remaining);
  }
  return lines;
}

function escSvg(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Single panel SVG builder ─────────────────────────────────────────────────

function buildPanel(diagram, panelW, panelH, offsetX) {
  if (!diagram || !diagram.mermaid) return '';

  const { nodes, edges } = parseMermaid(diagram.mermaid);
  const pos  = layout(nodes, edges);
  const ids  = Object.keys(nodes);

  const BOX_W   = 120;
  const BOX_H   = 40;
  const COL_GAP = 52;
  const ROW_H   = 58;
  const INNER_PAD = 18; // inside panel border

  const numCols = Math.max(...Object.values(pos).map(p => p.col)) + 1;
  const maxRows = Math.max(...Object.values(pos).map(p => p.totalInCol));

  const totalContentW = numCols * BOX_W + (numCols - 1) * COL_GAP;
  const totalContentH = maxRows * ROW_H;

  // Center content within panel
  const startX = offsetX + INNER_PAD + (panelW - 2 * INNER_PAD - totalContentW) / 2;
  const startY = (panelH - totalContentH) / 2;

  function cx(id) { return startX + pos[id].col * (BOX_W + COL_GAP); }
  function cy(id) {
    const { row, totalInCol } = pos[id];
    const colH    = totalInCol * ROW_H;
    const colOffY = startY + (totalContentH - colH) / 2;
    return colOffY + row * ROW_H + ROW_H / 2;
  }

  const parts = [];

  // Edges (drawn behind boxes)
  edges.forEach(({ from, to, label }) => {
    if (!pos[from] || !pos[to]) return;
    const x1 = cx(from) + BOX_W, y1 = cy(from);
    const x2 = cx(to),           y2 = cy(to);
    const mx = (x1 + x2) / 2;
    parts.push(`<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="#C0C5CC" stroke-width="1.5" marker-end="url(#arr)"/>`);
    if (label) {
      const lx = mx, ly = Math.min(y1, y2) + Math.abs(y2 - y1) / 2 - 5;
      parts.push(`<text x="${lx}" y="${ly}" text-anchor="middle" font-size="8.5" fill="#888" font-style="italic">${escSvg(label)}</text>`);
    }
  });

  // Nodes
  ids.forEach(id => {
    if (!pos[id]) return;
    const n  = nodes[id];
    const bx = cx(id);
    const by = cy(id) - BOX_H / 2;

    const fill   = n.fill   || '#fff';
    const stroke = n.stroke || '#D4D4D8';
    const tColor = n.color  || '#1A1A1A';

    const labelLines = wrapLabel(n.label, 15);
    const LINE_H = 13;
    const textBlockH = labelLines.length * LINE_H;
    const textStartY = by + (BOX_H - textBlockH) / 2 + LINE_H - 2;

    parts.push(`<rect x="${bx}" y="${by}" width="${BOX_W}" height="${BOX_H}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`);
    labelLines.forEach((line, i) => {
      const bold   = labelLines.length > 1 && i === 0 ? ' font-weight="600"' : '';
      const fsize  = line.length > 14 ? '8.5' : '10';
      parts.push(`<text x="${bx + BOX_W / 2}" y="${textStartY + i * LINE_H}" text-anchor="middle" font-size="${fsize}" fill="${tColor}"${bold}>${escSvg(line)}</text>`);
    });
  });

  return parts.join('\n');
}

// ─── Two-panel composite SVG ──────────────────────────────────────────────────

function buildDualPanelSvg(current, future) {
  const BRAND  = '#ed1c24';
  const GREEN  = '#2E9E6B';
  const LIGHT_R = '#FFF5F5';
  const LIGHT_G = '#EDF9F3';

  const PANEL_W  = 470;
  const GAP      = 70;
  const TOTAL_W  = PANEL_W * 2 + GAP;
  const HDR_H    = 38;
  const BODY_H   = 200;
  const TOTAL_H  = HDR_H + BODY_H + 16;

  const curTitle = (current && current.title) || 'Current State';
  const futTitle = (future  && future.title)  || 'Future State';

  const svgL = buildPanel(current, PANEL_W, BODY_H, 0);
  const svgR = buildPanel(future,  PANEL_W, BODY_H, PANEL_W + GAP);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 ${TOTAL_W} ${TOTAL_H}" width="${TOTAL_W}" height="${TOTAL_H}"
     xmlns="http://www.w3.org/2000/svg"
     style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:100%;background:#fff;">
  <defs>
    <marker id="arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
      <path d="M0,0.5 L0,6.5 L6,3.5 Z" fill="#B0B5BC"/>
    </marker>
  </defs>

  <!-- ── Left panel ─────────────────────────────────────────── -->
  <rect x="0" y="0" width="${PANEL_W}" height="${TOTAL_H}" rx="8"
        fill="${LIGHT_R}" stroke="${BRAND}" stroke-width="1.5"/>
  <!-- Header fill -->
  <rect x="0" y="0" width="${PANEL_W}" height="${HDR_H}" rx="8" fill="${BRAND}"/>
  <rect x="0" y="${HDR_H - 10}" width="${PANEL_W}" height="10" fill="${BRAND}"/>
  <!-- Header text -->
  <text x="${PANEL_W / 2}" y="${HDR_H - 12}" text-anchor="middle"
        font-size="10" font-weight="700" fill="#fff" letter-spacing="1.8">${escSvg(curTitle.toUpperCase())}</text>

  <!-- ── Arrow between panels ──────────────────────────────── -->
  <text x="${PANEL_W + GAP / 2}" y="${HDR_H + BODY_H / 2 + 6}"
        text-anchor="middle" font-size="28" fill="#C8CACC" font-weight="300">→</text>

  <!-- ── Right panel ────────────────────────────────────────── -->
  <rect x="${PANEL_W + GAP}" y="0" width="${PANEL_W}" height="${TOTAL_H}" rx="8"
        fill="${LIGHT_G}" stroke="${GREEN}" stroke-width="1.5"/>
  <rect x="${PANEL_W + GAP}" y="0" width="${PANEL_W}" height="${HDR_H}" rx="8" fill="${GREEN}"/>
  <rect x="${PANEL_W + GAP}" y="${HDR_H - 10}" width="${PANEL_W}" height="10" fill="${GREEN}"/>
  <text x="${PANEL_W + GAP + PANEL_W / 2}" y="${HDR_H - 12}" text-anchor="middle"
        font-size="10" font-weight="700" fill="#fff" letter-spacing="1.8">${escSvg(futTitle.toUpperCase())}</text>

  <!-- ── Diagram content ───────────────────────────────────── -->
  <g transform="translate(0,${HDR_H + 8})">
    ${svgL}
  </g>
  <g transform="translate(0,${HDR_H + 8})">
    ${svgR}
  </g>
</svg>`;
}
