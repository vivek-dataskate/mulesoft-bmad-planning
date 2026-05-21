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

  const periods     = termYears * 2;
  const periodRates = Array.from({ length: periods }, (_, i) =>
    Math.round(baseRate * Math.pow(1 + escalation, i) * 100) / 100
  );

  const fmt    = n => '$' + Math.round(n).toLocaleString('en-US');
  const fmtD   = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pay6mo = (rate, flows) => rate * 6 * flows;
  const termTotal = flows => periodRates.reduce((s, r) => s + pay6mo(r, flows), 0);
  const implFee = (flows, type) => {
    if (type === 'iaas') return 0;
    return flows * stdImpl;
  };

  return { baseRate, escalation, termYears, periods, periodRates, stdImpl, fmt, fmtD, pay6mo, termTotal, implFee };
}

const P = parsePricing(pricingMd);

// ── Pre-compute all display values ────────────────────────────────────────
const rateScheduleRows = P.periodRates.map((rate, i) => {
  const start = i * 6 + 1, end = (i + 1) * 6;
  return `    <tr><td>Period ${i + 1}</td><td>${start}–${end}</td><td><strong>${P.fmtD(rate)}</strong></td><td>${P.fmt(P.pay6mo(rate, 1))}</td></tr>`;
}).join('\n');

