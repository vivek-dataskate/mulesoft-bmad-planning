#!/usr/bin/env node
'use strict';
/**
 * generate-diagram.js <client-slug>
 *
 * Registry-driven diagram renderer. Reads diagram-content.json,
 * expands tokens in each .mmd template, runs mmdc to produce SVGs.
 *
 * Usage: node pipeline/scripts/generate-diagram.js homage
 */

const fs            = require('fs');
const path          = require('path');
const os            = require('os');
const { spawnSync } = require('child_process');

const ROOT            = path.join(__dirname, '../..');
const MULESOFT_LOGO   = path.join(ROOT, 'commons', 'branding', 'logos', 'mulesoft-logo.svg');
const slug = process.argv[2];

if (!slug) {
  console.error('Usage: node pipeline/scripts/generate-diagram.js <slug>');
  process.exit(1);
}

const CONTENT_PATH = path.join(ROOT, 'projects', slug, 'intake', 'diagrams', 'diagram-content.json');
const THEME_PATH   = path.join(ROOT, 'commons', 'diagram-theme.json');
const PUPPET_CFG   = path.join(ROOT, 'commons', 'puppeteer-config.json');
const OUT_DIR      = path.join(ROOT, 'projects', slug, 'intake', 'diagrams');

if (!fs.existsSync(CONTENT_PATH)) {
  console.error(`No diagram-content.json at projects/${slug}/intake/diagrams/ — run orchestrate.js first`);
  process.exit(1);
}

const content = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Token expansion ───────────────────────────────────────────────────────────

// Tokens whose values are comma/bullet-separated system lists.
// Value → expanded to Mermaid node definitions + tracked for edge generation.
const SYSTEM_LIST_TOKENS = {
  '__CURRENT_SYSTEMS__': 'source',
  '__DEPRECATED__':      'deprecated',
  '__HUB__':             'hub',
  '__TARGETS__':         'target',
  '__CONFIRMED_FLOWS__': 'inscope',
  '__IN_SCOPE__':        'inscope',
  '__OUT_OF_SCOPE__':    'outscope',
  '__P0_BLOCKERS__':     'blocker',
};

