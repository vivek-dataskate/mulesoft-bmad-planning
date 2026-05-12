const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ── Parse pricing-model.md (single source of truth — never hardcode rates here) ──
const pricingMd = fs.readFileSync(path.join(__dirname, 'pricing-model.md'), 'utf8');

function parsePricing(md) {
  const num = s => parseFloat(s.replace(/,/g, ''));

  const baseRate   = num(md.match(/\*\*Rate:\*\* \$([0-9,]+(?:\.\d+)?)/)[1]);
  const escalation = parseFloat(md.match(/escalating (\d+)%/)[1]) / 100;
  const termYears  = parseInt(md.match(/\*\*Minimum term:\*\* (\d+) year/)[1]);
  const stdImpl    = num(md.match(/\| Standard \| \$([0-9,]+) \/ flow/)[1]);
  const newAEFlat  = num(md.match(/\| New AE.*?\$([0-9,]+) flat/)[1]);
  const newAECap   = parseInt(md.match(/≤(\d+) flows/)[1]);

  const periods     = termYears * 2;
  const periodRates = Array.from({ length: periods }, (_, i) =>
    Math.round(baseRate * Math.pow(1 + escalation, i) * 100) / 100
  );

  const fmt    = n => '$' + Math.round(n).toLocaleString('en-US');
  const fmtD   = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pay6mo = (rate, flows) => rate * 6 * flows;
  const termTotal = flows => periodRates.reduce((s, r) => s + pay6mo(r, flows), 0);
  const implFee = (flows, type) => {
    if (type === 'iaas')  return 0;
    if (type === 'newae') return flows <= newAECap ? newAEFlat : newAEFlat + (flows - newAECap) * stdImpl;
    return flows * stdImpl;
  };

  return { baseRate, escalation, termYears, periods, periodRates, stdImpl, newAEFlat, newAECap, fmt, fmtD, pay6mo, termTotal, implFee };
}

const P = parsePricing(pricingMd);

// ── Pre-compute all display values ────────────────────────────────────────
const rateScheduleRows = P.periodRates.map((rate, i) => {
  const start = i * 6 + 1, end = (i + 1) * 6;
  return `    <tr><td>Period ${i + 1}</td><td>${start}–${end}</td><td><strong>${P.fmtD(rate)}</strong></td><td>${P.fmt(P.pay6mo(rate, 1))}</td></tr>`;
}).join('\n');

const pdfExamples = [
  { label: 'Standard — 6 flows',  flows: 6,  type: 'standard' },
  { label: 'New AE — 5 flows',    flows: 5,  type: 'newae'    },
  { label: 'New AE — 7 flows',    flows: 7,  type: 'newae'    },
  { label: 'IaaS — 10 flows',     flows: 10, type: 'iaas'     },
].map(({ label, flows, type }) => {
  const impl  = P.implFee(flows, type);
  const p1    = P.pay6mo(P.periodRates[0], flows);
  const total = P.termTotal(flows);
  const engmt = type === 'iaas' ? `${P.fmt(total)} recurring` : P.fmt(impl + total);
  return `    <tr><td>${label}</td><td>${P.fmt(impl)}</td><td>${P.fmt(p1)}</td><td>${P.fmt(total)}</td><td><strong>${engmt}</strong></td></tr>`;
}).join('\n');