const pdfExamples = [
  { label: 'Standard — 5 flows',  flows: 5,  type: 'standard' },
  { label: 'Standard — 7 flows',  flows: 7,  type: 'standard' },
  { label: 'IaaS — 7 flows',      flows: 7,  type: 'iaas'     },
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

const SVG_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="140 258 590 96" style="height:32px;width:auto;display:block;" aria-label="DataSkate">
      <path fill="#ed1c24" d="m195.02,287.72v-12.49c21.94,0,38.48,10.29,38.48,23.93s-16.55,23.93-38.48,23.93v-12.49c15.86,0,25.99-6.77,25.99-11.44s-10.13-11.44-25.99-11.44Z"/>
      <path fill="#231f20" d="m195.02,327.75v12.49c-21.94,0-38.48-10.29-38.48-23.93s16.55-23.93,38.48-23.93v12.49c-15.86,0-25.99,6.77-25.99,11.44s10.13,11.44,25.99,11.44Z"/>
      <path fill="#231f20" d="m245.22,314.79c0-15.55,11.59-23.46,22.63-23.46,6.53,0,11.96,2.76,15.18,7.82v-26.49h10.95v42.23c0,14.72-9.94,24.29-24.2,24.29s-24.56-9.94-24.56-24.38Zm37.81.46c0-8-5.33-13.71-13.34-13.71s-13.43,5.7-13.43,13.71,5.43,13.71,13.43,13.71,13.34-5.7,13.34-13.71Z"/>
      <path fill="#231f20" d="m302.54,315.71c0-14.44,10.12-24.38,24.56-24.38s24.2,9.66,24.2,24.29v22.35h-10.03v-8.92c-2.76,6.72-8.92,10.12-16.1,10.12-11.04,0-22.63-7.91-22.63-23.46Zm37.81-.46c0-8-5.33-13.71-13.34-13.71s-13.43,5.7-13.43,13.71,5.43,13.71,13.43,13.71,13.34-5.7,13.34-13.71Z"/>
      <path fill="#231f20" d="m361.69,320.49v-44.07h10.95v16.1h23.46v9.94h-23.46v18.03c0,6.07,3.13,8.46,7.64,8.46s7.64-2.3,7.64-8.46v-1.2h10.95v1.2c0,12.6-7.54,18.68-18.58,18.68s-18.58-6.07-18.58-18.68Z"/>
      <path fill="#231f20" d="m405.39,315.71c0-14.44,10.12-24.38,24.56-24.38s24.2,9.66,24.2,24.29v22.35h-10.03v-8.92c-2.76,6.72-8.92,10.12-16.1,10.12-11.04,0-22.63-7.91-22.63-23.46Zm37.81-.46c0-8-5.33-13.71-13.34-13.71s-13.43,5.7-13.43,13.71,5.43,13.71,13.43,13.71,13.34-5.7,13.34-13.71Z"/>
      <path fill="#ed1c24" d="m471.93,324.82h8.83c.18,3.77,3.68,6.44,10.03,6.44s10.03-2.85,10.03-6.44c0-4.32-4.78-4.88-10.49-5.61-7.91-1.01-17.48-2.48-17.48-12.88,0-8.92,6.99-15,17.85-15s17.57,6.16,17.75,13.98h-8.65c-.28-3.5-3.5-6.07-9.02-6.07-5.8,0-9.11,2.76-9.11,6.35,0,4.32,4.78,4.78,10.4,5.52,7.91,1.01,17.57,2.48,17.57,12.88,0,9.2-7.45,15.18-18.86,15.18s-18.58-6.07-18.86-14.35Z"/>
      <path fill="#ed1c24" d="m520.51,272.65h8.74v40.02l20.88-20.15h11.5l-23.73,22.17,24.56,23.27h-11.68l-21.53-21.16v21.16h-8.74v-65.32Z"/>
      <path fill="#ed1c24" d="m565.49,315.62c0-14.26,10.12-24.29,24.56-24.29s24.2,9.75,24.2,24.29v22.35h-8v-9.94c-3.04,7.36-9.75,11.13-17.66,11.13-11.87,0-23.09-8.56-23.09-23.55Zm40.11-.37c0-9.2-6.25-15.82-15.64-15.82s-15.64,6.62-15.64,15.82,6.26,15.82,15.64,15.82,15.64-6.62,15.64-15.82Z"/>
      <path fill="#ed1c24" d="m624.65,320.77v-44.34h8.74v16.1h25.02v8h-25.02v20.24c0,7.18,3.77,10.3,9.48,10.3s9.57-3.04,9.57-10.3v-1.01h8.65v1.01c0,12.33-7.36,18.4-18.21,18.4s-18.21-6.07-18.21-18.4Z"/>
      <path fill="#ed1c24" d="m667.89,315.25c0-13.8,10.12-23.92,24.47-23.92s24.29,10.12,24.29,23.92v3.22h-39.56c1.29,8.1,7.36,12.6,15.27,12.6,5.89,0,10.03-1.84,12.7-5.8h9.66c-3.5,8.46-11.78,13.89-22.35,13.89-14.35,0-24.47-10.12-24.47-23.92Zm39.56-4.6c-1.75-7.27-7.73-11.22-15.09-11.22s-13.25,4.05-15,11.22h30.08Z"/>
    </svg>`;

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  /* ── CSS custom properties — verbatim from commons/branding/tokens.css + lint-html.js ── */
  :root {
    --brand:    #ed1c24;
    --brand-dk: #a01019;
    --dark:     #1A1A1A;
    --mid:      #555F6E;
    --light:    #FFF5F5;
    --border:   #E8E0E0;
    --green:    #2E9E6B;
    --amber:    #D69E2E;
    --amber-bg: #FFFBEB;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 15px;
    line-height: 1.6;
    color: var(--dark);
    background: #fff;
  }

  /* ── Header — from tokens.css + lint-html.js ── */
  .header {
    padding: 32px 64px 28px;
    border-bottom: 3px solid var(--brand);
  }
  .header-top {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 20px;
  }
  .header-eyebrow {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--mid);
  }
  .header-title-block {
    border-left: 4px solid var(--brand);
    padding-left: 20px;
    margin-bottom: 20px;
  }
  .header-title-block h1 {
    font-size: 26px;
    font-weight: 800;
    color: var(--dark);
    line-height: 1.2;
    margin-bottom: 6px;
  }
  .header-title-block .subtitle {
    font-size: 15px;
    color: var(--mid);
  }
  .header-meta {
    display: flex;
    font-size: 12px;
    flex-wrap: wrap;
    border-top: 1px solid var(--border);
    padding-top: 16px;
  }
  .header-meta span {
    color: var(--mid);
    padding-right: 24px;
    margin-right: 24px;
    border-right: 1px solid var(--border);
    line-height: 1.5;
  }
  .header-meta span:last-child { border-right: none; margin-right: 0; }
  .header-meta strong {
    display: block;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--dark);
    margin-bottom: 2px;
  }

  /* ── Pages ── */
  .page { padding: 40px 64px; page-break-after: always; }
  .page:last-child { page-break-after: auto; }

  /* ── Section headers — from tokens.css + lint-html.js ── */
  .section-head { display: flex; align-items: baseline; gap: 10px; border-bottom: 1px solid var(--border); margin-bottom: 28px; padding-bottom: 10px; }
  .section-num { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--brand); }
  .section-title { font-size: 18px; font-weight: 800; color: var(--dark); }

  /* ── Subsection label ── */
  .sub-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--mid); margin: 24px 0 10px; }

  /* ── Table — from tokens.css + lint-html.js (.dtbl pattern) ── */
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
  th { background: var(--dark); color: #fff; padding: 10px 14px; text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; }
  td { padding: 10px 14px; border-bottom: 1px solid var(--border); vertical-align: top; color: var(--dark); }
  tr:nth-child(even) td { background: #FAFAFA; }
  td strong { color: var(--brand); }

  /* ── Highlight box — brand left border + --light bg ── */
  .highlight-box { background: var(--light); border-left: 4px solid var(--brand); padding: 18px 22px; margin: 20px 0; border-radius: 0 8px 8px 0; }
  .highlight-box p { font-size: 13px; line-height: 1.7; margin-bottom: 8px; color: var(--dark); }
  .highlight-box p:last-child { margin-bottom: 0; }

  /* ── Stat row — --light bg pills, brand numbers, replaces dark metric cards ── */
  .stat-row { display: flex; gap: 12px; margin: 20px 0; }
  .stat { flex: 1; background: var(--light); border: 1px solid var(--border); border-top: 3px solid var(--brand); border-radius: 0 0 6px 6px; padding: 16px; text-align: center; }
  .stat .value { font-size: 24px; font-weight: 800; color: var(--brand); }
  .stat .label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: var(--mid); margin-top: 4px; }

  /* ── Comparison columns ── */
  .comparison { display: flex; gap: 16px; margin: 20px 0; }
  .col { flex: 1; border-radius: 8px; padding: 20px; }
  .col.bad  { background: var(--light); border: 1.5px solid var(--brand); }
  .col.good { background: #F0FFF4;      border: 1.5px solid #68D391; }
  .col h4 { font-size: 13px; font-weight: 700; margin-bottom: 12px; }
  .col.bad  h4 { color: var(--brand-dk); }
  .col.good h4 { color: var(--green); }
  .col ul { list-style: none; font-size: 12px; line-height: 1.8; color: var(--mid); }
  .col ul li::before { content: "→ "; }
  .col.bad  ul li::before { color: var(--brand); }
  .col.good ul li::before { color: var(--green); }

  /* ── Footer ── */
  .footer { text-align: center; font-size: 11px; color: var(--mid); margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--border); }

  p { font-size: 13px; line-height: 1.7; margin-bottom: 12px; color: var(--mid); }

  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<!-- HEADER — standard pattern from tokens.css + lint-html.js -->
<div class="header">
  <div class="header-top">
    ${SVG_LOGO}
    <span class="header-eyebrow">DataSkate — Internal &amp; AE Use</span>
  </div>
  <div class="header-title-block">
    <h1>MuleSoft Integration Services — Pricing &amp; Partnership Model</h1>
    <div class="subtitle">Managed Integration-as-a-Service · Fixed Rate · Full Service</div>
  </div>
  <div class="header-meta">
    <span><strong>Version</strong>1.2 — May 2026</span>
    <span><strong>Classification</strong>Confidential — Internal &amp; AE Use</span>
    <span><strong>Rates &amp; terms</strong>pricing-model.md is authoritative</span>
  </div>
</div>

<!-- PAGE 1: ENGAGEMENT TYPES -->
<div class="page">
  <div class="section-head">
    <span class="section-num">01</span>
    <span class="section-title">Engagement Models</span>
  </div>

  <table>
    <tr><th>Model</th><th>Condition</th><th>Implementation Price</th></tr>
    <tr><td>Standard</td><td>Any engagement</td><td><strong>${P.fmt(P.stdImpl)} / flow</strong></td></tr>
    <tr><td>IaaS (Free Build)</td><td>AE sells full $50k Anypoint license</td><td><strong>$0 upfront</strong> — recovered via managed service rate</td></tr>
  </table>

  <div class="sub-label">Implementation Timeline</div>
  <table>
    <tr><th>Phase</th><th>Duration</th><th>Notes</th></tr>
    <tr><td>Requirements &amp; Analysis</td><td><strong>2 weeks</strong></td><td>Fixed — all engagements</td></tr>
    <tr><td>Development &amp; Testing</td><td><strong>1.5 weeks / flow</strong></td><td>Fixed — no compression for lower-priced deals</td></tr>
  </table>

  <div class="stat-row">
    <div class="stat"><div class="value">9.5 wks</div><div class="label">5 flows</div></div>
    <div class="stat"><div class="value">14 wks</div><div class="label">8 flows</div></div>
    <div class="stat"><div class="value">17 wks</div><div class="label">10 flows</div></div>
  </div>

  <div class="footer">DataSkate — dataskate.ai | kailash@dataskate.ai</div>
</div>

<!-- PAGE 2: MANAGED SERVICE CONTRACT -->
<div class="page">
  <div class="section-head"><span class="section-num">02</span><span class="section-title">Managed Service Contract</span></div>

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

  <div class="sub-label">What Is Included</div>
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

  <div class="footer">DataSkate — dataskate.ai | kailash@dataskate.ai</div>
</div>

<!-- PAGE 3: CATALOG RATE & EXAMPLES -->
<div class="page">
  <div class="section-head"><span class="section-num">03</span><span class="section-title">Rate Schedule &amp; Examples</span></div>

  <p>The base rate escalates ${P.escalation * 100}% every 6 months. Active flows in a signed contract are rate-locked for the full ${P.termYears}-year term.</p>

  <table>
    <tr><th>Period</th><th>Months</th><th>Rate / Flow / Month</th><th>6-Month Payment (Per Flow)</th></tr>
${rateScheduleRows}
  </table>

  <div class="sub-label">Pricing Examples</div>
  <table>
    <tr><th>Scenario</th><th>Implementation</th><th>6-Month Payment</th><th>${P.termYears}-Year Total</th><th>Engagement Value</th></tr>
${pdfExamples}
  </table>

  <div class="highlight-box">
    <p><strong>Rate lock creates natural urgency:</strong> Adding a flow now at ${P.fmtD(P.baseRate)}/month costs ${urgencyDiff} less per 6-month period than waiting until Period 2 (${P.fmtD(P.periodRates[1])}/month). Act in Period 1 to lock the lower rate for the full ${P.termYears}-year term.</p>
  </div>

  <div class="footer">DataSkate — dataskate.ai | kailash@dataskate.ai</div>
</div>

<!-- PAGE 4: VALUE PROPOSITION -->
<div class="page">
  <div class="section-head"><span class="section-num">04</span><span class="section-title">Value Proposition</span></div>

  <div class="sub-label">For the MuleSoft AE</div>
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

  <div class="sub-label">For the Client</div>
  <table>
    <tr><th>Comparison</th><th>Year 1 Cost</th><th>Year 2 Cost</th><th>What You Get</th></tr>
    <tr><td>Hire integration developer</td><td>$100,000+</td><td>$100,000+</td><td>One person, single point of failure</td></tr>
    <tr><td>Traditional SI project</td><td>$30,000–$80,000</td><td>$10,000–$20,000</td><td>Delivered and mostly abandoned</td></tr>
    <tr><td><strong>DataSkate IaaS (10 flows)</strong></td><td><strong>${iaas10Y1}</strong></td><td><strong>${iaas10Y2} if renewed</strong></td><td><strong>Fully managed, team-backed, SLA included</strong></td></tr>
  </table>

  <div class="stat-row">
    <div class="stat"><div class="value">$0</div><div class="label">Upfront implementation (IaaS)</div></div>
    <div class="stat"><div class="value">100%</div><div class="label">AE quota on $50k license</div></div>
    <div class="stat"><div class="value">24/7</div><div class="label">Monitoring &amp; incident response</div></div>
    <div class="stat"><div class="value">${P.termYears} yr</div><div class="label">Rate lock — no surprises</div></div>
  </div>

  <div class="footer">DataSkate — dataskate.ai | kailash@dataskate.ai</div>
</div>

<!-- PAGE 5: POLICIES -->
<div class="page">
  <div class="section-head"><span class="section-num">05</span><span class="section-title">Rules &amp; Policies</span></div>

  <table>
    <tr><th>Policy</th><th>Detail</th></tr>
    <tr><td>No bundling discounts</td><td>Each flow is priced independently — no multi-flow discounts</td></tr>
    <tr><td>Payment cadence</td><td>6-month upfront only — no monthly, no annual prepay</td></tr>
    <tr><td>Emergency escalation</td><td>DS reserves the right to invoke one adjustment (max 5%) per contract term with 30-day written notice, only triggered by qualifying external cost events. Never invoked in normal operations.</td></tr>
    <tr><td>Code ownership</td><td>All integration code lives in the client's GitHub repository. Client owns it fully.</td></tr>
    <tr><td>Contract renewal</td><td>After ${P.termYears}-year term: renegotiated at then-current catalog rate, new ${P.termYears}-year term required</td></tr>
    <tr><td>IaaS eligibility</td><td>Requires AE to sell full $50k Anypoint license. DS confirms before committing free implementation.</td></tr>
  </table>

  <div class="sub-label">IaaS Model — How It Works</div>
  <table>
    <tr><th>Party</th><th>Action</th><th>Outcome</th></tr>
    <tr><td>MuleSoft AE</td><td>Sells full $50k Anypoint Platform license</td><td>Full quota attainment</td></tr>
    <tr><td>Client</td><td>Pays MuleSoft $50k + signs DS ${P.termYears}-year contract</td><td>Zero implementation cost, fully managed</td></tr>
    <tr><td>DataSkate</td><td>Builds at no upfront cost, collects ${P.fmtD(P.baseRate)}/flow/month</td><td>Recurring revenue + annual renewal + upsell runway</td></tr>
  </table>

  <div class="highlight-box">
    <p><strong>The long game:</strong> DS's goal is a ${P.termYears}-year engagement that proves MuleSoft value and earns renewal — creating reference accounts and opening the door to agentic automation and additional flows. The IaaS model is the entry point — not the ceiling.</p>
  </div>

  <div class="footer">DataSkate — dataskate.ai | kailash@dataskate.ai | 196 Princeton Hightstown Road, Building 2A Suite 11, West Windsor NJ 08550</div>
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
