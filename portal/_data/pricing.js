// portal/_data/pricing.js
//
// Exposes parsed pricing values to Eleventy templates as the `pricing` global.
// Source of truth: commons/sales/pricing-model.md.
//
// Usage in templates:  {{ pricing.baseRate }}  {{ pricing.fmt(pricing.implPerFlow) }}

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PM_PATH = path.join(ROOT, 'commons', 'sales', 'pricing-model.md');
const TM_PATH = path.join(ROOT, 'commons', 'sales', 'tm-rates.json');

function num(s)  { return parseFloat(String(s).replace(/[,$]/g, '')); }
function fmt(v)  { return '$' + Math.round(v).toLocaleString('en-US'); }
function fmtD(v) { return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

module.exports = function() {
  const md = fs.existsSync(PM_PATH) ? fs.readFileSync(PM_PATH, 'utf8') : '';

  const baseRate    = num((md.match(/\*\*Rate:\*\* \$([0-9,]+(?:\.\d+)?)/) || [, '300'])[1]);
  const escalation  = parseFloat(((md.match(/escalating (\d+)%/) || [, '5'])[1])) / 100;
  const p2rate      = Math.round(baseRate * (1 + escalation) * 100) / 100;
  const retainer1   = num((md.match(/1[–\-]5 flows[^|]*\|\s*\$([0-9,]+)/) || [, '2500'])[1]);
  const retainer2   = num((md.match(/6[–\-]10 flows[^|]*\|\s*\$([0-9,]+)/) || [, '5000'])[1]);
  const implPerFlow = num((md.match(/\| Standard \| \$([0-9,]+)/) || [, '3500'])[1]);
  const coMod       = num((md.match(/\*\*Modification\*\*[^|]*\|\s*\$([0-9,]+)/) || [, '750'])[1]);
  const coExt       = num((md.match(/\*\*Extension\*\*[^|]*\|\s*\$([0-9,]+)/) || [, '1500'])[1]);
  const replacement = num((md.match(/replacement fee: \$([0-9,]+)/) || [, '1500'])[1]);

  const tm = fs.existsSync(TM_PATH) ? JSON.parse(fs.readFileSync(TM_PATH, 'utf8')) : null;

  return {
    baseRate, p2rate, retainer1, retainer2, implPerFlow, coMod, coExt, replacement,
    escalation,
    formatted: {
      baseRate:    fmtD(baseRate),
      p2rate:      fmtD(p2rate),
      retainerRange: `${fmt(retainer1)}–${fmt(retainer2)}`,
      implPerFlow: fmt(implPerFlow),
      coMod:       fmt(coMod),
      coExt:       fmt(coExt),
      replacement: fmt(replacement),
    },
    tm,
    fmt, fmtD,
  };
};