const urgencyDiff  = P.fmt(P.pay6mo(P.periodRates[1] - P.periodRates[0], 1));
const iaas10Y1     = P.fmt(P.pay6mo(P.periodRates[0], 10) * 2); // two periods = year 1
const iaas10Y2     = P.fmt(P.termTotal(10) * (1 + P.escalation)); // approx renewal year

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; background: #fff; }

  .cover {
    height: 100vh; background: linear-gradient(135deg, #1a1a2e 0%, #c0392b 100%);
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    color: white; text-align: center; padding: 60px;
    page-break-after: always;
  }
  .cover .logo { font-size: 48px; font-weight: 900; letter-spacing: -1px; margin-bottom: 20px; }
  .cover .logo span { color: #e74c3c; }
  .cover h1 { font-size: 32px; font-weight: 300; margin-bottom: 16px; }
  .cover .sub { font-size: 16px; opacity: 0.75; }
  .cover .badge { margin-top: 40px; border: 1px solid rgba(255,255,255,0.3); padding: 10px 24px; border-radius: 20px; font-size: 13px; }

  .page { padding: 56px 64px; page-break-after: always; }
  .page:last-child { page-break-after: auto; }

  h2 { font-size: 26px; font-weight: 800; color: #c0392b; margin-bottom: 6px; }
  .divider { width: 48px; height: 4px; background: #c0392b; margin-bottom: 28px; border-radius: 2px; }

  h3 { font-size: 15px; font-weight: 700; color: #1a1a2e; margin: 24px 0 10px; text-transform: uppercase; letter-spacing: 0.5px; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
  th { background: #1a1a2e; color: white; padding: 10px 14px; text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; }
  td { padding: 10px 14px; border-bottom: 1px solid #eee; vertical-align: top; }
  tr:nth-child(even) td { background: #f8f9fb; }
  td strong { color: #c0392b; }

  .highlight-box { background: #f8f9fb; border-left: 4px solid #c0392b; padding: 18px 22px; margin: 20px 0; border-radius: 0 8px 8px 0; }
  .highlight-box p { font-size: 13px; line-height: 1.7; margin-bottom: 8px; }
  .highlight-box p:last-child { margin-bottom: 0; }

  .metric-row { display: flex; gap: 16px; margin: 20px 0; }
  .metric { flex: 1; background: #1a1a2e; color: white; border-radius: 10px; padding: 20px; text-align: center; }
  .metric .value { font-size: 28px; font-weight: 800; color: #e74c3c; }
  .metric .label { font-size: 11px; opacity: 0.75; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.4px; }

  .comparison { display: flex; gap: 16px; margin: 20px 0; }
  .col { flex: 1; border-radius: 10px; padding: 20px; }
  .col.bad { background: #fdf2f2; border: 2px solid #f5c6c6; }
  .col.good { background: #f2fdf4; border: 2px solid #c6f0cc; }
  .col h4 { font-size: 13px; font-weight: 700; margin-bottom: 12px; }
  .col.bad h4 { color: #c0392b; }
  .col.good h4 { color: #27ae60; }
  .col ul { list-style: none; font-size: 12px; line-height: 1.8; }
  .col ul li::before { content: "• "; }
  .col.bad ul li::before { color: #c0392b; }
  .col.good ul li::before { color: #27ae60; }

  .footer { text-align: center; font-size: 11px; color: #999; margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; }

  .pill { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
  .pill.red { background: #fdf2f2; color: #c0392b; }
  .pill.green { background: #f2fdf4; color: #27ae60; }
  .pill.blue { background: #f0f4ff; color: #2c5ce7; }

  p { font-size: 13px; line-height: 1.7; margin-bottom: 12px; color: #444; }
</style>
</head>
<body>

<!-- COVER -->
<div class="cover">
  <div class="logo">data<span>skate</span></div>
  <h1>MuleSoft Integration Services</h1>
  <h1>Pricing & Partnership Model</h1>
  <div class="sub">Managed Integration-as-a-Service | Fixed Rate | Full Service</div>
  <div class="badge">Version 1.0 — May 2026 — Confidential</div>
</div>

<!-- PAGE 1: ENGAGEMENT TYPES -->
<div class="page">
  <h2>Engagement Types</h2>
  <div class="divider"></div>

  <table>
    <tr><th>Type</th><th>Condition</th><th>Implementation Price</th></tr>
    <tr><td>Standard</td><td>Existing AE or DS relationship</td><td><strong>${P.fmt(P.stdImpl)} / flow</strong></td></tr>
    <tr><td>New AE Introductory</td><td>AE's first DataSkate deal</td><td><strong>${P.fmt(P.newAEFlat)} flat</strong> (up to ${P.newAECap} flows)</td></tr>
    <tr><td>New AE — over ${P.newAECap} flows</td><td>Same intro deal, flows ${P.newAECap + 1}+</td><td>${P.fmt(P.newAEFlat)} + <strong>${P.fmt(P.stdImpl)}</strong> per additional flow</td></tr>
    <tr><td>IaaS (Free Build)</td><td>AE sells full $50k Anypoint license</td><td><strong>$0 upfront</strong> — recovered via managed service</td></tr>
  </table>

  <div class="highlight-box">
    <p><strong>New AE Definition:</strong> A MuleSoft AE who has never sourced a deal to DataSkate before. Introductory pricing applies once per AE — second deal onward is standard pricing.</p>
  </div>

  <h3>Implementation Timeline</h3>
  <table>
    <tr><th>Phase</th><th>Duration</th><th>Notes</th></tr>
    <tr><td>Requirements &amp; Analysis</td><td><strong>2 weeks</strong></td><td>Fixed — all engagements</td></tr>
    <tr><td>Development &amp; Testing</td><td><strong>1.5 weeks / flow</strong></td><td>Fixed — no compression for lower-priced deals</td></tr>
  </table>

  <div class="metric-row">
    <div class="metric"><div class="value">9.5 wks</div><div class="label">5 flows</div></div>
    <div class="metric"><div class="value">14 wks</div><div class="label">8 flows</div></div>
    <div class="metric"><div class="value">17 wks</div><div class="label">10 flows</div></div>
  </div>

  <div class="footer">DataSkate — dataskate.ai | vivek@dataskate.ai</div>
</div>

<!-- PAGE 2: MANAGED SERVICE CONTRACT -->
<div class="page">
  <h2>Managed Service Contract</h2>
  <div class="divider"></div>

  <table>
    <tr><th>Term</th><th>Detail</th></tr>
    <tr><td>Base rate</td><td><strong>${P.fmtD(P.baseRate)} / flow / month</strong></td></tr>
    <tr><td>Minimum duration</td><td>${P.termYears} year per flow, from go-live date</td></tr>
    <tr><td>Payment cadence</td><td>Upfront every 6 months (${P.periods} payments over ${P.termYears} year)</td></tr>
    <tr><td>Rate lock</td><td>Fixed at entry rate for the full ${P.termYears}-year term — no mid-contract increases</td></tr>
    <tr><td>Discounts</td><td>None — no exceptions</td></tr>
    <tr><td>Early termination</td><td>Not permitted within the ${P.termYears}-year term</td></tr>
    <tr><td>New flows added mid-contract</td><td>Independent ${P.termYears}-year term at then-current catalog rate</td></tr>
  </table>

  <h3>What Is Included</h3>
  <table>
    <tr><th>Service</th><th>Detail</th></tr>
    <tr><td>Implementation</td><td>Initial build and delivery</td></tr>
    <tr><td>Uptime monitoring</td><td>24/7 monitoring with incident response</td></tr>
    <tr><td>Performance management</td><td>Latency, throughput, error rate tracking and tuning</td></tr>
    <tr><td>Notifications &amp; alerting</td><td>Alert configuration and ongoing management</td></tr>
    <tr><td>Upgrades</td><td>Connector version upgrades, platform compatibility updates</td></tr>
    <tr><td>Minor enhancements</td><td>Field mapping adjustments, config tweaks, performance tuning — no action changes</td></tr>
  </table>

  <div class="highlight-box">
    <p><strong>Not included (requires new SOW):</strong> Action changes — new trigger, new target system, new business logic, new object type. Each new flow is a separate engagement at current pricing.</p>
  </div>

  <div class="footer">DataSkate — dataskate.ai | vivek@dataskate.ai</div>
</div>

<!-- PAGE 3: CATALOG RATE & EXAMPLES -->
<div class="page">
  <h2>Catalog Rate Schedule &amp; Examples</h2>
  <div class="divider"></div>

  <p>The base rate escalates ${P.escalation * 100}% every 6 months. Active flows in a signed contract are rate-locked for the full ${P.termYears}-year term.</p>

  <table>
    <tr><th>Period</th><th>Months</th><th>Rate / Flow / Month</th><th>6-Month Payment (Per Flow)</th></tr>
${rateScheduleRows}
  </table>

  <h3>Pricing Examples</h3>
  <table>
    <tr><th>Scenario</th><th>Implementation</th><th>6-Month Payment</th><th>${P.termYears}-Year Total</th><th>Engagement Value</th></tr>
${pdfExamples}
  </table>

  <div class="highlight-box">
    <p><strong>Rate lock creates natural urgency:</strong> Adding a flow now at ${P.fmtD(P.baseRate)}/month costs ${urgencyDiff} less per 6-month period than waiting until Period 2 (${P.fmtD(P.periodRates[1])}/month). Act in Period 1 to lock the lower rate for the full ${P.termYears}-year term.</p>
  </div>

  <div class="footer">DataSkate — dataskate.ai | vivek@dataskate.ai</div>
</div>

<!-- PAGE 4: VALUE PROPOSITION -->
<div class="page">
  <h2>Value Proposition</h2>
  <div class="divider"></div>

  <h3>For the MuleSoft AE</h3>
  <div class="comparison">
    <div class="col bad">
      <h4>Traditional Deal</h4>
      <ul>
        <li>AE sells $20k license (SI takes the rest)</li>
        <li>SI charges client $30k+ upfront</li>
        <li>No one owns post-go-live</li>
        <li>Integrations break, client blames MuleSoft</li>
        <li>Renewal is a fight</li>
      </ul>
    </div>
    <div class="col good">
      <h4>DataSkate IaaS Deal</h4>
      <ul>
        <li>AE sells full $50k license — full quota</li>
        <li>DS implements for free — zero client friction</li>
        <li>DS owns uptime and performance for ${P.termYears} year (renewable)</li>
        <li>Client is live and succeeding before renewal</li>
        <li>Renewal is a conversation, not a negotiation</li>
      </ul>
    </div>
  </div>

  <h3>For the Client</h3>
  <table>
    <tr><th>Comparison</th><th>Year 1 Cost</th><th>Year 2 Cost</th><th>What You Get</th></tr>
    <tr><td>Hire integration developer</td><td>$100,000+</td><td>$100,000+</td><td>One person, single point of failure</td></tr>
    <tr><td>Traditional SI project</td><td>$30,000–$80,000</td><td>$10,000–$20,000</td><td>Delivered and mostly abandoned</td></tr>
    <tr><td><strong>DataSkate IaaS (10 flows)</strong></td><td><strong>${iaas10Y1}</strong></td><td><strong>${iaas10Y2} if renewed</strong></td><td><strong>Fully managed, team-backed, SLA included</strong></td></tr>
  </table>

  <div class="metric-row">
    <div class="metric"><div class="value">$0</div><div class="label">Upfront implementation (IaaS)</div></div>
    <div class="metric"><div class="value">100%</div><div class="label">AE quota on $50k license</div></div>
    <div class="metric"><div class="value">24/7</div><div class="label">Monitoring &amp; incident response</div></div>
    <div class="metric"><div class="value">${P.termYears} yr</div><div class="label">Rate lock — no surprises</div></div>
  </div>

  <div class="footer">DataSkate — dataskate.ai | vivek@dataskate.ai</div>
</div>

<!-- PAGE 5: POLICIES -->
<div class="page">
  <h2>Rules &amp; Policies</h2>
  <div class="divider"></div>

  <table>
    <tr><th>Policy</th><th>Detail</th></tr>
    <tr><td>New AE introductory pricing</td><td>Applies once per AE — second deal onward is standard pricing</td></tr>
    <tr><td>No bundling discounts</td><td>Each flow is priced independently — no multi-flow discounts</td></tr>
    <tr><td>Payment cadence</td><td>6-month upfront only — no monthly, no annual prepay</td></tr>
    <tr><td>Emergency escalation</td><td>DS reserves the right to invoke one adjustment (max 5%) per contract term with 30-day written notice, only triggered by qualifying external cost events. Never invoked in normal operations.</td></tr>
    <tr><td>Code ownership</td><td>All integration code lives in the client's GitHub repository. Client owns it fully.</td></tr>
    <tr><td>Contract renewal</td><td>After ${P.termYears}-year term: renegotiated at then-current catalog rate, new ${P.termYears}-year term required</td></tr>
    <tr><td>IaaS eligibility</td><td>Requires AE to sell full $50k Anypoint license. DS confirms before committing free implementation.</td></tr>
  </table>

  <h3>IaaS Model — How It Works</h3>
  <table>
    <tr><th>Party</th><th>Action</th><th>Outcome</th></tr>
    <tr><td>MuleSoft AE</td><td>Sells full $50k Anypoint Platform license</td><td>Full quota attainment</td></tr>
    <tr><td>Client</td><td>Pays MuleSoft $50k + signs DS ${P.termYears}-year contract</td><td>Zero implementation cost, fully managed</td></tr>
    <tr><td>DataSkate</td><td>Builds at no upfront cost, collects ${P.fmtD(P.baseRate)}/flow/month</td><td>Recurring revenue + annual renewal + upsell runway</td></tr>
  </table>

  <div class="highlight-box">
    <p><strong>The long game:</strong> DS's goal is a ${P.termYears}-year engagement that proves MuleSoft value and earns renewal — creating reference accounts and opening the door to agentic automation and additional flows. The IaaS model is the entry point — not the ceiling.</p>
  </div>

  <div class="footer">DataSkate — dataskate.ai | vivek@dataskate.ai | 196 Princeton Hightstown Road, Building 2A Suite 11, West Windsor NJ 08550</div>
</div>

</body>
</html>`;

fs.writeFileSync(path.join(__dirname, 'pricing-model.html'), html);

(async () => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: path.join(__dirname, 'DataSkate-Pricing-Model.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' }
  });
  await browser.close();
  console.log('PDF generated: commons/sales/DataSkate-Pricing-Model.pdf');
})();
