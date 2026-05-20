#!/usr/bin/env node
/**
 * generate-diagrams.js <client-slug>
 *
 * Reads project.json systemDiagram.current + .future (Mermaid graph LR strings),
 * renders a two-panel side-by-side SVG (current state in red / future state in green),
 * and saves it to projects/{client}/intake/system-diagram.svg.
 *
 * Called automatically by fill-template.js when building proposal or integration deck.
 * Can also be run directly: node scripts/generate-diagrams.js homage
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const slug = process.argv[2];

if (!slug) {
  console.error('Usage: node scripts/generate-diagrams.js <client-slug>');
  process.exit(1);
}

const projPath = path.join(ROOT, 'projects', slug, 'project.json');
if (!fs.existsSync(projPath)) {
  console.error(`No project.json at projects/${slug}/project.json`);
  process.exit(1);
}

const proj = JSON.parse(fs.readFileSync(projPath, 'utf8'));
const diagrams = proj.systemDiagram;
if (!diagrams) {
  console.error(`No systemDiagram in projects/${slug}/project.json`);
  process.exit(1);
}

const svg = buildDualPanelSvg(diagrams.current, diagrams.future);
const outPath = path.join(ROOT, 'projects', slug, 'intake', 'system-diagram.svg');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, svg);
console.log(`✓ Written: projects/${slug}/intake/system-diagram.svg`);

// ─── Mermaid graph LR parser ─────────────────────────────────────────────────

function parseMermaid(text) {
  if (!text) return { nodes: {}, edges: [] };
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && l !== 'graph LR');
  const nodes = {}; // id → { id, label, fill, stroke, color }
  const edges = []; // { from, to, label }

  function ensureNode(id, label) {
    if (!nodes[id]) nodes[id] = { id, label: label || id, fill: null, stroke: null, color: null };
    else if (label && label !== id) nodes[id].label = label;
  }

  for (const line of lines) {
    // style CE fill:#FFF5F5,stroke:#ed1c24,color:#c0392b
    const styleM = line.match(/^style\s+(\w+)\s+(.*)/);
    if (styleM) {
      const [, id, styleStr] = styleM;
      ensureNode(id, null);
      nodes[id].fill   = (styleStr.match(/fill:([^,;\s]+)/)   || [])[1] || null;
      nodes[id].stroke = (styleStr.match(/stroke:([^,;\s]+)/) || [])[1] || null;
      nodes[id].color  = (styleStr.match(/color:([^,;\s]+)/)  || [])[1] || null;
      continue;
    }

    // Edge with optional node labels:
    // SH["Shopify Plus"] -->|"22 flows"| CE["Celigo\n(Sikich managed)"]
    // SH["Shopify Plus"] --> CE
    // SH --> CE["Celigo"]
    const edgeM = line.match(/^(\w+)(?:\["([^"]*)"\])?\s*-->(?:\|"?([^"|]*)"?\|)?\s*(\w+)(?:\["([^"]*)"\])?/);
    if (edgeM) {
      const [, fromId, fromLbl, edgeLbl, toId, toLbl] = edgeM;
      ensureNode(fromId, fromLbl ? fromLbl.replace(/\\n/g, '\n') : null);
      ensureNode(toId,   toLbl   ? toLbl.replace(/\\n/g, '\n')   : null);
      edges.push({ from: fromId, to: toId, label: edgeLbl ? edgeLbl.trim() : null });
    }
  }

  return { nodes, edges };
}

// ─── Layout: assign column + row to each node ────────────────────────────────

function layoutGraph(nodes, edges) {
  const ids = Object.keys(nodes);
  if (!ids.length) return {};

  const outDegree = {}, inDegree = {};
  ids.forEach(id => { outDegree[id] = 0; inDegree[id] = 0; });
  edges.forEach(e => { outDegree[e.from] = (outDegree[e.from] || 0) + 1; inDegree[e.to] = (inDegree[e.to] || 0) + 1; });

  // Column assignment: BFS from sources
  const col = {};
  const sources = ids.filter(id => !inDegree[id]);
  if (!sources.length) sources.push(ids[0]); // fallback

  const queue = [...sources];
  sources.forEach(id => { col[id] = 0; });

  while (queue.length) {
    const cur = queue.shift();
    edges.filter(e => e.from === cur).forEach(e => {
      const newCol = (col[cur] || 0) + 1;
      if (col[e.to] === undefined || col[e.to] < newCol) {
        col[e.to] = newCol;
        queue.push(e.to);
      }
    });
  }
  ids.forEach(id => { if (col[id] === undefined) col[id] = 0; });

  // Group by column
  const byCol = {};
  ids.forEach(id => {
    const c = col[id];
    if (!byCol[c]) byCol[c] = [];
    byCol[c].push(id);
  });

  const layout = {};
  Object.entries(byCol).forEach(([c, colIds]) => {
    colIds.forEach((id, rowIdx) => {
      layout[id] = { col: Number(c), row: rowIdx, totalInCol: colIds.length };
    });
  });

  return layout;
}

// ─── SVG for one panel ────────────────────────────────────────────────────────

function buildPanelSvg(diagram, panelW, accent, lightBg, x0 = 0) {
  if (!diagram || !diagram.mermaid) return { svg: '', height: 100 };

  const { nodes, edges } = parseMermaid(diagram.mermaid);
  const layout = layoutGraph(nodes, edges);
  const ids = Object.keys(nodes);

  // Dimensions
  const BOX_W = 110, BOX_H = 38, COL_GAP = 55, ROW_H = 52, PAD = 16;
  const cols = Math.max(...Object.values(layout).map(l => l.col)) + 1;
  const maxRows = Math.max(...Object.values(layout).map(l => l.totalInCol), 1);
  const contentH = maxRows * ROW_H;
  const contentW = cols * (BOX_W + COL_GAP) - COL_GAP;
  const svgH = contentH + PAD * 2;

  // Center the content in the panel
  const startX = x0 + (panelW - contentW) / 2;

  function nodeX(id) {
    return startX + layout[id].col * (BOX_W + COL_GAP);
  }
  function nodeY(id) {
    const { row, totalInCol } = layout[id];
    const colH = totalInCol * ROW_H;
    const offsetY = (contentH - colH) / 2 + PAD;
    return offsetY + row * ROW_H + ROW_H / 2;
  }

  let parts = [];

  // Edges first (behind boxes)
  edges.forEach(({ from, to, label }) => {
    if (!layout[from] || !layout[to]) return;
    const x1 = nodeX(from) + BOX_W;
    const y1 = nodeY(from);
    const x2 = nodeX(to);
    const y2 = nodeY(to);
    const mx = (x1 + x2) / 2;
    parts.push(`<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="#C8CACC" stroke-width="1.5" marker-end="url(#arr)"/>`);
    if (label) {
      const lx = (x1 + x2) / 2;
      const ly = (y1 + y2) / 2 - 5;
      parts.push(`<text x="${lx}" y="${ly}" text-anchor="middle" font-size="9" fill="var(--mid)" font-style="italic">${escSvg(label)}</text>`);
    }
  });

  // Boxes
  ids.forEach(id => {
    if (!layout[id]) return;
    const n = nodes[id];
    const x = nodeX(id);
    const y = nodeY(id) - BOX_H / 2;

    const fill   = n.fill   || '#fff';
    const stroke = n.stroke || 'var(--border)';
    const color  = n.color  || 'var(--dark)';

    const labelLines = n.label.split('\n');
    const isMulti = labelLines.length > 1;
    const lineH = 13;
    const totalTextH = labelLines.length * lineH;
    const textY = y + BOX_H / 2 - totalTextH / 2 + lineH - 2;

    parts.push(`<rect x="${x}" y="${y}" width="${BOX_W}" height="${BOX_H}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`);
    labelLines.forEach((line, i) => {
      const bold = i === 0 && isMulti ? ' font-weight="600"' : '';
      const fsize = line.length > 14 ? '9' : '10';
      parts.push(`<text x="${x + BOX_W / 2}" y="${textY + i * lineH}" text-anchor="middle" font-size="${fsize}" fill="${color}"${bold}>${escSvg(line)}</text>`);
    });
  });

  return { svg: parts.join('\n'), height: svgH };
}

// ─── Two-panel composite SVG ──────────────────────────────────────────────────

function buildDualPanelSvg(current, future) {
  // Design standards colors
  const BRAND    = '#ed1c24'; // --brand
  const GREEN    = '#2E9E6B'; // --green
  const BORDER   = '#E8E0E0'; // --border
  const DARK     = '#1A1A1A'; // --dark
  const MID      = '#555F6E'; // --mid
  const LIGHT_R  = '#FFF5F5'; // --light (red tint, current state panel bg)
  const LIGHT_G  = '#F0FFF8'; // green tint, future state panel bg

  const TOTAL_W  = 860;
  const PANEL_W  = 400;
  const GAP      = 60;
  const HEADER_H = 36;
  const PAD_V    = 12;

  const { svg: svgL, height: hL } = buildPanelSvg(current, PANEL_W, BRAND, LIGHT_R, 0);
  const { svg: svgR, height: hR } = buildPanelSvg(future,  PANEL_W, GREEN, LIGHT_G, PANEL_W + GAP);

  const contentH = Math.max(hL, hR);
  const TOTAL_H  = HEADER_H + contentH + PAD_V * 2;

  const curTitle = (current && current.title) || 'Current State';
  const futTitle = (future  && future.title)  || 'Future State';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 ${TOTAL_W} ${TOTAL_H}" width="${TOTAL_W}" height="${TOTAL_H}"
     xmlns="http://www.w3.org/2000/svg"
     style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;">

  <defs>
    <marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
      <path d="M0,0 L0,6 L6,3 Z" fill="#C8CACC"/>
    </marker>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    </style>
  </defs>

  <!-- Current state panel -->
  <rect x="0" y="0" width="${PANEL_W}" height="${TOTAL_H}" rx="8"
        fill="${LIGHT_R}" stroke="${BRAND}" stroke-width="1.5"/>
  <rect x="0" y="0" width="${PANEL_W}" height="${HEADER_H}" rx="8"
        fill="${BRAND}"/>
  <rect x="0" y="${HEADER_H - 8}" width="${PANEL_W}" height="8"
        fill="${BRAND}"/>
  <text x="${PANEL_W / 2}" y="${HEADER_H - 11}" text-anchor="middle"
        font-size="10" font-weight="700" fill="#fff" letter-spacing="1.5">
    ${escSvg(curTitle.toUpperCase())}
  </text>

  <!-- Future state panel -->
  <rect x="${PANEL_W + GAP}" y="0" width="${PANEL_W}" height="${TOTAL_H}" rx="8"
        fill="${LIGHT_G}" stroke="${GREEN}" stroke-width="1.5"/>
  <rect x="${PANEL_W + GAP}" y="0" width="${PANEL_W}" height="${HEADER_H}" rx="8"
        fill="${GREEN}"/>
  <rect x="${PANEL_W + GAP}" y="${HEADER_H - 8}" width="${PANEL_W}" height="8"
        fill="${GREEN}"/>
  <text x="${PANEL_W + GAP + PANEL_W / 2}" y="${HEADER_H - 11}" text-anchor="middle"
        font-size="10" font-weight="700" fill="#fff" letter-spacing="1.5">
    ${escSvg(futTitle.toUpperCase())}
  </text>

  <!-- Arrow between panels -->
  <text x="${PANEL_W + GAP / 2}" y="${TOTAL_H / 2 - 6}" text-anchor="middle"
        font-size="22" fill="#C8CACC">→</text>

  <!-- Diagram content -->
  <g transform="translate(0,${HEADER_H + PAD_V})">
    ${svgL}
  </g>
  <g transform="translate(0,${HEADER_H + PAD_V})">
    ${svgR}
  </g>

</svg>`;
}

function escSvg(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