function slugifyId(name) {
  return name.toLowerCase()
    .replace(/[·•\/\(\)]/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

function parseSystems(value) {
  if (!value) return [];
  return value.split(/,\s*|\s*·\s*|\n/).map(s => s.trim()).filter(Boolean);
}

function sanitizeLabel(name) {
  return name
    .replace(/→|>/g, '-')      // arrows break Mermaid label parsing
    .replace(/[()]/g, '')       // parens cause shape-token conflicts
    .replace(/"/g, "'")
    .trim();
}

function expandSystemNodes(value, className) {
  const systems = parseSystems(value);
  const nodeIds = [];
  const lines   = systems.map(name => {
    const id    = slugifyId(name);
    const label = sanitizeLabel(name);
    nodeIds.push(id);
    return `    ${id}["${label}"]:::${className}`;
  });
  return { lines, nodeIds };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expandTokens(rawMmd, tokens) {
  // Pass 1: expand system list tokens, track node IDs for edge derivation
  const nodeIdMap = {};

  for (const [tokenName, className] of Object.entries(SYSTEM_LIST_TOKENS)) {
    if (!(tokenName in tokens)) continue;
    const value = tokens[tokenName];
    if (!value) {
      rawMmd = rawMmd.replace(new RegExp(escapeRegex(tokenName), 'g'), `    %% ${tokenName} not provided`);
      nodeIdMap[tokenName] = [];
      continue;
    }
    const { lines, nodeIds } = expandSystemNodes(value, className);
    nodeIdMap[tokenName] = nodeIds;
    rawMmd = rawMmd.replace(new RegExp(escapeRegex(tokenName), 'g'), lines.join('\n'));
  }

  // Pass 2: derive edge tokens from node ID map
  const hubIds = nodeIdMap['__HUB__'] || [];
  const hubId  = hubIds[0] || 'hub';

  if (rawMmd.includes('__CURRENT_SYSTEMS_EDGES__')) {
    const ids   = nodeIdMap['__CURRENT_SYSTEMS__'] || [];
    const edges = ids.length
      ? ids.map(id => `    ${id} --> ${hubId}`).join('\n')
      : `    %% no current systems`;
    rawMmd = rawMmd.replace(/__CURRENT_SYSTEMS_EDGES__/g, edges);
  }

  if (rawMmd.includes('__DEPRECATED_EDGES__')) {
    const ids   = nodeIdMap['__DEPRECATED__'] || [];
    const edges = ids.length
      ? ids.map(id => `    ${id} -.->|"replaced by"| ${hubId}`).join('\n')
      : `    %% no deprecated systems`;
    rawMmd = rawMmd.replace(/__DEPRECATED_EDGES__/g, edges);
  }

  if (rawMmd.includes('__TARGETS_EDGES__')) {
    const ids   = nodeIdMap['__TARGETS__'] || [];
    const edges = ids.length
      ? ids.map(id => `    ${hubId} --> ${id}`).join('\n')
      : `    %% no targets`;
    rawMmd = rawMmd.replace(/__TARGETS_EDGES__/g, edges);
  }

  // Pass 3: simple text substitution for all remaining tokens
  for (const [tokenName, value] of Object.entries(tokens)) {
    if (tokenName in SYSTEM_LIST_TOKENS) continue;
    rawMmd = rawMmd.replace(new RegExp(escapeRegex(tokenName), 'g'), value ?? '');
  }

  // Mark any unresolved tokens as Mermaid comments so the diagram still renders
  rawMmd = rawMmd.replace(/__[A-Z_]+__/g, match => `%% TODO: ${match}`);

  return rawMmd;
}

// ── Custom SVG renderer — ownership-lattice ──────────────────────────────────
// Reads vera.json corporateStack directly; no token substitution needed.
// Handles all ownership shapes: independent, pe-backed, platform-of-brands,
// pe-backed-platform-of-brands. Layout scales to any sibling count.

function renderOwnershipLatticeSvg(slug, rootDir) {
  const veraPath = path.join(rootDir, 'projects', slug, 'scoping', 'run', 'vera.json');
  if (!fs.existsSync(veraPath)) {
    throw new Error(`vera.json not found at projects/${slug}/scoping/run/vera.json — run Vera first`);
  }
  const vera = JSON.parse(fs.readFileSync(veraPath, 'utf8'));
  const cs   = vera.corporateStack;
  if (!cs) throw new Error('vera.json missing corporateStack');

  const sponsorName  = cs.financialSponsor?.name   || null;
  const platformName = cs.operatingPlatform?.name  || null;
  const allSiblings  = cs.operatingPlatform?.siblingBrands || [];
  const brandName    = cs.operatingBrand?.name     || slug;
  const rawBoltOns   = cs.operatingBrand?.legacyBoltOns || [];
  const boltOnCount  = rawBoltOns.length;

  const MAX_VISIBLE = 8;
  const displayed = allSiblings.length > MAX_VISIBLE
    ? [...allSiblings.slice(0, MAX_VISIBLE), { name: `+${allSiblings.length - MAX_VISIBLE} more`, _isMore: true }]
    : allSiblings;

  // ── Layout constants ──────────────────────────────────────────────────────
  const PAD_X  = 28, PAD_Y = 28;
  const LEVEL_H = 74;
  const NODE_H  = 32, NODE_RX = 6;
  const H_GAP   = 10;

  const sibCount = displayed.length;
  const NODE_W   = sibCount === 0 ? 200
                 : sibCount <= 2  ? 170
                 : sibCount <= 4  ? 140
                 : sibCount <= 6  ? 115
                 :                   92;

  // ── Build level list ──────────────────────────────────────────────────────
  const levels = [];
  if (sponsorName)  levels.push({ key: 'sponsor',  nodes: [{ label: sponsorName,  style: 'sponsor'  }] });

  if (platformName && displayed.length > 0) {
    levels.push({ key: 'platform', nodes: [{ label: platformName, style: 'platform' }] });
    levels.push({ key: 'siblings', nodes: displayed.map(s => ({
      label: s.name,
      style: s._isMore ? 'more' : s.isCurrentClient ? 'current' : 'sibling',
      isCurrentClient: s.isCurrentClient || false,
    })) });
  } else if (platformName) {
    levels.push({ key: 'platform', nodes: [{ label: platformName, style: 'platform' }] });
    levels.push({ key: 'brand',    nodes: [{ label: brandName,    style: 'current'  }] });
  } else {
    levels.push({ key: 'brand',    nodes: [{ label: brandName,    style: 'current'  }] });
  }

  if (boltOnCount > 0) {
    const names    = rawBoltOns.slice(0, 3).map(b => (typeof b === 'string' ? b : b.name));
    const overflow = boltOnCount > 3 ? ` +${boltOnCount - 3} more` : '';
    levels.push({ key: 'boltOns', nodes: [{ label: `${names.join(', ')}${overflow}`, style: 'boltOns' }] });
  }

  // ── Canvas size ───────────────────────────────────────────────────────────
  const maxNodes = Math.max(...levels.map(l => l.nodes.length));
  const rowW     = maxNodes * NODE_W + (maxNodes - 1) * H_GAP;
  const svgW     = Math.max(rowW + PAD_X * 2, 320);
  const svgH     = levels.length * LEVEL_H + NODE_H + PAD_Y * 2;

  // ── Compute node positions ────────────────────────────────────────────────
  const levelNodes = levels.map((level, li) => {
    const count  = level.nodes.length;
    const totalW = count * NODE_W + (count - 1) * H_GAP;
    const startX = (svgW - totalW) / 2;
    const y      = PAD_Y + li * LEVEL_H;
    return level.nodes.map((n, ni) => ({
      ...n,
      x:  startX + ni * (NODE_W + H_GAP),
      y,
      cx: startX + ni * (NODE_W + H_GAP) + NODE_W / 2,
    }));
  });

  // ── Style map ─────────────────────────────────────────────────────────────
  const STYLES = {
    sponsor:  { fill: '#F0FFF4', stroke: '#2E9E6B', sw: 2,   textCls: 'lat-s', dash: ''    },
    platform: { fill: '#FFF8E1', stroke: '#D97706', sw: 2,   textCls: 'lat-p', dash: ''    },
    current:  { fill: '#EBF7FD', stroke: '#00a1df', sw: 2.5, textCls: 'lat-c', dash: ''    },
    sibling:  { fill: '#fff',    stroke: '#D4D4D8', sw: 1.5, textCls: 'lat-d', dash: ''    },
    more:     { fill: '#F8F8F8', stroke: '#D4D4D8', sw: 1,   textCls: 'lat-m', dash: '3 3' },
    boltOns:  { fill: '#F8F8F8', stroke: '#D4D4D8', sw: 1.5, textCls: 'lat-b', dash: '4 4' },
  };

  function trunc(str, max) {
    if (!str) return '';
    return String(str).length > max ? String(str).slice(0, max - 1) + '…' : String(str);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const out = [];
  out.push(`<svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%;max-width:${svgW}px;height:auto;display:block;margin:8px auto;" xmlns="http://www.w3.org/2000/svg">`);
  out.push(`<defs>
  <marker id="al"  markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 Z" fill="#bbb"/></marker>
  <marker id="alb" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 Z" fill="#00a1df"/></marker>
  <style>
    .lat-s{font:600 11px system-ui,sans-serif;fill:#276749;text-anchor:middle}
    .lat-p{font:600 11px system-ui,sans-serif;fill:#92400e;text-anchor:middle}
    .lat-c{font:700 11px system-ui,sans-serif;fill:#005f8f;text-anchor:middle}
    .lat-d{font:600 11px system-ui,sans-serif;fill:#1A1A1A;text-anchor:middle}
    .lat-m{font:400 10px system-ui,sans-serif;fill:#888;text-anchor:middle}
    .lat-b{font:400 10px system-ui,sans-serif;fill:#666;text-anchor:middle}
    .lat-e{stroke:#ccc;stroke-width:1.5;fill:none}
    .lat-ec{stroke:#00a1df;stroke-width:1.5;fill:none}
  </style>
</defs>`);

  // Draw edges
  for (let li = 0; li < levelNodes.length - 1; li++) {
    const from = levelNodes[li];
    const to   = levelNodes[li + 1];
    const fromCX = from.reduce((s, n) => s + n.cx, 0) / from.length;
    const fromY  = from[0].y + NODE_H;
    const toY    = to[0].y;
    const toHasCurrent = to.some(n => n.isCurrentClient);
    const isBoltLevel  = levels[li + 1]?.key === 'boltOns';
    const edgeCls  = (toHasCurrent || isBoltLevel) ? 'lat-ec' : 'lat-e';
    const markerEnd = (toHasCurrent || isBoltLevel) ? 'url(#alb)' : 'url(#al)';

    if (to.length === 1) {
      out.push(`<line class="${edgeCls}" x1="${fromCX.toFixed(1)}" y1="${fromY}" x2="${to[0].cx.toFixed(1)}" y2="${toY}" marker-end="${markerEnd}"/>`);
    } else {
      const busY   = fromY + (toY - fromY) * 0.5;
      const leftX  = to[0].cx;
      const rightX = to[to.length - 1].cx;
      out.push(`<line class="${edgeCls}" x1="${fromCX.toFixed(1)}" y1="${fromY}" x2="${fromCX.toFixed(1)}" y2="${busY.toFixed(1)}"/>`);
      out.push(`<line class="${edgeCls}" x1="${leftX.toFixed(1)}" y1="${busY.toFixed(1)}" x2="${rightX.toFixed(1)}" y2="${busY.toFixed(1)}"/>`);
      to.forEach(n => {
        const cls = n.isCurrentClient ? 'lat-ec' : 'lat-e';
        const me  = n.isCurrentClient ? 'url(#alb)' : 'url(#al)';
        out.push(`<line class="${cls}" x1="${n.cx.toFixed(1)}" y1="${busY.toFixed(1)}" x2="${n.cx.toFixed(1)}" y2="${toY}" marker-end="${me}"/>`);
      });
    }
  }

  // Draw nodes
  for (const level of levelNodes) {
    for (const n of level) {
      const s = STYLES[n.style] || STYLES.sibling;
      const dashAttr = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
      out.push(`<rect x="${n.x.toFixed(1)}" y="${n.y.toFixed(1)}" width="${NODE_W}" height="${NODE_H}" rx="${NODE_RX}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.sw}"${dashAttr}/>`);
      const maxChars = n.style === 'boltOns' ? 60 : NODE_W < 100 ? 12 : NODE_W < 125 ? 15 : NODE_W < 150 ? 18 : 22;
      const prefix   = n.isCurrentClient ? '★ ' : '';
      const label    = prefix + trunc(n.label, maxChars - prefix.length);
      out.push(`<text class="${s.textCls}" x="${n.cx.toFixed(1)}" y="${(n.y + NODE_H / 2 + 4).toFixed(1)}">${escSvg(label)}</text>`);
    }
  }

  out.push(`</svg>`);
  return out.join('\n');
}

// ── Custom SVG renderer — system-flow ────────────────────────────────────────
// Replicates the hand-crafted system-diagram.svg format exactly:
// sources (left) → MuleSoft hub (centre) → targets (right)
// Driven by DaC tokens; systems can appear on both sides (bidirectional).

function escSvg(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getMulesoftLogoB64() {
  if (!fs.existsSync(MULESOFT_LOGO)) return null;
  return Buffer.from(fs.readFileSync(MULESOFT_LOGO)).toString('base64');
}

function renderSystemFlowSvg(tokens) {
  const sources = parseSystems(tokens['__CURRENT_SYSTEMS__'] || '');
  const targets = parseSystems(tokens['__TARGETS__'] || '');

  const BOX_W = 140, BOX_H = 32, BOX_RX = 6, ROW_GAP = 7, ROW_H = BOX_H + ROW_GAP;
  const HUB_W = 120, HUB_RX = 8;
  const SRC_X = 5,  SRC_CX = SRC_X + BOX_W / 2;           // left col: x=5, cx=75
  const TGT_X = 355, TGT_CX = TGT_X + BOX_W / 2;          // right col: x=355, cx=425
  const HUB_CX = 250, HUB_X = HUB_CX - HUB_W / 2;         // centre: x=190
  const PAD_Y = 16;

  // Logo: embed if available, size to fit hub width
  const logoB64 = getMulesoftLogoB64();
  const LOGO_W = 80, LOGO_H = 30;                            // scaled from 120×60 viewBox
  // Hub height: with logo → 16(pad) + 30(logo) + 4(gap) + 14(text) + 8(pad) = 72
  //             text-only → 52 (matching old hand-crafted SVG)
  const HUB_H   = logoB64 ? 72 : 52;
  const HUB_LOGO_Y_OFF = 10;                                 // logo top offset within hub
  const HUB_TXT_Y_OFF  = logoB64 ? HUB_LOGO_Y_OFF + LOGO_H + 10 : 22;
  const HUB_SUB_Y_OFF  = HUB_TXT_Y_OFF + 14;

  const srcH = sources.length ? sources.length * ROW_H - ROW_GAP : 0;
  const tgtH = targets.length ? targets.length * ROW_H - ROW_GAP : 0;
  const svgH = Math.max(srcH, tgtH, HUB_H) + PAD_Y * 2;
  const hubCY = svgH / 2;
  const hubY  = hubCY - HUB_H / 2;

  const lines = [];

  lines.push(`<svg viewBox="0 0 500 ${svgH.toFixed(0)}" style="width:100%;max-width:500px;height:auto;display:block;margin:8px auto;" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`);
  lines.push(`  <defs>
    <marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 Z" fill="var(--border)"/></marker>
    <style>
      .sv-src,.sv-tgt{fill:#fff;stroke:var(--border);stroke-width:1.5}
      .sv-line{stroke:var(--border);stroke-width:1.5;fill:none}
      .sv-lsrc,.sv-ltgt{font:600 11px system-ui,sans-serif;fill:var(--dark)}
    </style>
  </defs>`);

  // Source nodes + lines to hub
  const srcStartY = (svgH - srcH) / 2;
  sources.forEach((name, i) => {
    const boxY = srcStartY + i * ROW_H;
    const cy   = boxY + BOX_H / 2;
    lines.push(`  <rect class="sv-src" x="${SRC_X}" y="${boxY.toFixed(1)}" width="${BOX_W}" height="${BOX_H}" rx="${BOX_RX}"/>`);
    lines.push(`    <text class="sv-lsrc" x="${SRC_CX}" y="${(cy + 4).toFixed(1)}" text-anchor="middle">${escSvg(name)}</text>`);
    lines.push(`    <line class="sv-line" x1="${SRC_X + BOX_W}" y1="${cy.toFixed(1)}" x2="${HUB_X}" y2="${hubCY.toFixed(1)}" marker-end="url(#arr)"/>`);
  });

  // Hub box — static, hardcoded MuleSoft branding (#00a1df is MuleSoft's official blue)
  lines.push(`  <rect x="${HUB_X}" y="${hubY.toFixed(1)}" width="${HUB_W}" height="${HUB_H}" rx="${HUB_RX}" fill="#EBF7FD" stroke="#00a1df" stroke-width="2"/>`);

  if (logoB64) {
    const logoX = (HUB_CX - LOGO_W / 2).toFixed(1);
    const logoY = (hubY + HUB_LOGO_Y_OFF).toFixed(1);
    lines.push(`  <image href="data:image/svg+xml;base64,${logoB64}" xlink:href="data:image/svg+xml;base64,${logoB64}" x="${logoX}" y="${logoY}" width="${LOGO_W}" height="${LOGO_H}"/>`);
    lines.push(`  <text x="${HUB_CX}" y="${(hubY + HUB_SUB_Y_OFF).toFixed(1)}" text-anchor="middle" font="400 9px system-ui,sans-serif" style="font:400 9px system-ui,sans-serif;fill:#00a1df">DataSkate Managed</text>`);
  } else {
    lines.push(`  <text x="${HUB_CX}" y="${(hubY + HUB_TXT_Y_OFF).toFixed(1)}" text-anchor="middle" style="font:700 12px system-ui,sans-serif;fill:#00a1df">MuleSoft</text>`);
    lines.push(`  <text x="${HUB_CX}" y="${(hubY + HUB_SUB_Y_OFF).toFixed(1)}" text-anchor="middle" style="font:400 9px system-ui,sans-serif;fill:#00a1df">DataSkate Managed</text>`);
  }

  // Target nodes + lines from hub
  const tgtStartY = (svgH - tgtH) / 2;
  targets.forEach((name, i) => {
    const boxY = tgtStartY + i * ROW_H;
    const cy   = boxY + BOX_H / 2;
    lines.push(`  <rect class="sv-tgt" x="${TGT_X}" y="${boxY.toFixed(1)}" width="${BOX_W}" height="${BOX_H}" rx="${BOX_RX}"/>`);
    lines.push(`    <text class="sv-ltgt" x="${TGT_CX}" y="${(cy + 4).toFixed(1)}" text-anchor="middle">${escSvg(name)}</text>`);
    lines.push(`    <line class="sv-line" x1="${HUB_X + HUB_W}" y1="${hubCY.toFixed(1)}" x2="${TGT_X}" y2="${cy.toFixed(1)}" marker-end="url(#arr)"/>`);
  });

  lines.push(`</svg>`);
  return lines.join('\n');
}

// ── Brand lint ────────────────────────────────────────────────────────────────

const LINT_DIAGRAM = path.join(ROOT, 'commons', 'branding', 'lint-diagram.js');

function lintTemplate(templatePath) {
  const result = spawnSync(process.execPath, [LINT_DIAGRAM, templatePath], {
    cwd: ROOT, encoding: 'utf8', stdio: 'pipe',
  });
  if (result.status !== 0) {
    process.stderr.write((result.stdout || '') + (result.stderr || ''));
    return false;
  }
  return true;
}

// ── mmdc runner ───────────────────────────────────────────────────────────────

function findMmdc() {
  const localBin = path.join(ROOT, 'node_modules', '.bin', 'mmdc');
  if (fs.existsSync(localBin)) return { cmd: localBin, args: [] };
  // Fall back to npx
  const which = spawnSync('which', ['npx'], { encoding: 'utf8' });
  if (which.status === 0) return { cmd: 'npx', args: ['mmdc'] };
  return null;
}

function renderDiagram(mmdContent, outputPath) {
  const tmpFile = path.join(os.tmpdir(), `ds-diagram-${Date.now()}-${Math.random().toString(36).slice(2)}.mmd`);
  try {
    fs.writeFileSync(tmpFile, mmdContent, 'utf8');

    const runner = findMmdc();
    if (!runner) {
      process.stderr.write('  ✗ mmdc not found — run: npm install --save-dev @mermaid-js/mermaid-cli\n');
      return false;
    }

    const mmdcArgs = [
      ...runner.args,
      '-i', tmpFile,
      '-o', outputPath,
      '--quiet',
      '-b', 'transparent',
    ];
    if (fs.existsSync(THEME_PATH))  mmdcArgs.push('-c', THEME_PATH);
    if (fs.existsSync(PUPPET_CFG))  mmdcArgs.push('-p', PUPPET_CFG);

    const result = spawnSync(runner.cmd, mmdcArgs, {
      cwd:      ROOT,
      encoding: 'utf8',
      stdio:    'pipe',
      env:      { ...process.env, PUPPETEER_SKIP_DOWNLOAD: '1' },
    });

    if (result.error) {
      process.stderr.write(`  ✗ mmdc error: ${result.error.message}\n`);
      return false;
    }
    if (result.status !== 0) {
      process.stderr.write(`  ✗ mmdc exit ${result.status}: ${(result.stderr || '').trim()}\n`);
      return false;
    }
    return true;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* non-fatal */ }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

let succeeded = 0;
let failed    = 0;

for (const diagram of (content.diagrams || [])) {
  const templatePath = path.join(ROOT, diagram.templateRef);

  if (!fs.existsSync(templatePath)) {
    process.stderr.write(`  ⚠  Template not found: ${diagram.templateRef} — skipping ${diagram.id}\n`);
    failed++;
    continue;
  }

  const rawMmd   = fs.readFileSync(templatePath, 'utf8');
  const expanded = expandTokens(rawMmd, diagram.tokens || {});
  const outFile  = `${diagram.id}.svg`;
  const outPath  = path.join(OUT_DIR, outFile);

  // ownership-lattice: fully programmatic SVG — skip lint, renderer reads vera.json directly
  if (diagram.id === 'ownership-lattice') {
    const outFile = `${diagram.id}.svg`;
    const outPath = path.join(OUT_DIR, outFile);
    process.stdout.write(`  → ${diagram.id} (${diagram.level}/${diagram.type}) ... `);
    try {
      const svgContent = renderOwnershipLatticeSvg(slug, ROOT);
      fs.writeFileSync(outPath, svgContent, 'utf8');
      const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
      process.stdout.write(`✓  ${outFile} (${kb} KB)\n`);
      succeeded++;
    } catch (err) {
      process.stderr.write(`  ✗ ownership lattice renderer error: ${err.message}\n`);
      failed++;
    }
    continue;
  }

  if (!lintTemplate(templatePath)) {
    process.stderr.write(`  ✗ Brand lint failed for ${diagram.templateRef} — fix violations before rendering\n`);
    failed++;
    continue;
  }

  process.stdout.write(`  → ${diagram.id} (${diagram.level}/${diagram.type}) ... `);

  // system-flow uses the custom SVG renderer (exact match to old hand-crafted format)
  if (diagram.id === 'system-flow') {
    try {
      const svgContent = renderSystemFlowSvg(diagram.tokens || {});
      fs.writeFileSync(outPath, svgContent, 'utf8');
      const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
      process.stdout.write(`✓  ${outFile} (${kb} KB)\n`);
      succeeded++;
    } catch (err) {
      process.stderr.write(`  ✗ custom renderer error: ${err.message}\n`);
      failed++;
    }
    continue;
  }

  const ok = renderDiagram(expanded, outPath);

  if (ok && fs.existsSync(outPath)) {
    const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
    process.stdout.write(`✓  ${outFile} (${kb} KB)\n`);
    succeeded++;
  } else {
    process.stdout.write(`✗\n`);
    failed++;
  }
}

console.log(`\n  Diagrams: ${succeeded} rendered, ${failed} failed`);
console.log(`  Output: projects/${slug}/intake/diagrams/`);
if (failed > 0) process.exit(1);
